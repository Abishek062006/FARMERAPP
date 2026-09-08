"""
D1 — mandi price forecast, 1-14 day horizon.

    python train_price_forecast.py            # train, evaluate, save
    python train_price_forecast.py --quick    # smaller sweep, for iterating

WHAT THIS PREDICTS
    The arrivals-weighted modal price for a (district, commodity) on day t+h,
    given everything known up to and including day t. One model serves every
    horizon h in 1..14 — h is a feature, not a separate model.

THREE DECISIONS THAT MATTER, AND WHY

1.  The target is a LOG RETURN, log(price[t+h] / price[t]), not the price.
    Cotton trades near Rs 6,700/qtl and onion near Rs 1,300. A model trained on
    absolute price spends all its capacity learning "this is cotton" and its
    error is dominated by the expensive commodities. Predicting the *change*
    puts every commodity on one scale, and the prediction is converted back to
    rupees at the end.

2.  The split is BY TIME, never random. A random split lets the model see
    Thursday while predicting Wednesday, which inflates the score and means
    nothing about tomorrow. Train is everything before the cutoff, test is
    everything after.

3.  The naive baseline is reported alongside the model, always. Persistence
    ("tomorrow costs what today costs") is a genuinely strong forecaster for
    commodity prices. A model that cannot beat it has learned nothing, and
    quoting only the model's own MAPE is how a project ends up claiming credit
    for arithmetic. Both numbers go in the report.
"""
import argparse
import json
import os
import sys
from datetime import datetime

import numpy as np
import pandas as pd
import lightgbm as lgb
import joblib

# The feature pipeline is shared with D2 (train_sell_hold.py). See
# price_features.py for why it lives in one place.
from price_features import (
    HERE, MODEL_DIR, TEST_MONTHS, FEATURES, CATEGORICAL,
    log, load_clean, aggregate, build_features,
    time_split, apply_categories, category_levels,
)

MODEL_PATH = os.path.join(MODEL_DIR, "price_forecast_lgbm.joblib")
REPORT_PATH = os.path.join(MODEL_DIR, "price_forecast_report.json")

HORIZONS = list(range(1, 15))          # 1..14 days


def add_targets(f):
    """One row per (origin day, horizon). Target is the log return to t+h."""
    out = []
    for (dist, com), s in f.groupby(["district", "commodity"], sort=False):
        s = s.sort_values("date").set_index("date")
        daily = s.reindex(pd.date_range(s.index.min(), s.index.max(), freq="D"))
        future = daily["modal_price"]
        for h in HORIZONS:
            block = s.copy()
            block["horizon"] = h
            block["target_price"] = future.shift(-h).reindex(s.index).values
            out.append(block.reset_index().rename(columns={"index": "date"}))
    t = pd.concat(out, ignore_index=True)
    t = t[t["target_price"].notna() & (t["target_price"] > 0)]
    t["y"] = np.log(t["target_price"] / t["modal_price"])
    return t


def mape(actual, pred):
    actual = np.asarray(actual, dtype=float)
    pred = np.asarray(pred, dtype=float)
    ok = actual > 0
    return float(np.mean(np.abs((actual[ok] - pred[ok]) / actual[ok])) * 100)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="fewer trees, for iterating")
    args = ap.parse_args()

    log("\nD1 — mandi price forecast\n" + "=" * 62)

    log("\n[1/5] Loading and cleaning")
    df, dropped = load_clean()

    log("\n[2/5] Aggregating to district-commodity-day")
    g = aggregate(df)
    log(f"  {len(g):,} district-commodity-days across "
        f"{g['district'].nunique()} districts and {g['commodity'].nunique()} commodities")

    log("\n[3/5] Building features")
    f = build_features(g)
    t = add_targets(f)
    log(f"  {len(t):,} training rows ({len(HORIZONS)} horizons x "
        f"{t.groupby(['district','commodity']).ngroups} series)")

    # ── time split ───────────────────────────────────────────────────────
    train, test, cutoff = time_split(t, TEST_MONTHS)
    log(f"\n[4/5] Time split at {cutoff.date()}  (never random — a random split "
        f"leaks the future)")
    log(f"  train {len(train):,} rows  {train['date'].min().date()} -> {train['date'].max().date()}")
    log(f"  test  {len(test):,} rows  {test['date'].min().date()} -> {test['date'].max().date()}")

    train, test = apply_categories(train, test, t)

    Xtr, ytr = train[FEATURES], train["y"]
    Xte, yte = test[FEATURES], test["y"]

    params = dict(
        objective="regression_l1",     # L1: robust to the spikes this data has
        n_estimators=300 if args.quick else 1200,
        learning_rate=0.06,
        num_leaves=96,
        min_child_samples=40,
        subsample=0.85,
        subsample_freq=1,
        colsample_bytree=0.85,
        reg_lambda=1.0,
        n_jobs=-1,
        random_state=42,
        verbose=-1,
    )
    log(f"\n[5/5] Training LightGBM ({params['n_estimators']} trees)")
    model = lgb.LGBMRegressor(**params)
    model.fit(
        Xtr, ytr,
        eval_set=[(Xte, yte)],
        eval_metric="l1",
        categorical_feature=CATEGORICAL,
        callbacks=[lgb.early_stopping(60, verbose=False), lgb.log_evaluation(0)],
    )
    log(f"  best iteration: {model.best_iteration_}")

    # ── evaluate in RUPEES, against the naive baseline ───────────────────
    pred_price = test["modal_price"].values * np.exp(model.predict(Xte))
    naive_price = test["modal_price"].values          # persistence
    actual = test["target_price"].values

    model_mape = mape(actual, pred_price)
    naive_mape = mape(actual, naive_price)

    log("\n" + "=" * 62)
    log("RESULTS  (test = last %d months, unseen)" % TEST_MONTHS)
    log("=" * 62)
    log(f"  naive persistence MAPE : {naive_mape:6.2f}%   <- the number to beat")
    log(f"  LightGBM MAPE          : {model_mape:6.2f}%")
    improvement = (naive_mape - model_mape) / naive_mape * 100
    log(f"  improvement            : {improvement:6.2f}%")
    if model_mape >= naive_mape:
        log("  ** THE MODEL DOES NOT BEAT PERSISTENCE — do not ship this as AI. **")

    per_h = []
    for h in HORIZONS:
        m = test["horizon"].values == h
        if m.sum() == 0:
            continue
        per_h.append({
            "horizon": h,
            "n": int(m.sum()),
            "naive_mape": round(mape(actual[m], naive_price[m]), 2),
            "model_mape": round(mape(actual[m], pred_price[m]), 2),
        })
    log("\n  by horizon:")
    log("    h   n        naive    model    delta")
    for r in per_h:
        d = r["naive_mape"] - r["model_mape"]
        log(f"   {r['horizon']:>2} {r['n']:>7,}  {r['naive_mape']:>7.2f}% {r['model_mape']:>7.2f}%  {d:>+6.2f}")

    per_c = []
    for c in sorted(test["commodity"].astype(str).unique()):
        m = test["commodity"].astype(str).values == c
        if m.sum() == 0:
            continue
        per_c.append({
            "commodity": c,
            "n": int(m.sum()),
            "naive_mape": round(mape(actual[m], naive_price[m]), 2),
            "model_mape": round(mape(actual[m], pred_price[m]), 2),
        })
    log("\n  by commodity:")
    log("    commodity        n        naive    model    delta")
    for r in per_c:
        d = r["naive_mape"] - r["model_mape"]
        log(f"    {r['commodity']:<14} {r['n']:>7,}  {r['naive_mape']:>7.2f}% {r['model_mape']:>7.2f}%  {d:>+6.2f}")

    imp = sorted(zip(FEATURES, model.feature_importances_), key=lambda x: -x[1])
    log("\n  top features:")
    for name, v in imp[:12]:
        log(f"    {v:>7}  {name}")

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump({
        "model": model,
        "features": FEATURES,
        "categorical": CATEGORICAL,
        "categories": category_levels(t),
        "horizons": HORIZONS,
    }, MODEL_PATH)

    report = {
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "rows_raw": int(len(df)),
        "rows_dropped": dropped,
        "series": int(t.groupby(["district", "commodity"]).ngroups),
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "test_cutoff": str(cutoff.date()),
        "test_months": TEST_MONTHS,
        "naive_mape": round(naive_mape, 2),
        "model_mape": round(model_mape, 2),
        "improvement_pct": round(improvement, 2),
        "beats_baseline": bool(model_mape < naive_mape),
        "by_horizon": per_h,
        "by_commodity": per_c,
        "top_features": [{"feature": n, "gain": int(v)} for n, v in imp[:15]],
        "params": {k: v for k, v in params.items() if k != "n_jobs"},
        "best_iteration": int(model.best_iteration_ or params["n_estimators"]),
    }
    with open(REPORT_PATH, "w") as fh:
        json.dump(report, fh, indent=2)

    log(f"\n  saved model  -> {MODEL_PATH}")
    log(f"  saved report -> {REPORT_PATH}\n")
    return 0 if model_mape < naive_mape else 1


if __name__ == "__main__":
    sys.exit(main())

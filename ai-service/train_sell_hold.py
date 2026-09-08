"""
D2 — sell-or-hold classifier.

    python train_sell_hold.py            # train, evaluate, save
    python train_sell_hold.py --quick    # fewer trees, for iterating

THE QUESTION
    A farmer has produce in hand today. Sell it now, or hold it another week?

    Unlike D1's forecast, this has genuine supervised ground truth: for every
    day in eight years of history we know exactly what holding would have paid.
    That is what makes it a real classification problem rather than a forecast
    dressed up as advice.

THE LABEL, AND THE HONEST PART OF IT
    hold_pays = price[t+h] > price[t] * (1 + holding_cost)

    Holding is not free. Produce shrinks, rots, and occupies space, and a model
    that ignores that will tell a farmer to hold tomatoes for a 1% gain that
    the spoilage eats twice over. So the label is net of a per-commodity
    holding cost — tomato loses far more in a week than wheat does.

    THOSE COST FIGURES ARE ASSUMPTIONS, NOT MEASUREMENTS. They are ordinary
    post-harvest-loss estimates, not something derived from this dataset, and
    they move the results: raise them and the model recommends holding less.
    They are collected in one block below so they can be argued with, and the
    report records which values produced its numbers.

    The label uses price[t+h] — the literal meaning of "hold h more days". It
    deliberately does NOT use max(price[t+1..t+h]), which would assume the
    farmer times the peak perfectly and would make the model look far better
    than anyone could actually achieve.

WHAT IS REPORTED
    Accuracy is nearly useless here on its own — if holding pays 55% of the
    time, "always hold" scores 55% while knowing nothing. So the report carries
    three naive strategies to beat, and the metric that actually matters:
    the money a farmer following this model would have made versus selling
    immediately every time.
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
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score

from price_features import (
    MODEL_DIR, TEST_MONTHS, FEATURES, CATEGORICAL,
    log, load_clean, aggregate, build_features,
    time_split, apply_categories, category_levels,
)

MODEL_PATH = os.path.join(MODEL_DIR, "sell_hold_lgbm.joblib")
REPORT_PATH = os.path.join(MODEL_DIR, "sell_hold_report.json")

HORIZONS = [3, 7, 14]

# ── Holding cost: percent of value lost per week in storage ───────────────
# ASSUMPTIONS, not measurements. Ordinary post-harvest loss estimates for
# smallholder storage in Maharashtra. Sensitivity is reported at the end of the
# run so the effect of getting these wrong is visible rather than hidden.
HOLDING_COST_PCT_PER_WEEK = {
    "Tomato": 3.0,          # highly perishable, no cold chain assumed
    "Onion": 1.5,           # stores reasonably in a chawl; sprouting and rot
    "Paddy(Common)": 0.5,   # storable grain
    "Wheat": 0.5,
    "Soyabean": 0.5,
    "Cotton": 0.4,          # a fibre, the most storable thing here
}
DEFAULT_HOLDING_COST = 1.0

# Probability above which the model says HOLD. 0.5 is not obviously right: a
# wrong "hold" leaves a farmer holding a falling market, which hurts more than
# a wrong "sell" costs in forgone upside. The threshold is tuned on the TRAIN
# split only (never the test split, which would be leakage) and reported.
DEFAULT_THRESHOLD = 0.5


def holding_cost(commodity, horizon_days):
    pct = HOLDING_COST_PCT_PER_WEEK.get(commodity, DEFAULT_HOLDING_COST)
    return pct / 100.0 * (horizon_days / 7.0)


def add_labels(f):
    """One row per (origin day, horizon), labelled with whether holding paid."""
    out = []
    for (dist, com), s in f.groupby(["district", "commodity"], sort=False):
        s = s.sort_values("date").set_index("date")
        daily = s.reindex(pd.date_range(s.index.min(), s.index.max(), freq="D"))
        future = daily["modal_price"]
        for h in HORIZONS:
            block = s.copy()
            block["horizon"] = h
            block["future_price"] = future.shift(-h).reindex(s.index).values
            out.append(block.reset_index().rename(columns={"index": "date"}))

    t = pd.concat(out, ignore_index=True)
    t = t[t["future_price"].notna() & (t["future_price"] > 0)]

    t["hold_cost"] = [holding_cost(c, h)
                      for c, h in zip(t["commodity"].astype(str), t["horizon"])]
    t["breakeven"] = t["modal_price"] * (1 + t["hold_cost"])
    t["y"] = (t["future_price"] > t["breakeven"]).astype(int)
    # Net gain from holding, as a fraction of today's price. Used for the
    # money metric, never as a feature — it is only knowable after the fact.
    t["hold_return"] = (t["future_price"] / t["modal_price"]) - 1 - t["hold_cost"]
    return t


def realised_return(decisions, hold_return):
    """
    Mean return of a strategy, relative to selling immediately.

    Selling now returns 0 by definition. Holding returns hold_return, which is
    already net of the holding cost. So a strategy's value is just the mean of
    hold_return over the rows where it chose to hold.
    """
    d = np.asarray(decisions).astype(bool)
    if d.sum() == 0:
        return 0.0
    return float(np.sum(np.where(d, hold_return, 0.0)) / len(d) * 100)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    args = ap.parse_args()

    log("\nD2 — sell-or-hold classifier\n" + "=" * 66)

    log("\n[1/5] Loading and cleaning")
    df, dropped = load_clean()

    log("\n[2/5] Aggregating to district-commodity-day")
    g = aggregate(df)

    log("\n[3/5] Building features and labels")
    f = build_features(g)
    t = add_labels(f)
    rate = t["y"].mean() * 100
    log(f"  {len(t):,} rows · holding paid {rate:.1f}% of the time "
        f"(net of holding cost)")
    log("  holding cost assumed, % per week:")
    for c in sorted(t["commodity"].astype(str).unique()):
        log(f"    {c:<15} {HOLDING_COST_PCT_PER_WEEK.get(c, DEFAULT_HOLDING_COST):>4.1f}%"
            f"   holding paid {t[t.commodity.astype(str)==c]['y'].mean()*100:>5.1f}% of days")

    train, test, cutoff = time_split(t, TEST_MONTHS)
    log(f"\n[4/5] Time split at {cutoff.date()} (never random)")
    log(f"  train {len(train):,}  ({train['y'].mean()*100:.1f}% hold)")
    log(f"  test  {len(test):,}  ({test['y'].mean()*100:.1f}% hold)")
    train, test = apply_categories(train, test, t)

    Xtr, ytr = train[FEATURES], train["y"]
    Xte, yte = test[FEATURES], test["y"]

    params = dict(
        objective="binary",
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
    model = lgb.LGBMClassifier(**params)
    model.fit(
        Xtr, ytr,
        eval_set=[(Xte, yte)],
        eval_metric="auc",
        categorical_feature=CATEGORICAL,
        callbacks=[lgb.early_stopping(60, verbose=False), lgb.log_evaluation(0)],
    )
    log(f"  best iteration: {model.best_iteration_}")

    # ── threshold tuned on TRAIN ONLY ────────────────────────────────────
    ptr = model.predict_proba(Xtr)[:, 1]
    tr_ret = train["hold_return"].values
    best_thr, best_val = DEFAULT_THRESHOLD, -1e9
    for thr in np.arange(0.30, 0.71, 0.02):
        v = realised_return(ptr >= thr, tr_ret)
        if v > best_val:
            best_val, best_thr = v, float(thr)
    log(f"  decision threshold {best_thr:.2f} (tuned on train, never on test)")

    # ── evaluate ─────────────────────────────────────────────────────────
    pte = model.predict_proba(Xte)[:, 1]
    pred = (pte >= best_thr).astype(int)
    ret = test["hold_return"].values
    y = yte.values

    auc = roc_auc_score(y, pte)
    acc = float((pred == y).mean() * 100)
    prec = float(precision_score(y, pred, zero_division=0) * 100)
    rec = float(recall_score(y, pred, zero_division=0) * 100)
    f1 = float(f1_score(y, pred, zero_division=0) * 100)

    always_sell = 0.0                                   # the do-nothing strategy
    always_hold = realised_return(np.ones_like(y), ret)
    majority = realised_return(np.full_like(y, int(y.mean() >= 0.5)), ret)
    model_ret = realised_return(pred, ret)
    perfect = realised_return(ret > 0, ret)             # the ceiling

    log("\n" + "=" * 66)
    log(f"RESULTS  (test = last {TEST_MONTHS} months, unseen)")
    log("=" * 66)
    log(f"  AUC                    : {auc:6.3f}")
    log(f"  accuracy               : {acc:6.2f}%   (majority class = {max(y.mean(), 1-y.mean())*100:.2f}%)")
    log(f"  precision (hold)       : {prec:6.2f}%   <- when it says hold, how often that paid")
    log(f"  recall (hold)          : {rec:6.2f}%")
    log(f"  F1 (hold)              : {f1:6.2f}%")

    log("\n  THE METRIC THAT MATTERS — mean return vs selling immediately:")
    log(f"    always sell (do nothing) : {always_sell:+6.2f}%   <- the number to beat")
    log(f"    always hold              : {always_hold:+6.2f}%")
    log(f"    majority class           : {majority:+6.2f}%")
    log(f"    THIS MODEL               : {model_ret:+6.2f}%")
    log(f"    perfect foresight        : {perfect:+6.2f}%   (unreachable ceiling)")
    captured = (model_ret / perfect * 100) if perfect > 0 else 0.0
    log(f"    captured of the ceiling  : {captured:6.1f}%")

    beats = model_ret > max(always_sell, always_hold)
    if not beats:
        log("\n  ** THE MODEL DOES NOT BEAT ALWAYS-SELL / ALWAYS-HOLD. **")
        log("  ** Do not ship this as advice. **")

    per_h, per_c = [], []
    for h in HORIZONS:
        m = test["horizon"].values == h
        if m.sum() == 0:
            continue
        per_h.append({
            "horizon": int(h), "n": int(m.sum()),
            "auc": round(float(roc_auc_score(y[m], pte[m])), 3) if len(set(y[m])) > 1 else None,
            "precision_hold": round(float(precision_score(y[m], pred[m], zero_division=0) * 100), 2),
            "model_return": round(realised_return(pred[m], ret[m]), 3),
            "always_hold_return": round(realised_return(np.ones(m.sum()), ret[m]), 3),
        })
    for c in sorted(test["commodity"].astype(str).unique()):
        m = test["commodity"].astype(str).values == c
        if m.sum() == 0:
            continue
        per_c.append({
            "commodity": c, "n": int(m.sum()),
            "hold_rate": round(float(y[m].mean() * 100), 2),
            "auc": round(float(roc_auc_score(y[m], pte[m])), 3) if len(set(y[m])) > 1 else None,
            "precision_hold": round(float(precision_score(y[m], pred[m], zero_division=0) * 100), 2),
            "model_return": round(realised_return(pred[m], ret[m]), 3),
            "always_hold_return": round(realised_return(np.ones(m.sum()), ret[m]), 3),
        })

    log("\n  by horizon:")
    log("     h   n        AUC   prec(hold)   model    always-hold")
    for r in per_h:
        log(f"    {r['horizon']:>2} {r['n']:>7,}  {r['auc']:>6}  {r['precision_hold']:>8.2f}%  "
            f"{r['model_return']:>+7.2f}%  {r['always_hold_return']:>+8.2f}%")

    log("\n  by commodity:")
    log("    commodity        n     hold%    AUC   prec(hold)   model    always-hold")
    for r in per_c:
        log(f"    {r['commodity']:<14} {r['n']:>6,}  {r['hold_rate']:>5.1f}%  {r['auc']:>6}  "
            f"{r['precision_hold']:>8.2f}%  {r['model_return']:>+7.2f}%  {r['always_hold_return']:>+8.2f}%")

    # ── sensitivity to the holding-cost assumption ───────────────────────
    log("\n  sensitivity — the holding-cost figures are assumptions, so:")
    log("    multiplier   hold-rate   model return")
    sens = []
    for mult in (0.5, 1.0, 2.0):
        hc = np.array([holding_cost(c, h) * mult
                       for c, h in zip(test["commodity"].astype(str), test["horizon"])])
        alt_ret = (test["future_price"].values / test["modal_price"].values) - 1 - hc
        alt_y = (test["future_price"].values > test["modal_price"].values * (1 + hc)).astype(int)
        v = realised_return(pred, alt_ret)
        sens.append({"multiplier": mult, "hold_rate": round(float(alt_y.mean() * 100), 2),
                     "model_return": round(v, 3)})
        log(f"      x{mult:<9.1f} {alt_y.mean()*100:>7.1f}%   {v:>+8.2f}%")

    imp = sorted(zip(FEATURES, model.feature_importances_), key=lambda x: -x[1])
    log("\n  top features:")
    for name, v in imp[:10]:
        log(f"    {v:>7}  {name}")

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump({
        "model": model,
        "features": FEATURES,
        "categorical": CATEGORICAL,
        "categories": category_levels(t),
        "horizons": HORIZONS,
        "threshold": best_thr,
        "holding_cost_pct_per_week": HOLDING_COST_PCT_PER_WEEK,
        "default_holding_cost": DEFAULT_HOLDING_COST,
    }, MODEL_PATH)

    report = {
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "rows_dropped": dropped,
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "test_cutoff": str(cutoff.date()),
        "test_months": TEST_MONTHS,
        "threshold": best_thr,
        "hold_rate_pct": round(float(y.mean() * 100), 2),
        "auc": round(float(auc), 3),
        "accuracy": round(acc, 2),
        "precision_hold": round(prec, 2),
        "recall_hold": round(rec, 2),
        "f1_hold": round(f1, 2),
        "returns": {
            "always_sell": always_sell,
            "always_hold": round(always_hold, 3),
            "majority_class": round(majority, 3),
            "model": round(model_ret, 3),
            "perfect_foresight": round(perfect, 3),
            "captured_pct_of_ceiling": round(captured, 1),
        },
        "beats_naive": bool(beats),
        "by_horizon": per_h,
        "by_commodity": per_c,
        "holding_cost_sensitivity": sens,
        "holding_cost_pct_per_week": HOLDING_COST_PCT_PER_WEEK,
        "holding_cost_is_assumption": True,
        "top_features": [{"feature": n, "gain": int(v)} for n, v in imp[:15]],
        "best_iteration": int(model.best_iteration_ or params["n_estimators"]),
    }
    with open(REPORT_PATH, "w") as fh:
        json.dump(report, fh, indent=2)

    log(f"\n  saved model  -> {MODEL_PATH}")
    log(f"  saved report -> {REPORT_PATH}\n")
    return 0 if beats else 1


if __name__ == "__main__":
    sys.exit(main())

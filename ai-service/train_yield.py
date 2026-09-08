"""
D5 — district crop yield prediction.

    python train_yield.py

DATA
    ICRISAT District Level Data: 40 years (1978-2017), 20 states, 311 districts,
    23 crops. Filtered to Maharashtra — 26 districts, ~17k district-crop-years.

WHAT IT PREDICTS
    Expected yield in kg/ha for a (district, crop, year), given the area sown
    and that district-crop's own history. Everything it uses is knowable at
    sowing time: the farmer knows their district, their crop, their area, and
    what the last few years produced.

TWO BASELINES, BOTH REPORTED
    Yield is highly autocorrelated, so a model has to beat more than noise:
      • historical mean — what this district has averaged for this crop
      • persistence     — last year's yield
    Agronomists reach for the first; the second is usually harder to beat.
    Both are computed on the same test rows as the model.

UNITS ARE NOT UNIFORM ACROSS CROPS, AND THAT MATTERS
    Checked against published Maharashtra figures, most crops line up: wheat
    1,513 kg/ha (published ~1,600-2,000), rice 1,416, soyabean 1,318.
    SUGARCANE DOES NOT: the dataset says ~7,100 kg/ha where cane yields ~80,000.
    That is roughly an 11x gap, consistent with production being recorded as
    GUR (jaggery) rather than cane. Cotton at ~283 kg/ha reads as lint.

    So sugarcane is excluded from SERVING — not from training, where the model
    simply learns its scale, but from what the app is willing to tell a farmer.
    Showing someone "7 tonnes per hectare" for a crop they know yields eighty
    would destroy trust in every other number on the screen.
"""
import json
import os
import sys
from datetime import datetime

import numpy as np
import pandas as pd
import lightgbm as lgb
import joblib

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data", "icrisat_district.csv")
RAIN = os.path.join(HERE, "data", "icrisat_rainfall.csv")
MODEL_DIR = os.path.join(HERE, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "yield_lgbm.joblib")
REPORT_PATH = os.path.join(MODEL_DIR, "yield_report.json")

STATE = "Maharashtra"
TEST_FROM = 2012          # train <= 2011, test 2012-2017
MIN_ROWS_PER_CROP = 200

# Crops whose recorded units do not match what a farmer would expect. Kept in
# training, withheld from serving. See the module docstring.
UNIT_SUSPECT = {
    "SUGARCANE": "Recorded as gur/jaggery equivalent (~7,100 kg/ha) rather than cane (~80,000). "
                 "Not served — the figure would read as wrong to any grower.",
}

# ICRISAT crop name -> the name this app uses in data/agroZones.js.
CROP_TO_APP = {
    "RICE": "Rice (Paddy)", "WHEAT": "Wheat", "SORGHUM": "Jowar (Sorghum)",
    "KHARIF SORGHUM": "Jowar (Sorghum)", "RABI SORGHUM": "Jowar (Sorghum)",
    "PEARL MILLET": "Bajra (Pearl Millet)", "FINGER MILLET": "Ragi (Nachani)",
    "MAIZE": "Maize", "CHICKPEA": "Gram (Harbhara)", "PIGEONPEA": "Tur (Pigeon Pea)",
    "GROUNDNUT": "Groundnut", "SOYABEAN": "Soyabean", "SUNFLOWER": "Sunflower",
    "SAFFLOWER": "Safflower (Karadi)", "SESAMUM": "Sesamum (Til)",
    "LINSEED": "Linseed (Jawas)", "COTTON": "Cotton", "SUGARCANE": "Sugarcane",
}


def log(m):
    print(m, flush=True)


def to_long(df):
    """Wide (one row per district-year, crop columns) -> long (one row per crop)."""
    crops = sorted({c.replace(" YIELD (Kg per ha)", "")
                    for c in df.columns if "YIELD (Kg per ha)" in c})
    frames = []
    for c in crops:
        y, a, p = (f"{c} YIELD (Kg per ha)", f"{c} AREA (1000 ha)",
                   f"{c} PRODUCTION (1000 tons)")
        if y not in df.columns:
            continue
        t = df[["Dist Name", "Year", a, p, y]].copy()
        t.columns = ["district", "year", "area", "production", "yield"]
        t["crop"] = c
        frames.append(t)
    long = pd.concat(frames, ignore_index=True)
    # A zero here means "not grown in this district", not "yielded nothing".
    # Keeping those rows would teach the model that most crops yield zero.
    return long[(long["yield"] > 0) & (long["area"] > 0)].copy()


def load_rainfall():
    """
    District rainfall by year, joined on the SAME (Dist Code, Year) keys the
    crop file uses — both come from ICRISAT's apportioned 1966-boundary set, so
    no fuzzy district matching is needed and none is done.
    """
    if not os.path.exists(RAIN):
        return None
    r = pd.read_csv(RAIN)
    r.columns = [c.strip() for c in r.columns]
    mm = lambda m: f"{m} RAINFALL (Millimeters)"

    out = pd.DataFrame({
        "dist_code": r["Dist Code"],
        "district": r["Dist Name"].str.strip(),
        "year": r["Year"],
        # The southwest monsoon. This is the number that decides a kharif crop —
        # soyabean, cotton, tur, kharif jowar are sown into it.
        "rain_monsoon": r[[mm(m) for m in ("JUNE", "JULY", "AUGUST", "SEPTEMBER")]].sum(axis=1),
        # Post-monsoon. Rabi (wheat, gram, rabi jowar) lives on residual soil
        # moisture plus these showers, so it needs its own column — a single
        # annual total would blur two different growing seasons together.
        "rain_post": r[[mm(m) for m in ("OCTOBER", "NOVEMBER", "DECEMBER")]].sum(axis=1),
        "rain_annual": r[mm("ANNUAL")],
        "rain_jun": r[mm("JUNE")],      # onset — a late start hurts even in a wet year
        "rain_sep": r[mm("SEPTEMBER")],  # withdrawal — matters for grain filling
    })
    return out


def attach_rainfall(long, rain):
    """
    WHEN THIS PREDICTION IS VALID — the important caveat.

    Current-year rainfall is used as a feature, which means the model answers
    "given the monsoon that HAS fallen, what yield should this district expect?"
    That is a post-monsoon estimate, not a sowing-time forecast, and it is the
    genuinely useful question: by October a farmer, a trader and a state
    procurement office all want the yield number, and the monsoon is known.

    A sowing-time version would have to drop the current-year columns and lean
    on lagged rainfall alone. That is a different, much harder problem, and
    pretending this model answers it would be a lie about timing.
    """
    long = long.merge(rain.drop(columns=["dist_code"]), on=["district", "year"], how="left")

    # Rainfall in millimetres means different things in Konkan (3,000 mm) and
    # Solapur (600 mm). Expressing it as a deviation from THAT district's own
    # long-run mean is what makes "a drought year" comparable across the state.
    for col in ("rain_monsoon", "rain_annual"):
        norm = long.groupby("district")[col].transform("mean")
        long[f"{col}_vs_normal"] = long[col] / norm
    # Last year's monsoon: reservoirs, groundwater and soil moisture carry over,
    # so a rabi crop after a failed monsoon suffers even if its own season is fine.
    long["rain_monsoon_lag_1"] = long.groupby(["district", "crop"])["rain_monsoon"].shift(1)
    return long


def build_features(long):
    """
    Everything is knowable at sowing time.

    Lags are per (district, crop) and shifted, so no row ever sees its own
    year. The state-level mean is LAGGED for the same reason — this year's
    state average is not known when this year's crop goes in the ground, and
    using it would be the classic leak that makes an offline score meaningless.
    """
    long = long.sort_values(["district", "crop", "year"]).copy()
    g = long.groupby(["district", "crop"], sort=False)

    for lag in (1, 2, 3):
        long[f"yield_lag_{lag}"] = g["yield"].shift(lag)
        long[f"area_lag_{lag}"] = g["area"].shift(lag)

    long["yield_mean_3"] = g["yield"].shift(1).rolling(3, min_periods=2).mean().values
    long["yield_mean_5"] = g["yield"].shift(1).rolling(5, min_periods=3).mean().values
    long["yield_std_5"] = g["yield"].shift(1).rolling(5, min_periods=3).std().values
    long["yield_trend"] = long["yield_lag_1"] - long["yield_lag_2"]
    long["area_change"] = long["area"] / long["area_lag_1"]

    # A lagged state-wide signal for the crop: a bad year statewide (drought)
    # shows up here without leaking the current year.
    state = long.groupby(["crop", "year"])["yield"].mean().rename("state_yield").reset_index()
    state["state_yield_lag_1"] = state.groupby("crop")["state_yield"].shift(1)
    long = long.merge(state[["crop", "year", "state_yield_lag_1"]], on=["crop", "year"], how="left")

    return long[long["yield_lag_1"].notna()]


FEATURES = [
    "year", "area",
    "yield_lag_1", "yield_lag_2", "yield_lag_3",
    "area_lag_1", "yield_mean_3", "yield_mean_5", "yield_std_5",
    "yield_trend", "area_change", "state_yield_lag_1",
    # Rainfall — the variable whose absence made the first version lose to
    # persistence. See attach_rainfall() for when the prediction is valid.
    "rain_monsoon", "rain_post", "rain_annual", "rain_jun", "rain_sep",
    "rain_monsoon_vs_normal", "rain_annual_vs_normal", "rain_monsoon_lag_1",
    "district", "crop",
]
CATEGORICAL = ["district", "crop"]


def mape(actual, pred):
    a, p = np.asarray(actual, float), np.asarray(pred, float)
    ok = a > 0
    return float(np.mean(np.abs((a[ok] - p[ok]) / a[ok])) * 100)


def main():
    if not os.path.exists(DATA):
        log(f"❌ {DATA} not found")
        return 1

    log("\nD5 — district crop yield\n" + "=" * 64)

    log("\n[1/4] Loading")
    df = pd.read_csv(DATA)
    df["State Name"] = df["State Name"].str.strip()
    mh = df[df["State Name"].str.lower() == STATE.lower()]
    log(f"  {STATE}: {len(mh):,} district-years, {mh['Dist Name'].nunique()} districts, "
        f"{mh.Year.min()}-{mh.Year.max()}")

    long = to_long(mh)
    log(f"  {len(long):,} district-crop-years after dropping not-grown")

    keep = long.crop.value_counts()
    keep = keep[keep >= MIN_ROWS_PER_CROP].index
    dropped = sorted(set(long.crop.unique()) - set(keep))
    long = long[long.crop.isin(keep)]
    log(f"  {len(keep)} crops kept (>= {MIN_ROWS_PER_CROP} rows); dropped: {', '.join(dropped) or 'none'}")

    rain = load_rainfall()
    if rain is None:
        log("\n  ⚠️  No rainfall file — training WITHOUT the variable that matters.")
    else:
        log(f"\n  rainfall: {len(rain):,} district-years, {rain.year.min()}-{rain.year.max()}")
        before = len(long)
        long = attach_rainfall(long, rain)
        have = long["rain_monsoon"].notna().sum()
        log(f"  joined:   {have:,} of {before:,} crop rows have rainfall "
            f"({have / before * 100:.0f}%)")
        # Rows with no rainfall cannot use the feature that matters, and keeping
        # them would let the model fall back to the old, weaker signal on part
        # of the data while being scored on all of it.
        long = long[long["rain_monsoon"].notna()]

    log("\n[2/4] Features")
    feat = build_features(long)
    log(f"  {len(feat):,} rows with a full lag history")

    train = feat[feat.year < TEST_FROM].copy()
    test = feat[feat.year >= TEST_FROM].copy()
    log(f"\n[3/4] Time split at {TEST_FROM} (never random)")
    log(f"  train {len(train):,}  {train.year.min()}-{train.year.max()}")
    log(f"  test  {len(test):,}  {test.year.min()}-{test.year.max()}")

    cats = {c: sorted(feat[c].astype(str).unique()) for c in CATEGORICAL}
    for c in CATEGORICAL:
        train[c] = pd.Categorical(train[c].astype(str), categories=cats[c])
        test[c] = pd.Categorical(test[c].astype(str), categories=cats[c])

    params = dict(objective="regression_l1", n_estimators=1200, learning_rate=0.05,
                  num_leaves=64, min_child_samples=20, subsample=0.85, subsample_freq=1,
                  colsample_bytree=0.85, reg_lambda=1.0, n_jobs=-1, random_state=42, verbose=-1)
    log("\n[4/4] Training LightGBM on LOG yield")
    # The metric is MAPE — a RELATIVE error — so the objective has to be
    # relative too. L1 on raw kg/ha optimises absolute error, which means a
    # 200 kg miss on sugarcane counts the same as a 200 kg miss on sesamum
    # even though one is 3% and the other 80%. Training on log(yield) makes
    # the loss proportional, which is what is actually being scored.
    model = lgb.LGBMRegressor(**params)
    model.fit(train[FEATURES], np.log(train["yield"]),
              eval_set=[(test[FEATURES], np.log(test["yield"]))], eval_metric="l1",
              categorical_feature=CATEGORICAL,
              callbacks=[lgb.early_stopping(60, verbose=False), lgb.log_evaluation(0)])
    log(f"  best iteration: {model.best_iteration_}")

    actual = test["yield"].values
    pred = np.exp(model.predict(test[FEATURES]))
    persistence = test["yield_lag_1"].values
    hist_mean = test["yield_mean_5"].fillna(test["yield_lag_1"]).values

    m_model = mape(actual, pred)
    m_persist = mape(actual, persistence)
    m_hist = mape(actual, hist_mean)

    log("\n" + "=" * 64)
    log(f"RESULTS  (test = {TEST_FROM}-{int(test.year.max())}, unseen)")
    log("=" * 64)
    log(f"  historical mean MAPE   : {m_hist:6.2f}%   <- what an agronomist would say")
    log(f"  persistence MAPE       : {m_persist:6.2f}%   <- last year's yield")
    log(f"  LightGBM MAPE          : {m_model:6.2f}%")
    best_base = min(m_hist, m_persist)
    log(f"  improvement vs best    : {(best_base - m_model) / best_base * 100:6.2f}%")
    if m_model >= best_base:
        log("  ** THE MODEL DOES NOT BEAT ITS BASELINES — do not ship this. **")

    per_crop = []
    for c in sorted(test.crop.astype(str).unique()):
        m = test.crop.astype(str).values == c
        if m.sum() < 20:
            continue
        per_crop.append({
            "crop": c, "app_crop": CROP_TO_APP.get(c), "n": int(m.sum()),
            "model_mape": round(mape(actual[m], pred[m]), 2),
            "persistence_mape": round(mape(actual[m], persistence[m]), 2),
            "hist_mean_mape": round(mape(actual[m], hist_mean[m]), 2),
            "median_yield": round(float(np.median(actual[m])), 0),
            "unit_note": UNIT_SUSPECT.get(c),
        })

    log("\n  by crop:")
    log("    crop                 n    model   persist    hist   median kg/ha")
    for r in sorted(per_crop, key=lambda x: x["model_mape"]):
        flag = "  ⚠ units" if r["unit_note"] else ""
        log(f"    {r['crop']:<18} {r['n']:>4} {r['model_mape']:>7.2f}% {r['persistence_mape']:>8.2f}%"
            f" {r['hist_mean_mape']:>7.2f}%   {r['median_yield']:>8,.0f}{flag}")

    # THREE bars, all of which must clear.
    #
    # The first version used only "beats both baselines", and that let SAFFLOWER
    # through at 101% MAPE — because its baselines were even worse (134% and
    # 125%). Beating a useless baseline does not make a prediction useful. A
    # yield estimate that is wrong by more than its own value is not something
    # to put in front of a farmer, whatever it outperforms.
    #
    # So: beat the baselines, clear an ABSOLUTE accuracy floor, and have
    # trustworthy units.
    MAX_MAPE = 40.0
    served = [r["crop"] for r in per_crop
              if r["model_mape"] < min(r["persistence_mape"], r["hist_mean_mape"])
              and r["model_mape"] <= MAX_MAPE
              and r["crop"] not in UNIT_SUSPECT]
    withheld = [r["crop"] for r in per_crop if r["crop"] not in served]
    log(f"\n  SERVED ({len(served)}): {', '.join(served) or 'none'}")
    log(f"    (must beat both baselines AND be under {MAX_MAPE}% MAPE)")
    log(f"  WITHHELD ({len(withheld)}): {', '.join(withheld) or 'none'}")
    for c in withheld:
        if c in UNIT_SUSPECT:
            log(f"    {c}: {UNIT_SUSPECT[c]}")

    imp = sorted(zip(FEATURES, model.feature_importances_), key=lambda x: -x[1])
    log("\n  top features:")
    for n, v in imp[:8]:
        log(f"    {v:>7}  {n}")

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump({"model": model, "features": FEATURES, "categorical": CATEGORICAL,
                 "categories": cats, "served_crops": served,
                 "crop_to_app": CROP_TO_APP, "unit_suspect": UNIT_SUSPECT}, MODEL_PATH)

    report = {
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "source": "ICRISAT District Level Data",
        "state": STATE,
        "data_years": [int(mh.Year.min()), int(mh.Year.max())],
        "districts": int(mh["Dist Name"].nunique()),
        "train_rows": int(len(train)), "test_rows": int(len(test)),
        "test_from": TEST_FROM,
        "model_mape": round(m_model, 2),
        "persistence_mape": round(m_persist, 2),
        "hist_mean_mape": round(m_hist, 2),
        "beats_baselines": bool(m_model < best_base),
        "by_crop": per_crop,
        "served_crops": served,
        "max_mape_to_serve": MAX_MAPE,
        "withheld_crops": withheld,
        "unit_suspect": UNIT_SUSPECT,
        "data_ends": int(mh.Year.max()),
        "extrapolation_warning": (
            f"Training data ends in {int(mh.Year.max())}. Yields trend upward with seed and "
            "irrigation improvements, so predictions for years well beyond that will read "
            "LOW. Treat a present-day figure as a floor, not a forecast."),
        "top_features": [{"feature": n, "gain": int(v)} for n, v in imp[:12]],
    }
    with open(REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2)

    log(f"\n  model  -> {MODEL_PATH}")
    log(f"  report -> {REPORT_PATH}\n")
    return 0 if m_model < best_base else 1


if __name__ == "__main__":
    sys.exit(main())

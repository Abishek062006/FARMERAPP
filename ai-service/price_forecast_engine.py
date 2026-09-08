"""
D1 serving — turns a recent price series into a 1-14 day forecast.

WHERE THE HISTORY COMES FROM
    The caller sends it. Node already fetches and caches Maharashtra mandi
    history in services/saleWindowService.js (getDailySeries), so this service
    does not build a second Agmarknet client in Python — one that would need
    its own cache, its own Chrome user-agent spoof, and its own opinion about
    which markets belong to which district. The backend owns fetching; this
    file owns the model.

TRAINING AND SERVING SHARE ONE FEATURE PATH
    Every feature below is computed the same way train_price_forecast.py
    computes it, on a daily calendar with the same lag windows. Train/serve
    skew is the classic way a model that scored well offline returns nonsense
    in production, and the usual cause is exactly this file drifting from the
    training script. If you change a feature in one, change it in both.
"""
import json
import os

import numpy as np
import pandas as pd
import joblib

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, "models", "price_forecast_lgbm.joblib")
REPORT_PATH = os.path.join(HERE, "models", "price_forecast_report.json")

# Enough history to compute lag_30 plus a rolling window on top of it. Below
# this the model is extrapolating from features that are mostly NaN.
MIN_DAYS = 35

_bundle = None
_report = None


def load():
    """Loads once, lazily. Returns False if the model has not been trained."""
    global _bundle, _report
    if _bundle is not None:
        return True
    if not os.path.exists(MODEL_PATH):
        return False
    _bundle = joblib.load(MODEL_PATH)
    if os.path.exists(REPORT_PATH):
        with open(REPORT_PATH) as f:
            _report = json.load(f)
    return True


def is_loaded():
    return _bundle is not None


def metrics():
    """The numbers that must be quoted with any forecast."""
    if not _report:
        return None
    return {
        "modelMape": _report["model_mape"],
        "naiveMape": _report["naive_mape"],
        "improvementPct": _report["improvement_pct"],
        "beatsBaseline": _report["beats_baseline"],
        "trainedAt": _report["trained_at"],
        "testWindow": f"{_report['test_months']} months from {_report['test_cutoff']}",
        "byHorizon": _report.get("by_horizon", []),
    }


def _frame(series):
    """[{date, modalPrice, arrivals}] -> a daily-calendar DataFrame."""
    df = pd.DataFrame(series)
    if df.empty:
        return df
    df = df.rename(columns={"modalPrice": "modal_price"})
    df["date"] = pd.to_datetime(df["date"])
    df = df[["date", "modal_price", "arrivals"]].dropna(subset=["modal_price"])
    df = df[df["modal_price"] > 0].sort_values("date")
    if df.empty:
        return df
    df = df.set_index("date")
    # Same daily reindex as training: "7 days ago" must mean 7 days, not 7 rows.
    return df.reindex(pd.date_range(df.index.min(), df.index.max(), freq="D"))


def build_features(series, district, commodity, horizons, bundle=None):
    """
    Build one feature row per horizon from a caller-supplied series.

    `bundle` is passed in rather than read from this module's global, because
    sell_hold_engine reuses this function with ITS OWN model bundle — the two
    models share a feature path but have their own category levels, and reading
    D1's globals from D2 silently mislabels every categorical.
    """
    bundle = bundle or _bundle
    if bundle is None:
        raise RuntimeError("build_features needs a loaded bundle")

    full = _frame(series)
    if full.empty:
        return None, None

    p = full["modal_price"]
    a = full["arrivals"] if "arrivals" in full else pd.Series(index=full.index, dtype=float)

    feat = pd.DataFrame(index=full.index)
    feat["modal_price"] = p
    for lag in (1, 7, 14, 30):
        feat[f"lag_{lag}"] = p.shift(lag)
    feat["roll_mean_7"] = p.shift(1).rolling(7, min_periods=3).mean()
    feat["roll_mean_30"] = p.shift(1).rolling(30, min_periods=8).mean()
    feat["roll_std_7"] = p.shift(1).rolling(7, min_periods=3).std()
    feat["roll_std_30"] = p.shift(1).rolling(30, min_periods=8).std()
    feat["arrivals"] = a
    feat["arr_lag_1"] = a.shift(1)
    feat["arr_roll_7"] = a.shift(1).rolling(7, min_periods=3).mean()
    feat["arr_roll_30"] = a.shift(1).rolling(30, min_periods=8).mean()

    feat["price_vs_mean_7"] = feat["modal_price"] / feat["roll_mean_7"]
    feat["price_vs_mean_30"] = feat["modal_price"] / feat["roll_mean_30"]
    feat["cv_30"] = feat["roll_std_30"] / feat["roll_mean_30"]
    feat["ret_1"] = np.log(feat["modal_price"] / feat["lag_1"])
    feat["ret_7"] = np.log(feat["modal_price"] / feat["lag_7"])
    feat["arr_vs_mean_30"] = feat["arrivals"] / feat["arr_roll_30"]

    # The origin is the most recent day that actually reported a price.
    reported = feat[feat["modal_price"].notna()]
    if reported.empty:
        return None, None
    origin = reported.iloc[[-1]].copy()
    origin_date = reported.index[-1]

    origin["n_markets"] = 1
    origin["dow"] = origin_date.dayofweek
    origin["month"] = origin_date.month
    origin["weekofyear"] = int(origin_date.isocalendar()[1])

    rows = []
    for h in horizons:
        r = origin.copy()
        r["horizon"] = h
        rows.append(r)
    X = pd.concat(rows, ignore_index=True)

    cats = bundle["categories"]
    X["district"] = pd.Categorical([str(district)] * len(X), categories=cats["district"])
    X["commodity"] = pd.Categorical([str(commodity)] * len(X), categories=cats["commodity"])

    return X[bundle["features"]], {
        "originDate": origin_date.strftime("%Y-%m-%d"),
        "originPrice": float(reported["modal_price"].iloc[-1]),
        "reportedDays": int(reported["modal_price"].notna().sum()),
    }


# A forecast whose average error is more than this much of the price cannot
# carry a decision, however well it scores against a bad baseline.
MAX_SERVE_MAPE = 25.0


def _commodity_skill(commodity):
    """This commodity's measured MAPE against naive, from the training report."""
    if not _report:
        return None
    for c in _report.get("by_commodity", []):
        if str(c.get("commodity")) == str(commodity):
            return c
    return None


def servable():
    """
    Which commodities this model may actually be asked about, and which it
    refuses — using THE SAME GATE `forecast()` applies below, not a second copy
    of the thresholds. A screen that offers a crop the model then refuses is
    worse than one that never offered it.

    Returns None when no model is loaded, so the caller can tell "the service
    is down" from "the model serves nothing".
    """
    if not load() or not _report:
        return None

    served, refused = [], []
    for c in _report.get("by_commodity", []):
        name = str(c.get("commodity"))
        m, n = c.get("model_mape"), c.get("naive_mape")
        if m is None or n is None:
            continue
        row = {"commodity": name,
               "modelMape": round(m, 2),
               # ⚠️ The naive baseline ALWAYS travels with the model's own
               # figure. Persistence is a strong forecaster for commodity
               # prices, so a bare MAPE says nothing about whether the model
               # is worth having.
               "naiveMape": round(n, 2)}
        if m >= n:
            refused.append({**row, "reason": "NO_SKILL"})
        elif m > MAX_SERVE_MAPE:
            refused.append({**row, "reason": "LOW_SKILL"})
        else:
            served.append(row)

    served.sort(key=lambda r: r["modelMape"])
    refused.sort(key=lambda r: r["modelMape"])
    return {"served": served, "refused": refused,
            "maxServeMape": MAX_SERVE_MAPE,
            "districts": sorted(_bundle["categories"]["district"])}


def forecast(series, district, commodity, horizons=None):
    """
    Returns a dict, or one carrying `error` — never a fabricated number.

    An unknown district or commodity is answered honestly rather than by
    silently mapping to some other category: LightGBM would happily accept an
    unseen level as NaN and return a confident-looking figure for a series it
    has never been trained on.
    """
    if not load():
        return {"error": "MODEL_NOT_TRAINED",
                "message": "Run train_price_forecast.py first."}

    horizons = horizons or _bundle["horizons"]
    horizons = [h for h in horizons if h in _bundle["horizons"]]
    if not horizons:
        return {"error": "BAD_HORIZON",
                "message": f"Horizon must be within {min(_bundle['horizons'])}-{max(_bundle['horizons'])} days."}

    cats = _bundle["categories"]
    if str(district) not in cats["district"]:
        return {"error": "UNKNOWN_DISTRICT",
                "message": f"No trained history for district '{district}'.",
                "known": cats["district"]}
    if str(commodity) not in cats["commodity"]:
        return {"error": "UNKNOWN_COMMODITY",
                "message": f"No trained history for commodity '{commodity}'.",
                "known": cats["commodity"]}

    # ── PER-COMMODITY SERVING GATE ────────────────────────────────────────
    # Being IN the training set is not the same as being forecastable. When D1
    # covered six commodities they all beat persistence comfortably and this
    # gate was unnecessary. At 36 commodities it is not: Methi(Leaves) scores
    # 168% MAPE against a 159% naive baseline — the model is worse than
    # guessing, and without this it would have been served as a confident
    # forecast, with a rupee figure hung off it by H2.
    #
    # Same rule D5 uses: beat the naive baseline AND clear an absolute floor.
    # Beating a useless baseline is not usefulness, and a price forecast with a
    # quarter of the price as error cannot carry a sell/hold decision.
    skill = _commodity_skill(commodity)
    if skill is not None:
        if skill["model_mape"] >= skill["naive_mape"]:
            return {"error": "NO_SKILL", "supported": False,
                    "commodity": commodity,
                    "message": f"The forecast for {commodity} does not beat simply "
                               f"assuming today's price holds.",
                    "modelMape": round(skill["model_mape"], 2),
                    "naiveMape": round(skill["naive_mape"], 2)}
        if skill["model_mape"] > MAX_SERVE_MAPE:
            return {"error": "LOW_SKILL", "supported": False,
                    "commodity": commodity,
                    "message": f"{commodity} prices move too erratically to forecast "
                               f"usefully — average error is {skill['model_mape']:.0f}%.",
                    "modelMape": round(skill["model_mape"], 2),
                    "maxServeMape": MAX_SERVE_MAPE}

    X, meta = build_features(series, district, commodity, horizons, _bundle)
    if X is None:
        return {"error": "NO_SERIES", "message": "No usable price history was supplied."}
    if meta["reportedDays"] < MIN_DAYS:
        return {"error": "INSUFFICIENT_HISTORY",
                "message": f"Need at least {MIN_DAYS} reported days to forecast; "
                           f"got {meta['reportedDays']}.",
                "reportedDays": meta["reportedDays"]}

    log_returns = _bundle["model"].predict(X)
    origin_price = meta["originPrice"]

    points = []
    for h, lr in zip(horizons, log_returns):
        price = float(origin_price * np.exp(lr))
        points.append({
            "horizon": int(h),
            "date": (pd.Timestamp(meta["originDate"]) + pd.Timedelta(days=int(h))).strftime("%Y-%m-%d"),
            "modalPrice": round(price, 2),
            "changePct": round((price / origin_price - 1) * 100, 2),
        })

    best = max(points, key=lambda p: p["modalPrice"])
    return {
        "district": district,
        "commodity": commodity,
        "originDate": meta["originDate"],
        "originPrice": round(origin_price, 2),
        "reportedDays": meta["reportedDays"],
        "forecast": points,
        # The single most useful read for a farmer deciding when to sell.
        "peak": {"horizon": best["horizon"], "date": best["date"],
                 "modalPrice": best["modalPrice"], "changePct": best["changePct"]},
        # Never serve a prediction without the numbers that say how good it is.
        "metrics": metrics(),
        "engine": "lightgbm",
    }

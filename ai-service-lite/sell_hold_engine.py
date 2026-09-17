"""
D2 serving — sell now, or hold another week?

Same contract as price_forecast_engine: the CALLER supplies the price history,
because Node already fetches and caches it. See that file for why.

THE PART WORTH READING
    The model is not equally good at every commodity, and the serving layer
    says so instead of averaging the weakness away. On the held-out split it
    scores AUC 0.75 on Wheat and 0.80 on Paddy, but only 0.56 on Soyabean —
    barely better than a coin flip, and there it actually returns slightly less
    than simply always holding.

    So per-commodity AUC from the training report is looked up at serving time
    and gates how the advice is presented: below LOW_SKILL_AUC the response is
    downgraded to 'uncertain' and carries a caveat naming the commodity. A
    farmer deciding what to do with a soyabean harvest deserves to know the
    model is close to guessing, and burying that behind an overall 0.69 would
    be exactly the kind of averaging that makes a metric misleading.
"""
import json
import os

import numpy as np
import pandas as pd
import joblib

from price_forecast_engine import build_features as _shared_build_features

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, "models", "sell_hold_lgbm.joblib")
REPORT_PATH = os.path.join(HERE, "models", "sell_hold_report.json")

MIN_DAYS = 35

# Below this the model is not meaningfully better than guessing on that
# commodity, and the advice is presented as uncertain rather than confident.
LOW_SKILL_AUC = 0.62

_bundle = None
_report = None


def load():
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
    if not _report:
        return None
    r = _report["returns"]
    return {
        "auc": _report["auc"],
        "accuracy": _report["accuracy"],
        "precisionHold": _report["precision_hold"],
        "recallHold": _report["recall_hold"],
        "threshold": _report["threshold"],
        "returns": {
            "alwaysSell": r["always_sell"],
            "alwaysHold": r["always_hold"],
            "model": r["model"],
            "perfectForesight": r["perfect_foresight"],
            "capturedPctOfCeiling": r["captured_pct_of_ceiling"],
        },
        "beatsNaive": _report["beats_naive"],
        "trainedAt": _report["trained_at"],
        "testWindow": f"{_report['test_months']} months from {_report['test_cutoff']}",
        # Surfaced deliberately: these drive the label and are assumptions.
        "holdingCostPctPerWeek": _report["holding_cost_pct_per_week"],
        "holdingCostIsAssumption": True,
        "byCommodity": _report.get("by_commodity", []),
    }


def _commodity_skill(commodity):
    """(auc, precision_hold) for this commodity on the held-out split."""
    if not _report:
        return None, None
    for row in _report.get("by_commodity", []):
        if row["commodity"] == commodity:
            return row.get("auc"), row.get("precision_hold")
    return None, None


def advise(series, district, commodity, horizon=7):
    """
    Returns {action, probability, confidence, ...} or a dict carrying `error`.
    Never a fabricated recommendation.
    """
    if not load():
        return {"error": "MODEL_NOT_TRAINED",
                "message": "Run train_sell_hold.py first."}

    if horizon not in _bundle["horizons"]:
        return {"error": "BAD_HORIZON",
                "message": f"Horizon must be one of {_bundle['horizons']}.",
                "supported": _bundle["horizons"]}

    cats = _bundle["categories"]
    if str(district) not in cats["district"]:
        return {"error": "UNKNOWN_DISTRICT",
                "message": f"No trained history for district '{district}'."}
    if str(commodity) not in cats["commodity"]:
        return {"error": "UNKNOWN_COMMODITY",
                "message": f"No trained history for commodity '{commodity}'."}

    # Reuses D1's feature builder — one serving-time feature path for both
    # models, so they cannot drift apart from each other either.
    X, meta = _shared_build_features(series, district, commodity, [horizon], _bundle)
    if X is None:
        return {"error": "NO_SERIES", "message": "No usable price history was supplied."}
    if meta["reportedDays"] < MIN_DAYS:
        return {"error": "INSUFFICIENT_HISTORY",
                "message": f"Need at least {MIN_DAYS} reported days; got {meta['reportedDays']}.",
                "reportedDays": meta["reportedDays"]}

    prob = float(_bundle["model"].predict_proba(X[_bundle["features"]])[0, 1])
    threshold = _bundle["threshold"]
    hold = prob >= threshold

    auc, prec = _commodity_skill(str(commodity))
    low_skill = auc is not None and auc < LOW_SKILL_AUC

    # Confidence blends how far the probability sits from the threshold with
    # how well the model actually does on THIS commodity.
    margin = abs(prob - threshold)
    if low_skill:
        confidence = "uncertain"
    elif margin >= 0.20:
        confidence = "high"
    elif margin >= 0.08:
        confidence = "medium"
    else:
        confidence = "low"

    cost_pct = _bundle["holding_cost_pct_per_week"].get(
        str(commodity), _bundle["default_holding_cost"]) * (horizon / 7.0)

    if low_skill:
        reason = (f"The model is close to guessing on {commodity} "
                  f"(AUC {auc:.2f} on held-out data) — treat this as weak evidence, "
                  f"not advice.")
    elif hold:
        reason = (f"Holding {horizon} more days looks better than selling today "
                  f"({prob*100:.0f}% likely to beat today's price after ~{cost_pct:.1f}% "
                  f"storage loss).")
    else:
        reason = (f"Selling now looks better than holding {horizon} days "
                  f"({(1-prob)*100:.0f}% likely, after ~{cost_pct:.1f}% storage loss).")

    return {
        "district": district,
        "commodity": commodity,
        "horizon": horizon,
        "action": "hold" if hold else "sell",
        "probabilityHoldPays": round(prob, 4),
        "threshold": threshold,
        "confidence": confidence,
        "reason": reason,
        "holdingCostPct": round(cost_pct, 2),
        "originDate": meta["originDate"],
        "originPrice": round(meta["originPrice"], 2),
        "reportedDays": meta["reportedDays"],
        "commoditySkill": {"auc": auc, "precisionHold": prec, "lowSkill": bool(low_skill)},
        "metrics": metrics(),
        "engine": "lightgbm-classifier",
    }

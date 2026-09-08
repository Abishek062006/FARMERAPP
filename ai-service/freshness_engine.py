"""
D3 serving — is this lot fresh, and is it the crop the listing claims?

WHAT IT WILL AND WILL NOT SAY
    It answers "fresh" or "defective" for the ten produce types it was
    measurably good at, and it says WHICH produce it thinks it is looking at.
    For everything else it returns a reason, not a guess:

      NOT_SUPPORTED     the produce is not in the training set at all, or was
                        in it too thinly to trust. Onion is the important case
                        — Maharashtra's headline crop is absent entirely.
      CROP_MISMATCH     the photo does not look like what the listing claims.
                        Reported, never silently overridden: it might be a
                        mislabelled listing, or it might be the model wrong
                        about an unusual variety, and the farmer should see it.
      LOW_CONFIDENCE    the top class is below the bar. A blurry photo of a
                        sack is not evidence of anything.

SCOPE, AND THE LINE IT MUST NOT CROSS
    This is FRESHNESS. It is not grading. C3's grades are farmer-declared
    against published criteria, and this model corroborates one narrow part of
    that — whether the produce looks sound — on a binary the public data
    actually supports. "Freshness verified" is true; "Grade A certified" would
    not be, and there is no public Indian dataset that would make it true.
"""
import io
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, "models", "freshness_model.keras")
LABELS_PATH = os.path.join(HERE, "models", "freshness_labels.json")
REPORT_PATH = os.path.join(HERE, "models", "freshness_report.json")

# Below this the top class is not worth reporting. Chosen against the measured
# per-produce confidences rather than picked out of the air.
MIN_CONFIDENCE = 0.60

_model = None
_labels = None
_report = None


def load():
    global _model, _labels, _report
    if _model is not None:
        return True
    if not (os.path.exists(MODEL_PATH) and os.path.exists(LABELS_PATH)):
        return False

    import tensorflow as tf
    _model = tf.keras.models.load_model(MODEL_PATH)
    with open(LABELS_PATH) as f:
        _labels = json.load(f)
    if os.path.exists(REPORT_PATH):
        with open(REPORT_PATH) as f:
            _report = json.load(f)
    return True


def is_loaded():
    return _model is not None


def metrics():
    if not _report:
        return None
    return {
        "freshnessAccuracy": _report["accuracy_freshness"],
        "baselineMajority": _report["baseline_majority_freshness"],
        "produceTypeAccuracy": _report["accuracy_produce_type"],
        "accuracy28Class": _report["accuracy_28class"],
        "beatsBaseline": _report["beats_baseline"],
        "trainedAt": _report["trained_at"],
        "testImages": _report["images"]["test"],
        "supportedProduce": _report["supported_produce"],
        "unsupportedProduce": _report["unsupported_produce"],
        "onionInDataset": _report["onion_in_dataset"],
        "perProduce": _report["per_produce"],
        "scopeNote": _report["scope_note"],
    }


def _produce_accuracy(produce):
    for r in (_report or {}).get("per_produce", []):
        if r["produce"] == produce:
            return r["freshness_acc"], r["train_n"]
    return None, None


# The crop names this app uses (agroZones.js) vs the dataset's folder names.
CROP_ALIASES = {
    "tomato": "Tomato",
    "potato": "Potato",
    "banana": "Banana",
    "mango": "Mango",
    "mangoalphonsohapus": "Mango",
    "orange": "Orange",
    "orangenagpursantra": "Orange",
    "grapes": "Grape",
    "grape": "Grape",
    "pomegranate": "Pomegranate",
    "pomegranatedalimb": "Pomegranate",
    "guava": "Guava",
    "guavaperu": "Guava",
    "strawberry": "Strawberry",
    "apple": "Apple",
    "carrot": "Carrot",
    "cucumber": "Cucumber",
    "cucumberkakdi": "Cucumber",
    "bellpepper": "Bellpepper",
    "capsicum": "Bellpepper",
    "jujube": "Jujube",
    "berbor": "Jujube",
    # Added when the Mendeley red/white onion bulb set (Kulkarni, Pawale &
    # Suryawanshi 2025, CC BY 4.0) brought onion into the training data.
    # ⚠️ THIS MAP IS THE SERVING GATE, NOT THE MODEL. Retraining with a new
    # produce type does nothing until its crop names appear here — the engine
    # refuses on the claimed crop name BEFORE it looks at the pixels, so a
    # missing alias reads to a farmer as "not in the training data at all"
    # even when the model knows the crop perfectly well.
    "onion": "Onion",
    "kanda": "Onion",
    "onionred": "Onion",
    "onionwhite": "Onion",
}


def _normalise(s):
    return "".join(ch for ch in str(s or "").lower() if ch.isalpha())


def expected_produce(crop_name):
    """The dataset class this app's crop name corresponds to, or None."""
    n = _normalise(crop_name)
    if n in CROP_ALIASES:
        return CROP_ALIASES[n]
    for alias, produce in CROP_ALIASES.items():
        if len(alias) >= 4 and (n.startswith(alias) or alias in n):
            return produce
    return None


def _prepare(image_bytes):
    import tensorflow as tf
    from PIL import Image
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    size = (_labels.get("img_size", 224),) * 2
    img = img.resize(size)
    arr = np.asarray(img, dtype="float32")
    arr = tf.keras.applications.mobilenet_v2.preprocess_input(arr)
    return np.expand_dims(arr, 0)


def grade(image_bytes, claimed_crop=None):
    """
    Returns a dict. Always carries `supported`; carries `error` when it cannot
    answer, and never a fabricated verdict.
    """
    if not load():
        return {"error": "MODEL_NOT_TRAINED", "message": "Run train_freshness.py first."}

    # If the listing names a crop we know is out of scope, say so BEFORE
    # running the model — a confident answer about an onion would be wrong
    # whatever the pixels look like.
    claimed = expected_produce(claimed_crop) if claimed_crop else None
    if claimed_crop and claimed is None:
        return {
            "error": "NOT_SUPPORTED", "supported": False,
            "claimedCrop": claimed_crop,
            "message": f"Freshness checking is not available for {claimed_crop}.",
            "reason": "This crop is not in the training data at all.",
        }
    if claimed and claimed not in _labels["supported_produce"]:
        acc, n = _produce_accuracy(claimed)
        return {
            "error": "NOT_SUPPORTED", "supported": False,
            "claimedCrop": claimed_crop, "produce": claimed,
            "message": f"Freshness checking is not reliable enough for {claimed_crop} yet.",
            "reason": (f"Only {n} training images for {claimed} — not enough to show a farmer a badge."
                       if n else "Too little training data for this produce."),
        }

    try:
        probs = _model.predict(_prepare(image_bytes), verbose=0)[0]
    except Exception as e:
        return {"error": "BAD_IMAGE", "message": f"Could not read that image: {e}"}

    top = int(np.argmax(probs))
    confidence = float(probs[top])
    produce = _labels["produce_of"][top]
    rotten = bool(_labels["is_rotten"][top])

    if confidence < MIN_CONFIDENCE:
        return {
            "error": "LOW_CONFIDENCE", "supported": True,
            "confidence": round(confidence, 3),
            "message": "The photo is not clear enough to judge. Try a closer, well-lit shot of the produce itself.",
        }

    if produce not in _labels["supported_produce"]:
        acc, n = _produce_accuracy(produce)
        return {
            "error": "NOT_SUPPORTED", "supported": False,
            "produce": produce, "confidence": round(confidence, 3),
            "message": f"Freshness checking is not reliable enough for {produce} yet.",
            "reason": f"Only {n} training images for {produce}.",
        }

    acc, train_n = _produce_accuracy(produce)

    # The crop-type check — most of D4, from the same forward pass. Surfaced,
    # never used to silently override the farmer's own label.
    crop_match = None
    if claimed:
        crop_match = {
            "claimed": claimed_crop,
            "detected": produce,
            "matches": produce == claimed,
            "note": (None if produce == claimed else
                     f"The photo looks like {produce}, but the listing says {claimed_crop}. "
                     "Worth a second look — it may be a mislabelled lot, or an unusual variety."),
        }

    return {
        "supported": True,
        "produce": produce,
        "fresh": not rotten,
        "verdict": "defective" if rotten else "fresh",
        "confidence": round(confidence, 3),
        "cropCheck": crop_match,
        # The badge wording is written HERE so every screen makes the same
        # claim, and so it can never drift into implying grading.
        "badge": "Freshness verified" if not rotten else "Defects visible",
        "scope": "Freshness only — this is not a grade. Grades on this app are declared by the farmer.",
        "modelAccuracyForThisProduce": acc,
        "trainingImagesForThisProduce": train_n,
        "metrics": metrics(),
        "engine": "mobilenetv2-freshness",
    }

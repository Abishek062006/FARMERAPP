from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import numpy as np
import tensorflow as tf
import io
import os
import traceback
import json

# ✅ IMPORT pesticide engine
from pesticide_engine import calculate_pesticide

# D1 price forecast. Imported lazily-loading: the joblib bundle is only read on
# the first /price-forecast call, so the service still starts (and /predict
# still works) when the model has not been trained yet.
import price_forecast_engine
import sell_hold_engine
import freshness_engine


app = Flask(__name__)
CORS(app)

# ==============================
# CONFIG
# ==============================

MODEL_PATH = "models/plant_disease_model.keras"
CLASS_NAMES_PATH = "models/class_names.json"

model = None
CLASS_NAMES = []


# ==============================
# LOAD MODEL
# ==============================

def load_model():
    global model, CLASS_NAMES

    try:
        # Load class names
        if not os.path.exists(CLASS_NAMES_PATH):
            print("❌ class_names.json not found")
            return False

        with open(CLASS_NAMES_PATH, "r") as f:
            CLASS_NAMES = json.load(f)

        print(f"📁 Loaded {len(CLASS_NAMES)} class names")

        # Load model (.keras format only)
        if not os.path.exists(MODEL_PATH):
            print("❌ Model file not found:", MODEL_PATH)
            return False

        print("🌿 Loading trained model...")
        model = tf.keras.models.load_model(MODEL_PATH)

        print("✅ Model loaded successfully")
        print("📊 Input shape:", model.input_shape)
        print("📊 Output shape:", model.output_shape)

        return True

    except Exception as e:
        print("❌ Model loading failed:", e)
        traceback.print_exc()
        return False


# ==============================
# IMAGE PREPROCESSING
# ==============================

def preprocess_image(image_bytes):
    try:
        image = Image.open(io.BytesIO(image_bytes))

        if image.mode != "RGB":
            image = image.convert("RGB")

        image = image.resize((224, 224))

        img_array = np.array(image, dtype=np.float32)
        img_array = img_array / 255.0
        img_array = np.expand_dims(img_array, axis=0)

        return img_array

    except Exception as e:
        print("❌ Image preprocessing error:", e)
        raise


# ==============================
# HEALTH CHECK
# ==============================

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "running",
        "model_loaded": model is not None,
        "classes": len(CLASS_NAMES),
        "input_shape": str(model.input_shape) if model else None,
        "output_shape": str(model.output_shape) if model else None
    })


# ==============================
# PREDICTION
# ==============================

@app.route("/predict", methods=["POST"])
def predict():

    if model is None:
        return jsonify({"success": False, "error": "Model not loaded"}), 500

    if "image" not in request.files:
        return jsonify({"success": False, "error": "No image provided"}), 400

    try:
        image_file = request.files["image"]
        image_bytes = image_file.read()

        img_array = preprocess_image(image_bytes)

        predictions = model.predict(img_array, verbose=0)[0]

        # Ensure prediction length matches class list
        if len(predictions) != len(CLASS_NAMES):
            return jsonify({
                "success": False,
                "error": "Class count mismatch between model and class_names.json"
            }), 500

        top_3_idx = np.argsort(predictions)[-3:][::-1]

        results = []
        for idx in top_3_idx:
            results.append({
                "class": CLASS_NAMES[idx],
                "confidence": round(float(predictions[idx]) * 100, 2)
            })

        return jsonify({
            "success": True,
            "prediction": {
                "primary": results[0],
                "top_3": results
            }
        })

    except Exception as e:
        print("❌ Prediction error:", e)
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ==============================
# PESTICIDE RECOMMENDATION
# ==============================

@app.route("/pesticide", methods=["POST"])
def pesticide_recommend():
    try:
        data = request.json

        disease = data.get("disease")
        area = float(data.get("area_sqft"))
        severity = data.get("severity", "moderate")

        result = calculate_pesticide(disease, area, severity)

        if not result:
            return jsonify({
                "success": False,
                "message": "No pesticide data found"
            }), 404

        return jsonify({
            "success": True,
            "recommendation": result
        })

    except Exception as e:
        print("❌ Pesticide calculation error:", e)
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ==============================
# START SERVER
# ==============================


# ==============================
# D1 — PRICE FORECAST
# ==============================

@app.route("/price-forecast", methods=["POST"])
def price_forecast():
    """
    POST /price-forecast
    {
      "district":  "Nashik",
      "commodity": "Onion",
      "horizons":  [7, 14],                     # optional, defaults to 1..14
      "series": [ {"date": "2026-07-01", "modalPrice": 2410, "arrivals": 12800}, ... ]
    }

    The CALLER supplies the history. Node's saleWindowService already fetches
    and caches it, so this service never talks to Agmarknet — no second client,
    no second cache, no second opinion about which markets sit in which
    district.
    """
    try:
        body = request.get_json(silent=True) or {}
        district = body.get("district")
        commodity = body.get("commodity")
        series = body.get("series")
        horizons = body.get("horizons")

        if not district or not commodity:
            return jsonify({"success": False,
                            "error": "district and commodity are required"}), 400
        if not isinstance(series, list) or not series:
            return jsonify({"success": False,
                            "error": "series must be a non-empty array of {date, modalPrice, arrivals}"}), 400
        if horizons is not None:
            if not isinstance(horizons, list) or not all(isinstance(h, int) for h in horizons):
                return jsonify({"success": False,
                                "error": "horizons must be an array of integers"}), 400

        result = price_forecast_engine.forecast(series, district, commodity, horizons)

        if "error" in result:
            # 503 when the model simply is not there, 422 when the request is
            # well-formed but cannot be answered honestly.
            code = 503 if result["error"] == "MODEL_NOT_TRAINED" else 422
            return jsonify({"success": False, **result}), code

        return jsonify({"success": True, "data": result})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/price-forecast/commodities", methods=["GET"])
def price_forecast_commodities():
    """
    Which crops D1 can actually forecast, and which it refuses and why.

    Exists so a crop PICKER can offer only what the model will answer for,
    instead of letting a farmer choose something that comes back refused.
    Uses price_forecast_engine.servable(), which applies the same gate
    forecast() does — not a second copy of the thresholds.
    """
    data = price_forecast_engine.servable()
    if data is None:
        return jsonify({"success": False, "error": "MODEL_NOT_TRAINED",
                        "message": "Run train_price_forecast.py first."}), 503
    return jsonify({"success": True, "data": data})


@app.route("/price-forecast/metrics", methods=["GET"])
def price_forecast_metrics():
    """The model card: MAPE against the naive baseline, per horizon."""
    price_forecast_engine.load()
    m = price_forecast_engine.metrics()
    if not m:
        return jsonify({"success": False, "error": "Model has not been trained"}), 503
    return jsonify({"success": True, "data": m})




# ==============================
# D2 — SELL OR HOLD
# ==============================

@app.route("/sell-hold", methods=["POST"])
def sell_hold():
    """
    POST /sell-hold
    {
      "district":  "Nashik",
      "commodity": "Onion",
      "horizon":   7,                           # 3, 7 or 14
      "series": [ {"date": "...", "modalPrice": 2410, "arrivals": 12800}, ... ]
    }

    Answers the question a farmer with produce in hand actually asks: sell it
    now, or hold another week? Unlike the forecast, this has real supervised
    ground truth — eight years of history know exactly what holding would have
    paid, net of storage loss.
    """
    try:
        body = request.get_json(silent=True) or {}
        district = body.get("district")
        commodity = body.get("commodity")
        series = body.get("series")
        horizon = body.get("horizon", 7)

        if not district or not commodity:
            return jsonify({"success": False,
                            "error": "district and commodity are required"}), 400
        if not isinstance(series, list) or not series:
            return jsonify({"success": False,
                            "error": "series must be a non-empty array of {date, modalPrice, arrivals}"}), 400
        if not isinstance(horizon, int):
            return jsonify({"success": False, "error": "horizon must be an integer"}), 400

        result = sell_hold_engine.advise(series, district, commodity, horizon)

        if "error" in result:
            code = 503 if result["error"] == "MODEL_NOT_TRAINED" else 422
            return jsonify({"success": False, **result}), code

        return jsonify({"success": True, "data": result})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/sell-hold/metrics", methods=["GET"])
def sell_hold_metrics():
    """
    The model card. Carries the three naive strategies the model must beat and
    the per-commodity breakdown — including where the model is weak.
    """
    sell_hold_engine.load()
    m = sell_hold_engine.metrics()
    if not m:
        return jsonify({"success": False, "error": "Model has not been trained"}), 503
    return jsonify({"success": True, "data": m})



# ==============================
# D3 — PRODUCE FRESHNESS
# ==============================

@app.route("/grade-photo", methods=["POST"])
def grade_photo():
    """
    POST /grade-photo   (multipart: `photo`; optional form field `crop`)

    Answers two things from one forward pass: does this look fresh, and does it
    look like the crop the listing claims. Passing `crop` matters — it lets the
    service refuse BEFORE inferring for produce it was never trained on, rather
    than returning a confident answer about an onion.
    """
    try:
        if "photo" not in request.files:
            return jsonify({"success": False, "error": "A photo file is required"}), 400

        f = request.files["photo"]
        data = f.read()
        if not data:
            return jsonify({"success": False, "error": "The photo was empty"}), 400
        if len(data) > 8 * 1024 * 1024:
            return jsonify({"success": False, "error": "Photo is larger than 8 MB"}), 400

        crop = request.form.get("crop") or request.args.get("crop")
        result = freshness_engine.grade(data, crop)

        if "error" in result:
            # 503 when the model is simply absent; 422 when the request is fine
            # but cannot be answered honestly (unsupported crop, unclear photo).
            code = 503 if result["error"] == "MODEL_NOT_TRAINED" else 422
            return jsonify({"success": False, **result}), code

        return jsonify({"success": True, "data": result})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/grade-photo/metrics", methods=["GET"])
def grade_photo_metrics():
    """The model card, including which produce it may speak about and why."""
    freshness_engine.load()
    m = freshness_engine.metrics()
    if not m:
        return jsonify({"success": False, "error": "Model has not been trained"}), 503
    return jsonify({"success": True, "data": m})


if __name__ == "__main__":
    print("\n🌿 Plant Disease AI Service Starting...\n")

    if load_model():
        print("🚀 Server running at http://localhost:5001")
        app.run(host="0.0.0.0", port=5001, debug=False)
    else:
        print("❌ Server not started — model failed to load.")

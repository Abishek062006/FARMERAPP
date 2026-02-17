from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import numpy as np
import tensorflow as tf
import io
import os
import traceback
import json

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
# START SERVER
# ==============================

if __name__ == "__main__":
    print("\n🌿 Plant Disease AI Service Starting...\n")

    if load_model():
        print("🚀 Server running at http://localhost:5001")
        app.run(host="0.0.0.0", port=5001, debug=False)
    else:
        print("❌ Server not started — model failed to load.")

from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import numpy as np
import tensorflow as tf
import io
import os
import traceback
from disease_classes import DISEASE_CLASSES, get_disease_info, is_healthy, format_disease_name

app = Flask(__name__)
CORS(app)

# Model path
MODEL_PATH = 'models/plant_disease_model.h5'
model = None

def load_model():
    """Load the TensorFlow model"""
    global model
    try:
        if os.path.exists(MODEL_PATH):
            print("🌿 Loading plant disease detection model...")
            model = tf.keras.models.load_model(MODEL_PATH)
            print("✅ Model loaded successfully!")
            print(f"📊 Model input shape: {model.input_shape}")
            print(f"📊 Model output shape: {model.output_shape}")
            return True
        else:
            print(f"❌ Model file not found at: {MODEL_PATH}")
            return False
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        traceback.print_exc()
        return False

def preprocess_image(image_bytes):
    """Preprocess image for model prediction"""
    try:
        # Open image
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert to RGB
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # FIXED: Resize to 224x224 to match model input shape
        # (was 256x256 before, which didn't match the model)
        image = image.resize((224, 224))
        
        # Convert to numpy array
        img_array = np.array(image, dtype=np.float32)
        
        # Normalize to [0, 1]
        img_array = img_array / 255.0
        
        # Add batch dimension
        img_array = np.expand_dims(img_array, axis=0)
        
        print(f"✅ Image preprocessed: shape {img_array.shape}")
        
        return img_array
        
    except Exception as e:
        print(f"❌ Error preprocessing image: {e}")
        raise

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'service': 'Plant Disease Detection AI',
        'model_path': MODEL_PATH,
        'classes': len(DISEASE_CLASSES),
        'input_shape': str(model.input_shape) if model else None,
        'output_shape': str(model.output_shape) if model else None
    })

@app.route('/predict', methods=['POST'])
def predict():
    """Predict disease from plant image"""
    try:
        print("\n🔍 === AI PREDICTION REQUEST ===")
        
        # Check if model is loaded
        if model is None:
            return jsonify({
                'success': False,
                'error': 'Model not loaded'
            }), 500
        
        # Check if image is provided
        if 'image' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No image provided'
            }), 400
        
        # Get image file
        image_file = request.files['image']
        image_bytes = image_file.read()
        
        print(f"📸 Image received: {len(image_bytes)} bytes")
        
        # Preprocess image
        img_array = preprocess_image(image_bytes)
        print("✅ Image preprocessed successfully")
        
        # Make prediction
        print("🤖 Running AI prediction...")
        predictions = model.predict(img_array, verbose=0)
        
        # Get top 3 predictions
        top_3_idx = np.argsort(predictions[0])[-3:][::-1]
        top_3_probs = predictions[0][top_3_idx]
        
        print(f"✅ Prediction complete")
        print(f"Top 3 predictions:")
        for idx, prob in zip(top_3_idx, top_3_probs):
            print(f"   {DISEASE_CLASSES[idx]}: {prob*100:.2f}%")
        
        # Get primary prediction
        primary_idx = top_3_idx[0]
        primary_class = DISEASE_CLASSES[primary_idx]
        primary_confidence = float(top_3_probs[0])
        
        print(f"\n🎯 Primary: {primary_class} ({primary_confidence*100:.1f}%)")
        
        # Check if plant is healthy
        healthy = is_healthy(primary_class)
        
        # Get disease information
        disease_data = get_disease_info(primary_class)
        
        # Prepare response
        response = {
            'success': True,
            'prediction': {
                'healthy': healthy,
                'confidence': round(primary_confidence * 100, 2),
                'healthScore': round(primary_confidence * 100, 2) if healthy else round((1 - primary_confidence) * 100, 2),
                'primary_disease': {
                    'class': primary_class,
                    'name': disease_data['name'],
                    'scientific': disease_data.get('scientific', 'Unknown'),
                    'description': disease_data.get('description', ''),
                    'symptoms': disease_data.get('symptoms', ''),
                    'treatment': disease_data.get('treatment', {}),
                    'confidence': round(primary_confidence * 100, 2)
                },
                'alternatives': [
                    {
                        'class': DISEASE_CLASSES[idx],
                        'name': format_disease_name(DISEASE_CLASSES[idx]),
                        'confidence': round(float(prob) * 100, 2)
                    }
                    for idx, prob in zip(top_3_idx[1:], top_3_probs[1:])
                ]
            }
        }
        
        print("✅ === PREDICTION COMPLETE ===\n")
        return jsonify(response)
        
    except Exception as e:
        print(f"\n❌ === PREDICTION ERROR ===")
        print(f"Error: {e}")
        traceback.print_exc()
        print("=========================\n")
        
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    print("\n" + "="*60)
    print("🌿 PLANT DISEASE DETECTION AI SERVICE")
    print("="*60 + "\n")
    
    # Load model
    if load_model():
        print("\n🚀 Starting Flask server...")
        print("📍 Server will run on: http://localhost:5001")
        print("📍 Health check: http://localhost:5001/health")
        print("📍 Predict endpoint: http://localhost:5001/predict")
        print("="*60 + "\n")
        app.run(host='0.0.0.0', port=5001, debug=False)
    else:
        print("\n❌ Failed to load model. Server not started.")
        print("Make sure plant_disease_model.h5 is in the models/ folder")
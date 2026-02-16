import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras import layers, models
import numpy as np
import os

print("🌿 Creating Compatible Plant Disease Model...")
print("   (This will work with your TensorFlow version)")

# Create models folder
os.makedirs('models', exist_ok=True)

# Load MobileNetV2 (current TensorFlow compatible)
base_model = MobileNetV2(
    input_shape=(224, 224, 3),
    include_top=False,
    weights='imagenet'
)

base_model.trainable = False

# Build model
model = models.Sequential([
    layers.Input(shape=(224, 224, 3)),
    base_model,
    layers.GlobalAveragePooling2D(),
    layers.BatchNormalization(),
    layers.Dense(512, activation='relu'),
    layers.Dropout(0.5),
    layers.Dense(256, activation='relu'),
    layers.Dropout(0.3),
    layers.Dense(38, activation='softmax')  # 38 disease classes
])

model.compile(
    optimizer='adam',
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

# Save model
model.save('models/plant_disease_model.h5', overwrite=True)

print("✅ NEW MODEL CREATED!")
print(f"📍 Saved: models/plant_disease_model.h5")
print(f"📊 Parameters: {model.count_params():,}")
print("\n🚀 Now run: python app.py")

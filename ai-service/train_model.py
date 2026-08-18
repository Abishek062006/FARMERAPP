import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras import layers, models
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau, ModelCheckpoint
import json
import os

print("🌿 Plant Disease Training Starting...\n")

# ==============================
# CONFIG
# ==============================

TRAIN_PATH = "dataset/train"
VAL_PATH = "dataset/val"

IMG_SIZE = 224
BATCH_SIZE = 32
EPOCHS_STAGE1 = 8
EPOCHS_STAGE2 = 8

# ==============================
# DATA GENERATORS
# ==============================

train_datagen = ImageDataGenerator(
    rescale=1./255,
    rotation_range=20,
    zoom_range=0.2,
    horizontal_flip=True
)

val_datagen = ImageDataGenerator(
    rescale=1./255
)

train_generator = train_datagen.flow_from_directory(
    TRAIN_PATH,
    target_size=(IMG_SIZE, IMG_SIZE),
    batch_size=BATCH_SIZE,
    class_mode='categorical'
)

val_generator = val_datagen.flow_from_directory(
    VAL_PATH,
    target_size=(IMG_SIZE, IMG_SIZE),
    batch_size=BATCH_SIZE,
    class_mode='categorical'
)

# ==============================
# SAVE CLASS NAMES
# ==============================

class_names = list(train_generator.class_indices.keys())

os.makedirs("models", exist_ok=True)

with open("models/class_names.json", "w") as f:
    json.dump(class_names, f)

print(f"📁 Saved {len(class_names)} class names\n")

# ==============================
# BUILD MODEL
# ==============================

base_model = MobileNetV2(
    input_shape=(IMG_SIZE, IMG_SIZE, 3),
    include_top=False,
    weights='imagenet'
)

base_model.trainable = False

model = models.Sequential([
    base_model,
    layers.GlobalAveragePooling2D(),
    layers.BatchNormalization(),
    layers.Dense(512, activation='relu'),
    layers.Dropout(0.5),
    layers.Dense(len(class_names), activation='softmax')
])

# ==============================
# CALLBACKS
# ==============================

callbacks = [
    EarlyStopping(monitor='val_loss', patience=3, restore_best_weights=True),
    ReduceLROnPlateau(monitor='val_loss', factor=0.3, patience=2),
    ModelCheckpoint("models/best_model.keras", save_best_only=True)
]

# ==============================
# STAGE 1 - TRAIN HEAD
# ==============================

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

print("🚀 Stage 1: Training classifier head...\n")

model.fit(
    train_generator,
    validation_data=val_generator,
    epochs=EPOCHS_STAGE1,
    callbacks=callbacks
)

# ==============================
# STAGE 2 - FINE TUNE
# ==============================

print("\n🔥 Stage 2: Fine-tuning last layers...\n")

base_model.trainable = True

for layer in base_model.layers[:-30]:
    layer.trainable = False

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=1e-4),
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

model.fit(
    train_generator,
    validation_data=val_generator,
    epochs=EPOCHS_STAGE2,
    callbacks=callbacks
)

# ==============================
# SAVE FINAL MODEL
# ==============================

model.save("models/plant_disease_model.keras")

print("\n✅ TRAINING COMPLETE")
print("📁 Model saved as models/plant_disease_model.keras")

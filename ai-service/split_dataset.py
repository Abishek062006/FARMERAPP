import os
import shutil
import random

DATASET_PATH = "dataset"
TRAIN_PATH = "dataset/train"
VAL_PATH = "dataset/val"
SPLIT_RATIO = 0.8

os.makedirs(TRAIN_PATH, exist_ok=True)
os.makedirs(VAL_PATH, exist_ok=True)

for class_name in os.listdir(DATASET_PATH):
    class_path = os.path.join(DATASET_PATH, class_name)

    if not os.path.isdir(class_path):
        continue
    if class_name in ["train", "val"]:
        continue

    images = os.listdir(class_path)
    random.shuffle(images)

    split_index = int(len(images) * SPLIT_RATIO)

    train_images = images[:split_index]
    val_images = images[split_index:]

    os.makedirs(os.path.join(TRAIN_PATH, class_name), exist_ok=True)
    os.makedirs(os.path.join(VAL_PATH, class_name), exist_ok=True)

    for img in train_images:
        shutil.move(
            os.path.join(class_path, img),
            os.path.join(TRAIN_PATH, class_name, img)
        )

    for img in val_images:
        shutil.move(
            os.path.join(class_path, img),
            os.path.join(VAL_PATH, class_name, img)
        )

    print(f"✅ Split done for {class_name}")

print("🎯 Dataset successfully split into train & val!")

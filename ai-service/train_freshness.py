"""
D3 — produce freshness / defect detection.

    python train_freshness.py              # full run
    python train_freshness.py --limit 200  # 200 images per class, for iterating

WHAT IT PREDICTS
    One of 28 classes: 14 produce types x {Healthy, Rotten}. Predicting both at
    once rather than freshness alone is deliberate — the produce type is what
    tells the serving layer whether it is even entitled to an opinion. A model
    asked "is this fresh?" about an onion it has never seen will answer
    confidently and wrongly; one that first says "this looks like a potato"
    can be checked against what the listing claims.

WHY EMBEDDINGS ARE PRECOMPUTED
    This machine has no GPU. MobileNetV2 runs at ~150 img/s here, so a normal
    fine-tuning loop would spend 3+ minutes per epoch just re-deriving the same
    features. Running the frozen backbone ONCE and training a small head on the
    cached vectors turns a 40-minute job into a 4-minute one with no loss —
    the backbone is frozen either way.

WHAT IS REPORTED, AND WHY IT IS NOT JUST ACCURACY
    28-class accuracy is the headline but not the useful number. A farmer's
    question is binary — is this lot fresh — so the report derives:
      • binary freshness accuracy, against the majority-class baseline
      • PER-PRODUCE freshness accuracy, because coverage is wildly uneven
        (apple 5.4k images, grape 200) and a single average hides that
    The serving layer uses the per-produce numbers to refuse an opinion where
    it has not earned one, exactly as D2 does for Soyabean.

    THE DATASET HAS NO ONION. Maharashtra's headline crop is absent entirely,
    so onion lots must show "not available for this crop" rather than a badge.
    That is a data limitation, not something to model around.
"""
import argparse
import json
import os
import random
import sys
from collections import Counter, defaultdict
from datetime import datetime

import numpy as np
import tensorflow as tf

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data", "produce", "Fruit And Vegetable Diseases Dataset")
MODEL_DIR = os.path.join(HERE, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "freshness_model.keras")
LABELS_PATH = os.path.join(MODEL_DIR, "freshness_labels.json")
REPORT_PATH = os.path.join(MODEL_DIR, "freshness_report.json")

IMG = 224
BATCH = 32
SEED = 42

# Fractions of each class, split stratified so a 200-image class is
# represented in test at the same rate as a 5,000-image one.
VAL_FRAC, TEST_FRAC = 0.15, 0.15


def log(m):
    print(m, flush=True)


def list_files(limit=None):
    """(paths, labels, class_names) with a stratified, reproducible split."""
    classes = sorted(d for d in os.listdir(DATA_DIR)
                     if os.path.isdir(os.path.join(DATA_DIR, d)))
    rng = random.Random(SEED)
    splits = {"train": ([], []), "val": ([], []), "test": ([], [])}

    for idx, cls in enumerate(classes):
        files = [f for f in os.listdir(os.path.join(DATA_DIR, cls))
                 if f.lower().endswith((".jpg", ".jpeg", ".png"))]
        rng.shuffle(files)
        if limit:
            files = files[:limit]
        n = len(files)
        n_val, n_test = int(n * VAL_FRAC), int(n * TEST_FRAC)
        parts = {
            "val": files[:n_val],
            "test": files[n_val:n_val + n_test],
            "train": files[n_val + n_test:],
        }
        for split, fs in parts.items():
            for f in fs:
                splits[split][0].append(os.path.join(DATA_DIR, cls, f))
                splits[split][1].append(idx)

    return splits, classes


def embed(paths, labels, backbone, desc):
    """Run the frozen backbone once over a split and cache the vectors."""
    ds = tf.data.Dataset.from_tensor_slices((paths, labels))

    def load(path, label):
        img = tf.io.read_file(path)
        # Some files in this dataset are PNGs with an alpha channel and a few
        # are CMYK JPEGs; decode_image with channels=3 normalises all of it.
        img = tf.io.decode_image(img, channels=3, expand_animations=False)
        img = tf.image.resize(img, (IMG, IMG))
        img = tf.keras.applications.mobilenet_v2.preprocess_input(img)
        return img, label

    ds = ds.map(load, num_parallel_calls=tf.data.AUTOTUNE).batch(BATCH).prefetch(tf.data.AUTOTUNE)

    vecs, ys = [], []
    done = 0
    for xb, yb in ds:
        vecs.append(backbone(xb, training=False).numpy())
        ys.append(yb.numpy())
        done += len(yb)
        if done % (BATCH * 40) == 0:
            log(f"    {desc}: {done}/{len(paths)}")
    return np.concatenate(vecs), np.concatenate(ys)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="images per class, for a quick run")
    ap.add_argument("--epochs", type=int, default=30)
    args = ap.parse_args()

    if not os.path.isdir(DATA_DIR):
        log(f"❌ Dataset not found at {DATA_DIR}")
        return 1

    log("\nD3 — produce freshness\n" + "=" * 64)

    log("\n[1/5] Indexing the dataset")
    splits, classes = list_files(args.limit)
    for k, (p, _) in splits.items():
        log(f"  {k:<6} {len(p):>6,} images")
    log(f"  {len(classes)} classes")

    # produce -> [healthy_idx, rotten_idx]; class dirs are "Apple__Healthy".
    produce_of = [c.split("__")[0] for c in classes]
    is_rotten = [c.split("__")[-1].lower().startswith("rotten") for c in classes]
    log(f"  {len(set(produce_of))} produce types x healthy/rotten")

    log("\n[2/5] Precomputing MobileNetV2 embeddings (frozen backbone, one pass)")
    backbone = tf.keras.applications.MobileNetV2(
        input_shape=(IMG, IMG, 3), include_top=False, weights="imagenet", pooling="avg")
    backbone.trainable = False

    cache = {}
    for split in ("train", "val", "test"):
        paths, labels = splits[split]
        log(f"  {split} ({len(paths):,})…")
        cache[split] = embed(paths, labels, backbone, split)

    Xtr, ytr = cache["train"]
    Xva, yva = cache["val"]
    Xte, yte = cache["test"]
    log(f"  embeddings: {Xtr.shape[1]}-d")

    log("\n[3/5] Training the classification head")
    head = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(Xtr.shape[1],)),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(256, activation="relu"),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(len(classes), activation="softmax"),
    ])
    head.compile(optimizer=tf.keras.optimizers.Adam(1e-3),
                 loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    head.fit(
        Xtr, ytr, validation_data=(Xva, yva),
        epochs=args.epochs, batch_size=64, verbose=2,
        callbacks=[tf.keras.callbacks.EarlyStopping(
            patience=5, restore_best_weights=True, monitor="val_accuracy")],
    )

    log("\n[4/5] Evaluating on the held-out test split")
    probs = head.predict(Xte, verbose=0)
    pred = probs.argmax(1)
    conf = probs.max(1)

    acc28 = float((pred == yte).mean() * 100)
    majority28 = float(Counter(yte.tolist()).most_common(1)[0][1] / len(yte) * 100)

    # The question a farmer actually asks.
    rotten = np.array(is_rotten)
    fresh_true = ~rotten[yte]
    fresh_pred = ~rotten[pred]
    acc_bin = float((fresh_true == fresh_pred).mean() * 100)
    majority_bin = float(max(fresh_true.mean(), 1 - fresh_true.mean()) * 100)

    # Crop-type accuracy falls out of the same model — a cheap D4 for the
    # produce this dataset happens to cover.
    prod = np.array(produce_of)
    acc_produce = float((prod[yte] == prod[pred]).mean() * 100)

    log("=" * 64)
    log(f"  28-class accuracy      : {acc28:6.2f}%   (majority class {majority28:.2f}%)")
    log(f"  FRESHNESS (binary)     : {acc_bin:6.2f}%   (majority class {majority_bin:.2f}%)  <- the number that matters")
    log(f"  produce type correct   : {acc_produce:6.2f}%")

    per_produce = []
    for p in sorted(set(produce_of)):
        m = prod[yte] == p
        if not m.any():
            continue
        n = int(m.sum())
        f_acc = float((fresh_true[m] == fresh_pred[m]).mean() * 100)
        train_n = int(sum(1 for y in ytr if produce_of[y] == p))
        per_produce.append({
            "produce": p, "test_n": n, "train_n": train_n,
            "freshness_acc": round(f_acc, 2),
            "mean_confidence": round(float(conf[m].mean()), 3),
        })

    log("\n  freshness accuracy by produce (train images in brackets):")
    log("    produce         train   test   freshness")
    for r in sorted(per_produce, key=lambda x: -x["freshness_acc"]):
        log(f"    {r['produce']:<14} {r['train_n']:>6} {r['test_n']:>6}   {r['freshness_acc']:>6.2f}%")

    # Which produce the serving layer may speak about. Both bars must clear:
    # enough training images to have learned the class, and enough measured
    # accuracy to be worth showing a farmer.
    MIN_TRAIN, MIN_ACC = 400, 90.0
    supported = sorted(r["produce"] for r in per_produce
                       if r["train_n"] >= MIN_TRAIN and r["freshness_acc"] >= MIN_ACC)
    log(f"\n  SUPPORTED for serving (>= {MIN_TRAIN} train images and >= {MIN_ACC}% accuracy):")
    log(f"    {', '.join(supported) or 'none'}")
    log(f"  not supported: {', '.join(sorted(set(produce_of) - set(supported))) or 'none'}")
    log("  ONION IS ABSENT FROM THIS DATASET ENTIRELY — onion lots get no badge.")

    log("\n[5/5] Saving")
    os.makedirs(MODEL_DIR, exist_ok=True)
    full = tf.keras.Sequential([backbone, head])
    full.build((None, IMG, IMG, 3))
    full.save(MODEL_PATH)

    with open(LABELS_PATH, "w") as f:
        json.dump({
            "classes": classes,
            "produce_of": produce_of,
            "is_rotten": is_rotten,
            "supported_produce": supported,
            "img_size": IMG,
        }, f, indent=2)

    report = {
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "images": {k: len(v[0]) for k, v in splits.items()},
        "classes": len(classes),
        "produce_types": len(set(produce_of)),
        "accuracy_28class": round(acc28, 2),
        "baseline_majority_28class": round(majority28, 2),
        "accuracy_freshness": round(acc_bin, 2),
        "baseline_majority_freshness": round(majority_bin, 2),
        "accuracy_produce_type": round(acc_produce, 2),
        "beats_baseline": bool(acc_bin > majority_bin),
        "per_produce": per_produce,
        "supported_produce": supported,
        "unsupported_produce": sorted(set(produce_of) - set(supported)),
        "min_train_images": MIN_TRAIN,
        "min_accuracy": MIN_ACC,
        "onion_in_dataset": "Onion" in set(produce_of),
        "scope_note": ("Binary freshness only. This is NOT commercial grading and must "
                       "never be shown as one — see data/gradeSpecs.js, where grades are "
                       "farmer-declared."),
    }
    with open(REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2)

    log(f"  model  -> {MODEL_PATH}")
    log(f"  labels -> {LABELS_PATH}")
    log(f"  report -> {REPORT_PATH}\n")
    return 0 if acc_bin > majority_bin else 1


if __name__ == "__main__":
    sys.exit(main())

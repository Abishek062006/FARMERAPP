"""
pesticide_rules.py
==================
Pesticide calculation database for TN Farming App.

Keys are derived by normalizing the EXACT training folder names:
  - Replace ___ with _
  - Replace __ with _
  - Strip leading/trailing underscores

EXACT training folder names visible in screenshot:
  Apple___Apple_scab
  Apple___Black_rot
  Apple___Cedar_apple_rust
  Apple___healthy
  Blueberry___healthy
  Cherry_(including_sour)___Powdery_mildew
  Cherry_(including_sour)___healthy
  Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot
  Corn_(maize)___Common_rust_
  Corn_(maize)___Northern_Leaf_Blight
  Corn_(maize)___healthy
  Grape___Black_rot
  Grape___Esca_(Black_Measles)
  Grape___Leaf_blight_(Isariopsis_Leaf_Spot)
  Grape___healthy
  Orange___Haunglongbing_(Citrus_greening)
  Peach___Bacterial_spot
  Peach___healthy
  Pepper,_bell___Bacterial_spot   →  folder shown as "Pepper__bell___Bacterial_spot"
  Pepper,_bell___healthy
  Potato___Early_blight
  Potato___healthy
  Potato___Late_blight
  Tomato__Target_Spot             (double underscore variant seen in screenshot)
  Tomato__Tomato_mosaic_virus     (double underscore variant)
  Tomato__Tomato_YellowLeaf__Curl_Virus  (variant)
  Tomato_Bacterial_spot
  Tomato_Early_blight
  Tomato_healthy
  Tomato_Late_blight
  Tomato_Leaf_Mold
  Tomato_Septoria_leaf_spot
  Tomato_Spider_mites_Two_spotted_spider_mite
  Raspberry___healthy
  Soybean___healthy
  Squash___Powdery_mildew
  Strawberry___Leaf_scorch
  Strawberry___healthy

After normalization (___→_, __→_, strip) each key is stored below.
The normalizer in diseases.js handles the conversion at runtime.
"""

PESTICIDE_DATABASE = {

    # ══════════════════════════════════════════════════════
    # APPLE  (Apple___xxx → Apple_xxx)
    # ══════════════════════════════════════════════════════
    "Apple_Apple_scab": {
        "name": "Captan 50% WP",
        "dosage_per_litre_ml": 2.0,
        "water_required_per_1000_sqft_litre": 15,
        "price_per_litre": 550
    },
    "Apple_Black_rot": {
        "name": "Thiophanate-Methyl 70% WP",
        "dosage_per_litre_ml": 1.5,
        "water_required_per_1000_sqft_litre": 15,
        "price_per_litre": 700
    },
    "Apple_Cedar_apple_rust": {
        "name": "Myclobutanil 10% WP",
        "dosage_per_litre_ml": 1.0,
        "water_required_per_1000_sqft_litre": 15,
        "price_per_litre": 900
    },

    # ══════════════════════════════════════════════════════
    # CHERRY  (Cherry_(including_sour)___xxx)
    # Normalized: Cherry_(including_sour)_Powdery_mildew
    # ══════════════════════════════════════════════════════
    "Cherry_(including_sour)_Powdery_mildew": {
        "name": "Sulfur 80% WG",
        "dosage_per_litre_ml": 3.0,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 350
    },
    # Extra alias — some systems keep the comma
    "Cherry_(including_sour)_Powdery_Mildew": {
        "name": "Sulfur 80% WG",
        "dosage_per_litre_ml": 3.0,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 350
    },

    # ══════════════════════════════════════════════════════
    # CORN (MAIZE)
    # Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot
    # Normalized: Corn_(maize)_Cercospora_leaf_spot Gray_leaf_spot
    # ══════════════════════════════════════════════════════
    "Corn_(maize)_Cercospora_leaf_spot Gray_leaf_spot": {
        "name": "Azoxystrobin 23% SC",
        "dosage_per_litre_ml": 1.0,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 900
    },
    # Alias with underscore instead of space
    "Corn_(maize)_Cercospora_leaf_spot_Gray_leaf_spot": {
        "name": "Azoxystrobin 23% SC",
        "dosage_per_litre_ml": 1.0,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 900
    },
    # Corn_(maize)___Common_rust_  → trailing underscore stripped
    "Corn_(maize)_Common_rust": {
        "name": "Propiconazole 25% EC",
        "dosage_per_litre_ml": 1.0,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 750
    },
    "Corn_(maize)_Northern_Leaf_Blight": {
        "name": "Mancozeb 75% WP",
        "dosage_per_litre_ml": 2.0,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 600
    },

    # ══════════════════════════════════════════════════════
    # GRAPE
    # ══════════════════════════════════════════════════════
    "Grape_Black_rot": {
        "name": "Myclobutanil 10% WP",
        "dosage_per_litre_ml": 1.0,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 900
    },
    "Grape_Esca_(Black_Measles)": {
        "name": "Fosetyl-Aluminium 80% WP",
        "dosage_per_litre_ml": 2.5,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 800
    },
    "Grape_Leaf_blight_(Isariopsis_Leaf_Spot)": {
        "name": "Copper Hydroxide 53.8% WG",
        "dosage_per_litre_ml": 2.0,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 650
    },

    # ══════════════════════════════════════════════════════
    # ORANGE
    # ══════════════════════════════════════════════════════
    "Orange_Haunglongbing_(Citrus_greening)": {
        "name": "Imidacloprid 17.8% SL (psyllid vector control)",
        "dosage_per_litre_ml": 0.5,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 850
    },

    # ══════════════════════════════════════════════════════
    # PEACH
    # ══════════════════════════════════════════════════════
    "Peach_Bacterial_spot": {
        "name": "Copper Hydroxide 53.8% WG",
        "dosage_per_litre_ml": 2.0,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 650
    },

    # ══════════════════════════════════════════════════════
    # PEPPER
    # Folder: Pepper__bell___Bacterial_spot
    #   (comma replaced by system → Pepper,_bell or Pepper__bell)
    # After normalization: Pepper_bell_Bacterial_spot
    # ══════════════════════════════════════════════════════
    "Pepper_bell_Bacterial_spot": {
        "name": "Copper Oxychloride 50% WP",
        "dosage_per_litre_ml": 3.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 500
    },
    # Alias with comma preserved
    "Pepper,_bell_Bacterial_spot": {
        "name": "Copper Oxychloride 50% WP",
        "dosage_per_litre_ml": 3.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 500
    },

    # ══════════════════════════════════════════════════════
    # POTATO
    # ══════════════════════════════════════════════════════
    "Potato_Early_blight": {
        "name": "Mancozeb 75% WP",
        "dosage_per_litre_ml": 2.0,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 600
    },
    "Potato_Late_blight": {
        "name": "Metalaxyl + Mancozeb 72% WP",
        "dosage_per_litre_ml": 2.5,
        "water_required_per_1000_sqft_litre": 14,
        "price_per_litre": 750
    },

    # ══════════════════════════════════════════════════════
    # SQUASH
    # ══════════════════════════════════════════════════════
    "Squash_Powdery_mildew": {
        "name": "Sulfur 80% WG",
        "dosage_per_litre_ml": 3.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 350
    },

    # ══════════════════════════════════════════════════════
    # STRAWBERRY
    # ══════════════════════════════════════════════════════
    "Strawberry_Leaf_scorch": {
        "name": "Myclobutanil 10% WP",
        "dosage_per_litre_ml": 1.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 900
    },

    # ══════════════════════════════════════════════════════
    # TOMATO — CRITICAL: Your screenshot shows BOTH
    #   double-underscore variants (Tomato__xxx) AND
    #   single-underscore variants (Tomato_xxx).
    # We store ALL variants so nothing ever fails.
    # ══════════════════════════════════════════════════════

    # --- Tomato Bacterial Spot ---
    "Tomato_Bacterial_spot": {
        "name": "Copper Oxychloride 50% WP",
        "dosage_per_litre_ml": 3.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 500
    },

    # --- Tomato Early Blight ---
    "Tomato_Early_blight": {
        "name": "Mancozeb 75% WP",
        "dosage_per_litre_ml": 2.0,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 600
    },

    # --- Tomato Late Blight ---
    "Tomato_Late_blight": {
        "name": "Metalaxyl + Mancozeb 72% WP",
        "dosage_per_litre_ml": 2.5,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 750
    },

    # --- Tomato Leaf Mold ---
    "Tomato_Leaf_Mold": {
        "name": "Chlorothalonil 75% WP",
        "dosage_per_litre_ml": 2.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 650
    },

    # --- Tomato Septoria Leaf Spot ---
    "Tomato_Septoria_leaf_spot": {
        "name": "Thiophanate-Methyl 70% WP",
        "dosage_per_litre_ml": 1.5,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 700
    },

    # --- Tomato Spider Mites ---
    # Screenshot shows: Tomato_Spider_mites_Two_spotted_spider_mite
    "Tomato_Spider_mites_Two_spotted_spider_mite": {
        "name": "Abamectin 1.8% EC",
        "dosage_per_litre_ml": 0.5,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 1200
    },
    # Alias with hyphen (original PlantVillage naming)
    "Tomato_Spider_mites_Two-spotted_spider_mite": {
        "name": "Abamectin 1.8% EC",
        "dosage_per_litre_ml": 0.5,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 1200
    },

    # --- Tomato Target Spot ---
    # Screenshot shows: Tomato__Target_Spot (double underscore)
    # After normalization: Tomato_Target_Spot
    "Tomato_Target_Spot": {
        "name": "Azoxystrobin 23% SC",
        "dosage_per_litre_ml": 1.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 900
    },

    # --- Tomato Mosaic Virus ---
    # Screenshot shows: Tomato__Tomato_mosaic_virus (double underscore)
    # After normalization: Tomato_Tomato_mosaic_virus
    "Tomato_Tomato_mosaic_virus": {
        "name": "Imidacloprid 17.8% SL (aphid vector control)",
        "dosage_per_litre_ml": 0.5,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 850
    },

    # --- Tomato Yellow Leaf Curl Virus ---
    # Screenshot shows: Tomato__Tomato_YellowLeaf__Curl_Virus
    # After normalization: Tomato_Tomato_YellowLeaf_Curl_Virus
    "Tomato_Tomato_YellowLeaf_Curl_Virus": {
        "name": "Imidacloprid 17.8% SL",
        "dosage_per_litre_ml": 0.5,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 850
    },
    # Standard PlantVillage naming alias
    "Tomato_Tomato_Yellow_Leaf_Curl_Virus": {
        "name": "Imidacloprid 17.8% SL",
        "dosage_per_litre_ml": 0.5,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 850
    },
    # Another common alias
    "Tomato_Yellow_Leaf_Curl_Virus": {
        "name": "Imidacloprid 17.8% SL",
        "dosage_per_litre_ml": 0.5,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 850
    },

    # ══════════════════════════════════════════════════════
    # RICE  (not in PlantVillage but added for TN farming)
    # ══════════════════════════════════════════════════════
    "Rice_Brown_spot": {
        "name": "Propiconazole 25% EC",
        "dosage_per_litre_ml": 1.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 750
    },
    "Rice_Blast": {
        "name": "Tricyclazole 75% WP",
        "dosage_per_litre_ml": 0.6,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 1000
    },
    "Rice_Neck_rot": {
        "name": "Tricyclazole 75% WP",
        "dosage_per_litre_ml": 0.6,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 1000
    },
    "Rice_Hispa": {
        "name": "Chlorpyrifos 20% EC",
        "dosage_per_litre_ml": 2.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 400
    },
    "Rice_Leaf_scald": {
        "name": "Carbendazim 50% WP",
        "dosage_per_litre_ml": 1.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 550
    },

    # ══════════════════════════════════════════════════════
    # WHEAT
    # ══════════════════════════════════════════════════════
    "Wheat_Rust": {
        "name": "Propiconazole 25% EC",
        "dosage_per_litre_ml": 1.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 750
    },
    "Wheat_Loose_Smut": {
        "name": "Carboxin + Thiram 75% WP (seed treatment)",
        "dosage_per_litre_ml": 2.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 650
    },
    "Wheat_Crown_and_Root_Rot": {
        "name": "Tebuconazole 25.9% EC",
        "dosage_per_litre_ml": 1.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 900
    },

    # ══════════════════════════════════════════════════════
    # COTTON
    # ══════════════════════════════════════════════════════
    "Cotton_Bacterial_blight": {
        "name": "Copper Oxychloride 50% WP",
        "dosage_per_litre_ml": 3.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 500
    },
    "Cotton_Leaf_curl_virus": {
        "name": "Imidacloprid 17.8% SL",
        "dosage_per_litre_ml": 0.5,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 850
    },
    "Cotton_Bollworm": {
        "name": "Chlorpyrifos 20% EC",
        "dosage_per_litre_ml": 2.0,
        "water_required_per_1000_sqft_litre": 12,
        "price_per_litre": 400
    },

    # ══════════════════════════════════════════════════════
    # SOYBEAN
    # ══════════════════════════════════════════════════════
    "Soybean_Rust": {
        "name": "Tebuconazole 25.9% EC",
        "dosage_per_litre_ml": 1.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 900
    },
    "Soybean_Brown_spot": {
        "name": "Mancozeb 75% WP",
        "dosage_per_litre_ml": 2.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 600
    },
    "Soybean_Bacterial_pustule": {
        "name": "Streptomycin 9% + Tetracycline 1%",
        "dosage_per_litre_ml": 1.0,
        "water_required_per_1000_sqft_litre": 10,
        "price_per_litre": 600
    },
}
# Tamil Nadu Specific Crop Disease Classes
TN_DISEASE_CLASSES = {
    # PADDY (Rice) - Most important in TN
    'paddy': [
        'Paddy_Bacterial_Leaf_Blight',
        'Paddy_Blast',
        'Paddy_Brown_Spot',
        'Paddy_Sheath_Blight',
        'Paddy_False_Smut',
        'Paddy_Grain_Discoloration',
        'Paddy_Healthy'
    ],
    
    # GROUNDNUT
    'groundnut': [
        'Groundnut_Leaf_Spot',
        'Groundnut_Rust',
        'Groundnut_Tikka_Disease',
        'Groundnut_Healthy'
    ],
    
    # COTTON
    'cotton': [
        'Cotton_Bacterial_Blight',
        'Cotton_Leaf_Curl',
        'Cotton_Bollworm',
        'Cotton_Healthy'
    ],
    
    # TOMATO
    'tomato': [
        'Tomato_Late_Blight',
        'Tomato_Early_Blight',
        'Tomato_Bacterial_Spot',
        'Tomato_Leaf_Curl_Virus',
        'Tomato_Healthy'
    ],
    
    # BRINJAL (Eggplant)
    'brinjal': [
        'Brinjal_Bacterial_Wilt',
        'Brinjal_Little_Leaf',
        'Brinjal_Fruit_Borer',
        'Brinjal_Healthy'
    ],
    
    # CHILLI
    'chilli': [
        'Chilli_Anthracnose',
        'Chilli_Leaf_Curl',
        'Chilli_Powdery_Mildew',
        'Chilli_Healthy'
    ],
    
    # ONION
    'onion': [
        'Onion_Purple_Blotch',
        'Onion_Stemphylium_Blight',
        'Onion_Healthy'
    ],
    
    # SUGARCANE
    'sugarcane': [
        'Sugarcane_Red_Rot',
        'Sugarcane_Wilt',
        'Sugarcane_Smut',
        'Sugarcane_Healthy'
    ],
    
    # MILLETS (Ragi, Cholam)
    'millet': [
        'Millet_Blast',
        'Millet_Downy_Mildew',
        'Millet_Healthy'
    ],
    
    # COCONUT
    'coconut': [
        'Coconut_Bud_Rot',
        'Coconut_Leaf_Blight',
        'Coconut_Healthy'
    ]
}

# Flatten all classes
ALL_TN_DISEASES = []
for crop, diseases in TN_DISEASE_CLASSES.items():
    ALL_TN_DISEASES.extend(diseases)

print(f"Total Tamil Nadu Disease Classes: {len(ALL_TN_DISEASES)}")

# Disease Information for TN crops
TN_DISEASE_INFO = {
    'Paddy_Bacterial_Leaf_Blight': {
        'name': 'Bacterial Leaf Blight (BLB)',
        'tamil_name': 'நெல் இலை வெண்புள்ளி நோய்',
        'scientific': 'Xanthomonas oryzae pv. oryzae',
        'severity': 'High - Can cause 20-80% yield loss',
        'symptoms': 'Water-soaked lesions on leaf tips, yellowing, wilting',
        'favorable_conditions': 'High humidity, warm temperature (25-34°C)',
        'treatment': {
            'chemical': [
                'Streptocycline (500 ppm) + Copper oxychloride (2.5g/L)',
                'Validamycin 3% L (2ml/L)',
                'Bismerthiazol 20% WP (1g/L)'
            ],
            'biological': [
                'Pseudomonas fluorescens spray',
                'Remove infected leaves',
                'Improve field drainage'
            ],
            'prevention': [
                'Use resistant varieties (ADT-45, CR Dhan 310)',
                'Avoid excessive nitrogen fertilizer',
                'Maintain proper water level',
                'Seed treatment with Streptocycline'
            ]
        },
        'recommended_by': 'Tamil Nadu Agricultural University (TNAU)'
    },
    
    'Paddy_Blast': {
        'name': 'Rice Blast Disease',
        'tamil_name': 'நெல் வெடிப்பு நோய்',
        'scientific': 'Magnaporthe oryzae',
        'severity': 'Very High - Can destroy entire crop',
        'symptoms': 'Diamond-shaped lesions on leaves, neck blast on panicles',
        'favorable_conditions': 'High humidity, moderate temperature, excess nitrogen',
        'treatment': {
            'chemical': [
                'Tricyclazole 75% WP (0.6g/L)',
                'Isoprothiolane 40% EC (1.5ml/L)',
                'Carbendazim 50% WP (1g/L)'
            ],
            'biological': [
                'Trichoderma viride spray',
                'Remove diseased plant parts'
            ],
            'prevention': [
                'Use blast-resistant varieties',
                'Balanced fertilization',
                'Avoid water stress',
                'Proper spacing between plants'
            ]
        },
        'recommended_by': 'TNAU Paddy Research Station, Tirunelveli'
    },
    
    'Tomato_Late_Blight': {
        'name': 'Tomato Late Blight',
        'tamil_name': 'தக்காளி இலை கருப்பு புள்ளி நோய்',
        'scientific': 'Phytophthora infestans',
        'severity': 'High',
        'symptoms': 'Brown spots on leaves, white fungal growth, fruit rot',
        'treatment': {
            'chemical': [
                'Mancozeb 75% WP (2.5g/L)',
                'Copper oxychloride 50% WP (3g/L)',
                'Metalaxyl + Mancozeb (2g/L)'
            ],
            'biological': [
                'Remove infected plants immediately',
                'Improve drainage and air circulation'
            ],
            'prevention': [
                'Use disease-free seeds',
                'Proper plant spacing',
                'Avoid overhead irrigation',
                'Crop rotation'
            ]
        },
        'recommended_by': 'TNAU Horticultural College, Coimbatore'
    },
    
    'Brinjal_Bacterial_Wilt': {
        'name': 'Brinjal Bacterial Wilt',
        'tamil_name': 'கத்தரி வாடல் நோய்',
        'scientific': 'Ralstonia solanacearum',
        'severity': 'Very High - 100% plant death',
        'symptoms': 'Sudden wilting of entire plant, vascular browning',
        'treatment': {
            'chemical': [
                'Streptocycline soil drenching (500 ppm)',
                'Copper oxychloride spray (3g/L)',
                'Bleaching powder soil treatment (10g/plant)'
            ],
            'biological': [
                'Remove and destroy infected plants',
                'Soil solarization before planting',
                'Use Pseudomonas fluorescens'
            ],
            'prevention': [
                'Use resistant varieties',
                'Crop rotation with non-solanaceous crops',
                'Proper drainage',
                'Avoid waterlogging'
            ]
        },
        'recommended_by': 'TNAU Vegetable Research Station'
    },
    
    'Chilli_Anthracnose': {
        'name': 'Chilli Anthracnose (Fruit Rot)',
        'tamil_name': 'மிளகாய் பழ அழுகல்',
        'scientific': 'Colletotrichum capsici',
        'severity': 'High',
        'symptoms': 'Circular sunken spots on fruits, premature fruit drop',
        'treatment': {
            'chemical': [
                'Carbendazim 50% WP (1g/L)',
                'Mancozeb 75% WP (2.5g/L)',
                'Azoxystrobin 23% SC (1ml/L)'
            ],
            'biological': [
                'Trichoderma viride application',
                'Remove infected fruits',
                'Improve air circulation'
            ],
            'prevention': [
                'Use disease-free seeds',
                'Proper spacing',
                'Avoid excess humidity',
                'Harvest ripe fruits immediately'
            ]
        },
        'recommended_by': 'TNAU'
    }
}

def get_tn_disease_info(disease_class):
    """Get Tamil Nadu specific disease information"""
    if disease_class in TN_DISEASE_INFO:
        return TN_DISEASE_INFO[disease_class]
    
    return {
        'name': disease_class.replace('_', ' '),
        'tamil_name': 'தகவல் இல்லை',
        'symptoms': 'Disease detected. Consult TNAU or local agricultural officer.',
        'treatment': {
            'chemical': ['Consult agricultural expert'],
            'biological': ['Remove affected parts'],
            'prevention': ['Regular monitoring']
        },
        'recommended_by': 'Please visit nearest TNAU extension center'
    }

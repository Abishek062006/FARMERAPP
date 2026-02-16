# PlantVillage Dataset - 38 Disease Classes
DISEASE_CLASSES = [
    'Apple___Apple_scab',
    'Apple___Black_rot',
    'Apple___Cedar_apple_rust',
    'Apple___healthy',
    'Blueberry___healthy',
    'Cherry_(including_sour)___Powdery_mildew',
    'Cherry_(including_sour)___healthy',
    'Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot',
    'Corn_(maize)___Common_rust_',
    'Corn_(maize)___Northern_Leaf_Blight',
    'Corn_(maize)___healthy',
    'Grape___Black_rot',
    'Grape___Esca_(Black_Measles)',
    'Grape___Leaf_blight_(Isariopsis_Leaf_Spot)',
    'Grape___healthy',
    'Orange___Haunglongbing_(Citrus_greening)',
    'Peach___Bacterial_spot',
    'Peach___healthy',
    'Pepper,_bell___Bacterial_spot',
    'Pepper,_bell___healthy',
    'Potato___Early_blight',
    'Potato___Late_blight',
    'Potato___healthy',
    'Raspberry___healthy',
    'Soybean___healthy',
    'Squash___Powdery_mildew',
    'Strawberry___Leaf_scorch',
    'Strawberry___healthy',
    'Tomato___Bacterial_spot',
    'Tomato___Early_blight',
    'Tomato___Late_blight',
    'Tomato___Leaf_Mold',
    'Tomato___Septoria_leaf_spot',
    'Tomato___Spider_mites Two-spotted_spider_mite',
    'Tomato___Target_Spot',
    'Tomato___Tomato_Yellow_Leaf_Curl_Virus',
    'Tomato___Tomato_mosaic_virus',
    'Tomato___healthy'
]

# Disease Information Database
DISEASE_INFO = {
    'Apple___Apple_scab': {
        'name': 'Apple Scab',
        'scientific': 'Venturia inaequalis',
        'description': 'Fungal disease causing dark, scabby lesions on leaves and fruit.',
        'symptoms': 'Olive-green to dark brown spots on leaves, distorted fruit',
        'treatment': {
            'chemical': ['Captan', 'Mancozeb', 'Copper fungicides'],
            'biological': ['Remove fallen leaves', 'Prune for air circulation'],
            'prevention': ['Plant resistant varieties', 'Apply fungicide early spring']
        }
    },
    'Apple___Black_rot': {
        'name': 'Apple Black Rot',
        'scientific': 'Botryosphaeria obtusa',
        'description': 'Fungal disease affecting fruit, leaves, and bark',
        'symptoms': 'Circular brown spots on leaves, mummified fruit',
        'treatment': {
            'chemical': ['Captan', 'Thiophanate-methyl'],
            'biological': ['Remove infected fruit and branches', 'Prune dead wood'],
            'prevention': ['Good sanitation', 'Proper pruning', 'Fungicide spray']
        }
    },
    'Apple___Cedar_apple_rust': {
        'name': 'Cedar Apple Rust',
        'scientific': 'Gymnosporangium juniperi-virginianae',
        'description': 'Fungal disease requiring both apple and cedar trees',
        'symptoms': 'Orange-yellow spots on upper leaf surface',
        'treatment': {
            'chemical': ['Myclobutanil', 'Propiconazole'],
            'biological': ['Remove nearby cedar trees', 'Remove infected leaves'],
            'prevention': ['Plant resistant varieties', 'Apply fungicide in spring']
        }
    },
    'Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot': {
        'name': 'Gray Leaf Spot',
        'scientific': 'Cercospora zeae-maydis',
        'description': 'Fungal disease causing rectangular lesions',
        'symptoms': 'Gray to tan rectangular spots on leaves',
        'treatment': {
            'chemical': ['Azoxystrobin', 'Pyraclostrobin'],
            'biological': ['Crop rotation', 'Remove crop debris'],
            'prevention': ['Use resistant hybrids', 'Proper spacing', 'Crop rotation']
        }
    },
    'Corn_(maize)___Common_rust_': {
        'name': 'Common Rust',
        'scientific': 'Puccinia sorghi',
        'description': 'Fungal disease with rust-colored pustules',
        'symptoms': 'Reddish-brown pustules on leaves',
        'treatment': {
            'chemical': ['Azoxystrobin', 'Propiconazole'],
            'biological': ['Plant early maturing varieties', 'Remove volunteer corn'],
            'prevention': ['Use resistant varieties', 'Fungicide application']
        }
    },
    'Corn_(maize)___Northern_Leaf_Blight': {
        'name': 'Northern Leaf Blight',
        'scientific': 'Exserohilum turcicum',
        'description': 'Fungal disease causing long cigar-shaped lesions',
        'symptoms': 'Gray-green to tan lesions on leaves',
        'treatment': {
            'chemical': ['Azoxystrobin', 'Propiconazole'],
            'biological': ['Remove crop debris', 'Plow under residue'],
            'prevention': ['Use resistant hybrids', 'Crop rotation']
        }
    },
    'Grape___Black_rot': {
        'name': 'Grape Black Rot',
        'scientific': 'Guignardia bidwellii',
        'description': 'Fungal disease affecting leaves, shoots, and fruit',
        'symptoms': 'Circular brown spots on leaves, mummified berries',
        'treatment': {
            'chemical': ['Mancozeb', 'Captan', 'Myclobutanil'],
            'biological': ['Remove mummified fruit', 'Prune for air circulation'],
            'prevention': ['Sanitation', 'Fungicide spray', 'Proper pruning']
        }
    },
    'Grape___Esca_(Black_Measles)': {
        'name': 'Esca (Black Measles)',
        'scientific': 'Multiple fungi',
        'description': 'Complex fungal disease affecting wood and leaves',
        'symptoms': 'Tiger-stripe pattern on leaves, berry spotting',
        'treatment': {
            'chemical': ['No effective chemical treatment'],
            'biological': ['Prune infected wood', 'Protect pruning wounds'],
            'prevention': ['Proper pruning techniques', 'Vineyard sanitation']
        }
    },
    'Grape___Leaf_blight_(Isariopsis_Leaf_Spot)': {
        'name': 'Isariopsis Leaf Spot',
        'scientific': 'Pseudocercospora vitis',
        'description': 'Fungal disease causing leaf spots',
        'symptoms': 'Brown irregular spots on leaves',
        'treatment': {
            'chemical': ['Copper fungicides', 'Mancozeb'],
            'biological': ['Remove infected leaves', 'Improve air circulation'],
            'prevention': ['Fungicide application', 'Proper canopy management']
        }
    },
    'Orange___Haunglongbing_(Citrus_greening)': {
        'name': 'Citrus Greening (HLB)',
        'scientific': 'Candidatus Liberibacter',
        'description': 'Bacterial disease spread by psyllids, extremely destructive',
        'symptoms': 'Yellow shoots, asymmetric blotchy mottling, small lopsided fruit',
        'treatment': {
            'chemical': ['No cure available', 'Insecticides for psyllid control'],
            'biological': ['Remove infected trees immediately', 'Control psyllid vectors'],
            'prevention': ['Use disease-free nursery stock', 'Control psyllid populations']
        }
    },
    'Peach___Bacterial_spot': {
        'name': 'Bacterial Spot',
        'scientific': 'Xanthomonas arboricola pv. pruni',
        'description': 'Bacterial disease affecting leaves and fruit',
        'symptoms': 'Small purple spots on leaves, lesions on fruit',
        'treatment': {
            'chemical': ['Copper-based bactericides'],
            'biological': ['Prune for air circulation', 'Remove infected tissue'],
            'prevention': ['Use resistant varieties', 'Copper spray', 'Good sanitation']
        }
    },
    'Pepper,_bell___Bacterial_spot': {
        'name': 'Pepper Bacterial Spot',
        'scientific': 'Xanthomonas spp.',
        'description': 'Bacterial disease affecting leaves and fruit',
        'symptoms': 'Small brown spots on leaves and fruit, leaf drop',
        'treatment': {
            'chemical': ['Copper-based bactericides', 'Streptomycin'],
            'biological': ['Remove infected plants', 'Improve air circulation'],
            'prevention': ['Use disease-free seeds', 'Avoid overhead irrigation', 'Crop rotation']
        }
    },
    'Potato___Early_blight': {
        'name': 'Potato Early Blight',
        'scientific': 'Alternaria solani',
        'description': 'Fungal disease affecting leaves and tubers',
        'symptoms': 'Dark brown spots with concentric rings (target pattern)',
        'treatment': {
            'chemical': ['Chlorothalonil', 'Mancozeb', 'Copper fungicides'],
            'biological': ['Remove infected leaves', 'Proper fertilization'],
            'prevention': ['Crop rotation', 'Resistant varieties', 'Fungicide application']
        }
    },
    'Potato___Late_blight': {
        'name': 'Potato Late Blight',
        'scientific': 'Phytophthora infestans',
        'description': 'Highly destructive disease, same pathogen as tomato late blight',
        'symptoms': 'Brown water-soaked lesions, white mold on leaf underside, tuber rot',
        'treatment': {
            'chemical': ['Mancozeb', 'Metalaxyl', 'Copper oxychloride', 'Chlorothalonil'],
            'biological': ['Destroy infected plants immediately', 'Hill soil around plants'],
            'prevention': ['Use certified seed', 'Proper spacing', 'Fungicide spray', 'Avoid overhead watering']
        }
    },
    'Squash___Powdery_mildew': {
        'name': 'Powdery Mildew',
        'scientific': 'Podosphaera xanthii',
        'description': 'Fungal disease causing white powdery coating',
        'symptoms': 'White powdery spots on leaves and stems',
        'treatment': {
            'chemical': ['Sulfur', 'Potassium bicarbonate', 'Myclobutanil'],
            'biological': ['Neem oil spray', 'Improve air circulation', 'Remove affected leaves'],
            'prevention': ['Resistant varieties', 'Proper spacing', 'Avoid overhead watering']
        }
    },
    'Strawberry___Leaf_scorch': {
        'name': 'Leaf Scorch',
        'scientific': 'Diplocarpon earlianum',
        'description': 'Fungal disease affecting strawberry leaves',
        'symptoms': 'Purple to brown irregular blotches on leaves',
        'treatment': {
            'chemical': ['Captan', 'Myclobutanil'],
            'biological': ['Remove infected leaves', 'Improve air circulation'],
            'prevention': ['Resistant varieties', 'Fungicide application', 'Good sanitation']
        }
    },
    'Tomato___Bacterial_spot': {
        'name': 'Tomato Bacterial Spot',
        'scientific': 'Xanthomonas spp.',
        'description': 'Bacterial disease affecting leaves, stems, and fruit',
        'symptoms': 'Small dark spots on leaves, raised spots on fruit',
        'treatment': {
            'chemical': ['Copper-based bactericides', 'Streptomycin'],
            'biological': ['Remove infected plants', 'Improve air circulation'],
            'prevention': ['Disease-free seeds', 'Crop rotation', 'Avoid overhead watering']
        }
    },
    'Tomato___Early_blight': {
        'name': 'Tomato Early Blight',
        'scientific': 'Alternaria solani',
        'description': 'Common fungal disease affecting older leaves first',
        'symptoms': 'Brown spots with concentric rings on lower leaves',
        'treatment': {
            'chemical': ['Chlorothalonil', 'Mancozeb', 'Copper fungicides'],
            'biological': ['Remove affected leaves', 'Mulch around plants'],
            'prevention': ['Crop rotation', 'Stake plants', 'Water at base']
        }
    },
    'Tomato___Late_blight': {
        'name': 'Tomato Late Blight',
        'scientific': 'Phytophthora infestans',
        'description': 'Extremely destructive disease affecting tomatoes and potatoes',
        'symptoms': 'Brown water-soaked spots, white fungal growth, rapid plant death',
        'treatment': {
            'chemical': ['Mancozeb', 'Chlorothalonil', 'Copper oxychloride', 'Metalaxyl'],
            'biological': ['Remove infected plants immediately', 'Improve drainage'],
            'prevention': ['Space plants properly', 'Avoid overhead watering', 'Use resistant varieties']
        }
    },
    'Tomato___Leaf_Mold': {
        'name': 'Tomato Leaf Mold',
        'scientific': 'Passalora fulva',
        'description': 'Fungal disease common in greenhouse tomatoes',
        'symptoms': 'Yellow spots on upper leaf surface, olive-green mold underneath',
        'treatment': {
            'chemical': ['Chlorothalonil', 'Mancozeb', 'Copper fungicides'],
            'biological': ['Improve air circulation', 'Reduce humidity', 'Remove affected leaves'],
            'prevention': ['Resistant varieties', 'Proper ventilation', 'Avoid overhead watering']
        }
    },
    'Tomato___Septoria_leaf_spot': {
        'name': 'Septoria Leaf Spot',
        'scientific': 'Septoria lycopersici',
        'description': 'Fungal disease starting on lower leaves',
        'symptoms': 'Small circular spots with gray centers and dark borders',
        'treatment': {
            'chemical': ['Chlorothalonil', 'Mancozeb', 'Copper fungicides'],
            'biological': ['Remove infected leaves', 'Mulch around plants'],
            'prevention': ['Crop rotation', 'Avoid overhead watering', 'Proper spacing']
        }
    },
    'Tomato___Spider_mites Two-spotted_spider_mite': {
        'name': 'Two-Spotted Spider Mite',
        'scientific': 'Tetranychus urticae',
        'description': 'Tiny arachnids that suck plant juices',
        'symptoms': 'Yellow stippling on leaves, fine webbing, leaf bronzing',
        'treatment': {
            'chemical': ['Abamectin', 'Bifenthrin', 'Insecticidal soap'],
            'biological': ['Predatory mites', 'Neem oil spray', 'Strong water spray'],
            'prevention': ['Avoid water stress', 'Remove weeds', 'Monitor regularly']
        }
    },
    'Tomato___Target_Spot': {
        'name': 'Target Spot',
        'scientific': 'Corynespora cassiicola',
        'description': 'Fungal disease with target-like lesions',
        'symptoms': 'Brown spots with concentric rings on leaves and fruit',
        'treatment': {
            'chemical': ['Chlorothalonil', 'Mancozeb', 'Azoxystrobin'],
            'biological': ['Remove infected plant parts', 'Improve air circulation'],
            'prevention': ['Resistant varieties', 'Proper spacing', 'Fungicide application']
        }
    },
    'Tomato___Tomato_Yellow_Leaf_Curl_Virus': {
        'name': 'Tomato Yellow Leaf Curl Virus',
        'scientific': 'TYLCV (Begomovirus)',
        'description': 'Viral disease spread by whiteflies',
        'symptoms': 'Upward curling and yellowing of leaves, stunted growth',
        'treatment': {
            'chemical': ['No cure - control whitefly vectors', 'Insecticides for whiteflies'],
            'biological': ['Remove infected plants', 'Control whitefly populations', 'Yellow sticky traps'],
            'prevention': ['Use virus-free transplants', 'Control whiteflies', 'Resistant varieties']
        }
    },
    'Tomato___Tomato_mosaic_virus': {
        'name': 'Tomato Mosaic Virus',
        'scientific': 'ToMV (Tobamovirus)',
        'description': 'Highly contagious viral disease',
        'symptoms': 'Mottled light and dark green on leaves, distorted growth',
        'treatment': {
            'chemical': ['No cure available'],
            'biological': ['Remove infected plants', 'Disinfect tools', 'Wash hands'],
            'prevention': ['Use virus-free seeds', 'Sanitize tools', 'Resistant varieties', 'Avoid touching plants']
        }
    }
}

def format_disease_name(class_name):
    """Convert class name to readable format"""
    parts = class_name.split('___')
    if len(parts) == 2:
        crop = parts[0].replace('_', ' ')
        disease = parts[1].replace('_', ' ')
        return f"{crop} - {disease}"
    return class_name.replace('_', ' ')

def get_disease_info(class_name):
    """Get detailed information about a disease"""
    if class_name in DISEASE_INFO:
        return DISEASE_INFO[class_name]
    
    # Return generic info if specific info not available
    return {
        'name': format_disease_name(class_name),
        'scientific': 'Unknown',
        'description': 'Disease detected. Please consult agricultural expert for proper treatment.',
        'symptoms': 'Visual symptoms detected in the image',
        'treatment': {
            'chemical': ['Consult agricultural expert for appropriate pesticides'],
            'biological': ['Remove affected plant parts', 'Improve growing conditions'],
            'prevention': ['Regular monitoring', 'Proper plant spacing', 'Good sanitation']
        }
    }

def is_healthy(class_name):
    """Check if prediction indicates healthy plant"""
    return 'healthy' in class_name.lower()

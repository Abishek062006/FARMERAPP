const API_URL = 'http://192.168.1.7:5000/api'; // ← YOUR IP

/**
 * Get crop recommendations using Groq AI
 */
export const getCropRecommendations = async (location, soilType, season) => {
  try {
    console.log('🌱 Fetching crop recommendations...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 sec timeout

    const response = await fetch(`${API_URL}/ai/crop-recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ location, soilType, season }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', data.error);
      return {
        success: false,
        error: data.error || 'Failed to get recommendations',
      };
    }

    console.log('✅ Got', data.count, 'crop recommendations');
    return {
      success: true,
      recommendations: data.recommendations,
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('❌ Request timeout');
      return {
        success: false,
        error: 'Request timeout. Please try again.',
      };
    }
    
    console.error('❌ Get recommendations error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Ask AI a question using Groq
 */
export const askAI = async (question, language = 'en') => {
  try {
    console.log('🤖 Asking AI:', question);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${API_URL}/ai/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question, language }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', data.error);
      return {
        success: false,
        error: data.error || 'Failed to get answer',
      };
    }

    console.log('✅ Got AI answer');
    return {
      success: true,
      answer: data.answer,
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timeout',
      };
    }
    
    console.error('❌ Ask AI error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * ⚠️ DEPRECATED - DO NOT USE THIS FUNCTION
 * Use the disease detection endpoint directly from your screen component instead
 * This function calls Groq AI which is NOT suitable for disease detection
 * 
 * For disease detection, call /api/disease/detect directly using:
 * 
 * const formData = new FormData();
 * formData.append('image', imageFile);
 * 
 * const response = await fetch('http://192.168.1.7:5000/api/disease/detect', {
 *   method: 'POST',
 *   body: formData,
 * });
 */
// REMOVED: diagnoseDiseaseWithAI - Use Python AI endpoint instead

/**
 * Detect plant disease using Python TensorFlow AI (CORRECT METHOD)
 * 
 * @param {string} imageUri - URI of the image to analyze
 * @returns {Promise} - Disease detection result from Python AI
 */
export const detectDiseaseWithPythonAI = async (imageUri) => {
  try {
    console.log('🔍 Detecting disease with Python TensorFlow AI...');

    // Create FormData for image upload
    const formData = new FormData();
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'plant.jpg',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds

    // Call Python AI disease detection endpoint
    const response = await fetch(`${API_URL}/disease/detect`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Disease detection error:', data.message);
      return {
        success: false,
        error: data.message || 'Failed to detect disease',
      };
    }

    console.log('✅ Disease detected:', data.data.healthy ? 'Healthy' : data.data.diseases[0]?.name);
    return {
      success: true,
      data: data.data,
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('❌ Request timeout');
      return {
        success: false,
        error: 'Request timeout. The AI service might be slow.',
      };
    }
    
    console.error('❌ Disease detection error:', error);
    return {
      success: false,
      error: error.message || 'Failed to detect disease',
    };
  }
};

/**
 * Get pesticide recommendations using Groq AI
 */
export const getPesticideRecommendations = async (cropName, diseaseName, farmingType = 'conventional') => {
  try {
    console.log('💊 Getting pesticide recommendations...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${API_URL}/ai/pesticide-recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cropName, diseaseName, farmingType }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', data.error);
      return {
        success: false,
        error: data.error || 'Failed to get recommendations',
      };
    }

    console.log('✅ Got pesticide recommendations');
    return {
      success: true,
      recommendations: data.recommendations,
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timeout',
      };
    }
    
    console.error('❌ Get pesticide recommendations error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};
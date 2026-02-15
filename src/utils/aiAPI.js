
const API_URL = 'http://192.168.1.7:5000/api'; // ← YOUR IP
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
 * Ask AI a question
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

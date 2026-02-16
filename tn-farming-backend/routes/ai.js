const express = require('express');
const router = express.Router();
const { askGroq, getCropRecommendations } = require('../services/groqService'); // ✅ FIXED


/**
 * POST /api/ai/crop-recommendations
 * Get crop recommendations based on location
 */
router.post('/crop-recommendations', async (req, res) => {
  try {
    const { location, soilType, season } = req.body;

    console.log('🌱 Getting crop recommendations for:', location?.city);

    // Validate input
    if (!location || !location.city) {
      return res.status(400).json({
        success: false,
        error: 'Location with city is required'
      });
    }

    // Get recommendations from Groq AI
    const recommendations = await getCropRecommendations(
      location, 
      soilType || 'Not specified', 
      season || 'Current season'
    );

    res.json({
      success: true,
      recommendations,
      location: location.city,
      district: location.district,
      count: recommendations.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Crop recommendation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get recommendations'
    });
  }
});


/**
 * POST /api/ai/ask
 * General AI question (for farmers)
 */
router.post('/ask', async (req, res) => {
  try {
    const { question, language } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'Question is required'
      });
    }

    // Add language instruction if Tamil
    let prompt = question;
    if (language === 'ta') {
      prompt = `Answer in Tamil (தமிழ் script): ${question}`;
    }

    const answer = await askGroq(prompt); // ✅ FIXED

    res.json({
      success: true,
      answer,
      language: language || 'en',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ AI ask error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get answer'
    });
  }
});


/**
 * POST /api/ai/daily-tasks
 * Generate daily tasks for a crop (Week 6 feature)
 */
router.post('/daily-tasks', async (req, res) => {
  try {
    const { cropName, plantingDate, currentDay, farmingType, weatherData } = req.body;

    // Validate input
    if (!cropName || !plantingDate) {
      return res.status(400).json({
        success: false,
        error: 'Crop name and planting date are required'
      });
    }

    // TODO: Implement in Week 6
    res.json({
      success: true,
      message: '📅 Daily tasks generation coming in Week 6!',
      tasks: []
    });

  } catch (error) {
    console.error('❌ Error generating tasks:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate tasks'
    });
  }
});


/**
 * POST /api/ai/disease-diagnosis
 * Diagnose crop disease from symptoms (Week 6 feature)
 */
router.post('/disease-diagnosis', async (req, res) => {
  try {
    const { cropName, symptoms, photos } = req.body;

    // Validate input
    if (!cropName || !symptoms || symptoms.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Crop name and symptoms are required'
      });
    }

    // TODO: Implement in Week 6
    res.json({
      success: true,
      message: '🔬 Disease diagnosis coming in Week 6!',
      diagnosis: null
    });

  } catch (error) {
    console.error('❌ Error diagnosing disease:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to diagnose disease'
    });
  }
});


/**
 * POST /api/ai/pesticide-recommendations
 * Get pesticide recommendations (Week 6 feature)
 */
router.post('/pesticide-recommendations', async (req, res) => {
  try {
    const { cropName, disease, farmingType } = req.body;

    // Validate input
    if (!cropName) {
      return res.status(400).json({
        success: false,
        error: 'Crop name is required'
      });
    }

    // TODO: Implement in Week 6
    res.json({
      success: true,
      message: '💊 Pesticide recommendations coming in Week 6!',
      recommendations: []
    });

  } catch (error) {
    console.error('❌ Error getting pesticide recommendations:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get pesticide recommendations'
    });
  }
});


module.exports = router;

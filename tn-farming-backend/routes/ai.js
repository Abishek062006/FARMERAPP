const express = require('express');
const router = express.Router();
const { askGemini, getCropRecommendations } = require('../services/geminiService');

/**
 * POST /api/ai/crop-recommendations
 * Get crop recommendations based on location
 */
router.post('/crop-recommendations', async (req, res) => {
  try {
    const { location, soilType, season } = req.body;

    console.log('🌱 Getting crop recommendations for:', location.city);

    // Validate input
    if (!location || !location.city) {
      return res.status(400).json({
        success: false,
        error: 'Location is required'
      });
    }

    // Get recommendations from Gemini
    const recommendations = await getCropRecommendations(location, soilType, season);

    res.json({
      success: true,
      recommendations,
      location: location.city,
      count: recommendations.length
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
 * General AI question
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
      prompt = `Answer in Tamil (Tamil script): ${question}`;
    }

    const answer = await askGemini(prompt);

    res.json({
      success: true,
      answer,
      language: language || 'en'
    });

  } catch (error) {
    console.error('❌ AI ask error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get answer'
    });
  }
});

module.exports = router;

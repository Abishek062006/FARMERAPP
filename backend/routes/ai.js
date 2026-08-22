const express = require('express');
const router = express.Router();
const { askGroq, explainCropRecommendations } = require('../services/groqService');
const { getCandidateCrops, rankCandidates } = require('../services/cropRecommendationEngine');
const { CROPS } = require('../data/agroZones');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

/**
 * GET /api/ai/crop-catalog
 * Full crop name list (English + Tamil) for search/autocomplete — lets a
 * farmer pick a crop outside the AI-ranked recommendations.
 */
router.get('/crop-catalog', (req, res) => {
  res.json({
    success: true,
    crops: CROPS.map((c) => ({ name: c.name, tamilName: c.tamilName })),
  });
});

/**
 * POST /api/ai/crop-recommendations
 *
 * Three-layer pipeline (see cropRecommendationEngine.js + groqService.js):
 *  1. Agronomic filter — district's agro-climatic zone + soilType + waterSource
 *     + season, against a static crop reference table (no AI).
 *  2. Ranking — live Agmarknet price trend + how many farmers on this platform
 *     already grow it nearby + this farmer's own history with it (no AI).
 *  3. Explanation — LLM phrases the reason for the crops steps 1-2 already
 *     chose; it does not pick crops or set demand level.
 */
router.post('/crop-recommendations', async (req, res) => {
  try {
    const { location, soilType, waterSource, season } = req.body;

    console.log('🌱 Getting crop recommendations for:', location?.city);

    if (!location || !location.city || !location.district) {
      return res.status(400).json({
        success: false,
        error: 'Location with city and district is required'
      });
    }

    const resolvedSeason = season || 'Summer';

    const candidates = getCandidateCrops({
      district: location.district,
      soilType,
      waterSource,
      season: resolvedSeason,
    });

    if (candidates.length === 0) {
      return res.json({
        success: true,
        recommendations: [],
        location: location.city,
        district: location.district,
        count: 0,
        timestamp: new Date().toISOString()
      });
    }

    const ranked = await rankCandidates({
      candidates,
      district: location.district,
      firebaseUid: req.firebaseUid,
      limit: 6,
    });

    const reasons = await explainCropRecommendations(ranked, location, resolvedSeason);

    const recommendations = ranked.map((crop) => ({
      name: crop.name,
      tamilName: crop.tamilName,
      duration: crop.duration,
      yield: crop.typicalYield,
      demand: crop.demand,
      reason: reasons[crop.name] || `Suited to your land's conditions for the ${resolvedSeason.toLowerCase()} season.`,
    }));

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

    let prompt = question;
    if (language === 'ta') {
      prompt = `Answer in Tamil (தமிழ் script): ${question}`;
    }

    const answer = await askGroq(prompt);

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
 * POST /api/ai/pesticide-recommendations
 * Get pesticide recommendations for a disease
 */
router.post('/pesticide-recommendations', async (req, res) => {
  try {
    const { cropName, diseaseName, farmingType } = req.body;

    if (!cropName || !diseaseName) {
      return res.status(400).json({
        success: false,
        error: 'Crop name and disease name are required'
      });
    }

    console.log('💊 Getting pesticide recommendations for:', diseaseName);

    // ✅ Create AI prompt for pesticide recommendations
    const prompt = `You are an agricultural expert. Recommend pesticides for:
Crop: ${cropName}
Disease: ${diseaseName}
Farming Type: ${farmingType || 'conventional'}

Provide recommendations in JSON format:
{
  "organic": [
    {
      "name": "Pesticide name",
      "dosage": "Dosage instructions",
      "applicationMethod": "How to apply",
      "safetyPeriod": "Days before harvest"
    }
  ],
  "chemical": [
    {
      "name": "Pesticide name",
      "dosage": "Dosage instructions",
      "applicationMethod": "How to apply",
      "safetyPeriod": "Days before harvest"
    }
  ],
  "preventiveMeasures": ["measure1", "measure2"],
  "safetyInstructions": ["instruction1", "instruction2"]
}`;

    const aiResponse = await askGroq(prompt);

    let recommendations;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        recommendations = JSON.parse(jsonMatch[0]);
      } else {
        recommendations = JSON.parse(aiResponse);
      }
    } catch (parseError) {
      console.error('❌ Error parsing recommendations:', parseError);
      recommendations = {
        organic: [],
        chemical: [],
        preventiveMeasures: [],
        safetyInstructions: []
      };
    }

    console.log('✅ Pesticide recommendations generated');

    res.json({
      success: true,
      recommendations,
      cropName,
      diseaseName,
      timestamp: new Date().toISOString()
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

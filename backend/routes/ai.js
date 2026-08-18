const express = require('express');
const router = express.Router();
const multer = require('multer');
const { askGroq, getCropRecommendations } = require('../services/groqService');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ✅ Setup multer for image upload
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

/**
 * POST /api/ai/crop-recommendations
 * Get crop recommendations based on location
 */
router.post('/crop-recommendations', async (req, res) => {
  try {
    const { location, soilType, season } = req.body;

    console.log('🌱 Getting crop recommendations for:', location?.city);

    if (!location || !location.city) {
      return res.status(400).json({
        success: false,
        error: 'Location with city is required'
      });
    }

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
 * POST /api/ai/daily-tasks
 * Generate daily tasks for a crop
 */
router.post('/daily-tasks', async (req, res) => {
  try {
    const { cropName, plantingDate, currentDay, farmingType, weatherData } = req.body;

    if (!cropName || !plantingDate) {
      return res.status(400).json({
        success: false,
        error: 'Crop name and planting date are required'
      });
    }

    res.json({
      success: true,
      message: '📅 Daily tasks generation coming soon!',
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
 * Diagnose crop disease from image using AI
 */
router.post('/disease-diagnosis', upload.single('image'), async (req, res) => {
  try {
    const { cropName, cropId } = req.body;
    const image = req.file;

    console.log('🔬 Disease diagnosis request for:', cropName);

    if (!image) {
      return res.status(400).json({
        success: false,
        error: 'Image is required'
      });
    }

    if (!cropName) {
      return res.status(400).json({
        success: false,
        error: 'Crop name is required'
      });
    }

    // ✅ Convert image to base64 for AI processing
    const base64Image = image.buffer.toString('base64');
    const imageSize = (image.size / 1024).toFixed(2);
    console.log(`📸 Image received: ${imageSize} KB`);

    // ✅ Create AI prompt for disease detection
    const prompt = `You are an expert agricultural pathologist. Analyze this ${cropName} plant image and:

1. Identify if there are any diseases, pests, or deficiencies
2. If disease found, provide:
   - Disease name (common and scientific)
   - Severity (mild, moderate, severe)
   - Affected area (leaves, stem, roots, fruit)
   - Symptoms description
   - Causes
   - Treatment recommendations (organic and chemical)
   - Recommended pesticides (3-5 specific names)
   - Prevention tips

3. If plant is healthy, respond with: {"isHealthy": true, "message": "Plant appears healthy"}

Respond in JSON format with these exact fields:
{
  "isHealthy": false,
  "diseaseName": "Disease name",
  "scientificName": "Scientific name",
  "severity": "mild/moderate/severe",
  "affectedArea": "leaves/stem/roots/fruit",
  "symptoms": "Detailed symptoms",
  "causes": "What causes this",
  "treatment": "Treatment steps",
  "pesticides": ["pesticide1", "pesticide2", "pesticide3"],
  "prevention": "Prevention tips",
  "confidence": 0.85
}`;

    console.log('🤖 Sending to Groq AI for analysis...');

    // ✅ Call Groq AI (image analysis through text prompt)
    const aiResponse = await askGroq(prompt);

    console.log('✅ AI Response received');

    // ✅ Parse AI response
    let diagnosis;
    try {
      // Try to extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        diagnosis = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback parsing
        diagnosis = JSON.parse(aiResponse);
      }
    } catch (parseError) {
      console.error('❌ Error parsing AI response:', parseError);
      
      // Fallback response if parsing fails
      diagnosis = {
        isHealthy: false,
        diseaseName: "Unable to Identify",
        severity: "unknown",
        symptoms: aiResponse,
        treatment: "Please consult an agricultural expert for proper diagnosis.",
        confidence: 0.5
      };
    }

    console.log('📊 Diagnosis result:', diagnosis.isHealthy ? 'Healthy' : diagnosis.diseaseName);

    res.json({
      success: true,
      diagnosis,
      cropName,
      cropId,
      timestamp: new Date().toISOString()
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

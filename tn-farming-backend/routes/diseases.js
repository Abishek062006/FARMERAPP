const express = require('express');
const router = express.Router();
console.log('🔥 DISEASES ROUTES LOADED!');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Python AI Service URL
const AI_SERVICE_URL = 'http://localhost:5001';

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/diseases/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `disease_${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

/**
 * POST /api/disease/detect
 * Detect disease using Python AI service
 */
router.post('/detect', upload.single('image'), async (req, res) => {
  try {
    console.log('\n🔍 === DISEASE DETECTION REQUEST ===');
    
    if (!req.file) {
      console.log('❌ No file received');
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    console.log('📸 File received:', req.file.filename);
    console.log('📸 File size:', req.file.size, 'bytes');

    // Check if Python AI service is running
    try {
      await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 5000 });
      console.log('✅ Python AI service is running');
    } catch (error) {
      console.error('❌ Python AI service not running!');
      console.error('💡 Start it: cd ai-service && python app.py');
      
      // Clean up uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(503).json({
        success: false,
        message: 'AI service unavailable. Please start Python AI server.',
        error: 'Python AI service down'
      });
    }

    // Create form data for Python service
    const formData = new FormData();
    formData.append('image', fs.createReadStream(req.file.path));

    console.log('🤖 Calling Python AI service...');

    // Call Python AI service
    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/predict`,
      formData,
      {
        headers: {
          ...formData.getHeaders()
        },
        timeout: 30000, // 30 seconds
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    console.log('✅ Python AI response received');

    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
      console.log('🗑️  Temp file deleted');
    }

    // Format response for frontend
    const prediction = aiResponse.data.prediction;
    const primaryDisease = prediction.primary_disease;
    
    const responseData = {
      healthy: prediction.healthy,
      healthScore: prediction.healthScore,
      confidence: prediction.confidence,
      plantName: primaryDisease.name.split(' - ')[0] || 'Unknown Plant',
      diseases: prediction.healthy ? [] : [{
        name: primaryDisease.name,
        commonNames: [primaryDisease.scientific],
        probability: primaryDisease.confidence,
        description: primaryDisease.description,
        cause: primaryDisease.symptoms,
        treatment: primaryDisease.treatment,
        url: null
      }],
      alternatives: prediction.alternatives || []
    };

    console.log(`🎯 Final diagnosis: ${responseData.healthy ? 'Healthy' : responseData.diseases[0]?.name} (${responseData.confidence}%)`);
    console.log('✅ === DETECTION COMPLETE ===\n');

    res.json({
      success: true,
      data: responseData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Detection error:', error.message);
    
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Disease detection failed',
      error: error.response?.data?.error || error.message
    });
  }
});

/**
 * GET /api/disease/test
 * Test AI service connection
 */
router.get('/test', async (req, res) => {
  try {
    const aiHealth = await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 5000 });
    
    res.json({
      success: true,
      backend: 'running',
      aiService: aiHealth.data,
      message: 'AI Disease Detection Ready!'
    });
    
  } catch (error) {
    res.json({
      success: false,
      backend: 'running',
      aiService: 'not running',
      message: 'Start Python AI: cd ai-service && python app.py',
      error: error.message
    });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
console.log('🔥 DISEASES ROUTES LOADED!');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { requireAuth } = require('../middleware/auth');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5001';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/diseases/';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `disease_${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files are allowed'));
  }
});

/**
 * normalizeDiseaseNameForPesticide
 * ─────────────────────────────────
 * Converts ANY raw class name from the PlantVillage-trained model
 * into the key format used in pesticide_rules.py.
 *
 * Examples from your training folder:
 *   "Tomato___Early_blight"              → "Tomato_Early_blight"
 *   "Tomato__Target_Spot"                → "Tomato_Target_Spot"
 *   "Tomato__Tomato_YellowLeaf__Curl_Virus" → "Tomato_Tomato_YellowLeaf_Curl_Virus"
 *   "Pepper__bell___Bacterial_spot"      → "Pepper_bell_Bacterial_spot"
 *   "Corn_(maize)___Common_rust_"        → "Corn_(maize)_Common_rust"
 *   "Apple___Apple_scab"                 → "Apple_Apple_scab"
 *   "Cherry_(including_sour)___Powdery_mildew" → "Cherry_(including_sour)_Powdery_mildew"
 */
function normalizeDiseaseNameForPesticide(rawName) {
  if (!rawName) return '';

  let n = rawName;

  // Step 1: Replace triple underscores → single
  n = n.replace(/_{3}/g, '_');

  // Step 2: Replace any remaining double underscores → single
  n = n.replace(/_{2}/g, '_');

  // Step 3: Strip leading and trailing underscores
  n = n.replace(/^_+|_+$/g, '');

  console.log(`🔄 Normalized: "${rawName}" → "${n}"`);
  return n;
}

// ─────────────────────────────────────────────────────────────
// POST /api/diseases   ← This is what handleSaveDisease calls
// ─────────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    console.log('💾 Saving disease:', req.body.diseaseName);
    const Disease = require('../models/Disease');

    const newRecord = new Disease({
      firebaseUid: req.firebaseUid,
      cropId:      req.body.cropId,
      diseaseName: req.body.diseaseName,
      severity:    req.body.severity    || 'moderate',
      affectedArea:req.body.affectedArea|| 'leaves',
      confidence:  req.body.confidence  || 0,
      pesticides:  req.body.pesticides  || [],
      treatment:   req.body.treatment   || '',
      symptoms:    req.body.symptoms    || '',
      imageUrl:    req.body.imageUrl    || '',
      status: 'active'
    });

    await newRecord.save();
    console.log('✅ Disease saved:', newRecord._id);
    res.json({ success: true, disease: newRecord });

  } catch (err) {
    console.error('❌ Save disease error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/diseases/crop/:cropId
// ─────────────────────────────────────────────────────────────
router.get('/crop/:cropId', requireAuth, async (req, res) => {
  try {
    const Crop = require('../models/Crop');
    const crop = await Crop.findById(req.params.cropId);
    if (!crop) {
      return res.status(404).json({ success: false, error: 'Crop not found' });
    }
    if (crop.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, error: 'Not authorized to view diseases for this crop' });
    }

    const Disease = require('../models/Disease');
    const diseases = await Disease.find({ cropId: req.params.cropId }).sort({ createdAt: -1 });
    res.json({ success: true, diseases });
  } catch (err) {
    console.error('❌ Fetch diseases error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/diseases/detect
// ─────────────────────────────────────────────────────────────
router.post('/detect', requireAuth, upload.single('image'), async (req, res) => {
  try {
    console.log('\n🔍 === DISEASE DETECTION REQUEST ===');

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }

    console.log('📸 File:', req.file.filename, '|', req.file.size, 'bytes');

    // Check Python AI service
    try {
      await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 5000 });
      console.log('✅ Python AI service running');
    } catch {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(503).json({
        success: false,
        message: 'AI service unavailable. Please start Python AI server.',
        error: 'Python AI service down'
      });
    }

    // Forward image to Python
    const formData = new FormData();
    formData.append('image', fs.createReadStream(req.file.path));

    const aiResponse = await axios.post(`${AI_SERVICE_URL}/predict`, formData, {
      headers: { ...formData.getHeaders() },
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    // Cleanup
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
      console.log('🗑️  Temp file deleted');
    }

    const prediction = aiResponse.data.prediction || {};
    const primary    = prediction.primary || {};

    const diseaseName = primary.class || 'Unknown Disease';
    const confidence  = primary.confidence ?? prediction.confidence ?? 0;

    const responseData = {
      healthy:     prediction.healthy ?? false,
      healthScore: prediction.healthScore ?? null,
      confidence,
      plantName: (primary.class || 'Unknown Plant').split(' - ')[0],
      diseases: prediction.healthy ? [] : [{
        name:        diseaseName,
        commonNames: [primary.class || 'Unknown'],
        probability: confidence,
        description: primary.description || 'No description available',
        cause:       primary.symptoms    || 'No symptoms data',
        treatment:   primary.treatment   || 'No treatment data',
        url: null
      }],
      alternatives: prediction.alternatives || prediction.top_3 || []
    };

    // ── Pesticide calculation ──────────────────────────────
    let pesticideData = null;
    const normalizedName = normalizeDiseaseNameForPesticide(diseaseName);

    try {
      const pesticideResponse = await axios.post(
        `${AI_SERVICE_URL}/pesticide`,
        {
          disease:    normalizedName,
          area_sqft:  Number(req.body.area_sqft) || 1000,
          severity:   req.body.severity || 'moderate'
        },
        { timeout: 10000 }
      );

      pesticideData = pesticideResponse.data.recommendation;
      console.log('✅ Pesticide:', pesticideData);

    } catch (err) {
      console.log('⚠️  Pesticide failed:', err.message);
      console.log('⚠️  Tried key:', normalizedName);
    }

    console.log(`🎯 Result: ${responseData.healthy ? 'Healthy' : diseaseName} (${confidence}%)`);
    console.log('✅ === DETECTION COMPLETE ===\n');

    res.json({
      success: true,
      data: { ...responseData, pesticide: pesticideData },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Detection error:', error.message);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({
      success: false,
      message: 'Disease detection failed',
      error: error.response?.data?.error || error.message
    });
  }
});

// GET /api/diseases/test
router.get('/test', async (req, res) => {
  try {
    const aiHealth = await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 5000 });
    res.json({ success: true, backend: 'running', aiService: aiHealth.data });
  } catch (error) {
    res.json({ success: false, backend: 'running', aiService: 'not running', error: error.message });
  }
});

// POST /api/diseases/save  (legacy alias)
router.post('/save', requireAuth, async (req, res) => {
  try {
    const Disease = require('../models/Disease');
    const newRecord = new Disease({
      firebaseUid: req.firebaseUid,
      cropId:      req.body.cropId,
      diseaseName: req.body.diseaseName,
      severity:    req.body.severity    || 'moderate',
      confidence:  req.body.confidence  || 0,
      pesticides:  req.body.pesticides  || [],
      treatment:   req.body.treatment   || '',
      symptoms:    req.body.symptoms    || '',
      status: 'active'
    });
    await newRecord.save();
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Save (/save) error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
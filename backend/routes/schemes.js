const express = require('express');
const router = express.Router();
const schemes = require('../data/schemesData');
const SchemeImage = require('../models/SchemeImage');

// GET /api/schemes?level=state|central — level filter is optional
router.get('/', (req, res) => {
  const { level } = req.query;
  const data = level ? schemes.filter((s) => s.level === level) : schemes;
  res.json({ success: true, schemes: data });
});

// GET /api/schemes/image/:key — serves a department logo stored in MongoDB
// (see models/SchemeImage.js + scripts/seedSchemeImages.js)
router.get('/image/:key', async (req, res) => {
  try {
    const image = await SchemeImage.findOne({ key: req.params.key });
    if (!image) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }
    res.set('Content-Type', image.contentType);
    res.set('Cache-Control', 'public, max-age=604800'); // 7 days — these rarely change
    res.send(image.data);
  } catch (err) {
    console.error('❌ Error serving scheme image:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load image' });
  }
});

module.exports = router;

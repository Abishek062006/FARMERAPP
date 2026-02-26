const express = require('express');
const router  = express.Router();
const CropListing = require('../models/CropListing');

// POST — farmer creates listing
router.post('/', async (req, res) => {
  try {
    const { cropId, farmerUid, farmerName, farmerPhone,
            cropName, quantityKg, pricePerKg, location } = req.body;

    const listing = new CropListing({
      cropId, farmerUid, farmerName, farmerPhone,
      cropName, quantityKg, pricePerKg,
      totalPrice: quantityKg * pricePerKg,
      location,
    });

    await listing.save();
    console.log('✅ Listing created:', listing._id);
    res.status(201).json({ success: true, listing });
  } catch (err) {
    console.error('❌ Create listing error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET all available listings by city/district
router.get('/', async (req, res) => {
  try {
    const { city } = req.query;
    const filter = { status: 'available' };

    if (city) {
      filter['$or'] = [
        { 'location.city':     { $regex: city, $options: 'i' } },
        { 'location.district': { $regex: city, $options: 'i' } },
      ];
    }

    const listings = await CropListing.find(filter).sort({ createdAt: -1 });
    console.log('📦 Found listings:', listings.length);
    res.json({ success: true, listings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET farmer's pending + confirmed deals
router.get('/farmer/:farmerUid', async (req, res) => {
  try {
    const listings = await CropListing.find({
      farmerUid: req.params.farmerUid,
      status: { $in: ['pending', 'confirmed'] },
    }).sort({ updatedAt: -1 });
    res.json({ success: true, listings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET vendor's accepted + confirmed deals
router.get('/vendor/:vendorUid', async (req, res) => {
  try {
    const listings = await CropListing.find({
      vendorUid: req.params.vendorUid,
      status: { $in: ['pending', 'confirmed'] },
    }).sort({ updatedAt: -1 });
    res.json({ success: true, listings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT vendor accepts → status becomes 'pending', farmer gets notified
router.put('/:id/accept', async (req, res) => {
  try {
    const { vendorUid, vendorName, vendorPhone, vendorCompany } = req.body;
    const listing = await CropListing.findById(req.params.id);

    if (!listing) return res.status(404).json({ success: false, error: 'Listing not found' });
    if (listing.status !== 'available') return res.status(400).json({ success: false, error: 'Listing no longer available' });

    listing.status        = 'pending';
    listing.vendorUid     = vendorUid;
    listing.vendorName    = vendorName;
    listing.vendorPhone   = vendorPhone || null;
    listing.vendorCompany = vendorCompany || null;
    listing.acceptedAt    = new Date();
    await listing.save();

    console.log('✅ Vendor expressed interest:', vendorUid);
    res.json({ success: true, listing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT farmer confirms → status becomes 'confirmed', deal is done
router.put('/:id/confirm', async (req, res) => {
  try {
    const listing = await CropListing.findById(req.params.id);

    if (!listing) return res.status(404).json({ success: false, error: 'Listing not found' });
    if (listing.status !== 'pending') return res.status(400).json({ success: false, error: 'No pending offer on this listing' });

    listing.status      = 'confirmed';
    listing.confirmedAt = new Date();
    await listing.save();

    console.log('✅ Farmer confirmed deal:', listing._id);
    res.json({ success: true, listing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT farmer declines → listing goes back to 'available'
router.put('/:id/decline', async (req, res) => {
  try {
    const listing = await CropListing.findById(req.params.id);

    if (!listing) return res.status(404).json({ success: false, error: 'Listing not found' });

    listing.status        = 'available';
    listing.vendorUid     = null;
    listing.vendorName    = null;
    listing.vendorPhone   = null;
    listing.vendorCompany = null;
    listing.acceptedAt    = null;
    await listing.save();

    console.log('❌ Farmer declined deal:', listing._id);
    res.json({ success: true, listing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

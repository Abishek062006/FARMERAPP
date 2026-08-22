const express = require('express');
const router = express.Router();
const Crop = require('../models/Crop');
const Land = require('../models/Land');
const Plot = require('../models/Plot');
const CropListing = require('../models/CropListing');
const ListingImage = require('../models/ListingImage');
const mongoose = require('mongoose');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { resolveDistrict } = require('../services/geoService');

// memoryStorage, not diskStorage: the proof photo goes straight into Mongo
// (see models/ListingImage.js), so it never needs to touch the filesystem.
const uploadProof = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files are allowed')),
});

/**
 * POST /api/crops
 * Register a new crop (linked to land and plot)
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      landId,
      plotId,
      name,
      tamilName,
      variety,
      plantingDate,
      duration,
      quantity,
      unit,
      notes
    } = req.body;
    const firebaseUid = req.firebaseUid;

    console.log('🌱 Registering new crop:', name);

    // Validate required fields
    if (!firebaseUid || !landId || !name || !tamilName || !plantingDate || !duration || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Verify land exists and belongs to the caller
    const land = await Land.findById(landId);
    if (!land) {
      return res.status(404).json({
        success: false,
        message: 'Land not found'
      });
    }
    if (land.firebaseUid !== firebaseUid) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add a crop to this land'
      });
    }

    // Verify plot exists (if provided)
    if (plotId) {
      const plot = await Plot.findById(plotId);
      if (!plot) {
        return res.status(404).json({
          success: false,
          message: 'Plot not found'
        });
      }

      // Check if plot already has a crop
      if (plot.cropId && plot.status === 'active') {
        return res.status(400).json({
          success: false,
          message: 'This plot already has an active crop'
        });
      }
    }

    // Calculate expected harvest date
    const planting = new Date(plantingDate);
    const expectedHarvest = new Date(planting);
    expectedHarvest.setDate(planting.getDate() + duration);

    // Create new crop
    const newCrop = new Crop({
      firebaseUid,
      landId,
      plotId: plotId || null,
      name,
      tamilName,
      variety: variety || 'Standard',
      plantingDate: planting,
      expectedHarvestDate: expectedHarvest,
      duration,
      quantity,
      unit: unit || 'plants',
      currentStage: 'germination',
      daysElapsed: 0,
      healthScore: 100,
      notes: notes || '',
      isActive: true,
      isHarvested: false
    });

    await newCrop.save();

    // Update plot status and link crop (if plot provided)
    if (plotId) {
      await Plot.findByIdAndUpdate(plotId, {
        $set: {
          cropId: newCrop._id,
          status: 'active'
        }
      });
    }

    console.log('✅ Crop registered:', newCrop._id);

    res.status(201).json({
      success: true,
      message: 'Crop registered successfully',
      crop: newCrop
    });

  } catch (error) {
    console.error('❌ Error registering crop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register crop',
      error: error.message
    });
  }
});


/**
 * GET /api/crops/:firebaseUid
 * Get all crops for a user
 */
router.get('/:firebaseUid', requireAuth, async (req, res) => {
  try {
    const { firebaseUid } = req.params;
    const { active } = req.query; // Optional filter: ?active=true

    if (firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to view these crops' });
    }

    console.log('🌾 Fetching crops for user:', firebaseUid);

    const filter = { firebaseUid };
    if (active === 'true') {
      filter.isActive = true;
    }

    const crops = await Crop.find(filter)
      .populate('landId')
      .populate('plotId')
      .sort({ plantingDate: -1 });

    res.json({
      success: true,
      count: crops.length,
      crops
    });

  } catch (error) {
    console.error('❌ Error fetching crops:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch crops',
      error: error.message
    });
  }
});


/**
 * GET /api/crops/land/:landId
 * Get all crops for a specific land
 */
router.get('/land/:landId', requireAuth, async (req, res) => {
  try {
    const { landId } = req.params;

    const land = await Land.findById(landId);
    if (!land) {
      return res.status(404).json({ success: false, message: 'Land not found' });
    }
    if (land.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to view crops for this land' });
    }

    console.log('🌾 Fetching crops for land:', landId);

    const crops = await Crop.find({ landId, isActive: true })
      .populate('plotId')
      .sort({ plantingDate: -1 });

    res.json({
      success: true,
      count: crops.length,
      crops
    });

  } catch (error) {
    console.error('❌ Error fetching crops:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch crops',
      error: error.message
    });
  }
});


/**
 * GET /api/crops/details/:cropId
 * Get single crop details
 */
router.get('/details/:cropId', requireAuth, async (req, res) => {
  try {
    const { cropId } = req.params;

    console.log('🔍 Fetching crop details:', cropId);

    const crop = await Crop.findById(cropId)
      .populate('landId')
      .populate('plotId');

    if (!crop) {
      return res.status(404).json({
        success: false,
        message: 'Crop not found'
      });
    }

    if (crop.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this crop' });
    }

    // Calculate days elapsed and remaining
    const today = new Date();
    const plantingDate = new Date(crop.plantingDate);
    const daysElapsed = Math.floor((today - plantingDate) / (1000 * 60 * 60 * 24));
    const daysRemaining = crop.duration - daysElapsed;

    res.json({
      success: true,
      crop: {
        ...crop.toObject(),
        daysElapsed,
        daysRemaining: Math.max(0, daysRemaining)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching crop details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch crop details',
      error: error.message
    });
  }
});


/**
 * PUT /api/crops/:cropId
 * Update crop information
 */
router.put('/:cropId', requireAuth, async (req, res) => {
  try {
    const { cropId } = req.params;
    const updates = req.body;

    console.log('✏️ Updating crop:', cropId);

    const existingCrop = await Crop.findById(cropId);
    if (!existingCrop) {
      return res.status(404).json({ success: false, message: 'Crop not found' });
    }
    if (existingCrop.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this crop' });
    }

    // Don't allow changing firebaseUid, landId, plotId
    delete updates.firebaseUid;
    delete updates.landId;
    delete updates.plotId;

    // Recalculate expected harvest date if duration or planting date changed
    if (updates.duration || updates.plantingDate) {
      const crop = existingCrop;
      const plantingDate = updates.plantingDate ? new Date(updates.plantingDate) : crop.plantingDate;
      const duration = updates.duration || crop.duration;
      
      const expectedHarvest = new Date(plantingDate);
      expectedHarvest.setDate(plantingDate.getDate() + duration);
      updates.expectedHarvestDate = expectedHarvest;
    }

    const updatedCrop = await Crop.findByIdAndUpdate(
      cropId,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('landId').populate('plotId');

    if (!updatedCrop) {
      return res.status(404).json({
        success: false,
        message: 'Crop not found'
      });
    }

    res.json({
      success: true,
      message: 'Crop updated successfully',
      crop: updatedCrop
    });

  } catch (error) {
    console.error('❌ Error updating crop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update crop',
      error: error.message
    });
  }
});


/**
 * PUT /api/crops/:cropId/harvest
 * Mark a crop as harvested
 */
router.put('/:cropId/harvest', requireAuth, async (req, res) => {
  try {
    const { cropId } = req.params;
    const { actualYield } = req.body;

    console.log('🌾 Marking crop as harvested:', cropId);

    const crop = await Crop.findById(cropId);

    if (!crop) {
      return res.status(404).json({
        success: false,
        message: 'Crop not found'
      });
    }

    if (crop.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to harvest this crop' });
    }

    if (crop.isHarvested) {
      return res.status(400).json({
        success: false,
        message: 'Crop already harvested'
      });
    }

    // Update crop
    crop.isHarvested = true;
    crop.isActive = false;
    crop.harvestDate = new Date();
    crop.currentStage = 'completed';
    // Two bugs lived here:
    //   1. `if (actualYield)` — the app sends {actualYield: 0}, which is
    //      falsy, so a real yield was never persisted for anyone.
    //   2. the schema declares actualYield as {value, unit}, but this
    //      assigned the raw Number, so even a truthy value stored wrong.
    if (actualYield !== undefined && actualYield !== null && actualYield !== '') {
      crop.actualYield = { value: Number(actualYield), unit: 'kg' };
    }

    await crop.save();

    // Update plot status
    if (crop.plotId) {
      await Plot.findByIdAndUpdate(crop.plotId, {
        $set: {
          status: 'harvested',
          cropId: null
        }
      });
    }

    console.log('✅ Crop harvested successfully');

    res.json({
      success: true,
      message: 'Crop harvested successfully',
      crop
    });

  } catch (error) {
    console.error('❌ Error harvesting crop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to harvest crop',
      error: error.message
    });
  }
});


/**
 * POST /api/crops/:cropId/harvest-and-list
 * Harvest a crop AND put it on the Farm Market in one step.
 *
 * multipart/form-data:
 *   proof           (file, required)  harvest proof photo
 *   actualYieldKg   what actually came off the field
 *   quantityKg      how much of it to sell        (<= actualYieldKg)
 *   minOrderKg      smallest order a vendor may place (<= quantityKg)
 *   pricePerKg
 *   gradeNote, notes (optional)
 *
 * This replaces the old "Mark as Harvested" button. Harvesting could not
 * simply be dropped: without it crop.isActive stays true and the plot keeps
 * {status:'active', cropId}, which trips the reuse guard in POST /api/crops
 * and makes the plot permanently unusable.
 *
 * Wrapped in a transaction because it spans four collections (Crop, Plot,
 * CropListing, ListingImage) and a partial failure is exactly what strands a
 * plot. Atlas is a replica set, so withTransaction is available.
 */
router.post('/:cropId/harvest-and-list', requireAuth, requireRole('farmer'), uploadProof.single('proof'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { cropId } = req.params;
    const { gradeNote = '', notes = '' } = req.body;

    // multer gives every text field as a string.
    const yieldKg  = Number(req.body.actualYieldKg);
    const qty      = Number(req.body.quantityKg);
    const price    = Number(req.body.pricePerKg);
    const minOrder = Number(req.body.minOrderKg || 1);

    const crop = await Crop.findById(cropId);
    if (!crop) return res.status(404).json({ success: false, message: 'Crop not found' });
    if (crop.firebaseUid !== req.firebaseUid)
      return res.status(403).json({ success: false, message: 'Not authorized to harvest this crop' });
    if (crop.isHarvested)
      return res.status(400).json({ success: false, message: 'This crop has already been harvested' });

    const land = await Land.findById(crop.landId).lean();
    if (!land || !land.location || !land.location.coordinates)
      return res.status(400).json({ success: false, message: 'This crop has no land record, so vendors would have no pickup point' });

    // Every rule is enforced here, never on the client.
    if (!(yieldKg > 0))
      return res.status(400).json({ success: false, message: 'Enter how many kg you harvested' });
    if (!(qty > 0) || qty > yieldKg)
      return res.status(400).json({ success: false, message: 'You cannot list more than you harvested' });
    if (!(price > 0))
      return res.status(400).json({ success: false, message: 'Enter a price per kg' });
    if (!(minOrder > 0) || minOrder > qty)
      return res.status(400).json({ success: false, message: 'Minimum order must be between 1 kg and the quantity you are listing' });
    if (!req.file)
      return res.status(400).json({ success: false, message: 'A harvest proof photo is required' });

    const { lat, lng } = land.location.coordinates;
    // The stored district is a neighbourhood name on most records, so fall
    // back to deriving it from the (reliable) land coordinates.
    const district = resolveDistrict(land.location.district, { lat, lng });

    let listing;
    await session.withTransaction(async () => {
      crop.isHarvested  = true;
      crop.isActive     = false;
      crop.harvestDate  = new Date();
      crop.currentStage = 'completed';
      crop.actualYield  = { value: yieldKg, unit: 'kg' };
      await crop.save({ session });

      if (crop.plotId) {
        await Plot.findByIdAndUpdate(crop.plotId,
          { $set: { status: 'harvested', cropId: null } }, { session });
      }

      const created = await CropListing.create([{
        cropId: crop._id,
        landId: land._id,
        farmerUid: req.firebaseUid,
        // From the verified profile, not the request body.
        farmerName: req.profile.name,
        farmerPhone: req.profile.phone,
        cropName: crop.name,
        cropTamilName: crop.tamilName,
        variety: crop.variety,
        harvestedAt: crop.harvestDate,
        actualYieldKg: yieldKg,
        quantityKg: qty,
        quantityAvailableKg: qty,
        minOrderKg: minOrder,
        pricePerKg: price,
        totalPrice: qty * price,
        gradeNote: String(gradeNote).slice(0, 120),
        notes: String(notes).slice(0, 500),
        location: {
          city: land.location.city,
          district,
          state: land.location.state || 'Tamil Nadu',
          address: land.location.address || '',
          lat,
          lng,
        },
      }], { session });
      listing = created[0];

      const img = await ListingImage.create([{
        listingId: listing._id,
        ownerUid: req.firebaseUid,
        contentType: req.file.mimetype,
        data: req.file.buffer,
      }], { session });

      listing.proofImageId = img[0]._id;
      await listing.save({ session });
    });

    console.log('🌾 Harvested + listed:', crop.name, `${qty}kg @ ₹${price}/kg in ${district}`);
    res.status(201).json({ success: true, message: 'Harvest posted to the Farm Market', listing });

  } catch (error) {
    console.error('❌ harvest-and-list failed:', error);
    res.status(500).json({ success: false, message: 'Could not post your harvest', error: error.message });
  } finally {
    await session.endSession();
  }
});


/**
 * PUT /api/crops/:cropId/stage
 * Update crop growth stage
 */
router.put('/:cropId/stage', requireAuth, async (req, res) => {
  try {
    const { cropId } = req.params;
    const { stage } = req.body;

    console.log('🌱 Updating crop stage:', cropId, '->', stage);

    const validStages = ['germination', 'vegetative', 'flowering', 'fruiting', 'harvest', 'completed'];

    if (!validStages.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stage. Must be one of: ${validStages.join(', ')}`
      });
    }

    const existingCrop = await Crop.findById(cropId);
    if (!existingCrop) {
      return res.status(404).json({ success: false, message: 'Crop not found' });
    }
    if (existingCrop.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this crop' });
    }

    const updatedCrop = await Crop.findByIdAndUpdate(
      cropId,
      { $set: { currentStage: stage } },
      { new: true }
    );

    if (!updatedCrop) {
      return res.status(404).json({
        success: false,
        message: 'Crop not found'
      });
    }

    res.json({
      success: true,
      message: 'Crop stage updated',
      crop: updatedCrop
    });

  } catch (error) {
    console.error('❌ Error updating crop stage:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update crop stage',
      error: error.message
    });
  }
});


/**
 * DELETE /api/crops/:cropId
 * Delete a crop (soft delete - set isActive to false)
 */
router.delete('/:cropId', requireAuth, async (req, res) => {
  try {
    const { cropId } = req.params;

    console.log('🗑️ Deleting crop:', cropId);

    const existingCrop = await Crop.findById(cropId);
    if (!existingCrop) {
      return res.status(404).json({
        success: false,
        message: 'Crop not found'
      });
    }
    if (existingCrop.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this crop' });
    }

    const crop = await Crop.findByIdAndUpdate(
      cropId,
      { $set: { isActive: false } },
      { new: true }
    );

    // Update plot status
    if (crop.plotId) {
      await Plot.findByIdAndUpdate(crop.plotId, {
        $set: {
          status: 'fallow',
          cropId: null
        }
      });
    }

    res.json({
      success: true,
      message: 'Crop deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting crop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete crop',
      error: error.message
    });
  }
});


module.exports = router;

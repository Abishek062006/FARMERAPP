const express = require('express');
const router = express.Router();
const Crop = require('../models/Crop');
const Land = require('../models/Land');
const Plot = require('../models/Plot');

/**
 * POST /api/crops
 * Register a new crop (linked to land and plot)
 */
router.post('/', async (req, res) => {
  try {
    const {
      firebaseUid,
      landId,
      plotId,
      name,
      tamilName,
      variety,
      plantingDate,
      duration,
      quantity,
      unit,
      farmingType,
      containerType,
      containerSize,
      location,
      notes
    } = req.body;

    console.log('🌱 Registering new crop:', name);

    // Validate required fields
    if (!firebaseUid || !landId || !name || !tamilName || !plantingDate || !duration || !quantity || !farmingType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Verify land exists
    const land = await Land.findById(landId);
    if (!land) {
      return res.status(404).json({
        success: false,
        message: 'Land not found'
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
      farmingType,
      containerType: containerType || null,
      containerSize: containerSize || null,
      location: location || null,
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
router.get('/:firebaseUid', async (req, res) => {
  try {
    const { firebaseUid } = req.params;
    const { active } = req.query; // Optional filter: ?active=true

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
router.get('/land/:landId', async (req, res) => {
  try {
    const { landId } = req.params;

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
router.get('/details/:cropId', async (req, res) => {
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
router.put('/:cropId', async (req, res) => {
  try {
    const { cropId } = req.params;
    const updates = req.body;

    console.log('✏️ Updating crop:', cropId);

    // Don't allow changing firebaseUid, landId, plotId
    delete updates.firebaseUid;
    delete updates.landId;
    delete updates.plotId;

    // Recalculate expected harvest date if duration or planting date changed
    if (updates.duration || updates.plantingDate) {
      const crop = await Crop.findById(cropId);
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
router.put('/:cropId/harvest', async (req, res) => {
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
    if (actualYield) {
      crop.actualYield = actualYield;
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
 * PUT /api/crops/:cropId/stage
 * Update crop growth stage
 */
router.put('/:cropId/stage', async (req, res) => {
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
router.delete('/:cropId', async (req, res) => {
  try {
    const { cropId } = req.params;

    console.log('🗑️ Deleting crop:', cropId);

    const crop = await Crop.findByIdAndUpdate(
      cropId,
      { $set: { isActive: false } },
      { new: true }
    );

    if (!crop) {
      return res.status(404).json({
        success: false,
        message: 'Crop not found'
      });
    }

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

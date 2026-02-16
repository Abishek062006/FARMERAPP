const express = require('express');
const router = express.Router();
const Land = require('../models/Land');
const Plot = require('../models/Plot');
const Crop = require('../models/Crop');

/**
 * POST /api/lands
 * Create a new land
 */
router.post('/', async (req, res) => {
  try {
    const {
      firebaseUid,
      landName,
      location,
      size,
      waterSource,
      soilType,
      farmingType,
      photos,
      notes
    } = req.body;

    console.log('🌾 Creating new land for user:', firebaseUid);

    // Validate required fields
    if (!firebaseUid || !landName || !location || !size || !waterSource || !soilType || !farmingType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Validate farming type
    if (!['normal', 'organic', 'terrace'].includes(farmingType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid farming type. Must be: normal, organic, or terrace'
      });
    }

    // Create new land
    const newLand = new Land({
      firebaseUid,
      landName,
      location,
      size,
      waterSource,
      soilType,
      farmingType,
      photos: photos || [],
      notes: notes || '',
      totalPlots: 0,
      isActive: true
    });

    await newLand.save();

    console.log('✅ Land created:', newLand._id);

    res.status(201).json({
      success: true,
      message: 'Land registered successfully',
      land: newLand
    });

  } catch (error) {
    console.error('❌ Error creating land:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create land',
      error: error.message
    });
  }
});


/**
 * GET /api/lands/:firebaseUid
 * Get all lands for a user
 */
router.get('/:firebaseUid', async (req, res) => {
  try {
    const { firebaseUid } = req.params;

    console.log('📍 Fetching lands for user:', firebaseUid);

    const lands = await Land.find({ 
      firebaseUid, 
      isActive: true 
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: lands.length,
      lands
    });

  } catch (error) {
    console.error('❌ Error fetching lands:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lands',
      error: error.message
    });
  }
});


/**
 * GET /api/lands/details/:landId
 * Get single land details with crops and plots
 */
router.get('/details/:landId', async (req, res) => {
  try {
    const { landId } = req.params;

    console.log('🔍 Fetching land details:', landId);

    const land = await Land.findById(landId);

    if (!land) {
      return res.status(404).json({
        success: false,
        message: 'Land not found'
      });
    }

    // Get all plots for this land
    const plots = await Plot.find({ landId }).populate('cropId');

    // Get all crops for this land
    const crops = await Crop.find({ landId, isActive: true });

    res.json({
      success: true,
      land,
      plots,
      crops,
      totalPlots: plots.length,
      activeCrops: crops.length
    });

  } catch (error) {
    console.error('❌ Error fetching land details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch land details',
      error: error.message
    });
  }
});


/**
 * PUT /api/lands/:landId
 * Update land information
 */
router.put('/:landId', async (req, res) => {
  try {
    const { landId } = req.params;
    const updates = req.body;

    console.log('✏️ Updating land:', landId);

    // Don't allow changing firebaseUid
    delete updates.firebaseUid;
    delete updates.totalPlots; // Managed automatically

    const updatedLand = await Land.findByIdAndUpdate(
      landId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedLand) {
      return res.status(404).json({
        success: false,
        message: 'Land not found'
      });
    }

    res.json({
      success: true,
      message: 'Land updated successfully',
      land: updatedLand
    });

  } catch (error) {
    console.error('❌ Error updating land:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update land',
      error: error.message
    });
  }
});


/**
 * DELETE /api/lands/:landId
 * Soft delete a land (set isActive to false)
 */
router.delete('/:landId', async (req, res) => {
  try {
    const { landId } = req.params;

    console.log('🗑️ Deleting land:', landId);

    // Check if land has active crops
    const activeCrops = await Crop.countDocuments({ 
      landId, 
      isActive: true 
    });

    if (activeCrops > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete land with ${activeCrops} active crop(s). Please harvest or remove crops first.`
      });
    }

    // Soft delete (set isActive to false)
    const deletedLand = await Land.findByIdAndUpdate(
      landId,
      { $set: { isActive: false } },
      { new: true }
    );

    if (!deletedLand) {
      return res.status(404).json({
        success: false,
        message: 'Land not found'
      });
    }

    res.json({
      success: true,
      message: 'Land deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting land:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete land',
      error: error.message
    });
  }
});


module.exports = router;

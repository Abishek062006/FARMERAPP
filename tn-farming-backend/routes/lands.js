const express = require('express');
const router = express.Router();
const Land = require('../models/Land');
const User = require('../models/User');

// @route   POST /api/lands
// @desc    Add new land
// @access  Public
router.post('/', async (req, res) => {
  try {
    console.log('📝 Adding new land...');
    console.log('Request body:', req.body);

    const {
      firebaseUid,
      name,
      size,
      location,
      soilType,
      waterSource,
      notes,
    } = req.body;

    // Validation
    if (!firebaseUid || !name || !size) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: firebaseUid, name, size',
      });
    }

    // Get user from database
    const user = await User.findOne({ firebaseUid });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Create new land
    const land = new Land({
      userId: user._id,
      firebaseUid,
      name,
      size: {
        value: size.value,
        unit: size.unit || 'acres',
      },
      location: location || {},
      soilType: soilType || 'loam',
      waterSource: waterSource || null,
      notes: notes || '',
    });

    await land.save();

    console.log('✅ Land added successfully:', land._id);

    res.status(201).json({
      success: true,
      message: 'Land added successfully',
      landId: land._id,
      land: {
        id: land._id,
        name: land.name,
        size: land.size,
        location: land.location,
        soilType: land.soilType,
        waterSource: land.waterSource,
        createdAt: land.createdAt,
      },
    });

  } catch (error) {
    console.error('❌ Add land error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message,
    });
  }
});

// @route   GET /api/lands/user/:firebaseUid
// @desc    Get all lands for a user
// @access  Public
router.get('/user/:firebaseUid', async (req, res) => {
  try {
    console.log('🔍 Fetching lands for user:', req.params.firebaseUid);

    const lands = await Land.find({ 
      firebaseUid: req.params.firebaseUid,
      isActive: true 
    }).sort({ createdAt: -1 });

    console.log('✅ Found', lands.length, 'lands');

    res.status(200).json({
      success: true,
      count: lands.length,
      lands: lands.map(land => ({
        id: land._id,
        name: land.name,
        size: land.size,
        location: land.location,
        soilType: land.soilType,
        waterSource: land.waterSource,
        images: land.images,
        notes: land.notes,
        createdAt: land.createdAt,
      })),
    });

  } catch (error) {
    console.error('❌ Get lands error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message,
    });
  }
});

// @route   GET /api/lands/:landId
// @desc    Get specific land details
// @access  Public
router.get('/:landId', async (req, res) => {
  try {
    console.log('🔍 Fetching land details:', req.params.landId);

    const land = await Land.findById(req.params.landId);

    if (!land) {
      return res.status(404).json({
        success: false,
        error: 'Land not found',
      });
    }

    console.log('✅ Land found:', land.name);

    res.status(200).json({
      success: true,
      land: {
        id: land._id,
        name: land.name,
        size: land.size,
        location: land.location,
        soilType: land.soilType,
        waterSource: land.waterSource,
        images: land.images,
        notes: land.notes,
        isActive: land.isActive,
        createdAt: land.createdAt,
        updatedAt: land.updatedAt,
      },
    });

  } catch (error) {
    console.error('❌ Get land error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message,
    });
  }
});

// @route   PUT /api/lands/:landId
// @desc    Update land
// @access  Public
router.put('/:landId', async (req, res) => {
  try {
    console.log('📝 Updating land:', req.params.landId);

    const land = await Land.findById(req.params.landId);

    if (!land) {
      return res.status(404).json({
        success: false,
        error: 'Land not found',
      });
    }

    // Update fields
    const updateFields = ['name', 'size', 'location', 'soilType', 'waterSource', 'notes'];
    
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        land[field] = req.body[field];
      }
    });

    await land.save();

    console.log('✅ Land updated successfully');

    res.status(200).json({
      success: true,
      message: 'Land updated successfully',
      land: {
        id: land._id,
        name: land.name,
        size: land.size,
        location: land.location,
        soilType: land.soilType,
        waterSource: land.waterSource,
        notes: land.notes,
        updatedAt: land.updatedAt,
      },
    });

  } catch (error) {
    console.error('❌ Update land error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message,
    });
  }
});

// @route   DELETE /api/lands/:landId
// @desc    Delete land (soft delete)
// @access  Public
router.delete('/:landId', async (req, res) => {
  try {
    console.log('🗑️ Deleting land:', req.params.landId);

    const land = await Land.findById(req.params.landId);

    if (!land) {
      return res.status(404).json({
        success: false,
        error: 'Land not found',
      });
    }

    // Soft delete
    land.isActive = false;
    await land.save();

    console.log('✅ Land deleted successfully');

    res.status(200).json({
      success: true,
      message: 'Land deleted successfully',
    });

  } catch (error) {
    console.error('❌ Delete land error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message,
    });
  }
});

module.exports = router;

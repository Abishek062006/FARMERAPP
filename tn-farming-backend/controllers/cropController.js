const Crop = require('../models/Crop');
const User = require('../models/User'); // ADD THIS
const { getCropData, calculateHarvestDate } = require('../data/cropMasterData');

// Create new crop
exports.createCrop = async (req, res) => {
  try {
    const {
      firebaseUid,
      landId,
      plotId,
      name,
      tamilName,
      variety,
      plantingDate,
      quantity,
      unit,
      containerType,
      containerSize,
      location,
      notes,
      images,
    } = req.body;

    // Validate required fields
    if (!firebaseUid || !name || !plantingDate || !quantity || !unit) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: firebaseUid, name, plantingDate, quantity, unit',
      });
    }

    // ✅ FIND USER BY FIREBASE UID
    const user = await User.findOne({ firebaseUid });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User not found with firebaseUid: ${firebaseUid}`,
      });
    }

    console.log('✅ User found:', user.name, user._id);

    // Get crop master data
    const cropData = getCropData(name);
    const category = cropData?.category || 'other';

    // Calculate expected harvest date
    const expectedHarvestDate = calculateHarvestDate(plantingDate, name) || 
      new Date(new Date(plantingDate).setDate(new Date(plantingDate).getDate() + 90));

    // Create crop
    const crop = new Crop({
      userId: user._id, // ✅ AUTO-POPULATE FROM USER
      firebaseUid,
      landId: landId || null,
      plotId: plotId || null,
      name,
      tamilName: tamilName || name,
      variety: variety || '',
      category,
      plantingDate,
      expectedHarvestDate,
      quantity,
      unit,
      containerType: containerType || undefined,
      containerSize: containerSize || undefined,
      location: location || undefined,
      notes: notes || '',
      images: images || [],
      currentStage: 'sowing',
      status: 'active',
    });

    await crop.save();

    console.log('✅ Crop created:', crop._id);

    res.status(201).json({
      success: true,
      message: 'Crop created successfully',
      crop,
    });
  } catch (error) {
    console.error('❌ Error creating crop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create crop',
      error: error.message,
    });
  }
};

// Get all crops for a user
exports.getUserCrops = async (req, res) => {
  try {
    const { firebaseUid } = req.params;

    const crops = await Crop.find({ firebaseUid })
      .populate('landId', 'name size location')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: crops.length,
      crops,
    });
  } catch (error) {
    console.error('Error fetching user crops:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch crops',
      error: error.message,
    });
  }
};

// Get active crops for a user
exports.getActiveCrops = async (req, res) => {
  try {
    const { firebaseUid } = req.params;

    const crops = await Crop.find({ 
      firebaseUid, 
      status: 'active' 
    })
      .populate('landId', 'name size location')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: crops.length,
      crops,
    });
  } catch (error) {
    console.error('Error fetching active crops:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active crops',
      error: error.message,
    });
  }
};

// Get crops by land
exports.getCropsByLand = async (req, res) => {
  try {
    const { landId } = req.params;

    const crops = await Crop.find({ landId })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: crops.length,
      crops,
    });
  } catch (error) {
    console.error('Error fetching crops by land:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch crops',
      error: error.message,
    });
  }
};

// Get single crop by ID
exports.getCropById = async (req, res) => {
  try {
    const { id } = req.params;

    const crop = await Crop.findById(id)
      .populate('landId', 'name size location address city district');

    if (!crop) {
      return res.status(404).json({
        success: false,
        message: 'Crop not found',
      });
    }

    // Get crop master data for additional info
    const cropData = getCropData(crop.name);

    res.status(200).json({
      success: true,
      crop,
      masterData: cropData,
    });
  } catch (error) {
    console.error('Error fetching crop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch crop',
      error: error.message,
    });
  }
};

// Update crop
exports.updateCrop = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const crop = await Crop.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    if (!crop) {
      return res.status(404).json({
        success: false,
        message: 'Crop not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Crop updated successfully',
      crop,
    });
  } catch (error) {
    console.error('Error updating crop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update crop',
      error: error.message,
    });
  }
};

// Update growth stage
exports.updateGrowthStage = async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body;

    const crop = await Crop.findById(id);
    if (!crop) {
      return res.status(404).json({
        success: false,
        message: 'Crop not found',
      });
    }

    crop.currentStage = stage;
    crop.updatedAt = Date.now();
    await crop.save();

    res.status(200).json({
      success: true,
      message: 'Growth stage updated successfully',
      crop,
    });
  } catch (error) {
    console.error('Error updating growth stage:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update growth stage',
      error: error.message,
    });
  }
};

// Add progress update
exports.addProgressUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const { stage, notes, images, healthScore, observations } = req.body;

    const crop = await Crop.findById(id);
    if (!crop) {
      return res.status(404).json({
        success: false,
        message: 'Crop not found',
      });
    }

    const update = {
      date: Date.now(),
      stage,
      notes,
      images: images || [],
      healthScore: healthScore || crop.healthScore,
      observations,
    };

    crop.progressUpdates.push(update);
    crop.healthScore = healthScore || crop.healthScore;
    crop.updatedAt = Date.now();
    await crop.save();

    res.status(200).json({
      success: true,
      message: 'Progress update added successfully',
      crop,
    });
  } catch (error) {
    console.error('Error adding progress update:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add progress update',
      error: error.message,
    });
  }
};

// Mark as harvested
exports.markAsHarvested = async (req, res) => {
  try {
    const { id } = req.params;
    const { actualHarvestDate } = req.body;

    const crop = await Crop.findById(id);
    if (!crop) {
      return res.status(404).json({
        success: false,
        message: 'Crop not found',
      });
    }

    crop.status = 'harvested';
    crop.currentStage = 'harvested';
    crop.actualHarvestDate = actualHarvestDate || Date.now();
    crop.updatedAt = Date.now();
    await crop.save();

    res.status(200).json({
      success: true,
      message: 'Crop marked as harvested',
      crop,
    });
  } catch (error) {
    console.error('Error marking crop as harvested:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark as harvested',
      error: error.message,
    });
  }
};

// Delete crop
exports.deleteCrop = async (req, res) => {
  try {
    const { id } = req.params;

    const crop = await Crop.findByIdAndDelete(id);
    if (!crop) {
      return res.status(404).json({
        success: false,
        message: 'Crop not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Crop deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting crop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete crop',
      error: error.message,
    });
  }
};

const express = require('express');
const router = express.Router();
const Disease = require('../models/Disease');
const Crop = require('../models/Crop');

/**
 * POST /api/diseases
 * Log a disease detection
 */
router.post('/', async (req, res) => {
  try {
    const {
      cropId,
      firebaseUid,
      symptoms,
      diseaseName,
      diseaseNameTamil,
      confidence,
      cause,
      severity,
      treatment,
      preventiveMeasures,
      organicTreatment,
      photos,
      affectedArea,
      notes
    } = req.body;

    console.log('🦠 Logging disease detection for crop:', cropId);

    // Validate required fields
    if (!cropId || !firebaseUid || !diseaseName || !treatment) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields (cropId, firebaseUid, diseaseName, treatment)'
      });
    }

    // Verify crop exists
    const crop = await Crop.findById(cropId);
    if (!crop) {
      return res.status(404).json({
        success: false,
        message: 'Crop not found'
      });
    }

    const newDisease = new Disease({
      cropId,
      firebaseUid,
      detectedDate: new Date(),
      symptoms: symptoms || [],
      diseaseName,
      diseaseNameTamil: diseaseNameTamil || '',
      confidence: confidence || 0,
      cause: cause || 'unknown',
      severity: severity || 'moderate',
      treatment,
      preventiveMeasures: preventiveMeasures || [],
      organicTreatment: organicTreatment || '',
      photos: photos || [],
      status: 'detected',
      affectedArea: affectedArea || '',
      notes: notes || ''
    });

    await newDisease.save();

    // Update crop health score
    const healthReduction = severity === 'critical' ? 40 : severity === 'severe' ? 30 : severity === 'moderate' ? 20 : 10;
    const newHealthScore = Math.max(0, crop.healthScore - healthReduction);
    
    await Crop.findByIdAndUpdate(cropId, {
      $set: { healthScore: newHealthScore }
    });

    console.log('✅ Disease logged:', newDisease._id);

    res.status(201).json({
      success: true,
      message: 'Disease logged successfully',
      disease: newDisease,
      updatedHealthScore: newHealthScore
    });

  } catch (error) {
    console.error('❌ Error logging disease:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log disease',
      error: error.message
    });
  }
});


/**
 * GET /api/diseases/crop/:cropId
 * Get all diseases for a crop
 */
router.get('/crop/:cropId', async (req, res) => {
  try {
    const { cropId } = req.params;
    const { status } = req.query;

    console.log('🦠 Fetching diseases for crop:', cropId);

    const filter = { cropId };
    if (status) {
      filter.status = status;
    }

    const diseases = await Disease.find(filter).sort({ detectedDate: -1 });

    res.json({
      success: true,
      count: diseases.length,
      diseases
    });

  } catch (error) {
    console.error('❌ Error fetching diseases:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch diseases',
      error: error.message
    });
  }
});


/**
 * GET /api/diseases/user/:firebaseUid
 * Get all diseases for a user (across all crops)
 */
router.get('/user/:firebaseUid', async (req, res) => {
  try {
    const { firebaseUid } = req.params;
    const { active } = req.query;

    console.log('🦠 Fetching diseases for user:', firebaseUid);

    const filter = { firebaseUid };
    if (active === 'true') {
      filter.status = { $in: ['detected', 'treating', 'worsening'] };
    }

    const diseases = await Disease.find(filter)
      .populate('cropId')
      .sort({ detectedDate: -1 });

    res.json({
      success: true,
      count: diseases.length,
      diseases
    });

  } catch (error) {
    console.error('❌ Error fetching user diseases:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch diseases',
      error: error.message
    });
  }
});


/**
 * PUT /api/diseases/:diseaseId/status
 * Update disease status
 */
router.put('/:diseaseId/status', async (req, res) => {
  try {
    const { diseaseId } = req.params;
    const { status, notes } = req.body;

    console.log('🔄 Updating disease status:', diseaseId, '->', status);

    const validStatuses = ['detected', 'treating', 'improving', 'resolved', 'worsening'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const updateData = { status };
    
    if (status === 'treating' && !req.body.treatmentStartDate) {
      updateData.treatmentStartDate = new Date();
    }
    
    if (status === 'resolved') {
      updateData.resolvedDate = new Date();
    }

    if (notes) {
      updateData.notes = notes;
    }

    const updatedDisease = await Disease.findByIdAndUpdate(
      diseaseId,
      { $set: updateData },
      { new: true }
    );

    if (!updatedDisease) {
      return res.status(404).json({
        success: false,
        message: 'Disease record not found'
      });
    }

    // If resolved, improve crop health score
    if (status === 'resolved') {
      const crop = await Crop.findById(updatedDisease.cropId);
      if (crop) {
        const healthImprovement = 20;
        const newHealthScore = Math.min(100, crop.healthScore + healthImprovement);
        await Crop.findByIdAndUpdate(crop._id, {
          $set: { healthScore: newHealthScore }
        });
      }
    }

    res.json({
      success: true,
      message: 'Disease status updated',
      disease: updatedDisease
    });

  } catch (error) {
    console.error('❌ Error updating disease status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update disease status',
      error: error.message
    });
  }
});


/**
 * PUT /api/diseases/:diseaseId
 * Update disease information
 */
router.put('/:diseaseId', async (req, res) => {
  try {
    const { diseaseId } = req.params;
    const updates = req.body;

    console.log('✏️ Updating disease:', diseaseId);

    // Don't allow changing cropId or firebaseUid
    delete updates.cropId;
    delete updates.firebaseUid;
    delete updates.detectedDate;

    const updatedDisease = await Disease.findByIdAndUpdate(
      diseaseId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedDisease) {
      return res.status(404).json({
        success: false,
        message: 'Disease record not found'
      });
    }

    res.json({
      success: true,
      message: 'Disease updated successfully',
      disease: updatedDisease
    });

  } catch (error) {
    console.error('❌ Error updating disease:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update disease',
      error: error.message
    });
  }
});


/**
 * DELETE /api/diseases/:diseaseId
 * Delete a disease record
 */
router.delete('/:diseaseId', async (req, res) => {
  try {
    const { diseaseId } = req.params;

    console.log('🗑️ Deleting disease:', diseaseId);

    const deletedDisease = await Disease.findByIdAndDelete(diseaseId);

    if (!deletedDisease) {
      return res.status(404).json({
        success: false,
        message: 'Disease record not found'
      });
    }

    res.json({
      success: true,
      message: 'Disease record deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting disease:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete disease',
      error: error.message
    });
  }
});


module.exports = router;

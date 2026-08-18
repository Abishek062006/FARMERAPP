const express = require('express');
const router = express.Router();
const Plot = require('../models/Plot');
const Land = require('../models/Land');
const { requireAuth } = require('../middleware/auth');

/**
 * POST /api/plots
 * Create plot divisions for a land
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { landId, plots } = req.body;
    const firebaseUid = req.firebaseUid;

    console.log('📊 Creating plot divisions for land:', landId);

    // Validate
    if (!landId || !plots || plots.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Land ID and plots array are required'
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
        message: 'Not authorized to create plots for this land'
      });
    }

    // Verify percentages add up to 100
    const totalPercentage = plots.reduce((sum, plot) => sum + plot.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `Plot percentages must add up to 100%. Current total: ${totalPercentage}%`
      });
    }

    // Delete existing plots for this land (if any)
    await Plot.deleteMany({ landId });

    // Create new plots
    const createdPlots = [];
    for (let i = 0; i < plots.length; i++) {
      const plotData = plots[i];
      
      const newPlot = new Plot({
        landId,
        firebaseUid,
        plotNumber: i + 1,
        plotName: plotData.plotName || `Plot ${i + 1}`,
        area: plotData.area,
        percentage: plotData.percentage,
        status: 'planned',
        soilCondition: 'good'
      });

      await newPlot.save();
      createdPlots.push(newPlot);
    }

    // Update land's total plots
    await Land.findByIdAndUpdate(landId, {
      $set: { totalPlots: createdPlots.length }
    });

    console.log(`✅ Created ${createdPlots.length} plots`);

    res.status(201).json({
      success: true,
      message: 'Plots created successfully',
      plots: createdPlots,
      count: createdPlots.length
    });

  } catch (error) {
    console.error('❌ Error creating plots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create plots',
      error: error.message
    });
  }
});


/**
 * GET /api/plots/land/:landId
 * Get all plots for a land
 */
router.get('/land/:landId', requireAuth, async (req, res) => {
  try {
    const { landId } = req.params;

    const land = await Land.findById(landId);
    if (!land) {
      return res.status(404).json({ success: false, message: 'Land not found' });
    }
    if (land.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to view plots for this land' });
    }

    console.log('📊 Fetching plots for land:', landId);

    const plots = await Plot.find({ landId })
      .populate('cropId')
      .sort({ plotNumber: 1 });

    res.json({
      success: true,
      count: plots.length,
      plots
    });

  } catch (error) {
    console.error('❌ Error fetching plots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plots',
      error: error.message
    });
  }
});


/**
 * PUT /api/plots/:plotId
 * Update a plot
 */
router.put('/:plotId', requireAuth, async (req, res) => {
  try {
    const { plotId } = req.params;
    const updates = req.body;

    console.log('✏️ Updating plot:', plotId);

    const existingPlot = await Plot.findById(plotId);
    if (!existingPlot) {
      return res.status(404).json({ success: false, message: 'Plot not found' });
    }
    if (existingPlot.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this plot' });
    }

    const updatedPlot = await Plot.findByIdAndUpdate(
      plotId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedPlot) {
      return res.status(404).json({
        success: false,
        message: 'Plot not found'
      });
    }

    res.json({
      success: true,
      message: 'Plot updated successfully',
      plot: updatedPlot
    });

  } catch (error) {
    console.error('❌ Error updating plot:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update plot',
      error: error.message
    });
  }
});


/**
 * DELETE /api/plots/:plotId
 * Delete a plot (if no crop assigned)
 */
router.delete('/:plotId', requireAuth, async (req, res) => {
  try {
    const { plotId } = req.params;

    console.log('🗑️ Deleting plot:', plotId);

    const plot = await Plot.findById(plotId);

    if (!plot) {
      return res.status(404).json({
        success: false,
        message: 'Plot not found'
      });
    }

    if (plot.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this plot' });
    }

    // Check if plot has a crop
    if (plot.cropId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete plot with assigned crop'
      });
    }

    await Plot.findByIdAndDelete(plotId);

    // Update land's total plots
    const remainingPlots = await Plot.countDocuments({ landId: plot.landId });
    await Land.findByIdAndUpdate(plot.landId, {
      $set: { totalPlots: remainingPlots }
    });

    res.json({
      success: true,
      message: 'Plot deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting plot:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete plot',
      error: error.message
    });
  }
});


module.exports = router;

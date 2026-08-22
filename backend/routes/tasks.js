const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Crop = require('../models/Crop');
const Land = require('../models/Land');
const Plot = require('../models/Plot');
const { requireAuth } = require('../middleware/auth');
const { buildDailyTasks, resolveCropDefinition, computeDayNumber } = require('../services/dailyTaskEngine');
const { translateDailyTasks } = require('../services/growthCopyService');
const { getEstablishmentPhaseDays, computeStageRanges, isLongDurationCrop } = require('../data/growthStageRules');

const VALID_STAGES = ['germination', 'vegetative', 'flowering', 'fruiting', 'harvest', 'completed'];

/**
 * POST /api/tasks
 * Create a new task
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      cropId,
      day,
      date,
      taskType,
      title,
      titleTamil,
      description,
      descriptionTamil,
      priority,
      estimatedTime,
      weatherConsiderations,
      isAIGenerated
    } = req.body;
    const firebaseUid = req.firebaseUid;

    console.log('📝 Creating new task for crop:', cropId);

    // Validate required fields
    if (!cropId || !firebaseUid || !day || !date || !taskType || !title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Verify crop exists and belongs to the caller
    const crop = await Crop.findById(cropId);
    if (!crop) {
      return res.status(404).json({
        success: false,
        message: 'Crop not found'
      });
    }
    if (crop.firebaseUid !== firebaseUid) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add a task to this crop'
      });
    }

    const newTask = new Task({
      cropId,
      firebaseUid,
      day,
      date: new Date(date),
      taskType,
      title,
      titleTamil: titleTamil || '',
      description,
      descriptionTamil: descriptionTamil || '',
      priority: priority || 'medium',
      estimatedTime: estimatedTime || 30,
      weatherConsiderations: weatherConsiderations || '',
      isAIGenerated: isAIGenerated !== false,
      isCompleted: false
    });

    await newTask.save();

    console.log('✅ Task created:', newTask._id);

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task: newTask
    });

  } catch (error) {
    console.error('❌ Error creating task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create task',
      error: error.message
    });
  }
});


/**
 * GET /api/tasks/crop/:cropId/today
 * Compute (and persist) today's day-by-day guidance for a crop — watering,
 * fertilizing, pest-watch — grounded in the crop's own category/duration,
 * its land's water source, today's real weather, and any active disease
 * record. Never overwrites an existing task for the day (upsert via
 * $setOnInsert), so a farmer's own edits or completions are never clobbered
 * by re-opening the screen.
 */
router.get('/crop/:cropId/today', requireAuth, async (req, res) => {
  try {
    const { cropId } = req.params;

    const crop = await Crop.findById(cropId);
    if (!crop) {
      return res.status(404).json({ success: false, message: 'Crop not found' });
    }
    if (crop.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to view tasks for this crop' });
    }
    if (crop.isHarvested) {
      return res.status(400).json({ success: false, message: 'Crop cycle has ended' });
    }

    const land = crop.landId ? await Land.findById(crop.landId).lean() : null;
    const plot = crop.plotId ? await Plot.findById(crop.plotId).lean() : null;

    const { dayNumber, stage, phase, weatherUsed, tasks: taskSpecs } = await buildDailyTasks({ crop, land, plot });

    if (stage === 'completed') {
      return res.json({
        success: true,
        day: dayNumber,
        stage,
        phase,
        weatherUsed,
        tasks: [],
        message: 'This crop has passed its tracked cycle — mark it harvested when ready.',
      });
    }

    const translatedSpecs = await translateDailyTasks(taskSpecs);

    const persistedTasks = await Promise.all(
      translatedSpecs.map((spec) =>
        Task.findOneAndUpdate(
          { cropId: crop._id, day: dayNumber, taskType: spec.taskType },
          {
            $setOnInsert: {
              cropId: crop._id,
              firebaseUid: crop.firebaseUid,
              day: dayNumber,
              date: new Date(),
              taskType: spec.taskType,
              title: spec.title,
              titleTamil: spec.titleTamil || '',
              description: spec.description,
              descriptionTamil: spec.descriptionTamil || '',
              priority: spec.priority || 'medium',
              estimatedTime: 30,
              weatherConsiderations: spec.weatherConsiderations || '',
              isAIGenerated: true,
              isCompleted: false,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
      )
    );

    // Lazily advance currentStage as a side effect — it's write-only via the
    // manual PUT /crops/:cropId/stage route today and never auto-advances.
    const stageIndex = VALID_STAGES.indexOf(stage);
    const storedStageIndex = VALID_STAGES.indexOf(crop.currentStage);
    if (stageIndex > storedStageIndex) {
      await Crop.findByIdAndUpdate(crop._id, { $set: { currentStage: stage } });
    }

    res.json({
      success: true,
      day: dayNumber,
      stage,
      phase,
      weatherUsed,
      tasks: persistedTasks,
    });
  } catch (error) {
    console.error('❌ Error computing today\'s tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to compute today\'s tasks',
      error: error.message,
    });
  }
});

/**
 * GET /api/tasks/crop/:cropId/calendar
 * Pure computation, no writes — the crop's stage-boundary breakdown for the
 * whole tracked duration, for rendering a timeline strip. Never generates
 * per-day guidance for future days (weather-dependent watering advice for a
 * day that hasn't happened yet can't be known).
 */
router.get('/crop/:cropId/calendar', requireAuth, async (req, res) => {
  try {
    const { cropId } = req.params;

    const crop = await Crop.findById(cropId);
    if (!crop) {
      return res.status(404).json({ success: false, message: 'Crop not found' });
    }
    if (crop.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this crop\'s calendar' });
    }

    const cropDef = resolveCropDefinition(crop.name);
    const duration = crop.duration || cropDef.duration;
    const category = cropDef.category;
    const currentDay = computeDayNumber(crop.plantingDate);
    const longDuration = isLongDurationCrop(duration);

    const establishmentPhaseDays = longDuration ? getEstablishmentPhaseDays(category) : null;
    const stages = longDuration
      ? computeStageRanges(category, establishmentPhaseDays)
      : computeStageRanges(category, duration);
    const phase = longDuration && currentDay > establishmentPhaseDays ? 'maintenance' : 'daily';

    res.json({
      success: true,
      duration,
      category,
      currentDay,
      phase,
      establishmentPhaseDays,
      stages,
    });
  } catch (error) {
    console.error('❌ Error computing crop calendar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to compute crop calendar',
      error: error.message,
    });
  }
});

/**
 * GET /api/tasks/crop/:cropId
 * Get all tasks for a crop
 */
router.get('/crop/:cropId', requireAuth, async (req, res) => {
  try {
    const { cropId } = req.params;
    const { completed, upcoming } = req.query;

    const crop = await Crop.findById(cropId);
    if (!crop) {
      return res.status(404).json({ success: false, message: 'Crop not found' });
    }
    if (crop.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to view tasks for this crop' });
    }

    console.log('📋 Fetching tasks for crop:', cropId);

    const filter = { cropId };

    if (completed === 'true') {
      filter.isCompleted = true;
    } else if (completed === 'false') {
      filter.isCompleted = false;
    }

    if (upcoming === 'true') {
      filter.date = { $gte: new Date() };
      filter.isCompleted = false;
    }

    const tasks = await Task.find(filter).sort({ date: 1, day: 1 });

    res.json({
      success: true,
      count: tasks.length,
      tasks
    });

  } catch (error) {
    console.error('❌ Error fetching tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tasks',
      error: error.message
    });
  }
});


/**
 * GET /api/tasks/user/:firebaseUid
 * Get all tasks for a user (across all crops)
 */
router.get('/user/:firebaseUid', requireAuth, async (req, res) => {
  try {
    const { firebaseUid } = req.params;
    const { today, pending } = req.query;

    if (firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to view these tasks' });
    }

    console.log('📋 Fetching tasks for user:', firebaseUid);

    const filter = { firebaseUid };

    if (today === 'true') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      filter.date = { $gte: todayStart, $lte: todayEnd };
    }

    if (pending === 'true') {
      filter.isCompleted = false;
    }

    const tasks = await Task.find(filter)
      .populate('cropId')
      .sort({ date: 1, priority: -1 });

    res.json({
      success: true,
      count: tasks.length,
      tasks
    });

  } catch (error) {
    console.error('❌ Error fetching user tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tasks',
      error: error.message
    });
  }
});


/**
 * PUT /api/tasks/:taskId/complete
 * Mark a task as completed
 */
router.put('/:taskId/complete', requireAuth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { notes } = req.body;

    console.log('✅ Marking task as complete:', taskId);

    const existingTask = await Task.findById(taskId);
    if (!existingTask) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    if (existingTask.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this task' });
    }

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      {
        $set: {
          isCompleted: true,
          completedAt: new Date(),
          completedNotes: notes || ''
        }
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Task marked as completed',
      task: updatedTask
    });

  } catch (error) {
    console.error('❌ Error completing task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete task',
      error: error.message
    });
  }
});


/**
 * PUT /api/tasks/:taskId
 * Update a task
 */
router.put('/:taskId', requireAuth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const updates = req.body;

    console.log('✏️ Updating task:', taskId);

    const existingTask = await Task.findById(taskId);
    if (!existingTask) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    if (existingTask.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this task' });
    }

    // Don't allow changing cropId or firebaseUid
    delete updates.cropId;
    delete updates.firebaseUid;

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedTask) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    res.json({
      success: true,
      message: 'Task updated successfully',
      task: updatedTask
    });

  } catch (error) {
    console.error('❌ Error updating task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update task',
      error: error.message
    });
  }
});


/**
 * DELETE /api/tasks/:taskId
 * Delete a task
 */
router.delete('/:taskId', requireAuth, async (req, res) => {
  try {
    const { taskId } = req.params;

    console.log('🗑️ Deleting task:', taskId);

    const existingTask = await Task.findById(taskId);
    if (!existingTask) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    if (existingTask.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this task' });
    }

    const deletedTask = await Task.findByIdAndDelete(taskId);

    res.json({
      success: true,
      message: 'Task deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete task',
      error: error.message
    });
  }
});


module.exports = router;

const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Crop = require('../models/Crop');

/**
 * POST /api/tasks
 * Create a new task
 */
router.post('/', async (req, res) => {
  try {
    const {
      cropId,
      firebaseUid,
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

    console.log('📝 Creating new task for crop:', cropId);

    // Validate required fields
    if (!cropId || !firebaseUid || !day || !date || !taskType || !title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
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
 * GET /api/tasks/crop/:cropId
 * Get all tasks for a crop
 */
router.get('/crop/:cropId', async (req, res) => {
  try {
    const { cropId } = req.params;
    const { completed, upcoming } = req.query;

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
router.get('/user/:firebaseUid', async (req, res) => {
  try {
    const { firebaseUid } = req.params;
    const { today, pending } = req.query;

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
router.put('/:taskId/complete', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { notes } = req.body;

    console.log('✅ Marking task as complete:', taskId);

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

    if (!updatedTask) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

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
router.put('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const updates = req.body;

    console.log('✏️ Updating task:', taskId);

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
router.delete('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    console.log('🗑️ Deleting task:', taskId);

    const deletedTask = await Task.findByIdAndDelete(taskId);

    if (!deletedTask) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

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

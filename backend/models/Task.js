const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  cropId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Crop',
    required: true,
    index: true
  },
  firebaseUid: {
    type: String,
    required: true,
    index: true
  },
  day: {
    type: Number,  // Day number since planting
    required: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  taskType: {
    type: String,
    required: true,
    enum: [
      'watering',
      'fertilizing',
      'weeding',
      'pestControl',
      'pruning',
      'observation',
      'harvesting',
      'soilTesting',
      'mulching',
      'other'
    ]
  },
  title: {
    type: String,
    required: true
  },
  titleTamil: {
    type: String
  },
  description: {
    type: String,
    required: true
  },
  descriptionTamil: {
    type: String
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  },
  estimatedTime: {
    type: Number,  // Minutes
    default: 30
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date
  },
  completedNotes: {
    type: String
  },
  weatherConsiderations: {
    type: String
  },
  isAIGenerated: {
    type: Boolean,
    default: true
  },
  reminderSent: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
taskSchema.index({ cropId: 1, date: 1 });
taskSchema.index({ firebaseUid: 1, isCompleted: 1 });
taskSchema.index({ date: 1, isCompleted: 1 });

module.exports = mongoose.model('Task', taskSchema);

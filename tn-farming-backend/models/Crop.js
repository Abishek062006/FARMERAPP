const mongoose = require('mongoose');

const progressUpdateSchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now,
  },
  stage: {
    type: String,
    enum: ['seedling', 'vegetative', 'flowering', 'fruiting', 'mature'],
  },
  notes: String,
  images: [String],
  healthScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 80,
  },
  observations: String,
});

const cropSchema = new mongoose.Schema({
  // User & Land References
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  firebaseUid: {
    type: String,
    required: true,
  },
  landId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Land',
    default: null,
  },
  plotId: {
    type: String,
    default: null,
  },

  // Crop Details
  name: {
    type: String,
    required: true,
  },
  tamilName: {
    type: String,
    required: true,
  },
  variety: String,
  category: {
    type: String,
    enum: ['grain', 'vegetable', 'fruit', 'spice', 'pulse', 'oilseed', 'fiber', 'other'],
  },

  // Planting Information
  plantingDate: {
    type: Date,
    required: true,
  },
  expectedHarvestDate: {
    type: Date,
    required: true,
  },
  actualHarvestDate: Date,

  // Quantity
  quantity: {
    type: Number,
    required: true,
  },
  unit: {
    type: String,
    enum: ['acres', 'cents', 'hectares', 'sqft', 'plants'],
    required: true,
  },

  // For Terrace Farming Only
  containerType: {
    type: String,
    enum: ['pot', 'grow-bag', 'tray', 'raised-bed', 'other'],
  },
  containerSize: String,
  location: {
    type: String,
    enum: ['balcony', 'terrace', 'rooftop', 'window', 'indoor', 'outdoor'],
  },

  // Growth Tracking
  currentStage: {
    type: String,
    enum: ['preparation', 'sowing', 'seedling', 'vegetative', 'flowering', 'fruiting', 'mature', 'harvested'],
    default: 'sowing',
  },
  status: {
    type: String,
    enum: ['active', 'harvested', 'failed', 'diseased'],
    default: 'active',
  },
  healthScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 80,
  },

  // Progress Updates
  progressUpdates: [progressUpdateSchema],

  // Media
  images: [String],

  // Additional Info
  notes: String,
  diseases: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Disease',
  }],
  expenses: {
    type: Number,
    default: 0,
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true, // ✅ USE BUILT-IN TIMESTAMPS
});

// Indexes for better query performance
cropSchema.index({ firebaseUid: 1, status: 1 });
cropSchema.index({ landId: 1 });
cropSchema.index({ createdAt: -1 });

const Crop = mongoose.model('Crop', cropSchema);

module.exports = Crop;

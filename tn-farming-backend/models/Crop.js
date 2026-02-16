const mongoose = require('mongoose');

const cropSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    index: true
  },
  landId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Land',
    required: true,
    index: true
  },
  plotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plot',
    default: null
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  tamilName: {
    type: String,
    required: true,
    trim: true
  },
  variety: {
    type: String,
    default: 'Standard'
  },
  plantingDate: {
    type: Date,
    required: true
  },
  expectedHarvestDate: {
    type: Date,
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unit: {
    type: String,
    required: true,
    enum: ['plants', 'seeds', 'kg', 'grams', 'saplings']
  },
  farmingType: {
    type: String,
    required: true,
    enum: ['normal', 'organic', 'terrace']
  },
  
  // For terrace farming only
  containerType: {
    type: String,
    enum: ['pot', 'grow-bag', 'tray', 'raised-bed', 'ground', null],
    default: null
  },
  containerSize: {
    type: String,
    enum: ['5L', '10L', '15L', '20L', '25L', '30L', '50L', null],
    default: null
  },
  location: {
    type: String,
    enum: ['balcony', 'terrace', 'rooftop', 'window', 'indoor', 'outdoor', null],
    default: null
  },
  
  // Growth tracking
  currentStage: {
    type: String,
    enum: ['germination', 'vegetative', 'flowering', 'fruiting', 'harvest', 'completed'],
    default: 'germination'
  },
  daysElapsed: {
    type: Number,
    default: 0
  },
  healthScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 100
  },
  
  // Additional data
  photos: [{
    url: String,
    uploadDate: Date,
    description: String
  }],
  notes: {
    type: String,
    maxlength: 1000
  },
  
  // Status flags
  isActive: {
    type: Boolean,
    default: true
  },
  isHarvested: {
    type: Boolean,
    default: false
  },
  harvestDate: {
    type: Date
  },
  actualYield: {
    value: Number,
    unit: String
  },
  
  // Market data (cached)
  lastKnownPrice: {
    value: Number,
    date: Date
  }
}, {
  timestamps: true
});

// Indexes
cropSchema.index({ firebaseUid: 1, isActive: 1 });
cropSchema.index({ landId: 1, isActive: 1 });
cropSchema.index({ plantingDate: 1 });
cropSchema.index({ expectedHarvestDate: 1 });

// Virtual for days remaining
cropSchema.virtual('daysRemaining').get(function() {
  if (!this.expectedHarvestDate) return 0;
  const today = new Date();
  const diff = this.expectedHarvestDate - today;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// ✅ FIXED: Calculate days elapsed before saving (no next() needed in Mongoose 6+)
cropSchema.pre('save', function() {
  if (this.plantingDate) {
    const today = new Date();
    const diff = today - this.plantingDate;
    this.daysElapsed = Math.floor(diff / (1000 * 60 * 60 * 24));
  }
  // ✅ No next() call - Mongoose 6+ handles this automatically
});

module.exports = mongoose.model('Crop', cropSchema);

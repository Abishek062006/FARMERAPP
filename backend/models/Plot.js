const mongoose = require('mongoose');

const plotSchema = new mongoose.Schema({
  landId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Land',
    required: true,
    index: true
  },
  firebaseUid: {
    type: String,
    required: true,
    index: true
  },
  cropId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Crop',
    default: null
  },
  plotNumber: {
    type: Number,
    required: true
  },
  plotName: {
    type: String,
    trim: true
  },
  area: {
    value: { 
      type: Number, 
      required: true, 
      min: 0 
    },
    unit: { 
      type: String, 
      required: true,
      enum: ['acres', 'hectares', 'sqft', 'sqm']
    }
  },
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  status: {
    type: String,
    enum: ['planned', 'active', 'harvested', 'fallow'],
    default: 'planned'
  },
  soilCondition: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor'],
    default: 'good'
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
plotSchema.index({ landId: 1, plotNumber: 1 }, { unique: true });
plotSchema.index({ firebaseUid: 1, status: 1 });

module.exports = mongoose.model('Plot', plotSchema);

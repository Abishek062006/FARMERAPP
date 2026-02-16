const mongoose = require('mongoose');

const landSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    index: true
  },
  landName: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    },
    city: { type: String, required: true },
    district: { type: String, required: true },
    state: { type: String, required: true, default: 'Tamil Nadu' },
    pincode: { type: String },
    address: { type: String }
  },
  size: {
    value: { type: Number, required: true, min: 0 },
    unit: { 
      type: String, 
      required: true,
      enum: ['acres', 'hectares', 'sqft', 'sqm']
    }
  },
  waterSource: {
    type: String,
    required: true,
    enum: [
      'borewell',
      'canal',
      'rainwater',
      'drip',
      'sprinkler',
      'river',
      'well',
      'pond',
      'tank',
      'none'
    ]
  },
  soilType: {
    type: String,
    required: true,
    enum: ['red', 'black', 'alluvial', 'clay', 'loamy', 'sandy', 'laterite']
  },
  farmingType: {
    type: String,
    required: true,
    enum: ['normal', 'organic', 'terrace']
  },
  photos: [{
    type: String  // URLs to uploaded images
  }],
  totalPlots: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true  // Adds createdAt and updatedAt
});

// Index for faster queries
landSchema.index({ firebaseUid: 1, isActive: 1 });
landSchema.index({ 'location.city': 1, 'location.district': 1 });

module.exports = mongoose.model('Land', landSchema);

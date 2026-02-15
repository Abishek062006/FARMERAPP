const mongoose = require('mongoose');

const LandSchema = new mongoose.Schema({
  // User Reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  firebaseUid: {
    type: String,
    required: true,
    index: true,
  },
  
  // Basic Info
  name: {
    type: String,
    required: true,
    trim: true,
  },
  
  // Size
  size: {
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      enum: ['acres', 'cents', 'sqft', 'hectares'],
      default: 'acres',
    },
  },
  
  // Location
  location: {
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    address: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    district: {
      type: String,
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
    },
  },
  
  // Soil & Water
  soilType: {
    type: String,
    enum: ['clay', 'loam', 'sandy', 'red', 'black', 'alluvial', 'other'],
    default: 'loam',
  },
  waterSource: {
    type: String,
    enum: ['borewell', 'canal', 'rain', 'river', 'pond', 'drip', 'other'],
  },
  
  // Images
  images: [{
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  
  // Status
  isActive: {
    type: Boolean,
    default: true,
  },
  
  // Additional Info
  notes: {
    type: String,
    trim: true,
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
});

// Update timestamp on save
LandSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Indexes for faster queries
LandSchema.index({ firebaseUid: 1, isActive: 1 });
LandSchema.index({ userId: 1 });

module.exports = mongoose.model('Land', LandSchema);

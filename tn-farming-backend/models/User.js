const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
    index:true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ['farmer', 'vendor', 'agent'],
    required: true,
  },
  farmingType: {
    type: String,
    enum: ['terrace', 'normal', 'organic', null],
    default: null,
  },
  location: {
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    city: { type: String },
    district: { type: String },
    state: { type: String, default: 'Tamil Nadu' },
  },
  profileImage: {
    type: String,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update timestamp on save - FIXED SYNTAX
UserSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Create indexes
UserSchema.index({ firebaseUid: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });

module.exports = mongoose.model('User', UserSchema);

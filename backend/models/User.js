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
  // ── Transport agents only ──
  // Registration never asks for these (and shouldn't — it works and is shared
  // by all three roles), so agents set them from an onboarding sheet the first
  // time they open their dashboard.
  vehicle: {
    type:   { type: String, enum: ['auto', 'tempo', 'truck'] },
    number: { type: String, trim: true },
  },
  // Duty toggle. An agent who is offline is never offered a job, and their app
  // stops polling — which matters, because Expo Go can only poll while the
  // app is in the foreground anyway.
  isOnline: {
    type: Boolean,
    default: false,
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

// Indexes.
// firebaseUid and email already declare `unique: true` on the field, which
// creates their index — repeating them here produced duplicate-index warnings
// on every boot. Worse, a schema.index() that collides by name with a
// field-level one can silently REPLACE it (that is how the agent
// one-active-job guard went missing during phase 3), so a key is declared in
// exactly one place.
UserSchema.index({ role: 1 });
// Agent dispatch: find online agents of a given vehicle type.
UserSchema.index({ role: 1, isOnline: 1, 'vehicle.type': 1 });

module.exports = mongoose.model('User', UserSchema);

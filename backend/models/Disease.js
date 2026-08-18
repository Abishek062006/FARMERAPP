const mongoose = require('mongoose');

const diseaseSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    index: true
  },
  cropId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Crop',
    required: true,
    index: true
  },
  diseaseName: {
    type: String,
    required: true
  },
  scientificName: {
    type: String,
    default: ''
  },
  severity: {
    type: String,
    enum: ['mild', 'moderate', 'severe', 'unknown'],
    default: 'moderate'
  },
  affectedArea: {
    type: String,
    default: 'leaves'
  },
  symptoms: {
    type: String,
    default: ''
  },
  causes: {
    type: String,
    default: ''
  },
  treatment: {
    type: String,
    default: ''
  },
  pesticides: [{
    type: String
  }],
  prevention: {
    type: String,
    default: ''
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0
  },
  imageUrl: {
    type: String,
    default: ''
  },
  detectedDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'treating', 'resolved'],
    default: 'active'
  },
  notes: {
    type: String,
    maxlength: 1000
  }
}, {
  timestamps: true
});

// Indexes
diseaseSchema.index({ firebaseUid: 1, status: 1 });
diseaseSchema.index({ cropId: 1, status: 1 });
diseaseSchema.index({ detectedDate: -1 });

module.exports = mongoose.model('Disease', diseaseSchema);

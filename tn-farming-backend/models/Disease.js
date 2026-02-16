const mongoose = require('mongoose');

const diseaseSchema = new mongoose.Schema({
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
  detectedDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  symptoms: [{
    type: String,
    trim: true
  }],
  diseaseName: {
    type: String,
    required: true
  },
  diseaseNameTamil: {
    type: String
  },
  confidence: {
    type: Number,  // AI confidence percentage
    min: 0,
    max: 100
  },
  cause: {
    type: String,
    enum: ['fungal', 'bacterial', 'viral', 'pest', 'nutrient', 'environmental', 'unknown']
  },
  severity: {
    type: String,
    enum: ['mild', 'moderate', 'severe', 'critical'],
    default: 'moderate'
  },
  treatment: {
    type: String,
    required: true
  },
  preventiveMeasures: [{
    type: String
  }],
  organicTreatment: {
    type: String
  },
  photos: [{
    url: String,
    uploadDate: Date
  }],
  status: {
    type: String,
    enum: ['detected', 'treating', 'improving', 'resolved', 'worsening'],
    default: 'detected'
  },
  treatmentStartDate: {
    type: Date
  },
  resolvedDate: {
    type: Date
  },
  notes: {
    type: String
  },
  affectedArea: {
    type: String  // e.g., "20% of plants", "leaves only"
  }
}, {
  timestamps: true
});

// Indexes
diseaseSchema.index({ cropId: 1, status: 1 });
diseaseSchema.index({ firebaseUid: 1, detectedDate: -1 });

module.exports = mongoose.model('Disease', diseaseSchema);

// models/CropListing.js
const mongoose = require('mongoose');

const CropListingSchema = new mongoose.Schema({
  cropId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Crop', required: true },
  farmerUid:   { type: String, required: true },
  farmerName:  { type: String, default: 'Farmer' },
  farmerPhone: { type: String, default: '' },
  cropName:    { type: String, required: true },
  quantityKg:  { type: Number, required: true },
  pricePerKg:  { type: Number, required: true },
  totalPrice:  { type: Number },
  location: {
    city:     { type: String, required: true },
    district: { type: String },
    state:    { type: String, default: 'Tamil Nadu' },
    lat:      { type: Number },
    lng:      { type: Number },
  },
  status:      { type: String, enum: ['available', 'pending', 'confirmed', 'declined'], default: 'available' },
  vendorUid:   { type: String, default: null },
  vendorName:  { type: String, default: null },
  vendorPhone: { type: String, default: null },   // ← new
  vendorCompany: { type: String, default: null }, // ← new
  acceptedAt:  { type: Date, default: null },
  confirmedAt: { type: Date, default: null },     // ← new
}, { timestamps: true });

module.exports = mongoose.model('CropListing', CropListingSchema);

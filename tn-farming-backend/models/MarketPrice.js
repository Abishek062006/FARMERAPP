const mongoose = require('mongoose');

const marketPriceSchema = new mongoose.Schema({
  cropName: {
    type: String,
    required: true,
    index: true
  },
  tamilName: {
    type: String,
    required: true
  },
  market: {
    name: String,
    district: String,
    state: String
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  minPrice: {
    type: Number,
    required: true
  },
  maxPrice: {
    type: Number,
    required: true
  },
  modalPrice: {
    type: Number,  // Most common price
    required: true
  },
  unit: {
    type: String,
    default: 'kg'
  },
  priceChange: {
    type: Number,  // Percentage change from previous day
    default: 0
  },
  trend: {
    type: String,
    enum: ['increasing', 'decreasing', 'stable'],
    default: 'stable'
  },
  arrivals: {
    type: Number  // Quantity arrived in market (quintals)
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  source: {
    type: String,
    default: 'Agmarknet'
  }
}, {
  timestamps: true
});

// Compound index for unique daily records
marketPriceSchema.index({ cropName: 1, 'market.name': 1, date: 1 }, { unique: true });
marketPriceSchema.index({ cropName: 1, date: -1 });

module.exports = mongoose.model('MarketPrice', marketPriceSchema);

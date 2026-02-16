const express = require('express');
const router = express.Router();
const MarketPrice = require('../models/MarketPrice');

/**
 * GET /api/market/prices/:cropName
 * Get market prices for a specific crop
 */
router.get('/prices/:cropName', async (req, res) => {
  try {
    const { cropName } = req.params;

    console.log('📊 Fetching prices for:', cropName);

    // Try to find in database
    let prices = await MarketPrice.find({
      cropName: new RegExp(cropName, 'i'),
      date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    }).sort({ date: -1 });

    // ✅ If no data in DB, generate mock data
    if (prices.length === 0) {
      console.log('📊 No data in DB, generating mock prices...');
      prices = generateMockPrices(cropName);
    }

    res.json({
      success: true,
      count: prices.length,
      prices
    });

  } catch (error) {
    console.error('❌ Error fetching prices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch market prices',
      error: error.message
    });
  }
});

/**
 * GET /api/market/best-markets/:cropName
 * Get best markets (highest prices) for a crop
 */
router.get('/best-markets/:cropName', async (req, res) => {
  try {
    const { cropName } = req.params;

    console.log('🏆 Finding best markets for:', cropName);

    let prices = await MarketPrice.find({
      cropName: new RegExp(cropName, 'i'),
      date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).sort({ modalPrice: -1 }).limit(5);

    // Generate mock if no data
    if (prices.length === 0) {
      const mockPrices = generateMockPrices(cropName);
      prices = mockPrices.sort((a, b) => b.modalPrice - a.modalPrice).slice(0, 5);
    }

    res.json({
      success: true,
      markets: prices
    });

  } catch (error) {
    console.error('❌ Error fetching best markets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch best markets',
      error: error.message
    });
  }
});

/**
 * Generate mock market prices
 */
function generateMockPrices(cropName) {
  const markets = [
    { name: 'Koyambedu Market', district: 'Chennai', state: 'Tamil Nadu' },
    { name: 'Madurai Market', district: 'Madurai', state: 'Tamil Nadu' },
    { name: 'Coimbatore Market', district: 'Coimbatore', state: 'Tamil Nadu' },
    { name: 'Salem Market', district: 'Salem', state: 'Tamil Nadu' },
    { name: 'Trichy Market', district: 'Tiruchirappalli', state: 'Tamil Nadu' },
  ];

  const basePrice = Math.floor(Math.random() * 2000) + 1000; // 1000-3000

  return markets.map(market => {
    const variation = Math.random() * 500 - 250; // ±250
    const modalPrice = Math.floor(basePrice + variation);
    const minPrice = Math.floor(modalPrice * 0.8);
    const maxPrice = Math.floor(modalPrice * 1.2);
    const priceChange = (Math.random() * 10 - 5).toFixed(1); // -5% to +5%

    return {
      _id: `mock_${market.name}_${Date.now()}`,
      cropName: cropName,
      market: market,
      marketName: market.name,
      district: market.district,
      state: market.state,
      modalPrice: modalPrice,
      minPrice: minPrice,
      maxPrice: maxPrice,
      unit: 'quintal',
      date: new Date(),
      lastUpdated: new Date(),
      trend: priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'stable',
      priceChange: parseFloat(priceChange)
    };
  });
}

module.exports = router;

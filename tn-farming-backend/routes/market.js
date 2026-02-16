const express = require('express');
const router = express.Router();
const MarketPrice = require('../models/MarketPrice');

/**
 * GET /api/market/prices/:cropName
 * Get current market prices for a crop
 */
router.get('/prices/:cropName', async (req, res) => {
  try {
    const { cropName } = req.params;
    const { district, limit } = req.query;

    console.log('💰 Fetching prices for:', cropName);

    // Get today's date (start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filter = {
      cropName: new RegExp(cropName, 'i'), // Case-insensitive search
      date: { $gte: today }
    };

    if (district) {
      filter['market.district'] = new RegExp(district, 'i');
    }

    const prices = await MarketPrice.find(filter)
      .sort({ modalPrice: -1 })
      .limit(parseInt(limit) || 10);

    if (prices.length === 0) {
      // If no prices for today, get latest available
      const latestPrices = await MarketPrice.find({
        cropName: new RegExp(cropName, 'i')
      })
        .sort({ date: -1 })
        .limit(parseInt(limit) || 10);

      return res.json({
        success: true,
        count: latestPrices.length,
        prices: latestPrices,
        note: 'No prices available for today. Showing latest prices.'
      });
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
      message: 'Failed to fetch prices',
      error: error.message
    });
  }
});


/**
 * GET /api/market/price-history/:cropName
 * Get price history for a crop
 */
router.get('/price-history/:cropName', async (req, res) => {
  try {
    const { cropName } = req.params;
    const { days, market } = req.query;

    console.log('📊 Fetching price history for:', cropName);

    const daysCount = parseInt(days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysCount);

    const filter = {
      cropName: new RegExp(cropName, 'i'),
      date: { $gte: startDate }
    };

    if (market) {
      filter['market.name'] = new RegExp(market, 'i');
    }

    const priceHistory = await MarketPrice.find(filter)
      .sort({ date: 1 })
      .select('date modalPrice minPrice maxPrice market trend');

    // Calculate statistics
    const prices = priceHistory.map(p => p.modalPrice);
    const stats = {
      average: prices.length > 0 ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : 0,
      highest: prices.length > 0 ? Math.max(...prices) : 0,
      lowest: prices.length > 0 ? Math.min(...prices) : 0,
      current: prices.length > 0 ? prices[prices.length - 1] : 0
    };

    res.json({
      success: true,
      count: priceHistory.length,
      history: priceHistory,
      statistics: stats,
      period: `${daysCount} days`
    });

  } catch (error) {
    console.error('❌ Error fetching price history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch price history',
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const bestMarkets = await MarketPrice.find({
      cropName: new RegExp(cropName, 'i'),
      date: { $gte: today }
    })
      .sort({ modalPrice: -1 })
      .limit(5)
      .select('market modalPrice minPrice maxPrice trend');

    if (bestMarkets.length === 0) {
      return res.json({
        success: true,
        count: 0,
        markets: [],
        message: 'No market data available for today'
      });
    }

    res.json({
      success: true,
      count: bestMarkets.length,
      markets: bestMarkets
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
 * POST /api/market/prices
 * Add/Update market price (Admin/System use)
 */
router.post('/prices', async (req, res) => {
  try {
    const {
      cropName,
      tamilName,
      market,
      date,
      minPrice,
      maxPrice,
      modalPrice,
      unit,
      arrivals,
      source
    } = req.body;

    console.log('💰 Adding/Updating price for:', cropName);

    // Validate required fields
    if (!cropName || !tamilName || !market || !date || !minPrice || !maxPrice || !modalPrice) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Check if price already exists for this crop, market, and date
    const existingPrice = await MarketPrice.findOne({
      cropName,
      'market.name': market.name,
      date: new Date(date)
    });

    if (existingPrice) {
      // Update existing price
      existingPrice.minPrice = minPrice;
      existingPrice.maxPrice = maxPrice;
      existingPrice.modalPrice = modalPrice;
      existingPrice.unit = unit || 'kg';
      existingPrice.arrivals = arrivals || 0;
      existingPrice.lastUpdated = new Date();

      // Calculate trend (compare with previous day)
      const previousDay = new Date(date);
      previousDay.setDate(previousDay.getDate() - 1);
      
      const previousPrice = await MarketPrice.findOne({
        cropName,
        'market.name': market.name,
        date: previousDay
      });

      if (previousPrice) {
        const priceChange = ((modalPrice - previousPrice.modalPrice) / previousPrice.modalPrice) * 100;
        existingPrice.priceChange = parseFloat(priceChange.toFixed(2));
        
        if (priceChange > 2) existingPrice.trend = 'increasing';
        else if (priceChange < -2) existingPrice.trend = 'decreasing';
        else existingPrice.trend = 'stable';
      }

      await existingPrice.save();

      return res.json({
        success: true,
        message: 'Price updated successfully',
        price: existingPrice
      });
    }

    // Create new price entry
    const newPrice = new MarketPrice({
      cropName,
      tamilName,
      market,
      date: new Date(date),
      minPrice,
      maxPrice,
      modalPrice,
      unit: unit || 'kg',
      priceChange: 0,
      trend: 'stable',
      arrivals: arrivals || 0,
      source: source || 'Manual'
    });

    await newPrice.save();

    res.status(201).json({
      success: true,
      message: 'Price added successfully',
      price: newPrice
    });

  } catch (error) {
    console.error('❌ Error adding price:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add price',
      error: error.message
    });
  }
});


module.exports = router;

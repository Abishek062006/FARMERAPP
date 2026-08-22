const express = require('express');
const router = express.Router();
const mandiController = require('../controllers/mandiController');

// Metadata for the cascading dropdowns (See All screen)
router.get('/states', mandiController.getStates);
router.get('/districts', mandiController.getDistricts);
router.get('/markets', mandiController.getMarkets);
router.get('/commodities', mandiController.getCommodities);

// GET /api/mandi/prices?date=&stateId=&districtId=&marketId=&commodityId=
router.get('/prices', mandiController.getPrice);

// GET /api/mandi/trend?date=&stateId=&districtId=&marketId=&commodityId=
router.get('/trend', mandiController.getTrend);

// GET /api/mandi/dashboard-prices?state=&district=&crops=&date=
router.get('/dashboard-prices', mandiController.getDashboardPrices);

// GET /api/mandi/nearby-prices?district=&date=&limit=
router.get('/nearby-prices', mandiController.getNearbyPrices);

module.exports = router;

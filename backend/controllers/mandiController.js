const agmarknetService = require('../services/agmarknetService');

// ── Friendly, farmer-facing messages. Technical detail goes to console.error only. ──
const FRIENDLY_MESSAGES = {
  TIMEOUT: 'The mandi price service is taking too long to respond. Please try again.',
  FORBIDDEN: 'The mandi price service is temporarily unavailable. Please try again shortly.',
  UPSTREAM: 'The mandi price service is having issues right now. Please try again shortly.',
  NETWORK: 'Could not reach the mandi price service. Check your connection and try again.',
  UNKNOWN: 'Something went wrong while fetching mandi prices. Please try again.',
};

function handleAgmarknetError(res, err, context) {
  if (err instanceof agmarknetService.AgmarknetError) {
    console.error(`❌ [mandi] ${context}:`, err.message, err.cause?.message || '');
    return res.status(502).json({
      success: false,
      message: FRIENDLY_MESSAGES[err.type] || FRIENDLY_MESSAGES.UNKNOWN,
    });
  }
  console.error(`❌ [mandi] ${context} (unexpected):`, err);
  return res.status(500).json({
    success: false,
    message: FRIENDLY_MESSAGES.UNKNOWN,
  });
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(date) {
  if (!ISO_DATE_RE.test(date)) return false;
  const d = new Date(date);
  return !Number.isNaN(d.getTime());
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mandi/states
// ─────────────────────────────────────────────────────────────────────────────
exports.getStates = async (req, res) => {
  try {
    const states = await agmarknetService.getStates();
    res.json({ success: true, data: states });
  } catch (err) {
    handleAgmarknetError(res, err, 'getStates');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mandi/districts?stateId=31
// ─────────────────────────────────────────────────────────────────────────────
exports.getDistricts = async (req, res) => {
  const { stateId } = req.query;
  if (!stateId || Number.isNaN(Number(stateId))) {
    return res.status(400).json({ success: false, message: 'A valid stateId is required.' });
  }
  try {
    const districts = await agmarknetService.getDistricts(stateId);
    res.json({ success: true, data: districts });
  } catch (err) {
    handleAgmarknetError(res, err, 'getDistricts');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mandi/markets?districtId=539
// ─────────────────────────────────────────────────────────────────────────────
exports.getMarkets = async (req, res) => {
  const { districtId } = req.query;
  if (!districtId || Number.isNaN(Number(districtId))) {
    return res.status(400).json({ success: false, message: 'A valid districtId is required.' });
  }
  try {
    const markets = await agmarknetService.getMarkets(districtId);
    res.json({ success: true, data: markets });
  } catch (err) {
    handleAgmarknetError(res, err, 'getMarkets');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mandi/commodities
// GET /api/mandi/commodities?districtId=539&date=2026-08-18
//   With districtId+date: only commodities actually reported in that
//   district that day (falls back to the full list if the district has no
//   markets, or reported nothing, so the picker is never left empty).
//   Without them: the full Agmarknet commodity list, as before.
// ─────────────────────────────────────────────────────────────────────────────
exports.getCommodities = async (req, res) => {
  const { districtId, date } = req.query;

  try {
    if (districtId && isValidDate(date)) {
      const { commodities, scoped } = await agmarknetService.getAvailableCommodities({
        stateId: agmarknetService.TAMIL_NADU_STATE_ID,
        districtId,
        date,
      });
      return res.json({ success: true, data: commodities, scoped });
    }

    const commodities = await agmarknetService.getCommodities();
    res.json({ success: true, data: commodities, scoped: false });
  } catch (err) {
    handleAgmarknetError(res, err, 'getCommodities');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mandi/prices?date=&state(Id)=&district(Id)=&market(Id)=&commodity(Id)=
// The main "Check Market Price" endpoint used by the See All screen.
// ─────────────────────────────────────────────────────────────────────────────
exports.getPrice = async (req, res) => {
  const { date, stateId, districtId, marketId, commodityId } = req.query;

  if (!isValidDate(date)) {
    return res.status(400).json({ success: false, message: 'A valid date (YYYY-MM-DD) is required.' });
  }
  if (!stateId || !districtId || !commodityId) {
    return res.status(400).json({
      success: false,
      message: 'state, district and commodity are required.',
    });
  }

  try {
    const price = await agmarknetService.getPriceForSelection({
      stateId,
      districtId,
      marketId: marketId || null,
      commodityId,
      date,
    });

    if (!price) {
      return res.json({
        success: true,
        data: null,
        message: 'No mandi price data is available for this selection. Try another date, market, or crop.',
      });
    }

    res.json({ success: true, data: price });
  } catch (err) {
    handleAgmarknetError(res, err, 'getPrice');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mandi/trend?date=&stateId=&districtId=&marketId=&commodityId=
// Feeds the existing MiniChart sparkline on the dashboard.
// ─────────────────────────────────────────────────────────────────────────────
exports.getTrend = async (req, res) => {
  const { date, stateId, districtId, marketId, commodityId } = req.query;

  if (!isValidDate(date)) {
    return res.status(400).json({ success: false, message: 'A valid date (YYYY-MM-DD) is required.' });
  }
  if (!stateId || !districtId || !commodityId) {
    return res.status(400).json({
      success: false,
      message: 'state, district and commodity are required.',
    });
  }

  try {
    const trend = await agmarknetService.getTrendForSelection({
      stateId,
      districtId,
      marketId: marketId || null,
      commodityId,
      date,
    });

    if (!trend) {
      return res.json({ success: true, data: null });
    }

    res.json({ success: true, data: trend });
  } catch (err) {
    handleAgmarknetError(res, err, 'getTrend');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mandi/dashboard-prices?state=Tamil Nadu&district=Madurai&crops=Tomato,Brinjal&date=
//
// Convenience endpoint for the Farmer Dashboard's Market Prices card. Takes
// the state/district/crop NAMES the dashboard already has (from the existing
// Land and Crop data it loaded) and resolves them to Agmarknet ids
// internally, so the frontend never has to know about Agmarknet ids at all.
// ─────────────────────────────────────────────────────────────────────────────
exports.getDashboardPrices = async (req, res) => {
  const { district, crops, date } = req.query;

  if (!district || !crops) {
    return res.status(400).json({
      success: false,
      message: 'district and crops are required.',
    });
  }

  const cropNames = crops.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 2);
  if (cropNames.length === 0) {
    return res.json({ success: true, data: [] });
  }

  const effectiveDate = isValidDate(date) ? date : new Date().toISOString().slice(0, 10);

  try {
    // Tamil Nadu only — see TAMIL_NADU_STATE_ID in agmarknetService.
    const stateId = agmarknetService.TAMIL_NADU_STATE_ID;
    const districtId = await agmarknetService.resolveDistrictIdByName(stateId, district);

    const results = await Promise.all(
      cropNames.map(async (cropName) => {
        const commodityId = await agmarknetService.resolveCommodityIdByName(cropName);
        if (!commodityId || !districtId) {
          return { cropName, price: null, trend: null };
        }

        const [price, trend] = await Promise.all([
          agmarknetService.getPriceForSelection({
            stateId,
            districtId,
            marketId: null,
            commodityId,
            date: effectiveDate,
          }),
          agmarknetService.getTrendForSelection({
            stateId,
            districtId,
            marketId: null,
            commodityId,
            date: effectiveDate,
          }),
        ]);

        return { cropName, price, trend };
      })
    );

    res.json({ success: true, data: results });
  } catch (err) {
    handleAgmarknetError(res, err, 'getDashboardPrices');
  }
};

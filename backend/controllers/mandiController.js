const agmarknetService = require('../services/agmarknetService');

// ── Short-lived cache for /nearby-prices ─────────────────────────────────────
// The underlying Agmarknet fan-out (date walk-back + per-commodity price/trend
// calls) is expensive and occasionally slow enough to approach the frontend's
// timeout. Prices don't meaningfully change minute to minute, so cache by
// district+date+limit for a few minutes — this also means "refresh dashboard"
// stays fast and still gets genuinely fresh data every few minutes rather than
// re-running the full expensive fetch on every single pull-to-refresh.
const NEARBY_CACHE_TTL_MS = 5 * 60 * 1000;
const nearbyPricesCache = new Map();

function getCached(key) {
  const entry = nearbyPricesCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > NEARBY_CACHE_TTL_MS) {
    nearbyPricesCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  nearbyPricesCache.set(key, { data, time: Date.now() });
}

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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mandi/nearby-prices?district=&date=&limit=
//
// For the dashboard's auto-scrolling market ticker — real prices for whatever
// crops are ACTUALLY being reported near the farmer's district today, not
// just the crop(s) they personally registered. Reuses the same "what's
// actually reported here" resolution as the commodity picker on the See All
// screen, so this list is never hard-coded and never made up.
// ─────────────────────────────────────────────────────────────────────────────
exports.getNearbyPrices = async (req, res) => {
  const { district, date } = req.query;
  const limit = Math.min(Number(req.query.limit) || 6, 20);

  if (!district) {
    return res.status(400).json({
      success: false,
      message: 'district is required.',
    });
  }

  const effectiveDate = isValidDate(date) ? date : new Date().toISOString().slice(0, 10);
  const cacheKey = `${district.toLowerCase()}|${effectiveDate}|${limit}`;

  const cached = getCached(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  try {
    const stateId = agmarknetService.TAMIL_NADU_STATE_ID;
    const districtId = await agmarknetService.resolveDistrictIdByName(stateId, district);

    if (!districtId) {
      return res.json({ success: true, data: [] });
    }

    // Some districts (Chennai notably) have zero Agmarknet-registered
    // markets of their own — there is no such thing as "local" data for
    // them, structurally. Everywhere else, we hold the ticker to strictly
    // local (market/district-level) results; only for these do we allow the
    // state-wide "nearest real market" fallback through, and the frontend
    // labels it clearly when that happens.
    const districtMarkets = await agmarknetService.getMarkets(districtId);
    const hasNoLocalMarkets = districtMarkets.length === 0;

    // Today may genuinely have zero reports yet — mandis submit through the
    // day, so early morning (or right after midnight) "today" can be empty
    // even though yesterday's real, still-useful prices exist. Walk back a
    // few days to the most recent one that actually has scoped local data,
    // rather than showing an empty ticker when perfectly good recent prices
    // are sitting right there. Districts with no market of their own can
    // never scope by date, so there's nothing to walk back for.
    let resolvedDate = effectiveDate;
    let commodities;
    if (hasNoLocalMarkets) {
      ({ commodities } = await agmarknetService.getAvailableCommodities({ stateId, districtId, date: resolvedDate }));
    } else {
      for (let daysBack = 0; daysBack < 5; daysBack++) {
        const candidateDate = new Date(effectiveDate);
        candidateDate.setDate(candidateDate.getDate() - daysBack);
        const candidateISO = candidateDate.toISOString().slice(0, 10);

        const result = await agmarknetService.getAvailableCommodities({ stateId, districtId, date: candidateISO });
        if (result.scoped && result.commodities.length > 0) {
          resolvedDate = candidateISO;
          commodities = result.commodities;
          break;
        }
        if (daysBack === 0) commodities = result.commodities; // keep today's (likely unscoped) as the last resort
      }
    }

    // Scan a larger candidate pool than `limit` — after dropping anything
    // that only resolved via the state-wide fallback (see below), we still
    // want a full-looking ticker rather than whatever's left over. Kept at
    // 2x rather than 3x — each candidate fans out into ~8 concurrent
    // Agmarknet calls (price + trend, each with 4 sub-requests), so this
    // multiplier has an outsized effect on total request latency.
    const selected = commodities.slice(0, limit * 2);

    // allSettled, not all — Agmarknet occasionally times out or errors on
    // one commodity out of a batch. A single straggler shouldn't take the
    // whole ticker down; we just drop that one and show the rest.
    const settled = await Promise.allSettled(
      selected.map(async (commodity) => {
        const [price, trend] = await Promise.all([
          agmarknetService.getPriceForSelection({
            stateId,
            districtId,
            marketId: null,
            commodityId: commodity.id,
            date: resolvedDate,
          }),
          agmarknetService.getTrendForSelection({
            stateId,
            districtId,
            marketId: null,
            commodityId: commodity.id,
            date: resolvedDate,
          }),
        ]);

        return { cropName: commodity.name, price, trend };
      })
    );

    // "Nearby" means genuinely reported in or near this district (matchLevel
    // 'market' or 'district') — never the state-wide "nearest reporting
    // market anywhere in Tamil Nadu" fallback, which could be hundreds of
    // km away and isn't what "near you" means on the dashboard. The one
    // exception: districts with no market of their own have no other real
    // data to show, so the fallback is allowed through there (still labeled
    // by the frontend via matchLevel === 'state').
    const results = settled
      .filter((r) => r.status === 'fulfilled' && r.value.price)
      .map((r) => r.value)
      .filter((r) => hasNoLocalMarkets || r.price.matchLevel !== 'state')
      .slice(0, limit);

    setCached(cacheKey, results);
    res.json({ success: true, data: results });
  } catch (err) {
    handleAgmarknetError(res, err, 'getNearbyPrices');
  }
};

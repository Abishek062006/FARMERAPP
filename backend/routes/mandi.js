const express = require('express');
const axios = require('axios');
const router = express.Router();
const mandiController = require('../controllers/mandiController');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const Warehouse = require('../models/Warehouse');
const { resolveDistrict } = require('../services/geoService');
const holdDecision = require('../services/holdDecisionService');
const yieldBench = require('../services/yieldBenchmarkService');
const saleWindow = require('../services/saleWindowService');
const agmarknet = require('../services/agmarknetService');

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

// B3: sell-now-or-hold advice. Phase D swaps the engine behind this same path.
router.get('/sale-window', mandiController.getSaleWindow);

/**
 * GET /api/mandi/yield-benchmark?commodity=&district=
 *
 * What this crop has actually yielded in this district. NOT a forecast, and
 * NOT D5 — see services/yieldBenchmarkService.js for why the trained yield
 * model cannot be served on data that stops in 2017.
 */
router.get('/yield-benchmark', requireAuth, async (req, res) => {
  try {
    const { commodity } = req.query;
    const district = req.query.district
      || (req.profile && req.profile.location && req.profile.location.district);
    if (!commodity) return res.status(400).json({ success: false, error: 'Which crop?' });
    if (!district) return res.status(400).json({ success: false, error: 'Which district?' });
    res.json({ success: true, benchmark: yieldBench.benchmarkFor(commodity, district) });
  } catch (err) {
    console.error('GET /mandi/yield-benchmark', err);
    res.status(500).json({ success: false, error: 'Could not load that yield record' });
  }
});

/**
 * GET /api/mandi/district-yields?district= — everything recorded here, best first.
 */
router.get('/district-yields', requireAuth, async (req, res) => {
  try {
    const district = req.query.district
      || (req.profile && req.profile.location && req.profile.location.district);
    if (!district) return res.status(400).json({ success: false, error: 'Which district?' });
    res.json({ success: true, ...yieldBench.forDistrict(district) });
  } catch (err) {
    console.error('GET /mandi/district-yields', err);
    res.status(500).json({ success: false, error: 'Could not load district yields' });
  }
});

/**
 * GET /api/mandi/hold-decision — H2. "Hold" priced in rupees.
 *   ?commodity=&district=&quantityKg=&pricePerKg=&days=
 *
 * Composes D1's forecast, D2's action and H1's storage rates into a net gain,
 * against every nearby godown and against keeping it on the farm. Refuses
 * rather than extrapolating when the horizon runs past what D1 was measured on.
 */
// requireRole, not requireAuth: this is a farmer's decision about a farmer's
// lot, and requireRole is what attaches req.profile — the district fallback
// below reads from it and would be silently dead behind requireAuth alone.
router.get('/hold-decision', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const { commodity } = req.query;
    if (!commodity)
      return res.status(400).json({ success: false, error: 'Which crop?' });

    const district = resolveDistrict(req.query.district)
      || (req.profile && req.profile.location && resolveDistrict(req.profile.location.district));
    if (!district)
      return res.status(400).json({ success: false, error: 'Which district?' });

    const quantityKg = Number(req.query.quantityKg) || 0;
    if (!quantityKg)
      return res.status(400).json({ success: false, error: 'How much are you holding?' });

    const days = Math.max(1, Number(req.query.days) || 7);
    const pricePerKg = Number(req.query.pricePerKg) || 0;

    // Only structures this crop can actually go in reach the maths; the rest
    // are reported by /warehouses/near with their reason.
    const warehouses = await Warehouse.find({ district, active: true }).lean();

    const decision = await holdDecision.priceTheHold({
      commodity, district, quantityKg, pricePerKg, days, warehouses,
    });

    res.json({
      success: true,
      decision,
      storageNotice: warehouses.some((w) => w.dataSource === 'seed_illustrative')
        ? 'Storage rates come from illustrative records, not a live registry. Ring the godown for its real rate.'
        : null,
    });
  } catch (err) {
    console.error('GET /mandi/hold-decision', err);
    res.status(500).json({ success: false, error: 'Could not price that hold' });
  }
});

/**
 * GET /api/mandi/price-outlook — D1, FOR THE FARMER, DAY BY DAY.
 *   ?commodity=&district=&pricePerKg=&days=
 *
 * ═══ THIS IS SURFACING, NOT TRAINING ══════════════════════════════════════
 *
 * D1 has shipped for some time (LightGBM, 1.92M rows, 36 commodities,
 * 15.51% MAPE against a 17.45% naive baseline, 33 of 35 commodities beating
 * persistence) and was reachable only as a 7/14-day aside on
 * /api/mandi/sale-window, consumed by a harvest modal and a buyer's listing
 * screen. The farmer had no screen that answered "what is this likely to
 * fetch over the next fortnight".
 *
 * ⚠️ FOUR RULES, EVERY ONE OF THEM LOAD-BEARING:
 *
 * 1. IT REFUSES PAST 14 DAYS. MAPE was measured for horizons 1-14 only. A
 *    rupee figure on an unmeasured horizon is a guess wearing a decimal point.
 *
 * 2. IT FORECASTS THE DISTRICT MODAL, NOT THE FARMER'S OWN PRICE. So the
 *    forecast's PERCENTAGE is applied to the farmer's rate — never the modal
 *    subtracted from it. That exact error once produced a ₹1.96 lakh "gain"
 *    from a forecast predicting a 9% FALL: wrong sign, three extra digits,
 *    entirely plausible on screen.
 *
 * 3. A PER-COMMODITY REFUSAL TRAVELS AS WORDS. NO_SKILL / LOW_SKILL are
 *    FINDINGS, not errors, and they reach the screen.
 *
 * 4. THE STATISTICAL READ IS ALWAYS PRESENT. If the AI service is down the
 *    farmer still gets saleWindowService's arithmetic over real Agmarknet
 *    history. The ML is an ADDITIVE layer, by design.
 */
/**
 * GET /api/mandi/forecastable-crops — WHICH CROPS D1 WILL ANSWER FOR.
 *
 * ⚠️ THIS EXISTS BECAUSE THE FIRST VERSION OF THE OUTLOOK SCREEN HAD NO CROP
 * PICKER AT ALL. Its only entry point passed `mandiPrices[0].cropName` — the
 * first row of the dashboard's nearby-price ticker — so the screen always
 * opened on whatever crop happened to be listed first (Bengal Gram, in the
 * district it was tested in) and a farmer had no way to ask about their own
 * crop. A forecast for an arbitrary crop is not a feature.
 *
 * The list comes from the model's own serving gate, so the picker cannot
 * offer a crop the model then refuses. `refused` travels too, with its reason
 * — a farmer looking for Methi should be told it cannot be forecast here,
 * not left wondering why it is missing from the list.
 */
router.get('/forecastable-crops', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const { data } = await axios.get(
      `${process.env.AI_SERVICE_URL || 'http://localhost:5001'}/price-forecast/commodities`,
      { timeout: 6000 }
    );
    if (!data?.success) return res.json({ success: true, available: false, served: [], refused: [] });

    // The farmer's own registered crops float to the top — they are the ones
    // this person actually has money riding on.
    let mine = [];
    try {
      const Crop = require('../models/Crop');
      const rows = await Crop.find({ firebaseUid: req.firebaseUid, isActive: true, isHarvested: false })
        .select('name').lean();
      const { CROPS } = require('../data/agroZones');
      const mandiNameOf = new Map(CROPS.map((c) => [c.name, c.mandiName]));
      mine = [...new Set(rows.map((r) => mandiNameOf.get(r.name)).filter(Boolean))];
    } catch (e) {
      // A failure here costs ordering, not correctness — the full list still
      // ships rather than the screen showing nothing.
      console.error('⚠️ own-crop lookup failed:', e.message);
    }

    const mineSet = new Set(mine);
    const served = data.data.served.map((c) => ({ ...c, mine: mineSet.has(c.commodity) }));
    served.sort((a, b) => (b.mine - a.mine) || (a.modelMape - b.modelMape));

    res.json({
      success: true,
      available: true,
      served,
      refused: data.data.refused,
      maxServeMape: data.data.maxServeMape,
      note: 'Only crops the model measurably beats a naive "today\'s price holds" forecast on '
          + 'are listed. The rest are named with the reason rather than hidden.',
    });
  } catch (err) {
    // The AI service being down is not an error for this screen — it just
    // means no picker. The statistical read still works.
    res.json({ success: true, available: false, served: [], refused: [], code: 'SERVICE_UNAVAILABLE' });
  }
});

router.get('/price-outlook', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const { commodity } = req.query;
    if (!commodity)
      return res.status(400).json({ success: false, error: 'Which crop?' });

    const district = resolveDistrict(req.query.district)
      || (req.profile && req.profile.location && resolveDistrict(req.profile.location.district));
    if (!district)
      return res.status(400).json({ success: false, error: 'Which district?' });

    // Clamped, and the clamp is REPORTED rather than silently applied — a
    // farmer who asked for 30 days must be told why they got 14.
    const askedDays = Number(req.query.days) || saleWindow.MAX_FORECAST_DAYS;
    const days = Math.max(1, Math.min(saleWindow.MAX_FORECAST_DAYS, askedDays));
    const clamped = askedDays > saleWindow.MAX_FORECAST_DAYS;

    const endDate = new Date().toISOString().slice(0, 10);
    const [districtId, commodityId] = await Promise.all([
      agmarknet.resolveDistrictIdByName(agmarknet.DEFAULT_STATE_ID, district),
      agmarknet.resolveCommodityIdByName(commodity),
    ]);
    if (!districtId || !commodityId)
      return res.json({
        success: true,
        available: false,
        code: !districtId ? 'district_not_in_agmarknet' : 'crop_not_in_agmarknet',
        commodity, district,
        message: !districtId
          ? `Agmarknet has no market data for ${district}.`
          : `Agmarknet does not track ${commodity}.`,
      });

    // ── NEAREST-REPORTING-DISTRICT FALLBACK ──────────────────────────────
    // ⚠️ Verified live for a real farmer in Beed: Beed's own APMCs had
    // reported Onion on only 23 of the last 75 days — genuinely too thin to
    // forecast from, and no amount of retraining D1 invents reports Beed's
    // own mandis never filed. `getDailySeriesNearestReporting` tries the
    // farmer's own district first and only reaches for the NEAREST district
    // that actually clears the reporting bar — by real distance, never
    // blended, and it is ALWAYS SAID which district is being shown.
    const nearest = await saleWindow.getDailySeriesNearestReporting({
      district, districtId, commodityId, endDate,
    });
    const stats = saleWindow.analyse(nearest.series, { endDate });

    const horizons = Array.from({ length: days }, (_, i) => i + 1);
    // ⚠️ THE FORECAST IS ASKED FOR THE DISTRICT ACTUALLY BEING SHOWN, NEVER
    // THE FARMER'S OWN NAME OVER A NEIGHBOR'S SERIES. D1 treats district as a
    // learned per-district pattern; mislabelling a substituted series as
    // "Beed" would be exactly the contamination getDailySeries's own
    // no-blending rule exists to prevent.
    const [fc, sellHold] = await Promise.all([
      saleWindow.getForecastOrRefusal({
        districtId: nearest.districtIdUsed, commodityId,
        district: nearest.districtUsed, commodity, endDate, horizons,
      }),
      // D2 stays on the farmer's OWN district — narrower in scope on purpose;
      // this fallback answers the reported D1/statistical complaint only.
      saleWindow.getSellHold({ districtId, commodityId, district, commodity, endDate }),
    ]);

    // ── THE FARMER'S OWN PRICE, IF THEY GAVE US ONE ──────────────────────
    // ⚠️ PERCENTAGE APPLIED, NEVER A DIFFERENCE OF TWO PRICE BASES.
    const myPrice = Number(req.query.pricePerKg);
    const hasMyPrice = Number.isFinite(myPrice) && myPrice > 0;

    let outlook = null;
    if (fc.ok) {
      outlook = fc.forecast.forecast.map((p) => ({
        horizon: p.horizon,
        date: p.date,
        // Agmarknet quotes ₹/QUINTAL and this app trades in ₹/kg. Comparing
        // them directly reports every farmer as underpaid by a factor of 100.
        districtModalPerQuintal: p.modalPrice,
        districtModalPerKg: Math.round((p.modalPrice / 100) * 100) / 100,
        changePct: p.changePct,
        yourPricePerKg: hasMyPrice
          ? Math.round(myPrice * (1 + p.changePct / 100) * 100) / 100
          : null,
      }));
    }

    res.json({
      success: true,
      commodity,
      district,
      // ⚠️ WHICH DISTRICT'S PRICES ARE ACTUALLY BEING SHOWN, NAMED. `district`
      // above stays the farmer's OWN district (what they asked about);
      // `districtSource` says whose reports the numbers below actually come
      // from, and is never silent about the difference.
      districtSource: {
        district: nearest.districtUsed,
        matchLevel: nearest.matchLevel,   // 'own' | 'nearby_district'
        distanceKm: nearest.distanceKm,
        reportedDaysOwn: nearest.matchLevel === 'own' ? nearest.series.length : null,
      },
      asOf: endDate,
      horizonDays: days,
      maxHorizonDays: saleWindow.MAX_FORECAST_DAYS,
      clamped,
      clampNote: clamped
        ? `The model was only measured out to ${saleWindow.MAX_FORECAST_DAYS} days, so it will not `
          + 'put a figure on anything further out.'
        : null,

      // The model's own answer, or its refusal, in its own words.
      forecast: fc.ok
        ? {
            available: true,
            originDate: fc.forecast.originDate,
            originModalPerQuintal: fc.forecast.originPrice,
            reportedDays: fc.forecast.reportedDays,
            points: outlook,
            peak: fc.forecast.peak,
            // ⚠️ NEVER THE MODEL'S MAPE WITHOUT THE NAIVE BASELINE BESIDE IT.
            // Persistence is a strong forecaster for commodity prices; the
            // model number alone says nothing about whether it is any good.
            accuracy: fc.forecast.metrics || null,
            engine: fc.forecast.engine,
          }
        : { available: false, ...fc },

      // ⚠️ WHAT THIS IS A FORECAST OF. The model predicts the DISTRICT MODAL.
      // Anything applied to the farmer's own rate is that modal's PERCENTAGE
      // movement, and the response says so where a screen cannot forget it.
      basis: {
        forecasts: 'district_modal_price',
        yourPriceMethod: hasMyPrice ? 'percentage_of_forecast_applied_to_your_rate' : null,
        note: 'The model forecasts the district mandi modal price, not what any one buyer will '
            + 'pay you. Your figures apply the forecast\'s percentage movement to the rate you '
            + 'entered.'
          + (nearest.matchLevel === 'nearby_district'
              ? ` Your own district (${district}) hasn't reported this crop enough recently, so `
                + `this is based on ${nearest.districtUsed}'s reported prices, the nearest `
                + `district that has (~${nearest.distanceKm} km away).`
              : ''),
      },

      // Always present. This is the arithmetic over real Agmarknet history and
      // it is what the farmer falls back to when the model is unavailable.
      statistical: stats,
      sellHold: sellHold || null,
      engine: fc.ok
        ? (sellHold && sellHold.confidence !== 'uncertain' ? 'model' : 'statistical+model')
        : 'statistical',
    });
  } catch (err) {
    console.error('GET /mandi/price-outlook', err);
    res.status(500).json({ success: false, error: 'Could not build that price outlook' });
  }
});

module.exports = router;

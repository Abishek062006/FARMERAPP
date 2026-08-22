// Crop recommendation "brain": filters by real agronomic constraints, then
// ranks by real data (live Agmarknet price trend, how many farmers on this
// platform are already growing it nearby, and the farmer's own track record
// with it) — no LLM involved in deciding what or how good. The LLM is only
// used afterwards (see groqService.explainCropRecommendations) to phrase the
// reason text for whatever this module already decided.

const Land = require('../models/Land');
const Crop = require('../models/Crop');
const agmarknet = require('./agmarknetService');
const { CROPS, resolveZone } = require('../data/agroZones');

// Bounded-concurrency map — a farmer in a well-covered zone can have 30+
// agronomically valid candidate crops (82 crops across 7 zones now), and
// each one needs a live Agmarknet price lookup. Running all of them via a
// plain Promise.all would fire dozens of simultaneous requests at a public
// government API on a single tap; this caps how many are in flight at once
// without dropping any candidate from being scored.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Races a promise against a timeout, resolving to `fallback` instead of
// rejecting — used to give each live price lookup a tighter budget than
// agmarknetService's own 20s request timeout, since here we're checking up
// to MAX_CANDIDATES_TO_SCORE of them per farmer request, not just one.
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// A dense zone (Southern Zone alone has 65 of the 82 crops) can pass 30+
// crops through the agronomic filter. Ranking all of them live only to show
// the top 6 wastes time and hammers Agmarknet for no benefit, so we cap the
// pool that actually gets scored — sampled at an even stride through the
// list (not a contiguous slice) so a big zone doesn't get scored as
// all-cereals-first just because of category ordering in agroZones.js.
const MAX_CANDIDATES_TO_SCORE = 18;
const PRICE_LOOKUP_TIMEOUT_MS = 7000;

function sampleEvenly(items, max) {
  if (items.length <= max) return items;
  const stride = items.length / max;
  const picked = [];
  for (let i = 0; i < max; i++) {
    picked.push(items[Math.floor(i * stride)]);
  }
  return picked;
}

function getCandidateCrops({ district, soilType, waterSource, season }) {
  const zone = resolveZone(district);

  return CROPS.filter((crop) => {
    if (zone && !crop.zones.includes(zone)) return false;
    if (soilType && !crop.soils.includes(soilType)) return false;
    if (waterSource && !crop.water.includes(waterSource)) return false;
    if (season && !crop.seasons.includes(season)) return false;
    return true;
  });
}

// +1 if price is trending up recently, -1 if down, 0 if no real data was
// found (never fabricated — matches agmarknetService's own "return null,
// don't fake it" convention).
async function getPriceScore(district, mandiName) {
  const neutral = { score: 0, trend: null };
  try {
    return await withTimeout(
      (async () => {
        const districtId = await agmarknet.resolveDistrictIdByName(agmarknet.TAMIL_NADU_STATE_ID, district);
        if (!districtId) return neutral;

        const commodityId = await agmarknet.resolveCommodityIdByName(mandiName);
        if (!commodityId) return neutral;

        const today = new Date().toISOString().slice(0, 10);
        const trendData = await agmarknet.getTrendForSelection({
          stateId: agmarknet.TAMIL_NADU_STATE_ID,
          districtId,
          commodityId,
          date: today,
        });

        if (!trendData) return neutral;
        return { score: trendData.trend === 'up' ? 1 : -1, trend: trendData.trend };
      })(),
      PRICE_LOOKUP_TIMEOUT_MS,
      neutral
    );
  } catch (err) {
    console.error(`⚠️ Price lookup failed for ${mandiName}:`, err.message);
    return neutral;
  }
}

// The district's registered, active land IDs — fetched once per
// recommendation request (not once per candidate crop) and reused for every
// candidate's saturation check below.
async function getDistrictLandIds(district) {
  try {
    const lands = await Land.find({ 'location.district': district, isActive: true })
      .select('_id')
      .lean();
    return lands.map((l) => l._id);
  } catch (err) {
    console.error(`⚠️ Land lookup failed for ${district}:`, err.message);
    return [];
  }
}

// How many farmers on this platform already have this crop active in the
// same district right now. Few growers = opportunity, many = glut risk —
// this is deliberately the same signal a surplus-detection feature would
// use later, just with the sign read the opposite way.
async function getSaturationScore(landIds, cropName) {
  if (!landIds.length) return { score: 0, growerCount: 0 };

  try {
    const growerCount = await Crop.countDocuments({
      landId: { $in: landIds },
      name: cropName,
      isActive: true,
      isHarvested: false,
    });

    let score = 0;
    if (growerCount <= 2) score = 1;
    else if (growerCount >= 8) score = -1;

    return { score, growerCount };
  } catch (err) {
    console.error(`⚠️ Saturation lookup failed for ${cropName}:`, err.message);
    return { score: 0, growerCount: 0 };
  }
}

// +1 if this farmer grew this crop before and hit at least 80% of their
// planned quantity as actual yield, -0.5 if they grew it and fell short,
// 0 if they've never grown it (no signal either way).
async function getHistoryScore(firebaseUid, cropName) {
  if (!firebaseUid) return { score: 0 };

  try {
    const past = await Crop.findOne({ firebaseUid, name: cropName, isHarvested: true })
      .sort({ harvestDate: -1 })
      .lean();

    if (!past) return { score: 0 };

    const metTarget = past.actualYield?.value && past.quantity && past.actualYield.value >= past.quantity * 0.8;
    return { score: metTarget ? 1 : -0.5 };
  } catch (err) {
    console.error(`⚠️ History lookup failed for ${cropName}:`, err.message);
    return { score: 0 };
  }
}

function demandLabel(score) {
  if (score >= 1.5) return 'High';
  if (score >= 0) return 'Medium';
  return 'Low';
}

async function rankCandidates({ candidates, district, firebaseUid, limit = 6 }) {
  const landIds = await getDistrictLandIds(district);
  const pool = sampleEvenly(candidates, MAX_CANDIDATES_TO_SCORE);

  const scored = await mapWithConcurrency(pool, 8, async (crop) => {
    const [price, saturation, history] = await Promise.all([
      getPriceScore(district, crop.mandiName),
      getSaturationScore(landIds, crop.name),
      getHistoryScore(firebaseUid, crop.name),
    ]);

    const score = price.score + saturation.score + history.score;

    return {
      name: crop.name,
      tamilName: crop.tamilName,
      duration: crop.duration,
      typicalYield: crop.typicalYield,
      score,
      demand: demandLabel(score),
      signals: {
        priceTrend: price.trend,
        growersNearby: saturation.growerCount,
      },
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

module.exports = {
  getCandidateCrops,
  rankCandidates,
};

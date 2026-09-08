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
// Six are shown. Scoring 18 was costing three full waves of live Agmarknet
// lookups to throw away two thirds of them; 12 keeps a real choice while
// fitting inside RANK_DEADLINE_MS on a cold cache.
const MAX_CANDIDATES_TO_SCORE = 12;
// ⚠️ 7000 was too tight and it was silently costing every crop its price
// signal. Measured cold against live Agmarknet (2026-08-27, Nashik): a single
// getTrendForSelection is 2.7s for a thinly-traded crop and 7.6-16.5s for
// Onion, Tomato and Soyabean, because each one pulls that commodity's whole
// monthly state series. At 7s EVERY heavily-traded crop — the ones a farmer
// most needs a read on — timed out, and under the old code that timeout was
// scored as a neutral 0 and quietly folded into a demand label. Raised to sit
// above the measured worst case. A lookup that still misses is reported as
// `lookup_failed` and gets NO label, which is the point.
//
// The second request is effectively free: getMonthlyCommodityPrices caches
// per (state, commodity, month) for 6h, so only a cold process pays this.
const PRICE_LOOKUP_TIMEOUT_MS = 18000;

// ⚠️ A PER-LOOKUP BUDGET ALONE IS NOT A BUDGET. 18 candidates at concurrency
// 8 is three waves, so an 18s per-lookup ceiling permits a ~54s request —
// and CropRecommendationScreen gives the whole call 30s, so the farmer would
// have got a network error instead of recommendations. Measured cold: 37.8s.
// This caps the RANKING PHASE as a whole and leaves the rest of the 30s for
// Groq to phrase the reasons.
//
// Crops still in flight when it expires are reported `lookup_failed` and get
// NO demand label — a partial answer that says which parts are missing beats
// both a timeout and a full set of labels invented from the signals that did
// come back. Warm (6h commodity cache) the whole phase is ~8s and nothing
// hits this at all.
const RANK_DEADLINE_MS = 20000;
// ⚠️ LOWER IS FASTER HERE, WHICH IS THE OPPOSITE OF THE OBVIOUS READING.
// This was 8. Each lookup downloads that commodity's whole monthly state
// series, so eight in flight starve each other's bandwidth and ALL of them
// land late — measured cold, 18 candidates at concurrency 8 produced ONE
// usable price signal inside the deadline. The same measurement at 12
// candidates and concurrency 4 produced TEN, and finished sooner (17.4s vs
// 21.6s). Don't "optimise" this back up without re-measuring cold.
const PRICE_LOOKUP_CONCURRENCY = 4;

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

// ─────────────────────────────────────────────────────────────────────────────
// THE PRICE SIGNAL, AND WHY IT IS ALLOWED TO BE ABSENT
//
// 🐛 This used to return `{ score: 0, trend: null }` for FIVE different
// situations — district unknown to Agmarknet, crop unknown to Agmarknet, no
// series for that crop in that district, a timeout, and a thrown error — and
// rankCandidates then added that 0 to the other signals as though it were a
// measurement. It is not. "Nobody reported a price" and "the price is
// steady" are opposite facts, and summing the first as 0 alongside a
// POSITIVE "few growers nearby" score is how a farmer was told
// **guava = High demand for Nashik** and then found no guava price on the
// mandi screen. Both sentences came from this app.
//
// So absence is now carried, not flattened: `available: false` plus the
// REASON, and a crop with no price signal gets no demand label at all. Same
// refusal trustService, yieldBenchmarkService and D1 already make.
//
// ⚠️ `matchLevel` is checked, and that is load-bearing. getTrendForSelection
// falls back to markets ANYWHERE in the state when the farmer's own district
// has nothing — correct for a price screen that labels the fallback, and
// completely wrong here, where the answer is presented as a demand read for
// THEIR district. A Kolhapur series is not evidence about Nashik.
// ─────────────────────────────────────────────────────────────────────────────

// Reason codes. Every one of them produces `demand: null`; they are kept
// apart because "this crop does not trade here" and "Agmarknet timed out"
// call for different words on the card and different action from the farmer.
const PRICE_UNAVAILABLE = {
  DISTRICT: 'district_not_in_agmarknet',
  CROP: 'crop_not_in_agmarknet',
  NO_DATA: 'no_mandi_data',
  ELSEWHERE: 'reported_elsewhere_only',
  FAILED: 'lookup_failed',
};

function noPrice(reason) {
  return { available: false, score: null, trend: null, reason, market: null };
}

async function getPriceScore(district, mandiName, deadlineAt) {
  // Already out of time: refuse without opening a connection. Firing a
  // request we have committed to ignoring would just add load to a public
  // government API for an answer nobody will read.
  const budget = Math.min(PRICE_LOOKUP_TIMEOUT_MS, deadlineAt - Date.now());
  if (budget <= 0) return noPrice(PRICE_UNAVAILABLE.FAILED);

  try {
    return await withTimeout(
      (async () => {
        const districtId = await agmarknet.resolveDistrictIdByName(agmarknet.DEFAULT_STATE_ID, district);
        if (!districtId) return noPrice(PRICE_UNAVAILABLE.DISTRICT);

        const commodityId = await agmarknet.resolveCommodityIdByName(mandiName);
        if (!commodityId) return noPrice(PRICE_UNAVAILABLE.CROP);

        const today = new Date().toISOString().slice(0, 10);
        const trendData = await agmarknet.getTrendForSelection({
          stateId: agmarknet.DEFAULT_STATE_ID,
          districtId,
          commodityId,
          date: today,
        });

        if (!trendData) return noPrice(PRICE_UNAVAILABLE.NO_DATA);

        // 'state' means the series came from some other district. Reported
        // as its own reason rather than as "no data", because it is a
        // different fact — the crop trades in Maharashtra, just not here.
        if (trendData.matchLevel !== 'market' && trendData.matchLevel !== 'district') {
          return { ...noPrice(PRICE_UNAVAILABLE.ELSEWHERE), market: trendData.market };
        }

        // A flat series IS a price signal — we know the price and it is not
        // moving — so it scores 0 with available: true. That is the one
        // legitimate zero here, and it is not the same object as absence.
        const score = trendData.trend === 'up' ? 1 : trendData.trend === 'down' ? -1 : 0;
        return {
          available: true,
          score,
          trend: trendData.trend,
          changePct: trendData.changePct ?? null,
          market: trendData.market,
          reason: null,
        };
      })(),
      budget,
      noPrice(PRICE_UNAVAILABLE.FAILED)
    );
  } catch (err) {
    console.error(`⚠️ Price lookup failed for ${mandiName}:`, err.message);
    return noPrice(PRICE_UNAVAILABLE.FAILED);
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

// ⚠️ A DEMAND LABEL REQUIRES A PRICE SIGNAL. There is no `demandLabel(score)`
// taking a bare number any more, because that signature is what allowed a
// score assembled entirely out of non-price signals to be printed as
// "High demand". Demand is a claim about the MARKET; "few other farmers here
// grow it" and "you grew it well last year" are not market evidence, and on
// their own they add up to exactly the reading that sent a farmer looking for
// a guava price that does not exist in Nashik.
// ⚠️ THE PRICE SIGNAL IS WEIGHTED ×2 AND THAT IS DELIBERATE, NOT TUNING FOR
// ITS OWN SAKE. Demand is a claim about the MARKET. At equal weights a
// single "few other farmers grow it here" (+1) exactly cancelled a falling
// price (-1), so live Coriander at Nasik APMC **down 44.12% in a week** came
// out as "Medium demand" — the same category of statement as the guava bug,
// just arrived at from real data instead of missing data. Grower count is a
// SUPPLY signal and it must be able to shade a demand read, never to
// overturn the price evidence it is supposed to qualify.
const PRICE_WEIGHT = 2;

function demandFrom(price, score) {
  if (!price.available) return null;
  // Reachable only with a rising price (+2) AND a favourable second signal.
  if (score >= 2.5) return 'High';
  // A falling price (-2) cannot reach this on grower count alone (max +1).
  if (score >= 0) return 'Medium';
  return 'Low';
}

async function rankCandidates({ candidates, district, firebaseUid, limit = 6 }) {
  const deadlineAt = Date.now() + RANK_DEADLINE_MS;
  const landIds = await getDistrictLandIds(district);
  const pool = sampleEvenly(candidates, MAX_CANDIDATES_TO_SCORE);

  const scored = await mapWithConcurrency(pool, PRICE_LOOKUP_CONCURRENCY, async (crop) => {
    const [price, saturation, history] = await Promise.all([
      getPriceScore(district, crop.mandiName, deadlineAt),
      getSaturationScore(landIds, crop.name),
      getHistoryScore(firebaseUid, crop.name),
    ]);

    // `score` stays null when there is no price signal, rather than being
    // computed from the two remaining signals and quietly compared against
    // the same thresholds. A number here would be re-derivable into a label
    // by any future caller, which is the whole defect coming back.
    const score = price.available
      ? price.score * PRICE_WEIGHT + saturation.score + history.score
      : null;

    return {
      name: crop.name,
      localName: crop.localName,
      duration: crop.duration,
      typicalYield: crop.typicalYield,
      score,
      demand: demandFrom(price, score),
      // Why there is no label. Null when there IS one — an absent reason and
      // a reason of "no_mandi_data" must not be the same value.
      demandReason: price.available ? null : price.reason,
      // What the label rests on, surfaced so the card can show its own
      // evidence instead of asking the farmer to trust one adjective.
      signals: {
        priceTrend: price.trend,
        priceChangePct: price.changePct ?? null,
        priceMarket: price.market,
        priceAvailable: price.available,
        growersNearby: saturation.growerCount,
      },
    };
  });

  // Crops WITH a market signal rank first, best score first. Crops without
  // one follow in a stable, deterministic order — they are still
  // agronomically sound suggestions and dropping them would hide a real
  // option, but their position must not be readable as a ranking, so it is
  // alphabetical rather than derived from the non-price signals.
  const withSignal = scored
    .filter((c) => c.score !== null)
    .sort((a, b) => b.score - a.score);
  const withoutSignal = scored
    .filter((c) => c.score === null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...withSignal, ...withoutSignal].slice(0, limit);
}

module.exports = {
  getCandidateCrops,
  rankCandidates,
  PRICE_UNAVAILABLE,
};

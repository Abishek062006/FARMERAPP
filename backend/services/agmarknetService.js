const axios = require('axios');

// ─────────────────────────────────────────────────────────────────────────────
// Agmarknet 2.0 public API client
//
// Endpoints verified live against https://api.agmarknet.gov.in/v1 (see
// investigation notes in the PR/commit that introduced this file). Field
// names below (modalPrice, arrivalDate, cmdt_id, etc.) come directly from
// real responses, not documentation guesses.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.agmarknet.gov.in/v1';
const REQUEST_TIMEOUT_MS = 20000;

const agmarknet = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://agmarknet.gov.in',
    'Referer': 'https://agmarknet.gov.in/',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
});

// This app serves Maharashtra farmers — 20 is Agmarknet's own id for
// Maharashtra (verified live against /daily-price-arrival/filters).
// Agmarknet is a national API, so the whole price layer ports off this one
// constant; it stays a named default rather than a hardcoded literal.
const DEFAULT_STATE_ID = 20;

// ── Sentinel "All ..." rows Agmarknet includes in its filter lists ──────────
const ALL_STATE_ID = 100000;
const ALL_DISTRICT_ID = 100001;
const ALL_MARKET_ID = 100002;

// ─────────────────────────────────────────────────────────────────────────────
// Simple in-memory TTL cache (no Redis in this project — see section 11 of
// the feature spec: don't add infrastructure just for this).
// ─────────────────────────────────────────────────────────────────────────────
const cache = new Map();
// In-flight request de-duplication: if two callers ask for the same key
// while a fetch is already underway (e.g. price + trend for the same crop
// resolving concurrently), they share one HTTP call instead of firing two.
const inFlight = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value, ttlMs) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function cached(key, ttlMs, fetcher) {
  const hit = cacheGet(key);
  if (hit) return hit;

  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    try {
      const value = await fetcher();
      cacheSet(key, value, ttlMs);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

// Below this much movement across the whole 7-point window the direction is
// noise, and the series is reported as 'flat' rather than being forced into
// up/down. See the reasoning at the bottom of getTrendForSelection.
const FLAT_TREND_PCT = 2;

const METADATA_TTL_MS = 24 * 60 * 60 * 1000; // filters barely change day to day
const PRICE_TTL_MS = 6 * 60 * 60 * 1000;     // matches market.js's existing convention

// ─────────────────────────────────────────────────────────────────────────────
// Error normalization — controller maps these to farmer-facing messages,
// technical detail stays in the backend logs.
// ─────────────────────────────────────────────────────────────────────────────
class AgmarknetError extends Error {
  constructor(type, message, cause) {
    super(message);
    this.type = type; // 'TIMEOUT' | 'FORBIDDEN' | 'NETWORK' | 'UPSTREAM' | 'UNKNOWN'
    this.cause = cause;
  }
}

function normalizeError(err, context) {
  if (err.code === 'ECONNABORTED') {
    return new AgmarknetError('TIMEOUT', `Agmarknet request timed out (${context})`, err);
  }
  if (err.response?.status === 403) {
    return new AgmarknetError('FORBIDDEN', `Agmarknet blocked the request (403) (${context})`, err);
  }
  if (err.response?.status >= 500) {
    return new AgmarknetError('UPSTREAM', `Agmarknet server error ${err.response.status} (${context})`, err);
  }
  if (!err.response) {
    return new AgmarknetError('NETWORK', `Could not reach Agmarknet (${context})`, err);
  }
  return new AgmarknetError('UNKNOWN', `Agmarknet request failed (${context}): ${err.message}`, err);
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata: states / districts / markets / commodities
// Sourced from ONE call to /daily-price-arrival/filters and cached, then
// sliced server-side so the frontend never has to download the full
// 4000+ market list.
// ─────────────────────────────────────────────────────────────────────────────
async function getFilters() {
  return cached('filters', METADATA_TTL_MS, async () => {
    try {
      const { data } = await agmarknet.get('/daily-price-arrival/filters');
      if (!data?.data) {
        throw new AgmarknetError('UPSTREAM', 'Agmarknet filters response missing "data"');
      }
      return data.data;
    } catch (err) {
      if (err instanceof AgmarknetError) throw err;
      throw normalizeError(err, 'getFilters');
    }
  });
}

async function getStates() {
  const filters = await getFilters();
  return filters.state_data
    .filter((s) => s.state_id !== ALL_STATE_ID)
    .map((s) => ({ id: s.state_id, name: s.state_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getDistricts(stateId) {
  const filters = await getFilters();
  return filters.district_data
    .filter((d) => d.id !== ALL_DISTRICT_ID && String(d.state_id) === String(stateId))
    .map((d) => ({ id: d.id, name: d.district_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getMarkets(districtId) {
  const filters = await getFilters();
  return filters.market_data
    .filter((m) => m.id !== ALL_MARKET_ID && String(m.district_id) === String(districtId))
    .map((m) => ({ id: m.id, name: m.mkt_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getCommodities() {
  const filters = await getFilters();
  return filters.cmdt_data
    .map((c) => ({ id: c.cmdt_id, name: c.cmdt_name, groupId: c.cmdt_group_id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────────────────────
// REGIONAL commodity list — what is actually traded in THIS state.
//
// ⚠️ `getCommodities()` above is Agmarknet's NATIONAL list: 605 commodities
// covering every state, most of which a Maharashtra farmer will never see in
// their mandi (measured live 2026-08-27). It was being used as the fallback
// whenever a district reported nothing on the chosen date — which is most
// days, because today's report is empty until the markets close — so the
// "See all" crop picker routinely showed all 605. A farmer scrolling past
// Cardamom, Almond and Black pepper reads that as the app not knowing where
// they are.
//
// The regional list is the union of two things, and both halves are needed:
//
//   (a) EVERY commodity any Maharashtra market actually reported over the
//       last REGIONAL_LOOKBACK_DAYS. This is Agmarknet's OWN data about this
//       state — not our opinion of what Maharashtra grows — and it is what
//       makes the list honest. Measured over 9 days: 117 distinct names.
//
//   (b) The app's own canonical crop list (data/agroZones.js, 64 crops, all
//       64 exact-matching an Agmarknet commodity name). A crop the
//       recommender can suggest MUST be findable in this picker, or the two
//       screens contradict each other — see the invariant asserted in
//       scripts/testMarketIntel.js. Thin-trade crops drop out of (a) in any
//       given week; they must not drop out of the picker.
//
// This does NOT narrow the district-scoped path below. When a district
// genuinely reported commodities that day, that is a better answer than any
// state-level list and is used unchanged.
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ REQUIRED LAZILY, AND IT MUST STAY THAT WAY. data/agroZones.js requires
// THIS module back (for resolveTalukDistrict), so a top-level require here
// closes a cycle: agroZones would load while this module's exports object is
// still empty and destructure `resolveTalukDistrict` as undefined, silently
// breaking resolveZone() and therefore every crop recommendation. Node warns
// about it ("Accessing non-existent property ... inside circular dependency")
// and nothing else would.
function canonicalCropNames() {
  const { CROPS } = require('../data/agroZones');
  return new Set(CROPS.map((c) => c.mandiName.trim().toLowerCase()));
}

// One week. The union stops growing after ~4 days (109 → 117 over 9), so a
// longer window costs another 1-2MB state report per day for nothing.
const REGIONAL_LOOKBACK_DAYS = 7;

function shiftDate(dateISO, days) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Commodity names any market in the state reported across the lookback
// window ending at `date`. Individual days are allowed to fail — a partial
// union is still a Maharashtra list, and an empty one falls back to (b).
async function getStateReportedCommodityNames({ stateId, date }) {
  // A future date has no report and never will until it arrives; walk back
  // from today instead so a farmer checking tomorrow still gets a real list.
  const today = new Date().toISOString().slice(0, 10);
  const end = date > today ? today : date;

  const days = Array.from({ length: REGIONAL_LOOKBACK_DAYS }, (_, i) => shiftDate(end, -i));
  const names = new Set();

  // Concurrency 3: each day is a ~1-2MB state report and this fans out
  // against a public government API on a single tap.
  let next = 0;
  async function worker() {
    while (next < days.length) {
      const day = days[next++];
      try {
        const report = await getDailyStateReport({ stateId, date: day });
        for (const market of report || []) {
          for (const group of market.commodityGroups || []) {
            for (const commodity of group.commodities || []) {
              names.add(commodity.commodityName.trim().toLowerCase());
            }
          }
        }
      } catch (err) {
        console.error(`⚠️ [agmarknet] state report ${day} failed:`, err.message);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, days.length) }, worker));

  return names;
}

/**
 * The commodity picker's answer for a whole state.
 *
 * Returns { commodities, scope } where scope is:
 *   'state'    — the real regional list (a) ∪ (b)
 *   'app'      — Agmarknet was unreachable; the app's own 64 crops only
 *   'national' — the last resort, and it is reported as such rather than
 *                being passed off as a Maharashtra list
 */
async function getRegionalCommodities({ stateId, date }) {
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : new Date().toISOString().slice(0, 10);

  return cached(`regional:${stateId}:${day}`, PRICE_TTL_MS, async () => {
    let filters = null;
    try {
      filters = await getFilters();
    } catch (err) {
      console.error('⚠️ [agmarknet] getFilters failed for regional list:', err.message);
      throw err; // without the filter list there are no ids to return at all
    }

    const canonical = canonicalCropNames();
    const reported = await getStateReportedCommodityNames({ stateId, date: day });

    const keep = new Set([...canonical, ...reported]);
    const commodities = filters.cmdt_data
      .filter((c) => keep.has(c.cmdt_name.trim().toLowerCase()))
      .map((c) => ({ id: c.cmdt_id, name: c.cmdt_name, groupId: c.cmdt_group_id }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (commodities.length === 0) {
      // Should be unreachable — all 64 canonical names exact-match today —
      // but an empty picker is a dead end, so say what happened rather than
      // rendering nothing.
      return {
        commodities: filters.cmdt_data
          .map((c) => ({ id: c.cmdt_id, name: c.cmdt_name, groupId: c.cmdt_group_id }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        scope: 'national',
      };
    }

    return { commodities, scope: reported.size > 0 ? 'state' : 'app' };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Full state-wide daily report — every market's every reported commodity for
// one date. One ~1-2MB call covers the whole state, so it's cached per date
// and reused across every district a farmer looks at that same day.
// ─────────────────────────────────────────────────────────────────────────────
async function getDailyStateReport({ stateId, date }) {
  const cacheKey = `dailyState:${stateId}:${date}`;
  return cached(cacheKey, PRICE_TTL_MS, async () => {
    try {
      const { data } = await agmarknet.get('/prices-and-arrivals/commodity-wise/daily-report-state', {
        params: { date, stateIds: stateId, includeExcel: false },
      });
      if (!data?.success) {
        throw new AgmarknetError('UPSTREAM', data?.message || 'Agmarknet returned success:false');
      }
      return data.markets || [];
    } catch (err) {
      if (err instanceof AgmarknetError) throw err;
      throw normalizeError(err, 'getDailyStateReport');
    }
  });
}

/**
 * Commodities actually reported by markets in a district on a given date —
 * so the crop picker only shows what's real for that district instead of
 * all 600+ commodities Agmarknet tracks nationwide.
 *
 * ⚠️ Falls back to the REGIONAL list, never to the national one. A district
 * with no markets (Agmarknet's Osmanabad entry) or no report that day (which
 * is every district for today, until the markets close) still gets a
 * Maharashtra list rather than 605 commodities from every state in India.
 * The response carries `scope` so the screen can say WHICH list it is
 * showing instead of leaving the farmer to guess.
 */
async function getAvailableCommodities({ stateId, districtId, date }) {
  const [dailyReport, districtMarkets, filters] = await Promise.all([
    getDailyStateReport({ stateId, date }),
    getMarkets(districtId),
    getFilters(),
  ]);

  const districtMarketNames = new Set(districtMarkets.map((m) => m.name));
  const reportedNames = new Set();

  for (const market of dailyReport) {
    if (!districtMarketNames.has(market.marketName)) continue;
    for (const group of market.commodityGroups || []) {
      for (const commodity of group.commodities || []) {
        reportedNames.add(commodity.commodityName.trim());
      }
    }
  }

  if (reportedNames.size === 0) {
    const regional = await getRegionalCommodities({ stateId, date });
    return { commodities: regional.commodities, scoped: false, scope: regional.scope };
  }

  const commodities = filters.cmdt_data
    .filter((c) => reportedNames.has(c.cmdt_name.trim()))
    .map((c) => ({ id: c.cmdt_id, name: c.cmdt_name, groupId: c.cmdt_group_id }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Every reported name should resolve back to a known commodity id; if for
  // some reason none did, fall back rather than showing an empty picker.
  if (commodities.length === 0) {
    const regional = await getRegionalCommodities({ stateId, date });
    return { commodities: regional.commodities, scoped: false, scope: regional.scope };
  }

  return { commodities, scoped: true, scope: 'district' };
}

// ── Name → ID resolution (for callers that only have names, e.g. the
//    dashboard, which stores the farmer's land as a state/district string,
//    not an Agmarknet id) ──────────────────────────────────────────────────
function normalize(str) {
  return (str || '').toLowerCase().trim();
}

// Agmarknet's own district names often don't match what a phone's GPS
// reverse-geocoder returns for the same place — a strict exact match silently
// drops real matches. Maharashtra's three RENAMED districts are the worst of
// it (Agmarknet still lists Osmanabad alongside Dharashiv), and Agmarknet has
// its own spellings besides: "Amarawati", "Chattrapati Sambhajinagar" (one h),
// "Gondiya". Fold them all to one form before comparing.
//
// Values here are lowercase Agmarknet-side names, so they are derived from the
// same canonical list geoService.js resolves to — see DISTRICT_ALIASES there.
const { MH_DISTRICT_ANCHORS } = require('../data/districtCentroids');

const DISTRICT_ALIASES = {
  aurangabad: 'chattrapati sambhajinagar',
  sambhajinagar: 'chattrapati sambhajinagar',
  'chhatrapati sambhajinagar': 'chattrapati sambhajinagar',
  osmanabad: 'dharashiv',
  usmanabad: 'dharashiv',
  ahmednagar: 'ahilyanagar',
  ahmadnagar: 'ahilyanagar',
  amravati: 'amarawati',
  amaravati: 'amarawati',
  gondia: 'gondiya',
  nasik: 'nashik',
  bombay: 'mumbai',
  'mumbai city': 'mumbai',
  'mumbai suburban': 'mumbai',
  buldana: 'buldhana',
  sholapur: 'solapur',
  poona: 'pune',
};

function canonicalizeDistrictName(name) {
  const n = normalize(name);
  return DISTRICT_ALIASES[n] || n;
}

// A phone's GPS reverse-geocoder often returns the nearest well-known TOWN
// (e.g. "Lasalgaon"), not the official revenue district it sits in (e.g.
// "Nashik") — these aren't spelling variants of each other, so no amount of
// normalization catches it.
//
// Built from the anchor towns in data/districtCentroids.js rather than
// restated here, so the coordinate lookup and this name lookup can never
// disagree about which district a town belongs to. Add towns there.
const TALUK_TO_DISTRICT = Object.fromEntries(
  MH_DISTRICT_ANCHORS
    .filter((a) => a.town)
    .map((a) => [normalize(a.town), canonicalizeDistrictName(a.district)])
);

async function resolveDistrictIdByName(stateId, districtName) {
  const filters = await getFilters();
  const candidates = filters.district_data.filter(
    (d) => d.id !== ALL_DISTRICT_ID && String(d.state_id) === String(stateId)
  );

  const exact = candidates.find((d) => normalize(d.district_name) === normalize(districtName));
  if (exact) return exact.id;

  const target = canonicalizeDistrictName(districtName);
  const canonical = candidates.find((d) => canonicalizeDistrictName(d.district_name) === target);
  if (canonical) return canonical.id;

  const talukTarget = resolveTalukDistrict(districtName);
  if (talukTarget) {
    const taluk = candidates.find((d) => canonicalizeDistrictName(d.district_name) === talukTarget);
    if (taluk) return taluk.id;
  }

  const loose = candidates.find((d) => {
    const dn = normalize(d.district_name);
    const tn = normalize(districtName);
    return dn.includes(tn) || tn.includes(dn);
  });
  return loose?.id ?? null;
}

// Single vs. doubled consonants ("Karaikudi" vs "Karaikkudi") are the most
// common way an Indian place name's transliteration varies — collapsing
// repeated letters before comparing absorbs that whole class of mismatch
// instead of needing every variant hardcoded into TALUK_TO_DISTRICT.
function collapseRepeats(s) {
  return s.replace(/(.)\1+/g, '$1');
}

function resolveTalukDistrict(districtName) {
  const target = normalize(districtName);
  if (TALUK_TO_DISTRICT[target]) return TALUK_TO_DISTRICT[target];

  const collapsedTarget = collapseRepeats(target);
  for (const [taluk, district] of Object.entries(TALUK_TO_DISTRICT)) {
    const collapsedTaluk = collapseRepeats(taluk);
    if (collapsedTaluk === collapsedTarget || target.includes(taluk) || taluk.includes(target)) {
      return district;
    }
  }
  return null;
}

// Crop names in our app (e.g. "Brinjal", "Ladies Finger") don't always match
// Agmarknet's commodity names exactly, so this tries an exact match first,
// then a loose substring match either direction before giving up.
async function resolveCommodityIdByName(cropName) {
  const filters = await getFilters();
  const target = normalize(cropName);

  const exact = filters.cmdt_data.find((c) => normalize(c.cmdt_name) === target);
  if (exact) return exact.cmdt_id;

  const loose = filters.cmdt_data.find(
    (c) => normalize(c.cmdt_name).includes(target) || target.includes(normalize(c.cmdt_name))
  );
  return loose?.cmdt_id ?? null;
}

async function resolveNames({ stateId, districtId, marketId, commodityId }) {
  const filters = await getFilters();
  const state = filters.state_data.find((s) => String(s.state_id) === String(stateId));
  const district = districtId
    ? filters.district_data.find((d) => String(d.id) === String(districtId))
    : null;
  const market = marketId
    ? filters.market_data.find((m) => String(m.id) === String(marketId))
    : null;
  const commodity = filters.cmdt_data.find((c) => String(c.cmdt_id) === String(commodityId));
  return {
    stateName: state?.state_name || null,
    districtName: district?.district_name || null,
    marketName: market?.mkt_name || null,
    commodityName: commodity?.cmdt_name || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly commodity price data for a state — one call covers every market in
// the state for the whole month, so it's cached and reused both for a single
// day's price lookup AND for building the trend chart's data points.
// ─────────────────────────────────────────────────────────────────────────────
async function getMonthlyCommodityPrices({ stateId, commodityId, year, month }) {
  const cacheKey = `monthly:${stateId}:${commodityId}:${year}:${month}`;
  return cached(cacheKey, PRICE_TTL_MS, async () => {
    try {
      const { data } = await agmarknet.get('/prices-and-arrivals/date-wise/specific-commodity', {
        params: {
          year,
          month,
          includeExcel: false,
          stateId,
          commodityId,
        },
      });

      if (!data?.success) {
        throw new AgmarknetError('UPSTREAM', data?.message || 'Agmarknet returned success:false');
      }

      return data.markets || [];
    } catch (err) {
      if (err instanceof AgmarknetError) throw err;
      throw normalizeError(err, 'getMonthlyCommodityPrices');
    }
  });
}

// DD/MM/YYYY (Agmarknet) <-> YYYY-MM-DD (our API)
function toAgmarknetDate(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function totalArrivals(market) {
  return (market.dates || []).reduce((s, d) => s + (d.total_arrivals || 0), 0);
}

/**
 * Builds an ordered list of candidate markets to try for a selection —
 * ALWAYS real Agmarknet markets, never synthesized:
 *
 *   1. The exact requested market
 *   2. Every other market in the requested district, most active first
 *   3. Every market anywhere in the state, most active first — some
 *      districts (Agmarknet's Osmanabad entry, and its Murum and Bandra(E)
 *      pseudo-districts) have NO registered Agmarknet markets at
 *      all, so without this tier a farmer there would never see a price
 *      for any crop no matter what they pick.
 *
 * Callers walk this list and use the first candidate that actually has
 * real data for what they need (a specific date, or any date at all),
 * so a "found" market that happens to lack today's data doesn't dead-end
 * the search when a real alternative exists.
 */
// Real Maharashtra district adjacency (not distance data — Agmarknet doesn't
// give market coordinates) for the small set of districts that need it.
// Without this, their state-wide fallback silently picks Maharashtra's single
// busiest market regardless of where it is (Nashik has 29 markets and would
// win every time, ~500 km from a Konkan farmer) instead of a genuinely
// adjacent one.
//
// Two groups qualify, both verified against a live /filters call:
//   • Zero-market entries: Osmanabad (Agmarknet still lists it alongside the
//     renamed Dharashiv, which holds all 8 markets), plus Murum and Bandra(E)
//     — towns Agmarknet lists as if they were districts.
//   • One-market districts: Ratnagiri and Sindhudurg, where a single market
//     often has no data for a given date.
//
// Keyed/valued by Agmarknet's own district_name spelling, lowercased.
const ADJACENT_DISTRICTS = {
  osmanabad: ['dharashiv', 'latur', 'solapur', 'beed'],
  murum: ['dharashiv', 'latur', 'solapur'],
  'bandra(e)': ['mumbai', 'raigad', 'palghar'],
  mumbai: ['raigad', 'palghar'],
  ratnagiri: ['sindhudurg', 'kolhapur', 'raigad', 'satara'],
  sindhudurg: ['ratnagiri', 'kolhapur'],
};

// marketName -> lowercased home-district name, built once from the already
// -cached filters payload so ranking candidate markets doesn't need a
// network round trip per market.
async function getMarketDistrictMap() {
  const filters = await getFilters();
  const districtById = new Map(filters.district_data.map((d) => [d.id, normalize(d.district_name)]));
  return new Map(filters.market_data.map((m) => [m.mkt_name, districtById.get(m.district_id) || null]));
}

async function getAdjacentDistrictMarketNames(districtId) {
  const filters = await getFilters();
  const district = filters.district_data.find((d) => d.id === districtId);
  const neighbors = district ? ADJACENT_DISTRICTS[normalize(district.district_name)] : null;
  if (!neighbors?.length) return new Set();

  const neighborSet = new Set(neighbors);
  const marketDistrict = await getMarketDistrictMap();
  const names = new Set();
  for (const [marketName, districtName] of marketDistrict) {
    if (districtName && neighborSet.has(districtName)) names.add(marketName);
  }
  return names;
}

function rankCandidateMarkets(markets, marketName, districtMarketNames, adjacentMarketNames) {
  const candidates = [];
  const seen = new Set();

  const add = (market, matchLevel) => {
    if (!market || seen.has(market.marketName)) return;
    seen.add(market.marketName);
    candidates.push({ market, matchLevel });
  };

  const exact = markets.find((m) => m.marketName === marketName);
  add(exact, 'market');

  if (districtMarketNames?.length) {
    markets
      .filter((m) => districtMarketNames.includes(m.marketName))
      .sort((a, b) => totalArrivals(b) - totalArrivals(a))
      .forEach((m) => add(m, 'district'));
  }

  // Adjacent-district markets, ranked before the rest of the state — still
  // labeled 'state' to the frontend (it's not the farmer's own district),
  // but genuinely nearby rather than just whichever market trades the most
  // statewide.
  if (adjacentMarketNames?.size) {
    markets
      .filter((m) => adjacentMarketNames.has(m.marketName))
      .sort((a, b) => totalArrivals(b) - totalArrivals(a))
      .forEach((m) => add(m, 'state'));
  }

  [...markets]
    .sort((a, b) => totalArrivals(b) - totalArrivals(a))
    .forEach((m) => add(m, 'state'));

  return candidates;
}

// The market's real home district — used to label a state-wide fallback
// honestly (it won't be the farmer's requested district).
async function findMarketDistrictName(marketName) {
  const filters = await getFilters();
  const marketMeta = filters.market_data.find((m) => m.mkt_name === marketName);
  if (!marketMeta) return null;
  const district = filters.district_data.find((d) => d.id === marketMeta.district_id);
  return district?.district_name || null;
}

/**
 * Single-day price for a farmer's exact selection.
 * Returns null (not a fake object) when Agmarknet has no data for it.
 */
async function getPriceForSelection({ stateId, districtId, marketId, commodityId, date }) {
  const [year, month] = date.split('-').map(Number);

  const [monthly, names, districtMarkets, adjacentMarketNames] = await Promise.all([
    getMonthlyCommodityPrices({ stateId, commodityId, year, month }),
    resolveNames({ stateId, districtId, marketId, commodityId }),
    getMarkets(districtId),
    getAdjacentDistrictMarketNames(districtId),
  ]);

  const candidates = rankCandidateMarkets(
    monthly,
    names.marketName,
    districtMarkets.map((m) => m.name),
    adjacentMarketNames
  );

  const agDate = toAgmarknetDate(date);
  for (const { market, matchLevel } of candidates) {
    const dateEntry = market.dates.find((d) => d.arrivalDate === agDate);
    if (!dateEntry || !dateEntry.data?.length) continue;

    // A market can report more than one variety on the same day — use the
    // one with the highest arrivals as the representative price, matching
    // how Agmarknet's own "Modal Price" summary picks a headline figure.
    const row = [...dateEntry.data].sort((a, b) => (b.arrivals || 0) - (a.arrivals || 0))[0];

    const districtName =
      matchLevel === 'state' ? await findMarketDistrictName(market.marketName) : names.districtName;

    return {
      state: names.stateName,
      district: districtName,
      market: market.marketName,
      commodity: names.commodityName,
      variety: row.variety ?? null,
      date,
      minPrice: row.minimumPrice ?? null,
      maxPrice: row.maximumPrice ?? null,
      modalPrice: row.modalPrice ?? null,
      arrival: dateEntry.total_arrivals ?? null,
      matchLevel, // 'market' | 'district' | 'state' — how far we had to search for real data
    };
  }

  return null;
}

/**
 * Up to the last 7 reported days (not necessarily calendar-consecutive —
 * mandis don't report every day) for the sparkline trend, ending on `date`.
 * Returns null when there's no real data to build a trend from.
 */
async function getTrendForSelection({ stateId, districtId, marketId, commodityId, date }) {
  const [year, month] = date.split('-').map(Number);

  const [monthly, names, districtMarkets, adjacentMarketNames] = await Promise.all([
    getMonthlyCommodityPrices({ stateId, commodityId, year, month }),
    resolveNames({ stateId, districtId, marketId, commodityId }),
    getMarkets(districtId),
    getAdjacentDistrictMarketNames(districtId),
  ]);

  const candidates = rankCandidateMarkets(
    monthly,
    names.marketName,
    districtMarkets.map((m) => m.name),
    adjacentMarketNames
  );

  const agDate = toAgmarknetDate(date);
  let market = null;
  let points = [];
  let matchedLevel = null;

  for (const candidate of candidates) {
    const upToDate = (candidate.market.dates || []).filter((d) => {
      // arrivalDate is DD/MM/YYYY — compare as actual dates, not strings
      const [dd, mm, yyyy] = d.arrivalDate.split('/');
      const [tdd, tmm, tyyyy] = agDate.split('/');
      return `${yyyy}${mm}${dd}` <= `${tyyyy}${tmm}${tdd}`;
    });
    const last7 = upToDate.slice(-7);
    const candidatePoints = last7
      .map((d) => {
        const row = [...d.data].sort((a, b) => (b.arrivals || 0) - (a.arrivals || 0))[0];
        return row?.modalPrice ?? null;
      })
      .filter((p) => p !== null);

    if (candidatePoints.length > 0) {
      market = candidate.market;
      points = candidatePoints;
      matchedLevel = candidate.matchLevel;
      break;
    }
  }

  if (!market || points.length === 0) return null;

  // ⚠️ A FLAT SERIES IS NOT A RISE. This was `last >= points[0] ? 'up' :
  // 'down'`, which has no third answer — so seven identical reported modals
  // (a real case: Guava at Nasik APMC, 4500 ×7) came back as `trend: 'up'`
  // and cropRecommendationEngine scored it +1 "prices rising". A ternary with
  // no flat case cannot report "the price is not moving", which is a fact a
  // farmer deciding what to sow actually needs.
  //
  // The 2% band is not cosmetic either. Mandi modals for one commodity move
  // several percent between markets in one district on one day (the same
  // observation behind priceBandService's ±8%), so a 0.4% drift across a week
  // is noise and calling it a direction would make the arrow meaningless.
  const first = points[0];
  const last = points[points.length - 1];
  const changePct = first ? ((last - first) / first) * 100 : 0;

  let trend;
  if (points.length < 2 || Math.abs(changePct) < FLAT_TREND_PCT) trend = 'flat';
  else trend = changePct > 0 ? 'up' : 'down';

  return {
    points,
    trend,
    changePct: Number(changePct.toFixed(2)),
    market: market.marketName,
    // How far we had to search to find ANY series. Callers that mean "in this
    // farmer's district" must check it — getPriceForSelection has always
    // returned it and this one silently did not, so a caller could read a
    // market 300 km away as their own district's signal.
    matchLevel: matchedLevel,
  };
}

module.exports = {
  AgmarknetError,
  DEFAULT_STATE_ID,
  getStates,
  getDistricts,
  getMarkets,
  getCommodities,
  getRegionalCommodities,
  getAvailableCommodities,
  getPriceForSelection,
  getTrendForSelection,
  resolveDistrictIdByName,
  resolveCommodityIdByName,
  resolveTalukDistrict,
  // Exported for saleWindowService, which needs the raw monthly series
  // rather than a single day's headline price.
  getMonthlyCommodityPrices,
};

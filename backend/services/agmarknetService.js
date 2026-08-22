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

// This app serves Tamil Nadu farmers only — 31 is Agmarknet's own id for
// Tamil Nadu (verified live against /daily-price-arrival/filters).
const TAMIL_NADU_STATE_ID = 31;

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
 * Falls back to the full commodity list if the district has no markets at
 * all (e.g. Chennai) or genuinely reported nothing that day, so a farmer
 * there is never left with an empty, dead-end picker.
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
    return { commodities: await getCommodities(), scoped: false };
  }

  const commodities = filters.cmdt_data
    .filter((c) => reportedNames.has(c.cmdt_name.trim()))
    .map((c) => ({ id: c.cmdt_id, name: c.cmdt_name, groupId: c.cmdt_group_id }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Every reported name should resolve back to a known commodity id; if for
  // some reason none did, fall back rather than showing an empty picker.
  if (commodities.length === 0) {
    return { commodities: await getCommodities(), scoped: false };
  }

  return { commodities, scoped: true };
}

// ── Name → ID resolution (for callers that only have names, e.g. the
//    dashboard, which stores the farmer's land as a state/district string,
//    not an Agmarknet id) ──────────────────────────────────────────────────
function normalize(str) {
  return (str || '').toLowerCase().trim();
}

// Agmarknet's own district names often don't match what a phone's GPS
// reverse-geocoder returns for the same place (e.g. "Sivaganga" vs the more
// common "Sivagangai", "Thiruchirappalli" vs "Tiruchirappalli") — a strict
// exact match silently drops real matches for a large fraction of Tamil
// Nadu's districts. Fold the common "Thiru-"/"Tiru-" spelling split and a
// handful of outright renamed districts to the same form before comparing.
const DISTRICT_ALIASES = {
  tuticorin: 'thoothukudi',
  thoothukudi: 'thoothukudi',
  kancheepuram: 'kanchipuram',
  kanchipuram: 'kanchipuram',
  'nagercoil (kannyiakumari)': 'kanyakumari',
  kanyakumari: 'kanyakumari',
  nagercoil: 'kanyakumari',
  thiruvellore: 'tiruvallur',
  tiruvallur: 'tiruvallur',
  villupuram: 'viluppuram',
  viluppuram: 'viluppuram',
  thiruchirappalli: 'tiruchirappalli',
  tiruchirappalli: 'tiruchirappalli',
  trichy: 'tiruchirappalli',
  kallakuruchi: 'kallakurichi',
  kallakurichi: 'kallakurichi',
  thirupathur: 'tirupattur',
  tirupattur: 'tirupattur',
  thirupur: 'tiruppur',
  tiruppur: 'tiruppur',
  chengalpattu: 'chengalpattu',
  chengalpet: 'chengalpattu',
};

function canonicalizeDistrictName(name) {
  const n = normalize(name);
  if (DISTRICT_ALIASES[n]) return DISTRICT_ALIASES[n];
  return n.replace(/^thiru/, 'tiru');
}

// A phone's GPS reverse-geocoder often returns the nearest well-known TOWN
// (e.g. "Karaikudi"), not the official revenue district it sits in (e.g.
// "Sivaganga") — these aren't spelling variants of each other so no amount
// of normalization catches it. Best-effort, not exhaustive; maps a town to
// its Agmarknet district name (post-canonicalization spelling).
const TALUK_TO_DISTRICT = {
  karaikudi: 'sivaganga',
  karaikkudi: 'sivaganga',
  devakottai: 'sivaganga',
  manamadurai: 'sivaganga',
  rajapalayam: 'virudhunagar',
  sivakasi: 'virudhunagar',
  aruppukkottai: 'virudhunagar',
  kumbakonam: 'thanjavur',
  pattukkottai: 'thanjavur',
  pollachi: 'coimbatore',
  hosur: 'krishnagiri',
  vaniyambadi: 'tirupattur',
  ambur: 'tirupattur',
  gudiyatham: 'vellore',
  arakkonam: 'ranipet',
  tambaram: 'chengalpattu',
  avadi: 'tiruvallur',
  poonamallee: 'tiruvallur',
  ooty: 'nilgiris',
  udhagamandalam: 'nilgiris',
  coonoor: 'nilgiris',
  kodaikanal: 'dindigul',
  palani: 'dindigul',
  rameswaram: 'ramanathapuram',
  paramakudi: 'ramanathapuram',
  mannargudi: 'tiruvarur',
  chidambaram: 'cuddalore',
  neyveli: 'cuddalore',
  panruti: 'cuddalore',
  tindivanam: 'viluppuram',
  tiruchengode: 'namakkal',

  // Tiruvallur
  ponneri: 'tiruvallur',
  gummidipoondi: 'tiruvallur',
  uthukottai: 'tiruvallur',
  pallipattu: 'tiruvallur',
  tiruttani: 'tiruvallur',
  // Kancheepuram
  uthiramerur: 'kancheepuram',
  walajabad: 'kancheepuram',
  // Chengalpattu
  cheyyur: 'chengalpattu',
  madurantakam: 'chengalpattu',
  thirukalukundram: 'chengalpattu',
  pallavaram: 'chengalpattu',
  vandalur: 'chengalpattu',
  // Cuddalore
  kattumannarkoil: 'cuddalore',
  virudhachalam: 'cuddalore',
  vriddhachalam: 'cuddalore',
  kurinjipadi: 'cuddalore',
  // Villupuram
  gingee: 'viluppuram',
  senji: 'viluppuram',
  vanur: 'viluppuram',
  vikravandi: 'viluppuram',
  marakkanam: 'viluppuram',
  tirukoilur: 'viluppuram',
  // Vellore
  katpadi: 'vellore',
  anaicut: 'vellore',
  // Tiruvannamalai
  arani: 'tiruvannamalai',
  arni: 'tiruvannamalai',
  cheyyar: 'tiruvannamalai',
  polur: 'tiruvannamalai',
  chengam: 'tiruvannamalai',
  vandavasi: 'tiruvannamalai',
  jamunamarathur: 'tiruvannamalai',
  // Ranipet
  walajapet: 'ranipet',
  sholingur: 'ranipet',
  // Kallakurichi
  sankarapuram: 'kallakurichi',
  ulundurpettai: 'kallakurichi',
  chinnasalem: 'kallakurichi',
  // Tirupathur
  natrampalli: 'tirupattur',
  jolarpettai: 'tirupattur',
  // Salem
  attur: 'salem',
  mettur: 'salem',
  omalur: 'salem',
  sankari: 'salem',
  yercaud: 'salem',
  // Namakkal
  rasipuram: 'namakkal',
  paramathivelur: 'namakkal',
  // Dharmapuri
  harur: 'dharmapuri',
  palacode: 'dharmapuri',
  pappireddipatti: 'dharmapuri',
  pennagaram: 'dharmapuri',
  // Krishnagiri
  denkanikottai: 'krishnagiri',
  uthangarai: 'krishnagiri',
  bargur: 'krishnagiri',
  pochampalli: 'krishnagiri',
  // Erode
  bhavani: 'erode',
  gobichettipalayam: 'erode',
  sathyamangalam: 'erode',
  perundurai: 'erode',
  anthiyur: 'erode',
  kodumudi: 'erode',
  modakurichi: 'erode',
  // Coimbatore
  mettupalayam: 'coimbatore',
  sulur: 'coimbatore',
  kinathukadavu: 'coimbatore',
  valparai: 'coimbatore',
  annur: 'coimbatore',
  // Tiruppur
  avinashi: 'tiruppur',
  palladam: 'tiruppur',
  udumalaipettai: 'tiruppur',
  dharapuram: 'tiruppur',
  kangeyam: 'tiruppur',
  uthukuli: 'tiruppur',
  // Karur
  kulithalai: 'karur',
  krishnarayapuram: 'karur',
  aravakurichi: 'karur',
  // Madurai
  melur: 'madurai',
  usilampatti: 'madurai',
  vadipatti: 'madurai',
  thirumangalam: 'madurai',
  peraiyur: 'madurai',
  sholavandan: 'madurai',
  // Dindigul
  nilakottai: 'dindigul',
  vedasandur: 'dindigul',
  natham: 'dindigul',
  oddanchatram: 'dindigul',
  athoor: 'dindigul',
  // Theni
  periyakulam: 'theni',
  bodinayakanur: 'theni',
  uthamapalayam: 'theni',
  andipatti: 'theni',
  cumbum: 'theni',
  // Sivaganga
  ilayangudi: 'sivaganga',
  singampunari: 'sivaganga',
  // Ramanathapuram
  mudukulathur: 'ramanathapuram',
  kamuthi: 'ramanathapuram',
  tiruvadanai: 'ramanathapuram',
  kadaladi: 'ramanathapuram',
  keelakarai: 'ramanathapuram',
  // Virudhunagar
  sattur: 'virudhunagar',
  srivilliputhur: 'virudhunagar',
  kariapatti: 'virudhunagar',
  vembakottai: 'virudhunagar',
  // Thoothukudi
  kovilpatti: 'thoothukudi',
  ottapidaram: 'thoothukudi',
  sathankulam: 'thoothukudi',
  srivaikuntam: 'thoothukudi',
  vilathikulam: 'thoothukudi',
  tiruchendur: 'thoothukudi',
  // Tirunelveli
  ambasamudram: 'tirunelveli',
  nanguneri: 'tirunelveli',
  palayamkottai: 'tirunelveli',
  radhapuram: 'tirunelveli',
  cheranmahadevi: 'tirunelveli',
  // Tenkasi
  shencottai: 'tenkasi',
  shenkottai: 'tenkasi',
  sankarankovil: 'tenkasi',
  kadayanallur: 'tenkasi',
  alangulam: 'tenkasi',
  vasudevanallur: 'tenkasi',
  sivagiri: 'tenkasi',
  // Kanyakumari
  nagercoil: 'kanyakumari',
  colachel: 'kanyakumari',
  thuckalay: 'kanyakumari',
  padmanabhapuram: 'kanyakumari',
  vilavancode: 'kanyakumari',
  agastheeswaram: 'kanyakumari',
  kalkulam: 'kanyakumari',
  // Thanjavur
  orathanadu: 'thanjavur',
  papanasam: 'thanjavur',
  peravurani: 'thanjavur',
  thiruvaiyaru: 'thanjavur',
  budalur: 'thanjavur',
  // Tiruvarur
  nannilam: 'tiruvarur',
  needamangalam: 'tiruvarur',
  kodavasal: 'tiruvarur',
  thiruthuraipoondi: 'tiruvarur',
  valangaiman: 'tiruvarur',
  // Nagapattinam
  vedaranyam: 'nagapattinam',
  kilvelur: 'nagapattinam',
  thirukkuvalai: 'nagapattinam',
  // Mayiladuthurai
  sirkazhi: 'mayiladuthurai',
  tharangambadi: 'mayiladuthurai',
  tranquebar: 'mayiladuthurai',
  kuthalam: 'mayiladuthurai',
  // Pudukkottai
  aranthangi: 'pudukkottai',
  illupur: 'pudukkottai',
  gandarvakottai: 'pudukkottai',
  alangudi: 'pudukkottai',
  karambakkudi: 'pudukkottai',
  manamelkudi: 'pudukkottai',
  avudaiyarkoil: 'pudukkottai',
  // Tiruchirappalli
  srirangam: 'tiruchirappalli',
  lalgudi: 'tiruchirappalli',
  musiri: 'tiruchirappalli',
  manapparai: 'tiruchirappalli',
  thottiyam: 'tiruchirappalli',
  manachanallur: 'tiruchirappalli',
  thuraiyur: 'tiruchirappalli',
  // Ariyalur
  udayarpalayam: 'ariyalur',
  sendurai: 'ariyalur',
  andimadam: 'ariyalur',
  // Perambalur
  kunnam: 'perambalur',
  veppanthattai: 'perambalur',
  // Nilgiris
  kotagiri: 'nilgiris',
  gudalur: 'nilgiris',
  pandalur: 'nilgiris',
};

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
 *      districts (e.g. Chennai) have NO registered Agmarknet markets at
 *      all, so without this tier a farmer there would never see a price
 *      for any crop no matter what they pick.
 *
 * Callers walk this list and use the first candidate that actually has
 * real data for what they need (a specific date, or any date at all),
 * so a "found" market that happens to lack today's data doesn't dead-end
 * the search when a real alternative exists.
 */
// Real Tamil Nadu district adjacency (not distance data — Agmarknet doesn't
// give market coordinates) for the small set of districts that need it: the
// ones with zero Agmarknet-registered markets of their own (currently
// Chennai and Mayiladuthurai — see getNearbyPrices). Without this, their
// state-wide fallback silently picks Tamil Nadu's single busiest market
// regardless of where it is (e.g. Hosur, ~350km from Chennai) instead of an
// actually-adjacent one. Keyed/valued by Agmarknet's own district_name
// spelling, lowercased.
const ADJACENT_DISTRICTS = {
  chennai: ['tiruvellore', 'chengalpattu', 'kancheepuram'],
  mayiladuthurai: ['nagapattinam', 'thanjavur', 'ariyalur', 'cuddalore'],
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
      break;
    }
  }

  if (!market || points.length === 0) return null;

  const trend = points[points.length - 1] >= points[0] ? 'up' : 'down';
  return { points, trend, market: market.marketName };
}

module.exports = {
  AgmarknetError,
  TAMIL_NADU_STATE_ID,
  getStates,
  getDistricts,
  getMarkets,
  getCommodities,
  getAvailableCommodities,
  getPriceForSelection,
  getTrendForSelection,
  resolveDistrictIdByName,
  resolveCommodityIdByName,
  resolveTalukDistrict,
};

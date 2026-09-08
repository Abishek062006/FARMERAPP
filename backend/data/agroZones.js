// Static agronomic reference data for Maharashtra crop recommendations.
//
// This replaces "ask an LLM to guess 10 crops" with a deterministic filter:
// district -> agro-climatic zone -> crops actually suited to that zone's
// soil/water/season combination. Zone groupings follow the Government of
// Maharashtra's official nine-zone classification; the district-to-zone
// assignment comes from data/mhAgroZones.js, which is the single source of
// truth for it (this file does not restate the district table).
//
// ⚠️ READ THE WARNING AT THE TOP OF mhAgroZones.js. Real zone boundaries are
// drawn at taluka level and cut through districts; this is a district-level
// approximation that assigns each district its dominant zone. Nashik in
// particular was deliberately placed in the Plain Zone rather than the
// Western Ghat Zone — see the note there.
//
// This is a starting reference table, not a substitute for local agronomy
// advice — it's meant to bound an LLM's guesswork to agronomically real
// candidates, not to be a certified extension-service recommendation.
//
// Replaces the TNAU 7-zone Tamil Nadu table this file previously held.
//
// Field notes for anyone extending CROPS below:
//   soils    must come from Land.soilType's enum:
//            red · black · alluvial · clay · loamy · sandy · laterite
//   water    must come from Land.waterSource's enum
//   seasons  Monsoon = Kharif · Winter = Rabi · Summer = summer/late Rabi
//   mandiName must be a REAL Agmarknet commodity name — it is passed to
//            resolveCommodityIdByName() for live price scoring. Every value
//            below was checked against a live /commodities call; a name that
//            does not resolve silently costs the crop its price signal.

const { MH_ZONES, zoneForDistrict } = require('./mhAgroZones');

// Zone display names, keyed the way the rest of the codebase expects.
const ZONES = Object.fromEntries(
  Object.entries(MH_ZONES).map(([key, z]) => [key, z.name])
);

// district (normalized) -> zone display name. Derived from mhAgroZones so the
// two can never disagree; spelling variants and the three renamed districts
// resolve through canonicalDistrict() inside zoneForDistrict().
const DISTRICT_ZONE_MAP = {};
for (const zone of Object.values(MH_ZONES)) {
  for (const d of zone.districts) {
    DISTRICT_ZONE_MAP[String(d).toLowerCase().replace(/[^a-z]/g, '')] = zone.name;
  }
}

function normalizeDistrictName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/district/g, '')
    .replace(/[^a-z]/g, '')
    .trim();
}

// A farmer's land is often registered under a taluk/town name (e.g. "Lasalgaon")
// rather than the official revenue district ("Nashik") — GPS reverse-geocoding
// commonly returns the town, not the district. Three resolvers are tried in
// order of confidence: the direct map, mhAgroZones' rename/variant aliases,
// then the taluk->district resolver agmarknetService.js already built for
// Agmarknet district IDs, so the two don't drift apart or disagree.
const { resolveTalukDistrict } = require('../services/agmarknetService');

function resolveZone(districtName) {
  const key = normalizeDistrictName(districtName);
  if (DISTRICT_ZONE_MAP[key]) return DISTRICT_ZONE_MAP[key];

  const aliased = zoneForDistrict(districtName);
  if (aliased) return aliased.name;

  const parentDistrict = resolveTalukDistrict(districtName);
  if (parentDistrict) {
    const viaParent = zoneForDistrict(parentDistrict);
    if (viaParent) return viaParent.name;
    return DISTRICT_ZONE_MAP[normalizeDistrictName(parentDistrict)] || null;
  }

  return null;
}

// Master crop reference table. Each crop lists the conditions under which
// it's agronomically viable — this is the filter, not the ranking. Ranking
// by real price/saturation/history data happens in cropRecommendationEngine.js.
const CROPS = [
  // ── Cereals ────────────────────────────────────────────────────────────
  {
    name: 'Rice (Paddy)',
    category: 'cereal',
    localName: 'भात',
    mandiName: 'Paddy(Common)',
    duration: 120,
    typicalYield: '18-22 quintals/acre',
    soils: ['alluvial', 'clay', 'laterite', 'loamy'],
    water: ['canal', 'river', 'rainwater', 'tank', 'pond', 'well', 'borewell'],
    seasons: ['Monsoon'],
    zones: [ZONES.SOUTH_KONKAN_COASTAL, ZONES.NORTH_KONKAN_COASTAL, ZONES.WESTERN_GHAT, ZONES.EASTERN_VIDARBHA],
  },
  {
    name: 'Jowar (Sorghum)',
    category: 'cereal',
    localName: 'ज्वारी',
    mandiName: 'Jowar(Sorghum)',
    duration: 110,
    typicalYield: '8-12 quintals/acre',
    soils: ['black', 'loamy', 'red'],
    water: ['rainwater', 'borewell', 'well', 'none', 'drip'],
    seasons: ['Monsoon', 'Winter'],
    zones: [ZONES.SUBMONTANE, ZONES.PLAIN, ZONES.SCARCITY, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.CENTRAL_VIDARBHA],
  },
  {
    name: 'Bajra (Pearl Millet)',
    category: 'cereal',
    localName: 'बाजरी',
    mandiName: 'Bajra(Pearl Millet/Cumbu)',
    duration: 90,
    typicalYield: '6-9 quintals/acre',
    soils: ['sandy', 'red', 'black', 'loamy'],
    water: ['rainwater', 'none', 'borewell', 'well'],
    seasons: ['Monsoon', 'Summer'],
    zones: [ZONES.SCARCITY, ZONES.PLAIN, ZONES.CENTRAL_MAHARASHTRA_PLATEAU],
  },
  {
    name: 'Wheat',
    category: 'cereal',
    localName: 'गहू',
    mandiName: 'Wheat',
    duration: 115,
    typicalYield: '12-16 quintals/acre',
    soils: ['black', 'loamy', 'alluvial', 'clay'],
    water: ['canal', 'borewell', 'well', 'sprinkler', 'drip'],
    seasons: ['Winter'],
    zones: [ZONES.PLAIN, ZONES.SUBMONTANE, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.CENTRAL_VIDARBHA, ZONES.EASTERN_VIDARBHA],
  },
  {
    name: 'Maize',
    category: 'cereal',
    localName: 'मका',
    mandiName: 'Maize',
    duration: 100,
    typicalYield: '20-25 quintals/acre',
    soils: ['loamy', 'black', 'alluvial', 'red'],
    water: ['borewell', 'canal', 'sprinkler', 'well', 'drip'],
    seasons: ['Monsoon', 'Winter'],
    zones: [ZONES.PLAIN, ZONES.SUBMONTANE, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.CENTRAL_VIDARBHA],
  },
  {
    name: 'Ragi (Nachani)',
    category: 'cereal',
    localName: 'नाचणी',
    mandiName: 'Ragi(Finger Millet)',
    duration: 110,
    typicalYield: '6-8 quintals/acre',
    soils: ['laterite', 'red', 'loamy'],
    water: ['rainwater', 'none', 'well'],
    seasons: ['Monsoon'],
    zones: [ZONES.WESTERN_GHAT, ZONES.NORTH_KONKAN_COASTAL, ZONES.SOUTH_KONKAN_COASTAL],
  },

  // ── Pulses ─────────────────────────────────────────────────────────────
  {
    name: 'Tur (Pigeon Pea)',
    category: 'pulse',
    localName: 'तूर',
    mandiName: 'Red gram/Arhar/Tur(whole)',
    duration: 180,
    typicalYield: '5-7 quintals/acre',
    soils: ['black', 'loamy', 'red'],
    water: ['rainwater', 'borewell', 'none', 'drip', 'well'],
    seasons: ['Monsoon'],
    zones: [ZONES.CENTRAL_VIDARBHA, ZONES.EASTERN_VIDARBHA, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.SCARCITY, ZONES.PLAIN],
  },
  {
    name: 'Gram (Harbhara)',
    category: 'pulse',
    localName: 'हरभरा',
    mandiName: 'Bengal Gram(Gram)(Whole)',
    duration: 110,
    typicalYield: '6-8 quintals/acre',
    soils: ['black', 'clay', 'loamy'],
    water: ['canal', 'borewell', 'well', 'rainwater', 'drip'],
    seasons: ['Winter'],
    zones: [ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.CENTRAL_VIDARBHA, ZONES.EASTERN_VIDARBHA, ZONES.PLAIN, ZONES.SCARCITY],
  },
  {
    name: 'Green Gram (Moong)',
    category: 'pulse',
    localName: 'मूग',
    mandiName: 'Green Gram(Moong)(Whole)',
    duration: 70,
    typicalYield: '3-5 quintals/acre',
    soils: ['black', 'loamy', 'sandy', 'red'],
    water: ['rainwater', 'borewell', 'none', 'well'],
    seasons: ['Monsoon', 'Summer'],
    zones: [ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.CENTRAL_VIDARBHA, ZONES.SCARCITY, ZONES.PLAIN],
  },
  {
    name: 'Black Gram (Udid)',
    category: 'pulse',
    localName: 'उडीद',
    mandiName: 'Black Gram(Urd Beans)(Whole)',
    duration: 75,
    typicalYield: '3-5 quintals/acre',
    soils: ['black', 'loamy', 'red', 'clay'],
    water: ['rainwater', 'borewell', 'none', 'well'],
    seasons: ['Monsoon'],
    zones: [ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.CENTRAL_VIDARBHA, ZONES.EASTERN_VIDARBHA],
  },
  {
    name: 'Kulthi (Horse Gram)',
    category: 'pulse',
    localName: 'कुळीथ',
    mandiName: 'Kulthi(Horse Gram)',
    duration: 100,
    typicalYield: '2-4 quintals/acre',
    soils: ['laterite', 'red', 'loamy'],
    water: ['rainwater', 'none'],
    seasons: ['Monsoon', 'Winter'],
    zones: [ZONES.SOUTH_KONKAN_COASTAL, ZONES.NORTH_KONKAN_COASTAL, ZONES.WESTERN_GHAT],
  },

  // ── Oilseeds and fibre ─────────────────────────────────────────────────
  {
    name: 'Soyabean',
    category: 'oilseed',
    localName: 'सोयाबीन',
    mandiName: 'Soyabean',
    duration: 100,
    typicalYield: '8-12 quintals/acre',
    soils: ['black', 'loamy', 'clay'],
    water: ['rainwater', 'borewell', 'drip', 'sprinkler', 'well'],
    seasons: ['Monsoon'],
    zones: [ZONES.CENTRAL_VIDARBHA, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.EASTERN_VIDARBHA, ZONES.SUBMONTANE, ZONES.PLAIN],
  },
  {
    // Cotton is a fibre crop, but its cottonseed is an oilseed and — more to
    // the point here — its irrigation rhythm matches the oilseed schedule in
    // dailyTaskEngine.js. The category vocabulary is that engine's, not a
    // botanical one.
    name: 'Cotton',
    category: 'oilseed',
    localName: 'कापूस',
    mandiName: 'Cotton',
    duration: 180,
    typicalYield: '6-10 quintals/acre',
    soils: ['black', 'clay', 'loamy'],
    water: ['rainwater', 'drip', 'borewell', 'well', 'canal'],
    seasons: ['Monsoon'],
    zones: [ZONES.CENTRAL_VIDARBHA, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.EASTERN_VIDARBHA, ZONES.SCARCITY],
  },
  {
    name: 'Groundnut',
    category: 'oilseed',
    localName: 'भुईमूग',
    mandiName: 'Groundnut',
    duration: 110,
    typicalYield: '8-11 quintals/acre',
    soils: ['sandy', 'loamy', 'red', 'black'],
    water: ['borewell', 'sprinkler', 'rainwater', 'well', 'drip'],
    seasons: ['Monsoon', 'Summer'],
    zones: [ZONES.SUBMONTANE, ZONES.PLAIN, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.SCARCITY],
  },
  {
    name: 'Sunflower',
    category: 'oilseed',
    localName: 'सूर्यफूल',
    mandiName: 'Sunflower/Sunflower Seed',
    duration: 95,
    typicalYield: '4-6 quintals/acre',
    soils: ['black', 'loamy', 'red'],
    water: ['rainwater', 'borewell', 'drip', 'well'],
    seasons: ['Winter', 'Summer'],
    zones: [ZONES.SCARCITY, ZONES.PLAIN, ZONES.CENTRAL_MAHARASHTRA_PLATEAU],
  },
  {
    name: 'Safflower (Karadi)',
    category: 'oilseed',
    localName: 'करडई',
    mandiName: 'Safflower',
    duration: 120,
    typicalYield: '3-5 quintals/acre',
    soils: ['black', 'clay'],
    water: ['rainwater', 'none', 'well'],
    seasons: ['Winter'],
    zones: [ZONES.SCARCITY, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.PLAIN],
  },
  {
    name: 'Sesamum (Til)',
    category: 'oilseed',
    localName: 'तीळ',
    mandiName: 'Sesamum(Sesame,Gingelly,Til)',
    duration: 85,
    typicalYield: '2-4 quintals/acre',
    soils: ['sandy', 'loamy', 'red', 'black'],
    water: ['rainwater', 'none', 'borewell'],
    seasons: ['Monsoon', 'Summer'],
    zones: [ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.CENTRAL_VIDARBHA, ZONES.SCARCITY],
  },
  {
    name: 'Linseed (Jawas)',
    category: 'oilseed',
    localName: 'जवस',
    mandiName: 'Linseed',
    duration: 110,
    typicalYield: '2-4 quintals/acre',
    soils: ['black', 'clay'],
    water: ['rainwater', 'well', 'none'],
    seasons: ['Winter'],
    zones: [ZONES.EASTERN_VIDARBHA, ZONES.CENTRAL_VIDARBHA],
  },

  // ── Vegetables (fruiting) ──────────────────────────────────────────────
  {
    name: 'Tomato',
    category: 'vegetable_fruiting',
    localName: 'टोमॅटो',
    mandiName: 'Tomato',
    duration: 110,
    typicalYield: '100-140 quintals/acre',
    soils: ['loamy', 'red', 'black', 'alluvial'],
    water: ['drip', 'borewell', 'canal', 'well', 'sprinkler'],
    seasons: ['Monsoon', 'Winter', 'Summer'],
    zones: [ZONES.PLAIN, ZONES.SUBMONTANE, ZONES.WESTERN_GHAT, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.NORTH_KONKAN_COASTAL],
  },
  {
    name: 'Brinjal',
    category: 'vegetable_fruiting',
    localName: 'वांगी',
    mandiName: 'Brinjal',
    duration: 130,
    typicalYield: '90-120 quintals/acre',
    soils: ['loamy', 'black', 'red', 'alluvial'],
    water: ['drip', 'borewell', 'canal', 'well'],
    seasons: ['Monsoon', 'Winter', 'Summer'],
    zones: [ZONES.PLAIN, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.NORTH_KONKAN_COASTAL, ZONES.SUBMONTANE],
  },
  {
    name: 'Okra (Bhendi)',
    category: 'vegetable_fruiting',
    localName: 'भेंडी',
    mandiName: 'Bhindi(Ladies Finger)',
    duration: 90,
    typicalYield: '40-60 quintals/acre',
    soils: ['loamy', 'sandy', 'alluvial', 'red'],
    water: ['drip', 'borewell', 'canal', 'well'],
    seasons: ['Monsoon', 'Summer'],
    zones: [ZONES.PLAIN, ZONES.NORTH_KONKAN_COASTAL, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.SUBMONTANE],
  },
  {
    name: 'Green Chilli',
    category: 'spice',
    localName: 'हिरवी मिरची',
    mandiName: 'Green Chilli',
    duration: 150,
    typicalYield: '35-50 quintals/acre',
    soils: ['black', 'loamy', 'red'],
    water: ['drip', 'borewell', 'well', 'canal'],
    seasons: ['Monsoon', 'Winter'],
    zones: [ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.PLAIN, ZONES.CENTRAL_VIDARBHA, ZONES.SUBMONTANE],
  },
  {
    name: 'Dry Chillies',
    category: 'spice',
    localName: 'लाल मिरची',
    mandiName: 'Dry Chillies',
    duration: 180,
    typicalYield: '8-12 quintals/acre',
    soils: ['black', 'red', 'loamy'],
    water: ['drip', 'borewell', 'well', 'rainwater'],
    seasons: ['Monsoon'],
    zones: [ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.CENTRAL_VIDARBHA, ZONES.SCARCITY],
  },
  {
    name: 'Bitter Gourd (Karle)',
    category: 'vegetable_fruiting',
    localName: 'कारले',
    mandiName: 'Bitter gourd',
    duration: 100,
    typicalYield: '35-50 quintals/acre',
    soils: ['loamy', 'sandy', 'alluvial'],
    water: ['drip', 'borewell', 'canal', 'well'],
    seasons: ['Monsoon', 'Summer'],
    zones: [ZONES.PLAIN, ZONES.NORTH_KONKAN_COASTAL, ZONES.SUBMONTANE, ZONES.CENTRAL_MAHARASHTRA_PLATEAU],
  },
  {
    name: 'Bottle Gourd (Dudhi)',
    category: 'vegetable_fruiting',
    localName: 'दुधी भोपळा',
    mandiName: 'Bottle gourd',
    duration: 95,
    typicalYield: '60-90 quintals/acre',
    soils: ['loamy', 'sandy', 'alluvial'],
    water: ['drip', 'borewell', 'canal', 'well'],
    seasons: ['Monsoon', 'Summer'],
    zones: [ZONES.PLAIN, ZONES.NORTH_KONKAN_COASTAL, ZONES.CENTRAL_MAHARASHTRA_PLATEAU],
  },
  {
    name: 'Cucumber (Kakdi)',
    category: 'vegetable_fruiting',
    localName: 'काकडी',
    mandiName: 'Cucumbar(Kheera)',
    duration: 75,
    typicalYield: '50-70 quintals/acre',
    soils: ['loamy', 'sandy', 'alluvial'],
    water: ['drip', 'borewell', 'canal', 'well'],
    seasons: ['Summer', 'Monsoon'],
    zones: [ZONES.PLAIN, ZONES.SUBMONTANE, ZONES.NORTH_KONKAN_COASTAL],
  },
  {
    name: 'Cluster Beans (Gawar)',
    category: 'vegetable_fruiting',
    localName: 'गवार',
    mandiName: 'Cluster beans',
    duration: 90,
    typicalYield: '25-35 quintals/acre',
    soils: ['sandy', 'loamy', 'black'],
    water: ['rainwater', 'drip', 'borewell', 'well'],
    seasons: ['Monsoon', 'Summer'],
    zones: [ZONES.SCARCITY, ZONES.PLAIN, ZONES.CENTRAL_MAHARASHTRA_PLATEAU],
  },
  {
    name: 'French Beans (Ghevda)',
    category: 'vegetable_fruiting',
    localName: 'घेवडा',
    mandiName: 'French Beans(Frasbean)',
    duration: 80,
    typicalYield: '25-35 quintals/acre',
    soils: ['loamy', 'red', 'laterite'],
    water: ['drip', 'borewell', 'well', 'canal'],
    seasons: ['Winter', 'Monsoon'],
    zones: [ZONES.WESTERN_GHAT, ZONES.SUBMONTANE, ZONES.PLAIN],
  },
  {
    name: 'Green Peas (Vatana)',
    category: 'vegetable_fruiting',
    localName: 'वाटाणा',
    mandiName: 'Green Peas',
    duration: 90,
    typicalYield: '20-30 quintals/acre',
    soils: ['loamy', 'black', 'alluvial'],
    water: ['drip', 'canal', 'borewell', 'sprinkler'],
    seasons: ['Winter'],
    zones: [ZONES.PLAIN, ZONES.SUBMONTANE, ZONES.WESTERN_GHAT],
  },
  {
    name: 'Watermelon (Kalingad)',
    category: 'vegetable_fruiting',
    localName: 'कलिंगड',
    mandiName: 'Water Melon',
    duration: 90,
    typicalYield: '100-140 quintals/acre',
    soils: ['sandy', 'loamy', 'alluvial'],
    water: ['drip', 'borewell', 'canal', 'river'],
    seasons: ['Summer'],
    zones: [ZONES.SCARCITY, ZONES.PLAIN, ZONES.CENTRAL_MAHARASHTRA_PLATEAU],
  },

  // ── Vegetables (leafy and root) ────────────────────────────────────────
  {
    name: 'Onion',
    category: 'vegetable_leafy_root',
    localName: 'कांदा',
    mandiName: 'Onion',
    duration: 120,
    typicalYield: '100-140 quintals/acre',
    soils: ['black', 'loamy', 'red', 'alluvial'],
    water: ['drip', 'canal', 'borewell', 'well', 'sprinkler'],
    seasons: ['Monsoon', 'Winter', 'Summer'],
    zones: [ZONES.PLAIN, ZONES.SCARCITY, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.SUBMONTANE],
  },
  {
    name: 'Potato',
    category: 'vegetable_leafy_root',
    localName: 'बटाटा',
    mandiName: 'Potato',
    duration: 100,
    typicalYield: '80-110 quintals/acre',
    soils: ['loamy', 'sandy', 'alluvial'],
    water: ['drip', 'canal', 'borewell', 'sprinkler', 'well'],
    seasons: ['Winter'],
    zones: [ZONES.PLAIN, ZONES.SUBMONTANE, ZONES.WESTERN_GHAT],
  },
  {
    name: 'Garlic',
    category: 'spice',
    localName: 'लसूण',
    mandiName: 'Garlic',
    duration: 150,
    typicalYield: '25-35 quintals/acre',
    soils: ['loamy', 'black', 'red'],
    water: ['drip', 'canal', 'borewell', 'sprinkler'],
    seasons: ['Winter'],
    zones: [ZONES.PLAIN, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.SUBMONTANE],
  },
  {
    name: 'Cabbage',
    category: 'vegetable_leafy_root',
    localName: 'कोबी',
    mandiName: 'Cabbage',
    duration: 90,
    typicalYield: '90-130 quintals/acre',
    soils: ['loamy', 'alluvial', 'black'],
    water: ['drip', 'canal', 'borewell', 'sprinkler'],
    seasons: ['Winter'],
    zones: [ZONES.PLAIN, ZONES.SUBMONTANE, ZONES.WESTERN_GHAT, ZONES.NORTH_KONKAN_COASTAL],
  },
  {
    name: 'Cauliflower',
    category: 'vegetable_leafy_root',
    localName: 'फुलकोबी',
    mandiName: 'Cauliflower',
    duration: 95,
    typicalYield: '70-100 quintals/acre',
    soils: ['loamy', 'alluvial', 'black'],
    water: ['drip', 'canal', 'borewell', 'sprinkler'],
    seasons: ['Winter'],
    zones: [ZONES.PLAIN, ZONES.SUBMONTANE, ZONES.WESTERN_GHAT, ZONES.NORTH_KONKAN_COASTAL],
  },
  {
    name: 'Carrot',
    category: 'vegetable_leafy_root',
    localName: 'गाजर',
    mandiName: 'Carrot',
    duration: 90,
    typicalYield: '60-90 quintals/acre',
    soils: ['loamy', 'sandy', 'alluvial'],
    water: ['drip', 'canal', 'borewell', 'sprinkler'],
    seasons: ['Winter'],
    zones: [ZONES.PLAIN, ZONES.SUBMONTANE, ZONES.WESTERN_GHAT],
  },
  {
    name: 'Beetroot',
    category: 'vegetable_leafy_root',
    localName: 'बीट',
    mandiName: 'Beetroot',
    duration: 85,
    typicalYield: '60-80 quintals/acre',
    soils: ['loamy', 'sandy', 'alluvial'],
    water: ['drip', 'canal', 'borewell'],
    seasons: ['Winter'],
    zones: [ZONES.PLAIN, ZONES.SUBMONTANE],
  },
  {
    name: 'Spinach (Palak)',
    category: 'vegetable_leafy_root',
    localName: 'पालक',
    mandiName: 'Spinach',
    duration: 45,
    typicalYield: '30-45 quintals/acre',
    soils: ['loamy', 'alluvial', 'black'],
    water: ['drip', 'canal', 'borewell', 'well'],
    seasons: ['Winter', 'Monsoon', 'Summer'],
    zones: [ZONES.PLAIN, ZONES.NORTH_KONKAN_COASTAL, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.SUBMONTANE],
  },
  {
    name: 'Methi (Fenugreek Leaves)',
    category: 'vegetable_leafy_root',
    localName: 'मेथी',
    mandiName: 'Methi(Leaves)',
    duration: 40,
    typicalYield: '25-35 quintals/acre',
    soils: ['loamy', 'black', 'alluvial'],
    water: ['drip', 'canal', 'borewell', 'well'],
    seasons: ['Winter', 'Monsoon', 'Summer'],
    zones: [ZONES.PLAIN, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.SUBMONTANE, ZONES.NORTH_KONKAN_COASTAL],
  },
  {
    name: 'Coriander (Kothimbir)',
    category: 'spice',
    localName: 'कोथिंबीर',
    mandiName: 'Coriander(Leaves)',
    duration: 45,
    typicalYield: '20-30 quintals/acre',
    soils: ['loamy', 'black', 'alluvial'],
    water: ['drip', 'canal', 'borewell', 'well'],
    seasons: ['Winter', 'Monsoon', 'Summer'],
    zones: [ZONES.PLAIN, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.SUBMONTANE, ZONES.NORTH_KONKAN_COASTAL],
  },
  {
    name: 'Drumstick (Shevga)',
    category: 'vegetable_fruiting',
    localName: 'शेवगा',
    mandiName: 'Drumstick',
    duration: 365,
    typicalYield: '40-60 quintals/acre/year',
    soils: ['red', 'sandy', 'loamy', 'black'],
    water: ['drip', 'rainwater', 'borewell', 'well'],
    seasons: ['Monsoon', 'Winter', 'Summer'],
    zones: [ZONES.SCARCITY, ZONES.PLAIN, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.NORTH_KONKAN_COASTAL],
  },
  {
    name: 'Sweet Potato',
    category: 'vegetable_leafy_root',
    localName: 'रताळे',
    mandiName: 'Sweet Potato',
    duration: 120,
    typicalYield: '50-70 quintals/acre',
    soils: ['sandy', 'loamy', 'laterite', 'red'],
    water: ['rainwater', 'drip', 'borewell', 'well'],
    seasons: ['Monsoon', 'Winter'],
    zones: [ZONES.NORTH_KONKAN_COASTAL, ZONES.SOUTH_KONKAN_COASTAL, ZONES.EASTERN_VIDARBHA, ZONES.PLAIN],
  },

  // ── Spices ─────────────────────────────────────────────────────────────
  {
    name: 'Turmeric (Halad)',
    category: 'spice',
    localName: 'हळद',
    mandiName: 'Turmeric',
    duration: 270,
    typicalYield: '20-25 quintals/acre (dry)',
    soils: ['loamy', 'black', 'red', 'alluvial'],
    water: ['drip', 'canal', 'borewell', 'well'],
    seasons: ['Monsoon'],
    zones: [ZONES.SUBMONTANE, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.PLAIN, ZONES.EASTERN_VIDARBHA],
  },
  {
    name: 'Ginger (Aale)',
    category: 'spice',
    localName: 'आले',
    mandiName: 'Ginger(Green)',
    duration: 240,
    typicalYield: '60-80 quintals/acre',
    soils: ['loamy', 'laterite', 'red'],
    water: ['drip', 'canal', 'borewell', 'well'],
    seasons: ['Monsoon'],
    zones: [ZONES.SUBMONTANE, ZONES.WESTERN_GHAT, ZONES.PLAIN],
  },

  // ── Fruit trees and orchards ───────────────────────────────────────────
  {
    name: 'Grapes',
    category: 'fruit_tree',
    localName: 'द्राक्ष',
    mandiName: 'Grapes',
    duration: 1095,
    typicalYield: '100-140 quintals/acre/year',
    soils: ['black', 'loamy', 'red'],
    water: ['drip', 'borewell', 'canal', 'well'],
    seasons: ['Winter', 'Summer'],
    zones: [ZONES.PLAIN, ZONES.SUBMONTANE, ZONES.SCARCITY],
  },
  {
    name: 'Pomegranate (Dalimb)',
    category: 'fruit_tree',
    localName: 'डाळिंब',
    mandiName: 'Pomegranate',
    duration: 1095,
    typicalYield: '40-60 quintals/acre/year',
    soils: ['black', 'red', 'loamy', 'sandy'],
    water: ['drip', 'borewell', 'well'],
    seasons: ['Monsoon', 'Winter', 'Summer'],
    zones: [ZONES.SCARCITY, ZONES.PLAIN, ZONES.SUBMONTANE, ZONES.CENTRAL_MAHARASHTRA_PLATEAU],
  },
  {
    name: 'Banana',
    category: 'fruit_tree',
    localName: 'केळी',
    mandiName: 'Banana',
    duration: 365,
    typicalYield: '250-350 quintals/acre',
    soils: ['loamy', 'alluvial', 'black', 'clay'],
    water: ['drip', 'canal', 'borewell', 'river', 'well'],
    seasons: ['Monsoon', 'Winter', 'Summer'],
    zones: [ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.PLAIN, ZONES.NORTH_KONKAN_COASTAL],
  },
  {
    name: 'Orange (Nagpur Santra)',
    category: 'fruit_tree',
    localName: 'संत्रा',
    mandiName: 'Orange',
    duration: 1460,
    typicalYield: '60-90 quintals/acre/year',
    soils: ['black', 'loamy', 'red'],
    water: ['drip', 'borewell', 'well', 'canal'],
    seasons: ['Monsoon', 'Winter'],
    zones: [ZONES.CENTRAL_VIDARBHA, ZONES.EASTERN_VIDARBHA],
  },
  {
    name: 'Sweet Lime (Mosambi)',
    category: 'fruit_tree',
    localName: 'मोसंबी',
    mandiName: 'Mousambi(Sweet Lime)',
    duration: 1460,
    typicalYield: '60-90 quintals/acre/year',
    soils: ['black', 'loamy', 'red'],
    water: ['drip', 'borewell', 'well', 'canal'],
    seasons: ['Monsoon', 'Winter'],
    zones: [ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.CENTRAL_VIDARBHA, ZONES.SCARCITY],
  },
  {
    name: 'Mango (Alphonso/Hapus)',
    category: 'fruit_tree',
    localName: 'हापूस आंबा',
    mandiName: 'Mango',
    duration: 1825,
    typicalYield: '25-40 quintals/acre/year',
    soils: ['laterite', 'red', 'loamy'],
    water: ['rainwater', 'drip', 'well', 'borewell'],
    seasons: ['Summer'],
    zones: [ZONES.SOUTH_KONKAN_COASTAL, ZONES.NORTH_KONKAN_COASTAL, ZONES.WESTERN_GHAT],
  },
  {
    name: 'Cashewnut (Kaju)',
    category: 'plantation_perennial',
    localName: 'काजू',
    mandiName: 'Cashewnuts',
    duration: 1460,
    typicalYield: '6-10 quintals/acre/year',
    soils: ['laterite', 'red', 'sandy'],
    water: ['rainwater', 'none', 'drip'],
    seasons: ['Summer'],
    zones: [ZONES.SOUTH_KONKAN_COASTAL, ZONES.NORTH_KONKAN_COASTAL],
  },
  {
    name: 'Coconut',
    category: 'plantation_perennial',
    localName: 'नारळ',
    mandiName: 'Coconut',
    duration: 2555,
    typicalYield: '8000-12000 nuts/acre/year',
    soils: ['laterite', 'sandy', 'alluvial', 'loamy'],
    water: ['rainwater', 'well', 'drip', 'canal', 'borewell'],
    seasons: ['Monsoon', 'Winter', 'Summer'],
    zones: [ZONES.SOUTH_KONKAN_COASTAL, ZONES.NORTH_KONKAN_COASTAL],
  },
  {
    name: 'Arecanut (Supari)',
    category: 'plantation_perennial',
    localName: 'सुपारी',
    mandiName: 'Arecanut(Betelnut/Supari)',
    duration: 2190,
    typicalYield: '5-8 quintals/acre/year',
    soils: ['laterite', 'loamy', 'red'],
    water: ['rainwater', 'well', 'drip', 'canal'],
    seasons: ['Monsoon', 'Winter'],
    zones: [ZONES.SOUTH_KONKAN_COASTAL, ZONES.NORTH_KONKAN_COASTAL],
  },
  {
    name: 'Kokum',
    category: 'plantation_perennial',
    localName: 'कोकम',
    mandiName: 'kokum',
    duration: 2190,
    typicalYield: '4-6 quintals/acre/year',
    soils: ['laterite', 'red'],
    water: ['rainwater', 'none', 'well'],
    seasons: ['Summer'],
    zones: [ZONES.SOUTH_KONKAN_COASTAL],
  },
  {
    name: 'Custard Apple (Sitaphal)',
    category: 'fruit_tree',
    localName: 'सीताफळ',
    mandiName: 'Custard Apple(Sharifa)',
    duration: 1095,
    typicalYield: '20-30 quintals/acre/year',
    soils: ['red', 'black', 'sandy', 'loamy'],
    water: ['rainwater', 'drip', 'none', 'well'],
    seasons: ['Monsoon'],
    zones: [ZONES.SCARCITY, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.PLAIN],
  },
  {
    name: 'Ber (Bor)',
    category: 'fruit_tree',
    localName: 'बोर',
    mandiName: 'Ber(Zizyphus/Borehannu)',
    duration: 1095,
    typicalYield: '30-50 quintals/acre/year',
    soils: ['sandy', 'red', 'black'],
    water: ['rainwater', 'none', 'drip', 'well'],
    seasons: ['Winter'],
    zones: [ZONES.SCARCITY, ZONES.CENTRAL_MAHARASHTRA_PLATEAU],
  },
  {
    name: 'Guava (Peru)',
    category: 'fruit_tree',
    localName: 'पेरू',
    mandiName: 'Guava',
    duration: 1095,
    typicalYield: '50-70 quintals/acre/year',
    soils: ['loamy', 'red', 'black', 'alluvial'],
    water: ['drip', 'borewell', 'well', 'canal'],
    seasons: ['Monsoon', 'Winter'],
    zones: [ZONES.PLAIN, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.SCARCITY, ZONES.CENTRAL_VIDARBHA],
  },
  {
    name: 'Papaya',
    category: 'fruit_tree',
    localName: 'पपई',
    mandiName: 'Papaya',
    duration: 365,
    typicalYield: '150-200 quintals/acre/year',
    soils: ['loamy', 'sandy', 'alluvial', 'red'],
    water: ['drip', 'borewell', 'well', 'canal'],
    seasons: ['Monsoon', 'Winter', 'Summer'],
    zones: [ZONES.PLAIN, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.NORTH_KONKAN_COASTAL, ZONES.SUBMONTANE],
  },
  {
    name: 'Chikoo (Sapota)',
    category: 'fruit_tree',
    localName: 'चिकू',
    mandiName: 'Chikoos(Sapota)',
    duration: 1825,
    typicalYield: '40-60 quintals/acre/year',
    soils: ['laterite', 'loamy', 'sandy', 'alluvial'],
    water: ['drip', 'well', 'borewell', 'rainwater'],
    seasons: ['Monsoon', 'Winter', 'Summer'],
    zones: [ZONES.NORTH_KONKAN_COASTAL, ZONES.SOUTH_KONKAN_COASTAL],
  },
  {
    name: 'Strawberry',
    category: 'fruit_tree',
    localName: 'स्ट्रॉबेरी',
    mandiName: 'Strawberry',
    duration: 150,
    typicalYield: '40-60 quintals/acre',
    soils: ['loamy', 'red', 'laterite'],
    water: ['drip', 'well', 'borewell'],
    seasons: ['Winter'],
    zones: [ZONES.WESTERN_GHAT, ZONES.SUBMONTANE],
  },

  // ── Sugarcane — Maharashtra's largest irrigated crop by area ───────────
  {
    name: 'Sugarcane',
    category: 'plantation_perennial',
    localName: 'ऊस',
    mandiName: 'Sugarcane',
    duration: 365,
    typicalYield: '350-450 quintals/acre',
    soils: ['black', 'clay', 'loamy', 'alluvial'],
    water: ['canal', 'drip', 'borewell', 'river', 'well'],
    seasons: ['Monsoon', 'Winter'],
    zones: [ZONES.SUBMONTANE, ZONES.PLAIN, ZONES.WESTERN_GHAT, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.EASTERN_VIDARBHA],
  },

  // ── Flowers ────────────────────────────────────────────────────────────
  {
    name: 'Marigold (Zendu)',
    category: 'flower',
    localName: 'झेंडू',
    mandiName: 'Marigold(loose)',
    duration: 90,
    typicalYield: '25-35 quintals/acre',
    soils: ['loamy', 'red', 'black', 'alluvial'],
    water: ['drip', 'canal', 'borewell', 'well'],
    seasons: ['Winter', 'Monsoon'],
    zones: [ZONES.PLAIN, ZONES.CENTRAL_MAHARASHTRA_PLATEAU, ZONES.SUBMONTANE, ZONES.NORTH_KONKAN_COASTAL],
  },
  {
    name: 'Rose',
    category: 'flower',
    localName: 'गुलाब',
    mandiName: 'Rose(Local)',
    duration: 730,
    typicalYield: '3-5 lakh flowers/acre/year',
    soils: ['loamy', 'red'],
    water: ['drip', 'canal', 'well'],
    seasons: ['Winter', 'Summer', 'Monsoon'],
    zones: [ZONES.PLAIN, ZONES.SUBMONTANE, ZONES.WESTERN_GHAT],
  },
  {
    name: 'Jasmine (Mogra)',
    category: 'flower',
    localName: 'मोगरा',
    mandiName: 'Jasmine',
    duration: 1095,
    typicalYield: '20-30 quintals/acre/year',
    soils: ['loamy', 'red', 'laterite', 'alluvial'],
    water: ['drip', 'well', 'borewell', 'canal'],
    seasons: ['Summer', 'Monsoon'],
    zones: [ZONES.NORTH_KONKAN_COASTAL, ZONES.PLAIN, ZONES.SUBMONTANE],
  },
];

// TEMPORARY BRIDGE — remove in Phase A5.
// The Crop model, 12 screens and three routes still read `localName`. A5
// renames that field to `localName` everywhere and migrates existing
// documents; until then every crop carries both, holding the same Marathi
// string, so nothing reads an undefined name in the interim.
for (const crop of CROPS) crop.localName = crop.localName;

module.exports = {
  ZONES,
  DISTRICT_ZONE_MAP,
  CROPS,
  normalizeDistrictName,
  resolveZone,
};

// Maharashtra agro-climatic zones — district → zone mapping.
//
// ZONE NAMES ARE OFFICIAL. Taken verbatim from the Government of Maharashtra
// Department of Agriculture publication "Climate and Agriculture"
// (krishi.maharashtra.gov.in/Site/Upload/Pdf/Publications/Climate.pdf, p.76-77):
//   "The Maharashtra state is divided into nine agro-climatic zones."
//
// ⚠️ THE DISTRICT MAPPING IS AN APPROXIMATION AND NEEDS LOCAL VERIFICATION.
// That government PDF names the nine zones but publishes no district table —
// it mentions only four districts, and those are university addresses. The
// real zone boundaries are drawn at *taluka* level and cut straight through
// districts: Kolhapur, Satara, Pune, Nashik, Ahmednagar and Chandrapur each
// span two or more zones. What follows assigns each district its DOMINANT
// zone, which is what a district-level lookup can express.
//
// Before the demo, verify the districts you actually present with a local
// agriculture officer or the relevant state agricultural university
// (MPKV Rahuri · Dr. PDKV Akola · VNMKV Parbhani · DBSKKV Dapoli), and say
// plainly that this is a district-level approximation rather than implying
// taluka-accurate coverage.
//
// This is the district->zone source of truth. data/agroZones.js builds its
// ZONES and DISTRICT_ZONE_MAP from here and adds the crop table on top, so the
// two can never disagree; the four consumers (cropRecommendationEngine.js,
// dailyTaskEngine.js, routes/ai.js and data/growthStageRules.js) go through
// that file, not this one.

const MH_ZONES = {
  SOUTH_KONKAN_COASTAL: {
    name: 'South Konkan Coastal Zone',
    rainfall: '2500-3500 mm',
    soils: ['laterite', 'coastal alluvial'],
    districts: ['Ratnagiri', 'Sindhudurg'],
    crops: ['Rice', 'Coconut', 'Mango (Alphonso)', 'Cashew', 'Arecanut', 'Kokum'],
  },
  NORTH_KONKAN_COASTAL: {
    name: 'North Konkan Coastal Zone',
    rainfall: '2000-3000 mm',
    soils: ['laterite', 'coastal alluvial', 'saline coastal'],
    districts: ['Thane', 'Palghar', 'Raigad', 'Mumbai City', 'Mumbai Suburban'],
    crops: ['Rice', 'Ragi', 'Coconut', 'Chikoo', 'Vegetables', 'Flowers'],
  },
  WESTERN_GHAT: {
    name: 'Western Ghat Zone',
    rainfall: '2000-6000 mm',
    soils: ['laterite', 'shallow red'],
    // NASHIK WAS MOVED OUT OF THIS ZONE — see PLAIN below. Only Nashik's
    // western talukas (Igatpuri, Peth, Surgana) are ghat; the onion belt that
    // defines the district agriculturally sits in the drier eastern plain,
    // and a district-level lookup has to pick one. Kolhapur likewise spans
    // ghat and submontane; its dominant agriculture (sugarcane, rice) fits
    // here well enough at district granularity.
    districts: ['Kolhapur'],
    crops: ['Rice', 'Nagli (Ragi)', 'Varai', 'Grapes', 'Strawberry', 'Vegetables'],
  },
  SUBMONTANE: {
    name: 'Submontane Zone',
    rainfall: '700-2000 mm',
    soils: ['medium black', 'lateritic'],
    districts: ['Satara', 'Sangli'],
    crops: ['Sugarcane', 'Jowar', 'Groundnut', 'Turmeric', 'Grapes', 'Soyabean'],
  },
  PLAIN: {
    name: 'Plain Zone',
    rainfall: '600-900 mm',
    soils: ['medium to deep black'],
    // Nashik sits here, not in the Western Ghat zone. Its western talukas are
    // genuinely ghat, but Lasalgaon/Niphad/Yeola — Asia's largest onion market
    // and the belt that defines the district — are eastern plain, 600-800 mm,
    // deep black soil. Left in WESTERN_GHAT the recommendation engine offered
    // rice and strawberry for an onion district. Verified against the demo
    // use case; still a district-level approximation, as above.
    districts: ['Pune', 'Nashik'],
    crops: ['Sugarcane', 'Jowar', 'Bajra', 'Onion', 'Wheat', 'Pomegranate', 'Grapes'],
  },
  SCARCITY: {
    name: 'Scarcity Zone',
    rainfall: '400-700 mm',
    soils: ['shallow to medium black', 'murmad'],
    // ~23.8% of the state's geographical area, per the Climate publication.
    districts: ['Solapur', 'Ahilyanagar', 'Beed', 'Dharashiv'],
    crops: ['Bajra', 'Jowar', 'Sunflower', 'Safflower', 'Pomegranate', 'Custard Apple', 'Tur'],
  },
  CENTRAL_MAHARASHTRA_PLATEAU: {
    name: 'Central Maharashtra – Plateau Zone',
    rainfall: '700-900 mm',
    soils: ['medium black', 'deep black'],
    // ~24.8% of the state's geographical area — the largest single zone.
    districts: [
      'Chhatrapati Sambhajinagar', 'Jalna', 'Parbhani', 'Hingoli', 'Nanded',
      'Latur', 'Buldhana', 'Jalgaon', 'Dhule', 'Nandurbar',
    ],
    crops: ['Cotton', 'Soyabean', 'Tur', 'Jowar', 'Bajra', 'Banana', 'Sweet Orange (Mosambi)', 'Wheat'],
  },
  CENTRAL_VIDARBHA: {
    name: 'Central Vidarbha Zone',
    rainfall: '900-1250 mm',
    soils: ['deep black cotton'],
    districts: ['Amravati', 'Akola', 'Washim', 'Yavatmal', 'Wardha', 'Nagpur'],
    crops: ['Cotton', 'Soyabean', 'Tur', 'Jowar', 'Orange (Nagpur Santra)', 'Gram'],
  },
  EASTERN_VIDARBHA: {
    name: 'Eastern Vidarbha Zone',
    rainfall: '1250-1700 mm',
    soils: ['clayey', 'heavy black', 'lateritic'],
    districts: ['Bhandara', 'Gondia', 'Chandrapur', 'Gadchiroli'],
    crops: ['Rice', 'Tur', 'Linseed', 'Gram', 'Wheat', 'Sugarcane'],
  },
};

// Renamed districts. Agmarknet and older datasets still use the old names,
// so both must resolve. Same trap as the district alias map in geoService.js.
const DISTRICT_ALIASES = {
  aurangabad: 'Chhatrapati Sambhajinagar',
  sambhajinagar: 'Chhatrapati Sambhajinagar',
  osmanabad: 'Dharashiv',
  ahmednagar: 'Ahilyanagar',
  ahmadnagar: 'Ahilyanagar',
  nasik: 'Nashik',
  bombay: 'Mumbai City',
};

const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

const DISTRICT_TO_ZONE = {};
for (const [key, zone] of Object.entries(MH_ZONES)) {
  for (const d of zone.districts) DISTRICT_TO_ZONE[normalize(d)] = key;
}

/** Canonical district name, resolving renames and spelling variants. */
function canonicalDistrict(raw) {
  const n = normalize(raw);
  if (!n) return null;
  if (DISTRICT_ALIASES[n]) return DISTRICT_ALIASES[n];
  for (const zone of Object.values(MH_ZONES)) {
    const hit = zone.districts.find((d) => normalize(d) === n);
    if (hit) return hit;
  }
  return null;
}

/** Zone record for a district name, or null. */
function zoneForDistrict(raw) {
  const canon = canonicalDistrict(raw);
  if (!canon) return null;
  const key = DISTRICT_TO_ZONE[normalize(canon)];
  return key ? { key, ...MH_ZONES[key] } : null;
}

const ALL_DISTRICTS = Object.values(MH_ZONES).flatMap((z) => z.districts).sort();

module.exports = {
  MH_ZONES,
  DISTRICT_ALIASES,
  ALL_DISTRICTS,
  canonicalDistrict,
  zoneForDistrict,
};

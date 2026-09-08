// services/yieldBenchmarkService.js
//
// What a hectare of this crop has actually yielded in this district.
//
// ⚠️ THIS IS NOT D5, AND IT IS NOT A FORECAST.
//
//   D5 exists — `ai-service/train_yield.py`, LightGBM, 50.08% MAPE against
//   59.25% persistence, served crops chosen by an absolute 40% MAPE floor. It
//   is a real, validated model and it **cannot be served**, because its inputs
//   run out before the present day:
//
//       ICRISAT crop yields end 2017   (9 years stale)
//       ICRISAT rainfall ends 2015     (11 years stale)
//
//   The feature vector needs the district's three previous yields and the
//   CURRENT year's monsoon rainfall. To answer "what will 2026 yield be" the
//   model would need 2023–25 yields and 2026 rain, none of which exist in any
//   dataset this project has. Filling those lags with anything — a mean, the
//   last known value, a guess — is fabricating the model's inputs and calling
//   the output a prediction. This codebase does not do that.
//
//   So the honest product is the DATA, not the model: what this crop has
//   really yielded in this district over the last five years ICRISAT covers.
//   A farmer setting an expectation, or sizing a lot before harvest, is served
//   by "wheat in Latur has run 1,300–1,700 kg/ha" — and that sentence is true,
//   where a 2026 "forecast" would not be.
//
//   D5 stays in the repo, trained and reported, as evidence the modelling was
//   done. It is NOT counted among the shipped models. Three ship: D1, D2, D3.
//   If ICRISAT ever publishes past 2017, this file is what D5 replaces.

const { resolveDistrict } = require('./geoService');

const RAW = require('../data/yieldBenchmarks.json');
const META = RAW.meta;
const BENCH = RAW.benchmarks;

// ICRISAT district spellings are the 1966 apportioned set — "Amarawati",
// "Ahmednagar", "Aurangabad". Everything else in this app speaks the current
// names, so both sides go through the same resolver rather than matching text.
const BY_DISTRICT = {};
for (const [crop, districts] of Object.entries(BENCH)) {
  for (const [icrisatName, stats] of Object.entries(districts)) {
    const d = resolveDistrict(icrisatName);
    if (!d) continue;
    (BY_DISTRICT[d] = BY_DISTRICT[d] || {})[crop] = stats;
  }
}

// App crop name -> ICRISAT crop key. Built from the mapping the training script
// itself uses, so the two never drift apart.
const APP_TO_CROP = {};
for (const [icrisatCrop, appCrop] of Object.entries(META.cropToApp || {})) {
  if (appCrop) APP_TO_CROP[normalise(appCrop)] = icrisatCrop;
}

// ICRISAT's 1966 APPORTIONED district set has 25 of Maharashtra's 36 districts.
// The other 11 were created later and their land sits inside a parent district's
// rows — Latur was carved out of Osmanabad in 1982, Washim out of Akola in 1998.
//
// A farmer in Latur is told WHERE the number lives rather than just "no data",
// and is never silently shown the parent's figure as if it were their own: the
// parent covers a much larger and differently-cropped area, and presenting it
// as Latur's record would be exactly the kind of quiet substitution the rest of
// this codebase refuses.
const PARENT_BEFORE_1966 = {
  Latur: 'Dharashiv',              // split from Osmanabad, 1982
  Washim: 'Akola',                 // 1998
  Hingoli: 'Nanded',               // 1999
  Gondia: 'Bhandara',              // 1999
  Nandurbar: 'Dhule',              // 1998
  Jalna: 'Chhatrapati Sambhajinagar', // 1981
  Gadchiroli: 'Chandrapur',        // 1982
  Sindhudurg: 'Ratnagiri',         // 1981
  Palghar: 'Thane',                // 2014
  'Mumbai City': 'Thane',
  'Mumbai Suburban': 'Thane',
};

function normalise(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '');
}

/** ICRISAT crop key for an app crop name, or null. */
function cropKeyFor(cropName) {
  const n = normalise(cropName);
  if (!n) return null;
  if (APP_TO_CROP[n]) return APP_TO_CROP[n];
  // "Wheat" inside "Wheat (Sharbati)", and the reverse.
  for (const [app, key] of Object.entries(APP_TO_CROP)) {
    if (app.length >= 4 && (n.includes(app) || app.includes(n))) return key;
  }
  const direct = Object.keys(BENCH).find((k) => normalise(k) === n);
  return direct || null;
}

/**
 * The district's own record for this crop.
 *
 * Returns null rather than a state average when the district has no rows —
 * "we don't have this" is more useful than a number from somewhere else, and
 * a farmer in Gadchiroli should not be shown Nashik's wheat yield.
 */
function benchmarkFor(cropName, districtName) {
  const district = resolveDistrict(districtName);
  const crop = cropKeyFor(cropName);
  if (!district || !crop) {
    return {
      available: false,
      reason: !crop
        ? `No district yield record for ${cropName} in the ICRISAT dataset.`
        : `No yield record for ${districtName}.`,
    };
  }
  const stats = (BY_DISTRICT[district] || {})[crop];
  if (!stats) {
    const parent = PARENT_BEFORE_1966[district];
    return {
      available: false,
      district,
      crop,
      // Name the parent, do NOT return its number. See PARENT_BEFORE_1966.
      parentDistrict: parent || null,
      reason: parent
        ? `${district} was created after 1966, and ICRISAT's district data uses the `
          + `1966 boundaries — this land is inside ${parent}'s rows. We do not show you `
          + `${parent}'s yield as if it were ${district}'s.`
        : `ICRISAT has no ${crop.toLowerCase()} yield rows for ${district}.`,
    };
  }

  return {
    available: true,
    district,
    crop,
    unit: META.unit,
    medianYieldKgPerHa: stats.median,
    rangeKgPerHa: [stats.min, stats.max],
    yearsOfData: stats.years,
    window: META.window,
    // Said on every response, because the gap between "what it has yielded"
    // and "what it will yield" is the whole point.
    basis: `Recorded yields in ${district}, ${META.window[0]}–${META.window[1]} `
      + `(ICRISAT district data). This is what the crop HAS done here, not a forecast `
      + `for this season — nothing in it knows about this year's rain.`,
    stale: true,
    staleYears: new Date().getFullYear() - META.window[1],
  };
}

/** Everything recorded for one district, for a "what grows well here" view. */
function forDistrict(districtName) {
  const district = resolveDistrict(districtName);
  if (!district || !BY_DISTRICT[district]) {
    const parent = district ? PARENT_BEFORE_1966[district] : null;
    return {
      available: false,
      district: district || null,
      parentDistrict: parent || null,
      reason: parent
        ? `${district} was created after 1966; ICRISAT's data for this land sits in ${parent}.`
        : 'No ICRISAT yield rows for this district.',
      crops: [],
    };
  }
  const crops = Object.entries(BY_DISTRICT[district])
    .map(([crop, s]) => ({
      crop,
      appCrop: META.cropToApp[crop] || null,
      medianYieldKgPerHa: s.median,
      rangeKgPerHa: [s.min, s.max],
      yearsOfData: s.years,
    }))
    .sort((a, b) => b.medianYieldKgPerHa - a.medianYieldKgPerHa);
  return { available: true, district, window: META.window, unit: META.unit, crops };
}

module.exports = {
  META,
  PARENT_BEFORE_1966,
  benchmarkFor,
  forDistrict,
  cropKeyFor,
  // Cotton and sugarcane are excluded at build time: ICRISAT records sugarcane
  // as gur (~7,100 kg/ha, not cane ~80,000) and cotton as lint. Both would read
  // as plainly wrong to any grower.
  EXCLUDED: META.excluded,
};

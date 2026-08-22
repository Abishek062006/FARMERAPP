// Fertilizer data backing the daily task engine's fertilizing touchpoints.
// Three distinct kinds of number here, each defensible for a different
// reason — never blended into one fabricated "just trust me" figure:
//
//   1. Crop-specific N:P:K requirement (kg/acre, or kg/plant/year for trees)
//      — real published agronomic figures for crops we have solid data on.
//      Everything else falls back to a category-level AVERAGE, which is
//      always labeled "general" wherever it's surfaced — never presented
//      with the same confidence as a crop-specific number.
//   2. The touchpoint split (how much of the total dose falls on which of
//      the 4 fertilizing days) — standard agronomic convention: phosphorus
//      is basal-only (it doesn't move through soil), potassium splits
//      basal/later to support fruit-fill, nitrogen splits across all four
//      touchpoints since it leaches and needs topping up.
//   3. Fertilizer product nutrient content (Urea/DAP/MOP percentages) —
//      fixed chemistry, not an estimate, used only to translate a nutrient
//      requirement into a practical "how much of the bag" quantity.
//
// What this deliberately does NOT do: adjust for the farmer's actual soil
// nutrient level. `Land.soilType` (red/black/clay) is a category, not a lab
// measurement — real soil-test-based adjustment needs Soil Health Card data
// this app doesn't have access to for any farmer.

const PRODUCT_NUTRIENT_CONTENT = {
  urea: { label: 'Urea', nutrient: 'n', percent: 0.46 },
  dap: { label: 'DAP', nutrient: 'p', percent: 0.46 },
  mop: { label: 'MOP (Muriate of Potash)', nutrient: 'k', percent: 0.60 },
};

// kg/acre for field crops, kg/plant/year for perennials (basis: 'plant').
// Sourced from general TNAU/ICAR-published package-of-practices figures —
// only crops we have solid, confidently-known data for are listed here.
const CROP_FERTILIZER = {
  'Rice (Paddy)': { n: 48, p: 16, k: 16, basis: 'area' },
  Sugarcane: { n: 100, p: 40, k: 40, basis: 'area' },
  Cotton: { n: 32, p: 16, k: 16, basis: 'area' },
  Groundnut: { n: 8, p: 16, k: 16, basis: 'area' },
  Maize: { n: 48, p: 24, k: 16, basis: 'area' },
  'Sorghum (Cholam)': { n: 32, p: 16, k: 8, basis: 'area' },
  'Pearl Millet (Cumbu)': { n: 32, p: 16, k: 8, basis: 'area' },
  'Finger Millet (Ragi)': { n: 18, p: 16, k: 8, basis: 'area' },
  'Black Gram': { n: 4, p: 8, k: 0, basis: 'area' },
  'Green Gram': { n: 4, p: 8, k: 0, basis: 'area' },
  'Red Gram (Tur)': { n: 4, p: 16, k: 8, basis: 'area' },
  Tomato: { n: 40, p: 20, k: 20, basis: 'area' },
  Onion: { n: 40, p: 20, k: 20, basis: 'area' },
  Brinjal: { n: 48, p: 24, k: 24, basis: 'area' },
  'Okra (Ladies Finger)': { n: 32, p: 16, k: 16, basis: 'area' },
  Chili: { n: 32, p: 16, k: 16, basis: 'area' },
  Turmeric: { n: 24, p: 20, k: 20, basis: 'area' },
  'Sesame (Gingelly)': { n: 8, p: 8, k: 0, basis: 'area' },
  Cabbage: { n: 40, p: 20, k: 20, basis: 'area' },
  Carrot: { n: 24, p: 16, k: 16, basis: 'area' },
  Sunflower: { n: 24, p: 16, k: 8, basis: 'area' },
  Banana: { n: 0.2, p: 0.03, k: 0.3, basis: 'plant' },
  Coconut: { n: 0.5, p: 0.32, k: 1.2, basis: 'plant' },
  Mango: { n: 0.5, p: 0.25, k: 0.5, basis: 'plant' },
};

// Category-level averages — deliberately coarser than the table above, used
// only as a fallback, and always labeled "general estimate" wherever shown.
const CATEGORY_FERTILIZER_DEFAULT = {
  cereal: { n: 32, p: 16, k: 12, basis: 'area' },
  pulse: { n: 6, p: 10, k: 4, basis: 'area' },
  oilseed: { n: 12, p: 14, k: 6, basis: 'area' },
  vegetable_fruiting: { n: 36, p: 18, k: 18, basis: 'area' },
  vegetable_leafy_root: { n: 28, p: 16, k: 16, basis: 'area' },
  spice: { n: 20, p: 18, k: 16, basis: 'area' },
  flower: { n: 24, p: 16, k: 12, basis: 'area' },
  plantation_perennial: { n: 0.3, p: 0.15, k: 0.3, basis: 'plant' },
  fruit_tree: { n: 0.3, p: 0.15, k: 0.3, basis: 'plant' },
};

// Fraction of the TOTAL n/p/k dose applied at each of the 4 fertilizing
// touchpoints (same day-fractions dailyTaskEngine already uses to decide
// WHEN a fertilizing task fires: 0.05/0.30/0.55/0.75 of crop duration).
// Phosphorus is 100% basal (immobile in soil); potassium splits basal/
// fruit-fill (supports fruit/grain development); nitrogen splits across
// all four (leaches, needs repeated topping up). Each column sums to 1.0.
const TOUCHPOINT_NUTRIENT_SPLIT = [
  { n: 0.25, p: 1.0, k: 0.5 }, // basal
  { n: 0.35, p: 0.0, k: 0.0 }, // first top-dress
  { n: 0.25, p: 0.0, k: 0.25 }, // pre-flowering top-dress
  { n: 0.15, p: 0.0, k: 0.25 }, // fruit/grain-fill
];

function getFertilizerRequirement(cropName, category) {
  if (CROP_FERTILIZER[cropName]) {
    return { ...CROP_FERTILIZER[cropName], isSpecific: true };
  }
  const fallback = CATEGORY_FERTILIZER_DEFAULT[category];
  if (fallback) {
    return { ...fallback, isSpecific: false };
  }
  return { n: 20, p: 12, k: 10, basis: 'area', isSpecific: false };
}

function acresFromAreaField(area) {
  if (!area || area.value == null) return null;
  const conversions = { acres: 1, hectares: 2.471, sqft: 1 / 43560, sqm: 1 / 4046.86 };
  const factor = conversions[area.unit];
  return factor ? area.value * factor : null;
}

module.exports = {
  PRODUCT_NUTRIENT_CONTENT,
  CROP_FERTILIZER,
  CATEGORY_FERTILIZER_DEFAULT,
  TOUCHPOINT_NUTRIENT_SPLIT,
  getFertilizerRequirement,
  acresFromAreaField,
};

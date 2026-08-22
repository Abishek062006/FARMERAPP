// Stage-duration rules for the day-by-day growth tracker.
//
// Pure data — no crop-specific hardcoding here, just per-category fraction
// splits of a crop's own `duration` (from agroZones.js) into growth stages.
// Perennial/plantation crops (duration > PERENNIAL_DURATION_THRESHOLD_DAYS)
// don't get fraction-based staging at all — tracking a 6-year rubber tree
// day-by-day the same way as a 90-day tomato would fabricate precision the
// catalog has no data to support, so they get a capped "establishment
// phase" followed by a low-cadence "maintenance" phase instead.

// Whether a crop is tracked in full daily-fraction mode or capped into an
// establishment+maintenance mode is decided by DURATION ALONE, not category
// — e.g. Banana (duration exactly 365, category `fruit_tree`) must stay in
// full daily-tracking mode (TN farmers treat its first cycle as annual-crop-
// like), while Black Pepper (a `spice` botanically, but duration 1095, a
// perennial vine) must still get capped. `category` only ever selects which
// STAGE_SPLITS shape to use — it never gates the cap by itself.
const PERENNIAL_DURATION_THRESHOLD_DAYS = 365; // > this, not >=, per Banana above.

const ESTABLISHMENT_PHASE_DAYS = {
  plantation_perennial: 180,
  fruit_tree: 180,
};
const DEFAULT_ESTABLISHMENT_PHASE_DAYS = 180;

// [germination, vegetative, flowering, fruiting, harvest] — must sum to 1.0.
// vegetable_leafy_root has no real "fruiting" stage (you eat the leaf/root,
// not a fruit) — its 0-fraction bucket is filtered out of the calendar
// response rather than fabricating a fake stage. plantation_perennial and
// fruit_tree entries exist as a safety net for the rare short-duration case
// (Banana, Papaya, Drumstick) — most crops in those two categories are long
// enough to hit the establishment/maintenance cap instead and never use them.
const STAGE_SPLITS = {
  cereal: [0.08, 0.42, 0.20, 0.22, 0.08],
  pulse: [0.10, 0.35, 0.25, 0.22, 0.08],
  oilseed: [0.10, 0.40, 0.22, 0.20, 0.08],
  vegetable_fruiting: [0.08, 0.30, 0.17, 0.37, 0.08],
  vegetable_leafy_root: [0.10, 0.55, 0.20, 0.00, 0.15],
  spice: [0.10, 0.50, 0.20, 0.15, 0.05],
  flower: [0.10, 0.35, 0.20, 0.30, 0.05],
  plantation_perennial: [0.05, 0.55, 0.15, 0.20, 0.05],
  fruit_tree: [0.05, 0.35, 0.20, 0.35, 0.05],
};

const STAGE_NAMES = ['germination', 'vegetative', 'flowering', 'fruiting', 'harvest'];

function isLongDurationCrop(duration) {
  return duration > PERENNIAL_DURATION_THRESHOLD_DAYS;
}

function getEstablishmentPhaseDays(category) {
  return ESTABLISHMENT_PHASE_DAYS[category] ?? DEFAULT_ESTABLISHMENT_PHASE_DAYS;
}

// Splits `duration` days into stage day-ranges (1-indexed, inclusive),
// clamped so no stage is zero-length, filtering out any stage whose
// category-fraction is exactly 0 (e.g. leafy_root's "fruiting"). Callers
// decide separately (via isLongDurationCrop) whether this daily-fraction
// breakdown even applies, or whether the crop is in capped/maintenance mode.
function computeStageRanges(category, duration) {
  const splits = STAGE_SPLITS[category];
  if (!splits) return [];

  let cursor = 1;
  const ranges = [];
  splits.forEach((fraction, i) => {
    if (fraction <= 0) return;
    const length = Math.max(1, Math.round(fraction * duration));
    const startDay = cursor;
    const endDay = Math.min(duration, cursor + length - 1);
    if (startDay > duration) return;
    ranges.push({ stage: STAGE_NAMES[i], startDay, endDay });
    cursor = endDay + 1;
  });

  // Rounding can leave the last stage short of `duration` — extend it to
  // cover the remainder rather than leaving a gap the calendar can't
  // explain.
  if (ranges.length > 0) {
    ranges[ranges.length - 1].endDay = duration;
  }

  return ranges;
}

module.exports = {
  PERENNIAL_DURATION_THRESHOLD_DAYS,
  ESTABLISHMENT_PHASE_DAYS,
  DEFAULT_ESTABLISHMENT_PHASE_DAYS,
  STAGE_SPLITS,
  STAGE_NAMES,
  isLongDurationCrop,
  getEstablishmentPhaseDays,
  computeStageRanges,
};

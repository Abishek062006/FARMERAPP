// services/storageService.js
//
// H1/H2 — what it costs to hold a crop, and what holding it costs you.
//
// Two different costs, and conflating them is how "hold for a better price"
// becomes bad advice:
//   1. What you PAY the godown — a rate, per tonne per month. Cheap.
//   2. What the crop LOSES while it sits — spoilage, shrinkage, weight loss.
//      Usually far larger than (1), and invisible until the lot is weighed
//      again at sale.
//
// WHERE THE SPOILAGE FIGURES COME FROM, AND WHAT THEY ARE NOT
//   They are anchored to published Maharashtra outcomes, not measured by us:
//     · NAFED reduced its own onion storage losses from 25% to 15% over a
//       storage season (~5 months) — institutional storage, done properly.
//       15% over ~22 weeks ≈ 0.7%/week; 25% ≈ 1.3%/week.
//     · September 2025, Junnar and Shirur (Pune district): farmers reported
//       roughly HALF their stored onion spoiled after continuous rain, in
//       on-farm storage they could not dry the crop out of.
//   So the spread between a proper ventilated chawl and an on-farm heap in a
//   wet spell is not marginal — it is the difference between losing a tenth of
//   the lot and losing half of it.
//
//   CALIBRATION, CHECKED RATHER THAN CLAIMED. At 1.5%/week a chawl loses 27.7%
//   over five months, against NAFED's reported 15–25%; on-farm loses 58% where
//   Pune farmers reported ~50%. Both land at the pessimistic end of the real
//   range, and that is deliberate: 1.5%/week is D2's own onion figure, and a
//   sale-window model that says "hold" on one spoilage rate while the rupee
//   figure beside it uses another would be two answers resting on different
//   physics. Consistency with D2 beats a closer fit to one published number.
//
//   These remain ASSUMPTIONS with a documented basis, exactly like D2's
//   holding-cost figures (which they are deliberately kept consistent with —
//   onion 1.5%/week, grains 0.5%/week). Any caller quoting a rupee figure
//   built on them must carry that uncertainty forward rather than presenting
//   the output as measured. See sensitivity() below, which exists so a screen
//   can show the range instead of a single confident number.

const { haversineKm } = require('./geoService');
const { MH_DISTRICT_CENTROIDS, MH_DISTRICT_ANCHORS } = require('../data/districtCentroids');

// Crop families, because spoilage tracks physiology rather than market.
const FAMILY = {
  onion: ['onion', 'kanda'],
  potato: ['potato', 'batata'],
  perishable: ['tomato', 'grapes', 'grape', 'pomegranate', 'banana', 'mango',
    'brinjal', 'okra', 'bhendi', 'chilli', 'cabbage', 'cauliflower', 'carrot'],
  grain: ['wheat', 'paddy', 'rice', 'jowar', 'sorghum', 'bajra', 'maize',
    'soyabean', 'soybean', 'gram', 'harbhara', 'tur', 'chickpea', 'moong',
    'green gram', 'black gram', 'udid', 'safflower', 'karadi', 'linseed',
    'groundnut', 'sunflower', 'sesamum', 'cotton'],
};

function familyOf(commodity) {
  const c = String(commodity || '').toLowerCase();
  for (const [fam, names] of Object.entries(FAMILY)) {
    if (names.some((n) => c.includes(n))) return fam;
  }
  return 'unknown';
}

// Percent of the lot lost per WEEK, by crop family and storage structure.
// null = this crop should not be put in this structure at all.
const WEEKLY_LOSS_PCT = {
  onion: {
    ventilated_chawl: 1.5,   // the correct structure; matches D2's assumption
    godown: 2.5,             // closed godown traps moisture — onion sprouts
    on_farm: 4.0,            // the September 2025 Pune outcome, annualised down
    cold_storage: null,      // wrong for onion: it sweats on removal and rots
    silo: null,
  },
  potato: { cold_storage: 0.4, godown: 2.0, ventilated_chawl: 2.0, on_farm: 3.5, silo: null },
  perishable: { cold_storage: 1.0, godown: 4.0, ventilated_chawl: 3.5, on_farm: 7.0, silo: null },
  grain: { godown: 0.5, silo: 0.3, ventilated_chawl: 0.8, on_farm: 1.5, cold_storage: 0.5 },
  unknown: { godown: 1.0, silo: 1.0, ventilated_chawl: 1.5, on_farm: 3.0, cold_storage: 1.0 },
};

// Storing with no godown at all — the farmer's own shed or a heap under a
// tarpaulin. Not a Warehouse record, but by far the most common option, so it
// has to be priceable or the comparison is dishonest by omission.
const ON_FARM = {
  key: 'on_farm',
  label: 'At your own farm',
  ratePerTonnePerMonth: 0,
  type: 'on_farm',
};

/**
 * Fraction of the lot SURVIVING after `days` in a given structure.
 *
 * Compounding weekly rather than linear: losses are proportional to what is
 * still there, and a linear model drives a long hold to a negative quantity.
 * Returns null when the crop must not go in that structure at all — the caller
 * must handle that rather than defaulting to a number.
 */
function survivalFraction(commodity, storageType, days) {
  const weekly = (WEEKLY_LOSS_PCT[familyOf(commodity)] || WEEKLY_LOSS_PCT.unknown)[storageType];
  if (weekly == null) return null;
  const weeks = Math.max(0, days) / 7;
  return Math.pow(1 - weekly / 100, weeks);
}

/** Weekly loss percent, for showing the working. */
function weeklyLossPct(commodity, storageType) {
  return (WEEKLY_LOSS_PCT[familyOf(commodity)] || WEEKLY_LOSS_PCT.unknown)[storageType] ?? null;
}

/** What the godown charges for holding `tonnes` for `days`. */
function storageCost(ratePerTonnePerMonth, tonnes, days) {
  const months = Math.max(0, days) / 30;
  return Math.round((Number(ratePerTonnePerMonth) || 0) * tonnes * months);
}

/**
 * Interest on a pledge loan taken against the stored lot.
 *
 * Simple interest, not compounded: these are short holds measured in weeks,
 * and Indian pledge schemes quote a flat annual rate over the loan period.
 * Returns 0 when no loan is taken — a farmer who can afford to wait pays no
 * interest, and pretending otherwise would understate the case for holding.
 */
function pledgeInterest(loanAmount, interestPctPerYear, days) {
  if (!loanAmount || loanAmount <= 0) return 0;
  return Math.round(loanAmount * (Number(interestPctPerYear) || 0) / 100 * (Math.max(0, days) / 365));
}

/**
 * How much cash a farmer can raise NOW against a lot they are holding.
 *
 * This is the whole reason storage matters to the problem statement: a farmer
 * sells at harvest because he needs money this week, not because he does not
 * know the price. A hold recommendation that ignores that is telling someone
 * to be less poor.
 *
 * ELIGIBILITY ONLY. The app does not lend, arrange or guarantee anything.
 */
function pledgeEligibility(lotValue, warehouse) {
  const p = warehouse && warehouse.pledgeLoan;
  if (!p || !p.available) return { available: false, amount: 0, maxPctOfValue: 0, interestPctPerYear: 0 };
  const pct = Number(p.maxPctOfValue) || 0;
  return {
    available: true,
    maxPctOfValue: pct,
    interestPctPerYear: Number(p.interestPctPerYear) || 0,
    amount: Math.round((Number(lotValue) || 0) * pct / 100),
  };
}

/**
 * Is this structure appropriate for this crop at all?
 * Separated from the maths so a screen can warn before a farmer drives there.
 */
function suitability(commodity, storageType) {
  const fam = familyOf(commodity);
  const weekly = (WEEKLY_LOSS_PCT[fam] || WEEKLY_LOSS_PCT.unknown)[storageType];
  if (weekly == null) {
    return {
      suitable: false,
      reason: fam === 'onion' && storageType === 'cold_storage'
        ? 'Onion should not go into cold storage — it sweats when it comes out and rots quickly. A ventilated chawl is the right structure.'
        : 'This crop should not be stored in this kind of structure.',
    };
  }
  return { suitable: true, reason: null };
}

/**
 * The same hold priced at half and double the assumed spoilage rate.
 *
 * The spoilage figures move the answer more than anything else in the
 * calculation and they are assumptions, so any screen quoting a rupee gain
 * should be able to show how far that gain moves when the assumption is wrong.
 * Same reasoning as D2's 0.5x/1x/2x holding-cost sensitivity table.
 */
function sensitivity(fn) {
  return { low: fn(0.5), base: fn(1), high: fn(2) };
}

// ─────────────────────────────────────────────────────────────────────────
// WHERE A WAREHOUSE ACTUALLY IS, AND WHAT ITS DISTANCE IS WORTH
//
// ⚠️ MSWC PUBLISHES ADDRESSES, NOT COORDINATES. Of 202 imported warehouses,
//   67 sit on their taluka's anchor town and 135 sit on the DISTRICT CENTROID
//   — scripts/importMswcWarehouses.js places them and records which in each
//   `verifiedNote`. That is not a rounding error, it is a whole district
//   collapsed to one dot.
//
// AN EARLIER NOTE IN CLAUDE.md CALLED THIS "good enough to rank nearest".
//   That was wrong, and demonstrably so. In Nashik SIX MSWC godowns — Ambad,
//   Manmad, Nampur, Nandgaon, Satana and Wani — share the single centroid
//   coordinate, so a farmer at Lasalgaon was shown 22.9 km for every one of
//   them and an identical ₹1,024 to store the same lot in any of them. They
//   cannot be ranked against each other at all: Manmad and Satana are roughly
//   70 km apart on the ground. Six identical, one-decimal-place distances do
//   not read as an approximation, they read as broken software.
//
// THE FIX IS HONESTY, NOT INVENTED COORDINATES. We do not have real ones and
//   making them up would be the storage equivalent of faking a live agent
//   position. So:
//     · every record says how precisely it is placed (`locationPrecision`)
//     · a precise-looking `distanceKm` is emitted ONLY for a coordinate that is
//       actually a location. An approximated one gets a deliberately coarse
//       `approxDistanceKm` instead, and `distanceKm: null`
//     · records sharing one approximated point are GROUPED rather than listed
//       as N separately-ranked rows (see groupApproximated)
// ─────────────────────────────────────────────────────────────────────────

// ~55 m. Coordinates copied from data/districtCentroids.js are byte-identical
// in practice; the tolerance is only here so a re-import that reformats a
// figure cannot silently reclassify a record as a real location.
const COORD_EPSILON_DEG = 0.0005;

const samePoint = (a, b) =>
  Math.abs(a.lat - b.lat) < COORD_EPSILON_DEG && Math.abs(a.lng - b.lng) < COORD_EPSILON_DEG;

const PRECISION_NOTE = {
  exact: null,
  taluka: 'Placed on this taluka\'s main town, not on the godown itself — MSWC publishes an address, '
    + 'not coordinates. Treat the distance as the distance to the town.',
  district: 'NOT A REAL LOCATION. This record is placed on the district centre because MSWC publishes '
    + 'an address, not coordinates, and no town in the address could be matched. Every warehouse placed '
    + 'this way in the district shares one point, so their distances cannot be compared with each other. '
    + 'Ring the godown for where it actually is.',
  unknown: 'This record has no usable coordinate, so no distance can be given.',
};

/**
 * How precisely is this record placed? 'exact' | 'taluka' | 'district' | 'unknown'.
 *
 * Prefers the stored `locationPrecision` (written by the importer), then the
 * sentence the importer left in `verifiedNote`, and only then falls back to
 * comparing the coordinate against the very tables the approximation was drawn
 * from. The fallback exists so the 213 records already in Atlas are classified
 * correctly without a migration — and it is not a guess: a warehouse sitting
 * EXACTLY on its district's centroid is sitting there because something put it
 * there.
 */
function coordinatePrecision(w) {
  if (!w) return 'unknown';
  // The farmer's own farm is where the farmer is. Nothing approximate about it.
  if (w.type === 'on_farm') return 'exact';
  if (['exact', 'taluka', 'district'].includes(w.locationPrecision)) return w.locationPrecision;

  const note = String(w.verifiedNote || '');
  if (/approximated to district level/i.test(note)) return 'district';
  if (/approximated to taluka level/i.test(note)) return 'taluka';

  const p = w.location;
  if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return 'unknown';
  if (MH_DISTRICT_CENTROIDS.some((c) => samePoint(c, p))) return 'district';
  if (MH_DISTRICT_ANCHORS.some((a) => samePoint(a, p))) return 'taluka';
  return 'exact';
}

/**
 * A distance rounded coarsely enough that it cannot be mistaken for a measured
 * one. 10 km buckets for a district centroid, 5 km for a taluka town — both are
 * wider than the error they are hiding is small, which is the point.
 */
const coarseKm = (km, precision) => {
  const bucket = precision === 'district' ? 10 : 5;
  return Math.max(bucket, Math.round(km / bucket) * bucket);
};

/**
 * Distance-sorted, with each record carrying how precisely it is placed.
 *
 * The list is still ORDERED by the computed distance — an approximate ordering
 * is genuinely better than none, and a farmer looking for storage near
 * Lasalgaon should still see Lasalgaon first. What changes is what is SHOWN:
 * a one-decimal figure only survives for a coordinate that is a real location.
 */
function rankByDistance(warehouses, point) {
  return warehouses
    .map((w) => {
      const precision = coordinatePrecision(w);
      const approximate = precision !== 'exact';
      const raw = point && w.location && typeof w.location.lat === 'number'
        ? haversineKm(point, { lat: w.location.lat, lng: w.location.lng })
        : null;
      return {
        w,
        rankKm: raw ?? Infinity,
        out: {
          ...w,
          locationPrecision: precision,
          locationApproximate: approximate,
          locationNote: PRECISION_NOTE[precision],
          // null, NOT a number, whenever the coordinate is an approximation.
          // Emitting 22.9 km from a district centroid is the whole bug.
          distanceKm: raw == null || approximate ? null : Math.round(raw * 10) / 10,
          approxDistanceKm: raw == null || !approximate ? null : coarseKm(raw, precision),
          distanceApproximate: approximate,
        },
      };
    })
    .sort((a, b) => a.rankKm - b.rankKm)
    .map((x) => x.out);
}

/**
 * Collapse warehouses that share ONE APPROXIMATED COORDINATE into a group.
 *
 * Six godowns on the district centroid are not six results, they are one dot
 * with six names on it. Ranking them against each other is meaningless — they
 * all score the same number by construction — and presenting them as six rows
 * pushes genuinely different options off the screen while implying a precision
 * that does not exist.
 *
 * A group of ONE is not a group. A single warehouse whose coordinate is
 * approximated still ranks against the others perfectly well; it just carries
 * its `locationApproximate` flag. Only a tie needs collapsing.
 *
 * Takes the output of rankByDistance() and returns ordered rows, each either
 * `{ kind: 'warehouse' }` or `{ kind: 'group' }`, preserving the ranking.
 */
function groupApproximated(ranked) {
  const groups = new Map();
  const rows = [];

  for (const w of ranked) {
    const key = w.locationApproximate && w.location
      ? `${w.district}@${w.location.lat},${w.location.lng}`
      : null;
    if (!key) { rows.push({ kind: 'warehouse', warehouse: w }); continue; }

    if (!groups.has(key)) {
      const g = {
        key,
        district: w.district,
        taluka: w.taluka || '',
        precision: w.locationPrecision,
        coordinate: { lat: w.location.lat, lng: w.location.lng },
        approxDistanceKm: w.approxDistanceKm,
        note: PRECISION_NOTE[w.locationPrecision],
        members: [],
      };
      groups.set(key, g);
      rows.push({ kind: 'group', group: g });
    }
    groups.get(key).members.push(w);
  }

  // Un-group the singletons, and label what is left.
  return rows.map((r) => {
    if (r.kind !== 'group') return r;
    if (r.group.members.length === 1) return { kind: 'warehouse', warehouse: r.group.members[0] };
    r.group.count = r.group.members.length;
    r.group.label = groupLabel(r.group);
    return r;
  });
}

/** "6 MSWC godowns in Nashik district — distances approximate". */
function groupLabel(g) {
  const operators = new Set(g.members.map((m) => m.operator));
  const types = new Set(g.members.map((m) => m.type));
  const who = operators.size === 1 ? String([...operators][0]).toUpperCase() : '';
  const what = types.size === 1
    ? (TYPE_LABELS[[...types][0]] || 'storage place').toLowerCase() + 's'
    : 'storage places';
  const where = g.precision === 'district'
    ? `${g.district} district`
    : `${g.taluka || g.district}`;
  return `${g.count} ${[who, what].filter(Boolean).join(' ')} in ${where} — `
    + `all placed on the same ${g.precision === 'district' ? 'district centre' : 'town'}, `
    + 'so these distances are approximate and cannot be ranked against each other.';
}

const TYPE_LABELS = {
  godown: 'Godown',
  ventilated_chawl: 'Ventilated chawl',
  cold_storage: 'Cold storage',
  silo: 'Silo',
  on_farm: 'On the farm',
};

module.exports = {
  OPERATOR_LABELS: {
    mswc: 'Maharashtra State Warehousing Corporation',
    cwc: 'Central Warehousing Corporation',
    apmc: 'APMC godown',
    cooperative: 'Cooperative society',
    fpo: 'Producer company',
    private: 'Private warehouse',
  },
  TYPE_LABELS,
  PRECISION_NOTE,
  ON_FARM,
  WEEKLY_LOSS_PCT,
  familyOf,
  survivalFraction,
  weeklyLossPct,
  storageCost,
  pledgeInterest,
  pledgeEligibility,
  suitability,
  sensitivity,
  rankByDistance,
  coordinatePrecision,
  groupApproximated,
};

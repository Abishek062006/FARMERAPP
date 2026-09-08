// src/utils/lotDisplay.js
//
// F2 PHASE F — HOW A GRADE-SEPARATED FPO LOT IS ALLOWED TO LOOK.
//
// Two buyer screens read the same lot shape: Vendor/BundlesScreen.jsx (the
// catalog) and Vendor/LotOrderScreen.jsx (quote → confirm). If each kept its
// own copy of "what does an ungraded lot look like" or "what does a null fare
// print as", one of them would eventually drift into rendering ungraded as a
// fourth tier or a null figure as ₹0. Both are refusals the backend already
// made in words, so they get exactly one implementation on this side too:
//
//   • UNKNOWN IS NOT ZERO. `unpriceableLots` carry null distance, null vehicle
//     and null fares on purpose — services/... routes/fpos.js says "a null fare
//     must never render as ₹0 or as a free trip". Every formatter here returns
//     an em dash for null and NEVER coerces to 0. That is why `money()` in this
//     file is not the `Number(n || 0)` helper the old screen had.
//
//   • UNGRADED IS ITS OWN THING, NOT A FOURTH GRADE. The backend sends
//     `grade.tier: null` deliberately — "it is NOT below C — it is unknown,
//     which is a different thing". So an ungraded lot gets a visually different
//     KIND of chip (dashed, neutral slate, question icon), not the next colour
//     down the A/B/C ramp.
//
//   • A DECLARED GRADE IS A CLAIM, NOT A FACT. `grade.selfDeclared` is true for
//     every lot in this database and `inspected` is always false. The grade chip
//     therefore never travels alone: it is always paired with the self-declared
//     marker, so aggregation cannot quietly turn N farmers' claims into one
//     apparent fact.
//
//   • TRUST IS PER FARMER. trustService refuses to band anyone below
//     MIN_TRADES_TO_SCORE and returns counts instead. `trustVisual()` mirrors
//     that refusal rather than inventing a label, and nothing here ever blends
//     several contributors into one group score.

/** en-IN digits. Not null-safe on purpose — callers below do the guarding. */
export const nf = (n) => Number(n).toLocaleString('en-IN');

const known = (n) => n != null && Number.isFinite(Number(n));

/**
 * ₹, or an em dash. NEVER ₹0 for an unknown — unknown is not free.
 *
 * Negatives print as −₹500, not ₹-500: a procurement group's margin and a
 * pooling saving are both genuinely negative sometimes, and the backend reports
 * them rather than clamping ("clamping this to zero would be the same lie as
 * clamping a negative pooling saving"), so the display must be able to say it.
 */
export const money = (n) => {
  if (!known(n)) return '—';
  const r = Math.round(Number(n));
  return r < 0 ? `−₹${nf(Math.abs(r))}` : `₹${nf(r)}`;
};

/** ₹/kg, keeping the paise the backend sent (an indicative price has them). */
export const perKg = (n) => (known(n) ? `₹${nf(Number(n))}/kg` : '—');

export const kgs = (n) => (known(n) ? `${nf(Number(n))} kg` : '—');

export const kms = (n) => (known(n) ? `${Number(n)} km` : '—');

export const pcts = (n) => (known(n) ? `${Number(n)}%` : '—');

// A/B/C only. There is no fourth entry here and there must never be one.
const GRADE_STYLE = {
  A: { fg: '#15803D', bg: '#DCFCE7', border: '#BBF7D0' },
  B: { fg: '#1D4ED8', bg: '#DBEAFE', border: '#BFDBFE' },
  C: { fg: '#B45309', bg: '#FEF3C7', border: '#FDE68A' },
};

/**
 * How to draw the grade of one lot.
 *
 * Reads `lot.grade` (the rich object) and falls back safely when a caller hands
 * over a thinner shape — an unpriceable lot carries the same grade object, but
 * a defensive `|| {}` costs nothing and a crash on a buyer's catalog costs the
 * whole screen.
 */
export function gradeVisual(lot) {
  const g = (lot && lot.grade) || {};
  const declared = g.declared === true && !!g.code;

  if (!declared) {
    return {
      declared: false,
      code: null,
      label: g.label || 'Grade not declared',
      fg: '#475569',
      bg: '#F8FAFC',
      border: '#CBD5E1',
      icon: 'help-circle-outline',
      // A dashed outline rather than a filled pill: this is deliberately not
      // the same KIND of object as a grade chip.
      dashed: true,
      // The backend sends `tier: null`, not 3. This line is that decision said
      // to the buyer in words.
      subline: 'Unknown — not a grade below C. Nobody has said either way.',
      disclaimer: g.disclaimer || null,
      selfDeclared: false,
      declaredBy: 0,
      mixedSpecVersions: false,
      specNote: null,
    };
  }

  const st = GRADE_STYLE[g.code] || GRADE_STYLE.C;
  return {
    declared: true,
    code: g.code,
    label: g.label || `Grade ${g.code}`,
    ...st,
    icon: 'pricetag-outline',
    dashed: false,
    subline: null,
    // Always true in this database, and the chip is never drawn without it.
    selfDeclared: g.selfDeclared !== false,
    inspected: g.inspected === true,
    declaredBy: Number(g.declaredBy) || 0,
    disclaimer: g.disclaimer || null,
    mixedSpecVersions: !!g.mixedSpecVersions,
    specNote: g.specNote || null,
  };
}

// trustService.forFarmer() bands. `frequent` is the only red one, and even it
// says what it is measuring: what the farmer CONCEDED, not what they were
// accused of.
const FARMER_BANDS = {
  clean: { label: 'No quality complaints', fg: '#15803D', bg: '#DCFCE7', icon: 'checkmark-circle' },
  few_complaints: { label: 'Some complaints, none settled', fg: '#1D4ED8', bg: '#DBEAFE', icon: 'information-circle-outline' },
  some_upheld: { label: 'Has refunded on quality before', fg: '#B45309', bg: '#FEF3C7', icon: 'alert-circle-outline' },
  frequent: { label: 'Refunds on quality often', fg: '#B91C1C', bg: '#FEE2E2', icon: 'warning-outline' },
};

/**
 * ONE contributing farmer's record. Returns null when the backend attached no
 * trust object at all, so a caller can leave the row bare rather than print a
 * confident nothing.
 *
 * Below MIN_TRADES_TO_SCORE the service returns `scored: false`, a null band
 * and its own honest `reason` sentence. That is rendered AS the refusal — a
 * grey chip with the counts — and never rounded up into a band.
 */
export function trustVisual(trust) {
  if (!trust) return null;
  const deliveries = Number(trust.deliveries) || 0;
  const scored = trust.scored === true && !!FARMER_BANDS[trust.band];
  const b = scored ? FARMER_BANDS[trust.band] : null;

  const detail = deliveries === 0
    ? 'No completed deliveries recorded yet'
    : `${nf(deliveries)} delivered lot${deliveries === 1 ? '' : 's'}`
      + (Number(trust.qualityDisputes) > 0
        ? ` · ${nf(trust.qualityDisputes)} disputed on quality · ${nf(Number(trust.conceded) || 0)} settled by the farmer`
        : ' · none disputed on quality');

  return {
    scored,
    label: b ? b.label : (deliveries === 0 ? 'No record yet' : 'Too few deliveries to band'),
    fg: b ? b.fg : '#6B7280',
    bg: b ? b.bg : '#F1F5F9',
    icon: b ? b.icon : 'help-circle-outline',
    detail,
    // trustService's own sentence, when it declined to band.
    reason: scored ? null : (trust.reason || null),
  };
}

/** Short headings for the five exclusion reasons. The backend's own `detail`
 *  string is the sentence — this is only the label above it. */
export const EXCLUSION_LABEL = {
  beyond_max_bundle: 'Outside this collection run',
  no_pickup_location: 'No pickup point on file',
  second_listing_same_farmer: 'Second listing from the same farm',
  below_own_minimum: 'Below their own minimum',
  own_minimum_does_not_fit: 'Their minimum does not fit this order',
};

/** Why a lot's collection cost could not be priced at all. */
export const UNPRICEABLE_LABEL = {
  no_pickup_location: 'No pickup point on file',
  no_vehicle_fits: 'No vehicle can carry it in one run',
  no_route: 'No route could be measured',
};

/** Why a requested quantity was refused. Headings only — the backend sends the
 *  full sentence in `error`, and it already names a quantity that works. */
export const INFEASIBLE_LABEL = {
  NO_ORDERABLE_CONTRIBUTORS: 'Nothing in this lot can be ordered right now',
  BELOW_SMALLEST_MINIMUM: 'Below the smallest order anyone here accepts',
  EXCEEDS_ONE_RUN: 'More than one collection run can take',
  QUANTITY_NOT_COMPOSABLE: 'This exact quantity falls through a gap',
  TOO_MANY_STOPS: 'Too many farms for one vehicle',
  NO_AGREED_RATE: 'The group has no agreed rate for this lot',
  GRADE_UNKNOWN: 'This group buys by grade, and none is declared',
  LOT_NOT_FOUND: 'This lot is no longer on offer',
  BAD_LOT: 'That lot could not be identified',
  NO_DROPOFF: 'No delivery destination',
  BAD_QUANTITY: 'That is not a quantity',
  NO_ROUTE: 'No route could be measured',
  NO_VEHICLE: 'No vehicle fits this load',
  VEHICLE_UNSUITABLE: 'That vehicle cannot carry this load',
  UNKNOWN_VEHICLE: 'Unknown vehicle',
};

/** Which ceiling bound an EXCEEDS_ONE_RUN refusal. */
export const LIMITED_BY_LABEL = {
  vehicle_capacity: 'what one vehicle can carry',
  available_stock: 'what these farms hold between them',
};

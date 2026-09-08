// services/lotCatalogService.js
//
// F2 Phase C — A GROUP'S PRODUCE, AS LOTS SOMEBODY CAN ACTUALLY BUY.
//
// Before this file, GET /api/fpos/bundles grouped a group's live listings by
// (FPO, crop) and priced what pooled collection would cost. That is a savings
// calculator, not a catalog: it answered "what would one vehicle cost" and said
// nothing coherent about WHAT IS IN THE VEHICLE. Three farmers' onion went into
// one bundle whether one of them had declared Grade A and the other two nothing
// at all.
//
// ⚠️ A BUYER PAYING FOR GRADE A MUST NOT RECEIVE A BLEND OF A, B AND C.
// That is the hard rule this module exists to enforce, and it is the same rule
// the procurement rate table already follows (models/Fpo.js: rates are keyed on
// (crop, GRADE) and never blended — "a blended per-crop rate erases the only
// thing grading is for"). Lots are keyed on (crop, grade). Nothing in here ever
// merges two grades, and nothing ever averages a grade into existence.
//
// ── UNGRADED IS ITS OWN BUCKET, NOT A FOURTH TIER ──────────────────────────
// Most listings in this database carry no grade at all — grading is optional by
// design (CropListing.grade.code defaults to null, "because forcing a choice
// would just produce noise"). Two failure modes were available here and both
// are refused:
//
//   • DROPPING ungraded lots behind a grade filter. CLAUDE.md already records
//     this from the Requirements work: "Ungraded lots are deliberately NOT
//     excluded by a grade filter — most listings have no grade and hiding them
//     empties the screen." At the time of writing, 3 of 4 available listings in
//     Atlas are ungraded. A grade-separated catalog that hides them is an empty
//     catalog.
//   • INVENTING a grade for them — inferring one from price, from the farmer's
//     history, or quietly bucketing them with C. Nobody declared a grade; the
//     app does not get to declare one on the farmer's behalf, and a buyer who
//     read "Grade C" off a screen would be reading a fabrication.
//
// So ungraded produce gets `grade.key === 'ungraded'`, `grade.code === null`,
// `grade.declared === false`, `grade.tier === null` (it is NOT below C — it is
// unknown, which is a different thing) and the label "Grade not declared".
// `lot.ungraded` is true so a screen can render it differently without parsing
// anything.
//
// ── AGGREGATION MUST NOT LAUNDER A SELF-DECLARED CLAIM ─────────────────────
// `CropListing.grade.selfDeclared` is always true today: the farmer picks
// against the published AGMARK criteria and NOBODY CHECKS. Pooling five
// farmers' self-declarations into one confident "Grade A · 2,400 kg" headline
// would turn five unverified claims into one apparent fact — precisely the
// laundering this codebase refuses elsewhere (D3 is "freshness verified", never
// "Grade A certified"). So every graded lot carries `selfDeclared`, `inspected:
// false`, `declaredBy` (how many separate farmers each made this claim about
// their OWN produce) and gradeSpecs' own disclaimer, and each contributor keeps
// its own grade fields so a buyer can see the claim is N claims, not one.
//
// ── TWO CALLERS, ONE ARITHMETIC ────────────────────────────────────────────
// routes/fpos.js uses this for BOTH the buyer's catalog (GET /bundles) and the
// FPO admin's dashboard (GET /:id/dashboard → producesAggregation). They must
// never disagree about what the group holds, which is the same reason
// computeSettlement() is shared between /settlement and the dashboard. The
// difference between the two callers is only that the buyer's view then applies
// the ≤MAX_BUNDLE vehicle constraint and prices a route; the admin's view shows
// every contributor because no vehicle has been chosen yet.

const { specForCrop, GRADE_LABELS, DISCLAIMER } = require('../data/gradeSpecs');

/** The bucket key for produce nobody graded. Never a grade code. */
const UNGRADED = 'ungraded';

/** Declared grades, in the order a catalog should read them. */
const GRADE_ORDER = ['A', 'B', 'C'];

// Above this, the gap between the cheapest and dearest asking price inside one
// lot is called out rather than left for the reader to spot. It is a display
// threshold, not a rule about what may be sold: NOTHING is excluded or averaged
// away because of it. 10% of the cheapest member's price is roughly ₹2/kg on
// ₹20/kg onion — a real difference to a farmer, and a real difference to a
// buyer taking two tonnes.
const WIDE_SPREAD_PCT = 10;

const cropKeyOf = (name) => String(name || '').trim().toLowerCase();

/** 'A' | 'B' | 'C' | 'ungraded'. The only place a listing becomes a bucket. */
function gradeKeyOf(listing) {
  const code = listing && listing.grade && listing.grade.code;
  return GRADE_ORDER.includes(code) ? code : UNGRADED;
}

/** Ungraded sorts AFTER the declared grades without being ranked below C. */
function gradeRank(key) {
  const i = GRADE_ORDER.indexOf(key);
  return i === -1 ? GRADE_ORDER.length : i;
}

/**
 * Split listings into (crop, grade) buckets.
 *
 * Grouping is on the NORMALISED crop name so "onion" and "Onion" are one lot,
 * but the display name is taken from the first listing rather than being
 * lower-cased — the farmer typed it.
 *
 * Returns them in a stable order: crop name, then A, B, C, then ungraded. Two
 * identical calls produce identical output, same contract selectBundleLots()
 * holds itself to.
 */
function groupByCropGrade(listings) {
  const buckets = new Map();
  for (const l of listings) {
    const cropKey = cropKeyOf(l.cropName);
    const gradeKey = gradeKeyOf(l);
    const key = `${cropKey}::${gradeKey}`;
    if (!buckets.has(key)) {
      buckets.set(key, { key, cropKey, gradeKey, cropName: l.cropName, listings: [] });
    }
    buckets.get(key).listings.push(l);
  }
  return [...buckets.values()].sort(
    (a, b) => a.cropKey.localeCompare(b.cropKey)
      || gradeRank(a.gradeKey) - gradeRank(b.gradeKey)
  );
}

/**
 * THE PRICING TRAP, REPORTED RATHER THAN PAPERED OVER.
 *
 * Inside one (crop, grade) lot the farmers do not agree on a price. Member A
 * asks ₹18/kg, member B asks ₹24/kg for produce they have both declared Grade
 * A. There is no honest single "lot price" here:
 *
 *   • Quote the average and the member asking above it is underpaid by the
 *     display — a buyer who reads ₹21 and pays ₹21 × total kg has short-changed
 *     B by ₹3 on every kilogram B grew.
 *   • Quote the minimum and every member above it is misrepresented as willing
 *     to sell at a price they never offered.
 *   • Quote the maximum and the buyer is quoted more than the lot costs.
 *
 * So the lot reports an INDICATIVE price (what the whole lot works out at, at
 * the members' own asking prices — the weighted average, which is exactly
 * `cropValue / totalKg` and therefore not an invention) AND the real spread
 * beside it. `cropValue` is Σ(each member's own price × their own kilograms),
 * so the total is true even though no single ₹/kg describes the lot.
 *
 * ⚠️ PHASE D MUST HONOUR EACH FARMER'S OWN ASKING PRICE. `contributors[].
 * pricePerKg` is the authoritative figure for allocation and settlement; this
 * summary is for display and comparison only. Nothing downstream may multiply
 * `indicativePerKg` by an allocated quantity and call it what a farmer is owed.
 *
 * Weighted by available kilograms, not a plain mean: a 50 kg outlier at ₹40
 * must not drag the indicative price of a 2,000 kg lot.
 */
function priceSpread(listings) {
  const totalKg = listings.reduce((a, l) => a + (l.quantityAvailableKg || 0), 0);
  const prices = listings.map((l) => Number(l.pricePerKg) || 0);
  const value = listings.reduce((a, l) => a + (Number(l.pricePerKg) || 0) * (l.quantityAvailableKg || 0), 0);

  const minPerKg = prices.length ? Math.min(...prices) : null;
  const maxPerKg = prices.length ? Math.max(...prices) : null;
  const weighted = totalKg > 0 ? Math.round((value / totalKg) * 100) / 100 : null;
  const spreadPerKg = minPerKg == null ? null : Math.round((maxPerKg - minPerKg) * 100) / 100;
  // Measured against the CHEAPEST member, so it reads as "the dearest member
  // asks 33% more than the cheapest" — a sentence about two real farmers,
  // rather than a percentage of a number nobody quoted.
  const spreadPct = minPerKg > 0 ? Math.round(((maxPerKg - minPerKg) / minPerKg) * 1000) / 10 : null;
  const distinctPrices = new Set(prices).size;
  const wide = distinctPrices > 1 && spreadPct != null && spreadPct >= WIDE_SPREAD_PCT;

  return {
    indicativePerKg: weighted,
    weightedAvgPerKg: weighted,
    minPerKg, maxPerKg,
    spreadPerKg, spreadPct,
    distinctPrices,
    wide,
    wideSpreadThresholdPct: WIDE_SPREAD_PCT,
    basis: 'weighted_average_of_members_own_asking_prices',
    note: distinctPrices <= 1
      ? 'Every member of this lot asks the same price.'
      : `Members of this lot ask between ₹${minPerKg} and ₹${maxPerKg}/kg for produce they have each `
        + `declared the same grade. ₹${weighted}/kg is what the whole lot works out at, at their own `
        + 'asking prices — it is NOT a price any member has offered, and buying part of the lot costs '
        + "whatever the members you actually buy from are asking. Each contributor's own price is in "
        + 'contributors[].pricePerKg and is the figure an order must honour.',
  };
}

/**
 * WHAT THE LOT'S MINIMUM ORDER DOES AND DOES NOT GUARANTEE.
 *
 * minOrderKg belongs to the LISTING, not to the lot, and it does not aggregate.
 * If member A will sell from 100 kg and member B from 500 kg, then:
 *
 *   • a 200 kg order is fillable — but ONLY from A. It is not "200 kg of the
 *     lot"; it is 200 kg of A's produce.
 *   • a 600 kg order is fillable from A alone if A has the stock, or from A+B
 *     only if B's slice of it is at least B's own 500 kg minimum.
 *   • so "any quantity above the lot minimum can be filled from the lot" is
 *     FALSE, and reporting a single number without saying so would make it look
 *     true.
 *
 * `smallestOrderKg` is therefore the smallest quantity ANY ONE contributor will
 * sell, and it is reported with `fillableAtSmallestFrom` (how many contributors
 * could actually serve an order that size) beside it. `allContributorsMinKg` is
 * the other end: the smallest order that can draw on EVERY contributor at once,
 * because each has to be given at least their own minimum.
 *
 * A contributor whose own minOrderKg exceeds their remaining stock cannot fill
 * any order at all — the stock is real, so it stays in the lot's kilograms, but
 * it is flagged rather than counted as orderable.
 */
function minOrderProfile(listings) {
  const byContributor = listings.map((l) => ({
    listingId: l._id,
    farmerUid: l.farmerUid,
    farmerName: l.farmerName,
    minOrderKg: l.minOrderKg ?? 1,
    availableKg: l.quantityAvailableKg,
    canFillOwnMinimum: (l.minOrderKg ?? 1) <= l.quantityAvailableKg,
  }));

  const fillable = byContributor.filter((c) => c.canFillOwnMinimum);
  const smallestOrderKg = fillable.length ? Math.min(...fillable.map((c) => c.minOrderKg)) : null;
  const fillableAtSmallestFrom = smallestOrderKg == null
    ? 0 : fillable.filter((c) => c.minOrderKg <= smallestOrderKg).length;
  const largestContributorMinKg = byContributor.length
    ? Math.max(...byContributor.map((c) => c.minOrderKg)) : null;
  const allContributorsMinKg = fillable.reduce((a, c) => a + c.minOrderKg, 0) || null;
  const unfillableContributors = byContributor.filter((c) => !c.canFillOwnMinimum).length;

  return {
    smallestOrderKg,
    fillableAtSmallestFrom,
    contributors: byContributor.length,
    largestContributorMinKg,
    allContributorsMinKg,
    unfillableContributors,
    byContributor,
    note: smallestOrderKg == null
      ? 'No contributor in this lot has enough stock left to meet their own minimum order, so nothing '
        + 'here can be ordered right now.'
      : `${smallestOrderKg} kg is the smallest order ANY ONE member of this lot will accept, and it can `
        + `be filled by ${fillableAtSmallestFrom} of ${byContributor.length} contributor`
        + `${byContributor.length === 1 ? '' : 's'}. It does NOT mean every quantity above it can be `
        + 'filled from the lot as a whole: each farmer keeps their own minimum (see byContributor), so '
        + `an order that draws on every contributor needs at least ${allContributorsMinKg} kg.`,
  };
}

/**
 * The grade this lot is, said in a way that cannot be mistaken for an
 * inspection — and, when nobody declared one, cannot be mistaken for a grade.
 */
function describeGrade(gradeKey, cropName, listings) {
  if (gradeKey === UNGRADED) {
    return {
      key: UNGRADED,
      code: null,
      declared: false,
      // NOT 'Grade D', NOT 'Ungraded produce' dressed as a tier. Nobody made a
      // claim about this produce; the label says exactly that.
      label: 'Grade not declared',
      // Deliberately null, not 3. Ungraded is UNKNOWN, not "below C" — a lot
      // nobody graded may well be Grade A produce; no one has said either way.
      tier: null,
      selfDeclared: false,
      inspected: false,
      declaredBy: 0,
      specKey: null,
      specVersions: [],
      mixedSpecVersions: false,
      agmarkClass: null,
      disclaimer: 'Nobody has declared a grade for this produce. It is not a grade below A, B or C — '
        + 'it is unknown. Inspect it, or agree a grade with the seller, before paying a graded price.',
    };
  }

  const spec = specForCrop(cropName);
  const specVersions = [...new Set(listings.map((l) => l.grade?.specVersion ?? null))]
    .filter((v) => v != null).sort((a, b) => a - b);
  const specKeys = [...new Set(listings.map((l) => l.grade?.specKey ?? null))].filter(Boolean);
  // Every listing pins the spec it was graded against, so an old listing keeps
  // meaning what it meant when it was written. Two contributors pinned to
  // DIFFERENT versions have not necessarily claimed the same thing, and a
  // catalog that merged them silently would be doing exactly the blending this
  // file exists to prevent — so it is said out loud instead.
  const mixedSpecVersions = specVersions.length > 1 || specKeys.length > 1;

  return {
    key: gradeKey,
    code: gradeKey,
    declared: true,
    label: GRADE_LABELS[gradeKey] || `Grade ${gradeKey}`,
    tier: gradeRank(gradeKey),
    // The weakest link governs: if ANY contributor's claim is self-declared —
    // and today every one of them is — the whole lot is self-declared.
    selfDeclared: listings.some((l) => l.grade?.selfDeclared !== false),
    inspected: false,
    // N farmers each made this claim about their OWN produce. One lot heading
    // does not turn that into one verified fact.
    declaredBy: new Set(listings.map((l) => l.farmerUid)).size,
    specKey: specKeys.length === 1 ? specKeys[0] : null,
    specVersions,
    mixedSpecVersions,
    agmarkClass: spec.grades?.[gradeKey]?.agmarkClass || null,
    disclaimer: DISCLAIMER,
    ...(mixedSpecVersions ? {
      specNote: 'Contributing lots were graded against different versions of the grading spec, so the '
        + 'same letter may not mean exactly the same criteria for every member. Each listing keeps the '
        + 'version it was posted under.',
    } : {}),
  };
}

/**
 * ONE (FPO, crop, grade) LOT, from a given set of contributing listings.
 *
 * `included` is what is in the lot as offered; `available` is every listing in
 * this (crop, grade) bucket before any vehicle constraint was applied. The
 * buyer's catalog passes a truncated `included` and the full `available`; the
 * admin dashboard passes the same array for both, because no vehicle has been
 * chosen there. EVERY figure below is computed from `included` only.
 *
 * ⚠️ ONE FARMER CAN BE IN TWO LOTS, AND THAT IS ONE PICKUP STOP.
 * A farmer holding a Grade A listing and a Grade B listing of the same crop
 * legitimately appears in both lots — the grades must not be blended, so the
 * lots must stay separate. But if a buyer takes both, the vehicle stops at that
 * farm ONCE. Two consequences for whoever builds ordering (Phase D):
 *
 *   1. The ≤5-stop cap must be counted over DISTINCT farmerUid across every
 *      lot in the purchase, not per lot. Two lots of five contributors each can
 *      be anywhere from five to ten stops.
 *   2. Fares must not be added lot-by-lot. Each lot's `bundledFare` prices that
 *      lot's own run; two such runs sharing a farm (or sharing a road) cost
 *      less together than the sum.
 *
 * That is why every contributor carries `farmerUid` and `listingId`, and why
 * `farmersAlsoInOtherLots` is filled in by the caller once all of a group's
 * lots exist. Phase C does not build ordering and does not try to solve this;
 * it makes sure the shape carries enough identity that Phase D can, and names
 * the trap so nobody rediscovers it from a wrong invoice.
 */
function describeLot({ cropName, cropKey, gradeKey, included, available }, { trustByUid = null } = {}) {
  const all = available || included;
  const totalKg = included.reduce((a, l) => a + (l.quantityAvailableKg || 0), 0);
  const cropValue = Math.round(
    included.reduce((a, l) => a + (Number(l.pricePerKg) || 0) * (l.quantityAvailableKg || 0), 0)
  );
  const price = priceSpread(included);
  const minOrder = minOrderProfile(included);

  const contributors = included.map((l) => ({
    listingId: l._id,
    _id: l._id,                       // the field Vendor/BundlesScreen.jsx keys rows on
    farmerUid: l.farmerUid,           // the identity Phase D dedupes pickup stops by
    farmerName: l.farmerName,
    quantityKg: l.quantityAvailableKg,
    // The price this farmer is asking. THE authoritative figure for ordering —
    // never lot.price.indicativePerKg.
    pricePerKg: l.pricePerKg,
    // This farmer's own floor. Does not aggregate; see minOrderProfile().
    minOrderKg: l.minOrderKg ?? 1,
    canFillOwnMinimum: (l.minOrderKg ?? 1) <= l.quantityAvailableKg,
    // A STRING code or null, matching what the listing stores and what the
    // existing screen renders. The lot-level object is where the grade is
    // described in full.
    grade: l.grade?.code || null,
    gradePin: {
      selfDeclared: l.grade?.selfDeclared !== false,
      specKey: l.grade?.specKey ?? null,
      specVersion: l.grade?.specVersion ?? null,
      note: l.grade?.note || '',
    },
    // PER CONTRIBUTOR, never blended into one group score. Buying two tonnes
    // from five farmers means reading five delivery records — that is the added
    // value of the group view, and an averaged "group trust" would be a
    // fabrication of exactly the kind trustService itself refuses (it will not
    // even band ONE farmer below MIN_TRADES_TO_SCORE).
    trust: trustByUid ? (trustByUid.get(l.farmerUid) || null) : null,
  }));

  return {
    lotKey: `${cropKey}::${gradeKey}`,
    cropName,
    cropKey,
    gradeKey,
    ungraded: gradeKey === UNGRADED,
    grade: describeGrade(gradeKey, cropName, included),

    totalKg,
    // Every eligible contributor's stock in this (crop, grade) bucket, INCLUDING
    // any left out of the offered run. `totalKg` is what is on the vehicle;
    // this is what the group actually holds. Reporting only the first would let
    // a truncated lot read as "that is all they have", and a lot whose members
    // all lack a pickup point would read as an empty lot rather than as stock
    // nobody can route to.
    totalKgAvailable: all.reduce((a, l) => a + (l.quantityAvailableKg || 0), 0),
    farms: contributors.length,
    membersIncluded: new Set(included.map((l) => l.farmerUid)).size,
    membersAvailable: new Set(all.map((l) => l.farmerUid)).size,
    lotsIncluded: included.length,
    lotsAvailable: all.length,

    cropValue,
    price,
    // Kept as a plain number because the existing buyer screen reads it. It is
    // the weighted average and nothing else — `price` above is where the spread
    // that this single number cannot express actually lives.
    avgPricePerKg: price.weightedAvgPerKg,
    minOrder,
    minOrderKg: minOrder.smallestOrderKg,

    contributors,
    // LEGACY ALIAS, same array. Vendor/BundlesScreen.jsx renders `item.lots`
    // and Phase C is backend-only, so the name it reads has to survive. New
    // callers should read `contributors`; the two can never disagree because
    // they are the same object.
    lots: contributors,
    // Filled in by the caller once every lot of this group exists — see the
    // same-farmer-in-two-lots warning above.
    farmersAlsoInOtherLots: [],
  };
}

/**
 * Cross-reference a group's lots: which farmers appear in more than one, and
 * where. Mutates each lot's `farmersAlsoInOtherLots`, and returns the same
 * lots for convenience.
 *
 * This is the identity Phase D needs to count one farm as ONE stop rather than
 * two when a buyer takes both that farmer's grade lots.
 */
function linkSharedFarmers(lots) {
  const seen = new Map();                 // farmerUid → [{ lotKey, grade, name }]
  for (const lot of lots) {
    for (const c of lot.contributors) {
      if (!seen.has(c.farmerUid)) seen.set(c.farmerUid, []);
      seen.get(c.farmerUid).push({ lotKey: lot.lotKey, gradeKey: lot.gradeKey, farmerName: c.farmerName });
    }
  }
  for (const lot of lots) {
    lot.farmersAlsoInOtherLots = lot.contributors
      .map((c) => {
        const rows = (seen.get(c.farmerUid) || []).filter((r) => r.lotKey !== lot.lotKey);
        return rows.length ? {
          farmerUid: c.farmerUid,
          farmerName: c.farmerName,
          otherLotKeys: rows.map((r) => r.lotKey),
          otherGrades: rows.map((r) => r.gradeKey),
        } : null;
      })
      .filter(Boolean);
  }
  return lots;
}

/**
 * The whole catalog for a set of listings, with no vehicle constraint applied.
 * This is what the FPO admin's dashboard shows: every lot, every contributor.
 */
function buildLots(listings, opts = {}) {
  const lots = groupByCropGrade(listings).map((b) => describeLot({
    cropName: b.cropName, cropKey: b.cropKey, gradeKey: b.gradeKey,
    included: b.listings, available: b.listings,
  }, opts));
  return linkSharedFarmers(lots);
}

module.exports = {
  UNGRADED,
  GRADE_ORDER,
  WIDE_SPREAD_PCT,
  cropKeyOf,
  gradeKeyOf,
  gradeRank,
  groupByCropGrade,
  priceSpread,
  minOrderProfile,
  describeGrade,
  describeLot,
  linkSharedFarmers,
  buildLots,
};

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Warehouse = require('../models/Warehouse');
const { requireAuth } = require('../middleware/auth');
const { toLatLng, resolveDistrict } = require('../services/geoService');
const St = require('../services/storageService');

// H1 — where a farmer can actually put a crop, and what that costs.
//
// Clause 6 of 15, and the last one unbuilt. Until this existed the sale-window
// advice could say "hold" to a farmer with nowhere to hold anything.
//
// THIS ROUTE INFORMS. It does not book space, reserve capacity, take payment
// or arrange a loan — same rule as fares and settlement. The farmer rings the
// godown; the app tells them which one and what it will roughly cost.

// Two different notices, because there are now two different kinds of record.
//
// The original single notice claimed "free space is never shown because nobody
// publishes it". MSWC does publish it, per warehouse, at
// mswarehousing.com/aplcsn/Home/display_warehouses. The rule was never "hide
// vacancy" — it was "never INVENT vacancy". So a verified record shows MSWC's
// own figure WITH THE DATE IT WAS PUBLISHED, and an illustrative one still
// shows nothing at all.
const ILLUSTRATIVE_NOTICE =
  'These are illustrative records showing real operators and real structures in real places. '
  + 'Capacities, rates and names are examples — ring the godown before you load a vehicle. '
  + 'Free space is not shown for these because nobody knows it.';

const VERIFIED_NOTICE =
  'Capacity and free space are the Maharashtra State Warehousing Corporation\'s own '
  + 'published figures on the date shown — a snapshot, not a live booking system. '
  + 'The storage RATE is our estimate: MSWC charges per bag plus an ad-valorem component, '
  + 'which cannot be reduced to one rate per tonne. Ring the godown for the real tariff.';

// The third thing that has to be said out loud, and the one that was missing.
//
// MSWC publishes ADDRESSES, not coordinates. 135 of the 202 imported records
// sit on their district's centroid and 67 on their taluka's main town, so a
// distance computed from one of them measures the distance to a district
// centre, not to a godown. This response used to hand those out as one-decimal
// figures — six Nashik godowns spread over ~70 km all reading 22.9 km, and all
// costing an identical ₹1,024 to store the same lot. See
// services/storageService.js for the fix and why inventing coordinates was not
// an option.
const APPROXIMATION_NOTICE =
  'Some of these places are shown at an approximate position: MSWC publishes an address, not a map '
  + 'point, so a record is placed on its taluka\'s town or — where no town could be matched — on the '
  + 'district centre. Those distances are rounded and are NOT measured to the godown, and several '
  + 'godowns sharing one approximate point are grouped together because there is no honest way to '
  + 'rank them against each other. Ring them for directions.';

/**
 * Price one storage option for a specific lot and hold length.
 *
 * Returns `suitable: false` with a reason rather than a number when the crop
 * must not go in that structure — onion in cold storage being the case that
 * actually costs Maharashtra farmers money.
 */
function priceOption(w, { commodity, quantityKg, days, pricePerKg }) {
  const tonnes = quantityKg / 1000;
  const type = w.type;
  const fit = St.suitability(commodity, type);

  // Provenance travels on EVERY option, suitable or not — it describes the
  // record, not the pricing. Returning it only on the priced branch left the
  // refused cold-storage row without it.
  const provenance = {
    rateEstimated: w.rateSource !== 'published',
    vacancyAsOf: w.capacityAsOf || null,
  };

  if (!fit.suitable) {
    return {
      ...w,
      ...provenance,
      suitable: false,
      reason: fit.reason,
      storageCost: null, expectedLossPct: null, netAfterHold: null,
    };
  }

  const survive = St.survivalFraction(commodity, type, days);
  const lotValueNow = quantityKg * pricePerKg;
  const cost = St.storageCost(w.ratePerTonnePerMonth, tonnes, days);
  const pledge = St.pledgeEligibility(lotValueNow, w);

  return {
    ...w,
    suitable: true,
    reason: null,
    weeklyLossPct: St.weeklyLossPct(commodity, type),
    expectedLossPct: Math.round((1 - survive) * 1000) / 10,
    survivingKg: Math.round(quantityKg * survive),
    storageCost: cost,
    // At TODAY's price — deliberately not at a forecast price. This figure
    // answers "what does holding cost me", not "what will I make", and mixing
    // a forecast into it would hide the cost behind an optimistic gain.
    valueLostToSpoilage: Math.round(lotValueNow * (1 - survive)),
    pledge,
    // So a screen can date the vacancy and flag the estimated rate rather than
    // presenting either as live fact.
    ...provenance,
  };
}

/**
 * GET /api/warehouses/near
 *   ?lat=&lng=  or  ?district=
 *   &commodity=&quantityKg=&days=&pricePerKg=
 *
 * Storage options nearest first, each priced for this lot and this hold.
 * The farmer's OWN FARM is always included as the first option, because it is
 * what most farmers will actually do and a comparison that omits it is
 * dishonest by omission — it makes every godown look like a pure cost.
 */
router.get('/near', requireAuth, async (req, res) => {
  try {
    const { commodity, district } = req.query;
    const point = toLatLng({ lat: Number(req.query.lat), lng: Number(req.query.lng) });

    const quantityKg = Number(req.query.quantityKg) || 0;
    const days = Math.max(1, Math.min(Number(req.query.days) || 14, 240));
    const pricePerKg = Number(req.query.pricePerKg) || 0;

    if (!commodity)
      return res.status(400).json({ success: false, error: 'Which crop are you storing?' });
    if (!quantityKg)
      return res.status(400).json({ success: false, error: 'How much are you storing?' });

    const resolved = resolveDistrict(district) || null;
    const filter = { active: true };
    if (resolved) filter.district = resolved;

    let found = await Warehouse.find(filter).lean();

    // Widen rather than return nothing: a farmer in a district with no seeded
    // godown is better served by "the nearest is 60 km away" than by silence.
    if (!found.length && resolved) found = await Warehouse.find({ active: true }).lean();

    // Rank, then COLLAPSE the ties. `rows` is a mixed, ordered list: a row is
    // either one individually-rankable warehouse or a group of warehouses
    // sharing one approximated point. The slice counts a group as ONE row,
    // which is the point — six godowns on the district centroid must not push
    // six genuinely different options off the screen.
    const rows = St.groupApproximated(St.rankByDistance(found, point)).slice(0, 8);
    const price = (w) => priceOption(w, { commodity, quantityKg, days, pricePerKg });

    const options = rows.filter((r) => r.kind === 'warehouse').map((r) => price(r.warehouse));
    const approximateGroups = rows
      .filter((r) => r.kind === 'group')
      .map((r) => ({
        key: r.group.key,
        label: r.group.label,
        district: r.group.district,
        taluka: r.group.taluka,
        // Structured, so a screen can grey out the distance rather than
        // rendering a number it should not trust.
        locationPrecision: r.group.precision,
        locationApproximate: true,
        approxDistanceKm: r.group.approxDistanceKm,
        distanceKm: null,
        sharedCoordinate: r.group.coordinate,
        count: r.group.count,
        note: r.group.note,
        options: r.group.members.map(price),
      }));

    const everyOption = [...options, ...approximateGroups.flatMap((g) => g.options)];

    // The baseline. No rate, highest loss, no pledge — priced identically so
    // the comparison is like for like.
    const onFarm = priceOption(
      { ...St.ON_FARM, name: 'Keep it at your own farm', district: resolved || '', distanceKm: 0,
        capacityTonnes: null, availableTonnes: null, commodities: [], pledgeLoan: { available: false },
        contact: {}, dataSource: 'seed_illustrative' },
      { commodity, quantityKg, days, pricePerKg }
    );

    res.json({
      success: true,
      query: { commodity, district: resolved, quantityKg, days, pricePerKg },
      onFarm,
      options,
      // Never folded into `options`. A group is one dot with several names on
      // it, and flattening it back out is exactly the six-identical-rows
      // presentation this exists to stop.
      approximateGroups,
      // The TRUE total, so "3 options" never hides 7 more inside a group.
      count: everyOption.length,
      ungroupedCount: options.length,
      groupedCount: everyOption.length - options.length,
      // Never omitted, never conditional.
      // Both notices when both kinds of record are in the list, so neither
      // claim gets applied to the wrong row.
      notice: everyOption.some((w) => w.dataSource === 'seed_illustrative') || onFarm
        ? ILLUSTRATIVE_NOTICE : null,
      verifiedNotice: everyOption.some((w) => w.dataSource === 'verified')
        ? VERIFIED_NOTICE : null,
      approximationNotice: everyOption.some((w) => w.locationApproximate)
        ? APPROXIMATION_NOTICE : null,
      // So a screen can show the working rather than a bare number.
      spoilageBasis:
        'Loss rates are assumptions anchored to published outcomes: NAFED cut its own onion '
        + 'storage losses from 25% to 15% over a season, and Pune farmers reported ~50% loss in '
        + 'on-farm storage after the September 2025 rains. Treat them as a guide, not a measurement.',
    });
  } catch (err) {
    console.error('GET /warehouses/near', err);
    res.status(500).json({ success: false, error: 'Could not load storage options' });
  }
});

/**
 * GET /api/warehouses/:id — one record, for a detail view.
 * Declared AFTER /near so the literal path cannot be swallowed by the
 * wildcard. This codebase has shipped that bug twice.
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ success: false, error: 'No such warehouse' });
    const w = await Warehouse.findById(req.params.id).lean();
    if (!w || !w.active) return res.status(404).json({ success: false, error: 'No such warehouse' });
    const precision = St.coordinatePrecision(w);
    res.json({
      success: true,
      warehouse: {
        ...w,
        operatorLabel: St.OPERATOR_LABELS[w.operator] || w.operator,
        typeLabel: St.TYPE_LABELS[w.type] || w.type,
        // A detail screen is where somebody decides to drive somewhere, so it
        // is the last place to imply a coordinate is a location when it is a
        // district centre.
        locationPrecision: precision,
        locationApproximate: precision !== 'exact',
        locationNote: St.PRECISION_NOTE[precision],
      },
      notice: w.dataSource === 'seed_illustrative' ? ILLUSTRATIVE_NOTICE : null,
      approximationNotice: precision !== 'exact' ? APPROXIMATION_NOTICE : null,
    });
  } catch (err) {
    console.error('GET /warehouses/:id', err);
    res.status(500).json({ success: false, error: 'Could not load that warehouse' });
  }
});

module.exports = router;

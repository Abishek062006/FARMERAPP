// Transport pricing for the FARM Market. Fares are computed here and ONLY
// here — never on the client, and never recomputed after an order is placed
// (the quote is frozen onto the Order, so what the vendor agreed to is what
// they are charged).
//
// THE RETURN LEG IS PAID FOR. An agent who carries a lot 100 km then drives
// 100 km home empty has driven 200 km and been paid for one. Charging only the
// loaded leg made revenue per kilometre ACTUALLY driven fall as the trip got
// longer — the fixed `base` amortised away while the empty leg grew linearly —
// so the longest trips were the most loss-making, which is backwards. Measured
// before the fix: a 200 km tempo run returned ₹14.8/km against a ₹18–22/km
// running cost, and a 300 km truck ₹22.3/km against ₹30–35/km.
//
// The charge TAPERS FROM A THRESHOLD rather than switching on at one. A flat
// multiplier above 40 km would mean a 41 km trip costing far more than a 39 km
// trip for one extra kilometre, which is indefensible to the vendor paying it.
// Only the distance ABOVE the threshold carries the return charge.
//
// Below the threshold nothing is added, deliberately: inside ~40 km an agent
// can realistically pick up another job near the drop-off, so the leg home is
// not truly dead. Beyond it, they are driving back empty and everyone knows it.
//
// ⚠️ THE RETURN DISTANCE IS NOT THE LOADED DISTANCE. It is the drive from the
// DROP-OFF back toward the pickup area, and it does not grow when a vehicle
// makes more stops on the way out. Charging it against the loaded route length
// broke multi-farm pooling: a shared run visiting three farms has a long
// winding loaded route but still only ONE drive home, while three separate
// trips have three. Billing the pooled run as though its detours were also
// driven back empty made sharing cost MORE than three separate trips — the
// exact opposite of the truth, and it inverted the one feature aggregation
// exists for. Callers with a route that differs from the return path (see
// routes/consignments.js) pass `returnDistanceKm` explicitly; for an ordinary
// farm-to-market trip the two are the same and the default applies.
const RETURN_LEG_THRESHOLD_KM = 40;
const RETURN_LEG_FACTOR = 0.6;

const VEHICLES = {
  auto: {
    key: 'auto',
    label: 'Auto',
    localName: 'ऑटो',
    blurb: 'Small loads, short hops',
    base: 40, perKm: 18, minFare: 60,
    capacityKg: 300,
    maxKm: 20,          // the rule the product asked for
    avgKmph: 32,
  },
  tempo: {
    key: 'tempo',
    label: 'Tempo Van',
    localName: 'टेम्पो व्हॅन',
    blurb: 'Mid-size loads, any distance',
    base: 300, perKm: 28, minFare: 400,
    capacityKg: 1500,
    maxKm: null,
    avgKmph: 45,
  },
  truck: {
    key: 'truck',
    label: 'Truck',
    localName: 'ट्रक',
    blurb: 'Bulk loads, long haul',
    base: 800, perKm: 42, minFare: 1200,
    capacityKg: 10000,
    maxKm: null,
    avgKmph: 42,
  },
};

const VEHICLE_ORDER = ['auto', 'tempo', 'truck'];

/**
 * Price one vehicle for a trip.
 *
 * Both constraints apply to the LOADED leg (farm → destination), not to the
 * agent's approach leg. Weight is the constraint that actually matters — the
 * 20 km auto rule is really a proxy for "an auto is a small vehicle", so
 * capacity is enforced alongside it rather than instead of it.
 */
function quote(vehicleType, distanceKm, quantityKg, opts = {}) {
  const v = VEHICLES[vehicleType];
  if (!v) return { ok: false, reason: 'Unknown vehicle type' };

  // One drive home, however many stops were made on the way out.
  const returnDistanceKm = opts.returnDistanceKm != null
    ? opts.returnDistanceKm
    : distanceKm;

  const base = {
    type: v.key, label: v.label, localName: v.localName, blurb: v.blurb,
    capacityKg: v.capacityKg, maxKm: v.maxKm,
    etaMin: Math.max(1, Math.round((distanceKm / v.avgKmph) * 60)),
  };

  if (quantityKg > v.capacityKg) {
    return { ...base, ok: false, fare: null,
      reason: `${v.label} carries up to ${v.capacityKg} kg` };
  }
  if (v.maxKm != null && distanceKm > v.maxKm) {
    return { ...base, ok: false, fare: null,
      reason: `${v.label} only runs up to ${v.maxKm} km` };
  }

  const distanceCharge = Math.round(distanceKm * v.perKm);
  // Only the kilometres beyond the threshold carry the empty leg home.
  const returnKm = Math.max(0, returnDistanceKm - RETURN_LEG_THRESHOLD_KM);
  const returnCharge = Math.round(returnKm * v.perKm * RETURN_LEG_FACTOR);
  const total = Math.max(v.minFare, v.base + distanceCharge + returnCharge);

  return {
    ...base,
    ok: true,
    reason: null,
    fare: {
      base: v.base,
      perKm: v.perKm,
      distanceCharge,
      // Broken out as its own line, never folded into distanceCharge: a vendor
      // is entitled to see why a long trip costs what it costs, and an agent is
      // entitled to see that the drive home is what they are being paid for.
      returnCharge,
      returnKm: Math.round(returnKm),
      returnThresholdKm: RETURN_LEG_THRESHOLD_KM,
      total,
      platformFee: 0,           // reserved: a commission would come out here
      agentPayout: total,
    },
  };
}

/** All three vehicles, in display order. Unavailable ones keep their reason
 *  so the UI can grey them out and explain why rather than hiding them. */
function quoteAll(distanceKm, quantityKg, opts = {}) {
  return VEHICLE_ORDER.map((t) => quote(t, distanceKm, quantityKg, opts));
}

module.exports = {
  VEHICLES, VEHICLE_ORDER, quote, quoteAll,
  RETURN_LEG_THRESHOLD_KM, RETURN_LEG_FACTOR,
};

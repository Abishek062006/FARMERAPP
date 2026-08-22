// Transport pricing for the FARM Market. Fares are computed here and ONLY
// here — never on the client, and never recomputed after an order is placed
// (the quote is frozen onto the Order, so what the vendor agreed to is what
// they are charged).

const VEHICLES = {
  auto: {
    key: 'auto',
    label: 'Auto',
    tamil: 'ஆட்டோ',
    blurb: 'Small loads, short hops',
    base: 40, perKm: 18, minFare: 60,
    capacityKg: 300,
    maxKm: 20,          // the rule the product asked for
    avgKmph: 32,
  },
  tempo: {
    key: 'tempo',
    label: 'Tempo Van',
    tamil: 'டெம்போ வேன்',
    blurb: 'Mid-size loads, any distance',
    base: 300, perKm: 28, minFare: 400,
    capacityKg: 1500,
    maxKm: null,
    avgKmph: 45,
  },
  truck: {
    key: 'truck',
    label: 'Truck',
    tamil: 'லாரி',
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
function quote(vehicleType, distanceKm, quantityKg) {
  const v = VEHICLES[vehicleType];
  if (!v) return { ok: false, reason: 'Unknown vehicle type' };

  const base = {
    type: v.key, label: v.label, tamil: v.tamil, blurb: v.blurb,
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
  const total = Math.max(v.minFare, v.base + distanceCharge);

  return {
    ...base,
    ok: true,
    reason: null,
    fare: {
      base: v.base,
      perKm: v.perKm,
      distanceCharge,
      total,
      platformFee: 0,           // reserved: a commission would come out here
      agentPayout: total,
    },
  };
}

/** All three vehicles, in display order. Unavailable ones keep their reason
 *  so the UI can grey them out and explain why rather than hiding them. */
function quoteAll(distanceKm, quantityKg) {
  return VEHICLE_ORDER.map((t) => quote(t, distanceKm, quantityKg));
}

module.exports = { VEHICLES, VEHICLE_ORDER, quote, quoteAll };

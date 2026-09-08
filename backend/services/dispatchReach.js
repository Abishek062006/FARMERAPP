// services/dispatchReach.js
//
// WHICH JOBS A CAPTAIN IS ACTUALLY SHOWN.
//
// ═══ THE BUG THIS EXISTS TO FIX ═══════════════════════════════════════════
//
// Both captain feeds did this:
//
//     Order.find({ status: 'awaiting_agent', ... })
//       .sort({ createdAt: 1 }).limit(20).lean()
//     …then computed approachKm and sorted THOSE 20 by distance.
//
// That takes the twenty OLDEST open jobs in Maharashtra and sorts those by
// distance. With eight buyers and four captains it was fine, because twenty
// was everything. With 720 captains and 180 buyers across 36 districts it is
// not a ranking at all — a driver in Nagpur gets the twenty oldest jobs in the
// state, discovers they are all 600 km away, and the nearest job to them, which
// might be 4 km away, was never in the query. The distance sort ran on the
// wrong twenty and made the feed look considered.
//
// ⚠️ SORTING AFTER A LIMIT IS NOT FILTERING. The filter has to happen first.
//
// ═══ WHY IN MEMORY AND NOT A 2dsphere QUERY ═══════════════════════════════
//
// `Order` has no geo index and does not get one here. The candidate set is
// already bounded by the dispatch window: a job is only `awaiting_agent` for
// four hours (services/dispatchWindow.js) and `sweepExpired()` retires it, so
// what is open at any instant is "orders placed in the last four hours that
// nobody has taken" — small, and self-limiting. Adding a geo field to Order
// means a migration over 220 live documents to make a bounded scan slightly
// faster. `SCAN_CAP` is the guard if that assumption ever stops holding, and it
// is reported rather than silent.
const { toLatLng, haversineKm, matchDistrict } = require('./geoService');
const { VEHICLE_ORDER } = require('./fareService');

// ── HOW FAR A CAPTAIN WILL ACTUALLY DRIVE TO A PICKUP, BY VEHICLE ─────────
//
// One number for all three would be wrong in both directions. The approach
// drive is unpaid — the fare starts at the farm — so it is pure cost to the
// driver, and what they will absorb scales with what the job pays. An auto
// doing a 300 kg local run will not drive 60 km to reach it; a truck doing
// twelve tonnes will, because the fare is an order of magnitude larger.
const RADIUS_KM_BY_VEHICLE = { auto: 25, tempo: 40, truck: 60 };
const DEFAULT_RADIUS_KM = 40;

// A hard ceiling on the scan, so a pathological backlog cannot turn one feed
// request into a full collection scan. If it ever bites, the response SAYS it
// bit rather than quietly returning a truncated feed as if it were complete.
const SCAN_CAP = 300;

function radiusForVehicle(vehicleType) {
  return RADIUS_KM_BY_VEHICLE[vehicleType] ?? DEFAULT_RADIUS_KM;
}

// ── PHASE 6, B5b: A BIGGER VEHICLE CAN ALWAYS DO A SMALLER VEHICLE'S JOB ───
//
// Both captain feeds matched a job's `vehicleType` by EXACT EQUALITY against
// the captain's own — a truck captain querying jobs never saw one priced for
// 'auto', even though a truck can plainly carry an auto-sized load. That is
// inconsistent with the RADIUS rule two lines up, which already widens with
// vehicle size on exactly the premise that capacity scales (auto 25 / tempo
// 40 / truck 60 km) — requiring an exact match on the other axis was refusing
// jobs a captain's vehicle could physically do. REPORTED DIRECTLY: captains
// in Nashik were not seeing jobs that a captain of their vehicle class should
// have been offered.
//
// `VEHICLE_ORDER` (services/fareService.js) is the one place vehicle
// capacity is ranked — imported, not re-derived, so this cannot drift from
// the capacityKg figures that ordering already encodes.
//
// ⚠️ THE FARE IS NOT WIDENED WITH IT. `quote()` prices a job at ITS OWN
// vehicleType and that price is frozen onto the Order/Consignment when it was
// created — a truck taking an auto job still earns the auto rate. Whether
// that trip is worth making is the captain's own call to accept or decline,
// not something the feed should decide by hiding the job entirely.
function vehicleTypesServableBy(vehicleType) {
  const i = VEHICLE_ORDER.indexOf(vehicleType);
  return i === -1 ? [vehicleType] : VEHICLE_ORDER.slice(0, i + 1);
}

/**
 * Where the captain is, and how confident we are about it.
 *
 * Three sources, best first. They are NOT equivalent and the caller is told
 * which one answered: a live GPS fix and a district recorded at signup are
 * very different claims, and a feed built on the second must not present
 * itself as a distance-ranked list.
 */
function locateCaptain({ query = {}, profile = {} }) {
  const live = toLatLng({ lat: Number(query.lat), lng: Number(query.lng) });
  if (live) return { at: live, source: 'live', district: profile.location?.district || null };

  const stored = toLatLng(profile.location);
  if (stored) return { at: stored, source: 'profile', district: profile.location?.district || null };

  const district = profile.location?.district || null;
  return { at: null, source: district ? 'district' : 'unknown', district };
}

/**
 * Filter a candidate list to what this captain can realistically reach.
 *
 * @param items      candidate jobs (already filtered by vehicle/status/etc)
 * @param pickupOf   (item) => a point with {lat,lng} and optionally {district}
 * @param me         the result of locateCaptain()
 * @param vehicleType
 * @param limit      how many to return
 *
 * Returns { items, reach } where `reach` explains the result — including the
 * case that matters most: THERE ARE JOBS, THEY ARE JUST NOT NEAR YOU.
 */
function reachable({ items, pickupOf, me, vehicleType, limit = 20 }) {
  const radiusKm = radiusForVehicle(vehicleType);
  const scanned = items.length;

  // ── Distance is knowable ────────────────────────────────────────────────
  if (me.at) {
    let nearestBeyond = null;
    const withKm = [];
    for (const it of items) {
      const p = pickupOf(it);
      const at = p && toLatLng(p);
      // ⚠️ A job whose pickup has no coordinates is KEPT, not dropped. It is
      // not "far away", it is unmeasured — and dropping it would hide a real
      // job from every captain in the state with no way for anyone to notice.
      // It sorts last (null-distance) exactly as it did before.
      if (!at) { withKm.push([it, null]); continue; }
      const km = haversineKm(me.at, at);
      if (km <= radiusKm) withKm.push([it, Math.round(km * 10) / 10]);
      else if (nearestBeyond == null || km < nearestBeyond) nearestBeyond = km;
    }

    withKm.sort((a, b) =>
      ((a[1] == null) - (b[1] == null)) || ((a[1] ?? 0) - (b[1] ?? 0)));

    const kept = withKm.slice(0, limit);
    for (const [it, km] of kept) it.approachKm = km;

    return {
      items: kept.map(([it]) => it),
      reach: {
        mode: 'radius',
        radiusKm,
        positionSource: me.source,
        scanned,
        scanCapped: scanned >= SCAN_CAP,
        withinRadius: withKm.length,
        // THE HONEST EMPTY STATE. "No jobs" and "no jobs within 40 km, the
        // closest is 96 km away" are different facts, and only the second one
        // tells a driver whether it is worth moving. A bare empty list reads
        // as "the app is dead today".
        beyondRadius: nearestBeyond != null
          ? { count: scanned - withKm.length, nearestKm: Math.round(nearestBeyond) }
          : null,
        note: `Jobs within ${radiusKm} km of you — the approach drive is unpaid, so a `
          + `${vehicleType || 'vehicle'} is not offered a pickup it would lose money reaching.`,
      },
    };
  }

  // ── No coordinates: fall back to the captain's DISTRICT ─────────────────
  //
  // Coarse, and it says so. A district is up to 150 km across, so this is not
  // a ranking — it is "these are at least in your part of the state". Better
  // than the statewide feed it replaces, and honest about being worse than a
  // radius.
  if (me.district) {
    // ⚠️ COMPARED THROUGH `matchDistrict()`, NEVER AS RAW LOWERCASED STRINGS.
    // Three districts were RENAMED (Aurangabad → Chhatrapati Sambhajinagar,
    // Osmanabad → Dharashiv, Ahmednagar → Ahilyanagar) and both names are live
    // in this database — a captain whose profile still says "Aurangabad" would
    // match none of their own district's pickups under a plain string compare,
    // and the feed would come back empty with nothing to explain why.
    const mine = matchDistrict(me.district);
    const hit = mine ? items.filter((it) => {
      const d = pickupOf(it)?.district;
      return d && matchDistrict(d) === mine;
    }) : [];
    for (const it of hit) it.approachKm = null;
    return {
      items: hit.slice(0, limit),
      reach: {
        mode: 'district',
        district: me.district,
        positionSource: me.source,
        scanned,
        scanCapped: scanned >= SCAN_CAP,
        withinRadius: hit.length,
        beyondRadius: null,
        note: `Location is off, so these are matched by district (${me.district}) rather than `
          + 'by distance. A district is a long way across — turn location on to see how far '
          + 'each pickup actually is.',
      },
    };
  }

  // ── Nothing to filter on ────────────────────────────────────────────────
  // Unfiltered, exactly as before, but NAMED as unfiltered. This is the one
  // case where the old statewide behaviour is still what happens, and a driver
  // is told that is what they are looking at.
  for (const it of items) it.approachKm = null;
  return {
    items: items.slice(0, limit),
    reach: {
      mode: 'unfiltered',
      positionSource: 'unknown',
      scanned,
      scanCapped: scanned >= SCAN_CAP,
      withinRadius: null,
      beyondRadius: null,
      note: 'We do not know where you are and your profile has no district, so this list is '
        + 'from across the state and is NOT sorted by distance. Turn location on.',
    },
  };
}

module.exports = {
  RADIUS_KM_BY_VEHICLE, DEFAULT_RADIUS_KM, SCAN_CAP,
  radiusForVehicle, locateCaptain, reachable, vehicleTypesServableBy,
};

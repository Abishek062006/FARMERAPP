const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Consignment = require('../models/Consignment');
const Order = require('../models/Order');
const CropListing = require('../models/CropListing');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { toLatLng, haversineKm, roundKm, resolveDistrict } = require('../services/geoService');
const { getMultiStopRoute, getRoute, ROAD_FACTOR } = require('../services/routeService');
const { quote, VEHICLES } = require('../services/fareService');
const { activeJobOf, busyResponse, LIVE_RUN_STATUSES } = require('../services/agentJobService');
const Fpo = require('../models/Fpo');
const User = require('../models/User');
// WHAT THE PERSON AT THE GATE ACTUALLY SAW — the weight's provenance and the
// grade observed against the one declared. One vocabulary, imported wherever a
// quantity or a grade is printed, so no surface can quietly drop the
// provenance and present an estimate as a measurement.
const {
  POSTABLE_WEIGHT_METHODS, WEIGHT_NOT_RECORDED, WEIGHT_DISCLAIMER,
  describeWeight, summariseWeights, compareGrades, describeGradeCheck,
  GRADE_RESPONSES,
  // WHO MAY GRADE, AND WHAT EVERYONE ELSE CAN SAY INSTEAD. An FPO's own people
  // grade; a captain from the public pool records visible CONDITION and is
  // never asked for a letter. See that file's GRADING_ROLES header.
  mayGradeAtGate, GRADING_REFUSED_NOTE,
  CONDITION_FLAG_KEYS, parseCondition, describeCondition,
} = require('../data/gateRecord');
const { isValidGrade } = require('../data/gradeSpecs');

// ⚠️ ONE SHARED CONSTANT, NOT TWO. This was declared separately in
// routes/orders.js and routes/consignments.js, both `5 * 60 * 1000` — so
// changing one and missing the other would leave single pickups and multi-farm
// runs on different windows, a silent divergence no test would catch because
// each file's own tests would still pass. It now lives in one place, with the
// reasoning for four hours and for the evening cutoff.
const { dispatchExpiryFrom } = require('../services/dispatchWindow');
const { locateCaptain, reachable, SCAN_CAP, vehicleTypesServableBy } = require('../services/dispatchReach');
const MAX_STOPS = 5;

/**
 * HOW THE VEHICLE WAS ARRANGED — see models/Consignment.js transportMode.
 *
 * `hired` is what this app did before this existed and it is untouched: the
 * run is dispatched to the captain pool and priced by services/fareService.
 * `own` and `contracted` are NOT dispatched at all — there is no captain, and
 * the cost is whatever the FPO says it is.
 *
 * ⚠️ WHY A NON-HIRED RUN IS NOT PRICED BY fareService
 *   That table prices an INDEPENDENT CAPTAIN's economics: a base that covers
 *   turning the key, a per-km rate calibrated against an ₹18–22/km running
 *   cost, and a return charge that tapers from 40 km because a captain drives
 *   home empty and has to be paid for it (see the header of fareService.js).
 *   An FPO's own tempo has none of that shape — the FPO already owns the
 *   vehicle, the driver is on its payroll, and the "return leg" is the tempo
 *   going back to the same village it started in. Running a made-up number
 *   through that table would produce a figure with a decimal point and nothing
 *   behind it, which is the same failure as quoting a rate MSWC never
 *   published. So the number is STATED by whoever pays it, and `costSource`
 *   labels it — exactly as Warehouse.rateSource: 'assumed' does elsewhere.
 */
const TRANSPORT_MODES = ['hired', 'own', 'contracted'];

const COST_SOURCE_BY_MODE = {
  hired:      'captain_fare_table',
  own:        'fpo_stated',
  contracted: 'negotiated_rate',
};

const COST_NOTE_BY_MODE = {
  hired:
    "Computed by this app's captain fare table, which prices an independent captain's own "
    + 'running cost and empty drive home. This is the figure the captain is paid.',
  own:
    'STATED BY THE FPO for its own vehicle. Not computed by this app: the captain fare table '
    + "prices an independent driver's economics and says nothing about what a group's own tempo "
    + 'costs it. Nothing here has been checked against an invoice.',
  contracted:
    'THE RATE THE FPO NEGOTIATED with its transporter, as recorded by the FPO. Not computed by '
    + 'this app and not checked against an invoice.',
};

// Why a stop produced less than was ordered, or nothing at all. A fixed list,
// not free text — same rule as Dispute.reason: "farmer absent" is countable
// and a repeated pattern of it at one farm is exactly the signal worth having.
const FAILURE_REASONS = ['farmer_absent', 'quantity_not_ready', 'produce_rejected', 'other'];

/**
 * Why a run was handed back, or given up on. A fixed list for the same reason
 * FAILURE_REASONS is one: "the tempo broke down" is countable and a pattern of
 * it against one captain is exactly the signal worth having, while "it all went
 * wrong" is neither.
 *
 * These describe the RUN, not a farm gate, which is why they are a separate
 * list — "farmer absent" says nothing about a vehicle that never started.
 */
const ABANDON_REASONS = ['vehicle_breakdown', 'driver_unreachable', 'accident', 'route_blocked', 'other'];

/**
 * The stop-level reason written when a run is abandoned before reaching a farm.
 *
 * DELIBERATELY NOT IN `FAILURE_REASONS`, which is the list a captain may POST.
 * Only the server sets this, and the farmer whose order it cancels is entitled
 * to see that nobody ever came — that it was not "farmer absent", not
 * "quantity not ready" and nothing to do with them or their crop.
 */
const ABANDONED_STOP_REASON = 'run_abandoned';

/**
 * A run ACCEPTED this long ago with not one farm gate recorded is dead.
 *
 * WHY SIX HOURS
 *   A consignment is a district-scale drive by construction: MAX_STOPS is 5 and
 *   every order on it must share one drop-off inside 2 km, so the whole route —
 *   farm to farm to mandi — is the kind of trip that runs in an afternoon. Six
 *   hours is generous against that: it covers a captain who accepted at dawn and
 *   hit traffic, a long approach to the first farm, and a phone that was flat
 *   for a while. What it does not plausibly cover is a working run, because a
 *   working run records SOMETHING at its first gate long before then.
 *
 *   It is deliberately not tighter. The sweep takes a run away from a captain
 *   who may be standing at a gate right now, so the cost of being early is
 *   real, while the cost of being late is a few more hours on a run that is
 *   already dead. And the sweep only ever RELEASES (nothing has been collected,
 *   by definition of the filter) — it never abandons, never cancels an order and
 *   never touches a farmer's crop, so the worst case is a captain re-accepting a
 *   run that briefly went back to the pool.
 */
const STALE_RUN_MS = 6 * 60 * 60 * 1000;

/**
 * FARE_SPLIT_POLICY — what happens to the split when a stop fails.
 *
 * THE DECISION: nothing moves. Each stop keeps the share it was quoted, which
 * was computed on PLANNED weight (`stop.fareShareBasisKg`), and a stop that
 * collected nothing or collected short keeps its share on its own order.
 *
 * This is a decision, not an oversight, and the three fields that make it
 * legible are `stop.fareShareBasisKg`, `stop.collectedKg` and
 * `Order.pickupOutcome` — a reader can see the basis the share was computed
 * from, see what actually arrived, and see that they differ.
 *
 * WHY NOT RE-SPLIT ACROSS WHO ACTUALLY DELIVERED
 *   Take the tested run: 400 / 500 / 600 kg sharing a ₹2,120 tempo, so
 *   ₹565 / ₹707 / ₹848. If the 600 kg farmer is absent, re-splitting by
 *   actual weight over the remaining 900 kg gives ₹942 / ₹1,178 — the two
 *   farmers who did everything right pay 67% MORE because of a third party's
 *   failure. That is the same perverse outcome the by-weight split exists to
 *   prevent (an even split "would make aggregation actively bad for the
 *   smallest farmer, who is the one it is supposed to help"), just arriving
 *   through a different door.
 *
 * WHY NOT ZERO THE FAILED STOP AND LET THE VENDOR ABSORB IT
 *   The vendor's transport bill is `fare.total` either way — the vehicle was
 *   hired, the driver drove the route, and `fare.total` is frozen as their
 *   payout. So "the vendor absorbs it" is not a different amount of money. It
 *   is only a different story about whose failure cost it, and dropping that
 *   attribution is the same silence this whole change is about. The detour to
 *   that farm gate was really driven and it is right that it is named.
 *
 * THE INVARIANT, WHICH IS THE POINT
 *   sum(stops.fareShare) === fare.total, unconditionally, because nothing is
 *   recomputed and so nothing can drift. Each Order's own fare.total is left
 *   alone for the same reason; only its CROP side is rewritten, so
 *   grandTotal = cropTotal + fare.total still reconciles on every order,
 *   including a cancelled one (0 + its share).
 */
const FARE_SPLIT_POLICY = 'planned_weight_frozen';
const FARE_SPLIT_NOTE =
  'Fare shares stay as quoted, computed on the weight each farm was booked for. A stop that '
  + 'collected nothing keeps its share rather than pushing it onto the farmers who did deliver — '
  + 'the vehicle drove to that gate, and the shares still sum exactly to the fare charged.';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LIVE TRACKING ON A RUN — AND THE HONESTY RULE IT IS BUILT AROUND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE HOLE THIS FILLS
 *   Tracking existed only on Order. A buyer purchasing a 2-tonne five-farm FPO
 *   lot — the largest thing this app sells — got LESS visibility than someone
 *   buying 50 kg from one farmer, because a run spans N orders and there was
 *   no correct `/api/orders/:id/location` for a captain to post to.
 *
 * ⚠️ THE CONSTRAINT, WHICH IS NOT NEGOTIABLE
 *   Location is FOREGROUND-ONLY (Expo Go, no background location) and there
 *   are no push notifications. A five-farm run takes hours and the phone is in
 *   a pocket for most of them, so gaps are NORMAL, not exceptional. The single
 *   thing this must never do is paper over one: no interpolation between two
 *   fixes, no dead reckoning from a heading, no carrying the last position
 *   forward as though it were current. A stale track is REPORTED stale.
 *
 *   That is the same rule `Warehouse.locationPrecision` follows for a
 *   warehouse whose coordinates are a district centroid, and the same rule the
 *   single-order map already follows with "last seen 3 min ago". Making a
 *   position up would be worse than showing none: a buyer would drive to a
 *   mandi gate on the strength of a marker that was invented.
 *
 * SO STALENESS IS RETURNED AS STRUCTURED DATA, not left to a screen to guess.
 * `stale` keeps EXACTLY the boundary GET /api/orders/:id/track uses, so one
 * renderer serves both; `staleness` grades it, because on a multi-hour run a
 * binary "older than 30 seconds" is true almost always and tells a buyer
 * nothing. The bands are:
 *
 *   never    no fix has ever landed on this run
 *   live     ≤ 30s — the driver's app is open right now
 *   recent   ≤ 5m  — they looked at their phone a moment ago
 *   stale    ≤ 30m — this is the last thing anybody knows
 *   cold     > 30m — do not draw this as a moving vehicle at all
 */
const TRACK_LIVE_SEC   = 30;
const TRACK_RECENT_SEC = 5 * 60;
const TRACK_STALE_SEC  = 30 * 60;

const STALENESS_NOTE = {
  never: 'No position has ever been received for this run. Foreground-only tracking means the '
    + "driver's app has to be open — this is not a fault, and no position is being guessed.",
  live: 'Position received within the last half minute.',
  recent: 'The last position is a few minutes old. Tracking only runs while the app is open, so '
    + 'short gaps are normal.',
  stale: 'This is the last position actually received, not where the vehicle is now. Nothing has '
    + 'been estimated forward from it.',
  cold: 'The last position is over half an hour old. Show it as a last-known point, not as a '
    + 'moving vehicle — no position between then and now has been invented.',
};

/** Grade a position's age. `null` age means no fix has ever arrived. */
function stalenessOf(ageSec) {
  if (ageSec == null) return 'never';
  if (ageSec <= TRACK_LIVE_SEC) return 'live';
  if (ageSec <= TRACK_RECENT_SEC) return 'recent';
  if (ageSec <= TRACK_STALE_SEC) return 'stale';
  return 'cold';
}

/**
 * WHO AN FPO MAY NAME AS ITS DRIVER.
 *
 * `farmer` and `agent` and nothing else, and it is not an accident that these
 * are exactly the two roles `requireRole` already admits on /stop-outcome and
 * /deliver. An FPO's own driver is in practice a member or a hired hand.
 *
 * A `vendor` account is refused deliberately: the buyer of the produce
 * recording the pickups on the produce they are buying is a conflict of
 * interest, not a convenience. The remedy for a buyer who wants to drive is to
 * not sell themselves the load.
 *
 * ⚠️ AN `fpo` ACCOUNT IS REFUSED TOO, AND THAT IS NOT AN OVERSIGHT. The `fpo`
 * role is the ORGANISATION's account — the office. resolvePositionActor()
 * below turns the office away by name, because a coordinate typed at a desk is
 * not a position that was observed, it is one that was invented, and refusing
 * that is the whole reason this feature is trustworthy. Admitting the office
 * account as a driver would re-open exactly that hole: nothing downstream
 * could then tell "the manager is in the cab" from "the manager is at the
 * desk", and `outcomeByRole` would stop meaning anything.
 *
 * A manager who genuinely does drive the tempo is a real situation and has a
 * real answer: give that PERSON an account and name it as the driver. The run
 * then records a person at a gate, which is what it claims to record.
 */
const FPO_DRIVER_ROLES = ['farmer', 'agent'];

/**
 * WHO IS DRIVING, in one shape whichever kind of driver it is.
 *
 * A run has a pool captain, an FPO driver with an account, an FPO driver who
 * is only a name on the trip sheet, or nobody — and a screen should not have
 * to know which before it can print a name and a phone number.
 *
 * `kind` is what keeps the four apart, and `linked` is the one that matters
 * most: an unlinked driver is a name the office typed, so every stop on that
 * run is going to be recorded by the office. Saying so is the difference
 * between a record and a claim.
 */
function driverBlock(c) {
  const t = c.transport || {};
  if (c.agentUid)
    return {
      kind: 'captain', linked: true,
      uid: c.agentUid, name: c.agentName || '', phone: c.agentPhone || '',
      vehicleNumber: c.agentVehicleNumber || '', assignedAt: c.acceptedAt || null,
    };
  if (t.driverUid)
    return {
      kind: 'fpo_driver', linked: true,
      uid: t.driverUid, name: t.driverName || '', phone: t.driverPhone || '',
      vehicleNumber: t.vehicleNumber || '', assignedAt: t.driverAssignedAt || null,
    };
  if (t.driverName)
    return {
      kind: 'fpo_driver', linked: false,
      uid: null, name: t.driverName, phone: t.driverPhone || '',
      vehicleNumber: t.vehicleNumber || '', assignedAt: null,
      note: 'Named on the trip sheet but with no account on this run, so every stop is recorded by '
        + "the group's office rather than at the farm gate, and no position can be reported.",
    };
  return { kind: null, linked: false, uid: null, name: '', phone: '', vehicleNumber: '', assignedAt: null };
}

/**
 * "Every farm on this run has been visited", as a QUERY FRAGMENT.
 *
 * Same discipline as UNTOUCHED_STOPS_FILTER and for the same reason: the
 * transit flip is a guarded update, so its condition has to be evaluated by
 * MongoDB against the document it is writing, never in JavaScript between a
 * read and a write.
 *
 * A stop counts as visited when it has an outcome OR carries the legacy
 * `collected: true` with no outcome field at all — the same `?? 'pending'`
 * allowance /deliver makes for stops written before per-stop outcomes existed.
 */
const NO_PENDING_STOPS_FILTER = {
  stops: {
    $not: {
      $elemMatch: {
        $and: [{ outcome: { $in: ['pending', null] } }, { collected: { $ne: true } }],
      },
    },
  },
};

const otp = () => String(Math.floor(1000 + Math.random() * 9000));

async function sweepExpired() {
  await Consignment.updateMany(
    { status: 'awaiting_agent', dispatchExpiresAt: { $lt: new Date() } },
    { $set: { status: 'no_agents' } }
  );
  await sweepStaleRuns();
}

/**
 * Give the pool back a run whose captain has evidently gone.
 *
 * There is no cron in this app (see the note on sweepExpired's caller), so this
 * rides the same lazy sweep the dispatch-window expiry does.
 *
 * IT ONLY EVER RELEASES, NEVER ABANDONS. The filter requires that no stop has
 * an outcome, so by construction nothing has been collected and no farmer can
 * be harmed by handing the run back — see the release/abandon split below.
 * A stale run WITH produce aboard is left exactly where it is, because taking
 * that decision away from a human would mean cancelling farmers' orders on a
 * timer.
 */
async function sweepStaleRuns() {
  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  const stale = await Consignment.find({
    status: 'accepted',
    agentUid: { $ne: null },
    // `$in` with null, never `$ne` — a consignment written before
    // transportMode existed has no such field, and `$ne` matches missing.
    transportMode: { $in: ['hired', null] },
    acceptedAt: { $lt: cutoff },
    ...UNTOUCHED_STOPS_FILTER,
  }).select('_id orderIds agentUid stops.outcome stops.collected status transportMode').limit(20).lean();

  for (const c of stale) {
    const done = await releaseRun(c, {
      by: c.agentUid, byRole: 'system', reason: 'driver_unreachable',
      note: `No farm gate recorded in ${Math.round(STALE_RUN_MS / 3600000)} hours — released automatically.`,
    });
    if (done) console.log(`🕰️  Consignment ${c._id} released back to the pool — stale for ${Math.round(STALE_RUN_MS / 3600000)}h`);
  }
}

/**
 * "Not one stop on this run has been touched", as a QUERY FRAGMENT rather than
 * a JavaScript check.
 *
 * It has to be a filter: release is guarded on it, and a guard evaluated in
 * JavaScript between a read and a write is exactly the read-then-check this
 * codebase refuses everywhere else. Two taps — or a captain recording a pickup
 * while the buyer releases the run — would both pass it.
 *
 * Two clauses rather than one `$or` inside `$elemMatch`, because `collected`
 * and `outcome` are independently authoritative: a stop written before per-stop
 * outcomes existed has `collected: true` and NO `outcome` field at all.
 * `$nin: ['pending', null]` is the form that treats a missing field as
 * untouched — `$ne` matching missing fields is a bug this codebase has shipped.
 */
const UNTOUCHED_STOPS_FILTER = {
  $and: [
    { stops: { $not: { $elemMatch: { outcome: { $nin: ['pending', null] } } } } },
    { stops: { $not: { $elemMatch: { collected: true } } } },
  ],
};

/** Has ANY farm gate on this run been recorded? */
const anyStopRecorded = (c) =>
  c.stops.some((s) => (s.outcome ?? 'pending') !== 'pending' || s.collected);

/** Stops that handed produce over — their crop is on the vehicle. */
const collectedStops = (c) =>
  c.stops.filter((s) => s.collected || ['collected_full', 'collected_short'].includes(s.outcome));

/** Stops nobody has been to yet. */
const untouchedStops = (c) =>
  c.stops.filter((s) => !s.collected && (s.outcome ?? 'pending') === 'pending');

/** Length of one specific visiting order: farm to farm to market. */
function routeKm(ordered, dropoff) {
  if (!ordered.length) return 0;
  let km = 0;
  for (let i = 0; i < ordered.length - 1; i++) km += haversineKm(ordered[i], ordered[i + 1]);
  km += haversineKm(ordered[ordered.length - 1], dropoff);   // last farm to the market
  return km;
}

/**
 * Order the stops to minimise the run.
 *
 * BRUTE FORCE, and deliberately so. With MAX_STOPS = 5 there are at most 120
 * permutations, each scored by summing haversine legs — microseconds, and the
 * answer is exactly optimal.
 *
 * The first version of this used nearest-neighbour walking outward from the
 * dropoff. It was wrong in a way that cost real money: on the Nashik belt it
 * produced a 168 km route where the obvious order was 120 km, which turned a
 * genuine saving into "sharing is more expensive than separate trips". A
 * greedy heuristic is not worth having when the exact answer is this cheap.
 *
 * Order is fixed at creation and never re-optimised mid-trip: an agent halfway
 * through a run must not have their next stop change under them.
 *
 * Ties keep the FIRST permutation reached, so the answer is a pure function of
 * the input order — routes/fpos.js leans on that for a deterministic bundle.
 */
function orderStops(stops, dropoff) {
  if (stops.length <= 1) return [...stops];

  let best = null, bestKm = Infinity;

  const permute = (rest, acc) => {
    if (!rest.length) {
      const km = routeKm(acc, dropoff);
      if (km < bestKm) { bestKm = km; best = [...acc]; }
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      const next = rest[i];
      permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, next]);
    }
  };
  permute(stops, []);
  return best;
}

/**
 * The length of the EXACT best route through these stops. Same brute force,
 * returning the number rather than the order.
 *
 * Exported because routes/fpos.js has to compare candidate five-farm bundles
 * against one another before it can decide which five ride on one vehicle, and
 * a second copy of this arithmetic there would be a second place for the
 * greedy-heuristic bug to come back.
 */
function optimalRouteKm(stops, dropoff) {
  return routeKm(orderStops(stops, dropoff), dropoff);
}

/**
 * Split one vehicle fare across the stops.
 *
 * BY WEIGHT, not evenly. A farmer sending 50 kg alongside two farmers sending
 * 700 kg each should not pay a third of the tempo — the vehicle was hired for
 * the load, and an even split would make aggregation actively bad for the
 * smallest farmer, who is the one it is supposed to help.
 *
 * Rounding is absorbed by the LARGEST stop, so the shares always sum exactly
 * to the fare charged. Silently losing a rupee here means a receipt that does
 * not reconcile, which is the kind of thing that destroys trust in the whole
 * settlement story.
 */
function splitFare(total, stops) {
  const weight = stops.reduce((a, s) => a + s.quantityKg, 0) || 1;
  const shares = stops.map((s) => Math.round((s.quantityKg / weight) * total));
  const drift = total - shares.reduce((a, b) => a + b, 0);
  if (drift !== 0) {
    let big = 0;
    stops.forEach((s, i) => { if (s.quantityKg > stops[big].quantityKg) big = i; });
    shares[big] += drift;
  }
  return shares;
}

/**
 * WHO IS ALLOWED TO DRIVE THIS RUN FORWARD — record a stop outcome, or hand it
 * over at the drop.
 *
 * THE GAP THIS CLOSES
 *   Per-stop outcomes were agent-authenticated: `Consignment.findOne({ _id,
 *   agentUid: uid })`. That is exactly right when a captain from the pool is
 *   driving. On an own/contracted run there IS no agent, so that filter can
 *   never match anybody — no outcome could be recorded, no delivery could be
 *   made, and the run was unfinishable the moment it was created. A run this
 *   app cannot finish is worse than one it never offered.
 *
 * THE RULE, and it is deliberately narrow:
 *   • a run WITH an agent keeps the agent-only rule, unchanged. Not the vendor,
 *     not the FPO admin, not a farmer on the run. Somebody stood at that gate
 *     and it is their account of it.
 *   • a run with NO agent may be recorded by the admin of the FPO that
 *     arranged it, and by nobody else. They are keying in what their own driver
 *     reported, which is precisely what a paper trip sheet is and how this
 *     works on the ground today.
 *
 * `outcomeBy` / `pickupOutcome.recordedBy` record the uid either way, and
 * `outcomeByRole` / `recordedByRole` record which of the two rules applied — a
 * farmer disputing "nobody was home" is entitled to know whether the claim came
 * from a captain at their gate or from their own group's office.
 *
 * Returns { role } or { error, status, code }.
 *
 * `callerRole` is req.profile.role, and it exists only to keep the two
 * pre-existing refusals saying what they already said: a captain who is not
 * the assigned one gets 404 (never confirm to a driver that a run they were
 * not offered exists), while anyone else gets a 403 that names the reason.
 * Both are refusals; which one you get is not new behaviour.
 */
async function resolveRunActor(c, uid, callerRole) {
  if (c.agentUid) {
    if (c.agentUid === uid) return { role: 'agent' };
    return callerRole === 'agent'
      ? { status: 404, error: 'Run not found, or not yours' }
      : {
          status: 403, code: 'AGENT_ONLY',
          error: 'A captain is driving this run. Only they can record what happened at a farm gate.',
        };
  }

  // No agent. Only an own/contracted run is legitimately agentless — a hired
  // run sitting in awaiting_agent has nobody at any gate yet and nothing to
  // report.
  if (c.transportMode === 'hired' || !c.fpoId)
    return {
      status: 409, code: 'NO_DRIVER',
      error: 'This run has no driver assigned yet, so there is nothing to report from a farm gate.',
    };

  // ── THE THIRD ACTOR: THE FPO's OWN ASSIGNED DRIVER ──────────────────────
  //
  // Checked BEFORE the admin, and that ordering is the decision. If this
  // account is named as the driver on this run then they are the driver, even
  // when they also happen to administer the group — "the person at the gate
  // keyed it in" is the stronger and truer of the two available claims, and
  // `outcomeByRole` exists to record exactly which one was made.
  //
  // Note what this does NOT do: it does not make them a captain anywhere. The
  // check is scoped to THIS document, so a driver assigned to one run gets
  // nothing at all on any other, and no dispatch pool, feed or job offer knows
  // they exist.
  if (c.transport?.driverUid && c.transport.driverUid === uid)
    return { role: 'fpo_driver' };

  const fpo = await Fpo.findById(c.fpoId).select('adminUid').lean();
  if (!fpo || fpo.adminUid !== uid)
    return {
      status: 403, code: 'NOT_FPO_ADMIN',
      error: 'This run is driven by the FPO itself — only the driver assigned to it, or that '
        + "group's admin, can record what happened at a farm gate.",
    };

  // THE OFFICE-SIDE FALLBACK, WHICH DOES NOT GO AWAY. A driver whose phone is
  // flat, or who was never given an account, still has to be able to get the
  // load to the mandi — so the admin keeps the paper trip sheet they always
  // had. Both paths remain, and the record always says which was used.
  return { role: 'fpo_admin' };
}

/**
 * WHO MAY POST A POSITION — NARROWER THAN WHO MAY RECORD A STOP, AND THAT IS
 * THE HONESTY RULE, NOT A PERMISSIONS DETAIL.
 *
 * A stop outcome can legitimately be relayed: the FPO's office keying in what
 * its driver reported down a phone line is a weaker claim than the driver
 * typing it at the gate, but it is still a claim about something that
 * happened, and `outcomeByRole` records which it was.
 *
 * A POSITION IS NOT RELAYABLE. "Where is the vehicle right now" has exactly
 * one honest source: the device travelling with it. An admin at a desk posting
 * a coordinate is not reporting a position, they are inventing one — which is
 * the single thing this whole feature is built to refuse. So the office is
 * turned away here, by name, with a sentence that says why.
 *
 * Built ON resolveRunActor() rather than beside it: one implementation decides
 * who is on a run, and this narrows its answer. A second copy of the
 * captain/driver/admin logic is a second place for it to drift.
 */
async function resolvePositionActor(c, uid, callerRole) {
  const actor = await resolveRunActor(c, uid, callerRole);
  if (actor.error) return actor;
  if (actor.role === 'fpo_admin')
    return {
      status: 403, code: 'NOT_IN_THE_VEHICLE',
      error: 'Only the person actually driving this run can post its position. Recording a stop from '
        + 'the office is a report of something that happened; posting a coordinate from the office '
        + 'would be inventing one. Assign a driver account to the run and the position comes from '
        + 'their phone.',
    };
  return actor;
}

/**
 * WHO MAY HAND A RUN BACK, OR GIVE UP ON IT.
 *
 * Deliberately WIDER than resolveRunActor(), and for a reason that is the whole
 * point of these two routes: recording what happened at a farm gate is an
 * eyewitness account and belongs to whoever stood there, but ending a run that
 * has stopped moving is an administrative act — and the person who most needs it
 * done is precisely the one who cannot do it. A captain who has broken down,
 * quit, or gone silent cannot call anything. If they were the only one allowed
 * to, the run would sit in `collecting` forever with two farmers' produce on a
 * truck nobody can reach.
 *
 * So: the assigned captain, the buyer who booked the run, and the admin of the
 * FPO the run belongs to. Nobody else — a farmer on the run cannot end it, and
 * the remedy for them is a dispute, exactly as it is for a failed stop.
 *
 * Returns { role } or { status, code, error }.
 */
async function resolveClosureActor(c, uid, callerRole) {
  if (c.agentUid && c.agentUid === uid) return { role: 'agent' };
  if (c.vendorUid === uid) return { role: 'vendor' };
  if (await isFpoAdminForRun(c, uid)) return { role: 'fpo_admin' };

  // The same two refusals resolveRunActor() makes, for the same reasons: a
  // captain is never told that a run they were not offered exists.
  return callerRole === 'agent'
    ? { status: 404, error: 'Run not found, or not yours' }
    : {
        status: 403, code: 'NOT_YOUR_RUN',
        error: 'Only the captain driving this run, the buyer who booked it, or the admin of the '
          + 'group it belongs to can hand it back or give up on it.',
      };
}

/**
 * Does this run belong to a group `uid` administers?
 *
 * An own/contracted run says so directly — `fpoId` is what makes it finishable
 * at all. A HIRED run carries `fpoId: null` even when an FPO lot order created
 * it (see routes/fpos.js /lots/confirm), so "belongs to their group" is
 * answered the only honest way left: EVERY farm on the run is an active member
 * of a group this caller admins.
 *
 * Every, not any. A buyer can pool orders from two different groups onto one
 * vehicle, and such a run belongs to neither admin — letting one of them cancel
 * the other group's members' orders would be handing a stranger authority over
 * a farmer's sale.
 */
async function isFpoAdminForRun(c, uid) {
  if (c.fpoId) {
    const fpo = await Fpo.findById(c.fpoId).select('adminUid').lean();
    return !!fpo && fpo.adminUid === uid;
  }
  if (!c.stops || !c.stops.length) return false;
  const fpo = await Fpo.findOne({ adminUid: uid, status: 'active' }).select('members').lean();
  if (!fpo) return false;
  // A member row written before `status` existed has no such field and is an
  // ACTIVE member — `(m.status || 'active')`, never `m.status === 'active'`.
  const active = new Set(
    fpo.members.filter((m) => (m.status || 'active') === 'active').map((m) => m.farmerUid));
  return c.stops.every((s) => active.has(s.farmerUid));
}

/**
 * Produce that never left the farm is still the farmer's, and still sellable.
 *
 * Extracted rather than copied: the failed-stop path and the abandon path both
 * need it, and a second copy is a second place for a failed pickup to quietly
 * destroy stock. Mirrors the vendor-cancel path in routes/orders.js.
 */
async function restockUncollected(order, returnedKg) {
  if (!(returnedKg > 0) || !order.listingId) return;
  await CropListing.updateOne({ _id: order.listingId }, { $inc: { quantityAvailableKg: returnedKg } });
  await CropListing.updateOne(
    { _id: order.listingId, status: 'sold_out', $expr: { $gte: ['$quantityAvailableKg', '$minOrderKg'] } },
    { $set: { status: 'available' } }
  );
}

/**
 * ONE FARM THAT GAVE NOTHING — the ORDER side.
 *
 * This is Phase A's `not_collected` handling, extracted unchanged so the
 * abandon path REUSES it rather than growing a second copy. The rules it
 * encodes are all decisions recorded elsewhere and none of them may drift:
 *   · the order is CANCELLED, because no crop moved (models/Order.js)
 *   · the crop side is zeroed and the TRANSPORT side is untouched, because the
 *     vehicle drove to that gate (FARE_SPLIT_POLICY above)
 *   · `pickupOutcome.orderedKg` keeps what was AGREED beside what arrived
 *   · `status: 'accepted'` in the FILTER is what makes it unrepeatable
 *
 * Returns the updated order, or null when something else got there first.
 */
async function cancelUncollectedOrder({ order, orderGuard, uid, role, orderedKg, reason, note, now }) {
  const fareShare = order.fare?.total || 0;
  return Order.findOneAndUpdate(
    { _id: order._id, ...orderGuard, status: 'accepted' },
    {
      $set: {
        status: 'cancelled', cancelledAt: now, cancelledBy: uid,
        quantityKg: 0, cropTotal: 0, farmerPayout: 0,
        // Crop side zeroed, transport side untouched — see FARE_SPLIT_POLICY.
        grandTotal: fareShare,
        'pickupOutcome.outcome': 'not_collected',
        'pickupOutcome.orderedKg': orderedKg,
        'pickupOutcome.collectedKg': 0,
        'pickupOutcome.reason': reason,
        'pickupOutcome.note': String(note || '').slice(0, 500),
        'pickupOutcome.recordedAt': now,
        'pickupOutcome.recordedBy': uid,
        'pickupOutcome.recordedByRole': role,
      },
      $unset: { isActiveJob: '' },
    },
    { new: true }
  );
}

/**
 * ADDRESSING A STOP.
 *
 * ⚠️ `orderId` WAS THE STOP'S ADDRESS, AND THAT STOPPED WORKING IN PHASE 3.
 * Every stop on a BUYER run has an Order, so `orderId` served as a unique key
 * — writeStopOutcome matched on it, and every recording screen posts
 * `{ orderId, otp }`. An FPO COLLECTION run has no Orders at all (no buyer, no
 * price, nothing sold yet), so those stops have nothing to be addressed by.
 *
 * The fix needed no new field: Mongoose has always minted an `_id` on each
 * stop subdocument and nothing was using it. `stopKeyFor()` resolves either
 * form to that `_id`, so:
 *   • every existing caller and screen keeps posting `orderId` and keeps working
 *   • a collection run posts `stopId`
 *   • there is ONE addressing path, not one per purpose
 *
 * Minting placeholder Orders for collection stops was the alternative and was
 * rejected: an Order asserts a trade at a price to a buyer, and none of those
 * exist yet. Inventing one to satisfy a key is the fabrication this app
 * refuses everywhere else.
 */
function findStop(consignment, { stopId, orderId }) {
  const stops = consignment.stops || [];
  if (stopId) return stops.find((s) => String(s._id) === String(stopId)) || null;
  // Guard the null case explicitly: on a collection run EVERY stop has
  // orderId null, so a request that omits both keys would otherwise match the
  // FIRST stop and silently record an outcome against the wrong farm.
  if (orderId) return stops.find((s) => s.orderId && String(s.orderId) === String(orderId)) || null;
  return null;
}

/**
 * The STOP side of an outcome, guarded on the outcome never having been
 * written. The second half of the concurrency discipline described above
 * recordStopOutcome().
 *
 * Takes the stop's own `_id`. The guard stays IN THE FILTER — the expected
 * state is `outcome: pending|null`, never an `if` in JavaScript — so two
 * recordings of the same gate cannot both win.
 */
function writeStopOutcome(consignmentId, stopId, patch) {
  return Consignment.findOneAndUpdate(
    {
      _id: consignmentId,
      stops: { $elemMatch: { _id: stopId, outcome: { $in: ['pending', null] } } },
    },
    { $set: patch },
    { new: true }
  );
}

/**
 * HAND A RUN BACK TO THE POOL — the clean exit, shared by POST /:id/release and
 * the stale-run sweep.
 *
 * Nothing has been collected, so nothing has to be undone: the run returns to
 * `awaiting_agent` with a FRESH dispatch window (without one it would be swept
 * straight to `no_agents` by its long-expired original), the captain is cleared
 * off it, `isActiveJob` is unset so they can take other work, and every order
 * goes back to waiting for a driver.
 *
 * The released captain is added to `rejectedBy` — the pool's existing rule is
 * "never re-offer a declined job", and a run you just handed back is declined.
 * That applies whoever pressed the button: if the buyer released it because the
 * captain went silent, re-offering it to that same silent captain is the one
 * outcome nobody wants.
 *
 * Returns the released run, or null if it was not releasable any more.
 */
async function releaseRun(c, { by, byRole, reason, note }) {
  const heldBy = c.agentUid || null;
  const now = new Date();

  const released = await Consignment.findOneAndUpdate(
    {
      _id: c._id,
      status: 'accepted',
      agentUid: heldBy,
      ...UNTOUCHED_STOPS_FILTER,
    },
    {
      $set: {
        status: 'awaiting_agent',
        agentUid: null, agentName: '', agentPhone: '', agentVehicleNumber: '',
        acceptedAt: null,
        dispatchExpiresAt: dispatchExpiryFrom(now).expiresAt,
      },
      $unset: { isActiveJob: '' },
      $push: {
        releases: {
          at: now, by, byRole, agentUid: heldBy,
          reason: ABANDON_REASONS.includes(reason) ? reason : 'other',
          note: String(note || '').slice(0, 500),
        },
      },
      ...(heldBy ? { $addToSet: { rejectedBy: heldBy } } : {}),
    },
    { new: true }
  );
  if (!released) return null;

  // Every farmer's screen goes back to "waiting for a driver". The orders get a
  // fresh dispatch window too, or routes/orders.js's own sweep would retire
  // them to `no_agents` and the next captain's accept — which promotes orders
  // still in `awaiting_agent` — would silently leave them behind.
  await Order.updateMany(
    { _id: { $in: released.orderIds }, consignmentId: released._id, status: 'accepted' },
    {
      $set: {
        status: 'awaiting_agent',
        agentUid: null, agentName: null, agentPhone: null, agentVehicleNumber: null,
        acceptedAt: null,
        dispatchExpiresAt: released.dispatchExpiresAt,
      },
      $unset: { isActiveJob: '' },
    }
  );

  return released;
}

/**
 * Validate a non-hired transport arrangement off the request body.
 *
 * Provenance is NEVER taken from the client: `costSource` and `costNote` are
 * derived from the mode here, so a caller cannot post a stated figure labelled
 * as one this app computed. Same rule that keeps `verification` out of the
 * profile-update allowlist.
 */
async function buildTransportArrangement(body, uid) {
  const mode = body.transportMode || 'hired';
  if (!TRANSPORT_MODES.includes(mode))
    return { error: `transportMode must be one of: ${TRANSPORT_MODES.join(', ')}`, code: 'BAD_TRANSPORT_MODE' };

  if (mode === 'hired') return { mode, fpo: null, transport: null };

  if (!mongoose.isValidObjectId(body.fpoId))
    return {
      code: 'FPO_REQUIRED',
      error: 'A run the FPO drives itself needs fpoId — without it nobody can record what happened at each farm.',
    };
  const fpo = await Fpo.findById(body.fpoId).lean();
  if (!fpo || fpo.status !== 'active')
    return { code: 'FPO_REQUIRED', error: 'No active FPO with that id' };

  // ⚠️ ONLY THE GROUP'S OWN ADMIN MAY COMMIT THE GROUP'S VEHICLE.
  //
  // `uid` was taken by this function and never checked — it was recorded as
  // `arrangedBy` and nothing more. So ANY authenticated caller who supplied an
  // fpoId could declare that FPO's tempo was doing the run, name a driver, and
  // STATE THE COST. On a lot sale that body comes from the BUYER, so a buyer
  // could send `transportMode: 'own'` with `cost: 0` and the run would be
  // written with `fpoId: fpo._id` — the group's vehicle, committed by an
  // outsider, at a price it never agreed to.
  //
  // This is "never trust client identity" applied where it costs money, which
  // the rest of this codebase is careful about. Nothing in the app relied on
  // the hole: no buyer screen sends `transportMode` at all, so every buyer
  // path already resolves to 'hired' and is unaffected.
  if (fpo.adminUid !== uid)
    return {
      status: 403,
      code: 'NOT_FPO_ADMIN',
      error: "Only this group's own admin can put the group's vehicle on a run.",
    };

  const t = body.transport || {};
  const driverName = String(t.driverName || '').trim();
  const vehicleNumber = String(t.vehicleNumber || '').trim();
  if (!driverName)
    return { code: 'DRIVER_REQUIRED', error: 'Name the driver — a trip sheet with no driver on it is not a record.' };
  if (!vehicleNumber)
    return { code: 'VEHICLE_REQUIRED', error: 'Record the vehicle number.' };

  // 0 is allowed and meaningful: an FPO that absorbs the cost into its fee
  // really does charge this run nothing, and 0 is the honest figure for that.
  // A MISSING cost is not the same thing and is refused rather than defaulted.
  const cost = Number(t.cost);
  if (!Number.isFinite(cost) || cost < 0)
    return {
      code: 'COST_REQUIRED',
      error: mode === 'own'
        ? 'State what this run costs the FPO. It is not computed here — the captain fare table prices an '
          + "independent driver's economics, not your own tempo."
        : 'State the rate negotiated with the transporter. It is not computed here.',
    };

  return {
    mode,
    fpo,
    transport: {
      driverName: driverName.slice(0, 120),
      driverPhone: String(t.driverPhone || '').trim().slice(0, 20),
      vehicleNumber: vehicleNumber.slice(0, 30),
      cost: Math.round(cost),
      costSource: COST_SOURCE_BY_MODE[mode],
      costNote: COST_NOTE_BY_MODE[mode],
      arrangedBy: uid,
    },
  };
}

/** Load the vendor's own orders, verified as poolable. */
async function loadPoolable(orderIds, vendorUid) {
  const ids = orderIds.filter((id) => mongoose.isValidObjectId(id));
  if (ids.length !== orderIds.length) return { error: 'One of those orders is not valid' };

  const orders = await Order.find({ _id: { $in: ids }, vendorUid }).lean();
  if (orders.length !== ids.length)
    return { error: 'Some of those orders are not yours, or no longer exist' };

  for (const o of orders) {
    if (o.consignmentId)
      return { error: `${o.cropName} is already part of another shared trip` };
    if (o.status !== 'awaiting_agent')
      return { error: `${o.cropName} is already ${o.status.replace(/_/g, ' ')} — only orders still waiting for a driver can be pooled` };
    if (!toLatLng(o.pickup))
      return { error: `${o.cropName} has no pickup location` };
  }
  return { orders };
}

/**
 * POST /api/consignments/quote
 * body: { orderIds: [...], vehicleType }
 *
 * Read-only. Prices the shared run AND the same crop as separate trips, so the
 * saving is a measured number rather than a marketing claim.
 */
router.post('/quote', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const { orderIds, vehicleType } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length < 2)
      return res.status(400).json({ success: false, error: 'Pick at least two orders to share a vehicle' });
    if (orderIds.length > MAX_STOPS)
      return res.status(400).json({
        success: false, code: 'TOO_MANY_STOPS',
        error: `A shared trip can serve at most ${MAX_STOPS} farms — beyond that the last farmer waits too long.`,
      });

    const { orders, error } = await loadPoolable(orderIds, req.firebaseUid);
    if (error) return res.status(409).json({ success: false, error });

    // Every order must be going to the same place, or it is not one trip.
    const drops = orders.map((o) => toLatLng(o.dropoff));
    const far = drops.some((d) => haversineKm(d, drops[0]) > 2);
    if (far)
      return res.status(400).json({
        success: false, code: 'DIFFERENT_DROPOFFS',
        error: 'These orders are going to different places — a shared trip needs one destination.',
      });

    const dropoff = drops[0];
    const totalKg = orders.reduce((a, o) => a + o.quantityKg, 0);

    const stops = orderStops(
      orders.map((o) => ({ ...toLatLng(o.pickup), quantityKg: o.quantityKg, orderId: o._id })),
      dropoff
    );
    const route = await getMultiStopRoute([...stops, dropoff]);
    if (!route) return res.status(400).json({ success: false, error: 'Could not build a route for those stops' });

    // The agent drives home ONCE, from the drop-off back to the pickup area —
    // not back along every farm-to-farm detour they made on the way out. Pass
    // that distance explicitly, or the shared run gets billed for three empty
    // returns it never drives and pooling looks more expensive than it is.
    const returnDistanceKm = roundKm(haversineKm(dropoff, stops[0]) * ROAD_FACTOR);
    const priced = quote(vehicleType, route.distanceKm, totalKg, { returnDistanceKm });
    if (!priced.ok)
      return res.status(400).json({ success: false, code: 'VEHICLE_UNSUITABLE', error: priced.reason });

    // What these same orders cost as separate trips — the number the saving is
    // measured against. Uses each order's OWN already-computed fare, so it is
    // what the vendor was actually quoted, not a re-estimate.
    const soloTotal = orders.reduce((a, o) => a + (o.fare?.total || 0), 0);
    const shares = splitFare(priced.fare.total, stops.map((s) => ({ quantityKg: s.quantityKg })));

    res.json({
      success: true,
      quote: {
        stops: stops.length,
        totalQuantityKg: totalKg,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        routeSource: route.source,
        vehicle: priced,
        sharedFare: priced.fare.total,
        soloFareTotal: soloTotal,
        // The saving can be NEGATIVE, and the API says so rather than clamping
        // it to zero. Aggregation pays when farms are close together: the
        // vehicle is the cost and the load is nearly free. But three farms
        // 40 km apart make a 120 km pickup detour, and that detour can cost
        // more than sharing saves. Hiding that would be selling the vendor a
        // worse trip and calling it a saving.
        saving: soloTotal - priced.fare.total,
        savingPct: soloTotal > 0
          ? Math.round(((soloTotal - priced.fare.total) / soloTotal) * 100)
          : 0,
        worthIt: priced.fare.total < soloTotal,
        warning: priced.fare.total >= soloTotal
          ? 'These farms are too far apart to share a vehicle — the pickup detour costs '
            + `more than the shared trip saves. Separate trips are ₹${soloTotal - priced.fare.total < 0 ? priced.fare.total - soloTotal : 0} cheaper here.`
          : null,
        perStop: stops.map((s, i) => ({
          orderId: s.orderId,
          quantityKg: s.quantityKg,
          fareShare: shares[i],
          legKm: route.legs?.[i]?.distanceKm ?? null,
        })),
      },
    });
  } catch (err) {
    console.error('❌ Consignment quote error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/consignments — commit the shared trip.
 *
 * Each order keeps its own identity; this claims them into one run and
 * rewrites each order's fare to its share, so every receipt still reconciles.
 */
router.post('/', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const { orderIds, vehicleType } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length < 2)
      return res.status(400).json({ success: false, error: 'Pick at least two orders' });
    if (orderIds.length > MAX_STOPS)
      return res.status(400).json({ success: false, code: 'TOO_MANY_STOPS', error: `At most ${MAX_STOPS} farms per trip` });

    // ⚠️ HIRED ONLY. This route pools a BUYER's own placed orders into one
    // vehicle (ShareVehicleScreen) — `requireRole('vendor')` is the outer
    // gate, so the caller can never be the FPO admin buildTransportArrangement
    // now requires for own/contracted. Before that check existed, ANY buyer
    // could name an arbitrary FPO's vehicle and state its cost with nobody
    // from that FPO ever consenting — the exact hole closed elsewhere in this
    // file. Rather than leave a mode selector that always 403s with a
    // confusing NOT_FPO_ADMIN, refuse it here by name: no screen has ever
    // sent a non-hired mode to this endpoint (verified — ShareVehicleScreen
    // sends neither `transportMode` nor `fpoId`), so nothing real depends on
    // it, and a buyer stating another party's vehicle and price is not a
    // capability this endpoint should offer at all.
    if (req.body?.transportMode && req.body.transportMode !== 'hired') {
      return res.status(400).json({
        success: false, code: 'HIRED_ONLY',
        error: 'A shared vehicle run is arranged through the captain pool. '
          + "An FPO's own transport is arranged from the FPO's own collection screen instead.",
      });
    }
    const arrangement = await buildTransportArrangement(req.body, req.firebaseUid);
    if (arrangement.error)
      return res.status(400).json({ success: false, code: arrangement.code, error: arrangement.error });
    const hired = arrangement.mode === 'hired';

    const { orders, error } = await loadPoolable(orderIds, req.firebaseUid);
    if (error) return res.status(409).json({ success: false, error });

    const drops = orders.map((o) => toLatLng(o.dropoff));
    if (drops.some((d) => haversineKm(d, drops[0]) > 2))
      return res.status(400).json({ success: false, code: 'DIFFERENT_DROPOFFS', error: 'These orders go to different places' });

    const dropoff = drops[0];
    const totalKg = orders.reduce((a, o) => a + o.quantityKg, 0);
    const byId = new Map(orders.map((o) => [String(o._id), o]));

    const ordered = orderStops(
      orders.map((o) => ({ ...toLatLng(o.pickup), quantityKg: o.quantityKg, orderId: o._id })),
      dropoff
    );
    const route = await getMultiStopRoute([...ordered, dropoff]);
    if (!route) return res.status(400).json({ success: false, error: 'Could not build a route' });

    // The agent drives home ONCE, from the drop-off back to the pickup area —
    // not back along every farm-to-farm detour they made on the way out. Pass
    // that distance explicitly, or the shared run gets billed for three empty
    // returns it never drives and pooling looks more expensive than it is.
    const returnDistanceKm = roundKm(haversineKm(dropoff, ordered[0]) * ROAD_FACTOR);

    // ── THE FARE, OR THE STATED COST ──────────────────────────────────────
    let fareBlock, soloTotal;
    if (hired) {
      const priced = quote(vehicleType, route.distanceKm, totalKg, { returnDistanceKm });
      if (!priced.ok) return res.status(400).json({ success: false, error: priced.reason });
      fareBlock = priced.fare;
      // What these same orders were actually quoted as separate captain trips.
      soloTotal = orders.reduce((a, o) => a + (o.fare?.total || 0), 0);
    } else {
      const v = VEHICLES[vehicleType];
      if (!v) return res.status(400).json({ success: false, error: 'Unknown vehicle type' });
      // Capacity IS enforced on a non-hired run: a tempo carries 1,500 kg
      // whoever owns it, and that is a fact about the vehicle rather than a
      // pricing policy. `maxKm` is NOT enforced — the 20 km auto rule is a
      // dispatch-pool policy about how far a captain is asked to drive a small
      // vehicle for this app's money, and it is not this app's business to
      // refuse an FPO driving its own auto 25 km down its own road.
      if (totalKg > v.capacityKg)
        return res.status(400).json({
          success: false, code: 'VEHICLE_UNSUITABLE',
          error: `${v.label} carries up to ${v.capacityKg} kg`,
        });

      // NO base, NO per-km rate, NO return charge — because none of those are
      // known here and inventing them is the whole thing this avoids. Only the
      // total is real, and it came from the FPO.
      fareBlock = {
        base: null, perKm: null, distanceCharge: null,
        returnCharge: 0, returnKm: 0, returnThresholdKm: null,
        total: arrangement.transport.cost,
        // There is no captain, so there is nobody to pay a captain's payout to.
        agentPayout: null,
      };
      // NOT COMPARED against the captain fare table. `soloFareTotal` exists so
      // the pooling saving can be a measured number; measuring an FPO-stated
      // cost against captain-priced solo trips would subtract two figures from
      // different price bases, which is exactly the error that once turned a
      // 9% forecast FALL into a ₹1.96 lakh "gain" (see CLAUDE.md, H2). null
      // means "not measured", and the dashboard already reports such runs as
      // `unmeasuredCompleted` rather than assuming a zero saving.
      soloTotal = null;
    }

    const shares = splitFare(fareBlock.total, ordered);

    const stops = ordered.map((s, i) => {
      const o = byId.get(String(s.orderId));
      return {
        orderId: o._id,
        farmerUid: o.farmerUid, farmerName: o.farmerName, farmerPhone: o.farmerPhone,
        cropName: o.cropName, quantityKg: o.quantityKg,
        lat: s.lat, lng: s.lng, label: o.pickup?.label || '',
        sequence: i,
        legKm: route.legs?.[i]?.distanceKm ?? null,
        fareShare: shares[i],
        // The weight this share was computed from. See FARE_SPLIT_POLICY.
        fareShareBasisKg: o.quantityKg,
      };
    });

    const consignment = await Consignment.create({
      vendorUid: req.firebaseUid,
      vendorName: req.profile.name,
      vendorPhone: req.profile.phone,
      orderIds: orders.map((o) => o._id),
      stops,
      dropoff: {
        ...dropoff,
        label: orders[0].dropoff?.label || '',
        district: orders[0].dropoff?.district || resolveDistrict(null, dropoff) || '',
      },
      vehicleType,
      totalQuantityKg: totalKg,
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      routeSource: route.source,
      routePolyline: route.polyline,
      fare: fareBlock,
      soloFareTotal: soloTotal,

      transportMode: arrangement.mode,
      fpoId: hired ? null : arrangement.fpo._id,
      transport: hired
        ? { costSource: COST_SOURCE_BY_MODE.hired, costNote: COST_NOTE_BY_MODE.hired }
        : arrangement.transport,

      // A hired run goes to the captain pool with a dispatch window. An
      // own/contracted run does NOT: there is no pool to offer it to, so it
      // starts already accepted with no agent and no expiry.
      //
      // ⚠️ `isActiveJob` is deliberately NOT set on an agentless run. The
      // partial unique index `oneActiveConsignmentPerAgent` keys on agentUid
      // where isActiveJob is true — two agentless runs would both key on null
      // and the second would fail with a duplicate key error. The index exists
      // to stop one captain holding two jobs; with no captain there is nothing
      // for it to guard.
      status: hired ? 'awaiting_agent' : 'accepted',
      dispatchExpiresAt: hired ? dispatchExpiryFrom().expiresAt : null,
      acceptedAt: hired ? null : new Date(),
      dropOtp: otp(),
    });

    // Claim the orders. Guarded on consignmentId:null so two concurrent
    // poolings cannot both take the same order; any that lost are released.
    const claimed = [];
    for (const s of stops) {
      const ok = await Order.findOneAndUpdate(
        { _id: s.orderId, consignmentId: null, status: 'awaiting_agent' },
        {
          $set: {
            consignmentId: consignment._id,
            // The order's fare becomes its SHARE, so its own grandTotal and
            // receipt stay correct without any special-casing downstream.
            'fare.total': s.fareShare,
            'fare.agentPayout': s.fareShare,
            grandTotal: (byId.get(String(s.orderId)).cropTotal || 0) + s.fareShare,
          },
        },
        { new: true }
      );
      if (ok) claimed.push(ok);
    }

    if (claimed.length !== stops.length) {
      // Roll back: restore the orders we did claim, and drop the consignment.
      for (const c of claimed) {
        const original = byId.get(String(c._id));
        await Order.updateOne({ _id: c._id }, {
          $set: {
            consignmentId: null,
            'fare.total': original.fare.total,
            'fare.agentPayout': original.fare.agentPayout ?? original.fare.total,
            grandTotal: original.grandTotal,
          },
        });
      }
      await Consignment.deleteOne({ _id: consignment._id });
      return res.status(409).json({
        success: false, code: 'ORDER_TAKEN',
        error: 'One of those orders was just pooled into another trip. Refresh and try again.',
      });
    }

    // An own/contracted run has no captain to accept it, so nothing else will
    // ever move its orders out of awaiting_agent — and a stop outcome is
    // guarded on `status: 'accepted'`. Done here, AFTER the claim loop (which
    // guards on awaiting_agent and would otherwise never match), and WITHOUT
    // isActiveJob for the same partial-index reason as the consignment above.
    let promoted = consignment;
    if (!hired) {
      await Order.updateMany(
        { _id: { $in: consignment.orderIds }, consignmentId: consignment._id, status: 'awaiting_agent' },
        { $set: { status: 'accepted', acceptedAt: new Date() } }
      );
      promoted = await Consignment.findById(consignment._id);
    }

    console.log(
      `🚚 Consignment ${consignment._id}: ${stops.length} farms · ${totalKg}kg · ${route.distanceKm}km · `
      + `₹${fareBlock.total} [${arrangement.mode}]`
      + (hired ? ` (was ₹${soloTotal} separately)` : ' — stated by the FPO, not priced by the fare table')
    );
    res.status(201).json({
      success: true,
      consignment: promoted,
      transportMode: arrangement.mode,
      // Said out loud in the response, not only stored: a caller must be able
      // to render "₹4,000, stated by the FPO" rather than showing it in the
      // same typeface as a computed fare.
      costSource: hired ? COST_SOURCE_BY_MODE.hired : arrangement.transport.costSource,
      costNote: hired ? COST_NOTE_BY_MODE.hired : arrangement.transport.costNote,
      dispatched: hired,
      dispatchNote: hired
        ? null
        : 'This run was NOT offered to the captain pool — the FPO is driving it. Its stop outcomes are '
          + "recorded by the FPO's own admin.",
    });
  } catch (err) {
    console.error('❌ Create consignment error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/consignments/vendor/mine */
router.get('/vendor/mine', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    await sweepExpired();
    const list = await Consignment.find({ vendorUid: req.firebaseUid })
      .select('-routePolyline').sort({ createdAt: -1 }).limit(30).lean();
    res.json({ success: true, consignments: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/consignments/vendor/purchases — ONE BULK PURCHASE, AS ONE THING.
 *
 * THE HOLE THIS FILLS
 *   Buying one 2-tonne lot from five farmers writes five Orders and one
 *   Consignment, and the buyer's order list rendered five unrelated rows: five
 *   crops, five prices, five drivers-coming, with nothing saying they were one
 *   purchase, one price and one truck.
 *
 * WHAT IS ACTUALLY NEW HERE, AND WHAT IS NOT
 *   The RUN was already available (`GET /vendor/mine`) and the ORDERS already
 *   carry `consignmentId`, so a client could always have grouped them — that
 *   part is a screen, not an API. Two things genuinely did not exist:
 *
 *     1. WHICH LOT THIS WAS. A hired FPO-lot run carries `fpoId: null` by
 *        design, so nothing on either document named the group, the crop or
 *        the grade the buyer shopped for. That is `Consignment.lot`, written
 *        at confirm time, and it cannot be derived by joining anything.
 *     2. ONE READ. The alternative is fetch-runs-then-fetch-orders-and-join
 *        per screen, and the two lists have different limits and different
 *        sort orders, so a buyer with many orders would see runs whose rows
 *        were missing. The join is done here, once, over exactly these runs.
 *
 * Everything else is a roll-up of the orders on the run — no figure is stored
 * twice and every one of them is recomputed from the Orders themselves, so a
 * settlement recorded a second ago is reflected immediately.
 */
router.get('/vendor/purchases', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    await sweepExpired();
    const limit = Math.min(Number(req.query.limit) || 30, 50);

    const runs = await Consignment.find({ vendorUid: req.firebaseUid })
      .select('-routePolyline').sort({ createdAt: -1 }).limit(limit).lean();

    const orderIds = runs.flatMap((c) => c.orderIds || []);
    const orders = orderIds.length
      ? await Order.find({ _id: { $in: orderIds }, vendorUid: req.firebaseUid })
        .select('-routePolyline -approachPolyline -pickupOtp -tracking').lean()
      : [];
    const byRun = new Map();
    for (const o of orders) {
      const k = String(o.consignmentId);
      if (!byRun.has(k)) byRun.set(k, []);
      byRun.get(k).push(o);
    }

    const purchases = runs.map((c) => {
      const rows = (byRun.get(String(c._id)) || []).sort((a, b) => a.cropName.localeCompare(b.cropName));
      const t = c.tracking || {};
      const ageSec = t.updatedAt ? Math.round((Date.now() - new Date(t.updatedAt)) / 1000) : null;

      // THE MONEY, RECOMPUTED FROM THE ORDERS — never a second stored copy.
      // `cropTotal` is what the buyer pays the farmers, `fareTotal` is the one
      // vehicle. They are kept apart because they are paid to different people
      // at different times, exactly as Order.farmerPayout and Order.fare are.
      const cropTotal = rows.reduce((a, o) => a + (o.cropTotal || 0), 0);
      const fareTotal = c.fare?.total ?? rows.reduce((a, o) => a + (o.fare?.total || 0), 0);

      return {
        consignmentId: c._id,
        createdAt: c.createdAt,

        // WHAT WAS BOUGHT. `lot.source` says whether this was a group lot from
        // the catalog or a buyer pooling their own orders onto one vehicle —
        // the two read very differently on a screen and must not be merged.
        lot: c.lot?.source === 'fpo_lot'
          ? { ...c.lot }
          : { source: 'pooled_orders', fpoId: null, fpoName: '', cropName: '', gradeKey: null,
            gradeCode: null, gradeLabel: '', gradeDeclared: false, lotKey: null },

        // WHO SUPPLIED IT. The buyer is a party to every one of these orders,
        // so nothing is masked here — this is their own purchase.
        contributors: rows.map((o) => ({
          orderId: o._id,
          farmerUid: o.farmerUid,
          farmerName: o.farmerName,
          farmerPhone: o.farmerPhone,
          cropName: o.cropName,
          // What was AGREED beside what actually left the farm. A short pickup
          // rewrites quantityKg, so without orderedKg the shortfall vanishes.
          orderedKg: o.pickupOutcome?.orderedKg ?? o.quantityKg,
          quantityKg: o.quantityKg,
          pricePerKg: o.pricePerKg,
          cropTotal: o.cropTotal,
          // ⚠️ WHAT THE FARMER IS ACTUALLY PAID, WHICH IS NOT ALWAYS
          // `cropTotal`. Phase 3, L1 — stock that passed through an FPO
          // collection run under facilitation mode nets out that run's
          // freight here. A "pay this lot" total built from `cropTotal`
          // would silently overpay by the freight the farmer already owes.
          farmerPayout: o.farmerPayout,
          freightDeduction: o.freightDeduction?.amount ? o.freightDeduction : null,
          fareShare: o.fare?.total ?? 0,
          grandTotal: o.grandTotal,
          status: o.status,
          pickupOutcome: o.pickupOutcome?.outcome ?? null,
          failureReason: o.pickupOutcome?.reason ?? null,
          // WHERE `quantityKg` CAME FROM. A buyer reading "512 kg" is entitled
          // to know whether anybody put it on a scale, and who did.
          weight: describeWeight(
            o.pickupOutcome?.weight?.method,
            o.pickupOutcome?.weight?.ref,
            o.quantityKg
          ),
          recordedByRole: o.pickupOutcome?.recordedByRole ?? null,
          // WHAT THE LOT LOOKED LIKE against what was sold. Carried on every
          // contributor row, not only the ones that differ, so a screen can
          // show "checked, matched" as well as "checked, lower" — an absent
          // block would read as "fine" when it means "nobody looked".
          grade: describeGradeCheck(o.pickupOutcome?.grade),
          settled: !!o.settlement?.farmerPaid,
        })),

        // THE RUN. One vehicle, one status, one driver — the thing five rows
        // could never show.
        run: {
          status: c.status,
          transportMode: c.transportMode || 'hired',
          vehicleType: c.vehicleType,
          stops: c.stops?.length || 0,
          stopsVisited: (c.stops || []).filter((s) => s.collected || (s.outcome ?? 'pending') !== 'pending').length,
          plannedKg: c.totalQuantityKg,
          collectedKg: c.collectedQuantityKg,
          distanceKm: c.distanceKm,
          dropoff: c.dropoff,
          acceptedAt: c.acceptedAt || null,
          inTransitAt: c.inTransitAt || null,
          deliveredAt: c.deliveredAt || null,
          driver: driverBlock(c),
          // Enough for a list row to dim the "live" chip without a second call.
          // Never a position — that is what /:id/track is for.
          lastSeenAt: t.updatedAt || null,
          ageSec,
          stale: ageSec == null || ageSec > TRACK_LIVE_SEC,
          staleness: stalenessOf(ageSec),
        },

        totals: {
          cropTotal,
          fareTotal,
          // What this purchase cost the buyer, all in.
          grandTotal: cropTotal + fareTotal,
          farmers: rows.length,
          settledFarmers: rows.filter((o) => o.settlement?.farmerPaid).length,
          // What tapping "pay this lot" would actually settle right now — the
          // unpaid farmers whose crop has left the farm. Excludes anyone still
          // `awaiting_agent`/`no_agents`/`cancelled` (not collected, POST
          // /lots/pay would refuse them) and anyone already paid. Built from
          // `farmerPayout`, not `cropTotal` — see the note on that field above.
          payableNow: rows
            .filter((o) => !o.settlement?.farmerPaid && ['picked_up', 'delivered', 'stranded'].includes(o.status))
            .reduce((a, o) => a + (o.farmerPayout || 0), 0),
          payableFarmers: rows
            .filter((o) => !o.settlement?.farmerPaid && ['picked_up', 'delivered', 'stranded'].includes(o.status)).length,
          // Named separately because a shortfall is the number a buyer chases.
          orderedKg: rows.reduce((a, o) => a + (o.pickupOutcome?.orderedKg ?? o.quantityKg ?? 0), 0),
          deliveredKg: rows.reduce((a, o) => a + (o.quantityKg || 0), 0),
          // `deliveredKg` never travels alone. Rolled up from the ORDERS, the
          // same source the kilogram figure beside it comes from, so the two
          // can never disagree.
          weightProvenance: summariseWeights(rows.map((o) => ({
            collectedKg: o.quantityKg,
            weight: o.pickupOutcome?.weight,
          }))),
          // How many of this purchase's farms were graded lower at the gate
          // than they were sold as. A count, not a deduction.
          gradeDowngrades: rows.filter((o) => o.pickupOutcome?.grade?.discrepancy === 'downgrade').length,
        },
      };
    });

    res.json({
      success: true,
      purchases,
      note: 'One row per purchase, not per farmer. Every rupee figure is recomputed from the orders '
        + 'themselves rather than stored twice, so a settlement recorded a moment ago is already '
        + 'reflected here.',
      // Said once, plainly, on the buyer's own purchase list — the screen most
      // likely to present a kilogram figure as though the app had measured it.
      weightNote: WEIGHT_DISCLAIMER,
      gradeNote: 'A grade recorded at the farm gate is an observation by whoever collected the lot, '
        + 'not an inspection, and a difference from the declared grade has NOT changed what you pay. '
        + 'If a lot is not what you bought, raise a grievance against that order.',
    });
  } catch (err) {
    console.error('❌ Vendor purchases error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/consignments/driver/mine — the FPO driver's own runs.
 *
 * This is what replaces the captain pool for somebody who is deliberately not
 * in it. It lists ONLY runs this account has been assigned to by name; there
 * is no feed of available work, no nearby search and no accept — an FPO driver
 * is given a run by their own group's admin and is never offered anything else.
 *
 * The drop OTP is stripped for the same reason it is stripped from the captain
 * feed: the buyer reads that code out at the gate.
 */
router.get('/driver/mine', requireAuth, requireRole(...FPO_DRIVER_ROLES), async (req, res) => {
  try {
    const active = req.query.active === '1';
    const list = await Consignment.find({
      'transport.driverUid': req.firebaseUid,
      ...(active ? { status: { $in: LIVE_RUN_STATUSES } } : {}),
    }).select('-routePolyline -dropOtp').sort({ createdAt: -1 }).limit(20).lean();

    res.json({
      success: true,
      consignments: list,
      note: 'Runs your FPO assigned to you. There is no job pool here — you are not a dispatch '
        + 'captain and are never offered unrelated work.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/consignments/agent/available — open multi-farm runs near the agent. */
/**
 * GET /api/consignments/agent/history — the captain's completed MULTI-FARM runs.
 *
 * Kept apart from the single-pickup history for the reason the two are
 * different objects: a run is one vehicle across several farms whose fare is
 * split BY WEIGHT across the stops. Merging them into one list would have to
 * pick one shape and would lose either the farm count or the split.
 *
 * `delivered` only, same rule as the order side — and `abandoned` is
 * deliberately excluded: produce was stranded, nobody was paid out cleanly, and
 * counting it as completed work would be false in both directions.
 */
router.get('/agent/history', requireAuth, requireRole('agent'), async (req, res) => {
  try {
    const runs = await Consignment.find({ agentUid: req.firebaseUid, status: 'delivered' })
      .select('-dropOtp -stops.pickupOtp')
      .sort({ deliveredAt: -1 })
      .limit(40)
      .lean();

    const earned = runs.reduce((a, r) => a + (r.fare?.agentPayout ?? r.fare?.total ?? 0), 0);
    res.json({
      success: true,
      runs: runs.map((r) => ({
        _id: r._id,
        farms: (r.stops || []).length,
        totalQuantityKg: r.totalQuantityKg,
        collectedQuantityKg: r.collectedQuantityKg,
        distanceKm: r.distanceKm,
        fare: r.fare?.agentPayout ?? r.fare?.total ?? 0,
        deliveredAt: r.deliveredAt,
        vendorName: r.vendorName,
        transportMode: r.transportMode || 'hired',
      })),
      summary: {
        runs: runs.length,
        farmsServed: runs.reduce((a, r) => a + (r.stops || []).length, 0),
        totalEarned: earned,
        kgMoved: runs.reduce((a, r) => a + (r.collectedQuantityKg || 0), 0),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/agent/available', requireAuth, requireRole('agent'), async (req, res) => {
  try {
    await sweepExpired();

    // A captain already mid-job is offered nothing — in EITHER collection.
    // routes/orders.js's own feed has always done this for orders; showing runs
    // to somebody who cannot accept one only produces failed accepts.
    const busy = await activeJobOf(req.firebaseUid);
    if (busy) return res.json({ success: true, consignments: [], busy: true, activeJob: busy });

    // ⚠️ Scan first, filter by distance second — see routes/orders.js's own feed
    // and the header of services/dispatchReach.js. This had exactly the same
    // defect: twenty oldest runs in the state, then sorted by distance.
    const me = locateCaptain({ query: req.query, profile: req.profile });
    // Phase 6, B5b — same widening as routes/orders.js's own feed: a bigger
    // vehicle can run a smaller-vehicle job. The `|| { $exists: true }`
    // fallback for a captain with no vehicle type on file is unchanged.
    const myVehicleType = req.profile?.vehicle?.type;
    const open = await Consignment.find({
      status: 'awaiting_agent',
      rejectedBy: { $ne: req.firebaseUid },
      vehicleType: myVehicleType ? { $in: vehicleTypesServableBy(myVehicleType) } : { $exists: true },
      // An own/contracted run is never dispatched. `status: 'awaiting_agent'`
      // already excludes it (such a run is created straight into `accepted`),
      // and this says so explicitly as well.
      //
      // `$in: ['hired', null]` and NOT `$ne: 'own'` — `$in` with null is the
      // form that matches a document where the field is MISSING, which every
      // consignment written before transportMode existed is. The mirror-image
      // mistake is already recorded in CLAUDE.md: `$ne` matched every user
      // created before C2 added the field.
      transportMode: { $in: ['hired', null] },
    }).select('-routePolyline').sort({ createdAt: 1 }).limit(SCAN_CAP).lean();

    const { items: consignments, reach } = reachable({
      items: open.map((c) => ({ ...c, dropOtp: undefined })),  // OTPs are never sent to the agent
      // Measured to the FIRST farm — what the captain actually has to drive to
      // START the job, not the length of the run. The run's own kilometres are
      // paid; this approach drive is not.
      pickupOf: (c) => c.stops?.[0],
      me,
      vehicleType: myVehicleType,
      limit: 20,
    });

    res.json({ success: true, consignments, busy: false, reach });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/consignments/:id/accept
 *
 * THREE races, not two. The first two are the ones this route always had — two
 * captains on one run (the status/agentUid filter decides) and one captain on
 * two runs (`oneActiveConsignmentPerAgent` raises E11000). The third is the one
 * no index could see: this captain already holding a single-farmer ORDER.
 * `activeJobOf()` is checked before the claim and re-checked after it; see the
 * header of services/agentJobService.js for why that is safe and why a rejected
 * claim is the failure to prefer.
 */
router.post('/:id/accept', requireAuth, requireRole('agent'), async (req, res) => {
  try {
    const uid = req.firebaseUid;

    // 1. Cheap refusal for the common case: this captain is visibly busy.
    const busyBefore = await activeJobOf(uid);
    if (busyBefore) return res.status(409).json(busyResponse(busyBefore));

    const c = await Consignment.findOneAndUpdate(
      { _id: req.params.id, status: 'awaiting_agent', agentUid: null },
      {
        $set: {
          status: 'accepted',
          isActiveJob: true,
          agentUid: uid,
          agentName: req.profile.name,
          agentPhone: req.profile.phone,
          agentVehicleNumber: req.profile.vehicle?.number || '',
          acceptedAt: new Date(),
          tracking: { lat: Number(req.body.lat), lng: Number(req.body.lng), seq: 0, updatedAt: new Date() },
        },
      },
      { new: true }
    );
    if (!c)
      return res.status(409).json({ success: false, code: 'TAKEN', error: 'Another driver took this run.' });

    // 3. Re-check, now that the claim is committed. A single-farmer order
    //    accepted in the same instant is invisible to step 1 but visible here,
    //    and one of the two racers is guaranteed to see the other (see
    //    services/agentJobService.js). Undo BEFORE the orders are promoted, so
    //    the rollback only has to put this one document back.
    const busyAfter = await activeJobOf(uid, { excludeConsignmentId: c._id });
    if (busyAfter) {
      await Consignment.updateOne(
        { _id: c._id, agentUid: uid, status: 'accepted' },
        {
          $set: {
            status: 'awaiting_agent', agentUid: null, agentName: '', agentPhone: '',
            agentVehicleNumber: '', acceptedAt: null,
            dispatchExpiresAt: dispatchExpiryFrom().expiresAt,
          },
          $unset: { isActiveJob: '' },
        }
      );
      return res.status(409).json(busyResponse(busyAfter));
    }

    // Move every order in the run to accepted, so each farmer's own screen
    // shows a driver coming.
    await Order.updateMany(
      { _id: { $in: c.orderIds }, status: 'awaiting_agent' },
      {
        $set: {
          status: 'accepted', agentUid: uid, agentName: req.profile.name,
          agentPhone: req.profile.phone,
          agentVehicleNumber: req.profile.vehicle?.number || '',
          acceptedAt: new Date(),
        },
      }
    );

    console.log(`✅ Consignment ${c._id} accepted by ${req.profile.name} (${c.stops.length} farms)`);
    res.json({ success: true, consignment: c });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({
        success: false, code: 'ALREADY_ON_JOB',
        error: 'Finish your current job before taking another.',
      });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Record what happened at ONE stop. Shared by /collect (the happy path) and
 * /stop-outcome (all three outcomes).
 *
 * WHY A STOP NEEDS AN OUTCOME AND NOT JUST A BOOLEAN
 *   A captain who reaches farm 3 of 5 and finds nobody home used to have
 *   nowhere to put that. The run could not be delivered (delivery required
 *   every stop `collected`), the totals still claimed the planned load, and
 *   the farmer's order sat in `accepted` indefinitely — while a buyer had
 *   already committed to a quantity that was never going to arrive.
 *
 * CONCURRENCY — the same discipline as everything else in this app:
 *   • the run is loaded with `agentUid` and the live statuses IN THE FILTER,
 *     so a driver who is not the assigned one never gets past the first read
 *   • the ORDER transition is a guarded findOneAndUpdate with the expected
 *     status (and, for a collection, the farmer's own pickup code) in the
 *     filter — that is what serialises two simultaneous taps
 *   • the STOP write is a second guarded findOneAndUpdate on
 *     `outcome: 'pending'`, so an outcome can never be written twice
 *
 * The OTP rule differs by outcome, deliberately:
 *   collected_full / collected_short — produce is leaving the farm, so the
 *     farmer's own 4-digit code is required exactly as before. A short pickup
 *     is still a pickup and still needs the farmer's consent.
 *   not_collected — nothing moves, and there is often nobody to read a code
 *     out (that IS the reason). So it is recorded on the captain's word, and
 *     the record says whose word: `outcomeBy` on the stop and
 *     `pickupOutcome.recordedBy` on the order. The farmer sees their order
 *     cancelled with the stated reason and can raise a dispute against it —
 *     which is the right remedy here, not a code nobody can supply.
 */
async function recordStopOutcome(req, res, body, opts = {}) {
  const uid = req.firebaseUid;
  const { stopId, orderId, otp: code, collectedKg, reason, note } = body;
  const outcome = body.outcome;
  // `opts`, NOT a field on `body`. /stop-outcome forwards the client's own
  // body straight through, so anything read off it can be smuggled by a
  // caller — the same reason `costSource` is derived from the mode rather than
  // taken from the request.
  const { legacyWeight = false } = opts;

  if (!['collected_full', 'collected_short', 'not_collected'].includes(outcome))
    return res.status(400).json({
      success: false, code: 'BAD_OUTCOME',
      error: 'outcome must be collected_full, collected_short or not_collected',
    });

  // `in_transit` is included so a stop that has already been recorded answers
  // ALREADY_RECORDED rather than a bewildering 404: once the last gate is in,
  // the run has left, and "that farm is already done" is the true reason.
  const c = await Consignment.findOne({
    _id: req.params.id,
    status: { $in: LIVE_RUN_STATUSES },
  }).lean();
  if (!c) return res.status(404).json({ success: false, error: 'Run not found, or not yours' });

  // A run WITH an agent stays agent-only, exactly as before. A run with no
  // agent (own/contracted transport) is recorded by the driver the FPO
  // assigned to it, or by the FPO admin from the office when there is no
  // driver account to assign. See resolveRunActor().
  const actor = await resolveRunActor(c, uid, req.profile?.role);
  if (actor.error)
    return res.status(actor.status).json({ success: false, code: actor.code, error: actor.error });

  // Accepts `stopId` (any run) or `orderId` (a buyer run, which is what every
  // existing screen posts). See findStop().
  const stop = findStop(c, { stopId, orderId });
  if (!stop) return res.status(404).json({ success: false, error: 'That farm is not on this run' });

  const already = stop.outcome && stop.outcome !== 'pending' ? stop.outcome : (stop.collected ? 'collected_full' : null);
  if (already)
    return res.status(409).json({
      success: false,
      code: already === 'not_collected' ? 'ALREADY_RECORDED' : 'ALREADY_COLLECTED',
      error: already === 'not_collected'
        ? 'This farm is already recorded as not collected. Raise a dispute if that is wrong.'
        : 'Already collected from this farm.',
    });

  const orderedKg = stop.quantityKg;
  let kg = orderedKg;
  if (outcome === 'collected_short') {
    kg = Number(collectedKg);
    if (!Number.isFinite(kg) || kg <= 0)
      return res.status(400).json({
        success: false, code: 'BAD_QUANTITY',
        error: 'A short collection needs the kilograms actually loaded. If nothing was, record not_collected instead.',
      });
    if (kg >= orderedKg)
      return res.status(400).json({
        success: false, code: 'BAD_QUANTITY',
        error: `${orderedKg} kg was ordered — if all of it was loaded, record this as collected in full.`,
      });
  }
  if (outcome === 'not_collected') kg = 0;

  // A reason is required for anything short of a full pickup. It is one tap on
  // a fixed list and it is the difference between a countable record and a
  // shrug — an order that ends at 0 kg with no reason is unusable to the
  // farmer, the buyer and any later dispute.
  if (outcome !== 'collected_full' && !FAILURE_REASONS.includes(reason))
    return res.status(400).json({
      success: false, code: 'REASON_REQUIRED',
      error: `reason is required and must be one of: ${FAILURE_REASONS.join(', ')}`,
    });

  // ── HOW WAS IT WEIGHED? ─────────────────────────────────────────────────
  //
  // Required whenever produce actually moved, because `kg` is about to decide
  // what a farmer is paid and what a buyer owes. Not asked when nothing moved:
  // there is no weight to have a provenance, and `kg` is 0 by definition.
  //
  // `estimated` is a perfectly acceptable answer and is expected to be the
  // common one — see data/gateRecord.js. What is refused is SILENCE, because
  // silence is what lets an eyeballed figure be read as a measured one.
  //
  // THE ONE EXEMPTION is the legacy POST /collect route, which predates this
  // field and asks nothing. It records `not_recorded` — a distinct value, not
  // a quiet 'estimated' — so every surface can say plainly that nobody stated
  // a method rather than inventing one on the recorder's behalf.
  let weightMethod = null;
  const weightRef = String(body.weightRef || '').slice(0, 60);
  if (outcome !== 'not_collected') {
    if (POSTABLE_WEIGHT_METHODS.includes(body.weightMethod)) {
      weightMethod = body.weightMethod;
    } else if (legacyWeight && body.weightMethod == null) {
      weightMethod = WEIGHT_NOT_RECORDED;
    } else {
      return res.status(400).json({
        success: false, code: 'WEIGHT_METHOD_REQUIRED',
        error: `weightMethod is required and must be one of: ${POSTABLE_WEIGHT_METHODS.join(', ')}. `
          + 'If nobody weighed this lot, say so with "estimated" — that is an honest answer and this '
          + 'app would rather record it than present a guess as a measurement.',
        weightMethods: POSTABLE_WEIGHT_METHODS,
      });
    }
  }

  const order = await Order.findById(stop.orderId).lean();
  if (!order) return res.status(404).json({ success: false, error: 'That order no longer exists' });

  // ── WHAT GRADE IS THIS, ACTUALLY? ───────────────────────────────────────
  //
  // The declaration is read from the LISTING, which is where a farmer makes
  // it (models/CropListing.js grade.code). Read now rather than snapshotted at
  // order time on purpose: the claim being checked is the one the lot was
  // carrying when somebody looked at it. A listing that has been deleted, or
  // an order created without one (every test fixture, and every FPO lot order
  // built straight from stock) simply has no declaration — which is the
  // majority case anyway, since most listings carry no grade at all.
  const listing = order.listingId
    ? await CropListing.findById(order.listingId).select('grade cropName').lean()
    : null;
  const declaredGrade = listing?.grade?.code || null;

  // ── WHO IS ALLOWED TO PUT A LETTER ON THIS LOT ──────────────────────────
  //
  // ⚠️ THIS BRANCH IS THE WHOLE GRADING DECISION AND IT IS NOT A PERMISSIONS
  // DETAIL. An FPO's own driver, an accompanying grader, or the group's office
  // relaying them are FPO PEOPLE who handle this crop every season and whose
  // group's name is on the sale — grading there is a real advantage of
  // aggregating and it is honest. A captain from the public pool is a truck
  // driver: asking them to certify a grade is asking for a judgement they are
  // not qualified to make, about produce they will never see again, in a trade
  // where that letter carries a price premium.
  //
  // ⚠️ AND THE DEFAULT-TO-DECLARED IS SWITCHED OFF WITH IT, WHICH IS THE HALF
  // THAT IS EASY TO MISS. Defaulting `observed` to the declaration writes
  // `discrepancy: 'match'` onto the record — a CONFIRMATION. On a hired run
  // nobody confirmed anything, and printing "grade recorded at the gate:
  // matches" over a captain who was never asked would be the app inventing the
  // very check it is refusing to perform. The block stays null end to end and
  // the response says why in words. See data/gateRecord.js mayGradeAtGate().
  const canGrade = mayGradeAtGate(actor.role);

  if (!canGrade && Object.prototype.hasOwnProperty.call(body, 'observedGrade')
      && body.observedGrade != null)
    return res.status(409).json({
      success: false, code: 'GRADING_NOT_AVAILABLE',
      error: GRADING_REFUSED_NOTE,
      // What this recorder CAN attest to, named in the refusal so the answer
      // is not merely "no".
      conditionFlags: CONDITION_FLAG_KEYS,
    });

  // Defaults to the declaration. The common case is "it is what they said it
  // is", and making a recorder retype that would produce noise, not evidence.
  // An explicit null is honoured — a recorder who did not look should not be
  // recorded as having confirmed the declaration.
  let observedGrade = canGrade ? declaredGrade : null;
  if (canGrade && Object.prototype.hasOwnProperty.call(body, 'observedGrade')) {
    const g = body.observedGrade == null ? null : String(body.observedGrade).toUpperCase();
    if (g !== null && !['A', 'B', 'C'].includes(g))
      return res.status(400).json({
        success: false, code: 'BAD_GRADE',
        error: 'observedGrade must be A, B, C, or null if the lot was not graded at the gate.',
      });
    // Checked against the crop's OWN spec, exactly as a listing's grade is —
    // a spec that does not define a grade cannot have it observed either.
    if (g !== null && !isValidGrade(order.cropName, g))
      return res.status(400).json({
        success: false, code: 'BAD_GRADE',
        error: `Grade ${g} is not defined by the grading spec for ${order.cropName}.`,
      });
    observedGrade = g;
  }

  // ── WHAT THE LOT LOOKED LIKE — available to EVERY recorder ──────────────
  // Condition is not a weaker grade, it is a different kind of statement: one
  // that needs eyes and not expertise. A captain who cannot grade can still
  // say "this is not the crop on the order" or "it is wet and sprouting", and
  // that is the honest floor of what an independent driver can attest to.
  const cond = parseCondition(body);
  if (!cond.ok)
    return res.status(400).json({
      success: false, code: 'BAD_CONDITION',
      error: `Unknown condition flag: ${cond.unknown.join(', ')}. Condition is a fixed list.`,
      conditionFlags: CONDITION_FLAG_KEYS,
    });
  // Nothing was collected, so there was no lot at the gate to look at.
  const conditionBlock = outcome === 'not_collected'
    ? { checked: false, flags: [], note: '' }
    : { checked: cond.checked, flags: cond.flags, note: String(body.conditionNote || '').slice(0, 300) };
  // Nothing was collected, so nobody graded anything. A grade "observed" on a
  // farm that handed over nothing would be an opinion about produce that never
  // left the ground.
  if (outcome === 'not_collected') observedGrade = null;

  const gradeBlock = {
    declared: declaredGrade,
    observed: observedGrade,
    discrepancy: compareGrades(declaredGrade, observedGrade),
    farmerResponse: null,
    farmerResponseNote: '',
    farmerRespondedAt: null,
  };

  const now = new Date();
  const fareShare = order.fare?.total || 0;
  const pickupOutcomeRecord = {
    'pickupOutcome.outcome': outcome,
    'pickupOutcome.orderedKg': orderedKg,
    'pickupOutcome.collectedKg': kg,
    'pickupOutcome.reason': outcome === 'collected_full' ? null : reason,
    'pickupOutcome.note': String(note || '').slice(0, 500),
    'pickupOutcome.recordedAt': now,
    'pickupOutcome.recordedBy': uid,
    'pickupOutcome.recordedByRole': actor.role,
    // Where `collectedKg` came from, and what the lot actually looked like.
    // Written in the SAME $set as the quantity it describes, so the order can
    // never hold a weight without its provenance for even an instant.
    'pickupOutcome.weight.method': weightMethod,
    'pickupOutcome.weight.ref': weightRef,
    'pickupOutcome.grade.declared': gradeBlock.declared,
    'pickupOutcome.grade.observed': gradeBlock.observed,
    'pickupOutcome.grade.discrepancy': gradeBlock.discrepancy,
    // What anyone with eyes could say. Written in the same $set as the grade
    // it stands beside, so a record can never hold one without the other.
    'pickupOutcome.condition.checked': conditionBlock.checked,
    'pickupOutcome.condition.flags': conditionBlock.flags,
    'pickupOutcome.condition.note': conditionBlock.note,
  };

  // The order-side guard, per actor. The agent branch is unchanged, character
  // for character. The FPO-admin branch is just as tight: the order must
  // belong to THIS run and must have no agent on it, so an FPO admin can never
  // reach into a hired run's orders.
  const orderGuard = actor.role === 'agent'
    ? { agentUid: uid }
    : { consignmentId: c._id, agentUid: null };

  let updatedOrder;
  if (outcome === 'not_collected') {
    // Nothing left the farm. The order is CANCELLED — the existing enum value
    // is exactly right and no new state is needed: no crop moved, so no payout
    // is owing, `deliveredAt` is never set, and POST /api/orders/:id/settle
    // already refuses anything outside picked_up/delivered/stranded.
    // `status: accepted` in the filter is what makes this unrepeatable.
    updatedOrder = await cancelUncollectedOrder({
      order, orderGuard, uid, role: actor.role, orderedKg, reason, note, now,
    });
    if (!updatedOrder)
      return res.status(409).json({
        success: false, code: 'ALREADY_RECORDED',
        error: 'That stop has already been recorded.',
      });
  } else {
    // Verified against the ORDER's own pickup code — the codes never move onto
    // the consignment, so the agent cannot hold them all.
    const cropTotal = Math.round(kg * order.pricePerKg);
    updatedOrder = await Order.findOneAndUpdate(
      {
        _id: stop.orderId, ...orderGuard, status: 'accepted',
        pickupOtp: String(code || '').trim(),
      },
      {
        $set: {
          status: 'picked_up', pickedUpAt: now,
          // On a short pickup the farmer is owed for what actually left the
          // farm, never for what was ordered. `collection.orderedKg` keeps the
          // agreed figure so nothing is erased.
          quantityKg: kg,
          cropTotal,
          farmerPayout: cropTotal,
          grandTotal: cropTotal + fareShare,
          ...pickupOutcomeRecord,
        },
      },
      { new: true }
    );
    if (!updatedOrder)
      return res.status(400).json({
        success: false, code: 'WRONG_CODE',
        error: `Wrong code. Ask ${stop.farmerName} for their 4-digit pickup code.`,
      });
  }

  // Produce that never left the farm is still the farmer's, and still
  // sellable. Put it back on the market — otherwise a failed pickup quietly
  // destroys stock. Shared with the abandon path; see restockUncollected().
  await restockUncollected(order, orderedKg - kg);

  // The run's carried weight is what the stops REPORTED, never the plan. Rolled
  // up here and written in the SAME atomic $set as the stop itself, so the
  // document is never momentarily claiming a load it is not carrying. (One
  // captain drives one run — the partial unique index on `isActiveJob`
  // guarantees it — so there is no second stop being written concurrently.)
  const loaded = outcome !== 'not_collected';
  const carried = c.stops.reduce(
    (a, s) => a + (String(s.orderId) === String(stop.orderId) ? kg : (s.collectedKg || 0)), 0);

  let updated = await writeStopOutcome(c._id, stop._id, {
    'stops.$.outcome': outcome,
    'stops.$.collected': loaded,
    'stops.$.collectedAt': loaded ? now : null,
    'stops.$.collectedKg': kg,
    'stops.$.failureReason': outcome === 'collected_full' ? null : reason,
    'stops.$.outcomeNote': String(note || '').slice(0, 500),
    'stops.$.outcomeAt': now,
    'stops.$.outcomeBy': uid,
    'stops.$.outcomeByRole': actor.role,
    // The same two facts on the run's own copy. No `weighedBy`: `outcomeBy`
    // and `outcomeByRole` immediately above already name who established this.
    'stops.$.weight.method': weightMethod,
    'stops.$.weight.ref': weightRef,
    'stops.$.grade.declared': gradeBlock.declared,
    'stops.$.grade.observed': gradeBlock.observed,
    'stops.$.grade.discrepancy': gradeBlock.discrepancy,
    'stops.$.condition.checked': conditionBlock.checked,
    'stops.$.condition.flags': conditionBlock.flags,
    'stops.$.condition.note': conditionBlock.note,
    collectedQuantityKg: carried,
    status: 'collecting',
  });
  if (!updated)
    return res.status(409).json({
      success: false, code: 'ALREADY_RECORDED',
      error: 'That stop has already been recorded.',
    });

  // ── THE RUN LEAVES THE LAST FARM ────────────────────────────────────────
  //
  // Derived from the document that was just written, not from the read taken
  // before it: `updated` is authoritative about every stop, so this cannot
  // depend on whether two gates were recorded a moment apart. And the flip is
  // itself a guarded update with `NO_PENDING_STOPS_FILTER` in the FILTER —
  // never `if (allVisited) save()` — so a stop being recorded in the same
  // instant cannot slip a run into transit with a farm still to visit.
  //
  // The `carried > 0` half is deliberate: a vehicle that collected nothing
  // anywhere is not in transit, it is empty, and /deliver closes it as
  // `cancelled`. See the status enum in models/Consignment.js.
  const carriedNow = updated.stops.reduce((a, s) => a + (s.collectedKg ?? (s.collected ? s.quantityKg : 0)), 0);
  const allVisited = updated.stops.every((s) => s.collected || (s.outcome ?? 'pending') !== 'pending');
  if (allVisited && carriedNow > 0 && updated.status === 'collecting') {
    const departed = await Consignment.findOneAndUpdate(
      { _id: updated._id, status: 'collecting', ...NO_PENDING_STOPS_FILTER },
      { $set: { status: 'in_transit', inTransitAt: now } },
      { new: true }
    );
    if (departed) {
      updated = departed;
      console.log(
        `🛣️  Consignment ${updated._id} IN TRANSIT — every farm visited, ${carriedNow} kg aboard, `
        + 'heading for the buyer'
      );
    }
  }

  const visited = updated.stops.filter((s) => (s.outcome || 'pending') !== 'pending');
  const done = updated.stops.filter((s) => s.collected).length;
  const failed = updated.stops.filter((s) => s.outcome === 'not_collected').length;

  console.log(
    `📦 Consignment ${c._id}: ${stop.farmerName} → ${outcome}`
    + (outcome === 'collected_full' ? '' : ` (${kg}/${orderedKg} kg, ${reason})`)
    + ` — ${visited.length}/${updated.stops.length} farms visited, ${carried} kg aboard`
  );

  res.json({
    success: true,
    consignment: updated,
    stop: updated.stops.find((s) => String(s._id) === String(stop._id)),
    order: updatedOrder,
    outcome,
    collected: done,
    failed,
    // Farms still to visit — NOT "farms still to collect from". A stop that
    // failed has been visited and is not coming back.
    remaining: updated.stops.length - visited.length,
    collectedQuantityKg: carried,
    plannedQuantityKg: updated.totalQuantityKg,
    shortfallKg: updated.totalQuantityKg - carried,
    // ── THE KILOGRAMS, WITH THEIR PROVENANCE ATTACHED ──────────────────
    // Returned as one object so a screen printing "512 kg" has the method in
    // the same hand as the number and cannot render one without the other.
    weight: describeWeight(weightMethod, weightRef, kg),
    // The run so far, not just this stop: four weighed farms and one
    // eyeballed one is not honestly described by a single flag.
    runWeight: summariseWeights(updated.stops),
    // What the lot looked like against what was claimed for it. `priceChanged`
    // is hard false inside describeGradeCheck() — a discrepancy is a record,
    // and this app does not reprice a farmer's crop on a driver's opinion.
    grade: describeGradeCheck(gradeBlock),
    // ⚠️ WHETHER A GRADE WAS EVEN ASKED FOR, said in the response rather than
    // left for a screen to infer from a null. On a hired run the answer is no
    // and `gradingNote` says why — a captain from the public pool is a truck
    // driver, not a grader. Without this a caller cannot tell "graded, matched"
    // from "nobody was asked", which is exactly the confusion the refusal
    // exists to prevent.
    gradingAvailable: canGrade,
    gradingNote: canGrade ? null : GRADING_REFUSED_NOTE,
    // What anyone with eyes could say, which is what a captain CAN attest to.
    // `checked: false` and `checked: true` with no flags stay different facts
    // all the way to the screen — see describeCondition().
    condition: describeCondition(conditionBlock),
    // Who keyed this in, and under which rule — 'agent' is a captain who stood
    // at the gate, 'fpo_driver' is the group's own assigned driver standing at
    // the same gate on their own phone, 'fpo_admin' is the office recording
    // what that driver reported down a phone line. A farmer disputing a failed
    // stop needs to know which of the three they are arguing with.
    recordedByRole: actor.role,
    // The run's trip-level state AFTER this stop. It flips itself to
    // `in_transit` when this was the last farm and something is aboard — there
    // is no call to make and nothing for a driver to remember.
    runStatus: updated.status,
    inTransit: updated.status === 'in_transit',
    inTransitAt: updated.inTransitAt || null,
    fareSplit: { policy: FARE_SPLIT_POLICY, note: FARE_SPLIT_NOTE },
  });
}

/**
 * POST /api/consignments/:id/collect — one stop, gated on THAT farmer's code.
 * body: { orderId, otp }
 *
 * The per-stop OTP is the whole point. A single code for the run would let the
 * driver collect it at the first gate and take everything else unchallenged,
 * and would let farmer one release farmer three's crop.
 *
 * Kept as the happy path — "everything that was ordered went on the vehicle" —
 * so every existing caller keeps working. It is the same handler as
 * /stop-outcome with the outcome fixed.
 *
 * ⚠️ THE ONE PLACE WEIGHT PROVENANCE IS NOT DEMANDED, AND IT IS NOT SILENT.
 *   This route predates the weight block and its existing callers send only
 *   `{ orderId, otp }`. Rejecting them would break a working screen to enforce
 *   a field it cannot yet send. So a /collect with no `weightMethod` records
 *   `not_recorded` — a real, distinct value that every surface prints as "no
 *   weighing method was recorded", never as an estimate somebody made. It may
 *   still SEND `weightMethod` and `observedGrade`, and should.
 *
 *   /stop-outcome, which is the route a gate form actually posts to, requires
 *   it unconditionally — including for `collected_full`.
 */
router.post('/:id/collect', requireAuth, requireRole('agent', 'farmer', 'fpo'), async (req, res) => {
  try {
    await recordStopOutcome(
      req, res, { ...req.body, outcome: 'collected_full' }, { legacyWeight: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/consignments/:id/stop-outcome — the captain records what actually
 * happened at one farm.
 *
 * body: {
 *   orderId,                                   which stop
 *   outcome,   'collected_full' | 'collected_short' | 'not_collected'
 *   otp,       required for both collected_* outcomes — the farmer's own code
 *   collectedKg,  required for collected_short: 0 < collectedKg < ordered
 *   reason,    required unless collected_full:
 *              farmer_absent | quantity_not_ready | produce_rejected | other
 *   note,      optional, ≤500 chars — alongside the reason, never instead of it
 *   weightMethod, REQUIRED whenever produce moved (both collected_* outcomes):
 *              collection_centre_scale | public_weighbridge | farm_scale |
 *              estimated. "estimated" is an honest answer and is expected to
 *              be the common one — see data/gateRecord.js.
 *   weightRef, optional, ≤60 chars — the weighbridge ticket or slip number
 *   observedGrade, optional — A | B | C | null. DEFAULTS to whatever the
 *              farmer declared on the listing, so the common "it is what they
 *              said it is" case needs no input. A difference is RECORDED and
 *              changes no price; see models/Consignment.js stops[].grade.
 * }
 *
 * WHO MAY CALL IT: the assigned captain on a hired run, or the FPO admin on a
 * run their group is driving itself. `requireRole('agent', 'farmer', 'fpo')` is
 * only
 * the outer gate — resolveRunActor() is what actually decides, and an
 * unrelated farmer gets 403 there. See resolveRunActor().
 */
router.post('/:id/stop-outcome', requireAuth, requireRole('agent', 'farmer', 'fpo'), async (req, res) => {
  try {
    await recordStopOutcome(req, res, req.body || {});
  } catch (err) {
    console.error('❌ Stop outcome error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/consignments/:id/stop-grade-response — the FARMER answers a grade
 * recorded against their own lot.
 * body: { orderId, response: 'accepted' | 'contested', note? }
 *
 * ═══ WHY THIS ROUTE HAS TO EXIST ═══════════════════════════════════════════
 *
 * A driver tapping "Grade C" on a lot the farmer declared as Grade A is a
 * CLAIM. This app's settled rule — written into services/trustService.js and
 * into the dispute engine before it — is that a complaint raised is not a
 * complaint upheld: an unresolved accusation is reported, never acted on, or
 * else anyone can damage anyone by making one.
 *
 * Without a way for the farmer to answer, a gate downgrade would be an
 * accusation with no defence attached, made by the person whose own job is
 * being judged at the same moment, about produce the farmer can no longer
 * show anybody. Feeding that straight into a reputation would be strictly
 * worse than the self-declared grade it was meant to police.
 *
 * So the farmer answers, on their own account, about their own lot:
 *   accepted  — "yes, it was the lower grade". A CONCESSION, and the only
 *               form of this record services/trustService.js will look at. It
 *               is the same evidence class as agreeing a refund on a dispute.
 *   contested — "no, it was not". Costs the farmer nothing. The claim stays on
 *               the record as the recorder's claim, visible to the buyer, and
 *               the money is settled through the grievance flow like any other
 *               two-party disagreement.
 *
 * WHAT IT STILL DOES NOT DO: change a price. Accepting a downgrade does not
 * reduce the payout, and contesting one does not protect it. The payable
 * already follows actually-collected kilograms; grade is a fact the two
 * parties argue about, and this app does not arbitrate.
 *
 * Answerable ONLY on a `downgrade`. A match is nothing to answer, an upgrade
 * costs the farmer nothing, and `observed_only` had no declaration to fall
 * short of.
 */
router.post('/:id/stop-grade-response', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const uid = req.firebaseUid;
    const { orderId, response, note } = req.body || {};

    if (!GRADE_RESPONSES.includes(response))
      return res.status(400).json({
        success: false, code: 'BAD_RESPONSE',
        error: `response must be one of: ${GRADE_RESPONSES.join(', ')}`,
      });

    const c = await Consignment.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ success: false, error: 'Run not found' });

    const stop = findStop(c, { stopId: req.body?.stopId, orderId });
    // A farmer is told nothing about a run they are not on, and nothing about
    // another farm's lot — the same rule GET /:id already applies to names,
    // phone numbers and weights.
    if (!stop || stop.farmerUid !== uid)
      return res.status(404).json({ success: false, error: 'That farm is not on this run, or is not yours' });

    if (stop.grade?.discrepancy !== 'downgrade')
      return res.status(409).json({
        success: false, code: 'NOTHING_TO_ANSWER',
        error: 'No lower grade was recorded against this lot, so there is nothing to accept or contest.',
      });

    const now = new Date();
    const trimmed = String(note || '').slice(0, 300);

    // Guarded on the response never having been given — same discipline as
    // the stop outcome itself. An answer is a statement of position and is
    // not re-openable; a farmer who changes their mind raises a grievance,
    // exactly as a dispute cannot be un-resolved.
    const updated = await Consignment.findOneAndUpdate(
      {
        _id: c._id,
        stops: {
          $elemMatch: {
            orderId: stop.orderId, farmerUid: uid,
            'grade.discrepancy': 'downgrade',
            'grade.farmerResponse': { $in: [null] },
          },
        },
      },
      {
        $set: {
          'stops.$.grade.farmerResponse': response,
          'stops.$.grade.farmerResponseNote': trimmed,
          'stops.$.grade.farmerRespondedAt': now,
        },
      },
      { new: true }
    );
    if (!updated)
      return res.status(409).json({
        success: false, code: 'ALREADY_ANSWERED',
        error: 'You have already answered the grade recorded against this lot.',
      });

    // The order side, guarded the same way. It carries the trade's copy —
    // the one a receipt, a grievance and services/trustService.js all read.
    const order = await Order.findOneAndUpdate(
      {
        _id: stop.orderId, farmerUid: uid,
        'pickupOutcome.grade.discrepancy': 'downgrade',
        'pickupOutcome.grade.farmerResponse': { $in: [null] },
      },
      {
        $set: {
          'pickupOutcome.grade.farmerResponse': response,
          'pickupOutcome.grade.farmerResponseNote': trimmed,
          'pickupOutcome.grade.farmerRespondedAt': now,
        },
      },
      { new: true }
    );

    const answered = updated.stops.find((s) => String(s._id) === String(stop._id));
    console.log(
      `🏷️  Consignment ${c._id}: ${stop.farmerName} ${response} the gate grade `
      + `(declared ${answered.grade.declared} → observed ${answered.grade.observed})`
    );

    res.json({
      success: true,
      grade: describeGradeCheck(answered.grade),
      // Stated in the response itself so a screen cannot imply otherwise.
      pricePerKg: order?.pricePerKg ?? null,
      farmerPayout: order?.farmerPayout ?? null,
      priceChanged: false,
      note: response === 'accepted'
        ? 'Recorded as agreed. Your payout for this order is unchanged — accepting a grade does not '
          + 'reprice a sale. It does count as a concession on your record, the same way agreeing a '
          + 'refund on a grievance does.'
        : 'Recorded as disputed. It stays on the record as the collector\'s claim and does not count '
          + 'against you. If money is owed either way, raise a grievance against this order.',
    });
  } catch (err) {
    console.error('❌ Stop grade response error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GETTING OUT OF A RUN THAT HAS STOPPED MOVING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE HOLE THIS FILLS
 *   Once a captain accepted, the only exits were delivering or the
 *   all-stops-failed close. There was no cancel, no abandon, no release, no
 *   reassign and no timeout. A captain who broke down, quit, or simply stopped
 *   answering after two of five pickups left the run in `collecting`
 *   PERMANENTLY: two farmers' produce on a truck nobody could reach, no other
 *   captain able to take the run, and those farmers' orders unable to settle or
 *   to be disputed out. A run this app cannot finish is worse than one it never
 *   offered — the same sentence resolveRunActor() was written under.
 *
 * TWO ROUTES, BECAUSE THEY ARE TWO DIFFERENT SITUATIONS
 *
 *   /release — CLEAN. Not one farm gate has been recorded, so nothing has
 *              moved. The run goes back to the pool and the captain is freed.
 *              Cheap and blameless: no order changes, no crop is touched, no
 *              farmer is harmed, and the next captain picks it up unchanged.
 *
 *   /abandon — MESSY. Produce is already aboard. This CANNOT be reassigned: a
 *              new captain cannot collect what is on someone else's vehicle,
 *              and sending one to farms that have already handed over would be
 *              worse than doing nothing. So the run ends, and its two halves
 *              are handled differently and honestly:
 *
 *                uncollected stops → exactly what a `not_collected` stop
 *                  already does (cancelUncollectedOrder + restockUncollected,
 *                  the same functions, not a copy): the order is cancelled, the
 *                  kilograms go back on the listing, the fare share stays put.
 *
 *                already-collected stops → `Order.status: 'stranded'`. NOT
 *                  delivered, because nothing arrived. NOT cancelled, because
 *                  real crop left a real farm and is owed for. See the long
 *                  note on the status enum in models/Order.js for why
 *                  `picked_up` was checked first and rejected.
 *
 *              The RUN ends `abandoned`, which is a different fact from
 *              `cancelled` — see models/Consignment.js.
 *
 * WHY /abandon IS REFUSED WHEN /release WOULD WORK
 *   Abandoning cancels every uncollected farmer's order. On a run where nothing
 *   has been collected that is pure damage: releasing it costs those farmers
 *   nothing and gets them a different captain. So abandon refuses in exactly
 *   the case release is available, and names it.
 */

/**
 * POST /api/consignments/:id/release — hand a clean run back to the pool.
 * body: { reason?, note? }
 *
 * WHO: the assigned captain, the buyer who booked the run, or the admin of the
 * group it belongs to. See resolveClosureActor() — a captain who has vanished
 * cannot call anything, which is the whole reason the other two are here.
 */
router.post('/:id/release', requireAuth, requireRole('agent', 'farmer', 'vendor', 'fpo'), async (req, res) => {
  try {
    const c = await Consignment.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ success: false, error: 'Run not found' });

    const actor = await resolveClosureActor(c, req.firebaseUid, req.profile?.role);
    if (actor.error || actor.status)
      return res.status(actor.status).json({ success: false, code: actor.code, error: actor.error });

    if ((c.transportMode || 'hired') !== 'hired')
      return res.status(409).json({
        success: false, code: 'NOT_DISPATCHED',
        error: 'This run is driven by the FPO itself, so there is no captain pool to hand it back to. '
          + 'If it cannot go ahead, abandon it instead.',
      });
    if (!c.agentUid)
      return res.status(409).json({
        success: false, code: 'NO_DRIVER',
        error: 'No captain is holding this run, so there is nothing to hand back.',
      });
    if (['delivered', 'cancelled', 'abandoned'].includes(c.status))
      return res.status(409).json({
        success: false, code: 'RUN_CLOSED',
        error: `This run is already ${c.status}.`,
      });
    // The honest refusal, and the one that matters. Once ANY farm has been
    // recorded the run cannot go back to the pool — see the block above.
    if (anyStopRecorded(c))
      return res.status(409).json({
        success: false, code: 'PRODUCE_ABOARD',
        error: 'This run has already been to a farm gate, so it cannot go back to the pool — a new '
          + 'captain cannot collect what is already on this vehicle. Abandon it instead.',
      });

    const released = await releaseRun(c, {
      by: req.firebaseUid, byRole: actor.role,
      reason: req.body?.reason, note: req.body?.note,
    });
    if (!released)
      return res.status(409).json({
        success: false, code: 'PRODUCE_ABOARD',
        error: 'A farm gate was recorded on this run just now, so it can no longer be handed back.',
      });

    console.log(`↩️  Consignment ${released._id} released back to the pool by ${actor.role}`);
    res.json({
      success: true,
      consignment: released,
      releasedBy: actor.role,
      code: 'RELEASED',
      note: 'Nothing had been collected, so nothing was undone. The run is back in the captain pool '
        + 'and every farmer is waiting for a driver again.',
    });
  } catch (err) {
    console.error('❌ Release error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/consignments/:id/abandon — end a run that cannot continue, with
 * produce already aboard.
 * body: { reason (required, one of ABANDON_REASONS), note? }
 *
 * TERMINAL AND NOT REASSIGNABLE. See the block above for why, and for what
 * happens to each half of the run.
 */
router.post('/:id/abandon', requireAuth, requireRole('agent', 'farmer', 'vendor', 'fpo'), async (req, res) => {
  try {
    const uid = req.firebaseUid;
    const c = await Consignment.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ success: false, error: 'Run not found' });

    const actor = await resolveClosureActor(c, uid, req.profile?.role);
    if (actor.error || actor.status)
      return res.status(actor.status).json({ success: false, code: actor.code, error: actor.error });

    const reason = req.body?.reason;
    if (!ABANDON_REASONS.includes(reason))
      return res.status(400).json({
        success: false, code: 'REASON_REQUIRED',
        error: `reason is required and must be one of: ${ABANDON_REASONS.join(', ')}`,
      });

    // `in_transit` is abandonable and must be: a vehicle that has finished
    // collecting and broken down on the highway is carrying five farmers'
    // produce, which is the exact situation `stranded` was created for.
    if (!LIVE_RUN_STATUSES.includes(c.status))
      return res.status(409).json({
        success: false, code: 'RUN_CLOSED',
        error: `This run is already ${c.status} — it cannot be abandoned.`,
      });

    // Refused in exactly the case /release covers, and it says so. Abandoning
    // an untouched run would cancel every farmer's order for nothing.
    if ((c.transportMode || 'hired') === 'hired' && c.agentUid && !anyStopRecorded(c))
      return res.status(409).json({
        success: false, code: 'USE_RELEASE',
        error: 'Nothing has been collected on this run, so it does not need abandoning — release it '
          + 'and it goes back to the pool with no farmer losing their sale.',
      });

    const now = new Date();
    const note = String(req.body?.note || '').slice(0, 500);

    // CLAIM FIRST. The status flip is the serialisation point: two simultaneous
    // abandons, or an abandon racing the captain's own stop outcome, cannot
    // both get past it — /stop-outcome and /deliver both require a status this
    // update removes. Only then are the orders compensated, in the same
    // write-the-risky-part-first, compensate-on-failure style routes/orders.js
    // and the FPO lot confirm already use (no transaction; see CLAUDE.md).
    const run = await Consignment.findOneAndUpdate(
      { _id: c._id, status: { $in: LIVE_RUN_STATUSES } },
      {
        $set: {
          status: 'abandoned',
          abandonedAt: now,
          'abandonment.at': now,
          'abandonment.by': uid,
          'abandonment.byRole': actor.role,
          'abandonment.agentUid': c.agentUid || null,
          'abandonment.reason': reason,
          'abandonment.note': note,
        },
        $unset: { isActiveJob: '' },
      },
      { new: true }
    );
    if (!run)
      return res.status(409).json({ success: false, code: 'RUN_CLOSED', error: 'This run is already closed.' });

    // ── the half that never gave anything ────────────────────────────────
    const cancelled = [];
    for (const stop of untouchedStops(run)) {
      const order = await Order.findById(stop.orderId).lean();
      if (!order) continue;
      const updated = await cancelUncollectedOrder({
        order,
        // A captain may only touch orders that are theirs. The buyer and the
        // FPO admin are scoped to THIS run instead — deliberately NOT the
        // stop-outcome path's extra `agentUid: null`, because the whole reason
        // they are here is a hired run whose captain has gone, and every order
        // on such a run carries that captain's uid.
        orderGuard: actor.role === 'agent' ? { agentUid: uid } : { consignmentId: run._id },
        uid, role: actor.role,
        orderedKg: stop.quantityKg,
        reason: ABANDONED_STOP_REASON,
        note: note || `The run was abandoned (${reason}) before reaching this farm.`,
        now,
      });
      if (!updated) continue;                   // a stop outcome landed first
      await restockUncollected(order, stop.quantityKg);
      await writeStopOutcome(run._id, stop._id, {
        'stops.$.outcome': 'not_collected',
        'stops.$.collected': false,
        'stops.$.collectedAt': null,
        'stops.$.collectedKg': 0,
        'stops.$.failureReason': ABANDONED_STOP_REASON,
        'stops.$.outcomeNote': note || `Run abandoned (${reason}) — nobody reached this farm.`,
        'stops.$.outcomeAt': now,
        'stops.$.outcomeBy': uid,
        'stops.$.outcomeByRole': actor.role,
      });
      cancelled.push(updated._id);
    }

    // ── the half whose crop is on the vehicle ────────────────────────────
    const stranded = [];
    let strandedKg = 0;
    for (const stop of collectedStops(run)) {
      const updated = await Order.findOneAndUpdate(
        { _id: stop.orderId, consignmentId: run._id, status: 'picked_up' },
        {
          $set: {
            status: 'stranded',
            strandedAt: now, strandedBy: uid, strandedReason: reason,
          },
          $unset: { isActiveJob: '' },
        },
        { new: true }
      );
      if (!updated) continue;
      stranded.push(updated._id);
      strandedKg += stop.collectedKg ?? stop.quantityKg;
    }

    const closed = await Consignment.findOneAndUpdate(
      { _id: run._id },
      {
        $set: {
          'abandonment.strandedOrderIds': stranded,
          'abandonment.cancelledOrderIds': cancelled,
          'abandonment.strandedKg': strandedKg,
          collectedQuantityKg: strandedKg,
        },
      },
      { new: true }
    );

    console.log(
      `🛑 Consignment ${run._id} ABANDONED by ${actor.role} (${reason}) — `
      + `${stranded.length} farm(s) stranded with ${strandedKg} kg aboard, ${cancelled.length} cancelled`
    );

    res.json({
      success: true,
      consignment: closed,
      code: 'ABANDONED',
      abandonedBy: actor.role,
      reason,
      // Said out loud, not merely stored. A caller has to be able to render the
      // two halves as the different things they are.
      stranded: {
        orderIds: stranded,
        count: stranded.length,
        quantityKg: strandedKg,
        note: stranded.length
          ? 'These farmers handed over real produce that never reached the buyer. Their orders are '
            + 'NOT delivered and NOT cancelled — they are owed for what left their farm, and this '
            + 'needs a human to settle.'
          : 'No produce was aboard.',
      },
      cancelled: {
        orderIds: cancelled,
        count: cancelled.length,
        note: 'Nobody reached these farms, so their orders are cancelled and every kilogram is back '
          + 'on the listing. The fare share stays on the cancelled order, unchanged — see the fare '
          + 'split policy.',
      },
      fareSplit: { policy: FARE_SPLIT_POLICY, note: FARE_SPLIT_NOTE },
    });
  } catch (err) {
    console.error('❌ Abandon error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/consignments/:id/deliver — gated on the buyer's code, and on
 * having actually VISITED every farm.
 *
 * "Visited", not "collected from". A stop that reported `not_collected` has
 * been visited and is not coming back — holding the whole run hostage to it
 * would strand the crop the captain IS carrying at the roadside, and would
 * leave the driver permanently on an active job.
 */
/**
 * A COLLECTION RUN ARRIVING: MOVE THE STOCK'S PICKUP POINT TO THE GODOWN.
 *
 * ⚠️ WITHOUT THIS THE APP SENDS A REAL VEHICLE TO THE WRONG PLACE. A buyer's
 * run is routed to `CropListing.location`. Once a member's crop has been
 * carried to the group's premises, a listing still naming the farm quotes a
 * distance to the wrong point, bills a by-weight fare share computed from it,
 * and sends a tempo to a field where the crop is no longer standing.
 *
 * ⚠️ `location` AND `geo` MOVE TOGETHER OR THEY SILENTLY DISAGREE. `geo` is
 * what every radius query reads and `location` is what the rest of the app
 * reads; writing one without the other leaves the lot findable at its OLD
 * position by the market feed and shown at its new one everywhere else, with
 * no error. That exact defect is already recorded in CLAUDE.md for User.geo.
 * ⚠️ And `geo.coordinates` is [lng, lat] — the reverse of everywhere else.
 *
 * ⚠️ ONLY WHAT ACTUALLY ARRIVED MOVES. A short pickup means part of the lot is
 * at the godown and part is still on the farm, and one document cannot be in
 * two places: the source listing is decremented by the collected weight and a
 * SEPARATE listing is created at the premises for it. Moving the whole listing
 * on a short pickup would assert that produce still standing in a field is
 * sitting in a shed.
 *
 * ⚠️ OWNERSHIP DOES NOT MOVE. `farmerUid`, `pricePerKg` and `grade` are copied
 * across unchanged — the FPO is HOLDING the member's produce, not buying it.
 * Rewriting the owner here would silently turn every collection into a
 * procurement sale.
 */
/**
 * Move `kg` of one listing into `fpo`'s custody: decrement the source,
 * create a held listing at the group's premises. This is the ONE place a
 * CropListing physically moves from a farm to a godown, whatever brought it
 * there — extracted out of the run-based `transferCollectedStock()` below so
 * F1's walk-in intake (no vehicle, no run, no fareShare) can do the exact
 * same custody transfer rather than a second copy of it.
 *
 * @param source            lean CropListing doc, already fetched
 * @param fpo               lean Fpo doc with `premises.declared`
 * @param kg                how much actually moved
 * @param freightOwedPerKg  0 for a walk-in (nothing was hired to move it) or
 *                          procurement mode; a run's by-weight fareShare
 *                          otherwise — see the caller for the reasoning
 * @param collectionRunId   the Consignment this came from, or null for a
 *                          walk-in — `custody.collectionRunId` stays honestly
 *                          null rather than pointing at a run that never ran
 * @param intake            optional { recordedBy, weight, grade, condition } —
 *                          set only by a walk-in; a run's OWN per-stop record
 *                          already lives on the Consignment and the Order
 * @returns { ok: true, heldListingId } or { ok: false, reason }
 */
async function moveListingToFpoCustody(source, fpo, { kg, freightOwedPerKg, collectionRunId, intake }) {
  // Guarded in the FILTER on there being enough left, so two callers can
  // never both draw the same stock down.
  const decremented = await CropListing.findOneAndUpdate(
    { _id: source._id, quantityAvailableKg: { $gte: kg } },
    { $inc: { quantityAvailableKg: -kg } },
    { new: true }
  ).lean();
  if (!decremented) return { ok: false, reason: 'stock_moved' };

  const held = await CropListing.create({
    // ⚠️ `cropId` IS REQUIRED AND IS CARRIED OVER, NOT MINTED. It ties the
    // lot back to the Crop the farmer actually grew — the agronomic record,
    // the harvest, the yield. Carrying produce to a shed does not make it a
    // different crop, and a fresh id here would orphan the held stock from
    // the farmer's own history. (`location.city` is required too, which is
    // why the godown label falls back to the FPO's name rather than '' —
    // caught by running this, not by reading it.)
    cropId: source.cropId,
    landId: source.landId,
    plotId: source.plotId,
    farmerUid: source.farmerUid,
    farmerName: source.farmerName,
    farmerPhone: source.farmerPhone,
    cropName: source.cropName,
    cropLocalName: source.cropLocalName,
    grade: source.grade,
    gradeNote: source.gradeNote,
    quantityKg: kg,
    quantityAvailableKg: kg,
    minOrderKg: Math.min(source.minOrderKg || 0, kg),
    // The member's own asking price rides across untouched. The group is
    // holding the produce, not repricing it.
    pricePerKg: source.pricePerKg,
    proofImageId: source.proofImageId,
    status: 'available',
    dataSource: source.dataSource,
    location: {
      lat: fpo.premises.lat,
      lng: fpo.premises.lng,
      // Required field — never allowed to fall through to ''.
      city: fpo.premises.label || fpo.name || 'FPO collection point',
      district: fpo.premises.district || fpo.district || '',
    },
    // [lng, lat]. GeoJSON demands longitude first; getting it backwards puts
    // the lot off the coast of Somalia, silently, with no error.
    geo: { type: 'Point', coordinates: [fpo.premises.lng, fpo.premises.lat] },
    custody: {
      heldAt: 'fpo',
      fpoId: fpo._id,
      collectionRunId: collectionRunId || null,
      collectedAt: new Date(),
      originLabel: source.location?.city || '',
      originDistrict: source.location?.district || '',
      freightOwedPerKg,
      ...(intake ? { intake } : {}),
    },
  });

  // A source listing drawn down to nothing leaves the market, exactly as a
  // sold-out one does.
  if (decremented.quantityAvailableKg === 0) {
    await CropListing.updateOne({ _id: decremented._id, quantityAvailableKg: 0 }, { $set: { status: 'sold_out' } });
  }
  return { ok: true, heldListingId: String(held._id) };
}

async function transferCollectedStock(run) {
  const moved = [];
  const Fpo = require('../models/Fpo');
  const fpo = run.fpoId ? await Fpo.findById(run.fpoId).lean() : null;
  if (!fpo?.premises?.declared) return { moved, error: 'NO_PREMISES' };

  for (const stop of run.stops || []) {
    const kg = stop.collectedKg ?? (stop.collected ? stop.quantityKg : 0);
    if (!kg || !stop.listingId) continue;

    const source = await CropListing.findById(stop.listingId).lean();
    if (!source) { moved.push({ listingId: stop.listingId, ok: false, reason: 'stock_moved' }); continue; }

    // ── PHASE 3, L1: WHO OWES THE FREIGHT THAT JUST GOT THIS LOT HERE ────
    //
    // Decided ONCE, now, from the group's CURRENT paymentMode — never
    // re-derived at sale time, so a later mode change cannot rewrite what a
    // farmer already owes on stock already sitting in the shed.
    //
    //   procurement  → 0. The FPO is about to buy this crop outright at an
    //                  agreed rate; moving its own future property is its own
    //                  cost, not a deduction from what the farmer is owed.
    //   facilitation → the farmer's FIXED by-weight fareShare (frozen on
    //                  planned weight, same rule as a buyer's pooled run — see
    //                  splitFare()), spread over however much of it actually
    //                  reached the godown. The app has no rail that charges a
    //                  farmer directly, so this is a deduction applied later,
    //                  at whatever sale eventually pays for these kilograms.
    const freightOwedPerKg = fpo.paymentMode === 'procurement' || !stop.fareShare
      ? 0
      : Math.round((stop.fareShare / kg) * 100) / 100;

    const result = await moveListingToFpoCustody(source, fpo, {
      kg, freightOwedPerKg, collectionRunId: run._id,
    });
    moved.push(result.ok
      ? { listingId: String(source._id), heldListingId: result.heldListingId, kg, ok: true }
      : { listingId: stop.listingId, ok: false, reason: result.reason });
  }
  return { moved, error: null };
}

router.post('/:id/deliver', requireAuth, requireRole('agent', 'farmer', 'fpo'), async (req, res) => {
  try {
    const existing = await Consignment.findOne({ _id: req.params.id }).lean();
    if (!existing) return res.status(404).json({ success: false, error: 'Run not found' });

    // A CLOSED RUN CANNOT BE DELIVERED, and it is told so plainly. Without this
    // an abandoned run fell through to the guarded update below, missed on
    // `status: 'collecting'`, and came back as "Wrong code" — telling a captain
    // to go and ask the buyer for a code that would never have worked.
    if (['delivered', 'cancelled', 'abandoned'].includes(existing.status))
      return res.status(409).json({
        success: false, code: 'RUN_CLOSED',
        error: existing.status === 'abandoned'
          ? 'This run was abandoned. It cannot be delivered — the produce that was aboard is recorded '
            + 'against each farmer as stranded and needs settling with them directly.'
          : `This run is already ${existing.status}.`,
      });

    // Same rule as a stop outcome, and for the same reason: leaving delivery
    // agent-only would have made an own/contracted run recordable stop by stop
    // and then unfinishable at the gate of the mandi. See resolveRunActor().
    const actor = await resolveRunActor(existing, req.firebaseUid, req.profile?.role);
    if (actor.error)
      return res.status(actor.status).json({ success: false, code: actor.code, error: actor.error });
    // The agent path keeps its own uid in the guarded filters below; the
    // FPO-admin path guards on the run having no agent instead.
    const runGuard = actor.role === 'agent'
      ? { agentUid: req.firebaseUid }
      : { agentUid: null, fpoId: existing.fpoId };

    // `?? 'pending'` because a stop written before per-stop outcomes existed
    // has no `outcome` field at all under .lean(); its `collected` flag is the
    // only thing that can be read.
    const missed = existing.stops.filter((s) => !s.collected && (s.outcome ?? 'pending') === 'pending');
    if (missed.length)
      return res.status(409).json({
        success: false, code: 'STOPS_REMAINING',
        error: `${missed.length} farm(s) still to collect from: ${missed.map((s) => s.farmerName).join(', ')}`,
      });

    const carried = existing.stops.reduce((a, s) => a + (s.collectedKg ?? (s.collected ? s.quantityKg : 0)), 0);

    // NOTHING WAS COLLECTED ANYWHERE. There is no handover, so there is no
    // delivery code to ask for — no buyer reads a code out for an empty
    // vehicle. The run is closed as `cancelled` rather than left open, so the
    // captain is not stuck on a job that can never complete. Every order was
    // already cancelled as its stop was recorded.
    if (carried === 0) {
      const dead = await Consignment.findOneAndUpdate(
        { _id: req.params.id, ...runGuard, status: { $in: LIVE_RUN_STATUSES } },
        {
          $set: { status: 'cancelled', cancelledAt: new Date(), collectedQuantityKg: 0 },
          $unset: { isActiveJob: '' },
        },
        { new: true }
      );
      if (!dead) return res.status(409).json({ success: false, error: 'This run is already closed.' });
      console.log(`🚫 Consignment ${dead._id} closed empty — every farm failed`);
      return res.json({
        success: true, consignment: dead, collectedQuantityKg: 0,
        plannedQuantityKg: dead.totalQuantityKg,
        code: 'NOTHING_COLLECTED',
        note: 'No farm on this run handed over any produce, so there was nothing to deliver. '
          + 'Every order has been cancelled with its stated reason and no farmer is recorded as owed.',
      });
    }

    // `in_transit` is where a healthy loaded run WILL be by the time it gets
    // here — the last stop outcome puts it there by itself. `collecting` stays
    // in the filter for runs written before the transit state existed, whose
    // stops are all recorded but which never passed through the flip.
    const c = await Consignment.findOneAndUpdate(
      {
        _id: req.params.id, ...runGuard,
        status: { $in: ['collecting', 'in_transit'] },
        dropOtp: String(req.body.otp || '').trim(),
      },
      {
        $set: { status: 'delivered', deliveredAt: new Date(), collectedQuantityKg: carried },
        $unset: { isActiveJob: '' },
      },
      { new: true }
    );
    if (!c)
      return res.status(400).json({ success: false, error: 'Wrong code. Ask the buyer for the 4-digit delivery code.' });

    // Guarded on `picked_up` in the FILTER, which is what keeps a failed stop
    // out of this: its order is `cancelled` and can never be swept up into a
    // delivery it had no part in.
    //
    // On a COLLECTION run `orderIds` is empty, so this is a no-op — nothing
    // has been sold and there is no order to complete. What arriving means
    // there is that the produce is now at the group's godown, which is the
    // custody transfer below.
    await Order.updateMany(
      { _id: { $in: c.orderIds }, status: 'picked_up' },
      { $set: { status: 'delivered', deliveredAt: new Date(), 'payment.status': 'collected' }, $unset: { isActiveJob: '' } }
    );

    let custody = null;
    if (c.purpose === 'fpo_collection') {
      // Its own try/catch: the run HAS been delivered — the vehicle arrived
      // and the code was right — and that fact must not be rolled back
      // because a listing write failed. The failure is reported so it can be
      // put right, never swallowed into a success that looks complete.
      try {
        custody = await transferCollectedStock(c);
      } catch (e) {
        console.error('⚠️ custody transfer failed for run', String(c._id), e.message);
        custody = { moved: [], error: 'TRANSFER_FAILED' };
      }
    }

    const failed = c.stops.filter((s) => s.outcome === 'not_collected');
    const short = c.stops.filter((s) => s.outcome === 'collected_short');
    console.log(
      `🎉 Consignment ${c._id} delivered — ${c.stops.length} farms, ${carried}/${c.totalQuantityKg} kg, ₹${c.fare.total} shared`
      + (failed.length || short.length ? ` (${failed.length} failed, ${short.length} short)` : '')
    );
    res.json({
      success: true,
      consignment: c,
      // Present only on a collection run. Reports each lot that moved to the
      // godown, and names any that could not — a silent partial transfer
      // would leave stock listed at a farm it has left.
      custody,
      // The run's delivered total is what ARRIVED, never what was planned.
      collectedQuantityKg: carried,
      plannedQuantityKg: c.totalQuantityKg,
      shortfallKg: c.totalQuantityKg - carried,
      stopsFailed: failed.length,
      stopsShort: short.length,
      // ── HOW MUCH OF THAT DELIVERED TOTAL WAS EVER ON A SCALE ──────────
      // A delivered quantity is the single number a buyer pays against, so it
      // does not leave this route without its provenance. Four weighed farms
      // and one eyeballed one is not honestly summarised by a boolean, which
      // is why this reports kilograms.
      weightProvenance: summariseWeights(c.stops),
      // Every farm where the grade seen at the gate differed from the one
      // declared. Surfaced HERE, at the moment the buyer takes delivery,
      // because that is when it is still worth acting on — and it is a
      // notification, not an adjustment: no price on this run has moved.
      gradeChecks: c.stops
        .filter((s) => s.grade?.discrepancy && s.grade.discrepancy !== 'match')
        .map((s) => ({
          orderId: s.orderId,
          farmerName: s.farmerName,
          cropName: s.cropName,
          collectedKg: s.collectedKg ?? null,
          ...describeGradeCheck(s.grade),
        })),
      fareSplit: { policy: FARE_SPLIT_POLICY, note: FARE_SPLIT_NOTE },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASSIGNING AN FPO's OWN DRIVER TO A RUN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE HOLE THIS FILLS
 *   On `own`/`contracted` runs `agentUid` is null and the FPO admin recorded
 *   every stop from the office. So the person standing at the farm gate had no
 *   login, no stop list, no OTP field and no way to post a position — meaning
 *   consignment tracking was permanently unsolvable for exactly the FPOs that
 *   run their own vehicles. Worse, the farmer's pickup OTP is still (rightly)
 *   required, so the driver had to read a 4-digit code down a phone line to the
 *   office: a call per farm, and a much weaker code than one typed at the gate.
 *
 * WHAT THE ASSIGNMENT IS, AND WHAT IT IS NOT
 *   It writes `transport.driverUid` and nothing else. It does NOT write
 *   `agentUid`, does NOT set `isActiveJob`, and does NOT put anybody in the
 *   captain dispatch pool — see models/Consignment.js and
 *   services/agentJobService.js for why each of those would be a bug rather
 *   than a shortcut. The driver is authorised on THIS run by THIS field, and
 *   they are never offered, shown or able to touch any other.
 *
 * THE ONE-JOB RULE, DECIDED
 *   An assignment is not index-guarded (it cannot be — `isActiveJob` on an
 *   agentless run collides on a null `agentUid`), but the physical fact still
 *   holds: one driver, one vehicle. So `activeJobOf()` counts a live
 *   FPO-driver assignment as a held job, and this route refuses symmetrically
 *   when the named driver is already holding pool work. Both directions, one
 *   reason.
 */
router.post('/:id/driver', requireAuth, requireRole('farmer', 'fpo'), async (req, res) => {
  try {
    const uid = req.firebaseUid;
    const c = await Consignment.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ success: false, error: 'Run not found' });

    // A hired run already has a pool captain (or is waiting for one), and two
    // drivers on one vehicle is precisely what this app refuses everywhere.
    if ((c.transportMode || 'hired') === 'hired' || !c.fpoId)
      return res.status(409).json({
        success: false, code: 'NOT_AN_FPO_RUN',
        error: 'This run is dispatched to the captain pool, so a captain drives it. Only a run the '
          + 'FPO arranged itself (own or contracted transport) can have its own driver assigned.',
      });

    const fpo = await Fpo.findById(c.fpoId).select('adminUid name').lean();
    if (!fpo || fpo.adminUid !== uid)
      return res.status(403).json({
        success: false, code: 'NOT_FPO_ADMIN',
        error: "Only the admin of the group this run belongs to can assign its driver.",
      });

    if (!LIVE_RUN_STATUSES.includes(c.status))
      return res.status(409).json({
        success: false, code: 'RUN_CLOSED',
        error: `This run is already ${c.status} — there is nothing left to drive.`,
      });

    const driverUid = String(req.body?.driverUid || '').trim();
    if (!driverUid)
      return res.status(400).json({
        success: false, code: 'DRIVER_REQUIRED',
        error: 'Name the account that will drive this run (driverUid).',
      });

    // THE DRIVER MUST HAVE REGISTERED. An assignment to an account that does
    // not exist is a name on a trip sheet wearing a user link — the exact
    // thing this replaces.
    const driver = await User.findOne({ firebaseUid: driverUid })
      .select('firebaseUid name phone role vehicle').lean();
    if (!driver)
      return res.status(404).json({
        success: false, code: 'DRIVER_NOT_REGISTERED',
        error: 'That person has not registered on this app yet, so there is no account to hand the '
          + 'run to. They can sign up and be assigned afterwards; until then keep recording the '
          + 'stops from the office.',
      });
    if (!FPO_DRIVER_ROLES.includes(driver.role))
      return res.status(409).json({
        success: false, code: 'DRIVER_ROLE',
        // TWO REFUSED ROLES, TWO DIFFERENT REASONS, so the message says which
        // one applies rather than telling an FPO officer they are a buyer.
        // See FPO_DRIVER_ROLES for the full reasoning on both.
        error: driver.role === 'fpo'
          ? 'That is the group\'s own office account, and an office cannot be in a vehicle. Assign '
            + 'the PERSON who will drive — give them an account of their own — so the run records '
            + 'somebody who was actually at the gate. Until then keep recording the stops from the '
            + 'office, which is what the office account is for.'
          : `A ${driver.role} account cannot be assigned as a driver. A buyer recording the `
            + 'pickups on produce they are buying is a conflict of interest, not a convenience.',
      });

    // One driver, one vehicle — checked in the same direction the accept
    // routes check it. See services/agentJobService.js.
    const busy = await activeJobOf(driverUid, { excludeConsignmentId: c._id });
    if (busy)
      return res.status(409).json({
        ...busyResponse(busy),
        error: `${driver.name} is already on ${busy.label}. One driver cannot be in two vehicles.`,
      });

    // Guarded exactly like every other state change here: the mode, the group
    // and the live status are all in the FILTER, so a run being abandoned in
    // the same instant cannot acquire a driver on the way out.
    const now = new Date();
    const updated = await Consignment.findOneAndUpdate(
      {
        _id: c._id,
        fpoId: c.fpoId,
        transportMode: { $in: ['own', 'contracted'] },
        status: { $in: LIVE_RUN_STATUSES },
      },
      {
        $set: {
          'transport.driverUid': driver.firebaseUid,
          // FROM THE USER RECORD, NEVER THE REQUEST BODY. Same rule as every
          // other party on every other document in this app.
          'transport.driverName': driver.name,
          'transport.driverPhone': driver.phone,
          'transport.driverAssignedAt': now,
          'transport.driverAssignedBy': uid,
          'transport.driverUnassignedAt': null,
          ...(String(req.body?.vehicleNumber || '').trim()
            ? { 'transport.vehicleNumber': String(req.body.vehicleNumber).trim().slice(0, 30) }
            : {}),
        },
      },
      { new: true }
    );
    if (!updated)
      return res.status(409).json({
        success: false, code: 'RUN_CLOSED',
        error: 'This run changed while you were assigning a driver. Refresh and try again.',
      });

    console.log(`🧑‍🌾 Consignment ${updated._id}: ${fpo.name} assigned ${driver.name} to drive`);
    res.json({
      success: true,
      consignment: updated,
      driver: driverBlock(updated),
      abilities: ['stop-outcome', 'collect', 'location', 'deliver'],
      note: `${driver.name} can now open this run, read its stop list, take each farmer's own pickup `
        + 'code at the gate and post the vehicle\'s position. They are NOT a dispatch captain: they '
        + 'are not in the pool, and this assignment gives them nothing on any other run. Your office '
        + 'can still record stops itself if their phone dies, and the record says which of you did.',
    });
  } catch (err) {
    console.error('❌ Assign driver error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/consignments/:id/driver — take the run back to the office.
 *
 * A flat phone, a driver swapped mid-shift, a wrong account named. The
 * name and number are deliberately LEFT on the trip sheet: whoever drove is
 * still who drove, and erasing that would lose the record rather than correct
 * it. Only the link goes, and with it the driver's access to the run.
 */
router.delete('/:id/driver', requireAuth, requireRole('farmer', 'fpo'), async (req, res) => {
  try {
    const c = await Consignment.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ success: false, error: 'Run not found' });
    if (!c.fpoId)
      return res.status(409).json({ success: false, code: 'NOT_AN_FPO_RUN', error: 'Not an FPO-driven run.' });

    const fpo = await Fpo.findById(c.fpoId).select('adminUid').lean();
    if (!fpo || fpo.adminUid !== req.firebaseUid)
      return res.status(403).json({
        success: false, code: 'NOT_FPO_ADMIN',
        error: "Only the admin of the group this run belongs to can change its driver.",
      });

    const updated = await Consignment.findOneAndUpdate(
      { _id: c._id, fpoId: c.fpoId, 'transport.driverUid': { $ne: null } },
      { $set: { 'transport.driverUid': null, 'transport.driverUnassignedAt': new Date() } },
      { new: true }
    );
    if (!updated)
      return res.status(409).json({
        success: false, code: 'NO_DRIVER_ASSIGNED',
        error: 'No driver account is assigned to this run.',
      });

    res.json({
      success: true,
      consignment: updated,
      driver: driverBlock(updated),
      note: 'The driver no longer has access to this run. Your office records its stops again, and '
        + "the record will say so — `outcomeByRole: 'fpo_admin'` rather than `fpo_driver`.",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/consignments/:id/location — the driver's position ping (~every 5s).
 * body: { lat, lng, heading, seq, simulated }
 *
 * The direct counterpart of POST /api/orders/:id/location, and the same `seq`
 * rule for the same reason: it is a monotonic client counter, NOT a timestamp.
 * Mobile networks reorder packets, so without an ordering guard the marker
 * jumps backwards; and a phone clock wrong by minutes would freeze the marker
 * permanently if timestamps were compared instead.
 *
 * WHO: whoever is actually in the vehicle — the assigned captain on a hired
 * run, or the FPO's assigned driver on its own. The FPO's OFFICE is refused
 * here even though it may record stop outcomes; see resolvePositionActor().
 *
 * `requireRole('agent', 'farmer', 'fpo')` is only the outer gate, exactly as it
 * is on
 * /stop-outcome — resolvePositionActor() is what decides.
 */
router.post('/:id/location', requireAuth, requireRole('agent', 'farmer', 'fpo'), async (req, res) => {
  try {
    const here = toLatLng({ lat: Number(req.body.lat), lng: Number(req.body.lng) });
    const seq = Number(req.body.seq);
    if (!here || !Number.isFinite(seq))
      return res.status(400).json({ success: false, error: 'lat, lng and seq are required' });

    const c = await Consignment.findById(req.params.id)
      .select('agentUid fpoId transportMode transport.driverUid status').lean();
    if (!c) return res.status(404).json({ success: false, error: 'Run not found' });

    const actor = await resolvePositionActor(c, req.firebaseUid, req.profile?.role);
    if (actor.error)
      return res.status(actor.status).json({ success: false, code: actor.code, error: actor.error });

    // The identity stays IN THE FILTER even though the actor is already
    // resolved — same discipline as every other guarded update here, and it is
    // what makes a driver unassigned a moment ago stop being able to write.
    const identityGuard = actor.role === 'agent'
      ? { agentUid: req.firebaseUid }
      : { 'transport.driverUid': req.firebaseUid };

    const r = await Consignment.updateOne(
      {
        _id: req.params.id,
        ...identityGuard,
        status: { $in: LIVE_RUN_STATUSES },
        'tracking.seq': { $lt: seq },      // drops any ping that arrives late
      },
      {
        $set: {
          'tracking.lat': here.lat,
          'tracking.lng': here.lng,
          'tracking.heading': Number(req.body.heading) || 0,
          'tracking.seq': seq,
          'tracking.updatedAt': new Date(),
          'tracking.simulated': !!req.body.simulated,
          'tracking.byUid': req.firebaseUid,
          'tracking.byRole': actor.role,
        },
      }
    );
    // matchedCount 0 just means a stale ping or a finished run — not an error
    // worth surfacing to somebody who is driving.
    res.json({ success: true, applied: r.modifiedCount > 0, postedByRole: actor.role });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/consignments/:id/track — the polling payload for the map.
 *
 * WHO MAY READ IT: the buyer who booked the run, the admin of the FPO it
 * belongs to, EVERY contributing farmer (their crop is on that vehicle, and a
 * farmer who cannot see the truck carrying it is the gap this closes), and
 * whoever is driving.
 *
 * ⚠️ ONE FARMER MUST NOT LEARN ANOTHER'S BUSINESS. A farmer sees the route and
 * every stop as a point on it — that is what a map is — but every other stop
 * is reduced to its position and its progress. No name, no phone, no uid, no
 * crop, no weight, no money. Their OWN stop keeps everything.
 *
 * ⚠️ NOTHING IS EVER INTERPOLATED. `tracking` is the last fix that actually
 * landed and `lastSeenAt` is when. `remainingKm`/`etaMin` are measured FROM
 * THAT FIX and `etaBasis` says so out loud, so a client can dim or hide them
 * rather than presenting an hour-old guess as an arrival time.
 *
 * Deliberately small: the polyline is only sent when ?full=1, which a client
 * asks for once on mount. At 5s polling a 300-point polyline every tick would
 * be several MB an hour for data that never changes.
 */
router.get('/:id/track', requireAuth, async (req, res) => {
  try {
    const full = req.query.full === '1';
    const c = await Consignment.findById(req.params.id)
      .select(full ? '' : '-routePolyline').lean();
    if (!c) return res.status(404).json({ success: false, error: 'Run not found' });

    const uid = req.firebaseUid;
    const isVendor = c.vendorUid === uid;
    const isAgent = !!c.agentUid && c.agentUid === uid;
    const isDriver = !!c.transport?.driverUid && c.transport.driverUid === uid;
    const myStop = (c.stops || []).find((s) => s.farmerUid === uid) || null;
    const isFarmer = !!myStop;
    // The FPO admin is a party for the same reason they may record a stop:
    // they are the person driving an agentless run forward from the office.
    // Reuses the run's own rule rather than a second copy of it.
    const isFpoAdmin = !isVendor && !isAgent && !isDriver && !isFarmer
      ? await isFpoAdminForRun(c, uid) : false;

    if (!isVendor && !isAgent && !isDriver && !isFarmer && !isFpoAdmin)
      return res.status(403).json({ success: false, error: 'Not your run' });

    const viewerRole = isVendor ? 'vendor' : isAgent ? 'agent' : isDriver ? 'fpo_driver'
      : isFarmer ? 'farmer' : 'fpo_admin';
    // A farmer is the only viewer who is not a party to the WHOLE run.
    const restricted = viewerRole === 'farmer';

    const t = c.tracking || {};
    const ageSec = t.updatedAt ? Math.round((Date.now() - new Date(t.updatedAt)) / 1000) : null;
    const staleness = stalenessOf(ageSec);
    const at = (t.lat != null && t.lng != null) ? { lat: t.lat, lng: t.lng } : null;

    // WHERE THE VEHICLE IS HEADING — derived from the stops, never posted. The
    // next farm still to be visited in sequence, or the buyer's gate once every
    // farm has been. A run in transit is by definition heading for the dropoff.
    const stops = [...(c.stops || [])].sort((a, b) => a.sequence - b.sequence);
    const nextStopDoc = stops.find((s) => !s.collected && (s.outcome ?? 'pending') === 'pending') || null;
    const target = nextStopDoc ? toLatLng(nextStopDoc) : toLatLng(c.dropoff);
    const remainingKm = (at && target) ? roundKm(haversineKm(at, target) * 1.35) : null;

    const visited = stops.filter((s) => s.collected || (s.outcome ?? 'pending') !== 'pending');

    res.json({
      success: true,
      track: {
        _id: c._id,
        status: c.status,
        // ── The same keys GET /api/orders/:id/track returns, so one renderer
        // serves a 50 kg single pickup and a 2-tonne five-farm run. On an
        // FPO-driven run these carry the assigned DRIVER, with `driver.kind`
        // saying which sort of person they are.
        tracking: {
          lat: t.lat ?? null, lng: t.lng ?? null,
          heading: t.heading ?? 0, seq: t.seq ?? -1,
          updatedAt: t.updatedAt || null,
          simulated: !!t.simulated,
        },
        ageSec,
        stale: ageSec == null || ageSec > TRACK_LIVE_SEC,
        remainingKm,
        etaMin: remainingKm != null ? Math.max(1, Math.round((remainingKm / 35) * 60)) : null,
        agentName: driverBlock(c).name,
        agentPhone: driverBlock(c).phone,
        agentVehicleNumber: driverBlock(c).vehicleNumber,
        vehicleType: c.vehicleType,
        // What the vehicle is heading to right now — the single-order payload's
        // own semantics (`pickup` before collection, `dropoff` after).
        pickup: nextStopDoc ? { lat: nextStopDoc.lat, lng: nextStopDoc.lng, label: nextStopDoc.label || '' } : null,
        dropoff: c.dropoff,

        // ── THE HONESTY BLOCK, which is the reason this endpoint exists ────
        // Nothing below is derived from anything but the last real fix.
        lastSeenAt: t.updatedAt || null,
        staleness,
        staleNote: STALENESS_NOTE[staleness],
        // Stated, not implied. Foreground-only tracking means gaps, and this
        // app fills them with a sentence rather than with a position.
        interpolated: false,
        positionSource: t.updatedAt ? (t.simulated ? 'simulated' : 'device_foreground_ping') : null,
        postedByRole: t.byRole || null,
        // The ETA is measured from a fix that is `ageSec` old. A client that
        // will not show a stale ETA has everything it needs to decide.
        etaBasis: at ? 'last_seen_position' : null,

        // ── THE RUN ITSELF ────────────────────────────────────────────────
        transportMode: c.transportMode || 'hired',
        driver: driverBlock(c),
        viewerRole,
        inTransit: c.status === 'in_transit',
        inTransitAt: c.inTransitAt || null,
        deliveredAt: c.deliveredAt || null,
        progress: {
          stopsTotal: stops.length,
          stopsVisited: visited.length,
          stopsCollected: stops.filter((s) => s.collected).length,
          stopsFailed: stops.filter((s) => s.outcome === 'not_collected').length,
          plannedKg: c.totalQuantityKg,
          collectedKg: c.collectedQuantityKg ?? null,
          // `collectedKg` does not appear on a screen without this. Safe for
          // every viewer including a farmer: it is kilograms and methods in
          // aggregate, never another farm's quantity or price.
          weightProvenance: summariseWeights(stops),
        },
        nextStop: nextStopDoc
          ? {
            sequence: nextStopDoc.sequence,
            lat: nextStopDoc.lat, lng: nextStopDoc.lng,
            label: nextStopDoc.label || '',
            // A farmer only learns whose farm is next when it is their own.
            farmerName: (!restricted || nextStopDoc.farmerUid === uid) ? nextStopDoc.farmerName : null,
            mine: nextStopDoc.farmerUid === uid,
          }
          : null,
        // Enough to draw the route and colour each stop; nothing more for
        // anyone whose stop it is not.
        stops: stops.map((s) => {
          const mine = s.farmerUid === uid;
          const base = {
            sequence: s.sequence,
            lat: s.lat, lng: s.lng,
            collected: !!s.collected,
            outcome: s.outcome || 'pending',
            mine,
          };
          if (restricted && !mine) return base;
          return {
            ...base,
            orderId: s.orderId,
            farmerUid: s.farmerUid,
            farmerName: s.farmerName,
            // A phone number is for the person collecting or paying, not for a
            // map. The vendor and the drivers get it; a farmer gets their own.
            farmerPhone: (isVendor || isAgent || isDriver || isFpoAdmin) ? s.farmerPhone : undefined,
            cropName: s.cropName,
            quantityKg: s.quantityKg,
            collectedKg: s.collectedKg ?? null,
            // Beside the kilograms, never anywhere else.
            weight: describeWeight(s.weight?.method, s.weight?.ref, s.collectedKg ?? null),
            grade: describeGradeCheck(s.grade),
            failureReason: s.failureReason || null,
            fareShare: s.fareShare,
            label: s.label || '',
          };
        }),
        ...(restricted
          ? {
            privacyNote: 'You are shown the whole route because your crop is on this vehicle, but the '
              + 'other farms on it appear only as points and progress — never their names, numbers, '
              + 'crops, weights or money.',
          }
          : {}),
        ...(full
          ? {
            routePolyline: c.routePolyline,
            distanceKm: c.distanceKm,
            durationMin: c.durationMin,
            lot: c.lot || null,
            // The buyer holds the delivery code; nobody else ever sees it.
            dropOtp: isVendor ? c.dropOtp : undefined,
            fare: isVendor ? c.fare : undefined,
          }
          : {}),
      },
    });
  } catch (err) {
    console.error('❌ Consignment track error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/consignments/:id — any party to the run. */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const c = await Consignment.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ success: false, error: 'Not found' });

    const uid = req.firebaseUid;
    const isVendor = c.vendorUid === uid;
    const isAgent = !!c.agentUid && c.agentUid === uid;
    const isFarmer = c.stops.some((s) => s.farmerUid === uid);
    // THE STOP LIST IS THE DRIVER'S SCREEN. An FPO driver assigned to this run
    // is reading it to know which farm is next and whose code to ask for —
    // without this they could record outcomes on a run they cannot open.
    const isFpoDriver = !c.agentUid && !!c.transport?.driverUid && c.transport.driverUid === uid;
    // On an own/contracted run the FPO admin is the person driving it forward,
    // so they are a party to it — they cannot record stop outcomes on a run
    // they are not allowed to look at.
    const isFpoAdmin = !c.agentUid && !!c.fpoId
      && (await Fpo.findById(c.fpoId).select('adminUid').lean())?.adminUid === uid;
    if (!isVendor && !isAgent && !isFarmer && !isFpoDriver && !isFpoAdmin)
      return res.status(403).json({ success: false, error: 'Not your consignment' });

    // The buyer holds the drop code; nobody else sees it.
    if (!isVendor) delete c.dropOtp;
    // A farmer sees the run, but not the other farmers' phone numbers. The
    // people organising or driving the pickup are excepted — they have to ring
    // the next farm.
    if (isFarmer && !isVendor && !isAgent && !isFpoDriver && !isFpoAdmin) {
      c.stops = c.stops.map((s) =>
        s.farmerUid === uid ? s : { ...s, farmerPhone: undefined, farmerName: s.farmerName });
    }
    res.json({
      success: true,
      consignment: c,
      // So a driver's screen knows which rules it is under without inferring
      // it from three fields.
      viewerRole: isVendor ? 'vendor' : isAgent ? 'agent' : isFpoDriver ? 'fpo_driver'
        : isFpoAdmin ? 'fpo_admin' : 'farmer',
      driver: driverBlock(c),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

// Shared with routes/fpos.js, which has to compare candidate bundles by route
// length before it can choose which farms ride together. Same export shape
// routes/requirements.js already uses for matchRequirementsForPoints().
module.exports.orderStops = orderStops;
module.exports.optimalRouteKm = optimalRouteKm;

// ── Shared with routes/fpos.js Phase D (the FPO lot quote/confirm) ────────
// An FPO lot order creates its own Orders and its own Consignment, so it needs
// the same fare split, the same transport-mode validation and the same dispatch
// window this route already uses. Re-implementing any of them there would be a
// second place for the by-weight split to drift, a second place for a client to
// smuggle in its own `costSource`, and a second dispatch window to forget to
// change — which is exactly the duplication computeSettlement() was created to
// remove on the settlement side.
module.exports.splitFare = splitFare;
module.exports.buildTransportArrangement = buildTransportArrangement;
module.exports.COST_SOURCE_BY_MODE = COST_SOURCE_BY_MODE;
module.exports.COST_NOTE_BY_MODE = COST_NOTE_BY_MODE;
module.exports.TRANSPORT_MODES = TRANSPORT_MODES;
// (DISPATCH_WINDOW_MS was re-exported here for routes/fpos.js. It now imports
// services/dispatchWindow directly — a re-export nobody consumes is a second
// name for the same constant, which is the divergence this refactor removed.)
module.exports.MAX_STOPS = MAX_STOPS;
module.exports.ABANDON_REASONS = ABANDON_REASONS;
// Exported so testConsignments.js can back-date a run past the threshold
// rather than hard-coding six hours in a second place.
module.exports.STALE_RUN_MS = STALE_RUN_MS;
module.exports.otp = otp;
// Exported so testCollection.js can assert the addressing rule directly —
// above all that a request naming NEITHER key matches NOTHING, rather than
// falling through to the first stop and recording an outcome against the
// wrong farm.
module.exports.findStop = findStop;

// ── Tracking, for the same reason: a test asserting "a 40-minute-old fix is
// reported COLD" must read the boundary from the implementation, or the two
// drift and the test starts asserting a number nobody is using.
module.exports.TRACK_LIVE_SEC = TRACK_LIVE_SEC;
module.exports.TRACK_RECENT_SEC = TRACK_RECENT_SEC;
module.exports.TRACK_STALE_SEC = TRACK_STALE_SEC;
module.exports.LIVE_RUN_STATUSES = LIVE_RUN_STATUSES;
module.exports.FPO_DRIVER_ROLES = FPO_DRIVER_ROLES;

// ── The gate record, for the same reason: testConsignments.js asserts that a
// weight method is required and that the honest "not weighed" value is on the
// list. Reading the list from the implementation is what stops the test and
// the route drifting into asserting different enums.
module.exports.POSTABLE_WEIGHT_METHODS = POSTABLE_WEIGHT_METHODS;
module.exports.WEIGHT_NOT_RECORDED = WEIGHT_NOT_RECORDED;
// F1 — the one place a listing moves into FPO custody, shared with the
// (retired but kept) run-based collection path. See its own header comment.
module.exports.moveListingToFpoCustody = moveListingToFpoCustody;

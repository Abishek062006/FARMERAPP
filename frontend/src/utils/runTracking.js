// src/utils/runTracking.js
//
// TIER 2 / GAP A — WHERE THE VEHICLE WAS LAST SEEN, SAID HONESTLY, IN ONE PLACE.
//
// Three screens now read a position: the buyer's map (shared/TrackScreen), the
// FPO admin's office view and the FPO driver's own run (Farmer/FpoRunScreen),
// and the captain's run (Agent/ConsignmentTripScreen). If each formatted
// staleness itself, one of them would eventually round "40 minutes ago" up into
// a confident green LIVE chip — which is the single failure this whole feature
// was built to refuse.
//
// ⚠️ THE RULE, WHICH IS NOT A STYLE CHOICE.
//   Location is FOREGROUND-ONLY (Expo Go gives no background location) and this
//   app has no push channel, so a five-farm run WILL have long gaps: the phone
//   is in a pocket for most of it. Nothing here ever interpolates, smooths,
//   dead-reckons or carries a position forward. `tracking` is the last fix that
//   actually landed and `lastSeenAt` is when it landed; everything below only
//   describes that fact more precisely. CLAUDE.md names faking a live position
//   as something this project refuses, and the backend returns `staleness` as
//   structured data precisely so no screen has to guess.
//
// The bands and their boundaries are the SERVER'S (TRACK_LIVE_SEC 30s,
// TRACK_RECENT_SEC 5m, TRACK_STALE_SEC 30m in routes/consignments.js). They are
// mirrored here only so a payload that predates the field, or a list row that
// carries `ageSec` without `staleness`, still renders correctly — never to
// second-guess a band the server sent.

import axios from 'axios';
import { API_ENDPOINTS } from './config';

export const TRACK_LIVE_SEC = 30;
export const TRACK_RECENT_SEC = 5 * 60;
export const TRACK_STALE_SEC = 30 * 60;

/** Grade a fix's age. `null` age means no fix has ever arrived on this run. */
export function stalenessOf(ageSec) {
  if (ageSec == null) return 'never';
  if (ageSec <= TRACK_LIVE_SEC) return 'live';
  if (ageSec <= TRACK_RECENT_SEC) return 'recent';
  if (ageSec <= TRACK_STALE_SEC) return 'stale';
  return 'cold';
}

/** The server's band when it sent one, else derived. Never overridden. */
export const bandOf = (track) =>
  (track && track.staleness) || stalenessOf(track ? track.ageSec : null);

/**
 * How a band is allowed to LOOK. `cold` and `never` are deliberately the same
 * grey as a disabled control: a position over half an hour old must not read as
 * a vehicle that is moving.
 */
export const STALE_STYLE = {
  live:   { bg: '#DCFCE7', fg: '#15803D', dot: '#16A34A' },
  recent: { bg: '#EFF6FF', fg: '#1D4ED8', dot: '#2563EB' },
  stale:  { bg: '#FFF7ED', fg: '#C2410C', dot: '#EA580C' },
  cold:   { bg: '#F1F5F9', fg: '#6B7280', dot: '#9CA3AF' },
  never:  { bg: '#F1F5F9', fg: '#6B7280', dot: '#9CA3AF' },
};

/**
 * The wording of "last seen", as a bag, because two audiences read it: the
 * buyer (English by product decision) and the farmer side (Marathi). Same
 * reason StopOutcomeSheet takes an `L` — the RULE lives here, the WORDS come
 * from the screen.
 */
export const LAST_SEEN_EN = {
  never: 'No position has ever been received',
  live: 'Live',
  moment: 'Last seen a moment ago',
  min: (n) => `Last seen ${n} min ago`,
  hr: (h, m) => `Last seen ${h} hr${h === 1 ? '' : 's'}${m ? ` ${m} min` : ''} ago`,
};

/**
 * "Last seen 14 min ago" — never "Live" for anything but a genuinely live fix.
 *
 * `never` says no position has EVER arrived, which is a different fact from an
 * old one and must not collapse into "0 min ago".
 */
export function lastSeenText(ageSec, L = LAST_SEEN_EN) {
  if (ageSec == null) return L.never;
  if (ageSec <= TRACK_LIVE_SEC) return L.live;
  if (ageSec < 90) return L.moment;
  if (ageSec < 3600) return L.min(Math.round(ageSec / 60));
  return L.hr(Math.floor(ageSec / 3600), Math.round((ageSec % 3600) / 60));
}

/**
 * WHETHER AN ETA MAY BE SHOWN AT ALL.
 *
 * The backend measures `remainingKm`/`etaMin` FROM THE LAST FIX and says so in
 * `etaBasis`. An ETA computed from a 40-minute-old position is a guess wearing
 * a decimal point — the same refusal H2 makes past 14 days. So it is shown only
 * while the fix is fresh enough for the number to mean something.
 */
export const etaIsHonest = (track) =>
  !!track && track.etaMin != null && ['live', 'recent'].includes(bandOf(track));

/**
 * WHO IS DRIVING, in one shape whichever kind of driver it is — the client-side
 * mirror of `driverBlock()` in routes/consignments.js. `GET /:id/track` and
 * `GET /vendor/purchases` already send this object; this exists for the plain
 * `GET /api/consignments/:id` payload, which sends the raw document.
 *
 * `linked: false` is the one that matters: a driver who is only a name on the
 * trip sheet has no account, so every stop on that run is recorded by the
 * group's office and no position can ever be reported. Saying so is the
 * difference between a record and a claim.
 */
export function driverBlockOf(c) {
  const t = (c && c.transport) || {};
  if (c && c.agentUid) {
    return {
      kind: 'captain', linked: true, uid: c.agentUid,
      name: c.agentName || '', phone: c.agentPhone || '',
      vehicleNumber: c.agentVehicleNumber || '',
    };
  }
  if (t.driverUid) {
    return {
      kind: 'fpo_driver', linked: true, uid: t.driverUid,
      name: t.driverName || '', phone: t.driverPhone || '',
      vehicleNumber: t.vehicleNumber || '',
    };
  }
  if (t.driverName) {
    return {
      kind: 'fpo_driver', linked: false, uid: null,
      name: t.driverName, phone: t.driverPhone || '',
      vehicleNumber: t.vehicleNumber || '',
    };
  }
  return { kind: null, linked: false, uid: null, name: '', phone: '', vehicleNumber: '' };
}

/**
 * The run's trip-level state, for a screen that has to name it.
 *
 * `in_transit` is deliberately its own entry and its own colour. The leg from
 * the last farm gate to the buyer's gate is the longest and most anxious part
 * of the journey and used to be invisible — a buyer refreshed a screen saying
 * "collecting" while the truck had been on the highway for an hour. It is
 * entered from evidence (every stop recorded, something aboard), never from a
 * button, so it can be trusted.
 */
export const RUN_STATE = {
  awaiting_agent: { title: 'Finding a driver',  sub: 'Nearby captains are being offered this run.', tone: '#EA580C' },
  no_agents:      { title: 'No driver found',   sub: 'Nobody accepted in time.', tone: '#DC2626' },
  accepted:       { title: 'Driver assigned',   sub: 'On the way to the first farm.', tone: '#2563EB' },
  collecting:     { title: 'Collecting',        sub: 'Working down the farms on this run.', tone: '#2563EB' },
  in_transit:     { title: 'On the way to you', sub: 'Every farm has been visited. The load is heading for the drop-off.', tone: '#7C3AED' },
  delivered:      { title: 'Delivered',         sub: 'This run is complete.', tone: '#16A34A' },
  cancelled:      { title: 'Closed empty',      sub: 'No farm handed anything over, so there was nothing to deliver.', tone: '#9CA3AF' },
  abandoned:      { title: 'Abandoned',         sub: 'The run stopped with produce aboard. Those farmers are still owed.', tone: '#B91C1C' },
};

/** The single-order statuses, kept beside the run ones so one screen serves both. */
export const ORDER_STATE = {
  awaiting_agent: { title: 'Finding a driver',  sub: 'Nearby drivers are being offered your trip.', tone: '#EA580C' },
  no_agents:      { title: 'No driver found',   sub: 'Nobody accepted in time. Try again from My Orders.', tone: '#DC2626' },
  accepted:       { title: 'Driver on the way', sub: 'Heading to the farm to collect your crop.', tone: '#2563EB' },
  picked_up:      { title: 'Out for delivery',  sub: 'Your crop is on the way to you.', tone: '#2563EB' },
  delivered:      { title: 'Delivered',         sub: 'This order is complete.', tone: '#16A34A' },
  cancelled:      { title: 'Cancelled',         sub: 'This order was cancelled.', tone: '#9CA3AF' },
  stranded:       { title: 'Stranded',          sub: 'The run carrying this was abandoned. Nothing arrived and the farmer is still owed.', tone: '#B91C1C' },
};

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5, T2 — THE PROGRESS TRACKER IS THIS ENUM, NOT A NEW ONE.
// ═══════════════════════════════════════════════════════════════════════════
//
// "Ordered / pending / driving / delivered" was the request, but this app has
// no `returned` or generic `pending` status anywhere on Order or Consignment
// — inventing a fifth, prettier status name that isn't a real state a
// document ever holds is how a tracker starts lying the first time reality
// takes a branch the happy path didn't plan for. The SPINE below is just the
// happy-path SUBSET of the real enum in order; everything else in
// ORDER_STATE/RUN_STATE is a BRANCH off it, and is rendered as a branch, not
// squeezed into the same line as if it were just another step.
//
// `*_BRANCH_FORK` says which spine step a branch actually forks FROM — e.g.
// `stranded` only ever happens after a real pickup, so it forks from
// `picked_up`, not from the start. `null` means it forks before step one
// (nothing was ever reached).
export const ORDER_SPINE = ['awaiting_agent', 'accepted', 'picked_up', 'delivered'];
export const ORDER_BRANCH_FORK = { no_agents: null, cancelled: null, stranded: 'picked_up' };

export const RUN_SPINE = ['awaiting_agent', 'accepted', 'collecting', 'in_transit', 'delivered'];
export const RUN_BRANCH_FORK = { no_agents: null, cancelled: null, abandoned: 'collecting' };

/** A run is still moving — the only time a position means anything. */
export const LIVE_RUN_STATUSES = ['accepted', 'collecting', 'in_transit'];
export const isRunLive = (status) => LIVE_RUN_STATUSES.includes(status);

/**
 * POST one position onto a run.
 *
 * `seq` is a monotonic COUNTER the caller increments, not a timestamp — mobile
 * networks reorder packets, so without an ordering guard the marker jumps
 * backwards, and a phone clock wrong by minutes would freeze it permanently if
 * timestamps were compared. Same contract as POST /api/orders/:id/location.
 *
 * A dropped ping is normal on mobile data and is never surfaced to somebody who
 * is driving, so this swallows its own failure and reports it as `applied`.
 */
export async function postRunLocation(consignmentId, { lat, lng, heading, seq, simulated }) {
  try {
    const r = await axios.post(`${API_ENDPOINTS.CONSIGNMENTS}/${consignmentId}/location`, {
      lat, lng, heading: heading || 0, seq, simulated: !!simulated,
    });
    return { applied: !!r.data?.applied, postedByRole: r.data?.postedByRole || null };
  } catch {
    return { applied: false, postedByRole: null };
  }
}

/** Assign / unassign the FPO's own driver. Admin-only; the server re-checks. */
export const assignRunDriver = (consignmentId, driverUid, vehicleNumber) =>
  axios.post(`${API_ENDPOINTS.CONSIGNMENTS}/${consignmentId}/driver`, {
    driverUid,
    ...(vehicleNumber ? { vehicleNumber } : {}),
  });

export const unassignRunDriver = (consignmentId) =>
  axios.delete(`${API_ENDPOINTS.CONSIGNMENTS}/${consignmentId}/driver`);

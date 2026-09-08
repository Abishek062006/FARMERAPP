// src/utils/stopOutcome.js
//
// PHASE G — WHAT ACTUALLY HAPPENED AT ONE FARM GATE, DERIVED IN ONE PLACE.
//
// Phase A gave every stop an OUTCOME (`pending | collected_full |
// collected_short | not_collected`) and `POST /api/consignments/:id/
// stop-outcome` to write it. Nothing in the app could reach it: the trip screen
// still called the happy-path `/collect` and still asked `!stop.collected` to
// decide what was left to do. A captain who arrived to find nobody home had no
// button, and the stop stayed uncollected forever — blocking the whole run.
//
// TWO SCREENS NOW RECORD OUTCOMES and they must never drift apart:
//   • Agent/ConsignmentTripScreen  — the captain on a hired run
//   • Farmer/FpoRunScreen          — the FPO admin on an own/contracted run,
//                                    where resolveRunActor() says there is no
//                                    captain and the group's own office keys in
//                                    what its driver reported
// So which outcomes exist, which of them need the farmer's code, and — the one
// that decides whether a run is finishable — WHAT COUNTS AS A STOP BEING DONE
// live here, once, rather than in each screen.
//
// ⚠️ "DONE" IS `outcome !== 'pending'`, NEVER `stop.collected`.
//   `collected` means produce went on the vehicle. A stop that reported
//   `not_collected` has been VISITED and is not coming back — reading
//   `collected` as "done" is exactly the bug that made a failed stop reappear
//   as the next stop forever and left the run undeliverable. The backend's
//   /deliver guard uses the same rule (`!s.collected && (s.outcome ?? 'pending')
//   === 'pending'`), so this file matches it deliberately, including the
//   fallback for stops written before outcomes existed, which carry no
//   `outcome` field at all.

import axios from 'axios';
import { API_ENDPOINTS } from './config';

/** The three real outcomes. Matches the Consignment stop enum exactly. */
export const OUTCOME = {
  FULL: 'collected_full',
  SHORT: 'collected_short',
  NONE: 'not_collected',
};

/** `Consignment.stops[].failureReason`'s enum, in the order a picker reads. */
export const FAILURE_REASONS = ['farmer_absent', 'quantity_not_ready', 'produce_rejected', 'other'];

/**
 * WHEN THE FARMER'S OWN 4-DIGIT CODE IS REQUIRED, and when it deliberately is
 * not. This is the rule the backend enforces; the screens only mirror it.
 *
 *   collected_full / collected_short — produce is leaving the farm, so the
 *     farmer's consent is required exactly as before. A short pickup is still a
 *     pickup and the farmer is standing right there.
 *   not_collected — nothing moves, and the absent farmer is precisely the
 *     person who cannot read a code out. Requiring one would make the failure
 *     unrecordable, which is how the run got stuck in the first place. It is
 *     recorded on the recorder's word instead, and the record says whose word:
 *     `stop.outcomeBy` / `outcomeByRole`. The farmer's remedy is a dispute.
 */
export const otpRequired = (outcome) => outcome === OUTCOME.FULL || outcome === OUTCOME.SHORT;

/** A reason is required for anything short of a full pickup — including a short one. */
export const reasonRequired = (outcome) => outcome !== OUTCOME.FULL;

/**
 * This stop's outcome, including for documents written before outcomes existed
 * (no `outcome` field at all — their `collected` flag is all there is to read).
 * Same derivation as the backend's own `already` check.
 */
export function outcomeOf(stop) {
  const o = stop && stop.outcome;
  if (o && o !== 'pending') return o;
  return stop && stop.collected ? OUTCOME.FULL : 'pending';
}

/** VISITED, not "collected from". The distinction is the whole point. */
export const isVisited = (stop) => outcomeOf(stop) !== 'pending';

export const isFailed = (stop) => outcomeOf(stop) === OUTCOME.NONE;
export const isShort = (stop) => outcomeOf(stop) === OUTCOME.SHORT;

/** What this stop actually put on the vehicle. 0 for a failed stop. */
export const stopKg = (stop) =>
  (stop && stop.collectedKg != null ? stop.collectedKg : (stop && stop.collected ? stop.quantityKg : 0));

/** What the vehicle is carrying, as REPORTED — never the planned total. */
export const carriedKg = (stops = []) => stops.reduce((a, s) => a + stopKg(s), 0);

export const visitedCount = (stops = []) => stops.filter(isVisited).length;
export const collectedCount = (stops = []) => stops.filter((s) => !!s.collected).length;
export const failedCount = (stops = []) => stops.filter(isFailed).length;

/** The next farm to DRIVE TO. A failed stop is behind you, not ahead of you. */
export const nextPendingStop = (stops = []) => stops.find((s) => !isVisited(s)) || null;

/** Every farm has been visited — whatever each of them reported. */
export const allVisited = (stops = []) => stops.length > 0 && stops.every(isVisited);

/**
 * NOTHING WAS COLLECTED ANYWHERE, so there is no handover and no delivery code
 * to ask for — no buyer reads a code out for an empty vehicle. `/deliver`
 * closes such a run as `cancelled` and returns `code: 'NOTHING_COLLECTED'`.
 * The screens must not put the recorder in front of a code entry that can never
 * be satisfied; that is the "stranded at a delivery step" case.
 */
export const nothingCollected = (stops = []) => carriedKg(stops) === 0;

/**
 * The run is over, whichever way it ended.
 *
 * `abandoned` belongs here and is NOT the same fact as `cancelled` — cancelled
 * means every farm was visited and none handed anything over, abandoned means
 * produce was loaded and then the run stopped. Both are closed: nothing more
 * can be recorded at a gate on either, and a screen that left the record
 * buttons live on an abandoned run would offer a tap the server refuses.
 */
export const CLOSED_STATUSES = ['delivered', 'cancelled', 'abandoned'];

export const isClosed = (c) => !!c && CLOSED_STATUSES.includes(c.status);

/**
 * Validate a short-pickup quantity against what was ordered. Returns a CODE,
 * not a sentence — the two screens speak different languages and the message
 * belongs to them. Mirrors the backend's BAD_QUANTITY rules exactly.
 */
export function validateShortKg(text, orderedKg) {
  const kg = Number(String(text || '').trim());
  if (!Number.isFinite(kg) || kg <= 0) return { error: 'NOT_A_NUMBER', kg: null };
  if (kg >= orderedKg) return { error: 'TOO_HIGH', kg: null };
  return { error: null, kg };
}

/**
 * Record one stop. `/stop-outcome` takes all three outcomes; the legacy
 * `/collect` is the same handler with the outcome fixed, so there is no reason
 * for a screen to call two endpoints.
 */
export function postStopOutcome(consignmentId, body) {
  return axios.post(`${API_ENDPOINTS.CONSIGNMENTS}/${consignmentId}/stop-outcome`, body);
}

/**
 * Finish the run. `otp` is the BUYER's code — omitted entirely when nothing was
 * collected, because there is nobody to ask and the backend does not want one.
 */
export function postDeliver(consignmentId, otp) {
  return axios.post(
    `${API_ENDPOINTS.CONSIGNMENTS}/${consignmentId}/deliver`,
    otp ? { otp } : {}
  );
}

/**
 * WHO IS ALLOWED TO RECORD, read off the run itself — the client-side mirror of
 * resolveRunActor(). It decides whether a screen shows recording controls at
 * all; the server decides whether the write lands.
 *
 *   'agent'      a captain is driving. ONLY they may record. An FPO admin
 *                looking at such a run gets a read-only view, and the server
 *                would refuse them with 403 AGENT_ONLY anyway.
 *   'fpo_driver' the group's OWN driver, named on this run by its admin. Checked
 *                BEFORE the admin, which is the same ordering resolveRunActor()
 *                uses and for the same reason: if this account is the assigned
 *                driver then they are the driver even when they also administer
 *                the group, because "the person at the gate keyed it in" is the
 *                stronger and truer of the two available claims.
 *   'fpo_admin'  no captain, and the run is own/contracted with an fpoId — the
 *                arranging group's office keys in what its driver reported.
 *                THIS DOES NOT GO AWAY when a driver is assigned: a flat phone
 *                still has to be able to get the load to the mandi.
 *   'nobody'     a hired run that no captain has accepted yet. Nobody has stood
 *                at any gate, so there is nothing to report.
 *
 * ⚠️ PREFER THE SERVER'S OWN ANSWER WHEN THERE IS ONE. `GET /api/consignments/
 *   /:id` returns `viewerRole`, which knows things this cannot — whether the
 *   caller actually administers the group. This exists for the banner (which
 *   describes the RUN, not the viewer) and as the fallback for a payload
 *   written before `viewerRole` existed.
 *
 * `uid` is the frontend's own `userData.uid` — note that is `uid`, NOT
 * `firebaseUid`, per CLAUDE.md.
 */
export function runActorRole(c, uid) {
  if (!c) return 'nobody';
  if (c.agentUid) return 'agent';
  if (!c.transportMode || c.transportMode === 'hired' || !c.fpoId) return 'nobody';
  if (uid && c.transport?.driverUid && c.transport.driverUid === uid) return 'fpo_driver';
  return 'fpo_admin';
}

/**
 * The two roles that may record a stop on an agentless run. Both are real and
 * neither replaces the other — the record says which one was used
 * (`outcomeByRole`), because "your group's driver, at your gate" and "your
 * group's office, keying in what he reported down a phone line" are different
 * claims and a farmer disputing one is entitled to know which was made.
 */
export const RECORDING_ROLES = ['fpo_admin', 'fpo_driver'];
export const canRecordAs = (role) => RECORDING_ROLES.includes(role);

/**
 * WHO MAY POST A POSITION — NARROWER THAN WHO MAY RECORD A STOP, and that is
 * the honesty rule rather than a permissions detail.
 *
 * A stop outcome can legitimately be relayed. A POSITION CANNOT: "where is the
 * vehicle right now" has exactly one honest source, the device travelling with
 * it. An admin at a desk posting a coordinate is not reporting a position, they
 * are inventing one. The server refuses the office by name (403
 * NOT_IN_THE_VEHICLE); this is the same rule said before anybody taps.
 */
export const canPostPositionAs = (role) => role === 'agent' || role === 'fpo_driver';

// ═══════════════════════════════════════════════════════════════════════════
// WHAT A PERSON AT THE GATE CAN ACTUALLY ATTEST TO
// ═══════════════════════════════════════════════════════════════════════════
//
// Two facts decide what a buyer pays and what a farmer is owed — the WEIGHT and
// the GRADE — and the app asserted both twice and measured neither. The backend
// answer is `backend/data/gateRecord.js`; this is its client-side mirror, and
// it lives here for the same reason the outcome rules do: BOTH recording
// screens use it (the captain's `Agent/ConsignmentTripScreen` and the FPO's
// `Farmer/FpoRunScreen`, through `components/StopOutcomeSheet`), and a second
// copy is a second place for one of them to quietly stop saying that nobody
// weighed the lot.
//
// ⚠️ EVERY VALUE BELOW IS A RECORD OF WHAT SOMEBODY SAID THEY SAW. Nothing here
// derives a price, corrects a weight or overrules a grade — the same rule the
// dispute engine is written under. A screen that renders any of it as a
// measurement the app performed is rendering it wrong.

/**
 * HOW THE KILOGRAM FIGURE WAS ESTABLISHED. Mirrors WEIGHT_METHODS in
 * backend/data/gateRecord.js, value for value.
 */
export const WEIGHT_METHOD = {
  CENTRE: 'collection_centre_scale',
  BRIDGE: 'public_weighbridge',
  FARM: 'farm_scale',
  ESTIMATED: 'estimated',
  // SERVER-SET ONLY and never postable — a pickup recorded through the legacy
  // POST /collect route, which predates the field and asks nothing. Kept apart
  // from `estimated` because "somebody judged it by eye" and "the app never
  // asked" are different facts, and folding them together would credit an
  // unanswered form with a human estimate nobody actually made.
  NOT_RECORDED: 'not_recorded',
};

/**
 * The four a recorder may post, in the order the picker reads them.
 *
 * ⚠️ `estimated` IS ON THIS LIST AND IS NOT A FALLBACK. Most farm-gate pickups
 * in Maharashtra have no scale within reach: the number is bags counted and
 * multiplied, or an experienced eye. Leaving it out would not make those
 * pickups weighed — it would make them PRESENT as weighed. What the backend
 * refuses is SILENCE, not the absence of a scale, so a screen that renders this
 * option as a failure state is arguing with the field's whole purpose.
 */
export const POSTABLE_WEIGHT_METHODS = [
  WEIGHT_METHOD.CENTRE,
  WEIGHT_METHOD.BRIDGE,
  WEIGHT_METHOD.FARM,
  WEIGHT_METHOD.ESTIMATED,
];

/**
 * The two booleans a UI actually branches on, plus whether a ticket number is
 * worth asking for. Same values the backend's `describeWeight()` returns.
 *
 * `independent` is TRUE FOR EXACTLY ONE METHOD, and that is the point: a public
 * weighbridge issues a ticket a farmer and a buyer can both hold up. An FPO's
 * own scale is the seller's group's instrument and a farm scale is the seller's
 * own — both are real weighings, both beat nothing, and neither is evidence in
 * an argument the way a ticket is.
 */
export const WEIGHT_METHOD_META = {
  [WEIGHT_METHOD.CENTRE]: { weighed: true, independent: false, needsRef: false },
  [WEIGHT_METHOD.BRIDGE]: { weighed: true, independent: true, needsRef: true },
  [WEIGHT_METHOD.FARM]: { weighed: true, independent: false, needsRef: false },
  [WEIGHT_METHOD.ESTIMATED]: { weighed: false, independent: false, needsRef: false },
  [WEIGHT_METHOD.NOT_RECORDED]: { weighed: false, independent: false, needsRef: false },
};

export const isWeighed = (m) => !!WEIGHT_METHOD_META[m]?.weighed;
export const isIndependentWeight = (m) => !!WEIGHT_METHOD_META[m]?.independent;

/**
 * The ticket number is offered for the ONE method that issues a ticket, and for
 * no other. A free-text "reference" against an eyeballed figure would be a box
 * inviting somebody to make a provenance up.
 */
export const weightRefApplies = (m) => !!WEIGHT_METHOD_META[m]?.needsRef;

/**
 * Required whenever produce actually moved, because the kilograms are about to
 * decide what a farmer is paid. NOT asked when nothing moved — there is no
 * weight to have a provenance and the quantity is 0 by definition. Mirrors the
 * backend guard that answers 400 WEIGHT_METHOD_REQUIRED.
 */
export const weightMethodRequired = (outcome) => outcome !== OUTCOME.NONE;

/** The stored method on a stop or an order, whichever shape came back. */
export const weightMethodOf = (row) =>
  row?.weight?.method || row?.pickupOutcome?.weight?.method || null;

// ── THE GRADE ACTUALLY SEEN AT THE GATE ──────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// WHO MAY GRADE, AND WHAT EVERYONE ELSE CAN SAY INSTEAD
// ═══════════════════════════════════════════════════════════════════════════
//
// The client mirror of backend/data/gateRecord.js GRADING_ROLES. It lives here
// for the same reason the outcome rules do: BOTH recording screens use it (the
// captain's `Agent/ConsignmentTripScreen` and the FPO's `Farmer/FpoRunScreen`,
// through `components/StopOutcomeSheet`), and a second copy is a second place
// for one of them to quietly start asking a truck driver to grade an onion.
//
// THE RULE: an FPO's own people grade. A captain from the public pool does not.
// Grading against the AGMARK criteria is a skilled judgement about size, colour
// uniformity and blemish tolerance — a thing a person can be WRONG about, and
// the person it is wrong about is the farmer, whose reputation it reaches.
// Asking an independent driver to certify it, about produce they will never see
// again, in a trade where the letter carries a price premium, would launder one
// unverified claim into a second one wearing the word "observed".
//
// The server refuses it outright (409 GRADING_NOT_AVAILABLE). This is the same
// rule said BEFORE anybody taps, so the field is never offered and then
// rejected.
export const GRADING_ROLES = ['fpo_driver', 'fpo_admin'];
export const mayGradeAtGate = (actorRole) => GRADING_ROLES.includes(actorRole);

// ── WHAT ANYONE WITH EYES CAN SAY ─────────────────────────────────────────
//
// CONDITION IS NOT A WEAKER GRADE. It is a different KIND of statement — one
// that needs eyes and not expertise:
//
//   "this is not the crop on the order"   — anybody can see that
//   "these onions are wet and sprouting"  — anybody can see that
//   "Grade A rather than Grade B"         — NOT anybody. That is grading.
//
// So EVERY recorder may set these, on a hired run and on an FPO's own run
// alike. They are the honest floor of what an independent driver is in a
// position to attest to. Keys and order match CONDITION_FLAGS in
// backend/data/gateRecord.js; the words are the screen's (`L`).
export const CONDITION_FLAGS = [
  { key: 'wrong_crop',        labelKey: 'condWrongCrop',   severity: 'serious' },
  { key: 'visibly_spoiled',   labelKey: 'condSpoiled',     severity: 'serious' },
  { key: 'sprouting',         labelKey: 'condSprouting',   severity: 'notable' },
  { key: 'wet',               labelKey: 'condWet',         severity: 'notable' },
  { key: 'damaged',           labelKey: 'condDamaged',     severity: 'notable' },
  { key: 'packaging_damaged', labelKey: 'condPackaging',   severity: 'minor' },
];

export const CONDITION_FLAG_KEYS = CONDITION_FLAGS.map((f) => f.key);

/**
 * The body fields for a condition answer.
 *
 * ⚠️ `checked: false` AND `checked: true` WITH NO FLAGS ARE DIFFERENT FACTS.
 * "Nobody looked" and "somebody looked and saw nothing wrong" are opposite
 * evidence in an argument about a bad lot, so a recorder who has not answered
 * sends NOTHING and one who has affirmed a clean lot sends
 * `conditionChecked: true` with an empty list. Sending `checked: false` for
 * both would report the affirmation as silence; sending `true` for both would
 * report silence as an affirmation.
 */
export function conditionBody(checked, flags, note) {
  if (!checked && !(flags || []).length) return {};
  return {
    conditionChecked: true,
    conditionFlags: flags || [],
    ...((note || '').trim() ? { conditionNote: note.trim() } : {}),
  };
}

/** Nothing was collected, so there was no lot at the gate to look at. */
export const conditionApplies = (outcome) => outcome !== OUTCOME.NONE;

export const GRADES = ['A', 'B', 'C'];
const GRADE_RANK = { A: 3, B: 2, C: 1 };

/** Mirrors compareGrades() in backend/data/gateRecord.js exactly. */
export function compareGrades(declared, observed) {
  if (!observed) return null;
  if (!declared) return 'observed_only';
  const d = GRADE_RANK[declared] || 0;
  const o = GRADE_RANK[observed] || 0;
  if (o === d) return 'match';
  return o < d ? 'downgrade' : 'upgrade';
}

/**
 * WHAT THE RECORDER IS ACTUALLY BEING ASKED, and why there are three answers
 * rather than a grade picker.
 *
 *   DECLARED  the lot is what the farmer said it was. THE DEFAULT, and it sends
 *             NO `observedGrade` at all — the backend defaults the observation
 *             to the declaration, so the common case needs no input and the
 *             recorder never retypes a letter. Making them retype it would
 *             produce noise, not evidence; the backend comment says so.
 *   OBSERVED  they looked and it is a different letter. The only answer that
 *             can produce a downgrade, and the only one that needs a picker.
 *   NONE      nothing to grade (most listings carry no grade), or they did not
 *             look. Sends an EXPLICIT null, which the backend honours — a
 *             recorder who did not look must not be recorded as having
 *             confirmed the declaration.
 */
export const GRADE_CHOICE = { DECLARED: 'declared', OBSERVED: 'observed', NONE: 'none' };

/**
 * The `observedGrade` half of a stop-outcome body, as the three choices above
 * map onto the wire. Returns an OBJECT TO SPREAD, because the difference
 * between "the key is absent" and "the key is null" is the whole contract.
 */
export function gradeBody(choice, letter) {
  if (choice === GRADE_CHOICE.OBSERVED && GRADES.includes(letter)) return { observedGrade: letter };
  if (choice === GRADE_CHOICE.NONE) return { observedGrade: null };
  return {};
}

/**
 * One grade block, normalised. Accepts BOTH shapes that reach a screen: the raw
 * sub-document on an Order or a stop (`{ declared, observed, discrepancy,
 * farmerResponse }`) and the backend's own `describeGradeCheck()` payload,
 * which carries the same fields plus labels. `downgraded` is recomputed rather
 * than trusted so both shapes answer identically.
 *
 * ⚠️ `priceChanged` IS HARD FALSE and is not read off anything. A discrepancy
 * is a record; this app never reprices a lot on a driver's opinion.
 */
export function gradeCheckOf(g) {
  const declared = g?.declared || null;
  const observed = g?.observed || null;
  const discrepancy = g?.discrepancy || compareGrades(declared, observed);
  return {
    declared,
    observed,
    discrepancy,
    differs: discrepancy === 'downgrade' || discrepancy === 'upgrade',
    // The narrow one, and the one that matters: only a downgrade is worth
    // anybody's attention and only a downgrade can be answered.
    downgraded: discrepancy === 'downgrade',
    farmerResponse: g?.farmerResponse || null,
    farmerResponseNote: g?.farmerResponseNote || '',
    farmerRespondedAt: g?.farmerRespondedAt || null,
    priceChanged: false,
  };
}

/** How a farmer answered. `null` means they have not yet. */
export const GRADE_RESPONSE = { ACCEPT: 'accepted', CONTEST: 'contested' };
export const GRADE_RESPONSES = [GRADE_RESPONSE.ACCEPT, GRADE_RESPONSE.CONTEST];

/**
 * A downgrade recorded against THIS farmer's lot that they have not answered.
 *
 * This is the half that makes a downgrade mean anything: a driver typing a
 * lower grade is a CLAIM, and only the farmer conceding turns it into evidence
 * anywhere else in the app (services/trustService.js). Takes an Order, because
 * the order is the farmer's own copy of the trade.
 */
export function pendingGradeAnswer(order) {
  const g = gradeCheckOf(order?.pickupOutcome?.grade);
  if (!g.downgraded || g.farmerResponse) return null;
  // Only ever written by a stop outcome, so there is always a run behind it.
  // Guarded anyway: without an id there is nothing to post to, and offering a
  // button that cannot be satisfied is the failure this project keeps naming.
  if (!order?.consignmentId) return null;
  return g;
}

/**
 * The farmer answers a grade recorded against their own lot.
 * `POST /api/consignments/:id/stop-grade-response`, body `{ orderId, response,
 * note }`.
 *
 * ⚠️ NOT RE-OPENABLE. The write is guarded on the response never having been
 * given, so a second attempt returns 409 ALREADY_ANSWERED — the same discipline
 * as the stop outcome itself, and the same rule as a resolved dispute. A screen
 * MUST say so before the tap, not after the refusal.
 */
export function postGradeResponse(consignmentId, { orderId, response, note }) {
  return axios.post(
    `${API_ENDPOINTS.CONSIGNMENTS}/${consignmentId}/stop-grade-response`,
    { orderId, response, ...(note ? { note } : {}) }
  );
}

/**
 * The refusals this route can hand back, as CODES rather than sentences — the
 * two farmer-facing screens speak different languages and the words belong to
 * them. A 404 is folded in by name because answering someone else's lot, or a
 * run that is gone, both arrive that way and both mean "this is not yours to
 * answer".
 */
export function gradeResponseError(e) {
  if (e?.response?.status === 404) return 'NOT_YOURS';
  const code = e?.response?.data?.code;
  if (['NOTHING_TO_ANSWER', 'BAD_RESPONSE', 'ALREADY_ANSWERED'].includes(code)) return code;
  return 'GENERIC';
}

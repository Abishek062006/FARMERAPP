// services/agentJobService.js
//
// ONE CAPTAIN, ONE VEHICLE, ONE JOB — across BOTH collections.
//
// THE GAP THIS CLOSES
//   `isActiveJob` carries a partial unique index on Order (`oneActiveJobPerAgent`)
//   AND a separate one on Consignment (`oneActiveConsignmentPerAgent`). Each is
//   correct inside its own collection, and each is still needed. But a MongoDB
//   index cannot span collections, so between them they allowed the one thing
//   they exist to prevent: a captain holding an active single-farmer order AND
//   an active multi-farm consignment at the same time. One driver, one vehicle,
//   two loads in two directions — physically impossible, and the app was the
//   only thing that could have said so.
//
// SO IT IS ENFORCED HERE, IN THE APPLICATION, AT BOTH ACCEPT POINTS
//   `routes/orders.js` POST /:id/accept and `routes/consignments.js`
//   POST /:id/accept. Both keep their existing index-backed guard — this adds
//   the half no index can provide.
//
// ⚠️ THE RACE, AND WHY THE PATTERN IS CHECK → CLAIM → RE-CHECK
//   A plain read-then-write is TOCTOU-unsafe across documents: two accepts
//   racing in the two collections both read "no job anywhere", both claim, and
//   the captain ends up holding two. So each accept does:
//
//     1. check the OTHER collection            (cheap, refuses the common case)
//     2. claim, guarded as it always was       (the index still decides ties
//                                               inside this collection)
//     3. re-check the OTHER collection, and if a job appeared, UNDO the claim
//
//   That is provably safe. Suppose both claims commit. Re-check A runs after
//   claim A; re-check B after claim B. If NEITHER re-check saw the other, then
//   recheckA < commitC and recheckB < commitO, giving
//   commitO < recheckA < commitC < recheckB < commitO — a contradiction. So at
//   least one re-check sees the other job and rolls its own claim back.
//
//   Both may roll back, leaving the captain with NO job. That is the failure
//   this is tuned for: a rejected claim costs one tap and the run goes straight
//   back to the pool, while two accepted jobs strands a farmer's crop. A
//   rejected claim is fine; two accepted jobs is not.

// ── AND THE THIRD KIND OF JOB: AN FPO's OWN ASSIGNED DRIVER ────────────────
//
// IS AN FPO DRIVER SUBJECT TO THE ONE-JOB RULE AT ALL? Both halves were
// considered and they answer differently, so the rule is asymmetric on
// purpose:
//
//   THE ASSIGNMENT ITSELF IS NOT INDEX-GUARDED, AND MUST NOT BE.
//     An FPO driver is never written into `agentUid` and never carries
//     `isActiveJob` — see models/Consignment.js. Setting either would make
//     them a pool captain (losing the FPO admin's office-side fallback), and
//     `isActiveJob` on an agentless run keys the partial unique index on a
//     NULL `agentUid`, so the second such run in the whole database would fail
//     with a duplicate key. That is a bug this codebase already recorded once
//     and is not reintroducing to buy a constraint it does not need: an FPO
//     admin assigning their own driver already knows what their own vehicle is
//     doing, which is not something a captain accepting a stranger's run from
//     a public pool can know.
//
//   BUT THE PHYSICAL FACT STILL HOLDS: ONE DRIVER, ONE VEHICLE.
//     If that driver ALSO holds a captain account, nothing stopped them
//     accepting an unrelated pool job forty kilometres away while their FPO's
//     tempo was mid-collection. That is the same impossible situation the
//     cross-collection rule exists to prevent, arriving through a third door.
//     So an active FPO-driver assignment counts as a held job HERE, in the
//     application, exactly like the other two — and the assign route refuses
//     symmetrically when the named driver is already holding pool work.
//
// A run is "live" for this purpose while it can still be worked: accepted,
// collecting or in transit. A delivered, cancelled or abandoned run holds
// nobody.
const LIVE_RUN_STATUSES = ['accepted', 'collecting', 'in_transit'];

const Order = require('../models/Order');
const Consignment = require('../models/Consignment');

/**
 * The live job this person is holding — a pool run, an FPO-driver assignment,
 * or a single-farmer order — or null.
 *
 * `excludeConsignmentId` / `excludeOrderId` exist for the re-check step: the
 * job just claimed is obviously not a conflict with itself.
 */
async function activeJobOf(agentUid, { excludeOrderId = null, excludeConsignmentId = null } = {}) {
  if (!agentUid) return null;

  const orderFilter = { agentUid, isActiveJob: true };
  if (excludeOrderId) orderFilter._id = { $ne: excludeOrderId };
  const consFilter = { agentUid, isActiveJob: true };
  if (excludeConsignmentId) consFilter._id = { $ne: excludeConsignmentId };
  const driverFilter = {
    'transport.driverUid': agentUid,
    status: { $in: LIVE_RUN_STATUSES },
  };
  if (excludeConsignmentId) driverFilter._id = { $ne: excludeConsignmentId };

  const [order, consignment, driverRun] = await Promise.all([
    Order.findOne(orderFilter).select('_id cropName status farmerName').lean(),
    Consignment.findOne(consFilter).select('_id status stops.farmerName').lean(),
    Consignment.findOne(driverFilter).select('_id status stops.farmerName').lean(),
  ]);

  if (consignment)
    return {
      kind: 'consignment',
      id: consignment._id,
      status: consignment.status,
      label: `a ${consignment.stops.length}-farm shared run`,
    };
  if (driverRun)
    return {
      kind: 'fpo_run',
      id: driverRun._id,
      status: driverRun.status,
      label: `a ${driverRun.stops.length}-farm run your FPO assigned you to drive`,
    };
  if (order)
    return {
      kind: 'order',
      id: order._id,
      status: order.status,
      label: `a pickup from ${order.farmerName || 'a farm'}`,
    };
  return null;
}

/**
 * The 409 body both accept routes return, so the wording cannot drift.
 *
 * ⚠️ THE CODE NAMES THE JOB YOU ALREADY HOLD, NOT THE ONE YOU JUST ASKED FOR.
 *   That is what keeps both pre-existing contracts intact: routes/orders.js has
 *   always answered `ALREADY_BUSY` when an agent holding an order tried to take
 *   another, and routes/consignments.js has always answered `ALREADY_ON_JOB`
 *   for a captain holding a run. Those are the codes their E11000 handlers
 *   still return, and a client checking for either keeps working. `activeJob`
 *   is the precise, machine-readable half — `kind` says which collection the
 *   held job lives in, which is the thing no code could previously express.
 *   `fpo_run` joins `consignment` under `ALREADY_ON_JOB` for the same reason:
 *   it is a multi-farm run either way, and no existing client contract changes.
 */
function busyResponse(job) {
  return {
    success: false,
    code: job.kind === 'order' ? 'ALREADY_BUSY' : 'ALREADY_ON_JOB',
    error: `You are already on ${job.label}. Finish it before taking another — `
      + 'one vehicle cannot be at two farms at once.',
    activeJob: { kind: job.kind, id: job.id, status: job.status },
  };
}

module.exports = { activeJobOf, busyResponse, LIVE_RUN_STATUSES };

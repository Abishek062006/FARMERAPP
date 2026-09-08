// Phase 3, L1 — collecting produce from a farm to an FPO's godown costs
// something, and until now nobody was billed for it: the fare split across a
// collection run's stops (services/dispatchWindow.js's cousin,
// routes/consignments.js's splitFare) was computed and stored on the stop and
// then simply never charged to anybody. A captain's history counted the run
// as earned; no Order and no settlement ever recorded who owed it.
//
// ⚠️ THE APP HAS NO RAIL THAT CHARGES A FARMER DIRECTLY. The only
// farmer-directed money flow is `farmerPayout` on an Order. So "the member
// pays their own share" can only ever mean ONE thing here: deducting it from
// what they are paid the next time this crop sells — never a separate charge,
// because there is nowhere to send one.
//
// The per-kg rate is decided ONCE, at collection time (transferCollectedStock
// in routes/consignments.js), from the group's paymentMode AT THAT MOMENT,
// and stored on the held listing's `custody.freightOwedPerKg`. This module
// only ever READS that stored rate — it never re-derives paymentMode, so a
// group that switches modes later cannot rewrite what a farmer already owes
// on stock already sitting in the shed.

/**
 * How much of a sale's crop value is freight the farmer owes, for `qtyKg` of
 * `listing`. Returns { perKg, qtyKg, amount } — `amount` is 0 for any listing
 * that never passed through a collection run (custody.freightOwedPerKg is 0
 * by schema default), so a plain farm-direct sale is completely unaffected.
 *
 * ⚠️ NEVER CLAMPED. A near-zero-value crop with a real freight cost behind it
 * can, in principle, owe more in freight than this one sale is worth — same
 * doctrine as the un-clamped negative advance balance elsewhere in this app:
 * reporting the true number is more useful than hiding it behind a floor of
 * zero. The caller decides how to present a negative payout.
 */
function freightDeductionFor(listing, qtyKg) {
  const perKg = Number(listing?.custody?.freightOwedPerKg) || 0;
  if (!perKg || !qtyKg) return { perKg: 0, qtyKg: qtyKg || 0, amount: 0 };
  return { perKg, qtyKg, amount: Math.round(perKg * qtyKg * 100) / 100 };
}

module.exports = { freightDeductionFor };

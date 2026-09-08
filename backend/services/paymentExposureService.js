// services/paymentExposureService.js
//
// WHO IS OUT OF POCKET, AND FOR WHAT, AT EVERY STAGE OF ONE ORDER.
//
// ═══ WHY THIS EXISTS ══════════════════════════════════════════════════════
//
// Before advances, the answer was always the same and always bad: the farmer
// handed over the crop and carried the whole exposure until a buyer they had
// never met chose to pay. The app recorded that faithfully and said nothing
// about it.
//
// An advance splits the exposure rather than relocating it — but only if
// somebody can SEE the split. A stored `advance.agreedAmount` that no screen
// turns into "you are owed ₹18,000 for produce that has already left your
// farm" is a field, not a feature.
//
// ═══ ⚠️ NOTHING HERE MOVES, HOLDS OR GUARANTEES MONEY ═════════════════════
//
// This app has no payment rail. Every figure below is arithmetic over what the
// two parties have RECORDED. It cannot tell you that an advance was really
// sent, only that the farmer said it arrived. `disclaimer` says so and travels
// with every response.
//
// ═══ THE FOUR STAGES ══════════════════════════════════════════════════════
//
//   agreed, not received   the buyer promised an advance and it has not
//                          arrived. NOBODY is exposed yet — no crop has moved
//                          and no money has — but the promise is outstanding
//                          and the farmer should not load a truck on it.
//   advance received       the BUYER is exposed: they have parted with money
//                          for produce they do not hold.
//   produce collected      BOTH are exposed, and this is the sharp end. The
//                          farmer has parted with the crop and the buyer has
//                          parted with the advance, and while it is on a
//                          vehicle neither holds what they paid for.
//   delivered              the buyer holds the goods, so their exposure ends.
//                          The farmer is still owed the balance.
//   balance settled        nobody is exposed. Done.

/** Money figures are rupees; round to paise so a sum never shows 0.30000004. */
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Statuses in which the crop has physically left the farm. */
const CROP_HAS_MOVED = ['picked_up', 'delivered', 'stranded'];

const DISCLAIMER =
  'This app records payments; it does not move them, hold them or guarantee them. An advance shown '
  + 'as received is the farmer\'s own confirmation that it arrived, and an advance shown as agreed '
  + 'is a promise nobody has kept yet. There is no escrow here.';

/**
 * @param order  a lean Order document
 * @returns a block safe to hand to any screen
 */
function exposureFor(order) {
  const payout = money(order?.farmerPayout ?? order?.cropTotal ?? 0);
  const adv = order?.settlement?.advance || {};
  const agreed = money(adv.agreedAmount);
  const received = adv.receivedAt ? agreed : 0;
  const fullyPaid = !!order?.settlement?.farmerPaid;

  // ⚠️ THIS CAN BE NEGATIVE AND IS REPORTED NEGATIVE — the same rule as the
  // un-clamped pooling saving and the losing hold. A short pickup rewrites
  // `farmerPayout` downward (routes/consignments.js), so an advance agreed
  // against the full order can end up EXCEEDING what the lot turned out to be
  // worth. That means the farmer is holding the buyer's money, which is a real
  // situation two people have to settle, and clamping it to zero would erase
  // the only number that says so.
  const balanceDue = fullyPaid ? 0 : money(payout - received);
  const overpaid = balanceDue < 0;

  const cropMoved = CROP_HAS_MOVED.includes(order?.status);
  const delivered = order?.status === 'delivered';

  // The buyer is exposed while their money is out and the produce is not yet
  // theirs. Once it is delivered they hold the goods, so the exposure ends
  // even though the balance may still be owed — that debt is the farmer's
  // exposure, not the buyer's, and counting it on both sides would double it.
  const buyerAtRisk = (!delivered && !fullyPaid) ? received : 0;

  // The farmer is exposed from the moment the crop leaves the gate until the
  // balance is in. `stranded` is included deliberately: real produce left a
  // real farm and is owed for, whatever happened to the vehicle afterwards.
  const farmerAtRisk = (cropMoved && !fullyPaid && balanceDue > 0) ? balanceDue : 0;

  // The in-transit window, named. Both sides are exposed here and it is worth
  // a screen being able to say so in one boolean rather than comparing two
  // rupee figures to work it out.
  const bothExposed = buyerAtRisk > 0 && farmerAtRisk > 0;

  let stage;
  if (fullyPaid) stage = 'settled';
  else if (cropMoved) stage = 'awaiting_balance';
  else if (received > 0) stage = 'advance_received';
  else if (agreed > 0) stage = 'advance_agreed';
  else stage = 'no_advance';

  const pctReceived = payout > 0 ? Math.round((received / payout) * 1000) / 10 : 0;

  return {
    farmerPayout: payout,
    advance: {
      agreed,
      agreedPct: adv.agreedPct ?? 0,
      received,
      // AGREED-BUT-ABSENT IS ITS OWN NUMBER. A buyer who promised ₹20,000 and
      // sent nothing looks identical to a buyer who promised nothing, unless
      // this is reported separately.
      outstanding: money(agreed - received),
      receivedAt: adv.receivedAt || null,
      method: adv.method || null,
    },
    balanceDue,
    overpaid,
    stage,
    // ⚠️ THE HEADLINE PAIR, AND BOTH CAN BE NON-ZERO AT ONCE. In transit —
    // after the crop has left the gate and before it reaches the buyer — the
    // farmer has parted with the produce AND the buyer has parted with the
    // advance, and neither holds what they paid for. That window is the
    // riskiest moment in the whole trade and it is the one a single
    // "who is exposed" flag would hide. Reported as two numbers for exactly
    // that reason.
    buyerAtRisk,
    farmerAtRisk,
    bothExposed,
    pctReceived,
    note: NOTE[bothExposed ? 'in_transit' : stage](payout, agreed, received, balanceDue),
    disclaimer: DISCLAIMER,
  };
}

const rs = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const NOTE = {
  no_advance: (payout) =>
    `No advance was agreed on this order, so the farmer carries the whole ${rs(payout)} until the `
    + 'buyer pays. That is how this trade has always worked here and it is why advances exist — '
    + 'it is not a fault in this order, it is the exposure being named.',
  advance_agreed: (payout, agreed) =>
    `The buyer agreed an advance of ${rs(agreed)} and it has NOT been recorded as received. Nobody `
    + 'is out of pocket yet — but this is a promise, not money, and the crop should not be loaded '
    + 'on the strength of it.',
  advance_received: (payout, agreed, received) =>
    `The farmer has ${rs(received)} of the buyer's money and the buyer has no produce yet. The `
    + 'BUYER carries this until the crop is delivered.',
  // The in-transit case gets its own sentence because it is the only stage
  // where the answer to "who is carrying this" is "both of you".
  in_transit: (payout, agreed, received, balanceDue) =>
    `The crop has left the farm and has not reached the buyer. BOTH sides are carrying something `
    + `right now: the farmer is owed ${rs(balanceDue)} for produce already handed over, and the `
    + `buyer has ${rs(received)} out against produce they do not hold yet. This is the riskiest `
    + 'window in the trade and it closes on delivery.',
  awaiting_balance: (payout, agreed, received, balanceDue) => (balanceDue < 0
    ? `The advance of ${rs(received)} is MORE than this lot turned out to be worth (${rs(payout)}) `
      + `— the collected quantity came in short. The farmer is holding ${rs(-balanceDue)} of the `
      + "buyer's money and the two of them have to settle it."
    : `The crop has left the farm. The FARMER is owed ${rs(balanceDue)} and carries that until it `
      + `arrives${received > 0 ? `; the ${rs(received)} advance is already theirs.` : '.'}`),
  settled: (payout) => `Settled in full — ${rs(payout)} recorded as received by the farmer.`,
};

/**
 * Validate an advance a buyer proposes at order time.
 * Accepts a percentage OR a rupee amount, never both — a buyer sending both is
 * two different agreements and the app must not pick one for them.
 */
function resolveAdvance({ advancePct, advanceAmount }, farmerPayout) {
  const hasPct = advancePct !== undefined && advancePct !== null && advancePct !== '';
  const hasAmt = advanceAmount !== undefined && advanceAmount !== null && advanceAmount !== '';

  if (hasPct && hasAmt)
    return { error: 'ADVANCE_AMBIGUOUS', message: 'Send an advance as a percentage OR a rupee amount, not both.' };
  if (!hasPct && !hasAmt) return { agreedAmount: 0, agreedPct: 0 };

  const payout = money(farmerPayout);
  let amount;
  let pct;
  if (hasPct) {
    pct = Number(advancePct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100)
      return { error: 'BAD_ADVANCE', message: 'An advance percentage must be between 0 and 100.' };
    amount = money((payout * pct) / 100);
  } else {
    amount = Number(advanceAmount);
    if (!Number.isFinite(amount) || amount < 0)
      return { error: 'BAD_ADVANCE', message: 'An advance amount cannot be negative.' };
    amount = money(amount);
    // ⚠️ REFUSED, NOT CLAMPED. An "advance" larger than the crop is worth is
    // not an advance, and silently trimming it would record an agreement
    // neither party made.
    if (amount > payout)
      return {
        error: 'ADVANCE_EXCEEDS_PAYOUT',
        message: `An advance of ${rs(amount)} is more than the crop is worth (${rs(payout)}). `
          + 'An advance is part of the price, not more than it.',
      };
    pct = payout > 0 ? Math.round((amount / payout) * 1000) / 10 : 0;
  }
  return { agreedAmount: amount, agreedPct: pct };
}

module.exports = {
  exposureFor,
  resolveAdvance,
  CROP_HAS_MOVED,
  DISCLAIMER,
};

// services/trustService.js
//
// G2 — does this buyer actually pay?
//
// The problem statement names "payment reliability" and "buyer credentials" as
// fragmented information. Until now this app answered that with a GSTIN check
// digit, which proves a number was ISSUED and nothing about whether the person
// holding it settles their bills. Meanwhile every input for a real answer was
// already being stored and never read: Order.settlement.paidAt against
// Order.deliveredAt, Dispute.againstUid, and — since G1 — MandiSale payment
// dates for traders who will never register.
//
// TWO EVIDENCE STREAMS, DELIBERATELY NOT MERGED.
//   A registered vendor has in-app orders. A mandi trader has farmer-recorded
//   sales under a normalised name key. Joining them by name would mean
//   asserting that "Balaji Traders" at Lasalgaon IS the account holder of the
//   same name — and the whole reason buyerKeyFor() errs toward fragmenting is
//   that a wrong merge is a false accusation against a real, named person.
//   Callers ask for one or the other and get a consistently shaped answer.
//
// ⚠️ THE MANDI STREAM IS ONE-SIDED. It is the seller's account of a two-party
//   transaction, with nobody to contradict it. Every result carries `basis`
//   saying which stream it came from, and the UI must not present a
//   self-reported ledger with the same authority as a completed in-app order.

const Order = require('../models/Order');
const Dispute = require('../models/Dispute');
const MandiSale = require('../models/MandiSale');
const { buyerKeyFor } = require('./mandiSaleService');

// Below this many completed trades the ledger reports COUNTS ONLY and refuses
// to band the buyer. Two late payments must not brand a real trader, and a
// score built on one data point is worse than no score: it looks authoritative
// and is noise. Same discipline that makes D3 decline grape at 280 images and
// D5 withhold 11 crops — applied where being wrong costs a person their trade.
const MIN_TRADES_TO_SCORE = 3;

// A payment nobody has recorded after this long is treated as outstanding
// rather than merely slow. It is not a verdict — the money may have arrived
// and the farmer may not have tapped the button — so it is reported as
// "unrecorded after N days", never as "unpaid".
const OUTSTANDING_AFTER_DAYS = 30;

// Band edges, in days from obligation to payment. These are CONVENTIONS, not
// measurements — there is no published Maharashtra norm for how fast a mandi
// trader settles, and inventing one dressed as data would be exactly the kind
// of false precision this codebase refuses elsewhere. They are exported so a
// screen can show what the band means rather than just its name.
const BAND_EDGES = { prompt: 3, average: 14 };

function median(nums) {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : Math.round(((a[mid - 1] + a[mid]) / 2) * 10) / 10;
}

function daysBetween(from, to) {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 86400000));
}

/**
 * Turn a list of obligations into a trust summary.
 *
 * An "obligation" is one completed trade the buyer owed money on:
 *   { owedFrom: Date, paidOn: Date|null, amount: Number, disputed: Boolean }
 *
 * Pure — no database — so the banding rules can be tested directly against
 * constructed histories rather than against whatever happens to be in Atlas.
 */
function summarise(obligations, { basis, subject = null, minTrades = MIN_TRADES_TO_SCORE } = {}) {
  const trades = obligations.length;
  const paid = obligations.filter((o) => o.paidOn);
  const unpaid = obligations.filter((o) => !o.paidOn);

  // Only PAID trades contribute a duration. An unpaid one has no elapsed
  // payment time — counting it as 0 would make a defaulter read as the fastest
  // payer in the district, which is the exact inversion this exists to prevent.
  const durations = paid
    .map((o) => daysBetween(o.owedFrom, o.paidOn))
    .filter((d) => d != null);

  const now = Date.now();
  const outstandingAges = unpaid
    .map((o) => daysBetween(o.owedFrom, now))
    .filter((d) => d != null);
  const outstanding = outstandingAges.filter((d) => d >= OUTSTANDING_AFTER_DAYS);

  const disputes = obligations.filter((o) => o.disputed).length;

  const medianDays = median(durations);
  const oldestUnrecordedDays = outstandingAges.length ? Math.max(...outstandingAges) : null;

  const base = {
    subject,
    basis,                       // 'in_app' | 'mandi_records'
    trades,
    paidCount: paid.length,
    unpaidCount: unpaid.length,
    // Deliberately NOT called "defaulted". The money may have arrived without
    // anyone tapping a button, and this app has no payment rail to know.
    unrecordedAfter30d: outstanding.length,
    oldestUnrecordedDays,
    medianDaysToPay: medianDays,
    disputes,
    disputeRate: trades ? Math.round((disputes / trades) * 1000) / 10 : 0,
    totalValue: Math.round(obligations.reduce((a, o) => a + (Number(o.amount) || 0), 0)),
    minTradesToScore: minTrades,
  };

  // ── the refusal path ────────────────────────────────────────────────
  if (trades < minTrades) {
    return {
      ...base,
      scored: false,
      band: null,
      reason: trades === 0
        ? 'No completed trades recorded with this buyer yet.'
        : `Only ${trades} completed trade${trades === 1 ? '' : 's'} recorded — too few to say anything about how they pay.`,
      // The counts above are still returned. A farmer can read them and draw
      // their own conclusion; what the app refuses to do is turn them into a
      // verdict it cannot support.
    };
  }

  let band;
  if (medianDays == null) band = 'unpaid';
  else if (outstanding.length > 0) band = 'slow';
  else if (medianDays <= BAND_EDGES.prompt) band = 'prompt';
  else if (medianDays <= BAND_EDGES.average) band = 'average';
  else band = 'slow';

  return {
    ...base,
    scored: true,
    band,
    reason: null,
  };
}

/**
 * A REGISTERED VENDOR's record inside this app.
 *
 * The obligation starts at delivery, not at order placement: the vendor does
 * not owe the farmer anything until the crop has actually arrived, and dating
 * it from the order would penalise a buyer for the agent's travel time.
 */
async function forVendor(vendorUid) {
  const [orders, disputes] = await Promise.all([
    Order.find({ vendorUid, status: 'delivered' })
      .select('deliveredAt settlement farmerPayout')
      .lean(),
    Dispute.find({ againstUid: vendorUid })
      .select('orderId status')
      .lean(),
  ]);

  // A withdrawn dispute is not evidence of anything — the person who raised it
  // took it back. Counting it would let anyone damage a buyer by filing and
  // retracting.
  const disputedOrders = new Set(
    disputes.filter((d) => d.status !== 'withdrawn').map((d) => String(d.orderId))
  );

  return summarise(
    orders.map((o) => ({
      owedFrom: o.deliveredAt || o.createdAt,
      paidOn: o.settlement && o.settlement.farmerPaid ? o.settlement.paidAt : null,
      amount: o.farmerPayout,
      disputed: disputedOrders.has(String(o._id)),
    })),
    { basis: 'in_app', subject: { vendorUid } }
  );
}

/**
 * A MANDI BUYER's record, assembled from what farmers wrote down.
 *
 * `farmerUid` narrows it to one farmer's own experience. Left out, it pools
 * every farmer's records of that buyer — which is the point of the normalised
 * key, and the only way a first-time seller learns anything about a trader
 * before handing over a tonne of onion.
 */
async function forBuyerKey(buyerKey, { farmerUid = null } = {}) {
  if (!buyerKey) return summarise([], { basis: 'mandi_records', subject: { buyerKey } });

  const q = { 'buyer.key': buyerKey };
  if (farmerUid) q.farmerUid = farmerUid;

  const sales = await MandiSale.find(q)
    .select('saleDate payment netAmount buyer market farmerUid')
    .lean();

  const s = summarise(
    sales.map((x) => ({
      owedFrom: x.saleDate,
      paidOn: x.payment && x.payment.receivedOn ? x.payment.receivedOn : null,
      amount: x.netAmount,
      disputed: false,          // mandi records carry no dispute channel
    })),
    { basis: 'mandi_records', subject: { buyerKey } }
  );

  // How many DIFFERENT farmers this rests on. One farmer's ten sales to the
  // same trader is a much weaker signal than ten farmers' one each, and a
  // reader deserves to be able to tell those apart.
  s.reportedByFarmers = new Set(sales.map((x) => x.farmerUid)).size;
  s.buyerName = sales.length ? sales[sales.length - 1].buyer.name : null;
  s.marketName = sales.length ? sales[sales.length - 1].market.name : null;
  return s;
}

/**
 * Every buyer one farmer has recorded, worst-paying first.
 *
 * This is the farmer's own answer to "who actually pays me", which is a
 * different and more immediately useful question than any per-buyer badge.
 */
async function buyersForFarmer(farmerUid) {
  const sales = await MandiSale.find({ farmerUid })
    .select('saleDate payment netAmount buyer market')
    .lean();

  const byKey = new Map();
  for (const s of sales) {
    const k = s.buyer.key || buyerKeyFor(s.buyer.name, s.market && s.market.name);
    if (!byKey.has(k)) byKey.set(k, { key: k, name: s.buyer.name, market: s.market && s.market.name, rows: [] });
    byKey.get(k).rows.push(s);
  }

  const out = [...byKey.values()].map(({ key, name, market, rows }) => ({
    buyerKey: key,
    buyerName: name,
    marketName: market || '',
    ...summarise(
      rows.map((x) => ({
        owedFrom: x.saleDate,
        paidOn: x.payment && x.payment.receivedOn ? x.payment.receivedOn : null,
        amount: x.netAmount,
        disputed: false,
      })),
      { basis: 'mandi_records', subject: { buyerKey: key } }
    ),
  }));

  // Anything with money unrecorded goes to the top — that is what a farmer
  // opened this screen to find. Then slowest median, then most traded.
  const rank = (b) => (b.unrecordedAfter30d > 0 ? 0 : b.unpaidCount > 0 ? 1 : 2);
  out.sort((a, b) =>
    rank(a) - rank(b)
    || (b.medianDaysToPay ?? -1) - (a.medianDaysToPay ?? -1)
    || b.trades - a.trades);

  return out;
}

/**
 * A FARMER's record — the mirror of forVendor(), and the thing that makes
 * self-declared grading cost something.
 *
 * THE HOLE THIS CLOSES. Grades are `selfDeclared` and nobody checks them at
 * listing time. D3 can corroborate freshness and crop type from a photo; it
 * cannot judge size or colour uniformity, and no public Indian dataset would
 * make that claim true. So nothing stopped a farmer putting Grade C potato on
 * the market as Grade A.
 *
 * The answer is not better computer vision. It is the same answer a mandi has
 * always used: a reputation that follows you. A buyer about to purchase sees
 * how often this farmer's lots were disputed on quality, and how often the
 * farmer conceded. Mis-grading stops being free.
 *
 * ⚠️ A DISPUTE RAISED IS NOT A DISPUTE UPHELD. This app does not adjudicate —
 * it records what was claimed and what the two parties agreed. So `disputes`
 * and `conceded` are reported SEPARATELY: a farmer with three complaints who
 * conceded none reads very differently from one who refunded every time, and
 * collapsing them into a single "trust score" would let any buyer damage a
 * farmer by filing complaints they never pursue.
 *
 * ── THE SECOND EVIDENCE STREAM: THE FARM GATE ─────────────────────────────
 *
 * A dispute is raised days later, by a buyer who is looking at produce that
 * has been on a truck. The pickup is the one moment somebody sees the lot
 * where it was grown, and `Order.pickupOutcome.grade` now records what they
 * saw against what was declared (see data/gateRecord.js).
 *
 * That stream is folded in HERE and nowhere else, under exactly the rule this
 * file already runs on:
 *
 *   A GATE DOWNGRADE IS A CLAIM. It is counted, reported and visible, and by
 *   itself it does NOT move the band — the same treatment an unconceded
 *   dispute gets, and for the same reason. The person recording it is the
 *   driver whose own performance is being judged in the same breath, about
 *   produce the farmer can no longer show anybody.
 *
 *   A GATE DOWNGRADE THE FARMER ACCEPTED IS A CONCESSION. The farmer answered
 *   it themselves through POST /api/consignments/:id/stop-grade-response and
 *   agreed the lot was the lower grade. That is the same evidence class as
 *   agreeing a refund, and it is treated identically.
 *
 * ⚠️ THE REFUSAL RULES ARE UNTOUCHED. `MIN_TRADES_TO_SCORE` still gates on
 * completed DELIVERIES, and the gate stream cannot manufacture one: it is read
 * off the very same delivered orders the denominator is counted from. A farmer
 * with two deliveries and two accepted downgrades is still `scored: false`,
 * exactly as before — being wrong about a person with three data points is
 * what that threshold exists to refuse, and more kinds of evidence about too
 * few trades is still too few trades.
 *
 * Both streams are DEDUPLICATED BY ORDER. A lot downgraded at the gate and
 * then disputed and refunded is one bad lot, not two, and counting it twice
 * would let a single trade push a farmer a whole band.
 */
async function forFarmer(farmerUid) {
  const [orders, disputes] = await Promise.all([
    Order.find({ farmerUid, status: 'delivered' })
      .select('deliveredAt settlement farmerPayout pickupOutcome')
      .lean(),
    Dispute.find({ againstUid: farmerUid, againstRole: 'farmer' })
      .select('orderId status reason resolution')
      .lean(),
  ]);

  // Withdrawn = the complainant took it back. Not evidence of anything, and
  // counting it would let anyone damage a farmer by filing and retracting.
  const live = disputes.filter((d) => d.status !== 'withdrawn');

  const QUALITY = new Set(['quality_not_as_described', 'wrong_crop', 'quantity_short']);
  const quality = live.filter((d) => QUALITY.has(d.reason));

  // The farmer gave something back. The closest this app gets to "upheld",
  // and it is an agreement between two people, not a ruling.
  const CONCEDED = new Set(['refund_agreed', 'partial_refund_agreed', 'replacement_agreed']);
  const conceded = live.filter((d) => d.resolution && CONCEDED.has(d.resolution.outcome));

  // ── WHAT THE PERSON AT THE GATE SAW ──────────────────────────────────
  // Read off the SAME delivered orders the denominator is counted from, so no
  // gate record can exist for a trade that is not already in `deliveries`.
  const gradeOf = (o) => o.pickupOutcome?.grade || {};
  const gateChecked = orders.filter((o) => gradeOf(o).observed || gradeOf(o).declared);
  const gateDowngrades = orders.filter((o) => gradeOf(o).discrepancy === 'downgrade');
  const gateAccepted = gateDowngrades.filter((o) => gradeOf(o).farmerResponse === 'accepted');
  const gateContested = gateDowngrades.filter((o) => gradeOf(o).farmerResponse === 'contested');

  const deliveries = orders.length;
  const base = {
    subject: { farmerUid },
    basis: 'in_app',
    deliveries,
    disputes: live.length,
    qualityDisputes: quality.length,
    conceded: conceded.length,
    qualityDisputeRate: deliveries ? Math.round((quality.length / deliveries) * 1000) / 10 : 0,
    // Reported as its own block, never merged into the dispute counts above.
    // "Three buyers complained afterwards" and "three collectors wrote down a
    // lower grade at the gate" are different events with different witnesses,
    // and a reader has to be able to tell which they are looking at.
    gateGrade: {
      checked: gateChecked.length,
      downgrades: gateDowngrades.length,
      // The only one of the three that reaches the band. See the header.
      accepted: gateAccepted.length,
      contested: gateContested.length,
      unanswered: gateDowngrades.length - gateAccepted.length - gateContested.length,
      note: 'A grade recorded at the farm gate is one person\'s observation, not an inspection. Only '
        + 'a downgrade the FARMER accepted counts as evidence here — an unanswered or contested one '
        + 'is reported and does not decide the band, exactly as an unconceded complaint does not.',
    },
    // Reasons, so a buyer can tell "short weight" from "wrong crop" — they are
    // different problems and a single rate hides which one this farmer has.
    byReason: [...new Set(live.map((d) => d.reason))].map((r) => ({
      reason: r, count: live.filter((d) => d.reason === r).length,
    })),
    minTradesToScore: MIN_TRADES_TO_SCORE,
  };

  if (deliveries < MIN_TRADES_TO_SCORE) {
    return {
      ...base, scored: false, band: null,
      reason: deliveries === 0
        ? 'No completed deliveries recorded for this farmer yet.'
        : `Only ${deliveries} completed deliver${deliveries === 1 ? 'y' : 'ies'} — too few to say anything about their lots.`,
    };
  }

  // BANDING IS DRIVEN BY WHAT THE FARMER CONCEDED, not by how often they were
  // complained about.
  //
  // The first version banded on the raw complaint RATE, which contradicted this
  // file's own rule that a complaint raised is not a complaint upheld — one
  // grumble across four deliveries is 25% and came out as "frequent", branding
  // a farmer on a single unresolved claim. On the small delivery counts a real
  // smallholder has, a rate is mostly noise, and the person who pays for that
  // noise is the one with the least power in the trade.
  //
  // Unconceded complaints still SHOW — they are in `qualityDisputes` and
  // `byReason` — they just do not decide the label.
  const concededRate = deliveries ? (conceded.length / deliveries) * 100 : 0;

  // ── BOTH STREAMS, DEDUPLICATED BY ORDER ──────────────────────────────
  // A lot downgraded at the gate and then disputed and refunded is ONE bad
  // lot. Counting it once in each stream would let a single trade carry a
  // farmer a whole band, which is the opposite of what a threshold built to
  // refuse small numbers is for.
  const claimOrders = new Set(quality.map((d) => String(d.orderId)));
  for (const o of gateDowngrades) claimOrders.add(String(o._id));

  const agreedOrders = new Set(conceded.map((d) => String(d.orderId)));
  for (const o of gateAccepted) agreedOrders.add(String(o._id));

  const agreedShortfalls = agreedOrders.size;
  const agreedShortfallRate = deliveries ? (agreedShortfalls / deliveries) * 100 : 0;

  // The thresholds are the ones that were already here, applied to the union.
  // With no gate records at all every term below collapses to the dispute-only
  // values, so a farmer whose history predates this stream bands exactly as
  // they did before.
  let band;
  if (claimOrders.size === 0) band = 'clean';
  else if (agreedShortfalls === 0) band = 'few_complaints';
  else if (agreedShortfalls >= 3 || agreedShortfallRate > 25) band = 'frequent';
  else band = 'some_upheld';

  return {
    ...base,
    // Kept meaning exactly what it meant before — disputes conceded, out of
    // deliveries. It is NOT the number the band is computed from any more, so
    // the two are reported side by side rather than one standing in for the
    // other.
    concededRate: Math.round(concededRate * 10) / 10,
    // What the band actually reads: distinct lots this farmer agreed fell
    // short, whether that agreement was a refund on a grievance or accepting a
    // lower grade at their own gate.
    agreedShortfalls,
    agreedShortfallRate: Math.round(agreedShortfallRate * 10) / 10,
    // And the claims against them, deduplicated the same way.
    claimedShortfalls: claimOrders.size,
    scored: true,
    band,
    reason: null,
  };
}

module.exports = {
  MIN_TRADES_TO_SCORE,
  OUTSTANDING_AFTER_DAYS,
  BAND_EDGES,
  summarise,
  forVendor,
  forFarmer,
  forBuyerKey,
  buyersForFarmer,
  median,
  daysBetween,
};

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const MandiSale = require('../models/MandiSale');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { resolveDistrict } = require('../services/geoService');
const {
  CHANNELS, buyerKeyFor, netOf, totalDeductions,
  normaliseDeductions, reconcileGross, daysToPayment, round2,
} = require('../services/mandiSaleService');
const trust = require('../services/trustService');

// G1 — the farmer records a sale that did NOT go through this app.
//
// Everything else in the marketplace assumes the trade ran through
// Offer → Order → settlement. Almost none do. These routes are how the app
// finds out what actually happened at the APMC, and they are deliberately the
// lowest-friction write in the codebase: no counterparty account, no stock
// movement, no state machine. A farmer with a crumpled slip and two minutes
// must be able to finish.
//
// NOTHING HERE IS VERIFIED, and no route in this file pretends otherwise.
// It is one party's account of a two-party transaction.

const MAX_FUTURE_DAYS = 1;      // a sale "tomorrow" is a typo, not a sale
const MAX_AGE_YEARS = 2;

/** Shape one sale for the client, with the derived numbers it should not recompute. */
function present(doc) {
  const s = doc.toObject ? doc.toObject() : doc;
  return {
    ...s,
    deductionsTotal: totalDeductions(s.deductions),
    daysToPayment: daysToPayment(s.saleDate, s.payment && s.payment.receivedOn),
    // A sale is outstanding until the farmer says the money came. Derived here
    // rather than stored so it cannot drift out of step with payment.receivedOn.
    paid: !!(s.payment && s.payment.receivedOn),
  };
}

/**
 * POST /api/mandi-sales — record a completed sale.
 */
router.post('/', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const {
      commodity, quantityKg, grade, buyerName, buyerPhone, channel,
      marketName, marketDistrict, pricePerKg, grossAmount, deductions,
      saleDate, paymentTerms, paymentDueDate, receivedOn, amountReceived,
      adviceShown, adviceFollowed, notes,
    } = req.body;

    if (!commodity || !String(commodity).trim())
      return res.status(400).json({ success: false, error: 'What did you sell?' });

    const qty = Number(quantityKg);
    if (!Number.isFinite(qty) || qty <= 0)
      return res.status(400).json({ success: false, error: 'How much did you sell?' });

    if (!buyerName || !String(buyerName).trim())
      return res.status(400).json({
        success: false, error: 'Who bought it? A name is enough — they do not need an account.',
      });

    const rate = Number(pricePerKg);
    if (!Number.isFinite(rate) || rate < 0)
      return res.status(400).json({ success: false, error: 'What rate did you get?' });

    if (grade && !['A', 'B', 'C'].includes(grade))
      return res.status(400).json({ success: false, error: 'Grade must be A, B or C' });

    if (channel && !CHANNELS.includes(channel))
      return res.status(400).json({ success: false, error: `channel must be one of ${CHANNELS.join(', ')}` });

    // Date sanity. A sale dated next month is a mis-tap on a date picker, and
    // letting it through would corrupt every days-to-payment figure computed
    // from it — including other farmers', once this buyer is in the ledger.
    const when = saleDate ? new Date(saleDate) : new Date();
    if (Number.isNaN(when.getTime()))
      return res.status(400).json({ success: false, error: 'When did you sell it?' });
    const now = new Date();
    if (when.getTime() > now.getTime() + MAX_FUTURE_DAYS * 86400000)
      return res.status(400).json({ success: false, error: 'That date is in the future' });
    if (when.getTime() < now.getTime() - MAX_AGE_YEARS * 365 * 86400000)
      return res.status(400).json({ success: false, error: `Records older than ${MAX_AGE_YEARS} years cannot be added` });

    const lines = normaliseDeductions(deductions);

    // The slip is the fact. If the farmer typed a gross, keep it even when it
    // disagrees with rate × quantity — auctions round, lots weigh short, rates
    // get revised. We flag the disagreement back to them instead of silently
    // "correcting" a number they read off a piece of paper.
    const gross = Number.isFinite(Number(grossAmount)) && Number(grossAmount) > 0
      ? round2(grossAmount)
      : round2(rate * qty);
    const check = reconcileGross(rate, qty, gross);

    const net = netOf(gross, lines);
    if (net < 0)
      return res.status(400).json({
        success: false, code: 'DEDUCTIONS_EXCEED_GROSS',
        error: `Deductions (₹${totalDeductions(lines)}) are more than the sale itself (₹${gross}). Check the slip.`,
      });

    // District: prefer what the farmer typed, else fall back to their own.
    // resolveDistrict returns null rather than guessing, and null is stored as
    // null — the same rule RegisterScreen follows after the Chennai bug.
    const district = (marketDistrict && resolveDistrict(marketDistrict))
      || (req.profile.location && resolveDistrict(req.profile.location.district))
      || '';

    const paidOn = receivedOn ? new Date(receivedOn) : null;
    if (paidOn && Number.isNaN(paidOn.getTime()))
      return res.status(400).json({ success: false, error: 'Payment date is not a date' });
    if (paidOn && paidOn.getTime() < when.getTime())
      return res.status(400).json({ success: false, error: 'Payment cannot arrive before the sale' });

    const sale = await MandiSale.create({
      // Identity from the verified profile, never the body — same rule as
      // everywhere else in this codebase.
      farmerUid:  req.firebaseUid,
      farmerName: req.profile.name || '',

      commodity: String(commodity).trim(),
      quantityKg: qty,
      grade: grade || null,

      buyer: {
        name:    String(buyerName).trim(),
        phone:   String(buyerPhone || '').trim(),
        channel: channel || 'trader',
        key:     buyerKeyFor(buyerName, marketName),
      },
      market: {
        name:     String(marketName || '').trim(),
        district,
      },

      pricePerKg: rate,
      grossAmount: gross,
      deductions: lines,
      netAmount: net,
      saleDate: when,

      payment: {
        terms:      paymentTerms === 'credit' ? 'credit' : 'immediate',
        dueDate:    paymentDueDate ? new Date(paymentDueDate) : null,
        receivedOn: paidOn,
        amountReceived: Number.isFinite(Number(amountReceived)) ? round2(amountReceived) : null,
      },

      advice: {
        shown: ['sell_now', 'hold', 'neutral'].includes(adviceShown) ? adviceShown : null,
        followed: typeof adviceFollowed === 'boolean' ? adviceFollowed : null,
      },

      notes: String(notes || '').slice(0, 500),
    });

    res.status(201).json({
      success: true,
      sale: present(sale),
      // Surfaced, not enforced. The client shows it as a question.
      reconciliation: check.mismatch ? check : null,
    });
  } catch (err) {
    console.error('POST /mandi-sales', err);
    res.status(500).json({ success: false, error: 'Could not save that sale' });
  }
});

/**
 * GET /api/mandi-sales/mine — the farmer's own record book.
 */
router.get('/mine', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const sales = await MandiSale.find({ farmerUid: req.firebaseUid })
      .sort({ saleDate: -1 })
      .limit(limit);

    const shaped = sales.map(present);

    // A running total the farmer can check against their own memory, and the
    // one number this feature exists to make visible: what the deductions took.
    const gross = round2(shaped.reduce((a, s) => a + s.grossAmount, 0));
    const taken = round2(shaped.reduce((a, s) => a + s.deductionsTotal, 0));

    res.json({
      success: true,
      count: shaped.length,
      totals: {
        grossAmount: gross,
        deductions: taken,
        netAmount: round2(gross - taken),
        deductionsPct: gross > 0 ? Math.round((taken / gross) * 1000) / 10 : 0,
        unpaid: shaped.filter((s) => !s.paid).length,
      },
      sales: shaped,
    });
  } catch (err) {
    console.error('GET /mandi-sales/mine', err);
    res.status(500).json({ success: false, error: 'Could not load your sales' });
  }
});

/**
 * GET /api/mandi-sales/buyers — who actually pays me?
 *
 * The farmer's own ledger of every buyer they have recorded, worst-paying
 * first. Declared ABOVE the /:id routes: this codebase has had Express
 * shadowing bugs twice (PUT /users/business under PUT /:firebaseUid, and
 * GET /orders/export.csv under GET /:id), and a literal path added below a
 * wildcard is the way it happens both times.
 */
router.get('/buyers', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const buyers = await trust.buyersForFarmer(req.firebaseUid);
    res.json({
      success: true,
      count: buyers.length,
      minTradesToScore: trust.MIN_TRADES_TO_SCORE,
      buyers,
    });
  } catch (err) {
    console.error('GET /mandi-sales/buyers', err);
    res.status(500).json({ success: false, error: 'Could not load your buyers' });
  }
});

/**
 * GET /api/mandi-sales/buyer?name=&market= — check a trader BEFORE selling.
 *
 * Pools what every farmer has recorded about this buyer, not just the caller's
 * own experience. That pooling is the entire reason buyerKeyFor() normalises
 * names, and it is the only way a first-time seller learns anything about a
 * trader before handing over a tonne of onion.
 *
 * The key is computed here rather than taken from the client: it contains a
 * pipe and often Devanagari, so passing it through a URL path invites encoding
 * bugs, and a client-supplied key could be used to point the lookup anywhere.
 */
router.get('/buyer', requireAuth, async (req, res) => {
  try {
    const { name, market } = req.query;
    if (!name || !String(name).trim())
      return res.status(400).json({ success: false, error: 'Which buyer?' });

    const key = buyerKeyFor(name, market);
    const record = await trust.forBuyerKey(key);

    res.json({
      success: true,
      query: { name: String(name).trim(), market: String(market || '').trim(), key },
      trust: record,
      // Said on every response, not left to the UI to remember. This is one
      // side's account of a two-party trade with nobody to contradict it.
      disclaimer: 'Based only on what farmers have recorded themselves. Nobody verifies these entries.',
    });
  } catch (err) {
    console.error('GET /mandi-sales/buyer', err);
    res.status(500).json({ success: false, error: 'Could not look up that buyer' });
  }
});

/**
 * PATCH /api/mandi-sales/:id/payment — the money arrived.
 *
 * Guarded findOneAndUpdate with ownership in the FILTER, not a read-then-save:
 * the same concurrency rule as every other state change in this codebase.
 */
router.patch('/:id/payment', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ success: false, error: 'No such sale' });

    const { receivedOn, amountReceived } = req.body;
    const paidOn = receivedOn ? new Date(receivedOn) : new Date();
    if (Number.isNaN(paidOn.getTime()))
      return res.status(400).json({ success: false, error: 'Payment date is not a date' });

    const existing = await MandiSale.findOne({
      _id: req.params.id, farmerUid: req.firebaseUid,
    }).select('saleDate').lean();
    if (!existing) return res.status(404).json({ success: false, error: 'No such sale' });

    if (paidOn.getTime() < new Date(existing.saleDate).getTime())
      return res.status(400).json({ success: false, error: 'Payment cannot arrive before the sale' });

    const sale = await MandiSale.findOneAndUpdate(
      { _id: req.params.id, farmerUid: req.firebaseUid },
      {
        $set: {
          'payment.receivedOn': paidOn,
          'payment.amountReceived': Number.isFinite(Number(amountReceived))
            ? round2(amountReceived) : null,
        },
      },
      { new: true }
    );
    if (!sale) return res.status(404).json({ success: false, error: 'No such sale' });

    res.json({ success: true, sale: present(sale) });
  } catch (err) {
    console.error('PATCH /mandi-sales/:id/payment', err);
    res.status(500).json({ success: false, error: 'Could not update that sale' });
  }
});

/**
 * DELETE /api/mandi-sales/:id — the farmer mistyped.
 *
 * A hand-entered record with no counterparty and no money movement has no
 * reason to be immutable. An Order cannot be deleted because someone else is
 * relying on it; this is one person's own note about their own sale.
 */
router.delete('/:id', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ success: false, error: 'No such sale' });
    const gone = await MandiSale.findOneAndDelete({
      _id: req.params.id, farmerUid: req.firebaseUid,
    });
    if (!gone) return res.status(404).json({ success: false, error: 'No such sale' });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /mandi-sales/:id', err);
    res.status(500).json({ success: false, error: 'Could not remove that sale' });
  }
});

module.exports = router;

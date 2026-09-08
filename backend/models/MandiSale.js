// models/MandiSale.js
const mongoose = require('mongoose');

// A SALE THAT HAPPENED SOMEWHERE ELSE.
//
// Until this model existed the app could only see trades that ran through its
// own Offer → Order → settlement path. Almost no real trade does. A farmer who
// reads "onion is 12% above its 30-day average, sell now", walks to Lasalgaon
// and sells to a trader there was invisible the moment he left the screen: no
// price realised, no record, no history on that trader, and no evidence the
// advice was worth anything.
//
// That blindness is not a small gap. It means the buyer-trust ledger can only
// ever describe buyers who already use the app — the smallest and least risky
// set of buyers — and it means the sale-window model can never be scored
// against what farmers actually got.
//
// WHY THIS IS NOT AN Order.
//   Order assumes an in-app vendor with an account, an agent, a drop-off, two
//   handover codes and a settlement flow between two registered users. A mandi
//   sale has none of those. Forcing it into Order would mean nullable holes
//   through the most heavily tested model in the codebase, and every guard in
//   routes/orders.js would need a "unless it is a mandi sale" branch. Separate
//   model, clean shape, no shared state.
//
// ⚠️ EVERY FIGURE HERE IS SELF-REPORTED BY THE FARMER AND NOBODY CHECKS IT.
//   Same standing as CropListing.grade.selfDeclared. It is a farmer's own
//   record of their own sale — useful, and honest about being one-sided.
//   Anything built on top of it (see services/trustService.js) inherits that
//   and must say so rather than presenting it as verified fact.

// One line of a deduction slip. Kept as line items rather than a single total
// because the total is exactly what hides the problem: Rajendra Chavan of
// Barshi sold 512 kg of onion for ₹512 and took home ₹2.49, and the only way
// to see that is to see labour, weighing, transport and commission itemised
// against the gross. A lump "charges: ₹509.51" is the trader's version of the
// story.
const DeductionSchema = new mongoose.Schema({
  label:  { type: String, required: true, trim: true, maxlength: 60 },
  amount: { type: Number, required: true, min: 0 },
}, { _id: false });

// What the farmer sold through. Not an exhaustive taxonomy — enough to tell
// an APMC auction apart from a farm-gate sale to a passing trader, because
// those two carry very different bargaining positions.
// Kept in sync with CHANNELS in services/mandiSaleService.js, which is where
// the pure helpers live — every other model here is a bare export and this one
// should not be the exception that makes people look for logic in models/.
const CHANNELS = ['apmc', 'trader', 'processor', 'fpo', 'farmgate', 'export', 'other'];

const MandiSaleSchema = new mongoose.Schema({
  farmerUid:  { type: String, required: true, index: true },
  farmerName: { type: String, default: '' },

  commodity:  { type: String, required: true, index: true },
  quantityKg: { type: Number, required: true, min: 0.1 },
  // Self-declared, exactly as on a listing. A farmer recording what they were
  // PAID for is a different claim from what they believe they delivered, and
  // the gap between the two is often the dispute.
  grade:      { type: String, enum: ['A', 'B', 'C', null], default: null },

  // ── who bought it ───────────────────────────────────────────────────────
  // FREE TEXT, DELIBERATELY. A mandi trader will never register on this app,
  // and requiring an account here would restrict the trust ledger to exactly
  // the buyers who least need scrutiny. The name a farmer writes is the name
  // the trader is known by at that market, which is the identity that actually
  // carries reputation there.
  buyer: {
    name:    { type: String, required: true, trim: true, maxlength: 120 },
    phone:   { type: String, default: '', trim: true, maxlength: 20 },
    channel: { type: String, enum: CHANNELS, default: 'trader' },
    // Set by the route, never the client. Normalises name + market so the same
    // trader accrues history across different farmers who spell him slightly
    // differently. See buyerKeyFor().
    key:     { type: String, default: '', index: true },
  },

  market: {
    name:     { type: String, default: '', trim: true, maxlength: 120 },
    district: { type: String, default: '', index: true },
  },

  // ── the money ───────────────────────────────────────────────────────────
  pricePerKg:  { type: Number, required: true, min: 0 },
  // Stored, not derived on read, because a farmer may record a rounded figure
  // from the slip that does not divide exactly by the quantity — and the slip
  // is the fact. Reconciled in the route, which warns rather than overwrites.
  grossAmount: { type: Number, required: true, min: 0 },
  deductions:  { type: [DeductionSchema], default: [] },
  netAmount:   { type: Number, required: true },

  saleDate: { type: Date, required: true, index: true },

  // ── did the money actually arrive ───────────────────────────────────────
  // The whole point of the trust ledger. `receivedOn` stays null until the
  // farmer says otherwise; an unpaid sale is NOT the same as a sale paid on
  // day zero, and code that treats a missing date as 0 days will report every
  // defaulter as the fastest payer in the district.
  payment: {
    terms:          { type: String, enum: ['immediate', 'credit'], default: 'immediate' },
    dueDate:        { type: Date, default: null },
    receivedOn:     { type: Date, default: null },
    amountReceived: { type: Number, default: null },
  },

  // ── did our advice help ─────────────────────────────────────────────────
  // Optional, and only set when the farmer arrived here from a sale-window
  // card. This is the only way the app can ever score D1/D2 against what a
  // farmer actually got, rather than against a held-out price series.
  advice: {
    shown:    { type: String, enum: ['sell_now', 'hold', 'neutral', null], default: null },
    followed: { type: Boolean, default: null },
  },

  notes: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

// One farmer's sales, newest first — the list screen's only query.
MandiSaleSchema.index({ farmerUid: 1, saleDate: -1 });
// The trust ledger's rollup: everything a given buyer has been recorded doing.
MandiSaleSchema.index({ 'buyer.key': 1, saleDate: -1 });

module.exports = mongoose.model('MandiSale', MandiSaleSchema);

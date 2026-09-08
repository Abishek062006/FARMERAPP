// models/FpoLotRequest.js
const mongoose = require('mongoose');

// A BUYER'S REQUEST TO BUY ONE OF AN FPO's GRADE LOTS — pending the group
// admin's Accept or Reject.
//
// Every other purchase in this app (a single farmer's listing, an FPO's own
// lot) used to confirm the instant a buyer tapped Confirm — `buildLotQuote()`
// and the atomic stock-take/Order/Consignment write in routes/fpos.js are
// still exactly that mechanism, unchanged. What sits in FRONT of it now is
// this document: a buyer's request records everything `executeLotCommit()`
// will need, and NOTHING is taken from the market until an admin accepts.
//
// NOT A Requirement (models/Requirement.js) and NOT an Offer. A Requirement
// is a buyer's standing want with no specific lot attached; an Offer proposes
// a price on a single farmer's listing. This is neither — it is a fully
// PRICED, ALLOCATED purchase (buildLotQuote already ran) waiting on one
// yes/no, not a negotiation.
const FpoLotRequestSchema = new mongoose.Schema({
  fpoId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Fpo', required: true, index: true },
  fpoName: { type: String, default: '' },

  // Same field names Order uses for the buyer, so a request and the Order it
  // becomes describe the same person the same way.
  vendorUid:     { type: String, required: true, index: true },
  vendorName:    { type: String, default: '' },
  vendorPhone:   { type: String, default: '' },
  vendorCompany: { type: String, default: '' },

  lotKey:     { type: String, required: true },
  cropName:   { type: String, required: true },
  gradeKey:   { type: String, required: true },
  gradeLabel: { type: String, default: '' },
  quantityKg: { type: Number, required: true },

  // The exact body resolveLotQuote()/executeLotCommit() need to re-run this
  // purchase at accept time — quoteRef, dropoff, advancePct, idempotencyKey.
  // Stored verbatim rather than re-derived so accept works from what the
  // BUYER agreed to, not from whatever the admin's own request happens to
  // carry.
  requestBody: { type: mongoose.Schema.Types.Mixed, required: true },

  // For display only — never read back into the commit. Lets the admin's
  // screen show who supplies what at what price without re-querying.
  quoteSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },

  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'withdrawn', 'stale'],
    default: 'pending',
    index: true,
  },
  requestedAt: { type: Date, default: Date.now },
  respondedAt: { type: Date, default: null },
  respondedBy: { type: String, default: null },
  rejectionReason: { type: String, default: '', maxlength: 300 },

  // Set only once accepted, so the request and the sale it produced can be
  // traced from either direction without a second lookup.
  resultOrderIds:      { type: [mongoose.Schema.Types.ObjectId], default: [] },
  resultConsignmentId: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });

FpoLotRequestSchema.index({ fpoId: 1, status: 1, requestedAt: -1 });
FpoLotRequestSchema.index({ vendorUid: 1, requestedAt: -1 });

module.exports = mongoose.model('FpoLotRequest', FpoLotRequestSchema);

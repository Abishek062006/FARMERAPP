// models/FpoProcurement.js
const mongoose = require('mongoose');

// A FARMER SELLING DIRECTLY TO THEIR OWN FPO, AT THE GROUP'S AGREED RATE.
//
// ═══ WHY THIS EXISTS ═══════════════════════════════════════════════════════
//
// REPORTED DIRECTLY: a farmer who has joined a procurement-mode FPO had no
// way to sell to that FPO at all — the only screen available was the open
// market, which is a Facilitation-shaped idea (the FPO never buys anything in
// that mode; it only bundles a member's own listing for whichever OUTSIDE
// buyer purchases it). Under Procurement the group has agreed to buy the
// crop itself, at a fixed per-(crop, grade) rate — and nothing let a member
// actually do that trade.
//
// ═══ WHY THIS IS NOT AN Order ══════════════════════════════════════════════
//
// Order.vendorUid is required — every Order assumes a real external buyer
// with an account. A direct farmer→FPO sale has no buyer yet at all; forcing
// it into Order would mean inventing a fake vendor account, which is the
// exact fabrication this app refuses everywhere else. Same reasoning as
// MandiSale getting its own model instead of being squeezed into Order.
//
// ═══ THE RATE IS FROZEN, NOT RE-DERIVED ════════════════════════════════════
//
// `ratePerKg` is copied from `Fpo.procurementRates` at the MOMENT of sale.
// If the group later changes its rate table, a sale already made must keep
// meaning what it meant when the farmer agreed to it — the same rule
// `CropListing.grade.specVersion` already follows for grading criteria.
//
// ═══ COLLECTION IS A SEPARATE, LATER STEP ══════════════════════════════════
//
// This record is the FINANCIAL commitment: ownership and the amount owed.
// Physically moving the crop from farm to godown is arranged afterwards,
// same as it always has been for these groups — `collection.status` just
// says whether that has happened yet, and is not itself a transport booking.
const FpoProcurementSchema = new mongoose.Schema({
  farmerUid:  { type: String, required: true, index: true },
  farmerName: { type: String, default: '' },
  farmerPhone: { type: String, default: '' },

  fpoId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Fpo', required: true, index: true },
  fpoName: { type: String, default: '' },

  // The listing this was sold FROM. Kept for traceability; the sale itself
  // does not depend on the listing continuing to exist afterwards.
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'CropListing', default: null },

  cropName:      { type: String, required: true },
  cropLocalName: { type: String, default: '' },
  // The grade this rate was agreed for. Never null on a real procurement
  // sale — resolveProcurementRate() refuses to sell an ungraded lot under
  // procurement, the same rule the group's own rate table already applies.
  grade: { type: String, enum: ['A', 'B', 'C'], required: true },

  quantityKg: { type: Number, required: true, min: 0.1 },
  ratePerKg:  { type: Number, required: true, min: 0.01 },
  // Stored, not re-derived on every read, for the same reason MandiSale
  // stores grossAmount: this is the figure the farmer actually agreed to.
  amountOwed: { type: Number, required: true, min: 0 },

  soldAt: { type: Date, default: Date.now, index: true },

  // ── has the FPO actually paid it ────────────────────────────────────────
  // The same farmerPaid/paidAt/method shape every other settlement in this
  // app uses, so a farmer's own order history and this can render with one
  // shared component rather than two slightly different ones.
  payment: {
    paid:   { type: Boolean, default: false },
    paidAt: { type: Date, default: null },
    method: { type: String, enum: ['cash', 'upi', 'bank', 'other', null], default: null },
  },

  // ── has the crop actually left the farm yet ─────────────────────────────
  // Independent of payment: an FPO can agree and pay an advance before
  // pickup, or collect first and settle after — recording one must never be
  // read as implying the other.
  //
  // ⚠️ NAMED `pickup`, NOT `collection` — `collection` is a RESERVED Mongoose
  // schema pathname (the same gotcha Order.pickupOutcome was already named
  // around: "shadowing it breaks the model").
  pickup: {
    status: { type: String, enum: ['pending_pickup', 'collected'], default: 'pending_pickup' },
    collectedAt: { type: Date, default: null },
  },

  // 'demo_illustrative' for seeded data, null for a real sale — the same
  // convention Fpo/FpoMaster/Warehouse/CropListing already use, and for the
  // same reason: a seeded sale must never be indistinguishable from a real
  // farmer's real trade in a trust or history read.
  dataSource: { type: String, default: null, index: true },
}, { timestamps: true });

// One farmer's own history WITH ONE GROUP, newest first — exactly the query
// the "past history with this FPO" card on the sell screen needs, and the
// only reason this index exists is that query.
FpoProcurementSchema.index({ farmerUid: 1, fpoId: 1, soldAt: -1 });
// The group's own ledger, newest first.
FpoProcurementSchema.index({ fpoId: 1, soldAt: -1 });

module.exports = mongoose.model('FpoProcurement', FpoProcurementSchema);

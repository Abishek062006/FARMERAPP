// models/Dispute.js
const mongoose = require('mongoose');

// A grievance against a completed or in-flight ORDER.
//
// WHY IT HANGS OFF THE ORDER, NOT THE LISTING
//   A listing is inventory that many people buy from. A dispute is always
//   about one specific transaction between two specific people — "the 200 kg
//   I received on Tuesday was not Grade A" — and the Order is the only record
//   that identifies which 200 kg, at what price, to whom.
//
// WHO CAN RAISE ONE
//   Only the three parties to that order: the farmer, the vendor, and the
//   agent who moved it. Everyone else gets a 403 whatever they know about the
//   order id. The counterparty is computed at creation from the order, never
//   supplied by the raiser, so nobody can file a complaint naming a stranger.
//
// THIS APP DOES NOT ADJUDICATE
//   There is no arbitration engine here and nothing moves money. A dispute is
//   a RECORD: what was claimed, with photos, when, and what the two parties
//   said. `resolution.outcome` records what the humans agreed, and
//   `resolvedBy` says who closed it. Presenting this as a resolution system
//   would be claiming an authority the app does not have.
const DisputeSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },

  // Snapshot of what the order was, so the record survives and reads on its
  // own. A dispute that says "about order 6a89..." is unusable in a list.
  cropName:   { type: String, default: '' },
  quantityKg: { type: Number, default: 0 },
  orderTotal: { type: Number, default: 0 },

  // Who raised it, and their role in that order.
  raisedByUid:  { type: String, required: true, index: true },
  raisedByName: { type: String, default: '' },
  raisedByRole: { type: String, enum: ['farmer', 'vendor', 'agent'], required: true },

  // The other side. Derived from the order at creation — NEVER from the body.
  againstUid:  { type: String, required: true, index: true },
  againstName: { type: String, default: '' },
  againstRole: { type: String, enum: ['farmer', 'vendor', 'agent'], required: true },

  // A fixed list, not free text. "Quality not as described" is searchable and
  // countable; "the onions were bad" is neither, and a pattern of one reason
  // against one buyer is exactly the signal this feature exists to surface.
  reason: {
    type: String,
    required: true,
    enum: [
      'quality_not_as_described',   // grade or condition did not match the listing
      'quantity_short',             // less delivered than ordered
      'wrong_crop',                 // not the crop that was listed
      'damaged_in_transit',
      'not_delivered',
      'payment_not_received',       // the farmer was never paid (see Order.settlement)
      'payment_disputed',           // amount disagreed
      'other',
    ],
    index: true,
  },
  description: { type: String, required: true, maxlength: 1000 },

  // Evidence, stored the same way harvest proof photos are — binary in Mongo,
  // in its own collection so a dispute list never drags JPEGs across the wire.
  // See models/ListingImage.js for why that beats disk and Firebase here.
  photoIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ListingImage' }],

  // The accused party's side of it. One field, because this is a record of a
  // grievance and a reply, not a threaded chat.
  response:   { type: String, default: '', maxlength: 1000 },
  respondedAt: { type: Date, default: null },

  // ── status machine ──
  //   open → responded → resolved | rejected
  //   open → withdrawn            (the raiser changed their mind)
  status: {
    type: String,
    enum: ['open', 'responded', 'resolved', 'rejected', 'withdrawn'],
    default: 'open',
    index: true,
  },

  resolution: {
    // What the parties actually agreed. 'none' is a real outcome: some
    // disputes end with nobody conceding anything, and recording that
    // honestly is better than forcing a winner.
    outcome: {
      type: String,
      enum: ['refund_agreed', 'partial_refund_agreed', 'replacement_agreed',
             'no_action', 'none', null],
      default: null,
    },
    amount:     { type: Number, default: null },   // if money was agreed
    note:       { type: String, default: '', maxlength: 500 },
    resolvedAt: { type: Date, default: null },
    // Who closed it. Both parties can, and the record says which — a dispute
    // closed by the person complained about reads very differently from one
    // closed by the complainant.
    resolvedBy: { type: String, default: null },
    resolvedByRole: { type: String, enum: ['farmer', 'vendor', 'agent', null], default: null },
  },
}, { timestamps: true });

// The two list queries: what I raised, and what was raised against me.
DisputeSchema.index({ raisedByUid: 1, status: 1, createdAt: -1 });
DisputeSchema.index({ againstUid: 1, status: 1, createdAt: -1 });

// One OPEN dispute per person per order. A second grievance about the same
// transaction belongs in the same record, not a new one — otherwise a
// frustrated party files five and the counterparty cannot tell them apart.
// Partial, so a resolved dispute does not block a genuinely new later issue.
DisputeSchema.index(
  { orderId: 1, raisedByUid: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['open', 'responded'] } },
    name: 'oneOpenDisputePerPartyPerOrder',
  }
);

module.exports = mongoose.model('Dispute', DisputeSchema);

// models/Requirement.js
const mongoose = require('mongoose');

// A BUYER'S STANDING WANT — the other half of a market.
//
// Until this, trade only flowed one way: farmers posted, vendors reacted. A
// buyer who needs 2 tonnes of onion next Tuesday had nowhere to say so, and a
// farmer deciding what to harvest first had no way to know demand existed.
// That is half a market linkage, which is the thing the problem statement is
// actually about.
//
// A REQUIREMENT IS NOT AN ORDER, AND NOT A COMMITMENT.
//   It is an advertised intent. Nothing is reserved, no stock moves, and a
//   farmer responding to one is not selling anything yet — they are raising a
//   hand. The actual trade still goes through the existing path: the buyer
//   makes an Offer on the farmer's listing (C1), and that becomes an Order.
//   Building a second, parallel way to transact would mean two settlement
//   paths, two dispute surfaces and two places for the money to be wrong.
const ResponseSchema = new mongoose.Schema({
  farmerUid:  { type: String, required: true },
  farmerName: { type: String, default: '' },
  // What the farmer is putting forward. Always one of their own live listings,
  // so the buyer can see a real lot with a real photo rather than a promise.
  listingId:  { type: mongoose.Schema.Types.ObjectId, ref: 'CropListing', required: true },
  quantityKg: { type: Number, required: true },
  pricePerKg: { type: Number, required: true },
  grade:      { type: String, default: null },
  distanceKm: { type: Number, default: null },
  note:       { type: String, default: '', maxlength: 300 },
  at:         { type: Date, default: Date.now },
}, { _id: true });

const RequirementSchema = new mongoose.Schema({
  vendorUid:     { type: String, required: true, index: true },
  vendorName:    { type: String, default: '' },
  vendorCompany: { type: String, default: '' },
  // Released so a farmer can call before spending a day picking. Same
  // reasoning as the offer flow: you are in a conversation now.
  vendorPhone:   { type: String, default: '' },
  // Snapshot of the buyer's standing, exactly as Offer does — a farmer
  // deciding whether to harvest for this buyer deserves to know who they are.
  vendorVerification: {
    type: String,
    enum: ['unverified', 'documents_submitted', 'verified', 'rejected'],
    default: 'unverified',
  },

  commodity:  { type: String, required: true, index: true },
  quantityKg: { type: Number, required: true, min: 1 },
  // Optional: a buyer who only wants Grade A should be able to say so, and a
  // farmer with Grade C should not waste a trip.
  minGrade:   { type: String, enum: ['A', 'B', 'C', null], default: null },

  // A range, not a number. A buyer naming one figure is really naming a
  // ceiling, and pretending otherwise just moves the haggling off-platform.
  priceMin: { type: Number, default: null },
  priceMax: { type: Number, default: null },

  deliverBy: { type: Date, default: null },

  // Where it has to end up, and how far the buyer will source from.
  deliveryPoint: {
    lat:      { type: Number, required: true },
    lng:      { type: Number, required: true },
    label:    { type: String, default: '' },
    district: { type: String, default: '' },
  },
  radiusKm: { type: Number, default: 50, min: 1, max: 500 },

  notes: { type: String, default: '', maxlength: 500 },

  // Embedded rather than a separate collection: a requirement collects a
  // handful of responses, not thousands, and the buyer always reads them
  // together with the requirement itself. A join here would buy nothing.
  responses: { type: [ResponseSchema], default: [] },

  status: {
    type: String,
    enum: ['open', 'fulfilled', 'closed', 'expired'],
    default: 'open',
    index: true,
  },
  expiresAt: { type: Date, required: true, index: true },
  closedAt:  { type: Date, default: null },
}, { timestamps: true });

// The buyer's own list.
RequirementSchema.index({ vendorUid: 1, status: 1, createdAt: -1 });
// The farmer-facing browse: open requirements for a commodity, newest first.
// Proximity is filtered in code against the farmer's land — a geo index would
// need the requirement to be indexed by the SEARCHER's position, which it
// cannot be.
RequirementSchema.index({ status: 1, commodity: 1, createdAt: -1 });

// One farmer may respond to a requirement once per listing. Without this a
// farmer can post the same lot five times and drown the buyer's inbox.
RequirementSchema.index(
  { _id: 1, 'responses.farmerUid': 1, 'responses.listingId': 1 },
  { name: 'responseLookup' }
);

module.exports = mongoose.model('Requirement', RequirementSchema);

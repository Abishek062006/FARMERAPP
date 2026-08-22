const mongoose = require('mongoose');

// One document = one purchase AND its delivery job.
//
// They are a single atomic checkout in this product ("buy the crop and book
// the vehicle" is one flow), so splitting them into two collections would buy
// nothing but joins. Everything about the deal is SNAPSHOTTED here rather
// than read back from the listing: the farmer can edit their price later, and
// the vendor must be charged what they agreed to.
const PointSchema = new mongoose.Schema({
  lat: Number,
  lng: Number,
  label: String,      // human-readable, for the agent's screen
  city: String,
  district: String,
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  // Guards against a double-tapped "Confirm booking" creating two orders and
  // decrementing stock twice. Client generates one per checkout attempt.
  idempotencyKey: { type: String },

  // ── what was bought ──
  listingId:     { type: mongoose.Schema.Types.ObjectId, ref: 'CropListing', required: true, index: true },
  cropId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Crop' },
  cropName:      { type: String, required: true },
  cropTamilName: { type: String, default: '' },
  proofImageId:  { type: mongoose.Schema.Types.ObjectId, ref: 'ListingImage', default: null },
  quantityKg:    { type: Number, required: true },
  pricePerKg:    { type: Number, required: true },
  cropTotal:     { type: Number, required: true },

  // ── parties (always from req.profile, never the request body) ──
  farmerUid:   { type: String, required: true },
  farmerName:  String,
  farmerPhone: String,

  vendorUid:     { type: String, required: true },
  vendorName:    String,
  vendorPhone:   String,
  vendorCompany: String,

  agentUid:           { type: String, default: null },
  agentName:          { type: String, default: null },
  agentPhone:         { type: String, default: null },
  agentVehicleNumber: { type: String, default: null },

  // ── route ──
  pickup:  { type: PointSchema, required: true },
  dropoff: { type: PointSchema, required: true },

  // ── transport quote: FROZEN at creation ──
  vehicleType:   { type: String, enum: ['auto', 'tempo', 'truck'], required: true },
  distanceKm:    { type: Number, required: true },
  durationMin:   { type: Number, required: true },
  routeSource:   { type: String, enum: ['osrm', 'haversine'], default: 'haversine' },
  routePolyline: { type: [[Number]], default: [] },   // [[lat,lng], …] farm → destination
  // Agent → farm, computed once when the job is accepted. Deliberately not
  // recomputed as the agent drives: the line is a reference, not turn-by-turn,
  // and re-routing every few seconds would hammer OSRM for no benefit.
  approachPolyline: { type: [[Number]], default: [] },
  fare: {
    base: Number,
    perKm: Number,
    distanceCharge: Number,
    total: { type: Number, required: true },
    platformFee: { type: Number, default: 0 },
    agentPayout: Number,
  },
  grandTotal: { type: Number, required: true },       // cropTotal + fare.total

  payment: {
    // Cash on delivery: how TN agri trade actually settles, and it needs no
    // gateway. The sub-document leaves room for one later.
    mode:   { type: String, enum: ['cod'], default: 'cod' },
    status: { type: String, enum: ['pending', 'collected'], default: 'pending' },
  },

  // ── status machine ──
  //   awaiting_agent → accepted → picked_up → delivered
  //   awaiting_agent → no_agents (dispatch lapsed; vendor may retry or cancel)
  //   awaiting_agent | no_agents → cancelled
  status: {
    type: String,
    enum: ['awaiting_agent', 'no_agents', 'accepted', 'picked_up', 'delivered', 'cancelled'],
    default: 'awaiting_agent',
  },
  // Present ONLY while the agent is mid-job. $unset (never set to false) on
  // completion, so the partial index below drops the document.
  isActiveJob: { type: Boolean },

  dispatchExpiresAt: Date,
  acceptedAt: Date,
  pickedUpAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  cancelledBy: String,
  rejectedBy: { type: [String], default: [] },   // agents who declined; never re-offered

  // ── handover gates ──
  // Without these an agent arrives at a farm gate where the farmer has heard
  // nothing about a sale. The farmer reads the pickup code out; the vendor
  // reads the drop code out.
  pickupOtp: String,
  dropOtp:   String,

  // ── live tracking (phase 5) ──
  tracking: {
    lat: Number,
    lng: Number,
    heading: { type: Number, default: 0 },
    // Monotonic client counter, NOT a timestamp: phone clocks are routinely
    // wrong by minutes and a skewed clock would freeze the marker forever.
    seq: { type: Number, default: 0 },
    updatedAt: Date,
    simulated: { type: Boolean, default: false },
  },
}, { timestamps: true });

OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ vendorUid: 1, createdAt: -1 });
OrderSchema.index({ farmerUid: 1, createdAt: -1 });
// Double-tap protection.
OrderSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
// Plain lookup index for "what is this agent working on".
OrderSchema.index({ agentUid: 1, status: 1 });
// ONE active job per agent, enforced by the database rather than by a
// read-then-check (which would be TOCTOU-unsafe across documents).
// Equality-only partial filter, so it works on every MongoDB version.
//
// NOTE the explicit name. Without it Mongoose auto-names this "agentUid_1",
// which collides with the name an `index: true` on the field would generate —
// and on a collision the plain index wins and this guard vanishes silently.
OrderSchema.index(
  { agentUid: 1 },
  { unique: true, partialFilterExpression: { isActiveJob: true }, name: 'oneActiveJobPerAgent' }
);

module.exports = mongoose.model('Order', OrderSchema);

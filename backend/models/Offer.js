// models/Offer.js
const mongoose = require('mongoose');

// A NEGOTIATION, not a sale.
//
// The marketplace shipped with instant-buy: a vendor picks a quantity and an
// Order exists. That is fine for a commodity at a posted price, but it removes
// the farmer's side of the trade entirely — the statement asks for bargaining
// power, and a farmer who cannot answer "would you take Rs 26?" has none.
//
// AN OFFER HOLDS NO STOCK. This is the load-bearing decision in this file.
// Reserving inventory the moment someone asks about it means one vendor firing
// off five speculative offers can freeze a farmer's entire listing while they
// sleep. So stock is untouched until the moment an offer converts, and it is
// decremented by the SAME atomic guard that instant-buy uses (see
// routes/orders.js). The consequence is honest and must stay visible in the
// UI: an accepted offer can still fail if the stock sold in the meantime, and
// the accept endpoint says so rather than overselling.
//
// Price is per kg, matching CropListing.pricePerKg — never per quintal, which
// is what mandi data uses. Mixing the two by a factor of 100 is the easiest
// money bug available in this codebase.
const OfferSchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'CropListing', required: true, index: true },

  // Denormalised so a farmer's offer list renders without joining the listing,
  // and so the record survives the listing being withdrawn.
  cropName:      { type: String, required: true },
  cropLocalName: { type: String, default: '' },

  farmerUid:  { type: String, required: true, index: true },
  farmerName: { type: String, default: '' },

  vendorUid:     { type: String, required: true, index: true },
  vendorName:    { type: String, default: '' },
  vendorCompany: { type: String, default: '' },
  // Released to the farmer only once they are actually in a negotiation, the
  // same discipline the market listing uses for farmerPhone.
  vendorPhone:   { type: String, default: '' },

  // C2: the buyer's standing AT THE TIME OF THE OFFER, denormalised so a
  // farmer's list of ten offers does not become ten extra lookups. It is a
  // snapshot on purpose — what the farmer saw when they decided is what the
  // record should show, even if the buyer's status changes later.
  vendorVerification: {
    type: String,
    enum: ['unverified', 'documents_submitted', 'verified', 'rejected'],
    default: 'unverified',
  },
  vendorTradeName: { type: String, default: '' },

  quantityKg: { type: Number, required: true, min: 1 },

  // What the listing was asking when the offer was made. Kept as a snapshot so
  // "12% below asking" stays true later even if the farmer re-prices.
  askingPricePerKg: { type: Number, required: true },
  // The vendor's opening bid.
  offerPricePerKg:  { type: Number, required: true, min: 0.01 },
  // The farmer's counter, if they made one.
  counterPricePerKg: { type: Number, default: null },
  // Whatever both sides ended on. Set once, at acceptance.
  agreedPricePerKg:  { type: Number, default: null },

  message:      { type: String, default: '', maxlength: 300 },
  counterNote:  { type: String, default: '', maxlength: 300 },

  // ── status machine ──
  //   pending   → accepted | declined | countered | withdrawn | expired
  //   countered → accepted | declined | withdrawn | expired
  //
  // 'countered' means the ball is with the VENDOR; 'pending' means it is with
  // the farmer. Who may act is derived from status, never from a separate
  // "turn" field that could disagree with it.
  status: {
    type: String,
    enum: ['pending', 'countered', 'accepted', 'declined', 'withdrawn', 'expired'],
    default: 'pending',
    index: true,
  },

  // Set when the offer converts. Its presence is what makes acceptance
  // idempotent-ish: an accepted offer already carrying an orderId is done.
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

  expiresAt:   { type: Date, required: true },
  respondedAt: { type: Date, default: null },
  closedAt:    { type: Date, default: null },
}, { timestamps: true });

// The two list queries: "my offers" for each side, newest first.
OfferSchema.index({ farmerUid: 1, status: 1, createdAt: -1 });
OfferSchema.index({ vendorUid: 1, status: 1, createdAt: -1 });
// Drives the expiry sweep.
OfferSchema.index({ status: 1, expiresAt: 1 });

// One LIVE offer per vendor per listing. Without this a vendor can spam a
// farmer's inbox with ten bids on the same lot, and the farmer cannot tell
// which is real. Partial, so closed offers do not block a fresh negotiation
// later — the same partial-index technique as Order.isActiveJob.
OfferSchema.index(
  { listingId: 1, vendorUid: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['pending', 'countered'] } },
    name: 'oneLiveOfferPerVendorPerListing',
  }
);

module.exports = mongoose.model('Offer', OfferSchema);

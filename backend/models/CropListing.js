// models/CropListing.js
const mongoose = require('mongoose');

// A listing is INVENTORY, not a deal.
//
// The original version doubled as the deal record: it carried vendorUid /
// vendorName / vendorPhone / acceptedAt / confirmedAt and moved
// available → pending → confirmed for a single buyer. That cannot survive
// partial purchases — once one vendor buys 100 kg of a 500 kg listing, a
// single set of buyer fields on the listing is simply wrong.
//
// So: this document now owns stock (quantityAvailableKg, minOrderKg, price)
// and the Order document owns buyers. The legacy buyer fields and statuses
// are retained ONLY so pre-migration rows still validate — nothing writes to
// them any more. Remove them once scripts/migrateListings.js has run
// everywhere.
const CropListingSchema = new mongoose.Schema({
  cropId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Crop', required: true, index: true },
  landId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Land' },
  farmerUid:   { type: String, required: true },
  farmerName:  { type: String, default: 'Farmer' },
  // Never projected on the public market browse — released only to a vendor
  // who has actually placed an Order against this listing.
  farmerPhone: { type: String, default: '' },

  cropName:      { type: String, required: true },
  cropTamilName: { type: String, default: '' },
  variety:       { type: String, default: '' },

  // ── Harvest proof / provenance ──
  harvestedAt:   { type: Date },
  actualYieldKg: { type: Number },
  proofImageId:  { type: mongoose.Schema.Types.ObjectId, ref: 'ListingImage', default: null },
  gradeNote:     { type: String, default: '' },
  notes:         { type: String, maxlength: 500 },

  // ── Inventory ──
  quantityKg:          { type: Number, required: true },  // as originally posted; immutable
  quantityAvailableKg: { type: Number, required: true },  // decremented atomically per order
  minOrderKg:          { type: Number, required: true, default: 1 },
  pricePerKg:          { type: Number, required: true },
  totalPrice:          { type: Number },                  // display only; kept for legacy rows

  location: {
    city:     { type: String, required: true },
    district: { type: String },
    state:    { type: String, default: 'Tamil Nadu' },
    address:  { type: String, default: '' },
    // These were declared before but NEVER populated: the frontend posted
    // locationService's {latitude, longitude} into a schema expecting
    // {lat, lng}, so Mongoose strict mode silently dropped them and every
    // listing ended up coordinate-less. They are now filled from the crop's
    // Land record, where lat/lng are required and map-picked.
    lat:      { type: Number },
    lng:      { type: Number },
  },

  status: {
    type: String,
    enum: [
      'available', 'sold_out', 'withdrawn',
      'pending', 'confirmed', 'declined',   // legacy — see header comment
    ],
    default: 'available',
  },

  // ── Legacy single-buyer fields — DO NOT WRITE. Drop after migration. ──
  vendorUid:     { type: String, default: null },
  vendorName:    { type: String, default: null },
  vendorPhone:   { type: String, default: null },
  vendorCompany: { type: String, default: null },
  acceptedAt:    { type: Date, default: null },
  confirmedAt:   { type: Date, default: null },
}, { timestamps: true });

// This collection had ZERO indexes. Every one of these backs a query the
// marketplace runs on each vendor screen load. Note there is no standalone
// {status:1} or {farmerUid:1} — a compound index already serves queries on
// its own leading field, so those would be dead weight on every write.
CropListingSchema.index({ status: 1, createdAt: -1 });
CropListingSchema.index({ status: 1, 'location.district': 1 });
CropListingSchema.index({ status: 1, cropName: 1 });
CropListingSchema.index({ farmerUid: 1, createdAt: -1 });

module.exports = mongoose.model('CropListing', CropListingSchema);

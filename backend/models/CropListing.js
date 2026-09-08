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
  cropLocalName: { type: String, default: '' },
  variety:       { type: String, default: '' },

  // ── Harvest proof / provenance ──
  harvestedAt:   { type: Date },
  actualYieldKg: { type: Number },
  proofImageId:  { type: mongoose.Schema.Types.ObjectId, ref: 'ListingImage', default: null },
  // LEGACY free text. One farmer typed "A grade", another "good quality" —
  // a buyer could not compare two lots. Superseded by `grade` below; kept so
  // pre-C3 rows still render. scripts/migrateGrades.js moves it across.
  gradeNote:     { type: String, default: '' },

  // C3: structured grading against a published, per-commodity spec.
  grade: {
    // null means the farmer chose not to grade — grading stays optional,
    // because forcing a choice would just produce noise.
    code:        { type: String, enum: ['A', 'B', 'C', null], default: null },
    // Which spec was used, and which version of it. Pinned at post time so an
    // old listing keeps meaning what it meant when it was written.
    specKey:     { type: String, default: null },
    specVersion: { type: Number, default: null },
    // ALWAYS true today. The farmer picks; nobody checks. This field exists so
    // that "farmer-declared" cannot quietly disappear from the UI, and so that
    // if a real check ever exists it has somewhere to be recorded.
    selfDeclared: { type: Boolean, default: true },
    // Anything the fixed criteria do not cover.
    note:        { type: String, default: '', maxlength: 120 },
  },
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
    state:    { type: String, default: 'Maharashtra' },
    address:  { type: String, default: '' },
    // These were declared before but NEVER populated: the frontend posted
    // locationService's {latitude, longitude} into a schema expecting
    // {lat, lng}, so Mongoose strict mode silently dropped them and every
    // listing ended up coordinate-less. They are now filled from the crop's
    // Land record, where lat/lng are required and map-picked.
    lat:      { type: Number },
    lng:      { type: Number },
  },

  // ── WHERE THIS LISTING CAME FROM ────────────────────────────────────────
  //
  // null for a real harvest a farmer actually posted. 'demo_illustrative' for
  // seeded stock — the same value `Fpo`, `FpoMaster` and `Warehouse` already
  // use, and for the same reason: seeded listings attach SYNTHETIC quantities
  // to REAL, SFAC-registered companies, and nothing should ever read them as
  // that company's actual harvest.
  //
  // ⚠️ IT EXISTS BECAUSE THE PROVENANCE WAS ONLY IN FREE TEXT. scripts/
  // seedFpoListings.js marked its stock in `notes` ("illustrative demo stock,
  // not a real harvest"), which is honest to a human reading one listing and
  // useless to any query. That was found the hard way: measuring whether a
  // yield model could be trained on this data
  // (scripts/measureIncomingModel.js) required separating real harvests from
  // seeded ones, and there was no field to do it with. 75 of 80 listings in the
  // database at the time were demo stock; only FIVE were real.
  dataSource: { type: String, default: null, index: true },

  // ── GEOSPATIAL POSITION, FOR RADIUS MATCHING ────────────────────────────
  //
  // ⚠️ SEPARATE FROM `location.coordinates`, and it has to be. Mongo's
  // 2dsphere index requires GeoJSON — `{ type: 'Point', coordinates: [lng, lat] }`
  // — and note the order is **[longitude, latitude]**, the reverse of how this
  // codebase writes lat/lng everywhere else. Getting that backwards puts every
  // farm in Maharashtra somewhere off the coast of Somalia, silently, with no
  // error: the query just returns nothing.
  //
  // `location.coordinates.{lat,lng}` stays exactly as it is — it is read in
  // dozens of places and by toLatLng(). This field is written ALONGSIDE it,
  // never instead of it, and `services/geoService.js` remains the one place
  // that normalises the four shapes this codebase already has. This is a fifth
  // shape ONLY because the database engine demands that exact one.
  // ⚠️ NO `default` ON EITHER FIELD, AND THAT IS THE WHOLE FIX.
  //
  // `type` was declared `default: 'Point'`. Mongoose then stamped
  // `geo: { type: 'Point' }` — with NO coordinates — onto every document that
  // did not supply a position, and the 2dsphere index REJECTS that outright:
  //
  //     Can't extract geo keys ... Point must be an array or object,
  //     instead got type missing
  //
  // So every write of a User or CropListing without a coordinate threw. Not
  // just in tests — farmer registration and posting a harvest both broke in
  // the live app, because plenty of real records legitimately have no position
  // yet (see the offline fallback in RootNavigator, which deliberately stores
  // a null district rather than guessing one).
  //
  // With no defaults the whole `geo` object stays ABSENT unless a caller sets
  // it, which is exactly what a sparse geospatial index wants. A record with no
  // position is simply not in the index — it is not findable by radius, which
  // is true and honest, rather than unwritable.
  // ── WHERE THIS STOCK PHYSICALLY IS ──────────────────────────────────────
  //
  // ⚠️ ADDED BECAUSE AN FPO COLLECTION RUN MOVES PRODUCE AND THE LISTING'S
  // PICKUP POINT WOULD OTHERWISE STILL NAME THE FARM. A buyer's run is routed
  // to `location`, so once a member's crop has been carried to the group's
  // godown, an un-updated listing sends a real tempo to a farm where the crop
  // is no longer standing. That is not a display bug — it is a wasted trip
  // billed to somebody.
  //
  // ⚠️ OWNERSHIP DOES NOT MOVE WITH CUSTODY. `farmerUid` is untouched: the
  // member still owns the produce and is still the person paid for it. The
  // FPO is holding it, not buying it — that distinction is the difference
  // between `facilitation` and `procurement`, and collapsing it here would
  // silently convert every collection into a sale to the group.
  custody: {
    heldAt: { type: String, enum: ['farm', 'fpo'], default: 'farm' },
    fpoId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Fpo', default: null },
    // Which run brought it in, so the movement is auditable rather than a
    // location that changed with nothing to explain it.
    collectionRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consignment', default: null },
    collectedAt: { type: Date, default: null },
    // The farm it came FROM. Once `location` is rewritten to the godown this
    // is the only record of where it was grown, and a buyer asking "where is
    // this from" is asking about the farm, not the shed.
    originLabel: { type: String, default: '' },
    originDistrict: { type: String, default: '' },

    // ── PHASE 3, L1: WHO PAYS THE FARM→FPO FREIGHT ──────────────────────
    //
    // Decided ONCE, at the moment this lot is collected — not re-derived at
    // sale time, so a group changing its paymentMode later cannot silently
    // rewrite what a farmer already owes on stock already sitting in the shed.
    //
    //   procurement  → 0. The FPO already bought this crop outright; moving
    //                  its own property is its own cost, not the farmer's.
    //   facilitation → the farmer's fixed by-weight share of the collection
    //                  run's fare (`stop.fareShare`, frozen on PLANNED weight,
    //                  same rule as a buyer's pooled run), divided by however
    //                  much of it actually reached the godown. There is no
    //                  rail that charges a farmer directly — this is deducted
    //                  from what they are paid when the crop is later sold.
    freightOwedPerKg: { type: Number, default: 0, min: 0 },
  },

  geo: {
    type: { type: String, enum: ['Point'] },
    coordinates: { type: [Number] },   // [lng, lat] — GeoJSON order
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

CropListingSchema.index({ geo: '2dsphere' });

module.exports = mongoose.model('CropListing', CropListingSchema);

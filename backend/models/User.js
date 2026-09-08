const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
    index:true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  // ⚠️ OPTIONAL SINCE PHONE SIGN-IN, AND THE INDEX MUST BE SPARSE.
  //
  // Every account used to arrive through Firebase email/password, so `email`
  // was `required: true, unique: true`. A phone sign-in has NO email at all —
  // and on a NON-sparse unique index MongoDB treats a missing field as null, so
  // the FIRST phone-only account would save and the SECOND would fail with a
  // duplicate key on `null`. Same family as the `geo.type` default: a
  // constraint that is correct for the rows that have the field, and fatal for
  // the rows that legitimately do not.
  //
  // `scripts/migratePhoneAuth.js` rebuilds the live index as sparse. The
  // existing `email_1` in Atlas is unique and NOT sparse, and changing this
  // schema does not change an index that already exists.
  //
  // ⚠️ The field must be ABSENT, never `email: null` — an explicit null IS
  // indexed even by a sparse index, so two of them collide and we are back to
  // the same failure through a different door. routes/users.js omits the key.
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  // Still required for everyone: this is the CONTACT number the app rings and
  // prints on a receipt. It is deliberately NOT unique — two real people in one
  // household can share a handset, and 15 numbers in this database are already
  // on two accounts each. The number a person SIGNS IN with is a different
  // thing and lives in `phoneAuth` below.
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  // ── HOW THIS ACCOUNT SIGNS IN BY PHONE ──────────────────────────────────
  //
  // Set ONLY from the verified ID token's own `phone_number` claim, never from
  // a request body — the same rule that keeps `role` and `verification` out of
  // the profile allowlist. A client that could name its own verified number
  // could claim somebody else's.
  //
  // Separate from `phone` on purpose: `phone` is "how to reach you" and may be
  // shared or wrong; this is "the number Firebase actually sent an SMS to and
  // saw the code come back from". Collapsing them would let an unverified
  // contact number act as a credential.
  phoneAuth: {
    number: { type: String },      // E.164, e.g. +919820100001
    verifiedAt: { type: Date },
  },
  // ── WHAT THIS ACCOUNT IS ────────────────────────────────────────────────
  //
  //   farmer  grows the crop
  //   vendor  buys it            (shown as "Buyer"  — see roleLabel())
  //   agent   drives it          (shown as "Captain" — see roleLabel())
  //   fpo     a Farmer Producer Organisation's OWN account
  //
  // ⚠️ `fpo` IS ADDITIVE AND NOTHING WAS MIGRATED. Before it existed, an FPO
  // admin was a `farmer` account that had claimed an FPO from the SFAC
  // registry — which is backwards: a real FPO's CEO, Manager or Director is an
  // appointed officer of an incorporated producer company and frequently does
  // not farm at all. Tapping a button should not turn a farmer into company
  // staff, and it should not require a non-farming officer to pretend to be a
  // farmer to represent their own company.
  //
  // Every farmer-account that already admins an FPO KEEPS WORKING UNCHANGED.
  // That is possible because authorisation for an FPO action was never keyed
  // on the role — it is `fpo.adminUid === uid` everywhere (routes/fpos.js
  // loadAsAdmin(), routes/consignments.js isFpoAdminForRun()), which is
  // role-blind. All the new value changes is the OUTER requireRole() gate,
  // which now admits both: `FPO_ADMIN_ROLES` in routes/fpos.js.
  //
  // WHAT AN `fpo` ACCOUNT DELIBERATELY CANNOT DO, by simply not being admitted
  // to the routes that say `requireRole('farmer')`: register land, register a
  // crop, receive daily tasks, post a harvest listing, join or start a group,
  // or record a mandi sale. An FPO does not farm. No new refusal code was
  // written for any of that — the existing gate already says it.
  role: {
    type: String,
    enum: ['farmer', 'vendor', 'agent', 'fpo'],
    required: true,
  },
  location: {
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    city: { type: String },
    district: { type: String },
    state: { type: String, default: 'Maharashtra' },
  },
  profileImage: {
    type: String,
    default: null,
  },
  // UI language. 'mr' (Marathi) is the default because the app serves
  // Maharashtra; see frontend/src/i18n/strings.js for the string table.
  language: {
    type: String,
    enum: ['en', 'mr'],
    default: 'mr',
  },

  // ── Buyer credentials (vendors only) ──
  // A farmer handing over a tonne of onion on a cash-on-delivery promise is
  // extending credit to a stranger. These fields let them see who they are
  // dealing with.
  business: {
    gstin:        { type: String, default: null, uppercase: true, trim: true },
    // Derived server-side from the GSTIN, never accepted from the client.
    gstinState:   { type: String, default: null },
    pan:          { type: String, default: null },
    tradeLicence: { type: String, default: null, trim: true },
    tradeName:    { type: String, default: null, trim: true },
    address:      { type: String, default: null, trim: true },
  },

  verification: {
    // 'documents_submitted' is the ceiling a user can reach by themselves.
    //
    // A GSTIN that passes the check digit was almost certainly issued rather
    // than invented — that is worth showing. It is NOT proof the number belongs
    // to this person or is still active, which needs a GST portal lookup this
    // app does not have. So self-service stops here, and 'verified' is set only
    // by scripts/verifyBuyer.js after a human has actually looked.
    //
    // Enforced in routes/users.js: `verification` is absent from the update
    // allowlist, exactly as `role` is.
    status: {
      type: String,
      enum: ['unverified', 'documents_submitted', 'verified', 'rejected'],
      default: 'unverified',
      index: true,
    },
    // When the GSTIN last passed format + check digit, server-side.
    gstinCheckedAt: { type: Date, default: null },
    reviewedAt:     { type: Date, default: null },
    reviewedBy:     { type: String, default: null },
    note:           { type: String, default: '' },
  },
  // ── Transport agents only ──
  // Registration never asks for these (and shouldn't — it works and is shared
  // by all three roles), so agents set them from an onboarding sheet the first
  // time they open their dashboard.
  vehicle: {
    type:   { type: String, enum: ['auto', 'tempo', 'truck'] },
    number: { type: String, trim: true },
  },
  // Duty toggle. An agent who is offline is never offered a job, and their app
  // stops polling — which matters, because Expo Go can only poll while the
  // app is in the foreground anyway.
  isOnline: {
    type: Boolean,
    default: false,
  },
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
  geo: {
    type: { type: String, enum: ['Point'] },
    coordinates: { type: [Number] },   // [lng, lat] — GeoJSON order
  },

  // WHEN `geo` WAS LAST WRITTEN. A coordinate with no timestamp is a trap: one
  // recorded three weeks ago looks identical to one recorded three seconds ago,
  // so "which captains are near this pickup" would cheerfully return a driver
  // who was in Nashik last month and is in Pune today — and dispatch would be
  // confidently wrong in a way nobody could see. Every reader must check the
  // age. Same discipline as the tracking screen reporting "last seen 3 min ago"
  // instead of drawing a live dot it cannot justify.
  positionAt: { type: Date },

  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update timestamp on save - FIXED SYNTAX
UserSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Indexes.
// firebaseUid and email already declare `unique: true` on the field, which
// creates their index — repeating them here produced duplicate-index warnings
// on every boot. Worse, a schema.index() that collides by name with a
// field-level one can silently REPLACE it (that is how the agent
// one-active-job guard went missing during phase 3), so a key is declared in
// exactly one place.
UserSchema.index({ role: 1 });
// Agent dispatch: find online agents of a given vehicle type.
UserSchema.index({ role: 1, isOnline: 1, 'vehicle.type': 1 });

// Radius matching: 'which captains are near this farm'. Without this the
// nearby query is a collection scan with haversine computed in JavaScript —
// fine at 30 captains, wrong at 700.
// One profile per verified sign-in number. Firebase already guarantees one
// uid per phone number, so this is a second line of defence that catches a bug
// where two profiles claim the same one — it is sparse, so the 2,347 accounts
// that have never used phone sign-in are simply not in it.
UserSchema.index({ 'phoneAuth.number': 1 }, { unique: true, sparse: true });

UserSchema.index({ geo: '2dsphere' });

module.exports = mongoose.model('User', UserSchema);

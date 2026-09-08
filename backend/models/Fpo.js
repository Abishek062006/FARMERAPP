// models/Fpo.js
const mongoose = require('mongoose');

// A Farmer Producer Organisation — the institution F1's economics already
// describe.
//
// WHY THIS IS THIN, DELIBERATELY
//   F1 already does the hard part: multi-stop routing, one OTP per farmer,
//   weight-proportional fare splitting, and a measured saving. An FPO does not
//   need new logistics — it needs a NAME for the group that was already
//   sharing the vehicle, so a buyer can find three members' lots together
//   instead of hunting them one at a time.
//
//   So this is a membership list and a suggestion query, not a second trading
//   system. Members' listings stay their own: their own price, own payout, own
//   settlement, own dispute. An FPO that owned its members' sales would be a
//   different and much worse product — it would put a middleman back exactly
//   where this app is trying to remove one.
//
// Maharashtra is one of the leading FPO states and the problem statement names
// them twice, which is why the framing is worth making explicit rather than
// leaving implied by F1.
const FpoSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true, maxlength: 120 },
  // Registration number, when the FPO has one. Not verified — same honesty
  // rule as GSTIN: recorded, shown as "on file", never presented as checked.
  regNumber:{ type: String, default: null, trim: true },
  district: { type: String, default: '' },
  village:  { type: String, default: '' },

  // ── WHERE THE GROUP'S PRODUCE IS COLLECTED TO ──────────────────────────
  //
  // ⚠️ THIS EXISTS BECAUSE THE ALTERNATIVE WAS TO INVENT A COORDINATE.
  // A collection run carries members' produce from their farms to the group's
  // OWN premises, so it needs a real dropoff point — and this model had only a
  // `district`. Deriving the dropoff from a district centroid was the obvious
  // shortcut and is exactly the mistake already recorded twice in CLAUDE.md:
  // `backfillGeo.js` leaves a record with no usable coordinate ALONE rather
  // than giving it a centroid, and the MSWC warehouse import reports
  // `locationPrecision` instead of pretending 135 godowns on one centroid can
  // be ranked. A centroid dropoff would route a real tempo, bill a real
  // farmer a by-weight share of a real fare, and quote a distance measured to
  // a point nobody's godown stands on.
  //
  // So the group STATES it, and until it does, `POST /:id/collection-runs`
  // REFUSES with a named reason. `declared` is separate from the coordinates
  // for the same reason `focusDeclared` travels beside `focusCrops`: absent
  // must never be readable as "they have no premises".
  premises: {
    declared: { type: Boolean, default: false },
    lat:      { type: Number, default: null },
    lng:      { type: Number, default: null },
    label:    { type: String, default: '', maxlength: 160 },
    district: { type: String, default: '' },
    // Free text: "behind the APMC gate, ask for Sarpanch office". A godown a
    // driver cannot find is a godown the produce does not reach, and a
    // lat/lng alone is not directions.
    landmark: { type: String, default: '', maxlength: 200 },
    setAt:    { type: Date, default: null },
    setBy:    { type: String, default: null },
  },

  // Whoever created it. They can admit and remove members; they are NOT given
  // any claim over members' listings or money.
  adminUid:  { type: String, required: true, index: true },
  adminName: { type: String, default: '' },

  members: [{
    farmerUid:  { type: String, required: true },
    farmerName: { type: String, default: '' },
    joinedAt:   { type: Date, default: Date.now },
    // Share of any jointly-negotiated payment, as a percentage. Defaults to
    // null — an FPO that has not agreed shares should not have this app
    // inventing them.
    sharePct:   { type: Number, default: null },
    // 'pending' only for a member who used /:id/join and has not yet been
    // approved by the admin. Every other place a member is added (founding
    // the group, the review script linking a claimant) defaults to 'active'
    // so none of the already-tested behaviour changes.
    status:     { type: String, enum: ['pending', 'active'], default: 'active' },
  }],

  // ── HOW THIS FPO ACTUALLY PAYS ITS MEMBERS ──────────────────────────────
  //
  // THERE IS NO SINGLE FPO BUSINESS MODEL IN INDIA, and the first version of
  // this file quietly assumed one. Two arrangements are both common and they
  // are not variations of each other — they put the price risk on opposite
  // sides of the gate:
  //
  //   facilitation  The FPO markets its members' produce collectively. The
  //                 crop stays the member's until it sells, and the member
  //                 receives the sale proceeds MINUS an agreed FPO fee. The
  //                 member carries the price risk; the FPO earns a fee whether
  //                 the lot sold well or badly.
  //
  //   procurement   The FPO BUYS the crop from the member at an agreed rate
  //                 (Grade A onion at ₹25/kg, say), then resells the
  //                 aggregated lot on its own account. The member is owed the
  //                 agreed rate regardless of what the lot eventually fetched.
  //                 The FPO carries the price risk AND the margin — which can
  //                 be negative, and this app reports it negative rather than
  //                 clamping it (same rule as a negative pooling saving and a
  //                 losing hold).
  //
  // THE DEFAULT IS LOAD-BEARING. `facilitation` with a zero fee is EXACTLY
  // what this app already did before any of this existed: each member keeps
  // their own lot's value, nothing is skimmed. Every already-seeded FPO and
  // every existing test must keep producing the same numbers, so an FPO that
  // has not opted in must never see a figure change.
  paymentMode: {
    type: String,
    enum: ['facilitation', 'procurement'],
    default: 'facilitation',
    index: true,
  },

  // The fee a FACILITATION group charges. Real FPOs use both shapes — a
  // percentage of the sale, or a flat rate per kilogram — so both are stored
  // and `mode` says which one is in force. Never both at once: an FPO that
  // charged 2% AND ₹0.50/kg would be two agreements, and the member is
  // entitled to one number they can check.
  //
  // Defaults to `none` / 0 / 0, which is a zero fee — see the note above.
  facilitationFee: {
    mode:    { type: String, enum: ['none', 'percent', 'per_kg'], default: 'none' },
    percent: { type: Number, default: 0 },   // % of the lot's gross sale value
    perKg:   { type: Number, default: 0 },   // ₹ per kilogram delivered
    setAt:   { type: Date, default: null },
    setBy:   { type: String, default: null },
  },

  // The agreed rate table a PROCUREMENT group buys at. Per (crop, grade), and
  // the grades stay SEPARATE — A/B/C are this app's stored grade codes (see
  // data/gradeSpecs.js) and one blended rate per crop would erase the only
  // thing grading is for. A Grade C lot bought at the Grade A rate is not a
  // rounding error, it is the FPO paying for quality it did not receive.
  //
  // A (crop, grade) the group actually holds with NO entry here is a real gap
  // and the settlement API names it. It must never fall back to facilitation,
  // to the crop's other grades, or to zero.
  procurementRates: [{
    cropName:  { type: String, required: true, trim: true },
    grade:     { type: String, enum: ['A', 'B', 'C'], required: true },
    ratePerKg: { type: Number, required: true, min: 0 },
    setAt:     { type: Date, default: Date.now },
    setBy:     { type: String, default: null },
  }],

  // ── WHO PAYS TO MOVE A SOLD LOT FROM THE FPO'S GODOWN TO THE BUYER ──────
  //
  // Phase 3, L3. Every lot-sale Order has always been written with
  // `grandTotal = lineTotal + fareShare` — the buyer carries this leg's
  // freight, unconditionally, in every existing lot sale. That was a real
  // hardcoded assumption with no field behind it; this makes it a named,
  // explicit term on the group's own record instead of an invisible fact
  // buried in one line of routes/fpos.js.
  //
  // ⚠️ ONLY `buyer_pays` IS ACTUALLY WIRED. `fpo_pays` and `negotiated` are
  // reserved for when the charge itself is built to respect them — until
  // then, PUT /:id/payment REFUSES setting anything else, on purpose. An FPO
  // admin choosing "fpo_pays" and then watching the buyer get billed anyway
  // would be the dead-control defect this codebase has already shipped twice
  // (a GSTIN badge nobody could earn; an Orders icon pushed off screen) —
  // a stated refusal beats a decorative setting that does nothing.
  freightTerm: {
    type: String,
    enum: ['buyer_pays', 'fpo_pays', 'negotiated'],
    default: 'buyer_pays',
  },

  // ── WHAT THIS GROUP ACTUALLY DEALS IN ───────────────────────────────────
  //
  // FPOs specialise, and heavily — a Niphad onion producer company does not
  // deal in sugarcane. Nothing modelled that, so any farmer could ask to join
  // any group with any produce and the admin approving them had nothing to
  // decide with except a name.
  //
  // THE GROUP DECLARES IT, because there is nothing to derive it from: the
  // SFAC registry carries the name, registration number, district, block and
  // promoting CBBO of all 213 real companies and NOT ONE WORD about crops.
  // Deriving it from what members currently list was considered and rejected —
  // four onion lots this week does not make an onion FPO, and a grape group
  // between harvests would read as focusing on nothing at all.
  //
  // Values are canonical names from data/agroZones.js CROPS, validated by
  // services/focusCropService.js. A FIXED LIST rather than free text, for the
  // same reason Dispute.reason is one: "Onion" is matchable, "onion/kanda
  // (red)" is not.
  //
  // ⚠️ ADVISORY, EVERYWHERE. An empty list means "not declared", NEVER "deals
  // in nothing", and a mismatch blocks nothing at all — it is shown to the
  // admin, who is the person who decides, and to the farmer, who is entitled
  // to know before asking. It does not touch the lot catalog, the bundles or
  // any sale: produce already listed is produce, and refusing to market a
  // member's off-focus crop would destroy real value to enforce a preference
  // the group only ever stated as a preference.
  focusCrops: { type: [String], default: [] },
  focusCropsSetAt: { type: Date, default: null },
  focusCropsSetBy: { type: String, default: null },

  status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },

  // Provenance. null for every real, human-founded/claimed FPO. Set to
  // 'demo_illustrative' only by scripts/seedFpoDemoData.js, which attaches
  // SYNTHETIC admin/member data to a REAL, SFAC-registered company (see
  // data/sources_fpo/README.md) — the same distinction Warehouse.dataSource
  // and FpoMaster.dataSource already draw between illustrative and real.
  // Any screen rendering an Fpo should surface this so a demo group is never
  // shown as if it were the company's actual verified membership.
  dataSource: { type: String, default: null },
}, { timestamps: true });

FpoSchema.index({ 'members.farmerUid': 1 });
FpoSchema.index({ district: 1, status: 1 });

// A farmer belongs to at most one FPO. Enforced at the route rather than by
// index (the constraint spans documents), but stated here because it is the
// rule the rest of the code assumes.
module.exports = mongoose.model('Fpo', FpoSchema);

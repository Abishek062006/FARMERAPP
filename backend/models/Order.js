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
  cropLocalName: { type: String, default: '' },
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
    // The empty drive home, on the distance beyond returnThresholdKm. Stored
    // per-order rather than recomputed, because the threshold and factor are
    // policy that may change — a receipt must keep explaining the fare that
    // was actually charged, not the one today's constants would produce.
    returnCharge: { type: Number, default: 0 },
    returnKm: { type: Number, default: 0 },
    returnThresholdKm: Number,
    total: { type: Number, required: true },
    platformFee: { type: Number, default: 0 },
    agentPayout: Number,
  },
  grandTotal: { type: Number, required: true },       // cropTotal + fare.total

  // What the vendor owes the FARMER for the crop. Equal to cropTotal today —
  // it exists as its own field because the two are conceptually different
  // (cropTotal is a line total, farmerPayout is a liability) and because any
  // future commission on the crop leg comes out of exactly here, the way
  // fare.platformFee already does for the transport leg.
  //
  // WHY THIS EXISTS AT ALL: before it, grandTotal was cropTotal + fare, the
  // agent was told to collect all of it, and no field anywhere recorded that
  // the farmer was owed anything. The money for the crop simply had no
  // destination. See routes/orders.js and the settlement block below.
  farmerPayout: { type: Number, required: true },

  // Phase 3, L1 — present only when this crop passed through an FPO
  // collection run under facilitation mode. `farmerPayout` above is ALREADY
  // net of this (cropTotal minus the deduction); this block exists so the
  // deduction is a NAMED LINE on the receipt and the settlement screen,
  // never a payout that is just quietly smaller with no explanation.
  freightDeduction: {
    perKg:  { type: Number, default: 0 },
    qtyKg:  { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
  },

  // C5: the negotiation this order came from, when it came from one.
  // Without this link the agreed price in C1 was decorative — the order was
  // priced at the listing rate and the whole bargaining loop changed nothing.
  offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer', default: null },

  // F1: the shared trip this order rides on, if any. Null means it travels
  // alone. When set, this order's fare.total is its SHARE of one vehicle —
  // see splitFare() in routes/consignments.js.
  consignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consignment', default: null, index: true },
  // How the price was arrived at, so a receipt can say so plainly.
  priceSource: { type: String, enum: ['listing', 'negotiated'], default: 'listing' },

  payment: {
    // Cash on delivery: how Indian agri trade actually settles, and it needs no
    // gateway. The sub-document leaves room for one later.
    //
    // SCOPE: this tracks the TRANSPORT leg only — the fare the agent collects
    // from the vendor at handover. The crop leg is tracked in `settlement`
    // below, because the two are paid to different people at different times.
    mode:   { type: String, enum: ['cod'], default: 'cod' },
    status: { type: String, enum: ['pending', 'collected'], default: 'pending' },
  },

  // The crop leg: vendor → farmer, settled directly between them.
  //
  // This app RECORDS a settlement, it does not move money — there is no
  // payment rail here, and pretending otherwise would be dishonest. So this
  // is not flipped automatically on delivery: the farmer marks it when they
  // have actually been paid (POST /api/orders/:id/settle). An auto-flip would
  // assert the farmer had their money on the strength of an agent's OTP,
  // which is exactly the kind of claim that leaves a farmer unpaid and the
  // record saying otherwise.
  // ── THE BUYER'S INSPECTION WINDOW ───────────────────────────────────
  //
  // ═══ THE PROBLEM ══════════════════════════════════════════════════════
  //
  // `settlement.advance` protects the FARMER — they hand over a tonne of onion
  // against a promise. Nothing protected the other side. A buyer paid for a
  // grade nobody independently checked (a hired captain is deliberately NOT
  // asked to grade, see data/gateRecord.js), and the moment they settled they
  // had no leverage left. Their only route was a grievance raised after the
  // money was gone.
  //
  // This gives the lot a stated period in which the buyer can look at it and
  // say so, BEFORE settling.
  //
  // ⚠️ IT ADJUDICATES NOTHING, AND IT MOVES NO MONEY. Flagging a problem opens
  // the ORDINARY grievance flow (models/Dispute.js) — it does not create a
  // second, parallel path for deciding who is right, which this app refuses to
  // do anywhere. All this records is: was the lot looked at, by when, and what
  // did the buyer say.
  //
  // ⚠️ A LAPSED WINDOW IS NOT AN INSPECTION. `acceptedAt` is set only when a
  // human actually accepted. A window that simply ran out is `lapsed`, and the
  // two are never collapsed — "the buyer checked it and was happy" and "nobody
  // ever looked" are opposite evidence in a later dispute, exactly like
  // `condition.checked` on the gate record.
  inspection: {
    // Opened when the crop is delivered; null on an order that never arrived.
    opensAt:    { type: Date },
    expiresAt:  { type: Date },
    windowHours:{ type: Number },
    // Set ONLY by a real acceptance. Absent on a lapse.
    acceptedAt: { type: Date },
    acceptedBy: { type: String },
    note:       { type: String },
    // Recorded when the buyer used the window to raise a grievance, so the
    // trail shows the complaint was made in time rather than months later.
    flaggedAt:  { type: Date },
  },

  settlement: {
    // TRUE means the trade is FULLY settled — the balance is in. An order with
    // an advance recorded but no balance is NOT `farmerPaid`. Unchanged
    // meaning: services/trustService.js and every existing query read this as
    // "has this farmer been paid", and an advance is not being paid.
    farmerPaid: { type: Boolean, default: false },
    paidAt:     Date,
    // `in_app` is the app's own payment rail — see the txn block below. The
    // other four are settlements that happened OUTSIDE this app and are merely
    // being recorded after the fact by the farmer.
    method:     { type: String, enum: ['cash', 'upi', 'bank', 'other', 'in_app'] },

    // ── A PAYMENT MADE THROUGH THE APP ITSELF ───────────────────────────
    //
    // ⚠️ WHY THIS ONE MAY SETTLE WITHOUT THE FARMER TAPPING ANYTHING, when
    // every other method in this file insists the farmer confirms.
    //
    // The rule was never "the farmer must tap". It was "only the person the
    // money lands with can say it landed" — because with cash, UPI or a bank
    // transfer THIS APP HAS NO WAY TO KNOW. A buyer marking their own cash
    // payment received is self-certification, which is refused everywhere here.
    //
    // A payment made on the app's own rail is different in kind: the platform
    // processed it, so the platform's record IS first-hand knowledge, not a
    // claim by an interested party. That is the only reason it is allowed to
    // set `farmerPaid` from the buyer's side.
    //
    // ⚠️ `simulated` IS NOT DECORATION AND MUST NOT BE REMOVED. This rail does
    // not move money — there is no payment provider behind it. Without this
    // flag a demo transaction is indistinguishable from a real settlement in
    // every query, every trust score and every receipt, which is exactly the
    // failure `dataSource` was added to Order to prevent. Anything reading
    // settlement history must be able to tell the two apart.
    txn: {
      ref:       { type: String },     // FM-PAY-XXXXXXXX, shown on the receipt
      at:        { type: Date },
      rail:      { type: String },     // which rail processed it
      simulated: { type: Boolean },    // true = no money actually moved
      paidByUid: { type: String },     // who pressed pay
    },

    // ── THE ADVANCE ─────────────────────────────────────────────────────
    //
    // ═══ THE PROBLEM THIS ANSWERS ══════════════════════════════════════
    //
    // Until now a farmer handed over a tonne of onion against a RECORD of a
    // promise. They were extending credit to a stranger, and every incentive
    // in the trade ran the wrong way once the crop was on the truck.
    //
    // ⚠️ FLIPPING IT DOES NOT FIX IT. "The buyer pays before delivery" moves
    // the whole exposure onto the buyer, who has then paid for produce they
    // have not seen, at a grade nobody checked (see data/gateRecord.js on why
    // a hired captain is not asked to grade). Making that safe needs ESCROW,
    // escrow needs a payment rail, and this app deliberately has none.
    //
    // So: an ADVANCE at commitment and a BALANCE after delivery — which is how
    // this trade already works on the ground, and which splits the exposure
    // instead of relocating it.
    //
    // ⚠️ STILL RECORDED, STILL NOT MOVED. Every rule that governs
    // `farmerPaid` governs these fields. The app does not transfer an advance,
    // does not hold one, and cannot verify one. The buyer AGREES a figure at
    // order time; the FARMER records that it actually arrived — the same split
    // of authority as the balance, and for the same reason: an auto-flip would
    // assert a farmer had money on somebody else's say-so.
    advance: {
      // ₹, on the CROP leg only. The transport fare is a separate debt to a
      // different person (see `payment` above) and is never advanced here.
      // 0 — the default — is byte-for-byte what this app did before advances
      // existed, so no existing order changes meaning.
      agreedAmount: { type: Number, default: 0, min: 0 },
      // What fraction of `farmerPayout` that was WHEN IT WAS AGREED. Stored
      // rather than derived because a short pickup rewrites `farmerPayout`:
      // deriving it later would report a percentage nobody agreed to.
      agreedPct:    { type: Number, default: 0, min: 0, max: 100 },
      agreedAt:     { type: Date, default: null },

      // The farmer's confirmation that the money actually arrived. AGREED and
      // RECEIVED are different facts and are never collapsed — an advance a
      // buyer promised and did not send is the farmer's whole problem, and a
      // single boolean would hide exactly that case.
      receivedAt:   { type: Date, default: null },
      method:       { type: String, enum: ['cash', 'upi', 'bank', 'other', null], default: null },
    },
  },

  // What actually happened at the farm gate, when it was not simply "all of
  // it was loaded". Written by the captain through
  // POST /api/consignments/:id/stop-outcome (and by /collect on the happy
  // path); see models/Consignment.js StopSchema for the enum's meaning.
  //
  // WHY THE MONEY FIELDS ABOVE ARE REWRITTEN AND THIS IS KEPT ALONGSIDE
  //   quantityKg / cropTotal / farmerPayout / grandTotal are LIVE figures —
  //   what is owed, right now. A farmer whose crop was never collected is owed
  //   nothing, so farmerPayout must become 0; leaving it at the ordered value
  //   records a debt for produce that never moved. But zeroing those fields
  //   alone would erase what was agreed, so `orderedKg` keeps the original and
  //   the pair reads as one sentence: 600 kg was bought, 0 kg arrived.
  //
  //   `settlement` needs no special case — POST /api/orders/:id/settle already
  //   refuses anything outside picked_up/delivered, so a cancelled order can
  //   never be marked paid. `deliveredAt` is likewise never set: a stop that
  //   failed is not a delivery, and the consignment's own /deliver only
  //   promotes orders still sitting in picked_up.
  //
  // (Named `pickupOutcome` and not `collection`: `collection` is a RESERVED
  // Mongoose schema pathname — `Model.collection` is the driver's collection
  // handle, and shadowing it breaks the model in ways that surface far from
  // here. Mongoose warns about this rather than throwing.)
  pickupOutcome: {
    outcome: {
      type: String,
      enum: ['collected_full', 'collected_short', 'not_collected', null],
      default: null,
    },
    orderedKg:   { type: Number, default: null },   // what was bought
    collectedKg: { type: Number, default: null },   // what left the farm
    reason: {
      type: String,
      // 'run_abandoned' is SERVER-SET ONLY — the run was given up on before
      // anybody reached this farm. See models/Consignment.js StopSchema.
      enum: ['farmer_absent', 'quantity_not_ready', 'produce_rejected', 'run_abandoned', 'other', null],
      default: null,
    },
    note:       { type: String, default: '', maxlength: 500 },
    recordedAt: { type: Date, default: null },
    recordedBy: { type: String, default: null },
    // WHOSE ACCOUNT KEYED THIS IN, and therefore whose claim it is:
    //   agent       the captain from the pool who stood at your gate
    //   fpo_driver  your own group's driver, at your gate, on their own phone
    //   fpo_admin   your group's OFFICE, recording what its driver reported
    //               down a phone line — the paper trip sheet, still supported
    //               because a driver without a phone is a real situation
    //   vendor      the buyer abandoning a run whose captain has gone silent
    // See models/Consignment.js StopSchema.outcomeByRole for the full reasoning;
    // these four are the same list and must not drift apart.
    recordedByRole: {
      type: String,
      enum: ['agent', 'fpo_driver', 'fpo_admin', 'vendor', null],
      default: null,
    },

    // ── WHERE `collectedKg` CAME FROM ───────────────────────────────────
    //
    // The order side of Consignment.stops[].weight — same enum, same
    // meanings, written in the same atomic pass. It lives on the Order too
    // because the Order is what a receipt, a CSV export and a settlement are
    // built from, and a delivered quantity printed without its provenance is
    // the exact lie this field exists to stop: "512 kg" reads as measured
    // whether or not anybody owned a scale.
    //
    // WHO established it is NOT repeated here — `recordedBy` /
    // `recordedByRole` immediately above already name them.
    //
    // See data/gateRecord.js for the values and why 'estimated' is one of
    // them.
    weight: {
      method: {
        type: String,
        enum: [
          'collection_centre_scale', 'public_weighbridge', 'farm_scale',
          'estimated',
          // SERVER-SET ONLY — the legacy POST /collect route recorded no
          // method. Never postable, same rule as reason: 'run_abandoned'.
          'not_recorded',
          null,
        ],
        default: null,
      },
      ref: { type: String, default: '', maxlength: 60 },
    },

    // ── THE GRADE SEEN AT THE GATE, AGAINST THE ONE DECLARED ────────────
    //
    // The order side of Consignment.stops[].grade. Both sides carry it
    // because they answer to different people: the stop is the run's record
    // for the driver and the group, the order is the trade's record for the
    // farmer, the buyer, the receipt and any grievance.
    //
    // ⚠️ NOTHING IN THIS BLOCK MOVES MONEY. `pricePerKg`, `cropTotal`,
    // `farmerPayout` and `grandTotal` are untouched by a grade discrepancy,
    // deliberately and permanently. The payable already follows actually-
    // collected kilograms through `collected_short`; a grade difference is a
    // recorded fact for the two parties to settle, not an input to a formula.
    grade: {
      declared: { type: String, enum: ['A', 'B', 'C', null], default: null },
      observed: { type: String, enum: ['A', 'B', 'C', null], default: null },
      discrepancy: {
        type: String,
        enum: ['match', 'downgrade', 'upgrade', 'observed_only', null],
        default: null,
      },
      // Only the farmer may write this, and only about their own lot. It is
      // what turns a driver's claim into a concession — the same distinction
      // Dispute.resolution.outcome draws, and the only form of this record
      // that services/trustService.js will look at.
      farmerResponse: { type: String, enum: ['accepted', 'contested', null], default: null },
      farmerResponseNote: { type: String, default: '', maxlength: 300 },
      farmerRespondedAt: { type: Date, default: null },
    },

    // ── WHAT THE LOT LOOKED LIKE — CONDITION, WHICH IS NOT A GRADE ──────────
    //
    // The grade block above is skilled judgement and, on a HIRED run, this app
    // deliberately does not ask for it (see data/gateRecord.js GRADING_ROLES: a
    // truck driver is not a grader, and a letter recorded by somebody with no
    // standing to give it is worse than no letter at all).
    //
    // This is what that same driver genuinely IS in a position to say. "Not the
    // crop on the order", "wet and sprouting", "bags torn" — plain observations
    // that need eyes, not expertise or a spec. Every recorder may set them, on
    // every kind of run.
    //
    // ⚠️ `checked: false` AND `checked: true` WITH AN EMPTY `flags` ARE DIFFERENT
    // FACTS AND MUST NEVER BE COLLAPSED. "Nobody looked" and "somebody looked and
    // saw nothing wrong" are opposite pieces of evidence in an argument about a
    // bad lot — the same distinction weight.method draws between `not_recorded`
    // and `estimated`. A single "no problems reported" would report the first as
    // the second.
    //
    // ⚠️ IT MOVES NO MONEY, exactly like the grade block. The buyer judges the
    // lot on arrival and a grievance is where a quality disagreement is settled.
    condition: {
      checked: { type: Boolean, default: false },
      flags: { type: [String], default: [] },
      note: { type: String, default: '', maxlength: 300 },
    },
  },

  // ── status machine ──
  //   awaiting_agent → accepted → picked_up → delivered
  //   awaiting_agent → no_agents (dispatch lapsed; vendor may retry or cancel)
  //   awaiting_agent | no_agents → cancelled
  //   accepted → cancelled   (the captain found nothing to collect — the
  //                           existing value fits exactly: no crop moved, no
  //                           payout owing, and /settle already excludes it)
  //   picked_up → stranded   (the shared run carrying it was ABANDONED)
  //
  // ⚠️ WHY `stranded` EXISTS AND WHY `picked_up` WAS NOT REUSED
  //   `picked_up` was checked first, and it does describe the physical fact —
  //   the produce genuinely was picked up and never delivered. But it is the
  //   status of every HEALTHY in-flight order too, so leaving a stranded order
  //   there makes it indistinguishable from one that is simply still on the
  //   road: no list, no query and no screen can separate "arriving this
  //   afternoon" from "on a broken-down truck nobody can reach". The whole
  //   point of the state is that a human can SEE that this farmer's crop was
  //   collected and never arrived, so it has to be its own value.
  //
  //   It is emphatically not `cancelled` either. A cancelled order means no
  //   crop moved and nothing is owed; a stranded one means real produce left a
  //   real farm. `farmerPayout`, `cropTotal` and `quantityKg` are therefore
  //   left exactly as the pickup recorded them — the farmer is owed for what
  //   they handed over, and zeroing it would quietly write that debt off.
  //   And it is not `delivered`: nothing arrived, so it must never be counted
  //   as a completed delivery (services/trustService.js reads `delivered`).
  status: {
    type: String,
    enum: ['awaiting_agent', 'no_agents', 'accepted', 'picked_up', 'delivered', 'cancelled', 'stranded'],
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

  // ── SET ONLY WHEN status === 'stranded' ─────────────────────────────────
  // The crop left this farm and the run carrying it was abandoned. These say
  // when, who declared it and why, so the farmer chasing their money is not
  // told merely that "something went wrong" — the same reason
  // `pickupOutcome.reason` is a fixed list rather than free text.
  strandedAt:     { type: Date, default: null },
  strandedBy:     { type: String, default: null },
  strandedReason: {
    type: String,
    enum: ['vehicle_breakdown', 'driver_unreachable', 'accident', 'route_blocked', 'other', null],
    default: null,
  },
  // ── WHERE THIS RECORD CAME FROM ─────────────────────────────────────────
  // null for a real trade. 'demo_illustrative' for seeded data — the same
  // value CropListing, Fpo, FpoMaster and Warehouse already use.
  //
  // ⚠️ IT EXISTS BECAUSE A SEEDER HAD NO WAY TO LABEL OR REMOVE ITS OWN ROWS.
  // scripts/seedTradeDemo.js writes hundreds of orders and runs; without a
  // field, Mongoose strict mode silently DROPS an unknown key, so the marker
  // would have vanished on write and --purge would have found nothing —
  // leaving demo trades in the database permanently with no way to tell them
  // from real ones. Same failure as the nested-coordinates bug recorded in
  // models/CropListing.js: the write throws no error, it just does nothing.
  dataSource: { type: String, default: null, index: true },

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

// models/Consignment.js
const mongoose = require('mongoose');

// ONE VEHICLE, SEVERAL FARMS — the aggregation the plan calls the differentiator.
//
// WHY THIS IS NOT `Order.pickup: [...]`
//   The plan says to make Order.pickup an array. That was the right shape when
//   it was written, but B1, C4 and C5 have landed since, and each of them made
//   Order a PER-FARMER document:
//     • B1 gave it farmerPayout and settlement{} — whose settlement?
//     • C4 disputes are per order, per party — who is the counterparty?
//     • C5 receipts are issued to one farmer — whose receipt?
//   Three farmers in one Order document has no answer to any of those.
//
//   What is actually shared is the TRIP, not the sale. Three smallholders
//   sharing a tempo are making three sales and hiring one vehicle. So each
//   farmer keeps their own Order — own payout, own OTP, own settlement, own
//   dispute surface, own receipt — and this document groups those orders into
//   one multi-stop run with one fare split between them.
//
// WHY IT MATTERS COMMERCIALLY, in this app's own fare table:
//   100 kg over 65 km by tempo costs Rs 2,120 — 71% of the crop's value, which
//   is not a trade anyone makes. The same tempo carrying 1,500 kg costs the
//   same Rs 2,120, or 5%. The vehicle is the cost; the load is nearly free.
//   Splitting one vehicle three ways is what turns an impossible trade into a
//   routine one, and it is why FPOs exist.
const StopSchema = new mongoose.Schema({
  // ⚠️ REQUIRED FOR A BUYER RUN, ABSENT ON AN FPO COLLECTION RUN — and the
  // difference is the whole reason `purpose` exists below.
  //
  // A buyer run exists to fulfil Orders, so every stop has one. An FPO
  // COLLECTION run moves a member's produce from their farm to the group's
  // own premises BEFORE it is sold: there is no buyer, no price and no Order
  // yet, and minting a placeholder Order to satisfy this field would be
  // inventing a trade that has not happened. This app records real things.
  //
  // ⚠️ `orderId` IS ALSO THE STOP'S ADDRESS throughout routes/consignments.js
  // (writeStopOutcome's $elemMatch, and the `{ orderId, otp }` body every
  // recording screen posts). That is why stops are now addressed by their own
  // `_id` — which Mongoose has always minted for them — with orderId kept as
  // an accepted alias so every existing caller and screen keeps working.
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: function () { return this.ownerDocument().purpose !== 'fpo_collection'; },
    default: null,
  },
  // ⚠️ WHICH LOT THIS STOP IS COLLECTING, and it is REQUIRED on a collection
  // run for the same reason `orderId` is required on a buyer run: it is the
  // only link back to the stock the vehicle is there to pick up. A collection
  // run has no Order, so without this the run knows a farmer and a weight and
  // has no idea which listing to draw down when the produce arrives.
  //
  // Declared here because Mongoose strict mode DROPS AN UNKNOWN KEY SILENTLY
  // — no error, no write. Writing `listingId` without this line would have
  // produced a run that looked correct in the API response and carried no
  // link to any stock at all. That failure has shipped four times in this
  // project (Order.dataSource, CropListing nested coordinates, seeded
  // `localName`, seeded `agentId`); it was caught here by checking
  // `schema.path()` for every written key BEFORE running anything.
  listingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CropListing',
    required: function () { return this.ownerDocument().purpose === 'fpo_collection'; },
    default: null,
  },

  farmerUid:  { type: String, required: true },
  farmerName: { type: String, default: '' },
  farmerPhone:{ type: String, default: '' },
  cropName:   { type: String, default: '' },
  quantityKg: { type: Number, required: true },

  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  label: { type: String, default: '' },

  // Visiting order, 0-based. Set at creation and not re-optimised mid-trip:
  // an agent halfway through a run must not have their next stop change.
  sequence: { type: Number, required: true },
  // Distance from the previous stop, from the OSRM legs.
  legKm: { type: Number, default: null },

  // This stop's share of the fare. Recorded per stop so a receipt can show the
  // farmer what the shared vehicle cost them, and so the split is auditable.
  fareShare: { type: Number, default: 0 },

  // ONE OTP PER FARMER. A single code for the whole run would mean farmer one
  // can release farmer three's crop, and a driver who collected the code at
  // the first gate could skip the rest.
  //
  // `collected` means PRODUCE WENT ON THE VEHICLE — true for a full pickup and
  // for a short one, false when nothing was loaded. It is deliberately NOT
  // "the captain has been here": that is `outcome !== 'pending'`.
  collected:   { type: Boolean, default: false },
  collectedAt: { type: Date, default: null },

  // ── PER-STOP OUTCOME ────────────────────────────────────────────────────
  // Before this existed the status enum was trip-level only, so a captain
  // arriving at farm 3 of 5 to find nobody home had nowhere to put that fact.
  // The run could not be delivered (every stop had to be `collected`), the
  // consignment's totals still claimed the planned load, and the farmer's
  // Order sat in `accepted` forever — while a buyer had committed to a total
  // quantity that could no longer arrive. A trip-level status cannot describe
  // a per-stop failure, and pretending the run either wholly worked or wholly
  // did not is the same silence this app refuses everywhere else.
  //
  //   pending          not visited yet
  //   collected_full   everything that was ordered went on the vehicle
  //   collected_short  some of it did — collectedKg says how much
  //   not_collected    none of it did — failureReason says why
  outcome: {
    type: String,
    enum: ['pending', 'collected_full', 'collected_short', 'not_collected'],
    default: 'pending',
  },
  // What ACTUALLY went on the vehicle, against quantityKg which is what was
  // planned. null until the stop has an outcome; 0 for a failed stop.
  collectedKg: { type: Number, default: null },
  // A small enum, not free text — same rule as Dispute.reason. "Farmer absent"
  // is countable and a pattern of it against one farm is exactly the signal
  // this field exists to surface; "nobody was there I think" is neither.
  failureReason: {
    type: String,
    enum: [
      'farmer_absent',        // nobody at the gate
      'quantity_not_ready',   // less on hand than was listed
      'produce_rejected',     // visibly not what was sold; refused at the gate
      // SERVER-SET ONLY, and never postable by a captain: the run was
      // abandoned before anybody reached this farm. It exists because the
      // farmer whose order this cancels is entitled to see that nobody ever
      // came — that it was not "farmer absent" and had nothing to do with them
      // or their crop.
      'run_abandoned',
      'other',
      null,
    ],
    default: null,
  },
  // Alongside the reason, never instead of it.
  outcomeNote: { type: String, default: '', maxlength: 500 },
  outcomeAt:   { type: Date, default: null },
  // WHO recorded it. A failed stop costs a farmer their sale, so the record has
  // to say who declared it, the same way Dispute.resolvedBy records who closed
  // a grievance.
  //
  // It is no longer always a captain. A run the FPO drives itself (or hires a
  // contracted transporter for) has NO agent, so the FPO admin keys in what
  // their own driver reported — which is exactly what a paper trip sheet is.
  // `outcomeByRole` keeps the two apart, because "the captain who came to your
  // gate says nobody was home" and "your own FPO's office says nobody was
  // home" are different claims and a farmer disputing one should be able to
  // see which was made.
  //
  // 'vendor' joins them because the buyer who booked the run may abandon it
  // when the captain has gone silent, and abandoning writes a `not_collected`
  // outcome on every farm nobody reached. That is a THIRD kind of claim again
  // — the buyer saying "the vehicle never got there" — and it must not be
  // filed under the captain's name.
  //
  // 'fpo_driver' is the FOURTH, and it is the one this field was always
  // missing. Before the FPO could assign a driver account to its own run, an
  // own/contracted run had exactly two possible authors — the group's office,
  // or nobody — so "your own FPO's office says nobody was home" was the best
  // claim available on a run the app's captain pool never touched. With a
  // driver assigned it is no longer the best available: the person who stood
  // at the gate keyed it in themselves. That is a materially stronger record
  // than the office relaying it down a phone line, and a farmer disputing a
  // failed stop is entitled to see which of the two they are arguing with.
  outcomeBy:     { type: String, default: null },
  outcomeByRole: {
    type: String,
    enum: ['agent', 'fpo_driver', 'fpo_admin', 'vendor', null],
    default: null,
  },

  // The weight this stop's fareShare was computed from — the PLANNED weight,
  // frozen at creation. Stored so an auditor can see the share was never
  // recomputed on what was actually collected, and why. See FARE_SPLIT_POLICY
  // in routes/consignments.js.
  fareShareBasisKg: { type: Number, default: null },

  // ── HOW THE KILOGRAMS ABOVE WERE ESTABLISHED ────────────────────────────
  //
  // `collectedKg` is a number that decides what a farmer is paid, and until
  // this block existed nothing anywhere said where it came from. Weight was
  // asserted twice — once by the farmer when they listed, once by whoever
  // stood at the gate — and measured never. No weighbridge existed in the
  // model at all, though a weighing charge is a line item on every mandi sale
  // this app records.
  //
  // The values, what each means and why 'estimated' is on the list at all
  // live in data/gateRecord.js. The short version: most farm-gate pickups in
  // Maharashtra have no scale within reach, and leaving the honest value out
  // would not make those pickups weighed — it would make them PRESENT as
  // weighed.
  //
  // ⚠️ THERE IS NO `weighedBy` HERE, DELIBERATELY. The stop already records
  // who keyed the outcome in and under which rule (`outcomeBy` /
  // `outcomeByRole` above), and that IS the person who established the
  // weight. A parallel field would be a second answer to the same question
  // and a second place for it to disagree with itself.
  weight: {
    method: {
      type: String,
      enum: [
        'collection_centre_scale',  // the FPO's / collection point's own scale
        'public_weighbridge',       // a public weighbridge — issues a ticket
        'farm_scale',               // the farmer's own scale at the gate
        'estimated',                // NOT WEIGHED: bags counted, or judged by eye
        // SERVER-SET ONLY, never postable — a pickup recorded through the
        // legacy POST /collect route, which predates this field and asks
        // nothing. Kept apart from 'estimated' because "somebody judged it"
        // and "the app never asked" are different facts.
        'not_recorded',
        null,
      ],
      default: null,
    },
    // The weighbridge ticket or slip number, when there is one. Free text
    // because a ticket number has no shape worth validating — it is here so a
    // disputed weight can be looked up, not so the app can check it.
    ref: { type: String, default: '', maxlength: 60 },
  },

  // ── THE GRADE ACTUALLY SEEN AT THE GATE ─────────────────────────────────
  //
  // `CropListing.grade` is SELF-DECLARED against the AGMARK criteria in
  // data/gradeSpecs.js and nobody checks it — that file says so in its own
  // header. Once grade lots carried a price spread, an unchecked declaration
  // invited exactly the fraud grade separation exists to prevent.
  //
  // The pickup is the first and only moment a person looks at the actual
  // produce, so this is where an observation can honestly be recorded.
  //
  // ⚠️ RECORDING IS ALL IT DOES. A difference here changes NO price, NO
  // payout and NO grade on the listing. An algorithm quietly repricing a
  // farmer's crop because a driver tapped a lower letter would be this app
  // adjudicating a two-party disagreement, which is the one thing CLAUDE.md
  // says it must not do. The difference is surfaced to the buyer and the
  // money is settled through the existing grievance flow.
  grade: {
    // What the farmer declared, snapshotted when the stop was recorded. Null
    // for the majority of listings, which carry no grade at all.
    declared: { type: String, enum: ['A', 'B', 'C', null], default: null },
    // What the recorder says they saw. Defaults to the declaration — the
    // common case is "it is what they said it is", and making the recorder
    // retype it would produce noise, not evidence.
    observed: { type: String, enum: ['A', 'B', 'C', null], default: null },
    // Derived from the pair, stored so a query can find discrepancies without
    // re-deriving the comparison in five places. See compareGrades().
    discrepancy: {
      type: String,
      enum: ['match', 'downgrade', 'upgrade', 'observed_only', null],
      default: null,
    },
    // ── THE HALF THAT MAKES A DOWNGRADE MEAN SOMETHING ────────────────────
    // A driver typing a lower grade is a CLAIM, exactly as a raised dispute
    // is a claim — and this app's settled rule is that a complaint raised is
    // not a complaint upheld. So the farmer whose lot it is answers it, on
    // their own account, and only `accepted` — the farmer conceding — is
    // treated as evidence anywhere else in the app.
    //
    // Contesting costs the farmer nothing and the claim stays on the record
    // either way. The remedy for a buyer who is unhappy is the grievance
    // flow, not this field.
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
}, { _id: true });

const ConsignmentSchema = new mongoose.Schema({
  // ⚠️ Required for a buyer run; null on an FPO collection run, which has no
  // buyer at all. Every existing query that scopes to a buyer filters on this
  // field (`GET /vendor/mine`, `/vendor/purchases`), so a collection run is
  // excluded from them automatically rather than by a new condition.
  vendorUid: {
    type: String,
    required: function () { return this.purpose !== 'fpo_collection'; },
    default: null,
    index: true,
  },
  vendorName:    { type: String, default: '' },
  vendorPhone:   { type: String, default: '' },

  orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true }],
  stops:    { type: [StopSchema], required: true },

  dropoff: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    label: { type: String, default: '' },
    district: { type: String, default: '' },
  },

  vehicleType: { type: String, enum: ['auto', 'tempo', 'truck'], required: true },
  // PLANNED load. Left as planned on purpose: it is what the vehicle was
  // quoted and capacity-checked against, and rewriting it after a stop fails
  // would make the fare on this document unexplainable.
  totalQuantityKg: { type: Number, required: true },
  // What the vehicle ACTUALLY carried. Maintained as each stop reports its
  // outcome, so the run's delivered total is never the planned total wearing a
  // delivered status. null until the first stop is recorded.
  collectedQuantityKg: { type: Number, default: null },

  // The whole run, farm to farm to market.
  distanceKm:   { type: Number, required: true },
  durationMin:  { type: Number, required: true },
  routeSource:  { type: String, enum: ['osrm', 'haversine'], default: 'haversine' },
  routePolyline:{ type: [[Number]], default: [] },

  // ONE fare for the vehicle, split across the stops by weight.
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
    agentPayout: Number,
  },
  // What the same crop would have cost as separate single-farm trips. Kept so
  // the saving can be shown as a real number rather than a claim.
  soloFareTotal: { type: Number, default: null },

  agentUid:   { type: String, default: null, index: true },
  agentName:  { type: String, default: '' },
  agentPhone: { type: String, default: '' },
  agentVehicleNumber: { type: String, default: '' },

  // ── HOW THE VEHICLE WAS ARRANGED ────────────────────────────────────────
  //
  // "The FPO owns ten trucks" is not a thing to model — fleet size is an asset
  // register and this app has no business holding one. What actually changes
  // the software is the MODE: whether a captain from this app's pool drives the
  // run, or somebody outside it does.
  //
  //   hired       the existing behaviour, and the only one before this field:
  //               the run is dispatched to the captain pool, a captain accepts
  //               it, and the fare comes from services/fareService.
  //   own         the FPO's own vehicle and driver.
  //   contracted  a transporter the FPO uses regularly, at a negotiated rate.
  //
  // (A farmer bringing their own produce in needs no consignment at all —
  // that is a single Order with no shared vehicle, which this app already
  // handles.)
  //
  // own/contracted runs are NEVER dispatched: no `dispatchExpiresAt`, no
  // captain-pool listing, `agentUid` stays null — which the field already
  // allowed. The run is otherwise an ordinary Consignment: same stops, same
  // per-farmer OTPs, same per-stop outcomes.
  // ─────────────────────────────────────────────────────────────────────
  // WHAT THIS RUN IS FOR. Two genuinely different journeys share this
  // document, and they must stay tellable apart in every query.
  //
  //   'buyer_order'    farm(s) → the BUYER's gate, fulfilling Orders.
  //                    Everything before Phase 3 is this, which is why it is
  //                    the default — no migration, and every existing
  //                    document reads as what it has always been.
  //
  //   'fpo_collection' member farm(s) → the FPO's OWN premises, aggregating
  //                    produce before there is a buyer. No vendor, no Order,
  //                    no price. `dropoff` is the group's godown.
  //
  // ⚠️ EXTENDING THIS DOCUMENT RATHER THAN ADDING A SECOND MODEL IS
  // DELIBERATE. A collection run needs per-stop outcomes, the gate record
  // (weight, condition, grading rights), the by-weight fare split, the exact
  // ≤5-stop ordering, release/abandon, live tracking and the captain pool —
  // all of which already exist here and none of which may be forked. A
  // parallel CollectionRun model would be a second implementation of every
  // rule in this file, and this project's decision log is largely a list of
  // what happens when one of those drifts.
  purpose: {
    type: String,
    enum: ['buyer_order', 'fpo_collection'],
    default: 'buyer_order',
    index: true,
  },

  transportMode: {
    type: String,
    enum: ['hired', 'own', 'contracted'],
    default: 'hired',
    index: true,
  },

  // Which FPO arranged a non-hired run. Required for own/contracted, because
  // it is what makes the run finishable: with no agent, the FPO's own admin is
  // the person who records what each stop reported. null for a hired run.
  fpoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fpo', default: null, index: true },

  // The driver and the money on a non-hired run.
  //
  // ⚠️ THE COST IS STATED, NOT COMPUTED, AND THE FIELD SAYS SO.
  //   services/fareService prices an INDEPENDENT CAPTAIN's economics — a base
  //   that covers turning the key, a per-km rate calibrated against a ₹18–22/km
  //   running cost, and a tapering return-leg charge that exists because a
  //   captain drives home empty and has to be paid for it. None of that
  //   describes what an FPO's own tempo costs the FPO, which already owns the
  //   vehicle and is not driving home to a different district. Pushing a made
  //   up number through that table would produce a figure with a decimal point
  //   and no meaning behind it.
  //
  //   So the number comes from whoever is actually paying it, and
  //   `costSource` records where it came from — the same discipline as
  //   Warehouse.rateSource: 'assumed', which exists because MSWC's real tariff
  //   could not be reduced to one ₹/tonne/month without inventing it.
  //
  // ── THE DRIVER IS A REAL USER, NOT A NAME ON A TRIP SHEET ───────────────
  //   `driverName`/`driverPhone` were free text typed by the FPO admin at
  //   creation, which meant the person actually at the farm gate had no login,
  //   no stop list, no OTP field and no way to post a position. The office
  //   recorded every stop, so the record said "collected at farm 3" keyed by
  //   somebody who was not there, the farmer's pickup OTP had to be read down
  //   a phone line (a call per farm, and a much weaker code than one typed at
  //   the gate), and NO location could ever be captured on an own/contracted
  //   run at all.
  //
  //   `driverUid` promotes that text to a user link. It is set only by the
  //   FPO's own admin, only on a run belonging to their own group, and only
  //   naming an account that has registered.
  //
  // ⚠️ IT IS NOT `agentUid`, AND THAT IS THE WHOLE POINT.
  //   Writing the driver into `agentUid` would make them a captain: the run
  //   would stop being agentless, `resolveRunActor()` would hand it the
  //   captain-only rule, the FPO admin's office-side fallback would vanish,
  //   and `isActiveJob` on an agentless run would collide on the partial
  //   unique index exactly as recorded above. An FPO driver is authorised BY
  //   THIS ASSIGNMENT, on THIS run — never by being in the dispatch pool, and
  //   they are never offered anything else.
  transport: {
    driverName:   { type: String, default: '' },
    driverPhone:  { type: String, default: '' },
    // The registered account driving this run, or null when the FPO is still
    // working it from the office. Never set on a hired run — a hired run has a
    // captain, and two drivers on one vehicle is the thing this app refuses.
    driverUid:        { type: String, default: null },
    driverAssignedAt: { type: Date, default: null },
    driverAssignedBy: { type: String, default: null },
    // Set when an assignment is withdrawn (a flat phone, a driver swap), so
    // "the office recorded these stops because the driver had no phone" reads
    // as a fact rather than as a gap. The name/phone are deliberately LEFT in
    // place: they are still who drove.
    driverUnassignedAt: { type: Date, default: null },
    vehicleNumber:{ type: String, default: '' },
    // What this run costs, in rupees, for the whole vehicle. Split across the
    // stops by weight exactly as a hired fare is, so every receipt still
    // reconciles. May be 0 — an FPO that absorbs the cost into its fee is a
    // real arrangement and 0 is the honest figure for it.
    cost:         { type: Number, default: null },
    costSource: {
      type: String,
      enum: [
        'captain_fare_table',  // hired: computed by services/fareService
        'fpo_stated',          // own: the FPO says what its vehicle costs it
        'negotiated_rate',     // contracted: a rate agreed with a transporter
        null,
      ],
      default: null,
    },
    // Never taken from the client. Derived from costSource so a screen cannot
    // present a stated figure as a computed one.
    costNote:     { type: String, default: '' },
    arrangedBy:   { type: String, default: null },
  },

  // awaiting_agent → accepted → collecting → in_transit → delivered
  //                → no_agents | cancelled | abandoned
  //   accepted → awaiting_agent   (RELEASED — see `releases` below)
  //
  // ── WHY `in_transit` EXISTS ──────────────────────────────────────────────
  //   The enum ran `collecting → delivered` with nothing in between, so the
  //   longest and most anxious leg of the whole journey — the last farm gate
  //   to the buyer's gate — was invisible to everybody on it. A buyer refreshed
  //   a screen that said "collecting" while the truck had been on the highway
  //   for an hour; a farmer whose crop was aboard could not tell whether the
  //   vehicle was still three farms behind them or already at the mandi.
  //
  // ⚠️ IT IS ENTERED FROM EVIDENCE, NEVER FROM A BUTTON.
  //   There is deliberately no "I have finished collecting" call. A driver
  //   halfway down the highway is not going to remember to press it, and a
  //   status nobody presses is a status that lies. The transition is derived
  //   from the stops themselves, in the same write path that records them:
  //   the run enters `in_transit` the moment EVERY stop has an outcome (any
  //   outcome — a farm that gave nothing has still been visited and is not
  //   coming back) AND at least one kilogram is actually aboard.
  //
  //   The second half matters. A run where every farm failed is carrying
  //   nothing, so there is nothing in transit; it stays `collecting` and is
  //   closed as `cancelled` by /deliver's empty-run path. Calling an empty
  //   vehicle "in transit" would put a delivery on a buyer's screen that was
  //   never going to arrive.
  //
  // A run whose every stop reported `not_collected` ends `cancelled`, not
  // `delivered`: there is nothing to hand over and no buyer is going to read
  // out a code for an empty vehicle. The per-stop failures live on the stops
  // themselves — this enum stays trip-level and does not try to describe them.
  //
  // ⚠️ `abandoned` IS NOT `cancelled`, AND THE DIFFERENCE IS THE WHOLE POINT.
  //   `cancelled` means the run ended with nothing on the vehicle — every farm
  //   was visited and none of them handed anything over, so nobody is out of
  //   pocket and no crop is unaccounted for. `abandoned` means the opposite:
  //   produce WAS loaded and then the run stopped — a breakdown, a driver who
  //   quit, a road closed. Somebody's crop is on a vehicle that is not coming.
  //   Collapsing the two would hide exactly the case a human has to act on, so
  //   the enum keeps them apart and `abandonment.strandedOrderIds` names the
  //   farmers whose produce is in limbo.
  status: {
    type: String,
    enum: [
      'awaiting_agent', 'no_agents', 'accepted', 'collecting', 'in_transit',
      'delivered', 'cancelled', 'abandoned',
    ],
    default: 'awaiting_agent',
    index: true,
  },
  isActiveJob: { type: Boolean },

  // ── HANDING A RUN BACK, CLEANLY ─────────────────────────────────────────
  //
  // Before this existed the ONLY exits from an accepted run were delivering it
  // or the all-stops-failed close. A captain who broke down, quit or simply
  // stopped answering after two of five pickups left the run in `collecting`
  // FOREVER: two farmers' produce on a truck nobody could reach, no other
  // captain able to take the run, and those farmers' orders unable to settle
  // or be disputed out.
  //
  // A RELEASE is the blameless half. Nothing has been collected — no stop has
  // any outcome — so the run simply goes back to the pool and the captain is
  // freed. No farmer is harmed, because nothing moved.
  //
  // An ARRAY, not one field: a run can be released more than once (released,
  // taken by a second captain, released again). Each release is a fact about a
  // DIFFERENT captain, and overwriting one with the next would erase who
  // dropped it — the same reason stops[].outcomeBy records who declared a
  // failed pickup rather than just that one happened.
  releases: [{
    at:       { type: Date, default: Date.now },
    // Who asked for it, and under which rule. A captain who has vanished
    // cannot call anything, so the buyer who booked the run and the admin of
    // the FPO it belongs to may hand it back on their behalf.
    by:       { type: String, required: true },
    byRole:   { type: String, enum: ['agent', 'vendor', 'fpo_admin', 'system'], required: true },
    // The captain who was holding it when it was released. Kept because `by`
    // is often somebody else, and "who dropped this run" is the question worth
    // being able to answer later.
    agentUid: { type: String, default: null },
    reason:   { type: String, default: 'other' },
    note:     { type: String, default: '', maxlength: 500 },
  }],

  // ── ABANDONING A RUN WITH PRODUCE ABOARD ────────────────────────────────
  //
  // Terminal, and deliberately NOT reassignable. A new captain cannot collect
  // what is already on someone else's vehicle, so "just put it back in the
  // pool" is not available once anything has been loaded — pretending it is
  // would send a second driver to farms that have already handed over.
  //
  // The two halves of the run are treated differently and the record says so:
  //   cancelledOrderIds — stops still `pending`. Handled exactly as a
  //                       `not_collected` stop already is: the order is
  //                       cancelled, the kilograms go back on the listing, and
  //                       the fare share stays on the cancelled order.
  //   strandedOrderIds  — stops that had already handed produce over. Those
  //                       orders go to `Order.status: 'stranded'` — NOT
  //                       delivered (nothing arrived) and NOT cancelled (real
  //                       crop left a real farm and is owed for).
  abandonment: {
    at:       { type: Date, default: null },
    by:       { type: String, default: null },
    byRole:   { type: String, enum: ['agent', 'vendor', 'fpo_admin', null], default: null },
    agentUid: { type: String, default: null },
    // A fixed list, same rule as stops[].failureReason and Dispute.reason:
    // "vehicle broke down" is countable, "it all went wrong" is not.
    reason: {
      type: String,
      enum: ['vehicle_breakdown', 'driver_unreachable', 'accident', 'route_blocked', 'other', null],
      default: null,
    },
    note: { type: String, default: '', maxlength: 500 },
    strandedOrderIds:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
    cancelledOrderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
    // What was on the vehicle when it stopped. Kept separately from
    // collectedQuantityKg so the figure cannot drift if the roll-up changes.
    strandedKg: { type: Number, default: null },
  },

  // ── WHICH BULK PURCHASE THIS RUN IS ─────────────────────────────────────
  //
  // One 2-tonne FPO lot buy writes five Orders and one Consignment, and until
  // this block existed NOTHING on either said which lot they came from. A
  // hired FPO-lot run carries `fpoId: null` on purpose (that field decides who
  // may work an AGENTLESS run, and a hired run has a captain), so a client
  // holding the run could not name the group, the crop or the grade the buyer
  // actually shopped for — the buyer's order list showed five unrelated rows.
  //
  // This is provenance, not a second copy of the sale: quantities, prices and
  // payouts stay on the Orders, and a client joins them by `consignmentId`.
  // Only the facts that exist nowhere else are recorded here.
  lot: {
    // 'pooled_orders' is the F1 path — a buyer picking their own orders off
    // the share-vehicle screen. 'fpo_lot' is a purchase from the group catalog.
    source:   { type: String, enum: ['pooled_orders', 'fpo_lot'], default: 'pooled_orders' },
    lotKey:   { type: String, default: null },
    // The group whose catalog was bought from. Distinct from the top-level
    // `fpoId`, which is authorisation for an agentless run and is null here on
    // a hired run — merging the two would hand an FPO admin the captain-only
    // rules on somebody else's dispatched run.
    fpoId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Fpo', default: null },
    fpoName:  { type: String, default: '' },
    cropName: { type: String, default: '' },
    // The grade lot, exactly as the catalog names it. Grades are never blended,
    // and 'ungraded' is its own bucket rather than a fourth tier — see
    // services/lotCatalogService.js describeGrade().
    gradeKey:      { type: String, default: null },
    gradeCode:     { type: String, default: null },
    gradeLabel:    { type: String, default: '' },
    gradeDeclared: { type: Boolean, default: false },
  },

  dispatchExpiresAt: Date,
  acceptedAt:  Date,
  // When the last farm gate was recorded and the vehicle actually set off for
  // the buyer. Derived, never posted — see the status enum above.
  inTransitAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  abandonedAt: Date,
  rejectedBy:  { type: [String], default: [] },

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

  dropOtp: String,

  // ── LIVE POSITION — the SAME SHAPE AS Order.tracking, deliberately ───────
  //
  // A buyer's map should not need two renderers to show a 50 kg single pickup
  // and a 2-tonne five-farm run. Field for field this mirrors Order.tracking;
  // the two extra fields below say WHO is pinging, which an Order never had to
  // ask because an Order only ever has a captain.
  //
  // ⚠️ FOREGROUND ONLY. NOTHING HERE IS EVER INTERPOLATED.
  //   Expo Go gives no background location and this app has no push channel,
  //   so a multi-hour run WILL have long gaps: the phone is in a pocket for
  //   most of it. The honest response is the one the single-order map already
  //   makes — store the last real fix, report how old it is, and let the UI
  //   dim it and say "last seen 14 min ago". A position between two pings is
  //   never computed, smoothed, dead-reckoned or carried forward as if it were
  //   current. See GET /api/consignments/:id/track, which returns staleness as
  //   structured data precisely so no screen has to guess.
  tracking: {
    lat: Number,
    lng: Number,
    heading: { type: Number, default: 0 },
    // Monotonic client counter, NOT a timestamp — phone clocks are routinely
    // minutes out and a skewed clock would freeze the marker forever.
    //
    // -1, not Order's 0: an agentless run is created already `accepted` with
    // nobody to seed a position, so its first ping has to be allowed to be
    // seq 0. A captain-accepted run still seeds seq 0 at accept exactly as
    // before, so nothing about the hired path changes.
    seq: { type: Number, default: -1 },
    // The last time a REAL fix landed. Not bumped by a rejected out-of-order
    // ping: this is "when we last actually knew", and that is the number the
    // staleness the UI renders is computed from.
    updatedAt: Date,
    simulated: { type: Boolean, default: false },
    // Who is posting. A run can be driven by a pool captain OR by an FPO's own
    // assigned driver, and a position is an eyewitness fact like a stop
    // outcome — the record says whose phone it came from. The FPO's OFFICE can
    // never appear here: an admin keying in a trip sheet is not in the
    // vehicle, and letting them post a position would be inventing one.
    byUid:  { type: String, default: null },
    byRole: { type: String, enum: ['agent', 'fpo_driver', null], default: null },
  },
}, { timestamps: true });

ConsignmentSchema.index({ vendorUid: 1, createdAt: -1 });
ConsignmentSchema.index({ status: 1, createdAt: -1 });
ConsignmentSchema.index({ 'stops.farmerUid': 1, createdAt: -1 });
// "What am I driving?" for an assigned FPO driver — the feed that replaces the
// captain pool for somebody who is deliberately not in it.
ConsignmentSchema.index({ 'transport.driverUid': 1, status: 1 });
// "What did this group sell as a lot?" — the buyer's bulk-purchase list.
ConsignmentSchema.index({ 'lot.fpoId': 1, createdAt: -1 });

// The same guard Order uses: one live job per agent, enforced by a partial
// unique index rather than a read-then-check. An agent cannot be halfway
// through a three-farm run and also holding a separate single pickup.
ConsignmentSchema.index(
  { agentUid: 1 },
  {
    unique: true,
    partialFilterExpression: { isActiveJob: true },
    name: 'oneActiveConsignmentPerAgent',
  }
);

module.exports = mongoose.model('Consignment', ConsignmentSchema);

// models/Warehouse.js
const mongoose = require('mongoose');

// H1 — STORAGE. The last unbuilt clause of SIH 26132.
//
// The problem statement's own diagnosis: "Farmers may sell immediately after
// harvest because of liquidity or storage constraints and may have weak
// bargaining power." Every other clause was built while the app had no concept
// of a godown at all — which meant the sale-window advice could say "hold" to a
// farmer with nowhere to hold anything, and no way to raise money against the
// crop while he waited. That is not advice. It is an instruction to absorb a
// loss he cannot afford.
//
// WHAT A WAREHOUSE RECORD IS FOR HERE
//   Two things, and nothing else: a place to put the crop, and a RATE, so
//   H2 can price "hold 12 days" in rupees instead of asserting it. This app
//   does not book storage, take payment, or reserve space — same rule as
//   settlement and fares: it informs, the farmer transacts.
//
// TWO KINDS OF RECORD LIVE HERE, AND `dataSource` KEEPS THEM APART.
//   'verified'          — imported from MSWC's own published directory
//                         (mswarehousing.com/aplcsn/Home/display_warehouses):
//                         real name, district, contact, capacity and vacancy.
//                         Still a DATED SCRAPE, not a feed — see capacityAsOf.
//   'seed_illustrative' — hand-written examples with real operators, real
//                         structures and real places, but example capacities.
//                         They exist so the H2 maths and the screens could be
//                         built before real data arrived.
//
//   routes/warehouses.js refuses to let an illustrative record read as a live
//   registry. Showing a farmer "42 t free at Lasalgaon" when nobody knows that
//   is the storage equivalent of faking a live agent position, which this
//   codebase already refuses to do.

// Who runs it. Matters because it decides whether pledge finance is even on
// the table: MSWC and CWC issue warehouse receipts a bank will lend against;
// a neighbour's shed does not.
const OPERATORS = ['mswc', 'cwc', 'apmc', 'cooperative', 'fpo', 'private'];

// What kind of structure. This is NOT cosmetic — it sets the spoilage rate H2
// prices the hold against, and the right structure differs by crop. Onion
// belongs in a ventilated chawl (kanda chawl), not cold storage; putting onion
// in cold storage is a real and expensive mistake.
const STORAGE_TYPES = ['godown', 'ventilated_chawl', 'cold_storage', 'silo'];

const WarehouseSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true, maxlength: 140 },
  operator: { type: String, enum: OPERATORS, required: true },
  type:     { type: String, enum: STORAGE_TYPES, required: true },

  district: { type: String, required: true, index: true },
  taluka:   { type: String, default: '' },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },

  // ⚠️ HOW MUCH THAT COORDINATE IS WORTH — as STRUCTURED data, not prose.
  //
  //   'exact'    somebody placed this record on the godown.
  //   'taluka'   it is on the taluka's main town. Ranking it against a
  //              warehouse in a different taluka is meaningful; ranking it
  //              against another one in the SAME taluka is not.
  //   'district' it is on the district CENTROID. 135 of the 202 imported MSWC
  //              records are, because MSWC publishes an address and no town in
  //              it could be matched. Every such record in a district shares
  //              one point, so their distances are all identical by
  //              construction and cannot be ranked at all.
  //
  // `verifiedNote` has always described this in a sentence, which is exactly
  // the problem: a UI cannot act on prose, so the API went on quoting 22.9 km
  // to one decimal place for six warehouses spread across 70 km of Nashik.
  // null on records written before this field existed —
  // storageService.coordinatePrecision() derives it from the note, and failing
  // that from the coordinate itself, so nothing needed migrating.
  locationPrecision: {
    type: String,
    enum: ['exact', 'taluka', 'district', null],
    default: null,
  },

  capacityTonnes: { type: Number, default: null },
  // Nullable, and NEVER derived from capacity. For the 11 illustrative seeds
  // this stays null — nobody knew. For MSWC imports it holds the figure MSWC
  // itself published on `capacityAsOf`, which is real but is a snapshot: a
  // scrape is not a feed, and the UI must date it rather than imply it is live.
  //
  // (An earlier note here said "no feed exists". MSWC publishes vacancy at
  // mswarehousing.com/aplcsn/Home/display_warehouses — that was wrong.)
  availableTonnes: { type: Number, default: null },

  ratePerTonnePerMonth: { type: Number, required: true },
  // Where that rate came from. MSWC publishes its tariff as paise PER BAG per
  // month plus an ad-valorem component that varies by material and bag weight —
  // it cannot be reduced to a single ₹/tonne/month figure without inventing
  // one. So an imported MSWC godown carries real capacity and real vacancy with
  // an ASSUMED rate, and every screen that prices a hold on it has to say so.
  rateSource: {
    type: String,
    enum: ['published', 'assumed'],
    default: 'assumed',
  },

  // Capacity and vacancy from a dated scrape, not a live feed. Stored with the
  // date so a screen can say "as published on …" rather than implying it just
  // rang the godown.
  capacityAsOf: { type: Date, default: null },

  // Which crops this place will actually take. Empty means general-purpose.
  commodities: { type: [String], default: [] },

  // Pledge finance against a warehouse receipt. The Maharashtra scheme is real
  // and long-standing — MSAMB has run pledge loans through selected APMCs
  // since 1990, and MSWC issues receipts a bank marks a lien against. The app
  // reports ELIGIBILITY only; it does not lend, arrange, or guarantee.
  pledgeLoan: {
    available:      { type: Boolean, default: false },
    maxPctOfValue:  { type: Number, default: 70 },      // schemes run 50–75%
    interestPctPerYear: { type: Number, default: 7 },
  },

  contact: {
    phone: { type: String, default: '' },
    note:  { type: String, default: '' },
  },

  // THE HONESTY FIELD. 'seed_illustrative' records exist so the decision maths
  // and the screens can be built and demonstrated; they are not a registry.
  // Anything promoted to 'verified' must name who checked it and when.
  dataSource: {
    type: String,
    enum: ['seed_illustrative', 'verified'],
    default: 'seed_illustrative',
    index: true,
  },
  verifiedNote: { type: String, default: '' },

  active: { type: Boolean, default: true },
}, { timestamps: true });

// Nearest-in-district is the only query pattern: a farmer stores near the farm
// or near the mandi, never 300 km away.
WarehouseSchema.index({ district: 1, active: 1 });

module.exports = mongoose.model('Warehouse', WarehouseSchema);

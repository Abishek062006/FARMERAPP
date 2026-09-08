// data/warehouseSeed.js
//
// ⚠️ THESE ARE ILLUSTRATIVE RECORDS, NOT A REGISTRY.
//
// Every entry carries `dataSource: 'seed_illustrative'`, routes/warehouses.js
// refuses to strip that, and the UI shows it. They exist so the H2 decision
// maths and the screens around it can be built, tested and demonstrated
// against plausible structures in the right places — nothing more.
//
// WHAT IS REAL HERE
//   · The operators. MSWC runs ~204 centres and 1,000+ godowns statewide
//     (18,24,658 MT constructed capacity as at 30 Sep 2020) and is the body a
//     Maharashtra farmer would actually approach. CWC, APMC godowns and
//     cooperative kanda chawls all exist in these places.
//   · The pledge-loan mechanism. MSAMB has run pledge loans through selected
//     APMCs since 1990 at 50–75% of the value of produce stored in an APMC
//     godown, and MSWC issues warehouse receipts a bank marks a lien against.
//   · The locations. Every coordinate is a real town from
//     data/districtCentroids.js — Lasalgaon and Niphad are the onion belt,
//     Barshi is where Rajendra Chavan sold, Junnar is where Ishwar Gaykar
//     grows tomato.
//   · The structures. Onion goes in a ventilated kanda chawl, not cold
//     storage; grain goes in a godown. That mapping is correct.
//
// WHAT IS NOT REAL
//   Names, capacities, rates and phone numbers. There is no public
//   per-warehouse feed to sync against, and `availableTonnes` is null on every
//   record on purpose — free space changes daily and nobody publishes it.
//   Inventing a number there would be the storage equivalent of faking a live
//   agent position, which this codebase already refuses to do.
//
// TO MAKE ONE REAL: set `dataSource: 'verified'` and fill `verifiedNote` with
// who checked it and when. Nothing else in the code needs to change.

const SEED = [
  // ── Nashik: the onion belt ────────────────────────────────────────────
  {
    name: 'Lasalgaon Kanda Chawl (illustrative)',
    operator: 'cooperative', type: 'ventilated_chawl',
    district: 'Nashik', taluka: 'Lasalgaon',
    location: { lat: 20.1417, lng: 74.2417 },
    capacityTonnes: 2500, availableTonnes: null,
    ratePerTonnePerMonth: 60,
    commodities: ['Onion'],
    pledgeLoan: { available: true, maxPctOfValue: 70, interestPctPerYear: 7 },
    contact: { note: 'Ask at the APMC office for chawl space and pledge terms.' },
  },
  {
    name: 'Niphad Godown (illustrative)',
    operator: 'mswc', type: 'godown',
    district: 'Nashik', taluka: 'Niphad',
    location: { lat: 20.0800, lng: 74.1100 },
    capacityTonnes: 5000, availableTonnes: null,
    ratePerTonnePerMonth: 85,
    commodities: [],
    pledgeLoan: { available: true, maxPctOfValue: 75, interestPctPerYear: 7 },
    contact: { note: 'MSWC issues a warehouse receipt a bank will lend against.' },
  },
  {
    name: 'Nashik Cold Storage (illustrative)',
    operator: 'private', type: 'cold_storage',
    district: 'Nashik', taluka: 'Nashik',
    location: { lat: 19.9975, lng: 73.7898 },
    capacityTonnes: 1200, availableTonnes: null,
    ratePerTonnePerMonth: 420,
    commodities: ['Grapes', 'Pomegranate (Dalimb)', 'Potato'],
    pledgeLoan: { available: false },
    contact: { note: 'Not suitable for onion — see the warning on the lot.' },
  },

  // ── Solapur: Barshi, where the ₹2.49 sale happened ────────────────────
  {
    name: 'Barshi APMC Godown (illustrative)',
    operator: 'apmc', type: 'godown',
    district: 'Solapur', taluka: 'Barshi',
    location: { lat: 18.2333, lng: 75.6900 },
    capacityTonnes: 1800, availableTonnes: null,
    ratePerTonnePerMonth: 70,
    commodities: [],
    pledgeLoan: { available: true, maxPctOfValue: 60, interestPctPerYear: 6 },
    contact: { note: 'MSAMB pledge loan scheme runs through selected APMCs.' },
  },
  {
    name: 'Pandharpur Kanda Chawl (illustrative)',
    operator: 'fpo', type: 'ventilated_chawl',
    district: 'Solapur', taluka: 'Pandharpur',
    location: { lat: 17.6790, lng: 75.3300 },
    capacityTonnes: 900, availableTonnes: null,
    ratePerTonnePerMonth: 50,
    commodities: ['Onion'],
    pledgeLoan: { available: false },
    contact: { note: 'Producer-company chawl; members first.' },
  },

  // ── Pune: Junnar, the tomato case ─────────────────────────────────────
  {
    name: 'Junnar Cold Storage (illustrative)',
    operator: 'private', type: 'cold_storage',
    district: 'Pune', taluka: 'Junnar',
    location: { lat: 19.2075, lng: 73.8750 },
    capacityTonnes: 800, availableTonnes: null,
    ratePerTonnePerMonth: 450,
    commodities: ['Tomato', 'Potato', 'Grapes'],
    pledgeLoan: { available: false },
    contact: { note: 'Short holds only — perishables lose value fast even chilled.' },
  },
  {
    name: 'Baramati MSWC Godown (illustrative)',
    operator: 'mswc', type: 'godown',
    district: 'Pune', taluka: 'Baramati',
    location: { lat: 18.1514, lng: 74.5773 },
    capacityTonnes: 4000, availableTonnes: null,
    ratePerTonnePerMonth: 80,
    commodities: [],
    pledgeLoan: { available: true, maxPctOfValue: 75, interestPctPerYear: 7 },
    contact: {},
  },

  // ── Latur / Marathwada: the soybean and tur side ──────────────────────
  {
    name: 'Latur MSWC Godown (illustrative)',
    operator: 'mswc', type: 'godown',
    district: 'Latur', taluka: 'Latur',
    location: { lat: 18.4088, lng: 76.5604 },
    capacityTonnes: 6000, availableTonnes: null,
    ratePerTonnePerMonth: 75,
    commodities: [],
    pledgeLoan: { available: true, maxPctOfValue: 75, interestPctPerYear: 7 },
    contact: { note: 'Grain and pulses; receipts accepted for pledge finance.' },
  },
  {
    name: 'Udgir Cooperative Godown (illustrative)',
    operator: 'cooperative', type: 'godown',
    district: 'Latur', taluka: 'Udgir',
    location: { lat: 18.3939, lng: 77.1181 },
    capacityTonnes: 1500, availableTonnes: null,
    ratePerTonnePerMonth: 65,
    commodities: [],
    pledgeLoan: { available: true, maxPctOfValue: 50, interestPctPerYear: 8 },
    contact: {},
  },

  // ── Vidarbha: cotton and soybean ──────────────────────────────────────
  {
    name: 'Akola CWC Godown (illustrative)',
    operator: 'cwc', type: 'godown',
    district: 'Akola', taluka: 'Akola',
    location: { lat: 20.7059, lng: 77.0219 },
    capacityTonnes: 7000, availableTonnes: null,
    ratePerTonnePerMonth: 78,
    commodities: [],
    pledgeLoan: { available: true, maxPctOfValue: 75, interestPctPerYear: 7 },
    contact: {},
  },
  {
    name: 'Yavatmal APMC Godown (illustrative)',
    operator: 'apmc', type: 'godown',
    district: 'Yavatmal', taluka: 'Yavatmal',
    location: { lat: 20.3888, lng: 78.1204 },
    capacityTonnes: 2200, availableTonnes: null,
    ratePerTonnePerMonth: 68,
    commodities: [],
    pledgeLoan: { available: true, maxPctOfValue: 60, interestPctPerYear: 6.5 },
    contact: {},
  },
];

// Stamped on every seeded record so nothing can be inserted without it.
const SEED_STAMP = {
  dataSource: 'seed_illustrative',
  active: true,
};

module.exports = { SEED, SEED_STAMP };

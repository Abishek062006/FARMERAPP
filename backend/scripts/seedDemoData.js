// Give the nine demo accounts a history, so the app does not open empty.
//
//   node scripts/seedDemoData.js          seed
//   node scripts/seedDemoData.js --purge  remove everything it made
//
// ⚠️ IT CANNOT CREATE THE LOGINS. Authentication is Firebase email/password and
// this backend has no firebase-admin credential — middleware/auth.js verifies
// tokens against Google's public JWKS, which is enough to CHECK a token and not
// enough to MINT an account. So the nine accounts in ACCOUNTS below must be
// registered through the app's own Register screen first. This script then
// finds each one by email and fills it with a past.
//
// It skips, loudly, any account that has not been registered yet — a silent
// skip would leave a demo half-populated and nobody would notice until the
// panel was watching.
//
// PURGE IS BY OWNER, NOT BY A TAG. Everything here belongs to one of the nine
// demo uids, so --purge deletes what those uids own. That keeps the seeded data
// looking real (no PH#TEST_ prefixes on screen) while still being removable.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

const User = require('../models/User');
const Land = require('../models/Land');
const Crop = require('../models/Crop');
const CropListing = require('../models/CropListing');
const Order = require('../models/Order');
const Offer = require('../models/Offer');
const MandiSale = require('../models/MandiSale');
const Requirement = require('../models/Requirement');
const { buyerKeyFor, netOf } = require('../services/mandiSaleService');

// ── the nine accounts to register in the app first ──────────────────────
// Password can be anything you like; only the email is matched here.
const ACCOUNTS = [
  // farmers
  { email: 'rajendra@demo.in',  role: 'farmer', name: 'Rajendra Chavan',  district: 'Solapur', city: 'Barshi',     lat: 18.2333, lng: 75.6900 },
  { email: 'nivrutti@demo.in',  role: 'farmer', name: 'Nivrutti Nyaharkar', district: 'Nashik', city: 'Lasalgaon', lat: 20.1417, lng: 74.2417 },
  { email: 'ishwar@demo.in',    role: 'farmer', name: 'Ishwar Gaykar',    district: 'Pune',    city: 'Junnar',     lat: 19.2075, lng: 73.8750 },
  // buyers (stored role stays 'vendor' — see i18n/strings.js role labels)
  { email: 'balaji@demo.in',    role: 'vendor', name: 'Balaji Traders',   district: 'Nashik',  city: 'Nashik',     lat: 19.9975, lng: 73.7898, company: 'Shri Balaji Traders' },
  { email: 'sahyadri@demo.in',  role: 'vendor', name: 'Sahyadri Foods',   district: 'Pune',    city: 'Pune',       lat: 18.5204, lng: 73.8567, company: 'Sahyadri Foods Pvt Ltd' },
  { email: 'mumbaimandi@demo.in', role: 'vendor', name: 'Vashi Wholesale', district: 'Thane',  city: 'Navi Mumbai', lat: 19.0760, lng: 73.0169, company: 'Vashi Wholesale Co', gstin: '27AAECS1234F1ZO' },
  // captains (stored role stays 'agent')
  { email: 'sunil@demo.in',     role: 'agent',  name: 'Sunil Pawar',      district: 'Nashik',  city: 'Nashik',     lat: 19.9975, lng: 73.7898, vehicle: 'tempo' },
  { email: 'ganesh@demo.in',    role: 'agent',  name: 'Ganesh More',      district: 'Solapur', city: 'Solapur',    lat: 17.6599, lng: 75.9064, vehicle: 'auto' },
  { email: 'ramesh@demo.in',    role: 'agent',  name: 'Ramesh Jadhav',    district: 'Pune',    city: 'Pune',       lat: 18.5204, lng: 73.8567, vehicle: 'truck' },
];

const day = (n) => new Date(Date.now() - n * 86400000);
const R = (a, b) => Math.round(a + Math.random() * (b - a));

async function purge(uids) {
  const byOwner = { firebaseUid: { $in: uids } };
  const counts = {};
  counts.lands       = (await Land.deleteMany(byOwner)).deletedCount;
  counts.crops       = (await Crop.deleteMany(byOwner)).deletedCount;
  counts.listings    = (await CropListing.deleteMany({ farmerUid: { $in: uids } })).deletedCount;
  counts.orders      = (await Order.deleteMany({ $or: [{ farmerUid: { $in: uids } }, { vendorUid: { $in: uids } }] })).deletedCount;
  counts.offers      = (await Offer.deleteMany({ $or: [{ farmerUid: { $in: uids } }, { vendorUid: { $in: uids } }] })).deletedCount;
  counts.mandiSales  = (await MandiSale.deleteMany({ farmerUid: { $in: uids } })).deletedCount;
  counts.requirements= (await Requirement.deleteMany({ vendorUid: { $in: uids } })).deletedCount;
  return counts;
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const purgeOnly = process.argv.includes('--purge');

  // ── resolve the registered accounts ───────────────────────────────
  const users = {};
  const missing = [];
  for (const a of ACCOUNTS) {
    const u = await User.findOne({ email: a.email }).lean();
    if (u) users[a.email] = { ...a, uid: u.firebaseUid, _id: u._id };
    else missing.push(a);
  }

  if (missing.length) {
    console.log(`\n⚠️  ${missing.length} of ${ACCOUNTS.length} accounts are not registered yet.`);
    console.log('    Register these in the app (Register screen), then re-run:\n');
    for (const m of missing) {
      console.log(`      ${m.email.padEnd(24)} role: ${m.role.padEnd(7)} name: ${m.name}`);
    }
    if (!Object.keys(users).length) { await mongoose.disconnect(); process.exit(1); }
    console.log('    Continuing with the ones that DO exist.\n');
  }

  const uids = Object.values(users).map((u) => u.uid);

  // Always purge first: re-running must not double the history.
  const removed = await purge(uids);
  if (purgeOnly) {
    console.log('🧹 purged:', JSON.stringify(removed));
    await mongoose.disconnect();
    return;
  }

  const farmers = Object.values(users).filter((u) => u.role === 'farmer');
  const buyers  = Object.values(users).filter((u) => u.role === 'vendor');
  const agents  = Object.values(users).filter((u) => u.role === 'agent');

  // ── profiles: district, vehicle, GSTIN ────────────────────────────
  for (const u of Object.values(users)) {
    const set = {
      'location.city': u.city, 'location.district': u.district,
      'location.state': 'Maharashtra',
      'location.coordinates.lat': u.lat, 'location.coordinates.lng': u.lng,
    };
    if (u.vehicle) set.vehicle = u.vehicle;
    if (u.vehicle) set.isOnline = true;
    if (u.company) set['business.tradeName'] = u.company;
    if (u.gstin) {
      // ⚠️ NOT the GSTIN used in scripts/testOffers.js. Uniqueness is enforced
      // in routes/users.js (409 GSTIN_TAKEN), not by an index, so seeded demo
      // data that claims a test's GSTIN makes that test fail with no obvious
      // connection to the seed. Demo values must never collide with fixtures.
      //
      // THE GSTIN GOES TO THE SLOWEST PAYER, deliberately.
      // Vashi Wholesale has a valid GSTIN and takes ~25 days to settle; Balaji
      // has no GSTIN and pays next day. If the badge and the payment record
      // agreed, the demo would quietly teach that a check digit predicts
      // reliability — which is exactly the belief this feature exists to break,
      // and exactly how Nashik grape exporters defaulted on farmers while being
      // perfectly registered businesses. A passing check digit proves a number
      // was ISSUED. Nothing more.
      set['business.gstin'] = u.gstin;
      set['business.gstinState'] = 'Maharashtra';
      set['verification.status'] = 'documents_submitted';
    }

    // Re-running after a config change must UNSET what is no longer configured.
    // Without this the script only ever adds: moving the GSTIN from one buyer
    // to another left it on both, and the demo silently lost the contrast it
    // was rebuilt to create. $set alone is not idempotent for profile fields —
    // only for the documents the purge step removes.
    const unset = {};
    if (!u.gstin) {
      unset['business.gstin'] = '';
      unset['business.gstinState'] = '';
      unset['verification.status'] = '';
    }
    if (!u.vehicle) unset.vehicle = '';

    await User.updateOne(
      { firebaseUid: u.uid },
      Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set }
    );
  }

  const made = { lands: 0, crops: 0, listings: 0, orders: 0, offers: 0, mandiSales: 0, requirements: 0 };

  // ── farmers: land, a crop, a live listing ─────────────────────────
  const CROPS = {
    'rajendra@demo.in': { name: 'Onion',    localName: 'कांदा',   price: 14, qty: 4000 },
    'nivrutti@demo.in': { name: 'Onion',    localName: 'कांदा',   price: 15, qty: 9000 },
    'ishwar@demo.in':   { name: 'Tomato',   localName: 'टोमॅटो', price: 22, qty: 3000 },
  };

  const listingsByFarmer = {};
  for (const f of farmers) {
    const spec = CROPS[f.email];
    const land = await Land.create({
      firebaseUid: f.uid, landName: `${f.city} field`,
      location: { coordinates: { lat: f.lat, lng: f.lng }, city: f.city, district: f.district, state: 'Maharashtra' },
      size: { value: R(2, 6), unit: 'acres' },
      waterSource: 'borewell', soilType: 'black',
    });
    made.lands++;

    const crop = await Crop.create({
      firebaseUid: f.uid, landId: land._id,
      name: spec.name, localName: spec.localName,
      plantingDate: day(120), expectedHarvestDate: day(5),
      duration: 115, quantity: spec.qty, unit: 'kg',
    });
    made.crops++;

    const listing = await CropListing.create({
      cropId: crop._id, farmerUid: f.uid, farmerName: f.name,
      // ⚠️ `cropLocalName`, NOT `localName`. The field on CropListing is
      // `cropLocalName`; `localName` is the name it has on the Crop model, and
      // writing that here made Mongoose strict mode DROP the Marathi name
      // silently on every seeded listing — no error, the write just did
      // nothing. Same failure as the nested-coordinates bug this same block
      // already warns about, three lines down.
      cropName: spec.name, cropLocalName: spec.localName,
      quantityKg: spec.qty, quantityAvailableKg: spec.qty, minOrderKg: 100,
      pricePerKg: spec.price,
      // FLAT lat/lng — CropListing.location does NOT nest them under
      // `coordinates`. Mongoose strict mode drops unknown paths silently, so
      // the nested shape produced a listing with a city and no pickup point,
      // and every "Book transport" ended in "This listing has no pickup
      // location". The schema comment on that model warns about exactly this.
      location: { city: f.city, district: f.district, state: 'Maharashtra',
        lat: f.lat, lng: f.lng },
      status: 'available',
    });
    made.listings++;
    listingsByFarmer[f.email] = { listing, crop, spec, farmer: f };
  }

  // ── the ₹2.49 sale, and enough history for a trust score ──────────
  // A buyer needs MIN_TRADES_TO_SCORE (3) recorded sales before the ledger
  // will band them, so each demo trader gets at least that many — otherwise
  // the trust card renders "too few to say" and the point is lost.
  const mandi = [];
  const R_uid = users['rajendra@demo.in'] && users['rajendra@demo.in'].uid;
  const N_uid = users['nivrutti@demo.in'] && users['nivrutti@demo.in'].uid;

  const addSale = (uid, name, o) => uid && mandi.push({
    farmerUid: uid, farmerName: name,
    commodity: o.crop, quantityKg: o.kg, grade: o.grade || null,
    buyer: { name: o.buyer, phone: o.phone || '', channel: o.channel || 'apmc',
             key: buyerKeyFor(o.buyer, o.market) },
    market: { name: o.market, district: o.district },
    pricePerKg: o.rate,
    grossAmount: Math.round(o.kg * o.rate * 100) / 100,
    deductions: o.deductions || [],
    netAmount: netOf(Math.round(o.kg * o.rate * 100) / 100, o.deductions || []),
    saleDate: day(o.ago),
    payment: { terms: 'immediate', dueDate: null,
               receivedOn: o.paidAfter == null ? null : day(o.ago - o.paidAfter),
               amountReceived: null },
    advice: { shown: o.advice || null, followed: o.followed ?? null },
    notes: o.notes || '',
  });

  // THE case. Real figures, February 2023 — dated inside the 2-year window the
  // route accepts, because the point is the arithmetic, not the date.
  addSale(R_uid, 'Rajendra Chavan', {
    crop: 'Onion', kg: 512, rate: 1, grade: 'B', ago: 40, paidAfter: 2,
    buyer: 'Shri Balaji Traders', market: 'Solapur APMC', district: 'Solapur',
    deductions: [
      { label: 'Labour (hamali)', amount: 210 },
      { label: 'Weighing', amount: 99.51 },
      { label: 'Transport', amount: 200 },
    ],
    notes: 'Travelled 70 km. Sold at ₹20/kg last year.',
  });
  addSale(R_uid, 'Rajendra Chavan', {
    crop: 'Onion', kg: 2200, rate: 11, ago: 95, paidAfter: 3,
    buyer: 'Shri Balaji Traders', market: 'Solapur APMC', district: 'Solapur',
    deductions: [{ label: 'Commission', amount: 968 }, { label: 'Labour (hamali)', amount: 440 }],
  });
  addSale(R_uid, 'Rajendra Chavan', {
    crop: 'Onion', kg: 1800, rate: 13, ago: 150, paidAfter: 2,
    buyer: 'Shri Balaji Traders', market: 'Solapur APMC', district: 'Solapur',
    deductions: [{ label: 'Commission', amount: 702 }],
  });

  // A trader who does NOT pay — the case the ledger exists to surface.
  addSale(N_uid, 'Nivrutti Nyaharkar', {
    crop: 'Grapes', kg: 3000, rate: 52, ago: 70, paidAfter: null, channel: 'export',
    buyer: 'Konkan Exports', market: 'Nashik', district: 'Nashik',
    notes: 'Promised payment in 15 days.',
  });
  addSale(N_uid, 'Nivrutti Nyaharkar', {
    crop: 'Grapes', kg: 2400, rate: 55, ago: 110, paidAfter: 48, channel: 'export',
    buyer: 'Konkan Exports', market: 'Nashik', district: 'Nashik',
  });
  addSale(N_uid, 'Nivrutti Nyaharkar', {
    crop: 'Grapes', kg: 2000, rate: 50, ago: 160, paidAfter: 41, channel: 'export',
    buyer: 'Konkan Exports', market: 'Nashik', district: 'Nashik',
  });
  // And one who pays fast, so the demo has a contrast rather than one villain.
  for (const ago of [25, 60, 100]) {
    addSale(N_uid, 'Nivrutti Nyaharkar', {
      crop: 'Onion', kg: 5000, rate: 15, ago, paidAfter: 1,
      buyer: 'Lasalgaon Agro', market: 'Lasalgaon APMC', district: 'Nashik',
      deductions: [{ label: 'Commission', amount: 1500 }],
    });
  }

  if (mandi.length) { await MandiSale.insertMany(mandi); made.mandiSales = mandi.length; }

  // ── in-app history: delivered + settled orders, so buyer trust scores ──
  const captain = agents[0];
  for (const b of buyers) {
    // 3 settled orders each, at different speeds, so /users/trust/:uid bands
    // them differently and the offer cards do not all look alike.
    const speed = b.email === 'balaji@demo.in' ? 1 : b.email === 'sahyadri@demo.in' ? 9 : 25;
    for (let i = 0; i < 3; i++) {
      const src = listingsByFarmer[farmers[i % farmers.length].email];
      if (!src) continue;
      const qty = R(200, 800);
      const cropTotal = qty * src.spec.price;
      const fare = R(900, 2200);
      const placed = 30 + i * 25;
      await Order.create({
        listingId: src.listing._id, cropName: src.spec.name,
        quantityKg: qty, pricePerKg: src.spec.price, cropTotal,
        farmerUid: src.farmer.uid, farmerName: src.farmer.name,
        vendorUid: b.uid, vendorName: b.name, vendorCompany: b.company || '',
        pickup: { lat: src.farmer.lat, lng: src.farmer.lng, city: src.farmer.city, district: src.farmer.district },
        dropoff: { lat: b.lat, lng: b.lng, city: b.city, district: b.district },
        vehicleType: 'tempo', distanceKm: R(30, 160), durationMin: R(45, 220),
        fare: { base: 300, perKm: 28, distanceCharge: fare - 300, total: fare, agentPayout: fare },
        grandTotal: cropTotal + fare, farmerPayout: cropTotal,
        status: 'delivered',
        // ⚠️ TWO THINGS WERE WRONG HERE AND BOTH WERE SILENT.
        //   1. The field is `agentUid`, not `agentId` — strict mode dropped it.
        //   2. It wrote `captain._id`, the MONGO ObjectId, where `agentUid`
        //      stores the FIREBASE uid string. So even the rename alone would
        //      have stored an id nothing else in this app can look up.
        // The result was 9 delivered orders carrying a captain's NAME with no
        // captain behind it — a claim about who drove, that no query could
        // resolve and no captain's own trip history would ever show.
        agentUid: captain ? captain.firebaseUid : undefined,
        agentName: captain ? captain.name : undefined,
        agentPhone: captain ? captain.phone : undefined,
        acceptedAt: day(placed), pickedUpAt: day(placed), deliveredAt: day(placed - 1),
        settlement: { farmerPaid: true, paidAt: day(placed - 1 - speed), method: 'upi' },
      });
      made.orders++;
    }
  }

  // ── a live offer and a live requirement, so the demo has something to act on ──
  const nivrutti = listingsByFarmer['nivrutti@demo.in'];
  if (nivrutti && buyers[0]) {
    await Offer.create({
      listingId: nivrutti.listing._id, farmerUid: nivrutti.farmer.uid,
      vendorUid: buyers[0].uid, vendorName: buyers[0].name,
      vendorCompany: buyers[0].company || '', vendorPhone: '9876500001',
      vendorVerification: 'documents_submitted',
      cropName: nivrutti.spec.name, askingPricePerKg: nivrutti.spec.price,
      offerPricePerKg: nivrutti.spec.price - 1, quantityKg: 2000,
      status: 'pending',
      // 48h window, matching OFFER_WINDOW_MS in routes/offers.js. Offers lapse
      // on read, so a seeded offer with a past expiry would be swept to
      // 'expired' the first time the farmer opened the tab.
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
    });
    made.offers++;
  }
  if (buyers[1]) {
    await Requirement.create({
      vendorUid: buyers[1].uid, vendorName: buyers[1].name,
      vendorCompany: buyers[1].company || '', vendorPhone: '9876500002',
      vendorVerification: 'unverified',
      commodity: 'Onion', quantityKg: 5000, minGrade: 'B',
      priceMin: 13, priceMax: 16,
      deliveryPoint: { lat: buyers[1].lat, lng: buyers[1].lng, label: buyers[1].city, district: buyers[1].district },
      radiusKm: 120, status: 'open',
      expiresAt: new Date(Date.now() + 14 * 86400000),
    });
    made.requirements++;
  }

  // ── verify what was actually STORED, not what we sent ──────────────
  // Mongoose silently drops paths a schema does not declare, so a seed that
  // "succeeded" can still leave the app unusable. Check the fields the app
  // actually depends on.
  const { toLatLng } = require('../services/geoService');
  const problems = [];
  for (const l of await CropListing.find({ farmerUid: { $in: uids } }).lean()) {
    if (!toLatLng(l.location)) problems.push(`listing ${l.cropName} (${l.farmerUid.slice(0, 6)}…) has no usable pickup point`);
  }
  for (const o of await Order.find({ vendorUid: { $in: uids } }).lean()) {
    if (!o.deliveredAt || !o.settlement || !o.settlement.paidAt)
      problems.push(`order ${o._id} is missing the dates the trust ledger reads`);
  }
  if (problems.length) {
    console.log('\n❌ seeded, but the data is not usable:');
    problems.forEach((p) => console.log('   ' + p));
  }

  console.log('\n✅ seeded:', JSON.stringify(made, null, 0));
  console.log(`   accounts populated: ${uids.length}/${ACCOUNTS.length}`);
  console.log('\n   Demo checkpoints:');
  console.log('     · Rajendra → "Sales outside the app" shows the ₹2.49 sale');
  console.log('     · Nivrutti → "My buyers" shows Konkan Exports with money outstanding');
  console.log('     · Balaji vs Vashi → different payment bands on their offers');
  await mongoose.disconnect();
})();

// 30 BUYERS + 30 CAPTAINS, WITH A REAL PAST AND A LIVE PRESENT.
//
//   node scripts/seedTradeDemo.js                 # dry run — creates nothing
//   node scripts/seedTradeDemo.js --confirm       # accounts + data + CSV
//   node scripts/seedTradeDemo.js --purge         # remove everything it made
//
// ═══ WHAT THIS BUILDS AND WHY ═════════════════════════════════════════════
//
// The app already had 85 real FPO logins (bulkCreateFpoDemoAccounts.js) and 79
// harvest listings, but only 8 buyers, 4 captains and 13 orders — so every
// screen ON THE DEMAND SIDE was empty. A demo that opens a buyer's order list
// to nothing does not show how the app works.
//
// This gives the trade side a past and a present:
//   • 30 buyers with a settlement HISTORY deliberately spread across every
//     trust band the app can report, INCLUDING the refusal (see below)
//   • 30 captains with delivered trips, fares collected, and a live job
//   • purchases from FPO LOTS (N orders + 1 consignment) and from INDIVIDUAL
//     farmers (single orders), because those are two different flows
//   • live tracking positions on the in-flight ones
//
// ═══ ⚠️ EVERY RECORD IS LABELLED `demo_illustrative` ══════════════════════
//
// These are SYNTHETIC people trading REAL, SFAC-registered companies' produce.
// The label is what stops a screen presenting it as a company's actual trading
// history, and `--purge` is keyed on it. Never remove it.
//
// ⚠️ THE HISTORY IS SHAPED TO BE HONEST, NOT FLATTERING. Roughly a quarter of
// the buyers are given too few completed trades to band, because
// trustService.forVendor() REFUSES to band below MIN_TRADES_TO_SCORE and
// returns counts instead — that refusal is one of the app's better features and
// a demo where every buyer has a tidy green badge would hide it. Others are
// given genuinely late and genuinely unpaid settlements.
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const CropListing = require('../models/CropListing');
const Order = require('../models/Order');
const Consignment = require('../models/Consignment');
const Fpo = require('../models/Fpo');
const { checkDigit } = require('../services/gstinService');
const { MH_DISTRICT_CENTROIDS } = require('../data/districtCentroids');

const TAG = 'demo_illustrative';
// A marker only this script writes, so --purge can find its rows without
// touching the FPO listings seeded elsewhere (which share the dataSource).
const MARK = 'TRADEDEMO';
const PASSWORD = 'FarmerApp2026!';
const DRY = !process.argv.includes('--confirm') && !process.argv.includes('--purge');
const PURGE = process.argv.includes('--purge');
const RATE_MS = 1200;

const API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY
  || (fs.existsSync(path.join(__dirname, '../../frontend/.env'))
    && fs.readFileSync(path.join(__dirname, '../../frontend/.env'), 'utf8').split('\n')
      .find((l) => l.startsWith('EXPO_PUBLIC_FIREBASE_API_KEY='))?.split('=')[1]?.trim());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IT = (op) => `https://identitytoolkit.googleapis.com/v1/accounts:${op}?key=${API_KEY}`;

async function identity(op, payload) {
  const res = await fetch(IT(op), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const raw = await res.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`non-JSON HTTP ${res.status}: ${raw.slice(0, 200)}`); }
  return { ok: res.ok, body };
}

/** Sign up, or sign in if the email already exists. Either way, return the uid. */
async function getOrCreateUid(email) {
  const up = await identity('signUp', { email, password: PASSWORD, returnSecureToken: true });
  if (up.ok) return { uid: up.body.localId, isNew: true };
  const code = up.body?.error?.message || 'UNKNOWN';
  if (code !== 'EMAIL_EXISTS') throw new Error(`signUp ${email}: ${code}`);
  const inn = await identity('signInWithPassword', { email, password: PASSWORD, returnSecureToken: true });
  if (!inn.ok) throw new Error(`${email} exists but sign-in failed: ${inn.body?.error?.message}`);
  return { uid: inn.body.localId, isNew: false };
}

// ── A VALID GSTIN, BUILT NOT INVENTED ───────────────────────────────────────
// Real format: 2-digit state code + 10-char PAN + entity digit + 'Z' + check
// digit, and the check digit is COMPUTED by the app's own checkDigit() — so
// these pass the same validation a real one does. That matters: a demo buyer
// whose GSTIN fails the app's own check would show an error badge on every
// offer, which is not what the badge is for.
//
// ⚠️ It still proves nothing about who owns the number, and the app says so —
// self-service tops out at 'documents_submitted'. See routes/users.js.
function makeGstin(stateCode, seq) {
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const pan = `A${L[seq % 26]}${L[(seq * 3) % 26]}PS${String(1000 + seq).slice(0, 4)}${L[(seq * 7) % 26]}`;
  const head = `${stateCode}${pan}1Z`;
  return head + checkDigit(head);
}

const centroid = (d) => MH_DISTRICT_CENTROIDS.find((x) => x.district === d) || { lat: 19.75, lng: 75.71 };
const jitter = (v, km = 6) => v + (Math.random() - 0.5) * (km / 111);
const pick = (a, i) => a[i % a.length];
const rnd = (a, b) => Math.round(a + Math.random() * (b - a));
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const otp = () => String(Math.floor(1000 + Math.random() * 9000));

// ── THE MARKET HUBS BUYERS ACTUALLY SIT IN ──────────────────────────────────
const HUBS = [
  { city: 'Lasalgaon', district: 'Nashik', code: '27' },
  { city: 'Vashi (Navi Mumbai APMC)', district: 'Thane', code: '27' },
  { city: 'Pune Market Yard', district: 'Pune', code: '27' },
  { city: 'Kalamna (Nagpur)', district: 'Nagpur', code: '27' },
  { city: 'Solapur Market Yard', district: 'Solapur', code: '27' },
  { city: 'Kolhapur Shahu Market', district: 'Kolhapur', code: '27' },
  { city: 'Sangli Market Yard', district: 'Sangli', code: '27' },
  { city: 'Chhatrapati Sambhajinagar APMC', district: 'Chhatrapati Sambhajinagar', code: '27' },
  { city: 'Latur Market Yard', district: 'Latur', code: '27' },
  { city: 'Amravati APMC', district: 'Amravati', code: '27' },
];

const FIRMS = [
  'Balaji Traders', 'Shree Ganesh Agro', 'Jai Malhar Trading', 'Sai Krupa Exports',
  'Venkatesh Commodities', 'Mauli Agri Mart', 'Ekvira Fresh', 'Siddhivinayak Agro',
  'Om Sai Vegetables', 'Kisan Connect Foods', 'Sahyadri Produce', 'Godavari Agro Links',
  'Panchganga Traders', 'Vitthal Rukmini Agro', 'Nath Fresh Farms', 'Deccan Harvest',
  'Krishna Valley Foods', 'Ajinkya Agro Exports', 'Samarth Commodities', 'Tulja Bhavani Traders',
  'Renuka Fresh', 'Shivneri Agro', 'Bhairavnath Trading', 'Anandi Agro Foods',
  'Yashwant Produce', 'Manjara Agri', 'Purna Fresh Mart', 'Satpuda Commodities',
  'Konkan Fresh Links', 'Vidarbha Agro House',
];
const BUYER_NAMES = [
  'Rajesh Shinde', 'Sunil Pawar', 'Amit Deshpande', 'Nilesh Jadhav', 'Prakash Kulkarni',
  'Mahesh Patil', 'Sachin More', 'Vikas Bhosale', 'Ganesh Kale', 'Anil Sonawane',
  'Dilip Wagh', 'Ravi Chavan', 'Santosh Gaikwad', 'Umesh Thorat', 'Kiran Salunkhe',
  'Nitin Mane', 'Pravin Nikam', 'Ashok Rane', 'Vijay Bhagat', 'Sandeep Kadam',
  'Yogesh Jagtap', 'Hemant Shelar', 'Rahul Borse', 'Datta Khedkar', 'Sameer Ingle',
  'Manoj Deshmukh', 'Tushar Pandit', 'Girish Havaldar', 'Vinod Zambre', 'Suhas Lokhande',
];
const CAPTAIN_NAMES = [
  'Sopan Jadhav', 'Bhausaheb More', 'Ramdas Kale', 'Sagar Pawar', 'Ankush Shinde',
  'Kailas Wagh', 'Popat Chavan', 'Nana Bhosale', 'Rohit Kadam', 'Vishal Salunkhe',
  'Dnyanoba Mane', 'Ajit Nikam', 'Bapu Gaikwad', 'Sharad Thorat', 'Mangesh Rane',
  'Tanaji Sonawane', 'Arjun Bhagat', 'Kishor Jagtap', 'Pandurang Shelar', 'Nilesh Borse',
  'Bharat Khedkar', 'Suresh Ingle', 'Machindra Pandit', 'Anna Zambre', 'Vitthal Lokhande',
  'Baban Deshmukh', 'Shankar Havaldar', 'Gorakh Patil', 'Eknath Jadhav', 'Dattu Kale',
];
const VEHICLES = ['tempo', 'truck', 'auto'];

/**
 * THE TRUST PROFILE EACH BUYER IS GIVEN.
 *
 * ⚠️ Spread on purpose across every answer trustService can give, INCLUDING
 * `thin` — below MIN_TRADES_TO_SCORE (3) it refuses to band and returns counts.
 * A demo where all thirty buyers show a tidy green badge would hide the single
 * most defensible thing about the trust feature.
 */
const PROFILES = [
  ...Array(9).fill({ kind: 'prompt', deliveries: [5, 8], payDays: [0, 3] }),
  ...Array(7).fill({ kind: 'average', deliveries: [4, 7], payDays: [5, 13] }),
  ...Array(6).fill({ kind: 'slow', deliveries: [4, 6], payDays: [16, 28] }),
  ...Array(4).fill({ kind: 'overdue', deliveries: [3, 5], payDays: null }),
  ...Array(4).fill({ kind: 'thin', deliveries: [1, 2], payDays: [1, 4] }),
];

module.exports = { TAG, MARK };

// ═══════════════════════════════════════════════════════════════════════════
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  if (PURGE) {
    // ⚠️ KEYED ON THE DEMO BUYERS' OWN UIDS, not on `dataSource` alone.
    // `demo_illustrative` is shared with seedFpoListings and the warehouse
    // seed, so deleting on it would take other scripts' data with it. Resolving
    // the uids from the demo email domain first makes this exact: it can only
    // ever remove trades whose BUYER is one of the thirty accounts below.
    const demoUsers = await User.find({ email: /@tradedemo\.example\.com$/ })
      .select('firebaseUid').lean();
    const uids = demoUsers.map((u) => u.firebaseUid);
    const [o, c] = await Promise.all([
      Order.deleteMany({ vendorUid: { $in: uids } }),
      Consignment.deleteMany({ vendorUid: { $in: uids } }),
    ]);
    const u = await User.deleteMany({ email: /@tradedemo\.example\.com$/ });
    console.log(`🧹 purged ${o.deletedCount} order(s), ${c.deletedCount} run(s), ${u.deletedCount} profile(s).`);
    console.log('   Firebase logins are NOT deleted — that needs the console or the admin SDK.');
    await mongoose.disconnect();
    return;
  }

  if (!API_KEY) { console.error('❌ EXPO_PUBLIC_FIREBASE_API_KEY not found.'); process.exit(1); }

  // ── The supply side we will trade against ────────────────────────────────
  const listings = await CropListing.find({ status: 'available', quantityAvailableKg: { $gt: 60 } })
    .select('_id cropId cropName farmerUid farmerName farmerPhone pricePerKg quantityAvailableKg location grade')
    .lean();
  const fpos = await Fpo.find({ status: 'active' }).select('_id name district members').lean();
  const memberOf = new Map();
  for (const f of fpos) for (const m of f.members || []) if ((m.status || 'active') === 'active') memberOf.set(m.farmerUid, f);

  console.log(`\n🌾 supply: ${listings.length} listings, ${fpos.length} FPOs`);
  const usable = listings.filter((l) => l.location?.lat && l.location?.lng);
  console.log(`   with coordinates (usable): ${usable.length}`);
  if (usable.length < 20) { console.error('❌ too few usable listings to build a demo.'); process.exit(1); }

  const buyers = BUYER_NAMES.map((name, i) => {
    const hub = pick(HUBS, i);
    return {
      i, name, email: `buyer${String(i + 1).padStart(2, '0')}@tradedemo.example.com`,
      phone: `9820${String(100000 + i).slice(-6)}`, firm: FIRMS[i], hub,
      gstin: makeGstin(hub.code, i + 3), profile: PROFILES[i],
    };
  });
  const captains = CAPTAIN_NAMES.map((name, i) => {
    const hub = pick(HUBS, i + 3);
    return {
      i, name, email: `captain${String(i + 1).padStart(2, '0')}@tradedemo.example.com`,
      phone: `9730${String(200000 + i).slice(-6)}`, hub,
      vehicle: { type: pick(VEHICLES, i), number: `MH ${12 + (i % 30)} ${String.fromCharCode(65 + i % 26)}${String.fromCharCode(65 + (i * 3) % 26)} ${1000 + i * 7}` },
    };
  });

  if (DRY) {
    console.log(`\n(dry run) would create ${buyers.length} buyers and ${captains.length} captains,`);
    console.log('and give them delivered history, live orders, runs and tracking.');
    console.log('\nsample buyer :', buyers[0].email, '|', buyers[0].firm, '|', buyers[0].hub.city, '|', buyers[0].gstin);
    console.log('sample captain:', captains[0].email, '|', captains[0].vehicle.type, captains[0].vehicle.number);
    const counts = {};
    PROFILES.forEach((p) => { counts[p.kind] = (counts[p.kind] || 0) + 1; });
    console.log('\ntrust spread  :', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));
    console.log('\nRun again with --confirm to create them.\n');
    await mongoose.disconnect();
    return;
  }

  // ── 1. ACCOUNTS ──────────────────────────────────────────────────────────
  console.log('\n👤 creating accounts (rate-limited, ~90s)…');
  let made = 0;
  for (const b of buyers) {
    const { uid, isNew } = await getOrCreateUid(b.email);
    b.uid = uid;
    const c = centroid(b.hub.district);
    await User.updateOne({ firebaseUid: uid }, {
      $set: {
        firebaseUid: uid, name: b.name, email: b.email, phone: b.phone, role: 'vendor',
        location: { city: b.hub.city, district: b.hub.district, state: 'Maharashtra', coordinates: { lat: c.lat, lng: c.lng } },
        business: { gstin: b.gstin, gstinState: b.hub.district, tradeName: b.firm },
        // A MIX, deliberately. `verified` is granted only by a human running
        // scripts/verifyBuyer.js, so most demo buyers sit at the ceiling a
        // buyer can reach by themselves — which is the honest picture.
        verification: { status: b.i % 5 === 0 ? 'verified' : b.i % 3 === 0 ? 'unverified' : 'documents_submitted', gstinCheckedAt: new Date() },
      },
    }, { upsert: true });
    if (isNew) made++;
    await sleep(RATE_MS);
  }
  for (const cap of captains) {
    const { uid, isNew } = await getOrCreateUid(cap.email);
    cap.uid = uid;
    const c = centroid(cap.hub.district);
    await User.updateOne({ firebaseUid: uid }, {
      $set: {
        firebaseUid: uid, name: cap.name, email: cap.email, phone: cap.phone, role: 'agent',
        vehicle: cap.vehicle, isOnline: cap.i % 3 !== 2,
        location: { city: cap.hub.city, district: cap.hub.district, state: 'Maharashtra', coordinates: { lat: c.lat, lng: c.lng } },
      },
    }, { upsert: true });
    if (isNew) made++;
    await sleep(RATE_MS);
  }
  console.log(`   ${made} new Firebase login(s); ${buyers.length + captains.length} profiles in Mongo.`);

  // ── 2. HISTORY + LIVE STATE ──────────────────────────────────────────────
  const orders = [];
  const runs = [];
  let li = 0;
  const nextListing = () => usable[(li++) % usable.length];

  /** One order document, in the exact shape POST /api/orders writes. */
  const buildOrder = (buyer, listing, qty, over = {}) => {
    const drop = centroid(buyer.hub.district);
    const km = rnd(12, 90);
    const fareTotal = rnd(700, 3200);
    const cropTotal = qty * listing.pricePerKg;
    return {
      listingId: listing._id, cropId: listing.cropId, cropName: listing.cropName,
      quantityKg: qty, pricePerKg: listing.pricePerKg, cropTotal,
      farmerUid: listing.farmerUid, farmerName: listing.farmerName, farmerPhone: listing.farmerPhone || '9000000000',
      vendorUid: buyer.uid, vendorName: buyer.name, vendorPhone: buyer.phone, vendorCompany: buyer.firm,
      pickup: { lat: listing.location.lat, lng: listing.location.lng, label: listing.location.city || 'Farm', city: listing.location.city, district: listing.location.district },
      dropoff: { lat: jitter(drop.lat), lng: jitter(drop.lng), label: buyer.hub.city, city: buyer.hub.city, district: buyer.hub.district },
      vehicleType: pick(VEHICLES, qty), distanceKm: km, durationMin: km * 2,
      fare: { base: 200, perKm: 22, distanceCharge: fareTotal - 200, total: fareTotal, agentPayout: fareTotal },
      grandTotal: cropTotal + fareTotal, farmerPayout: cropTotal,
      pickupOtp: otp(), dropOtp: otp(),
      dataSource: TAG,
      ...over,
    };
  };

  console.log('📦 building history…');
  for (const b of buyers) {
    const p = b.profile;
    const n = rnd(p.deliveries[0], p.deliveries[1]);
    for (let k = 0; k < n; k++) {
      const l = nextListing();
      const qty = rnd(80, 900);
      const deliveredOn = daysAgo(rnd(8, 150));
      const paid = p.payDays !== null;
      const payDay = paid ? rnd(p.payDays[0], p.payDays[1]) : null;
      const cap = captains[(b.i * 3 + k) % captains.length];
      const advPct = k % 3 === 0 ? pick([10, 25, 30], k) : 0;
      const cropTotal = qty * l.pricePerKg;
      orders.push(buildOrder(b, l, qty, {
        status: 'delivered',
        agentUid: cap.uid, agentName: cap.name, agentPhone: cap.phone,
        acceptedAt: new Date(deliveredOn.getTime() - 3 * 3600e3),
        pickedUpAt: new Date(deliveredOn.getTime() - 2 * 3600e3),
        deliveredAt: deliveredOn,
        // The captain's fare is collected at handover — their payment history.
        payment: { mode: 'cod', status: 'collected' },
        // A real gate record on historical orders, so receipts are not blank.
        pickupOutcome: {
          outcome: 'collected_full', orderedKg: qty, collectedKg: qty,
          recordedAt: new Date(deliveredOn.getTime() - 2 * 3600e3),
          recordedBy: cap.uid, recordedByRole: 'agent',
          weight: { method: pick(['estimated', 'public_weighbridge', 'farm_scale', 'estimated'], k), ref: '' },
          condition: { checked: k % 2 === 0, flags: k % 7 === 0 ? ['wet'] : [], note: '' },
          grade: { declared: l.grade?.code || null, observed: null, discrepancy: null, farmerResponse: null },
        },
        settlement: {
          farmerPaid: paid,
          paidAt: paid ? new Date(deliveredOn.getTime() + payDay * 86400e3) : null,
          method: pick(['cash', 'upi', 'bank'], k),
          advance: advPct
            ? { agreedAmount: Math.round(cropTotal * advPct / 100), agreedPct: advPct, agreedAt: new Date(deliveredOn.getTime() - 86400e3), receivedAt: new Date(deliveredOn.getTime() - 43200e3), method: 'upi' }
            : { agreedAmount: 0, agreedPct: 0 },
        },
      }));
    }
  }
  console.log(`   ${orders.length} delivered order(s) across ${buyers.length} buyers`);

  // ── LIVE: one active job per busy captain, and never two ─────────────────
  //
  // ⚠️ `isActiveJob` has a partial unique index on Order AND on Consignment,
  // and services/agentJobService.js enforces the missing half across the two
  // collections: one driver, one vehicle, one job. Writing two would either
  // throw a duplicate key or create the exact state that rule exists to
  // prevent, so the busy captains are partitioned here and never overlap.
  const liveOrderCaps = captains.slice(0, 8);
  const liveRunCaps = captains.slice(8, 12);
  const LIVE_STATES = ['accepted', 'picked_up', 'accepted', 'picked_up'];

  liveOrderCaps.forEach((cap, k) => {
    const b = buyers[(k * 3) % buyers.length];
    const l = nextListing();
    const qty = rnd(120, 700);
    const st = pick(LIVE_STATES, k);
    const at = daysAgo(0);
    orders.push(buildOrder(b, l, qty, {
      status: st, isActiveJob: true,
      agentUid: cap.uid, agentName: cap.name, agentPhone: cap.phone,
      acceptedAt: new Date(Date.now() - 90 * 60e3),
      pickedUpAt: st === 'picked_up' ? new Date(Date.now() - 40 * 60e3) : null,
      payment: { mode: 'cod', status: 'pending' },
      // LIVE POSITION. Minutes old, so the map reads "live" rather than the
      // dimmed "last seen" state — foreground-only tracking is honest about
      // staleness and this demonstrates the healthy end of it.
      tracking: {
        lat: jitter(l.location.lat, 12), lng: jitter(l.location.lng, 12),
        heading: rnd(0, 359), seq: rnd(4, 40),
        updatedAt: new Date(Date.now() - rnd(1, 6) * 60e3),
        byUid: cap.uid, byRole: 'agent',
      },
      ...(st === 'picked_up' ? {
        pickupOutcome: {
          outcome: 'collected_full', orderedKg: qty, collectedKg: qty,
          recordedAt: new Date(Date.now() - 40 * 60e3), recordedBy: cap.uid, recordedByRole: 'agent',
          weight: { method: 'estimated', ref: '' },
          condition: { checked: true, flags: [], note: '' },
          grade: { declared: l.grade?.code || null, observed: null, discrepancy: null },
        },
      } : {}),
      settlement: { farmerPaid: false, advance: { agreedAmount: 0, agreedPct: 0 } },
    }));
  });

  // Orders waiting for a captain, so the captain feed is not empty.
  for (let k = 0; k < 6; k++) {
    const b = buyers[(k * 5 + 1) % buyers.length];
    const l = nextListing();
    orders.push(buildOrder(b, l, rnd(100, 500), {
      status: 'awaiting_agent',
      dispatchExpiresAt: new Date(Date.now() + 5 * 60e3),
      settlement: { farmerPaid: false, advance: { agreedAmount: 0, agreedPct: 0 } },
    }));
  }

  const savedOrders = await Order.insertMany(orders, { ordered: false });
  console.log(`   ${savedOrders.length} order(s) written`);

  // ── 3. FPO LOT PURCHASES: N orders + 1 consignment ───────────────────────
  //
  // A bulk purchase is per-farmer Orders plus ONE Consignment — settlement,
  // disputes and receipts all hang off the Order, which is why it is not one
  // big order. See models/Consignment.js.
  console.log('🚚 building FPO lot purchases…');
  const byFpo = new Map();
  for (const l of usable) {
    const f = memberOf.get(l.farmerUid);
    if (!f) continue;
    const key = `${f._id}::${l.cropName}`;
    if (!byFpo.has(key)) byFpo.set(key, { fpo: f, crop: l.cropName, lots: [] });
    byFpo.get(key).lots.push(l);
  }
  const groups = [...byFpo.values()].filter((g) => g.lots.length >= 2).slice(0, 10);

  let runCount = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const b = buyers[(gi * 7) % buyers.length];
    const chosen = g.lots.slice(0, Math.min(4, g.lots.length));
    const live = gi < liveRunCaps.length;
    const cap = live ? liveRunCaps[gi] : captains[(gi + 17) % captains.length];
    const drop = centroid(b.hub.district);
    const runId = new mongoose.Types.ObjectId();
    const deliveredOn = live ? null : daysAgo(rnd(10, 90));

    const kgs = chosen.map(() => rnd(150, 600));
    const totalKg = kgs.reduce((a, x) => a + x, 0);
    const fareTotal = rnd(1800, 4200);
    // BY WEIGHT, not evenly — an even split makes aggregation actively bad for
    // the smallest farmer, the person it exists to help. Drift to the largest.
    const shares = kgs.map((k) => Math.round(k / totalKg * fareTotal));
    shares[shares.indexOf(Math.max(...shares))] += fareTotal - shares.reduce((a, x) => a + x, 0);

    const stops = [];
    const lotOrders = [];
    for (let s = 0; s < chosen.length; s++) {
      const l = chosen[s];
      const qty = kgs[s];
      const oid = new mongoose.Types.ObjectId();
      const collected = live && gi % 2 === 0 && s === 0;
      lotOrders.push({
        _id: oid,
        ...buildOrder(b, l, qty, {
          consignmentId: runId,
          status: live ? (collected ? 'picked_up' : 'accepted') : 'delivered',
          agentUid: cap.uid, agentName: cap.name, agentPhone: cap.phone,
          acceptedAt: daysAgo(live ? 0 : 91),
          deliveredAt: deliveredOn,
          payment: { mode: 'cod', status: live ? 'pending' : 'collected' },
          fare: { base: 200, perKm: 22, distanceCharge: shares[s] - 200, total: shares[s], agentPayout: shares[s] },
          grandTotal: qty * l.pricePerKg + shares[s],
          settlement: {
            farmerPaid: !live && gi % 3 !== 0,
            paidAt: !live && gi % 3 !== 0 ? new Date(deliveredOn.getTime() + rnd(1, 12) * 86400e3) : null,
            method: 'bank',
            // 25% advance on the bulk buys — the flow this app added for
            // exactly this case: several farmers handing over tonnes to one
            // buyer they have never met.
            advance: { agreedAmount: Math.round(qty * l.pricePerKg * 0.25), agreedPct: 25, agreedAt: daysAgo(live ? 1 : 92), receivedAt: live ? null : daysAgo(91), method: 'bank' },
          },
          ...(!live || collected ? {
            pickupOutcome: {
              outcome: 'collected_full', orderedKg: qty, collectedKg: qty,
              recordedAt: deliveredOn || new Date(Date.now() - 50 * 60e3),
              recordedBy: cap.uid, recordedByRole: 'agent',
              weight: { method: pick(['estimated', 'public_weighbridge'], s), ref: s % 2 ? 'WB/2026/' + rnd(1000, 9999) : '' },
              condition: { checked: true, flags: [], note: '' },
              grade: { declared: l.grade?.code || null, observed: null, discrepancy: null },
            },
          } : {}),
        }),
      });
      stops.push({
        orderId: oid, farmerUid: l.farmerUid, farmerName: l.farmerName, farmerPhone: l.farmerPhone || '9000000000',
        quantityKg: qty, lat: l.location.lat, lng: l.location.lng, sequence: s,
        pickupOtp: otp(), collected: !live || collected,
        outcome: (!live || collected) ? 'collected_full' : 'pending',
        collectedKg: (!live || collected) ? qty : null,
        fareShare: shares[s], fareShareBasisKg: qty,
        weight: { method: 'estimated', ref: '' },
        condition: { checked: !live || collected, flags: [], note: '' },
        grade: { declared: l.grade?.code || null, observed: null, discrepancy: null },
      });
    }

    runs.push({
      _id: runId, vendorUid: b.uid, vendorName: b.name, vendorPhone: b.phone,
      orderIds: lotOrders.map((o) => o._id), stops,
      dropoff: { lat: jitter(drop.lat), lng: jitter(drop.lng), label: b.hub.city },
      vehicleType: 'truck', totalQuantityKg: totalKg, collectedQuantityKg: (!live) ? totalKg : (gi % 2 === 0 ? kgs[0] : 0),
      distanceKm: rnd(40, 130), durationMin: rnd(90, 260),
      fare: { base: 300, perKm: 26, distanceCharge: fareTotal - 300, total: fareTotal, agentPayout: fareTotal },
      agentUid: cap.uid, agentName: cap.name, agentPhone: cap.phone,
      ...(live ? { isActiveJob: true } : {}),
      fpoId: g.fpo._id,
      status: live ? (gi % 2 === 0 ? 'collecting' : 'accepted') : 'delivered',
      acceptedAt: daysAgo(live ? 0 : 91), deliveredAt: deliveredOn,
      dropOtp: otp(), dataSource: TAG,
      ...(live ? {
        tracking: {
          lat: jitter(chosen[0].location.lat, 15), lng: jitter(chosen[0].location.lng, 15),
          heading: rnd(0, 359), seq: rnd(3, 30),
          updatedAt: new Date(Date.now() - rnd(1, 8) * 60e3), byUid: cap.uid, byRole: 'agent',
        },
      } : {}),
    });
    await Order.insertMany(lotOrders, { ordered: false });
    runCount++;
  }
  await Consignment.insertMany(runs, { ordered: false });
  console.log(`   ${runCount} FPO lot purchase(s): ${runs.reduce((a, r) => a + r.stops.length, 0)} orders + ${runCount} runs`);

  // ── 4. THE CSV ───────────────────────────────────────────────────────────
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['email', 'password', 'role', 'name', 'mobile', 'company_or_vehicle', 'market_hub', 'district', 'gstin', 'verification', 'trust_profile'].join(',')];
  for (const b of buyers) {
    rows.push([b.email, PASSWORD, 'Buyer', b.name, b.phone, b.firm, b.hub.city, b.hub.district, b.gstin,
      b.i % 5 === 0 ? 'verified' : b.i % 3 === 0 ? 'unverified' : 'documents_submitted', b.profile.kind].map(esc).join(','));
  }
  for (const c of captains) {
    rows.push([c.email, PASSWORD, 'Captain', c.name, c.phone, `${c.vehicle.type} ${c.vehicle.number}`, c.hub.city, c.hub.district, '', '',
      liveOrderCaps.includes(c) ? 'has a live pickup' : liveRunCaps.includes(c) ? 'has a live multi-farm run' : 'free'].map(esc).join(','));
  }
  const out = path.join(os.homedir(), 'Documents', 'farmerapp_trade_demo_logins.csv');
  fs.writeFileSync(out, rows.join('\n') + '\n', 'utf8');
  console.log(`\n📄 ${out}`);
  console.log(`   ${buyers.length} buyers + ${captains.length} captains\n`);

  await mongoose.disconnect();
})().catch(async (e) => { console.error('💥', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });

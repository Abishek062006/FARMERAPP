// scripts/seedStatewideHistory.js
//
//   node scripts/seedStatewideHistory.js            # dry run (default)
//   node scripts/seedStatewideHistory.js --confirm  # write it
//   node scripts/seedStatewideHistory.js --purge    # remove only what it made
//
// ═══ WHY ══════════════════════════════════════════════════════════════════
//
// `seedStatewide.js` created 2,183 accounts so that every district has captains,
// farmers and buyers within radius of each other. It created COVERAGE, not a
// past — measured against live Atlas before this script existed:
//
//     buyers    218 accounts | with ANY order:  35 (16%)
//     captains  754 accounts | with ANY order:  32  (4%)
//     farmers  1172 accounts | with ANY order:  80  (7%)
//
// So logging into a statewide account for a demo landed on an app with nothing
// in it — no orders, no trips, no payment record, no trust history.
//
// ═══ ⚠️ IT DOES NOT GIVE EVERYONE A PAST, AND THAT IS THE POINT ═══════════
//
// A demo where all 218 buyers wear a tidy green badge would hide the most
// defensible thing this app does: `trustService` REFUSES to band a record below
// MIN_TRADES_TO_SCORE, and an account with no history at all is a real, common
// state the app has to handle. `seedTradeDemo.js` already shapes its thirty
// buyers across every band including the refusal; this does the same at scale,
// and deliberately leaves a large minority with NOTHING.
//
// ═══ ⚠️ STOCK IS NOT CONSUMED — THE LISTING IS GROWN INSTEAD ══════════════
//
// A historical delivered order took kilograms off a listing. Decrementing
// `quantityAvailableKg` now would eat the market inventory that buyers browse
// (1,159 live lots), so instead each order RAISES the listing's `quantityKg`
// (the total that was harvested) and leaves `quantityAvailableKg` untouched.
// The invariant the farmer's own screen reads — sold = quantityKg −
// quantityAvailableKg — then reports the history correctly, and the market is
// unchanged. Inventing a sale AND silently deleting the stock it came from
// would have made the two screens disagree.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const CropListing = require('../models/CropListing');
const Order = require('../models/Order');
const { MH_DISTRICT_CENTROIDS } = require('../data/districtCentroids');

const DOMAIN = 'mh.farmerapp.demo';       // what seedStatewide.js used
const TAG = 'demo_illustrative';
// ⚠️ HOW --purge FINDS ITS OWN ROWS, AND WHY THERE IS NO MARKER FIELD.
//
// The first version wrote `meta: { seed: 'STATEHIST' }` on each Order. Both
// schemas were then checked and NEITHER has a `meta` path, and both run
// Mongoose strict mode — so that key would have been SILENTLY DROPPED, --purge
// would have matched nothing, and several thousand invented orders would have
// been permanently indistinguishable from real trades. That is exactly the
// failure CLAUDE.md already records for `dataSource` on Order/Consignment.
//
// So the purge keys on the BUYER instead, the same rule seedTradeDemo uses:
// every order this script writes belongs to a statewide account, and those
// accounts own no other orders (verified against live Atlas: zero). Nothing
// new has to be stored for the removal to be exact.
//
// `dataSource` alone would NOT be safe — it is shared with seedFpoListings,
// seedTradeDemo and the warehouse seed.

const DRY = !process.argv.includes('--confirm') && !process.argv.includes('--purge');
const PURGE = process.argv.includes('--purge');

const centroid = (d) => MH_DISTRICT_CENTROIDS.find((x) => x.district === d) || { lat: 19.75, lng: 75.71 };
const jitter = (v, km = 8) => v + (Math.random() - 0.5) * (km / 111);
const rnd = (a, b) => Math.round(a + Math.random() * (b - a));
const pick = (a, i) => a[Math.abs(i) % a.length];
const otp = () => String(Math.floor(1000 + Math.random() * 9000));
const VEHICLES = ['tempo', 'truck', 'auto'];

// ── HOW MANY TRADES EACH BUYER HAS, AND HOW THEY PAID ────────────────────
// Same spread as seedTradeDemo's PROFILES, plus a large `none` bucket. The
// weights are the distribution across the whole statewide buyer population.
const PROFILES = [
  ...Array(6).fill({ kind: 'prompt',  deliveries: [4, 9], payDays: [0, 3] }),
  ...Array(5).fill({ kind: 'average', deliveries: [3, 7], payDays: [5, 13] }),
  ...Array(4).fill({ kind: 'slow',    deliveries: [3, 6], payDays: [16, 28] }),
  ...Array(2).fill({ kind: 'overdue', deliveries: [2, 5], payDays: null }),
  ...Array(3).fill({ kind: 'thin',    deliveries: [1, 2], payDays: [1, 4] }),
  // ⚠️ NOT A GAP — a deliberate third of buyers with no trading record at all.
  // Removing this is how the demo starts implying every account is established.
  ...Array(10).fill({ kind: 'none',   deliveries: [0, 0], payDays: null }),
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  if (PURGE) {
    const rxp = new RegExp(`@${DOMAIN.replace(/\./g, '\\.')}$`);
    const swBuyers = await User.find({ email: rxp, role: 'vendor' }).select('firebaseUid').lean();
    const uids = swBuyers.map((u) => u.firebaseUid);
    const doomed = await Order.find({ vendorUid: { $in: uids }, dataSource: TAG })
      .select('_id listingId quantityKg').lean();

    // The listing totals are put back from the ORDERS THEMSELVES rather than
    // from a stored counter — the counter is what strict mode would have eaten.
    const back = new Map();
    for (const o of doomed) {
      if (!o.listingId) continue;
      const k = String(o.listingId);
      back.set(k, (back.get(k) || 0) + (o.quantityKg || 0));
    }
    if (back.size) {
      await CropListing.bulkWrite([...back.entries()].map(([id, kg]) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(id) },
          update: { $inc: { quantityKg: -kg } },
        },
      })), { ordered: false });
    }
    const r = await Order.deleteMany({ _id: { $in: doomed.map((o) => o._id) } });
    console.log(`🧹 purged ${r.deletedCount} order(s); shrank ${back.size} listing total(s) back.`);
    await mongoose.disconnect();
    return;
  }

  const rx = new RegExp(`@${DOMAIN.replace(/\./g, '\\.')}$`);
  const [buyers, captains] = await Promise.all([
    User.find({ email: rx, role: 'vendor' }).select('firebaseUid name phone business location').lean(),
    User.find({ email: rx, role: 'agent' }).select('firebaseUid name phone vehicle location').lean(),
  ]);
  const listings = await CropListing.find({ status: 'available', quantityAvailableKg: { $gt: 60 } })
    .select('_id cropId cropName farmerUid farmerName farmerPhone pricePerKg location grade')
    .lean();

  const usable = listings.filter((l) => l.location?.lat && l.location?.lng && l.location?.district);
  console.log(`\n👥 ${buyers.length} statewide buyers, ${captains.length} captains`);
  console.log(`🌾 ${usable.length} usable listings across ${new Set(usable.map((l) => l.location.district)).size} districts`);
  if (!buyers.length || !usable.length) { console.error('❌ nothing to work with.'); process.exit(1); }

  // ── Index supply and captains BY DISTRICT ──────────────────────────────
  // ⚠️ The whole reason seedStatewide exists is that a buyer, a farm and a
  // captain should be near each other. Pairing them at random across the state
  // would produce a 500 km "local" pickup and make the radius dispatch and the
  // nearest-first market feed look broken in exactly the demo they exist for.
  const byDistrict = new Map();
  for (const l of usable) {
    const d = l.location.district;
    if (!byDistrict.has(d)) byDistrict.set(d, []);
    byDistrict.get(d).push(l);
  }
  const capByDistrict = new Map();
  for (const c of captains) {
    const d = c.location?.district;
    if (!d) continue;
    if (!capByDistrict.has(d)) capByDistrict.set(d, []);
    capByDistrict.get(d).push(c);
  }
  const districts = [...byDistrict.keys()];

  const orders = [];
  const listingBump = new Map();          // listingId -> kg added to quantityKg
  const counts = { prompt: 0, average: 0, slow: 0, overdue: 0, thin: 0, none: 0 };

  buyers.forEach((b, bi) => {
    const p = pick(PROFILES, bi * 7 + 3);
    counts[p.kind]++;
    if (p.kind === 'none') return;

    // Trade in the buyer's OWN district where there is supply; otherwise the
    // nearest district that has any, so a coastal buyer is not silently skipped.
    const home = b.location?.district;
    const pool = byDistrict.get(home)
      || byDistrict.get(pick(districts, bi))
      || usable;
    const capPool = capByDistrict.get(home) || captains;

    const n = rnd(p.deliveries[0], p.deliveries[1]);
    for (let k = 0; k < n; k++) {
      const l = pick(pool, bi * 13 + k * 5);
      const cap = pick(capPool, bi * 3 + k);
      const qty = rnd(80, 900);
      const deliveredOn = new Date(Date.now() - rnd(8, 240) * 86400000);
      const paid = p.payDays !== null;
      const payDay = paid ? rnd(p.payDays[0], p.payDays[1]) : null;
      const cropTotal = qty * l.pricePerKg;
      const fareTotal = rnd(700, 3200);
      const drop = centroid(home || l.location.district);
      const km = rnd(8, 70);
      const advPct = k % 3 === 0 ? pick([10, 25, 30], k) : 0;

      listingBump.set(String(l._id), (listingBump.get(String(l._id)) || 0) + qty);

      orders.push({
        listingId: l._id, cropId: l.cropId, cropName: l.cropName,
        quantityKg: qty, pricePerKg: l.pricePerKg, cropTotal,
        farmerUid: l.farmerUid, farmerName: l.farmerName, farmerPhone: l.farmerPhone || '9000000000',
        vendorUid: b.firebaseUid, vendorName: b.name, vendorPhone: b.phone,
        vendorCompany: b.business?.companyName || undefined,
        pickup: {
          lat: l.location.lat, lng: l.location.lng,
          label: l.location.city || 'Farm', city: l.location.city, district: l.location.district,
        },
        dropoff: {
          lat: jitter(drop.lat), lng: jitter(drop.lng),
          label: b.location?.city || home || 'Market', city: b.location?.city, district: home || l.location.district,
        },
        vehicleType: cap.vehicle?.type || pick(VEHICLES, qty),
        distanceKm: km, durationMin: km * 2,
        fare: { base: 200, perKm: 22, distanceCharge: fareTotal - 200, total: fareTotal, agentPayout: fareTotal },
        grandTotal: cropTotal + fareTotal, farmerPayout: cropTotal,
        pickupOtp: otp(), dropOtp: otp(),
        status: 'delivered',
        // ⚠️ agentUid holds the FIREBASE uid, never the Mongo _id, and the field
        // is agentUid not agentId — both mistakes shipped once before and left
        // nine orders carrying a captain's NAME with no captain behind it.
        agentUid: cap.firebaseUid, agentName: cap.name, agentPhone: cap.phone,
        agentVehicleNumber: cap.vehicle?.number || null,
        acceptedAt: new Date(deliveredOn.getTime() - 3 * 3600e3),
        pickedUpAt: new Date(deliveredOn.getTime() - 2 * 3600e3),
        deliveredAt: deliveredOn,
        payment: { mode: 'cod', status: 'collected' },
        pickupOutcome: {
          outcome: 'collected_full', orderedKg: qty, collectedKg: qty,
          recordedAt: new Date(deliveredOn.getTime() - 2 * 3600e3),
          recordedBy: cap.firebaseUid, recordedByRole: 'agent',
          weight: { method: pick(['estimated', 'public_weighbridge', 'farm_scale', 'estimated'], k), ref: '' },
          condition: { checked: k % 2 === 0, flags: k % 9 === 0 ? ['wet'] : [], note: '' },
          // A hired captain does NOT grade — null end to end, exactly as
          // routes/consignments.js refuses it. Defaulting `observed` to the
          // farmer's declaration would write `discrepancy: 'match'`, which is a
          // CONFIRMATION nobody made.
          grade: { declared: l.grade?.code || null, observed: null, discrepancy: null, farmerResponse: null },
        },
        settlement: {
          farmerPaid: paid,
          paidAt: paid ? new Date(deliveredOn.getTime() + payDay * 86400e3) : null,
          method: pick(['cash', 'upi', 'bank'], k),
          advance: advPct
            ? {
              agreedAmount: Math.round(cropTotal * advPct / 100), agreedPct: advPct,
              agreedAt: new Date(deliveredOn.getTime() - 86400e3),
              receivedAt: new Date(deliveredOn.getTime() - 43200e3), method: 'upi',
            }
            : { agreedAmount: 0, agreedPct: 0 },
        },
        dataSource: TAG,
      });
    }
  });

  const withHistory = new Set(orders.map((o) => o.vendorUid)).size;
  const capsUsed = new Set(orders.map((o) => o.agentUid)).size;
  const farmersUsed = new Set(orders.map((o) => o.farmerUid)).size;
  console.log(`\n📦 ${orders.length} delivered order(s)`);
  console.log(`   buyers with a past : ${withHistory} of ${buyers.length} (${buyers.length - withHistory} deliberately left with none)`);
  console.log(`   captains with trips: ${capsUsed}`);
  console.log(`   farmers with sales : ${farmersUsed}`);
  console.log('   buyer profile mix  :', JSON.stringify(counts));
  console.log(`   listings to grow   : ${listingBump.size}`);

  if (DRY) {
    console.log('\n🔍 DRY RUN — nothing written. Re-run with --confirm.');
    await mongoose.disconnect();
    return;
  }

  const saved = await Order.insertMany(orders, { ordered: false });
  console.log(`\n✅ ${saved.length} order(s) written`);

  const ops = [...listingBump.entries()].map(([id, kg]) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(id) },
      // `quantityKg` grows; `quantityAvailableKg` is untouched, so the market
      // keeps every kilogram it had and the farmer's "sold" figure becomes true.
      // No counter is stored — --purge re-derives it from the orders, because a
      // field neither schema declares would be dropped by strict mode.
      update: { $inc: { quantityKg: kg } },
    },
  }));
  const res = await CropListing.bulkWrite(ops, { ordered: false });
  console.log(`✅ ${res.modifiedCount} listing total(s) grown to match the history`);

  await mongoose.disconnect();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });

// scripts/seedRealAccountHistory.js
//
//   node scripts/seedRealAccountHistory.js            # dry run (default)
//   node scripts/seedRealAccountHistory.js --confirm  # write it
//   node scripts/seedRealAccountHistory.js --purge    # remove only what it made
//
// ═══ THIS NOW COVERS EVERY FARMER/VENDOR/AGENT, NOT JUST THE "REAL" 92/38/34
// ═══════════════════════════════════════════════════════════════════════════
//
// The original assumption here was wrong: "the accounts with real emails are
// the ones anyone logs into; the 1,080+ `@mh.farmerapp.demo` accounts exist
// only for radius coverage." REPORTED DIRECTLY, and confirmed live — the
// account actually being tested (`farmer.chandrapur.5@mh.farmerapp.demo`) IS
// one of the statewide ones. Its easy-to-type, district-named email is
// exactly what makes it the one people actually log into for a demo. The
// `notStatewide` exclusion below is gone; this now tops up EVERY farmer,
// vendor and agent account that has enough to build a real order from,
// checked live: 1,158 of 1,172 farmers have a district, an available
// listing, and real coordinates on it.
//
// ═══ WHAT "10-15 EACH" AND "10-15 EACH" CANNOT BOTH MEAN EXACTLY ══════════
//
// There are far more farmers than buyers. Every order links exactly one of
// each, so giving every farmer 10-15 delivered orders produces far more
// orders than buyers × 15 — which then gives the average buyer well above
// 10-15, not capped at it. This script honours the FARMER target as the
// floor (asked for first, and it is the account type outnumbering the other
// two here) and lets buyer/captain counts land wherever that puts them —
// comfortably above 10-15 rather than capped at it. The dry run prints the
// real per-buyer/per-captain distribution so this trade-off is visible
// before anything is written.
//
// ═══ FIVE ACTIVE ORDERS, BUT NOT FIVE LIVE CAPTAINS EACH ══════════════════
//
// `accepted`/`picked_up` require `isActiveJob: true`, which has a PARTIAL
// UNIQUE INDEX per captain — one driver, one job, enforced by the same index
// this app relies on everywhere else. With 92 farmers and only a couple of
// dozen FREE real captains (checked live, not assumed), at most one farmer
// per free captain can have a truly "driver en route" order at once. The
// other active slots use `awaiting_agent` / `no_agents` / `stranded`, which
// carry no such limit — that is not a shortcut, it is what "34 captains, 92
// farmers" actually allows at a single instant, which is the same
// constraint the real dispatch system enforces on a real morning.
//
// ═══ STOCK IS GROWN, NEVER CONSUMED — for delivered orders ════════════════
// Same rule as seedStatewideHistory.js: a historical sale raises the
// listing's `quantityKg` (what was ever harvested) and leaves
// `quantityAvailableKg` (what is for sale TODAY) untouched, so today's real
// market inventory is never eaten by a synthetic past.
//
// Active orders do NOT touch stock at all — `committed` kg on the farmer's
// own listing screen is computed by aggregating ACTIVE ORDERS by listingId
// (routes/listings.js), not by a stock delta, so referencing a real listing
// is enough for that reporting to work without touching quantityAvailableKg.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const CropListing = require('../models/CropListing');
const Order = require('../models/Order');
const Consignment = require('../models/Consignment');

const TAG = 'demo_real_history';

const DRY = !process.argv.includes('--confirm') && !process.argv.includes('--purge');
const PURGE = process.argv.includes('--purge');

const rnd = (a, b) => Math.round(a + Math.random() * (b - a));
const pick = (arr, i) => arr[Math.abs(Math.round(i)) % arr.length];
const otp = () => String(Math.floor(1000 + Math.random() * 9000));
const jitter = (v, km = 8) => v + (Math.random() - 0.5) * (km / 111);
const VEHICLES = ['tempo', 'truck', 'auto'];

const TARGET_DELIVERED_MIN = 10;
const TARGET_DELIVERED_MAX = 15;
const TARGET_ACTIVE = 5;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  if (PURGE) {
    const mine = await Order.find({ dataSource: TAG }).select('_id listingId quantityKg status').lean();
    const back = new Map();
    for (const o of mine) {
      if (o.status !== 'delivered' || !o.listingId) continue;
      const k = String(o.listingId);
      back.set(k, (back.get(k) || 0) + (o.quantityKg || 0));
    }
    if (back.size) {
      await CropListing.bulkWrite([...back.entries()].map(([id, kg]) => ({
        updateOne: { filter: { _id: new mongoose.Types.ObjectId(id) }, update: { $inc: { quantityKg: -kg } } },
      })), { ordered: false });
    }
    const r = await Order.deleteMany({ dataSource: TAG });
    console.log(`🧹 purged ${r.deletedCount} order(s); shrank ${back.size} listing total(s) back.`);
    await mongoose.disconnect();
    return;
  }

  const [farmers, vendors, agents] = await Promise.all([
    User.find({ role: 'farmer' }).select('firebaseUid name phone location').lean(),
    User.find({ role: 'vendor' }).select('firebaseUid name phone business location').lean(),
    User.find({ role: 'agent' }).select('firebaseUid name phone vehicle location').lean(),
  ]);
  console.log(`👥 all accounts: ${farmers.length} farmers, ${vendors.length} buyers, ${agents.length} captains`);

  if (!farmers.length || !vendors.length || !agents.length) {
    console.error('❌ nothing to work with — one role has zero accounts.');
    await mongoose.disconnect();
    return;
  }

  // ── who is actually free to hold a live (isActiveJob) job right now ──────
  // Checked against LIVE data, not assumed — some of these 34 captains
  // already hold a real active order or run from before this script exists.
  const agentUids = agents.map((a) => a.firebaseUid);
  const [busyOrderAgents, busyRunAgents] = await Promise.all([
    Order.find({ agentUid: { $in: agentUids }, isActiveJob: true }).distinct('agentUid'),
    Consignment.find({ agentUid: { $in: agentUids }, isActiveJob: true }).distinct('agentUid'),
  ]);
  const busy = new Set([...busyOrderAgents, ...busyRunAgents]);
  const freeAgents = agents.filter((a) => !busy.has(a.firebaseUid));
  console.log(`🚚 ${freeAgents.length} of ${agents.length} real captains are currently free for a live job`);

  // ── district pools, with a same-list fallback — pairing a buyer/captain
  // outside the farmer's own district would produce the "500 km local
  // pickup" this app's own dispatch radius exists to prevent. ─────────────
  const byDistrict = (list) => {
    const m = new Map();
    for (const x of list) {
      const d = x.location?.district;
      if (!d) continue;
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(x);
    }
    return m;
  };
  const vendorsByDistrict = byDistrict(vendors);
  const agentsByDistrict = byDistrict(agents);

  const usableFarmers = [];
  const skipped = [];
  for (const f of farmers) {
    if (!f.location?.district) { skipped.push({ f, why: 'no district' }); continue; }
    usableFarmers.push(f);
  }

  // One query per farmer for their own available listings — 92 farmers is a
  // small enough set that this is simpler and safer than trying to bulk-join
  // it, and it is only ever run a handful of times against Atlas.
  const listingsByFarmer = new Map();
  for (const f of usableFarmers) {
    const all = await CropListing.find({ farmerUid: f.firebaseUid, status: 'available' })
      .select('_id cropId cropName cropLocalName pricePerKg quantityAvailableKg minOrderKg grade location')
      .lean();
    // A listing with no coordinates is unmeasured, not usable here — an
    // order built from it would carry a NaN dropoff/pickup pair, the exact
    // failure `seedStatewideHistory.js`'s own `usable` filter exists to
    // avoid. None of the real listings hit this at the time of writing
    // (checked live), but a future farmer without a mapped land plot must
    // not silently produce a broken order.
    const rows = all.filter((l) => l.location?.lat && l.location?.lng);
    if (rows.length) listingsByFarmer.set(f.firebaseUid, rows);
    else skipped.push({ f, why: all.length ? 'listing has no coordinates' : 'no available listing' });
  }
  console.log(`🌾 ${listingsByFarmer.size} of ${usableFarmers.length} farmers with a district have a real listing to sell from`);
  if (skipped.length) {
    console.log(`   skipped (no invented listing, no invented crop): ${skipped.length}`);
    for (const s of skipped.slice(0, 10)) console.log(`     - ${s.f.name || s.f.firebaseUid}: ${s.why}`);
    if (skipped.length > 10) console.log(`     … and ${skipped.length - 10} more`);
  }

  // ── existing counts, so re-running this TOPS UP rather than piling on ───
  //
  // ⚠️ TRACKED PER (farmer, STATUS), NOT AS A BARE COUNT. The first version
  // of this script topped up by count alone, and a top-up loop restarting
  // its branch cycle at k=0 every run kept regenerating the FIRST branches
  // (awaiting_agent) and never reached 'stranded' for farmers who already
  // had 4 of 5 — 72 real farmers ended up with zero stranded orders because
  // the loop's own index, not the farmer's actual gap, decided which branch
  // ran. Tracking exactly which of the five branches each farmer already
  // has is what makes a second run fill the real gap instead of the first
  // slot in the cycle.
  const targetFarmerUids = [...listingsByFarmer.keys()];
  const ACTIVE_STATUSES = ['awaiting_agent', 'no_agents', 'accepted', 'picked_up', 'stranded'];
  const [deliveredCounts, activeRows] = await Promise.all([
    Order.aggregate([
      { $match: { farmerUid: { $in: targetFarmerUids }, status: 'delivered' } },
      { $group: { _id: '$farmerUid', n: { $sum: 1 } } },
    ]),
    Order.find({ farmerUid: { $in: targetFarmerUids }, status: { $in: ACTIVE_STATUSES } })
      .select('farmerUid status').lean(),
  ]);
  const deliveredByFarmer = new Map(deliveredCounts.map((r) => [r._id, r.n]));
  const activeByFarmer = new Map();          // farmerUid -> total count (for reporting)
  const activeStatusCountByFarmer = new Map(); // farmerUid -> Map(status -> count)
  for (const r of activeRows) {
    activeByFarmer.set(r.farmerUid, (activeByFarmer.get(r.farmerUid) || 0) + 1);
    if (!activeStatusCountByFarmer.has(r.farmerUid)) activeStatusCountByFarmer.set(r.farmerUid, new Map());
    const m = activeStatusCountByFarmer.get(r.farmerUid);
    m.set(r.status, (m.get(r.status) || 0) + 1);
  }
  // The five real slots this farmer should end up with: two awaiting_agent,
  // one no_agents, one stranded, one live job (accepted OR picked_up counts
  // as the same slot — whichever a free captain produced). Returns exactly
  // the SLOTS still missing, so a second run fills the real gap rather than
  // restarting the branch cycle at its first entry.
  const missingBranchesFor = (farmerUid) => {
    const have = activeStatusCountByFarmer.get(farmerUid) || new Map();
    const missing = [];
    const awaitingHave = have.get('awaiting_agent') || 0;
    for (let i = awaitingHave; i < 2; i++) missing.push('awaiting_agent');
    if (!(have.get('no_agents') || 0)) missing.push('no_agents');
    if (!(have.get('stranded') || 0)) missing.push('stranded');
    if (!((have.get('accepted') || 0) + (have.get('picked_up') || 0))) missing.push('live_or_waiting');
    return missing;
  };

  const orders = [];
  const listingBump = new Map();
  const buyerLoad = new Map();     // vendorUid -> orders assigned this run
  const captainLoad = new Map();   // agentUid  -> orders assigned this run
  let freeAgentCursor = 0;

  for (let fi = 0; fi < usableFarmers.length; fi++) {
    const f = usableFarmers[fi];
    const stock = listingsByFarmer.get(f.firebaseUid);
    if (!stock) continue;

    const home = f.location.district;
    const vendorPool = vendorsByDistrict.get(home) || vendors;
    const captainPool = agentsByDistrict.get(home) || agents;

    // ── DELIVERED (historical) — top up to a random 10-15 target ──────────
    const haveDelivered = deliveredByFarmer.get(f.firebaseUid) || 0;
    const targetDelivered = rnd(TARGET_DELIVERED_MIN, TARGET_DELIVERED_MAX);
    const needDelivered = Math.max(0, targetDelivered - haveDelivered);

    for (let k = 0; k < needDelivered; k++) {
      const l = pick(stock, fi * 11 + k * 7);
      const vendor = pick(vendorPool, fi * 5 + k);
      const cap = pick(captainPool, fi * 3 + k * 2);
      const qty = rnd(60, 500);
      const deliveredOn = new Date(Date.now() - rnd(5, 200) * 86400000);
      const cropTotal = Math.round(qty * l.pricePerKg);
      const fareTotal = rnd(600, 3000);
      const paid = Math.random() < 0.75;   // an honest minority left unpaid, same doctrine as seedTradeDemo
      const payDay = paid ? rnd(0, 20) : null;
      const advPct = k % 4 === 0 ? pick([10, 20, 30], k) : 0;

      listingBump.set(String(l._id), (listingBump.get(String(l._id)) || 0) + qty);
      buyerLoad.set(vendor.firebaseUid, (buyerLoad.get(vendor.firebaseUid) || 0) + 1);
      captainLoad.set(cap.firebaseUid, (captainLoad.get(cap.firebaseUid) || 0) + 1);

      orders.push({
        listingId: l._id, cropId: l.cropId, cropName: l.cropName, cropLocalName: l.cropLocalName || '',
        quantityKg: qty, pricePerKg: l.pricePerKg, cropTotal,
        farmerUid: f.firebaseUid, farmerName: f.name, farmerPhone: f.phone || '9000000000',
        vendorUid: vendor.firebaseUid, vendorName: vendor.name, vendorPhone: vendor.phone,
        vendorCompany: vendor.business?.companyName || undefined,
        pickup: {
          lat: l.location?.lat, lng: l.location?.lng,
          label: l.location?.city || home, city: l.location?.city, district: l.location?.district || home,
        },
        dropoff: {
          lat: jitter(vendor.location?.lat ?? l.location?.lat, 15),
          lng: jitter(vendor.location?.lng ?? l.location?.lng, 15),
          label: vendor.location?.city || home, city: vendor.location?.city, district: vendor.location?.district || home,
        },
        vehicleType: cap.vehicle?.type || pick(VEHICLES, qty),
        distanceKm: rnd(6, 65), durationMin: rnd(20, 140),
        fare: { base: 200, perKm: 22, distanceCharge: fareTotal - 200, total: fareTotal, agentPayout: fareTotal },
        grandTotal: cropTotal + fareTotal, farmerPayout: cropTotal,
        pickupOtp: otp(), dropOtp: otp(),
        status: 'delivered',
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
          weight: { method: pick(['estimated', 'public_weighbridge', 'farm_scale'], k), ref: '' },
          condition: { checked: k % 2 === 0, flags: [], note: '' },
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

    // ── ACTIVE (in-flight) — top up to at least 5, across real branches ────
    // Exactly the slots THIS farmer is missing, not a fresh 0-indexed cycle —
    // see missingBranchesFor()'s own comment for why that distinction is the
    // whole fix.
    const missingBranches = missingBranchesFor(f.firebaseUid);
    for (let k = 0; k < missingBranches.length; k++) {
      const l = pick(stock, fi * 17 + k * 13);
      const kind = missingBranches[k];
      const qty = Math.min(Math.round(l.quantityAvailableKg || 100), rnd(40, 350));
      // ⚠️ `awaiting_agent` MUST be recent — `services/dispatchWindow.js` caps
      // a real dispatch at ~4 hours, and this app has no sweep that lapses a
      // stale one to `no_agents` on its own (that only happens when a real
      // request re-checks it). The first version of this script used a flat
      // 1-20h range for EVERY active branch, which produced 2,795 orders
      // simultaneously sitting in `awaiting_agent` up to 20 hours old —
      // dispatches that could never exist in the real system, and which
      // crowded out genuinely fresh jobs in `routes/orders.js`'s own
      // `.sort({createdAt:1}).limit(SCAN_CAP)` captain feed query (oldest
      // first — exactly the "meaningless at scale" failure mode this app's
      // own dispatch-reach doctrine already names). `no_agents`/`stranded`/
      // `live_or_waiting` are fine to be older — they are not what that
      // query scans for.
      const createdAgo = kind === 'awaiting_agent' ? rnd(0, 3) : rnd(1, 20); // hours
      const createdAt = new Date(Date.now() - createdAgo * 3600e3);
      const cropTotal = Math.round(qty * l.pricePerKg);
      const fareTotal = rnd(600, 3000);
      const dropDistrict = home;

      const base = {
        listingId: l._id, cropId: l.cropId, cropName: l.cropName, cropLocalName: l.cropLocalName || '',
        quantityKg: qty, pricePerKg: l.pricePerKg, cropTotal,
        farmerUid: f.firebaseUid, farmerName: f.name, farmerPhone: f.phone || '9000000000',
        pickup: {
          lat: l.location?.lat, lng: l.location?.lng,
          label: l.location?.city || home, city: l.location?.city, district: l.location?.district || home,
        },
        dropoff: { lat: jitter(l.location?.lat, 15), lng: jitter(l.location?.lng, 15), label: dropDistrict, district: dropDistrict },
        vehicleType: pick(VEHICLES, qty),
        distanceKm: rnd(6, 65), durationMin: rnd(20, 140),
        fare: { base: 200, perKm: 22, distanceCharge: fareTotal - 200, total: fareTotal, agentPayout: null },
        grandTotal: cropTotal + fareTotal, farmerPayout: cropTotal,
        pickupOtp: otp(), dropOtp: otp(),
        dataSource: TAG,
        createdAt,
      };

      if (kind === 'awaiting_agent') {
        const vendor = pick(vendorPool, fi * 19 + k);
        buyerLoad.set(vendor.firebaseUid, (buyerLoad.get(vendor.firebaseUid) || 0) + 1);
        orders.push({
          ...base, status: 'awaiting_agent',
          vendorUid: vendor.firebaseUid, vendorName: vendor.name, vendorPhone: vendor.phone,
          vendorCompany: vendor.business?.companyName || undefined,
          dispatchExpiresAt: new Date(Date.now() + rnd(1, 3) * 3600e3),
        });
      } else if (kind === 'no_agents') {
        const vendor = pick(vendorPool, fi * 23 + k);
        buyerLoad.set(vendor.firebaseUid, (buyerLoad.get(vendor.firebaseUid) || 0) + 1);
        orders.push({
          ...base, status: 'no_agents',
          vendorUid: vendor.firebaseUid, vendorName: vendor.name, vendorPhone: vendor.phone,
          vendorCompany: vendor.business?.companyName || undefined,
          dispatchExpiresAt: new Date(createdAt.getTime() + 4 * 3600e3),
        });
      } else if (kind === 'stranded') {
        const vendor = pick(vendorPool, fi * 29 + k);
        const cap = pick(captainPool, fi * 31 + k);
        buyerLoad.set(vendor.firebaseUid, (buyerLoad.get(vendor.firebaseUid) || 0) + 1);
        captainLoad.set(cap.firebaseUid, (captainLoad.get(cap.firebaseUid) || 0) + 1);
        orders.push({
          ...base, status: 'stranded',
          vendorUid: vendor.firebaseUid, vendorName: vendor.name, vendorPhone: vendor.phone,
          vendorCompany: vendor.business?.companyName || undefined,
          agentUid: cap.firebaseUid, agentName: cap.name, agentPhone: cap.phone,
          agentVehicleNumber: cap.vehicle?.number || null,
          acceptedAt: new Date(createdAt.getTime() + 1800e3),
          pickedUpAt: new Date(createdAt.getTime() + 3600e3),
          strandedAt: new Date(createdAt.getTime() + 5 * 3600e3),
          // ⚠️ 'run_abandoned' is NOT one of Order.strandedReason's enum values
          // (checked schema.path() after every 'stranded' insert silently
          // failed validation the first time this ran — 72 of 72 planned
          // stranded orders were dropped with no thrown error reaching this
          // script's own catch, because Mongoose's unordered insertMany
          // returns the documents that DID succeed rather than rejecting the
          // whole batch). The real enum is
          // ['vehicle_breakdown','driver_unreachable','accident','route_blocked','other'].
          strandedReason: pick(['vehicle_breakdown', 'driver_unreachable', 'other'], fi + k),
          pickupOutcome: {
            outcome: 'collected_full', orderedKg: qty, collectedKg: qty,
            recordedAt: new Date(createdAt.getTime() + 3600e3),
            recordedBy: cap.firebaseUid, recordedByRole: 'agent',
            weight: { method: 'estimated', ref: '' },
          },
        });
      } else {
        // 'live_or_waiting' — a real driver en route, only while one is free.
        const vendor = pick(vendorPool, fi * 37 + k);
        buyerLoad.set(vendor.firebaseUid, (buyerLoad.get(vendor.firebaseUid) || 0) + 1);
        if (freeAgentCursor < freeAgents.length) {
          const cap = freeAgents[freeAgentCursor++];
          captainLoad.set(cap.firebaseUid, (captainLoad.get(cap.firebaseUid) || 0) + 1);
          const livePickedUp = Math.random() < 0.5;
          orders.push({
            ...base, status: livePickedUp ? 'picked_up' : 'accepted',
            vendorUid: vendor.firebaseUid, vendorName: vendor.name, vendorPhone: vendor.phone,
            vendorCompany: vendor.business?.companyName || undefined,
            agentUid: cap.firebaseUid, agentName: cap.name, agentPhone: cap.phone,
            agentVehicleNumber: cap.vehicle?.number || null,
            fare: { ...base.fare, agentPayout: fareTotal },
            isActiveJob: true,
            acceptedAt: new Date(createdAt.getTime() + 900e3),
            pickedUpAt: livePickedUp ? new Date(createdAt.getTime() + 1800e3) : null,
          });
        } else {
          orders.push({
            ...base, status: 'awaiting_agent',
            vendorUid: vendor.firebaseUid, vendorName: vendor.name, vendorPhone: vendor.phone,
            vendorCompany: vendor.business?.companyName || undefined,
            dispatchExpiresAt: new Date(Date.now() + rnd(1, 3) * 3600e3),
          });
        }
      }
    }
  }

  const farmersUsed = new Set(orders.map((o) => o.farmerUid)).size;
  console.log(`\n📦 ${orders.length} order(s) to write (${orders.filter((o) => o.status === 'delivered').length} delivered, `
    + `${orders.filter((o) => o.status !== 'delivered').length} active)`);
  console.log(`   farmers touched   : ${farmersUsed} of ${listingsByFarmer.size}`);
  console.log(`   buyers touched    : ${buyerLoad.size} of ${vendors.length} `
    + `(range ${Math.min(...buyerLoad.values())}-${Math.max(...buyerLoad.values())} orders each)`);
  console.log(`   captains touched  : ${captainLoad.size} of ${agents.length} `
    + `(range ${Math.min(...captainLoad.values())}-${Math.max(...captainLoad.values())} orders each)`);
  console.log(`   live jobs assigned: ${Math.min(freeAgentCursor, freeAgents.length)} of ${freeAgents.length} free captains`);

  if (DRY) {
    console.log('\n🔍 DRY RUN — nothing written. Re-run with --confirm.');
    await mongoose.disconnect();
    return;
  }

  const saved = await Order.insertMany(orders, { ordered: false });
  console.log(`\n✅ ${saved.length} order(s) written`);

  const ops = [...listingBump.entries()].map(([id, kg]) => ({
    updateOne: { filter: { _id: new mongoose.Types.ObjectId(id) }, update: { $inc: { quantityKg: kg } } },
  }));
  if (ops.length) {
    const res = await CropListing.bulkWrite(ops, { ordered: false });
    console.log(`✅ ${res.modifiedCount} listing total(s) grown to match the delivered history`);
  }

  await mongoose.disconnect();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });

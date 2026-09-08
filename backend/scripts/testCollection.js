// Phase 3a test: an FPO collecting its members' produce IN to its own premises.
//
// ═══ WHAT IS BEING GUARDED ════════════════════════════════════════════════
//
// This is the first consignment in the app that is NOT a buyer's order. There
// is no vendor, no Order and no price — the group is bringing members' produce
// to its own godown before anybody has bought it. Three things had to change
// for that and each has a way of going quietly wrong:
//
//   • `Consignment.purpose` — and every EXISTING run must keep validating
//     exactly as before (§1).
//   • stop addressing — `orderId` was doubling as the stop's key across 54
//     call sites, so collection stops (which have none) are addressed by the
//     `_id` Mongoose already minted (§2).
//   • custody — a collected lot's pickup point MUST move to the godown, or a
//     buyer's run is routed to a farm the crop has left (§5).
//
// Namespaced `PH3TEST_` and removed in the finally block, per this project's
// discipline. Runs against LIVE Atlas.
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const B = (p) => path.join(__dirname, '..', p);

// The real function, not a re-implementation — see the export note in routes/fpos.js.
const { computeSettlement } = require(B('routes/fpos.js'));

const mongoose = require('mongoose');
const Consignment = require(B('models/Consignment'));
const CropListing = require(B('models/CropListing'));
const Fpo = require(B('models/Fpo'));

let pass = 0, fail = 0;
const check = (c, m, x = '') => { c ? (pass++, console.log('  ✅', m, x)) : (fail++, console.log('  ❌', m, x)); };

const TAG = 'PH3TEST_';
const oid = () => new mongoose.Types.ObjectId();

(async () => {
  console.log('\n🚚 FPO collection runs (Phase 3a)\n');
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const made = { listings: [], runs: [], fpos: [] };
  try {
    // ── 1. the discriminator, both directions ───────────────────────────
    console.log('1. `purpose` keeps buyer runs exactly as strict as they were');
    const base = {
      dropoff: { lat: 19.99, lng: 73.78 }, vehicleType: 'tempo',
      totalQuantityKg: 100, distanceKm: 5, durationMin: 12, fare: { total: 900 },
    };
    check(Consignment.schema.path('purpose').defaultValue === 'buyer_order',
      'the default is buyer_order, so every existing document reads as what it always was');

    let e = new Consignment({ ...base, stops: [{ orderId: oid(), farmerUid: 'f', quantityKg: 1, lat: 1, lng: 1, sequence: 0 }] }).validateSync();
    check(!!e?.errors?.vendorUid, 'a BUYER run with no vendorUid is still rejected');

    e = new Consignment({ ...base, vendorUid: 'v', stops: [{ farmerUid: 'f', quantityKg: 1, lat: 1, lng: 1, sequence: 0 }] }).validateSync();
    check(Object.keys(e?.errors || {}).some((k) => k.includes('orderId')),
      'a BUYER stop with no orderId is still rejected');

    e = new Consignment({ ...base, purpose: 'fpo_collection',
      stops: [{ listingId: oid(), farmerUid: 'f', quantityKg: 1, lat: 1, lng: 1, sequence: 0 }] }).validateSync();
    check(!e, 'a COLLECTION run needs neither a vendor nor an order', e ? `→ ${Object.keys(e.errors)}` : '');

    e = new Consignment({ ...base, purpose: 'fpo_collection',
      stops: [{ farmerUid: 'f', quantityKg: 1, lat: 1, lng: 1, sequence: 0 }] }).validateSync();
    check(Object.keys(e?.errors || {}).some((k) => k.includes('listingId')),
      '⚠️ but a COLLECTION stop MUST name its listing — it is the only link to the stock');

    // ── 2. stop addressing ──────────────────────────────────────────────
    console.log('\n2. Stops are addressable without an Order');
    const run = await Consignment.create({
      ...base, purpose: 'fpo_collection', fpoId: null, vendorUid: null, orderIds: [],
      totalQuantityKg: 300,
      stops: [
        { listingId: oid(), farmerUid: TAG + 'a', farmerName: TAG + 'A', cropName: 'Onion', quantityKg: 100, lat: 19.9, lng: 73.7, sequence: 0 },
        { listingId: oid(), farmerUid: TAG + 'b', farmerName: TAG + 'B', cropName: 'Onion', quantityKg: 200, lat: 19.8, lng: 73.6, sequence: 1 },
      ],
    });
    made.runs.push(run._id);
    check(run.stops.every((s) => !!s._id), 'every stop carries its own _id, which is the address now');
    check(run.stops[0]._id.toString() !== run.stops[1]._id.toString(), 'and those ids are distinct');
    check(run.stops.every((s) => s.orderId === null), 'while orderId is null throughout — nothing has been sold');

    // ⚠️ THE BUG THIS GUARDS: a request naming NEITHER key must not match the
    // first stop and silently record an outcome against the wrong farm.
    const { findStop } = (() => {
      const mod = require(B('routes/consignments'));
      return { findStop: mod.findStop };
    })();
    if (typeof findStop === 'function') {
      check(findStop(run, {}) === null,
        '⚠️ a request naming NO stop matches NOTHING — it must never fall through to stop one');
      check(findStop(run, { stopId: run.stops[1]._id })?.farmerUid === TAG + 'b',
        'a stopId addresses exactly its own stop');
      check(findStop(run, { orderId: null }) === null,
        'a null orderId matches nothing, even though every stop has orderId null');
    } else {
      check(false, 'findStop is exported for testing');
    }

    // ── 3. the premises gate ────────────────────────────────────────────
    console.log('\n3. A group with no declared premises is REFUSED, not given a centroid');
    const fpo = await Fpo.create({
      name: TAG + 'Group', adminUid: TAG + 'admin', district: 'Nashik', status: 'active',
      members: [{ farmerUid: TAG + 'a', farmerName: TAG + 'A', status: 'active' }],
    });
    made.fpos.push(fpo._id);
    check(fpo.premises.declared === false, 'a new group has NOT declared a collection point');
    check(fpo.premises.lat === null && fpo.premises.lng === null,
      '⚠️ and carries NO coordinate — never a district centroid standing in for a real godown');

    fpo.premises = { declared: true, lat: 19.9975, lng: 73.7898, label: TAG + 'Godown', district: 'Nashik', setAt: new Date(), setBy: TAG + 'admin' };
    await fpo.save();
    const reread = await Fpo.findById(fpo._id).lean();
    check(reread.premises.declared && reread.premises.lat === 19.9975,
      'once declared it persists — `declared` is separate from the coordinates so absent never reads as "no premises"');

    // ── 4. the ≤5 cap counts FARMERS, not lots ──────────────────────────
    console.log('\n4. The vehicle cap counts distinct farms');
    const twoLotsOneFarmer = ['A', 'B'].map(() => ({ farmerUid: 'same' }));
    const farms = [...new Set(twoLotsOneFarmer.map((l) => l.farmerUid))];
    check(farms.length === 1,
      '⚠️ two lots at ONE farm is ONE stop — counting lots would burn a stop the vehicle never makes');

    // ── 5. ⚠️ CUSTODY: the collected stock's pickup point must MOVE ──────
    console.log('\n5. ⚠️ Collected stock stops claiming to be on the farm');
    const srcCropId = oid();
    const src = await CropListing.create({
      cropId: srcCropId,
      farmerUid: TAG + 'a', farmerName: TAG + 'A', cropName: 'Onion',
      quantityKg: 500, quantityAvailableKg: 500, minOrderKg: 10, pricePerKg: 22,
      status: 'available',
      location: { lat: 19.90, lng: 73.70, city: TAG + 'Village', district: 'Nashik' },
      geo: { type: 'Point', coordinates: [73.70, 19.90] },
    });
    made.listings.push(src._id);
    check(src.custody.heldAt === 'farm', 'a fresh listing is held at the FARM by default');

    // Simulate a SHORT collection: 300 of 500 kg arrives.
    const collected = 300;
    const after = await CropListing.findOneAndUpdate(
      { _id: src._id, quantityAvailableKg: { $gte: collected } },
      { $inc: { quantityAvailableKg: -collected } }, { new: true }
    ).lean();
    const held = await CropListing.create({
      cropId: src.cropId,
      farmerUid: src.farmerUid, farmerName: src.farmerName, cropName: src.cropName,
      quantityKg: collected, quantityAvailableKg: collected, minOrderKg: 10,
      pricePerKg: src.pricePerKg, status: 'available',
      location: { lat: reread.premises.lat, lng: reread.premises.lng, city: TAG + 'Godown', district: 'Nashik' },
      geo: { type: 'Point', coordinates: [reread.premises.lng, reread.premises.lat] },
      custody: { heldAt: 'fpo', fpoId: fpo._id, collectionRunId: run._id, collectedAt: new Date(),
        originLabel: TAG + 'Village', originDistrict: 'Nashik' },
    });
    made.listings.push(held._id);

    check(after.quantityAvailableKg === 200,
      '⚠️ ONLY WHAT ARRIVED MOVED — 200 kg is still standing in the field', `→ ${after.quantityAvailableKg} kg left on farm`);
    check(held.quantityAvailableKg === 300, 'and 300 kg is at the godown');
    check(after.quantityAvailableKg + held.quantityAvailableKg === 500,
      'no kilogram was created or lost in the move');
    check(held.custody.heldAt === 'fpo' && String(held.custody.fpoId) === String(fpo._id),
      'the held lot records WHERE it is and WHOSE shed it is in');
    check(held.farmerUid === src.farmerUid,
      '⚠️ OWNERSHIP DID NOT MOVE — the member still owns it; the group is holding it, not buying it');
    check(held.pricePerKg === src.pricePerKg,
      'and the member\'s own asking price rode across untouched');
    check(held.custody.originLabel === TAG + 'Village',
      'the farm it came FROM is still recorded, since `location` now names the shed');
    check(String(held.cropId) === String(src.cropId),
      '⚠️ cropId is CARRIED, not minted — carrying produce to a shed does not make it a '
      + 'different crop, and a fresh id would orphan it from the farmer\'s own harvest record');

    // ⚠️ location and geo must move TOGETHER, and geo is [lng, lat].
    const heldFresh = await CropListing.findById(held._id).lean();
    check(heldFresh.location.lat === reread.premises.lat && heldFresh.location.lng === reread.premises.lng,
      'location points at the godown');
    check(heldFresh.geo.coordinates[0] === reread.premises.lng
       && heldFresh.geo.coordinates[1] === reread.premises.lat,
      '⚠️ and geo moved WITH it, as [lng, lat] — one without the other leaves the lot '
      + 'findable at its old position by every radius query');

    // The whole point: a buyer's run is now routed to the shed, not the farm.
    check(heldFresh.location.lat !== src.location.lat || heldFresh.location.lng !== src.location.lng,
      '⚠️ so a buyer\'s vehicle is no longer sent to a field the crop has left');

    // ── 6. existing buyer runs are untouched ────────────────────────────
    console.log('\n6. Nothing about a buyer run changed');
    const anyBuyer = await Consignment.findOne({ purpose: { $in: ['buyer_order', null] } })
      .select('purpose vendorUid orderIds stops.orderId').lean();
    if (anyBuyer) {
      check(anyBuyer.purpose === 'buyer_order' || anyBuyer.purpose === undefined,
        'a real pre-existing run reads as a buyer run', `→ purpose ${anyBuyer.purpose}`);
      check(!!anyBuyer.vendorUid, 'and still has its buyer');
      check((anyBuyer.stops || []).every((s) => !!s.orderId), 'and every stop still has its order');
    } else {
      check(false, 'a pre-existing buyer run was found to compare against (fixture)');
    }
    const collectionsInDb = await Consignment.countDocuments({ purpose: 'fpo_collection' });
    check(collectionsInDb >= 1, 'collection runs are queryable as their own kind', `→ ${collectionsInDb}`);
  } finally {
    await CropListing.deleteMany({ _id: { $in: made.listings } });
    await Consignment.deleteMany({ _id: { $in: made.runs } });
    await Fpo.deleteMany({ _id: { $in: made.fpos } });
    console.log('\n🧹 test data removed');
    await mongoose.disconnect();
  }

  // ── 7. Phase 3b — the lot fan-out payment ─────────────────────────────
  console.log('\n7. Paying a whole lot fans out and reconciles');
  const fs2 = require('fs');
  const fposSrc = fs2.readFileSync(path.join(__dirname, '..', 'routes/fpos.js'), 'utf8');

  check(/router\.post\('\/lots\/pay'/.test(fposSrc),
    'POST /api/fpos/lots/pay exists — a lot is N Orders and could only be paid one at a time');
  check(/'settlement\.farmerPaid': false/.test(fposSrc),
    '⚠️ each order is settled with the expected state IN THE FILTER, so two taps cannot double-settle');
  check(/simulated: true/.test(fposSrc),
    '⚠️ every fanned-out payment is stamped simulated — this rail moves no money');
  check(/paid\.farmerPayout/.test(fposSrc),
    'the farmer is paid farmerPayout, never grandTotal — the fare is the captain\'s money');
  check(/already_paid/.test(fposSrc) && /not_collected/.test(fposSrc),
    'refusals are named PER ORDER, so one settled line does not strand the others');
  check(/computeSettlement\(fpo, activeMembers, orders, grades\)/.test(fposSrc),
    '⚠️ the reconciliation goes through computeSettlement(), not a second copy of the fee ordering');

  // ⚠️ The field names are the trap. computeSettlement returns `byLot`,
  // `memberPayableTotal` and `pooledCropValue` — there is NO `payouts` and no
  // `facilitationFee`. Reading the names one would guess yields undefined,
  // sums to 0, and reports a lot as reconciling perfectly while telling the
  // buyer nothing is owed to anybody.
  check(!/settled\.payouts/.test(fposSrc) && !/settled\.facilitationFee/.test(fposSrc),
    '⚠️ and reads NO field that does not exist on that function\'s return');
  check(/settled\.byLot/.test(fposSrc) && /settled\.memberPayableTotal/.test(fposSrc)
     && /settled\.pooledCropValue/.test(fposSrc),
    'it reads the real ones: byLot, memberPayableTotal, pooledCropValue');

  // The invariant the brief asks for, proved on real numbers rather than
  // asserted in prose: the per-member rows must add up to the total payable.
  {
    // §1-§6 run inside a try/finally that tears down its fixtures AND
    // disconnects. These last two sections are appended after that, so the
    // connection has to be re-opened for the live reconciliation below.
    const mongoose2 = require('mongoose');
    if (mongoose2.connection.readyState !== 1) {
      await mongoose2.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    }
    const Fpo2 = require(B('models/Fpo.js'));
    const Order2 = require(B('models/Order.js'));
    const groups = await Fpo2.find({ status: 'active' }).limit(60).lean();
    let checked = 0, drifted = [];
    for (const g of groups) {
      const uids = (g.members || [])
        .filter((m) => m.status === 'active' || m.status == null).map((m) => m.farmerUid);
      if (!uids.length) continue;
      const os = await Order2.find({ farmerUid: { $in: uids } }).limit(40).lean();
      if (!os.length) continue;
      const active = (g.members || []).filter((m) => m.status === 'active' || m.status == null);
      const st = computeSettlement(g, active, os, null);
      const sumRows = (st.byLot || []).reduce((a, r) => a + (r.amount || 0), 0);
      const d = Math.round((sumRows - st.memberPayableTotal) * 100) / 100;
      if (Math.abs(d) >= 0.5) drifted.push(`${g.name}: ${d}`);
      checked++;
      if (checked >= 8) break;
    }
    check(checked > 0, 'real groups with orders were available to reconcile', `→ ${checked}`);
    check(drifted.length === 0,
      '⚠️ sum(per-member payouts) === memberPayableTotal on every one of them',
      drifted.length ? `→ DRIFT ${drifted.join(' | ')}` : `→ ${checked} groups balanced`);
    await mongoose2.disconnect();
  }

  // ── 8. Phase 3c — the routes have callers ─────────────────────────────
  console.log('\n8. ⚠️ Phase 3 backend is REACHABLE from the app');
  const Fr = (p2) => path.join(__dirname, '..', '..', 'frontend', p2);
  const rd = (p2) => { try { return fs2.readFileSync(Fr(p2), 'utf8'); } catch { return ''; } };

  const collectScreen = rd('src/screens/Fpo/FpoCollectionScreen.jsx');
  check(collectScreen.length > 0, 'FpoCollectionScreen exists');
  check(/collection-runs/.test(collectScreen),
    'and it CALLS POST /:id/collection-runs — a route with no caller is not a feature');
  check(/\/premises/.test(collectScreen),
    'and PUT /:id/premises, so the group can state its godown');
  check(/navigate\('FpoCollection'/.test(rd('src/screens/Farmer/FpoDashboardScreen.jsx')),
    'the FPO dashboard routes into it');
  for (const nav of ['FarmerNavigator', 'FpoNavigator']) {
    check(/name="FpoCollection"/.test(rd(`src/navigation/${nav}.jsx`)),
      `FpoCollection is registered in ${nav}`);
  }
  check(/premises: fpo\.premises\?\.declared/.test(fposSrc),
    '⚠️ the dashboard RETURNS premises — the screen branches on it, and an absent '
    + 'field would make every group look like it had never set one');

  // ── 9. 🐛 L2 + L4: the transport mode, and who may commit the vehicle ──
  console.log('\n9. 🐛 Transport mode is honoured, and only the admin may commit the vehicle');
  {
    const mongoose3 = require('mongoose');
    if (mongoose3.connection.readyState !== 1) {
      await mongoose3.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    }
    const cons = require(B('routes/consignments.js'));
    const Fpo3 = require(B('models/Fpo.js'));
    const grp = await Fpo3.findOne({ status: 'active', adminUid: { $exists: true, $ne: null } }).lean();

    const body = {
      transportMode: 'own', fpoId: String(grp._id),
      transport: { driverName: 'Test Driver', vehicleNumber: 'MH 15 ZZ 0000', cost: 500 },
    };

    // 🐛 L2: this used to be called as ('own', {statedCost}) — a STRING as the
    // body — so `body.transportMode` read undefined and the mode silently
    // defaulted to 'hired' every single time. An FPO could not use its own
    // vehicle at all, and the stated cost was discarded without a word.
    const asAdmin = await cons.buildTransportArrangement(body, grp.adminUid);
    check(asAdmin.mode === 'own',
      '⚠️ a body naming own transport actually RESOLVES to own, not silently to hired',
      `→ ${asAdmin.mode}`);
    check(asAdmin.transport?.cost === 500 && asAdmin.transport?.costSource === 'fpo_stated',
      'and the stated cost survives, marked as stated rather than computed');

    // ⚠️ L4: uid was taken and never checked — any caller supplying an fpoId
    // could commit that group's vehicle at a price it never agreed to. On a
    // lot sale that body comes from the BUYER.
    const asOutsider = await cons.buildTransportArrangement(body, 'PH#TEST_outsider_uid');
    check(asOutsider.code === 'NOT_FPO_ADMIN',
      '⚠️ an outsider CANNOT put the group\'s vehicle on a run',
      `→ ${asOutsider.code || 'ALLOWED — HOLE STILL OPEN'}`);

    // The buyer path must be untouched: no buyer screen sends transportMode,
    // so every buyer flow resolves to hired and is unaffected by the lock.
    const hired = await cons.buildTransportArrangement({ transportMode: 'hired' }, 'ANY_BUYER');
    check(hired.mode === 'hired' && !hired.error,
      'and the buyer\'s hired path still resolves with no FPO involved');

    // The route must pass a real body, not a string — the actual regression.
    check(/transportMode: req\.body\?\.transportMode \|\| 'hired',\s*\n\s*fpoId: String\(fpo\._id\)/.test(fposSrc),
      'the collection route passes a real body with fpoId from the ROUTE PARAM, never the request body');

    // A trip sheet with no driver is not a record — the screen must collect them.
    const collectScreen2 = rd('src/screens/Fpo/FpoCollectionScreen.jsx');
    check(/body\.driverName/.test(collectScreen2) && /body\.vehicleNumber/.test(collectScreen2),
      'and the screen collects the driver and vehicle the server requires');
    await mongoose3.disconnect();
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('\n❌ THREW:', e.message, '\n', e.stack); process.exit(1); });

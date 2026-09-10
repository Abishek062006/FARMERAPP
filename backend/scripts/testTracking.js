// Phase 5 test: location pings, the ordering guard, and the track payload —
// for a single-farmer ORDER (§1–6) and for a multi-farm RUN (§7–10).
//   node scripts/testTracking.js
//
// §7 onwards is the consignment half. Live tracking existed only on Order, so
// a buyer of a 2-tonne five-farm lot got LESS visibility than someone buying
// 50 kg from one farmer, and a captain had no correct id to post a position to
// at all. Everything asserted below turns on one rule: the app stores the last
// REAL fix and reports how old it is. It never interpolates, extrapolates or
// carries a position forward, because foreground-only tracking means gaps are
// normal and a made-up marker is worse than an honest blank.
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const B = (p) => path.join(__dirname, '..', p);

const authPath = require.resolve(B('middleware/auth.js'));
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  requireAuth: (req, res, next) => {
    const uid = req.headers['x-test-uid'];
    if (!uid) return res.status(401).json({ success: false, error: 'Authentication required' });
    req.firebaseUid = uid; req.user = { sub: uid }; next();
  },
}};

const express = require('express');
const mongoose = require('mongoose');
const User = require(B('models/User'));
const CropListing = require(B('models/CropListing'));
const Order = require(B('models/Order'));
const Consignment = require(B('models/Consignment'));
const Fpo = require(B('models/Fpo'));
const {
  TRACK_LIVE_SEC, TRACK_RECENT_SEC, TRACK_STALE_SEC,
} = require(B('routes/consignments'));

const TAG = 'PH5TEST_';
const FARMER = TAG+'farmer', VENDOR = TAG+'vendor', AGENT = TAG+'agent', OTHER = TAG+'other';
// §7 onwards: two more farms to share a vehicle, a group that drives its own,
// and the driver it assigns.
const F2 = TAG+'f2', F3 = TAG+'f3';
const FPO_ADMIN = TAG+'fpoadmin', FPO_DRIVER = TAG+'fpodriver';
// §11: the FPO as its OWN actor. FPO_ADMIN above is the LEGACY shape — a
// farmer account that claimed a group — and it stays in the suite precisely so
// both shapes are exercised side by side and neither can be broken silently.
const FPO_OFFICE = TAG+'fpooffice';
const NASHIK = { lat: 19.9975, lng: 73.7898 };
const NIPHAD = { lat: 20.0800, lng: 74.1100 };
const YEOLA  = { lat: 20.0424, lng: 74.4894 };
const LASALGAON = { lat: 20.1417, lng: 74.2417, label: 'Lasalgaon mandi' };

let pass = 0, fail = 0;
const check = (c,m,x='') => { c ? (pass++, console.log('  ✅',m,x)) : (fail++, console.log('  ❌',m,x)); };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express(); app.use(express.json());
  app.use('/api/orders', require(B('routes/orders')));
  app.use('/api/consignments', require(B('routes/consignments')));
  const server = app.listen(5126);
  const URL = 'http://127.0.0.1:5126';
  const call = async (method,p,uid,body) => {
    const r = await fetch(URL+p, { method, headers:{'x-test-uid':uid,'Content-Type':'application/json'},
      body: body?JSON.stringify(body):undefined });
    return { status: r.status, body: await r.json() };
  };

  try {
    await User.create([
      { firebaseUid: FARMER, name:'Farmer', email:TAG+'f@t.com', phone:'9000000001', role:'farmer' },
      { firebaseUid: VENDOR, name:'Vendor', email:TAG+'v@t.com', phone:'9000000002', role:'vendor' },
      { firebaseUid: AGENT,  name:'Murugan', email:TAG+'a@t.com', phone:'9000000003', role:'agent',
        vehicle:{type:'tempo',number:'MH 15 AB 1234'}, isOnline:true },
      { firebaseUid: OTHER,  name:'Nosy', email:TAG+'o@t.com', phone:'9000000004', role:'vendor' },
      { firebaseUid: F2, name:'Farmer Two', email:TAG+'f2@t.com', phone:'9000000005', role:'farmer' },
      { firebaseUid: F3, name:'Farmer Three', email:TAG+'f3@t.com', phone:'9000000006', role:'farmer' },
      { firebaseUid: FPO_ADMIN, name:'Group Office', email:TAG+'ad@t.com', phone:'9000000007', role:'farmer' },
      // The FPO's own driver holds an AGENT account on purpose: it is the
      // strongest form of the claim in §10 that being assigned to a run does
      // not make somebody a dispatch captain.
      { firebaseUid: FPO_DRIVER, name:'Sakharam', email:TAG+'dr@t.com', phone:'9000000008', role:'agent',
        vehicle:{type:'tempo',number:'MH 15 ZZ 9090'}, isOnline:true },
      // The organisation's own account — a producer company's officer, who
      // does not farm. §11.
      { firebaseUid: FPO_OFFICE, name:'Yeola FPC Office', email:TAG+'off@t.com', phone:'9000000009',
        role:'fpo' },
    ]);
    const L = await CropListing.create({
      cropId:new mongoose.Types.ObjectId(), farmerUid:FARMER, farmerName:'Farmer', farmerPhone:'9000000001',
      cropName:TAG+'Paddy', quantityKg:500, quantityAvailableKg:500, minOrderKg:10, pricePerKg:30,
      location:{ city:'Testville', district:'Nashik', state:'Maharashtra', ...NASHIK }, status:'available' });

    let r = await call('POST','/api/orders',VENDOR,{ listingId:L._id, quantityKg:100, vehicleType:'tempo', dropoff:LASALGAON });
    const order = r.body.order;
    check(order.routePolyline.length > 1, 'order carries the farm→drop route', `→ ${order.routePolyline.length} points`);

    // ── 1. approach route on accept ────────────────────────────────────
    console.log('\n1. Accept computes the approach leg');
    r = await call('POST',`/api/orders/${order._id}/accept`,AGENT,{ lat:20.06, lng:73.85 });
    check(r.status === 200, 'agent accepts');
    const acc = await Order.findById(order._id).lean();
    check(acc.approachPolyline.length > 1, 'agent→farm route stored', `→ ${acc.approachPolyline.length} points`);
    check(acc.tracking.lat === 20.06 && acc.tracking.seq === 0, 'accept seeds the tracking position');

    // ── 2. location pings ──────────────────────────────────────────────
    console.log('\n2. Location pings');
    r = await call('POST',`/api/orders/${order._id}/location`,AGENT,{ lat:20.07, lng:73.90, heading:210, seq:1 });
    check(r.status === 200 && r.body.applied, 'ping accepted');
    let o = await Order.findById(order._id).lean();
    check(o.tracking.lat === 20.07 && o.tracking.heading === 210 && o.tracking.seq === 1, 'position stored');

    // The whole point of seq: a packet that arrives late must not rewind.
    r = await call('POST',`/api/orders/${order._id}/location`,AGENT,{ lat:99, lng:99, seq:1 });
    check(!r.body.applied, 'a repeated seq is ignored');
    r = await call('POST',`/api/orders/${order._id}/location`,AGENT,{ lat:88, lng:88, seq:0 });
    check(!r.body.applied, 'an OUT-OF-ORDER ping is ignored');
    o = await Order.findById(order._id).lean();
    check(o.tracking.lat === 20.07, 'marker never jumped backwards', `→ still ${o.tracking.lat}`);

    r = await call('POST',`/api/orders/${order._id}/location`,AGENT,{ lat:20.09, lng:73.98, seq:5 });
    check(r.body.applied, 'a higher seq is accepted (gaps are fine)');

    r = await call('POST',`/api/orders/${order._id}/location`,OTHER,{ lat:1, lng:1, seq:99 });
    check(r.status === 403, 'a non-agent cannot post a position');
    r = await call('POST',`/api/orders/${order._id}/location`,AGENT,{ lat:20.09, seq:6 });
    check(r.status === 400, 'malformed ping rejected');

    // ── 3. the track payload ───────────────────────────────────────────
    console.log('\n3. GET /:id/track');
    r = await call('GET',`/api/orders/${order._id}/track?full=1`,VENDOR);
    let t = r.body.track;
    check(r.status === 200 && t.routePolyline && t.approachPolyline, 'full payload carries both routes');
    check(!!t.dropOtp && t.pickupOtp === undefined, 'vendor gets ONLY the delivery code');
    check(t.agentName === 'Murugan' && !!t.agentPhone, 'driver details present');
    check(t.remainingKm > 0 && t.etaMin > 0, 'remaining distance + ETA', `→ ${t.remainingKm} km, ${t.etaMin} min`);
    check(t.stale === false, 'a fresh ping is not stale', `→ age ${t.ageSec}s`);

    r = await call('GET',`/api/orders/${order._id}/track`,VENDOR);
    t = r.body.track;
    check(!t.routePolyline && !t.approachPolyline,
      'the light poll omits polylines', '→ keeps 5s polling small');

    r = await call('GET',`/api/orders/${order._id}/track?full=1`,FARMER);
    check(r.status === 200 && r.body.track.dropOtp === undefined, 'farmer never gets the delivery code');
    r = await call('GET',`/api/orders/${order._id}/track`,OTHER);
    check(r.status === 403, 'a stranger cannot track someone else\'s order');

    // ── 4. staleness ───────────────────────────────────────────────────
    console.log('\n4. Staleness (foreground-only tracking)');
    await Order.updateOne({ _id: order._id },
      { $set: { 'tracking.updatedAt': new Date(Date.now() - 5*60*1000) } });
    r = await call('GET',`/api/orders/${order._id}/track`,VENDOR);
    check(r.body.track.stale === true && r.body.track.ageSec > 120,
      'an old position is reported STALE, not shown as live', `→ ${Math.round(r.body.track.ageSec/60)} min old`);

    // ── 5. the target flips at pickup ──────────────────────────────────
    console.log('\n5. Leg switch');
    const before = (await call('GET',`/api/orders/${order._id}/track`,VENDOR)).body.track.remainingKm;
    const fullOrder = await Order.findById(order._id).lean();
    await call('POST',`/api/orders/${order._id}/pickup`,AGENT,{ otp: fullOrder.pickupOtp, weightMethod: 'estimated' });
    const after = (await call('GET',`/api/orders/${order._id}/track`,VENDOR)).body.track;
    check(after.status === 'picked_up', 'moved to picked_up');
    check(after.remainingKm > before,
      'ETA now measures to the DESTINATION, not the farm', `→ ${before} km → ${after.remainingKm} km`);

    // ── 6. pings stop after delivery ───────────────────────────────────
    console.log('\n6. After delivery');
    await call('POST',`/api/orders/${order._id}/deliver`,AGENT,{ otp: fullOrder.dropOtp });
    r = await call('POST',`/api/orders/${order._id}/location`,AGENT,{ lat:20.14,lng:74.24,seq:100 });
    check(!r.body.applied, 'a delivered trip stops accepting positions');

    // ═════════════════════════════════════════════════════════════════════
    // THE MULTI-FARM RUN — the half that did not exist
    // ═════════════════════════════════════════════════════════════════════
    //
    // A consignment spans N orders, so there was no correct
    // /api/orders/:id/location for a captain to post to and no endpoint for a
    // buyer to poll. The biggest purchase this app supports was the only one
    // with no map at all.

    const mkListing = async (uid, name, at) => CropListing.create({
      cropId:new mongoose.Types.ObjectId(), farmerUid:uid, farmerName:name, farmerPhone:'9000000099',
      cropName:TAG+'Onion', quantityKg:2000, quantityAvailableKg:2000, minOrderKg:10, pricePerKg:20,
      location:{ city:'Testville', district:'Nashik', state:'Maharashtra', ...at }, status:'available' });

    const mkPooledRun = async (extra = {}) => {
      const l2 = await mkListing(F2, 'Farmer Two', NIPHAD);
      const l3 = await mkListing(F3, 'Farmer Three', YEOLA);
      const a = (await call('POST','/api/orders',VENDOR,
        { listingId:l2._id, quantityKg:400, vehicleType:'tempo', dropoff:LASALGAON })).body.order;
      const b = (await call('POST','/api/orders',VENDOR,
        { listingId:l3._id, quantityKg:500, vehicleType:'tempo', dropoff:LASALGAON })).body.order;
      const made = await call('POST','/api/consignments',VENDOR,
        { orderIds:[String(a._id), String(b._id)], vehicleType:'tempo', ...extra });
      return { run: made.body.consignment, made, orders:[a, b] };
    };

    // ── 7. a position on a RUN ─────────────────────────────────────────
    console.log('\n7. Posting a position to a shared run');
    const { run: RUN } = await mkPooledRun();
    check(!!RUN && RUN.status === 'awaiting_agent', 'a two-farm run is created', `→ ${RUN?.status}`);

    r = await call('POST',`/api/consignments/${RUN._id}/location`,AGENT,{ lat:20.01, lng:73.82, seq:1 });
    check(r.status === 409 && r.body.code === 'NO_DRIVER',
      'nobody is driving it yet, so there is no position to post', `→ ${r.body.code}`);

    r = await call('POST',`/api/consignments/${RUN._id}/accept`,AGENT,{ lat:20.00, lng:73.80 });
    check(r.status === 200, 'the captain accepts the run', `→ ${r.status}`);

    r = await call('POST',`/api/consignments/${RUN._id}/location`,AGENT,{ lat:20.03, lng:73.88, heading:96, seq:1 });
    check(r.status === 200 && r.body.applied && r.body.postedByRole === 'agent',
      'THE ASSIGNED CAPTAIN can post a position to the run', `→ ${r.body.postedByRole}`);
    let live = await Consignment.findById(RUN._id).lean();
    check(live.tracking.lat === 20.03 && live.tracking.heading === 96 && live.tracking.seq === 1,
      'and it is stored exactly as posted');
    check(live.tracking.byRole === 'agent' && live.tracking.byUid === AGENT,
      'with WHOSE phone it came from on the record', `→ ${live.tracking.byRole}`);

    r = await call('POST',`/api/consignments/${RUN._id}/location`,AGENT,{ lat:99, lng:99, seq:1 });
    check(!r.body.applied, 'a repeated seq is ignored on a run too');
    r = await call('POST',`/api/consignments/${RUN._id}/location`,AGENT,{ lat:88, lng:88, seq:0 });
    check(!r.body.applied, 'and so is an out-of-order ping');
    live = await Consignment.findById(RUN._id).lean();
    check(live.tracking.lat === 20.03, 'the marker never jumped backwards', `→ still ${live.tracking.lat}`);

    r = await call('POST',`/api/consignments/${RUN._id}/location`,OTHER,{ lat:1, lng:1, seq:99 });
    check(r.status === 403, 'an unrelated buyer cannot post a position', `→ ${r.status}`);
    r = await call('POST',`/api/consignments/${RUN._id}/location`,F2,{ lat:1, lng:1, seq:99 });
    check(r.status === 404 || r.status === 403,
      'nor can a FARMER on the run — their crop is aboard, they are not driving', `→ ${r.status}`);
    r = await call('POST',`/api/consignments/${RUN._id}/location`,AGENT,{ lat:20.04, seq:9 });
    check(r.status === 400, 'a malformed ping is rejected', `→ ${r.status}`);
    live = await Consignment.findById(RUN._id).lean();
    check(live.tracking.lat === 20.03 && live.tracking.seq === 1,
      'and none of those refusals moved the stored position');

    // ── 8. the run's track payload ─────────────────────────────────────
    console.log('\n8. GET /api/consignments/:id/track');
    r = await call('GET',`/api/consignments/${RUN._id}/track?full=1`,VENDOR);
    let tr = r.body.track;
    check(r.status === 200 && tr.routePolyline?.length > 1,
      'the buyer gets the full payload with the route', `→ ${tr.routePolyline?.length} points`);
    check(!!tr.dropOtp, 'the buyer holds the delivery code');
    // The SAME keys the single-order payload uses, so one renderer draws both.
    check(tr.agentName === 'Murugan' && !!tr.agentPhone && !!tr.agentVehicleNumber,
      'driver details under the same keys GET /api/orders/:id/track uses', `→ ${tr.agentName}`);
    check(tr.driver.kind === 'captain' && tr.driver.linked === true,
      'with `driver.kind` naming which sort of driver it is', `→ ${tr.driver.kind}`);
    check(tr.stale === false && tr.staleness === 'live' && !!tr.lastSeenAt,
      'a fresh fix reads live, and says WHEN it was seen', `→ ${tr.staleness}, age ${tr.ageSec}s`);
    check(tr.interpolated === false && tr.positionSource === 'device_foreground_ping',
      'the payload states outright that nothing was interpolated');
    check(tr.remainingKm > 0 && tr.etaMin > 0 && tr.etaBasis === 'last_seen_position',
      'the ETA names the fix it was measured from', `→ ${tr.remainingKm} km, ${tr.etaMin} min`);
    check(tr.nextStop?.sequence === 0 && tr.progress.stopsTotal === 2 && tr.progress.stopsVisited === 0,
      'and the payload says which farm is next and how far along the run is',
      `→ stop ${tr.nextStop?.sequence}, ${tr.progress.stopsVisited}/${tr.progress.stopsTotal} visited`);

    r = await call('GET',`/api/consignments/${RUN._id}/track`,VENDOR);
    check(!r.body.track.routePolyline,
      'the light poll omits the polyline', '→ keeps 5s polling small');

    // A FARMER ON THE RUN — the person whose crop is on that vehicle.
    r = await call('GET',`/api/consignments/${RUN._id}/track`,F2);
    tr = r.body.track;
    check(r.status === 200 && tr.viewerRole === 'farmer',
      'a farmer on the run CAN see the truck carrying their crop', `→ ${tr.viewerRole}`);
    check(tr.dropOtp === undefined, 'but never the delivery code');
    const mine = tr.stops.find((s) => s.mine);
    const theirs = tr.stops.filter((s) => !s.mine);
    check(!!mine && mine.farmerName === 'Farmer Two' && mine.cropName && mine.quantityKg > 0,
      'their OWN stop keeps everything', `→ ${mine?.farmerName}, ${mine?.quantityKg} kg`);
    check(theirs.length === 1
      && theirs[0].farmerName === undefined && theirs[0].farmerPhone === undefined
      && theirs[0].farmerUid === undefined && theirs[0].cropName === undefined
      && theirs[0].quantityKg === undefined && theirs[0].fareShare === undefined,
      "and ANOTHER farmer's stop is a point on a map and nothing else — no name, "
      + 'phone, uid, crop, weight or money');
    check(theirs[0].lat != null && theirs[0].outcome === 'pending',
      '...but still a real point, so the route can actually be drawn');
    check(tr.nextStop && tr.nextStop.farmerName === null,
      'and "next stop" does not name somebody else\'s farm either');
    check(!!tr.privacyNote, 'the payload says why it is redacted rather than looking broken');

    r = await call('GET',`/api/consignments/${RUN._id}/track`,OTHER);
    check(r.status === 403, 'a stranger sees nothing at all', `→ ${r.status}`);
    r = await call('GET',`/api/consignments/${RUN._id}/track`,AGENT);
    check(r.status === 200 && r.body.track.viewerRole === 'agent', 'the captain can read their own run');

    // ── 9. staleness — the whole point ─────────────────────────────────
    // Foreground-only tracking on a multi-hour run means the phone is in a
    // pocket for most of it. A stale track is REPORTED stale; a position
    // between two fixes is never invented.
    console.log('\n9. A stale track reports staleness, it does not fake a position');
    const seenAt = new Date(Date.now() - (TRACK_RECENT_SEC + 60) * 1000);
    await Consignment.updateOne({ _id: RUN._id }, { $set: { 'tracking.updatedAt': seenAt } });
    r = await call('GET',`/api/consignments/${RUN._id}/track`,VENDOR);
    tr = r.body.track;
    check(tr.stale === true && tr.staleness === 'stale',
      `a fix older than ${TRACK_RECENT_SEC / 60} min is graded 'stale'`, `→ ${tr.staleness}, ${tr.ageSec}s`);
    check(tr.tracking.lat === 20.03 && tr.tracking.lng === 73.88,
      'the position returned is the LAST REAL FIX, unchanged — nothing was advanced along the route',
      `→ ${tr.tracking.lat}, ${tr.tracking.lng}`);
    check(new Date(tr.lastSeenAt).getTime() === seenAt.getTime(),
      'and `lastSeenAt` is the real time it was seen, not the time of the poll');
    check(/last position/i.test(tr.staleNote) && tr.interpolated === false,
      'with a sentence a UI can show instead of a live-looking marker');

    await Consignment.updateOne({ _id: RUN._id },
      { $set: { 'tracking.updatedAt': new Date(Date.now() - (TRACK_STALE_SEC + 60) * 1000) } });
    tr = (await call('GET',`/api/consignments/${RUN._id}/track`,VENDOR)).body.track;
    check(tr.staleness === 'cold' && tr.stale === true,
      `over ${TRACK_STALE_SEC / 60} min old is 'cold' — do not draw it as a moving vehicle`,
      `→ ${Math.round(tr.ageSec / 60)} min old`);

    await Consignment.updateOne({ _id: RUN._id },
      { $set: { 'tracking.updatedAt': new Date(Date.now() - (TRACK_LIVE_SEC + 5) * 1000) } });
    tr = (await call('GET',`/api/consignments/${RUN._id}/track`,VENDOR)).body.track;
    check(tr.staleness === 'recent' && tr.stale === true,
      "just past the live boundary is 'recent' — `stale` keeps the SAME 30s meaning the "
      + 'single-order payload has, so one renderer still works', `→ ${tr.staleness}`);

    const { run: NEVER } = await mkPooledRun();
    tr = (await call('GET',`/api/consignments/${NEVER._id}/track`,VENDOR)).body.track;
    check(tr.staleness === 'never' && tr.ageSec === null && tr.tracking.lat === null
      && tr.remainingKm === null && tr.etaMin === null && tr.etaBasis === null,
      'a run nobody has pinged reports NO position and NO ETA rather than a guess',
      `→ ${tr.staleness}`);
    check(/has to be open/i.test(tr.staleNote), 'and explains that this is not a fault');

    // ── 10. the FPO's own driver posts the position ────────────────────
    // On an own/contracted run agentUid is null, so before a driver could be
    // assigned NO position could ever be captured on such a run at all.
    //
    // ⚠️ NOT BUILT VIA mkPooledRun. `POST /api/consignments` is a BUYER route
    // (requireRole('vendor')) and is correctly HIRED_ONLY — a prior security
    // fix closed the hole where a buyer could name an arbitrary FPO's own
    // vehicle and state its cost with nobody from that FPO consenting (see
    // CLAUDE.md and the identical fix already applied in testConsignments.js
    // §998). What this section actually tests — an FPO driver may post a
    // position on an own-mode run, the office may not — does not depend on
    // HOW the run was created, only on it existing with real Orders and
    // `agentUid: null`. So it is constructed directly, exactly as
    // testConsignments.js's g3Orders/G3doc scaffolding already does.
    console.log('\n10. An FPO driver posts a position; the office cannot');
    const fpo = await Fpo.create({
      name: TAG+'Niphad Growers', district:'Nashik', adminUid: FPO_ADMIN, adminName:'Group Office',
      members: [
        { farmerUid: F2, farmerName:'Farmer Two', status:'active' },
        { farmerUid: F3, farmerName:'Farmer Three', status:'active' },
      ],
    });
    const l2 = await mkListing(F2, 'Farmer Two', NIPHAD);
    const l3 = await mkListing(F3, 'Farmer Three', YEOLA);
    const oa = (await call('POST','/api/orders',VENDOR,
      { listingId:l2._id, quantityKg:400, vehicleType:'tempo', dropoff:LASALGAON })).body.order;
    const ob = (await call('POST','/api/orders',VENDOR,
      { listingId:l3._id, quantityKg:500, vehicleType:'tempo', dropoff:LASALGAON })).body.order;
    const OWN = await Consignment.create({
      vendorUid: VENDOR, vendorName: 'Test Vendor', vendorPhone: '9000000002',
      orderIds: [oa._id, ob._id],
      stops: [oa, ob].map((o, i) => ({
        orderId: o._id, farmerUid: o.farmerUid, farmerName: o.farmerName, farmerPhone: o.farmerPhone,
        cropName: o.cropName, quantityKg: o.quantityKg,
        lat: [NIPHAD, YEOLA][i].lat, lng: [NIPHAD, YEOLA][i].lng, label: `Farm ${i}`,
        sequence: i, legKm: 10, fareShare: 900, fareShareBasisKg: o.quantityKg,
      })),
      dropoff: { ...LASALGAON },
      vehicleType: 'tempo', totalQuantityKg: 900, distanceKm: 25, durationMin: 50,
      routeSource: 'haversine',
      fare: { base: null, perKm: null, distanceCharge: null, returnCharge: 0, returnKm: 0,
        returnThresholdKm: null, total: 1800, agentPayout: null },
      soloFareTotal: null,
      transportMode: 'own', fpoId: fpo._id,
      transport: {
        driverName: 'Sakharam', driverPhone: '9000000008', vehicleNumber: 'MH 15 ZZ 9090',
        cost: 1800, costSource: 'fpo_stated', costNote: 'Not computed by this app — the FPO stated it.',
        arrangedBy: FPO_ADMIN,
      },
      status: 'accepted', agentUid: null, dropOtp: '5566',
    });
    await Order.updateMany({ _id: { $in: [oa._id, ob._id] } }, { $set: { consignmentId: OWN._id } });
    check(OWN && OWN.status === 'accepted' && OWN.agentUid === null,
      'a run the FPO drives itself starts accepted with no captain', `→ ${OWN.status}`);

    r = await call('POST',`/api/consignments/${OWN._id}/location`,FPO_ADMIN,{ lat:20.02, lng:73.9, seq:1 });
    check(r.status === 403 && r.body.code === 'NOT_IN_THE_VEHICLE',
      'THE OFFICE CANNOT POST A POSITION — it may relay a stop outcome, but a coordinate '
      + 'from a desk would be invented', `→ ${r.body.code}`);

    r = await call('POST',`/api/consignments/${OWN._id}/driver`,FPO_ADMIN,{ driverUid: FPO_DRIVER });
    check(r.status === 200 && r.body.driver.kind === 'fpo_driver' && r.body.driver.linked === true,
      'the admin assigns their own driver to the run', `→ ${r.body.driver?.kind}`);

    r = await call('POST',`/api/consignments/${OWN._id}/location`,FPO_DRIVER,{ lat:20.05, lng:74.02, seq:1 });
    check(r.status === 200 && r.body.applied && r.body.postedByRole === 'fpo_driver',
      'THE ASSIGNED FPO DRIVER can now post one — the gap that made tracking impossible '
      + 'for exactly the FPOs running their own vehicles', `→ ${r.body.postedByRole}`);
    const ownLive = await Consignment.findById(OWN._id).lean();
    check(ownLive.tracking.byRole === 'fpo_driver' && ownLive.tracking.byUid === FPO_DRIVER,
      'and the record says it came from the driver, not from the group office');

    tr = (await call('GET',`/api/consignments/${OWN._id}/track`,VENDOR)).body.track;
    check(tr.agentName === 'Sakharam' && tr.driver.kind === 'fpo_driver',
      'the buyer reads an FPO-driven run through the SAME keys as a captain-driven one',
      `→ ${tr.agentName} (${tr.driver.kind})`);
    check(tr.transportMode === 'own' && tr.staleness === 'live',
      '...while still saying it is the group\'s own vehicle', `→ ${tr.transportMode}`);
    tr = (await call('GET',`/api/consignments/${OWN._id}/track`,FPO_ADMIN)).body.track;
    check(tr.viewerRole === 'fpo_admin', 'and the group admin can watch their own run too');

    r = await call('POST',`/api/consignments/${OWN._id}/location`,FPO_DRIVER,{ lat:20.06, lng:74.05, seq:0 });
    check(!r.body.applied, 'the seq guard applies to an FPO driver identically');

    // ── 11. THE SAME RUN, DRIVEN BY AN `fpo` ACCOUNT ───────────────────
    // §10 above is the LEGACY shape: an FPO admin who is a farmer account.
    // This is the same machinery reached by the organisation's OWN account,
    // and every assertion here is the twin of one above — the point being that
    // the new role changes WHO may reach these routes and changes nothing at
    // all about what they then decide, because the decision was always
    // `fpo.adminUid === uid` and never the role.
    console.log('\n11. An `fpo`-role account is the same admin, and still not a driver');
    const fpo2 = await Fpo.create({
      name: TAG+'Yeola Farmers Producer Company', district:'Nashik',
      adminUid: FPO_OFFICE, adminName:'Yeola FPC Office',
      // ZERO members at founding is the honest shape for an officer-run group
      // — see scripts/reviewFpoClaims.js. F2/F3 are added because this run
      // needs their farms, not because the office is one of them.
      members: [
        { farmerUid: F2, farmerName:'Farmer Two', status:'active' },
        { farmerUid: F3, farmerName:'Farmer Three', status:'active' },
      ],
    });
    // ⚠️ Same reason as §10: built directly, not through the buyer-facing
    // HIRED_ONLY route.
    const l2b = await mkListing(F2, 'Farmer Two', NIPHAD);
    const l3b = await mkListing(F3, 'Farmer Three', YEOLA);
    const oc = (await call('POST','/api/orders',VENDOR,
      { listingId:l2b._id, quantityKg:300, vehicleType:'tempo', dropoff:LASALGAON })).body.order;
    const od = (await call('POST','/api/orders',VENDOR,
      { listingId:l3b._id, quantityKg:450, vehicleType:'tempo', dropoff:LASALGAON })).body.order;
    const OWN2 = await Consignment.create({
      vendorUid: VENDOR, vendorName: 'Test Vendor', vendorPhone: '9000000002',
      orderIds: [oc._id, od._id],
      stops: [oc, od].map((o, i) => ({
        orderId: o._id, farmerUid: o.farmerUid, farmerName: o.farmerName, farmerPhone: o.farmerPhone,
        cropName: o.cropName, quantityKg: o.quantityKg,
        lat: [NIPHAD, YEOLA][i].lat, lng: [NIPHAD, YEOLA][i].lng, label: `Farm ${i}`,
        sequence: i, legKm: 10, fareShare: 950, fareShareBasisKg: o.quantityKg,
      })),
      dropoff: { ...LASALGAON },
      vehicleType: 'tempo', totalQuantityKg: 750, distanceKm: 25, durationMin: 50,
      routeSource: 'haversine',
      fare: { base: null, perKm: null, distanceCharge: null, returnCharge: 0, returnKm: 0,
        returnThresholdKm: null, total: 1900, agentPayout: null },
      soloFareTotal: null,
      transportMode: 'contracted', fpoId: fpo2._id,
      transport: {
        driverName: 'Bharat Transport', driverPhone: '9822003344', vehicleNumber: 'MH 15 QQ 4242',
        cost: 1900, costSource: 'negotiated_rate', costNote: 'A rate the FPO negotiated directly, not computed by this app.',
        arrangedBy: FPO_OFFICE,
      },
      status: 'accepted', agentUid: null, dropOtp: '7788',
    });
    await Order.updateMany({ _id: { $in: [oc._id, od._id] } }, { $set: { consignmentId: OWN2._id } });
    check(OWN2.status === 'accepted' && OWN2.agentUid === null,
      'a contracted run for an `fpo`-admin group starts accepted with no captain', `→ ${OWN2.status}`);

    r = await call('POST',`/api/consignments/${OWN2._id}/location`,FPO_OFFICE,{ lat:20.02, lng:73.9, seq:1 });
    check(r.status === 403 && r.body.code === 'NOT_IN_THE_VEHICLE',
      'THE OFFICE STILL CANNOT POST A POSITION — and it now gets the reasoned refusal rather '
      + 'than a generic role 403, because the outer gate admits it and the honesty rule turns '
      + 'it away by name', `→ ${r.body.code}`);

    // The refusal that the new role made possible to state properly.
    r = await call('POST',`/api/consignments/${OWN2._id}/driver`,FPO_OFFICE,{ driverUid: FPO_OFFICE });
    check(r.status === 409 && r.body.code === 'DRIVER_ROLE',
      'AN OFFICE ACCOUNT CANNOT BE ITS OWN DRIVER — an office is not in a vehicle', `→ ${r.body.code}`);
    check(/office/i.test(r.body.error || '') && !/conflict of interest/i.test(r.body.error || ''),
      "...and the message says WHY for this role, not the buyer's conflict-of-interest reason",
      `→ ${String(r.body.error).slice(0, 60)}…`);

    r = await call('POST',`/api/consignments/${OWN2._id}/driver`,FPO_OFFICE,{ driverUid: F2 });
    check(r.status === 200 && r.body.driver.kind === 'fpo_driver',
      'but it CAN assign a real person as the driver, exactly as a farmer-admin can',
      `→ ${r.body.driver?.kind}`);

    r = await call('POST',`/api/consignments/${OWN2._id}/location`,F2,{ lat:20.05, lng:74.02, seq:1 });
    check(r.status === 200 && r.body.applied && r.body.postedByRole === 'fpo_driver',
      'and that driver posts positions from the vehicle', `→ ${r.body.postedByRole}`);

    tr = (await call('GET',`/api/consignments/${OWN2._id}/track`,FPO_OFFICE)).body.track;
    check(tr.viewerRole === 'fpo_admin',
      'the office watches its own run as fpo_admin — the read gate was always adminUid, never the role',
      `→ ${tr.viewerRole}`);

    r = await call('POST',`/api/consignments/${OWN._id}/driver`,FPO_OFFICE,{ driverUid: F3 });
    check(r.status === 403 && r.body.code === 'NOT_FPO_ADMIN',
      "an `fpo` account has no authority over ANOTHER group's run — the role grants nothing "
      + 'on its own', `→ ${r.body.code}`);

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    // Consignments and Fpos MUST be cleaned up too. When the run-tracking
    // sections were added, this list still only covered the three collections
    // the suite used before them — so every run left its consignments behind,
    // and any that held `isActiveJob` then blocked THE NEXT RUN's agent from
    // accepting anything, because the one-active-job rule now spans Order and
    // Consignment. The symptom is brutal to read: "agent accepts" fails first
    // and thirty downstream assertions cascade off it, in a suite whose own
    // code never changed. Delete by every field the suite writes a tagged uid
    // into, not just one — a run is reachable by agent, vendor or driver.
    const tag = new RegExp('^'+TAG);
    await Promise.all([
      User.deleteMany({ firebaseUid: tag }),
      CropListing.deleteMany({ farmerUid: tag }),
      Order.deleteMany({ farmerUid: tag }),
      Consignment.deleteMany({ $or: [
        { agentUid: tag }, { vendorUid: tag }, { 'transport.driverUid': tag },
      ] }),
      Fpo.deleteMany({ adminUid: tag }),
    ]);
    console.log('\n🧹 test data removed');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

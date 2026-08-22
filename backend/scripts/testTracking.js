// Phase 5 test: location pings, the ordering guard, and the track payload.
//   node scripts/testTracking.js
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

const TAG = 'PH5TEST_';
const FARMER = TAG+'farmer', VENDOR = TAG+'vendor', AGENT = TAG+'agent', OTHER = TAG+'other';
const THANJAVUR = { lat: 10.7870, lng: 79.1378 };
const TRICHY = { lat: 10.7905, lng: 78.7047, label: 'Trichy market' };

let pass = 0, fail = 0;
const check = (c,m,x='') => { c ? (pass++, console.log('  ✅',m,x)) : (fail++, console.log('  ❌',m,x)); };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express(); app.use(express.json());
  app.use('/api/orders', require(B('routes/orders')));
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
        vehicle:{type:'tempo',number:'TN 45 AB 1234'}, isOnline:true },
      { firebaseUid: OTHER,  name:'Nosy', email:TAG+'o@t.com', phone:'9000000004', role:'vendor' },
    ]);
    const L = await CropListing.create({
      cropId:new mongoose.Types.ObjectId(), farmerUid:FARMER, farmerName:'Farmer', farmerPhone:'9000000001',
      cropName:TAG+'Paddy', quantityKg:500, quantityAvailableKg:500, minOrderKg:10, pricePerKg:30,
      location:{ city:'Testville', district:'Thanjavur', state:'Tamil Nadu', ...THANJAVUR }, status:'available' });

    let r = await call('POST','/api/orders',VENDOR,{ listingId:L._id, quantityKg:100, vehicleType:'tempo', dropoff:TRICHY });
    const order = r.body.order;
    check(order.routePolyline.length > 1, 'order carries the farm→drop route', `→ ${order.routePolyline.length} points`);

    // ── 1. approach route on accept ────────────────────────────────────
    console.log('\n1. Accept computes the approach leg');
    r = await call('POST',`/api/orders/${order._id}/accept`,AGENT,{ lat:10.90, lng:79.20 });
    check(r.status === 200, 'agent accepts');
    const acc = await Order.findById(order._id).lean();
    check(acc.approachPolyline.length > 1, 'agent→farm route stored', `→ ${acc.approachPolyline.length} points`);
    check(acc.tracking.lat === 10.90 && acc.tracking.seq === 0, 'accept seeds the tracking position');

    // ── 2. location pings ──────────────────────────────────────────────
    console.log('\n2. Location pings');
    r = await call('POST',`/api/orders/${order._id}/location`,AGENT,{ lat:10.88, lng:79.18, heading:210, seq:1 });
    check(r.status === 200 && r.body.applied, 'ping accepted');
    let o = await Order.findById(order._id).lean();
    check(o.tracking.lat === 10.88 && o.tracking.heading === 210 && o.tracking.seq === 1, 'position stored');

    // The whole point of seq: a packet that arrives late must not rewind.
    r = await call('POST',`/api/orders/${order._id}/location`,AGENT,{ lat:99, lng:99, seq:1 });
    check(!r.body.applied, 'a repeated seq is ignored');
    r = await call('POST',`/api/orders/${order._id}/location`,AGENT,{ lat:88, lng:88, seq:0 });
    check(!r.body.applied, 'an OUT-OF-ORDER ping is ignored');
    o = await Order.findById(order._id).lean();
    check(o.tracking.lat === 10.88, 'marker never jumped backwards', `→ still ${o.tracking.lat}`);

    r = await call('POST',`/api/orders/${order._id}/location`,AGENT,{ lat:10.85, lng:79.16, seq:5 });
    check(r.body.applied, 'a higher seq is accepted (gaps are fine)');

    r = await call('POST',`/api/orders/${order._id}/location`,OTHER,{ lat:1, lng:1, seq:99 });
    check(r.status === 403, 'a non-agent cannot post a position');
    r = await call('POST',`/api/orders/${order._id}/location`,AGENT,{ lat:10.8, seq:6 });
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
    await call('POST',`/api/orders/${order._id}/pickup`,AGENT,{ otp: fullOrder.pickupOtp });
    const after = (await call('GET',`/api/orders/${order._id}/track`,VENDOR)).body.track;
    check(after.status === 'picked_up', 'moved to picked_up');
    check(after.remainingKm > before,
      'ETA now measures to the DESTINATION, not the farm', `→ ${before} km → ${after.remainingKm} km`);

    // ── 6. pings stop after delivery ───────────────────────────────────
    console.log('\n6. After delivery');
    await call('POST',`/api/orders/${order._id}/deliver`,AGENT,{ otp: fullOrder.dropOtp });
    r = await call('POST',`/api/orders/${order._id}/location`,AGENT,{ lat:10.7,lng:78.7,seq:100 });
    check(!r.body.applied, 'a delivered trip stops accepting positions');

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    await Promise.all([
      User.deleteMany({ firebaseUid: new RegExp('^'+TAG) }),
      CropListing.deleteMany({ farmerUid: new RegExp('^'+TAG) }),
      Order.deleteMany({ farmerUid: new RegExp('^'+TAG) }),
    ]);
    console.log('\n🧹 test data removed');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

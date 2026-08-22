// Phase 4 test: agent dispatch, accept/reject races, and the OTP handover.
//   node scripts/testDispatch.js
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

const TAG = 'PH4TEST_';
const FARMER = TAG+'farmer', VENDOR = TAG+'vendor';
const A_TEMPO = TAG+'agentTempo', B_TEMPO = TAG+'agentTempo2', C_TRUCK = TAG+'agentTruck', D_BARE = TAG+'agentBare';
const THANJAVUR = { lat: 10.7870, lng: 79.1378 };
const NEARBY = { lat: 10.8400, lng: 79.1500, label: 'Nearby godown' };

let pass = 0, fail = 0;
const check = (c, m, x='') => { c ? (pass++, console.log('  ✅', m, x)) : (fail++, console.log('  ❌', m, x)); };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express(); app.use(express.json());
  app.use('/api/orders', require(B('routes/orders')));
  const server = app.listen(5125);
  const URL = 'http://127.0.0.1:5125';

  const call = async (method, p, uid, body) => {
    const r = await fetch(URL + p, {
      method, headers: { 'x-test-uid': uid, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };

  const mkListing = () => CropListing.create({
    cropId: new mongoose.Types.ObjectId(), farmerUid: FARMER,
    farmerName: 'Test Farmer', farmerPhone: '9000000001',
    cropName: TAG+'Paddy', quantityKg: 500, quantityAvailableKg: 500,
    minOrderKg: 10, pricePerKg: 30, totalPrice: 15000,
    location: { city: 'Testville', district: 'Thanjavur', state: 'Tamil Nadu', ...THANJAVUR },
    status: 'available' });

  const mkOrder = async (vehicleType = 'tempo') => {
    const L = await mkListing();
    const r = await call('POST', '/api/orders', VENDOR,
      { listingId: L._id, quantityKg: 100, vehicleType, dropoff: NEARBY });
    return r.body.order;
  };

  try {
    await User.create([
      { firebaseUid: FARMER, name: 'Test Farmer', email: TAG+'f@t.com', phone: '9000000001', role: 'farmer' },
      { firebaseUid: VENDOR, name: 'Test Vendor', email: TAG+'v@t.com', phone: '9000000002', role: 'vendor' },
      { firebaseUid: A_TEMPO, name: 'Murugan', email: TAG+'a1@t.com', phone: '9000000010', role: 'agent',
        vehicle: { type: 'tempo', number: 'TN 45 AB 1234' }, isOnline: true },
      { firebaseUid: B_TEMPO, name: 'Selvam', email: TAG+'a2@t.com', phone: '9000000011', role: 'agent',
        vehicle: { type: 'tempo', number: 'TN 45 CD 5678' }, isOnline: true },
      { firebaseUid: C_TRUCK, name: 'Raja', email: TAG+'a3@t.com', phone: '9000000012', role: 'agent',
        vehicle: { type: 'truck', number: 'TN 45 EF 9012' }, isOnline: true },
      { firebaseUid: D_BARE, name: 'Newbie', email: TAG+'a4@t.com', phone: '9000000013', role: 'agent' },
    ]);

    // ── 1. onboarding gate ─────────────────────────────────────────────
    console.log('\n1. Vehicle onboarding');
    let r = await call('GET', '/api/orders/agent/available', D_BARE);
    check(r.status === 400 && r.body.code === 'NO_VEHICLE',
      'agent without a vehicle is told to set one up', `→ "${r.body.error}"`);
    r = await call('GET', '/api/orders/agent/available', VENDOR);
    check(r.status === 403, 'vendors cannot see the job feed');

    // ── 2. the feed ────────────────────────────────────────────────────
    console.log('\n2. Job feed');
    const o1 = await mkOrder('tempo');
    r = await call('GET', '/api/orders/agent/available', A_TEMPO, null);
    let ids = r.body.orders.map(o => o._id);
    check(ids.includes(String(o1._id)), 'tempo agent is offered a tempo job');
    r = await call('GET', '/api/orders/agent/available', C_TRUCK);
    check(!r.body.orders.map(o => o._id).includes(String(o1._id)),
      'truck agent is NOT offered a tempo job');

    r = await fetch(`${URL}/api/orders/agent/available?lat=10.90&lng=79.20`, { headers: { 'x-test-uid': A_TEMPO } });
    const feed = (await r.json()).orders.find(o => o._id === String(o1._id));
    check(feed.approachKm != null && feed.approachKm > 0,
      'feed carries distance to the pickup', `→ ${feed.approachKm} km away`);
    check(feed.expiresInSec > 0 && feed.expiresInSec <= 300, 'feed carries a countdown', `→ ${feed.expiresInSec}s`);
    check(feed.pickupOtp === undefined && feed.dropOtp === undefined && feed.farmerPhone === undefined,
      'feed leaks no codes or phone numbers');

    // ── 3. reject ──────────────────────────────────────────────────────
    console.log('\n3. Reject');
    await call('POST', `/api/orders/${o1._id}/reject`, B_TEMPO, {});
    r = await call('GET', '/api/orders/agent/available', B_TEMPO);
    check(!r.body.orders.map(o => o._id).includes(String(o1._id)),
      'a rejected job is never re-offered to that agent');
    r = await call('GET', '/api/orders/agent/available', A_TEMPO);
    check(r.body.orders.map(o => o._id).includes(String(o1._id)),
      'but other agents still see it');

    // ── 4. accept races ────────────────────────────────────────────────
    console.log('\n4. Accept races');
    const o2 = await mkOrder('tempo');
    const race = await Promise.all([A_TEMPO, B_TEMPO].map(uid =>
      call('POST', `/api/orders/${o2._id}/accept`, uid, { lat: 10.85, lng: 79.15 })));
    const won = race.filter(x => x.status === 200);
    const lost = race.filter(x => x.status === 409);
    check(won.length === 1 && lost.length === 1,
      'two agents racing → one accepts, one gets 409', `→ "${lost[0].body.error}"`);
    check(lost[0].body.code === 'ALREADY_TAKEN', 'loser gets a machine-readable code');

    const winnerUid = won[0].body.order.agentUid;
    const loserUid = winnerUid === A_TEMPO ? B_TEMPO : A_TEMPO;
    const accepted = won[0].body.order;
    check(!!accepted.agentName && !!accepted.agentVehicleNumber,
      'accepted order carries driver identity', `→ ${accepted.agentName}, ${accepted.agentVehicleNumber}`);

    const o3 = await mkOrder('tempo');
    r = await call('POST', `/api/orders/${o3._id}/accept`, winnerUid, {});
    check(r.status === 409 && r.body.code === 'ALREADY_BUSY',
      'a busy agent cannot take a second job', `→ "${r.body.error}"`);

    r = await call('GET', '/api/orders/agent/available', winnerUid);
    check(r.body.busy === true && r.body.orders.length === 0, 'busy agent is offered nothing');

    const o4 = await mkOrder('truck');
    r = await call('POST', `/api/orders/${o4._id}/accept`, loserUid, {});
    check(r.status === 409, 'tempo agent cannot claim a truck job');

    // ── 5. handover ────────────────────────────────────────────────────
    console.log('\n5. OTP handover');
    const full = await Order.findById(o2._id).lean();
    r = await call('GET', `/api/orders/agent/current`, winnerUid);
    check(r.body.order && r.body.order.pickupOtp === undefined && r.body.order.dropOtp === undefined,
      'the agent never receives either code');

    r = await call('POST', `/api/orders/${o2._id}/pickup`, winnerUid, { otp: '0000' });
    check(r.status === 400, 'wrong pickup code rejected', `→ "${r.body.error}"`);
    r = await call('POST', `/api/orders/${o2._id}/pickup`, loserUid, { otp: full.pickupOtp });
    check(r.status === 400, 'another agent cannot collect your job');
    r = await call('POST', `/api/orders/${o2._id}/deliver`, winnerUid, { otp: full.dropOtp });
    check(r.status === 400, 'cannot deliver before collecting');

    r = await call('POST', `/api/orders/${o2._id}/pickup`, winnerUid, { otp: full.pickupOtp });
    check(r.status === 200 && r.body.order.status === 'picked_up',
      'correct pickup code → picked_up', `→ code ${full.pickupOtp}`);

    r = await call('POST', `/api/orders/${o2._id}/deliver`, winnerUid, { otp: '9999' });
    check(r.status === 400, 'wrong delivery code rejected');
    r = await call('POST', `/api/orders/${o2._id}/deliver`, winnerUid, { otp: full.dropOtp });
    check(r.status === 200 && r.body.order.status === 'delivered',
      'correct delivery code → delivered', `→ code ${full.dropOtp}`);
    check(r.body.order.payment.status === 'collected', 'COD marked collected');

    const done = await Order.findById(o2._id).lean();
    check(done.isActiveJob === undefined, 'isActiveJob UNSET, not false', `→ ${JSON.stringify(done.isActiveJob)}`);
    r = await call('POST', `/api/orders/${o3._id}/accept`, winnerUid, {});
    check(r.status === 200, 'delivering frees the agent for the next job');

    // ── 6. what the other parties see ──────────────────────────────────
    console.log('\n6. Vendor + farmer visibility');
    r = await call('GET', '/api/orders/vendor/mine', VENDOR);
    const vo = r.body.orders.find(o => o._id === String(o2._id));
    check(vo.status === 'delivered' && vo.agentName === accepted.agentName,
      'vendor sees the driver and the final status', `→ ${vo.agentName}, ${vo.status}`);
    check(!!vo.dropOtp && vo.pickupOtp === undefined, 'vendor holds only the delivery code');
    r = await call('GET', '/api/orders/farmer/mine', FARMER);
    const fo = r.body.orders.find(o => o._id === String(o2._id));
    check(!!fo.pickupOtp && fo.dropOtp === undefined, 'farmer holds only the pickup code');
    check(fo.agentName === accepted.agentName, 'farmer sees who is collecting', `→ ${fo.agentName}`);

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

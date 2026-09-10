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
const { DISPATCH_WINDOW_MS, dispatchExpiryFrom, DAY_ENDS_HOUR, DAY_STARTS_HOUR } = require(B('services/dispatchWindow'));
const { reachable, locateCaptain, radiusForVehicle } = require(B('services/dispatchReach'));

const TAG = 'PH4TEST_';
const FARMER = TAG+'farmer', VENDOR = TAG+'vendor';
const A_TEMPO = TAG+'agentTempo', B_TEMPO = TAG+'agentTempo2', C_TRUCK = TAG+'agentTruck', D_BARE = TAG+'agentBare';
const NASHIK = { lat: 19.9975, lng: 73.7898 };
const NEARBY = { lat: 20.0500, lng: 73.8100, label: 'Nearby godown' };

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
    location: { city: 'Testville', district: 'Nashik', state: 'Maharashtra', ...NASHIK },
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
        vehicle: { type: 'tempo', number: 'MH 15 AB 1234' }, isOnline: true },
      { firebaseUid: B_TEMPO, name: 'Selvam', email: TAG+'a2@t.com', phone: '9000000011', role: 'agent',
        vehicle: { type: 'tempo', number: 'MH 15 CD 5678' }, isOnline: true },
      { firebaseUid: C_TRUCK, name: 'Raja', email: TAG+'a3@t.com', phone: '9000000012', role: 'agent',
        vehicle: { type: 'truck', number: 'MH 15 EF 9012' }, isOnline: true },
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
    // ⚠️ PHASE 6, B5b — A BIGGER VEHICLE CAN ALWAYS DO A SMALLER JOB.
    // This assertion used to require an EXACT vehicleType match, which is the
    // bug services/dispatchReach.js's vehicleTypesServableBy() was built to
    // fix (reported directly: Nashik truck captains were not seeing jobs their
    // vehicle could plainly carry). A truck SHOULD see a tempo job — the fare
    // stays frozen at the tempo rate; taking it is the captain's own call.
    // What must still hold is the other direction: a SMALLER vehicle must
    // never see a job too big for it.
    r = await call('GET', '/api/orders/agent/available', C_TRUCK);
    check(r.body.orders.map(o => o._id).includes(String(o1._id)),
      'a truck agent IS offered a tempo job — a bigger vehicle can do a smaller job');

    // The other direction still must hold: an auto cannot carry a tempo-sized
    // load, so it must never be offered one.
    const E_AUTO = TAG + 'agentAuto';
    await User.create({ firebaseUid: E_AUTO, name: 'Auto Captain', email: TAG + 'a6@t.com',
      phone: '9000000015', role: 'agent', vehicle: { type: 'auto', number: 'MH 15 IJ 7890' }, isOnline: true });
    r = await call('GET', '/api/orders/agent/available', E_AUTO);
    check(!r.body.orders.map(o => o._id).includes(String(o1._id)),
      'an auto agent is NOT offered a tempo job — a smaller vehicle cannot do a bigger job');

    r = await fetch(`${URL}/api/orders/agent/available?lat=20.06&lng=73.85`, { headers: { 'x-test-uid': A_TEMPO } });
    const feed = (await r.json()).orders.find(o => o._id === String(o1._id));
    check(feed.approachKm != null && feed.approachKm > 0,
      'feed carries distance to the pickup', `→ ${feed.approachKm} km away`);
    // ⚠️ CHECKED AGAINST THE ORDER'S OWN STORED EXPIRY, not against a literal
    // and not against the window length either. This asserted `<= 300` (the old
    // five-minute window); bounding it by DISPATCH_WINDOW_MS instead is still
    // wrong, because a job created after the working day defers to 10:00 the
    // next morning and is legitimately ~14 h out. The property worth testing is
    // that the countdown DESCRIBES the stored deadline — which is what a
    // captain is reading it as.
    const stored = await Order.findById(o1._id).lean();
    const wantSec = Math.round((new Date(stored.dispatchExpiresAt) - Date.now()) / 1000);
    check(feed.expiresInSec > 0 && Math.abs(feed.expiresInSec - wantSec) <= 5,
      'the countdown matches the deadline actually stored on the order',
      `→ ${feed.expiresInSec}s, expires ${new Date(stored.dispatchExpiresAt).toTimeString().slice(0, 5)}`);
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
      call('POST', `/api/orders/${o2._id}/accept`, uid, { lat: 20.05, lng: 73.82 })));
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

    r = await call('POST', `/api/orders/${o2._id}/pickup`, winnerUid, { otp: '0000', weightMethod: 'estimated' });
    check(r.status === 400, 'wrong pickup code rejected', `→ "${r.body.error}"`);
    r = await call('POST', `/api/orders/${o2._id}/pickup`, loserUid, { otp: full.pickupOtp, weightMethod: 'estimated' });
    check(r.status === 400, 'another agent cannot collect your job');
    r = await call('POST', `/api/orders/${o2._id}/deliver`, winnerUid, { otp: full.dropOtp });
    check(r.status === 400, 'cannot deliver before collecting');

    r = await call('POST', `/api/orders/${o2._id}/pickup`, winnerUid, { otp: full.pickupOtp, weightMethod: 'estimated' });
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


    // ── 7. THE DISPATCH WINDOW ─────────────────────────────────────────
    console.log('\n7. Dispatch window (4 hours, clipped to the working day)');
    check(DISPATCH_WINDOW_MS === 4 * 60 * 60 * 1000,
      'the window is four hours', `→ ${DISPATCH_WINDOW_MS / 3600000}h`);

    const at = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
    const morning = dispatchExpiryFrom(at(7));
    check(!morning.clipped && (morning.expiresAt - at(7)) === DISPATCH_WINDOW_MS,
      'a morning job gets the full four hours', `→ expires ${morning.expiresAt.getHours()}:00`);

    const evening = dispatchExpiryFrom(at(17));
    check(evening.clipped && evening.expiresAt.getHours() === DAY_ENDS_HOUR,
      'a late-afternoon job is clipped to the end of the working day',
      `→ expires ${evening.expiresAt.getHours()}:00, not ${(17 + 4)}:00`);
    check(!!evening.reason, 'and it SAYS it was clipped rather than showing a short countdown');

    const night = dispatchExpiryFrom(at(21));
    check(night.expiresAt > at(21) && night.expiresAt.getHours() === DAY_STARTS_HOUR + 4,
      'a job posted at night waits for the morning instead of expiring in the dark',
      `→ expires ${night.expiresAt.getHours()}:00 next day`);

    const predawn = dispatchExpiryFrom(at(2));
    check(predawn.clipped && predawn.expiresAt.getHours() === DAY_STARTS_HOUR + 4,
      'a pre-dawn job starts its clock at first light', `→ expires ${predawn.expiresAt.getHours()}:00`);

    const tooLate = dispatchExpiryFrom(at(DAY_ENDS_HOUR - 1, 50));
    check(tooLate.tooLate === true,
      'ten minutes before the cutoff is reported as too late to be taken today');

    // A real order must actually CARRY a window from that function.
    const o7 = await mkOrder('tempo');
    const fresh = await Order.findById(o7._id).lean();
    // ⚠️ Compared against what the FUNCTION says for that creation time, not
    // against a bare `<= 4h`. An order written after the working day expires at
    // 10:00 the next morning, so the elapsed span is ~14 h — correct, and a
    // flat four-hour bound would fail this suite every evening for a reason
    // that has nothing to do with the code. (First run of this test did exactly
    // that at 19:30.)
    const want = dispatchExpiryFrom(new Date(fresh.createdAt)).expiresAt;
    check(Math.abs(new Date(fresh.dispatchExpiresAt) - want) < 2000,
      'a real order is written with the window the shared function computes',
      `→ ${new Date(fresh.dispatchExpiresAt).toTimeString().slice(0, 5)}`);

    // ── 8. RADIUS — SCAN FIRST, FILTER SECOND ──────────────────────────
    console.log('\n8. Radius filtering');
    check(radiusForVehicle('auto') < radiusForVehicle('tempo')
       && radiusForVehicle('tempo') < radiusForVehicle('truck'),
      'a bigger vehicle will drive further to a pickup, and the radius says so',
      `→ auto ${radiusForVehicle('auto')} / tempo ${radiusForVehicle('tempo')} / truck ${radiusForVehicle('truck')} km`);

    // A captain standing in Nagpur is offered nothing in Nashik — the defect
    // this replaces returned the twenty OLDEST jobs in the state and only then
    // sorted them by distance, so the nearest job was often never in the query.
    // ⚠️ A DEDICATED FREE CAPTAIN. A_TEMPO is holding a job by this point (§5
    // accepts one), and a busy captain's feed short-circuits to
    // `{ orders: [], busy: true }` with no `reach` at all — so asserting "not
    // offered a distant job" against them passes VACUOUSLY, proving nothing.
    // The first run of this section did exactly that.
    const E_FREE = TAG + 'agentFree';
    await User.create({ firebaseUid: E_FREE, name: 'Kailas', email: TAG + 'a5@t.com',
      phone: '9000000014', role: 'agent', vehicle: { type: 'tempo', number: 'MH 15 GH 3456' }, isOnline: true });
    r = await call('GET', '/api/orders/agent/available', E_FREE);
    check(r.body.busy !== true, 'the radius fixture captain is genuinely free', `→ busy: ${r.body.busy}`);

    const NAGPUR = { lat: 21.1458, lng: 79.0882 };
    r = await fetch(`${URL}/api/orders/agent/available?lat=${NAGPUR.lat}&lng=${NAGPUR.lng}`,
      { headers: { 'x-test-uid': E_FREE } });
    const far = await r.json();
    check(!far.orders.some((o) => o._id === String(o7._id)),
      'a Nagpur captain is NOT offered a Nashik pickup');
    check(far.reach && far.reach.mode === 'radius',
      'the feed says how it filtered', `→ ${far.reach && far.reach.mode}, ${far.reach && far.reach.radiusKm} km`);
    check(far.reach.beyondRadius && far.reach.beyondRadius.nearestKm > 100,
      'and reports that work EXISTS further out, with how far — an empty list alone reads as "the app is dead"',
      `→ ${far.reach.beyondRadius && far.reach.beyondRadius.count} job(s), nearest ~${far.reach.beyondRadius && far.reach.beyondRadius.nearestKm} km`);

    r = await fetch(`${URL}/api/orders/agent/available?lat=${NASHIK.lat}&lng=${NASHIK.lng}`,
      { headers: { 'x-test-uid': E_FREE } });
    const near = await r.json();
    check(near.orders.some((o) => o._id === String(o7._id)),
      'the same captain standing in Nashik IS offered it');

    // ── 9. FALLBACKS WHEN THERE IS NO FIX ──────────────────────────────
    console.log('\n9. District fallback and the unfiltered case');
    const mkStop = (district) => ({ pickup: { lat: NASHIK.lat, lng: NASHIK.lng, district } });

    // ⚠️ The renamed districts. A captain whose profile still says the OLD name
    // must match pickups written with the NEW one, or their feed is empty with
    // nothing to explain it.
    for (const [profileName, pickupName] of [
      ['Aurangabad', 'Chhatrapati Sambhajinagar'],
      ['Osmanabad', 'Dharashiv'],
      ['Ahmednagar', 'Ahilyanagar'],
    ]) {
      const me = locateCaptain({ query: {}, profile: { location: { district: profileName } } });
      const out = reachable({ items: [mkStop(pickupName)], pickupOf: (i) => i.pickup, me, vehicleType: 'tempo' });
      check(out.reach.mode === 'district' && out.items.length === 1,
        `a captain in "${profileName}" matches a pickup in "${pickupName}"`);
    }

    const noneMe = locateCaptain({ query: {}, profile: {} });
    const noneOut = reachable({ items: [mkStop('Nashik')], pickupOf: (i) => i.pickup, me: noneMe, vehicleType: 'tempo' });
    check(noneOut.reach.mode === 'unfiltered' && noneOut.items.length === 1,
      'with no position and no district the feed is statewide — unchanged behaviour, but NAMED as unfiltered');

    // A job whose pickup has no coordinates is unmeasured, not far away.
    const blindMe = locateCaptain({ query: { lat: NASHIK.lat, lng: NASHIK.lng }, profile: {} });
    const blindOut = reachable({
      items: [{ pickup: { district: 'Nashik' } }], pickupOf: (i) => i.pickup, me: blindMe, vehicleType: 'tempo',
    });
    check(blindOut.items.length === 1 && blindOut.items[0].approachKm === null,
      'a pickup with no coordinates is KEPT with a null distance, never silently dropped');

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

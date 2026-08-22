// Phase 3 test: ordering, fares, and every concurrency guard.
//   node scripts/testOrders.js
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

const TAG = 'PH3TEST_';
const FARMER = TAG + 'farmer', VENDOR = TAG + 'vendor', VENDOR2 = TAG + 'vendor2';
const THANJAVUR = { lat: 10.7870, lng: 79.1378 };
const NEARBY    = { lat: 10.8400, lng: 79.1500, label: 'Nearby godown' };   // ~6 km
const TRICHY    = { lat: 10.7905, lng: 78.7047, label: 'Trichy market' };   // ~65 km road

let pass = 0, fail = 0;
const check = (c, m, x='') => { c ? (pass++, console.log('  ✅', m, x)) : (fail++, console.log('  ❌', m, x)); };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require(B('routes/orders')));
  const server = app.listen(5124);
  const URL = 'http://127.0.0.1:5124';

  const call = async (method, p, uid, body) => {
    const r = await fetch(URL + p, {
      method,
      headers: { 'x-test-uid': uid, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };

  const mkListing = (over = {}) => CropListing.create({
    cropId: new mongoose.Types.ObjectId(), farmerUid: FARMER,
    farmerName: 'Test Farmer', farmerPhone: '9000000001',
    cropName: TAG + 'Paddy', quantityKg: 500, quantityAvailableKg: 500,
    minOrderKg: 25, pricePerKg: 30, totalPrice: 15000,
    location: { city: 'Testville', district: 'Thanjavur', state: 'Tamil Nadu', ...THANJAVUR },
    status: 'available', ...over,
  });

  try {
    await User.create([
      { firebaseUid: FARMER,  name: 'Test Farmer', email: TAG+'f@t.com', phone: '9000000001', role: 'farmer' },
      { firebaseUid: VENDOR,  name: 'Test Vendor', email: TAG+'v@t.com', phone: '9000000002', role: 'vendor' },
      { firebaseUid: VENDOR2, name: 'Rival Vendor', email: TAG+'v2@t.com', phone: '9000000003', role: 'vendor' },
    ]);

    // ── 1. quote ───────────────────────────────────────────────────────
    console.log('\n1. POST /api/orders/quote  (fare rules)');
    let L = await mkListing();
    let r = await call('POST', '/api/orders/quote', VENDOR, { listingId: L._id, quantityKg: 200, dropoff: NEARBY });
    check(r.status === 200, 'quote returns', `→ ${r.body.quote?.distanceKm} km via ${r.body.quote?.routeSource}`);
    let v = Object.fromEntries(r.body.quote.vehicles.map(x => [x.type, x]));
    check(v.auto.ok, 'auto available at 6 km / 200 kg', `→ ₹${v.auto.fare?.total}`);
    check(v.auto.fare.total < v.tempo.fare.total, 'auto cheaper than tempo');

    r = await call('POST', '/api/orders/quote', VENDOR, { listingId: L._id, quantityKg: 200, dropoff: TRICHY });
    v = Object.fromEntries(r.body.quote.vehicles.map(x => [x.type, x]));
    check(!v.auto.ok && /20 km/.test(v.auto.reason), 'auto blocked over 20 km', `→ "${v.auto.reason}"`);
    check(v.tempo.ok && v.truck.ok, 'tempo + truck fine at 65 km');

    r = await call('POST', '/api/orders/quote', VENDOR, { listingId: L._id, quantityKg: 400, dropoff: NEARBY });
    v = Object.fromEntries(r.body.quote.vehicles.map(x => [x.type, x]));
    check(!v.auto.ok && /300 kg/.test(v.auto.reason), 'auto blocked over capacity', `→ "${v.auto.reason}"`);

    r = await call('POST', '/api/orders/quote', VENDOR, { listingId: L._id, quantityKg: 10, dropoff: NEARBY });
    check(r.status === 400, 'quote rejects below minimum order', `→ ${r.status}`);
    r = await call('POST', '/api/orders/quote', FARMER, { listingId: L._id, quantityKg: 200, dropoff: NEARBY });
    check(r.status === 403, 'farmer cannot request a vendor quote');

    // ── 2. create ──────────────────────────────────────────────────────
    console.log('\n2. POST /api/orders  (purchase)');
    r = await call('POST', '/api/orders', VENDOR, { listingId: L._id, quantityKg: 200, vehicleType: 'auto', dropoff: NEARBY });
    check(r.status === 201, 'order created', `→ ₹${r.body.order?.grandTotal} (crop ₹${r.body.order?.cropTotal} + fare ₹${r.body.order?.fare?.total})`);
    const order = r.body.order;
    check(order.status === 'awaiting_agent' && !!order.dispatchExpiresAt, 'starts awaiting_agent');
    check(/^\d{4}$/.test(order.pickupOtp) && /^\d{4}$/.test(order.dropOtp) && order.pickupOtp !== order.dropOtp,
      'distinct 4-digit handover codes', `→ pickup ${order.pickupOtp}, drop ${order.dropOtp}`);
    check(order.routePolyline.length > 1, 'route polyline stored', `→ ${order.routePolyline.length} points`);
    L = await CropListing.findById(L._id).lean();
    check(L.quantityAvailableKg === 300, 'stock decremented', `→ 500 → ${L.quantityAvailableKg} kg`);

    r = await call('POST', '/api/orders', VENDOR, { listingId: L._id, quantityKg: 250, vehicleType: 'auto', dropoff: TRICHY });
    check(r.status === 400 && /20 km/.test(r.body.error), 'server rejects auto over 20 km even if client asks', `→ "${r.body.error}"`);
    L = await CropListing.findById(L._id).lean();
    check(L.quantityAvailableKg === 300, 'rejected order did not touch stock');

    // ── 3. oversell race ───────────────────────────────────────────────
    console.log('\n3. Concurrency: two vendors, one stock');
    let R = await mkListing({ quantityAvailableKg: 100, minOrderKg: 10 });
    // Six simultaneous 40 kg buys against 100 kg — only two can win.
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) =>
      call('POST', '/api/orders', i % 2 ? VENDOR : VENDOR2,
        { listingId: R._id, quantityKg: 40, vehicleType: 'tempo', dropoff: NEARBY })));
    const won = results.filter(x => x.status === 201).length;
    const lost = results.filter(x => x.status === 409).length;
    R = await CropListing.findById(R._id).lean();
    check(won === 2 && lost === 4, 'exactly 2 of 6 concurrent buys succeed', `→ ${won} created, ${lost} rejected 409`);
    check(R.quantityAvailableKg === 20, 'no overselling', `→ 100 − 80 = ${R.quantityAvailableKg} kg`);
    check(R.status === 'available', '20 kg left over a 10 kg minimum stays on the market', `→ ${R.quantityAvailableKg} kg, ${R.status}`);

    // ── 4. dead-stock rule ─────────────────────────────────────────────
    console.log('\n4. Dead stock');
    let D = await mkListing({ quantityAvailableKg: 100, minOrderKg: 40 });
    await call('POST', '/api/orders', VENDOR, { listingId: D._id, quantityKg: 70, vehicleType: 'tempo', dropoff: NEARBY });
    D = await CropListing.findById(D._id).lean();
    check(D.quantityAvailableKg === 30 && D.status === 'sold_out',
      '30 kg left under a 40 kg minimum → sold_out', `→ ${D.quantityAvailableKg} kg, ${D.status}`);
    r = await call('POST', '/api/orders', VENDOR2, { listingId: D._id, quantityKg: 30, vehicleType: 'tempo', dropoff: NEARBY });
    check(r.status === 409, 'retired listing cannot be bought');

    // ── 5. idempotency ─────────────────────────────────────────────────
    console.log('\n5. Double-tap protection');
    let I = await mkListing();
    const key = TAG + 'idem-1';
    const [a, b] = await Promise.all([
      call('POST', '/api/orders', VENDOR, { listingId: I._id, quantityKg: 50, vehicleType: 'tempo', dropoff: NEARBY, idempotencyKey: key }),
      call('POST', '/api/orders', VENDOR, { listingId: I._id, quantityKg: 50, vehicleType: 'tempo', dropoff: NEARBY, idempotencyKey: key }),
    ]);
    const made = await Order.countDocuments({ idempotencyKey: key });
    I = await CropListing.findById(I._id).lean();
    check(made === 1, 'double submit creates ONE order', `→ ${made}`);
    check(I.quantityAvailableKg === 450, 'stock decremented once', `→ ${I.quantityAvailableKg} kg`);
    check([a.status, b.status].every(s => s === 200 || s === 201), 'both callers get a success', `→ ${a.status}, ${b.status}`);

    // ── 6. cancel + restock ────────────────────────────────────────────
    console.log('\n6. Cancel, restock, revive');
    let C = await mkListing({ quantityAvailableKg: 60, minOrderKg: 50 });
    r = await call('POST', '/api/orders', VENDOR, { listingId: C._id, quantityKg: 55, vehicleType: 'tempo', dropoff: NEARBY });
    const co = r.body.order;
    C = await CropListing.findById(C._id).lean();
    check(C.status === 'sold_out', 'listing retired after purchase', `→ ${C.quantityAvailableKg} kg left`);

    r = await call('POST', `/api/orders/${co._id}/cancel`, VENDOR2, {});
    check(r.status === 409, 'another vendor cannot cancel your order');
    r = await call('POST', `/api/orders/${co._id}/cancel`, VENDOR, {});
    check(r.status === 200 && r.body.order.status === 'cancelled', 'vendor cancels');
    C = await CropListing.findById(C._id).lean();
    check(C.quantityAvailableKg === 60 && C.status === 'available',
      'stock restored and listing back on the market', `→ ${C.quantityAvailableKg} kg, ${C.status}`);

    // ── 7. expiry + retry ──────────────────────────────────────────────
    console.log('\n7. Dispatch expiry');
    let E = await mkListing();
    r = await call('POST', '/api/orders', VENDOR, { listingId: E._id, quantityKg: 60, vehicleType: 'tempo', dropoff: NEARBY });
    const eo = r.body.order;
    await Order.updateOne({ _id: eo._id }, { $set: { dispatchExpiresAt: new Date(Date.now() - 1000) } });
    r = await call('GET', '/api/orders/vendor/mine', VENDOR);
    const swept = r.body.orders.find(o => o._id === String(eo._id));
    check(swept.status === 'no_agents', 'lapsed dispatch swept to no_agents');
    E = await CropListing.findById(E._id).lean();
    check(E.quantityAvailableKg === 440, 'expiry does NOT restock — the purchase stands', `→ ${E.quantityAvailableKg} kg`);
    r = await call('POST', `/api/orders/${eo._id}/retry`, VENDOR, {});
    check(r.status === 200 && r.body.order.status === 'awaiting_agent', 'vendor re-dispatches');

    // ── 8. visibility ──────────────────────────────────────────────────
    console.log('\n8. Who sees what');
    r = await call('GET', '/api/orders/vendor/mine', VENDOR);
    check(r.body.orders.every(o => o.pickupOtp === undefined), 'vendor list never carries the pickup code');
    r = await call('GET', '/api/orders/farmer/mine', FARMER);
    check(r.status === 200 && r.body.orders.length > 0, 'farmer sees incoming pickups', `→ ${r.body.orders.length}`);
    check(r.body.orders.every(o => o.dropOtp === undefined), 'farmer never sees the drop code');
    check(r.body.orders.every(o => /^\d{4}$/.test(o.pickupOtp)), 'farmer DOES get the pickup code');
    r = await call('GET', `/api/orders/${order._id}`, VENDOR2);
    check(r.status === 403, 'a stranger cannot read someone else\'s order');
    r = await call('GET', `/api/orders/${order._id}`, FARMER);
    check(r.status === 200 && r.body.order.dropOtp === undefined && !!r.body.order.pickupOtp,
      'farmer detail shows pickup code only');

    // ── 9. the one-active-job-per-agent guard ──────────────────────────
    // Phase 4's accept route relies on this index, so prove it exists now.
    // A read-then-check would be TOCTOU-unsafe across documents; only a
    // unique partial index actually stops one agent holding two jobs.
    console.log('\n9. One active job per agent (DB-enforced)');
    const AGENT = TAG + 'agent';
    let A1 = await mkListing(), A2 = await mkListing();
    const o1 = (await call('POST', '/api/orders', VENDOR, { listingId: A1._id, quantityKg: 50, vehicleType: 'tempo', dropoff: NEARBY })).body.order;
    const o2 = (await call('POST', '/api/orders', VENDOR, { listingId: A2._id, quantityKg: 50, vehicleType: 'tempo', dropoff: NEARBY })).body.order;

    const claim = (id) => Order.findOneAndUpdate(
      { _id: id, status: 'awaiting_agent', agentUid: null },
      { $set: { status: 'accepted', isActiveJob: true, agentUid: AGENT, acceptedAt: new Date() } },
      { new: true });

    const first = await claim(o1._id);
    check(!!first && first.agentUid === AGENT, 'agent claims their first job');

    let blocked = false;
    try { await claim(o2._id); } catch (e) { blocked = e.code === 11000; }
    check(blocked, 'the SAME agent cannot claim a second job', '→ E11000 from oneActiveJobPerAgent');

    // Finishing the first job must release the agent.
    await Order.updateOne({ _id: o1._id }, { $set: { status: 'delivered' }, $unset: { isActiveJob: '' } });
    let freed = false;
    try { freed = !!(await claim(o2._id)); } catch { freed = false; }
    check(freed, 'delivering releases the agent for the next job');

    // Two agents racing the SAME order: the status filter decides.
    let R2 = await mkListing();
    const o3 = (await call('POST', '/api/orders', VENDOR, { listingId: R2._id, quantityKg: 50, vehicleType: 'tempo', dropoff: NEARBY })).body.order;
    const race = await Promise.allSettled([TAG+'agentA', TAG+'agentB'].map(uid =>
      Order.findOneAndUpdate(
        { _id: o3._id, status: 'awaiting_agent', agentUid: null },
        { $set: { status: 'accepted', isActiveJob: true, agentUid: uid, acceptedAt: new Date() } },
        { new: true })));
    const winners = race.filter(r => r.status === 'fulfilled' && r.value).length;
    check(winners === 1, 'two agents racing one order → exactly one wins', `→ ${winners}`);

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    await Promise.all([
      User.deleteMany({ firebaseUid: new RegExp('^' + TAG) }),
      CropListing.deleteMany({ farmerUid: new RegExp('^' + TAG) }),
      Order.deleteMany({ $or: [{ farmerUid: new RegExp('^' + TAG) }, { agentUid: new RegExp('^' + TAG) }] }),
    ]);
    console.log('\n🧹 test data removed');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

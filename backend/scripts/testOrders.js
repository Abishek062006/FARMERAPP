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
const Offer = require(B('models/Offer'));
const Order = require(B('models/Order'));
const Consignment = require(B('models/Consignment'));

const TAG = 'PH3TEST_';
const FARMER = TAG + 'farmer', VENDOR = TAG + 'vendor', VENDOR2 = TAG + 'vendor2';
const FARMER2 = TAG + 'farmer2';   // proves one farmer cannot settle another's sale
const NASHIK = { lat: 19.9975, lng: 73.7898 };
const NEARBY    = { lat: 20.0500, lng: 73.8100, label: 'Nearby godown' };   // ~6 km
const LASALGAON = { lat: 20.1417, lng: 74.2417, label: 'Lasalgaon mandi' }; // ~55 km road

let pass = 0, fail = 0;
const check = (c, m, x='') => { c ? (pass++, console.log('  ✅', m, x)) : (fail++, console.log('  ❌', m, x)); };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require(B('routes/orders')));
  app.use('/api/offers', require(B('routes/offers')));
  // Mounted for section 9b only: `isActiveJob` is unique per agent inside
  // Order and inside Consignment, but no index spans the two collections, so
  // the constraint that a captain holds ONE job has to be proved across both.
  app.use('/api/consignments', require(B('routes/consignments')));
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
    location: { city: 'Testville', district: 'Nashik', state: 'Maharashtra', ...NASHIK },
    status: 'available', ...over,
  });

  try {
    await User.create([
      { firebaseUid: FARMER,  name: 'Test Farmer', email: TAG+'f@t.com', phone: '9000000001', role: 'farmer' },
      { firebaseUid: VENDOR,  name: 'Test Vendor', email: TAG+'v@t.com', phone: '9000000002', role: 'vendor' },
      { firebaseUid: VENDOR2, name: 'Rival Vendor', email: TAG+'v2@t.com', phone: '9000000003', role: 'vendor' },
      { firebaseUid: FARMER2, name: 'Other Farmer', email: TAG+'f2@t.com', phone: '9000000004', role: 'farmer' },
    ]);

    // ── 1. quote ───────────────────────────────────────────────────────
    console.log('\n1. POST /api/orders/quote  (fare rules)');
    let L = await mkListing();
    let r = await call('POST', '/api/orders/quote', VENDOR, { listingId: L._id, quantityKg: 200, dropoff: NEARBY });
    check(r.status === 200, 'quote returns', `→ ${r.body.quote?.distanceKm} km via ${r.body.quote?.routeSource}`);
    let v = Object.fromEntries(r.body.quote.vehicles.map(x => [x.type, x]));
    check(v.auto.ok, 'auto available at 6 km / 200 kg', `→ ₹${v.auto.fare?.total}`);
    check(v.auto.fare.total < v.tempo.fare.total, 'auto cheaper than tempo');

    r = await call('POST', '/api/orders/quote', VENDOR, { listingId: L._id, quantityKg: 200, dropoff: LASALGAON });
    v = Object.fromEntries(r.body.quote.vehicles.map(x => [x.type, x]));
    check(!v.auto.ok && /20 km/.test(v.auto.reason), 'auto blocked over 20 km', `→ "${v.auto.reason}"`);
    check(v.tempo.ok && v.truck.ok, 'tempo + truck fine at 55 km');

    // ── the return leg ────────────────────────────────────────────────
    // An agent drives the load out AND drives home empty. Charging only the
    // loaded leg made revenue per kilometre ACTUALLY driven FALL as trips got
    // longer, so the longest hauls lost the most money. These assert the
    // economics directly rather than the fare number, so they stay meaningful
    // if the rate card is ever repriced.
    {
      const { quote: fq, RETURN_LEG_THRESHOLD_KM: TH } = require('../services/fareService');
      const RUNNING_COST = { auto: 8, tempo: 18, truck: 30 };   // ₹/km, low end

      const short = fq('tempo', TH - 10, 500);
      check(short.fare.returnCharge === 0,
        `no return charge under ${TH} km — the agent can find another job nearby`,
        `→ ₹${short.fare.returnCharge}`);

      // No CLIFF at the threshold: one extra kilometre must not cost a fortune.
      const at = fq('tempo', TH, 500), just = fq('tempo', TH + 1, 500);
      check(just.fare.total - at.fare.total < at.fare.perKm * 2,
        'crossing the threshold does not jump the fare',
        `→ ₹${at.fare.total} at ${TH} km vs ₹${just.fare.total} at ${TH + 1} km`);

      // The invariant that actually matters, swept across the whole range.
      let worst = null;
      for (const [type, cost] of Object.entries(RUNNING_COST)) {
        for (let km = 5; km <= 300; km += 5) {
          const q = fq(type, km, 100);
          if (!q.ok) continue;
          const perActualKm = q.fare.total / (2 * km);   // out loaded, home empty
          const margin = perActualKm - cost;
          if (!worst || margin < worst.margin) worst = { type, km, perActualKm, cost, margin };
        }
      }
      check(worst.margin > -0.5,
        'every vehicle and distance clears its running cost on the km ACTUALLY driven',
        `→ worst: ${worst.type} at ${worst.km} km earns ₹${worst.perActualKm.toFixed(2)}/km vs ₹${worst.cost}/km cost`);

      // Long hauls must not be the worst-paid. This is the bug that existed.
      const near = fq('tempo', 50, 500).fare.total / 100;
      const far  = fq('tempo', 200, 500).fare.total / 400;
      check(far >= near,
        'a long haul is not paid WORSE per km than a short one',
        `→ 50 km ₹${near.toFixed(2)}/km, 200 km ₹${far.toFixed(2)}/km`);

      // The return leg is ONE drive home, not one per stop — this is what makes
      // pooling cheaper than separate trips. Billing it against the winding
      // multi-stop route made a shared run cost MORE than three separate ones.
      const pooled = fq('tempo', 95, 1500, { returnDistanceKm: 60 });
      const solo = fq('tempo', 60, 500);
      check(pooled.fare.total < 3 * solo.fare.total,
        'a pooled run still beats three separate trips once the return leg is priced',
        `→ ₹${pooled.fare.total} shared vs ₹${3 * solo.fare.total} separate`);
      check(pooled.fare.returnKm === Math.max(0, 60 - TH),
        'the pooled return is measured drop-off→farms, not along the loaded route',
        `→ ${pooled.fare.returnKm} km charged, not ${Math.max(0, 95 - TH)}`);
    }

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

    r = await call('POST', '/api/orders', VENDOR, { listingId: L._id, quantityKg: 250, vehicleType: 'auto', dropoff: LASALGAON });
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

    // ── 9b. ...and that job may be in EITHER collection ────────────────
    // The two partial unique indexes above are each correct inside their own
    // collection and neither can see the other: a MongoDB index cannot span
    // collections. So between them they allowed one captain to hold an active
    // single-farmer order AND an active multi-farm consignment at the same
    // time. One driver, one vehicle — physically impossible, and the app was
    // the only thing that could say so. Enforced in
    // services/agentJobService.js at both accept points.
    console.log('\n9b. One active job per agent — ACROSS both collections');
    const CAPTAIN = TAG + 'captain';
    await User.create({
      firebaseUid: CAPTAIN, name: 'Cross Captain', email: TAG + 'cap@t.com',
      phone: '9000000005', role: 'agent', isOnline: true,
      vehicle: { type: 'tempo', number: 'MH 15 XY 9999' },
    });

    // A shared run this captain accepts, built through the real routes.
    const P1 = await mkListing(), P2 = await mkListing();
    const p1 = (await call('POST', '/api/orders', VENDOR, { listingId: P1._id, quantityKg: 60, vehicleType: 'tempo', dropoff: NEARBY })).body.order;
    const p2 = (await call('POST', '/api/orders', VENDOR, { listingId: P2._id, quantityKg: 60, vehicleType: 'tempo', dropoff: NEARBY })).body.order;
    let x = await call('POST', '/api/consignments', VENDOR, {
      orderIds: [String(p1._id), String(p2._id)], vehicleType: 'tempo',
    });
    const RUN = x.body.consignment;
    check(x.status === 201, 'two orders are pooled into one shared run', `→ ${x.status}`);

    // A pooled order must not be claimable on its own — it travels on the run.
    x = await call('POST', `/api/orders/${p1._id}/accept`, CAPTAIN, { lat: 20.0, lng: 73.8 });
    check(x.status === 409,
      'a pooled order cannot be taken as a single pickup — it belongs to the run', `→ ${x.status}`);

    x = await call('POST', `/api/consignments/${RUN._id}/accept`, CAPTAIN, { lat: 20.0, lng: 73.8 });
    check(x.status === 200, 'the captain accepts the shared run', `→ ${x.status}`);

    const SOLO = await mkListing();
    const soloOrder = (await call('POST', '/api/orders', VENDOR, {
      listingId: SOLO._id, quantityKg: 40, vehicleType: 'tempo', dropoff: NEARBY })).body.order;
    x = await call('POST', `/api/orders/${soloOrder._id}/accept`, CAPTAIN, { lat: 20.0, lng: 73.8 });
    check(x.status === 409 && x.body.code === 'ALREADY_ON_JOB'
      && x.body.activeJob?.kind === 'consignment',
      'a captain on a CONSIGNMENT cannot accept a single order — neither index could see this',
      `→ ${x.status} ${x.body.code}`);
    check((await Order.findById(soloOrder._id).lean()).status === 'awaiting_agent',
      'and the refused claim leaves that order free for somebody who can drive it');

    // The other direction.
    await call('POST', `/api/consignments/${RUN._id}/release`, CAPTAIN, { reason: 'other' });
    x = await call('POST', `/api/orders/${soloOrder._id}/accept`, CAPTAIN, { lat: 20.0, lng: 73.8 });
    check(x.status === 200, 'freed, the captain takes the single order', `→ ${x.status}`);
    x = await call('POST', `/api/consignments/${RUN._id}/accept`, CAPTAIN, { lat: 20.0, lng: 73.8 });
    check(x.status === 409 && x.body.activeJob?.kind === 'order',
      '...and now cannot accept the shared run — the constraint holds both ways',
      `→ ${x.status} ${x.body.code} (holding ${x.body.activeJob?.kind})`);
    check((await Consignment.findById(RUN._id).lean()).status === 'awaiting_agent',
      'the run stays in the pool rather than being half-claimed by a busy captain');

    // ── 10. farmer payout and settlement (B1) ─────────────────────────
    // The defect this covers: grandTotal was cropTotal + fare, the agent was
    // told to collect all of it, and nothing recorded that the farmer was
    // owed anything at all.
    console.log('\n10. Farmer payout & settlement');
    const S = await mkListing();
    const so = (await call('POST', '/api/orders', VENDOR, {
      listingId: S._id, quantityKg: 50, vehicleType: 'tempo', dropoff: NEARBY })).body.order;

    check(so.farmerPayout === so.cropTotal,
      'farmerPayout is set at creation', `→ ₹${so.farmerPayout}`);
    check(so.grandTotal === so.farmerPayout + so.fare.total,
      'grandTotal splits into farmer payout + fare',
      `→ ₹${so.grandTotal} = ₹${so.farmerPayout} + ₹${so.fare.total}`);
    check(so.settlement?.farmerPaid === false, 'a new order starts unsettled');

    // Cannot settle before the crop has left the farm.
    let r10 = await call('POST', `/api/orders/${so._id}/settle`, FARMER, {});
    check(r10.status === 409 && r10.body.code === 'NOT_COLLECTED',
      'cannot mark paid before pickup', `→ ${r10.status} ${r10.body.code}`);

    // A vendor must not be able to mark the farmer's money as paid.
    await Order.updateOne({ _id: so._id }, { $set: { status: 'picked_up' } });
    r10 = await call('POST', `/api/orders/${so._id}/settle`, VENDOR, {});
    check(r10.status === 403, 'a vendor cannot settle on the farmer\'s behalf', `→ ${r10.status}`);

    // Another farmer must not be able to settle someone else's sale.
    r10 = await call('POST', `/api/orders/${so._id}/settle`, FARMER2, {});
    check(r10.status === 404, 'another farmer cannot settle your sale', `→ ${r10.status}`);

    // The owner can.
    r10 = await call('POST', `/api/orders/${so._id}/settle`, FARMER, { method: 'upi' });
    check(r10.status === 200 && r10.body.order.settlement.farmerPaid === true,
      'the farmer marks their payout received', `→ ${r10.body.order?.settlement?.method}`);
    check(!!r10.body.order.settlement.paidAt, 'paidAt is stamped');

    // Idempotent: a second tap must not re-stamp paidAt.
    const firstPaidAt = r10.body.order.settlement.paidAt;
    r10 = await call('POST', `/api/orders/${so._id}/settle`, FARMER, {});
    check(r10.status === 409 && r10.body.code === 'ALREADY_SETTLED',
      'settling twice is rejected, not double-written', `→ ${r10.status} ${r10.body.code}`);
    const after = await Order.findById(so._id).lean();
    check(new Date(after.settlement.paidAt).toISOString() === new Date(firstPaidAt).toISOString(),
      'paidAt never moves after the first settle');

    // ── 11. negotiated price actually reaches the order (C1+C5) ───────
    // Before this, an accepted offer changed nothing: the order was still
    // priced at the listing rate and the whole bargaining loop was decorative.
    console.log('\n11. A negotiated price reaches the order');
    const NL = await mkListing({ pricePerKg: 30 });
    let ro = await call('POST', '/api/offers', VENDOR, {
      listingId: NL._id, quantityKg: 100, offerPricePerKg: 26,
    });
    const negOffer = ro.body.offer;
    await call('PUT', `/api/offers/${negOffer._id}/accept`, FARMER);

    ro = await call('POST', '/api/orders', VENDOR, {
      listingId: NL._id, quantityKg: 100, vehicleType: 'tempo',
      dropoff: NEARBY, offerId: negOffer._id,
    });
    check(ro.status === 201, 'an order books against an accepted offer');
    check(ro.body.order.pricePerKg === 26,
      'THE AGREED PRICE IS USED, not the listing price', `→ ₹${ro.body.order.pricePerKg}`);
    check(ro.body.order.priceSource === 'negotiated', 'and the receipt can say it was negotiated');
    check(ro.body.order.cropTotal === 2600, 'the total follows the agreed price', `→ ₹${ro.body.order.cropTotal}`);
    const spent = await Offer.findById(negOffer._id).lean();
    check(String(spent.orderId) === String(ro.body.order._id), 'the offer is marked spent');

    // The same agreed price must not be spendable twice.
    ro = await call('POST', '/api/orders', VENDOR, {
      listingId: NL._id, quantityKg: 50, vehicleType: 'tempo', dropoff: NEARBY, offerId: negOffer._id,
    });
    check(ro.status === 409 && ro.body.code === 'OFFER_NOT_USABLE',
      'one agreed price cannot be spent twice', `→ ${ro.body.code}`);

    // Nor can a vendor buy at someone else's agreed price.
    const OL = await mkListing({ pricePerKg: 30 });
    ro = await call('POST', '/api/offers', VENDOR, { listingId: OL._id, quantityKg: 50, offerPricePerKg: 20 });
    const otherOffer = ro.body.offer;
    await call('PUT', `/api/offers/${otherOffer._id}/accept`, FARMER);
    ro = await call('POST', '/api/orders', VENDOR2, {
      listingId: OL._id, quantityKg: 50, vehicleType: 'tempo', dropoff: NEARBY, offerId: otherOffer._id,
    });
    check(ro.status === 409, "a vendor cannot use another buyer's agreed price", `→ ${ro.body.code}`);

    // ── 12. receipt and CSV (C5) ──────────────────────────────────────
    console.log('\n12. Transaction records');
    const RL = await mkListing();
    const rOrder = (await call('POST', '/api/orders', VENDOR, {
      listingId: RL._id, quantityKg: 60, vehicleType: 'tempo', dropoff: NEARBY,
    })).body.order;

    let rec = await call('GET', `/api/orders/${rOrder._id}/receipt`, VENDOR);
    check(rec.status === 200, 'a party can fetch the receipt');
    const rcpt = rec.body.receipt;
    check(/^FM-[A-Z0-9]{8}$/.test(rcpt.receiptNo), 'it carries a receipt number', `→ ${rcpt.receiptNo}`);
    check(rcpt.money.grandTotal === rcpt.money.farmerPayout + rcpt.money.fare,
      'the money reconciles: payout + fare = grand total',
      `→ ₹${rcpt.money.farmerPayout} + ₹${rcpt.money.fare} = ₹${rcpt.money.grandTotal}`);
    check(rcpt.money.collectedByAgent === rcpt.money.fare,
      'and it states the agent collects the FARE only', `→ ₹${rcpt.money.collectedByAgent}`);
    check(rcpt.settlement.farmerPaid === false, 'settlement status is on the receipt');
    check(Array.isArray(rcpt.timeline) && rcpt.timeline.length > 0, 'a timeline is included');
    check(rcpt.receiptNo && !JSON.stringify(rcpt).includes('pickupOtp') && !JSON.stringify(rcpt).includes('dropOtp'),
      'OTPs are NEVER on a receipt — it is the most forwarded document');

    rec = await call('GET', `/api/orders/${rOrder._id}/receipt`, FARMER2);
    check(rec.status === 403, 'a non-party cannot read a receipt', `→ ${rec.status}`);

    // CSV
    let csvRes = await fetch(`${URL}/api/orders/export.csv`, { headers: { 'x-test-uid': FARMER } });
    const csvText = await csvRes.text();
    check(csvRes.status === 200, 'the CSV export returns', `→ ${csvRes.status}`);
    check((csvRes.headers.get('content-type') || '').includes('text/csv'), 'with a CSV content type');
    check((csvRes.headers.get('content-disposition') || '').includes('attachment'), 'as an attachment');
    // Read the RAW BYTES: fetch().text() strips a leading UTF-8 BOM per spec,
    // so decoding first would always report it missing even when it is sent.
    const bomBytes = new Uint8Array(
      await (await fetch(`${URL}/api/orders/export.csv`, { headers: { 'x-test-uid': FARMER } })).arrayBuffer()
    ).slice(0, 3);
    check(bomBytes[0] === 0xEF && bomBytes[1] === 0xBB && bomBytes[2] === 0xBF,
      'starting with a UTF-8 BOM so Excel reads Devanagari crop names correctly',
      `→ ${[...bomBytes].map(b => b.toString(16)).join(' ')}`);
    check(csvText.split('\r\n')[0].includes('you_receive'),
      "the farmer's sheet leads with what THEY receive");

    csvRes = await fetch(`${URL}/api/orders/export.csv`, { headers: { 'x-test-uid': VENDOR } });
    const vendorCsv = await csvRes.text();
    check(vendorCsv.split('\r\n')[0].includes('you_pay'),
      "the buyer's sheet leads with what THEY pay");

    // CSV formula injection — a crop name starting with '=' is executable in
    // Excel unless the leading character is neutralised.
    const EVIL = await mkListing({ cropName: '=HYPERLINK("http://evil","click")' });
    await call('POST', '/api/orders', VENDOR, {
      listingId: EVIL._id, quantityKg: 30, vehicleType: 'tempo', dropoff: NEARBY,
    });
    csvRes = await fetch(`${URL}/api/orders/export.csv`, { headers: { 'x-test-uid': VENDOR } });
    const evilCsv = await csvRes.text();
    check(evilCsv.includes('=HYPERLINK'), 'the hostile value is present in the export');
    check(!/(^|,)"?=HYPERLINK/m.test(evilCsv),
      'but it can NEVER start a cell — formula injection is neutralised');
    check(/'=HYPERLINK/.test(evilCsv), 'the leading character is escaped', '→ prefixed with an apostrophe');

    // ══ 14. THE SINGLE-FARMER PICKUP FINALLY RECORDS WHAT HAPPENED ═════
    //
    // ═══ THE GAP THIS CLOSES ═══════════════════════════════════════════
    //
    // `Order.pickupOutcome` has carried a weight block and a grade block since
    // the gate record was built, and the buyer's RECEIPT and purchase list
    // already read and displayed both. But only the multi-farm run ever WROTE
    // them. So every single-farmer pickup — the commonest kind of pickup in
    // this app — produced a receipt saying "Not recorded" against a quantity
    // the buyer was paying for. The display side was honest about a hole the
    // recording side had left open.
    console.log('\n14. The single-farmer pickup records the gate, not just the OTP');

    const PICKER = TAG + 'picker';
    await User.create({
      firebaseUid: PICKER, name: 'Solo Captain', email: TAG + 'pick@t.com',
      phone: '9000000077', role: 'agent',
      vehicle: { type: 'tempo', number: 'MH 15 SP 4242' }, isOnline: true,
    });

    const GL = await mkListing({ grade: { code: 'A', selfDeclared: true } });
    const go = (await call('POST', '/api/orders', VENDOR, {
      listingId: GL._id, quantityKg: 120, vehicleType: 'tempo', dropoff: NEARBY,
    })).body.order;
    await call('POST', `/api/orders/${go._id}/accept`, PICKER, { lat: 20.0, lng: 73.8 });
    const goFull = await Order.findById(go._id).lean();

    // 14a. SILENCE IS WHAT IS REFUSED, and the refusal comes before the OTP.
    let rp = await call('POST', `/api/orders/${go._id}/pickup`, PICKER, { otp: goFull.pickupOtp });
    check(rp.status === 400 && rp.body.code === 'WEIGHT_METHOD_REQUIRED',
      'A PICKUP WITH NO WEIGHING METHOD IS REFUSED — an empty box lets a guess be read as a '
      + 'measurement', `→ ${rp.body.code}`);
    check((rp.body.weightMethods || []).includes('estimated'),
      '..."estimated" is offered as a first-class answer, because most farm gates have no scale',
      `→ ${rp.body.weightMethods?.join(', ')}`);
    check((await Order.findById(go._id).lean()).status === 'accepted',
      'and the order did not move — a malformed request changes nothing');

    rp = await call('POST', `/api/orders/${go._id}/pickup`, PICKER, { weightMethod: 'estimated' });
    check(rp.status === 400 && !rp.body.code,
      'a well-formed request with the WRONG code still gets the wrong-code answer', `→ ${rp.status}`);

    // 14b. ⚠️ A CAPTAIN IS NOT ASKED TO GRADE, ON THIS ROUTE EITHER.
    // requireRole('agent') means the recorder here is ALWAYS a captain from
    // the public pool. Same refusal, same code, same reason as the run path.
    rp = await call('POST', `/api/orders/${go._id}/pickup`, PICKER, {
      otp: goFull.pickupOtp, weightMethod: 'estimated', observedGrade: 'C',
    });
    check(rp.status === 409 && rp.body.code === 'GRADING_NOT_AVAILABLE',
      'A CAPTAIN CANNOT GRADE A SINGLE-FARMER LOT EITHER — the farmer\'s declared grade stands, '
      + 'labelled unchecked, and the buyer judges it on arrival', `→ ${rp.body.code}`);
    check((await Order.findById(go._id).lean()).status === 'accepted',
      'and that refusal did not quietly complete the pickup either');

    // 14c. What a captain CAN record.
    rp = await call('POST', `/api/orders/${go._id}/pickup`, PICKER, {
      otp: goFull.pickupOtp,
      weightMethod: 'public_weighbridge', weightRef: 'WB/2026/1177',
      conditionFlags: ['sprouting'], conditionNote: 'A few sprouted in the top layer.',
    });
    check(rp.status === 200 && rp.body.order.status === 'picked_up',
      'the pickup goes through with its weight and what the captain saw', `→ ${rp.status}`);
    check(rp.body.weight.method === 'public_weighbridge' && rp.body.weight.independent === true,
      'a weighbridge is the ONE method reported as independent — it issues a ticket both sides '
      + 'can produce', `→ ${rp.body.weight.label}`);
    check(rp.body.condition.anyIssue === true && rp.body.condition.flags.includes('sprouting'),
      'and the condition the captain could see is on the record', `→ ${rp.body.condition.flags}`);
    check(rp.body.gradingAvailable === false && /grievance/i.test(rp.body.gradingNote || ''),
      'the response says no grade was asked for, and where a quality dispute goes instead');

    const picked = await Order.findById(go._id).lean();
    check(picked.pickupOutcome.outcome === 'collected_full'
      && picked.pickupOutcome.orderedKg === 120 && picked.pickupOutcome.collectedKg === 120,
      'the ORDER carries the outcome and both quantities — written in ONE atomic update with the '
      + 'status, so it can never sit in picked_up with a half-written record',
      `→ ${picked.pickupOutcome.collectedKg} of ${picked.pickupOutcome.orderedKg} kg`);
    check(picked.pickupOutcome.recordedBy === PICKER && picked.pickupOutcome.recordedByRole === 'agent',
      'naming who keyed it in and under which rule');
    check(picked.pickupOutcome.grade.observed === null
      && picked.pickupOutcome.grade.discrepancy === null,
      '⚠️ AND THE GRADE BLOCK IS EMPTY, NOT A MANUFACTURED MATCH — nobody was asked, so nothing '
      + 'is recorded as confirmed');

    // 14d. The receipt — the document most likely to be forwarded onwards.
    rp = await call('GET', `/api/orders/${go._id}/receipt`, VENDOR);
    check(rp.body.receipt.crop.weight.method === 'public_weighbridge',
      'THE RECEIPT NOW SAYS WHERE THE KILOGRAMS CAME FROM. Before this every single-farmer '
      + 'receipt read "Not recorded"', `→ "${rp.body.receipt.crop.weight.label}"`);
    check(rp.body.receipt.crop.condition.anyIssue === true,
      'and what the lot looked like at the gate');
    check(rp.body.receipt.crop.grade === 'A' && rp.body.receipt.crop.gradeSelfDeclared === true
      && rp.body.receipt.crop.gradeCheck.observed === null,
      "while the farmer's grade stays SELF-DECLARED and unchecked — which is the true state of it",
      `→ declared ${rp.body.receipt.crop.grade}, observed ${rp.body.receipt.crop.gradeCheck.observed}`);

    // 14e. "Nobody looked" is not "looked and saw nothing wrong".
    const QL = await mkListing();
    const qo = (await call('POST', '/api/orders', VENDOR, {
      listingId: QL._id, quantityKg: 40, vehicleType: 'tempo', dropoff: NEARBY,
    })).body.order;
    await Order.updateOne({ _id: go._id }, { $unset: { isActiveJob: '' } });
    await call('POST', `/api/orders/${qo._id}/accept`, PICKER, { lat: 20.0, lng: 73.8 });
    const qoFull = await Order.findById(qo._id).lean();
    rp = await call('POST', `/api/orders/${qo._id}/pickup`, PICKER, {
      otp: qoFull.pickupOtp, weightMethod: 'estimated',
    });
    check(rp.status === 200 && rp.body.condition.checked === false
      && rp.body.condition.lookedAndFoundNothing === false,
      'A PICKUP WHERE NOBODY SAID ANYTHING RECORDS checked=false — not a clean bill of health. '
      + '"Nobody looked" and "looked and saw nothing wrong" are opposite evidence in an argument '
      + 'about a bad lot', `→ checked ${rp.body.condition.checked}`);
    rp = await call('POST', `/api/orders/${qo._id}/pickup`, PICKER, {
      otp: qoFull.pickupOtp, weightMethod: 'estimated', conditionChecked: true,
    });
    check(rp.status === 400,
      'and a second pickup on the same order is refused, so the record cannot be rewritten',
      `→ ${rp.status}`);
    const quiet = await Order.findById(qo._id).lean();
    check(quiet.pickupOutcome.weight.method === 'estimated'
      && quiet.pickupOutcome.condition.checked === false,
      'the stored record keeps the silence exactly as it was given');

    // ══ 15. ADVANCE AND BALANCE ════════════════════════════════════════
    //
    // ═══ THE PROBLEM ═══════════════════════════════════════════════════
    //
    // A farmer handed over a tonne of onion against a RECORD of a promise —
    // they were extending credit to a stranger, and every incentive ran the
    // wrong way once the crop was on the truck.
    //
    // ⚠️ FLIPPING IT DOES NOT FIX IT. "Buyer pays before delivery" moves the
    // whole exposure onto the buyer, who has then paid for produce they have
    // not seen at a grade nobody checked. Making that safe needs escrow, escrow
    // needs a payment rail, and this app deliberately has none.
    //
    // So: an advance at commitment, the balance after delivery. STILL RECORDED,
    // NEVER MOVED — the same rule as every other rupee figure here.
    console.log('\n15. Advance and balance');

    const AL = await mkListing({ pricePerKg: 30 });
    let ra = await call('POST', '/api/orders', VENDOR, {
      listingId: AL._id, quantityKg: 100, vehicleType: 'tempo', dropoff: NEARBY,
      advancePct: 30,
    });
    check(ra.status === 201 || ra.status === 200, 'an order can be placed with an advance', `→ ${ra.status}`);
    const ao = ra.body.order;
    check(ao.settlement.advance.agreedAmount === 900 && ao.settlement.advance.agreedPct === 30,
      '30% of a ₹3,000 crop value is recorded as ₹900 agreed',
      `→ ₹${ao.settlement.advance.agreedAmount} (${ao.settlement.advance.agreedPct}%)`);
    check(!ao.settlement.advance.receivedAt,
      '⚠️ AGREED IS NOT RECEIVED — a buyer promising an advance is not a farmer holding one, and '
      + 'the two are never collapsed into one boolean');
    check(ao.settlement.farmerPaid === false,
      'and an advance does NOT mark the order paid — trustService reads farmerPaid as '
      + '"this farmer has their money"');

    // The exposure, at each stage.
    ra = await call('GET', `/api/orders/${ao._id}/exposure`, FARMER);
    check(ra.status === 200 && ra.body.exposure.stage === 'advance_agreed'
      && ra.body.exposure.buyerAtRisk === 0 && ra.body.exposure.farmerAtRisk === 0,
      'BEFORE the advance arrives NOBODY is exposed — no crop has moved and no money has',
      `→ ${ra.body.exposure.stage}`);
    check(ra.body.exposure.advance.outstanding === 900,
      '...but the unkept promise is its own number, so it does not look like "no advance"',
      `→ ₹${ra.body.exposure.advance.outstanding} outstanding`);

    ra = await call('POST', `/api/orders/${ao._id}/settle-advance`, VENDOR, {});
    check(ra.status === 403,
      'A BUYER CANNOT MARK THEIR OWN ADVANCE AS SENT — only the person it lands with can say it '
      + 'arrived, the same rule that makes /settle farmer-only', `→ ${ra.status}`);
    ra = await call('POST', `/api/orders/${ao._id}/settle-advance`, FARMER2, {});
    check(ra.status === 404, "another farmer cannot record somebody else's advance", `→ ${ra.status}`);

    ra = await call('POST', `/api/orders/${ao._id}/settle-advance`, FARMER, { method: 'upi' });
    check(ra.status === 200 && ra.body.exposure.stage === 'advance_received',
      'the FARMER records that it actually arrived', `→ ${ra.body.exposure?.stage}`);
    check(ra.body.exposure.buyerAtRisk === 900 && ra.body.exposure.farmerAtRisk === 0,
      'and now the BUYER is exposed — their money is out and they hold no produce',
      `→ buyer ₹${ra.body.exposure.buyerAtRisk}, farmer ₹${ra.body.exposure.farmerAtRisk}`);
    check(ra.body.exposure.balanceDue === 2100, 'the balance is what is left', `→ ₹${ra.body.exposure.balanceDue}`);

    ra = await call('POST', `/api/orders/${ao._id}/settle-advance`, FARMER, {});
    check(ra.status === 409 && ra.body.code === 'ADVANCE_ALREADY_RECORDED',
      'recording it twice is refused, not double-written', `→ ${ra.body.code}`);

    // ⚠️ THE WINDOW WHERE BOTH SIDES ARE CARRYING SOMETHING.
    await Order.updateOne({ _id: ao._id }, { $set: { status: 'picked_up' } });
    ra = await call('GET', `/api/orders/${ao._id}/exposure`, VENDOR);
    check(ra.body.exposure.bothExposed === true
      && ra.body.exposure.buyerAtRisk === 900 && ra.body.exposure.farmerAtRisk === 2100,
      'IN TRANSIT BOTH SIDES ARE EXPOSED — the farmer has parted with the crop AND the buyer with '
      + 'the advance, and neither holds what they paid for. A single "who is at risk" flag would '
      + 'hide the riskiest window in the trade',
      `→ buyer ₹${ra.body.exposure.buyerAtRisk} + farmer ₹${ra.body.exposure.farmerAtRisk}`);

    await Order.updateOne({ _id: ao._id }, { $set: { status: 'delivered' } });
    ra = await call('GET', `/api/orders/${ao._id}/exposure`, VENDOR);
    check(ra.body.exposure.buyerAtRisk === 0 && ra.body.exposure.farmerAtRisk === 2100,
      'on delivery the buyer holds the goods so their exposure ends; the farmer still carries the '
      + 'balance', `→ buyer ₹${ra.body.exposure.buyerAtRisk}, farmer ₹${ra.body.exposure.farmerAtRisk}`);

    ra = await call('POST', `/api/orders/${ao._id}/settle`, FARMER, { method: 'upi' });
    check(ra.status === 200 && ra.body.settledWhat === 'full'
      && ra.body.exposure.stage === 'settled',
      '/settle settles the WHOLE trade, not just the balance — which is what farmerPaid has always '
      + 'meant and what every existing query reads it as', `→ ${ra.body.exposure?.stage}`);
    check(ra.body.exposure.buyerAtRisk === 0 && ra.body.exposure.farmerAtRisk === 0,
      'and nobody is exposed any more');

    // ⚠️ AN ADVANCE CAN EXCEED WHAT THE LOT TURNED OUT TO BE WORTH.
    const SL = await mkListing({ pricePerKg: 30 });
    const so2 = (await call('POST', '/api/orders', VENDOR, {
      listingId: SL._id, quantityKg: 100, vehicleType: 'tempo', dropoff: NEARBY, advancePct: 50,
    })).body.order;
    await call('POST', `/api/orders/${so2._id}/settle-advance`, FARMER, {});
    // A short pickup rewrites farmerPayout downward — the consignment route
    // does exactly this — leaving the advance larger than the crop was worth.
    await Order.updateOne({ _id: so2._id }, {
      $set: { status: 'picked_up', quantityKg: 30, cropTotal: 900, farmerPayout: 900 },
    });
    ra = await call('GET', `/api/orders/${so2._id}/exposure`, FARMER);
    check(ra.body.exposure.balanceDue === -600 && ra.body.exposure.overpaid === true,
      'A SHORT PICKUP CAN LEAVE THE FARMER HOLDING THE BUYER\'S MONEY, and the balance is reported '
      + 'NEGATIVE rather than clamped to zero — the same rule as the un-clamped pooling saving and '
      + 'the losing hold', `→ balance ₹${ra.body.exposure.balanceDue}`);
    check(ra.body.exposure.farmerAtRisk === 0 && /holding/i.test(ra.body.exposure.note),
      '...and the farmer is not reported as OWED anything, because they are not',
      `→ "${String(ra.body.exposure.note).slice(0, 70)}…"`);

    // Validation.
    ra = await call('POST', '/api/orders', VENDOR, {
      listingId: (await mkListing())._id, quantityKg: 50, vehicleType: 'tempo', dropoff: NEARBY,
      advancePct: 30, advanceAmount: 500,
    });
    check(ra.status === 400 && ra.body.code === 'ADVANCE_AMBIGUOUS',
      'a percentage AND a rupee amount is two different agreements and is refused', `→ ${ra.body.code}`);
    ra = await call('POST', '/api/orders', VENDOR, {
      listingId: (await mkListing())._id, quantityKg: 50, vehicleType: 'tempo', dropoff: NEARBY,
      advanceAmount: 99999,
    });
    check(ra.status === 400 && ra.body.code === 'ADVANCE_EXCEEDS_PAYOUT',
      'an advance larger than the crop is worth is REFUSED, not silently trimmed — trimming would '
      + 'record an agreement neither party made', `→ ${ra.body.code}`);
    ra = await call('POST', '/api/orders', VENDOR, {
      listingId: (await mkListing())._id, quantityKg: 50, vehicleType: 'tempo', dropoff: NEARBY,
      advancePct: 150,
    });
    check(ra.status === 400 && ra.body.code === 'BAD_ADVANCE', 'and 150% is refused', `→ ${ra.body.code}`);

    // No advance at all is the OLD behaviour, byte for byte.
    const PL = await mkListing();
    const plain = (await call('POST', '/api/orders', VENDOR, {
      listingId: PL._id, quantityKg: 50, vehicleType: 'tempo', dropoff: NEARBY,
    })).body.order;
    check(plain.settlement.advance.agreedAmount === 0 && plain.settlement.farmerPaid === false,
      'AN ORDER WITH NO ADVANCE IS UNCHANGED — zero is the default and nothing about an existing '
      + 'order moves', `→ ₹${plain.settlement.advance.agreedAmount}`);
    ra = await call('POST', `/api/orders/${plain._id}/settle-advance`, FARMER, {});
    check(ra.status === 409 && ra.body.code === 'NO_ADVANCE_AGREED',
      'and there is no advance on it to record', `→ ${ra.body.code}`);
    ra = await call('GET', `/api/orders/${plain._id}/exposure`, FARMER);
    check(ra.body.exposure.stage === 'no_advance' && /carries the whole/i.test(ra.body.exposure.note),
      '...which the exposure names plainly rather than reporting as fine — this IS the problem '
      + 'advances exist to solve', `→ ${ra.body.exposure.stage}`);

    ra = await call('GET', `/api/orders/${plain._id}/exposure`, VENDOR2);
    check(ra.status === 403, 'an unrelated buyer cannot read what is owed on somebody else\'s order',
      `→ ${ra.status}`);

    ra = await call('GET', `/api/orders/${ao._id}/receipt`, VENDOR);
    check(!!ra.body.receipt.exposure && ra.body.receipt.exposure.advance.received === 900,
      'the RECEIPT carries the advance/balance split — it is the document most likely to be '
      + 'forwarded onwards', `→ ₹${ra.body.receipt.exposure?.advance?.received} advance`);
    check(/does not move them/i.test(ra.body.receipt.exposure.disclaimer || ''),
      '...and says in words that this app records payments and does not move them');

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    await Promise.all([
      User.deleteMany({ firebaseUid: new RegExp('^' + TAG) }),
      CropListing.deleteMany({ farmerUid: new RegExp('^' + TAG) }),
      Order.deleteMany({ $or: [{ farmerUid: new RegExp('^' + TAG) }, { agentUid: new RegExp('^' + TAG) }] }),
      Offer.deleteMany({ $or: [{ farmerUid: new RegExp('^' + TAG) }, { vendorUid: new RegExp('^' + TAG) }] }),
      Consignment.deleteMany({ vendorUid: new RegExp('^' + TAG) }),
    ]);
    console.log('\n🧹 test data removed');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

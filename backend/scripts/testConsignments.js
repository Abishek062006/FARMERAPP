// Phase F1 test: multi-farmer lots — one vehicle, several farms.
//   node scripts/testConsignments.js
//
// Runs the REAL routes against the REAL Atlas database, auth stubbed via the
// require cache. Data namespaced "PHF1TEST_" and deleted in the finally block.
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const B = (p) => path.join(__dirname, '..', p);

const authPath = require.resolve(B('middleware/auth.js'));
require.cache[authPath] = {
  id: authPath, filename: authPath, loaded: true,
  exports: {
    requireAuth: (req, res, next) => {
      const uid = req.headers['x-test-uid'];
      if (!uid) return res.status(401).json({ success: false, error: 'Authentication required' });
      req.firebaseUid = uid; req.user = { sub: uid }; next();
    },
  },
};

const express = require('express');
const mongoose = require('mongoose');
const User = require(B('models/User'));
const CropListing = require(B('models/CropListing'));
const Order = require(B('models/Order'));
const Consignment = require(B('models/Consignment'));
const Fpo = require(B('models/Fpo'));
const { getRoute } = require(B('services/routeService'));
const { quote } = require(B('services/fareService'));

const TAG = 'PHF1TEST_';
const VENDOR = TAG + 'vendor', VENDOR2 = TAG + 'vendor2';
const AGENT = TAG + 'agent', AGENT2 = TAG + 'agent2';
const F = [TAG + 'f1', TAG + 'f2', TAG + 'f3'];

// Three farms in the Nashik onion belt, delivering to Lasalgaon mandi.
const FARMS = [
  { lat: 19.9975, lng: 73.7898, label: 'Nashik' },
  { lat: 20.0800, lng: 74.1100, label: 'Niphad' },
  { lat: 20.0424, lng: 74.4894, label: 'Yeola' },
];
const MANDI = { lat: 20.1417, lng: 74.2417, label: 'Lasalgaon mandi', district: 'Nashik' };

let pass = 0, fail = 0;
const check = (cond, m, extra = '') => {
  if (cond) { pass++; console.log('  ✅', m, extra); }
  else { fail++; console.log('  ❌', m, extra); }
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express();
  app.use(express.json());
  app.use('/api/consignments', require(B('routes/consignments')));
  // Mounted so section 7 can assert the thing that matters most about a failed
  // stop: that the farmer CANNOT be recorded as paid for produce that never
  // left the farm. That guard lives in routes/orders.js /settle.
  app.use('/api/orders', require(B('routes/orders')));
  const server = app.listen(5127);
  const URL = 'http://127.0.0.1:5127';

  const call = async (method, p, uid, body) => {
    const r = await fetch(URL + p, {
      method, headers: { 'x-test-uid': uid, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };

  // An order already waiting for a driver, as POST /api/orders would leave it.
  let otpSeq = 1000;

  // The solo fare must be what POST /api/orders would ACTUALLY have charged —
  // real road distance through the real fare table. Hardcoding it made the
  // shared-vs-separate comparison meaningless, because the baseline was
  // invented rather than measured.
  const soloFare = async (from, to, qty) => {
    const r = await getRoute(from, to);
    const q = quote('tempo', r.distanceKm, qty);
    return { fare: q.fare, distanceKm: r.distanceKm, durationMin: r.durationMin };
  };

  const mkOrder = async (i, qty, over = {}) => {
    const drop = over.dropoff || MANDI;
    const solo = await soloFare(FARMS[i], drop, qty);
    return Order.create({
      listingId: new mongoose.Types.ObjectId(), cropId: new mongoose.Types.ObjectId(),
    cropName: TAG + 'Onion', quantityKg: qty, pricePerKg: 30, cropTotal: qty * 30,
    farmerUid: F[i], farmerName: `Farmer${i + 1}`, farmerPhone: '900000000' + i,
    vendorUid: VENDOR, vendorName: 'Buyer', vendorPhone: '9000000009',
    pickup: FARMS[i], dropoff: MANDI,
    vehicleType: 'tempo', distanceKm: solo.distanceKm, durationMin: solo.durationMin,
    fare: solo.fare,
    grandTotal: qty * 30 + solo.fare.total, farmerPayout: qty * 30,
    status: 'awaiting_agent', pickupOtp: String(++otpSeq), dropOtp: '9999',
    ...over,
    });
  };

  console.log('\n🚚 Multi-farmer lots (F1)\n');

  try {
    await User.create([
      { firebaseUid: VENDOR,  name: 'Buyer',  email: TAG + 'v@t.com',  phone: '9000000009', role: 'vendor' },
      { firebaseUid: VENDOR2, name: 'Buyer2', email: TAG + 'v2@t.com', phone: '9000000010', role: 'vendor' },
      { firebaseUid: AGENT,   name: 'Driver', email: TAG + 'a@t.com',  phone: '9000000011', role: 'agent',
        vehicle: { type: 'tempo', number: 'MH 15 AB 1234' }, isOnline: true },
      { firebaseUid: AGENT2,  name: 'Driver2', email: TAG + 'a2@t.com', phone: '9000000012', role: 'agent',
        vehicle: { type: 'tempo', number: 'MH 15 CD 5678' }, isOnline: true },
      ...F.map((uid, i) => ({ firebaseUid: uid, name: `Farmer${i + 1}`,
        email: `${TAG}f${i}@t.com`, phone: '900000000' + i, role: 'farmer' })),
    ]);

    // ── 1. the quote, and the economics ───────────────────────────────
    console.log('1. Quoting a shared run');
    let o = [await mkOrder(0, 400), await mkOrder(1, 500), await mkOrder(2, 600)];
    let ids = o.map((x) => String(x._id));

    let r = await call('POST', '/api/consignments/quote', VENDOR, { orderIds: ids, vehicleType: 'tempo' });
    check(r.status === 200, 'a shared run prices', `→ ${r.status}`);
    const q = r.body.quote;
    check(q.stops === 3, 'three farms on the run', `→ ${q.stops}`);
    check(q.totalQuantityKg === 1500, 'carrying the combined load', `→ ${q.totalQuantityKg} kg`);
    check(q.sharedFare < q.soloFareTotal,
      'ONE vehicle costs less than three separate trips',
      `→ ₹${q.sharedFare} vs ₹${q.soloFareTotal}`);
    check(q.saving > 0 && q.savingPct > 0,
      'and the saving is a measured number, not a claim', `→ ₹${q.saving} (${q.savingPct}%)`);
    check(q.perStop.reduce((a, s) => a + s.fareShare, 0) === q.sharedFare,
      'the per-farm shares sum EXACTLY to the fare charged',
      `→ ${q.perStop.map(s => s.fareShare).join(' + ')} = ₹${q.sharedFare}`);

    // Weight-proportional, not even: the smallest farmer must not subsidise.
    const byQty = [...q.perStop].sort((a, b) => a.quantityKg - b.quantityKg);
    check(byQty[0].fareShare < byQty[byQty.length - 1].fareShare,
      'the smallest load pays the SMALLEST share, not an equal third',
      `→ ${byQty[0].quantityKg}kg pays ₹${byQty[0].fareShare}, ${byQty[byQty.length-1].quantityKg}kg pays ₹${byQty[byQty.length-1].fareShare}`);

    r = await call('POST', '/api/consignments/quote', VENDOR, { orderIds: [ids[0]], vehicleType: 'tempo' });
    check(r.status === 400, 'one order is not a shared trip', `→ ${r.status}`);

    r = await call('POST', '/api/consignments/quote', VENDOR2, { orderIds: ids, vehicleType: 'tempo' });
    check(r.status === 409, "a buyer cannot pool another buyer's orders", `→ ${r.status}`);

    // Different destinations are not one trip.
    const elsewhere = await mkOrder(0, 100, { dropoff: { lat: 21.1458, lng: 79.0882, label: 'Nagpur' } });
    r = await call('POST', '/api/consignments/quote', VENDOR, {
      orderIds: [ids[0], String(elsewhere._id)], vehicleType: 'tempo',
    });
    check(r.status === 400 && r.body.code === 'DIFFERENT_DROPOFFS',
      'orders going to different places cannot share a vehicle', `→ ${r.body.code}`);

    // Capacity is still enforced against the COMBINED load.
    const heavy = [await mkOrder(0, 900), await mkOrder(1, 900)];
    r = await call('POST', '/api/consignments/quote', VENDOR, {
      orderIds: heavy.map((x) => String(x._id)), vehicleType: 'auto',
    });
    check(r.status === 400 && r.body.code === 'VEHICLE_UNSUITABLE',
      'the vehicle is checked against the COMBINED weight', `→ ${r.body.code}`);

    // ── 2. committing it ──────────────────────────────────────────────
    console.log('\n2. Committing the run');
    r = await call('POST', '/api/consignments', VENDOR, { orderIds: ids, vehicleType: 'tempo' });
    check(r.status === 201, 'the consignment is created', `→ ${r.status}`);
    const C = r.body.consignment;
    check(C.stops.length === 3, 'with three stops');
    check(C.stops.every((s, i) => s.sequence === i), 'sequenced in visiting order');
    check(C.stops[C.stops.length - 1].legKm != null, 'each stop knows its leg distance');

    // Each order's own fare must now be its share, so receipts reconcile.
    const after = await Order.find({ _id: { $in: ids } }).lean();
    check(after.every((x) => String(x.consignmentId) === String(C._id)),
      'every order is linked to the run');
    const shareSum = after.reduce((a, x) => a + x.fare.total, 0);
    check(shareSum === C.fare.total,
      "each order's fare became its SHARE, summing to the vehicle fare",
      `→ ₹${shareSum} = ₹${C.fare.total}`);
    check(after.every((x) => x.grandTotal === x.cropTotal + x.fare.total),
      'and every order still reconciles: crop + share = grand total');
    check(after.every((x) => x.farmerPayout === x.cropTotal),
      'the farmer payout is UNTOUCHED by pooling — only transport is shared');

    r = await call('POST', '/api/consignments', VENDOR, { orderIds: ids, vehicleType: 'tempo' });
    check(r.status === 409, 'the same orders cannot be pooled twice', `→ ${r.status}`);

    // ── 3. dispatch ───────────────────────────────────────────────────
    console.log('\n3. Dispatch');
    r = await call('GET', `/api/consignments/agent/available?lat=20.00&lng=73.80`, AGENT);
    const mine = r.body.consignments.filter((x) => String(x._id) === String(C._id));
    check(mine.length === 1, 'the run appears in the driver feed');
    check(mine[0].approachKm != null, 'with the distance to the FIRST farm', `→ ${mine[0].approachKm} km`);
    check(mine[0].dropOtp === undefined, 'and NEVER the delivery code');

    const race = await Promise.all([
      call('POST', `/api/consignments/${C._id}/accept`, AGENT, { lat: 20.0, lng: 73.8 }),
      call('POST', `/api/consignments/${C._id}/accept`, AGENT2, { lat: 20.0, lng: 73.8 }),
    ]);
    check(race.filter((x) => x.status === 200).length === 1,
      'two drivers racing one run → exactly one wins', `→ ${race.map(x => x.status).join(',')}`);

    const winner = race[0].status === 200 ? AGENT : AGENT2;
    const orders2 = await Order.find({ _id: { $in: ids } }).lean();
    check(orders2.every((x) => x.status === 'accepted' && x.agentUid === winner),
      'EVERY farmer sees a driver coming, not just the first');

    // ── 4. one OTP per farmer ─────────────────────────────────────────
    console.log('\n4. One code per farmer');
    const live = await Consignment.findById(C._id).lean();
    const stop0 = live.stops[0];
    const order0 = orders2.find((x) => String(x._id) === String(stop0.orderId));
    const stop1 = live.stops[1];
    const order1 = orders2.find((x) => String(x._id) === String(stop1.orderId));

    r = await call('POST', `/api/consignments/${C._id}/collect`, winner, {
      orderId: stop0.orderId, otp: '0000',
    });
    check(r.status === 400 && r.body.code === 'WRONG_CODE', 'a wrong code is refused', `→ ${r.body.code}`);

    r = await call('POST', `/api/consignments/${C._id}/collect`, winner, {
      orderId: stop0.orderId, otp: order1.pickupOtp,
    });
    check(r.status === 400,
      "ANOTHER farmer's code cannot release this farmer's crop", `→ ${r.status}`);

    r = await call('POST', `/api/consignments/${C._id}/collect`, winner, {
      orderId: stop0.orderId, otp: order0.pickupOtp,
    });
    check(r.status === 200 && r.body.collected === 1, 'the right code collects that stop',
      `→ ${r.body.collected}/${r.body.collected + r.body.remaining}`);
    check((await Order.findById(order0._id).lean()).status === 'picked_up',
      'and only THAT order moves to picked up');
    check((await Order.findById(order1._id).lean()).status === 'accepted',
      'the other farms are untouched');

    r = await call('POST', `/api/consignments/${C._id}/collect`, winner, {
      orderId: stop0.orderId, otp: order0.pickupOtp,
    });
    check(r.status === 409 && r.body.code === 'ALREADY_COLLECTED',
      'a stop cannot be collected twice', `→ ${r.body.code}`);

    // ── 5. delivery is gated on visiting everyone ─────────────────────
    console.log('\n5. Delivery');
    r = await call('POST', `/api/consignments/${C._id}/deliver`, winner, { otp: live.dropOtp });
    check(r.status === 409 && r.body.code === 'STOPS_REMAINING',
      'a driver CANNOT deliver while farms are still unvisited', `→ ${r.body.code}`);
    check(/Farmer/.test(r.body.error), 'and is told which farmers were missed');

    for (const st of live.stops.slice(1)) {
      const ord = orders2.find((x) => String(x._id) === String(st.orderId));
      await call('POST', `/api/consignments/${C._id}/collect`, winner, {
        orderId: st.orderId, otp: ord.pickupOtp,
      });
    }
    r = await call('POST', `/api/consignments/${C._id}/deliver`, winner, { otp: 'zzzz' });
    check(r.status === 400, 'a wrong delivery code is refused');

    r = await call('POST', `/api/consignments/${C._id}/deliver`, winner, { otp: live.dropOtp });
    check(r.status === 200 && r.body.consignment.status === 'delivered', 'the run delivers');
    const final = await Order.find({ _id: { $in: ids } }).lean();
    check(final.every((x) => x.status === 'delivered'),
      'and ALL three orders complete together', `→ ${final.map(x => x.status).join(', ')}`);

    // ── 6. visibility ─────────────────────────────────────────────────
    console.log('\n6. Who sees what');
    r = await call('GET', `/api/consignments/${C._id}`, F[0]);
    check(r.status === 200, 'a farmer on the run can read it');
    check(r.body.consignment.dropOtp === undefined, 'but never the delivery code');
    const others = r.body.consignment.stops.filter((s) => s.farmerUid !== F[0]);
    check(others.every((s) => !s.farmerPhone),
      "and not the other farmers' phone numbers");

    r = await call('GET', `/api/consignments/${C._id}`, VENDOR);
    check(r.body.consignment.dropOtp, 'the buyer DOES hold the delivery code');

    r = await call('GET', `/api/consignments/${C._id}`, VENDOR2);
    check(r.status === 403, 'an unrelated buyer sees nothing', `→ ${r.status}`);

    // ── 7. when ONE stop fails ────────────────────────────────────────
    // The consignment status enum is trip-level, so before per-stop outcomes
    // existed a captain reaching farm 3 of 5 to find nobody home had nowhere
    // to put that fact: the run could not be delivered (every stop had to be
    // `collected`), its totals kept claiming the planned load, and the
    // farmer's order sat in `accepted` forever — while a buyer had committed
    // to a quantity that was never going to arrive.
    console.log('\n7. When one farm gives nothing');

    const o2 = [await mkOrder(0, 400), await mkOrder(1, 500), await mkOrder(2, 600)];
    const ids2 = o2.map((x) => String(x._id));
    r = await call('POST', '/api/consignments', VENDOR, { orderIds: ids2, vehicleType: 'tempo' });
    check(r.status === 201, 'a second run is created', `→ ${r.status}`);
    const C2 = r.body.consignment;
    const quotedShare = new Map(C2.stops.map((s) => [String(s.orderId), s.fareShare]));

    check(C2.stops.every((s) => s.outcome === 'pending'),
      'every stop starts with NO outcome recorded');
    check(C2.stops.every((s) => s.fareShareBasisKg === s.quantityKg),
      'and each records the weight its fare share was computed from');

    const otherAgent = winner === AGENT ? AGENT2 : AGENT;
    r = await call('POST', `/api/consignments/${C2._id}/accept`, winner, { lat: 20.0, lng: 73.8 });
    check(r.status === 200, 'the driver accepts it', `→ ${r.status}`);

    const live2 = await Consignment.findById(C2._id).lean();
    const ordById = new Map(
      (await Order.find({ _id: { $in: ids2 } }).lean()).map((x) => [String(x._id), x]));
    const [s0, s1, s2] = live2.stops;

    // Only the assigned captain, and only through the enum.
    r = await call('POST', `/api/consignments/${C2._id}/stop-outcome`, otherAgent, {
      orderId: s0.orderId, outcome: 'not_collected', reason: 'farmer_absent',
    });
    check(r.status === 404,
      'a driver who is NOT on this run cannot record an outcome', `→ ${r.status}`);
    check((await Order.findById(s0.orderId).lean()).status === 'accepted',
      'and nothing moved when they tried');

    r = await call('POST', `/api/consignments/${C2._id}/stop-outcome`, F[0], {
      orderId: s0.orderId, outcome: 'not_collected', reason: 'farmer_absent',
    });
    check(r.status === 403, 'nor can a farmer record their own stop', `→ ${r.status}`);

    r = await call('POST', `/api/consignments/${C2._id}/stop-outcome`, winner, {
      orderId: s0.orderId, outcome: 'went_badly', reason: 'farmer_absent',
    });
    check(r.status === 400 && r.body.code === 'BAD_OUTCOME',
      'an unknown outcome is refused', `→ ${r.body.code}`);

    r = await call('POST', `/api/consignments/${C2._id}/stop-outcome`, winner, {
      orderId: s0.orderId, outcome: 'not_collected',
    });
    check(r.status === 400 && r.body.code === 'REASON_REQUIRED',
      'a failure with no reason is refused — the reason IS the record', `→ ${r.body.code}`);

    r = await call('POST', `/api/consignments/${C2._id}/stop-outcome`, winner, {
      orderId: s0.orderId, outcome: 'not_collected', reason: 'they_were_rude',
    });
    check(r.status === 400 && r.body.code === 'REASON_REQUIRED',
      'and so is a reason outside the fixed list', `→ ${r.body.code}`);

    r = await call('POST', `/api/consignments/${C2._id}/stop-outcome`, winner, {
      orderId: s0.orderId, outcome: 'not_collected', reason: 'farmer_absent',
      note: 'Gate locked, nobody answering the phone.',
    });
    check(r.status === 200 && r.body.outcome === 'not_collected',
      'the captain records that farm 1 gave nothing', `→ ${r.status}`);
    check(r.body.collectedQuantityKg === 0 && r.body.consignment.stops[0].collectedKg === 0,
      "not one of that farm's planned kilograms counts toward the run's load",
      `→ ${r.body.collectedQuantityKg} kg aboard against ${r.body.plannedQuantityKg} kg planned`);

    r = await call('POST', `/api/consignments/${C2._id}/stop-outcome`, winner, {
      orderId: s0.orderId, outcome: 'not_collected', reason: 'farmer_absent',
    });
    check(r.status === 409 && r.body.code === 'ALREADY_RECORDED',
      'a stop outcome cannot be recorded TWICE', `→ ${r.body.code}`);

    r = await call('POST', `/api/consignments/${C2._id}/collect`, winner, {
      orderId: s0.orderId, otp: ordById.get(String(s0.orderId)).pickupOtp,
    });
    check(r.status === 409,
      'and a failed stop cannot be quietly re-collected with the right code', `→ ${r.status}`);

    const failedOrder = await Order.findById(s0.orderId).lean();
    check(failedOrder.status === 'cancelled',
      "that farmer's order is CANCELLED — not delivered", `→ ${failedOrder.status}`);
    check(!failedOrder.deliveredAt, 'it carries no delivery date');
    check(failedOrder.farmerPayout === 0 && failedOrder.cropTotal === 0 && failedOrder.quantityKg === 0,
      'and the farmer is owed NOTHING for produce that never moved',
      `→ ₹${failedOrder.farmerPayout} on ${failedOrder.quantityKg} kg`);
    check(failedOrder.pickupOutcome.orderedKg === s0.quantityKg
      && failedOrder.pickupOutcome.collectedKg === 0,
      'while what was AGREED is still on the record',
      `→ ordered ${failedOrder.pickupOutcome.orderedKg} kg, collected ${failedOrder.pickupOutcome.collectedKg} kg`);
    check(failedOrder.pickupOutcome.reason === 'farmer_absent'
      && failedOrder.pickupOutcome.recordedBy === winner,
      'with the reason, and who declared it',
      `→ ${failedOrder.pickupOutcome.reason}, by the captain`);

    r = await call('POST', `/api/orders/${s0.orderId}/settle`, s0.farmerUid, { method: 'cash' });
    check(r.status === 409 && r.body.code === 'NOT_COLLECTED',
      'and a payment CANNOT be recorded against a lot that never left the farm',
      `→ ${r.body.code}`);

    // A short pickup: some of it was there, not all of it.
    const ord1 = ordById.get(String(s1.orderId));
    r = await call('POST', `/api/consignments/${C2._id}/stop-outcome`, winner, {
      orderId: s1.orderId, outcome: 'collected_short', collectedKg: s1.quantityKg,
      reason: 'quantity_not_ready', otp: ord1.pickupOtp,
    });
    check(r.status === 400 && r.body.code === 'BAD_QUANTITY',
      'a "short" pickup of the whole amount is refused — that is a full pickup', `→ ${r.body.code}`);

    r = await call('POST', `/api/consignments/${C2._id}/stop-outcome`, winner, {
      orderId: s1.orderId, outcome: 'collected_short', collectedKg: 200,
      reason: 'quantity_not_ready', otp: '0000', weightMethod: 'farm_scale',
    });
    check(r.status === 400 && r.body.code === 'WRONG_CODE',
      "a short pickup is still a pickup — it needs the farmer's own code", `→ ${r.body.code}`);

    r = await call('POST', `/api/consignments/${C2._id}/stop-outcome`, winner, {
      orderId: s1.orderId, outcome: 'collected_short', collectedKg: 200,
      reason: 'quantity_not_ready', otp: ord1.pickupOtp, weightMethod: 'farm_scale',
    });
    check(r.status === 200 && r.body.outcome === 'collected_short',
      `with the code, 200 kg of ${s1.quantityKg} goes on the vehicle`, `→ ${r.status}`);
    const shortOrder = await Order.findById(s1.orderId).lean();
    check(shortOrder.quantityKg === 200 && shortOrder.farmerPayout === 200 * 30,
      'the farmer is paid for what LEFT the farm, not for what was ordered',
      `→ ${shortOrder.quantityKg} kg, ₹${shortOrder.farmerPayout}`);
    check(shortOrder.pickupOutcome.orderedKg === s1.quantityKg,
      'and the ordered quantity stays on the record beside it',
      `→ ordered ${shortOrder.pickupOutcome.orderedKg} kg`);

    const ord2 = ordById.get(String(s2.orderId));
    r = await call('POST', `/api/consignments/${C2._id}/collect`, winner, {
      orderId: s2.orderId, otp: ord2.pickupOtp,
    });
    check(r.status === 200 && r.body.outcome === 'collected_full',
      'the last farm delivers in full through the unchanged /collect route', `→ ${r.body.outcome}`);

    const live2b = await Consignment.findById(C2._id).lean();
    r = await call('POST', `/api/consignments/${C2._id}/deliver`, winner, { otp: live2b.dropOtp });
    check(r.status === 200,
      'the run DELIVERS even though one farm failed — the other crop is aboard', `→ ${r.status}`);
    check(r.body.collectedQuantityKg === 200 + s2.quantityKg,
      "the run's delivered total is what was COLLECTED, never what was planned",
      `→ ${r.body.collectedQuantityKg} kg of ${r.body.plannedQuantityKg} kg planned`);
    check(r.body.stopsFailed === 1 && r.body.stopsShort === 1,
      'and it says how many stops fell short', `→ ${r.body.stopsFailed} failed, ${r.body.stopsShort} short`);

    const failedAfter = await Order.findById(s0.orderId).lean();
    check(failedAfter.status === 'cancelled' && !failedAfter.deliveredAt,
      'the failed farmer is STILL not recorded as having delivered', `→ ${failedAfter.status}`);

    // The fare split. See FARE_SPLIT_POLICY in routes/consignments.js: shares
    // stay as quoted on planned weight, so a stop that gave nothing keeps its
    // share instead of pushing it onto the farmers who did deliver.
    const finalC2 = await Consignment.findById(C2._id).lean();
    const stopShareSum = finalC2.stops.reduce((a, s) => a + s.fareShare, 0);
    check(stopShareSum === finalC2.fare.total,
      'the fare split STILL sums exactly to the fare charged after a failure',
      `→ ${finalC2.stops.map((s) => s.fareShare).join(' + ')} = ₹${finalC2.fare.total}`);
    const finalOrders2 = await Order.find({ _id: { $in: ids2 } }).lean();
    check(finalOrders2.reduce((a, x) => a + x.fare.total, 0) === finalC2.fare.total,
      "and so do the orders' own shares — the cancelled one included",
      `→ ₹${finalC2.fare.total}`);
    check(finalOrders2.every((x) => x.fare.total === quotedShare.get(String(x._id))),
      'no farmer who delivered pays MORE because somebody else did not',
      '→ every share unchanged from the quote');
    check(finalOrders2.every((x) => x.grandTotal === x.cropTotal + x.fare.total),
      'and every order still reconciles: crop + share = grand total');

    // ── 8. a run where NOTHING was collected ──────────────────────────
    console.log('\n8. Nobody had anything');
    const listing = await CropListing.create({
      cropId: new mongoose.Types.ObjectId(), farmerUid: F[0],
      farmerName: 'Farmer1', farmerPhone: '9000000000',
      cropName: TAG + 'Onion', quantityKg: 500, quantityAvailableKg: 100,
      minOrderKg: 25, pricePerKg: 30, totalPrice: 15000,
      location: { city: 'Nashik', district: 'Nashik', state: 'Maharashtra', ...FARMS[0] },
      status: 'available',
    });
    const o3 = [await mkOrder(0, 400, { listingId: listing._id }), await mkOrder(1, 500)];
    r = await call('POST', '/api/consignments', VENDOR, {
      orderIds: o3.map((x) => String(x._id)), vehicleType: 'tempo',
    });
    const C3 = r.body.consignment;
    await call('POST', `/api/consignments/${C3._id}/accept`, winner, { lat: 20.0, lng: 73.8 });
    for (const st of C3.stops) {
      await call('POST', `/api/consignments/${C3._id}/stop-outcome`, winner, {
        orderId: st.orderId, outcome: 'not_collected', reason: 'produce_rejected',
      });
    }

    r = await call('POST', `/api/consignments/${C3._id}/deliver`, winner, { otp: 'anything' });
    check(r.status === 200 && r.body.code === 'NOTHING_COLLECTED',
      'an empty vehicle needs no delivery code — nobody hands over nothing', `→ ${r.body.code}`);
    check(r.body.consignment.status === 'cancelled',
      'the run closes as CANCELLED, not delivered', `→ ${r.body.consignment.status}`);
    check(r.body.consignment.isActiveJob === undefined,
      'and the captain is not stranded on a job that can never complete');

    const restocked = await CropListing.findById(listing._id).lean();
    check(restocked.quantityAvailableKg === 500,
      'produce that never left the farm goes back on the market',
      `→ 100 kg → ${restocked.quantityAvailableKg} kg available`);

    // ── 9. handing a CLEAN run back ───────────────────────────────────
    // Once a captain accepted, the only exits were delivering or the
    // all-stops-failed close. A captain who broke down or quit left the run in
    // `collecting` forever: nobody else could take it, and the farmers on it
    // could never settle or dispute their way out. /release is the blameless
    // half — nothing has been collected, so nothing has to be undone.
    console.log('\n9. Releasing a run nobody has started');

    // Clear whatever job a captain is still holding, straight through the
    // models. Sections that TEST the one-active-job rule (§11) necessarily
    // leave their captain busy, and that rule now spans both Order and
    // Consignment — so a later section that just wants a captain to take a run
    // gets a silent 409, and every assertion after it reports `undefined`
    // before finally throwing on a field of a response that never succeeded.
    // This is setup, not a route under test, so it goes around the API.
    const freeCaptain = async (uid) => {
      await Promise.all([
        Order.updateMany({ agentUid: uid, isActiveJob: true }, { $unset: { isActiveJob: '' } }),
        Consignment.updateMany({ agentUid: uid, isActiveJob: true }, { $unset: { isActiveJob: '' } }),
      ]);
    };

    // `runOver` is the CONSIGNMENT-level override (transportMode, fpoId,
    // transport), distinct from `over` which is per-ORDER. §14 needs it to
    // build a run the FPO drives itself, because grading is an FPO-side act
    // and a hired captain is no longer asked for a grade at all.
    const mkRun = async (qtys = [400, 500], over = [], runOver = {}) => {
      const os = await Promise.all(qtys.map((q, i) => mkOrder(i, q, over[i] || {})));
      const rr = await call('POST', '/api/consignments', VENDOR, {
        orderIds: os.map((x) => String(x._id)), vehicleType: 'tempo', ...runOver,
      });
      return { consignment: rr.body.consignment, orders: os };
    };

    let { consignment: C4 } = await mkRun();
    await call('POST', `/api/consignments/${C4._id}/accept`, winner, { lat: 20.0, lng: 73.8 });

    r = await call('POST', `/api/consignments/${C4._id}/release`, F[2], {});
    check(r.status === 403 && r.body.code === 'NOT_YOUR_RUN',
      'a farmer on nobody\'s side of this run cannot hand it back', `→ ${r.status} ${r.body.code}`);
    r = await call('POST', `/api/consignments/${C4._id}/release`, otherAgent, {});
    check(r.status === 404,
      'and a captain who was never offered it is not even told it exists', `→ ${r.status}`);

    r = await call('POST', `/api/consignments/${C4._id}/release`, winner, { reason: 'vehicle_breakdown' });
    check(r.status === 200 && r.body.consignment.status === 'awaiting_agent',
      'the assigned captain hands it back and it returns to the POOL', `→ ${r.body.consignment?.status}`);
    check(r.body.consignment.agentUid === null && r.body.consignment.isActiveJob === undefined,
      'the captain is off it and free to take other work');
    check(r.body.consignment.releases.length === 1
      && r.body.consignment.releases[0].byRole === 'agent'
      && r.body.consignment.releases[0].agentUid === winner,
      'and the release records WHO dropped it, not merely that it happened');
    check(r.body.consignment.rejectedBy.includes(winner),
      'a run you just handed back is not offered to you again');
    check(new Date(r.body.consignment.dispatchExpiresAt) > new Date(),
      'it gets a FRESH dispatch window — without one the sweep would retire it instantly');

    let relOrders = await Order.find({ _id: { $in: C4.orderIds } }).lean();
    check(relOrders.every((x) => x.status === 'awaiting_agent' && x.agentUid === null),
      'every farmer goes back to waiting for a driver — nothing was cancelled',
      `→ ${relOrders.map((x) => x.status).join(', ')}`);
    check(relOrders.every((x) => x.quantityKg > 0 && x.farmerPayout > 0),
      'and no farmer lost a kilogram or a rupee, because nothing had moved');

    // The whole point: somebody ELSE can now finish it.
    r = await call('POST', `/api/consignments/${C4._id}/accept`, otherAgent, { lat: 20.0, lng: 73.8 });
    check(r.status === 200, 'a DIFFERENT captain can accept the released run', `→ ${r.status}`);
    const liveC4 = await Consignment.findById(C4._id).lean();
    const ordC4 = new Map((await Order.find({ _id: { $in: C4.orderIds } }).lean()).map((x) => [String(x._id), x]));
    for (const st of liveC4.stops) {
      await call('POST', `/api/consignments/${C4._id}/collect`, otherAgent, {
        orderId: st.orderId, otp: ordC4.get(String(st.orderId)).pickupOtp,
      });
    }
    r = await call('POST', `/api/consignments/${C4._id}/deliver`, otherAgent, { otp: liveC4.dropOtp });
    check(r.status === 200 && r.body.consignment.status === 'delivered',
      '...and completes it normally, start to finish', `→ ${r.body.consignment?.status}`);

    // Once ANY gate has been recorded the run cannot go back to the pool.
    const { consignment: C5 } = await mkRun();
    await call('POST', `/api/consignments/${C5._id}/accept`, winner, { lat: 20.0, lng: 73.8 });
    await call('POST', `/api/consignments/${C5._id}/stop-outcome`, winner, {
      orderId: C5.stops[0].orderId, outcome: 'not_collected', reason: 'farmer_absent',
    });
    r = await call('POST', `/api/consignments/${C5._id}/release`, winner, {});
    check(r.status === 409 && r.body.code === 'PRODUCE_ABOARD',
      'a run that has ALREADY been to a farm gate is refused a release', `→ ${r.body.code}`);
    check(/abandon/i.test(r.body.error), 'and is told which route it needs instead');

    // The buyer may release, because a captain who has vanished cannot.
    r = await call('POST', `/api/consignments/${C5._id}/abandon`, winner, { reason: 'vehicle_breakdown' });
    check(r.status === 200, 'closing C5 out of the way so the captain is free', `→ ${r.status}`);

    const { consignment: C6 } = await mkRun();
    await call('POST', `/api/consignments/${C6._id}/accept`, winner, { lat: 20.0, lng: 73.8 });
    r = await call('POST', `/api/consignments/${C6._id}/release`, VENDOR2, {});
    check(r.status === 403, "another buyer's run is none of their business", `→ ${r.status}`);
    r = await call('POST', `/api/consignments/${C6._id}/release`, VENDOR, { reason: 'driver_unreachable' });
    check(r.status === 200 && r.body.releasedBy === 'vendor',
      'the BUYER who booked it can hand it back — the vanished captain cannot call anything',
      `→ ${r.body.releasedBy}`);

    // The FPO admin, on a run every one of whose farms is their own member.
    const fpo = await Fpo.create({
      name: TAG + 'Niphad Growers', district: 'Nashik', adminUid: F[0], adminName: 'Farmer1',
      members: [
        { farmerUid: F[0], farmerName: 'Farmer1', status: 'active' },
        { farmerUid: F[1], farmerName: 'Farmer2', status: 'active' },
      ],
    });
    const { consignment: C7 } = await mkRun();
    await call('POST', `/api/consignments/${C7._id}/accept`, otherAgent, { lat: 20.0, lng: 73.8 });
    r = await call('POST', `/api/consignments/${C7._id}/release`, F[2], {});
    check(r.status === 403,
      'a farmer who is not on the run and admins nothing still gets nowhere', `→ ${r.status}`);
    r = await call('POST', `/api/consignments/${C7._id}/release`, F[0], { reason: 'driver_unreachable' });
    check(r.status === 200 && r.body.releasedBy === 'fpo_admin',
      "the FPO ADMIN can hand back a run all of whose farms are their group's members",
      `→ ${r.body.releasedBy}`);
    await Fpo.deleteOne({ _id: fpo._id });

    // ── 10. abandoning a run with produce already aboard ──────────────
    // This CANNOT simply be reassigned: a new captain cannot collect what is
    // on somebody else's vehicle. So the two halves of the run are handled
    // differently and both are said out loud.
    console.log('\n10. Abandoning a run with crop on the vehicle');

    const listA = await CropListing.create({
      cropId: new mongoose.Types.ObjectId(), farmerUid: F[1],
      farmerName: 'Farmer2', farmerPhone: '9000000001',
      cropName: TAG + 'Onion', quantityKg: 900, quantityAvailableKg: 400,
      minOrderKg: 25, pricePerKg: 30, totalPrice: 27000,
      location: { city: 'Niphad', district: 'Nashik', state: 'Maharashtra', ...FARMS[1] },
      status: 'available',
    });
    const oA = [await mkOrder(0, 400), await mkOrder(1, 500, { listingId: listA._id })];
    r = await call('POST', '/api/consignments', VENDOR, {
      orderIds: oA.map((x) => String(x._id)), vehicleType: 'tempo',
    });
    const C8 = r.body.consignment;

    r = await call('POST', `/api/consignments/${C8._id}/abandon`, VENDOR, { reason: 'vehicle_breakdown' });
    check(r.status === 409 && r.body.code === 'RUN_CLOSED',
      'a run nobody has accepted has no captain to give up — nothing to abandon', `→ ${r.body.code}`);

    await call('POST', `/api/consignments/${C8._id}/accept`, winner, { lat: 20.0, lng: 73.8 });

    r = await call('POST', `/api/consignments/${C8._id}/abandon`, winner, { reason: 'vehicle_breakdown' });
    check(r.status === 409 && r.body.code === 'USE_RELEASE',
      'NOTHING collected yet, so abandoning is refused — releasing costs no farmer their sale',
      `→ ${r.body.code}`);

    const liveC8 = await Consignment.findById(C8._id).lean();
    const ordC8 = new Map((await Order.find({ _id: { $in: C8.orderIds } }).lean()).map((x) => [String(x._id), x]));
    const [a0, a1] = liveC8.stops;
    // One farm hands over. From here the run cannot go back to the pool.
    r = await call('POST', `/api/consignments/${C8._id}/collect`, winner, {
      orderId: a0.orderId, otp: ordC8.get(String(a0.orderId)).pickupOtp,
    });
    check(r.status === 200, 'the first farm loads its crop', `→ ${r.status}`);

    r = await call('POST', `/api/consignments/${C8._id}/abandon`, winner, {});
    check(r.status === 400 && r.body.code === 'REASON_REQUIRED',
      'giving up on a run with no stated reason is refused', `→ ${r.body.code}`);
    r = await call('POST', `/api/consignments/${C8._id}/abandon`, winner, { reason: 'i_got_bored' });
    check(r.status === 400 && r.body.code === 'REASON_REQUIRED',
      'and so is a reason outside the fixed list', `→ ${r.body.code}`);
    r = await call('POST', `/api/consignments/${C8._id}/abandon`, F[2], { reason: 'accident' });
    check(r.status === 403, 'an unrelated farmer cannot abandon somebody\'s run', `→ ${r.status}`);

    r = await call('POST', `/api/consignments/${C8._id}/abandon`, winner, {
      reason: 'vehicle_breakdown', note: 'Axle went on the Niphad road.',
    });
    check(r.status === 200 && r.body.consignment.status === 'abandoned',
      'the run ends ABANDONED — a different fact from an empty run that was cancelled',
      `→ ${r.body.consignment?.status}`);
    check(r.body.consignment.abandonment.reason === 'vehicle_breakdown'
      && r.body.consignment.abandonment.byRole === 'agent'
      && r.body.consignment.abandonment.by === winner,
      'with who gave up on it and why on the record');
    check(r.body.consignment.isActiveJob === undefined,
      'and the captain is freed rather than stranded on a run that can never finish');

    check(r.body.stranded.count === 1 && r.body.cancelled.count === 1,
      'the two halves are reported SEPARATELY, because they are different situations',
      `→ ${r.body.stranded.count} stranded, ${r.body.cancelled.count} cancelled`);
    check(r.body.stranded.quantityKg === a0.quantityKg,
      "and the response says how much crop is actually on that vehicle",
      `→ ${r.body.stranded.quantityKg} kg`);

    const strandedOrder = await Order.findById(a0.orderId).lean();
    check(strandedOrder.status === 'stranded',
      'the farmer who HANDED CROP OVER is neither delivered nor cancelled',
      `→ ${strandedOrder.status}`);
    check(!strandedOrder.deliveredAt, 'nothing arrived, so there is no delivery date');
    check(strandedOrder.farmerPayout === a0.quantityKg * 30 && strandedOrder.quantityKg === a0.quantityKg,
      'they are still owed every rupee for what left their farm — it is NOT written off',
      `→ ₹${strandedOrder.farmerPayout} on ${strandedOrder.quantityKg} kg`);
    check(strandedOrder.strandedReason === 'vehicle_breakdown' && strandedOrder.strandedBy === winner
      && !!strandedOrder.strandedAt,
      'and the order itself says why its crop never arrived, and who said so');

    const abandonedCancel = await Order.findById(a1.orderId).lean();
    check(abandonedCancel.status === 'cancelled',
      'the farm nobody reached has its order cancelled, exactly as a failed stop does',
      `→ ${abandonedCancel.status}`);
    check(abandonedCancel.farmerPayout === 0 && abandonedCancel.quantityKg === 0,
      'nothing moved there, so nothing is owed');
    check(abandonedCancel.pickupOutcome.reason === 'run_abandoned',
      'and the reason is NOT "farmer absent" — nobody ever came, and it was not their fault',
      `→ ${abandonedCancel.pickupOutcome.reason}`);
    check(abandonedCancel.pickupOutcome.orderedKg === a1.quantityKg,
      'what was agreed is still on the record beside it', `→ ${abandonedCancel.pickupOutcome.orderedKg} kg`);

    const restockedA = await CropListing.findById(listA._id).lean();
    check(restockedA.quantityAvailableKg === 400 + a1.quantityKg,
      'their kilograms go back on the market — only the UNCOLLECTED half is restocked',
      `→ 400 kg → ${restockedA.quantityAvailableKg} kg`);

    const finalC8 = await Consignment.findById(C8._id).lean();
    check(finalC8.stops.reduce((a, s) => a + s.fareShare, 0) === finalC8.fare.total,
      'the fare split STILL sums exactly to the fare charged after an abandonment',
      `→ ₹${finalC8.fare.total}`);
    check(String(finalC8.abandonment.strandedOrderIds[0]) === String(a0.orderId)
      && String(finalC8.abandonment.cancelledOrderIds[0]) === String(a1.orderId),
      'the run names both halves by order, so a human can act on either');

    r = await call('POST', `/api/consignments/${C8._id}/deliver`, winner, { otp: finalC8.dropOtp });
    check(r.status === 409 && r.body.code === 'RUN_CLOSED',
      'an ABANDONED run can never be delivered — not even with the right code', `→ ${r.body.code}`);
    r = await call('POST', `/api/consignments/${C8._id}/abandon`, winner, { reason: 'accident' });
    check(r.status === 409 && r.body.code === 'RUN_CLOSED', 'nor abandoned twice', `→ ${r.body.code}`);
    r = await call('POST', `/api/consignments/${C8._id}/release`, winner, {});
    check(r.status === 409 && r.body.code === 'RUN_CLOSED', 'nor released afterwards', `→ ${r.body.code}`);

    // The farmer whose crop is in limbo is not locked out of their own money.
    r = await call('POST', `/api/orders/${a0.orderId}/settle`, a0.farmerUid, { method: 'cash' });
    check(r.status === 200 && r.body.order.settlement.farmerPaid === true,
      'a stranded farmer CAN still record being paid — the app records money, it does not judge it',
      `→ ${r.status}`);

    // ── 11. one captain, one vehicle, one job — across BOTH collections ─
    // `isActiveJob` has a partial unique index on Order AND one on
    // Consignment, but an index cannot span collections: between them they let
    // one captain hold an active single-farmer order AND an active multi-farm
    // run at the same time. One driver, one vehicle.
    console.log('\n11. A captain cannot hold a run and a single pickup at once');

    const { consignment: C9 } = await mkRun();
    r = await call('POST', `/api/consignments/${C9._id}/accept`, winner, { lat: 20.0, lng: 73.8 });
    check(r.status === 200, 'the captain takes a shared run', `→ ${r.status}`);

    const solo = await mkOrder(2, 300);
    r = await call('POST', `/api/orders/${solo._id}/accept`, winner, { lat: 20.0, lng: 73.8 });
    check(r.status === 409 && r.body.code === 'ALREADY_ON_JOB'
      && r.body.activeJob?.kind === 'consignment',
      'and CANNOT then accept a single-farmer order — no index could have stopped this',
      `→ ${r.status} ${r.body.code}`);
    check((await Order.findById(solo._id).lean()).status === 'awaiting_agent',
      'the single order is untouched and still available to somebody else');

    r = await call('GET', '/api/orders/agent/available?lat=20.0&lng=73.8', winner);
    check(r.body.busy === true && r.body.orders.length === 0,
      'the single-pickup feed shows them nothing while they are on a run',
      `→ busy=${r.body.busy}`);

    r = await call('POST', `/api/consignments/${C9._id}/release`, winner, { reason: 'other' });
    check(r.status === 200, 'the captain releases the run', `→ ${r.status}`);

    // ...and the other way round.
    r = await call('POST', `/api/orders/${solo._id}/accept`, winner, { lat: 20.0, lng: 73.8 });
    check(r.status === 200, 'now free, they take the single order instead', `→ ${r.status}`);
    r = await call('POST', `/api/consignments/${C9._id}/accept`, winner, { lat: 20.0, lng: 73.8 });
    check(r.status === 409 && r.body.activeJob?.kind === 'order',
      'and CANNOT then accept a shared run either — the constraint holds both ways',
      `→ ${r.status} ${r.body.code} (holding ${r.body.activeJob?.kind})`);
    check(r.body.code === 'ALREADY_BUSY',
      "...answering with the code this app already used for 'you are holding an order'",
      '→ neither existing contract was broken to add the cross-collection half');
    const stillOpen = await Consignment.findById(C9._id).lean();
    check(stillOpen.status === 'awaiting_agent' && stillOpen.agentUid === null,
      'the rejected claim left the run in the pool for a captain who can actually drive it');

    r = await call('GET', '/api/consignments/agent/available?lat=20.0&lng=73.8', winner);
    check(r.body.busy === true && r.body.consignments.length === 0,
      'and the shared-run feed hides runs from a captain already on a pickup');

    // ── 12. the stale-run sweep ───────────────────────────────────────
    // There is no cron here, so it rides the same lazy sweep the dispatch
    // window uses. It only ever RELEASES: the filter requires that no stop has
    // an outcome, so by construction no farmer can be harmed by it.
    console.log('\n12. A run whose captain evidently vanished');
    const { STALE_RUN_MS } = require(B('routes/consignments'));

    const { consignment: C10 } = await mkRun();
    await call('POST', `/api/consignments/${C10._id}/accept`, otherAgent, { lat: 20.0, lng: 73.8 });
    await Consignment.updateOne({ _id: C10._id },
      { $set: { acceptedAt: new Date(Date.now() - STALE_RUN_MS - 60000) } });

    // Any read that sweeps will do; this is the captain feed.
    await call('GET', '/api/consignments/agent/available?lat=20.0&lng=73.8', winner);
    const swept = await Consignment.findById(C10._id).lean();
    check(swept.status === 'awaiting_agent' && swept.agentUid === null,
      `a run accepted ${Math.round(STALE_RUN_MS / 3600000)}h ago with NO farm gate recorded goes back to the pool`,
      `→ ${swept.status}`);
    check(swept.releases.length === 1 && swept.releases[0].byRole === 'system',
      'and the sweep signs its own name rather than a captain\'s');
    check((await Order.find({ _id: { $in: C10.orderIds } }).lean()).every((x) => x.status === 'awaiting_agent'),
      'every farmer on it is waiting for a driver again, and none was cancelled');

    // A stale run WITH produce aboard is left for a human. Cancelling a
    // farmer's order on a timer is not a decision software should take.
    const { consignment: C11 } = await mkRun();
    await call('POST', `/api/consignments/${C11._id}/accept`, otherAgent, { lat: 20.0, lng: 73.8 });
    const liveC11 = await Consignment.findById(C11._id).lean();
    const ordC11 = await Order.findById(liveC11.stops[0].orderId).lean();
    await call('POST', `/api/consignments/${C11._id}/collect`, otherAgent, {
      orderId: liveC11.stops[0].orderId, otp: ordC11.pickupOtp,
    });
    await Consignment.updateOne({ _id: C11._id },
      { $set: { acceptedAt: new Date(Date.now() - STALE_RUN_MS - 60000) } });
    await call('GET', '/api/consignments/agent/available?lat=20.0&lng=73.8', winner);
    const notSwept = await Consignment.findById(C11._id).lean();
    check(notSwept.status === 'collecting' && notSwept.agentUid === otherAgent,
      'but a stale run with crop ALREADY ABOARD is left alone — a timer must not cancel a sale',
      `→ ${notSwept.status}`);

    // ── 13. WHERE THE KILOGRAMS CAME FROM ─────────────────────────────
    // Weight was asserted twice — by the farmer when listing, by whoever
    // stood at the gate — and measured never. Two unverified numbers decided
    // what a buyer paid and what a farmer was owed, and no screen anywhere
    // said which of them, if either, had been near a scale.
    console.log('\n13. How was it weighed?');
    const { POSTABLE_WEIGHT_METHODS } = require(B('routes/consignments'));

    check(POSTABLE_WEIGHT_METHODS.includes('estimated'),
      'THE HONEST VALUE IS ON THE LIST — most farm-gate pickups have no scale, and leaving '
      + '"not weighed" out would not make them weighed, it would make them read as weighed',
      `→ ${POSTABLE_WEIGHT_METHODS.join(', ')}`);

    // §11 deliberately leaves `winner` holding a single-farmer order — that is
    // the whole point of it — and the one-active-job rule now spans BOTH
    // collections, so an accept here would be refused with ALREADY_ON_JOB.
    // The failure is silent and awful to read: the accept returns 409, every
    // later assertion in this section reports `undefined`, and the section
    // finally throws on a field of a response that was never a success.
    // Clear the captain directly rather than through the API — this is setup
    // for what §13 is about, not another test of §11's rule.
    await freeCaptain(winner);

    const { consignment: G1 } = await mkRun([400, 500, 600]);
    const acceptedG1 = await call('POST', `/api/consignments/${G1._id}/accept`, winner, { lat: 20.0, lng: 73.8 });
    // Assert the setup itself. Without this, a refused accept is invisible and
    // shows up ten assertions later as an unreadable TypeError.
    check(acceptedG1.status === 200,
      'the captain is free and takes the run (setup for the weight section)',
      `→ ${acceptedG1.status} ${acceptedG1.body.code || ''}`);
    const liveG1 = await Consignment.findById(G1._id).lean();
    const ordG1 = new Map(
      (await Order.find({ _id: { $in: G1.orderIds } }).lean()).map((x) => [String(x._id), x]));
    const [g0, g1, g2] = liveG1.stops;

    r = await call('POST', `/api/consignments/${G1._id}/stop-outcome`, winner, {
      orderId: g0.orderId, outcome: 'collected_full', otp: ordG1.get(String(g0.orderId)).pickupOtp,
    });
    check(r.status === 400 && r.body.code === 'WEIGHT_METHOD_REQUIRED',
      'a pickup that will not say HOW it was weighed is refused', `→ ${r.body.code}`);
    check(Array.isArray(r.body.weightMethods) && r.body.weightMethods.includes('estimated'),
      '...and the refusal offers the honest answer rather than demanding a scale nobody has');
    check((await Order.findById(g0.orderId).lean()).status === 'accepted',
      'nothing moved on the refused attempt');

    r = await call('POST', `/api/consignments/${G1._id}/stop-outcome`, winner, {
      orderId: g0.orderId, outcome: 'collected_full', otp: ordG1.get(String(g0.orderId)).pickupOtp,
      weightMethod: 'i_had_a_look',
    });
    check(r.status === 400 && r.body.code === 'WEIGHT_METHOD_REQUIRED',
      'and a method outside the fixed list is refused too — free text is not countable',
      `→ ${r.body.code}`);

    // A real weighing, on the one instrument in this list that issues a ticket.
    r = await call('POST', `/api/consignments/${G1._id}/stop-outcome`, winner, {
      orderId: g0.orderId, outcome: 'collected_full', otp: ordG1.get(String(g0.orderId)).pickupOtp,
      weightMethod: 'public_weighbridge', weightRef: 'WB/NSK/2026/00417',
    });
    check(r.status === 200 && r.body.weight.method === 'public_weighbridge',
      'a weighbridge pickup records the weighbridge', `→ ${r.body.weight.label}`);
    check(r.body.weight.weighed === true && r.body.weight.independent === true,
      '...and it is the only method reported as INDEPENDENT — a ticket both parties can produce');
    check(r.body.weight.kg === g0.quantityKg,
      'the kilograms travel WITH the provenance, in one object, never separately',
      `→ ${r.body.weight.kg} kg ${r.body.weight.label}`);

    let stopG = (await Consignment.findById(G1._id).lean())
      .stops.find((s) => String(s.orderId) === String(g0.orderId));
    check(stopG.weight.method === 'public_weighbridge' && stopG.weight.ref === 'WB/NSK/2026/00417',
      'the run stores the method and the ticket number', `→ ${stopG.weight.ref}`);
    check(stopG.outcomeBy === winner && stopG.outcomeByRole === 'agent',
      'and WHO weighed it is the existing outcomeBy/outcomeByRole — not a second, parallel field');
    let ordG = await Order.findById(g0.orderId).lean();
    check(ordG.pickupOutcome.weight.method === 'public_weighbridge',
      'the order carries the same provenance beside the quantity it describes');

    // THE HONEST CASE. Nobody weighed it; the record says so rather than
    // presenting a counted-bags figure as a measurement.
    r = await call('POST', `/api/consignments/${G1._id}/stop-outcome`, winner, {
      orderId: g1.orderId, outcome: 'collected_short', collectedKg: 200,
      reason: 'quantity_not_ready', otp: ordG1.get(String(g1.orderId)).pickupOtp,
      weightMethod: 'estimated',
    });
    check(r.status === 200 && r.body.weight.method === 'estimated' && r.body.weight.weighed === false,
      'AN UNWEIGHED PICKUP IS RECORDED AS UNWEIGHED — 200 kg that nobody put on a scale',
      `→ "${r.body.weight.label}"`);
    check(/not weighed|estimate/i.test(r.body.weight.note),
      '...and says in words that it is an estimate, on the number that decides the payout');
    check((await Order.findById(g1.orderId).lean()).pickupOutcome.weight.method === 'estimated',
      'persisted on the order, so a receipt cannot print 200 kg as though it were measured');

    // The legacy route, which predates the field and its callers send nothing.
    r = await call('POST', `/api/consignments/${G1._id}/collect`, winner, {
      orderId: g2.orderId, otp: ordG1.get(String(g2.orderId)).pickupOtp,
    });
    check(r.status === 200 && r.body.weight.method === 'not_recorded',
      'the legacy /collect route still works and records NOT RECORDED', `→ ${r.body.weight.method}`);
    check(r.body.weight.method !== 'estimated' && r.body.weight.weighed === false,
      '...which is deliberately NOT "estimated": the app never asked, so nobody estimated anything');

    // A delivered quantity, with its provenance attached.
    const liveG1b = await Consignment.findById(G1._id).lean();
    r = await call('POST', `/api/consignments/${G1._id}/deliver`, winner, { otp: liveG1b.dropOtp });
    check(r.status === 200 && !!r.body.weightProvenance,
      'THE DELIVERED TOTAL DOES NOT LEAVE THIS ROUTE ALONE', `→ ${r.body.collectedQuantityKg} kg`);
    const wp = r.body.weightProvenance;
    check(wp.totalKg === 400 + 200 + 600 && wp.weighedKg === 400,
      'it reports weighed kilograms against the total, not a single true/false',
      `→ ${wp.weighedKg} of ${wp.totalKg} kg weighed`);
    check(wp.unweighedKg === 800 && wp.anyUnweighed === true && wp.allWeighed === false,
      'so 800 kg of a 1,200 kg delivery is visibly a number nobody measured',
      `→ ${wp.unweighedKg} kg unweighed`);
    check(wp.independentKg === 400,
      'and only the weighbridge kilograms count as independently established',
      `→ ${wp.independentKg} kg`);

    r = await call('GET', '/api/consignments/vendor/purchases', VENDOR);
    const buyG1 = r.body.purchases.find((p) => String(p.consignmentId) === String(G1._id));
    check(!!buyG1 && buyG1.totals.weightProvenance.unweighedKg === 800,
      "the BUYER's own purchase list carries it too — the screen most likely to total kilograms",
      `→ ${buyG1?.totals.weightProvenance.unweighedKg} kg unweighed`);
    check(buyG1.contributors.every((c) => !!c.weight && typeof c.weight.weighed === 'boolean'),
      'every contributor row says how their own lot was weighed');
    check(/does not weigh anything/i.test(r.body.weightNote || ''),
      'and the list states plainly that this app records a weighing, it does not perform one');

    r = await call('GET', `/api/orders/${g1.orderId}/receipt`, VENDOR);
    check(r.body.receipt.crop.weight.method === 'estimated'
      && r.body.receipt.crop.weight.weighed === false,
      'THE RECEIPT — the most forwarded document here — says the 200 kg was never weighed',
      `→ "${r.body.receipt.crop.weight.label}"`);
    check(r.body.receipt.crop.orderedKg === g1.quantityKg,
      'beside what was actually ordered, so the shortfall does not vanish from the record',
      `→ ${r.body.receipt.crop.quantityKg} of ${r.body.receipt.crop.orderedKg} kg`);

    // Nothing moved, so there is nothing to have weighed.
    const { consignment: G2 } = await mkRun([400, 500]);
    await call('POST', `/api/consignments/${G2._id}/accept`, winner, { lat: 20.0, lng: 73.8 });
    const liveG2 = await Consignment.findById(G2._id).lean();
    r = await call('POST', `/api/consignments/${G2._id}/stop-outcome`, winner, {
      orderId: liveG2.stops[0].orderId, outcome: 'not_collected', reason: 'farmer_absent',
    });
    check(r.status === 200,
      'a farm that handed over NOTHING is not asked how it weighed nothing', `→ ${r.status}`);
    const emptyStop = (await Consignment.findById(G2._id).lean()).stops[0];
    check(emptyStop.weight.method === null,
      'and no method is invented for it', `→ ${emptyStop.weight.method}`);

    // ── 14. THE GRADE AT THE GATE — AND WHO IS ALLOWED TO GIVE ONE ────
    //
    // Grades are self-declared and nobody checked them, yet a grade lot now
    // carries a price spread — which invites exactly the fraud grade
    // separation exists to prevent. The pickup is the first moment a person
    // looks at the produce.
    //
    // ⚠️ BUT NOT EVERY PERSON AT A GATE IS A GRADER, AND THIS SECTION NOW
    // RUNS ON AN FPO's OWN RUN FOR THAT REASON. It used to record every grade
    // through `winner` — a captain from the PUBLIC POOL — which meant the app
    // was asking an independent truck driver to certify size, colour and
    // blemish tolerance on somebody else's onion. §14b below asserts that is
    // now refused. Grading here is done by the group's own office, which
    // handles this crop every season and whose name is on the sale.
    console.log('\n14. The grade at the gate — by an FPO, who may');

    const gradedListing = (code) => CropListing.create({
      cropId: new mongoose.Types.ObjectId(), farmerUid: F[0],
      farmerName: 'Farmer1', farmerPhone: '9000000000',
      cropName: TAG + 'Onion', quantityKg: 2000, quantityAvailableKg: 2000,
      minOrderKg: 25, pricePerKg: 30, totalPrice: 60000,
      location: { city: 'Nashik', district: 'Nashik', state: 'Maharashtra', ...FARMS[0] },
      status: 'available', grade: { code, selfDeclared: true },
    });
    const LA = await gradedListing('A');
    const LB = await gradedListing('A');

    // The group whose produce this is. F[0] admins it; the run is one the FPO
    // arranges itself, so there is no captain and the recorder is FPO-side.
    const gradeFpo = await Fpo.create({
      name: TAG + 'Grading Growers', district: 'Nashik', adminUid: F[0], adminName: 'Farmer1',
      members: F.map((uid, i) => ({ farmerUid: uid, farmerName: `Farmer${i + 1}`, status: 'active' })),
    });
    // ⚠️ 🐛🔒 L2 + L4, found and fixed in review. This scenario used to be
    // built via `mkRun(..., { transportMode: 'own', fpoId, transport })`,
    // which calls POST /api/consignments AS THE VENDOR test account. That
    // endpoint is now correctly HIRED_ONLY (a buyer must never be able to
    // name an arbitrary FPO's own vehicle and state its cost — see the fix in
    // routes/consignments.js). This test's whole scenario only ever "worked"
    // because that check was missing; VENDOR and gradeFpo.adminUid (F[0])
    // were never actually the same identity.
    //
    // What this section is really testing — grading at the gate — does not
    // depend on HOW the agentless run was created, only on it existing with
    // real Orders and `agentUid: null`. So it is constructed directly here,
    // exactly as testCollection.js already does for its own scaffolding,
    // rather than through a creation path that is now correctly closed.
    // ⚠️ THE DECLARED GRADE IS READ FROM THE LISTING (order.listingId →
    // CropListing.grade.code), never stored on the Order itself. The original
    // scaffolding passed `over[i] = { listingId: LA._id }` etc. into mkOrder
    // for exactly this reason — LA and LB are graded 'A', and the third
    // order is deliberately left with no listing (ungraded, the majority case).
    const g3Orders = [
      await mkOrder(0, 400, { status: 'accepted', listingId: LA._id }),
      await mkOrder(1, 500, { status: 'accepted', listingId: LB._id }),
      await mkOrder(2, 600, { status: 'accepted' }),
    ];
    const G3doc = await Consignment.create({
      vendorUid: VENDOR, vendorName: 'Buyer', vendorPhone: '9000000009',
      orderIds: g3Orders.map((o) => o._id),
      stops: g3Orders.map((o, i) => ({
        orderId: o._id, farmerUid: o.farmerUid, farmerName: o.farmerName, farmerPhone: o.farmerPhone,
        cropName: o.cropName, quantityKg: o.quantityKg,
        lat: FARMS[i].lat, lng: FARMS[i].lng, label: `Farm ${i}`,
        sequence: i, legKm: 5, fareShare: Math.round(1600 / 3), fareShareBasisKg: o.quantityKg,
      })),
      dropoff: { ...MANDI },
      vehicleType: 'tempo', totalQuantityKg: 1500, distanceKm: 20, durationMin: 40,
      routeSource: 'haversine',
      fare: { base: null, perKm: null, distanceCharge: null, returnCharge: 0, returnKm: 0,
        returnThresholdKm: null, total: 1600, agentPayout: null },
      soloFareTotal: null,
      transportMode: 'own', fpoId: gradeFpo._id,
      transport: {
        driverName: 'Sopan Patil', driverPhone: '9822001122', vehicleNumber: 'MH 15 GR 1111',
        cost: 1600, costSource: 'fpo_stated', costNote: 'Not computed by this app — the FPO stated it.',
        arrangedBy: gradeFpo.adminUid,
      },
      status: 'accepted', agentUid: null, dropOtp: '4321',
    });
    await Order.updateMany({ _id: { $in: g3Orders.map((o) => o._id) } },
      { $set: { consignmentId: G3doc._id } });
    const G3 = G3doc.toObject();
    check(G3.status === 'accepted' && G3.agentUid === null,
      "the group's own run starts accepted with no captain — nobody from the pool is involved",
      `→ ${G3.status}`);
    // The recorder for the whole of §14. An FPO account may grade; a captain
    // may not. See data/gateRecord.js GRADING_ROLES.
    const GRADER = F[0];
    const liveG3 = await Consignment.findById(G3._id).lean();
    const ordG3 = new Map(
      (await Order.find({ _id: { $in: G3.orderIds } }).lean()).map((x) => [String(x._id), x]));
    const [q0, q1, q2] = liveG3.stops;

    // Nothing typed: the declaration stands.
    r = await call('POST', `/api/consignments/${G3._id}/stop-outcome`, GRADER, {
      orderId: q0.orderId, outcome: 'collected_full', otp: ordG3.get(String(q0.orderId)).pickupOtp,
      weightMethod: 'collection_centre_scale',
    });
    check(r.status === 200 && r.body.grade.declared === 'A' && r.body.grade.observed === 'A',
      'OBSERVED GRADE DEFAULTS TO WHAT THE FARMER DECLARED — the common case needs no typing',
      `→ declared ${r.body.grade.declared}, observed ${r.body.grade.observed}`);
    check(r.body.grade.discrepancy === 'match' && r.body.grade.differs === false,
      '...and records it as a match rather than as silence');

    r = await call('POST', `/api/consignments/${G3._id}/stop-outcome`, GRADER, {
      orderId: q1.orderId, outcome: 'collected_full', otp: ordG3.get(String(q1.orderId)).pickupOtp,
      weightMethod: 'farm_scale', observedGrade: 'Z',
    });
    check(r.status === 400 && r.body.code === 'BAD_GRADE',
      'a grade the crop\'s own spec does not define is refused', `→ ${r.body.code}`);

    const beforeDowngrade = await Order.findById(q1.orderId).lean();
    r = await call('POST', `/api/consignments/${G3._id}/stop-outcome`, GRADER, {
      orderId: q1.orderId, outcome: 'collected_full', otp: ordG3.get(String(q1.orderId)).pickupOtp,
      weightMethod: 'farm_scale', observedGrade: 'C',
    });
    check(r.status === 200 && r.body.grade.discrepancy === 'downgrade',
      'a lot sold as Grade A and collected as Grade C is recorded as a DOWNGRADE',
      `→ ${r.body.grade.declared} → ${r.body.grade.observed}`);

    // ⚠️ THE POINT OF THE WHOLE FEATURE.
    const afterDowngrade = await Order.findById(q1.orderId).lean();
    check(afterDowngrade.pricePerKg === beforeDowngrade.pricePerKg
      && afterDowngrade.cropTotal === beforeDowngrade.quantityKg * beforeDowngrade.pricePerKg
      && afterDowngrade.farmerPayout === afterDowngrade.cropTotal,
      'AND NOT ONE RUPEE MOVES — a driver typing a lower letter does not reprice a farmer\'s crop',
      `→ ₹${afterDowngrade.pricePerKg}/kg before and after, payout ₹${afterDowngrade.farmerPayout}`);
    check(r.body.grade.priceChanged === false && /raise a grievance/i.test(r.body.grade.note),
      '...and the response says so, pointing at the dispute flow where money is actually settled');
    check((await CropListing.findById(LB._id).lean()).grade.code === 'A',
      "the farmer's own declaration is not overwritten either — it is still their claim");

    const dgStop = (await Consignment.findById(G3._id).lean())
      .stops.find((s) => String(s.orderId) === String(q1.orderId));
    check(dgStop.grade.declared === 'A' && dgStop.grade.observed === 'C'
      && dgStop.grade.discrepancy === 'downgrade',
      'BOTH SIDES carry it — the run\'s stop…');
    check(afterDowngrade.pickupOutcome.grade.declared === 'A'
      && afterDowngrade.pickupOutcome.grade.observed === 'C'
      && afterDowngrade.pickupOutcome.grade.discrepancy === 'downgrade',
      '…and the order, which is what a receipt and a grievance are built from');

    // An ungraded lot: an observation, not an accusation.
    r = await call('POST', `/api/consignments/${G3._id}/collect`, GRADER, {
      orderId: q2.orderId, otp: ordG3.get(String(q2.orderId)).pickupOtp,
      weightMethod: 'estimated', observedGrade: 'B',
    });
    check(r.status === 200 && r.body.grade.discrepancy === 'observed_only'
      && r.body.grade.downgraded === false,
      'a lot the farmer never graded is OBSERVED, not accused — there was no claim to fall short of',
      `→ ${r.body.grade.discrepancy}`);

    const liveG3b = await Consignment.findById(G3._id).lean();
    r = await call('POST', `/api/consignments/${G3._id}/deliver`, GRADER, { otp: liveG3b.dropOtp });
    check(r.status === 200 && r.body.gradeChecks.some(
      (g) => String(g.orderId) === String(q1.orderId) && g.downgraded),
    'THE BUYER IS TOLD AT DELIVERY, when it is still worth acting on',
    `→ ${r.body.gradeChecks.length} lot(s) flagged`);
    check(r.body.gradeChecks.every((g) => g.priceChanged === false),
      '...as a notification, never as an adjustment');

    r = await call('GET', '/api/consignments/vendor/purchases', VENDOR);
    const buyG3 = r.body.purchases.find((p) => String(p.consignmentId) === String(G3._id));
    check(buyG3.totals.gradeDowngrades === 1,
      "and it stays on the buyer's purchase list beside what they paid",
      `→ ${buyG3.totals.gradeDowngrades} downgrade`);
    check(buyG3.contributors.find((c) => String(c.orderId) === String(q1.orderId)).grade.downgraded,
      'naming which farmer\'s lot it was');

    // ── the farmer answers, and only then does it mean anything ──────
    // F[2], NOT F[1]. `mkOrder(i)` stamps `farmerUid: F[i]`, so q1 belongs to
    // F[1] — the original assertion here used its own owner and read the
    // resulting 200 as a missing authorisation check. F[2] is on this run but
    // does not own this lot, which is the case actually worth guarding.
    r = await call('POST', `/api/consignments/${G3._id}/stop-grade-response`, F[2], {
      orderId: q1.orderId, response: 'accepted',
    });
    check(r.status === 404,
      "another farmer cannot answer somebody else's lot", `→ ${r.status}`);
    r = await call('POST', `/api/consignments/${G3._id}/stop-grade-response`, F[0], {
      orderId: q0.orderId, response: 'accepted',
    });
    check(r.status === 409 && r.body.code === 'NOTHING_TO_ANSWER',
      'and a lot nobody downgraded has nothing to accept', `→ ${r.body.code}`);
    // q1 is F[1]'s lot — `mkOrder(i)` stamps `farmerUid: F[i]`. The listing
    // fixture above was created under F[0], which is what made these read
    // as F[0]'s; the ORDER is the thing that owns the stop.
    r = await call('POST', `/api/consignments/${G3._id}/stop-grade-response`, F[1], {
      orderId: q1.orderId, response: 'maybe',
    });
    check(r.status === 400 && r.body.code === 'BAD_RESPONSE',
      'the answer is a fixed pair, not free text', `→ ${r.body.code}`);

    r = await call('POST', `/api/consignments/${G3._id}/stop-grade-response`, F[1], {
      orderId: q1.orderId, response: 'accepted', note: 'Rain damage on the last picking.',
    });
    check(r.status === 200 && r.body.grade.farmerResponse === 'accepted',
      'THE FARMER CONCEDES IT — which is what turns a driver\'s claim into evidence',
      `→ ${r.body.grade.farmerResponse}`);
    check(r.body.priceChanged === false
      && r.body.farmerPayout === afterDowngrade.farmerPayout,
      '...and accepting still does not cost them a rupee on this sale',
      `→ ₹${r.body.farmerPayout}`);
    check((await Order.findById(q1.orderId).lean()).pickupOutcome.grade.farmerResponse === 'accepted',
      'the answer lands on the order as well as the stop');

    r = await call('POST', `/api/consignments/${G3._id}/stop-grade-response`, F[1], {
      orderId: q1.orderId, response: 'contested',
    });
    check(r.status === 409 && r.body.code === 'ALREADY_ANSWERED',
      'and it cannot be answered twice', `→ ${r.body.code}`);

    // ── 14b. A CAPTAIN IS NOT A GRADER, AND THE APP SAYS SO ───────────
    //
    // ═══ THE DECISION THIS SECTION PINS DOWN ═══════════════════════════
    //
    // Everything above ran on an FPO's OWN run, where the recorder is the
    // group's own person: they handle this crop every season, their group's
    // name is on the sale, and a grade from them is honest.
    //
    // A HIRED run is a different person entirely — an independent truck driver
    // from the public pool, who will never see this produce again. Asking them
    // to put A, B or C on somebody's onion is asking them to certify size,
    // colour uniformity and blemish tolerance against a published spec. They
    // are not qualified to, and the letter carries a price premium.
    //
    // ⚠️ AND THE ALTERNATIVE IS WORSE, NOT MERELY DIFFERENT. Letting a captain
    // grade produces `discrepancy: 'downgrade'` on the record — which the
    // farmer must then answer, which feeds trustService when they concede, and
    // which the buyer reads — from somebody with no standing to make the claim.
    // A refusal that is visible beats a check that is decorative.
    console.log('\n14b. A captain from the public pool is not asked to grade');

    const LC = await gradedListing('A');
    const { consignment: G4 } = await mkRun([400, 500], [{ listingId: LC._id }]);
    await freeCaptain(winner);
    r = await call('POST', `/api/consignments/${G4._id}/accept`, winner, { lat: 20.0, lng: 73.8 });
    check(r.status === 200, 'a captain takes a hired run', `→ ${r.status}`);
    const liveG4 = await Consignment.findById(G4._id).lean();
    const ordG4 = new Map(
      (await Order.find({ _id: { $in: G4.orderIds } }).lean()).map((x) => [String(x._id), x]));
    const [h0, h1] = liveG4.stops;

    r = await call('POST', `/api/consignments/${G4._id}/stop-outcome`, winner, {
      orderId: h0.orderId, outcome: 'collected_full', otp: ordG4.get(String(h0.orderId)).pickupOtp,
      weightMethod: 'estimated', observedGrade: 'C',
    });
    check(r.status === 409 && r.body.code === 'GRADING_NOT_AVAILABLE',
      'A CAPTAIN POSTING A GRADE IS REFUSED — not silently ignored, refused with a reason',
      `→ ${r.body.code}`);
    check(/not a grader|truck driver/i.test(r.body.error || ''),
      '...and the reason is the honest one: a truck driver is not a grader');
    check(Array.isArray(r.body.conditionFlags) && r.body.conditionFlags.includes('wrong_crop'),
      '...while naming what they CAN attest to, so the answer is not merely "no"',
      `→ ${r.body.conditionFlags?.length} condition flags offered`);

    // ⚠️ THE HALF THAT IS EASY TO MISS.
    r = await call('POST', `/api/consignments/${G4._id}/stop-outcome`, winner, {
      orderId: h0.orderId, outcome: 'collected_full', otp: ordG4.get(String(h0.orderId)).pickupOtp,
      weightMethod: 'estimated',
    });
    check(r.status === 200, 'the same pickup without a grade goes through normally', `→ ${r.status}`);
    check(r.body.grade.observed === null && r.body.grade.discrepancy === null,
      'AND THE GRADE IS NOT DEFAULTED TO THE DECLARATION EITHER. Defaulting would write '
      + '"observed: A, discrepancy: match" — a CONFIRMATION nobody made — and print "matches" over '
      + 'a captain who was never asked',
      `→ observed ${r.body.grade.observed}, discrepancy ${r.body.grade.discrepancy}`);
    check(r.body.grade.declared === 'A',
      "...though what the FARMER declared is still on the record, because they did declare it");
    check(r.body.gradingAvailable === false && /grievance/i.test(r.body.gradingNote || ''),
      'the response says grading was not available here, and where a quality dispute goes instead');
    const hiredOrder0 = await Order.findById(h0.orderId).lean();
    check(hiredOrder0.pickupOutcome.grade.observed === null
      && hiredOrder0.pickupOutcome.grade.discrepancy === null,
      'and the ORDER — what a receipt and a grievance are built from — carries the silence, '
      + 'not a manufactured match');

    // ── WHAT A CAPTAIN CAN SAY: CONDITION ────────────────────────────
    // Not a weaker grade. A different KIND of statement — one that needs eyes,
    // not expertise. "This is not the crop on the order" needs no spec.

    // Asserted against h1 while it is still UNCOLLECTED: a second post to an
    // already-recorded stop answers ALREADY_COLLECTED before validation is
    // ever reached, so ordering this after the pickup would have tested the
    // idempotency guard and called it validation.
    r = await call('POST', `/api/consignments/${G4._id}/stop-outcome`, winner, {
      orderId: h1.orderId, outcome: 'collected_full', otp: ordG4.get(String(h1.orderId)).pickupOtp,
      weightMethod: 'estimated', conditionFlags: ['looks_a_bit_off'],
    });
    check(r.status === 400 && r.body.code === 'BAD_CONDITION',
      'condition is a FIXED LIST, not free text — the same rule as Dispute.reason', `→ ${r.body.code}`);

    r = await call('POST', `/api/consignments/${G4._id}/stop-outcome`, winner, {
      orderId: h1.orderId, outcome: 'collected_full', otp: ordG4.get(String(h1.orderId)).pickupOtp,
      weightMethod: 'public_weighbridge', weightRef: 'WB/2026/8891',
      conditionFlags: ['wet', 'sprouting'], conditionNote: 'Bags damp on the underside.',
    });
    check(r.status === 200 && r.body.condition.anyIssue === true
      && r.body.condition.flags.includes('sprouting'),
      'A CAPTAIN CAN RECORD WHAT THEY SAW — wet, sprouting, wrong crop. The honest floor of what '
      + 'an independent driver is in a position to attest to', `→ ${r.body.condition.flags.join(', ')}`);
    check(r.body.condition.checked === true && r.body.grade.observed === null,
      '...and it stands beside an EMPTY grade, never instead of one');
    check(/not a grade/i.test(r.body.condition.disclaimer || ''),
      'every condition block says in words that it is not a grade');
    const hiredOrder1 = await Order.findById(h1.orderId).lean();
    check(hiredOrder1.pickupOutcome.condition.flags.length === 2
      && hiredOrder1.pickupOutcome.condition.checked === true,
      'and it lands on the order as well as the stop');
    check(hiredOrder1.pricePerKg === 30 && hiredOrder1.farmerPayout === hiredOrder1.cropTotal,
      'A CONDITION NOTE MOVES NO MONEY EITHER — same rule as the grade block',
      `→ ₹${hiredOrder1.pricePerKg}/kg, payout ₹${hiredOrder1.farmerPayout}`);

    // ⚠️ "NOBODY LOOKED" AND "LOOKED, SAW NOTHING WRONG" ARE OPPOSITE FACTS.
    check(hiredOrder0.pickupOutcome.condition.checked === false
      && hiredOrder0.pickupOutcome.condition.flags.length === 0,
      'a pickup where nobody said anything records checked=false — NOT a clean bill of health',
      `→ checked ${hiredOrder0.pickupOutcome.condition.checked}`);
    r = await call('GET', `/api/orders/${h0.orderId}/receipt`, VENDOR);
    check(/Nobody recorded/i.test(r.body.receipt.crop.condition.summary || ''),
      "and the RECEIPT says nobody recorded it, rather than reporting silence as 'no problems'",
      `→ "${r.body.receipt.crop.condition.summary}"`);
    r = await call('GET', `/api/orders/${h1.orderId}/receipt`, VENDOR);
    check(r.body.receipt.crop.condition.anyIssue === true
      && r.body.receipt.crop.gradeCheck.observed === null,
      'while the lot that WAS looked at carries the observation, still with no grade on it');

    await freeCaptain(winner);

    // ── 15. WHAT REACHES THE FARMER'S REPUTATION ──────────────────────
    // trustService already bands a farmer on what they CONCEDED, and refuses
    // to band at all below three completed deliveries. A gate downgrade is
    // exactly that kind of evidence — but only once the farmer agrees to it.
    console.log('\n15. A conceded downgrade reaches the trust signal');
    const trust = require(B('services/trustService'));
    const Dispute = require(B('models/Dispute'));
    const TRUSTF = TAG + 'trustf', TRUSTF2 = TAG + 'trustf2';

    const deliveredOrder = (farmerUid, n) => Order.create({
      listingId: new mongoose.Types.ObjectId(), cropName: TAG + 'Onion',
      quantityKg: 500, pricePerKg: 30, cropTotal: 15000,
      farmerUid, farmerName: 'Trust Farmer', vendorUid: VENDOR, vendorName: 'Buyer',
      pickup: FARMS[0], dropoff: MANDI,
      vehicleType: 'tempo', distanceKm: 50, durationMin: 70,
      fare: { base: 300, perKm: 28, distanceCharge: 1400, total: 1700, agentPayout: 1700 },
      grandTotal: 16700, farmerPayout: 15000, status: 'delivered',
      deliveredAt: new Date(Date.now() - n * 86400000),
    });
    const setGate = (id, observed, response) => Order.updateOne({ _id: id }, {
      $set: {
        'pickupOutcome.grade.declared': 'A',
        'pickupOutcome.grade.observed': observed,
        'pickupOutcome.grade.discrepancy': 'downgrade',
        'pickupOutcome.grade.farmerResponse': response,
      },
    });

    const to = [];
    for (const n of [40, 30, 20, 10]) to.push(await deliveredOrder(TRUSTF, n));

    let t = await trust.forFarmer(TRUSTF);
    check(t.scored && t.band === 'clean' && t.gateGrade.checked === 0,
      'four clean deliveries, nothing observed at any gate → clean',
      `→ band=${t.band}, ${t.gateGrade.downgrades} downgrades`);

    await setGate(to[0]._id, 'C', null);
    t = await trust.forFarmer(TRUSTF);
    check(t.gateGrade.downgrades === 1 && t.gateGrade.unanswered === 1 && t.band === 'few_complaints',
      'A DOWNGRADE THE FARMER HAS NOT ANSWERED IS A CLAIM, not a concession — it counts and it does '
      + 'NOT band them as someone who concedes',
      `→ band=${t.band}, accepted=${t.gateGrade.accepted}`);
    check(t.agreedShortfalls === 0 && t.claimedShortfalls === 1,
      '...claims and agreements are reported apart, exactly as raised and conceded disputes are');

    await setGate(to[0]._id, 'C', 'accepted');
    t = await trust.forFarmer(TRUSTF);
    check(t.gateGrade.accepted === 1 && t.agreedShortfalls === 1 && t.band === 'some_upheld',
      'once the FARMER agrees the lot was lower, it moves the band — mis-grading costs something',
      `→ band=${t.band}`);

    // The same bad lot, disputed and refunded as well. It is ONE bad lot.
    const dGate = await Dispute.create({
      orderId: to[0]._id, raisedByUid: VENDOR, raisedByRole: 'vendor', raisedByName: 'Buyer',
      againstUid: TRUSTF, againstRole: 'farmer', againstName: 'Trust Farmer',
      reason: 'quality_not_as_described', description: 'Sold as A, arrived C',
      status: 'resolved',
      resolution: { outcome: 'partial_refund_agreed', resolvedAt: new Date(), resolvedByRole: 'farmer' },
    });
    t = await trust.forFarmer(TRUSTF);
    check(t.conceded === 1 && t.agreedShortfalls === 1 && t.band === 'some_upheld',
      'a lot downgraded at the gate AND refunded on a grievance is ONE bad lot, counted once',
      `→ conceded=${t.conceded}, gate accepted=${t.gateGrade.accepted}, agreed=${t.agreedShortfalls}`);

    await setGate(to[1]._id, 'B', 'contested');
    t = await trust.forFarmer(TRUSTF);
    check(t.gateGrade.contested === 1 && t.agreedShortfalls === 1 && t.claimedShortfalls === 2,
      'a CONTESTED downgrade is visible and costs the farmer nothing — the driver does not get the '
      + 'last word on somebody else\'s reputation',
      `→ band=${t.band}, agreed=${t.agreedShortfalls} of ${t.claimedShortfalls} claimed`);

    // ⚠️ THE REFUSAL THAT MUST NOT WEAKEN.
    const t2o = [];
    for (const n of [9, 8]) t2o.push(await deliveredOrder(TRUSTF2, n));
    for (const o of t2o) await setGate(o._id, 'C', 'accepted');
    const t2 = await trust.forFarmer(TRUSTF2);
    check(!t2.scored && t2.band === null && t2.deliveries === 2,
      'TWO deliveries with TWO accepted downgrades is STILL not scored — more kinds of evidence '
      + 'about too few trades is still too few trades',
      `→ "${t2.reason}"`);
    check(t2.gateGrade.accepted === 2,
      '...and the counts are still returned, so a reader can draw their own conclusion',
      `→ ${t2.gateGrade.accepted} accepted downgrades reported without a band`);
    check(t2.minTradesToScore === trust.MIN_TRADES_TO_SCORE,
      'against the same unchanged threshold', `→ ${t2.minTradesToScore}`);

    await Dispute.deleteMany({ _id: dGate._id });

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    await Promise.all([
      User.deleteMany({ firebaseUid: new RegExp('^' + TAG) }),
      CropListing.deleteMany({ farmerUid: new RegExp('^' + TAG) }),
      Order.deleteMany({ $or: [{ farmerUid: new RegExp('^' + TAG) }, { vendorUid: new RegExp('^' + TAG) }] }),
      Consignment.deleteMany({ vendorUid: new RegExp('^' + TAG) }),
      Fpo.deleteMany({ name: new RegExp('^' + TAG) }),
    ]);
    console.log('\n🧹 test data removed');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

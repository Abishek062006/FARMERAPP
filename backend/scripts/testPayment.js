// Phase 4 test: the in-app payment rail.
//   node scripts/testPayment.js
//
// ⚠️ The rail is SIMULATED — it moves no money. What is tested is that it
// records the truth about itself: that it says so, that it settles only what it
// is allowed to, that the farmer is paid the CROP value and not the buyer's
// headline, and that it cannot pay twice.
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
const Order = require(B('models/Order'));

const TAG = 'PH6TEST_';
const FARMER = TAG + 'farmer', VENDOR = TAG + 'vendor', OTHER = TAG + 'vendor2';
let pass = 0, fail = 0;
const check = (c, m, x = '') => { c ? (pass++, console.log('  ✅', m, x)) : (fail++, console.log('  ❌', m, x)); };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express(); app.use(express.json());
  app.use('/api/orders', require(B('routes/orders')));
  const server = app.listen(5133);
  const URL = 'http://127.0.0.1:5133';
  const call = async (m, p, uid, body) => {
    const r = await fetch(URL + p, { method: m,
      headers: { 'x-test-uid': uid, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };

  const mkOrder = (over = {}) => Order.create({
    listingId: new mongoose.Types.ObjectId(), cropId: new mongoose.Types.ObjectId(),
    cropName: TAG + 'Onion', quantityKg: 500, pricePerKg: 30, cropTotal: 15000,
    farmerUid: FARMER, farmerName: 'Test Farmer', farmerPhone: '9000000001',
    vendorUid: VENDOR, vendorName: 'Test Buyer', vendorPhone: '9000000002',
    pickup: { lat: 19.99, lng: 73.78, district: 'Nashik' },
    dropoff: { lat: 20.05, lng: 73.81, district: 'Nashik' },
    vehicleType: 'tempo', distanceKm: 12, durationMin: 24,
    fare: { base: 200, perKm: 22, distanceCharge: 1300, total: 1500, agentPayout: 1500 },
    // The buyer's headline is crop + fare; the FARMER is owed the crop only.
    grandTotal: 16500, farmerPayout: 15000,
    status: 'delivered', deliveredAt: new Date(),
    pickupOtp: '1111', dropOtp: '2222',
    ...over,
  });

  try {
    await User.create([
      { firebaseUid: FARMER, name: 'Test Farmer', email: TAG + 'f@t.test', phone: '9000000001', role: 'farmer' },
      { firebaseUid: VENDOR, name: 'Test Buyer', email: TAG + 'v@t.test', phone: '9000000002', role: 'vendor' },
      { firebaseUid: OTHER, name: 'Other Buyer', email: TAG + 'v2@t.test', phone: '9000000003', role: 'vendor' },
    ]);

    // ── 1. a delivered order can be paid ───────────────────────────────
    console.log('\n1. Paying a delivered order');
    const o1 = await mkOrder();
    let r = await call('POST', `/api/orders/${o1._id}/pay`, VENDOR, {});
    check(r.status === 200 && r.body.success, 'the buyer can pay', `→ ${r.status}`);
    check(/^FM-PAY-[A-Z0-9]{8}$/.test(r.body.paid?.ref || ''),
      'a transaction reference is issued', `→ ${r.body.paid?.ref}`);
    check(r.body.paid?.amount === 15000,
      '⚠️ the farmer is paid the CROP value, not the buyer\'s ₹16,500 headline',
      `→ ₹${r.body.paid?.amount} (fare ₹1,500 is the captain\'s)`);
    check(r.body.paid?.simulated === true && /no funds/i.test(r.body.paid?.note || ''),
      'the response says plainly that no money moved');

    const doc = await Order.findById(o1._id).lean();
    check(doc.settlement.farmerPaid === true, 'the order is settled');
    check(doc.settlement.method === 'in_app', 'method records the rail', `→ ${doc.settlement.method}`);
    check(doc.settlement.txn.simulated === true,
      '⚠️ `simulated: true` IS PERSISTED — without it a demo payment is indistinguishable '
      + 'from a real one in every query');
    check(doc.settlement.txn.paidByUid === VENDOR, 'who pressed pay is recorded');

    // ── 2. it cannot be paid twice ─────────────────────────────────────
    console.log('\n2. Paying twice');
    r = await call('POST', `/api/orders/${o1._id}/pay`, VENDOR, {});
    check(r.status === 409 && r.body.code === 'ALREADY_PAID',
      'a second payment is refused by name', `→ ${r.body.code}`);
    check(!!r.body.txn?.ref, 'and hands back the original reference so the UI can show it');

    // ── 3. only the buyer on THAT order ────────────────────────────────
    console.log('\n3. Who may pay');
    const o2 = await mkOrder();
    r = await call('POST', `/api/orders/${o2._id}/pay`, OTHER, {});
    check(r.status === 404, 'a different buyer cannot pay somebody else\'s order', `→ ${r.status}`);
    r = await call('POST', `/api/orders/${o2._id}/pay`, FARMER, {});
    check(r.status === 403, 'the farmer cannot pay themselves', `→ ${r.status}`);

    // ── 4. nothing to pay for yet ──────────────────────────────────────
    console.log('\n4. Before the crop has left the farm');
    const o3 = await mkOrder({ status: 'awaiting_agent', deliveredAt: null });
    r = await call('POST', `/api/orders/${o3._id}/pay`, VENDOR, {});
    check(r.status === 409 && r.body.code === 'NOT_COLLECTED',
      'an uncollected order cannot be paid, and says which refusal it is', `→ ${r.body.code}`);

    const o4 = await mkOrder({ status: 'cancelled' });
    r = await call('POST', `/api/orders/${o4._id}/pay`, VENDOR, {});
    check(r.status === 409, 'a cancelled order cannot be paid', `→ ${r.status}`);

    // ── 5. a stranded order CAN be paid ────────────────────────────────
    console.log('\n5. Stranded produce');
    const o5 = await mkOrder({ status: 'stranded' });
    r = await call('POST', `/api/orders/${o5._id}/pay`, VENDOR, {});
    check(r.status === 200,
      'a STRANDED order is payable — real crop left a real farm and is owed for',
      `→ ${r.status}`);

    // ── 6. the farmer's own /settle still works and is untouched ───────
    console.log('\n6. The old path is unchanged');
    const o6 = await mkOrder();
    r = await call('POST', `/api/orders/${o6._id}/settle`, FARMER, { method: 'cash' });
    const d6 = await Order.findById(o6._id).lean();
    check(r.status === 200 && d6.settlement.method === 'cash',
      'a farmer recording a CASH settlement still works exactly as before');
    check(!d6.settlement.txn?.ref,
      'and carries no txn block — nothing was processed by this app', `→ ${d6.settlement.txn?.ref}`);

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    await Promise.all([
      User.deleteMany({ firebaseUid: new RegExp('^' + TAG) }),
      Order.deleteMany({ farmerUid: new RegExp('^' + TAG) }),
    ]);
    console.log('\n🧹 test data removed');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

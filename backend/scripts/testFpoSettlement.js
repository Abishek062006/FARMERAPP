// F2 test: a member sees their own settlement — every deduction, without
// needing to know which orderIds to ask for, and never another member's row.
//   node scripts/testFpoSettlement.js
//
// ═══ WHAT THIS GUARDS ══════════════════════════════════════════════════════
//
//   • not every sale a member makes is FPO-facilitated. Measured live: of
//     13,309 delivered orders belonging to active FPO members, only 24 carry
//     a consignmentId. The rest are independent sales the group had no part
//     in, and must show NO fee (§1).
//   • a listing the FPO held via F1 walk-in intake is facilitated even with
//     no Consignment at all — consignmentId alone would miss it (§2).
//   • ⚠️ THE NUMBER A MEMBER SEES MUST NEVER DISAGREE WITH THE GROUP'S OWN
//     OFFICIAL TOTAL. A pooled batch's fee is apportioned over the WHOLE
//     batch and only then filtered to one row — never recomputed on a lone
//     member's slice, which can round differently (§3).
//   • `GET /:id/settlement` used to hand any member the WHOLE group's byLot,
//     by name — a real, pre-existing privacy gap this phase also closes (§4).
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
const Fpo = require(B('models/Fpo'));
const CropListing = require(B('models/CropListing'));
const Order = require(B('models/Order'));
const Consignment = require(B('models/Consignment'));

const TAG = 'PH8TEST_';
const ADMIN = TAG + 'admin', M1 = TAG + 'm1', M2 = TAG + 'm2', OUTSIDER = TAG + 'outsider';
let pass = 0, fail = 0;
const check = (c, m, x = '') => { c ? (pass++, console.log('  ✅', m, x)) : (fail++, console.log('  ❌', m, x)); };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express(); app.use(express.json());
  app.use('/api/fpos', require(B('routes/fpos')));
  const server = app.listen(5211);
  const URL = 'http://127.0.0.1:5211';

  const get = (id, path, uid) => fetch(`${URL}/api/fpos/${id}${path}`, { headers: { 'x-test-uid': uid } }).then((r) => r.json());
  const getStatus = async (id, path, uid) => {
    const r = await fetch(`${URL}/api/fpos/${id}${path}`, { headers: { 'x-test-uid': uid } });
    return { status: r.status, body: await r.json() };
  };
  const post = (id, path, uid, body) => fetch(`${URL}/api/fpos/${id}${path}`, {
    method: 'POST', headers: { 'x-test-uid': uid, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => r.json());

  const mkListing = (over = {}) => CropListing.create({
    cropId: new mongoose.Types.ObjectId(), farmerPhone: '9000000001', minOrderKg: 10,
    quantityAvailableKg: 0, totalPrice: 0, status: 'sold_out',
    location: { city: 'X', district: 'Nashik', state: 'Maharashtra', lat: 20, lng: 73.8 },
    ...over,
  });
  const mkOrder = (over = {}) => Order.create({
    vendorPhone: '9000000098', pickup: { lat: 20, lng: 73.8 }, dropoff: { lat: 20.1, lng: 73.9 },
    vehicleType: 'tempo', distanceKm: 5, durationMin: 10, fare: { total: 200, agentPayout: 200 },
    pickupOtp: '1111', dropOtp: '2222', status: 'delivered', deliveredAt: new Date(),
    ...over,
  });

  try {
    await User.create([
      { firebaseUid: ADMIN, name: 'Admin', phone: '9000000090', role: 'fpo' },
      { firebaseUid: M1, name: 'Member One', phone: '9000000091', role: 'farmer' },
      { firebaseUid: M2, name: 'Member Two', phone: '9000000092', role: 'farmer' },
      { firebaseUid: OUTSIDER, name: 'Outsider', phone: '9000000093', role: 'farmer' },
    ]);
    const fpo = await Fpo.create({
      name: TAG + 'FPO', district: 'Nashik', adminUid: ADMIN, adminName: 'Admin',
      paymentMode: 'facilitation', facilitationFee: { mode: 'percent', percent: 5 },
      members: [
        { farmerUid: M1, farmerName: 'Member One', status: 'active' },
        { farmerUid: M2, farmerName: 'Member Two', status: 'active' },
      ],
      premises: { declared: true, lat: 20, lng: 73.8, label: 'Godown', district: 'Nashik' },
    });

    // ── 1. no facilitated sales at all ──────────────────────────────────
    console.log('\n1. Nothing sold through the group yet');
    let r = await getStatus(fpo._id, '/my-settlement', OUTSIDER);
    check(r.status === 403 && r.body.code === 'NOT_A_MEMBER', 'a non-member is refused outright', `→ ${r.body.code}`);

    r = await get(fpo._id, '/my-settlement', M1);
    check(r.success && r.settlements.length === 0 && /no delivered sales/i.test(r.note),
      'a member with literally no delivered orders sees an empty, explained list');

    const indepListing = await mkListing({ farmerUid: M1, farmerName: 'Member One', cropName: TAG + 'Wheat', quantityKg: 100, pricePerKg: 20 });
    await mkOrder({
      listingId: indepListing._id, cropId: indepListing.cropId, cropName: TAG + 'Wheat', quantityKg: 100, pricePerKg: 20, cropTotal: 2000,
      farmerUid: M1, farmerName: 'Member One', farmerPhone: '9000000091',
      vendorUid: TAG + 'buyer1', vendorName: 'Buyer', grandTotal: 2200, farmerPayout: 2000,
    });
    r = await get(fpo._id, '/my-settlement', M1);
    check(r.settlements.length === 0, '⚠️ an INDEPENDENT sale — no consignment, listing never FPO-held — reports nothing');
    check(/no group fee|no part in it/i.test(r.note), 'and says explicitly why: the group had no part in it', `→ "${r.note}"`);

    // ── 2. an F1-held sale IS facilitated, even with no Consignment ────
    console.log('\n2. A sale from an F1-held listing IS facilitated');
    const forIntake = await mkListing({ farmerUid: M1, farmerName: 'Member One', cropName: TAG + 'Onion', quantityKg: 500, quantityAvailableKg: 500, pricePerKg: 22, status: 'available' });
    const intake = await post(fpo._id, '/intake', ADMIN, { listingId: forIntake._id, quantityKg: 500, weightMethod: 'farm_scale' });
    check(intake.success, 'the intake itself succeeds (F1, sanity)', `→ ${intake.success}`);
    const heldId = intake.receipt.heldListingId;
    await CropListing.updateOne({ _id: heldId }, { $set: { quantityAvailableKg: 0, status: 'sold_out' } });
    await mkOrder({
      listingId: heldId, cropId: forIntake.cropId, cropName: TAG + 'Onion', quantityKg: 500, pricePerKg: 22, cropTotal: 11000,
      farmerUid: M1, farmerName: 'Member One', farmerPhone: '9000000091',
      vendorUid: TAG + 'buyer2', vendorName: 'Buyer', grandTotal: 11200, farmerPayout: 11000,
      settlement: { farmerPaid: true, paidAt: new Date(), method: 'in_app', txn: { ref: 'FM-PAY-T2', simulated: true } },
    });

    r = await get(fpo._id, '/my-settlement', M1);
    check(r.settlements.length === 1, '⚠️ NO consignmentId, but the listing was FPO-held — this DOES count', `→ ${r.settlements.length}`);
    const s1 = r.settlements[0];
    check(s1.type === 'fpo_held', 'labelled correctly, distinct from a pooled sale', `→ ${s1.type}`);
    check(s1.grossAmount === 11000, 'gross is the sale value', `→ ${s1.grossAmount}`);
    check(s1.fpoFee === 550, '5% of 11,000 = 550', `→ ${s1.fpoFee}`);
    check(s1.amount === 10450, 'and the net is gross minus the fee', `→ ${s1.amount}`);
    check(s1.settled === true && s1.paidAt && s1.txnRef === 'FM-PAY-T2' && s1.simulated === true,
      'payment status, reference and the simulated flag all ride along');
    check(s1.freightOwed === 0, 'no vehicle moved this — freight owed is zero');

    // ── 3. a pooled batch: correctness AND privacy together ─────────────
    console.log('\n3. A pooled sale — the number must match the group total, and show ONLY my own row');
    const l1 = await mkListing({ farmerUid: M1, farmerName: 'Member One', cropName: TAG + 'Grapes', quantityKg: 400, pricePerKg: 30 });
    const l2 = await mkListing({ farmerUid: M2, farmerName: 'Member Two', cropName: TAG + 'Grapes', quantityKg: 600, pricePerKg: 30 });
    const o1Id = new mongoose.Types.ObjectId(), o2Id = new mongoose.Types.ObjectId();
    const cons = await Consignment.create({
      vendorUid: TAG + 'buyer3', vendorName: 'Buyer3', vendorPhone: '9000000097',
      orderIds: [o1Id, o2Id],
      stops: [
        { orderId: o1Id, farmerUid: M1, farmerName: 'Member One', farmerPhone: '9000000091', cropName: TAG + 'Grapes', quantityKg: 400, lat: 20, lng: 73.8, label: 'F1', sequence: 0, legKm: 5, fareShare: 200, fareShareBasisKg: 400 },
        { orderId: o2Id, farmerUid: M2, farmerName: 'Member Two', farmerPhone: '9000000092', cropName: TAG + 'Grapes', quantityKg: 600, lat: 20.05, lng: 73.85, label: 'F2', sequence: 1, legKm: 5, fareShare: 300, fareShareBasisKg: 600 },
      ],
      dropoff: { lat: 20.1, lng: 73.9 }, vehicleType: 'tempo', totalQuantityKg: 1000, distanceKm: 20, durationMin: 40,
      fare: { total: 500, agentPayout: 500 }, status: 'delivered',
    });
    await mkOrder({ _id: o1Id, listingId: l1._id, cropId: l1.cropId, cropName: TAG + 'Grapes', quantityKg: 400, pricePerKg: 30, cropTotal: 12000, farmerUid: M1, farmerName: 'Member One', farmerPhone: '9000000091', vendorUid: TAG + 'buyer3', vendorName: 'Buyer3', grandTotal: 12200, farmerPayout: 12000, consignmentId: cons._id });
    await mkOrder({ _id: o2Id, listingId: l2._id, cropId: l2.cropId, cropName: TAG + 'Grapes', quantityKg: 600, pricePerKg: 30, cropTotal: 18000, farmerUid: M2, farmerName: 'Member Two', farmerPhone: '9000000092', vendorUid: TAG + 'buyer3', vendorName: 'Buyer3', grandTotal: 18300, farmerPayout: 18000, consignmentId: cons._id });

    const mine = await get(fpo._id, '/my-settlement', M1);
    const pooledRow = mine.settlements.find((x) => x.type === 'pooled');
    check(!!pooledRow, 'the pooled sale shows up in M1\'s own list');
    check(pooledRow.quantityKg === 400 && pooledRow.grossAmount === 12000,
      'only M1\'s OWN 400 kg / ₹12,000 — never the pooled total', `→ ${pooledRow.quantityKg} kg, ₹${pooledRow.grossAmount}`);
    check(!JSON.stringify(mine).includes('Member Two'),
      '⚠️ the other contributing member\'s name never appears anywhere in the response');

    const asAdmin = await get(fpo._id, `/settlement?orderIds=${o1Id},${o2Id}`, ADMIN);
    check(asAdmin.settlement.byLot.length === 2, 'the ADMIN\'s view of the same batch shows both members', `→ ${asAdmin.settlement.byLot.length}`);
    const adminM1 = asAdmin.settlement.byLot.find((x) => x.farmerUid === M1);
    check(adminM1.amount === pooledRow.amount,
      '⚠️ AND M1\'s number matches EXACTLY between the two views — never a second, cheaper computation',
      `→ admin says ${adminM1.amount}, member\'s own view says ${pooledRow.amount}`);

    // ── 4. the privacy fix on GET /:id/settlement itself ─────────────────
    console.log('\n4. GET /:id/settlement no longer hands an ordinary member the whole group');
    const asM2 = await get(fpo._id, `/settlement?orderIds=${o1Id},${o2Id}`, M2);
    check(asM2.settlement.byLot.length === 1, 'M2 (an ordinary member, not the admin) sees ONLY their own row', `→ ${asM2.settlement.byLot.length}`);
    check(asM2.settlement.byLot[0].farmerUid === M2, 'and it is genuinely their own row, not an empty one');
    check(!JSON.stringify(asM2).includes('Member One'),
      '⚠️ M1\'s name is not in the response at all — the pre-existing leak this phase closes');
    check(asM2.settlement.scope === 'own', 'the response says it is a narrowed view, same convention as GET /:id/orders');

    const asBuyer = await get(fpo._id, `/settlement?orderIds=${o1Id},${o2Id}`, TAG + 'buyer3');
    check(asBuyer.settlement.byLot.length === 2,
      'the BUYER who placed both orders still sees the full breakdown — they are entitled to know how their own purchase split');

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    await Promise.all([
      User.deleteMany({ firebaseUid: new RegExp('^' + TAG) }),
      Fpo.deleteMany({ name: new RegExp('^' + TAG) }),
      CropListing.deleteMany({ $or: [
        { farmerUid: new RegExp('^' + TAG) }, { cropName: new RegExp('^' + TAG) },
      ] }),
      Order.deleteMany({ farmerUid: new RegExp('^' + TAG) }),
      Consignment.deleteMany({ vendorUid: new RegExp('^' + TAG) }),
    ]);
    console.log('\n🧹 test data removed');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

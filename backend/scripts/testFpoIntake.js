// F1 test: walk-in intake — a member brings produce to the godown directly.
//   node scripts/testFpoIntake.js
//
// ═══ WHAT THIS REPLACES ══════════════════════════════════════════════════
//
// F0 retired farm→FPO transport: nothing in the problem statement's
// aggregation clause asks for a vehicle on this leg, and it was making the
// FPO section more confusing than it needed to be (see CLAUDE.md). Produce
// still has to physically arrive at the godown somehow — this is that
// "somehow", and it deliberately has NO vehicle, NO route and NO fare.
//
// What is guarded here:
//   • the route requires an EXISTING listing (§2) — it must never become a
//     second way to invent a lot's identity
//   • only an active member's own produce may be brought in (§3)
//   • a partial arrival is the honest common case, an excess one is refused (§4)
//   • weight provenance is REQUIRED, exactly as a real pickup requires it (§5)
//   • the FPO's own person MAY grade here — data/gateRecord.js's GRADING_ROLES
//     already includes 'fpo_admin' for exactly this case (§6)
//   • custody moves through the SAME shared function the (retired) run-based
//     path used — moveListingToFpoCustody() — so there are not two
//     definitions of "this lot is now in the FPO's custody" (§7)
//   • freight owed is UNCONDITIONALLY ZERO — nothing was hired to move it (§7)
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

const TAG = 'PH7TEST_';
const ADMIN = TAG + 'admin', FARMER = TAG + 'farmer', OUTSIDER_FARMER = TAG + 'outsider';
let pass = 0, fail = 0;
const check = (c, m, x = '') => { c ? (pass++, console.log('  ✅', m, x)) : (fail++, console.log('  ❌', m, x)); };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express(); app.use(express.json());
  app.use('/api/fpos', require(B('routes/fpos')));
  const server = app.listen(5141);
  const URL = 'http://127.0.0.1:5141';

  const call = async (id, uid, body) => {
    const r = await fetch(`${URL}/api/fpos/${id}/intake`, {
      method: 'POST', headers: { 'x-test-uid': uid, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return { status: r.status, body: await r.json() };
  };

  const mkListing = (over = {}) => CropListing.create({
    cropId: new mongoose.Types.ObjectId(), farmerUid: FARMER, farmerName: 'Test Farmer',
    farmerPhone: '9000000001', cropName: TAG + 'Onion', quantityKg: 500, quantityAvailableKg: 500,
    minOrderKg: 25, pricePerKg: 22, totalPrice: 11000, status: 'available',
    location: { city: 'Testville', district: 'Nashik', state: 'Maharashtra', lat: 19.99, lng: 73.78 },
    ...over,
  });

  try {
    await User.create([
      { firebaseUid: ADMIN, name: 'Group Office', email: TAG + 'a@t.test', phone: '9000000099', role: 'fpo' },
      { firebaseUid: FARMER, name: 'Test Farmer', email: TAG + 'f@t.test', phone: '9000000001', role: 'farmer' },
      { firebaseUid: OUTSIDER_FARMER, name: 'Outsider', email: TAG + 'o@t.test', phone: '9000000002', role: 'farmer' },
    ]);

    const fpo = await Fpo.create({
      name: TAG + 'Niphad Growers', district: 'Nashik', adminUid: ADMIN, adminName: 'Group Office',
      members: [{ farmerUid: FARMER, farmerName: 'Test Farmer', status: 'active' }],
      // premises deliberately NOT declared yet — §1 needs that
    });

    // ── 1. no godown declared ───────────────────────────────────────────
    console.log('\n1. The group must have a godown before it can receive anything');
    const l0 = await mkListing();
    let r = await call(fpo._id, ADMIN, {
      listingId: l0._id, quantityKg: 100, weightMethod: 'farm_scale',
    });
    check(r.status === 400 && r.body.code === 'NO_PREMISES',
      'refused by name, before touching the listing at all', `→ ${r.body.code}`);
    const untouched = await CropListing.findById(l0._id).lean();
    check(untouched.quantityAvailableKg === 500, 'and nothing was decremented');

    // Declare it, so every section after this one can actually run.
    await Fpo.updateOne({ _id: fpo._id }, { $set: {
      'premises.declared': true, 'premises.lat': 20.05, 'premises.lng': 74.11,
      'premises.label': TAG + 'Godown', 'premises.district': 'Nashik',
    } });

    // ── 2. must be a real, available listing ────────────────────────────
    console.log('\n2. Only a real, available listing can be brought in');
    r = await call(fpo._id, ADMIN, {
      listingId: new mongoose.Types.ObjectId(), quantityKg: 100, weightMethod: 'farm_scale',
    });
    check(r.status === 409 && r.body.code === 'LISTING_UNAVAILABLE',
      'a listing that does not exist is refused', `→ ${r.body.code}`);

    const withdrawn = await mkListing({ status: 'withdrawn' });
    r = await call(fpo._id, ADMIN, { listingId: withdrawn._id, quantityKg: 100, weightMethod: 'farm_scale' });
    check(r.status === 409 && r.body.code === 'LISTING_UNAVAILABLE',
      'a withdrawn listing cannot be brought in either', `→ ${r.body.code}`);

    // ── 3. only an ACTIVE MEMBER's own produce ──────────────────────────
    console.log('\n3. Only an active member\'s own produce may be brought in');
    const outsiderListing = await mkListing({ farmerUid: OUTSIDER_FARMER, farmerName: 'Outsider' });
    r = await call(fpo._id, ADMIN, { listingId: outsiderListing._id, quantityKg: 100, weightMethod: 'farm_scale' });
    check(r.status === 403 && r.body.code === 'NOT_A_MEMBER',
      'produce from a non-member is refused', `→ ${r.body.code}`);
    const untouchedOutsider = await CropListing.findById(outsiderListing._id).lean();
    check(untouchedOutsider.quantityAvailableKg === 500, 'and nothing of theirs was touched');

    // Only the group's own admin may record an intake at all.
    r = await call(fpo._id, OUTSIDER_FARMER, { listingId: l0._id, quantityKg: 100, weightMethod: 'farm_scale' });
    check(r.status === 403, 'and only the GROUP\'S OWN admin may record an intake', `→ ${r.status}`);

    // ── 4. quantity — partial is honest, excess is refused ──────────────
    console.log('\n4. Quantity: partial is the honest common case, excess is invented stock');
    r = await call(fpo._id, ADMIN, { listingId: l0._id, quantityKg: 0, weightMethod: 'farm_scale' });
    check(r.status === 400 && r.body.code === 'BAD_QUANTITY', 'zero is refused', `→ ${r.body.code}`);
    r = await call(fpo._id, ADMIN, { listingId: l0._id, quantityKg: 9999, weightMethod: 'farm_scale' });
    check(r.status === 400 && r.body.code === 'EXCEEDS_LISTING',
      'more than the listing has is refused — that would be inventing stock', `→ ${r.body.code}`);

    // ── 5. weight provenance is REQUIRED ────────────────────────────────
    console.log('\n5. How it was weighed is required, exactly as a real pickup requires it');
    r = await call(fpo._id, ADMIN, { listingId: l0._id, quantityKg: 100 });
    check(r.status === 400 && r.body.code === 'WEIGHT_METHOD_REQUIRED',
      'no weighing method named → refused', `→ ${r.body.code}`);
    r = await call(fpo._id, ADMIN, { listingId: l0._id, quantityKg: 100, weightMethod: 'not_recorded' });
    check(r.status === 400 && r.body.code === 'WEIGHT_METHOD_REQUIRED',
      '⚠️ `not_recorded` is SERVER-SET ONLY and is not a postable method — a caller cannot claim it',
      `→ ${r.body.code}`);

    // ── 6. THE REAL INTAKE — weight, grade (an upgrade), condition ──────
    console.log('\n6. A real intake: partial arrival, the FPO grades it, condition noted');
    const l1 = await mkListing({ grade: { code: 'B', specKey: 'default', specVersion: 1, selfDeclared: true } });
    r = await call(fpo._id, ADMIN, {
      listingId: l1._id, quantityKg: 480, weightMethod: 'collection_centre_scale',
      gradeObserved: 'A', conditionChecked: true, conditionFlags: ['wet'],
    });
    check(r.status === 200 && r.body.success, 'the intake is recorded', `→ ${r.status}`);
    const rc = r.body.receipt;
    check(rc.kg === 480, 'the receipt carries the ARRIVED quantity, not the listing\'s original', `→ ${rc.kg}`);
    check(rc.weight.method === 'collection_centre_scale' && rc.weight.weighed === true,
      'weight provenance is described through the shared gateRecord vocabulary');
    check(rc.grade.declared === 'B' && rc.grade.observed === 'A' && rc.grade.discrepancy === 'upgrade',
      '⚠️ the FPO\'s OWN person graded it, and grading up costs nobody anything',
      `→ declared ${rc.grade.declared} → observed ${rc.grade.observed} (${rc.grade.discrepancy})`);
    check(rc.condition.anyIssue === true && rc.condition.flags.includes('wet'),
      'condition is recorded through the same shared vocabulary a gate outcome uses');
    check(!!rc.heldListingId, 'a held listing was created', `→ ${rc.heldListingId}`);

    const src = await CropListing.findById(l1._id).lean();
    check(src.quantityAvailableKg === 20, 'the SOURCE listing is decremented by exactly what arrived',
      `→ 500 - 480 = ${src.quantityAvailableKg}`);
    check(src.status === 'available', 'and stays on the market for its remaining 20 kg');

    const held = await CropListing.findById(rc.heldListingId).lean();
    check(held.farmerUid === FARMER && held.pricePerKg === l1.pricePerKg,
      'ownership and the farmer\'s own asking price ride across untouched — the FPO is holding it, not buying it');
    check(held.location.district === 'Nashik' && held.location.city === TAG + 'Godown',
      'the held listing sits at the GROUP\'S premises, not the farm', `→ ${held.location.city}`);
    check(Array.isArray(held.geo?.coordinates) && held.geo.coordinates[0] === 74.11 && held.geo.coordinates[1] === 20.05,
      '⚠️ geo.coordinates is [lng, lat] — the GeoJSON order, not the app\'s usual [lat, lng]');
    check(held.custody?.heldAt === 'fpo' && String(held.custody.fpoId) === String(fpo._id),
      'custody is stamped to this group');
    check(held.custody.collectionRunId === null,
      '⚠️ collectionRunId is honestly NULL — no run carried this, and pointing at a fake one would be '
      + 'the exact fabrication this app refuses everywhere else');
    check(held.custody.freightOwedPerKg === 0,
      '⚠️ freight owed is UNCONDITIONALLY ZERO — nothing was hired to move it', `→ ${held.custody.freightOwedPerKg}`);
    check(held.custody.originLabel === 'Testville' && held.custody.originDistrict === 'Nashik',
      'and the farm it came FROM is still on the record');
    check(held.custody.intake?.recordedBy === ADMIN,
      'the intake block names who recorded it, on the HELD listing itself');
    check(held.cropId?.toString() === l1.cropId.toString(),
      'cropId is CARRIED OVER, not minted — this stays tied to the farmer\'s own agronomic record');

    // ── 7. a downgrade is a CLAIM, never a repricing ────────────────────
    console.log('\n7. A downgrade is recorded as a claim; nothing is repriced');
    const l2 = await mkListing({ grade: { code: 'A', specKey: 'default', specVersion: 1, selfDeclared: true } });
    r = await call(fpo._id, ADMIN, {
      listingId: l2._id, quantityKg: 500, weightMethod: 'farm_scale', gradeObserved: 'C',
    });
    check(r.body.receipt.grade.discrepancy === 'downgrade', 'observed below declared → downgrade',
      `→ ${r.body.receipt.grade.discrepancy}`);
    check(r.body.receipt.grade.farmerResponse === null,
      '⚠️ and it is NOT a concession until the farmer answers it — farmerResponse starts null, '
      + 'exactly like a gate downgrade on an Order');
    const held2 = await CropListing.findById(r.body.receipt.heldListingId).lean();
    check(held2.pricePerKg === l2.pricePerKg,
      'the price is UNCHANGED by the downgrade — this app never reprices a lot on either side of a grade check');

    // ── 8. an ungraded listing is a fact, not a discrepancy ─────────────
    console.log('\n8. Grading a previously-ungraded lot is an observation, not a discrepancy');
    const l3 = await mkListing(); // no grade field at all
    r = await call(fpo._id, ADMIN, { listingId: l3._id, quantityKg: 500, weightMethod: 'farm_scale', gradeObserved: 'B' });
    check(r.body.receipt.grade.discrepancy === 'observed_only',
      'nothing was declared, so there is nothing to fall short of', `→ ${r.body.receipt.grade.discrepancy}`);

    // ── 9. a bad grade letter is refused, not silently dropped ──────────
    console.log('\n9. An invalid grade letter is refused');
    const l4 = await mkListing();
    r = await call(fpo._id, ADMIN, { listingId: l4._id, quantityKg: 100, weightMethod: 'farm_scale', gradeObserved: 'Z' });
    check(r.status === 400 && r.body.code === 'BAD_GRADE', 'refused by name', `→ ${r.body.code}`);
    r = await call(fpo._id, ADMIN, { listingId: l4._id, quantityKg: 100, weightMethod: 'farm_scale', conditionFlags: ['not_a_real_flag'] });
    check(r.status === 400 && r.body.code === 'BAD_CONDITION_FLAGS', 'and an unknown condition flag likewise', `→ ${r.body.code}`);

    // ── 10. "checked and clean" is not the same as "never looked" ──────
    console.log('\n10. `checked: true, no flags` and `never checked` are different facts');
    const l5 = await mkListing();
    r = await call(fpo._id, ADMIN, {
      listingId: l5._id, quantityKg: 100, weightMethod: 'farm_scale', conditionChecked: true,
    });
    const held5 = await CropListing.findById(r.body.receipt.heldListingId).lean();
    check(held5.custody.intake.condition.checked === true && held5.custody.intake.condition.flags.length === 0,
      '⚠️ someone looked and found nothing — stored as checked:true, flags:[]');
    const l6 = await mkListing();
    r = await call(fpo._id, ADMIN, { listingId: l6._id, quantityKg: 100, weightMethod: 'farm_scale' });
    const held6 = await CropListing.findById(r.body.receipt.heldListingId).lean();
    check(held6.custody.intake.condition.checked === false,
      'nobody looked — stored as checked:false, NOT collapsed into the same shape as "looked, clean"');

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    await Promise.all([
      User.deleteMany({ firebaseUid: new RegExp('^' + TAG) }),
      Fpo.deleteMany({ name: new RegExp('^' + TAG) }),
      CropListing.deleteMany({ $or: [
        { farmerUid: new RegExp('^' + TAG) },
        { cropName: new RegExp('^' + TAG) },
        { 'location.city': new RegExp('^' + TAG) },
      ] }),
    ]);
    console.log('\n🧹 test data removed');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

// Phase E test: the demand side.
//   node scripts/testRequirements.js
//
// Runs the REAL routes against the REAL Atlas database, auth stubbed via the
// require cache. Data namespaced "PHETEST_" and deleted in the finally block.
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
const Land = require(B('models/Land'));
const CropListing = require(B('models/CropListing'));
const Requirement = require(B('models/Requirement'));

const TAG = 'PHETEST_';
const FARMER = TAG + 'farmer', FARMER2 = TAG + 'farmer2';
const VENDOR = TAG + 'vendor', VENDOR2 = TAG + 'vendor2';
// A farmer who never gets a listing, so 'no listings -> no signal' stays true
// no matter what earlier sections create.
const FARMER3 = TAG + 'farmer3';

// Nashik farm; Lasalgaon mandi ~50 km east; Nagpur ~450 km away.
const NASHIK    = { lat: 19.9975, lng: 73.7898 };
const LASALGAON = { lat: 20.1417, lng: 74.2417 };
const NAGPUR    = { lat: 21.1458, lng: 79.0882 };

let pass = 0, fail = 0;
const check = (cond, m, extra = '') => {
  if (cond) { pass++; console.log('  ✅', m, extra); }
  else { fail++; console.log('  ❌', m, extra); }
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express();
  app.use(express.json());
  app.use('/api/requirements', require(B('routes/requirements')));
  const server = app.listen(5126);
  const URL = 'http://127.0.0.1:5126';

  const call = async (method, p, uid, body) => {
    const r = await fetch(URL + p, {
      method, headers: { 'x-test-uid': uid, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };

  const mkListing = (over = {}) => CropListing.create({
    cropId: new mongoose.Types.ObjectId(), farmerUid: FARMER,
    farmerName: 'Test Farmer', farmerPhone: '9000000001',
    cropName: TAG + 'Onion', quantityKg: 500, quantityAvailableKg: 500,
    minOrderKg: 25, pricePerKg: 30, totalPrice: 15000,
    location: { city: 'Testville', district: 'Nashik', state: 'Maharashtra', ...NASHIK },
    status: 'available', ...over,
  });

  // ⚠️ priceMin/priceMax default to a real range, not null. A requirement
  // with NEITHER set is deliberately excluded from a farmer's matched feed
  // (routes/requirements.js matchRequirementsForPoints — "I want Onion" with
  // no rate offered is a real want but not one a farmer can act on). Every
  // OTHER assertion in this file assumes a normal, matchable requirement, so
  // that has to be the default; §2b below tests the exclusion itself.
  const mkReq = (uid, over = {}) => call('POST', '/api/requirements', uid, {
    commodity: TAG + 'Onion', quantityKg: 2000,
    deliveryPoint: { ...LASALGAON, label: 'Lasalgaon mandi', district: 'Nashik' },
    radiusKm: 80, priceMin: 18, priceMax: 26, ...over,
  });

  console.log('\n📣 The demand side (E)\n');

  try {
    await User.create([
      { firebaseUid: FARMER,  name: 'Test Farmer', email: TAG + 'f@t.com',  phone: '9000000001', role: 'farmer' },
      { firebaseUid: FARMER2, name: 'Far Farmer',  email: TAG + 'f2@t.com', phone: '9000000005', role: 'farmer' },
      { firebaseUid: VENDOR,  name: 'Test Buyer',  email: TAG + 'v@t.com',  phone: '9000000002', role: 'vendor' },
      { firebaseUid: VENDOR2, name: 'Rival Buyer', email: TAG + 'v2@t.com', phone: '9000000003', role: 'vendor' },
      { firebaseUid: FARMER3, name: 'Bare Farmer', email: TAG + 'f3@t.com', phone: '9000000006', role: 'farmer' },
    ]);
    // req.profile is attached by requireRole(), which every route here uses —
    // the auth stub does not need to provide it.

    const L = await mkListing();

    // ── 1. posting a want ─────────────────────────────────────────────
    console.log('1. A buyer advertises a want');
    let r = await mkReq(VENDOR);
    check(r.status === 201, 'a buyer posts a requirement', `→ ${r.status}`);
    const req1 = r.body.requirement;
    check(req1.status === 'open', 'it starts open');
    check(!!req1.expiresAt, 'and it expires — a stale want is noise');

    r = await mkReq(FARMER);
    check(r.status === 403, 'a farmer cannot post a requirement (role-gated)', `→ ${r.status}`);

    r = await mkReq(VENDOR, { commodity: '' });
    check(r.status === 400, 'a requirement with no crop is rejected');
    r = await mkReq(VENDOR, { quantityKg: 0 });
    check(r.status === 400, 'a requirement with no quantity is rejected');
    r = await mkReq(VENDOR, { deliveryPoint: null });
    check(r.status === 400, 'a requirement with no delivery point is rejected');
    r = await mkReq(VENDOR, { priceMin: 40, priceMax: 20 });
    check(r.status === 400, 'an inverted price range is rejected');
    r = await mkReq(VENDOR, { minGrade: 'Z' });
    check(r.status === 400, 'a grade outside the spec is rejected');

    // ── 2. the farmer's matched feed ──────────────────────────────────
    console.log('\n2. "Buyers looking for your crop"');
    r = await call('GET', '/api/requirements/for-farmer', FARMER);
    let mine = r.body.requirements.filter((x) => x.commodity.startsWith(TAG));
    check(mine.length === 1, 'the farmer sees a nearby want for a crop they have', `→ ${mine.length}`);
    check(mine[0].distanceKm > 0 && mine[0].distanceKm < 80,
      'with the real distance to the buyer', `→ ${mine[0].distanceKm} km`);
    check(mine[0].matchingListings.length === 1,
      'and which of their own lots could fill it', `→ ${mine[0].matchingListings.length}`);
    check(mine[0].responses === undefined,
      'a farmer never sees who ELSE responded');

    // 🐛 REPORTED DIRECTLY — a want with no price mentioned at all read as
    // broken to a farmer opening this screen. Posting one with neither
    // priceMin nor priceMax set is still a valid requirement (VENDOR2 can
    // post it); it must simply never reach a farmer's matched feed, because
    // there is nothing in it to compare against their own asking price.
    r = await mkReq(VENDOR2, { priceMin: null, priceMax: null });
    check(r.status === 201, 'a requirement with NEITHER price bound is still accepted as posted');
    r = await call('GET', '/api/requirements/for-farmer', FARMER);
    mine = r.body.requirements.filter((x) => x.commodity.startsWith(TAG));
    check(mine.length === 1,
      'but it never reaches the farmer\'s feed — nothing in it to act on', `→ ${mine.length}`);

    // Out of the buyer's own radius.
    await mkReq(VENDOR2, {
      deliveryPoint: { ...NAGPUR, label: 'Nagpur', district: 'Nagpur' }, radiusKm: 50,
    });
    r = await call('GET', '/api/requirements/for-farmer', FARMER);
    mine = r.body.requirements.filter((x) => x.commodity.startsWith(TAG));
    check(mine.length === 1,
      "a want 450 km away is excluded — the BUYER's radius is respected", `→ ${mine.length}`);

    // A crop the farmer does not have.
    await mkReq(VENDOR2, { commodity: TAG + 'Cotton' });
    r = await call('GET', '/api/requirements/for-farmer', FARMER);
    mine = r.body.requirements.filter((x) => x.commodity.startsWith(TAG));
    check(mine.every((x) => x.commodity === TAG + 'Onion'),
      'a want for a crop they cannot supply is excluded');
    r = await call('GET', '/api/requirements/for-farmer?all=1', FARMER);
    check(r.body.requirements.filter((x) => x.commodity.startsWith(TAG)).length > mine.length,
      '?all=1 shows everything nearby anyway', '→ farmer can still look');

    // A farmer with nothing listed and no land.
    r = await call('GET', '/api/requirements/for-farmer', FARMER2);
    check(r.body.requirements.length === 0 && r.body.reason === 'NO_LOCATION',
      'a farmer with no location gets an honest empty result', `→ ${r.body.reason}`);

    // ── 3. grade filtering ────────────────────────────────────────────
    console.log('\n3. Grade');
    const gradedReq = (await mkReq(VENDOR2, { minGrade: 'A' })).body.requirement;
    await CropListing.updateOne({ _id: L._id }, { $set: { 'grade.code': 'C' } });
    r = await call('GET', '/api/requirements/for-farmer', FARMER);
    check(!r.body.requirements.some((x) => String(x._id) === String(gradedReq._id)),
      'a Grade C lot is not shown a Grade A requirement');

    await CropListing.updateOne({ _id: L._id }, { $set: { 'grade.code': 'A' } });
    r = await call('GET', '/api/requirements/for-farmer', FARMER);
    check(r.body.requirements.some((x) => String(x._id) === String(gradedReq._id)),
      'a Grade A lot is');

    await CropListing.updateOne({ _id: L._id }, { $set: { 'grade.code': null } });
    r = await call('GET', '/api/requirements/for-farmer', FARMER);
    check(r.body.requirements.some((x) => String(x._id) === String(gradedReq._id)),
      'an UNGRADED lot is not excluded — most listings have no grade');

    // ── 4. responding ─────────────────────────────────────────────────
    console.log('\n4. The farmer raises a hand');
    r = await call('POST', `/api/requirements/${req1._id}/respond`, FARMER, {
      listingId: L._id, note: 'Ready now',
    });
    check(r.status === 201, 'the farmer puts a lot forward', `→ ${r.status}`);
    check(/make an offer/i.test(r.body.next || ''),
      'and is told what happens next — this is NOT a sale');

    let stored = await Requirement.findById(req1._id).lean();
    check(stored.responses.length === 1, 'the buyer now has one response');
    check(stored.responses[0].distanceKm > 0, 'carrying the distance', `→ ${stored.responses[0].distanceKm} km`);
    check(stored.responses[0].pricePerKg === 30, 'and the price, defaulted from the listing');

    r = await call('POST', `/api/requirements/${req1._id}/respond`, FARMER, { listingId: L._id });
    check(r.status === 409 && r.body.code === 'ALREADY_RESPONDED',
      'the same lot cannot be put forward twice', `→ ${r.body.code}`);

    const otherFarmerListing = await mkListing({ farmerUid: FARMER2, farmerName: 'Far Farmer' });
    r = await call('POST', `/api/requirements/${req1._id}/respond`, FARMER, { listingId: otherFarmerListing._id });
    check(r.status === 403, "a farmer cannot put forward someone ELSE'S listing", `→ ${r.status}`);

    r = await call('POST', `/api/requirements/${req1._id}/respond`, VENDOR, { listingId: L._id });
    check(r.status === 403, 'a buyer cannot respond to a requirement', `→ ${r.status}`);

    r = await call('GET', '/api/requirements/for-farmer', FARMER);
    const seen = r.body.requirements.find((x) => String(x._id) === String(req1._id));
    check(seen?.iResponded === true, 'the feed remembers that they already responded');

    // ── 5. the buyer's view ───────────────────────────────────────────
    console.log('\n5. The buyer reads the responses');
    r = await call('GET', '/api/requirements/vendor/mine', VENDOR);
    const theirs = r.body.requirements.filter((x) => x.commodity.startsWith(TAG));
    check(theirs.length >= 1, 'the buyer sees their own wants', `→ ${theirs.length}`);
    const withResp = theirs.find((x) => String(x._id) === String(req1._id));
    check(withResp.responses.length === 1, 'WITH the responses attached');
    check(withResp.responses[0].farmerName === 'Test Farmer', 'naming the farmer');

    r = await call('GET', '/api/requirements/vendor/mine', VENDOR2);
    check(!r.body.requirements.some((x) => String(x._id) === String(req1._id)),
      "another buyer cannot see someone else's requirement");

    // ── 6. closing ────────────────────────────────────────────────────
    console.log('\n6. Closing');
    r = await call('PUT', `/api/requirements/${req1._id}/close`, VENDOR2, {});
    check(r.status === 403, 'only the owner can close it', `→ ${r.status}`);
    r = await call('PUT', `/api/requirements/${req1._id}/close`, VENDOR, { fulfilled: true });
    check(r.status === 200 && r.body.requirement.status === 'fulfilled', 'the buyer closes it as fulfilled');
    r = await call('PUT', `/api/requirements/${req1._id}/close`, VENDOR, {});
    check(r.status === 409 && r.body.code === 'ALREADY_CLOSED', 'closing twice is refused');

    r = await call('POST', `/api/requirements/${req1._id}/respond`, FARMER, { listingId: L._id });
    check(r.status === 409 && r.body.code === 'NOT_OPEN',
      'a closed requirement takes no more responses', `→ ${r.body.code}`);

    // ── 7. expiry ─────────────────────────────────────────────────────
    console.log('\n7. Expiry');
    const stale = (await mkReq(VENDOR)).body.requirement;
    await Requirement.updateOne({ _id: stale._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await call('GET', '/api/requirements/for-farmer', FARMER);      // triggers the sweep
    const swept = await Requirement.findById(stale._id).lean();
    check(swept.status === 'expired', 'a stale want lapses on read', `→ ${swept.status}`);

    // ── 8. the dashboard signal ───────────────────────────────────────
    console.log('\n8. The dashboard signal');
    await mkReq(VENDOR);
    r = await call('GET', '/api/requirements/signal', FARMER);
    check(r.body.signal !== null, 'the farmer gets a demand signal');
    check(/buyers? wants? .* near you/i.test(r.body.signal.text),
      'phrased for a dashboard', `→ "${r.body.signal.text}"`);
    check(r.body.signal.count >= 1, 'with a real count', `→ ${r.body.signal.count}`);

    // FARMER3 deliberately, not FARMER2 — section 4 gives FARMER2 a listing,
    // so they legitimately DO get a signal by this point.
    r = await call('GET', '/api/requirements/signal', FARMER3);
    check(r.body.signal === null,
      'a farmer with nothing listed gets NO signal rather than a fake one');

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    await Promise.all([
      User.deleteMany({ firebaseUid: new RegExp('^' + TAG) }),
      Land.deleteMany({ firebaseUid: new RegExp('^' + TAG) }),
      CropListing.deleteMany({ farmerUid: new RegExp('^' + TAG) }),
      Requirement.deleteMany({ vendorUid: new RegExp('^' + TAG) }),
    ]);
    console.log('\n🧹 test data removed');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

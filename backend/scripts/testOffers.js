// Phase C1 test: digital offers — the negotiation loop instant-buy replaced.
//   node scripts/testOffers.js
//
// Runs the REAL routes against the REAL Atlas database, with auth stubbed by
// pre-seeding the require cache so requireAuth trusts an x-test-uid header.
// All test data is namespaced with a "PHC1TEST_" prefix and deleted in the
// finally block.
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
const Offer = require(B('models/Offer'));
const { validateGstin } = require(B('services/gstinService'));

const TAG = 'PHC1TEST_';
const FARMER = TAG + 'farmer';
const VENDOR = TAG + 'vendor';
const VENDOR2 = TAG + 'vendor2';
const OUTSIDER = TAG + 'outsider';

let pass = 0, fail = 0;
const check = (cond, m, extra = '') => {
  if (cond) { pass++; console.log('  ✅', m, extra); }
  else { fail++; console.log('  ❌', m, extra); }
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const app = express();
  app.use(express.json());
  app.use('/api/offers', require(B('routes/offers')));
  app.use('/api/users', require(B('routes/users')));
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
    cropName: TAG + 'Onion', quantityKg: 500, quantityAvailableKg: 500,
    minOrderKg: 25, pricePerKg: 30, totalPrice: 15000,
    location: { city: 'Testville', district: 'Nashik', state: 'Maharashtra', lat: 19.9975, lng: 73.7898 },
    status: 'available', ...over,
  });

  console.log('\n🤝 Digital offers (C1)\n');

  try {
    await User.create([
      { firebaseUid: FARMER,   name: 'Test Farmer', email: TAG + 'f@t.com',  phone: '9000000001', role: 'farmer' },
      { firebaseUid: VENDOR,   name: 'Test Vendor', email: TAG + 'v@t.com',  phone: '9000000002', role: 'vendor' },
      { firebaseUid: VENDOR2,  name: 'Rival Buyer', email: TAG + 'v2@t.com', phone: '9000000003', role: 'vendor' },
      { firebaseUid: OUTSIDER, name: 'Nosy Farmer', email: TAG + 'o@t.com',  phone: '9000000004', role: 'farmer' },
    ]);

    // ── 1. making an offer ────────────────────────────────────────────
    console.log('1. POST /api/offers');
    let L = await mkListing();
    let r = await call('POST', '/api/offers', VENDOR, {
      listingId: L._id, quantityKg: 100, offerPricePerKg: 26, message: 'Can collect tomorrow',
    });
    check(r.status === 201, 'vendor opens a negotiation', `→ ₹${r.body.offer?.offerPricePerKg}/kg`);
    check(r.body.offer.askingPricePerKg === 30,
      'the asking price is snapshotted for context', `→ asking ₹${r.body.offer.askingPricePerKg}`);
    check(r.body.offer.status === 'pending', 'it starts pending, with the farmer');
    const offer1 = r.body.offer;

    // Stock must be untouched — an offer is not a reservation.
    let fresh = await CropListing.findById(L._id).lean();
    check(fresh.quantityAvailableKg === 500,
      'AN OFFER HOLDS NO STOCK', `→ still ${fresh.quantityAvailableKg} kg available`);

    r = await call('POST', '/api/offers', FARMER, { listingId: L._id, quantityKg: 50, offerPricePerKg: 28 });
    check(r.status === 403, 'a farmer cannot make an offer (role-gated)', `→ ${r.status}`);

    r = await call('POST', '/api/offers', VENDOR, { listingId: L._id, quantityKg: 100, offerPricePerKg: 27 });
    check(r.status === 409 && r.body.code === 'OFFER_EXISTS',
      'the same vendor cannot stack a second live bid', `→ ${r.body.code}`);

    r = await call('POST', '/api/offers', VENDOR2, { listingId: L._id, quantityKg: 60, offerPricePerKg: 29 });
    check(r.status === 201, 'but a DIFFERENT vendor can bid on the same listing');

    r = await call('POST', '/api/offers', VENDOR, { listingId: L._id, quantityKg: 5, offerPricePerKg: 26 });
    check(r.status === 400 && r.body.code === 'BELOW_MIN',
      'below the farmer minimum is rejected', `→ ${r.body.code}`);
    r = await call('POST', '/api/offers', VENDOR, { listingId: L._id, quantityKg: 9999, offerPricePerKg: 26 });
    check(r.status === 400 && r.body.code === 'NOT_ENOUGH_STOCK',
      'more than the stock is rejected', `→ ${r.body.code}`);
    r = await call('POST', '/api/offers', VENDOR, { listingId: L._id, quantityKg: 100, offerPricePerKg: -5 });
    check(r.status === 400, 'a negative price is rejected');

    // ── 2. visibility ─────────────────────────────────────────────────
    console.log('\n2. Who sees what');
    r = await call('GET', '/api/offers/farmer/mine?open=1', FARMER);
    const mine = r.body.offers.filter(o => o.cropName.startsWith(TAG));
    check(mine.length === 2, 'the farmer sees both bids', `→ ${mine.length}`);
    check(mine.every(o => o.vendorPhone),
      'the buyer phone IS released — they are in a negotiation now');

    r = await call('GET', '/api/offers/vendor/mine?open=1', VENDOR);
    const vmine = r.body.offers.filter(o => o.cropName.startsWith(TAG));
    check(vmine.length === 1, 'a vendor sees only their own bid', `→ ${vmine.length}`);

    r = await call('GET', '/api/offers/farmer/mine', OUTSIDER);
    check(r.body.offers.filter(o => o.cropName.startsWith(TAG)).length === 0,
      'another farmer sees none of it');

    // ── 3. the counter loop ───────────────────────────────────────────
    console.log('\n3. Counter-offer');
    r = await call('PUT', `/api/offers/${offer1._id}/counter`, OUTSIDER, { counterPricePerKg: 40 });
    check(r.status === 409 && r.body.code === 'NOT_YOURS',
      'a stranger cannot counter your offer', `→ ${r.body.code}`);

    r = await call('PUT', `/api/offers/${offer1._id}/counter`, FARMER, {
      counterPricePerKg: 28, counterNote: 'Best I can do',
    });
    check(r.status === 200 && r.body.offer.status === 'countered',
      'the farmer counters', `→ ₹${r.body.offer.counterPricePerKg}/kg`);

    r = await call('PUT', `/api/offers/${offer1._id}/counter`, FARMER, { counterPricePerKg: 29 });
    check(r.status === 409, 'the farmer cannot counter their own counter', `→ ${r.body.code}`);

    // Turn order: it is the vendor's move now.
    r = await call('PUT', `/api/offers/${offer1._id}/accept`, FARMER);
    check(r.status === 403 && r.body.code === 'NOT_YOUR_TURN',
      'the farmer cannot accept while the ball is with the buyer', `→ ${r.body.code}`);

    r = await call('PUT', `/api/offers/${offer1._id}/accept`, VENDOR);
    check(r.status === 200 && r.body.offer.status === 'accepted',
      'the vendor accepts the counter');
    check(r.body.offer.agreedPricePerKg === 28,
      'the AGREED price is the counter, not the opening bid', `→ ₹${r.body.offer.agreedPricePerKg}`);

    // Still no stock taken — acceptance agrees a price, the order takes stock.
    fresh = await CropListing.findById(L._id).lean();
    check(fresh.quantityAvailableKg === 500,
      'accepting agrees a PRICE and still takes no stock', `→ ${fresh.quantityAvailableKg} kg`);

    r = await call('PUT', `/api/offers/${offer1._id}/accept`, VENDOR);
    check(r.status === 409 && r.body.code === 'ALREADY_CLOSED',
      'accepting twice is refused, not double-written', `→ ${r.body.code}`);

    // ── 4. accepting straight away ────────────────────────────────────
    console.log('\n4. Farmer accepts the opening bid');
    const L2 = await mkListing();
    r = await call('POST', '/api/offers', VENDOR, { listingId: L2._id, quantityKg: 80, offerPricePerKg: 27 });
    const o2 = r.body.offer;
    r = await call('PUT', `/api/offers/${o2._id}/accept`, FARMER);
    check(r.status === 200 && r.body.offer.agreedPricePerKg === 27,
      'no counter → the agreed price is the opening bid', `→ ₹${r.body.offer.agreedPricePerKg}`);
    check(/books transport/i.test(r.body.next || ''),
      'the response says what happens next');

    // ── 5. decline and withdraw ───────────────────────────────────────
    console.log('\n5. Decline and withdraw');
    const L3 = await mkListing();
    r = await call('POST', '/api/offers', VENDOR, { listingId: L3._id, quantityKg: 50, offerPricePerKg: 20 });
    const o3 = r.body.offer;
    r = await call('PUT', `/api/offers/${o3._id}/decline`, VENDOR);
    check(r.status === 409, 'the vendor cannot decline their OWN pending bid', `→ ${r.body.code}`);
    r = await call('PUT', `/api/offers/${o3._id}/decline`, FARMER);
    check(r.status === 200 && r.body.offer.status === 'declined', 'the farmer declines');

    const L4 = await mkListing();
    r = await call('POST', '/api/offers', VENDOR, { listingId: L4._id, quantityKg: 50, offerPricePerKg: 21 });
    const o4 = r.body.offer;
    r = await call('PUT', `/api/offers/${o4._id}/withdraw`, FARMER);
    check(r.status === 403, 'a farmer cannot withdraw a bid (role-gated)', `→ ${r.status}`);
    r = await call('PUT', `/api/offers/${o4._id}/withdraw`, VENDOR);
    check(r.status === 200 && r.body.offer.status === 'withdrawn', 'the vendor withdraws their bid');

    // Withdrawing frees the vendor to bid again — the index is partial.
    r = await call('POST', '/api/offers', VENDOR, { listingId: L4._id, quantityKg: 50, offerPricePerKg: 24 });
    check(r.status === 201, 'withdrawing frees the vendor to re-bid on that listing');

    // ── 6. expiry ─────────────────────────────────────────────────────
    console.log('\n6. Expiry');
    const L5 = await mkListing();
    r = await call('POST', '/api/offers', VENDOR2, { listingId: L5._id, quantityKg: 40, offerPricePerKg: 22 });
    const o5 = r.body.offer;
    await Offer.updateOne({ _id: o5._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    r = await call('PUT', `/api/offers/${o5._id}/accept`, FARMER);
    check(r.status === 409, 'an expired offer cannot be accepted', `→ ${r.body.code}`);

    await call('GET', '/api/offers/farmer/mine', FARMER);      // triggers the sweep
    const swept = await Offer.findById(o5._id).lean();
    check(swept.status === 'expired', 'the read sweeps it to expired', `→ ${swept.status}`);

    // ── 7. stock sold from under an open offer ────────────────────────
    console.log('\n7. Stock sold while the offer was open');
    const L6 = await mkListing({ quantityAvailableKg: 100 });
    r = await call('POST', '/api/offers', VENDOR, { listingId: L6._id, quantityKg: 100, offerPricePerKg: 25 });
    const o6 = r.body.offer;
    // Someone else buys it in the meantime.
    await CropListing.updateOne({ _id: L6._id }, { $set: { quantityAvailableKg: 10 } });
    r = await call('PUT', `/api/offers/${o6._id}/accept`, FARMER);
    check(r.status === 409 && r.body.code === 'NOT_ENOUGH_STOCK',
      'acceptance fails honestly rather than overselling', `→ ${r.body.code}`);
    check(/sold while this offer was open/i.test(r.body.error),
      'and the message explains what happened');

    // ── 8. concurrency ────────────────────────────────────────────────
    console.log('\n8. Concurrency');
    const L7 = await mkListing();
    r = await call('POST', '/api/offers', VENDOR, { listingId: L7._id, quantityKg: 50, offerPricePerKg: 26 });
    const o7 = r.body.offer;
    const race = await Promise.all([
      call('PUT', `/api/offers/${o7._id}/accept`, FARMER),
      call('PUT', `/api/offers/${o7._id}/decline`, FARMER),
    ]);
    const wins = race.filter(x => x.status === 200).length;
    check(wins === 1, 'accept and decline racing → exactly one wins', `→ ${wins}`);
    const settled = await Offer.findById(o7._id).lean();
    check(['accepted', 'declined'].includes(settled.status),
      'and the offer lands in exactly one terminal state', `→ ${settled.status}`);

    // Two vendors racing the unique index on one listing.
    const L8 = await mkListing();
    const dup = await Promise.all([
      call('POST', '/api/offers', VENDOR2, { listingId: L8._id, quantityKg: 30, offerPricePerKg: 26 }),
      call('POST', '/api/offers', VENDOR2, { listingId: L8._id, quantityKg: 30, offerPricePerKg: 27 }),
    ]);
    check(dup.filter(x => x.status === 201).length === 1,
      'one vendor double-submitting → exactly one live offer',
      `→ ${dup.map(x => x.status).join(',')}`);

    // ── 9. buyer verification (C2) ────────────────────────────────────
    // The claim a badge makes has to match what was actually checked. A
    // passing GST check digit proves the number was issued, NOT that it
    // belongs to this buyer — so self-service must never reach 'verified'.
    console.log('\n9. Buyer verification');

    // The check digit is real arithmetic, not a regex.
    const goodPrefix = '27AAPFU0939F1Z';
    const good = goodPrefix + require(B('services/gstinService')).checkDigit(goodPrefix);
    check(validateGstin(good).valid, 'a well-formed GSTIN validates', `→ ${good}`);
    check(validateGstin(good).state === 'Maharashtra',
      'the state is derived from the number itself', `→ ${validateGstin(good).state}`);
    check(!validateGstin(goodPrefix + (good[14] === 'A' ? 'B' : 'A')).valid,
      'a wrong check digit is rejected');
    check(validateGstin('27AAPFU0939F1Z').reason === 'LENGTH', 'a short GSTIN is rejected');
    check(validateGstin('99AAPFU0939F1ZV').reason === 'STATE_CODE', 'a bad state code is rejected');
    check(validateGstin('').reason === 'EMPTY', 'an empty GSTIN is rejected');

    r = await call('PUT', '/api/users/business', VENDOR, { gstin: 'NOTAGSTIN12345' });
    check(r.status === 400, 'the API rejects a malformed GSTIN', `→ ${r.body.code}`);

    r = await call('PUT', '/api/users/business', VENDOR, { gstin: good, tradeName: 'Test Traders' });
    check(r.status === 200, 'a valid GSTIN is accepted');
    check(r.body.verification.status === 'documents_submitted',
      'SELF-SERVICE STOPS AT documents_submitted, never verified',
      `→ ${r.body.verification.status}`);
    check(r.body.business.gstinState === 'Maharashtra',
      'the state is derived server-side, not taken from the client');

    // A client naming its own status must not be believed.
    r = await call('PUT', `/api/users/${VENDOR}`, VENDOR, {
      name: 'Test Vendor', verification: { status: 'verified' },
    });
    let after = await User.findOne({ firebaseUid: VENDOR }).lean();
    check(after.verification.status === 'documents_submitted',
      'a client CANNOT promote itself to verified via the profile update',
      `→ still ${after.verification.status}`);

    r = await call('PUT', '/api/users/business', VENDOR2, { gstin: good });
    check(r.status === 409 && r.body.code === 'GSTIN_TAKEN',
      'one GSTIN cannot be claimed by two buyers', `→ ${r.body.code}`);

    r = await call('PUT', '/api/users/business', FARMER, { gstin: good });
    check(r.status === 403, 'a farmer cannot submit buyer credentials', `→ ${r.status}`);

    // The badge must state what was checked, and what was not.
    r = await call('GET', `/api/users/badge/${VENDOR}`, FARMER);
    check(r.status === 200 && r.body.badge.label === 'GSTIN on file',
      'the badge says GSTIN on file, not "verified"', `→ "${r.body.badge.label}"`);
    check(/not confirmed against the GST portal/i.test(r.body.badge.meaning),
      'and states plainly what was NOT checked');
    check(!/AAPFU/.test(r.body.badge.gstin || ''),
      'the badge masks the GSTIN rather than republishing it', `→ ${r.body.badge.gstin}`);

    // Clearing the number must drop the standing with it.
    r = await call('PUT', '/api/users/business', VENDOR, { gstin: '' });
    check(r.body.verification.status === 'unverified',
      'removing the GSTIN drops the badge back to unverified',
      `→ ${r.body.verification.status}`);

    // The snapshot on an offer is what the farmer saw at the time.
    await User.updateOne({ firebaseUid: VENDOR2 }, { $set: { 'verification.status': 'verified' } });
    const L9 = await mkListing();
    r = await call('POST', '/api/offers', VENDOR2, { listingId: L9._id, quantityKg: 40, offerPricePerKg: 25 });
    check(r.body.offer.vendorVerification === 'verified',
      "the buyer's standing is snapshotted onto the offer",
      `→ ${r.body.offer.vendorVerification}`);

    await User.updateOne({ firebaseUid: VENDOR2 }, { $set: { 'verification.status': 'rejected' } });
    const stale = await Offer.findById(r.body.offer._id).lean();
    check(stale.vendorVerification === 'verified',
      'and it stays a SNAPSHOT when the buyer is later downgraded',
      `→ ${stale.vendorVerification}`);

    r = await call('GET', '/api/offers/farmer/mine?verified=1', FARMER);
    const vOnly = r.body.offers.filter(o => o.cropName.startsWith(TAG));
    check(vOnly.length > 0 && vOnly.every(o => ['verified', 'documents_submitted'].includes(o.vendorVerification)),
      'the farmer can filter to buyers with credentials on file', `→ ${vOnly.length} offer(s)`);

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    await Promise.all([
      User.deleteMany({ firebaseUid: new RegExp('^' + TAG) }),
      CropListing.deleteMany({ farmerUid: new RegExp('^' + TAG) }),
      Offer.deleteMany({ $or: [{ farmerUid: new RegExp('^' + TAG) }, { vendorUid: new RegExp('^' + TAG) }] }),
    ]);
    console.log('\n🧹 test data removed');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

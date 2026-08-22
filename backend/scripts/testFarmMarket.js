// Phase 2 end-to-end test for the FARM Market.
//   node scripts/testFarmMarket.js
//
// Exercises the real routes against the real Atlas database. Runs the REAL routes against the REAL Atlas
// database, with auth stubbed by pre-seeding the require cache so
// requireAuth trusts an x-test-uid header. All test data is namespaced with
// a "PH2TEST_" prefix and deleted in the finally block.
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const B = (p) => path.join(__dirname, '..', p);

// ── stub auth before any route module requires it ──
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
const Plot = require(B('models/Plot'));
const Crop = require(B('models/Crop'));
const CropListing = require(B('models/CropListing'));
const ListingImage = require(B('models/ListingImage'));

const TAG = 'PH2TEST_';
const FARMER = TAG + 'farmer', VENDOR = TAG + 'vendor';
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

let pass = 0, fail = 0;
const ok  = (m, extra='') => { pass++; console.log('  ✅', m, extra); };
const bad = (m, extra='') => { fail++; console.log('  ❌', m, extra); };
const check = (cond, m, extra='') => cond ? ok(m, extra) : bad(m, extra);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const app = express();
  app.use(express.json());
  app.use('/api/crops', require(B('routes/crops')));
  app.use('/api/listings', require(B('routes/listings')));
  const server = app.listen(5123);
  const URL = 'http://127.0.0.1:5123';

  try {
    // ── fixtures ──────────────────────────────────────────────────────
    // Farmer in Thanjavur, vendor 8 km away; a second farmer 250 km off in
    // Chennai, so the distance sort has something real to order.
    await User.create([
      { firebaseUid: FARMER, name: 'Test Farmer', email: TAG + 'f@t.com', phone: '9000000001', role: 'farmer' },
      { firebaseUid: VENDOR, name: 'Test Vendor', email: TAG + 'v@t.com', phone: '9000000002', role: 'vendor' },
      { firebaseUid: FARMER + '2', name: 'Far Farmer', email: TAG + 'f2@t.com', phone: '9000000003', role: 'farmer' },
    ]);

    const mkCrop = async (uid, name, lat, lng, district) => {
      const land = await Land.create({
        firebaseUid: uid, landName: TAG + name,
        location: { coordinates: { lat, lng }, city: 'Testville', district, state: 'Tamil Nadu' },
        size: { value: 2, unit: 'acres' }, waterSource: 'canal', soilType: 'alluvial',
      });
      const plot = await Plot.create({
        landId: land._id, firebaseUid: uid, plotNumber: 1, plotName: TAG + 'p',
        area: { value: 1, unit: 'acres' }, percentage: 50, status: 'active',
      });
      const crop = await Crop.create({
        firebaseUid: uid, landId: land._id, plotId: plot._id,
        name, tamilName: 'சோதனை', plantingDate: new Date(Date.now() - 90 * 864e5),
        expectedHarvestDate: new Date(), duration: 90, quantity: 500, unit: 'kg',
      });
      await Plot.findByIdAndUpdate(plot._id, { $set: { cropId: crop._id } });
      return { land, plot, crop };
    };

    const near = await mkCrop(FARMER, 'Rice (Paddy)', 10.7870, 79.1378, 'Thanjavur');   // Thanjavur
    const far  = await mkCrop(FARMER + '2', 'Rice (Paddy)', 13.0827, 80.2707, 'Chennai'); // Chennai

    // ── 1. harvest-and-list ───────────────────────────────────────────
    console.log('\n1. POST /api/crops/:id/harvest-and-list');
    const post = async (uid, cropId, fields) => {
      const fd = new FormData();
      fd.append('proof', new Blob([JPEG], { type: 'image/jpeg' }), 'harvest.jpg');
      for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
      const r = await fetch(`${URL}/api/crops/${cropId}/harvest-and-list`, {
        method: 'POST', headers: { 'x-test-uid': uid }, body: fd });
      return { status: r.status, body: await r.json() };
    };

    let r = await post(FARMER, near.crop._id, { actualYieldKg: 480, quantityKg: 900, pricePerKg: 28, minOrderKg: 25 });
    check(r.status === 400 && /more than you harvested/i.test(r.body.message),
      'rejects selling more than harvested', `→ "${r.body.message}"`);

    r = await post(FARMER, near.crop._id, { actualYieldKg: 480, quantityKg: 400, pricePerKg: 28, minOrderKg: 500 });
    check(r.status === 400 && /Minimum order/i.test(r.body.message),
      'rejects minOrder above quantity', `→ "${r.body.message}"`);

    r = await post(VENDOR, near.crop._id, { actualYieldKg: 480, quantityKg: 400, pricePerKg: 28, minOrderKg: 25 });
    check(r.status === 403, 'vendor cannot harvest a farmer\'s crop', `→ ${r.status}`);

    r = await post(FARMER, near.crop._id, { actualYieldKg: 480, quantityKg: 400, pricePerKg: 28, minOrderKg: 25, gradeNote: 'A grade' });
    check(r.status === 201 && r.body.success, 'farmer harvests + lists', `→ ${r.status}`);
    const listing = r.body.listing;
    check(listing.location.lat === 10.787 && listing.location.lng === 79.1378,
      'listing carries REAL coordinates (the old bug)', `→ ${listing.location.lat}, ${listing.location.lng}`);
    check(listing.quantityAvailableKg === 400 && listing.minOrderKg === 25,
      'inventory fields set', `→ ${listing.quantityAvailableKg} kg avail, min ${listing.minOrderKg}`);
    check(!!listing.proofImageId, 'proof photo linked');

    const crop = await Crop.findById(near.crop._id).lean();
    check(crop.isHarvested && crop.actualYield?.value === 480 && crop.actualYield?.unit === 'kg',
      'crop harvested with real actualYield', `→ ${JSON.stringify(crop.actualYield)}`);
    const plot = await Plot.findById(near.plot._id).lean();
    check(plot.status === 'harvested' && plot.cropId === null, 'plot freed for reuse');

    r = await post(FARMER, near.crop._id, { actualYieldKg: 100, quantityKg: 50, pricePerKg: 20, minOrderKg: 5 });
    check(r.status === 400 && /already been harvested/i.test(r.body.message),
      'cannot double-harvest / double-list', `→ "${r.body.message}"`);

    await post(FARMER + '2', far.crop._id, { actualYieldKg: 300, quantityKg: 300, pricePerKg: 31, minOrderKg: 50 });

    // ── 2. market ─────────────────────────────────────────────────────
    console.log('\n2. GET /api/listings/market');
    const get = async (uid, qs) => {
      const res = await fetch(`${URL}/api/listings/market?${qs}`, { headers: { 'x-test-uid': uid } });
      return { status: res.status, body: await res.json() };
    };

    r = await fetch(`${URL}/api/listings/market`);
    check(r.status === 401, 'market requires auth', `→ ${r.status}`);

    r = await get(FARMER, '');
    check(r.status === 403, 'farmers cannot browse the vendor market', `→ ${r.status}`);

    // vendor sitting 8 km from the Thanjavur farm
    r = await get(VENDOR, 'lat=10.8500&lng=79.1200');
    const mine = r.body.listings.filter((l) => l.farmerUid.startsWith(TAG));
    check(mine.length === 2, 'both test listings visible', `→ ${mine.length}`);
    check(mine[0].location.district === 'Thanjavur' && mine[1].location.district === 'Chennai',
      'sorted nearest-first', `→ ${mine.map(m => `${m.location.district} ${m.distanceKm}km`).join(' , ')}`);
    check(mine[0].isNear === true && mine[1].isNear === false,
      'near/far flag correct at 25 km', `→ ${mine[0].distanceKm}km near, ${mine[1].distanceKm}km far`);
    check(mine.every((l) => l.farmerPhone === undefined),
      'farmer phone NEVER leaked on the market');

    // vendor in Chennai — order must flip
    r = await get(VENDOR, 'lat=13.0827&lng=80.2707');
    const flipped = r.body.listings.filter((l) => l.farmerUid.startsWith(TAG));
    check(flipped[0].location.district === 'Chennai', 'order flips with vendor position',
      `→ ${flipped.map(m => `${m.location.district} ${m.distanceKm}km`).join(' , ')}`);

    r = await get(VENDOR, 'q=paddy&lat=10.85&lng=79.12');
    check(r.body.listings.filter(l => l.farmerUid.startsWith(TAG)).length === 2, 'crop search matches');
    r = await get(VENDOR, 'q=banana');
    check(r.body.listings.filter(l => l.farmerUid.startsWith(TAG)).length === 0, 'search excludes non-matches');
    r = await get(VENDOR, 'q=' + encodeURIComponent('(a+)+$'));
    check(r.status === 200, 'regex-injection input handled safely', '→ 200, no hang');
    r = await get(VENDOR, 'district=Thanjavur&lat=10.85&lng=79.12');
    check(r.body.listings.filter(l => l.farmerUid.startsWith(TAG)).length === 1, 'district filter works');

    // ── 3. photo ──────────────────────────────────────────────────────
    console.log('\n3. GET /api/listings/photo/:id');
    const pr = await fetch(`${URL}/api/listings/photo/${listing.proofImageId}`);
    const buf = Buffer.from(await pr.arrayBuffer());
    check(pr.status === 200 && pr.headers.get('content-type') === 'image/jpeg',
      'photo served with correct type', `→ ${pr.headers.get('content-type')}`);
    check(buf.equals(JPEG), 'bytes round-trip intact', `→ ${buf.length} bytes`);
    check(/max-age=604800/.test(pr.headers.get('cache-control') || ''), 'cache header set');

    // ── 4. withdraw ───────────────────────────────────────────────────
    console.log('\n4. PUT /api/listings/:id/withdraw');
    let wr = await fetch(`${URL}/api/listings/${listing._id}/withdraw`, {
      method: 'PUT', headers: { 'x-test-uid': FARMER + '2' } });
    check(wr.status === 409, 'another farmer cannot withdraw your listing', `→ ${wr.status}`);
    wr = await fetch(`${URL}/api/listings/${listing._id}/withdraw`, {
      method: 'PUT', headers: { 'x-test-uid': FARMER } });
    check(wr.status === 200, 'owner withdraws', `→ ${wr.status}`);
    r = await get(VENDOR, 'lat=10.85&lng=79.12');
    check(r.body.listings.filter(l => l.farmerUid.startsWith(TAG)).length === 1,
      'withdrawn listing leaves the market');

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    const ids = await Land.find({ landName: new RegExp('^' + TAG) }).distinct('_id');
    await Promise.all([
      User.deleteMany({ firebaseUid: new RegExp('^' + TAG) }),
      Land.deleteMany({ landName: new RegExp('^' + TAG) }),
      Plot.deleteMany({ landId: { $in: ids } }),
      Crop.deleteMany({ firebaseUid: new RegExp('^' + TAG) }),
      CropListing.deleteMany({ farmerUid: new RegExp('^' + TAG) }),
      ListingImage.deleteMany({ ownerUid: new RegExp('^' + TAG) }),
    ]);
    console.log('\n🧹 test data removed');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

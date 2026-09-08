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
    // Farmer in Nashik, vendor 8 km away; a second farmer ~550 km off in
    // Nagpur, so the distance sort has something real to order.
    await User.create([
      { firebaseUid: FARMER, name: 'Test Farmer', email: TAG + 'f@t.com', phone: '9000000001', role: 'farmer' },
      { firebaseUid: VENDOR, name: 'Test Vendor', email: TAG + 'v@t.com', phone: '9000000002', role: 'vendor' },
      { firebaseUid: FARMER + '2', name: 'Far Farmer', email: TAG + 'f2@t.com', phone: '9000000003', role: 'farmer' },
    ]);

    const mkCrop = async (uid, name, lat, lng, district) => {
      const land = await Land.create({
        firebaseUid: uid, landName: TAG + name,
        location: { coordinates: { lat, lng }, city: 'Testville', district, state: 'Maharashtra' },
        size: { value: 2, unit: 'acres' }, waterSource: 'canal', soilType: 'alluvial',
      });
      const plot = await Plot.create({
        landId: land._id, firebaseUid: uid, plotNumber: 1, plotName: TAG + 'p',
        area: { value: 1, unit: 'acres' }, percentage: 50, status: 'active',
      });
      const crop = await Crop.create({
        firebaseUid: uid, landId: land._id, plotId: plot._id,
        name, localName: 'चाचणी', plantingDate: new Date(Date.now() - 90 * 864e5),
        expectedHarvestDate: new Date(), duration: 90, quantity: 500, unit: 'kg',
      });
      await Plot.findByIdAndUpdate(plot._id, { $set: { cropId: crop._id } });
      return { land, plot, crop };
    };

    const near = await mkCrop(FARMER, 'Rice (Paddy)', 19.9975, 73.7898, 'Nashik');   // Nashik
    const far  = await mkCrop(FARMER + '2', 'Rice (Paddy)', 21.1458, 79.0882, 'Nagpur'); // Nagpur

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
    check(listing.location.lat === 19.9975 && listing.location.lng === 73.7898,
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

    // ⚠️ THIS ASSERTION USED TO BE `403, 'farmers cannot browse the vendor
    // market'`, AND THAT WAS A FIXTURE ASSUMPTION, NOT A PROPERTY WORTH
    // KEEPING. A farmer could post a harvest and then had no way to see the
    // market they had posted into — in an app whose problem statement is
    // PRICE DISCOVERY, the actor with the least price information was the
    // only one with no market screen. Phase 2a admits them deliberately.
    //
    // What actually mattered in the old assertion was that the feed does not
    // hand out buyer-only data, so THAT is what is asserted now — the gate
    // widened, the projection did not.
    r = await get(FARMER, '');
    check(r.status === 200, 'a farmer CAN browse the market they sell into', `→ ${r.status}`);
    const farmerRows = r.body?.listings || [];
    check(Array.isArray(farmerRows), 'and gets a real feed back', `→ ${farmerRows.length} rows`);
    const LEAKY = ['farmerPhone', 'vendorUid', 'vendorName', 'vendorPhone', 'vendorCompany'];
    const leaked = LEAKY.filter((f) => farmerRows.some((row) => row[f] !== undefined));
    check(leaked.length === 0,
      '⚠️ widening the gate leaked NO buyer-only field',
      leaked.length ? `→ LEAKED ${leaked.join(', ')}` : `→ ${LEAKY.length} fields checked`);
    check(farmerRows.every((row) => typeof row.mine === 'boolean'),
      '`mine` is always a boolean, so a screen never infers ownership client-side');

    // ⚠️ `q=` SCOPES THESE ASSERTIONS TO THE FIXTURES, and it has to now.
    // The market feed used to return everything matching, so both test listings
    // were always present. It now ranks by `$near` in the DATABASE and returns
    // ONE PAGE (default 60) — which is the fix for a real defect: with 1,159
    // live listings the old `.limit(200)` before an in-memory sort reached only
    // 8 of 38 districts. The Nagpur fixture is 600 km from this Nashik vendor
    // and correctly falls outside page one, so "both test listings visible"
    // was asserting the OLD unbounded behaviour, not a property worth keeping.
    // Narrowing by crop keeps every assertion below testing what it means to.
    const RICE = 'q=' + encodeURIComponent('Rice (Paddy)');

    // vendor sitting 8 km from the Nashik farm
    r = await get(VENDOR, `lat=20.0500&lng=73.8100&${RICE}`);
    const mine = r.body.listings.filter((l) => l.farmerUid.startsWith(TAG));
    check(mine.length === 2, 'both test listings visible', `→ ${mine.length}`);
    check(mine[0].location.district === 'Nashik' && mine[1].location.district === 'Nagpur',
      'sorted nearest-first', `→ ${mine.map(m => `${m.location.district} ${m.distanceKm}km`).join(' , ')}`);
    check(mine[0].isNear === true && mine[1].isNear === false,
      'near/far flag correct at 25 km', `→ ${mine[0].distanceKm}km near, ${mine[1].distanceKm}km far`);
    check(mine.every((l) => l.farmerPhone === undefined),
      'farmer phone NEVER leaked on the market');

    // vendor in Nagpur — order must flip
    r = await get(VENDOR, `lat=21.1458&lng=79.0882&${RICE}`);
    const flipped = r.body.listings.filter((l) => l.farmerUid.startsWith(TAG));
    check(flipped[0].location.district === 'Nagpur', 'order flips with vendor position',
      `→ ${flipped.map(m => `${m.location.district} ${m.distanceKm}km`).join(' , ')}`);

    r = await get(VENDOR, 'q=paddy&lat=20.05&lng=73.81');
    check(r.body.listings.filter(l => l.farmerUid.startsWith(TAG)).length === 2, 'crop search matches');
    r = await get(VENDOR, 'q=banana');
    check(r.body.listings.filter(l => l.farmerUid.startsWith(TAG)).length === 0, 'search excludes non-matches');
    r = await get(VENDOR, 'q=' + encodeURIComponent('(a+)+$'));
    check(r.status === 200, 'regex-injection input handled safely', '→ 200, no hang');
    r = await get(VENDOR, 'district=Nashik&lat=20.05&lng=73.81');
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
    r = await get(VENDOR, `lat=20.05&lng=73.81&${RICE}`);
    // Asserts the WITHDRAWN listing is gone by id, rather than that exactly one
    // test row survives. The count version was really testing that the feed
    // returned everything — it now returns one distance-ranked page, so a
    // fixture 600 km away is legitimately absent and the count would mislead.
    check(!r.body.listings.some((l) => String(l._id) === String(listing._id)),
      'withdrawn listing leaves the market');

    // ── 5. structured grading (C3) ────────────────────────────────────
    // Free text let one farmer write "A grade" and another "good quality",
    // so a buyer could not compare two lots. Grades are now picked against
    // published per-commodity criteria — and are still SELF-DECLARED, which
    // the API must keep saying.
    console.log('\n5. Structured grading');
    const { specForCrop, isValidGrade } = require(B('data/gradeSpecs'));

    check(specForCrop('Onion').key === 'onion', 'Onion resolves to its own spec');
    check(specForCrop('Wheat').key === 'wheat', 'Wheat resolves to its own AGMARK spec');
    check(specForCrop('Soyabean').key === 'soyabean', 'Soyabean resolves to its own AGMARK spec');
    check(specForCrop('Groundnut').key === 'groundnut', 'Groundnut resolves to its own AGMARK spec');
    check(specForCrop('Kokum').generic === true,
      'a crop with no spec gets the GENERIC one, flagged as generic');
    check(specForCrop('').key === 'general', 'an empty crop name still returns a spec, never null');
    check(isValidGrade('Onion', 'A') && !isValidGrade('Onion', 'S'),
      'grades are validated against the spec, so "Grade S" cannot be posted');
    check(isValidGrade('Onion', null), 'grading stays OPTIONAL');

    // every criterion must be a real string — an empty bullet is worse than none
    let emptyCriteria = 0;
    for (const spec of Object.values(require(B('data/gradeSpecs')).SPECS))
      for (const g of Object.values(spec.grades))
        if (!Array.isArray(g.criteria) || g.criteria.some(c => !c || !c.trim())) emptyCriteria++;
    check(emptyCriteria === 0, 'every grade in every spec has real criteria');

    const gr = await mkCrop(FARMER, 'Onion', 19.9975, 73.7898, 'Nashik');
    let gres = await post(FARMER, gr.crop._id, {
      actualYieldKg: 300, quantityKg: 250, pricePerKg: 30, minOrderKg: 25,
      gradeCode: 'A', gradeNote: 'picked this morning',
    });
    check(gres.status === 201, 'a graded harvest posts', `→ ${gres.status}`);
    const glisting = await CropListing.findById(gres.body.listing._id).lean();
    check(glisting.grade.code === 'A', 'the grade code is stored', `→ ${glisting.grade.code}`);
    check(glisting.grade.specKey === 'onion',
      'the SPEC USED is pinned to the listing', `→ ${glisting.grade.specKey}`);
    check(glisting.grade.specVersion === require('../data/gradeSpecs').SPEC_VERSION, 'and so is the spec version');
    check(glisting.grade.selfDeclared === true,
      'the listing records that the grade is SELF-DECLARED');

    const gr2 = await mkCrop(FARMER, 'Onion', 19.9975, 73.7898, 'Nashik');
    gres = await post(FARMER, gr2.crop._id, {
      actualYieldKg: 300, quantityKg: 250, pricePerKg: 30, minOrderKg: 25, gradeCode: 'S',
    });
    check(gres.status === 400 && gres.body.code === 'BAD_GRADE',
      'a grade the spec does not define is rejected', `→ ${gres.body.code}`);

    const gr3 = await mkCrop(FARMER, 'Onion', 19.9975, 73.7898, 'Nashik');
    gres = await post(FARMER, gr3.crop._id, {
      actualYieldKg: 300, quantityKg: 250, pricePerKg: 30, minOrderKg: 25,
    });
    check(gres.status === 201, 'posting WITHOUT a grade still works (it is optional)');

    r = await fetch(`${URL}/api/listings/grade-spec?crop=Onion`, { headers: { 'x-test-uid': VENDOR } });
    const sp = (await r.json()).spec;
    check(sp.commodity === 'Onion', 'the spec endpoint serves the criteria', `→ ${sp.commodity}`);
    check(sp.selfDeclared === true, 'and restates self-declared on every response');
    check(/not independently checked/i.test(sp.disclaimer),
      'the disclaimer says plainly that nobody checked it');
    check(!/AGMARK/i.test(sp.disclaimer) || /not AGMARK/i.test(sp.disclaimer),
      'and never claims to be AGMARK');

    // ── 6. freshness on the proof photo (D3) ──────────────────────────
    // The property under test is that the model REFUSES honestly. Accuracy is
    // measured offline on a held-out split; what must hold here is that an
    // onion lot gets no badge, because the dataset has no onion at all.
    console.log('\n6. Freshness check on the proof photo');

    let aiUp = false;
    try {
      const h = await fetch('http://localhost:5001/grade-photo/metrics');
      aiUp = h.ok;
    } catch { aiUp = false; }
    console.log(`   (AI service ${aiUp ? 'is up' : 'is DOWN — testing the degraded path'})`);

    // The listing posted earlier carries a real (tiny) proof photo.
    let fr = await fetch(`${URL}/api/listings/${listing._id}/freshness`, {
      headers: { 'x-test-uid': VENDOR },
    });
    const fb = await fr.json();

    if (!aiUp) {
      check(fr.status === 503 && fb.code === 'AI_UNAVAILABLE',
        'a dead AI service degrades to one missing badge, not an error page',
        `→ ${fr.status} ${fb.code}`);
    } else {
      check(fr.status === 200, 'the endpoint answers', `→ ${fr.status}`);
      // This fixture's crop is Rice (Paddy) — absent from the dataset, so the
      // ONLY correct answer is a refusal.
      check(fb.success === false && fb.error === 'NOT_SUPPORTED',
        'a crop the model was never trained on gets NO badge',
        `→ ${fb.error}`);
      check(/not available for/i.test(fb.message || ''),
        'and is told plainly why', `→ "${fb.message}"`);
    }

    const noPhoto = await CropListing.create({
      cropId: new mongoose.Types.ObjectId(), farmerUid: FARMER,
      farmerName: 'Test Farmer', cropName: TAG + 'Tomato',
      quantityKg: 100, quantityAvailableKg: 100, minOrderKg: 10,
      pricePerKg: 20, totalPrice: 2000,
      location: { city: 'Testville', district: 'Nashik', state: 'Maharashtra', lat: 19.9975, lng: 73.7898 },
      status: 'available',
    });
    fr = await fetch(`${URL}/api/listings/${noPhoto._id}/freshness`, {
      headers: { 'x-test-uid': VENDOR },
    });
    check(fr.status === 404 && (await fr.json()).code === 'NO_PHOTO',
      'a lot with no proof photo says so rather than guessing', `→ ${fr.status}`);


    // ── 5. THE FEED RANKS IN THE DATABASE, NOT AFTER A LIMIT ───────────
    //
    // The market was `.find(filter).limit(200)` and THEN an in-memory distance
    // sort — so it ranked 200 listings taken in insertion order. Measured
    // against live Atlas at 1,159 available lots, those 200 covered 8 of 38
    // districts and a buyer in Nashik saw ZERO Nashik lots. Same defect class
    // as the captain feed: sorting after a limit is not ranking.
    console.log('\n5. Market ranking and honest totals');

    const anywhere = await get(VENDOR, 'lat=19.9975&lng=73.7898');
    check(anywhere.body.meta.total >= anywhere.body.listings.length,
      'meta.total is the whole result, not the page',
      `→ total ${anywhere.body.meta.total}, shown ${anywhere.body.meta.shown}`);
    check(anywhere.body.meta.shown === anywhere.body.listings.length,
      'meta.shown matches what was actually returned');
    check(anywhere.body.meta.ranked === true,
      'a positioned buyer gets a distance-ranked feed');

    // The property that was broken: the NEAREST lots must be reachable, so the
    // first page is dominated by the buyer's own area rather than by whichever
    // rows happened to be inserted first.
    const dists = anywhere.body.listings.map((l) => l.distanceKm).filter((d) => d != null);
    check(dists.length > 1 && dists.every((d, i) => i === 0 || d >= dists[i - 1]),
      'the page is in non-decreasing distance order',
      `→ ${dists[0]} km … ${dists[dists.length - 1]} km`);

    // A buyer standing in Nashik sees Nashik lots. Before the fix this was zero.
    const nashik = anywhere.body.listings.filter((l) => l.location?.district === 'Nashik').length;
    check(nashik > 0, 'a Nashik buyer actually reaches Nashik lots (this used to be 0)',
      `→ ${nashik} of ${anywhere.body.listings.length} on page one`);

    // A buyer with NO position is told the list is not distance-ranked rather
    // than being shown an arbitrary order that looks considered.
    const blind = await fetch(`${URL}/api/listings/market`, { headers: { 'x-test-uid': VENDOR } });
    const blindBody = await blind.json();
    check(blindBody.meta.ranked === false && !!blindBody.meta.note,
      'an unpositioned buyer is TOLD the feed is newest-first, not nearest-first');

    // The page size is bounded and reported, so `hasMore` cannot silently lie.
    const paged = await get(VENDOR, 'lat=19.9975&lng=73.7898&limit=10');
    check(paged.body.listings.length <= 10 && paged.body.meta.limit === 10,
      'limit is honoured', `→ ${paged.body.listings.length} rows`);
    check(paged.body.meta.hasMore === (paged.body.meta.total > paged.body.meta.shown),
      'hasMore is derived from the true total, not guessed');

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

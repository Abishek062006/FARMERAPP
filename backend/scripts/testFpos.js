// Phase F2 test: FPO grouping.
//   node scripts/testFpos.js
//
// Real routes, real Atlas, auth stubbed via the require cache. Data namespaced
// "PHF2TEST_" and deleted in the finally block.
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
const Fpo = require(B('models/Fpo'));
const Order = require(B('models/Order'));
const Consignment = require(B('models/Consignment'));
const FpoLotRequest = require(B('models/FpoLotRequest'));

const TAG = 'PHF2TEST_';
const F = [TAG + 'f1', TAG + 'f2', TAG + 'f3'];
const OUTSIDER = TAG + 'f4';
const VENDOR = TAG + 'vendor';
// Phase B section 11: transport modes need a real captain pool to NOT be
// dispatched to.
const AGENT = TAG + 'agent', AGENT2 = TAG + 'agent2';

// Three farms in one village belt — the case an FPO actually describes.
const FARMS = [
  { lat: 20.0800, lng: 74.1100 },
  { lat: 20.0950, lng: 74.1350 },
  { lat: 20.0700, lng: 74.0900 },
];
const MANDI = { lat: 20.1417, lng: 74.2417 };

let pass = 0, fail = 0;
const check = (cond, m, extra = '') => {
  if (cond) { pass++; console.log('  ✅', m, extra); }
  else { fail++; console.log('  ❌', m, extra); }
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express();
  app.use(express.json());
  app.use('/api/fpos', require(B('routes/fpos')));
  // Mounted for section 11: a run the FPO drives itself must NOT reach the
  // captain pool, and must still be finishable by the FPO's own admin.
  app.use('/api/consignments', require(B('routes/consignments')));
  const server = app.listen(5128);
  const URL = 'http://127.0.0.1:5128';

  const call = async (method, p, uid, body) => {
    const r = await fetch(URL + p, {
      method, headers: { 'x-test-uid': uid, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };

  const mkListing = (i, qty, crop = 'Onion') => CropListing.create({
    cropId: new mongoose.Types.ObjectId(), farmerUid: F[i],
    farmerName: `Farmer${i + 1}`, farmerPhone: '900000000' + i,
    cropName: TAG + crop, quantityKg: qty, quantityAvailableKg: qty,
    minOrderKg: 25, pricePerKg: 30, totalPrice: qty * 30,
    location: { city: 'Niphad', district: 'Nashik', state: 'Maharashtra', ...FARMS[i] },
    status: 'available',
  });

  console.log('\n👥 FPO grouping (F2)\n');

  try {
    await User.create([
      ...F.map((uid, i) => ({
        firebaseUid: uid, name: `Farmer${i + 1}`, email: `${TAG}f${i}@t.com`,
        phone: '900000000' + i, role: 'farmer',
        location: { district: 'Nashik', state: 'Maharashtra' },
      })),
      { firebaseUid: OUTSIDER, name: 'Farmer4', email: TAG + 'f4@t.com',
        phone: '9000000004', role: 'farmer', location: { district: 'Nashik', state: 'Maharashtra' } },
      { firebaseUid: VENDOR, name: 'Buyer', email: TAG + 'v@t.com', phone: '9000000009', role: 'vendor' },
      { firebaseUid: AGENT, name: 'Captain', email: TAG + 'a@t.com', phone: '9000000007',
        role: 'agent', isOnline: true, vehicle: { type: 'tempo', number: 'MH15AB1234' } },
      { firebaseUid: AGENT2, name: 'Captain2', email: TAG + 'a2@t.com', phone: '9000000008',
        role: 'agent', isOnline: true, vehicle: { type: 'tempo', number: 'MH15AB5678' } },
    ]);

    // ── 1. forming a group ────────────────────────────────────────────
    console.log('1. Forming a group');
    let r = await call('POST', '/api/fpos', F[0], {
      name: TAG + 'Niphad Onion Growers', district: 'Nashik', village: 'Niphad',
    });
    check(r.status === 201, 'a farmer starts an FPO', `→ ${r.status}`);
    const fpo = r.body.fpo;
    check(fpo.members.length === 1, 'the founder is its first member');
    check(fpo.adminUid === F[0], 'and its admin');

    r = await call('POST', '/api/fpos', F[0], { name: TAG + 'Another' });
    check(r.status === 409 && r.body.code === 'ALREADY_MEMBER',
      'a farmer belongs to at most one group', `→ ${r.body.code}`);

    r = await call('POST', '/api/fpos', VENDOR, { name: TAG + 'Buyer group' });
    check(r.status === 403, 'a buyer cannot start a farmer group', `→ ${r.status}`);

    r = await call('POST', '/api/fpos', F[1], { name: '   ' });
    check(r.status === 400, 'a group with no name is rejected');

    // ── 2. joining ────────────────────────────────────────────────────
    // Membership approval (F2-follow-on): a join request lands PENDING and
    // the admin must approve it before the member counts anywhere as an
    // active supplier. See routes/fpos.js /:id/join and
    // /:id/members/:uid/approve.
    console.log('\n2. Joining');
    for (const uid of [F[1], F[2]]) {
      r = await call('POST', `/api/fpos/${fpo._id}/join`, uid);
      check(r.status === 200, `${uid.slice(-2)} joins`, `→ ${r.body.fpo?.members.length} members`);
      const joined = r.body.fpo.members.find((m) => m.farmerUid === uid);
      check(joined.status === 'pending', `${uid.slice(-2)} starts pending, not active`);
    }
    r = await call('POST', `/api/fpos/${fpo._id}/join`, F[1]);
    check(r.status === 409, 'joining twice is refused', `→ ${r.status}`);

    r = await call('GET', `/api/fpos/${fpo._id}/members/pending`, F[1]);
    check(r.status === 403, 'a non-admin cannot list pending members', `→ ${r.status}`);
    r = await call('GET', `/api/fpos/${fpo._id}/members/pending`, F[0]);
    check(r.status === 200 && r.body.pending.length === 2, 'the admin sees both pending applicants', `→ ${r.body.pending?.length}`);

    // ── 2b. AN UNAPPROVED APPLICANT IS NOT A MEMBER ───────────────────
    // The membership lookup used to be
    // `Fpo.findOne({ 'members.farmerUid': uid, status: 'active' })` — where
    // `status` is the FPO's own, not the member's. So it matched a member row
    // in ANY state, `/mine` handed a pending applicant the whole group, and
    // the admin approval gate was invisible from the applicant's side: they
    // saw themselves as a member of a group nobody had let them into.
    console.log('\n2b. A pending applicant is NOT shown as a member');

    r = await call('GET', '/api/fpos/mine', F[1]);
    check(r.body.fpo === null,
      'a farmer waiting for approval is NOT handed the group', `→ fpo=${r.body.fpo}`);
    check(r.body.membershipStatus === 'pending',
      '...and the state is said explicitly, so the screen can show "waiting for approval"',
      `→ ${r.body.membershipStatus}`);
    check(r.body.pendingRequest && String(r.body.pendingRequest.fpoId) === String(fpo._id)
      && r.body.pendingRequest.fpoName === fpo.name,
      'the request itself is surfaced — which group, so they are not left guessing',
      `→ ${r.body.pendingRequest?.fpoName}`);
    check(!!r.body.pendingRequest.requestedAt, 'with when they asked');
    check(!JSON.stringify(r.body).includes(F[2]),
      "and they cannot read the group's member list before being admitted");

    r = await call('GET', '/api/fpos/mine', OUTSIDER);
    check(r.body.fpo === null && r.body.membershipStatus === 'none' && r.body.pendingRequest === null,
      'a farmer with no group at all is a THIRD, distinguishable answer', `→ ${r.body.membershipStatus}`);

    r = await call('GET', '/api/fpos/mine', F[0]);
    check(r.body.membershipStatus === 'active' && r.body.fpo !== null,
      'while the approved founder is active and sees everything', `→ ${r.body.membershipStatus}`);

    // A pending request STILL counts as a commitment, deliberately — otherwise
    // one farmer could have live requests waiting with five groups at once and
    // five admins would each be approving somebody about to belong elsewhere.
    const rival = await Fpo.create({
      name: TAG + 'Rival Growers', district: 'Nashik',
      adminUid: TAG + 'rivaladmin', adminName: 'Rival',
      members: [{ farmerUid: TAG + 'rivaladmin', farmerName: 'Rival', status: 'active' }],
    });
    r = await call('POST', `/api/fpos/${rival._id}/join`, F[1]);
    check(r.status === 409 && r.body.code === 'ALREADY_MEMBER',
      'a pending applicant cannot ALSO request to join a second group', `→ ${r.body.code}`);
    check(r.body.membershipStatus === 'pending',
      '...and the refusal says it is a pending request, not a membership',
      `→ "${r.body.error}"`);
    r = await call('POST', '/api/fpos', F[1], { name: TAG + 'Breakaway' });
    check(r.status === 409 && r.body.code === 'ALREADY_MEMBER' && r.body.membershipStatus === 'pending',
      'nor start one of their own while a request is outstanding', `→ ${r.body.code}`);
    check((await Fpo.countDocuments({ name: TAG + 'Breakaway' })) === 0,
      'and nothing was created when they tried');
    await Fpo.deleteOne({ _id: rival._id });

    for (const uid of [F[1], F[2]]) {
      r = await call('POST', `/api/fpos/${fpo._id}/members/${uid}/approve`, F[0]);
      check(r.status === 200, `the admin approves ${uid.slice(-2)}`, `→ ${r.status}`);
    }

    r = await call('GET', '/api/fpos/mine', F[1]);
    check(r.body.fpo?.members.length === 3, 'a member sees the group', `→ ${r.body.fpo?.members.length}`);
    check(r.body.fpo.isAdmin === false, 'and knows they are not the admin');
    check(r.body.membershipStatus === 'active' && r.body.pendingRequest === null,
      'approval is what flips them from pending to a member — that IS the gate',
      `→ ${r.body.membershipStatus}`);
    r = await call('GET', '/api/fpos/mine', F[0]);
    check(r.body.fpo.isAdmin === true, 'the founder is flagged as admin');

    r = await call('GET', '/api/fpos/mine', OUTSIDER);
    check(r.body.fpo === null, 'a non-member has no group', `→ ${r.body.fpo}`);

    r = await call('GET', '/api/fpos/nearby', OUTSIDER);
    const near = r.body.fpos.filter((f) => f.name.startsWith(TAG));
    check(near.length === 1, 'and can find it to join', `→ ${near.length}`);
    check(near[0].members === undefined,
      'but the member LIST is never published to non-members');
    check(near[0].memberCount === 3, 'only the count is', `→ ${near[0].memberCount}`);

    // ── 3. the bundle — the point of the feature ──────────────────────
    console.log('\n3. Bundles a buyer can act on');
    await Promise.all([mkListing(0, 400), mkListing(1, 500), mkListing(2, 600)]);

    r = await call('GET',
      `/api/fpos/bundles?commodity=${encodeURIComponent(TAG + 'Onion')}&lat=${MANDI.lat}&lng=${MANDI.lng}`,
      VENDOR);
    check(r.status === 200, 'the buyer gets bundles', `→ ${r.status}`);
    const b = r.body.bundles.find((x) => x.fpoName.startsWith(TAG));
    check(!!b, 'including this group');
    check(b.farms === 3 && b.totalKg === 1500,
      'combining all three members lots', `→ ${b.farms} farms, ${b.totalKg} kg`);
    check(b.bundledFare < b.separateFare,
      'ONE vehicle beats three separate trips for a village-belt group',
      `→ ₹${b.bundledFare} vs ₹${b.separateFare}`);
    check(b.saving > 0 && b.worthIt === true,
      'and the saving is measured, not asserted', `→ ₹${b.saving} (${b.savingPct}%)`);
    check(b.transportPctBundled < b.transportPctSeparate,
      'transport falls as a share of crop value — the whole argument',
      `→ ${b.transportPctSeparate}% → ${b.transportPctBundled}%`);
    check(b.lots.length === 3 && b.lots.every((l) => l.farmerName),
      'and the buyer can see whose lots they are');

    // A single lot is not a bundle.
    await CropListing.updateMany(
      { farmerUid: { $in: [F[1], F[2]] } }, { $set: { status: 'withdrawn' } });
    r = await call('GET',
      `/api/fpos/bundles?commodity=${encodeURIComponent(TAG + 'Onion')}&lat=${MANDI.lat}&lng=${MANDI.lng}`,
      VENDOR);
    check(!r.body.bundles.some((x) => x.fpoName.startsWith(TAG)),
      'one remaining lot is NOT offered as a bundle — that is just a listing');

    r = await call('GET', `/api/fpos/bundles?commodity=${TAG}Onion`, VENDOR);
    check(r.status === 400, 'a bundle query without a destination is rejected');
    r = await call('GET',
      `/api/fpos/bundles?commodity=${TAG}Onion&lat=${MANDI.lat}&lng=${MANDI.lng}`, F[0]);
    check(r.status === 403, 'a farmer cannot browse buyer bundles', `→ ${r.status}`);

    // ── 4. leaving ────────────────────────────────────────────────────
    console.log('\n4. Leaving');
    r = await call('POST', `/api/fpos/${fpo._id}/leave`, F[0]);
    check(r.status === 409 && r.body.code === 'ADMIN_LAST',
      'the admin cannot walk out on a group that still has members', `→ ${r.body.code}`);

    r = await call('POST', `/api/fpos/${fpo._id}/leave`, F[2]);
    check(r.status === 200, 'an ordinary member leaves');
    const after = await Fpo.findById(fpo._id).lean();
    check(after.members.length === 2, 'and is removed', `→ ${after.members.length} left`);
    check(!after.members.some((m) => m.farmerUid === F[2]), 'specifically them');

    // Their listing is untouched — the group never owned it.
    const stillTheirs = await CropListing.findOne({ farmerUid: F[2] }).lean();
    check(!!stillTheirs && stillTheirs.farmerUid === F[2],
      "leaving does NOT touch the farmer's own listings — the group never owned them");

    // ── 5. the agreed share split ─────────────────────────────────────
    // The plan asks for "payment split by share". What that means here is a
    // RECORD of what the group agreed — the app moves no money, exactly as B1
    // established for settlement. What it buys is one set of arithmetic
    // everyone can see instead of three farmers reconciling on a phone call.
    console.log('\n5. Agreed revenue split');

    // Rebuild a clean three-member group (section 4 removed one).
    await Fpo.updateOne({ _id: fpo._id }, {
      $push: { members: { farmerUid: F[2], farmerName: 'Farmer3' } },
    });

    r = await call('PUT', `/api/fpos/${fpo._id}/shares`, F[1], {
      shares: F.map((uid) => ({ farmerUid: uid, sharePct: 33.34 })),
    });
    check(r.status === 403, 'only the admin can set shares', `→ ${r.status}`);

    r = await call('PUT', `/api/fpos/${fpo._id}/shares`, F[0], {
      shares: [{ farmerUid: F[0], sharePct: 50 }, { farmerUid: F[1], sharePct: 30 },
               { farmerUid: F[2], sharePct: 30 }],
    });
    check(r.status === 400 && r.body.code === 'SHARES_NOT_100',
      'a split that does not add to 100 is refused', `→ ${r.body.total}%`);

    r = await call('PUT', `/api/fpos/${fpo._id}/shares`, F[0], {
      shares: [{ farmerUid: F[0], sharePct: 50 }, { farmerUid: F[1], sharePct: 50 }],
    });
    check(r.status === 400 && r.body.code === 'MISSING_MEMBER',
      'every member needs a share, even a zero', `→ ${r.body.code}`);

    r = await call('PUT', `/api/fpos/${fpo._id}/shares`, F[0], {
      shares: [{ farmerUid: F[0], sharePct: 50 }, { farmerUid: F[1], sharePct: 25 },
               { farmerUid: OUTSIDER, sharePct: 25 }],
    });
    check(r.status === 400 && r.body.code === 'NOT_A_MEMBER',
      'a non-member cannot be given a share', `→ ${r.body.code}`);

    // Thirds must be accepted — 33.33 x 3 = 99.99, not 100.
    r = await call('PUT', `/api/fpos/${fpo._id}/shares`, F[0], {
      shares: F.map((uid) => ({ farmerUid: uid, sharePct: 33.33 })),
    });
    check(r.status === 200, 'an even three-way split (33.33 x 3) is accepted', '→ 99.99%');

    r = await call('PUT', `/api/fpos/${fpo._id}/shares`, F[0], {
      shares: [{ farmerUid: F[0], sharePct: 50 }, { farmerUid: F[1], sharePct: 30 },
               { farmerUid: F[2], sharePct: 20 }],
    });
    check(r.status === 200, 'the admin records an uneven split');
    check(r.body.fpo.members.find((m) => m.farmerUid === F[0]).sharePct === 50,
      'and it is stored per member');

    // ── 6. the settlement view ────────────────────────────────────────
    console.log('\n6. What each member is owed');
    const mkOrder = (i, qty) => Order.create({
      listingId: new mongoose.Types.ObjectId(), cropId: new mongoose.Types.ObjectId(),
      cropName: TAG + 'Onion', quantityKg: qty, pricePerKg: 30, cropTotal: qty * 30,
      farmerUid: F[i], farmerName: `Farmer${i + 1}`, farmerPhone: '900000000' + i,
      vendorUid: VENDOR, vendorName: 'Buyer', vendorPhone: '9000000009',
      pickup: { ...FARMS[i], label: 'Farm' }, dropoff: { ...MANDI, label: 'Mandi' },
      vehicleType: 'tempo', distanceKm: 20, durationMin: 40,
      fare: { base: 300, perKm: 28, distanceCharge: 560, total: 860 },
      grandTotal: qty * 30 + 860, farmerPayout: qty * 30,
      status: 'delivered', deliveredAt: new Date(), pickupOtp: '1111', dropOtp: '2222',
    });
    const os = [await mkOrder(0, 400), await mkOrder(1, 500), await mkOrder(2, 600)];
    const ids = os.map((o) => String(o._id)).join(',');

    r = await call('GET', `/api/fpos/${fpo._id}/settlement?orderIds=${ids}`, F[0]);
    check(r.status === 200, 'a member sees the settlement', `→ ${r.status}`);
    const st = r.body.settlement;
    check(st.pooledCropValue === 45000,
      'the pooled crop value is the sum of the members payouts', `→ ₹${st.pooledCropValue}`);
    check(st.sharesAgreed === true, 'and it knows a split was agreed');

    const lotSum = st.byLot.reduce((a, x) => a + x.amount, 0);
    const shareSum = st.byShare.reduce((a, x) => a + x.amount, 0);
    check(lotSum === st.pooledCropValue, 'BY LOT sums to the pooled total', `→ ₹${lotSum}`);
    check(shareSum === st.pooledCropValue,
      'BY SHARE sums to the pooled total EXACTLY — rounding drift absorbed',
      `→ ₹${shareSum}`);

    const f1 = st.difference.find((d) => d.farmerUid === F[0]);
    check(f1.byLot === 12000 && f1.byShare === 22500,
      'and the difference between the two is shown plainly',
      `→ own lot ₹${f1.byLot} vs agreed share ₹${f1.byShare} (${f1.delta > 0 ? '+' : ''}${f1.delta})`);
    check(st.difference.some((d) => d.delta < 0) && st.difference.some((d) => d.delta > 0),
      'so a member who does WORSE under the split can see that before agreeing');
    check(/does not move money/i.test(st.note),
      'and the note says the app records, it does not pay');

    r = await call('GET', `/api/fpos/${fpo._id}/settlement?orderIds=${ids}`, OUTSIDER);
    check(r.status === 403, 'a non-member cannot read it', `→ ${r.status}`);
    r = await call('GET', `/api/fpos/${fpo._id}/settlement?orderIds=${ids}`, VENDOR);
    check(r.status === 200, 'but the buyer who paid for them can');

    r = await call('DELETE', `/api/fpos/${fpo._id}/shares`, F[0]);
    check(r.status === 200, 'the admin can clear the split');
    r = await call('GET', `/api/fpos/${fpo._id}/settlement?orderIds=${ids}`, F[0]);
    check(r.body.settlement.sharesAgreed === false && r.body.settlement.byShare === null,
      'and it falls back to each member keeping their own lot value');

    // ── 7. a group BIGGER than a vehicle ──────────────────────────────
    // One run serves at most MAX_BUNDLE farms. The bundle used to take
    // `lots.slice(0, MAX_BUNDLE)` and say nothing: a buyer looking at an FPO
    // with eight live lots saw a price, a saving and a member list built from
    // five of them, and the other three did not exist in the response. Which
    // five survived was whatever order Mongo returned, so two identical
    // requests could quote two different bundles.
    console.log('\n7. When the group is bigger than the vehicle');

    const BIG = [];
    for (let i = 0; i < 8; i++) BIG.push(TAG + 'big' + i);
    await User.create(BIG.map((uid, i) => ({
      firebaseUid: uid, name: `Big${i}`, email: `${TAG}big${i}@t.com`,
      phone: '911000000' + i, role: 'farmer',
      location: { district: 'Nashik', state: 'Maharashtra' },
    })));

    const bigFpo = await Fpo.create({
      name: TAG + 'Twelve Village Growers', district: 'Nashik', village: 'Niphad',
      adminUid: BIG[0], adminName: 'Big0',
      members: BIG.map((uid, i) => ({ farmerUid: uid, farmerName: `Big${i}` })),
    });

    // Geography chosen so the right answer is not arguable: two farms 100+ km
    // away toward Nagpur, five in the village belt beside the mandi. They are
    // created FAR FIRST and with the BIGGEST loads, so neither "the first five
    // Mongo returns" nor "the five biggest lots" can produce the right answer
    // by accident — only the cluster rule can.
    const FAR = [{ lat: 20.9320, lng: 77.7523 }, { lat: 21.1458, lng: 79.0882 }];
    const NEAR = [
      { lat: 20.0800, lng: 74.1100 }, { lat: 20.0950, lng: 74.1350 },
      { lat: 20.0700, lng: 74.0900 }, { lat: 20.1100, lng: 74.1600 },
      { lat: 20.1250, lng: 74.2000 },
    ];
    const mkBigListing = (uid, name, qty, at) => CropListing.create({
      cropId: new mongoose.Types.ObjectId(), farmerUid: uid, farmerName: name,
      farmerPhone: '9110000000', cropName: TAG + 'Onion',
      quantityKg: qty, quantityAvailableKg: qty, minOrderKg: 25,
      pricePerKg: 30, totalPrice: qty * 30,
      location: at
        ? { city: 'Niphad', district: 'Nashik', state: 'Maharashtra', ...at }
        // No coordinates at all. This one lot used to sink the WHOLE bundle:
        // `if (points.length !== usable.length) continue` dropped the entire
        // group from the buyer's screen with no explanation.
        : { city: 'Niphad', district: 'Nashik', state: 'Maharashtra' },
      status: 'available',
    });

    for (let i = 0; i < 2; i++) await mkBigListing(BIG[i], `Big${i}`, 900 - i, FAR[i]);
    for (let i = 0; i < 5; i++) await mkBigListing(BIG[i + 2], `Big${i + 2}`, 100 + i, NEAR[i]);
    await mkBigListing(BIG[7], 'Big7', 250, null);   // no pickup point

    const bundleUrl = `/api/fpos/bundles?commodity=${encodeURIComponent(TAG + 'Onion')}`
      + `&lat=${MANDI.lat}&lng=${MANDI.lng}`;
    r = await call('GET', bundleUrl, VENDOR);
    check(r.status === 200, 'the buyer gets bundles for the big group', `→ ${r.status}`);
    const big = r.body.bundles.find((x) => String(x.fpoId) === String(bigFpo._id));
    check(!!big,
      'a group with one coordinate-less lot is NOT silently dropped from the market');

    check(big.lotsAvailable === 8 && big.membersAvailable === 8,
      'the response reports the TRUE number of eligible lots and members',
      `→ ${big.lotsIncluded} of ${big.lotsAvailable} lots, ${big.membersIncluded} of ${big.membersAvailable} members`);
    check(big.lotsIncluded === 5 && big.membersIncluded === 5 && big.farms === 5,
      'only MAX_BUNDLE of them ride on one vehicle', `→ ${big.farms} farms, maxBundle ${big.maxBundle}`);
    check(big.truncated === true, 'and the bundle SAYS it was truncated');
    check(big.excludedLots.length === 3,
      'naming every lot that was left out, rather than dropping them',
      `→ ${big.excludedLots.length} excluded`);
    check(big.lotsIncluded + big.excludedLots.length === big.lotsAvailable,
      'included + excluded accounts for every eligible lot — nothing vanishes');
    check(big.excludedLots.every((l) => l.farmerName && l.quantityKg > 0 && l.reason),
      'each excluded lot carries whose it is, how much, and why it is out',
      `→ ${big.excludedLots.map((l) => `${l.farmerName}:${l.reason}`).join(', ')}`);
    check(big.excludedLots.filter((l) => l.reason === 'no_pickup_location').length === 1,
      'a lot with no pickup point is excluded BY NAME, not by silently killing the bundle');
    check(/of 8 lots/.test(big.selectionNote) && /second run/.test(big.selectionNote),
      'and a caller can render "5 of 8" honestly from the response itself');

    // WHICH five: the tight cluster, never the arbitrary or the biggest.
    const includedUids = new Set(big.lots.map((l) => l.farmerUid));
    check([BIG[2], BIG[3], BIG[4], BIG[5], BIG[6]].every((u) => includedUids.has(u)),
      'the five chosen are the CLUSTERED farms, not the first five Mongo returned',
      `→ ${big.lots.map((l) => l.farmerName).join(', ')}`);
    check(!includedUids.has(BIG[0]) && !includedUids.has(BIG[1]),
      'the two farms 150 km off the route are excluded despite holding the BIGGEST lots — '
      + 'a scattered run costs more than it saves',
      `→ ${big.excludedLots.filter((l) => l.reason === 'beyond_max_bundle').map((l) => l.quantityKg + 'kg').join(', ')} left out`);
    check(big.selectionRule === 'tightest_cluster', 'and the rule is named in the response');

    check(big.totalKg === big.lots.reduce((a, l) => a + l.quantityKg, 0),
      'every headline figure is computed from the INCLUDED lots only',
      `→ ${big.totalKg} kg, not the group's full ${900 + 899 + 250 + big.totalKg} kg`);

    // Determinism: the same request twice must name the same five members.
    const r2 = await call('GET', bundleUrl, VENDOR);
    const big2 = r2.body.bundles.find((x) => String(x.fpoId) === String(bigFpo._id));
    check(JSON.stringify(big2.lots.map((l) => String(l._id)))
      === JSON.stringify(big.lots.map((l) => String(l._id))),
      'two identical requests select the same five farms, in the same order',
      '→ deterministic');
    check(big2.distanceKm === big.distanceKm && big2.bundledFare === big.bundledFare,
      'so the buyer is quoted the same route and the same fare twice',
      `→ ${big.distanceKm} km, ₹${big.bundledFare}`);

    // The small group from section 3 must still say it was NOT truncated.
    await CropListing.updateMany(
      { farmerUid: { $in: [F[1], F[2]] } }, { $set: { status: 'available' } });
    r = await call('GET', bundleUrl, VENDOR);
    const small = r.body.bundles.find((x) => x.fpoName.startsWith(TAG) && String(x.fpoId) === String(fpo._id));
    check(small && small.truncated === false && small.excludedLots.length === 0,
      'a group that fits in one vehicle reports nothing excluded',
      `→ ${small?.lotsIncluded} of ${small?.lotsAvailable}`);

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE B — there is no single FPO business model, so stop hard-coding one
    // ══════════════════════════════════════════════════════════════════════

    // ── 8. payment configuration ──────────────────────────────────────
    // Two things stop being hard-coded: how the FPO pays its members
    // (facilitation vs procurement) and how the vehicle was arranged
    // (hired / own / contracted). This section is the config surface; 9, 10
    // and 11 are what it actually changes.
    console.log('\n8. Payment configuration');

    r = await call('GET', `/api/fpos/${fpo._id}/payment`, F[0]);
    check(r.status === 200 && r.body.payment.paymentMode === 'facilitation',
      'an FPO that has never been configured is FACILITATION by default',
      `→ ${r.body.payment?.paymentMode}`);
    check(r.body.payment.facilitationFee.mode === 'none'
      && r.body.payment.facilitationFee.percent === 0
      && r.body.payment.facilitationFee.perKg === 0,
      'with a ZERO fee — which is exactly what this app did before payment modes existed');
    check(r.body.payment.procurementRates.length === 0,
      'and no procurement rates on file');

    r = await call('GET', `/api/fpos/${fpo._id}/payment`, F[1]);
    check(r.status === 403 && r.body.code === 'NOT_ADMIN',
      'a non-admin member cannot read the payment configuration', `→ ${r.status}`);
    r = await call('PUT', `/api/fpos/${fpo._id}/payment`, F[1], { paymentMode: 'procurement' });
    check(r.status === 403 && r.body.code === 'NOT_ADMIN',
      'and CANNOT change it', `→ ${r.status}`);
    r = await call('PUT', `/api/fpos/${fpo._id}/procurement-rates`, F[1], {
      rates: [{ cropName: TAG + 'Onion', grade: 'A', ratePerKg: 25 }],
    });
    check(r.status === 403 && r.body.code === 'NOT_ADMIN',
      'nor set what the group pays for a grade', `→ ${r.status}`);
    r = await call('PUT', `/api/fpos/${fpo._id}/procurement-rates`, OUTSIDER, {
      rates: [{ cropName: TAG + 'Onion', grade: 'A', ratePerKg: 25 }],
    });
    check(r.status === 403, 'and neither can a complete outsider', `→ ${r.status}`);

    r = await call('PUT', `/api/fpos/${fpo._id}/payment`, F[0], { paymentMode: 'barter' });
    check(r.status === 400 && r.body.code === 'BAD_PAYMENT_MODE',
      'an unknown payment mode is refused', `→ ${r.body.code}`);
    r = await call('PUT', `/api/fpos/${fpo._id}/payment`, F[0], {
      facilitationFee: { mode: 'percent', percent: 140 },
    });
    check(r.status === 400 && r.body.code === 'BAD_FEE',
      'a fee of 140% is refused', `→ ${r.body.code}`);
    r = await call('PUT', `/api/fpos/${fpo._id}/payment`, F[0], {
      facilitationFee: { mode: 'per_kg', perKg: -2 },
    });
    check(r.status === 400 && r.body.code === 'BAD_FEE', 'and so is a negative per-kg fee');

    r = await call('PUT', `/api/fpos/${fpo._id}/procurement-rates`, F[0], {
      rates: [{ cropName: TAG + 'Onion', grade: 'D', ratePerKg: 25 }],
    });
    check(r.status === 400 && r.body.code === 'BAD_GRADE',
      "a rate against a grade this app does not have could never be applied", `→ ${r.body.code}`);
    r = await call('PUT', `/api/fpos/${fpo._id}/procurement-rates`, F[0], {
      rates: [{ cropName: '  ', grade: 'A', ratePerKg: 25 }],
    });
    check(r.status === 400 && r.body.code === 'BAD_CROP', 'a rate needs a crop', `→ ${r.body.code}`);
    r = await call('PUT', `/api/fpos/${fpo._id}/procurement-rates`, F[0], {
      rates: [{ cropName: TAG + 'Onion', grade: 'A', ratePerKg: 0 }],
    });
    check(r.status === 400 && r.body.code === 'BAD_RATE',
      'a ₹0 rate is a missing figure wearing a number, not an agreement', `→ ${r.body.code}`);
    r = await call('PUT', `/api/fpos/${fpo._id}/procurement-rates`, F[0], {
      rates: [
        { cropName: TAG + 'Onion', grade: 'A', ratePerKg: 25 },
        { cropName: TAG + 'onion', grade: 'A', ratePerKg: 27 },
      ],
    });
    check(r.status === 400 && r.body.code === 'DUPLICATE_RATE',
      'one (crop, grade) has exactly one agreed rate', `→ ${r.body.code}`);

    // ── 9. facilitation: the fee, and WHEN it comes off ───────────────
    // The fee is deducted BEFORE any member share split. See the block
    // comment at the top of routes/fpos.js for why — the short version is
    // that a per-kg fee has no meaning against a share percentage, because a
    // share carries no kilograms.
    console.log('\n9. Facilitation fee, and the fee-vs-split ordering');

    // Re-record the split section 6 cleared: 50 / 30 / 20.
    r = await call('PUT', `/api/fpos/${fpo._id}/shares`, F[0], {
      shares: [{ farmerUid: F[0], sharePct: 50 }, { farmerUid: F[1], sharePct: 30 },
               { farmerUid: F[2], sharePct: 20 }],
    });
    check(r.status === 200, 'the split is recorded again for the fee tests');

    const settle = async (uid, orderIds) =>
      (await call('GET', `/api/fpos/${fpo._id}/settlement?orderIds=${orderIds}`, uid)).body.settlement;

    // Baseline: no fee. Must reproduce section 6 exactly.
    let s = await settle(F[0], ids);
    check(s.paymentMode === 'facilitation' && s.fpoPosition.fee.total === 0,
      'with no fee configured the FPO takes nothing', `→ ₹${s.fpoPosition.fee.total}`);
    check(s.byLot.every((l) => l.amount === l.grossAmount) && s.byLot[0].amount === 12000,
      'and every member keeps their whole lot value — the pre-Phase-B numbers, unchanged',
      `→ ₹${s.byLot.map((l) => l.amount).join(' / ')}`);
    check(s.byShare.reduce((a, x) => a + x.amount, 0) === 45000,
      'the share split still divides the full ₹45,000');

    // ── a PERCENTAGE fee ──
    r = await call('PUT', `/api/fpos/${fpo._id}/payment`, F[0], {
      facilitationFee: { mode: 'percent', percent: 2 },
    });
    check(r.status === 200 && r.body.payment.facilitationFee.mode === 'percent',
      'the admin records a 2% marketing fee', `→ ${r.body.payment?.facilitationFee?.percent}%`);

    s = await settle(F[0], ids);
    check(s.fpoPosition.fee.total === 900,
      '2% of ₹45,000 is ₹900 and that is what the FPO takes', `→ ₹${s.fpoPosition.fee.total}`);
    check(s.byLot[0].grossAmount === 12000 && s.byLot[0].fpoFee === 240 && s.byLot[0].amount === 11760,
      'a member sees their gross, the fee off it, and what is left',
      `→ ₹${s.byLot[0].grossAmount} − ₹${s.byLot[0].fpoFee} = ₹${s.byLot[0].amount}`);
    check(s.byLot.reduce((a, l) => a + l.fpoFee, 0) === s.fpoPosition.fee.total,
      "the members' apportioned fees sum EXACTLY to the fee charged — no drift");
    check(s.byLot.reduce((a, l) => a + l.amount, 0) + s.fpoPosition.fee.total === s.pooledCropValue,
      'payouts + fee reconcile to the gross sale, to the rupee',
      `→ ₹${s.byLot.reduce((a, l) => a + l.amount, 0)} + ₹${s.fpoPosition.fee.total} = ₹${s.pooledCropValue}`);

    check(s.netPoolAfterFee === 44100,
      'THE FEE COMES OFF BEFORE THE SPLIT — the pool the percentages divide is ₹44,100, not ₹45,000',
      `→ ₹${s.netPoolAfterFee}`);
    check(s.byShare.reduce((a, x) => a + x.amount, 0) === 44100,
      'so byShare sums to the NET pool');
    check(s.byShare.find((x) => x.farmerUid === F[0]).amount === 22050,
      'the 50% member gets 50% of the net (₹22,050), not 50% of the gross (₹22,500)',
      `→ ₹${s.byShare.find((x) => x.farmerUid === F[0]).amount}`);

    // ── a PER-KG fee ──
    r = await call('PUT', `/api/fpos/${fpo._id}/payment`, F[0], {
      facilitationFee: { mode: 'per_kg', perKg: 0.5 },
    });
    check(r.status === 200 && r.body.payment.facilitationFee.mode === 'per_kg'
      && r.body.payment.facilitationFee.percent === 0,
      'switching to a ₹0.50/kg fee clears the percentage — one fee, one number to check');

    s = await settle(F[0], ids);
    check(s.fpoPosition.fee.total === 750 && s.fpoPosition.fee.basis === 'kg_delivered',
      '1,500 kg at ₹0.50 is ₹750, charged on WEIGHT not on value', `→ ₹${s.fpoPosition.fee.total}`);
    check(s.byLot.every((l) => l.fpoFee === Math.round(l.quantityKg * 0.5)),
      'and each member pays for their own kilograms exactly — 400/500/600 kg → ₹200/₹250/₹300',
      `→ ₹${s.byLot.map((l) => l.fpoFee).join(' / ')}`);
    check(s.byLot[0].amount === 11800,
      'so the 400 kg member nets ₹11,800', `→ ₹${s.byLot[0].amount}`);
    check(s.netPoolAfterFee === 44250 && s.byShare.reduce((a, x) => a + x.amount, 0) === 44250,
      'the per-kg fee also comes off BEFORE the split — a share percentage carries no kilograms, '
      + 'so there is no honest way to charge it afterwards',
      `→ ₹${s.netPoolAfterFee}`);

    // ── 10. procurement ───────────────────────────────────────────────
    console.log('\n10. Procurement — the FPO buys the crop');

    // A procurement rate is keyed on (crop, GRADE), so the lots have to carry
    // a real grade and the orders have to point at them.
    const mkGraded = (i, qty, code) => CropListing.create({
      cropId: new mongoose.Types.ObjectId(), farmerUid: F[i],
      farmerName: `Farmer${i + 1}`, farmerPhone: '900000000' + i,
      cropName: TAG + 'Onion', quantityKg: qty, quantityAvailableKg: qty,
      minOrderKg: 25, pricePerKg: 30, totalPrice: qty * 30,
      location: { city: 'Niphad', district: 'Nashik', state: 'Maharashtra', ...FARMS[i] },
      grade: { code, selfDeclared: true },
      status: 'available',
    });
    const mkGradedOrder = (i, qty, listingId) => Order.create({
      listingId, cropId: new mongoose.Types.ObjectId(),
      cropName: TAG + 'Onion', quantityKg: qty, pricePerKg: 30, cropTotal: qty * 30,
      farmerUid: F[i], farmerName: `Farmer${i + 1}`, farmerPhone: '900000000' + i,
      vendorUid: VENDOR, vendorName: 'Buyer', vendorPhone: '9000000009',
      pickup: { ...FARMS[i], label: 'Farm' }, dropoff: { ...MANDI, label: 'Mandi' },
      vehicleType: 'tempo', distanceKm: 20, durationMin: 40,
      fare: { base: 300, perKm: 28, distanceCharge: 560, total: 860 },
      grandTotal: qty * 30 + 860, farmerPayout: qty * 30,
      status: 'delivered', deliveredAt: new Date(), pickupOtp: '1111', dropOtp: '2222',
    });

    // 400 kg Grade A, 500 kg Grade B, 600 kg Grade C — all sold at ₹30/kg.
    const gl = await Promise.all([mkGraded(0, 400, 'A'), mkGraded(1, 500, 'B'), mkGraded(2, 600, 'C')]);
    const gos = [
      await mkGradedOrder(0, 400, gl[0]._id),
      await mkGradedOrder(1, 500, gl[1]._id),
      await mkGradedOrder(2, 600, gl[2]._id),
    ];
    const gids = gos.map((o) => String(o._id)).join(',');

    // ── procurement × byShare is REFUSED, in BOTH directions ──
    r = await call('PUT', `/api/fpos/${fpo._id}/payment`, F[0], { paymentMode: 'procurement' });
    check(r.status === 400 && r.body.code === 'FEE_INCOHERENT_UNDER_PROCUREMENT',
      'a procurement FPO cannot also charge a marketing fee — it buys the crop, it does not market it',
      `→ ${r.body.code}`);

    r = await call('PUT', `/api/fpos/${fpo._id}/payment`, F[0], {
      paymentMode: 'procurement', facilitationFee: { mode: 'none' },
    });
    check(r.status === 409 && r.body.code === 'SHARES_INCOHERENT_UNDER_PROCUREMENT',
      'and cannot be switched on while a member share split is recorded — there would be no pool '
      + 'of proceeds to divide', `→ ${r.body.code}`);

    await call('DELETE', `/api/fpos/${fpo._id}/shares`, F[0]);
    r = await call('PUT', `/api/fpos/${fpo._id}/payment`, F[0], {
      paymentMode: 'procurement', facilitationFee: { mode: 'none' },
    });
    check(r.status === 200 && r.body.payment.paymentMode === 'procurement',
      'with the split cleared, the group switches to procurement', `→ ${r.body.payment?.paymentMode}`);

    r = await call('PUT', `/api/fpos/${fpo._id}/shares`, F[0], {
      shares: F.map((uid) => ({ farmerUid: uid, sharePct: 33.33 })),
    });
    check(r.status === 409 && r.body.code === 'SHARES_INCOHERENT_UNDER_PROCUREMENT',
      'and the refusal holds from the other side too — the split cannot be set afterwards',
      `→ ${r.body.code}`);
    check(/agreed per-grade rates/i.test(r.body.error),
      'with the reason stated, not a bare rejection');

    // ── the agreed rate, and a gap where there is none ──
    r = await call('PUT', `/api/fpos/${fpo._id}/procurement-rates`, F[0], {
      rates: [
        { cropName: TAG + 'Onion', grade: 'A', ratePerKg: 25 },
        { cropName: TAG + 'Onion', grade: 'B', ratePerKg: 20 },
      ],
    });
    check(r.status === 200 && r.body.appliesNow === true,
      'the admin agrees ₹25/kg for Grade A and ₹20/kg for Grade B — and NO rate for Grade C');

    s = await settle(F[0], gids);
    check(s.paymentMode === 'procurement', 'the settlement knows the group buys its members crop');
    const pA = s.byLot.find((l) => l.farmerUid === F[0]);
    check(pA.amount === 10000 && pA.grossAmount === 12000,
      'THE AGREED RATE IS WHAT IS OWED, NOT THE SALE PRICE — 400 kg × ₹25 = ₹10,000, '
      + 'even though the lot fetched ₹12,000 at ₹30/kg',
      `→ owed ₹${pA.amount}, lot fetched ₹${pA.grossAmount}`);
    check(s.byLot.find((l) => l.farmerUid === F[1]).amount === 10000,
      'and the Grade B member gets the Grade B rate — 500 kg × ₹20 — not a blended one',
      `→ ₹${s.byLot.find((l) => l.farmerUid === F[1]).amount}`);

    check(s.procurement.complete === false && s.procurement.gaps.length === 1,
      'the Grade C lot the group ACTUALLY HOLDS has no agreed rate, and that is reported',
      `→ ${s.procurement?.gaps?.length} gap(s)`);
    const gap = s.procurement.gaps[0];
    check(gap.reason === 'no_agreed_rate' && gap.grade === 'C' && gap.quantityKg === 600,
      'named by farmer, crop, grade and weight — not silently zeroed and not settled as facilitation',
      `→ ${gap.farmerName} ${gap.cropName} grade ${gap.grade} ${gap.quantityKg}kg`);
    const pC = s.byLot.find((l) => l.farmerUid === F[2]);
    check(pC.amount === 0 && pC.unpricedLots === 1 && pC.unpricedKg === 600,
      'that member is shown as UNPRICED, which is different from being owed zero',
      `→ ${pC.unpricedLots} lot / ${pC.unpricedKg} kg unpriced`);

    check(s.byShare === null && s.byShareRefused?.code === 'SHARES_INCOHERENT_UNDER_PROCUREMENT',
      'byShare is refused with a reason rather than computed into something meaningless');
    check(s.fpoPosition.margin === 45000 - 20000 && s.fpoPosition.complete === false,
      "the FPO's margin is reported, and flagged INCOMPLETE while a lot has no agreed rate",
      `→ ₹${s.fpoPosition.margin}, complete=${s.fpoPosition.complete}`);

    // ── a lot with no grade at all ──
    // The section-6 orders point at listings that no longer exist, which is
    // exactly the "we cannot tell what grade this was" case.
    s = await settle(F[0], ids);
    check(s.procurement.gaps.length === 3
      && s.procurement.gaps.every((g) => g.reason === 'grade_unknown'),
      'a lot whose grade cannot be established is a DIFFERENT gap, and says so',
      `→ ${s.procurement.gaps.map((g) => g.reason).join(', ')}`);
    check(s.memberPayableTotal === 0 && s.fpoPosition.complete === false,
      'nothing is invented for them — no fallback to facilitation, no fallback to zero rupees');

    // ── the margin CAN be negative, and is reported negative ──
    r = await call('PUT', `/api/fpos/${fpo._id}/procurement-rates`, F[0], {
      rates: [
        { cropName: TAG + 'Onion', grade: 'A', ratePerKg: 40 },
        { cropName: TAG + 'Onion', grade: 'B', ratePerKg: 40 },
        { cropName: TAG + 'Onion', grade: 'C', ratePerKg: 40 },
      ],
    });
    check(r.status === 200, 'the group agrees ₹40/kg across all three grades');

    s = await settle(F[0], gids);
    check(s.procurement.complete === true && s.procurement.gaps.length === 0,
      'now every (crop, grade) the group holds has a rate');
    check(s.memberPayableTotal === 60000,
      'members are owed 1,500 kg × ₹40 = ₹60,000', `→ ₹${s.memberPayableTotal}`);
    check(s.fpoPosition.margin === -15000,
      'THE LOT SOLD FOR ₹45,000 AND THE FPO PROMISED ₹60,000 — the margin is reported NEGATIVE, '
      + 'not clamped to zero', `→ ₹${s.fpoPosition.margin}`);
    check(s.fpoPosition.marginPerKg === -10,
      'and per kilogram too, so the group can see how far under it went', `→ ₹${s.fpoPosition.marginPerKg}/kg`);
    check(s.byLot.find((l) => l.farmerUid === F[0]).amount === 16000,
      'the member is STILL owed the agreed rate — a bad resale is the FPO\'s risk, which is what '
      + 'procurement means', `→ ₹${s.byLot.find((l) => l.farmerUid === F[0]).amount}`);

    r = await call('GET', `/api/fpos/${fpo._id}/settlement?orderIds=${gids}`, OUTSIDER);
    check(r.status === 403, 'and a non-member still cannot read any of it', `→ ${r.status}`);

    // ── 11. transport mode ────────────────────────────────────────────
    // Some FPOs own vehicles, some use a contracted transporter, some hire on
    // demand. `hired` is the captain pool and is untouched; own/contracted
    // never reach it — and the gap that closes is that an agentless run used
    // to be unfinishable, because per-stop outcomes were agent-authenticated.
    console.log('\n11. Transport mode — hired, own, contracted');

    let otpSeq = 3000;
    const mkPoolable = (i, qty) => Order.create({
      listingId: new mongoose.Types.ObjectId(), cropId: new mongoose.Types.ObjectId(),
      cropName: TAG + 'Onion', quantityKg: qty, pricePerKg: 30, cropTotal: qty * 30,
      farmerUid: F[i], farmerName: `Farmer${i + 1}`, farmerPhone: '900000000' + i,
      vendorUid: VENDOR, vendorName: 'Buyer', vendorPhone: '9000000009',
      pickup: { ...FARMS[i], label: 'Farm' }, dropoff: { ...MANDI, label: 'Mandi' },
      vehicleType: 'tempo', distanceKm: 20, durationMin: 40,
      fare: { base: 300, perKm: 28, distanceCharge: 560, total: 860, agentPayout: 860 },
      grandTotal: qty * 30 + 860, farmerPayout: qty * 30,
      status: 'awaiting_agent', consignmentId: null,
      pickupOtp: String(++otpSeq), dropOtp: '9999',
    });

    // ── a HIRED run: unchanged ──
    const h1 = await mkPoolable(0, 400), h2 = await mkPoolable(1, 500);
    r = await call('POST', '/api/consignments', VENDOR, {
      orderIds: [String(h1._id), String(h2._id)], vehicleType: 'tempo',
    });
    check(r.status === 201 && r.body.consignment.transportMode === 'hired',
      'a run booked with no transportMode is HIRED — the old behaviour is the default',
      `→ ${r.body.consignment?.transportMode}`);
    const hired = r.body.consignment;
    check(hired.status === 'awaiting_agent' && hired.dispatchExpiresAt && r.body.dispatched === true,
      'and it goes to the captain pool with a dispatch window');
    check(r.body.costSource === 'captain_fare_table',
      'its cost is labelled as computed by the fare table', `→ ${r.body.costSource}`);

    r = await call('GET', `/api/consignments/agent/available?lat=${FARMS[0].lat}&lng=${FARMS[0].lng}`, AGENT);
    check(r.body.consignments.some((c) => String(c._id) === String(hired._id)),
      'a captain is offered it');

    // ── ⚠️ own/contracted transport on THIS endpoint is now REFUSED ──────
    //
    // 🐛🔒 L2 + L4, found and fixed in review. This block used to create a
    // real own-vehicle run AS THE BUYER (`VENDOR`), naming an arbitrary FPO's
    // vehicle and stating its cost — with NOTHING checking that the named FPO
    // had any part in the decision. That is exactly the hole: on a lot sale
    // the equivalent body comes from a BUYER too, so a buyer could commit an
    // FPO's own tempo at a price the FPO never agreed to.
    //
    // Verified before retiring it: ShareVehicleScreen (the only caller of this
    // route) never sends `transportMode` or `fpoId` — so nothing real used
    // this path, and closing it costs no working feature. The endpoint is now
    // explicitly HIRED_ONLY, with a named reason rather than a confusing
    // NOT_FPO_ADMIN. The security properties this block used to prove (who
    // may record a stop on an agentless run, WRONG_CODE still enforced, an
    // admin can finish the run) are proven instead in testCollection.js §10,
    // against the run type that is actually reachable: one created by the
    // FPO's OWN admin via POST /:id/collection-runs.
    const o1 = await mkPoolable(1, 400), o2 = await mkPoolable(2, 500);
    r = await call('POST', '/api/consignments', VENDOR, {
      orderIds: [String(o1._id), String(o2._id)], vehicleType: 'tempo', transportMode: 'own',
      fpoId: String(fpo._id),
      transport: { driverName: 'Sopan Patil', driverPhone: '9822001122', vehicleNumber: 'MH15CD9012', cost: 1400 },
    });
    check(r.status === 400 && r.body.code === 'HIRED_ONLY',
      '⚠️ a BUYER can no longer name an FPO\'s own vehicle on their pooled run',
      `→ ${r.status} ${r.body.code}`);

    r = await call('POST', '/api/consignments', VENDOR, {
      orderIds: [String(o1._id), String(o2._id)], vehicleType: 'tempo', transportMode: 'contracted',
      fpoId: String(fpo._id),
      transport: { driverName: 'Bharat Transport', driverPhone: '9822003344', vehicleNumber: 'MH15EF3456', cost: 1800 },
    });
    check(r.status === 400 && r.body.code === 'HIRED_ONLY',
      'nor a negotiated third-party rate under an FPO\'s name', `→ ${r.status} ${r.body.code}`);

    // The refused orders are untouched and remain bookable normally.
    r = await call('POST', '/api/consignments', VENDOR, {
      orderIds: [String(o1._id), String(o2._id)], vehicleType: 'tempo',
    });
    check(r.status === 201 && r.body.consignment.transportMode === 'hired',
      'the SAME orders still pool normally once transportMode is simply omitted', `→ ${r.status}`);

    // ── a HIRED run still refuses everyone but its captain ──
    r = await call('POST', `/api/consignments/${hired._id}/accept`, AGENT, {
      lat: FARMS[0].lat, lng: FARMS[0].lng,
    });
    check(r.status === 200, 'a captain accepts the hired run');
    r = await call('POST', `/api/consignments/${hired._id}/stop-outcome`, F[0], {
      orderId: String(h1._id), outcome: 'not_collected', reason: 'farmer_absent',
    });
    check(r.status === 403 && r.body.code === 'AGENT_ONLY',
      'the FPO admin CANNOT reach into a hired run — somebody stood at that gate and it is their '
      + 'account of it', `→ ${r.body.code}`);
    r = await call('POST', `/api/consignments/${hired._id}/stop-outcome`, AGENT2, {
      orderId: String(h1._id), outcome: 'not_collected', reason: 'farmer_absent',
    });
    check(r.status === 404, 'and a captain who is not the assigned one still gets nothing',
      `→ ${r.status}`);
    check((await Order.findById(h1._id).lean()).status === 'accepted',
      'nothing moved on either attempt');

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE C — the bundle stops being a savings calculator and becomes a
    //  CATALOG OF REAL, SELLABLE, GRADE-SEPARATED LOTS
    // ══════════════════════════════════════════════════════════════════════
    //
    // The rule being enforced: A BUYER PAYING FOR GRADE A MUST NOT RECEIVE A
    // BLEND OF A, B AND C. Everything in this section exists because the old
    // response grouped a group's listings by (FPO, crop) and said nothing about
    // grade at all.
    //
    // One fixture group, deliberately awkward, so every trap is live at once:
    //   G0  Grade A 400 kg ₹20 min 100    ┐ ONE farmer, TWO grade lots, one farm
    //   G0  Grade B 250 kg ₹14 min  50    ┘ → one pickup stop, not two
    //   G1  Grade A 600 kg ₹26 min 500      → members disagree on price AND on
    //                                          how little they will sell
    //   G2  Grade B 300 kg ₹15 min  50      → pinned to an older spec version
    //   G3  UNGRADED 500 kg ₹18 min 40      → nobody declared a grade
    //   G4–G8 Grade C, clustered            ┐ seven contributors to ONE lot, so
    //   G9,G10 Grade C, 150 km off, biggest ┘ the ≤5 cap fires in THAT lot only
    console.log('\n12. Grade-separated lots (Phase C)');

    const G = [];
    for (let i = 0; i < 11; i++) G.push(TAG + 'g' + i);
    await User.create(G.map((uid, i) => ({
      firebaseUid: uid, name: `G${i}`, email: `${TAG}g${i}@t.com`,
      phone: '922000000' + i, role: 'farmer',
      location: { district: 'Nashik', state: 'Maharashtra' },
    })));

    const gFpo = await Fpo.create({
      name: TAG + 'Grade Separated Growers', district: 'Nashik', village: 'Niphad',
      adminUid: G[0], adminName: 'G0',
      members: G.map((uid, i) => ({ farmerUid: uid, farmerName: `G${i}` })),
    });

    const TOM = TAG + 'Tomato';
    const NEAR_T = [
      { lat: 20.0800, lng: 74.1100 },  // G0 — both of G0's listings sit HERE
      { lat: 20.0950, lng: 74.1350 },  // G1
      { lat: 20.0700, lng: 74.0900 },  // G2
      { lat: 20.1100, lng: 74.1600 },  // G3
      { lat: 20.1250, lng: 74.2000 },  // G4
      { lat: 20.0850, lng: 74.1450 },  // G5
      { lat: 20.0900, lng: 74.1200 },  // G6
      { lat: 20.1000, lng: 74.1700 },  // G7
      { lat: 20.1150, lng: 74.1900 },  // G8
    ];
    const FAR_T = [{ lat: 20.9320, lng: 77.7523 }, { lat: 21.1458, lng: 79.0882 }];

    const mkLot = (uid, name, qty, price, min, gradeCode, at, specVersion = 2) =>
      CropListing.create({
        cropId: new mongoose.Types.ObjectId(), farmerUid: uid, farmerName: name,
        farmerPhone: '9220000000', cropName: TOM,
        quantityKg: qty, quantityAvailableKg: qty, minOrderKg: min,
        pricePerKg: price, totalPrice: qty * price,
        grade: gradeCode
          ? { code: gradeCode, specKey: 'tomato', specVersion, selfDeclared: true, note: '' }
          // Grading is OPTIONAL — this is what most rows in this database
          // actually look like, and it must not be filled in on their behalf.
          : undefined,
        location: { city: 'Niphad', district: 'Nashik', state: 'Maharashtra', ...at },
        status: 'available',
      });

    await mkLot(G[0], 'G0', 400, 20, 100, 'A', NEAR_T[0]);
    await mkLot(G[1], 'G1', 600, 26, 500, 'A', NEAR_T[1]);
    await mkLot(G[0], 'G0', 250, 14, 50, 'B', NEAR_T[0]);
    await mkLot(G[2], 'G2', 300, 15, 50, 'B', NEAR_T[2], 1);   // older pinned spec
    await mkLot(G[3], 'G3', 500, 18, 40, null, NEAR_T[3]);     // ungraded
    for (let i = 0; i < 5; i++) await mkLot(G[4 + i], `G${4 + i}`, 100 + i, 12, 25, 'C', NEAR_T[4 + i]);
    await mkLot(G[9], 'G9', 900, 12, 25, 'C', FAR_T[0]);       // biggest, and 150 km off
    await mkLot(G[10], 'G10', 899, 12, 25, 'C', FAR_T[1]);

    // Delivery history, so trust has something real to refuse to band on.
    // G0 has three delivered orders (>= MIN_TRADES_TO_SCORE), G1 has two.
    const mkDelivered = (uid, name, qty) => Order.create({
      listingId: new mongoose.Types.ObjectId(), cropId: new mongoose.Types.ObjectId(),
      cropName: TOM, quantityKg: qty, pricePerKg: 20, cropTotal: qty * 20,
      farmerUid: uid, farmerName: name, farmerPhone: '9220000000',
      vendorUid: VENDOR, vendorName: 'Buyer', vendorPhone: '9000000009',
      pickup: { ...NEAR_T[0], label: 'Farm' }, dropoff: { ...MANDI, label: 'Mandi' },
      vehicleType: 'tempo', distanceKm: 20, durationMin: 40,
      fare: { base: 300, perKm: 28, distanceCharge: 560, total: 860 },
      grandTotal: qty * 20 + 860, farmerPayout: qty * 20,
      status: 'delivered', deliveredAt: new Date(), pickupOtp: '1111', dropOtp: '2222',
    });
    for (let i = 0; i < 3; i++) await mkDelivered(G[0], 'G0', 100);
    for (let i = 0; i < 2; i++) await mkDelivered(G[1], 'G1', 100);

    const tomatoUrl = `/api/fpos/bundles?commodity=${encodeURIComponent(TOM)}`
      + `&lat=${MANDI.lat}&lng=${MANDI.lng}`;
    r = await call('GET', tomatoUrl, VENDOR);
    check(r.status === 200, 'the buyer gets the catalog', `→ ${r.status}`);
    check(r.body.gradeSeparated === true, 'and it declares itself grade-separated');
    const mine = r.body.bundles.filter((x) => String(x.fpoId) === String(gFpo._id));

    // ── 12a. A/B/C NEVER BLEND ────────────────────────────────────────
    check(mine.length === 4,
      'ONE group with four grades comes back as FOUR lots, not one bundle',
      `→ ${mine.map((l) => l.gradeKey).join(', ')}`);
    const lotA = mine.find((l) => l.gradeKey === 'A');
    const lotB = mine.find((l) => l.gradeKey === 'B');
    const lotC = mine.find((l) => l.gradeKey === 'C');
    const lotU = mine.find((l) => l.gradeKey === 'ungraded');
    check(!!lotA && !!lotB && !!lotC && !!lotU, 'A, B, C and ungraded each get their own lot');
    check(mine.every((l) => new Set(l.contributors.map((c) => c.grade)).size === 1),
      'NO LOT MIXES TWO GRADES — a buyer paying for A never receives a blend of A, B and C');
    check(lotA.contributors.every((c) => c.grade === 'A')
      && lotB.contributors.every((c) => c.grade === 'B')
      && lotC.contributors.every((c) => c.grade === 'C'),
      'and every contribution carries the grade of the lot it is in');
    check(lotA.totalKg === 1000 && lotB.totalKg === 550,
      'each lot aggregates only its own grade', `→ A ${lotA.totalKg} kg, B ${lotB.totalKg} kg`);
    check(mine.every((l) => l.cropName === TOM), 'all four are the same crop, split only by grade');

    // ── 12b. the ungraded bucket — neither dropped nor promoted ───────
    check(!!lotU && lotU.totalKg === 500,
      'the ungraded listing IS in the catalog — hiding it would empty the screen',
      `→ ${lotU?.totalKg} kg`);
    check(lotU.contributors.length === 1 && lotU.contributors[0].farmerUid === G[3],
      'with the farmer who posted it named');
    check(lotU.ungraded === true && lotU.grade.code === null && lotU.grade.declared === false,
      'it is marked ungraded — no invented grade');
    check(lotU.grade.label === 'Grade not declared',
      'and labelled as a MISSING DECLARATION, not as a grade', `→ "${lotU.grade.label}"`);
    check(lotU.grade.tier === null,
      'it is NOT ranked as a fourth tier below C — unknown is not "worse than C"');
    check(/not a grade below/i.test(lotU.grade.disclaimer),
      'the disclaimer says so in words a buyer will read');
    check(lotU.grade.selfDeclared === false && lotU.grade.declaredBy === 0,
      'and nobody is credited with declaring anything about it');
    check(lotU.contributors.every((c) => c.grade === null),
      'its contributions carry a null grade, never a letter');

    // ── 12c. aggregation must not launder a self-declared claim ───────
    check(lotA.grade.selfDeclared === true && lotA.grade.inspected === false,
      'a graded lot still says the grade is self-declared and uninspected');
    check(lotA.grade.declaredBy === 2,
      'TWO farmers each declared their OWN produce Grade A — two claims, not one verified fact',
      `→ declaredBy ${lotA.grade.declaredBy}`);
    check(/Nobody has inspected/i.test(lotA.grade.disclaimer),
      'and gradeSpecs\' own disclaimer travels with the lot');
    check(lotA.contributors.every((c) => c.gradePin.selfDeclared === true),
      'every contributor keeps its own selfDeclared flag');
    check(lotB.grade.mixedSpecVersions === true && lotB.grade.specVersions.length === 2,
      'two members pinned to DIFFERENT spec versions are flagged, not silently merged',
      `→ versions ${lotB.grade.specVersions.join(', ')}`);
    check(lotA.grade.mixedSpecVersions === false,
      'while a lot whose members agree on the spec says nothing alarming');
    check(lotA.grade.agmarkClass === 'Extra Class' || lotA.grade.agmarkClass === null,
      'the AGMARK class is read from the published spec, never invented',
      `→ ${lotA.grade.agmarkClass}`);

    // ── 12d. THE PRICING TRAP — spread reported, not averaged away ────
    check(lotA.price.minPerKg === 20 && lotA.price.maxPerKg === 26,
      'within one grade lot the members ask DIFFERENT prices, and both ends are reported',
      `→ ₹${lotA.price.minPerKg}–₹${lotA.price.maxPerKg}/kg`);
    check(lotA.price.spreadPerKg === 6 && lotA.price.spreadPct === 30,
      'the spread is stated in rupees and as a percentage of the cheapest member',
      `→ ₹${lotA.price.spreadPerKg}/kg, ${lotA.price.spreadPct}%`);
    check(lotA.price.wide === true && lotA.price.distinctPrices === 2,
      'and a wide spread is called out rather than left to be spotted');
    check(lotA.price.indicativePerKg === 23.6,
      'the indicative price is the weighted average — 400x20 + 600x26 over 1000 kg',
      `→ ₹${lotA.price.indicativePerKg}/kg`);
    check(lotA.contributors.every((c) => c.pricePerKg !== lotA.price.indicativePerKg),
      'NO member is quoted at that average — it is not a price anyone offered');
    check(lotA.contributors.find((c) => c.farmerUid === G[1]).pricePerKg === 26,
      'the member asking above average keeps their own price, undamaged',
      '→ ₹26/kg survives into contributors[]');
    check(lotA.cropValue === 23600,
      'and the lot value is the sum of each member\'s own price x their own kg',
      `→ ₹${lotA.cropValue}`);
    check(lotC.price.distinctPrices === 1 && lotC.price.wide === false && lotC.price.spreadPerKg === 0,
      'a lot whose members agree on price reports a zero spread, not a fake range');
    check(/asking prices/i.test(lotA.price.note) && /contributors/.test(lotA.price.note),
      'the note points an ordering flow at the per-member price it must honour');

    // ── 12e. what the lot minimum does and does NOT guarantee ─────────
    // G0 sells from 100 kg, G1 only from 500. A 200 kg order can be filled
    // from G0 alone and from nobody else.
    check(lotA.minOrder.smallestOrderKg === 100 && lotA.minOrderKg === 100,
      'the lot minimum is the smallest ANY ONE member will sell', `→ ${lotA.minOrderKg} kg`);
    check(lotA.minOrder.fillableAtSmallestFrom === 1,
      'and it says only ONE of the two contributors can fill an order that size');
    check(lotA.minOrder.byContributor.filter((c) => c.minOrderKg <= 200).length === 1,
      'so a 200 kg order is fillable from member A only — not "from the lot"');
    check(lotA.minOrder.largestContributorMinKg === 500
      && lotA.minOrder.allContributorsMinKg === 600,
      'the other end is reported too: drawing on EVERY member needs 600 kg',
      `→ largest min ${lotA.minOrder.largestContributorMinKg} kg`);
    check(/does NOT mean/i.test(lotA.minOrder.note),
      'and the note refuses the reading that any quantity above it is fillable from the whole lot');
    check(lotA.contributors.every((c) => typeof c.minOrderKg === 'number'),
      'every contributor carries its own minimum, because it does not aggregate');

    // ── 12f. the ≤5 cap runs PER LOT ──────────────────────────────────
    check(lotC.lotsAvailable === 7 && lotC.membersAvailable === 7,
      'the Grade C lot has seven contributing members', `→ ${lotC.lotsAvailable}`);
    check(lotC.lotsIncluded === 5 && lotC.farms === 5 && lotC.truncated === true,
      'only MAX_BUNDLE of them ride on one vehicle, and the lot says it was truncated');
    check(lotC.excludedLots.length === 2
      && lotC.excludedLots.every((l) => l.reason === 'beyond_max_bundle'),
      'the other two are named with a reason, not dropped');
    check(lotC.excludedLots.every((l) => [G[9], G[10]].includes(l.farmerUid)),
      'and the two excluded are the FAR ones, despite holding the biggest loads',
      `→ ${lotC.excludedLots.map((l) => l.quantityKg + 'kg').join(', ')} left out`);
    check([lotA, lotB, lotU].every((l) => l.truncated === false && l.excludedLots.length === 0),
      'THE CAP IS PER LOT — one truncated lot does not truncate the group\'s other three');
    // 2 Grade A + 2 Grade B + 1 ungraded + 7 Grade C = 12 listings posted above.
    check(mine.reduce((a, l) => a + l.lotsIncluded + l.excludedLots.length, 0) === 12,
      'included + excluded across all four lots accounts for every listing — nothing vanishes',
      '→ 12 listings');
    check(lotC.totalKgAvailable === lotC.totalKg + 900 + 899,
      'and the lot reports what the group HOLDS beside what the vehicle carries',
      `→ ${lotC.totalKg} kg aboard of ${lotC.totalKgAvailable} kg held`);
    check(lotC.selectionRule === 'tightest_cluster' && /Grade C run/.test(lotC.selectionNote),
      'the selection rule is named, and the note says which grade\'s run it describes');

    // ── 12g. ONE FARMER, TWO LOTS, ONE PICKUP STOP ────────────────────
    const g0InA = lotA.contributors.find((c) => c.farmerUid === G[0]);
    const g0InB = lotB.contributors.find((c) => c.farmerUid === G[0]);
    check(!!g0InA && !!g0InB,
      'a farmer holding Grade A AND Grade B of one crop appears in BOTH lots — correctly');
    check(String(g0InA.listingId) !== String(g0InB.listingId),
      'as two distinct listings, each with its own price and minimum',
      `→ ₹${g0InA.pricePerKg} vs ₹${g0InB.pricePerKg}`);
    const link = lotA.farmersAlsoInOtherLots.find((x) => x.farmerUid === G[0]);
    check(!!link && link.otherGrades.includes('B'),
      'and the lot NAMES them as also being in another lot — the identity Phase D dedupes stops by',
      `→ ${link?.otherLotKeys.join(', ')}`);
    check(lotA.farmersAlsoInOtherLots.every((x) => x.farmerUid && x.otherLotKeys.length),
      'every such link resolves to a farmerUid and a lot key');
    check(/ONE pickup stop, not two/.test(lotA.collection.crossLotNote)
      && /Do not add two/.test(lotA.collection.crossLotNote),
      'and the response warns that two lots are ONE vehicle, so fares must not be added');
    check(lotU.farmersAlsoInOtherLots.length === 0,
      'a farmer in only one lot is not falsely linked to another');

    // ── 12h. trust, per contributor and unbanded below the minimum ────
    check(mine.every((l) => l.contributors.every((c) => c.trust
      && String(c.trust.subject.farmerUid) === String(c.farmerUid))),
      'EVERY contributor carries their OWN delivery record — buying from 5 farmers means 5 records');
    check(mine.every((l) => !('trust' in l) && !('groupTrust' in l)),
      'and there is NO blended group trust score anywhere — that would be a fabrication');
    const g1Trust = lotA.contributors.find((c) => c.farmerUid === G[1]).trust;
    check(g1Trust.deliveries === 2 && g1Trust.scored === false && g1Trust.band === null,
      'a farmer below MIN_TRADES_TO_SCORE is NOT banded — counts only',
      `→ ${g1Trust.deliveries} deliveries, band ${g1Trust.band}`);
    check(g1Trust.minTradesToScore === 3 && /too few/i.test(g1Trust.reason),
      'with the threshold and the reason stated, not an invented score');
    check(g0InA.trust.deliveries === 3 && g0InA.trust.scored === true,
      'a farmer at the threshold IS banded, from real delivered orders',
      `→ ${g0InA.trust.band}`);
    check(String(g0InA.trust.subject.farmerUid) === String(g0InB.trust.subject.farmerUid)
      && g0InA.trust.deliveries === g0InB.trust.deliveries,
      'and the same farmer shows the SAME record in both of their lots');

    // ── 12i. a one-farm lot claims no saving it has not got ───────────
    check(lotU.collection.priceable === true && lotU.collection.pooled === false
      && lotU.collection.reason === 'single_contributor',
      'a lot with one contributor is still priced and still catalogued — just not pooled');
    check(lotU.saving === 0 && lotU.worthIt === false && lotU.bundledFare === lotU.separateFare,
      'one stop is one trip: the saving is exactly 0, never a manufactured percentage',
      `→ ₹${lotU.bundledFare} either way`);
    check(lotA.collection.pooled === true && lotA.bundledFare < lotA.separateFare,
      'while a real multi-farm lot still shows the pooled saving Phase A measured',
      `→ ₹${lotA.bundledFare} vs ₹${lotA.separateFare}`);
    check(lotA.saving === lotA.collection.saving
      && lotA.distanceKm === lotA.collection.distanceKm,
      'the flattened figures the buyer screen reads are the SAME numbers as collection{}');

    // ── 12j. the admin's dashboard and the buyer's catalog agree ──────
    // Two screens, one arithmetic (services/lotCatalogService.js). If these
    // ever disagree, one of them is lying to somebody about the same crop.
    r = await call('GET', `/api/fpos/${gFpo._id}/dashboard`, G[0]);
    check(r.status === 200, 'the group admin loads the dashboard', `→ ${r.status}`);
    const pa = r.body.dashboard.producesAggregation;
    const dashLots = (pa.availableLots || []).filter((l) => l.cropName === TOM);
    check(dashLots.length === 4 && pa.gradeSeparated === true,
      'the admin sees the SAME four grade lots the buyer does',
      `→ ${dashLots.map((l) => l.gradeKey).join(', ')}`);
    check(pa.gradedLots === 3 && pa.ungradedLots === 1,
      'counted as three declared grades and one ungraded lot — never four grades');
    check(dashLots.every((l) => new Set(l.contributors.map((c) => c.grade)).size === 1),
      'and no lot blends grades on the admin\'s side either');
    for (const key of ['A', 'B', 'ungraded']) {
      const d = dashLots.find((l) => l.gradeKey === key);
      const c = mine.find((l) => l.gradeKey === key);
      check(d.totalKg === c.totalKg && d.membersIncluded === c.membersIncluded,
        `the ${key} lot holds the same kilograms on both screens`, `→ ${d.totalKg} kg`);
    }
    const dashC = dashLots.find((l) => l.gradeKey === 'C');
    check(dashC.totalKg === lotC.totalKgAvailable
      && dashC.totalKg === lotC.totalKg + lotC.excludedLots.reduce((a, l) => a + l.quantityKg, 0),
      'and for the truncated lot the admin\'s total equals the buyer\'s included + excluded',
      `→ ${dashC.totalKg} kg = ${lotC.totalKg} + excluded`);
    check(pa.availableNow[TOM] === dashLots.reduce((a, l) => a + l.totalKg, 0),
      'availableNow is the same stock rolled up across grades — the two cannot drift',
      `→ ${pa.availableNow[TOM]} kg`);
    check(dashLots.every((l) => l.contributors.every((c) => c.trust)),
      'the admin sees each member\'s own delivery record too, per contributor');
    check(/never blended|not a grade below|ungraded/i.test(pa.lotsNote),
      'and the dashboard states the grade rule in words');

    // ── 12k. a lot nobody can drive to is NAMED, not dropped ──────────
    // Before Phase C this took the whole group off the buyer's screen with a
    // bare `continue`. The stock is real; what is missing is a pickup point.
    const BRJ = TAG + 'Brinjal';
    for (const i of [1, 2]) {
      await CropListing.create({
        cropId: new mongoose.Types.ObjectId(), farmerUid: G[i], farmerName: `G${i}`,
        cropName: BRJ, quantityKg: 200, quantityAvailableKg: 200,
        minOrderKg: 20, pricePerKg: 16, totalPrice: 3200,
        // No lat/lng at all.
        location: { city: 'Niphad', district: 'Nashik', state: 'Maharashtra' },
        status: 'available',
      });
    }
    r = await call('GET', `/api/fpos/bundles?commodity=${encodeURIComponent(BRJ)}`
      + `&lat=${MANDI.lat}&lng=${MANDI.lng}`, VENDOR);
    check(!r.body.bundles.some((x) => x.cropName === BRJ),
      'a lot with no pickup point anywhere in it is not offered as a priced bundle');
    const dead = (r.body.unpriceableLots || []).find((x) => x.cropName === BRJ);
    check(!!dead && dead.totalKgAvailable === 400,
      'but it IS reported, with the kilograms the group actually holds',
      `→ ${dead?.totalKgAvailable} kg`);
    check(dead.collection.priceable === false && dead.collection.reason === 'no_pickup_location',
      'labelled unpriceable with the reason, not quietly dropped');
    check(dead.collection.bundledFare === null && dead.collection.saving === null,
      'and its fares are NULL — unknown, never a free trip at ₹0');
    check(dead.excludedLots.length === 2
      && dead.excludedLots.every((l) => l.reason === 'no_pickup_location' && l.farmerName),
      'with both contributing listings named');

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE D — A LOT SOMEBODY CAN ACTUALLY BUY: QUOTE, THEN CONFIRM
    // ══════════════════════════════════════════════════════════════════════
    //
    // Phase C made the catalog. Nothing could be bought from it. These two
    // routes are the sale, and the thing being tested hardest is not the happy
    // path — it is that a confirm which fails leaves the database EXACTLY as it
    // found it: no half-decremented stock, no orphan Orders, no orphan
    // Consignment.
    //
    // One group, several crops, each crop shaped to make one trap live:
    //   Chilli    five members, five different asking prices and minimums
    //   Gapcrop   three members whose minimums leave REAL GAPS in what can be
    //             composed — 2,200 kg is impossible while 2,100 and 2,300 are fine
    //   Bigcrop   15,000 kg across five farms — more than any vehicle can carry
    //   Rollbk    the partial-failure fixture
    //   Override  a lot to confirm while lying about it in the request body
    //   Payout    the same sale under facilitation and under procurement
    console.log('\n13. Selling a lot: quote → confirm (Phase D)');

    const D = [];
    for (let i = 0; i < 5; i++) D.push(TAG + 'd' + i);
    await User.create(D.map((uid, i) => ({
      firebaseUid: uid, name: `D${i}`, email: `${TAG}d${i}@t.com`,
      phone: '933000000' + i, role: 'farmer',
      location: { district: 'Nashik', state: 'Maharashtra' },
    })));

    const dFpo = await Fpo.create({
      name: TAG + 'Lot Sale Growers', district: 'Nashik', village: 'Niphad',
      adminUid: D[0], adminName: 'D0',
      members: D.map((uid, i) => ({ farmerUid: uid, farmerName: `D${i}` })),
    });

    const D_AT = [
      { lat: 20.0800, lng: 74.1100 },
      { lat: 20.0950, lng: 74.1350 },
      { lat: 20.0700, lng: 74.0900 },
      { lat: 20.1100, lng: 74.1600 },
      { lat: 20.0850, lng: 74.1450 },
    ];

    const mkD = (i, crop, qty, price, min, gradeCode = 'A') => CropListing.create({
      cropId: new mongoose.Types.ObjectId(), farmerUid: D[i], farmerName: `D${i}`,
      farmerPhone: '933000000' + i, cropName: crop,
      quantityKg: qty, quantityAvailableKg: qty, minOrderKg: min,
      pricePerKg: price, totalPrice: qty * price,
      grade: gradeCode
        ? { code: gradeCode, specKey: 'chilli', specVersion: 1, selfDeclared: true, note: '' }
        : undefined,
      location: { city: 'Niphad', district: 'Nashik', state: 'Maharashtra', ...D_AT[i] },
      status: 'available',
    });

    const CHILLI = TAG + 'Chilli';
    const GAPCROP = TAG + 'Gapcrop';
    const BIGCROP = TAG + 'Bigcrop';
    const ROLLBK  = TAG + 'Rollbk';
    const OVERRIDE = TAG + 'Override';
    const PAYOUT  = TAG + 'Payout';
    const NORATE  = TAG + 'Norate';
    const NOGRADE = TAG + 'Nograde';

    // Five members, five prices, five minimums. No single ₹/kg describes it.
    const chilli = [];
    chilli.push(await mkD(0, CHILLI, 400, 20, 100));
    chilli.push(await mkD(1, CHILLI, 500, 25, 100));
    chilli.push(await mkD(2, CHILLI, 300, 18, 100));
    chilli.push(await mkD(3, CHILLI, 600, 22, 100));
    chilli.push(await mkD(4, CHILLI, 200, 30, 150));

    // Floors 500/800/1000 against stocks 600/900/1200 — the worked example in
    // the allocation service's own header. 2,200 kg falls down a real gap.
    await mkD(0, GAPCROP, 600, 20, 500);
    await mkD(1, GAPCROP, 900, 20, 800);
    await mkD(2, GAPCROP, 1200, 20, 1000);

    for (let i = 0; i < 5; i++) await mkD(i, BIGCROP, 3000, 10, 100);
    for (let i = 0; i < 5; i++) await mkD(i, ROLLBK, 400 + i * 100, 20 + i, 100);
    for (let i = 0; i < 5; i++) await mkD(i, OVERRIDE, 500, 20 + i, 100);
    for (let i = 0; i < 5; i++) await mkD(i, PAYOUT, 500, 18 + i * 3, 100);
    await mkD(0, NORATE, 500, 20, 100, 'B');
    await mkD(1, NORATE, 500, 21, 100, 'B');
    await mkD(0, NOGRADE, 500, 20, 100, null);
    await mkD(1, NOGRADE, 500, 21, 100, null);

    const lotKeyFor = (crop, grade = 'A') => `${dFpo._id}::${crop.trim().toLowerCase()}::${grade}`;
    const DROP = { ...MANDI, label: 'Lasalgaon APMC', city: 'Lasalgaon', district: 'Nashik' };
    const askQuote = (crop, kg, uid = VENDOR, extra = {}, grade = 'A') => call(
      'POST', '/api/fpos/lots/quote', uid,
      { lotKey: lotKeyFor(crop, grade), quantityKg: kg, dropoff: DROP, ...extra }
    );
    // ── BUYING A LOT NOW GOES THROUGH A REAL APPROVAL GATE ────────────────
    // POST /lots/confirm no longer exists. A buyer's purchase intent is now
    // POST /lots/request (which runs the EXACT SAME resolveLotQuote() the old
    // confirm ran — every refusal below QUOTE_REQUIRED/QUOTE_STALE/
    // BAD_ADVANCE/NO_AGREED_RATE etc. still fires at THIS step, before
    // anything is stored), and only the group admin's own
    // POST /lot-requests/:id/accept ever calls executeLotCommit() and takes
    // stock. This helper drives both steps back to back so every assertion
    // below — on a refusal OR on a real commit — reads the exact response
    // the old single confirm call used to return, because a refusal never
    // gets past the request step and a real commit's response is built by
    // the SAME executeLotCommit() the old route called directly.
    const lotBuy = async (uid, adminUid, body) => {
      const req1 = await call('POST', '/api/fpos/lots/request', uid, body);
      if (!(req1.status === 201 && req1.body.success && req1.body.requestId)) return req1;
      return call('POST', `/api/fpos/lot-requests/${req1.body.requestId}/accept`, adminUid, {});
    };
    const stockOf = async (ids) => {
      const rows = await CropListing.find({ _id: { $in: ids } }).select('quantityAvailableKg').lean();
      return new Map(rows.map((x) => [String(x._id), x.quantityAvailableKg]));
    };
    const sum = (xs) => xs.reduce((a, b) => a + b, 0);

    // ── 13a. the quote answers WHO SUPPLIES WHAT, at whose price ──────
    r = await askQuote(CHILLI, 1000, F[0]);
    check(r.status === 403, 'a farmer cannot quote a lot as a buyer', `→ ${r.status}`);
    r = await lotBuy(F[0], D[0], { quoteRef: 'x' });
    check(r.status === 403, 'and cannot confirm one either', `→ ${r.status}`);

    r = await askQuote(CHILLI, 1000);
    check(r.status === 200, 'the buyer gets a quote for 1,000 kg of the Grade A lot', `→ ${r.status}`);
    const q1 = r.body.quote;
    check(q1.membersIncluded === 5 && q1.allocation.length === 5,
      'every member whose own minimum it can honour is included — max participation',
      `→ ${q1.membersIncluded} members`);
    check(q1.allocatedKg === 1000 && sum(q1.allocation.map((a) => a.quantityKg)) === 1000,
      'and the kilograms allocated are exactly the kilograms asked for', `→ ${q1.allocatedKg} kg`);

    const byUid = new Map(q1.allocation.map((a) => [a.farmerUid, a]));
    check(chilli.every((l) => {
      const a = byUid.get(l.farmerUid);
      return a && a.quantityKg >= l.minOrderKg && a.quantityKg <= l.quantityAvailableKg;
    }), 'EVERY member is given at least their own minimum and never more than they hold',
      '→ ' + q1.allocation.map((a) => `${a.quantityKg}/${a.minOrderKg}`).join(' '));
    check(chilli.every((l) => byUid.get(l.farmerUid).pricePerKg === l.pricePerKg),
      'each member is priced at their OWN asking price, not the lot\'s indicative ₹/kg',
      '→ ' + q1.allocation.map((a) => a.pricePerKg).join('/'));
    check(new Set(q1.allocation.map((a) => a.pricePerKg)).size === 5,
      'and the five prices really do differ, so an averaged price would be visibly wrong');
    check(q1.allocation.every((a) => a.lineTotal === Math.round(a.quantityKg * a.pricePerKg)),
      'every line is that member\'s own kilograms times their own price');

    // THE RECONCILIATION. Three sums that must land exactly, or somebody is
    // paid for kilograms nobody bought.
    check(sum(q1.allocation.map((a) => a.lineTotal)) === q1.cropTotal,
      'the per-farmer crop lines sum exactly to the crop total', `→ ₹${q1.cropTotal}`);
    check(sum(q1.allocation.map((a) => a.fareShare)) === q1.transport.fare.total,
      'the per-farmer fare shares sum exactly to the one fare charged',
      `→ ₹${q1.transport.fare.total}`);
    check(sum(q1.allocation.map((a) => a.buyerLineTotal)) === q1.buyerTotal
      && q1.buyerTotal === q1.cropTotal + q1.transport.fare.total,
      'and the per-farmer amounts sum EXACTLY to the buyer total',
      `→ ₹${q1.buyerTotal} = ₹${q1.cropTotal} + ₹${q1.transport.fare.total}`);
    check(q1.reconciliation.cropTotalEqualsSumOfLines
      && q1.reconciliation.fareEqualsSumOfShares
      && q1.reconciliation.buyerTotalEqualsSumOfLines,
      'the response asserts all three reconciliations itself');
    check(q1.transport.stops === 5 && q1.transport.vehicleType,
      'one vehicle, five stops, priced by the captain fare table',
      `→ ${q1.transport.vehicleType} · ${q1.transport.distanceKm} km`);
    check(q1.singleLotOnly === true && /ONE pickup stop|dedupe stops/i.test(q1.crossLotNote),
      'the quote says it covers ONE lot and repeats the cross-lot pickup-stop warning');

    // Named the other way round — same lot, same answer.
    r = await call('POST', '/api/fpos/lots/quote', VENDOR, {
      fpoId: String(dFpo._id), cropName: CHILLI, grade: 'A',
      quantityKg: 1000, dropoff: DROP,
    });
    check(r.status === 200 && r.body.quote.quoteRef === q1.quoteRef,
      'the same lot named by (fpoId, crop, grade) produces the identical quote');

    // ── 13b. A QUOTE IS NOT A RESERVATION ─────────────────────────────
    const chilliIds = chilli.map((l) => l._id);
    const stockAfterQuote = await stockOf(chilliIds);
    check(q1.reservation.reserved === false && /NOT A RESERVATION/i.test(q1.reservation.note),
      'the quote states in words that it reserves nothing');
    check(chilli.every((l) => stockAfterQuote.get(String(l._id)) === l.quantityAvailableKg),
      'not one kilogram was taken off any listing by quoting');
    check(await Order.countDocuments({ vendorUid: VENDOR, cropName: CHILLI }) === 0
      && await Consignment.countDocuments({ vendorUid: VENDOR, 'stops.cropName': CHILLI }) === 0,
      'and no Order or Consignment was written');
    r = await askQuote(CHILLI, 1000);
    check(r.status === 200 && r.body.quote.quoteRef === q1.quoteRef,
      'the stock is still sellable — the same quote can be taken again');

    // ── 13c. AN IMPOSSIBLE QUANTITY IS REFUSED, WITH ONES THAT WORK ───
    // Floors 500/800/1000, stocks 600/900/1200. 2,200 kg sits in a real gap
    // between what {0,1,2} minus one member can hold and what all three must
    // take at minimum.
    r = await askQuote(GAPCROP, 2200);
    check(r.status === 409 && r.body.code === 'QUANTITY_NOT_COMPOSABLE',
      '2,200 kg cannot be composed from these members\' minimums and is refused',
      `→ ${r.body.code}`);
    check(r.body.nearestBelowKg === 2100 && r.body.nearestAboveKg === 2300,
      'and the refusal names the nearest quantities that WOULD work',
      `→ ${r.body.nearestBelowKg} kg or ${r.body.nearestAboveKg} kg`);
    check(/2,100/.test(r.body.error) && /2,300/.test(r.body.error),
      'in words, not only in fields');
    check(Array.isArray(r.body.fillableRanges) && r.body.fillableRanges.length > 1,
      'with the real gaps in what this lot can compose', `→ ${r.body.fillableRanges?.length} ranges`);
    check(r.body.reservation?.reserved === false,
      'a refused quote is still explicitly not a reservation');

    for (const kg of [2100, 2300]) {
      r = await askQuote(GAPCROP, kg);
      check(r.status === 200 && r.body.quote.allocatedKg === kg,
        `and ${kg} kg really is fillable, exactly as the refusal promised`);
    }

    r = await askQuote(GAPCROP, 400);
    check(r.status === 409 && r.body.code === 'BELOW_SMALLEST_MINIMUM' && r.body.smallestOrderKg === 500,
      '400 kg is below every member\'s own minimum and is refused with the smallest that is not',
      `→ ${r.body.smallestOrderKg} kg`);

    r = await askQuote(GAPCROP, 600);
    check(r.status === 200 && r.body.quote.membersIncluded === 1,
      '600 kg can only come from the one member whose minimum fits, and does');
    check(r.body.quote.excluded.filter((e) => e.reason === 'own_minimum_does_not_fit').length === 2,
      'the two members it cannot include are NAMED with the reason, not silently dropped');

    // ── 13d. MORE THAN ONE RUN CAN CARRY REPORTS THE TRUE MAXIMUM ────
    r = await askQuote(BIGCROP, 12000);
    check(r.status === 409 && r.body.code === 'EXCEEDS_ONE_RUN',
      '12,000 kg is more than one collection run can carry', `→ ${r.body.code}`);
    check(r.body.maxFillableKg === 10000 && r.body.limitedBy === 'vehicle_capacity',
      'and the true maximum is reported, limited by the vehicle rather than the stock',
      `→ ${r.body.maxFillableKg} kg`);
    check(r.body.totalAvailableKg === 15000,
      'the stock that exists is still stated, so the cap does not read as "that is all they have"');
    r = await askQuote(GAPCROP, 3000);
    check(r.status === 409 && r.body.code === 'EXCEEDS_ONE_RUN'
      && r.body.maxFillableKg === 2700 && r.body.limitedBy === 'available_stock',
      'and when it is the stock that binds, the message says so instead', `→ ${r.body.maxFillableKg} kg`);

    // ── 13e. CONFIRM: N ORDERS + 1 CONSIGNMENT ───────────────────────
    r = await lotBuy(VENDOR, D[0], {
      lotKey: lotKeyFor(CHILLI), quantityKg: 1000, dropoff: DROP,
    });
    check(r.status === 400 && r.body.code === 'QUOTE_REQUIRED',
      'a confirm with no quote behind it is refused — the price does not exist before the allocation does',
      `→ ${r.body.code}`);

    r = await askQuote(CHILLI, 1000);
    const q2 = r.body.quote;
    const stockBeforeConfirm = await stockOf(chilliIds);
    r = await lotBuy(VENDOR, D[0], {
      lotKey: lotKeyFor(CHILLI), quantityKg: 1000, dropoff: DROP, quoteRef: q2.quoteRef,
    });
    check(r.status === 201 && r.body.committed === true, 'the buyer confirms the quote', `→ ${r.status}`);
    const sale = r.body;
    check(sale.orders.length === 5, 'ONE Order per contributing farmer — five sales, not one',
      `→ ${sale.orders.length} orders`);
    check(!!sale.consignment && sale.consignment.stops.length === 5,
      'and exactly ONE Consignment for the shared run', `→ ${sale.consignment?.stops?.length} stops`);

    const cid = sale.consignment._id;
    check(await Order.countDocuments({ consignmentId: cid }) === 5
      && await Consignment.countDocuments({ _id: cid }) === 1,
      'five Orders and one Consignment are what is actually in the database');
    const stopUids = new Set(sale.consignment.stops.map((s) => s.farmerUid));
    const allocUids = new Set(q2.allocation.map((a) => a.farmerUid));
    check(stopUids.size === 5 && [...allocUids].every((u) => stopUids.has(u)),
      'the run\'s stops are exactly the farmers the allocation drew on');
    check(sum(sale.consignment.stops.map((s) => s.fareShare)) === sale.consignment.fare.total,
      'the stop fare shares sum exactly to the fare charged',
      `→ ₹${sale.consignment.fare.total}`);
    check(sale.consignment.stops.every((s) => s.fareShareBasisKg === s.quantityKg),
      'and each share records the planned weight it was computed from');
    check(sale.orders.every((o) => o.grandTotal === o.cropTotal + o.fare.total)
      && sum(sale.orders.map((o) => o.cropTotal)) === q2.cropTotal,
      'every Order reconciles, and their crop totals sum to the quoted crop total',
      `→ ₹${q2.cropTotal}`);
    check(sale.orders.every((o) => o.farmerPayout === o.cropTotal),
      'each Order records the GROSS the buyer paid — the fee/agreed rate is applied by computeSettlement');
    check(sale.consignment.transportMode === 'hired' && sale.consignment.status === 'awaiting_agent'
      && sale.consignment.agentUid === null && sale.dispatched === true,
      'a hired run goes to the captain pool with no agent on it yet');
    check(new Set(sale.orders.map((o) => o.pickupOtp)).size === 5,
      'one pickup code per farmer, never one code for the whole run');

    const stockAfterConfirm = await stockOf(chilliIds);
    check(q2.allocation.every((a) => {
      const before = stockBeforeConfirm.get(String(a.listingId));
      return stockAfterConfirm.get(String(a.listingId)) === before - a.quantityKg;
    }), 'every listing was decremented by exactly what its farmer was allocated');

    // ── 13f. A CLIENT-SUPPLIED ALLOCATION CANNOT OVERRIDE THE SERVER ──
    r = await askQuote(OVERRIDE, 1200);
    const qo = r.body.quote;
    r = await lotBuy(VENDOR, D[0], {
      lotKey: lotKeyFor(OVERRIDE), quantityKg: 1200, dropoff: DROP, quoteRef: qo.quoteRef,
      // A buyer naming their own suppliers, quantities and prices.
      allocation: qo.allocation.map((a) => ({ ...a, quantityKg: 1, pricePerKg: 1, lineTotal: 1 })),
      cropTotal: 1, buyerTotal: 1, farmerPayout: 1, pricePerKg: 1,
    });
    check(r.status === 201, 'a confirm carrying a forged allocation still goes through', `→ ${r.status}`);
    check(r.body.cropTotal === qo.cropTotal && r.body.cropTotal > 1,
      'but it is priced by the SERVER, not by the body', `→ ₹${r.body.cropTotal} not ₹1`);
    check(r.body.orders.every((o) => {
      const a = qo.allocation.find((x) => String(x.listingId) === String(o.listingId));
      return a && o.quantityKg === a.quantityKg && o.pricePerKg === a.pricePerKg;
    }), 'every Order carries the server\'s own quantities and the farmers\' own prices');
    check(r.body.ignoredClientFields.includes('allocation') && r.body.ignoredClientFields.includes('cropTotal'),
      'and the response names what it ignored rather than silently discarding it',
      `→ ${r.body.ignoredClientFields.join(', ')}`);

    r = await askQuote(OVERRIDE, 800);
    r = await lotBuy(VENDOR, D[0], {
      lotKey: lotKeyFor(OVERRIDE), quantityKg: 800, dropoff: DROP,
      quoteRef: 'deadbeefdeadbeefdeadbeefdeadbeef',
    });
    check(r.status === 409 && r.body.code === 'QUOTE_STALE' && r.body.committed === false,
      'a forged quoteRef buys nothing — it can only produce a refusal', `→ ${r.body.code}`);

    // ── 13g. STOCK MOVED AFTER THE QUOTE: REFUSED, AND NOTHING COMMITTED ──
    // The critical one. A buyer who agreed to specific farmers at specific
    // prices must not be silently sold a different, dearer basket — and a
    // refusal must leave the database exactly as it found it.
    const rollbkIds = (await CropListing.find({ cropName: ROLLBK }).select('_id').lean()).map((x) => x._id);
    r = await askQuote(ROLLBK, 1200);
    const qr = r.body.quote;
    check(r.status === 200 && qr.allocation.length === 5, 'a 1,200 kg quote across all five members');

    const ordersBefore = await Order.countDocuments({ vendorUid: VENDOR });
    const runsBefore = await Consignment.countDocuments({ vendorUid: VENDOR });
    const stockBeforeStale = await stockOf(rollbkIds);
    // Somebody else buys 100 kg of one member's listing — the ordinary
    // single-farmer path, which this quote never held anything against.
    const moved = qr.allocation[2].listingId;
    await CropListing.updateOne({ _id: moved }, { $inc: { quantityAvailableKg: -100 } });

    r = await lotBuy(VENDOR, D[0], {
      lotKey: lotKeyFor(ROLLBK), quantityKg: 1200, dropoff: DROP, quoteRef: qr.quoteRef,
    });
    check(r.status === 409 && r.body.code === 'QUOTE_STALE' && r.body.committed === false,
      'confirming after the stock moved is REFUSED, not quietly rebuilt at a new price',
      `→ ${r.body.code}`);
    const stockAfterStale = await stockOf(rollbkIds);
    check(rollbkIds.every((id) => {
      const expected = stockBeforeStale.get(String(id)) - (String(id) === String(moved) ? 100 : 0);
      return stockAfterStale.get(String(id)) === expected;
    }), 'NOT ONE kilogram was decremented by the refused confirm');
    check(await Order.countDocuments({ vendorUid: VENDOR }) === ordersBefore
      && await Consignment.countDocuments({ vendorUid: VENDOR }) === runsBefore,
      'no orphan Order and no orphan Consignment survive the refusal',
      `→ ${ordersBefore} orders / ${runsBefore} runs, unchanged`);
    check(!!r.body.quote && r.body.quote.quoteRef !== qr.quoteRef,
      'and the buyer is handed the fresh quote so they can decide again');

    // ── 13g2. AN ADVANCE ON A LOT PURCHASE ────────────────────────────
    //
    // The biggest purchase this app supports, and the one where the farmer was
    // most exposed: five farmers hand over two tonnes against a record of a
    // promise from one buyer they have never met.
    //
    // ⚠️ A PERCENTAGE, NOT A RUPEE FIGURE, and that is the decision. One lot
    // purchase becomes N Orders with N different line totals — each member sets
    // their own ₹/kg — so a flat "₹20,000 advance" has no fair division across
    // them. A percentage of each farmer's OWN line is the only split that is
    // fair to every member and still reconciles to the buyer's headline.
    r = await askQuote(ROLLBK, 1100);
    const advQuote = r.body.quote;
    check(r.status === 200, 'a quote to buy with an advance against', `→ ${r.status}`);

    r = await lotBuy(VENDOR, D[0], {
      lotKey: lotKeyFor(ROLLBK), quantityKg: 1100, dropoff: DROP,
      quoteRef: advQuote.quoteRef, advanceAmount: 5000,
    });
    check(r.status === 400 && r.body.code === 'ADVANCE_MUST_BE_PCT',
      'A FLAT RUPEE ADVANCE IS REFUSED ON A LOT — it has no single fair meaning across five '
      + 'farmers at five different prices', `→ ${r.body.code}`);

    r = await askQuote(ROLLBK, 1100);
    r = await lotBuy(VENDOR, D[0], {
      lotKey: lotKeyFor(ROLLBK), quantityKg: 1100, dropoff: DROP,
      quoteRef: r.body.quote.quoteRef, advancePct: 140,
    });
    check(r.status === 400 && r.body.code === 'BAD_ADVANCE', 'and 140% is refused', `→ ${r.body.code}`);

    r = await askQuote(ROLLBK, 1100);
    const advRef = r.body.quote.quoteRef;
    r = await lotBuy(VENDOR, D[0], {
      lotKey: lotKeyFor(ROLLBK), quantityKg: 1100, dropoff: DROP,
      quoteRef: advRef, advancePct: 25,
    });
    check(r.status === 201 && r.body.committed === true,
      'a lot bought with a 25% advance', `→ ${r.status}`);
    const advBody = r.body;
    check(advBody.advance.pct === 25 && advBody.advance.perFarmer.length === advBody.orders.length,
      'EVERY contributing farmer gets their own advance line — five farmers is five separate '
      + 'debts to five separate people, which is why Order is per-farmer in the first place',
      `→ ${advBody.advance.perFarmer.length} farmers`);

    const sumAdv = advBody.advance.perFarmer.reduce((a, x) => a + x.advanceAgreed, 0);
    const sumBal = advBody.advance.perFarmer.reduce((a, x) => a + x.balanceOnDelivery, 0);
    const sumVal = advBody.advance.perFarmer.reduce((a, x) => a + x.cropValue, 0);
    check(Math.abs(sumAdv + sumBal - sumVal) < 1,
      'advance + balance reconciles EXACTLY to the crop value, per farmer and in total — a '
      + 'receipt that does not add up is how trust in the whole settlement story goes',
      `→ ₹${sumAdv} + ₹${sumBal} = ₹${sumVal}`);
    check(Math.abs(sumAdv - sumVal * 0.25) < 1,
      'and the total advance is 25% of the whole purchase', `→ ₹${sumAdv} of ₹${sumVal}`);

    const advOrders = await Order.find({ _id: { $in: advBody.orders.map((o) => o._id) } }).lean();
    check(advOrders.every((o) => o.settlement.advance.agreedPct === 25
      && Math.abs(o.settlement.advance.agreedAmount - o.farmerPayout * 0.25) < 1),
      'each ORDER carries its own agreed advance, against its own line total');
    check(advOrders.every((o) => !o.settlement.advance.receivedAt && !o.settlement.farmerPaid),
      '⚠️ AGREED, NOT PAID — every one of these is a promise until that farmer records it as '
      + 'received. This app has no payment rail and no escrow');
    check(/does not move money|records payments, it does not move/i.test(advBody.advance.note || ''),
      '...and the response says so in words', `→ "${String(advBody.advance.note).slice(0, 60)}…"`);

    // No advance is still the default, and it names the exposure rather than
    // reporting it as fine.
    r = await askQuote(ROLLBK, 600);
    r = await lotBuy(VENDOR, D[0], {
      lotKey: lotKeyFor(ROLLBK), quantityKg: 600, dropoff: DROP, quoteRef: r.body.quote.quoteRef,
    });
    check(r.status === 201 && r.body.advance.pct === 0 && r.body.advance.agreedTotal === 0,
      'buying without an advance is unchanged — zero is the default', `→ ${r.body.advance?.pct}%`);
    check(/carries the full value/i.test(r.body.advance.note || ''),
      '...and the response NAMES the exposure that creates rather than staying silent about it');

    // ── 13h. A WRITE THAT FAILS PART-WAY ROLLS EVERYTHING BACK ────────
    // The stock decrements all succeed; the THIRD Order write then fails on a
    // duplicate key — the same failure routes/orders.js already compensates
    // for. Reaching CONFIRM_CONFLICT at all proves every decrement and the
    // first two Order writes had already gone through, so what the assertions
    // below check is that all of it was undone.
    r = await askQuote(ROLLBK, 1100);
    const qb = r.body.quote;
    check(r.status === 200 && qb.allocation.length === 5, 'a fresh 1,100 kg quote after the stock moved');

    const KEY = TAG + 'idem1';
    const collide = qb.allocation[2];
    // Planted under a DIFFERENT buyer, so the confirm's own vendor-scoped
    // duplicate pre-check does not see it and the unique index is what fires.
    const ghost = await Order.create({
      idempotencyKey: `${KEY}#${collide.listingId}`,
      listingId: collide.listingId, cropId: new mongoose.Types.ObjectId(),
      cropName: ROLLBK, quantityKg: 1, pricePerKg: 1, cropTotal: 1,
      farmerUid: collide.farmerUid, farmerName: collide.farmerName,
      vendorUid: TAG + 'ghost', vendorName: 'Ghost',
      pickup: { ...D_AT[0], label: 'Farm' }, dropoff: { ...MANDI, label: 'Mandi' },
      vehicleType: 'tempo', distanceKm: 1, durationMin: 1,
      fare: { total: 0 }, grandTotal: 1, farmerPayout: 1,
      status: 'cancelled', pickupOtp: '1111', dropOtp: '2222',
    });

    const ordersBefore2 = await Order.countDocuments({ vendorUid: VENDOR });
    const runsBefore2 = await Consignment.countDocuments({ vendorUid: VENDOR });
    const stockBeforeFail = await stockOf(rollbkIds);

    r = await lotBuy(VENDOR, D[0], {
      lotKey: lotKeyFor(ROLLBK), quantityKg: 1100, dropoff: DROP,
      quoteRef: qb.quoteRef, idempotencyKey: KEY,
    });
    check(r.status === 409 && r.body.code === 'CONFIRM_CONFLICT' && r.body.committed === false,
      'a write failing part-way through fails LOUDLY, and says nothing was committed',
      `→ ${r.body.code}`);
    const stockAfterFail = await stockOf(rollbkIds);
    check(rollbkIds.every((id) => stockAfterFail.get(String(id)) === stockBeforeFail.get(String(id))),
      'EVERY stock decrement it had already taken was put back — no partial decrement survives',
      '→ ' + rollbkIds.map((id) => stockAfterFail.get(String(id))).join('/'));
    check(await Order.countDocuments({ vendorUid: VENDOR }) === ordersBefore2,
      'the Orders it had already created were deleted — no orphans',
      `→ ${ordersBefore2}, unchanged`);
    check(await Order.countDocuments({
      idempotencyKey: new RegExp('^' + KEY + '#'), vendorUid: VENDOR,
    }) === 0, 'and none of this attempt\'s Orders is left behind under its idempotency key');
    check(await Consignment.countDocuments({ vendorUid: VENDOR }) === runsBefore2,
      'no Consignment survives either', `→ ${runsBefore2}, unchanged`);
    check(await Order.countDocuments({ _id: ghost._id }) === 1,
      'the rollback deleted only what this attempt made, not the order it collided with');

    // The lot is still perfectly sellable afterwards — a failed confirm has
    // not quietly poisoned the listings it touched.
    r = await askQuote(ROLLBK, 1100);
    check(r.status === 200 && r.body.quote.allocatedKg === 1100,
      'and the lot is unharmed: the same 1,100 kg still quotes cleanly afterwards');

    // ── 13i. FACILITATION vs PROCUREMENT — SAME SALE, DIFFERENT PAYOUTS ──
    r = await call('PUT', `/api/fpos/${dFpo._id}/payment`, D[0], {
      paymentMode: 'facilitation', facilitationFee: { mode: 'percent', percent: 5 },
    });
    check(r.status === 200, 'the group records a 5% facilitation fee', `→ ${r.status}`);

    r = await askQuote(PAYOUT, 1500);
    const fac = r.body.quote;
    check(fac.payment.paymentMode === 'facilitation' && fac.payment.fpoPosition.fee.total > 0,
      'under facilitation the FPO takes its fee off the sale',
      `→ ₹${fac.payment.fpoPosition.fee.total}`);
    check(sum(fac.allocation.map((a) => a.amount)) + fac.payment.fpoPosition.fee.total === fac.cropTotal,
      'and the members\' payouts plus the fee reconcile EXACTLY to the crop total',
      `→ ₹${fac.cropTotal}`);
    check(fac.allocation.every((a) => a.amount === a.grossAmount - a.fpoFee && a.fpoFee > 0),
      'each member is paid their own line less their own share of that fee');
    check(fac.payment.memberPayableTotal === sum(fac.allocation.map((a) => a.amount)),
      'the payable total is the sum of what the members are actually owed');

    r = await call('PUT', `/api/fpos/${dFpo._id}/procurement-rates`, D[0], {
      rates: [{ cropName: PAYOUT, grade: 'A', ratePerKg: 15 }],
    });
    check(r.status === 200, 'the group records an agreed ₹15/kg for this (crop, grade)', `→ ${r.status}`);
    r = await call('PUT', `/api/fpos/${dFpo._id}/payment`, D[0], {
      paymentMode: 'procurement', facilitationFee: { mode: 'none' },
    });
    check(r.status === 200, 'and switches to procurement', `→ ${r.status}`);

    r = await askQuote(PAYOUT, 1500);
    const pro = r.body.quote;
    check(pro.payment.paymentMode === 'procurement', 'the same sale now settles as procurement');
    check(pro.cropTotal === fac.cropTotal,
      'the BUYER pays exactly the same — the members\' asking prices did not move',
      `→ ₹${pro.cropTotal}`);
    check(pro.allocation.every((a) => a.amount === Math.round(15 * a.quantityKg)),
      'but every member is owed the agreed rate for their kilograms, whatever the lot fetched',
      '→ ' + pro.allocation.map((a) => `${a.quantityKg}kg=₹${a.amount}`).join(' '));
    check(pro.allocation.some((a) => {
      const f = fac.allocation.find((x) => x.farmerUid === a.farmerUid);
      return f && f.amount !== a.amount;
    }), 'so the two modes really do pay the same farmers DIFFERENT money for the same sale');
    check(pro.payment.fpoPosition.margin === pro.cropTotal - sum(pro.allocation.map((a) => a.amount)),
      'and what is left over is reported as the FPO\'s margin',
      `→ ₹${pro.payment.fpoPosition.margin}`);

    // A rate above every asking price: the FPO loses money and is told so.
    r = await call('PUT', `/api/fpos/${dFpo._id}/procurement-rates`, D[0], {
      rates: [{ cropName: PAYOUT, grade: 'A', ratePerKg: 40 }],
    });
    r = await askQuote(PAYOUT, 1500);
    check(r.body.quote.payment.fpoPosition.margin < 0,
      'a rate promising more than the lot fetched returns a NEGATIVE margin, unclamped',
      `→ ₹${r.body.quote.payment.fpoPosition.margin}`);

    // ── 13j. PROCUREMENT WITH NO AGREED RATE IS REFUSED ───────────────
    r = await askQuote(NORATE, 800, VENDOR, {}, 'B');
    check(r.status === 409 && r.body.code === 'NO_AGREED_RATE',
      'a (crop, grade) this procurement group never priced cannot be sold through it',
      `→ ${r.body.code}`);
    check(r.body.reason === 'no_agreed_rate' && r.body.gaps.length > 0,
      'named as Phase B\'s own gap, with the lots that could not be priced');
    check(!/facilitation fallback|₹0/.test(r.body.error) && /no rate on file/i.test(r.body.error),
      'and refused outright — never zero, never the crop\'s other grades, never a silent fallback');
    r = await lotBuy(VENDOR, D[0], {
      lotKey: lotKeyFor(NORATE, 'B'), quantityKg: 800, dropoff: DROP, quoteRef: 'anything',
    });
    check(r.status === 409 && r.body.code === 'NO_AGREED_RATE' && r.body.committed === false,
      'confirming it is refused too, and commits nothing');

    r = await askQuote(NOGRADE, 800, VENDOR, {}, 'ungraded');
    check(r.status === 409 && r.body.code === 'GRADE_UNKNOWN',
      'and an UNGRADED lot has no (crop, grade) rate at all, so it is refused with its own reason',
      `→ ${r.body.code}`);
    check(r.body.reason === 'grade_unknown',
      'a lot nobody graded is not given a grade so a rate can be found for it');

    // Back to facilitation so the ungraded lot is sellable again — which is
    // exactly the remedy the refusal names.
    r = await call('PUT', `/api/fpos/${dFpo._id}/payment`, D[0], { paymentMode: 'facilitation' });
    r = await askQuote(NOGRADE, 800, VENDOR, {}, 'ungraded');
    check(r.status === 200 && r.body.quote.lot.ungraded === true
      && r.body.quote.lot.grade.tier === null,
      'under facilitation the same ungraded lot sells at the members\' own prices, still ungraded',
      `→ ₹${r.body.quote?.cropTotal}`);

    // ── 13k. THE GATE ITSELF: REJECT, WITHDRAW, AND STALE-AT-ACCEPT ────
    //
    // Every confirm above went through lotBuy() (request → accept back to
    // back), which proves the FINAL commit is unchanged. What it does not
    // exercise is the gate itself: rejecting takes nothing, a non-admin can
    // decide nothing, a buyer can take their own request back, and — the one
    // thing that is genuinely NEW risk, not just relocated risk — a lot that
    // moves in the gap between the buyer's request and the admin's response
    // is caught at ACCEPT time, not silently honoured at stale numbers.
    console.log('\n13k. The approval gate itself: reject, withdraw, stale-at-accept');

    // ⚠️ NOT NECESSARILY ZERO. 13h's CONFIRM_CONFLICT request deliberately
    // stays PENDING (a commit failure leaves the request untouched so the
    // admin can simply retry once the world is fixed, rather than being
    // resolved as though a decision was made) — so this section measures
    // DELTAS off a captured baseline instead of assuming a clean slate.
    // Exactly the "measure the real number, don't assume it" lesson this
    // project's own CLAUDE.md already learned once from a summed total that
    // was wrong by 31.
    r = await call('GET', `/api/fpos/${dFpo._id}/dashboard`, D[0]);
    const basePending = r.body.dashboard.pendingLotRequestCount;

    r = await askQuote(PAYOUT, 200);
    check(r.status === 200, 'a fresh quote to test the gate on', `→ ${r.status}`);
    const gq = r.body.quote;

    r = await call('POST', '/api/fpos/lots/request', VENDOR, {
      lotKey: lotKeyFor(PAYOUT), quantityKg: 200, dropoff: DROP, quoteRef: gq.quoteRef,
    });
    check(r.status === 201 && r.body.status === 'pending' && !!r.body.requestId,
      'the request is held PENDING, not bought', `→ ${r.status}`);
    const reqId1 = r.body.requestId;

    const payoutIds = (await CropListing.find({ cropName: PAYOUT }).select('_id').lean()).map((x) => x._id);
    const stockAtRequest = await stockOf(payoutIds);

    r = await call('GET', `/api/fpos/${dFpo._id}/lot-requests`, F[1]);
    check(r.status === 403, 'a non-admin member cannot see the group\'s buyer requests', `→ ${r.status}`);
    r = await call('GET', `/api/fpos/${dFpo._id}/lot-requests`, D[0]);
    check(r.status === 200 && r.body.pending.some((p) => String(p._id) === String(reqId1)),
      'the admin sees it pending', `→ ${r.body.pending?.length} pending`);

    r = await call('POST', `/api/fpos/lot-requests/${reqId1}/accept`, F[1], {});
    check(r.status === 403, 'a non-admin member cannot accept a buyer request', `→ ${r.status}`);
    r = await call('POST', `/api/fpos/lot-requests/${reqId1}/reject`, F[1], {});
    check(r.status === 403, 'and cannot reject one either', `→ ${r.status}`);

    r = await call('POST', `/api/fpos/lot-requests/${reqId1}/reject`, D[0],
      { reason: 'Too small an order this week' });
    check(r.status === 200 && r.body.request.status === 'rejected',
      'the admin rejects it', `→ ${r.body.request?.status}`);
    check(r.body.request.rejectionReason === 'Too small an order this week',
      'and the reason travels with it, for the buyer to read');

    const stockAfterReject = await stockOf(payoutIds);
    check(payoutIds.every((id) => stockAfterReject.get(String(id)) === stockAtRequest.get(String(id))),
      'REJECTING TAKES NOTHING — not one kilogram moved, because nothing was ever taken to give back');
    check(await Order.countDocuments({ vendorUid: VENDOR, cropName: PAYOUT }) === 0,
      'and no Order exists for this request');

    r = await call('POST', `/api/fpos/lot-requests/${reqId1}/accept`, D[0], {});
    check(r.status === 409 && r.body.code === 'NOT_PENDING',
      'a rejected request cannot then be accepted', `→ ${r.body.code}`);

    r = await call('GET', '/api/fpos/lot-requests/mine', VENDOR);
    check(r.status === 200 && r.body.requests.some((x) => String(x._id) === String(reqId1)
      && x.status === 'rejected' && x.rejectionReason === 'Too small an order this week'),
      'the buyer sees it was rejected, with the reason, from their own list');

    // ── withdraw: the buyer takes back their own pending request ────────
    r = await askQuote(PAYOUT, 200);
    r = await call('POST', '/api/fpos/lots/request', VENDOR, {
      lotKey: lotKeyFor(PAYOUT), quantityKg: 200, dropoff: DROP, quoteRef: r.body.quote.quoteRef,
    });
    const reqId2 = r.body.requestId;
    r = await call('POST', `/api/fpos/lot-requests/${reqId2}/withdraw`, VENDOR, {});
    check(r.status === 200 && r.body.request.status === 'withdrawn',
      'the buyer withdraws their own pending request', `→ ${r.body.request?.status}`);
    r = await call('POST', `/api/fpos/lot-requests/${reqId2}/accept`, D[0], {});
    check(r.status === 409 && r.body.code === 'NOT_PENDING',
      'a withdrawn request cannot be accepted either', `→ ${r.body.code}`);

    // ── stale-at-accept: the lot moves in the gap, and the gate catches it ──
    r = await askQuote(PAYOUT, 200);
    const staleQ = r.body.quote;
    r = await call('POST', '/api/fpos/lots/request', VENDOR, {
      lotKey: lotKeyFor(PAYOUT), quantityKg: 200, dropoff: DROP, quoteRef: staleQ.quoteRef,
    });
    check(r.status === 201, 'a third request, made to go stale before the admin responds', `→ ${r.status}`);
    const reqId3 = r.body.requestId;

    // The world moves BETWEEN the request and the admin's response — the
    // entire reason executeLotCommit is preceded by a FRESH resolveLotQuote
    // at accept time rather than trusting what the buyer saw when they asked.
    //
    // ⚠️ A PRICE EDIT, NOT A STOCK NIBBLE. A 50 kg dip on one listing among
    // five, when only 200 kg total is being bought, can leave the allocation
    // — and therefore the quoteRef — completely unchanged: this member was
    // never going to supply anywhere near their remaining stock, so nothing
    // about the digest moves. A price change always lands in `rows[].pricePerKg`
    // and is guaranteed to change the digest, which is what "a price was
    // edited" (one of the three staleness causes this route documents)
    // actually needs to prove.
    const movedListing = staleQ.allocation[0].listingId;
    await CropListing.updateOne({ _id: movedListing }, { $inc: { pricePerKg: 7 } });

    const ordersBeforeStale = await Order.countDocuments({ vendorUid: VENDOR, cropName: PAYOUT });
    r = await call('POST', `/api/fpos/lot-requests/${reqId3}/accept`, D[0], {});
    check(r.status === 409 && r.body.stale === true,
      'accepting a request whose lot moved since is refused, not silently committed at new numbers',
      `→ ${r.status} stale=${r.body.stale}`);
    check(await Order.countDocuments({ vendorUid: VENDOR, cropName: PAYOUT }) === ordersBeforeStale,
      'and nothing was bought');

    r = await call('GET', '/api/fpos/lot-requests/mine', VENDOR);
    const marked = r.body.requests.find((x) => String(x._id) === String(reqId3));
    check(marked?.status === 'stale', 'the request is marked stale rather than left pending forever',
      `→ ${marked?.status}`);
    r = await call('POST', `/api/fpos/lot-requests/${reqId3}/accept`, D[0], {});
    check(r.status === 409 && r.body.code === 'NOT_PENDING',
      'and cannot be accepted again after going stale — the buyer must request again');

    // ── the dashboard's own count reflects reality, not a stale one ──────
    r = await call('GET', `/api/fpos/${dFpo._id}/dashboard`, D[0]);
    check(r.body.dashboard.pendingLotRequestCount === basePending,
      'rejected, withdrawn and stale add ZERO to the pending count — none of the three is still waiting',
      `→ ${r.body.dashboard.pendingLotRequestCount} (baseline ${basePending})`);

    r = await askQuote(PAYOUT, 200);
    r = await call('POST', '/api/fpos/lots/request', VENDOR, {
      lotKey: lotKeyFor(PAYOUT), quantityKg: 200, dropoff: DROP, quoteRef: r.body.quote.quoteRef,
    });
    r = await call('GET', `/api/fpos/${dFpo._id}/dashboard`, D[0]);
    check(r.body.dashboard.pendingLotRequestCount === basePending + 1,
      'and a genuinely pending one adds exactly one', `→ ${r.body.dashboard.pendingLotRequestCount}`);

    // ══ 14. FOCUS CROPS — WHAT A GROUP DEALS IN ═══════════════════════
    //
    // FPOs specialise; nothing modelled it, so any farmer could ask to join any
    // group with any produce and the admin approving them had nothing on screen
    // but a name.
    //
    // ⚠️ THE CENTRAL ASSERTION OF THIS WHOLE SECTION IS THAT NOTHING IS EVER
    // BLOCKED. Every join below succeeds — including the one the group's own
    // declaration says is a mismatch. The match is information for the two
    // humans; a hard refusal would make the app wrong about the adjacent-crop
    // case that gets settled by a phone call every season.
    console.log('\n14. Focus crops — advisory, never a gate');

    const FC = [TAG + 'fc0', TAG + 'fc1', TAG + 'fc2', TAG + 'fc3', TAG + 'fc4'];
    await User.create(FC.map((uid, i) => ({
      firebaseUid: uid, name: `FC${i}`, email: `${TAG}fc${i}@t.com`,
      phone: '944000000' + i, role: 'farmer',
      location: { district: 'Nashik', state: 'Maharashtra' },
    })));

    const fcFpo = await Fpo.create({
      name: TAG + 'Niphad Onion Growers', district: 'Nashik', village: 'Niphad',
      adminUid: FC[0], adminName: 'FC0',
      members: [{ farmerUid: FC[0], farmerName: 'FC0' }],
    });

    // Real crop names, not TAG-prefixed ones: the whole point is whether they
    // canonicalise. Cleanup is keyed on farmerUid, so this is still namespaced.
    const mkFC = (i, crop) => CropListing.create({
      cropId: new mongoose.Types.ObjectId(), farmerUid: FC[i], farmerName: `FC${i}`,
      farmerPhone: '944000000' + i, cropName: crop,
      quantityKg: 500, quantityAvailableKg: 500, minOrderKg: 50, pricePerKg: 20, totalPrice: 10000,
      location: { city: 'Niphad', district: 'Nashik', state: 'Maharashtra', lat: 20.08, lng: 74.11 },
      status: 'available',
    });

    // 14a. The default is "not declared", and every existing group is in it.
    r = await call('GET', `/api/fpos/${fcFpo._id}/focus-crops`, FC[0]);
    check(r.status === 200 && r.body.declared === false && r.body.focusCrops.length === 0,
      'a group starts NOT DECLARED — the default every seeded FPO is already in, no migration',
      `→ declared=${r.body.declared}`);
    check(Array.isArray(r.body.choices) && r.body.choices.length === 64,
      'the choosable list comes from the server, so no screen keeps a copy of it',
      `→ ${r.body.choices?.length} crops`);
    check(/matches every farmer/i.test(r.body.note || ''),
      '...and the note says an empty list MATCHES EVERYBODY, not "deals in nothing"');

    // 14b. Refusals name what was wrong and save nothing.
    r = await call('PUT', `/api/fpos/${fcFpo._id}/focus-crops`, FC[0],
      { crops: ['Onion', 'Moon Rocks'] });
    check(r.status === 400 && r.body.code === 'UNKNOWN_CROP' && r.body.unknown.includes('Moon Rocks'),
      'an unknown crop is REFUSED BY NAME, not silently dropped', `→ ${r.body.unknown}`);
    check((await Fpo.findById(fcFpo._id).lean()).focusCrops.length === 0,
      '...and nothing was saved — a group that thinks it declared two and got one is '
      + 'matched against a list it never agreed to');

    r = await call('PUT', `/api/fpos/${fcFpo._id}/focus-crops`, FC[0],
      { crops: ['Onion', 'Tomato', 'Potato', 'Wheat', 'Maize', 'Grapes', 'Banana', 'Cotton',
                'Soyabean', 'Sugarcane', 'Garlic', 'Cabbage', 'Carrot'] });
    check(r.status === 400 && r.body.code === 'TOO_MANY_CROPS',
      'thirteen crops is refused — declaring half the list tells a farmer nothing', `→ ${r.body.code}`);
    check((await Fpo.findById(fcFpo._id).lean()).focusCrops.length === 0,
      '...and it is refused rather than TRIMMED to twelve');

    r = await call('PUT', `/api/fpos/${fcFpo._id}/focus-crops`, FC[1], { crops: ['Onion'] });
    check(r.status === 403 && r.body.code === 'NOT_ADMIN',
      'a non-admin member cannot declare the group\'s crops', `→ ${r.body.code}`);

    // 14c. Aliases canonicalise on the way in — the same crop has an English
    // name, a Marathi name and an Agmarknet name, and all three are real in
    // this database.
    r = await call('PUT', `/api/fpos/${fcFpo._id}/focus-crops`, FC[0],
      { crops: ['कांदा', 'Paddy(Common)', 'Onion'] });
    check(r.status === 200, 'a valid declaration is saved', `→ ${r.status}`);
    check(r.body.focusCrops.length === 2 && r.body.focusCrops.includes('Onion')
      && r.body.focusCrops.includes('Rice (Paddy)'),
      'the Marathi name, the Agmarknet name and the English name all resolve, and the duplicate '
      + 'collapses', `→ ${r.body.focusCrops.join(', ')}`);

    // Settle on onion for the matching tests.
    await call('PUT', `/api/fpos/${fcFpo._id}/focus-crops`, FC[0], { crops: ['Onion', 'Grapes'] });

    // 14d. A MATCHING farmer joins.
    await mkFC(1, 'Onion');
    r = await call('POST', `/api/fpos/${fcFpo._id}/join`, FC[1]);
    check(r.status === 200, 'a farmer growing an on-focus crop joins', `→ ${r.status}`);
    check(r.body.cropMatch?.status === 'match' && r.body.cropMatch.matched.includes('Onion'),
      'and is told their crops match', `→ ${r.body.cropMatch?.status}`);

    // 14e. A MISMATCHING farmer joins — AND IS NOT STOPPED.
    await mkFC(2, 'Sugarcane');
    r = await call('POST', `/api/fpos/${fcFpo._id}/join`, FC[2]);
    check(r.status === 200,
      'A FARMER WHOSE CROPS DO NOT MATCH STILL JOINS. The match is advice to two humans, not a '
      + 'gate in the code — a member with half an acre of something else is a conversation',
      `→ ${r.status}`);
    check(r.body.cropMatch?.status === 'mismatch'
      && r.body.cropMatch.unmatched.includes('Sugarcane'),
      '...and is told plainly that it does not match', `→ ${r.body.cropMatch?.status}`);
    check(r.body.cropMatch?.advisory === true && /does NOT block/i.test(r.body.cropMatch?.note || ''),
      '...with the response itself saying nothing was refused');
    const afterMismatch = await Fpo.findById(fcFpo._id).lean();
    check(afterMismatch.members.some((m) => m.farmerUid === FC[2] && m.status === 'pending'),
      'and the request is genuinely on the group, waiting like any other');

    // 14f. PARTIAL — the adjacent-crop case this exists to handle gracefully.
    await mkFC(3, 'Onion');
    await mkFC(3, 'Garlic');
    r = await call('POST', `/api/fpos/${fcFpo._id}/join`, FC[3]);
    check(r.body.cropMatch?.status === 'partial'
      && r.body.cropMatch.matched.includes('Onion')
      && r.body.cropMatch.unmatched.includes('Garlic'),
      'growing one on-focus and one off-focus crop reads as PARTIAL, and both are named',
      `→ ${r.body.cropMatch?.status}`);

    // 14g. THE TWO ABSENCES ARE NOT MISMATCHES.
    r = await call('POST', `/api/fpos/${fcFpo._id}/join`, FC[4]);
    check(r.body.cropMatch?.status === 'farmer_crops_unknown',
      'A FARMER WITH NOTHING REGISTERED IS UNKNOWN, NOT WRONG — not knowing what somebody grows '
      + 'is not the same as knowing they grow the wrong thing', `→ ${r.body.cropMatch?.status}`);
    check(r.body.cropMatch?.unmatched.length === 0,
      '...and they are not listed as growing anything off-focus');

    // 14h. The admin's list carries the match per row, and does not reorder.
    r = await call('GET', `/api/fpos/${fcFpo._id}/members/pending`, FC[0]);
    check(r.status === 200 && r.body.pending.length === 4,
      'the admin sees every applicant, matching or not — none are filtered out',
      `→ ${r.body.pending?.length}`);
    check(r.body.pending.every((m) => !!m.cropMatch),
      'every pending row carries its own crop match — the admin was approving a name before this');
    check(r.body.focusDeclared === true && r.body.focusCrops.includes('Onion'),
      '...beside what the group actually deals in');

    // 14i. An unrecognised crop name is one more unknown, not evidence.
    const strangeUid = TAG + 'fcx';
    await User.create({
      firebaseUid: strangeUid, name: 'FCX', email: TAG + 'fcx@t.com',
      phone: '9440000099', role: 'farmer', location: { district: 'Nashik', state: 'Maharashtra' },
    });
    await CropListing.create({
      cropId: new mongoose.Types.ObjectId(), farmerUid: strangeUid, farmerName: 'FCX',
      farmerPhone: '9440000099', cropName: TAG + 'Dragonfruit',
      quantityKg: 100, quantityAvailableKg: 100, minOrderKg: 10, pricePerKg: 50, totalPrice: 5000,
      location: { city: 'Niphad', district: 'Nashik', state: 'Maharashtra', lat: 20.08, lng: 74.11 },
      status: 'available',
    });
    r = await call('POST', `/api/fpos/${fcFpo._id}/join`, strangeUid);
    check(r.body.cropMatch?.status === 'farmer_crops_unknown'
      && r.body.cropMatch.unrecognised.length === 1,
      'a crop name this app does not know is reported as UNRECOGNISED, never counted as a '
      + 'mismatch — an unknown string is not a farmer growing the wrong thing',
      `→ ${r.body.cropMatch?.status}, ${r.body.cropMatch?.unrecognised?.length} unrecognised`);

    // 14j. A group that has declared nothing matches everybody.
    await call('DELETE', `/api/fpos/${fcFpo._id}/focus-crops`, FC[0]);
    r = await call('GET', `/api/fpos/${fcFpo._id}/members/pending`, FC[0]);
    check(r.body.focusDeclared === false
      && r.body.pending.every((m) => m.cropMatch.status === 'no_focus_declared'),
      'CLEARED, the sugarcane grower stops being a mismatch — because the group has not said '
      + 'anything, not because it deals in everything',
      `→ ${r.body.pending?.[0]?.cropMatch?.status}`);

    // 14k. A farmer sees it BEFORE asking, and the list is not filtered by it.
    await call('PUT', `/api/fpos/${fcFpo._id}/focus-crops`, FC[0], { crops: ['Onion', 'Grapes'] });
    r = await call('GET', '/api/fpos/nearby?district=Nashik', strangeUid);
    const row = (r.body.fpos || []).find((f) => String(f._id) === String(fcFpo._id));
    check(!!row, 'a group whose crops do not match is STILL LISTED to a farmer browsing');
    check((row?.focusCrops || []).includes('Onion') && !!row?.cropMatch,
      'and the card carries what it deals in, plus this farmer\'s own match, so they pick the '
      + 'right group first time instead of waiting a week to be turned down',
      `→ ${row?.focusCrops?.join(', ')}`);

    // 14l. ⚠️ FOCUS CROPS DO NOT REACH THE MARKET. The sugarcane grower's lot
    // is off-focus and is still on sale — refusing to market a member's crop
    // would destroy real value to enforce a stated preference.
    const offFocusListing = await CropListing.findOne({ farmerUid: FC[2] }).lean();
    check(offFocusListing.status === 'available',
      "AN OFF-FOCUS MEMBER'S LOT IS UNTOUCHED — the declaration decides membership advice and "
      + 'nothing else: no price, no lot, no sale', `→ ${offFocusListing.status}`);

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    await Promise.all([
      User.deleteMany({ firebaseUid: new RegExp('^' + TAG) }),
      CropListing.deleteMany({ farmerUid: new RegExp('^' + TAG) }),
      Fpo.deleteMany({ name: new RegExp('^' + TAG) }),
      Order.deleteMany({ vendorUid: new RegExp('^' + TAG) }),
      Consignment.deleteMany({ vendorUid: new RegExp('^' + TAG) }),
      FpoLotRequest.deleteMany({ vendorUid: new RegExp('^' + TAG) }),
    ]);
    console.log('\n🧹 test data removed');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

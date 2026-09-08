// Test: real FPO registry search/claim + Fpo membership approval flow.
//   node scripts/testFpoRegistry.js
//
// Real routes, real Atlas, auth stubbed via the require cache — same rig as
// testFpos.js. Data namespaced "PHFR_TEST_" and removed in the finally block.
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const { execFileSync } = require('child_process');
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
const FpoMaster = require(B('models/FpoMaster'));
const FpoAdminClaim = require(B('models/FpoAdminClaim'));

const TAG = 'PHFR_TEST_';
const F = [TAG + 'f1', TAG + 'f2', TAG + 'f3'];
const OUTSIDER = TAG + 'f4';
// §7: the FPO AS ITS OWN ACTOR.
//   OFFICE   a `role: 'fpo'` account — the organisation's own login.
//   JOINER   a farmer who joins the group the office founded.
//   BUYER    a vendor, to prove the claim path is not open to every role.
const OFFICE = TAG + 'office';
const JOINER = TAG + 'f5';
const BUYER = TAG + 'buyer';
const FARMS = [
  { lat: 20.0800, lng: 74.1100 },
  { lat: 20.0950, lng: 74.1350 },
  { lat: 20.0700, lng: 74.0900 },
];

let pass = 0, fail = 0;
const check = (cond, m, extra = '') => {
  if (cond) { pass++; console.log('  ✅', m, extra); }
  else { fail++; console.log('  ❌', m, extra); }
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express();
  app.use(express.json());
  app.use('/api/fpo-master', require(B('routes/fpoMaster')));
  app.use('/api/fpos', require(B('routes/fpos')));
  const server = app.listen(5129);
  const URL = 'http://127.0.0.1:5129';

  const call = async (method, p, uid, body) => {
    const r = await fetch(URL + p, {
      method, headers: { 'x-test-uid': uid, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };

  const runReview = (args) => {
    try {
      const out = execFileSync('node', [B('scripts/reviewFpoClaims.js'), ...args], { encoding: 'utf8' });
      return { ok: true, out };
    } catch (err) {
      return { ok: false, out: (err.stdout || '') + (err.stderr || '') };
    }
  };

  console.log('\n📋 FPO registry (claim + review) and membership approval\n');

  let master1, master2, claim1;

  try {
    await User.create([
      ...F.map((uid, i) => ({
        firebaseUid: uid, name: `Farmer${i + 1}`, email: `${TAG}f${i}@t.com`,
        phone: '910000000' + i, role: 'farmer',
        location: { district: 'Nashik', state: 'Maharashtra' },
      })),
      { firebaseUid: OUTSIDER, name: 'Farmer4', email: TAG + 'f4@t.com',
        phone: '9100000004', role: 'farmer', location: { district: 'Nashik', state: 'Maharashtra' } },
      { firebaseUid: OFFICE, name: 'Sinnar FPC Office', email: TAG + 'office@t.com',
        phone: '9100000005', role: 'fpo', location: { district: 'Nashik', state: 'Maharashtra' } },
      { firebaseUid: JOINER, name: 'Farmer5', email: TAG + 'f5@t.com',
        phone: '9100000006', role: 'farmer', location: { district: 'Nashik', state: 'Maharashtra' } },
      { firebaseUid: BUYER, name: 'Trader', email: TAG + 'buyer@t.com',
        phone: '9100000007', role: 'vendor', location: { district: 'Nashik', state: 'Maharashtra' } },
    ]);

    master1 = await FpoMaster.create({
      sNo: TAG + '1', state: 'Maharashtra', district: TAG + 'Nashik', block: TAG + 'Niphad',
      cbboName: TAG + 'CBBO', fpoName: TAG + 'Niphad Onion Growers Producer Company',
      registrationNo: TAG + 'REG-001', registrationAct: 'Company Act', dateOfIncorporation: '10-Jan-21',
    });
    master2 = await FpoMaster.create({
      sNo: TAG + '2', state: 'Maharashtra', district: TAG + 'Nashik', block: TAG + 'Yeola',
      cbboName: TAG + 'CBBO', fpoName: TAG + 'Yeola Farmers Producer Company',
      registrationNo: TAG + 'REG-002', registrationAct: 'Company Act', dateOfIncorporation: '11-Jan-21',
    });

    // ── 1. search ────────────────────────────────────────────────────
    console.log('1. Search');
    let r = await call('GET', `/api/fpo-master/search?district=${encodeURIComponent(TAG + 'Nashik')}`, F[0]);
    check(r.status === 200, 'search succeeds for any authenticated role', `→ ${r.status}`);
    const rows = r.body.fpos.filter((f) => f.fpoName.startsWith(TAG));
    check(rows.length === 2, 'returns the seeded entries', `→ ${rows.length}`);
    const row1 = rows.find((f) => String(f._id) === String(master1._id));
    check(row1.claimStatus === 'unclaimed', 'claimStatus is visible', `→ ${row1.claimStatus}`);
    check(row1.linkedFpoId === null, 'linkedFpoId is null while unclaimed');
    check(!('claimedByUid' in row1), 'claimedByUid is never returned from search');

    // ── 2. designation validation ───────────────────────────────────
    console.log('\n2. Claim validation');
    r = await call('POST', `/api/fpo-master/${master1._id}/claim`, F[0], {
      name: 'Ramesh Patil', mobile: '9876543210', designation: 'Chairman', email: 'r@x.com',
    });
    check(r.status === 400 && r.body.code === 'BAD_DESIGNATION',
      'an invalid designation is rejected', `→ ${r.body.code}`);

    // ── 3. claim + atomic double-claim guard ──────────────────────────
    console.log('\n3. Claiming');
    r = await call('POST', `/api/fpo-master/${master1._id}/claim`, F[0], {
      name: 'Ramesh Patil', mobile: '9876543210', designation: 'CEO', email: 'r@x.com',
    });
    check(r.status === 201, 'a valid claim is created', `→ ${r.status}`);
    claim1 = r.body.claim;
    check(claim1.status === 'pending', 'starts pending');

    const afterClaim = await FpoMaster.findById(master1._id).lean();
    check(afterClaim.claimStatus === 'pending', 'the registry entry flips to pending', `→ ${afterClaim.claimStatus}`);

    // Same atomic-guard pattern this app tests everywhere: two concurrent
    // claims on the SAME registry entry, only one can win the pending flip.
    const master3 = await FpoMaster.create({
      sNo: TAG + '3', state: 'Maharashtra', district: TAG + 'Nashik', block: TAG + 'Sinnar',
      cbboName: TAG + 'CBBO', fpoName: TAG + 'Sinnar Producer Company',
      registrationNo: TAG + 'REG-003', registrationAct: 'Company Act', dateOfIncorporation: '12-Jan-21',
    });
    const results = await Promise.all([
      call('POST', `/api/fpo-master/${master3._id}/claim`, F[1],
        { name: 'A', mobile: '9000000001', designation: 'Manager', email: '' }),
      call('POST', `/api/fpo-master/${master3._id}/claim`, F[2],
        { name: 'B', mobile: '9000000002', designation: 'Manager', email: '' }),
    ]);
    const won = results.filter((x) => x.status === 201).length;
    const lost = results.filter((x) => x.status === 409).length;
    check(won === 1 && lost === 1, 'exactly one of two concurrent claims on the same FPO wins', `→ ${won} won, ${lost} lost`);

    r = await call('POST', `/api/fpo-master/${master1._id}/claim`, F[0], {
      name: 'Ramesh Patil', mobile: '9876543210', designation: 'CEO', email: 'r@x.com',
    });
    check(r.status === 409 && r.body.code === 'ALREADY_CLAIMED',
      'one user cannot hold two pending/approved claims', `→ ${r.body.code}`);

    r = await call('POST', `/api/fpo-master/${master2._id}/claim`, OUTSIDER, {
      name: 'Someone', mobile: '9000000003', designation: 'Director', email: '',
    });
    check(r.status === 201, 'a different user can claim a different FPO', `→ ${r.status}`);
    const claim2 = r.body.claim;

    // ── 4. review script: approve ──────────────────────────────────────
    console.log('\n4. Review script — approve');
    let rv = runReview(['--approve', String(claim1._id)]);
    check(rv.ok, 'reviewFpoClaims.js --approve exits 0', rv.ok ? '' : `→ ${rv.out.slice(0, 300)}`);

    const claimAfter = await FpoAdminClaim.findById(claim1._id).lean();
    check(claimAfter.status === 'approved' && !!claimAfter.reviewedAt,
      'the claim is approved with a reviewedAt', `→ ${claimAfter.status}`);

    const masterAfter = await FpoMaster.findById(master1._id).lean();
    check(masterAfter.claimStatus === 'approved' && masterAfter.claimedByUid === F[0],
      'the registry entry is approved with claimedByUid', `→ ${masterAfter.claimStatus}, ${masterAfter.claimedByUid}`);
    check(!!masterAfter.linkedFpoId, 'and carries a linkedFpoId');

    const linkedFpo = await Fpo.findById(masterAfter.linkedFpoId).lean();
    check(!!linkedFpo && linkedFpo.adminUid === F[0],
      'a REAL Fpo document was created with the claimant as adminUid', `→ ${linkedFpo?.adminUid}`);
    check(linkedFpo.name === master1.fpoName && linkedFpo.regNumber === master1.registrationNo,
      'name/regNumber carried over from the registry entry');
    check(linkedFpo.members.length === 1 && linkedFpo.members[0].status === 'active',
      'the claimant is the founding ACTIVE member');

    const userAfter = await User.findOne({ firebaseUid: F[0] }).lean();
    check(userAfter.role === 'farmer', 'approving a claim does NOT touch User.role', `→ ${userAfter.role}`);

    r = await call('GET', `/api/fpo-master/search?district=${encodeURIComponent(TAG + 'Nashik')}`, F[1]);
    const row1b = r.body.fpos.find((f) => String(f._id) === String(master1._id));
    check(row1b.claimStatus === 'approved' && String(row1b.linkedFpoId) === String(masterAfter.linkedFpoId),
      'search now shows linkedFpoId once approved', `→ ${row1b.claimStatus}`);

    // ── 5. review script: reject ────────────────────────────────────────
    console.log('\n5. Review script — reject');
    rv = runReview(['--reject', String(claim2._id)]);
    check(rv.ok, 'reviewFpoClaims.js --reject exits 0', rv.ok ? '' : `→ ${rv.out.slice(0, 300)}`);

    const claim2After = await FpoAdminClaim.findById(claim2._id).lean();
    check(claim2After.status === 'rejected', 'the claim is rejected');
    const master2After = await FpoMaster.findById(master2._id).lean();
    check(master2After.claimStatus === 'unclaimed', 'the registry entry returns to unclaimed', `→ ${master2After.claimStatus}`);

    // ── 6. membership request/approve on the linked Fpo ────────────────
    console.log('\n6. Membership approval');
    const fpoId = linkedFpo._id;

    r = await call('POST', `/api/fpos/${fpoId}/join`, F[1]);
    check(r.status === 200, 'F2 requests to join', `→ ${r.status}`);
    const joined = r.body.fpo.members.find((m) => m.farmerUid === F[1]);
    check(joined.status === 'pending', 'the new member starts pending', `→ ${joined.status}`);

    // A pending member's lots must not appear as supplying members anywhere.
    await CropListing.create({
      cropId: new mongoose.Types.ObjectId(), farmerUid: F[1],
      farmerName: 'Farmer2', farmerPhone: '9100000001',
      cropName: TAG + 'Onion', quantityKg: 300, quantityAvailableKg: 300,
      minOrderKg: 25, pricePerKg: 30, totalPrice: 9000,
      location: { city: 'Yeola', district: 'Nashik', state: 'Maharashtra', ...FARMS[1] },
      status: 'available',
    });

    r = await call('GET', '/api/fpos/mine', F[0]);
    check(r.body.fpo.liveListings === 0,
      "a pending applicant's lot does NOT count in /mine's totals", `→ ${r.body.fpo.liveListings}`);

    r = await call('GET', `/api/fpos/bundles?commodity=${encodeURIComponent(TAG + 'Onion')}&lat=20.14&lng=74.24`, F[0]);
    check(r.status === 403, 'bundles is vendor-only (confirms route still guarded)', `→ ${r.status}`);

    r = await call('GET', `/api/fpos/${fpoId}/members/pending`, F[1]);
    check(r.status === 403, 'a non-admin cannot list pending members', `→ ${r.status}`);
    r = await call('GET', `/api/fpos/${fpoId}/members/pending`, F[0]);
    check(r.status === 200 && r.body.pending.length === 1, 'the admin sees the pending applicant', `→ ${r.body.pending?.length}`);

    r = await call('POST', `/api/fpos/${fpoId}/members/${F[1]}/approve`, F[1]);
    check(r.status === 403, 'a non-admin cannot approve a member', `→ ${r.status}`);

    r = await call('POST', `/api/fpos/${fpoId}/members/${F[1]}/approve`, F[0]);
    check(r.status === 200, 'the admin approves', `→ ${r.status}`);
    const approvedMember = r.body.fpo.members.find((m) => m.farmerUid === F[1]);
    check(approvedMember.status === 'active', 'the member is now active', `→ ${approvedMember.status}`);

    r = await call('GET', '/api/fpos/mine', F[0]);
    check(r.body.fpo.liveListings === 1,
      "an approved member's lot now counts in /mine's totals", `→ ${r.body.fpo.liveListings}`);

    // A second applicant, rejected this time.
    r = await call('POST', `/api/fpos/${fpoId}/join`, F[2]);
    check(r.status === 200, 'F3 requests to join', `→ ${r.status}`);
    r = await call('POST', `/api/fpos/${fpoId}/members/${F[2]}/reject`, F[1]);
    check(r.status === 403, 'a non-admin cannot reject a member', `→ ${r.status}`);
    r = await call('POST', `/api/fpos/${fpoId}/members/${F[2]}/reject`, F[0]);
    check(r.status === 200, 'the admin rejects', `→ ${r.status}`);
    const afterReject = await Fpo.findById(fpoId).lean();
    check(!afterReject.members.some((m) => m.farmerUid === F[2]),
      'a rejected applicant is removed from the group entirely');

    // ══ 7. THE FPO AS ITS OWN ACTOR ═══════════════════════════════════
    //
    // Everything above this line is the LEGACY shape and it still passes,
    // unchanged: an FPO admin who is a `farmer` account. That is deliberate.
    // Ten claimed groups in Atlas are that shape, nothing was migrated, and a
    // regression there would lock real admins out of their own groups.
    //
    // What follows is the shape the app is moving to: `role: 'fpo'`, the
    // organisation's own account. The two must coexist, and the assertions
    // below are written to prove exactly that — not that the new one works,
    // but that BOTH resolve through the same one rule, `fpo.adminUid === uid`.
    console.log('\n7. The FPO as its own actor');

    // 7a. Before anything is claimed.
    r = await call('GET', '/api/fpos/admin/mine', OFFICE);
    check(r.status === 200 && r.body.adminStatus === 'none' && r.body.fpo === null,
      'a fresh `fpo` account administers nothing and says so', `→ ${r.body.adminStatus}`);

    // 7b. The claim path is not open to every role.
    const master4 = await FpoMaster.create({
      sNo: TAG + '4', state: 'Maharashtra', district: TAG + 'Nashik', block: TAG + 'Sinnar',
      cbboName: TAG + 'CBBO', fpoName: TAG + 'Sinnar Farmers Producer Company',
      registrationNo: TAG + 'REG-004', registrationAct: 'Company Act', dateOfIncorporation: '13-Jan-21',
    });
    r = await call('POST', `/api/fpo-master/${master4._id}/claim`, BUYER,
      { name: 'Trader', mobile: '9100000007', designation: 'Director', email: '' });
    check(r.status === 403,
      'a BUYER cannot claim to be the officer of a producer company', `→ ${r.status}`);
    check((await FpoMaster.findById(master4._id).lean()).claimStatus === 'unclaimed',
      '...and the registry entry was not touched by the attempt');

    r = await call('GET', '/api/fpos/admin/mine', BUYER);
    check(r.status === 403, 'nor can a buyer ask which FPO they administer', `→ ${r.status}`);

    // 7c. A rejected claim is a state the landing screen has to be able to
    // name — OUTSIDER's claim2 was rejected in §5 above.
    r = await call('GET', '/api/fpos/admin/mine', OUTSIDER);
    check(r.status === 200 && r.body.adminStatus === 'claim_rejected'
      && r.body.claim?.fpoName === master2.fpoName,
      'a rejected claimant is told so, and which FPO it was about', `→ ${r.body.adminStatus}`);

    // 7d. The office claims its own company.
    r = await call('POST', `/api/fpo-master/${master4._id}/claim`, OFFICE, {
      name: 'Sinnar FPC Office', mobile: '9100000005', designation: 'CEO', email: 'ceo@x.com',
    });
    check(r.status === 201, 'an `fpo` account can claim its registry entry', `→ ${r.status}`);
    const claim4 = r.body.claim;

    r = await call('GET', '/api/fpos/admin/mine', OFFICE);
    check(r.status === 200 && r.body.adminStatus === 'claim_pending'
      && r.body.claim?.fpoName === master4.fpoName,
      'and waits in a state its landing screen can name', `→ ${r.body.adminStatus}`);
    check(/reviewer/i.test(r.body.note || ''),
      '...saying a PERSON reviews it, not that it happens automatically');

    // 7e. Approval — and the difference that matters.
    rv = runReview(['--approve', String(claim4._id)]);
    check(rv.ok, 'reviewFpoClaims.js approves an `fpo` claim', rv.ok ? '' : `→ ${rv.out.slice(0, 300)}`);
    check(/members\[\] starts empty|founding members: 0/i.test(rv.out),
      '...and says out loud that the officer is not seeded as a member');

    const master4After = await FpoMaster.findById(master4._id).lean();
    const officeFpo = await Fpo.findById(master4After.linkedFpoId).lean();
    check(!!officeFpo && officeFpo.adminUid === OFFICE,
      'a real Fpo is created with the office as adminUid', `→ ${officeFpo?.adminUid}`);
    check(officeFpo.members.length === 0,
      'AN OFFICER IS NOT A MEMBER-FARMER — the group starts with ZERO members, which is what a '
      + "real FPO's first day looks like", `→ ${officeFpo.members.length}`);

    const officeUser = await User.findOne({ firebaseUid: OFFICE }).lean();
    check(officeUser.role === 'fpo', 'approving a claim still does NOT touch User.role', `→ ${officeUser.role}`);

    r = await call('GET', '/api/fpos/admin/mine', OFFICE);
    check(r.status === 200 && r.body.adminStatus === 'active'
      && String(r.body.fpo?._id) === String(officeFpo._id),
      'admin/mine now resolves the group', `→ ${r.body.adminStatus}`);
    check(r.body.fpo.memberCount === 0 && r.body.fpo.pendingMemberCount === 0
      && r.body.fpo.liveListings === 0,
      '...with honest zeroes rather than an empty screen', `→ ${r.body.fpo.memberCount} members`);

    // 7f. WHAT AN FPO ACCOUNT CANNOT DO. No new refusal code was written for
    // any of this — the pre-existing `requireRole('farmer')` gate says it.
    const officeFpoId = officeFpo._id;
    r = await call('GET', '/api/fpos/mine', OFFICE);
    check(r.status === 403, 'an FPO account has no MEMBERSHIP question to ask (/mine)', `→ ${r.status}`);
    r = await call('POST', '/api/fpos', OFFICE, { name: TAG + 'Ad hoc group' });
    check(r.status === 403, 'it cannot start an informal farmer group', `→ ${r.status}`);
    r = await call('POST', `/api/fpos/${fpoId}/join`, OFFICE);
    check(r.status === 403, 'it cannot join a group as a member', `→ ${r.status}`);
    r = await call('GET', '/api/fpos/nearby', OFFICE);
    check(r.status === 403, 'and it is not looking for a group to be in', `→ ${r.status}`);

    // 7g. WHAT IT CAN DO — the admin routes, through the same adminUid rule.
    r = await call('GET', `/api/fpos/${officeFpoId}/members/pending`, OFFICE);
    check(r.status === 200, 'it administers its own group: pending members', `→ ${r.status}`);
    r = await call('PUT', `/api/fpos/${officeFpoId}/payment`, OFFICE,
      { facilitationFee: { mode: 'percent', percent: 2 } });
    check(r.status === 200, '...and the payment arrangement', `→ ${r.status}`);
    r = await call('GET', `/api/fpos/${officeFpoId}/dashboard`, OFFICE);
    check(r.status === 200, '...and the dashboard reads cleanly at zero members', `→ ${r.status}`);

    // THE ROLE GRANTS NOTHING BY ITSELF. adminUid is still the whole decision.
    r = await call('GET', `/api/fpos/${fpoId}/members/pending`, OFFICE);
    check(r.status === 403, "but it has NO authority over another group", `→ ${r.status}`);

    // 7h. A farmer joins the officer-run group.
    r = await call('POST', `/api/fpos/${officeFpoId}/join`, JOINER);
    check(r.status === 200, 'a farmer requests to join the officer-run group', `→ ${r.status}`);
    r = await call('GET', '/api/fpos/admin/mine', OFFICE);
    check(r.body.fpo.pendingMemberCount === 1 && r.body.fpo.memberCount === 0,
      'the office sees one waiting and still zero approved', `→ ${r.body.fpo.pendingMemberCount} pending`);
    r = await call('POST', `/api/fpos/${officeFpoId}/members/${JOINER}/approve`, OFFICE);
    check(r.status === 200, 'the office approves them', `→ ${r.status}`);
    r = await call('GET', '/api/fpos/admin/mine', OFFICE);
    check(r.body.fpo.memberCount === 1 && r.body.fpo.pendingMemberCount === 0,
      'and now has exactly one member', `→ ${r.body.fpo.memberCount}`);

    // Asked of JOINER and NOT of F[1]/F[2]: those two raced for master3 in §3
    // and whichever won still holds a pending claim, so `claim_pending` would
    // be the CORRECT answer for them and the assertion would be flaky by
    // construction. JOINER has never claimed anything and is, at this exact
    // moment, an approved member of a group.
    r = await call('GET', '/api/fpos/admin/mine', JOINER);
    check(r.status === 200 && r.body.adminStatus === 'none',
      'being a MEMBER of a group is not administering one', `→ ${r.body.adminStatus}`);

    // 7i. THE BUG THIS SHAPE WOULD HAVE CREATED, AND DOES NOT.
    // The old rule closed a group when its member count fell to one. With the
    // admin outside members[], the single farmer leaving would have CLOSED a
    // real, SFAC-registered company out from under its own CEO — and no route
    // reopens one.
    r = await call('POST', `/api/fpos/${officeFpoId}/leave`, JOINER);
    check(r.status === 200, 'that member leaves', `→ ${r.status}`);
    const afterLeave = await Fpo.findById(officeFpoId).lean();
    check(afterLeave.status === 'active',
      'THE COMPANY SURVIVES ITS LAST MEMBER LEAVING — an empty group whose admin holds it from '
      + 'outside members[] is not a husk, it is an FPO between seasons', `→ ${afterLeave.status}`);
    check(afterLeave.members.length === 0, '...with the member genuinely removed');
    r = await call('GET', '/api/fpos/admin/mine', OFFICE);
    check(r.body.adminStatus === 'active', 'and the office still reaches it');

    // 7j. ONE ENDPOINT, BOTH SHAPES. F[0] is the legacy farmer-admin from §4.
    r = await call('GET', '/api/fpos/admin/mine', F[0]);
    check(r.status === 200 && r.body.adminStatus === 'active' && String(r.body.fpo?._id) === String(fpoId),
      'THE LEGACY FARMER-ADMIN RESOLVES THROUGH THE SAME ENDPOINT — one answer to "who administers '
      + 'this group", not two', `→ ${r.body.adminStatus}`);
    check(r.body.fpo.memberCount === 2,
      '...and a farmer-admin IS still counted among their own members', `→ ${r.body.fpo.memberCount}`);

  } catch (err) {
    console.error('💥 Uncaught error:', err);
    fail++;
  } finally {
    server.close();
    await FpoAdminClaim.deleteMany({ uid: { $regex: `^${TAG}` } });
    await FpoAdminClaim.deleteMany({ fpoMasterId: { $in: [master1?._id, master2?._id].filter(Boolean) } });
    await FpoMaster.deleteMany({ fpoName: { $regex: `^${TAG}` } });
    await Fpo.deleteMany({ name: { $regex: `^${TAG}` } });
    await CropListing.deleteMany({ cropName: { $regex: `^${TAG}` } });
    await User.deleteMany({ firebaseUid: { $regex: `^${TAG}` } });
    await mongoose.disconnect();

    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();

// The human review step for FPO admin claims — same pattern as
// scripts/verifyBuyer.js for GSTIN buyer verification.
//
//   node scripts/reviewFpoClaims.js                       (list pending)
//   node scripts/reviewFpoClaims.js --approve <claimId>
//   node scripts/reviewFpoClaims.js --reject  <claimId>
//
// WHY THIS IS A SCRIPT AND NOT AN ENDPOINT
//   A real FPO is an already-incorporated company with elected governance —
//   "admin" here means "the person who claimed to represent it", and that
//   claim is exactly the kind of thing that needs a human to look, not an
//   HTTP route the claimant's own account could call. No new User.role
//   value, no System Admin screen — see the product decision in CLAUDE.md.
//   Running this requires database credentials, which is exactly the bar
//   such a claim should have to clear.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const FpoMaster = require('../models/FpoMaster');
const FpoAdminClaim = require('../models/FpoAdminClaim');
const Fpo = require('../models/Fpo');
const User = require('../models/User');

const arg = (i) => process.argv[i];

async function listPending() {
  const claims = await FpoAdminClaim.find({ status: 'pending' })
    .populate('fpoMasterId', 'fpoName district block')
    .sort({ createdAt: 1 })
    .lean();

  console.log(`\n${claims.length} pending FPO admin claim(s):\n`);
  for (const c of claims) {
    const m = c.fpoMasterId;
    console.log(`  ${m ? m.fpoName : '(FPO not found)'}  [${m ? m.district : '?'} / ${m ? m.block : '?'}]`);
    console.log(`    claim id    ${c._id}`);
    console.log(`    claimant    ${c.name} (${c.designation})`);
    console.log(`    mobile      ${c.mobile}`);
    console.log(`    email       ${c.email || '—'}`);
    console.log(`    uid         ${c.uid}`);
    console.log('');
  }
  console.log('To approve:  node scripts/reviewFpoClaims.js --approve <claimId>');
  console.log('To reject :  node scripts/reviewFpoClaims.js --reject <claimId>\n');
}

/**
 * Approve/reject as a sequence of guarded writes with compensation, not a
 * Mongoose session/transaction — this codebase deliberately avoids
 * transactions even on a replica set that supports them (see the comment
 * above the order-creation compensation logic in routes/orders.js: "this
 * beats a full transaction ... and it keeps working on a standalone
 * mongod"). Each step below is itself an atomic findOneAndUpdate with the
 * expected prior state in the filter, and a failure after a step is
 * compensated by undoing that step, exactly like the order/stock guard.
 */
async function approve(claimId) {
  const claim = await FpoAdminClaim.findOneAndUpdate(
    { _id: claimId, status: 'pending' },
    { $set: { status: 'approved', reviewedAt: new Date() } },
    { new: true }
  );
  if (!claim) { console.error('❌ No such pending claim'); process.exit(1); }

  const master = await FpoMaster.findOneAndUpdate(
    { _id: claim.fpoMasterId, claimStatus: 'pending' },
    { $set: { claimStatus: 'approved', claimedByUid: claim.uid } },
    { new: true }
  );
  if (!master) {
    // Roll the claim back — the master entry was not in the state we expect.
    await FpoAdminClaim.updateOne(
      { _id: claim._id },
      { $set: { status: 'pending', reviewedAt: null } }
    );
    console.error('❌ FpoMaster was not in "pending" state — claim left pending, nothing else changed');
    process.exit(1);
  }

  // ── IS THE CLAIMANT ALSO A MEMBER-FARMER? IT DEPENDS ON WHAT THEY ARE ────
  //
  // An `fpo` account is the ORGANISATION's account — a producer company's CEO,
  // Manager or Director, appointed to the office, often not farming at all.
  // Such a person is NOT a member of the company in the sense `members[]`
  // means it: that array is the list of farmers whose produce the group
  // markets, and it is read as exactly that by every aggregation in
  // routes/fpos.js (the lot catalog, the dashboard, the settlement, the member
  // count). Seeding an officer into it would put a non-farmer in every
  // "supplying members" list and make every count off by one.
  //
  // A `farmer` claimant is a different case and keeps the ORIGINAL behaviour
  // byte for byte: they do farm, their lots do belong in the group's produce,
  // and they were the only kind of claimant that existed before the `fpo` role
  // did. Changing that would rewrite what ten live seeded groups mean.
  //
  // A group founded by an `fpo` account therefore starts with ZERO members and
  // fills up as farmers request to join and are approved. That is what a real
  // FPO's first day looks like.
  const claimant = await User.findOne({ firebaseUid: claim.uid }).select('role name').lean();
  const claimantRole = claimant?.role || 'farmer';
  const foundingMembers = claimantRole === 'fpo'
    ? []
    : [{ farmerUid: claim.uid, farmerName: claim.name, status: 'active' }];

  let fpo;
  try {
    fpo = await Fpo.create({
      name: master.fpoName,
      regNumber: master.registrationNo,
      district: master.district,
      // Fpo.village has no better source from the registry than the block.
      village: master.block,
      adminUid: claim.uid,
      adminName: claim.name,
      members: foundingMembers,
    });
  } catch (err) {
    // Compensate both prior writes rather than leaving an approved claim
    // with no linked Fpo.
    await FpoMaster.updateOne(
      { _id: master._id },
      { $set: { claimStatus: 'pending', claimedByUid: null } }
    );
    await FpoAdminClaim.updateOne(
      { _id: claim._id },
      { $set: { status: 'pending', reviewedAt: null } }
    );
    console.error('❌ Could not create Fpo — claim and registry entry rolled back:', err.message);
    process.exit(1);
  }

  await FpoMaster.updateOne({ _id: master._id }, { $set: { linkedFpoId: fpo._id } });

  console.log(`✅ Approved: ${master.fpoName} → Fpo ${fpo._id}, admin ${claim.name} (${claim.uid})`);
  console.log(`   Claimant role: ${claimantRole} — founding members: ${foundingMembers.length}`);
  console.log(claimantRole === 'fpo'
    ? '   An FPO account is an officer of the company, not a member-farmer, so members[] starts empty.'
    : '   A farmer claimant is also a founding member, unchanged from before the `fpo` role existed.');
  console.log('   Note: User.role is untouched — this only sets Fpo.adminUid for this one FPO.\n');
}

async function reject(claimId) {
  const claim = await FpoAdminClaim.findOneAndUpdate(
    { _id: claimId, status: 'pending' },
    { $set: { status: 'rejected', reviewedAt: new Date() } },
    { new: true }
  );
  if (!claim) { console.error('❌ No such pending claim'); process.exit(1); }

  // Back to unclaimed — available for someone else (or a corrected claim)
  // to claim later.
  await FpoMaster.updateOne(
    { _id: claim.fpoMasterId, claimStatus: 'pending' },
    { $set: { claimStatus: 'unclaimed' } }
  );

  console.log(`🚫 Rejected claim ${claim._id} (${claim.name}) — FPO registry entry returned to unclaimed.\n`);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const approveIdx = process.argv.indexOf('--approve');
  const rejectIdx = process.argv.indexOf('--reject');

  if (approveIdx === -1 && rejectIdx === -1) {
    await listPending();
  } else if (approveIdx !== -1) {
    await approve(arg(approveIdx + 1));
  } else {
    await reject(arg(rejectIdx + 1));
  }

  await mongoose.disconnect();
}

main().catch((err) => { console.error('❌ Failed:', err); process.exit(1); });

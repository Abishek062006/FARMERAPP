// The human review step for buyer verification.
//
//   node scripts/verifyBuyer.js --list
//   node scripts/verifyBuyer.js --uid=<firebaseUid> --approve --by="Reviewer name"
//   node scripts/verifyBuyer.js --uid=<firebaseUid> --reject --note="GSTIN belongs to a different firm"
//
// WHY THIS IS A SCRIPT AND NOT AN ENDPOINT
//   'verified' is the only claim in this app that asserts a PERSON looked at
//   something. If it could be set over HTTP by the account it describes, it
//   would assert nothing at all, and the badge a farmer relies on when handing
//   over a tonne of crop would be self-issued.
//
//   So there is no route that grants it — see the allowlist in routes/users.js.
//   Running this requires database credentials, which is exactly the bar such a
//   claim should have to clear.
//
//   Checking a GSTIN properly means looking it up on the GST portal and
//   confirming the trade name matches the account. That is a manual step here.
//   Do not automate it by trusting the check digit — the check digit only says
//   the number is well-formed, never that it belongs to this buyer.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const arg = (name, dflt = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : dflt;
};
const has = (name) => process.argv.includes(`--${name}`);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  if (has('list') || !arg('uid')) {
    // $in, NOT $ne: in MongoDB `{field: {$ne: x}}` also matches documents where
    // the field is MISSING, which is every user created before C2 added it.
    // That is how this listed accounts with no verification block at all.
    const pending = await User.find({
      role: 'vendor',
      'verification.status': { $in: ['documents_submitted', 'verified', 'rejected'] },
    })
      .select('firebaseUid name business verification').sort({ 'verification.gstinCheckedAt': -1 }).lean();

    console.log(`\n${pending.length} buyer(s) with documents on file:\n`);
    for (const u of pending) {
      console.log(`  ${(u.verification?.status || 'unverified').padEnd(20)} ${u.name}`);
      console.log(`    uid        ${u.firebaseUid}`);
      console.log(`    gstin      ${u.business?.gstin || '—'}  (${u.business?.gstinState || '—'})`);
      console.log(`    trade name ${u.business?.tradeName || '—'}`);
      console.log(`    licence    ${u.business?.tradeLicence || '—'}`);
      if (u.verification?.note) console.log(`    note       ${u.verification.note}`);
      console.log('');
    }
    console.log('To approve:  node scripts/verifyBuyer.js --uid=<uid> --approve --by="Your name"');
    console.log('To reject :  node scripts/verifyBuyer.js --uid=<uid> --reject --note="why"\n');
    await mongoose.disconnect();
    return;
  }

  const uid = arg('uid');
  const approve = has('approve');
  const reject = has('reject');
  if (approve === reject) {
    console.error('❌ Pass exactly one of --approve or --reject');
    process.exit(1);
  }

  const by = arg('by', '');
  if (approve && !by) {
    console.error('❌ --by="Your name" is required when approving. An unattributed approval is not a review.');
    process.exit(1);
  }

  const before = await User.findOne({ firebaseUid: uid }).select('name role business verification').lean();
  if (!before) { console.error('❌ No such user'); process.exit(1); }
  if (before.role !== 'vendor') { console.error('❌ Only buyers are verified'); process.exit(1); }
  if (!before.business?.gstin) {
    console.error('❌ This buyer has no GSTIN on file — nothing to review.');
    process.exit(1);
  }

  console.log(`\nReviewing: ${before.name}`);
  console.log(`  GSTIN      ${before.business.gstin}  (${before.business.gstinState})`);
  console.log(`  trade name ${before.business.tradeName || '—'}`);
  console.log(`  current    ${before.verification.status}\n`);

  const user = await User.findOneAndUpdate(
    { firebaseUid: uid },
    {
      $set: {
        'verification.status': approve ? 'verified' : 'rejected',
        'verification.reviewedAt': new Date(),
        'verification.reviewedBy': by || 'unattributed',
        'verification.note': arg('note', ''),
      },
    },
    { new: true }
  ).select('name verification').lean();

  console.log(`${approve ? '✅' : '🚫'} ${user.name} → ${user.verification.status}`);
  if (user.verification.note) console.log(`   note: ${user.verification.note}`);
  console.log('\nNOTE: offers already sent carry a SNAPSHOT of the old status by design —');
  console.log('what the farmer saw when they decided is what that record shows.\n');

  await mongoose.disconnect();
}

main().catch((err) => { console.error('❌ Failed:', err); process.exit(1); });

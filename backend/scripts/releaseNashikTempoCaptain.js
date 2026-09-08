// scripts/releaseNashikTempoCaptain.js
//
//   node scripts/releaseNashikTempoCaptain.js <email>            # dry run
//   node scripts/releaseNashikTempoCaptain.js <email> --confirm  # write it
//
// Frees one captain's currently-held single Order (accepted or picked_up)
// so they can log in with no active job. Reverts to `awaiting_agent` if
// nothing was collected yet; marks `stranded` (crop already left the farm,
// still owed) if it was already `picked_up` — same doctrine as an abandoned
// multi-farm run in routes/consignments.js.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');

const email = process.argv[2];
const DRY = !process.argv.includes('--confirm');

(async () => {
  if (!email) { console.error('Usage: node releaseNashikTempoCaptain.js <email> [--confirm]'); process.exit(1); }
  await mongoose.connect(process.env.MONGODB_URI);

  const captain = await User.findOne({ email }).select('firebaseUid name email').lean();
  if (!captain) { console.error('No account with that email.'); await mongoose.disconnect(); return; }

  const order = await Order.findOne({ agentUid: captain.firebaseUid, isActiveJob: true })
    .select('_id status').lean();
  if (!order) {
    console.log(`${captain.name} <${captain.email}> has no active order.`);
    await mongoose.disconnect();
    return;
  }

  console.log(`Captain: ${captain.name} <${captain.email}>`);
  console.log(`Order ${order._id} — status: ${order.status}`);

  if (DRY) {
    console.log('\n🔍 DRY RUN — nothing written. Re-run with --confirm.');
    await mongoose.disconnect();
    return;
  }

  let update;
  if (order.status === 'picked_up') {
    update = {
      $set: {
        status: 'stranded', strandedAt: new Date(), strandedBy: captain.firebaseUid, strandedReason: 'other',
      },
      $unset: { isActiveJob: '' },
    };
  } else {
    update = {
      $set: { status: 'awaiting_agent', dispatchExpiresAt: new Date(Date.now() + 4 * 3600e3) },
      $unset: { agentUid: '', agentName: '', agentPhone: '', agentVehicleNumber: '', isActiveJob: '', acceptedAt: '', pickedUpAt: '' },
    };
  }

  const r = await Order.updateOne({ _id: order._id, agentUid: captain.firebaseUid }, update);
  console.log(`✅ modified ${r.modifiedCount} order.`);
  console.log(`${captain.name}'s account is now free of any active job.`);

  await mongoose.disconnect();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });

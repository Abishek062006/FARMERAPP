// Repair orders that carry a captain's NAME with no captain behind them.
//   node scripts/repairOrphanAgentOrders.js --dry
//   node scripts/repairOrphanAgentOrders.js
//
// ⚠️ WHY THESE EXIST. scripts/seedDemoData.js wrote `agentId: captain._id` on
// every seeded order. Two things were wrong and both were SILENT: the field is
// `agentUid`, not `agentId`, so Mongoose strict mode dropped it; and `_id` is
// the Mongo ObjectId where `agentUid` stores the Firebase uid. `agentName` DID
// save, because that field exists — so the record ended up asserting who drove
// while holding nothing any query could resolve. The script is fixed; this
// repairs the rows it already wrote.
//
// ⚠️ IT ONLY EVER WRITES AN UNAMBIGUOUS MATCH. An order is repaired only when
// its `agentName` resolves to EXACTLY ONE account with role 'agent'. Two
// captains with the same name, or none, and the row is REPORTED AND LEFT
// ALONE — guessing which driver delivered somebody's crop is precisely the
// kind of invention this app refuses everywhere else.
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');

const DRY = process.argv.includes('--dry');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const orphans = await Order.find({
    agentName: { $nin: [null, ''] },
    $or: [{ agentUid: null }, { agentUid: { $exists: false } }],
  }).select('agentName agentPhone status cropName').lean();

  console.log(`\nOrders with an agentName and no agentUid: ${orphans.length}`);
  if (!orphans.length) { console.log('Nothing to repair.\n'); await mongoose.disconnect(); return; }

  let fixed = 0; const skipped = [];
  for (const name of [...new Set(orphans.map((o) => o.agentName))]) {
    const matches = await User.find({ name, role: 'agent' }).select('firebaseUid name phone').lean();
    const rows = orphans.filter((o) => o.agentName === name);
    if (matches.length !== 1) {
      skipped.push({ name, n: rows.length, why: matches.length === 0 ? 'no captain account with that name' : `${matches.length} captains share that name` });
      continue;
    }
    const cap = matches[0];
    console.log(`  "${name}" → ${cap.firebaseUid.slice(0, 16)}…  (${rows.length} order(s))`);
    if (!DRY) {
      const r = await Order.updateMany(
        { _id: { $in: rows.map((o) => o._id) } },
        { $set: { agentUid: cap.firebaseUid, agentPhone: cap.phone || '' } }
      );
      fixed += r.modifiedCount;
    } else fixed += rows.length;
  }

  for (const s of skipped) {
    console.log(`  ⚠️  LEFT ALONE: "${s.name}" (${s.n} order(s)) — ${s.why}.`);
    console.log('      Guessing which driver delivered somebody\'s crop is not a repair.');
  }
  console.log(DRY ? `\n--dry: would repair ${fixed}.\n` : `\n✅ repaired ${fixed} order(s).\n`);
  await mongoose.disconnect();
})();

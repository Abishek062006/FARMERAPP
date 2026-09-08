// scripts/thinAwaitingAgentBacklog.js
//
//   node scripts/thinAwaitingAgentBacklog.js            # dry run (default)
//   node scripts/thinAwaitingAgentBacklog.js --confirm  # write it
//
// ═══ THE BUG THIS FIXES ═══════════════════════════════════════════════════
//
// REPORTED DIRECTLY: a real order, just booked live (Nashik buyer → Nashik
// farmer), never showed up in ANY captain's job feed at all.
//
// Root cause: `routes/orders.js`'s captain feed does
// `Order.find({status:'awaiting_agent', ...}).sort({createdAt:1}).limit(SCAN_CAP)`
// — oldest first, capped at 300 (services/dispatchReach.js). Checked live:
// 2,060 orders are simultaneously sitting in `awaiting_agent`, essentially
// all of them from this session's own order-history seeding (each farmer got
// 1-2 "still open" dispatch slots). A brand new real order is, by
// definition, the NEWEST `awaiting_agent` row in the whole system — sorted
// oldest-first with a 300 cap, it can never be reached until ~1,760 older
// seeded rows clear out first. They eventually would (dispatchExpiresAt is
// only 1-3h out), but "wait up to a few hours before any captain can even
// SEE your order" is not an acceptable interim state, and it will recur
// every time this seed is re-run.
//
// ═══ THE FIX IS DATA VOLUME, NOT APP LOGIC ═════════════════════════════════
//
// The cap itself is correct, documented, load-bearing behaviour at real
// scale (see dispatchReach.js's own comment) — the bug is that the SEED
// created ~2,000 concurrently "still open" dispatches, which could not exist
// in a real system: most farmers' dispatches get accepted or lapse to
// `no_agents` within hours, not sit open indefinitely. This keeps only a
// small, realistic number of seeded rows genuinely `awaiting_agent` (the
// MOST RECENTLY created ones, per district) and lapses the rest to
// `no_agents` — the correct terminal state for an old, unaccepted dispatch,
// which is NOT scanned by the captain feed's `status:'awaiting_agent'`
// filter. Nothing about a real order is touched; this only ever selects
// `dataSource: 'demo_real_history'` rows.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Order = require('../models/Order');

const TAG = 'demo_real_history';
const KEEP_PER_DISTRICT = 3; // small enough that 36 districts stays far under SCAN_CAP (300)

const DRY = !process.argv.includes('--confirm');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const rows = await Order.find({ status: 'awaiting_agent', dataSource: TAG })
    .select('_id pickup.district createdAt').sort({ createdAt: -1 }).lean();

  const keepIds = new Set();
  const seenPerDistrict = new Map();
  for (const r of rows) {
    const d = r.pickup?.district || 'unknown';
    const n = seenPerDistrict.get(d) || 0;
    if (n < KEEP_PER_DISTRICT) {
      keepIds.add(String(r._id));
      seenPerDistrict.set(d, n + 1);
    }
  }

  const toLapse = rows.filter((r) => !keepIds.has(String(r._id)));
  console.log(`📋 ${rows.length} seeded awaiting_agent order(s) found`);
  console.log(`📋 keeping ${keepIds.size} (up to ${KEEP_PER_DISTRICT} most recent per district)`);
  console.log(`📋 lapsing ${toLapse.length} to no_agents`);

  if (DRY) {
    console.log('\n🔍 DRY RUN — nothing written. Re-run with --confirm.');
    await mongoose.disconnect();
    return;
  }

  const r = await Order.updateMany(
    { _id: { $in: toLapse.map((x) => x._id) } },
    { $set: { status: 'no_agents' } }
  );
  console.log(`✅ ${r.modifiedCount} order(s) lapsed to no_agents`);

  const remaining = await Order.countDocuments({ status: 'awaiting_agent' });
  console.log(`✅ total awaiting_agent orders now: ${remaining} (well under the 300 scan cap)`);

  await mongoose.disconnect();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });

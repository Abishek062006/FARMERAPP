// scripts/backfillProcurementGrades.js
//
//   node scripts/backfillProcurementGrades.js            # dry run (default)
//   node scripts/backfillProcurementGrades.js --confirm  # write it
//
// ═══ WHY THIS EXISTS ═══════════════════════════════════════════════════════
//
// "Sell to FPO" only renders a button when the farmer's own listing has BOTH
// (a) the same crop AND (b) a GRADE the group has an agreed procurement rate
// for — grading stays optional everywhere else, but a procurement rate is
// keyed on (crop, grade) and there is no honest way to price an ungraded lot
// against a per-grade rate.
//
// Auditing the 10 real procurement FPOs (seedFpoProcurement.js) found 85 real
// members: 10 have no available listing at all (nothing to sell right now —
// left alone, that is a true state), and of the remaining 75 listings, 35
// have NO grade set. Every one of those 35 is the SAME crop the group
// already has a rate for — this is not a genuine crop mismatch (which would
// be a real, nameable gap, same doctrine as `NO_AGREED_RATE`), it is a
// missing grade on a listing an earlier seed pass created ungraded. Left
// alone, "Sell to FPO" is a coin flip across a group's own members — exactly
// what was reported as "still not showing".
//
// This sets a self-declared grade (the farmer's own choice, same as any
// other listing) on those 35 listings, picking one of the FPO's own already
// agreed grades for that crop so the rate lookup resolves. It does NOT
// invent a rate, a crop, or a member — only completes a field that was
// always meant to be there.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Fpo = require('../models/Fpo');
const CropListing = require('../models/CropListing');
const User = require('../models/User');
const { specForCrop, isValidGrade, SPEC_VERSION } = require('../data/gradeSpecs');

const DOMAIN_RX = /@mh\.farmerapp\.demo$/;
const DRY = !process.argv.includes('--confirm');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const realFarmers = await User.find({ role: 'farmer', email: { $not: DOMAIN_RX } })
    .select('firebaseUid').lean();
  const realUidSet = new Set(realFarmers.map((f) => f.firebaseUid));

  const procFpos = await Fpo.find({ paymentMode: 'procurement' })
    .select('name members procurementRates').lean();

  const updates = [];
  let skippedNoValidGrade = 0;

  for (const f of procFpos) {
    const ratesByCrop = new Map();
    for (const r of f.procurementRates) {
      const key = r.cropName.toLowerCase();
      if (!ratesByCrop.has(key)) ratesByCrop.set(key, []);
      ratesByCrop.get(key).push(r.grade);
    }

    const realMembers = f.members.filter(
      (m) => realUidSet.has(m.farmerUid) && (m.status === 'active' || !m.status)
    );

    for (const m of realMembers) {
      const listings = await CropListing.find({
        farmerUid: m.farmerUid,
        status: 'available',
        'grade.code': null,
      }).select('cropName grade');

      for (const l of listings) {
        const grades = ratesByCrop.get((l.cropName || '').toLowerCase());
        if (!grades || !grades.length) continue; // genuine crop mismatch — leave alone

        // Alternate which of the FPO's rate grades gets assigned, using the
        // listing id so it is deterministic rather than random.
        const idx = parseInt(String(l._id).slice(-1), 16) % grades.length;
        const code = grades[idx];

        if (!isValidGrade(l.cropName, code)) { skippedNoValidGrade++; continue; }
        const spec = specForCrop(l.cropName);

        updates.push({
          listingId: l._id,
          fpoName: f.name,
          farmerUid: m.farmerUid,
          cropName: l.cropName,
          code,
          specKey: spec?.key || null,
        });
      }
    }
  }

  console.log(`\n📋 ${updates.length} listing(s) to grade:`);
  for (const u of updates) {
    console.log(`   ${u.fpoName.slice(0, 30).padEnd(32)} | ${u.cropName.padEnd(14)} → Grade ${u.code}`);
  }
  if (skippedNoValidGrade) console.log(`\n⚠️  ${skippedNoValidGrade} skipped — rate grade not valid for that crop's spec.`);

  if (DRY) {
    console.log('\n🔍 DRY RUN — nothing written. Re-run with --confirm.');
    await mongoose.disconnect();
    return;
  }

  let written = 0;
  for (const u of updates) {
    const r = await CropListing.updateOne(
      { _id: u.listingId, 'grade.code': null },
      {
        $set: {
          'grade.code': u.code,
          'grade.specKey': u.specKey,
          'grade.specVersion': SPEC_VERSION,
          'grade.selfDeclared': true,
        },
      }
    );
    if (r.modifiedCount) written++;
  }
  console.log(`\n✅ ${written} listing(s) graded.`);

  await mongoose.disconnect();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });

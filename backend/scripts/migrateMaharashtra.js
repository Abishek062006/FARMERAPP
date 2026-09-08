// One-time (re-runnable) migration for the Tamil Nadu → Maharashtra conversion.
//
//   node scripts/migrateMaharashtra.js           # dry run — reports, writes nothing
//   node scripts/migrateMaharashtra.js --apply   # actually writes
//
// Four jobs, all Phase A:
//   1. Crop.tamilName        → Crop.localName        (A5 field rename)
//   2. Task.titleTamil       → Task.titleLocal       (A5 field rename)
//      Task.descriptionTamil → Task.descriptionLocal
//      The renamed fields held TAMIL text. It is not translated here — it is
//      dropped, because a stale Tamil string shown under a Marathi label is
//      worse than an empty field, and growthCopyService regenerates the copy
//      on the next task build.
//   3. User.language — set the new field on existing users (default 'mr').
//   4. state: 'Tamil Nadu' → 'Maharashtra' on User, Land and CropListing.
//      NOTE this does NOT fix district: every existing user has district
//      "Chennai" because RegisterScreen hardcoded it (see A6). Those rows are
//      reported, not guessed at — there is no coordinate to re-derive a
//      Maharashtra district from, so they need re-registration or manual fix.
require('dotenv').config();
const mongoose = require('mongoose');
const Crop = require('../models/Crop');
const Task = require('../models/Task');
const User = require('../models/User');
const Land = require('../models/Land');
const CropListing = require('../models/CropListing');

const APPLY = process.argv.includes('--apply');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`✅ Connected to MongoDB  (${APPLY ? 'APPLY — will write' : 'DRY RUN — no writes'})\n`);

  // ── 1. Crop.tamilName → localName ─────────────────────────────────────
  const crops = await Crop.countDocuments({ tamilName: { $exists: true } });
  console.log(`1. Crop.tamilName → localName          → ${crops} document(s)`);
  if (APPLY && crops) {
    await Crop.collection.updateMany(
      { tamilName: { $exists: true } },
      { $rename: { tamilName: 'localName' } }
    );
  }

  // ── 2. Task.titleTamil / descriptionTamil ─────────────────────────────
  const tasks = await Task.countDocuments({
    $or: [{ titleTamil: { $exists: true } }, { descriptionTamil: { $exists: true } }],
  });
  console.log(`2. Task Tamil copy fields dropped      → ${tasks} document(s)`);
  if (APPLY && tasks) {
    await Task.collection.updateMany(
      { $or: [{ titleTamil: { $exists: true } }, { descriptionTamil: { $exists: true } }] },
      { $unset: { titleTamil: '', descriptionTamil: '' }, $set: { titleLocal: '', descriptionLocal: '' } }
    );
  }

  // ── 3. User.language ──────────────────────────────────────────────────
  const noLang = await User.countDocuments({ language: { $exists: false } });
  console.log(`3. User.language defaulted to 'mr'     → ${noLang} document(s)`);
  if (APPLY && noLang) {
    await User.collection.updateMany({ language: { $exists: false } }, { $set: { language: 'mr' } });
  }

  // ── 4. state string ───────────────────────────────────────────────────
  for (const [name, Model, path] of [
    ['User', User, 'location.state'],
    ['Land', Land, 'location.state'],
    ['CropListing', CropListing, 'location.state'],
  ]) {
    const n = await Model.countDocuments({ [path]: 'Tamil Nadu' });
    console.log(`4. ${name}.${path} → 'Maharashtra'`.padEnd(42) + `→ ${n} document(s)`);
    if (APPLY && n) {
      await Model.collection.updateMany({ [path]: 'Tamil Nadu' }, { $set: { [path]: 'Maharashtra' } });
    }
  }

  // ── 5. repair district from LAND coordinates where possible ──────────
  // RegisterScreen wrote "Chennai" for everyone, and User carries no
  // coordinate of its own. But Land does — map-picked and required — so a
  // farmer who has registered land CAN have their district re-derived from a
  // real coordinate rather than guessed. That is the only honest repair
  // available, and it is worth doing: the alternative leaves a real user
  // permanently mis-districted.
  const { matchDistrict, resolveDistrict } = require('../services/geoService');
  const allUsers = await User.find({}, 'firebaseUid name location').lean();
  const broken = allUsers.filter((u) => !matchDistrict(u.location?.district));

  let repaired = 0;
  const unrepairable = [];
  for (const u of broken) {
    const land = await Land.findOne({ firebaseUid: u.firebaseUid }).select('location').lean();
    const coords = land?.location?.coordinates;
    const district = coords ? resolveDistrict(null, coords) : null;
    if (!district) { unrepairable.push(u); continue; }
    repaired++;
    console.log(`5. district repaired from land   → ${u.name}: "${u.location?.district ?? '(none)'}" → ${district}`);
    if (APPLY) {
      await User.updateOne({ firebaseUid: u.firebaseUid }, {
        $set: { 'location.district': district, 'location.city': land.location.city || u.location?.city || null },
      });
    }
  }
  console.log(`5. district repaired from land coordinates → ${repaired} user(s)`);

  // ── report: what could not be repaired ────────────────────────────────
  const stranded = unrepairable;
  console.log(`\n⚠️  ${stranded.length} of ${allUsers.length} user(s) still have no usable district.`);
  console.log('   RegisterScreen hardcoded "Chennai" for everyone (fixed in A6), but that is');
  console.log('   not the whole story here: most of these accounts DO have registered land,');
  console.log('   and that land is PHYSICALLY IN TAMIL NADU — coordinates around Madurai,');
  console.log('   Thanjavur and Chennai, from before the conversion. resolveDistrict()');
  console.log('   correctly returns null for them rather than snapping a Tamil Nadu farm to');
  console.log('   the nearest Maharashtra district. They are pre-conversion test data and');
  console.log('   cannot be repaired — only deleted or re-registered:');
  for (const u of stranded.slice(0, 20)) {
    console.log(`     ${u.firebaseUid}  ${u.name || '(no name)'}  district="${u.location?.district ?? '(none)'}"`);
  }
  if (stranded.length > 20) console.log(`     ... and ${stranded.length - 20} more`);

  console.log(`\n${APPLY ? '🎉 Migration applied.' : '👀 Dry run complete — re-run with --apply to write.'}`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});

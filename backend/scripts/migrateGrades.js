// C3 migration: free-text gradeNote -> structured grade.
//
//   node scripts/migrateGrades.js           # dry run
//   node scripts/migrateGrades.js --apply
//
// The old field was free text, so this only promotes what is UNAMBIGUOUS: a
// note that is essentially "A" / "A grade" / "grade a" becomes code 'A'.
// Anything else — "good quality", "fresh", "medium-large" — keeps its text in
// grade.note and gets NO code, because inventing a grade for it would be
// putting words in a farmer's mouth about their own crop.
require('dotenv').config();
const mongoose = require('mongoose');
const CropListing = require('../models/CropListing');
const { specForCrop, SPEC_VERSION } = require('../data/gradeSpecs');

const APPLY = process.argv.includes('--apply');

// Only these map to a code. Deliberately strict.
const UNAMBIGUOUS = /^(grade\s*)?([abc])(\s*grade)?$/i;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`✅ Connected  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  const rows = await CropListing.find({
    $or: [{ 'grade.specKey': { $exists: false } }, { 'grade.specKey': null }],
  }).select('cropName gradeNote grade').lean();

  console.log(`${rows.length} listing(s) without a structured grade\n`);
  let coded = 0, noteOnly = 0;

  for (const r of rows) {
    const note = String(r.gradeNote || '').trim();
    const m = note.match(UNAMBIGUOUS);
    const spec = specForCrop(r.cropName);
    const code = m ? m[2].toUpperCase() : null;

    if (code) coded++; else if (note) noteOnly++;
    console.log(`  ${r.cropName.padEnd(22)} "${note}"`.padEnd(56) +
      `→ ${code ? 'grade ' + code : 'no code'}  (spec ${spec.key})`);

    if (APPLY) {
      await CropListing.updateOne({ _id: r._id }, {
        $set: {
          'grade.code': code,
          'grade.specKey': spec.key,
          'grade.specVersion': SPEC_VERSION,
          'grade.selfDeclared': true,
          'grade.note': note.slice(0, 120),
        },
      });
    }
  }

  console.log(`\n${coded} promoted to a grade code · ${noteOnly} kept as text only · ` +
    `${rows.length - coded - noteOnly} had no note at all`);
  console.log(APPLY ? '\n🎉 Applied.' : '\n👀 Dry run — re-run with --apply to write.\n');
  await mongoose.disconnect();
}

main().catch((e) => { console.error('❌', e); process.exit(1); });

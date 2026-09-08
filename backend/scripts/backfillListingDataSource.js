// Promote the free-text demo marker on CropListing into the structured
// `dataSource` field.
//   node scripts/backfillListingDataSource.js --dry
//   node scripts/backfillListingDataSource.js
//
// ⚠️ WHY THIS EXISTS. scripts/seedFpoListings.js marked its stock only in
// `notes` ("illustrative demo stock, not a real harvest") — honest to a human
// reading one listing, invisible to every query. That is how 75 seeded listings
// became indistinguishable from a handful of real ones, which was found while
// measuring whether a yield model could be trained on them
// (scripts/measureIncomingModel.js): the answer turned on how many rows were
// real, and there was no field to ask with.
//
// ⚠️ IT ONLY EVER PROMOTES AN EXISTING FACT. It sets `dataSource` from a marker
// the seeder already wrote; it never guesses, and a listing without that marker
// is left alone as a REAL harvest. `--dry` first, always.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const CropListing = require('../models/CropListing');

const DRY = process.argv.includes('--dry');
const MARKER = /illustrative|demo stock/i;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const all = await CropListing.find({}).select('notes cropName dataSource').lean();
  const demo = all.filter((l) => MARKER.test(l.notes || ''));
  const already = demo.filter((l) => l.dataSource === 'demo_illustrative').length;
  const todo = demo.filter((l) => l.dataSource !== 'demo_illustrative');
  const real = all.length - demo.length;

  console.log(`\nListings total                 ${all.length}`);
  console.log(`Marked demo in notes           ${demo.length}`);
  console.log(`  ...already have dataSource   ${already}`);
  console.log(`  ...to update                 ${todo.length}`);
  console.log(`REAL listings, left untouched  ${real}\n`);

  if (!todo.length) { console.log('Nothing to do.\n'); await mongoose.disconnect(); return; }
  if (DRY) { console.log('--dry: nothing written.\n'); await mongoose.disconnect(); return; }

  const r = await CropListing.updateMany(
    { _id: { $in: todo.map((l) => l._id) } },
    { $set: { dataSource: 'demo_illustrative' } }
  );
  console.log(`✅ ${r.modifiedCount} listing(s) labelled demo_illustrative.`);
  const check = await CropListing.countDocuments({ dataSource: 'demo_illustrative' });
  console.log(`   Verified in the database: ${check} labelled, ${all.length - check} real.\n`);
  await mongoose.disconnect();
})();

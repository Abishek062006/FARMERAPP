// One-time (re-runnable) migration to CropListing v2.
//
//   node scripts/migrateListings.js           # dry run — reports, writes nothing
//   node scripts/migrateListings.js --apply   # actually writes
//
// Three jobs:
//   1. Give every legacy row the inventory fields the marketplace needs
//      (quantityAvailableKg, minOrderKg).
//   2. Retire the legacy deal statuses. pending/confirmed were terminal
//      single-buyer states; they become sold_out. declined becomes withdrawn.
//   3. Backfill location.lat/lng — never populated by the old code — from the
//      crop's Land record, which has required, map-picked coordinates.
require('dotenv').config();
const mongoose = require('mongoose');
const CropListing = require('../models/CropListing');
const Crop = require('../models/Crop');
const Land = require('../models/Land');

const APPLY = process.argv.includes('--apply');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`✅ Connected to MongoDB  (${APPLY ? 'APPLY — will write' : 'DRY RUN — no writes'})\n`);

  const total = await CropListing.countDocuments();
  console.log(`📦 ${total} listing(s) in the collection\n`);

  // ── 1. inventory fields ───────────────────────────────────────────────
  const needInventory = await CropListing.countDocuments({ quantityAvailableKg: { $exists: false } });
  console.log(`1. inventory fields  → ${needInventory} row(s) need quantityAvailableKg / minOrderKg`);
  if (APPLY && needInventory) {
    // Aggregation-pipeline update: copies quantityKg across per document.
    const r = await CropListing.updateMany(
      { quantityAvailableKg: { $exists: false } },
      [{ $set: { quantityAvailableKg: '$quantityKg', minOrderKg: { $ifNull: ['$minOrderKg', 1] } } }]
    );
    console.log(`   ✅ updated ${r.modifiedCount}`);
  }

  // ── 2. legacy statuses ────────────────────────────────────────────────
  const legacySold = await CropListing.countDocuments({ status: { $in: ['pending', 'confirmed'] } });
  const legacyDecl = await CropListing.countDocuments({ status: 'declined' });
  console.log(`2. legacy statuses   → ${legacySold} pending/confirmed → sold_out, ${legacyDecl} declined → withdrawn`);
  if (APPLY) {
    if (legacySold) await CropListing.updateMany({ status: { $in: ['pending', 'confirmed'] } }, { $set: { status: 'sold_out' } });
    if (legacyDecl) await CropListing.updateMany({ status: 'declined' }, { $set: { status: 'withdrawn' } });
    if (legacySold || legacyDecl) console.log('   ✅ statuses retired');
  }

  // ── 3. coordinate backfill ────────────────────────────────────────────
  const missing = await CropListing.find({
    $or: [{ 'location.lat': null }, { 'location.lat': { $exists: false } }],
  }).select('_id cropId location');

  console.log(`3. coordinates       → ${missing.length} row(s) have no lat/lng`);

  let fixed = 0, noCrop = 0, noLand = 0;
  for (const listing of missing) {
    const crop = await Crop.findById(listing.cropId).select('landId').lean();
    if (!crop) { noCrop++; continue; }
    const land = await Land.findById(crop.landId).select('location').lean();
    if (!land || !land.location || !land.location.coordinates) { noLand++; continue; }

    const { lat, lng } = land.location.coordinates;
    if (typeof lat !== 'number' || typeof lng !== 'number') { noLand++; continue; }

    fixed++;
    if (APPLY) {
      await CropListing.updateOne({ _id: listing._id }, {
        $set: {
          landId: crop.landId,
          'location.lat': lat,
          'location.lng': lng,
          'location.district': land.location.district || listing.location?.district,
          'location.city': land.location.city || listing.location?.city,
          'location.address': land.location.address || '',
        },
      });
    }
  }
  console.log(`   ${APPLY ? '✅ backfilled' : 'would backfill'} ${fixed}` +
              (noCrop ? ` · ${noCrop} skipped (crop deleted)` : '') +
              (noLand ? ` · ${noLand} skipped (land missing coords)` : ''));

  // ── 4. build the new indexes ──────────────────────────────────────────
  if (APPLY) {
    await CropListing.syncIndexes();
    console.log('\n4. ✅ indexes synced');
  } else {
    console.log('\n4. would sync indexes (collection currently has none)');
  }

  console.log(`\n${APPLY ? '🎉 Migration complete.' : 'ℹ️  Dry run only — re-run with --apply to write.'}`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});

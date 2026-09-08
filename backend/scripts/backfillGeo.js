// Backfill the GeoJSON `geo` field on users and listings created BEFORE it
// existed. Without it they are invisible to every radius query — they simply
// do not come back, with no error.
//   node scripts/backfillGeo.js --dry
//   node scripts/backfillGeo.js
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const CropListing = require('../models/CropListing');
const { toLatLng } = require('../services/geoService');

const DRY = process.argv.includes('--dry');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  let uFixed = 0, lFixed = 0, uSkip = 0, lSkip = 0;

  // ⚠️ toLatLng() normalises the four coordinate shapes this codebase already
  // has — do NOT read .lat/.lng directly here, that is exactly how a listing
  // ends up with a city and no pickup point.
  const users = await User.find({ 'geo.coordinates': { $exists: false } }).select('location').lean();
  const uOps = [];
  for (const u of users) {
    const p = toLatLng(u.location);
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) { uSkip++; continue; }
    // [lng, lat] — GeoJSON order, the reverse of the rest of this codebase.
    uOps.push({ updateOne: { filter: { _id: u._id }, update: { $set: { geo: { type: 'Point', coordinates: [p.lng, p.lat] } } } } });
    uFixed++;
  }
  const listings = await CropListing.find({ 'geo.coordinates': { $exists: false } }).select('location').lean();
  const lOps = [];
  for (const l of listings) {
    const p = toLatLng(l.location);
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) { lSkip++; continue; }
    lOps.push({ updateOne: { filter: { _id: l._id }, update: { $set: { geo: { type: 'Point', coordinates: [p.lng, p.lat] } } } } });
    lFixed++;
  }

  console.log(`\nusers    without geo: ${users.length}  → fixable ${uFixed}, no usable coordinate ${uSkip}`);
  console.log(`listings without geo: ${listings.length}  → fixable ${lFixed}, no usable coordinate ${lSkip}`);
  // A record with no coordinate at all is LEFT ALONE, not given a district
  // centroid. Inventing a position is the storage-coordinates mistake again.
  if (uSkip || lSkip) console.log('  (those are left alone — a made-up position is worse than none)');

  if (DRY) { console.log('\n--dry: nothing written.\n'); await mongoose.disconnect(); return; }
  if (uOps.length) await User.bulkWrite(uOps, { ordered: false });
  if (lOps.length) await CropListing.bulkWrite(lOps, { ordered: false });
  console.log(`\n✅ backfilled ${uFixed} user(s) and ${lFixed} listing(s)\n`);
  await mongoose.disconnect();
})().catch(async (e) => { console.error('💥', e.message); process.exit(1); });

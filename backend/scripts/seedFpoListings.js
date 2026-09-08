// Posts harvest listings for the seeded FPO members, so the buyer catalog,
// the FPO dashboard and the whole quote → confirm → collection-run flow have
// something real to work on.
//
// WHY THIS EXISTS
//   scripts/seedFpoDemoData.js gives the 75 demo members a Land and a Crop, but
//   no listing — and a listing is what a lot is built from. Without this the
//   catalog is empty, the dashboard's "available now" is {} and there is
//   nothing to order, so none of the F2 work can be seen working.
//
// WHAT IT DELIBERATELY VARIES, and why each one matters
//   grade        A / B / ungraded in one group, so grade SEPARATION is visible:
//                the same FPO and crop must appear as two or three distinct
//                lots that are never blended. ~3 of 4 listings being ungraded
//                mirrors the real database, where most listings carry no grade.
//   pricePerKg   members of one lot ask DIFFERENT prices, so the catalog's
//                price spread (and the `wide` flag above 10%) is exercised
//                rather than every member conveniently agreeing.
//   minOrderKg   a mix including one deliberately large minimum per lot, so
//                the allocator's per-contributor floor is actually binding and
//                infeasible quantities really are infeasible.
//
// Idempotent: re-running replaces this script's own listings (tagged in
// `notes`) rather than stacking duplicates. `--purge` removes them and stops.
//
// USAGE (from backend/)
//   node scripts/seedFpoListings.js            # all 10 seeded FPOs
//   node scripts/seedFpoListings.js --only=nehrai
//   node scripts/seedFpoListings.js --purge

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const User = require('../models/User');
const Land = require('../models/Land');
const Crop = require('../models/Crop');
const CropListing = require('../models/CropListing');
const Fpo = require('../models/Fpo');
const FpoMaster = require('../models/FpoMaster');

const TAG = 'FPO_DEMO_LISTING';
const PURGE = process.argv.includes('--purge');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] || null;

// grade, ₹/kg, min order kg — cycled across a group's members.
const PROFILE = [
  { grade: 'A', price: 26, minOrderKg: 100 },
  { grade: null, price: 22, minOrderKg: 150 },
  { grade: 'B', price: 19, minOrderKg: 500 },   // the binding minimum
  { grade: null, price: 24, minOrderKg: 100 },
  { grade: 'A', price: 29, minOrderKg: 200 },   // widens the spread past 10%
  { grade: null, price: 21, minOrderKg: 100 },
  { grade: 'B', price: 18, minOrderKg: 250 },
  { grade: null, price: 23, minOrderKg: 100 },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  if (PURGE) {
    const r = await CropListing.deleteMany({ notes: new RegExp(TAG) });
    console.log(`🧹 removed ${r.deletedCount} demo listing(s).`);
    return mongoose.disconnect();
  }

  const dataset = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../data/sources_fpo/demo_fpo_dataset.json'), 'utf8'));
  const targets = ONLY ? dataset.filter((f) => f.admin.email.includes(ONLY)) : dataset;
  if (!targets.length) { console.error(`❌ no FPO matched --only=${ONLY}`); process.exit(1); }

  let made = 0, skipped = 0;
  for (const entry of targets) {
    const master = await FpoMaster.findOne({ registrationNo: entry.fpoRegistrationNo }).lean();
    const fpo = master?.linkedFpoId ? await Fpo.findById(master.linkedFpoId).lean() : null;
    if (!fpo) { console.log(`⏭  ${entry.fpoName}: not claimed yet — run seedFpoDemoData.js first`); continue; }

    const active = fpo.members.filter((m) => m.status !== 'pending');
    // The crop this group trades in. Taken from what the demo dataset already
    // decided its members grow — the most common one wins, so it stays
    // district-appropriate (onion in the Nashik belt, cotton in Amravati)
    // rather than being invented here.
    const counts = {};
    for (const f of entry.farmers) counts[f.primaryCrop] = (counts[f.primaryCrop] || 0) + 1;
    const groupCrop = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    let i = 0, groupMade = 0;

    for (const m of active) {
      const user = await User.findOne({ firebaseUid: m.farmerUid }).lean();
      if (!user) { skipped++; continue; }

      // NOTE the owner field is `firebaseUid` on Land and Crop, while the FPO
      // member array and CropListing both call the same value `farmerUid`.
      // Querying Land by `farmerUid` silently returns null rather than
      // erroring, which reads exactly like "this member has no land".
      const land = await Land.findOne({ firebaseUid: m.farmerUid, isActive: true }).lean();
      if (!land) { skipped++; continue; }

      // EVERY MEMBER OF ONE GROUP LISTS THE SAME CROP, deliberately.
      // seedFpoDemoData gives each member their own district-appropriate
      // primaryCrop, so left alone this produces eight one-farm "lots" — which
      // demonstrates nothing: no pooling, no price spread, no multi-stop
      // collection run, no ≤5-farm selection. A real onion-belt FPO has many
      // members growing onion, and that is the whole reason it can reach a
      // bulk buyer. So the group's headline crop wins over the individual's.
      const cropName = groupCrop;
      let crop = await Crop.findOne({ firebaseUid: m.farmerUid, name: cropName, isActive: true }).lean();
      if (!crop) {
        crop = (await Crop.create({
          firebaseUid: m.farmerUid, landId: land._id,
          name: cropName, localName: cropName, variety: 'Standard',
          plantingDate: new Date(Date.now() - 100 * 864e5),
          expectedHarvestDate: new Date(Date.now() - 5 * 864e5),
          duration: 120, quantity: 2000, unit: 'kg',
          notes: `${TAG} — illustrative demo crop`,
        })).toObject();
      }

      // Land stores coordinates NESTED; CropListing stores them FLAT. Reading
      // both shapes here because getting this wrong is what once left every
      // listing in the database without a pickup point.
      const lat = land.location?.coordinates?.lat ?? land.location?.lat;
      const lng = land.location?.coordinates?.lng ?? land.location?.lng;
      if (lat == null || lng == null) { skipped++; continue; }

      const p = PROFILE[i % PROFILE.length]; i++;
      const qty = 800 + (i % 5) * 400;

      await CropListing.deleteMany({ farmerUid: m.farmerUid, notes: new RegExp(TAG) });

      const doc = {
        cropId: crop._id,
        farmerUid: m.farmerUid,
        farmerName: user.name,
        farmerPhone: user.phone || '',
        cropName: crop.name || crop.cropName,
        quantityKg: qty,
        quantityAvailableKg: qty,
        minOrderKg: p.minOrderKg,
        pricePerKg: p.price,
        status: 'available',
        // Flat lat/lng — the nested shape is silently dropped by strict mode,
        // which is exactly how every listing once ended up coordinate-less.
        location: {
          city: land.location?.city || entry.farmers?.[0]?.village || fpo.village || '',
          district: user.location?.district || fpo.district || '',
          state: 'Maharashtra',
          lat, lng,
        },
        notes: `${TAG} — illustrative demo stock, not a real harvest`,
        // STRUCTURED, not only in the note above. A free-text marker is honest
        // to a human reading one listing and invisible to every query — which is
        // how 75 seeded listings once became indistinguishable from 5 real ones.
        dataSource: 'demo_illustrative',
      };
      if (p.grade) doc.grade = { code: p.grade, selfDeclared: true };

      await CropListing.create(doc);
      made++; groupMade++;
    }
    console.log(`✅ ${fpo.name}: ${groupMade} listing(s) across ${active.length} member(s)`);
  }

  console.log(`\n── done ──\n   listings created: ${made}   members skipped (no crop/land/coords): ${skipped}`);
  console.log('   Next: open the buyer app → Group Lots, or log in as an FPO admin to see the dashboard.');
  await mongoose.disconnect();
}

main().catch((e) => { console.error('❌', e); process.exit(1); });

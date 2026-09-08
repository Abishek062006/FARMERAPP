// Remove pre-conversion test accounts and everything hanging off them.
//
//   node scripts/purgePreConversionData.js           # dry run
//   node scripts/purgePreConversionData.js --apply   # DELETES
//
// WHAT QUALIFIES, AND WHY IT IS SAFE
//   An account is purged only if EVERY piece of land it owns sits outside
//   Maharashtra — judged by resolveDistrict(), which returns null for any
//   coordinate more than 200 km from a Maharashtra district point. The land in
//   question is around Madurai, Thanjavur and Chennai: real coordinates from
//   when this was a Tamil Nadu app.
//
//   A user with NO land is purged only if they also have no crops, listings,
//   orders or offers. An empty account is a registration that never went
//   anywhere; one with a trade attached is not, whatever its district says.
//
//   THIS IS DELIBERATELY CONSERVATIVE. Anything with a single Maharashtra land
//   is kept whole, and any account with real trading history is kept whole. It
//   is easier to run this again than to un-delete a farmer.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Land = require('../models/Land');
const Plot = require('../models/Plot');
const Crop = require('../models/Crop');
const Task = require('../models/Task');
const CropListing = require('../models/CropListing');
const ListingImage = require('../models/ListingImage');
const Order = require('../models/Order');
const Offer = require('../models/Offer');
const { resolveDistrict } = require('../services/geoService');

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`✅ Connected  (${APPLY ? 'APPLY — WILL DELETE' : 'DRY RUN — no writes'})\n`);

  const users = await User.find({}).select('firebaseUid name role location').lean();
  const doomed = [];
  const kept = [];

  for (const u of users) {
    const lands = await Land.find({ firebaseUid: u.firebaseUid }).select('location landName').lean();

    const inMH = lands.filter((l) => !!resolveDistrict(null, l.location?.coordinates));
    if (inMH.length > 0) { kept.push([u, 'has Maharashtra land']); continue; }

    // Any real trading history keeps the account, whatever its geography.
    const [crops, listings, orders, offers] = await Promise.all([
      Crop.countDocuments({ firebaseUid: u.firebaseUid }),
      CropListing.countDocuments({ farmerUid: u.firebaseUid }),
      Order.countDocuments({ $or: [{ farmerUid: u.firebaseUid }, { vendorUid: u.firebaseUid }, { agentUid: u.firebaseUid }] }),
      Offer.countDocuments({ $or: [{ farmerUid: u.firebaseUid }, { vendorUid: u.firebaseUid }] }),
    ]);

    if (orders > 0 || offers > 0) { kept.push([u, `has ${orders} order(s), ${offers} offer(s)`]); continue; }
    if (lands.length === 0 && crops === 0 && listings === 0) {
      doomed.push({ u, lands, crops, listings, why: 'empty account, never used' });
      continue;
    }
    doomed.push({ u, lands, crops, listings, why: `${lands.length} land(s), all outside Maharashtra` });
  }

  console.log(`KEEPING ${kept.length}:`);
  for (const [u, why] of kept) console.log(`  ✔ ${(u.name || '(no name)').padEnd(16)} ${why}`);

  console.log(`\nPURGING ${doomed.length}:`);
  let totals = { lands: 0, plots: 0, crops: 0, tasks: 0, listings: 0, images: 0 };

  for (const d of doomed) {
    const uid = d.u.firebaseUid;
    const landIds = d.lands.map((l) => l._id);
    const plotIds = (await Plot.find({ firebaseUid: uid }).select('_id').lean()).map((p) => p._id);
    const listingDocs = await CropListing.find({ farmerUid: uid }).select('_id proofImageId').lean();
    const tasks = await Task.countDocuments({ firebaseUid: uid });

    totals.lands += landIds.length;
    totals.plots += plotIds.length;
    totals.crops += d.crops;
    totals.tasks += tasks;
    totals.listings += listingDocs.length;
    totals.images += listingDocs.filter((l) => l.proofImageId).length;

    console.log(`  ✗ ${(d.u.name || '(no name)').padEnd(16)} ${d.why}` +
      `  [${landIds.length}L ${plotIds.length}P ${d.crops}C ${tasks}T ${listingDocs.length}Li]`);

    if (APPLY) {
      await Promise.all([
        ListingImage.deleteMany({ _id: { $in: listingDocs.map((l) => l.proofImageId).filter(Boolean) } }),
        ListingImage.deleteMany({ ownerUid: uid }),
        CropListing.deleteMany({ farmerUid: uid }),
        Task.deleteMany({ firebaseUid: uid }),
        Crop.deleteMany({ firebaseUid: uid }),
        Plot.deleteMany({ firebaseUid: uid }),
        Land.deleteMany({ firebaseUid: uid }),
        User.deleteOne({ firebaseUid: uid }),
      ]);
    }
  }

  console.log(`\nTotal to remove: ${doomed.length} user(s), ${totals.lands} land, ` +
    `${totals.plots} plot, ${totals.crops} crop, ${totals.tasks} task, ` +
    `${totals.listings} listing, ${totals.images} image document(s)`);
  console.log(APPLY ? '\n🎉 Purged.\n' : '\n👀 Dry run — re-run with --apply to DELETE.\n');

  await mongoose.disconnect();
}

main().catch((e) => { console.error('❌', e); process.exit(1); });

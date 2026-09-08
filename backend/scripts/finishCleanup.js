// The two leftovers from purgePreConversionData.js.
//
//   node scripts/finishCleanup.js           # dry run
//   node scripts/finishCleanup.js --apply
//
// 1. TAMIL NADU LAND ON A KEPT ACCOUNT
//    The purge deliberately kept accounts with real orders, which left one
//    user holding land near Kanchipuram. Orders denormalise everything they
//    need (crop name, price, addresses), so removing the land does not touch
//    the trading history — it removes a farm that is 1,000 km outside the
//    state this app now serves.
//
// 2. district: "Chennai" ON ACCOUNTS WITH NO LAND
//    Nulled, not guessed. "Chennai" is actively WRONG in a Maharashtra app and
//    breaks proximity ranking; null is honestly "unknown" and is what
//    RegisterScreen now writes when it cannot resolve one. The district fills
//    in the moment they register land.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Land = require('../models/Land');
const Plot = require('../models/Plot');
const Crop = require('../models/Crop');
const Task = require('../models/Task');
const Order = require('../models/Order');
const { resolveDistrict, matchDistrict } = require('../services/geoService');

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`✅ Connected  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  // ── 1. land outside Maharashtra ──────────────────────────────────────
  const lands = await Land.find({}).select('firebaseUid landName location').lean();
  const outside = lands.filter((l) => !resolveDistrict(null, l.location?.coordinates));

  console.log(`1. Land outside Maharashtra → ${outside.length}`);
  for (const l of outside) {
    const u = await User.findOne({ firebaseUid: l.firebaseUid }).select('name').lean();
    const plots = await Plot.find({ landId: l._id }).select('_id').lean();
    const crops = await Crop.find({ landId: l._id }).select('_id').lean();
    const orders = await Order.countDocuments({ farmerUid: l.firebaseUid });
    const c = l.location.coordinates;
    console.log(`   ✗ ${(u?.name || 'orphan').padEnd(12)} "${l.landName}" ${c.lat.toFixed(3)},${c.lng.toFixed(3)}` +
      `  [${plots.length} plot, ${crops.length} crop]  (account keeps its ${orders} order(s))`);

    if (APPLY) {
      await Task.deleteMany({ cropId: { $in: crops.map((x) => x._id) } });
      await Crop.deleteMany({ landId: l._id });
      await Plot.deleteMany({ landId: l._id });
      await Land.deleteOne({ _id: l._id });
    }
  }

  // ── 2. wrong district on landless accounts ───────────────────────────
  const users = await User.find({}).select('firebaseUid name location').lean();
  const wrong = users.filter((u) => u.location?.district && !matchDistrict(u.location.district));

  console.log(`\n2. Accounts with a district that is not in Maharashtra → ${wrong.length}`);
  for (const u of wrong) {
    const land = await Land.findOne({ firebaseUid: u.firebaseUid }).select('location').lean();
    const derived = land ? resolveDistrict(null, land.location?.coordinates) : null;
    console.log(`   ${derived ? '↻' : '∅'} ${(u.name || '?').padEnd(12)} "${u.location.district}" → ` +
      (derived || 'null (unknown — honest, and fills in when they register land)'));
    if (APPLY) {
      await User.updateOne({ firebaseUid: u.firebaseUid }, {
        $set: { 'location.district': derived, 'location.city': derived ? u.location.city : null },
      });
    }
  }

  console.log(APPLY ? '\n🎉 Done.\n' : '\n👀 Dry run — re-run with --apply.\n');
  await mongoose.disconnect();
}
main().catch((e) => { console.error('❌', e); process.exit(1); });

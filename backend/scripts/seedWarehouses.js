// Seed the illustrative warehouse records.
//   node scripts/seedWarehouses.js
//
// Idempotent: matches on name + district, so re-running updates rather than
// duplicating. NEVER touches a record whose dataSource is 'verified' — once
// someone has actually checked a godown, a seed script must not overwrite it.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Warehouse = require('../models/Warehouse');
const { SEED, SEED_STAMP } = require('../data/warehouseSeed');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  let created = 0, updated = 0, skipped = 0;

  for (const w of SEED) {
    const existing = await Warehouse.findOne({ name: w.name, district: w.district }).lean();
    if (existing && existing.dataSource === 'verified') { skipped++; continue; }
    const r = await Warehouse.findOneAndUpdate(
      { name: w.name, district: w.district },
      { $set: { ...w, ...SEED_STAMP } },
      { upsert: true, new: true, rawResult: true }
    );
    if (r.lastErrorObject && r.lastErrorObject.updatedExisting) updated++; else created++;
  }

  const total = await Warehouse.countDocuments({ active: true });
  console.log(`created ${created}, updated ${updated}, skipped(verified) ${skipped}`);
  console.log(`${total} active warehouses; ${await Warehouse.countDocuments({ dataSource: 'seed_illustrative' })} are ILLUSTRATIVE`);
  await mongoose.disconnect();
})();

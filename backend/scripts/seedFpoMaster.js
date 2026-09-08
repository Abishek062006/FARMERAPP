// Seed the real SFAC Maharashtra FPO registry.
//   node scripts/seedFpoMaster.js
//
// Idempotent: upserts by `registrationNo`, the natural unique key SFAC
// assigns each incorporated FPO. NEVER overwrites a record whose
// claimStatus has moved past 'unclaimed' — once someone has applied,
// claimed, or been reviewed, a re-seed must not clobber that state. Same
// discipline as scripts/seedWarehouses.js refusing to touch a 'verified'
// warehouse.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const FpoMaster = require('../models/FpoMaster');
const ROWS = require('../data/sources_fpo/mh_fpo_master.json');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  let created = 0, updated = 0, skipped = 0;

  for (const row of ROWS) {
    const existing = await FpoMaster.findOne({ registrationNo: row.registrationNo }).lean();
    if (existing && existing.claimStatus !== 'unclaimed') { skipped++; continue; }

    // NOTE: mongoose 9's rawResult no longer carries `lastErrorObject` (the
    // classic MongoDB driver findAndModify shape) — it returns the document
    // itself, so `updatedExisting` cannot be read off the result. The prior
    // findOne() above already told us whether this was an insert or update.
    await FpoMaster.findOneAndUpdate(
      { registrationNo: row.registrationNo },
      {
        $set: {
          sNo: row.sNo,
          state: row.state || 'Maharashtra',
          district: row.district,
          block: row.block,
          cbboName: row.cbboName,
          fpoName: row.fpoName,
          registrationAct: row.registrationAct,
          dateOfIncorporation: row.dateOfIncorporation,
          dataSource: 'sfac_registry',
        },
      },
      { upsert: true, new: true }
    );
    if (existing) updated++; else created++;
  }

  const total = await FpoMaster.countDocuments();
  console.log(`created ${created}, updated ${updated}, skipped(claimed) ${skipped}`);
  console.log(`${total} total FpoMaster documents in Atlas`);
  await mongoose.disconnect();
})().catch((err) => { console.error('❌ Seed failed:', err); process.exit(1); });

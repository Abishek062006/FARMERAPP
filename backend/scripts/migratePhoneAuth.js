// scripts/migratePhoneAuth.js
//
//   node scripts/migratePhoneAuth.js            # dry run (default)
//   node scripts/migratePhoneAuth.js --confirm  # apply
//
// ═══ WHY AN INDEX MIGRATION IS NEEDED AT ALL ══════════════════════════════
//
// `models/User.js` now declares `email` as optional + sparse, because a phone
// sign-in has no email. But CHANGING A MONGOOSE SCHEMA DOES NOT CHANGE AN INDEX
// THAT ALREADY EXISTS. The live index is:
//
//     email_1 | {"email":1} UNIQUE      ← not sparse
//
// On a non-sparse unique index MongoDB indexes a MISSING field as null. So the
// first phone-only account would save and the SECOND would fail with a
// duplicate key error on null — in production, at signup, for the second real
// person to ever use phone sign-in. Dropping and recreating it as sparse is the
// whole fix.
//
// Idempotent: re-running when the indexes are already correct does nothing.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

const DRY = !process.argv.includes('--confirm');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.db.collection('users');
  const before = await col.indexes();
  const email = before.find((i) => i.name === 'email_1');
  const phone = before.find((i) => i.name === 'phoneAuth.number_1');

  console.log('\ncurrent:');
  console.log('  email_1            :', email ? `unique=${!!email.unique} sparse=${!!email.sparse}` : 'MISSING');
  console.log('  phoneAuth.number_1 :', phone ? `unique=${!!phone.unique} sparse=${!!phone.sparse}` : 'missing');

  const needEmail = !email || !email.sparse || !email.unique;
  const needPhone = !phone;

  // ⚠️ CHECKED BEFORE TOUCHING ANYTHING. A unique index REFUSES TO BUILD if the
  // data already violates it, and it fails half-way through leaving the
  // collection with no index at all. Counting first turns a confusing build
  // error into a plain sentence.
  const dupEmails = await col.aggregate([
    { $match: { email: { $nin: [null, ''] } } },
    { $group: { _id: '$email', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();
  const dupPhoneAuth = await col.aggregate([
    { $match: { 'phoneAuth.number': { $nin: [null, ''] } } },
    { $group: { _id: '$phoneAuth.number', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();

  // An explicit `email: null` is indexed even by a SPARSE index, so two of them
  // still collide. Absent is the only safe shape; if any row carries a literal
  // null it has to be unset before the index can be trusted.
  const nullEmails = await col.countDocuments({ email: null });

  console.log('\nsafety checks:');
  console.log('  duplicate emails         :', dupEmails.length, dupEmails.length ? '❌ would break the build' : '✅');
  console.log('  duplicate phoneAuth      :', dupPhoneAuth.length, dupPhoneAuth.length ? '❌' : '✅');
  console.log('  rows with email === null :', nullEmails, nullEmails ? '⚠️  must be unset, sparse does not skip an explicit null' : '✅');

  if (dupEmails.length || dupPhoneAuth.length) {
    console.error('\n❌ refusing to build a unique index over data that violates it.');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!needEmail && !needPhone && !nullEmails) {
    console.log('\n✅ already migrated — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nplanned:');
  if (nullEmails) console.log(`  • $unset email on ${nullEmails} row(s) that hold an explicit null`);
  if (needEmail) console.log('  • drop email_1, recreate as { unique: true, sparse: true }');
  if (needPhone) console.log('  • create phoneAuth.number_1 as { unique: true, sparse: true }');

  if (DRY) {
    console.log('\n🔍 DRY RUN — nothing changed. Re-run with --confirm.');
    await mongoose.disconnect();
    return;
  }

  if (nullEmails) {
    const r = await col.updateMany({ email: null }, { $unset: { email: '' } });
    console.log(`✅ unset email on ${r.modifiedCount} row(s)`);
  }
  if (needEmail) {
    if (email) { await col.dropIndex('email_1'); console.log('✅ dropped email_1'); }
    await col.createIndex({ email: 1 }, { unique: true, sparse: true, name: 'email_1' });
    console.log('✅ recreated email_1 (unique, sparse)');
  }
  if (needPhone) {
    await col.createIndex({ 'phoneAuth.number': 1 }, { unique: true, sparse: true, name: 'phoneAuth.number_1' });
    console.log('✅ created phoneAuth.number_1 (unique, sparse)');
  }

  const after = await col.indexes();
  console.log('\nafter:');
  after.filter((i) => /email|phoneAuth/.test(i.name))
    .forEach((i) => console.log(`  ${i.name} | unique=${!!i.unique} sparse=${!!i.sparse}`));

  await mongoose.disconnect();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });

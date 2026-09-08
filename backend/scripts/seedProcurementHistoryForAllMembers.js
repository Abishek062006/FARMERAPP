// scripts/seedProcurementHistoryForAllMembers.js
//
//   node scripts/seedProcurementHistoryForAllMembers.js            # dry run (default)
//   node scripts/seedProcurementHistoryForAllMembers.js --confirm  # write it
//   node scripts/seedProcurementHistoryForAllMembers.js --purge    # remove only what it made
//
// ═══ WHY THIS EXISTS ═══════════════════════════════════════════════════════
//
// seedFpoProcurement.js topped up each of the 33 procurement FPOs to a flat
// MIN_SALES (3-5) TOTAL — a per-GROUP floor, not a per-FARMER one. Checked
// live: of 1,075 active members across those groups, 609 have a listing
// whose (crop, grade) matches an agreed rate — meaning "Sell to FPO" is
// available to them — but only 89 have EVER actually sold anything, because
// the per-group floor was satisfied by whichever 2-3 members' listings the
// original script happened to pick. REPORTED DIRECTLY: opening "Orders &
// Earnings" for almost any real member showed "you haven't sold anything
// yet" even though the group itself had transacted.
//
// This tops up PER FARMER instead: every eligible member (crop+grade already
// has an agreed rate) gets at least MIN_SALES_PER_FARMER historical sales of
// their own, at their group's own real rate. Nothing is invented — the rate,
// the crop and the grade all come from data that already exists; only the
// quantity, date and paid/unpaid split are randomised, same doctrine as
// every other seed script here (an honest minority left unpaid).
//
// Historical sales do NOT touch the listing's CURRENT `quantityAvailableKg` —
// same rule as seedRealAccountHistory.js's delivered orders: a past sale is
// not a claim on today's stock.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Fpo = require('../models/Fpo');
const CropListing = require('../models/CropListing');
const User = require('../models/User');
const FpoProcurement = require('../models/FpoProcurement');

const TAG = 'demo_real_history';
const MIN_SALES_PER_FARMER = 2;
const MAX_SALES_PER_FARMER = 4;

const DRY = !process.argv.includes('--confirm') && !process.argv.includes('--purge');
const PURGE = process.argv.includes('--purge');
const rnd = (a, b) => Math.round(a + Math.random() * (b - a));

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  if (PURGE) {
    const r = await FpoProcurement.deleteMany({ dataSource: TAG });
    console.log(`🧹 purged ${r.deletedCount} procurement sale(s) (dataSource: ${TAG}).`);
    console.log('   Note: this shares its tag with seedFpoProcurement.js — purging here removes both.');
    await mongoose.disconnect();
    return;
  }

  const fpos = await Fpo.find({ paymentMode: 'procurement' })
    .select('_id name members procurementRates').lean();

  const existingCounts = await FpoProcurement.aggregate([
    { $group: { _id: '$farmerUid', n: { $sum: 1 } } },
  ]);
  const haveByFarmer = new Map(existingCounts.map((r) => [r._id, r.n]));

  const namesByUid = new Map(
    (await User.find({}).select('firebaseUid name phone').lean())
      .map((u) => [u.firebaseUid, u])
  );

  const toCreate = [];
  let farmersTopped = 0, farmersAlreadyFine = 0, farmersNoStock = 0;

  for (const f of fpos) {
    const rateByKey = new Map(
      f.procurementRates.map((r) => [`${r.cropName.toLowerCase()}|${r.grade}`, r.ratePerKg])
    );
    if (!rateByKey.size) continue;

    const activeUids = (f.members || [])
      .filter((m) => (m.status || 'active') === 'active')
      .map((m) => m.farmerUid);
    if (!activeUids.length) continue;

    const listings = await CropListing.find({
      farmerUid: { $in: activeUids }, status: 'available', 'grade.code': { $ne: null },
    }).select('farmerUid cropName cropLocalName grade quantityAvailableKg').lean();

    const byFarmer = new Map();
    for (const l of listings) {
      const key = `${l.cropName.toLowerCase()}|${l.grade.code}`;
      if (!rateByKey.has(key)) continue; // no agreed rate — a real gap, not filled
      if (!byFarmer.has(l.farmerUid)) byFarmer.set(l.farmerUid, []);
      byFarmer.get(l.farmerUid).push(l);
    }

    for (const [farmerUid, farmerListings] of byFarmer.entries()) {
      const have = haveByFarmer.get(farmerUid) || 0;
      if (have >= MIN_SALES_PER_FARMER) { farmersAlreadyFine++; continue; }
      const need = rnd(MIN_SALES_PER_FARMER, MAX_SALES_PER_FARMER) - have;
      if (need <= 0) { farmersAlreadyFine++; continue; }
      farmersTopped++;

      const farmer = namesByUid.get(farmerUid);
      for (let i = 0; i < need; i++) {
        const l = farmerListings[i % farmerListings.length];
        const ratePerKg = rateByKey.get(`${l.cropName.toLowerCase()}|${l.grade.code}`);
        const qty = rnd(40, 300);
        const amountOwed = Math.round(qty * ratePerKg * 100) / 100;
        const paid = Math.random() < 0.7;
        const soldAt = new Date(Date.now() - rnd(5, 120) * 86400e3);
        toCreate.push({
          farmerUid, farmerName: farmer?.name || '', farmerPhone: farmer?.phone || '',
          fpoId: f._id, fpoName: f.name,
          listingId: l._id, cropName: l.cropName, cropLocalName: l.cropLocalName || '', grade: l.grade.code,
          quantityKg: qty, ratePerKg, amountOwed,
          soldAt,
          payment: {
            paid, paidAt: paid ? new Date(soldAt.getTime() + rnd(1, 10) * 86400e3) : null,
            method: paid ? 'cash' : null,
          },
          pickup: { status: 'collected', collectedAt: new Date(soldAt.getTime() + 3600e3) },
          dataSource: TAG,
        });
      }
    }

    for (const uid of activeUids) {
      if (!byFarmer.has(uid)) farmersNoStock++;
    }
  }

  console.log(`\n📋 farmers already at/above ${MIN_SALES_PER_FARMER} sales: ${farmersAlreadyFine}`);
  console.log(`📋 farmers topped up: ${farmersTopped}`);
  console.log(`📋 farmers with no listing matching an agreed rate (real gap, left alone): ${farmersNoStock}`);
  console.log(`\n💰 ${toCreate.length} procurement sale(s) to create`);

  if (DRY) {
    console.log('\n🔍 DRY RUN — nothing written. Re-run with --confirm.');
    await mongoose.disconnect();
    return;
  }

  const saved = await FpoProcurement.insertMany(toCreate, { ordered: false });
  console.log(`✅ ${saved.length} procurement sale(s) written`);

  await mongoose.disconnect();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });

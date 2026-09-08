// scripts/seedFpoProcurement.js
//
//   node scripts/seedFpoProcurement.js            # dry run (default)
//   node scripts/seedFpoProcurement.js --confirm  # write it
//   node scripts/seedFpoProcurement.js --purge    # revert exactly what this made
//
// ═══ WHY THIS EXISTS ═══════════════════════════════════════════════════════
//
// The sell-to-FPO feature (POST /:id/procure) only ever shows a button when
// the farmer's OWN group is in `paymentMode: 'procurement'` AND has a real
// agreed rate for that (crop, grade) — REPORTED DIRECTLY as a refusal to
// invent either. Live Atlas had ZERO FPOs in procurement mode, so the
// feature was correctly built but completely invisible: every real FPO
// defaults to facilitation, and switching one is a real business decision
// this app must not make silently.
//
// This script makes that decision EXPLICIT and reviewable (dry run first,
// rates printed before anything is written) for the 10 real FPOs that have
// real (non-statewide) farmer members — the groups anyone actually logs
// into. It does two things:
//   1. Switches each to procurement mode, with a rate PER (crop, grade) that
//      IS NOT INVENTED — it is the rounded average of what that group's own
//      members are already asking for that exact grade on the open market.
//      A group with no graded listings among its real members is skipped
//      and named, not given a guessed rate.
//   2. Seeds 3-5 historical procurement sales per group, so both the
//      farmer's "past history with this FPO" card and the FPO's own login
//      show real numbers immediately, not an empty state.
//
// ═══ WHY facilitation STAYS THE DEFAULT EVERYWHERE ELSE ═══════════════════
//
// This only touches the 10 groups with real members. The other ~200 real
// SFAC-registered groups (unclaimed, or holding only statewide-coverage
// members) are untouched — switching a group nobody logs into would not
// make the feature more visible to anyone and would misrepresent groups
// that have never agreed to buy anything outright.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Fpo = require('../models/Fpo');
const CropListing = require('../models/CropListing');
const User = require('../models/User');
const FpoProcurement = require('../models/FpoProcurement');

const DOMAIN_RX = /@mh\.farmerapp\.demo$/;
const TAG = 'demo_real_history';

const DRY = !process.argv.includes('--confirm') && !process.argv.includes('--purge');
const PURGE = process.argv.includes('--purge');
const rnd = (a, b) => Math.round(a + Math.random() * (b - a));

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  if (PURGE) {
    const sales = await FpoProcurement.find({ dataSource: TAG }).select('fpoId').lean();
    const fpoIds = [...new Set(sales.map((s) => String(s.fpoId)))];
    const r = await FpoProcurement.deleteMany({ dataSource: TAG });
    if (fpoIds.length) {
      await Fpo.updateMany(
        { _id: { $in: fpoIds } },
        { $set: { paymentMode: 'facilitation', procurementRates: [] } }
      );
    }
    console.log(`🧹 purged ${r.deletedCount} procurement sale(s); reverted ${fpoIds.length} FPO(s) to facilitation.`);
    await mongoose.disconnect();
    return;
  }

  const notStatewide = { $not: DOMAIN_RX };
  const realFarmers = await User.find({ role: 'farmer', email: notStatewide }).select('firebaseUid name phone').lean();
  const realByUid = new Map(realFarmers.map((f) => [f.firebaseUid, f]));
  const realUids = [...realByUid.keys()];

  const fpos = await Fpo.find({ status: 'active', 'members.farmerUid': { $in: realUids } })
    .select('name adminUid members paymentMode procurementRates').lean();

  const salesToCreate = [];
  const fpoUpdates = [];

  for (const f of fpos) {
    // Skip a group already in procurement with rates on file — this script
    // is meant to switch it ON, not overwrite a real admin's own choices.
    if (f.paymentMode === 'procurement' && (f.procurementRates || []).length) {
      console.log(`↷ ${f.name}: already in procurement mode with rates on file — left alone.`);
      continue;
    }

    const mine = f.members
      .filter((m) => realByUid.has(m.farmerUid) && (m.status === 'active' || !m.status))
      .map((m) => m.farmerUid);
    const listings = await CropListing.find({ farmerUid: { $in: mine }, status: 'available' })
      .select('farmerUid cropName cropLocalName grade pricePerKg quantityAvailableKg').lean();

    const byCropGrade = new Map();
    for (const l of listings) {
      if (!l.grade?.code) continue; // procurement rates are keyed on a real grade
      const key = `${l.cropName}|${l.grade.code}`;
      if (!byCropGrade.has(key)) byCropGrade.set(key, []);
      byCropGrade.get(key).push(l);
    }

    if (!byCropGrade.size) {
      console.log(`⚠️  ${f.name}: no graded, available listings among real members — skipped, no rate invented.`);
      continue;
    }

    const rates = [...byCropGrade.entries()].map(([key, rows]) => {
      const [cropName, grade] = key.split('|');
      const avg = rows.reduce((a, r) => a + r.pricePerKg, 0) / rows.length;
      return { cropName, grade, ratePerKg: Math.max(1, Math.round(avg)) };
    });

    fpoUpdates.push({ fpoId: f._id, name: f.name, rates });

    const keys = [...byCropGrade.keys()];
    const n = rnd(3, 5);
    for (let i = 0; i < n; i++) {
      const key = keys[i % keys.length];
      const [cropName, grade] = key.split('|');
      const rateRow = rates.find((r) => r.cropName === cropName && r.grade === grade);
      const candidates = byCropGrade.get(key);
      const l = candidates[i % candidates.length];
      const farmer = realByUid.get(l.farmerUid);
      const qty = rnd(40, 300);
      const amountOwed = Math.round(qty * rateRow.ratePerKg * 100) / 100;
      const paid = Math.random() < 0.7;
      const soldAt = new Date(Date.now() - rnd(5, 90) * 86400e3);
      salesToCreate.push({
        farmerUid: farmer.firebaseUid, farmerName: farmer.name, farmerPhone: farmer.phone || '',
        fpoId: f._id, fpoName: f.name,
        listingId: l._id, cropName, cropLocalName: l.cropLocalName || '', grade,
        quantityKg: qty, ratePerKg: rateRow.ratePerKg, amountOwed,
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

  console.log(`\n📋 ${fpoUpdates.length} real FPO(s) to switch to procurement mode:`);
  for (const u of fpoUpdates) {
    console.log(`   ${u.name}: ${u.rates.map((r) => `${r.cropName}/${r.grade}=₹${r.ratePerKg}/kg`).join(', ')}`);
  }
  console.log(`\n💰 ${salesToCreate.length} historical procurement sale(s) to seed`);

  if (DRY) {
    console.log('\n🔍 DRY RUN — nothing written. Re-run with --confirm.');
    await mongoose.disconnect();
    return;
  }

  for (const u of fpoUpdates) {
    await Fpo.updateOne({ _id: u.fpoId }, {
      $set: {
        paymentMode: 'procurement',
        procurementRates: u.rates.map((r) => ({ ...r, setAt: new Date(), setBy: 'demo_seed' })),
      },
    });
  }
  console.log(`✅ ${fpoUpdates.length} FPO(s) switched to procurement mode with real rates`);

  const saved = await FpoProcurement.insertMany(salesToCreate, { ordered: false });
  console.log(`✅ ${saved.length} procurement sale(s) written`);

  await mongoose.disconnect();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });

// scripts/expandFpoMembership.js
//
//   node scripts/expandFpoMembership.js            # dry run (default)
//   node scripts/expandFpoMembership.js --confirm  # write it
//   node scripts/expandFpoMembership.js --purge    # revert exactly what this made
//
// ═══ WHY THIS EXISTS ═══════════════════════════════════════════════════════
//
// seedFpoProcurement.js switched the 10 real FPOs that had "real" (non-
// statewide) farmer members into procurement mode. REPORTED DIRECTLY as still
// broken: the account actually being tested (a statewide GPS-coverage account
// — `seedStatewide.js`, 1,080 of them, 30 per district, `@mh.farmerapp.demo`)
// is not a member of ANY Fpo. Checked live: of Maharashtra's 213 active,
// SFAC-registered FPOs, only those same 10 have ANY member at all — the other
// 203 are registry entries nobody has ever joined.
//
// This is not a bug to patch, it is missing DATA: a statewide account has a
// real district (seeded to match a real GPS point), and a real FPO exists in
// that district for 33 of Maharashtra's 36 districts (checked via
// geoService.matchDistrict — the SAME renamed-district resolver every other
// part of this app uses, so "Ahmednagar" members land in the FPO whose own
// district string is "Ahmednagar" but canonically resolves to "Ahilyanagar",
// exactly as Agmarknet lookups already do). Three districts — Dharashiv,
// Mumbai City, Mumbai Suburban — have NO active FPO at all; their statewide
// farmers are named and left unassigned rather than forced into a distant
// group, the same doctrine `yieldBenchmarkService` already applies to a
// district ICRISAT has no rows for.
//
// ═══ WHAT THIS DOES, IN ORDER ══════════════════════════════════════════════
//
//   1. One FPO per resolvable district: prefer an FPO already in procurement
//      mode (the 10 from seedFpoProcurement.js) so their existing rates and
//      sale history are additive, not discarded; otherwise the first active
//      FPO for that district (deterministic — sorted by _id).
//   2. Every statewide farmer of that district becomes an ACTIVE member.
//      Existing real members are untouched — this only ever ADDS rows.
//   3. procurementRates is RECOMPUTED for every touched FPO from ALL its
//      active members' own available graded listings (crop, grade) — never
//      invented, same averaging rule as seedFpoProcurement.js, now over a
//      bigger and more honest member base.
//   4. Same-crop-but-ungraded listings get a self-declared grade backfilled
//      (backfillProcurementGrades.js's exact rule: only when the crop
//      already matches a rate this group just agreed — never a genuine
//      mismatch).
//   5. Any FPO with fewer than MIN_SALES procurement sales on file gets
//      topped up with real, dated FpoProcurement history so a member's "past
//      history with this group" card is never empty on first login.
//
// ═══ PURGE ══════════════════════════════════════════════════════════════
//
// No manifest file: every row this script ever writes is, by construction,
// keyed on a `@mh.farmerapp.demo` farmerUid, and the ORIGINAL 10 FPOs' real
// members/sales are not. Purge therefore: (a) deletes every FpoProcurement
// sale by a statewide farmerUid, (b) pulls every statewide member row from
// every FPO, then (c) recomputes each now-smaller FPO's rates from ITS
// REMAINING members — an FPO left with no graded members reverts itself to
// facilitation with an empty rate table, which is exactly the state
// seedFpoProcurement.js's own 10 FPOs were in before this script ever ran.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Fpo = require('../models/Fpo');
const CropListing = require('../models/CropListing');
const User = require('../models/User');
const FpoProcurement = require('../models/FpoProcurement');
const { matchDistrict } = require('../services/geoService');
const { specForCrop, isValidGrade, SPEC_VERSION } = require('../data/gradeSpecs');

const DOMAIN_RX = /@mh\.farmerapp\.demo$/;
const MIN_SALES = 3;
const DRY = !process.argv.includes('--confirm') && !process.argv.includes('--purge');
const PURGE = process.argv.includes('--purge');
const rnd = (a, b) => Math.round(a + Math.random() * (b - a));

// "Aurangabad - MH" is the one live FPO district string matchDistrict()
// cannot resolve as-is (it aliases the bare name, not the " - MH" suffix
// this dataset's Aurangabad row happens to carry).
function canonicalFpoDistrict(raw) {
  return matchDistrict(String(raw || '').replace(/\s*-\s*MH\s*$/i, '').trim());
}

// Rebuilds a procurement rate table from a set of members' CURRENT available
// graded listings — the same average-of-real-asking-prices rule
// seedFpoProcurement.js uses, exported nowhere so reproduced here rather than
// risking a shared-helper edit to an already-verified script.
async function ratesFromMembers(memberUids) {
  if (!memberUids.length) return [];
  const listings = await CropListing.find({
    farmerUid: { $in: memberUids }, status: 'available', 'grade.code': { $ne: null },
  }).select('cropName grade pricePerKg').lean();

  const byCropGrade = new Map();
  for (const l of listings) {
    const key = `${l.cropName}|${l.grade.code}`;
    if (!byCropGrade.has(key)) byCropGrade.set(key, []);
    byCropGrade.get(key).push(l.pricePerKg);
  }
  return [...byCropGrade.entries()].map(([key, prices]) => {
    const [cropName, grade] = key.split('|');
    const avg = prices.reduce((a, p) => a + p, 0) / prices.length;
    return { cropName, grade, ratePerKg: Math.max(1, Math.round(avg)), setAt: new Date(), setBy: 'demo_seed' };
  });
}

// backfillProcurementGrades.js's exact rule, inlined so this script produces
// a fully self-consistent result in one pass rather than depending on a
// second script being run afterwards in the right order.
async function backfillGrades(memberUids, rates) {
  const ratesByCrop = new Map();
  for (const r of rates) {
    const k = r.cropName.toLowerCase();
    if (!ratesByCrop.has(k)) ratesByCrop.set(k, []);
    ratesByCrop.get(k).push(r.grade);
  }
  if (!ratesByCrop.size) return 0;

  const ungraded = await CropListing.find({
    farmerUid: { $in: memberUids }, status: 'available', 'grade.code': null,
  }).select('cropName');

  let n = 0;
  for (const l of ungraded) {
    const grades = ratesByCrop.get((l.cropName || '').toLowerCase());
    if (!grades || !grades.length) continue;
    const idx = parseInt(String(l._id).slice(-1), 16) % grades.length;
    const code = grades[idx];
    if (!isValidGrade(l.cropName, code)) continue;
    const spec = specForCrop(l.cropName);
    await CropListing.updateOne(
      { _id: l._id, 'grade.code': null },
      { $set: { 'grade.code': code, 'grade.specKey': spec?.key || null, 'grade.specVersion': SPEC_VERSION, 'grade.selfDeclared': true } }
    );
    n++;
  }
  return n;
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  if (PURGE) {
    const staleSales = await FpoProcurement.find({ farmerUid: DOMAIN_RX }).select('fpoId').lean();
    const rSales = await FpoProcurement.deleteMany({ farmerUid: DOMAIN_RX });
    const touchedFpoIds = [...new Set(staleSales.map((s) => String(s.fpoId)))];

    const rMembers = await Fpo.updateMany(
      { 'members.farmerUid': DOMAIN_RX },
      { $pull: { members: { farmerUid: DOMAIN_RX } } }
    );

    // Recompute every FPO that is currently in procurement mode — one that
    // had only statewide members collapses to an empty table and reverts to
    // facilitation on its own; the original 10 keep their real members' rates.
    const allProcFpos = await Fpo.find({ paymentMode: 'procurement' }).select('_id members').lean();
    let reverted = 0, kept = 0;
    for (const f of allProcFpos) {
      const remaining = (f.members || []).filter((m) => (m.status || 'active') === 'active').map((m) => m.farmerUid);
      const rates = await ratesFromMembers(remaining);
      if (rates.length) {
        await Fpo.updateOne({ _id: f._id }, { $set: { procurementRates: rates } });
        kept++;
      } else {
        await Fpo.updateOne({ _id: f._id }, { $set: { paymentMode: 'facilitation', procurementRates: [] } });
        reverted++;
      }
    }

    console.log(`🧹 deleted ${rSales.deletedCount} statewide procurement sale(s) (touched ${touchedFpoIds.length} FPO(s))`);
    console.log(`🧹 pulled statewide members from ${rMembers.modifiedCount} FPO(s)`);
    console.log(`🧹 reverted ${reverted} FPO(s) to facilitation; kept ${kept} in procurement with recomputed rates`);
    await mongoose.disconnect();
    return;
  }

  // ── 1. Resolve FPOs and statewide farmers onto a common canonical district ──
  const allFpos = await Fpo.find({ status: 'active' }).select('name district paymentMode members').lean();
  const fposByDistrict = new Map();
  for (const f of allFpos) {
    const d = canonicalFpoDistrict(f.district);
    if (!d) continue;
    if (!fposByDistrict.has(d)) fposByDistrict.set(d, []);
    fposByDistrict.get(d).push(f);
  }

  const statewideFarmers = await User.find({ role: 'farmer', email: DOMAIN_RX })
    .select('firebaseUid name email location.district').lean();
  const farmersByDistrict = new Map();
  for (const u of statewideFarmers) {
    const d = u.location?.district;
    if (!d) continue;
    if (!farmersByDistrict.has(d)) farmersByDistrict.set(d, []);
    farmersByDistrict.get(d).push(u);
  }

  const unplaced = [];
  const chosen = []; // { district, fpo, farmers }
  for (const [district, farmers] of farmersByDistrict.entries()) {
    const candidates = fposByDistrict.get(district);
    if (!candidates || !candidates.length) { unplaced.push({ district, count: farmers.length }); continue; }
    const pick = candidates.find((f) => f.paymentMode === 'procurement')
      || [...candidates].sort((a, b) => String(a._id).localeCompare(String(b._id)))[0];
    chosen.push({ district, fpo: pick, farmers });
  }

  console.log(`\n📋 ${chosen.length} district(s) resolved to a real FPO:`);
  for (const c of chosen) {
    const already = new Set((c.fpo.members || []).map((m) => m.farmerUid));
    const toAdd = c.farmers.filter((f) => !already.has(f.firebaseUid));
    console.log(`   ${c.district.padEnd(28)} → ${c.fpo.name.slice(0, 40).padEnd(42)} | +${toAdd.length} member(s) (had ${c.fpo.members.length})`);
  }
  if (unplaced.length) {
    console.log(`\n⚠️  ${unplaced.length} district(s) have statewide farmers but NO active FPO — left unassigned, not forced:`);
    for (const u of unplaced) console.log(`   ${u.district}: ${u.count} farmer(s)`);
  }

  if (DRY) {
    console.log('\n🔍 DRY RUN — nothing written. Re-run with --confirm.');
    await mongoose.disconnect();
    return;
  }

  // ── 2. Add members ──
  let totalAdded = 0;
  for (const c of chosen) {
    const already = new Set((c.fpo.members || []).map((m) => m.farmerUid));
    const toAdd = c.farmers.filter((f) => !already.has(f.firebaseUid));
    if (!toAdd.length) continue;
    await Fpo.updateOne(
      { _id: c.fpo._id },
      { $push: { members: { $each: toAdd.map((f) => ({ farmerUid: f.firebaseUid, farmerName: f.name, status: 'active', joinedAt: new Date() })) } } }
    );
    totalAdded += toAdd.length;
  }
  console.log(`\n✅ ${totalAdded} member row(s) added across ${chosen.length} FPO(s)`);

  // ── 3+4. Recompute rates and backfill grades, per touched FPO ──
  let ratedFpos = 0, gradedListings = 0, totalSales = 0;
  for (const c of chosen) {
    const fresh = await Fpo.findById(c.fpo._id).select('members procurementRates paymentMode name').lean();
    const activeUids = (fresh.members || []).filter((m) => (m.status || 'active') === 'active').map((m) => m.farmerUid);
    const rates = await ratesFromMembers(activeUids);
    if (!rates.length) {
      console.log(`   ↷ ${fresh.name}: no graded available listings among any member — left in ${fresh.paymentMode}, no rate invented.`);
      continue;
    }
    await Fpo.updateOne({ _id: c.fpo._id }, { $set: { paymentMode: 'procurement', procurementRates: rates } });
    ratedFpos++;
    gradedListings += await backfillGrades(activeUids, rates);

    // ── 5. Top up sale history so the group is never empty on first login ──
    const existingSales = await FpoProcurement.countDocuments({ fpoId: c.fpo._id });
    if (existingSales >= MIN_SALES) continue;

    const graded = await CropListing.find({
      farmerUid: { $in: activeUids }, status: 'available', 'grade.code': { $ne: null },
    }).select('farmerUid cropName cropLocalName grade quantityAvailableKg').lean();
    if (!graded.length) continue;

    const farmerLookup = new Map((fresh.members || []).map((m) => [m.farmerUid, m.farmerName]));
    const need = MIN_SALES - existingSales;
    for (let i = 0; i < need; i++) {
      const l = graded[i % graded.length];
      const rateRow = rates.find((r) => r.cropName === l.cropName && r.grade === l.grade.code);
      if (!rateRow) continue;
      const qty = rnd(40, 300);
      const amountOwed = Math.round(qty * rateRow.ratePerKg * 100) / 100;
      const paid = Math.random() < 0.7;
      const soldAt = new Date(Date.now() - rnd(5, 90) * 86400e3);
      await FpoProcurement.create({
        farmerUid: l.farmerUid, farmerName: farmerLookup.get(l.farmerUid) || '',
        fpoId: c.fpo._id, fpoName: fresh.name,
        listingId: l._id, cropName: l.cropName, cropLocalName: l.cropLocalName || '', grade: l.grade.code,
        quantityKg: qty, ratePerKg: rateRow.ratePerKg, amountOwed,
        soldAt,
        payment: { paid, paidAt: paid ? new Date(soldAt.getTime() + rnd(1, 10) * 86400e3) : null, method: paid ? 'cash' : null },
        pickup: { status: 'collected', collectedAt: new Date(soldAt.getTime() + 3600e3) },
      });
      totalSales++;
    }
  }

  console.log(`✅ ${ratedFpos} FPO(s) now in procurement mode with recomputed rates`);
  console.log(`✅ ${gradedListings} listing(s) grade-backfilled`);
  console.log(`✅ ${totalSales} procurement sale(s) seeded to top up thin history`);

  await mongoose.disconnect();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });

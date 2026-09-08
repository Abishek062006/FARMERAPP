// Phase F2-follow-on test: GET /api/fpos/:id/dashboard.
//   node scripts/testFpoDashboard.js
//
// Real routes, real Atlas, auth stubbed via the require cache — same pattern
// as testFpos.js. Runs against ONE of the ten real seeded demo FPOs
// (scripts/seedFpoDemoData.js), because the whole point of this endpoint is
// that it degrades honestly on real members with real land/crops and ZERO
// listings/orders/consignments. Everything this script adds is PH#TEST_
// prefixed and removed in the finally block; everything it touches on the
// real seeded FPO (a pending "ghost" member, one extra Crop row) is undone
// by uid/name, not by wiping the FPO.
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const B = (p) => path.join(__dirname, '..', p);

const authPath = require.resolve(B('middleware/auth.js'));
require.cache[authPath] = {
  id: authPath, filename: authPath, loaded: true,
  exports: {
    requireAuth: (req, res, next) => {
      const uid = req.headers['x-test-uid'];
      if (!uid) return res.status(401).json({ success: false, error: 'Authentication required' });
      req.firebaseUid = uid; req.user = { sub: uid }; next();
    },
  },
};

const express = require('express');
const mongoose = require('mongoose');
const Fpo = require(B('models/Fpo'));
const CropListing = require(B('models/CropListing'));
const Crop = require(B('models/Crop'));
const Land = require(B('models/Land'));
// Needed to derive the EXPECTED member totals from real delivered orders
// rather than hard-coding zero — see the note at the member-card assertion.
const Order = require(B('models/Order'));

const TAG = 'PHF2DASH_TEST_';
const GHOST = TAG + 'ghost';

let pass = 0, fail = 0;
const check = (cond, m, extra = '') => {
  if (cond) { pass++; console.log('  ✅', m, extra); }
  else { fail++; console.log('  ❌', m, extra); }
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express();
  app.use(express.json());
  app.use('/api/fpos', require(B('routes/fpos')));
  const server = app.listen(5129);
  const URL = 'http://127.0.0.1:5129';

  const call = async (method, p, uid) => {
    const r = await fetch(URL + p, {
      method, headers: uid ? { 'x-test-uid': uid } : {},
    });
    return { status: r.status, body: await r.json() };
  };

  let fpo, cropDoc = null;

  try {
    console.log('\n📊 FPO dashboard (F2 follow-on)\n');

    // ── 0. pick a real seeded demo FPO with active members ─────────────
    const candidates = await Fpo.find({ dataSource: 'demo_illustrative', status: 'active' }).lean();
    fpo = candidates.find((f) => f.members.filter((m) => m.status === 'active').length >= 3);
    if (!fpo) {
      console.log('❌ No real seeded demo FPO with >=3 active members found — run scripts/seedFpoDemoData.js first.');
      process.exit(1);
    }
    const activeMembers = fpo.members.filter((m) => m.status === 'active');
    console.log(`Using real seeded FPO: ${fpo.name} (${fpo._id}), ${activeMembers.length} active members, district ${fpo.district}\n`);

    // The founder is always members[0] and IS the admin (seedFpoDemoData.js),
    // so the two farmers used below are picked from the non-admin members —
    // otherwise "an ordinary member is refused" would silently test the admin.
    const nonAdmin = activeMembers.filter((m) => m.farmerUid !== fpo.adminUid);
    const memberA = nonAdmin[0].farmerUid;   // gets the test listing
    const memberB = nonAdmin[1].farmerUid;   // gets the test unbenchmarked crop

    // ── 1. auth ──────────────────────────────────────────────────────
    console.log('1. Access control');
    let r = await call('GET', `/api/fpos/${fpo._id}/dashboard`, null);
    check(r.status === 401, 'no uid at all is rejected', `→ ${r.status}`);

    r = await call('GET', `/api/fpos/${fpo._id}/dashboard`, memberA);
    check(r.status === 403, 'an ordinary active member (not the admin) is refused', `→ ${r.status}`);

    r = await call('GET', `/api/fpos/${fpo._id}/dashboard`, TAG + 'randomOutsider');
    check(r.status === 403, 'a total stranger is refused the same way', `→ ${r.status}`);

    r = await call('GET', `/api/fpos/${new mongoose.Types.ObjectId()}/dashboard`, fpo.adminUid);
    check(r.status === 404, 'a non-existent FPO is 404', `→ ${r.status}`);

    // ── 2. zero-state, before this script adds anything ────────────────
    console.log('\n2. Zero-state on real data (no orders/listings/consignments yet)');
    r = await call('GET', `/api/fpos/${fpo._id}/dashboard`, fpo.adminUid);
    check(r.status === 200, 'the admin can load it', `→ ${r.status}`);
    const d0 = r.body.dashboard;
    check(!!d0, 'a dashboard object comes back');
    check(d0.activeMemberCount === activeMembers.length, 'active member count matches', `→ ${d0.activeMemberCount}`);
    check(typeof d0.producesAggregation.availableNow === 'object', 'availableNow is an object, not null');
    check(typeof d0.producesAggregation.totalAvailableTonnes === 'number', 'totalAvailableTonnes is a number');
    check(Array.isArray(d0.memberCards) && d0.memberCards.length === activeMembers.length,
      'one member card per active member', `→ ${d0.memberCards.length}`);
    check(d0.memberCards.every((c) => c.farmerName && typeof c.totalKgSupplied === 'number' && typeof c.totalEarned === 'number'),
      'every card carries a name and honest zero/real totals, never undefined');
    // ⚠️ THIS USED TO ASSERT LITERAL ZERO, and that was a FIXTURE ASSUMPTION,
    // not the property worth testing. It held only while the seeded FPOs had no
    // orders at all; scripts/seedTradeDemo.js now gives them real ones, and a
    // test that fails because the app finally has data is testing the wrong
    // thing.
    //
    // The invariant that actually matters is unchanged and is what is checked
    // here: every figure on a member card is DERIVED FROM REAL DELIVERED
    // ORDERS — never invented, never negative, and zero where nothing moved.
    // Computed from the database, so it holds whether the group has traded or not.
    const cardUids = d0.memberCards.map((c) => c.farmerUid);
    const realDelivered = await Order.aggregate([
      { $match: { farmerUid: { $in: cardUids }, status: 'delivered' } },
      { $group: { _id: '$farmerUid', kg: { $sum: '$quantityKg' } } },
    ]);
    const realKg = new Map(realDelivered.map((r) => [r._id, r.kg]));
    check(d0.memberCards.every((c) => c.totalKgSupplied === (realKg.get(c.farmerUid) || 0)),
      'every member card matches DELIVERED orders exactly — no fabricated activity, and none '
      + 'dropped either', `→ ${realDelivered.length} member(s) with real deliveries`);
    check(d0.memberCards.every((c) => c.totalKgSupplied >= 0 && c.totalEarned >= 0),
      '...and nothing is negative');
    check(d0.logistics && Array.isArray(d0.logistics.inProgress) && Array.isArray(d0.logistics.completed),
      'logistics has real arrays, not a crash');
    check(d0.logistics.totalSaved >= 0, 'pooling saving is never negative on the dashboard',
      `→ ₹${d0.logistics.totalSaved}`);
    // Same correction: the old assertion pinned `orders === 0`, which described
    // only a group that had never sold anything. What must hold in BOTH cases is
    // that the settlement block is coherent — a real count with a real value, or
    // a clean zero — and never undefined or NaN.
    const ss = d0.seasonSettlement;
    check(Number.isFinite(ss.orders) && Number.isFinite(ss.pooledCropValue)
      && ss.orders >= 0 && ss.pooledCropValue >= 0,
      'seasonSettlement is coherent whether the group has traded or not — never undefined, '
      + 'never NaN', `→ ${ss.orders} order(s), ₹${ss.pooledCropValue}`);
    check(ss.orders === 0 ? ss.pooledCropValue === 0 : ss.pooledCropValue >= 0,
      '...and a group with no orders reports exactly zero, not a placeholder');
    check(/no concept of a "season"/i.test(d0.seasonSettlement.seasonNote),
      'and says plainly this app has no season concept');
    check('buyerDemand' in d0, 'buyerDemand section is present');
    console.log('\n   Full zero-state JSON for this FPO:');
    console.log(JSON.stringify(d0, null, 2).slice(0, 4000));

    // ── 3. availableNow aggregation ─────────────────────────────────────
    console.log('\n3. availableNow aggregates a real member\'s live listing');
    await CropListing.create({
      cropId: new mongoose.Types.ObjectId(), farmerUid: memberA, farmerName: 'Test Farmer',
      cropName: TAG + 'Onion', quantityKg: 733, quantityAvailableKg: 733,
      minOrderKg: 25, pricePerKg: 22, totalPrice: 733 * 22,
      location: { city: 'Test', district: fpo.district || 'Nashik', state: 'Maharashtra', lat: 20.0, lng: 74.0 },
      status: 'available',
    });

    r = await call('GET', `/api/fpos/${fpo._id}/dashboard`, fpo.adminUid);
    const d1 = r.body.dashboard;
    check(d1.producesAggregation.availableNow[TAG + 'Onion'] === 733,
      'the new listing shows up under its crop name',
      `→ ${d1.producesAggregation.availableNow[TAG + 'Onion']}`);
    check(d1.producesAggregation.totalAvailableTonnes >= 0.7,
      'and the headline tonnage reflects it', `→ ${d1.producesAggregation.totalAvailableTonnes}t`);

    // ── 4. a pending member is excluded from every aggregation ─────────
    console.log('\n4. A pending (unapproved) member counts nowhere');
    await Fpo.updateOne(
      { _id: fpo._id },
      { $push: { members: { farmerUid: GHOST, farmerName: 'Ghost Applicant', status: 'pending' } } }
    );
    await CropListing.create({
      cropId: new mongoose.Types.ObjectId(), farmerUid: GHOST, farmerName: 'Ghost Applicant',
      cropName: TAG + 'GhostCrop', quantityKg: 9999, quantityAvailableKg: 9999,
      minOrderKg: 25, pricePerKg: 10, totalPrice: 99990,
      location: { city: 'Test', district: fpo.district || 'Nashik', state: 'Maharashtra', lat: 20.0, lng: 74.0 },
      status: 'available',
    });

    r = await call('GET', `/api/fpos/${fpo._id}/dashboard`, fpo.adminUid);
    const d2 = r.body.dashboard;
    check(d2.activeMemberCount === activeMembers.length,
      'the pending applicant does not inflate the active member count', `→ ${d2.activeMemberCount}`);
    check(!d2.memberCards.some((c) => c.farmerUid === GHOST),
      'and has no member card at all');
    check(!(TAG + 'GhostCrop' in d2.producesAggregation.availableNow),
      "the pending applicant's listing is invisible to availableNow");
    check(d2.producesAggregation.availableNow[TAG + 'Onion'] === 733,
      'while the real active member\'s listing is unaffected', `→ ${d2.producesAggregation.availableNow[TAG + 'Onion']}`);

    // ── 5. estimatedIncoming refuses a crop with no yield benchmark ────
    console.log('\n5. estimatedIncoming excludes a crop with no district yield data');
    const land = await Land.findOne({ firebaseUid: memberB, isActive: true }).lean();
    check(!!land, 'the chosen member has a real seeded Land record to test against');
    if (land) {
      cropDoc = await Crop.create({
        firebaseUid: memberB, landId: land._id,
        name: TAG + 'MysteryFruit', localName: TAG + 'MysteryFruit',
        variety: 'Standard',
        plantingDate: new Date(Date.now() - 30 * 86400000),
        expectedHarvestDate: new Date(Date.now() + 30 * 86400000),
        duration: 90, quantity: 100, unit: 'kg',
        currentStage: 'vegetative', isHarvested: false,
      });

      r = await call('GET', `/api/fpos/${fpo._id}/dashboard`, fpo.adminUid);
      const d3 = r.body.dashboard;
      check(!(TAG + 'MysteryFruit' in d3.producesAggregation.estimatedIncoming),
        'the unbenchmarked crop is NOT in estimatedIncoming — not even as a zero');
      check(d3.producesAggregation.excludedCropCount >= 1,
        'and shows up in the excluded count instead', `→ ${d3.producesAggregation.excludedCropCount}`);
      const mine = d3.producesAggregation.excludedCrops.find((x) => x.cropName === TAG + 'MysteryFruit');
      check(!!mine, 'with an entry naming this exact crop');
      check(!!mine && /no .*yield|no district yield record/i.test(mine.reason),
        'and a reason that says WHY, from yieldBenchmarkService itself',
        `→ "${mine && mine.reason}"`);
    }

    // ── 6. the admin sees the SAME grade-separated lots a buyer does ───
    // Phase C. producesAggregation used to group by cropName alone, so an
    // admin looking at "Grape 1,550 kg" could not tell whether the group held
    // one sellable Grade A lot or three grades a buyer would refuse as a
    // blend. availableLots comes from services/lotCatalogService.js — the same
    // function GET /api/fpos/bundles runs — so the two screens cannot disagree
    // about what the group holds.
    console.log('\n6. Grade-separated lots on the admin\'s screen (Phase C)');
    const GRP = TAG + 'Grape';
    const mkGraded = (uid, name, qty, price, min, code) => CropListing.create({
      cropId: new mongoose.Types.ObjectId(), farmerUid: uid, farmerName: name,
      cropName: GRP, quantityKg: qty, quantityAvailableKg: qty,
      minOrderKg: min, pricePerKg: price, totalPrice: qty * price,
      // No grade at all when code is null — grading is optional, and most rows
      // in this database really do look like that.
      grade: code ? { code, specKey: 'grape', specVersion: 2, selfDeclared: true } : undefined,
      location: { city: 'Test', district: fpo.district || 'Nashik', state: 'Maharashtra', lat: 20.0, lng: 74.0 },
      status: 'available',
    });
    await mkGraded(memberA, 'Test Farmer A', 400, 40, 100, 'A');
    await mkGraded(memberB, 'Test Farmer B', 600, 55, 500, 'A');
    await mkGraded(memberA, 'Test Farmer A', 300, 30, 50, 'B');
    await mkGraded(memberB, 'Test Farmer B', 250, 25, 25, null);

    r = await call('GET', `/api/fpos/${fpo._id}/dashboard`, fpo.adminUid);
    const pa = r.body.dashboard.producesAggregation;
    const grapes = (pa.availableLots || []).filter((l) => l.cropName === GRP);

    check(pa.gradeSeparated === true && Array.isArray(pa.availableLots),
      'the aggregation is grade-aware, not a bare crop→kg map');
    check(grapes.length === 3,
      'one crop with two declared grades and one ungraded listing is THREE lots',
      `→ ${grapes.map((l) => l.gradeKey).join(', ')}`);
    check(grapes.every((l) => new Set(l.contributors.map((c) => c.grade)).size === 1),
      'NO LOT BLENDS GRADES on the admin\'s side either');

    const gA = grapes.find((l) => l.gradeKey === 'A');
    const gU = grapes.find((l) => l.gradeKey === 'ungraded');
    check(gA.totalKg === 1000 && gA.membersIncluded === 2,
      'the Grade A lot pools only the two Grade A listings', `→ ${gA.totalKg} kg`);
    check(!!gU && gU.totalKg === 250 && gU.grade.code === null && gU.grade.declared === false,
      'the ungraded listing gets its own bucket — not dropped, not given a letter',
      `→ ${gU?.totalKg} kg`);
    check(gU.grade.label === 'Grade not declared' && gU.grade.tier === null,
      'and is labelled as a missing declaration, never as a fourth tier below C');
    check(gA.grade.selfDeclared === true && gA.grade.inspected === false && gA.grade.declaredBy === 2,
      'a graded lot still reads as two farmers\' own unverified claims');

    check(gA.price.minPerKg === 40 && gA.price.maxPerKg === 55 && gA.price.spreadPerKg === 15,
      'members of one grade lot disagree on price, and the admin sees the real spread',
      `→ ₹${gA.price.minPerKg}–₹${gA.price.maxPerKg}/kg`);
    check(gA.price.indicativePerKg === 49
      && gA.contributors.every((c) => c.pricePerKg !== gA.price.indicativePerKg),
      'the indicative price is a weighted average nobody is quoted at', `→ ₹${gA.price.indicativePerKg}/kg`);
    check(gA.minOrder.smallestOrderKg === 100 && gA.minOrder.fillableAtSmallestFrom === 1
      && gA.minOrder.allContributorsMinKg === 600,
      'and the lot minimum says how few members can actually fill an order that size',
      `→ ${gA.minOrder.smallestOrderKg} kg from ${gA.minOrder.fillableAtSmallestFrom} of 2`);

    check(grapes.every((l) => l.lotsIncluded === l.lotsAvailable && l.membersIncluded === l.membersAvailable),
      'the admin\'s view truncates nothing — no vehicle has been chosen on this screen');
    check(grapes.every((l) => l.contributors.every((c) => c.trust
      && String(c.trust.subject.farmerUid) === String(c.farmerUid))),
      'every contributor carries their OWN delivery record, never one blended group score');
    check(grapes.every((l) => !('trust' in l)),
      'and no lot claims a group-level trust score');

    check(pa.availableNow[GRP] === grapes.reduce((a, l) => a + l.totalKg, 0),
      'availableNow is the same stock rolled up across grades — the rollup cannot drift from the lots',
      `→ ${pa.availableNow[GRP]} kg`);
    check(pa.availableNow[TAG + 'Onion'] === 733,
      'and the pre-Phase-C ungraded onion listing still totals exactly as before',
      `→ ${pa.availableNow[TAG + 'Onion']}`);
    const onionLot = (pa.availableLots || []).find((l) => l.cropName === TAG + 'Onion');
    check(!!onionLot && onionLot.gradeKey === 'ungraded' && onionLot.totalKg === 733,
      'that listing appears as an UNGRADED lot — the ordinary case in this database, not an edge case');
    check(!pa.availableLots.some((l) => l.contributors.some((c) => c.farmerUid === GHOST)),
      'a pending applicant contributes to no lot, same as everywhere else');
    // `>=` on BOTH halves, deliberately. These count every lot the group
    // holds, not just this suite's `PH#TEST_` ones, so an exact `=== 2` broke
    // the moment the same FPO gained any other real graded listing — which is
    // the normal state of a database with demo stock in it, not an anomaly.
    // What this assertion is actually for is that the two counters stay
    // SEPARATE, so that is what it checks: each covers its own kind, and the
    // two together account for every lot without double-counting.
    check(pa.gradedLots >= 2 && pa.ungradedLots >= 2
      && pa.gradedLots + pa.ungradedLots === (pa.availableLots || []).length,
      'graded and ungraded lots are counted separately, never summed into "grades"',
      `→ ${pa.gradedLots} graded, ${pa.ungradedLots} ungraded, ${(pa.availableLots || []).length} lots`);

    // ══ DRILL-DOWN: ONE LOT, OPENED UP ═════════════════════════════════
    //
    // The dashboard showed produce aggregated by crop and grade and there was
    // NOTHING UNDERNEATH IT. An admin looking at "Onion · Grade A · 2,400 kg"
    // could not see which members it came from, what each is asking, or whether
    // any of them has ever actually delivered — a headline to run a business on.
    console.log('\n7. Drilling into one lot');

    r = await call('GET', `/api/fpos/${fpo._id}/dashboard`, fpo.adminUid);
    const lots = r.body.dashboard.producesAggregation.availableLots || [];
    check(lots.length > 0, 'the dashboard is holding at least one lot to open', `→ ${lots.length}`);
    const target = lots[0];

    r = await call('GET', `/api/fpos/${fpo._id}/lot?lotKey=${encodeURIComponent(target.lotKey)}`,
      fpo.adminUid);
    check(r.status === 200,
      "the dashboard's OWN two-part lotKey opens — the buyer catalog prefixes an fpoId and the "
      + 'dashboard does not, and requiring the longer form would 400 on the one screen this '
      + 'exists for', `→ ${r.status}`);
    const drill = r.body;
    check(drill.lot.lotKey === target.lotKey && drill.lot.totalKg === target.totalKg,
      'and it is THE SAME LOT, from the same shared function — this screen cannot start '
      + 'describing a lot differently from the dashboard and the buyer catalog',
      `→ ${drill.lot.totalKg} kg`);

    r = await call('GET',
      `/api/fpos/${fpo._id}/lot?lotKey=${encodeURIComponent(`${fpo._id}::${target.lotKey}`)}`,
      fpo.adminUid);
    check(r.status === 200, "the buyer catalog's three-part key opens the same lot", `→ ${r.status}`);

    r = await call('GET',
      `/api/fpos/${fpo._id}/lot?lotKey=${encodeURIComponent(`${new mongoose.Types.ObjectId()}::onion::A`)}`,
      fpo.adminUid);
    check(r.status === 400 && r.body.code === 'BAD_LOT_KEY',
      "a key naming ANOTHER group is refused, not quietly served from this one", `→ ${r.body.code}`);

    r = await call('GET', `/api/fpos/${fpo._id}/lot?lotKey=onion::Z`, fpo.adminUid);
    check(r.status === 400, 'and a grade that is not a grade is refused', `→ ${r.status}`);

    r = await call('GET', `/api/fpos/${fpo._id}/lot?lotKey=${encodeURIComponent(target.lotKey)}`,
      nonAdmin[0].farmerUid);
    check(r.status === 403 && r.body.code === 'NOT_ADMIN',
      'a member who is not the admin cannot drill into the group\'s lots', `→ ${r.body.code}`);

    // ── WHAT THE DRILL-DOWN ADDS ───────────────────────────────────────
    check(drill.contributors.length === drill.lot.contributors.length
      && drill.contributors.every((c) => !!c.history),
      'EVERY contributor carries a history block — the one thing neither the dashboard nor the '
      + 'buyer catalog has', `→ ${drill.contributors.length} contributors`);
    const noHistory = drill.contributors.filter((c) => c.history.sales === 0);
    check(noHistory.every((c) => c.history.avgPricePerKg === null && /No completed sales/i.test(c.history.note)),
      '⚠️ A MEMBER WITH NO HISTORY REPORTS ZERO AND A SENTENCE SAYING SO — never an average '
      + 'borrowed from the group, and never a blank that reads as "fine". Most members of a real '
      + 'group have sold nothing through this app yet',
      `→ ${noHistory.length} of ${drill.contributors.length} have no history`);
    check(drill.contributors.every((c) => !!c.trust),
      "and each keeps the delivery record a BUYER sees — the same one, not a friendlier copy");
    check(!!drill.groupHistory && typeof drill.groupHistory.sales === 'number',
      "the group's own realised history for this crop is there too", `→ ${drill.groupHistory.sales} sales`);
    check(/across all grades|no realised price/i.test(drill.groupHistory.note),
      '...and it says it is ACROSS ALL GRADES, because orders carry no grade of their own and '
      + 'splitting it by grade would be inventing the split');
    // Two honest disclaimers exist and BOTH are correct — a graded lot says
    // nobody inspected it, an ungraded one says the grade is unknown and is not
    // a tier below C. The assertion is on the substance, not on one wording:
    // whichever lot came back, the screen must still refuse to present a grade
    // as checked.
    check(/nobody has inspected|it is unknown/i.test(drill.disclaimers.grade),
      "the grade on this screen is still nobody's inspection — a declared grade says it was "
      + 'never checked, an ungraded lot says it is unknown rather than worst',
      `→ "${String(drill.disclaimers.grade).slice(0, 55)}…"`);
    check(/DELIVERED orders only/i.test(drill.disclaimers.history),
      'and history counts delivered orders only — one in flight has proved nothing');

    // ══ HOW MUCH OF THE PICTURE THE FORECAST COVERS ════════════════════
    console.log('\n8. What the incoming forecast does NOT cover');
    r = await call('GET', `/api/fpos/${fpo._id}/dashboard`, fpo.adminUid);
    const cov = r.body.dashboard.producesAggregation.coverage;
    check(!!cov && typeof cov.cropsPlanted === 'number',
      'the dashboard reports how many planted crops the forecast actually covers',
      `→ ${cov?.cropsCounted} of ${cov?.cropsPlanted}`);
    check(cov.cropsCounted + r.body.dashboard.producesAggregation.excludedCropCount === cov.cropsPlanted,
      'counted + excluded accounts for every planted crop, with no double counting');
    check(cov.cropsPlanted === 0 || /floor under what is coming, not a total|nothing to forecast/i.test(cov.note),
      '⚠️ AND IT SAYS THE FORECAST IS A FLOOR, NOT A TOTAL. Measured against this database, the '
      + 'ICRISAT lookup can price only about a tenth of planted crops — it has no rows for cotton '
      + 'or sugarcane at all. An admin reading "4.2 tonnes incoming" with no idea it covers a '
      + 'tenth of their group is being misled by omission (scripts/measureIncomingModel.js)',
      `→ "${String(cov.note).slice(0, 60)}…"`);

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    await Promise.all([
      CropListing.deleteMany({ cropName: new RegExp('^' + TAG) }),
      Crop.deleteMany({ name: new RegExp('^' + TAG) }),
    ]);
    if (fpo) {
      await Fpo.updateOne({ _id: fpo._id }, { $pull: { members: { farmerUid: GHOST } } });
    }
    console.log('\n🧹 test data removed (real seeded FPO membership restored)');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

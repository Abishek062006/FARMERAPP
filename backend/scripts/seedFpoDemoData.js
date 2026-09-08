// Give 10 REAL, SFAC-registered FPOs a synthetic admin + membership, for the
// demo — same pattern as scripts/seedDemoData.js, one level up: that script
// fills in ACCOUNTS' history, this one claims a real FpoMaster entry on their
// behalf and gives the resulting Fpo some members.
//
//   node scripts/seedFpoDemoData.js          seed
//   node scripts/seedFpoDemoData.js --purge  remove everything it made
//
// ⚠️ IT CANNOT CREATE THE LOGINS, same reason as seedDemoData.js: auth is
// Firebase email/password and this backend has no firebase-admin credential.
// Every email in data/sources_fpo/demo_fpo_dataset.json must be registered
// through the app's own Register screen FIRST. This script then finds each
// one by email and — only for FPOs whose admin account exists — claims the
// real FpoMaster entry and adds whichever of its farmers are also registered.
//
// WHY A WHOLE FPO IS SKIPPED WHEN ITS ADMIN IS MISSING, BUT A FARMER IS NOT
//   An FPO with no admin has nothing to attach members to — there is no Fpo
//   document to create, no claim to approve. A farmer being missing is
//   narrower: the group still exists, that one person just isn't in it yet.
//   So a missing admin skips the whole entry; a missing farmer skips only
//   them, loudly, same as every other MISSING line below.
//
// WHY THE CLAIM IS CREATED DIRECTLY AND AUTO-APPROVED, SKIPPING
// reviewFpoClaims.js
//   That script's whole reason to exist is that a claim submitted over HTTP
//   by an anonymous caller needs a human to look before anyone believes "I
//   represent this real company." This script is not that: it is
//   server-side seed data, run by whoever holds the database credential —
//   the same trust level scripts/seedDemoData.js already writes Order and
//   MandiSale documents at without going through their own HTTP validation.
//   Every claim and every Fpo this script creates carries
//   dataSource: 'demo_illustrative' specifically so nothing here is ever
//   mistaken for a claim that actually cleared human review.
//
// PURGE IS BY EMAIL LOOKUP, SAME AS seedDemoData.js, not a tag scan — it
// resolves the same dataset, finds the same uids, and undoes exactly what a
// matching seed run would have created. Re-running always purges first, so
// history never doubles.
require('dotenv').config({ path: __dirname + '/../.env' });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const User = require('../models/User');
const Land = require('../models/Land');
const Crop = require('../models/Crop');
const FpoMaster = require('../models/FpoMaster');
const FpoAdminClaim = require('../models/FpoAdminClaim');
const Fpo = require('../models/Fpo');
const { CROPS } = require('../data/agroZones');
const { MH_DISTRICT_CENTROIDS, MH_DISTRICT_ANCHORS } = require('../data/districtCentroids');

const DATASET_PATH = path.join(__dirname, '../data/sources_fpo/demo_fpo_dataset.json');
const DATA_SOURCE = 'demo_illustrative';
// Every Land/Crop this script creates is tagged in `notes` with this marker
// so --purge can find (and only find) what it made — Land and Crop have no
// dataSource field of their own, and adding one for a single seed script
// would be a bigger schema change than this phase calls for.
const SEED_MARKER = 'Seeded by scripts/seedFpoDemoData.js (demo_illustrative) — do not edit by hand, re-run the script instead.';

const day = (n) => new Date(Date.now() - n * 86400000);

/** Best coordinate for a taluka/block: a named anchor town if one exists in
 * districtCentroids.js, else the district's own centroid (documented
 * approximation, same discipline that file already applies elsewhere). */
function coordsFor(district, block) {
  const anchor = MH_DISTRICT_ANCHORS.find(
    (a) => a.district.toLowerCase() === district.toLowerCase() &&
           a.town.toLowerCase() === String(block).toLowerCase()
  );
  if (anchor) return { lat: anchor.lat, lng: anchor.lng, approx: false };
  const centroid = MH_DISTRICT_CENTROIDS.find((d) => d.district.toLowerCase() === district.toLowerCase());
  if (centroid) return { lat: centroid.lat, lng: centroid.lng, approx: true };
  return { lat: 19.0, lng: 76.0, approx: true }; // Maharashtra rough centre, last resort
}

/** Reasonable soil type for a crop, drawn from agroZones.js's own soils list
 * for that crop (first entry) rather than inventing one unrelated to it. */
function soilFor(cropName) {
  const spec = CROPS.find((c) => c.name === cropName);
  return spec && spec.soils && spec.soils[0] ? spec.soils[0] : 'loamy';
}
function waterFor(cropName) {
  const spec = CROPS.find((c) => c.name === cropName);
  return spec && spec.water && spec.water[0] ? spec.water[0] : 'borewell';
}
function cropSpec(cropName) {
  return CROPS.find((c) => c.name === cropName) || null;
}

async function purge(dataset) {
  const counts = { fpoAdminClaims: 0, fpos: 0, fpoMastersReset: 0, lands: 0, crops: 0 };

  const allEmails = [];
  for (const entry of dataset) {
    allEmails.push(entry.admin.email);
    for (const f of entry.farmers) allEmails.push(f.email);
  }
  const users = await User.find({ email: { $in: allEmails } }).select('email firebaseUid').lean();
  const uidByEmail = Object.fromEntries(users.map((u) => [u.email, u.firebaseUid]));
  const allUids = Object.values(uidByEmail);

  // Land/Crop this script created, identified by the marker in `notes`.
  if (allUids.length) {
    counts.lands = (await Land.deleteMany({ firebaseUid: { $in: allUids }, notes: SEED_MARKER })).deletedCount;
    counts.crops = (await Crop.deleteMany({ firebaseUid: { $in: allUids }, notes: SEED_MARKER })).deletedCount;
  }

  // Fpo + FpoAdminClaim + FpoMaster reset, per dataset entry.
  for (const entry of dataset) {
    const master = await FpoMaster.findOne({ registrationNo: entry.fpoRegistrationNo });
    if (!master) continue;

    const delFpo = await Fpo.deleteMany({ _id: master.linkedFpoId, dataSource: DATA_SOURCE });
    counts.fpos += delFpo.deletedCount;

    const delClaim = await FpoAdminClaim.deleteMany({ fpoMasterId: master._id, dataSource: DATA_SOURCE });
    counts.fpoAdminClaims += delClaim.deletedCount;

    // Only reset a registry entry this script itself claimed — never touch
    // one a real applicant has since claimed for real.
    if (master.claimStatus !== 'unclaimed' && (delFpo.deletedCount || delClaim.deletedCount)) {
      await FpoMaster.updateOne(
        { _id: master._id },
        { $set: { claimStatus: 'unclaimed', claimedByUid: null, linkedFpoId: null } }
      );
      counts.fpoMastersReset++;
    }
  }
  return counts;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
  const purgeOnly = process.argv.includes('--purge');

  if (purgeOnly) {
    const removed = await purge(dataset);
    console.log('🧹 purged:', JSON.stringify(removed));
    await mongoose.disconnect();
    return;
  }

  // Always purge first — re-running must not double the membership or leave
  // a stale Fpo linked to a FpoMaster this run is about to re-claim.
  await purge(dataset);

  const missingAdmins = [];
  const missingFarmers = [];
  const results = [];
  let totalFarmersSeeded = 0;

  for (const entry of dataset) {
    const master = await FpoMaster.findOne({ registrationNo: entry.fpoRegistrationNo });
    if (!master) {
      console.log(`❌ FpoMaster not found for registrationNo ${entry.fpoRegistrationNo} (${entry.fpoName}) — check the registry, skipping.`);
      continue;
    }

    const adminUser = await User.findOne({ email: entry.admin.email }).lean();
    if (!adminUser) {
      missingAdmins.push({ email: entry.admin.email, fpo: entry.fpoName });
      console.log(`❌ MISSING: ${entry.admin.email} — register this account first (admin of ${entry.fpoName})`);
      // Still report every farmer in this group as missing/present, so a
      // single "node scripts/seedFpoDemoData.js" run always names ALL ~85
      // dataset accounts that need registering — not just the ones reached
      // before the first blocker. Nothing is created for this group: no
      // admin means no Fpo to attach a member to.
      for (const f of entry.farmers) {
        const farmerUser = await User.findOne({ email: f.email }).lean();
        if (!farmerUser) {
          missingFarmers.push({ email: f.email, fpo: entry.fpoName });
          console.log(`❌ MISSING: ${f.email} — register this account first (farmer, ${entry.fpoName})`);
        } else {
          console.log(`   (registered, but not seeded: ${f.email} — this group's admin is not registered yet)`);
        }
      }
      continue; // no admin → skip this whole FPO, nothing to attach members to
    }

    // ── claim (direct + auto-approved; see file header for why) ──────────
    const claim = await FpoAdminClaim.create({
      fpoMasterId: master._id,
      uid: adminUser.firebaseUid,
      name: entry.admin.name,
      mobile: entry.admin.mobile,
      designation: entry.admin.designation,
      email: entry.admin.email,
      status: 'approved',
      reviewedAt: new Date(),
      dataSource: DATA_SOURCE,
    });

    // ── the working Fpo document, same shape reviewFpoClaims.js's approve()
    //    path creates ──────────────────────────────────────────────────────
    const fpo = await Fpo.create({
      name: master.fpoName,
      regNumber: master.registrationNo,
      district: master.district,
      village: master.block,
      adminUid: adminUser.firebaseUid,
      adminName: entry.admin.name,
      members: [{ farmerUid: adminUser.firebaseUid, farmerName: entry.admin.name, status: 'active' }],
      dataSource: DATA_SOURCE,
    });

    await FpoMaster.updateOne(
      { _id: master._id },
      { $set: { claimStatus: 'approved', claimedByUid: adminUser.firebaseUid, linkedFpoId: fpo._id } }
    );

    console.log(`✅ ${entry.fpoName} claimed by ${entry.admin.name} (${entry.admin.designation}) → Fpo ${fpo._id}`);

    // ── farmers ────────────────────────────────────────────────────────
    let seededHere = 0;
    for (const f of entry.farmers) {
      const farmerUser = await User.findOne({ email: f.email }).lean();
      if (!farmerUser) {
        missingFarmers.push({ email: f.email, fpo: entry.fpoName });
        console.log(`❌ MISSING: ${f.email} — register this account first (farmer, ${entry.fpoName})`);
        continue;
      }
      const uid = farmerUser.firebaseUid;

      // Land: only create one if this farmer has none yet.
      let land = await Land.findOne({ firebaseUid: uid, isActive: true });
      if (!land) {
        const { lat, lng, approx } = coordsFor(f.district, f.block);
        land = await Land.create({
          firebaseUid: uid,
          landName: `${f.village} field`,
          location: {
            coordinates: { lat, lng },
            city: f.village, district: f.district, state: 'Maharashtra',
          },
          size: { value: f.landAcres, unit: 'acres' },
          waterSource: waterFor(f.primaryCrop),
          soilType: soilFor(f.primaryCrop),
          notes: SEED_MARKER + (approx ? ' Coordinates approximated to the district centroid — no verified village-level coordinate available.' : ''),
        });
      }

      // Crop: only create one for this land if it has none yet.
      const existingCrop = await Crop.findOne({ firebaseUid: uid, landId: land._id, isActive: true });
      if (!existingCrop) {
        const spec = cropSpec(f.primaryCrop);
        const duration = spec ? spec.duration : 120;
        const localName = spec ? spec.localName : f.primaryCrop;
        await Crop.create({
          firebaseUid: uid, landId: land._id,
          name: f.primaryCrop, localName,
          variety: 'Standard',
          plantingDate: day(Math.max(duration - 20, 10)),
          expectedHarvestDate: day(-20), // ~20 days from now
          duration,
          quantity: Math.max(1, Math.round(f.landAcres * 300)),
          unit: 'kg',
          notes: SEED_MARKER,
        });
      }

      // Membership: add if not already present.
      await Fpo.updateOne(
        { _id: fpo._id, 'members.farmerUid': { $ne: uid } },
        { $push: { members: { farmerUid: uid, farmerName: f.name, status: 'active' } } }
      );

      seededHere++;
      totalFarmersSeeded++;
    }

    results.push({ fpo: entry.fpoName, admin: entry.admin.email, farmersSeeded: seededHere, farmersExpected: entry.farmers.length });
  }

  console.log('\n── summary ──────────────────────────────────────────────');
  for (const r of results) {
    console.log(`   ${r.fpo}: admin OK, ${r.farmersSeeded}/${r.farmersExpected} farmers seeded`);
  }
  console.log(`\n   FPOs claimed: ${results.length}/${dataset.length}`);
  console.log(`   Farmers seeded: ${totalFarmersSeeded}`);
  if (missingAdmins.length || missingFarmers.length) {
    console.log(`\n⚠️  ${missingAdmins.length} admin account(s) and ${missingFarmers.length} farmer account(s) are not registered yet.`);
    console.log('    Register these in the app (Register screen) with the exact emails above, then re-run.');
  }
  if (!results.length) {
    console.log('\n   Nothing was seeded — no admin account from the dataset is registered yet. This is expected before Phase 4.');
  }

  await mongoose.disconnect();
}

main().catch((err) => { console.error('❌ Failed:', err); process.exit(1); });

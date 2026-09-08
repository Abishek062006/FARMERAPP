// Posts standing buyer WANTS, so the demand half of this marketplace is not
// permanently empty.
//
// WHY THIS EXISTS
//   Exactly ONE Requirement document existed in the entire database — one
//   onion want, written by scripts/seedDemoData.js. So the FPO dashboard's
//   `buyerDemand` section, the farmer's "buyers looking for your crop" feed
//   and the `GET /api/requirements/signal` dashboard line were empty for
//   every account, on every screen, always. Not broken — untestable and
//   invisible, which is worse, because a feature nobody can see working is
//   indistinguishable from one that was never built.
//
// WHAT IT SEEDS AGAINST
//   The ten claimed demo FPOs (data/sources_fpo/demo_fpo_dataset.json, stocked
//   by scripts/seedFpoListings.js) each list ONE district-appropriate crop:
//   onion in the Nashik belt, grapes at Purandar and Sangli, cotton at
//   Amravati and Phulambri, soyabean at Ausa, jowar at Mohol, sugarcane at
//   Ajra, Alphonso at Sangameshwar, Santra at Ramtek. The wants below were
//   written against THOSE crops at THOSE coordinates — read out of the live
//   listings, not guessed.
//
// ⚠️ NOT EVERYTHING MATCHES, DELIBERATELY.
//   A world where every group has a buyer waiting is a demo, not a market. It
//   would also hide the two refusals this feature is built on — a want for a
//   crop you cannot supply is not shown to you, and a buyer's own radius is
//   respected rather than an invented one. So the plan below leaves real gaps
//   on purpose:
//     · Angarmala (Sangli grapes) and Ajantha Khore (Aurangabad cotton) have
//       demand for their crop that is out of the BUYER's stated radius. The
//       right answer for them is "nobody near you wants this right now", and
//       the app should say so rather than stretching a radius to be kind.
//     · Shri Rajaramtek (Nagpur Santra) has a real Vashi buyer 660 km away,
//       which is what an orange grower in Vidarbha actually faces.
//     · One want is for POMEGRANATE, which not one of the ten groups grows.
//       Demand this network cannot fill is a true fact about the network.
//   Seven of ten groups match. Three do not, and that is the point.
//
// ⚠️ PRICES ARE MOSTLY NULL, AND THAT IS A DECISION.
//   `priceMin`/`priceMax` are optional in models/Requirement.js because a
//   buyer naming one figure is really naming a ceiling. Here they are left
//   null for every crop but onion, because scripts/seedFpoListings.js prices
//   every seeded lot from ONE generic ₹18–29/kg profile regardless of crop.
//   Quoting a real Maharashtra band beside that stock would make one of the
//   two numbers a lie — a ₹3.40/kg sugarcane want against ₹22/kg seeded cane
//   is not a demo, it is a contradiction on screen. Onion keeps a band because
//   ₹13–19/kg is both real and already what seedDemoData.js claims.
//
// EVERY ROW IS LABELLED. The tag lives in `notes`, which is a field a buyer
// actually reads, so illustrative demand can never be mistaken for a real
// purchase order — the same discipline as Warehouse.dataSource:
// 'seed_illustrative' and the FPO_DEMO_LISTING tag in seedFpoListings.js.
//
// Idempotent: re-running REPLACES this script's own rows (matched on the tag)
// rather than stacking duplicates. It never touches a Requirement it did not
// write — including seedDemoData.js's one onion want, which stays.
//
// USAGE (from backend/)
//   node scripts/seedBuyerRequirements.js               # all of them
//   node scripts/seedBuyerRequirements.js --only=onion_lasalgaon
//   node scripts/seedBuyerRequirements.js --purge       # remove and stop
//   node scripts/seedBuyerRequirements.js --report      # match report only
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

const User = require('../models/User');
const Fpo = require('../models/Fpo');
const CropListing = require('../models/CropListing');
const Requirement = require('../models/Requirement');
const { toLatLng } = require('../services/geoService');
const {
  matchRequirementsForPoints, REQUIREMENT_WINDOW_DAYS,
} = require('../routes/requirements');

const TAG = 'BUYER_DEMAND_DEMO';
const NOTE_SUFFIX =
  `${TAG} — illustrative demo demand, not a real purchase order. `
  + 'A requirement is an advertised intent: nothing is reserved and responding to it is not a sale.';

/**
 * WHO IS BUYING.
 *
 * The three registered demo buyer accounts from scripts/seedDemoData.js, by
 * email. This script does NOT create accounts: authentication is Firebase and
 * this backend holds no service-account credential (same wall seedDemoData.js
 * hits, and the reason bulkCreateFpoDemoAccounts.js exists as a separate
 * step). A User row with no login behind it is a document nobody can sign in
 * as, which would make half the demo unreachable.
 *
 * So a buyer that is not registered is SKIPPED LOUDLY, and its wants are
 * skipped with it — never quietly reassigned to a different company.
 */
const BUYERS = {
  balaji:   { email: 'balaji@demo.in',       label: 'Shri Balaji Traders, Nashik' },
  sahyadri: { email: 'sahyadri@demo.in',     label: 'Sahyadri Foods, Pune' },
  vashi:    { email: 'mumbaimandi@demo.in',  label: 'Vashi Wholesale, Navi Mumbai' },
};

/**
 * THE WANTS.
 *
 * `commodity` must be the crop name EXACTLY as the listings carry it —
 * matching is a string equality against `CropListing.cropName`, so
 * "Orange" would silently match nothing where the stock says
 * "Orange (Nagpur Santra)". These names were read out of the live listings.
 *
 * `expect` is not stored. It records which seeded group this want was WRITTEN
 * FOR, so the match report at the end of this script can say plainly whether
 * the plan did what it claimed — and so a deliberate non-match reads as a
 * decision rather than as a radius somebody got wrong.
 */
const REQUIREMENTS = [
  {
    key: 'onion_lasalgaon',
    buyer: 'balaji',
    commodity: 'Onion',
    quantityKg: 8000,
    minGrade: null,
    // The one real band on this list — see the header. Lasalgaon is the
    // benchmark onion market for the whole country.
    priceMin: 13,
    priceMax: 19,
    deliverBy: 12,
    deliveryPoint: { lat: 20.1417, lng: 74.2417, label: 'Lasalgaon APMC', district: 'Nashik' },
    radiusKm: 60,
    notes: 'Steady weekly requirement for the Lasalgaon yard. Loading from the farm gate is fine.',
    expect: ['Nehrai Farmer Producer Company Limited'],
  },
  {
    key: 'onion_vashi',
    buyer: 'vashi',
    commodity: 'Onion',
    quantityKg: 20000,
    // A wholesaler grading up. Ungraded lots are deliberately NOT excluded by
    // the matcher (most listings carry no grade) — see routes/requirements.js.
    minGrade: 'B',
    priceMin: null,
    priceMax: null,
    deliverBy: 15,
    deliveryPoint: { lat: 19.0760, lng: 73.0169, label: 'Vashi APMC, Navi Mumbai', district: 'Thane' },
    radiusKm: 150,
    notes: 'Bulk lot for the Vashi wholesale market. Second buyer for the Nashik belt, on purpose — '
      + 'a group with two interested buyers is what the demand signal is supposed to be able to say.',
    expect: ['Nehrai Farmer Producer Company Limited'],
  },
  {
    key: 'grapes_pune',
    buyer: 'sahyadri',
    commodity: 'Grapes',
    quantityKg: 6000,
    minGrade: null,
    priceMin: null,
    priceMax: null,
    deliverBy: 10,
    deliveryPoint: { lat: 18.4926, lng: 73.8567, label: 'Pune Market Yard, Gultekdi', district: 'Pune' },
    // TIGHT ON PURPOSE. Table grapes travel badly and a Pune buyer means Pune.
    // Sangli's grape group is 190 km away and is correctly NOT shown this.
    radiusKm: 40,
    notes: 'Table grapes for the Gultekdi yard, collected same day.',
    expect: ['Purandar Agrostar Farmer Producer Company Limited'],
  },
  {
    key: 'soyabean_latur',
    buyer: 'sahyadri',
    commodity: 'Soyabean',
    quantityKg: 15000,
    minGrade: null,
    priceMin: null,
    priceMax: null,
    deliverBy: 18,
    deliveryPoint: { lat: 18.4088, lng: 76.5604, label: 'Latur APMC', district: 'Latur' },
    radiusKm: 60,
    notes: 'For the crushing unit. Delivery into the Latur yard.',
    expect: ['Dattasai Farmer Producer Company Limited'],
  },
  {
    key: 'cotton_amravati',
    buyer: 'vashi',
    commodity: 'Cotton',
    quantityKg: 12000,
    minGrade: null,
    priceMin: null,
    priceMax: null,
    deliverBy: 20,
    deliveryPoint: { lat: 20.9320, lng: 77.7523, label: 'Amravati ginning yard', district: 'Amravati' },
    radiusKm: 80,
    notes: 'Kapas for ginning. Amravati and Achalpur side only.',
    // Ajantha Khore also grows cotton, at Phulambri, 282 km away. It is NOT
    // expected to match, and that is the radius doing its job.
    expect: ['Ellichpura Satpuda Farmer Producer Company Limited'],
  },
  {
    key: 'sugarcane_kagal',
    buyer: 'sahyadri',
    commodity: 'Sugarcane',
    quantityKg: 40000,
    minGrade: null,
    priceMin: null,
    priceMax: null,
    deliverBy: 21,
    deliveryPoint: { lat: 16.5772, lng: 74.3163, label: 'Kagal jaggery unit', district: 'Kolhapur' },
    radiusKm: 40,
    notes: 'Cane for a gur unit — a real alternative to a mill contract for growers who want one.',
    expect: ['Naturenest Farmer Producer Company Limited'],
  },
  {
    key: 'mango_vashi',
    buyer: 'vashi',
    commodity: 'Mango (Alphonso/Hapus)',
    quantityKg: 3000,
    // Export-grade only. Ungraded lots still appear, by design.
    minGrade: 'A',
    priceMin: null,
    priceMax: null,
    deliverBy: 8,
    deliveryPoint: { lat: 19.0760, lng: 73.0169, label: 'Vashi APMC, Navi Mumbai', district: 'Thane' },
    // WIDE ON PURPOSE, and it is not a fudge: the Konkan-to-Vashi Alphonso run
    // really is a 230 km overnight haul, and pretending a Ratnagiri grower has
    // a buyer next door would be the fiction.
    radiusKm: 250,
    notes: 'Hapus for the Vashi market. Overnight run from the Konkan is expected and priced in.',
    expect: ['Vilye Farmer Producer Company Limited'],
  },
  {
    key: 'jowar_barshi',
    buyer: 'balaji',
    commodity: 'Jowar (Sorghum)',
    quantityKg: 10000,
    minGrade: null,
    priceMin: null,
    priceMax: null,
    deliverBy: 20,
    deliveryPoint: { lat: 18.2333, lng: 75.6900, label: 'Barshi flour mill', district: 'Solapur' },
    radiusKm: 80,
    notes: 'Milling jowar. Solapur district collection.',
    expect: ['Angarsiddha Agro Producer Company Limited'],
  },

  // ── THE TWO THAT ARE MEANT TO FIND NOBODY ────────────────────────────────
  {
    key: 'orange_vashi',
    buyer: 'vashi',
    commodity: 'Orange (Nagpur Santra)',
    quantityKg: 12000,
    minGrade: null,
    priceMin: null,
    priceMax: null,
    deliverBy: 18,
    deliveryPoint: { lat: 19.0760, lng: 73.0169, label: 'Vashi APMC, Navi Mumbai', district: 'Thane' },
    radiusKm: 250,
    notes: 'Santra for the Mumbai market. Sourcing within reach of Vashi only.',
    // Ramtek is ~660 km out. REAL DEMAND, GENUINELY OUT OF REACH — which is
    // the actual position of an orange grower in Vidarbha and should not be
    // papered over by widening a radius until it matches.
    expect: [],
  },
  {
    key: 'pomegranate_solapur',
    buyer: 'sahyadri',
    commodity: 'Pomegranate',
    quantityKg: 4000,
    minGrade: null,
    priceMin: null,
    priceMax: null,
    deliverBy: 14,
    deliveryPoint: { lat: 17.6599, lng: 75.9064, label: 'Solapur APMC', district: 'Solapur' },
    radiusKm: 60,
    notes: 'Bhagwa for processing. Solapur belt.',
    // Not one of the ten groups grows pomegranate, though Solapur is the
    // district that famously does. Demand this network cannot fill is a true
    // fact about the network, and the Jowar group standing 0 km away must not
    // be shown it — which is the commodity rule doing its job on real data.
    expect: [],
  },
];

const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] || null;
const PURGE = process.argv.includes('--purge');
const REPORT_ONLY = process.argv.includes('--report');

/**
 * What each seeded FPO actually has on the market right now — read live, never
 * assumed. Mirrors the FPO dashboard's own inputs (routes/fpos.js §3): the
 * points are the members' listing coordinates and the crops are what those
 * listings say they are.
 */
async function fpoStock() {
  const fpos = await Fpo.find({ status: 'active' }).select('name district members').lean();
  const out = [];
  for (const f of fpos) {
    const uids = f.members
      .filter((m) => (m.status || 'active') === 'active')
      .map((m) => m.farmerUid);
    if (!uids.length) continue;
    const listings = await CropListing.find({ farmerUid: { $in: uids }, status: 'available' })
      .select('cropName quantityAvailableKg location').lean();
    const points = listings.map((l) => toLatLng(l.location)).filter(Boolean);
    if (!points.length) continue;
    const crops = [...new Set(listings.map((l) => l.cropName))];
    const kg = listings.reduce((a, l) => a + (l.quantityAvailableKg || 0), 0);
    out.push({ name: f.name, district: f.district, crops, points, listings: listings.length, kg });
  }
  return out;
}

/**
 * Run the app's OWN matcher over every seeded group and print what really
 * matched — not what the plan hoped for.
 *
 * Deliberately calls matchRequirementsForPoints() from routes/requirements.js
 * rather than re-deriving the rule here. A seeder that checked its own work
 * with its own copy of the matching logic would prove nothing about what a
 * farmer or an FPO admin is actually going to see.
 */
async function report(seededIds) {
  const stock = await fpoStock();
  const mine = new Set(seededIds.map(String));
  const byRequirement = new Map(REQUIREMENTS.map((r) => [r.key, []]));
  const keyById = new Map();
  const seeded = await Requirement.find({ _id: { $in: seededIds } }).select('commodity notes').lean();
  for (const s of seeded) {
    const k = REQUIREMENTS.find((r) => (s.notes || '').includes(`[${r.key}]`))?.key;
    if (k) keyById.set(String(s._id), k);
  }

  console.log('\n── what actually matched ────────────────────────────────────');
  for (const g of stock) {
    const matched = (await matchRequirementsForPoints(g.points, g.crops))
      .filter((r) => mine.has(String(r._id)));
    for (const m of matched) {
      const k = keyById.get(String(m._id));
      if (k) byRequirement.get(k).push(g.name);
    }
    const label = matched.length
      ? matched.map((m) => `${m.commodity} @${m.deliveryPoint.label} (${m.distanceKm} km)`).join(', ')
      : 'nothing — no buyer within reach wants what they grow';
    console.log(
      `  ${matched.length ? '✅' : '⬜'} ${g.name}\n`
      + `       ${g.district} · ${g.crops.join(', ')} · ${g.kg} kg on ${g.listings} listings\n`
      + `       → ${label}`
    );
  }

  console.log('\n── plan vs reality ──────────────────────────────────────────');
  let wrong = 0;
  for (const r of REQUIREMENTS) {
    const got = byRequirement.get(r.key) || [];
    const want = r.expect;
    const ok = got.length === want.length && want.every((w) => got.includes(w));
    if (!ok) wrong++;
    console.log(
      `  ${ok ? '✅' : '❌'} ${r.key.padEnd(22)} expected ${want.length ? want.join(', ') : 'NO match (deliberate)'}`
      + (ok ? '' : `\n       got: ${got.length ? got.join(', ') : 'nothing'}`)
    );
  }
  const reached = new Set([...byRequirement.values()].flat());
  console.log(
    `\n  ${reached.size} of ${stock.length} groups have a buyer within reach; `
    + `${stock.length - reached.size} honestly do not.`
  );
  if (wrong) console.log(`  ⚠️  ${wrong} requirement(s) did not do what the plan said. Check the radii above.`);
  return wrong;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  if (PURGE) {
    const r = await Requirement.deleteMany({ notes: new RegExp(TAG) });
    console.log(`🧹 removed ${r.deletedCount} illustrative buyer requirement(s).`);
    return mongoose.disconnect();
  }

  if (REPORT_ONLY) {
    const existing = await Requirement.find({ notes: new RegExp(TAG) }).select('_id').lean();
    if (!existing.length) console.log('⚠️  nothing seeded yet — run without --report first.');
    await report(existing.map((x) => x._id));
    return mongoose.disconnect();
  }

  // ── resolve the buyers ────────────────────────────────────────────────
  const buyers = {};
  for (const [key, b] of Object.entries(BUYERS)) {
    const u = await User.findOne({ email: b.email, role: 'vendor' })
      .select('firebaseUid name phone business verification').lean();
    if (u) buyers[key] = { ...b, user: u };
    else console.log(`⏭  ${b.label} (${b.email}) is not registered — its wants will be skipped.`);
  }
  if (!Object.keys(buyers).length) {
    console.error('❌ none of the demo buyer accounts are registered. Register them in the app first '
      + '(see scripts/seedDemoData.js), then re-run.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const targets = ONLY ? REQUIREMENTS.filter((r) => r.key === ONLY) : REQUIREMENTS;
  if (!targets.length) {
    console.error(`❌ no requirement matched --only=${ONLY}. Keys: ${REQUIREMENTS.map((r) => r.key).join(', ')}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // IDEMPOTENT BY TAG, and scoped to what is being re-seeded so --only does
  // not silently delete the other nine. Never touches a Requirement this
  // script did not write: BOTH conditions are required, so seedDemoData.js's
  // own onion want (no tag) and any real buyer's want survive untouched.
  const removed = await Requirement.deleteMany({
    $and: [
      { notes: new RegExp(TAG) },
      { notes: { $in: targets.map((t) => new RegExp(`\\[${t.key}\\]`)) } },
    ],
  });
  if (removed.deletedCount) console.log(`🧹 replaced ${removed.deletedCount} previously seeded want(s).`);

  const now = Date.now();
  const created = [];
  let skipped = 0;

  for (const r of targets) {
    const b = buyers[r.buyer];
    if (!b) { skipped++; continue; }
    const u = b.user;

    const doc = await Requirement.create({
      vendorUid: u.firebaseUid,
      vendorName: u.name,
      vendorCompany: u.business?.tradeName || u.name,
      vendorPhone: u.phone || '',
      // Snapshotted exactly as POST /api/requirements does — a farmer deciding
      // whether to harvest for this buyer is entitled to see their standing.
      vendorVerification: u.verification?.status || 'unverified',
      commodity: r.commodity,
      quantityKg: r.quantityKg,
      minGrade: r.minGrade,
      priceMin: r.priceMin,
      priceMax: r.priceMax,
      deliverBy: new Date(now + r.deliverBy * 86400000),
      deliveryPoint: r.deliveryPoint,
      radiusKm: r.radiusKm,
      // The key is in the note as well as the tag, so a row can be traced back
      // to the plan entry that wrote it without a second collection.
      notes: `${r.notes} [${r.key}] ${NOTE_SUFFIX}`,
      status: 'open',
      // Same window a posted requirement gets — read from the route, not
      // copied. See routes/requirements.js REQUIREMENT_WINDOW_DAYS.
      expiresAt: new Date(now + REQUIREMENT_WINDOW_DAYS * 86400000),
    });
    created.push(doc._id);
    console.log(
      `✅ ${r.key.padEnd(22)} ${u.name} wants ${r.quantityKg} kg ${r.commodity} `
      + `within ${r.radiusKm} km of ${r.deliveryPoint.label}`
    );
  }

  console.log(`\n── done ──\n   requirements created: ${created.length}   skipped (buyer not registered): ${skipped}`);

  const wrong = await report(created);

  console.log(
    '\n   Next: log in as an FPO admin to see the dashboard\'s buyer-demand section, or as one of '
    + 'its members for "buyers looking for your crop".'
  );
  await mongoose.disconnect();
  if (wrong) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((e) => { console.error('❌', e); process.exit(1); });
}

// Exported so scripts/testRequirements.js can assert THE PLAN — that these
// radii and commodities really do reach the groups they claim to and really do
// miss the ones they claim to miss — without depending on this seeder having
// been run against whatever is in Atlas today.
module.exports = { TAG, BUYERS, REQUIREMENTS, fpoStock };

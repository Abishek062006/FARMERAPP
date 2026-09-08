// STATEWIDE DEMO POPULATION — every district, with real Firebase logins.
//
//   node scripts/seedStatewide.js                # dry run, creates nothing
//   node scripts/seedStatewide.js --confirm      # build it
//   node scripts/seedStatewide.js --purge        # remove everything it made
//
// ═══ WHAT AND WHY ═════════════════════════════════════════════════════════
//
// Radius matching only means something if there is somebody to match. With 34
// captains in one corner of the state, "find a driver near this farm" answers
// "nobody" for most of Maharashtra. This puts real people in all 36 districts:
//
//   20 captains  × 36 = 720     so a pickup anywhere has drivers nearby
//   30 farmers   × 36 = 1,080   so a buyer anywhere has supply nearby
//    5 buyers    × 36 = 180     buyers are never FOUND by radius — they do the
//                               finding — so density buys nothing here
//   + every unclaimed SFAC FPO activated with a real admin account
//
// ═══ ⚠️ BULK IMPORT, NOT signUp ═══════════════════════════════════════════
//
// scripts/bulkCreateFpoDemoAccounts.js calls the signUp REST endpoint once per
// account at 1.5s spacing — 2,000 accounts would be an hour of continuous
// calls, and Firebase's anti-abuse triggers on VOLUME IN A WINDOW, not just on
// spacing. Tripping it throttles the whole PROJECT, so the 236 accounts that
// already work would stop working too.
//
// `auth().importUsers()` is the migration path and is not rate-limited the same
// way: 1,000 per call, passwords supplied as bcrypt hashes. It also lets this
// script CHOOSE THE UID, so the Firebase account and the Mongo profile match by
// construction instead of by a signUp round-trip.
//
// ⚠️ EVERY RECORD IS `demo_illustrative` AND `--purge` REMOVES ALL OF IT.
// These are synthetic people. The label is what stops a screen presenting them
// as real trading history.
require('dotenv').config({ path: __dirname + '/../.env' });
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const User = require('../models/User');
const CropListing = require('../models/CropListing');
const Crop = require('../models/Crop');
const Land = require('../models/Land');
const Fpo = require('../models/Fpo');
const FpoMaster = require('../models/FpoMaster');
const { MH_DISTRICT_CENTROIDS } = require('../data/districtCentroids');
const { CROPS } = require('../data/agroZones');

const KEY_PATH = '/Users/rsabishek/Desktop/farmerapp/fb-key.json';
const PASSWORD = 'FarmerApp2026!';
const DOMAIN = 'mh.farmerapp.demo';          // distinctive → purge is exact
const TAG = 'demo_illustrative';
const DRY = !process.argv.includes('--confirm') && !process.argv.includes('--purge');
const PURGE = process.argv.includes('--purge');

const CAPTAINS_PER_DISTRICT = 20;
const FARMERS_PER_DISTRICT = 30;
const BUYERS_PER_DISTRICT = 5;

// ── Name pools. Real Maharashtrian given names and surnames, combined
// deterministically so the same seed always produces the same person.
const FIRST_M = ['Ramesh','Sunil','Ganesh','Vishnu','Dattatray','Balasaheb','Namdev','Sopan','Shivaji','Prakash','Ravindra','Sanjay','Anil','Baban','Vijay','Ashok','Suresh','Bharat','Machindra','Eknath','Popat','Kailas','Tanaji','Arjun','Kishor','Pandurang','Gorakh','Nana','Ankush','Sagar','Rohit','Vishal','Ajit','Sharad','Mangesh','Nitin','Pravin','Yogesh','Hemant','Rahul'];
const FIRST_F = ['Sushila','Savita','Kavita','Rekha','Anita','Lata','Nirmala','Meena','Pratibha','Vaishali','Sunita','Kamal','Sharda','Sindhu','Mangala','Shobha','Asha','Jyoti','Manda','Chhaya'];
const SUR = ['Patil','Deshmukh','Jadhav','Shinde','Pawar','More','Kadam','Gaikwad','Chavan','Sathe','Thorat','Salunkhe','Nikam','Wagh','Kale','Bhosale','Mane','Waghmare','Ghadge','Rao','Shelke','Borse','Jagtap','Khedkar','Ingle','Pandit','Zambre','Lokhande','Sonawane','Bhagat'];
const FIRMS = ['Traders','Agro','Commodities','Fresh','Agri Mart','Produce','Exports','Foods','Agro Links','Trading Co'];
const FIRM_PRE = ['Balaji','Shree Ganesh','Jai Malhar','Sai Krupa','Venkatesh','Mauli','Ekvira','Siddhivinayak','Om Sai','Kisan','Sahyadri','Godavari','Panchganga','Vitthal','Nath','Deccan','Krishna Valley','Ajinkya','Samarth','Tulja Bhavani','Renuka','Shivneri','Bhairavnath','Anandi','Yashwant','Manjara','Purna','Satpuda','Konkan','Vidarbha'];
const VEHICLES = ['auto','tempo','truck'];
const SOILS = ['black','red','loamy','clay','alluvial'];

// Deterministic pseudo-random from a string seed — so a re-run produces the
// same people rather than a second, different population.
function rng(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}
const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
const between = (r, a, b) => Math.round(a + r() * (b - a));
// Scatter people around the district's anchor rather than stacking them all on
// one centroid — a district is ~100 km across and every captain sitting on the
// exact same point makes "nearest" meaningless.
const scatter = (v, r, km = 45) => v + (r() - 0.5) * (km / 111);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const key = require(KEY_PATH);
  initializeApp({ credential: cert(key) });
  const auth = getAuth();

  if (PURGE) {
    const rx = new RegExp(`@${DOMAIN.replace(/\./g, '\\.')}$`);
    const doomed = await User.find({ email: rx }).select('firebaseUid').lean();
    const uids = doomed.map((u) => u.firebaseUid);
    console.log(`purging ${uids.length} seeded account(s)…`);
    for (let i = 0; i < uids.length; i += 1000) {
      const r = await auth.deleteUsers(uids.slice(i, i + 1000));
      console.log(`  firebase: -${r.successCount}`);
    }
    const [l, c, la, u, f] = await Promise.all([
      CropListing.deleteMany({ farmerUid: { $in: uids } }),
      Crop.deleteMany({ firebaseUid: { $in: uids } }),
      Land.deleteMany({ firebaseUid: { $in: uids } }),
      User.deleteMany({ email: rx }),
      Fpo.deleteMany({ dataSource: TAG, adminUid: { $in: uids } }),
    ]);
    console.log(`  mongo: -${u.deletedCount} users, -${l.deletedCount} listings, -${c.deletedCount} crops, -${la.deletedCount} lands, -${f.deletedCount} fpos`);
    await mongoose.disconnect(); return;
  }

  const districts = MH_DISTRICT_CENTROIDS;
  console.log(`\n🗺️  ${districts.length} districts`);

  // ── 1. BUILD THE ROSTER (deterministic, in memory) ──────────────────────
  const people = [];
  const addPerson = (role, district, n, extra = {}) => {
    const seed = `${role}:${district}:${n}`;
    const r = rng(seed);
    const female = role === 'farmer' && r() < 0.35;
    const name = `${pick(female ? FIRST_F : FIRST_M, r)} ${pick(SUR, r)}`;
    const slug = `${role}.${district.toLowerCase().replace(/[^a-z]/g, '')}.${n}`;
    const d = districts.find((x) => x.district === district);
    people.push({
      role, district, name, seed, r,
      uid: `mh_${role}_${district.toLowerCase().replace(/[^a-z]/g, '')}_${n}`,
      email: `${slug}@${DOMAIN}`,
      phone: `9${between(r, 300000000, 999999999)}`,
      lat: scatter(d.lat, r), lng: scatter(d.lng, r),
      ...extra,
    });
  };

  for (const d of districts) {
    for (let i = 1; i <= CAPTAINS_PER_DISTRICT; i++) addPerson('captain', d.district, i);
    for (let i = 1; i <= FARMERS_PER_DISTRICT; i++) addPerson('farmer', d.district, i);
    for (let i = 1; i <= BUYERS_PER_DISTRICT; i++) addPerson('buyer', d.district, i);
  }
  // Give the role-specific bits their own deterministic draw.
  people.forEach((p, i) => {
    const r = rng(p.seed + ':x');
    if (p.role === 'captain') {
      p.vehicle = { type: pick(VEHICLES, r), number: `MH ${between(r, 10, 50)} ${String.fromCharCode(65 + i % 26)}${String.fromCharCode(65 + (i * 7) % 26)} ${between(r, 1000, 9999)}` };
      p.isOnline = r() < 0.7;
    }
    if (p.role === 'buyer') p.firm = `${pick(FIRM_PRE, r)} ${pick(FIRMS, r)}`;
    if (p.role === 'farmer') { p.soil = pick(SOILS, r); p.acres = between(r, 1, 8); }
  });

  // ── 2. UNCLAIMED FPOs, ONE ADMIN EACH ───────────────────────────────────
  const unclaimed = await FpoMaster.find({ claimStatus: { $ne: 'approved' } })
    .select('fpoName district block registrationNo').lean();
  const fpoAdmins = unclaimed.map((m, i) => {
    const r = rng(`fpoadmin:${m._id}`);
    const d = districts.find((x) => x.district === m.district) || districts[0];
    return {
      role: 'fpoadmin', master: m, district: m.district, name: `${pick(FIRST_M, r)} ${pick(SUR, r)}`,
      uid: `mh_fpoadmin_${String(m._id).slice(-12)}`,
      email: `fpo.${String(i + 1).padStart(3, '0')}@${DOMAIN}`,
      phone: `9${between(r, 300000000, 999999999)}`,
      lat: scatter(d.lat, r, 20), lng: scatter(d.lng, r, 20),
    };
  });

  const all = [...people, ...fpoAdmins];
  const counts = all.reduce((a, p) => ({ ...a, [p.role]: (a[p.role] || 0) + 1 }), {});
  console.log('roster:', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '), `→ ${all.length} accounts`);

  if (DRY) {
    console.log('\n(dry run) nothing created. Sample:');
    ['captain', 'farmer', 'buyer', 'fpoadmin'].forEach((role) => {
      const s = all.find((p) => p.role === role);
      console.log(`  ${role.padEnd(9)} ${s.email.padEnd(38)} ${s.name.padEnd(22)} ${s.district}`);
    });
    console.log(`\nFPOs to activate: ${unclaimed.length}`);
    console.log(`Listings to create: ~${people.filter((p) => p.role === 'farmer').length}`);
    console.log('\nRun with --confirm.\n');
    await mongoose.disconnect(); return;
  }

  // ── 3. FIREBASE BULK IMPORT ─────────────────────────────────────────────
  console.log('\n🔐 importing to Firebase (1,000 per call, no signUp rate limit)…');
  const hash = bcrypt.hashSync(PASSWORD, 10);   // one hash, reused — same password for every demo login
  let ok = 0, failed = 0;
  for (let i = 0; i < all.length; i += 1000) {
    const batch = all.slice(i, i + 1000).map((p) => ({
      uid: p.uid, email: p.email, displayName: p.name, passwordHash: Buffer.from(hash),
    }));
    const res = await auth.importUsers(batch, { hash: { algorithm: 'BCRYPT' } });
    ok += res.successCount; failed += res.failureCount;
    res.errors.slice(0, 3).forEach((e) => console.log('   err:', e.error.message));
    console.log(`   batch ${i / 1000 + 1}: +${res.successCount} (${res.failureCount} failed)`);
  }
  console.log(`   total: ${ok} imported, ${failed} failed`);

  // ── 4. MONGO PROFILES ───────────────────────────────────────────────────
  console.log('👤 writing profiles…');
  const roleOf = { captain: 'agent', farmer: 'farmer', buyer: 'vendor', fpoadmin: 'fpo' };
  await User.bulkWrite(all.map((p) => ({
    updateOne: {
      filter: { firebaseUid: p.uid },
      update: {
        $set: {
          firebaseUid: p.uid, name: p.name, email: p.email, phone: p.phone, role: roleOf[p.role],
          location: { city: p.district, district: p.district, state: 'Maharashtra', coordinates: { lat: p.lat, lng: p.lng } },
          // ⚠️ [lng, lat] — GeoJSON order, the reverse of everywhere else here.
          geo: { type: 'Point', coordinates: [p.lng, p.lat] },
          ...(p.vehicle ? { vehicle: p.vehicle, isOnline: p.isOnline } : {}),
          ...(p.firm ? { business: { tradeName: p.firm }, verification: { status: 'documents_submitted' } } : {}),
        },
      },
      upsert: true,
    },
  })), { ordered: false });
  console.log(`   ${all.length} profiles`);

  // ── 5. ACTIVATE THE FPOs ────────────────────────────────────────────────
  console.log('🏢 activating FPOs from the SFAC registry…');
  const fpoDocs = fpoAdmins.map((a) => ({
    name: a.master.fpoName, regNumber: a.master.registrationNo,
    district: a.master.district, village: a.master.block,
    adminUid: a.uid, adminName: a.name,
    members: [], status: 'active', dataSource: TAG,
  }));
  const madeFpos = await Fpo.insertMany(fpoDocs, { ordered: false }).catch((e) => e.insertedDocs || []);
  await FpoMaster.bulkWrite(fpoAdmins.map((a, i) => ({
    updateOne: { filter: { _id: a.master._id }, update: { $set: { claimStatus: 'approved', claimedByUid: a.uid, linkedFpoId: madeFpos[i] && madeFpos[i]._id } } },
  })), { ordered: false });
  console.log(`   ${madeFpos.length} FPOs now active`);

  // ── 6. SUPPLY: land, crop and a listing per farmer ──────────────────────
  console.log('🌾 creating supply…');
  const farmers = people.filter((p) => p.role === 'farmer');
  const lands = [], crops = [], listings = [];
  for (const f of farmers) {
    const r = rng(f.seed + ':farm');
    const def = pick(CROPS, r);
    const landId = new mongoose.Types.ObjectId();
    const cropId = new mongoose.Types.ObjectId();
    lands.push({ _id: landId, firebaseUid: f.uid, name: `${f.name.split(' ')[0]}'s field`,
      size: { value: f.acres, unit: 'acres' }, soilType: f.soil, isActive: true,
      location: { city: f.district, district: f.district, state: 'Maharashtra', coordinates: { lat: f.lat, lng: f.lng } } });
    crops.push({ _id: cropId, firebaseUid: f.uid, landId, name: def.name, localName: def.localName,
      plantingDate: new Date(Date.now() - between(r, 40, 130) * 86400e3), duration: def.duration || 120,
      quantity: between(r, 400, 4000), unit: 'kg', isHarvested: false });
    const qty = between(r, 200, 2500);
    listings.push({ cropId, farmerUid: f.uid, farmerName: f.name, farmerPhone: f.phone,
      cropName: def.name, cropLocalName: def.localName,
      quantityKg: qty, quantityAvailableKg: qty, minOrderKg: between(r, 25, 150),
      pricePerKg: between(r, 12, 60), status: 'available', dataSource: TAG,
      grade: r() < 0.45 ? { code: pick(['A', 'B', 'C'], r), selfDeclared: true } : undefined,
      location: { city: f.district, district: f.district, state: 'Maharashtra', lat: f.lat, lng: f.lng },
      geo: { type: 'Point', coordinates: [f.lng, f.lat] },
      notes: 'Illustrative demo stock, not a real harvest' });
  }
  await Land.insertMany(lands, { ordered: false }).catch(() => {});
  await Crop.insertMany(crops, { ordered: false }).catch(() => {});
  await CropListing.insertMany(listings, { ordered: false }).catch(() => {});
  console.log(`   ${lands.length} lands, ${crops.length} crops, ${listings.length} listings`);

  // ── 7. THE GEO INDEXES ──────────────────────────────────────────────────
  await User.syncIndexes().catch((e) => console.log('   user index:', e.message));
  await CropListing.syncIndexes().catch((e) => console.log('   listing index:', e.message));
  console.log('🧭 2dsphere indexes synced');

  // ── 8. CSV ──────────────────────────────────────────────────────────────
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['email', 'password', 'role', 'name', 'mobile', 'district', 'detail'].join(',')];
  for (const p of all) {
    rows.push([p.email, PASSWORD, p.role, p.name, p.phone, p.district,
      p.vehicle ? `${p.vehicle.type} ${p.vehicle.number}` : p.firm || (p.master ? p.master.fpoName : '')].map(esc).join(','));
  }
  const out = path.join(os.homedir(), 'Documents', 'farmerapp_statewide_logins.csv');
  fs.writeFileSync(out, rows.join('\n') + '\n', 'utf8');
  console.log(`\n📄 ${out}  (${all.length} logins, password ${PASSWORD})\n`);
  await mongoose.disconnect();
})().catch(async (e) => { console.error('💥', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });

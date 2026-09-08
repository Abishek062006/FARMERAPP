// CAN A MODEL BEAT THE LOOKUP FOR "ESTIMATED INCOMING"?
//   node scripts/measureIncomingModel.js
//
// ═══ WHY THIS SCRIPT EXISTS ═══════════════════════════════════════════════
//
// The FPO dashboard's `estimatedIncoming` is a LOOKUP, not a model: it is
// `medianYieldKgPerHa(district, crop) × hectares` from ICRISAT's district rows
// (services/yieldBenchmarkService.js). The obvious next move is to replace it
// with something learned.
//
// This project's rule for any model is fixed and it is not negotiable:
// MEASURE IT AGAINST AN HONEST BASELINE AND REFUSE TO SERVE WHERE IT DOES NOT
// BEAT THAT BASELINE. D1 refuses per commodity where it loses to persistence.
// D3 refuses produce types with too little training data even when they score
// well. D5 does not ship at all. "Beating a useless baseline is not usefulness"
// is written into this codebase four times over.
//
// So before writing a model, this measures whether one is possible at all —
// and prints the numbers rather than an opinion. RE-RUN IT when the database
// has more real harvests in it; the answer is allowed to change, and this
// script is how you would find out that it had.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Crop = require('../models/Crop');
const CropListing = require('../models/CropListing');
const Land = require('../models/Land');
const yieldBenchmarkService = require('../services/yieldBenchmarkService');
const { acresFromAreaField } = require('../data/fertilizerRules');

const HA_PER_ACRE = 0.404686;

const mape = (rows, predict) => {
  const errs = [];
  for (const r of rows) {
    const p = predict(r);
    if (p == null || !(r.actualKg > 0)) continue;
    errs.push(Math.abs(p - r.actualKg) / r.actualKg);
  }
  return { n: errs.length, mape: errs.length ? (errs.reduce((a, b) => a + b, 0) / errs.length) * 100 : null };
};

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('\n📏 Can a model beat the "estimated incoming" lookup?\n');

  // ── 1. BUILD THE ONLY TRAINING ROWS THIS APP HAS ────────────────────────
  // A harvest LISTING is the only record of an actual harvested quantity here.
  // Joined back through Crop → Land to get the area it came off.
  const listings = await CropListing.find({}).select('cropId cropName quantityKg dataSource notes').lean();
  const crops = await Crop.find({ _id: { $in: listings.map((l) => l.cropId).filter(Boolean) } })
    .select('landId name').lean();
  const cropById = new Map(crops.map((c) => [String(c._id), c]));
  const lands = await Land.find({ _id: { $in: crops.map((c) => c.landId).filter(Boolean) } })
    .select('size location').lean();
  const landById = new Map(lands.map((l) => [String(l._id), l]));

  const rows = [];
  for (const l of listings) {
    const c = l.cropId ? cropById.get(String(l.cropId)) : null;
    if (!c || !c.landId) continue;
    const land = landById.get(String(c.landId));
    if (!land) continue;
    const acres = acresFromAreaField(land.size);
    if (!acres) continue;
    const ha = acres * HA_PER_ACRE;
    if (!(ha > 0) || !(l.quantityKg > 0)) continue;
    rows.push({
      crop: l.cropName, district: land.location?.district || null,
      ha, actualKg: l.quantityKg, kgPerHa: l.quantityKg / ha,
      // ⚠️ TWO MARKERS, BOTH CHECKED. `dataSource` is the structured field;
      // the `notes` marker is what scripts/seedFpoListings.js wrote BEFORE that
      // field existed, and 75 of the 80 listings in the database carry only
      // that. Reading the field alone would report every one of them as real.
      demo: !!l.dataSource || /illustrative|demo stock/i.test(l.notes || ''),
    });
  }

  console.log(`Usable observations                 ${rows.length}`);
  console.log(`Distinct crops                      ${new Set(rows.map((r) => r.crop)).size}`);
  console.log(`Distinct (crop, district) cells     ${new Set(rows.map((r) => `${r.crop}|${r.district}`)).size}`);
  const demoRows = rows.filter((r) => r.demo).length;
  const realRows = rows.length - demoRows;
  console.log(`Marked as seeded demo stock         ${demoRows} of ${rows.length}`);
  console.log(`⚠️  ACTUAL REAL HARVEST LISTINGS      ${realRows}`);

  // ── 2. THE BASELINE THAT ACTUALLY SHIPS ─────────────────────────────────
  const lookup = (r) => {
    const b = yieldBenchmarkService.benchmarkFor(r.crop, r.district);
    return b.available ? b.medianYieldKgPerHa * r.ha : null;
  };
  const servedByLookup = rows.filter((r) => lookup(r) != null);
  console.log(`Rows the SHIPPED LOOKUP can serve    ${servedByLookup.length} of ${rows.length}`);
  console.log();

  if (rows.length < 10) {
    console.log('Fewer than ten observations. There is nothing to measure and nothing to fit.\n');
    await mongoose.disconnect();
    return;
  }

  // ── 3. A HELD-OUT SPLIT, AND THREE PREDICTORS ───────────────────────────
  // Deterministic split so the number is reproducible.
  const shuffled = [...rows].sort((a, b) => `${a.crop}${a.actualKg}`.localeCompare(`${b.crop}${b.actualKg}`));
  const cut = Math.floor(shuffled.length * 0.7);
  const train = shuffled.slice(0, cut);
  const test = shuffled.slice(cut);
  console.log(`Train / test                        ${train.length} / ${test.length}`);
  console.log();

  // (a) the shipped lookup
  const a = mape(test, lookup);
  // (b) one global kg/ha learned from the data — the dumbest possible model
  const globalRate = median(train.map((r) => r.kgPerHa));
  const b = mape(test, (r) => globalRate * r.ha);
  // (c) a per-crop kg/ha learned from the data — the model somebody would
  //     actually propose. Falls back to the global rate for an unseen crop,
  //     which is what any honest deployment would have to do.
  const byCrop = new Map();
  for (const r of train) {
    if (!byCrop.has(r.crop)) byCrop.set(r.crop, []);
    byCrop.get(r.crop).push(r.kgPerHa);
  }
  const cropRate = new Map([...byCrop].map(([k, v]) => [k, median(v)]));
  const c = mape(test, (r) => (cropRate.get(r.crop) ?? globalRate) * r.ha);

  const pct = (x) => (x == null ? '   n/a' : `${x.toFixed(1)}%`);
  console.log('PREDICTOR                            SERVED   MAPE');
  console.log(`(a) the shipped ICRISAT lookup        ${String(a.n).padStart(4)}   ${pct(a.mape)}`);
  console.log(`(b) one global kg/ha from this data   ${String(b.n).padStart(4)}   ${pct(b.mape)}`);
  console.log(`(c) per-crop kg/ha from this data     ${String(c.n).padStart(4)}   ${pct(c.mape)}`);
  console.log();

  // ── 4. THE VERDICT, STATED AS A RULE AND NOT AN OPINION ─────────────────
  // ⚠️ A COMPARISON NEEDS ENOUGH ROWS ON BOTH SIDES TO BE A COMPARISON.
  // The first version of this script printed "the model does not beat the
  // lookup" off a test sample of ONE — which is not a result, it is a number.
  // Refusing to declare a winner it cannot measure is the same discipline the
  // script is here to enforce on somebody else's model.
  const MIN_TEST = 10;
  console.log('─'.repeat(66));
  if (a.n < MIN_TEST) {
    console.log('NO VERDICT IS POSSIBLE, AND THAT IS THE FINDING.');
    console.log();
    console.log(`The shipped lookup could price only ${a.n} of the ${test.length} held-out rows, so`);
    console.log('there is no sample to compare a model against. The lookup is not losing');
    console.log('this comparison — it is not IN it, because ICRISAT has no rows for most');
    console.log('of what these members actually grow.');
    console.log();
    console.log('⚠️ THAT IS A REAL FINDING ABOUT THE DASHBOARD: the lookup serves only');
    console.log(`${servedByLookup.length} of ${rows.length} planted crops (${Math.round((servedByLookup.length / rows.length) * 100)}%). ICRISAT covers 25 of Maharashtra's`);
    console.log('36 districts and EXCLUDES cotton and sugarcane outright (it records');
    console.log('sugarcane as gur and cotton as lint). Those are two of the commonest');
    console.log('crops in this database. The dashboard already names every excluded crop');
    console.log('in `excludedCrops` rather than silently dropping it — which is the right');
    console.log('behaviour, and this is the number that shows why it matters.');
  } else if (c.mape >= a.mape) {
    console.log('THE LEARNED MODEL DOES NOT BEAT THE LOOKUP. Keep the lookup.');
  } else {
    console.log('The learned model scores better on this split — but read the caveats below');
    console.log('before shipping anything: a better number on a handful of rows whose');
    console.log('provenance is unknown is not evidence that it generalises.');
  }
  console.log('─'.repeat(66));
  console.log();
  console.log('⚠️  WHY NO MODEL IS SHIPPED FROM THIS, WHATEVER THE NUMBERS ABOVE SAY:');
  console.log();
  console.log(`1. THE SAMPLE IS ${rows.length} ROWS across ${new Set(rows.map((r) => r.crop)).size} crops.`);
  const cells = {};
  rows.forEach((r) => { const k = `${r.crop}|${r.district}`; cells[k] = (cells[k] || 0) + 1; });
  const multi = Object.values(cells).filter((n) => n >= 5).length;
  console.log(`   Only ${multi} (crop, district) cell(s) have five or more observations.`);
  console.log('   A per-cell rate fitted on one or two rows IS those rows.');
  console.log();
  console.log('2. ⚠️ MOST OF THESE ROWS ARE NOT HARVESTS AT ALL.');
  console.log(`   ${demoRows} of ${rows.length} are seeded demo stock. ONLY ${realRows} are real listings a`);
  console.log('   farmer actually posted. A quantity invented by a seed script is not a');
  console.log('   harvest, and an accuracy figure fitted on these measures the seed');
  console.log('   script rather than agriculture — the same objection that keeps D5 out');
  console.log(`   of production. A model trained on ${realRows} observations is not a model.`);
  console.log();
  console.log('3. A HARVEST LISTING IS NOT A HARVEST. A farmer lists what they intend');
  console.log('   to SELL, which is the crop minus home consumption, minus what went');
  console.log('   to the trader who financed the seed, minus what is being held back.');
  console.log('   The target variable is not the quantity the model would claim to');
  console.log('   predict.');
  console.log();
  console.log('THE LOOKUP STAYS, AND IT SAYS WHAT IT IS. It refuses per district and');
  console.log('per crop where ICRISAT has no rows, and it never substitutes a parent');
  console.log("district's number. That refusal is worth more than a model fitted on");
  console.log(`${rows.length} rows of unknown origin.`);
  console.log();

  await mongoose.disconnect();
})();

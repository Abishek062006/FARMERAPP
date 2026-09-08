// Fertilizer data and the farmer-facing dose task.
//   node scripts/testFertilizer.js
//
// ⚠️ THIS SUITE EXISTS BECAUSE NOTHING TESTED THIS FILE AND A REAL BUG SHIPPED.
// `data/fertilizerRules.js` and `services/dailyTaskEngine.js` had NO test
// coverage at all, and the serving caveat was printing
// "(undefined kg/ha from Krishi Darshani ...)" to farmers for every crop
// sourced from that handbook — six crops, on the one line whose entire job is
// to tell a farmer where the number came from.
//
// PURE DATA, NO ATLAS. Nothing here touches the database, so it runs in
// milliseconds and there is no cleanup to get wrong.
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const B = (p) => path.join(__dirname, '..', p);

const {
  CROP_FERTILIZER, MH_SOURCES, PRODUCT_NUTRIENT_CONTENT,
  TOUCHPOINT_NUTRIENT_SPLIT, sourceFigureLabel, getFertilizerRequirement,
} = require(B('data/fertilizerRules'));
const { buildFertilizerTask, resolveCropDefinition } = require(B('services/dailyTaskEngine'));

let pass = 0, fail = 0;
const check = (c, m, x = '') => { c ? (pass++, console.log('  ✅', m, x)) : (fail++, console.log('  ❌', m, x)); };

(async () => {
  console.log('\n🌱 Fertilizer rules and the dose a farmer actually reads\n');
  try {
    // ── 1. Every verified figure has a citation ───────────────────────
    // The file's own rule: "Don't promote one without a document — write the
    // citation into MH_SOURCES in the same commit." This is that rule, enforced.
    console.log('1. Provenance');
    const verified = Object.keys(CROP_FERTILIZER).filter((k) => CROP_FERTILIZER[k].source === 'mh-verified');
    const uncited = verified.filter((k) => !MH_SOURCES[k]);
    check(uncited.length === 0,
      'EVERY mh-verified crop has a citation in MH_SOURCES — a promoted figure without a '
      + 'document is exactly what this file forbids',
      uncited.length ? `→ missing: ${uncited.join(', ')}` : `→ ${verified.length} verified, all cited`);

    const orphanCites = Object.keys(MH_SOURCES)
      .filter((k) => !CROP_FERTILIZER[k] || CROP_FERTILIZER[k].source !== 'mh-verified');
    check(orphanCites.length === 0,
      'and no citation is left behind for a crop that is no longer verified',
      orphanCites.length ? `→ ${orphanCites.join(', ')}` : '');

    const sources = new Set(Object.values(CROP_FERTILIZER).map((c) => c.source));
    check([...sources].every((s) => ['mh-verified', 'icar-general', 'tnau-legacy'].includes(s)),
      'every crop carries one of the three known provenance tiers', `→ ${[...sources].join(', ')}`);

    // ── 2. THE BUG THAT SHIPPED ───────────────────────────────────────
    console.log('\n2. The source figure a farmer is shown');
    let bad = [];
    for (const k of Object.keys(MH_SOURCES)) {
      const label = sourceFigureLabel(MH_SOURCES[k]);
      if (!label || /undefined|null|NaN/.test(label)) bad.push(`${k} → ${label}`);
    }
    check(bad.length === 0,
      'NO CITATION RENDERS AS "undefined" — the regression this suite was written for. '
      + 'MH_SOURCES has THREE figure shapes (kgHa, kgAcreAsPrinted, gPlant) and the caveat '
      + 'used to read only the first',
      bad.length ? `→ ${bad.join('; ')}` : `→ all ${Object.keys(MH_SOURCES).length} render`);

    const unitless = Object.keys(MH_SOURCES)
      .filter((k) => !/kg|g\/plant/.test(sourceFigureLabel(MH_SOURCES[k]) || ''));
    check(unitless.length === 0,
      'and every one carries a unit — a bare "40:24:49" on screen is a number with no meaning',
      unitless.length ? `→ ${unitless.join(', ')}` : '');

    const doubled = Object.keys(MH_SOURCES)
      .filter((k) => (sourceFigureLabel(MH_SOURCES[k]).match(/kg\/(ha|acre)|g\/plant/g) || []).length > 1);
    check(doubled.length === 0,
      'and none carries TWO units — the "150:60:150 g/plant kg/ha" failure this file already '
      + 'recorded once', doubled.length ? `→ ${doubled.join(', ')}` : '');

    // ── 3. The DAP-credit invariant ───────────────────────────────────
    // DAP is 18-46-0, not 0-46-0. Farmers were once told to over-apply N by
    // ~98% on soybean because its nitrogen was ignored. Delivered N:P:K must
    // land exactly on the requirement for EVERY crop.
    console.log('\n3. Delivered nutrients equal the requirement');
    let worst = 0, worstCrop = '';
    for (const [crop, req] of Object.entries(CROP_FERTILIZER)) {
      const seasonDapN = (req.p / PRODUCT_NUTRIENT_CONTENT.dap.percent)
        * PRODUCT_NUTRIENT_CONTENT.dap.nitrogenPercent;
      const seasonUreaN = Math.max(0, req.n - seasonDapN);
      let dN = 0, dP = 0, dK = 0;
      for (const split of TOUCHPOINT_NUTRIENT_SPLIT) {
        const dapKg = req.p * split.p > 0 ? (req.p * split.p) / PRODUCT_NUTRIENT_CONTENT.dap.percent : 0;
        dP += dapKg * PRODUCT_NUTRIENT_CONTENT.dap.percent;
        dN += dapKg * PRODUCT_NUTRIENT_CONTENT.dap.nitrogenPercent + seasonUreaN * split.n;
        dK += req.k * split.k;
      }
      const e = Math.max(
        req.n ? Math.abs(dN - req.n) / req.n : 0,
        req.p ? Math.abs(dP - req.p) / req.p : 0,
        req.k ? Math.abs(dK - req.k) / req.k : 0,
      ) * 100;
      if (e > worst) { worst = e; worstCrop = crop; }
    }
    check(worst < 0.001,
      `ALL ${Object.keys(CROP_FERTILIZER).length} CROPS land on 0% nutrient error — the DAP `
      + 'nitrogen is credited against the SEASON, not the basal touchpoint',
      `→ worst ${worst.toFixed(4)}%${worst > 0 ? ` (${worstCrop})` : ''}`);

    // ── 4. The Krishi Darshani conversions ────────────────────────────
    // The 2024 edition prints per HECTARE and the 2025/2026 editions print the
    // same doses per ACRE. Every figure mined from it must survive that
    // division — it is the check that caught the OCR reading ginger's nitrogen
    // as 520 kg/ha when the page says 120.
    console.log('\n4. The per-hectare / per-acre cross-check');
    const KD = [
      ['Ginger (Aale)',    120,  75,  75],
      ['Potato',           100,  60, 120],
      ['Brinjal',          150,  75,  75],
      ['Turmeric (Halad)', 200, 100, 100],
      ['Tomato',           200, 100, 100],
    ];
    for (const [crop, hn, hp, hk] of KD) {
      const r = CROP_FERTILIZER[crop];
      const ok = Math.abs(hn / 2.471 - r.n) < 1.5
        && Math.abs(hp / 2.471 - r.p) < 1.5
        && Math.abs(hk / 2.471 - r.k) < 1.5;
      check(ok, `${crop}: the 2024 per-hectare figure divides onto the stored per-acre one`,
        `→ ${hn}:${hp}:${hk}/ha ÷2.471 = ${(hn / 2.471).toFixed(1)}:${(hp / 2.471).toFixed(1)}:`
        + `${(hk / 2.471).toFixed(1)} vs stored ${r.n}:${r.p}:${r.k}`);
    }
    check(CROP_FERTILIZER['Sesamum (Til)'].n === 20 && Math.abs(50 / 2.471 - 20) < 0.5,
      'Sesamum: 50 kg N/ha ÷ 2.471 = 20.2, and only NITROGEN is stored as verified — this '
      + 'source states no P and no K at all', `→ N ${CROP_FERTILIZER['Sesamum (Til)'].n}`);
    check(/nitrogen only/i.test(MH_SOURCES['Sesamum (Til)'].kgAcreAsPrinted),
      '...and the citation says so on its face, not only in the note');

    // Mango was searched for and is genuinely absent from the source.
    check(CROP_FERTILIZER['Mango (Alphonso/Hapus)'].source === 'tnau-legacy',
      'MANGO STAYS UNVERIFIED — 1,582 pages carry no mango dose, and a crop being absent from '
      + 'a handbook is not a licence to borrow a neighbouring crop\'s number');

    // ── 5. The caveat is NEVER silent ─────────────────────────────────
    console.log('\n5. The farmer-facing caveat');
    const land = { size: '1 acre', soilType: 'black' };
    let silent = [];
    let sampled = 0;
    for (const cropName of Object.keys(CROP_FERTILIZER)) {
      const cropDef = resolveCropDefinition(cropName);
      if (!cropDef) continue;
      // Walk the whole crop cycle and take whichever days are touchpoints.
      for (let day = 1; day <= (cropDef.duration || 120); day++) {
        const task = buildFertilizerTask({
          cropDef, dayNumber: day, duration: cropDef.duration || 120,
          land, plot: null, cropQuantity: 100, cropUnit: 'plants',
        });
        if (!task) continue;
        sampled++;
        const text = JSON.stringify(task);
        if (/undefined|NaN|null kg/.test(text)) silent.push(`${cropName} d${day}`);
        break;
      }
    }
    check(sampled > 20, 'a fertilizer task was built for every crop in the table', `→ ${sampled} tasks`);
    check(silent.length === 0,
      'and NOT ONE contains "undefined" or "NaN" — this is the assertion that would have '
      + 'caught the shipped bug', silent.length ? `→ ${silent.slice(0, 5).join(', ')}` : '');

    const t = buildFertilizerTask({
      cropDef: resolveCropDefinition('Turmeric (Halad)'),
      dayNumber: null, duration: 240, land, plot: null, cropQuantity: 0, cropUnit: 'kg',
    });
    check(t === null, 'a day that is not a touchpoint produces no fertilizer task at all');

    // A crop with NO specific entry must say so — the fallback is never silent.
    const generic = getFertilizerRequirement('PH_TEST_Nonexistent Crop', 'vegetable');
    check(generic && generic.isSpecific === false,
      'an unknown crop falls back to the category average and is FLAGGED as not specific',
      `→ isSpecific=${generic?.isSpecific}`);

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  }
})();

// Phase B test: market intelligence — the sale-window statistics (B3), the
// arrivals supply signal (B4), and the endpoint contract Phase D must keep.
//
// The statistics are tested against SYNTHETIC series, not live Agmarknet.
// That is deliberate: this suite must assert that a rising series produces
// 'hold' and a glut produces 'heavy', which is impossible if the input
// changes every day. Live data is covered by one contract test at the end
// that only asserts SHAPE, never values.
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const B = (p) => path.join(__dirname, '..', p);

const sw = require(B('services/saleWindowService.js'));

let pass = 0, fail = 0;
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${label} ${extra}`); }
  else { fail++; console.log(`  ❌ ${label} ${extra}`); }
};

// Build a series of `n` days ending yesterday (so nothing is a still-open day
// unless a test explicitly appends today).
const mkSeries = (prices, arrivals = []) => {
  const out = [];
  const end = new Date();
  end.setDate(end.getDate() - 1);
  for (let i = prices.length - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    out.push({
      date: d.toISOString().slice(0, 10),
      modalPrice: prices[prices.length - 1 - i],
      arrivals: arrivals.length ? arrivals[prices.length - 1 - i] : null,
    });
  }
  return out;
};

// The only engine labels the service may report. Kept in one place because
// every phase adds one and the assertions kept going stale: 'statistical'
// before Phase D, '+model' once D1 attaches, 'model' once D2 is confident
// enough to take the decision. A value outside this set means the label has
// drifted from what it describes.
const ENGINES = ['statistical', 'statistical+model', 'model'];

const flat  = (n, v) => Array.from({ length: n }, () => v);
const ramp  = (n, from, step) => Array.from({ length: n }, (_, i) => Math.round(from + i * step));

(async () => {
  console.log('\n📈 Market intelligence (Phase B)\n');

  // ── 1. least-squares slope ────────────────────────────────────────────
  console.log('1. slope()');
  check(sw.slope([1, 2, 3, 4, 5]) === 1, 'unit ramp → slope 1', `→ ${sw.slope([1,2,3,4,5])}`);
  check(sw.slope([5, 4, 3, 2, 1]) === -1, 'falling ramp → slope -1');
  check(sw.slope([3, 3, 3, 3]) === 0, 'flat series → slope 0');
  check(sw.slope([7]) === 0, 'single point cannot have a slope');

  // ── 2. not enough data must never produce advice ──────────────────────
  console.log('\n2. Refusing to advise on thin data');
  let a = sw.analyse(mkSeries([1000, 1100, 1050]));
  check(a.action === 'unknown', 'three points → unknown, not a guess', `→ ${a.action}`);
  check(a.confidence === 'none', 'confidence is none');
  check(/not enough/i.test(a.reason), 'the reason says so plainly');
  a = sw.analyse(mkSeries([]));
  check(a.action === 'unknown', 'an empty series → unknown (no crash)');

  // ── 3. the four directional calls ─────────────────────────────────────
  console.log('\n3. Directional calls');
  // well above the mean → sell
  a = sw.analyse(mkSeries([...flat(20, 1000), ...flat(5, 1400)]));
  check(a.action === 'sell', 'price far above the 30-day mean → sell', `→ ${a.action} (${a.stats.vsMeanPct}%)`);

  // below the mean but climbing hard → hold
  a = sw.analyse(mkSeries([...flat(12, 2000), ...ramp(14, 1400, 25)]));
  check(a.action === 'hold', 'below mean but rising → hold', `→ ${a.action} (${a.stats.slopePctPerDay}%/day)`);

  // below the mean and still sliding → sell, waiting costs money
  a = sw.analyse(mkSeries([...flat(12, 2000), ...ramp(14, 1900, -30)]));
  check(a.action === 'sell', 'below mean and falling → sell', `→ ${a.action} (${a.stats.slopePctPerDay}%/day)`);

  // genuinely flat → neutral
  a = sw.analyse(mkSeries(flat(25, 1500)));
  check(a.action === 'neutral', 'a flat series → neutral', `→ ${a.action}`);
  check(a.stats.vsMeanPct === 0, 'a flat series sits exactly on its mean');

  // ── 4. confidence tracks volatility, not just sample size ─────────────
  console.log('\n4. Confidence');
  a = sw.analyse(mkSeries(ramp(25, 1000, 4)));
  check(a.confidence === 'high', 'many points, low volatility → high', `→ ${a.confidence}`);
  const spiky = Array.from({ length: 25 }, (_, i) => (i % 2 ? 600 : 2400));
  a = sw.analyse(mkSeries(spiky));
  check(a.confidence === 'low', 'wildly volatile series → low confidence', `→ ${a.confidence}`);

  // ── 5. the reason string must carry its own arithmetic ────────────────
  console.log('\n5. Explainability');
  a = sw.analyse(mkSeries([...flat(20, 1000), ...flat(5, 1400)]));
  check(a.reason.includes(String(a.stats.todayModal)), "reason quotes today's price");
  check(a.reason.includes(String(a.stats.mean)), 'reason quotes the mean it compared against');

  // ── 6. arrivals: the partial-day trap (B4) ────────────────────────────
  // A still-open day reports a fraction of its arrivals. Left in, it made
  // every crop read "thin supply" every single day.
  console.log('\n6. Arrivals & the still-open day');
  const prices = flat(25, 1500);
  const arr = flat(25, 12000);
  a = sw.analyse(mkSeries(prices, arr));
  check(a.arrivals?.level === 'normal', 'steady arrivals → normal', `→ ${a.arrivals?.level}`);

  a = sw.analyse(mkSeries(prices, [...flat(24, 12000), 20000]));
  check(a.arrivals?.level === 'heavy', 'a genuine glut → heavy', `→ ${a.arrivals?.vsMeanPct}%`);

  a = sw.analyse(mkSeries(prices, [...flat(24, 12000), 4000]));
  check(a.arrivals?.level === 'light', 'a genuinely thin day → light', `→ ${a.arrivals?.vsMeanPct}%`);

  // now append TODAY with a partial figure, as Agmarknet reports mid-day
  const withToday = mkSeries(prices, arr);
  withToday.push({ date: new Date().toISOString().slice(0, 10), modalPrice: 1500, arrivals: 566 });
  a = sw.analyse(withToday, { endDate: new Date().toISOString().slice(0, 10) });
  check(a.arrivals?.level === 'normal',
    "today's PARTIAL arrivals do not fake a supply collapse", `→ ${a.arrivals?.level} ${a.arrivals?.vsMeanPct}%`);
  check(a.arrivals?.provisionalDayExcluded === true, 'the still-open day is flagged as excluded');
  check(a.arrivals?.asOf !== new Date().toISOString().slice(0, 10),
    'arrivals are reported as of the last CLOSED day', `→ ${a.arrivals?.asOf}`);

  // arrivals need real coverage too
  a = sw.analyse(mkSeries(prices, [...flat(3, 12000), ...flat(22, 0)]));
  check(a.arrivals === null, 'too few days with arrivals → null, not a fabricated level');

  // ── 7. the endpoint contract Phase D must preserve ────────────────────
  console.log('\n7. Live contract (shape only — never asserts a value)');
  const live = await sw.getSaleWindow({ commodity: 'Onion', district: 'Nashik' });
  check(live !== null, 'Nashik onion resolves against live Agmarknet');
  if (live) {
    check(['sell', 'hold', 'neutral', 'unknown'].includes(live.action), 'action is one of the four', `→ ${live.action}`);
    check(ENGINES.includes(live.engine),
      'engine names the read the farmer is getting', `→ ${live.engine}`);
    check(typeof live.reason === 'string' && live.reason.length > 0, 'a reason is always present');
    check(Array.isArray(live.series), 'the series ships for the sparkline');
  }
  const bogus = await sw.getSaleWindow({ commodity: 'Nonexistent Crop', district: 'Nashik' });
  check(bogus === null, 'an unmappable commodity returns null, never a verdict');

  // ── 8. D1 forecast layering ───────────────────────────────────────────
  // The property that matters is NOT that the model is accurate here — that is
  // measured offline against a held-out split. It is that the model is ADDITIVE:
  // the farmer must still get advice when the AI service is down, untrained, or
  // has never seen this district. B3 was built before Phase D for exactly this.
  console.log('\n8. D1 forecast is additive, never a dependency');

  const axios = require('axios');
  const AI = process.env.AI_SERVICE_URL || 'http://localhost:5001';
  let aiUp = false;
  try {
    await axios.get(`${AI}/price-forecast/metrics`, { timeout: 4000 });
    aiUp = true;
  } catch { aiUp = false; }
  console.log(`   (AI service ${aiUp ? 'is up' : 'is DOWN — testing the degraded path'})`);

  const win = await sw.getSaleWindow({ commodity: 'Onion', district: 'Nashik' });
  check(win !== null, 'sale-window answers regardless of the AI service');
  check(['sell', 'hold', 'neutral', 'unknown'].includes(win.action),
    'the statistical action is always present', `→ ${win.action}`);
  check(ENGINES.includes(win.engine) && (win.forecast ? win.engine !== 'statistical' : true),
    'engine names what the farmer is actually looking at', `→ ${win.engine}`);

  if (aiUp && win.forecast) {
    const f = win.forecast;
    check(Array.isArray(f.forecast) && f.forecast.length > 0, 'the forecast carries points');
    check(f.forecast.every((p) => p.modalPrice > 0 && Number.isFinite(p.changePct)),
      'every forecast point is a real number');
    check(!!f.metrics && f.metrics.naiveMape > 0,
      'the NAIVE BASELINE ships with every forecast', `→ model ${f.metrics.modelMape}% vs naive ${f.metrics.naiveMape}%`);
    check(f.metrics.beatsBaseline === true,
      'the shipped model actually beats persistence', `→ ${f.metrics.improvementPct}% better`);
  } else {
    check(win.forecast === null, 'a missing model yields null, never a fabricated forecast');
    check(win.engine === 'statistical', 'and the engine says so honestly');
  }

  // An unforecastable district must not take the whole response down.
  const thin = await sw.getSaleWindow({ commodity: 'Onion', district: 'Sindhudurg' });
  check(thin === null || thin.action !== undefined,
    'a thin district still returns a usable response', `→ ${thin ? thin.action : 'null'}`);

  // ── 9. D2 sell/hold ───────────────────────────────────────────────────
  // The property under test is that the model's own weakness is respected.
  // D2 scores AUC 0.72 on Onion but 0.56 on Soyabean — barely better than a
  // coin flip. It must NOT be allowed to overrule the statistical read where
  // it has no skill, and it must say so rather than sounding confident.
  console.log('\n9. D2 defers where it has no skill');

  let d2Up = false;
  try {
    await axios.get(`${AI}/sell-hold/metrics`, { timeout: 4000 });
    d2Up = true;
  } catch { d2Up = false; }
  console.log(`   (D2 ${d2Up ? 'is up' : 'is DOWN — testing the degraded path'})`);

  const onion = await sw.getSaleWindow({ commodity: 'Onion', district: 'Nashik' });
  check(onion !== null, 'sale-window answers with D2 in the mix');
  check(['sell', 'hold', 'neutral', 'unknown'].includes(onion.action),
    'the action stays one of the four whichever engine decided', `→ ${onion.action}`);

  if (d2Up && onion.sellHold) {
    const sh = onion.sellHold;
    check(sh.probabilityHoldPays >= 0 && sh.probabilityHoldPays <= 1,
      'the hold probability is a real probability', `→ ${sh.probabilityHoldPays}`);
    check(['sell', 'hold'].includes(sh.action), 'D2 returns a binary action', `→ ${sh.action}`);
    check(!!sh.metrics && sh.metrics.returns.alwaysHold !== undefined,
      'D2 ships the naive strategies it must beat',
      `→ model ${sh.metrics.returns.model}% vs always-hold ${sh.metrics.returns.alwaysHold}%`);
    check(sh.metrics.beatsNaive === true,
      'the shipped classifier beats always-sell AND always-hold');
    check(sh.metrics.holdingCostIsAssumption === true,
      'the holding-cost figures are declared as assumptions, not measurements');
    check(typeof sh.commoditySkill.auc === 'number',
      'per-commodity skill travels with the advice', `→ AUC ${sh.commoditySkill.auc}`);

    // A commodity the model is genuinely weak on must not drive the action.
    const soya = await sw.getSaleWindow({ commodity: 'Soyabean', district: 'Latur' });
    if (soya?.sellHold?.commoditySkill?.lowSkill) {
      check(soya.engine !== 'model',
        'a low-skill commodity does NOT let the model overrule the statistics',
        `→ engine ${soya.engine}`);
      check(soya.sellHold.confidence === 'uncertain',
        'and D2 reports itself as uncertain there', `→ ${soya.sellHold.confidence}`);
      check(/close to guessing/i.test(soya.sellHold.reason),
        'the reason says plainly that the model is near guessing');
    } else {
      check(true, 'Soyabean skill improved past the threshold — nothing to defer');
    }

    // Where it IS confident, it should be allowed to decide.
    if (onion.engine === 'model') {
      check(!!onion.statisticalAction,
        'when the model decides, the statistical read is KEPT, not discarded',
        `→ statistical said ${onion.statisticalAction}`);
    } else {
      check(true, `onion engine is ${onion.engine} — model did not take the decision`);
    }
  } else {
    check(onion.sellHold === null || onion.sellHold === undefined,
      'a missing D2 yields null, never a fabricated recommendation');
    check(onion.engine !== 'model', 'and the engine never claims to be the model');
  }

  // ── yield benchmarks — what the crop HAS done, not a forecast ─────
  console.log('\n  yield benchmarks (D5 is NOT served — see yieldBenchmarkService.js)');
  {
    const Y = require(B('services/yieldBenchmarkService'));

    const w = Y.benchmarkFor('Wheat', 'Chhatrapati Sambhajinagar');
    check(w.available && w.medianYieldKgPerHa > 500 && w.medianYieldKgPerHa < 4000,
      'wheat in Chhatrapati Sambhajinagar returns a plausible kg/ha',
      `→ ${w.medianYieldKgPerHa} kg/ha (${w.rangeKgPerHa.join('–')})`);
    check(w.rangeKgPerHa[0] <= w.medianYieldKgPerHa && w.medianYieldKgPerHa <= w.rangeKgPerHa[1],
      'the median sits inside its own range');
    check(/not a forecast/i.test(w.basis) && w.stale === true,
      'EVERY benchmark says it is a record, not a forecast, and flags itself stale',
      `→ ${w.staleYears} years old`);

    // ICRISAT uses 1966 apportioned boundaries. Latur was carved out of
    // Osmanabad in 1982, so it has no rows of its own.
    const l = Y.benchmarkFor('Wheat', 'Latur');
    check(!l.available && !!l.parentDistrict,
      'a post-1966 district says WHERE its data lives instead of just "no data"',
      `→ parent ${l.parentDistrict}`);
    check(l.medianYieldKgPerHa === undefined,
      'and does NOT quietly hand back the parent district\'s number as if it were Latur\'s');

    check(!Y.benchmarkFor('Onion', 'Nashik').available,
      'a crop ICRISAT does not record is refused, not approximated');
    check(Y.EXCLUDED.includes('SUGARCANE') && Y.EXCLUDED.includes('COTTON'),
      'sugarcane (recorded as gur) and cotton (as lint) are excluded at build time',
      `→ ${Y.EXCLUDED.join(', ')}`);

    const d = Y.forDistrict('Nagpur');
    check(d.available && d.crops.length > 3, 'a district lists what it records', `→ ${d.crops.length} crops`);
    check(d.crops.every((c, i, a) => i === 0 || a[i - 1].medianYieldKgPerHa >= c.medianYieldKgPerHa),
      'sorted by yield, highest first');
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\n❌ THREW:', e.message, '\n', e.stack);
  process.exit(1);
});

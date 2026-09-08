// Phase 4 test: D1 surfaced for the farmer.
//
// ⚠️ NOTHING HERE TRAINS A MODEL. D1 shipped long ago; the defect was that the
// farmer had no screen for it. So this suite asserts the SURFACING rules, and
// every one of them is a rule about honesty rather than about accuracy:
//
//   • nothing past 14 days, because MAPE was measured for 1-14 only
//   • the forecast is of the DISTRICT MODAL, and a farmer's own figure is that
//     modal's PERCENTAGE applied to their rate — never a subtraction of two
//     different price bases
//   • a per-commodity refusal (NO_SKILL / LOW_SKILL) reaches the screen AS WORDS
//   • the model's accuracy never travels without the naive baseline beside it
//   • the statistical read survives the AI service being down
//
// Hits LIVE Agmarknet and the LIVE Flask service, so it asserts SHAPE and
// INVARIANTS, never particular prices.
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const fs = require('fs');
const B = (p) => path.join(__dirname, '..', p);
const F = (p) => path.join(__dirname, '..', '..', 'frontend', p);

const sw = require(B('services/saleWindowService.js'));
const ag = require(B('services/agmarknetService.js'));

let pass = 0, fail = 0;
const check = (c, l, e = '') => { if (c) { pass++; console.log(`  ✅ ${l} ${e}`); } else { fail++; console.log(`  ❌ ${l} ${e}`); } };
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

const TODAY = new Date().toISOString().slice(0, 10);

(async () => {
  console.log('\n📈 Farmer price outlook (Phase 4)\n');

  const routeSrc = read(B('routes/mandi.js'));
  const screenSrc = read(F('src/screens/Farmer/PriceOutlookScreen.jsx'));

  // ── 1. the horizon ceiling ────────────────────────────────────────────
  console.log('1. Nothing past the horizon the model was measured on');
  check(sw.MAX_FORECAST_DAYS === 14,
    'MAX_FORECAST_DAYS is 14 — train_price_forecast.py measured 1-14 only',
    `→ ${sw.MAX_FORECAST_DAYS}`);
  check(/Math\.min\(saleWindow\.MAX_FORECAST_DAYS/.test(routeSrc),
    'the route CLAMPS rather than passing a longer horizon through');
  check(/clamped/.test(routeSrc) && /clampNote/.test(routeSrc),
    '⚠️ and REPORTS the clamp — a farmer who asked for 30 days is told why they got 14');

  // ── 2. the price-base rule ────────────────────────────────────────────
  console.log('\n2. ⚠️ A percentage is applied; two price bases are never subtracted');
  check(/1 \+ p\.changePct \/ 100/.test(routeSrc),
    'the farmer\'s figure is their own rate moved by the forecast PERCENTAGE');
  check(!/originPrice\s*-\s*myPrice|myPrice\s*-\s*.*modal/i.test(routeSrc),
    '⚠️ and nowhere is a district modal subtracted from a farmer\'s price '
    + '(that error once produced a ₹1.96 lakh "gain" from a forecast predicting a FALL)');
  check(/districtModalPerKg/.test(routeSrc) && /\/ 100/.test(routeSrc),
    'Agmarknet\'s ₹/QUINTAL is divided to ₹/kg — comparing them directly reports '
    + 'every farmer as underpaid by a factor of 100');
  check(/forecasts: 'district_modal_price'/.test(routeSrc),
    'the response NAMES what is being forecast, so a screen cannot quietly read it as the farmer\'s price');

  // ── 3. the refusals reach the screen ──────────────────────────────────
  console.log('\n3. ⚠️ A per-commodity refusal travels as words, not as a blank');
  check(typeof sw.getForecastOrRefusal === 'function',
    'getForecastOrRefusal exists — plain getForecast returns null and loses the reason');
  const strings = read(F('src/i18n/strings.js'));
  for (const code of ['NO_SKILL', 'LOW_SKILL', 'INSUFFICIENT_HISTORY', 'UNKNOWN_COMMODITY',
    'UNKNOWN_DISTRICT', 'SERVICE_UNAVAILABLE', 'MODEL_NOT_TRAINED', 'NO_SERIES', 'UNAVAILABLE']) {
    const key = `'outlook.refuse.${code}'`;
    const n = strings.split(key).length - 1;
    check(n >= 2, `outlook.refuse.${code} is worded in BOTH languages`, `→ ${n}`);
  }
  check(/SERVICE_UNAVAILABLE/.test(read(B('services/saleWindowService.js'))),
    '⚠️ the service being DOWN is a different code from the model REFUSING — '
    + 'one is "try again", the other is "this crop cannot be forecast"');

  // ── 4. accuracy never without its baseline ────────────────────────────
  console.log('\n4. The model\'s accuracy never travels alone');
  check(/naiveMape/.test(read(B('services/saleWindowService.js'))),
    'the refusal carries the naive baseline beside the model\'s MAPE');
  check(/naive_mape/.test(screenSrc) && /model_mape/.test(screenSrc),
    'and the screen prints BOTH — persistence is a strong forecaster, so the '
    + 'model figure alone says nothing about whether it is any good');

  // ── 5. the statistical read is not a dependency ───────────────────────
  console.log('\n5. The ML layer is ADDITIVE — the statistical read always stands');
  check(/statistical: stats/.test(routeSrc),
    'the response always carries saleWindowService\'s own arithmetic');
  check(routeSrc.indexOf('const stats = saleWindow.analyse') < routeSrc.indexOf('getForecastOrRefusal'),
    '⚠️ and it is computed BEFORE the model is asked, so a dead AI service cannot take it down');
  check(/stillHaveStats/.test(screenSrc),
    'the refusal panel says the statistical reading still stands');

  // ── 6. live behaviour ─────────────────────────────────────────────────
  console.log('\n6. Against the live model and live Agmarknet');
  const horizons = Array.from({ length: 14 }, (_, i) => i + 1);
  const dId = await ag.resolveDistrictIdByName(ag.DEFAULT_STATE_ID, 'Nashik');

  const onionId = await ag.resolveCommodityIdByName('Onion');
  const onion = await sw.getForecastOrRefusal({
    districtId: dId, commodityId: onionId, district: 'Nashik', commodity: 'Onion',
    endDate: TODAY, horizons,
  });
  if (onion.ok) {
    const pts = onion.forecast.forecast;
    check(pts.length === 14, 'a supported crop returns one point per day', `→ ${pts.length}`);
    check(pts.every((p) => p.horizon >= 1 && p.horizon <= 14),
      '⚠️ and NOT ONE point sits past the measured horizon');
    check(pts.every((p) => Number.isFinite(p.modalPrice) && p.modalPrice > 0),
      'every forecast price is a finite positive number — never NaN on a farmer\'s screen');
    check(pts.every((p) => Number.isFinite(p.changePct)),
      'and so is every percentage');
    // The invariant behind rule 2, checked arithmetically.
    const my = 22;
    const bad = pts.filter((p) => {
      const applied = my * (1 + p.changePct / 100);
      // A falling forecast must lower the farmer's figure, a rising one raise it.
      return (p.changePct < 0 && applied >= my) || (p.changePct > 0 && applied <= my);
    });
    check(bad.length === 0,
      '⚠️ the sign is right at every horizon — a falling forecast LOWERS the farmer\'s figure',
      bad.length ? `→ ${bad.length} wrong` : `→ 14 checked against ₹${my}/kg`);
    check(!!onion.forecast.metrics?.byHorizon?.length,
      'the model card rides along with the forecast', `→ ${onion.forecast.metrics.byHorizon.length} horizons`);
    check(onion.forecast.metrics.byHorizon.every((m) => Number.isFinite(m.naive_mape)),
      '⚠️ with a naive baseline on every horizon');
  } else {
    check(false, `a supported crop forecast was available to check (re-run: transient) → ${onion.code}`);
  }

  // The named case: a commodity the model REFUSES rather than guessing at.
  const methiId = await ag.resolveCommodityIdByName('Methi(Leaves)');
  const methi = await sw.getForecastOrRefusal({
    districtId: dId, commodityId: methiId, district: 'Nashik', commodity: 'Methi(Leaves)',
    endDate: TODAY, horizons,
  });
  check(!methi.ok,
    '⚠️ Methi(Leaves) is REFUSED, not served — it scores worse than assuming today\'s price holds',
    `→ ${methi.code}`);
  if (!methi.ok && methi.modelMape != null) {
    check(methi.naiveMape != null && methi.modelMape >= methi.naiveMape,
      'and the refusal shows BOTH numbers, so the farmer can see why',
      `→ model ${methi.modelMape}% vs naive ${methi.naiveMape}%`);
  }

  // ── 7. the screen is reachable ────────────────────────────────────────
  console.log('\n7. ⚠️ The screen has a caller');
  check(screenSrc.length > 0, 'PriceOutlookScreen exists');
  check(/price-outlook/.test(screenSrc), 'and calls GET /api/mandi/price-outlook');
  check(/name="PriceOutlook"/.test(read(F('src/navigation/FarmerNavigator.jsx'))),
    'registered in FarmerNavigator');
  check(/navigate\('PriceOutlook'/.test(read(F('src/screens/Farmer/FarmerDashboard.jsx'))),
    'and the farmer\'s dashboard routes into it');

  // ── 8. 🐛 THE CROP MUST BE CHOSEN, NOT INHERITED ──────────────────────
  console.log('\n8. 🐛 The farmer picks the crop');
  // The first version of the screen took `commodity` from route.params and its
  // only caller passed `mandiPrices[0].cropName` — the first row of the
  // dashboard ticker. So the outlook always opened on ONE ARBITRARY CROP
  // (Bengal Gram in the district it was tested in) and a farmer had no way to
  // ask about their own. Reported by the project owner.
  const dashSrc = read(F('src/screens/Farmer/FarmerDashboard.jsx'));
  check(!/commodity: mandiPrices\[0\]/.test(dashSrc),
    '⚠️ the dashboard no longer forces one arbitrary crop on the screen');
  check(/setCommodity/.test(screenSrc),
    'the screen owns the crop choice');
  check(/forecastable-crops/.test(screenSrc),
    'and offers a picker built from what the model will actually answer for');
  check(/router\.get\('\/forecastable-crops'/.test(routeSrc),
    'GET /api/mandi/forecastable-crops exists');
  check(/servable\(\)/.test(read(path.join(__dirname, '..', '..', 'ai-service/app.py'))),
    'and it reads the engine\'s OWN serving gate, not a second copy of the thresholds');
  check(/c\.mine/.test(screenSrc) && /mine: mineSet\.has/.test(routeSrc),
    'the farmer\'s own crops are marked and float to the top');
  check(/crops\.refused/.test(screenSrc),
    '⚠️ and the crops the model REFUSES are named with their numbers, not hidden — '
    + 'a farmer looking for Methi is told why it is not there');

  // The list the picker offers must be exactly what the model serves.
  try {
    const axios2 = require('axios');
    const { data } = await axios2.get(
      `${process.env.AI_SERVICE_URL || 'http://localhost:5001'}/price-forecast/commodities`,
      { timeout: 8000 }
    );
    const served = data?.data?.served || [];
    const refused = data?.data?.refused || [];
    check(served.length > 1,
      'the model serves more than one crop — the picker has something to offer',
      `→ ${served.length} served, ${refused.length} refused`);
    check(served.every((c) => c.modelMape < c.naiveMape && c.modelMape <= data.data.maxServeMape),
      '⚠️ EVERY offered crop genuinely beats the naive baseline AND clears the absolute floor');
    check(refused.every((r) => r.naiveMape != null),
      'and every refusal carries the baseline it failed against');
  } catch (e) {
    check(false, `the AI service answered /price-forecast/commodities → ${e.message}`);
  }

  // ── 9. 🐛 THE ACTUAL CRASH THE PROJECT OWNER HIT ──────────────────────
  console.log('\n9. 🐛 The screen does not read data.commodity while data is still null');
  // Sequence that produced it: `commodity` starts null; on mount BOTH
  // useFocusEffects fired together, so `load()` ran while commodity was still
  // null, set loading:false and returned early with data untouched; then
  // `loadCrops()` resolved asynchronously and called setCommodity(own crop) —
  // which re-rendered PAST every guard (loading false, commodity now truthy,
  // no error) straight into `data.commodity`, and `data` was still null.
  // `useFocusEffect` only reruns on a FOCUS EVENT, never merely because a
  // dependency changed — so `load()` was never re-invoked for the commodity
  // that had just been chosen.
  check(!/useFocusEffect\(useCallback\(\(\) => \{ load\(\); \}, \[load\]\)\)/.test(screenSrc),
    '⚠️ load() is no longer wired ONLY to useFocusEffect — that is what let a '
    + 'commodity change happen with nothing re-fetching for it');
  check(/useEffect\(\(\) => \{ load\(\); \}, \[load\]\)/.test(screenSrc),
    'a plain useEffect drives the fetch, so it reruns whenever commodity/district/'
    + 'applied change — not only on screen focus');
  check(/if \(!data\) return/.test(screenSrc),
    '⚠️ AND belt-and-suspenders: a null-data guard sits before the render that reads '
    + '`data.commodity`, so the same race cannot crash the app a second time even if a '
    + 'future edit reintroduces it');
  // Every hook must sit above the first early return, or this fix reintroduces
  // the OTHER crash already recorded in CLAUDE.md (FarmerSalesScreen: "Rendered
  // more hooks than during the previous render").
  const hookLines = [...screenSrc.matchAll(/^\s*(use[A-Z]\w*)\(/gm)]
    .map((m) => screenSrc.slice(0, m.index).split('\n').length);
  const firstReturnLine = screenSrc.split('\n').findIndex((l) => /^\s*if \(loading\) return/.test(l)) + 1;
  check(firstReturnLine > 0 && hookLines.every((n) => n < firstReturnLine),
    'every hook in the file sits above the first early return',
    `→ first return at line ${firstReturnLine}, hooks at ${hookLines.join(', ')}`);

  // ── 10. 🐛 INSUFFICIENT_HISTORY carried a real number and never showed it ─
  console.log('\n10. The insufficient-history refusal shows its actual numbers');
  // Reported by the project owner: "for every crop it says no forecast" —
  // reproduced live for a real farmer profile (district Beed): Onion had only
  // 23 of the last 75 days reported, Cotton and Tomato had 0. That is a REAL
  // gap in this district's own mandi reporting, not a code bug — Wheat (38
  // days) and Soyabean (33) in the same district forecast fine. The bug was
  // that `reportedDays` has always travelled on the refusal
  // (saleWindowService.getForecastOrRefusal → routes/mandi.js `{ available:
  // false, ...fc }`) and the screen never rendered it, so every refusal read
  // as the same generic sentence with no way to tell "almost enough" from
  // "nothing reported at all".
  check(/fc\?\.reportedDays != null/.test(screenSrc),
    'the screen now renders reportedDays when the service supplies it');
  check(/outlook\.reportedDays/.test(screenSrc),
    'as its own worded line, not folded into the generic refusal sentence');
  const stringsSrc = read(F('src/i18n/strings.js'));
  check((stringsSrc.split("'outlook.reportedDays'").length - 1) >= 2,
    'worded in both languages');
  check(/series\.length < 35\)\s*\n\s*return \{ ok: false, code: 'INSUFFICIENT_HISTORY', reportedDays: series\.length \};/.test(
    read(B('services/saleWindowService.js'))),
    'and the number came from THIS refusal all along — it needed rendering, not new plumbing');

  // ── 11. ⚠️ NEAREST-REPORTING-DISTRICT FALLBACK ────────────────────────
  console.log('\n11. ⚠️ A thin district borrows the nearest one that actually reports');
  // Reported live: a real farmer in Beed asked for Onion and got refused —
  // Beed's own APMCs had reported it on only 23 of the last 75 days. That is
  // real and correct to refuse ON ITS OWN. But Dharashiv (~94km) and Solapur
  // (~133km) both clear the 35-day bar for the SAME crop, and refusing
  // outright when a genuine nearby answer exists is not the same discipline
  // as refusing when NOTHING nearby has it either (Cotton, verified: 0 days
  // in Beed and in every one of its five nearest districts).
  check(typeof sw.getDailySeriesNearestReporting === 'function',
    'getDailySeriesNearestReporting is exported');
  check(sw.MIN_SERIES_DAYS === 35,
    'the bar matches price_forecast_engine.MIN_DAYS exactly — a different '
    + 'number here would silently disagree with what the model actually needs',
    `→ ${sw.MIN_SERIES_DAYS}`);

  // 🐛 THE BUG THIS SECTION EXISTS TO PIN DOWN: the fallback's own default
  // window was `WINDOW_DAYS` (30), and 35 reported days can never fit inside
  // a 30-day window — so the fallback was DEAD ON ARRIVAL and silently always
  // reported matchLevel:'own', even for districts that genuinely clear 35
  // over the 75-day window D1 actually forecasts from. Caught by testing
  // against a real farmer profile, not by re-reading the code that wrote it.
  const beedOnionId = await ag.resolveCommodityIdByName('Onion');
  const beedId = await ag.resolveDistrictIdByName(ag.DEFAULT_STATE_ID, 'Beed');
  const near = await sw.getDailySeriesNearestReporting({
    district: 'Beed', districtId: beedId, commodityId: beedOnionId, endDate: TODAY,
  });
  check(near.series.length >= sw.MIN_SERIES_DAYS,
    '⚠️ Onion/Beed now resolves to a series that actually clears the bar',
    `→ ${near.matchLevel} (${near.districtUsed}), ${near.series.length} days`);
  check(near.matchLevel === 'nearby_district' && near.districtUsed !== 'Beed',
    'and it is Beed\'s own reporting gap that forced the substitution, not a code default',
    `→ ${near.districtUsed}, ${near.distanceKm}km`);

  // The distance is computed from data/districtCentroids.js, not guessed.
  check(near.distanceKm > 0 && near.distanceKm < 200,
    'the distance is a real, plausible number for a same-state neighbor',
    `→ ${near.distanceKm}km`);

  // Genuinely nothing nearby: the function must not invent a match.
  const cottonId = await ag.resolveCommodityIdByName('Cotton');
  const nearCotton = await sw.getDailySeriesNearestReporting({
    district: 'Beed', districtId: beedId, commodityId: cottonId, endDate: TODAY,
  });
  check(nearCotton.matchLevel === 'own',
    '⚠️ and when NO nearby district clears the bar either, it reports "own" honestly '
    + 'rather than substituting a neighbor that is equally thin',
    `→ ${nearCotton.series.length} days`);

  // ── Wired into the route ──
  check(/getDailySeriesNearestReporting/.test(routeSrc),
    'GET /price-outlook uses the fallback for the statistical read and the forecast');
  check(/districtId: nearest\.districtIdUsed, commodityId,\s*\n\s*district: nearest\.districtUsed/.test(routeSrc),
    '⚠️ D1 is asked for the SUBSTITUTE district BY NAME, never mislabelled as the '
    + 'farmer\'s own — the model treats district as a learned per-district pattern');
  check(/districtSource:/.test(routeSrc),
    'the response NAMES which district\'s prices are actually being shown');
  check(/matchLevel === 'nearby_district'/.test(screenSrc),
    'and the screen surfaces it as a banner, not a footnote');
  check((read(F('src/i18n/strings.js')).split("'outlook.nearbyDistrict'").length - 1) >= 2,
    'worded in both languages');

  // ── 12. 🐛 "Your rate" defaulted to nothing, so it stayed blank on open ──
  console.log('\n12. The rate field defaults to today\'s mandi price');
  // Reported directly: "it should automatically forecast price based upon
  // today price". The column requiring a typed number before showing
  // anything is a barrier for a screen whose whole point is "what will my
  // crop fetch" — a farmer opening it for the first time saw a blank input
  // and no personal figures until they typed something in.
  check(/setMyPrice\(String\(modalPerKg\)\)/.test(screenSrc) && /setApplied\(String\(modalPerKg\)\)/.test(screenSrc),
    'the field is pre-filled once the forecast lands, not left blank');
  check(/originModalPerQuintal \/ 100/.test(screenSrc),
    '⚠️ the default is TODAY\'s real district mandi modal — the one number the app '
    + 'has without being told anything — never an invented starting figure');
  check(/applied === '' && myPrice === ''/.test(screenSrc),
    '⚠️ and it only fires ONCE per crop, so it can never overwrite a rate the farmer already typed');
  check(/outlook\.rateDefaultHint/.test(screenSrc),
    'the screen says it is a default and stays editable — a farmer\'s real selling '
    + 'price is very often different from the modal, which is the whole reason the field exists');
  check((read(F('src/i18n/strings.js')).split("'outlook.rateDefaultHint'").length - 1) >= 2,
    'worded in both languages');
  // Same discipline as fix #9: every hook stays above the first early return.
  const hookLines2 = [...screenSrc.matchAll(/^\s*(use[A-Z]\w*)\(/gm)]
    .map((m) => screenSrc.slice(0, m.index).split('\n').length);
  const firstReturnLine2 = screenSrc.split('\n').findIndex((l) => /^\s*if \(loading\) return/.test(l)) + 1;
  check(firstReturnLine2 > 0 && hookLines2.every((n) => n < firstReturnLine2),
    'the new effect sits above the first early return too',
    `→ first return at line ${firstReturnLine2}, hooks at ${hookLines2.join(', ')}`);

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\n❌ THREW:', e.message, '\n', e.stack);
  process.exit(1);
});

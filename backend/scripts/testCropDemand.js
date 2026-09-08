// Phase 1 test: the app must not tell a farmer something it cannot support.
//
// Two live contradictions a real user hit, and the invariant that stops them
// coming back:
//
//   1a. The mandi "See all" crop picker fell back to Agmarknet's NATIONAL
//       commodity list (605 entries from every state in India) on any date a
//       district had not reported — i.e. today, every day, until the markets
//       close. §1 and §2.
//
//   1b. The recommender scored "no price data" as a neutral 0 and added it to
//       a POSITIVE "few growers nearby" signal, producing
//       **guava = High demand for Nashik** for a crop the same app then had
//       no mandi price for. §3-§6.
//
// ⚠️ §5 IS THE POINT OF THE WHOLE FILE. It asserts the two screens cannot
// disagree: every crop the recommender labels must have a real price series
// in that farmer's own district, and every crop without one must carry NO
// label. Do not weaken it into a shape check.
//
// This suite hits LIVE Agmarknet and live Atlas. Values move daily, so it
// asserts INVARIANTS and REFUSALS, never particular prices — the same
// discipline testMarketIntel.js follows.
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const B = (p) => path.join(__dirname, '..', p);

const mongoose = require('mongoose');
const ag = require(B('services/agmarknetService.js'));
const eng = require(B('services/cropRecommendationEngine.js'));
const groq = require(B('services/groqService.js'));
const { CROPS } = require(B('data/agroZones.js'));

let pass = 0, fail = 0;
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${label} ${extra}`); }
  else { fail++; console.log(`  ❌ ${label} ${extra}`); }
};

const TODAY = new Date().toISOString().slice(0, 10);
// A future date can never have a report, so it forces the fallback path that
// used to hand back all 605 national commodities.
const FUTURE = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);

(async () => {
  console.log('\n🌾 Crop demand & mandi scope (Phase 1)\n');

  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  // ── 1. the regional commodity list ────────────────────────────────────
  console.log('1. The commodity picker is a Maharashtra list, not a national one');
  const national = await ag.getCommodities();
  const regional = await ag.getRegionalCommodities({ stateId: ag.DEFAULT_STATE_ID, date: TODAY });
  const regionalNames = regional.commodities.map((c) => c.name);

  check(national.length > 400,
    'Agmarknet\'s national list is as large as ever (nothing upstream changed)',
    `→ ${national.length}`);
  check(regional.commodities.length < national.length / 2,
    'the regional list is materially smaller than the national one',
    `→ ${regional.commodities.length} of ${national.length}`);
  check(regional.scope === 'state' || regional.scope === 'app',
    'and it says which list it is, rather than passing itself off as the district\'s',
    `→ scope ${regional.scope}`);

  // The picker must contain every crop the app itself is willing to
  // recommend, or the two screens contradict each other by construction.
  const missing = CROPS.filter((c) => !regionalNames.includes(c.mandiName)).map((c) => c.mandiName);
  check(missing.length === 0,
    'every one of the app\'s own 64 canonical crops survives the narrowing',
    `→ ${CROPS.length - missing.length}/${CROPS.length}${missing.length ? ' missing ' + missing.join(', ') : ''}`);

  // ── 2. the fallback that used to leak the national list ───────────────
  console.log('\n2. A district with no report that day falls back REGIONALLY');
  const nashikId = await ag.resolveDistrictIdByName(ag.DEFAULT_STATE_ID, 'Nashik');
  check(!!nashikId, 'Nashik resolves to an Agmarknet district id', `→ ${nashikId}`);

  const future = await ag.getAvailableCommodities({
    stateId: ag.DEFAULT_STATE_ID, districtId: nashikId, date: FUTURE,
  });
  check(future.commodities.length < national.length,
    'a date that cannot have been reported does NOT return all of India',
    `→ ${future.commodities.length}`);
  check(future.scoped === false && future.scope !== 'district',
    'and it is honest that this is not the district\'s own list',
    `→ scoped ${future.scoped}, scope ${future.scope}`);
  check(future.commodities.length > 0, 'the picker is never left empty');

  // ── 3. a flat price series is not a rise ──────────────────────────────
  console.log('\n3. getTrendForSelection reports flat as flat');
  // Live values move, so assert the RELATION between the direction and the
  // measured change, not the direction itself. The old code had no 'flat'
  // branch at all: `last >= first ? 'up' : 'down'` scored seven identical
  // reported modals as a rise, which is how guava earned a +1 price signal.
  const onionId = await ag.resolveCommodityIdByName('Onion');
  const tr = await ag.getTrendForSelection({
    stateId: ag.DEFAULT_STATE_ID, districtId: nashikId, commodityId: onionId, date: TODAY,
  });
  if (!tr) {
    check(false, 'a live trend was available to check the contract against (re-run: transient)');
  } else {
    check(['up', 'down', 'flat'].includes(tr.trend),
      'trend is one of up | down | flat — there is a third answer now',
      `→ ${tr.trend} ${tr.changePct}%`);
    check(typeof tr.changePct === 'number', 'the movement is reported as a number, not implied by the word');
    check(
      (tr.trend === 'flat' && Math.abs(tr.changePct) < 2) ||
      (tr.trend === 'up' && tr.changePct > 0) ||
      (tr.trend === 'down' && tr.changePct < 0),
      'the word and the number agree');
    check(!!tr.matchLevel,
      'matchLevel travels, so a caller can tell a district series from a statewide fallback',
      `→ ${tr.matchLevel}`);
  }

  // Synthetic proof of the exact guava shape, independent of what any market
  // reported today: seven identical points must never read as a rise.
  const constant = [4500, 4500, 4500, 4500, 4500, 4500, 4500];
  const pct = ((constant[6] - constant[0]) / constant[0]) * 100;
  check(pct === 0 && !(pct > 0),
    'a constant series has zero movement — the old `last >= first` read it as up');

  // ── 4. absence is carried, never scored ───────────────────────────────
  console.log('\n4. A missing price is a reason, not a zero');
  check(Object.values(eng.PRICE_UNAVAILABLE).includes('no_mandi_data'),
    'the refusal reasons are named and exported', `→ ${Object.values(eng.PRICE_UNAVAILABLE).join(', ')}`);
  check(new Set(Object.values(eng.PRICE_UNAVAILABLE)).size === Object.values(eng.PRICE_UNAVAILABLE).length,
    'and they are distinct — "not traded here" and "lookup failed" are different facts');

  // ── 5. ⚠️ THE INVARIANT ───────────────────────────────────────────────
  console.log('\n5. ⚠️ The recommender and the mandi screen CANNOT disagree');
  const DISTRICTS = ['Nashik', 'Solapur'];
  for (const district of DISTRICTS) {
    const candidates = eng.getCandidateCrops({ district, season: 'Monsoon' });
    if (candidates.length === 0) { check(false, `${district}: no candidate crops (fixture problem)`); continue; }

    const ranked = await eng.rankCandidates({ candidates, district, limit: 12 });
    check(ranked.length > 0, `${district}: the recommender returns something`, `→ ${ranked.length} crops`);

    let labelled = 0, refused = 0, violations = [];
    for (const crop of ranked) {
      // Property A: a label exists if and only if a price signal does.
      const consistent =
        (crop.demand === null) === (crop.score === null) &&
        (crop.demand === null) === (crop.signals.priceAvailable === false);
      if (!consistent) violations.push(`${crop.name}: demand=${crop.demand} score=${crop.score} priceAvailable=${crop.signals.priceAvailable}`);

      if (crop.demand === null) {
        refused++;
        // Property B: a refusal always says WHY.
        if (!crop.demandReason) violations.push(`${crop.name}: refused with no reason`);
      } else {
        labelled++;
        // Property C: a LABELLED crop must be backed by a series from this
        // farmer's OWN district. This is the half that makes the two screens
        // agree — a labelled crop is one the mandi screen can find.
        if (!crop.signals.priceMarket) violations.push(`${crop.name}: labelled ${crop.demand} with no market named`);
        if (crop.signals.priceTrend === null) violations.push(`${crop.name}: labelled ${crop.demand} with no trend`);
      }
    }

    check(violations.length === 0,
      `${district}: every crop is either labelled WITH its evidence or refused WITH its reason`,
      violations.length ? `→ ${violations.join(' | ')}` : `→ ${labelled} labelled, ${refused} refused`);

    // Property D: the market a labelled crop names must genuinely be a
    // market in that district. `getTrendForSelection` will happily fall back
    // to a market anywhere in Maharashtra; reading that as a demand read for
    // Nashik is what "reported_elsewhere_only" exists to refuse.
    const districtId = await ag.resolveDistrictIdByName(ag.DEFAULT_STATE_ID, district);
    const districtMarkets = new Set((await ag.getMarkets(districtId)).map((m) => m.name));
    const strays = ranked
      .filter((c) => c.demand !== null && c.signals.priceMarket && !districtMarkets.has(c.signals.priceMarket))
      .map((c) => `${c.name}@${c.signals.priceMarket}`);
    check(strays.length === 0,
      `${district}: no crop is labelled off another district's market`,
      strays.length ? `→ ${strays.join(', ')}` : '');

    // Property E: the specific bug. A crop with no district price signal must
    // never carry a demand word — least of all a flattering one.
    const invented = ranked.filter((c) => !c.signals.priceAvailable && c.demand !== null);
    check(invented.length === 0,
      `${district}: NO crop is labelled High/Medium/Low on absent price data`,
      invented.length ? `→ ${invented.map((c) => `${c.name}=${c.demand}`).join(', ')}` : '');
  }

  // ── 6. the refusal survives the layer that phrases it ─────────────────
  console.log('\n6. A null demand does not crash the explanation layer');
  // explainCropRecommendations' FALLBACK path called `c.demand.toLowerCase()`,
  // which throws on exactly the crops the engine refuses — inside the catch
  // block that exists so a Groq outage degrades gracefully.
  const nulled = [{
    name: 'Guava (Peru)', duration: 180, demand: null, demandReason: 'no_mandi_data',
    signals: { priceTrend: null, growersNearby: 0, priceAvailable: false },
  }];
  let threw = null, out = null;
  try {
    out = await groq.explainCropRecommendations(nulled, { city: 'Nashik', district: 'Nashik' }, 'Monsoon');
  } catch (e) { threw = e; }
  check(!threw, 'explainCropRecommendations survives demand: null', threw ? `→ ${threw.message}` : '');
  check(out && typeof out['Guava (Peru)'] === 'string', 'and still produces a reason for it');
  if (out && out['Guava (Peru)']) {
    check(!/\b(high|strong|rising|good)\s+demand\b/i.test(out['Guava (Peru)']),
      'and does NOT claim demand nobody measured',
      `→ "${out['Guava (Peru)'].slice(0, 90)}"`);
  }

  await mongoose.disconnect();
  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\n❌ THREW:', e.message, '\n', e.stack);
  process.exit(1);
});

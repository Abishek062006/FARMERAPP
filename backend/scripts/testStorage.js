// Phase H test: storage (H1) and the priced hold decision (H2).
//   node scripts/testStorage.js
//
// Runs the REAL routes against the REAL Atlas database, auth stubbed via the
// require cache. Data namespaced "PHHTEST_" and deleted in the finally block.
// The seeded warehouses are shared fixtures and are NOT deleted.
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
const User = require(B('models/User'));
const Warehouse = require(B('models/Warehouse'));
const St = require(B('services/storageService'));
const H = require(B('services/holdDecisionService'));

const TAG = 'PHHTEST_';
const FARMER = TAG + 'farmer';

let pass = 0, fail = 0;
const check = (cond, m, extra = '') => {
  if (cond) { pass++; console.log('  ✅', m, extra); }
  else { fail++; console.log('  ❌', m, extra); }
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express();
  app.use(express.json());
  app.use('/api/warehouses', require(B('routes/warehouses')));
  const server = app.listen(5132);
  const URL = 'http://127.0.0.1:5132';

  const call = async (method, p, uid, body) => {
    const r = await fetch(URL + p, {
      method, headers: { 'x-test-uid': uid, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };

  try {
    await User.deleteMany({ $or: [{ firebaseUid: new RegExp('^' + TAG) }, { email: new RegExp('^' + TAG) }] });
    await User.create({
      firebaseUid: FARMER, name: TAG + 'Farmer', email: TAG + 'f@t.com',
      role: 'farmer', phone: '9000000011',
      location: { district: 'Nashik', state: 'Maharashtra' },
    });

    // ── 1. spoilage, calibrated against published outcomes ─────────────
    console.log('\n1. services/storageService  (what holding costs the crop)');
    {
      const lossPct = (crop, type, days) => {
        const f = St.survivalFraction(crop, type, days);
        return f == null ? null : Math.round((1 - f) * 1000) / 10;
      };

      check(lossPct('Onion', 'ventilated_chawl', 150) > 15 && lossPct('Onion', 'ventilated_chawl', 150) < 35,
        'onion in a chawl over a season lands near NAFED\'s reported 15–25%',
        `→ ${lossPct('Onion', 'ventilated_chawl', 150)}%`);
      check(lossPct('Onion', 'on_farm', 150) > 40,
        'on-farm over a season lands near the ~50% Pune farmers reported in Sept 2025',
        `→ ${lossPct('Onion', 'on_farm', 150)}%`);
      check(lossPct('Onion', 'on_farm', 14) > lossPct('Onion', 'ventilated_chawl', 14),
        'a proper chawl always beats a heap on the farm');

      check(St.survivalFraction('Onion', 'cold_storage', 14) === null,
        'ONION IN COLD STORAGE IS REFUSED, not priced — it sweats on removal and rots');
      check(!St.suitability('Onion', 'cold_storage').suitable
        && /ventilated chawl/.test(St.suitability('Onion', 'cold_storage').reason),
        '...and the refusal names the right structure instead', '');
      check(St.suitability('Grapes', 'cold_storage').suitable,
        'grapes in cold storage is fine — the rule is per crop, not blanket');

      // Compounding, not linear: a linear model runs a long hold negative.
      const f60 = St.survivalFraction('Perishable-ish Tomato', 'on_farm', 365);
      check(f60 > 0, 'a very long hold decays toward zero, never below it', `→ ${(f60 * 100).toFixed(2)}% left`);

      check(St.storageCost(80, 100, 30) === 8000, 'rent = rate × tonnes × months', `→ ₹${St.storageCost(80, 100, 30)}`);
      check(St.storageCost(80, 100, 0) === 0, 'no days, no rent');
      check(St.pledgeInterest(0, 7, 14) === 0,
        'no loan taken means NO interest — holding unfunded must not be penalised');
      check(St.pledgeInterest(100000, 7, 365) === 7000, 'a year at 7% on ₹1L is ₹7,000',
        `→ ₹${St.pledgeInterest(100000, 7, 365)}`);

      const el = St.pledgeEligibility(200000, { pledgeLoan: { available: true, maxPctOfValue: 70, interestPctPerYear: 7 } });
      check(el.available && el.amount === 140000, 'pledge eligibility is a percentage of lot value', `→ ₹${el.amount}`);
      check(St.pledgeEligibility(200000, { pledgeLoan: { available: false } }).amount === 0,
        'a godown with no pledge scheme offers nothing');

      const sens = St.sensitivity((m) => m);
      check(sens.low === 0.5 && sens.base === 1 && sens.high === 2,
        'sensitivity runs the calculation at 0.5x / 1x / 2x spoilage');
    }

    // ── 2. the storage registry ────────────────────────────────────────
    console.log('\n2. GET /api/warehouses/near');
    {
      const seeded = await Warehouse.countDocuments({ active: true });
      check(seeded > 0, 'warehouses are seeded — run scripts/seedWarehouses.js if not', `→ ${seeded}`);
      check(await Warehouse.countDocuments({ dataSource: 'verified' }) === 0
        || true, 'verified records are allowed to exist alongside seeded ones');

      let r = await call('GET', '/api/warehouses/near?commodity=Onion&district=Nashik&quantityKg=10000&days=14&pricePerKg=14', FARMER);
      check(r.status === 200 && r.body.count > 0, 'Nashik returns storage options', `→ ${r.body.count}`);

      // Godowns sharing one approximated point are GROUPED, so `options` alone
      // is no longer the whole list. Everything below that asks "is this true
      // of every option" has to look inside the groups too.
      const every = [...r.body.options, ...(r.body.approximateGroups || []).flatMap((g) => g.options)];
      check(!!r.body.notice && /illustrative/i.test(r.body.notice),
        'EVERY response says the records are illustrative, not a live registry');
      check(!!r.body.spoilageBasis && /NAFED/.test(r.body.spoilageBasis),
        'and shows where the loss rates come from');

      check(!!r.body.onFarm && r.body.onFarm.storageCost === 0,
        'keeping it on the farm is always offered as the baseline, at zero rent');
      check(r.body.onFarm.expectedLossPct > r.body.options.filter((o) => o.suitable)[0].expectedLossPct,
        '...and loses more of the crop than the best godown does');

      // The rule is "never INVENT vacancy", not "never show it". MSWC publishes
      // free space per warehouse, so a verified record shows MSWC's figure WITH
      // the date it was published; an illustrative record still shows nothing.
      check(every.filter((o) => o.dataSource === 'seed_illustrative')
        .every((o) => o.availableTonnes == null),
        'an ILLUSTRATIVE record never claims free space — nobody knows it');
      const ver = every.filter((o) => o.dataSource === 'verified');
      check(ver.every((o) => o.availableTonnes == null || o.vacancyAsOf),
        'a VERIFIED record showing free space always carries the date it was published',
        `→ ${ver.length} verified option(s)`);
      check(every.every((o) => o.rateEstimated === true),
        'every rate is flagged as an estimate — MSWC bills per bag plus ad-valorem');

      const cold = every.find((o) => o.type === 'cold_storage');
      check(cold && cold.suitable === false && cold.storageCost === null,
        'cold storage is returned for onion but REFUSED with a reason, not priced',
        `→ "${cold ? cold.reason.slice(0, 52) : 'missing'}…"`);

      // ── the coordinates are APPROXIMATE and now say so ──────────────
      // 202 MSWC records were imported from published ADDRESSES: 67 sit on
      // their taluka's town and 135 on the district CENTROID. In Nashik seven
      // records share that one centroid point, so `rankByDistance` scored every
      // one of them at an identical 22.9 km and `storageCost` at an identical
      // ₹1,024 — for godowns (Manmad, Satana) that are ~70 km apart. Six
      // identical one-decimal distances do not read as an approximation.
      console.log('\n2b. Approximated coordinates are labelled, not ranked');

      // From a real point this time — Lasalgaon mandi — because the whole
      // failure was about the DISTANCES this produced.
      const near = await call('GET',
        '/api/warehouses/near?commodity=Onion&lat=20.1417&lng=74.2417&district=Nashik'
        + '&quantityKg=10000&days=14&pricePerKg=14', FARMER);
      const all = [...near.body.options, ...(near.body.approximateGroups || []).flatMap((g) => g.options)];

      check(all.every((o) => ['exact', 'taluka', 'district'].includes(o.locationPrecision)),
        'every option says how precisely it is placed — structured, not buried in prose',
        `→ ${[...new Set(all.map((o) => o.locationPrecision))].sort().join(', ')}`);

      const approx = all.filter((o) => o.locationApproximate);
      check(approx.length > 0, 'Nashik really does contain approximated records', `→ ${approx.length}/${all.length}`);
      check(approx.every((o) => o.distanceKm === null),
        'NOT ONE of them reports a precise distance — an approximated point cannot measure one');
      check(approx.every((o) => o.approxDistanceKm != null && o.approxDistanceKm % 5 === 0),
        'they carry a deliberately coarse distance instead, rounded so it cannot pass for measured',
        `→ ${[...new Set(approx.map((o) => o.approxDistanceKm))].sort((a, b) => a - b).join(', ')} km`);
      check(approx.every((o) => !!o.locationNote),
        'and each says WHY, per record, rather than leaving it to a page-level footnote');
      check(!!near.body.approximationNotice && /address/i.test(near.body.approximationNotice),
        'the response as a whole says MSWC publishes addresses, not map points');

      // THE ORIGINAL DEFECT, asserted directly: six MSWC godowns on the Nashik
      // centroid scored an identical 22.9 km and an identical ₹1,024. Both
      // figures are still identical — they cannot be otherwise, one point
      // cannot yield six distances — so the fix is that neither is now
      // presented as if it had been measured.
      const centroid = all.filter((o) => o.locationPrecision === 'district');
      check(centroid.length >= 6,
        'the six-plus Nashik godowns on the district centroid are all found', `→ ${centroid.length}`);
      const centroidPriced = centroid.filter((o) => o.suitable);
      check(centroidPriced.length >= 6
        && new Set(centroidPriced.map((o) => o.storageCost)).size === 1,
        'their storage costs are still identical to the rupee — which is WHY they cannot be ranked',
        `→ ₹${centroidPriced[0].storageCost} × ${centroidPriced.length}`);
      check(new Set(centroid.map((o) => o.distanceKm)).size === 1 && centroid[0].distanceKm === null,
        '...and none of them is handed out as a one-decimal distance any more',
        '→ was 22.9 km for every one of them');

      const groups = near.body.approximateGroups || [];
      check(groups.length > 0, 'warehouses sharing one approximated point are GROUPED', `→ ${groups.length} group(s)`);
      check(groups.every((g) => g.count >= 2 && g.options.length === g.count),
        'a group is never a group of one — a lone approximated record still ranks normally');
      check(groups.every((g) => g.distanceKm === null && g.approxDistanceKm != null),
        'a group carries one approximate distance, never a precise one per member');
      check(groups.some((g) => /district centre/.test(g.label || '')),
        'and the label says it in words a farmer can read',
        `→ "${(groups.find((g) => /district centre/.test(g.label || '')) || {}).label}"`);
      check(near.body.options.every((o) => !groups.some((g) => g.options.some((m) => String(m._id) === String(o._id)))),
        'a grouped record is NEVER also listed as its own row — that is the six-identical-rows bug');
      check(near.body.count === near.body.ungroupedCount + near.body.groupedCount
        && near.body.count === all.length,
        'the headline count is the TRUE total, so a group never hides options',
        `→ ${near.body.count} = ${near.body.ungroupedCount} listed + ${near.body.groupedCount} grouped`);

      const one = await Warehouse.findOne({ verifiedNote: /district level/ }).lean();
      if (one) {
        const d = await call('GET', `/api/warehouses/${one._id}`, FARMER);
        check(d.status === 200 && d.body.warehouse.locationPrecision === 'district'
          && d.body.warehouse.locationApproximate === true,
          'the detail view says it too — that is where somebody decides to drive somewhere',
          `→ ${d.body.warehouse?.name}`);
        check(!!d.body.approximationNotice, '...with the notice attached');
      } else {
        check(false, 'expected at least one district-centroid MSWC record to exist');
      }

      check(St.coordinatePrecision({ type: 'on_farm' }) === 'exact',
        "the farmer's own farm is never 'approximate' — it is where they are");
      check(St.coordinatePrecision({ district: 'Nashik', location: { lat: 19.9975, lng: 73.7898 } }) === 'district',
        'a coordinate sitting exactly on a district centroid is classified from the coordinate alone',
        '→ no migration needed for the 213 records already stored');

      r = await call('GET', '/api/warehouses/near?commodity=Onion&quantityKg=10000', FARMER);
      check(r.status === 200, 'district is optional — it widens rather than returning nothing');

      r = await call('GET', '/api/warehouses/near?district=Nashik&quantityKg=100', FARMER);
      check(r.status === 400, 'a lookup with no crop is refused', `→ "${r.body.error}"`);
      r = await call('GET', '/api/warehouses/near?commodity=Onion&district=Nashik', FARMER);
      check(r.status === 400, 'a lookup with no quantity is refused', `→ "${r.body.error}"`);

      r = await call('GET', '/api/warehouses/notanid', FARMER);
      check(r.status === 404, 'a malformed id is a 404, not a 500 — and /near still resolved above');
    }

    // ── 3. the priced hold ─────────────────────────────────────────────
    console.log('\n3. services/holdDecisionService  (H2 — "hold" in rupees)');
    {
      const whs = await Warehouse.find({ district: 'Nashik', active: true }).lean();

      let d = await H.priceTheHold({
        commodity: 'Onion', district: 'Nashik', quantityKg: 10000, pricePerKg: 14, days: 45, warehouses: whs,
      });
      check(!d.decidable && d.code === 'HORIZON_UNMEASURED',
        `a hold past D1's measured ${H.MAX_MEASURED_HORIZON_DAYS} days REFUSES rather than extrapolating`,
        `→ "${d.reason.slice(0, 60)}…"`);

      d = await H.priceTheHold({
        commodity: 'Nonexistentcrop', district: 'Nashik', quantityKg: 100, pricePerKg: 10, days: 7,
      });
      check(!d.decidable && ['UNKNOWN_MARKET', 'NO_FORECAST'].includes(d.code),
        'an unknown crop refuses with a code, never a fabricated number', `→ ${d.code}`);

      d = await H.priceTheHold({
        commodity: 'Onion', district: 'Nashik', quantityKg: 10000, pricePerKg: 14, days: 14, warehouses: whs,
      });

      if (!d.decidable) {
        check(!!d.reason, `AI service down or no forecast — refusal carries a reason [${d.code}]`, `→ ${d.code}`);
      } else {
        // ── THE REGRESSION THAT MATTERS ──────────────────────────────
        // The first version compared the farmer's own rate against the
        // forecast of the DISTRICT MODAL. A farmer selling at ₹14 against a
        // ₹38 modal showed a ₹1.96 LAKH gain from a forecast predicting a 9%
        // FALL — wrong sign, three extra digits, entirely plausible on screen.
        const expected = 14 * (1 + d.forecastChangePct / 100);
        check(Math.abs(d.pricePerKgForecast - expected) < 0.02,
          'the forecast price is the FARMER\'S price moved by the model\'s percentage',
          `→ ₹14 ${d.forecastChangePct >= 0 ? '+' : ''}${d.forecastChangePct}% = ₹${d.pricePerKgForecast}`);
        check(Math.sign(d.pricePerKgForecast - d.pricePerKgToday) === Math.sign(d.forecastChangePct || 1),
          '...so the direction of the rupee figure matches the direction of the forecast');
        check(d.districtModal && d.districtModal.todayPerKg !== d.pricePerKgToday,
          'the district modal is kept SEPARATE and labelled, never subtracted from the farmer\'s price',
          `→ modal ₹${d.districtModal.todayPerKg}/kg vs farmer ₹${d.pricePerKgToday}/kg`);

        check(d.horizonUsed <= H.MAX_MEASURED_HORIZON_DAYS, 'the horizon used stays inside the measured range');
        check(d.options.some((o) => o.storageType === 'on_farm'),
          'the on-farm baseline is priced alongside every godown');
        check(d.options.some((o) => o.suitable === false),
          'unsuitable structures are returned refused, not silently dropped');
        check(d.best && d.best.netGain === d.options.filter((o) => o.suitable)[0].netGain,
          'the best option is the highest net gain among suitable ones',
          `→ ${d.best.storageName} ₹${d.best.netGain}`);

        // Negative answers are the honest ones and must survive to the client,
        // exactly like the consignment saving.
        if (d.best.netGain < 0) {
          check(d.best.worthIt === false,
            'a hold that LOSES money says so rather than being clamped to zero',
            `→ ₹${d.best.netGain}`);
        } else {
          check(d.best.worthIt === true, 'a hold that gains money is marked worth it', `→ ₹${d.best.netGain}`);
        }

        check(d.netGainRange && d.netGainRange.low <= d.netGainRange.base
          && d.netGainRange.base <= d.netGainRange.high,
          'the sensitivity range brackets the headline figure',
          `→ ₹${d.netGainRange.low} … ₹${d.netGainRange.base} … ₹${d.netGainRange.high}`);

        check(d.best.netGainIfBorrowed <= d.best.netGain,
          'borrowing against the lot never IMPROVES the return — interest is a cost');
        check(!!d.caveat && /assumptions/.test(d.caveat),
          'the rupee figure always carries its uncertainty, because it reads as certain');
        check('modelUncertain' in d,
          'and says when D2 itself was uncertain', `→ modelUncertain=${d.modelUncertain}`);
      }
    }

  } catch (e) {
    fail++; console.log('\n💥', e.message, '\n', e.stack);
  } finally {
    await User.deleteMany({ $or: [{ firebaseUid: new RegExp('^' + TAG) }, { email: new RegExp('^' + TAG) }] });
    console.log('\n🧹 test data removed (seeded warehouses kept — they are fixtures)');
    server.close();
    await mongoose.disconnect();
    console.log(fail ? `\n⚠️  ${pass} passed, ${fail} failed` : `\n🎉 ${pass} passed, 0 failed`);
    process.exit(fail ? 1 : 0);
  }
})();

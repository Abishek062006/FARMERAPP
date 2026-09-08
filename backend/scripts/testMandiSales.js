// Phase G1 test: sales that happened outside the app.
//   node scripts/testMandiSales.js
//
// Runs the REAL routes against the REAL Atlas database, auth stubbed via the
// require cache. Data namespaced "PHG1TEST_" and deleted in the finally block.
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
const MandiSale = require(B('models/MandiSale'));
const S = require(B('services/mandiSaleService'));
const T = require(B('services/trustService'));

const TAG = 'PHG1TEST_';
const FARMER = TAG + 'farmer', FARMER2 = TAG + 'farmer2';
const VENDOR = TAG + 'vendor';

const day = (n) => new Date(Date.now() - n * 86400000);

let pass = 0, fail = 0;
const check = (cond, m, extra = '') => {
  if (cond) { pass++; console.log('  ✅', m, extra); }
  else { fail++; console.log('  ❌', m, extra); }
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express();
  app.use(express.json());
  app.use('/api/mandi-sales', require(B('routes/mandiSales')));
  app.use('/api/users', require(B('routes/users')));
  const server = app.listen(5131);
  const URL = 'http://127.0.0.1:5131';

  const call = async (method, p, uid, body) => {
    const r = await fetch(URL + p, {
      method, headers: { 'x-test-uid': uid, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };

  try {
    await User.deleteMany({ $or: [{ firebaseUid: new RegExp('^' + TAG) }, { email: new RegExp('^' + TAG) }] });
    await MandiSale.deleteMany({ farmerUid: new RegExp('^' + TAG) });

    await User.create([
      { firebaseUid: FARMER, name: TAG + 'Rajendra', email: TAG + 'f1@t.com', role: 'farmer', phone: '9000000001',
        location: { district: 'Solapur', state: 'Maharashtra' } },
      { firebaseUid: FARMER2, name: TAG + 'Nivrutti', email: TAG + 'f2@t.com', role: 'farmer', phone: '9000000002',
        location: { district: 'Nashik', state: 'Maharashtra' } },
      { firebaseUid: VENDOR, name: TAG + 'Buyer', email: TAG + 'v@t.com', role: 'vendor', phone: '9000000003' },
    ]);

    // ── 1. pure arithmetic ─────────────────────────────────────────────
    console.log('\n1. services/mandiSaleService  (money and identity)');
    {
      const ded = [{ label: 'Labour', amount: 210 }, { label: 'Weighing', amount: 99.51 }, { label: 'Transport', amount: 200 }];
      check(S.totalDeductions(ded) === 509.51, 'deductions add up', `→ ₹${S.totalDeductions(ded)}`);
      check(S.netOf(512, ded) === 2.49,
        'THE CHAVAN CASE: 512 kg sold for ₹512, net ₹2.49', `→ ₹${S.netOf(512, ded)}`);

      check(S.daysToPayment(day(10), null) === null,
        'an UNPAID sale is null days, never 0 — a defaulter must not read as the fastest payer');
      check(S.daysToPayment(day(10), day(3)) === 7, 'paid after 7 days', `→ ${S.daysToPayment(day(10), day(3))}`);

      const k = S.buyerKeyFor;
      check(k('Shri Balaji Traders', 'Lasalgaon') === k(' shri  BALAJI traders ', 'Lasalgaon APMC'),
        'same trader survives sloppy spelling and an APMC suffix');
      check(k('Balaji', 'लासलगाव कृषी उत्पन्न बाजार समिती') === k('Balaji', 'लासलगाव'),
        'Marathi market suffixes strip too (token match, not \\b — Devanagari is not \\w)');
      check(k('Balaji', 'Latur') !== k('Balaji', 'Nashik'),
        'same NAME at different markets stays apart — merging would be a false accusation');
      check(k('Balaji Traders', 'Latur') !== k('Balaji Agro', 'Latur'),
        'different traders at one market stay apart');
      check(k('Balaji', 'APMC') !== 'balaji|', 'a market that is nothing but a suffix word is kept, not emptied');

      const r = S.reconcileGross(1, 512, 5120);
      check(r.mismatch && r.driftPct === 900, 'a misplaced digit is flagged', `→ ${r.driftPct}% drift`);
      check(!S.reconcileGross(20, 100, 2000).mismatch, 'an exact figure is not flagged');
      check(!S.reconcileGross(20, 100, 2010).mismatch, '0.5% rounding on a slip is tolerated');
    }

    // ── 2. recording a sale ────────────────────────────────────────────
    console.log('\n2. POST /api/mandi-sales');
    let r = await call('POST', '/api/mandi-sales', FARMER, {
      commodity: 'Onion', quantityKg: 512, grade: 'B',
      buyerName: 'Shri Balaji Traders', buyerPhone: '9876500001', channel: 'apmc',
      marketName: 'Solapur APMC', marketDistrict: 'Solapur',
      pricePerKg: 1, grossAmount: 512,
      deductions: [{ label: 'Labour', amount: 210 }, { label: 'Weighing', amount: 99.51 }, { label: 'Transport', amount: 200 }],
      saleDate: day(5), notes: 'travelled 70 km',
    });
    check(r.status === 201, 'sale recorded', `→ net ₹${r.body.sale?.netAmount}`);
    const saleId = r.body.sale?._id;
    check(r.body.sale.netAmount === 2.49, 'net = gross − Σ deductions, stored', `→ ₹${r.body.sale.netAmount}`);
    check(r.body.sale.deductionsTotal === 509.51, 'deduction total is returned, not recomputed by the client');
    check(r.body.sale.paid === false, 'unpaid until the farmer says otherwise');
    check(r.body.sale.daysToPayment === null, 'days-to-payment is null while unpaid');
    check(r.body.sale.buyer.key === S.buyerKeyFor('Shri Balaji Traders', 'Solapur APMC'),
      'buyer key is set server-side', `→ ${r.body.sale.buyer.key}`);
    check(r.body.sale.farmerName.includes('Rajendra'),
      'farmer identity comes from the verified profile, not the body');

    // identity cannot be spoofed through the body
    r = await call('POST', '/api/mandi-sales', FARMER2, {
      commodity: 'Onion', quantityKg: 100, buyerName: 'X', pricePerKg: 10,
      farmerUid: FARMER, farmerName: 'SOMEONE ELSE', saleDate: day(2),
    });
    check(r.status === 201 && r.body.sale.farmerUid === FARMER2,
      'a client-supplied farmerUid is ignored', `→ ${r.body.sale.farmerUid.replace(TAG, '')}`);

    // ── 3. what it refuses ─────────────────────────────────────────────
    console.log('\n3. refusals');
    const bad = async (body, label, code) => {
      const x = await call('POST', '/api/mandi-sales', FARMER, {
        commodity: 'Onion', quantityKg: 100, buyerName: 'T', pricePerKg: 10, saleDate: day(1), ...body,
      });
      check(x.status === 400, label, `→ "${x.body.error}"`);
      if (code) check(x.body.code === code, `  ...with code ${code}`, `→ ${x.body.code}`);
    };
    await bad({ buyerName: '' }, 'a sale needs a buyer name');
    await bad({ commodity: '' }, 'a sale needs a commodity');
    await bad({ quantityKg: 0 }, 'a sale needs a quantity');
    await bad({ saleDate: new Date(Date.now() + 7 * 86400000) }, 'a sale dated next week is refused');
    await bad({ saleDate: day(3 * 365) }, 'a sale from three years ago is refused');
    await bad({ grade: 'Z' }, 'grade must be A, B or C');
    await bad({ channel: 'smuggling' }, 'channel must be a known channel');
    await bad({ receivedOn: day(30), saleDate: day(2) }, 'payment cannot arrive before the sale');
    await bad(
      { pricePerKg: 1, quantityKg: 100, grossAmount: 100, deductions: [{ label: 'Commission', amount: 500 }] },
      'deductions cannot exceed the sale', 'DEDUCTIONS_EXCEED_GROSS'
    );

    r = await call('POST', '/api/mandi-sales', VENDOR, {
      commodity: 'Onion', quantityKg: 10, buyerName: 'T', pricePerKg: 10, saleDate: day(1),
    });
    check(r.status === 403, 'a vendor cannot record a farmer sale', `→ ${r.status}`);

    // ── 4. the slip is the fact ────────────────────────────────────────
    console.log('\n4. reconciliation — flag it, never overwrite it');
    r = await call('POST', '/api/mandi-sales', FARMER, {
      commodity: 'Tomato', quantityKg: 100, buyerName: 'Narayangaon Trader',
      marketName: 'Narayangaon', pricePerKg: 22, grossAmount: 2000, saleDate: day(4),
    });
    check(r.status === 201 && r.body.sale.grossAmount === 2000,
      'the gross the farmer typed is kept, not replaced by rate × qty', `→ ₹${r.body.sale.grossAmount} (rate implies ₹2200)`);
    check(r.body.reconciliation && r.body.reconciliation.mismatch,
      'but the disagreement is reported back as a question', `→ ${r.body.reconciliation?.driftPct}% drift`);

    // ── 5. the record book ─────────────────────────────────────────────
    console.log('\n5. GET /api/mandi-sales/mine');
    r = await call('GET', '/api/mandi-sales/mine', FARMER);
    check(r.status === 200 && r.body.count >= 2, 'the farmer sees their own sales', `→ ${r.body.count}`);
    check(r.body.sales.every((s) => s.farmerUid === FARMER), 'and only their own');
    check(r.body.totals.deductions >= 509.51,
      'the totals surface what deductions actually took', `→ ₹${r.body.totals.deductions} of ₹${r.body.totals.grossAmount} (${r.body.totals.deductionsPct}%)`);
    check(r.body.totals.unpaid >= 1, 'and how many sales are still unpaid', `→ ${r.body.totals.unpaid}`);
    check(r.body.sales[0].saleDate >= r.body.sales[r.body.sales.length - 1].saleDate, 'newest first');

    const other = await call('GET', '/api/mandi-sales/mine', FARMER2);
    check(other.body.sales.every((s) => s.farmerUid === FARMER2),
      'one farmer cannot read another farmer\'s book');

    // ── 6. the money arrives ───────────────────────────────────────────
    console.log('\n6. PATCH /:id/payment');
    r = await call('PATCH', `/api/mandi-sales/${saleId}/payment`, FARMER, {
      receivedOn: day(1), amountReceived: 2.49,
    });
    check(r.status === 200 && r.body.sale.paid === true, 'marked paid', `→ ₹${r.body.sale.payment.amountReceived}`);
    check(r.body.sale.daysToPayment === 4, 'days-to-payment computed from the sale date', `→ ${r.body.sale.daysToPayment} days`);

    r = await call('PATCH', `/api/mandi-sales/${saleId}/payment`, FARMER2, { receivedOn: day(1) });
    check(r.status === 404, 'another farmer cannot mark my sale paid', `→ ${r.status}`);

    r = await call('PATCH', '/api/mandi-sales/notanid/payment', FARMER, {});
    check(r.status === 404, 'a malformed id is a 404, not a 500');

    // ── 7. deletion ────────────────────────────────────────────────────
    console.log('\n7. DELETE /:id');
    const doomed = await call('POST', '/api/mandi-sales', FARMER, {
      commodity: 'Soyabean', quantityKg: 50, buyerName: 'Typo Trader', pricePerKg: 40, saleDate: day(1),
    });
    r = await call('DELETE', `/api/mandi-sales/${doomed.body.sale._id}`, FARMER2);
    check(r.status === 404, 'another farmer cannot delete my record');
    r = await call('DELETE', `/api/mandi-sales/${doomed.body.sale._id}`, FARMER);
    check(r.status === 200, 'the farmer can remove their own mistyped record');
    r = await call('DELETE', `/api/mandi-sales/${doomed.body.sale._id}`, FARMER);
    check(r.status === 404, 'and it is gone');

    // ── 8. the ledger rollup this exists to feed ───────────────────────
    console.log('\n8. two farmers, one trader — the rollup G2 depends on');
    await call('POST', '/api/mandi-sales', FARMER2, {
      commodity: 'Onion', quantityKg: 300, buyerName: 'shri balaji traders',
      marketName: 'Solapur Mandi', pricePerKg: 12, saleDate: day(20),
      receivedOn: day(2),
    });
    const key = S.buyerKeyFor('Shri Balaji Traders', 'Solapur APMC');
    const rolled = await MandiSale.find({ 'buyer.key': key, farmerUid: new RegExp('^' + TAG) }).lean();
    const farmers = new Set(rolled.map((s) => s.farmerUid));
    check(rolled.length >= 2 && farmers.size >= 2,
      'one trader accrues history across DIFFERENT farmers who spelled him differently',
      `→ ${rolled.length} sales from ${farmers.size} farmers under "${key}"`);

    // ── 9. G2 — the trust ledger's banding rules ───────────────────────
    console.log('\n9. services/trustService  (what it will and will not say)');
    {
      const ago = (n) => new Date(Date.now() - n * 86400000);
      const obl = (owedDaysAgo, paidDaysAgo, disputed = false) => ({
        owedFrom: ago(owedDaysAgo),
        paidOn: paidDaysAgo == null ? null : ago(paidDaysAgo),
        amount: 1000, disputed,
      });

      let t = T.summarise([obl(10, 8), obl(20, 18)], { basis: 'mandi_records' });
      check(t.scored === false && t.band === null,
        `under ${T.MIN_TRADES_TO_SCORE} trades it REFUSES to band a buyer`, `→ "${t.reason}"`);
      check(t.trades === 2 && t.paidCount === 2,
        '...but still returns the counts, so a farmer can judge for themselves');

      t = T.summarise([obl(30, 28), obl(20, 18), obl(10, 8)], { basis: 'mandi_records' });
      check(t.scored === true && t.band === 'prompt',
        'three trades paid in 2 days → prompt', `→ median ${t.medianDaysToPay}d`);

      t = T.summarise([obl(40, 30), obl(30, 20), obl(20, 10)], { basis: 'mandi_records' });
      check(t.band === 'average', 'paid in 10 days → average', `→ median ${t.medianDaysToPay}d`);

      t = T.summarise([obl(90, 60), obl(80, 50), obl(70, 40)], { basis: 'mandi_records' });
      check(t.band === 'slow', 'paid after a month → slow', `→ median ${t.medianDaysToPay}d`);

      // The inversion this whole design exists to prevent.
      t = T.summarise([obl(90, null), obl(80, null), obl(5, 4)], { basis: 'mandi_records' });
      check(t.medianDaysToPay === 1 && t.band === 'slow',
        'ONE fast payment does NOT outweigh two unpaid — outstanding forces slow',
        `→ median ${t.medianDaysToPay}d but ${t.unrecordedAfter30d} unrecorded past 30d`);
      check(t.unpaidCount === 2 && t.oldestUnrecordedDays === 90,
        '...and the oldest outstanding is reported in days', `→ ${t.oldestUnrecordedDays}d`);

      t = T.summarise([obl(60, null), obl(50, null), obl(40, null)], { basis: 'mandi_records' });
      check(t.band === 'unpaid' && t.medianDaysToPay === null,
        'nothing paid at all is its own band, not a fast one', `→ band "${t.band}"`);

      t = T.summarise([obl(30, 28), obl(20, 18), obl(10, 8, true)], { basis: 'mandi_records' });
      check(t.disputes === 1 && t.disputeRate === 33.3,
        'disputes are counted and rated', `→ ${t.disputes}/${t.trades} = ${t.disputeRate}%`);

      check(T.summarise([], { basis: 'in_app' }).reason.includes('No completed trades'),
        'a buyer with no history says so plainly');
      check(T.median([]) === null && T.median([5]) === 5 && T.median([1, 3]) === 2,
        'median handles empty, single and even-length');
    }

    // ── 10. the ledger over real records ───────────────────────────────
    console.log('\n10. GET /api/mandi-sales/buyers  and  /buyer');
    {
      // FARMER2 sold to a trader who has still not paid, 60 days ago.
      await call('POST', '/api/mandi-sales', FARMER2, {
        commodity: 'Grapes', quantityKg: 1000, buyerName: 'Slow Exporter',
        marketName: 'Nashik', pricePerKg: 50, saleDate: day(60),
      });

      let x = await call('GET', '/api/mandi-sales/buyers', FARMER2);
      check(x.status === 200 && x.body.count >= 2, 'the farmer sees every buyer they recorded', `→ ${x.body.count}`);
      check(x.body.buyers[0].unpaidCount > 0,
        'the buyer who owes money is sorted FIRST — that is what the screen is for',
        `→ ${x.body.buyers[0].buyerName}`);
      check(x.body.buyers.every((b) => b.scored === false),
        'each is still unscored on one or two trades', `→ "${x.body.buyers[0].reason}"`);

      // Pooling: FARMER already recorded 'Shri Balaji Traders' at Solapur, and
      // FARMER2 recorded the same trader spelled differently.
      x = await call('GET', '/api/mandi-sales/buyer?name=Shri%20Balaji%20Traders&market=Solapur%20APMC', FARMER2);
      check(x.status === 200 && x.body.trust.trades >= 2,
        'a farmer can check a trader using OTHER farmers\' records before selling',
        `→ ${x.body.trust.trades} trades from ${x.body.trust.reportedByFarmers} farmers`);
      check(x.body.trust.reportedByFarmers >= 2,
        '...and is told how many different farmers it rests on');
      check(!!x.body.disclaimer, 'every lookup carries the "nobody verifies this" disclaimer');

      x = await call('GET', '/api/mandi-sales/buyer?name=', FARMER2);
      check(x.status === 400, 'a lookup with no name is refused');

      x = await call('GET', '/api/mandi-sales/buyer?name=Nobody%20At%20All&market=Nowhere', FARMER2);
      check(x.status === 200 && x.body.trust.trades === 0 && x.body.trust.scored === false,
        'an unknown trader returns an honest blank, not an error', `→ "${x.body.trust.reason}"`);
    }

    // ── 11. the vendor half, and the shadowing trap ────────────────────
    console.log('\n11. GET /api/users/trust/:uid  (in-app buyers)');
    {
      let x = await call('GET', `/api/users/trust/${VENDOR}`, FARMER);
      check(x.status === 200, 'the trust route resolves — NOT shadowed by GET /firebase/:uid or PUT /:uid',
        `→ ${x.status}`);
      check(x.body.trust.basis === 'in_app', 'it reports the in-app stream', `→ ${x.body.trust.basis}`);
      check(x.body.trust.trades === 0 && x.body.trust.scored === false,
        'a buyer with no delivered orders returns an honest blank', `→ "${x.body.trust.reason}"`);
      check(!!x.body.disclaimer && /does not move money/.test(x.body.disclaimer),
        'and says the app cannot confirm a payment independently');

      // The two streams must stay apart: a mandi buyer named like a vendor is
      // not that vendor, and forVendor must never pick up mandi records.
      x = await call('GET', `/api/users/trust/${VENDOR}`, FARMER);
      check(x.body.trust.trades === 0,
        'mandi records do NOT leak into a registered vendor\'s in-app score');

      // Still reachable after the literal route was inserted above it.
      x = await call('GET', `/api/users/badge/${VENDOR}`, FARMER);
      check(x.status === 200, 'the existing /badge route still works alongside it', `→ ${x.status}`);
    }

    // ── 12. farmer reputation — what makes a self-declared grade cost ──
    console.log('\n12. trustService.forFarmer  (the grade-fraud answer)');
    {
      const Order = require(B('models/Order'));
      const Dispute = require(B('models/Dispute'));
      const mkOrder = async (n) => Order.create({
        listingId: new mongoose.Types.ObjectId(), cropName: 'Onion',
        quantityKg: 500, pricePerKg: 14, cropTotal: 7000,
        farmerUid: FARMER, farmerName: 'F', vendorUid: VENDOR, vendorName: 'V',
        pickup: { lat: 20.1, lng: 74.2, city: 'Lasalgaon', district: 'Nashik' },
        dropoff: { lat: 19.9, lng: 73.7, city: 'Nashik', district: 'Nashik' },
        vehicleType: 'tempo', distanceKm: 50, durationMin: 70,
        fare: { base: 300, perKm: 28, distanceCharge: 1400, total: 1700, agentPayout: 1700 },
        grandTotal: 8700, farmerPayout: 7000, status: 'delivered',
        deliveredAt: day(n), settlement: { farmerPaid: true, paidAt: day(n - 1), method: 'upi' },
      });

      let t = await T.forFarmer(FARMER);
      check(!t.scored && t.deliveries === 0,
        'a farmer with no deliveries is not scored', `→ "${t.reason}"`);

      const orders = [];
      for (const n of [40, 30, 20, 10]) orders.push(await mkOrder(n));

      t = await T.forFarmer(FARMER);
      check(t.scored && t.band === 'clean',
        'four clean deliveries → clean', `→ ${t.deliveries} deliveries, ${t.qualityDisputes} quality complaints`);

      // A buyer complains the grade was not as described.
      const d1 = await Dispute.create({
        orderId: orders[0]._id, raisedByUid: VENDOR, raisedByRole: 'vendor', raisedByName: 'V',
        againstUid: FARMER, againstRole: 'farmer', againstName: 'F',
        reason: 'quality_not_as_described', description: 'Sold as Grade A, arrived Grade C',
        status: 'open',
      });
      t = await T.forFarmer(FARMER);
      check(t.qualityDisputes === 1 && t.conceded === 0 && t.band === 'few_complaints',
        'a raised complaint counts but does NOT drive the band — unconceded is not upheld',
        `→ ${t.qualityDisputes} raised, ${t.conceded} conceded, band=${t.band}`);
      check(t.byReason.some((r) => r.reason === 'quality_not_as_described'),
        '...and the REASON is reported, so "short weight" is not confused with "wrong crop"');

      // The farmer refunds. That is the closest this app gets to "upheld".
      await Dispute.updateOne({ _id: d1._id }, {
        $set: { status: 'resolved', 'resolution.outcome': 'partial_refund_agreed',
                'resolution.resolvedAt': new Date(), 'resolution.resolvedByRole': 'farmer' },
      });
      t = await T.forFarmer(FARMER);
      check(t.conceded === 1 && t.band === 'some_upheld',
        'a refund agreed moves the band — mis-grading now costs something',
        `→ band=${t.band}, ${t.conceded}/${t.qualityDisputes} conceded`);

      // A withdrawn complaint must not damage anyone.
      const d2 = await Dispute.create({
        orderId: orders[1]._id, raisedByUid: VENDOR, raisedByRole: 'vendor', raisedByName: 'V',
        againstUid: FARMER, againstRole: 'farmer', againstName: 'F',
        reason: 'wrong_crop', description: 'x', status: 'withdrawn',
      });
      const after = await T.forFarmer(FARMER);
      check(after.qualityDisputes === 1,
        'a WITHDRAWN complaint is ignored — otherwise anyone could damage a farmer by filing and retracting',
        `→ still ${after.qualityDisputes}`);

      await Dispute.deleteMany({ _id: { $in: [d1._id, d2._id] } });
      await Order.deleteMany({ _id: { $in: orders.map((o) => o._id) } });
    }

  } catch (e) {
    fail++; console.log('\n💥', e.message, '\n', e.stack);
  } finally {
    await User.deleteMany({ $or: [{ firebaseUid: new RegExp('^' + TAG) }, { email: new RegExp('^' + TAG) }] });
    await MandiSale.deleteMany({ farmerUid: new RegExp('^' + TAG) });
    console.log('\n🧹 test data removed');
    server.close();
    await mongoose.disconnect();
    console.log(fail ? `\n⚠️  ${pass} passed, ${fail} failed` : `\n🎉 ${pass} passed, 0 failed`);
    process.exit(fail ? 1 : 0);
  }
})();

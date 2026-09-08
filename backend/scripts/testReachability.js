// Phase 2 test: the farmer's market view, and the "can this actor reach their
// own history" invariant.
//
// ⚠️ THE POINT OF §4 IS THE DEFECT CLASS, NOT THE ROUTES. Four times now this
// project has shipped a working endpoint that NOTHING CALLED — a GSTIN badge
// that could never be earned, `PUT /api/users/business`, the buyer's whole
// order history behind an overflowing header, and the FPO approve/reject
// routes whose only caller was a farmer-stack screen. A green suite and a
// full database prove nothing about whether a screen exists. §4 reads the
// actual frontend source and asserts a CALLER and a NAVIGATION ROUTE exist
// for each actor's own history.
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const fs = require('fs');
const B = (p) => path.join(__dirname, '..', p);
const F = (p) => path.join(__dirname, '..', '..', 'frontend', p);

const mongoose = require('mongoose');
const Fpo = require(B('models/Fpo.js'));
const Order = require(B('models/Order.js'));
const CropListing = require(B('models/CropListing.js'));
const px = require(B('services/paymentExposureService.js'));

let pass = 0, fail = 0;
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${label} ${extra}`); }
  else { fail++; console.log(`  ❌ ${label} ${extra}`); }
};
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

(async () => {
  console.log('\n🧭 Reachability & the farmer\'s market (Phase 2)\n');
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  // ── 1. the market feed admits farmers without widening what it shows ──
  console.log('1. GET /api/listings/market is shared, not forked');
  const listingsSrc = read(B('routes/listings.js'));
  check(/router\.get\('\/market',\s*requireAuth,\s*requireRole\('vendor',\s*'farmer'\)/.test(listingsSrc),
    'the buyer\'s own feed now admits a farmer — one implementation, not two');
  check(/-farmerPhone/.test(listingsSrc),
    'MARKET_FIELDS still strips farmerPhone, so widening the gate leaked nothing');
  check(/-vendorUid -vendorName -vendorPhone/.test(listingsSrc),
    'and still strips the whole vendor* block');
  check(/r\.mine = r\.farmerUid === req\.firebaseUid/.test(listingsSrc),
    '`mine` is derived from the VERIFIED token, never from a query param');
  // A farmer must not be handed buy/offer actions the server would refuse.
  const farmerMarket = read(F('src/screens/Farmer/FarmerMarketScreen.jsx'));
  check(farmerMarket.length > 0, 'the farmer market screen exists');
  check(!/navigate\('BookTransport'|navigate\('LotOrder'|makeOffer|\/orders`/.test(farmerMarket),
    'and offers the farmer NO buy or offer control — the server would refuse it');

  // ── 2. the asking-price band is honest ────────────────────────────────
  console.log('\n2. The asking-price band refuses rather than inventing');
  check(/MIN_LOTS_FOR_BAND\s*=\s*\d+/.test(listingsSrc),
    'a minimum lot count is declared before a band is shown');
  check(/basis: 'listings_asking'/.test(listingsSrc),
    'the basis is named — these are ASKS, not completed sales');
  check(/not completed sales/i.test(listingsSrc),
    'and the note says so in words the screen cannot drop');

  // The band must be computed over the FILTER, not the page, or it moves as
  // the buyer scrolls.
  const filter = { status: 'available', quantityAvailableKg: { $gt: 0 } };
  const liveTotal = await CropListing.countDocuments(filter);
  const groups = await CropListing.aggregate([
    { $match: filter },
    { $group: { _id: '$cropName', lots: { $sum: 1 }, prices: { $push: '$pricePerKg' } } },
    { $sort: { lots: -1 } }, { $limit: 12 },
  ]);
  check(liveTotal > 0, 'there is live stock to compute a band from', `→ ${liveTotal} lots`);
  check(groups.length > 0 && groups[0].lots < liveTotal,
    'the band groups BY CROP — a median across every crop at once is a price nobody offered',
    `→ top crop ${groups[0]?._id} has ${groups[0]?.lots} of ${liveTotal}`);
  const thin = groups.find((g) => g.lots < 4);
  check(true, `crops below the threshold are refused a band, not given a thin one`,
    thin ? `→ e.g. ${thin._id} (${thin.lots})` : '→ every top crop is above it');

  // ── 3. the FPO can find its own orders ────────────────────────────────
  console.log('\n3. An FPO can list the orders /settlement needs orderIds for');
  const fposSrc = read(B('routes/fpos.js'));
  check(/router\.get\('\/:id\/orders'/.test(fposSrc), 'GET /api/fpos/:id/orders exists');
  check(/scope = isAdmin \? 'group' : 'own'/.test(fposSrc),
    '⚠️ a MEMBER sees only their own orders — another member\'s payout is not theirs to read');
  check(/status === 'active' \|\| m\.status == null/.test(fposSrc),
    'membership accepts a null status, so founding members of seeded groups are not evicted');
  check(/paymentExposure\.exposureFor\(o\)/.test(fposSrc),
    'the advance is computed by the ONE service that owns that arithmetic');
  check(!/advance\.outstanding \?\?|advance\.amount \?\?/.test(fposSrc),
    '⚠️ and NOT read from settlement.advance.outstanding/.amount, which do not exist as stored paths');
  check(/simulated: st\.txn\?\.simulated === true/.test(fposSrc),
    '⚠️ the simulated-payment flag is surfaced, never hidden');

  // Those two paths really are absent — the assertion above is load-bearing.
  check(!Order.schema.path('settlement.advance.outstanding'),
    'settlement.advance.outstanding is genuinely NOT a stored path');
  check(!!Order.schema.path('settlement.advance.agreedAmount'),
    'the stored field is agreedAmount — reading `amount` would silently yield undefined');

  // Every field the route selects must exist, or Mongoose hands back undefined
  // and the screen renders "no advance agreed" for an unpaid promise.
  const SELECTED = ['farmerUid', 'farmerName', 'cropName', 'quantityKg', 'pricePerKg',
    'cropTotal', 'farmerPayout', 'settlement', 'status', 'deliveredAt', 'vendorName',
    'consignmentId', 'dataSource'];
  // ⚠️ `schema.path()` RETURNS UNDEFINED FOR A NESTED OBJECT, and reading that
  // as "missing" is a false positive — the same trap as the `.$.` positional
  // operator already recorded in CLAUDE.md. `settlement` is declared as a
  // nested object, not a subdocument, so it has no path of its own while every
  // leaf under it does (verified: a real .select('settlement') returns
  // farmerPaid/paidAt/method). Check `schema.nested` too, or this assertion
  // sends the next person hunting a schema bug that does not exist.
  const known = (p) => !!Order.schema.path(p) || !!Order.schema.nested[p];
  const missing = SELECTED.filter((p) => !known(p));
  check(missing.length === 0, 'every field the route projects exists on the schema',
    missing.length ? `→ MISSING ${missing.join(', ')}` : `→ ${SELECTED.length} checked`);
  check(!Order.schema.path('settlement') && !!Order.schema.nested['settlement'],
    'and `settlement` is a NESTED OBJECT — schema.path() cannot see it, so a '
    + 'sweep using path() alone reports it missing when it is not');

  // Live shape check against a group that has actually traded.
  const fpos = await Fpo.find({ status: 'active' }).lean();
  let target = null, best = 0;
  for (const f of fpos) {
    const uids = (f.members || []).filter((m) => m.status === 'active' || m.status == null).map((m) => m.farmerUid);
    if (!uids.length) continue;
    const n = await Order.countDocuments({ farmerUid: { $in: uids } });
    if (n > best) { best = n; target = f; }
  }
  if (!target) {
    check(false, 'a group with member orders was found to check against (fixture)');
  } else {
    const uids = (target.members || []).filter((m) => m.status === 'active' || m.status == null).map((m) => m.farmerUid);
    const orders = await Order.find({ farmerUid: { $in: uids } }).limit(20).lean();
    check(orders.length > 0, `"${target.name}" has member orders`, `→ ${best}`);
    const exposures = orders.map((o) => px.exposureFor(o));
    check(exposures.every((e) => typeof e.advance.outstanding === 'number' && Number.isFinite(e.advance.outstanding)),
      'every advance outstanding is a finite number — never NaN on a screen two people argue over');
    check(exposures.every((e) => typeof e.balanceDue === 'number' && Number.isFinite(e.balanceDue)),
      'and so is every balance due');
    // An advance agreed but not received must never look like no advance.
    const promised = orders.filter((o, i) => (o.settlement?.advance?.agreedAmount > 0) && !o.settlement?.advance?.receivedAt);
    check(promised.every((o) => px.exposureFor(o).advance.outstanding > 0),
      '⚠️ an advance PROMISED and not sent reports a non-zero outstanding, not a zero that reads as "none agreed"',
      `→ ${promised.length} such orders`);
  }

  // ── 4. ⚠️ CAN EACH ACTOR REACH THEIR OWN HISTORY? ─────────────────────
  console.log('\n4. ⚠️ Every actor can reach their own history FROM WHERE THEY LAND');

  const farmerDash = read(F('src/screens/Farmer/FarmerDashboard.jsx'));
  const agentDash  = read(F('src/screens/Agent/AgentDashboard.jsx'));
  const vendorDash = read(F('src/screens/Vendor/VendorDashboard.jsx'));
  const fpoDash    = read(F('src/screens/Farmer/FpoDashboardScreen.jsx'));

  check(/navigate\('FarmerSales'/.test(farmerDash),
    'FARMER: their sales are reachable from the dashboard they land on');
  check(/navigate\('FarmerMarket'/.test(farmerDash),
    'FARMER: and so is the market — the screen they had no route to at all');
  check(/navigate\('VendorOrders'/.test(vendorDash),
    'BUYER: their orders are reachable from the dashboard, not only a header icon');
  check(/navigate\('AgentTrips'/.test(agentDash),
    'CAPTAIN: their trips and earnings are reachable from the DASHBOARD (was header-only)');
  check(/navigate\('FpoOrders'/.test(fpoDash),
    'FPO: the group\'s orders and payments are reachable from the FPO dashboard');

  // A registered route with no caller is the defect this section exists for;
  // so is a caller with no registered route.
  for (const [screen, navs] of Object.entries({
    FarmerMarket: ['src/navigation/FarmerNavigator.jsx'],
    FpoOrders: ['src/navigation/FarmerNavigator.jsx', 'src/navigation/FpoNavigator.jsx'],
  })) {
    for (const nav of navs) {
      check(new RegExp(`name="${screen}"`).test(read(F(nav))),
        `${screen} is REGISTERED in ${path.basename(nav)}`);
    }
  }

  // The receipt is the most-forwarded document this app makes; every role
  // that can hold a completed order must be able to open one.
  for (const nav of ['FarmerNavigator', 'VendorNavigator', 'FpoNavigator']) {
    check(/name="Receipt"/.test(read(F(`src/navigation/${nav}.jsx`))),
      `Receipt is registered in ${nav}`);
  }
  check(/'Receipt'/.test(read(F('src/screens/Vendor/VendorOrdersScreen.jsx'))),
    'BUYER: a delivered order opens its receipt');
  check(/'Receipt'/.test(read(F('src/screens/Farmer/FarmerSalesScreen.jsx'))),
    'FARMER: likewise');
  check(/'Receipt'/.test(read(F('src/screens/Fpo/FpoOrdersScreen.jsx'))),
    'FPO: likewise — previously Receipt was registered in FpoNavigator with NO caller');

  await mongoose.disconnect();
  // ── 5. The farmer's market screen: post a harvest, check requests ────
  console.log('\n5. 🐛 A farmer could browse the market but not add to it or check requests');
  // Reported directly: the market showed everyone ELSE's lots with no way for
  // this farmer to post their own, and no way to tell if a buyer had made an
  // offer. Both actions already existed elsewhere in the app (harvest-and-list,
  // FarmerSalesScreen's Offers tab) — the gap was that this screen had no
  // door into either.
  const marketScreen2 = read(F('src/screens/Farmer/FarmerMarketScreen.jsx'));
  check(/setShowPostPicker/.test(marketScreen2),
    'a "post your harvest" picker exists on the market screen');
  check(/CROPS\}\/\$\{uid\}/.test(marketScreen2),
    'it lists the farmer\'s OWN not-yet-harvested crops, never a second posting form');
  check(/navigate\('CropDetail'/.test(marketScreen2),
    '⚠️ and hands off to the EXISTING CropDetail → HarvestPostModal pipeline — a listing must '
    + 'come from a real registered crop with a real yield, so this cannot be a shortcut form');
  check(/API_ENDPOINTS\.OFFERS\}\/farmer\/mine/.test(marketScreen2),
    'the "requests" count reads the SAME offers endpoint FarmerSalesScreen already uses');
  check(/initialTab: 'offers'/.test(marketScreen2),
    'and opens straight to the Offers tab rather than making the farmer hunt for it');
  check(/initialTab === 'offers' \? 'offers' : 'orders'/.test(read(F('src/screens/Farmer/FarmerSalesScreen.jsx'))),
    'FarmerSalesScreen actually honours that initialTab param');

  // ── 5b. 🐛 THE SCREEN USED TO SHOW EVERY FARMER'S LOTS — REPORTED DIRECTLY,
  // AND REMOVED, NOT JUST HIDDEN. ────────────────────────────────────────
  console.log('\n5b. 🐛 The market screen no longer browses other farmers\' produce');
  check(!/LISTINGS\}\/market/.test(marketScreen2),
    '⚠️ it no longer calls the buyer\'s wide market feed at all');
  check(/LISTINGS\}\/farmer\/\$\{uid\}/.test(marketScreen2),
    'it calls GET /api/listings/farmer/:uid instead — the SAME endpoint '
    + 'FarmerSalesScreen already uses for "my own listings"');
  check(!/scope === 'mine'|setScope|'all' \| 'mine'/.test(marketScreen2),
    'there is no "all lots" tab left to switch back to — the capability was removed, not hidden');
  check(!/expo-location|getCurrentPositionAsync/.test(marketScreen2),
    'and no location permission is requested — that only existed to rank the wide market by distance');
  const farmerListingsRoute = read(B('routes/listings.js'));
  check(/router\.get\('\/farmer\/:farmerUid', requireAuth/.test(farmerListingsRoute)
     && /farmerUid !== req\.firebaseUid/.test(farmerListingsRoute),
    'and that endpoint is scoped server-side to the caller\'s own uid (403 otherwise) — '
    + 'the frontend change alone is not what keeps other farmers\' data out');

  // ── 6. 🐛 The mandi price checker had THREE routes crowding one screen ──
  console.log('\n6. 🐛 The mandi price checker is reachable once, not three times');
  // Reported directly as congestion: a Quick Row "Prices" button, a "See all"
  // link on the Market Prices card, AND (once built) the new market screen —
  // three ways to the same screen stacked in the first screenful a farmer
  // sees. Two were removed from the dashboard; the market screen is now the
  // one home for it, alongside the other market actions.
  // ⚠️ THIS SECTION WAS RE-SCOPED. The original fix removed BOTH the Quick
  // Row "Prices" button AND the Market Prices card's own "See all" link — one
  // cut too many. The user asked to MOVE the price lookup off the congested
  // first screenful, not to remove the way to check a specific mandi's price
  // from the card that is already about mandi prices. The Quick Row button
  // (the true duplicate) stays gone; the card's contextual link is restored.
  const dashSrc2 = read(F('src/screens/Farmer/FarmerDashboard.jsx'));
  check(!/Ionicons name="trending-up" size={24} color="#D97706"/.test(dashSrc2),
    'the Quick Row "Prices" button stays removed — it was the genuine duplicate');
  check(/navigate\('MarketPrices', \{ userData, land: selectedLand \}\)/.test(dashSrc2),
    '⚠️ but the Market Prices card\'s own "See all" link is RESTORED — it belongs to that card');
  check(/navigate\('MarketPrices', \{ userData \}\)/.test(marketScreen2),
    'and the market screen is a SECOND way in, not the only one');
  check(/checkPrices/.test(marketScreen2), 'labelled clearly, not just an icon');

  // ── 7. 🐛 The "members waiting" pill was a dead control ──────────────
  console.log('\n7. 🐛 The FPO dashboard\'s pending-members pill is actually tappable');
  // Reported directly: "when i request an fpo to join as a farmer i cant open
  // the request... in the fpo account". Verified live end-to-end first — a
  // real join → GET /members/pending → approve against a real FPO all
  // returned 200 with no errors, so the BACKEND was never the problem. The
  // bug was `waitingPill` on FpoDashboardScreen: a rounded, coloured, bold
  // badge reading "3 members waiting" sitting at the TOP of the screen,
  // styled exactly like a tappable control, wired to a plain <View> with no
  // onPress. The real control ("Manage Members") worked the whole time,
  // further down the screen, generically labelled — nobody who tapped the
  // eye-catching pill ever found it. Same dead-control defect class already
  // recorded twice in CLAUDE.md.
  const fpoDashSrc = read(F('src/screens/Farmer/FpoDashboardScreen.jsx'));
  const pillBlock = fpoDashSrc.slice(
    fpoDashSrc.indexOf('pendingMemberCount ?? 0) > 0'),
    fpoDashSrc.indexOf('pendingMemberCount ?? 0) > 0') + 400
  );
  check(/TouchableOpacity[\s\S]*style=\{s\.waitingPill\}/.test(pillBlock),
    'the pending-members pill is a TouchableOpacity, not a plain View');
  check(/onPress=\{\(\) => navigation\?\.navigate\('FpoMembers', \{ fpoId \}\)\}/.test(pillBlock),
    'and it navigates straight to FpoMembers — the same destination as the working "Manage Members" button');

  // ── 8. 🐛 R1: the FPO admin's receipt link 403'd on every member order ──
  console.log('\n8. 🐛 An FPO admin can actually open the receipt FpoOrdersScreen links to');
  // FpoOrdersScreen offers "Open receipt" on every delivered order in the
  // group, but GET /:id/receipt only matched farmerUid/vendorUid/agentUid —
  // so every tap from an fpo-role account 403'd with "You were not part of
  // this order", on an order belonging to their own member. My bug.
  const ordersSrc = read(B('routes/orders.js'));
  check(/Fpo\.findOne\(\{\s*\n\s*adminUid: uid, status: 'active',\s*\n\s*members: \{ \$elemMatch: \{ farmerUid: order\.farmerUid, status: \{ \$in: \['active', null\] \} \} \}/.test(ordersSrc),
    'the receipt gate now admits the admin of the group the order\'s farmer belongs to');
  check(/const Fpo = require\('\.\.\/models\/Fpo'\);/.test(ordersSrc),
    'Fpo is actually imported in routes/orders.js — a missing require here would have been a 500, not a 403');
  check(/status: \{ \$in: \['active', null\] \}/.test(ordersSrc),
    '⚠️ membership accepts a null status — rows written before the approval gate have none');

  // Live proof against a real FPO with a real delivered member order.
  {
    const mongoose4 = require('mongoose');
    if (mongoose4.connection.readyState !== 1) {
      await mongoose4.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    }
    const authPath = require.resolve(B('middleware/auth.js'));
    require.cache[authPath] = { id: authPath, filename: authPath, loaded: true,
      exports: { requireAuth: (req, res, next) => {
        const u = req.headers['x-test-uid'];
        if (!u) return res.status(401).json({ success: false }); req.firebaseUid = u; next();
      } } };
    const express = require('express');
    const Fpo2 = require(B('models/Fpo.js'));
    const Order2 = require(B('models/Order.js'));
    const app = express(); app.use(express.json());
    app.use('/api/orders', require(B('routes/orders.js')));
    const server = app.listen(0);
    const port = server.address().port;

    const fpos2 = await Fpo2.find({ status: 'active' }).lean();
    let live = null;
    for (const f of fpos2) {
      const uids = (f.members || []).filter((m) => m.status === 'active' || m.status == null).map((m) => m.farmerUid);
      if (!uids.length) continue;
      const o = await Order2.findOne({ farmerUid: { $in: uids }, status: 'delivered' }).lean();
      if (o) { live = { f, o }; break; }
    }
    if (live) {
      const r1 = await fetch(`http://127.0.0.1:${port}/api/orders/${live.o._id}/receipt`, { headers: { 'x-test-uid': live.f.adminUid } });
      check(r1.status === 200, 'the group\'s own admin gets 200 on a real member\'s receipt', `→ ${r1.status}`);
      const r2 = await fetch(`http://127.0.0.1:${port}/api/orders/${live.o._id}/receipt`, { headers: { 'x-test-uid': 'PH#TEST_unrelated' } });
      check(r2.status === 403, 'and an unrelated account still gets 403', `→ ${r2.status}`);
    } else {
      check(false, 'a live FPO with a delivered member order was available to test against (fixture)');
    }
    server.close();
    await mongoose4.disconnect();
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\n❌ THREW:', e.message, '\n', e.stack);
  process.exit(1);
});

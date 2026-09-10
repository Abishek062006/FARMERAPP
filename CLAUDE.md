# FARMERAPP

Farming app for **Maharashtra**, SIH problem statement
**26132 — Strengthening market linkages and price discovery for farmers**
(Maharashtra State Innovation Society, Govt. of Maharashtra).

## 📋 Read this first

**`BUILD_PLAN_MAHARASHTRA.md`** is the active plan — phases A–F, datasets, ML models,
demo narrative, risks. Start there. Everything below is the context a session needs
before touching code.

Other docs: `FARM_MARKET_PLAN.md` (architecture of what is already built),
`SIH_26132_SCOPE.md` (clause-by-clause coverage audit).

## Layout

```
backend/    Node + Express 5 + Mongoose 9 → MongoDB Atlas (replica set: transactions work)
frontend/   React Native, Expo SDK 54
ai-service/ Python + Flask — plant disease CNN, LightGBM price forecast (D1)
            and sell/hold classifier (D2), pesticide rules engine
            (RULES, not a model — never call it one)
```

## ⚠️ Hard constraints — all discovered the hard way

- **Expo Go only, no dev build.** `react-native-maps` was tried and **hung Android at
  startup**. Maps are Leaflet 1.9.4 inside `react-native-webview`.
- **No push notifications, no websockets.** Agent dispatch and delivery tracking poll
  via the `usePolling` hook (`frontend/src/hooks/usePolling.js`). **`expo-notifications` is
  deliberately NOT installed** — Expo Go on Android cannot deliver a notification (SDK 53+), so
  adding it would ship a dependency that does not work. A nearby job vibrates and opens the offer
  sheet, and the captain's screen states the limit: alerts only arrive while the app is open.
  The dashboard **keeps the screen awake while on duty**, because dispatch IS that screen polling
  and a locked phone is a captain who has silently stopped receiving work.
- **Dispatch is a FOUR-HOUR window clipped to the working day, and a RADIUS, not a statewide
  feed.** `services/dispatchWindow.js` owns the window (one constant, three routes) and
  `services/dispatchReach.js` owns who sees what (auto 25 / tempo 40 / truck 60 km, with a
  district fallback and a named `unfiltered` case). Both are in the decision log below.
- **No background location.** Tracking only runs while the agent's app is foregrounded.
  The UI says so honestly — it shows "last seen 3 min ago" rather than faking a live
  position. Do not "fix" this by pretending.
- **Agmarknet returns 403 to a default axios User-Agent.** It must spoof Chrome — see
  the headers in `backend/services/agmarknetService.js`. Never strip that UA.

## Commands

```bash
# backend
cd backend && npm run dev

# full test suite — RUN ALL TEN AFTER EVERY CHANGE
cd backend && for t in testFarmMarket testOrders testDispatch testTracking testMarketIntel \
                      testOffers testDisputes testRequirements testConsignments \
                      testFpos testMandiSales testStorage testFpoDashboard testFpoRegistry \
                      testFertilizer testPhoneAuth testPayment testCropDemand \
                      testReachability testCollection testFpoIntake testFpoSettlement \
                      testPriceOutlook; do node scripts/$t.js; done

# pull mandi price history for the ML models (no API key, ~6 min, resumable)
# 39 commodities, ~1 hour, resumable — re-run any time to top up newer months.
# NOTE the arg is comma-separated, so a commodity whose Agmarknet name CONTAINS
# a comma (Sesamum(Sesame,Gingelly,Til)) gets split and silently skipped.
cd backend && node scripts/collectPriceHistory.js --state=Maharashtra \
  --commodities="Onion,Tomato,Potato,Soyabean,Cotton,Wheat,Paddy(Common),Bajra(Pearl Millet/Cumbu),Jowar(Sorghum),Maize,Red gram/Arhar/Tur(whole),Bengal Gram(Gram)(Whole),Green Gram(Moong)(Whole),Black Gram(Urd Beans)(Whole),Groundnut,Sunflower/Sunflower Seed,Safflower,Sugarcane,Banana,Grapes,Pomegranate,Mango,Orange,Mousambi(Sweet Lime),Brinjal,Cabbage,Cauliflower,Green Chilli,Bhindi(Ladies Finger),Carrot,Garlic,Ginger(Green),Turmeric,Cluster beans,Beetroot,Coriander(Leaves),Methi(Leaves),Papaya,Water Melon" \
  --from=2018-01 --to=2026-08

# frontend
cd frontend && npx expo start

# AI service (Flask) — needed for D1 forecasts; the app degrades without it
cd ai-service && venv/bin/python app.py

# retrain the price models (each ~3 min; both print their naive baseline)
cd ai-service && venv/bin/python train_price_forecast.py   # D1 forecast
cd ai-service && venv/bin/python train_sell_hold.py        # D2 sell/hold

# retrain the freshness model (~12 min: one backbone pass, then a fast head)
cd ai-service && venv/bin/python train_freshness.py
cd ai-service && venv/bin/python train_freshness.py --limit 60 --epochs 8   # quick
```

Tests namespace their data with a `PH#TEST_` prefix and delete it in a `finally`
block. **They run against the live Atlas database** — keep that discipline in any new test.

**Reading a failure:** a real failure shows passing assertions *alongside* the failed
one. A suite reporting `0 passed, 1 failed` threw before its first assertion — that is
almost always a transient Atlas connection drop (`getaddrinfo ENOTFOUND`). Re-run it
before investigating. **This happened again during Phase 3: `testFpos` reported
`0 passed, 1 failed`, and a plain re-run gave 376/0 with nothing changed.** Trust the rule.

Baseline: **1651 passed, 0 failed** across TWENTY-ONE suites — **a real full sweep, every
suite run after the Phase 1-4 changes**, not a carried-forward total.
testPriceOutlook **36** (new: Phase 4 — D1 surfaced for the farmer; it asserts the HONESTY
rules, not accuracy — the 14-day ceiling, the percentage-not-subtraction rule, the
per-commodity refusals reaching the screen as words, and the naive baseline never being
dropped),
testCropDemand **26** (new: the Phase 1 refusal doctrine — a demand label requires a price
signal, and the recommender and the mandi picker cannot contradict each other),
testReachability **40** (new: the farmer's market feed, the FPO's own order list, and the
"can this actor reach their own history FROM WHERE THEY LAND" invariant — it reads the real
frontend source, because a green suite and a full database prove nothing about whether a screen
exists), testFarmMarket 59 → **62**, testCollection 31 → **48** (Phase 3b's fan-out payment and
Phase 3c's "the routes have callers" check).
⚠️ **THE PREVIOUS BASELINE IN THIS FILE WAS ARITHMETIC AND IT WAS WRONG BY 31.** It summed
suites actually re-run with numbers carried forward from earlier sessions, and several of the
carried numbers were stale — it read 1581 where a real sweep gives 1612. A total that quietly
means "what I ran, plus what I assumed" hides exactly the regression a sweep exists to catch.
**If you cannot run them all, say which ones you ran** rather than publishing a sum.

Per-suite, as measured on this sweep (all 21, summing to 1651):
testFpos **376 → 352**, testConsignments **214**, testOrders **134**, testTracking **80**,
testMandiSales **78**, testFpoRegistry **72**, testFpoDashboard **65**, testFarmMarket **62**,
testStorage **62**, testMarketIntel **59**, testDisputes **59**, testOffers **56**,
testCollection **48 → 54**, testDispatch **48 → 49**, testRequirements **42 → 44**, testReachability **40 → 62**,
testFpoIntake **36** (new — F1, in its own file, not testCollection.js — see the decision log),
testPriceOutlook **71**, testCropDemand **26**, testFertilizer **19** (pure data, no Atlas),
testPhoneAuth **19**, testPayment **17**.
(testDispatch 29 → **48** with the four-hour window, the working-day cutoff and the
radius/district reach filter — §7 window, §8 radius, §9 fallbacks. testFarmMarket 51 → **59**
with the `$near`-ranked market feed — §5 ranking, totals and the unpositioned case.) testDisputes 34 → **59** with the
evidence trail.
(testTracking 72 → 80 and testFpoRegistry 38 → 72 with the FPO-as-its-own-actor work;
testFpos 337 → 364 with FPO focus crops; testConsignments 196 → 214 and testOrders 88 → 107
with the grading split and the single-farmer gate record.)
(`testFpos` went 73 → 162 with the FPO payment/transport models — Phase B below — and
162 → 240 with the grade-separated lot catalog, Phase C, 240 → 325 with the lot quote/confirm
sale loop, Phase D, and 325 → 337 with the pending-membership fix. `testFpoDashboard` 28 → 46.
`testConsignments` 79 → 137 with run release/abandon and the cross-collection one-job rule,
`testOrders` 80 → 88 with that same rule from the other side, and `testStorage` 43 → 62 with
the approximated-coordinate honesty.)

**FPO Rebuild sweep (F0–F2), a real re-run of all 21 suites minus `testPriceOutlook`
(environmental — the AI Flask service was not running in this session): 1639 passed, 0
failed.** `testFpoIntake` **36** (F1, new) and `testFpoSettlement` **22** (F2, new) both in
their own files for the auth-stub reason recorded below. Individual suite counts move release
to release because these tests run against live Atlas — `testFpos` **373**, `testDispatch`
**49**, `testRequirements` **44**, `testStorage` **51**, `testMarketIntel` **49** on this pass;
none of that drift is a regression, it is what the "against real data" discipline this file
insists on actually looks like. **Per the file's own rule: if you cannot run every suite, say
which ones you ran** — this sweep ran 21 of 22, `testPriceOutlook` excluded by name, not by sum.

## Conventions

- **Two visual languages exist.** New marketplace screens use: bg `#F8FAFC`, cards
  `#fff` r18 p16 border `#F1F5F9`, primary green `#16A34A`, dark `#15803D`, tint
  `#DCFCE7`, text `#111827`/`#6B7280`/`#9CA3AF`, `Ionicons`,
  `ActivityIndicator color="#16A34A"`. The **old** palette in
  `src/constants/colors.js` (`#c8d94d`) is for navigator headers, Auth and Profile
  only — do not spread it into new screens.
- **Concurrency:** every state transition is a guarded `findOneAndUpdate` with the
  expected status **in the query filter**, never `if (doc.status === x) { save() }`.
  See `backend/routes/orders.js`.
- **Never trust client identity.** `requireRole()` attaches `req.profile`; take
  name/phone/location from there, not from the request body.
- **Four coordinate shapes exist** in this codebase. Normalise at the boundary with
  `toLatLng()` in `backend/services/geoService.js` — do not add a fifth.
- Frontend `userData` has **`uid`**, not `firebaseUid`.
- Prefer reusing existing patterns over new abstractions. `usePolling` is deliberately
  the only new frontend abstraction added during the FARM Market build.

## Known defects, not yet fixed

- **Nothing in the SIH 26132 problem statement is unbuilt.** All 15 named capabilities
  ship as of Phase H; storage was the last. What remains is depth, not function.
- **`data/fertilizerRules.js`: 28 of 38 crops verified, 10 still are not.** Sources are
  `mh-verified` (28), `tnau-legacy` (6) and `icar-general` (4). Several are confirmed by TWO
  universities independently (Rice, Soyabean, Cabbage, Okra), and eight more by **three editions
  of Krishi Darshani in two unit systems** (see the entry below). Every `mh-verified` entry has
  its document, its figure in the source's own unit, and any disagreement recorded in
  `MH_SOURCES` — promote nothing without adding that citation, and `scripts/testFertilizer.js`
  now enforces exactly that. The farmer-facing caveat is graded by provenance and is NEVER
  silent, including for verified figures.
  **Still unverified — all ten, in full:** `icar-general` Cauliflower, Grapes, Orange (Nagpur
  Santra), Sweet Lime (Mosambi); `tnau-legacy` Ragi (Nachani), Black Gram (Udid), Dry Chillies,
  Carrot, Coconut, Mango (Alphonso/Hapus). Four of them — Grapes, Orange, Mosambi and
  Cauliflower — are genuinely absent from Krishi Darshani, and Mango was searched across all
  1,582 pages and is absent too. **That is a decision, not a backlog.**
  All FIVE university documents in `data/sources/` are mined dry — the remaining crops are
  absent from them, because these are annual RESEARCH BULLETINS, not handbooks: a crop appears
  only if someone ran a trial on it that year. Another pass over those will not help, and
  neither will another pass over Krishi Darshani. The one route that would: ICAR-IISS STCR,
  which covers exactly the missing crops for Rahuri but prescribes from a soil test and a yield
  target this app does not have. Written up in `data/sources/README.md`.
  **⚠️ SOIL HEALTH CARD INPUT IS DECLINED — do not build it.** It was offered as an optional,
  low-priority bonus path and the project owner has ruled it out. Do not add an SHC upload, an
  SHC form, or an STCR prescription that depends on one. **Two existing things are NOT this and
  must stay:** the real Government of Maharashtra *SHC Scheme* entry in `data/schemesData.js`
  (a scheme a farmer can apply for), and the farmer-facing caveat in `dailyTaskEngine.js` that
  says to check your own Soil Health Card — that caveat is the honest ceiling on every dose this
  app prints, and removing it would make the figures look more certain than they are.
  **Zone-level is therefore the permanent ceiling here, and that is the right answer anyway:**
  a printed handbook gives a farmer a figure for their agro-zone and soil type, not a farm-specific
  dose, so the app is already at parity with the best thing available to that farmer offline.
  **A rejected figure is a decision, not a gap:** Dapoli's groundnut 25:50:00 was found
  and NOT taken — Konkan lateritic soil, zero potassium, for a crop grown in western
  Maharashtra. Reasons are recorded beside the citations.

### Fixed — do not "re-fix" these
- **F3 — THE MEMBER SCREENS ARE MERGED: ONE SCREEN, TWO TABS, NOT TWO SCREENS.**
  `Fpo/FpoMembersScreen.jsx` used to be a "Pending" approval queue plus a bare
  name+join-date "Active" list; `Fpo/FpoAllMembersScreen.jsx` was a SEPARATE screen
  showing the same active members with trust bands, crops supplied and a search box.
  `FpoDashboardScreen` linked to BOTH from two different buttons ("Members" →
  the bare list, "See all" → the real one) — an admin managing members had two
  doors into the same room, one of them nearly useless. Verified this was real
  before touching anything, per the standing rule to surface problem + criticality
  before fixing: confirmed live in the code that the "Active" section rendered only
  an icon, a name and a join date, while the separate screen it duplicated carried
  full performance data.
- **`FpoAllMembersScreen.jsx` IS DELETED, NOT KEPT-BUT-UNREACHABLE.** Unlike the
  phone-auth screens or `FpoCollectionScreen` (kept dormant because each is a
  complete, independently working capability that might be restored), this screen's
  entire behaviour now lives inside `FpoMembersScreen`'s second tab — after the
  merge it has zero callers and describing it as "dormant" would be dishonest.
  "If you are certain something is unused, you can delete it completely" (this
  file's own conventions section).
- **THE TWO TABS ARE "Requests" (pending approval) AND "Members" (the real
  searchable/trust-scored list, ported from the deleted screen almost verbatim,
  including its `MemberCard` grid and search-by-name/village/crop).** No
  functionality lost: the approval flow, the crop-match chips, the advisory line,
  the focus-crops context card, the search box, and the drill-through to
  `FpoMemberDetailScreen` are all still there, just under one roof.
- **⚠️ THE MEMBERS TAB HAS TWO DATA PATHS, AND BOTH ARE DELIBERATE.** When opened
  from `FpoDashboardScreen` (which already holds `memberCards` from its own
  `GET /:id/dashboard` fetch), the array is passed via route params and the screen
  reads it directly — no second fetch, same reasoning `FpoAllMembersScreen`'s own
  header comment gave: "two independent fetches are two places for a trust band...
  to read differently." When opened from `FpoHomeScreen`'s "Members" shortcut
  (which has no `memberCards` to hand over), the screen fetches the SAME
  `GET /:id/dashboard` endpoint itself — same computation, not a forked one, just a
  second read of one truth for the one entry point that has no other way to get it.
- **⚠️ THE PILL AND THE "MANAGE MEMBERS" BUTTON WERE LEFT BYTE-FOR-BYTE UNCHANGED
  ON PURPOSE.** `testReachability.js` §7 asserts the exact text
  `navigate('FpoMembers', { fpoId })` for the dashboard's pending-members pill (a
  previously-fixed dead-control bug — see below). Adding `initialTab` there would
  have broken a real regression guard for no gain: with no `initialTab`, the merged
  screen already defaults to the "Requests" tab, which is exactly what that pill and
  button are for. Only the two "See all"/"View performance" buttons — which used to
  point at the now-deleted `FpoAllMembers` route — were changed, to
  `navigate('FpoMembers', { fpoId, userData, members, initialTab: 'members' })`.
- **`FpoHomeScreen`'s three landing-page shortcuts (Members / Focus Crops / Terms)
  were NOT folded in, on purpose.** The original plan also named `FpoHome` +
  `FpoDashboard` as a merge target, but on inspection `FpoHome` is a legitimate
  state-router (none / claim_pending / claim_rejected / active) that only then shows
  a few shortcut links, explicitly commented as intentional ("reachable from the
  dashboard too — this is the shorter path from the landing screen"). That is a
  different, lower-confidence claim than the member-screens duplication, which was
  a plain bare-list-vs-real-list defect — merging it was not confirmed as a real bug
  and was left alone rather than guessed at.
- **EVERY MEMBER CAN NOW SEE WHAT THE GROUP OWES THEM, DEDUCTION BY DEDUCTION —
  `GET /api/fpos/:id/my-settlement`, `Fpo/FpoMySettlementScreen.jsx` (F2).** `computeSettlement()`
  has always been able to answer "where did the rest of my money go" — it was only ever rendered
  to the ADMIN. The number one reason a real FPO loses a member's trust is being told ₹16/kg when
  the group sold at ₹20 and never seeing the fee itemised; this is the first screen that answers
  that question to the person it is about.
- **⚠️ NOT EVERY SALE A MEMBER MAKES IS FPO-FACILITATED, AND THE FEED SAYS SO RATHER THAN GOING
  QUIET.** Selling your own listing independently carries no fee and correctly does not appear
  here — measured against real Atlas data before building this: only 24 of 13,309 delivered member
  orders are pooled (`consignmentId` set), and zero of the remaining 13,285 trace back to
  `custody.heldAt === 'fpo'`. **The correct behaviour today is "show almost nothing," and that is
  honest, not a bug** — F1 walk-in intake only just shipped with no real usage yet. A member with
  nothing facilitated gets an empty state with the reason in words, never a blank screen.
- **A BATCH IS ALWAYS PRICED AS THE FULL GROUP, NEVER AS ONE MEMBER'S SLICE — because
  `apportion()` rounds the TOTAL first and splits after.** Computing settlement on a
  member-filtered order list would round a different number and could disagree with the admin's
  own figure by a rupee. `GET /:id/my-settlement` always calls `computeSettlement()` on every
  order in the member's own batch (the whole consignment, or the standalone order) and filters the
  RESPONSE afterward, never the input. Verified live: a pooled two-member batch (400 kg / ₹12,000
  and 600 kg / ₹18,000 at a 5% facilitation fee) gives the querying member `amount: 11400` and the
  admin's own full-batch view the SAME `11400` for that row, byte for byte.
- **🐛 FOUND WHILE BUILDING THIS: `GET /:id/settlement` LEAKED EVERY MEMBER'S NAME AND FIGURES TO
  ANY MEMBER WHO SUPPLIED A VALID `orderIds` STRING.** The route computed the full group breakdown
  and returned it to WHOEVER called it — an ordinary member, not just the admin or the buyer who
  placed the order, could see every other member's name, quantity and payout. Fixed with the same
  scope split as the new route: `isAdmin` (the officer's job — see everyone) or `isBuyer` (entitled
  to know how their own purchase was divided) get the full `byLot`/`byShare`/`difference`/
  `procurement.gaps`; anyone else gets their OWN rows only, filtered by `farmerUid`, and the
  response carries `scope: 'own'` so a screen cannot mistake a narrowed view for the whole group.
  Verified live with real member accounts: an ordinary member now sees `byLot.length === 1` with no
  trace of the other contributor's name; the buyer who placed the order still sees the full
  breakdown, unchanged.
- **A BATCH IS KEYED ON THE CONSIGNMENT WHEN ONE EXISTS, ELSE ON THE ORDER ITSELF** — a pooled lot
  sale and an F1-held single sale are the same shape to this route (one settlement row per trade
  event), not two code paths.
- **`GRADES BY ORDER` STAYS EXACTLY WHAT `computeSettlement()` ALREADY EXPECTED** — the route
  builds `gradeByOrderId` via the existing `gradesForOrders()` helper rather than a second lookup,
  so a procurement-mode gap can never be computed from a grade the settlement function itself
  would not have used.
- **THE SCREEN IS REACHABLE FROM `FpoScreen.jsx` FOR EVERY ACTIVE MEMBER**, not gated behind
  `isAdmin` or a particular `paymentMode` — a card below the existing admin-only dashboard card,
  navigating to `FpoMySettlement`. **A pre-existing, separate procurement-only card on the same
  screen (reading `/procurement/mine`, a distinct model, `FpoProcurement`) was deliberately left
  untouched** — it answers a narrower, already-working question and merging it in without a full
  audit was out of scope for this pass.
- **`FpoMySettlementScreen` IS FARMER-STACK ONLY, AND THAT WAS CONFIRMED, NOT ASSUMED.**
  `FpoNavigator.jsx` (the `fpo`-role officer's own stack) never registers `FpoScreen` at all — its
  own header comment says why: "My Group" is a farmer's question, and an `fpo`-role account is the
  office, not a member-farmer, per the F2 (the earlier org-as-actor phase) decision log above. With
  no entry point in that stack, `FpoMySettlementScreen` correctly needs no registration there
  either — checked by grepping `FpoNavigator.jsx` for both names, not inferred from doctrine alone.
- **`scripts/testFpoSettlement.js` IS NEW (22 assertions), IN ITS OWN FILE** — same reason as
  `testFpoIntake.js`: `testCollection.js` requires `routes/fpos.js` before any auth stub can apply.
  Covers: a non-member refused, a no-orders member told why in words, an independent sale correctly
  excluded, an F1-held sale's fee math verified exactly, a pooled two-member batch where a member
  sees only their own row with the group-total figure intact, and the `GET /:id/settlement`
  privacy fix from both the member's and the buyer's side.
- **AN FPO CAN NOW RECEIVE ITS MEMBERS' PRODUCE — `POST /api/fpos/:id/intake`,
  `Fpo/FpoIntakeScreen.jsx` (F1).** Produce still has to arrive at the godown somehow after F0
  retired the vehicle-based collection run. This is that "somehow": a member walks in, the group's
  own person weighs and (optionally) grades it at the counter, and custody moves. **NO VEHICLE, NO
  ROUTE, NO FARE.**
- **IT REQUIRES AN EXISTING LISTING, DELIBERATELY.** Intake does not create a lot — it confirms
  that a member's ALREADY-DECLARED listing (from the ordinary harvest-and-list pipeline) has now
  physically arrived. A second place a lot's identity could be invented is exactly the kind of
  fabrication this app refuses everywhere else.
- **CUSTODY MOVES THROUGH THE SAME SHARED FUNCTION THE RUN-BASED PATH USED — not a fork.**
  `transferCollectedStock()`'s per-listing `CropListing.create()` logic was extracted into
  `moveListingToFpoCustody()`, exported from `routes/consignments.js` and imported by `fpos.js`.
  The (retired but kept) run-based path now calls the SAME function in its loop, so there are not
  two definitions of what "this lot is now in the FPO's custody" means.
- **⚠️ FREIGHT OWED IS UNCONDITIONALLY ZERO.** Nothing was hired to move it, so
  `custody.freightOwedPerKg` is always `0` on an intake — never derived from `paymentMode` the way
  a collection run's stop was. `collectionRunId` is honestly `null` rather than pointing at a run
  that never existed.
- **THE FPO'S OWN PERSON MAY GRADE HERE, ALWAYS.** `data/gateRecord.js`'s `GRADING_ROLES` already
  includes `'fpo_admin'` for exactly this case — the group's own person, handling this crop every
  season, whose name is on the sale. There is no hired captain at a walk-in intake to refuse
  grading to, unlike a run collected by the public pool.
- **`CropListing.custody.intake` MIRRORS `Order.pickupOutcome`'S WEIGHT/GRADE/CONDITION BLOCKS
  EXACTLY — same field names, same enums.** So `data/gateRecord.js`'s `describeWeight()`,
  `describeGradeCheck()` and `describeCondition()` apply to a walk-in with no adaptation. Two
  different moments (a captain at a farm gate; an FPO's own person at a godown counter) share one
  vocabulary, not two. Verified: `Schema.path()` checked for every new field before anything was
  written to it — the silent-drop bug class has shipped four times in this project.
- **A PARTIAL ARRIVAL IS THE HONEST COMMON CASE; AN EXCESS ONE IS REFUSED.** A member who said
  500 kg and brought 480 is normal and accepted; a claimed arrival of MORE than the listing ever
  had is refused (`EXCEEDS_LISTING`) — that would be inventing stock.
- **A GRADE CHECK AT INTAKE NEVER REPRICES ANYTHING**, same rule as a captain's gate check — a
  downgrade is a claim (`farmerResponse: null` until the farmer answers it), an upgrade costs
  nobody anything, and an ungraded listing observed for the first time is `observed_only`, not a
  discrepancy — there was nothing to fall short of.
- **THE DASHBOARD TAB THAT F0 REMOVED IS BACK, POINTING AT THE CORRECT CAPABILITY.** Rather than
  leave the slot empty or add a sixth tab, "Collection" became "Receive" (`fpoDashboard.tabIntake`)
  — same position, right feature. `FpoCollectionScreen` stays registered and reachable only by a
  developer restoring its own tab, exactly like the phone-auth precedent.
- **`scripts/testFpoIntake.js` IS NEW (36 assertions), IN ITS OWN FILE.** `testCollection.js`
  already requires `routes/fpos.js` at its own top before any auth stub could apply, so an
  HTTP-level test of the new route could not be retrofitted into that file without fighting its
  require order — a dedicated file, matching testPayment.js/testPhoneAuth.js's own pattern, was
  the correct call, not a compromise.
- **🐛 CAUGHT MID-EDIT: A STILL-LIVE ASSERTION WAS DROPPED AS COLLATERAL DAMAGE.** F0's rewrite of
  `testCollection.js` §8 removed the `/collection-runs`-specific checks and, by editing the same
  block, also removed the unrelated `PUT /:id/premises` check sitting next to them — a completely
  separate, still-fully-live endpoint (the group stating where its own godown is), still called by
  the unchanged screen, still read independently by the dashboard's `producesAggregation` payload.
  Restored, and the dashboard's own comment (which had justified the field by "FpoCollectionScreen
  refuses to arrange a run without it" — no longer true after F0) corrected to say why the field
  exists on its own terms now.
- **F0 — FARM→FPO COLLECTION IS RETIRED.** The problem statement's aggregation clause
  ("buyers may struggle to aggregate consistent volumes") is defined from the BUYER side, and its
  own demo narrative routes a vehicle TO THE BUYER, never to a group's own members. Farm→FPO is a
  1–5 km hop a member covers themselves — no fare, route or pooling problem in that distance worth
  an app solving, and it was making the FPO section more confusing than it needed to be.
  `FpoDashboardScreen`'s "Collection" tab (the sole caller) is removed.
- **THE SCREEN AND ITS NAVIGATOR REGISTRATIONS STAY — same rule as phone auth.**
  `FpoCollectionScreen.jsx` is fully built and fully tested; deleting working, dormant code to
  reach the same result as removing one entry point is churn.
- **⚠️ UNLIKE PHONE AUTH, THIS ROUTE HAD NO INDEPENDENT SAFETY NET, SO THE REFUSAL LIVES IN THE
  ROUTE ITSELF.** Firebase blocks a stray phone sign-in attempt even if a button leaked onto a
  screen; nothing external would have stopped a stray call to `POST /:id/collection-runs` from
  creating a real run with a real fare and real freight owed. It now returns `410
  COLLECTION_RETIRED` before touching the database — verified live against a real FPO admin.
- **`PUT /:id/premises` IS NOT PART OF THE RETIREMENT AND STAYS FULLY LIVE.** It is a separate
  endpoint (the group stating where its own godown is) with its own callers outside the retired
  handler — `producesAggregation`'s dashboard payload still reads `fpo.premises` independently.
  🐛 **Caught mid-edit:** the first rewrite of `testCollection.js` §8 dropped this endpoint's own
  assertion as collateral damage from removing the collection-specific ones sitting next to it.
  Restored, and the dashboard's own comment (which justified the field by "FpoCollectionScreen
  refuses to arrange a run without it" — no longer true) corrected to say why the field still
  exists on its own terms.
- **FREIGHT DEBT COULD NEVER HAVE BEEN CHARGED SILENTLY, AND IT WAS CHECKED, NOT ASSUMED.**
  `custody.freightOwedPerKg` is set in exactly one place — `transferCollectedStock()`, itself
  reachable only from a `Consignment.purpose: 'fpo_collection'` delivery, itself only ever created
  by the now-410'd route. Confirmed live: zero listings carried a non-zero rate before this
  change. The chain is provably closed, not merely believed to be.
- **🐛 THREE PRE-EXISTING TEST/CODE MISMATCHES SURFACED BY RUNNING THE FULL SUITE, NONE CAUSED BY
  F0 — real, deliberate features from earlier work that no test had caught up with.**
  **(a)** `testDispatch`: "truck agent is NOT offered a tempo job" contradicted **Phase 6, B5b**
  ("a bigger vehicle can always do a smaller vehicle's job", reported directly from Nashik
  captains not seeing jobs their truck could carry — fare stays frozen at the job's own rate,
  direction is one-way). Fixed to assert the true rule both ways, adding the missing auto-vehicle
  fixture for "smaller cannot do bigger."
  **(b)** `testTracking` §10/§11: built an own/contracted run via `POST /api/consignments`, which
  is correctly `HIRED_ONLY` — a prior security fix closed exactly that path (a buyer must never
  name an arbitrary FPO's own vehicle and state its cost). `testConsignments.js` had already hit
  and fixed this identical issue (§998, "g3Orders/G3doc"); `testTracking` just hadn't been updated
  to match. Fixed the same way: construct the Consignment directly via the model.
  **(c)** `testRequirements` §2: `mkReq()`'s fixture never set a price, so its own requirement was
  being correctly excluded by a real rule — a want with neither `priceMin` nor `priceMax` set is
  deliberately kept off a farmer's matched feed ("REPORTED DIRECTLY — a want with no price read as
  broken"). Gave the fixture a real price range, and added the missing dedicated test for the
  exclusion rule itself.
- **`testDisputes` and `testMandiSales` showed blank in one batch run and were clean on two
  isolated re-runs — transient Atlas drops**, exactly the pattern already documented above.
  `testPriceOutlook` needs the AI Flask service running (`ai-service && venv/bin/python app.py`)
  to fully pass — without it, 57 of 62 pass and the other 5 correctly degrade to refusals rather
  than wrong answers, which is the additive-layer design working as intended, not a fault.
- **🐛 A BUYER COULD COMMIT AN FPO'S OWN VEHICLE AND STATE ITS PRICE — FOUND IN REVIEW,
  FIXED.** `buildTransportArrangement(body, uid)` took `uid` and never checked it — only
  stamped it as `arrangedBy`. On a lot sale (`POST /lots/confirm`) and a pooled buyer run
  (`POST /api/consignments`) the body comes from the BUYER, so a buyer could send
  `transportMode: 'own'` naming any FPO's id, invent a driver, and state a cost of ₹0 — with
  nobody from that FPO ever consenting. `buildTransportArrangement` now refuses with
  `NOT_FPO_ADMIN` unless `uid === fpo.adminUid`.
- **⚠️ BOTH BUYER-FACING ROUTES ARE NOW HIRED-ONLY, NOT JUST ADMIN-CHECKED — AND THAT WAS A
  SEPARATE, DELIBERATE CALL.** The admin check alone makes non-hired mode PERMANENTLY
  UNREACHABLE on these two routes anyway: both are `requireRole('vendor')`, so the caller can
  never be an FPO admin, and `loadPoolable`/`lots/confirm` additionally require the caller to
  own the orders as their BUYER — which an FPO admin structurally never does. Rather than leave
  a mode selector that always 403s with a confusing NOT_FPO_ADMIN, both routes refuse
  non-hired transport by name (`HIRED_ONLY`) before reaching that check. Verified before
  retiring it: **neither ShareVehicleScreen nor LotOrderScreen has ever sent `transportMode`**,
  so nothing real depended on the capability.
- **🐛 THE COLLECTION-RUN ROUTE ITSELF WAS ALSO BROKEN, SEPARATELY.** `POST
  /:id/collection-runs` called `buildTransportArrangement('own', { statedCost })` — a STRING as
  the body, whose signature is `(body, uid)`. `body.transportMode` therefore read `undefined`
  and silently defaulted to `'hired'` EVERY TIME: an FPO that owns a tempo could never use it,
  a captain was always dispatched, and the officer's stated cost was discarded with no error.
  Fixed to pass a real body (`fpoId` from the ROUTE PARAM, never the request body) plus the
  driver/vehicle/cost fields — which `FpoCollectionScreen` did not yet collect, and now does.
- **⚠️ A FULL TEST-SUITE REWRITE WAS NEEDED, AND IT SURFACED A SEPARATE, REAL GAP.**
  `testFpos.js` and `testConsignments.js` had scaffolded scenarios around a VENDOR test account
  creating an "own" run naming an FPO — i.e. they encoded the exploit as "working as intended".
  Reconstructing the grading-at-the-gate scenario (`testConsignments.js` §14) through a
  legitimate path led to discovering that **`recordStopOutcome()` has no branch for a stop with
  no `orderId` at all** — a genuinely separate, pre-existing gap: an FPO collection run
  (farm→FPO) can be CREATED and, on delivery, transfers custody, but there is currently **no
  real per-stop recording path** for it once the buyer-run OTP-verification code assumes
  `stop.orderId` is always present. `testCollection.js` never caught this because it simulates
  the collected state directly rather than driving `/stop-outcome` over HTTP. **Filed, not
  fixed — out of scope for this pass.**
- **🐛 AN FPO ADMIN GOT A 403 OPENING A MEMBER'S RECEIPT.** `GET /:id/receipt` resolved the
  reader's role by matching `farmerUid`/`vendorUid`/`agentUid` only — `FpoOrdersScreen` offers
  "Open receipt" on every delivered order in the group, and every tap from an `fpo`-role
  account failed with "You were not part of this order," on an order belonging to their own
  member. Fixed with the SAME gate `routes/disputes.js` already uses for the grievance trail:
  the admin of the ACTIVE (or pre-status-gate, `null`-status) group the order's farmer belongs
  to is admitted; nobody else. Verified live against a real FPO and a real delivered member
  order: admin → 200, unrelated account → still 403.
- **🐛 A FARMER'S JOIN REQUEST HAD NO OPENABLE CONTROL FOR THE FPO TO ACT ON IT — REPORTED
  DIRECTLY.** Verified live end-to-end FIRST, against a real FPO: `POST /:id/join` →
  `GET /:id/members/pending` → `POST /:id/members/:uid/approve` all returned 200 with the full
  crop-match detail intact. **The backend was never the problem.**
- **THE BUG WAS `FpoDashboardScreen`'s "N members waiting" PILL — STYLED LIKE A BUTTON, WIRED
  TO NOTHING.** It sits at the very TOP of the screen — rounded, amber, bold — reading exactly
  like the thing to tap the moment somebody is waiting. It was a plain `<View>` with no
  `onPress`. The real control ("Manage Members") worked the entire time, further down the
  screen, generically labelled — nobody who tapped the eye-catching pill ever found it. **Same
  dead-control defect class already recorded twice** (a GSTIN badge that could never be earned;
  an Orders icon pushed off screen).
- **FIXED BY MAKING THE PILL ITSELF NAVIGATE, NOT BY ADDING A THIRD CONTROL.** It now opens
  `FpoMembers` directly — the same destination the "Manage Members" button already reaches, so
  there is still only one screen that handles approval, just two ways in. `FpoHomeScreen`'s own
  pending badge was checked too and was already correctly wired (its `onPress` sits on the
  parent row) — only the dashboard's pill was broken.
- **🐛 THE FARMER'S "MARKET" SCREEN SHOWED EVERY OTHER FARMER'S LOTS — REPORTED DIRECTLY AND
  REMOVED, NOT JUST HIDDEN.** Phase 2a's original design reused the buyer's `GET
  /api/listings/market` feed on the theory that price discovery meant seeing the whole market.
  The project owner explicitly said no: a farmer opening this screen wants to post their own
  produce and see if a buyer is interested — not browse a feed of other farmers' harvests.
  `screens/Farmer/FarmerMarketScreen.jsx` no longer calls `/market` AT ALL.
- **IT NOW CALLS `GET /api/listings/farmer/:uid` — THE SAME ENDPOINT `FarmerSalesScreen` ALREADY
  USES.** That route is scoped server-side to the caller's own uid (403 otherwise), already
  returns `committed` (kilograms waiting on / stuck with a captain, so sold stock never
  silently vanishes from the farmer's own view), and needed no backend change at all. Reusing it
  means there is no second "what are my own listings" implementation to drift.
- **THERE IS NO TAB BACK TO "EVERYONE'S LOTS."** The `all`/`mine` scope toggle, the search bar,
  the cross-farmer asking-price band, and the location-permission request that ranked the wide
  market by distance are all gone — not hidden behind a setting, removed, because the capability
  itself was the thing reported as unwanted.
- **"LOT" IS THE APP'S WORD FOR ONE LISTING** — one crop, one grade, one quantity, one price; the
  `CropListing` document. **"REQUESTS" ARE BUYER OFFERS** (`routes/offers.js`): a buyer interested
  in a lot can propose a price before it becomes a firm purchase (an Order). The screen's
  "Requests" count reads the exact same `GET /api/offers/farmer/mine` `FarmerSalesScreen`'s Offers
  tab already uses, so the two can never disagree, and tapping it opens straight to that tab via a
  new `initialTab` param rather than landing on Orders and making the farmer hunt for it.
- **🐛 THE FARMER'S MARKET SCREEN COULD ONLY BE BROWSED — NOTHING ADDED TO IT, NOTHING SAID
  WHETHER A BUYER HAD RESPONDED.** Reported directly. `screens/Farmer/FarmerMarketScreen.jsx`
  now carries a "Post harvest" action and a "Requests" indicator (pending offer count), reusing
  existing pipelines rather than forking either one.
- **⚠️ POSTING REUSES `CropDetail → HarvestPostModal`, NEVER A SECOND FORM.** A listing must come
  from a real registered crop with a real yield — `routes/crops.js`'s harvest-and-list requires a
  `cropId` — so the market screen's "Post harvest" opens a picker over the farmer's own
  not-yet-harvested crops (`GET /api/crops/:uid?active=true`, filtered client-side on
  `!isHarvested`) and hands off into the SAME flow `FarmerDashboard`'s crop cards already use.
- **"REQUESTS" READS THE SAME `GET /api/offers/farmer/mine` `FarmerSalesScreen` ALREADY USES.**
  A second count would be a second place for the two screens to disagree about how many offers
  are pending. Tapping it opens `FarmerSales` straight to the Offers tab via a new `initialTab`
  param, rather than landing on Orders and making the farmer hunt for it.
- **🐛 THE MANDI PRICE CHECKER HAD THREE ROUTES CROWDING THE DASHBOARD'S FIRST SCREENFUL —
  REPORTED DIRECTLY AS CONGESTION.** A Quick Row "Prices" button, the Market Prices card's own
  "See all →" link, and (once built) the market screen all opened the same `MarketPricesScreen`.
  Both dashboard entries are removed; the market screen is now the one home for it, alongside the
  other market actions it already gained — one door, not three.
- **THE DASHBOARD'S PRICE-OUTLOOK LINK AND THE MARKET-PRICES TICKER STAY WHERE THEY WERE.**
  They are different questions from "check a specific mandi's price" (the outlook is "what will
  MY crop fetch", the ticker is a glanceable at-a-glance card) and moving them too would have been
  scope creep the report didn't ask for.
- **🐛 "YOUR RATE" WAS BLANK ON OPEN, SO THE FARMER'S OWN FIGURES NEVER SHOWED UNTIL THEY TYPED
  SOMETHING.** Reported directly: "it should automatically forecast price based upon today
  price". The column existed but had no default, which is a real barrier on a screen whose whole
  point is answering "what will my crop fetch".
- **THE DEFAULT IS TODAY'S REAL DISTRICT MANDI MODAL — NEVER AN INVENTED FIGURE.** It is the one
  number the app has without the farmer telling it anything, and it is exactly the number
  `basis.note` already calls "the district mandi modal price, not what any one buyer will pay
  you". It fires ONCE per crop (guarded on both fields being empty), so it can never silently
  overwrite a rate the farmer has already typed in.
- **⚠️ IT STAYS EDITABLE AND SAYS SO, ON PURPOSE.** A farmer's actual selling price is very often
  different from the district modal — that gap is the entire reason this field exists rather than
  the screen just showing the modal alone. The hint text says the number shown is a starting
  assumption, not a check on them.
- **A THIN DISTRICT NOW BORROWS THE NEAREST ONE THAT ACTUALLY REPORTS —
  `saleWindowService.getDailySeriesNearestReporting()`.** A real farmer in Beed asked for an
  Onion outlook and got refused: verified live, Beed's own APMCs reported Onion on only **23** of
  the last 75 days. That refusal was CORRECT on its own — but Dharashiv (~94km) and Solapur
  (~133km) both clear the 35-day bar for the same crop, and giving up when a genuine nearby
  answer exists is a different failure from giving up when nothing nearby has it either (Cotton:
  verified **0 days in Beed and in every one of its five nearest districts** — that refusal
  stands, correctly).
- **🐛 THE FALLBACK'S OWN FIRST VERSION WAS DEAD ON ARRIVAL.** It defaulted to `WINDOW_DAYS` (30),
  and 35 reported days can never fit inside a 30-day window — so `own.length >= MIN_SERIES_DAYS`
  was always false, every neighbor's OWN 30-day check failed the same impossible bar, and the
  function silently fell through to `matchLevel: 'own'` every time, even for a district that
  genuinely clears 35 over the 75-day window D1 actually forecasts from. **Caught by testing
  against the real reported farmer profile, not by re-reading the code that wrote it** — the fix
  was one number (`days = 75`, matching `FORECAST_HISTORY_DAYS`).
- **⚠️ THE DISTANCE IS COMPUTED FROM `data/districtCentroids.js`'s `MH_DISTRICT_CENTROIDS`, NOT
  GUESSED.** `agmarknetService`'s existing `ADJACENT_DISTRICTS` map is a narrow hand-curated list
  for six known problem districts (renamed districts, Mumbai's split suburbs) — not a general
  Maharashtra geography graph, and Beed is not a key in it. Reusing the already-vetted per-district
  centroid coordinates and real haversine distance avoids hand-guessing geography for the other 30
  districts, which is exactly the kind of thing that goes quietly wrong if guessed.
- **⚠️ THE SUBSTITUTE DISTRICT IS NAMED TO D1 BY ITS OWN NAME, NEVER MISLABELLED AS THE FARMER'S
  OWN.** `getDailySeries()`'s own no-blending rule ("would quietly average Nashik onion with
  Nagpur onion and call it a local price") stays intact — the fix does not blend two districts'
  series, it substitutes ONE neighbor's OWN series under that neighbor's OWN name, so D1's
  per-district learned pattern is never confused. The response names `districtSource.district`
  and `matchLevel` (`own` | `nearby_district`) so the screen must say whose prices it is showing.
- **THE SCREEN SHOWS IT AS A BANNER, NOT BURIED IN A FOOTNOTE.** "Beed hasn't reported this crop
  enough recently, so this is based on Dharashiv's prices — the nearest district that has (~94 km
  away)." A farmer reading a forecast has to know whose mandi it actually describes.
- **D2 (SELL/HOLD) DELIBERATELY STAYS ON THE FARMER'S OWN DISTRICT, UNCHANGED.** The reported
  complaint was about D1's forecast and the statistical read; widening D2 the same way was out of
  scope and not verified, so it was left alone rather than guessed at.
- **🐛 "FOR EVERY CROP IT SAYS NO PRICE FORECAST" — REPRODUCED LIVE, AND IT WAS TWO THINGS,
  ONLY ONE OF THEM A BUG.** Traced against a real farmer profile in Beed: Onion had only **23**
  of the last 75 days reported, Cotton and Tomato had **0** — a genuine gap in THAT district's own
  mandi reporting, and correctly refused with `INSUFFICIENT_HISTORY` (Wheat, 38 days, and
  Soyabean, 33, forecast fine in the same district). **That half is not a bug — it is the app
  refusing rather than inventing, exactly as designed.**
- **⚠️ THE REAL BUG: THE REFUSAL ALREADY CARRIED THE ACTUAL NUMBER AND NEVER SHOWED IT.**
  `saleWindowService.getForecastOrRefusal()` has always returned `reportedDays` on this refusal,
  and `routes/mandi.js` already forwards it (`{ available: false, ...fc }`) — the screen simply
  never rendered it, so every INSUFFICIENT_HISTORY refusal read as the same generic sentence with
  no way to tell "23 of 35 needed" from "0 reported at all". Fixed by rendering it: "Only 23 of
  the last 75 days had a reported price here — at least 35 are needed."
- **A FULL PER-DISTRICT PRE-FILTER ON THE PICKER WAS MEASURED AND REJECTED AS TOO SLOW.**
  Checking real reported-day counts for even 16 of the 33 servable crops, cold, against one
  district took **24 seconds** (each crop is its own Agmarknet monthly-series fetch); all 33
  would roughly double that. The picker still offers all 33 servable crops — it just now explains
  ITS OWN refusal honestly per crop, in the same request that already had the number, rather than
  paying an expensive up-front check to avoid ever showing a refusal at all.
- **🐛 THE OUTLOOK CRASHED — `Cannot read property 'commodity' of null` — REPORTED LIVE BY
  THE PROJECT OWNER, minutes after the crop-picker fix above shipped.** Two `useFocusEffect`s
  fired together on mount: `load()` ran while `commodity` was still `null` (the default-crop
  lookup is async), set `loading: false` and returned early with `data` untouched; `loadCrops()`
  then resolved and called `setCommodity(own.commodity)` — which re-rendered PAST every guard
  (loading false, commodity now truthy, no error) straight into `data.commodity`, and `data` was
  still `null`.
- **⚠️ THE ROOT CAUSE: `useFocusEffect` ONLY RERUNS ON A FOCUS EVENT, NEVER MERELY BECAUSE A
  DEPENDENCY CHANGED.** `load()` was wired to it, so once `commodity` updated asynchronously
  nothing re-invoked `load()` for the crop that had just been chosen. Replaced with a plain
  `useEffect(() => { load(); }, [load])`, which reruns whenever `commodity`/`district`/`applied`
  change — covering both "the default crop just resolved" and "the farmer tapped a different
  chip". A second `useFocusEffect` (`if (commodity) load()`) keeps the refresh-on-refocus
  behaviour without re-fetching twice on mount.
- **BELT AND SUSPENDERS: A NULL-DATA GUARD SITS BEFORE THE RENDER THAT READS `data.commodity`.**
  Even with the effect fixed, nothing should read into a payload that has not landed yet — the
  same discipline this app already applies everywhere else (a price summary can never take a
  screen down with it). `scripts/testPriceOutlook.js` §9 is the guard against a re-introduction,
  and also re-asserts the hooks-above-first-early-return rule this fix had to respect.
- **🐛 THE PRICE OUTLOOK OPENED ON ONE ARBITRARY CROP — REPORTED BY THE PROJECT OWNER, who
  asked why it only ever showed Bengal Gram.** The screen took `commodity` straight from
  `route.params`, and its only caller passed **`mandiPrices[0].cropName`** — the FIRST row of the
  dashboard's nearby-price ticker. So whichever crop that endpoint happened to return first was
  the only crop the outlook could ever show, and **a farmer had no way to ask about their own
  crop at all**. The model was fine; the entry point was the whole bug.
- **THE SCREEN NOW OWNS THE CHOICE, AND OPENS ON ONE OF THE FARMER'S OWN CROPS.**
  `GET /api/mandi/forecastable-crops` returns what D1 will actually answer for, with the caller's
  registered crops flagged `mine` and floated to the top. The dashboard link passes no commodity.
- **⚠️ THE PICKER IS BUILT FROM THE MODEL'S OWN SERVING GATE, NOT A SECOND COPY OF THE
  THRESHOLDS.** `price_forecast_engine.servable()` applies exactly the rule `forecast()` applies
  (beat the naive baseline AND clear `MAX_SERVE_MAPE`), so the picker can never offer a crop the
  model then refuses. Live: **33 served, 2 refused** (Methi(Leaves) and Sunflower, both
  `NO_SKILL`). A second copy of the gate would drift and put a dead option on screen.
- **THE REFUSED CROPS ARE NAMED ON THE PICKER WITH BOTH NUMBERS, NOT HIDDEN.** A farmer looking
  for Methi is told the model scores 168.07% against a 159.31% naive baseline, rather than left
  wondering why their crop is missing from the list. Absence with no explanation reads as a bug.
- **D1 IS NOW A FARMER-FACING SCREEN — `GET /api/mandi/price-outlook`,
  `screens/Farmer/PriceOutlookScreen.jsx` (Phase 4).** ⚠️ **NOTHING WAS TRAINED.** D1 has
  shipped since Phase D (LightGBM, 1.92M rows, 36 commodities, **15.51% MAPE vs 17.45% naive
  persistence**, 33 of 35 commodities beating persistence) and was reachable only as a 7/14-day
  aside inside `sale-window`, consumed by a harvest modal and a BUYER's listing screen. The
  farmer — the person the model exists for — had no screen that answered "what is this likely to
  fetch over the next fortnight". The defect was surfacing, not modelling.
- **⚠️ THE HORIZON CEILING IS ENFORCED AND THE CLAMP IS REPORTED.** `MAX_FORECAST_DAYS = 14`
  because `train_price_forecast.py` measured MAPE for horizons 1-14 ONLY. A rupee figure on an
  unmeasured horizon is a guess wearing a decimal point. A request for 30 days is clamped AND
  told why — a silent clamp would leave a farmer thinking they had a month's outlook.
- **⚠️ THE FORECAST IS OF THE DISTRICT MODAL, SO A PERCENTAGE IS APPLIED — NEVER A
  SUBTRACTION.** The farmer's own figure is `theirRate × (1 + changePct/100)`. Subtracting a
  modal from a farmer's price is the H2 error that once produced a **₹1.96 lakh "gain" from a
  forecast predicting a 9% FALL** — wrong sign, three extra digits, entirely plausible on screen.
  `basis.forecasts: 'district_modal_price'` travels in the response and the note prints on the
  card, so a screen cannot quietly start reading one as the other. `testPriceOutlook.js` §2
  asserts the sign is right at all 14 horizons against a real ₹22/kg rate, and greps that no
  subtraction of the two bases exists in the route.
- **AGMARKNET QUOTES ₹/QUINTAL AND THIS APP TRADES IN ₹/kg**, so the outlook divides by 100 —
  the same rule already recorded for `priceCheck`. Comparing them directly reports every farmer
  as underpaid by a factor of 100.
- **⚠️ D1's PER-COMMODITY REFUSALS REACH THE SCREEN AS WORDS, AND THAT NEEDED A NEW FUNCTION.**
  `getForecast()` returns **null** on a 422, which throws the reason away — and the reason is the
  most useful thing the model has to say. `getForecastOrRefusal()` hands back `NO_SKILL` (the
  model does not beat assuming today's price holds) or `LOW_SKILL` (above 25% MAPE) with both
  figures. Verified live: **Methi(Leaves) at Nashik refuses with 168.07% model MAPE against a
  159.31% naive baseline** — worse than guessing, and without the gate it would have been served
  as a confident forecast with a rupee figure hung off it.
- **A DEAD SERVICE AND A REFUSING MODEL ARE DIFFERENT FACTS AND GET DIFFERENT WORDS.**
  `SERVICE_UNAVAILABLE` means try again; `NO_SKILL` means this crop cannot be forecast here. One
  generic "no forecast" would tell the farmer to keep retrying something that will never work.
- **⚠️ THE MODEL'S ACCURACY NEVER TRAVELS WITHOUT THE NAIVE BASELINE.** Persistence is a strong
  forecaster for commodity prices, so a bare MAPE says nothing about whether the model is worth
  having. Both numbers print on the card and on the refusal.
- **THE STATISTICAL READ IS COMPUTED BEFORE THE MODEL IS ASKED, AND ALWAYS SHIPS.** The ML is an
  ADDITIVE layer by design: if the Flask service is down the farmer still gets
  `saleWindowService`'s arithmetic over real Agmarknet history, and the refusal panel says so in
  words. Asserted by ORDER in the route, not just by presence.
- **THE PEAK DAY IS SHOWN AND IS EXPLICITLY NOT ADVICE TO WAIT.** Holding costs money and
  produce spoils — that is D2's and H2's question, and this card says so rather than letting a
  high bar read as a recommendation.
- **AN FPO CAN NOW PAY A WHOLE LOT IN ONE ACT — `POST /api/fpos/lots/pay` (Phase 3b).** A lot
  purchase is **N Orders and one Consignment** — one Order per contributing farmer, because each
  member sets their own ₹/kg and each is owed their own line. The in-app rail settles ONE Order,
  so a buyer who bought "2,400 kg of Grade A onion" as a single act had to pay four times and had
  no way to see whether the four together reconciled to what they agreed.
- **⚠️ IT REUSES THE PER-ORDER RAIL'S EXACT GUARDED WRITE, NOT A SECOND DEFINITION OF "PAID".**
  Each order is a `findOneAndUpdate` with `'settlement.farmerPaid': false` and the collected
  statuses IN THE FILTER, so two taps cannot double-settle and a partially-paid lot simply
  resumes. `settlement.txn.simulated: true` is stamped on every one — without it a demonstration
  settlement is indistinguishable from a real one in every query, band and receipt.
- **IT IS PARTIAL-TOLERANT ON PURPOSE, NOT TRANSACTIONAL.** If one line was already settled (or
  is not collected yet) the rest still go through and each outcome is NAMED (`already_paid` vs
  `not_collected`). Refusing the whole lot because of somebody else's tap would strand three
  farmers.
- **🐛 THE RECONCILIATION WAS FIRST WRITTEN AGAINST TWO FIELDS THAT DO NOT EXIST.**
  `computeSettlement()` returns **`byLot[]`** (per-member rows, each `.amount` already net of the
  fee), **`memberPayableTotal`** and **`pooledCropValue`**. It has no `payouts` and no
  `facilitationFee`. Reading the names one would guess yields `undefined`, sums to **0**, and
  reports every lot as reconciling perfectly **while telling the buyer nothing is owed to
  anybody**. This is the READ-side twin of the four silent-drop bugs on the write side, and it is
  why `testCollection.js` §7 now asserts the route reads no field absent from that return.
- **THE INVARIANT IS PROVED ON REAL GROUPS, NOT ASSERTED IN PROSE.** `sum(byLot[].amount) ===
  memberPayableTotal`, checked against eight live FPOs with real orders — all balanced.
  `computeSettlement` is exported for that test **so the suite cannot re-implement the fee
  ordering and end up testing a second copy of the thing under test**. Same reasoning as
  `routes/consignments.js` exporting `orderStops` and `splitFare`.
- **⚠️ THE PHASE 3 BACKEND HAS CALLERS, AND `testCollection.js` §8 IS THE GUARD.**
  `screens/Fpo/FpoCollectionScreen.jsx` calls `POST /:id/collection-runs` and
  `PUT /:id/premises`; `FpoDashboardScreen` routes into it; it is registered in **both**
  navigators. A working endpoint nothing calls is the single most repeated defect in this
  project's history, so the test reads the real frontend source rather than trusting that a
  screen was written.
- **🐛 THE DASHBOARD DID NOT RETURN `premises`, WHICH WOULD HAVE MADE EVERY GROUP LOOK UNSET.**
  `FpoCollectionScreen` branches on `dash.premises.declared` to decide whether to offer the
  collection form at all. With the field absent, `undefined?.declared` is falsy — so every group,
  including ones that had set a godown, would have been shown "this group has not said where its
  godown is" forever. Added to the payload, and asserted.
- **THE ≤5 CAP IS ENFORCED ON THE SCREEN AS WELL AS THE SERVER, AND COUNTS FARMERS.** Selecting a
  lot from a sixth farm is blocked with a reason rather than allowed through to a 400 the officer
  has to decode. Two lots from one member are ONE farm — the vehicle stops there once.
- **A STATED COST IS ONLY OFFERED ON AN own/contracted RUN.** On a hired run the captain fare
  table prices it and a client-supplied figure must never reach the server — the same rule that
  keeps `costSource` derived from the mode rather than taken from the body.
- **🐛 THE FARMER HAD NO MARKET — `GET /api/listings/market` NOW ADMITS THEM, AND IT IS THE SAME
  ROUTE, NOT A FORK.** A farmer could post a harvest and then had no way to see the market they
  had posted into: not their own lot beside anyone else's, not what the same crop is being asked
  two talukas away, nothing. **In an app whose problem statement is PRICE DISCOVERY, the actor
  with the least price information was the only one with no market screen.**
  `screens/Farmer/FarmerMarketScreen.jsx`, reached from a banner on `FarmerDashboard`.
- **⚠️ REUSING THE BUYER'S FEED IS THE WHOLE POINT.** That route already ranks by `$near` IN THE
  DATABASE and reports `total`/`shown`/`hasMore` honestly — a farmer variant would be a second
  place for every one of those to drift, and **every one of them has already been a real bug
  here**. The gate widened (`requireRole('vendor', 'farmer')`); the projection did not.
  `MARKET_FIELDS` still strips `farmerPhone` and the whole `vendor*` block, so a farmer sees
  exactly what a buyer sees. `testFarmMarket.js` §2 asserts no buyer-only field leaks.
- **`mine` IS DERIVED FROM THE VERIFIED TOKEN AND IS ALWAYS A BOOLEAN**, never absent. An absent
  key would leave a screen inferring ownership from a uid client-side, which is the identity
  check this codebase refuses everywhere else.
- **⚠️ THE FARMER'S MARKET IS READ-ONLY AND HAS NO OFFER OR BUY CONTROL.** Those are a buyer's
  actions and the server would refuse them, so putting one there would be the dead-control defect
  this project has already shipped twice (a GSTIN badge that could never be earned; an Orders
  icon pushed off screen). Asserted in `testReachability.js` §1.
- **`priceContext` ANSWERS "WHAT ARE OTHERS ASKING?" — AND IT IS AN ASK, NOT A TRADE.** Per crop,
  computed over the **whole filter, never the page** (a median of the 60 nearest lots moves every
  time the farmer scrolls). ⚠️ **A live listing is an OPEN OFFER**: nobody has agreed to it and
  some of these lots will never sell at the figure on them. Reading a column of asks as "the
  going rate" is the same error as reading a mandi modal as a farmer's own price, so the basis is
  named (`listings_asking`) and the caveat travels in the response where a screen cannot forget
  to hardcode one. `priceBandService` still owns the REALISED-price question against Agmarknet
  arrivals; these are two different questions and must not be merged.
- **BELOW `MIN_LOTS_FOR_BAND` (4) THE BAND IS REFUSED AND THE COUNT IS REPORTED** — a "range"
  over two or three opinions invites a farmer to price against noise. Same doctrine as
  `trustService`'s `MIN_TRADES_TO_SCORE`. Junk prices are filtered before the median and a
  non-finite result leaves as a refusal, never as a number — the `priceCheck` NaN rule again. The
  whole block is wrapped so **a price summary can never take the market feed down with it**.
- **🐛 AN FPO COULD NOT FIND ITS OWN ORDERS — `GET /api/fpos/:id/orders`.** `GET /:id/settlement`
  can divide money across members but **REQUIRES `orderIds`**, and nothing anywhere listed a
  group's orders. So an officer could settle orders they had no way to find, and neither the
  officer nor a member could answer the three questions the group turns on: what was sold, what
  has been PAID, what is outstanding. `screens/Fpo/FpoOrdersScreen.jsx`, registered in **both**
  navigators (the shared dashboard links to it from the legacy farmer-admin stack and the
  `fpo`-role stack) and reached from `FpoDashboardScreen`.
- **⚠️ TWO AUDIENCES, TWO SCOPES, AND THE SERVER DECIDES WHICH YOU ARE.** The admin gets
  `scope: 'group'` (every member's orders — that is the officer's job); a member gets
  `scope: 'own'`. **A member is not entitled to another member's payout, price or payment record
  just by belonging to the same company.** The screen renders the scope it is handed and never
  infers it from the role. A member is also TOLD the view is narrowed, rather than left wondering
  where everyone else's orders went.
- **🐛 `settlement.advance.outstanding` AND `.amount` DO NOT EXIST AS STORED PATHS, AND READING
  THEM WOULD HAVE BEEN SILENT.** The stored field is **`agreedAmount`**; `outstanding` is
  COMPUTED. `undefined` renders as "no advance agreed" — **precisely the conflation the advance
  work exists to prevent**, since a promise the buyer made and did not keep is the farmer's whole
  problem and must never look identical to no promise at all. Caught by checking
  `Order.schema.path()` for every field before writing the reader, which is the same discipline
  that has caught four silent-drop bugs on the WRITE side. The route calls
  `paymentExposureService.exposureFor()` — the one place that arithmetic lives, including the
  deliberately **un-clamped negative balance** for a short pickup where the farmer ends up
  holding the buyer's money.
- **⚠️ `settlement.txn.simulated` IS SURFACED ON THIS SCREEN, PER ORDER AND IN THE TOTALS.**
  Without it a demonstration transaction is indistinguishable from a real settlement to whoever
  reads a group's payment history. Same rule already recorded for the receipt.
- **PAID / UNPAID / ADVANCE-ONLY ARE THREE STATES AND THE CARD RENDERS THREE.** `farmerPaid`
  means FULLY settled; an outstanding promise gets its own line in its own words
  (*"a promise, not money"*).
- **⚠️ `status: { $in: ['active', null] }` ON THE MEMBER LOOKUP, AGAIN.** Member rows written
  before the approval gate have no `status` and `.lean()` does not apply defaults, so an equality
  check silently evicts every founding member of every seeded group. Already recorded once;
  repeated in the route because it is exactly the kind of thing a later tidy-up "simplifies".
- **THE CAPTAIN'S HISTORY MOVED ONTO THEIR DASHBOARD, BELOW THE JOB POOL.** `AgentTripsScreen`
  existed and was reachable **only from a header control**. A driver's finished trips, kilometres
  and earnings are the second thing they open the app for, after work itself — a 21px header icon
  is not a route to that. **⚠️ It sits OUTSIDE the `online` gate deliberately:** the duty toggle
  exists to control the JOB FEED, and what you have already earned is yours to look at on or off
  duty. Going off duty once made a captain's ACTIVE job vanish for exactly this reason — a gate
  right for the feed applied to something that was not the feed.
- **THE BUYER NEEDED NOTHING AND WAS LEFT ALONE.** `VendorOrdersScreen` already reaches the
  receipt through a computed screen name (`item.status === 'delivered' ? 'Receipt' : 'TrackOrder'`)
  — which a `navigate('Receipt'` grep MISSES. **Recorded because the near-miss is the lesson:**
  the brief's own instruction to grep for a CALLER before assuming something is missing has to
  survive a caller that is not a string literal, or the "fix" is a duplicate control.
- **⚠️ `schema.path()` RETURNS UNDEFINED FOR A NESTED OBJECT, AND THAT IS A FALSE POSITIVE —
  ADD IT TO THE SWEEP GOTCHAS BESIDE `.$.`.** `settlement` is declared as a nested object, not a
  subdocument, so it has **no path of its own while every leaf under it does** — verified against
  a real `.select('settlement')`, which returns `farmerPaid`/`paidAt`/`method`. A field-existence
  sweep using `path()` alone reports it MISSING when it is not. Check `schema.nested[p]` too.
  This cost one red assertion in `testReachability.js` before it was recognised.
- **⚠️ A `testFarmMarket` ASSERTION ENCODED THE OLD RULE AND WAS A FIXTURE ASSUMPTION, NOT A
  CODE BUG** — the third time this suite has done it. `403, 'farmers cannot browse the vendor
  market'` was asserting the very thing Phase 2a set out to change. What actually mattered in it
  was that the feed does not hand out buyer-only data, so that is what it asserts now: the gate
  widened, the projection did not.
- **AN FPO CAN NOW COLLECT ITS MEMBERS' PRODUCE IN TO ITS OWN GODOWN —
  `POST /api/fpos/:id/collection-runs`, `Consignment.purpose: 'fpo_collection'`.** Every
  consignment before this moved crop from a farm to a BUYER against Orders that were already
  placed and priced. This one moves a member's produce to the GROUP'S OWN PREMISES **before
  anybody has bought it**: no vendor, no Order, no price. `scripts/testCollection.js` (**31
  assertions**) is the guard.
- **⚠️ IT EXTENDS `Consignment` RATHER THAN ADDING A SECOND MODEL, AND THAT IS THE WHOLE POINT.**
  A collection run needs per-stop outcomes, the gate record, the by-weight fare split, the exact
  ≤5-stop ordering, release/abandon, live tracking and the captain pool — all of which already
  exist in `routes/consignments.js` and **none of which may be forked**. `orderStops`,
  `splitFare`, `buildTransportArrangement`, `priceLotRun` and `dispatchWindow` are all imported,
  not reimplemented. A parallel `CollectionRun` model would be a second copy of every rule in
  that file, and this decision log is largely a list of what happens when one of those drifts.
- **`purpose` DEFAULTS TO `'buyer_order'`, SO NOTHING WAS MIGRATED AND NO DOCUMENT MOVED.**
  `vendorUid` and `stops[].orderId` are now **conditionally** required (`required: function ()`),
  and `testCollection.js` §1 asserts BOTH directions: a buyer run with no `vendorUid` is still
  rejected, a buyer stop with no `orderId` is still rejected, and a collection run needs neither.
  A collection run's `vendorUid` stays null, which also keeps it out of every buyer-scoped query
  (`/vendor/mine`, `/vendor/purchases`) for free rather than by a new condition.
- **🐛 `orderId` WAS SECRETLY THE STOP'S ADDRESS, ACROSS 54 CALL SITES.** Not just a reference —
  `writeStopOutcome` matched on `$elemMatch: { orderId }`, and every recording screen posts
  `{ orderId, otp }` to say WHICH farm. Collection stops have no Order, so they had nothing to be
  addressed by. **The fix needed no new field: Mongoose has always minted an `_id` on each stop
  subdocument and nothing was using it.** `findStop()` resolves `stopId` OR `orderId` to that
  `_id`, so every existing caller and screen keeps working untouched and there is ONE addressing
  path rather than one per purpose.
- **⚠️ `findStop()` REFUSES A REQUEST THAT NAMES NEITHER KEY.** On a collection run EVERY stop has
  `orderId: null`, so a naive `find(s => s.orderId === orderId)` would match the FIRST stop and
  **silently record a gate outcome against the wrong farmer**. Asserted explicitly in §2.
- **MINTING PLACEHOLDER ORDERS FOR COLLECTION STOPS WAS CONSIDERED AND REJECTED.** It would have
  satisfied the old key with a one-line change. An Order asserts a trade, at a price, to a buyer —
  none of which exist yet — and inventing one to satisfy a database key is the fabrication this
  app refuses everywhere else.
- **⚠️ `Fpo` HAD NO COORDINATES, AND A DISTRICT CENTROID WAS NOT AN ACCEPTABLE ANSWER.** The model
  carried a `district` and nothing finer, so there was no dropoff point for a collection run. A
  centroid would have routed a real vehicle, billed each member a by-weight share of a fare
  computed from it, and quoted a distance — all to a point **nobody's godown stands on**. That is
  the mistake `backfillGeo.js` already refuses (a record with no usable coordinate is LEFT ALONE)
  and that the MSWC import answers with `locationPrecision` rather than pretending 135 warehouses
  on one centroid can be ranked. So the group STATES it (`Fpo.premises`, `PUT /:id/premises`) and
  until it does, creating a run is **refused by name** (400 `NO_PREMISES`).
- **`premises.declared` IS SEPARATE FROM THE COORDINATES**, the same rule as `focusDeclared`
  beside `focusCrops`: absent must never be readable as "this group has no premises". `landmark`
  is free text on purpose — a godown a driver cannot find is a godown the produce does not reach,
  and a lat/lng is not directions. `premises.district` is derived server-side from the coordinate,
  never taken from the body.
- **⚠️ THE ≤5 CAP COUNTS DISTINCT `farmerUid`, NOT LOTS.** A member holding Grade A and Grade B of
  one crop is TWO lots and **ONE gate the vehicle stops at once**. Counting lots would burn a stop
  the run never makes and mis-price the route. Already recorded as the rule Phase D must honour;
  it applies identically here.
- **🐛 AND THE STOCK WOULD HAVE GONE ON CLAIMING TO BE ON THE FARM — `CropListing.custody`.**
  A buyer's run is routed to `CropListing.location`. Once a member's crop has been carried to the
  group's shed, a listing still naming the farm quotes a distance to the wrong point, bills a fare
  share computed from it, and **sends a real tempo to a field where the crop is no longer
  standing**. That is not a display bug, it is a wasted trip billed to somebody.
  `transferCollectedStock()` runs on delivery of a `fpo_collection` run.
- **⚠️ ONLY WHAT ACTUALLY ARRIVED MOVES.** A short pickup leaves part of the lot at the godown and
  part in the field, and **one document cannot be in two places**: the source listing is
  decremented by the collected weight (guarded in the FILTER, so two deliveries cannot both draw
  it down) and a SEPARATE listing is created at the premises. Moving the whole listing would
  assert that produce still standing in a field is sitting in a shed. Verified: 500 kg with 300
  collected leaves 200 on the farm and 300 at the godown, and **no kilogram is created or lost**.
- **⚠️ CUSTODY MOVES; OWNERSHIP DOES NOT.** `farmerUid`, `pricePerKg` and `grade` ride across
  untouched — the FPO is **holding** the member's produce, not buying it. That distinction is the
  entire difference between `facilitation` and `procurement`, and rewriting the owner here would
  silently convert every collection into a sale to the group.
- **⚠️ `location` AND `geo` MOVE TOGETHER, AND `geo.coordinates` IS `[lng, lat]`.** Writing one
  without the other leaves the lot findable at its OLD position by every radius query and shown at
  its new one everywhere else, with no error — the `User.geo` defect, in a new place. Asserted.
- **`custody.originLabel` KEEPS THE FARM IT CAME FROM.** Once `location` names the shed, that is
  the only record of where the produce was grown, and a buyer asking "where is this from" is
  asking about the farm, not the shed.
- **🐛 `cropId` IS REQUIRED ON `CropListing` AND IS CARRIED OVER, NOT MINTED — CAUGHT BY RUNNING
  IT, NOT BY READING IT.** The first version of `transferCollectedStock()` threw
  *"cropId: Path `cropId` is required"* on a live write. Carrying produce to a shed does not make
  it a different crop, and a fresh id would orphan the held stock from the farmer's own harvest and
  yield record. `landId`/`plotId` ride across for the same reason, and `location.city` (also
  required) falls back to the FPO's name rather than `''`.
- **THE CUSTODY TRANSFER HAS ITS OWN try/catch AND CANNOT UN-DELIVER THE RUN.** The vehicle
  arrived and the code was right; that fact must not be rolled back because a listing write
  failed. The failure is REPORTED in `custody` so it can be put right, never swallowed into a
  success that looks complete.
- **⚠️ `stops[].listingId` HAD TO BE DECLARED ON THE SCHEMA AND WAS ALMOST NOT.** Mongoose strict
  mode drops an unknown key **silently — no error, no write** — so writing it without the schema
  line would have produced a run that looked perfect in the API response and carried **no link to
  any stock at all**. Caught by checking `schema.path()` for every written key BEFORE running
  anything. That is the fifth time this failure class has been caught in this project; it is
  required on a collection stop for exactly the reason `orderId` is required on a buyer stop.
- **AN OWN/CONTRACTED COLLECTION RUN STILL MUST NOT SET `isActiveJob`** — the partial unique index
  keys on `agentUid` where `isActiveJob` is true, so two agentless runs would both key on null and
  the second would fail with a duplicate key. Same rule as a buyer run, restated at the new call
  site because it is invisible until it bites.
- **THE FARMER HAD NO MARKET — `GET /api/listings/market` NOW ADMITS THEM, AND IT IS THE SAME
  ROUTE, NOT A FORK.** A farmer could post a harvest and then had no way to see the market they
  had posted into: not their own lot beside anyone else's, not what the same crop is being asked
  two talukas away, nothing. **In an app whose problem statement is PRICE DISCOVERY, the actor
  with the least price information was the only one with no market screen.**
  `screens/Farmer/FarmerMarketScreen.jsx`, reached from a banner on `FarmerDashboard`.
- **⚠️ REUSING THE BUYER'S FEED IS THE WHOLE POINT.** That route already ranks by `$near` IN THE
  DATABASE and reports `total`/`shown`/`hasMore` honestly — a farmer variant would be a second
  place for every one of those to drift, and **every one of them has already been a real bug
  here**. The gate widened (`requireRole('vendor', 'farmer')`); the projection did not.
  `MARKET_FIELDS` still strips `farmerPhone` and the whole `vendor*` block, so a farmer sees
  exactly what a buyer sees. `testFarmMarket.js` §2 asserts no buyer-only field leaks.
- **`mine` IS DERIVED FROM THE VERIFIED TOKEN AND IS ALWAYS A BOOLEAN**, never absent. An absent
  key would leave a screen inferring ownership from a uid client-side, which is the identity
  check this codebase refuses everywhere else.
- **⚠️ THE FARMER'S MARKET IS READ-ONLY AND HAS NO OFFER OR BUY CONTROL.** Those are a buyer's
  actions and the server would refuse them, so putting one there would be the dead-control defect
  this project has already shipped twice (a GSTIN badge that could never be earned; an Orders
  icon pushed off screen). Asserted in `testReachability.js` §1.
- **`priceContext` ANSWERS "WHAT ARE OTHERS ASKING?" — AND IT IS AN ASK, NOT A TRADE.** Per crop,
  computed over the **whole filter, never the page** (a median of the 60 nearest lots moves every
  time the farmer scrolls). ⚠️ **A live listing is an OPEN OFFER**: nobody has agreed to it and
  some of these lots will never sell at the figure on them. Reading a column of asks as "the
  going rate" is the same error as reading a mandi modal as a farmer's own price, so the basis is
  named (`listings_asking`) and the caveat travels in the response where a screen cannot forget
  to hardcode one. `priceBandService` still owns the REALISED-price question against Agmarknet
  arrivals; these are two different questions and must not be merged.
- **BELOW `MIN_LOTS_FOR_BAND` (4) THE BAND IS REFUSED AND THE COUNT IS REPORTED** — a "range"
  over two or three opinions invites a farmer to price against noise. Same doctrine as
  `trustService`'s `MIN_TRADES_TO_SCORE`. Junk prices are filtered before the median and a
  non-finite result leaves as a refusal, never as a number — the `priceCheck` NaN rule again. The
  whole block is wrapped so **a price summary can never take the market feed down with it**.
- **🐛 AN FPO COULD NOT FIND ITS OWN ORDERS — `GET /api/fpos/:id/orders`.** `GET /:id/settlement`
  can divide money across members but **REQUIRES `orderIds`**, and nothing anywhere listed a
  group's orders. So an officer could settle orders they had no way to find, and neither the
  officer nor a member could answer the three questions the group turns on: what was sold, what
  has been PAID, what is outstanding. `screens/Fpo/FpoOrdersScreen.jsx`, registered in **both**
  navigators (the shared dashboard links to it from the legacy farmer-admin stack and the
  `fpo`-role stack) and reached from `FpoDashboardScreen`.
- **⚠️ TWO AUDIENCES, TWO SCOPES, AND THE SERVER DECIDES WHICH YOU ARE.** The admin gets
  `scope: 'group'` (every member's orders — that is the officer's job); a member gets
  `scope: 'own'`. **A member is not entitled to another member's payout, price or payment record
  just by belonging to the same company.** The screen renders the scope it is handed and never
  infers it from the role. A member is also TOLD the view is narrowed, rather than left wondering
  where everyone else's orders went.
- **🐛 `settlement.advance.outstanding` AND `.amount` DO NOT EXIST AS STORED PATHS, AND READING
  THEM WOULD HAVE BEEN SILENT.** The stored field is **`agreedAmount`**; `outstanding` is
  COMPUTED. `undefined` renders as "no advance agreed" — **precisely the conflation the advance
  work exists to prevent**, since a promise the buyer made and did not keep is the farmer's whole
  problem and must never look identical to no promise at all. Caught by checking
  `Order.schema.path()` for every field before writing the reader, which is the same discipline
  that has caught four silent-drop bugs on the WRITE side. The route calls
  `paymentExposureService.exposureFor()` — the one place that arithmetic lives, including the
  deliberately **un-clamped negative balance** for a short pickup where the farmer ends up
  holding the buyer's money.
- **⚠️ `settlement.txn.simulated` IS SURFACED ON THIS SCREEN, PER ORDER AND IN THE TOTALS.**
  Without it a demonstration transaction is indistinguishable from a real settlement to whoever
  reads a group's payment history. Same rule already recorded for the receipt.
- **PAID / UNPAID / ADVANCE-ONLY ARE THREE STATES AND THE CARD RENDERS THREE.** `farmerPaid`
  means FULLY settled; an outstanding promise gets its own line in its own words
  (*"a promise, not money"*).
- **⚠️ `status: { $in: ['active', null] }` ON THE MEMBER LOOKUP, AGAIN.** Member rows written
  before the approval gate have no `status` and `.lean()` does not apply defaults, so an equality
  check silently evicts every founding member of every seeded group. Already recorded once;
  repeated in the route because it is exactly the kind of thing a later tidy-up "simplifies".
- **THE CAPTAIN'S HISTORY MOVED ONTO THEIR DASHBOARD, BELOW THE JOB POOL.** `AgentTripsScreen`
  existed and was reachable **only from a header control**. A driver's finished trips, kilometres
  and earnings are the second thing they open the app for, after work itself — a 21px header icon
  is not a route to that. **⚠️ It sits OUTSIDE the `online` gate deliberately:** the duty toggle
  exists to control the JOB FEED, and what you have already earned is yours to look at on or off
  duty. Going off duty once made a captain's ACTIVE job vanish for exactly this reason — a gate
  right for the feed applied to something that was not the feed.
- **THE BUYER NEEDED NOTHING AND WAS LEFT ALONE.** `VendorOrdersScreen` already reaches the
  receipt through a computed screen name (`item.status === 'delivered' ? 'Receipt' : 'TrackOrder'`)
  — which a `navigate('Receipt'` grep MISSES. **Recorded because the near-miss is the lesson:**
  the brief's own instruction to grep for a CALLER before assuming something is missing has to
  survive a caller that is not a string literal, or the "fix" is a duplicate control.
- **⚠️ `schema.path()` RETURNS UNDEFINED FOR A NESTED OBJECT, AND THAT IS A FALSE POSITIVE —
  ADD IT TO THE SWEEP GOTCHAS BESIDE `.$.`.** `settlement` is declared as a nested object, not a
  subdocument, so it has **no path of its own while every leaf under it does** — verified against
  a real `.select('settlement')`, which returns `farmerPaid`/`paidAt`/`method`. A field-existence
  sweep using `path()` alone reports it MISSING when it is not. Check `schema.nested[p]` too.
  This cost one red assertion in `testReachability.js` before it was recognised.
- **⚠️ A `testFarmMarket` ASSERTION ENCODED THE OLD RULE AND WAS A FIXTURE ASSUMPTION, NOT A
  CODE BUG** — the third time this suite has done it. `403, 'farmers cannot browse the vendor
  market'` was asserting the very thing Phase 2a set out to change. What actually mattered in it
  was that the feed does not hand out buyer-only data, so that is what it asserts now: the gate
  widened, the projection did not.
- **🐛 THE APP TOLD A FARMER "GUAVA = HIGH DEMAND FOR NASHIK" AND THEN HAD NO GUAVA PRICE
  FOR NASHIK. Both sentences came from this app, and THREE separate defects produced them.**
  Fixed in `services/cropRecommendationEngine.js`, `services/agmarknetService.js`,
  `services/groqService.js`, `routes/ai.js`. New suite `scripts/testCropDemand.js` (**26
  assertions**) is the guard.
- **⚠️ (a) THE ABSENCE OF EVIDENCE WAS BEING SUMMED AS EVIDENCE, and this is the doctrine half.**
  `getPriceScore()` returned `{ score: 0, trend: null }` for **five different situations** —
  district unknown to Agmarknet, crop unknown to Agmarknet, no series for that crop in that
  district, a timeout, and a thrown error — and `rankCandidates` then added that 0 to the other
  signals as though it were a measurement. It is not. "Nobody reported a price" and "the price is
  steady" are opposite facts. Meanwhile **"few growers nearby" scores POSITIVE**, so a crop with
  no price data at all could reach `score >= 1.5` and be printed as **High demand**. Absence is
  now CARRIED: `available: false` with a named reason, `score: null`, `demand: null`. Same
  refusal `trustService`, `yieldBenchmarkService` and D1 already make.
- **THE REASONS ARE NAMED AND DISTINCT, NEVER ONE "no data".** `no_mandi_data` (nobody reported
  it here), `reported_elsewhere_only` (it trades in Maharashtra, just not here),
  `crop_not_in_agmarknet`, `district_not_in_agmarknet`, `lookup_failed` (we could not reach the
  service — pull to retry). Those call for different action from the farmer and the strings on
  the card say different things.
- **⚠️ `score` STAYS NULL RATHER THAN BEING COMPUTED FROM THE REMAINING SIGNALS.** A number there
  would be re-derivable into a label by any future caller, which is the whole defect coming back
  through a different door. There is also no `demandLabel(score)` taking a bare number any more —
  `demandFrom(price, score)` cannot be called without the price signal in hand.
- **⚠️ (b) THE "district" PRICE TREND WAS SILENTLY STATEWIDE.** `getTrendForSelection()` falls
  back to markets ANYWHERE in Maharashtra when the farmer's own district has nothing — correct
  for the price screen, which labels the fallback, and completely wrong for a demand read
  presented as being about THEIR district. It did not even return `matchLevel`, so no caller
  could tell. It does now, and the recommender requires `market`/`district`. Live: Drumstick in
  Nashik was being read off **Mumbai APMC** and Turmeric off **Washim APMC**; both now report
  `reported_elsewhere_only` and carry no label.
- **🐛 (c) A FLAT SERIES WAS SCORED AS A RISE.** `trend = last >= points[0] ? 'up' : 'down'` has
  no third answer, so **seven identical reported modals — the real case, Guava at Nasik APMC,
  4500 ×7 — came back as `trend: 'up'`** and earned a +1 "prices rising" score. A ternary with no
  flat branch cannot report "the price is not moving", which is exactly what a farmer deciding
  what to sow needs to hear. Now `'up' | 'down' | 'flat'` with `changePct` beside it. **The 2%
  band is not cosmetic**: mandi modals move several percent between markets in one district in
  one day (the same observation behind `priceBandService`'s ±8%), so a 0.4% drift across a week
  is noise and calling it a direction would make the arrow meaningless.
- **THE PRICE SIGNAL IS WEIGHTED ×2, AND THAT IS DOCTRINE, NOT TUNING.** Demand is a claim about
  the MARKET. At equal weights a single "few other farmers grow it here" (+1) exactly cancelled a
  falling price (-1), so live Coriander at Nasik APMC **down 44.12% in a week** came out as
  "Medium demand" — the same class of statement as the guava bug, just reached from real data
  instead of missing data. Grower count is a SUPPLY signal: it may shade a demand read, never
  overturn the price evidence it qualifies. Thresholds moved with it (High ≥ 2.5, Medium ≥ 0), so
  a falling price cannot reach Medium on grower count alone.
- **⚠️ `signals` AND `demandReason` WERE COMPUTED AND THEN DROPPED BY `routes/ai.js`.** The card
  showed a bare "High demand" adjective with nothing behind it and no way for a farmer to check
  it. Both travel now, and `CropRecommendationScreen` prints the evidence — `▲13.2% this week at
  Pimpalgaon Baswant APMC · 9 growing it nearby`. **A one-word verdict a farmer cannot check is
  how two screens of one app ended up contradicting each other.**
- **⚠️ THE NULL CASE HAD TO BE RENDERED, NOT JUST RETURNED.** The card was
  `crop.demand && (<badge/>)`, so a crop the backend deliberately REFUSED to label rendered
  nothing at all — indistinguishable from a crop that simply had no badge. **A missing chip reads
  as "fine"; the entire point of the refusal is that it is not.** It now renders the reason.
- **🐛 AND THE REFUSAL WOULD HAVE CRASHED THE LAYER THAT PHRASES IT.**
  `explainCropRecommendations`' FALLBACK path called `c.demand.toLowerCase()`, which throws on
  exactly the crops the engine now refuses — **inside the catch block that exists so a Groq
  outage degrades gracefully**. Guarded, and the prompt now explicitly forbids the LLM from
  describing a "demand unknown" crop as being in high or rising demand.
- **⚠️ THE 7-SECOND PRICE BUDGET WAS SILENTLY COSTING EVERY CROP ITS SIGNAL, WHICH IS WHY THE
  BUG WAS INVISIBLE.** Measured cold against live Agmarknet: one `getTrendForSelection` is 2.7s
  for a thin crop and **7.6-16.5s for Onion, Tomato and Soyabean**, because each pulls that
  commodity's whole monthly state series. At 7s every heavily-traded crop timed out — and under
  the old code a timeout scored 0 and was folded into a label, so **on a cold cache the app was
  labelling demand from grower count alone, for every crop.** Raised to 18s.
- **⚠️ A PER-LOOKUP BUDGET IS NOT A BUDGET. `RANK_DEADLINE_MS` (20s) CAPS THE PHASE.** 18
  candidates at concurrency 8 is three waves, so an 18s ceiling permits a ~54s request against
  `CropRecommendationScreen`'s 30s client timeout — the farmer would have got a network error
  instead of recommendations. Measured cold: 37.8s. Crops still in flight at the deadline report
  `lookup_failed` and get no label; a lookup that starts past it opens no connection at all.
- **⚠️ LOWER CONCURRENCY IS FASTER HERE, WHICH IS THE OPPOSITE OF THE OBVIOUS READING.** Each
  lookup downloads a whole monthly state series, so eight in flight starve each other's bandwidth
  and ALL land late. **Measured cold: 18 candidates at concurrency 8 produced ONE usable price
  signal inside the deadline; 12 candidates at concurrency 4 produced TEN, and finished sooner
  (17.4s vs 21.6s).** Warm (6h commodity cache) the whole phase is **362ms**. Do not "optimise"
  the concurrency back up without re-measuring COLD.
- **🐛 THE MANDI "SEE ALL" PICKER WAS AGMARKNET'S NATIONAL LIST — 605 COMMODITIES FROM EVERY
  STATE IN INDIA.** `getAvailableCommodities()` scoped correctly to a district that had reported
  that day, and fell back to `getCommodities()` otherwise — which is **most days, because today's
  report is empty until the markets close**. Measured live 2026-08-27: Nashik today → **605**. A
  farmer scrolling past Cardamom, Almond and Black pepper reads that as the app not knowing where
  they are. `getRegionalCommodities()` is the new fallback: **605 → 127**.
- **THE REGIONAL LIST IS A UNION, AND BOTH HALVES ARE LOAD-BEARING.** (a) every commodity ANY
  Maharashtra market actually reported over the last 7 days — Agmarknet's **own** data about this
  state, not our opinion of what Maharashtra grows, and the half that makes it honest (117
  distinct names over 9 days; the union stops growing after ~4, so a longer window buys nothing).
  (b) the app's own 64 canonical crops from `data/agroZones.js`, **all 64 exact-matching an
  Agmarknet commodity name** — because a crop the recommender can suggest MUST be findable in
  this picker or the two screens contradict each other by construction, and a thin-trade crop
  drops out of (a) in any given week. `testCropDemand.js` §1 asserts all 64 survive.
- **THE DISTRICT-SCOPED PATH IS UNCHANGED AND MUST STAY THAT WAY.** When a district genuinely
  reported commodities that day, that is a better answer than any state-level list. The narrowing
  applies to the FALLBACK only.
- **`scope` TRAVELS AND THE SCREEN SAYS WHICH LIST IT IS SHOWING** —
  `district | state | app | national`. The old single string said *"showing all crops instead"*,
  which was accurate about the national list and is precisely why this looked broken. Replaced by
  one string per scope in both languages. `national` is still reachable in theory and is
  **reported as such rather than passed off as a Maharashtra list**.
- **⚠️ `agmarknetService` REQUIRES `data/agroZones` LAZILY, AND IT MUST STAY THAT WAY.**
  `agroZones.js` requires `agmarknetService` back (for `resolveTalukDistrict`), so a top-level
  require closes a cycle: agroZones loads while this module's exports object is still empty,
  destructures `resolveTalukDistrict` as **undefined**, and silently breaks `resolveZone()` and
  therefore every crop recommendation. Node warns (*"Accessing non-existent property … inside
  circular dependency"*) and **nothing else would**.
- **🐛 THE DASHBOARD'S DAY-CHANGE ARROW WAS READ OFF THE WEEK'S TREND.** `isUp` came from
  `trend.trend` and was then used to colour and sign `dayChangeKg`, so a week trending up with a
  down day printed a green **"+₹-30"**. The arrow beside a number must describe THAT number; it
  is now derived from the day's own change, with `flat` as its own case. Adding `'flat'` upstream
  would otherwise have drawn every steady price as a red collapse, including in `MiniChart`'s
  synthetic fallback shape, which also had only two branches.
- **THE RECEIPT NOW ANSWERS "WAS THIS A FAIR PRICE?" — `services/priceBandService.js`,
  `receipt.priceCheck`.** The app helped a farmer decide WHEN to sell and then went quiet at the
  moment the price was struck: a farmer could agree ₹12/kg on a day the district modal was ₹19 and
  nothing would ever say so. The agreed rate now prints beside the district's own mandi modal.
- **⚠️ IT REPORTS, IT DOES NOT BLOCK OR ACCUSE.** A price below the band is not fraud — grade,
  urgency and a buyer who pays on the day all move a real sale. ±8% because mandi modals for one
  commodity move several percent between markets in one district on one day; a tighter band would
  flag ordinary trades and the flag would stop meaning anything.
- **IT REFUSES RATHER THAN GUESSING.** No arrivals for that crop in that district that week →
  `available: false` WITH THE REASON, never an invented benchmark. Same doctrine as the yield
  benchmark and D1's per-commodity refusal.
- **⚠️ AGMARKNET QUOTES ₹/QUINTAL; THIS APP TRADES IN ₹/KG.** Comparing them directly reports
  every farmer as underpaid by a factor of 100 — the same class of error as H2 subtracting two
  different price bases. Divided by 100, and sanity-checked against real orders (Wheat ₹22.99/kg,
  Soyabean ₹69.29/kg — plausible mandi rates).
- **🐛 TWO BUGS CAUGHT BY RUNNING IT ON REAL ORDERS, both of which "worked" in shape.**
  (a) `resolveDistrictIdByName(stateId, districtName)` takes TWO arguments; called with one it
  filters against `undefined`, matches nothing, and returned *"No Agmarknet district matched
  Wardha"* for a district that plainly exists — **a refusal honest in shape can still be wrong in
  fact**. (b) the series field is **`modalPrice`, not `modal`**, and `arrivals` may be null, which
  produced `modal ₹NaN → WITHIN (NaN%)` on a live Solapur tomato order. NaN on a receipt two
  people may argue over is the "undefined kg/ha" defect again. Now guarded twice — unusable rows
  skipped, and a non-finite result leaves as a REFUSAL, never as a number.
- **IT CAN NEVER BREAK THE RECEIPT.** Agmarknet 403s and times out; the service swallows its own
  errors and the caller adds a second `.catch(() => null)`. A receipt records a trade that
  happened and must render whether or not a price server answers.
- **THE APP HAS ITS OWN PAYMENT RAIL, AND IT MOVES NO MONEY — `POST /api/orders/:id/pay`,
  `components/PaymentSheet.jsx`.** There is no provider behind it. It exists so the whole trade
  can be walked end to end — order → collection → payment → receipt — without a live gateway, a
  bank sandbox or an SMS, which is what the project owner asked for after ruling out UPI and SMS.
- **⚠️ `settlement.txn.simulated: true` IS PERSISTED ON EVERY SUCH PAYMENT AND MUST NOT BE
  REMOVED "to make the demo look cleaner".** Without it a demonstration transaction is
  indistinguishable from a real settlement in every query, every `trustService` band and every
  receipt — the exact failure `dataSource` was added to `Order` to prevent. `scripts/testPayment.js`
  asserts it is stored, and asserts the farmer's own cash `/settle` writes NO txn block.
- **⚠️ THIS IS THE ONE PLACE A BUYER MAY SETTLE, AND THE REASON IS NARROW.** `/settle` stays
  farmer-only. The rule behind it was never "the farmer must tap" — it was **"only the person the
  money lands with can say it landed"**, because with cash, UPI or a bank transfer this app
  genuinely cannot know, and a buyer marking their own cash payment received is the
  self-certification refused everywhere here. A payment on the app's OWN rail is different in
  kind: the platform processed it, so the platform's record is first-hand. **That justification
  evaporates the moment this endpoint is pointed at an off-app method — do not widen it.**
- **THE FARMER IS PAID `farmerPayout`, NEVER `grandTotal`.** The fare is the captain's money and
  was never the farmer's; paying the buyer's headline would overpay the farmer by the whole
  transport cost. Verified live: a ₹24,382 order pays the farmer ₹23,638. Same rule already
  recorded for the captain's trip history reading `agentPayout` and not `grandTotal`.
- **THE REFUSALS ARE NAMED, NOT GENERIC.** `ALREADY_PAID` (and it hands back the ORIGINAL
  reference so the UI can show it) vs `NOT_COLLECTED` — a single "payment failed" leaves the buyer
  unable to tell whether to try again. Guarded as a `findOneAndUpdate` with the expected state in
  the FILTER, so two taps cannot both settle.
- **A `stranded` ORDER IS PAYABLE.** Real crop left a real farm on a run that was abandoned, and
  the farmer is owed every rupee — the same reasoning that already lets `/settle` accept it.
- **THE RECEIPT PRINTS THE SIMULATED LINE, ON SCREEN AND IN THE SHARED TEXT.** A receipt is the
  most forwarded document this app produces — it reaches APMC officers, buyers' accountants and
  whoever the two parties actually trust. A transaction reference with no such note is how a
  simulated settlement quietly starts being read as a real one by people who were never told. The
  `.txt` export carries it too, because that is the copy that actually leaves the app.
- **THE PRINTED SLIP IS A PRESENTATION OF THE SAME `receipt` OBJECT, not a second source.** It is
  monospace and ruled like mandi paper, but every figure on it is the one the detailed card below
  already shows, so the two cannot drift. It prints **PAID TO FARMER**, not a grand total.
- **UPI WAS DESIGNED AND THEN DROPPED BY THE OWNER, and the reasoning is worth keeping.** UPI
  addresses a **VPA** (`name@psp`), not an account number, so it would have needed one new profile
  field and no bank details. Two things made it weaker than the in-app rail for this project:
  the app can validate a VPA's FORMAT but never its OWNERSHIP (the GSTIN check-digit lesson
  again), and the only real safeguard — the payer's own app resolving and showing the payee's bank
  name — lives outside this app entirely. **A GST invoice was also declined**: most unprocessed
  agricultural produce is nil-rated, so it would have printed ₹0 tax or invented a liability.
- **🐛 TWO `nodemon` INSTANCES WERE RUNNING AT ONCE AND THE APP READ IT AS "backend not
  responding".** Both bound port 5050; one won, the other crashed and retried, so `lsof` showed a
  listener while every request timed out — which looks like a network or Atlas problem and is
  neither. **Only ever run one `npm run dev`.** A request that times out rather than being refused
  is the signature of this, not of a dead server.
- **⚠️ PHONE / SMS SIGN-IN IS SWITCHED OFF BY THE PROJECT OWNER — `PHONE_AUTH_ENABLED` in
  `frontend/src/utils/config.js` is `false`, and the code behind it is KEPT ON PURPOSE.**
  The decision: SMS is the one leg of sign-in that can fail in front of an audience — it needs
  the Firebase Phone provider enabled, a handset that actually receives the message, and headroom
  in the SMS quota — for a login email already handles across all 2,183 accounts. **Do not delete
  the phone screens to "clean up".** They are tested (`scripts/testPhoneAuth.js`, 19 assertions)
  and inert: Firebase answers `OPERATION_NOT_ALLOWED`, so nothing can fire even if a control were
  left on screen. Turning it back on needs BOTH the flag and the console toggle.
- **BOTH ENTRANCES ARE GATED TOGETHER — the login button AND the profile's "Phone sign-in"
  card.** Leaving the profile setup visible while sign-in is hidden would offer a user a flow
  whose result they could never use. That is the dead-control defect this project has already
  shipped twice (a GSTIN badge that could never be earned; an Orders icon pushed off screen), and
  it is recorded here so the two are never gated separately.
- **THE SCHEMA CHANGES STAY REGARDLESS, and they are strictly better.** `email` sparse-unique and
  the `RootNavigator` null-email fix are correct whether or not anyone signs in by phone;
  reverting a live index to get back to a worse state would be pure churn.
- **PHONE SIGN-IN EXISTS, AND IT IS A SECOND DOOR — NOT A REPLACEMENT.** `PhoneLoginScreen`,
  `components/auth/RecaptchaModal`, `POST /api/users/me/link-phone`. Email/password is untouched:
  all 2,183 seeded accounts sign in exactly as before, and `scripts/testPhoneAuth.js` §5 asserts
  that an email signup is byte-for-byte unchanged.
- **⚠️ THE PHONE PROVIDER IS NOT ENABLED ON THE FIREBASE PROJECT, so none of it can run yet.**
  Identity Toolkit answers `OPERATION_NOT_ALLOWED` for `sendVerificationCode` on `treeapp-a8061`.
  It is one toggle: **Firebase Console → Authentication → Sign-in method → Phone → Enable**. Every
  refusal path says so BY NAME (`auth/operation-not-allowed` → "Phone sign-in is switched off …")
  rather than blaming the number, because that error otherwise reads as "your phone is wrong".
- **⚠️ `expo-firebase-recaptcha` IS DEAD AND WAS NOT INSTALLED.** Firebase's
  `signInWithPhoneNumber` needs an `ApplicationVerifier`, and the SDK's own `RecaptchaVerifier`
  builds its widget with `document.createElement` — React Native has no DOM. The package that
  used to bridge that is deprecated and does not work with modern Expo/Firebase.
  `components/auth/RecaptchaModal.jsx` implements the same contract (`type: 'recaptcha'` +
  `verify()`) over **`react-native-webview`, which is already a dependency** because Leaflet needs
  it. No new package, so the no-dev-build constraint holds.
- **⚠️ THE WEBVIEW'S `baseUrl` IS LOAD-BEARING.** A reCAPTCHA site key is restricted to the
  domains registered against it, and Firebase registers the project's `authDomain`. HTML injected
  with no baseUrl has an `about:blank` origin, Google refuses the key, and the widget renders and
  then **silently never solves** — no error, just a box that does nothing. It is set to
  `https://${authDomain}`. The site key is fetched from `identitytoolkit/v1/recaptchaParams`
  rather than hard-coded, because it belongs to the project and can be rotated.
- **⚠️ MATCHING AN ACCOUNT BY PHONE NUMBER IS AN ACCOUNT-TAKEOVER VECTOR AND IS DELIBERATELY NOT
  BUILT.** A phone sign-in mints a DIFFERENT Firebase uid from the same person's email account,
  and every profile here is keyed on `firebaseUid` — so the tempting fix is for the server to find
  a User whose `phone` matches the verified number and hand over that profile. `phone` is an
  UNVERIFIED contact field anyone can type into their own profile, it is stale on plenty of rows,
  and **15 numbers in this database are already on two accounts each**. Whoever verified first
  would inherit a stranger's trade history, payment record and grievances.
- **THE SAFE PATH IS LINKING, AND ITS ORDER IS THE WHOLE POINT.** From inside their profile the
  user has ALREADY proved they hold the account; they then prove they hold the phone, and
  `linkWithCredential` keeps the ORIGINAL uid so nothing is orphaned. Signing in by phone first
  would mint a second uid and a second empty profile. Asserted in `testPhoneAuth.js` §6.
- **⚠️ LINKING MUST FORCE `getIdToken(true)`.** The cached ID token was minted BEFORE the link and
  does not carry `phone_number`, so the server refuses it with `PHONE_NOT_LINKED` — correctly, the
  old token proves nothing. Without the forced refresh the link appears to fail for ~1 hour.
- **`phoneAuth.number` IS SEPARATE FROM `phone`, AND THEY MUST NEVER BE MERGED.** `phone` is "how
  to reach you" — shared handsets, typos, stale numbers, printed on receipts. `phoneAuth.number`
  is "the number Firebase sent an SMS to and saw the code come back from". Collapsing them lets an
  unverified contact field act as a credential. It is written **only from the verified token's own
  claim**, never from a request body — asserted in §3, where a request that supplies its own
  `phoneAuth`, `firebaseUid` and `email` has all three ignored.
- **🐛 `email` WAS `required: true, unique: true` AND THE LIVE INDEX WAS NOT SPARSE.** A phone
  sign-in has no email at all. On a non-sparse unique index MongoDB indexes a MISSING field as
  null, so the FIRST phone-only account would save and the **SECOND would fail with a duplicate
  key on null** — in production, at signup, for the second real person to use phone sign-in.
  `scripts/migratePhoneAuth.js` (dry-run by default, idempotent) rebuilds it as
  `{ unique: true, sparse: true }` and adds the same on `phoneAuth.number`. **Changing the
  Mongoose schema does NOT change an index that already exists** — that is why a migration script
  is needed at all.
- **⚠️ THE FIELD MUST BE ABSENT, NEVER `email: null`.** A sparse index still indexes an explicit
  null, so two of them collide and the bug returns through a different door. `routes/users.js`
  spreads the key in only when there is a value, and §1 asserts `email === undefined`. Same
  family as the `geo.type` default that made every user unwritable.
- **THE MIGRATION REFUSES TO BUILD OVER DATA THAT VIOLATES IT.** A unique index fails half-way and
  leaves the collection with no index at all, so duplicate emails, duplicate `phoneAuth.number`
  and literal-null emails are all counted FIRST and reported as sentences.
- **🐛 `RootNavigator`'s OFFLINE FALLBACK CRASHED ON A PHONE ACCOUNT.** It did
  `currentUser.email.split('@')[0]`, which throws *"Cannot read properties of null"* for every
  phone-authenticated user — and this is the OFFLINE path, so it fired exactly when the backend
  was unreachable and the app was meant to degrade gracefully. Now falls back to `displayName` →
  email → `phoneNumber` → a plain label.
- **⚠️ A NEW PHONE ACCOUNT IS ASKED FOR ITS ROLE, NEVER DEFAULTED.** Every navigator, every server
  gate and half the screens branch on `role`, and `role` is deliberately absent from the
  profile-update allowlist so it cannot be self-corrected later. Guessing "farmer" would put a
  buyer in a farmer's app permanently.
- **⚠️ `Alert.prompt` IS iOS-ONLY AND THIS APP'S USERS ARE ON ANDROID.** The first version of the
  link flow used it, which would have been a dead control on the only platform that matters here.
  Replaced with a real `Modal`.
- **`scripts/testPhoneAuth.js` IS NEW (19 assertions).** ⚠️ **It cannot test the SMS leg** — that
  is Firebase's, and the provider is off. What it does cover is everything this codebase owns: a
  token carrying a verified phone claim is honoured, one without it is refused, an email-less
  account can exist AND a second one can too, identity is never taken from the body, one number
  cannot be claimed by two accounts, and linking leaves the uid and email untouched.
- **🐛 THE BUYER'S MARKET RANKED THE WRONG 200, AND 30 DISTRICTS WERE UNREACHABLE.**
  `GET /api/listings/market` was `.find(filter).limit(200)` followed by an **in-memory distance
  sort** — the same defect as the captain feed, found by sweeping for the pattern after fixing
  that one. Measured against live Atlas at **1,159 available listings**: those 200 covered
  **8 of 38 districts with stock**, and Nashik (39 lots), Pune (38), Nagpur (37), Kolhapur (37)
  and Amravati (37) were **never returned at all**. A buyer standing in Nashik browsing "All
  Maharashtra" saw **zero Nashik lots** and a screen full of Washim — and the in-memory sort made
  it look considered. Now `$near` ranks **in the database**, so the limit applies to an
  already-ordered list. Verified before/after for four district buyers: 0 → 39 / 37 / 38 / 37.
- **⚠️ `meta.total` IS THE WHOLE RESULT, `meta.shown` IS THE PAGE.** It used to report
  `rows.length` as `total`, so a buyer looking at 200 of 1,159 lots was told there were 200. A
  count that silently means "what fitted" is worse than no count. `hasMore` is derived from the
  true total and `VendorDashboard` prints "60 of 1,159" with a line saying to narrow by crop or
  district.
- **AN UNPOSITIONED BUYER IS TOLD THE FEED IS NEWEST-FIRST** (`ranked: false` + a note), rather
  than being shown an arbitrary order that reads as a ranking. Same doctrine as the captain feed's
  `unfiltered` mode.
- **A LISTING WITH NO `geo` IS BACKFILLED INTO THE PAGE, NOT DROPPED.** `$near` cannot see a
  document that is not in the index, and such a lot is *unpositioned, not far away* — dropping it
  would hide a real farmer's real lot from the whole market with no error. The gap is filled from
  a second query and the rows sort last on a null distance.
- **🐛 NOTHING ON THE WRITE PATH SET `CropListing.geo` — THE `User.geo` BUG, REPEATED.** The field
  and its 2dsphere index existed and `scripts/backfillGeo.js` populated the rows that predate it,
  so all 1,159 live listings had one and the problem was invisible. But `routes/crops.js`
  (harvest-and-list) never wrote it, so **every harvest posted from the app would have been
  invisible to the market feed** the moment it started ranking by `$near`. Now written at
  creation, `[lng, lat]`.
- **`isOnline` NEEDED NO FIX AND WAS LEFT ALONE.** It was on the Phase 2 list; on inspection
  `AgentDashboard` already restores it (`setOnline(!!u.isOnline)`) and **nothing server-side gates
  on it** — it is purely the client's duty toggle. Recorded so it is not "fixed" again.
- **`scripts/seedStatewideHistory.js` GIVES THE STATEWIDE ACCOUNTS A PAST — 572 delivered
  orders.** `seedStatewide.js` created 2,183 accounts for radius COVERAGE, not history, so a demo
  login landed on an empty app: buyers 16% with any order, captains **4%**, farmers 7%. Now
  buyers 67%, captains 58%, farmers 46%.
- **⚠️ IT DELIBERATELY LEAVES A THIRD OF BUYERS WITH NOTHING, and that is the point.** Measured
  through `trustService.forVendor()` across all 180: **80 get NO BAND** (60 with no trades at all,
  plus the thin records below `MIN_TRADES_TO_SCORE`), 36 prompt, 30 average, 24 slow, 10 unpaid.
  A demo where every buyer wears a tidy green badge would hide the refusal, which is the most
  defensible thing the trust feature does. Same rule as `seedTradeDemo`'s PROFILES.
- **⚠️ IT GROWS `quantityKg` INSTEAD OF CONSUMING `quantityAvailableKg`.** A historical sale took
  kilograms off a listing, but decrementing now would eat the 1,159 live lots buyers browse. Each
  order instead RAISES the total that was harvested and leaves availability untouched, so the
  farmer's own "sold = quantityKg − quantityAvailableKg" reads true and the market is unchanged.
  Verified after seeding: 1,159 listings still available, same available kg, 288,879 kg now
  showing as historically sold.
- **⚠️ ITS FIRST VERSION WROTE `meta: { seed: 'STATEHIST' }` AND NEITHER SCHEMA HAS A `meta`
  PATH.** Both run strict mode, so that key would have been **silently dropped**, `--purge` would
  have matched nothing, and 572 invented orders would have been permanently indistinguishable
  from real trades — the exact failure already recorded for `dataSource` on Order/Consignment.
  Caught by checking `schema.path()` **before** running it. The purge keys on the **statewide
  buyers' own uids** instead (verified: those accounts owned zero orders beforehand, so the match
  is exact) and re-derives the listing inflation **from the orders themselves**, so nothing has to
  be stored for the removal to work.
- **TRADES ARE MATCHED WITHIN A DISTRICT.** Pairing a buyer, a farm and a captain at random across
  the state would produce a 500 km "local" pickup and make radius dispatch and the nearest-first
  market feed look broken in exactly the demo they exist for.
- **⚠️ TWO `testFarmMarket` ASSERTIONS ENCODED THE OLD UNBOUNDED FEED.** "both test listings
  visible" and "withdrawn listing leaves the market" (a COUNT of surviving fixtures) both assumed
  the market returned everything — its Nagpur fixture is 600 km from the Nashik vendor and now
  correctly falls outside page one. Fixture bugs, not code bugs: the calls are scoped with `q=`
  and the withdraw check asserts the withdrawn listing is **gone by id** rather than counting
  survivors. §5 adds the property that was actually broken — a Nashik buyer reaching Nashik lots.
- **🐛 THE DISPATCH WINDOW WAS FIVE MINUTES, AND `no_agents` DID NOT MEAN WHAT IT SAID.**
  `DISPATCH_WINDOW_MS` was `5 * 60 * 1000`, declared **separately in `routes/orders.js` and
  `routes/consignments.js`**. Five minutes only works if a captain is staring at a screen, and
  this app has **no push and no background location by design** (Expo Go) — a tempo driver is
  DRIVING. So `no_agents` did not mean "nobody wants this run", it meant "nobody was looking at a
  phone for five minutes", and the buyer could not tell the difference. Now **four hours**, in
  **`services/dispatchWindow.js`**, imported by `orders.js`, `consignments.js` AND `fpos.js`.
- **FOUR HOURS, NOT EIGHT, AND THE REASON IS THE FARMER.** Almost all the gain is in the first
  jump; 4 h → 8 h adds little matching probability while doubling two real costs — the farmer's
  stock is held off the market the whole time (**a lapse to `no_agents` deliberately does not
  restock**) and perishables sit longer. Four hours also matches the trade's morning/afternoon
  slots: a pickup offered at 7am that nobody has taken by 11am is not happening this morning, and
  the buyer wants to know at 11am while they can still ring a tempo owner.
- **⚠️ THE WINDOW IS CLIPPED TO THE WORKING DAY, OR IT LIES AGAIN IN A NEW COSTUME.** A run
  offered at 5pm with a flat four-hour window expires at 9pm — hours in which nobody could have
  taken it, reporting `no_agents` at nine having been un-takeable for most of its life. That is
  the five-minute problem with a different number. `dispatchExpiryFrom()` clips to
  `DAY_ENDS_HOUR` (19), defers an after-hours job to `DAY_STARTS_HOUR + 4` **the next morning**
  rather than expiring it in the dark, and starts a pre-dawn job's clock at first light. It
  returns `clipped` / `tooLate` / `reason` so a caller can SAY the window is short instead of
  showing an arbitrarily small countdown. `POST /:id/retry` returns that block and
  `VendorOrdersScreen` alerts on it — a buyer who re-dispatches at 18:55 gets five minutes, and
  reading that second timeout as "no captain wants this job" would be wrong.
- **⚠️ SORTING AFTER A LIMIT IS NOT FILTERING — BOTH CAPTAIN FEEDS RANKED THE WRONG TWENTY.**
  Each did `.sort({ createdAt: 1 }).limit(20)` and only THEN computed `approachKm` and sorted by
  it. That takes the twenty OLDEST open jobs **in Maharashtra** and ranks those. Fine at 8 buyers
  and 4 captains, where twenty was everything; meaningless at **720 captains across 36
  districts** — a Nagpur driver got the twenty oldest jobs in the state and the job 4 km from
  them was never in the query. `services/dispatchReach.js` scans first (`SCAN_CAP` 300, and the
  cap is REPORTED, never silent) and filters by radius second.
- **THE RADIUS IS PER VEHICLE (auto 25 / tempo 40 / truck 60 km), AND THAT IS A DECISION.** The
  approach drive is **unpaid** — the fare starts at the farm — so it is pure cost to the driver,
  and what they will absorb scales with what the job pays. One number for all three is wrong in
  both directions.
- **THE EMPTY STATE NAMES WHAT IS BEYOND THE RADIUS.** `reach.beyondRadius` reports the count and
  the nearest distance, because "no trips" and "no trips within 40 km, the nearest is 96 km away"
  are different facts and only the second tells a driver whether moving is worth it. A bare empty
  list reads as "the app is dead today". Same doctrine as the storage vacancy field.
- **⚠️ THE DISTRICT FALLBACK COMPARES THROUGH `matchDistrict()`, NEVER RAW STRINGS.** Three
  districts were RENAMED and **both names are live in this database** — a captain whose profile
  still says "Aurangabad" would match none of their own district's pickups under a lowercase
  compare, and the feed would come back empty with nothing to explain it. Asserted for all three
  renames in `testDispatch.js` §9.
- **A PICKUP WITH NO COORDINATES IS KEPT, NOT DROPPED.** It is unmeasured, not far away; dropping
  it would hide a real job from every captain in the state with no way for anyone to notice. It
  sorts last on a null distance, exactly as before.
- **🐛 `User.geo` WAS INDEXED AND NOTHING EVER WROTE IT.** The field and its 2dsphere index were
  added, `scripts/backfillGeo.js` populated 154 users **once**, and no route ever set it again —
  so a captain who signed up afterwards had no position at all and one who drove to another
  district kept the coordinate they were seeded with. Radius dispatch would have been ranking
  drivers against month-old positions. `POST /api/users/me/position` is the captain's heartbeat
  (a targeted `updateOne`, not the allowlist `save()` — it fires from every online captain),
  throttled to two minutes and forced on going on duty.
- **⚠️ `location` AND `geo` NOW MOVE TOGETHER, OR THEY SILENTLY DISAGREE.** `geo` is what every
  radius query reads and `location` is what the rest of the app reads; writing one without the
  other leaves a captain findable at their OLD position by dispatch and shown at their new one
  everywhere else, with no error. `syncGeo()` runs on any profile write that touches `location`.
  **A location with no usable coordinate CLEARS `geo` (to `undefined`, so the field goes absent
  and drops out of the sparse index) rather than leaving a stale one** — a wrong answer is worse
  than no answer, and a `null` would be the malformed-point shape that made every user unwritable.
- **`User.positionAt` EXISTS BECAUSE A COORDINATE WITH NO TIMESTAMP IS A TRAP.** One recorded
  three weeks ago looks identical to one recorded three seconds ago. Every reader must check the
  age — same discipline as the tracking screen saying "last seen 3 min ago".
- **🐛 THE CAPTAIN'S POSITION WAS TAKEN ONCE ON MOUNT AND NEVER REFRESHED.** Survivable while the
  distance was only a label on a card; not survivable now the server FILTERS on it. A captain who
  launched in Nashik and drove to Sinnar kept being offered Nashik jobs and was invisible near
  where they actually were, all session, with nothing on screen to suggest it.
- **THE APP KEEPS THE SCREEN AWAKE WHILE ON DUTY, AND THAT IS NOT A NICETY.** Dispatch in Expo Go
  IS the dashboard polling, so a locked phone is a captain who has silently stopped receiving work
  while their own app still says "You are online". Tagged (`agent-on-duty`) so it releases only
  its own lock.
- **⚠️ THERE IS STILL NO PUSH NOTIFICATION, AND `expo-notifications` WAS NOT ADDED.** Expo Go on
  Android cannot deliver one (SDK 53+), so installing it would add a dependency that does not work
  and risk the demo. A new nearby job **vibrates** and opens the offer sheet, and the screen states
  the limit — alerts arrive only while the app is open. Real push needs a dev build, which is a
  standing constraint of this project, not an oversight.
- **🐛 SOLD KILOGRAMS VANISHED FROM THE FARMER'S LISTING WITH NO EXPLANATION.** Buying decrements
  the listing and a lapsed dispatch does NOT restock it, so those kilograms leave `quantityKg` and
  appeared **nowhere else on the farmer's screen** — 600 kg where there had been 1,000 and nothing
  saying where 400 went. **Live Atlas at the time of the change: 2,248 kg across 9 orders sitting
  in `no_agents`.** `GET /api/listings/farmer/:uid` now returns `committed`, and
  `FarmerSalesScreen` renders it. Widening the window from 5 min to 4 h without this would have
  traded the farmer's visibility for the buyer's match rate without telling them.
- **`waiting` / `coming` / `stuck` ARE THREE FIGURES, NOT ONE.** `awaiting_agent` is a wait,
  `accepted` is a captain on the way, and `no_agents` is a wait that has **already failed** and
  needs the BUYER to retry or cancel — the farmer's line says so, so they are not left waiting on
  something that has stopped moving. `committed` is **null when there is nothing outstanding**,
  never a row of zeros claiming to report something. (Verified the buyer's retry button exists and
  posts to `POST /api/orders/:id/retry` before telling the farmer to expect it.)
- **⚠️ TWO `testDispatch` ASSERTIONS ENCODED THE OLD FIVE-MINUTE WINDOW AND BOTH WERE FIXTURE
  BUGS, NOT CODE BUGS.** One asserted `expiresInSec <= 300`; bounding it by `DISPATCH_WINDOW_MS`
  instead is **still wrong**, because a job created after the working day legitimately expires
  ~14 h out — it now compares against the deadline **stored on the order**, which is what a captain
  reads the countdown as. The other compared an order's span to a flat 4 h and failed at 19:30 for
  the same reason. Both would have failed this suite every evening.
- **⚠️ A BUSY CAPTAIN'S FEED SHORT-CIRCUITS, SO RADIUS ASSERTIONS AGAINST ONE PASS VACUOUSLY.**
  `§8` first used `A_TEMPO`, who is holding a job by then — the feed returns
  `{ orders: [], busy: true }` with **no `reach` at all**, so "a Nagpur captain is not offered a
  Nashik pickup" passed while proving nothing. It now creates a dedicated free captain and
  **asserts they are free first**.
- **🐛 A `default` ON A GeoJSON FIELD MADE EVERY USER AND LISTING UNWRITABLE.** `geo.type` was
  declared `default: 'Point'`, so Mongoose stamped `geo: { type: 'Point' }` — **with no
  coordinates** — onto every document that did not supply a position, and the 2dsphere index
  rejects that outright: *"Can't extract geo keys … Point must be an array or object, instead got
  type missing"*. Farmer registration and posting a harvest both threw in the LIVE app, not only
  in tests, because plenty of real records legitimately have no position yet (the offline
  fallback in `RootNavigator` deliberately stores a null district rather than guessing one).
- **THE FIX IS NO DEFAULT ON EITHER FIELD.** With none, the whole `geo` object stays ABSENT
  unless a caller sets it — which is exactly what a sparse geospatial index wants. A record with
  no position is simply not in the index: not findable by radius, which is true, rather than
  unwritable, which was false. **Never put a `default` on `geo.type`.**
- **⚠️ `geo.coordinates` IS `[lng, lat]` — THE REVERSE OF EVERYWHERE ELSE IN THIS CODEBASE.**
  GeoJSON demands longitude first. Getting it backwards puts every farm in Maharashtra off the
  coast of Somalia, silently, with no error — the query just returns nothing. It is a FIFTH
  coordinate shape here, added only because the database engine demands that exact one;
  `location.coordinates.{lat,lng}` is untouched and `toLatLng()` remains the normaliser.
- **`$near` IS REFUSED INSIDE AN AGGREGATION, WHICH INCLUDES `countDocuments()`.** It requires a
  sort. Use **`$near` for the sorted feed** (nearest captain first, which is what a driver wants)
  and **`$geoWithin` + `$centerSphere` for counting or filtering** — and note `$centerSphere`
  takes its radius in RADIANS (km ÷ 6378.1), not metres like `$maxDistance`.
- **`scripts/backfillGeo.js` EXISTS FOR RECORDS THAT PREDATE THE FIELD.** 154 users and 80
  listings had no `geo` and were therefore invisible to every radius query — returning nothing,
  with no error. It reads through `toLatLng()` rather than `.lat`/`.lng` directly, and a record
  with **no usable coordinate is LEFT ALONE, never given a district centroid** — inventing a
  position is the storage-coordinates mistake again.
- **🐛 A CAPTAIN COULD NOT SEE THEIR OWN WORK — THE ENDPOINT DID NOT EXIST.** The agent side had
  `/agent/available` (jobs to take) and `/agent/current` (the one in hand) and **nothing else**.
  No finished trip, no kilometre driven, no rupee earned was visible to a driver anywhere in the
  app. `GET /api/orders/agent/history` and `GET /api/consignments/agent/history` now exist, with
  `screens/Agent/AgentTripsScreen.jsx` rendering both.
- **⚠️ IT REPORTS `fare.agentPayout ?? fare.total`, NEVER `grandTotal`.** The captain collects the
  FARE; the crop value is settled between buyer and farmer directly and was never the driver's
  money. Reading `grandTotal` would tell a driver they had earned several times what they were
  paid. **Earned and COLLECTED are also reported separately** — a finished trip that has not been
  paid for is a different position from one that has, and one blended figure hides the case a
  driver actually needs to chase.
- **🐛 GOING OFF DUTY MADE A CAPTAIN'S ACTIVE JOB DISAPPEAR.** `AgentDashboard` loaded the current
  trip only inside `poll()`, and `usePolling(poll, 5000, online && ...)` is gated on the duty
  toggle — so a driver mid-delivery who went offline lost sight of the job they were still
  holding. The current trip is now fetched on mount as well. The FEED still needs `online` (that
  is what the toggle is for); the job you have already accepted does not.
- **🐛 NEITHER THE BUYER NOR THE CAPTAIN HAD A PROFILE SCREEN.** `ProfileScreen` already branches
  on `userData.role` and handles farmer/vendor/agent — it was simply never registered in
  `VendorNavigator` or `AgentNavigator`. Both now register `Profile` and `EditProfile`.
- **⚠️ THE VENDOR HEADER IS SPLIT ACROSS BOTH SIDES, and six controls will not fit one half.**
  It was six text labels (overflowed), then six icons (still overflowed). Now **two on the left**
  (Orders, Groups) and **four on the right** (I Need, Grievances, Profile, Logout), with the
  title shortened to "Market" so nothing competes with it. Every control carries an
  `accessibilityLabel` — an icon a screen reader cannot name is its own bug.
- **THE PATTERN BEHIND ALL FOUR: A GREEN TEST SUITE AND A FULL DATABASE PROVE NOTHING ABOUT
  WHETHER A SCREEN EXISTS.** Every one of these sat behind 1396 passing assertions and correct
  data. Before calling any actor's workflow done, walk it: can this role reach their own history,
  their own profile, and the thing they do every day — from the screen they land on?
- **🐛 `GET /api/users/firebase/:uid` DID NOT RETURN `vehicle`, AND IT BROKE EVERY CAPTAIN.**
  The projection stopped at `createdAt`. `Agent/AgentDashboard` reads its profile from that
  endpoint, so `u.vehicle` was **always undefined** and three things followed for every captain,
  seeded or real: onboarding fired on **every launch** (`if (!u.vehicle?.type) setOnboard(true)`)
  and saving the vehicle changed nothing because the next read lost it again; the job feed never
  polled (`usePolling(..., online && !!profile?.vehicle?.type)`), so **no current trip and no
  available jobs ever loaded**; and the vehicle card never rendered. The data was in Mongo the
  whole time — only the projection was missing it. `vehicle`, `isOnline`, `business`,
  `verification` and `language` are now returned. (`verification` is safe to READ; only WRITING
  it is forbidden, which the update allowlist still enforces.)
- **🐛 THE BUYER'S ORDER HISTORY AND LIVE TRACKING WERE UNREACHABLE — a layout bug, not a
  missing feature.** `VendorNavigator`'s `headerRight` carried **six** items, three of them text
  labels ("Groups", "I Need", "Orders" + two icons + "Logout") at gap 18. On a 360dp phone they
  overflowed and **"Orders" was pushed off the edge**. `VendorOrdersScreen` existed, rendered
  delivered orders, grouped FPO purchases and navigated to `TrackOrder`/`TrackRun` — and none of
  it could be opened. Now six 21px icons at gap 13, each with an `accessibilityLabel`.
- **⚠️ AND `VendorDashboard` HAD EXACTLY ONE `navigate()` ON IT** — into a listing. The header was
  the only route to everything else, which is why one overflowing row took the whole buyer
  workflow down with it. It now carries a real quick-action row (My orders / Buy from a group),
  so the buyer's own trade does not depend on a 21px icon fitting.
- **THE LESSON, WRITTEN DOWN: "the API returns it" IS NOT "the app shows it".** All three bugs
  sat behind green tests and a database full of correct data — 207 orders, tracking positions,
  trust bands, all verified by direct query. Every one was invisible until the app was actually
  opened. `scripts/seedTradeDemo.js` builds the data; it does not prove a screen renders it.
- **🐛 TWO MORE SILENT FIELD DROPS FOUND BY SWEEPING FOR THE WHOLE BUG CLASS, both in
  `scripts/seedDemoData.js`.** After the `Order`/`Consignment` `dataSource` drop, every model
  write in `backend/{scripts,routes,services}` was parsed and each written key checked against
  the target schema. Two real hits:
  **(a)** it wrote `localName` on `CropListing`, where the field is **`cropLocalName`** —
  `localName` is the name it has on the `Crop` model. Every seeded listing lost its Marathi crop
  name.
  **(b)** it wrote `agentId: captain._id` on `Order`. **Two things wrong, both silent:** the
  field is `agentUid`, and `_id` is the Mongo ObjectId where `agentUid` stores the **Firebase
  uid** — so even the rename alone would have stored an id nothing in this app can resolve.
- **⚠️ (b) PRODUCED A RECORD THAT ASSERTED SOMETHING IT COULD NOT SUPPORT.** `agentName` DID
  save, because that field exists. So **9 delivered orders in Atlas carried a captain's NAME with
  no captain behind it** — a claim about who drove somebody's crop that no query could resolve
  and that never appeared in that captain's own trip history. That is worse than a missing field:
  a blank says nothing, a name with no link says something false.
- **`scripts/repairOrphanAgentOrders.js` FIXES THE ROWS, AND ONLY WHERE IT IS CERTAIN.** An
  order is repaired only when its `agentName` resolves to **exactly one** account with
  `role: 'agent'`. Two captains sharing a name, or none, and the row is reported and LEFT ALONE —
  guessing which driver delivered somebody's crop is exactly the invention this app refuses
  everywhere else. All 9 resolved unambiguously and were repaired; the check now returns zero.
- **⚠️ FOUR "FINDINGS" FROM THAT SWEEP ARE FALSE POSITIVES — do not "fix" them.**
  `stops.$.grade.farmerResponse` (×3, `routes/consignments.js`) and `members.$.status`
  (`routes/fpos.js`) use MongoDB's **positional `$` operator**, which `schema.path()` cannot
  resolve. Both paths exist on their sub-schemas and both are asserted working
  (`testConsignments.js` §14, `testFpoRegistry.js` §6). Any future sweep must strip `.$.` before
  concluding anything.
- **THE DEMAND SIDE WAS EMPTY — `scripts/seedTradeDemo.js` gives it 30 buyers, 30 captains and a
  past.** The app had 85 FPO logins and 79 listings but only 8 buyers, 4 captains and 13 orders,
  so every buyer and captain screen opened to nothing. Now: **207 orders, 10 FPO lot purchases
  (40 orders + 10 runs), 12 captains holding live work, 4 runs with live positions.**
  `--confirm` to create, `--purge` to remove, dry-run by default.
- **⚠️ THE TRUST HISTORY IS SHAPED TO BE HONEST, NOT FLATTERING.** The seeded settlements
  deliberately land across every answer `trustService` can give — **prompt 8, average 8, slow 8,
  unpaid 4, and 2 that it REFUSES to band at all** because they sit below
  `MIN_TRADES_TO_SCORE`. A demo where all thirty buyers wear a tidy green badge would hide the
  refusal, which is the most defensible thing about the feature.
- **`Order` AND `Consignment` HAD NO `dataSource` FIELD, AND THE SEEDER WOULD HAVE BEEN
  UNREMOVABLE.** Mongoose strict mode silently DROPS an unknown key — no error, no write — so
  the demo marker would have vanished and `--purge` would have found nothing, stranding 200+
  demo trades permanently with no way to tell them from real ones. Same failure as the
  nested-coordinates bug in `CropListing`. Both models now carry the field. **`--purge` still
  keys on the demo BUYERS' own uids, not on `dataSource`** — that value is shared with
  `seedFpoListings` and the warehouse seed, so purging on it would take other scripts' data too.
- **THE GSTINs ARE BUILT, NOT INVENTED.** Each is a real-format number whose check digit is
  computed by the app's own `checkDigit()`, so all 30 pass the same validation a real one does —
  a demo buyer failing the app's own check would show an error badge on every offer. It still
  proves nothing about ownership, and `verification` is a deliberate MIX: most sit at
  `documents_submitted`, the ceiling a buyer can reach without a human running `verifyBuyer.js`.
- **ONE DRIVER, ONE JOB — RESPECTED BY CONSTRUCTION.** The busy captains are partitioned into 8
  with a live order and 4 with a live run, and the two sets never overlap. `isActiveJob` has a
  partial unique index on each collection and `agentJobService` enforces the missing half across
  them, so writing two would either throw a duplicate key or create the exact state that rule
  exists to prevent. Verified after seeding: zero captains hold both.
- **🐛 IT ALSO CAUGHT A STALE TEST FIXTURE.** `testFpoDashboard` asserted member cards were
  literally `0` and `seasonSettlement.orders === 0` — true only while the seeded FPOs had never
  traded. Those are FIXTURE ASSUMPTIONS, not the property worth testing: a test that fails
  because the app finally has data is testing the wrong thing. Both now derive the expected
  totals from real delivered orders, so they hold whether the group has traded or not.
- **⚠️ THE MARATHI FLAGS ARE NOW `// mr-checked`, WHICH MEANS CHECKED BY CLAUDE AND NOT BY A
  NATIVE SPEAKER — never upgrade that word to "verified" without a person.** The owner (also not
  a Marathi speaker) asked for the 255 flags to be resolved rather than left as an open task
  nobody could action. What was actually done: the high-risk TRADE TERMS were corroborated
  against **1,582 OCR'd pages of Krishi Darshani** — MPKV Rahuri's own farmer handbook, already
  on disk. **प्रत (grade) is confirmed authentic** (68 standalone uses, "पाण्याची प्रत"), which
  settles ~67 strings on its own; so are कोंब, चाळ, प्रतवारी, आवक, फेरी, आडत, तारण and
  बाजार समिती. **The corpus is SILENT on वजन काटा, हमाली, वाटणी and उचल** — it is an agronomy
  handbook and does not discuss market labour or trade finance, so absence is not evidence of
  error. (The 4 hits for काटा are all "दातेरी काटा", a fish's spine; the 16 for उचल are all the
  verb "to lift" — which is why the advance strings use the plainer आगाऊ रक्कम.)
  **What this pass did NOT do: grammar, register, or whether a sentence reads naturally.** A term
  being authentic does not make the sentence around it good Marathi. `mr-native` is the marker to
  use when a person has actually read one.
- **(Superseded) THE OLD `⚠️ REVIEW NEEDED` CONVENTION IS GONE** `frontend/scripts/marathiReview.js` is a **read-only**
  worksheet: `node scripts/marathiReview.js` prints every flagged key beside its ENGLISH SOURCE
  (which lives hundreds of lines away in `strings.js`, and is the thing being checked against),
  `--csv` emits it as a spreadsheet with blank correction columns. It changes nothing.
- **⚠️ THE REVIEW IS SMALLER THAN 255 STRINGS, AND THE WORKSHEET IS WHAT SHOWS THAT.** The flags
  are dominated by a handful of TERMS, not by 255 independent judgements: **प्रत (grade) appears
  in 67 flagged strings and फेरी (collection run) in 50** — two term decisions settle 117 of the
  255. एफपीओ 22, वाटणी 12, आगाऊ रक्कम 8. Settle the TERM first, then the strings that use it; if
  one of those words is wrong for the Nashik/Marathwada trade it is wrong in every string at once.
  The worksheet prints that concentration at the top for exactly this reason.
- **PLAIN ENGLISH INSIDE A MARATHI STRING IS AN ACCEPTABLE ANSWER and the worksheet says so.**
  A near-miss on a mandi term reads worse to a Maharashtra farmer than English would. That is a
  real option for a reviewer, not a failure.
- **Count as of this session: 255 flagged of 1,293 Marathi keys (20%), across 18 namespaces** —
  up from 205 because this session added FPO-actor, focus-crop, gate-condition, advance and
  drill-down strings, every one of which was flagged where it touched trade vocabulary rather
  than guessed.
- **THE DASHBOARD HAD NOTHING UNDERNEATH ITS HEADLINE — `GET /api/fpos/:id/lot?lotKey=…`.** An
  admin looking at "Onion · Grade A · 2,400 kg" could not see which members it came from, what
  each is asking, or whether any of them has ever delivered. The lot itself is **not rebuilt** —
  it comes from `lotCatalog.buildLots()`, the same function the buyer's catalog and the dashboard
  use, so this screen cannot start describing a lot differently from the two that already do.
  What it adds is the one thing none of them has: **history**.
- **⚠️ A MEMBER WITH NO HISTORY REPORTS ZERO AND A SENTENCE, NEVER AN AVERAGE.** Most members of
  a real FPO have sold nothing through this app. Their row is `sales: 0`, `avgPricePerKg: null`
  and *"that is not a mark against them"* — never a blank that reads as fine, never a rate
  borrowed from the group. Each contributor keeps the SAME trust record a buyer sees, not a
  friendlier copy, and `trustService`'s refusal to band below a minimum trade count stands.
- **THE AVERAGE IS Σvalue ÷ Σkg, NOT THE MEAN OF PER-ORDER PRICES.** A mean weights a 20 kg sale
  the same as a 2,000 kg one and is a price nobody ever paid — the same trap the lot's own
  indicative price already documents.
- **GROUP HISTORY IS ACROSS ALL GRADES AND SAYS SO.** Orders carry no grade of their own (the
  grade lives on the listing, which can be gone), so splitting a realised price by grade would be
  inventing the split — the blending the lot catalog exists to refuse.
- **TWO LOT-KEY SHAPES ARE REAL AND BOTH ARE ACCEPTED.** `cropKey::gradeKey` is what
  `buildLots()` mints and therefore what the DASHBOARD carries; `fpoId::cropKey::gradeKey` is what
  `GET /bundles` prefixes for a buyer. This route has the group in its path, so demanding the
  longer form would have been a silent 400 on the one screen the feature exists for.
  `parseLotKey()` is left alone — it is shared with `/lots/quote` and `/lots/confirm`, which have
  no fpoId in the path and genuinely need all three parts.
- **⚠️ NO ML MODEL SHIPS FOR "ESTIMATED INCOMING", AND THE REASON WAS MEASURED, NOT ASSUMED.**
  `scripts/measureIncomingModel.js` builds every training row this database can produce, fits the
  obvious candidates, and compares them against the shipped lookup on a held-out split. **Re-run
  it** when there are more real harvests; the answer is allowed to change.
- **THE FINDING WAS NOT "THE MODEL LOSES" — IT WAS "NO VERDICT IS POSSIBLE", and the script now
  refuses to declare one.** Its first version printed "the model does not beat the lookup" off a
  test sample of **one**, which is a number, not a result. The lookup could price **9 of 79**
  planted crops (11%): ICRISAT covers 25 of 36 districts and **excludes cotton and sugarcane
  outright** (it records sugarcane as gur and cotton as lint), and those are two of the commonest
  crops here. The lookup is not losing the comparison — it is not IN it.
- **THREE REASONS NO MODEL SHIPS WHATEVER THE NUMBERS SAY, all recorded in the script:** 79 rows
  across 10 crops with only a handful of (crop, district) cells above five observations; **75 of
  those 79 are SEEDED DEMO STOCK and only FOUR are real listings a farmer actually posted** — a
  quantity invented by a seed script is not a harvest, and an accuracy figure fitted on these
  measures the seed script, the same objection that keeps D5 out; and **a harvest listing is not
  a harvest** — a farmer lists what they intend to SELL, net of home consumption, of whatever
  went to whoever financed the seed, and of what is being held back. The target variable is not
  the quantity a model would claim to predict. **A model trained on four observations is not a
  model.**
- **🐛 THAT MEASUREMENT UNCOVERED A REAL DEFECT AND IT IS FIXED: `CropListing` had no
  `dataSource` field.** `scripts/seedFpoListings.js` marked its stock only in free-text `notes`
  ("illustrative demo stock, not a real harvest") — honest to a human reading one listing, and
  invisible to every query, which is how 75 seeded listings became indistinguishable from 5 real
  ones. The field now exists (same value, `demo_illustrative`, as `Fpo`/`FpoMaster`/`Warehouse`)
  and the seeder sets it. **The measurement script checks BOTH markers**, because the 75 rows
  already in Atlas carry only the note — reading the new field alone would report every one of
  them as a real harvest, which is the exact error the field was added to prevent.
- **WHAT THAT MEASUREMENT DID PRODUCE IS A REAL FIX: `producesAggregation.coverage`.**
  `excludedCrops` already NAMED every crop left out, which was right — but nothing said how big
  the hole was, so "estimated incoming: 4.2 tonnes" gave no clue whether that was most of the
  group's planting or a tenth of it. The dashboard now reports counted/planted with a sentence
  calling the forecast **a floor under what is coming, not a total**.
- **A GRIEVANCE NOW HAS AN EVIDENCE TRAIL — `GET /api/disputes/:id/evidence` and
  `/evidence.txt`, `services/disputeEvidenceService.js`.** ⚠️ **NOT an arbitration engine, not a
  customer-care queue, not a fault score.** This app does not decide who is right and is not going
  to start; a team to decide it is a staffing commitment, not a feature. What it can do is make
  the deciding human's job easy.
- **⚠️ THERE IS NO "LIKELY AT FAULT" FIELD AND THERE MUST NEVER BE ONE.** `testDisputes.js` §9
  asserts the serialised trail contains no verdict, fault score or recommendation — that
  assertion is the guard on this whole feature, so do not "improve" it by adding a summary
  judgement. `recordStrength` describes how much is DOCUMENTED (was it weighed, independently?
  did anybody look at it? did the farmer concede?) and says in its own note that it is not a
  judgement about either party and that a thin record is not evidence against anybody.
- **THE GAPS ARE HALF THE FEATURE.** `gaps` names what was NEVER recorded — nobody weighed it,
  nobody looked at it, no grade was ever asked for, the other party never answered — sorted
  worst-first. Absence settles a quantity dispute far more often than any number does, and a
  trail printing only what exists would read as more complete than the record actually is.
- **AN UNANSWERED GATE DOWNGRADE IS LISTED AS A GAP, NOT AS A FINDING.** A lower grade recorded
  at the gate is a CLAIM by the person who collected the lot until the farmer accepts or contests
  it — the same rule as "a complaint raised is not a complaint upheld". `farmerConcededGrade` is
  the one thing on the whole record both sides have agreed to.
- **`.txt` IS THE POINT, NOT A CONVENIENCE.** An APMC officer has no account here, and neither
  does the elder both parties actually trust. It leaves through the OS share sheet — the same
  road the CSV export takes, because Expo Go cannot write to Downloads and the endpoint is
  authenticated so a browser link arrives without a token. It leads with the disclaimer, because
  that is the copy that gets forwarded.
- **THE READ GATE IS DELIBERATELY WIDER THAN THE TWO PARTIES: the FPO admin whose member is on
  the order may read it too.** An FPO is one of the humans this exists for and very often the
  body that actually settles a member's dispute. **The captain is NOT admitted** even when they
  recorded the gate — they witnessed one moment, they are not a party to the trade, and the trail
  carries both parties' payment history and trust records.
- **`trustService`'s REFUSAL TO BAND A THIN RECORD IS NOT RELAXED BECAUSE A DISPUTE IS OPEN.**
  That is exactly when a band would be most misleading and most damaging. Both parties' records
  appear, whichever of them raised it.
- **⚠️ THE TIMELINE READS `pickupOutcome.orderedKg`, NOT `quantityKg`.** A short pickup REWRITES
  `quantityKg` to what actually left the farm, so reading it would report the order as having
  been placed for the short quantity — erasing the shortfall from the one line meant to establish
  it, which is usually the whole dispute.
- **THE FARMER WAS EXTENDING CREDIT TO A STRANGER, AND NOW THERE IS AN ADVANCE.** A farmer
  handed over a tonne of onion against a *record* of a promise, and every incentive ran the wrong
  way once the crop was on the truck. `Order.settlement.advance` + `POST /:id/settle-advance` +
  `services/paymentExposureService.js`.
- **⚠️ FLIPPING IT WAS CONSIDERED AND REJECTED.** "The buyer pays before delivery" does not fix
  the problem, it relocates it: the buyer has then paid for produce they have not seen, at a
  grade nobody checked (a hired captain is not asked to grade — see the entry above). Making
  *that* safe needs **escrow**, escrow needs a payment rail, and this app deliberately has none.
  An advance **splits** the exposure instead of moving it, and it is how this trade already works.
- **STILL RECORDED, STILL NOT MOVED.** Every rule governing `farmerPaid` governs the advance. The
  app does not transfer, hold or verify one. **The buyer AGREES at order time; the FARMER records
  that it arrived** — the same split of authority as the balance, because only the person it
  lands with can say it landed. A buyer marking their own advance sent is the self-certification
  this app refuses everywhere, and it would defeat the entire point.
- **AGREED AND RECEIVED ARE NEVER COLLAPSED INTO ONE BOOLEAN.** An advance a buyer promised and
  did not send is the farmer's whole problem, and one flag would make it identical to "no advance
  agreed". `advance.outstanding` is its own number, and the farmer's card renders it as *a
  promise, not money — do not load the truck on it*.
- **`/settle` STILL MEANS FULLY PAID, and that meaning was not changed.** `farmerPaid` is read as
  "this farmer has their money" by `trustService` and every existing list; redefining it as
  "balance only" would silently rewrite the payment history of every order in Atlas. An advance
  agreed but never separately recorded is **reported, not refused**, on settle — a buyer who paid
  it all in one go at the end is real, and refusing the farmer's own "I have been paid" because a
  form was skipped would be the app arguing with the only person who knows.
- **⚠️ BOTH SIDES ARE EXPOSED IN TRANSIT, AND THAT IS THE WHOLE REASON EXPOSURE IS TWO NUMBERS.**
  Between the farm gate and the buyer's gate the farmer has parted with the crop AND the buyer
  with the advance, and neither holds what they paid for. `bothExposed` names it. A single
  "who is at risk" flag would hide the riskiest window in the trade. Asserted in `testOrders.js`
  §15.
- **THE BALANCE CAN BE NEGATIVE AND IS REPORTED NEGATIVE.** A short pickup rewrites
  `farmerPayout` downward, so an advance agreed against the full order can exceed what the lot
  turned out to be worth — meaning the farmer holds the buyer's money. Same rule as the un-clamped
  pooling saving and the losing hold; clamping it to zero would erase the only number that says so.
  Rendered on the farmer's own card so they know before the buyer rings.
- **ON AN FPO LOT THE ADVANCE IS A PERCENTAGE, AND A FLAT RUPEE FIGURE IS REFUSED (400
  `ADVANCE_MUST_BE_PCT`).** One lot purchase becomes N Orders with N different line totals —
  each member sets their own ₹/kg — so "₹20,000 advance" has no fair division: split by value it
  is arbitrary, split evenly it underpays the biggest contributor. A percentage of each farmer's
  **own** line is the only split fair to every member that still reconciles to the buyer's
  headline. Same reasoning as the by-weight fare split. `advance + balance === cropValue` exactly,
  per farmer and in total — asserted.
- **AN ADVANCE LARGER THAN THE CROP IS WORTH IS REFUSED, NOT CLAMPED** (`ADVANCE_EXCEEDS_PAYOUT`),
  and a percentage *and* a rupee amount together is `ADVANCE_AMBIGUOUS` — that is two different
  agreements and the app must not pick one for the parties. Validated **before** any stock moves,
  so a bad figure never has to be compensated for.
- **ZERO IS THE DEFAULT AND IS BYTE-FOR-BYTE THE OLD BEHAVIOUR.** An order placed without naming
  an advance is unchanged in every field; the request itself omits the key entirely. But the
  no-advance case is **named** rather than reported as fine: "the farmer carries the whole ₹X
  until the buyer pays" — that is the problem advances exist to solve, and staying silent about it
  was the old behaviour too.
- **REACHABLE FROM THE UI, ALL FOUR SURFACES.** Buyer picks 0/10/25/50% on `BookTransportScreen`
  and `LotOrderScreen`; the farmer confirms receipt on `FarmerSalesScreen` (which now shows the
  BALANCE to collect, not the full payout, once an advance is in — printing the full amount beside
  a received advance would be asking for money twice); the split and the disclaimer print on
  `ReceiptScreen`.
- **EIGHT MORE CROPS PROMOTED TO `mh-verified` FROM THE KRISHI DARSHANI OCR ALREADY ON DISK —
  20 → 28 of 38.** Ginger 48:30:30, Potato 40:24:49, Brinjal 60:30:30, Turmeric 80:40:40,
  Tomato 80:40:40, Sunflower 20:10:10, Sesamum N-only 20, and Garlic 40:20:20 (unchanged —
  independent confirmation, like Wheat). No new sources were fetched; 1,582 pages of the
  2024/2025/2026 editions were already OCR'd in
  `data/sources_fertilizer_krishi_darshani/work/`.
- **⚠️ THE METHOD IS THE POINT, AND IT IS NOT GREPPING. The 2024 edition prints doses PER
  HECTARE and the 2025/2026 editions print the SAME doses PER ACRE**, so every figure has a
  built-in cross-check: per-ha ÷ 2.471 must land on the per-acre number. Where the handbook also
  translates into fertilizer BAGS, that was worked through as a third check.
- **THAT CHECK CAUGHT FOUR OCR DIGIT ERRORS THE TEXT LAYER WOULD HAVE SHIPPED.** The 2024
  edition has a systematic ५↔१ / ५↔७ confusion: ginger's nitrogen reads **"520 kg/ha"** where
  the page says **120**, its FYM reads "275 to 40 tonnes" (page: 25 to 40), its phosphorus reads
  55 (page: 75), and turmeric's potash reads 500 (page: 100). **The two that mattered were then
  confirmed by cropping and READING THE PAGE IMAGE**, not by trusting either reading.
- **POTATO'S POTASSIUM MORE THAN DOUBLES (20 → 49 kg/acre) AND IT IS NOT AN ARTEFACT.** The 2024
  edition's own bag translation reconciles exactly — 7.5 bags SSP/ha = 60 kg P₂O₅, 4 bags MOP/ha
  = 120 kg K₂O. Potato is a heavy K feeder and K > P is normal for it. **The 2025/2026 per-acre
  pages contradict themselves** on the bag counts (½ bag SSP delivers 4 kg P₂O₅ against a stated
  24): MPKV converted the headline N:P:K to per-acre and did not convert the bag counts. Took the
  explicit triple, same as the Cotton entry where the source contradicts itself.
- **THE SAME HALF-CONVERTED-BODY-TEXT SLIP APPEARS IN BRINJAL, AND THE 2026 EDITION FIXES IT.**
  2025 states 60:30:30/acre then says "the remaining **75** kg N" (half of the per-hectare 150);
  2026 says "the remaining **30** kg N". Recorded because it shows the slip is real and known.
- **⚠️ THE 2024 DOSE TABLE (तक्ता क्र. ३, p.245) IS UNUSABLE AND WAS NOT USED.** tesseract
  renders its cells as `(३ [| ५९, |. 2 |` — table structure is exactly what Marathi OCR loses.
  **Every figure taken comes from PROSE.** Don't go back to that table.
- **MANGO IS GENUINELY ABSENT AND STAYS `tnau-legacy`.** Across all three editions the pages
  mentioning आंबा carry an orchard calendar and one article about mango-leaf powder — never a
  nutrient dose. A crop missing from a handbook is a fact about the handbook, not a licence to
  borrow a neighbouring crop's number. The other nine unverified crops (Grapes, Orange, Mosambi,
  Cauliflower and the rest) stay on the category fallback, which says openly it is unchecked.
- **SESAMUM IS THE WEAKEST `mh-verified` ROW AND SAYS SO.** The source gives FYM, nitrogen and
  sulphur and states **no P and no K at all**, so only N (20 kg/acre, confirmed in all three
  editions) is verified; P and K are carried over unverified, same shape as the Tur entry.
- **🐛 A LIVE BUG WAS FOUND AND FIXED: the farmer-facing caveat printed
  `(undefined kg/ha from Krishi Darshani …)`.** `MH_SOURCES` has **three** figure shapes —
  `kgHa`, `kgAcreAsPrinted` and `gPlant` — and `dailyTaskEngine.js` read only `kgHa`, so every
  crop sourced from Krishi Darshani **plus Pomegranate** showed farmers the word "undefined" on
  the one line whose whole job is to say where the number came from. It is the same failure the
  file already recorded for banana ("150:60:150 g/plant kg/ha") arriving through the other door.
  `sourceFigureLabel()` in `data/fertilizerRules.js` now decides the unit **beside the data**,
  appends one only to a bare figure, and returns null rather than a wrong unit.
- **`scripts/testFertilizer.js` IS NEW (19 assertions) AND NEEDS NO ATLAS.** `fertilizerRules.js`
  and `dailyTaskEngine.js` had **zero** test coverage, which is exactly why "undefined" shipped.
  It asserts: every `mh-verified` crop has a citation and no citation is orphaned; no citation
  renders as undefined, unitless, or with two units; **all 38 crops land on 0% nutrient error**
  (the DAP-credit invariant); the per-ha ÷ 2.471 cross-check for each mined crop; and that a real
  `buildFertilizerTask()` for every crop contains no "undefined"/"NaN".
- **A CAPTAIN IS NOT A GRADER, AND THE APP NOW SAYS SO INSTEAD OF PRETENDING.**
  `recordStopOutcome()` let ANY recorder set `observedGrade`, including a captain from the public
  pool on a hired run. Grading against the AGMARK criteria is a skilled judgement about size,
  colour uniformity and blemish tolerance — a thing a person can be WRONG about, and the person
  it is wrong about is the farmer, whose reputation it reaches. `data/gateRecord.js`
  `GRADING_ROLES = ['fpo_driver','fpo_admin']` is the split: an FPO's own people grade (they
  handle this crop every season and the group's name is on the sale); a hired captain gets
  **409 `GRADING_NOT_AVAILABLE`**.
- **⚠️ THE DEFAULT-TO-DECLARED WAS SWITCHED OFF WITH IT, AND THAT IS THE HALF THAT IS EASY TO
  MISS.** `observed` used to default to the farmer's declaration, which writes
  `discrepancy: 'match'` — a CONFIRMATION. On a hired run nobody confirmed anything, so printing
  "grade recorded at the gate: matches" over a captain who was never asked would be the app
  inventing the exact check it is refusing to perform. The block is now null end to end there,
  and `gradingAvailable` / `gradingNote` say so in the response rather than leaving a screen to
  infer it from a null. Asserted in `testConsignments.js` §14b.
- **THE ALTERNATIVE WAS CONSIDERED AND IS WORSE.** "Let the captain grade, mark it
  low-confidence" writes a `downgrade` the farmer must answer, which feeds `trustService` when
  conceded and which the buyer reads — from somebody with no standing to make the claim. **A
  refusal that is visible beats a check that is decorative.**
- **WHAT A CAPTAIN CAN RECORD IS CONDITION, AND IT IS NOT A WEAKER GRADE.** `CONDITION_FLAGS`
  (wrong_crop / visibly_spoiled / sprouting / wet / damaged / packaging_damaged) is a different
  KIND of statement — one that needs eyes, not expertise. Offered to **every** recorder on every
  kind of run. Two of the keys mirror `Dispute.reason` exactly so a later grievance can point at
  a gate observation that used the same word. It moves no money, same rule as the grade block.
- **⚠️ `checked: false` AND `checked: true` WITH NO FLAGS ARE DIFFERENT FACTS AND ARE NEVER
  COLLAPSED** — the same distinction `weight.method` draws between `not_recorded` and
  `estimated`. "Nobody looked" and "somebody looked and saw nothing wrong" are opposite evidence
  in an argument about a bad lot, and one "no problems reported" would report the first as the
  second. Both recording screens therefore ASK them as two different answers.
- **THERE IS DELIBERATELY NO "quantity looks short" FLAG.** The app already answers that
  precisely — `collected_short` carries `collectedKg` beside `orderedKg` with `weight.method`
  saying how it was established. An eyeball flag beside a recorded number is a second answer to
  one question, and where they differ the number wins, so the flag would never be acted on.
- **`POST /api/orders/:id/pickup` RECORDED THE OTP AND NOTHING ELSE.** `Order.pickupOutcome` has
  carried the weight and grade blocks since the gate record was built and the receipt already
  READ them — but only the multi-farm run ever WROTE them, so every single-farmer pickup (the
  commonest kind) produced a receipt saying "Not recorded" against a quantity the buyer was
  paying for. It now writes outcome, both quantities, weight provenance and condition.
  **`weightMethod` is REQUIRED** there, exactly as on a run, and **body validation runs before
  the OTP check** — answering "wrong code" to a request that never named a weighing method would
  send a captain to ask the farmer for a code that was already fine.
- **IT IS ONE AGGREGATION-PIPELINE UPDATE (`updatePipeline: true`, required by Mongoose 9), not
  a read-then-write or a second `updateOne`.** `orderedKg`/`collectedKg` are taken from the
  document's own `$quantityKg` inside the same guarded write, so the order can never sit in
  `picked_up` with a half-written outcome, and no check-then-write window opens on the field
  being copied.
- **NO SHORT PATH ON THE SINGLE-FARMER PICKUP, STATED RATHER THAN APPROXIMATED.** A short pickup
  there would need restocking, repricing and a settlement path — the state machine the
  consignment route has and this one does not. Half of it would be worse than none. The remedy
  is the grievance flow, as today.
- **`canGrade` ON `StopOutcomeSheet` DEFAULTS TO FALSE.** A caller that forgets to pass it does
  not offer grading, which is the conservative failure; the opposite default would let a new
  screen silently start asking a captain to certify a grade. `ConsignmentTripScreen` passes hard
  `false`; `FpoRunScreen` passes `mayGradeAtGate(role)`. Where grading is refused the sheet shows
  a panel saying **why** — a missing field reads as an oversight, a stated refusal reads as a
  decision, and it is the decision that makes the rest of the record trustworthy.
- **THE RECEIPT RENDERED NONE OF THE GATE RECORD.** The backend had been sending weight
  provenance and the grade check for some time and `shared/ReceiptScreen.jsx` displayed neither,
  so the most-forwarded document in the app printed a bare "512 kg". It now prints all three
  lines, and **says each absence in words** rather than leaving it blank — a blank reads as
  "fine". Its condition and weight labels REUSE the `fpoRun.*` keys on purpose: the word a driver
  taps at the gate and the word printed on the receipt have to be the same word.
- **AN FPO NOW DECLARES WHAT IT DEALS IN — `Fpo.focusCrops`, and every use of it is
  ADVISORY.** FPOs specialise heavily (a Niphad onion company does not deal in sugarcane) and
  nothing modelled it, so any farmer could ask to join any group with any produce and the admin
  approving them had nothing on screen but a name.
- **THE GROUP STATES IT BECAUSE THERE IS NOTHING TO DERIVE IT FROM.** The SFAC registry carries
  the name, registration number, district, block and promoting CBBO of all 213 companies and
  **not one word about crops**. Deriving it from current listings was considered and rejected:
  four onion lots this week does not make an onion FPO, and a grape group between harvests would
  read as focusing on nothing.
- **⚠️ A MISMATCH BLOCKS NOTHING, ANYWHERE, AND THE TEST IS WRITTEN AROUND THAT.**
  `POST /:id/join` computes the match **after** recording the request — deliberately, so a
  mismatch is something the farmer is TOLD, never something they are refused. A farmer growing
  something adjacent is a conversation, and a hard refusal would make the app wrong about the
  case humans settle by phone every season. `testFpos.js` §14e asserts the sugarcane grower
  joins an onion group successfully. It also never touches the lot catalog, the bundles or any
  sale (§14l): produce already listed is produce.
- **THE TWO ABSENCES ARE NOT MISMATCHES**, the same rule `trustService` and the storage vacancy
  field already follow. A group with no declaration reports `no_focus_declared` and matches
  everybody; a farmer with nothing registered reports `farmer_crops_unknown`. Neither is ever
  `mismatch`. A crop name this app does not recognise is reported separately as `unrecognised`,
  never counted as unmatched — an unknown string is not a farmer growing the wrong thing.
- **`focusDeclared` TRAVELS BESIDE `focusCrops` SO A SCREEN CANNOT MERGE THEM.** Empty means
  *not declared*, never *deals in nothing*. Both frontend surfaces branch on `focusDeclared`,
  not on `focusCrops.length` — the same number today, and reading the length directly is how a
  screen quietly starts asserting the second meaning.
- **AN UNKNOWN CROP IS REFUSED BY NAME AND A LIST OVER `MAX_FOCUS_CROPS` (12) IS REFUSED, NOT
  TRIMMED.** A group that thinks it declared six crops and actually declared five is matched
  against a list it never agreed to. The cap has a stated reason: declaring half of the 64 tells
  a farmer nothing.
- **THREE NAME SHAPES ARE ALL REAL IN THIS DATABASE**, so `canonicalCropName()` matches on
  `name`, `localName` (Marathi) and `mandiName` (Agmarknet). Matching on English alone would
  report a Marathi listing as off-focus. The one narrowing pass is an **exact head compare**
  before the bracket, never substring or edit-distance: `⚠️ verified across all 64 crops that no
  two share an alias head`, so first-match-wins is never arbitrary — re-check that if `CROPS`
  gains an entry. ("Bengal Gram" → "Gram (Harbhara)" is an exact match on the Agmarknet alias
  `Bengal Gram(Gram)(Whole)`, not a fuzzy one.)
- **THE `fpo` ACCOUNT COULD NOT APPROVE A MEMBER FROM THE UI AT ALL.** The routes existed and
  the only screen calling them was `Farmer/FpoScreen` ("My Group"), which is a farmer's screen
  and not in the FPO stack — exactly the "route file exists, nothing calls it" defect class
  already recorded here. `screens/Fpo/FpoMembersScreen.jsx` (approve/reject with each
  applicant's crop match) and `screens/Fpo/FpoFocusCropsScreen.jsx` (the declaration) now exist,
  and are registered in **both** navigators because the shared `FpoDashboardScreen` links to
  them from both stacks.
- **NO SCREEN SORTS, FILTERS OR HIDES AN APPLICANT BY THEIR MATCH.** The list is the list and
  the match is a chip on it, with the advisory line printed underneath. Burying a mismatch would
  be the UI enforcing a preference the server deliberately does not — invisibly, which is worse
  than doing it openly. `no_focus_declared` and `farmer_crops_unknown` get a neutral slate chip,
  never amber or red.
- **THE FPO IS NOW ITS OWN ACTOR — `User.role` gained a fourth value, `fpo`.** An FPO
  admin used to be a **farmer account that had claimed an FPO**, which is backwards: a real
  producer company's CEO / Manager / Director is an appointed officer and frequently does not
  farm at all, and tapping a button should not turn a farmer into company staff. A person now
  chooses farmer / buyer / captain / **FPO** at signup, and an FPO registrant claims their
  organisation from the SFAC registry as the next step.
- **IT IS ADDITIVE AND NOTHING WAS MIGRATED, WHICH IS ONLY POSSIBLE BECAUSE AUTHORISATION
  NEVER LOOKED AT THE ROLE.** Every FPO action already decided on `fpo.adminUid === uid`
  (`loadAsAdmin()`, `isFpoAdminForRun()`, `resolveRunActor()`) — role-blind, and still is. The
  *only* thing that changed is the OUTER `requireRole()` gate: `FPO_ADMIN_ROLES =
  ['farmer','fpo']` in `routes/fpos.js`, `CLAIMANT_ROLES` in `routes/fpoMaster.js`, and `'fpo'`
  added to eight gates in `routes/consignments.js`. **`'farmer'` stays in those lists
  permanently** — ten claimed groups in Atlas are that shape and dropping it would lock real
  admins out of their own groups.
- **WHAT AN `fpo` ACCOUNT CANNOT DO NEEDED NO NEW CODE.** Land, crops, daily tasks, harvest
  listings, `POST /api/fpos` (starting an informal group), `/:id/join`, `/:id/leave`, `/nearby`
  and mandi sales all stay `requireRole('farmer')`, so the refusal is the gate that was already
  there. An FPO does not farm, does not join itself and does not leave itself.
- **AN OFFICER IS NOT A MEMBER-FARMER, so an `fpo`-claimed group starts with ZERO members.**
  `scripts/reviewFpoClaims.js` reads the claimant's role: a **farmer** claimant is still seeded
  into `members[]` (unchanged, byte for byte), an **fpo** claimant is not. `members[]` is the
  list of farmers whose produce the group markets and is read as exactly that by the lot
  catalog, the dashboard, the settlement and every member count — seeding an officer into it
  would put a non-farmer in every "supplying members" list and make every count off by one.
- **⚠️ THAT SHAPE WOULD HAVE CLOSED A REAL COMPANY, AND THE RULE WAS RESTATED TO STOP IT.**
  `/:id/leave` closed a group when `members.length <= 1`, which was correct only while every
  admin was also a member. With the admin outside `members[]`, the single farmer in a
  newly-claimed FPO leaving would have **closed a real, SFAC-registered company out from under
  its own CEO** — and no route reopens one. The condition now says what it always meant: close
  only when nobody is left **and the admin was one of the people who left**
  (`remaining.length === 0 && adminIsMember`). An empty group whose admin holds it from outside
  `members[]` is not a husk, it is an FPO between seasons. Asserted in `testFpoRegistry.js` §7i.
- **`GET /api/fpos/admin/mine` IS A NEW ENDPOINT BECAUSE `/mine` ANSWERS A DIFFERENT
  QUESTION.** `/mine` is "which group am I a MEMBER of" and resolves through `members[]`;
  `admin/mine` is "which FPO do I ADMINISTER" and resolves on `adminUid` alone — so **one
  endpoint serves both admin shapes**, the legacy farmer-account and the organisation's own. It
  also names the three states that exist *before* there is an `Fpo` at all
  (`none` / `claim_pending` / `claim_rejected`), because a claim is reviewed by a human running
  a terminal script and without them an FPO registrant lands on an empty dashboard and guesses.
  `adminStatus` is always present and is the field to branch on.
- **AN `fpo` ACCOUNT CANNOT BE ASSIGNED AS A DRIVER (`FPO_DRIVER_ROLES` stays
  `['farmer','agent']`), and that is a decision.** `resolvePositionActor()` refuses the office
  by name because a coordinate typed at a desk is invented, not observed. The `fpo` role IS the
  office account, so admitting it as a driver would re-open exactly that hole — nothing
  downstream could tell "the manager is in the cab" from "the manager is at the desk" and
  `outcomeByRole` would stop meaning anything. A manager who genuinely drives gets a driver
  account of their own. The `DRIVER_ROLE` refusal now says which of the two reasons applies
  rather than telling an FPO officer they are a buyer.
- **`FpoNavigator` IS DEFINED BY WHAT IS ABSENT.** It registers Home / FpoRegistry /
  FpoDashboard / FpoRun / TrackRun / Grievances / Receipt / Profile — and **no** land, plots,
  crops, tasks, harvest, mandi-sale, storage or market screens, because every one of those
  routes is farmer-only on the server and registering them would put dead ends one tap away.
  There is deliberately no route back into `FarmerDashboard`; there is nothing to go back to.
  `FarmerNavigator`'s own FPO branch STAYS for the legacy shape — two entry points, one set of
  screens. The four FPO screens stay under `screens/Farmer/` and are imported by both stacks.
- **`FpoHomeScreen` resolves its own state on focus rather than the navigator resolving it on
  mount.** `FarmerNavigator` does the latter and it is fine there; here the `none →
  claim_pending` transition happens *within* a session (they just claimed), so a mount-only
  fetch would show a stale "find your FPO" card immediately after claiming.
- **`FpoRunScreen`'s driver picker reads `admin/mine`, not `/mine`.** Only an admin opens it,
  and `/mine` is farmer-only — an `fpo` admin would have got a 403 and an empty picker.
  `FpoRegistryScreen` skips the `/mine` call entirely for an `fpo` account rather than eating a
  403 on every load, and shows it why there is no Join button instead of a greyed-out one it
  could never use.
- **A RUN COULD BE STRANDED FOREVER. There was no cancel, no abandon, no release, no
  reassign and no timeout.** Once a captain accepted, the only exits were delivering or
  the all-stops-failed close — so a captain who broke down, quit or stopped answering
  after two of five pickups left the run in `collecting` PERMANENTLY: two farmers' produce
  on a truck nobody could reach, no other captain able to take it, and those farmers'
  orders unable to settle or to be disputed out. `POST /:id/release` and
  `POST /:id/abandon` in `routes/consignments.js` are the two exits, and they are two
  routes because they are **two different situations**.
- **RELEASE IS THE BLAMELESS HALF, and it is guarded on NO STOP HAVING AN OUTCOME.**
  Nothing has been collected, so nothing has to be undone: the run returns to
  `awaiting_agent` with a **fresh dispatch window** (without one the sweep would retire it
  instantly), `agentUid`/`isActiveJob` are cleared, and every order goes back to
  `awaiting_agent` — no cancellation, no restock, no farmer out a rupee. The guard is a
  QUERY FRAGMENT (`UNTOUCHED_STOPS_FILTER`), never a JavaScript check, or a captain
  recording a pickup while the buyer releases would both pass it. The released captain
  goes into `rejectedBy` — a run you just handed back is a declined job. `releases` is an
  ARRAY: a run can be released more than once and each release is a fact about a different
  captain.
- **ABANDON IS NOT REASSIGNABLE, BECAUSE A NEW CAPTAIN CANNOT COLLECT WHAT IS ON SOMEBODY
  ELSE'S TRUCK.** Uncollected stops are handled by **calling Phase A's own
  `not_collected` code** (`cancelUncollectedOrder()` + `restockUncollected()`, extracted
  rather than copied): order cancelled, kilograms restocked, fare share left on the
  cancelled order. Already-collected stops become **`Order.status: 'stranded'`** — a NEW
  enum value. `picked_up` was checked first and rejected: it describes the physical fact
  but it is also the status of every healthy in-flight order, so no list or query could
  separate "arriving this afternoon" from "on a broken-down truck", which is the entire
  point of the state. It is emphatically not `cancelled` either — `farmerPayout`,
  `cropTotal` and `quantityKg` are left exactly as the pickup recorded them, because real
  crop left a real farm and is owed for. `/settle` accepts `stranded` (this app RECORDS
  money, it does not judge it); `delivered` is untouched so `trustService` never counts a
  stranded order as a delivery.
- **THE RUN ENDS `abandoned`, WHICH IS A DIFFERENT FACT FROM `cancelled`.** `cancelled`
  means every farm was visited and none handed anything over — nobody is out of pocket.
  `abandoned` means produce was loaded and the run stopped. `abandonment.strandedOrderIds`
  / `cancelledOrderIds` / `strandedKg` name both halves so a human can act on either, and
  a stop nobody reached is written with `failureReason: 'run_abandoned'` — **server-set
  only, deliberately absent from `FAILURE_REASONS`** — so the farmer sees it was not
  "farmer absent" and had nothing to do with them.
- **ABANDON IS REFUSED IN EXACTLY THE CASE RELEASE WOULD WORK** (409 `USE_RELEASE`).
  Abandoning an untouched run cancels every farmer's order for no reason. And a closed run
  can never be delivered: `/deliver` now returns 409 `RUN_CLOSED` up front instead of
  falling through to "Wrong code", which told a captain to go and ask for a code that
  could never have worked.
- **WHO MAY END A RUN IS DELIBERATELY WIDER THAN WHO MAY RECORD A STOP.** A stop outcome
  is an eyewitness account (`resolveRunActor()`, unchanged). Ending a run is
  administrative, and **the person who most needs it done is the one who cannot do it** —
  a vanished captain calls nothing. So `resolveClosureActor()` allows the assigned
  captain, the buyer who booked it, and the FPO admin whose group it belongs to. A hired
  FPO-lot run carries `fpoId: null`, so "belongs to their group" is answered the only
  honest way left: **EVERY** farm on the run is an active member of a group they admin —
  every, not any, because a run pooling two groups' members belongs to neither admin.
- **THE STALE-RUN SWEEP ONLY EVER RELEASES.** `STALE_RUN_MS` is **6 hours** with the
  reasoning in the constant: a run is a district-scale drive by construction (≤5 stops,
  one drop-off within 2 km), so six hours without a single gate recorded is not a slow
  captain. Its filter requires no stop to have an outcome, so by construction it can never
  cancel an order or touch a farmer's crop — a stale run WITH produce aboard is left for a
  human, because cancelling a sale on a timer is not a decision software should take. It
  rides the existing lazy `sweepExpired()`; there is still no cron.
- **ONE CAPTAIN COULD HOLD TWO JOBS — ONE IN EACH COLLECTION.** `isActiveJob` has a
  partial unique index on `Order` AND one on `Consignment`; each is correct inside its own
  collection and **a MongoDB index cannot span collections**, so between them they allowed
  a captain to hold an active single-farmer order and an active multi-farm run at the same
  time. One driver, one vehicle. `services/agentJobService.js` enforces the missing half
  in the application at BOTH accept points, and **both indexes stay** — they still decide
  ties inside their own collection.
- **THE PATTERN IS CHECK → CLAIM → RE-CHECK, and it is provably safe.** A plain
  read-then-check is TOCTOU-unsafe across documents. If both claims commit and neither
  re-check saw the other, then `commitO < recheckA < commitC < recheckB < commitO` — a
  contradiction, so at least one re-check sees the other and rolls its own claim back.
  Both may roll back, leaving the captain with no job: that is the failure this is tuned
  for. **A rejected claim costs one tap; two accepted jobs strands a farmer's crop.**
  The 409 **names the job you already HOLD, not the one you asked for** — `ALREADY_BUSY`
  for an order, `ALREADY_ON_JOB` for a run — so both pre-existing contracts survive
  unchanged, with `activeJob.kind` as the precise machine-readable half. Both captain
  feeds now also hide work from a busy captain across both collections, and **a pooled
  order can no longer be claimed as a single pickup** (`consignmentId: null` in the feed
  and in the accept guard) — otherwise a released run's orders could be taken out from
  under it.
- **AN UNAPPROVED APPLICANT WAS SHOWN AS A MEMBER.** `fpoOf()` was
  `Fpo.findOne({ 'members.farmerUid': uid, status: 'active' })` — where `status` is the
  **FPO's** own, not the member's — so it matched a member row in any state. Phase A/B
  correctly store a new joiner as `status: 'pending'`, but `GET /mine` handed them the
  whole group: the app showed them as a member and the entire admin approval gate was
  invisible from the applicant's side. Split into **two functions because they answer two
  genuinely different questions**: `activeMembershipOf()` ("which group am I IN" — approved
  rows only, and what `/mine` uses) and `commitmentOf()` ("am I committed anywhere" —
  pending INCLUDED, and what `POST /` and `/:id/join` use). `/mine` now returns
  `fpo: null` with `membershipStatus: 'pending'` and a `pendingRequest` block, so a screen
  can say "waiting for approval" instead of rendering somebody else's membership.
- **COUNTING A PENDING REQUEST AS A COMMITMENT IS DELIBERATE, NOT A LEFTOVER.** Without
  it one farmer could have live requests waiting with five groups at once and five admins
  would each be approving somebody about to belong elsewhere. One at a time; they can
  always withdraw or be rejected.
- **`status: { $in: ['active', null] }` INSIDE the `$elemMatch`, never `status: 'active'`.**
  Member rows written before the field existed have no `status`, and `.lean()` does not
  apply Mongoose defaults — reading those as anything but active would silently evict every
  founding member of every group seeded before the approval gate. Same family as the
  `$ne`-matches-missing bug below.
- **AN FPO LOT CAN NOW BE BOUGHT — `POST /api/fpos/lots/quote` then `/lots/confirm` (Phase D).**
  Phase C built the catalog and nothing could be ordered from it. `services/lotAllocationService.js`
  decides WHO supplies the kilograms (max participation, pro-rata by stock, price-neutral); the
  routes resolve the contributors, price the run, apply the payment mode and write the documents.
- **IT IS TWO STEPS BECAUSE THE PRICE DOES NOT EXIST BEFORE THE ALLOCATION DOES.** Members inside
  one lot ask different ₹/kg and each is paid **their own** — so the buyer's total depends on which
  members the order actually drew from. `POST /` on a single listing can price itself; a lot cannot.
- **A QUOTE IS NOT A RESERVATION, and the response says so in words** (`reservation.reserved: false`).
  It writes nothing and holds nothing — the same rule as an Offer ("reserving inventory when someone
  merely asks would let one vendor freeze a farmer's whole listing"). Tested: after quoting, every
  listing still holds every kilogram and the same quote can be taken again.
- **THE CONFIRM RE-DERIVES EVERYTHING AND ECHOES ONLY AN OPAQUE `quoteRef`.** A client-supplied
  `allocation` / `pricePerKg` / `cropTotal` is IGNORED and named in `ignoredClientFields` — accepting
  one would let a buyer name their own suppliers, quantities and prices, which is "Never trust client
  identity" applied where it costs money. `quoteRef` is a sha256 over the server's OWN quote and works
  like `If-Match`: no price travels back through a hash, and a forged one can only produce a refusal.
  It covers the **crop side only** — transport is re-measured at confirm, so a route that differs by
  metres cannot bounce a buyer.
- **STOCK THAT MOVED AFTER THE QUOTE IS A REFUSAL (409 `QUOTE_STALE`), NOT A SILENT REBUILD.** A buyer
  who agreed to ₹18/kg from four named farmers must not be quietly sold ₹26/kg from two others.
- **PARTIAL FAILURE COMMITS NOTHING, BY COMPENSATION — NOT BY A TRANSACTION.** Same mechanism
  `routes/orders.js` and `scripts/reviewFpoClaims.js` already use, for the same stated reason ("this
  beats a full transaction ... and it keeps working on a standalone mongod"). Write order is chosen so
  the risky part fails first and cheapest: **stock** (guarded exactly as `POST /api/orders` guards it)
  → **Orders** → **Consignment** → only then the `sold_out` sweep, so a rollback never has to un-flip a
  status. The consignment `_id` is **minted up front** so each Order carries `consignmentId` at
  creation — that deletes the claim-then-maybe-lose step rather than adding another window to
  compensate for. Regression-tested with a real mid-sequence failure: five decrements succeed, two
  Orders are written, the third hits the `idempotencyKey` unique index, and the test asserts every
  kilogram is back, no Order survives, and no Consignment exists.
- **ONE ORDER PER CONTRIBUTING FARMER, ONE CONSIGNMENT FOR THE RUN** — including a single-farmer
  allocation, which is still a run (Phase C already prices a one-contributor lot as one trip with a
  saving of exactly 0). Per-farmer Order is architecturally forced by B1/C4/C5, not a preference.
- **THE ORDER STORES THE GROSS, NEVER THE NET.** `farmerPayout = cropTotal`, byte for byte what
  `POST /api/orders` writes, because `computeSettlement()` reads that field AS the gross and applies
  the fee itself — a net figure here would deduct the facilitation fee a second time on `/settlement`.
  What the member is owed is computed by calling **`computeSettlement()` itself** on the allocation
  (shaped into Order-like rows), so the confirm screen and the member's settlement come from one
  function and cannot disagree. That also means procurement's `no_agreed_rate` / `grade_unknown` gaps
  are Phase B's own, not a second copy: a procurement group with no rate for that (crop, grade) is
  **refused**, never zeroed and never fallen back to the members' asking prices.
- **ONE FARMER IS ONE PICKUP STOP EVEN INSIDE ONE LOT.** A farmer with two listings of the same crop
  AND grade would otherwise eat two of the vehicle's five stops. Their larger listing supplies the
  order and the other is named `second_listing_same_farmer` — the reason the allocation service
  already declared. **Multi-lot purchases are still out of scope** and every response says so
  (`singleLotOnly`, `crossLotNote`): buying two grade lots from one group is ONE vehicle and one stop
  at a shared farm, so the ≤5 cap has to be counted over distinct `farmerUid` and the combined run
  re-priced rather than two `bundledFare` figures added.
- **AN IMPOSSIBLE QUANTITY NAMES ONE THAT WORKS.** With floors 500/800/1,000 against stocks
  600/900/1,200, **2,200 kg is genuinely uncomposable while 2,100 and 2,300 are both fine** — refused
  with `nearestBelowKg`/`nearestAboveKg` in the message, and the test then buys both to prove the
  promise. A request past what ≤5 farms and one vehicle can do reports the **true maximum** and
  whether the **stock** or the **vehicle** was what bound (`limitedBy`); it is never trimmed to fit
  and there is no multi-run splitting.
- **THERE IS NO FPO-ADMIN APPROVAL GATE, deliberately.** A listing is already an offer to sell in the
  single-farmer flow; making a group officer counter-sign what its members have published would put a
  middleman back exactly where `models/Fpo.js` says this app is removing one.
- **PHASE D REUSES, IT DOES NOT FORK.** `selectBundleLots()` (A), `lotCatalogService` (C),
  `orderStops()`, `splitFare()`, `buildTransportArrangement()` and the dispatch window are imported
  from `routes/consignments.js` — which now exports them — so the by-weight split, the rounding-drift
  rule and the "`costSource` is never taken from the client" rule have exactly one implementation.
  The run is routed and priced over the **allocated** farms only, never the whole lot: reusing the
  catalog fare would bill a buyer for driving to farms their order never touches.
- **THE FPO BUNDLE IS NOW A CATALOG OF GRADE-SEPARATED LOTS, NOT A SAVINGS CALCULATOR.**
  `GET /api/fpos/bundles` grouped a group's listings by (FPO, crop) and priced pooled
  collection — so a buyer paying for Grade A would have been sent a blend of A, B and C.
  The unit of the response is now the LOT: **one entry per (FPO, crop, GRADE)**, built by
  `services/lotCatalogService.js`. **Grades are never blended, under any circumstance** —
  the same rule the per-grade procurement rate table already followed. The pooled-vs-
  separate collection comparison survived and is computed **per lot** with F1's own route
  engine and fare table, so it still cannot drift from what a buyer is charged.
- **UNGRADED PRODUCE IS ITS OWN BUCKET — never dropped, never given an invented grade,
  never a fourth tier.** Live Atlas at the time of the change: **4 available listings, 1
  with a grade code, 3 ungraded** — a grade filter would have emptied the screen, which is
  the rule already recorded for requirement matching. An ungraded lot carries
  `gradeKey: 'ungraded'`, `grade.code: null`, `grade.declared: false`, the label **"Grade
  not declared"** and **`grade.tier: null` — deliberately not 3.** Unknown is not "worse
  than C": nobody has said either way, and a lot nobody graded may well be Grade A produce.
- **AGGREGATION MUST NOT LAUNDER A SELF-DECLARED CLAIM.** Five farmers' self-declarations
  pooled under one "Grade A · 2,400 kg" heading would read as one verified fact. So a
  graded lot carries `selfDeclared`, `inspected: false`, `declaredBy` (how many farmers
  each made this claim about their **own** produce) and gradeSpecs' own disclaimer, and
  every contributor keeps its own grade fields. Contributors pinned to **different spec
  versions** set `mixedSpecVersions` rather than being merged silently — pinning exists so
  an old listing keeps meaning what it meant.
- **THE PRICING TRAP IS REPORTED, NOT AVERAGED AWAY.** Inside one (crop, grade) lot the
  members ask different ₹/kg. The lot reports an **indicative** price (the weighted
  average, which is exactly `cropValue / totalKg`) **beside the real spread**
  (`minPerKg` / `maxPerKg` / `spreadPerKg` / `spreadPct`, `wide` above 10%). It is not a
  price anyone offered and the response says so; `cropValue` is Σ(each member's own price ×
  their own kg), so the total is true even though no single ₹/kg describes the lot.
  **Phase D must pay `contributors[].pricePerKg`** — multiplying the indicative price by an
  allocated quantity would underpay the member asking above average.
- **A LOT'S MINIMUM ORDER IS TRUE, AND SAYS WHAT IT DOES NOT GUARANTEE.** `minOrderKg`
  belongs to the LISTING and does not aggregate: if member A sells from 100 kg and member B
  from 500, a 200 kg order is fillable **from A only** — it is not "200 kg of the lot".
  `minOrder.smallestOrderKg` is reported with `fillableAtSmallestFrom` (how many
  contributors could actually serve an order that size), `largestContributorMinKg` and
  `allContributorsMinKg` (the smallest order that can draw on every contributor at once),
  and a note refusing the reading that anything above the minimum is fillable from the
  whole lot. A contributor whose own minimum exceeds their remaining stock is flagged
  rather than counted as orderable.
- **THE ≤5-STOP SELECTION RUNS PER LOT, reusing Phase A's `selectBundleLots()` unchanged.**
  Each (crop, grade) lot has its own contributing members, so each gets its own tightest
  cluster and its own `membersIncluded` / `membersAvailable` / `truncated` / `excludedLots`.
  One truncated lot does not truncate the group's others, and `totalKgAvailable` sits beside
  `totalKg` so a truncated lot cannot read as "that is all they have".
- **⚠️ ONE FARMER CAN BE IN TWO LOTS, AND THAT IS ONE PICKUP STOP.** A farmer holding
  Grade A and Grade B of the same crop appears in both lots — correctly, because the grades
  must not be blended. But a vehicle taking both stops at that farm **once**. Phase D must
  count the ≤5 cap over **distinct `farmerUid` across the whole purchase** and **re-price
  the combined run rather than adding two `bundledFare` figures**. Every contributor carries
  `farmerUid` + `listingId`, each lot carries `farmersAlsoInOtherLots`, and
  `collection.crossLotNote` repeats the warning in the response. Phase C does not build
  ordering and deliberately does not solve it.
- **A SINGLE-CONTRIBUTOR LOT IS STILL RETURNED.** "One lot is not a bundle" still gates the
  GROUP, but it must NOT be applied per grade — in this database most listings are ungraded
  and only a handful carry a code, so dropping single-contributor grade lots would hide
  exactly the graded produce a buyer came for. Such a lot is priced with
  `collection.pooled: false` and a saving of **exactly 0**: one stop is one trip, and a
  manufactured percentage there would be the same lie as a clamped negative saving.
- **TRUST IS PER CONTRIBUTOR, NEVER ONE BLENDED GROUP SCORE.** Each contributing farmer's
  `trustService.forFarmer()` record rides on the lot — buying two tonnes from five farmers
  means reading five delivery records, which is the group view's actual added value. Below
  `MIN_TRADES_TO_SCORE` it still refuses to band and returns counts; a blended group score
  would be exactly the fabrication trustService refuses for a single farmer.
- **THE DASHBOARD AND THE CATALOG SHARE ONE ARITHMETIC** (`lotCatalogService.buildLots()`),
  the same discipline as `computeSettlement()`. `producesAggregation.availableLots` is the
  same grade-separated lot list a buyer is offered, minus the vehicle constraint (the admin
  screen truncates nothing, so `membersIncluded === membersAvailable`; the buyer's
  `included + excluded` equals the admin's total). **`availableNow` stays crop → kg and is
  DERIVED from those lots**, so the headline tonnage cannot drift from the lot list — it
  stays a plain number because `Farmer/FpoDashboardScreen.jsx` renders those entries as
  quantities, and Phase C is backend-only.
- **THERE IS NO SINGLE FPO BUSINESS MODEL, and two things stopped being hard-coded.**
  `Fpo.paymentMode` is `facilitation | procurement`, **default `facilitation` with a zero
  fee — which is byte-for-byte what the app already did**, so none of the ten seeded FPOs
  and none of the existing numbers moved. *Facilitation*: the FPO markets members' produce
  and takes a fee (**percentage OR flat ₹/kg — real FPOs use both, so `facilitationFee.mode`
  says which; never both at once**). *Procurement*: the FPO BUYS the crop at an agreed rate
  and resells it, so the member is owed that rate whatever the lot fetched.
  `PUT/GET /api/fpos/:id/payment` and `PUT/DELETE /api/fpos/:id/procurement-rates`, all
  **admin-only** (`fpo.adminUid`); members see the *applied* figures on `/settlement`.
- **`paymentMode` and `byLot`/`byShare` are DIFFERENT AXES and the composition is written
  down** in the block comment at the top of `routes/fpos.js`. paymentMode decides what a
  member is owed *relative to the sale*; byLot/byShare decides how a *pool* is divided.
- **THE FACILITATION FEE COMES OFF BEFORE THE SHARE SPLIT.** Decided, not defaulted. A
  **per-kg fee has no meaning against a share percentage** — a share carries no kilograms,
  so charging it after the split means picking a basis and both are indefensible (a member
  with 10% of the shares and 40% of the weight either pays four times their share or pays
  for somebody else's crop). Deducting first needs no such choice, divides only money that
  is actually the members' to divide, and is the only ordering under which
  `sum(payouts) + fee === gross` holds exactly for both fee shapes. The same rule runs
  under byLot (one group fee, apportioned by lot value or by weight), so the two views can
  never disagree about what the FPO took.
- **PROCUREMENT + byShare IS REFUSED, not fudged.** `PUT /:id/shares` returns 409
  `SHARES_INCOHERENT_UNDER_PROCUREMENT`, and `PUT /:id/payment` refuses switching TO
  procurement while a split is recorded — **both directions, or the refusal is bypassable
  by reordering the two calls.** Reason: the FPO already bought the crop, so the proceeds
  are its own; a split could only mean members still own proceeds they were already paid
  for, or that the split overrides the agreed rate — handing the price risk back to the
  farmer, which is the exact thing procurement removes. A facilitation fee under
  procurement is refused too (`FEE_INCOHERENT_UNDER_PROCUREMENT`): nothing would ever read it.
- **A MISSING PROCUREMENT RATE IS A GAP, NAMED — never zero, never a silent fallback to
  facilitation, never the crop's other grades.** Rates are keyed on **(crop, GRADE) and the
  grades stay separate** — a blended per-crop rate erases the only thing grading is for.
  `settlement.procurement.gaps` names each unpriceable lot by farmer, crop, grade and
  weight, with two distinct reasons: `no_agreed_rate` (graded, no entry) vs `grade_unknown`
  (the lot was never graded, or its listing is gone — Orders carry no grade of their own,
  so it is read from `CropListing.grade.code`). Those lots are excluded from every total
  and `complete: false` says so.
- **THE FPO's MARGIN IS REPORTED AND CAN BE NEGATIVE.**
  `fpoPosition.margin = sale proceeds − Σ(agreedRate × kg)`. Tested at **−₹15,000** (₹45,000
  sale against ₹60,000 promised) and returned negative — same rule as the un-clamped
  negative pooling saving and the losing hold.
- **`GET /:id/settlement` and the dashboard's `seasonSettlement` now share ONE function**
  (`computeSettlement()`). They used to carry two copies of the arithmetic, which is two
  places for the fee ordering to be applied differently and no way for a member reading one
  screen against the other to tell which was right.
- **Transport is modelled as a MODE, not a fleet.** `Consignment.transportMode` is
  `hired | own | contracted`, default `hired`. `hired` is the captain pool, untouched.
  `own`/`contracted` are **never dispatched** — no dispatch window, `agentUid` stays null
  (the field was already nullable), and the run starts in `accepted` so it can be worked.
  ⚠️ **`isActiveJob` must NOT be set on an agentless run**: the partial unique index
  `oneActiveConsignmentPerAgent` keys on `agentUid` where `isActiveJob: true`, so two
  agentless runs would both key on null and the second would fail with a duplicate key.
- **A NON-HIRED RUN'S COST IS STATED, NOT COMPUTED, AND THE FIELD SAYS SO.**
  `transport.costSource` is `captain_fare_table | fpo_stated | negotiated_rate`, alongside a
  `costNote` derived server-side (never taken from the client, same rule that keeps
  `verification` out of the profile allowlist). `fareService` prices an **independent
  captain's** economics — a base for turning the key, a per-km rate against an ₹18–22/km
  running cost, a return charge because they drive home empty — and none of that describes
  an FPO's own tempo. Pushing a made-up number through it would be a figure with a decimal
  point and nothing behind it, exactly the failure `Warehouse.rateSource: 'assumed'` exists
  for. `fare.base`/`perKm`/`distanceCharge` are **null** on such a run (not 0 — they are
  unknown, not zero), and **`soloFareTotal` is null**: comparing an FPO-stated cost against
  captain-priced solo trips subtracts two different price bases, the H2 error. The stated
  cost still splits across stops by weight, so every receipt reconciles.
- **AN AGENTLESS RUN USED TO BE UNFINISHABLE.** Per-stop outcomes were
  `findOne({ _id, agentUid: uid })`, which can never match on a run with no agent — so no
  outcome could be recorded, no delivery made, and the run was dead the moment it was
  created. `resolveRunActor()` in `routes/consignments.js` is the fix: a run **with** an
  agent keeps the agent-only rule unchanged, and a run **without** one may be recorded by
  the admin of the FPO that arranged it (`fpoId`), which is exactly what a paper trip sheet
  is. `/deliver` got the same treatment — fixing stop outcomes alone would have left the run
  stuck at the mandi gate. **The farmer's own pickup OTP is still required**: the admin is
  not a skeleton key. `outcomeBy`/`pickupOutcome.recordedBy` record the uid either way and
  **`outcomeByRole`/`recordedByRole`** record which rule applied — "the captain at your gate
  says nobody was home" and "your own group's office says so" are different claims.
  The two pre-existing refusals are preserved exactly: a captain who is not the assigned one
  still gets **404** (never confirm a run exists to a driver it was not offered to), anyone
  else gets **403** `AGENT_ONLY`. `requireRole('agent', 'farmer')` is only the outer gate.
- **`transportMode: { $in: ['hired', null] }` on the captain-pool query, NOT `$ne: 'own'`.**
  `$in` with null is the form that matches a document where the field is MISSING, which
  every consignment written before this change is. `$ne` matching missing fields is already
  recorded below as a bug this codebase shipped once.
- **The app was half-Marathi with no way to choose, and now has a floating toggle.**
  `DEFAULT_LANGUAGE` is `'mr'` and `User.language` was never written by any route, so the
  six screens wired to i18n rendered MARATHI while the other thirty-one rendered ENGLISH —
  a farmer landed on an English dashboard and tapping "Post harvest" opened a Marathi
  modal. A consistently English app would have been better than that.
  `i18n/LanguageContext.jsx` + `components/LanguageToggle.jsx` fix it: an EN / मराठी pill
  floating above the chatbot button, persisted to AsyncStorage (instant, offline) and
  written opportunistically to `User.language` (survives reinstall; a failed sync never
  blocks the switch). `language` was already in the `PUT /api/users/:uid` allowlist —
  nothing had ever called it.
- **Screens must read `lang` from the CONTEXT, never from `userData` or a prop.**
  `userData` is a snapshot taken at login and does not change when the toggle is tapped;
  a threaded prop goes stale the same way. All four previously-wired screens were
  switched. Importing `t` directly and passing a language by hand is exactly how the
  half-translated state happened — a screen that forgets the argument silently falls back
  to the default instead of failing, so nobody notices.
- **Both toggle labels stay in their own script** — "EN" and "मराठी", never "English /
  Marathi" in one language. Someone who cannot read the current language still has to be
  able to find the way out.
- **The Marathi dashboard strings NEED A NATIVE REVIEW.** Common UI words are safe; the
  trade terms are the risk — कांदा चाळ, तारण कर्ज, हमाली, आडत, बाजार समिती carry specific
  mandi meanings and a near-miss reads worse to a Maharashtra farmer than plain English.
  Every such key is flagged in `i18n/strings.js`. **1,293 keys in each language, zero untranslated, 255 `mr-checked` and awaiting a native read** — run `frontend/scripts/marathiReview.js` to see them beside their English source.
- **D1 now REFUSES per commodity, not just per unknown name.** Being in the training set
  is not the same as being forecastable. With six commodities they all beat persistence
  and no gate was needed; at 36, **Methi(Leaves) scores 168% MAPE against a 159% naive
  baseline** — worse than guessing — and without a gate it would have been served as a
  confident forecast with a rupee figure hung off it by H2. `price_forecast_engine.py`
  now returns `NO_SKILL` when the model does not beat naive and `LOW_SKILL` above
  `MAX_SERVE_MAPE` (25%). **33 of 35 served**; Methi and Sunflower refused.
  Same rule D5 uses: beating a useless baseline is not usefulness.
- **The price collector's `--commodities` arg is COMMA-SEPARATED**, so an Agmarknet name
  containing a comma is split into fragments and silently skipped. `Sesamum(Sesame,
  Gingelly,Til)` was lost that way — it logged three "commodity not found" warnings that
  are easy to scroll past. Check the requested count against the accepted count.
- **Storage is now 202 REAL MSWC warehouses across 33 districts**, imported from MSWC's
  own published directory (`scripts/importMswcWarehouses.js`, `--dry` to check first).
  The 11 illustrative seeds remain alongside them; `dataSource` keeps them apart.
- **"Nobody publishes free space" was WRONG.** MSWC publishes vacancy per warehouse, and
  it published it for all 202. The rule was never "hide vacancy" — it was "never INVENT
  vacancy". A verified record now shows MSWC's own figure WITH `capacityAsOf`; an
  illustrative record still shows nothing. `testStorage.js` asserts both halves.
- **MSWC's "Region" column is NOT the district.** It is one of eight regional offices —
  Akkalkot's row says Region "Pune" while the warehouse is in SOLAPUR. Reading region as
  district collapsed 202 warehouses into 8 districts and would have sent farmers to the
  wrong end of the state. The district is the last named field of the ADDRESS, before the
  pincode. Fixed to 33 districts.
- **The MSWC storage RATE is ours, not theirs.** MSWC bills paise per BAG per month plus
  an ad-valorem charge per ₹100 of value, varying by commodity and bag weight — it cannot
  be reduced to one ₹/tonne/month without inventing it. Every imported record carries
  `rateSource: 'assumed'`, every API option carries `rateEstimated: true`, and the notice
  says to ring the godown for the real tariff.
- **⚠️ Coordinates are approximated, and "good enough to rank nearest" WAS WRONG.**
  An earlier version of this entry said exactly that. It is false, and measurably so.
  MSWC gives addresses, not lat/lng: 67 warehouses sit on their taluka's anchor town and
  **135 on the district centroid**, so 213 active records occupy only **90 distinct
  coordinates**. In Nashik SEVEN records share the single centroid point — MSWC Ambad,
  Manmad, Nampur, Nandgaon, Satana, Wani plus one illustrative cold store — and
  `rankByDistance()` therefore returned **22.9 km for every one of them** with an identical
  **₹1,024** to store the same lot. Manmad and Satana are ~70 km apart. Records that are
  *exactly tied by construction* cannot be ranked at all, and six identical one-decimal
  distances do not read as an approximation — they read as broken software.
  **The fix is honesty, not invented coordinates** (making them up would be the storage
  equivalent of faking a live agent position): `Warehouse.locationPrecision`
  (`exact | taluka | district`) is now structured data the UI can act on, derived by
  `storageService.coordinatePrecision()` from the stored field, else the `verifiedNote`
  sentence, else the coordinate itself — so the 213 records already in Atlas needed no
  migration. An approximated record reports **`distanceKm: null`** and a deliberately
  coarse `approxDistanceKm` (10 km buckets for a centroid, 5 km for a taluka town), and
  records sharing one approximated point are returned as a **group** with a plain-language
  label rather than as N separately-ranked rows. `count` stays the true total so a group
  never hides options. Asserted in `testStorage.js`.
- **`data/gradeSpecs.js` is now the OFFICIAL AGMARK standard, 37 commodities (was 8).**
  Source: AGMARK Standards for Fruits and Vegetables (Vol. V), Directorate of Marketing
  and Inspection, under the Agricultural Produce (Grading and Marking) Act, 1937 — rules
  to 1 Nov 2025, designations amended 5 Feb 2024. Extracted with **pdfplumber table
  extraction, not pypdf**: the criteria live in a 3-column table (designation |
  requirements | tolerances) and flat text extraction interleaves the tolerance column
  into the criteria, producing bullets like "Or, exceptionally," — garbage that would have
  shipped to farmers. A/B/C stay as the stored codes; `agmarkClass` carries the official
  Extra Class / Class I / Class II designation, so no migration was needed.
- **⚠️ The AGMARK onion SIZE table's header order does not match its data order.** Read
  literally it says a size-A onion is 5 mm — a pea. The document's own "minimum diameter
  is 10 mm" line disambiguates: the RANGES are diameters, the single numbers are the
  maximum spread allowed within one package. Tomato and Ware Potato size tables are
  unambiguous. Never transcribe a size table from this PDF without a sanity check.
- **Grain and cotton specs are NOT in AGMARK Vol. V** and stay hand-written. Food grains
  (41 commodities) and oil seeds (18) have their own AGMARK volumes we do not have.
  `BY_COMMODITY` must read BOTH `aliases` (generated specs) and `appliesTo` (hand-written
  ones) — reading only `aliases` silently dropped Wheat and Soyabean to the generic spec.
- **Seeded demo data must not squat on a value a TEST claims.** GSTIN uniqueness is
  enforced in `routes/users.js` (409 `GSTIN_TAKEN`), not by an index, so
  `seedDemoData.js` giving a demo buyer the GSTIN from `testOffers.js` made that test fail
  with no visible connection to the seed. Demo GSTIN is now a different valid number.
- **Grade fraud is answered by REPUTATION, not computer vision.** Grades are
  `selfDeclared` and nothing checks them at listing time; D3 can corroborate freshness
  and crop type from a photo but **cannot judge size or colour uniformity**, and no public
  Indian dataset would make that claim true. `trustService.forFarmer()` is the mirror of
  `forVendor()`: delivered lots, quality complaints (`quality_not_as_described`,
  `wrong_crop`, `quantity_short`), and how many the farmer **conceded**. Surfaced on
  `ListingDetailScreen` right under the grade criteria, so a buyer sees it BEFORE paying.
  `GET /api/users/farmer-trust/:uid`.
- **Farmer banding is driven by what was CONCEDED, never by the complaint rate.** The
  first version banded on raw rate, which contradicted this file's own rule that a
  complaint raised is not a complaint upheld: one grumble across four deliveries is 25%
  and came out as "refunds often", branding a farmer on a single unresolved claim. On the
  small delivery counts a real smallholder has, a rate is mostly noise — and the person
  paying for that noise has the least power in the trade. Unconceded complaints still
  SHOW in `qualityDisputes` and `byReason`; they just do not decide the label.
  Regression-tested in `testMandiSales.js`.
- **`CropListing.location` uses FLAT `lat`/`lng`, not `coordinates: {lat,lng}`.** The seed
  script wrote the nested shape, Mongoose strict mode dropped it silently, and every
  listing came out with a city and no pickup point — so a buyer choosing a destination
  got *"This listing has no pickup location"* and no transport could be quoted. The model
  already carries a comment warning about this exact failure; it caught the frontend once
  and the seed script a second time. `scripts/seedDemoData.js` now **verifies what was
  STORED** (runs `toLatLng()` over every seeded listing, checks every order has the dates
  the trust ledger reads) rather than trusting that a write which threw no error produced
  usable data.
- **Hooks must sit ABOVE the `if (loading) return` guard.** `FarmerSalesScreen` crashed on
  login with *"Rendered more hooks than during the previous render"*: G2's trust-fetching
  `useEffect` was added below the early return, so it did not run on the first render
  (loading true) and did run on the second. React counts hooks per render — the count
  changed and the screen died the moment data arrived. **Parsing, the missing-import
  sweep and a clean Metro bundle all passed it**; only launching the app caught it.
  There is now an AST check for the whole bug class (walks each JSX-returning function,
  skips nested components, flags any hook call after the first `return`) — 245 components,
  clean. Re-run it after adding any hook.
- **"Vendor" and "Agent" are now BUYER and CAPTAIN on screen only.** The stored values
  stay `role: 'vendor'` / `'agent'`, and `vendorUid` / `agentId` stay as they are — those
  appear **324 times across 28 files**, inside partial unique indexes, guarded
  `findOneAndUpdate` filters and 569 tests, and every existing Atlas document uses them.
  A schema rename would need a migration and buys nothing a user can see. Display text
  goes through `roleLabel()` in `i18n/strings.js` (en + mr). **A hardcoded "Vendor"
  anywhere is how this half-reverts** — add the string there, not inline. "Captain" was
  already the app's own word (`JobOfferSheet.jsx`, and the risks table).
- **`scripts/seedDemoData.js` gives the nine demo accounts a past.** It CANNOT create the
  logins: auth is Firebase email/password and this backend has no firebase-admin
  credential — `middleware/auth.js` verifies against Google's public JWKS, which checks a
  token but cannot mint one. Register the nine emails through the app first; the script
  then finds them by email, and **names the missing ones loudly** rather than seeding half
  a demo nobody notices until the panel is watching. `--purge` removes by owner uid, so
  the seeded data can look real on screen (no `PH#TEST_` prefixes) and still be removed.
  Re-running always purges first, so history never doubles.
- **Storage exists (H1) — the LAST unbuilt clause of the problem statement.**
  `models/Warehouse.js`, `data/warehouseSeed.js`, `routes/warehouses.js`,
  `services/storageService.js`. Seed with `node scripts/seedWarehouses.js` (idempotent,
  and it REFUSES to overwrite a record someone has promoted to `dataSource: 'verified'`).
  **Every seeded record is `seed_illustrative` and every response says so.**
  `availableTonnes` is null on all of them on purpose — free space changes daily, nobody
  publishes it, and inventing a number would be the storage equivalent of faking a live
  agent position.
- **Onion in cold storage is REFUSED, not priced.** It sweats on removal and rots; a
  ventilated kanda chawl is the right structure. `storageService.suitability()` returns
  the reason and `/warehouses/near` returns the option *with* its refusal rather than
  dropping it, so a farmer sees why instead of wondering where it went.
- **Spoilage rates are calibrated against published outcomes, and the calibration is
  written down.** NAFED cut its own onion storage losses from 25% to 15% over a season;
  Pune farmers reported ~50% loss on-farm after the September 2025 rains. At 1.5%/week a
  chawl models 27.7% over five months and on-farm 58% — both at the pessimistic end, kept
  there deliberately because 1.5%/week is **D2's own onion figure** and the two must rest
  on the same physics.
- **⚠️ D1 FORECASTS THE DISTRICT MODAL, NOT THE FARMER'S PRICE.** H2's first version
  subtracted the farmer's rate from the modal forecast and produced a **₹1.96 lakh "gain"
  from a forecast predicting a 9% FALL** — wrong sign, three extra digits, entirely
  plausible on screen. Apply the forecast's PERCENTAGE to the farmer's own price;
  `decision.districtModal` carries the modal separately and labelled. Regression-tested
  in `testStorage.js`. Never subtract figures from two different price bases.
- **H2 refuses past 14 days.** `train_price_forecast.py` measured MAPE for 1–14 days only.
  A rupee figure on an unmeasured horizon is "a guess wearing a decimal point" — and a
  rupee figure reads as far more certain than a percentage, so the refusal paths matter
  MORE here than behind D2's verdict, not less.
- **A hold that loses money says so.** `netGain` is returned negative, never clamped —
  same rule as the consignment saving. Pledge-loan interest is shown as a SEPARATE
  `netGainIfBorrowed`, because a farmer who can wait unfunded pays none and folding it in
  by default would understate holding.
- **Buyer trust is now a record, not a check digit (G2).** `services/trustService.js`
  reads what was already being stored and never used: `Order.settlement.paidAt` against
  `Order.deliveredAt`, `Dispute.againstUid`, and G1's mandi payment dates. Surfaced on
  farmer-facing offers, on `RecordSaleScreen`'s "My buyers", and — the point of the
  whole thing — as a lookup while the farmer is TYPING a buyer's name, so a trader can
  be checked before the crop changes hands rather than after.
  **Below `MIN_TRADES_TO_SCORE` (3) it refuses to band a buyer** and returns counts only.
  Two late settlements must not brand a real, named trader; same discipline as D3
  declining grape at 280 images, applied where being wrong costs a person their trade.
- **The two evidence streams are NOT merged, deliberately.** A registered vendor's
  in-app record and a mandi trader's farmer-recorded one are separate calls returning
  the same shape. Joining them by name would assert that "Balaji Traders" at Lasalgaon
  IS the account holder of that name — and `buyerKeyFor()` errs toward fragmenting
  precisely because a wrong merge is a false accusation. Asserted in `testMandiSales.js`.
- **Unpaid is reported as `unrecordedAfter30d`, never "defaulted".** The money may have
  arrived without the farmer tapping anything — this app has no payment rail and cannot
  know. Every trust response carries a `disclaimer` saying so, and the mandi stream says
  it is one side's account of a two-party trade.
- **An outstanding payment overrides a fast median.** A buyer with two unpaid sales and
  one paid next-day bands as `slow`, not `prompt`. Regression-tested — the naive
  "median days" reading would have made the worst payer on the ledger look like the best.
- **The app could only see trades that ran through it (G1).** Everything assumed
  Offer → Order → settlement; almost no real trade does. A farmer who read the sale-window
  advice, walked to Lasalgaon and sold there vanished at exactly the moment the outcome
  became knowable. `models/MandiSale.js` + `routes/mandiSales.js` +
  `Farmer/RecordSaleScreen.jsx` record it. **Deductions are LINE ITEMS, not a total** —
  a lump "charges ₹509.51" hides the whole problem; itemised against the gross it shows
  Chavan's 512 kg of onion netting **₹2.49**. The buyer is FREE TEXT with a normalised
  `buyer.key` (name + market), because a mandi trader will never register and requiring
  an account would restrict the trust ledger to the buyers least needing scrutiny.
  Market-type suffixes (APMC / mandi / बाजार समिती) are stripped as whole TOKENS —
  `\b` does not fire on Devanagari, so a regex boundary would have fragmented every
  Marathi market name silently.
- **`daysToPayment` returns null for an unpaid sale, never 0.** An unpaid sale and one
  paid the same day are opposite facts; collapsing them reports every defaulter as the
  fastest payer at the market. Every caller must handle null. This is load-bearing for G2.
- **Agents were paid for one leg of a two-leg drive.** Fares charged the loaded leg
  only, so revenue per kilometre ACTUALLY driven FELL as trips got longer (the fixed
  `base` amortised away while the empty drive home grew): a 200 km tempo run returned
  ₹14.8/km against an ₹18–22/km running cost. `fareService.js` now adds a return charge
  that **tapers from a 40 km threshold** — only the distance beyond it is charged, so a
  41 km trip does not cost far more than a 39 km one. Below the threshold nothing is
  added, because inside ~40 km an agent can realistically find another job near the
  drop-off. Shown to the vendor as its own line in `BookTransportScreen`, never folded
  into the transport figure. Residual, accepted: tempo at exactly 40 km earns ₹17.75/km
  against an ₹18 floor — 1.4%, inside the precision of a cost range that is itself an
  estimate. Tuning further would be false precision.
- **The return leg is ONE drive home, not one per stop.** First version billed it against
  the loaded route length, which broke pooling: a shared run visiting three farms has a
  long winding route but still only one drive home, while three separate trips have
  three. `testConsignments` caught it immediately — the shared run came out ₹5,013
  against ₹4,414 for three separate trips, inverting the one feature aggregation exists
  for. Callers whose route differs from the return path pass `returnDistanceKm`
  explicitly (see `routes/consignments.js`, which measures drop-off→first farm).
  Regression-tested in `testOrders.js` on the ECONOMICS, not the fare numbers, so the
  assertions survive a repricing.
- **DAP is 18-46-0, not 0-46-0.** The fertilizer task sized urea from the full nitrogen
  requirement while ALSO prescribing DAP for phosphorus, ignoring the nitrogen the DAP
  already delivered. Farmers were told to over-apply N by ~20% on cereals and **~98% on
  soybean and gram**, where the P need is high and the N need is low — DAP alone already
  covered the whole season. The credit must come off the SEASON total, not the basal
  touchpoint: all P goes on as basal, so all the DAP nitrogen lands on day one, and
  crediting only the basal leaves the later top-dressings sized for a crop already fed.
  `dailyTaskEngine.js` now computes `seasonDapN` and splits only what is genuinely owed.
  Verified by summing delivered N:P:K across all four touchpoints against the
  requirement — every crop now lands on 0% error.
- **Metro caches the bundle.** A byte-identical `size_download` after an edit means you
  got a cached response, not a rebuild — append `&_r=$(date +%s)` when verifying that a
  change actually reached the bundle. This masked a broken edit once already.
- **Check endpoints have CALLERS, not just that route files exist.** C2, C4 and C5 were
  each marked complete because the plan's named backend files existed — but nothing in
  the app called `PUT /api/users/business`, `GET /api/disputes/mine`, `/respond`,
  `/resolve`, or `GET /api/orders/export.csv`. The GSTIN badge rendered on every offer
  and could never be earned. Grep for a caller before calling a feature done.
- **CSV leaves the app via the share sheet**, not a download. Expo Go cannot write to
  Downloads, and the export endpoint is authenticated so a plain browser link arrives
  without a token — it is fetched with axios, written to `FileSystem.cacheDirectory`, and
  handed to `Sharing.shareAsync`. `expo-file-system` and `expo-sharing` both ship inside
  Expo Go, so this does not break the no-dev-build constraint.
- **All screens now exist.** `Vendor/RequirementsScreen` (post a want, read responses),
  `Farmer/BuyerDemandScreen` ("buyers looking for your crop"), and
  `shared/ReceiptScreen` — which carries BOTH the C5 receipt and the C4 grievance form,
  because both are things you do after one order and splitting them means hunting two
  menus. Reached from: vendor header "I Need", the farmer dashboard demand banner, and
  a receipt link on delivered orders in both order lists.
- **Both migrations are APPLIED** (`migrateMaharashtra.js`, `migrateGrades.js`). Existing
  documents now use `localName`/`titleLocal`, `state: 'Maharashtra'`, and structured grades.
- **Pre-conversion test data is PURGED** (`scripts/purgePreConversionData.js`). 15 accounts
  whose land sat physically in Tamil Nadu were removed with their land/plots/crops/tasks.
  4 users remain: 3 kept because they have real orders, 1 with genuine Maharashtra land.
  One survivor ("Euodias") still has Kanchipuram land — kept deliberately because deleting
  data attached to real orders needs a decision, not a script.
- **Farmer payout (B1).** `Order.farmerPayout` + `settlement{}` now exist; the agent
  collects the **fare only**, the vendor settles the crop value with the farmer, and the
  farmer confirms via `POST /api/orders/:id/settle`. The app *records* settlement — it
  does not move money, which is why nothing auto-flips on delivery.
- **`RegisterScreen` hardcoded Chennai (A6).** Now reverse-geocodes through
  `matchDistrict()` and stores `null` rather than guessing. The same bug existed in
  `RootNavigator` (offline fallback) and `locationService` — both fixed.

## Datasets

Downloaded to `~/Downloads`:
- **Fruit and Vegetable Disease (Healthy vs Rotten)** — Kaggle `muhammad0subhan`.
  The file on disk is **`~/Downloads/archive (1).zip`, 5.1 GB** (not `archive.zip`, not
  2.8 GB). Already unpacked to `ai-service/data/produce/` (gitignored, 4.9 GB).
  **28 classes, 14 produce types × healthy/rotten, 29,277 images.**
  ⚠️ **There is no onion class**, and grape/pomegranate have only 200 images each — the
  three Maharashtra headline crops are the worst covered. Well covered: apple 5.4k,
  banana 4.8k, orange 4.3k, mango 4.1k, strawberry 3.2k, tomato 1.2k, potato 1.2k.
  Decide what D3 actually demos on before building it.
- **`Agriculture_Crops_Schemes+Reports_18thAugust.pdf`** — Maharashtra scheme list, for
  rebuilding `data/schemesData.js`. Extract with `pypdf` (already installed):
  `python3 -c "from pypdf import PdfReader; print('\n'.join(p.extract_text() for p in PdfReader('PATH').pages))"`

Already in the repo, nothing to download:
- **Mandi price history** — `backend/scripts/collectPriceHistory.js` pulls it live from
  Agmarknet. No API key. Resumable. ~6 minutes.
- **Maharashtra agro-climatic zones** — `backend/data/mhAgroZones.js`. Official nine zone
  names from the government "Climate and Agriculture" publication, all 36 districts mapped,
  renames aliased. The district assignment is a **district-level approximation** (real zone
  boundaries are drawn at taluka level) — see the warning in that file. Nashik has been
  verified and moved to the Plain zone.
- **Collected mandi price history** — `ai-service/data/prices_maharashtra.csv`, 623,202
  rows, 2018-01-01 → 2026-08-22 (gitignored). Wheat 176k, Soyabean 164k, Onion 126k,
  Tomato 87k, Cotton 44k, Paddy 25k. This is D1/D2's training set.
- **PlantVillage disease model** — already trained, in `ai-service/models/`.

## Progress against BUILD_PLAN_MAHARASHTRA.md

- **Phase A — done.** A1–A7. `DEFAULT_STATE_ID = 20`, 36 districts + 90 anchor towns
  (`data/districtCentroids.js`), 9 agro zones / 64 crops (`data/agroZones.js`), 18
  Maharashtra schemes, English+Marathi via `frontend/src/i18n/strings.js`.
- **Phase B — B1–B5 done.** Payout/settlement, `services/saleWindowService.js`,
  `GET /api/mandi/sale-window`, mandi benchmark in `HarvestPostModal`, arrivals signal,
  buyer price context in `ListingDetailScreen`.
- **Phase D — D0, D1, D2 done.** 623,202 price rows collected.
  **D1 price forecast**: LightGBM, 1–14 day horizon, now trained on **1.92M rows across
  36 commodities / 590 district-commodity series** (was 623k rows and 6 commodities).
  **15.51% MAPE vs 17.45% naive persistence** (+11.1%) on a 6-month time-based holdout.
  Both numbers rose because the crop mix now includes volatile vegetables — the
  comparison that matters is model vs naive on the SAME data. **33 of 35 commodities beat
  persistence.** `POST /price-forecast`.
  **D2 sell/hold classifier**: AUC **0.733**, and the metric that matters —
  **+6.57% return vs 0% always-sell and +3.82% always-hold**, capturing **66.8%** of the
  perfect-foresight ceiling. 34 of 35 commodities beat always-hold. `POST /sell-hold`.
  Both attach to `/api/mandi/sale-window` as *additive* layers — if the AI service is
  down the farmer still gets the statistical read.
  **D3 produce freshness**: MobileNetV2 head, **30 classes (15 produce × healthy/rotten)**,
  **99.0% freshness accuracy vs 52.98% majority** on a 6,219-image held-out split;
  produce-type accuracy 98.79% delivers most of D4 too. `POST /grade-photo` on the AI
  service, `GET /api/listings/:id/freshness` on Node, with badges on
  `ListingDetailScreen`.
  **D4 is served BY D3** — see the note below.
  **D5 built and NOT SERVABLE** — its data ends in 2017; see below. A district yield
  BENCHMARK ships in its place.
- **Phase C — C1 done.** Digital offers: `models/Offer.js`, `routes/offers.js`, a
  Make-an-offer sheet on `ListingDetailScreen` and an Offers tab on `FarmerSalesScreen`
  with accept / counter / decline.
  **C2 done.** Buyer verification: real GSTIN format + check-digit validation
  (`services/gstinService.js`), `User.business` / `User.verification`, a badge on every
  offer, and a `?verified=1` filter.
  **C3 done.** Structured grading: `data/gradeSpecs.js` (8 per-commodity specs, A/B/C with
  checkable criteria), `CropListing.grade` with the spec key + version pinned,
  `GET /api/listings/grade-spec`, a grade picker in `HarvestPostModal` and the same
  criteria shown to the buyer.
  **C4 done.** Grievances: `models/Dispute.js`, `routes/disputes.js` — 8-reason enum,
  evidence photos, raise / respond / resolve / withdraw, 14-day window.
  **C5 done — Phase C complete.** `GET /api/orders/:id/receipt` and
  `GET /api/orders/export.csv` (role-aware columns, UTF-8 BOM, formula-injection
  guarded). C5 also closed a real gap: an accepted offer now actually PRICES the
  order — see below.
- **Phase E — done.** The demand side: `models/Requirement.js`, `routes/requirements.js`
  — buyers advertise a want, farmers see "buyers looking for your crop" matched on
  commodity + the buyer's own radius + grade, plus a dashboard signal.
- **Phase F — F1 done.** Multi-farmer lots: `models/Consignment.js`,
  `routes/consignments.js`, multi-waypoint OSRM in `routeService.getMultiStopRoute`,
  plus `Vendor/ShareVehicleScreen` (pick orders, see the measured saving, send one
  vehicle) and `Agent/ConsignmentTripScreen` (stop list, one code per farm).
  **F2 done.** `models/Fpo.js`, `routes/fpos.js` — membership plus
  `GET /api/fpos/bundles` (prices a group's lots as one run against separate trips using
  F1's own routing and fare table), an agreed **revenue split**
  (`PUT/DELETE /api/fpos/:id/shares`, `GET /api/fpos/:id/settlement`), plus
  `Farmer/FpoScreen` and `Vendor/BundlesScreen`.
  **F2 Phase B done.** `Fpo.paymentMode` (facilitation / procurement) with a per-grade
  procurement rate table and a percentage-or-per-kg facilitation fee, plus
  `Consignment.transportMode` (hired / own / contracted). Backend only — **no frontend
  screen reads any of it yet**; `Farmer/FpoScreen` still shows the F2 view. See the
  decision-log entries above for the fee ordering, the procurement × byShare refusal and
  the agentless-run authorisation.
  **F2 Phase C done.** `services/lotCatalogService.js` — `GET /api/fpos/bundles` now
  returns **one lot per (FPO, crop, GRADE)** with the price spread inside each lot, a
  truthful minimum order, per-contributor trust and the pooled-vs-separate collection cost
  computed per lot; the admin dashboard's `producesAggregation.availableLots` is the same
  lots from the same function. Ungraded produce keeps its own "grade not declared" bucket.
  Backend only — `Vendor/BundlesScreen.jsx` still renders each entry with the field names it
  already read (`farms`, `totalKg`, `lots`, the fare figures), which now describe one grade
  lot rather than a whole group. See the decision-log entries above, especially the
  same-farmer-in-two-lots warning that Phase D (ordering/allocation) has to honour.
  **F2 Phase D done.** `services/lotAllocationService.js` (already present) plus
  `POST /api/fpos/lots/quote` and `POST /api/fpos/lots/confirm` in `routes/fpos.js` — a buyer can
  now actually buy one grade lot: the quote names who supplies what at whose price and what each is
  owed, the confirm takes the stock atomically and writes one Order per contributing farmer plus one
  Consignment. Backend only — **no frontend screen calls either endpoint yet**. See the decision-log
  entries above for the quote/confirm split, the `quoteRef` staleness gate, the compensation-based
  rollback and the scope limits (single lot, no multi-run splitting, no admin approval gate).

### Region gotchas that keep biting
- **Renamed districts:** Aurangabad → **Chhatrapati Sambhajinagar**, Osmanabad →
  **Dharashiv**, Ahmednagar → **Ahilyanagar**. Both names must resolve.
- **Agmarknet's own spellings differ:** `Amarawati`, `Chattrapati Sambhajinagar` (one
  `h`), `Gondiya`. It also lists **Osmanabad and Dharashiv separately** (all 8 markets
  are under Dharashiv), plus `Murum` and `Bandra(E)` as if they were districts. All
  aliased in `geoService.js` and `agmarknetService.js`.
- **Nashik is in the PLAIN zone, not Western Ghat** — deliberately. Its western talukas
  are ghat, but Lasalgaon/Niphad/Yeola (the onion belt) are eastern plain. Left in
  Western Ghat, crop recommendations offered rice and strawberry for an onion district.
- **`price_features.py` is the one feature pipeline.** D1 and D2 both import it; a
  feature changed in one place changes both. `price_forecast_engine.build_features`
  deliberately recomputes the same features at serving time (it works from a short
  caller-supplied series, not the CSV) and D2 reuses it **passing its own bundle** —
  reading D1's globals from D2 silently mislabels every categorical.
- **D2 defers where it has no skill.** It scores AUC 0.72 on Onion but 0.56 on
  Soyabean. Below `LOW_SKILL_AUC` it reports `confidence: 'uncertain'` and is NOT
  allowed to overrule the statistical action. Don't "fix" that by averaging it away.
- **D2's holding-cost figures are assumptions, not measurements** (tomato 3%/week,
  onion 1.5%, grains 0.5%). They set the label, so they move the results — the report
  carries a sensitivity table at 0.5x/1x/2x.
- **D3 refuses rather than guesses.** It serves only the **11** produce types that cleared
  BOTH bars (≥400 training images AND ≥90% measured accuracy): Apple, Banana, Bellpepper,
  Carrot, Cucumber, Mango, **Onion**, Orange, Potato, Strawberry, Tomato. Grape/Guava/
  Jujube/Pomegranate have 280 training images and are refused despite scoring well — 60
  test images is not evidence. Don't widen the list without retraining and re-measuring.
- **ONION IS NOW IN D3, at 99.67%** on 1,839 test images (8,582 train). Source: *Image
  Dataset of Red and White Onion Bulbs and Leaves*, Kulkarni, Pawale & Suryawanshi (2025),
  Mendeley Data V2, CC BY 4.0 — **bulbs only**. Leaf images were deliberately excluded: a
  farmer photographs produce in a sack, not a standing plant, and leaves would train the
  model to answer a question the app never asks. Adding it made every other number go UP
  (freshness 98.88 → 99.0, produce-type 98.79 → 98.86).
- **`CROP_ALIASES` in `freshness_engine.py` is the SERVING GATE, not the model.**
  Retraining with a new produce type does nothing until its crop names are added there —
  the engine refuses on the claimed crop name BEFORE it looks at the pixels, so a missing
  alias tells a farmer "not in the training data at all" while the model knows the crop
  perfectly well. Onion scored 99.67% and still refused for one deploy because of this.
- **⚠️ D5 DOES NOT SHIP. It cannot be served at all, and earlier notes here saying it
  "ships narrowly for 5 crops" were WRONG.** The model is real — `train_yield.py`,
  **50.08% MAPE vs 59.25% persistence** (+15.5%) — but its INPUTS stop before the present:
  ICRISAT crop yields end **2017** and rainfall ends **2015**. The feature vector needs
  the district's three previous yields and the CURRENT year's monsoon. Predicting 2026
  would need 2023–25 yields and 2026 rain, which exist in no dataset this project has.
  Filling those lags with a mean or the last known value is fabricating the model's
  inputs and calling the output a forecast. **Count THREE shipped models: D1, D2, D3.**
  What ships instead is `services/yieldBenchmarkService.js` — the DATA, not the model:
  what each crop actually yielded per district over 2013–2017, refusing per crop and per
  district rather than approximating. `GET /api/mandi/yield-benchmark`,
  `GET /api/mandi/district-yields`. If ICRISAT ever publishes past 2017, that service is
  what D5 replaces.
- **The benchmark never substitutes a parent district's number.** ICRISAT uses 1966
  apportioned boundaries and covers 25 of Maharashtra's 36 districts; Latur was carved
  out of Osmanabad in 1982, Washim out of Akola in 1998. A farmer in Latur is told the
  data lives in Dharashiv's rows — and is NOT shown Dharashiv's yield as if it were
  Latur's. Asserted in `testMarketIntel.js`.
- **D5's training detail, for the record.** `train_yield.py` joins the ICRISAT crop
  file with `data/icrisat_rainfall.csv` (DLD Biophysical → Monthly Rainfall, apportioned,
  Maharashtra 1966–2015) on `(Dist Code, Year)` — both are the apportioned 1966-boundary
  set, so no fuzzy matching.
  An ablation on the IDENTICAL split puts rainfall's own contribution at **4.46 points
  (8.2%)** — the model beat persistence without it too, so the earlier "no signal without
  rainfall" note was partly an artifact of the old 2012–2017 test window.
- **D5 serves only crops under 40% MAPE, not merely ones that beat their baseline.**
  The first rule was "beats both baselines", which let SAFFLOWER through at **101% MAPE**
  because its baselines were 134% and 125%. Beating a useless baseline is not usefulness.
  Served *by the model, in its own report*: Castor, Chickpea, Groundnut, Rabi Sorghum,
  Wheat. That list describes the model's measured skill — it is NOT a list of anything
  the app serves, because the app cannot run D5 at all.
- **D5's prediction is POST-MONSOON, not sowing-time.** Current-year rainfall is a
  feature, so it answers "given the monsoon that has fallen, what yield to expect" — the
  question a farmer, trader or procurement office actually asks in October. A sowing-time
  version would have to drop those columns and is a much harder problem. Don't describe
  it as a forecast.
- **ICRISAT units are not uniform.** Sugarcane is recorded as gur/jaggery (~7,100 kg/ha)
  not cane (~80,000); cotton reads as lint. Wheat/rice/soyabean check out against
  published figures. Verify any crop against a known figure before showing it.
- **There is no separate D4 model, deliberately.** D3's head already identifies the
  produce type at **98.79%** on real produce photos, and that IS crop-type verification —
  exposed as `cropCheck` / "Lot verified" from the same forward pass. The plan suggested
  fine-tuning the PlantVillage backbone, but that model is trained on LEAF images for
  pepper/potato/tomato only, so it would be strictly worse. Training a second, weaker
  model to raise a model count is exactly what the plan warns against. **Count three
  models (D1, D2, D3), not four**, and say D4's job is done by D3.
- **D3 is FRESHNESS, not grading.** "Freshness verified" is true; "Grade A certified"
  would not be, and no public Indian dataset would make it true. The badge wording lives
  in `freshness_engine.py` so every screen makes the same claim.
- **`.lean()` returns a BSON `Binary`, not a Node Buffer.** `form-data` needs a real
  Buffer to stream — a lean read fails with "source.on is not a function". Read image
  documents WITHOUT `.lean()`.
- **Never quote a model's MAPE without the naive baseline beside it.** Persistence is a
  strong forecaster for commodity prices; D1's report JSON carries both numbers and
  `beatsBaseline`, and `testMarketIntel.js` asserts the shipped model still beats it.
- **F1 did NOT make `Order.pickup` an array**, despite what the build plan says. B1, C4
  and C5 turned Order into a per-farmer document (farmerPayout, settlement, disputes,
  receipts), so three farmers in one Order has no answer to "whose settlement?". Instead
  each farmer keeps their own Order and a **Consignment** groups them into one shared
  trip. Three sales, one vehicle.
- **Stop order is solved EXACTLY, by brute force** (≤5 stops = ≤120 permutations). The
  first version used a nearest-neighbour heuristic and picked a 168 km route where 120 km
  existed — which flipped a real saving into "sharing costs more". Don't reintroduce a
  greedy heuristic here.
- **The fare split is BY WEIGHT, not even**, and rounding drift is absorbed by the largest
  stop so shares sum exactly to the fare charged. An even split would make aggregation
  actively bad for the smallest farmer — the person it exists to help.
- **The quote reports a NEGATIVE saving honestly** when farms are too far apart for
  pooling to pay. Don't clamp it to zero.
- **A STOP CAN FAIL, and the model says so.** The consignment status enum is trip-level,
  so a captain reaching farm 3 of 5 to find nobody home had nowhere to put it: the run
  could not be delivered (every stop had to be `collected`), the totals kept claiming the
  planned load, and the farmer's order sat in `accepted` forever while a buyer had
  committed to a quantity that would never arrive. `Consignment.stops[].outcome` is now
  `pending | collected_full | collected_short | not_collected` with `collectedKg` and a
  four-value `failureReason` (farmer_absent / quantity_not_ready / produce_rejected /
  other — a fixed list, same rule as `Dispute.reason`). Written by
  `POST /api/consignments/:id/stop-outcome`; `/collect` is the same handler with the
  outcome fixed to `collected_full`, so every existing caller is untouched. A short
  pickup still needs the farmer's OTP — it is still a pickup. `not_collected` does not,
  because the absent farmer is exactly who cannot read a code out; the record names the
  captain who declared it and the farmer's remedy is a dispute.
- **A failed stop CANCELS that farmer's order — it does not deliver it.** `cancelled`
  already fits: no crop moved, so `farmerPayout`/`cropTotal`/`quantityKg` go to 0,
  `deliveredAt` is never set, and `POST /api/orders/:id/settle` already refuses anything
  outside picked_up/delivered, so nobody can record a payment for produce that never
  left the farm. `Order.pickupOutcome` keeps `orderedKg` beside `collectedKg` so what was
  AGREED is not erased by the rewrite. (It is `pickupOutcome`, not `collection` —
  `collection` is a reserved Mongoose pathname and shadowing it breaks the model.)
  Uncollected kilograms are restocked to the listing, exactly as the vendor-cancel path
  does. A run where EVERY stop failed closes as `cancelled` with no drop OTP: nobody
  hands over a code for an empty vehicle, and the captain must not be stranded on a job
  that can never complete.
- **THE FARE SPLIT IS FROZEN ON PLANNED WEIGHT WHEN A STOP FAILS.** Deliberate, and the
  alternative was tried on paper first: 400/500/600 kg sharing a tempo pay ₹1,066/₹1,333/
  ₹1,600, and re-splitting by ACTUAL weight after the 600 kg farmer is absent charges the
  two who did everything right 67% more for a third party's failure — the same perverse
  outcome the by-weight split exists to prevent, arriving through a different door.
  "The vendor absorbs it" is not a different amount of money either: `fare.total` is
  frozen as the agent's payout and the vehicle drove that route whatever happened. So the
  failed stop keeps its share, on its own cancelled order, and the attribution survives.
  `stop.fareShareBasisKg` records the weight each share was computed from so this reads as
  a decision rather than a leftover. `sum(stops.fareShare) === fare.total` holds
  unconditionally because nothing is recomputed — asserted in `testConsignments.js`.
- **THE FPO BUNDLE NO LONGER TRUNCATES IN SILENCE.** It was `lots.slice(0, MAX_BUNDLE)`:
  a twelve-member group returned a price, a saving and a member list built from five lots
  and the other seven did not exist in the response — and WHICH five was whatever order
  Mongo returned, so two identical requests could quote two different bundles. The cap
  stays (MAX_STOPS is a real constraint with a stated reason); the silence goes.
  `lotsIncluded` / `lotsAvailable` / `membersIncluded` / `membersAvailable` / `truncated`
  / `excludedLots` now account for every eligible lot, and a lot with no coordinates is
  excluded BY NAME instead of silently killing the whole bundle.
- **The five are chosen as the TIGHTEST CLUSTER, not the biggest lots.** The vehicle is
  the cost and the load is nearly free, so a scattered pick reproduces exactly the greedy
  stop-order failure above — a long route turning a real saving into "sharing costs more".
  Candidates are generated by ANCHOR (each lot plus the four nearest to it), so a
  twelve-member FPO scores twelve candidate sets rather than 792, and each is then scored
  EXACTLY by the same ≤120-permutation brute force `orderStops()` uses — which
  `routes/fpos.js` imports from `routes/consignments.js` rather than reimplementing.
  Ties break on route length, then quantity, then lot id, so the selection is
  deterministic; the bundle is also routed in optimal visiting order now, so the distance
  quoted is the distance a consignment built from those lots would actually drive.
- **An FPO share split is a RECORD, not a payment.** Members keep their own lots and
  their own payouts by DEFAULT — that stays the default. A recorded split shows what the
  group agreed alongside what each member's own lots were worth, and the difference, so a
  member who does worse under the split sees it before agreeing. Shares must total 100
  (±0.5, so 33.33×3 is accepted), and rounding drift goes to the largest share so the
  parts sum exactly. The app never moves money — same rule as B1.
- **A requirement is NOT an order.** Nothing is reserved and a farmer responding is not
  selling — they are raising a hand. The trade still goes through Offer → Order, because
  a second parallel path would mean two settlement flows and two places for the money to
  be wrong.
- **Requirement matching respects the BUYER's radius**, not an invented one. A buyer who
  says 50 km must not be shown lots 300 km away that they will refuse. Ungraded lots are
  deliberately NOT excluded by a grade filter — most listings have no grade and hiding
  them empties the screen.
- **An accepted offer must be passed as `offerId` when booking** (`POST /api/orders`),
  or the order silently reverts to the listing price and the whole negotiation was
  decorative. The offer is re-verified server-side (accepted, this vendor, this listing,
  unspent) and marked spent atomically, so one agreed price cannot be used twice.
- **CSV exports MUST neutralise a leading `= + - @`.** Excel and LibreOffice execute
  those cells as formulas, so a crop name or company field is an injection vector into
  whoever opens the file. `csvCell()` in `routes/orders.js` prefixes an apostrophe;
  quoting alone does NOT stop it. Tested with a live `=HYPERLINK` payload.
- **A dispute's counterparty is DERIVED from the order, never from the request.** A
  raiser who could name their counterparty could file against someone with no part in the
  trade. Transport reasons route to the agent; everything else to the other trading party.
- **The app does not adjudicate disputes.** It records what was claimed, with photos, and
  what the two parties agreed. `resolution.resolvedBy` says who closed it — a dispute
  closed by the person complained about reads very differently from one closed by the
  complainant. Don't build an arbitration engine into it.
- **Grades are SELF-DECLARED and are not AGMARK.** The farmer picks against published
  criteria; nobody checks. `grade.selfDeclared` and the spec's `disclaimer` exist so the
  UI cannot quietly stop saying so. D3's photo model can later corroborate *freshness*,
  which is a narrower claim than grade — do not present it as grading.
- **A passing GSTIN check digit is NOT verification.** It proves the number was issued,
  never that it belongs to this buyer. Self-service tops out at `documents_submitted`
  ("GSTIN on file"); `verified` is granted only by `scripts/verifyBuyer.js` after a human
  looks. `verification` is absent from the profile-update allowlist for the same reason
  `role` is. Don't add a route that grants it.
- **`$ne` matches MISSING fields in MongoDB.** `{'verification.status': {$ne: 'unverified'}}`
  returned every user created before C2 added the field. Use `$in` with the explicit list.
- **An offer holds NO stock.** Reserving inventory when someone merely asks would let
  one vendor freeze a farmer's whole listing with speculative bids. Stock is taken only
  by the atomic decrement in `POST /api/orders`, so an accepted offer can still fail with
  `NOT_ENOUGH_STOCK` — that path is real, tested, and must stay visible in the UI.
- **A still-open day reports partial arrivals.** Arrivals are a SUM across markets, so
  today's figure is a fraction of reality until the day closes. `saleWindowService`
  excludes it; do not "simplify" that away. Regression test in `testMarketIntel.js`.

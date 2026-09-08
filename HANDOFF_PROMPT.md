# FARMERAPP — handoff brief for a fresh session

Copy this whole file as your opening prompt.

---

You are taking over an in-progress project. **Read this entire brief before
touching any code.** A great deal has already been decided, built and tested;
most mistakes available to you are re-deciding something that was already
settled for a good reason, or rebuilding something that already exists.

---

## 1. What this project is

**FARMERAPP** — a farming and agri-marketplace app for **Maharashtra, India**,
built for Smart India Hackathon problem statement **26132: "Strengthening market
linkages and price discovery for farmers"** (Maharashtra State Innovation
Society, Govt. of Maharashtra).

```
backend/     Node + Express 5 + Mongoose 9 → MongoDB Atlas (replica set)
frontend/    React Native, Expo SDK 54
ai-service/  Python + Flask — plant disease CNN, LightGBM price models
```

**Read `CLAUDE.md` at the repo root first.** It is long, it is the accumulated
memory of this project, and almost every hard-won lesson is written there.
`FLAWS_AND_FIXES.md` records a recent audit and which items are already fixed.

### The four actors
- **Farmer** — registers land and crops, gets daily tasks, posts harvest
  listings, sees mandi prices and sell/hold advice, records mandi sales.
- **Buyer** (stored as `role: 'vendor'`, shown as "Buyer") — browses listings,
  makes offers, orders, books transport, posts requirements.
- **Captain** (stored as `role: 'agent'`, shown as "Captain") — an independent
  driver who accepts dispatch jobs, collects with an OTP, delivers.
- **FPO** (Farmer Producer Organisation) — a real, government-registered
  producer company that aggregates its members' produce.

---

## 2. Hard constraints — every one was learned the hard way

Violating these will break the app or make it dishonest. They are not
preferences.

- **Expo Go only, no dev build.** `react-native-maps` was tried and hung Android
  at startup. Maps are **Leaflet inside `react-native-webview`**.
- **No push notifications, no websockets.** Everything refreshes by polling
  (`frontend/src/hooks/usePolling.js`).
- **No background location.** Tracking works only while the app is foregrounded.
  The UI says "last seen 3 min ago" and dims the marker rather than faking a
  position. **Never interpolate or animate a position between pings.**
- **The app never moves money.** It *records* settlements; it does not transfer
  funds. There is no payment rail and no escrow.
- **The app does not adjudicate disputes.** It records what was claimed, with
  evidence, and what the parties agreed. A human decides.

### The honesty doctrine — the most important thing here

This codebase consistently refuses to invent a number or overstate a claim. It
would rather show nothing, or refuse, than mislead a farmer. Examples that are
already load-bearing:

- A price model **refuses** per commodity when it cannot beat a naive baseline.
- A photo model **refuses** produce types with too little training data, even
  ones that score well.
- Storage vacancy is shown only where the source actually publishes it; where it
  doesn't, the field is `null` and says so — never `0`.
- A negative pooling saving, or a hold that loses money, is **reported
  negative**, never clamped to zero.
- Grades are **self-declared** and every surface keeps saying so.
- `null` renders as an em dash, never as `0` — "unknown" is not "free".

When you are unsure, choose the option that admits what the app does not know.

### Coding conventions that are enforced

- **Every state transition is a guarded `findOneAndUpdate` with the expected
  status in the query filter** — never `if (doc.status === x) { save() }`.
- **Never trust client identity.** `req.firebaseUid` comes from a verified
  token; take names, prices and quantities from the server, never the body.
- **Hooks must sit above any early return** in React components. This bug class
  has broken screens here repeatedly. State it by line number when you verify.
- **`$ne` matches missing fields in MongoDB.** Use `$in` with an explicit list.
- Visual language for marketplace screens: bg `#F8FAFC`, cards `#fff` radius 18
  padding 16 border `#F1F5F9`, primary green `#16A34A`, dark `#15803D`, tint
  `#DCFCE7`, text `#111827`/`#6B7280`/`#9CA3AF`, `Ionicons`,
  `ActivityIndicator color="#16A34A"`. The old `#c8d94d` palette is for Auth,
  Profile and navigator headers only.
- **i18n:** farmer-facing screens are English **and Marathi**; buyer and captain
  screens are **English only** (a deliberate product decision — a trader deals
  in English forms daily; a smallholder does not). `frontend/src/i18n/strings.js`
  must keep `en` and `mr` key counts equal. Flag any Marathi you are not certain
  of with `// ⚠️ REVIEW NEEDED`, matching the existing convention. **Never guess
  a mandi trade term** — a near-miss reads worse to a Maharashtra farmer than
  plain English would.

### Testing discipline

Tests live in `backend/scripts/test*.js` and **run against the live Atlas
database**. They namespace their data with a prefix (e.g. `PH#TEST_`) and delete
it in a `finally` block.

- **Clean up every collection you create documents in.** A suite that leaves
  a `Consignment` behind holding `isActiveJob` will block the *next* run's agent
  from accepting anything, and it surfaces as thirty cascading failures in a
  suite whose own code never changed. This has already happened once.
- A run reporting `0 passed, 1 failed` threw before its first assertion — that
  is almost always a transient Atlas drop. **Re-run before investigating.**
- Current green baselines: testFpos **337**, testConsignments **196**,
  testOrders **88**, testTracking **72**, testStorage **62**, testFpoDashboard
  **46**, testFarmMarket **51**, testRequirements **42**, testFpoRegistry **38**,
  testDispatch **29**, testMarketIntel **59**, testOffers **56**, testDisputes
  **34**, testMandiSales **78**. **Do not regress any of these.**

---

## 3. What already exists — the workflows your work plugs into

### 3.1 The FPO registry and membership

- `FpoMaster` holds **213 real Maharashtra FPOs** imported from the official
  **SFAC** (Small Farmers' Agri-Business Consortium) registry — real names,
  registration numbers, districts, blocks, and the CBBO that promoted each one.
  These are **real companies**; treat their identity as real data.
- A person **claims** an FPO from the registry, stating a designation
  (`CEO | Manager | Director | Authorized Representative`). A human reviews it by
  running `backend/scripts/reviewFpoClaims.js` — deliberately a terminal script,
  not an in-app admin panel, matching how buyer GSTIN verification already works.
- Approval creates a real `Fpo` document with the claimant as `adminUid`.
- Farmers **request to join**; the member sits at `status: 'pending'` until the
  FPO admin approves. Pending members are excluded from every aggregation.
- **Demo data:** 10 FPOs are claimed and operational, with **85 real working
  accounts** (10 admins + 75 farmer members), password `FarmerApp2026!`. Seeded
  by `scripts/seedFpoDemoData.js`, listings by `scripts/seedFpoListings.js`,
  buyer requirements by `scripts/seedBuyerRequirements.js`. All demo records are
  labelled `dataSource: 'demo_illustrative'` because they attach synthetic people
  to **real named companies** — that labelling must never be removed.

### 3.2 How an FPO sells — the model that was chosen

Two real FPO models exist in India. This app deliberately implements the
**marketing-on-behalf** model, **not** procurement-with-inventory:

> Produce stays with the farmer until it is sold. The FPO markets members'
> produce collectively, and when a buyer commits, **one vehicle collects from
> several member farms** and delivers to the buyer.

This was chosen because it needs **no physical infrastructure the app cannot
verify** — no collection centre, no FPO warehouse, no external institution
adopting anything.

**Do not add FPO-held inventory or a collection centre.** It was considered and
rejected for that reason.

### 3.3 The buyer's purchase flow (already built, working)

1. **Catalog** — `GET /api/fpos/bundles` returns lots keyed by
   **(FPO, crop, grade)**. Grades are **never blended**: a buyer paying for
   Grade A must not receive a mix. Produce nobody graded gets its own
   **"Grade not declared"** bucket — never a fourth tier, never sorted below C.
2. **Quote** — `POST /api/fpos/lots/quote`. Two-step by necessity: each farmer
   sets their own ₹/kg, so the real total depends on *which* farmers the
   allocation draws from. The quote shows the exact allocation and total, and
   states it is **not a reservation**.
3. **Confirm** — `POST /api/fpos/lots/confirm`. Re-derives everything
   server-side (a client-supplied allocation is ignored), takes stock atomically,
   and creates **N Orders + 1 Consignment**. `Order` is deliberately per-farmer
   because settlement, disputes and receipts all hang off it.
4. **Collection** — a Consignment is one vehicle visiting ≤5 farms (a hard cap
   with a stated reason), with an OTP per farm and a by-weight fare split.
5. **Settlement** — recorded, never moved.

Allocation respects each member's own `minOrderKg`, so some quantities are
genuinely infeasible; the API returns the nearest workable quantities instead of
silently rounding.

### 3.4 Transport modes and who drives

`Consignment.transportMode` is one of:
- **`hired`** — dispatched to the public captain pool.
- **`own`** — the FPO's own vehicle, driven by an **FPO employee** who has a real
  account link (`transport.driverUid`) and gets the same stop list, OTP entry and
  location posting as a captain, without ever entering the public pool.
- **`contracted`** — a transporter the FPO regularly uses.

On `own`/`contracted` runs the FPO admin can also record from the office as a
fallback (a paper trip sheet), and the record always says which of the two
recorded it.

### 3.5 The gate record (recently built — central to your work)

At each pickup the recorder captures:

- **Weight provenance** — `collection_centre_scale | public_weighbridge |
  farm_scale | estimated`. `estimated` ("not weighed — bags counted, or judged by
  eye") is a **first-class honest answer**, presented no differently from the
  others. What is refused is *silence*, because an empty box lets a guess be read
  as a measurement. Only `public_weighbridge` is reported as independent.
- **Observed grade** — defaults to what the farmer declared. A difference is
  **recorded only**: it changes no price and no payout.
- **The farmer's answer** — a lower grade is a **claim**, not a fact. The farmer
  accepts or contests it, and **only a concession counts as evidence** elsewhere
  (it feeds `services/trustService.js`). This mirrors the app's existing rule that
  a complaint raised is not a complaint upheld. The answer is not re-openable.

### 3.6 Payment reliability (already built)

`services/trustService.js` scores buyers and farmers from real recorded history —
settlement dates, disputes, conceded complaints. It **refuses to band anyone
below a minimum number of trades** and returns counts instead. Do not weaken
that refusal.

### 3.7 Other things that already exist

- **AI models that ship: D1** price forecast (LightGBM, 1–14 day),
  **D2** sell/hold classifier, **D3** produce freshness from a photo. A fourth
  (D5, yield) **does not ship** — its input data stops in 2017 — and a historical
  yield *benchmark* service ships in its place. Do not describe D5 as shipping.
- **Storage** — 202 real MSWC warehouses. Coordinates are approximated (many
  share a district centroid), which is now surfaced as structured
  `locationPrecision` rather than shown as precise distances.
- **Grading specs** — `backend/data/gradeSpecs.js` holds real AGMARK gazette
  criteria for **13 commodities**.
- **Fertilizer** — `backend/data/fertilizerRules.js` gives N:P:K per crop, with
  provenance per entry (`mh-verified` / `icar-general` / `tnau-legacy`) and a
  farmer-facing caveat graded by that provenance.

---

## 4. How to work through this — read before starting

**Work one task at a time, in the order given. Do not start a task until the
previous one is finished and verified.**

This is not tidiness, it is survival. Each comparable chunk of work on this
project has cost roughly 200,000–400,000 tokens. Attempting several at once will
hit a session limit **mid-edit** — which has already happened three times here,
each time leaving half-written test files that then had to be diagnosed and
repaired before anything could move.

For **each** task, in this order:

1. **Say what you are about to do and why**, in a few lines, before writing code.
   If a task hides a real product decision, name it and pick the most defensible
   option rather than stalling — but write down what you chose and why.
2. **Read the actual code first** — the route handler, the model, the existing
   screen. Do not build against an assumed response shape.
3. **Build it.**
4. **Verify it yourself** — run the affected test suites against live Atlas and
   report the real numbers; parse-check every touched frontend file; confirm the
   feature is reachable from the UI.
5. **Report** what changed, what you decided, and the real pass/fail counts.
   Then stop and start the next task cleanly.

**If a session ends mid-task**, the next one should first check what actually
landed on disk before assuming anything — implementation is often further along
than the last message suggests, and the usual leftover is an incomplete test file
rather than broken source.

**Do not report a task as done if any part of it is unreachable from the UI, or
if you did not personally run the tests you are citing.**

---

## 5. What I want you to build

Work in this order. Verify as you go; do not batch everything to the end.

### TASK 1 — Make the FPO its own actor (currently wrong)

**The problem:** an FPO admin is today a **farmer account** that claimed an FPO.
That is backwards. A real FPO's CEO or Manager is an appointed officer of a
company and often does not farm at all. Farmers should not be turned into FPO
staff by tapping a button.

**Build:** a proper FPO actor.
- Add an FPO admin role and give it **its own registration path** — at signup a
  person chooses what they are (farmer / buyer / captain / FPO), and an FPO
  registrant then claims their organisation from the SFAC registry.
- Keep it **additive and backward-compatible**: `User.role` is currently
  `['farmer','vendor','agent']` and is referenced in hundreds of places,
  including partial unique indexes and guarded query filters. Existing
  farmer-accounts that already admin an FPO must keep working. Do not migrate
  live data.
- An FPO admin's landing screen is already the FPO dashboard, with deliberately
  **no route back into the farmer dashboard** — keep that.

### TASK 2 — FPO focus crops

**The problem:** FPOs specialise. An onion FPO in Nashik does not deal in
sugarcane. Nothing models this, so any farmer can join any group with any crop.

**Build:** let a claimed FPO **declare its focus crops** (the SFAC registry does
not carry crop data, so the FPO states it). Then use it: match membership
requests against it, and surface a mismatch honestly rather than blocking
silently. Keep it advisory rather than a hard refusal — a farmer growing
something adjacent is a conversation, not an error.

### TASK 3 — Grading, settled correctly

This was worked through carefully. **Implement exactly this split:**

- **FPO sales** → graded at the gate by an **FPO employee** who knows produce
  (the FPO's own driver on an `own`/`contracted` run, or an accompanying
  grader). This is a genuine advantage of aggregating, and it is honest.
- **`hired` runs (public captain)** → **no grading**. A captain is a truck
  driver, not a grader. Asking them to put a letter on someone's crop is asking
  them to certify something they are not qualified to judge. Say so rather than
  pretending the check exists.
- **Individual farmer → buyer sales** → the grade stays **self-declared and
  clearly labelled unchecked**. A captain may record **visible condition only** —
  is it the crop that was ordered, is it visibly rotten/sprouting/wet, is the
  quantity obviously short. **Never a grade letter.**
- **The buyer judges quality on arrival** and raises a grievance if it does not
  match — which is what actually happens in this trade, and the grievance flow
  already exists.

**Note a real gap:** `Order.pickupOutcome` already has the weight and grade
fields, and the buyer's receipt and purchase views already *read and display*
them — but `POST /api/orders/:id/pickup` (the single-farmer pickup) never writes
them. Wire the **visible-condition** half of it there.

**Do not chase more AGMARK volumes.** 13 real gazette specs already ship, which
is better than most apps in this space. More PDFs would improve the criteria
*text*; they would not fix the trust problem. The gate record does.

### TASK 4 — Fertilizer: mine what is already on disk

**Do not look for new sources on the internet — the accessible ones are
exhausted.** But you are not out of data.

Three editions of **Krishi Darshani** (MPKV Rahuri's annual farmer handbook) are
already OCR'd to plain text on disk at
`backend/data/sources_fertilizer_krishi_darshani/work/full2024|full2025|full2026`
— **1,582 pages of Marathi text.**

18 crops in `fertilizerRules.js` still carry unverified doses. Nine of them have
candidate pages in that OCR already:

```
Ginger 15 pages · Sunflower 6 · Potato 4 · Brinjal 4 · Turmeric 4
Tomato 3 · Garlic 3 · Sesamum 2 · Mango 1
```

**Mine those nine.** Grep for the crop's Marathi name together with a dose
sentence (`किलो नत्र` = "kg nitrogen"), read the surrounding paragraph, and
cross-check the figure across the three editions where possible. **Marathi OCR
mangles digits** — every number must be read in context and sanity-checked
against similar crops, never lifted from a regex match. Record each figure with
its citation in `MH_SOURCES` exactly as existing entries do, including any figure
you find and deliberately reject, with the reason.

**The other nine crops stay on the generic/category fallback.** That is a
decision, not a gap. Grapes, Orange, Mosambi and Cauliflower are genuinely absent
from this source.

**Strategy for what remains unverified:** without a soil test, **zone-level is
the correct ceiling anyway** — a printed handbook gives a farmer a figure for
their agro-zone and soil type, not a farm-specific dose. The app already has
district → agro-zone (9 real Maharashtra zones) and the farmer's declared soil
type, so it is at parity with the best thing available to that farmer offline.
Keep the graded provenance caveat.

**Optional, low priority:** Soil Health Card input as a *bonus* path. Most
farmers either do not have one, do not know they have one, or cannot interpret
it — so it must never be required, never gate anything, and never be treated as
an error when absent. If built, consider letting them photograph the card rather
than type values.

### TASK 5 — Payment: advance plus balance

**The problem today:** the farmer hands over produce against a *record* of a
promise. They are extending credit to a stranger.

Simply flipping to "buyer pays before delivery" does not fix it — it moves the
whole risk onto the buyer, who has then paid for produce they have not seen, on
a grade nobody checked. That needs escrow, which needs a payment rail this app
deliberately does not have.

**Build instead: an advance plus balance**, which is how this trade already
works. The buyer commits an advance at confirm; the balance settles after
delivery. Both are **recorded, not moved** — same rule as every other money
figure in this app. Make clearly visible who is exposed for what at each stage.

### TASK 6 — Disputes: evidence, not arbitration

Do **not** build a customer-care team that decides who is right — that is
adjudication, which this app has consistently refused, and it is a staffing
commitment rather than a feature.

**Build instead:** make a human's job easy. The app already stores who observed
what, when, with what weight provenance, and whether the farmer conceded. Surface
that as a clean evidence trail for whoever does arbitrate — the FPO, the buyer,
or an APMC officer.

### TASK 7 — FPO dashboard depth and ML

- **Drill-down:** the dashboard shows aggregate produce by crop and grade but
  nothing beneath it. Let an admin open a crop/grade and see contributing
  members, quantities, prices and history.
- **ML:** "estimated incoming" is currently a *lookup* against historical
  district yields, not a model. If you add a real model here, it must obey the
  same rule every other model in this app obeys: **measure it against an honest
  baseline, and refuse to serve where it does not beat that baseline.** Never
  quote an accuracy figure without the naive baseline beside it. If you cannot
  beat the lookup, say so and keep the lookup.

### TASK 8 — Marathi review

`frontend/src/i18n/strings.js` carries **205 strings flagged
`// ⚠️ REVIEW NEEDED`**, all containing mandi or trade vocabulary where a
near-miss genuinely misleads (वजन काटा weighbridge, प्रत grade, आडत commission,
हमाली loading labour, तारण कर्ज pledge loan, आवक arrivals, फेरी collection run,
वाटणी revenue split, and others). These are flagged rather than guessed on
purpose. **Do not mass-approve them.** They need a native Marathi speaker; the
project owner will do this.

---

## 6. Known structural limits — state them, do not paper over them

These are honest limitations. Where you touch a surface that exposes one, say it
plainly rather than hiding it:

- **No payment rail** — money is recorded, never moved.
- **Rejection at delivery has no physical answer** — who pays return freight, and
  whose produce is rejected when five farmers' lots are commingled on one truck.
- **Nothing models produce degrading** between listing and delivery, though the
  cycle is 24h+.
- **No advance/credit relationship with input financiers** — many farmers are
  already bound to whoever financed their seed and fertilizer, so the free choice
  at harvest that this app assumes often is not there.
- **FPO membership is legally shareholding** in a Producer Company, with a board
  resolution. An in-app approve button does not create legal membership.
- **Foreground-only tracking and no push notifications** — a captain must have
  the app open to receive a job, and location stops the moment the phone is
  pocketed.

---

## 7. Do not re-decide these

Each was worked through and settled. Reopening them wastes your effort:

1. FPO uses the **marketing-on-behalf** model. No FPO-held inventory, no
   collection centre, no warehouse in the transaction path.
2. Storage is **advisory only** — it answers "should I hold this crop", never
   "where must I deliver it". MSWC has no live vacancy feed and 202 warehouse
   managers will not adopt this app.
3. Grades are never blended. Ungraded is its own bucket, not a fourth tier.
4. A grade discrepancy **never** reprices anything automatically.
5. Claim review is a **terminal script**, not an in-app admin panel.
6. `Order` stays **per-farmer**. One bulk purchase is N Orders + 1 Consignment.
7. The ≤5-stop cap on a collection run stays, with its stated reason.
8. Buyer and captain screens stay **English only**.
9. D5 (yield model) **does not ship**. Three models ship, not four.
10. The app **does not adjudicate**.

---

## 8. How to verify your work

- Backend: run the affected `backend/scripts/test*.js` suites **against live
  Atlas** and report real pass/fail counts. Do not claim a pass you did not run.
  Extend existing suites rather than creating parallel ones, and clean up in
  `finally`.
- Frontend: every touched file must parse —
  `node -e "require('@babel/core').transformFileSync('<file>', {presets:['babel-preset-expo']})"`
  from `frontend/`. State by line number that hooks sit above the first early
  return. Confirm `strings.js` `en`/`mr` counts still match. Confirm every
  `navigation.navigate('X')` target is registered in the relevant navigator — an
  unregistered route was a real defect found here before.
- When something you built is unreachable from the UI, it is **not done**. This
  project has shipped that bug before: features marked complete because the route
  file existed, while nothing in the app ever called them.

---

## 9. Working style that fits this codebase

- **Verify before you claim.** Read the actual route handler rather than assuming
  a response shape.
- **When a test fails, find out why before "fixing" it.** A recent failure that
  looked like a missing authorisation check turned out to be a wrong test
  fixture — the route was correct, and "fixing" it would have broken working
  authorisation.
- **Write down the reasoning** for any judgement call, in a comment next to the
  code. That is why `CLAUDE.md` and the inline comments in this repo are as long
  as they are, and it is why the project has been able to change hands.

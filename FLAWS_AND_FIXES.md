# Flaws, workflow gaps, and what to do about them

Everything marked **VERIFIED** was checked against the code, not assumed.
Everything marked **JUDGEMENT** is a design opinion about real-world fit.

---

## A. Delivery to the buyer — **FIXED** (was the biggest hole)

### A1. A buyer cannot track an FPO run at all — **FIXED**
*(This heading and A2/A3 below described the state before consignment tracking
was built. Verified against the code 2026-08-26: `Consignment.tracking` exists,
`GET /api/consignments/:id/track` serves the same keys as the order-level track,
and `TrackRun` is registered in the vendor, farmer and FPO stacks — reached from
`VendorOrdersScreen` and `FpoRunScreen`.)*
`TrackOrderScreen.jsx` has **zero** references to consignments. Live tracking
exists only on `Order` (`GET/POST /api/orders/:id/location`, `/:id/track`,
`Order.tracking`). `Consignment` has **no tracking fields and no location
endpoint**.

So a buyer who purchases a 2-tonne FPO lot — the biggest purchase the app
supports — gets **less** visibility than someone buying 50 kg from one farmer.
No map, no ETA, no "where is my truck".

### A2. The captain has nowhere to post location on a run — **FIXED**
*(`POST /api/consignments/:id/location` exists. `resolvePositionActor()` admits
the assigned captain and the FPO's own driver, and turns the OFFICE away by name:
a coordinate typed at a desk is invented, not observed.)*
Location is posted to `/api/orders/:id/location`, but a consignment spans N
orders. There is no correct id to post to. Even if the UI existed, the API
doesn't.

### A3. Nobody sees the delivery leg — **FIXED**
*(`in_transit` is a real status and the run flips itself into it when the last
farm is recorded and something is aboard — guarded, with `NO_PENDING_STOPS_FILTER`
in the query filter.)*
`Consignment` statuses run `awaiting_agent → accepted → collecting → delivered`.
There is no `in_transit` / `out_for_delivery` state between the last farm and
the buyer's gate. The longest, most anxious part of the journey is invisible to
everyone — buyer, FPO and farmer alike.

**Fix:** add tracking to `Consignment` (mirroring `Order.tracking`), a
`POST /api/consignments/:id/location`, a transit status, and a map view shared
by the buyer and the FPO. This is the single most visible gap in the product.

---

## B. The FPO's own driver has no way into the app — **FIXED**

*(Verified against the code 2026-08-26. `POST/DELETE /api/consignments/:id/driver`
assigns a real account; `resolveRunActor()` returns `fpo_driver` for them, they
get the stop list, the OTP field and position posting, and they never enter the
public captain pool. `FPO_DRIVER_ROLES` is `['farmer','agent']` — an `fpo`
office account is refused, because a coordinate posted from a desk is invented
rather than observed. The admin keeps the office-side fallback and
`outcomeByRole` records which of the two was used. B1/B2/B3 below describe the
state BEFORE that landed.)*

Phase B gave a run a `transportMode`: `hired` dispatches to the captain pool;
`own` and `contracted` do not. On those runs `agentUid` is null and the **FPO
admin records every stop from the office**.

That means the person actually at the farm gate — the FPO's own driver — has no
login, no screen, no map, and no way to record anything. Consequences:

- **B1.** The record says "collected at farm 3", keyed by someone who wasn't
  there. It's a paper trip sheet, which is honest, but it is not evidence.
- **B2.** The farmer's pickup OTP is still required (correct — the admin isn't a
  skeleton key), so the driver must **read the OTP over the phone** to the
  office. A code spoken down a phone line is much weaker than one typed at the
  gate, and it adds a call per farm.
- **B3.** No location can be captured on an `own` run at all, so B/A1 above is
  permanently unsolvable for exactly the FPOs that run their own vehicles.

**Fix:** let an FPO assign a **driver account** to a run. `Consignment.transport`
already carries `driverName`/`driverPhone` — promote that to a real user link so
the driver gets the same stop list, OTP entry and location posting a captain
gets, without joining the public captain pool. The FPO admin keeps the
office-side fallback for when the driver has no phone.

---

## C. The buyer's post-purchase experience — **FIXED**

### C1. One purchase looks like N unrelated orders — **FIXED**
*(`VendorOrdersScreen` now groups by `consignmentId` and renders one purchase row
per run instead of N loose orders.)*
`LotOrderScreen` sends the buyer to `VendorOrders` after confirming. That screen
references `consignmentId` only to *exclude* pooled orders from its
"poolable" list — it never groups them. So buying one 2-tonne lot from 5 farmers
shows as **5 separate order rows** with no indication they were one purchase,
one price, one truck.

### C2. There is no "my FPO purchases" view anywhere. — **FIXED**
*(`GET /api/consignments/vendor/purchases`, rendered on `VendorOrdersScreen`.)*
Nothing shows the lot, the allocation, the run, and the total as the single
transaction the buyer actually made.

**Fix:** group orders by `consignmentId` in the buyer's order list, and give the
bulk purchase its own detail view — the lot, its contributing farmers, the run
status, the total.

---

## D. Driver / captain logic flaws

### D1. A captain can hold an active order AND an active consignment — **FIXED**
~~`isActiveJob` has a partial unique index on `Order` *and* a separate one on
`Consignment`. They are different collections, so the constraint does not span
them. One driver, one vehicle, two simultaneous jobs — physically impossible.~~

`services/agentJobService.js` enforces the missing half in the application at
both accept points (`routes/orders.js` and `routes/consignments.js`). Both
indexes stay — they still decide ties inside their own collection. The pattern
is **check → claim → re-check**, which is provably safe against the cross-
collection race, and a rejected claim is the failure it is tuned to prefer.
Both captain feeds now also hide work across both collections, and a pooled
order can no longer be claimed as a single pickup. Tested in
`testOrders.js` §9b and `testConsignments.js` §11.

### D2. There is no way to abandon or reassign a run — **FIXED**
~~No cancel, no abandon, no reassign, no timeout. Once a captain accepts, the
only exits are delivering or the all-stops-failed close.~~

Two routes, because they are two different situations:

* **`POST /api/consignments/:id/release`** — nothing collected, so nothing to
  undo. The run goes back to the pool with a fresh dispatch window, the captain
  is freed, every order returns to `awaiting_agent`. Guarded on no stop having
  an outcome, *as a query filter*.
* **`POST /api/consignments/:id/abandon`** — produce already aboard, so it
  cannot be reassigned. Uncollected stops are cancelled and restocked by
  calling Phase A's own `not_collected` code; already-collected stops become
  **`Order.status: 'stranded'`** — not delivered, not cancelled, and the farmer
  is still owed every rupee. The run ends `abandoned`, distinct from
  `cancelled`, naming both halves by order id.

The assigned captain, the buyer who booked the run, and the FPO admin whose
group it belongs to may call either — a vanished captain can call nothing. A
six-hour **stale-run sweep** releases (never abandons) runs with no gate
recorded. Tested in `testConsignments.js` §9, §10 and §12.

### D3. Foreground-only location, on a multi-hour run — **VERIFIED (documented)**
Known and honestly surfaced ("last seen 3 min ago"). But a 5-farm run takes
hours, and the phone is in a pocket for most of it. The limitation is far more
damaging for consignments than for the single-order case it was accepted for.

### D4. No push notifications, but a 5-minute dispatch window — **VERIFIED (documented)**
A captain must have the app **open** to receive a job. While driving, they
cannot. The window expires and the run reports `no_agents`, which looks like
"nobody wants this" when it actually means "nobody was staring at a screen".

### D5. Short pickups are unverifiable — **PARTLY ANSWERED**
The captain types the kilograms actually collected. No scale, no photo, no
counter-signature. That number directly reduces what a farmer is paid.

The gate record does not make the number verifiable — nothing in software can —
but it now says **where the number came from** (`weight.method`, with
`public_weighbridge` the only value reported as independent) and **what the lot
looked like** (`condition`). A short pickup recorded as `estimated` no longer
reads the same as one weighed on a ticket. The farmer's remedy is still a
grievance, and the record it is argued over is now considerably better.

---

## E. Real-world fit (from the earlier audit)

- **E1.** Perishables are not bought sight-unseen at a fixed price. The bulk flow
  has no inspection or negotiation step at all — quote, confirm, done.
- **E2.** ~~Weight is asserted twice and measured never.~~ **The gate record
  answers this and it now reaches EVERY pickup.** `weightMethod` was already
  required on a multi-farm run; `POST /api/orders/:id/pickup` — the
  single-farmer pickup, the commonest kind — recorded only the OTP, so its
  receipts printed a bare quantity with "Not recorded" beside it. It now
  requires the method and records the provenance, and `shared/ReceiptScreen`
  finally renders it. The app still does not weigh anything; it records how the
  figure was established, and refuses silence. Tested in `testOrders.js` §14
  (88 → 107).
- **E3.** ~~Grade is self-declared and unchecked, yet Grade A now carries a price
  premium.~~ **SETTLED BY SPLITTING IT, not by adding a check nobody can make.**
  An FPO's own driver/office may grade at the gate — they handle this crop
  every season and the group's name is on the sale. A **hired captain may not**,
  and gets a stated refusal (409 `GRADING_NOT_AVAILABLE`): a truck driver is
  not a grader, and the app now says so rather than pretending the check exists.
  The default-to-declared was switched off with it, so a hired run records
  SILENCE rather than a "match" nobody confirmed. What a captain *can* record
  is visible **condition** (wrong crop / rotten / sprouting / wet / damaged /
  packaging), which is a different kind of statement and moves no money. The
  buyer judges the lot on arrival and the grievance flow settles it. Tested in
  `testConsignments.js` §14 + §14b (196 → 214).
- **E4.** No payment rail — **still true, and still stated**. But the farmer no
  longer necessarily hands over produce against a record of a *whole* promise:
  an **advance plus balance** now exists (`Order.settlement.advance`,
  `POST /api/orders/:id/settle-advance`, `services/paymentExposureService.js`).
  The buyer agrees a percentage at commitment; the farmer confirms receipt; the
  balance settles after delivery. **Nothing is moved, held or verified** — this
  splits the exposure rather than removing it, and `exposure` names who is
  carrying what at every stage, including the in-transit window where BOTH are.
  Paying the whole lot up front was rejected: it moves all the risk onto the
  buyer and needs escrow, which needs the payment rail this app does not have.
  Tested in `testOrders.js` §15 (107 → 134) and `testFpos.js` §13g2 (364 → 376).
- **E5.** Rejection at delivery has no physical answer — who pays return freight,
  whose produce is rejected when five farmers' lots are commingled.
- **E6.** Nothing degrades between listing and delivery, though the cycle is 24h+.
- **E7.** No relationship with INPUT FINANCIERS — **still absent, and distinct
  from the buyer advance built in E4 above.** Many farmers are already bound to
  whoever financed their seed and fertilizer, and that debt is settled at
  harvest before anyone else gets paid. So the free choice at harvest that this
  app assumes often is not there, and a buyer advance does not change it — the
  money may be spoken for before it arrives. Nothing models this and nothing
  should pretend to: the app has no way to see that obligation.
- **E8.** FPO membership is shareholding in a Producer Company, not an in-app
  approve button.

---

## F. Also outstanding, from earlier

- **F1.** ~~Pending join is invisible — `fpoOf()` ignores member status, so an
  unapproved applicant is shown as a member.~~ **FIXED.** Split into
  `activeMembershipOf()` ("which group am I IN" — approved rows only, used by
  `/mine`) and `commitmentOf()` ("am I committed anywhere" — pending included,
  used by create and join, deliberately, so nobody can have requests out to five
  groups). `/mine` returns `fpo: null` with `membershipStatus: 'pending'` and a
  `pendingRequest` block. Tested in `testFpos.js` §2b.
- **F2.** ~~6 of 15 Nashik warehouses share one coordinate, so they show identical
  distances and identical costs.~~ **FIXED — by honesty, not by inventing
  coordinates.** Seven Nashik records share the district centroid (213 active
  warehouses occupy only 90 distinct points). `Warehouse.locationPrecision` is
  now structured data; an approximated record reports `distanceKm: null` plus a
  coarse `approxDistanceKm`, and records sharing an approximated point are
  returned as one labelled **group** rather than N separately-ranked rows.
  CLAUDE.md's "good enough to rank nearest" claim was wrong and has been
  corrected. Tested in `testStorage.js` §2b.
- **F3.** ~~Only 1 Requirement exists in the database, so buyer demand is always
  empty.~~ **FIXED.** 11 open requirements in Atlas as of 2026-08-26, seeded by
  `scripts/seedBuyerRequirements.js`.
- **F4.** ~~FPO admins are farmer accounts claiming an FPO — wrong actor model.~~
  **FIXED.** `User.role` gained a fourth value, `fpo`, with its own registration
  path and its own navigator. Additive: authorisation was always
  `fpo.adminUid === uid` and never the role, so only the outer `requireRole()`
  gates changed and every legacy farmer-admin keeps working. An `fpo`-claimed
  group starts with **zero members** — an officer of a producer company is not a
  member-farmer — which forced `/:id/leave` to stop closing a group at one
  member, or the last farmer walking out would have closed a real registered
  company. New `GET /api/fpos/admin/mine` answers "which FPO do I administer"
  for both admin shapes and names the pre-approval states. Tested in
  `testFpoRegistry.js` §7 (38 → 72) and `testTracking.js` §11 (72 → 80).
- **F5.** ~~FPOs specialise by crop; nothing models it, so any farmer can join any
  group with any produce.~~ **FIXED, advisory by design.** `Fpo.focusCrops` is
  declared by the group (the SFAC registry carries no crop data). It is surfaced
  to the farmer on the nearby-group card *before* they ask, and to the admin on
  every pending row — where the decision is actually made. **It blocks nothing:**
  `POST /:id/join` computes the match after recording the request, and an
  off-focus member's lot is still sold normally. Not-declared and
  no-crops-registered are their own statuses and are never reported as a
  mismatch. Tested in `testFpos.js` §14 (337 → 364).
- **F6.** ~~No ML anywhere in the FPO flow; "estimated incoming" is a lookup.~~
  **MEASURED, AND THE LOOKUP STAYS.** `scripts/measureIncomingModel.js` builds
  every training row this database can produce (79, across 10 crops) and
  compares candidate models against the shipped lookup on a held-out split.
  The finding is not "the model loses" but **"no verdict is possible"**: the
  ICRISAT lookup can price only **9 of 79** planted crops, because it covers 25
  of 36 districts and excludes cotton and sugarcane outright. On top of that,
  every row's provenance is unknown (the FPO seeder writes listings with no
  `dataSource`), and a harvest *listing* is not a harvest. No model ships.
  What the measurement did produce is `producesAggregation.coverage` — the
  dashboard now says how much of the group the forecast actually covers, and
  calls it a floor rather than a total. **Drill-down done too:**
  `GET /api/fpos/:id/lot` opens one lot to its contributing members, their
  asking prices and their real delivery history. Tested in
  `testFpoDashboard.js` §7–8 (46 → 63).

---

## Suggested order of work

**Tier 1 — correctness. Things that are broken, not missing. — ALL FOUR DONE.**
1. ~~**D2** run abandonment/reassign — produce can be stranded permanently~~ ✅
2. ~~**F1** pending-join visibility — one-line cause, breaks the whole approval model~~ ✅
3. ~~**D1** shared active-job constraint across Order and Consignment~~ ✅
4. ~~**F2** stop showing six identical fake-precise distances~~ ✅

Tier 1 is backend-only. **No frontend screen calls `/release` or `/abandon`
yet**, and nothing renders `approximateGroups` or `membershipStatus: 'pending'`
— those are the follow-ups, and Tier 2 below is still the visible hole.

**Tier 2 — the delivery product. ALL THREE DONE.**
5. ~~**A1–A3** consignment tracking, transit state, shared buyer/FPO map~~ ✅
6. ~~**B** driver accounts for FPO-owned and contracted runs~~ ✅
7. ~~**C1–C2** group the buyer's bulk purchase instead of N loose rows~~ ✅

**Disputes — evidence, not arbitration. DONE.**
`GET /api/disputes/:id/evidence(.txt)` assembles the farm-gate record, the
weight provenance, the condition, the grade claim and whether it was conceded,
the advance/balance, both parties' trust records and a chronology — **plus what
was never recorded at all**, which is usually what decides a quantity dispute.
It contains no verdict and no fault score, by design and by assertion. The
`.txt` form leaves through the share sheet for an APMC officer or the group
secretary, who have no account here. Tested in `testDisputes.js` §9 (34 → 59).

**Tier 3 — makes it real rather than a demo.**
8. ~~**F3** seed real buyer requirements~~ ✅ 11 open requirements
9. **E1** inspection before commitment — **STILL OPEN**, see E1 above.
   ~~**E3** FPO as grader~~ ✅ settled by splitting it; a hired captain is not asked.
10. ~~**E2** record who weighed and where~~ ✅ on every pickup, single-farmer included
11. ~~**F4/F5** FPO as its own actor, with declared focus crops~~ ✅

**Tier 4 — depth.**
12. ~~**F6** ML in the FPO flow, dashboard drill-down~~ ✅ drill-down built; ML
    measured and refused, with the measurement kept as a re-runnable script.
13. **E4–E8** the honest limits — E4 now has an advance/balance and E5–E8 remain
    stated rather than solved, which is the right outcome for all four.

**Marathi review — done as far as evidence allows, and marked honestly.**
255 strings now carry `// mr-checked`: the trade TERMS were corroborated against
1,582 pages of real MPKV Marathi (Krishi Darshani), but no native speaker has
read the sentences. `mr-native` is the marker for when one has.
`frontend/scripts/marathiReview.js` is a **read-only** worksheet that prints
each one beside its English source (`--csv` for a spreadsheet). It also shows
that the job is smaller than it looks: **प्रत (grade) accounts for 67 of the
flags and फेरी (collection run) for 50**, so two term decisions settle nearly
half of them.

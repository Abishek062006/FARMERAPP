# FARMERAPP → Maharashtra · Complete Build Plan

**Target:** SIH problem statement **26132** — Strengthening market linkages and price discovery for farmers
**Organisation:** Maharashtra State Innovation Society, Govt. of Maharashtra
**Repo:** `/Users/rsabishek/Desktop/farmerapp/FARMERAPP`

This document is written to be handed to a fresh session. It carries the codebase facts, the datasets, the regional conversion and every build phase in order.

---

## 0. Context for a new session

**Stack:** React Native (Expo SDK 54, **Expo Go only** — no dev build) + Node/Express 5 + MongoDB Atlas (replica set, so transactions work) + Mongoose 9. A Python/Flask AI service in `ai-service/`.

**Hard constraints, already discovered the hard way:**
- **No native maps.** `react-native-maps` hung Android at startup in Expo Go. Maps are Leaflet 1.9.4 in a `react-native-webview`.
- **No push notifications, no sockets.** Dispatch and tracking work by polling (`usePolling` hook).
- **No background location.** Tracking runs only while the agent's app is foregrounded. The UI states this honestly rather than faking a live position.
- **Agmarknet API returns 403 to a default axios User-Agent.** It must spoof Chrome — see `services/agmarknetService.js`.

**Already built and tested — 120 backend tests passing across four suites:**

| Area | What exists |
|---|---|
| Foundations | `requireRole` middleware, `geoService` (haversine, district resolution), `usePolling`, shared Leaflet base |
| FARM Market | Harvest posting with proof photo in one transaction; proximity-ranked market; cross-district search |
| Orders & fares | OSRM road routing with cache + haversine fallback; auto/tempo/truck pricing with capacity and distance rules; atomic stock guards |
| Dispatch | Agent job feed, Rapido-style offer popup, accept/reject races, OTP handover gates |
| Live tracking | Imperative Leaflet map (no remount), position pings with out-of-order guard, route simulation for demos |

**Test suites:** `node scripts/testFarmMarket.js` · `testOrders.js` · `testDispatch.js` · `testTracking.js`
Each namespaces its data with a `PH#TEST_` prefix and deletes it in a `finally` block. **Run all four after every phase.**

**Existing AI:** one trained model — a 15-class plant disease CNN (`ai-service/models/plant_disease_model.keras`), plus a 432-line **rules-based** pesticide dosage calculator (`pesticide_engine.py` — this is *not* a model; never present it as one).

---

## 1. Datasets to download

Put every download in **`~/Downloads`**. The plan references them from there.

### 1.1 Required

| # | Dataset | Where | Used by |
|---|---|---|---|
| **D1** | **Fresh vs rotten produce images** — Kaggle, "Fruits fresh and rotten for classification" (~3 GB, apples/bananas/oranges) | kaggle.com → search the title | Model 8.3 freshness detection |
| ~~D2~~ | ~~Maharashtra agro-climatic zone table~~ — **✅ ALREADY BUILT.** No download needed. The government PDF names the nine zones but publishes no district table (it mentions only four districts, all university addresses). `backend/data/mhAgroZones.js` now carries the official zone names plus a district-level approximation, all 36 districts mapped, with renames aliased. **Verify Nashik first** — see the warning in that file | — | Replaces `data/agroZones.js` |
| **D3** | **Maharashtra state agriculture schemes** — names, eligibility, benefit, department, apply link | krishi.maharashtra.gov.in and mahadbt.maharashtra.gov.in | Replaces `data/schemesData.js` |

### 1.2 Optional — only if building the yield model (8.5)

| # | Dataset | Where |
|---|---|---|
| **D4** | District-wise crop production statistics (CSV) — **not on data.gov.in in a usable form.** Use Kaggle instead: `ankanhore545/district-wise-major-crops-production-in-india`, or `nikhilmahajan29/crop-production-statistics-india` | kaggle.com |

### 1.3 **Not** needed — do not download

| Data | Why not |
|---|---|
| Mandi price history | **Already solved.** `backend/scripts/collectPriceHistory.js` pulls it live from `api.agmarknet.gov.in` — no key, no registration, verified back to 2018 |
| Maharashtra district coordinates | Generated in Phase A2 the same way the TN table was |
| PlantVillage crop images | Already on disk in `ai-service/models/` |

> **A note on D2 and D3:** these are reference tables, not machine-learning datasets. If a clean source is hard to find, a hand-built table covering the 8–10 districts you will demo is entirely acceptable — say so in the pitch rather than implying full state coverage.

---

## 2. Phase A — Convert Tamil Nadu → Maharashtra

**1.5–2 days.** Do this **first**: every later phase writes region-aware code, and converting afterwards means touching it twice.

**43 files carry TN-specific references.** Work through them in this order.

### A1 · Agmarknet state id *(15 min — the highest-leverage single change)*
`services/agmarknetService.js:30` has `const TAMIL_NADU_STATE_ID = 31;`
Maharashtra's id is **20** (verified live against `/daily-price-arrival/filters`).

- Rename to `DEFAULT_STATE_ID` and set to 20
- Update the 4 call sites in `controllers/mandiController.js` (lines ~117, 234, 300)
- **Agmarknet is a national API** — the entire price layer works for Maharashtra with this one change

### A2 · District registry and centroids *(3 h)*
- `frontend/src/utils/tnDistricts.js` → `districts.js`, keyed by state, with Maharashtra's **36** districts
- `backend/data/tnDistrictCentroids.js` → `districtCentroids.js` with MH centroids plus secondary anchor towns for large or irregular districts (the TN table needed anchors for Sivaganga and Chengalpattu — expect the same for Nashik, Pune, Ahmednagar and the Vidarbha districts)
- Update `services/geoService.js` — 6 references to the TN table
- **Verify:** `resolveDistrict()` must return a real district for every land coordinate

> **Renamed districts — a real trap.** Aurangabad → **Chhatrapati Sambhajinagar**, Osmanabad → **Dharashiv**, Ahmednagar → **Ahilyanagar**. Agmarknet and older datasets may use either name. Add both to the alias map in `geoService.js` alongside the existing spelling variants.

### A3 · Agro-climatic zones *(4 h — the largest data replacement)*
`data/agroZones.js` is **1,139 lines** of TNAU's 7-zone classification, consumed by `cropRecommendationEngine.js`, `dailyTaskEngine.js`, `routes/ai.js` and `data/growthStageRules.js`.

- Rebuild from **D2** with Maharashtra's 9 zones
- Keep the exact export shape so the four consumers need no changes
- Crop lists per zone shift substantially: sugarcane, cotton, soyabean, jowar, tur, grapes, onion and pomegranate replace the TN delta paddy emphasis

### A4 · Government schemes *(2 h)*
`data/schemesData.js` — 399 lines, 19 TN references. Rebuild from **D3**. Same shape; only content changes.

### A5 · Language: Tamil → Marathi *(3 h)*
Tamil strings live in 12 files. Rather than replacing them inline, introduce a small dictionary:
- `frontend/src/i18n/strings.js` — `{ en, mr }`, with a `language` field on `User`
- Files to convert: `HarvestPostModal`, `AgentOnboarding`, `TaskManagementScreen`, `LandRegistrationScreen`, `locationService`, `UzhavanChatbot`, `growthCopyService`, `fareService`, `routes/ai.js`, `routes/chatbot.js`, `agroZones.js`
- Rename `UzhavanChatbot` → `KisanChatbot` (*Uzhavan* is Tamil for farmer)
- `Crop.tamilName` → `Crop.localName`, with a migration for existing documents

### A6 · Defaults and copy *(1 h)*
- `models/User.js`, `Land.js`, `CropListing.js` — `state` default `'Tamil Nadu'` → `'Maharashtra'`
- `LocationMapPicker.jsx` — `DEFAULT_CENTER` from TN's centre to Maharashtra's (**≈ 19.75 N, 75.71 E**)
- `RegisterScreen.jsx` — **fix the hardcoded `city:'Chennai', district:'Chennai'`** while you are here. This is why every one of the 13 existing users has district "Chennai" and why proximity looked impossible. Reverse-geocode and run through `matchDistrict()`
- Test scripts: Thanjavur fixtures → Nashik or Pune coordinates
- `fareService.js` — vehicle Marathi labels

### A7 · Verify *(30 min)*
```bash
cd backend && for t in testFarmMarket testOrders testDispatch testTracking; do node scripts/$t.js; done
grep -rn "Tamil Nadu\|TAMIL_NADU\|tnDistrict" backend frontend/src --include="*.js" --include="*.jsx" | grep -v node_modules
```
The grep should return nothing but historical comments.

---

## 3. Phase B — Correctness and market intelligence

**2 days · highest value per hour in the plan.** Everything here uses data the app already fetches.

### B1 · Farmer payout and settlement *(1 h — currently a defect)*
`grandTotal = cropTotal + fare`, the agent is told to collect all of it, and **nothing pays the farmer**.
- `models/Order.js` — add `farmerPayout`, `settlement { farmerPaid, paidAt, method }`
- `routes/orders.js` — set at creation, mark at handover
- `AgentTripScreen` collects the **fare only**; `FarmerSalesScreen` shows "collect ₹X from the vendor"

### B2 · Mandi benchmark while pricing a lot ⭐ *(1 h)*
`HarvestPostModal` has **zero** mandi references — the farmer prices blind while the app knows today's rate.
- Under the price field: *"Nashik mandi today ₹1,486/quintal — you are 12% below"*
- Amber below market, green at or above

### B3 · Sale-window advice, statistical version ⭐ *(3 h)*
- `services/saleWindowService.js` — today's modal price vs 30-day mean and slope
- `GET /api/mandi/sale-window?commodity=&district=`
- Surfaces on `HarvestPostModal`, `FarmerSalesScreen`, `FarmerDashboard`
- **Build this before the ML model.** Phase D swaps the engine behind the same endpoint; the UI never changes, so a model that fails to converge cannot break the demo.

### B4 · Surface arrival volumes *(1 h)*
`totalArrivals()` is computed then discarded after ranking markets. Return it from `/prices` and `/nearby-prices`. Heavy arrivals → prices about to soften → sell sooner.

### B5 · Buyer-side price context *(1 h)*
`ListingDetailScreen` — *"asking ₹1,400/qtl · mandi ₹1,486"*.

---

## 4. Phase C — Transactions and trust

**1.5 days · five thin builds, each closing a clause the statement names**

| # | Build | Files | Effort |
|---|---|---|---|
| C1 | **Digital offers** — restores the accept/confirm/decline flow instant-buy replaced | `models/Offer.js`, `routes/offers.js`, `ListingDetailScreen`, `FarmerSalesScreen` | 2 h |
| C2 | **Buyer verification** — `business { gstin, tradeLicence }`, `verification { status }`, badge, filter | `models/User.js`, `routes/users.js` | 1 h |
| C3 | **Structured grading** — replaces the single free-text `gradeNote` with per-commodity A/B/C specs | `data/gradeSpecs.js`, `CropListing`, `HarvestPostModal` | 3 h |
| C4 | **Dispute / grievance** — reason enum, photos, status, resolution | `models/Dispute.js`, `routes/disputes.js` | 2 h |
| C5 | **Transaction records** — receipt endpoint + CSV export | `routes/orders.js` | 2 h |

---

## 5. Phase D — The AI/ML models

**3 days · runs in parallel with Phase C · two people.** All served from `ai-service/app.py`, which already has `/health`, `/predict`, `/pesticide`.

### D0 · Collect the price data *(6 min — do this on day one)*
```bash
cd backend
node scripts/collectPriceHistory.js --state=Maharashtra \
  --commodities="Onion,Tomato,Soyabean,Cotton,Paddy(Common),Wheat" \
  --from=2018-01 --to=2026-08
```
Writes `ai-service/data/prices_maharashtra.csv`. Resumable — a re-run skips completed months. Expect **500,000+ rows**: `date, state, commodity, market, variety, arrivals_tonnes, min_price, max_price, modal_price`.

### D1 · Price forecast, 7–14 day horizon 🥇 *(1.5–2 d)*
- **Features:** lag 1/7/14/30 modal price, rolling mean and std, **arrivals** (the supply signal), day of week, month, district, commodity
- **Model:** gradient boosting (XGBoost/LightGBM) or Prophet. **Not an LSTM** — insufficient volume, it will underperform
- **Report the baseline.** Naive persistence typically lands at 12–20% MAPE; target 8–15%. Quoting both numbers is what separates this from AI-washing
- **Endpoint:** `POST /price-forecast`

### D2 · Sell / hold classifier 🥇 *(+0.5 d)*
Same dataset, different label: *would holding 7 more days have paid?* — real supervised ground truth. Output is a farmer **action**, which is what "sale-window recommendations" actually asks for. Slots in behind B3's endpoint. Shares features with D1 — state that plainly rather than presenting them as unrelated systems.

### D3 · Produce freshness / defect 🥈 *(1 d)*
- **Dataset D1** from `~/Downloads`
- Transfer learning on the existing Keras pipeline
- **Scope honestly:** build *"freshness verified"*, **not** *"Grade A certified"*. Full commercial grading has no public Indian dataset. Binary fresh/defective is well covered and reliably reaches the mid-90s
- **Endpoint:** `POST /grade-photo` · every lot already carries a proof photo, so the pipeline exists

### D4 · Crop-type verification 🥉 *(0.5 d)*
Does the proof photo show onion when the listing says onion? Fine-tune the PlantVillage backbone already on disk. Produces a **"lot verified"** badge. **Endpoint:** `POST /verify-lot`

### D5 · Yield prediction *(1 d — stretch, needs D4 dataset)*
District-wise season-wise crop production statistics → expected yield from area, season, district, crop.

> **Target four models (D1–D4), not six.** Four across two domains, each with a dataset and a reportable metric, beats six with thin evidence. And never count the pesticide rules engine as a model — a judge asking "what architecture?" will expose it.

---

## 6. Phase E — The demand side

**1 day.** Trade currently flows one way: farmers post, vendors react.

- `models/Requirement.js` — vendorUid, commodity, quantityKg, grade spec, priceRange, deliverBy, deliveryPoint, radiusKm, status
- `routes/requirements.js` — create, browse from the farmer side, respond
- Farmer screen: **Buyers looking for your crop**, matched on commodity + proximity + grade
- Dashboard signal: *"3 buyers want onion near you"*

---

## 7. Phase F — Aggregation, the differentiator

**2–3 days.** The concept missing entirely, and the strongest thing available.

**Why it matters commercially** — measured with the current fare table:

| Load | Distance | Vehicle | Fare | Transport as % of crop |
|---|---|---|---|---|
| 100 kg | 65 km | Tempo | ₹2,120 | **71%** ⛔ |
| 1,500 kg | 65 km | Tempo | ₹2,120 | **5%** ✅ |

Three smallholders sharing one tempo turns an impossible trade into a routine one. This is *why* FPOs exist, expressed as software — and Maharashtra is one of the leading FPO states, which is why the statement names them twice.

- **F1 · Multi-farmer lots:** `Order.pickup` becomes an array (already shaped as an object for this); multi-stop OSRM route (`{lng,lat};{lng,lat};{lng,lat}` — same API, more waypoints); **one pickup OTP per farmer**; the agent's stage bar becomes a stop list; fare split proportionally
- **F2 · FPO grouping** *(+0.5 d)*: farmers link to an FPO whose listings surface together as a suggested bundle, payment split by share

---

## 8. Schedule

| Phase | Work | Effort |
|---|---|---|
| **A** | Maharashtra conversion | 1.5–2 d |
| **B** | Correctness + market intelligence | 2 d |
| **C** | Transactions + trust | 1.5 d |
| **D** | ML models (parallel with C) | 3 d |
| **E** | Demand side | 1 d |
| **F** | Aggregation | 2–3 d |

**≈ 11 days sequential · ≈ 7 calendar days with six people.**

### Team split

| Track | People | Owns |
|---|---|---|
| Region | 1 | Phase A — must finish first, everyone else is blocked on A1/A2 |
| Market intelligence | 1 | Phase B — the demo's brain |
| Transactions & trust | 1 | Phase C |
| ML | 2 | Phase D — **run D0 on day one** |
| Demand + aggregation | 1 → 2 | Phase E, then joins F |

### Critical path
**A1 + A2 → everything else.** Then **D0 → D1 → D2**. Run D0 while Phase A is still in progress; it takes six minutes and unblocks two people.

---

## 9. Demo narrative

Nine steps, about eight minutes. Every clause the statement names appears once.

The order is deliberate: it opens on the PROBLEM, shown inside the app rather
than on a slide, and only then shows what the app does about it. A panel that
has already sat through six dashboards will remember the farmer who took home
₹2.49 long after it has forgotten anyone's architecture diagram.

### Act 1 — the problem, on screen (about 1 minute)

1. **Open "Sales outside the app" and record a real sale.**
   512 kg of onion. Rate ₹1/kg. Gross ₹512. Then the deductions, one line at a
   time: labour ₹210, weighing ₹99.51, transport ₹200. The screen shows what he
   took home: **₹2.49**, and beneath it *"Deductions took 100% of this sale."*
   (₹509.51 of ₹512 is 99.5%, and the card rounds it — let the screen say it,
   do not correct it out loud.)
   → **transparent transaction records**

   > Say: *"This is Rajendra Chavan of Barshi, Solapur, February 2023. He
   > travelled 70 km. He had spent about ₹40,000 growing that crop. He knew the
   > rate was insulting before he left home — he sold anyway, because he needed
   > the money. Information was never the binding constraint."*

   That sentence is the whole pitch. Everything after it is the answer.

### Act 2 — what a farmer knows BEFORE he loads the vehicle (about 3 minutes)

2. **Post an onion lot in Nashik.** The mandi rate appears against his price,
   with arrivals and the sale-window read from D1 and D2.
   → **mandi prices, arrival volumes, localised price trends, lot creation,
   price realisation, information asymmetry**

   *Onion is D2's strongest crop (AUC 0.72). Read the numbers off the screen —
   never memorise one. It runs on live Agmarknet data and the answer moves.*

3. **Tap "Sell now or hold? See what waiting costs."**
   This is the step that separates the project. The app prices the wait in
   rupees: the forecast applied to HIS rate, the crop lost to spoilage, the
   godown rent, and — the part nobody else will have — **how much he could
   raise against the lot while he waits**.
   → **storage options, sale-window recommendations, reduced post-harvest loss**

   Three things to point at, in this order:
   - The **on-farm baseline** sits beside every godown. Most farmers store at
     home; a comparison that hides that makes every godown look like pure cost.
   - **Cold storage is refused for onion**, with the reason: it sweats on
     removal and rots. A ventilated chawl is the right structure.
   - If the answer is negative, **say so**. *"Today the model says holding this
     lot loses money. That is the honest answer and the app gives it."*

   > Say: *"The statement says farmers sell at harvest because of liquidity or
   > storage constraints. Telling a man to hold when he cannot afford to hold
   > is not advice. So the pledge figure is in the answer, not a footnote."*

4. **Now push the hold to 45 days and let it refuse.**
   *"The price model was only measured out to 14 days. A rupee figure for 45
   days would be a guess wearing a decimal point."*
   → **the model declines rather than guessing**

### Act 3 — quality, and knowing what you don't know (about 1 minute)

5. **Photo check on the ONION lot.** Produce type confirmed, freshness graded
   against the AGMARK criteria shown beside it.
   → **quality grading**

   > Say: *"99.67% on 1,839 held-out onion images. And the grade criteria next
   > to it are not our opinion of a good onion — they are AGMARK Extra Class
   > under the Agricultural Produce (Grading and Marking) Act, the same
   > standard the APMC grades against."*

6. **Then a POMEGRANATE lot's photo check, and let it refuse.**
   *"Only 280 training images for Pomegranate — not enough to show a farmer a
   badge."*

   > Say: *"It scores 93% on pomegranate. We still refuse it, because 60 test
   > images is not evidence. A model that knows what it does not know is worth
   > more than one that answers everything."*

### Act 4 — who to sell to (about 2 minutes)

7. **Start recording a sale and type a trader's name.**
   Before the crop moves, the app shows what OTHER farmers recorded about that
   buyer: how many sales, how fast they pay, how much is still unpaid.
   → **verified buyers, payment reliability, reliable buyer sourcing**

   Then show the refusal: a buyer with two recorded sales reads *"too few to
   say anything about how they pay"* — counts, no verdict.

   > Say: *"In Nashik, grapes fall outside APMC purview and traders defaulting
   > on payments runs into crores. A GST check digit proves a number was
   > issued. It says nothing about whether the man pays. This does."*

8. **A buyer's requirement is already waiting**, matched on crop, grade and the
   buyer's own radius. Offer → farmer counters → agreed.
   → **buyer demand, quality requirements, digital offers, bargaining power**

### Act 5 — moving it and closing it (about 1 minute)

> **Pick the right farmer for this act.** Transport is priced on real distance, so a
> Barshi lot delivered to Nashik is 336 km and the fare comes to ~70% of the crop's
> value — true, but it makes aggregation look absurd rather than useful. Use
> **Nivrutti (Lasalgaon) → Balaji (Nashik), 60 km, ~11% of crop value**, or
> **Ishwar (Junnar) → Sahyadri (Pune), 92 km, ~18%**. Both read as sensible trade.
> Quantity matters too: quote a realistic tempo load (1,000–1,500 kg), not 200 kg —
> the fare is mostly fixed, so a small load always looks disproportionate.


9. **Bundle three nearby lots into one run**, read the measured transport
   saving off the screen, send one tempo, OTP at each farm, tracked to the
   buyer's shop. Finish on the receipt with the payout settled — and the
   grievance link beside it.
   → **FPO aggregation, lower transaction cost, logistics coordination,
   payment tracking, dispute and grievance processes**

### The closing line

> *"Maharashtra has laid the rails — AgriStack, MahaAgriNEX, Maha Trace, A-DeX,
> and Beckn inside MahaVISTAAR. Thirty lakh farmers can already get a mandi
> price by voice call in Marathi, and Nashik still blocked the highway in May.
> Reach is solved. Counterparty is not. There is no buyer anywhere in that
> stack — no payment record, no demand signal, no grievance trail. We built the
> buyer side."*

---

### ⚠️ Four things this script deliberately does NOT do

**It does not pretend the refusal list is empty.** Onion IS graded now — the
Mendeley red/white onion bulb set (Kulkarni, Pawale & Suryawanshi 2025, CC BY 4.0)
took D3 to 15 produce types at 99.67% on onion. But Grape, Guava, Jujube and
Pomegranate are still refused on 280 training images each, and step 6 shows one.
Do not quietly drop that beat now that the headline crop works: the refusal IS the
credibility, and a judge who sees a model decline once will believe the numbers it
does give.

**It does not quote a rehearsed number.** An older script promised *"12% above the
30-day average"* and *"transport falls from 71% to 5%"*. Both are computed live —
from Agmarknet prices that move daily, and from real routing that can come out
NEGATIVE when the farms are scattered. Read what is on the screen. If the bundle
saving or the hold decision is negative that day, that IS the answer; do not hunt
for a different lot to hide it. The one number you may quote from memory is
₹2.49, because you typed the inputs yourself in step 1.

**It does not claim D4 as a model.** Crop-type verification is the same forward
pass as D3's freshness head (98.79% on produce type). Three models ship — D1, D2,
D3 — plus D5 on five crops. Counting four would be padding.

**It does not present the godown records as a registry.** They are illustrative:
real operators, real structures, real places, example capacities and rates. Say
that in step 3 before anyone asks. `availableTonnes` is null on every record on
purpose — nobody publishes live free space, and inventing it would be the storage
equivalent of faking a live agent position.

### Two sentences that lose the room

**Never say "e-NAM failed."** MSAMB runs e-NAM in Maharashtra and 133 state APMCs
are onboarded; someone on that panel may have implemented it. Say instead:
*"e-NAM solved trade digitisation. The residual gap is pre-trade intelligence and
post-trade accountability, and that is where price realisation is actually lost."*

**Never say "eliminate the middleman."** The commission agent is also the lender,
the transport arranger, and the person who takes the lot when it is half spoiled.
A team that deletes him rebuilds e-NAM and inherits its adoption curve. Frame the
trader as a user served with verified supply and lower rejection risk.

---

## 10. Risks — state these before a judge finds them

| Risk | Reality | Mitigation |
|---|---|---|
| **Foreground-only tracking** | Expo Go has no background location; a driver who pockets the phone stops transmitting | Vendor UI shows *"last seen 3 min ago"* and dims the marker rather than faking a position. Say it out loud |
| **No push notifications** | Agents receive jobs only with the app open | Framed as "captains must be online"; 5-min dispatch window with a retry path |
| **OSRM demo server** | Fair-use, rate-limited, no SLA | 6 s timeout, 10-min cache, haversine fallback within 1.5% of OSRM. `OSRM_URL` env var for self-hosting |
| **Model doesn't converge in time** | Real hackathon risk | B3 ships the statistical version first; the model is a swap behind the same endpoint |
| **Photo grading dataset** | No public Indian commercial-grade dataset | Scoped to binary freshness, which public datasets cover |
| **Onion has no photo model** | The dataset has 28 classes and onion is not one of them — Maharashtra's headline crop | The engine returns `NOT_SUPPORTED` and the UI says why, instead of guessing. Demo step 3 shows this deliberately. It also refuses grape/pomegranate (280 training images) despite them SCORING well — 60 test images is not evidence |
| **D5 yield covers 5 crops** | Castor, Chickpea, Groundnut, Rabi Sorghum, Wheat. Everything else is over the 40% MAPE bar and is withheld | Serving rule is an absolute MAPE floor, not "beats its baseline" — safflower beat its baseline at 101% MAPE. Sugarcane is withheld separately: ICRISAT records it as gur, not cane |
| **Return-leg economics** | ~~Agents earn ₹14–16/km on a vehicle costing ~₹18–22/km~~ **FIXED** | A return charge tapering from a 40 km threshold, shown to the vendor as its own line. Every vehicle and distance now clears its running cost on the kilometres actually driven; regression-tested on the economics in `testOrders.js` |
| **Agro-zone data quality** | D2 may not be cleanly available | Cover the 8–10 demo districts by hand and say so, rather than implying full state coverage |

---

## 11. If time runs short

Cut from the bottom:

1. **Never cut:** A1, A2 (nothing works regionally without them) and B1 (a live defect, not a feature)
2. **Keep:** B2, B3 — two hours, and they carry the whole market-intelligence story
3. **Keep:** D0, D1, D2 — the AI the panel expects, with real metrics
4. **Keep:** C1 digital offers — named in the statement, restoring code that existed
5. **Keep:** F1 multi-farmer lots — the differentiator
6. **Drop in this order:** D5 yield → D4 crop verification → C3 structured grading → E demand side → A5 full Marathi (leave English + key labels)

---

## 12. First three commands in the new session

```bash
cd /Users/rsabishek/Desktop/farmerapp/FARMERAPP

# 1. confirm the baseline is green before changing anything
cd backend && for t in testFarmMarket testOrders testDispatch testTracking; do node scripts/$t.js; done

# 2. unblock the ML track immediately (6 minutes)
node scripts/collectPriceHistory.js --state=Maharashtra \
  --commodities="Onion,Tomato,Soyabean,Cotton,Paddy(Common),Wheat" \
  --from=2018-01 --to=2026-08

# 3. see the full conversion surface
grep -rln "Tamil Nadu\|TAMIL_NADU\|tnDistrict" .. --include="*.js" --include="*.jsx" | grep -v node_modules
```

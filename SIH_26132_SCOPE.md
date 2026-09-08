# SIH 26132 — Full Build Scope

**Problem statement:** Strengthening market linkages and price discovery for farmers
**Organisation:** Maharashtra State Innovation Society (Govt. of Maharashtra)
**Codebase:** `/Users/rsabishek/Desktop/farmerapp/FARMERAPP`

Everything the statement asks for, audited against the code, with what is left to build.

---

## 1. Coverage audit

The statement names 15 capabilities and 7 outcomes. Current status:

| # | Capability | Status | Evidence |
|---|---|---|---|
| 1 | Aggregate mandi prices | ✅ **Have** | `agmarknetService.js`, 27 functions, live Agmarknet |
| 2 | Buyer demand | ❌ **Missing** | No model, no route. Vendors can only react to listings |
| 3 | Quality requirements | ❌ **Missing** | Buyers cannot state specs |
| 4 | Arrival volumes | ⚠️ **Partial** | `totalArrivals()` computed but used only to rank markets internally — never returned to a screen |
| 5 | Transport options | ✅ **Have** | auto / tempo / truck, road fares, capacity + distance rules |
| 6 | Storage options | ❌ **Missing** | No warehouse concept |
| 7 | Localised price trends | ✅ **Have** | `getTrendForSelection`, `getMonthlyCommodityPrices`, adjacent-district markets |
| 8 | Sale-window recommendations | ❌ **Missing** | Trend data exists; nothing computes sell/hold |
| 9 | Match farmers/FPOs with **verified** buyers | ⚠️ **Partial** | Proximity matching works. Zero hits for `verified`/`gst`/`licence`. No FPO concept |
| 10 | Lot creation | ✅ **Have** | `CropListing` — quantity, min order, proof photo, harvest date |
| 11 | Quality grading | ⚠️ **Partial** | One free-text field: `gradeNote` |
| 12 | Digital offers | ❌ **Missing** | Existed as accept/confirm/decline; replaced by instant-buy during the FARM Market build |
| 13 | Logistics coordination | ✅ **Have** | Dispatch, OTP handover, live tracking. Strongest area |
| 14 | Payment tracking | ⚠️ **Broken** | `payment {mode, status}` only. No `farmerPayout`, no settlement — the money never reaches the farmer |
| 15 | Dispute / grievance | ❌ **Missing** | Zero hits for `dispute`/`grievance` |

**Outcomes:** lower transaction cost ✅ · transparent records ⚠️ · price realisation ❌ · information asymmetry ⚠️ · FPO aggregation ❌ · post-harvest loss ❌ · reliable buyer sourcing ❌

**Score: 5 have, 4 partial, 6 missing.** The half that exists is the operationally hard half.

---

## 2. Tier 0 — Fix what is wrong (1 hour)

Not features. Defects that contradict a clause the statement names.

### 0.1 Farmer payout and settlement
**Clause:** *payment tracking* · **Outcome:** *transparent transaction records*

Today `grandTotal = cropTotal + fare.total`, the agent is told *"Collect ₹6,166 cash from the buyer"*, and nothing pays the farmer their ₹6,000.

- `models/Order.js` — add `farmerPayout`, `settlement: { farmerPaid: Boolean, paidAt, method }`
- `routes/orders.js` — set `farmerPayout = cropTotal` at creation; mark paid at handover
- `AgentTripScreen.jsx` — collect the **fare only**; show "vendor pays farmer ₹X directly"
- `FarmerSalesScreen.jsx` — show "collect ₹X from the vendor" against the pickup code

---

## 3. Tier 1 — Leverage the data you already fetch (1 day)

Highest value per hour in the whole plan. Nothing here needs new data sources — the mandi service already returns all of it.

### 1.1 Mandi benchmark while the farmer prices a lot ⭐
**Clause:** *price discovery* · **Outcome:** *reduced information asymmetry*, *improved price realisation*

`HarvestPostModal` currently has **zero** mandi references. The farmer types a price blind while the app knows today's rate.

- `HarvestPostModal.jsx` — under the price field: *"Thanjavur mandi today: ₹32/kg. You are 12% below."*
- Colour-code: below market = amber warning, at/above = green
- Data: existing `GET /api/mandi/prices`

> This is the single highest-leverage change in the document. It converts a listings board into market intelligence at the exact moment a farmer's decision is made.

### 1.2 Sale-window recommendation ⭐
**Clause:** *sale-window recommendations* · **Outcome:** *improved price realisation*, *reduced post-harvest loss*

- New `backend/services/saleWindowService.js` — compare today's modal price against the 30-day mean and slope from `getMonthlyCommodityPrices`
- Output: `{ verdict: 'sell_now' | 'hold' | 'neutral', deltaPct, trend, message }`
- Route: `GET /api/mandi/sale-window?commodity=&district=`
- Surface on `HarvestPostModal`, `FarmerSalesScreen` and `FarmerDashboard`
- Copy: *"Paddy in Thanjavur is 12% above its 30-day average and rising. Good time to sell."*

### 1.3 Surface arrival volumes
**Clause:** *arrival volumes*

`totalArrivals()` already exists and is thrown away after ranking markets.

- `routes/mandi.js` — return arrivals alongside price in `/prices` and `/nearby-prices`
- `MarketPricesScreen.jsx` — show arrivals per market
- Meaning for the user: heavy arrivals → prices about to soften → sell sooner

### 1.4 Price context for the buyer too
**Outcome:** *reduced information asymmetry* (both sides)

- `ListingDetailScreen.jsx` — *"asking ₹30/kg · mandi ₹32/kg"* so a vendor sees a fair deal
- Reuses 1.1's endpoint

---

## 4. Tier 2 — Thin additions the statement names (1 day)

Small builds, each closing a named clause.

### 2.1 Digital offers (restore)
**Clause:** *digital offers* · **Problem text:** *"weak bargaining power"*

The accept → pending → confirm flow existed and was replaced with instant-buy.

- `models/Offer.js` — listingId, vendorUid, quantityKg, offeredPricePerKg, status `pending|accepted|rejected|countered|expired`, expiresAt
- `routes/offers.js` — create, accept (→ converts to an Order), reject, counter
- `ListingDetailScreen.jsx` — **Buy now** *and* **Make an offer**
- `FarmerSalesScreen.jsx` — an Offers tab with accept / reject / counter

### 2.2 Buyer verification
**Clause:** *verified buyers* · **Outcome:** *reliable buyer sourcing*

- `models/User.js` — `business: { gstin, tradeLicence, companyName }`, `verification: { status: 'unverified'|'pending'|'verified', verifiedAt, note }`
- `routes/users.js` — submit documents; an admin flag flips status
- Badge on vendor identity everywhere it appears; farmers can filter to verified buyers only

### 2.3 Structured quality grading
**Clause:** *quality grading*, *quality requirements*

Replace the single free-text `gradeNote`.

- `backend/data/gradeSpecs.js` — per-commodity grades (A/B/C) with moisture, foreign matter, size
- `CropListing` — `grade: { code, moisture, foreignMatterPct, notes }`
- `HarvestPostModal` — grade picker with the spec shown inline
- Filterable on the market screen

### 2.4 Dispute / grievance
**Clause:** *dispute or grievance processes*

- `models/Dispute.js` — orderId, raisedBy, role, reason enum (`quality|quantity|damage|payment|delay|other`), description, photos, status `open|under_review|resolved|rejected`, resolution
- `routes/disputes.js` — raise, list mine, resolve
- Raise button on delivered orders for both vendor and farmer

### 2.5 Transaction records
**Outcome:** *transparent transaction records*

- `GET /api/orders/:id/receipt` — full trail: lot, grade, price, fare, agent, timestamps, OTP confirmations, settlement
- `GET /api/orders/export?from=&to=` — CSV for the farmer's own records
- Receipt screen with a share action

---

## 5. Tier 3 — The two real builds (3–4 days)

These need design time, not just forms.

### 3.1 Buyer demand / requirement posting (~1 day)
**Clause:** *buyer demand* · **Problem text:** *"buyers may struggle to aggregate consistent volumes"*

Currently trade flows one way — farmers post, vendors react. The statement wants both directions.

- `models/Requirement.js` — vendorUid, commodity, quantityKg, grade spec, priceRange, deliverBy, deliveryPoint, radiusKm, status
- `routes/requirements.js` — create, browse (farmer side), respond
- New farmer screen: **Buyers looking for your crop**, matched on commodity + proximity + grade
- Match indicator on the farmer's dashboard: *"3 buyers want paddy near you"*

### 3.2 FPO aggregation / multi-farmer lots (~2–3 days) ⭐
**Clause:** *matches farmers/FPOs* · **Outcome:** *stronger FPO aggregation*

The concept you are missing entirely, and the strongest differentiator available.

**Why it matters commercially, not just for scoring:** transport is only viable at volume. Measured with the current fare table — 100 kg moved 65 km costs 71% of the crop value; 1,500 kg over the same route costs 5%. Three farmers sharing one tempo turns an impossible trade into a routine one.

Two versions:

**(a) FPO account (~4h)** — a fourth role. Farmers link to an FPO; the FPO lists on their behalf; payment splits back by share. Models the organisation; matches the keyword.

**(b) Multi-farmer lots (~2–3 days)** — a vendor's single order draws from several nearby listings; **one vehicle collects from all of them in sequence**.
- `Order.pickup` becomes an array (already shaped as an object for this reason)
- Multi-stop OSRM route (`{lng,lat};{lng,lat};{lng,lat}`) — same API, more waypoints
- One pickup OTP per farmer; the agent's stage bar gains a stop list
- Fare split proportionally across sellers
- Market screen: *"Bundle 3 nearby lots → 500 kg"*

**Recommendation:** build (b), then add (a) as a thin grouping layer on top — about half a day more.

---

## 6. Tier 4 — Maharashtra adaptation (0.5–1 day)

The statement is from MSInS; the app is hard-wired to Tamil Nadu.

- `frontend/src/utils/tnDistricts.js` → generalise to a state-keyed district registry
- `backend/data/tnDistrictCentroids.js` → add Maharashtra's 36 districts + anchor towns
- Tamil strings (`cropTamilName`, vehicle labels) → language setting with Marathi
- **Agmarknet is already national** — the entire price layer ports with no work
- Vehicle types are nationally valid; only framing copy says "Tamil Nadu"

**Cheapest honest route:** keep TN as the pilot deployment, demo one Maharashtra district to prove the district table is data rather than logic, and say so explicitly in the pitch.

---

## 7. Deliberately skipped

| Item | Why |
|---|---|
| **Storage options** | One clause; needs warehouse inventory data that does not exist publicly; will not repay the build cost |
| **Officer dashboards** | Belongs to PS 26131, not this statement |
| **Payment gateway** | COD is how this trade actually settles and needs no integration. The `payment` sub-document leaves room for a gateway later |

---

## 8. Effort and sequencing

| Tier | Work | Effort | Coverage after |
|---|---|---|---|
| 0 | Payout fix | 1 h | ~52% |
| 1 | Mandi benchmark, sale-window, arrivals, buyer price context | 1 day | ~65% |
| 2 | Offers, verification, grading, disputes, receipts | 1 day | ~82% |
| 3.1 | Buyer demand | 1 day | ~88% |
| 3.2 | Multi-farmer lots + FPO | 2–3 days | ~95% |
| 4 | Maharashtra | 0.5–1 day | ship-ready |

**Total ≈ 6–7 working days.**

### Suggested split for a six-person team

| Track | Owner | Work |
|---|---|---|
| Market intelligence | 1 dev | Tier 1 entirely — the demo's "brain" |
| Transactions | 1 dev | Offers, disputes, receipts, payout fix |
| Trust & quality | 1 dev | Verification, grading specs |
| Demand side | 1 dev | Requirement posting + farmer matching screen |
| Aggregation | 2 devs | Multi-farmer lots + multi-stop routing (hardest piece) |

---

## 9. Demo narrative to build toward

The judging is on outcomes, so rehearse this order:

1. **Farmer posts a lot** — app shows the mandi rate against his price, and *"prices 12% above the 30-day average and rising — good time to sell"* → **price realisation, information asymmetry**
2. **A verified buyer's requirement is already waiting** — *"2 buyers want paddy near you"* → **reliable buyer sourcing**
3. **Buyer bundles three nearby small lots into one 500 kg purchase** → **FPO aggregation**, and transport drops from 71% to 5% of crop value → **lower transaction cost**
4. **Buyer makes an offer, farmer counters, they settle** → **digital offers, bargaining power**
5. **One tempo collects from all three farms, OTP at each stop, tracked live to the buyer's shop** → **logistics coordination**
6. **Receipt shows the full trail; farmer's payout is marked settled** → **transparent transaction records**

Every clause the statement names appears in that six-minute run.

---

## 10. What to do first

If time is short, this order maximises score per hour:

1. **1.1 mandi benchmark** — 1 hour, and it is the most visible "intelligence" in the app
2. **0.1 payout fix** — 1 hour, and it is currently wrong
3. **1.2 sale-window** — the clause with no partial credit available elsewhere
4. **2.1 digital offers** — named in the statement, and you are restoring code that existed
5. **3.2 multi-farmer lots** — the differentiator, if the days are there

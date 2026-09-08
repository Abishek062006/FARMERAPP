# FPO flow — how to check it actually works

Everything below runs against the **live Atlas database**, which already has the
demo data seeded. Nothing here is a mock.

> **Honest caveat:** this walkthrough is derived from the code, not from me
> running the app — nobody has launched Expo yet. Expect small snags. Where I
> know something is missing, it says so.

---

## 0. Start the three processes

```bash
cd backend && npm run dev            # port 5050
```
```bash
cd frontend && npx expo start        # host auto-detected from the dev server
```
```bash
cd ai-service && venv/bin/python app.py   # optional — only D1/D2/D3 need it
```

The app degrades honestly without the AI service, so skip it unless you're
checking price forecasts or the photo freshness check.

---

## 1. What is already seeded

| | |
|---|---|
| Real FPOs in the registry | **213** (official SFAC list, all Maharashtra) |
| Claimed & operational | **10** |
| Demo accounts | **85** — 10 FPO admins + 75 farmer members |
| Password for all of them | `FarmerApp2026!` |
| Full account list | `~/Documents/farmerapp_fpo_demo_logins.csv` |
| Live harvest listings | **75**, one per member |

Each of the 10 groups sells **one crop, split into separate grade lots** — so
Nehrai (Nashik/Dindori) currently offers onion as three distinct lots:

```
Onion · Grade A     2,000 kg   2 farms   ₹26–29   ← wide spread flagged
Onion · Grade B     3,600 kg   2 farms   ₹18–19
Onion · ungraded    7,200 kg   4 farms   ₹21–24   ← wide spread flagged
```

That shape is deliberate — it exercises grade separation, pooling across farms,
the price-spread warning, and per-member minimum order quantities all at once.

---

## 2. Flow A — the FPO admin dashboard

Log in as **`admin.nehrai@example.com`**.

You should land **directly on the FPO dashboard** — not the farmer dashboard.
There is deliberately no route back to the farmer home screen; an FPO's
CEO/Manager is an administrator, not necessarily a farmer.

Check for:
- **Available now vs Estimated incoming shown separately** and never added
  together. Available now is real listings; estimated incoming is a forecast
  from planted-but-unharvested crops using real district yield data.
- Crops with **no district yield record** are named as excluded, not silently
  counted as zero.
- **Member cards** — 8 members with real names and villages. Earnings will be
  ₹0 until you complete Flow C.
- Grade-separated stock matching the buyer's catalog exactly.

---

## 3. Flow B — a farmer finds and joins an FPO

Log in as a farmer who is **not** already in a group (any account from the CSV
already belongs to one, so use a fresh registration, or leave a group first).

`FPO screen → "Find your real FPO" → pick a district`

- Searches the **real 213-FPO registry**.
- Unclaimed FPOs offer **"Claim this FPO"** — that's an authority claim
  (CEO / Manager / Director / Authorized Representative), reviewed by a human.
- Claimed ones offer **"Request to join"**, which stays *pending* until the
  group's admin approves it.

To approve: log back in as `admin.nehrai@example.com` → the FPO screen shows
**Pending join requests** with Approve / Reject.

A pending applicant must **not** appear in any lot, the member count, or the
dashboard totals until approved.

---

## 4. Flow C — a buyer purchases a lot ← the main one

**You need a buyer account.** The 85 seeded accounts are all farmers. There are
6 pre-existing vendor accounts (`abdul@gmail.com`, `deva@gmail.com`,
`balaji@demo.in`) but I don't have their passwords — easiest is to register a
fresh one in the app and pick the buyer role.

Then: **Group Lots** (the vendor tab, formerly "Bundles")

1. **Browse the catalog.** Each card is one (FPO, crop, grade) lot.
   - Grade A/B/C pills always carry a **SELF-DECLARED** chip beside them —
     nobody inspected the produce.
   - Ungraded lots are visually distinct (dashed border, square corners,
     "Grade not declared") and are **not** sorted as if they were below Grade C.
   - Where members disagree on price by more than 10%, a warning says the
     indicative price is *not a price any member offered*.

2. **Enter a quantity → get a quote.** The quote shows exactly which farmer
   supplies how many kg at what price, and the precise total.
   - It says **"not a reservation"** — because it isn't.

3. **Try an impossible quantity on purpose.** Ask for something that can't be
   composed from the members' minimum order sizes — e.g. a number just below the
   smallest minimum. You should get **tappable alternatives** ("2,000 kg" /
   "2,500 kg") that re-quote on tap, plus the reason. This is the most useful
   thing on the screen and worth checking properly.

4. **Confirm.** You should get **N farmer orders + 1 collection run**. Each
   farmer keeps their own order, payout, settlement and dispute trail.

Now reopen the FPO dashboard as the admin — member cards, logistics and
settlement should all have real numbers in them.

---

## 5. Flow D — the captain collects

Log in as an **agent/captain** account, accept the run, and open it.

For each farm, record a real outcome:

| Outcome | Needs the farmer's OTP? |
|---|---|
| Collected in full | yes |
| Short — enter actual kg | **yes** — a short pickup is still a pickup |
| Collected nothing | **no** — the absent farmer is exactly who can't read a code out |

**Test the failure path deliberately.** Mark one farm as *collected nothing*.
Before confirming, the screen tells you what it does to that person: their order
is cancelled and their produce goes back on sale. Then check:

- The failed stop **does not block the run** — you can still finish.
- That farmer's order is cancelled and nothing is owed.
- Their kilograms are **back on their listing**, sellable again.
- Their share of the vehicle fare **stays on their cancelled order** — it is not
  pushed onto the farmers who did deliver.

If *every* farm fails, the run closes with no delivery step rather than
stranding you at a handover that can't happen.

---

## 6. Flow E — the group drives its own vehicle

Set the group's transport mode to `own` or `contracted`. There is no captain on
such a run, so the **FPO admin** records the outcomes instead — exactly what a
paper trip sheet is, with their name against every entry.

Dashboard → Logistics → open a run.

On a `hired` run the same screen must be **read-only** with a locked banner:
the captain was there, so it's their account to give.

---

## 7. Resetting between runs

```bash
cd backend && node scripts/seedFpoListings.js
```
Re-seeds the 75 harvest listings (replaces its own, doesn't stack duplicates).
Run this after Flow C consumes stock.

```bash
cd backend && node scripts/seedFpoListings.js --purge
```
Removes the demo listings only.

```bash
cd backend && node scripts/seedFpoDemoData.js --purge
```
Removes the whole demo layer — memberships, claims, land, crops.

---

## 8. Backend check without touching the app

```bash
cd backend && node scripts/testFpos.js
```
325 assertions covering the whole chain — quote arithmetic, allocation against
per-member minimums, rollback when stock moves mid-commit, and the two payment
modes paying different amounts for the same sale.

Full suite is 14 files. A run reporting `0 passed, 1 failed` threw before its
first assertion — that's almost always a transient Atlas drop, so re-run it
before investigating.

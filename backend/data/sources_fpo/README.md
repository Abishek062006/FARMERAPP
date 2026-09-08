# backend/data/sources_fpo

Two datasets live here, and they are NOT the same kind of thing. Read the
distinction before touching either.

## 1. `mh_fpo_master.json` / `mh_fpo_master.csv` — the REAL registry

213 rows, one per real, already-incorporated Farmer Producer Organisation in
Maharashtra, sourced from SFAC's (Small Farmers' Agri-Business Consortium,
Govt of India) official Maharashtra FPO registry (`sfac_fpo_list_2025.pdf`,
extracted with `scripts/seedFpoMaster.js`, loaded into `FpoMaster`). Every
field on these rows — name, registration number, district, block, promoting
CBBO, date of incorporation — is a fact about a real company. Nothing here is
invented.

`FpoMaster.dataSource` is `'sfac_registry'` on every row for exactly this
reason: it is a constant, not a per-row choice, matching the provenance
convention `Warehouse.dataSource` already established.

## 2. `demo_fpo_dataset.json` — SYNTHETIC people attached to 10 of those real companies

This is a different kind of data and needs to be read differently.

**The 10 companies named in this file are real** — the exact same rows as
above, matched by `registrationNo`. **Every admin and every farmer inside
each one is invented** — a plausible name, a plausible-but-fake mobile number
(`90000xxxxx`, deliberately outside any real Indian mobile prefix pattern),
an `@example.com` email, a real village/taluka/crop combination chosen to be
locally plausible, and a made-up landholding size.

### Why that distinction has to be labelled, permanently, everywhere

A previous decision in this project (see `CLAUDE.md`'s FPO/grade/verification
sections) was explicit that this app never lets a synthetic or self-declared
fact stand in for a verified one without saying so on screen — GSTIN
check-digit passes are shown as "on file," not "verified"; self-declared
grades carry a disclaimer; illustrative warehouse data is never shown beside
real MSWC figures without a `dataSource` label distinguishing them.

Fabricating the MEMBERSHIP of a real, named, legally-incorporated company is
a sharper version of the same risk. "Nehrai Farmer Producer Company Limited"
is a real business with a real SFAC registration number. If this demo data
were ever displayed without a clear label, a viewer would reasonably read it
as "these are Nehrai FPO's actual CEO and farmers" — which would be false,
and false about a specific, identifiable, real organisation, not an
anonymous placeholder. That is a materially worse failure than a mislabeled
illustrative warehouse.

**So every record this dataset produces in the database carries
`dataSource: 'demo_illustrative'`:**
- `FpoAdminClaim.dataSource` (field added for this purpose — see the model)
- `Fpo.dataSource` (field added for this purpose — see the model)

`Land` and `Crop` have no provenance field of their own (adding one for a
single seed script was judged a bigger schema change than this phase calls
for); instead every Land/Crop document this script creates carries a fixed
marker string in its `notes` field
(`"Seeded by scripts/seedFpoDemoData.js (demo_illustrative)…"`), which is
both human-readable if anyone inspects the record and what `--purge` matches
on to remove exactly what it created and nothing else.

**Any screen that renders an `Fpo` or `FpoAdminClaim` should check
`dataSource` and show a visible "illustrative demo data" notice when it is
`'demo_illustrative'`** — the same rule `Warehouse` screens already follow.
This dataset does not add that UI itself; it exists so a later phase can.

### How the synthetic data was generated

- **The 10 FPOs** were pre-selected (not chosen by this script) — see the
  task that produced this file for the exact list and reasoning (onion belt,
  grape/veg, cotton, soyabean/tur, sugarcane, Konkan mango/coconut,
  Marathwada, orange belt, etc.) — one per major crop region.
- **Villages** were checked against real, named villages/towns inside each
  FPO's own taluka where the person generating this file had reasonable
  confidence; where confidence was low, the taluka's own headquarters town
  name was reused across multiple farmers instead of inventing further
  village names. Each FPO entry in `demo_fpo_dataset.json` carries a
  `villageConfidence` field saying which case it is — **read it before
  treating any village name in this file as verified**. Flagged as LOW for:
  Dindori/Nashik (only "Dindori" + "Vani"), Mohol/Solapur (only "Mohol"),
  Phulambri/Aurangabad (only "Phulambri").
- **`primaryCrop` values** are drawn only from `backend/data/agroZones.js`'s
  `CROPS` table, filtered to crops whose `zones` list includes the
  agro-climatic zone `backend/data/mhAgroZones.js` assigns to that FPO's
  district (e.g. no grapes recommended for Ratnagiri/Konkan, no coconut for
  Nagpur/Vidarbha) — cross-checked, not guessed.
- **`landAcres`** is a plausible smallholder figure, 0.5–4.7 acres, varied
  per farmer.
- Coordinates the seed script assigns to each farmer's `Land` come from
  `backend/data/districtCentroids.js` — an exact named anchor town when one
  exists for that block (Achalpur, Ausa, Islampur, Ramtek all do), otherwise
  the district centroid as an approximation (flagged in that `Land`'s own
  `notes`, same honesty rule the rest of the app applies to approximated
  coordinates).

### The 85 accounts that must be registered before `seedFpoDemoData.js` can do anything

`backend/scripts/seedFpoDemoData.js` **cannot create these logins** — same
constraint as `seedDemoData.js`: auth is Firebase email/password and this
backend has no firebase-admin credential. Register every email below through
the app's own Register screen (any password) FIRST. The script then finds
each by email; any not yet registered are named loudly in its output and
skipped, never silently dropped.

10 FPOs × (1 admin + 7 or 8 farmers) = **85 accounts**:

<!-- GENERATED LIST — regenerate from demo_fpo_dataset.json if the dataset changes -->
- **Nehrai Farmer Producer Company Limited** (Nashik/Dindori, reg U01409MH2022 PTC390519)
  - admin: admin.nehrai@example.com
  - farmer: farmer1.nehrai@example.com
  - farmer: farmer2.nehrai@example.com
  - farmer: farmer3.nehrai@example.com
  - farmer: farmer4.nehrai@example.com
  - farmer: farmer5.nehrai@example.com
  - farmer: farmer6.nehrai@example.com
  - farmer: farmer7.nehrai@example.com
  - farmer: farmer8.nehrai@example.com
- **Purandar Agrostar Farmer Producer Company Limited** (Pune/Purandhar, reg U01100PN2022 PTC209981)
  - admin: admin.purandaragrostar@example.com
  - farmer: farmer1.purandaragrostar@example.com
  - farmer: farmer2.purandaragrostar@example.com
  - farmer: farmer3.purandaragrostar@example.com
  - farmer: farmer4.purandaragrostar@example.com
  - farmer: farmer5.purandaragrostar@example.com
  - farmer: farmer6.purandaragrostar@example.com
  - farmer: farmer7.purandaragrostar@example.com
- **Angarsiddha Agro Producer Company Limited** (Solapur/Mohol, reg U01100PN2022 PTC212998)
  - admin: admin.angarsiddha@example.com
  - farmer: farmer1.angarsiddha@example.com
  - farmer: farmer2.angarsiddha@example.com
  - farmer: farmer3.angarsiddha@example.com
  - farmer: farmer4.angarsiddha@example.com
  - farmer: farmer5.angarsiddha@example.com
  - farmer: farmer6.angarsiddha@example.com
  - farmer: farmer7.angarsiddha@example.com
  - farmer: farmer8.angarsiddha@example.com
- **Ellichpura Satpuda Farmer Producer Company Limited** (Amravati/Achalpur, reg U01100MH2021 PTC360444)
  - admin: admin.ellichpura@example.com
  - farmer: farmer1.ellichpura@example.com
  - farmer: farmer2.ellichpura@example.com
  - farmer: farmer3.ellichpura@example.com
  - farmer: farmer4.ellichpura@example.com
  - farmer: farmer5.ellichpura@example.com
  - farmer: farmer6.ellichpura@example.com
  - farmer: farmer7.ellichpura@example.com
- **Dattasai Farmer Producer Company Limited** (Latur/Ausa, reg U01400MH2021 PTC357655)
  - admin: admin.dattasai@example.com
  - farmer: farmer1.dattasai@example.com
  - farmer: farmer2.dattasai@example.com
  - farmer: farmer3.dattasai@example.com
  - farmer: farmer4.dattasai@example.com
  - farmer: farmer5.dattasai@example.com
  - farmer: farmer6.dattasai@example.com
  - farmer: farmer7.dattasai@example.com
  - farmer: farmer8.dattasai@example.com
- **Naturenest Farmer Producer Company Limited** (Kolhapur/Ajra, reg U01100PN2021 PTC200151)
  - admin: admin.naturenest@example.com
  - farmer: farmer1.naturenest@example.com
  - farmer: farmer2.naturenest@example.com
  - farmer: farmer3.naturenest@example.com
  - farmer: farmer4.naturenest@example.com
  - farmer: farmer5.naturenest@example.com
  - farmer: farmer6.naturenest@example.com
  - farmer: farmer7.naturenest@example.com
- **Vilye Farmer Producer Company Limited** (Ratnagiri/Sangameshwar, reg U01611MH2025 PTC440131)
  - admin: admin.vilye@example.com
  - farmer: farmer1.vilye@example.com
  - farmer: farmer2.vilye@example.com
  - farmer: farmer3.vilye@example.com
  - farmer: farmer4.vilye@example.com
  - farmer: farmer5.vilye@example.com
  - farmer: farmer6.vilye@example.com
  - farmer: farmer7.vilye@example.com
  - farmer: farmer8.vilye@example.com
- **Angarmala Shetkari Producer Company Limited** (Sangli/Valva-islampur, reg U01100PN2022 PTC216322)
  - admin: admin.angarmala@example.com
  - farmer: farmer1.angarmala@example.com
  - farmer: farmer2.angarmala@example.com
  - farmer: farmer3.angarmala@example.com
  - farmer: farmer4.angarmala@example.com
  - farmer: farmer5.angarmala@example.com
  - farmer: farmer6.angarmala@example.com
  - farmer: farmer7.angarmala@example.com
- **Ajantha Khore Women Farmers Producer Company Limited** (Aurangabad/Phulambri, reg U01100MH2022 PTC393734)
  - admin: admin.ajanthakhore@example.com
  - farmer: farmer1.ajanthakhore@example.com
  - farmer: farmer2.ajanthakhore@example.com
  - farmer: farmer3.ajanthakhore@example.com
  - farmer: farmer4.ajanthakhore@example.com
  - farmer: farmer5.ajanthakhore@example.com
  - farmer: farmer6.ajanthakhore@example.com
  - farmer: farmer7.ajanthakhore@example.com
  - farmer: farmer8.ajanthakhore@example.com
- **Shri Rajaramtek Farmers Producer Company Limited** (Nagpur/Ramtek, reg U01611MH2023 PTC400555)
  - admin: admin.rajaramtek@example.com
  - farmer: farmer1.rajaramtek@example.com
  - farmer: farmer2.rajaramtek@example.com
  - farmer: farmer3.rajaramtek@example.com
  - farmer: farmer4.rajaramtek@example.com
  - farmer: farmer5.rajaramtek@example.com
  - farmer: farmer6.rajaramtek@example.com
  - farmer: farmer7.rajaramtek@example.com

### Running it

```bash
node scripts/seedFpoDemoData.js          # seed (skips any FPO whose admin isn't registered)
node scripts/seedFpoDemoData.js --purge  # remove everything it made, by email lookup
```

Confirmed **2026-08-24**: run against live Atlas with none of the 85 accounts
registered yet. It reported all 85 as `❌ MISSING`, seeded 0 of 10 FPOs, and
exited cleanly (no crash) — the correct behaviour for this phase. Phase 4 (a
human registering the 85 accounts through the app, then re-running this
script) is a separate, later step.

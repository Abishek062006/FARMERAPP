# AGMARK Grading and Marking Rules sources (food grains, oilseeds, millets)

The documents behind the food-grain/oilseed entries in `../gradeSpecs.js`
(everything added alongside `wheat`, `soyabean`, `tur`, `gram`, `jowar`,
`bajra`, `ragi`, `maize`, `safflower` — the 34 fruit-and-veg entries from
AGMARK Volume V are documented in the header comment of `gradeSpecs.js`
itself, not here).

Downloaded by the project owner from dmi.gov.in — exact notification page
not recorded for any of these (unlike `../sources/README.md`, which has
URLs, this batch arrived as files already on disk). Where a notification
number, date and Gazette part/section is visible IN the document itself,
it is quoted below and can be cross-checked against dmi.gov.in's own grade
standards list independently of the URL it was fetched from.

| File | Document | Pages | Text layer |
|---|---|---|---|
| `Pulses_GM_rules_2019.pdf` | Agricultural Produce (Pulses Grading and Marking) Rules, 2019 (G.S.R. 36(E), 17 Jan 2019) | 39 | Real (pages 20+ English; pages 0-19 are the Hindi half of the bilingual gazette) |
| `Soyabean_GM_rules_2012.pdf` | Soyabean Grading and Marking Rules, 2012 (G.S.R. 41(E), 24 Jan 2012) | 12 | **None — scanned.** OCR'd. |
| `Kusum_seed_gm_rules2018.pdf` | Kusum Seed Grading and Marking Rules, 2018 | 9 | Real (English from page 5 on; earlier pages Hindi) |
| `MilletsGradingandMarkingRules2024.pdf` | Millets Grading and Marking Rules, 2024 | 32 | Real, but **English schedules only start at page 17**; pages 0-16 are Hindi |
| `Cereals_2001.pdf` | Cereals Grading and Marking Rules, 2000 (G.S.R. 3, notified 12 Dec 2001, published in Gazette pages 32-46) | 33 | Real, clean English throughout |
| `cergr.pdf` | Cereals Grading Rules, 1966 | 54 | Real, clean English throughout |
| `Cereals2000H.pdf` | Same 2000 rules, Hindi-only copy | 11 | Real but Hindi — not used, `Cereals_2001.pdf` covers the same rules in English |
| `Rice.pdf` | (Rice/Paddy Grading and Marking Rules — title not confirmed) | pdfinfo says 18 | **Failed to extract — see below** |
| `Basmati_Rice.pdf` | Basmati Rice Grading and Marking Rules | not opened this pass | Not used — Rice/Paddy and Basmati were lower priority than the five named crops, and time went to Rice.pdf's failure first |
| `NonBasmatiAromaticRiceGMRulesfinalnotification.pdf` | Non-Basmati Aromatic Rice Grading and Marking Rules, 2024 | not opened this pass | Not used, see above |
| `Horsegram_GM_rules_2020_final.pdf` | Horsegram Grading and Marking Rules, 2020 | not opened this pass | Not used — lower priority, not reached |
| `Seed_Potato.pdf` | Seed Potato Grading and Marking Rules | not opened this pass | Not used — this app grades table produce, not certified seed lots |
| `Oil seed.pdf` | Mahatma Phule Krishi Vidyapeeth, Rahuri — groundnut CULTIVATION guide (Marathi) | 16 | Real, but **not an AGMARK grading document at all** — checked every page for "grade"/"agmark"/"moisture", zero hits. Kept in the folder for the record; not a rejected grading source, just a mislabelled file. |
| `MSEOGMRules.pdf` | Multi Source Edible Oils Grading and Marking Rules, 2023 | 13 | Real, but grades a **blended refined oil PRODUCT**, not a raw oilseed lot. Not used. |
| `Englishvegoils.pdf` | Vegetable Oils Grading and Marking Rules, 1955 | 39 | Real, but again grades **refined vegetable oil**, not the raw seed. Not used. |

## What actually made it into gradeSpecs.js, and from which schedule

- **Wheat** — `cergr.pdf` (Cereals Grading Rules, **1966**), Schedule XV. Four
  grades (I-IV) mapped to A/B/C, Grade IV dropped (see the ambiguity note
  below — this is the one figure in this batch that needed a supersession
  check before use).
- **Soyabean** — `Soyabean_GM_rules_2012.pdf`, Schedule II. OCR'd (method
  below); Special/Standard/General → A/B/C.
- **Tur (Pigeon Pea)** — `Pulses_GM_rules_2019.pdf`, Schedule X (Arhar or
  Tur, whole).
- **Gram (Harbhara)** — `Pulses_GM_rules_2019.pdf`, Schedule XIII (Chana
  whole / Bengal gram — not Schedule XII, Kabuli chana, which is a bolder,
  paler-seeded gram not the desi/Bengal type Maharashtra mostly grows).
- **Jowar (Sorghum)** — `MilletsGradingandMarkingRules2024.pdf`, Schedule II.
- **Bajra (Pearl Millet)** — same file, Schedule III.
- **Ragi (Nachani)** — same file, Schedule IV.
- **Maize** — `Cereals_2001.pdf`, Schedule V. Four grades (I-IV) mapped to
  A/B/C, Grade IV dropped, same reasoning as Wheat.
- **Safflower (Karadi)** — `Kusum_seed_gm_rules2018.pdf`, Schedule II. See
  the substitution note below — this is a compromise, flagged as such in
  `gradeSpecs.js` itself (`agmarkSchedule` field on the `safflower` entry).

## Extraction method

Same rule as AGMARK Volume V: **pdfplumber, never pypdf/flat-text**, for any
page with a grade-designation table. In practice most of these tables came
through cleanly with `page.extract_text()` because they are single-column,
numbered tables (`(1) (2) (3) ...`) rather than the 3-column
requirement/tolerance layout Volume V uses — `extract_tables()` was tried
but wasn't needed once the columns were confirmed against a rendered crop of
the page image (done for the Soyabean OCR page, see below, and spot-checked
on one Pulses page).

### Soyabean: scanned PDF, OCR'd

```
pdftoppm -r 300 -gray -png Soyabean_GM_rules_2012.pdf out
for f in out-*.png; do tesseract "$f" "${f%.png}" -l eng --psm 6; done
```

Pages 1-11 OCR'd readably (the rule text). Page 12, which holds the actual
"CRITERIA FOR GRADE DESIGNATION" table, OCR'd with the **column headers
readable but every data cell dropped** under `--psm 6` — tesseract collapsed
the ruled table into noise. Fixed by cropping page 12 into two PNGs (header
band, data-row band) with Pillow and reading them as images directly rather
than trusting the OCR text output for the numbers:

```python
from PIL import Image
im = Image.open('out-12.png')
im.crop((0, 600, 2550, 1500)).save('table_crop.png')    # header row
im.crop((0, 1450, 2550, 1750)).save('table_crop2.png')  # Special/Standard/General rows
```

Both crops were then read visually (not re-OCR'd) to transcribe the table:
Extraneous matter (organic/inorganic), split-or-cracked seed, immature/
shrivelled/green seed, damaged-and-weevilled seed, other edible seeds,
moisture, oil content (min.), and colour of extracted oil on the Lovibond
scale. The Lovibond colour column (Special 20.0, Standard 30.0, General
40.0) was **not** carried into `gradeSpecs.js` — it needs lab equipment to
check and is not something a farmer or buyer can eyeball the way the other
criteria are, so it would be decorative in a self-declared grading UI. This
is a deliberate omission, not an extraction failure.

## Ambiguities and rejections — read before trusting a figure blindly

### Wheat: is the 1966 schedule actually still current?

`Cereals_2001.pdf` (the "Cereals Grading and Marking Rules, 2000") opens
with a supersession clause: *"...in supersession of Cereals Grading Rules,
1966..."* — read alone, that would mean `cergr.pdf`'s Wheat schedule (XV)
is dead and citing it would be citing a repealed rule.

But the SAME 2000/2001 notification, rule 1(ii), restricts its own scope to
just **Ragi, Jowar, Maize, Barley and Bajra**. It never re-notifies Wheat,
Rice/Paddy or Gram at all. A web check of DMI's own current standards
listing (dmi.gov.in/GradesStandard.aspx, fetched 2026-08-24) shows **both**
"Cereals, 1966" and "Cereals, 2000" listed as separate, present-day entries
— not one replacing the other in DMI's own presentation. Read together, the
practical situation looks like: the 2000/2001 rules carved five commodities
out of the 1966 rules and restated them; the 1966 rules were left standing
for whatever they still cover, including Wheat.

**Used with that caveat recorded in `gradeSpecs.js`'s `wheat.agmarkSchedule`
field** rather than silently treating a 1966 table as if it were a 2024
one. If a dedicated Wheat Grading and Marking Rules notification is ever
sourced (DMI's own list only shows "Bread Wheat Flour" / "Wheat Atta" /
"Wheat Porridge" / "Suji and Maida" under Wheat — all processed products,
not raw grain), it should replace this entry.

### Maize: confirmed current, no ambiguity

Unlike Wheat, `Cereals_2001.pdf` rule 1(ii) explicitly includes Maize in its
scope, so Schedule V there is the current standard without caveat.

### Safflower: Kusum seed used as a stand-in, not the real thing

`Kusum_seed_gm_rules2018.pdf` grades **Kusum seed** (*Schleichera oleosa*,
a tree-oilseed sometimes called Ceylon oak / macassar oil tree), not
**Safflower** (*Carthamus tinctorius*, Marathi Karadi) — two different
plants that happen to share a "Kusum" / "Karadi" naming overlap in some
regional usage, which is exactly the kind of near-miss `MH-POP`-style
citation discipline exists to catch. No Safflower-specific AGMARK
notification was in the downloaded set. The Kusum schedule's table shape
(moisture / extraneous matter / damaged-shrivelled-immature / oil content /
acid value) is the standard AGMARK oilseed layout and was used as the best
available proxy — **flagged explicitly** in `gradeSpecs.js` via the
`safflower.agmarkSchedule` comment, not presented as if it were a real
Safflower notification. Given Safflower was not one of the five named
priority crops, this was judged an acceptable placeholder over leaving it
on the fully generic `grain` spec, but it should be the first thing
replaced if a real Safflower Grading and Marking Rules notification turns
up.

### Groundnut: could not source real data at all

This was the highest-priority commodity that ended up with **no real
data**. DMI's own standards listing shows a "Groundnuts" entry under an
"Edible Nuts Grading and Marking Rules" heading — a real, current
notification — but it was not among the PDFs handed to this pass. The two
files whose names suggested groundnut/oilseed coverage were checked and
rejected:

- `Oil seed.pdf` is a Marathi-language **groundnut cultivation guide**
  from Mahatma Phule Krishi Vidyapeeth (sowing, fertilizer, pest
  management) — not a grading document. Confirmed by scanning every page
  for "grade"/"agmark"/"moisture" in the extracted text: zero hits.
- `MSEOGMRules.pdf` and `Englishvegoils.pdf` grade refined/blended
  **vegetable oil products**, not raw oilseed lots — irrelevant to grading
  a farmer's harvested groundnut crop.

Groundnut stays on the generic `grain` fallback in `gradeSpecs.js`.
Getting the actual Edible Nuts Grading and Marking Rules PDF would let it
follow the same path as the nine commodities above.

### Rice.pdf: extraction failure, not a content problem

`pdfinfo` reports 18 pages and no encryption, but `pdfplumber.open(...)
.pages` comes back with **length 0** — pdfplumber silently found no parsed
pages, most likely a malformed xref table or an incremental-update
artifact `pdfplumber`/`pypdf` can't walk (pdfinfo uses poppler's own more
tolerant parser). Not attempted: `qpdf --replace-input Rice.pdf` (or
similar repair/re-linearise pass) to rebuild the xref before re-extracting,
which is the standard fix for this failure mode and should be tried before
falling back to OCR. Rice/Paddy stays on the generic `grain` fallback.

### Green Gram (Moong) and Black Gram (Udid): DONE (second pass)

`Pulses_GM_rules_2019.pdf` Schedule V (Moong whole / Green gram) and
Schedule II (Urd whole / Black gram) are now in `gradeSpecs.js` as
`greenGram` and `blackGram`, extracted with `pdfplumber.extract_tables()`
(both are clean ruled tables, no OCR needed) and confirmed against the
document's own `SCHEDULE-<n>` headings via `pypdf` + a regex scan — the
crop name in each schedule's title line was checked, not assumed from
page order, after Schedule III turned out to be "Urd split (with husk)"
rather than a fourth pulse as page-order alone would have suggested.
Removed from `grain.appliesTo` accordingly.

### Rice (Paddy): confirmed unusable, not just unextractable

`Rice.pdf` was qpdf-repaired (`qpdf --qdf --replace-input`) — its xref
WAS malformed as suspected, and the repair fixed page access (0 → 18
pages readable). But the text layer is still empty (image-only pages), so
it was OCR'd (`pdftoppm -r 300 -gray` + `tesseract -l eng --psm 6`). The
recovered text is the **Rice Grading and Marking Rules, 1939** —
obsolete pre-independence regional varieties (Dehra Dun Basmati,
Saharanpur Basmati Sela, Nellore rice, Sirumani/Red Sirumani) tied to
defunct administrative units ("Madras Presidency", "United Provinces",
"Tanjore and South Arcot Districts"). None of Rice.pdf's six schedules
name a general modern Paddy standard or any Maharashtra-grown variety.
`Cereals_2001.pdf` was checked too — it only covers Ragi/Jowar/Maize/
Barley/Bajra by its own scope clause, no Rice schedule.
`NonBasmatiAromaticRiceGMRulesfinalnotification.pdf` covers only the
aromatic-rice subset, not a general Paddy standard. Rice/Paddy stays on
the `grain` fallback — a real fix needs a current (post-1966) general
Rice/Paddy AGMARK notification, not another pass over what's here.

CONFIRMED VIA WEB SEARCH (2026-08-24), not just this repo's own downloads:
India Code's official government legal repository
(upload.indiacode.nic.in) hosts the same **Rice Grading and Marking
Rules, 1939** as the current-in-force text — i.e. this is not a bad copy
of a newer rule, it appears to genuinely be the newest general Paddy
AGMARK notification still gazetted. Unlike Wheat/Jowar/Bajra/Maize/Pulses,
which all got modernised 2000s-2020s notifications, Paddy's general
grading rule was apparently never replaced. A real fix would need either
(a) confirmation that a newer general Rice/Paddy notification exists
somewhere DMI hasn't surfaced in search results, or (b) accepting the
1939 rule's PRINCIPLE (moisture/foreign-matter/broken-grain tolerances)
without its obsolete variety-specific schedules, which would mean
writing a "general Rice" tier by analogy rather than transcribing a real
schedule — a materially different, lower-confidence kind of entry than
everything else in this file, and not done here without asking first.

### Groundnut: DONE, with a caveat

`hand-picked-selected-groundnuts-(grading-and-marking)-rules,-1982.pdf`
(the real "Edible Nuts" rule DMI's site lists separately, user-sourced).
Schedule I (Bold/Coromandel pods — Maharashtra's actual dominant
variety) has an incomplete General-grade row: `pdfplumber.extract_words()`
recovers only 2 of its 4 tolerance values (Extraneous matter, Immature/
shrivelled) before the row's remaining cells (Damaged/discoloured, Pods
of other varieties, Shelling%, Moisture%) simply don't render as
extractable text — confirmed with a 2× zoomed re-read of the source page
image, not just a flat-text extraction gap. Used Schedule II (Peanuts
variety pods) instead, which is complete and clean, rather than guess
the missing Schedule I cells. `gradeSpecs.js` records this choice
explicitly rather than silently presenting Peanuts-variety criteria as
Bold/Coromandel's. Fixing this properly needs a cleaner copy of
Schedule I, not a repeat of this extraction.

### Safflower: real spec found, replaces the Kusum placeholder

`safflower-seeds-(grading-and-marking)-rules,-1982.pdf` (user-sourced) —
confirmed botanically correct: the rule text names the plant explicitly
as *Carthamus tinctorius Linn*, i.e. actual safflower, unlike the earlier
Kusum-seed placeholder (*Schleichera oleosa*, a different tree oilseed)
used for lack of a better source. This 1982 rule defines only **one**
quality tier (Moisture ≤11%, Foreign matter ≤1%, Damaged/weevilled ≤3%,
Slightly damaged ≤6%, Immature/shrivelled/dead ≤6%) — there is no
official AGMARK B/C tier for safflower seed. `gradeSpecs.js`'s B and C
grades say so explicitly rather than inventing a downgraded tier to fill
the app's usual three-slot shape.

## Grade-tier naming across these notifications

Unlike AGMARK Volume V's fruit-and-veg "Extra Class / Class I / Class II",
every notification in this batch (Pulses 2019, Soyabean 2012, Kusum 2018,
Millets 2024) uses **"Special / Standard / General"**. The two Cereals
notifications (1966 and 2000/2001) instead use **"Grade I / II / III (/
IV)"** — a four-tier system where this app's three-slot A/B/C schema drops
the lowest tier (Grade IV, the bare "sound merchantable condition" floor)
rather than force-fitting four tiers into three. Both mappings are
recorded per-commodity in `gradeSpecs.js` via each grade's `agmarkClass`
field, same convention Volume V already established.

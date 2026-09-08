# Fertilizer recommendation sources

The documents behind every `source: 'mh-verified'` entry in
`../fertilizerRules.js`. Kept here so the citations in `MH_SOURCES` can be
checked without a network round-trip, and so a dead link years from now does
not make a figure unauditable.

Fetched 2026-08-23.

| File | Document | URL |
|---|---|---|
| `MH-POP_cotton_maharashtra.pdf` | Approved Package of Practices for Cotton: Maharashtra State | https://static.vikaspedia.in/media/files_en/agriculture/crop-production/package-of-practices/practices-for-maharastra.pdf |
| `PDKV-2021_recommendations.pdf` | Dr. Panjabrao Deshmukh Krishi Vidyapeeth, Akola — Recommendations 2021 (Vidarbha) | https://www.pdkv.ac.in/Circulars/Recom-2021English.pdf |
| `MPKV-2023_recommendations.pdf` | Mahatma Phule Krishi Vidyapeeth, Rahuri — Recommendations 2023 (western Maharashtra) | https://mpkv.ac.in/Uploads/Research/2023-English_20230913025314.pdf |
| `DAPOLI_agronomy_recommendations.pdf` | Dr. B. S. Konkan Krishi Vidyapeeth, Dapoli — Dept. of Agronomy research recommendations (Konkan) | https://api.dbskkv.org/v1/file/document/Department%20of%20Agronomy.docx1703572262508.pdf/ |
| `DAPOLI_joint_agresco_2021.pdf` | Dapoli — Joint Agresco 2021 recommendations | https://www.dbskkv.org/assets/pdf/recommendations/Joint%20Agresco-2021%20English%20Recommendations%20New%20Final.pdf |
| `VNMKV-2020_recommendations_SCANNED.pdf` | VNMKV Parbhani — Recommended Technologies 2020 (Marathwada) | https://www.vnmkv.ac.in/static/documents/farmers/UniversityRecommdation/Recommended-Technologies_2020.pdf |

## VNMKV is a scan — read it with OCR, not pypdf

`pypdf` extracts **9 characters from its 10 pages**: it is page images, not
text. It was read instead with

```bash
pdftoppm -r 300 -gray -png VNMKV-2020_recommendations_SCANNED.pdf out
for f in out-*.png; do tesseract "$f" "${f%.png}" -l eng --psm 6; done
```

which yields ~17,000 characters and is good enough to read fertilizer tables.
Two figures came from it (soybean, cabbage) and two were deliberately rejected
— see the notes in `MH_SOURCES`. Anyone re-running this should expect OCR noise
in the digits: every figure taken from it was read in context and cross-checked
against the other universities, never lifted from a regex match alone.

## What these documents are, and what they are not

PDKV-2021 and MPKV-2023 are **annual research recommendation bulletins**, not
package-of-practices handbooks. They state a crop's recommended dose of
fertilizer (RDF) in passing, as the baseline a trial was run against. That
makes the figure authoritative and attributable, but it also means coverage is
incidental: a crop appears only if someone ran a trial on it that year. This is
why 27 of 38 crops are still unverified — not because the figure was rejected,
but because these documents never mention them.

MH-POP is a real package of practices, and is the only one of the four that is
a state-approved standing recommendation rather than a research bulletin.


## The one figure that was corrected by a second source

Soybean first went in as **30:75:30**, from PDKV's single mention of "100% RDF".
The VNMKV scan states the RDF as **30:60:30** for Marathwada Inceptisols, and
PDKV itself separately recommends 30:60:30 on Vidarbha Vertisols — two
universities, two different soil orders, the same number. One passing mention
lost to two convergent ones.

Worth noting where that landed: **12:24:12 kg/acre, exactly what the old
`icar-general` entry already had.** The original figure was right and the
intermediate "correction" was not. A single mention in a research bulletin is
weaker evidence than it looks.


## Considered and rejected: ICAR-IISS STCR

`iiss.res.in/old/downloads/stcr Crop wise Recommendations.pdf` — 280 pages,
four decades of Soil Test Crop Response research, with Rahuri (Maharashtra) as
a centre for rice, wheat, maize, pearlmillet, sorghum, ragi, cotton and
sugarcane. Those are exactly the crops still missing here, so it looks like the
answer.

**It is the wrong SHAPE of data.** STCR does not publish a flat recommended
dose. It publishes *fertilizer prescription equations* — `FN = 4.39 T - 1.56 SN`
— that take a soil test value and a yield target and return a dose. Adsali
sugarcane at a 175 t/ha target on mid-range soil comes out at 550:238:178
kg/ha, against MPKV's 400:170:170 standing recommendation, because it is
answering a different question.

This app has neither input. `fertilizerRules.js` says so at the top: `soilType`
is a category, not a lab measurement, and there is no Soil Health Card data.
Picking a middle row out of an STCR table would mean inventing both a soil test
and a yield target and presenting the result as a recommendation.

**NOT worth revisiting: Soil Health Card input is DECLINED** (owner's decision,
2026-08-26 — do not build an SHC upload or form). Kept here only so nobody
re-derives it as a good idea. Were it ever reversed — at that
point STCR becomes the right source rather than the wrong one, and it covers
the crops these bulletins miss.

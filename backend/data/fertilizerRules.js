// Fertilizer data backing the daily task engine's fertilizing touchpoints.
// Three distinct kinds of number here, each defensible for a different
// reason — never blended into one fabricated "just trust me" figure:
//
//   1. Crop-specific N:P:K requirement (kg/acre, or kg/plant/year for trees)
//      — real published agronomic figures for crops we have solid data on.
//      Everything else falls back to a category-level AVERAGE, which is
//      always labeled "general" wherever it's surfaced — never presented
//      with the same confidence as a crop-specific number.
//   2. The touchpoint split (how much of the total dose falls on which of
//      the 4 fertilizing days) — standard agronomic convention: phosphorus
//      is basal-only (it doesn't move through soil), potassium splits
//      basal/later to support fruit-fill, nitrogen splits across all four
//      touchpoints since it leaches and needs topping up.
//   3. Fertilizer product nutrient content (Urea/DAP/MOP percentages) —
//      fixed chemistry, not an estimate, used only to translate a nutrient
//      requirement into a practical "how much of the bag" quantity.
//
// What this deliberately does NOT do: adjust for the farmer's actual soil
// nutrient level. `Land.soilType` (red/black/clay) is a category, not a lab
// measurement — real soil-test-based adjustment needs Soil Health Card data
// this app doesn't have access to for any farmer.

const PRODUCT_NUTRIENT_CONTENT = {
  urea: { label: 'Urea', nutrient: 'n', percent: 0.46 },
  // DAP is 18-46-0 — it supplies BOTH nutrients. `percent` is the P2O5 content
  // (what it is chosen for); `nitrogenPercent` is the N that comes with it,
  // which must be credited against the N requirement rather than ignored.
  dap: { label: 'DAP', nutrient: 'p', percent: 0.46, nitrogenPercent: 0.18 },
  mop: { label: 'MOP (Muriate of Potash)', nutrient: 'k', percent: 0.60 },
};

// kg/acre for field crops, kg/plant/year for perennials (basis: 'plant').
//
// ⚠️ THESE ARE STARTING FIGURES, NOT A PRESCRIPTION. Real dosage depends on
// soil test values, variety, irrigation and season. Every screen that shows a
// number from here must also point the farmer at their Soil Health Card and
// the package of practices from MPKV Rahuri, Dr. PDKV Akola or VNMKV Parbhani.
//
// PROVENANCE IS RECORDED PER CROP, because it differs:
//   'tnau-legacy'  — inherited from the Tamil Nadu build. The agronomy is
//                    sound for the crop, but was selected for TN conditions
//                    and has NOT been checked against a Maharashtra source.
//   'icar-general' — the widely published all-India recommendation for that
//                    crop, converted from kg/ha to kg/acre (divide by 2.47).
//                    Generalises reasonably; still not state-specific.
//   'mh-verified'  — checked against a Maharashtra state university or
//                    state-approved package of practices. The document, the
//                    original kg/ha figure and any disagreement BETWEEN
//                    sources are recorded in MH_SOURCES below. 28 crops.
// The remaining 10 are still legacy (6) or all-India (4). Don't promote one
// without a document — write the citation into MH_SOURCES in the same commit.
// (A machine check worth keeping: every crop with source 'mh-verified' must
// have a key in MH_SOURCES. The two counts are 28 and 28.)
//
// A NOTE ON WHY THIS FILE WAS BROKEN
//   Before this pass the keys used the Tamil Nadu crop names — 'Sorghum
//   (Cholam)', 'Red Gram (Tur)', 'Okra (Ladies Finger)'. Phase A renamed the
//   crop table to Maharashtra names, so 11 keys stopped matching anything and
//   only 13 of 64 crops got a specific recommendation. The rest silently fell
//   through to a category average WITHOUT saying so. Renaming the keys is a
//   correctness fix, not an agronomy change: the figures always described
//   these crops.
const CROP_FERTILIZER = {
  // ── Cereals ──
  'Rice (Paddy)':          { n: 40, p: 20, k: 20, basis: 'area', source: 'mh-verified' },
  Wheat:                   { n: 49, p: 24, k: 16, basis: 'area', source: 'mh-verified' },
  'Jowar (Sorghum)':       { n: 16, p: 8,  k: 8,  basis: 'area', source: 'mh-verified' },
  'Bajra (Pearl Millet)':  { n: 25, p: 12, k: 12, basis: 'area', source: 'mh-verified' },
  Maize:                   { n: 40, p: 20, k: 20, basis: 'area', source: 'mh-verified' },
  'Ragi (Nachani)':        { n: 18, p: 16, k: 8,  basis: 'area', source: 'tnau-legacy' },

  // ── Pulses — low N by design; they fix their own ──
  'Tur (Pigeon Pea)':      { n: 10, p: 20, k: 10, basis: 'area', source: 'mh-verified' },
  'Gram (Harbhara)':       { n: 10, p: 20, k: 12, basis: 'area', source: 'mh-verified' },
  'Green Gram (Moong)':    { n: 8, p: 16, k: 8, basis: 'area', source: 'mh-verified' },
  'Black Gram (Udid)':     { n: 4,  p: 8,  k: 0,  basis: 'area', source: 'tnau-legacy' },

  // ── Oilseeds and fibre ──
  Soyabean:                { n: 12, p: 24, k: 12, basis: 'area', source: 'mh-verified' },
  Cotton:                  { n: 32, p: 16, k: 16, basis: 'area', source: 'mh-verified' },
  Groundnut:               { n: 10, p: 20, k: 16, basis: 'area', source: 'mh-verified' },
  Sunflower:               { n: 20, p: 10, k: 10, basis: 'area', source: 'mh-verified' },
  'Safflower (Karadi)':    { n: 20, p: 10, k: 0,  basis: 'area', source: 'mh-verified' },
  'Sesamum (Til)':         { n: 20, p: 8,  k: 0,  basis: 'area', source: 'mh-verified' },
  'Linseed (Jawas)':       { n: 24, p: 12, k: 0, basis: 'area', source: 'mh-verified' },
  // ── Vegetables ──
  Onion:                   { n: 40, p: 20, k: 20, basis: 'area', source: 'mh-verified' },
  Tomato:                  { n: 80, p: 40, k: 40, basis: 'area', source: 'mh-verified' },
  Potato:                  { n: 40, p: 24, k: 49, basis: 'area', source: 'mh-verified' },
  Brinjal:                 { n: 60, p: 30, k: 30, basis: 'area', source: 'mh-verified' },
  'Okra (Bhendi)':         { n: 40, p: 20, k: 20, basis: 'area', source: 'mh-verified' },
  'Green Chilli':          { n: 61, p: 20, k: 20, basis: 'area', source: 'mh-verified' },
  'Dry Chillies':          { n: 32, p: 16, k: 16, basis: 'area', source: 'tnau-legacy' },
  Cabbage:                 { n: 49, p: 24, k: 24, basis: 'area', source: 'mh-verified' },
  Cauliflower:             { n: 40, p: 20, k: 20, basis: 'area', source: 'icar-general' },
  Carrot:                  { n: 24, p: 16, k: 16, basis: 'area', source: 'tnau-legacy' },

  // ── Spices ──
  'Turmeric (Halad)':      { n: 80, p: 40, k: 40, basis: 'area', source: 'mh-verified' },
  Garlic:                  { n: 40, p: 20, k: 20, basis: 'area', source: 'mh-verified' },
  'Ginger (Aale)':         { n: 48, p: 30, k: 30, basis: 'area', source: 'mh-verified' },

  // ── Perennials — per plant per year, NOT per acre ──
  Sugarcane:               { n: 138, p: 69, k: 69, basis: 'area', source: 'mh-verified' },
  Banana:                  { n: 0.15, p: 0.06, k: 0.15, basis: 'plant', source: 'mh-verified' },
  Coconut:                 { n: 0.5, p: 0.32, k: 1.2, basis: 'plant', source: 'tnau-legacy' },
  'Mango (Alphonso/Hapus)':{ n: 0.5, p: 0.25, k: 0.5, basis: 'plant', source: 'tnau-legacy' },
  Grapes:                  { n: 0.5, p: 0.25, k: 0.6, basis: 'plant', source: 'icar-general' },
  'Pomegranate (Dalimb)':  { n: 0.625, p: 0.25, k: 0.25, basis: 'plant', source: 'mh-verified' },
  'Orange (Nagpur Santra)':{ n: 0.6, p: 0.3,  k: 0.6, basis: 'plant', source: 'icar-general' },
  'Sweet Lime (Mosambi)':  { n: 0.6, p: 0.3,  k: 0.6, basis: 'plant', source: 'icar-general' },
};

// Category-level averages — deliberately coarser than the table above, used
// only as a fallback, and always labeled "general estimate" wherever shown.
// Citations for every `source: 'mh-verified'` entry above.
//
// Figures are quoted here in the units the SOURCE used and converted to this
// file's kg/acre by dividing by 2.471. `kgHa` is kg/ha UNLESS it names its own
// unit (banana is g/plant) — the serving caveat in dailyTaskEngine.js keys off
// the presence of a '/' rather than appending "kg/ha" blindly, which is what
// produced "150:60:150 g/plant kg/ha" on the farmer's screen once already. Keeping
// the original alongside the converted number is the point: a conversion slip
// is invisible once the source figure is gone.
//
// Documents (fetched 2026-08-23):
//   MH-POP    Approved Package of Practices for Cotton: Maharashtra State
//             static.vikaspedia.in/media/files_en/agriculture/crop-production/
//             package-of-practices/practices-for-maharastra.pdf
//   PDKV-2021 Directorate of Research, Dr. Panjabrao Deshmukh Krishi
//             Vidyapeeth, Akola — Recommendations 2021 (Vidarbha)
//             www.pdkv.ac.in/Circulars/Recom-2021English.pdf
//   MPKV-2023 Mahatma Phule Krishi Vidyapeeth, Rahuri — Recommendations 2023
//             (western Maharashtra)
//             mpkv.ac.in/Uploads/Research/2023-English_20230913025314.pdf
//   DAPOLI    Dr. Balasaheb Sawant Konkan Krishi Vidyapeeth, Dapoli —
//             Department of Agronomy research recommendations (Konkan), and
//             Joint Agresco 2021 recommendations
//             api.dbskkv.org/v1/file/document/Department%20of%20Agronomy...pdf
//             www.dbskkv.org/assets/pdf/recommendations/Joint%20Agresco-2021...pdf
//   VNMKV-2020 Vasantrao Naik Marathwada Krishi Vidyapeeth, Parbhani —
//             Recommended Technologies 2020 (Marathwada). A SCANNED pdf:
//             read via pdftoppm 300dpi + tesseract, not pypdf.
//             www.vnmkv.ac.in/static/documents/farmers/UniversityRecommdation/
//             Recommended-Technologies_2020.pdf
//
// ── WHAT WAS LOOKED FOR IN KRISHI DARSHANI AND NOT FOUND ─────────────────
//
// MANGO HAS NO FERTILIZER DOSE IN THIS SOURCE, across all three editions and
// 1,582 pages. The pages that mention आंबा carry an orchard-management
// calendar (when to water, when to spray for stem borer) and one article about
// selling mango-leaf powder — never a nutrient recommendation. It stays
// tnau-legacy. A crop being absent from a handbook is a fact about the
// handbook, not a licence to borrow a number from a neighbouring crop.
//
// THE OTHER NINE UNVERIFIED CROPS WERE NOT SEARCHED AGAIN and that is a
// decision, not an omission: Grapes, Orange, Mosambi and Cauliflower are
// genuinely absent from this source, and the rest have no candidate pages.
// They stay on the category/generic fallback, which says openly that it has
// not been checked.
//
// GROUNDNUT WAS FOUND AND DELIBERATELY NOT TAKEN. Dapoli gives 25:50:00 for
// Konkan lateritic soils. Maharashtra's groundnut belt is western Maharashtra
// (Jalgaon, Dhule, Satara) on entirely different soils, and the Konkan figure
// carries ZERO potassium — dropping K to nil for a crop that responds to it,
// on the strength of a trial run somewhere the crop is barely grown, would be
// worse than the unchecked figure it replaced. Left as tnau-legacy, which at
// least says openly that it has not been checked.
//
// TWO FIGURES IN THE VNMKV SCAN WERE READ AND DELIBERATELY NOT TAKEN:
//   Sorghum "N, P and K each @ 40 kg/ha" — stated alongside an Azotobacter
//     seed treatment. Azotobacter fixes nitrogen, so that is a REDUCED dose
//     that assumes the inoculant, not the standing recommendation. Taking it
//     would under-fertilise every farmer who does not use the biofertilizer.
//   Cotton 150:75:75 — for HIGH DENSITY planting (90x30 cm, 37,037 plants/ha).
//     A different planting system carries a different dose; it does not
//     replace the 80:40:40 for conventional spacing.
//
// WHERE SOURCES DISAGREE, both figures are recorded and the choice is stated.
// They disagree because they are calibrated for different zones and soils —
// that is real agronomy, not an error in one of them. This file can hold only
// one number per crop, so it takes the one matching the dominant Maharashtra
// growing situation and says so.
const MH_SOURCES = {
  'Rice (Paddy)':       { doc: 'PDKV-2021 + DAPOLI', kgHa: '100:50:50', note: 'CONFIRMED TWICE: PDKV for upland irrigated western Vidarbha, Dapoli for North Konkan coastal saline soils at 100% RDF. Dapoli reports 120:50:50 for the rice-RICE system specifically — a second crop in the same year, not a correction.' },
  Wheat:                { doc: 'MPKV-2023', kgHa: '120:60:40', note: 'Plain zone. Matched the previous icar-general figure exactly — independent confirmation, not a change.' },
  'Gram (Harbhara)':    { doc: 'PDKV-2021', kgHa: '25:50:30', note: 'MPKV-2023 gives 25:50:00 for the scarcity zone — K differs because deep vertisols there test K-sufficient. Took the PDKV figure, which includes K, as the safer default for a farmer with no soil test.' },
  'Green Gram (Moong)': { doc: 'PDKV-2021', kgHa: '20:40:20', note: 'Stated as 100% RDF. The old tnau-legacy figure was less than half this and carried no K at all.' },
  Soyabean:             { doc: 'VNMKV-2020 + PDKV-2021', kgHa: '30:60:30', note: 'CORRECTED after OCR of the VNMKV scan. This file first took PDKV\'s single mention of "100% RDF (30:75:30)". VNMKV states the RDF as 30:60:30 for Marathwada Inceptisols, and PDKV independently recommends 30:60:30 on Vidarbha Vertisols — two universities, two different soil orders, same number. One passing mention lost to two convergent ones. Note this lands back on 12:24:12 kg/acre, the same figure the old icar-general entry carried: the original was right and the intermediate "correction" was not. MPKV-2023 gives 50:75:45 for light sub-montane soils, which is a genuinely different situation.' },
  Cotton:               { doc: 'MH-POP', kgHa: '80:40:40', note: 'Rainfed hybrid — the dominant Maharashtra situation. Irrigated hybrid is 100:50:50. ⚠️ The source contradicts ITSELF on rainfed hybrids: the prose says 80:40:40, the table in the same document says 50:25:25. Took the prose. Matched the previous tnau-legacy figure exactly.' },
  'Linseed (Jawas)':    { doc: 'PDKV-2021', kgHa: '60:30:00', note: 'Zinc/boron-deficit soils context, but quoted as the standing RDF.' },
  Onion:                { doc: 'PDKV-2021', kgHa: '100:50:50', note: 'Rabi onion, 100% RDF. Kharif onion is not separately specified.' },
  Cabbage:              { doc: 'VNMKV-2020 + DAPOLI', kgHa: '120:60:60', note: 'CONFIRMED TWICE, independently: VNMKV for Marathwada raised-bed cabbage, and Dapoli for Konkan lateritic soil — "the fertilizer dose of 120:60:60 kg NPK (Urea, SSP, MOP) /ha is also recommended". Two universities, two zones, same number, so this one does not rest on a single reading of a scan.' },
  'Green Chilli':       { doc: 'DAPOLI', kgHa: '150:50:50', note: 'Konkan lateritic soil, cv. Konkan Kirti, stated as "recommended dose (150:50:50, N:P:K) of fertilizer". Nearly DOUBLE the nitrogen of the tnau-legacy figure it replaces. Single source and a single zone — the weakest of the mh-verified entries, kept because a Maharashtra university figure for a crop grown across the state beats an unchecked Tamil Nadu one.' },
  'Okra (Bhendi)':      { doc: 'MPKV-2023 + DAPOLI', kgHa: '100:50:50', note: 'CONFIRMED TWICE: MPKV for medium deep black soils of western Maharashtra, Dapoli for Konkan red ferrogenous soils. Note Dapoli ALSO reports 150:112:75 as "120% RD" under drip with silver mulch and paired-row spacing — a different production system, not a different opinion about the same one.' },
  Sugarcane:            { doc: 'MPKV-2023', kgHa: '340:170:170', note: 'PRESEASONAL, western Maharashtra. Sugarcane RDF varies more by planting season AND zone than any other crop here: MPKV ratoon 250:115:115, adsali 400:170:170; Dapoli 250:125:125 for Konkan under drip. A farmer growing suru or adsali, or farming in Konkan, should not use this number unadjusted.' },
  Banana:               { doc: 'MPKV-2023', kgHa: '150:60:150 g/plant', note: 'Per PLANT, not per hectare — basis is already \'plant\' so no area conversion applies.' },

  // Krishi Darshani (MPKV Rahuri's annual farmer diary/almanac, NOT a
  // research bulletin — a real package-of-practices handbook) OCR-mined,
  // 2024/2025/2026 editions, fetched 2026-08-24. Marathi legacy-font PDFs —
  // pypdf/pdfplumber text extraction is garbled gibberish on this document;
  // read via `pdftoppm -r 200/300 -gray -png` + `tesseract -l mar --psm 6`,
  // then grepped for crop names co-occurring with a real dose sentence
  // ("किलो नत्र") rather than trusted wholesale — OCR digit errors are the
  // single biggest risk here, so every figure below was read in its full
  // sentence context, not lifted from a bare number. UNLIKE the documents
  // above, Krishi Darshani states most field-crop doses in kg PER ACRE
  // directly (एकरी) rather than per hectare — `kgAcreAsPrinted` marks that;
  // where it states per hectare (हेक्टरी) the figure is converted the same
  // way as the other sources, divide by 2.471, and the original is kept.
  'Bajra (Pearl Millet)': { doc: 'Krishi Darshani 2025 & 2026, p.58/p.64', kgAcreAsPrinted: '25:12:12 kg/acre as printed (kharif); 35:18:18 (summer)', note: 'IDENTICAL wording and figures in both the 2025 and 2026 editions — as strong a confirmation as this file has for any crop. The 2024 edition states "60:30:30 kharif / 90:45:45 summer" but labels it प्रति हेक्टरी (per hectare) instead of प्रति एकरी (per acre) — converting 60:30:30 kg/ha by /2.471 gives 24.3:12.1:12.1 kg/acre, matching the other two editions almost exactly. Read as a units label slip in the 2024 print, not a real disagreement. Kharif figure used here; summer bajra needs its own touchpoint if this app ever adds season-aware fertilizing.' },
  'Tur (Pigeon Pea)':   { doc: 'Krishi Darshani 2025, p.92', kgAcreAsPrinted: '10:20 kg/acre as printed (N and P only)', note: 'Sole-crop (सलग तुरीसाठी) basal dose stated as DAP (10 kg N + 20 kg P per acre, i.e. 50 kg DAP/acre) at sowing. This source does NOT mention a potassium figure at all — K here is carried over unverified from the prior icar-general entry, not confirmed by this document. N and P match the pre-existing figure exactly, which is corroboration rather than a change.' },
  'Jowar (Sorghum)':    { doc: 'Krishi Darshani 2026, p.62', kgHa: '40:20:20', note: '⚠️ DISAGREES with the icar-general figure it replaces (32:16:16 kg/acre) by roughly 2×, converted this source\'s 40:20:20 kg/ha comes to ~16:8:8 kg/acre. Explicitly labelled खरीप ज्वारीस (for KHARIF jowar) — Maharashtra grows far more Rabi jowar than Kharif, and this source does not give a separate Rabi figure, so it is possible the prior figure was describing a different season\'s crop rather than being simply wrong. Took the real, MH-specific, explicitly-sourced number over the generic one, but the disagreement is real and unresolved, not smoothed over.' },
  Maize:                { doc: 'Krishi Darshani 2025 & 2026, p.140/p.146', kgAcreAsPrinted: '40:20:20 kg/acre as printed (basal 20:20:20, top-dress +20 N at 30 days)', note: 'IDENTICAL in both the 2025 and 2026 editions. The 2024 edition has a same-shaped figure on a page headed "जायंट बाजरा, बायफ बाजरा" (hybrid Bajra variety names) — likely describes a Bajra hybrid, not Maize, on that page, so it was NOT used to avoid misattributing a Bajra figure as Maize.' },
  'Safflower (Karadi)': { doc: 'Krishi Darshani 2026, p.99', kgAcreAsPrinted: '20:10:0 kg/acre as printed (rainfed); 30:15:0 (irrigated)', note: 'Rainfed figure used — most Maharashtra safflower is grown on residual monsoon moisture, not irrigated. A separate rotation-specific figure (25:12.5 kg/ha under a safflower-gram annual rotation) appears consistently in both the 2024 and 2025 editions — same order of magnitude as this one, loose corroboration.' },

  // ── Krishi Darshani second pass: the nine crops with candidate pages ─────
  //
  // METHOD, AND WHY IT IS MORE THAN GREPPING. The 2024 edition prints most
  // doses PER HECTARE and the 2025/2026 editions print the SAME doses PER
  // ACRE. That gives every figure below a built-in cross-check: the per-ha
  // number divided by 2.471 has to land on the per-acre number. Where a third
  // check was available — the handbook's own translation into fertilizer BAGS
  // — it was worked through as well.
  //
  // ⚠️ THE 2024 EDITION'S OCR HAS A SYSTEMATIC DIGIT CONFUSION: ५↔१ and ५↔७.
  // It read Ginger's nitrogen as "520 kg/ha" (the page says 120), its farmyard
  // manure as "275 to 40 tonnes" (the page says 25 to 40), Turmeric's potash
  // as "500 kg/ha" (the page says 100), and Ginger's phosphorus as 55 (75).
  // EVERY ONE OF THOSE WAS CAUGHT BY THE CONVERSION CHECK, not by reading the
  // text — which is the whole reason the check exists. The two that mattered
  // most were then confirmed by cropping and READING THE PAGE IMAGE.
  //
  // ⚠️ THE 2024 DOSE TABLE (तक्ता क्र. ३, p.245) IS UNUSABLE AND WAS NOT USED.
  // It is a multi-column table of per-hectare doses for many crops at once,
  // and tesseract renders its cells as "(३ [| ५९, |. 2 |" — table structure is
  // exactly what Marathi OCR loses. Every figure below comes from PROSE.
  Sunflower:            { doc: 'Krishi Darshani 2025 & 2026, p.105/p.97', kgAcreAsPrinted: '20:10:10 kg/acre as printed (rainfed); 24:24:24 (irrigated)', note: 'WORD-FOR-WORD IDENTICAL in the 2025 and 2026 editions. RAINFED FIGURE TAKEN, the same choice and the same reason as Safflower above: Maharashtra sunflower is grown in the same drought-prone belt (Solapur, Ahilyanagar, Latur, Dharashiv, Beed) largely on residual moisture, and over-prescribing nitrogen to a farmer who cannot water it is money burnt. An irrigated grower should use 24:24:24 kg/acre. The source also splits the nitrogen — half at sowing with all the P and K, half within one month — and adds 8 kg/acre sulphur on deficient soils, which this file has no field for. The 2024 edition points at its own per-hectare table for this crop and that table is OCR gibberish, so 2024 does NOT corroborate this figure and is not claimed to.' },
  'Sesamum (Til)':      { doc: 'Krishi Darshani 2024, 2025 & 2026, p.100/p.110/p.102', kgAcreAsPrinted: '20 kg N/acre as printed, nitrogen only (2 x 22 kg urea; no P or K stated)', note: '⚠️ NITROGEN ONLY, AND THAT IS THE HONEST EXTENT OF IT. This source gives sesamum farmyard manure or oilcake, nitrogen, and sulphur — and states NO phosphorus and NO potassium figure at all. So P (8 kg/acre) and K (0) are CARRIED OVER UNVERIFIED from the prior tnau-legacy entry and are not confirmed by this document; only the N is. Same shape as the Tur entry above, and it is the weakest mh-verified row in this file for that reason. The N itself is solid: 2024 prints "25 kg N/ha at sowing + 25 kg N/ha after three weeks" = 50 kg N/ha, and 50/2.471 = 20.2 kg/acre, matching the 2025/2026 per-acre text of 22 kg urea twice (44 x 0.46 = 20.2 kg N). That conversion is also what resolves the 2025/2026 line, which OCR renders as the garbled "22 kilo urea 22 nitrogen".' },
  Brinjal:              { doc: 'Krishi Darshani 2024, 2025 & 2026, p.172/p.194/p.187', kgAcreAsPrinted: '60:30:30', note: 'ALL THREE EDITIONS, TWO UNIT SYSTEMS: 2024 prints 150:75:75 kg/ha, 2025 and 2026 both print 60:30:30 per acre, and 150/2.471 = 60.7. Replaces an unchecked Tamil Nadu figure (48:24:24). ⚠️ THE 2025 EDITION CONTRADICTS ITSELF and the 2026 edition FIXES IT, which is worth recording because it shows the conversion slip is real and known: 2025 states the per-acre dose as 60:30:30 but then says "the remaining 75 kg N in two splits" — 75 is half of the per-HECTARE 150, left over from the 2024 text. The 2026 edition says "the remaining 30 kg N", which is half of 60 and correct. The same class of half-converted body text as the Potato bag counts.' },
  'Turmeric (Halad)':   { doc: 'Krishi Darshani 2024, 2025 & 2026, p.199/p.223/p.215', kgAcreAsPrinted: '80:40:40', note: 'ALL THREE EDITIONS, TWO UNIT SYSTEMS: 2024 prints 200:100:100 kg/ha, 2025 and 2026 are word-for-word identical at 80:40:40 per acre, and 200/2.471 = 80.9. ⚠️ THIS IS A 3.3x INCREASE IN NITROGEN over the unchecked Tamil Nadu figure it replaces (24 kg N/acre = 59 kg N/ha), and the old figure was the outlier: 59 kg N/ha is far below any published recommendation for turmeric, which is an eight-to-nine-month crop and a heavy feeder. 200:100:100 kg/ha is MPKV\'s own long-standing published dose. All P and K before planting; N in two equal splits at 6 and 10-12 weeks, at earthing-up. (The 2024 OCR reads the potash split line as "500 kg" where the page says 100 — the ५/१ confusion again, caught by the conversion.)' },
  Garlic:               { doc: 'Krishi Darshani 2025 & 2026, p.212/p.204', kgAcreAsPrinted: '40:20:20', note: 'NOTHING CHANGED, AND THAT IS THE POINT — this is independent confirmation, not a correction, exactly like the Wheat entry above. The previous icar-general figure was 40:20:20 kg/acre and Krishi Darshani prints 40:20:20 kg/acre under the लसूण heading in both editions. Its bag translation supports it: 2.5 bags SSP/acre = 20 kg P2O5, exact. Promoted from icar-general to mh-verified on the strength of a Maharashtra source agreeing with the all-India one. The 2024 edition\'s garlic page was NOT located, so this rests on two editions rather than three. ⚠️ Do not confuse this with the 10:44:44 per-acre line a few lines above it on the same page — that belongs to the crop above garlic, not to garlic.' },
  'Ginger (Aale)':      { doc: 'Krishi Darshani 2024, 2025 & 2026, p.202/p.226/p.217', kgAcreAsPrinted: '48:30:30', note: 'ALL THREE EDITIONS, TWO UNIT SYSTEMS. 2025 and 2026 are identical at 48:30:30 per acre; the 2024 page states it per hectare and 120:75:75 / 2.471 = 48.6:30.4:30.4. ⚠️ THE 2024 PAGE IMAGE WAS CROPPED AND READ DIRECTLY, because its OCR is badly wrong here — tesseract rendered the nitrogen as "520 kg/ha" (absurd on its face) and the phosphorus as 55. The page itself says 120 and 75. This entry is the clearest demonstration in this file of why a figure is never lifted from a regex match: two of its three numbers were wrong in the text layer and both were caught. N is given in three equal splits starting six weeks after planting; all P and K before planting.' },
  Groundnut:            { doc: 'Krishi Darshani 2026, p.90', kgAcreAsPrinted: '10:20 kg/acre as printed (N and P only, basal, 2013 recommendation)', note: 'GROUNDNUT WAS PREVIOUSLY FOUND AND DELIBERATELY NOT TAKEN from Dapoli (see note above this table) because that figure carried zero potassium for a K-responsive crop on the wrong soil type. This source ALSO omits K for the basal dose — K here stays carried over from the old tnau-legacy figure, unverified by this document either. The same page also gives a 2015-recommendation summer/drip-irrigated variant (10:20:0 kg/acre via fertigation in 9 splits, or a 75%-dose option at 7.5:15) for western Maharashtra — a different production system, not used here since this app has no drip/season distinction for groundnut.' },

  // National Horticulture Board (NHB, Govt. of India) "Manuring & Fertilization"
  // bulletins, nhb.gov.in, fetched 2026-08-24. These are national, not
  // Maharashtra-specific, EXCEPT Pomegranate — its table is explicitly
  // credited "(Source: Dept. of Agriculture, Govt. of Maharashtra)" inside
  // the NHB document itself, which is why Pomegranate alone is promoted to
  // 'mh-verified' below while Tomato and Potato stay 'icar-general'.
  'Pomegranate (Dalimb)': { doc: 'NHB Manuring & Fertilization bulletin, citing Dept. of Agriculture, Govt. of Maharashtra', gPlant: '625:250:250 g/plant/year (mature tree, "Above 5" years)', note: 'A REAL MAHARASHTRA GOVERNMENT FIGURE, not a national generalisation — the NHB bulletin itself names its source as the Maharashtra Dept. of Agriculture. Confirms the prior icar-general figure (600:250:250 g/plant) almost exactly — independent corroboration, not a correction. The source ALSO gives a full age-wise schedule (Yr2: FYM 5kg N250g P125g K125g; Yr3: 10kg/500/125/250; Yr4: 20kg/500/125/250; Yr5: 20kg/500/125/250; Above 5: 30-40kg/625/250/250) which this app does not yet use since `CROP_FERTILIZER` has no plant-age dimension — worth adding if age-aware dosing is ever built.' },
  Tomato:               { doc: 'Krishi Darshani 2024 & 2025, p.175/p.197', kgAcreAsPrinted: '80:40:40 kg/acre as printed (straight varieties); 120:60:60 (hybrids)', note: 'SUPERSEDES the NHB national bulletin figure this file previously carried (120:80:50 kg/ha ≈ 49:32:20 kg/acre, kept at icar-general tier precisely because NHB is not Maharashtra-specific). CONFIRMED IN TWO UNIT SYSTEMS: the 2024 edition prints 200:100:100 kg/ha for straight varieties and 300:150:150 for hybrids; the 2025 edition prints 80:40:40 and 120:60:60 per ACRE. 200/2.471 = 80.9 and 300/2.471 = 121.4 — the same recommendation, converted. The BAG arithmetic reconciles in both editions and is what makes this more than a single reading: 2024 gives 12.5 bags SSP/ha (12.5 x 50 x 0.16 = 100 kg P2O5, exact) and 5 bags MOP/ha (150 kg K2O, exact for the hybrid dose); 2025 gives 5 bags SSP/acre (40 kg P2O5, exact) and 2 bags MOP/acre (60 kg K2O, exact for the hybrid). STRAIGHT-VARIETY FIGURE TAKEN. MPKV released the straight varieties smallholders actually grow (Dhanashri, Bhagyashri) and lists them first; prescribing the hybrid dose to a straight-variety grower over-applies nitrogen by 50%, and this file has already shipped one over-application bug (see the DAP note in dailyTaskEngine.js). A hybrid grower should use 120:60:60 kg/acre.' },
  Potato:               { doc: 'Krishi Darshani 2024, 2025 & 2026, p.182/p.204/p.196', kgAcreAsPrinted: '40:24:49', note: 'SUPERSEDES the NHB national figure this file previously carried (135:50:50 kg/ha ≈ 55:20:20 kg/acre, icar-general because NHB does not name Maharashtra for this crop). ALL THREE EDITIONS AGREE, ACROSS TWO UNIT SYSTEMS: 2024 prints 100:60:120 kg/ha, 2025 and 2026 both print 40:24:49 per ACRE, and 100:60:120 / 2.471 = 40.5:24.3:48.6. ⚠️ THE POTASSIUM MORE THAN DOUBLES (20 -> 49 kg/acre) and it is not an OCR artefact: the 2024 edition\'s own bag translation reconciles EXACTLY — 7.5 bags SSP/ha = 60 kg P2O5 and 4 bags MOP/ha = 120 kg K2O. Potato is a heavy potassium feeder and K > P is normal for it. ⚠️ THE 2025/2026 PER-ACRE PAGES CONTRADICT THEMSELVES on the bag counts (they print 1/2 bag urea, 1/2 bag SSP, 1 bag MOP, which delivers roughly 23:4:30 kg/acre — a sixth of the stated phosphorus). MPKV converted the headline N:P:K when they moved to per-acre and did NOT convert the bag counts. The explicit N:P:K triple is taken, the bag line is not; 4 kg P2O5/acre is agronomically absurd for potato. Same shape as the Cotton entry above, where the source contradicts itself and the prose was taken. THE PER-ACRE TRIPLE WAS READ OFF THE PAGE IMAGE, not trusted from OCR — tesseract read the MOP bag count as "9 bags" where the page says "1 bag".' },

  // NOT TAKEN: Nagpur mandarin (Orange) fertigation research reports a
  // 500:150:150 g/plant/year schedule via NRC Citrus, Nagpur/Amravati
  // (multiple ResearchGate-indexed papers, 2015-2017). Close in scale to
  // the standing icar-general figure (600:300:600 g/plant) but is a DRIP
  // FERTIGATION schedule, not a soil-application dose — the two are not
  // directly comparable, and this app has no drip/fertigation distinction
  // for tree crops. Left as icar-general rather than silently swapped.
};

const CATEGORY_FERTILIZER_DEFAULT = {
  cereal: { n: 32, p: 16, k: 12, basis: 'area' },
  pulse: { n: 6, p: 10, k: 4, basis: 'area' },
  oilseed: { n: 12, p: 14, k: 6, basis: 'area' },
  vegetable_fruiting: { n: 36, p: 18, k: 18, basis: 'area' },
  vegetable_leafy_root: { n: 28, p: 16, k: 16, basis: 'area' },
  spice: { n: 20, p: 18, k: 16, basis: 'area' },
  flower: { n: 24, p: 16, k: 12, basis: 'area' },
  plantation_perennial: { n: 0.3, p: 0.15, k: 0.3, basis: 'plant' },
  fruit_tree: { n: 0.3, p: 0.15, k: 0.3, basis: 'plant' },
};

// Fraction of the TOTAL n/p/k dose applied at each of the 4 fertilizing
// touchpoints (same day-fractions dailyTaskEngine already uses to decide
// WHEN a fertilizing task fires: 0.05/0.30/0.55/0.75 of crop duration).
// Phosphorus is 100% basal (immobile in soil); potassium splits basal/
// fruit-fill (supports fruit/grain development); nitrogen splits across
// all four (leaches, needs repeated topping up). Each column sums to 1.0.
const TOUCHPOINT_NUTRIENT_SPLIT = [
  { n: 0.25, p: 1.0, k: 0.5 }, // basal
  { n: 0.35, p: 0.0, k: 0.0 }, // first top-dress
  { n: 0.25, p: 0.0, k: 0.25 }, // pre-flowering top-dress
  { n: 0.15, p: 0.0, k: 0.25 }, // fruit/grain-fill
];

/**
 * The source figure as a farmer should READ it, with its own unit attached.
 *
 * ⚠️ THIS EXISTS BECAUSE THE CAVEAT WAS PRINTING "undefined kg/ha".
 *
 * MH_SOURCES entries carry the figure in the unit their SOURCE used, and there
 * are two shapes:
 *   `kgHa`               the document stated kg per hectare (most sources)
 *   `kgAcreAsPrinted`    the document stated kg per ACRE directly. Krishi
 *                        Darshani's 2025/2026 editions do this for every field
 *                        crop, which is why the field exists at all.
 *
 * The serving caveat in services/dailyTaskEngine.js read `mh.kgHa` and appended
 * "kg/ha" to it. For every Krishi Darshani entry that field is absent, so four
 * crops were telling farmers "(undefined kg/ha from Krishi Darshani ...)" on
 * screen. It is the SAME failure the note above MH_SOURCES already records for
 * banana — "which is what produced '150:60:150 g/plant kg/ha' on the farmer's
 * screen once already" — arriving through the other door.
 *
 * So the unit is decided HERE, beside the data that determines it, rather than
 * by a caller guessing from one field. A figure that names its own unit (banana
 * is 'g/plant') keeps it and gets nothing appended — that is what the '/' test
 * is for, and it is preserved.
 *
 * Returns null when there is no figure at all, so a caller can drop the clause
 * instead of printing an empty bracket.
 */
function sourceFigureLabel(mh) {
  if (!mh) return null;
  // A BARE FIGURE is digits, colons, dots and spaces and nothing else — the
  // only shape it is safe to append a unit to. Anything richer (a second
  // seasonal figure, a parenthetical, a unit of its own) already carries its
  // own words, and appending to the END of that produces
  // "…35:18:18 (summer) kg/acre" or "20 kg N only … kg/acre". Such values state
  // their unit INLINE instead, next to the first figure where it belongs.
  const bare = (v) => /^[\d.:\s]+$/.test(v);
  // THREE shapes, not two. `gPlant` (grams per plant per year) is used for
  // perennials priced per tree — Pomegranate is the one entry on it today, and
  // it was ALSO rendering "undefined kg/ha" before this function existed,
  // because the caller only ever looked at `kgHa`. Missing it a second time is
  // exactly the failure this helper is here to prevent, so every shape is
  // handled and the fallthrough returns null rather than a wrong unit.
  if (mh.gPlant) return bare(mh.gPlant) ? `${mh.gPlant} g/plant` : mh.gPlant;
  if (mh.kgHa) return bare(mh.kgHa) ? `${mh.kgHa} kg/ha` : mh.kgHa;
  // "as printed" is load-bearing wording: it tells a reader the source itself
  // said per acre, so they do not go looking for a conversion that never
  // happened.
  if (mh.kgAcreAsPrinted) {
    return bare(mh.kgAcreAsPrinted)
      ? `${mh.kgAcreAsPrinted} kg/acre as printed`
      : mh.kgAcreAsPrinted;
  }
  return null;
}

function getFertilizerRequirement(cropName, category) {
  if (CROP_FERTILIZER[cropName]) {
    return { ...CROP_FERTILIZER[cropName], isSpecific: true };
  }
  const fallback = CATEGORY_FERTILIZER_DEFAULT[category];
  if (fallback) {
    return { ...fallback, isSpecific: false };
  }
  return { n: 20, p: 12, k: 10, basis: 'area', isSpecific: false };
}

function acresFromAreaField(area) {
  if (!area || area.value == null) return null;
  const conversions = { acres: 1, hectares: 2.471, sqft: 1 / 43560, sqm: 1 / 4046.86 };
  const factor = conversions[area.unit];
  return factor ? area.value * factor : null;
}

module.exports = {
  PRODUCT_NUTRIENT_CONTENT,
  CROP_FERTILIZER,
  CATEGORY_FERTILIZER_DEFAULT,
  TOUCHPOINT_NUTRIENT_SPLIT,
  sourceFigureLabel,
  MH_SOURCES,
  getFertilizerRequirement,
  acresFromAreaField,
};

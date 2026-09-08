// Import MSWC's own published warehouse directory.
//
//   node scripts/importMswcWarehouses.js            fetch live and import
//   node scripts/importMswcWarehouses.js --dry      parse and report, write nothing
//
// Source: Maharashtra State Warehousing Corporation
//   https://mswarehousing.com/aplcsn/Home/display_warehouses
//
// WHAT IS REAL AND WHAT IS NOT — the whole point of this file.
//
//   REAL, from MSWC:  warehouse code and name, district, full postal address,
//                     phone, email, total capacity (MT) and VACANT SPACE (MT).
//
//   ASSUMED by us:    the storage rate. MSWC publishes its tariff as paise PER
//                     BAG per month plus an ad-valorem charge per ₹100 of
//                     material value, varying by commodity and bag weight. That
//                     cannot be reduced to one ₹/tonne/month figure without
//                     inventing it, so every imported record carries
//                     `rateSource: 'assumed'` and H2 must say so wherever it
//                     prices a hold. Ring the godown for the real tariff.
//
//   APPROXIMATED:     coordinates. The directory gives addresses, not lat/lng.
//                     Each warehouse is placed on its TALUKA's anchor town where
//                     we have one, else the district centroid — so distances are
//                     good enough to rank "nearest" and not good enough to
//                     navigate by.
//
// VACANCY IS A DATED SNAPSHOT. `capacityAsOf` records when this ran. A scrape is
// not a feed, and a screen showing these numbers must date them rather than
// imply it just rang the godown.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const axios = require('axios');
const Warehouse = require('../models/Warehouse');
const { MH_DISTRICT_CENTROIDS, MH_DISTRICT_ANCHORS } = require('../data/districtCentroids');
const { resolveDistrict } = require('../services/geoService');

const URL = 'https://mswarehousing.com/aplcsn/Home/display_warehouses';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// A working figure for a plain dry godown, in the same range as the APMC and
// cooperative rates already seeded. Explicitly an assumption — see the header.
const ASSUMED_RATE_PER_TONNE_MONTH = 80;

const stripTags = (s) => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

/** MSWC obfuscates contact emails as name[dot]wh[at]mswc[dot]in. */
function splitContact(cell) {
  const email = (cell.match(/[\w.\-\[\]]+\[at\][\w.\-\[\]]+/) || [''])[0]
    .replace(/\[dot\]/g, '.').replace(/\[at\]/g, '@');
  const phone = (cell.replace(email, '').match(/\d[\d\s]{7,}/) || [''])[0].trim();
  return { phone, email };
}

/**
 * Pull district and taluka out of an MSWC address.
 *
 * Format is "MSWC, <street bits>, <taluka>, <district>, <pincode>." — so the
 * district is the last named field before the pincode.
 *
 * ⚠️ NOT the "Region" column. That is MSWC's own regional office and there are
 * only eight of them: Akkalkot's row says Region "Pune" while the warehouse is
 * in SOLAPUR. Reading region as district collapsed all 202 warehouses into 8
 * districts and would have sent every farmer to the wrong end of the state.
 */
function addressParts(address) {
  const bits = String(address || '')
    .replace(/\.$/, '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !/^\d{5,6}$/.test(x));      // drop the pincode
  return {
    districtText: bits[bits.length - 1] || '',
    talukaText: bits[bits.length - 2] || '',
  };
}

/** Place a warehouse on its taluka's anchor town, else the district centroid. */
function locate(district, addressText) {
  const anchors = MH_DISTRICT_ANCHORS.filter((a) => a.district === district);
  const hay = String(addressText || '').toLowerCase();
  for (const a of anchors) {
    if (a.town && hay.includes(a.town.toLowerCase())) {
      return { lat: a.lat, lng: a.lng, taluka: a.town, precise: true };
    }
  }
  const c = MH_DISTRICT_CENTROIDS.find((d) => d.district === district);
  return c ? { lat: c.lat, lng: c.lng, taluka: '', precise: false } : null;
}

function parse(html) {
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  const out = [];
  for (const r of rows) {
    const cells = (r.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) || []).map(stripTags);
    if (cells.length < 7) continue;
    if (/^sr\.?\s*no/i.test(cells[0])) continue;          // header
    const [, codeName, region, address, contact, total, vacant] = cells;
    if (!codeName) continue;

    // "1101Abd Jadhavwadi" -> code 1101, name "Abd Jadhavwadi"
    const m = codeName.match(/^(\d{3,5})\s*(.*)$/);
    const code = m ? m[1] : '';
    const name = (m ? m[2] : codeName).trim();
    if (!name) continue;

    const capacity = Number(String(total).replace(/[^\d]/g, '')) || null;
    const free = String(vacant).replace(/[^\d]/g, '');
    out.push({
      code, name, region: stripTags(region), address: stripTags(address),
      ...splitContact(contact),
      capacityTonnes: capacity,
      // '' is not 0. A blank vacancy cell means MSWC published nothing, and
      // storing 0 would tell a farmer the godown is full.
      availableTonnes: free === '' ? null : Number(free),
    });
  }
  return out;
}

(async () => {
  const dry = process.argv.includes('--dry');
  const { data: html } = await axios.get(URL, { headers: { 'User-Agent': UA }, timeout: 60000 });
  const rows = parse(html);
  console.log(`fetched ${rows.length} warehouses from MSWC`);
  if (!rows.length) { console.error('❌ parsed nothing — the page layout may have changed'); process.exit(1); }

  await mongoose.connect(process.env.MONGODB_URI);
  const asOf = new Date();
  let created = 0, updated = 0, skipped = 0, unplaced = 0;
  const districts = new Set();

  for (const w of rows) {
    // District from the ADDRESS, not the Region column — see addressParts().
    // Run through the same resolver everything else uses, so renamed districts
    // (Aurangabad → Chhatrapati Sambhajinagar) land on one spelling.
    const { districtText, talukaText } = addressParts(w.address);
    const district = resolveDistrict(districtText)
      || resolveDistrict(talukaText)
      || resolveDistrict(w.region);
    if (!district) { skipped++; continue; }
    const pos = locate(district, `${talukaText} ${w.address}`);
    if (!pos) { skipped++; continue; }
    if (!pos.precise) unplaced++;
    districts.add(district);

    const doc = {
      name: `MSWC ${w.name}`.slice(0, 140),
      operator: 'mswc',
      type: 'godown',
      district,
      taluka: pos.taluka,
      location: { lat: pos.lat, lng: pos.lng },
      // Structured, not only stated in the note below. Every warehouse placed
      // on a district centroid shares that ONE point with every other one in
      // the district, so an API that hands out a one-decimal distance for them
      // is inventing precision. See models/Warehouse.js locationPrecision.
      locationPrecision: pos.precise ? 'taluka' : 'district',
      capacityTonnes: w.capacityTonnes,
      availableTonnes: w.availableTonnes,
      capacityAsOf: asOf,
      ratePerTonnePerMonth: ASSUMED_RATE_PER_TONNE_MONTH,
      rateSource: 'assumed',
      commodities: [],
      // MSWC issues warehouse receipts a bank will mark a lien against, which
      // is what makes pledge finance possible at all.
      pledgeLoan: { available: true, maxPctOfValue: 75, interestPctPerYear: 7 },
      contact: {
        phone: w.phone,
        note: [w.email, w.address].filter(Boolean).join(' · ').slice(0, 300),
      },
      dataSource: 'verified',
      verifiedNote: `MSWC published directory, imported ${asOf.toISOString().slice(0, 10)}. `
        + `Capacity and vacancy are MSWC's own figures on that date. `
        + `Rate is ASSUMED — MSWC's tariff is per bag plus ad-valorem. `
        + `Location approximated to ${pos.precise ? 'taluka' : 'district'} level.`,
      active: true,
    };

    if (dry) { created++; continue; }
    const r = await Warehouse.findOneAndUpdate(
      { name: doc.name, district },
      { $set: doc },
      { upsert: true, rawResult: true, new: true }
    );
    if (r.lastErrorObject && r.lastErrorObject.updatedExisting) updated++; else created++;
  }

  const withVacancy = rows.filter((r) => r.availableTonnes != null).length;
  console.log(`\n${dry ? 'DRY RUN — nothing written' : 'imported'}`);
  console.log(`  created ${created}, updated ${updated}, skipped (no district) ${skipped}`);
  console.log(`  districts covered: ${districts.size}`);
  console.log(`  placed on a taluka town: ${rows.length - skipped - unplaced}, on a district centroid: ${unplaced}`);
  console.log(`  MSWC published vacancy for ${withVacancy}/${rows.length}`);
  if (!dry) {
    console.log(`\n  total active: ${await Warehouse.countDocuments({ active: true })}`);
    console.log(`  verified: ${await Warehouse.countDocuments({ dataSource: 'verified' })}`);
    console.log(`  illustrative: ${await Warehouse.countDocuments({ dataSource: 'seed_illustrative' })}`);
  }
  await mongoose.disconnect();
})();

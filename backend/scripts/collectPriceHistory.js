#!/usr/bin/env node
/**
 * Builds the training dataset for the price-forecast and sell/hold models.
 *
 *   node scripts/collectPriceHistory.js --state=Maharashtra \
 *        --commodities="Onion,Tomato,Soyabean,Paddy(Common)" \
 *        --from=2019-01 --to=2026-08
 *
 * Source: api.agmarknet.gov.in — the same endpoint services/agmarknetService.js
 * already uses. No API key, no registration. Verified serving data back to at
 * least 2018.
 *
 * NOTE the User-Agent below: the API returns 403 to a default axios UA. It
 * must look like a browser, exactly as the main service does.
 *
 * Output: one CSV row per market × date × variety, at
 *   ai-service/data/prices_<state>.csv
 * Resumable — already-collected months are skipped, so a interrupted run can
 * simply be restarted.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const api = axios.create({
  baseURL: 'https://api.agmarknet.gov.in/v1',
  timeout: 45000,
  headers: {
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://agmarknet.gov.in',
    'Referer': 'https://agmarknet.gov.in/',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
});

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : dflt;
};

const STATE       = arg('state', 'Maharashtra');
const COMMODITIES = arg('commodities', 'Paddy(Common),Onion,Tomato').split(',').map((s) => s.trim());
const FROM        = arg('from', '2019-01');
const TO          = arg('to', new Date().toISOString().slice(0, 7));
const OUT_DIR     = arg('out', path.join(__dirname, '..', '..', 'ai-service', 'data'));
const DELAY_MS    = Number(arg('delay', 900));   // be a good citizen

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function monthsBetween(from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const out = [];
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (m = 1, y++) : m++) {
    out.push([y, m]);
  }
  return out;
}

// DD/MM/YYYY → YYYY-MM-DD
const isoDate = (d) => {
  const [dd, mm, yyyy] = String(d).split('/');
  return `${yyyy}-${mm}-${dd}`;
};

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Both states and commodities come from one filters call — same shape
  // services/agmarknetService.js parses (state_data / cmdt_data under .data).
  const { data: raw } = await api.get('/daily-price-arrival/filters');
  const filters = raw?.data;
  if (!filters) { console.error('❌ Agmarknet filters response missing "data"'); process.exit(1); }

  const states = (filters.state_data || []).map((s) => ({ id: s.state_id, name: s.state_name }));
  const state = states.find((s) => String(s.name).toLowerCase() === STATE.toLowerCase());
  if (!state) {
    console.error(`❌ Unknown state "${STATE}".`);
    console.error(`   Available: ${states.map((s) => s.name).sort().join(', ')}`);
    process.exit(1);
  }

  const allCommodities = (filters.cmdt_data || []).map((c) => ({ id: c.cmdt_id, name: c.cmdt_name }));
  const picked = COMMODITIES.map((name) => {
    const c = allCommodities.find((x) => String(x.name).toLowerCase() === name.toLowerCase());
    if (!c) console.warn(`⚠️  commodity not found, skipping: ${name}`);
    return c;
  }).filter(Boolean);

  if (!picked.length) { console.error('❌ No valid commodities.'); process.exit(1); }

  const slug = STATE.toLowerCase().replace(/[^a-z]+/g, '_');
  const outFile = path.join(OUT_DIR, `prices_${slug}.csv`);
  const doneFile = path.join(OUT_DIR, `.done_${slug}.json`);

  const done = fs.existsSync(doneFile) ? JSON.parse(fs.readFileSync(doneFile, 'utf8')) : {};
  if (!fs.existsSync(outFile)) {
    fs.writeFileSync(outFile,
      'date,state,commodity,market,variety,arrivals_tonnes,min_price,max_price,modal_price\n');
  }

  const months = monthsBetween(FROM, TO);
  const total = months.length * picked.length;
  let step = 0, rows = 0, skipped = 0;

  console.log(`📊 ${STATE} (id ${state.id}) · ${picked.length} commodities · ${months.length} months · ${total} requests`);
  console.log(`   → ${outFile}\n`);

  for (const c of picked) {
    for (const [year, month] of months) {
      step++;
      const key = `${c.id}:${year}-${String(month).padStart(2, '0')}`;
      if (done[key]) { skipped++; continue; }

      const tag = `[${String(step).padStart(4)}/${total}] ${c.name} ${year}-${String(month).padStart(2, '0')}`;
      try {
        const { data } = await api.get('/prices-and-arrivals/date-wise/specific-commodity', {
          params: { year, month, includeExcel: false, stateId: state.id, commodityId: c.id },
        });

        const lines = [];
        for (const market of data?.markets || []) {
          for (const day of market.dates || []) {
            for (const v of day.data || []) {
              lines.push([
                isoDate(day.arrivalDate), STATE, c.name, market.marketName,
                v.variety, day.total_arrivals, v.minimumPrice, v.maximumPrice, v.modalPrice,
              ].map(csvCell).join(','));
            }
          }
        }

        if (lines.length) fs.appendFileSync(outFile, lines.join('\n') + '\n');
        rows += lines.length;
        done[key] = lines.length;
        fs.writeFileSync(doneFile, JSON.stringify(done));
        console.log(`${tag}  ${String(lines.length).padStart(5)} rows`);
      } catch (err) {
        // Don't lose a long run to one bad month — record nothing and move on;
        // a re-run will retry it because it never entered the done file.
        console.log(`${tag}  ✗ ${err.response?.status || err.code || err.message}`);
      }
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n🎉 ${rows.toLocaleString()} new rows` + (skipped ? ` · ${skipped} months already had data` : ''));
  console.log(`   ${outFile}`);
  console.log(`   Re-run the same command any time to top up with newer months.`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });

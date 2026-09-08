// A REVIEW WORKSHEET FOR THE MARATHI STRINGS MARKED `// mr-checked`.
//   node scripts/marathiReview.js            → a readable worksheet on stdout
//   node scripts/marathiReview.js --csv      → CSV, for a spreadsheet
//
// ═══ WHAT THIS DOES NOT DO ════════════════════════════════════════════════
//
// ⚠️ IT APPROVES NOTHING AND CHANGES NOTHING. It is read-only and must stay
// read-only.
//
// `mr-checked` means CHECKED BY CLAUDE, NOT BY A NATIVE SPEAKER — the trade
// TERMS were corroborated against 1,582 pages of real MPKV Marathi (Krishi
// Darshani), but nobody has read these sentences for grammar, register or
// whether they sound natural to a farmer in Nashik. See the header of
// src/i18n/strings.js for exactly which terms the corpus could and could not
// settle. When a PERSON confirms a string, change its marker to `// mr-native`
// so the two levels of evidence stay distinguishable.
//
// What it IS for: a native Marathi speaker should not have to scroll a
// 2,900-line source file to do this. This puts every flagged key next to its
// ENGLISH SOURCE — the thing being checked against, which lives hundreds of
// lines away from the Marathi in strings.js — so the review can be done in one
// pass, in a spreadsheet or on paper.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'src', 'i18n', 'strings.js');
const src = fs.readFileSync(FILE, 'utf8');

// The two language blocks. Split on the `mr:` block opener rather than parsing
// the module — this script must run with no build step and no Babel.
const mrAt = src.indexOf('\n  mr: {');
if (mrAt === -1) { console.error('Could not find the mr: block in strings.js'); process.exit(1); }
const enPart = src.slice(0, mrAt);
const mrPart = src.slice(mrAt);

const LINE = /^\s*'([^']+)':\s*(.*)$/;

function parseBlock(text) {
  const out = new Map();
  for (const raw of text.split('\n')) {
    const m = raw.match(LINE);
    if (!m) continue;
    const [, key, rest] = m;
    out.set(key, { raw: rest, flagged: /\bmr-checked\b/.test(rest) });
  }
  return out;
}

const en = parseBlock(enPart);
const mr = parseBlock(mrPart);

// The value, with the trailing comma and any inline comment removed.
// Deliberately simple: this is a worksheet, not a parser, and a value it
// renders oddly is still one a human can read against the file.
function valueOf(rest) {
  let v = rest.replace(/,\s*\/\/.*$/, '').replace(/,\s*$/, '').trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    v = v.slice(1, -1);
  }
  return v.replace(/\\'/g, "'").replace(/\\"/g, '"');
}

const flagged = [...mr.entries()].filter(([, v]) => v.flagged);

// Grouped by namespace: a reviewer checking mandi vocabulary wants the mandi
// screens together, not in source order.
const byNs = new Map();
for (const [key, v] of flagged) {
  const ns = key.includes('.') ? key.split('.')[0] : '(root)';
  if (!byNs.has(ns)) byNs.set(ns, []);
  byNs.get(ns).push({
    key,
    mr: valueOf(v.raw),
    en: en.has(key) ? valueOf(en.get(key).raw) : '(NO ENGLISH SOURCE)',
  });
}

if (process.argv.includes('--csv')) {
  const esc = (x) => `"${String(x).replace(/"/g, '""')}"`;
  console.log('namespace,key,english,marathi_current,marathi_corrected,reviewer_note');
  for (const [ns, rows] of [...byNs].sort()) {
    for (const r of rows) console.log([ns, r.key, r.en, r.mr, '', ''].map(esc).join(','));
  }
  process.exit(0);
}

console.log('');
console.log('='.repeat(78));
console.log('MARATHI REVIEW WORKSHEET  (mr-checked -> mr-native)');
console.log('='.repeat(78));
console.log('');
console.log(`${flagged.length} strings are mr-checked (Claude, not a native speaker), across ${byNs.size} namespaces.`);
console.log(`(${mr.size} Marathi keys in total, so ${Math.round((flagged.length / mr.size) * 100)}% are flagged.)`);
console.log('');
console.log('!! THESE ARE NOT NATIVE-REVIEWED. The trade TERMS were corroborated against');
console.log('   1,582 pages of real MPKV Marathi; the SENTENCES were not read by a person.');
console.log('   Where a term is genuinely uncertain, PLAIN ENGLISH INSIDE THE MARATHI');
console.log('   STRING is a better answer than a confident wrong word — that is a real');
console.log('   option here, not a failure.');
console.log('');
console.log('   When a PERSON confirms a string, change `// mr-checked` to `// mr-native`.');
console.log('   Leave mr-checked on anything they have not read.');
console.log('   Run with --csv for a spreadsheet with blank correction columns.');
console.log('');

// The terms most likely to be wrong, surfaced first so a reviewer with limited
// time knows where to spend it — and so a wrong term is fixed ONCE.
const RISK = [
  ['वजन काटा', 'weighbridge'], ['प्रत', 'grade'], ['आडत', 'commission'],
  ['हमाली', 'loading labour'], ['तारण', 'pledge loan'], ['आवक', 'arrivals'],
  ['फेरी', 'collection run'], ['वाटणी', 'revenue split'], ['उचल', 'advance'],
  ['आगाऊ रक्कम', 'advance'], ['बाजार समिती', 'APMC'], ['चाळ', 'onion storage shed'],
  ['एफपीओ', 'FPO'], ['कोंब', 'sprouting'],
];
const hits = new Map();
for (const [, rows] of byNs) {
  for (const r of rows) {
    for (const [term, gloss] of RISK) {
      if (r.mr.includes(term)) {
        if (!hits.has(term)) hits.set(term, { gloss, n: 0 });
        hits.get(term).n++;
      }
    }
  }
}
if (hits.size) {
  console.log('-'.repeat(78));
  console.log('THE TRADE TERMS THAT CARRY THE MOST RISK, AND HOW OFTEN THEY APPEAR');
  console.log('-'.repeat(78));
  for (const [term, { gloss, n }] of [...hits].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${term.padEnd(16)} ${String(n).padStart(3)} string(s)   - meant as "${gloss}"`);
  }
  console.log('');
  console.log('  If any of these is the wrong word for the Nashik / Marathwada trade, it is');
  console.log('  wrong in every string counted above at once. Settle the TERM first, then');
  console.log('  the strings that use it.');
  console.log('');
}

for (const [ns, rows] of [...byNs].sort()) {
  console.log('-'.repeat(78));
  console.log(`${ns}  (${rows.length})`);
  console.log('-'.repeat(78));
  for (const r of rows) {
    console.log(`  ${r.key}`);
    console.log(`    EN  ${r.en}`);
    console.log(`    MR  ${r.mr}`);
    console.log('');
  }
}
console.log('='.repeat(78));
console.log(`${flagged.length} to review. Nothing in this script changes strings.js.`);
console.log('='.repeat(78));
console.log('');

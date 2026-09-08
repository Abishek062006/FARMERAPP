// services/mandiSaleService.js
//
// Pure helpers for MandiSale. No database, no request — so the money arithmetic
// and the buyer-name normalisation can be tested directly, and so the trust
// ledger (services/trustService.js) can key buyers exactly the same way the
// write path did without importing a route.

// Channels a farmer can have sold through. Duplicated in models/MandiSale.js
// as a schema enum; if one changes the other must.
const CHANNELS = ['apmc', 'trader', 'processor', 'fpo', 'farmgate', 'export', 'other'];

const CHANNEL_LABELS = {
  apmc:     'APMC auction',
  trader:   'Private trader',
  processor:'Processor / mill',
  fpo:      'Through my FPO',
  farmgate: 'Sold at the farm gate',
  export:   'Exporter',
  other:    'Other',
};

/**
 * Normalise a buyer into a rollup key.
 *
 * Two farmers writing "Shri Balaji Traders" and "shri balaji traders " at
 * Lasalgaon must land on the same ledger entry, or the trust score fragments
 * into a dozen single-sale buyers that can never clear a scoring threshold —
 * which is the same as having no ledger at all.
 *
 * THE MARKET IS PART OF THE KEY ON PURPOSE. Trading names repeat across
 * Maharashtra. Merging a Latur trader into a Nashik one because they share a
 * common name would attribute one man's defaults to another. Fragmenting the
 * ledger produces a weak score; merging produces a false accusation — so this
 * errs toward fragmenting, every time.
 */
function buyerKeyFor(name, marketName) {
  const norm = (s) => String(s || '')
    .toLowerCase()
    // Keep Devanagari: buyers get written in Marathi as often as not, and
    // stripping it would collapse every such name to an empty key.
    .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');

  const n = norm(name);
  if (!n) return '';
  return marketName ? `${n}|${normMarket(marketName)}` : n;
}

// Market names carry an interchangeable suffix — "Lasalgaon", "Lasalgaon APMC"
// and "Lasalgaon Mandi" are one market, and left alone they fragment one
// trader's history into three. Stripping the suffix MERGES, so it is only safe
// because these words identify a market type rather than a market: dropping
// them can never fuse two genuinely different places the way dropping part of
// a trader's name could.
//
// Matched as whole TOKENS, not with a \b word boundary: Devanagari characters
// are not word characters in JavaScript regex, so /\bबाजार\b/ never fires and
// the Marathi names would have gone on fragmenting silently.
const MARKET_SUFFIXES = new Set([
  'apmc', 'mandi', 'market', 'bazar', 'bazaar', 'yard', 'samiti',
  'समिती', 'मंडई', 'मंडी', 'बाजार', 'बाजारसमिती', 'कृषी', 'उत्पन्न',
]);

function normMarket(marketName) {
  const tokens = String(marketName || '')
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t && !MARKET_SUFFIXES.has(t));
  // If the name was NOTHING but suffix words ("APMC", "बाजार समिती"), keep the
  // original rather than returning an empty market — an empty key would merge
  // every such record into one bucket, which is the failure this guards against.
  if (!tokens.length) {
    return String(marketName || '').toLowerCase()
      .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim().replace(/\s+/g, '-');
  }
  return tokens.join('-');
}

/** Every deduction added up. */
function totalDeductions(deductions) {
  return round2((deductions || []).reduce((a, d) => a + (Number(d && d.amount) || 0), 0));
}

/** Gross minus every deduction — what the farmer actually took home. */
function netOf(grossAmount, deductions) {
  return round2(Number(grossAmount || 0) - totalDeductions(deductions));
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Clean a client-supplied deduction list.
 *
 * Drops unlabelled and zero rows rather than storing noise, and caps the count
 * so a single sale cannot carry a thousand line items.
 */
function normaliseDeductions(raw, max = 12) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => ({
      label: String((d && d.label) || '').trim().slice(0, 60),
      amount: round2(d && d.amount),
    }))
    .filter((d) => d.label && Number.isFinite(d.amount) && d.amount > 0)
    .slice(0, max);
}

/**
 * Does price × quantity agree with the gross the farmer typed?
 *
 * It often will NOT, and that is fine — slips get rounded, a lot gets weighed
 * short, a rate gets revised at the auction. The slip is the fact, so this
 * never overwrites what the farmer entered. It returns a flag so the API can
 * say "this does not add up, is that right?" and let a person decide.
 *
 * A 2% tolerance covers ordinary rounding without swallowing a misplaced digit.
 */
function reconcileGross(pricePerKg, quantityKg, grossAmount) {
  const implied = round2(Number(pricePerKg || 0) * Number(quantityKg || 0));
  const stated = round2(grossAmount);
  if (!implied) return { implied, stated, mismatch: false, driftPct: 0 };
  const driftPct = Math.round(Math.abs(stated - implied) / implied * 1000) / 10;
  return { implied, stated, mismatch: driftPct > 2, driftPct };
}

/**
 * Days between the sale and the money arriving.
 *
 * Returns null when it has not arrived. NOT zero — an unpaid sale and a sale
 * paid on the day are opposite facts, and collapsing them would report every
 * defaulter as the fastest payer at the market. Every caller must handle null
 * rather than defaulting it.
 */
function daysToPayment(saleDate, receivedOn) {
  if (!saleDate || !receivedOn) return null;
  const ms = new Date(receivedOn).getTime() - new Date(saleDate).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 86400000));
}

module.exports = {
  CHANNELS,
  CHANNEL_LABELS,
  buyerKeyFor,
  totalDeductions,
  netOf,
  normaliseDeductions,
  reconcileGross,
  daysToPayment,
  round2,
};

// services/priceBandService.js
//
// WAS THE FARMER PAID A FAIR PRICE?
//
// The problem statement this app answers is "market linkages and PRICE
// DISCOVERY". Until now the app helped a farmer decide WHEN to sell, and then
// went quiet at the moment the price was actually struck — a farmer could agree
// ₹12/kg for onion on a day the district modal was ₹19 and nothing in the app
// would ever say so.
//
// This puts the agreed rate beside what the district's mandis were paying, on
// the receipt, where both parties see the same figure.
//
// ⚠️ IT REPORTS, IT DOES NOT BLOCK. A price below the band is not fraud and is
// not refused: a farmer may take less for a quick sale, a poor lot, or a buyer
// who pays on the day rather than in three weeks. The band is context for a
// human, in a trade where the farmer has historically had none.
//
// ⚠️ AND IT REFUSES RATHER THAN GUESSING. If Agmarknet has no arrivals for that
// crop in that district that week, `available: false` with a reason — never an
// invented benchmark. Same rule as the yield benchmark and D1's per-commodity
// refusal: a number a farmer might argue with a buyer about has to be real.
const agmarknet = require('./agmarknetService');
const saleWindow = require('./saleWindowService');

// How far either side of the district modal still counts as a normal price.
//
// Chosen, not defaulted: mandi modal prices for the same commodity move several
// percent between markets in one district on one day (grade, arrival time, who
// is buying), so a tight band would flag ordinary trades as underpayment and
// the flag would stop meaning anything. ±8% is wide enough that landing outside
// it is worth a farmer's attention.
const BAND_PCT = 0.08;

// Prices are looked back over a short window rather than demanding the exact
// delivery date: a mandi has no arrivals on a bandh, a Sunday or a festival,
// and "no data" on those days would be a gap in the receipt rather than a fact
// about the price.
const LOOKBACK_DAYS = 7;

/**
 * @returns null when nothing can be said, or a block that ALWAYS carries
 *          `available` so a caller cannot mistake a refusal for a verdict.
 */
async function forOrder({ cropName, district, pricePerKg, at }) {
  if (!cropName || !district || !(pricePerKg > 0)) return null;

  try {
    const [districtId, commodityId] = await Promise.all([
      // ⚠️ TWO ARGUMENTS — (stateId, districtName). Called with one it silently
      // filters against `undefined` and matches NOTHING, so every order came
      // back "no Agmarknet district matched Wardha" for a district that plainly
      // exists. A refusal that is honest in shape can still be wrong in fact.
      agmarknet.resolveDistrictIdByName(agmarknet.DEFAULT_STATE_ID, district).catch(() => null),
      agmarknet.resolveCommodityIdByName(cropName).catch(() => null),
    ]);

    if (!commodityId) {
      return unavailable(`Agmarknet does not list "${cropName}" as a commodity, so there is no `
        + 'mandi rate to compare this sale against.');
    }
    if (!districtId) {
      return unavailable(`No Agmarknet district matched "${district}".`);
    }

    const series = await saleWindow.getDailySeries({
      districtId, commodityId, endDate: at || new Date(), days: LOOKBACK_DAYS,
    });

    if (!series || !series.length) {
      return unavailable(`No ${cropName} arrivals were reported in ${district} in the `
        + `${LOOKBACK_DAYS} days to this sale, so there is nothing to compare it with.`);
    }

    // Arrivals-weighted, exactly as getDailySeries already computes per day —
    // a day with 40 quintals must not sway the benchmark as much as one with
    // 4,000. A plain mean of daily modals is a price nobody paid, the same trap
    // the FPO lot's indicative price documents.
    // ⚠️ THE FIELD IS `modalPrice`, NOT `modal`, AND `arrivals` MAY BE null.
    // Reading the wrong name produced `modal ₹NaN → WITHIN (NaN%)` on a live
    // Solapur tomato order — a benchmark of NaN, on a receipt, which is the
    // same class of defect as the "undefined kg/ha" that once shipped to
    // farmers. Guarded twice: skip unusable rows here, and refuse below if the
    // result is not a finite number.
    let kg = 0, value = 0;
    for (const d of series) {
      const price = Number(d.modalPrice);
      if (!Number.isFinite(price) || price <= 0) continue;
      const w = Number(d.arrivals) > 0 ? Number(d.arrivals) : 1;
      kg += w; value += w * price;
    }
    if (!kg) return unavailable('The reported arrivals carried no usable prices.');

    // Agmarknet quotes ₹ per QUINTAL. The app trades in ₹ per KILO.
    // ⚠️ Comparing the two directly would report every farmer as underpaid by a
    // factor of a hundred — the same class of error as subtracting figures from
    // two different price bases, already recorded for H2.
    const modalPerQuintal = value / kg;
    const modalPerKg = modalPerQuintal / 100;

    // The last gate. A NaN or a nonsense rate must leave as a REFUSAL, never as
    // a number on a document two people may argue over.
    if (!Number.isFinite(modalPerKg) || modalPerKg <= 0) {
      return unavailable('The mandi prices returned for this crop could not be read as a rate.');
    }

    const low = modalPerKg * (1 - BAND_PCT);
    const high = modalPerKg * (1 + BAND_PCT);
    const diffPct = ((pricePerKg - modalPerKg) / modalPerKg) * 100;

    return {
      available: true,
      agreedPerKg: round2(pricePerKg),
      modalPerKg: round2(modalPerKg),
      band: { lowPerKg: round2(low), highPerKg: round2(high), pct: BAND_PCT * 100 },
      verdict: pricePerKg < low ? 'below' : pricePerKg > high ? 'above' : 'within',
      diffPct: Math.round(diffPct * 10) / 10,
      basis: {
        district,
        days: LOOKBACK_DAYS,
        marketDays: series.length,
        source: 'Agmarknet daily modal prices, weighted by arrivals',
      },
      note: 'A price outside this band is not wrong — grade, urgency and who pays on the day all '
        + 'move a real sale. It is shown so both sides see the same benchmark.',
    };
  } catch (err) {
    // Agmarknet 403s, times out and goes down. A receipt must still render.
    return unavailable('Mandi prices could not be reached, so this sale has not been compared.');
  }
}

const unavailable = (reason) => ({ available: false, reason });
const round2 = (n) => Math.round(n * 100) / 100;

module.exports = { forOrder, BAND_PCT, LOOKBACK_DAYS };

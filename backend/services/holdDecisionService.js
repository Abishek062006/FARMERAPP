// services/holdDecisionService.js
//
// H2 — "hold" in rupees.
//
// D2 answers `{action: 'hold', probability: 0.68, confidence: 'medium'}`. That
// is the right question answered in the wrong unit. A farmer deciding whether
// to wait is weighing a possible gain against rent he must pay, crop he will
// lose, and money he needs this week. A probability settles none of that.
//
// This composes what already exists — D1's forecast, D2's action, H1's storage
// rates and spoilage curves — into the only number that decides anything:
//
//     net gain = (surviving kg × forecast price) − (kg × today's price)
//                − storage rent − pledge interest
//
// THREE REFUSAL PATHS, AND THEY MATTER MORE HERE THAN ANYWHERE ELSE.
//   A rupee figure reads as far more certain than a percentage. The same model
//   uncertainty that is tolerable behind "hold" becomes dangerous behind
//   "+₹8,400", because a farmer can act on the second in a way he cannot act
//   on the first. So this refuses when:
//     1. the horizon runs past what D1 was MEASURED on (1–14 days),
//     2. D1 returned nothing for this district/commodity,
//     3. the crop cannot go in the chosen structure at all.
//   And when D2 reports `uncertain`, the number is still shown but flagged —
//   it is not allowed to read as a recommendation.
//
// IT NEVER SAYS "HOLD" WITHOUT SAYING WHAT THAT COSTS TODAY. The pledge
// eligibility is part of the answer, not a footnote: the problem statement's
// own diagnosis is that farmers sell at harvest for liquidity, so advice to
// wait that ignores where this week's money comes from is not advice.

const saleWindow = require('./saleWindowService');
const St = require('./storageService');

// D1's measured range. train_price_forecast.py reports MAPE against a naive
// baseline for 1–14 days; beyond that the model has never been scored, and
// extrapolating a rupee figure off an unmeasured horizon is exactly the kind
// of false confidence this file exists to avoid.
const MAX_MEASURED_HORIZON_DAYS = 14;

// Agmarknet quotes modal price per QUINTAL. Everything farmer-facing in this
// app is per kg. One conversion, in one place.
const perKg = (perQuintal) => (perQuintal == null ? null : perQuintal / 100);

/**
 * Pick the forecast point closest to the requested hold, without ever
 * exceeding the measured range.
 */
function forecastAt(forecast, days) {
  if (!forecast || !Array.isArray(forecast.forecast) || !forecast.forecast.length) return null;
  const usable = forecast.forecast.filter((p) => p.horizon <= MAX_MEASURED_HORIZON_DAYS);
  if (!usable.length) return null;
  return usable.reduce((best, p) =>
    Math.abs(p.horizon - days) < Math.abs(best.horizon - days) ? p : best);
}

/**
 * Price a hold for one storage option.
 *
 * `takeLoan` decides whether pledge interest is charged. Both are computed and
 * returned, because they are different decisions: a farmer who can wait pays
 * no interest, and folding the loan in by default would understate holding.
 */
function priceOne({ commodity, quantityKg, pricePerKg, days, option, futurePricePerKg, spoilageMultiplier = 1 }) {
  const fit = St.suitability(commodity, option.type);
  if (!fit.suitable) return { suitable: false, reason: fit.reason };

  const weekly = St.weeklyLossPct(commodity, option.type) * spoilageMultiplier;
  const survive = Math.pow(1 - weekly / 100, Math.max(0, days) / 7);

  const tonnes = quantityKg / 1000;
  const valueNow = Math.round(quantityKg * pricePerKg);
  const survivingKg = quantityKg * survive;
  const valueLater = Math.round(survivingKg * futurePricePerKg);

  const rent = St.storageCost(option.ratePerTonnePerMonth, tonnes, days);
  const pledge = St.pledgeEligibility(valueNow, option);
  const interestIfBorrowed = St.pledgeInterest(pledge.amount, pledge.interestPctPerYear, days);

  const gainBeforeFinance = valueLater - valueNow - rent;

  return {
    suitable: true,
    reason: null,
    storageName: option.name,
    storageType: option.type,
    // A distance only survives here when the coordinate it came from is a real
    // location. MSWC publishes addresses, so most imported records sit on a
    // taluka town or a district centroid — see storageService.rankByDistance().
    distanceKm: option.distanceKm ?? null,
    locationPrecision: St.coordinatePrecision(option),
    locationApproximate: St.coordinatePrecision(option) !== 'exact',

    weeklyLossPct: Math.round(weekly * 100) / 100,
    expectedLossPct: Math.round((1 - survive) * 1000) / 10,
    survivingKg: Math.round(survivingKg),

    valueNow,
    valueLater,
    storageRent: rent,
    // Two figures, deliberately. Holding without borrowing is the better deal
    // and the one a farmer should see first; the borrowed case is what he
    // actually faces if he cannot wait unfunded.
    netGain: gainBeforeFinance,
    netGainIfBorrowed: gainBeforeFinance - interestIfBorrowed,
    pledge: { ...pledge, interestOverHold: interestIfBorrowed },

    worthIt: gainBeforeFinance > 0,
  };
}

/**
 * The whole answer for one lot.
 *
 * Returns `{ decidable: false, reason }` rather than a number whenever the
 * inputs do not support one. Callers must render the reason — a blank card is
 * worse than an honest refusal.
 */
async function priceTheHold({ commodity, district, quantityKg, pricePerKg, days = 7, warehouses = [] }) {
  if (days > MAX_MEASURED_HORIZON_DAYS) {
    return {
      decidable: false,
      code: 'HORIZON_UNMEASURED',
      reason: `The price model was only measured out to ${MAX_MEASURED_HORIZON_DAYS} days. `
        + `A rupee figure for ${days} days would be a guess wearing a decimal point.`,
      maxDays: MAX_MEASURED_HORIZON_DAYS,
    };
  }

  const window = await saleWindow.getSaleWindow({ commodity, district });
  if (!window) {
    return {
      decidable: false, code: 'UNKNOWN_MARKET',
      reason: `No price history for ${commodity} in ${district}.`,
    };
  }

  const point = forecastAt(window.forecast, days);
  if (!point) {
    return {
      decidable: false, code: 'NO_FORECAST',
      reason: 'The price forecast is not available for this crop and district right now, '
        + 'so holding cannot be priced. The sale-window read below still applies.',
      saleWindow: window,
    };
  }

  // Today's price is the FARMER'S, when they have a real lot. Their realised
  // rate is not the district modal — grade, market and buyer all move it, and
  // a smallholder is routinely below the modal.
  const todayPerKg = pricePerKg || perKg(window.forecast.originPrice);
  if (!todayPerKg) {
    return { decidable: false, code: 'NO_PRICE', reason: 'No current price to compare against.' };
  }

  // ⚠️ THE MODEL CONTRIBUTES A PERCENTAGE, NOT A PRICE.
  //   D1 forecasts the district MODAL price. Comparing the farmer's own rate
  //   against that modal mixes two different bases and manufactures a gain (or
  //   a loss) out of the gap between them. A farmer selling at ₹14 against a
  //   ₹38 district modal came out with a ₹1.96 LAKH "gain" from a forecast that
  //   was predicting a 9% FALL — the number had the wrong sign and three extra
  //   digits, and it looked entirely plausible on screen.
  //   Apply the forecast's relative move to the farmer's own price instead.
  //   The relative move is also what D1 is actually good at: it is trained on
  //   log returns, and its MAPE is measured against a naive persistence
  //   baseline on the same series.
  const futurePricePerKg = todayPerKg * (1 + (point.changePct || 0) / 100);

  // Always include the farm itself. Most farmers will store there whatever the
  // app says, and a comparison that omits it makes every godown look like a
  // pure cost rather than an alternative to a worse option.
  const options = [
    { ...St.ON_FARM, name: 'Keep it at your own farm', distanceKm: 0, pledgeLoan: { available: false } },
    ...warehouses,
  ];

  const priced = options
    .map((o) => ({
      ...priceOne({ commodity, quantityKg, pricePerKg: todayPerKg, days, option: o, futurePricePerKg }),
      warehouseId: o._id || null,
    }))
    .sort((a, b) => (b.netGain ?? -1e12) - (a.netGain ?? -1e12));

  const best = priced.find((p) => p.suitable) || null;

  // Spoilage is the assumption that moves this answer most, so the range is
  // returned beside the figure rather than left to a footnote. Same reasoning
  // as D2's 0.5x/1x/2x holding-cost table.
  const spread = best && St.sensitivity((m) =>
    priceOne({
      commodity, quantityKg, pricePerKg: todayPerKg, days,
      option: options.find((o) => o.name === best.storageName) || options[0],
      futurePricePerKg, spoilageMultiplier: m,
    }).netGain);

  return {
    decidable: true,
    commodity,
    district,
    days,
    horizonUsed: point.horizon,
    quantityKg,
    pricePerKgToday: Math.round(todayPerKg * 100) / 100,
    pricePerKgForecast: Math.round(futurePricePerKg * 100) / 100,
    forecastChangePct: point.changePct,
    // The district modal the model actually forecast, kept separate and
    // labelled. It is NOT the farmer's price and must never be subtracted
    // from one — see the warning above.
    districtModal: {
      todayPerKg: Math.round(perKg(window.forecast.originPrice) * 100) / 100,
      forecastPerKg: Math.round(perKg(point.modalPrice) * 100) / 100,
      note: 'District modal price, the series the model forecasts. Your own rate usually differs.',
    },

    best,
    options: priced,

    // Sensitivity at half and double the assumed spoilage rate.
    netGainRange: spread ? { low: spread.high, base: spread.base, high: spread.low } : null,

    // D2's own verdict travels with the number so a screen can show both. When
    // it is `uncertain` the figure must NOT be presented as a recommendation.
    saleWindow: {
      action: window.action || window.statisticalAction,
      confidence: window.sellHold ? window.sellHold.confidence : null,
      engine: window.engine,
      reason: window.reason || window.statisticalReason,
    },
    modelUncertain: !!(window.sellHold && window.sellHold.confidence === 'uncertain'),

    caveat:
      'Spoilage rates are assumptions anchored to published Maharashtra outcomes, not measurements '
      + 'of your crop or your store. The forecast is a model with a published error rate. '
      + 'Treat this as a comparison between options, not a promise.',
  };
}

module.exports = {
  MAX_MEASURED_HORIZON_DAYS,
  priceTheHold,
  priceOne,
  forecastAt,
  perKg,
};

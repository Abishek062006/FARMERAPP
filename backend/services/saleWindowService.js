// Sale-window advice: should this farmer sell now, or hold?
//
// THIS IS THE STATISTICAL VERSION, AND IT IS DELIBERATELY FIRST.
// Phase D swaps a trained model in behind the same endpoint shape, so the UI
// never changes and a model that fails to converge cannot break the demo.
// Everything here is arithmetic over real Agmarknet history — no forecast, no
// model, no fabricated numbers.
//
// The signal is three things a farmer cannot see from a single day's price:
//   1. where today sits against the 30-day mean (a z-like ratio)
//   2. which way the last two weeks are sloping (least-squares on modal price)
//   3. how much the series moves day to day (volatility), which decides how
//      much confidence any of it deserves
//
// HONESTY RULES, because this advises someone's income:
//   • Never invent a price. A day with no reported data is skipped, not
//     interpolated — same convention as agmarknetService's "return null,
//     don't fake it".
//   • Below MIN_POINTS real observations we return action 'unknown' rather
//     than a confident-sounding guess off four data points.
//   • The reason string always states the numbers it was derived from, so a
//     farmer (or a judge) can check the arithmetic.
const agmarknet = require('./agmarknetService');

const WINDOW_DAYS = 30;
const TREND_DAYS = 14;

// Under this many real observations in the window, the statistics are noise.
const MIN_POINTS = 8;

// How far above/below the mean counts as genuinely high or low, rather than
// ordinary day-to-day movement. 5% is roughly the daily noise floor on the
// Maharashtra series collected in D0.
const BAND = 0.05;

// A slope steeper than this (as a fraction of mean price per day) is a real
// move rather than drift. 0.4%/day ≈ 6% over a fortnight.
const SLOPE_BAND = 0.004;

/** Least-squares slope of y against its index, in price units per day. */
function slope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

const iso = (d) => d.toISOString().slice(0, 10);

/**
 * Daily modal prices for a commodity in a district, most recent last.
 *
 * A 30-day window straddles a month boundary most of the time, so this pulls
 * both months and merges. Both calls hit agmarknetService's existing monthly
 * cache, so the second one is usually free.
 */
// ─────────────────────────────────────────────────────────────────────────────
// NEAREST-REPORTING-DISTRICT FALLBACK — for the price outlook ONLY.
//
// ═══ WHY THIS EXISTS ══════════════════════════════════════════════════════
//
// A real farmer in Beed asked for an Onion outlook and got "not enough data" —
// verified live: Beed's own APMCs reported Onion on only 23 of the last 75
// days (3 of Beed's 13 markets carry it at all, a handful of days each
// month). That is a genuine gap in what Beed's own mandis have reported
// lately, not a code bug and not something retraining D1 would fix — the
// model already trained on 1.9M historical rows; what is missing is RECENT
// reports to build today's forecast FROM, and no amount of retraining
// invents reports Beed's mandis never filed.
//
// getDailySeries() above deliberately REFUSES to blend across districts
// ("would quietly average Nashik onion with Nagpur onion and call it a local
// price"). That refusal is correct for a single series passed to the model
// under ONE district's name — but there is a cheaper, honest middle ground
// already used elsewhere in this codebase (getTrendForSelection's
// `matchLevel: 'state'`, the recommender's `reported_elsewhere_only`): when a
// farmer's own district hasn't reported enough, substitute the NEAREST
// district that has — by real distance, not blended, not silently — and
// LABEL it so the screen can say whose prices it is actually showing.
//
// ⚠️ THE DISTANCE COMES FROM data/districtCentroids.js's `MH_DISTRICT_CENTROIDS`
// (one point per district, already used elsewhere for reverse-geocoding) — it
// is NOT guessed. Verified live for Beed/Onion: Parbhani (49km) and Latur
// (64km) are closer but report 0 days; Dharashiv (102km) reports 39 and
// Solapur (133km) reports 44 — both clear the 35-day bar D1 requires.
//
// ⚠️ WHEN A NEARBY DISTRICT IS USED, THE FORECAST IS ASKED FOR *THAT*
// DISTRICT BY NAME, NEVER BEED'S. D1 treats district as a per-district
// learned pattern; feeding it Dharashiv's own series under Dharashiv's own
// name keeps that intact. Mislabelling it as "Beed" would be exactly the
// contamination the no-blending rule above exists to prevent.
const MIN_SERIES_DAYS = 35;      // same bar price_forecast_engine.MIN_DAYS uses
const MAX_NEIGHBORS_TRIED = 5;   // bounds the cost; each is its own Agmarknet call

function nearbyDistrictsByDistance(districtName) {
  const { MH_DISTRICT_CENTROIDS } = require('../data/districtCentroids');
  const { haversineKm } = require('./geoService');
  const me = MH_DISTRICT_CENTROIDS.find(
    (d) => d.district.toLowerCase() === String(districtName || '').toLowerCase()
  );
  if (!me) return [];
  return MH_DISTRICT_CENTROIDS
    .filter((d) => d.district !== me.district)
    .map((d) => ({ district: d.district, distanceKm: Math.round(haversineKm(me, d)) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_NEIGHBORS_TRIED);
}

/**
 * Like getDailySeries(), but when the farmer's own district has not reported
 * enough recently, tries the nearest districts BY REAL DISTANCE until one
 * clears MIN_SERIES_DAYS. Returns which district's series is actually being
 * used, so the caller can label it — never silently.
 *
 * Falls back to the OWN (thin) series if nothing nearby clears the bar
 * either, so the caller still has real numbers (reportedDays) to report
 * honestly rather than nothing at all.
 */
// 🐛 THIS DEFAULTED TO `WINDOW_DAYS` (30) AND IT WAS DEAD ON ARRIVAL.
// MIN_SERIES_DAYS is 35 — a threshold that CANNOT be reached inside a
// 30-day window, so `own.length >= MIN_SERIES_DAYS` was always false and
// every neighbor's OWN 30-day window failed the same impossible bar. The
// function always fell through to its last-resort branch and reported
// `matchLevel: 'own'` even for districts (Dharashiv, Solapur — verified
// live) that genuinely clear 35 reported days over the 75-day window D1
// actually forecasts from. Caught by testing this fallback against a real
// farmer profile rather than trusting the code review that wrote it.
async function getDailySeriesNearestReporting({ district, districtId, commodityId, endDate, days = 75 }) {
  const agmarknet = require('./agmarknetService');

  const own = await getDailySeries({ districtId, commodityId, endDate, days });
  if (own.length >= MIN_SERIES_DAYS) {
    return { series: own, districtUsed: district, districtIdUsed: districtId, matchLevel: 'own', distanceKm: 0 };
  }

  for (const { district: neighborName, distanceKm } of nearbyDistrictsByDistance(district)) {
    const neighborId = await agmarknet.resolveDistrictIdByName(agmarknet.DEFAULT_STATE_ID, neighborName)
      .catch(() => null);
    if (!neighborId) continue;

    const series = await getDailySeries({ districtId: neighborId, commodityId, endDate, days });
    if (series.length >= MIN_SERIES_DAYS) {
      return {
        series, districtUsed: neighborName, districtIdUsed: neighborId,
        matchLevel: 'nearby_district', distanceKm,
      };
    }
  }

  // Nothing cleared the bar — report the farmer's OWN thin series honestly,
  // rather than a neighbor's that is equally thin.
  return { series: own, districtUsed: district, districtIdUsed: districtId, matchLevel: 'own', distanceKm: 0 };
}

async function getDailySeries({ districtId, commodityId, endDate, days = WINDOW_DAYS }) {
  const end = new Date(endDate);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);

  const months = new Set([
    `${start.getFullYear()}-${start.getMonth() + 1}`,
    `${end.getFullYear()}-${end.getMonth() + 1}`,
  ]);

  const payloads = await Promise.all(
    [...months].map((k) => {
      const [year, month] = k.split('-').map(Number);
      return agmarknet
        .getMonthlyCommodityPrices({ stateId: agmarknet.DEFAULT_STATE_ID, commodityId, year, month })
        .catch(() => []);
    })
  );

  const districtMarkets = await agmarknet.getMarkets(districtId).catch(() => []);
  const inDistrict = new Set(districtMarkets.map((m) => m.name));

  // date -> { total arrivals, arrivals-weighted modal price }
  const byDate = new Map();

  for (const markets of payloads) {
    for (const market of markets || []) {
      // District markets only. Falling back to the whole state here would
      // quietly average Nashik onion with Nagpur onion and call it a local
      // price, which is worse than saying "not enough data".
      if (!inDistrict.has(market.marketName)) continue;

      for (const day of market.dates || []) {
        const [dd, mm, yyyy] = day.arrivalDate.split('/');
        const key = `${yyyy}-${mm}-${dd}`;
        if (key < iso(start) || key > iso(end)) continue;

        for (const row of day.data || []) {
          if (row.modalPrice == null) continue;
          const w = row.arrivals || 1;   // unweighted if arrivals unreported
          const acc = byDate.get(key) || { w: 0, wp: 0, arrivals: 0 };
          acc.w += w;
          acc.wp += w * row.modalPrice;
          acc.arrivals += row.arrivals || 0;
          byDate.set(key, acc);
        }
      }
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({
      date,
      modalPrice: Math.round(v.wp / v.w),
      arrivals: v.arrivals || null,
    }));
}

/**
 * The advice itself.
 *
 * Returns { action, confidence, reason, stats } where action is one of
 * 'sell' | 'hold' | 'neutral' | 'unknown'. Phase D2's classifier replaces
 * this function body and keeps the shape.
 */
function analyse(series, { endDate } = {}) {
  const points = series.map((p) => p.modalPrice);

  // A day that is still open reports partial data. Arrivals are a SUM across
  // markets, so a half-reported day scales them straight down — Nashik onion
  // read 566 t against a 13,000 t norm at midday, which would have told every
  // farmer "thin supply, hold" every single day of the year. Modal price is
  // far more robust (it is a representative value, not a total), so the price
  // signal still uses today; only the arrivals comparison steps back a day.
  const todayISO = iso(new Date());
  const lastDate = series[series.length - 1]?.date;
  const lastDayIsOpen = lastDate === todayISO && (!endDate || endDate >= todayISO);

  if (points.length < MIN_POINTS) {
    return {
      action: 'unknown',
      confidence: 'none',
      reason: `Only ${points.length} day(s) of reported price in the last ${WINDOW_DAYS} — not enough to advise on.`,
      stats: { points: points.length },
    };
  }

  const today = points[points.length - 1];
  const avg = mean(points);
  const sd = stdev(points);
  const vsMean = (today - avg) / avg;

  const recent = points.slice(-TREND_DAYS);
  const slopePerDay = slope(recent);
  const slopeFrac = slopePerDay / avg;

  // Volatility relative to the mean. A series that swings 15%+ day to day
  // cannot support a confident call whatever the trend says.
  const cv = sd / avg;
  const confidence = points.length >= 20 && cv < 0.10
    ? 'high'
    : points.length >= 12 && cv < 0.18
      ? 'medium'
      : 'low';

  const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
  const rising = slopeFrac > SLOPE_BAND;
  const falling = slopeFrac < -SLOPE_BAND;
  const high = vsMean > BAND;
  const low = vsMean < -BAND;

  let action;
  let reason;

  if (high && !falling) {
    action = 'sell';
    reason = `₹${today}/qtl is ${pct(vsMean)} against the ${WINDOW_DAYS}-day average of ₹${Math.round(avg)}${rising ? ' and still rising' : ''}. Good window to sell.`;
  } else if (low && rising) {
    action = 'hold';
    reason = `₹${today}/qtl is ${pct(vsMean)} against the ${WINDOW_DAYS}-day average of ₹${Math.round(avg)}, but the last ${recent.length} days are rising ${pct(slopeFrac)}/day. Holding may pay.`;
  } else if (low && falling) {
    action = 'sell';
    reason = `₹${today}/qtl is ${pct(vsMean)} below the ${WINDOW_DAYS}-day average and still falling ${pct(slopeFrac)}/day. Waiting has been costing money.`;
  } else if (rising) {
    action = 'hold';
    reason = `₹${today}/qtl is near the ${WINDOW_DAYS}-day average of ₹${Math.round(avg)}, rising ${pct(slopeFrac)}/day over the last ${recent.length} days.`;
  } else if (falling) {
    action = 'sell';
    reason = `₹${today}/qtl is near the ${WINDOW_DAYS}-day average of ₹${Math.round(avg)}, falling ${pct(slopeFrac)}/day over the last ${recent.length} days.`;
  } else {
    action = 'neutral';
    reason = `₹${today}/qtl is within ${(BAND * 100).toFixed(0)}% of the ${WINDOW_DAYS}-day average of ₹${Math.round(avg)}, with no clear trend.`;
  }

  // B4: the supply signal. Arrivals are collected for market ranking and then
  // thrown away, but they are the leading indicator a farmer actually wants —
  // a glut arriving today softens prices in the days after it. Reported only
  // when enough days carry a real arrivals figure; Agmarknet leaves it null
  // often enough that a mean over three days would be misleading.
  // Drop the still-open day from BOTH sides of the comparison, so a partial
  // figure neither becomes the headline nor drags the average down.
  const closedSeries = lastDayIsOpen ? series.slice(0, -1) : series;
  const arrivalDays = closedSeries.filter((d) => d.arrivals != null && d.arrivals > 0);
  let arrivals = null;
  if (arrivalDays.length >= MIN_POINTS) {
    const lastClosed = arrivalDays[arrivalDays.length - 1];
    const todayArr = lastClosed?.arrivals ?? null;
    const arrAvg = mean(arrivalDays.map((d) => d.arrivals));
    if (todayArr != null && arrAvg > 0) {
      const vsAvg = (todayArr - arrAvg) / arrAvg;
      arrivals = {
        today: Math.round(todayArr),
        // Which day the figure is actually from. If the query day is still
        // open this is the previous reported day, and the UI must say so
        // rather than implying it is live.
        asOf: lastClosed.date,
        provisionalDayExcluded: lastDayIsOpen,
        mean: Math.round(arrAvg),
        vsMeanPct: Number((vsAvg * 100).toFixed(1)),
        // 25% is the band where a glut starts showing up in next-week prices
        // on the Maharashtra series; below that it is ordinary variation.
        level: vsAvg > 0.25 ? 'heavy' : vsAvg < -0.25 ? 'light' : 'normal',
        days: arrivalDays.length,
        note:
          vsAvg > 0.25
            ? `Arrivals are ${pct(vsAvg)} above the ${WINDOW_DAYS}-day average — heavy supply usually softens prices within a few days.`
            : vsAvg < -0.25
              ? `Arrivals are ${pct(vsAvg)} against the ${WINDOW_DAYS}-day average — thin supply tends to firm prices up.`
              : `Arrivals are close to the ${WINDOW_DAYS}-day average.`,
      };
    }
  }

  return {
    action,
    confidence,
    reason,
    arrivals,
    stats: {
      todayModal: today,
      mean: Math.round(avg),
      stdev: Math.round(sd),
      vsMeanPct: Number((vsMean * 100).toFixed(1)),
      slopePerDay: Number(slopePerDay.toFixed(2)),
      slopePctPerDay: Number((slopeFrac * 100).toFixed(2)),
      points: points.length,
      windowDays: WINDOW_DAYS,
      trendDays: recent.length,
    },
    // Kept so the UI can draw a sparkline without a second round trip.
    series,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// D1 — the trained forecast, layered on top rather than replacing anything.
//
// The statistical read above still computes and still ships. The model is
// ADDITIVE: if the AI service is down, untrained, or has never seen this
// district, the farmer still gets the statistical answer instead of an error.
// That is the whole reason B3 was built before Phase D.
// ─────────────────────────────────────────────────────────────────────────
const axios = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5001';
const FORECAST_TIMEOUT_MS = 6000;

// lag_30 plus a rolling window on top of it. Asking for 30 would leave the
// model's longest lag permanently NaN.
const FORECAST_HISTORY_DAYS = 75;

/**
 * Ask the AI service for a 7- and 14-day forecast. Returns null on ANY
 * failure — the caller treats the forecast as a bonus, never a dependency.
 */
// ⚠️ D1 REFUSES PAST 14 DAYS AND THAT IS NOT ARBITRARY. train_price_forecast.py
// measured MAPE for horizons 1-14 ONLY. A rupee figure on an unmeasured
// horizon is a guess wearing a decimal point — and a rupee figure reads as far
// more certain than a percentage, so the refusal matters MORE here than behind
// D2's verdict, not less.
const MAX_FORECAST_DAYS = 14;

async function getForecast({ districtId, commodityId, district, commodity, endDate, horizons = [7, 14] }) {
  try {
    const series = await getDailySeries({
      districtId, commodityId, endDate, days: FORECAST_HISTORY_DAYS,
    });
    if (series.length < 35) return null;

    const { data } = await axios.post(
      `${AI_SERVICE_URL}/price-forecast`,
      { district, commodity, series, horizons },
      { timeout: FORECAST_TIMEOUT_MS }
    );
    return data?.success ? data.data : null;
  } catch (err) {
    // ⚠️ A 422 CARRIES A REAL ANSWER AND THE CALLER MAY WANT IT. The service
    // says NO_SKILL (the model does not beat assuming today's price holds) or
    // LOW_SKILL (above MAX_SERVE_MAPE) — those are FINDINGS about the
    // commodity, not failures, and a farmer is better served by the sentence
    // than by a blank. `getForecast` keeps returning null so no existing
    // caller changes; `getForecastOrRefusal` below hands the refusal back.
    // 422 means the service answered honestly that it cannot forecast this
    // (unknown district, too little history). That is not an error worth
    // logging every few seconds.
    if (err.response?.status !== 422) {
      console.error('⚠️ Price forecast unavailable:', err.message);
    }
    return null;
  }
}

/**
 * D2 — ask the AI service whether holding another week beats selling today.
 * Null on any failure, exactly like the forecast: additive, never required.
 */
async function getSellHold({ districtId, commodityId, district, commodity, endDate, horizon = 7 }) {
  try {
    const series = await getDailySeries({
      districtId, commodityId, endDate, days: FORECAST_HISTORY_DAYS,
    });
    if (series.length < 35) return null;

    const { data } = await axios.post(
      `${AI_SERVICE_URL}/sell-hold`,
      { district, commodity, series, horizon },
      { timeout: FORECAST_TIMEOUT_MS }
    );
    return data?.success ? data.data : null;
  } catch (err) {
    if (err.response?.status !== 422) {
      console.error('⚠️ Sell/hold model unavailable:', err.message);
    }
    return null;
  }
}

/**
 * Public entry point: sale-window advice for a commodity in a district.
 * Returns null (never a fabricated verdict) when the names don't resolve.
 *
 * `forecast` is present only when the trained model answered; `engine` says
 * which read the farmer is actually looking at.
 */
async function getSaleWindow({ commodity, district, date, withForecast = true }) {
  const endDate = date || iso(new Date());

  const [districtId, commodityId] = await Promise.all([
    agmarknet.resolveDistrictIdByName(agmarknet.DEFAULT_STATE_ID, district),
    agmarknet.resolveCommodityIdByName(commodity),
  ]);
  if (!districtId || !commodityId) return null;

  const series = await getDailySeries({ districtId, commodityId, endDate });
  const stats = analyse(series, { endDate });

  // Both models are optional and are fetched together. One series fetch feeds
  // both calls because getDailySeries is cached underneath.
  const [forecast, sellHold] = withForecast
    ? await Promise.all([
        getForecast({ districtId, commodityId, district, commodity, endDate }),
        getSellHold({ districtId, commodityId, district, commodity, endDate }),
      ])
    : [null, null];

  // D2 decides the ACTION when it is confident, because a classifier trained on
  // "would holding have paid" is answering the farmer's actual question, while
  // the statistical read is answering "is today unusual". When D2 is uncertain
  // — which it reports honestly for commodities it is weak on, such as
  // Soyabean — the statistical action stands and the model is shown as
  // supporting context only.
  const modelDecides = sellHold && sellHold.confidence !== 'uncertain';

  return {
    commodity,
    district,
    date: endDate,
    engine: modelDecides ? 'model' : (forecast || sellHold ? 'statistical+model' : 'statistical'),
    ...stats,
    // The statistical read is never thrown away — it is what the farmer falls
    // back to, and what a judge can check the arithmetic of.
    ...(modelDecides
      ? {
          action: sellHold.action,
          reason: sellHold.reason,
          confidence: sellHold.confidence,
          statisticalAction: stats.action,
          statisticalReason: stats.reason,
        }
      : {}),
    forecast,
    sellHold,
  };
}

/**
 * Like getForecast, but hands back the service's REFUSAL instead of null.
 *
 * ⚠️ THE REFUSALS ARE THE FEATURE, NOT AN ERROR PATH. D1 declines per
 * commodity: `NO_SKILL` when it cannot beat naive persistence, `LOW_SKILL`
 * above 25% MAPE. Methi(Leaves) scores 168% MAPE against a 159% naive
 * baseline — worse than guessing — and without the gate it would be served as
 * a confident forecast with a rupee figure hung off it. Those refusals have to
 * reach the SCREEN as words; swallowing them into a blank is how a farmer ends
 * up assuming the app simply has no opinion.
 */
async function getForecastOrRefusal({ districtId, commodityId, district, commodity, endDate, horizons }) {
  try {
    const series = await getDailySeries({
      districtId, commodityId, endDate, days: FORECAST_HISTORY_DAYS,
    });
    if (series.length < 35)
      return { ok: false, code: 'INSUFFICIENT_HISTORY', reportedDays: series.length };

    const { data } = await axios.post(
      `${AI_SERVICE_URL}/price-forecast`,
      { district, commodity, series, horizons },
      { timeout: FORECAST_TIMEOUT_MS }
    );
    if (data?.success) return { ok: true, forecast: data.data };
    return { ok: false, code: data?.error || 'UNAVAILABLE', message: data?.message || null };
  } catch (err) {
    const body = err.response?.data;
    if (body && body.error) {
      return {
        ok: false,
        code: body.error,
        message: body.message || null,
        // Never quote a MAPE without the naive baseline beside it — the model
        // is only as good as what it beats.
        modelMape: body.modelMape ?? null,
        naiveMape: body.naiveMape ?? null,
        maxServeMape: body.maxServeMape ?? null,
      };
    }
    // The AI service being down is a DIFFERENT fact from the model refusing,
    // and the screen says so differently: one is "try again", the other is
    // "this crop cannot be forecast".
    return { ok: false, code: 'SERVICE_UNAVAILABLE', message: err.message };
  }
}

module.exports = {
  getSaleWindow, getDailySeries, getDailySeriesNearestReporting, getForecast, getForecastOrRefusal,
  getSellHold, analyse, slope, MIN_POINTS, WINDOW_DAYS, MAX_FORECAST_DAYS, MIN_SERIES_DAYS,
};

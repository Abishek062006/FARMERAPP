const express = require('express');
const router  = express.Router();
const CropListing = require('../models/CropListing');
const ListingImage = require('../models/ListingImage');
// Read only, and only to tell a farmer which of their kilograms are spoken
// for — see GET /farmer/:farmerUid.
const Order = require('../models/Order');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const {
  haversineKm, toLatLng, escapeRegex, roundKm,
  resolveDistrict, MH_DISTRICTS,
} = require('../services/geoService');
const { specForCrop, SPEC_VERSION } = require('../data/gradeSpecs');
const axios = require('axios');
const FormData = require('form-data');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5001';

// A listing within this many km of the vendor is "near you". Used as the
// primary sort tier instead of district equality — an audit of live data found
// most stored district strings are neighbourhood names, whereas coordinates
// are reliable. See data/districtCentroids.js.
const NEAR_KM = 25;

// Fields a vendor browsing the market may see. farmerPhone is deliberately
// absent: the old GET / was unauthenticated and handed phone numbers to
// anonymous callers. It is released only once a vendor has an order.
const MARKET_FIELDS =
  '-farmerPhone -vendorUid -vendorName -vendorPhone -vendorCompany -acceptedAt -confirmedAt';

/**
 * GET /api/listings/:id/freshness
 *
 * D3. Runs the lot's EXISTING proof photo past the freshness model — no new
 * upload, because every listing already carries one.
 *
 * Deliberately a separate call rather than folded into the market listing:
 * inference takes ~1s, the market returns 50 rows, and a farmer must not wait
 * on 50 model runs to see the market. It also means a dead AI service costs
 * one missing badge instead of a blank screen.
 */
router.get('/:id/freshness', requireAuth, async (req, res) => {
  try {
    const listing = await CropListing.findById(req.params.id)
      .select('cropName proofImageId').lean();
    if (!listing) return res.status(404).json({ success: false, error: 'Listing not found' });
    if (!listing.proofImageId)
      return res.status(404).json({ success: false, code: 'NO_PHOTO', error: 'This lot has no proof photo' });

    // NOT .lean() — a lean read returns the BSON `Binary` wrapper, and
    // form-data needs a real Node Buffer to stream ("source.on is not a
    // function"). GET /photo/:id above already reads it as a document for the
    // same reason.
    const img = await ListingImage.findById(listing.proofImageId);
    if (!img) return res.status(404).json({ success: false, code: 'NO_PHOTO', error: 'Photo not found' });

    const form = new FormData();
    form.append('photo', img.data, { filename: 'proof.jpg', contentType: img.contentType });
    // The crop name matters: it lets the service refuse BEFORE inferring, for
    // produce it was never trained on. Onion is the case that matters here.
    form.append('crop', listing.cropName || '');

    const { data } = await axios.post(`${AI_SERVICE_URL}/grade-photo`, form, {
      headers: form.getHeaders(),
      timeout: 15000,
      validateStatus: () => true,
    });

    // A 422 is the model answering honestly that it cannot judge this crop —
    // pass it through as a result, not an error, so the UI can show the reason.
    if (data?.success) return res.json({ success: true, freshness: data.data });
    return res.json({ success: false, ...data });
  } catch (err) {
    console.error('⚠️  Freshness check unavailable:', err.message);
    res.status(503).json({
      success: false, code: 'AI_UNAVAILABLE',
      error: 'Freshness checking is offline right now.',
    });
  }
});

/**
 * GET /api/listings/grade-spec?crop=Onion
 * The published criteria for a crop, so the farmer grades against something
 * fixed rather than typing a word, and the buyer can read the same criteria.
 */
router.get('/grade-spec', requireAuth, (req, res) => {
  const spec = specForCrop(req.query.crop);
  res.json({
    success: true,
    spec: {
      ...spec,
      version: SPEC_VERSION,
      // Restated on every response so no client can present a grade as
      // anything more than the farmer's own claim.
      selfDeclared: true,
      disclaimer: spec.generic
        ? 'General criteria — no crop-specific standard is defined for this crop yet. Grades are declared by the farmer and are not independently checked.'
        : 'Grades are declared by the farmer against these criteria and are not independently checked. These are this app\'s definitions, not AGMARK grades.',
    },
  });
});

/**
 * GET /api/listings/districts
 * Canonical district list for the vendor's "search other districts" picker.
 */
router.get('/districts', requireAuth, (req, res) => {
  res.json({ success: true, districts: MH_DISTRICTS });
});


// ─────────────────────────────────────────────────────────────────────────────
// WHAT SIMILAR LOTS ARE ASKING — per crop, across the WHOLE filtered set.
//
// This is the price-discovery half of the farmer's market screen, and the one
// number a farmer cannot get anywhere else: not what the mandi paid, but what
// other farmers on this platform are asking for the same crop right now.
//
// ⚠️ IT IS AN ASKING PRICE AND THE RESPONSE SAYS SO IN WORDS. A live listing
// is an OFFER, not a trade — nobody has agreed to it and some of these lots
// will never sell at the figure on them. Presenting the median of a column of
// asks as "the going rate" would be the same error as reading a mandi modal as
// a farmer's own price (see the H2 entry in CLAUDE.md). `priceBandService`
// answers the realised-price question against Agmarknet arrivals and stays the
// place for that; this answers a different one.
//
// ⚠️ IT IS COMPUTED OVER THE FILTER, NOT OVER THE PAGE. A median of the 60
// nearest lots is a median of the 60 nearest lots, and would move every time
// the buyer scrolled.
// ─────────────────────────────────────────────────────────────────────────────

// Below this, a "range" is two or three people's opinions and printing a
// median over it invites a farmer to price against noise. Same reasoning as
// trustService's MIN_TRADES_TO_SCORE: the count is still reported, the BAND is
// refused.
const MIN_LOTS_FOR_BAND = 4;
const MAX_CROPS_IN_CONTEXT = 12;

function median(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
}

async function buildPriceContext(filter) {
  try {
    // $group, not $near — a geospatial sort is refused inside an aggregation
    // (already recorded in CLAUDE.md). Position is irrelevant here anyway:
    // what other farmers are asking is not a function of where the caller is.
    const groups = await CropListing.aggregate([
      { $match: filter },
      { $group: {
        _id: '$cropName',
        lots: { $sum: 1 },
        prices: { $push: '$pricePerKg' },
        totalKg: { $sum: '$quantityAvailableKg' },
      } },
      { $sort: { lots: -1 } },
      { $limit: MAX_CROPS_IN_CONTEXT },
    ]);

    return {
      basis: 'listings_asking',
      // Never let a screen render this band without the caveat by forgetting
      // to hardcode one of its own.
      note: 'What other farmers are ASKING for this crop on the app right now — '
          + 'these are open offers, not completed sales.',
      minLotsForBand: MIN_LOTS_FOR_BAND,
      crops: groups.map((g) => {
        // A listing with a junk price must not drag a median. Guarded twice,
        // same as the priceCheck NaN fix: unusable rows are skipped, and a
        // non-finite result leaves as a refusal rather than as a number.
        const prices = (g.prices || [])
          .filter((p) => Number.isFinite(p) && p > 0)
          .sort((a, b) => a - b);

        if (prices.length < MIN_LOTS_FOR_BAND) {
          return {
            cropName: g._id,
            lots: g.lots,
            totalKg: g.totalKg,
            available: false,
            reason: 'too_few_lots',
          };
        }
        return {
          cropName: g._id,
          lots: g.lots,
          totalKg: g.totalKg,
          available: true,
          medianPerKg: median(prices),
          minPerKg: prices[0],
          maxPerKg: prices[prices.length - 1],
        };
      }),
    };
  } catch (err) {
    // A price summary must never take the market down with it. Same rule as
    // the receipt's priceCheck: the feed records real lots and has to render
    // whether or not the extra context could be computed.
    console.error('⚠️ price context failed:', err.message);
    return null;
  }
}

/**
 * GET /api/listings/market
 * The Farm Market, as a vendor sees it.
 *
 *   ?q=tomato          crop name search
 *   ?district=Nashik   restrict to one district (omit for all of Maharashtra)
 *   ?lat=&lng=         the vendor's live position, for distance sorting
 *   ?limit=            page size (default 60, max 200)
 *
 * Sorted: within 25 km first, then strictly by distance, then newest.
 *
 * ═══ ⚠️ THE LIMIT USED TO RUN BEFORE THE DISTANCE SORT ════════════════════
 *
 * This was `.find(filter).limit(200)` followed by an in-memory distance sort —
 * so it took 200 listings in NATURAL (insertion) order and ranked those. With
 * 79 listings that was everything and it worked. Measured against live Atlas at
 * 1,159 available listings it was severe:
 *
 *   • the 200 covered 8 of 38 districts with stock
 *   • 30 districts were NEVER reachable — Nashik (39 lots), Pune (38),
 *     Nagpur (37), Kolhapur (37), Amravati (37) …
 *   • so a buyer in Nashik browsing "All Maharashtra" saw ZERO Nashik lots and
 *     a screen full of Washim, while the 39 nearest lots to them did not exist
 *     as far as the app was concerned
 *
 * And the in-memory sort made it look considered. Same defect class as the
 * captain feed (services/dispatchReach.js): SORTING AFTER A LIMIT IS NOT
 * RANKING. The database now does the ordering, so the limit applies to an
 * already-ranked list.
 */
// ⚠️ THE FARMER IS ADMITTED TO THE BUYER'S OWN MARKET FEED, NOT TO A FORK.
//
// A farmer could post a harvest and then had no way to see the market they had
// posted into: not their own lot beside anyone else's, not what the same crop
// is being asked for two talukas away, nothing. For a project whose problem
// statement is PRICE DISCOVERY that is the wrong way round — the person with
// the least price information was the only actor with no market screen.
//
// Reusing this route rather than writing a farmer variant is deliberate. A
// second implementation is a second place for the $near ranking, the honest
// `total`/`shown` split and the unpositioned-lot backfill to drift, and every
// one of those was a real bug here already.
//
// Nothing extra is released by widening the gate: MARKET_FIELDS already strips
// farmerPhone and the whole vendor* block, so a farmer sees exactly what a
// buyer sees — crop, grade, quantity, asking price, district, distance. The
// one thing added is `mine`, which is about the CALLER's own row and cannot
// leak anyone else's data.
router.get('/market', requireAuth, requireRole('vendor', 'farmer'), async (req, res) => {
  try {
    const { q, district } = req.query;

    const filter = { status: 'available', quantityAvailableKg: { $gt: 0 } };
    // escapeRegex: the previous version interpolated raw user input into a
    // $regex, so "(a+)+$" could pin a CPU core.
    if (q && q.trim()) filter.cropName = new RegExp(escapeRegex(q.trim()), 'i');
    if (district && district !== 'all') filter['location.district'] = district;

    // Phase 4, B3 — price/kg RANGE, applied to the SERVER-SIDE filter rather
    // than to the page that comes back. Filtering client-side after `$near`
    // has already picked the nearest `limit` rows would silently under-count
    // a real match sitting outside that page — the same "200 of 1,159 looked
    // like all of it" failure `meta.total` exists to prevent, reached through
    // a new door. Each bound is optional and independent.
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);
    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
      filter.pricePerKg = {};
      if (Number.isFinite(minPrice)) filter.pricePerKg.$gte = minPrice;
      if (Number.isFinite(maxPrice)) filter.pricePerKg.$lte = maxPrice;
    }
    const minKg = Number(req.query.minKg);
    const maxKg = Number(req.query.maxKg);
    if (Number.isFinite(minKg)) filter.quantityAvailableKg.$gte = minKg;
    if (Number.isFinite(maxKg)) filter.quantityAvailableKg.$lte = maxKg;

    // The vendor's live GPS fix beats their stored profile location, which is
    // hardcoded to Chennai for every user by RegisterScreen (fixed in A6;
    // pre-existing rows still carry it until migrateMaharashtra.js is applied).
    const me = toLatLng({ lat: Number(req.query.lat), lng: Number(req.query.lng) })
            || toLatLng(req.profile.location);

    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 60));

    // The TRUE size of the result, counted before any page is taken. The old
    // response reported `rows.length` as `total`, which was the page size — so
    // a buyer looking at 200 of 1,159 lots was told there were 200. A count
    // that silently means "what fitted" is worse than no count.
    const total = await CropListing.countDocuments(filter);

    let rows;
    let ranked = false;
    if (me) {
      // ⚠️ `$near` SORTS IN THE DATABASE, which is the entire point — the limit
      // then applies to an already-ranked list instead of chopping an unsorted
      // one. It also REQUIRES the sort it implies, so it cannot be used inside
      // an aggregation or countDocuments (that is why `total` is its own query
      // above — the rule is already recorded in CLAUDE.md).
      rows = await CropListing.find({
        ...filter,
        geo: { $near: { $geometry: { type: 'Point', coordinates: [me.lng, me.lat] } } },
      }).select(MARKET_FIELDS).limit(limit).lean();
      ranked = true;

      // ── A LISTING WITH NO `geo` IS NOT IN THE INDEX AND `$near` CANNOT SEE
      //    IT. It is unpositioned, not far away, and dropping it would hide a
      //    real farmer's real lot from the whole market with no error. Backfill
      //    covered the rows that predate the field and the harvest route now
      //    writes it, so this should be empty — but "should be" is exactly the
      //    assumption that produced the bug above, so the gap is FILLED and
      //    REPORTED rather than trusted.
      if (rows.length < limit) {
        const seen = new Set(rows.map((r) => String(r._id)));
        const unpositioned = await CropListing.find({
          ...filter,
          $or: [{ geo: { $exists: false } }, { 'geo.coordinates.0': { $exists: false } }],
        }).select(MARKET_FIELDS).sort({ createdAt: -1 }).limit(limit - rows.length).lean();
        for (const r of unpositioned) if (!seen.has(String(r._id))) rows.push(r);
      }
    } else {
      // No position at all: newest first, which is at least a defensible order
      // and is honestly reported as `ranked: false`.
      rows = await CropListing.find(filter)
        .select(MARKET_FIELDS).sort({ createdAt: -1 }).limit(limit).lean();
    }

    for (const r of rows) {
      const p = toLatLng(r.location);
      r.distanceKm = (me && p) ? roundKm(haversineKm(me, p)) : null;
      r.isNear = r.distanceKm != null && r.distanceKm <= NEAR_KM;
      // So a farmer can find their own lot in the feed. Always a boolean, for
      // a buyer too — an absent key would leave a screen inferring it from
      // the uid, which is the sort of client-side identity check this codebase
      // refuses everywhere else.
      r.mine = r.farmerUid === req.firebaseUid;
    }
    // $near already returned these in distance order; this only settles the
    // unpositioned tail, which must sort last rather than crash a comparison.
    rows.sort((a, b) =>
         ((a.distanceKm == null) - (b.distanceKm == null))      // coord-less last, never crash
      || ((a.distanceKm ?? 0) - (b.distanceKm ?? 0))            // nearest first
      || (new Date(b.createdAt) - new Date(a.createdAt)));      // newest first

    res.json({
      success: true,
      listings: rows,
      priceContext: await buildPriceContext(filter),
      meta: {
        // `total` is every lot MATCHING THE FILTER, `shown` is this page.
        // Reporting one number for both is what made 1,159 look like 200.
        total,
        shown: rows.length,
        hasMore: total > rows.length,
        limit,
        ranked,
        near: rows.filter((r) => r.isNear).length,
        nearKm: NEAR_KM,
        origin: me,
        originDistrict: me ? resolveDistrict(null, me) : null,
        note: ranked
          ? null
          : 'We do not know where you are, so these are the newest lots rather than the nearest. '
            + 'Turn location on to sort by distance.',
      },
    });
  } catch (err) {
    console.error('❌ Market fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/listings/photo/:id
 * Serves a harvest proof photo. Public and unauthenticated by design:
 * React Native's <Image source={{uri}}> does not go through the fetch patch
 * in apiAuthInterceptor.js, so an authenticated variant would simply render
 * nothing. The id is an unguessable ObjectId and a crop photo is not
 * sensitive. Mirrors GET /api/schemes/image/:key.
 */
router.get('/photo/:id', async (req, res) => {
  try {
    const img = await ListingImage.findById(req.params.id);
    if (!img) return res.status(404).json({ success: false, message: 'Photo not found' });
    res.set('Content-Type', img.contentType);
    res.set('Cache-Control', 'public, max-age=604800');
    res.send(img.data);
  } catch (err) {
    console.error('❌ Error serving listing photo:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load photo' });
  }
});

/**
 * GET /api/listings/:id  — one listing, for the vendor's detail screen.
 */
router.get('/detail/:id', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const listing = await CropListing.findById(req.params.id).select(MARKET_FIELDS).lean();
    if (!listing || listing.status !== 'available')
      return res.status(404).json({ success: false, error: 'This listing is no longer available' });

    const me = toLatLng({ lat: Number(req.query.lat), lng: Number(req.query.lng) })
            || toLatLng(req.profile.location);
    const p = toLatLng(listing.location);
    listing.distanceKm = (me && p) ? roundKm(haversineKm(me, p)) : null;

    res.json({ success: true, listing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/listings/farmer/:farmerUid — the farmer's own listings.
 * Includes sold_out so they can see what moved.
 */
router.get('/farmer/:farmerUid', requireAuth, async (req, res) => {
  try {
    if (req.params.farmerUid !== req.firebaseUid)
      return res.status(403).json({ success: false, error: 'Not authorized to view these listings' });

    const listings = await CropListing.find({
      farmerUid: req.params.farmerUid,
      status: { $in: ['available', 'sold_out'] },
    }).sort({ createdAt: -1 }).lean();

    // ── WHAT IS SOLD BUT STILL SITTING ON THE FARM ──────────────────────
    //
    // ⚠️ Buying DECREMENTS the listing, and a dispatch that nobody takes does
    // NOT put it back (see sweepExpired() in routes/orders.js — the purchase is
    // final, only the dispatch lapsed). So those kilograms leave `quantityKg`
    // and appear nowhere else on the farmer's listing at all: the farmer sees
    // 600 kg where they had 1,000 and no explanation of where 400 went.
    //
    // That was survivable while the dispatch window was five minutes. It is
    // not now that it is FOUR HOURS (services/dispatchWindow.js) — the same
    // change that gives a real captain time to answer also means a farmer can
    // have a quarter of their harvest invisible for half a day. Widening the
    // window without showing this would have been trading the farmer's
    // visibility for the buyer's match rate without telling them.
    //
    // `no_agents` is counted with a separate `stuck` figure because it is a
    // different fact: `awaiting_agent` is a wait, `no_agents` is a wait that
    // has ALREADY FAILED and needs the buyer to retry or cancel.
    const ids = listings.map((l) => l._id);
    const held = ids.length ? await Order.aggregate([
      { $match: { listingId: { $in: ids }, status: { $in: ['awaiting_agent', 'no_agents', 'accepted'] } } },
      { $group: {
        _id: { listingId: '$listingId', status: '$status' },
        kg: { $sum: '$quantityKg' },
        orders: { $sum: 1 },
      } },
    ]) : [];

    const byListing = new Map();
    for (const row of held) {
      const key = String(row._id.listingId);
      const e = byListing.get(key) || { waitingKg: 0, stuckKg: 0, comingKg: 0, orders: 0 };
      if (row._id.status === 'awaiting_agent') e.waitingKg += row.kg;
      else if (row._id.status === 'no_agents') e.stuckKg += row.kg;
      else e.comingKg += row.kg;
      e.orders += row.orders;
      byListing.set(key, e);
    }
    for (const l of listings) {
      const e = byListing.get(String(l._id));
      // Absent, not zeroed — a listing with nothing outstanding renders no
      // panel at all rather than a row of zeros claiming to report something.
      l.committed = e ? { ...e, totalKg: e.waitingKg + e.stuckKg + e.comingKg } : null;
    }

    res.json({ success: true, listings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/listings/:id/withdraw — farmer pulls a listing off the market.
 * Guarded on status so it cannot race a purchase: once an order exists the
 * remaining stock is still withdrawable, but the sold portion is not affected.
 */
router.put('/:id/withdraw', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const listing = await CropListing.findOneAndUpdate(
      { _id: req.params.id, farmerUid: req.firebaseUid, status: 'available' },
      { $set: { status: 'withdrawn' } },
      { new: true }
    );
    if (!listing)
      return res.status(409).json({ success: false, error: 'This listing is not yours, or is no longer on the market' });

    res.json({ success: true, listing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

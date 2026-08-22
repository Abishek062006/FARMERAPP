const express = require('express');
const router  = express.Router();
const CropListing = require('../models/CropListing');
const ListingImage = require('../models/ListingImage');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const {
  haversineKm, toLatLng, escapeRegex, roundKm,
  resolveDistrict, TN_DISTRICTS,
} = require('../services/geoService');

// A listing within this many km of the vendor is "near you". Used as the
// primary sort tier instead of district equality — an audit of live data found
// most stored district strings are neighbourhood names, whereas coordinates
// are reliable. See data/tnDistrictCentroids.js.
const NEAR_KM = 25;

// Fields a vendor browsing the market may see. farmerPhone is deliberately
// absent: the old GET / was unauthenticated and handed phone numbers to
// anonymous callers. It is released only once a vendor has an order.
const MARKET_FIELDS =
  '-farmerPhone -vendorUid -vendorName -vendorPhone -vendorCompany -acceptedAt -confirmedAt';

/**
 * GET /api/listings/districts
 * Canonical district list for the vendor's "search other districts" picker.
 */
router.get('/districts', requireAuth, (req, res) => {
  res.json({ success: true, districts: TN_DISTRICTS });
});

/**
 * GET /api/listings/market
 * The Farm Market, as a vendor sees it.
 *
 *   ?q=tomato          crop name search
 *   ?district=Madurai  restrict to one district (omit for all of Tamil Nadu)
 *   ?lat=&lng=         the vendor's live position, for distance sorting
 *
 * Sorted: within 25 km first, then strictly by distance, then newest.
 */
router.get('/market', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const { q, district } = req.query;

    const filter = { status: 'available', quantityAvailableKg: { $gt: 0 } };
    // escapeRegex: the previous version interpolated raw user input into a
    // $regex, so "(a+)+$" could pin a CPU core.
    if (q && q.trim()) filter.cropName = new RegExp(escapeRegex(q.trim()), 'i');
    if (district && district !== 'all') filter['location.district'] = district;

    const rows = await CropListing.find(filter).select(MARKET_FIELDS).limit(200).lean();

    // The vendor's live GPS fix beats their stored profile location, which is
    // hardcoded to Chennai for every user by RegisterScreen.
    const me = toLatLng({ lat: Number(req.query.lat), lng: Number(req.query.lng) })
            || toLatLng(req.profile.location);

    for (const r of rows) {
      const p = toLatLng(r.location);
      r.distanceKm = (me && p) ? roundKm(haversineKm(me, p)) : null;
      r.isNear = r.distanceKm != null && r.distanceKm <= NEAR_KM;
    }

    rows.sort((a, b) =>
         (b.isNear - a.isNear)                                  // within 25 km first
      || ((a.distanceKm == null) - (b.distanceKm == null))      // coord-less last, never crash
      || ((a.distanceKm ?? 0) - (b.distanceKm ?? 0))            // nearest first
      || (new Date(b.createdAt) - new Date(a.createdAt)));      // newest first

    res.json({
      success: true,
      listings: rows,
      meta: {
        total: rows.length,
        near: rows.filter((r) => r.isNear).length,
        nearKm: NEAR_KM,
        origin: me,
        originDistrict: me ? resolveDistrict(null, me) : null,
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

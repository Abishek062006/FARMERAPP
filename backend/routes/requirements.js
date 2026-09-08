const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Requirement = require('../models/Requirement');
const CropListing = require('../models/CropListing');
const Land = require('../models/Land');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { toLatLng, haversineKm, roundKm, resolveDistrict } = require('../services/geoService');
const { specForCrop } = require('../data/gradeSpecs');

// How long a want stays live before it lapses. A buyer's need is dated — one
// posted six weeks ago is noise, and a farmer harvesting for a stale
// requirement wastes real work.
const REQUIREMENT_WINDOW_DAYS = 21;

// Lapse on read, as everywhere else in this codebase. No scheduler exists and
// adding one for this would be infrastructure bought for a single feature.
async function sweepExpired() {
  await Requirement.updateMany(
    { status: 'open', expiresAt: { $lt: new Date() } },
    { $set: { status: 'expired', closedAt: new Date() } }
  );
}

const GRADE_RANK = { A: 3, B: 2, C: 1 };

/** Does a listing's grade clear the buyer's minimum? No grade = unknown, allowed. */
function gradeClears(listingGrade, minGrade) {
  if (!minGrade) return true;
  if (!listingGrade) return true;           // ungraded is not disqualified
  return (GRADE_RANK[listingGrade] || 0) >= (GRADE_RANK[minGrade] || 0);
}

/**
 * POST /api/requirements — a buyer advertises what they want.
 */
router.post('/', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const {
      commodity, quantityKg, minGrade, priceMin, priceMax,
      deliverBy, deliveryPoint, radiusKm, notes,
    } = req.body;

    if (!commodity || !String(commodity).trim())
      return res.status(400).json({ success: false, error: 'What crop do you need?' });

    const qty = Number(quantityKg);
    if (!Number.isFinite(qty) || qty <= 0)
      return res.status(400).json({ success: false, error: 'How much do you need?' });

    const point = toLatLng(deliveryPoint);
    if (!point)
      return res.status(400).json({ success: false, error: 'Choose where it should be delivered' });

    if (minGrade && !['A', 'B', 'C'].includes(minGrade))
      return res.status(400).json({ success: false, error: 'minGrade must be A, B or C' });

    const lo = priceMin == null ? null : Number(priceMin);
    const hi = priceMax == null ? null : Number(priceMax);
    if (lo != null && hi != null && lo > hi)
      return res.status(400).json({ success: false, error: 'The minimum price is above the maximum' });

    const buyer = await User.findOne({ firebaseUid: req.firebaseUid })
      .select('verification.status business.tradeName').lean();

    const requirement = await Requirement.create({
      vendorUid: req.firebaseUid,
      vendorName: req.profile.name,
      vendorCompany: buyer?.business?.tradeName || req.profile.name,
      vendorPhone: req.profile.phone,
      vendorVerification: buyer?.verification?.status || 'unverified',
      commodity: String(commodity).trim(),
      quantityKg: qty,
      minGrade: minGrade || null,
      priceMin: Number.isFinite(lo) ? lo : null,
      priceMax: Number.isFinite(hi) ? hi : null,
      deliverBy: deliverBy ? new Date(deliverBy) : null,
      deliveryPoint: {
        ...point,
        label: deliveryPoint.label || '',
        district: deliveryPoint.district || resolveDistrict(null, point) || '',
      },
      radiusKm: Number(radiusKm) || 50,
      notes: String(notes || '').slice(0, 500),
      expiresAt: new Date(Date.now() + REQUIREMENT_WINDOW_DAYS * 86400000),
    });

    console.log(`📣 Requirement ${requirement._id}: ${req.profile.name} wants ${qty}kg ${commodity} within ${requirement.radiusKm}km of ${requirement.deliveryPoint.district}`);
    res.status(201).json({ success: true, requirement });
  } catch (err) {
    console.error('❌ Create requirement error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/requirements/vendor/mine — the buyer's own wants, with responses. */
router.get('/vendor/mine', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    await sweepExpired();
    const filter = { vendorUid: req.firebaseUid };
    if (req.query.open === '1') filter.status = 'open';
    const requirements = await Requirement.find(filter)
      .sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, requirements });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Buyers whose want is within reach of a set of farm/listing points — the
 * COMMODITY + PROXIMITY half of "buyers looking for your crop". Shared by
 * /for-farmer (one farmer's own points) and the FPO dashboard (F2, a whole
 * group's pooled points), so neither reimplements the matching rule.
 *
 * Grade/per-listing eligibility is layered on by the CALLER — that half is
 * about whose OWN lots clear the bar, which only makes sense for one farmer
 * at a time. `responses` is left on each match; callers that must not expose
 * who else responded (every farmer-facing screen) strip it before sending.
 */
async function matchRequirementsForPoints(points, crops, { limit = 200, allCommodities = false } = {}) {
  await sweepExpired();
  if (!points || !points.length) return [];

  const filter = { status: 'open' };
  if (!allCommodities && crops && crops.length) filter.commodity = { $in: crops };

  const open = await Requirement.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

  const matched = [];
  for (const r of open) {
    const rp = toLatLng(r.deliveryPoint);
    if (!rp) continue;

    // Nearest of the caller's points to the buyer's delivery point.
    let best = Infinity;
    for (const p of points) best = Math.min(best, haversineKm(p, rp));
    if (best > r.radiusKm) continue;

    // 🐛 REPORTED DIRECTLY — a farmer opening "buyers looking for your crop"
    // saw a want with no price mentioned at all and read it as broken. A
    // buyer CAN post a requirement with neither `priceMin` nor `priceMax` set
    // (both default null) — "I want Onion" with no rate offered yet — and
    // that is a real, valid want, just not one a farmer can act on: there is
    // nothing to compare against their own asking price, negotiate from, or
    // decide with. Excluded here, in the one shared matcher, rather than
    // patched separately in each farmer-facing screen that reads it.
    if (r.priceMin == null && r.priceMax == null) continue;

    matched.push({ ...r, responseCount: r.responses?.length || 0, distanceKm: roundKm(best) });
  }

  matched.sort((a, b) => a.distanceKm - b.distanceKm);
  return matched;
}

/**
 * GET /api/requirements/for-farmer — "Buyers looking for your crop".
 *
 * Matched on three things, in this order of usefulness:
 *   1. COMMODITY — against what the farmer actually has listed right now.
 *      A requirement for a crop they cannot supply is noise.
 *   2. PROXIMITY — the buyer's own radius, measured from their delivery point
 *      to the farmer's land. Respecting the buyer's radius rather than
 *      inventing one means a buyer who says "50 km" is not shown lots 300 km
 *      away that they will refuse.
 *   3. GRADE — a buyer wanting Grade A does not see a farmer's Grade C.
 *      Ungraded lots are NOT excluded: most listings have no grade, and
 *      hiding them would empty the screen.
 */
router.get('/for-farmer', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const uid = req.firebaseUid;

    const [listings, lands] = await Promise.all([
      CropListing.find({ farmerUid: uid, status: 'available' })
        .select('cropName pricePerKg quantityAvailableKg grade location').lean(),
      Land.find({ firebaseUid: uid }).select('location').lean(),
    ]);

    // Where the farmer is. Their listings carry coordinates; their land is the
    // fallback for a farmer who has nothing listed yet.
    const points = [
      ...listings.map((l) => toLatLng(l.location)),
      ...lands.map((l) => toLatLng(l.location?.coordinates || l.location)),
    ].filter(Boolean);

    if (points.length === 0)
      return res.json({ success: true, requirements: [], reason: 'NO_LOCATION' });

    // Only crops the farmer can actually supply, unless they ask for everything.
    const myCrops = [...new Set(listings.map((l) => l.cropName))];
    const allowAll = req.query.all === '1';
    const base = await matchRequirementsForPoints(points, myCrops, {
      allCommodities: allowAll || !myCrops.length,
    });

    const matched = [];
    for (const r of base) {
      const mine = listings.filter((l) => l.cropName === r.commodity);
      const eligible = mine.filter((l) => gradeClears(l.grade?.code, r.minGrade));
      if (myCrops.length && eligible.length === 0 && !allowAll) continue;

      matched.push({
        ...r,
        // The farmer never needs to see who else responded.
        responses: undefined,
        iResponded: (r.responses || []).some((x) => x.farmerUid === uid),
        // Which of their own lots they could put forward, precomputed so the
        // app does not have to re-derive the match rules on the client.
        matchingListings: eligible.map((l) => ({
          _id: l._id, cropName: l.cropName, pricePerKg: l.pricePerKg,
          quantityAvailableKg: l.quantityAvailableKg, grade: l.grade?.code || null,
        })),
      });
    }

    res.json({ success: true, requirements: matched.slice(0, 50) });
  } catch (err) {
    console.error('❌ for-farmer error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/requirements/:id/respond — a farmer raises a hand.
 * body: { listingId, quantityKg?, pricePerKg?, note? }
 *
 * This is not a sale. It tells the buyer "I have this, here it is" — the
 * buyer then makes an Offer on that listing through the existing C1 flow.
 */
router.post('/:id/respond', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const { listingId, quantityKg, pricePerKg, note } = req.body;
    if (!mongoose.isValidObjectId(listingId))
      return res.status(400).json({ success: false, error: 'Choose one of your listings' });

    const [requirement, listing] = await Promise.all([
      Requirement.findById(req.params.id).lean(),
      CropListing.findById(listingId).lean(),
    ]);

    if (!requirement) return res.status(404).json({ success: false, error: 'Requirement not found' });
    if (requirement.status !== 'open' || requirement.expiresAt < new Date())
      return res.status(409).json({
        success: false, code: 'NOT_OPEN',
        error: `This requirement is ${requirement.status === 'open' ? 'expired' : requirement.status}.`,
      });

    if (!listing) return res.status(404).json({ success: false, error: 'Listing not found' });
    if (listing.farmerUid !== req.firebaseUid)
      return res.status(403).json({ success: false, error: 'That is not your listing' });
    if (listing.status !== 'available')
      return res.status(409).json({ success: false, error: 'That listing is no longer on the market' });

    const qty = Number(quantityKg) || Math.min(listing.quantityAvailableKg, requirement.quantityKg);
    const price = Number(pricePerKg) || listing.pricePerKg;

    const p = toLatLng(listing.location);
    const rp = toLatLng(requirement.deliveryPoint);
    const distanceKm = p && rp ? roundKm(haversineKm(p, rp)) : null;

    // Guarded push: the $ne on responses.listingId is what stops the same lot
    // being offered twice, atomically, rather than a read-then-check.
    const updated = await Requirement.findOneAndUpdate(
      {
        _id: requirement._id,
        status: 'open',
        responses: {
          $not: { $elemMatch: { farmerUid: req.firebaseUid, listingId: listing._id } },
        },
      },
      {
        $push: {
          responses: {
            farmerUid: req.firebaseUid,
            farmerName: req.profile.name,
            listingId: listing._id,
            quantityKg: qty,
            pricePerKg: price,
            grade: listing.grade?.code || null,
            distanceKm,
            note: String(note || '').slice(0, 300),
          },
        },
      },
      { new: true }
    );

    if (!updated)
      return res.status(409).json({
        success: false, code: 'ALREADY_RESPONDED',
        error: 'You have already put this lot forward for this requirement.',
      });

    console.log(`🙋 Requirement ${updated._id}: ${req.profile.name} offers ${qty}kg at ₹${price}/kg`);
    res.status(201).json({
      success: true,
      requirement: { ...updated, responses: undefined, responseCount: updated.responses.length },
      next: 'The buyer can now see your lot and make an offer on it.',
    });
  } catch (err) {
    console.error('❌ Respond error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** PUT /api/requirements/:id/close — the buyer is done. */
router.put('/:id/close', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const status = req.body.fulfilled ? 'fulfilled' : 'closed';
    const r = await Requirement.findOneAndUpdate(
      { _id: req.params.id, vendorUid: req.firebaseUid, status: 'open' },
      { $set: { status, closedAt: new Date() } },
      { new: true }
    );
    if (!r) {
      const existing = await Requirement.findById(req.params.id).select('vendorUid status').lean();
      if (!existing) return res.status(404).json({ success: false, error: 'Not found' });
      if (existing.vendorUid !== req.firebaseUid)
        return res.status(403).json({ success: false, error: 'Not yours' });
      return res.status(409).json({
        success: false, code: 'ALREADY_CLOSED',
        error: `This requirement is already ${existing.status}.`,
      });
    }
    res.json({ success: true, requirement: r });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/requirements/signal — the dashboard line.
 * "3 buyers want onion near you", computed from the same match rules.
 */
router.get('/signal', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    await sweepExpired();
    const uid = req.firebaseUid;
    const [listings, lands] = await Promise.all([
      CropListing.find({ farmerUid: uid, status: 'available' }).select('cropName location').lean(),
      Land.find({ firebaseUid: uid }).select('location').lean(),
    ]);
    const points = [
      ...listings.map((l) => toLatLng(l.location)),
      ...lands.map((l) => toLatLng(l.location?.coordinates || l.location)),
    ].filter(Boolean);
    const myCrops = [...new Set(listings.map((l) => l.cropName))];
    if (!points.length || !myCrops.length)
      return res.json({ success: true, signal: null });

    const open = await Requirement.find({ status: 'open', commodity: { $in: myCrops } })
      .select('commodity deliveryPoint radiusKm').limit(200).lean();

    const byCrop = {};
    for (const r of open) {
      const rp = toLatLng(r.deliveryPoint);
      if (!rp) continue;
      const near = points.some((p) => haversineKm(p, rp) <= r.radiusKm);
      if (near) byCrop[r.commodity] = (byCrop[r.commodity] || 0) + 1;
    }

    const top = Object.entries(byCrop).sort((a, b) => b[1] - a[1])[0];
    if (!top) return res.json({ success: true, signal: null });

    const [commodity, count] = top;
    const total = Object.values(byCrop).reduce((a, b) => a + b, 0);
    res.json({
      success: true,
      signal: {
        commodity, count, total,
        text: `${count} buyer${count > 1 ? 's' : ''} want${count > 1 ? '' : 's'} ${commodity.toLowerCase()} near you`,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
// Reused by routes/fpos.js (F2 dashboard) so the FPO view matches buyers with
// the exact same commodity+radius rule instead of a second implementation.
module.exports.matchRequirementsForPoints = matchRequirementsForPoints;
// Read by scripts/seedBuyerRequirements.js so a seeded want lapses on exactly
// the same clock a posted one does. Hard-coding 21 in the seeder would leave
// two windows to change and one of them would be forgotten.
module.exports.REQUIREMENT_WINDOW_DAYS = REQUIREMENT_WINDOW_DAYS;

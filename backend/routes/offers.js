const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Offer = require('../models/Offer');
const CropListing = require('../models/CropListing');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const User = require('../models/User');

// How long a farmer has to answer before the offer lapses. Long enough that a
// farmer working a field all day does not lose a bid, short enough that a
// vendor is not waiting on a dead negotiation.
const OFFER_WINDOW_MS = 48 * 60 * 60 * 1000;

// Same discipline as routes/orders.js: lapse on read rather than running a
// scheduler. There is no cron in this project and adding one for this would be
// infrastructure bought for a single feature.
async function sweepExpired() {
  await Offer.updateMany(
    { status: { $in: ['pending', 'countered'] }, expiresAt: { $lt: new Date() } },
    { $set: { status: 'expired', closedAt: new Date() } }
  );
}

const OPEN = ['pending', 'countered'];

/** Fields the counterparty may see. vendorPhone is released deliberately. */
const VIEW = '-__v';

function badPrice(v) {
  const n = Number(v);
  return !Number.isFinite(n) || n <= 0 || n > 100000;
}

/**
 * POST /api/offers
 * Vendor opens a negotiation on a listing.
 * body: { listingId, quantityKg, offerPricePerKg, message? }
 */
router.post('/', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const { listingId, quantityKg, offerPricePerKg, message } = req.body;
    const qty = Number(quantityKg);

    if (!mongoose.isValidObjectId(listingId))
      return res.status(400).json({ success: false, error: 'A valid listingId is required' });
    if (!Number.isFinite(qty) || qty <= 0)
      return res.status(400).json({ success: false, error: 'Enter how much you want to buy' });
    if (badPrice(offerPricePerKg))
      return res.status(400).json({ success: false, error: 'Enter a price per kg' });

    const listing = await CropListing.findById(listingId).lean();
    if (!listing || listing.status !== 'available')
      return res.status(404).json({ success: false, error: 'This listing is no longer available' });

    if (listing.farmerUid === req.firebaseUid)
      return res.status(403).json({ success: false, error: 'You cannot bid on your own listing' });

    // Checked here for a clear message, and NOT relied on: stock is only truly
    // guaranteed by the atomic decrement at acceptance.
    if (qty < (listing.minOrderKg || 1))
      return res.status(400).json({
        success: false, code: 'BELOW_MIN',
        error: `The farmer's minimum is ${listing.minOrderKg} kg`,
      });
    if (qty > listing.quantityAvailableKg)
      return res.status(400).json({
        success: false, code: 'NOT_ENOUGH_STOCK',
        error: `Only ${listing.quantityAvailableKg} kg is left`,
      });

    const buyer = await User.findOne({ firebaseUid: req.firebaseUid })
      .select('verification.status business.tradeName').lean();

    const offer = await Offer.create({
      listingId: listing._id,
      cropName: listing.cropName,
      cropLocalName: listing.cropLocalName || '',
      farmerUid: listing.farmerUid,
      farmerName: listing.farmerName || '',
      // Identity comes from the verified profile, never the request body.
      vendorUid: req.firebaseUid,
      vendorName: req.profile.name,
      vendorCompany: req.body.vendorCompany || req.profile.name,
      vendorPhone: req.profile.phone,
      // Snapshot of the buyer's standing, so the farmer can weigh who they are
      // dealing with without a second request per offer.
      vendorVerification: buyer?.verification?.status || 'unverified',
      vendorTradeName: buyer?.business?.tradeName || '',
      quantityKg: qty,
      askingPricePerKg: listing.pricePerKg,
      offerPricePerKg: Number(offerPricePerKg),
      message: String(message || '').slice(0, 300),
      expiresAt: new Date(Date.now() + OFFER_WINDOW_MS),
    });

    console.log(`🤝 Offer ${offer._id}: ${req.profile.name} bids ₹${offer.offerPricePerKg}/kg for ${qty}kg ${listing.cropName} (asking ₹${listing.pricePerKg})`);
    res.status(201).json({ success: true, offer });
  } catch (err) {
    // The partial unique index, not a read-then-check, is what actually stops
    // a vendor stacking bids on one listing.
    if (err.code === 11000)
      return res.status(409).json({
        success: false, code: 'OFFER_EXISTS',
        error: 'You already have an open offer on this listing. Withdraw it first.',
      });
    console.error('❌ Create offer error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/offers/farmer/mine — offers waiting on the farmer. */
router.get('/farmer/mine', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    await sweepExpired();
    const filter = { farmerUid: req.firebaseUid };
    if (req.query.open === '1') filter.status = { $in: OPEN };
    // ?verified=1 — show only buyers who have put credentials on file.
    // 'verified' and 'documents_submitted' both qualify: the badge itself
    // distinguishes them, and hiding GSTIN-on-file buyers entirely would leave
    // most of a real marketplace invisible.
    if (req.query.verified === '1')
      filter.vendorVerification = { $in: ['verified', 'documents_submitted'] };
    const offers = await Offer.find(filter).select(VIEW)
      .sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, offers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/offers/vendor/mine — the vendor's own bids. */
router.get('/vendor/mine', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    await sweepExpired();
    const filter = { vendorUid: req.firebaseUid };
    if (req.query.open === '1') filter.status = { $in: OPEN };
    const offers = await Offer.find(filter).select(VIEW)
      .sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, offers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/offers/:id/counter — the farmer names their price.
 * body: { counterPricePerKg, counterNote? }
 *
 * Only from 'pending': once the farmer has countered, the ball is with the
 * vendor and the farmer countering again would be talking to themselves.
 */
router.put('/:id/counter', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const { counterPricePerKg, counterNote } = req.body;
    if (badPrice(counterPricePerKg))
      return res.status(400).json({ success: false, error: 'Enter your price per kg' });

    const offer = await Offer.findOneAndUpdate(
      {
        _id: req.params.id,
        farmerUid: req.firebaseUid,
        status: 'pending',
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          status: 'countered',
          counterPricePerKg: Number(counterPricePerKg),
          counterNote: String(counterNote || '').slice(0, 300),
          respondedAt: new Date(),
        },
      },
      { new: true }
    );
    if (!offer) return res.status(409).json(await why(req.params.id, req.firebaseUid, 'counter'));

    console.log(`↩️  Offer ${offer._id}: farmer counters at ₹${offer.counterPricePerKg}/kg`);
    res.json({ success: true, offer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/offers/:id/accept
 *
 * Whoever the ball is with may accept:
 *   farmer accepts the vendor's bid          (status 'pending')
 *   vendor accepts the farmer's counter      (status 'countered')
 *
 * ACCEPTANCE DOES NOT CREATE THE ORDER. It agrees a price. The vendor still
 * has to choose a delivery point and a vehicle, which is what POST /api/orders
 * exists for, and which is where stock is atomically taken. Doing it here
 * would mean inventing a dropoff on the farmer's behalf.
 */
router.put('/:id/accept', requireAuth, async (req, res) => {
  try {
    const uid = req.firebaseUid;
    const existing = await Offer.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ success: false, error: 'Offer not found' });

    // Whose turn it is, derived from status rather than a separate field.
    const turn = existing.status === 'pending' ? existing.farmerUid
      : existing.status === 'countered' ? existing.vendorUid
        : null;
    if (!turn) return res.status(409).json(await why(req.params.id, uid, 'accept'));
    if (turn !== uid)
      return res.status(403).json({
        success: false, code: 'NOT_YOUR_TURN',
        error: existing.status === 'pending'
          ? 'Waiting for the farmer to respond.'
          : 'Waiting for the buyer to respond to your counter.',
      });

    const price = existing.status === 'countered'
      ? existing.counterPricePerKg
      : existing.offerPricePerKg;

    // Stock is re-checked for a useful message. It is NOT a reservation — the
    // real guard is the atomic decrement in POST /api/orders.
    const listing = await CropListing.findById(existing.listingId).lean();
    if (!listing || listing.status !== 'available')
      return res.status(409).json({
        success: false, code: 'LISTING_GONE',
        error: 'That listing has been withdrawn or sold out.',
      });
    if (listing.quantityAvailableKg < existing.quantityKg)
      return res.status(409).json({
        success: false, code: 'NOT_ENOUGH_STOCK',
        error: `Only ${listing.quantityAvailableKg} kg is left — the rest sold while this offer was open.`,
      });

    const offer = await Offer.findOneAndUpdate(
      { _id: req.params.id, status: existing.status, expiresAt: { $gt: new Date() } },
      {
        $set: {
          status: 'accepted',
          agreedPricePerKg: price,
          respondedAt: new Date(),
          closedAt: new Date(),
        },
      },
      { new: true }
    );
    if (!offer) return res.status(409).json(await why(req.params.id, uid, 'accept'));

    console.log(`✅ Offer ${offer._id}: agreed at ₹${price}/kg for ${offer.quantityKg}kg`);
    res.json({
      success: true,
      offer,
      // The vendor's next step. Said explicitly so the client is not guessing.
      next: 'The price is agreed. The buyer now books transport to complete the purchase.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** PUT /api/offers/:id/decline — either side, whenever it is their turn. */
router.put('/:id/decline', requireAuth, async (req, res) => {
  try {
    const uid = req.firebaseUid;
    const offer = await Offer.findOneAndUpdate(
      {
        _id: req.params.id,
        status: { $in: OPEN },
        // Whoever's turn it is may decline: the farmer while pending, the
        // vendor once they have been countered.
        $or: [
          { status: 'pending', farmerUid: uid },
          { status: 'countered', vendorUid: uid },
        ],
      },
      { $set: { status: 'declined', respondedAt: new Date(), closedAt: new Date() } },
      { new: true }
    );
    if (!offer) return res.status(409).json(await why(req.params.id, uid, 'decline'));
    res.json({ success: true, offer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** PUT /api/offers/:id/withdraw — the vendor pulls their own bid. */
router.put('/:id/withdraw', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const offer = await Offer.findOneAndUpdate(
      { _id: req.params.id, vendorUid: req.firebaseUid, status: { $in: OPEN } },
      { $set: { status: 'withdrawn', closedAt: new Date() } },
      { new: true }
    );
    if (!offer) return res.status(409).json(await why(req.params.id, req.firebaseUid, 'withdraw'));
    res.json({ success: true, offer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Why did a guarded update match nothing?
 *
 * The guard is deliberately a single atomic filter, so it cannot report which
 * clause failed. Re-reading afterwards to explain costs one query on the error
 * path only, and turns a bare 409 into something a farmer can act on.
 */
async function why(id, uid, action) {
  const o = await Offer.findById(id).lean();
  if (!o) return { success: false, code: 'NOT_FOUND', error: 'Offer not found' };
  if (o.farmerUid !== uid && o.vendorUid !== uid)
    return { success: false, code: 'NOT_YOURS', error: 'This offer is not yours' };
  if (!OPEN.includes(o.status))
    return {
      success: false, code: 'ALREADY_CLOSED',
      error: `This offer was already ${o.status}.`, status: o.status,
    };
  if (o.expiresAt < new Date())
    return { success: false, code: 'EXPIRED', error: 'This offer has expired.' };
  return {
    success: false, code: 'NOT_YOUR_TURN',
    error: `You cannot ${action} this offer right now.`, status: o.status,
  };
}

module.exports = router;

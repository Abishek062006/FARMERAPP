const express = require('express');
const mongoose = require('mongoose');
const router  = express.Router();
const Order = require('../models/Order');
const CropListing = require('../models/CropListing');
const Offer = require('../models/Offer');
const Dispute = require('../models/Dispute');
const User = require('../models/User');
// Read only by the receipt gate, to admit the admin of the group the order's
// farmer belongs to — the same widening routes/disputes.js already applies.
const Fpo = require('../models/Fpo');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { toLatLng, resolveDistrict, haversineKm, roundKm } = require('../services/geoService');
const { getRoute } = require('../services/routeService');
const { quote, quoteAll } = require('../services/fareService');
const { freightDeductionFor } = require('../services/freightDebtService');
const { activeJobOf, busyResponse } = require('../services/agentJobService');
// A delivered quantity never appears without its provenance, and a receipt is
// the most forwarded document this app produces — see data/gateRecord.js.
// Who is out of pocket, and for what, at each stage of one order — and the
// validation for an advance a buyer proposes. See that file's header for why
// an advance is a RECORD and never a transfer.
const { exposureFor, resolveAdvance } = require('../services/paymentExposureService');
const {
  describeWeight, describeGradeCheck,
  POSTABLE_WEIGHT_METHODS, GRADING_REFUSED_NOTE,
  // WHAT ANYONE WITH EYES COULD SAY. On a HIRED run the grade block is
  // deliberately empty — a captain from the public pool is not asked to grade
  // (data/gateRecord.js GRADING_ROLES) — so without this a receipt for the
  // commonest kind of pickup would carry no gate observation at all.
  describeCondition, parseCondition, CONDITION_FLAG_KEYS,
} = require('../data/gateRecord');

// ⚠️ ONE SHARED CONSTANT, NOT TWO. This was declared separately in
// routes/orders.js and routes/consignments.js, both `5 * 60 * 1000` — so
// changing one and missing the other would leave single pickups and multi-farm
// runs on different windows, a silent divergence no test would catch because
// each file's own tests would still pass. It now lives in one place, with the
// reasoning for four hours and for the evening cutoff.
const { dispatchExpiryFrom } = require('../services/dispatchWindow');
const priceBand = require('../services/priceBandService');

// How long a buyer has to look at the lot and say something before settling.
//
// 24 hours, chosen against the produce: this app trades perishables, and a lot
// that sat unexamined for three days has changed on its own — a complaint then
// is about storage as much as about the farmer. One day is long enough for a
// buyer who took delivery in the evening to look in the morning, and short
// enough that the lot still resembles what left the farm.
const INSPECTION_WINDOW_HOURS = 24;
const { locateCaptain, reachable, SCAN_CAP, vehicleTypesServableBy } = require('../services/dispatchReach');
const otp = () => String(Math.floor(1000 + Math.random() * 9000));

/**
 * Lazily retires dispatches nobody accepted. There is no cron in this app, so
 * the sweep runs on the reads that would otherwise show a stale order.
 *
 * It deliberately does NOT restock: the vendor's PURCHASE is final, only the
 * dispatch lapsed. The order becomes 'no_agents' and the vendor chooses to
 * retry or cancel. That avoids restock churn on every timeout and it matches
 * what actually happened.
 */
/**
 * One CSV cell.
 *
 * The prefixed apostrophe is not decoration. Excel and LibreOffice execute a
 * cell beginning =, +, - or @ as a FORMULA, so a crop name or company field
 * containing `=HYPERLINK(...)` becomes a live payload in whatever accountant's
 * machine opens this file. Quoting alone does not stop it; neutralising the
 * leading character does.
 */
function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function sweepExpired() {
  await Order.updateMany(
    { status: 'awaiting_agent', dispatchExpiresAt: { $lt: new Date() } },
    { $set: { status: 'no_agents' } }
  );
}

/**
 * POST /api/orders/quote
 * Read-only. Reserves nothing, writes nothing.
 * body: { listingId, quantityKg, dropoff: {lat, lng, label, city, district} }
 */
router.post('/quote', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const { listingId, quantityKg, dropoff } = req.body;
    const qty = Number(quantityKg);

    const listing = await CropListing.findById(listingId).lean();
    if (!listing || listing.status !== 'available')
      return res.status(404).json({ success: false, error: 'This listing is no longer available' });

    if (!(qty > 0) || qty < listing.minOrderKg || qty > listing.quantityAvailableKg)
      return res.status(400).json({
        success: false,
        error: `Order between ${listing.minOrderKg} kg and ${listing.quantityAvailableKg} kg`,
      });

    const pickup = toLatLng(listing.location);
    const drop = toLatLng(dropoff);
    if (!pickup) return res.status(400).json({ success: false, error: 'This listing has no pickup location' });
    if (!drop)   return res.status(400).json({ success: false, error: 'Choose a delivery destination' });

    const route = await getRoute(pickup, drop);
    const vehicles = quoteAll(route.distanceKm, qty);
    const cropTotal = qty * listing.pricePerKg;

    res.json({
      success: true,
      quote: {
        cropTotal,
        quantityKg: qty,
        pricePerKg: listing.pricePerKg,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        routeSource: route.source,
        polyline: route.polyline,
        pickup: {
          ...pickup,
          label: [listing.location.city, listing.location.district].filter(Boolean).join(', '),
          city: listing.location.city,
          district: listing.location.district,
        },
        vehicles,
      },
    });
  } catch (err) {
    console.error('❌ Quote error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/orders
 * Buy the crop and dispatch a vehicle, atomically.
 * body: { listingId, quantityKg, vehicleType, dropoff, idempotencyKey }
 */
router.post('/', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const { listingId, vehicleType, dropoff, idempotencyKey } = req.body;
    const qty = Number(req.body.quantityKg);

    if (idempotencyKey) {
      // A retried/double-tapped submit returns the order it already made.
      const existing = await Order.findOne({ idempotencyKey, vendorUid: req.firebaseUid }).lean();
      if (existing) return res.status(200).json({ success: true, order: existing, duplicate: true });
    }

    const snapshot = await CropListing.findById(listingId).lean();
    if (!snapshot) return res.status(404).json({ success: false, error: 'Listing not found' });

    const pickup = toLatLng(snapshot.location);
    const drop = toLatLng(dropoff);
    if (!pickup) return res.status(400).json({ success: false, error: 'This listing has no pickup location' });
    if (!drop)   return res.status(400).json({ success: false, error: 'Choose a delivery destination' });

    // Distance and fare are recomputed server-side; the client's numbers are
    // display only and are never trusted.
    const route = await getRoute(pickup, drop);
    const priced = quote(vehicleType, route.distanceKm, qty);
    if (!priced.ok)
      return res.status(400).json({ success: false, error: priced.reason || 'That vehicle cannot take this load' });

    // ── an accepted offer overrides the listing price ─────────────────────
    // The offer is re-read and re-checked here rather than trusted from the
    // body: a vendor could otherwise post any offerId and buy at any price.
    // It must be ACCEPTED, theirs, for this listing, and not already spent.
    let agreedPrice = null;
    let usedOffer = null;
    if (req.body.offerId) {
      if (!mongoose.isValidObjectId(req.body.offerId))
        return res.status(400).json({ success: false, error: 'Invalid offerId' });
      usedOffer = await Offer.findOne({
        _id: req.body.offerId,
        vendorUid: req.firebaseUid,
        listingId: snapshot._id,
        status: 'accepted',
        orderId: null,
      }).lean();
      if (!usedOffer)
        return res.status(409).json({
          success: false, code: 'OFFER_NOT_USABLE',
          error: 'That agreed price is not available — it may already have been used, declined, or belong to another listing.',
        });
      if (qty > usedOffer.quantityKg)
        return res.status(400).json({
          success: false, code: 'OFFER_QUANTITY',
          error: `The agreed price covers up to ${usedOffer.quantityKg} kg.`,
        });
      agreedPrice = usedOffer.agreedPricePerKg;
    }
    // snapshot, not `listing` — the latter is only bound after the atomic
    // decrement below, and referencing it here is a temporal dead zone.
    const unitPrice = agreedPrice ?? snapshot.pricePerKg;

    // ── THE ADVANCE, VALIDATED BEFORE ANY STOCK MOVES ────────────────────
    // Deliberately ahead of the atomic decrement below: a malformed advance is
    // a client error, and refusing it after taking the kilograms would mean
    // compensating a write that never needed to happen. Same ordering rule as
    // the weightMethod check on /:id/pickup.
    const advance = resolveAdvance(req.body, qty * unitPrice);
    if (advance.error)
      return res.status(400).json({ success: false, code: advance.error, error: advance.message });

    // ── the one operation that prevents overselling ───────────────────────
    // Availability, the farmer's minimum, and the stock check are all query
    // conditions on a single document, so MongoDB applies them atomically.
    // A read-then-save here would be the classic lost-update race.
    const listing = await CropListing.findOneAndUpdate(
      {
        _id: listingId,
        status: 'available',
        minOrderKg: { $lte: qty },
        quantityAvailableKg: { $gte: qty },
      },
      { $inc: { quantityAvailableKg: -qty } },
      { new: true }
    );
    if (!listing)
      return res.status(409).json({
        success: false, code: 'STOCK_GONE',
        error: 'That stock was just bought, or your quantity is below the farmer\'s minimum. Refresh the market.',
      });

    let order;
    try {
      const cropTotal = qty * unitPrice;
      // Phase 3, L1 — present only for stock that passed through an FPO
      // collection run under facilitation mode; 0 for every ordinary
      // farm-direct listing (custody.freightOwedPerKg defaults to 0).
      const freight = freightDeductionFor(listing, qty);
      order = await Order.create({
        idempotencyKey: idempotencyKey || undefined,
        listingId: listing._id,
        cropId: listing.cropId,
        cropName: listing.cropName,
        cropLocalName: listing.cropLocalName,
        proofImageId: listing.proofImageId,
        quantityKg: qty,
        pricePerKg: unitPrice,
        cropTotal,
        offerId: usedOffer?._id || null,
        priceSource: agreedPrice != null ? 'negotiated' : 'listing',

        farmerUid: listing.farmerUid,
        farmerName: listing.farmerName,
        farmerPhone: listing.farmerPhone,
        vendorUid: req.firebaseUid,
        vendorName: req.profile.name,
        vendorPhone: req.profile.phone,
        vendorCompany: req.body.vendorCompany || req.profile.name,

        pickup: {
          ...pickup,
          label: [listing.location.city, listing.location.district].filter(Boolean).join(', '),
          city: listing.location.city,
          district: listing.location.district,
        },
        dropoff: {
          ...drop,
          label: dropoff.label || dropoff.address || 'Delivery point',
          city: dropoff.city || '',
          district: dropoff.district || resolveDistrict(null, drop),
        },

        vehicleType,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        routeSource: route.source,
        routePolyline: route.polyline,
        fare: priced.fare,
        grandTotal: cropTotal + priced.fare.total,
        // The vendor's total outlay splits two ways: the agent collects the
        // fare at handover, the vendor settles the crop value with the farmer
        // directly. Nothing used to record the second half.
        //
        // ⚠️ NET OF THE COLLECTION FREIGHT THE FARMER OWES, IF ANY.
        // `grandTotal` above stays cropTotal + fare — the BUYER's price is
        // unaffected by how the crop got to the FPO's godown. Only what the
        // FARMER is owed changes, and freightDeduction travels as its own
        // named line so it is never a payout that is just quietly smaller.
        farmerPayout: cropTotal - freight.amount,
        freightDeduction: freight,
        // ── THE ADVANCE THE BUYER COMMITS TO ─────────────────────────
        // AGREED here, RECEIVED later and only by the farmer
        // (POST /:id/settle-advance). A buyer promising an advance is not the
        // same fact as a farmer holding one, and this app never collapses the
        // two — see models/Order.js settlement.advance.
        //
        // Zero is the default and is byte-for-byte the old behaviour, so an
        // order placed without naming an advance is unchanged in every field.
        'settlement.advance.agreedAmount': advance.agreedAmount,
        'settlement.advance.agreedPct': advance.agreedPct,
        'settlement.advance.agreedAt': advance.agreedAmount > 0 ? new Date() : null,

        status: 'awaiting_agent',
        dispatchExpiresAt: dispatchExpiryFrom().expiresAt,
        pickupOtp: otp(),
        dropOtp: otp(),
      });
    } catch (err) {
      // Compensate: put the stock back rather than losing it. The window here
      // is milliseconds, which is why this beats a full transaction — and it
      // keeps working on a standalone mongod, where transactions would not.
      await CropListing.updateOne({ _id: listingId }, { $inc: { quantityAvailableKg: qty } });

      // Two genuinely simultaneous submits both pass the pre-check above, so
      // the unique index is what actually decides. The loser must receive the
      // order that won — returning an error here would be the whole point of
      // idempotency defeated. A duplicate-key error means the winner is
      // already committed, so this read always finds it.
      if (err.code === 11000) {
        const winner = idempotencyKey
          ? await Order.findOne({ idempotencyKey, vendorUid: req.firebaseUid }).lean()
          : null;
        if (winner) return res.status(200).json({ success: true, order: winner, duplicate: true });
        return res.status(409).json({ success: false, error: 'That booking was already placed' });
      }
      throw err;
    }

    // Spend the offer. Guarded on orderId:null so two concurrent bookings
    // cannot both claim one agreed price — the loser is compensated below.
    if (usedOffer) {
      const claimed = await Offer.findOneAndUpdate(
        { _id: usedOffer._id, orderId: null, status: 'accepted' },
        { $set: { orderId: order._id } },
        { new: true }
      );
      if (!claimed) {
        // Another booking took it between the read above and here. Put the
        // stock back and refuse, rather than selling at a price this vendor
        // no longer holds.
        await CropListing.updateOne({ _id: listingId }, { $inc: { quantityAvailableKg: qty } });
        await Order.deleteOne({ _id: order._id });
        return res.status(409).json({
          success: false, code: 'OFFER_NOT_USABLE',
          error: 'That agreed price was just used by another booking.',
        });
      }
    }

    // If what is left is under the farmer's own minimum, nobody can ever buy
    // it. $expr compares two fields of the same document.
    await CropListing.updateOne(
      { _id: listingId, status: 'available', $expr: { $lt: ['$quantityAvailableKg', '$minOrderKg'] } },
      { $set: { status: 'sold_out' } }
    );

    console.log(
      `🛒 Order ${order._id}: ${qty}kg ${listing.cropName} · ${vehicleType} · ` +
      `${route.distanceKm}km · ₹${order.grandTotal} ` +
      `(farmer ₹${order.farmerPayout} + fare ₹${order.fare.total})`
    );
    res.status(201).json({ success: true, order });
  } catch (err) {
    console.error('❌ Create order error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/orders/vendor/mine — the vendor's orders. */
router.get('/vendor/mine', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    await sweepExpired();
    const filter = { vendorUid: req.firebaseUid };
    if (req.query.active === '1') filter.status = { $nin: ['delivered', 'cancelled'] };
    const orders = await Order.find(filter)
      .select('-routePolyline -pickupOtp')   // vendor holds the DROP code only
      .sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/orders/farmer/mine — incoming pickups, with the pickup code. */
router.get('/farmer/mine', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    await sweepExpired();
    const orders = await Order.find({ farmerUid: req.firebaseUid })
      .select('-routePolyline -dropOtp -vendorPhone')
      .sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/orders/export.csv — the caller's transactions, for their books.
 *
 * Columns are role-aware: a farmer's sheet leads with what they were paid, a
 * buyer's with what they spent, an agent's with what they earned. One shared
 * shape would leave two of the three reading someone else's ledger.
 */
router.get('/export.csv', requireAuth, async (req, res) => {
  try {
    const uid = req.firebaseUid;
    const role = req.profile?.role
      || (await User.findOne({ firebaseUid: uid }).select('role').lean())?.role;

    const key = role === 'farmer' ? 'farmerUid' : role === 'agent' ? 'agentUid' : 'vendorUid';
    const orders = await Order.find({ [key]: uid })
      .select('-pickupOtp -dropOtp -routePolyline -approachPolyline -tracking')
      .sort({ createdAt: -1 }).limit(1000).lean();

    const header = [
      'receipt_no', 'date', 'status', 'crop', 'quantity_kg',
      // A spreadsheet is where these numbers get totalled, averaged and quoted
      // at somebody, which makes it the WORST place for a quantity to travel
      // without saying whether anyone weighed it. `weighed` is the column a
      // pivot table can filter on; `weight_method` says which scale.
      'weight_method', 'weighed',
      // Declared beside observed, so a sheet can show a disagreement rather
      // than one letter that looks settled. Neither column moves any money —
      // the price columns are untouched by a difference between them.
      'grade_declared', 'grade_observed', 'grade_check',
      'price_per_kg', 'price_source',
      'crop_total', 'fare', 'grand_total',
      role === 'farmer' ? 'you_receive' : role === 'agent' ? 'you_earn' : 'you_pay',
      'settled', 'settled_on', 'counterparty', 'district', 'distance_km', 'vehicle',
    ];

    const rows = orders.map((o) => [
      `FM-${String(o._id).slice(-8).toUpperCase()}`,
      new Date(o.createdAt).toISOString().slice(0, 10),
      o.status,
      o.cropName,
      o.quantityKg,
      ...(() => {
        const w = describeWeight(o.pickupOutcome?.weight?.method, o.pickupOutcome?.weight?.ref);
        const g = describeGradeCheck(o.pickupOutcome?.grade);
        return [
          w.method || 'not_recorded',
          w.weighed ? 'yes' : 'no',
          g.declared || '',
          g.observed || '',
          g.discrepancy || '',
        ];
      })(),
      o.pricePerKg,
      o.priceSource || 'listing',
      o.cropTotal,
      o.fare?.total ?? 0,
      o.grandTotal,
      role === 'farmer' ? (o.farmerPayout ?? o.cropTotal)
        : role === 'agent' ? (o.fare?.agentPayout ?? o.fare?.total ?? 0)
          : o.grandTotal,
      o.settlement?.farmerPaid ? 'yes' : 'no',
      o.settlement?.paidAt ? new Date(o.settlement.paidAt).toISOString().slice(0, 10) : '',
      role === 'farmer' ? (o.vendorName || '') : (o.farmerName || ''),
      o.pickup?.district || '',
      o.distanceKm,
      o.vehicleType,
    ]);

    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');

    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition',
      `attachment; filename="farmmarket-${role || 'orders'}-${new Date().toISOString().slice(0, 10)}.csv"`);
    // A leading BOM so Excel opens Devanagari crop names as UTF-8 rather than
    // mojibake. Without it "कांदा" arrives as garbage in the one program most
    // of these files will be opened in.
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error('❌ CSV export error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/orders/:id — full detail for a party to this order. */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    const uid = req.firebaseUid;
    if (![order.vendorUid, order.farmerUid, order.agentUid].includes(uid))
      return res.status(403).json({ success: false, error: 'Not your order' });

    // Each party sees only the code they are meant to read out.
    if (uid !== order.farmerUid && uid !== order.agentUid) delete order.pickupOtp;
    if (uid !== order.vendorUid && uid !== order.agentUid) delete order.dropOtp;
    if (uid === order.agentUid) { delete order.pickupOtp; delete order.dropOtp; }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/orders/:id/retry — re-dispatch after nobody accepted.
 *
 * ⚠️ IT REPORTS A SHORT WINDOW RATHER THAN QUIETLY HANDING ONE OUT. A retry at
 * 18:55 gets five minutes, because the window is clipped to the end of the
 * working day (services/dispatchWindow.js). Returning that silently would let a
 * buyer watch a countdown expire and conclude a second time that no captain
 * wants the job — when what actually happened is that they re-dispatched it
 * five minutes before nobody was driving any more. The farmer's kilograms stay
 * committed through all of it, so this is not a cosmetic detail.
 */
router.post('/:id/retry', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const window = dispatchExpiryFrom();
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, vendorUid: req.firebaseUid, status: 'no_agents' },
      { $set: { status: 'awaiting_agent', dispatchExpiresAt: window.expiresAt, rejectedBy: [] } },
      { new: true }
    );
    if (!order) return res.status(409).json({ success: false, error: 'This order cannot be re-dispatched' });
    res.json({
      success: true,
      order,
      dispatch: {
        expiresAt: window.expiresAt,
        clipped: !!window.clipped,
        tooLate: !!window.tooLate,
        note: window.reason,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/orders/:id/cancel — vendor cancels, before an agent is assigned.
 * The status is a QUERY CONDITION, so if an agent's accept lands first this
 * returns 409 rather than silently cancelling an accepted job.
 */
router.post('/:id/cancel', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, vendorUid: req.firebaseUid, status: { $in: ['awaiting_agent', 'no_agents'] } },
      { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'vendor' } },
      { new: true }
    );
    if (!order)
      return res.status(409).json({
        success: false,
        error: 'A driver has already accepted this trip — call them to cancel',
      });

    // Restock, then bring the listing back to the market if it had retired.
    await CropListing.updateOne({ _id: order.listingId }, { $inc: { quantityAvailableKg: order.quantityKg } });
    await CropListing.updateOne(
      { _id: order.listingId, status: 'sold_out', $expr: { $gte: ['$quantityAvailableKg', '$minOrderKg'] } },
      { $set: { status: 'available' } }
    );

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Agent side
// ─────────────────────────────────────────────────────────────────────────

/**
 * GET /api/orders/agent/available
 * Jobs this agent could take, nearest pickup first.
 *
 * Polled every few seconds while the agent is online — there is no push in
 * Expo Go, so this is the dispatch channel.
 *   ?lat=&lng=  the agent's live position
 */
/**
 * GET /api/orders/agent/history — a captain's COMPLETED work and what it paid.
 *
 * ⚠️ THIS DID NOT EXIST. A captain had `/agent/available` (jobs to take) and
 * `/agent/current` (the one in hand) and NOTHING ELSE — so there was no way,
 * anywhere in the app, for a driver to see a trip they had finished or a rupee
 * they had earned. Their whole record was invisible to them.
 *
 * Delivered ONLY. A cancelled trip paid nothing and an in-flight one has not
 * paid yet; counting either would overstate what this person has actually
 * earned, which is the one number they are opening this screen for.
 *
 * ⚠️ `fare.agentPayout ?? fare.total` — NOT `grandTotal`. The captain collects
 * the FARE; the crop value is settled between the buyer and the farmer
 * directly and was never the driver's money. Reading grandTotal here would
 * show a driver an income several times what they were actually paid.
 */
router.get('/agent/history', requireAuth, requireRole('agent'), async (req, res) => {
  try {
    const orders = await Order.find({ agentUid: req.firebaseUid, status: 'delivered' })
      .select('-routePolyline -approachPolyline -pickupOtp -dropOtp')
      .sort({ deliveredAt: -1 })
      .limit(60)
      .lean();

    const earned = orders.reduce((a, o) => a + (o.fare?.agentPayout ?? o.fare?.total ?? 0), 0);
    const km = orders.reduce((a, o) => a + (o.distanceKm || 0), 0);
    // What the driver has actually been HANDED, against what is still owed to
    // them. `payment.status` is the transport leg — cash at handover.
    const collected = orders.filter((o) => o.payment?.status === 'collected');
    const collectedValue = collected.reduce((a, o) => a + (o.fare?.agentPayout ?? o.fare?.total ?? 0), 0);

    res.json({
      success: true,
      orders,
      summary: {
        trips: orders.length,
        totalEarned: earned,
        collected: collectedValue,
        // Reported separately rather than folded in. A driver who has finished
        // the trip but not been paid for it is in a different position from one
        // who has, and a single "earned" figure hides exactly that.
        awaitingCash: earned - collectedValue,
        distanceKm: Math.round(km),
        note: 'Single-farm pickups only. Multi-farm runs are on '
          + 'GET /api/consignments/agent/history — they are one vehicle across several farms and '
          + 'their fare is split by weight, so they are counted there, not here.',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/agent/available', requireAuth, requireRole('agent'), async (req, res) => {
  try {
    await sweepExpired();

    const vehicleType = req.profile.vehicle && req.profile.vehicle.type;
    if (!vehicleType)
      return res.status(400).json({ success: false, code: 'NO_VEHICLE', error: 'Add your vehicle details first' });

    // An agent already mid-job is offered nothing — one active job each, and
    // that now spans BOTH collections (services/agentJobService.js), so a
    // captain part-way through a multi-farm run is not shown single pickups
    // they would only fail to accept.
    const current = await activeJobOf(req.firebaseUid);
    if (current) return res.json({ success: true, orders: [], busy: true, activeJob: current });

    // ⚠️ SCAN FIRST, THEN FILTER BY DISTANCE — the reverse was the bug.
    // This used to be `.sort({ createdAt: 1 }).limit(20)` and only THEN sorted
    // the survivors by distance, which takes the twenty oldest open jobs in
    // Maharashtra and ranks those. With 720 captains across 36 districts the
    // nearest job to this driver was usually never in the query at all. See the
    // header of services/dispatchReach.js.
    const candidates = await Order.find({
      status: 'awaiting_agent',
      // Phase 6, B5b — jobs this vehicle CAN take, not only jobs priced for
      // this exact vehicle type. A tempo or truck can carry an auto-sized
      // load; the fare stays frozen at the job's own vehicleType rate either
      // way. See vehicleTypesServableBy()'s own comment for why this was a
      // real gap, not a preference.
      vehicleType: { $in: vehicleTypesServableBy(vehicleType) },
      rejectedBy: { $ne: req.firebaseUid },         // never re-offer a declined job
      // Pooled orders travel on a Consignment and are claimed by accepting that
      // run — offering one here would let a captain take a single farm out of a
      // shared trip. `null` also matches an order written before F1 added the
      // field, exactly as `$in: [..., null]` does elsewhere.
      consignmentId: null,
    }).select('-routePolyline -pickupOtp -dropOtp -farmerPhone -vendorPhone')
      .sort({ createdAt: 1 }).limit(SCAN_CAP).lean();

    const me = locateCaptain({ query: req.query, profile: req.profile });
    const { items: orders, reach } = reachable({
      items: candidates,
      pickupOf: (o) => o.pickup,
      me,
      vehicleType,
      limit: 20,
    });

    for (const o of orders) {
      o.expiresInSec = Math.max(0, Math.round((new Date(o.dispatchExpiresAt) - Date.now()) / 1000));
    }

    res.json({ success: true, orders, busy: false, reach });
  } catch (err) {
    console.error('❌ Agent available error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/orders/agent/current — the job this agent is on, if any. */
router.get('/agent/current', requireAuth, requireRole('agent'), async (req, res) => {
  try {
    const order = await Order.findOne({ agentUid: req.firebaseUid, isActiveJob: true })
      .select('-pickupOtp -dropOtp')   // the agent RECEIVES codes, never holds them
      .lean();
    res.json({ success: true, order: order || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/orders/:id/accept — claim a job.
 *
 * THREE races to survive, and none can be handled with a read-then-check:
 *   1. two agents accepting the SAME order — the status/agentUid filter
 *      decides, and the loser gets a 409
 *   2. one agent accepting TWO orders — a unique partial index on
 *      {agentUid} where isActiveJob:true raises E11000
 *   3. one agent accepting an order AND a multi-farm CONSIGNMENT. No index can
 *      see this one: `isActiveJob` is unique per agent inside Order and inside
 *      Consignment, but a MongoDB index cannot span collections, so between
 *      them they allowed a captain to hold one of each. One driver, one
 *      vehicle. Enforced here by check → claim → re-check; see the header of
 *      services/agentJobService.js for why that is safe.
 */
router.post('/:id/accept', requireAuth, requireRole('agent'), async (req, res) => {
  try {
    const vehicle = req.profile.vehicle || {};
    if (!vehicle.type)
      return res.status(400).json({ success: false, code: 'NO_VEHICLE', error: 'Add your vehicle details first' });

    const here = toLatLng({ lat: Number(req.body.lat), lng: Number(req.body.lng) });

    // 1. Cheap refusal for the common case: this captain is visibly busy, in
    //    either collection.
    const busyBefore = await activeJobOf(req.firebaseUid);
    if (busyBefore) return res.status(409).json(busyResponse(busyBefore));

    const order = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        status: 'awaiting_agent',
        agentUid: null,
        // Phase 6, B5b — must match the FEED's own widened filter
        // (routes/orders.js's /agent/available), or a truck captain shown a
        // tempo job here would tap Accept and get a false "Another driver
        // took this trip" on every single attempt, not just in a real race.
        vehicleType: { $in: vehicleTypesServableBy(vehicle.type) },
        // An order pooled into a shared run is claimed by accepting the RUN,
        // never on its own. Without this a released consignment's orders — which
        // go back to `awaiting_agent` while still carrying `consignmentId` —
        // would surface here and a second captain could take one out from under
        // the run.
        consignmentId: null,
      },
      {
        $set: {
          status: 'accepted',
          isActiveJob: true,
          agentUid: req.firebaseUid,
          agentName: req.profile.name,
          agentPhone: req.profile.phone,
          agentVehicleNumber: vehicle.number || null,
          acceptedAt: new Date(),
          ...(here ? {
            'tracking.lat': here.lat,
            'tracking.lng': here.lng,
            'tracking.seq': 0,
            'tracking.updatedAt': new Date(),
          } : {}),
        },
      },
      { new: true }
    );

    if (!order)
      return res.status(409).json({
        success: false, code: 'ALREADY_TAKEN',
        error: 'Another driver took this trip',
      });

    // 3. Re-check, now the claim is committed. A consignment accepted in the
    //    same instant is invisible to step 1 but visible here, and one of the
    //    two racers is guaranteed to see the other. Roll this claim back rather
    //    than leave the captain holding two jobs — a rejected claim costs one
    //    tap, two accepted jobs strands a farmer's crop.
    const busyAfter = await activeJobOf(req.firebaseUid, { excludeOrderId: order._id });
    if (busyAfter) {
      await Order.updateOne(
        { _id: order._id, agentUid: req.firebaseUid, status: 'accepted' },
        {
          $set: {
            status: 'awaiting_agent', agentUid: null, agentName: null,
            agentPhone: null, agentVehicleNumber: null, acceptedAt: null,
          },
          $unset: { isActiveJob: '' },
        }
      );
      return res.status(409).json(busyResponse(busyAfter));
    }

    // The "blue line" for leg A. Best-effort: a failed route must never undo
    // an accept the agent has already been told succeeded.
    if (here) {
      try {
        const approach = await getRoute(here, toLatLng(order.pickup));
        await Order.updateOne({ _id: order._id }, { $set: { approachPolyline: approach.polyline } });
        order.approachPolyline = approach.polyline;
      } catch { /* the trip works without a drawn approach line */ }
    }

    console.log(`🛵 Agent ${req.profile.name} accepted order ${order._id}`);
    // The agent needs the farmer's number to find the farm, and the pickup
    // code is read out BY the farmer, so it is not sent here.
    res.json({ success: true, order });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({
        success: false, code: 'ALREADY_BUSY',
        error: 'Finish your current trip first',
      });
    console.error('❌ Accept error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/orders/:id/reject — decline; never offered to this agent again. */
router.post('/:id/reject', requireAuth, requireRole('agent'), async (req, res) => {
  try {
    await Order.updateOne(
      { _id: req.params.id, status: 'awaiting_agent' },
      { $addToSet: { rejectedBy: req.firebaseUid } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/orders/:id/pickup — accepted → picked_up, gated on the farmer's code.
 * body: { otp }
 *
 * The handover gate exists because otherwise an agent turns up at a farm gate
 * where the farmer has heard nothing about a sale.
 */
router.post('/:id/pickup', requireAuth, requireRole('agent'), async (req, res) => {
  try {
    // ═══ WHAT THIS ROUTE USED TO RECORD: THE OTP, AND NOTHING ELSE ═════════
    //
    // `Order.pickupOutcome` has carried a weight block and a grade block since
    // the gate record was built, and the buyer's receipt and purchase list
    // already READ and DISPLAY both. But only the multi-farm run ever WROTE
    // them — so every single-farmer pickup, which is the commonest kind in
    // this app, produced a receipt saying "Not recorded" for a quantity the
    // buyer was paying for. The display side was honest about a hole the
    // recording side had simply left open.
    //
    // ── WHAT IS WIRED HERE, AND WHAT IS DELIBERATELY NOT ──────────────────
    //
    //   WEIGHT PROVENANCE — required, exactly as on a run. A captain at a
    //   single farm establishes a kilogram figure the same way they do at farm
    //   three of five, and "512 kg" on a receipt reads as measured whether or
    //   not anybody owned a scale. `estimated` is a first-class answer and is
    //   expected to be the common one; what is refused is SILENCE.
    //
    //   CONDITION — what the captain could see. The honest floor of what an
    //   independent driver is in a position to attest to.
    //
    //   ⚠️ NOT A GRADE. Ever, on this route. `requireRole('agent')` means the
    //   recorder here is ALWAYS a captain from the public pool, and this app
    //   does not ask a truck driver to certify size, colour uniformity and
    //   blemish tolerance on somebody else's crop — see data/gateRecord.js
    //   GRADING_ROLES. The farmer's declared grade stands, labelled unchecked,
    //   and the buyer judges the lot on arrival. A posted `observedGrade` is
    //   REFUSED rather than ignored, with the same code the run path uses.
    //
    //   ⚠️ NOT A SHORT PICKUP. `outcome` is always `collected_full` here. A
    //   short single-farmer pickup would need restocking, repricing and a
    //   settlement path — the state machine the consignment route has and this
    //   one does not. Building half of it would be worse than not having it,
    //   so the limitation is stated rather than approximated. A captain who
    //   finds less than was ordered has the grievance flow, as today.
    //
    // Body validation runs BEFORE the OTP is checked, deliberately: a
    // malformed request is malformed whether or not the code is right, and
    // answering "wrong code" to a request that never named a weighing method
    // would send a captain to ask the farmer for a code that was already fine.

    const weightMethod = req.body.weightMethod;
    if (!POSTABLE_WEIGHT_METHODS.includes(weightMethod))
      return res.status(400).json({
        success: false, code: 'WEIGHT_METHOD_REQUIRED',
        error: `weightMethod is required and must be one of: ${POSTABLE_WEIGHT_METHODS.join(', ')}. `
          + '"estimated" is an honest answer — most farm-gate pickups have no scale within reach. '
          + 'What is not accepted is leaving it blank, because an empty box lets a guess be read as '
          + 'a measurement.',
        weightMethods: POSTABLE_WEIGHT_METHODS,
      });
    const weightRef = String(req.body.weightRef || '').slice(0, 60);

    if (req.body.observedGrade != null)
      return res.status(409).json({
        success: false, code: 'GRADING_NOT_AVAILABLE',
        error: GRADING_REFUSED_NOTE,
        conditionFlags: CONDITION_FLAG_KEYS,
      });

    const cond = parseCondition(req.body);
    if (!cond.ok)
      return res.status(400).json({
        success: false, code: 'BAD_CONDITION',
        error: `Unknown condition flag: ${cond.unknown.join(', ')}. Condition is a fixed list.`,
        conditionFlags: CONDITION_FLAG_KEYS,
      });

    const now = new Date();
    const order = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        agentUid: req.firebaseUid,
        status: 'accepted',
        pickupOtp: String(req.body.otp || '').trim(),
      },
      // AN AGGREGATION-PIPELINE UPDATE, so `orderedKg`/`collectedKg` can be
      // taken from the document's OWN `quantityKg` inside the same atomic
      // write. The alternatives were both worse: reading the order first
      // reopens a check-then-write window on the very field being copied, and
      // a second updateOne afterwards would leave the order sitting in
      // `picked_up` with a half-written outcome in between. Written in ONE
      // guarded update, so an order can never hold a status without the record
      // of what was picked up — the same discipline the run path follows.
      //
      // The two figures are equal here and that is not a placeholder: this
      // route has no short path (see above), so what was ordered is what left
      // the farm. They are stored as a PAIR anyway because the receipt and the
      // grievance flow read the pair, and a receipt that printed only one of
      // them would lose the distinction the moment a short path ever exists.
      [{
        $set: {
          status: 'picked_up',
          pickedUpAt: now,
          'pickupOutcome.outcome': 'collected_full',
          'pickupOutcome.orderedKg': '$quantityKg',
          'pickupOutcome.collectedKg': '$quantityKg',
          'pickupOutcome.recordedAt': now,
          'pickupOutcome.recordedBy': req.firebaseUid,
          'pickupOutcome.recordedByRole': 'agent',
          'pickupOutcome.weight.method': weightMethod,
          'pickupOutcome.weight.ref': weightRef,
          'pickupOutcome.condition.checked': cond.checked,
          'pickupOutcome.condition.flags': cond.flags,
          'pickupOutcome.condition.note': String(req.body.conditionNote || '').slice(0, 300),
        },
      }],
      // `updatePipeline: true` is REQUIRED by Mongoose 9 to accept an array as
      // an update — without it the array is read as a plain update document
      // and throws. It is the opt-in, not a behaviour change.
      { new: true, updatePipeline: true }
    );
    if (!order)
      return res.status(400).json({
        success: false,
        error: 'Wrong code. Ask the farmer for the 4-digit pickup code.',
      });

    res.json({
      success: true,
      order,
      // The kilograms with their provenance in the same hand as the number.
      weight: describeWeight(weightMethod, weightRef, order.quantityKg),
      condition: describeCondition(order.pickupOutcome.condition),
      // Said in words rather than left for a screen to infer from a null
      // grade: nobody was asked, and here is where a quality dispute goes.
      gradingAvailable: false,
      gradingNote: GRADING_REFUSED_NOTE,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/orders/:id/deliver — picked_up → delivered, gated on the vendor's code.
 * Clears isActiveJob, which is what frees the agent for their next job.
 */
router.post('/:id/deliver', requireAuth, requireRole('agent'), async (req, res) => {
    const now = new Date();
  try {
    const order = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        agentUid: req.firebaseUid,
        status: 'picked_up',
        dropOtp: String(req.body.otp || '').trim(),
      },
      {
        $set: {
          status: 'delivered', deliveredAt: now, 'payment.status': 'collected',
          // The buyer's window opens the moment the crop arrives — that is when
          // they can first actually look at it.
          'inspection.opensAt': now,
          'inspection.expiresAt': new Date(now.getTime() + INSPECTION_WINDOW_HOURS * 3600e3),
          'inspection.windowHours': INSPECTION_WINDOW_HOURS,
        },
        // $unset, never `false` — an absent field drops out of the partial
        // index, whereas false would stay indexed and keep the agent blocked.
        $unset: { isActiveJob: '' },
      },
      { new: true }
    );
    if (!order)
      return res.status(400).json({
        success: false,
        error: 'Wrong code. Ask the buyer for the 4-digit delivery code.',
      });
    console.log(`📦 Order ${order._id} delivered by ${req.profile.name}`);
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/orders/:id/settle — the FARMER records that the vendor has paid
 * them for the crop. body: { method?: 'cash'|'upi'|'bank'|'other' }
 *
 * Farmer-only, and deliberately not derived from the delivery OTP: the agent
 * proving they handed goods over says nothing about whether the farmer has
 * their money. This endpoint is the only thing that flips settlement.
 *
 * Guarded on `settlement.farmerPaid: false` in the FILTER (not an if/save),
 * so two taps can't double-write a paidAt — same convention as every other
 * state transition in this file.
 */
/**
 * POST /api/orders/:id/pay — the BUYER pays the farmer through the app.
 *
 * ═══ ⚠️ THIS RAIL DOES NOT MOVE MONEY ═════════════════════════════════════
 *
 * There is no payment provider behind it. It exists so the whole trade can be
 * walked end to end — order, collection, payment, receipt — without depending
 * on a live gateway, a bank sandbox or an SMS. Every record it writes carries
 * `settlement.txn.simulated: true`, and that flag is what keeps a demo
 * transaction distinguishable from a real settlement in every query, trust
 * score and receipt. **Do not remove it to make the demo look cleaner.**
 *
 * Wiring a real provider later means replacing the block marked below and
 * setting `simulated: false`; nothing else in this handler has to change.
 *
 * ═══ WHY THE BUYER MAY SETTLE HERE, WHEN THEY MAY NOT ANYWHERE ELSE ═══════
 *
 * `/settle` is farmer-only and stays that way. The rule behind it was never
 * "the farmer must tap" — it was "only the person the money lands with can say
 * it landed", because with cash, UPI or a bank transfer this app genuinely
 * cannot know. A buyer marking their own cash payment received is
 * self-certification and is refused.
 *
 * A payment on the app's OWN rail is different in kind: the platform processed
 * it, so the platform's record is first-hand. That is the whole justification,
 * and it evaporates if this endpoint is ever pointed at an off-app method.
 */
const PAY_RAIL = 'farmapp_demo_rail';

router.post('/:id/pay', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    // ── where a real gateway call would go ──────────────────────────────
    // A provider would be charged here and its reference used below. Failure
    // handling would live here too; this rail cannot fail, which is precisely
    // why the record has to say it is simulated.
    const ref = `FM-PAY-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const now = new Date();

    // Guarded exactly like /settle: the expected state is IN THE FILTER, never
    // checked in JavaScript first, so two taps cannot both settle.
    const order = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        vendorUid: req.firebaseUid,
        'settlement.farmerPaid': false,
        status: { $in: ['picked_up', 'delivered', 'stranded'] },
      },
      {
        $set: {
          'settlement.farmerPaid': true,
          'settlement.paidAt': now,
          'settlement.method': 'in_app',
          'settlement.txn': {
            ref, at: now, rail: PAY_RAIL, simulated: true, paidByUid: req.firebaseUid,
          },
        },
      },
      { new: true }
    ).select('-pickupOtp -dropOtp -routePolyline -approachPolyline');

    if (!order) {
      // Say WHICH refusal it is. A generic 400 leaves the buyer's screen unable
      // to tell "already paid" from "not collected yet" — different actions.
      const existing = await Order.findOne({ _id: req.params.id, vendorUid: req.firebaseUid })
        .select('settlement status farmerPayout').lean();
      if (!existing) return res.status(404).json({ success: false, error: 'Order not found' });
      if (existing.settlement?.farmerPaid) {
        return res.status(409).json({
          success: false, code: 'ALREADY_PAID',
          error: 'This order has already been settled.',
          txn: existing.settlement?.txn || null,
        });
      }
      return res.status(409).json({
        success: false, code: 'NOT_COLLECTED',
        error: 'Nothing to pay for yet — this crop has not left the farm.',
        status: existing.status,
      });
    }

    // What the FARMER receives, which is not the buyer's headline: the crop
    // value only. The fare is the captain's and was never the farmer's money —
    // paying `grandTotal` to the farmer would overpay them by the transport.
    res.json({
      success: true,
      paid: {
        amount: order.farmerPayout,
        to: order.farmerName,
        ref,
        at: now,
        method: 'in_app',
        simulated: true,
        note: 'Demonstration rail — no funds were transferred.',
      },
      order,
    });
  } catch (err) {
    console.error('❌ Pay error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/settle', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const method = ['cash', 'upi', 'bank', 'other'].includes(req.body.method)
      ? req.body.method
      : 'cash';

    const order = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        farmerUid: req.firebaseUid,
        'settlement.farmerPaid': false,
        // Nothing to settle before the crop has left the farm; and a cancelled
        // order has no payout owing.
        //
        // `stranded` IS settleable, deliberately. The crop left the farm and
        // the run carrying it was abandoned — the farmer is owed exactly what
        // `farmerPayout` says, and if the buyer pays them anyway (which is what
        // ought to happen) refusing to let them record it would leave this app
        // asserting a debt that has already been cleared. Same rule as
        // everywhere else here: it RECORDS a settlement, it does not judge one.
        status: { $in: ['picked_up', 'delivered', 'stranded'] },
      },
      {
        $set: {
          'settlement.farmerPaid': true,
          'settlement.paidAt': new Date(),
          'settlement.method': method,
        },
      },
      { new: true }
    ).select('-pickupOtp -dropOtp -routePolyline -approachPolyline');

    if (!order) {
      // Distinguish "already settled" from "not yours / not yet collected",
      // so the farmer's app can show the right thing instead of a generic 400.
      const existing = await Order.findOne({ _id: req.params.id, farmerUid: req.firebaseUid })
        .select('settlement status').lean();
      if (!existing)
        return res.status(404).json({ success: false, error: 'Order not found' });
      if (existing.settlement?.farmerPaid)
        return res.status(409).json({
          success: false, code: 'ALREADY_SETTLED',
          error: 'This sale is already marked as paid.',
        });
      return res.status(409).json({
        success: false, code: 'NOT_COLLECTED',
        error: 'Mark this paid once the crop has been collected.',
      });
    }

    // ⚠️ WHAT `/settle` MEANS WITH AN ADVANCE IN PLAY, said out loud rather
    // than left to inference: it settles the WHOLE trade. `farmerPaid: true`
    // asserts the farmer has all of it, not just the balance — which is what
    // trustService and every existing list already read it as, and changing
    // that meaning would silently rewrite the payment history of every order
    // in Atlas.
    //
    // An advance that was AGREED and never separately recorded is not treated
    // as an error here. A buyer who paid the whole lot in one go at the end is
    // a real and common situation, and refusing the farmer's own "I have been
    // paid" because a form was skipped earlier would be the app arguing with
    // the only person who knows. It is reported instead.
    const exposure = exposureFor(order);
    const adv = order.settlement?.advance || {};
    const advanceNeverRecorded = (adv.agreedAmount > 0) && !adv.receivedAt;

    console.log(`💰 Order ${order._id}: farmer ${order.farmerName} marked ₹${order.farmerPayout} received (${method})`);
    res.json({
      success: true,
      order,
      exposure,
      settledWhat: 'full',
      ...(advanceNeverRecorded ? {
        note: `An advance of ₹${adv.agreedAmount} was agreed on this order and was never recorded `
          + 'as received separately. Marking this paid records that the FULL amount has arrived — '
          + 'if the advance never came and the rest did, raise a grievance instead of settling.',
        advanceNeverRecorded: true,
      } : {}),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/orders/:id/settle-advance — the FARMER records that the buyer's
 * ADVANCE actually arrived. body: { method?: 'cash'|'upi'|'bank'|'other' }
 *
 * ═══ WHY THIS IS A SEPARATE ROUTE FROM /settle ════════════════════════════
 *
 * `/settle` means "the trade is done, I have all my money" — `farmerPaid` is
 * read that way by services/trustService.js, by the farmer's order list and by
 * every existing query. An advance is emphatically NOT that: the crop has
 * usually not even been collected yet.
 *
 * ⚠️ FARMER-ONLY, AND FOR THE SAME REASON /settle IS. The buyer AGREED the
 * advance at order time; only the person whose bank account it lands in can say
 * it arrived. A buyer marking their own advance as sent would be exactly the
 * self-certification this app refuses everywhere else — and the whole point of
 * an advance is that the farmer stops carrying the trade alone, which a
 * buyer-asserted flag would not achieve.
 *
 * ⚠️ IT MOVES NO MONEY. Same rule as every other rupee figure here.
 *
 * Refused when no advance was agreed: recording the receipt of something
 * nobody promised is not a fact this app can hold.
 */
router.post('/:id/settle-advance', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const method = ['cash', 'upi', 'bank', 'other'].includes(req.body.method)
      ? req.body.method
      : 'cash';

    const order = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        farmerUid: req.firebaseUid,
        // The two guards that make this idempotent, both IN THE FILTER: an
        // advance must have been agreed, and it must not already be recorded.
        'settlement.advance.agreedAmount': { $gt: 0 },
        'settlement.advance.receivedAt': null,
        // A cancelled order owes nobody anything. `farmerPaid` is not checked:
        // an order settled in full without a separate advance record is a
        // finished trade, and the ALREADY_SETTLED branch below says so.
        status: { $in: ['awaiting_agent', 'no_agents', 'accepted', 'picked_up', 'delivered', 'stranded'] },
      },
      { $set: { 'settlement.advance.receivedAt': new Date(), 'settlement.advance.method': method } },
      { new: true }
    ).select('-pickupOtp -dropOtp -routePolyline -approachPolyline');

    if (!order) {
      // Say which of the four things is actually wrong, rather than one flat
      // 409 — the same discipline /settle already applies.
      const existing = await Order.findOne({ _id: req.params.id, farmerUid: req.firebaseUid })
        .select('settlement status farmerPayout').lean();
      if (!existing) return res.status(404).json({ success: false, error: 'Order not found' });
      if (!(existing.settlement?.advance?.agreedAmount > 0))
        return res.status(409).json({
          success: false, code: 'NO_ADVANCE_AGREED',
          error: 'No advance was agreed on this order, so there is none to record as received. '
            + 'What you are owed is the full crop value, once the buyer pays it.',
        });
      if (existing.settlement?.advance?.receivedAt)
        return res.status(409).json({
          success: false, code: 'ADVANCE_ALREADY_RECORDED',
          error: 'This advance is already recorded as received.',
        });
      return res.status(409).json({
        success: false, code: 'ORDER_CANCELLED',
        error: 'This order is cancelled, so nothing is owed on it.',
      });
    }

    console.log(`💵 Order ${order._id}: ${order.farmerName} confirmed advance `
      + `₹${order.settlement.advance.agreedAmount} received (${method})`);
    res.json({ success: true, order, exposure: exposureFor(order) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/orders/:id/exposure — who is carrying what on this order, right now.
 *
 * Parties only. Derived, never stored: `services/paymentExposureService.js`
 * computes it from the payout, the advance and the status, so the buyer's
 * screen and the farmer's screen cannot disagree about who is owed what.
 */
router.get('/:id/exposure', requireAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .select('farmerUid vendorUid agentUid status farmerPayout cropTotal settlement').lean();
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    const uid = req.firebaseUid;
    if (order.farmerUid !== uid && order.vendorUid !== uid)
      return res.status(403).json({
        success: false,
        error: 'Only the farmer and the buyer on this order can see what is owed on it.',
      });
    res.json({ success: true, exposure: exposureFor(order), viewer: order.farmerUid === uid ? 'farmer' : 'vendor' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/orders/:id/receipt — the full transaction record for one order.
 *
 * Parties only. Pulls together everything that happened to this trade:
 * the price and HOW it was arrived at (listed or negotiated), the split
 * between the farmer's payout and the agent's fare, the grade the farmer
 * declared, the settlement, the timeline, and any grievance raised.
 *
 * OTPs are deliberately absent. They are handover secrets, not a record of
 * one, and a receipt is the document most likely to be forwarded onwards.
 */
router.get('/:id/receipt', requireAuth, async (req, res) => {
  try {
    const uid = req.firebaseUid;
    const order = await Order.findById(req.params.id)
      .select('-pickupOtp -dropOtp -routePolyline -approachPolyline -tracking')
      .lean();
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    // ⚠️ THE FPO ADMIN IS ADMITTED, AND THAT GAP WAS A REAL 403.
    // FpoOrdersScreen offers "Open receipt" on every delivered order in the
    // group, and this gate matched only farmerUid/vendorUid/agentUid — so an
    // `fpo`-role officer tapping it got "You were not part of this order" on
    // an order belonging to their own member.
    //
    // The gate is EXACTLY the one routes/disputes.js already uses for the
    // grievance trail, for the same stated reason: the FPO is very often the
    // body that actually settles a member's trade, and it cannot do that from
    // a screen it cannot open. Membership accepts a null status — rows written
    // before the approval gate have none, and .lean() applies no defaults.
    //
    // The CAPTAIN keeps their existing access (they drove it) but no wider
    // right; nobody else is admitted.
    let role = order.farmerUid === uid ? 'farmer'
      : order.vendorUid === uid ? 'vendor'
        : order.agentUid === uid ? 'agent'
          : null;

    if (!role && order.farmerUid) {
      const grp = await Fpo.findOne({
        adminUid: uid, status: 'active',
        members: { $elemMatch: { farmerUid: order.farmerUid, status: { $in: ['active', null] } } },
      }).select('_id').lean();
      if (grp) role = 'fpo_admin';
    }

    if (!role) return res.status(403).json({ success: false, error: 'You were not part of this order' });

    // Joined rather than denormalised: a receipt is read rarely, and a stale
    // copy of a dispute on the order would be worse than one extra query.
    const [offer, disputes, listing, band] = await Promise.all([
      order.offerId ? Offer.findById(order.offerId).select('-__v').lean() : null,
      Dispute.find({ orderId: order._id })
        .select('reason status description response resolution raisedByRole againstRole createdAt').lean(),
      CropListing.findById(order.listingId).select('grade gradeNote variety').lean(),
      // ⚠️ NEVER ALLOWED TO BREAK THE RECEIPT. Agmarknet 403s, times out and
      // goes down; the service already swallows its own errors, and this
      // `.catch` is the second belt. A receipt is a record of a trade that
      // happened — it must render whether or not a price server answers.
      priceBand.forOrder({
        cropName: order.cropName,
        district: order.pickup?.district,
        pricePerKg: order.pricePerKg,
        at: order.deliveredAt || order.createdAt,
      }).catch(() => null),
    ]);

    res.json({
      success: true,
      receipt: {
        receiptNo: `FM-${String(order._id).slice(-8).toUpperCase()}`,
        orderId: order._id,
        issuedTo: role,
        status: order.status,

        crop: {
          name: order.cropName,
          localName: order.cropLocalName || '',
          variety: listing?.variety || 'Standard',
          quantityKg: order.quantityKg,
          // What was AGREED beside what actually left the farm. A short pickup
          // rewrites quantityKg, so without this the shortfall vanishes from
          // the one document most likely to be forwarded onwards.
          orderedKg: order.pickupOutcome?.orderedKg ?? order.quantityKg,
          // ⚠️ WHERE THAT QUANTITY CAME FROM. Weight used to be asserted twice
          // — by the farmer when listing and by the captain at pickup — and
          // measured never, so a receipt printed a figure that read as
          // measured whoever had or had not owned a scale. It does not print
          // alone any more. See data/gateRecord.js.
          weight: describeWeight(
            order.pickupOutcome?.weight?.method,
            order.pickupOutcome?.weight?.ref,
            order.quantityKg
          ),
          weighedByRole: order.pickupOutcome?.recordedByRole || null,
          // C3: what the farmer declared, and that they declared it.
          grade: listing?.grade?.code || null,
          gradeSelfDeclared: listing?.grade?.selfDeclared ?? true,
          gradeNote: listing?.grade?.note || listing?.gradeNote || '',
          // E1/E3: what the person who collected it says they actually saw,
          // and how the farmer answered if it was lower. A record of a
          // disagreement — the money on this receipt is unchanged by it.
          gradeCheck: describeGradeCheck(order.pickupOutcome?.grade),
          // ⚠️ NOT A WEAKER GRADE — a different kind of statement, one that
          // needs eyes and not expertise. `checked: false` ("nobody looked")
          // and `checked: true, flags: []` ("looked, saw nothing wrong") stay
          // different facts all the way onto this receipt: collapsing them
          // would report silence as a clean bill of health on the one document
          // most likely to be forwarded onwards.
          condition: describeCondition(order.pickupOutcome?.condition),
        },

        money: {
          pricePerKg: order.pricePerKg,
          // Says plainly whether this was the asking price or a settled one.
          priceSource: order.priceSource || 'listing',
          listedPricePerKg: offer ? offer.askingPricePerKg : null,
          cropTotal: order.cropTotal,
          fare: order.fare?.total ?? 0,
          grandTotal: order.grandTotal,
          // The split that B1 added, restated so a receipt cannot be read as
          // "the agent collected everything".
          farmerPayout: order.farmerPayout ?? order.cropTotal,
          collectedByAgent: order.fare?.total ?? 0,
          note: 'The buyer pays the transport fare to the driver and the crop value to the farmer directly.',
        },

        // ── WAS THIS A FAIR PRICE? ────────────────────────────────────
        // The agreed rate beside what the district's mandis were actually
        // paying that week. Reports, never blocks — and says `available:
        // false` with a reason rather than inventing a benchmark.
        priceCheck: band,

        // ── WHO CARRIED WHAT, AND WHEN ────────────────────────────────
        // The receipt is the document most likely to be forwarded onwards, so
        // the advance/balance split belongs on it. Derived by the one shared
        // function, so this and the buyer's own screen cannot disagree.
        exposure: exposureFor(order),

        settlement: {
          farmerPaid: order.settlement?.farmerPaid ?? false,
          paidAt: order.settlement?.paidAt || null,
          method: order.settlement?.method || null,
          // ⚠️ THE TRANSACTION, INCLUDING `simulated`. A receipt is the most
          // forwarded document this app produces — it goes to APMC officers,
          // to buyers' accountants, to whoever the two parties actually trust.
          // If a payment was made on the demonstration rail then the piece of
          // paper that leaves this app has to SAY so; printing a reference
          // number with no such note is how a simulated settlement starts
          // being read as a real one by people who were never told.
          txn: order.settlement?.txn?.ref ? {
            ref: order.settlement.txn.ref,
            at: order.settlement.txn.at,
            simulated: !!order.settlement.txn.simulated,
          } : null,
        },

        negotiation: offer ? {
          offeredPricePerKg: offer.offerPricePerKg,
          counteredPricePerKg: offer.counterPricePerKg,
          agreedPricePerKg: offer.agreedPricePerKg,
          askingPricePerKg: offer.askingPricePerKg,
          buyerVerification: offer.vendorVerification,
        } : null,

        parties: {
          farmer: { name: order.farmerName, uid: order.farmerUid },
          vendor: { name: order.vendorName, company: order.vendorCompany || '', uid: order.vendorUid },
          agent: order.agentUid
            ? { name: order.agentName || '', uid: order.agentUid, vehicle: order.vehicleType }
            : null,
        },

        logistics: {
          pickup: order.pickup?.label || '',
          dropoff: order.dropoff?.label || '',
          distanceKm: order.distanceKm,
          vehicleType: order.vehicleType,
        },

        timeline: [
          ['ordered', order.createdAt],
          ['driver accepted', order.acceptedAt],
          ['collected', order.pickedUpAt],
          ['delivered', order.deliveredAt],
          ['farmer paid', order.settlement?.paidAt],
          ['cancelled', order.cancelledAt],
        ].filter(([, at]) => !!at).map(([event, at]) => ({ event, at })),

        disputes: disputes.map((d) => ({
          reason: d.reason,
          status: d.status,
          by: d.raisedByRole,
          against: d.againstRole,
          outcome: d.resolution?.outcome || null,
          raisedAt: d.createdAt,
        })),
      },
    });
  } catch (err) {
    console.error('❌ Receipt error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/orders/:id/location — the agent's position ping (~every 5s).
 * body: { lat, lng, heading, seq, simulated }
 *
 * `seq` is a monotonic counter the client increments, NOT a timestamp. Mobile
 * networks reorder packets, so without an ordering guard the marker jumps
 * backwards; and a phone clock that is wrong by minutes would freeze the
 * marker permanently if we compared timestamps instead.
 */
router.post('/:id/location', requireAuth, requireRole('agent'), async (req, res) => {
  try {
    const here = toLatLng({ lat: Number(req.body.lat), lng: Number(req.body.lng) });
    const seq = Number(req.body.seq);
    if (!here || !Number.isFinite(seq))
      return res.status(400).json({ success: false, error: 'lat, lng and seq are required' });

    const r = await Order.updateOne(
      {
        _id: req.params.id,
        agentUid: req.firebaseUid,
        status: { $in: ['accepted', 'picked_up'] },
        'tracking.seq': { $lt: seq },      // drops any ping that arrives late
      },
      {
        $set: {
          'tracking.lat': here.lat,
          'tracking.lng': here.lng,
          'tracking.heading': Number(req.body.heading) || 0,
          'tracking.seq': seq,
          'tracking.updatedAt': new Date(),
          'tracking.simulated': !!req.body.simulated,
        },
      }
    );
    // matchedCount 0 just means a stale ping or a finished trip — not an error
    // worth surfacing to a driver who is driving.
    res.json({ success: true, applied: r.modifiedCount > 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/orders/:id/track — the polling payload for the vendor's map.
 *
 * Deliberately small: polylines are only sent when ?full=1, which the client
 * asks for once on mount. At 5s polling a 300-point polyline every tick would
 * be several MB an hour for data that never changes.
 */
router.get('/:id/track', requireAuth, async (req, res) => {
  try {
    const full = req.query.full === '1';
    // pickupOtp is never sent here; dropOtp is kept only long enough to hand
    // it to the vendor below, and stripped for everyone else.
    const projection = full
      ? '-pickupOtp'
      : '-pickupOtp -dropOtp -routePolyline -approachPolyline';

    const order = await Order.findById(req.params.id).select(projection).lean();
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    const uid = req.firebaseUid;
    if (![order.vendorUid, order.farmerUid, order.agentUid].includes(uid))
      return res.status(403).json({ success: false, error: 'Not your order' });

    const t = order.tracking || {};
    const ageSec = t.updatedAt ? Math.round((Date.now() - new Date(t.updatedAt)) / 1000) : null;

    // Remaining distance from where the vehicle actually is to where it is
    // headed next — straight-line, scaled. Good enough for an ETA chip, and it
    // costs no OSRM call per poll.
    const target = order.status === 'picked_up' ? toLatLng(order.dropoff) : toLatLng(order.pickup);
    const at = (t.lat != null && t.lng != null) ? { lat: t.lat, lng: t.lng } : null;
    const remainingKm = (at && target) ? roundKm(haversineKm(at, target) * 1.35) : null;

    res.json({
      success: true,
      track: {
        _id: order._id,
        status: order.status,
        // A POOLED ORDER IS NOT TRACKED HERE, AND SAYS SO. When this order
        // rides a shared run the vehicle carries several farmers' crops, so
        // the position belongs to the RUN — nothing ever posts to
        // Order.tracking for it, and a client polling this endpoint would sit
        // on an empty `tracking` block forever thinking the driver's app was
        // shut. `trackVia` tells it which endpoint is the live one.
        consignmentId: order.consignmentId || null,
        trackVia: order.consignmentId ? 'consignment' : 'order',
        tracking: t,
        // The client shows "last seen N min ago" instead of a frozen marker
        // pretending to be live. Foreground-only tracking makes gaps normal.
        ageSec,
        stale: ageSec == null || ageSec > 30,
        remainingKm,
        etaMin: remainingKm != null ? Math.max(1, Math.round((remainingKm / 35) * 60)) : null,
        agentName: order.agentName,
        agentPhone: order.agentPhone,
        agentVehicleNumber: order.agentVehicleNumber,
        vehicleType: order.vehicleType,
        pickup: order.pickup,
        dropoff: order.dropoff,
        ...(full ? {
          routePolyline: order.routePolyline,
          approachPolyline: order.approachPolyline,
          quantityKg: order.quantityKg,
          cropName: order.cropName,
          grandTotal: order.grandTotal,
          dropOtp: uid === order.vendorUid ? order.dropOtp : undefined,
        } : {}),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

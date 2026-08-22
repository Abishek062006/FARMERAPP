const express = require('express');
const router  = express.Router();
const Order = require('../models/Order');
const CropListing = require('../models/CropListing');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { toLatLng, resolveDistrict, haversineKm, roundKm } = require('../services/geoService');
const { getRoute } = require('../services/routeService');
const { quote, quoteAll } = require('../services/fareService');

const DISPATCH_WINDOW_MS = 5 * 60 * 1000;
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
      const cropTotal = qty * listing.pricePerKg;
      order = await Order.create({
        idempotencyKey: idempotencyKey || undefined,
        listingId: listing._id,
        cropId: listing.cropId,
        cropName: listing.cropName,
        cropTamilName: listing.cropTamilName,
        proofImageId: listing.proofImageId,
        quantityKg: qty,
        pricePerKg: listing.pricePerKg,
        cropTotal,

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

        status: 'awaiting_agent',
        dispatchExpiresAt: new Date(Date.now() + DISPATCH_WINDOW_MS),
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

    // If what is left is under the farmer's own minimum, nobody can ever buy
    // it. $expr compares two fields of the same document.
    await CropListing.updateOne(
      { _id: listingId, status: 'available', $expr: { $lt: ['$quantityAvailableKg', '$minOrderKg'] } },
      { $set: { status: 'sold_out' } }
    );

    console.log(`🛒 Order ${order._id}: ${qty}kg ${listing.cropName} · ${vehicleType} · ${route.distanceKm}km · ₹${order.grandTotal}`);
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
 */
router.post('/:id/retry', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, vendorUid: req.firebaseUid, status: 'no_agents' },
      { $set: { status: 'awaiting_agent', dispatchExpiresAt: new Date(Date.now() + DISPATCH_WINDOW_MS), rejectedBy: [] } },
      { new: true }
    );
    if (!order) return res.status(409).json({ success: false, error: 'This order cannot be re-dispatched' });
    res.json({ success: true, order });
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
router.get('/agent/available', requireAuth, requireRole('agent'), async (req, res) => {
  try {
    await sweepExpired();

    const vehicleType = req.profile.vehicle && req.profile.vehicle.type;
    if (!vehicleType)
      return res.status(400).json({ success: false, code: 'NO_VEHICLE', error: 'Add your vehicle details first' });

    // An agent already mid-job is offered nothing — the DB enforces one active
    // job each, so showing more would only produce failed accepts.
    const current = await Order.findOne({ agentUid: req.firebaseUid, isActiveJob: true }).lean();
    if (current) return res.json({ success: true, orders: [], busy: true });

    const orders = await Order.find({
      status: 'awaiting_agent',
      vehicleType,                                  // only jobs this vehicle can take
      rejectedBy: { $ne: req.firebaseUid },         // never re-offer a declined job
    }).select('-routePolyline -pickupOtp -dropOtp -farmerPhone -vendorPhone')
      .sort({ createdAt: 1 }).limit(20).lean();

    const me = toLatLng({ lat: Number(req.query.lat), lng: Number(req.query.lng) })
            || toLatLng(req.profile.location);

    for (const o of orders) {
      const p = toLatLng(o.pickup);
      o.approachKm = (me && p) ? roundKm(haversineKm(me, p)) : null;
      o.expiresInSec = Math.max(0, Math.round((new Date(o.dispatchExpiresAt) - Date.now()) / 1000));
    }
    orders.sort((a, b) =>
      ((a.approachKm == null) - (b.approachKm == null)) || ((a.approachKm ?? 0) - (b.approachKm ?? 0)));

    res.json({ success: true, orders, busy: false });
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
 * Two races to survive, and neither can be handled with a read-then-check:
 *   1. two agents accepting the SAME order — the status/agentUid filter
 *      decides, and the loser gets a 409
 *   2. one agent accepting TWO orders — a unique partial index on
 *      {agentUid} where isActiveJob:true raises E11000
 */
router.post('/:id/accept', requireAuth, requireRole('agent'), async (req, res) => {
  try {
    const vehicle = req.profile.vehicle || {};
    if (!vehicle.type)
      return res.status(400).json({ success: false, code: 'NO_VEHICLE', error: 'Add your vehicle details first' });

    const here = toLatLng({ lat: Number(req.body.lat), lng: Number(req.body.lng) });

    const order = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        status: 'awaiting_agent',
        agentUid: null,
        vehicleType: vehicle.type,      // cannot claim a job your vehicle can't do
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
    const order = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        agentUid: req.firebaseUid,
        status: 'accepted',
        pickupOtp: String(req.body.otp || '').trim(),
      },
      { $set: { status: 'picked_up', pickedUpAt: new Date() } },
      { new: true }
    );
    if (!order)
      return res.status(400).json({
        success: false,
        error: 'Wrong code. Ask the farmer for the 4-digit pickup code.',
      });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/orders/:id/deliver — picked_up → delivered, gated on the vendor's code.
 * Clears isActiveJob, which is what frees the agent for their next job.
 */
router.post('/:id/deliver', requireAuth, requireRole('agent'), async (req, res) => {
  try {
    const order = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        agentUid: req.firebaseUid,
        status: 'picked_up',
        dropOtp: String(req.body.otp || '').trim(),
      },
      {
        $set: { status: 'delivered', deliveredAt: new Date(), 'payment.status': 'collected' },
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

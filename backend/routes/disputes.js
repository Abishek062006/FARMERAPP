const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const Dispute = require('../models/Dispute');
const Order = require('../models/Order');
const ListingImage = require('../models/ListingImage');
const Consignment = require('../models/Consignment');
const CropListing = require('../models/CropListing');
const Fpo = require('../models/Fpo');
// One grievance with everything this app actually recorded about it, for the
// human who has to decide. ⚠️ It assembles and it names GAPS — it never
// ranks, scores or concludes. See that file's header.
const { buildEvidence, renderText } = require('../services/disputeEvidenceService');
const { requireAuth } = require('../middleware/auth');

// memoryStorage, matching routes/crops.js: evidence photos go straight into
// Mongo and never touch the filesystem.
const uploadEvidence = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files are allowed')),
});

// How long after delivery a grievance can still be raised. Long enough for a
// buyer to actually open the sacks and for a farmer to notice they were never
// paid; short enough that the counterparty is not exposed indefinitely.
const DISPUTE_WINDOW_DAYS = 14;

const REASONS = [
  'quality_not_as_described', 'quantity_short', 'wrong_crop',
  'damaged_in_transit', 'not_delivered', 'payment_not_received',
  'payment_disputed', 'other',
];

/**
 * Which of the three parties is this uid, on this order?
 * Returns null for everyone else — which is the whole access check.
 */
function roleInOrder(order, uid) {
  if (order.farmerUid === uid) return 'farmer';
  if (order.vendorUid === uid) return 'vendor';
  if (order.agentUid === uid) return 'agent';
  return null;
}

/**
 * Who the complaint is against, derived from the order.
 *
 * Deliberately computed rather than accepted from the request: a raiser who
 * could name their counterparty could file a grievance against someone who
 * had nothing to do with the trade.
 */
function counterparty(order, raiserRole, reason) {
  // A transport complaint is against the agent, when there is one.
  if (['damaged_in_transit', 'not_delivered'].includes(reason) && order.agentUid && raiserRole !== 'agent')
    return { uid: order.agentUid, name: order.agentName || '', role: 'agent' };

  if (raiserRole === 'farmer') return { uid: order.vendorUid, name: order.vendorName || '', role: 'vendor' };
  if (raiserRole === 'vendor') return { uid: order.farmerUid, name: order.farmerName || '', role: 'farmer' };
  // An agent complaining is complaining about the buyer who owes them the fare.
  return { uid: order.vendorUid, name: order.vendorName || '', role: 'vendor' };
}

/**
 * POST /api/disputes   (multipart: up to 4 photos under `photos`)
 * body: { orderId, reason, description }
 */
router.post('/', requireAuth, uploadEvidence.array('photos', 4), async (req, res) => {
  try {
    const { orderId, reason, description } = req.body;

    if (!mongoose.isValidObjectId(orderId))
      return res.status(400).json({ success: false, error: 'A valid orderId is required' });
    if (!REASONS.includes(reason))
      return res.status(400).json({ success: false, error: `reason must be one of: ${REASONS.join(', ')}` });
    if (!description || !String(description).trim())
      return res.status(400).json({ success: false, error: 'Describe what went wrong' });

    const order = await Order.findById(orderId).lean();
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    const role = roleInOrder(order, req.firebaseUid);
    if (!role)
      return res.status(403).json({ success: false, error: 'You were not part of this order' });

    // Nothing to dispute about a trade that never happened.
    if (order.status === 'cancelled')
      return res.status(409).json({
        success: false, code: 'ORDER_CANCELLED',
        error: 'This order was cancelled — there is nothing to dispute.',
      });

    // The window runs from delivery, or from creation for an order that never
    // got that far (which is itself a legitimate complaint: 'not_delivered').
    const from = order.deliveredAt || order.createdAt;
    const days = (Date.now() - new Date(from).getTime()) / 86400000;
    if (days > DISPUTE_WINDOW_DAYS)
      return res.status(409).json({
        success: false, code: 'WINDOW_CLOSED',
        error: `Grievances can be raised within ${DISPUTE_WINDOW_DAYS} days. This order is ${Math.floor(days)} days old.`,
      });

    const against = counterparty(order, role, reason);
    if (!against.uid)
      return res.status(409).json({
        success: false, code: 'NO_COUNTERPARTY',
        error: 'No driver has taken this order yet, so there is nobody to raise a transport issue against.',
      });

    // Photos first: if a dispute saved but its evidence did not, the record
    // would understate the complaint.
    const photoIds = [];
    for (const f of req.files || []) {
      const img = await ListingImage.create({
        ownerUid: req.firebaseUid,
        contentType: f.mimetype,
        data: f.buffer,
      });
      photoIds.push(img._id);
    }

    let dispute;
    try {
      dispute = await Dispute.create({
        orderId: order._id,
        cropName: order.cropName,
        quantityKg: order.quantityKg,
        orderTotal: order.grandTotal,
        raisedByUid: req.firebaseUid,
        raisedByName: req.profile?.name || '',
        raisedByRole: role,
        againstUid: against.uid,
        againstName: against.name,
        againstRole: against.role,
        reason,
        description: String(description).slice(0, 1000),
        photoIds,
      });
    } catch (err) {
      // Compensate: an orphaned photo is invisible but still costs storage.
      if (photoIds.length) await ListingImage.deleteMany({ _id: { $in: photoIds } });
      if (err.code === 11000)
        return res.status(409).json({
          success: false, code: 'ALREADY_OPEN',
          error: 'You already have an open grievance on this order. Add to that one instead.',
        });
      throw err;
    }

    console.log(`⚠️  Dispute ${dispute._id}: ${role} ${dispute.raisedByName} → ${against.role} (${reason}) on ${order.cropName}`);
    res.status(201).json({ success: true, dispute });
  } catch (err) {
    console.error('❌ Create dispute error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/disputes/mine — raised by me, or against me. */
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const uid = req.firebaseUid;
    const filter = { $or: [{ raisedByUid: uid }, { againstUid: uid }] };
    if (req.query.open === '1') filter.status = { $in: ['open', 'responded'] };

    const disputes = await Dispute.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    res.json({
      success: true,
      // Which side the caller is on, so the client does not have to work it out.
      disputes: disputes.map((d) => ({ ...d, iRaised: d.raisedByUid === uid })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/disputes/:id — either party only. */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const d = await Dispute.findById(req.params.id).lean();
    if (!d) return res.status(404).json({ success: false, error: 'Not found' });
    if (d.raisedByUid !== req.firebaseUid && d.againstUid !== req.firebaseUid)
      return res.status(403).json({ success: false, error: 'This grievance is not yours' });
    res.json({ success: true, dispute: { ...d, iRaised: d.raisedByUid === req.firebaseUid } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/disputes/:id/evidence      — the trail as JSON
 * GET /api/disputes/:id/evidence.txt  — the same trail as plain text
 *
 * ═══ WHAT THIS IS FOR ══════════════════════════════════════════════════════
 *
 * A human still has to decide. This app does not adjudicate disputes and is not
 * going to start — that is a settled rule and building a team to decide who is
 * right is a staffing commitment, not a feature.
 *
 * What it CAN do is make that human's job easy. Everything the decision turns
 * on is already stored, scattered across four collections: who stood at the
 * gate, how the weight was established, what the lot looked like, what grade
 * was claimed against what was declared, whether the farmer CONCEDED it, when
 * money was promised and when it arrived. Assembling that into one trail is the
 * whole contribution — without it whoever arbitrates reads four screens and
 * makes a phone call.
 *
 * ⚠️ THE `.txt` FORM IS THE POINT, NOT A CONVENIENCE. An APMC officer does not
 * have an account here, and neither does the elder both parties actually trust.
 * It goes out through the OS share sheet, the same road the CSV export already
 * takes — Expo Go cannot write to Downloads and an authenticated URL arrives
 * without a token.
 *
 * ⚠️ NOTHING IN IT RANKS, SCORES OR CONCLUDES. There is no "likely at fault"
 * field. `recordStrength` describes how much is documented, never who is
 * telling the truth, and `gaps` names what was NEVER recorded because absence
 * decides quantity disputes more often than any number does.
 */
async function loadEvidence(req, res) {
  const d = await Dispute.findById(req.params.id).lean();
  if (!d) { res.status(404).json({ success: false, error: 'Not found' }); return null; }

  const order = await Order.findById(d.orderId)
    .select('-pickupOtp -dropOtp -routePolyline -approachPolyline -tracking').lean();

  // ── WHO MAY READ IT ──────────────────────────────────────────────────
  //
  // The two parties, and — DELIBERATELY WIDER — the admin of the FPO whose
  // member is on this order. An FPO is one of the humans this trail exists
  // for: when a member's lot is disputed, the group is very often the body
  // that actually settles it, and it cannot do that from four screens it
  // cannot open. The captain is NOT admitted even when they recorded the
  // gate: they are a witness to one moment, not a party to the trade, and
  // the trail carries both parties' payment history and trust records.
  const uid = req.firebaseUid;
  let viewer = null;
  if (d.raisedByUid === uid) viewer = 'raiser';
  else if (d.againstUid === uid) viewer = 'respondent';
  else if (order?.farmerUid) {
    const fpo = await Fpo.findOne({
      adminUid: uid, status: 'active',
      members: { $elemMatch: { farmerUid: order.farmerUid, status: { $in: ['active', null] } } },
    }).select('_id').lean();
    if (fpo) viewer = 'fpo_admin';
  }
  if (!viewer) {
    res.status(403).json({
      success: false,
      error: 'This grievance record is for the two parties to it, and for the admin of the group '
        + 'the farmer belongs to.',
    });
    return null;
  }

  const [consignment, listing] = await Promise.all([
    order?.consignmentId ? Consignment.findById(order.consignmentId).lean() : null,
    order?.listingId ? CropListing.findById(order.listingId).select('grade cropName').lean() : null,
  ]);

  const evidence = await buildEvidence({ dispute: d, order, consignment, listing });
  return { evidence, dispute: d, order, viewer };
}

router.get('/:id/evidence', requireAuth, async (req, res) => {
  try {
    const loaded = await loadEvidence(req, res);
    if (!loaded) return;
    res.json({ success: true, viewer: loaded.viewer, evidence: loaded.evidence });
  } catch (err) {
    console.error('❌ Dispute evidence error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/evidence.txt', requireAuth, async (req, res) => {
  try {
    const loaded = await loadEvidence(req, res);
    if (!loaded) return;
    const text = renderText(loaded.evidence, { orderId: loaded.dispute.orderId });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    // A filename a human can find again in a WhatsApp thread six weeks later.
    res.setHeader('Content-Disposition',
      `attachment; filename="grievance-${loaded.dispute._id}.txt"`);
    res.send(text);
  } catch (err) {
    console.error('❌ Dispute evidence text error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/disputes/:id/respond — the accused party answers.
 * body: { response }
 */
router.put('/:id/respond', requireAuth, async (req, res) => {
  try {
    const { response } = req.body;
    if (!response || !String(response).trim())
      return res.status(400).json({ success: false, error: 'Write your response' });

    const d = await Dispute.findOneAndUpdate(
      { _id: req.params.id, againstUid: req.firebaseUid, status: 'open' },
      {
        $set: {
          status: 'responded',
          response: String(response).slice(0, 1000),
          respondedAt: new Date(),
        },
      },
      { new: true }
    );
    if (!d) return res.status(409).json(await why(req.params.id, req.firebaseUid, 'respond'));

    res.json({ success: true, dispute: d });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/disputes/:id/resolve — either party marks it settled.
 * body: { outcome, amount?, note? }
 *
 * Both sides can close it, and the record says which did. The app is not
 * deciding anything here — it is writing down what two people agreed.
 */
router.put('/:id/resolve', requireAuth, async (req, res) => {
  try {
    const OUTCOMES = ['refund_agreed', 'partial_refund_agreed', 'replacement_agreed', 'no_action', 'none'];
    const { outcome, amount, note } = req.body;
    if (!OUTCOMES.includes(outcome))
      return res.status(400).json({ success: false, error: `outcome must be one of: ${OUTCOMES.join(', ')}` });

    const uid = req.firebaseUid;
    const existing = await Dispute.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });
    const role = existing.raisedByUid === uid ? existing.raisedByRole
      : existing.againstUid === uid ? existing.againstRole
        : null;
    if (!role) return res.status(403).json({ success: false, error: 'This grievance is not yours' });

    const d = await Dispute.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['open', 'responded'] } },
      {
        $set: {
          status: 'resolved',
          'resolution.outcome': outcome,
          'resolution.amount': Number.isFinite(Number(amount)) ? Number(amount) : null,
          'resolution.note': String(note || '').slice(0, 500),
          'resolution.resolvedAt': new Date(),
          'resolution.resolvedBy': uid,
          'resolution.resolvedByRole': role,
        },
      },
      { new: true }
    );
    if (!d) return res.status(409).json(await why(req.params.id, uid, 'resolve'));

    console.log(`✅ Dispute ${d._id} resolved by ${role}: ${outcome}`);
    res.json({ success: true, dispute: d });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** PUT /api/disputes/:id/withdraw — only the person who raised it. */
router.put('/:id/withdraw', requireAuth, async (req, res) => {
  try {
    const d = await Dispute.findOneAndUpdate(
      { _id: req.params.id, raisedByUid: req.firebaseUid, status: { $in: ['open', 'responded'] } },
      { $set: { status: 'withdrawn', 'resolution.resolvedAt': new Date() } },
      { new: true }
    );
    if (!d) return res.status(409).json(await why(req.params.id, req.firebaseUid, 'withdraw'));
    res.json({ success: true, dispute: d });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Why did a guarded update match nothing? Same approach as routes/offers.js. */
async function why(id, uid, action) {
  const d = await Dispute.findById(id).lean();
  if (!d) return { success: false, code: 'NOT_FOUND', error: 'Not found' };
  if (d.raisedByUid !== uid && d.againstUid !== uid)
    return { success: false, code: 'NOT_YOURS', error: 'This grievance is not yours' };
  if (!['open', 'responded'].includes(d.status))
    return { success: false, code: 'ALREADY_CLOSED', error: `This grievance was already ${d.status}.`, status: d.status };
  if (action === 'respond' && d.raisedByUid === uid)
    return { success: false, code: 'CANNOT_RESPOND_TO_SELF', error: 'You raised this grievance — you cannot answer it.' };
  if (action === 'respond' && d.status === 'responded')
    return { success: false, code: 'ALREADY_RESPONDED', error: 'You have already responded.' };
  if (action === 'withdraw' && d.raisedByUid !== uid)
    return { success: false, code: 'NOT_RAISER', error: 'Only the person who raised it can withdraw it.' };
  return { success: false, code: 'CANNOT', error: `You cannot ${action} this grievance right now.` };
}

module.exports = router;

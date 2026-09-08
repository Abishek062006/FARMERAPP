const express = require('express');
const router = express.Router();
const FpoMaster = require('../models/FpoMaster');
const FpoAdminClaim = require('../models/FpoAdminClaim');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const DESIGNATIONS = ['CEO', 'Manager', 'Director', 'Authorized Representative'];

// WHO MAY CLAIM TO REPRESENT AN FPO.
//
//   'fpo'     the intended path. A person registering as an FPO chooses their
//             organisation from the SFAC registry as the next step after
//             signup — that is what the role is for.
//   'farmer'  kept, permanently, for backward compatibility. Every FPO admin
//             in Atlas today is a farmer account that claimed one before the
//             `fpo` role existed, and a farmer who genuinely is their group's
//             elected office-bearer is a real and common situation.
//
// A `vendor` or `agent` is refused: a buyer or a truck driver claiming to be
// the officer of a producer company is not a case worth supporting, and the
// designations on offer (CEO / Manager / Director / Authorized Representative)
// already say what kind of person this is meant to be.
//
// Same list as FPO_ADMIN_ROLES in routes/fpos.js, and it must stay the same
// list: claiming an FPO and administering one are the two ends of one path.
const CLAIMANT_ROLES = ['farmer', 'fpo'];

/**
 * GET /api/fpo-master/search?state=&district=&block=&crop=
 *
 * Any authenticated role — a farmer looking for their real FPO, or a buyer
 * checking one is legitimate before dealing with its self-declared admin.
 *
 * `crop` is accepted but currently ignored: a real FPO's SFAC registry entry
 * does not list what its members grow, so there is nothing here to match it
 * against. Crop-matching belongs at the FARMER-DEMO-DATA level in a later
 * phase (once real members/listings exist under a claimed FPO), not the
 * registry itself — accepting and ignoring the param rather than rejecting
 * it keeps the frontend contract stable when that phase lands.
 */
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { state, district, block } = req.query;
    const filter = {};
    if (state) filter.state = new RegExp(`^${String(state).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    if (district) filter.district = new RegExp(`^${String(district).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    if (block) filter.block = new RegExp(`^${String(block).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    const rows = await FpoMaster.find(filter)
      .select('fpoName district block cbboName dateOfIncorporation claimStatus linkedFpoId')
      .limit(200)
      .lean();

    res.json({
      success: true,
      fpos: rows.map((f) => ({
        _id: f._id,
        fpoName: f.fpoName,
        district: f.district,
        block: f.block,
        cbboName: f.cbboName,
        dateOfIncorporation: f.dateOfIncorporation,
        claimStatus: f.claimStatus,
        // Never surface claimedByUid here — only the FPO's own admin should
        // ever see who claimed it, and that lookup goes through /api/fpos,
        // not this registry search.
        linkedFpoId: f.claimStatus === 'approved' ? f.linkedFpoId : null,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/fpo-master/:id/claim — "I represent this real FPO."
 * body: { name, mobile, designation, email }
 *
 * Does not grant anything by itself. It only creates a pending claim for a
 * human to review with scripts/reviewFpoClaims.js — same as GSTIN
 * verification never grants 'verified' over HTTP (scripts/verifyBuyer.js).
 */
router.post('/:id/claim', requireAuth, requireRole(...CLAIMANT_ROLES), async (req, res) => {
  try {
    const { name, mobile, designation, email } = req.body;
    if (!name || !String(name).trim())
      return res.status(400).json({ success: false, error: 'Name is required' });
    if (!mobile || !String(mobile).trim())
      return res.status(400).json({ success: false, error: 'Mobile number is required' });
    if (!DESIGNATIONS.includes(designation))
      return res.status(400).json({
        success: false, code: 'BAD_DESIGNATION',
        error: `designation must be one of: ${DESIGNATIONS.join(', ')}`,
      });

    const master = await FpoMaster.findById(req.params.id).lean();
    if (!master) return res.status(404).json({ success: false, error: 'Not found' });

    // One pending/approved claim per user max, mirroring fpoOf() in fpos.js.
    const existing = await FpoAdminClaim.findOne({
      uid: req.firebaseUid,
      status: { $in: ['pending', 'approved'] },
    }).lean();
    if (existing)
      return res.status(409).json({
        success: false, code: 'ALREADY_CLAIMED',
        error: 'You already have a pending or approved FPO claim.',
      });

    // Atomic guard: only succeeds if the registry entry is still unclaimed —
    // same "expected status in the query filter" concurrency rule used
    // throughout this app (see routes/orders.js).
    const claimedMaster = await FpoMaster.findOneAndUpdate(
      { _id: req.params.id, claimStatus: 'unclaimed' },
      { $set: { claimStatus: 'pending' } },
      { new: true }
    );
    if (!claimedMaster)
      return res.status(409).json({
        success: false, code: 'ALREADY_IN_PROGRESS',
        error: 'This FPO already has a claim pending or approved.',
      });

    let claim;
    try {
      claim = await FpoAdminClaim.create({
        fpoMasterId: master._id,
        uid: req.firebaseUid,
        name: String(name).trim(),
        mobile: String(mobile).trim(),
        designation,
        email: String(email || '').trim(),
      });
    } catch (err) {
      // Compensate: put the registry entry back to unclaimed rather than
      // stranding it — same compensation pattern as the order/stock guard
      // in routes/orders.js.
      await FpoMaster.updateOne({ _id: req.params.id }, { $set: { claimStatus: 'unclaimed' } });
      throw err;
    }

    console.log(`📋 FPO claim ${claim._id}: ${master.fpoName} claimed by ${name} (${designation})`);
    res.status(201).json({ success: true, claim });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { validateGstin } = require('../services/gstinService');
const trustService = require('../services/trustService');
const { toLatLng, matchDistrict } = require('../services/geoService');

// @route   POST /api/users
// @desc    Create new user
// @access  Private — creates the profile for the authenticated caller only
router.post('/', requireAuth, async (req, res) => {
  try {
    console.log('📝 Creating new user...');
    console.log('Request body:', req.body);

    const {
      name,
      email,
      phone,
      role,
      location,
    } = req.body;
    const firebaseUid = req.firebaseUid; // from verified token, never trust the client for this

    // ── WHAT THE TOKEN ITSELF SAYS ─────────────────────────────────────
    //
    // ⚠️ IDENTITY COMES FROM THE VERIFIED TOKEN, NOT THE BODY. The same rule
    // that keeps `role` and `verification` out of the update allowlist: a
    // client that can name its own verified email or phone number can claim
    // somebody else's. `phone_number` is only present when Firebase actually
    // sent an SMS to that number and saw the code come back.
    const claims = req.user || {};
    const provider = claims.firebase && claims.firebase.sign_in_provider;
    const verifiedPhone = claims.phone_number || null;
    // Body email is the fallback only; a token issued by email/password always
    // carries the claim, so in practice the token wins.
    const finalEmail = claims.email || email || null;

    // Validation. `email` is NO LONGER REQUIRED — a phone sign-in has none at
    // all, and demanding one would make phone signup impossible. Name, phone
    // and role still are: the app rings farmers, prints the number on receipts
    // and branches every screen on the role.
    if (!firebaseUid || !name || !phone || !role) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }
    // An account has to be reachable by SOMETHING, or it can never sign in
    // again and support has no way to identify it.
    if (!finalEmail && !verifiedPhone) {
      return res.status(400).json({
        success: false,
        code: 'NO_CREDENTIAL',
        error: 'This account has neither an email nor a verified phone number',
      });
    }

    // Check if user already exists
    let existingUser = await User.findOne({ firebaseUid });
    
    if (existingUser) {
      console.log('⚠️ User already exists');
      return res.status(400).json({
        success: false,
        error: 'User already exists',
      });
    }

    // Create new user.
    // ⚠️ `email` is SPREAD IN ONLY WHEN PRESENT, so a phone-only account has the
    // field ABSENT rather than `email: null`. A sparse unique index still
    // indexes an explicit null, so writing null here would let the first
    // phone-only signup through and fail the second — the exact bug the sparse
    // index was rebuilt to prevent (see scripts/migratePhoneAuth.js).
    const user = new User({
      firebaseUid,
      name,
      ...(finalEmail ? { email: finalEmail } : {}),
      phone,
      role,
      location: location || null,
      ...(verifiedPhone
        ? { phoneAuth: { number: verifiedPhone, verifiedAt: new Date() } }
        : {}),
    });

    syncGeo(user);
    await user.save();
    console.log(`   signed up via ${provider || 'unknown'}${verifiedPhone ? ' (phone verified)' : ''}`);

    console.log('✅ User created successfully:', user._id);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      userId: user._id,
      user: {
        id: user._id,
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        location: user.location,
        phoneAuth: user.phoneAuth || null,
      },
    });

  } catch (error) {
    console.error('❌ Create user error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message,
    });
  }
});

// @route   GET /api/users/firebase/:firebaseUid
// @desc    Get user by Firebase UID
// @access  Private — only the user themself
router.get('/firebase/:firebaseUid', requireAuth, async (req, res) => {
  try {
    if (req.params.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, error: 'Not authorized to view this profile' });
    }

    console.log('🔍 Fetching user by Firebase UID:', req.params.firebaseUid);

    const user = await User.findOne({ firebaseUid: req.params.firebaseUid });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    console.log('✅ User found:', user._id);

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        location: user.location,
        profileImage: user.profileImage,
        createdAt: user.createdAt,

        // ── ⚠️ THE ROLE-SPECIFIC FIELDS. THEIR ABSENCE WAS A REAL BUG. ─────
        //
        // This response used to stop at `createdAt`, and `Agent/AgentDashboard`
        // reads its profile FROM HERE. So `u.vehicle` was always undefined, and
        // three things followed for EVERY captain, seeded or real:
        //
        //   1. `if (!u.vehicle?.type) setOnboard(true)` fired on every launch —
        //      the captain was asked for their vehicle again and again, and
        //      saving it changed nothing because the next read lost it too.
        //   2. `usePolling(poll, 5000, online && !!profile?.vehicle?.type)`
        //      never started, so no job feed and no CURRENT TRIP ever loaded.
        //   3. The vehicle card on the dashboard never rendered.
        //
        // The data was in Mongo the whole time; only this projection was
        // missing it. `business`/`verification` are here for the same reason —
        // a buyer's own GSTIN badge could never render for the logged-in buyer.
        //
        // `verification` is safe to READ (it is only WRITING it that is
        // forbidden — see the update allowlist below, and models/User.js).
        vehicle: user.vehicle,
        isOnline: user.isOnline,
        business: user.business,
        verification: user.verification,
        language: user.language,
        // Whether this account can sign in by phone, and which number. Read-only
        // here — it is written from the verified token alone.
        phoneAuth: user.phoneAuth?.number ? user.phoneAuth : null,
        // How old this account's stored position is. The captain's dashboard
        // needs it to decide whether to send a fresh heartbeat, and to say
        // "position last sent 9 min ago" rather than implying a live fix that
        // Expo Go cannot provide.
        positionAt: user.positionAt || null,
      },
    });

  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message,
    });
  }
});

/**
 * PUT /api/users/business — a vendor submits their trade credentials.
 * body: { gstin?, tradeLicence?, tradeName?, address? }
 *
 * The GSTIN is validated server-side (format + check digit) and the derived
 * state and PAN are taken from the number itself, never from the request —
 * a client that could name its own `gstinState` could claim to be registered
 * in Maharashtra while holding a Delhi number.
 *
 * The best a vendor can reach here is 'documents_submitted'. Read
 * services/gstinService.js for why a passing check digit is not "verified".
 */
// ─────────────────────────────────────────────────────────────────────────
/**
 * Mirror a user's flat `location` into the indexed GeoJSON `geo` field.
 *
 * ⚠️ A LOCATION WITH NO USABLE COORDINATE CLEARS `geo` RATHER THAN LEAVING A
 * STALE ONE. A farmer who edits their profile to a district with no position
 * must not stay findable by radius at the coordinate they used to have —
 * that is a wrong answer, and a wrong answer is worse than no answer here.
 * `undefined` (not `null`) so the field goes ABSENT and drops out of the
 * sparse index entirely; a null would be a malformed point, which is the exact
 * shape that made every user unwritable before (see models/User.js).
 */
function syncGeo(user) {
  const at = toLatLng(user.location);
  if (!at) { user.geo = undefined; user.positionAt = undefined; return false; }
  user.geo = { type: 'Point', coordinates: [at.lng, at.lat] };  // [lng, lat] — GeoJSON order
  user.positionAt = new Date();
  return true;
}

/**
 * POST /api/users/me/position — the captain's idle heartbeat.
 *
 * ⚠️ THE SERVER COULD NOT ANSWER "WHO IS NEAR THIS PICKUP", WHICH IS THE WHOLE
 * BASIS OF RADIUS DISPATCH. `User.geo` was added and indexed, and NOTHING EVER
 * WROTE IT — only `scripts/backfillGeo.js` did, once. So a captain who signed
 * up yesterday had no position at all, and one who drove to another district
 * kept the position they were seeded with. The radius feed would have been
 * ranking drivers against month-old coordinates.
 *
 * This is deliberately NOT `PUT /api/users/:uid`. That handler reads the whole
 * document, applies an allowlist and calls `save()`; this fires every couple of
 * minutes from every online captain in the state, so it is one targeted
 * `updateOne` writing four fields and returning almost nothing.
 *
 * ⚠️ IT DOES NOT AND CANNOT TRACK A CAPTAIN IN THE BACKGROUND. Expo Go has no
 * background location — this only lands while the app is FOREGROUNDED, exactly
 * like delivery tracking. `positionAt` is returned so the client can show the
 * true age rather than implying a live fix.
 */
router.post('/me/position', requireAuth, requireRole('agent'), async (req, res) => {
  try {
    const at = toLatLng({ lat: Number(req.body.lat), lng: Number(req.body.lng) });
    if (!at) return res.status(400).json({ success: false, code: 'NO_COORDS', error: 'lat and lng are required' });

    const now = new Date();
    const district = matchDistrict(req.body.district) || undefined;
    const set = {
      geo: { type: 'Point', coordinates: [at.lng, at.lat] },
      positionAt: now,
      'location.lat': at.lat,
      'location.lng': at.lng,
    };
    // Only overwrite the district when the device actually resolved one.
    // Blanking it on a fix that failed to reverse-geocode would take away the
    // district fallback (services/dispatchReach.js) at precisely the moment the
    // captain's position is least reliable.
    if (district) set['location.district'] = district;
    // `isOnline` rides along when the client sends it, so going on duty and
    // reporting a position are one request rather than two.
    if (typeof req.body.isOnline === 'boolean') set.isOnline = req.body.isOnline;

    const r = await User.updateOne({ firebaseUid: req.firebaseUid }, { $set: set });
    if (!r.matchedCount) return res.status(404).json({ success: false, error: 'User not found' });

    res.json({ success: true, positionAt: now, district: district || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/users/me/link-phone — record that this account can now sign in by
 * phone, AFTER the client has linked the credential in Firebase.
 *
 * ═══ WHY LINKING, AND NOT "MATCH THE PHONE NUMBER" ════════════════════════
 *
 * A phone sign-in produces a DIFFERENT Firebase uid from the same person's
 * email account. Every profile here is keyed on `firebaseUid`, so signing in by
 * phone would land an existing user on an empty app with none of their orders.
 *
 * The tempting fix is for the server to look up a User whose `phone` matches
 * the verified number and adopt that profile. THAT IS AN ACCOUNT TAKEOVER
 * VECTOR and it is deliberately not built: `phone` is an unverified contact
 * field that anybody can type into their profile, it is stale on plenty of
 * records, and 15 numbers in this database are already on TWO accounts. Whoever
 * verified the number first would silently inherit a stranger's trade history,
 * payment record and grievances.
 *
 * So the link is made where it is safe to make it: the user proves they hold
 * the EXISTING account (they are signed into it), then proves they hold the
 * phone (Firebase SMS), and `linkWithCredential` keeps the ORIGINAL uid. This
 * endpoint only records what the token already proves.
 */
router.post('/me/link-phone', requireAuth, async (req, res) => {
  try {
    const claims = req.user || {};
    const verified = claims.phone_number || null;
    // ⚠️ Never read the number from the body. If it is not in the token then
    // Firebase has not verified it for THIS account, and saying so is the
    // whole value of the endpoint.
    if (!verified) {
      return res.status(400).json({
        success: false,
        code: 'PHONE_NOT_LINKED',
        error: 'This session has no verified phone number. Link the phone in the app first, '
          + 'then refresh your session so the new token carries it.',
      });
    }

    const user = await User.findOne({ firebaseUid: req.firebaseUid });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    if (user.phoneAuth?.number === verified) {
      return res.json({ success: true, alreadyLinked: true, phoneAuth: user.phoneAuth });
    }

    user.phoneAuth = { number: verified, verifiedAt: new Date() };
    try {
      await user.save();
    } catch (err) {
      // The unique sparse index caught another profile already holding this
      // number. Reported plainly rather than as a 500 — it means two accounts
      // are claiming one phone, which a human has to untangle.
      if (err.code === 11000) {
        return res.status(409).json({
          success: false,
          code: 'PHONE_ON_ANOTHER_ACCOUNT',
          error: 'That number is already the sign-in phone for a different account.',
        });
      }
      throw err;
    }

    res.json({ success: true, alreadyLinked: false, phoneAuth: user.phoneAuth });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/business', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const { gstin, tradeLicence, tradeName, address } = req.body;
    const set = {};

    if (gstin !== undefined) {
      if (gstin === null || gstin === '') {
        // Clearing the GSTIN drops any standing back to unverified — a buyer
        // must not keep a badge earned by a number they have removed.
        set['business.gstin'] = null;
        set['business.gstinState'] = null;
        set['business.pan'] = null;
        set['verification.status'] = 'unverified';
        set['verification.gstinCheckedAt'] = null;
      } else {
        const v = validateGstin(gstin);
        if (!v.valid)
          return res.status(400).json({ success: false, code: v.reason, error: v.message });

        // One GSTIN, one buyer. Without this two accounts can wear the same
        // credentials and a farmer cannot tell them apart.
        const taken = await User.findOne({
          'business.gstin': v.gstin,
          firebaseUid: { $ne: req.firebaseUid },
        }).select('_id').lean();
        if (taken)
          return res.status(409).json({
            success: false, code: 'GSTIN_TAKEN',
            error: 'That GSTIN is already registered to another buyer.',
          });

        set['business.gstin'] = v.gstin;
        set['business.gstinState'] = v.state;
        set['business.pan'] = v.pan;
        set['verification.gstinCheckedAt'] = new Date();
        // Never straight to 'verified' — see the model comment.
        set['verification.status'] = 'documents_submitted';
      }
    }

    if (tradeLicence !== undefined) set['business.tradeLicence'] = String(tradeLicence || '').trim() || null;
    if (tradeName !== undefined)    set['business.tradeName']    = String(tradeName || '').trim() || null;
    if (address !== undefined)      set['business.address']      = String(address || '').trim() || null;

    if (Object.keys(set).length === 0)
      return res.status(400).json({ success: false, error: 'Nothing to update' });

    const user = await User.findOneAndUpdate(
      { firebaseUid: req.firebaseUid },
      { $set: set },
      { new: true }
    ).select('firebaseUid name business verification').lean();

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    console.log(`🏢 Buyer ${user.name}: business details updated → ${user.verification.status}`);
    res.json({ success: true, business: user.business, verification: user.verification });
  } catch (err) {
    console.error('❌ Update business error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// @route   PUT /api/users/:firebaseUid
// @desc    Update user
// @access  Private — only the user themself
router.put('/:firebaseUid', requireAuth, async (req, res) => {
  try {
    if (req.params.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, error: 'Not authorized to update this profile' });
    }

    console.log('📝 Updating user:', req.params.firebaseUid);

    const user = await User.findOne({ firebaseUid: req.params.firebaseUid });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Update fields
    // NOTE: 'role' is deliberately absent — a user must never be able to
    // promote themselves into another role via a profile update. 'business'
    // and 'verification' are absent for the same reason: business details go
    // through PUT /api/users/business, which recomputes the GSTIN check
    // server-side, and verification status is never self-settable at all.
    const updateFields = ['name', 'phone', 'location', 'profileImage', 'vehicle', 'isOnline', 'language'];
    
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    // ⚠️ `location` AND `geo` MUST MOVE TOGETHER OR THEY SILENTLY DISAGREE.
    // `geo` is the indexed copy every radius query reads; `location` is the
    // flat {lat,lng} the rest of the app reads. Writing one without the other
    // leaves a captain who has updated their profile findable at their OLD
    // position by dispatch and shown at their new one everywhere else — with
    // no error and nothing on screen to reveal it. `scripts/backfillGeo.js`
    // exists because 154 users were already in exactly that state.
    if (req.body.location !== undefined) syncGeo(user);

    await user.save();

    console.log('✅ User updated successfully');

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        location: user.location,
        profileImage: user.profileImage,
        vehicle: user.vehicle,
        isOnline: user.isOnline,
      },
    });

  } catch (error) {
    console.error('❌ Update user error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message,
    });
  }
});

/**
 * GET /api/users/badge/:firebaseUid — the public trust summary for a buyer.
 *
 * Deliberately narrow: a farmer deciding whether to hand over a tonne of crop
 * needs to know what has been checked, not the buyer's phone number or address.
 * The `label` is written here rather than in the app so every screen makes the
 * same claim, and so the claim can never drift into implying more than was done.
 */
/**
 * GET /api/users/trust/:firebaseUid — does this buyer actually pay?
 *
 * The other half of the badge. A GSTIN check digit proves a number was
 * ISSUED; it says nothing about whether the holder settles. This reads the
 * record the app has been storing all along — delivered orders against
 * settlement dates, and disputes filed against them.
 *
 * Literal prefix, so it cannot be shadowed by PUT /:firebaseUid below. That
 * bug has happened twice in this codebase already.
 */
router.get('/trust/:firebaseUid', requireAuth, async (req, res) => {
  try {
    const record = await trustService.forVendor(req.params.firebaseUid);
    res.json({
      success: true,
      trust: record,
      // A settlement is marked by the FARMER, not by a payment rail. A buyer
      // who paid a farmer who never tapped the button looks slow here, and the
      // UI has to keep saying so rather than presenting this as bank truth.
      disclaimer: 'Based on farmers marking their own settlements. This app does not move money and cannot confirm a payment independently.',
    });
  } catch (err) {
    console.error('GET /users/trust/:firebaseUid', err);
    res.status(500).json({ success: false, error: 'Could not load that record' });
  }
});

/**
 * GET /api/users/farmer-trust/:firebaseUid — how have this farmer's lots held up?
 *
 * The other half of the trust layer, and the thing that makes a self-declared
 * grade cost something. A buyer sees this BEFORE purchasing.
 *
 * Literal prefix, above PUT /:firebaseUid, for the same shadowing reason as
 * /trust and /badge.
 */
router.get('/farmer-trust/:firebaseUid', requireAuth, async (req, res) => {
  try {
    const record = await trustService.forFarmer(req.params.firebaseUid);
    res.json({
      success: true,
      trust: record,
      // Said on every response. This app records complaints and what the two
      // parties agreed; it does not rule on them, and a buyer reading this must
      // not mistake "disputed" for "proven".
      disclaimer: 'Counts what buyers complained about and what was agreed. This app does not judge disputes — a complaint raised is not a complaint upheld.',
    });
  } catch (err) {
    console.error('GET /users/farmer-trust/:firebaseUid', err);
    res.status(500).json({ success: false, error: 'Could not load that record' });
  }
});

router.get('/badge/:firebaseUid', requireAuth, async (req, res) => {
  try {
    const u = await User.findOne({ firebaseUid: req.params.firebaseUid })
      .select('name role business.gstin business.gstinState business.tradeName verification.status')
      .lean();
    if (!u) return res.status(404).json({ success: false, error: 'User not found' });

    const status = u.verification?.status || 'unverified';
    const hasGstin = !!u.business?.gstin;

    res.json({
      success: true,
      badge: {
        name: u.name,
        tradeName: u.business?.tradeName || null,
        status,
        // Masked: enough to recognise, not enough to reuse.
        gstin: hasGstin ? u.business.gstin.slice(0, 2) + 'XXXXXX' + u.business.gstin.slice(-4) : null,
        gstinState: u.business?.gstinState || null,
        label:
          status === 'verified' ? 'Verified buyer'
            : status === 'documents_submitted' ? 'GSTIN on file'
              : status === 'rejected' ? 'Not verified'
                : 'No documents',
        // Says exactly what was and was not checked. Shown as the badge's
        // subtitle so a farmer is never left inferring more than happened.
        meaning:
          status === 'verified' ? 'Documents checked by a person.'
            : status === 'documents_submitted' ? 'GSTIN format and check digit are valid. Not confirmed against the GST portal.'
              : status === 'rejected' ? 'Documents were reviewed and not accepted.'
                : 'This buyer has not submitted trade documents.',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

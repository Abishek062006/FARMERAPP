const User = require('../models/User');

/**
 * Role-based authorization. Must run AFTER requireAuth, which sets
 * req.firebaseUid from the verified Firebase token.
 *
 * Until now every route in this app only did per-document ownership checks
 * (`doc.firebaseUid === req.firebaseUid`), which is right for "is this your
 * land?" but says nothing about "are you allowed to buy?". A marketplace
 * moving goods and money needs the second question answered too — otherwise
 * any authenticated user, including the selling farmer, can accept a listing
 * or claim a delivery job.
 *
 * Side effect (deliberate): sets req.profile to the caller's Mongo user doc.
 * Routes should read the caller's name/phone/location from req.profile rather
 * than from the request body — client-supplied identity is spoofable, and
 * several existing routes trust it today.
 *
 *   router.post('/', requireAuth, requireRole('vendor'), handler)
 */
function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      const user = await User.findOne({ firebaseUid: req.firebaseUid })
        .select('firebaseUid name phone role location vehicle isOnline')
        .lean();

      if (!user) {
        return res.status(403).json({
          success: false,
          error: 'Complete your profile before using this feature',
        });
      }

      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          error: `This action is for ${roles.join(' / ')} accounts only`,
        });
      }

      req.profile = user;
      next();
    } catch (error) {
      console.error('❌ requireRole error:', error);
      res.status(500).json({ success: false, error: 'Authorization check failed' });
    }
  };
}

module.exports = { requireRole };

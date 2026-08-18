const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Verifies Firebase Auth ID tokens directly against Google's public keys —
// no firebase-admin / service-account credential needed, just the (public)
// Firebase project ID. See:
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;

const client = jwksClient({
  jwksUri: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  cache: true,
  cacheMaxAge: 6 * 60 * 60 * 1000,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

/**
 * Requires a valid Firebase ID token in the Authorization header.
 * On success, sets req.firebaseUid to the verified caller's uid — routes
 * must use this (never a client-supplied uid) to decide what the caller
 * is allowed to read or write.
 */
function requireAuth(req, res, next) {
  if (!FIREBASE_PROJECT_ID) {
    console.error('❌ FIREBASE_PROJECT_ID is not set — cannot verify auth tokens');
    return res.status(500).json({ success: false, error: 'Server auth is not configured' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  jwt.verify(
    token,
    getKey,
    {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    },
    (err, decoded) => {
      if (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired session' });
      }
      req.firebaseUid = decoded.sub;
      req.user = decoded;
      next();
    }
  );
}

module.exports = { requireAuth };

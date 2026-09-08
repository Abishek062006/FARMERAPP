// Phase 3 test: phone sign-in, additively — the 2,183 email accounts must not move.
//   node scripts/testPhoneAuth.js
//
// ⚠️ WHAT THIS CANNOT TEST. The SMS leg is Firebase's, and the Phone provider is
// not even enabled on this project yet (Identity Toolkit answers
// OPERATION_NOT_ALLOWED). So there is no way here to send a code, read it, or
// mint a real phone-auth token. What IS tested is everything this codebase
// owns: that a token CARRYING a verified phone claim is honoured, that one
// NOT carrying it is refused, that an email-less account can exist at all, and
// that identity is never taken from the request body.
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const B = (p) => path.join(__dirname, '..', p);

// The auth stub mirrors the real middleware's contract: it sets req.firebaseUid
// from the verified token and req.user to the decoded CLAIMS. The tests drive
// the claims, which is exactly the surface the routes read.
const authPath = require.resolve(B('middleware/auth.js'));
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  requireAuth: (req, res, next) => {
    const uid = req.headers['x-test-uid'];
    if (!uid) return res.status(401).json({ success: false, error: 'Authentication required' });
    req.firebaseUid = uid;
    req.user = {
      sub: uid,
      ...(req.headers['x-test-email'] ? { email: req.headers['x-test-email'] } : {}),
      ...(req.headers['x-test-phone'] ? { phone_number: req.headers['x-test-phone'] } : {}),
      firebase: { sign_in_provider: req.headers['x-test-provider'] || 'password' },
    };
    next();
  },
}};

const express = require('express');
const mongoose = require('mongoose');
const User = require(B('models/User'));

const TAG = 'PH5TEST_';
let pass = 0, fail = 0;
const check = (c, m, x = '') => { c ? (pass++, console.log('  ✅', m, x)) : (fail++, console.log('  ❌', m, x)); };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express(); app.use(express.json());
  app.use('/api/users', require(B('routes/users')));
  const server = app.listen(5131);
  const URL = 'http://127.0.0.1:5131';

  const call = async (method, p, headers, body) => {
    const r = await fetch(URL + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };

  try {
    // ── 1. A PHONE-ONLY SIGNUP ─────────────────────────────────────────
    console.log('\n1. Signup with a phone and no email');
    const P1 = TAG + 'phone1';
    let r = await call('POST', '/api/users',
      { 'x-test-uid': P1, 'x-test-phone': '+919000000101', 'x-test-provider': 'phone' },
      { name: 'Phone Farmer', phone: '9000000101', role: 'farmer' });
    check(r.status === 201, 'a phone signup with NO email is accepted', `→ ${r.status}`);
    let doc = await User.findOne({ firebaseUid: P1 }).lean();
    check(doc && doc.email === undefined,
      'the email field is ABSENT, not null — an explicit null breaks the sparse index');
    check(doc?.phoneAuth?.number === '+919000000101',
      'the verified number is recorded from the TOKEN', `→ ${doc?.phoneAuth?.number}`);
    check(!!doc?.phoneAuth?.verifiedAt, 'and stamped with when it was verified');

    // ── 2. A SECOND ONE — THE BUG THE MIGRATION FIXED ──────────────────
    console.log('\n2. A second email-less account');
    const P2 = TAG + 'phone2';
    r = await call('POST', '/api/users',
      { 'x-test-uid': P2, 'x-test-phone': '+919000000102', 'x-test-provider': 'phone' },
      { name: 'Phone Farmer Two', phone: '9000000102', role: 'farmer' });
    // Before scripts/migratePhoneAuth.js this failed with E11000 on null: the
    // live email_1 index was unique and NOT sparse, so the second account with
    // no email collided with the first.
    check(r.status === 201, 'a SECOND email-less account also saves', `→ ${r.status}`);

    // ── 3. IDENTITY IS NOT TAKEN FROM THE BODY ─────────────────────────
    console.log('\n3. The body cannot name its own credentials');
    const P3 = TAG + 'liar';
    r = await call('POST', '/api/users',
      { 'x-test-uid': P3, 'x-test-phone': '+919000000103', 'x-test-provider': 'phone' },
      { name: 'Liar', phone: '9000000103', role: 'farmer',
        phoneAuth: { number: '+919999999999', verifiedAt: new Date() },
        firebaseUid: 'somebody-else', email: 'claimed@elsewhere.test' });
    doc = await User.findOne({ firebaseUid: P3 }).lean();
    check(r.status === 201 && doc, 'the request is accepted');
    check(doc.phoneAuth.number === '+919000000103',
      'phoneAuth comes from the token, NOT the body it tried to supply',
      `→ ${doc.phoneAuth.number}`);
    check(doc.firebaseUid === P3, 'firebaseUid comes from the token');
    check(!(await User.findOne({ firebaseUid: 'somebody-else' })),
      'the body-supplied uid created nothing');

    // ── 4. NO CREDENTIAL AT ALL IS REFUSED ─────────────────────────────
    console.log('\n4. An account with no way back in');
    r = await call('POST', '/api/users',
      { 'x-test-uid': TAG + 'nocred' },
      { name: 'No Credential', phone: '9000000104', role: 'farmer' });
    check(r.status === 400 && r.body.code === 'NO_CREDENTIAL',
      'a signup with neither email nor verified phone is refused', `→ ${r.body.code}`);

    // ── 5. EMAIL SIGNUP IS BYTE-FOR-BYTE UNCHANGED ─────────────────────
    console.log('\n5. The 2,183 existing accounts must not move');
    const E1 = TAG + 'email1';
    r = await call('POST', '/api/users',
      { 'x-test-uid': E1, 'x-test-email': TAG + 'e1@t.test', 'x-test-provider': 'password' },
      { name: 'Email Farmer', email: TAG + 'e1@t.test', phone: '9000000105', role: 'farmer' });
    doc = await User.findOne({ firebaseUid: E1 }).lean();
    check(r.status === 201 && doc.email === (TAG + 'e1@t.test').toLowerCase(),
      'an email/password signup still works exactly as before', `→ ${doc.email}`);
    check(doc.phoneAuth === undefined || !doc.phoneAuth?.number,
      'and gets NO phoneAuth — it has not verified a number');

    // ── 6. LINKING AN EXISTING ACCOUNT ─────────────────────────────────
    console.log('\n6. POST /me/link-phone');
    r = await call('POST', '/api/users/me/link-phone', { 'x-test-uid': E1 }, {});
    check(r.status === 400 && r.body.code === 'PHONE_NOT_LINKED',
      'refused when the token carries no verified number', `→ ${r.body.code}`);

    r = await call('POST', '/api/users/me/link-phone',
      { 'x-test-uid': E1, 'x-test-phone': '+919000000105' }, { number: '+911111111111' });
    doc = await User.findOne({ firebaseUid: E1 }).lean();
    check(r.status === 200 && doc.phoneAuth.number === '+919000000105',
      'links the number FROM THE TOKEN, ignoring the body', `→ ${doc.phoneAuth.number}`);
    check(doc.email === (TAG + 'e1@t.test').toLowerCase() && doc.firebaseUid === E1,
      '⚠️ the uid and email are UNCHANGED — linking must not orphan the account');

    r = await call('POST', '/api/users/me/link-phone',
      { 'x-test-uid': E1, 'x-test-phone': '+919000000105' }, {});
    check(r.status === 200 && r.body.alreadyLinked === true, 'relinking the same number is idempotent');

    // ── 7. ONE NUMBER, ONE ACCOUNT ─────────────────────────────────────
    console.log('\n7. Two accounts cannot claim one number');
    r = await call('POST', '/api/users/me/link-phone',
      { 'x-test-uid': P1, 'x-test-phone': '+919000000105' }, {});
    check(r.status === 409 && r.body.code === 'PHONE_ON_ANOTHER_ACCOUNT',
      'the second claimant is refused by name, not with a 500', `→ ${r.status} ${r.body.code}`);

    // ── 8. THE PROFILE READ EXPOSES IT ─────────────────────────────────
    console.log('\n8. GET /firebase/:uid');
    r = await call('GET', `/api/users/firebase/${E1}`, { 'x-test-uid': E1 });
    check(r.body.user?.phoneAuth?.number === '+919000000105',
      'a linked account reports its sign-in number', `→ ${r.body.user?.phoneAuth?.number}`);
    r = await call('GET', `/api/users/firebase/${P2}`, { 'x-test-uid': P2 });
    check(r.body.user?.email === undefined || r.body.user?.email === null,
      'a phone-only account reports no email rather than a fabricated one');

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    await User.deleteMany({ firebaseUid: new RegExp('^' + TAG) });
    console.log('\n🧹 test data removed');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

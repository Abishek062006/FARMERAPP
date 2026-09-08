// Creates the 85 real Firebase logins (10 FPO admins + 75 farmers) that
// backend/data/sources_fpo/demo_fpo_dataset.json describes, then creates
// each one's User profile DIRECTLY in MongoDB (same shape/fields as
// POST /api/users in routes/users.js) — no dependency on a running local
// Express server, matching how every other seed script in this codebase
// already writes to Atlas directly.
//
// WHY THIS SCRIPT EXISTS INSTEAD OF firebase-admin
//   This backend has no service-account credential (see CLAUDE.md — the
//   same reason seedDemoData.js can't mint logins either). But the Web API
//   key in frontend/.env is PUBLIC and works against Firebase's Identity
//   Toolkit REST endpoint — the exact same endpoint the app itself calls to
//   register a farmer. This script does nothing the app couldn't already do,
//   85 times in a row instead of once.
//
// RECOVERS PARTIAL RUNS
//   If an email's Firebase account already exists (from an earlier partial
//   run) but it has no Mongo User yet, this script SIGNS IN as that account
//   (same public REST API, same known demo password) to get its uid back,
//   then creates the missing profile — it does not just skip it. Idempotent
//   either way: safe to re-run as many times as needed.
//
// SAFETY
//   Defaults to --dry-run: prints what it WOULD create, calls nothing.
//   Real accounts are only created with an explicit --confirm flag.
//   Paced with a delay between calls (RATE_LIMIT_MS) to stay under
//   Firebase's abuse-detection threshold — running this too fast risks
//   Google throttling the whole project, not just this script.
//
// USAGE (run from the backend/ directory)
//   node scripts/bulkCreateFpoDemoAccounts.js                          # dry run
//   node scripts/bulkCreateFpoDemoAccounts.js --confirm                 # all 85
//   node scripts/bulkCreateFpoDemoAccounts.js --confirm --only=nehrai   # one FPO's people
//
// AFTER THIS RUNS
//   node scripts/seedFpoDemoData.js   — attaches Land/Crop/FPO-membership.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');

const API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY
  || (fs.existsSync(path.join(__dirname, '../../frontend/.env'))
    && fs.readFileSync(path.join(__dirname, '../../frontend/.env'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('EXPO_PUBLIC_FIREBASE_API_KEY='))
      ?.split('=')[1]?.trim());

const SIGNUP_URL = (key) => `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`;
const SIGNIN_URL = (key) => `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`;
const RATE_LIMIT_MS = 1500;
const DEFAULT_PASSWORD = 'FarmerApp2026!'; // same for every demo account, on purpose — throwaway demo logins, not real people's credentials

const DRY_RUN = !process.argv.includes('--confirm');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] || null;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function callIdentityToolkit(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`non-JSON response, HTTP ${res.status}: ${raw.slice(0, 300) || '(empty body)'}`);
  }
  return { ok: res.ok, status: res.status, body };
}

/** Sign up; if the email already has a Firebase account, sign in instead — either way, return its uid. */
async function getOrCreateFirebaseUid(email, password) {
  const signup = await callIdentityToolkit(SIGNUP_URL(API_KEY), { email, password, returnSecureToken: true });
  if (signup.ok) return { uid: signup.body.localId, isNew: true };

  const code = signup.body?.error?.message || `HTTP ${signup.status}`;
  if (code !== 'EMAIL_EXISTS') {
    throw new Error(`signup: ${code} — ${JSON.stringify(signup.body?.error?.errors || signup.body)}`);
  }

  const signin = await callIdentityToolkit(SIGNIN_URL(API_KEY), { email, password, returnSecureToken: true });
  if (!signin.ok) {
    const sc = signin.body?.error?.message || `HTTP ${signin.status}`;
    throw new Error(`email exists but sign-in failed (password may differ from ${DEFAULT_PASSWORD}): ${sc}`);
  }
  return { uid: signin.body.localId, isNew: false };
}

async function ensureMongoProfile(uid, { email, name, phone, role, district, lat, lng }) {
  const existing = await User.findOne({ firebaseUid: uid });
  if (existing) return { created: false };
  await User.create({
    firebaseUid: uid, name, email, phone, role,
    location: { district, state: 'Maharashtra', coordinates: { lat, lng } },
  });
  return { created: true };
}

async function main() {
  if (!API_KEY) {
    console.error('❌ EXPO_PUBLIC_FIREBASE_API_KEY not found in backend/.env or frontend/.env — cannot call Firebase.');
    process.exit(1);
  }

  const datasetPath = path.join(__dirname, '../data/sources_fpo/demo_fpo_dataset.json');
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

  const { MH_DISTRICT_CENTROIDS } = require('../data/districtCentroids.js');
  const coordsFor = (district) => {
    const hit = MH_DISTRICT_CENTROIDS.find((d) => d.district === district);
    return hit ? { lat: hit.lat, lng: hit.lng } : { lat: null, lng: null };
  };

  const targets = ONLY ? dataset.filter((f) => f.admin.email.includes(ONLY)) : dataset;
  if (!targets.length) {
    console.error(`❌ No FPO matched --only=${ONLY}`);
    process.exit(1);
  }

  const people = [];
  for (const fpo of targets) {
    const c = coordsFor(fpo.district);
    people.push({
      email: fpo.admin.email, name: fpo.admin.name, phone: fpo.admin.mobile,
      role: 'farmer', district: fpo.district, ...c, tag: `admin of ${fpo.fpoName}`,
    });
    for (const f of fpo.farmers) {
      const fc = coordsFor(f.district || fpo.district);
      people.push({
        email: f.email, name: f.name, phone: f.mobile,
        role: 'farmer', district: f.district || fpo.district, ...fc,
        tag: `farmer, ${fpo.fpoName}`,
      });
    }
  }

  console.log(`Plan: ${people.length} accounts across ${targets.length} FPO(s).`);
  console.log(`Password for all of them: ${DEFAULT_PASSWORD}\n`);

  if (DRY_RUN) {
    people.forEach((p) => console.log(`  [dry-run] would create ${p.email}  (${p.tag})`));
    console.log(`\nNothing was created — re-run with --confirm to actually create these ${people.length} accounts.`);
    return;
  }

  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  let firebaseNew = 0, firebaseRecovered = 0, profileCreated = 0, profileAlready = 0, failed = 0;
  for (const p of people) {
    try {
      const { uid, isNew } = await getOrCreateFirebaseUid(p.email, DEFAULT_PASSWORD);
      isNew ? firebaseNew++ : firebaseRecovered++;

      const { created } = await ensureMongoProfile(uid, p);
      created ? profileCreated++ : profileAlready++;

      console.log(`  ✅ ${p.email}  [firebase: ${isNew ? 'new' : 'existing'}, profile: ${created ? 'created' : 'already had one'}]`);
    } catch (err) {
      console.log(`  ❌ ${p.email}: ${err.message}`);
      failed++;
    }
    await sleep(RATE_LIMIT_MS);
  }

  console.log(`\n── done ──`);
  console.log(`firebase — new: ${firebaseNew}   recovered existing: ${firebaseRecovered}`);
  console.log(`mongo    — profile created: ${profileCreated}   already had one: ${profileAlready}`);
  console.log(`failed: ${failed}`);
  console.log(`\nNext: node scripts/seedFpoDemoData.js   (attaches Land/Crop/FPO membership to these accounts)`);

  await mongoose.disconnect();
}

main().catch((e) => { console.error('❌', e); process.exit(1); });

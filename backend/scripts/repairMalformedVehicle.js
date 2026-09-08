// Phase 6, B5a — repair a captain whose `vehicle` field is a bare string
// instead of the schema's `{ type, number }` subdocument.
//   node scripts/repairMalformedVehicle.js            (dry run — reports only)
//   node scripts/repairMalformedVehicle.js --confirm   (writes)
//
// ⚠️ WHY THIS EXISTS. `models/User.js` declares `vehicle: { type: {type:
// String, enum:[...]}, number: {type:String} }` — a subdocument. Live Atlas
// has THREE agent accounts (out of 754) where `vehicle` is a raw string like
// `"tempo"` instead, almost certainly written before the field became a
// subdocument, or by a raw update that bypassed Mongoose's schema. Nothing
// downstream expects that shape:
//
//     const vehicleType = req.profile.vehicle && req.profile.vehicle.type;
//     if (!vehicleType) return res.status(400)...  // NO_VEHICLE
//
// `"tempo".type` is `undefined`, so a captain who plainly HAS a vehicle is
// told to add one — and until they resave their profile through the app
// (overwriting the string with a real object), their whole job feed is
// permanently 400 NO_VEHICLE. Silent, and indistinguishable from an account
// that genuinely never set one up.
//
// ⚠️ ONLY `type` IS RECOVERABLE. The malformed value never carried a vehicle
// NUMBER — there was nowhere in a bare string to put one — so this writes
// `{ type: <the string that was there>, number: undefined }` and nothing
// else. Inventing a plate number to make the record look complete would be
// the same fabrication this app refuses everywhere (a GSTIN, a coordinate, a
// yield figure) — the captain is asked for their real number the next time
// they open the vehicle screen, same as anyone who never set one.
//
// A value that is not one of the three known vehicle types (auto/tempo/
// truck) is reported and LEFT ALONE — guessing a captain's vehicle class from
// a corrupted string is exactly the kind of invention this script exists to
// avoid, not repeat.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const CONFIRM = process.argv.includes('--confirm');
const KNOWN_TYPES = ['auto', 'tempo', 'truck'];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // Mongoose casts on read too, so this is read through the RAW collection —
  // `.lean()` on the model would still coerce/drop a mismatched type via the
  // schema and hide exactly the rows this script is looking for.
  const rows = await mongoose.connection.collection('users')
    .find({ role: 'agent', vehicle: { $type: 'string' } })
    .project({ vehicle: 1, name: 1, phone: 1 })
    .toArray();

  console.log(`\nAgents with a bare-string vehicle field: ${rows.length}`);
  if (!rows.length) { console.log('Nothing to repair.\n'); await mongoose.disconnect(); return; }

  let fixed = 0; const skipped = [];
  for (const r of rows) {
    const value = r.vehicle;
    if (!KNOWN_TYPES.includes(value)) {
      skipped.push({ id: r._id, name: r.name, value });
      continue;
    }
    console.log(`  ${r._id}  ${r.name || '(no name)'}  "${value}" → { type: "${value}" }`);
    if (CONFIRM) {
      await mongoose.connection.collection('users').updateOne(
        { _id: r._id },
        { $set: { vehicle: { type: value } } }
      );
    }
    fixed++;
  }

  for (const s of skipped) {
    console.log(`  ⚠️  LEFT ALONE: ${s.id} ${s.name || '(no name)'} — vehicle is "${s.value}", `
      + `not one of ${KNOWN_TYPES.join('/')}. Guessing a vehicle class is not a repair.`);
  }
  console.log(CONFIRM ? `\n✅ repaired ${fixed}.\n` : `\n--confirm not passed: would repair ${fixed}. Nothing written.\n`);
  await mongoose.disconnect();
})();

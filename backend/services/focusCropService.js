// services/focusCropService.js
//
// WHAT AN FPO ACTUALLY DEALS IN.
//
// ═══ THE GAP ══════════════════════════════════════════════════════════════
//
// FPOs specialise, and heavily. A Niphad onion producer company does not deal
// in sugarcane; a Sangli grape group does not handle tur. Nothing in this app
// modelled that, so any farmer could ask to join any group with any produce,
// and the admin approving them had nothing on screen to decide with except a
// name.
//
// ═══ WHY THE FPO STATES IT, RATHER THAN THE APP DERIVING IT ═══════════════
//
// The SFAC registry (data/sources_fpo, 213 real companies) carries the name,
// the registration number, the district, the block and the CBBO that promoted
// each one — and NOT one word about crops. There is no source to derive this
// from, so the group declares it. Declared is honest; inferred-from-two-
// listings would be a guess wearing a data structure.
//
// Deriving it from what members currently list was considered and rejected: a
// group with four onion lots up this week is not thereby "an onion FPO", and a
// grape group between harvests would read as focusing on nothing at all.
//
// ═══ ⚠️ IT IS ADVISORY, EVERYWHERE, WITHOUT EXCEPTION ═════════════════════
//
// A mismatch NEVER blocks anything. It is surfaced to the admin, who is the
// person who actually decides, and to the farmer, who is entitled to know
// before they ask. A farmer growing something adjacent — the onion group's
// member who also has half an acre of garlic — is a conversation, not an error,
// and a hard refusal would make the app wrong about a case the humans handle
// easily every season.
//
// It also does NOT touch the lot catalog, the bundles, or any sale. Produce
// already listed is produce; refusing to market a member's off-focus crop would
// destroy real value to enforce a preference the group only stated as a
// preference.
//
// ═══ THE TWO ABSENCES ARE NOT MISMATCHES ═════════════════════════════════
//
// This is the same rule trustService and the storage vacancy field are written
// under: not knowing is not the same as knowing something bad.
//
//   • A group that has declared NO focus crops matches everybody, and the
//     status says `no_focus_declared` — never `mismatch`.
//   • A farmer with NO registered crops and NO listings cannot be matched at
//     all, and the status says `farmer_crops_unknown` — never `mismatch`. A
//     farmer who has just signed up is not a farmer growing the wrong thing.

const { CROPS } = require('../data/agroZones');

/**
 * The list an FPO may declare from — the SAME 64 crops the recommendation
 * engine and crop registration already use (data/agroZones.js CROPS).
 *
 * A FIXED LIST, not free text, and for the reason this codebase applies to
 * Dispute.reason and stops[].failureReason: "Onion" is matchable and countable,
 * "onion/kanda (red)" is not. Free text here would make every match below a
 * string-similarity guess.
 */
const FOCUS_CROP_NAMES = CROPS.map((c) => c.name);

/**
 * How many crops a group may declare.
 *
 * A cap with a stated reason, not a page size: a group that declares thirty of
 * the sixty-four crops has declared nothing, and the field stops carrying
 * information for the farmer reading it. Twelve is comfortably above what a
 * real multi-crop FPO handles. Beyond it the request is REFUSED rather than
 * truncated — silently dropping the thirteenth is how a group ends up matching
 * against a list it did not agree to.
 */
const MAX_FOCUS_CROPS = 12;

const keyOf = (name) => String(name || '').trim().toLowerCase();

/**
 * Every string that should resolve to one canonical crop name: its English
 * name, its Marathi `localName`, and its Agmarknet `mandiName`.
 *
 * The aliases matter because the three name shapes are all real in this
 * database — `Crop.name` carries the canonical English, `Crop.localName` the
 * Marathi, and `CropListing.cropName` is FREE TEXT typed by a farmer who may
 * have used either. Matching on the English name alone would report a Marathi
 * listing as off-focus.
 */
const CANONICAL_BY_ALIAS = new Map();
for (const c of CROPS) {
  for (const alias of [c.name, c.localName, c.mandiName]) {
    if (alias) CANONICAL_BY_ALIAS.set(keyOf(alias), c.name);
  }
}

/**
 * A raw crop string → its canonical name, or null if this app does not know it.
 *
 * Returns NULL rather than the input for an unknown crop, deliberately: an
 * unrecognised name must not silently become a "crop" that can never match
 * anything and would then read as a mismatch. Callers treat null as unknown.
 */
function canonicalCropName(raw) {
  if (!raw) return null;
  const k = keyOf(raw);
  if (CANONICAL_BY_ALIAS.has(k)) return CANONICAL_BY_ALIAS.get(k);

  // One narrowing pass, and one only. Real listings are written as "Onion",
  // "onion", "Onion (Red)" — the canonical names themselves carry parentheses
  // ("Rice (Paddy)", "Gram (Harbhara)"), so a bare prefix compare on the part
  // before the bracket resolves both directions. It is NOT fuzzy matching:
  // either the head of the string equals a known head exactly, or it is
  // unknown. Substring or edit-distance matching here would quietly turn
  // "Bengal Gram" into "Gram" and report a farmer as on-focus who is not.
  //
  // ⚠️ VERIFIED, NOT ASSUMED: across all 64 crops, no two crops share an alias
  // head, so this loop is deterministic and first-match-wins is never
  // arbitrary. Re-check that if CROPS gains an entry — two crops with the same
  // head would make the answer depend on array order.
  // ("Bengal Gram" resolves to "Gram (Harbhara)" through its Agmarknet
  //  mandiName "Bengal Gram(Gram)(Whole)", which is an EXACT head match, not
  //  a substring one.)
  const head = k.split('(')[0].trim();
  if (!head) return null;
  for (const [alias, canonical] of CANONICAL_BY_ALIAS) {
    if (alias.split('(')[0].trim() === head) return canonical;
  }
  return null;
}

/**
 * Validate a declared focus list. Returns { ok, crops, unknown }.
 * `crops` is de-duplicated and canonicalised; `unknown` names what was refused.
 */
function validateFocusCrops(raw) {
  if (!Array.isArray(raw)) return { ok: false, crops: [], unknown: [], reason: 'NOT_A_LIST' };
  const crops = [];
  const unknown = [];
  for (const entry of raw) {
    const canonical = canonicalCropName(entry);
    if (!canonical) { unknown.push(String(entry)); continue; }
    if (!crops.includes(canonical)) crops.push(canonical);
  }
  if (unknown.length) return { ok: false, crops, unknown, reason: 'UNKNOWN_CROP' };
  if (crops.length > MAX_FOCUS_CROPS)
    return { ok: false, crops, unknown, reason: 'TOO_MANY' };
  return { ok: true, crops, unknown };
}

const STATUS_NOTE = {
  no_focus_declared:
    'This group has not declared which crops it deals in, so there is nothing to match against. '
    + 'That is not a mismatch — it is a field the group has not filled in.',
  farmer_crops_unknown:
    'This farmer has no registered crops and no live listings, so there is nothing to compare. '
    + 'Not knowing what somebody grows is not the same as knowing they grow the wrong thing.',
  match:
    'Everything this farmer grows is a crop the group deals in.',
  partial:
    'Some of what this farmer grows is a crop the group deals in, and some is not. That is normal '
    + 'and it is not a problem to be solved by software — a member with half an acre of something '
    + 'else is a conversation.',
  mismatch:
    'None of what this farmer grows is a crop the group has said it deals in. This is worth a '
    + 'conversation before approving. It does NOT block anything and the app has not refused '
    + 'anyone — the decision is the admin\'s.',
};

/**
 * Compare what a farmer grows against what a group deals in.
 *
 * @param focusCrops    the group's declared canonical crop names
 * @param farmerCrops   raw crop names from the farmer's Crop docs and listings
 * @returns {{status, matched, unmatched, focusCrops, unrecognised, advisory, note}}
 *
 * `advisory: true` is on EVERY response and is never computed — it is a
 * constant, because there is no branch of this function that blocks anything
 * and no caller should have to work that out for itself.
 */
function matchFarmerToFocus(focusCrops, farmerCrops) {
  const focus = Array.isArray(focusCrops) ? focusCrops.filter(Boolean) : [];
  const focusKeys = new Set(focus.map(keyOf));

  // Canonicalise the farmer's side. A name this app does not recognise is kept
  // separately as `unrecognised` rather than counted as unmatched — it is one
  // more thing we do not know, not evidence of anything.
  const matched = [];
  const unmatched = [];
  const unrecognised = [];
  for (const raw of (farmerCrops || [])) {
    const canonical = canonicalCropName(raw);
    if (!canonical) {
      const label = String(raw || '').trim();
      if (label && !unrecognised.includes(label)) unrecognised.push(label);
      continue;
    }
    const bucket = focusKeys.has(keyOf(canonical)) ? matched : unmatched;
    if (!bucket.includes(canonical)) bucket.push(canonical);
  }

  let status;
  if (!focus.length) status = 'no_focus_declared';
  else if (!matched.length && !unmatched.length) status = 'farmer_crops_unknown';
  else if (!unmatched.length) status = 'match';
  else if (matched.length) status = 'partial';
  else status = 'mismatch';

  return {
    status,
    matched,
    unmatched,
    unrecognised,
    focusCrops: focus,
    // Always true. See the note above.
    advisory: true,
    note: STATUS_NOTE[status],
  };
}

/**
 * The raw crop names a farmer can be matched on: their planted crops and their
 * live listings.
 *
 * BOTH, and not one or the other. `Crop` is what is in the ground and is the
 * better signal for a group deciding on a member — but a farmer who registered
 * through the marketplace side may have listings and no Crop documents at all,
 * and reading only Crop would report them as `farmer_crops_unknown` when the
 * app plainly knows what they sell.
 */
async function farmerCropNames({ Crop, CropListing }, uid) {
  const [crops, listings] = await Promise.all([
    Crop.find({ firebaseUid: uid }).select('name localName').lean(),
    CropListing.find({ farmerUid: uid }).select('cropName').lean(),
  ]);
  const names = [];
  for (const c of crops) if (c.name) names.push(c.name);
  for (const l of listings) if (l.cropName) names.push(l.cropName);
  return names;
}

module.exports = {
  FOCUS_CROP_NAMES,
  MAX_FOCUS_CROPS,
  canonicalCropName,
  validateFocusCrops,
  matchFarmerToFocus,
  farmerCropNames,
  STATUS_NOTE,
};

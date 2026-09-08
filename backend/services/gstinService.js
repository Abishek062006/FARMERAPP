// GSTIN validation — format and checksum.
//
// WHAT THIS DOES AND, MORE IMPORTANTLY, WHAT IT DOES NOT
//   It checks that a GSTIN is well-formed and that its check digit is correct.
//   A number that passes was almost certainly issued by the GST system rather
//   than typed at random, because the check digit is a mod-36 function of the
//   other fourteen characters.
//
//   It does NOT confirm the number belongs to this person, that it is active,
//   or that it is not suspended. That needs a lookup against the GST portal,
//   which requires registration and is not wired up here.
//
//   So a passing checksum must never be presented to a farmer as "verified
//   business". It is "GSTIN on file, format checks out" — which is genuinely
//   worth something (it rules out casual fakes) and is a much smaller claim.
//   The distinction is enforced in models/User.js: self-service can reach
//   'documents_submitted', never 'verified'.
//
// FORMAT (15 chars)
//   1-2   state code, 01-38
//   3-12  PAN — 5 letters, 4 digits, 1 letter
//   13    entity number for that PAN in that state, 1-9 or A-Z
//   14    'Z' by default
//   15    check digit

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// State codes as used by GST. 27 is Maharashtra — the only one this app
// expects, though a buyer registered elsewhere is perfectly legitimate.
const STATE_CODES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli',
  '27': 'Maharashtra', '28': 'Andhra Pradesh (old)', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh',
};

const SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * The GST check digit.
 *
 * Each of the first 14 characters is valued 0-35, multiplied by an alternating
 * weight of 1 and 2, and — this is the part people get wrong — the QUOTIENT and
 * REMAINDER of that product over 36 are both added to the running total, not
 * the product itself. The check digit is whatever brings the total to a
 * multiple of 36.
 */
function checkDigit(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(first14[i]);
    if (value < 0) return null;
    const weight = (i % 2 === 0) ? 1 : 2;
    const product = value * weight;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

/**
 * Validate a GSTIN.
 * Returns { valid, reason, gstin, stateCode, state, pan } — `reason` names the
 * first thing wrong, so the UI can say which, rather than "invalid".
 */
function validateGstin(raw) {
  const gstin = String(raw || '').toUpperCase().replace(/\s/g, '');

  if (!gstin) return { valid: false, reason: 'EMPTY', message: 'Enter a GSTIN' };
  if (gstin.length !== 15)
    return { valid: false, reason: 'LENGTH', message: `A GSTIN is 15 characters — this is ${gstin.length}` };
  if (!SHAPE.test(gstin))
    return { valid: false, reason: 'SHAPE', message: 'That is not the shape of a GSTIN (2 digits, 10-character PAN, then 3 more)' };

  const stateCode = gstin.slice(0, 2);
  if (!STATE_CODES[stateCode])
    return { valid: false, reason: 'STATE_CODE', message: `${stateCode} is not a valid GST state code` };

  const expected = checkDigit(gstin.slice(0, 14));
  if (expected !== gstin[14])
    return { valid: false, reason: 'CHECKSUM', message: 'That GSTIN\'s check digit is wrong — please re-check it' };

  return {
    valid: true,
    gstin,
    stateCode,
    state: STATE_CODES[stateCode],
    pan: gstin.slice(2, 12),
  };
}

module.exports = { validateGstin, checkDigit, STATE_CODES };

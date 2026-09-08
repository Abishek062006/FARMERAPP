// Canonical district lists, keyed by state — used to constrain the District
// field at land registration to a real administrative district, instead of
// whatever a GPS reverse-geocode happens to return. Expo's reverseGeocodeAsync
// delegates to the device's native geocoder, which is not guaranteed to
// return administrative-level granularity — it can return a neighborhood or
// residential-layout name instead (e.g. "AVP Azhagammal Nagar"), and a free
// TextInput bound directly to that value will silently save the garbage
// straight onto the Land record, breaking every downstream feature keyed on
// district (mandi prices, crop recommendations).
//
// Replaces src/utils/tnDistricts.js. Keyed by state so a second state is a
// data addition rather than a code change; the app serves Maharashtra today.
export const DEFAULT_STATE = 'Maharashtra';

export const DISTRICTS_BY_STATE = {
  Maharashtra: [
    'Ahilyanagar', 'Akola', 'Amravati', 'Beed', 'Bhandara',
    'Buldhana', 'Chandrapur', 'Chhatrapati Sambhajinagar', 'Dharashiv', 'Dhule',
    'Gadchiroli', 'Gondia', 'Hingoli', 'Jalgaon', 'Jalna',
    'Kolhapur', 'Latur', 'Mumbai City', 'Mumbai Suburban', 'Nagpur',
    'Nanded', 'Nandurbar', 'Nashik', 'Palghar', 'Parbhani',
    'Pune', 'Raigad', 'Ratnagiri', 'Sangli', 'Satara',
    'Sindhudurg', 'Solapur', 'Thane', 'Wardha', 'Washim',
    'Yavatmal',
  ],
};

export const MH_DISTRICTS = DISTRICTS_BY_STATE.Maharashtra;

function normalize(str) {
  return String(str || '').toLowerCase().replace(/[^a-z]/g, '');
}

// Common spelling variants a geocoder or older data might return, mapped to
// the canonical spelling above. Keep in step with DISTRICT_ALIASES in
// backend/services/geoService.js — the first three are renames, not
// misspellings, and most datasets still use the old name.
const ALIASES_BY_STATE = {
  Maharashtra: {
    aurangabad: 'Chhatrapati Sambhajinagar',
    sambhajinagar: 'Chhatrapati Sambhajinagar',
    chatrapatisambhajinagar: 'Chhatrapati Sambhajinagar',
    chattrapatisambhajinagar: 'Chhatrapati Sambhajinagar',
    osmanabad: 'Dharashiv',
    usmanabad: 'Dharashiv',
    ahmednagar: 'Ahilyanagar',
    ahmadnagar: 'Ahilyanagar',
    ahemadnagar: 'Ahilyanagar',
    amarawati: 'Amravati',
    amaravati: 'Amravati',
    gondiya: 'Gondia',
    nasik: 'Nashik',
    bombay: 'Mumbai City',
    mumbai: 'Mumbai City',
    greatermumbai: 'Mumbai City',
    mumbaisuburb: 'Mumbai Suburban',
    bandrae: 'Mumbai Suburban',
    buldana: 'Buldhana',
    raigarh: 'Raigad',
    sholapur: 'Solapur',
    yeotmal: 'Yavatmal',
    chanda: 'Chandrapur',
    poona: 'Pune',
    murum: 'Dharashiv',
    navimumbai: 'Thane',
    pimprichinchwad: 'Pune',
  },
};

/**
 * Best-effort match of an arbitrary geocoded/typed string against a real
 * district — exact, then alias, then substring in either direction. Returns
 * null (never a guess) if nothing plausible matches, so callers can leave
 * the field for the farmer to pick manually instead of silently keeping
 * something wrong.
 */
export function matchDistrict(rawValue, state = DEFAULT_STATE) {
  const list = DISTRICTS_BY_STATE[state] || [];
  const aliases = ALIASES_BY_STATE[state] || {};
  const target = normalize(rawValue);
  if (!target) return null;

  const exact = list.find((d) => normalize(d) === target);
  if (exact) return exact;

  if (aliases[target]) return aliases[target];

  const loose = list.find((d) => {
    const dn = normalize(d);
    return target.includes(dn) || dn.includes(target);
  });
  return loose || null;
}

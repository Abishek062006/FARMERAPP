// Canonical Tamil Nadu district list — used to constrain the District field
// at land registration to a real administrative district, instead of
// whatever a GPS reverse-geocode happens to return. Expo's reverseGeocodeAsync
// delegates to the device's native geocoder, which is not guaranteed to
// return administrative-level granularity — it can return a neighborhood or
// residential-layout name instead (e.g. "AVP Azhagammal Nagar"), and a free
// TextInput bound directly to that value will silently save the garbage
// straight onto the Land record, breaking every downstream feature keyed on
// district (mandi prices, crop recommendations).
export const TN_DISTRICTS = [
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore',
  'Dharmapuri', 'Dindigul', 'Erode', 'Kallakurichi', 'Kanchipuram',
  'Kanyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai',
  'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai',
  'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi',
  'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli',
  'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur',
  'Vellore', 'Villupuram', 'Virudhunagar',
];

function normalize(str) {
  return String(str || '').toLowerCase().replace(/[^a-z]/g, '');
}

// Common spelling variants a geocoder or older data might return, mapped to
// the canonical spelling used above.
const ALIASES = {
  tuticorin: 'Thoothukudi',
  trichy: 'Tiruchirappalli',
  thiruchirappalli: 'Tiruchirappalli',
  kanniyakumari: 'Kanyakumari',
  sivagangai: 'Sivaganga',
  villupuram: 'Villupuram',
  viluppuram: 'Villupuram',
  tirupattur: 'Tirupathur',
  tirupur: 'Tiruppur',
  thiruvallur: 'Tiruvallur',
  thiruvannamalai: 'Tiruvannamalai',
  thiruvarur: 'Tiruvarur',
  kancheepuram: 'Kanchipuram',
};

// Best-effort match of an arbitrary geocoded/typed string against a real TN
// district — exact, then alias, then substring in either direction. Returns
// null (never a guess) if nothing plausible matches, so callers can leave
// the field for the farmer to pick manually instead of silently keeping
// something wrong.
export function matchTnDistrict(rawValue) {
  const target = normalize(rawValue);
  if (!target) return null;

  const exact = TN_DISTRICTS.find((d) => normalize(d) === target);
  if (exact) return exact;

  if (ALIASES[target]) return ALIASES[target];

  const loose = TN_DISTRICTS.find((d) => {
    const dn = normalize(d);
    return target.includes(dn) || dn.includes(target);
  });
  return loose || null;
}

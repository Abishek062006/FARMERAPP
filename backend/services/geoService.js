// Geo helpers. There was no distance maths anywhere in this codebase before
// the Farm Market work — every "near me" feature was a case-insensitive regex
// on a city name.

const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in km between two {lat, lng} points.
 * Straight-line — for road distance use routeService.getRoute().
 */
function haversineKm(a, b) {
  if (!a || !b) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Normalises the FOUR coordinate shapes this app already contains into one
 * flat {lat, lng}. Migrating the existing four to a single shape would touch
 * more call sites than it is worth; new code uses flat {lat, lng} and calls
 * this at the boundary.
 *
 *   { lat, lng }                          CropListing.location
 *   { coordinates: { lat, lng } }         User.location, Land.location
 *   { latitude, longitude }               frontend locationService
 *   { coords: { latitude, longitude } }   raw expo-location fix
 */
function toLatLng(src) {
  if (!src) return null;

  const candidates = [
    src,
    src.coordinates,
    src.coords,
    src.location,
    src.location && src.location.coordinates,
  ];

  for (const c of candidates) {
    if (!c) continue;
    const lat = c.lat !== undefined ? c.lat : c.latitude;
    const lng = c.lng !== undefined ? c.lng : c.longitude;
    if (isValidCoord(lat, lng)) return { lat: Number(lat), lng: Number(lng) };
  }
  return null;
}

function isValidCoord(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  return (
    Number.isFinite(a) && Number.isFinite(b) &&
    a >= -90 && a <= 90 && b >= -180 && b <= 180 &&
    // 0,0 is in the Gulf of Guinea — in this app it always means "never set"
    !(a === 0 && b === 0)
  );
}

/**
 * Escapes user input before it goes into a $regex query.
 * routes/listings.js currently interpolates the raw ?city= value straight into
 * a RegExp, so a vendor typing "(a+)+$" can pin a CPU core.
 */
function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const roundKm = (km) => (km == null ? null : Math.round(km * 10) / 10);

module.exports = { haversineKm, toLatLng, isValidCoord, escapeRegex, roundKm };

// ─────────────────────────────────────────────────────────────────────────
// District resolution
// ─────────────────────────────────────────────────────────────────────────
const { TN_DISTRICT_POINTS, TN_DISTRICTS } = require('../data/tnDistrictCentroids');

const normalizeName = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

// Spelling variants an older record or a device geocoder might carry.
const DISTRICT_ALIASES = {
  trichy: 'Tiruchirappalli', tiruchi: 'Tiruchirappalli', tiruchirapalli: 'Tiruchirappalli',
  thiruvallur: 'Tiruvallur', thiruvarur: 'Tiruvarur', thiruvannamalai: 'Tiruvannamalai',
  thirunelveli: 'Tirunelveli', nellai: 'Tirunelveli',
  thoothukkudi: 'Thoothukudi', tuticorin: 'Thoothukudi',
  kanniyakumari: 'Kanyakumari', nagercoil: 'Kanyakumari',
  thenilgiris: 'Nilgiris', ooty: 'Nilgiris', udhagamandalam: 'Nilgiris',
  virudunagar: 'Virudhunagar', sivagangai: 'Sivaganga',
  thirupathur: 'Tirupathur', tirupattur: 'Tirupathur',
  thiruppur: 'Tiruppur', tirupur: 'Tiruppur',
  kancheepuram: 'Kanchipuram', villuppuram: 'Villupuram',
  cuddalur: 'Cuddalore', dindugal: 'Dindigul',
};

const BY_NAME = new Map(TN_DISTRICTS.map((d) => [normalizeName(d), d]));

/** Exact/alias match of a stored string to a real TN district, or null. */
function matchTnDistrict(raw) {
  const n = normalizeName(raw);
  if (!n) return null;
  return BY_NAME.get(n) || DISTRICT_ALIASES[n] || null;
}

/** Nearest district centroid to a {lat, lng}. See tnDistrictCentroids.js. */
function districtFromCoords(point) {
  const p = toLatLng(point);
  if (!p) return null;
  let best = null, bestKm = Infinity;
  for (const c of TN_DISTRICT_POINTS) {
    const km = haversineKm(p, c);
    if (km < bestKm) { bestKm = km; best = c.district; }
  }
  // Guard against a point far outside Tamil Nadu snapping to a border district.
  return bestKm <= 200 ? best : null;
}

/**
 * Canonical district for a listing: trust the stored string only when it is a
 * real district, otherwise derive it from the (reliable) coordinates.
 */
function resolveDistrict(storedName, point) {
  return matchTnDistrict(storedName) || districtFromCoords(point);
}

module.exports.matchTnDistrict = matchTnDistrict;
module.exports.districtFromCoords = districtFromCoords;
module.exports.resolveDistrict = resolveDistrict;
module.exports.TN_DISTRICTS = TN_DISTRICTS;

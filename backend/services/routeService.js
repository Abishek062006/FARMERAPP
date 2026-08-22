const axios = require('axios');
const { haversineKm } = require('./geoService');

// Road routing for delivery quotes and the "blue line" on the tracking map.
//
// Uses OSRM. The public demo server has a fair-use policy, aggressive rate
// limits and no SLA, so three things protect us:
//   1. every call is made server-side, so there is one cache for all clients
//      and the fare stays authoritative
//   2. a hard 6s timeout — a vendor's fare screen must never hang on it
//   3. a haversine fallback that is always used rather than failing
// Point OSRM_URL at a self-hosted instance (docker osrm/osrm-backend with the
// Tamil Nadu extract) and nothing else changes.
const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org';

// Measured Thanjavur → Trichy: 64.9 km by road vs 47.3 km straight-line.
const ROAD_FACTOR = 1.35;
// Deliberately below OSRM's car profile (which returned ~63 km/h): these are
// loaded goods vehicles on district roads.
const FALLBACK_KMPH = 40;

const CACHE = new Map();
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;

// 4 decimals ≈ 11 m, so GPS jitter on a stationary pin still hits the cache.
const keyOf = (a, b) =>
  `${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;

/** Thin a polyline to at most `max` points — a 300 km route can come back
 *  with thousands, and every one of them crosses the RN bridge. */
function decimate(points, max = 300) {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

function fallback(from, to) {
  const distanceKm = haversineKm(from, to) * ROAD_FACTOR;
  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMin: Math.max(1, Math.round((distanceKm / FALLBACK_KMPH) * 60)),
    polyline: [[from.lat, from.lng], [to.lat, to.lng]],
    source: 'haversine',
  };
}

/**
 * Road distance, duration and geometry between two {lat,lng} points.
 * Never throws — falls back to a straight line rather than failing a booking.
 */
async function getRoute(from, to) {
  if (!from || !to) return null;

  const k = keyOf(from, to);
  const hit = CACHE.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let result;
  try {
    const url = `${OSRM_URL}/route/v1/driving/`
      + `${from.lng},${from.lat};${to.lng},${to.lat}`
      + `?overview=full&geometries=geojson`;
    const { data } = await axios.get(url, { timeout: 6000 });

    if (data.code !== 'Ok' || !data.routes || !data.routes.length) throw new Error(data.code || 'no route');
    const r = data.routes[0];
    result = {
      distanceKm: Math.round((r.distance / 1000) * 10) / 10,
      durationMin: Math.max(1, Math.round(r.duration / 60)),
      // GeoJSON is [lng,lat]; Leaflet wants [lat,lng].
      polyline: decimate(r.geometry.coordinates.map(([lng, lat]) => [lat, lng])),
      source: 'osrm',
    };
  } catch (err) {
    console.log('🗺️  OSRM unavailable, using straight-line estimate:', err.message);
    result = fallback(from, to);
  }

  if (CACHE.size >= MAX_ENTRIES) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(k, { at: Date.now(), value: result });
  return result;
}

module.exports = { getRoute, decimate, ROAD_FACTOR, OSRM_URL };

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
// Maharashtra extract) and nothing else changes.
const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org';

// Re-measured against live OSRM for Maharashtra (the old value, 1.35, was
// calibrated on a single Thanjavur → Trichy leg in Tamil Nadu and over-states
// Maharashtra road distance by ~15%):
//
//   Nashik → Lasalgaon    59.0 km road / 49.8 straight  = 1.184
//   Nashik → Pune        212.9 km road / 164.4 straight = 1.295
//   Pune → Solapur       253.3 km road / 236.8 straight = 1.070
//   Nagpur → Amravati    152.5 km road / 137.8 straight = 1.107
//   Kolhapur → Sangli     48.6 km road /  39.6 straight = 1.229
//                                                  mean = 1.177
//
// Set just above the mean: this factor only runs on the fallback path when
// OSRM is unavailable, and under-stating distance under-pays the agent on a
// leg that is already thin (see the return-leg risk in the build plan).
const ROAD_FACTOR = 1.20;
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
 * A route through several stops, in the order given.
 *
 * Same OSRM endpoint as getRoute — the API takes any number of semicolon
 * separated waypoints, so a three-farm pickup run is the same call with more
 * coordinates, not a different service. `legs` comes back per hop, which is
 * what lets the agent's screen say "12 km to the next farm" rather than only
 * knowing the total.
 *
 * Never throws. On failure it chains haversine fallbacks leg by leg, so a
 * consignment can still be priced and dispatched with OSRM down.
 */
async function getMultiStopRoute(points) {
  const pts = (points || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pts.length < 2) return null;

  // Two points is the ordinary case — reuse getRoute so it shares the cache.
  if (pts.length === 2) {
    const r = await getRoute(pts[0], pts[1]);
    return r && { ...r, legs: [{ distanceKm: r.distanceKm, durationMin: r.durationMin }] };
  }

  const key = 'multi:' + pts.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let result;
  try {
    const coords = pts.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const { data } = await axios.get(url, { timeout: 8000 });
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error(data.code || 'no route');

    const r = data.routes[0];
    result = {
      distanceKm: Math.round((r.distance / 1000) * 10) / 10,
      durationMin: Math.max(1, Math.round(r.duration / 60)),
      polyline: decimate(r.geometry.coordinates.map(([lng, lat]) => [lat, lng])),
      legs: (r.legs || []).map((l) => ({
        distanceKm: Math.round((l.distance / 1000) * 10) / 10,
        durationMin: Math.max(1, Math.round(l.duration / 60)),
      })),
      source: 'osrm',
    };
  } catch (err) {
    console.log('🗺️  OSRM multi-stop unavailable, chaining straight lines:', err.message);
    const legs = [];
    let distanceKm = 0, durationMin = 0;
    const polyline = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const f = fallback(pts[i], pts[i + 1]);
      legs.push({ distanceKm: f.distanceKm, durationMin: f.durationMin });
      distanceKm += f.distanceKm;
      durationMin += f.durationMin;
      polyline.push(...f.polyline);
    }
    result = {
      distanceKm: Math.round(distanceKm * 10) / 10,
      durationMin, polyline, legs, source: 'haversine',
    };
  }

  if (CACHE.size >= MAX_ENTRIES) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, { at: Date.now(), value: result });
  return result;
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

module.exports = { getRoute, getMultiStopRoute, decimate, ROAD_FACTOR, OSRM_URL };

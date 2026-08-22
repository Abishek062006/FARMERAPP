// Walks a position along a polyline at a set speed.
//
// Why this exists: tracking is the one feature that cannot be demonstrated
// from a desk. Proving it for real needs two people and a vehicle driving
// between two districts. This drives the agent's position along the same route
// the server already computed, and POSTs it through the *real* /location
// endpoint — so the server, the ordering guard, the vendor's polling and the
// map marker are all exercised exactly as they would be on the road. Only the
// GPS chip is replaced.

const R = 6371;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Compass bearing a→b, in degrees clockwise from north. */
export function bearing(a, b) {
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
            Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Turns [[lat,lng], …] into a function of distance travelled.
 * Returns null for an unusable polyline so callers can fall back to real GPS.
 */
export function makeRouteWalker(polyline) {
  if (!Array.isArray(polyline) || polyline.length < 2) return null;

  const pts = polyline.map(([lat, lng]) => ({ lat, lng }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversineKm(pts[i - 1], pts[i]));
  const totalKm = cum[cum.length - 1];
  if (!(totalKm > 0)) return null;

  return {
    totalKm,
    /** Position and heading at `km` along the route. */
    at(km) {
      const d = Math.max(0, Math.min(km, totalKm));
      let i = 1;
      while (i < cum.length && cum[i] < d) i++;
      const a = pts[i - 1], b = pts[Math.min(i, pts.length - 1)];
      const span = cum[Math.min(i, cum.length - 1)] - cum[i - 1];
      const t = span > 0 ? (d - cum[i - 1]) / span : 0;
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        heading: bearing(a, b),
        done: d >= totalKm,
        progress: totalKm > 0 ? d / totalKm : 1,
      };
    },
  };
}

/**
 * Drives `onMove` along a polyline. Returns a stop() function.
 *   startSimulation({ polyline, kmph: 40, tickMs: 4000, onMove, onArrive })
 */
export function startSimulation({ polyline, kmph = 40, tickMs = 4000, onMove, onArrive }) {
  const walker = makeRouteWalker(polyline);
  if (!walker) return () => {};

  let km = 0;
  let stopped = false;
  const stepKm = (kmph * (tickMs / 1000)) / 3600;

  onMove(walker.at(0));
  const timer = setInterval(() => {
    if (stopped) return;
    km += stepKm;
    const p = walker.at(km);
    onMove(p);
    if (p.done) { clearInterval(timer); onArrive && onArrive(); }
  }, tickMs);

  return () => { stopped = true; clearInterval(timer); };
}

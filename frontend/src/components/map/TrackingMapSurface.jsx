import React, { useRef, useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { buildLeafletPage } from './leafletBase';
import { VEHICLE_ART } from '../vehicles/vehicleArt';

// Live tracking map.
//
// WebMapSurface cannot be reused for this: it interpolates `center` into its
// HTML, so every camera change rebuilds the page and reloads the WebView,
// losing the marker, the route and the zoom. For tracking, the position
// changes every few seconds — so this component inverts the model. The HTML is
// built ONCE, and everything afterwards happens through injected JS calls into
// the live page.

const TRACK_CSS = `
  .pin { width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff;
         box-shadow: 0 0 0 2px rgba(0,0,0,.35); }
  .pin-pickup { background: #16A34A; }
  .pin-drop   { background: #EA580C; border-radius: 3px; }
  .veh { width: 48px; height: 30px; transition: opacity .3s;
         filter: drop-shadow(0 2px 4px rgba(0,0,0,.35)); }
  .veh svg { width: 100%; height: 100%; display: block; }
`;

// The SAME art the React Native vehicle picker renders — react-native-svg
// cannot reach inside a WebView, so the shared strings are what keep the
// picker and the moving marker from drifting apart.
const trackingJs = `
  var ART = ${JSON.stringify(VEHICLE_ART)};
  var pickupPin = null, dropPin = null, routeLine = null, approachLine = null;
  var vehicle = null, raf = null, following = true, layers = [];

  function icon(cls) {
    return L.divIcon({ className: '', html: '<div class="pin ' + cls + '"></div>',
                       iconSize: [16, 16], iconAnchor: [8, 8] });
  }

  window.__map = {
    setPins: function (p, d) {
      if (p) {
        if (pickupPin) pickupPin.setLatLng([p.lat, p.lng]);
        else { pickupPin = L.marker([p.lat, p.lng], { icon: icon('pin-pickup') }).addTo(map); layers.push(pickupPin); }
      }
      if (d) {
        if (dropPin) dropPin.setLatLng([d.lat, d.lng]);
        else { dropPin = L.marker([d.lat, d.lng], { icon: icon('pin-drop') }).addTo(map); layers.push(dropPin); }
      }
    },

    setRoute: function (coords, which) {
      var target = which === 'approach' ? approachLine : routeLine;
      if (target) { map.removeLayer(target); layers = layers.filter(function (l) { return l !== target; }); }
      if (!coords || coords.length < 2) return;
      var line = L.polyline(coords, {
        color: which === 'approach' ? '#94A3B8' : '#2563EB',
        weight: which === 'approach' ? 4 : 5,
        opacity: which === 'approach' ? 0.75 : 0.9,
        dashArray: which === 'approach' ? '8,8' : null
      }).addTo(map);
      layers.push(line);
      if (which === 'approach') approachLine = line; else routeLine = line;
    },

    clearRoute: function (which) { window.__map.setRoute(null, which); },

    // Smooth motion is done HERE, in the page, not in React Native. One update
    // per poll interval is lerped to 60fps by requestAnimationFrame, so the
    // marker glides instead of teleporting — and no per-frame traffic crosses
    // the RN bridge.
    setVehicle: function (lat, lng, heading, type, ms) {
      if (!vehicle) {
        vehicle = L.marker([lat, lng], {
          zIndexOffset: 1000,
          icon: L.divIcon({ className: '', iconSize: [48, 30], iconAnchor: [24, 15],
                            html: '<div class="veh" id="veh">' + (ART[type] || ART.tempo) + '</div>' })
        }).addTo(map);
        layers.push(vehicle);
        if (following) map.panTo([lat, lng], { animate: false });
        return;
      }
      var from = vehicle.getLatLng(), t0 = performance.now();
      if (raf) cancelAnimationFrame(raf);
      function step(now) {
        var k = Math.min(1, (now - t0) / (ms || 5000));
        var la = from.lat + (lat - from.lat) * k;
        var ln = from.lng + (lng - from.lng) * k;
        vehicle.setLatLng([la, ln]);
        if (following) map.panTo([la, ln], { animate: false });
        if (k < 1) raf = requestAnimationFrame(step); else raf = null;
      }
      raf = requestAnimationFrame(step);
      var el = document.getElementById('veh');
      // Art faces right; Leaflet bearings are clockwise from north.
      if (el && typeof heading === 'number') el.style.transform = 'rotate(' + (heading - 90) + 'deg)';
    },

    setStale: function (on) {
      var el = document.getElementById('veh');
      if (el) el.style.opacity = on ? 0.35 : 1;
    },

    follow: function (on) { following = !!on; },

    fitAll: function () {
      if (!layers.length) return;
      try { map.fitBounds(L.featureGroup(layers).getBounds().pad(0.18)); } catch (e) {}
    }
  };

  map.on('dragstart', function () {
    // The moment the user pans, stop yanking the camera back.
    following = false;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'unfollow' }));
  });

  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
`;

const TN_CENTER = { lat: 11.1271, lng: 78.6569 };

export default function TrackingMapSurface({ initialCenter, initialZoom = 13, onReady, onUnfollow }) {
  const webRef = useRef(null);
  const readyRef = useRef(false);
  const queueRef = useRef([]);
  const [failed, setFailed] = useState(false);

  // BUILT ONCE. `initialCenter` is captured on the first render and
  // deliberately never re-read — every later camera move goes through the
  // imperative API below. If this HTML string ever changes the WebView
  // reloads and all map state is lost, which is the exact bug this component
  // exists to avoid. Do not "fix" the empty dependency array.
  const frozen = useRef(initialCenter || TN_CENTER).current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(
    () => buildLeafletPage({ center: frozen, zoom: initialZoom, extraCss: TRACK_CSS, extraJs: trackingJs }),
    []
  );
  const source = useMemo(() => ({ html }), [html]);

  const call = useCallback((js) => {
    // Guarded and terminated with `true;`: a call landing during a reload can
    // never throw, and iOS WKWebView warns loudly if injected JS returns
    // anything non-serialisable.
    const wrapped = `try{ if(window.__map){ ${js} } }catch(e){}; true;`;
    if (!readyRef.current) { queueRef.current.push(wrapped); return; }
    webRef.current?.injectJavaScript(wrapped);
  }, []);

  const api = useMemo(() => ({
    setPins:     (p, d)   => call(`window.__map.setPins(${JSON.stringify(p)},${JSON.stringify(d)});`),
    setRoute:    (c, w)   => call(`window.__map.setRoute(${JSON.stringify(c || null)},${JSON.stringify(w || 'main')});`),
    clearRoute:  (w)      => call(`window.__map.clearRoute(${JSON.stringify(w || 'main')});`),
    setVehicle:  (lat, lng, heading, type, ms = 5000) =>
                             call(`window.__map.setVehicle(${lat},${lng},${heading || 0},${JSON.stringify(type)},${ms});`),
    setStale:    (on)     => call(`window.__map.setStale(${!!on});`),
    follow:      (on)     => call(`window.__map.follow(${!!on});`),
    fitAll:      ()       => call(`window.__map.fitAll();`),
  }), [call]);

  const handleMessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }

    if (msg.type === 'ready') {
      readyRef.current = true;
      // Anything the parent asked for before the page finished loading is
      // replayed now. injectJavaScript fired too early is silently swallowed,
      // which is a miserable bug to find.
      queueRef.current.forEach((js) => webRef.current?.injectJavaScript(js));
      queueRef.current = [];
      onReady?.(api);
    }
    if (msg.type === 'unfollow') onUnfollow?.();
    // leafletBase posts this if the Leaflet CDN fails to load.
    if (msg.type === 'error') setFailed(true);
  };

  if (failed) {
    return (
      <View style={s.fallback}>
        <Ionicons name="map-outline" size={34} color="#94A3B8" />
        <Text style={s.fallbackTitle}>Map unavailable</Text>
        <Text style={s.fallbackText}>Check your connection. Delivery updates below still work.</Text>
      </View>
    );
  }

  return (
    <WebView
      ref={webRef}
      originWhitelist={['*']}
      source={source}
      onMessage={handleMessage}
      style={s.map}
      javaScriptEnabled
      domStorageEnabled
      androidLayerType="hardware"
      onError={() => setFailed(true)}
    />
  );
}

const s = StyleSheet.create({
  map: { flex: 1, backgroundColor: '#E2E8F0' },
  fallback: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F8FAFC', padding: 24, gap: 6,
  },
  fallbackTitle: { fontSize: 15, fontWeight: '700', color: '#475569', marginTop: 4 },
  fallbackText:  { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 19 },
});

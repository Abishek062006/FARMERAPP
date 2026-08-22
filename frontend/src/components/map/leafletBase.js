// Shared Leaflet-in-a-WebView basemap, used by both map surfaces:
//   - WebMapSurface       (tap to drop one pin — land/destination picking)
//   - TrackingMapSurface  (live delivery tracking, added in phase 5)
//
// A native maps SDK cannot be used in this app: Expo Go only loads the native
// modules compiled into it, and requiring one it lacks hangs the app at
// startup — react-native-maps was tried and did exactly that on Android.
// So the map is Leaflet in a WebView with free, keyless tiles.
//
// This module exists so the tile configuration below lives in ONE place. It
// was arrived at empirically and is easy to get subtly wrong.

export const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
export const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

/** Page chrome: full-bleed map + the Satellite/Map toggle. */
export const BASE_MAP_CSS = `
  html, body, #map { height: 100%; margin: 0; padding: 0; }
  .layer-switch {
    position: absolute; top: 12px; right: 12px; z-index: 1000;
    display: flex; border-radius: 10px; overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,.35);
    font-family: -apple-system, Roboto, "Segoe UI", sans-serif;
  }
  .layer-switch button {
    border: 0; background: #fff; color: #333;
    font-size: 13px; font-weight: 600; padding: 10px 15px;
  }
  .layer-switch button.active { background: #4CAF50; color: #fff; }
`;

/** Map container + layer toggle markup. */
export const BASE_MAP_BODY = `
  <div id="map"></div>
  <div class="layer-switch">
    <button id="btn-sat" class="active">Satellite</button>
    <button id="btn-map">Map</button>
  </div>
`;

/**
 * Creates `map` (a global, so later script blocks can use it) with the
 * satellite/street basemaps and wires the toggle.
 *
 * @param {{lat:number,lng:number}} center  initial camera position
 * @param {number} zoom                     initial zoom
 */
export function baseMapJs(center, zoom = 16) {
  return `
    var map = L.map('map').setView([${center.lat}, ${center.lng}], ${zoom});

    // Esri World Imagery — free satellite basemap, no key required.
    // NOTE the {z}/{y}/{x} order: ArcGIS tile REST is row/col, NOT the
    // {z}/{x}/{y} that OSM-style tile URLs use.
    //
    // maxNativeZoom is 18, not 19: verified against real tiles over both
    // Thanjavur town and rural Cauvery delta farmland — z18 returns genuine
    // imagery (field boundaries visible), while z19 returns Esri's grey
    // "Map data not yet available" placeholder for this region.
    var satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Imagery &copy; Esri', maxZoom: 20, maxNativeZoom: 18 }
    );
    var labels = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, maxNativeZoom: 18 }
    );
    var street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    });

    satellite.addTo(map);
    labels.addTo(map);

    var btnSat = document.getElementById('btn-sat');
    var btnMap = document.getElementById('btn-map');
    btnSat.onclick = function () {
      map.removeLayer(street);
      satellite.addTo(map); labels.addTo(map);
      btnSat.classList.add('active'); btnMap.classList.remove('active');
    };
    btnMap.onclick = function () {
      map.removeLayer(satellite); map.removeLayer(labels);
      street.addTo(map);
      btnMap.classList.add('active'); btnSat.classList.remove('active');
    };
  `;
}

/**
 * Assembles a complete page from the shared base plus a surface's own bits.
 * `extraCss` / `extraJs` are injected after the base, so they can restyle or
 * build on `map`.
 */
export function buildLeafletPage({ center, zoom = 16, extraCss = '', extraJs = '' }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="${LEAFLET_CSS_URL}" />
  <style>${BASE_MAP_CSS}${extraCss}</style>
</head>
<body>
  ${BASE_MAP_BODY}
  <script src="${LEAFLET_JS_URL}"
          onerror="window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',detail:'leaflet-cdn'}))"></script>
  <script>
    ${baseMapJs(center, zoom)}
    ${extraJs}
  </script>
</body>
</html>`;
}

import React from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildLeafletPage } from './leafletBase';

// Tap-to-place-one-pin map surface, used by LocationMapPicker.
//
// The basemap (Esri satellite / OSM street, the layer toggle, tile quirks)
// now lives in ./leafletBase so the tracking map can share it. Everything
// below is what is specific to picking a single location: the green pin and
// the click/drag handlers that report it back to React Native.
//
// NOTE: this surface rebuilds its HTML whenever `center` changes, which
// reloads the WebView. That is fine here — the picker sets `center` once,
// before mounting — but it is exactly why live tracking needs a different
// component with an imperative API rather than a `center` prop.
const PIN_CSS = `
  .pin {
    width: 20px; height: 20px; border-radius: 50%;
    background: #4CAF50; border: 3px solid #fff;
    box-shadow: 0 0 0 2px rgba(0,0,0,.4);
  }
`;

const PICKER_JS = `
  var pinIcon = L.divIcon({
    className: '', html: '<div class="pin"></div>',
    iconSize: [20, 20], iconAnchor: [10, 10]
  });

  var marker = null;
  function placeMarker(lat, lng) {
    if (marker) {
      marker.setLatLng([lat, lng]);
    } else {
      marker = L.marker([lat, lng], { draggable: true, icon: pinIcon }).addTo(map);
      marker.on('dragend', function () {
        var pos = marker.getLatLng();
        window.ReactNativeWebView.postMessage(JSON.stringify({ lat: pos.lat, lng: pos.lng }));
      });
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({ lat: lat, lng: lng }));
  }

  map.on('click', function (e) {
    placeMarker(e.latlng.lat, e.latlng.lng);
  });
`;

function buildMapHtml(center) {
  return buildLeafletPage({ center, zoom: 16, extraCss: PIN_CSS, extraJs: PICKER_JS });
}

export default function WebMapSurface({ center, onPick }) {
  const handleMessage = (event) => {
    try {
      const { lat, lng } = JSON.parse(event.nativeEvent.data);
      // leafletBase also posts {type:'error'} if the Leaflet CDN fails to
      // load; that message has no lat/lng, so it is ignored here.
      if (typeof lat === 'number' && typeof lng === 'number') onPick(lat, lng);
    } catch {
      // Ignore malformed messages from the WebView.
    }
  };

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html: buildMapHtml(center) }}
      onMessage={handleMessage}
      style={styles.map}
    />
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});

// 2D vehicle art as raw SVG MARKUP STRINGS, not React components.
//
// The same three drawings are needed in two different worlds:
//   - React Native (the vehicle picker) → rendered via <SvgXml xml={...} />
//   - the Leaflet map, which is an HTML page inside a WebView, where
//     react-native-svg cannot reach → interpolated into L.divIcon({html})
// One source of truth for the art, so the picker and the moving map marker can
// never drift apart. Every drawing faces RIGHT and shares a 64×40 viewBox, so
// the map can rotate them by bearing around a common centre.

export const AUTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40">
  <ellipse cx="32" cy="36" rx="22" ry="3" fill="rgba(0,0,0,.15)"/>
  <path d="M14 26V17c0-6 4-10 10-10h9c6 0 10 4 12 9l3 8v2H14z" fill="#F4C430"/>
  <path d="M46 26l-3-8c-2-5-6-9-12-9h-3v17z" fill="#E0AC1F"/>
  <path d="M25 10h7c3.5 0 6 2 7.2 5.2L41 19H25z" fill="#8FD3F4" opacity=".95"/>
  <path d="M18 12c2-2 4-3 6-3v10h-9c0-3 1-5 3-7z" fill="#8FD3F4" opacity=".95"/>
  <rect x="12" y="24" width="40" height="4" rx="2" fill="#1F2937"/>
  <circle cx="21" cy="30" r="6" fill="#111827"/><circle cx="21" cy="30" r="2.4" fill="#9CA3AF"/>
  <circle cx="45" cy="30" r="6" fill="#111827"/><circle cx="45" cy="30" r="2.4" fill="#9CA3AF"/>
  <circle cx="50" cy="21" r="2" fill="#FFF7C2"/>
  <rect x="27" y="4" width="10" height="4" rx="2" fill="#16A34A"/>
</svg>`;

export const TEMPO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40">
  <ellipse cx="32" cy="36" rx="26" ry="3" fill="rgba(0,0,0,.15)"/>
  <rect x="6" y="10" width="34" height="16" rx="2" fill="#F1F5F9" stroke="#CBD5E1"/>
  <path d="M40 12h8l8 8v6H40z" fill="#E2E8F0" stroke="#CBD5E1"/>
  <path d="M42 14h5l5 5h-10z" fill="#8FD3F4"/>
  <rect x="10" y="14" width="12" height="8" rx="1" fill="#E2E8F0"/>
  <rect x="24" y="14" width="12" height="8" rx="1" fill="#E2E8F0"/>
  <rect x="6" y="25" width="50" height="3" rx="1.5" fill="#334155"/>
  <circle cx="17" cy="30" r="5.5" fill="#111827"/><circle cx="17" cy="30" r="2.2" fill="#9CA3AF"/>
  <circle cx="47" cy="30" r="5.5" fill="#111827"/><circle cx="47" cy="30" r="2.2" fill="#9CA3AF"/>
  <circle cx="55" cy="22" r="1.8" fill="#FFF7C2"/>
  <rect x="6" y="10" width="34" height="3" fill="#16A34A"/>
</svg>`;

export const TRUCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40">
  <ellipse cx="32" cy="36" rx="29" ry="3" fill="rgba(0,0,0,.15)"/>
  <rect x="3" y="7" width="34" height="19" rx="2" fill="#2563EB"/>
  <rect x="3" y="7" width="34" height="5" fill="#1D4ED8"/>
  <path d="M6 15h28M6 19h28" stroke="#1D4ED8" stroke-width="1.2"/>
  <path d="M37 11h9l10 9v6H37z" fill="#1E40AF"/>
  <path d="M39 13h6l6 6H39z" fill="#8FD3F4"/>
  <rect x="3" y="25" width="53" height="3.5" rx="1.5" fill="#1F2937"/>
  <circle cx="14" cy="31" r="6" fill="#111827"/><circle cx="14" cy="31" r="2.4" fill="#9CA3AF"/>
  <circle cx="25" cy="31" r="6" fill="#111827"/><circle cx="25" cy="31" r="2.4" fill="#9CA3AF"/>
  <circle cx="48" cy="31" r="6" fill="#111827"/><circle cx="48" cy="31" r="2.4" fill="#9CA3AF"/>
  <circle cx="55" cy="22" r="1.8" fill="#FFF7C2"/>
</svg>`;

export const VEHICLE_ART = { auto: AUTO_SVG, tempo: TEMPO_SVG, truck: TRUCK_SVG };

// Fallback Ionicons name per vehicle, for anywhere SVG is overkill.
export const VEHICLE_ICON = { auto: 'car-sport-outline', tempo: 'bus-outline', truck: 'bus' };

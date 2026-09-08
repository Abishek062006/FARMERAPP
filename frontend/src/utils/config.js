// src/utils/config.js
import Constants from 'expo-constants';

// Auto-detects the Mac's current LAN IP from the address Expo Go used to
// connect to the dev server (Constants.expoConfig.hostUri looks like
// "172.20.10.4:8081"). This means switching Wi-Fi/hotspot networks never
// requires touching this file — the IP is picked up fresh every time you
// run `npx expo start`.
const getDevServerHost = () => {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost;

  if (hostUri) {
    return hostUri.split(':').shift();
  }
  return null;
};

// EXPO_PUBLIC_API_HOST is an escape hatch for cases auto-detection can't
// cover (web preview, a production build, etc). Leave it unset for normal
// on-device development.
const HOST = process.env.EXPO_PUBLIC_API_HOST || getDevServerHost() || 'localhost';

export const API_URL = `http://${HOST}:5050`;

// API Endpoints
export const API_ENDPOINTS = {
  USERS: `${API_URL}/api/users`,

  // Land Management
  LAND:  `${API_URL}/api/land`,
  LANDS: `${API_URL}/api/lands`,
  PLOTS: `${API_URL}/api/plots`,

  // Crop Management
  CROP:  `${API_URL}/api/crop`,
  CROPS: `${API_URL}/api/crops`,

  // Task Management
  TASK:  `${API_URL}/api/task`,
  TASKS: `${API_URL}/api/tasks`,

  // Disease Detection
  DISEASE:  `${API_URL}/api/disease`,
  DISEASES: `${API_URL}/api/diseases`,

  // ✅ Crop Listings (Farmer → Vendor marketplace)
  LISTINGS: `${API_URL}/api/listings`,
  MARKET:   `${API_URL}/api/listings/market`,
  LISTING_PHOTO: (id) => `${API_URL}/api/listings/photo/${id}`,

  // ✅ Orders (purchase + transport booking)
  ORDERS: `${API_URL}/api/orders`,
  OFFERS: `${API_URL}/api/offers`,
  DISPUTES: `${API_URL}/api/disputes`,
  REQUIREMENTS: `${API_URL}/api/requirements`,
  CONSIGNMENTS: `${API_URL}/api/consignments`,
  FPOS: `${API_URL}/api/fpos`,
  // Registry of real, already-incorporated FPOs (SFAC) — search/claim, separate
  // from FPOS above which is the working membership+revenue-share machinery.
  FPO_MASTER: `${API_URL}/api/fpo-master`,

  // G1 — sales the farmer made OUTSIDE this app (APMC, trader, farm gate)
  MANDI_SALES: `${API_URL}/api/mandi-sales`,

  // H1 — godowns, cold stores and kanda chawls
  WAREHOUSES: `${API_URL}/api/warehouses`,

  // Weather
  WEATHER: `${API_URL}/api/weather`,

  // AI Services
  AI: `${API_URL}/api/ai`,

  // Mandi / Agmarknet Prices
  MANDI: `${API_URL}/api/mandi`,

  // Government Schemes & Subsidies
  SCHEMES: `${API_URL}/api/schemes`,
};

// ── PHONE / SMS SIGN-IN: OFF ─────────────────────────────────────────────
//
// Deliberately switched off, and the code behind it is deliberately KEPT.
//
// Why off: SMS is the one part of sign-in that can fail in front of an
// audience. It needs the Phone provider enabled on the Firebase project, a
// handset that actually receives the message, and headroom in Firebase's SMS
// quota — three things that can each go wrong on the day, for a login that
// email already handles. All 2,183 accounts sign in by email.
//
// Why not deleted: it is built, tested (scripts/testPhoneAuth.js, 19
// assertions) and INERT — the Firebase provider answers OPERATION_NOT_ALLOWED,
// so it cannot fire even if a control were left on screen by accident.
// Deleting working, dormant code to achieve the same result as one boolean is
// churn, and re-deriving it later costs a day.
//
// To turn it back on: set this to true AND enable Firebase Console →
// Authentication → Sign-in method → Phone. BOTH are required — the flag alone
// only reveals the button, and the button would then fail with a clear
// "phone sign-in is switched off" message rather than anything mysterious.
export const PHONE_AUTH_ENABLED = false;

// Export default API URL
export default API_URL;

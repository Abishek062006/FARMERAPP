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

  // Weather
  WEATHER: `${API_URL}/api/weather`,

  // AI Services
  AI: `${API_URL}/api/ai`,

  // Mandi / Agmarknet Prices
  MANDI: `${API_URL}/api/mandi`,

  // Government Schemes & Subsidies
  SCHEMES: `${API_URL}/api/schemes`,
};

// Export default API URL
export default API_URL;

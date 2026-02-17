// ⚠️ CHANGE THIS TO YOUR COMPUTER'S IP ADDRESS
// Windows: Open CMD → type "ipconfig" → look for IPv4 Address
// Mac/Linux: Open Terminal → type "ifconfig" → look for inet address
// Example:  192.168.134.187, 192.168.0.105, etc.

export const API_URL = 'http://172.20.10.8:5000'; // ⚠️ UPDATE THIS!

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  AUTH:  `${API_URL}/api/auth`,
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

  // Market Prices
  MARKET:        `${API_URL}/api/market`,           // existing — for MarketPricesScreen
  MARKET_PRICES: `${API_URL}/api/market/price`,     // ← NEW — for crop card live prices

  // Weather
  WEATHER: `${API_URL}/api/weather`,

  // AI Services
  AI: `${API_URL}/api/ai`,
};

// Export default API URL
export default API_URL;
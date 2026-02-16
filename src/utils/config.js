// API Configuration
export const API_URL = 'http://192.168.1.7:5000'; // ⚠️ CHANGE THIS TO YOUR IP

// Replace with your actual IP:
// Windows: ipconfig
// Mac/Linux: ifconfig
// Look for IPv4 Address

export const API_ENDPOINTS = {
  // Auth
  AUTH: `${API_URL}/api/auth`,
  USERS: `${API_URL}/api/users`,

  // Land Management
  LANDS: `${API_URL}/api/lands`,
  PLOTS: `${API_URL}/api/plots`,

  // Crop Management
  CROPS: `${API_URL}/api/crops`,
  TASKS: `${API_URL}/api/tasks`,
  DISEASES: `${API_URL}/api/diseases`,

  // External Data
  WEATHER: `${API_URL}/api/weather`,
  MARKET: `${API_URL}/api/market`,

  // AI Services
  AI: `${API_URL}/api/ai`,
};

export default API_URL;

import { API_URL } from './config';

// Routed through our own backend (backend/routes/weather.js), which holds
// the OpenWeather API key server-side — the app must never ship a live key
// inside the client bundle.
export const getCurrentWeather = async (latitude, longitude) => {
  try {
    const response = await fetch(
      `${API_URL}/api/weather/current?lat=${latitude}&lng=${longitude}`
    );
    const data = await response.json();

    if (data.success) {
      const { weather } = data;
      return {
        success: true,
        temperature: weather.temperature,
        feelsLike: weather.feelsLike,
        humidity: weather.humidity,
        description: weather.description,
        icon: weather.icon,
        windSpeed: weather.windSpeed,
        city: weather.city,
      };
    }
    return { success: false, message: data.error || 'Weather data not available' };
  } catch (error) {
    console.error('Weather API error:', error);
    return { success: false, message: 'Failed to fetch weather' };
  }
};

export const getWeatherIcon = (iconCode) => {
  return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
};

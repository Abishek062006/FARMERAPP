const WEATHER_API_KEY = '3839a515e92866c4938c656d619d62c8'; // Replace with your key
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

export const getCurrentWeather = async (latitude, longitude) => {
  try {
    const response = await fetch(
      `${BASE_URL}/weather?lat=${latitude}&lon=${longitude}&appid=${WEATHER_API_KEY}&units=metric`
    );
    const data = await response.json();
    
    if (data.cod === 200) {
      return {
        success: true,
        temperature: Math.round(data.main.temp),
        feelsLike: Math.round(data.main.feels_like),
        humidity: data.main.humidity,
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        windSpeed: data.wind.speed,
        city: data.name,
      };
    }
    return { success: false, message: 'Weather data not available' };
  } catch (error) {
    console.error('Weather API error:', error);
    return { success: false, message: 'Failed to fetch weather' };
  }
};

export const getForecast = async (latitude, longitude) => {
  try {
    const response = await fetch(
      `${BASE_URL}/forecast?lat=${latitude}&lon=${longitude}&appid=${WEATHER_API_KEY}&units=metric&cnt=8`
    );
    const data = await response.json();
    
    if (data.cod === '200') {
      return {
        success: true,
        forecast: data.list.map(item => ({
          time: new Date(item.dt * 1000).getHours() + ':00',
          temp: Math.round(item.main.temp),
          description: item.weather[0].description,
          icon: item.weather[0].icon,
        })),
      };
    }
    return { success: false, message: 'Forecast not available' };
  } catch (error) {
    console.error('Forecast API error:', error);
    return { success: false, message: 'Failed to fetch forecast' };
  }
};

export const getWeatherIcon = (iconCode) => {
  return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
};

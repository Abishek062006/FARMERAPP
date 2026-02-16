const axios = require('axios');

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

/**
 * Get current weather for location
 */
const getCurrentWeather = async (lat, lng) => {
  try {
    if (!OPENWEATHER_API_KEY) {
      console.warn('⚠️ OpenWeatherMap API key not configured');
      return null;
    }

    console.log(`🌤️ Fetching current weather for: ${lat}, ${lng}`);

    const response = await axios.get(`${BASE_URL}/weather`, {
      params: {
        lat,
        lon: lng,
        appid: OPENWEATHER_API_KEY,
        units: 'metric' // Celsius
      }
    });

    const data = response.data;

    return {
      temperature: data.main.temp,
      feelsLike: data.main.feels_like,
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      windSpeed: data.wind.speed,
      windDirection: data.wind.deg,
      clouds: data.clouds.all,
      weather: data.weather[0].main,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      sunrise: new Date(data.sys.sunrise * 1000),
      sunset: new Date(data.sys.sunset * 1000),
      visibility: data.visibility,
      location: data.name
    };

  } catch (error) {
    console.error('❌ Error fetching current weather:', error.message);
    return null;
  }
};


/**
 * Get 7-day weather forecast
 */
const get7DayForecast = async (lat, lng) => {
  try {
    if (!OPENWEATHER_API_KEY) {
      console.warn('⚠️ OpenWeatherMap API key not configured');
      return null;
    }

    console.log(`📅 Fetching 7-day forecast for: ${lat}, ${lng}`);

    const response = await axios.get(`${BASE_URL}/forecast`, {
      params: {
        lat,
        lon: lng,
        appid: OPENWEATHER_API_KEY,
        units: 'metric',
        cnt: 56 // 7 days * 8 (3-hour intervals)
      }
    });

    const data = response.data;

    // Group by day
    const dailyForecast = [];
    let currentDay = null;
    let dayData = {
      temps: [],
      humidity: [],
      rain: 0,
      weather: []
    };

    data.list.forEach(item => {
      const date = new Date(item.dt * 1000);
      const day = date.toLocaleDateString();

      if (currentDay !== day) {
        if (currentDay !== null) {
          // Calculate averages for previous day
          dailyForecast.push({
            date: currentDay,
            tempMin: Math.min(...dayData.temps),
            tempMax: Math.max(...dayData.temps),
            tempAvg: (dayData.temps.reduce((a, b) => a + b, 0) / dayData.temps.length).toFixed(1),
            humidity: (dayData.humidity.reduce((a, b) => a + b, 0) / dayData.humidity.length).toFixed(0),
            rainfall: dayData.rain,
            weather: dayData.weather[0] || 'Clear'
          });
        }

        currentDay = day;
        dayData = {
          temps: [],
          humidity: [],
          rain: 0,
          weather: []
        };
      }

      dayData.temps.push(item.main.temp);
      dayData.humidity.push(item.main.humidity);
      dayData.rain += item.rain ? item.rain['3h'] || 0 : 0;
      if (dayData.weather.length === 0) {
        dayData.weather.push(item.weather[0].main);
      }
    });

    return dailyForecast.slice(0, 7); // Return only 7 days

  } catch (error) {
    console.error('❌ Error fetching forecast:', error.message);
    return null;
  }
};


/**
 * Get rainfall prediction
 */
const getRainfallPrediction = async (lat, lng) => {
  try {
    const forecast = await get7DayForecast(lat, lng);
    if (!forecast) return null;

    const totalRainfall = forecast.reduce((sum, day) => sum + day.rainfall, 0);
    const rainyDays = forecast.filter(day => day.rainfall > 0).length;

    return {
      totalRainfall: totalRainfall.toFixed(2),
      rainyDays,
      forecast: forecast.map(day => ({
        date: day.date,
        rainfall: day.rainfall
      }))
    };

  } catch (error) {
    console.error('❌ Error getting rainfall prediction:', error.message);
    return null;
  }
};


module.exports = {
  getCurrentWeather,
  get7DayForecast,
  getRainfallPrediction
};

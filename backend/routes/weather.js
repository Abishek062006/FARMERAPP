const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * GET /api/weather/current
 * Get current weather for location
 */
router.get('/current', async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude required'
      });
    }

    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
      console.error('❌ OPENWEATHER_API_KEY not set in .env');
      return res.status(500).json({
        success: false,
        error: 'Weather API not configured'
      });
    }

    console.log('🌦️ Fetching weather for:', lat, lng);

    const response = await axios.get(
      `http://api.openweathermap.org/data/2.5/weather`,
      {
        params: {
          lat: parseFloat(lat),
          lon: parseFloat(lng),
          appid: apiKey,
          units: 'metric'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    const data = response.data;

    const weather = {
      temperature: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      tempMin: Math.round(data.main.temp_min),
      tempMax: Math.round(data.main.temp_max),
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      description: data.weather[0].description,
      main: data.weather[0].main,
      icon: data.weather[0].icon,
      windSpeed: data.wind.speed,
      windDeg: data.wind.deg,
      clouds: data.clouds.all,
      city: data.name,
      country: data.sys.country,
      sunrise: new Date(data.sys.sunrise * 1000).toISOString(),
      sunset: new Date(data.sys.sunset * 1000).toISOString(),
      timestamp: new Date().toISOString()
    };

    console.log('✅ Weather fetched successfully');

    res.json({
      success: true,
      weather
    });

  } catch (error) {
    console.error('❌ Weather API error:', error.message);
    
    if (error.response) {
      console.error('❌ Response status:', error.response.status);
      console.error('❌ Response data:', error.response.data);
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch weather data',
      message: error.message
    });
  }
});

/**
 * GET /api/weather/forecast
 * Get 5-day weather forecast
 */
router.get('/forecast', async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude required'
      });
    }

    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Weather API not configured'
      });
    }

    console.log('🌦️ Fetching forecast for:', lat, lng);

    const response = await axios.get(
      `http://api.openweathermap.org/data/2.5/forecast`,
      {
        params: {
          lat: parseFloat(lat),
          lon: parseFloat(lng),
          appid: apiKey,
          units: 'metric'
        },
        timeout: 10000
      }
    );

    const data = response.data;

    // Group by day
    const dailyForecasts = {};
    data.list.forEach(item => {
      const date = item.dt_txt.split(' ')[0];
      if (!dailyForecasts[date]) {
        dailyForecasts[date] = {
          date,
          temp: [],
          humidity: [],
          weather: item.weather[0],
          wind: item.wind
        };
      }
      dailyForecasts[date].temp.push(item.main.temp);
      dailyForecasts[date].humidity.push(item.main.humidity);
    });

    // Calculate averages
    const forecast = Object.values(dailyForecasts).map(day => ({
      date: day.date,
      tempAvg: Math.round(day.temp.reduce((a, b) => a + b) / day.temp.length),
      tempMin: Math.round(Math.min(...day.temp)),
      tempMax: Math.round(Math.max(...day.temp)),
      humidity: Math.round(day.humidity.reduce((a, b) => a + b) / day.humidity.length),
      description: day.weather.description,
      icon: day.weather.icon,
      windSpeed: day.wind.speed
    }));

    console.log('✅ Forecast fetched successfully');

    res.json({
      success: true,
      forecast: forecast.slice(0, 5) // Next 5 days
    });

  } catch (error) {
    console.error('❌ Forecast API error:', error.message);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch forecast data',
      message: error.message
    });
  }
});

module.exports = router;

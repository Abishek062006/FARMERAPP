import * as Location from 'expo-location';

export const getCurrentLocation = async () => {
  try {
    // Request permission
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission denied');
    }

    // Get current position
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    // Reverse geocode to get address
    const address = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      city: address[0]?.city || address[0]?.subregion || 'Chennai',
      district: address[0]?.district || address[0]?.subregion || 'Chennai',
      state: address[0]?.region || 'Tamil Nadu',
      country: address[0]?.country || 'India',
    };
  } catch (error) {
    console.error('Location error:', error);
    throw error;
  }
};

export const getCurrentSeason = () => {
  const month = new Date().getMonth() + 1; // 1-12
  
  // Tamil Nadu seasons
  if (month >= 1 && month <= 5) {
    return { 
      name: 'Summer', 
      tamil: 'கோடை காலம்', 
      icon: '☀️',
      value: 'summer'
    };
  } else if (month >= 6 && month <= 9) {
    return { 
      name: 'Monsoon', 
      tamil: 'மழைக்காலம்', 
      icon: '🌧️',
      value: 'monsoon'
    };
  } else {
    return { 
      name: 'Winter', 
      tamil: 'குளிர்காலம்', 
      icon: '🍂',
      value: 'winter'
    };
  }
};

export const soilTypes = [
  { value: 'red', label: 'Red Soil', tamil: 'சிவப்பு மண்' },
  { value: 'black', label: 'Black Soil', tamil: 'கருப்பு மண்' },
  { value: 'clay', label: 'Clay Soil', tamil: 'களிமண்' },
  { value: 'sandy', label: 'Sandy Soil', tamil: 'மணல் மண்' },
  { value: 'loamy', label: 'Loamy Soil', tamil: 'வண்டல் மண்' },
  { value: 'alluvial', label: 'Alluvial Soil', tamil: 'வண்டல் படிவு மண்' },
];

export const waterSources = [
  { value: 'borewell', label: 'Borewell', tamil: 'ஆழ்துளை கிணறு' },
  { value: 'well', label: 'Well', tamil: 'கிணறு' },
  { value: 'canal', label: 'Canal', tamil: 'கால்வாய்' },
  { value: 'river', label: 'River', tamil: 'ஆறு' },
  { value: 'rainwater', label: 'Rainwater', tamil: 'மழை நீர்' },
  { value: 'tank', label: 'Tank/Pond', tamil: 'குளம்' },
];

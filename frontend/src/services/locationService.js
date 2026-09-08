import { matchDistrict, DEFAULT_STATE } from '../utils/districts';
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
        city: address[0]?.city || address[0]?.subregion || null,
        // matchDistrict returns null rather than a guess when the geocoder
        // hands back a neighbourhood name, which it often does. Never fall
        // back to a literal district — that is how every existing user ended
        // up stored as "Chennai".
        district:
          matchDistrict(address[0]?.district) ||
          matchDistrict(address[0]?.subregion) ||
          matchDistrict(address[0]?.city) ||
          null,
        state: address[0]?.region || DEFAULT_STATE,
        country: address[0]?.country || 'India',
      };
    } catch (error) {
      console.error('Location error:', error);
      throw error;
    }
  };

  export const getCurrentSeason = () => {
    const month = new Date().getMonth() + 1; // 1-12

    // Maharashtra seasons. These are the agricultural seasons the crop tables
    // key on (agroZones.js uses Monsoon = Kharif, Winter = Rabi, Summer), not
    // calendar seasons.
    if (month >= 3 && month <= 5) {
      return {
        name: 'Summer',
        localKey: 'season.summer',
        icon: '☀️',
        value: 'summer'
      };
    } else if (month >= 6 && month <= 10) {
      return {
        name: 'Monsoon',
        localKey: 'season.monsoon',
        icon: '🌧️',
        value: 'monsoon'
      };
    } else {
      return {
        name: 'Winter',
        localKey: 'season.winter',
        icon: '🍂',
        value: 'winter'
      };
    }
  };

  // Labels are keys into i18n/strings.js rather than inline text, so adding a
  // language does not mean editing this file. `value` matches Land's enums.
  export const soilTypes = [
    { value: 'red', label: 'Red Soil', localKey: 'soil.red' },
    { value: 'black', label: 'Black Soil', localKey: 'soil.black' },
    { value: 'clay', label: 'Clay Soil', localKey: 'soil.clay' },
    { value: 'sandy', label: 'Sandy Soil', localKey: 'soil.sandy' },
    { value: 'loamy', label: 'Loamy Soil', localKey: 'soil.loamy' },
    { value: 'alluvial', label: 'Alluvial Soil', localKey: 'soil.alluvial' },
    { value: 'laterite', label: 'Laterite Soil', localKey: 'soil.laterite' },
  ];

  export const waterSources = [
    { value: 'borewell', label: 'Borewell', localKey: 'water.borewell' },
    { value: 'well', label: 'Well', localKey: 'water.well' },
    { value: 'canal', label: 'Canal', localKey: 'water.canal' },
    { value: 'river', label: 'River', localKey: 'water.river' },
    { value: 'rainwater', label: 'Rainwater', localKey: 'water.rainwater' },
    { value: 'tank', label: 'Tank', localKey: 'water.tank' },
    { value: 'pond', label: 'Pond', localKey: 'water.pond' },
  ];

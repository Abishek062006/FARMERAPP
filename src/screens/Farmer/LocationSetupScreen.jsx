import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import {
  getCurrentLocation,
  getCurrentSeason,
  soilTypes,
  waterSources,
} from '../../services/locationService';

export default function LocationSetupScreen({ navigation, route }) {
  const { userData } = route.params || {}; // ✅ GET USERDATA
  
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState(null);
  const [season, setSeason] = useState(null);
  const [selectedSoil, setSelectedSoil] = useState('');
  const [selectedWater, setSelectedWater] = useState('');

  useEffect(() => {
    detectLocation();
  }, []);

  const detectLocation = async () => {
    try {
      setLoading(true);
      const loc = await getCurrentLocation();
      const currentSeason = getCurrentSeason();
      
      setLocation(loc);
      setSeason(currentSeason);
    } catch (error) {
      Alert.alert(
        'Location Error', 
        'Failed to detect location. Using default: Chennai',
        [{ text: 'OK' }]
      );
      setLocation({
        city: 'Chennai',
        district: 'Chennai',
        state: 'Tamil Nadu',
        country: 'India'
      });
      setSeason(getCurrentSeason());
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (!selectedSoil || !selectedWater) {
      Alert.alert('Required', 'Please select soil type and water source');
      return;
    }

    // Navigate to Crop Recommendation Screen with data
    navigation.navigate('CropRecommendation', {
      location,
      season,
      soilType: selectedSoil,
      waterSource: selectedWater,
      userData, // ✅ PASS USERDATA
    });
  };

  // Get selected soil label
  const getSelectedSoilLabel = () => {
    const soil = soilTypes.find(s => s.value === selectedSoil);
    return soil ? `${soil.label} (${soil.tamil})` : 'Select Soil Type';
  };

  // Get selected water label
  const getSelectedWaterLabel = () => {
    const water = waterSources.find(w => w.value === selectedWater);
    return water ? `${water.label} (${water.tamil})` : 'Select Water Source';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Detecting your location...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🌱 Let's Get Started!</Text>
        <Text style={styles.headerSubtitle}>
          Tell us about your location and soil to get personalized crop recommendations
        </Text>
      </View>

      {/* Location Section */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="location" size={24} color="#4CAF50" />
          <Text style={styles.cardTitle}>Your Location</Text>
        </View>
        
        {location && (
          <>
            <Text style={styles.locationText}>
              📍 {location.city}, {location.district}
            </Text>
            <Text style={styles.locationSubtext}>
              {location.state}, {location.country}
            </Text>
            
            <TouchableOpacity 
              style={styles.refreshButton} 
              onPress={detectLocation}
            >
              <Ionicons name="refresh" size={16} color="#4CAF50" />
              <Text style={styles.refreshButtonText}>Refresh Location</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Season Section */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.seasonIcon}>{season?.icon}</Text>
          <Text style={styles.cardTitle}>Current Season</Text>
        </View>
        
        <Text style={styles.seasonText}>{season?.name}</Text>
        <Text style={styles.seasonTamil}>{season?.tamil}</Text>
      </View>

      {/* Soil Type Selection */}
      <View style={styles.card}>
        <Text style={styles.label}>
          Select Soil Type <Text style={styles.required}>*</Text>
        </Text>
        
        <View style={styles.customPickerContainer}>
          <Picker
            selectedValue={selectedSoil}
            onValueChange={(value) => setSelectedSoil(value)}
            style={styles.picker}
            dropdownIconColor="#4CAF50"
            mode="dropdown"
          >
            <Picker.Item 
              label="-- Select Soil Type --" 
              value="" 
              color="#999"
            />
            {soilTypes.map((soil) => (
              <Picker.Item
                key={soil.value}
                label={`${soil.label} (${soil.tamil})`}
                value={soil.value}
                color="#333"
              />
            ))}
          </Picker>
        </View>
        
        {selectedSoil && (
          <View style={styles.selectedValueContainer}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.selectedValueText}>
              {getSelectedSoilLabel()}
            </Text>
          </View>
        )}
      </View>

      {/* Water Source Selection */}
      <View style={styles.card}>
        <Text style={styles.label}>
          Select Water Source <Text style={styles.required}>*</Text>
        </Text>
        
        <View style={styles.customPickerContainer}>
          <Picker
            selectedValue={selectedWater}
            onValueChange={(value) => setSelectedWater(value)}
            style={styles.picker}
            dropdownIconColor="#4CAF50"
            mode="dropdown"
          >
            <Picker.Item 
              label="-- Select Water Source --" 
              value="" 
              color="#999"
            />
            {waterSources.map((water) => (
              <Picker.Item
                key={water.value}
                label={`${water.label} (${water.tamil})`}
                value={water.value}
                color="#333"
              />
            ))}
          </Picker>
        </View>
        
        {selectedWater && (
          <View style={styles.selectedValueContainer}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.selectedValueText}>
              {getSelectedWaterLabel()}
            </Text>
          </View>
        )}
      </View>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={20} color="#2196F3" />
        <Text style={styles.infoText}>
          We'll use this information to recommend the best crops for your farm
        </Text>
      </View>

      {/* Continue Button */}
      <TouchableOpacity
        style={[
          styles.continueButton, 
          (!selectedSoil || !selectedWater) && styles.disabledButton
        ]}
        onPress={handleContinue}
        disabled={!selectedSoil || !selectedWater}
      >
        <Text style={styles.continueButtonText}>
          Get Crop Recommendations 🌱
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#333',
  },
  locationText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  locationSubtext: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#4CAF50',
    fontWeight: '600',
    marginLeft: 6,
  },
  seasonIcon: {
    fontSize: 24,
  },
  seasonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  seasonTamil: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#F44336',
  },
  customPickerContainer: {
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    color: '#333',
  },
  selectedValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  selectedValueText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
    flex: 1,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1976D2',
    marginLeft: 8,
    lineHeight: 18,
  },
  continueButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

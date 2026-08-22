import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import LocationMapPicker from '../../components/LocationMapPicker';
import ChipSelect from '../../components/ChipSelect';
import SearchSelectSheet from '../../components/SearchSelectSheet';
import { TN_DISTRICTS, matchTnDistrict } from '../../utils/tnDistricts';

export default function LandRegistrationScreen({ navigation, route }) {
  const { userData } = route.params || {};

  // Form state
  const [loading, setLoading] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);

  // Land details
  const [landName, setLandName] = useState('');
  const [location, setLocation] = useState({
    coordinates: { lat: 0, lng: 0 },
    city: '',
    district: '',
    state: 'Tamil Nadu',
    pincode: '',
    address: '',
  });

  const [size, setSize] = useState({ value: '', unit: 'acres' });
  const [waterSource, setWaterSource] = useState('borewell');
  const [soilType, setSoilType] = useState('red');
  const [notes, setNotes] = useState('');

  // Options
  const sizeUnits = [
    { label: 'Acres', value: 'acres' },
    { label: 'Hectares', value: 'hectares' },
    { label: 'Sq. Ft.', value: 'sqft' },
    { label: 'Sq. M.', value: 'sqm' },
  ];
  
  const waterSources = [
    { label: 'Borewell (போர்வெல்)', value: 'borewell' },
    { label: 'Canal (கால்வாய்)', value: 'canal' },
    { label: 'Rainwater (மழைநீர்)', value: 'rainwater' },
    { label: 'Drip Irrigation (சொட்டுநீர்)', value: 'drip' },
    { label: 'Sprinkler (தெளிப்பான்)', value: 'sprinkler' },
    { label: 'River (ஆறு)', value: 'river' },
    { label: 'Well (கிணறு)', value: 'well' },
    { label: 'Pond (குளம்)', value: 'pond' },
    { label: 'Tank (தொட்டி)', value: 'tank' },
    { label: 'None (இல்லை)', value: 'none' },
  ];

  const soilTypes = [
    { label: 'Red Soil (சிவப்பு மண்)', value: 'red' },
    { label: 'Black Soil (கருப்பு மண்)', value: 'black' },
    { label: 'Alluvial Soil (வண்டல் மண்)', value: 'alluvial' },
    { label: 'Clay Soil (களிமண்)', value: 'clay' },
    { label: 'Loamy Soil (வண்டல் களிமண்)', value: 'loamy' },
    { label: 'Sandy Soil (மணல் மண்)', value: 'sandy' },
    { label: 'Laterite Soil (லேட்டரைட் மண்)', value: 'laterite' },
  ];

  // Fetch GPS location
  const fetchCurrentLocation = async () => {
    try {
      setFetchingLocation(true);

      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required');
        setFetchingLocation(false);
        return;
      }

      // Get location
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = currentLocation.coords;

      // Reverse geocode
      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (reverseGeocode.length > 0) {
        const place = reverseGeocode[0];

        // The device's native geocoder isn't guaranteed to return
        // administrative-level granularity for `district` — it can come
        // back as a neighborhood/residential-layout name instead. Try each
        // candidate field against the real TN district list and only keep
        // one that actually matches; never save an unvalidated guess.
        const districtMatch =
          matchTnDistrict(place.district) ||
          matchTnDistrict(place.subregion) ||
          matchTnDistrict(place.city) ||
          '';

        setLocation({
          coordinates: { lat: latitude, lng: longitude },
          city: place.city || place.subregion || '',
          district: districtMatch,
          state: place.region || 'Tamil Nadu',
          pincode: place.postalCode || '',
          address: `${place.street || ''} ${place.name || ''}`.trim(),
        });

        Alert.alert(
          'Success',
          districtMatch
            ? 'Location detected successfully!'
            : "Location detected, but we couldn't confirm your district automatically — please select it below."
        );
      }

      setFetchingLocation(false);
    } catch (error) {
      console.error('Location error:', error);
      Alert.alert('Error', 'Failed to get location. Please enter manually.');
      setFetchingLocation(false);
    }
  };

  // Validate and submit
  const handleSubmit = async () => {
    // Validate
    if (!landName.trim()) {
      Alert.alert('Required', 'Please enter land name');
      return;
    }

    if (!location.city || !location.district) {
      Alert.alert('Required', 'Please provide location details');
      return;
    }

    if (!size.value || parseFloat(size.value) <= 0) {
      Alert.alert('Required', 'Please enter valid land size');
      return;
    }

    try {
      setLoading(true);

      const landData = {
        firebaseUid: userData.firebaseUid || userData.uid,
        landName: landName.trim(),
        location,
        size: {
          value: parseFloat(size.value),
          unit: size.unit,
        },
        waterSource,
        soilType,
        notes: notes.trim(),
      };

      console.log('📤 Registering land:', landData);

      const response = await axios.post(API_ENDPOINTS.LANDS, landData);

      if (response.data.success) {
        Alert.alert(
          'Success! 🎉',
          'Land registered successfully!',
          [
            {
              text: 'Start Farming',
              onPress: () => {
                // Navigate to crop recommendation
                navigation.navigate('CropRecommendation', {
                  landId: response.data.land._id,
                  land: response.data.land,
                  userData,
                });
              },
            },
            {
              text: 'View Dashboard',
              onPress: () => navigation.navigate('Dashboard'),
            },
          ]
        );
      }
    } catch (error) {
      console.error('❌ Error registering land:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to register land');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="leaf" size={50} color="#4CAF50" />
          <Text style={styles.headerTitle}>Register Your Land</Text>
          <Text style={styles.headerSubtitle}>
            Let's get started with your farming journey
          </Text>
        </View>

        {/* Land Name */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>
            Land Name <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., North Field, Terrace Garden"
            value={landName}
            onChangeText={setLandName}
          />
        </View>

        {/* Location Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="location" size={24} color="#4CAF50" />
            <Text style={styles.sectionTitle}>Location</Text>
          </View>

          <View style={styles.locationButtonRow}>
            <TouchableOpacity
              style={[styles.gpsButton, styles.locationButtonHalf]}
              onPress={fetchCurrentLocation}
              disabled={fetchingLocation}
            >
              {fetchingLocation ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="navigate" size={20} color="#fff" />
                  <Text style={styles.gpsButtonText}>Detect GPS Location</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.mapButton, styles.locationButtonHalf]}
              onPress={() => setMapPickerVisible(true)}
            >
              <Ionicons name="map" size={20} color="#fff" />
              <Text style={styles.gpsButtonText}>Pick on Map</Text>
            </TouchableOpacity>
          </View>

          {location.coordinates.lat !== 0 && (
            <Text style={styles.coordinatesHint}>
              📍 {location.coordinates.lat.toFixed(5)}, {location.coordinates.lng.toFixed(5)}
            </Text>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>City <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Chennai"
              value={location.city}
              onChangeText={(text) => setLocation({ ...location, city: text })}
            />
          </View>

          <SearchSelectSheet
            label="District"
            required
            title="Select District"
            options={TN_DISTRICTS.map((d) => ({ label: d, value: d }))}
            value={location.district}
            onChange={(value) => setLocation({ ...location, district: value })}
            placeholder="Select your district"
          />

          <View style={styles.formGroup}>
            <Text style={styles.label}>Pincode</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 600001"
              keyboardType="numeric"
              value={location.pincode}
              onChangeText={(text) => setLocation({ ...location, pincode: text })}
            />
          </View>
        </View>

        {/* Land Size */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="resize" size={24} color="#4CAF50" />
            <Text style={styles.sectionTitle}>Land Size</Text>
          </View>

          <View style={styles.row}>
            <View style={[styles.formGroup, { flex: 2 }]}>
              <Text style={styles.label}>Size <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 2.5"
                keyboardType="decimal-pad"
                value={size.value}
                onChangeText={(text) => setSize({ ...size, value: text })}
              />
            </View>

            <View style={[styles.formGroup, { flex: 1, marginLeft: 12 }]}>
              <Text style={styles.label}>Unit</Text>
              <ChipSelect
                options={sizeUnits}
                value={size.unit}
                onChange={(value) => setSize({ ...size, unit: value })}
              />
            </View>
          </View>
        </View>

        {/* Water Source */}
        <ChipSelect
          label="Water Source"
          required
          options={waterSources}
          value={waterSource}
          onChange={setWaterSource}
        />

        {/* Soil Type */}
        <ChipSelect
          label="Soil Type"
          required
          options={soilTypes}
          value={soilType}
          onChange={setSoilType}
        />

        {/* Notes */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Additional Notes (Optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Any additional information about your land..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={styles.submitButtonText}>Register Land</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </View>

      <LocationMapPicker
        visible={mapPickerVisible}
        onClose={() => setMapPickerVisible(false)}
        onConfirm={(picked) => {
          setLocation(picked);
          setMapPickerVisible(false);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  formGroup: {
    marginBottom: 16,
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
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  locationButtonRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  locationButtonHalf: {
    flex: 1,
  },
  gpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    padding: 14,
    borderRadius: 8,
    marginRight: 6,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 8,
    marginLeft: 6,
  },
  gpsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  coordinatesHint: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});

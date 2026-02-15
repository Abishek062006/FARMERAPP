import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import axios from 'axios';

const API_URL = 'http://192.168.1.7:5000'; // Change to your IP

export default function CropRegistrationScreen({ navigation, route }) {
  const { selectedCrops, userData } = route.params || {};
  
  const [loading, setLoading] = useState(false);
  const [currentCropIndex, setCurrentCropIndex] = useState(0);
  
  // Form fields
  const [plantingDate, setPlantingDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('plants');
  const [variety, setVariety] = useState('');
  const [containerType, setContainerType] = useState('pot');
  const [containerSize, setContainerSize] = useState('10L');
  const [location, setLocation] = useState('terrace');
  const [notes, setNotes] = useState('');

  const currentCrop = selectedCrops ? selectedCrops[currentCropIndex] : null;

  // ✅ DEBUG: Log userData on mount
  useEffect(() => {
    console.log('🔍 CropRegistration - userData:', userData);
    console.log('🔍 firebaseUid:', userData?.firebaseUid);
    console.log('🔍 uid:', userData?.uid); // ✅ CHECK BOTH
    
    // ✅ Check for both firebaseUid and uid
    const userFirebaseUid = userData?.firebaseUid || userData?.uid;
    
    if (!userData || !userFirebaseUid) {
      Alert.alert('Error', 'User data not found. Please login again.');
      navigation.navigate('Dashboard');
    }
  }, []);

  const containerTypes = [
    { value: 'pot', label: 'Pot (தொட்டி)' },
    { value: 'grow-bag', label: 'Grow Bag (வளர்ப்பு பை)' },
    { value: 'tray', label: 'Tray (தட்டு)' },
    { value: 'raised-bed', label: 'Raised Bed (உயர்த்தப்பட்ட படுக்கை)' },
  ];

  const containerSizes = ['5L', '10L', '15L', '20L', '25L', '30L', '50L'];

  const locations = [
    { value: 'balcony', label: 'Balcony (பால்கனி)' },
    { value: 'terrace', label: 'Terrace (மொட்டை மாடி)' },
    { value: 'rooftop', label: 'Rooftop (கூரை மேல்)' },
    { value: 'window', label: 'Window (ஜன்னல்)' },
    { value: 'indoor', label: 'Indoor (உள்ளே)' },
    { value: 'outdoor', label: 'Outdoor (வெளியே)' },
  ];

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setPlantingDate(selectedDate);
    }
  };

  const handleRegister = async () => {
    // Validate
    if (!quantity || quantity <= 0) {
      Alert.alert('Required', 'Please enter quantity');
      return;
    }

    // ✅ CHECK FIREBASE UID - Support both firebaseUid and uid
    const userFirebaseUid = userData?.firebaseUid || userData?.uid;
    
    if (!userFirebaseUid) {
      Alert.alert('Error', 'User authentication error. Please login again.');
      return;
    }

    try {
      setLoading(true);

      const cropData = {
        firebaseUid: userFirebaseUid, // ✅ USE EITHER FIELD
        name: currentCrop.name,
        tamilName: currentCrop.tamilName,
        variety: variety || 'Standard',
        plantingDate: plantingDate.toISOString().split('T')[0],
        quantity: parseInt(quantity),
        unit,
        containerType,
        containerSize,
        location,
        notes,
      };

      console.log('📤 Registering crop:', cropData);

      const response = await axios.post(`${API_URL}/api/crops`, cropData);

      if (response.data.success) {
        console.log('✅ Crop registered:', response.data.crop._id);

        // Check if there are more crops to register
        if (currentCropIndex < selectedCrops.length - 1) {
          Alert.alert(
            'Success!',
            `${currentCrop.name} registered! Register next crop?`,
            [
              {
                text: 'Skip',
                onPress: () => navigation.navigate('Dashboard'),
              },
              {
                text: 'Next Crop',
                onPress: () => {
                  setCurrentCropIndex(currentCropIndex + 1);
                  // Reset form
                  setQuantity('');
                  setVariety('');
                  setNotes('');
                  setPlantingDate(new Date());
                },
              },
            ]
          );
        } else {
          // All crops registered
          Alert.alert(
            'All Done! 🎉',
            `Successfully registered ${selectedCrops.length} crop(s)!`,
            [
              {
                text: 'Go to Dashboard',
                onPress: () => navigation.navigate('Dashboard'),
              },
            ]
          );
        }
      }
    } catch (error) {
      console.error('❌ Error registering crop:', error);
      console.error('❌ Error response:', error.response?.data);
      Alert.alert(
        'Error', 
        error.response?.data?.message || 'Failed to register crop. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!currentCrop) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No crop selected</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.navigate('Dashboard')}
        >
          <Text style={styles.backButtonText}>Go to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Register Crop</Text>
        <Text style={styles.headerSubtitle}>
          {currentCropIndex + 1} of {selectedCrops.length}
        </Text>
      </View>

      {/* Crop Info Card */}
      <View style={styles.cropCard}>
        <View style={styles.cropIconContainer}>
          <Text style={styles.cropIcon}>🌾</Text>
        </View>
        <View style={styles.cropInfo}>
          <Text style={styles.cropName}>{currentCrop.name}</Text>
          <Text style={styles.cropTamilName}>{currentCrop.tamilName}</Text>
          <Text style={styles.cropDuration}>
            Duration: {currentCrop.duration} days
          </Text>
        </View>
      </View>

      {/* Form */}
      <View style={styles.form}>
        {/* Planting Date */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>
            Planting Date <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar" size={20} color="#4CAF50" />
            <Text style={styles.dateText}>
              {plantingDate.toLocaleDateString('en-IN')}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={plantingDate}
              mode="date"
              display="default"
              onChange={handleDateChange}
              maximumDate={new Date()}
            />
          )}
        </View>

        {/* Quantity */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>
            Number of Plants <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 10"
            keyboardType="numeric"
            value={quantity}
            onChangeText={setQuantity}
          />
        </View>

        {/* Variety */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Variety (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Hybrid, Organic"
            value={variety}
            onChangeText={setVariety}
          />
        </View>

        {/* Container Type */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Container Type</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={containerType}
              onValueChange={setContainerType}
              style={styles.picker}
            >
              {containerTypes.map((type) => (
                <Picker.Item
                  key={type.value}
                  label={type.label}
                  value={type.value}
                />
              ))}
            </Picker>
          </View>
        </View>

        {/* Container Size */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Container Size</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={containerSize}
              onValueChange={setContainerSize}
              style={styles.picker}
            >
              {containerSizes.map((size) => (
                <Picker.Item key={size} label={size} value={size} />
              ))}
            </Picker>
          </View>
        </View>

        {/* Location */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Location</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={location}
              onValueChange={setLocation}
              style={styles.picker}
            >
              {locations.map((loc) => (
                <Picker.Item
                  key={loc.value}
                  label={loc.label}
                  value={loc.value}
                />
              ))}
            </Picker>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Notes (Optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Any additional notes..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />
        </View>
      </View>

      {/* Register Button */}
      <TouchableOpacity
        style={[styles.registerButton, loading && styles.registerButtonDisabled]}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.registerButtonText}>
            Register {currentCrop.name} 🌱
          </Text>
        )}
      </TouchableOpacity>

      {/* Skip Button */}
      {selectedCrops.length > 1 && (
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => navigation.navigate('Dashboard')}
        >
          <Text style={styles.skipButtonText}>Skip Remaining Crops</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  cropCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cropIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cropIcon: {
    fontSize: 32,
  },
  cropInfo: {
    flex: 1,
  },
  cropName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  cropTamilName: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  cropDuration: {
    fontSize: 14,
    color: '#4CAF50',
    marginTop: 4,
  },
  form: {
    padding: 16,
  },
  formGroup: {
    marginBottom: 20,
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
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
  },
  dateText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  registerButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
  },
  registerButtonDisabled: {
    backgroundColor: '#ccc',
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  skipButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  skipButtonText: {
    color: '#666',
    fontSize: 16,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginTop: 50,
  },
  backButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 20,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

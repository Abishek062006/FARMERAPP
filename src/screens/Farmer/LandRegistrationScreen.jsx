import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { createLand } from '../../utils/landAPI';
import * as Location from 'expo-location';
import { COLORS } from '../../constants/colors';

const LandSchema = Yup.object().shape({
  name: Yup.string().min(2, 'Too Short!').required('Land name is required'),
  sizeValue: Yup.number().min(0.01, 'Size must be greater than 0').required('Size is required'),
  sizeUnit: Yup.string().required('Unit is required'),
  soilType: Yup.string().required('Soil type is required'),
});

const LandRegistrationScreen = ({ navigation, route }) => {
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);

  const userData = route.params?.userData;

  // Get current location
  const getCurrentLocation = async () => {
    try {
      setGettingLocation(true);
      console.log('📍 Getting current location...');

      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required');
        return null;
      }

      const location = await Location.getCurrentPositionAsync({});
      
      console.log('✅ Location obtained:', location.coords);
      
      setCurrentLocation({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });

      Alert.alert('Success', 'Location captured successfully!');
      
      return {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      };

    } catch (error) {
      console.error('❌ Location error:', error);
      Alert.alert('Error', 'Failed to get location');
      return null;
    } finally {
      setGettingLocation(false);
    }
  };

  const handleSubmit = async (values) => {
    setLoading(true);

    try {
      console.log('📝 Submitting land registration...');

      // Prepare land data
      const landData = {
        firebaseUid: userData.uid,
        name: values.name,
        size: {
          value: parseFloat(values.sizeValue),
          unit: values.sizeUnit,
        },
        location: {
          coordinates: currentLocation || {},
          address: values.address || '',
          city: values.city || userData.location?.city || 'Chennai',
          district: values.district || userData.location?.district || 'Chennai',
          pincode: values.pincode || '',
        },
        soilType: values.soilType,
        waterSource: values.waterSource || null,
        notes: values.notes || '',
      };

      console.log('Land data:', landData);

      // Call API
      const result = await createLand(landData);

      if (result.success) {
        console.log('✅ Land registered successfully');
        
        Alert.alert(
          'Success! 🎉',
          'Land registered successfully!',
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.goBack();
              },
            },
          ]
        );
      } else {
        console.error('❌ Land registration failed:', result.error);
        Alert.alert('Error', result.error || 'Failed to register land');
      }

    } catch (error) {
      console.error('❌ Submit error:', error);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <View style={styles.container}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Register Land</Text>
          <Text style={styles.headerSubtitle}>Add your farming land details</Text>
        </View>

        {/* Form */}
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <Formik
            initialValues={{
              name: '',
              sizeValue: '',
              sizeUnit: 'acres',
              address: '',
              city: userData?.location?.city || 'Chennai',
              district: userData?.location?.district || 'Chennai',
              pincode: '',
              soilType: 'loam',
              waterSource: 'borewell',
              notes: '',
            }}
            validationSchema={LandSchema}
            onSubmit={handleSubmit}
          >
            {({ handleChange, handleBlur, handleSubmit, values, errors, touched, setFieldValue }) => (
              <View style={styles.form}>
                
                {/* Land Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Land Name *</Text>
                  <TextInput
                    style={[styles.input, touched.name && errors.name && styles.inputError]}
                    placeholder="e.g., North Field, Terrace Garden"
                    placeholderTextColor={COLORS.textLight}
                    onChangeText={handleChange('name')}
                    onBlur={handleBlur('name')}
                    value={values.name}
                  />
                  {touched.name && errors.name && (
                    <Text style={styles.errorText}>{errors.name}</Text>
                  )}
                </View>

                {/* Land Size */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Land Size *</Text>
                  <View style={styles.rowInputs}>
                    <TextInput
                      style={[styles.input, styles.sizeInput, touched.sizeValue && errors.sizeValue && styles.inputError]}
                      placeholder="Enter size"
                      placeholderTextColor={COLORS.textLight}
                      onChangeText={handleChange('sizeValue')}
                      onBlur={handleBlur('sizeValue')}
                      value={values.sizeValue}
                      keyboardType="decimal-pad"
                    />
                    <View style={styles.unitPicker}>
                      {['acres', 'cents', 'sqft', 'hectares'].map((unit) => (
                        <TouchableOpacity
                          key={unit}
                          style={[
                            styles.unitButton,
                            values.sizeUnit === unit && styles.unitButtonSelected,
                          ]}
                          onPress={() => setFieldValue('sizeUnit', unit)}
                        >
                          <Text
                            style={[
                              styles.unitButtonText,
                              values.sizeUnit === unit && styles.unitButtonTextSelected,
                            ]}
                          >
                            {unit}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  {touched.sizeValue && errors.sizeValue && (
                    <Text style={styles.errorText}>{errors.sizeValue}</Text>
                  )}
                </View>

                {/* Location */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Location</Text>
                  <TouchableOpacity
                    style={styles.locationButton}
                    onPress={getCurrentLocation}
                    disabled={gettingLocation}
                  >
                    {gettingLocation ? (
                      <ActivityIndicator color={COLORS.primary} />
                    ) : (
                      <>
                        <Text style={styles.locationButtonIcon}>📍</Text>
                        <Text style={styles.locationButtonText}>
                          {currentLocation ? '✅ Location Captured' : 'Get Current Location'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {currentLocation && (
                    <Text style={styles.locationInfo}>
                      Lat: {currentLocation.lat.toFixed(6)}, Lng: {currentLocation.lng.toFixed(6)}
                    </Text>
                  )}
                </View>

                {/* Address */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Street, Village, etc."
                    placeholderTextColor={COLORS.textLight}
                    onChangeText={handleChange('address')}
                    onBlur={handleBlur('address')}
                    value={values.address}
                    multiline
                  />
                </View>

                {/* City & District */}
                <View style={styles.rowInputs}>
                  <View style={[styles.inputGroup, styles.halfWidth]}>
                    <Text style={styles.label}>City</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="City"
                      placeholderTextColor={COLORS.textLight}
                      onChangeText={handleChange('city')}
                      onBlur={handleBlur('city')}
                      value={values.city}
                    />
                  </View>

                  <View style={[styles.inputGroup, styles.halfWidth]}>
                    <Text style={styles.label}>District</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="District"
                      placeholderTextColor={COLORS.textLight}
                      onChangeText={handleChange('district')}
                      onBlur={handleBlur('district')}
                      value={values.district}
                    />
                  </View>
                </View>

                {/* Soil Type */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Soil Type *</Text>
                  <View style={styles.chipContainer}>
                    {['clay', 'loam', 'sandy', 'red', 'black', 'alluvial'].map((soil) => (
                      <TouchableOpacity
                        key={soil}
                        style={[
                          styles.chip,
                          values.soilType === soil && styles.chipSelected,
                        ]}
                        onPress={() => setFieldValue('soilType', soil)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            values.soilType === soil && styles.chipTextSelected,
                          ]}
                        >
                          {soil.charAt(0).toUpperCase() + soil.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Water Source */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Water Source</Text>
                  <View style={styles.chipContainer}>
                    {['borewell', 'canal', 'rain', 'river', 'pond', 'drip'].map((water) => (
                      <TouchableOpacity
                        key={water}
                        style={[
                          styles.chip,
                          values.waterSource === water && styles.chipSelected,
                        ]}
                        onPress={() => setFieldValue('waterSource', water)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            values.waterSource === water && styles.chipTextSelected,
                          ]}
                        >
                          {water.charAt(0).toUpperCase() + water.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Notes */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Additional Notes</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Any additional information..."
                    placeholderTextColor={COLORS.textLight}
                    onChangeText={handleChange('notes')}
                    onBlur={handleBlur('notes')}
                    value={values.notes}
                    multiline
                    numberOfLines={4}
                  />
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                  style={[styles.submitButton, loading && styles.buttonDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator color={COLORS.secondary} />
                      <Text style={styles.loadingText}>Registering...</Text>
                    </View>
                  ) : (
                    <Text style={styles.submitButtonText}>Register Land</Text>
                  )}
                </TouchableOpacity>

              </View>
            )}
          </Formik>
        </ScrollView>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  backButton: {
    marginBottom: 15,
  },
  backButtonText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.secondary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.secondary,
    marginTop: 5,
    opacity: 0.9,
  },
  scrollView: {
    flex: 1,
  },
  form: {
    padding: 20,
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.cardBackground,
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    color: COLORS.text,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 4,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  halfWidth: {
    flex: 1,
  },
  sizeInput: {
    flex: 1,
  },
  unitPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    flex: 2,
  },
  unitButton: {
    backgroundColor: COLORS.cardBackground,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  unitButtonSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  unitButtonText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '600',
  },
  unitButtonTextSelected: {
    color: COLORS.secondary,
  },
  locationButton: {
    backgroundColor: COLORS.primary + '20',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
  },
  locationButtonIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  locationButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  locationInfo: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 8,
    textAlign: 'center',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: COLORS.cardBackground,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: COLORS.secondary,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  submitButtonText: {
    color: COLORS.secondary,
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default LandRegistrationScreen;

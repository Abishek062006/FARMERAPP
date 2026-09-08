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
  import { API_ENDPOINTS } from '../../utils/config';
  import { tBoth } from '../../i18n/strings';
  import { useLanguage } from '../../i18n/LanguageContext';

  export default function CropRegistrationScreen({ navigation, route }) {
    const { lang, t } = useLanguage();
    const { selectedCrops, land, plots, plotAllocations, userData } = route.params || {};

    const [loading, setLoading] = useState(false);
    const [currentCropIndex, setCurrentCropIndex] = useState(0);
    
    // Form fields
    const [plantingDate, setPlantingDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [quantity, setQuantity] = useState('');
    const [unit, setUnit] = useState('plants');
    const [variety, setVariety] = useState('');

    const [notes, setNotes] = useState('');

    const currentCrop = selectedCrops ? selectedCrops[currentCropIndex] : null;
    const currentPlot = plots ? plots[currentCropIndex] : null;
    const currentAllocation = plotAllocations ? plotAllocations[currentCropIndex] : null;

    useEffect(() => {
      console.log('🌱 CropRegistration - userData:', userData);
      console.log('🌱 Total crops to register:', selectedCrops?.length);
      console.log('🌱 Plots:', plots);
      console.log('🌱 Land:', land);
      
      const userFirebaseUid = userData?.firebaseUid || userData?.uid;
      
      if (!userData || !userFirebaseUid) {
        Alert.alert(t('cropRegistration.errorTitle'), t('cropRegistration.userDataNotFound'));
        navigation.navigate('Dashboard');
      }
    }, []);

    const unitValues = ['plants', 'seeds', 'kg', 'grams', 'saplings'];
    const units = unitValues.map((u) => ({
      value: u,
      label: tBoth(`cropRegistration.unit.${u}`, lang),
    }));

    const handleDateChange = (event, selectedDate) => {
      setShowDatePicker(false);
      if (selectedDate) {
        setPlantingDate(selectedDate);
      }
    };

    const handleRegister = async () => {
      // Validate
      if (!quantity || quantity <= 0) {
        Alert.alert(t('cropRegistration.requiredTitle'), t('cropRegistration.enterQuantity'));
        return;
      }

      const userFirebaseUid = userData?.firebaseUid || userData?.uid;

      if (!userFirebaseUid) {
        Alert.alert(t('cropRegistration.errorTitle'), t('cropRegistration.authError'));
        return;
      }

      try {
        setLoading(true);

        const cropData = {
          firebaseUid: userFirebaseUid,
          landId: land._id,
          plotId: currentPlot ? currentPlot._id : null,
          name: currentCrop.name,
          localName: currentCrop.localName,
          variety: variety || 'Standard',
          plantingDate: plantingDate.toISOString().split('T')[0],
          duration: currentCrop.duration,
          quantity: parseInt(quantity),
          unit,
        };

        if (notes.trim()) {
          cropData.notes = notes.trim();
        }

        console.log('📤 Registering crop:', cropData);

        const response = await axios.post(API_ENDPOINTS.CROPS, cropData);

        if (response.data.success) {
          console.log('✅ Crop registered:', response.data.crop._id);

          // Check if there are more crops to register
          if (currentCropIndex < selectedCrops.length - 1) {
            Alert.alert(
              t('cropRegistration.successTitle'),
              `${currentCrop.name} ${t('cropRegistration.registeredRegisterNext')}`,
              [
                {
                  text: t('cropRegistration.skipRemaining'),
                  onPress: () => {
                    Alert.alert(
                      t('cropRegistration.successTitle'),
                      `${currentCropIndex + 1} ${t('cropRegistration.cropsRegisteredSuccessfully')}`,
                      [
                        {
                          text: t('cropRegistration.goToDashboard'),
                          onPress: () => navigation.navigate('Dashboard'),
                        },
                      ]
                    );
                  },
                },
                {
                  text: t('cropRegistration.nextCrop'),
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
              t('cropRegistration.allDoneTitle'),
              `${t('cropRegistration.successfullyRegisteredPrefix')} ${selectedCrops.length} ${t('cropRegistration.cropsExclaim')}`,
              [
                {
                  text: t('cropRegistration.goToDashboard'),
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
          t('cropRegistration.errorTitle'),
          error.response?.data?.message || t('cropRegistration.failedToRegister')
        );
      } finally {
        setLoading(false);
      }
    };

    if (!currentCrop) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{t('cropRegistration.noCropSelected')}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate('Dashboard')}
          >
            <Text style={styles.backButtonText}>{t('cropRegistration.goToDashboard')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('cropRegistration.headerTitle')}</Text>
          <Text style={styles.headerSubtitle}>
            {currentCropIndex + 1} {t('cropRegistration.ofWord')} {selectedCrops.length}
          </Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${((currentCropIndex + 1) / selectedCrops.length) * 100}%` }
              ]} 
            />
          </View>
        </View>

        {/* Crop Info Card */}
        <View style={styles.cropCard}>
          <View style={styles.cropIconContainer}>
            <Text style={styles.cropIcon}>🌾</Text>
          </View>
          <View style={styles.cropInfo}>
            <Text style={styles.cropName}>{currentCrop.name}</Text>
            <Text style={styles.cropLocalName}>{currentCrop.localName}</Text>
            <Text style={styles.cropDuration}>
              {t('cropRegistration.durationPrefix')} {currentCrop.duration} {t('cropRegistration.days')}
            </Text>
          </View>
        </View>

        {/* Plot Info (if available) */}
        {currentAllocation && (
          <View style={styles.plotInfoCard}>
            <Ionicons name="grid" size={20} color="#4CAF50" />
            <View style={styles.plotInfoText}>
              <Text style={styles.plotInfoLabel}>{t('cropRegistration.allocatedPlot')}</Text>
              <Text style={styles.plotInfoValue}>
                {currentAllocation.area.value} {currentAllocation.area.unit}
                ({currentAllocation.percentage.toFixed(1)}% {t('cropRegistration.ofLand')})
              </Text>
            </View>
          </View>
        )}

        {/* Form */}
        <View style={styles.form}>
          {/* Planting Date */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              {t('cropRegistration.plantingDate')} <Text style={styles.required}>*</Text>
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
              {t('cropRegistration.quantity')} <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 2 }]}
                placeholder={t('cropRegistration.quantityPlaceholder')}
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
              />
              <View style={[styles.pickerContainer, { flex: 1, marginLeft: 12 }]}>
                <Picker
                  selectedValue={unit}
                  onValueChange={setUnit}
                  style={styles.picker}
                >
                  {units.map((u) => (
                    <Picker.Item key={u.value} label={u.label} value={u.value} />
                  ))}
                </Picker>
              </View>
            </View>
          </View>

          {/* Variety */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('cropRegistration.variety')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('cropRegistration.varietyPlaceholder')}
              value={variety}
              onChangeText={setVariety}
            />
          </View>


          {/* Notes */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('cropRegistration.notes')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t('cropRegistration.notesPlaceholder')}
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
            <>
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={styles.registerButtonText}>
                {t('cropRegistration.registerPrefix')} {currentCrop.name}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Skip Button */}
        {selectedCrops.length > 1 && currentCropIndex < selectedCrops.length - 1 && (
          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => {
              Alert.alert(
                t('cropRegistration.skipRegistrationTitle'),
                t('cropRegistration.skipConfirmMsg'),
                [
                  { text: t('cropRegistration.cancel'), style: 'cancel' },
                  {
                    text: t('cropRegistration.skip'),
                    onPress: () => {
                      Alert.alert(
                        t('cropRegistration.successTitle'),
                        `${currentCropIndex + 1} ${t('cropRegistration.cropsRegistered')}`,
                        [
                          {
                            text: t('cropRegistration.goToDashboard'),
                            onPress: () => navigation.navigate('Dashboard'),
                          },
                        ]
                      );
                    },
                  },
                ]
              );
            }}
          >
            <Text style={styles.skipButtonText}>{t('cropRegistration.skipRemainingCrops')}</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#f5f5f5',
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
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
    progressContainer: {
      backgroundColor: '#fff',
      padding: 16,
      paddingTop: 0,
    },
    progressBar: {
      height: 8,
      backgroundColor: '#e0e0e0',
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: '#4CAF50',
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
      justifyContent: 'center',
    },
    cropName: {
      fontSize: 20,
      fontWeight: 'bold',
      color: '#333',
    },
    cropLocalName: {
      fontSize: 16,
      color: '#666',
      marginTop: 4,
    },
    cropDuration: {
      fontSize: 14,
      color: '#4CAF50',
      marginTop: 4,
    },
    plotInfoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#E8F5E9',
      marginHorizontal: 16,
      marginBottom: 16,
      padding: 12,
      borderRadius: 8,
    },
    plotInfoText: {
      marginLeft: 12,
      flex: 1,
    },
    plotInfoLabel: {
      fontSize: 12,
      color: '#666',
    },
    plotInfoValue: {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#2E7D32',
      marginTop: 2,
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
    row: {
      flexDirection: 'row',
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#4CAF50',
      padding: 16,
      borderRadius: 12,
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
      marginLeft: 8,
    },
    skipButton: {
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    skipButtonText: {
      color: '#666',
      fontSize: 16,
    },
    errorText: {
      fontSize: 18,
      color: '#666',
      textAlign: 'center',
      marginBottom: 20,
    },
    backButton: {
      backgroundColor: '#4CAF50',
      padding: 16,
      borderRadius: 12,
      paddingHorizontal: 32,
    },
    backButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: 'bold',
    },
  });

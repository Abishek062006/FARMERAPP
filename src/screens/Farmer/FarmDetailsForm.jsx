import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/colors';

const FarmDetailsForm = ({ navigation, route }) => {
  const { farmingType } = route.params || {};
  const [formData, setFormData] = useState({
    farmSize: '',
    soilType: '',
    currentCrops: '',
    irrigationType: '',
    notes: '',
  });

  useEffect(() => {
    loadFarmDetails();
  }, []);

  const loadFarmDetails = async () => {
    try {
      const saved = await AsyncStorage.getItem(`farmDetails_${farmingType}`);
      if (saved) {
        setFormData(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Error loading farm details:', error);
    }
  };

  const updateField = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      await AsyncStorage.setItem(
        `farmDetails_${farmingType}`,
        JSON.stringify(formData)
      );
      Alert.alert('Success', 'Farm details saved!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to save farm details');
    }
  };

  const getFarmIcon = () => {
    if (farmingType === 'terrace') return '🏢';
    if (farmingType === 'normal') return '🚜';
    if (farmingType === 'organic') return '🌱';
    return '🌾';
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {getFarmIcon()} Farm Details
          </Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Farm Size (in acres/sqft)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 5 acres or 2000 sqft"
                placeholderTextColor={COLORS.textLight}
                value={formData.farmSize}
                onChangeText={text => updateField('farmSize', text)}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Soil Type</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Clay, Sandy, Loam"
                placeholderTextColor={COLORS.textLight}
                value={formData.soilType}
                onChangeText={text => updateField('soilType', text)}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Current Crops</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="List your current crops (comma separated)"
                placeholderTextColor={COLORS.textLight}
                value={formData.currentCrops}
                onChangeText={text => updateField('currentCrops', text)}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Irrigation Type</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Drip, Sprinkler, Manual"
                placeholderTextColor={COLORS.textLight}
                value={formData.irrigationType}
                onChangeText={text => updateField('irrigationType', text)}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Additional Notes</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="Any additional information about your farm"
                placeholderTextColor={COLORS.textLight}
                value={formData.notes}
                onChangeText={text => updateField('notes', text)}
                multiline
                numberOfLines={4}
              />
            </View>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              activeOpacity={0.8}
            >
              <Text style={styles.saveButtonText}>Save Farm Details</Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: COLORS.secondary,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  placeholder: {
    width: 60,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
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
  multiline: {
    height: 100,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  saveButtonText: {
    color: COLORS.secondary,
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default FarmDetailsForm;

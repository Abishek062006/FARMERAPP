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
import Slider from '@react-native-community/slider';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

export default function PlotDivisionScreen({ navigation, route }) {
  const { selectedCrops, land, userData } = route.params || {};

  const [loading, setLoading] = useState(false);
  const [plotAllocations, setPlotAllocations] = useState([]);
  const [totalAllocated, setTotalAllocated] = useState(0);

  useEffect(() => {
    if (selectedCrops && selectedCrops.length > 0) {
      initializePlots();
    }
  }, [selectedCrops]);

  const initializePlots = () => {
    // If only 1 crop, allocate 100% automatically
    if (selectedCrops.length === 1) {
      const landSizeValue = parseFloat(land.size.value);
      setPlotAllocations([
        {
          crop: selectedCrops[0],
          percentage: 100,
          area: {
            value: landSizeValue,
            unit: land.size.unit,
          },
        },
      ]);
      setTotalAllocated(100);
    } else {
      // Divide equally among crops
      const equalPercentage = Math.floor(100 / selectedCrops.length);
      const landSizeValue = parseFloat(land.size.value);

      const allocations = selectedCrops.map((crop, index) => ({
        crop,
        percentage: equalPercentage,
        area: {
          value: parseFloat(((equalPercentage / 100) * landSizeValue).toFixed(2)),
          unit: land.size.unit,
        },
      }));

      setPlotAllocations(allocations);
      setTotalAllocated(equalPercentage * selectedCrops.length);
    }
  };

  const updatePlotPercentage = (index, newPercentage) => {
    const updatedAllocations = [...plotAllocations];
    const landSizeValue = parseFloat(land.size.value);

    // Update percentage
    updatedAllocations[index].percentage = newPercentage;

    // Calculate area
    updatedAllocations[index].area = {
      value: parseFloat(((newPercentage / 100) * landSizeValue).toFixed(2)),
      unit: land.size.unit,
    };

    setPlotAllocations(updatedAllocations);

    // Calculate total
    const total = updatedAllocations.reduce((sum, plot) => sum + plot.percentage, 0);
    setTotalAllocated(total);
  };

  const handleConfirm = async () => {
    // Validate total is 100%
    if (Math.abs(totalAllocated - 100) > 0.1) {
      Alert.alert(
        'Invalid Division',
        `Total allocation must equal 100%. Currently: ${totalAllocated.toFixed(1)}%`
      );
      return;
    }

    try {
      setLoading(true);

      // Create plots data
      const plotsData = plotAllocations.map((allocation, index) => ({
        plotName: `Plot ${index + 1} - ${allocation.crop.name}`,
        percentage: allocation.percentage,
        area: allocation.area,
      }));

      console.log('📊 Creating plots:', plotsData);

      // Send to backend
      const response = await axios.post(API_ENDPOINTS.PLOTS, {
        landId: land._id,
        firebaseUid: userData.firebaseUid || userData.uid,
        plots: plotsData,
      });

      if (response.data.success) {
        console.log('✅ Plots created successfully');

        // Navigate to crop registration with plot data
        navigation.navigate('CropRegistration', {
          selectedCrops,
          land,
          plots: response.data.plots,
          plotAllocations,
          userData,
        });
      }
    } catch (error) {
      console.error('❌ Error creating plots:', error);
      Alert.alert(
        'Error',
        error.response?.data?.message || 'Failed to create plot divisions'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!selectedCrops || selectedCrops.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>No crops selected</Text>
      </View>
    );
  }

  // If only 1 crop, show simple confirmation
  if (selectedCrops.length === 1) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="checkmark-circle" size={60} color="#4CAF50" />
            <Text style={styles.headerTitle}>Single Crop Selected</Text>
            <Text style={styles.headerSubtitle}>
              Full land will be allocated to this crop
            </Text>
          </View>

          {/* Crop Card */}
          <View style={styles.singleCropCard}>
            <Text style={styles.cropIcon}>🌾</Text>
            <Text style={styles.cropName}>{selectedCrops[0].name}</Text>
            <Text style={styles.cropTamilName}>{selectedCrops[0].tamilName}</Text>
            <View style={styles.allocationBadge}>
              <Text style={styles.allocationText}>100% of Land</Text>
            </View>
            <View style={styles.areaInfo}>
              <Ionicons name="resize" size={20} color="#4CAF50" />
              <Text style={styles.areaText}>
                {land.size.value} {land.size.unit}
              </Text>
            </View>
          </View>

          {/* Continue Button */}
          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.continueButtonText}>Continue to Registration</Text>
                <Ionicons name="arrow-forward" size={24} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // Multiple crops - show division interface
  const remaining = 100 - totalAllocated;
  const isValid = Math.abs(remaining) < 0.1;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="grid" size={50} color="#4CAF50" />
          <Text style={styles.headerTitle}>Divide Your Land</Text>
          <Text style={styles.headerSubtitle}>
            Allocate space for {selectedCrops.length} crops
          </Text>
        </View>

        {/* Total Land Info */}
        <View style={styles.landInfoCard}>
          <View style={styles.landInfoRow}>
            <Text style={styles.landInfoLabel}>Total Land:</Text>
            <Text style={styles.landInfoValue}>
              {land.size.value} {land.size.unit}
            </Text>
          </View>
          <View style={styles.landInfoRow}>
            <Text style={styles.landInfoLabel}>Land Name:</Text>
            <Text style={styles.landInfoValue}>{land.landName}</Text>
          </View>
        </View>

        {/* Allocation Status */}
        <View style={[styles.statusCard, isValid ? styles.statusValid : styles.statusInvalid]}>
          <View style={styles.statusContent}>
            <Text style={styles.statusLabel}>Total Allocated:</Text>
            <Text style={[styles.statusValue, isValid ? styles.statusValueValid : styles.statusValueInvalid]}>
              {totalAllocated.toFixed(1)}%
            </Text>
          </View>
          {!isValid && (
            <View style={styles.remainingContainer}>
              <Ionicons
                name={remaining > 0 ? 'alert-circle' : 'warning'}
                size={20}
                color="#F44336"
              />
              <Text style={styles.remainingText}>
                {remaining > 0
                  ? `${remaining.toFixed(1)}% remaining`
                  : `Over by ${Math.abs(remaining).toFixed(1)}%`}
              </Text>
            </View>
          )}
          {isValid && (
            <View style={styles.validContainer}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.validText}>Perfect! Ready to continue</Text>
            </View>
          )}
        </View>

        {/* Plot Allocations */}
        {plotAllocations.map((allocation, index) => (
          <View key={index} style={styles.plotCard}>
            {/* Plot Header */}
            <View style={styles.plotHeader}>
              <View style={styles.plotNumber}>
                <Text style={styles.plotNumberText}>Plot {index + 1}</Text>
              </View>
              <View style={styles.cropInfo}>
                <Text style={styles.plotCropName}>{allocation.crop.name}</Text>
                <Text style={styles.plotCropTamil}>{allocation.crop.tamilName}</Text>
              </View>
            </View>

            {/* Percentage Display */}
            <View style={styles.percentageDisplay}>
              <Text style={styles.percentageValue}>
                {allocation.percentage.toFixed(1)}%
              </Text>
              <Text style={styles.areaValue}>
                {allocation.area.value} {allocation.area.unit}
              </Text>
            </View>

            {/* Slider */}
            <Slider
              style={styles.slider}
              minimumValue={5}
              maximumValue={95}
              step={1}
              value={allocation.percentage}
              onValueChange={(value) => updatePlotPercentage(index, value)}
              minimumTrackTintColor="#4CAF50"
              maximumTrackTintColor="#ddd"
              thumbTintColor="#4CAF50"
            />

            {/* Quick Adjust Buttons */}
            <View style={styles.quickAdjust}>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => updatePlotPercentage(index, Math.max(5, allocation.percentage - 5))}
              >
                <Ionicons name="remove" size={16} color="#666" />
                <Text style={styles.adjustText}>-5%</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => updatePlotPercentage(index, Math.min(95, allocation.percentage + 5))}
              >
                <Ionicons name="add" size={16} color="#666" />
                <Text style={styles.adjustText}>+5%</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Confirm Button */}
        <TouchableOpacity
          style={[styles.confirmButton, !isValid && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={!isValid || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={styles.confirmButtonText}>Confirm & Continue</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
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
  },
  content: {
    padding: 16,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    marginBottom: 16,
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
  landInfoCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  landInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  landInfoLabel: {
    fontSize: 16,
    color: '#666',
  },
  landInfoValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  statusCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
  },
  statusValid: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  statusInvalid: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
  },
  statusContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  statusValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  statusValueValid: {
    color: '#4CAF50',
  },
  statusValueInvalid: {
    color: '#F44336',
  },
  remainingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  remainingText: {
    fontSize: 14,
    color: '#F44336',
    marginLeft: 8,
    fontWeight: '600',
  },
  validContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  validText: {
    fontSize: 14,
    color: '#4CAF50',
    marginLeft: 8,
    fontWeight: '600',
  },
  plotCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  plotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  plotNumber: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  plotNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  cropInfo: {
    flex: 1,
  },
  plotCropName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  plotCropTamil: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  percentageDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  percentageValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  areaValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  quickAdjust: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
  },
  adjustButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  adjustText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 4,
  },
  singleCropCard: {
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  cropIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  cropName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  cropTamilName: {
    fontSize: 18,
    color: '#666',
    marginBottom: 16,
  },
  allocationBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 16,
  },
  allocationText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  areaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  areaText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginLeft: 8,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  confirmButtonDisabled: {
    backgroundColor: '#ccc',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
  },
});

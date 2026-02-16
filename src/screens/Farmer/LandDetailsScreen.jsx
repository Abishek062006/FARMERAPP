import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

export default function LandDetailsScreen({ navigation, route }) {
  const { land, userData } = route.params || {};
  const [loading, setLoading] = useState(false);
  const [landDetails, setLandDetails] = useState(land);
  const [plots, setPlots] = useState([]);
  const [crops, setCrops] = useState([]);

  useEffect(() => {
    if (land) {
      fetchLandDetails();
    }
  }, [land]);

  const fetchLandDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_ENDPOINTS.LANDS}/details/${land._id}`);

      if (response.data.success) {
        setLandDetails(response.data.land);
        setPlots(response.data.plots || []);
        setCrops(response.data.crops || []);
      }
    } catch (error) {
      console.error('❌ Error fetching land details:', error);
      Alert.alert('Error', 'Failed to load land details');
    } finally {
      setLoading(false);
    }
  };

  const handleStartFarming = () => {
    navigation.navigate('CropRecommendation', {
      landId: land._id,
      land: landDetails,
      userData,
    });
  };

  const handleDeleteLand = () => {
    Alert.alert(
      'Delete Land',
      'Are you sure you want to delete this land? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await axios.delete(`${API_ENDPOINTS.LANDS}/${land._id}`);
              
              if (response.data.success) {
                Alert.alert('Success', 'Land deleted successfully');
                navigation.goBack();
              }
            } catch (error) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to delete land');
            }
          },
        },
      ]
    );
  };

  const getFarmingTypeInfo = (type) => {
    switch (type) {
      case 'normal':
        return { icon: '🌾', color: '#FF9800', label: 'Normal Farming' };
      case 'organic':
        return { icon: '🌱', color: '#4CAF50', label: 'Organic Farming' };
      case 'terrace':
        return { icon: '🪴', color: '#2196F3', label: 'Terrace Farming' };
      default:
        return { icon: '🌿', color: '#666', label: 'Unknown' };
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  const farmingInfo = getFarmingTypeInfo(landDetails?.farmingType);

  return (
    <ScrollView style={styles.container}>
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{farmingInfo.icon}</Text>
        </View>
        <Text style={styles.landName}>{landDetails?.landName}</Text>
        <View style={[styles.typeBadge, { backgroundColor: farmingInfo.color }]}>
          <Text style={styles.typeBadgeText}>{farmingInfo.label}</Text>
        </View>
      </View>

      {/* Location Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="location" size={24} color="#4CAF50" />
          <Text style={styles.sectionTitle}>Location</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>City:</Text>
          <Text style={styles.infoValue}>{landDetails?.location.city}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>District:</Text>
          <Text style={styles.infoValue}>{landDetails?.location.district}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>State:</Text>
          <Text style={styles.infoValue}>{landDetails?.location.state}</Text>
        </View>
        {landDetails?.location.pincode && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Pincode:</Text>
            <Text style={styles.infoValue}>{landDetails.location.pincode}</Text>
          </View>
        )}
      </View>

      {/* Land Details Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="information-circle" size={24} color="#4CAF50" />
          <Text style={styles.sectionTitle}>Land Details</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Size:</Text>
          <Text style={styles.infoValue}>
            {landDetails?.size.value} {landDetails?.size.unit}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Water Source:</Text>
          <Text style={styles.infoValue}>
            {landDetails?.waterSource.charAt(0).toUpperCase() + 
             landDetails?.waterSource.slice(1)}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Soil Type:</Text>
          <Text style={styles.infoValue}>
            {landDetails?.soilType.charAt(0).toUpperCase() + 
             landDetails?.soilType.slice(1)}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Total Plots:</Text>
          <Text style={styles.infoValue}>{landDetails?.totalPlots || 0}</Text>
        </View>
      </View>

      {/* Crops Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="leaf" size={24} color="#4CAF50" />
          <Text style={styles.sectionTitle}>Active Crops</Text>
        </View>
        {crops.length === 0 ? (
          <Text style={styles.emptyText}>No crops planted yet</Text>
        ) : (
          crops.map((crop, index) => (
            <View key={index} style={styles.cropCard}>
              <Text style={styles.cropName}>
                {crop.name} ({crop.tamilName})
              </Text>
              <Text style={styles.cropDetail}>
                Planted: {new Date(crop.plantingDate).toLocaleDateString()}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Notes Section */}
      {landDetails?.notes && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text" size={24} color="#4CAF50" />
            <Text style={styles.sectionTitle}>Notes</Text>
          </View>
          <Text style={styles.notesText}>{landDetails.notes}</Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleStartFarming}
        >
          <Ionicons name="leaf" size={24} color="#fff" />
          <Text style={styles.primaryButtonText}>Start Farming</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteLand}
        >
          <Ionicons name="trash" size={20} color="#fff" />
          <Text style={styles.deleteButtonText}>Delete Land</Text>
        </TouchableOpacity>
      </View>

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
  },
  headerCard: {
    backgroundColor: '#fff',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 48,
  },
  landName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  typeBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 16,
    color: '#666',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  cropCard: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  cropName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  cropDetail: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  notesText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
  },
  actionsContainer: {
    padding: 16,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F44336',
    padding: 14,
    borderRadius: 12,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});

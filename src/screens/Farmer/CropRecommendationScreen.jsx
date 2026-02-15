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

// Your backend URL - Change this to match your Thunder Client IP
const API_URL = 'http://192.168.1.7:5000';

export default function CropRecommendationScreen({ navigation, route }) {
  const { location, season, soilType, waterSource, userData } = route.params;
  
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [selectedCrops, setSelectedCrops] = useState([]);

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      
      console.log('🔄 Fetching recommendations...');
      console.log('Location:', location);
      console.log('Season:', season);
      console.log('Soil Type:', soilType);
      
      const response = await axios.post(`${API_URL}/api/ai/crop-recommendations`, {
        location: {
          city: location.city,
          district: location.district,
          state: location.state,
        },
        soilType,
        season: season.value,
      });

      console.log('✅ Response received:', response.data);

      if (response.data.success) {
        setRecommendations(response.data.recommendations);
        console.log(`✅ Got ${response.data.recommendations.length} recommendations`);
      } else {
        Alert.alert('Error', 'Failed to get recommendations');
      }
    } catch (error) {
      console.error('❌ Error fetching recommendations:', error);
      console.error('Error details:', error.message);
      Alert.alert('Error', `Failed to connect to server: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleCropSelection = (crop) => {
    const isSelected = selectedCrops.find(c => c.name === crop.name);
    
    if (isSelected) {
      // Remove from selection
      setSelectedCrops(selectedCrops.filter(c => c.name !== crop.name));
    } else {
      // Add to selection (limit to 15 crops for now)
      if (selectedCrops.length < 15) {
        setSelectedCrops([...selectedCrops, crop]);
      } else {
        Alert.alert('Limit Reached', 'You can select maximum 15 crops');
      }
    }
  };

  const handleContinue = () => {
    if (selectedCrops.length === 0) {
      Alert.alert('Required', 'Please select at least one crop');
      return;
    }

    // ✅ NAVIGATE TO CROP REGISTRATION
    navigation.navigate('CropRegistration', {
      selectedCrops,
      userData,
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Getting AI recommendations...</Text>
        <Text style={styles.loadingSubtext}>
          Based on {location.city}, {season.name}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🌱 Recommended Crops</Text>
        <Text style={styles.headerSubtitle}>
          Based on {location.city} • {season.name} • {soilType} soil
        </Text>
        <View style={styles.selectionCounter}>
          <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
          <Text style={styles.selectionCounterText}>
            {selectedCrops.length} crop(s) selected
          </Text>
        </View>
      </View>

      {/* Crop List */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {recommendations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No recommendations found</Text>
            <Text style={styles.emptySubtext}>Please try again</Text>
          </View>
        ) : (
          recommendations.map((crop, index) => {
            const isSelected = selectedCrops.find(c => c.name === crop.name);
            
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.cropCard,
                  isSelected && styles.cropCardSelected
                ]}
                onPress={() => toggleCropSelection(crop)}
                activeOpacity={0.7}
              >
                {/* Selection Indicator */}
                <View style={styles.cropCardHeader}>
                  <View style={styles.cropIconContainer}>
                    <Text style={styles.cropIcon}>🌾</Text>
                  </View>
                  <View style={[
                    styles.checkbox,
                    isSelected && styles.checkboxSelected
                  ]}>
                    {isSelected && (
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    )}
                  </View>
                </View>

                {/* Crop Info */}
                <View style={styles.cropInfo}>
                  <Text style={styles.cropName}>{crop.name}</Text>
                  <Text style={styles.cropTamilName}>{crop.tamilName}</Text>
                  
                  {/* Stats */}
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Ionicons name="time-outline" size={16} color="#666" />
                      <Text style={styles.statText}>{crop.duration} days</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Ionicons name="water-outline" size={16} color="#666" />
                      <Text style={styles.statText}>{crop.yield || 'N/A'}</Text>
                    </View>
                  </View>

                  {/* Demand Badge */}
                  {crop.demand && (
                    <View style={[
                      styles.demandBadge,
                      crop.demand === 'High' && styles.demandHigh,
                      crop.demand === 'Medium' && styles.demandMedium,
                    ]}>
                      <Text style={styles.demandText}>{crop.demand} Demand</Text>
                    </View>
                  )}

                  {/* Reason */}
                  <Text style={styles.cropReason} numberOfLines={3}>
                    {crop.reason}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Bottom Button */}
      {recommendations.length > 0 && (
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={[
              styles.continueButton,
              selectedCrops.length === 0 && styles.continueButtonDisabled
            ]}
            onPress={handleContinue}
            disabled={selectedCrops.length === 0}
          >
            <Text style={styles.continueButtonText}>
              Continue with {selectedCrops.length} crop(s) →
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
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
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  selectionCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  selectionCounterText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  cropCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cropCardSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8F4',
  },
  cropCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cropIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cropIcon: {
    fontSize: 28,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  cropInfo: {
    flex: 1,
  },
  cropName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  cropTamilName: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 13,
    color: '#666',
  },
  demandBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  demandHigh: {
    backgroundColor: '#4CAF50',
  },
  demandMedium: {
    backgroundColor: '#FF9800',
  },
  demandText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  cropReason: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  bottomContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  continueButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: '#ccc',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

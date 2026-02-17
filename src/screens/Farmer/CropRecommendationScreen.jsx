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

export default function CropRecommendationScreen({ navigation, route }) {
  // ✅ Updated to receive land object from route params
  const { land, userData } = route.params || {};
  
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [selectedCrops, setSelectedCrops] = useState([]);

  // ✅ Get max crops based on farming type
  const getMaxCrops = () => {
    switch (land?.farmingType) {
      case 'normal':
        return 2;
      case 'organic':
        return 2;
      case 'terrace':
        return 10;
      default:
        return 2;
    }
  };

  const maxCrops = getMaxCrops();

  useEffect(() => {
    if (land) {
      fetchRecommendations();
    }
  }, [land]);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      
      console.log('🔄 Fetching AI recommendations...');
      console.log('Land:', land.landName);
      console.log('Location:', land.location);
      console.log('Farming Type:', land.farmingType);
      console.log('Soil Type:', land.soilType);
      
      // ✅ Auto-detect season based on current date
      const currentMonth = new Date().getMonth() + 1;
      let season = 'Summer';
      if (currentMonth >= 6 && currentMonth <= 9) {
        season = 'Monsoon';
      } else if (currentMonth >= 10 || currentMonth <= 2) {
        season = 'Winter';
      }

      console.log('🌦️ Detected Season:', season);

      // ✅ Prepare request for AI
      const requestData = {
        location: {
          city: land.location.city,
          district: land.location.district,
          state: land.location.state,
        },
        soilType: land.soilType,
        season: season,
      };

      console.log('📤 Sending to AI:', JSON.stringify(requestData, null, 2));

      const response = await axios.post(
        `${API_ENDPOINTS.AI}/crop-recommendations`,
        requestData,
        {
          timeout: 30000, // 30 second timeout
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('📥 AI Response received');
      console.log('Success:', response.data.success);
      console.log('Recommendations count:', response.data.recommendations?.length);

      if (response.data.success && response.data.recommendations) {
        let crops = response.data.recommendations;
        
        console.log(`✅ Got ${crops.length} AI recommendations`);
        
        // ✅ Filter recommendations based on farming type
        if (land.farmingType === 'terrace') {
          const terraceFriendly = [
            'Tomato', 'Chili', 'Brinjal', 'Beans', 'Spinach',
            'Coriander', 'Mint', 'Curry Leaves', 'Lettuce', 'Radish',
            'Fenugreek', 'Spring Onion', 'Capsicum', 'Basil'
          ];
          const originalCount = crops.length;
          crops = crops.filter(crop =>
            terraceFriendly.some(friendly =>
              crop.name.toLowerCase().includes(friendly.toLowerCase())
            )
          );
          console.log(`🪴 Filtered ${originalCount} → ${crops.length} terrace-friendly crops`);
        }

        if (crops.length === 0) {
          Alert.alert(
            'No Suitable Crops',
            'Could not find suitable crops for your farming type and location. Please try again.',
            [{ text: 'OK' }]
          );
        } else {
          setRecommendations(crops);
          console.log(`✅ Showing ${crops.length} final recommendations`);
        }
      } else {
        console.error('❌ Invalid response format:', response.data);
        Alert.alert('Error', 'Failed to get AI recommendations. Invalid response format.');
      }
    } catch (error) {
      console.error('❌ Error fetching recommendations:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        code: error.code,
      });
      
      let errorMessage = 'Failed to connect to AI service.';
      
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout. Please check your internet connection.';
      } else if (error.response) {
        errorMessage = error.response.data?.error || `Server error: ${error.response.status}`;
      } else if (error.request) {
        errorMessage = 'Cannot connect to server. Please check if backend is running on http://172.20.10.8:5000';
      }
      
      Alert.alert(
        'AI Connection Error',
        errorMessage,
        [
          { text: 'Retry', onPress: () => fetchRecommendations() },
          { text: 'Go Back', onPress: () => navigation.goBack() },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleCropSelection = (crop) => {
    const isSelected = selectedCrops.find(c => c.name === crop.name);
    
    if (isSelected) {
      setSelectedCrops(selectedCrops.filter(c => c.name !== crop.name));
    } else {
      if (selectedCrops.length < maxCrops) {
        setSelectedCrops([...selectedCrops, crop]);
      } else {
        Alert.alert(
          'Limit Reached',
          `${land.farmingType === 'terrace' ? 'Terrace' : land.farmingType.charAt(0).toUpperCase() + land.farmingType.slice(1)} farming allows maximum ${maxCrops} crops`
        );
      }
    }
  };

  const handleContinue = () => {
    if (selectedCrops.length === 0) {
      Alert.alert('Required', 'Please select at least one crop');
      return;
    }

    // ✅ Navigate to Plot Division Screen
    navigation.navigate('PlotDivision', {
      selectedCrops,
      land,
      userData,
    });
  };

  // ✅ Get farming type badge info
  const getFarmingTypeBadge = () => {
    switch (land?.farmingType) {
      case 'normal':
        return { icon: '🌾', color: '#FF9800', label: 'Normal Farming' };
      case 'organic':
        return { icon: '🌱', color: '#4CAF50', label: 'Organic Farming' };
      case 'terrace':
        return { icon: '🪴', color: '#2196F3', label: 'Terrace Farming' };
      default:
        return { icon: '🌿', color: '#666', label: 'Farming' };
    }
  };

  const farmingBadge = getFarmingTypeBadge();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Getting AI recommendations...</Text>
        <Text style={styles.loadingSubtext}>
          Analyzing {land?.location.city} for {farmingBadge.label}
        </Text>
        <Text style={styles.loadingNote}>This may take 10-15 seconds...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container,]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>🌱 AI Crop Recommendations</Text>
            <Text style={styles.headerSubtitle}>
              {land?.location.city}, {land?.location.district}
            </Text>
          </View>
          <View style={[styles.farmingTypeBadge, { backgroundColor: farmingBadge.color }]}>
            <Text style={styles.farmingTypeText}>
              {farmingBadge.icon} {farmingBadge.label}
            </Text>
          </View>
        </View>
        
        {/* Selection Counter */}
        <View style={styles.selectionRow}>
          <View style={styles.selectionCounter}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.selectionCounterText}>
              {selectedCrops.length} / {maxCrops} selected
            </Text>
          </View>
          <Text style={styles.limitText}>
            Max {maxCrops} crop{maxCrops > 1 ? 's' : ''} allowed
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
            <Ionicons name="leaf-outline" size={80} color="#ccc" />
            <Text style={styles.emptyText}>No recommendations available</Text>
            <Text style={styles.emptySubtext}>
              AI couldn't generate recommendations. Please check:
            </Text>
            <Text style={styles.checkItem}>• Backend is running</Text>
            <Text style={styles.checkItem}>• GROQ_API_KEY is set in .env</Text>
            <Text style={styles.checkItem}>• Internet connection is active</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={fetchRecommendations}
            >
              <Ionicons name="refresh" size={20} color="#4CAF50" />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
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
                    {crop.yield && (
                      <View style={styles.statItem}>
                        <Ionicons name="water-outline" size={16} color="#666" />
                        <Text style={styles.statText}>{crop.yield}</Text>
                      </View>
                    )}
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
              Continue with {selectedCrops.length} crop(s)
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
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
    padding: 20,
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
  loadingNote: {
    marginTop: 16,
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#666',
  },
  farmingTypeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  farmingTypeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  selectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectionCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  selectionCounterText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
  },
  limitText: {
    fontSize: 12,
    color: '#999',
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
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 12,
  },
  checkItem: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 20,
  },
  retryText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
  },
  continueButtonDisabled: {
    backgroundColor: '#ccc',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
});

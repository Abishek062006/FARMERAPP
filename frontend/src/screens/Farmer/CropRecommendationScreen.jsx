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
import SearchSelectSheet from '../../components/SearchSelectSheet';

export default function CropRecommendationScreen({ navigation, route }) {
  // ✅ Updated to receive land object from route params
  const { land, userData } = route.params || {};
  
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [selectedCrops, setSelectedCrops] = useState([]);
  const [cropCatalog, setCropCatalog] = useState([]);

  const maxCrops = 2;

  useEffect(() => {
    if (land) {
      fetchRecommendations();
    }
    fetchCropCatalog();
  }, [land]);

  const fetchCropCatalog = async () => {
    try {
      const response = await axios.get(`${API_ENDPOINTS.AI}/crop-catalog`);
      if (response.data.success) {
        setCropCatalog(response.data.crops);
      }
    } catch (error) {
      console.error('❌ Error fetching crop catalog:', error);
      // Non-fatal — the search sheet still works via "use what I typed".
    }
  };

  // A crop picked from search (in the catalog or typed freely) isn't
  // AI-ranked for this land, so it has no duration/yield/demand — it's
  // added as-is and flagged so the card renders a neutral "Added by you"
  // badge instead of fabricating those numbers.
  const addCropFromSearch = (cropValue, option) => {
    const name = option?.label || cropValue;
    const existing = recommendations.find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );

    const cropEntry = existing || {
      name,
      tamilName: option?.isCustom ? '' : option?.subtitle || '',
      duration: null,
      yield: null,
      demand: null,
      reason: 'Added by you — not part of the AI-ranked list for this land.',
      isCustom: true,
    };

    if (!existing) {
      setRecommendations((prev) => [cropEntry, ...prev]);
    }
    toggleCropSelection(cropEntry);
  };

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      
      console.log('🔄 Fetching AI recommendations...');
      console.log('Land:', land.landName);
      console.log('Location:', land.location);
      console.log('Soil Type:', land.soilType);
      console.log('Water Source:', land.waterSource);
      
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
        waterSource: land.waterSource,
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

        if (crops.length === 0) {
          Alert.alert(
            'No Suitable Crops',
            'Could not find suitable crops for your location. Please try again.',
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
        errorMessage = `Cannot connect to server. Please check if backend is running on ${API_ENDPOINTS.AI.replace('/api/ai', '')}`;
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
        Alert.alert('Limit Reached', `You can select a maximum of ${maxCrops} crops`);
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Getting AI recommendations...</Text>
        <Text style={styles.loadingSubtext}>
          Analyzing {land?.location.city}
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

        {/* Search for a crop not in the AI-ranked list below */}
        <SearchSelectSheet
          title="Search Crops"
          options={cropCatalog.map((c) => ({
            label: c.name,
            value: c.name,
            subtitle: c.tamilName,
          }))}
          onChange={addCropFromSearch}
          placeholder="Search crop name..."
          allowCustom
          customHint="Grow this even though it's not commonly recommended"
          renderTrigger={({ onPress }) => (
            <TouchableOpacity style={styles.searchTrigger} onPress={onPress} activeOpacity={0.7}>
              <Ionicons name="search" size={18} color="#4CAF50" />
              <Text style={styles.searchTriggerText}>
                Don't see your crop? Search all Tamil Nadu crops
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Crop List */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {recommendations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="leaf-outline" size={80} color="#ccc" />
            <Text style={styles.emptyText}>No matching crops found</Text>
            <Text style={styles.emptySubtext}>
              We couldn't find a crop in our reference data suited to this land's
              exact soil type, water source, and current season. Try updating the
              land's details or check back next season.
            </Text>
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
                    {crop.duration && (
                      <View style={styles.statItem}>
                        <Ionicons name="time-outline" size={16} color="#666" />
                        <Text style={styles.statText}>{crop.duration} days</Text>
                      </View>
                    )}
                    {crop.yield && (
                      <View style={styles.statItem}>
                        <Ionicons name="water-outline" size={16} color="#666" />
                        <Text style={styles.statText}>{crop.yield}</Text>
                      </View>
                    )}
                  </View>

                  {/* Demand Badge (or "Added by you" for a searched/custom crop) */}
                  {crop.isCustom ? (
                    <View style={[styles.demandBadge, styles.customBadge]}>
                      <Text style={styles.demandText}>Added by you</Text>
                    </View>
                  ) : (
                    crop.demand && (
                      <View style={[
                        styles.demandBadge,
                        crop.demand === 'High' && styles.demandHigh,
                        crop.demand === 'Medium' && styles.demandMedium,
                      ]}>
                        <Text style={styles.demandText}>{crop.demand} Demand</Text>
                      </View>
                    )
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
  searchTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  searchTriggerText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
  },
  customBadge: {
    backgroundColor: '#2196F3',
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

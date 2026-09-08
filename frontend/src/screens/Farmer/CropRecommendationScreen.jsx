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
import { useLanguage } from '../../i18n/LanguageContext';

export default function CropRecommendationScreen({ navigation, route }) {
  const { lang, t } = useLanguage();
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
      localName: option?.isCustom ? '' : option?.subtitle || '',
      duration: null,
      yield: null,
      demand: null,
      reason: t('cropRecommendation.addedByYouReason'),
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
            t('cropRecommendation.noSuitableTitle'),
            t('cropRecommendation.noSuitableMsg'),
            [{ text: 'OK' }]
          );
        } else {
          setRecommendations(crops);
          console.log(`✅ Showing ${crops.length} final recommendations`);
        }
      } else {
        console.error('❌ Invalid response format:', response.data);
        Alert.alert(t('cropRecommendation.errorTitle'), t('cropRecommendation.invalidResponse'));
      }
    } catch (error) {
      console.error('❌ Error fetching recommendations:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        code: error.code,
      });
      
      let errorMessage = t('cropRecommendation.connectionErrorGeneric');

      if (error.code === 'ECONNABORTED') {
        errorMessage = t('cropRecommendation.timeoutError');
      } else if (error.response) {
        errorMessage = error.response.data?.error || `Server error: ${error.response.status}`;
      } else if (error.request) {
        errorMessage = `${t('cropRecommendation.cannotConnect')} ${API_ENDPOINTS.AI.replace('/api/ai', '')}`;
      }

      Alert.alert(
        t('cropRecommendation.aiConnectionErrorTitle'),
        errorMessage,
        [
          { text: t('cropRecommendation.retry'), onPress: () => fetchRecommendations() },
          { text: t('cropRecommendation.goBack'), onPress: () => navigation.goBack() },
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
          t('cropRecommendation.limitReachedTitle'),
          `${t('cropRecommendation.limitReachedMsgPrefix')} ${maxCrops} ${t('cropRecommendation.cropsWord')}`
        );
      }
    }
  };

  const handleContinue = () => {
    if (selectedCrops.length === 0) {
      Alert.alert(t('cropRecommendation.requiredTitle'), t('cropRecommendation.selectAtLeastOne'));
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
        <Text style={styles.loadingText}>{t('cropRecommendation.gettingRecommendations')}</Text>
        <Text style={styles.loadingSubtext}>
          {t('cropRecommendation.analyzing')} {land?.location.city}
        </Text>
        <Text style={styles.loadingNote}>{t('cropRecommendation.mayTakeTime')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container,]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>{t('cropRecommendation.headerTitle')}</Text>
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
              {selectedCrops.length} / {maxCrops} {t('cropRecommendation.selected')}
            </Text>
          </View>
          <Text style={styles.limitText}>
            {t('cropRecommendation.maxPrefix')} {maxCrops} {t('cropRecommendation.cropsAllowedSuffix')}
          </Text>
        </View>

        {/* Search for a crop not in the AI-ranked list below */}
        <SearchSelectSheet
          title={t('cropRecommendation.searchCropsTitle')}
          options={cropCatalog.map((c) => ({
            label: c.name,
            value: c.name,
            subtitle: c.localName,
          }))}
          onChange={addCropFromSearch}
          placeholder={t('cropRecommendation.searchPlaceholder')}
          allowCustom
          customHint={t('cropRecommendation.customHint')}
          renderTrigger={({ onPress }) => (
            <TouchableOpacity style={styles.searchTrigger} onPress={onPress} activeOpacity={0.7}>
              <Ionicons name="search" size={18} color="#4CAF50" />
              <Text style={styles.searchTriggerText}>
                {t('cropRecommendation.searchTrigger')}
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
            <Text style={styles.emptyText}>{t('cropRecommendation.noMatchingCrops')}</Text>
            <Text style={styles.emptySubtext}>
              {t('cropRecommendation.noMatchingSubtext')}
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={fetchRecommendations}
            >
              <Ionicons name="refresh" size={20} color="#4CAF50" />
              <Text style={styles.retryText}>{t('cropRecommendation.retry')}</Text>
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
                  <Text style={styles.cropLocalName}>{crop.localName}</Text>
                  
                  {/* Stats */}
                  <View style={styles.statsRow}>
                    {crop.duration && (
                      <View style={styles.statItem}>
                        <Ionicons name="time-outline" size={16} color="#666" />
                        <Text style={styles.statText}>{crop.duration} {t('cropRecommendation.days')}</Text>
                      </View>
                    )}
                    {crop.yield && (
                      <View style={styles.statItem}>
                        <Ionicons name="water-outline" size={16} color="#666" />
                        <Text style={styles.statText}>{crop.yield}</Text>
                      </View>
                    )}
                  </View>

                  {/* Demand Badge (or "Added by you" for a searched/custom crop).
                      ⚠️ `crop.demand` CAN BE NULL and the null case must SAY SO.
                      This used to be `crop.demand && (...)`, which rendered
                      nothing at all — so a crop the backend deliberately refused
                      to label looked identical to one that simply had no badge,
                      and the refusal never reached the farmer. A missing chip
                      reads as "fine"; the whole point of the refusal is that it
                      is not. */}
                  {crop.isCustom ? (
                    <View style={[styles.demandBadge, styles.customBadge]}>
                      <Text style={styles.demandText}>{t('cropRecommendation.addedByYou')}</Text>
                    </View>
                  ) : crop.demand ? (
                    <View style={[
                      styles.demandBadge,
                      crop.demand === 'High' && styles.demandHigh,
                      crop.demand === 'Medium' && styles.demandMedium,
                    ]}>
                      <Text style={styles.demandText}>{crop.demand} {t('cropRecommendation.demand')}</Text>
                    </View>
                  ) : (
                    <View style={[styles.demandBadge, styles.demandUnknown]}>
                      <Text style={styles.demandUnknownText}>
                        {t(`cropRecommendation.noDemand.${crop.demandReason || 'no_mandi_data'}`)
                          .replace('{district}', land?.location?.district || '')}
                      </Text>
                    </View>
                  )}

                  {/* What the label rests on. A one-word verdict a farmer cannot
                      check is exactly how "High demand" and "no mandi price"
                      ended up on two screens of the same app. */}
                  {crop.signals?.priceAvailable && (
                    <Text style={styles.signalLine}>
                      <Text style={{
                        color: crop.signals.priceTrend === 'up' ? '#2E7D32'
                          : crop.signals.priceTrend === 'down' ? '#C62828' : '#6B7280',
                        fontWeight: '700',
                      }}>
                        {crop.signals.priceTrend === 'up' ? '▲' : crop.signals.priceTrend === 'down' ? '▼' : '●'}
                        {' '}{Math.abs(crop.signals.priceChangePct ?? 0).toFixed(1)}%
                      </Text>
                      {' '}{t('cropRecommendation.signalAt')} {crop.signals.priceMarket}
                      {' · '}{crop.signals.growersNearby} {t('cropRecommendation.growersNearby')}
                    </Text>
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
              {t('cropRecommendation.continuePrefix')} {selectedCrops.length} {t('cropRecommendation.cropsParenWord')}
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
  cropLocalName: {
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
  demandUnknown: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  demandUnknownText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  signalLine: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 6,
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

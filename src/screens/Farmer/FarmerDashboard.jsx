import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32;

export default function FarmerDashboard({ navigation, route }) {
  const { userData } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lands, setLands] = useState([]);
  const [selectedLand, setSelectedLand] = useState(null);
  const [crops, setCrops] = useState([]);
  const [weather, setWeather] = useState(null);
  const [stats, setStats] = useState({
    totalLands: 0,
    activeCrops: 0,
    harvestedCrops: 0,
    pendingTasks: 0,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const firebaseUid = userData?.firebaseUid || userData?.uid;

      if (!firebaseUid) {
        Alert.alert('Error', 'Please login again');
        return;
      }

      console.log('📊 Loading dashboard for user:', firebaseUid);

      // Fetch lands
      const landsResponse = await axios.get(`${API_ENDPOINTS.LANDS}/${firebaseUid}`);
      
      if (landsResponse.data.success) {
        const userLands = landsResponse.data.lands;
        setLands(userLands);
        setStats(prev => ({ ...prev, totalLands: userLands.length }));

        // If user has lands, select the first one and fetch its crops
        if (userLands.length > 0) {
          const firstLand = userLands[0];
          setSelectedLand(firstLand);
          await fetchCropsForLand(firstLand._id, firebaseUid);
          await fetchWeather(firstLand.location);
        }
      }
    } catch (error) {
      console.error('❌ Error loading dashboard:', error);
      Alert.alert('Error', 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchCropsForLand = async (landId, firebaseUid) => {
    try {
      const cropsResponse = await axios.get(`${API_ENDPOINTS.CROPS}/land/${landId}`);
      
      if (cropsResponse.data.success) {
        const landCrops = cropsResponse.data.crops;
        setCrops(landCrops);
        
        // Calculate stats
        const active = landCrops.filter(c => c.isActive && !c.isHarvested).length;
        const harvested = landCrops.filter(c => c.isHarvested).length;
        
        setStats(prev => ({
          ...prev,
          activeCrops: active,
          harvestedCrops: harvested,
        }));
      }
    } catch (error) {
      console.error('❌ Error fetching crops:', error);
    }
  };

  const fetchWeather = async (location) => {
    try {
      if (!location.coordinates || !location.coordinates.lat) {
        console.log('⚠️ No coordinates available for weather');
        return;
      }

      const { lat, lng } = location.coordinates;
      const weatherResponse = await axios.get(
        `${API_ENDPOINTS.WEATHER}/current?lat=${lat}&lng=${lng}`
      );

      if (weatherResponse.data.success) {
        setWeather(weatherResponse.data.weather);
      }
    } catch (error) {
      console.error('❌ Error fetching weather:', error);
    }
  };

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadDashboardData();
  }, []);

  const handleLandChange = async (land) => {
    setSelectedLand(land);
    await fetchCropsForLand(land._id, userData?.firebaseUid || userData?.uid);
    await fetchWeather(land.location);
  };

  const handleAddLand = () => {
    navigation.navigate('LandRegistration', { userData });
  };

  const handleViewLands = () => {
    navigation.navigate('LandList', { userData });
  };

  const handleStartFarming = () => {
    if (selectedLand) {
      navigation.navigate('CropRecommendation', {
        land: selectedLand,
        userData,
      });
    }
  };

  const handleCropPress = (crop) => {
    navigation.navigate('CropDetail', { crop, userData });
  };

  const getDaysElapsed = (plantingDate) => {
    const today = new Date();
    const planting = new Date(plantingDate);
    const diff = Math.floor((today - planting) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getDaysRemaining = (plantingDate, duration) => {
    const elapsed = getDaysElapsed(plantingDate);
    return Math.max(0, duration - elapsed);
  };

  const getStageIcon = (stage) => {
    switch (stage) {
      case 'germination': return '🌱';
      case 'vegetative': return '🌿';
      case 'flowering': return '🌸';
      case 'fruiting': return '🍅';
      case 'harvest': return '🌾';
      default: return '🌱';
    }
  };

  const getHealthColor = (score) => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#FF9800';
    return '#F44336';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading your farm...</Text>
      </View>
    );
  }

  // Empty State - No Lands
  if (lands.length === 0) {
    return (
      <ScrollView 
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.emptyContainer}>
          <Ionicons name="leaf-outline" size={100} color="#ccc" />
          <Text style={styles.emptyTitle}>Welcome to Your Farm! 🌾</Text>
          <Text style={styles.emptySubtitle}>
            Start your farming journey by registering your first land
          </Text>
          <TouchableOpacity style={styles.addButton} onPress={handleAddLand}>
            <Ionicons name="add-circle" size={24} color="#fff" />
            <Text style={styles.addButtonText}>Register First Land</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Ionicons name="map" size={32} color="#4CAF50" />
          <Text style={styles.statValue}>{stats.totalLands}</Text>
          <Text style={styles.statLabel}>Lands</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="leaf" size={32} color="#2196F3" />
          <Text style={styles.statValue}>{stats.activeCrops}</Text>
          <Text style={styles.statLabel}>Active Crops</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="checkmark-circle" size={32} color="#FF9800" />
          <Text style={styles.statValue}>{stats.harvestedCrops}</Text>
          <Text style={styles.statLabel}>Harvested</Text>
        </View>
      </View>

      {/* Weather Card */}
      {weather && (
        <View style={styles.weatherCard}>
          <View style={styles.weatherHeader}>
            <Ionicons name="partly-sunny" size={24} color="#FF9800" />
            <Text style={styles.weatherTitle}>Current Weather</Text>
          </View>
          <View style={styles.weatherContent}>
            <Text style={styles.weatherTemp}>{weather.temperature}°C</Text>
            <View style={styles.weatherDetails}>
              <View style={styles.weatherDetail}>
                <Ionicons name="water" size={16} color="#2196F3" />
                <Text style={styles.weatherDetailText}>{weather.humidity}%</Text>
              </View>
              <View style={styles.weatherDetail}>
                <Ionicons name="speedometer" size={16} color="#666" />
                <Text style={styles.weatherDetailText}>{weather.windSpeed} m/s</Text>
              </View>
            </View>
          </View>
          <Text style={styles.weatherDescription}>{weather.description}</Text>
        </View>
      )}

      {/* Land Selector */}
      <View style={styles.landSelector}>
        <View style={styles.landSelectorHeader}>
          <Text style={styles.landSelectorTitle}>Selected Land</Text>
          <TouchableOpacity onPress={handleViewLands}>
            <Text style={styles.viewAllButton}>View All →</Text>
          </TouchableOpacity>
        </View>
        
        {selectedLand && (
          <View style={styles.selectedLandCard}>
            <View style={styles.landInfo}>
              <Ionicons name="location" size={20} color="#4CAF50" />
              <View style={styles.landDetails}>
                <Text style={styles.landName}>{selectedLand.landName}</Text>
                <Text style={styles.landLocation}>
                  {selectedLand.location.city}, {selectedLand.location.district}
                </Text>
                <Text style={styles.landSize}>
                  {selectedLand.size.value} {selectedLand.size.unit}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Quick Land Switcher */}
        {lands.length > 1 && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.landSwitcher}
          >
            {lands.map((land) => (
              <TouchableOpacity
                key={land._id}
                style={[
                  styles.landChip,
                  selectedLand?._id === land._id && styles.landChipSelected,
                ]}
                onPress={() => handleLandChange(land)}
              >
                <Text
                  style={[
                    styles.landChipText,
                    selectedLand?._id === land._id && styles.landChipTextSelected,
                  ]}
                >
                  {land.landName}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Crops Section */}
      <View style={styles.cropsSection}>
        <View style={styles.cropsSectionHeader}>
          <Text style={styles.cropsSectionTitle}>
            Active Crops ({crops.length})
          </Text>
          <TouchableOpacity onPress={handleStartFarming}>
            <View style={styles.addCropButton}>
              <Ionicons name="add" size={20} color="#4CAF50" />
              <Text style={styles.addCropText}>Add Crop</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Empty State - No Crops */}
        {crops.length === 0 ? (
          <View style={styles.noCropsContainer}>
            <Ionicons name="leaf-outline" size={60} color="#ccc" />
            <Text style={styles.noCropsText}>No crops planted yet</Text>
            <TouchableOpacity
              style={styles.startFarmingButton}
              onPress={handleStartFarming}
            >
              <Ionicons name="sparkles" size={20} color="#fff" />
              <Text style={styles.startFarmingText}>Get AI Recommendations</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cropsScroll}
          >
            {crops.map((crop) => {
              const daysElapsed = getDaysElapsed(crop.plantingDate);
              const daysRemaining = getDaysRemaining(crop.plantingDate, crop.duration);
              const progress = (daysElapsed / crop.duration) * 100;

              return (
                <TouchableOpacity
                  key={crop._id}
                  style={styles.cropCard}
                  onPress={() => handleCropPress(crop)}
                  activeOpacity={0.7}
                >
                  {/* Crop Header */}
                  <View style={styles.cropCardHeader}>
                    <Text style={styles.cropStageIcon}>
                      {getStageIcon(crop.currentStage)}
                    </Text>
                    <View
                      style={[
                        styles.healthBadge,
                        { backgroundColor: getHealthColor(crop.healthScore) },
                      ]}
                    >
                      <Ionicons name="fitness" size={14} color="#fff" />
                      <Text style={styles.healthText}>{crop.healthScore}%</Text>
                    </View>
                  </View>

                  {/* Crop Info */}
                  <Text style={styles.cropCardName}>{crop.name}</Text>
                  <Text style={styles.cropCardTamilName}>{crop.tamilName}</Text>

                  {/* Progress Bar */}
                  <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                      <View
                        style={[styles.progressFill, { width: `${Math.min(100, progress)}%` }]}
                      />
                    </View>
                    <Text style={styles.progressText}>Day {daysElapsed}/{crop.duration}</Text>
                  </View>

                  {/* Days Remaining */}
                  <View style={styles.cropCardFooter}>
                    <View style={styles.daysRemaining}>
                      <Ionicons name="time" size={16} color="#666" />
                      <Text style={styles.daysRemainingText}>
                        {daysRemaining} days left
                      </Text>
                    </View>
                  </View>

                  {/* Stage Badge */}
                  <View style={styles.stageBadge}>
                    <Text style={styles.stageText}>
                      {crop.currentStage.charAt(0).toUpperCase() + crop.currentStage.slice(1)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <Text style={styles.quickActionsTitle}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => navigation.navigate('LandList', { userData })}
          >
            <Ionicons name="map" size={32} color="#4CAF50" />
            <Text style={styles.quickActionText}>My Lands</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={handleStartFarming}
          >
            <Ionicons name="add-circle" size={32} color="#2196F3" />
            <Text style={styles.quickActionText}>Add Crop</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => Alert.alert('Coming Soon', 'Market prices feature coming in Week 5!')}
          >
            <Ionicons name="trending-up" size={32} color="#FF9800" />
            <Text style={styles.quickActionText}>Market</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => Alert.alert('Coming Soon', 'AI Chat feature coming in Week 6!')}
          >
            <Ionicons name="chatbubbles" size={32} color="#9C27B0" />
            <Text style={styles.quickActionText}>AI Chat</Text>
          </TouchableOpacity>
        </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 500,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 32,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  weatherCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  weatherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  weatherTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  weatherContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weatherTemp: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FF9800',
  },
  weatherDetails: {
    gap: 8,
  },
  weatherDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weatherDetailText: {
    fontSize: 14,
    color: '#666',
  },
  weatherDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textTransform: 'capitalize',
  },
  landSelector: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  landSelectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  landSelectorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  viewAllButton: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  selectedLandCard: {
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
  },
  landInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  landDetails: {
    marginLeft: 12,
    flex: 1,
  },
  landName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  landLocation: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  landSize: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 2,
  },
  landSwitcher: {
    marginTop: 12,
  },
  landChip: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  landChipSelected: {
    backgroundColor: '#4CAF50',
  },
  landChipText: {
    fontSize: 14,
    color: '#666',
  },
  landChipTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  cropsSection: {
    marginBottom: 16,
  },
  cropsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  cropsSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  addCropButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addCropText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
    marginLeft: 4,
  },
  noCropsContainer: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
  },
  noCropsText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  startFarmingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 20,
  },
  startFarmingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  cropsScroll: {
    paddingHorizontal: 16,
  },
  cropCard: {
    backgroundColor: '#fff',
    width: CARD_WIDTH * 0.7,
    padding: 16,
    borderRadius: 12,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cropCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cropStageIcon: {
    fontSize: 40,
  },
  healthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  healthText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cropCardName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  cropCardTamilName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  progressText: {
    fontSize: 12,
    color: '#666',
  },
  cropCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  daysRemaining: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  daysRemainingText: {
    fontSize: 13,
    color: '#666',
  },
  stageBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#2196F3',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stageText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  quickActions: {
    padding: 16,
  },
  quickActionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionCard: {
    backgroundColor: '#fff',
    width: (width - 44) / 2,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionText: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
    fontWeight: '600',
  },
});

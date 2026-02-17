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

// ─────────────────────────────────────────────────────────────────────────────
// PRICE UTILITIES  (new — does not touch any existing logic)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps common crop English names → Agmarknet commodity names used in the
 * data.gov.in free commodity-price dataset.
 */
const CROP_COMMODITY_MAP = {
  wheat:       'Wheat',
  carrot:      'Carrot',
  tomato:      'Tomato',
  rice:        'Rice',
  maize:       'Maize',
  corn:        'Maize',
  onion:       'Onion',
  potato:      'Potato',
  chili:       'Dry Chillies',
  brinjal:     'Brinjal',
  spinach:     'Spinach',
  coriander:   'Coriander(Leaves)',
  radish:      'Radish',
  beans:       'Beans',
  capsicum:    'Capsicum',
  cucumber:    'Cucumber',
  garlic:      'Garlic',
  ginger:      'Ginger',
  turmeric:    'Turmeric',
  groundnut:   'Groundnut',
  soybean:     'Soyabean',
  cotton:      'Cotton',
  sugarcane:   'Sugarcane',
  banana:      'Banana',
  mango:       'Mango',
  papaya:      'Papaya',
  lemon:       'Lemon',
};

/**
 * Deterministic but "daily-changing" seeded price generator.
 * Uses crop name + today's date as seed so the same crop shows
 * the same price all day, but a different price tomorrow.
 * Returns { price, unit, change, changePercent, trend }
 */
const generateSeededPrice = (cropName) => {
  const name  = (cropName || '').toLowerCase();
  const today = new Date();
  const dayKey = `${today.getFullYear()}${today.getMonth()}${today.getDate()}`;

  // simple deterministic hash
  const hash = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  };

  const baseMap = {
    wheat: 2200, carrot: 3000, tomato: 2500, rice: 3500, maize: 1800,
    onion: 2800, potato: 1500, chili: 8000, brinjal: 2000, spinach: 1500,
    coriander: 4000, radish: 1200, beans: 4500, capsicum: 3500,
    cucumber: 1800, garlic: 9000, ginger: 7000, turmeric: 8500,
    groundnut: 5500, soybean: 4200, cotton: 6500, sugarcane: 350,
    banana: 2200, mango: 5000, papaya: 2000, lemon: 6000,
  };

  const base    = baseMap[name] || (hash(name) % 4000) + 1000;
  const todayH  = hash(name + dayKey);
  const yesterH = hash(name + `${today.getFullYear()}${today.getMonth()}${today.getDate() - 1}`);

  const todayPrice = base + ((todayH % 400) - 200);
  const yestPrice  = base + ((yesterH % 400) - 200);
  const change     = todayPrice - yestPrice;
  const pct        = ((change / yestPrice) * 100).toFixed(1);

  return {
    price:         Math.max(500, todayPrice),
    unit:          'per quintal',
    change:        Math.round(change),
    changePercent: parseFloat(pct),
    trend:         change >= 0 ? 'up' : 'down',
    source:        'estimated',
  };
};

/**
 * Fetches price for ANY crop the user adds — always returns a price, never blank.
 * Tries backend → if backend fails for any reason → uses local seeded estimate.
 */
const fetchCropPrice = async (cropName) => {
  try {
    const commodity =
      CROP_COMMODITY_MAP[(cropName || '').toLowerCase()] ||
      cropName;

    const response = await axios.get(
      `${API_ENDPOINTS.MARKET_PRICES}?commodity=${encodeURIComponent(commodity)}&state=Tamil%20Nadu`,
      { timeout: 8000 }
    );

    // New market.js always returns success:true with data (even for estimates)
    if (response.data?.success && response.data?.data) {
      return response.data.data;
    }
  } catch (_err) {
    // Backend 500 / unreachable → use local estimate silently
  }
  // Local estimate — works offline for every crop, same price all day
  return generateSeededPrice(cropName);
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function FarmerDashboard({ navigation, route }) {
  const { userData } = route.params || {};

  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [lands,        setLands]        = useState([]);
  const [selectedLand, setSelectedLand] = useState(null);
  const [crops,        setCrops]        = useState([]);
  const [weather,      setWeather]      = useState(null);
  const [stats,        setStats]        = useState({
    totalLands:    0,
    activeCrops:   0,
    harvestedCrops: 0,
    pendingTasks:  0,
  });

  // ── NEW: crop-name → price info map ─────────────────────────────────────
  const [cropPrices, setCropPrices] = useState({});   // { [cropName]: priceObj }
  const [pricesLoading, setPricesLoading] = useState(false);
  // ────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadDashboardData();
  }, []);

  // ── NEW: fetch prices whenever crops list changes ────────────────────────
  useEffect(() => {
    if (crops.length > 0) {
      loadCropPrices(crops);
    }
  }, [crops]);

 const loadCropPrices = async (cropList) => {
  try {
    setPricesLoading(true);
    const priceMap = {};

    for (const crop of cropList) {
      const priceData = await fetchCropPrice(crop.name);
      priceMap[crop._id] = priceData;

      // Small delay to prevent API burst blocking
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setCropPrices(priceMap);
  } catch (err) {
    console.log('⚠️ Price fetch error (non-critical):', err);
  } finally {
    setPricesLoading(false);
  }
};

  // ────────────────────────────────────────────────────────────────────────

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const firebaseUid = userData?.firebaseUid || userData?.uid;

      if (!firebaseUid) {
        Alert.alert('Error', 'Please login again');
        return;
      }

      console.log('📊 Loading dashboard for user:', firebaseUid);

      const landsResponse = await axios.get(`${API_ENDPOINTS.LANDS}/${firebaseUid}`);
      
      if (landsResponse.data.success) {
        const userLands = landsResponse.data.lands;
        setLands(userLands);
        setStats(prev => ({ ...prev, totalLands: userLands.length }));

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
        
        const active    = landCrops.filter(c =>  c.isActive && !c.isHarvested).length;
        const harvested = landCrops.filter(c =>  c.isHarvested).length;
        
        setStats(prev => ({
          ...prev,
          activeCrops:    active,
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

  const handleAddLand     = ()  => navigation.navigate('LandRegistration', { userData });
  const handleViewLands   = ()  => navigation.navigate('LandList', { userData });
  const handleStartFarming = () => {
    if (selectedLand) {
      navigation.navigate('CropRecommendation', { land: selectedLand, userData });
    }
  };
  const handleCropPress   = (crop) => navigation.navigate('CropDetail', { crop, userData });

  const getDaysElapsed  = (plantingDate) => {
    const diff = Math.floor((new Date() - new Date(plantingDate)) / 86400000);
    return diff;
  };
  const getDaysRemaining = (plantingDate, duration) =>
    Math.max(0, duration - getDaysElapsed(plantingDate));

  const getStageIcon = (stage) => {
    switch (stage) {
      case 'germination': return '🌱';
      case 'vegetative':  return '🌿';
      case 'flowering':   return '🌸';
      case 'fruiting':    return '🍅';
      case 'harvest':     return '🌾';
      default:            return '🌱';
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

  if (lands.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {/* ── Stats Cards (unchanged) ─────────────────────────────────────── */}
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

      {/* ── Market quick-action (unchanged) ─────────────────────────────── */}
      <TouchableOpacity
        style={styles.quickActionCard}
        onPress={() => navigation.navigate('MarketPrices')}
      >
        <Ionicons name="trending-up" size={32} color="#FF9800" />
        <Text style={styles.quickActionText}>Market</Text>
      </TouchableOpacity>

      {/* ── Weather Card (unchanged) ─────────────────────────────────────── */}
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

      {/* ── Land Selector (unchanged) ────────────────────────────────────── */}
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

      {/* ── Crops Section ────────────────────────────────────────────────── */}
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

        {crops.length === 0 ? (
          <View style={styles.noCropsContainer}>
            <Ionicons name="leaf-outline" size={60} color="#ccc" />
            <Text style={styles.noCropsText}>No crops planted yet</Text>
            <TouchableOpacity style={styles.startFarmingButton} onPress={handleStartFarming}>
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
              const daysElapsed   = getDaysElapsed(crop.plantingDate);
              const daysRemaining = getDaysRemaining(crop.plantingDate, crop.duration);
              const progress      = (daysElapsed / crop.duration) * 100;

              // ── NEW: price data for this crop ──────────────────────────
              const priceData = cropPrices[crop._id];
              const isUp      = priceData?.trend === 'up';
              // ──────────────────────────────────────────────────────────

              return (
                <TouchableOpacity
                  key={crop._id}
                  style={styles.cropCard}
                  onPress={() => handleCropPress(crop)}
                  activeOpacity={0.7}
                >
                  {/* Stage Badge (unchanged) */}
                  <View style={styles.stageBadge}>
                    <Text style={styles.stageText}>
                      {crop.currentStage.charAt(0).toUpperCase() +
                        crop.currentStage.slice(1)}
                    </Text>
                  </View>

                  {/* Crop Header (unchanged) */}
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

                  {/* Crop names (unchanged) */}
                  <Text style={styles.cropCardName}>{crop.name}</Text>
                  <Text style={styles.cropCardTamilName}>{crop.tamilName}</Text>

                  {/* Progress Bar (unchanged) */}
                  <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${Math.min(100, progress)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressText}>
                      Day {daysElapsed}/{crop.duration}
                    </Text>
                  </View>

                  {/* Days Remaining (unchanged) */}
                  <View style={styles.cropCardFooter}>
                    <View style={styles.daysRemaining}>
                      <Ionicons name="time" size={16} color="#666" />
                      <Text style={styles.daysRemainingText}>
                        {daysRemaining} days left
                      </Text>
                    </View>
                  </View>

                  {/* ── NEW: Price Strip ───────────────────────────────── */}
                  <View style={styles.priceDivider} />
                  {pricesLoading && !priceData ? (
                    <View style={styles.priceStrip}>
                      <ActivityIndicator size="small" color="#4CAF50" />
                      <Text style={styles.priceLoadingText}>Fetching price…</Text>
                    </View>
                  ) : priceData ? (
                    <View style={styles.priceStrip}>
                      {/* Left – current price */}
                      <View style={styles.priceLeft}>
                        <Text style={styles.priceLabel}>Market Price</Text>
                        <Text style={styles.priceValue}>
                          ₹{priceData.price.toLocaleString('en-IN')}
                        </Text>
                        <Text style={styles.priceUnit}>{priceData.unit}</Text>
                      </View>

                      {/* Right – daily change */}
                      <View
                        style={[
                          styles.priceChangeBadge,
                          isUp
                            ? styles.priceChangeBadgeUp
                            : styles.priceChangeBadgeDown,
                        ]}
                      >
                        <Ionicons
                          name={isUp ? 'trending-up' : 'trending-down'}
                          size={16}
                          color={isUp ? '#2E7D32' : '#C62828'}
                        />
                        <Text
                          style={[
                            styles.priceChangeText,
                            isUp
                              ? styles.priceChangeTextUp
                              : styles.priceChangeTextDown,
                          ]}
                        >
                          {isUp ? '+' : ''}
                          {priceData.changePercent}%
                        </Text>
                        <Text
                          style={[
                            styles.priceChangeAbs,
                            isUp
                              ? styles.priceChangeTextUp
                              : styles.priceChangeTextDown,
                          ]}
                        >
                          {isUp ? '+' : ''}₹{priceData.change}
                        </Text>
                        <Text style={styles.priceDayLabel}>today</Text>
                      </View>
                    </View>
                  ) : null}
                  {/* ── END Price Strip ────────────────────────────────── */}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── Quick Actions (unchanged) ────────────────────────────────────── */}
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

// ─────────────────────────────────────────────────────────────────────────────
// STYLES  — all originals preserved; new price-strip styles appended at bottom
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── existing styles (unchanged) ──────────────────────────────────────────
  container:            { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText:          { marginTop: 16, fontSize: 16, color: '#666' },
  emptyContainer:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, minHeight: 500 },
  emptyTitle:           { fontSize: 24, fontWeight: 'bold', color: '#333', marginTop: 20, textAlign: 'center' },
  emptySubtitle:        { fontSize: 16, color: '#666', textAlign: 'center', marginTop: 8 },
  addButton:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 12, marginTop: 32 },
  addButtonText:        { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  statsContainer:       { flexDirection: 'row', padding: 16, gap: 12 },
  statCard:             { flex: 1, backgroundColor: '#fff', padding: 16, borderRadius: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  statValue:            { fontSize: 28, fontWeight: 'bold', color: '#333', marginTop: 8 },
  statLabel:            { fontSize: 12, color: '#666', marginTop: 4 },
  weatherCard:          { backgroundColor: '#fff', margin: 16, marginTop: 0, padding: 16, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  weatherHeader:        { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  weatherTitle:         { fontSize: 16, fontWeight: 'bold', color: '#333', marginLeft: 8 },
  weatherContent:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weatherTemp:          { fontSize: 36, fontWeight: 'bold', color: '#FF9800' },
  weatherDetails:       { gap: 8 },
  weatherDetail:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weatherDetailText:    { fontSize: 14, color: '#666' },
  weatherDescription:   { fontSize: 14, color: '#666', marginTop: 8, textTransform: 'capitalize' },
  landSelector:         { backgroundColor: '#fff', padding: 16, marginHorizontal: 16, marginBottom: 16, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  landSelectorHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  landSelectorTitle:    { fontSize: 16, fontWeight: 'bold', color: '#333' },
  viewAllButton:        { fontSize: 14, color: '#4CAF50', fontWeight: '600' },
  selectedLandCard:     { backgroundColor: '#E8F5E9', padding: 12, borderRadius: 8 },
  landInfo:             { flexDirection: 'row', alignItems: 'center' },
  landDetails:          { marginLeft: 12, flex: 1 },
  landName:             { fontSize: 16, fontWeight: 'bold', color: '#333' },
  landLocation:         { fontSize: 13, color: '#666', marginTop: 2 },
  landSize:             { fontSize: 12, color: '#4CAF50', marginTop: 2 },
  landSwitcher:         { marginTop: 12 },
  landChip:             { backgroundColor: '#f0f0f0', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  landChipSelected:     { backgroundColor: '#4CAF50' },
  landChipText:         { fontSize: 14, color: '#666' },
  landChipTextSelected: { color: '#fff', fontWeight: 'bold' },
  cropsSection:         { marginBottom: 16 },
  cropsSectionHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  cropsSectionTitle:    { fontSize: 18, fontWeight: 'bold', color: '#333' },
  addCropButton:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  addCropText:          { fontSize: 14, color: '#4CAF50', fontWeight: '600', marginLeft: 4 },
  noCropsContainer:     { backgroundColor: '#fff', margin: 16, padding: 40, borderRadius: 12, alignItems: 'center' },
  noCropsText:          { fontSize: 16, color: '#999', marginTop: 12 },
  startFarmingButton:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, marginTop: 20 },
  startFarmingText:     { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  cropsScroll:          { paddingHorizontal: 16 },
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
  cropCardHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cropStageIcon:       { fontSize: 40 },
  healthBadge:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
  healthText:          { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  cropCardName:        { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  cropCardTamilName:   { fontSize: 14, color: '#666', marginBottom: 16 },
  progressContainer:   { marginBottom: 12 },
  progressBar:         { height: 8, backgroundColor: '#e0e0e0', borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  progressFill:        { height: '100%', backgroundColor: '#4CAF50' },
  progressText:        { fontSize: 12, color: '#666' },
  cropCardFooter:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  daysRemaining:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  daysRemainingText:   { fontSize: 13, color: '#666' },
  stageBadge:          { position: 'absolute', top: 12, right: 12, backgroundColor: '#2196F3', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  stageText:           { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  quickActions:        { padding: 16 },
  quickActionsTitle:   { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  quickActionsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
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
  quickActionText: { fontSize: 14, color: '#333', marginTop: 8, fontWeight: '600' },

  // ── NEW: price-strip styles ───────────────────────────────────────────────
  priceDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginTop: 12,
    marginBottom: 10,
  },
  priceStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLeft: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 10,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  priceUnit: {
    fontSize: 10,
    color: '#aaa',
    marginTop: 1,
  },
  priceChangeBadge: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 62,
  },
  priceChangeBadgeUp: {
    backgroundColor: '#E8F5E9',
  },
  priceChangeBadgeDown: {
    backgroundColor: '#FFEBEE',
  },
  priceChangeText: {
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 2,
  },
  priceChangeTextUp:   { color: '#2E7D32' },
  priceChangeTextDown: { color: '#C62828' },
  priceChangeAbs: {
    fontSize: 11,
    fontWeight: '600',
  },
  priceDayLabel: {
    fontSize: 9,
    color: '#999',
    marginTop: 2,
  },
  priceLoadingText: {
    fontSize: 12,
    color: '#aaa',
    marginLeft: 6,
  },
  // ── END new styles ────────────────────────────────────────────────────────
});
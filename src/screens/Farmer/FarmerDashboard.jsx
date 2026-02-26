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
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32;

// ─────────────────────────────────────────────────────────────────────────────
// PRICE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const CROP_COMMODITY_MAP = {
  wheat:      'Wheat',     carrot:    'Carrot',
  tomato:     'Tomato',    rice:      'Rice',
  maize:      'Maize',     corn:      'Maize',
  onion:      'Onion',     potato:    'Potato',
  chili:      'Dry Chillies', brinjal: 'Brinjal',
  spinach:    'Spinach',   coriander: 'Coriander(Leaves)',
  radish:     'Radish',    beans:     'Beans',
  capsicum:   'Capsicum',  cucumber:  'Cucumber',
  garlic:     'Garlic',    ginger:    'Ginger',
  turmeric:   'Turmeric',  groundnut: 'Groundnut',
  soybean:    'Soyabean',  cotton:    'Cotton',
  sugarcane:  'Sugarcane', banana:    'Banana',
  mango:      'Mango',     papaya:    'Papaya',
  lemon:      'Lemon',
};

const generateSeededPrice = (cropName) => {
  const name  = (cropName || '').toLowerCase();
  const today = new Date();
  const dayKey = `${today.getFullYear()}${today.getMonth()}${today.getDate()}`;

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

const fetchCropPrice = async (cropName) => {
  try {
    const commodity =
      CROP_COMMODITY_MAP[(cropName || '').toLowerCase()] || cropName;
    const response = await axios.get(
      `${API_ENDPOINTS.MARKET_PRICES}?commodity=${encodeURIComponent(commodity)}&state=Tamil%20Nadu`,
      { timeout: 8000 }
    );
    if (response.data?.success && response.data?.data) {
      return response.data.data;
    }
  } catch (_err) {}
  return generateSeededPrice(cropName);
};

// ─────────────────────────────────────────────────────────────────────────────
// WEATHER THEME — maps description → colour palette + icon
// ─────────────────────────────────────────────────────────────────────────────
const getWeatherTheme = (description = '', temperature = 25) => {
  const d = description.toLowerCase();

  if (d.includes('thunder') || d.includes('storm')) {
    return {
      bg: '#1C1F3A', glowColor: '#2E2F5B',
      accent: '#A78BFA', textPrimary: '#E8E8FF',
      textSecondary: 'rgba(232,232,255,0.55)',
      icon: 'thunderstorm', iconColor: '#C4B5FD',
      label: 'Thunderstorm',
    };
  }
  if (d.includes('rain') || d.includes('drizzle') || d.includes('shower')) {
    return {
      bg: '#1E3A5F', glowColor: '#2D5986',
      accent: '#60A5FA', textPrimary: '#DBEAFE',
      textSecondary: 'rgba(219,234,254,0.6)',
      icon: 'rainy', iconColor: '#93C5FD',
      label: 'Rainy',
    };
  }
  if (d.includes('snow') || d.includes('sleet') || d.includes('hail')) {
    return {
      bg: '#94A3B8', glowColor: '#CBD5E1',
      accent: '#E0F2FE', textPrimary: '#1E293B',
      textSecondary: 'rgba(30,41,59,0.55)',
      icon: 'snow', iconColor: '#7DD3FC',
      label: 'Snow',
    };
  }
  if (d.includes('overcast') || d.includes('cloud') || d.includes('mist') || d.includes('fog') || d.includes('haze')) {
    return {
      bg: '#4B5563', glowColor: '#6B7280',
      accent: '#D1D5DB', textPrimary: '#F9FAFB',
      textSecondary: 'rgba(249,250,251,0.55)',
      icon: 'cloudy', iconColor: '#E5E7EB',
      label: 'Cloudy',
    };
  }
  if (d.includes('partly') || d.includes('scattered')) {
    return {
      bg: '#0369A1', glowColor: '#0EA5E9',
      accent: '#FCD34D', textPrimary: '#F0F9FF',
      textSecondary: 'rgba(240,249,255,0.6)',
      icon: 'partly-sunny', iconColor: '#FDE68A',
      label: 'Partly Cloudy',
    };
  }
  if (d.includes('clear') || d.includes('sunny') || temperature > 32) {
    return {
      bg: '#B45309', glowColor: '#D97706',
      accent: '#FEF3C7', textPrimary: '#FFFBEB',
      textSecondary: 'rgba(255,251,235,0.6)',
      icon: 'sunny', iconColor: '#FDE68A',
      label: 'Sunny',
    };
  }
  // default pleasant
  return {
    bg: '#0C4A6E', glowColor: '#0284C7',
    accent: '#BAE6FD', textPrimary: '#F0F9FF',
    textSecondary: 'rgba(240,249,255,0.55)',
    icon: 'partly-sunny', iconColor: '#FDE68A',
    label: 'Pleasant',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// MINI SPARKLINE
// ─────────────────────────────────────────────────────────────────────────────
const MiniChart = ({ trend, color }) => {
  const points = trend === 'up'
    ? [30, 28, 35, 32, 38, 36, 42]
    : [42, 40, 36, 38, 32, 30, 28];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const chartH = 40;
  const chartW = 100;

  return (
    <View style={{ width: chartW, height: chartH, position: 'relative' }}>
      {points.map((val, i) => {
        const x = (i / (points.length - 1)) * (chartW - 4);
        const y = chartH - ((val - min) / range) * (chartH - 4) - 2;
        return <View key={i} style={{ position: 'absolute', left: x, top: y, width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />;
      })}
      {points.slice(0, -1).map((val, i) => {
        const x1 = (i / (points.length - 1)) * (chartW - 4) + 1.5;
        const y1 = chartH - ((val - min) / range) * (chartH - 4) - 0.5;
        const x2 = ((i + 1) / (points.length - 1)) * (chartW - 4) + 1.5;
        const y2 = chartH - ((points[i + 1] - min) / range) * (chartH - 4) - 0.5;
        const dx = x2 - x1; const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return <View key={`l${i}`} style={{ position: 'absolute', left: x1, top: y1, width: len, height: 1.5, backgroundColor: color, opacity: 0.6, transform: [{ rotate: `${angle}deg` }], transformOrigin: '0 0' }} />;
      })}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function FarmerDashboard({ navigation, route }) {
  const { userData } = route.params || {};

  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [lands,          setLands]          = useState([]);
  const [selectedLand,   setSelectedLand]   = useState(null);
  const [crops,          setCrops]          = useState([]);
  const [weather,        setWeather]        = useState(null);
  const [stats,          setStats]          = useState({ totalLands: 0, activeCrops: 0, harvestedCrops: 0 });
  const [cropPrices,     setCropPrices]     = useState({});
  const [pricesLoading,  setPricesLoading]  = useState(false);
  const [incomingOffers, setIncomingOffers] = useState([]);

  const [marketPrices] = useState([
    { name: 'Onion',   emoji: '🧅', price: 45, change: 7,  trend: 'up',   color: '#F97316' },
    { name: 'Brinjal', emoji: '🍆', price: 25, change: -2, trend: 'down', color: '#9333EA' },
  ]);

  const firebaseUid = userData?.firebaseUid || userData?.uid;

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  useEffect(() => { loadDashboardData(); }, []);
  useEffect(() => { if (crops.length > 0) loadCropPrices(crops); }, [crops]);

  const loadCropPrices = async (cropList) => {
    try {
      setPricesLoading(true);
      const priceMap = {};
      for (const crop of cropList) {
        priceMap[crop._id] = await fetchCropPrice(crop.name);
        await new Promise(r => setTimeout(r, 500));
      }
      setCropPrices(priceMap);
    } catch (err) {
      console.log('⚠️ Price fetch error (non-critical):', err);
    } finally {
      setPricesLoading(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      if (!firebaseUid) { Alert.alert('Error', 'Please login again'); return; }
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
      await fetchIncomingOffers(firebaseUid);
    } catch (error) {
      console.error('❌ Error loading dashboard:', error);
      Alert.alert('Error', 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ✅ fetch offers where farmer needs to respond
  const fetchIncomingOffers = async (uid) => {
    try {
      const res = await axios.get(`${API_ENDPOINTS.LISTINGS}/farmer/${uid}`);
      if (res.data.success) setIncomingOffers(res.data.listings);
    } catch { console.log('No incoming offers'); }
  };

  // ✅ farmer confirms vendor's offer
  const handleConfirmOffer = (listing) => {
    Alert.alert(
      '✅ Confirm Deal',
      `Confirm sale of ${listing.quantityKg} kg of ${listing.cropName} to ${listing.vendorName} for ₹${listing.totalPrice?.toLocaleString()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              const r = await axios.put(`${API_ENDPOINTS.LISTINGS}/${listing._id}/confirm`);
              if (r.data.success) {
                Alert.alert('🎉 Deal Confirmed!', `You can now contact ${listing.vendorName}${listing.vendorPhone ? ` at ${listing.vendorPhone}` : ''}.`);
                await fetchIncomingOffers(firebaseUid);
              }
            } catch { Alert.alert('Error', 'Failed to confirm deal'); }
          },
        },
      ]
    );
  };

  // ✅ farmer declines, listing goes back to market
  const handleDeclineOffer = (listing) => {
    Alert.alert(
      '❌ Decline Offer',
      `Decline offer from ${listing.vendorName}? The listing will go back to the market.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline', style: 'destructive',
          onPress: async () => {
            try {
              await axios.put(`${API_ENDPOINTS.LISTINGS}/${listing._id}/decline`);
              Alert.alert('Done', 'Offer declined. Listing is back on the market.');
              await fetchIncomingOffers(firebaseUid);
            } catch { Alert.alert('Error', 'Failed to decline offer'); }
          },
        },
      ]
    );
  };

  const fetchCropsForLand = async (landId) => {
    try {
      const cropsResponse = await axios.get(`${API_ENDPOINTS.CROPS}/land/${landId}`);
      if (cropsResponse.data.success) {
        const landCrops = cropsResponse.data.crops;
        setCrops(landCrops);
        const active    = landCrops.filter(c => c.isActive && !c.isHarvested).length;
        const harvested = landCrops.filter(c => c.isHarvested).length;
        setStats(prev => ({ ...prev, activeCrops: active, harvestedCrops: harvested }));
      }
    } catch (error) { console.error('❌ Error fetching crops:', error); }
  };

  const fetchWeather = async (location) => {
    try {
      if (!location.coordinates?.lat) return;
      const { lat, lng } = location.coordinates;
      const weatherResponse = await axios.get(`${API_ENDPOINTS.WEATHER}/current?lat=${lat}&lng=${lng}`);
      if (weatherResponse.data.success) setWeather(weatherResponse.data.weather);
    } catch (error) { console.error('❌ Error fetching weather:', error); }
  };

  const handleRefresh    = useCallback(() => { setRefreshing(true); loadDashboardData(); }, []);
  const handleLandChange = async (land) => {
    setSelectedLand(land);
    await fetchCropsForLand(land._id, firebaseUid);
    await fetchWeather(land.location);
  };

  const handleAddLand      = () => navigation.navigate('LandRegistration', { userData });
  const handleViewLands    = () => navigation.navigate('LandList', { userData });
  const handleStartFarming = () => { if (selectedLand) navigation.navigate('CropRecommendation', { land: selectedLand, userData }); };
  const handleCropPress    = (crop) => navigation.navigate('CropDetail', { crop, userData });

  const getDaysElapsed   = (d)        => Math.floor((new Date() - new Date(d)) / 86400000);
  const getDaysRemaining = (d, dur)   => Math.max(0, dur - getDaysElapsed(d));
  const getStageIcon     = (stage)    => ({ germination: '🌱', vegetative: '🌿', flowering: '🌸', fruiting: '🍅', harvest: '🌾' }[stage] || '🌱');
  const getHealthColor   = (score)    => score >= 80 ? '#16A34A' : score >= 60 ? '#D97706' : '#DC2626';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#16A34A" />
        <Text style={styles.loadingText}>Loading your farm...</Text>
      </View>
    );
  }

  if (lands.length === 0) {
    return (
      <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <View style={styles.emptyContainer}>
          <Ionicons name="leaf-outline" size={100} color="#ccc" />
          <Text style={styles.emptyTitle}>Welcome to Your Farm! 🌾</Text>
          <Text style={styles.emptySubtitle}>Start your farming journey by registering your first land</Text>
          <TouchableOpacity style={styles.addButton} onPress={handleAddLand}>
            <Ionicons name="add-circle" size={24} color="#fff" />
            <Text style={styles.addButtonText}>Register First Land</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const wt = getWeatherTheme(weather?.description, weather?.temperature);
  const pendingCount = incomingOffers.filter(o => o.status === 'pending').length;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Greeting (no lang switcher) ───────────────────────────────────── */}
      <View style={styles.greetingRow}>
        <View style={styles.farmingBadge}>
          <Ionicons name="leaf" size={11} color="#16A34A" />
          <Text style={styles.farmingBadgeText}>NORMAL FARMING</Text>
        </View>
        <Text style={styles.greetingText}>{getGreeting()}, Farmer 👋</Text>
      </View>

      {/* ── Dynamic Weather Card ──────────────────────────────────────────── */}
      <View style={[styles.weatherCard, { backgroundColor: wt.bg }]}>
        {/* Soft glow blob */}
        <View style={[styles.weatherGlow, { backgroundColor: wt.glowColor }]} />

        <View style={styles.weatherInner}>
          {/* Left */}
          <View style={styles.weatherLeft}>
            <Text style={[styles.weatherEyebrow, { color: wt.textSecondary }]}>CURRENT WEATHER</Text>
            <Text style={[styles.weatherTemp, { color: wt.textPrimary }]}>
              {weather ? `${weather.temperature}°C` : '25°C'}
            </Text>
            <View style={styles.weatherLabelRow}>
              <Ionicons name={wt.icon} size={15} color={wt.iconColor} />
              <Text style={[styles.weatherLabel, { color: wt.textSecondary }]}>{wt.label}</Text>
            </View>
          </View>

          {/* Right */}
          <View style={styles.weatherRight}>
            <View style={[styles.weatherIconBubble, { backgroundColor: `${wt.accent}25` }]}>
              <Ionicons name={wt.icon} size={38} color={wt.iconColor} />
            </View>
            <View style={styles.weatherStatCol}>
              <View style={styles.weatherStatRow}>
                <Ionicons name="water-outline" size={12} color={wt.textSecondary} />
                <Text style={[styles.weatherStatVal, { color: wt.textPrimary }]}>
                  {weather?.humidity ?? 86}%
                </Text>
              </View>
              <View style={styles.weatherStatRow}>
                <Ionicons name="speedometer-outline" size={12} color={wt.textSecondary} />
                <Text style={[styles.weatherStatVal, { color: wt.textPrimary }]}>
                  {weather?.windSpeed ?? '1.5'} m/s
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* ── Quick Row ─────────────────────────────────────────────────────── */}
      <View style={styles.quickRow}>
        <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('LandList', { userData })}>
          <View style={[styles.quickIcon, { backgroundColor: '#DCFCE7' }]}>
            <Ionicons name="map" size={24} color="#16A34A" />
          </View>
          <Text style={styles.quickLabel}>My Lands</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.quickBtn, styles.quickBtnMid]} onPress={handleStartFarming}>
          <View style={[styles.quickIcon, { backgroundColor: '#1D4ED8' }]}>
            <Ionicons name="add" size={26} color="#fff" />
          </View>
          <Text style={[styles.quickLabel, { color: '#1D4ED8', fontWeight: '700' }]}>Add Crop</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('MarketPrices')}>
          <View style={[styles.quickIcon, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="trending-up" size={24} color="#D97706" />
          </View>
          <Text style={[styles.quickLabel, { color: '#D97706' }]}>Market</Text>
        </TouchableOpacity>
      </View>

      {/* ── Market Prices ─────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Market Prices</Text>
            <Text style={styles.cardSub}>Live 7-day trend</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('MarketPrices')}>
            <Text style={styles.linkText}>See all →</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.marketRow}>
          {marketPrices.map((mp) => {
            const isUp = mp.trend === 'up';
            return (
              <View key={mp.name} style={styles.marketCard}>
                <View style={styles.marketTop}>
                  <Text style={styles.marketEmoji}>{mp.emoji}</Text>
                  <View>
                    <Text style={styles.marketName}>{mp.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                      <Text style={[styles.marketPrice, { color: mp.color }]}>{mp.price}</Text>
                      <Text style={styles.marketUnit}> ₹/kg</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
                      <Ionicons name={isUp ? 'arrow-up' : 'arrow-down'} size={11} color={isUp ? '#16A34A' : '#DC2626'} />
                      <Text style={[styles.marketChange, { color: isUp ? '#16A34A' : '#DC2626' }]}>
                        {isUp ? '+' : ''}{mp.change}
                      </Text>
                    </View>
                  </View>
                </View>
                <MiniChart trend={mp.trend} color={mp.color} />
                <Text style={styles.chartLabel}>7 day trend</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.dayRow}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <Text key={d} style={styles.dayLabel}>{d}</Text>
          ))}
        </View>
      </View>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{stats.totalLands}</Text>
          <Text style={styles.statLbl}>LANDS</Text>
        </View>
        <View style={styles.statDiv} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#2563EB' }]}>{stats.activeCrops}</Text>
          <Text style={styles.statLbl}>ACTIVE</Text>
        </View>
        <View style={styles.statDiv} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#D97706' }]}>{stats.harvestedCrops}</Text>
          <Text style={styles.statLbl}>HARVESTED</Text>
        </View>
      </View>

      {/* ── Selected Land — Professional ─────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Selected Land</Text>
          <TouchableOpacity onPress={handleViewLands}>
            <Text style={styles.linkText}>View All →</Text>
          </TouchableOpacity>
        </View>

        {selectedLand && (
          <TouchableOpacity style={styles.landTile} onPress={handleViewLands} activeOpacity={0.78}>
            <View style={styles.landAccent} />
            <View style={styles.landBody}>
              <View style={styles.landIcon}>
                <Ionicons name="location" size={20} color="#16A34A" />
              </View>
              <View style={styles.landMeta}>
                <Text style={styles.landName}>{selectedLand.landName}</Text>
                <Text style={styles.landLoc}>
                  {selectedLand.location.city}, {selectedLand.location.district}
                </Text>
                <View style={styles.landTags}>
                  <View style={styles.landTag}>
                    <Ionicons name="resize" size={10} color="#16A34A" />
                    <Text style={styles.landTagText}>
                      {selectedLand.size.value} {selectedLand.size.unit}
                    </Text>
                  </View>
                  {selectedLand.soilType ? (
                    <View style={[styles.landTag, styles.landTagAlt]}>
                      <Ionicons name="layers-outline" size={10} color="#92400E" />
                      <Text style={[styles.landTagText, { color: '#92400E' }]}>{selectedLand.soilType}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </View>
          </TouchableOpacity>
        )}

        {lands.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            {lands.map((land) => (
              <TouchableOpacity
                key={land._id}
                style={[styles.landChip, selectedLand?._id === land._id && styles.landChipSel]}
                onPress={() => handleLandChange(land)}
              >
                <Text style={[styles.landChipTxt, selectedLand?._id === land._id && styles.landChipTxtSel]}>
                  {land.landName}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* ── Incoming Vendor Offers — Professional ────────────────────────── */}
      {incomingOffers.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.bellWrap}>
                <Ionicons name="notifications" size={15} color="#EA580C" />
                {pendingCount > 0 && (
                  <View style={styles.bellDot}>
                    <Text style={styles.bellDotTxt}>{pendingCount}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardTitle}>Vendor Offers</Text>
            </View>
            <View style={styles.offerCountBadge}>
              <Text style={styles.offerCountTxt}>{incomingOffers.length} total</Text>
            </View>
          </View>

          {incomingOffers.map((offer) => {
            const isPending   = offer.status === 'pending';
            const isConfirmed = offer.status === 'confirmed';

            return (
              <View key={offer._id} style={styles.offerCard}>
                {/* Status row */}
                <View style={styles.offerHeaderRow}>
                  <View style={[styles.offerChip, { backgroundColor: isConfirmed ? '#DCFCE7' : '#FFF7ED' }]}>
                    <View style={[styles.offerDot, { backgroundColor: isConfirmed ? '#16A34A' : '#EA580C' }]} />
                    <Text style={[styles.offerChipTxt, { color: isConfirmed ? '#15803D' : '#C2410C' }]}>
                      {isConfirmed ? 'Deal Confirmed' : 'Awaiting Response'}
                    </Text>
                  </View>
                  <Text style={styles.offerDate}>
                    {new Date(offer.acceptedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>

                {/* Crop + price */}
                <View style={styles.offerMainRow}>
                  <View>
                    <Text style={styles.offerCrop}>🌾 {offer.cropName}</Text>
                    <Text style={styles.offerMeta}>{offer.quantityKg} kg · ₹{offer.pricePerKg}/kg</Text>
                  </View>
                  <View style={styles.offerPriceBox}>
                    <Text style={styles.offerPriceLbl}>Total</Text>
                    <Text style={styles.offerTotal}>₹{offer.totalPrice?.toLocaleString()}</Text>
                  </View>
                </View>

                <View style={styles.offerDivider} />

                {/* Vendor row */}
                <View style={styles.vendorRow}>
                  <View style={styles.vendorAvatar}>
                    <Text style={styles.vendorAvatarTxt}>
                      {(offer.vendorName || 'V')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vendorName}>{offer.vendorName}</Text>
                    {offer.vendorCompany && offer.vendorCompany !== offer.vendorName && (
                      <Text style={styles.vendorCompany}>{offer.vendorCompany}</Text>
                    )}
                    {isConfirmed && offer.vendorPhone ? (
                      <TouchableOpacity
                        style={styles.callChip}
                        onPress={() => Linking.openURL(`tel:${offer.vendorPhone}`)}
                      >
                        <Ionicons name="call" size={12} color="#2563EB" />
                        <Text style={styles.callChipTxt}>{offer.vendorPhone}</Text>
                      </TouchableOpacity>
                    ) : isPending ? (
                      <Text style={styles.phoneHint}>📞 Phone visible after confirming</Text>
                    ) : null}
                  </View>
                </View>

                {/* Actions */}
                {isPending && (
                  <View style={styles.offerActions}>
                    <TouchableOpacity style={styles.confirmBtn} onPress={() => handleConfirmOffer(offer)}>
                      <Ionicons name="checkmark" size={15} color="#fff" />
                      <Text style={styles.confirmTxt}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.declineBtn} onPress={() => handleDeclineOffer(offer)}>
                      <Ionicons name="close" size={15} color="#DC2626" />
                      <Text style={styles.declineTxt}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {isConfirmed && (
                  <View style={styles.confirmedBanner}>
                    <Ionicons name="ribbon-outline" size={13} color="#15803D" />
                    <Text style={styles.confirmedTxt}>Deal locked in — contact the vendor above</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* ── Active Crops ──────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Active Crops ({crops.length})</Text>
          <TouchableOpacity style={styles.addCropBtn} onPress={handleStartFarming}>
            <Ionicons name="add" size={16} color="#16A34A" />
            <Text style={styles.addCropTxt}>Add Crop</Text>
          </TouchableOpacity>
        </View>

        {crops.length === 0 ? (
          <View style={styles.noCropsWrap}>
            <View style={styles.noCropsCircle}>
              <Ionicons name="leaf-outline" size={34} color="#16A34A" />
            </View>
            <Text style={styles.noCropsTitle}>No crops planted yet</Text>
            <Text style={styles.noCropsSub}>Let AI suggest the best crops for your land</Text>
            <TouchableOpacity style={styles.aiBtn} onPress={handleStartFarming}>
              <Ionicons name="sparkles" size={17} color="#fff" />
              <Text style={styles.aiBtnTxt}>Get AI Recommendations</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
            {crops.map((crop) => {
              const daysElapsed   = getDaysElapsed(crop.plantingDate);
              const daysRemaining = getDaysRemaining(crop.plantingDate, crop.duration);
              const progress      = (daysElapsed / crop.duration) * 100;
              const priceData     = cropPrices[crop._id];
              const isUp          = priceData?.trend === 'up';

              return (
                <TouchableOpacity key={crop._id} style={styles.cropCard} onPress={() => handleCropPress(crop)} activeOpacity={0.7}>
                  <View style={styles.stageBadge}>
                    <Text style={styles.stageTxt}>{crop.currentStage.charAt(0).toUpperCase() + crop.currentStage.slice(1)}</Text>
                  </View>
                  <View style={styles.cropCardHeader}>
                    <Text style={styles.cropIcon}>{getStageIcon(crop.currentStage)}</Text>
                    <View style={[styles.healthBadge, { backgroundColor: getHealthColor(crop.healthScore) }]}>
                      <Ionicons name="fitness" size={14} color="#fff" />
                      <Text style={styles.healthTxt}>{crop.healthScore}%</Text>
                    </View>
                  </View>
                  <Text style={styles.cropName}>{crop.name}</Text>
                  <Text style={styles.cropTamil}>{crop.tamilName}</Text>
                  <View style={styles.progressWrap}>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${Math.min(100, progress)}%` }]} />
                    </View>
                    <Text style={styles.progressTxt}>Day {daysElapsed}/{crop.duration}</Text>
                  </View>
                  <View style={styles.cropFooter}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="time" size={16} color="#666" />
                      <Text style={styles.daysLeftTxt}>{daysRemaining} days left</Text>
                    </View>
                  </View>
                  <View style={styles.priceDivider} />
                  {pricesLoading && !priceData ? (
                    <View style={styles.priceStrip}>
                      <ActivityIndicator size="small" color="#4CAF50" />
                      <Text style={styles.priceLoadTxt}>Fetching price…</Text>
                    </View>
                  ) : priceData ? (
                    <View style={styles.priceStrip}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.priceLbl}>Market Price</Text>
                        <Text style={styles.priceVal}>₹{priceData.price.toLocaleString('en-IN')}</Text>
                        <Text style={styles.priceUnit}>{priceData.unit}</Text>
                      </View>
                      <View style={[styles.priceBadge, isUp ? styles.priceBadgeUp : styles.priceBadgeDn]}>
                        <Ionicons name={isUp ? 'trending-up' : 'trending-down'} size={16} color={isUp ? '#2E7D32' : '#C62828'} />
                        <Text style={[styles.priceChangeTxt, isUp ? styles.priceUp : styles.priceDn]}>
                          {isUp ? '+' : ''}{priceData.changePercent}%
                        </Text>
                        <Text style={[styles.priceChangeAbs, isUp ? styles.priceUp : styles.priceDn]}>
                          {isUp ? '+' : ''}₹{priceData.change}
                        </Text>
                        <Text style={styles.priceDayLbl}>today</Text>
                      </View>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#F8FAFC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText:      { marginTop: 16, fontSize: 16, color: '#666' },
  emptyContainer:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, minHeight: 500 },
  emptyTitle:       { fontSize: 24, fontWeight: 'bold', color: '#333', marginTop: 20, textAlign: 'center' },
  emptySubtitle:    { fontSize: 16, color: '#666', textAlign: 'center', marginTop: 8 },
  addButton:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#16A34A', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 12, marginTop: 32 },
  addButtonText:    { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },

  // ── Greeting
  greetingRow:        { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 },
  farmingBadge:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#DCFCE7', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 8 },
  farmingBadgeText:   { fontSize: 10, color: '#15803D', fontWeight: '800', letterSpacing: 0.8 },
  greetingText:       { fontSize: 23, fontWeight: '700', color: '#111827', letterSpacing: -0.3 },

  // ── Dynamic Weather Card
  weatherCard: {
    marginHorizontal: 16, marginBottom: 16,
    borderRadius: 22, overflow: 'hidden', minHeight: 130,
    elevation: 6, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10,
  },
  weatherGlow: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    right: -50, top: -60, opacity: 0.45,
  },
  weatherInner:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 22 },
  weatherLeft:    { flex: 1 },
  weatherEyebrow: { fontSize: 9, letterSpacing: 1.6, fontWeight: '700', marginBottom: 4 },
  weatherTemp:    { fontSize: 52, fontWeight: '800', lineHeight: 56 },
  weatherLabelRow:{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  weatherLabel:   { fontSize: 13, fontWeight: '500' },
  weatherRight:   { alignItems: 'center', gap: 10 },
  weatherIconBubble: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  weatherStatCol: { gap: 6 },
  weatherStatRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  weatherStatVal: { fontSize: 13, fontWeight: '500' },

  // ── Quick Row
  quickRow: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 16,
    backgroundColor: '#fff', borderRadius: 18, paddingVertical: 18,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 5,
  },
  quickBtn:    { flex: 1, alignItems: 'center', gap: 8 },
  quickBtnMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#F1F5F9' },
  quickIcon:   { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  quickLabel:  { fontSize: 12, color: '#374151', fontWeight: '600' },

  // ── Shared card
  card: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16,
    borderRadius: 18, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 5,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle:  { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardSub:    { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  linkText:   { fontSize: 13, color: '#16A34A', fontWeight: '600' },

  // ── Market Prices
  marketRow:   { flexDirection: 'row', gap: 10 },
  marketCard:  { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12 },
  marketTop:   { flexDirection: 'row', gap: 10, marginBottom: 8 },
  marketEmoji: { fontSize: 26 },
  marketName:  { fontSize: 13, fontWeight: '700', color: '#1F2937', marginBottom: 2 },
  marketPrice: { fontSize: 20, fontWeight: '800' },
  marketUnit:  { fontSize: 11, color: '#6B7280' },
  marketChange:{ fontSize: 12, fontWeight: '700' },
  chartLabel:  { fontSize: 10, color: '#9CA3AF', marginTop: 4 },
  dayRow:      { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  dayLabel:    { fontSize: 10, color: '#D1D5DB' },

  // ── Stats
  statsRow: {
    flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16,
    borderRadius: 18, paddingVertical: 20,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 5,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum:  { fontSize: 30, fontWeight: '800', color: '#111827' },
  statLbl:  { fontSize: 10, color: '#9CA3AF', fontWeight: '700', marginTop: 4, letterSpacing: 0.8 },
  statDiv:  { width: 1, backgroundColor: '#F1F5F9' },

  // ── Selected Land — Professional
  landTile:   { flexDirection: 'row', borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  landAccent: { width: 0 },
  landBody:   { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  landIcon:   { width: 40, height: 40, borderRadius: 10, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  landMeta:   { flex: 1 },
  landName:   { fontSize: 15, fontWeight: '700', color: '#111827' },
  landLoc:    { fontSize: 13, color: '#6B7280', marginTop: 2 },
  landTags:   { flexDirection: 'row', gap: 6, marginTop: 6 },
  landTag:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#BBF7D0' },
  landTagAlt: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  landTagText:{ fontSize: 11, color: '#15803D', fontWeight: '600' },
  landChip:    { backgroundColor: '#F1F5F9', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8 },
  landChipSel: { backgroundColor: '#16A34A' },
  landChipTxt: { fontSize: 13, color: '#6B7280' },
  landChipTxtSel: { color: '#fff', fontWeight: '700' },

  // ── Vendor Offers — Professional
  bellWrap: { position: 'relative', width: 32, height: 32, borderRadius: 8, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' },
  bellDot:  { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: '#EA580C', alignItems: 'center', justifyContent: 'center' },
  bellDotTxt: { fontSize: 9, color: '#fff', fontWeight: '800' },
  offerCountBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  offerCountTxt:   { fontSize: 12, color: '#6B7280', fontWeight: '600' },

  offerCard: {
    borderRadius: 14, backgroundColor: '#FAFAFA',
    borderWidth: 1, borderColor: '#E2E8F0',
    padding: 14, marginBottom: 12, gap: 10,
  },
  offerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  offerChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  offerDot:       { width: 6, height: 6, borderRadius: 3 },
  offerChipTxt:   { fontSize: 12, fontWeight: '700' },
  offerDate:      { fontSize: 11, color: '#9CA3AF' },
  offerMainRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  offerCrop:      { fontSize: 16, fontWeight: '700', color: '#111827' },
  offerMeta:      { fontSize: 13, color: '#6B7280', marginTop: 2 },
  offerPriceBox:  { alignItems: 'flex-end' },
  offerPriceLbl:  { fontSize: 10, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' },
  offerTotal:     { fontSize: 18, fontWeight: '800', color: '#15803D' },
  offerDivider:   { height: 1, backgroundColor: '#F1F5F9' },

  vendorRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  vendorAvatar:   { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E0E7FF', alignItems: 'center', justifyContent: 'center' },
  vendorAvatarTxt:{ fontSize: 16, fontWeight: '700', color: '#4F46E5' },
  vendorName:     { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  vendorCompany:  { fontSize: 12, color: '#6B7280', marginTop: 1 },
  phoneHint:      { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  callChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, alignSelf: 'flex-start', backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  callChipTxt:    { fontSize: 13, color: '#2563EB', fontWeight: '600' },

  offerActions: { flexDirection: 'row', gap: 10 },
  confirmBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#16A34A', paddingVertical: 12, borderRadius: 12 },
  confirmTxt:   { color: '#fff', fontWeight: '700', fontSize: 14 },
  declineBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FEF2F2', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA' },
  declineTxt:   { color: '#DC2626', fontWeight: '700', fontSize: 14 },
  confirmedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0FDF4', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0' },
  confirmedTxt: { color: '#15803D', fontWeight: '600', fontSize: 13 },

  // ── No Crops
  noCropsWrap:   { alignItems: 'center', paddingVertical: 32 },
  noCropsCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  noCropsTitle:  { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
  noCropsSub:    { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginBottom: 20 },
  aiBtn:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#15803D', paddingHorizontal: 22, paddingVertical: 13, borderRadius: 25, gap: 8 },
  aiBtnTxt:      { color: '#fff', fontSize: 15, fontWeight: '700' },
  addCropBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addCropTxt:    { fontSize: 13, color: '#16A34A', fontWeight: '600' },

  // ── Crop Cards
  cropCard: {
    backgroundColor: '#fff', width: CARD_WIDTH * 0.7, padding: 16,
    borderRadius: 12, marginRight: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  cropCardHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cropIcon:      { fontSize: 40 },
  healthBadge:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
  healthTxt:     { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  cropName:      { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  cropTamil:     { fontSize: 14, color: '#666', marginBottom: 16 },
  progressWrap:  { marginBottom: 12 },
  progressBar:   { height: 8, backgroundColor: '#e0e0e0', borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  progressFill:  { height: '100%', backgroundColor: '#4CAF50' },
  progressTxt:   { fontSize: 12, color: '#666' },
  cropFooter:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  daysLeftTxt:   { fontSize: 13, color: '#666' },
  stageBadge:    { position: 'absolute', top: 12, right: 12, backgroundColor: '#2196F3', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  stageTxt:      { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  // ── Price strip
  priceDivider:  { height: 1, backgroundColor: '#f0f0f0', marginTop: 12, marginBottom: 10 },
  priceStrip:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLbl:      { fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  priceVal:      { fontSize: 16, fontWeight: 'bold', color: '#333' },
  priceUnit:     { fontSize: 10, color: '#aaa', marginTop: 1 },
  priceBadge:    { flexDirection: 'column', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, minWidth: 62 },
  priceBadgeUp:  { backgroundColor: '#E8F5E9' },
  priceBadgeDn:  { backgroundColor: '#FFEBEE' },
  priceChangeTxt:{ fontSize: 13, fontWeight: 'bold', marginTop: 2 },
  priceUp:       { color: '#2E7D32' },
  priceDn:       { color: '#C62828' },
  priceChangeAbs:{ fontSize: 11, fontWeight: '600' },
  priceDayLbl:   { fontSize: 9, color: '#999', marginTop: 2 },
  priceLoadTxt:  { fontSize: 12, color: '#aaa', marginLeft: 6 },
});
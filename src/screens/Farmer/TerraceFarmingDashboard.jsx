import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { getUserLands } from '../../utils/landAPI';
import { COLORS } from '../../constants/colors';

const TerraceFarmingDashboard = ({ navigation, route }) => {
  const { userData } = route.params || {};
  
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    lands: 0,
    crops: 0,
    alerts: 0,
  });

  // Fetch user statistics
  const fetchStats = async () => {
    try {
      console.log('📊 Fetching user stats...');
      
      // Fetch lands count
      const landsResult = await getUserLands(userData?.uid);
      
      if (landsResult.success) {
        setStats(prev => ({
          ...prev,
          lands: landsResult.count || 0,
        }));
        console.log('✅ Stats updated:', landsResult.count, 'lands');
      }
    } catch (error) {
      console.error('❌ Error fetching stats:', error);
    }
  };

  // Initial load
  useEffect(() => {
    if (userData?.uid) {
      fetchStats();
    }
  }, [userData]);

  // Refresh when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('🔄 Dashboard focused, refreshing stats...');
      fetchStats();
    });

    return unsubscribe;
  }, [navigation]);

  // Pull to refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <ScrollView 
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.userName}>{userData?.name || 'Farmer'} 👋</Text>
          <Text style={styles.farmingType}>
            🏢 {userData?.farmingType?.toUpperCase() || 'TERRACE'} FARMING
          </Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => navigation.navigate('LandList', { userData })}
            activeOpacity={0.7}
          >
            <Text style={styles.statNumber}>{stats.lands}</Text>
            <Text style={styles.statLabel}>Lands</Text>
          </TouchableOpacity>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.crops}</Text>
            <Text style={styles.statLabel}>Active Crops</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.alerts}</Text>
            <Text style={styles.statLabel}>Alerts</Text>
          </View>
        </View>

        {/* Weather Widget (Static for now) */}
        <View style={styles.weatherCard}>
          <View style={styles.weatherHeader}>
            <Text style={styles.weatherTitle}>Today's Weather</Text>
            <Text style={styles.weatherLocation}>📍 {userData?.location?.city || 'Chennai'}</Text>
          </View>
          <View style={styles.weatherContent}>
            <Text style={styles.weatherTemp}>☀️ 25°C</Text>
            <Text style={styles.weatherCondition}>Partly Cloudy</Text>
          </View>
          <Text style={styles.weatherTip}>💡 Good day for watering plants</Text>
        </View>

        {/* Quick Actions Menu */}
        <View style={styles.menuContainer}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          
          <View style={styles.menuGrid}>
            {/* My Lands */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => navigation.navigate('LandList', { userData })}
              activeOpacity={0.7}
            >
              <Text style={styles.menuIcon}>🌾</Text>
              <Text style={styles.menuTitle}>My Lands</Text>
              <Text style={styles.menuSubtitle}>Manage farms</Text>
            </TouchableOpacity>

            {/* Add Crop */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => {/* TODO: Navigate to Add Crop */}}
              activeOpacity={0.7}
            >
              <Text style={styles.menuIcon}>🌱</Text>
              <Text style={styles.menuTitle}>Add Crop</Text>
              <Text style={styles.menuSubtitle}>Track growth</Text>
            </TouchableOpacity>

            {/* Disease Detection */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => {/* TODO: Navigate to Disease Scanner */}}
              activeOpacity={0.7}
            >
              <Text style={styles.menuIcon}>🔬</Text>
              <Text style={styles.menuTitle}>Scan Disease</Text>
              <Text style={styles.menuSubtitle}>AI Detection</Text>
            </TouchableOpacity>

            {/* Harvest Records */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => {/* TODO: Navigate to Harvest */}}
              activeOpacity={0.7}
            >
              <Text style={styles.menuIcon}>📊</Text>
              <Text style={styles.menuTitle}>Harvests</Text>
              <Text style={styles.menuSubtitle}>Track yield</Text>
            </TouchableOpacity>

            {/* Weather */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => {/* TODO: Navigate to Weather */}}
              activeOpacity={0.7}
            >
              <Text style={styles.menuIcon}>☁️</Text>
              <Text style={styles.menuTitle}>Weather</Text>
              <Text style={styles.menuSubtitle}>7-day forecast</Text>
            </TouchableOpacity>

            {/* Market Prices */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => {/* TODO: Navigate to Market */}}
              activeOpacity={0.7}
            >
              <Text style={styles.menuIcon}>💰</Text>
              <Text style={styles.menuTitle}>Market</Text>
              <Text style={styles.menuSubtitle}>Crop prices</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Activity (Placeholder) */}
        <View style={styles.activityContainer}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          
          {stats.lands === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>📋</Text>
              <Text style={styles.emptyStateText}>No lands registered yet</Text>
              <Text style={styles.emptyStateSubtext}>Start by adding your first land!</Text>
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => navigation.navigate('LandRegistration', { userData })}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyStateButtonText}>+ Add First Land</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>🎉</Text>
              <Text style={styles.emptyStateText}>You have {stats.lands} {stats.lands === 1 ? 'land' : 'lands'}!</Text>
              <Text style={styles.emptyStateSubtext}>Tap "My Lands" to view them</Text>
            </View>
          )}
        </View>

      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  welcomeSection: {
    backgroundColor: COLORS.primary,
    padding: 20,
    paddingTop: 30,
    paddingBottom: 30,
  },
  welcomeText: {
    fontSize: 16,
    color: COLORS.secondary,
    opacity: 0.9,
  },
  userName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.secondary,
    marginTop: 4,
  },
  farmingType: {
    fontSize: 14,
    color: COLORS.secondary,
    marginTop: 8,
    opacity: 0.8,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    backgroundColor: COLORS.cardBackground,
    marginTop: -20,
    marginHorizontal: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statCard: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 4,
  },
  weatherCard: {
    backgroundColor: COLORS.cardBackground,
    margin: 16,
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.primary + '20',
  },
  weatherHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  weatherTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  weatherLocation: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  weatherContent: {
    alignItems: 'center',
    marginVertical: 12,
  },
  weatherTemp: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  weatherCondition: {
    fontSize: 16,
    color: COLORS.text,
    marginTop: 4,
  },
  weatherTip: {
    fontSize: 12,
    color: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  menuContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  menuCard: {
    backgroundColor: COLORS.cardBackground,
    width: '48%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  menuIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 4,
  },
  menuSubtitle: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 2,
  },
  activityContainer: {
    padding: 16,
    marginBottom: 40,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 4,
  },
  emptyStateButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  emptyStateButtonText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default TerraceFarmingDashboard;

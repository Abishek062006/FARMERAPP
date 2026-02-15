import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  StatusBar,
  ScrollView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { removeUserData } from '../../utils/storage';
import { COLORS } from '../../constants/colors';

const TerraceFarmingDashboard = ({ navigation, route }) => {
  const { userData } = route.params || {};

  const handleLogout = async () => {
    await removeUserData();
  };

  const getFarmingIcon = () => {
    if (userData?.farmingType === 'terrace') return '🏢';
    if (userData?.farmingType === 'normal') return '🚜';
    if (userData?.farmingType === 'organic') return '🌱';
    return '🌾';
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <ScrollView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {getFarmingIcon()} {userData?.farmingType?.toUpperCase()} Dashboard
          </Text>
          <Text style={styles.welcomeText}>
            Welcome, {userData?.name || 'Farmer'}! 👋
          </Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="leaf-outline" size={32} color={COLORS.primary} />
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Active Crops</Text>
          </View>
          
          <View style={styles.statCard}>
            <Ionicons name="location-outline" size={32} color={COLORS.primary} />
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Lands</Text>
          </View>
        </View>

        {/* Crop Recommendation Button */}
        <TouchableOpacity
          style={styles.cropRecommendationButton}
          onPress={() => navigation.navigate('LocationSetup', { userData })} // ✅ PASS USERDATA
          activeOpacity={0.8}
        >
          <Ionicons name="leaf" size={24} color="#fff" />
          <Text style={styles.cropRecommendationText}>
            🌱 Get Crop Recommendations
          </Text>
        </TouchableOpacity>

        {/* Quick Actions */}
        <View style={styles.actionsContainer}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          {/* Land Management */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('LandList', { userData })}
            activeOpacity={0.8}
          >
            <Ionicons name="map-outline" size={24} color={COLORS.primary} />
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>My Lands</Text>
              <Text style={styles.actionSubtitle}>View and manage your lands</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#999" />
          </TouchableOpacity>

          {/* Crop Management */}
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.8}
          >
            <Ionicons name="leaf-outline" size={24} color={COLORS.primary} />
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>My Crops</Text>
              <Text style={styles.actionSubtitle}>Track your crop progress</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#999" />
          </TouchableOpacity>

          {/* Weather */}
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.8}
          >
            <Ionicons name="partly-sunny-outline" size={24} color={COLORS.primary} />
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Weather Forecast</Text>
              <Text style={styles.actionSubtitle}>Check local weather</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#999" />
          </TouchableOpacity>

          {/* Market Prices */}
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.8}
          >
            <Ionicons name="cash-outline" size={24} color={COLORS.primary} />
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Market Prices</Text>
              <Text style={styles.actionSubtitle}>Current crop prices</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#999" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: COLORS.secondary,
    padding: 20,
    paddingTop: 10,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 16,
    color: COLORS.primary,
    opacity: 0.9,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  cropRecommendationButton: {
    flexDirection: 'row',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  cropRecommendationText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  actionsContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  actionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
});

export default TerraceFarmingDashboard;

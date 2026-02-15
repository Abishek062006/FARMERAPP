import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { removeUserData } from '../../utils/storage';
import { COLORS } from '../../constants/colors';

const FarmerDashboard = ({ navigation, route }) => {
  const { farmingType } = route.params || {};

  const handleLogout = async () => {
    await removeUserData();
  };

  const navigateToFarmingDashboard = () => {
    if (farmingType === 'terrace') {
      navigation.navigate('TerraceFarming');
    } else if (farmingType === 'normal') {
      navigation.navigate('NormalFarming');
    } else if (farmingType === 'organic') {
      navigation.navigate('OrganicFarming');
    }
  };

  const getFarmingIcon = () => {
    if (farmingType === 'terrace') return '🏢';
    if (farmingType === 'normal') return '🚜';
    if (farmingType === 'organic') return '🌱';
    return '🌾';
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Farmer Dashboard</Text>
          <Text style={styles.headerSubtitle}>
            {getFarmingIcon()} {farmingType?.toUpperCase()}
          </Text>
          
          {/* NEW: Profile Button */}
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.7}
          >
            <Text style={styles.profileButtonText}>👤 Profile</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <TouchableOpacity
            style={styles.mainButton}
            onPress={navigateToFarmingDashboard}
            activeOpacity={0.8}
          >
            <Text style={styles.mainButtonIcon}>{getFarmingIcon()}</Text>
            <Text style={styles.mainButtonText}>
              Open {farmingType} Dashboard
            </Text>
            <Text style={styles.mainButtonSubtext}>AI System Ready</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.secondary,
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 16,
    color: COLORS.primary,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.9,
  },
  // NEW: Profile Button Styles
  profileButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  profileButtonText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  mainButton: {
    backgroundColor: COLORS.primary,
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  mainButtonIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  mainButtonText: {
    color: COLORS.secondary,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  mainButtonSubtext: {
    color: COLORS.secondary,
    fontSize: 14,
    marginTop: 8,
    opacity: 0.7,
  },
  logoutButton: {
    backgroundColor: COLORS.error,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default FarmerDashboard;

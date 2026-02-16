import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

export default function LandListScreen({ navigation, route }) {
  const { userData } = route.params || {};
  const [lands, setLands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchLands();
  }, []);

  const fetchLands = async () => {
    try {
      setLoading(true);
      const firebaseUid = userData?.firebaseUid || userData?.uid;

      console.log('📍 Fetching lands for user:', firebaseUid);

      const response = await axios.get(`${API_ENDPOINTS.LANDS}/${firebaseUid}`);

      if (response.data.success) {
        setLands(response.data.lands);
        console.log(`✅ Fetched ${response.data.count} lands`);
      }
    } catch (error) {
      console.error('❌ Error fetching lands:', error);
      Alert.alert('Error', 'Failed to load lands');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLands();
  };

  const handleAddLand = () => {
    navigation.navigate('LandRegistration', { userData });
  };

  const handleLandPress = (land) => {
    navigation.navigate('LandDetails', { land, userData });
  };

  const getFarmingTypeInfo = (type) => {
    switch (type) {
      case 'normal':
        return { icon: '🌾', color: '#FF9800', label: 'Normal' };
      case 'organic':
        return { icon: '🌱', color: '#4CAF50', label: 'Organic' };
      case 'terrace':
        return { icon: '🪴', color: '#2196F3', label: 'Terrace' };
      default:
        return { icon: '🌿', color: '#666', label: 'Unknown' };
    }
  };

  const renderLandCard = ({ item }) => {
    const farmingInfo = getFarmingTypeInfo(item.farmingType);

    return (
      <TouchableOpacity
        style={styles.landCard}
        onPress={() => handleLandPress(item)}
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.landNameContainer}>
            <Ionicons name="location" size={24} color="#4CAF50" />
            <Text style={styles.landName}>{item.landName}</Text>
          </View>
          <View style={[styles.typeBadge, { backgroundColor: farmingInfo.color }]}>
            <Text style={styles.typeBadgeText}>
              {farmingInfo.icon} {farmingInfo.label}
            </Text>
          </View>
        </View>

        {/* Location */}
        <View style={styles.infoRow}>
          <Ionicons name="pin" size={16} color="#666" />
          <Text style={styles.infoText}>
            {item.location.city}, {item.location.district}
          </Text>
        </View>

        {/* Size */}
        <View style={styles.infoRow}>
          <Ionicons name="resize" size={16} color="#666" />
          <Text style={styles.infoText}>
            {item.size.value} {item.size.unit}
          </Text>
        </View>

        {/* Water Source */}
        <View style={styles.infoRow}>
          <Ionicons name="water" size={16} color="#666" />
          <Text style={styles.infoText}>
            {item.waterSource.charAt(0).toUpperCase() + item.waterSource.slice(1)}
          </Text>
        </View>

        {/* Soil Type */}
        <View style={styles.infoRow}>
          <Ionicons name="leaf" size={16} color="#666" />
          <Text style={styles.infoText}>
            {item.soilType.charAt(0).toUpperCase() + item.soilType.slice(1)} Soil
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{item.totalPlots || 0}</Text>
            <Text style={styles.statLabel}>Plots</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
            <Text style={styles.statLabel}>Registered</Text>
          </View>
        </View>

        {/* Arrow */}
        <View style={styles.arrowContainer}>
          <Ionicons name="chevron-forward" size={24} color="#999" />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading your lands...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Lands</Text>
        <Text style={styles.headerSubtitle}>
          {lands.length} land(s) registered
        </Text>
      </View>

      {/* Empty State */}
      {lands.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="map-outline" size={80} color="#ccc" />
          <Text style={styles.emptyTitle}>No Lands Yet</Text>
          <Text style={styles.emptySubtitle}>
            Start your farming journey by registering your first land
          </Text>
          <TouchableOpacity style={styles.addButton} onPress={handleAddLand}>
            <Ionicons name="add-circle" size={24} color="#fff" />
            <Text style={styles.addButtonText}>Register First Land</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Land List */}
          <FlatList
            data={lands}
            renderItem={renderLandCard}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={['#4CAF50']}
              />
            }
          />

          {/* Add Land FAB */}
          <TouchableOpacity style={styles.fab} onPress={handleAddLand}>
            <Ionicons name="add" size={32} color="#fff" />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
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
  listContent: {
    padding: 16,
  },
  landCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  landNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  landName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#eee',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  arrowContainer: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -12,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});

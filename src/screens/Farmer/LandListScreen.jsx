import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { getUserLands, deleteLand } from '../../utils/landAPI';
import { COLORS } from '../../constants/colors';

const LandListScreen = ({ navigation, route }) => {
  const { userData } = route.params || {};
  
  const [lands, setLands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch lands
  const fetchLands = async () => {
    try {
      console.log('🔍 Fetching lands for user:', userData?.uid);
      
      const result = await getUserLands(userData?.uid);
      
      if (result.success) {
        console.log('✅ Fetched', result.count, 'lands');
        setLands(result.lands);
      } else {
        console.error('❌ Failed to fetch lands:', result.error);
        Alert.alert('Error', result.error || 'Failed to fetch lands');
      }
    } catch (error) {
      console.error('❌ Fetch error:', error);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchLands();
  }, []);

  // Pull to refresh
  const onRefresh = () => {
    setRefreshing(true);
    fetchLands();
  };

  // Delete land with confirmation
  const handleDelete = (landId, landName) => {
    Alert.alert(
      'Delete Land',
      `Are you sure you want to delete "${landName}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🗑️ Deleting land:', landId);
              
              const result = await deleteLand(landId);
              
              if (result.success) {
                console.log('✅ Land deleted successfully');
                Alert.alert('Success', 'Land deleted successfully');
                fetchLands(); // Refresh list
              } else {
                console.error('❌ Delete failed:', result.error);
                Alert.alert('Error', result.error || 'Failed to delete land');
              }
            } catch (error) {
              console.error('❌ Delete error:', error);
              Alert.alert('Error', 'Something went wrong');
            }
          },
        },
      ]
    );
  };

  // Render loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading lands...</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <View style={styles.container}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Lands</Text>
          <Text style={styles.headerSubtitle}>
            {lands.length} {lands.length === 1 ? 'land' : 'lands'} registered
          </Text>
        </View>

        {/* Empty State */}
        {lands.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🌾</Text>
            <Text style={styles.emptyTitle}>No Lands Yet</Text>
            <Text style={styles.emptySubtitle}>Start by adding your first land!</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => navigation.navigate('LandRegistration', { userData })}
              activeOpacity={0.8}
            >
              <Text style={styles.addButtonText}>+ Add First Land</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Land List */}
            <ScrollView
              style={styles.listContainer}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
            >
              {lands.map((land) => (
                <View key={land.id} style={styles.landCard}>
                  {/* Land Header */}
                  <View style={styles.landHeader}>
                    <View style={styles.landTitleContainer}>
                      <Text style={styles.landName}>{land.name}</Text>
                      <Text style={styles.landSize}>
                        {land.size.value} {land.size.unit}
                      </Text>
                    </View>
                    <View style={styles.landIcon}>
                      <Text style={styles.landIconText}>
                        {land.soilType === 'clay' ? '🟤' :
                         land.soilType === 'loam' ? '🟫' :
                         land.soilType === 'sandy' ? '🟡' :
                         land.soilType === 'red' ? '🔴' :
                         land.soilType === 'black' ? '⚫' : '🌱'}
                      </Text>
                    </View>
                  </View>

                  {/* Land Details */}
                  <View style={styles.landDetails}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>📍 Location:</Text>
                      <Text style={styles.detailValue}>
                        {land.location?.city || 'Not specified'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>🌾 Soil Type:</Text>
                      <Text style={styles.detailValue}>
                        {land.soilType?.charAt(0).toUpperCase() + land.soilType?.slice(1)}
                      </Text>
                    </View>
                    {land.waterSource && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>💧 Water:</Text>
                        <Text style={styles.detailValue}>
                          {land.waterSource?.charAt(0).toUpperCase() + land.waterSource?.slice(1)}
                        </Text>
                      </View>
                    )}
                    {land.notes && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>📝 Notes:</Text>
                        <Text style={styles.detailValue} numberOfLines={2}>
                          {land.notes}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={styles.viewButton}
                      onPress={() => navigation.navigate('LandDetails', { landId: land.id, userData })}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.viewButtonText}>👁️ View Details</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDelete(land.id, land.name)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.deleteButtonText}>🗑️ Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Floating Add Button */}
            <TouchableOpacity
              style={styles.floatingButton}
              onPress={() => navigation.navigate('LandRegistration', { userData })}
              activeOpacity={0.8}
            >
              <Text style={styles.floatingButtonText}>+ Add Land</Text>
            </TouchableOpacity>
          </>
        )}
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
    backgroundColor: COLORS.primary,
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  backButton: {
    marginBottom: 15,
  },
  backButtonText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.secondary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.secondary,
    marginTop: 5,
    opacity: 0.9,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.textLight,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 24,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  addButtonText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  landCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  landHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  landTitleContainer: {
    flex: 1,
  },
  landName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  landSize: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  landIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  landIconText: {
    fontSize: 24,
  },
  landDetails: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: COLORS.textLight,
    width: 100,
  },
  detailValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  viewButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  viewButtonText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: COLORS.error,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  floatingButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 30,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  floatingButtonText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default LandListScreen;

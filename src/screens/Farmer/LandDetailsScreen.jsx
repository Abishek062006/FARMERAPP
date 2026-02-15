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
} from 'react-native';
import { getLandById, deleteLand } from '../../utils/landAPI';
import { COLORS } from '../../constants/colors';

const LandDetailsScreen = ({ navigation, route }) => {
  const { landId, userData } = route.params || {};
  
  const [land, setLand] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch land details
  const fetchLandDetails = async () => {
    try {
      console.log('🔍 Fetching land details for:', landId);
      
      const result = await getLandById(landId);
      
      if (result.success) {
        console.log('✅ Land details loaded');
        setLand(result.land);
      } else {
        console.error('❌ Failed to fetch land:', result.error);
        Alert.alert('Error', result.error || 'Failed to fetch land details');
      }
    } catch (error) {
      console.error('❌ Fetch error:', error);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLandDetails();
  }, [landId]);

  // Delete land
  const handleDelete = () => {
    Alert.alert(
      'Delete Land',
      `Are you sure you want to delete "${land?.name}"?`,
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
                Alert.alert('Success', 'Land deleted successfully', [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ]);
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

  // Loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading land details...</Text>
      </View>
    );
  }

  // Error state
  if (!land) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>❌</Text>
        <Text style={styles.errorText}>Land not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <View style={styles.container}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackButton}>
            <Text style={styles.headerBackText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Land Details</Text>
        </View>

        {/* Content */}
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          
          {/* Land Name Card */}
          <View style={styles.nameCard}>
            <Text style={styles.landName}>{land.name}</Text>
            <Text style={styles.landSize}>
              {land.size.value} {land.size.unit}
            </Text>
          </View>

          {/* Details Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📍 Location</Text>
            <View style={styles.detailCard}>
              {land.location?.address && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Address:</Text>
                  <Text style={styles.detailValue}>{land.location.address}</Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>City:</Text>
                <Text style={styles.detailValue}>{land.location?.city || 'Not specified'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>District:</Text>
                <Text style={styles.detailValue}>{land.location?.district || 'Not specified'}</Text>
              </View>
              {land.location?.pincode && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Pincode:</Text>
                  <Text style={styles.detailValue}>{land.location.pincode}</Text>
                </View>
              )}
              {land.location?.coordinates?.lat && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>GPS:</Text>
                  <Text style={styles.detailValue}>
                    {land.location.coordinates.lat.toFixed(6)}, {land.location.coordinates.lng.toFixed(6)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Soil & Water */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🌾 Soil & Water</Text>
            <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Soil Type:</Text>
                <Text style={styles.detailValue}>
                  {land.soilType?.charAt(0).toUpperCase() + land.soilType?.slice(1)}
                </Text>
              </View>
              {land.waterSource && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Water Source:</Text>
                  <Text style={styles.detailValue}>
                    {land.waterSource?.charAt(0).toUpperCase() + land.waterSource?.slice(1)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Notes */}
          {land.notes && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📝 Notes</Text>
              <View style={styles.detailCard}>
                <Text style={styles.notesText}>{land.notes}</Text>
              </View>
            </View>
          )}

          {/* Metadata */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ℹ️ Information</Text>
            <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Created:</Text>
                <Text style={styles.detailValue}>
                  {new Date(land.createdAt).toLocaleDateString()}
                </Text>
              </View>
              {land.updatedAt !== land.createdAt && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Updated:</Text>
                  <Text style={styles.detailValue}>
                    {new Date(land.updatedAt).toLocaleDateString()}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionSection}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => Alert.alert('Coming Soon', 'Edit feature will be added soon!')}
              activeOpacity={0.7}
            >
              <Text style={styles.editButtonText}>✏️ Edit Land</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteButtonText}>🗑️ Delete Land</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
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
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  headerBackButton: {
    marginBottom: 10,
  },
  headerBackText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.secondary,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: COLORS.background,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  backButtonText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  nameCard: {
    backgroundColor: COLORS.primary,
    margin: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  landName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.secondary,
    marginBottom: 8,
  },
  landSize: {
    fontSize: 20,
    color: COLORS.secondary,
    fontWeight: '600',
    opacity: 0.9,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  detailCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: COLORS.textLight,
    fontWeight: '600',
    width: 100,
  },
  detailValue: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
    fontWeight: '500',
  },
  notesText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 22,
  },
  actionSection: {
    marginHorizontal: 16,
    marginBottom: 40,
  },
  editButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  editButtonText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: COLORS.error,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default LandDetailsScreen;

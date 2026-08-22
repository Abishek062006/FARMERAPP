import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { signOut } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../../utils/firebase';
import { API_ENDPOINTS } from '../../utils/config';
import { COLORS } from '../../constants/colors';
import UserAvatar from '../../components/UserAvatar';
import ProfileCard from '../../components/ProfileCard';

const ProfileScreen = ({ navigation, route }) => {
  const [userData, setUserData] = useState(route.params?.userData || null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // EditProfileScreen navigates back here with { updated: { field, value } }
  // so the screen reflects the change immediately without a full app reload.
  useEffect(() => {
    const updated = route.params?.updated;
    if (updated) {
      setUserData((prev) => ({ ...prev, [updated.field]: updated.value }));
      navigation.setParams({ updated: undefined });
    }
  }, [route.params?.updated]);

  const uploadProfilePhoto = async (localUri) => {
    setUploadingPhoto(true);
    try {
      const response = await fetch(localUri);
      const blob = await response.blob();
      const photoRef = ref(storage, `profileImages/${auth.currentUser.uid}.jpg`);
      await uploadBytes(photoRef, blob);
      const downloadUrl = await getDownloadURL(photoRef);

      await axios.put(`${API_ENDPOINTS.USERS}/${auth.currentUser.uid}`, {
        profileImage: downloadUrl,
      });

      setUserData((prev) => ({ ...prev, profileImage: downloadUrl }));
      Alert.alert('Success', 'Profile photo updated!');
    } catch (error) {
      console.error('Error uploading photo:', error);
      Alert.alert('Error', 'Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleImagePick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant photo library access');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      uploadProfilePhoto(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera access');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      uploadProfilePhoto(result.assets[0].uri);
    }
  };

  const handleImageOptions = () => {
    Alert.alert('Profile Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: handleTakePhoto },
      { text: 'Choose from Gallery', onPress: handleImagePick },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(auth);
          } catch (error) {
            console.error('Logout error:', error);
            Alert.alert('Error', 'Failed to logout. Please try again.');
          }
        },
      },
    ]);
  };

  const getRoleBadge = () => {
    const role = userData?.role;
    if (role === 'farmer') return { icon: '🌾', color: '#4CAF50' };
    if (role === 'vendor') return { icon: '🏪', color: '#FF9800' };
    if (role === 'agent') return { icon: '👔', color: '#2196F3' };
    return { icon: '👤', color: COLORS.primary };
  };

  if (!userData) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const roleBadge = getRoleBadge();

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.headerPlaceholder} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.profileSection}>
            {uploadingPhoto ? (
              <View style={styles.avatarLoading}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            ) : (
              <UserAvatar
                uri={userData.profileImage}
                name={userData.name}
                size={120}
                onPress={handleImageOptions}
                editable={true}
              />
            )}

            <Text style={styles.name}>{userData.name}</Text>

            <View style={[styles.roleBadge, { backgroundColor: roleBadge.color }]}>
              <Text style={styles.roleBadgeText}>
                {roleBadge.icon} {userData.role?.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>Personal Information</Text>

            <ProfileCard
              icon="👤"
              label="Full Name"
              value={userData.name}
              editable={true}
              onPress={() => navigation.navigate('EditProfile', { field: 'name', currentValue: userData.name })}
            />

            <ProfileCard icon="📧" label="Email" value={userData.email} editable={false} />

            <ProfileCard
              icon="📱"
              label="Phone Number"
              value={userData.phone}
              editable={true}
              onPress={() => navigation.navigate('EditProfile', { field: 'phone', currentValue: userData.phone })}
            />

            <ProfileCard
              icon="📍"
              label="District"
              value={userData.location?.district || 'Not set'}
              editable={true}
              onPress={() =>
                navigation.navigate('EditProfile', {
                  field: 'district',
                  currentValue: userData.location?.district,
                  location: userData.location,
                })
              }
            />

            {userData.createdAt && (
              <ProfileCard
                icon="📅"
                label="Member Since"
                value={new Date(userData.createdAt).toLocaleDateString()}
                editable={false}
              />
            )}
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>Account Settings</Text>

            <ProfileCard
              icon="🔒"
              label="Change Password"
              value="••••••••"
              editable={true}
              onPress={() => navigation.navigate('EditProfile', { field: 'password' })}
            />
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>

          <View style={styles.bottomPadding} />
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
    backgroundColor: COLORS.secondary,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerPlaceholder: {
    width: 60,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  avatarLoading: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 16,
    marginBottom: 8,
  },
  roleBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  infoSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  logoutButton: {
    backgroundColor: COLORS.error,
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 20,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomPadding: {
    height: 40,
  },
});

export default ProfileScreen;

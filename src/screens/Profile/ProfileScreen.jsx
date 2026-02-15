import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getUserData, removeUserData, saveUserData } from '../../utils/storage';
import { COLORS } from '../../constants/colors';
import UserAvatar from '../../components/UserAvatar';
import ProfileCard from '../../components/ProfileCard';

const ProfileScreen = ({ navigation }) => {
  const [userData, setUserData] = useState(null);
  const [profileImage, setProfileImage] = useState(null);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    const data = await getUserData();
    setUserData(data);
    setProfileImage(data?.profileImage || null);
  };

  const handleImagePick = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library access');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled) {
        const imageUri = result.assets[0].uri;
        setProfileImage(imageUri);
        
        // Save to user data
        const updatedData = { ...userData, profileImage: imageUri };
        await saveUserData(updatedData);
        Alert.alert('Success', 'Profile photo updated!');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleTakePhoto = async () => {
    try {
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
        const imageUri = result.assets[0].uri;
        setProfileImage(imageUri);
        
        const updatedData = { ...userData, profileImage: imageUri };
        await saveUserData(updatedData);
        Alert.alert('Success', 'Profile photo updated!');
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleImageOptions = () => {
    Alert.alert(
      'Profile Photo',
      'Choose an option',
      [
        { text: 'Take Photo', onPress: handleTakePhoto },
        { text: 'Choose from Gallery', onPress: handleImagePick },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await removeUserData();
          },
        },
      ]
    );
  };

  const getRoleBadge = () => {
    const role = userData?.role;
    if (role === 'farmer') return { icon: '🌾', color: '#4CAF50' };
    if (role === 'vendor') return { icon: '🏪', color: '#FF9800' };
    if (role === 'agent') return { icon: '👔', color: '#2196F3' };
    return { icon: '👤', color: COLORS.primary };
  };

  const getFarmingTypeBadge = () => {
    const type = userData?.farmingType;
    if (type === 'terrace') return '🏢 Terrace Farming';
    if (type === 'normal') return '🚜 Normal Farming';
    if (type === 'organic') return '🌱 Organic Farming';
    return null;
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
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.profileSection}>
            <UserAvatar
              uri={profileImage}
              name={userData.name}
              size={120}
              onPress={handleImageOptions}
              editable={true}
            />
            
            <Text style={styles.name}>{userData.name}</Text>
            
            <View style={[styles.roleBadge, { backgroundColor: roleBadge.color }]}>
              <Text style={styles.roleBadgeText}>
                {roleBadge.icon} {userData.role.toUpperCase()}
              </Text>
            </View>

            {userData.farmingType && (
              <View style={styles.farmingBadge}>
                <Text style={styles.farmingBadgeText}>
                  {getFarmingTypeBadge()}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>Personal Information</Text>

            <ProfileCard
              icon="👤"
              label="Full Name"
              value={userData.name}
              editable={true}
              onPress={() => navigation.navigate('EditProfile', { field: 'name' })}
            />

            <ProfileCard
              icon="📧"
              label="Email"
              value={userData.email}
              editable={false}
            />

            <ProfileCard
              icon="📱"
              label="Phone Number"
              value={userData.phone}
              editable={true}
              onPress={() => navigation.navigate('EditProfile', { field: 'phone' })}
            />

            <ProfileCard
              icon="📅"
              label="Member Since"
              value={new Date(userData.createdAt).toLocaleDateString()}
              editable={false}
            />
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

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
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
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
    textAlign: 'center',
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 30,
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
  farmingBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
  },
  farmingBadgeText: {
    color: COLORS.secondary,
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

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { TouchableOpacity, Text, View, Image, Alert } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../utils/firebase';

// ✅ ONLY SCREENS THAT EXIST
import FarmerDashboard from '../screens/Farmer/FarmerDashboard';
import LandRegistrationScreen from '../screens/Farmer/LandRegistrationScreen';
import LandListScreen from '../screens/Farmer/LandListScreen';
import LandDetailsScreen from '../screens/Farmer/LandDetailsScreen';
import CropRecommendationScreen from '../screens/Farmer/CropRecommendationScreen';
import CropRegistrationScreen from '../screens/Farmer/CropRegistrationScreen';
import PlotDivisionScreen from '../screens/Farmer/PlotDivisionScreen';
import CropDetailScreen from '../screens/Farmer/CropDetailScreen';
import TaskManagementScreen from '../screens/Farmer/TaskManagementScreen';
import MarketPricesScreen from '../screens/Farmer/MarketPricesScreen';
import FarmerSalesScreen from '../screens/Farmer/FarmerSalesScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import EditProfileScreen from '../screens/Profile/EditProfileScreen';


// ❌ Comment out until we create the file
// import DiseaseLoggingScreen from '../screens/Farmer/DiseaseLoggingScreen';

import { COLORS } from '../constants/colors';

const Stack = createStackNavigator();

const FarmerNavigator = ({ userData }) => {
  const DashboardComponent = FarmerDashboard;

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🚪 Logging out...');
              await signOut(auth);
              console.log('✅ Logged out successfully');
            } catch (error) {
              console.error('❌ Logout error:', error);
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.secondary },
        headerTintColor: COLORS.primary,
        headerTitleStyle: { fontWeight: 'bold', fontSize: 20 },
      }}
    >
      {/* Main Dashboard */}
      <Stack.Screen 
        name="Dashboard" 
        component={DashboardComponent}
        initialParams={{ userData }}
        options={({ navigation: nav }) => ({
          title: 'NELIR',
          headerLeft: () => (
            <TouchableOpacity
              style={{ marginLeft: 16 }}
              onPress={handleLogout}
            >
              <Text style={{
                color: COLORS.primary,
                fontSize: 16,
                fontWeight: 'bold'
              }}>
                Logout
              </Text>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}
              onPress={() => nav.navigate('Profile', { userData })}
            >
              {userData?.profileImage ? (
                <Image
                  source={{ uri: userData.profileImage }}
                  style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }}
                />
              ) : (
                <View style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: COLORS.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 8,
                }}>
                  <Text style={{ fontSize: 14 }}>👤</Text>
                </View>
              )}
              <Text
                style={{ color: COLORS.primary, fontSize: 14, fontWeight: 'bold', maxWidth: 90 }}
                numberOfLines={1}
              >
                {userData?.name || 'Unknown User'}
              </Text>
            </TouchableOpacity>
          ),
        })}
      />

      <Stack.Screen
        name="FarmerSales"
        component={FarmerSalesScreen}
        options={{ title: 'My Sales' }}
      />

      {/* Profile */}
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{
          headerShown: false,
        }}
      />

      {/* Crop Recommendation */}
      <Stack.Screen 
        name="CropRecommendation" 
        component={CropRecommendationScreen}
        options={{ 
          title: 'AI Recommendations',
          headerStyle: { backgroundColor: '#4CAF50' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />
      <Stack.Screen 
  name="MarketPrices" 
  component={MarketPricesScreen}
  options={{ 
    title: 'Market Prices',
    headerStyle: { backgroundColor: '#4CAF50' },
    headerTintColor: '#fff',
    headerTitleStyle: { fontWeight: 'bold' },
  }}
/>


      {/* Plot Division */}
      <Stack.Screen 
        name="PlotDivision" 
        component={PlotDivisionScreen}
        options={{ 
          title: 'Divide Your Land',
          headerStyle: { backgroundColor: '#4CAF50' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />

      {/* Crop Registration */}
      <Stack.Screen 
        name="CropRegistration" 
        component={CropRegistrationScreen}
        options={{ 
          title: 'Register Crop',
          headerStyle: { backgroundColor: '#4CAF50' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />

      {/* Crop Detail */}
      <Stack.Screen 
        name="CropDetail" 
        component={CropDetailScreen}
        options={{ 
          title: 'Crop Details',
          headerStyle: { backgroundColor: '#4CAF50' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />

      {/* Task Management */}
      <Stack.Screen 
        name="TaskManagement" 
        component={TaskManagementScreen}
        options={{ 
          title: 'Manage Tasks',
          headerStyle: { backgroundColor: '#4CAF50' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />

      {/* ❌ Disease Logging - Comment out until file is created */}
      {/* 
      <Stack.Screen 
        name="DiseaseLogging" 
        component={DiseaseLoggingScreen}
        options={{ 
          title: 'Log Disease',
          headerStyle: { backgroundColor: '#4CAF50' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />
      */}

      {/* Land Management */}
      <Stack.Screen 
        name="LandList" 
        component={LandListScreen}
        initialParams={{ userData }}
        options={{ 
          title: 'My Lands',
          headerStyle: { backgroundColor: '#4CAF50' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />

      <Stack.Screen 
        name="LandRegistration" 
        component={LandRegistrationScreen}
        initialParams={{ userData }}
        options={{ 
          title: 'Register Land',
          headerStyle: { backgroundColor: '#4CAF50' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />

      <Stack.Screen 
        name="LandDetails" 
        component={LandDetailsScreen}
        initialParams={{ userData }}
        options={{ 
          title: 'Land Details',
          headerStyle: { backgroundColor: '#4CAF50' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />
    </Stack.Navigator>
  );
};

export default FarmerNavigator;

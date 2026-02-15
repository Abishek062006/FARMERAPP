import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { TouchableOpacity, Text, Alert } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../utils/firebase';

// Import screens
import TerraceFarmingDashboard from '../screens/Farmer/TerraceFarmingDashboard';
import LandRegistrationScreen from '../screens/Farmer/LandRegistrationScreen';
import LandListScreen from '../screens/Farmer/LandListScreen';
import LandDetailsScreen from '../screens/Farmer/LandDetailsScreen';
import LocationSetupScreen from '../screens/Farmer/LocationSetupScreen';
import CropRecommendationScreen from '../screens/Farmer/CropRecommendationScreen';
import CropRegistrationScreen from '../screens/Farmer/CropRegistrationScreen'; // ✅ ADD THIS

import { COLORS } from '../constants/colors';

const Stack = createStackNavigator();

const FarmerNavigator = ({ userData }) => {
  
  const DashboardComponent = TerraceFarmingDashboard;
  
  const dashboardTitle = 
    userData?.farmingType === 'terrace' ? 'Terrace Farming' :
    userData?.farmingType === 'normal' ? 'Normal Farming' :
    userData?.farmingType === 'organic' ? 'Organic Farming' :
    'Farming Dashboard';

  // Logout handler
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
        options={{
          title: dashboardTitle,
          headerRight: () => (
            <TouchableOpacity
              style={{ marginRight: 16 }}
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
        }}
      />

      <Stack.Screen 
        name="LocationSetup" 
        component={LocationSetupScreen}
        options={{ 
          title: 'Location & Season',
          headerStyle: { backgroundColor: '#4CAF50' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />

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

      {/* ✅ ADD THIS SCREEN */}
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

      {/* Land Screens */}
      <Stack.Screen 
        name="LandList" 
        component={LandListScreen}
        initialParams={{ userData }}
        options={{ headerShown: false }}
      />

      <Stack.Screen 
        name="LandRegistration" 
        component={LandRegistrationScreen}
        initialParams={{ userData }}
        options={{ headerShown: false }}
      />

      <Stack.Screen 
        name="LandDetails" 
        component={LandDetailsScreen}
        initialParams={{ userData }}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

export default FarmerNavigator;

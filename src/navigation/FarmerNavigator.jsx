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

import { COLORS } from '../constants/colors';

const Stack = createStackNavigator();

const FarmerNavigator = ({ userData }) => {
  
  // For now, use Terrace dashboard for all types
  // We'll add other dashboards in Day 4-5
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
        { 
          text: 'Cancel', 
          style: 'cancel' 
        },
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
        headerStyle: {
          backgroundColor: COLORS.secondary,
        },
        headerTintColor: COLORS.primary,
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 20,
        },
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

      {/* Land List Screen */}
      <Stack.Screen 
        name="LandList" 
        component={LandListScreen}
        initialParams={{ userData }}
        options={{ headerShown: false }}
      />

      {/* Land Registration Screen */}
      <Stack.Screen 
        name="LandRegistration" 
        component={LandRegistrationScreen}
        initialParams={{ userData }}
        options={{ headerShown: false }}
      />

      {/* Land Details Screen */}
      <Stack.Screen 
        name="LandDetails" 
        component={LandDetailsScreen}
        initialParams={{ userData }}
        options={{ headerShown: false }}
      />

      {/* More screens will be added in upcoming days */}
    </Stack.Navigator>
  );
};

export default FarmerNavigator;

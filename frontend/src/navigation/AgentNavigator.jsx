import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { TouchableOpacity, Text, Alert } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../utils/firebase';
import AgentDashboard from '../screens/Agent/AgentDashboard';
import AgentTripScreen from '../screens/Agent/AgentTripScreen';
import { COLORS } from '../constants/colors';

const Stack = createStackNavigator();

const AgentNavigator = ({ userData }) => {
  
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
              Alert.alert('Error', 'Failed to logout');
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
        },
      }}
    >
      <Stack.Screen 
        name="AgentDashboard" 
        component={AgentDashboard}
        initialParams={{ userData }}
        options={{
          title: 'Trips',
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
        name="AgentTrip"
        component={AgentTripScreen}
        options={{ title: 'Your Trip' }}
      />
    </Stack.Navigator>
  );
};

export default AgentNavigator;

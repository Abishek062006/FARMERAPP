import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { TouchableOpacity, Text, View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth } from '../utils/firebase';
import AgentDashboard from '../screens/Agent/AgentDashboard';
import AgentTripScreen from '../screens/Agent/AgentTripScreen';
import { COLORS } from '../constants/colors';
import ConsignmentTripScreen from '../screens/Agent/ConsignmentTripScreen';
// A captain could not see a finished trip, a kilometre driven or a rupee
// earned — and had no profile screen at all. Both are registered below.
import AgentTripsScreen from '../screens/Agent/AgentTripsScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import EditProfileScreen from '../screens/Profile/EditProfileScreen';

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
        options={({ navigation }) => ({
          title: 'Trips',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginRight: 14 }}>
              <TouchableOpacity
                accessibilityLabel="My trips and earnings"
                onPress={() => navigation.navigate('AgentTrips')}
              >
                <Ionicons name="time-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="My profile"
                onPress={() => navigation.navigate('Profile', { userData })}
              >
                <Ionicons name="person-circle-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity accessibilityLabel="Log out" onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          ),
        })}
      />

      <Stack.Screen
        name="AgentTrips"
        component={AgentTripsScreen}
        initialParams={{ userData }}
        options={{ title: 'My trips & earnings' }}
      />

      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />

      <Stack.Screen
        name="ConsignmentTrip"
        component={ConsignmentTripScreen}
        options={{ title: 'Multi-farm run' }}
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

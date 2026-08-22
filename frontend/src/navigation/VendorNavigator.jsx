import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { TouchableOpacity, Text, View, Alert } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../utils/firebase';
import VendorDashboard from '../screens/Vendor/VendorDashboard';
import ListingDetailScreen from '../screens/Vendor/ListingDetailScreen';
import BookTransportScreen from '../screens/Vendor/BookTransportScreen';
import OrderPlacedScreen from '../screens/Vendor/OrderPlacedScreen';
import VendorOrdersScreen from '../screens/Vendor/VendorOrdersScreen';
import TrackOrderScreen from '../screens/Vendor/TrackOrderScreen';
import { COLORS } from '../constants/colors';

const Stack = createStackNavigator();

const VendorNavigator = ({ userData }) => {
  
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
        name="VendorDashboard" 
        component={VendorDashboard}
        initialParams={{ userData }}
        options={({ navigation }) => ({
          title: 'FARM Market',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginRight: 16 }}>
              <TouchableOpacity onPress={() => navigation.navigate('VendorOrders', { userData })}>
                <Text style={{ color: COLORS.primary, fontSize: 16, fontWeight: 'bold' }}>
                  Orders
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLogout}>
                <Text style={{ color: COLORS.primary, fontSize: 16, fontWeight: 'bold' }}>
                  Logout
                </Text>
              </TouchableOpacity>
            </View>
          ),
        })}
      />

      <Stack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={({ route }) => ({ title: route.params?.listing?.cropName || 'Listing' })}
      />

      <Stack.Screen
        name="BookTransport"
        component={BookTransportScreen}
        options={{ title: 'Book Transport' }}
      />

      <Stack.Screen
        name="OrderPlaced"
        component={OrderPlacedScreen}
        options={{ title: 'Order Placed', headerLeft: () => null, gestureEnabled: false }}
      />

      <Stack.Screen
        name="VendorOrders"
        component={VendorOrdersScreen}
        options={{ title: 'My Orders' }}
      />

      <Stack.Screen
        name="TrackOrder"
        component={TrackOrderScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

export default VendorNavigator;

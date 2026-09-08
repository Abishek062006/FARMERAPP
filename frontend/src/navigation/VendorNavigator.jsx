import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { TouchableOpacity, Text, View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth } from '../utils/firebase';
import VendorDashboard from '../screens/Vendor/VendorDashboard';
import ListingDetailScreen from '../screens/Vendor/ListingDetailScreen';
import BookTransportScreen from '../screens/Vendor/BookTransportScreen';
import OrderPlacedScreen from '../screens/Vendor/OrderPlacedScreen';
import VendorOrdersScreen from '../screens/Vendor/VendorOrdersScreen';
// ONE map for a single pickup and for a multi-farm run — see the header of
// screens/shared/TrackScreen.jsx. It moved out of screens/Vendor because the
// FPO admin and the farmers whose crop is aboard open the same screen.
import TrackScreen from '../screens/shared/TrackScreen';
import { COLORS } from '../constants/colors';
// A buyer had no profile screen at all — ProfileScreen already handles every
// role (it branches on userData.role); it was simply never registered here.
import ProfileScreen from '../screens/Profile/ProfileScreen';
import EditProfileScreen from '../screens/Profile/EditProfileScreen';
import RequirementsScreen from '../screens/Vendor/RequirementsScreen';
import ShareVehicleScreen from '../screens/Vendor/ShareVehicleScreen';
import BundlesScreen from '../screens/Vendor/BundlesScreen';
import LotOrderScreen from '../screens/Vendor/LotOrderScreen';
import BusinessScreen from '../screens/Vendor/BusinessScreen';
import GrievancesScreen from '../screens/shared/GrievancesScreen';
import ReceiptScreen from '../screens/shared/ReceiptScreen';

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
          title: 'Market',
          // ⚠️ ICONS, NOT LABELS — AND THAT IS A BUG FIX, NOT A STYLE CHOICE.
          // This header carried SIX items, three of them text ("Groups",
          // "I Need", "Orders", plus two icons and "Logout"), at gap 18. On a
          // 360dp phone they overflowed and collided, and "Orders" was pushed
          // off the edge — so the buyer's entire order history and live
          // tracking were UNREACHABLE even though both screens existed and the
          // API was returning the data. Six icons at 21px with gap 13 fit the
          // same row with the title intact.
          //
          // Every one carries an accessibilityLabel, because an icon-only
          // control that a screen reader cannot name is a different bug.
          // ⚠️ SPLIT ACROSS BOTH SIDES, because six controls do not fit one
          // half of a phone header. They were six TEXT labels, then six icons —
          // both overflowed, and "Orders" fell off the edge, which made the
          // buyer's entire order history and live tracking unreachable even
          // though the screens existed and the API was serving the data.
          //
          // Two on the left, four on the right, and the title drops to a short
          // word so nothing has to share space with it.
          headerLeft: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginLeft: 14 }}>
              <TouchableOpacity
                accessibilityLabel="My orders"
                onPress={() => navigation.navigate('VendorOrders', { userData })}
              >
                <Ionicons name="receipt-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="Buy from a group"
                onPress={() => navigation.navigate('Bundles', { userData })}
              >
                <Ionicons name="people-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginRight: 14 }}>
              <TouchableOpacity
                accessibilityLabel="Post what I need"
                onPress={() => navigation.navigate('Requirements', { userData })}
              >
                <Ionicons name="megaphone-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="Grievances"
                onPress={() => navigation.navigate('Grievances')}
              >
                <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.primary} />
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
        name="Business"
        component={BusinessScreen}
        initialParams={{ userData }}
        options={{ title: 'Business Details' }}
      />

      <Stack.Screen
        name="Grievances"
        component={GrievancesScreen}
        options={{ title: 'Grievances' }}
      />

      <Stack.Screen
        name="Bundles"
        component={BundlesScreen}
        initialParams={{ userData }}
        options={{ title: 'Group Lots' }}
      />

      {/* F2 Phase F — quote → confirm for ONE (FPO, crop, grade) lot. */}
      <Stack.Screen
        name="LotOrder"
        component={LotOrderScreen}
        options={({ route }) => ({
          title: route.params?.lot?.cropName
            ? `${route.params.lot.cropName} lot`
            : 'Order a lot',
        })}
      />

      <Stack.Screen
        name="ShareVehicle"
        component={ShareVehicleScreen}
        initialParams={{ userData }}
        options={{ title: 'Share a Vehicle' }}
      />

      <Stack.Screen
        name="Requirements"
        component={RequirementsScreen}
        initialParams={{ userData }}
        options={{ title: 'What I Need' }}
      />

      <Stack.Screen
        name="Receipt"
        component={ReceiptScreen}
        options={{ title: 'Receipt' }}
      />

      <Stack.Screen
        name="TrackOrder"
        component={TrackScreen}
        options={{ headerShown: false }}
      />

      {/* GAP A — the buyer following the RUN carrying their bulk purchase.
          Same component, same payload shape, `consignmentId` instead of
          `orderId`. English, because the buyer's stack is English. */}
      <Stack.Screen
        name="TrackRun"
        component={TrackScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />

    </Stack.Navigator>
  );
};

export default VendorNavigator;

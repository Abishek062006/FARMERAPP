import React, { useState, useEffect } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { TouchableOpacity, Text, View, Image, Alert, ActivityIndicator } from 'react-native';
import { signOut } from 'firebase/auth';
import axios from 'axios';
import { auth } from '../utils/firebase';
import { API_ENDPOINTS } from '../utils/config';

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
import FarmerMarketScreen from '../screens/Farmer/FarmerMarketScreen';
import PriceOutlookScreen from '../screens/Farmer/PriceOutlookScreen';
import StorageScreen from '../screens/Farmer/StorageScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import EditProfileScreen from '../screens/Profile/EditProfileScreen';

import { COLORS } from '../constants/colors';
import BuyerDemandScreen from '../screens/Farmer/BuyerDemandScreen';
import FpoScreen from '../screens/Farmer/FpoScreen';
import FpoRegistryScreen from '../screens/Farmer/FpoRegistryScreen';
import FpoDashboardScreen from '../screens/Farmer/FpoDashboardScreen';
import FpoRunScreen from '../screens/Farmer/FpoRunScreen';
// Shared with FpoNavigator. FpoDashboardScreen links to BOTH of these, and
// that screen is rendered by both stacks — a target registered in only one
// navigator is the unregistered-route defect recorded in CLAUDE.md.
import FpoMembersScreen from '../screens/Fpo/FpoMembersScreen';
import FpoOrdersScreen from '../screens/Fpo/FpoOrdersScreen';
import FpoCollectionScreen from '../screens/Fpo/FpoCollectionScreen';
import FpoFocusCropsScreen from '../screens/Fpo/FpoFocusCropsScreen';
import FpoTermsScreen from '../screens/Fpo/FpoTermsScreen';
import FpoLotScreen from '../screens/Fpo/FpoLotScreen';
import FpoAllMembersScreen from '../screens/Fpo/FpoAllMembersScreen';
import FpoMemberDetailScreen from '../screens/Fpo/FpoMemberDetailScreen';
import RecordSaleScreen from '../screens/Farmer/RecordSaleScreen';
import HoldDecisionScreen from '../screens/Farmer/HoldDecisionScreen';
import GrievancesScreen from '../screens/shared/GrievancesScreen';
import ReceiptScreen from '../screens/shared/ReceiptScreen';
// GAP A — the same map the buyer gets. The FPO admin watching a run their
// group is driving, and a farmer whose crop is on the vehicle, read exactly the
// payload the buyer reads; `localized` is what keeps this side in Marathi while
// the buyer's own stack stays English.
import TrackScreen from '../screens/shared/TrackScreen';

const Stack = createStackNavigator();

// An FPO admin is NOT a farmer with an extra screen — they are an admin.
// A real FPO's CEO/Manager/Director may not farm at all. So when this account
// is the admin of a claimed FPO, the FPO Dashboard IS the app for them: it is
// the landing screen, and there is deliberately no route back into
// FarmerDashboard. FpoDashboardScreen reads `route.params.fpoId`, which the
// Dashboard route supplies via initialParams — so it is registered directly,
// with no wrapper. FpoScreen's own "View Dashboard" card still navigates to
// the separate "FpoDashboard" route independently; both paths coexist.

const FarmerNavigator = ({ userData }) => {
  // One-time, mount-only check: is this farmer the real admin of a real,
  // claimed FPO? If so their landing screen is the FPO Dashboard instead of
  // the normal FarmerDashboard. A regular farmer (fpo null, or fpo.isAdmin
  // false/absent) sees exactly the old behaviour. All hooks below sit above
  // the `checkingFpoAdmin` early return further down — that early return is
  // added AFTER these, never before, so the hook count never changes between
  // renders.
  const [fpoAdminId, setFpoAdminId] = useState(null);
  const [checkingFpoAdmin, setCheckingFpoAdmin] = useState(true);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_ENDPOINTS.FPOS}/mine`)
      .then((r) => {
        if (cancelled) return;
        const fpo = r.data?.fpo || null;
        if (fpo && fpo.isAdmin === true) {
          setFpoAdminId(fpo._id);
        } else {
          setFpoAdminId(null);
        }
      })
      .catch((e) => {
        // Fail open: never block a farmer's whole app on this auxiliary
        // check succeeding. Log only, no user-facing alert.
        console.error('⚠️ FPO admin landing-screen check failed:', e?.message || e);
        if (!cancelled) setFpoAdminId(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingFpoAdmin(false);
      });
    return () => { cancelled = true; };
  }, []);

  const DashboardComponent = fpoAdminId ? FpoDashboardScreen : FarmerDashboard;

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

  // Lightweight loading state while the one-time /mine check resolves —
  // reuses this app's existing ActivityIndicator convention
  // (`color="#16A34A"`, see FarmerDashboard.jsx / FpoScreen.jsx) rather than
  // inventing a new one. This early return sits AFTER every hook above it,
  // so the hook count is identical on every render.
  if (checkingFpoAdmin) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
        <ActivityIndicator color="#16A34A" />
      </View>
    );
  }

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
        initialParams={{ userData, fpoId: fpoAdminId }}
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

      {/* Phase 2a. The farmer's read-only view of the market they post into —
          their own lots beside everyone else's, and what the same crop is
          being asked for elsewhere. Registered next to FarmerSales because
          the two answer adjacent questions: what have I sold, and what is
          the market doing. */}
      {/* Phase 4 — D1 surfaced for the farmer. */}
      <Stack.Screen
        name="PriceOutlook"
        component={PriceOutlookScreen}
        options={{ title: 'Price outlook' }}
      />

      <Stack.Screen
        name="FarmerMarket"
        component={FarmerMarketScreen}
        options={{ title: 'My Produce' }}
      />

      <Stack.Screen
        name="FarmerSales"
        component={FarmerSalesScreen}
        // G1 entry point. A farmer coming back from the mandi lands on their
        // sales screen, so the way to record what happened there belongs here
        // rather than buried in a menu.
        options={({ navigation, route }) => ({
          title: 'My Sales',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate('RecordSale', { userData: route.params?.userData })}
              style={{ paddingHorizontal: 14, paddingVertical: 6 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Sold outside</Text>
            </TouchableOpacity>
          ),
        })}
      />

      {/* G1 — sales that happened at the APMC or with a trader */}
      <Stack.Screen
        name="RecordSale"
        component={RecordSaleScreen}
        options={{ title: 'Sales outside the app' }}
      />

      {/* H2 — should I hold, and what does waiting cost? */}
      <Stack.Screen
        name="HoldDecision"
        component={HoldDecisionScreen}
        options={{ title: 'Sell now or hold?' }}
      />

      {/* H1 — godowns, cold stores and kanda chawls near the farm */}
      <Stack.Screen
        name="Storage"
        component={StorageScreen}
        options={{ title: 'Storage Options' }}
      />

      {/* C4 — grievances, shared with the vendor navigator */}
      <Stack.Screen
        name="Grievances"
        component={GrievancesScreen}
        options={{ title: 'Grievances' }}
      />

      {/* F2 — producer groups */}
      <Stack.Screen
        name="Fpo"
        component={FpoScreen}
        initialParams={{ userData }}
        options={{ title: 'My Group' }}
      />

      {/* Real FPO registry (SFAC) — search, claim, or request to join a real,
          already-incorporated FPO. Reached from FpoScreen's empty state. */}
      <Stack.Screen
        name="FpoRegistry"
        component={FpoRegistryScreen}
        initialParams={{ userData }}
        options={{ title: 'Find your FPO' }}
      />

      {/* F2 admin dashboard — GET /api/fpos/:id/dashboard. Reached from a
          "View Dashboard" card on FpoScreen, shown only to fpo.isAdmin. */}
      <Stack.Screen
        name="FpoDashboard"
        component={FpoDashboardScreen}
        initialParams={{ userData }}
        options={{ title: 'Group Dashboard' }}
      />

      {/* Member approvals with the crop match, and the group's crop
          declaration. Reached from the shared FpoDashboardScreen, so both
          stacks must register them. FpoScreen's own inline approval list stays
          — a farmer-admin has both paths and they read the same routes. */}
      {/* Phase 2b. Registered in BOTH navigators because the shared
          FpoDashboardScreen links to it from the legacy farmer-account
          admin stack AND from the fpo-role stack. Same rule already
          followed by FpoMembers and FpoFocusCrops. */}
      <Stack.Screen
        name="FpoCollection"
        component={FpoCollectionScreen}
        options={{ title: 'Collect from members' }}
      />

      <Stack.Screen
        name="FpoOrders"
        component={FpoOrdersScreen}
        options={{ title: 'Group orders' }}
      />

      <Stack.Screen
        name="FpoMembers"
        component={FpoMembersScreen}
        initialParams={{ userData }}
        options={{ title: 'Members' }}
      />
      <Stack.Screen
        name="FpoFocusCrops"
        component={FpoFocusCropsScreen}
        initialParams={{ userData }}
        options={{ title: 'Group crops' }}
      />
      {/* Phase 3, D2. Admin-only, reached from FpoHomeScreen's link row and
          from FpoDashboard. Same dual-registration rule as FpoMembers and
          FpoFocusCrops above. */}
      <Stack.Screen
        name="FpoTerms"
        component={FpoTermsScreen}
        initialParams={{ userData }}
        options={{ title: 'Payment terms' }}
      />

      {/* One lot, opened up: who supplies it, what each is asking, and what
          they have actually delivered before. Reached from the shared
          FpoDashboardScreen, so BOTH stacks must register it. */}
      <Stack.Screen
        name="FpoLot"
        component={FpoLotScreen}
        initialParams={{ userData }}
        options={{ title: 'Lot' }}
      />

      {/* "See all" farmer performance + search, and one farmer's full detail
          and trade history — both reached from the shared FpoDashboardScreen
          (the Today tab's carousel/"See all" link and the Members tab), so
          BOTH stacks must register them, same rule as everything above. */}
      <Stack.Screen
        name="FpoAllMembers"
        component={FpoAllMembersScreen}
        initialParams={{ userData }}
        options={{ title: 'Members' }}
      />
      <Stack.Screen
        name="FpoMemberDetail"
        component={FpoMemberDetailScreen}
        initialParams={{ userData }}
        options={{ title: 'Member' }}
      />

      {/* Phase G — one collection run, opened from the dashboard's logistics
          list. On an `own`/`contracted` run there is no captain, so this is
          where the FPO admin records each stop's outcome; on a `hired` run the
          backend's agent-only rule still applies and the screen is read-only. */}
      <Stack.Screen
        name="FpoRun"
        component={FpoRunScreen}
        initialParams={{ userData }}
        options={{ title: 'Collection Run' }}
      />

      {/* GAP B — THE SAME SCREEN, OPENED BY THE PERSON AT THE GATE.
          `FpoRunScreen` resolves the viewer itself (utils/stopOutcome.js →
          runActorRole): the group's ASSIGNED DRIVER gets the stop list, the OTP
          field and the position ping; the admin keeps the office-side fallback
          on the very same run, unchanged. Two route names, one screen, because
          the two arrive from different places — the driver from their dashboard,
          the admin from the group dashboard's run list. */}
      <Stack.Screen
        name="FpoDriverRun"
        component={FpoRunScreen}
        initialParams={{ userData }}
        options={{ title: 'Your run' }}
      />

      {/* GAP A — the run on a map, for the FPO admin and for a farmer whose
          crop is aboard. Same component the buyer uses. */}
      <Stack.Screen
        name="TrackRun"
        component={TrackScreen}
        initialParams={{ localized: true }}
        options={{ headerShown: false }}
      />

      {/* Phase E — the demand side */}
      <Stack.Screen
        name="BuyerDemand"
        component={BuyerDemandScreen}
        initialParams={{ userData }}
        options={{ title: 'Buyers Looking' }}
      />

      {/* C5 receipt + C4 grievance, shared with the vendor navigator */}
      <Stack.Screen
        name="Receipt"
        component={ReceiptScreen}
        options={{ title: 'Receipt' }}
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

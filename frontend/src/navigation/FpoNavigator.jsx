import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { TouchableOpacity, Text, View, Image, Alert } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../utils/firebase';
import { COLORS } from '../constants/colors';

import FpoHomeScreen from '../screens/Fpo/FpoHomeScreen';
import FpoMembersScreen from '../screens/Fpo/FpoMembersScreen';
import FpoOrdersScreen from '../screens/Fpo/FpoOrdersScreen';
import FpoCollectionScreen from '../screens/Fpo/FpoCollectionScreen';
import FpoFocusCropsScreen from '../screens/Fpo/FpoFocusCropsScreen';
import FpoTermsScreen from '../screens/Fpo/FpoTermsScreen';
import FpoLotScreen from '../screens/Fpo/FpoLotScreen';
import FpoAllMembersScreen from '../screens/Fpo/FpoAllMembersScreen';
import FpoMemberDetailScreen from '../screens/Fpo/FpoMemberDetailScreen';
// These four live under screens/Farmer/ and are NOT moved. They are reached
// from BOTH stacks: this one, and the farmer stack for a legacy farmer-account
// that admins a group (see models/User.js on why that shape is permanent).
// Moving the files would have meant touching the farmer stack's imports for no
// behavioural gain, and two copies would have been strictly worse.
import FpoRegistryScreen from '../screens/Farmer/FpoRegistryScreen';
import FpoDashboardScreen from '../screens/Farmer/FpoDashboardScreen';
import FpoRunScreen from '../screens/Farmer/FpoRunScreen';
import TrackScreen from '../screens/shared/TrackScreen';
import GrievancesScreen from '../screens/shared/GrievancesScreen';
import ReceiptScreen from '../screens/shared/ReceiptScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import EditProfileScreen from '../screens/Profile/EditProfileScreen';

const Stack = createStackNavigator();

// ═══════════════════════════════════════════════════════════════════════════
// THE FPO's OWN STACK — `role: 'fpo'`
// ═══════════════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS RATHER THAN A BRANCH INSIDE FarmerNavigator.
//   FarmerNavigator already swaps its Dashboard component for an FPO admin,
//   which was the right patch while an FPO admin WAS a farmer account. It is
//   the wrong shape for an organisation: that stack registers twenty screens
//   about land, plots, crops, tasks, harvests and mandi sales, none of which an
//   FPO account may even call — every one of those routes is
//   `requireRole('farmer')` on the server. Registering them would put twenty
//   dead ends one tap away.
//
//   So this stack is DEFINED BY WHAT IS ABSENT. There is no LandList, no
//   CropRegistration, no TaskManagement, no HarvestPostModal, no RecordSale, no
//   MarketPrices, no Storage, no FpoScreen ("My Group" is a farmer's question),
//   and — the property the brief asks for explicitly — no route back into
//   FarmerDashboard, because there is nothing to go back to.
//
// WHAT IS HERE IS EXACTLY WHAT AN FPO OFFICER DOES:
//   Home        which of the four claim/admin states this account is in
//   FpoRegistry find the company in the SFAC registry and claim it
//   FpoDashboard the group: members, produce by grade, runs, settlement
//   FpoRun      one collection run — assign a driver, or record from the office
//   TrackRun    the run on a map
//   Grievances / Receipt / Profile
//
// FarmerNavigator's own FPO branch STAYS. A farmer-account admin still lands on
// their dashboard from inside the farmer stack, unchanged. Two entry points,
// one set of screens, because there are genuinely two kinds of admin and only
// one of them is going away over time.

const FpoNavigator = ({ userData }) => {
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
              await signOut(auth);
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
      {/* The landing screen resolves its own state from
          GET /api/fpos/admin/mine, so it is registered unconditionally — no
          mount-time fetch in the navigator, and therefore nothing to go stale
          when a claim is approved while the app is open. */}
      <Stack.Screen
        name="FpoHome"
        component={FpoHomeScreen}
        initialParams={{ userData }}
        options={({ navigation: nav }) => ({
          title: 'NELIR',
          headerLeft: () => (
            <TouchableOpacity style={{ marginLeft: 16 }} onPress={handleLogout}>
              <Text style={{ color: COLORS.primary, fontSize: 16, fontWeight: 'bold' }}>
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
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: COLORS.primary,
                  alignItems: 'center', justifyContent: 'center', marginRight: 8,
                }}>
                  <Text style={{ fontSize: 14 }}>🏛️</Text>
                </View>
              )}
              <Text
                style={{ color: COLORS.primary, fontSize: 14, fontWeight: 'bold', maxWidth: 90 }}
                numberOfLines={1}
              >
                {userData?.name || 'FPO'}
              </Text>
            </TouchableOpacity>
          ),
        })}
      />

      <Stack.Screen
        name="FpoRegistry"
        component={FpoRegistryScreen}
        initialParams={{ userData }}
        options={{ title: 'Find your FPO' }}
      />

      <Stack.Screen
        name="FpoDashboard"
        component={FpoDashboardScreen}
        initialParams={{ userData }}
        options={{ title: 'Group Dashboard' }}
      />

      {/* Approve or reject applicants, with each one's crop match against what
          the group deals in. Before this existed the `fpo` account could not
          admit a member at all from the UI — the routes were there and nothing
          called them. */}
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

      {/* Declare which crops this group deals in. Advisory — see
          backend/services/focusCropService.js. */}
      <Stack.Screen
        name="FpoFocusCrops"
        component={FpoFocusCropsScreen}
        initialParams={{ userData }}
        options={{ title: 'Group crops' }}
      />

      {/* Phase 3, D2. Admin-only. Same dual-registration rule as above. */}
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
          and trade history — both reached from the shared FpoDashboardScreen,
          so BOTH stacks must register them, same rule as above. */}
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

      {/* One collection run. On an own/contracted run this is where the office
          records each stop, and where a driver account is assigned; on a hired
          run the server's agent-only rule still applies and it is read-only. */}
      <Stack.Screen
        name="FpoRun"
        component={FpoRunScreen}
        initialParams={{ userData }}
        options={{ title: 'Collection Run' }}
      />

      <Stack.Screen
        name="TrackRun"
        component={TrackScreen}
        initialParams={{ localized: true }}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="Grievances"
        component={GrievancesScreen}
        options={{ title: 'Grievances' }}
      />

      <Stack.Screen
        name="Receipt"
        component={ReceiptScreen}
        options={{ title: 'Receipt' }}
      />

      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
};

export default FpoNavigator;

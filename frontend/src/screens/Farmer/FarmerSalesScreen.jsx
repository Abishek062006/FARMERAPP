import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import VehicleIcon from '../../components/vehicles/VehicleIcon';
import usePolling from '../../hooks/usePolling';

// What the farmer sees after posting a harvest: what is still on the market,
// and who is coming to collect what has sold.
//
// The pickup code lives here. Without it a driver arrives at a farm gate where
// the farmer has heard nothing about a sale — which is exactly what the
// original design did.
const ORDER_STATUS = {
  awaiting_agent: { label: 'Finding a driver', bg: '#FFF7ED', fg: '#C2410C', dot: '#EA580C' },
  no_agents:      { label: 'No driver yet',    bg: '#FEF2F2', fg: '#B91C1C', dot: '#DC2626' },
  accepted:       { label: 'Driver coming',    bg: '#EFF6FF', fg: '#1D4ED8', dot: '#2563EB' },
  picked_up:      { label: 'Collected',        bg: '#DCFCE7', fg: '#15803D', dot: '#16A34A' },
  delivered:      { label: 'Delivered',        bg: '#DCFCE7', fg: '#15803D', dot: '#16A34A' },
  cancelled:      { label: 'Cancelled',        bg: '#F1F5F9', fg: '#6B7280', dot: '#9CA3AF' },
};

export default function FarmerSalesScreen({ navigation, route }) {
  const { userData } = route.params || {};
  const uid = userData?.uid || userData?.firebaseUid;

  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    const [o, l] = await Promise.all([
      axios.get(`${API_ENDPOINTS.ORDERS}/farmer/mine`),
      axios.get(`${API_ENDPOINTS.LISTINGS}/farmer/${uid}`),
    ]);
    if (o.data.success) setOrders(o.data.orders);
    if (l.data.success) setListings(l.data.listings);
    setLoading(false);
    setRefreshing(false);
  }, [uid]);

  usePolling(fetchAll, 8000, true);

  const withdraw = (listing) =>
    Alert.alert('Remove from market?', `${listing.cropName} will no longer be visible to vendors.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await axios.put(`${API_ENDPOINTS.LISTINGS}/${listing._id}/withdraw`);
            fetchAll();
          } catch (err) {
            Alert.alert('Could not remove', err.response?.data?.error || 'Please try again.');
          }
        },
      },
    ]);

  const OrderCard = ({ item }) => {
    const st = ORDER_STATUS[item.status] || ORDER_STATUS.awaiting_agent;
    const showCode = ['accepted'].includes(item.status);

    return (
      <View style={s.card}>
        <View style={s.topRow}>
          <View style={[s.chip, { backgroundColor: st.bg }]}>
            <View style={[s.dot, { backgroundColor: st.dot }]} />
            <Text style={[s.chipText, { color: st.fg }]}>{st.label}</Text>
          </View>
          <Text style={s.date}>
            {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </Text>
        </View>

        <View style={s.cropRow}>
          <View style={s.cropIcon}><Text style={{ fontSize: 20 }}>🌾</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.cropName}>{item.quantityKg} kg {item.cropName}</Text>
            <Text style={s.cropSub}>sold to {item.vendorName}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.earnLabel}>YOU GET</Text>
            <Text style={s.earnValue}>₹{item.cropTotal?.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {showCode && (
          <View style={s.otpBox}>
            <View style={{ flex: 1 }}>
              <Text style={s.otpLabel}>Pickup code</Text>
              <Text style={s.otpHint}>Give this to the driver when they load your crop</Text>
            </View>
            <Text style={s.otpValue}>{item.pickupOtp}</Text>
          </View>
        )}

        {!!item.agentName && (
          <View style={s.agentBox}>
            <VehicleIcon type={item.vehicleType} width={44} />
            <View style={{ flex: 1 }}>
              <Text style={s.agentName}>{item.agentName}</Text>
              <Text style={s.agentSub}>{item.agentVehicleNumber || 'Vehicle number pending'}</Text>
            </View>
            {!!item.agentPhone && (
              <TouchableOpacity style={s.callChip} onPress={() => Linking.openURL(`tel:${item.agentPhone}`)}>
                <Ionicons name="call" size={13} color="#2563EB" />
                <Text style={s.callChipText}>Call</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const ListingCard = ({ item }) => {
    const sold = item.quantityKg - item.quantityAvailableKg;
    const pct = item.quantityKg ? Math.round((sold / item.quantityKg) * 100) : 0;
    const live = item.status === 'available';

    return (
      <View style={s.card}>
        <View style={s.topRow}>
          <View style={[s.chip, { backgroundColor: live ? '#DCFCE7' : '#F1F5F9' }]}>
            <View style={[s.dot, { backgroundColor: live ? '#16A34A' : '#9CA3AF' }]} />
            <Text style={[s.chipText, { color: live ? '#15803D' : '#6B7280' }]}>
              {live ? 'On the market' : item.status === 'sold_out' ? 'Sold out' : 'Removed'}
            </Text>
          </View>
          {live && (
            <TouchableOpacity onPress={() => withdraw(item)} hitSlop={8}>
              <Text style={s.removeText}>Remove</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.cropRow}>
          {item.proofImageId ? (
            <Image source={{ uri: API_ENDPOINTS.LISTING_PHOTO(item.proofImageId) }} style={s.thumb} />
          ) : (
            <View style={s.cropIcon}><Text style={{ fontSize: 20 }}>🌾</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.cropName}>{item.cropName}</Text>
            <Text style={s.cropSub}>₹{item.pricePerKg}/kg · min {item.minOrderKg} kg</Text>
          </View>
        </View>

        <View style={s.progressWrap}>
          <View style={s.progressBar}><View style={[s.progressFill, { width: `${pct}%` }]} /></View>
          <Text style={s.progressText}>
            {sold} of {item.quantityKg} kg sold{live ? ` · ${item.quantityAvailableKg} kg left` : ''}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#16A34A" /></View>;
  }

  const data = tab === 'orders' ? orders : listings;
  const pending = orders.filter((o) => ['awaiting_agent', 'accepted'].includes(o.status)).length;

  return (
    <View style={s.container}>
      <View style={s.tabBar}>
        {[['orders', 'Pickups', orders.length], ['listings', 'My Listings', listings.length]].map(([k, label, n]) => (
          <TouchableOpacity key={k} style={[s.tab, tab === k && s.tabOn]} onPress={() => setTab(k)}>
            <Text style={[s.tabText, tab === k && s.tabTextOn]}>{label}</Text>
            {n > 0 && (
              <View style={[s.tabBadge, { backgroundColor: tab === k ? '#DCFCE7' : '#F1F5F9' }]}>
                <Text style={[s.tabBadgeText, { color: tab === k ? '#16A34A' : '#9CA3AF' }]}>{n}</Text>
              </View>
            )}
            {k === 'orders' && pending > 0 && tab !== 'orders' && <View style={s.pendingDot} />}
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={data}
        keyExtractor={(i) => i._id}
        renderItem={({ item }) => (tab === 'orders' ? <OrderCard item={item} /> : <ListingCard item={item} />)}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor="#16A34A"
            onRefresh={() => { setRefreshing(true); fetchAll(); }} />
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Ionicons name={tab === 'orders' ? 'cube-outline' : 'storefront-outline'} size={34} color="#16A34A" />
            </View>
            <Text style={s.emptyTitle}>
              {tab === 'orders' ? 'No pickups yet' : 'Nothing listed yet'}
            </Text>
            <Text style={s.emptySub}>
              {tab === 'orders'
                ? 'When a vendor buys your crop, the pickup will appear here with a code for the driver.'
                : 'Open a harvested crop and post it to the Farm Market.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  list:      { padding: 16, gap: 12, paddingBottom: 40 },

  tabBar: { flexDirection: 'row', backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  tab:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn:  { borderBottomColor: '#16A34A' },
  tabText:      { fontSize: 14, color: '#9CA3AF', fontWeight: '600' },
  tabTextOn:    { color: '#16A34A' },
  tabBadge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  tabBadgeText: { fontSize: 11, fontWeight: '700' },
  pendingDot:   { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EA580C', marginLeft: -4, marginTop: -8 },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 5, borderWidth: 1, borderColor: '#F1F5F9',
  },
  topRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  dot:      { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 12, fontWeight: '700' },
  date:     { fontSize: 11.5, color: '#9CA3AF' },
  removeText: { fontSize: 12.5, color: '#B91C1C', fontWeight: '700' },

  cropRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cropIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' },
  thumb:    { width: 42, height: 42, borderRadius: 12, backgroundColor: '#F1F5F9' },
  cropName: { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  cropSub:  { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  earnLabel:{ fontSize: 9, color: '#9CA3AF', fontWeight: '700', letterSpacing: 0.5 },
  earnValue:{ fontSize: 17, fontWeight: '800', color: '#15803D' },

  otpBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F0FDF4', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  otpLabel: { fontSize: 12.5, color: '#15803D', fontWeight: '800' },
  otpHint:  { fontSize: 11.5, color: '#6B7280', marginTop: 2, lineHeight: 16 },
  otpValue: { fontSize: 26, fontWeight: '800', color: '#15803D', letterSpacing: 5 },

  agentBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 11,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  agentName: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  agentSub:  { fontSize: 11.5, color: '#9CA3AF', marginTop: 1 },
  callChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EFF6FF',
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE',
  },
  callChipText: { fontSize: 12.5, color: '#2563EB', fontWeight: '700' },

  progressWrap: { gap: 6 },
  progressBar:  { height: 6, borderRadius: 3, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  progressText: { fontSize: 12, color: '#6B7280' },

  emptyWrap: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 30, gap: 8 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle:{ fontSize: 17, fontWeight: '700', color: '#1F2937' },
  emptySub:  { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 21 },
});

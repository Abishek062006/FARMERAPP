import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import VehicleIcon from '../../components/vehicles/VehicleIcon';
import usePolling from '../../hooks/usePolling';

// Status → how it looks and what the vendor can do about it.
const STATUS = {
  awaiting_agent: { label: 'Finding a driver', tone: 'warn',    can: ['cancel'] },
  no_agents:      { label: 'No driver found',  tone: 'danger',  can: ['retry', 'cancel'] },
  accepted:       { label: 'Driver on the way', tone: 'info',   can: [] },
  picked_up:      { label: 'Out for delivery',  tone: 'info',   can: [] },
  delivered:      { label: 'Delivered',         tone: 'good',   can: [] },
  cancelled:      { label: 'Cancelled',         tone: 'muted',  can: [] },
};

const TONE = {
  warn:   { bg: '#FFF7ED', fg: '#C2410C', dot: '#EA580C' },
  danger: { bg: '#FEF2F2', fg: '#B91C1C', dot: '#DC2626' },
  info:   { bg: '#EFF6FF', fg: '#1D4ED8', dot: '#2563EB' },
  good:   { bg: '#DCFCE7', fg: '#15803D', dot: '#16A34A' },
  muted:  { bg: '#F1F5F9', fg: '#6B7280', dot: '#9CA3AF' },
};

export default function VendorOrdersScreen({ navigation, route }) {
  const { userData } = route.params || {};
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const fetchOrders = useCallback(async () => {
    const r = await axios.get(`${API_ENDPOINTS.ORDERS}/vendor/mine`);
    if (r.data.success) setOrders(r.data.orders);
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Orders change without the vendor doing anything — a driver accepts, or a
  // dispatch lapses — so this list polls while it is on screen. usePolling
  // stops it on blur and on backgrounding.
  usePolling(fetchOrders, 6000, true);

  const act = async (order, what) => {
    setBusyId(order._id);
    try {
      const r = await axios.post(`${API_ENDPOINTS.ORDERS}/${order._id}/${what}`, {});
      if (r.data.success) await fetchOrders();
    } catch (err) {
      Alert.alert('Could not update', err.response?.data?.error || 'Please try again.');
      await fetchOrders();
    } finally {
      setBusyId(null);
    }
  };

  const confirmCancel = (order) =>
    Alert.alert(
      'Cancel this order?',
      `${order.quantityKg} kg of ${order.cropName} will go back on the market and nothing will be charged.`,
      [
        { text: 'Keep order', style: 'cancel' },
        { text: 'Cancel order', style: 'destructive', onPress: () => act(order, 'cancel') },
      ]
    );

  const Card = ({ item }) => {
    const meta = STATUS[item.status] || STATUS.awaiting_agent;
    const tone = TONE[meta.tone];
    const busy = busyId === item._id;

    const trackable = ['accepted', 'picked_up'].includes(item.status);

    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={trackable ? 0.85 : 1}
        disabled={!trackable}
        onPress={() => navigation.navigate('TrackOrder', { orderId: item._id })}
      >
        <View style={s.topRow}>
          <View style={[s.statusChip, { backgroundColor: tone.bg }]}>
            <View style={[s.statusDot, { backgroundColor: tone.dot }]} />
            <Text style={[s.statusText, { color: tone.fg }]}>{meta.label}</Text>
          </View>
          <Text style={s.date}>
            {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </Text>
        </View>

        <View style={s.cropRow}>
          <View style={s.cropIcon}><Text style={{ fontSize: 20 }}>🌾</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.cropName}>{item.cropName}</Text>
            <Text style={s.cropSub}>{item.quantityKg} kg · from {item.farmerName}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.totalLabel}>TOTAL</Text>
            <Text style={s.totalValue}>₹{item.grandTotal?.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.tripRow}>
          <VehicleIcon type={item.vehicleType} width={46} />
          <View style={{ flex: 1 }}>
            <Text style={s.tripText} numberOfLines={1}>
              {item.pickup?.district} <Text style={s.arrow}>→</Text> {item.dropoff?.label}
            </Text>
            <Text style={s.tripSub}>{item.distanceKm} km · ₹{item.fare?.total} transport</Text>
          </View>
        </View>

        {/* Driver details appear the moment someone accepts (phase 4). */}
        {item.agentName && (
          <View style={s.agentBox}>
            <View style={s.agentAvatar}>
              <Text style={s.agentAvatarText}>{item.agentName[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.agentName}>{item.agentName}</Text>
              <Text style={s.agentVehicle}>{item.agentVehicleNumber || 'Vehicle number pending'}</Text>
            </View>
            {!!item.agentPhone && (
              <TouchableOpacity style={s.callChip} onPress={() => Linking.openURL(`tel:${item.agentPhone}`)}>
                <Ionicons name="call" size={13} color="#2563EB" />
                <Text style={s.callChipText}>Call</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {['accepted', 'picked_up'].includes(item.status) && !!item.dropOtp && (
          <View style={s.otpRow}>
            <Text style={s.otpLabel}>Delivery code</Text>
            <Text style={s.otpValue}>{item.dropOtp}</Text>
          </View>
        )}

        {meta.can.length > 0 && (
          <View style={s.actions}>
            {meta.can.includes('retry') && (
              <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={() => act(item, 'retry')} disabled={busy}>
                {busy ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="refresh" size={15} color="#fff" />
                    <Text style={s.btnPrimaryText}>Find a driver again</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {meta.can.includes('cancel') && (
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => confirmCancel(item)} disabled={busy}>
                <Text style={s.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {trackable && (
          <View style={s.trackRow}>
            <Ionicons name="location" size={15} color="#2563EB" />
            <Text style={s.trackText}>Track live</Text>
            <Ionicons name="chevron-forward" size={15} color="#2563EB" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#16A34A" />
        <Text style={s.loadingText}>Loading your orders…</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={s.container}
      data={orders}
      keyExtractor={(i) => i._id}
      renderItem={({ item }) => <Card item={item} />}
      contentContainerStyle={s.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} tintColor="#16A34A"
          onRefresh={() => { setRefreshing(true); fetchOrders(); }} />
      }
      ListEmptyComponent={
        <View style={s.emptyWrap}>
          <View style={s.emptyIcon}><Ionicons name="receipt-outline" size={34} color="#16A34A" /></View>
          <Text style={s.emptyTitle}>No orders yet</Text>
          <Text style={s.emptySub}>Buy a crop from the market and it will show up here.</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => navigation.popToTop()}>
            <Text style={s.emptyBtnText}>Browse the market</Text>
          </TouchableOpacity>
        </View>
      }
    />
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F8FAFC' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },
  list:        { padding: 16, gap: 12, paddingBottom: 40 },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 5, borderWidth: 1, borderColor: '#F1F5F9',
  },
  topRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  date:       { fontSize: 11.5, color: '#9CA3AF' },

  cropRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cropIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' },
  cropName: { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  cropSub:  { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  totalLabel: { fontSize: 9, color: '#9CA3AF', fontWeight: '700', letterSpacing: 0.5 },
  totalValue: { fontSize: 17, fontWeight: '800', color: '#15803D' },

  divider: { height: 1, backgroundColor: '#F1F5F9' },

  tripRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tripText: { fontSize: 13.5, color: '#374151', fontWeight: '600' },
  arrow:    { color: '#16A34A' },
  tripSub:  { fontSize: 11.5, color: '#9CA3AF', marginTop: 2 },

  agentBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 11,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  agentAvatar:     { width: 34, height: 34, borderRadius: 17, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  agentAvatarText: { fontSize: 15, fontWeight: '700', color: '#16A34A' },
  agentName:       { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  agentVehicle:    { fontSize: 11.5, color: '#9CA3AF', marginTop: 1 },
  callChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#EFF6FF', paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE',
  },
  callChipText: { fontSize: 12.5, color: '#2563EB', fontWeight: '700' },

  otpRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F0FDF4', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  otpLabel: { fontSize: 12.5, color: '#15803D', fontWeight: '700' },
  otpValue: { fontSize: 20, fontWeight: '800', color: '#15803D', letterSpacing: 4 },

  trackRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 11,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  trackText: { fontSize: 14, color: '#2563EB', fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 12, borderRadius: 12,
  },
  btnPrimary:     { backgroundColor: '#16A34A' },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnGhost:       { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  btnGhostText:   { color: '#6B7280', fontSize: 14, fontWeight: '700' },

  emptyWrap: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 30, gap: 8 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle:{ fontSize: 17, fontWeight: '700', color: '#1F2937' },
  emptySub:  { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 21 },
  emptyBtn:  { marginTop: 10, backgroundColor: '#16A34A', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Linking, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { getCurrentLocation } from '../../services/locationService';

const { width } = Dimensions.get('window');

export default function VendorDashboard({ route }) {
  const { userData } = route.params || {};
  const [listings, setListings]     = useState([]);
  const [myDeals, setMyDeals]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]               = useState('market');
  const [city, setCity]             = useState('');

  const vendorUid     = userData?.firebaseUid || userData?.uid || userData?._id || null;
  const vendorName    = userData?.name || 'Vendor';
  const vendorPhone   = userData?.phone || '';
  const vendorCompany = userData?.company || userData?.name || 'Vendor';

  useEffect(() => {
    (async () => {
      try {
        const loc = await getCurrentLocation();
        const matchCity = loc.district || loc.city || 'Chennai';
        console.log('📍 Vendor city detected:', matchCity);
        setCity(matchCity);
      } catch {
        setCity('Chennai');
      }
    })();
  }, []);

  useEffect(() => {
    if (city && vendorUid) fetchData();
  }, [city, vendorUid]);

  const fetchData = async () => {
    setLoading(true);
    try {
      console.log('🏪 Fetching market for city:', city);
      const [mktRes, dealsRes] = await Promise.all([
        axios.get(`${API_ENDPOINTS.LISTINGS}?city=${city}`),
        axios.get(`${API_ENDPOINTS.LISTINGS}/vendor/${vendorUid}`),
      ]);
      if (mktRes.data.success)   setListings(mktRes.data.listings);
      if (dealsRes.data.success) setMyDeals(dealsRes.data.listings);
    } catch (err) {
      console.error('❌ Fetch error:', err.message);
      Alert.alert('Error', 'Failed to load market data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAccept = (listing) => {
    Alert.alert(
      '🛒 Send Offer',
      `Send offer to buy ${listing.quantityKg} kg of ${listing.cropName} for ₹${listing.totalPrice}?\n\nThe farmer will be notified and must confirm.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Offer',
          onPress: async () => {
            try {
              const r = await axios.put(
                `${API_ENDPOINTS.LISTINGS}/${listing._id}/accept`,
                { vendorUid, vendorName, vendorPhone, vendorCompany }
              );
              if (r.data.success) {
                Alert.alert('📨 Offer Sent!', `Waiting for ${listing.farmerName} to confirm.`);
                fetchData();
              }
            } catch (err) {
              const msg = err.response?.data?.error || 'Failed to send offer';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  // ── MARKET CARD ────────────────────────────────────────────────────────────
  const MarketCard = ({ item }) => (
    <View style={s.card}>
      {/* Crop name + total */}
      <View style={s.cardTopRow}>
        <View style={s.cropIconWrap}>
          <Text style={s.cropEmoji}>🌾</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cropName}>{item.cropName}</Text>
          <Text style={s.farmerMeta}>
            <Ionicons name="person-outline" size={12} color="#9CA3AF" /> {item.farmerName}
          </Text>
        </View>
        <View style={s.priceBox}>
          <Text style={s.priceBoxLabel}>TOTAL</Text>
          <Text style={s.priceBoxValue}>₹{item.totalPrice?.toLocaleString()}</Text>
        </View>
      </View>

      <View style={s.divider} />

      {/* Details row */}
      <View style={s.detailsRow}>
        <View style={s.detailChip}>
          <Ionicons name="cube-outline" size={13} color="#6B7280" />
          <Text style={s.detailChipText}>{item.quantityKg} kg</Text>
        </View>
        <View style={s.detailChip}>
          <Ionicons name="pricetag-outline" size={13} color="#6B7280" />
          <Text style={s.detailChipText}>₹{item.pricePerKg}/kg</Text>
        </View>
        <View style={s.detailChip}>
          <Ionicons name="location-outline" size={13} color="#6B7280" />
          <Text style={s.detailChipText}>{item.location?.district}</Text>
        </View>
      </View>

      {/* CTA */}
      <TouchableOpacity style={s.sendOfferBtn} onPress={() => handleAccept(item)} activeOpacity={0.8}>
        <Ionicons name="send" size={15} color="#fff" />
        <Text style={s.sendOfferText}>Send Offer to Farmer</Text>
      </TouchableOpacity>
    </View>
  );

  // ── MY DEALS CARD ──────────────────────────────────────────────────────────
  const DealCard = ({ item }) => {
    const isPending   = item.status === 'pending';
    const isConfirmed = item.status === 'confirmed';

    return (
      <View style={s.card}>
        {/* Status row */}
        <View style={s.dealHeaderRow}>
          <View style={[s.statusChip, { backgroundColor: isConfirmed ? '#DCFCE7' : '#FFF7ED' }]}>
            <View style={[s.statusDot, { backgroundColor: isConfirmed ? '#16A34A' : '#EA580C' }]} />
            <Text style={[s.statusChipText, { color: isConfirmed ? '#15803D' : '#C2410C' }]}>
              {isConfirmed ? 'Confirmed' : 'Awaiting Farmer'}
            </Text>
          </View>
          <Text style={s.dealDate}>
            {new Date(item.acceptedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </Text>
        </View>

        {/* Crop + price */}
        <View style={s.cardTopRow}>
          <View style={s.cropIconWrap}>
            <Text style={s.cropEmoji}>🌾</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cropName}>{item.cropName}</Text>
            <Text style={s.farmerMeta}>{item.quantityKg} kg · ₹{item.pricePerKg}/kg</Text>
          </View>
          <View style={s.priceBox}>
            <Text style={s.priceBoxLabel}>TOTAL</Text>
            <Text style={s.priceBoxValue}>₹{item.totalPrice?.toLocaleString()}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Farmer contact box */}
        <View style={s.contactBox}>
          <View style={s.contactBoxHeader}>
            <View style={s.farmerAvatar}>
              <Text style={s.farmerAvatarText}>
                {(item.farmerName || 'F')[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.farmerNameText}>{item.farmerName}</Text>
              <Text style={s.contactBoxLabel}>Farmer</Text>
            </View>
          </View>

          {item.farmerPhone ? (
            <TouchableOpacity
              style={s.callChip}
              onPress={() => Linking.openURL(`tel:${item.farmerPhone}`)}
            >
              <Ionicons name="call" size={13} color="#2563EB" />
              <Text style={s.callChipText}>{item.farmerPhone}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={s.contactHint}>📞 Contact visible after farmer confirms</Text>
          )}
        </View>

        {/* Timestamps */}
        <Text style={s.dealTimestamp}>
          Offer sent: {new Date(item.acceptedAt).toLocaleDateString('en-IN')}
          {isConfirmed && item.confirmedAt
            ? `  ·  Confirmed: ${new Date(item.confirmedAt).toLocaleDateString('en-IN')}`
            : ''}
        </Text>

        {/* Confirmed banner */}
        {isConfirmed && (
          <View style={s.confirmedBanner}>
            <Ionicons name="ribbon-outline" size={13} color="#15803D" />
            <Text style={s.confirmedBannerText}>Deal locked in — contact the farmer above</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#16A34A" />
        <Text style={s.loadingText}>
          Loading market near {city || 'your location'}...
        </Text>
      </View>
    );
  }

  const pendingDeals = myDeals.filter(d => d.status === 'pending').length;

  return (
    <View style={s.container}>

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.vendorBadge}>
          <Ionicons name="storefront" size={14} color="#16A34A" />
          <Text style={s.vendorBadgeText}>VENDOR</Text>
        </View>
        <Text style={s.headerTitle}>Welcome, {vendorName} 👋</Text>
        <View style={s.headerLocationRow}>
          <Ionicons name="location" size={13} color="#9CA3AF" />
          <Text style={s.headerSub}>{city} Market</Text>
        </View>
      </View>

      {/* ── TABS ──────────────────────────────────────────────────────────── */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tabItem, tab === 'market' && s.tabItemActive]}
          onPress={() => setTab('market')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="storefront-outline"
            size={17}
            color={tab === 'market' ? '#16A34A' : '#9CA3AF'}
          />
          <Text style={[s.tabText, tab === 'market' && s.tabTextActive]}>
            Market
          </Text>
          {listings.length > 0 && (
            <View style={[s.tabBadge, { backgroundColor: tab === 'market' ? '#DCFCE7' : '#F1F5F9' }]}>
              <Text style={[s.tabBadgeText, { color: tab === 'market' ? '#16A34A' : '#9CA3AF' }]}>
                {listings.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.tabItem, tab === 'deals' && s.tabItemActive]}
          onPress={() => setTab('deals')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="checkmark-done-outline"
            size={17}
            color={tab === 'deals' ? '#16A34A' : '#9CA3AF'}
          />
          <Text style={[s.tabText, tab === 'deals' && s.tabTextActive]}>
            My Deals
          </Text>
          {myDeals.length > 0 && (
            <View style={[s.tabBadge, { backgroundColor: tab === 'deals' ? '#DCFCE7' : '#F1F5F9' }]}>
              <Text style={[s.tabBadgeText, { color: tab === 'deals' ? '#16A34A' : '#9CA3AF' }]}>
                {myDeals.length}
              </Text>
            </View>
          )}
          {pendingDeals > 0 && tab !== 'deals' && (
            <View style={s.pendingDot} />
          )}
        </TouchableOpacity>
      </View>

      {/* ── CONTENT ───────────────────────────────────────────────────────── */}
      {tab === 'market' ? (
        <FlatList
          data={listings}
          keyExtractor={(i) => i._id}
          renderItem={({ item }) => <MarketCard item={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} tintColor="#16A34A" />}
          contentContainerStyle={s.listContent}
          ListHeaderComponent={
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Available Crops</Text>
              <Text style={s.sectionSub}>in {city}</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={s.emptyIconCircle}>
                <Ionicons name="storefront-outline" size={36} color="#16A34A" />
              </View>
              <Text style={s.emptyTitle}>No listings yet</Text>
              <Text style={s.emptySub}>No crops available in {city} right now.{'\n'}Pull down to refresh.</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={myDeals}
          keyExtractor={(i) => i._id}
          renderItem={({ item }) => <DealCard item={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} tintColor="#16A34A" />}
          contentContainerStyle={s.listContent}
          ListHeaderComponent={
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Your Offers & Deals</Text>
              {pendingDeals > 0 && (
                <View style={s.pendingBadge}>
                  <Text style={s.pendingBadgeText}>{pendingDeals} pending</Text>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={s.emptyIconCircle}>
                <Ionicons name="bag-outline" size={36} color="#16A34A" />
              </View>
              <Text style={s.emptyTitle}>No offers yet</Text>
              <Text style={s.emptySub}>Send your first offer from the Market tab.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F8FAFC' },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },

  // ── Header
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
  },
  vendorBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#DCFCE7', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: 'flex-start', marginBottom: 8,
  },
  vendorBadgeText: { fontSize: 10, color: '#15803D', fontWeight: '800', letterSpacing: 0.8 },
  headerTitle:     { fontSize: 22, fontWeight: '700', color: '#111827', letterSpacing: -0.3 },
  headerLocationRow:{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  headerSub:       { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },

  // ── Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 14,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabItemActive:  { borderBottomColor: '#16A34A' },
  tabText:        { fontSize: 14, color: '#9CA3AF', fontWeight: '600' },
  tabTextActive:  { color: '#16A34A' },
  tabBadge:       { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  tabBadgeText:   { fontSize: 11, fontWeight: '700' },
  pendingDot:     { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EA580C', marginLeft: -4, marginTop: -8 },

  // ── List
  listContent: { padding: 16, gap: 12, paddingBottom: 40 },
  sectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionSub:   { fontSize: 13, color: '#9CA3AF' },
  pendingBadge: { backgroundColor: '#FFF7ED', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  pendingBadgeText: { fontSize: 12, color: '#EA580C', fontWeight: '700' },

  // ── Shared Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    gap: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },

  // Crop row
  cardTopRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cropIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' },
  cropEmoji:    { fontSize: 22 },
  cropName:     { fontSize: 16, fontWeight: '700', color: '#111827' },
  farmerMeta:   { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  priceBox:     { alignItems: 'flex-end' },
  priceBoxLabel:{ fontSize: 9, color: '#9CA3AF', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  priceBoxValue:{ fontSize: 18, fontWeight: '800', color: '#15803D' },

  divider: { height: 1, backgroundColor: '#F1F5F9' },

  // Detail chips
  detailsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F8FAFC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#E2E8F0' },
  detailChipText:  { fontSize: 12, color: '#374151', fontWeight: '500' },

  // Send offer button
  sendOfferBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#16A34A',
    paddingVertical: 13, borderRadius: 12, marginTop: 2,
  },
  sendOfferText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Deal card specifics
  dealHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusDot:     { width: 6, height: 6, borderRadius: 3 },
  statusChipText:{ fontSize: 12, fontWeight: '700' },
  dealDate:      { fontSize: 11, color: '#9CA3AF' },
  dealTimestamp: { fontSize: 11, color: '#9CA3AF' },

  // Contact box
  contactBox: {
    backgroundColor: '#F8FAFC', borderRadius: 12,
    padding: 12, gap: 8,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  contactBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  farmerAvatar:     { width: 38, height: 38, borderRadius: 19, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  farmerAvatarText: { fontSize: 16, fontWeight: '700', color: '#16A34A' },
  farmerNameText:   { fontSize: 14, fontWeight: '700', color: '#111827' },
  contactBoxLabel:  { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  contactHint:      { fontSize: 12, color: '#9CA3AF' },
  callChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', backgroundColor: '#EFF6FF',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE',
  },
  callChipText: { fontSize: 13, color: '#2563EB', fontWeight: '600' },

  confirmedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F0FDF4', padding: 10,
    borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0',
  },
  confirmedBannerText: { color: '#15803D', fontWeight: '600', fontSize: 13 },

  // ── Empty state
  emptyWrap:      { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyIconCircle:{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:     { fontSize: 17, fontWeight: '700', color: '#1F2937', marginBottom: 8 },
  emptySub:       { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 21 },
});
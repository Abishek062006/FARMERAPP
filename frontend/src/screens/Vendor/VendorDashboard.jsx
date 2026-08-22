import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, Image, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { getCurrentLocation } from '../../services/locationService';

// The FARM Market, as a vendor sees it.
//
// Listings are ordered by real distance from the vendor, not by a city-name
// regex: every listing now carries the coordinates of the farmer's registered
// land. The vendor's own position comes from a live GPS read rather than their
// stored profile, because RegisterScreen hardcodes district "Chennai" for
// every account.
export default function VendorDashboard({ navigation, route }) {
  const { userData } = route.params || {};

  const [listings, setListings] = useState([]);
  const [meta, setMeta]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState(null);

  const [origin, setOrigin]     = useState(null);   // {lat,lng}
  const [originLabel, setOriginLabel] = useState('');
  const [query, setQuery]       = useState('');
  const [district, setDistrict] = useState('all');  // 'all' | a TN district
  const [districts, setDistricts] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const vendorName = userData?.name || 'Vendor';
  const debounce = useRef(null);

  // ── locate the vendor once, then load ────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const loc = await getCurrentLocation();
        setOrigin({ lat: loc.latitude, lng: loc.longitude });
        setOriginLabel(loc.city || loc.district || '');
      } catch {
        setOrigin(null);
        setOriginLabel('');
      }
    })();

    axios.get(`${API_ENDPOINTS.LISTINGS}/districts`)
      .then((r) => r.data.success && setDistricts(r.data.districts))
      .catch(() => {});
  }, []);

  const fetchMarket = useCallback(async (opts = {}) => {
    const q = opts.query !== undefined ? opts.query : query;
    const d = opts.district !== undefined ? opts.district : district;
    try {
      setError(null);
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (d && d !== 'all') params.set('district', d);
      if (origin) { params.set('lat', origin.lat); params.set('lng', origin.lng); }

      const r = await axios.get(`${API_ENDPOINTS.MARKET}?${params.toString()}`);
      if (r.data.success) {
        setListings(r.data.listings);
        setMeta(r.data.meta);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the market. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query, district, origin]);

  // Wait for the GPS attempt to settle (origin resolves to coords or null)
  // before the first fetch, so the first list is already distance-sorted.
  useEffect(() => { fetchMarket(); }, [origin, district]);

  const onChangeQuery = (text) => {
    setQuery(text);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchMarket({ query: text }), 400);
  };

  const onRefresh = () => { setRefreshing(true); fetchMarket(); };

  // ── card ──────────────────────────────────────────────────────────────
  const MarketCard = ({ item }) => (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('ListingDetail', { listing: item, origin, userData })}
    >
      {item.proofImageId && (
        <Image
          source={{ uri: API_ENDPOINTS.LISTING_PHOTO(item.proofImageId) }}
          style={s.photo}
          resizeMode="cover"
        />
      )}

      <View style={s.cardTopRow}>
        <View style={s.cropIconWrap}><Text style={s.cropEmoji}>🌾</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.cropName}>{item.cropName}</Text>
          <Text style={s.farmerMeta}>
            {item.farmerName}{item.gradeNote ? ` · ${item.gradeNote}` : ''}
          </Text>
        </View>
        <View style={s.priceBox}>
          <Text style={s.priceBoxLabel}>PER KG</Text>
          <Text style={s.priceBoxValue}>₹{item.pricePerKg}</Text>
        </View>
      </View>

      <View style={s.divider} />

      <View style={s.detailsRow}>
        <View style={[s.detailChip, item.isNear && s.nearChip]}>
          <Ionicons name="navigate-outline" size={13} color={item.isNear ? '#2563EB' : '#6B7280'} />
          <Text style={[s.detailChipText, item.isNear && s.nearChipText]}>
            {item.distanceKm != null ? `${item.distanceKm} km` : 'Distance unknown'}
          </Text>
        </View>
        <View style={s.detailChip}>
          <Ionicons name="location-outline" size={13} color="#6B7280" />
          <Text style={s.detailChipText}>{item.location?.district || '—'}</Text>
        </View>
        <View style={s.detailChip}>
          <Ionicons name="cube-outline" size={13} color="#6B7280" />
          <Text style={s.detailChipText}>{item.quantityAvailableKg} kg left</Text>
        </View>
        <View style={s.detailChip}>
          <Ionicons name="basket-outline" size={13} color="#6B7280" />
          <Text style={s.detailChipText}>min {item.minOrderKg} kg</Text>
        </View>
      </View>

      {item.harvestedAt && (
        <Text style={s.harvestLine}>
          Harvested {new Date(item.harvestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </Text>
      )}

      <View style={s.viewBtn}>
        <Text style={s.viewBtnText}>View & Buy</Text>
        <Ionicons name="arrow-forward" size={15} color="#fff" />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#16A34A" />
        <Text style={s.loadingText}>Loading the Farm Market…</Text>
      </View>
    );
  }

  const scopeLabel = district === 'all' ? 'All Tamil Nadu' : district;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.vendorBadge}>
          <Ionicons name="storefront" size={14} color="#16A34A" />
          <Text style={s.vendorBadgeText}>VENDOR</Text>
        </View>
        <Text style={s.headerTitle}>Welcome, {vendorName} 👋</Text>
        <View style={s.headerLocationRow}>
          <Ionicons name="location" size={13} color="#9CA3AF" />
          <Text style={s.headerSub}>
            {origin
              ? `${originLabel || 'Your location'}${meta?.originDistrict ? ` · ${meta.originDistrict}` : ''}`
              : 'Location off — showing newest first'}
          </Text>
        </View>

        <View style={s.searchRow}>
          <Ionicons name="search-outline" size={17} color="#9CA3AF" />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={onChangeQuery}
            placeholder="Search a crop — rice, banana, groundnut…"
            placeholderTextColor="#9CA3AF"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); fetchMarket({ query: '' }); }} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        <View style={s.scopeRow}>
          <TouchableOpacity
            style={[s.scopeChip, district === 'all' && s.scopeChipOn]}
            onPress={() => setDistrict('all')}
          >
            <Text style={[s.scopeChipText, district === 'all' && s.scopeChipTextOn]}>All Tamil Nadu</Text>
          </TouchableOpacity>
          {meta?.originDistrict && (
            <TouchableOpacity
              style={[s.scopeChip, district === meta.originDistrict && s.scopeChipOn]}
              onPress={() => setDistrict(meta.originDistrict)}
            >
              <Text style={[s.scopeChipText, district === meta.originDistrict && s.scopeChipTextOn]}>
                {meta.originDistrict}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.scopeChip} onPress={() => setPickerOpen(true)}>
            <Ionicons name="funnel-outline" size={12} color="#374151" />
            <Text style={s.scopeChipText}>Other district</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={listings}
        keyExtractor={(i) => i._id}
        renderItem={({ item }) => <MarketCard item={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16A34A" />}
        contentContainerStyle={s.listContent}
        ListHeaderComponent={
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{listings.length} listing{listings.length === 1 ? '' : 's'}</Text>
            <Text style={s.sectionSub}>
              {scopeLabel}
              {meta?.near > 0 ? ` · ${meta.near} within ${meta.nearKm} km` : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <View style={s.emptyIconCircle}>
              <Ionicons name={error ? 'cloud-offline-outline' : 'storefront-outline'} size={36} color="#16A34A" />
            </View>
            <Text style={s.emptyTitle}>{error ? 'Could not load' : 'Nothing here yet'}</Text>
            <Text style={s.emptySub}>
              {error
                || (query
                  ? `No farmer is selling "${query}" in ${scopeLabel} right now.`
                  : `No crops listed in ${scopeLabel} yet.\nPull down to refresh.`)}
            </Text>
          </View>
        }
      />

      {/* District picker */}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={s.pickerOverlay}>
          <View style={s.pickerSheet}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>Search another district</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 12 }}>
              <TouchableOpacity
                style={[s.districtRow, district === 'all' && s.districtRowOn]}
                onPress={() => { setDistrict('all'); setPickerOpen(false); }}
              >
                <Text style={[s.districtText, district === 'all' && s.districtTextOn]}>All Tamil Nadu</Text>
                {district === 'all' && <Ionicons name="checkmark" size={17} color="#16A34A" />}
              </TouchableOpacity>
              {districts.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[s.districtRow, district === d && s.districtRowOn]}
                  onPress={() => { setDistrict(d); setPickerOpen(false); }}
                >
                  <Text style={[s.districtText, district === d && s.districtTextOn]}>{d}</Text>
                  {district === d && <Ionicons name="checkmark" size={17} color="#16A34A" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F8FAFC' },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#F8FAFC' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },

  header: {
    backgroundColor: '#fff', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14, gap: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4,
  },
  vendorBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#DCFCE7',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start',
  },
  vendorBadgeText: { fontSize: 10, color: '#15803D', fontWeight: '800', letterSpacing: 0.8 },
  headerTitle:     { fontSize: 22, fontWeight: '700', color: '#111827', letterSpacing: -0.3 },
  headerLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -6 },
  headerSub:       { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 12, paddingVertical: 3,
  },
  searchInput: { flex: 1, fontSize: 14.5, color: '#111827', paddingVertical: 9 },

  scopeRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scopeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F8FAFC', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  scopeChipOn:     { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
  scopeChipText:   { fontSize: 12.5, color: '#374151', fontWeight: '600' },
  scopeChipTextOn: { color: '#15803D' },

  listContent:  { padding: 16, gap: 12, paddingBottom: 40 },
  sectionHeader:{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionSub:   { fontSize: 13, color: '#9CA3AF' },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 5, borderWidth: 1, borderColor: '#F1F5F9',
  },
  photo: { width: '100%', height: 150, borderRadius: 12, backgroundColor: '#F1F5F9' },

  cardTopRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cropIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' },
  cropEmoji:    { fontSize: 22 },
  cropName:     { fontSize: 16, fontWeight: '700', color: '#111827' },
  farmerMeta:   { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  priceBox:     { alignItems: 'flex-end' },
  priceBoxLabel:{ fontSize: 9, color: '#9CA3AF', fontWeight: '700', letterSpacing: 0.5 },
  priceBoxValue:{ fontSize: 18, fontWeight: '800', color: '#15803D' },

  divider: { height: 1, backgroundColor: '#F1F5F9' },

  detailsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F8FAFC',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#E2E8F0',
  },
  detailChipText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  nearChip:       { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  nearChipText:   { color: '#2563EB', fontWeight: '700' },

  harvestLine: { fontSize: 11.5, color: '#9CA3AF' },

  viewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', paddingVertical: 13, borderRadius: 12, marginTop: 2,
  },
  viewBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  emptyWrap:      { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyIconCircle:{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:     { fontSize: 17, fontWeight: '700', color: '#1F2937', marginBottom: 8 },
  emptySub:       { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 21 },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  pickerSheet:   { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '75%' },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  pickerTitle:  { fontSize: 17, fontWeight: '700', color: '#111827' },
  districtRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 13, borderRadius: 10,
  },
  districtRowOn:  { backgroundColor: '#F0FDF4' },
  districtText:   { fontSize: 15, color: '#374151' },
  districtTextOn: { color: '#15803D', fontWeight: '700' },
});

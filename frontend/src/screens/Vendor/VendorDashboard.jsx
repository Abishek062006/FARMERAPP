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
// stored profile, because RegisterScreen used to hardcode district "Chennai" for
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
  const [district, setDistrict] = useState('all');  // 'all' | a Maharashtra district
  const [districts, setDistricts] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Phase 4, B3 — price/kg range, applied on the SERVER against the full
  // filtered set (not just the page that comes back) — see the note in
  // routes/listings.js on why a client-side filter after $near would be
  // dishonest about how much of the market actually matches.
  //
  // Staged in the modal while typing, committed to `filters` only on "Apply" —
  // fetching on every keystroke of a partial number would spam the API with
  // requests for values like "1" and "10" on the way to "100".
  const [filterOpen, setFilterOpen] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minKg, setMinKg] = useState('');
  const [maxKg, setMaxKg] = useState('');
  const [filters, setFilters] = useState({ minPrice: '', maxPrice: '', minKg: '', maxKg: '' });
  const activeFilterCount = Object.values(filters).filter((v) => v.trim() !== '').length;

  const applyFilters = () => {
    setFilters({ minPrice, maxPrice, minKg, maxKg });
    setFilterOpen(false);
  };
  const clearFilters = () => {
    setMinPrice(''); setMaxPrice(''); setMinKg(''); setMaxKg('');
    setFilters({ minPrice: '', maxPrice: '', minKg: '', maxKg: '' });
    setFilterOpen(false);
  };

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
      if (filters.minPrice.trim()) params.set('minPrice', filters.minPrice.trim());
      if (filters.maxPrice.trim()) params.set('maxPrice', filters.maxPrice.trim());
      if (filters.minKg.trim()) params.set('minKg', filters.minKg.trim());
      if (filters.maxKg.trim()) params.set('maxKg', filters.maxKg.trim());

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
  }, [query, district, origin, filters]);

  // Wait for the GPS attempt to settle (origin resolves to coords or null)
  // before the first fetch, so the first list is already distance-sorted.
  useEffect(() => { fetchMarket(); }, [origin, district, filters]);

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
            {item.farmerName}{item.grade?.code ? ` · Grade ${item.grade.code}` : item.gradeNote ? ` · ${item.gradeNote}` : ''}
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

  const scopeLabel = district === 'all' ? 'All Maharashtra' : district;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.vendorBadge}>
          <Ionicons name="storefront" size={14} color="#16A34A" />
          <Text style={s.vendorBadgeText}>VENDOR</Text>
        </View>
        <Text style={s.headerTitle}>Welcome, {vendorName} 👋</Text>

        {/* Phase 4, B3 — individual listings vs a group's own lots are two
            different ways to buy (one farmer's stock vs a whole grade lot
            pooled across a group), so they get a real switcher rather than
            the group screen being reachable only from a buried quick-card. */}
        <View style={s.modeRow}>
          <View style={[s.modeBtn, s.modeBtnOn]}>
            <Text style={[s.modeBtnText, s.modeBtnTextOn]}>Individual</Text>
          </View>
          <TouchableOpacity
            style={s.modeBtn}
            onPress={() => navigation.navigate('Bundles', { userData })}
          >
            <Text style={s.modeBtnText}>FPO groups</Text>
          </TouchableOpacity>
        </View>

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
            <Text style={[s.scopeChipText, district === 'all' && s.scopeChipTextOn]}>All Maharashtra</Text>
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
          <TouchableOpacity
            style={[s.scopeChip, activeFilterCount > 0 && s.scopeChipOn]}
            onPress={() => setFilterOpen(true)}
          >
            <Ionicons name="options-outline" size={12} color={activeFilterCount > 0 ? '#15803D' : '#374151'} />
            <Text style={[s.scopeChipText, activeFilterCount > 0 && s.scopeChipTextOn]}>
              Price & kg{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Text>
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
          <View>
            {/* ⚠️ THE BUYER'S OWN TRADE, REACHABLE FROM THE DASHBOARD.
                This screen had exactly ONE navigate() on it — into a listing —
                so a buyer's order history, live tracking and grievances were
                reachable only through the header, which was overflowing and
                pushed "Orders" off the edge. A screen that exists and cannot be
                opened is not shipped. These two are the ones a buyer opens
                daily, so they get a real row rather than a 21px icon. */}
            <View style={s.quickRow}>
              <TouchableOpacity
                style={s.quickCard}
                onPress={() => navigation.navigate('VendorOrders', { userData })}
                activeOpacity={0.85}
              >
                <Ionicons name="receipt-outline" size={20} color="#15803D" />
                <View style={{ flex: 1 }}>
                  <Text style={s.quickTitle}>My orders</Text>
                  <Text style={s.quickSub}>Live tracking, past deliveries and receipts</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.quickCard}
                onPress={() => navigation.navigate('Bundles', { userData })}
                activeOpacity={0.85}
              >
                <Ionicons name="people-outline" size={20} color="#15803D" />
                <View style={{ flex: 1 }}>
                  <Text style={s.quickTitle}>Buy from a group</Text>
                  <Text style={s.quickSub}>Several farmers, one vehicle</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

          <View style={s.sectionHeader}>
            {/* ⚠️ SHOWN vs TOTAL. This printed `listings.length` alone, which is
                the PAGE — so a buyer looking at 200 of 1,159 lots was told
                there were 200, and had no idea the market was five times
                bigger than the screen. */}
            <Text style={s.sectionTitle}>
              {meta?.hasMore
                ? `${meta.shown} of ${meta.total} listings`
                : `${listings.length} listing${listings.length === 1 ? '' : 's'}`}
            </Text>
            <Text style={s.sectionSub}>
              {scopeLabel}
              {meta?.near > 0 ? ` · ${meta.near} within ${meta.nearKm} km` : ''}
              {meta?.ranked === false ? ' · newest first' : ''}
            </Text>
          </View>

          {/* Says WHY the rest are not on screen. "1,159 lots exist and you are
              seeing the 60 nearest" is a different message from a list that
              simply stops, and it points at the two controls that narrow it. */}
          {meta?.hasMore && (
            <View style={s.moreNote}>
              <Ionicons name="funnel-outline" size={14} color="#B45309" />
              <Text style={s.moreNoteText}>
                {meta.ranked
                  ? `Showing the ${meta.shown} nearest. Search a crop or pick a district to narrow it down.`
                  : `Showing ${meta.shown} of ${meta.total}. Turn location on to see the nearest first, or pick a district.`}
              </Text>
            </View>
          )}
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
                <Text style={[s.districtText, district === 'all' && s.districtTextOn]}>All Maharashtra</Text>
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

      {/* Phase 4, B3 — price and quantity range. Staged here, only sent to the
          server on "Apply", so a partial number typed mid-entry never fires a
          request. */}
      <Modal visible={filterOpen} animationType="slide" transparent onRequestClose={() => setFilterOpen(false)}>
        <View style={s.pickerOverlay}>
          <View style={s.pickerSheet}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>Price & quantity</Text>
              <TouchableOpacity onPress={() => setFilterOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 14 }}>
              <View>
                <Text style={s.filterLabel}>Price per kg (₹)</Text>
                <View style={s.rangeRow}>
                  <TextInput
                    style={s.rangeInput} value={minPrice} onChangeText={setMinPrice}
                    keyboardType="number-pad" placeholder="Min" placeholderTextColor="#9CA3AF"
                  />
                  <Text style={s.rangeDash}>–</Text>
                  <TextInput
                    style={s.rangeInput} value={maxPrice} onChangeText={setMaxPrice}
                    keyboardType="number-pad" placeholder="Max" placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>
              <View>
                <Text style={s.filterLabel}>Quantity available (kg)</Text>
                <View style={s.rangeRow}>
                  <TextInput
                    style={s.rangeInput} value={minKg} onChangeText={setMinKg}
                    keyboardType="number-pad" placeholder="Min" placeholderTextColor="#9CA3AF"
                  />
                  <Text style={s.rangeDash}>–</Text>
                  <TextInput
                    style={s.rangeInput} value={maxKg} onChangeText={setMaxKg}
                    keyboardType="number-pad" placeholder="Max" placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <TouchableOpacity style={s.filterClearBtn} onPress={clearFilters}>
                  <Text style={s.filterClearBtnText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.filterApplyBtn} onPress={applyFilters}>
                  <Text style={s.filterApplyBtnText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  // paddingBottom separates these from the listing section below, which was
  // sitting flush against the cards and read as one run-on block.
  quickRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, gap: 10 },
  quickCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  quickTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  quickSub: { fontSize: 11, color: '#6B7280', marginTop: 2 },

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

  modeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  modeBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
  },
  modeBtnOn: { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
  modeBtnText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  modeBtnTextOn: { color: '#15803D' },

  headerLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -2 },
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
  sectionHeader:{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 16, marginBottom: 6, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionSub:   { fontSize: 13, color: '#9CA3AF' },
  moreNote: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 12, padding: 11, marginTop: 4, marginBottom: 12,
  },
  moreNoteText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: '#92400E' },

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

  filterLabel: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginBottom: 6 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeInput: {
    flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827',
    backgroundColor: '#F8FAFC',
  },
  rangeDash: { color: '#9CA3AF', fontSize: 14 },
  filterClearBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
  },
  filterClearBtnText: { color: '#6B7280', fontWeight: '700', fontSize: 13.5 },
  filterApplyBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#16A34A',
  },
  filterApplyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
});

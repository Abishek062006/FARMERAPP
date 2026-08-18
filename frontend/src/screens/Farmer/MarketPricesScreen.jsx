import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

// This app is Tamil Nadu only — no need to make farmers pick a state every
// time. 31 is Agmarknet's own id for Tamil Nadu (verified against its
// /daily-price-arrival/filters response).
const TAMIL_NADU_STATE_ID = 31;
const ANY_MARKET_VALUE = 'any';

const toISODate = (d) => d.toISOString().slice(0, 10);

// A tappable field that opens a real, searchable, tap-to-select list in a
// bottom sheet — not a native wheel picker. The wheel-style picker was hard
// to use accurately inside a ScrollView (easy to end up selecting the row
// next to the one you meant); a plain list row you tap once removes that
// ambiguity entirely.
function FieldPicker({ label, value, items, onChange, placeholder, disabled, loading, searchable }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedLabel = items.find((i) => String(i.value) === String(value))?.label;

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return items;
    const q = query.trim().toLowerCase();
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, query, searchable]);

  const handleSelect = (item) => {
    onChange(item.value);
    setQuery('');
    setOpen(false);
  };

  const handleClose = () => {
    setQuery('');
    setOpen(false);
  };

  return (
    <View style={styles.formGroup}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.fieldButton, disabled && styles.fieldButtonDisabled]}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text style={[styles.fieldButtonText, !selectedLabel && styles.fieldButtonPlaceholder]} numberOfLines={1}>
          {loading ? 'Loading...' : selectedLabel || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={disabled ? '#ccc' : '#666'} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={handleClose}>
        <View style={styles.modalRoot}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={handleClose} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={handleClose}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {searchable && (
              <View style={styles.modalSearchBox}>
                <Ionicons name="search" size={16} color="#999" />
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder={`Search ${label.toLowerCase()}...`}
                  value={query}
                  onChangeText={setQuery}
                  autoFocus
                />
              </View>
            )}

            <FlatList
              data={filtered}
              keyExtractor={(item) => String(item.value)}
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = String(item.value) === String(value);
                return (
                  <TouchableOpacity style={styles.modalRow} onPress={() => handleSelect(item)}>
                    <Text style={[styles.modalRowText, isSelected && styles.modalRowTextSelected]}>
                      {item.label}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color="#4CAF50" />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.modalEmptyText}>No matches</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function MarketPricesScreen({ navigation, route }) {
  const { cropName, land } = route.params || {};

  // ── Metadata ─────────────────────────────────────────────────────────
  const [districts, setDistricts] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [commodities, setCommodities] = useState([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState('');

  // ── Selection (state is fixed to Tamil Nadu) ────────────────────────
  const [districtId, setDistrictId] = useState(null);
  const [marketId, setMarketId] = useState(ANY_MARKET_VALUE);
  const [commodityId, setCommodityId] = useState(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [marketsLoading, setMarketsLoading] = useState(false);
  const [commoditiesLoading, setCommoditiesLoading] = useState(false);
  const [commoditiesScoped, setCommoditiesScoped] = useState(true);

  // ── Result ───────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const dateISO = useMemo(() => toISODate(date), [date]);

  // ── Load Tamil Nadu districts once ──────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setMetaLoading(true);
        setMetaError('');
        const res = await axios.get(`${API_ENDPOINTS.MANDI}/districts`, {
          params: { stateId: TAMIL_NADU_STATE_ID },
          timeout: 15000,
        });
        if (res.data?.success) setDistricts(res.data.data);
      } catch (err) {
        setMetaError('Could not load mandi filters. Pull to retry.');
      } finally {
        setMetaLoading(false);
      }
    })();
  }, []);

  // ── Pre-fill district from navigation params once districts are in ──
  useEffect(() => {
    if (!land?.location?.district || districts.length === 0 || districtId) return;
    const match = districts.find(
      (d) => d.name.toLowerCase() === land.location.district.toLowerCase()
    );
    if (match) setDistrictId(match.id);
  }, [districts, land]);

  useEffect(() => {
    if (!cropName || commodities.length === 0 || commodityId) return;
    const target = cropName.toLowerCase();
    const match =
      commodities.find((c) => c.name.toLowerCase() === target) ||
      commodities.find((c) => c.name.toLowerCase().includes(target) || target.includes(c.name.toLowerCase()));
    if (match) setCommodityId(match.id);
  }, [commodities, cropName]);

  // ── Cascade: district -> markets ─────────────────────────────────────
  // `cancelled` guards against a slower, older request (e.g. for a district
  // you've since changed away from) resolving AFTER a newer one and
  // silently overwriting it with stale data — a real race we hit in
  // testing: switch districts quickly and the wrong list can "win".
  useEffect(() => {
    if (!districtId) {
      setMarkets([]);
      setMarketId(ANY_MARKET_VALUE);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setMarketsLoading(true);
        setMarketId(ANY_MARKET_VALUE);
        const res = await axios.get(`${API_ENDPOINTS.MANDI}/markets`, {
          params: { districtId },
          timeout: 15000,
        });
        if (cancelled) return;
        if (res.data?.success) setMarkets(res.data.data);
      } catch {
        if (!cancelled) setMarkets([]);
      } finally {
        if (!cancelled) setMarketsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [districtId]);

  // ── Cascade: district + date -> only the crops actually reported there ──
  useEffect(() => {
    if (!districtId) {
      setCommodities([]);
      setCommodityId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setCommoditiesLoading(true);
        const res = await axios.get(`${API_ENDPOINTS.MANDI}/commodities`, {
          params: { districtId, date: dateISO },
          timeout: 20000,
        });
        if (cancelled) return;
        if (res.data?.success) {
          const list = res.data.data || [];
          setCommodities(list);
          setCommoditiesScoped(res.data.scoped !== false);
          // Drop a previously chosen crop if it's no longer in the new list
          // (e.g. it wasn't reported here, or on this date).
          setCommodityId((prev) => (list.some((c) => c.id === prev) ? prev : null));
        }
      } catch {
        if (!cancelled) setCommodities([]);
      } finally {
        if (!cancelled) setCommoditiesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [districtId, dateISO]);

  const canSubmit = useMemo(
    () => !!districtId && !!commodityId && !submitting,
    [districtId, commodityId, submitting]
  );

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) setDate(selectedDate);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      setSubmitting(true);
      setError('');
      setSearched(true);
      const res = await axios.get(`${API_ENDPOINTS.MANDI}/prices`, {
        params: {
          date: toISODate(date),
          stateId: TAMIL_NADU_STATE_ID,
          districtId,
          marketId: marketId === ANY_MARKET_VALUE ? undefined : marketId,
          commodityId,
        },
        timeout: 20000,
      });
      if (res.data?.success) {
        setResult(res.data.data);
      } else {
        setResult(null);
        setError(res.data?.message || 'Failed to fetch mandi price.');
      }
    } catch (err) {
      setResult(null);
      setError(err.response?.data?.message || 'Failed to fetch mandi price. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCommodityName = commodities.find((c) => c.id === commodityId)?.name;
  const selectedDistrictName = districts.find((d) => d.id === districtId)?.name;

  if (metaLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading mandi filters...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {metaError ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={60} color="#F44336" />
          <Text style={styles.errorText}>{metaError}</Text>
        </View>
      ) : (
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>🛒 Find Mandi Price</Text>
          <Text style={styles.sectionSub}>Tamil Nadu — real prices from Agmarknet.</Text>

          <FieldPicker
            label="District"
            value={districtId}
            onChange={setDistrictId}
            placeholder="Select district..."
            items={districts.map((d) => ({ label: d.name, value: d.id }))}
            searchable
          />

          <FieldPicker
            label="Mandi / Market"
            value={marketId}
            onChange={setMarketId}
            placeholder={!districtId ? 'Select a district first' : 'Any market in this district'}
            disabled={!districtId}
            loading={marketsLoading}
            items={[
              { label: 'Any market in this district', value: ANY_MARKET_VALUE },
              ...markets.map((m) => ({ label: m.name, value: m.id })),
            ]}
            searchable
          />

          <View style={styles.formGroup}>
            <Text style={styles.label}>Date</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar" size={20} color="#4CAF50" />
              <Text style={styles.dateText}>{date.toLocaleDateString('en-IN')}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display="default"
                onChange={handleDateChange}
                maximumDate={new Date()}
              />
            )}
          </View>

          <FieldPicker
            label="Crop / Commodity"
            value={commodityId}
            onChange={setCommodityId}
            placeholder={!districtId ? 'Select a district first' : 'Select crop...'}
            disabled={!districtId}
            loading={commoditiesLoading}
            items={commodities.map((c) => ({ label: c.name, value: c.id }))}
            searchable
          />
          {districtId && !commoditiesLoading && !commoditiesScoped && commodities.length > 0 && (
            <Text style={styles.scopeFallbackNote}>
              No reports found in this district on this date — showing all crops instead.
            </Text>
          )}

          <TouchableOpacity
            style={[styles.searchButton, !canSubmit && styles.searchButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.searchButtonText}>Check Market Price</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Result ── */}
      {searched && !submitting && (
        result ? (
          <View style={styles.priceCard}>
            <View style={styles.priceHeader}>
              <View style={styles.marketInfo}>
                <Text style={styles.marketName}>{result.commodity} — {result.variety || 'Standard'}</Text>
                <Text style={styles.marketLocation}>
                  {result.market}, {result.district}, {result.state}
                </Text>
                {result.matchLevel && result.matchLevel !== 'market' && (
                  <Text style={styles.fallbackNote}>
                    {result.matchLevel === 'district'
                      ? 'Nearest reporting market in your district'
                      : 'No data in your district — showing nearest reporting market in the state'}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.priceDetails}>
              <View style={styles.priceItem}>
                <Text style={styles.priceLabel}>Modal Price</Text>
                <Text style={styles.priceValue}>₹{result.modalPrice?.toLocaleString('en-IN')}</Text>
                <Text style={styles.unitCaption}>per quintal</Text>
              </View>
              <View style={styles.priceItem}>
                <Text style={styles.priceLabel}>Min</Text>
                <Text style={styles.priceMin}>₹{result.minPrice?.toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.priceItem}>
                <Text style={styles.priceLabel}>Max</Text>
                <Text style={styles.priceMax}>₹{result.maxPrice?.toLocaleString('en-IN')}</Text>
              </View>
            </View>

            {result.modalPrice != null && (
              <Text style={styles.kgConversion}>
                ≈ ₹{Math.round(result.modalPrice / 100)} / kg
              </Text>
            )}

            <Text style={styles.priceDate}>
              {result.date} {result.arrival != null ? `· Arrivals: ${result.arrival} MT` : ''}
            </Text>
          </View>
        ) : error ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="alert-circle-outline" size={60} color="#F44336" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleSubmit}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="pricetag-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>
              No mandi price data is available for {selectedCommodityName} in{' '}
              {selectedDistrictName}, Tamil Nadu on {date.toLocaleDateString('en-IN')}.
            </Text>
            <Text style={styles.emptySubtext}>Try another date, market, or crop.</Text>
          </View>
        )
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },

  formCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  sectionSub: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },

  fieldButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  fieldButtonDisabled: {
    backgroundColor: '#f5f5f5',
  },
  fieldButtonText: {
    fontSize: 15,
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  fieldButtonPlaceholder: {
    color: '#999',
  },

  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    height: '70%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  modalList: {
    flex: 1,
    marginTop: 8,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  modalRowText: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  modalRowTextSelected: {
    color: '#4CAF50',
    fontWeight: '700',
  },
  modalEmptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    marginTop: 24,
  },

  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  dateText: {
    fontSize: 15,
    color: '#333',
  },
  scopeFallbackNote: {
    fontSize: 12,
    color: '#D97706',
    marginTop: -8,
    marginBottom: 16,
  },

  searchButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  searchButtonDisabled: {
    backgroundColor: '#A5D6A7',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  priceCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  marketInfo: {
    flex: 1,
  },
  marketName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  marketLocation: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  fallbackNote: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '600',
    marginTop: 4,
  },
  priceDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  priceItem: {
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  unitCaption: {
    fontSize: 10,
    color: '#999',
    marginTop: 1,
  },
  priceMin: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F44336',
  },
  priceMax: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
  },
  kgConversion: {
    fontSize: 13,
    color: '#16A34A',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
  },
  priceDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    textAlign: 'right',
  },

  emptyContainer: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#ccc',
    marginTop: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 15,
    color: '#F44336',
    marginTop: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

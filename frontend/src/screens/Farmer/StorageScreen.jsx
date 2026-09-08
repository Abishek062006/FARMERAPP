import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

// H1 — the last unbuilt clause of SIH 26132 finally gets a caller.
//
// GET /api/warehouses/near?lat=&lng= or ?district=&commodity=&quantityKg=&days=&pricePerKg=
// See backend/routes/warehouses.js and backend/services/storageService.js —
// this screen's fields are traced from that route's actual response shape,
// not guessed:
//   onFarm          — the always-present baseline (keep at your own farm)
//   options[]        — nearest-first, EACH warehouse priced for this lot,
//                       whether or not it is suitable (a refused option still
//                       carries its reason — never dropped from the list)
//   notice           — shown when any illustrative record is in the list
//   verifiedNotice   — shown when any verified (real MSWC) record is in the list
//   spoilageBasis    — where the weekly loss assumptions come from
//
// Two honesty rules this screen must never paper over:
//   1. dataSource: 'seed_illustrative' vs 'verified' — always badged, never blurred.
//   2. rateEstimated: true — MSWC's real tariff is paise-per-bag + ad-valorem,
//      not one ₹/tonne/month figure. The rate shown is our estimate; the
//      screen must say so next to every rate, not just once in fine print.

const TYPE_LABELS = {
  godown: 'Godown',
  ventilated_chawl: 'Ventilated chawl (kanda chawl)',
  cold_storage: 'Cold storage',
  silo: 'Silo',
  on_farm: 'On the farm',
};

const OPERATOR_LABELS = {
  mswc: 'Maharashtra State Warehousing Corporation',
  cwc: 'Central Warehousing Corporation',
  apmc: 'APMC godown',
  cooperative: 'Cooperative society',
  fpo: 'Producer company',
  private: 'Private warehouse',
};

const fmtDate = (d) => {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
};

const money = (n) => (n == null ? null : `₹${Math.round(n).toLocaleString('en-IN')}`);

export default function StorageScreen({ route }) {
  const { userData, land, crop } = route.params || {};

  // ── Form ──────────────────────────────────────────────────────────────
  const [commodity, setCommodity] = useState(crop?.name || '');
  const [quantityKg, setQuantityKg] = useState('1000');
  const [days, setDays] = useState('14');
  const [pricePerKg, setPricePerKg] = useState('');

  // ── Result ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searched, setSearched] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const district = land?.location?.district || null;
  const coords = land?.location?.coordinates;

  const fetchOptions = useCallback(async ({ silent } = {}) => {
    const commodityTrim = commodity.trim();
    const qty = Number(quantityKg);
    if (!commodityTrim) {
      Alert.alert('Which crop?', 'Enter the crop you want to store.');
      return;
    }
    if (!qty || qty <= 0) {
      Alert.alert('How much?', 'Enter how many kilograms you are storing.');
      return;
    }

    if (!silent) setLoading(true);
    setError('');
    try {
      const params = {
        commodity: commodityTrim,
        quantityKg: qty,
        days: Number(days) || 14,
        pricePerKg: Number(pricePerKg) || 0,
      };
      if (coords?.lat != null && coords?.lng != null) {
        params.lat = coords.lat;
        params.lng = coords.lng;
      } else if (district) {
        params.district = district;
      }

      const res = await axios.get(`${API_ENDPOINTS.WAREHOUSES}/near`, { params, timeout: 20000 });
      if (res.data?.success) {
        setData(res.data);
        setSearched(true);
      } else {
        setError(res.data?.error || 'Could not load storage options.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not reach the storage service. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [commodity, quantityKg, days, pricePerKg, district, coords]);

  // Auto-search once if we already know what crop and where — the common
  // case when reached from a crop's own screen.
  useEffect(() => {
    if (crop?.name && (district || coords)) {
      fetchOptions({ silent: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    if (!searched) return;
    setRefreshing(true);
    fetchOptions({ silent: true });
  };

  const WarehouseCard = ({ w, isOnFarm }) => {
    const typeLabel = TYPE_LABELS[w.type] || w.type;
    const operatorLabel = OPERATOR_LABELS[w.operator] || w.operator;
    const isVerified = w.dataSource === 'verified';
    const vacancyDate = fmtDate(w.vacancyAsOf || w.capacityAsOf);

    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{w.name}</Text>
            {!!operatorLabel && !isOnFarm && <Text style={s.operator}>{operatorLabel}</Text>}
            <View style={s.metaRow}>
              {!!w.district && <Text style={s.metaText}>{w.district}</Text>}
              {w.distanceKm != null && (
                <View style={s.distChip}>
                  <Ionicons name="navigate-outline" size={10} color="#15803D" />
                  <Text style={s.distChipText}>{w.distanceKm} km</Text>
                </View>
              )}
            </View>
          </View>
          {!isOnFarm && (
            <View style={[s.badge, isVerified ? s.badgeVerified : s.badgeIllustrative]}>
              <Ionicons
                name={isVerified ? 'checkmark-circle' : 'information-circle-outline'}
                size={11}
                color={isVerified ? '#15803D' : '#B45309'}
              />
              <Text style={[s.badgeText, { color: isVerified ? '#15803D' : '#B45309' }]}>
                {isVerified ? 'MSWC verified' : 'Illustrative'}
              </Text>
            </View>
          )}
        </View>

        <View style={s.typeTag}>
          <Ionicons name="business-outline" size={12} color="#6B7280" />
          <Text style={s.typeTagText}>{typeLabel}</Text>
        </View>

        {/* Space — never blank/omit; null means "not published", say so */}
        <View style={s.spaceRow}>
          <Ionicons name="cube-outline" size={14} color="#6B7280" />
          <Text style={s.spaceText}>
            {w.capacityTonnes != null ? `${w.capacityTonnes} t capacity` : 'Capacity not on record'}
            {'  ·  '}
            {w.availableTonnes != null
              ? `${w.availableTonnes} t free${vacancyDate ? ` (as of ${vacancyDate})` : ''}`
              : 'Free space not published'}
          </Text>
        </View>

        {/* Rate — always shown, disclaimer surfaced whenever it's an estimate */}
        {!isOnFarm && (
          <View style={s.rateRow}>
            <Text style={s.rateText}>₹{w.ratePerTonnePerMonth}/tonne/month</Text>
            {w.rateEstimated && (
              <Text style={s.rateEstimatedNote}>estimated — ring the godown for the real tariff</Text>
            )}
          </View>
        )}

        {/* Suitability — refusal is shown, never hidden */}
        {w.suitable === false ? (
          <View style={s.refuseBox}>
            <Ionicons name="close-circle" size={16} color="#B91C1C" />
            <Text style={s.refuseText}>{w.reason}</Text>
          </View>
        ) : (
          <View style={s.costBox}>
            <View style={s.costRow}>
              <Text style={s.costLabel}>Storage cost, {days || 14} days</Text>
              <Text style={s.costValue}>{money(w.storageCost) ?? '₹0'}</Text>
            </View>
            {w.weeklyLossPct != null && (
              <View style={s.costRow}>
                <Text style={s.costLabel}>Spoilage rate</Text>
                <Text style={s.costSub}>{w.weeklyLossPct}%/week</Text>
              </View>
            )}
            {w.expectedLossPct != null && (
              <View style={s.costRow}>
                <Text style={s.costLabel}>Expected loss over the hold</Text>
                <Text style={s.costSub}>
                  {w.expectedLossPct}%{w.valueLostToSpoilage != null ? ` · ${money(w.valueLostToSpoilage)} of value` : ''}
                </Text>
              </View>
            )}
            {w.pledge?.available && (
              <View style={s.pledgeRow}>
                <Ionicons name="cash-outline" size={13} color="#1D4ED8" />
                <Text style={s.pledgeText}>
                  Pledge loan eligible: up to {money(w.pledge.amount)} at {w.pledge.interestPctPerYear}%/yr
                </Text>
              </View>
            )}
          </View>
        )}

        {!!w.contact?.phone && !isOnFarm && (
          <TouchableOpacity style={s.callRow} onPress={() => Linking.openURL(`tel:${w.contact.phone}`)}>
            <Ionicons name="call-outline" size={13} color="#2563EB" />
            <Text style={s.callText}>{w.contact.phone}</Text>
          </TouchableOpacity>
        )}
        {!!w.verifiedNote && (
          <Text style={s.verifiedNoteText}>{w.verifiedNote}</Text>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={s.container}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#16A34A" />}
      >
        {/* ── Form ── */}
        <View style={s.formCard}>
          <Text style={s.formTitle}>Find storage</Text>
          <Text style={s.formSub}>
            This tells you which godowns are nearby and roughly what holding costs — it does
            not book space or take payment. Ring the godown to arrange it.
          </Text>

          <Text style={s.label}>Crop</Text>
          <TextInput
            style={s.input}
            value={commodity}
            onChangeText={setCommodity}
            placeholder="e.g. Onion"
            placeholderTextColor="#9CA3AF"
          />

          <View style={s.row2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Quantity (kg)</Text>
              <TextInput
                style={s.input}
                value={quantityKg}
                onChangeText={setQuantityKg}
                keyboardType="numeric"
                placeholder="1000"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Hold (days)</Text>
              <TextInput
                style={s.input}
                value={days}
                onChangeText={setDays}
                keyboardType="numeric"
                placeholder="14"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>

          <Text style={s.label}>Today's price (₹/kg) — optional</Text>
          <TextInput
            style={s.input}
            value={pricePerKg}
            onChangeText={setPricePerKg}
            keyboardType="numeric"
            placeholder="Used to show what spoilage would cost you"
            placeholderTextColor="#9CA3AF"
          />

          {!district && !coords && (
            <Text style={s.hintText}>
              No land location found — showing storage across Maharashtra. Register a land with a
              district to see the nearest options first.
            </Text>
          )}

          <TouchableOpacity
            style={[s.searchBtn, loading && { opacity: 0.7 }]}
            onPress={() => fetchOptions({ silent: false })}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="search" size={17} color="#fff" />
                <Text style={s.searchBtnText}>Find storage</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Result ── */}
        {!loading && searched && error && (
          <View style={s.emptyWrap}>
            <Ionicons name="alert-circle-outline" size={40} color="#DC2626" />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {!loading && data && (
          <>
            {!!data.verifiedNotice && (
              <View style={s.noticeBox}>
                <Ionicons name="shield-checkmark-outline" size={15} color="#15803D" />
                <Text style={s.noticeText}>{data.verifiedNotice}</Text>
              </View>
            )}
            {!!data.notice && (
              <View style={[s.noticeBox, s.noticeBoxAmber]}>
                <Ionicons name="information-circle-outline" size={15} color="#B45309" />
                <Text style={[s.noticeText, { color: '#92400E' }]}>{data.notice}</Text>
              </View>
            )}

            {!!data.onFarm && (
              <>
                <Text style={s.sectionLabel}>Baseline</Text>
                <WarehouseCard w={data.onFarm} isOnFarm />
              </>
            )}

            <Text style={s.sectionLabel}>
              {data.count > 0 ? `${data.count} storage option${data.count === 1 ? '' : 's'} nearby` : 'No warehouses found'}
            </Text>
            {(data.options || []).map((w) => (
              <WarehouseCard key={w._id || w.name} w={w} />
            ))}
            {data.options?.length === 0 && (
              <View style={s.emptyWrap}>
                <Ionicons name="cube-outline" size={40} color="#CBD5E1" />
                <Text style={s.emptySub}>No warehouse records for this area yet.</Text>
              </View>
            )}

            {!!data.spoilageBasis && (
              <Text style={s.footnote}>{data.spoilageBasis}</Text>
            )}
          </>
        )}

        {!loading && !searched && !error && (
          <View style={s.emptyWrap}>
            <Ionicons name="cube-outline" size={40} color="#CBD5E1" />
            <Text style={s.emptySub}>Enter your crop and quantity, then tap "Find storage".</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  formCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  formTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  formSub: { fontSize: 12.5, color: '#6B7280', marginTop: 4, marginBottom: 14, lineHeight: 18 },
  label: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827', backgroundColor: '#fff',
  },
  row2: { flexDirection: 'row', gap: 12 },
  hintText: { fontSize: 11.5, color: '#B45309', marginTop: 10, lineHeight: 16 },

  searchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 13, marginTop: 16,
  },
  searchBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  noticeBox: {
    flexDirection: 'row', gap: 8, backgroundColor: '#DCFCE7', borderRadius: 12,
    padding: 12, marginTop: 14, alignItems: 'flex-start',
  },
  noticeBoxAmber: { backgroundColor: '#FEF3C7', marginTop: 8 },
  noticeText: { flex: 1, fontSize: 12, color: '#15803D', lineHeight: 17 },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#6B7280', marginTop: 18, marginBottom: 8 },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 12 },
  cardTop: { flexDirection: 'row', gap: 10 },
  name: { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  operator: { fontSize: 11.5, color: '#6B7280', marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  metaText: { fontSize: 12, color: '#6B7280' },
  distChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#DCFCE7', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  distChipText: { fontSize: 10.5, fontWeight: '700', color: '#15803D' },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, height: 22 },
  badgeVerified: { backgroundColor: '#DCFCE7' },
  badgeIllustrative: { backgroundColor: '#FEF3C7' },
  badgeText: { fontSize: 10.5, fontWeight: '700' },

  typeTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F1F5F9', alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginTop: 10 },
  typeTagText: { fontSize: 11, color: '#374151', fontWeight: '600' },

  spaceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  spaceText: { fontSize: 12, color: '#6B7280', flex: 1, lineHeight: 17 },

  rateRow: { marginTop: 8 },
  rateText: { fontSize: 14, fontWeight: '700', color: '#111827' },
  rateEstimatedNote: { fontSize: 11, color: '#B45309', marginTop: 1 },

  refuseBox: { flexDirection: 'row', gap: 8, backgroundColor: '#FEE2E2', borderRadius: 12, padding: 11, marginTop: 12, alignItems: 'flex-start' },
  refuseText: { flex: 1, fontSize: 12.5, color: '#B91C1C', lineHeight: 18 },

  costBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 11, marginTop: 12, gap: 6 },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  costLabel: { fontSize: 12, color: '#6B7280' },
  costValue: { fontSize: 14, fontWeight: '700', color: '#111827' },
  costSub: { fontSize: 12, fontWeight: '600', color: '#111827' },
  pledgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  pledgeText: { fontSize: 11.5, color: '#1D4ED8', fontWeight: '600', flex: 1 },

  callRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  callText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },
  verifiedNoteText: { fontSize: 10.5, color: '#9CA3AF', marginTop: 8, lineHeight: 15 },

  emptyWrap: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 10, lineHeight: 19 },
  errorText: { fontSize: 13.5, color: '#B91C1C', textAlign: 'center', marginTop: 10, lineHeight: 19 },

  footnote: { fontSize: 10.5, color: '#9CA3AF', marginTop: 16, lineHeight: 15, paddingHorizontal: 4 },
});

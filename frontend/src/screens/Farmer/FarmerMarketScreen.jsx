// The farmer's own produce postings — what I've posted, and who wants it.
//
// ⚠️ THIS USED TO SHOW EVERY FARMER'S LOTS (Phase 2a's "browse the market").
// The project owner explicitly asked for that removed: a farmer here wants
// to post their own harvest and see buyer interest on it, not browse a feed
// of other farmers' produce. So this no longer calls the buyer's market feed
// at all — it calls `GET /api/listings/farmer/:uid`, the SAME endpoint
// FarmerSalesScreen already uses, which is scoped server-side to the caller's
// own listings only (403 if the uid doesn't match the token). There is no
// tab back to "everyone's lots" — that capability was removed, not hidden.
//
// A "lot" is the app's word for one listing: one batch of one crop at one
// grade, priced and quantified, that a farmer has posted for sale. It is the
// `CropListing` document underneath.
//
// "Requests" are buyer OFFERS — see routes/offers.js. When a buyer is
// interested in a lot they can propose a price (an Offer, negotiated,
// accept/counter/decline) before it becomes a firm purchase (an Order). That
// is the "buyer is interested" signal this screen surfaces; it is not a
// second concept invented for this screen, it reads the exact same
// `GET /api/offers/farmer/mine` FarmerSalesScreen's Offers tab already uses.
//
// ⚠️ "SELL TO MY FPO" LIVES ON THE GROUP SCREEN, NOT HERE. REPORTED DIRECTLY:
// this screen is the open marketplace ("post your own harvest, see who wants
// it") and selling DIRECTLY to your own group is a different action entirely
// — nesting it inside a market-browsing screen made it read as a market
// feature rather than a direct request to the group. It now lives on
// `Farmer/FpoScreen.jsx` ("My Group"), which is the group's own home screen.
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';

const STATUS_TONE = {
  available: { bg: '#DCFCE7', fg: '#15803D' },
  sold_out: { bg: '#F1F5F9', fg: '#6B7280' },
  withdrawn: { bg: '#F1F5F9', fg: '#9CA3AF' },
};

export default function FarmerMarketScreen({ route, navigation }) {
  // ⚠️ Language comes from the CONTEXT, never from userData or a prop —
  // userData is a snapshot taken at login and does not change when the
  // toggle is tapped. Recorded in CLAUDE.md.
  const { t } = useLanguage();
  const userData = route.params?.userData;
  const uid = userData?.uid || userData?.firebaseUid;

  // ⚠️ EVERY HOOK SITS ABOVE THE FIRST EARLY RETURN. FarmerSalesScreen once
  // crashed on login with "Rendered more hooks than during the previous
  // render" because one useEffect was added below a `if (loading) return`.
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // ── "Post your harvest" — reuses the EXISTING harvest-and-list pipeline,
  // never a second, ad-hoc posting form. A market listing must come from a
  // real registered crop with a real yield (routes/crops.js requires a
  // cropId), so this screen offers a picker over the farmer's own
  // not-yet-harvested crops and hands off to CropDetail, which already opens
  // HarvestPostModal — the same flow FarmerDashboard uses.
  const [postableCrops, setPostableCrops] = useState([]);
  const [showPostPicker, setShowPostPicker] = useState(false);

  // ── "Requests" — offers a buyer has made on this farmer's own lots.
  const [pendingOffers, setPendingOffers] = useState(0);

  const load = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    try {
      setError('');
      const res = await axios.get(`${API_ENDPOINTS.LISTINGS}/farmer/${uid}`, { timeout: 20000 });
      if (res.data?.success) setRows(res.data.listings || []);
      else setError(res.data?.error || t('farmerMarket.loadFailed'));
    } catch (err) {
      setError(err.response?.data?.error || t('farmerMarket.loadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid, t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API_ENDPOINTS.CROPS}/${uid}`, { params: { active: 'true' } });
        if (!cancelled && res.data?.success) {
          setPostableCrops((res.data.crops || []).filter((c) => !c.isHarvested));
        }
      } catch { /* the picker just stays empty; posting isn't blocked elsewhere */ }
      try {
        // Same endpoint FarmerSalesScreen's Offers tab already reads —
        // reused, not re-implemented, so the two counts can never disagree.
        const res = await axios.get(`${API_ENDPOINTS.OFFERS}/farmer/mine`);
        if (!cancelled && res.data?.success) {
          const live = (res.data.offers || []).filter((o) => o.status === 'pending');
          setPendingOffers(live.length);
        }
      } catch { /* a failed count must not block this screen */ }
    })();
    return () => { cancelled = true; };
  }, [uid]));

  const renderCard = ({ item }) => {
    const tone = STATUS_TONE[item.status] || STATUS_TONE.available;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.crop}>{item.cropName}</Text>
            {!!item.cropLocalName && <Text style={styles.local}>{item.cropLocalName}</Text>}
          </View>
          <View style={[styles.statusChip, { backgroundColor: tone.bg }]}>
            <Text style={[styles.statusChipTxt, { color: tone.fg }]}>
              {t(`farmerMarket.status.${item.status}`)}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Ionicons name="cube-outline" size={13} color="#6B7280" />
          <Text style={styles.metaTxt}>
            {Number(item.quantityAvailableKg).toLocaleString('en-IN')} {t('farmerMarket.of')}{' '}
            {Number(item.quantityKg).toLocaleString('en-IN')} {t('farmerMarket.kg')}
          </Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.metaTxt}>₹{item.pricePerKg}{t('farmerMarket.perKg')}</Text>
        </View>

        <View style={styles.gradeRow}>
          <Text style={item.grade?.code ? styles.gradeTxt : styles.gradeNone}>
            {item.grade?.code
              ? `${t('farmerMarket.grade')} ${item.grade.code}`
              : t('farmerMarket.gradeNotDeclared')}
          </Text>
        </View>

        {/* ⚠️ SOLD KILOGRAMS WAITING ON A CAPTAIN ARE NAMED, NOT SILENT.
            Buying decrements the listing and a lapsed dispatch does NOT
            restock it, so those kilograms leave quantityAvailableKg and would
            otherwise appear nowhere — a farmer seeing less stock than they
            posted with no explanation. `committed` is absent (not zeroed)
            when nothing is outstanding. */}
        {!!item.committed && (
          <View style={styles.committedBox}>
            {item.committed.waitingKg > 0 && (
              <Text style={styles.committedLine}>
                {t('farmerMarket.waiting')} {item.committed.waitingKg} {t('farmerMarket.kg')}
              </Text>
            )}
            {item.committed.comingKg > 0 && (
              <Text style={styles.committedLine}>
                {t('farmerMarket.coming')} {item.committed.comingKg} {t('farmerMarket.kg')}
              </Text>
            )}
            {item.committed.stuckKg > 0 && (
              <Text style={[styles.committedLine, { color: '#B45309' }]}>
                {t('farmerMarket.stuck')} {item.committed.stuckKg} {t('farmerMarket.kg')}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setShowPostPicker(true)}
        >
          <Ionicons name="add-circle" size={16} color="#16A34A" />
          <Text style={styles.actionBtnTxt}>{t('farmerMarket.postHarvest')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate('MarketPrices', { userData })}
        >
          <Ionicons name="trending-up" size={16} color="#D97706" />
          <Text style={[styles.actionBtnTxt, { color: '#D97706' }]}>{t('farmerMarket.checkPrices')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, pendingOffers > 0 && styles.actionBtnAlert]}
          onPress={() => navigation.navigate('FarmerSales', { userData, initialTab: 'offers' })}
        >
          <Ionicons
            name={pendingOffers > 0 ? 'notifications' : 'notifications-outline'}
            size={16} color={pendingOffers > 0 ? '#B45309' : '#6B7280'}
          />
          <Text style={[styles.actionBtnTxt, pendingOffers > 0 && { color: '#B45309' }]}>
            {pendingOffers > 0
              ? t('farmerMarket.requestsCount').replace('{n}', pendingOffers)
              : t('farmerMarket.requests')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Post-your-harvest picker ──────────────────────────────────────
          A listing must come from a real registered crop with a real yield
          (routes/crops.js requires a cropId) — this picks WHICH of the
          farmer's own not-yet-harvested crops, then hands off to the
          existing CropDetail → HarvestPostModal flow. No second form. */}
      <Modal visible={showPostPicker} transparent animationType="slide" onRequestClose={() => setShowPostPicker(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t('farmerMarket.pickCropTitle')}</Text>
            {postableCrops.length === 0 ? (
              <Text style={styles.modalEmpty}>{t('farmerMarket.noPostableCrops')}</Text>
            ) : (
              <FlatList
                data={postableCrops}
                keyExtractor={(c) => String(c._id)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalCropRow}
                    onPress={() => {
                      setShowPostPicker(false);
                      navigation.navigate('CropDetail', { crop: item, userData });
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalCropName}>{item.name}</Text>
                      {!!item.localName && <Text style={styles.modalCropLocal}>{item.localName}</Text>}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowPostPicker(false)}>
              <Text style={styles.modalCloseTxt}>{t('farmerMarket.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#16A34A" />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTxt}>{error}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retry}>{t('farmerMarket.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(i) => String(i._id)}
          renderItem={renderCard}
          contentContainerStyle={{ padding: 14, paddingTop: 4 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              colors={['#16A34A']}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTxt}>{t('farmerMarket.emptyMine')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  actionsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  actionBtnAlert: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  actionBtnTxt: { fontSize: 12, color: '#374151', fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '70%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 },
  modalEmpty: { fontSize: 13, color: '#6B7280', paddingVertical: 20, textAlign: 'center' },
  modalCropRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  modalCropName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  modalCropLocal: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  modalClose: { marginTop: 14, alignItems: 'center', paddingVertical: 10 },
  modalCloseTxt: { fontSize: 13, color: '#16A34A', fontWeight: '700' },
  empty: { alignItems: 'center', padding: 40, gap: 10 },
  emptyTxt: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
  retry: { fontSize: 13, color: '#16A34A', fontWeight: '700' },
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  crop: { fontSize: 15, fontWeight: '700', color: '#111827' },
  local: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  statusChipTxt: { fontSize: 10, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, flexWrap: 'wrap' },
  metaTxt: { fontSize: 12, color: '#6B7280' },
  dot: { color: '#D1D5DB', marginHorizontal: 2 },
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  gradeTxt: { fontSize: 11, color: '#15803D', fontWeight: '700' },
  gradeNone: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' },
  committedBox: {
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 3,
  },
  committedLine: { fontSize: 11, color: '#6B7280' },
});

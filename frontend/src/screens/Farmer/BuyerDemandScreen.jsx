import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  ActivityIndicator, RefreshControl, Alert, Linking, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import usePolling from '../../hooks/usePolling';
import { useLanguage } from '../../i18n/LanguageContext';

// Phase E, farmer side: "Buyers looking for your crop".
//
// Matched on commodity, the BUYER's own radius, and grade — so a farmer is
// never shown a trip the buyer would refuse. Responding is not a sale, and the
// copy says so: the buyer still has to make an offer on the lot afterwards.
const BADGE_META = {
  verified:            { key: 'buyerDemand.badgeVerified',   icon: 'shield-checkmark', fg: '#15803D', bg: '#DCFCE7' },
  documents_submitted: { key: 'buyerDemand.badgeDocuments',  icon: 'document-text-outline', fg: '#1D4ED8', bg: '#DBEAFE' },
  rejected:            { key: 'buyerDemand.badgeRejected',   icon: 'alert-circle-outline', fg: '#B91C1C', bg: '#FEE2E2' },
  unverified:          { key: 'buyerDemand.badgeUnverified', icon: 'help-circle-outline', fg: '#9CA3AF', bg: '#F1F5F9' },
};

export default function BuyerDemandScreen({ route }) {
  const { t } = useLanguage();
  const { userData } = route.params || {};

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [reason, setReason] = useState(null);

  const [picking, setPicking] = useState(null);   // the requirement being answered
  const [chosen, setChosen] = useState(null);     // which listing
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const r = await axios.get(`${API_ENDPOINTS.REQUIREMENTS}/for-farmer`, {
        params: showAll ? { all: 1 } : {},
      });
      if (r.data.success) {
        setItems(r.data.requirements);
        setReason(r.data.reason || null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showAll]);

  usePolling(fetchAll, 15000, true);

  const respond = async () => {
    if (!chosen) return Alert.alert(t('buyerDemand.whichLotTitle'), t('buyerDemand.whichLotMsg'));
    setSending(true);
    try {
      const r = await axios.post(`${API_ENDPOINTS.REQUIREMENTS}/${picking._id}/respond`, {
        listingId: chosen._id,
        note,
      });
      if (r.data.success) {
        setPicking(null); setChosen(null); setNote('');
        fetchAll();
        Alert.alert(t('buyerDemand.sentTitle'), r.data.next || t('buyerDemand.sentDefaultMsg'));
      }
    } catch (err) {
      Alert.alert(t('buyerDemand.couldNotSendTitle'), err.response?.data?.error || t('buyerDemand.tryAgain'));
    } finally {
      setSending(false);
    }
  };

  const Card = ({ item }) => {
    const bMeta = BADGE_META[item.vendorVerification] || BADGE_META.unverified;
    const b = { ...bMeta, label: t(bMeta.key) };
    const canRespond = item.matchingListings?.length > 0 && !item.iResponded;

    return (
      <View style={s.card}>
        <View style={s.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.want}>{item.quantityKg} kg {item.commodity}</Text>
            <Text style={s.buyer}>{item.vendorCompany || item.vendorName}</Text>
            <View style={[s.badge, { backgroundColor: b.bg }]}>
              <Ionicons name={b.icon} size={11} color={b.fg} />
              <Text style={[s.badgeText, { color: b.fg }]}>{b.label}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.distLabel}>DISTANCE</Text>
            <Text style={s.dist}>{item.distanceKm} km</Text>
          </View>
        </View>

        <View style={s.metaBox}>
          {(item.priceMin || item.priceMax) && (
            <Text style={s.meta}>
              <Text style={s.metaKey}>{t('buyerDemand.paying')} </Text>
              ₹{item.priceMin ?? '?'}–{item.priceMax ?? '?'}/kg
            </Text>
          )}
          {!!item.minGrade && (
            <Text style={s.meta}><Text style={s.metaKey}>{t('buyerDemand.wantsLabel')} </Text>{t('buyerDemand.grade')} {item.minGrade} {t('buyerDemand.gradeOrBetter')}</Text>
          )}
          <Text style={s.meta}>
            <Text style={s.metaKey}>{t('buyerDemand.deliverTo')} </Text>
            {item.deliveryPoint?.label || item.deliveryPoint?.district || '—'}
          </Text>
          {!!item.deliverBy && (
            <Text style={s.meta}>
              <Text style={s.metaKey}>{t('buyerDemand.by')} </Text>
              {new Date(item.deliverBy).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </Text>
          )}
          {!!item.notes && <Text style={s.notes}>“{item.notes}”</Text>}
        </View>

        {item.iResponded ? (
          <View style={s.doneRow}>
            <Ionicons name="checkmark-circle" size={16} color="#15803D" />
            <Text style={s.doneText}>{t('buyerDemand.responded')}</Text>
          </View>
        ) : canRespond ? (
          <TouchableOpacity
            style={s.cta}
            onPress={() => { setPicking(item); setChosen(item.matchingListings[0]); }}
            activeOpacity={0.85}
          >
            <Ionicons name="hand-right-outline" size={17} color="#fff" />
            <Text style={s.ctaText}>{t('buyerDemand.iHaveThis')}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={s.noLot}>{t('buyerDemand.noMatchingLot')}</Text>
        )}

        {!!item.vendorPhone && (
          <TouchableOpacity style={s.call} onPress={() => Linking.openURL(`tel:${item.vendorPhone}`)}>
            <Ionicons name="call-outline" size={13} color="#2563EB" />
            <Text style={s.callText}>{t('buyerDemand.callFirst')} {item.vendorName} {t('buyerDemand.callFirstSuffix')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;

  return (
    <View style={s.container}>
      <View style={s.filterBar}>
        <TouchableOpacity
          style={[s.filter, !showAll && s.filterOn]}
          onPress={() => { setShowAll(false); setLoading(true); }}
        >
          <Text style={[s.filterText, !showAll && s.filterTextOn]}>{t('buyerDemand.filterHave')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.filter, showAll && s.filterOn]}
          onPress={() => { setShowAll(true); setLoading(true); }}
        >
          <Text style={[s.filterText, showAll && s.filterTextOn]}>{t('buyerDemand.filterAll')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => String(i._id)}
        renderItem={({ item }) => <Card item={item} />}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor="#16A34A"
            onRefresh={() => { setRefreshing(true); fetchAll(); }} />
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}><Ionicons name="search-outline" size={34} color="#16A34A" /></View>
            <Text style={s.emptyTitle}>
              {reason === 'NO_LOCATION' ? t('buyerDemand.registerLandTitle') : t('buyerDemand.noBuyersTitle')}
            </Text>
            <Text style={s.emptySub}>
              {reason === 'NO_LOCATION'
                ? t('buyerDemand.registerLandSub')
                : showAll
                  ? t('buyerDemand.noBuyersAllSub')
                  : t('buyerDemand.noBuyersFilteredSub')}
            </Text>
          </View>
        }
      />

      <Modal visible={!!picking} transparent animationType="slide" onRequestClose={() => setPicking(null)}>
        <View style={s.sheetWrap}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>{t('buyerDemand.whichLotTitle')}</Text>
              <TouchableOpacity onPress={() => setPicking(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={s.sheetSub}>
              {picking?.vendorCompany || picking?.vendorName} {t('buyerDemand.wantsInline')} {picking?.quantityKg} kg {picking?.commodity}
            </Text>

            {picking?.matchingListings?.map((l) => {
              const on = chosen?._id === l._id;
              return (
                <TouchableOpacity key={String(l._id)}
                  style={[s.lot, on && s.lotOn]} onPress={() => setChosen(l)} activeOpacity={0.85}>
                  <Ionicons
                    name={on ? 'radio-button-on' : 'radio-button-off'}
                    size={19} color={on ? '#16A34A' : '#D1D5DB'} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.lotName}>{l.cropName}</Text>
                    <Text style={s.lotMeta}>
                      {l.quantityAvailableKg} {t('buyerDemand.kgAvailable')} · ₹{l.pricePerKg}/kg
                      {l.grade ? ` · ${t('buyerDemand.grade')} ${l.grade}` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            <Text style={s.label}>{t('buyerDemand.messageLabel')}</Text>
            <TextInput style={[s.input, s.multi]} value={note} onChangeText={setNote}
              placeholder={t('buyerDemand.messagePlaceholder')} multiline
              placeholderTextColor="#9CA3AF" maxLength={300} />

            <View style={s.notice}>
              <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
              <Text style={s.noticeText}>{t('buyerDemand.notice')}</Text>
            </View>

            <TouchableOpacity style={[s.cta, sending && { opacity: 0.6 }]} onPress={respond} disabled={sending}>
              {sending ? <ActivityIndicator color="#fff" />
                : <><Ionicons name="send-outline" size={17} color="#fff" />
                    <Text style={s.ctaText}>{t('buyerDemand.putForward')}</Text></>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  list: { padding: 16, gap: 12 },

  filterBar: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 4 },
  filter: { flex: 1, borderRadius: 999, paddingVertical: 9, alignItems: 'center', backgroundColor: '#F1F5F9' },
  filterOn: { backgroundColor: '#DCFCE7' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  filterTextOn: { color: '#15803D', fontWeight: '700' },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  topRow: { flexDirection: 'row', gap: 10 },
  want: { fontSize: 17, fontWeight: '700', color: '#111827' },
  buyer: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2.5, marginTop: 6,
  },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
  distLabel: { fontSize: 9.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.4 },
  dist: { fontSize: 18, fontWeight: '800', color: '#15803D' },

  metaBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 11, marginTop: 12, gap: 4 },
  meta: { fontSize: 12.5, color: '#111827' },
  metaKey: { color: '#9CA3AF' },
  notes: { fontSize: 12.5, color: '#6B7280', fontStyle: 'italic', marginTop: 3 },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 12, marginTop: 12,
  },
  ctaText: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  doneText: { fontSize: 13, fontWeight: '600', color: '#15803D' },
  noLot: { fontSize: 12.5, color: '#9CA3AF', marginTop: 12 },
  call: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  callText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#111827', textAlign: 'center' },
  emptySub: { fontSize: 13.5, color: '#6B7280', textAlign: 'center', marginTop: 6, lineHeight: 20 },

  sheetWrap: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: '#111827' },
  sheetSub: { fontSize: 13, color: '#6B7280', marginTop: 2, marginBottom: 12 },

  lot: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, marginBottom: 8,
  },
  lotOn: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  lotName: { fontSize: 14.5, fontWeight: '600', color: '#111827' },
  lotMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },

  label: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginTop: 8, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827',
  },
  multi: { height: 70, textAlignVertical: 'top' },

  notice: { flexDirection: 'row', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 14 },
  noticeText: { flex: 1, fontSize: 11.5, color: '#6B7280', lineHeight: 17 },
});

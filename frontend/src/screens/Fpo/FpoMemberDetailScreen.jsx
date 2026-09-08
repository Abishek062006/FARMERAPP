// ONE FARMER, FULLY — their profile, their performance, and their whole
// trade history with this group.
//
// Reuses GET /api/fpos/:id/orders (the same endpoint FpoOrdersScreen already
// renders) rather than a new per-farmer endpoint: that route already returns
// `scope: 'group'` to an admin with EVERY member's orders, so filtering to
// one farmerUid client-side is the whole feature — a second backend route
// would just be a second place for the same numbers to disagree. Row
// rendering (status chip, ProgressStepper, payment state, receipt link) is
// intentionally the same markup FpoOrdersScreen uses.
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';
import ProgressStepper from '../../components/ProgressStepper';
import { TRUST_BADGES } from '../../components/fpo/MemberCard';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const kgs = (n) => `${Number(n || 0).toLocaleString('en-IN')} kg`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : null);

const STATUS_TONE = {
  delivered: { bg: '#DCFCE7', fg: '#15803D' },
  picked_up: { bg: '#DBEAFE', fg: '#1D4ED8' },
  accepted: { bg: '#DBEAFE', fg: '#1D4ED8' },
  awaiting_agent: { bg: '#F1F5F9', fg: '#6B7280' },
  no_agents: { bg: '#FEF3C7', fg: '#B45309' },
  stranded: { bg: '#FEE2E2', fg: '#B91C1C' },
  cancelled: { bg: '#F1F5F9', fg: '#9CA3AF' },
};

export default function FpoMemberDetailScreen({ route, navigation }) {
  const { t } = useLanguage();
  const { fpoId, farmerUid, userData } = route.params || {};

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await axios.get(`${API_ENDPOINTS.FPOS}/${fpoId}/orders`, { timeout: 20000 });
      if (res.data?.success) setData(res.data);
      else setError(res.data?.error || t('fpoOrders.loadFailed'));
    } catch (err) {
      setError(err.response?.data?.error || t('fpoOrders.loadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fpoId, t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const orders = useMemo(
    () => (data?.orders || []).filter((o) => o.farmerUid === farmerUid),
    [data, farmerUid]
  );

  // Profile fields (name, village) are only present on the ORDER rows this
  // farmer actually has — a member with zero trade history still needs a
  // header, so `farmerName` also comes as a route param from whichever card
  // was tapped (dashboard carousel or the "see all" grid), which always has
  // it regardless of trade history.
  const { farmerName: paramName, village: paramVillage, trust: paramTrust } = route.params || {};
  const farmerName = orders[0]?.farmerName || paramName || t('fpoMemberDetail.member');

  const delivered = orders.filter((o) => o.status === 'delivered');
  const totalKg = delivered.reduce((a, o) => a + (o.quantityKg || 0), 0);
  const totalEarned = delivered.reduce((a, o) => a + (o.farmerPayout || 0), 0);
  const unpaid = delivered.filter((o) => !o.payment.paid);
  const unpaidAmount = unpaid.reduce((a, o) => a + (o.farmerPayout || 0), 0);
  const trustMeta = paramTrust?.scored ? TRUST_BADGES[paramTrust.band] : null;

  const renderRow = ({ item }) => {
    const tone = STATUS_TONE[item.status] || STATUS_TONE.awaiting_agent;
    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={item.status === 'delivered' ? 0.7 : 1}
        onPress={() => item.status === 'delivered'
          && navigation.navigate('Receipt', { orderId: item._id, userData })}
      >
        <View style={s.top}>
          <Text style={s.crop}>{item.cropName}</Text>
          <View style={[s.chip, { backgroundColor: tone.bg }]}>
            <Text style={[s.chipTxt, { color: tone.fg }]}>{t(`fpoOrders.status.${item.status}`)}</Text>
          </View>
        </View>

        <ProgressStepper status={item.status} kind="order" compact />

        <View style={s.line}>
          <Text style={s.lineLabel}>
            {Number(item.quantityKg).toLocaleString('en-IN')} {t('fpoOrders.kg')}
            {item.pricePerKg != null ? ` · ₹${item.pricePerKg}/${t('fpoOrders.kg')}` : ''}
          </Text>
          <Text style={s.payout}>{money(item.farmerPayout)}</Text>
        </View>

        <View style={s.dates}>
          <Text style={s.dateTxt}>{t('fpoOrders.ordered')} {day(item.orderedAt)}</Text>
          {!!item.deliveredAt && <Text style={s.dateTxt}> · {t('fpoOrders.delivered')} {day(item.deliveredAt)}</Text>}
        </View>

        <View style={s.payBox}>
          {item.payment.paid ? (
            <View style={s.payRow}>
              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
              <Text style={s.paidTxt}>{t('fpoOrders.paidOn')} {day(item.payment.paidAt)}</Text>
            </View>
          ) : (
            <View style={s.payRow}>
              <Ionicons name="time-outline" size={14} color="#B45309" />
              <Text style={s.unpaidTxt}>{t('fpoOrders.outstanding')} {money(item.payment.balanceDue)}</Text>
            </View>
          )}
        </View>

        {item.status === 'delivered' && (
          <Text style={s.receiptLink}>{t('fpoOrders.openReceipt')} →</Text>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;

  if (error && !data) {
    return (
      <View style={s.center}>
        <Text style={s.errTxt}>{error}</Text>
        <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
          <Text style={s.retry}>{t('fpoOrders.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      style={s.screen}
      data={orders}
      keyExtractor={(i) => String(i._id)}
      renderItem={renderRow}
      contentContainerStyle={{ padding: 14 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#16A34A']} />
      }
      ListHeaderComponent={
        <View style={s.headerCard}>
          <View style={s.avatar}><Text style={s.avatarText}>{farmerName[0]?.toUpperCase() || '?'}</Text></View>
          <Text style={s.name}>{farmerName}</Text>
          {!!paramVillage && <Text style={s.village}>{paramVillage}</Text>}

          <View style={s.statRow}>
            <View style={s.stat}>
              <Text style={s.statNum}>{kgs(totalKg)}</Text>
              <Text style={s.statLabel}>{t('fpoDashboard.kgSupplied')}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statNum}>{money(totalEarned)}</Text>
              <Text style={s.statLabel}>{t('fpoDashboard.earned')}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statNum}>{delivered.length}</Text>
              <Text style={s.statLabel}>{t('fpoMemberDetail.deliveries')}</Text>
            </View>
          </View>

          {unpaid.length > 0 && (
            <View style={s.unpaidChip}>
              <Ionicons name="time-outline" size={12} color="#B45309" />
              <Text style={s.unpaidChipText}>
                {unpaid.length} {t('fpoDashboard.unpaidSuffix')} · {money(unpaidAmount)}
              </Text>
            </View>
          )}

          {trustMeta && (
            <View style={[s.trustBadge, { backgroundColor: trustMeta.bg }]}>
              <Ionicons name={trustMeta.icon} size={12} color={trustMeta.fg} />
              <Text style={[s.trustBadgeText, { color: trustMeta.fg }]}>
                {t(`fpoDashboard.trust.${paramTrust.band}`)}
              </Text>
            </View>
          )}

          <Text style={s.historyHead}>{t('fpoMemberDetail.historyTitle')}</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={s.center}>
          <Ionicons name="receipt-outline" size={34} color="#CBD5E1" />
          <Text style={s.emptyTxt}>{t('fpoMemberDetail.noOrders')}</Text>
        </View>
      }
    />
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 34, gap: 10 },
  errTxt: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
  retry: { fontSize: 13, color: '#16A34A', fontWeight: '700' },
  emptyTxt: { fontSize: 13, color: '#6B7280', textAlign: 'center' },

  headerCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: '#F1F5F9', alignItems: 'center',
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#15803D' },
  name: { fontSize: 18, fontWeight: '800', color: '#111827' },
  village: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },

  statRow: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' },
  stat: {
    flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9',
  },
  statNum: { fontSize: 14, fontWeight: '900', color: '#15803D' },
  statLabel: { fontSize: 9.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.3, marginTop: 3, textAlign: 'center' },

  unpaidChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FEF3C7',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginTop: 12,
  },
  unpaidChipText: { fontSize: 11.5, fontWeight: '700', color: '#B45309' },
  trustBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5, marginTop: 8,
  },
  trustBadgeText: { fontSize: 11.5, fontWeight: '700' },

  historyHead: {
    fontSize: 10.5, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase',
    letterSpacing: 0.6, marginTop: 18, alignSelf: 'flex-start',
  },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  crop: { fontSize: 15, fontWeight: '700', color: '#111827' },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  chipTxt: { fontSize: 10, fontWeight: '700' },
  line: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 10 },
  lineLabel: { fontSize: 12, color: '#6B7280' },
  payout: { fontSize: 16, fontWeight: '800', color: '#111827' },
  dates: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  dateTxt: { fontSize: 11, color: '#9CA3AF' },
  payBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  paidTxt: { fontSize: 12, color: '#15803D', fontWeight: '600' },
  unpaidTxt: { fontSize: 12, color: '#B45309', fontWeight: '600' },
  receiptLink: { fontSize: 12, color: '#16A34A', fontWeight: '700', marginTop: 10 },
});

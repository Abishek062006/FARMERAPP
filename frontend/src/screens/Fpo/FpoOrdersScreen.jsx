// The FPO's trade history — what the group has sold, what has been PAID for,
// and what is still owed.
//
// ═══ WHY THIS SCREEN EXISTS ═══════════════════════════════════════════════
//
// The arithmetic to divide money across members shipped some time ago
// (`GET /:id/settlement`, `computeSettlement()`), but it REQUIRES `orderIds`
// — and nothing anywhere listed a group's orders. So an FPO officer could
// settle orders they had no way to find, and neither the officer nor a member
// could answer the three questions the group actually turns on: what was
// sold, what has been paid, what is outstanding. That is the "route file
// exists, nothing calls it" defect recorded four times in CLAUDE.md.
//
// ⚠️ TWO AUDIENCES, AND THE SERVER DECIDES WHICH ONE YOU ARE.
// `GET /api/fpos/:id/orders` returns `scope: 'group'` to the admin (every
// member's orders — that is the officer's job) and `scope: 'own'` to a member
// (their own only — a member is not entitled to another member's payout just
// by belonging to the same company). This screen RENDERS the scope it is
// given and never infers it from the role: a client-side identity check is
// exactly what "never trust client identity" forbids.
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';
import ProgressStepper from '../../components/ProgressStepper';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : null);

// The colour is the STATUS, not a judgement. `no_agents` is amber because it
// is a wait that has already FAILED and needs the buyer to retry or cancel —
// a farmer must not be left waiting on something that has stopped moving.
const STATUS_TONE = {
  delivered: { bg: '#DCFCE7', fg: '#15803D' },
  picked_up: { bg: '#DBEAFE', fg: '#1D4ED8' },
  accepted: { bg: '#DBEAFE', fg: '#1D4ED8' },
  awaiting_agent: { bg: '#F1F5F9', fg: '#6B7280' },
  no_agents: { bg: '#FEF3C7', fg: '#B45309' },
  stranded: { bg: '#FEE2E2', fg: '#B91C1C' },
  cancelled: { bg: '#F1F5F9', fg: '#9CA3AF' },
};

export default function FpoOrdersScreen({ route, navigation }) {
  const { t } = useLanguage();
  const fpoId = route.params?.fpoId;
  const userData = route.params?.userData;

  // ⚠️ Every hook above the first early return.
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');   // all | unpaid | delivered

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

  // On focus, not on mount: an officer comes back here straight after
  // recording a payment elsewhere and must not be shown the pre-payment view.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rows = useMemo(() => {
    const all = data?.orders || [];
    if (filter === 'unpaid') return all.filter((o) => o.status === 'delivered' && !o.payment.paid);
    if (filter === 'delivered') return all.filter((o) => o.status === 'delivered');
    return all;
  }, [data, filter]);

  const totals = data?.totals;

  const renderRow = ({ item }) => {
    const tone = STATUS_TONE[item.status] || STATUS_TONE.awaiting_agent;
    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={item.status === 'delivered' ? 0.7 : 1}
        // A receipt only exists for a completed order. Offering the link on
        // an order that has none would be a dead control.
        onPress={() => item.status === 'delivered'
          && navigation.navigate('Receipt', { orderId: item._id, userData })}
      >
        <View style={s.top}>
          <View style={{ flex: 1 }}>
            <Text style={s.crop}>{item.cropName}</Text>
            {/* The admin's view spans members, so whose lot it was is the
                first thing they need. A member's own view already knows. */}
            {data?.scope === 'group' && (
              <Text style={s.member}>{item.farmerName}</Text>
            )}
          </View>
          <View style={[s.chip, { backgroundColor: tone.bg }]}>
            <Text style={[s.chipTxt, { color: tone.fg }]}>
              {t(`fpoOrders.status.${item.status}`)}
            </Text>
          </View>
        </View>

        {/* Phase 5, T2 — the same progress spine a buyer or farmer sees, on
            the group's own copy of this order. */}
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
          {!!item.deliveredAt && (
            <Text style={s.dateTxt}> · {t('fpoOrders.delivered')} {day(item.deliveredAt)}</Text>
          )}
        </View>

        {/* ── Payment ──────────────────────────────────────────────────
            ⚠️ PAID / UNPAID / ADVANCE-ONLY ARE THREE STATES, NOT TWO.
            `paid` means FULLY settled. An advance the buyer agreed and did
            not send is the farmer's whole problem and must never render the
            same as "no advance agreed" — so the outstanding promise gets its
            own line, in its own words. */}
        <View style={s.payBox}>
          {item.payment.paid ? (
            <>
              <View style={s.payRow}>
                <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                <Text style={s.paidTxt}>
                  {t('fpoOrders.paidOn')} {day(item.payment.paidAt)}
                  {item.payment.method ? ` · ${t(`fpoOrders.method.${item.payment.method}`)}` : ''}
                </Text>
              </View>
              {!!item.payment.txnRef && (
                <Text style={s.txn}>{t('fpoOrders.ref')} {item.payment.txnRef}</Text>
              )}
              {/* ⚠️ NEVER HIDDEN. The app's own rail moves no money. Without
                  this line a demonstration transaction is indistinguishable
                  from a real settlement to whoever reads this screen. */}
              {item.payment.simulated && (
                <Text style={s.simulated}>{t('fpoOrders.simulated')}</Text>
              )}
            </>
          ) : (
            <>
              <View style={s.payRow}>
                <Ionicons name="time-outline" size={14} color="#B45309" />
                <Text style={s.unpaidTxt}>
                  {t('fpoOrders.outstanding')} {money(item.payment.balanceDue)}
                </Text>
              </View>
              {item.payment.advanceAgreed > 0 && (
                item.payment.advanceOutstanding > 0 ? (
                  <Text style={s.advanceWarn}>
                    {t('fpoOrders.advancePromised').replace('{amt}', money(item.payment.advanceOutstanding))}
                  </Text>
                ) : (
                  <Text style={s.advanceOk}>
                    {t('fpoOrders.advanceIn').replace('{amt}', money(item.payment.advanceReceived))}
                  </Text>
                )
              )}
            </>
          )}
        </View>

        {item.status === 'delivered' && (
          <Text style={s.receiptLink}>{t('fpoOrders.openReceipt')} →</Text>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;

  if (error) {
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
    <View style={s.screen}>
      <FlatList
        data={rows}
        keyExtractor={(i) => String(i._id)}
        renderItem={renderRow}
        contentContainerStyle={{ padding: 14 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#16A34A']} />
        }
        ListHeaderComponent={
          <>
            {/* A member is TOLD this is only their own trade, rather than
                being left to wonder where everyone else's orders went. */}
            {!!data?.meta?.note && <Text style={s.scopeNote}>{data.meta.note}</Text>}

            {totals && (
              <View style={s.totalsCard}>
                <View style={s.totalsRow}>
                  <View style={s.totalCell}>
                    <Text style={s.totalNum}>{money(totals.paidValue)}</Text>
                    <Text style={s.totalLbl}>{t('fpoOrders.received')}</Text>
                  </View>
                  <View style={s.totalDivider} />
                  <View style={s.totalCell}>
                    <Text style={[s.totalNum, { color: '#B45309' }]}>{money(totals.outstandingValue)}</Text>
                    <Text style={s.totalLbl}>{t('fpoOrders.stillOwed')}</Text>
                  </View>
                </View>
                {/* ⚠️ THE BASIS IS STATED. These totals are over the PAGE, not
                    the whole history — reporting a page figure as a whole
                    -result figure is what once made 1,159 lots read as 200. */}
                <Text style={s.totalsBasis}>
                  {t('fpoOrders.basis')
                    .replace('{shown}', data.meta.shown)
                    .replace('{total}', data.meta.total)}
                </Text>
                {totals.simulatedPayments > 0 && (
                  <Text style={s.simulatedNote}>
                    {t('fpoOrders.simulatedCount').replace('{n}', totals.simulatedPayments)}
                  </Text>
                )}
              </View>
            )}

            <View style={s.tabs}>
              {['all', 'delivered', 'unpaid'].map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[s.tab, filter === f && s.tabOn]}
                  onPress={() => setFilter(f)}
                >
                  <Text style={[s.tabTxt, filter === f && s.tabTxtOn]}>{t(`fpoOrders.tab.${f}`)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={s.center}>
            <Ionicons name="receipt-outline" size={34} color="#CBD5E1" />
            <Text style={s.emptyTxt}>{t('fpoOrders.empty')}</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 34, gap: 10 },
  errTxt: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
  retry: { fontSize: 13, color: '#16A34A', fontWeight: '700' },
  emptyTxt: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
  scopeNote: { fontSize: 11, color: '#6B7280', marginBottom: 10, lineHeight: 16 },
  totalsCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  totalsRow: { flexDirection: 'row', alignItems: 'center' },
  totalCell: { flex: 1, alignItems: 'center' },
  totalDivider: { width: 1, height: 34, backgroundColor: '#F1F5F9' },
  totalNum: { fontSize: 18, fontWeight: '800', color: '#16A34A' },
  totalLbl: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  totalsBasis: { fontSize: 10, color: '#9CA3AF', marginTop: 10, textAlign: 'center' },
  simulatedNote: { fontSize: 10, color: '#B45309', marginTop: 4, textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tab: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#F1F5F9',
  },
  tabOn: { backgroundColor: '#DCFCE7', borderColor: '#16A34A' },
  tabTxt: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  tabTxtOn: { color: '#15803D' },
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  crop: { fontSize: 15, fontWeight: '700', color: '#111827' },
  member: { fontSize: 12, color: '#6B7280', marginTop: 1 },
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
  txn: { fontSize: 10, color: '#9CA3AF', marginTop: 3, fontFamily: 'monospace' },
  simulated: { fontSize: 10, color: '#B45309', marginTop: 3, fontStyle: 'italic' },
  advanceWarn: { fontSize: 11, color: '#B45309', marginTop: 4, lineHeight: 15 },
  advanceOk: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  receiptLink: { fontSize: 12, color: '#16A34A', fontWeight: '700', marginTop: 10 },
});

// ═══════════════════════════════════════════════════════════════════════════
// F2 — WHAT I AM OWED, WITH EVERY DEDUCTION NAMED.
//
// The number one reason real Indian FPOs lose members' trust: "they sold my
// onions for ₹20 and told me ₹16 — where did the rest go?" `computeSettlement()`
// has always been able to answer that; this is the first screen that shows
// the ANSWER to the person it is about, not just the admin.
//
// ⚠️ NOT EVERY SALE A MEMBER MAKES IS FPO-FACILITATED. Selling your own
// listing independently — the group had no part in it — carries no fee and
// does not appear here at all. Only a pooled lot sale, or a sale of produce
// the group actually weighed and held (F1 walk-in intake), does.
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function FpoMySettlementScreen({ route }) {
  const { t } = useLanguage();
  const { fpoId } = route.params || {};

  const [rows, setRows] = useState([]);
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await axios.get(`${API_ENDPOINTS.FPOS}/${fpoId}/my-settlement`, { timeout: 20000 });
      if (res.data?.success) { setRows(res.data.settlements || []); setNote(res.data.note || null); }
      else setError(res.data?.error || t('fpoSettle.loadFailed'));
    } catch (err) {
      setError(err.response?.data?.error || t('fpoSettle.loadFailed'));
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [fpoId, t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;
  }

  return (
    <ScrollView
      style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {!!error && (
        <View style={[s.card, s.cardWarn]}>
          <Text style={s.warnTxt}>{error}</Text>
        </View>
      )}

      {!error && rows.length === 0 && (
        <View style={s.emptyWrap}>
          <Ionicons name="receipt-outline" size={40} color="#D1D5DB" />
          <Text style={s.emptyTitle}>{t('fpoSettle.nothingYet')}</Text>
          <Text style={s.emptyMsg}>{note || t('fpoSettle.nothingYetSub')}</Text>
        </View>
      )}

      {rows.map((r) => (
        <View key={r.batchId} style={s.card}>
          <View style={s.rowTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.crop}>{r.cropName}</Text>
              <Text style={s.meta}>
                {r.quantityKg} {t('fpoSettle.kg')} ·{' '}
                {r.type === 'pooled' ? t('fpoSettle.pooledSale') : t('fpoSettle.fpoHeldSale')}
                {r.deliveredAt ? ` · ${new Date(r.deliveredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
              </Text>
            </View>
            <View style={[s.pill, r.settled ? s.pillPaid : s.pillDue]}>
              <Text style={[s.pillTxt, r.settled ? s.pillTxtPaid : s.pillTxtDue]}>
                {r.settled ? t('fpoSettle.paid') : t('fpoSettle.duePill')}
              </Text>
            </View>
          </View>

          <View style={s.divider} />

          <Row label={t('fpoSettle.grossAmount')} value={money(r.grossAmount)} />
          {r.paymentMode === 'procurement' ? (
            <Row label={t('fpoSettle.agreedRate')} value={money(r.agreedAmount)} muted />
          ) : (
            <Row label={t('fpoSettle.groupFee')} value={`− ${money(r.fpoFee)}`} muted negative />
          )}
          {r.freightOwed > 0 && (
            <Row label={t('fpoSettle.freightOwed')} value={`− ${money(r.freightOwed)}`} muted negative />
          )}
          <View style={s.divider} />
          <Row label={t('fpoSettle.youGet')} value={money(r.amount)} strong />

          {r.settled && (
            <Text style={s.paidNote}>
              {t('fpoSettle.paidOn')} {new Date(r.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {r.method ? ` · ${r.method === 'in_app' ? t('fpoSettle.viaApp') : r.method}` : ''}
              {r.txnRef ? ` · ${r.txnRef}` : ''}
            </Text>
          )}
          {r.simulated && (
            <Text style={s.simNote}>{t('fpoSettle.simulatedNote')}</Text>
          )}
          {r.gap && (
            <View style={s.gapBox}>
              <Ionicons name="alert-circle-outline" size={14} color="#B45309" />
              <Text style={s.gapTxt}>{r.gap.detail}</Text>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const Row = ({ label, value, strong, muted, negative }) => (
  <View style={s.line}>
    <Text style={[s.lineLabel, muted && s.lineLabelMuted]}>{label}</Text>
    <Text style={[s.lineValue, strong && s.lineValueStrong, negative && s.lineValueNeg]}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 12 },
  cardWarn: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  warnTxt: { fontSize: 12.5, color: '#92400E', lineHeight: 18 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  crop: { fontSize: 15, fontWeight: '700', color: '#111827' },
  meta: { fontSize: 11.5, color: '#6B7280', marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillPaid: { backgroundColor: '#DCFCE7' },
  pillDue: { backgroundColor: '#FFFBEB' },
  pillTxt: { fontSize: 10.5, fontWeight: '700' },
  pillTxtPaid: { color: '#15803D' },
  pillTxtDue: { color: '#B45309' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  lineLabel: { fontSize: 13, color: '#111827' },
  lineLabelMuted: { color: '#6B7280' },
  lineValue: { fontSize: 13, color: '#111827', fontWeight: '600' },
  lineValueStrong: { fontSize: 16, fontWeight: '800', color: '#15803D' },
  lineValueNeg: { color: '#B91C1C' },
  paidNote: { fontSize: 11, color: '#6B7280', marginTop: 8 },
  simNote: { fontSize: 10.5, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
  gapBox: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderRadius: 10, padding: 9, marginTop: 8 },
  gapTxt: { flex: 1, fontSize: 11.5, color: '#92400E', lineHeight: 16 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  emptyMsg: { fontSize: 12.5, color: '#6B7280', textAlign: 'center', paddingHorizontal: 30, lineHeight: 18 },
});

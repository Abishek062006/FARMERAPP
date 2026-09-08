import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';
import { nf, money, kgs, perKg, gradeVisual } from '../../utils/lotDisplay';

// ═══════════════════════════════════════════════════════════════════════════
// ONE LOT, OPENED UP — GET /api/fpos/:id/lot?lotKey=…
// ═══════════════════════════════════════════════════════════════════════════
//
// The dashboard showed a group's produce aggregated by crop and grade and
// there was NOTHING UNDERNEATH IT. An admin looking at "Onion · Grade A ·
// 2,400 kg" could not see which members it came from, what each of them is
// asking, or whether any of them has ever actually delivered. They were reading
// a headline and being asked to run a business on it.
//
// ── WHAT THIS SCREEN DOES NOT DECIDE ──────────────────────────────────────
//
// It does not rank the members, score them, or suggest who to sell first. Each
// contributor carries the SAME delivery record a buyer sees — not a friendlier
// copy for the group — and `trustService` refuses to band anybody below a
// minimum number of completed trades, so most rows here show counts and no
// label at all. That refusal is the point: on the handful of deliveries a real
// smallholder has, a band is mostly noise, and the person paying for that noise
// has the least power in the trade.
//
// ⚠️ A MEMBER WITH NO HISTORY IS NOT A BAD MEMBER. Most members of a real FPO
// have sold nothing through this app yet. Their row says "no completed sales
// yet" in words — never a blank that reads as fine, and never an average
// borrowed from the group.

const TRUST_BADGE = {
  clean:          { fg: '#15803D', bg: '#DCFCE7', icon: 'checkmark-circle' },
  few_complaints: { fg: '#1D4ED8', bg: '#DBEAFE', icon: 'information-circle-outline' },
  some_upheld:    { fg: '#B45309', bg: '#FEF3C7', icon: 'alert-circle-outline' },
  frequent:       { fg: '#B91C1C', bg: '#FEE2E2', icon: 'warning-outline' },
};

export default function FpoLotScreen({ route }) {
  const { t } = useLanguage();
  const { fpoId, lotKey, cropName } = route?.params || {};

  // All hooks above the first early return.
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');

  const fetchIt = useCallback(async () => {
    try {
      const r = await axios.get(`${API_ENDPOINTS.FPOS}/${fpoId}/lot`, { params: { lotKey } });
      setData(r.data);
      setErr('');
    } catch (e) {
      setErr(e.response?.data?.error || t('fpoLot.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fpoId, lotKey, t]);

  useEffect(() => { fetchIt(); }, [fetchIt]);

  // ── FIRST EARLY RETURN. Every hook above it. ──────────────────────────
  if (loading) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;

  if (err || !data) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={38} color="#DC2626" />
        <Text style={s.errText}>{err || t('fpoLot.loadError')}</Text>
      </View>
    );
  }

  const lot = data.lot || {};
  const g = gradeVisual(lot);
  const gh = data.groupHistory || {};
  const dateOf = (d) => { try { return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; } catch { return '—'; } };

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor="#16A34A"
        onRefresh={() => { setRefreshing(true); fetchIt(); }} />}
    >
      {/* ── The lot itself ── */}
      <View style={s.card}>
        <Text style={s.crop}>{lot.cropName || cropName}</Text>
        <View style={s.chipRow}>
          <View style={[s.gradeChip, g.dashed && s.gradeChipUngraded,
            { backgroundColor: g.bg, borderColor: g.border, borderStyle: g.dashed ? 'dashed' : 'solid' }]}>
            <Ionicons name={g.icon} size={11} color={g.fg} />
            <Text style={[s.gradeChipText, { color: g.fg }]}>{g.label}</Text>
          </View>
          {/* A grade chip never travels alone — nobody inspected any of this. */}
          {g.declared && g.selfDeclared && (
            <View style={s.selfChip}>
              <Ionicons name="eye-off-outline" size={10} color="#64748B" />
              <Text style={s.selfChipText}>{t('fpoDashboard.selfDeclared')}</Text>
            </View>
          )}
        </View>

        <View style={s.statRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{kgs(lot.totalKg)}</Text>
            <Text style={s.statLabel}>{t('fpoLot.onOffer')}</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statNum}>{nf(lot.membersIncluded ?? (lot.contributors || []).length)}</Text>
            <Text style={s.statLabel}>{t('fpoLot.members')}</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statNum}>{money(lot.cropValue)}</Text>
            <Text style={s.statLabel}>{t('fpoLot.atAskingPrices')}</Text>
          </View>
        </View>

        {/* The spread, never averaged away — no single ₹/kg describes this lot
            and the backend says so. */}
        {!!lot.price && lot.price.minPerKg != null && (
          <Text style={s.spread}>
            {t('fpoLot.priceSpread')} {perKg(lot.price.minPerKg)} – {perKg(lot.price.maxPerKg)}
            {lot.price.wide ? ` · ${t('fpoLot.wideSpread')}` : ''}
          </Text>
        )}
        <Text style={s.disclaimer}>{data.disclaimers?.grade}</Text>
      </View>

      {/* ── Who this lot is actually made of ── */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>{t('fpoLot.whoSupplies')}</Text>
        {(data.contributors || []).map((c) => {
          const h = c.history || {};
          const band = c.trust?.band ? TRUST_BADGE[c.trust.band] : null;
          return (
            <View key={String(c.listingId || c._id)} style={s.row}>
              <View style={s.rowHead}>
                <Text style={s.name}>{c.farmerName}</Text>
                <Text style={s.rowKg}>{kgs(c.quantityKg)}</Text>
              </View>
              <Text style={s.rowMeta}>
                {t('fpoLot.asking')} {perKg(c.pricePerKg)} · {t('fpoLot.minOrder')} {kgs(c.minOrderKg)}
              </Text>

              {/* HISTORY — the one thing neither the dashboard nor the buyer's
                  catalog has. Zero is printed as zero, with a sentence. */}
              {h.sales > 0 ? (
                <View style={s.histBox}>
                  <Text style={s.histLine}>
                    {h.sales} {t('fpoLot.pastSales')} · {kgs(h.kgDelivered)} · {t('fpoLot.realised')} {perKg(h.avgPricePerKg)}
                  </Text>
                  <Text style={s.histMeta}>
                    {t('fpoLot.lastSold')} {dateOf(h.lastSaleAt)}
                    {h.unsettledCount > 0 ? ` · ${h.unsettledCount} ${t('fpoLot.unsettled')}` : ''}
                    {h.weighedSales > 0 ? ` · ${h.weighedSales} ${t('fpoLot.weighed')}` : ''}
                  </Text>
                  {/* The only grade evidence this app treats as established. */}
                  {h.concededDowngrades > 0 && (
                    <Text style={s.histConceded}>
                      {h.concededDowngrades} {t('fpoLot.concededDowngrades')}
                    </Text>
                  )}
                </View>
              ) : (
                <Text style={s.noHist}>{t('fpoLot.noHistory')}</Text>
              )}

              {/* The SAME record a buyer sees, banded only where the app is
                  willing to band at all. */}
              {band ? (
                <View style={[s.trustChip, { backgroundColor: band.bg }]}>
                  <Ionicons name={band.icon} size={11} color={band.fg} />
                  <Text style={[s.trustText, { color: band.fg }]}>{c.trust.label || c.trust.band}</Text>
                </View>
              ) : (
                <Text style={s.trustNone}>{t('fpoLot.notEnoughToBand')}</Text>
              )}
            </View>
          );
        })}
        <Text style={s.disclaimer}>{data.disclaimers?.trust}</Text>
      </View>

      {/* ── What this crop has actually realised for the group ── */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>{t('fpoLot.groupHistory')}</Text>
        {gh.sales > 0 ? (
          <>
            <View style={s.statRow}>
              <View style={s.stat}>
                <Text style={s.statNum}>{nf(gh.sales)}</Text>
                <Text style={s.statLabel}>{t('fpoLot.pastSales')}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statNum}>{kgs(gh.kgSold)}</Text>
                <Text style={s.statLabel}>{t('fpoLot.sold')}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statNum}>{perKg(gh.realisedAvgPerKg)}</Text>
                <Text style={s.statLabel}>{t('fpoLot.realised')}</Text>
              </View>
            </View>
            <Text style={s.rowMeta}>
              {t('fpoLot.rangeWas')} {perKg(gh.lowestPerKg)} – {perKg(gh.highestPerKg)} ·
              {' '}{t('fpoLot.lastSold')} {dateOf(gh.lastSaleAt)}
            </Text>
          </>
        ) : (
          <Text style={s.noHist}>{gh.note}</Text>
        )}
        {gh.sales > 0 && <Text style={s.disclaimer}>{gh.note}</Text>}
        <Text style={s.disclaimer}>{data.disclaimers?.history}</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', padding: 28 },
  errText: { fontSize: 13, color: '#6B7280', marginTop: 10, textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  crop: { fontSize: 18, fontWeight: '800', color: '#111827' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  gradeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  gradeChipUngraded: { borderRadius: 6 },
  gradeChipText: { fontSize: 11, fontWeight: '700' },
  selfChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: '#F1F5F9',
  },
  selfChipText: { fontSize: 10, color: '#64748B', fontWeight: '600' },

  statRow: { flexDirection: 'row', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 15, fontWeight: '800', color: '#15803D' },
  statLabel: { fontSize: 10, color: '#9CA3AF', marginTop: 2, textAlign: 'center' },
  spread: { fontSize: 12, color: '#6B7280', marginTop: 10 },
  disclaimer: { fontSize: 10, color: '#9CA3AF', lineHeight: 15, marginTop: 10 },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 8 },
  row: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' },
  rowKg: { fontSize: 13, fontWeight: '800', color: '#15803D' },
  rowMeta: { fontSize: 12, color: '#6B7280', marginTop: 3 },

  histBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, marginTop: 8 },
  histLine: { fontSize: 12, color: '#111827', fontWeight: '600' },
  histMeta: { fontSize: 11, color: '#6B7280', marginTop: 3 },
  histConceded: { fontSize: 11, color: '#B45309', marginTop: 3 },
  noHist: { fontSize: 12, color: '#9CA3AF', lineHeight: 17, marginTop: 8 },

  trustChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginTop: 8,
  },
  trustText: { fontSize: 10, fontWeight: '700' },
  trustNone: { fontSize: 10, color: '#9CA3AF', marginTop: 8 },
});

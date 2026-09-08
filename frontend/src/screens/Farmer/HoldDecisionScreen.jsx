import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';

// H2 — "hold" priced in rupees.
//
// D2 already answers `{action: 'hold', confidence: 'medium'}`. That is the
// right question in the wrong unit. The problem statement's own diagnosis is
// that farmers sell at harvest "because of liquidity or storage constraints" —
// so a farmer weighing a wait needs rent, spoilage and this week's money in
// the same figure, not a probability.
//
// THE REFUSAL PATHS ARE THE FEATURE. A rupee number reads as far more certain
// than a percentage, so this screen has to render an honest "cannot say" at
// least as prominently as it renders a number.

const money = (n) => {
  const v = Number(n || 0);
  const s = `₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}`;
  return v < 0 ? `−${s}` : s;
};

const TYPE_ICON = {
  on_farm: 'home-outline',
  ventilated_chawl: 'grid-outline',
  godown: 'business-outline',
  cold_storage: 'snow-outline',
  silo: 'cube-outline',
};

export default function HoldDecisionScreen({ route }) {
  const { t } = useLanguage();
  const { userData, listing } = route.params || {};

  const [commodity, setCommodity] = useState(listing?.cropName || '');
  const [quantityKg, setQuantityKg] = useState(listing?.quantityKg ? String(listing.quantityKg) : '');
  const [pricePerKg, setPricePerKg] = useState(listing?.pricePerKg ? String(listing.pricePerKg) : '');
  const [days, setDays] = useState(7);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const ask = useCallback(async () => {
    if (!commodity.trim() || !Number(quantityKg)) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API_ENDPOINTS.MANDI}/hold-decision`, {
        params: {
          commodity: commodity.trim(),
          district: userData?.location?.district,
          quantityKg: Number(quantityKg),
          pricePerKg: Number(pricePerKg) || undefined,
          days,
        },
      });
      setData(r.data.success ? r.data : null);
    } catch (e) {
      setData({ decisionError: e.response?.data?.error || t('holdDecision.defaultError') });
    } finally { setLoading(false); setRefreshing(false); }
  }, [commodity, quantityKg, pricePerKg, days, userData]);

  const d = data?.decision;
  const best = d?.best;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.scroll}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} tintColor="#16A34A"
        onRefresh={() => { setRefreshing(true); ask(); }} />}
    >
      <View style={s.card}>
        <Text style={s.why}>{t('holdDecision.why')}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.label}>{t('holdDecision.cropLabel')}</Text>
        <TextInput style={s.input} value={commodity} onChangeText={setCommodity}
          placeholder={t('holdDecision.cropPlaceholder')} placeholderTextColor="#9CA3AF" />
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>{t('holdDecision.quantityLabel')}</Text>
            <TextInput style={s.input} value={quantityKg} onChangeText={setQuantityKg}
              placeholder={t('holdDecision.quantityPlaceholder')} placeholderTextColor="#9CA3AF" keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>{t('holdDecision.rateLabel')}</Text>
            <TextInput style={s.input} value={pricePerKg} onChangeText={setPricePerKg}
              placeholder={t('holdDecision.ratePlaceholder')} placeholderTextColor="#9CA3AF" keyboardType="numeric" />
          </View>
        </View>

        <Text style={s.label}>{t('holdDecision.holdForLabel')}</Text>
        <View style={s.chips}>
          {[3, 7, 10, 14].map((n) => (
            <TouchableOpacity key={n} style={[s.chip, days === n && s.chipOn]} onPress={() => setDays(n)}>
              <Text style={[s.chipText, days === n && s.chipTextOn]}>{n} {t('holdDecision.daysUnit')}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.hint}>{t('holdDecision.priceHint')}</Text>

        <TouchableOpacity style={[s.cta, loading && { opacity: 0.6 }]} onPress={ask} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" />
            : <><Ionicons name="calculator-outline" size={17} color="#fff" />
                <Text style={s.ctaText}>{t('holdDecision.ctaWorkItOut')}</Text></>}
        </TouchableOpacity>
      </View>

      {/* ── the honest refusal, rendered as prominently as an answer ── */}
      {!!data?.decisionError && (
        <View style={s.refuse}>
          <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
          <Text style={s.refuseText}>{data.decisionError}</Text>
        </View>
      )}

      {!!d && !d.decidable && (
        <View style={s.refuse}>
          <Ionicons name="help-circle-outline" size={18} color="#B45309" />
          <View style={{ flex: 1 }}>
            <Text style={s.refuseTitle}>{t('holdDecision.cannotPrice')}</Text>
            <Text style={s.refuseText}>{d.reason}</Text>
          </View>
        </View>
      )}

      {!!best && d.decidable && (
        <>
          <View style={[s.verdict, best.worthIt ? s.verdictGood : s.verdictBad]}>
            <Text style={s.verdictLabel}>
              {t('holdDecision.verdictGainPrefix')} {d.days} {best.worthIt ? t('holdDecision.verdictGainSuffix') : t('holdDecision.verdictCostSuffix')}
            </Text>
            <Text style={[s.verdictNum, { color: best.worthIt ? '#15803D' : '#B91C1C' }]}>
              {money(Math.abs(best.netGain))}
            </Text>
            <Text style={s.verdictSub}>
              {t('holdDecision.at')} {best.storageName.replace(' (illustrative)', '')} · {t('holdDecision.your')} ₹{d.pricePerKgToday}/kg
              {' → '}₹{d.pricePerKgForecast}/kg ({d.forecastChangePct > 0 ? '+' : ''}{d.forecastChangePct}%)
            </Text>

            {/* The spoilage assumption moves this more than anything else, so
                the range sits beside the headline, not in a footnote. */}
            {!!d.netGainRange && (
              <Text style={s.range}>
                {t('holdDecision.rangeBetween')} {money(d.netGainRange.low)} {t('holdDecision.rangeAnd')} {money(d.netGainRange.high)} {t('holdDecision.rangeSuffix')}
              </Text>
            )}
          </View>

          {/* D2's own verdict travels with the number. When the model was
              uncertain the figure must not read as a recommendation. */}
          <View style={s.card}>
            <View style={s.modelRow}>
              <Ionicons
                name={d.modelUncertain ? 'help-circle-outline' : 'analytics-outline'}
                size={17} color={d.modelUncertain ? '#B45309' : '#16A34A'} />
              <Text style={s.modelText}>
                {t('holdDecision.modelSays')} <Text style={s.bold}>{d.saleWindow.action}</Text>
                {d.saleWindow.confidence ? ` (${d.saleWindow.confidence} ${t('holdDecision.confidenceWord')})` : ''}.
              </Text>
            </View>
            {d.modelUncertain && (
              <Text style={s.uncertain}>{t('holdDecision.uncertainNote')}</Text>
            )}
            {!!d.districtModal && (
              <Text style={s.modal}>
                {t('holdDecision.districtModalPrefix')} ₹{d.districtModal.todayPerKg}/kg {t('holdDecision.districtModalSuffix')}
              </Text>
            )}
          </View>

          {/* ── where you could put it ── */}
          <Text style={s.sectionHead}>{t('holdDecision.optionsHeader')}</Text>
          {d.options.map((o, i) => (
            <View key={i} style={[s.card, o.suitable && o === best && s.bestCard]}>
              <View style={s.optTop}>
                <Ionicons name={TYPE_ICON[o.storageType] || 'business-outline'} size={18}
                  color={o.suitable ? '#15803D' : '#9CA3AF'} />
                <View style={{ flex: 1 }}>
                  <Text style={s.optName}>{(o.storageName || '').replace(' (illustrative)', '')}</Text>
                  {o.distanceKm != null && o.distanceKm > 0 && (
                    <Text style={s.optMeta}>{o.distanceKm} {t('holdDecision.kmAway')}</Text>
                  )}
                </View>
                {o.suitable ? (
                  <Text style={[s.optGain, { color: o.netGain >= 0 ? '#15803D' : '#B91C1C' }]}>
                    {money(o.netGain)}
                  </Text>
                ) : (
                  <Ionicons name="close-circle-outline" size={19} color="#B91C1C" />
                )}
              </View>

              {!o.suitable ? (
                <Text style={s.optRefuse}>{o.reason}</Text>
              ) : (
                <>
                  <View style={s.optRows}>
                    <View style={s.optRow}>
                      <Text style={s.optKey}>{t('holdDecision.cropLostLabel')}</Text>
                      <Text style={s.optVal}>{o.expectedLossPct}% ({o.weeklyLossPct}%/week)</Text>
                    </View>
                    <View style={s.optRow}>
                      <Text style={s.optKey}>{t('holdDecision.storageRentLabel')}</Text>
                      <Text style={s.optVal}>{o.storageRent === 0 ? t('holdDecision.none') : money(o.storageRent)}</Text>
                    </View>
                  </View>

                  {/* The liquidity half. A hold recommendation that ignores
                      where this week's money comes from is not advice. */}
                  {o.pledge?.available && (
                    <View style={s.pledge}>
                      <Ionicons name="cash-outline" size={15} color="#1D4ED8" />
                      <Text style={s.pledgeText}>
                        {t('holdDecision.pledgeRaisePrefix')} <Text style={s.bold}>{money(o.pledge.amount)}</Text>{' '}
                        ({o.pledge.maxPctOfValue}% {t('holdDecision.pledgeOfValue')}) {t('holdDecision.pledgeWhileWait')}{' '}
                        {t('holdDecision.pledgeInterestOver')} {d.days} {t('holdDecision.daysUnit')} ≈ {money(o.pledge.interestOverHold)}, {t('holdDecision.pledgeLeaving')}{' '}
                        {money(o.netGainIfBorrowed)}. {t('holdDecision.pledgeNoLend')}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          ))}

          <View style={s.note}>
            <Ionicons name="information-circle-outline" size={15} color="#6B7280" />
            <Text style={s.noteText}>{d.caveat}</Text>
          </View>
          {!!data.storageNotice && (
            <View style={s.note}>
              <Ionicons name="alert-circle-outline" size={15} color="#6B7280" />
              <Text style={s.noteText}>{data.storageNotice}</Text>
            </View>
          )}
        </>
      )}

      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  bold: { fontWeight: '800' },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  bestCard: { borderColor: '#16A34A', borderWidth: 1.5 },
  why: { fontSize: 13.5, color: '#6B7280', lineHeight: 20 },

  label: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827',
  },
  hint: { fontSize: 11.5, color: '#9CA3AF', marginTop: 8, lineHeight: 16 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: '#DCFCE7', borderColor: '#16A34A' },
  chipText: { fontSize: 12.5, color: '#6B7280', fontWeight: '600' },
  chipTextOn: { color: '#15803D' },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 14, marginTop: 16,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  refuse: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#FEF3C7', borderRadius: 16, padding: 15,
  },
  refuseTitle: { fontSize: 14.5, fontWeight: '800', color: '#7C2D12', marginBottom: 3 },
  refuseText: { flex: 1, fontSize: 13, color: '#7C2D12', lineHeight: 19 },

  verdict: { borderRadius: 18, padding: 18, alignItems: 'center' },
  verdictGood: { backgroundColor: '#DCFCE7' },
  verdictBad: { backgroundColor: '#FEE2E2' },
  verdictLabel: { fontSize: 9.5, fontWeight: '800', color: '#6B7280', letterSpacing: 0.6 },
  verdictNum: { fontSize: 34, fontWeight: '900', marginTop: 4 },
  verdictSub: { fontSize: 12.5, color: '#374151', marginTop: 5, textAlign: 'center', lineHeight: 18 },
  range: { fontSize: 11.5, color: '#6B7280', marginTop: 9, textAlign: 'center', lineHeight: 16 },

  modelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  modelText: { flex: 1, fontSize: 13.5, color: '#111827', lineHeight: 19 },
  uncertain: { fontSize: 12.5, color: '#B45309', marginTop: 8, lineHeight: 18, fontWeight: '600' },
  modal: { fontSize: 11.5, color: '#9CA3AF', marginTop: 9, lineHeight: 16 },

  sectionHead: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.6, marginTop: 6, marginLeft: 2 },

  optTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  optName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  optMeta: { fontSize: 11.5, color: '#9CA3AF', marginTop: 1 },
  optGain: { fontSize: 16, fontWeight: '800' },
  optRefuse: { fontSize: 12.5, color: '#B91C1C', marginTop: 9, lineHeight: 18 },
  optRows: { marginTop: 11, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  optRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  optKey: { fontSize: 12.5, color: '#6B7280' },
  optVal: { fontSize: 12.5, fontWeight: '600', color: '#111827' },

  pledge: {
    flexDirection: 'row', gap: 8, backgroundColor: '#DBEAFE',
    borderRadius: 12, padding: 11, marginTop: 11,
  },
  pledgeText: { flex: 1, fontSize: 12, color: '#1E3A8A', lineHeight: 17 },

  note: { flexDirection: 'row', gap: 8, backgroundColor: '#F1F5F9', borderRadius: 12, padding: 11 },
  noteText: { flex: 1, fontSize: 11.5, color: '#6B7280', lineHeight: 16 },
});

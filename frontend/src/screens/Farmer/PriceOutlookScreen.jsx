// What this crop is likely to fetch over the next fortnight — D1, for the farmer.
//
// ⚠️ THIS IS SURFACING, NOT A NEW MODEL. D1 has shipped for some time
// (LightGBM, 1.92M rows, 36 commodities, 15.51% MAPE against a 17.45% naive
// baseline) and was reachable only as a 7/14-day aside inside a harvest modal.
// The farmer had no screen that answered the question the model exists for.
//
// FOUR RULES THIS SCREEN MUST NOT BREAK:
//  1. Nothing past 14 days. MAPE was measured for horizons 1-14 only; a rupee
//     figure beyond that is a guess wearing a decimal point.
//  2. The model forecasts the DISTRICT MODAL, not this farmer's price. The
//     server applies the forecast's PERCENTAGE to their rate — this screen
//     never subtracts a modal from a farmer's price. That error once produced
//     a ₹1.96 lakh "gain" from a forecast predicting a 9% FALL.
//  3. A per-commodity refusal (NO_SKILL / LOW_SKILL) is rendered AS WORDS.
//     Methi(Leaves) scores 168% MAPE against a 159% naive baseline — worse
//     than guessing. Swallowing that into a blank tells the farmer nothing.
//  4. Never the model's accuracy without the naive baseline beside it.
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';

const ACTION_TONE = {
  sell: { bg: '#DCFCE7', fg: '#15803D', icon: 'trending-up' },
  hold: { bg: '#DBEAFE', fg: '#1D4ED8', icon: 'time-outline' },
  heavy: { bg: '#FEF3C7', fg: '#B45309', icon: 'alert-circle-outline' },
  unknown: { bg: '#F1F5F9', fg: '#6B7280', icon: 'help-circle-outline' },
};

export default function PriceOutlookScreen({ route }) {
  const { t } = useLanguage();
  const { district, userData } = route.params || {};

  // ⚠️ THE CROP IS CHOSEN HERE, NOT FIXED BY WHOEVER OPENED THE SCREEN.
  // The first version took `commodity` straight from route.params, and its
  // only caller passed the FIRST row of the dashboard's price ticker — so the
  // screen always opened on one arbitrary crop (Bengal Gram in the district it
  // was tested in) and a farmer could not ask about their own. A forecast for
  // a crop nobody chose is not a feature.
  const [commodity, setCommodity] = useState(route.params?.commodity || null);
  const [crops, setCrops] = useState(null);          // { served, refused } or null
  const [pickerOpen, setPickerOpen] = useState(!route.params?.commodity);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // The farmer's own rate. Optional — without it the screen shows the district
  // modal only, which is still true, rather than inventing a price for them.
  const [myPrice, setMyPrice] = useState('');
  const [applied, setApplied] = useState('');

  // The crops D1 will actually answer for, the farmer's own first. Fetched
  // once; a failure costs the picker, never the outlook itself.
  const loadCrops = useCallback(async () => {
    try {
      const res = await axios.get(`${API_ENDPOINTS.MANDI}/forecastable-crops`, { timeout: 12000 });
      if (res.data?.success) {
        setCrops(res.data);
        // Open on the farmer's own crop when they have one the model covers,
        // rather than on whatever sorts first.
        if (!commodity) {
          const own = (res.data.served || []).find((c) => c.mine);
          if (own) setCommodity(own.commodity);
        }
      }
    } catch {
      setCrops({ available: false, served: [], refused: [] });
    }
  }, [commodity]);

  useFocusEffect(useCallback(() => { loadCrops(); }, [loadCrops]));

  const load = useCallback(async () => {
    if (!commodity) { setLoading(false); return; }
    try {
      setError('');
      const res = await axios.get(`${API_ENDPOINTS.MANDI}/price-outlook`, {
        params: { commodity, district, pricePerKg: applied || undefined },
        timeout: 25000,
      });
      if (res.data?.success) setData(res.data);
      else setError(res.data?.error || t('outlook.loadFailed'));
    } catch (err) {
      setError(err.response?.data?.error || t('outlook.loadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [commodity, district, applied, t]);

  // 🐛 THIS WAS `useFocusEffect`, AND THAT WAS THE BUG.
  // useFocusEffect only re-runs on a FOCUS EVENT, never merely because its
  // dependency (`load`, which closes over `commodity`) changed identity. On
  // mount, this and `loadCrops`'s effect both fire together while `commodity`
  // is still null — so `load()` ran once, saw no commodity, set
  // `loading: false` and returned with `data` still null. `loadCrops()` then
  // resolved asynchronously and called `setCommodity(own.commodity)`, which
  // re-rendered past every guard (loading false, commodity now truthy, no
  // error) straight into `data.commodity` — a crash, because `load()` was
  // never re-invoked for the commodity that had just been chosen.
  //
  // A plain `useEffect` fixes it: it reruns whenever `load`'s own
  // dependencies (commodity/district/applied) change, which is exactly what
  // covers both "the default crop just resolved" and "the farmer tapped a
  // different chip in the picker".
  useEffect(() => { load(); }, [load]);

  // Still refresh on refocus (e.g. coming back after changing land elsewhere),
  // without re-fetching on every dependency change twice over.
  useFocusEffect(useCallback(() => { if (commodity) load(); }, [commodity]));

  // 🐛 THE FARMER HAD TO TYPE A PRICE BEFORE SEEING ANYTHING USEFUL IN THE
  // "your rate" COLUMN. There was no default, so the column stayed blank
  // until someone typed a number and tapped Apply — for a screen whose whole
  // point is "what will my crop fetch". Reported directly: "it should
  // automatically forecast price based upon today['s] price".
  //
  // ⚠️ THE DEFAULT IS TODAY'S DISTRICT MANDI MODAL, NOT AN INVENTED FIGURE —
  // it is the one real number the app has without the farmer telling it
  // anything, and it is exactly what basis.note already calls "the district
  // mandi modal price, not what any one buyer will pay you". It stays
  // EDITABLE and is captioned as an assumption, because a farmer's actual
  // selling price is very often different from the modal — that gap is the
  // whole reason the field exists at all.
  //
  // Only fires ONCE per crop (guarded on `applied === ''`), so it never
  // overwrites a rate the farmer has already typed in.
  useEffect(() => {
    if (data?.forecast?.available && applied === '' && myPrice === '') {
      const modalPerKg = Math.round((data.forecast.originModalPerQuintal / 100) * 100) / 100;
      if (Number.isFinite(modalPerKg) && modalPerKg > 0) {
        setMyPrice(String(modalPerKg));
        setApplied(String(modalPerKg));
      }
    }
  }, [data, applied, myPrice]);

  if (loading) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;

  // No crop chosen yet — offer the picker rather than an empty screen.
  if (!commodity) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={{ padding: 14 }}>
        <Text style={s.cardTitle}>{t('outlook.chooseCrop')}</Text>
        <View style={s.chipWrap}>
          {(crops?.served || []).map((c) => (
            <TouchableOpacity
              key={c.commodity}
              style={[s.cropChip, c.mine && s.cropChipMine]}
              onPress={() => { setCommodity(c.commodity); setLoading(true); }}
            >
              {c.mine && <Ionicons name="leaf" size={11} color="#15803D" />}
              <Text style={s.cropChipTxt}>{c.commodity}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {crops && crops.available === false && (
          <Text style={s.refusedRow}>{t('outlook.refuse.SERVICE_UNAVAILABLE')}</Text>
        )}
      </ScrollView>
    );
  }

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.err}>{error}</Text>
        <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
          <Text style={s.retry}>{t('outlook.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Belt and suspenders on top of the effect fix above: every guard before
  // this point can pass (loading false, commodity set, no error) in the
  // instant between a commodity change and the fetch it triggers actually
  // landing. Reading `data.commodity` on a null `data` is the crash this
  // project was just caught by — a spinner here is a false negative on a
  // race that has already happened once.
  if (!data) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;

  const fc = data?.forecast;
  const stats = data?.statistical;
  const tone = ACTION_TONE[stats?.action] || ACTION_TONE.unknown;
  const points = fc?.available ? (fc.points || []) : [];
  const maxKg = points.length ? Math.max(...points.map((p) => p.districtModalPerKg)) : 0;
  const minKg = points.length ? Math.min(...points.map((p) => p.districtModalPerKg)) : 0;
  const span = maxKg - minKg || 1;

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#16A34A']} />}
    >
      <TouchableOpacity style={s.cropHeader} onPress={() => setPickerOpen((o) => !o)}>
        <View style={{ flex: 1 }}>
          <Text style={s.h1}>{data.commodity}</Text>
          <Text style={s.h2}>{data.district} · {t('outlook.asOf')} {data.asOf}</Text>
        </View>
        <Ionicons name={pickerOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#16A34A" />
      </TouchableOpacity>
      <Text style={s.changeCrop}>{t('outlook.tapToChange')}</Text>

      {/* ⚠️ WHEN A NEARBY DISTRICT'S PRICES ARE BEING SHOWN, IT IS SAID
          UP FRONT — not buried in a footnote. A real farmer in Beed asked
          why every crop refused; the honest answer for most of them was that
          Beed's own mandis hadn't reported enough recently, and the app now
          reaches for the nearest district that HAS, by real distance, rather
          than refusing when a genuine nearby answer exists. */}
      {data?.districtSource?.matchLevel === 'nearby_district' && (
        <View style={s.nearbyBanner}>
          <Ionicons name="navigate-outline" size={14} color="#1D4ED8" />
          <Text style={s.nearbyBannerTxt}>
            {t('outlook.nearbyDistrict')
              .replace('{district}', data.district)
              .replace('{source}', data.districtSource.district)
              .replace('{km}', data.districtSource.distanceKm)}
          </Text>
        </View>
      )}

      {pickerOpen && crops && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{t('outlook.chooseCrop')}</Text>
          <View style={s.chipWrap}>
            {(crops.served || []).map((c) => (
              <TouchableOpacity
                key={c.commodity}
                style={[s.cropChip, commodity === c.commodity && s.cropChipOn]}
                onPress={() => { setCommodity(c.commodity); setPickerOpen(false); setLoading(true); }}
              >
                {/* The farmer's own crops are marked — they are the ones this
                    person actually has money riding on. */}
                {c.mine && <Ionicons name="leaf" size={11} color="#15803D" />}
                <Text style={[s.cropChipTxt, commodity === c.commodity && s.cropChipTxtOn]}>
                  {c.commodity}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ⚠️ THE REFUSED CROPS ARE NAMED, NOT HIDDEN. A farmer looking for
              Methi should be told the model cannot forecast it here, not left
              wondering why it is absent from the list. */}
          {!!crops.refused?.length && (
            <>
              <Text style={s.refusedHead}>{t('outlook.cannotForecast')}</Text>
              {crops.refused.map((r) => (
                <Text key={r.commodity} style={s.refusedRow}>
                  {r.commodity} — {t('outlook.avgErr')} {r.modelMape}% · {t('outlook.vsNaive')} {r.naiveMape}%
                </Text>
              ))}
            </>
          )}
        </View>
      )}

      {/* ── The statistical read. ALWAYS present, because the ML is additive:
             if the AI service is down the farmer still gets the arithmetic
             over real Agmarknet history. ── */}
      {stats && (
        <View style={[s.card, { backgroundColor: tone.bg, borderColor: tone.bg }]}>
          <View style={s.row}>
            <Ionicons name={tone.icon} size={18} color={tone.fg} />
            <Text style={[s.action, { color: tone.fg }]}>
              {t(`outlook.action.${stats.action || 'unknown'}`)}
            </Text>
          </View>
          {!!stats.reason && <Text style={[s.reason, { color: tone.fg }]}>{stats.reason}</Text>}
          <Text style={s.engine}>{t(`outlook.engine.${data.engine}`)}</Text>
        </View>
      )}

      {/* ── The forecast, or its refusal in words ── */}
      {fc?.available ? (
        <>
          <View style={s.card}>
            <Text style={s.cardTitle}>{t('outlook.nextDays').replace('{n}', data.horizonDays)}</Text>

            {/* ⚠️ THE BASIS, PRINTED. The model forecasts the district modal;
                the "your price" column is that modal's PERCENTAGE movement
                applied to the rate the farmer typed. Saying so here is what
                stops the two being read as the same number. */}
            <Text style={s.basis}>{data.basis?.note}</Text>

            <View style={s.myPriceRow}>
              <Text style={s.myPriceLabel}>{t('outlook.yourRate')}</Text>
              <TextInput
                style={s.input}
                keyboardType="numeric"
                value={myPrice}
                onChangeText={setMyPrice}
                placeholder="₹/kg"
                placeholderTextColor="#9CA3AF"
                onSubmitEditing={() => setApplied(myPrice)}
                returnKeyType="done"
              />
              <TouchableOpacity style={s.applyBtn} onPress={() => setApplied(myPrice)}>
                <Text style={s.applyTxt}>{t('outlook.apply')}</Text>
              </TouchableOpacity>
            </View>
            {/* This starts filled with TODAY's district mandi modal — the one
                real number the app has without being told anything — so the
                "your rate" column is never blank on first open. It is an
                ASSUMPTION, not a check on the farmer: what you actually sell
                at is very often different, which is exactly why the field
                stays editable. */}
            <Text style={s.rateHint}>{t('outlook.rateDefaultHint')}</Text>

            {points.map((p) => {
              const up = p.changePct > 0;
              const flat = Math.abs(p.changePct) < 0.5;
              const c = flat ? '#6B7280' : up ? '#16A34A' : '#DC2626';
              const w = Math.max(6, ((p.districtModalPerKg - minKg) / span) * 100);
              return (
                <View key={p.horizon} style={s.dayRow}>
                  <Text style={s.dayLbl}>
                    {p.horizon === 1 ? t('outlook.tomorrow') : `+${p.horizon}d`}
                  </Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${w}%`, backgroundColor: c }]} />
                  </View>
                  <Text style={[s.dayPct, { color: c }]}>
                    {flat ? '' : up ? '+' : ''}{p.changePct}%
                  </Text>
                  <Text style={s.dayModal}>₹{p.districtModalPerKg}</Text>
                  {/* Only rendered when the farmer gave a rate — never an
                      invented figure standing in for one. */}
                  {p.yourPricePerKg != null && (
                    <Text style={[s.dayMine, { color: c }]}>₹{p.yourPricePerKg}</Text>
                  )}
                </View>
              );
            })}

            <View style={s.legend}>
              <Text style={s.legendTxt}>{t('outlook.legendModal')}</Text>
              {applied ? <Text style={s.legendTxt}>{t('outlook.legendYours')}</Text> : null}
            </View>
          </View>

          {!!fc.peak && (
            <View style={s.card}>
              <Text style={s.cardTitle}>{t('outlook.bestDay')}</Text>
              <Text style={s.peak}>
                {fc.peak.date} · ₹{Math.round((fc.peak.modalPrice / 100) * 100) / 100}/kg
                {'  '}({fc.peak.changePct > 0 ? '+' : ''}{fc.peak.changePct}%)
              </Text>
              <Text style={s.basis}>{t('outlook.peakNote')}</Text>
            </View>
          )}

          {/* ⚠️ ACCURACY NEVER TRAVELS WITHOUT THE NAIVE BASELINE. Persistence
              is a strong forecaster for commodity prices, so the model's own
              MAPE says nothing on its own about whether it is any good. */}
          {!!fc.accuracy?.byHorizon?.length && (
            <View style={s.card}>
              <Text style={s.cardTitle}>{t('outlook.howGood')}</Text>
              {[1, 7, 14].map((h) => {
                const m = fc.accuracy.byHorizon.find((x) => x.horizon === h);
                if (!m) return null;
                return (
                  <Text key={h} style={s.metric}>
                    {h === 1 ? t('outlook.tomorrow') : `+${h}d`}: {t('outlook.avgErr')} {m.model_mape}%
                    {'  ·  '}{t('outlook.vsNaive')} {m.naive_mape}%
                  </Text>
                );
              })}
              <Text style={s.basis}>{t('outlook.accuracyNote')}</Text>
            </View>
          )}

          {!!data.clampNote && <Text style={s.clamp}>{data.clampNote}</Text>}
        </>
      ) : (
        /* ⚠️ THE REFUSAL, IN WORDS. NO_SKILL and LOW_SKILL are FINDINGS about
           this commodity, not failures — and they are different from the AI
           service being unreachable, which is a "try again". */
        <View style={[s.card, s.refuseCard]}>
          <View style={s.row}>
            <Ionicons name="information-circle-outline" size={18} color="#B45309" />
            <Text style={s.refuseTitle}>{t('outlook.noForecast')}</Text>
          </View>
          <Text style={s.refuseTxt}>
            {t(`outlook.refuse.${fc?.code || data?.code || 'UNAVAILABLE'}`)}
          </Text>
          {fc?.modelMape != null && (
            <Text style={s.refuseMetric}>
              {t('outlook.avgErr')} {fc.modelMape}%
              {fc.naiveMape != null ? `  ·  ${t('outlook.vsNaive')} ${fc.naiveMape}%` : ''}
            </Text>
          )}
          {/* ⚠️ THE REFUSAL SHOWED NO NUMBER FOR INSUFFICIENT_HISTORY, WHICH
              IS WHY IT READ AS A GENERIC "no forecast" REPEATED FOR EVERY
              CROP. `reportedDays` has always travelled on this refusal — it
              was simply never rendered. Named districts genuinely differ:
              some APMCs report a commodity almost daily, others barely at
              all, and a farmer in a thinly-reported district needs to see
              that number to tell "this app is broken" from "my own mandi
              hasn't been reporting this crop". */}
          {fc?.reportedDays != null && (
            <Text style={s.refuseMetric}>
              {t('outlook.reportedDays').replace('{n}', fc.reportedDays).replace('{min}', 35)}
            </Text>
          )}
          <Text style={s.refuseFoot}>{t('outlook.stillHaveStats')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 34, gap: 10 },
  err: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
  retry: { fontSize: 13, color: '#16A34A', fontWeight: '700' },
  h1: { fontSize: 20, fontWeight: '800', color: '#111827' },
  cropHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  changeCrop: { fontSize: 10, color: '#9CA3AF', marginBottom: 12 },
  nearbyBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: '#EFF6FF', borderRadius: 12, padding: 10, marginBottom: 12,
    borderWidth: 1, borderColor: '#DBEAFE',
  },
  nearbyBannerTxt: { flex: 1, fontSize: 11, color: '#1D4ED8', lineHeight: 15 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 6 },
  cropChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
  },
  cropChipMine: { borderColor: '#16A34A', backgroundColor: '#F6FFF9' },
  cropChipOn: { backgroundColor: '#DCFCE7', borderColor: '#16A34A' },
  cropChipTxt: { fontSize: 11, color: '#374151', fontWeight: '600' },
  cropChipTxtOn: { color: '#15803D' },
  refusedHead: { fontSize: 11, fontWeight: '700', color: '#92400E', marginTop: 14 },
  refusedRow: { fontSize: 10, color: '#9CA3AF', marginTop: 3, lineHeight: 14 },
  h2: { fontSize: 12, color: '#6B7280', marginTop: 2, marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  refuseCard: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  action: { fontSize: 15, fontWeight: '800' },
  reason: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  engine: { fontSize: 10, color: '#6B7280', marginTop: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 6 },
  basis: { fontSize: 10, color: '#9CA3AF', lineHeight: 14, marginTop: 8 },
  myPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 10 },
  myPriceLabel: { fontSize: 12, color: '#374151', fontWeight: '600' },
  rateHint: { fontSize: 10, color: '#9CA3AF', marginTop: -6, marginBottom: 10, lineHeight: 14 },
  input: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: '#111827' },
  applyBtn: { backgroundColor: '#16A34A', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 9 },
  applyTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4 },
  dayLbl: { fontSize: 11, color: '#6B7280', width: 46 },
  barTrack: { flex: 1, height: 7, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 7, borderRadius: 4 },
  dayPct: { fontSize: 11, fontWeight: '700', width: 50, textAlign: 'right' },
  dayModal: { fontSize: 11, color: '#6B7280', width: 46, textAlign: 'right' },
  dayMine: { fontSize: 11, fontWeight: '700', width: 46, textAlign: 'right' },
  legend: { marginTop: 10, gap: 2 },
  legendTxt: { fontSize: 10, color: '#9CA3AF' },
  peak: { fontSize: 15, fontWeight: '700', color: '#15803D' },
  metric: { fontSize: 12, color: '#374151', marginTop: 3 },
  clamp: { fontSize: 11, color: '#9CA3AF', paddingHorizontal: 4, lineHeight: 15 },
  refuseTitle: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  refuseTxt: { fontSize: 12, color: '#92400E', marginTop: 8, lineHeight: 17 },
  refuseMetric: { fontSize: 11, color: '#B45309', marginTop: 6, fontWeight: '600' },
  refuseFoot: { fontSize: 11, color: '#6B7280', marginTop: 10, lineHeight: 15 },
});

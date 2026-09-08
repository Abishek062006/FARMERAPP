// Bring members' produce IN to the group's own godown.
//
// ⚠️ THIS SCREEN EXISTS BECAUSE THE ROUTES WOULD OTHERWISE HAVE NO CALLER.
// `PUT /api/fpos/:id/premises` and `POST /api/fpos/:id/collection-runs` are
// the Phase 3a backend, and a working endpoint nothing calls is the single
// most repeated defect in this project's history — a GSTIN badge that could
// never be earned, the buyer's whole order history behind an overflowing
// header, the FPO approve/reject routes whose only caller lived in the wrong
// stack. Backend without a screen is not a feature.
//
// ⚠️ AND IT IS NOT A BUYER FLOW. Nothing here is sold. A collection run moves
// a member's produce to the group's premises BEFORE anybody has bought it —
// no vendor, no order, no price. Custody moves; ownership does not.
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as Location from 'expo-location';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';

// One vehicle serves at most this many FARMS. Mirrors MAX_BUNDLE on the
// server, which is the authority — this is only so the screen can stop a
// selection before it becomes a 400 the user has to decode.
const MAX_FARMS = 5;

const VEHICLES = [
  { id: 'auto', label: 'Auto' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'truck', label: 'Truck' },
];

export default function FpoCollectionScreen({ route, navigation }) {
  const { t } = useLanguage();
  const { fpoId, userData } = route.params || {};

  // ⚠️ Every hook above the first early return.
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState({});          // listingId -> true
  const [vehicle, setVehicle] = useState('tempo');
  const [mode, setMode] = useState('hired');
  const [statedCost, setStatedCost] = useState('');
  // ⚠️ REQUIRED BY THE SERVER for an own/contracted run, and the screen did
  // not collect them — "a trip sheet with no driver on it is not a record".
  // Without these the run is refused with DRIVER_REQUIRED / VEHICLE_REQUIRED.
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingPremises, setSavingPremises] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await axios.get(`${API_ENDPOINTS.FPOS}/${fpoId}/dashboard`, { timeout: 20000 });
      if (res.data?.success) setDash(res.data.dashboard);
      else setError(res.data?.error || t('fpoCollect.loadFailed'));
    } catch (err) {
      setError(err.response?.data?.error || t('fpoCollect.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [fpoId, t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Every member lot the group could collect, flattened out of the SAME
  // grade-separated lots the buyer's catalog and the dashboard use. Not
  // rebuilt here — a second shape is a second place for grades to blend.
  const lots = useMemo(() => {
    const out = [];
    for (const lot of dash?.producesAggregation?.availableLots || []) {
      for (const c of lot.byContributor || []) {
        out.push({
          listingId: String(c.listingId),
          farmerUid: c.farmerUid,
          farmerName: c.farmerName,
          cropName: lot.cropName,
          gradeLabel: lot.grade?.code ? `Grade ${lot.grade.code}` : t('fpoCollect.gradeNotDeclared'),
          graded: !!lot.grade?.code,
          kg: c.quantityAvailableKg ?? c.quantityKg,
          pricePerKg: c.pricePerKg,
        });
      }
    }
    return out;
  }, [dash, t]);

  const chosen = useMemo(() => lots.filter((l) => picked[l.listingId]), [lots, picked]);
  // ⚠️ THE CAP COUNTS DISTINCT FARMERS, NOT LOTS. A member holding Grade A and
  // Grade B of one crop is TWO lots and ONE gate the vehicle stops at once.
  // Counting lots would burn a stop the run never makes.
  const farms = useMemo(() => new Set(chosen.map((l) => l.farmerUid)).size, [chosen]);
  const totalKg = useMemo(() => chosen.reduce((a, l) => a + (l.kg || 0), 0), [chosen]);

  const premisesSet = !!dash?.premises?.declared;

  const useMyLocation = async () => {
    try {
      setSavingPremises(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('fpoCollect.premisesTitle'), t('fpoCollect.needLocation'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const res = await axios.put(`${API_ENDPOINTS.FPOS}/${fpoId}/premises`, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        label: dash?.fpoName || '',
      }, { timeout: 20000 });
      if (res.data?.success) { await load(); }
      else Alert.alert(t('fpoCollect.premisesTitle'), res.data?.error || t('fpoCollect.premisesFailed'));
    } catch (err) {
      Alert.alert(t('fpoCollect.premisesTitle'), err.response?.data?.error || t('fpoCollect.premisesFailed'));
    } finally {
      setSavingPremises(false);
    }
  };

  const arrange = async () => {
    if (!chosen.length) return;
    try {
      setBusy(true);
      const body = {
        listingIds: chosen.map((l) => l.listingId),
        vehicleType: vehicle,
        transportMode: mode,
      };
      // A stated cost only means anything on an own/contracted run. On a hired
      // run the captain fare table prices it and a client-supplied figure must
      // never reach the server.
      // Only meaningful on an own/contracted run. On a hired run the captain
      // fare table prices it and a client-supplied figure must never reach the
      // server — the same rule that keeps costSource derived from the mode.
      if (mode !== 'hired') {
        body.statedCost = Number(statedCost);
        body.driverName = driverName.trim();
        body.driverPhone = driverPhone.trim();
        body.vehicleNumber = vehicleNumber.trim();
      }

      const res = await axios.post(`${API_ENDPOINTS.FPOS}/${fpoId}/collection-runs`, body, { timeout: 30000 });
      if (res.data?.success) {
        const c = res.data.collection;
        Alert.alert(
          t('fpoCollect.arrangedTitle'),
          `${c.farms} ${t('fpoCollect.farms')} · ${Number(c.totalKg).toLocaleString('en-IN')} kg`
          + (c.saving != null ? `\n${t('fpoCollect.saving')} ₹${Math.round(c.saving)}` : '')
          + (c.note ? `\n\n${c.note}` : ''),
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert(t('fpoCollect.arrangeFailed'), res.data?.error || '');
      }
    } catch (err) {
      // The server names its refusals (NO_PREMISES, TOO_MANY_FARMS,
      // LOT_UNPOSITIONED …). Show the sentence it sent rather than a generic
      // failure the officer cannot act on.
      Alert.alert(t('fpoCollect.arrangeFailed'), err.response?.data?.error || t('fpoCollect.tryAgain'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;
  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.err}>{error}</Text>
        <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
          <Text style={s.retry}>{t('fpoCollect.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 130 }}>
        {/* ── The collection point ──────────────────────────────────────
            ⚠️ REFUSED, NOT GUESSED. The server will not create a run until
            the group states where its godown is, because the alternative was
            a district centroid — which would route a real vehicle and bill
            real members a by-weight fare to a point nobody's shed stands on. */}
        <View style={[s.card, !premisesSet && s.cardWarn]}>
          <Text style={s.cardTitle}>{t('fpoCollect.premisesTitle')}</Text>
          {premisesSet ? (
            <>
              <Text style={s.premisesLine}>
                {dash.premises.label || dash.fpoName}
                {dash.premises.district ? ` · ${dash.premises.district}` : ''}
              </Text>
              {!!dash.premises.landmark && (
                <Text style={s.premisesLandmark}>{dash.premises.landmark}</Text>
              )}
              <TouchableOpacity onPress={useMyLocation} disabled={savingPremises}>
                <Text style={s.link}>{t('fpoCollect.updatePremises')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.warnTxt}>{t('fpoCollect.premisesMissing')}</Text>
              <TouchableOpacity style={s.primarySm} onPress={useMyLocation} disabled={savingPremises}>
                {savingPremises
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.primarySmTxt}>{t('fpoCollect.setFromLocation')}</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Which lots come in ───────────────────────────────────────── */}
        <Text style={s.sectionTitle}>{t('fpoCollect.chooseLots')}</Text>
        <Text style={s.sectionSub}>{t('fpoCollect.chooseSub').replace('{n}', MAX_FARMS)}</Text>

        {lots.length === 0 ? (
          <Text style={s.empty}>{t('fpoCollect.noLots')}</Text>
        ) : lots.map((l) => {
          const on = !!picked[l.listingId];
          // Selecting a lot from a 6th farm cannot work; block it here with a
          // reason instead of letting the server 400.
          const wouldExceed = !on && !chosen.some((c) => c.farmerUid === l.farmerUid) && farms >= MAX_FARMS;
          return (
            <TouchableOpacity
              key={l.listingId}
              style={[s.lot, on && s.lotOn, wouldExceed && s.lotDisabled]}
              disabled={wouldExceed}
              onPress={() => setPicked((p) => ({ ...p, [l.listingId]: !p[l.listingId] }))}
            >
              <Ionicons
                name={on ? 'checkbox' : 'square-outline'}
                size={19} color={on ? '#16A34A' : wouldExceed ? '#D1D5DB' : '#9CA3AF'}
              />
              <View style={{ flex: 1 }}>
                <Text style={[s.lotCrop, wouldExceed && s.dim]}>{l.cropName}</Text>
                <Text style={[s.lotMeta, wouldExceed && s.dim]}>
                  {l.farmerName} · {Number(l.kg).toLocaleString('en-IN')} kg · ₹{l.pricePerKg}/kg
                </Text>
                {/* Ungraded is its own state, never a fourth tier and never blank. */}
                <Text style={l.graded ? s.gradeYes : s.gradeNo}>{l.gradeLabel}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* ── The vehicle ──────────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>{t('fpoCollect.transport')}</Text>
        <View style={s.chipRow}>
          {VEHICLES.map((v) => (
            <TouchableOpacity key={v.id} style={[s.chip, vehicle === v.id && s.chipOn]} onPress={() => setVehicle(v.id)}>
              <Text style={[s.chipTxt, vehicle === v.id && s.chipTxtOn]}>{v.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.chipRow}>
          {['hired', 'own', 'contracted'].map((mo) => (
            <TouchableOpacity key={mo} style={[s.chip, mode === mo && s.chipOn]} onPress={() => setMode(mo)}>
              <Text style={[s.chipTxt, mode === mo && s.chipTxtOn]}>{t(`fpoCollect.mode.${mo}`)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ⚠️ An own/contracted run's cost is STATED, not computed. The captain
            fare table prices an independent captain's economics — a base, a
            per-km rate, a return charge because they drive home empty — and
            none of that describes the group's own tempo. */}
        {mode !== 'hired' && (
          <View style={s.card}>
            <Text style={s.costLabel}>{t('fpoCollect.statedCost')}</Text>
            <TextInput
              style={s.input}
              keyboardType="numeric"
              value={statedCost}
              onChangeText={setStatedCost}
              placeholder="₹"
              placeholderTextColor="#9CA3AF"
            />
            <Text style={s.costNote}>{t('fpoCollect.statedCostNote')}</Text>

            {/* The trip sheet. A run the group drives itself has no captain
                record behind it, so who drove and in what is the only thing
                that makes it an auditable record at all. */}
            <Text style={[s.costLabel, { marginTop: 14 }]}>{t('fpoCollect.driverName')}</Text>
            <TextInput
              style={s.input} value={driverName} onChangeText={setDriverName}
              placeholder={t('fpoCollect.driverNamePh')} placeholderTextColor="#9CA3AF"
            />
            <Text style={[s.costLabel, { marginTop: 10 }]}>{t('fpoCollect.driverPhone')}</Text>
            <TextInput
              style={s.input} value={driverPhone} onChangeText={setDriverPhone}
              keyboardType="phone-pad"
              placeholder={t('fpoCollect.optional')} placeholderTextColor="#9CA3AF"
            />
            <Text style={[s.costLabel, { marginTop: 10 }]}>{t('fpoCollect.vehicleNumber')}</Text>
            <TextInput
              style={s.input} value={vehicleNumber} onChangeText={setVehicleNumber}
              autoCapitalize="characters"
              placeholder="MH 15 AB 1234" placeholderTextColor="#9CA3AF"
            />
          </View>
        )}
      </ScrollView>

      <View style={s.footer}>
        <View style={{ flex: 1 }}>
          <Text style={s.footerMain}>
            {chosen.length} {t('fpoCollect.lotsWord')} · {farms}/{MAX_FARMS} {t('fpoCollect.farms')}
          </Text>
          <Text style={s.footerSub}>{Number(totalKg).toLocaleString('en-IN')} kg</Text>
        </View>
        <TouchableOpacity
          style={[s.primary, (!chosen.length || !premisesSet || busy) && s.primaryOff]}
          disabled={!chosen.length || !premisesSet || busy
            || (mode !== 'hired' && (!driverName.trim() || !vehicleNumber.trim() || statedCost === ''))}
          onPress={arrange}
        >
          {busy ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.primaryTxt}>{t('fpoCollect.arrange')}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 34, gap: 10 },
  err: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
  retry: { fontSize: 13, color: '#16A34A', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 12 },
  cardWarn: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 6 },
  premisesLine: { fontSize: 13, color: '#111827' },
  premisesLandmark: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  warnTxt: { fontSize: 12, color: '#92400E', lineHeight: 17, marginBottom: 10 },
  link: { fontSize: 12, color: '#16A34A', fontWeight: '700', marginTop: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 6, marginBottom: 2 },
  sectionSub: { fontSize: 11, color: '#6B7280', marginBottom: 10, lineHeight: 15 },
  empty: { fontSize: 12, color: '#9CA3AF', paddingVertical: 16 },
  lot: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, padding: 13, marginBottom: 8,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  lotOn: { borderColor: '#16A34A', backgroundColor: '#F6FFF9' },
  lotDisabled: { opacity: 0.55 },
  dim: { color: '#9CA3AF' },
  lotCrop: { fontSize: 14, fontWeight: '700', color: '#111827' },
  lotMeta: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  gradeYes: { fontSize: 10, color: '#15803D', fontWeight: '700', marginTop: 3 },
  gradeNo: { fontSize: 10, color: '#9CA3AF', fontStyle: 'italic', marginTop: 3 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F1F5F9' },
  chipOn: { backgroundColor: '#DCFCE7', borderColor: '#16A34A' },
  chipTxt: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  chipTxtOn: { color: '#15803D' },
  costLabel: { fontSize: 12, color: '#374151', fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#111827' },
  costNote: { fontSize: 10, color: '#9CA3AF', marginTop: 6, lineHeight: 14 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', padding: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  footerMain: { fontSize: 13, fontWeight: '700', color: '#111827' },
  footerSub: { fontSize: 11, color: '#6B7280' },
  primary: { backgroundColor: '#16A34A', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  primaryOff: { backgroundColor: '#D1D5DB' },
  primaryTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  primarySm: { backgroundColor: '#16A34A', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, alignSelf: 'flex-start' },
  primarySmTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
});

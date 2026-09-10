// ═══════════════════════════════════════════════════════════════════════════
// F1 — A MEMBER BRINGS PRODUCE TO THE GODOWN.
//
// Replaces FpoCollectionScreen as the way produce actually arrives (F0
// retired the vehicle-based collection run — see CLAUDE.md). No vehicle, no
// route, no fare: the member walks in, the group's own person weighs and
// (optionally) grades it at the counter, and this screen records that.
//
// ⚠️ IT DOES NOT CREATE A LISTING. It picks from a member's EXISTING listing
// (the same "post harvest" flow every farmer already uses) — the same "one
// posting pipeline, never a second form" rule this app follows everywhere.
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';

const WEIGHT_METHODS = ['collection_centre_scale', 'public_weighbridge', 'farm_scale', 'estimated'];
const CONDITION_FLAGS = ['wrong_crop', 'visibly_spoiled', 'sprouting', 'wet', 'damaged', 'packaging_damaged'];
const GRADES = ['A', 'B', 'C'];

export default function FpoIntakeScreen({ route, navigation }) {
  const { t } = useLanguage();
  const { fpoId } = route.params || {};

  // ⚠️ Every hook above the first early return.
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(null);        // one listing object, or null
  const [qty, setQty] = useState('');
  const [weightMethod, setWeightMethod] = useState('');
  const [weightRef, setWeightRef] = useState('');
  const [gradeObserved, setGradeObserved] = useState(null);
  const [condChecked, setCondChecked] = useState(false);
  const [condFlags, setCondFlags] = useState([]);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await axios.get(`${API_ENDPOINTS.FPOS}/${fpoId}/dashboard`, { timeout: 20000 });
      if (res.data?.success) setDash(res.data.dashboard);
      else setError(res.data?.error || t('fpoIntake.loadFailed'));
    } catch (err) {
      setError(err.response?.data?.error || t('fpoIntake.loadFailed'));
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [fpoId, t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Same derivation FpoCollectionScreen used — flattened out of the SAME
  // grade-separated lots the buyer's catalog and the dashboard use. Not
  // rebuilt here; a second shape is a second place for grades to blend.
  const lots = useMemo(() => {
    const out = [];
    for (const lot of dash?.producesAggregation?.availableLots || []) {
      for (const c of lot.byContributor || []) {
        out.push({
          listingId: String(c.listingId),
          farmerName: c.farmerName,
          cropName: lot.cropName,
          gradeCode: lot.grade?.code || null,
          gradeLabel: lot.grade?.code ? `${t('fpoIntake.grade')} ${lot.grade.code}` : t('fpoIntake.gradeNotDeclared'),
          kg: c.quantityAvailableKg ?? c.quantityKg,
        });
      }
    }
    return out;
  }, [dash, t]);

  const resetForm = () => {
    setPicked(null); setQty(''); setWeightMethod(''); setWeightRef('');
    setGradeObserved(null); setCondChecked(false); setCondFlags([]); setReceipt(null);
  };

  const toggleFlag = (f) => {
    setCondFlags((cur) => cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]);
    setCondChecked(true);
  };

  const submit = async () => {
    if (!picked) return;
    const kg = Number(qty);
    if (!kg || kg <= 0) return Alert.alert(t('fpoIntake.badQtyTitle'), t('fpoIntake.badQtyMsg'));
    if (kg > picked.kg) return Alert.alert(t('fpoIntake.tooMuchTitle'), t('fpoIntake.tooMuchMsg').replace('{n}', picked.kg));
    if (!weightMethod) return Alert.alert(t('fpoIntake.noWeightTitle'), t('fpoIntake.noWeightMsg'));

    setBusy(true);
    try {
      const res = await axios.post(`${API_ENDPOINTS.FPOS}/${fpoId}/intake`, {
        listingId: picked.listingId, quantityKg: kg,
        weightMethod, weightRef,
        gradeObserved: gradeObserved || undefined,
        conditionChecked: condChecked,
        conditionFlags: condFlags,
      });
      if (res.data?.success) setReceipt(res.data.receipt);
      else Alert.alert(t('fpoIntake.failedTitle'), res.data?.error || t('fpoIntake.failedGeneric'));
    } catch (err) {
      Alert.alert(t('fpoIntake.failedTitle'), err.response?.data?.error || t('fpoIntake.failedGeneric'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;
  }

  if (!dash?.premises?.declared) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        <View style={[s.card, s.cardWarn]}>
          <Text style={s.cardTitle}>{t('fpoIntake.noPremisesTitle')}</Text>
          <Text style={s.warnTxt}>{t('fpoIntake.noPremisesMsg')}</Text>
          <TouchableOpacity style={s.link} onPress={() => navigation.navigate('FpoTerms', { fpoId })}>
            <Text style={s.link}>{t('fpoIntake.setPremises')} →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ── the receipt, after a successful intake ──────────────────────────────
  if (receipt) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={{ padding: 16 }}>
        <View style={s.receiptHead}>
          <Ionicons name="checkmark-circle" size={40} color="#16A34A" />
          <Text style={s.receiptTitle}>{t('fpoIntake.recorded')}</Text>
        </View>
        <View style={s.card}>
          <Text style={s.rLine}><Text style={s.rKey}>{t('fpoIntake.farmer')}: </Text>{receipt.farmerName}</Text>
          <Text style={s.rLine}><Text style={s.rKey}>{t('fpoIntake.crop')}: </Text>{receipt.cropName}</Text>
          <Text style={s.rLine}><Text style={s.rKey}>{t('fpoIntake.qtyArrived')}: </Text>{receipt.kg} kg</Text>
          <Text style={s.rLine}><Text style={s.rKey}>{t('fpoIntake.weight')}: </Text>{receipt.weight?.label}</Text>
          {!!receipt.grade?.observed && (
            <Text style={s.rLine}>
              <Text style={s.rKey}>{t('fpoIntake.grade')}: </Text>
              {receipt.grade.declaredLabel || t('fpoIntake.gradeNotDeclared')} → {receipt.grade.observedLabel}
              {receipt.grade.downgraded ? '  ⚠️' : ''}
            </Text>
          )}
          {receipt.condition?.anyIssue && (
            <Text style={[s.rLine, { color: '#B45309' }]}>
              <Text style={s.rKey}>{t('fpoIntake.condition')}: </Text>{receipt.condition.summary}
            </Text>
          )}
        </View>
        <TouchableOpacity style={s.primary} onPress={resetForm}>
          <Text style={s.primaryTxt}>{t('fpoIntake.recordAnother')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <Text style={s.sectionTitle}>{t('fpoIntake.pickListing')}</Text>
      <Text style={s.sectionSub}>{t('fpoIntake.pickSub')}</Text>

      {lots.length === 0 && <Text style={s.empty}>{t('fpoIntake.noLots')}</Text>}
      {lots.map((l) => {
        const on = picked?.listingId === l.listingId;
        return (
          <TouchableOpacity
            key={l.listingId}
            style={[s.lot, on && s.lotOn]}
            onPress={() => { setPicked(l); setQty(String(l.kg)); }}
            activeOpacity={0.8}
          >
            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? '#16A34A' : '#9CA3AF'} />
            <View style={{ flex: 1 }}>
              <Text style={s.lotCrop}>{l.cropName} · {l.farmerName}</Text>
              <Text style={s.lotMeta}>{l.kg} kg {t('fpoIntake.available')}</Text>
              <Text style={l.gradeCode ? s.gradeYes : s.gradeNo}>{l.gradeLabel}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {picked && (
        <>
          <Text style={[s.sectionTitle, { marginTop: 18 }]}>{t('fpoIntake.howMuchArrived')}</Text>
          <TextInput
            style={s.input} value={qty} onChangeText={setQty} keyboardType="numeric"
            placeholder={t('fpoIntake.kgPlaceholder')}
          />
          <Text style={s.sectionSub}>{t('fpoIntake.arrivedSub').replace('{n}', picked.kg)}</Text>

          <Text style={s.sectionTitle}>{t('fpoIntake.howWeighed')}</Text>
          <View style={s.chipRow}>
            {WEIGHT_METHODS.map((m) => (
              <TouchableOpacity
                key={m} style={[s.chip, weightMethod === m && s.chipOn]}
                onPress={() => setWeightMethod(m)}
              >
                <Text style={[s.chipTxt, weightMethod === m && s.chipTxtOn]}>{t(`fpoIntake.weightMethod.${m}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {weightMethod === 'public_weighbridge' && (
            <TextInput
              style={s.input} value={weightRef} onChangeText={setWeightRef}
              placeholder={t('fpoIntake.ticketRefPlaceholder')}
            />
          )}

          <Text style={s.sectionTitle}>{t('fpoIntake.gradeAtIntake')}</Text>
          <Text style={s.sectionSub}>{t('fpoIntake.gradeSub')}</Text>
          <View style={s.chipRow}>
            <TouchableOpacity
              style={[s.chip, gradeObserved === null && s.chipOn]}
              onPress={() => setGradeObserved(null)}
            >
              <Text style={[s.chipTxt, gradeObserved === null && s.chipTxtOn]}>{t('fpoIntake.gradeSkip')}</Text>
            </TouchableOpacity>
            {GRADES.map((g) => (
              <TouchableOpacity
                key={g} style={[s.chip, gradeObserved === g && s.chipOn]}
                onPress={() => setGradeObserved(g)}
              >
                <Text style={[s.chipTxt, gradeObserved === g && s.chipTxtOn]}>{t('fpoIntake.grade')} {g}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.sectionTitle}>{t('fpoIntake.condition')}</Text>
          <Text style={s.sectionSub}>{t('fpoIntake.conditionSub')}</Text>
          <View style={s.chipRow}>
            {CONDITION_FLAGS.map((f) => (
              <TouchableOpacity
                key={f} style={[s.chip, condFlags.includes(f) && s.chipOn]}
                onPress={() => toggleFlag(f)}
              >
                <Text style={[s.chipTxt, condFlags.includes(f) && s.chipTxtOn]}>{t(`fpoIntake.condFlag.${f}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[s.primary, busy && s.primaryOff, { marginTop: 20 }]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryTxt}>{t('fpoIntake.record')}</Text>}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 12 },
  cardWarn: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 6 },
  warnTxt: { fontSize: 12, color: '#92400E', lineHeight: 17, marginBottom: 10 },
  link: { fontSize: 12, color: '#16A34A', fontWeight: '700', marginTop: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 14, marginBottom: 2 },
  sectionSub: { fontSize: 11, color: '#6B7280', marginBottom: 10, lineHeight: 15 },
  empty: { fontSize: 12, color: '#9CA3AF', paddingVertical: 16 },
  lot: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, padding: 13, marginBottom: 8,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  lotOn: { borderColor: '#16A34A', backgroundColor: '#F6FFF9' },
  lotCrop: { fontSize: 14, fontWeight: '700', color: '#111827' },
  lotMeta: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  gradeYes: { fontSize: 10, color: '#15803D', fontWeight: '700', marginTop: 3 },
  gradeNo: { fontSize: 10, color: '#9CA3AF', fontStyle: 'italic', marginTop: 3 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F1F5F9' },
  chipOn: { backgroundColor: '#DCFCE7', borderColor: '#16A34A' },
  chipTxt: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  chipTxtOn: { color: '#15803D' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#111827', marginBottom: 6 },
  primary: { backgroundColor: '#16A34A', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryOff: { backgroundColor: '#D1D5DB' },
  primaryTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  receiptHead: { alignItems: 'center', gap: 8, marginBottom: 16, marginTop: 10 },
  receiptTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  rLine: { fontSize: 13.5, color: '#111827', lineHeight: 22 },
  rKey: { color: '#6B7280', fontWeight: '600' },
});

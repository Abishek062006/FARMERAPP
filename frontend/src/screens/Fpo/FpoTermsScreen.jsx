import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT TERMS — Phase 3, D2.
// ═══════════════════════════════════════════════════════════════════════════
//
// GET/PUT /api/fpos/:id/payment, PUT/DELETE /api/fpos/:id/procurement-rates.
// Both endpoints already existed (Phase F2 Phase B) with no screen calling
// them — this is the missing frontend, not new backend behaviour.
//
// ⚠️ FREIGHT TERM IS SHOWN, NOT EDITED. `Fpo.freightTerm` only ever accepts
// 'buyer_pays' today — the server refuses anything else by name
// (FREIGHT_TERM_NOT_WIRED) because the actual charge on a lot sale does not
// yet respect any other value. A selector here that let an admin "choose"
// fpo_pays and then watch the buyer get billed anyway would be the same
// dead-control defect this app has already shipped twice (a GSTIN badge
// nobody could earn; an Orders icon pushed off screen).
//
// ⚠️ SWITCHING TO PROCUREMENT ALWAYS SENDS facilitationFee: {mode:'none'}
// IN THE SAME REQUEST. The server refuses procurement with a non-none fee
// (FEE_INCOHERENT_UNDER_PROCUREMENT) because a facilitation fee is a number
// nothing would ever read once the group is buying at an agreed rate —
// clearing it here avoids a needless round trip through that refusal for
// the common case, while an existing SHARES agreement still surfaces its own
// refusal from the server rather than being silently worked around.

export default function FpoTermsScreen({ route }) {
  const { t } = useLanguage();
  const { fpoId } = route?.params || {};

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const [fpoName, setFpoName] = useState('');
  const [paymentMode, setPaymentMode] = useState('facilitation');
  const [feeMode, setFeeMode] = useState('none');
  const [feePercent, setFeePercent] = useState('');
  const [feePerKg, setFeePerKg] = useState('');
  const [freightTerm, setFreightTerm] = useState('buyer_pays');
  const [grades, setGrades] = useState(['A', 'B', 'C']);
  const [rates, setRates] = useState([]);
  const [note, setNote] = useState('');

  const [newCrop, setNewCrop] = useState('');
  const [newGrade, setNewGrade] = useState('A');
  const [newRate, setNewRate] = useState('');

  const fetchIt = useCallback(async () => {
    try {
      const r = await axios.get(`${API_ENDPOINTS.FPOS}/${fpoId}/payment`);
      const p = r.data?.payment || {};
      setFpoName(p.fpoName || '');
      setPaymentMode(p.paymentMode || 'facilitation');
      setFeeMode(p.facilitationFee?.mode || 'none');
      setFeePercent(p.facilitationFee?.percent ? String(p.facilitationFee.percent) : '');
      setFeePerKg(p.facilitationFee?.perKg ? String(p.facilitationFee.perKg) : '');
      setFreightTerm(p.freightTerm || 'buyer_pays');
      setGrades(p.grades || ['A', 'B', 'C']);
      setRates((p.procurementRates || []).map((x) => ({
        cropName: x.cropName, grade: x.grade, ratePerKg: String(x.ratePerKg),
      })));
      setNote(p.note || '');
      setErr('');
    } catch (e) {
      setErr(e.response?.data?.error || t('fpoTerms.errTitle'));
    } finally {
      setLoading(false);
    }
  }, [fpoId, t]);

  useEffect(() => { fetchIt(); }, [fetchIt]);

  const saveMode = useCallback(async (nextMode) => {
    if (nextMode === paymentMode) return;
    setSaving(true);
    try {
      const body = { paymentMode: nextMode };
      // See the header note: procurement can never coexist with a live fee.
      if (nextMode === 'procurement') body.facilitationFee = { mode: 'none' };
      const r = await axios.put(`${API_ENDPOINTS.FPOS}/${fpoId}/payment`, body);
      const p = r.data?.payment || {};
      setPaymentMode(p.paymentMode || nextMode);
      setFeeMode(p.facilitationFee?.mode || 'none');
      setFeePercent(p.facilitationFee?.percent ? String(p.facilitationFee.percent) : '');
      setFeePerKg(p.facilitationFee?.perKg ? String(p.facilitationFee.perKg) : '');
      setNote(r.data?.note || '');
    } catch (e) {
      Alert.alert(t('fpoTerms.errTitle'), e.response?.data?.error || '');
    } finally {
      setSaving(false);
    }
  }, [fpoId, paymentMode, t]);

  const saveFee = useCallback(async () => {
    setSaving(true);
    try {
      const body = {
        facilitationFee: {
          mode: feeMode,
          percent: feeMode === 'percent' ? Number(feePercent) || 0 : 0,
          perKg: feeMode === 'per_kg' ? Number(feePerKg) || 0 : 0,
        },
      };
      const r = await axios.put(`${API_ENDPOINTS.FPOS}/${fpoId}/payment`, body);
      setNote(r.data?.note || '');
      Alert.alert(t('fpoTerms.savedTitle'), '');
    } catch (e) {
      Alert.alert(t('fpoTerms.errTitle'), e.response?.data?.error || '');
    } finally {
      setSaving(false);
    }
  }, [fpoId, feeMode, feePercent, feePerKg, t]);

  const addRateRow = useCallback(() => {
    const cropName = newCrop.trim();
    const ratePerKg = Number(newRate);
    if (!cropName) {
      Alert.alert(t('fpoTerms.errTitle'), t('fpoTerms.needCrop'));
      return;
    }
    if (!Number.isFinite(ratePerKg) || ratePerKg <= 0) {
      Alert.alert(t('fpoTerms.errTitle'), t('fpoTerms.needRate'));
      return;
    }
    const key = `${cropName.toLowerCase()}|${newGrade}`;
    if (rates.some((x) => `${x.cropName.toLowerCase()}|${x.grade}` === key)) {
      Alert.alert(t('fpoTerms.errTitle'), t('fpoTerms.dupRate'));
      return;
    }
    setRates((cur) => [...cur, { cropName, grade: newGrade, ratePerKg: String(ratePerKg) }]);
    setNewCrop('');
    setNewRate('');
  }, [newCrop, newGrade, newRate, rates, t]);

  const removeRateRow = useCallback((idx) => {
    setRates((cur) => cur.filter((_, i) => i !== idx));
  }, []);

  const saveRates = useCallback(async () => {
    if (rates.length === 0) {
      Alert.alert(t('fpoTerms.errTitle'), t('fpoTerms.noRatesToSave'));
      return;
    }
    setSaving(true);
    try {
      const body = {
        rates: rates.map((r) => ({
          cropName: r.cropName, grade: r.grade, ratePerKg: Number(r.ratePerKg),
        })),
      };
      const r = await axios.put(`${API_ENDPOINTS.FPOS}/${fpoId}/procurement-rates`, body);
      setRates((r.data?.procurementRates || []).map((x) => ({
        cropName: x.cropName, grade: x.grade, ratePerKg: String(x.ratePerKg),
      })));
      Alert.alert(t('fpoTerms.savedTitle'), r.data?.note || '');
    } catch (e) {
      Alert.alert(t('fpoTerms.errTitle'), e.response?.data?.error || '');
    } finally {
      setSaving(false);
    }
  }, [fpoId, rates, t]);

  const clearRates = useCallback(() => {
    Alert.alert(t('fpoTerms.clearRatesTitle'), t('fpoTerms.clearRatesBody'), [
      { text: t('fpo.cancel'), style: 'cancel' },
      {
        text: t('fpoTerms.clearRates'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await axios.delete(`${API_ENDPOINTS.FPOS}/${fpoId}/procurement-rates`);
            setRates([]);
          } catch (e) {
            Alert.alert(t('fpoTerms.errTitle'), e.response?.data?.error || '');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }, [fpoId, t]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.card}>
        <Text style={s.title}>{t('fpoTerms.title')}</Text>
        <Text style={s.body}>{fpoName}</Text>
        {!!err && <Text style={s.err}>{err}</Text>}
      </View>

      {/* ── PAYMENT MODE ─────────────────────────────────────────────── */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>{t('fpoTerms.modeTitle')}</Text>
        <View style={s.modeRow}>
          <TouchableOpacity
            style={[s.modeBtn, paymentMode === 'facilitation' && s.modeBtnOn]}
            onPress={() => saveMode('facilitation')}
            disabled={saving}
          >
            <Text style={[s.modeBtnText, paymentMode === 'facilitation' && s.modeBtnTextOn]}>
              {t('fpoTerms.facilitation')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modeBtn, paymentMode === 'procurement' && s.modeBtnOn]}
            onPress={() => saveMode('procurement')}
            disabled={saving}
          >
            <Text style={[s.modeBtnText, paymentMode === 'procurement' && s.modeBtnTextOn]}>
              {t('fpoTerms.procurement')}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={s.hint}>
          {paymentMode === 'procurement' ? t('fpoTerms.procurementHint') : t('fpoTerms.facilitationHint')}
        </Text>
        {!!note && <Text style={s.serverNote}>{note}</Text>}
      </View>

      {/* ── FACILITATION FEE ─────────────────────────────────────────── */}
      {paymentMode === 'facilitation' && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>{t('fpoTerms.feeTitle')}</Text>
          <View style={s.modeRow}>
            {['none', 'percent', 'per_kg'].map((m) => (
              <TouchableOpacity
                key={m}
                style={[s.feeChip, feeMode === m && s.feeChipOn]}
                onPress={() => setFeeMode(m)}
              >
                <Text style={[s.feeChipText, feeMode === m && s.feeChipTextOn]}>
                  {m === 'none' ? t('fpoTerms.feeNone') : m === 'percent' ? t('fpoTerms.feePercent') : t('fpoTerms.feePerKg')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {feeMode === 'percent' && (
            <View style={s.inputRow}>
              <Text style={s.inputLabel}>{t('fpoTerms.percentLabel')}</Text>
              <TextInput
                style={s.input}
                value={feePercent}
                onChangeText={setFeePercent}
                keyboardType="decimal-pad"
                placeholder="0"
              />
            </View>
          )}
          {feeMode === 'per_kg' && (
            <View style={s.inputRow}>
              <Text style={s.inputLabel}>{t('fpoTerms.perKgLabel')}</Text>
              <TextInput
                style={s.input}
                value={feePerKg}
                onChangeText={setFeePerKg}
                keyboardType="decimal-pad"
                placeholder="0"
              />
            </View>
          )}
          <TouchableOpacity style={[s.saveBtn, saving && s.btnDisabled]} onPress={saveFee} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>{t('fpoTerms.saveFee')}</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* ── PROCUREMENT RATE TABLE ───────────────────────────────────── */}
      {paymentMode === 'procurement' && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>{t('fpoTerms.ratesTitle')}</Text>
          <Text style={s.hint}>{t('fpoTerms.ratesHint')}</Text>

          {rates.length === 0 ? (
            <Text style={s.emptyLine}>{t('fpoTerms.noRates')}</Text>
          ) : (
            rates.map((r, i) => (
              <View key={`${r.cropName}-${r.grade}-${i}`} style={s.rateRow}>
                <Text style={s.rateCrop}>{r.cropName}</Text>
                <View style={s.gradePill}><Text style={s.gradePillText}>{r.grade}</Text></View>
                <Text style={s.rateVal}>₹{r.ratePerKg}/kg</Text>
                <TouchableOpacity onPress={() => removeRateRow(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color="#B91C1C" />
                </TouchableOpacity>
              </View>
            ))
          )}

          <View style={s.addRow}>
            <TextInput
              style={s.addCropInput}
              value={newCrop}
              onChangeText={setNewCrop}
              placeholder={t('fpoTerms.cropPlaceholder')}
              placeholderTextColor="#9CA3AF"
            />
            <View style={s.gradePicker}>
              {grades.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[s.gradeOpt, newGrade === g && s.gradeOptOn]}
                  onPress={() => setNewGrade(g)}
                >
                  <Text style={[s.gradeOptText, newGrade === g && s.gradeOptTextOn]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={s.addRateInput}
              value={newRate}
              onChangeText={setNewRate}
              keyboardType="decimal-pad"
              placeholder="₹/kg"
              placeholderTextColor="#9CA3AF"
            />
            <TouchableOpacity style={s.addBtn} onPress={addRateRow}>
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={s.footerRow}>
            {rates.length > 0 && (
              <TouchableOpacity style={s.clearBtn} onPress={clearRates} disabled={saving}>
                <Text style={s.clearBtnText}>{t('fpoTerms.clearRates')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.saveBtn, s.flex1, saving && s.btnDisabled]} onPress={saveRates} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>{t('fpoTerms.saveRates')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── DELIVERY FREIGHT TERM — informational, not editable ───────── */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>{t('fpoTerms.freightTitle')}</Text>
        <View style={s.freightCard}>
          <Ionicons name="information-circle-outline" size={15} color="#1D4ED8" />
          <Text style={s.freightText}>
            {freightTerm === 'buyer_pays' ? t('fpoTerms.freightBuyerPays') : freightTerm}
          </Text>
        </View>
        <Text style={s.hint}>{t('fpoTerms.freightHint')}</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 4 },
  body: { fontSize: 13, color: '#6B7280' },
  err: { fontSize: 12, color: '#B91C1C', marginTop: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 },
  hint: { fontSize: 12, color: '#9CA3AF', lineHeight: 17, marginTop: 8 },
  serverNote: { fontSize: 12, color: '#15803D', lineHeight: 17, marginTop: 8 },
  emptyLine: { fontSize: 13, color: '#9CA3AF', marginBottom: 10 },

  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC',
  },
  modeBtnOn: { borderColor: '#16A34A', backgroundColor: '#DCFCE7' },
  modeBtnText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  modeBtnTextOn: { color: '#15803D' },

  feeChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC',
  },
  feeChipOn: { borderColor: '#16A34A', backgroundColor: '#DCFCE7' },
  feeChipText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  feeChipTextOn: { color: '#15803D' },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  inputLabel: { fontSize: 13, color: '#374151', flex: 1 },
  input: {
    width: 100, borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#111827',
    backgroundColor: '#F8FAFC', textAlign: 'right',
  },

  saveBtn: {
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center', marginTop: 12,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnDisabled: { opacity: 0.6 },
  flex1: { flex: 1 },

  rateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F8FAFC',
  },
  rateCrop: { flex: 1, fontSize: 13, color: '#111827', fontWeight: '600' },
  gradePill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#EFF6FF',
  },
  gradePillText: { fontSize: 11, fontWeight: '700', color: '#1D4ED8' },
  rateVal: { fontSize: 13, color: '#15803D', fontWeight: '700' },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  addCropInput: {
    flex: 1, borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#111827',
    backgroundColor: '#F8FAFC',
  },
  gradePicker: { flexDirection: 'row', gap: 4 },
  gradeOpt: {
    width: 28, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC',
  },
  gradeOptOn: { borderColor: '#16A34A', backgroundColor: '#DCFCE7' },
  gradeOptText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  gradeOptTextOn: { color: '#15803D' },
  addRateInput: {
    width: 70, borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 8, fontSize: 13, color: '#111827',
    backgroundColor: '#F8FAFC', textAlign: 'right',
  },
  addBtn: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: '#16A34A',
    alignItems: 'center', justifyContent: 'center',
  },

  footerRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  clearBtn: {
    paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', marginTop: 12,
  },
  clearBtnText: { color: '#B91C1C', fontWeight: '700', fontSize: 13 },

  freightCard: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#EFF6FF', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#DBEAFE',
  },
  freightText: { flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 18, fontWeight: '600' },
});

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';

// ═══════════════════════════════════════════════════════════════════════════
// WHAT THIS GROUP DEALS IN — the admin's declaration.
// ═══════════════════════════════════════════════════════════════════════════
//
// GET/PUT/DELETE /api/fpos/:id/focus-crops. The choosable list comes FROM the
// server (`choices`), never a copy kept here: the canonical 64 crops live in
// backend/data/agroZones.js, and `FpoRegistryScreen`'s hand-maintained copy of
// the district and crop lists is already a standing sync hazard in this repo.
// One less copy.
//
// ⚠️ EVERY STATE ON THIS SCREEN KEEPS "NOT DECLARED" APART FROM "DEALS IN
// NOTHING". An empty list is a field nobody filled in. The screen says that in
// words rather than showing an empty row that reads as a finding.
//
// And it says, on the screen, that this is advisory — because an admin who
// believes this filters their applicants will use it as a gate, and it is not
// one. The server never blocks a join on it (routes/fpos.js POST /:id/join
// computes the match AFTER recording the request, deliberately).

export default function FpoFocusCropsScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { fpoId } = route?.params || {};

  // All hooks sit above the first early return (the `loading` guard below).
  const [choices, setChoices] = useState([]);
  const [selected, setSelected] = useState([]);
  const [maxCrops, setMaxCrops] = useState(12);
  const [declared, setDeclared] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const fetchIt = useCallback(async () => {
    try {
      const r = await axios.get(`${API_ENDPOINTS.FPOS}/${fpoId}/focus-crops`);
      setChoices(r.data?.choices || []);
      setSelected(r.data?.focusCrops || []);
      setMaxCrops(r.data?.maxCrops || 12);
      setDeclared(!!r.data?.declared);
      setErr('');
    } catch (e) {
      setErr(e.response?.data?.error || t('fpoFocus.errTitle'));
    } finally {
      setLoading(false);
    }
  }, [fpoId, t]);

  useEffect(() => { fetchIt(); }, [fetchIt]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return choices;
    return choices.filter((c) => c.toLowerCase().includes(q));
  }, [choices, query]);

  const toggle = useCallback((crop) => {
    setSelected((cur) => {
      if (cur.includes(crop)) return cur.filter((c) => c !== crop);
      // The cap is refused here as well as on the server, so the admin is told
      // at the tap rather than at the save. The server still refuses — this is
      // a courtesy, not the enforcement.
      if (cur.length >= maxCrops) {
        Alert.alert(
          t('fpoFocus.errTitle'),
          t('fpoFocus.maxNote').replace('{n}', String(maxCrops)),
        );
        return cur;
      }
      return [...cur, crop];
    });
  }, [maxCrops, t]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const r = await axios.put(`${API_ENDPOINTS.FPOS}/${fpoId}/focus-crops`, { crops: selected });
      setDeclared(!!r.data?.declared);
      Alert.alert(t('fpoFocus.savedTitle'), r.data?.note || '');
      navigation?.goBack?.();
    } catch (e) {
      Alert.alert(t('fpoFocus.errTitle'), e.response?.data?.error || '');
    } finally {
      setSaving(false);
    }
  }, [fpoId, selected, navigation, t]);

  const clear = useCallback(() => {
    Alert.alert(t('fpoFocus.clearTitle'), t('fpoFocus.clearBody'), [
      { text: t('fpo.cancel'), style: 'cancel' },
      {
        text: t('fpoFocus.clear'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await axios.delete(`${API_ENDPOINTS.FPOS}/${fpoId}/focus-crops`);
            setSelected([]);
            setDeclared(false);
            navigation?.goBack?.();
          } catch (e) {
            Alert.alert(t('fpoFocus.errTitle'), e.response?.data?.error || '');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }, [fpoId, navigation, t]);

  // ── FIRST EARLY RETURN. Every hook above it. ──────────────────────────
  if (loading) {
    return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;
  }

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.card}>
          <Text style={s.title}>{t('fpoFocus.title')}</Text>
          <Text style={s.body}>{t('fpoFocus.intro')}</Text>
          {/* "Not declared" said in words, so an empty list never reads as a
              finding about the group. */}
          {!declared && selected.length === 0 && (
            <Text style={s.notDeclared}>{t('fpoFocus.notDeclared')}</Text>
          )}
          <Text style={s.count}>
            {selected.length} {t('fpoFocus.selectedCount')} · {t('fpoFocus.maxNote').replace('{n}', String(maxCrops))}
          </Text>
          {!!err && <Text style={s.err}>{err}</Text>}
        </View>

        <View style={s.advisoryCard}>
          <Ionicons name="information-circle-outline" size={15} color="#1D4ED8" />
          <Text style={s.advisoryText}>{t('fpoFocus.advisory')}</Text>
        </View>

        <View style={s.card}>
          <View style={s.searchRow}>
            <Ionicons name="search" size={16} color="#9CA3AF" />
            <TextInput
              style={s.search}
              value={query}
              onChangeText={setQuery}
              placeholder={t('fpoFocus.searchPlaceholder')}
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {filtered.length === 0 ? (
            <Text style={s.emptyLine}>{t('fpoFocus.noSearchResults')}</Text>
          ) : (
            <View style={s.chipWrap}>
              {filtered.map((crop) => {
                const on = selected.includes(crop);
                return (
                  <TouchableOpacity
                    key={crop}
                    style={[s.chip, on && s.chipOn]}
                    onPress={() => toggle(crop)}
                  >
                    {on && <Ionicons name="checkmark" size={13} color="#15803D" />}
                    <Text style={[s.chipText, on && s.chipTextOn]}>{crop}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={s.footer}>
        {declared && (
          <TouchableOpacity style={s.clearBtn} onPress={clear} disabled={saving}>
            <Text style={s.clearBtnText}>{t('fpoFocus.clear')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[s.saveBtn, saving && s.btnDisabled]} onPress={save} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.saveBtnText}>{t('fpoFocus.save')}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 6 },
  body: { fontSize: 13, color: '#6B7280', lineHeight: 19 },
  notDeclared: {
    fontSize: 12, color: '#92400E', lineHeight: 18, marginTop: 10,
    backgroundColor: '#FFFBEB', borderRadius: 12, padding: 10,
  },
  count: { fontSize: 12, color: '#9CA3AF', marginTop: 10 },
  err: { fontSize: 12, color: '#B91C1C', marginTop: 8 },

  advisoryCard: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#EFF6FF', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#DBEAFE', marginBottom: 12,
  },
  advisoryText: { flex: 1, fontSize: 12, color: '#1E40AF', lineHeight: 17 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 12,
  },
  search: { flex: 1, paddingVertical: 10, fontSize: 14, color: '#111827' },
  emptyLine: { fontSize: 13, color: '#9CA3AF' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC',
  },
  chipOn: { borderColor: '#16A34A', backgroundColor: '#DCFCE7' },
  chipText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  chipTextOn: { color: '#15803D' },

  footer: {
    flexDirection: 'row', gap: 10, padding: 16,
    borderTopWidth: 1, borderTopColor: '#F1F5F9', backgroundColor: '#fff',
  },
  saveBtn: {
    flex: 1, backgroundColor: '#16A34A', borderRadius: 14,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
  clearBtn: {
    paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2',
  },
  clearBtnText: { color: '#B91C1C', fontWeight: '700', fontSize: 13 },
});

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';

// ═══════════════════════════════════════════════════════════════════════════
// WHO IS IN THE GROUP, AND WHO IS ASKING TO BE.
// ═══════════════════════════════════════════════════════════════════════════
//
// The `fpo`-role account had no way to approve a member at all: the routes
// existed, but the only screen that called them was `Farmer/FpoScreen` ("My
// Group"), which is a FARMER's screen and is not in the FPO stack. A feature
// whose route file exists while nothing in the app calls it is one this project
// has shipped before and written down as a defect class (CLAUDE.md: "Check
// endpoints have CALLERS").
//
// ── THE CROP MATCH, AND WHAT IT IS NOT ────────────────────────────────────
//
// Each pending row carries `cropMatch` from the server. This screen is where an
// admin actually decides, so it is where the information belongs — without it
// they are approving a name.
//
// ⚠️ NOTHING ON THIS SCREEN SORTS, FILTERS, RANKS, COLLAPSES OR HIDES ANYBODY
// BY THEIR MATCH. The list is the list and the match is a chip on it. Burying a
// mismatch below the others would be the screen quietly enforcing a rule the
// group only ever stated as a preference — and it would do it invisibly, which
// is worse than doing it openly. The advisory line is printed under the list so
// an admin cannot read the chips as a verdict the app reached.
//
// The two ABSENCES get their own neutral chip and are never styled as a
// problem: a farmer with no crops registered yet is unknown, not wrong, and a
// group that has not declared its crops has not found a bad applicant — it has
// an empty field.

const MATCH_STYLE = {
  match:               { key: 'fpoMembers.matchMatch',          fg: '#15803D', bg: '#DCFCE7', icon: 'checkmark-circle' },
  partial:             { key: 'fpoMembers.matchPartial',        fg: '#B45309', bg: '#FEF3C7', icon: 'contrast-outline' },
  mismatch:            { key: 'fpoMembers.matchMismatch',       fg: '#B91C1C', bg: '#FEE2E2', icon: 'alert-circle-outline' },
  // Deliberately slate, not amber and not red. Unknown is not a finding.
  farmer_crops_unknown:{ key: 'fpoMembers.matchUnknownFarmer',  fg: '#6B7280', bg: '#F1F5F9', icon: 'help-circle-outline' },
  no_focus_declared:   { key: 'fpoMembers.matchNoFocus',        fg: '#6B7280', bg: '#F1F5F9', icon: 'information-circle-outline' },
};

export default function FpoMembersScreen({ route }) {
  const { t } = useLanguage();
  const { fpoId } = route?.params || {};

  // All hooks above the first early return.
  const [pending, setPending] = useState([]);
  const [members, setMembers] = useState([]);
  const [focusCrops, setFocusCrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUid, setBusyUid] = useState(null);
  const [err, setErr] = useState('');

  const fetchIt = useCallback(async () => {
    try {
      // Two reads: the pending list (which carries the crop match) and the
      // group itself (for the approved members). `admin/mine` resolves on
      // adminUid so it serves the legacy farmer-admin and the `fpo` account
      // identically — see routes/fpos.js.
      const [p, mine] = await Promise.all([
        axios.get(`${API_ENDPOINTS.FPOS}/${fpoId}/members/pending`),
        axios.get(`${API_ENDPOINTS.FPOS}/admin/mine`),
      ]);
      setPending(p.data?.pending || []);
      setFocusCrops(p.data?.focusCrops || []);
      setMembers((mine.data?.fpo?.members || []).filter((m) => (m.status || 'active') === 'active'));
      setErr('');
    } catch (e) {
      setErr(e.response?.data?.error || t('fpoMembers.errTitle'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fpoId, t]);

  useEffect(() => { fetchIt(); }, [fetchIt]);

  const act = useCallback(async (uid, what) => {
    setBusyUid(uid);
    try {
      await axios.post(`${API_ENDPOINTS.FPOS}/${fpoId}/members/${uid}/${what}`);
      await fetchIt();
    } catch (e) {
      Alert.alert(t('fpoMembers.errTitle'), e.response?.data?.error || '');
    } finally {
      setBusyUid(null);
    }
  }, [fpoId, fetchIt, t]);

  // ── FIRST EARLY RETURN. Every hook above it. ──────────────────────────
  if (loading) {
    return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;
  }

  const dateOf = (d) => { try { return d ? new Date(d).toLocaleDateString() : '—'; } catch { return '—'; } };

  const MatchChip = ({ m }) => {
    const st = MATCH_STYLE[m?.status] || MATCH_STYLE.no_focus_declared;
    return (
      <View style={[s.matchChip, { backgroundColor: st.bg }]}>
        <Ionicons name={st.icon} size={12} color={st.fg} />
        <Text style={[s.matchChipText, { color: st.fg }]}>{t(st.key)}</Text>
      </View>
    );
  };

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor="#16A34A"
        onRefresh={() => { setRefreshing(true); fetchIt(); }} />}
    >
      {!!err && <Text style={s.err}>{err}</Text>}

      {/* ── Waiting to join ── */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>
          {t('fpoMembers.pendingTitle')}{pending.length ? ` · ${pending.length}` : ''}
        </Text>

        {pending.length === 0 ? (
          <Text style={s.emptyLine}>{t('fpoMembers.noPending')}</Text>
        ) : pending.map((m) => {
          const cm = m.cropMatch || {};
          return (
            <View key={m.farmerUid} style={s.row}>
              <View style={s.rowTop}>
                <Text style={s.name}>{m.farmerName || m.farmerUid}</Text>
                <MatchChip m={cm} />
              </View>
              <Text style={s.meta}>{t('fpoMembers.joinedOn')} {dateOf(m.joinedAt)}</Text>

              {/* The crops themselves, matched first then not. Both are shown
                  — an admin deciding needs to see what the person actually
                  grows, not just a verdict chip. */}
              {!!(cm.matched?.length) && (
                <Text style={s.cropLine}>
                  <Text style={s.cropLabel}>{t('fpoMembers.grows')}: </Text>
                  {cm.matched.join(', ')}
                </Text>
              )}
              {!!(cm.unmatched?.length) && (
                <Text style={s.cropLine}>
                  <Text style={s.cropLabel}>{t('fpoMembers.alsoGrows')}: </Text>
                  {cm.unmatched.join(', ')}
                </Text>
              )}

              <View style={s.btnRow}>
                <TouchableOpacity
                  style={[s.approveBtn, busyUid === m.farmerUid && s.btnDisabled]}
                  disabled={busyUid === m.farmerUid}
                  onPress={() => act(m.farmerUid, 'approve')}
                >
                  {busyUid === m.farmerUid
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Ionicons name="checkmark" size={14} color="#fff" />
                        <Text style={s.approveText}>{t('fpoMembers.approve')}</Text></>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.rejectBtn, busyUid === m.farmerUid && s.btnDisabled]}
                  disabled={busyUid === m.farmerUid}
                  onPress={() => act(m.farmerUid, 'reject')}
                >
                  <Text style={s.rejectText}>{t('fpoMembers.reject')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {/* Printed whenever a match could have been read as a verdict. */}
        {pending.length > 0 && (
          <Text style={s.advisory}>{t('fpoMembers.advisory')}</Text>
        )}
      </View>

      {/* ── Approved members ── */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>
          {t('fpoMembers.activeTitle')}{members.length ? ` · ${members.length}` : ''}
        </Text>
        {members.length === 0 ? (
          <Text style={s.emptyLine}>{t('fpoMembers.noActive')}</Text>
        ) : members.map((m) => (
          <View key={m.farmerUid} style={s.memberRow}>
            <Ionicons name="person-circle-outline" size={20} color="#9CA3AF" />
            <Text style={s.memberName}>{m.farmerName || m.farmerUid}</Text>
            <Text style={s.memberDate}>{dateOf(m.joinedAt)}</Text>
          </View>
        ))}
      </View>

      {/* What the group deals in, for context while deciding. */}
      <View style={s.focusCard}>
        <Text style={s.focusTitle}>{t('fpoDashboard.focusTitle')}</Text>
        {focusCrops.length === 0 ? (
          <Text style={s.emptyLine}>{t('fpoDashboard.focusNotDeclared')}</Text>
        ) : (
          <View style={s.chipWrap}>
            {focusCrops.map((c) => (
              <View key={c} style={s.focusChip}><Text style={s.focusChipText}>{c}</Text></View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 10 },
  emptyLine: { fontSize: 13, color: '#9CA3AF', lineHeight: 19 },
  err: { fontSize: 12, color: '#B91C1C', marginBottom: 10 },

  row: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' },
  meta: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  cropLine: { fontSize: 12, color: '#6B7280', marginTop: 6, lineHeight: 17 },
  cropLabel: { fontWeight: '700', color: '#111827' },

  matchChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  matchChipText: { fontSize: 10, fontWeight: '700' },

  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 10,
  },
  approveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  rejectBtn: {
    paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC',
  },
  rejectText: { color: '#6B7280', fontWeight: '700', fontSize: 13 },
  btnDisabled: { opacity: 0.6 },
  advisory: {
    fontSize: 11, color: '#6B7280', lineHeight: 16, marginTop: 12,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },

  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  memberName: { flex: 1, fontSize: 13, color: '#111827', fontWeight: '600' },
  memberDate: { fontSize: 11, color: '#9CA3AF' },

  focusCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  focusTitle: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  focusChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: '#DCFCE7',
  },
  focusChipText: { fontSize: 11, color: '#15803D', fontWeight: '600' },
});

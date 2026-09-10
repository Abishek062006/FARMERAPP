import React, {
  useState, useCallback, useEffect, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, FlatList, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';
import MemberCard from '../../components/fpo/MemberCard';

// ═══════════════════════════════════════════════════════════════════════════
// WHO IS IN THE GROUP, AND WHO IS ASKING TO BE. ONE SCREEN, TWO TABS.
// ═══════════════════════════════════════════════════════════════════════════
//
// F3 — this used to be TWO screens: this one (a "Pending" queue plus a bare
// name+date "Active" list) and a separate `FpoAllMembersScreen` (the real
// searchable, trust-scored member grid), reached by two different buttons on
// `FpoDashboardScreen` that both answered "who is in this group". An admin
// managing members had two doors into the same room, one of them showing
// almost nothing. Merged here as tabs — no functionality lost, one door.
//
// The `fpo`-role account had no way to approve a member at all before this
// screen existed: the routes existed, but the only screen that called them
// was `Farmer/FpoScreen` ("My Group"), which is a FARMER's screen and is not
// in the FPO stack. A feature whose route file exists while nothing in the
// app calls it is a defect class this project has shipped before (CLAUDE.md:
// "Check endpoints have CALLERS").
//
// ── THE CROP MATCH, AND WHAT IT IS NOT (Pending tab) ──────────────────────
//
// Each pending row carries `cropMatch` from the server. This screen is where
// an admin actually decides, so it is where the information belongs —
// without it they are approving a name.
//
// ⚠️ NOTHING ON THE PENDING TAB SORTS, FILTERS, RANKS, COLLAPSES OR HIDES
// ANYBODY BY THEIR MATCH. The list is the list and the match is a chip on
// it. Burying a mismatch below the others would be the screen quietly
// enforcing a rule the group only ever stated as a preference — invisibly,
// which is worse than doing it openly. The advisory line is printed under
// the list so an admin cannot read the chips as a verdict the app reached.
//
// The two ABSENCES get their own neutral chip and are never styled as a
// problem: a farmer with no crops registered yet is unknown, not wrong, and
// a group that has not declared its crops has not found a bad applicant —
// it has an empty field.
//
// ── THE MEMBERS TAB'S DATA SOURCE ──────────────────────────────────────────
//
// `FpoDashboardScreen` already holds `memberCards` (from GET /:id/dashboard)
// with each member's trust band and season performance, so when this screen
// is opened FROM the dashboard it is handed that array via `route.params.
// members` rather than re-fetching it — two independent fetches are two
// places for a trust band or an unpaid figure to read differently between
// the dashboard and this screen. `FpoHomeScreen`'s own "Members" shortcut
// has no such array to hand over, so in that case (and only that case) this
// screen fetches the same GET /:id/dashboard itself — same endpoint, same
// computation, not a second definition of anybody's trust.

const MATCH_STYLE = {
  match:               { key: 'fpoMembers.matchMatch',          fg: '#15803D', bg: '#DCFCE7', icon: 'checkmark-circle' },
  partial:             { key: 'fpoMembers.matchPartial',        fg: '#B45309', bg: '#FEF3C7', icon: 'contrast-outline' },
  mismatch:            { key: 'fpoMembers.matchMismatch',       fg: '#B91C1C', bg: '#FEE2E2', icon: 'alert-circle-outline' },
  // Deliberately slate, not amber and not red. Unknown is not a finding.
  farmer_crops_unknown:{ key: 'fpoMembers.matchUnknownFarmer',  fg: '#6B7280', bg: '#F1F5F9', icon: 'help-circle-outline' },
  no_focus_declared:   { key: 'fpoMembers.matchNoFocus',        fg: '#6B7280', bg: '#F1F5F9', icon: 'information-circle-outline' },
};

export default function FpoMembersScreen({ navigation, route }) {
  const { t } = useLanguage();
  const {
    fpoId, userData, members: membersFromParams, initialTab,
  } = route?.params || {};

  // All hooks above the first early return.
  const [tab, setTab] = useState(initialTab === 'members' ? 'members' : 'pending');
  const [pending, setPending] = useState([]);
  const [activeThin, setActiveThin] = useState([]); // legacy thin list, kept for the pending-tab count only
  const [ownMemberCards, setOwnMemberCards] = useState(null); // self-fetched fallback when no `members` param
  const [focusCrops, setFocusCrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUid, setBusyUid] = useState(null);
  const [query, setQuery] = useState('');
  const [err, setErr] = useState('');

  const needsOwnMembers = !membersFromParams;

  const fetchIt = useCallback(async () => {
    try {
      const calls = [
        axios.get(`${API_ENDPOINTS.FPOS}/${fpoId}/members/pending`),
        axios.get(`${API_ENDPOINTS.FPOS}/admin/mine`),
      ];
      if (needsOwnMembers) calls.push(axios.get(`${API_ENDPOINTS.FPOS}/${fpoId}/dashboard`));

      const [p, mine, dash] = await Promise.all(calls);
      setPending(p.data?.pending || []);
      setFocusCrops(p.data?.focusCrops || []);
      setActiveThin((mine.data?.fpo?.members || []).filter((m) => (m.status || 'active') === 'active'));
      if (needsOwnMembers) setOwnMemberCards(dash?.data?.memberCards || []);
      setErr('');
    } catch (e) {
      setErr(e.response?.data?.error || t('fpoMembers.errTitle'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fpoId, needsOwnMembers, t]);

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

  const memberList = membersFromParams || ownMemberCards || [];

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return memberList;
    return memberList.filter((m) => (
      (m.farmerName || '').toLowerCase().includes(q)
      || (m.village || '').toLowerCase().includes(q)
      || (m.cropsSuppliedThisSeason || []).some((c) => c.toLowerCase().includes(q))
    ));
  }, [memberList, query]);

  const openMember = (m) => navigation?.navigate('FpoMemberDetail', {
    fpoId, farmerUid: m.farmerUid, farmerName: m.farmerName, village: m.village, trust: m.trust, userData,
  });

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

  const memberCountLabel = (membersFromParams || ownMemberCards) ? memberList.length : activeThin.length;

  return (
    <View style={s.screen}>
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'pending' && s.tabBtnActive]}
          onPress={() => setTab('pending')}
        >
          <Text style={[s.tabBtnText, tab === 'pending' && s.tabBtnTextActive]}>
            {t('fpoMembers.tabPending')}{pending.length ? ` · ${pending.length}` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'members' && s.tabBtnActive]}
          onPress={() => setTab('members')}
        >
          <Text style={[s.tabBtnText, tab === 'members' && s.tabBtnTextActive]}>
            {t('fpoMembers.tabMembers')}{memberCountLabel ? ` · ${memberCountLabel}` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'pending' ? (
        <ScrollView
          style={s.container}
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor="#16A34A"
            onRefresh={() => { setRefreshing(true); fetchIt(); }} />}
        >
          {!!err && <Text style={s.err}>{err}</Text>}

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

            {pending.length > 0 && (
              <Text style={s.advisory}>{t('fpoMembers.advisory')}</Text>
            )}
          </View>

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
      ) : (
        <View style={s.container}>
          <View style={s.searchBar}>
            <Ionicons name="search-outline" size={17} color="#9CA3AF" />
            <TextInput
              style={s.searchInput}
              placeholder={t('fpoAllMembers.searchPlaceholder')}
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            {query.length > 0 && (
              <Ionicons name="close-circle" size={17} color="#CBD5E1" onPress={() => setQuery('')} />
            )}
          </View>

          <FlatList
            data={filteredMembers}
            keyExtractor={(m) => m.farmerUid}
            numColumns={2}
            columnWrapperStyle={s.row2}
            contentContainerStyle={s.list}
            refreshControl={needsOwnMembers ? (
              <RefreshControl refreshing={refreshing} tintColor="#16A34A"
                onRefresh={() => { setRefreshing(true); fetchIt(); }} />
            ) : undefined}
            renderItem={({ item }) => (
              <View style={{ flex: 1 }}>
                <MemberCard
                  m={item}
                  onPress={openMember}
                  width="100%"
                  labels={{
                    noSuppliesYet: t('fpoDashboard.noSuppliesYet'),
                    kgSupplied: t('fpoDashboard.kgSupplied'),
                    earned: t('fpoDashboard.earned'),
                    unpaidSuffix: t('fpoDashboard.unpaidSuffix'),
                    trustLabel: (band) => t(`fpoDashboard.trust.${band}`),
                  }}
                />
              </View>
            )}
            ListEmptyComponent={
              <View style={s.empty}>
                <Ionicons name="people-outline" size={32} color="#CBD5E1" />
                <Text style={s.emptyText}>
                  {memberList.length === 0 ? t('fpoAllMembers.noMembers') : t('fpoAllMembers.noMatch')}
                </Text>
              </View>
            }
          />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  tabBtn: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: '#16A34A' },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  tabBtnTextActive: { color: '#15803D' },

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

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', margin: 14, marginBottom: 6, borderRadius: 14,
    paddingHorizontal: 13, paddingVertical: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  list: { padding: 14, paddingTop: 8, gap: 10 },
  row2: { gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 30 },
});

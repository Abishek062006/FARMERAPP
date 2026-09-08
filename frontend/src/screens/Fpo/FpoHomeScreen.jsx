import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';

// ═══════════════════════════════════════════════════════════════════════════
// THE FPO's OWN LANDING SCREEN — `role: 'fpo'`
// ═══════════════════════════════════════════════════════════════════════════
//
// WHAT THIS IS NOT: it is not `Farmer/FpoScreen` ("My Group"), which answers a
// FARMER's question — which group am I in, who else is in it, may I leave. An
// organisation does not join or leave itself.
//
// WHAT IT IS: the four states an FPO account can be in, said out loud.
// GET /api/fpos/admin/mine returns `adminStatus`, and it is the only field
// this screen branches on:
//
//   none            you have not claimed a company yet     → send them to the registry
//   claim_pending   a person is reviewing your claim       → say so, and say who reviews
//   claim_rejected  it was turned down                     → say the entry is free again
//   active          you administer this FPO                → the dashboard
//
// WHY THE PRE-APPROVAL STATES GET A SCREEN AT ALL. An FPO registrant signs up,
// claims their company, and then WAITS — because a claim is reviewed by a human
// running scripts/reviewFpoClaims.js, deliberately a terminal script and not an
// in-app admin panel (CLAUDE.md). Without this screen they would land on an
// empty dashboard with no explanation, which reads as a broken app rather than
// as a queue they are in.
//
// ⚠️ NOTHING HERE INVENTS A FIGURE. A group with no members shows 0 members and
// says why it is 0 — it does not hide the section, and it does not fill it with
// a placeholder. Same rule as every other empty state in this app.

export default function FpoHomeScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { userData } = route?.params || {};

  // ⚠️ EVERY HOOK IN THIS COMPONENT SITS ABOVE THE FIRST `return`, which is the
  // `loading` guard further down. That is not tidiness — `FarmerSalesScreen`
  // crashed on login with "Rendered more hooks than during the previous render"
  // from exactly this mistake, and parsing, the import sweep and a clean Metro
  // bundle all passed it. See CLAUDE.md.
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState(false);

  const fetchIt = useCallback(async () => {
    setErr(false);
    try {
      const r = await axios.get(`${API_ENDPOINTS.FPOS}/admin/mine`);
      setState(r.data || null);
    } catch (e) {
      setErr(true);
      setState(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchIt(); }, [fetchIt]);

  // Re-check on every focus, so coming back from the registry after claiming
  // shows `claim_pending` instead of the stale "find your FPO" card.
  useEffect(() => {
    const unsub = navigation?.addListener?.('focus', fetchIt);
    return unsub;
  }, [navigation, fetchIt]);

  const onRefresh = useCallback(() => { setRefreshing(true); fetchIt(); }, [fetchIt]);

  // ── FIRST EARLY RETURN. Every hook above it. ──────────────────────────
  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#16A34A" />
        <Text style={s.centerText}>{t('fpoHome.loading')}</Text>
      </View>
    );
  }

  if (err) {
    return (
      <View style={s.center}>
        <Ionicons name="cloud-offline-outline" size={40} color="#9CA3AF" />
        <Text style={s.centerTitle}>{t('fpoHome.errTitle')}</Text>
        <Text style={s.centerText}>{t('fpoHome.errBody')}</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={() => { setLoading(true); fetchIt(); }}>
          <Text style={s.primaryBtnText}>{t('fpoHome.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const adminStatus = state?.adminStatus || 'none';
  const fpo = state?.fpo || null;
  const claim = state?.claim || null;

  const dateOf = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
  };

  // ── WHAT THIS ACCOUNT IS, AND WHAT IT IS NOT ────────────────────────────
  // Shown in every state, including once the group is live. An FPO officer
  // opening this app will look for "register my land" — this is where they are
  // told, once, that the account is the company and not a farm, and that their
  // members do the farming on their own accounts.
  const NotAFarmCard = (
    <View style={s.noteCard}>
      <View style={s.noteHead}>
        <Ionicons name="business-outline" size={16} color="#1D4ED8" />
        <Text style={s.noteTitle}>{t('fpoHome.notAFarmTitle')}</Text>
      </View>
      <Text style={s.noteBody}>{t('fpoHome.notAFarmBody')}</Text>
    </View>
  );

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16A34A" />}
    >
      {adminStatus === 'none' && (
        <>
          <View style={s.card}>
            <View style={s.iconCircle}>
              <Ionicons name="search-outline" size={26} color="#15803D" />
            </View>
            <Text style={s.cardTitle}>{t('fpoHome.noneTitle')}</Text>
            <Text style={s.cardBody}>{t('fpoHome.noneBody')}</Text>
            <View style={s.reviewRow}>
              <Ionicons name="person-outline" size={14} color="#B45309" />
              <Text style={s.reviewText}>{t('fpoHome.noneReview')}</Text>
            </View>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => navigation.navigate('FpoRegistry', { userData })}
            >
              <Ionicons name="library-outline" size={16} color="#fff" />
              <Text style={s.primaryBtnText}>{t('fpoHome.findBtn')}</Text>
            </TouchableOpacity>
          </View>
          {NotAFarmCard}
        </>
      )}

      {adminStatus === 'claim_pending' && (
        <>
          <View style={s.card}>
            <View style={[s.iconCircle, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="hourglass-outline" size={26} color="#B45309" />
            </View>
            <Text style={s.cardTitle}>{t('fpoHome.pendingTitle')}</Text>
            {!!claim?.fpoName && <Text style={s.orgName}>{claim.fpoName}</Text>}
            {!!(claim?.district || claim?.block) && (
              <Text style={s.orgMeta}>
                {[claim.block, claim.district].filter(Boolean).join(' · ')}
              </Text>
            )}
            <Text style={s.cardBody}>{t('fpoHome.pendingBody')}</Text>
            <View style={s.kvRow}>
              <Text style={s.kvKey}>{t('fpoHome.designationLabel')}</Text>
              <Text style={s.kvVal}>{claim?.designation || '—'}</Text>
            </View>
            <View style={s.kvRow}>
              <Text style={s.kvKey}>{t('fpoHome.submittedOn')}</Text>
              <Text style={s.kvVal}>{dateOf(claim?.submittedAt)}</Text>
            </View>
            <TouchableOpacity style={s.ghostBtn} onPress={onRefresh}>
              <Ionicons name="refresh-outline" size={15} color="#15803D" />
              <Text style={s.ghostBtnText}>{t('fpoHome.checkAgain')}</Text>
            </TouchableOpacity>
          </View>
          {NotAFarmCard}
        </>
      )}

      {adminStatus === 'claim_rejected' && (
        <>
          <View style={s.card}>
            <View style={[s.iconCircle, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="close-circle-outline" size={26} color="#B91C1C" />
            </View>
            <Text style={s.cardTitle}>{t('fpoHome.rejectedTitle')}</Text>
            {!!claim?.fpoName && <Text style={s.orgName}>{claim.fpoName}</Text>}
            <Text style={s.cardBody}>{t('fpoHome.rejectedBody')}</Text>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => navigation.navigate('FpoRegistry', { userData })}
            >
              <Ionicons name="library-outline" size={16} color="#fff" />
              <Text style={s.primaryBtnText}>{t('fpoHome.claimAgain')}</Text>
            </TouchableOpacity>
          </View>
          {NotAFarmCard}
        </>
      )}

      {adminStatus === 'active' && !!fpo && (
        <>
          <View style={s.card}>
            <View style={[s.iconCircle, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="business" size={26} color="#15803D" />
            </View>
            <Text style={s.orgName}>{fpo.name}</Text>
            {!!(fpo.village || fpo.district) && (
              <Text style={s.orgMeta}>{[fpo.village, fpo.district].filter(Boolean).join(' · ')}</Text>
            )}
            {!!fpo.regNumber && <Text style={s.orgMeta}>{fpo.regNumber}</Text>}

            <View style={s.statRow}>
              <View style={s.stat}>
                <Text style={s.statNum}>{fpo.memberCount}</Text>
                <Text style={s.statLabel}>{t('fpoHome.membersLabel')}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statNum}>{fpo.pendingMemberCount}</Text>
                <Text style={s.statLabel}>{t('fpoHome.pendingMembersLabel')}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statNum}>{fpo.totalKgOnMarket}</Text>
                <Text style={s.statLabel}>{t('fpoHome.onMarketLabel')}</Text>
              </View>
            </View>

            {/* A real FPO's first day has zero members. Say why it is zero
                rather than showing a bare 0 that reads as a failure. */}
            {fpo.memberCount === 0 && (
              <Text style={s.emptyHint}>{t('fpoHome.noMembersYet')}</Text>
            )}

            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => navigation.navigate('FpoDashboard', { userData, fpoId: fpo._id })}
            >
              <Ionicons name="grid-outline" size={16} color="#fff" />
              <Text style={s.primaryBtnText}>{t('fpoHome.openDashboard')}</Text>
              {/* A buyer's request sits behind a real approval gate now — this
                  is the one thing on the landing screen most worth surfacing,
                  the same reasoning as the pending-members badge below. */}
              {fpo.pendingLotRequestCount > 0 && (
                <View style={s.badgeOnPrimary}>
                  <Text style={s.badgeOnPrimaryText}>{fpo.pendingLotRequestCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* The two things an officer does that are not on the dashboard:
                admit members, and say what the group deals in. Both reachable
                from the dashboard too — this is the shorter path from the
                landing screen, which is where somebody with people waiting
                actually starts. */}
            <View style={s.linkRow}>
              <TouchableOpacity
                style={s.linkBtn}
                onPress={() => navigation.navigate('FpoMembers', { userData, fpoId: fpo._id })}
              >
                <Ionicons name="people-outline" size={15} color="#15803D" />
                <Text style={s.linkBtnText}>{t('fpoMembers.title')}</Text>
                {fpo.pendingMemberCount > 0 && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{fpo.pendingMemberCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={s.linkBtn}
                onPress={() => navigation.navigate('FpoFocusCrops', { userData, fpoId: fpo._id })}
              >
                <Ionicons name="leaf-outline" size={15} color="#15803D" />
                <Text style={s.linkBtnText}>{t('fpoDashboard.setFocus')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.linkBtn}
                onPress={() => navigation.navigate('FpoTerms', { userData, fpoId: fpo._id })}
              >
                <Ionicons name="cash-outline" size={15} color="#15803D" />
                <Text style={s.linkBtnText}>{t('fpoTerms.linkLabel')}</Text>
              </TouchableOpacity>
            </View>

            {/* What the group deals in, on the landing screen. `focusDeclared`
                and not `focusCrops.length` — "not declared" and "deals in
                nothing" are different facts and the backend sends both fields
                precisely so a screen cannot merge them. */}
            <View style={s.focusRow}>
              <Text style={s.focusLabel}>{t('fpoDashboard.focusTitle')}</Text>
              {!fpo.focusDeclared ? (
                <Text style={s.focusEmpty}>{t('fpoDashboard.focusNotDeclared')}</Text>
              ) : (
                <View style={s.chipWrap}>
                  {(fpo.focusCrops || []).map((c) => (
                    <View key={c} style={s.focusChip}>
                      <Text style={s.focusChipText}>{c}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* Never dropped: a demo group attaches SYNTHETIC members to a REAL,
              SFAC-registered company. models/Fpo.js dataSource. */}
          {(state?.dataSource === 'demo_illustrative' || fpo.dataSource === 'demo_illustrative') && (
            <View style={s.demoCard}>
              <Ionicons name="information-circle-outline" size={15} color="#B45309" />
              <Text style={s.demoText}>{t('fpoHome.demoNotice')}</Text>
            </View>
          )}

          {NotAFarmCard}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 40 },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F8FAFC', padding: 28,
  },
  centerTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 10 },
  centerText: { fontSize: 13, color: '#6B7280', marginTop: 6, textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 12,
  },
  iconCircle: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 6 },
  cardBody: { fontSize: 13, color: '#6B7280', lineHeight: 19 },
  orgName: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 2 },
  orgMeta: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },

  reviewRow: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 12, padding: 10, marginTop: 12,
  },
  reviewText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },

  kvRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  kvKey: { fontSize: 12, color: '#9CA3AF' },
  kvVal: { fontSize: 12, color: '#111827', fontWeight: '600' },

  statRow: {
    flexDirection: 'row', marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800', color: '#15803D' },
  statLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 2, textAlign: 'center' },
  emptyHint: {
    fontSize: 12, color: '#6B7280', lineHeight: 18, marginTop: 12,
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10,
  },

  linkRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  linkBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: '#DCFCE7', backgroundColor: '#F0FDF4',
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8,
  },
  linkBtnText: { fontSize: 12, fontWeight: '700', color: '#15803D' },
  badge: {
    minWidth: 18, paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 999, backgroundColor: '#B45309', alignItems: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  badgeOnPrimary: {
    minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 8,
    borderRadius: 999, backgroundColor: '#fff', alignItems: 'center',
  },
  // A white badge on the green primary button needs its OWN text colour —
  // reusing `badgeText` (white-on-amber) here would be white-on-white.
  badgeOnPrimaryText: { fontSize: 10, fontWeight: '800', color: '#15803D' },

  focusRow: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  focusLabel: { fontSize: 12, fontWeight: '700', color: '#111827', marginBottom: 8 },
  focusEmpty: { fontSize: 12, color: '#9CA3AF' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  focusChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#DCFCE7',
  },
  focusChipText: { fontSize: 11, color: '#15803D', fontWeight: '600' },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 13, marginTop: 14,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 14, paddingVertical: 12, marginTop: 14,
    borderWidth: 1, borderColor: '#DCFCE7', backgroundColor: '#F0FDF4',
  },
  ghostBtnText: { color: '#15803D', fontWeight: '700', fontSize: 13 },

  noteCard: {
    backgroundColor: '#EFF6FF', borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: '#DBEAFE', marginBottom: 12,
  },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  noteTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1E3A8A' },
  noteBody: { fontSize: 12, color: '#1E40AF', lineHeight: 18 },

  demoCard: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#FDE68A', marginBottom: 12,
  },
  demoText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
});

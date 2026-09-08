import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';
import { nf, money, kgs, perKg, gradeVisual } from '../../utils/lotDisplay';
import MemberCard from '../../components/fpo/MemberCard';
import AutoScrollTicker from '../../components/AutoScrollTicker';

// F2, the admin's one screen — GET /api/fpos/:id/dashboard (backend/routes/fpos.js).
// Admin-only on the server (fpo.adminUid === req.firebaseUid), so this is
// reached only by a farmer who is the real admin of a real claimed FPO.
//
// HONESTY RULE THAT SHAPES EVERY SECTION: the ten real seeded FPOs have real
// members with real land and crops, and currently ZERO listings, orders or
// consignments. Every section below renders an honest, informative empty
// state for that — not a spinner, not a blank gap, not a confident zero that
// reads as "checked, nothing there" when it is really "nothing has happened
// here yet".
//
// Two figures are NEVER summed: `availableNow` (real inventory, from live
// listings) and `estimatedIncoming` (a forecast sized from planted-but-
// unharvested crops against a district yield benchmark). The backend's own
// note field says so; this screen keeps them in two visibly separate blocks.
//
// ── PHASE G: THIS SCREEN IS NOW GRADE-AWARE ───────────────────────────────
// It was written before Phase C made `producesAggregation` grade-separated, so
// it rendered a stale shape: a flat crop → kg list, with `availableLots`
// ignored entirely. That is the exact blending the backend refuses — a group
// holding 900 kg of Grade A onion and 400 kg nobody graded read as "1,300 kg
// Onion", which is not a thing anybody can sell to a buyer paying for Grade A.
//
// So stock is now rendered by (crop, GRADE), from the SAME `availableLots` a
// buyer is offered on Vendor/BundlesScreen — and through the same shared
// helpers (utils/lotDisplay.js, Phase F), so the admin's screen and the buyer's
// catalog cannot start describing the same lot differently. Two rules ride in
// from that file rather than being re-decided here:
//   • UNGRADED IS NOT A FOURTH TIER. It is a visually different KIND of chip
//     (dashed, slate, question mark), labelled "Grade not declared", and it
//     sorts where the backend put it — never below C.
//   • A GRADE IS A CLAIM. The chip never travels without the self-declared
//     marker; nobody has inspected any of this produce.
//   • UNKNOWN IS NOT ZERO. lotDisplay's formatters print an em dash for null
//     and never coerce to 0, which is why the local `Number(n || 0)` helpers
//     this screen used to carry are gone.
//
// The crop rollup (`availableNow`) stays as the headline per crop because the
// backend derives it FROM those lots — `availableNow[crop]` is the sum of that
// crop's lots — so the two can never drift.

const RUN_STATUS_STYLE = {
  awaiting_agent: { fg: '#B45309', bg: '#FEF3C7' },
  accepted:       { fg: '#1D4ED8', bg: '#DBEAFE' },
  collecting:     { fg: '#15803D', bg: '#DCFCE7' },
  // `in_transit` gets its OWN colour, not `collecting`'s. The dashboard's
  // in-progress list includes it (routes/fpos.js IN_PROGRESS_STATUSES), and the
  // whole reason that state exists is that the last farm gate → buyer's gate
  // leg used to be invisible. Sharing a colour with collecting would put it
  // straight back.
  in_transit:     { fg: '#6D28D9', bg: '#F5F3FF' },
};

/**
 * ONE GRADE LOT, as the admin's own stock.
 *
 * Everything visual comes from `gradeVisual()` — the shared Phase F helper the
 * buyer's catalog uses. Nothing here decides what a grade looks like, which is
 * the only way the two screens stay consistent.
 */
const LotRow = ({ lot, t, onOpen }) => {
  const g = gradeVisual(lot);
  const price = lot.price || {};
  // Tappable so an admin can see WHO this lot is made of. The dashboard showed
  // "Onion · Grade A · 2,400 kg" with nothing underneath it — a headline to run
  // a business on. Falls back to a plain View when there is nowhere to go, so
  // the affordance never lies about being tappable.
  const Wrap = onOpen ? TouchableOpacity : View;
  return (
    <Wrap style={s.lotRow} onPress={onOpen} activeOpacity={onOpen ? 0.8 : 1}>
      <View style={s.lotHead}>
        <View
          style={[
            s.gradeChip,
            // Square-cornered as well as dashed: Android silently drops a
            // dashed border on a fully rounded pill, and the ungraded chip must
            // never degrade into looking like just another grade.
            g.dashed && s.gradeChipUngraded,
            { backgroundColor: g.bg, borderColor: g.border, borderStyle: g.dashed ? 'dashed' : 'solid' },
          ]}
        >
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

        <View style={{ flex: 1 }} />
        <Text style={s.lotKg}>{kgs(lot.totalKg)}</Text>
      </View>

      {/* ⚠️ NO NEW ACTION HERE — this lot is already live to buyers the moment
          it exists. There is no separate "publish" step in this app: any
          member's graded, available listing is aggregated by the exact same
          lotCatalogService.buildLots() the buyer's own GET /bundles calls.
          The badge exists so the admin sees that plainly rather than wondering
          whether looking at it here does anything. */}
      <View style={s.liveChip}>
        <View style={s.liveDot} />
        <Text style={s.liveChipText}>{t('fpoDashboard.liveToBuyers')}</Text>
      </View>

      {/* "Unknown, not below C" — the backend's own tier: null, in words. */}
      {!!g.subline && <Text style={s.lotSubline}>{g.subline}</Text>}

      <Text style={s.lotMeta}>
        {nf(lot.farms || 0)} {t('fpoDashboard.farmsWord')}
        {price.indicativePerKg != null
          ? ` · ${perKg(price.indicativePerKg)} ${t('fpoDashboard.indicative')}`
          : ''}
      </Text>

      {/* The pricing trap, reported rather than averaged away: inside one lot
          the members ask different ₹/kg and no single figure describes it. */}
      {price.wide && (
        <Text style={s.lotSpread}>
          {perKg(price.minPerKg)} – {perKg(price.maxPerKg)} · {t('fpoDashboard.spreadNote')}
        </Text>
      )}

      {g.mixedSpecVersions && (
        <Text style={s.lotSpread}>{t('fpoDashboard.mixedSpecs')}</Text>
      )}
    </Wrap>
  );
};

export default function FpoDashboardScreen({ route, navigation }) {
  const { t } = useLanguage();
  // `userData` is forwarded to FpoOrders → Receipt, which reads the caller's
  // role. Destructured here rather than referenced bare: it is NOT otherwise
  // in scope in this component, and an undefined identifier in JSX is a
  // runtime ReferenceError that no parse check would catch.
  const { fpoId, userData } = route.params || {};

  // ── EVERY HOOK IS ABOVE THE FIRST EARLY RETURN (the `if (loading)` at line
  // ~170). React counts hooks per render, so a hook added below that guard
  // would not run on the first render and would on the second — the crash
  // CLAUDE.md records for FarmerSalesScreen. Nothing below may add one.
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // Phase 7 — "the FPO page is so random" (reported directly): this screen
  // used to be one long scroll through header stats, produce, members, buyer
  // demand, logistics, storage and settlement, with the way into Collection
  // and Terms buried as two of nine buttons stacked in the header card. A
  // real tab bar makes the six things an admin actually comes here for —
  // Today / Stock / Money / Collection / Terms / Members — the FIRST thing on
  // screen, not the last. Collection and Terms are complex forms with their
  // own state and are left as their own screens (tapping those two tabs just
  // navigates, same destinations as before); Today/Stock/Money/Members
  // render the sections that were always pure display, now behind a switch
  // instead of a scroll.
  const [tab, setTab] = useState('today');

  // Buyer requests waiting on this admin's Accept/Reject — the real approval
  // gate in front of an FPO lot sale. Fetched separately from the dashboard
  // payload (which only carries the COUNT, for the stat row/badge) so this
  // section can refresh on its own after an accept/reject without re-pulling
  // the whole dashboard.
  const [lotRequests, setLotRequests] = useState({ pending: [], history: [] });
  const [reqBusyId, setReqBusyId] = useState(null);
  // One optional free-text reason per pending request, keyed by its id — kept
  // as a plain TextInput on the card rather than an Alert.prompt, which is
  // iOS-only and this app's users are on Android (see CLAUDE.md).
  const [rejectReasons, setRejectReasons] = useState({});

  const fetchDashboard = useCallback(async () => {
    try {
      const r = await axios.get(`${API_ENDPOINTS.FPOS}/${fpoId}/dashboard`);
      if (r.data?.success) {
        setDashboard(r.data.dashboard);
        setError('');
      } else {
        setError(r.data?.error || t('fpoDashboard.loadError'));
      }
    } catch (e) {
      setError(e.response?.data?.error || t('fpoDashboard.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fpoId, t]);

  const fetchLotRequests = useCallback(async () => {
    try {
      const r = await axios.get(`${API_ENDPOINTS.FPOS}/${fpoId}/lot-requests`);
      if (r.data?.success) {
        setLotRequests({ pending: r.data.pending || [], history: r.data.history || [] });
      }
      // Additive — a failure here leaves the rest of the dashboard exactly as
      // useful as it already was, same rule as the buyer's own lot-requests
      // fetch on VendorOrdersScreen.
    } catch (e) { /* additive; see above */ }
  }, [fpoId]);

  useEffect(() => { fetchDashboard(); fetchLotRequests(); }, [fetchDashboard, fetchLotRequests]);

  const acceptRequest = useCallback(async (r) => {
    setReqBusyId(r._id);
    try {
      const res = await axios.post(`${API_ENDPOINTS.FPOS}/lot-requests/${r._id}/accept`, {});
      if (res.data?.committed === false || res.data?.stale) {
        Alert.alert(
          res.data.stale ? t('fpoDashboard.requestWentStale') : t('fpoDashboard.requestCouldNotAccept'),
          res.data.error || '',
        );
      }
      await Promise.all([fetchLotRequests(), fetchDashboard()]);
    } catch (e) {
      Alert.alert(t('fpoDashboard.requestCouldNotAccept'), e.response?.data?.error || '');
      await fetchLotRequests();
    } finally {
      setReqBusyId(null);
    }
  }, [fetchLotRequests, fetchDashboard, t]);

  const rejectRequest = useCallback(async (r) => {
    setReqBusyId(r._id);
    try {
      await axios.post(`${API_ENDPOINTS.FPOS}/lot-requests/${r._id}/reject`, {
        reason: rejectReasons[r._id] || '',
      });
      await Promise.all([fetchLotRequests(), fetchDashboard()]);
    } catch (e) {
      Alert.alert(t('fpoDashboard.requestCouldNotReject'), e.response?.data?.error || '');
    } finally {
      setReqBusyId(null);
    }
  }, [fetchLotRequests, fetchDashboard, rejectReasons, t]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;
  }

  if (error && !dashboard) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={40} color="#DC2626" />
        <Text style={s.errorText}>{error}</Text>
      </View>
    );
  }

  const d = dashboard || {};
  const pa = d.producesAggregation || {};
  const availableEntries = Object.entries(pa.availableNow || {});
  const estimatedEntries = Object.entries(pa.estimatedIncoming || {});
  const members = d.memberCards || [];
  const buyerReqs = d.buyerDemand?.requirements || [];
  const logistics = d.logistics || {};
  const storage = d.storageSuggestion || {};
  const settlement = d.seasonSettlement || {};

  // ── OVERALL PERFORMANCE, DERIVED FROM THE SAME memberCards THE CAROUSEL
  // RENDERS — never a second figure computed a different way, which is how a
  // header stat and the cards under it end up disagreeing with each other.
  const totalKgSupplied = members.reduce((a, m) => a + (m.totalKgSupplied || 0), 0);
  const totalPaidToMembers = members.reduce((a, m) => a + (m.totalEarned || 0), 0);

  const openMember = (m) => navigation?.navigate('FpoMemberDetail', {
    fpoId, farmerUid: m.farmerUid, farmerName: m.farmerName, village: m.village, trust: m.trust, userData,
  });

  // The lots for one crop, in the order the backend built them (crop, then
  // A/B/C, then ungraded). The rollup row and its lots come from the same
  // array, so the heading can never disagree with what is under it.
  const lotsForCrop = (cropName) =>
    (pa.availableLots || []).filter((l) => l.cropName === cropName);

  const procurement = settlement.paymentMode === 'procurement';
  const fee = settlement.fpoPosition?.fee || null;
  const gaps = settlement.procurement?.gaps || [];

  const openRun = (id) => navigation?.navigate('FpoRun', { consignmentId: id, fpoId });

  // Two of the six are destinations, not panels — Collection and Terms are
  // full forms with their own validation and submit flows, and folding them
  // into an inline tab would mean rewriting two already-working screens for
  // no gain. Tapping one navigates and leaves `tab` exactly where it was, so
  // the bar never shows a tab "selected" with nothing under it.
  const TABS = [
    { key: 'today', label: t('fpoDashboard.tabToday'), icon: 'today-outline' },
    { key: 'stock', label: t('fpoDashboard.tabStock'), icon: 'cube-outline' },
    { key: 'money', label: t('fpoDashboard.tabMoney'), icon: 'cash-outline' },
    { key: 'collection', label: t('fpoDashboard.tabCollection'), icon: 'download-outline',
      onPress: () => navigation?.navigate('FpoCollection', { fpoId, userData }) },
    { key: 'terms', label: t('fpoTerms.linkLabel'), icon: 'document-text-outline',
      onPress: () => navigation?.navigate('FpoTerms', { fpoId, userData }) },
    { key: 'members', label: t('fpoDashboard.tabMembers'), icon: 'people-outline',
      badge: d.pendingMemberCount > 0 ? d.pendingMemberCount : 0 },
  ];

  return (
    <View style={s.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarInner}>
        {TABS.map((tb) => {
          const active = tab === tb.key;
          return (
            <TouchableOpacity
              key={tb.key}
              style={[s.tabBtn, active && s.tabBtnOn]}
              onPress={() => (tb.onPress ? tb.onPress() : setTab(tb.key))}
              accessibilityLabel={tb.label}
            >
              <Ionicons name={tb.icon} size={16} color={active ? '#15803D' : '#6B7280'} />
              <Text style={[s.tabBtnText, active && s.tabBtnTextOn]}>{tb.label}</Text>
              {tb.badge > 0 && (
                <View style={s.tabBadge}><Text style={s.tabBadgeText}>{tb.badge}</Text></View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

    <ScrollView
      style={s.scroll}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor="#16A34A"
        onRefresh={() => { setRefreshing(true); fetchDashboard(); }} />}
    >
      {/* ── 1. Header — TODAY ── */}
      {tab === 'today' && (
      <View style={s.headerCard}>
        <Text style={s.headerTitle}>{d.fpoName}</Text>
        <Text style={s.headerMeta}>
          {[d.district, d.village].filter(Boolean).join(' · ') || t('fpoDashboard.locationUnknown')}
        </Text>
        <View style={s.headerStatRow}>
          <Ionicons name="people-outline" size={15} color="#15803D" />
          <Text style={s.headerStatText}>
            {d.activeMemberCount ?? 0} {t('fpoDashboard.activeMembers')}
          </Text>
          {/* 🐛 THIS WAS A PLAIN <View> WITH NO onPress — REPORTED DIRECTLY:
              "I can't open the request". Styled like a badge (rounded,
              coloured, bold) sitting at the very TOP of the screen, it reads
              as the obvious thing to tap the moment someone is waiting — and
              did nothing. The real control (below, "Manage Members") worked
              the whole time; nobody tapping the pill ever found it. Same dead
              -control defect class already recorded twice in CLAUDE.md.
              Only shown when somebody is actually waiting — a permanent "0
              waiting" badge would be noise, and this is a call to act. */}
          {(d.pendingMemberCount ?? 0) > 0 && (
            <TouchableOpacity
              style={s.waitingPill}
              onPress={() => navigation?.navigate('FpoMembers', { fpoId })}
              accessibilityLabel={`${d.pendingMemberCount} ${t('fpoDashboard.membersWaiting')}`}
            >
              <Text style={s.waitingPillText}>
                {d.pendingMemberCount} {t('fpoDashboard.membersWaiting')}
              </Text>
              <Ionicons name="chevron-forward" size={11} color="#B45309" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── WHAT THIS GROUP DEALS IN ──────────────────────────────────
            `focusDeclared` is what the empty state branches on, NOT
            `focusCrops.length`. They are the same number today, but the
            distinction is the whole point of the field: an empty list means
            "not declared", never "deals in nothing", and reading the length
            directly is how a screen quietly starts asserting the second one.
            The backend sends both for exactly this reason. */}
        <View style={s.focusRow}>
          <View style={s.focusHead}>
            <Ionicons name="leaf-outline" size={14} color="#15803D" />
            <Text style={s.focusHeadText}>{t('fpoDashboard.focusTitle')}</Text>
            <TouchableOpacity onPress={() => navigation?.navigate('FpoFocusCrops', { fpoId })}>
              <Text style={s.focusEdit}>{t('fpoDashboard.setFocus')}</Text>
            </TouchableOpacity>
          </View>
          {!d.focusDeclared ? (
            <Text style={s.focusEmpty}>{t('fpoDashboard.focusNotDeclared')}</Text>
          ) : (
            <View style={s.focusChipWrap}>
              {(d.focusCrops || []).map((c) => (
                <View key={c} style={s.focusChip}>
                  <Text style={s.focusChipText}>{c}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

      </View>
      )}

      {/* ── OVERALL PERFORMANCE — TODAY ──────────────────────────────────
          The four figures an officer actually opens this screen for, before
          anything else: how big is the group, how much has moved through it
          this season, and is anything waiting on them right now. Every
          number here is derived from the same memberCards/pendingLotRequest
          data the sections below render — never a second copy of the
          arithmetic. */}
      {tab === 'today' && (
      <View style={s.card}>
        <Text style={s.sectionTitle}>{t('fpoDashboard.performanceTitle')}</Text>
        <View style={s.perfGrid}>
          <View style={s.perfCell}>
            <Text style={s.perfNum}>{nf(d.activeMemberCount ?? 0)}</Text>
            <Text style={s.perfLabel}>{t('fpoDashboard.statMembers')}</Text>
          </View>
          <View style={s.perfCell}>
            <Text style={s.perfNum}>{kgs(totalKgSupplied)}</Text>
            <Text style={s.perfLabel}>{t('fpoDashboard.statKgSupplied')}</Text>
          </View>
          <View style={s.perfCell}>
            <Text style={s.perfNum}>{money(totalPaidToMembers)}</Text>
            <Text style={s.perfLabel}>{t('fpoDashboard.statPaidToMembers')}</Text>
          </View>
          <View style={s.perfCell}>
            <Text style={[s.perfNum, (d.pendingLotRequestCount ?? 0) > 0 && s.perfNumWarn]}>
              {nf(d.pendingLotRequestCount ?? 0)}
            </Text>
            <Text style={s.perfLabel}>{t('fpoDashboard.statPendingRequests')}</Text>
          </View>
        </View>
      </View>
      )}

      {/* ── FARMER PERFORMANCE — TODAY ────────────────────────────────────
          Auto-scrolling, pauses the instant it is touched and resumes a few
          seconds after release — AutoScrollTicker, the same component the
          Market Prices ticker and Schemes rows already use, chosen instead of
          a manual horizontal ScrollView specifically because that component's
          own header records a reported bug: a real horizontal ScrollView
          nested inside this screen's outer vertical one made touches
          elsewhere on the page unreliable. Same card component
          (components/fpo/MemberCard) as the "See all" grid and the member
          detail screen, so a trust badge or an unpaid figure cannot read
          differently in one of the three. */}
      {tab === 'today' && (
      <View style={s.card}>
        <View style={s.sectionHeadRow}>
          <Text style={s.sectionTitle}>{t('fpoDashboard.farmerPerformanceTitle')}</Text>
          {members.length > 0 && (
            <TouchableOpacity
              onPress={() => navigation?.navigate('FpoAllMembers', { fpoId, userData, members })}
            >
              <Text style={s.seeAll}>{t('fpoDashboard.seeAll')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {members.length === 0 ? (
          <Text style={s.emptyLine}>{t('fpoDashboard.noMembers')}</Text>
        ) : (
          <AutoScrollTicker
            items={members}
            cardWidth={172}
            cardMargin={10}
            renderItem={(m, idx) => (
              <View key={`${m.farmerUid}-${idx}`} style={{ marginRight: 10 }}>
                <MemberCard
                  m={m}
                  onPress={openMember}
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
          />
        )}
      </View>
      )}

      {/* ── BUYER REQUESTS — TODAY ────────────────────────────────────────
          The real approval gate: a buyer's POST /lots/request holds here
          until this admin taps Accept or Reject. Accepting re-derives the
          quote server-side and only THEN takes stock and writes the Order —
          nothing here is a second copy of that arithmetic, this screen only
          triggers it. */}
      {tab === 'today' && (
      <View style={s.card}>
        <Text style={s.sectionTitle}>{t('fpoDashboard.buyerRequestsTitle')}</Text>
        {lotRequests.pending.length === 0 && lotRequests.history.length === 0 ? (
          <Text style={s.emptyLine}>{t('fpoDashboard.noBuyerRequests')}</Text>
        ) : (
          <>
            {lotRequests.pending.map((r) => {
              const busy = reqBusyId === r._id;
              const snap = r.quoteSnapshot || {};
              return (
                <View key={r._id} style={s.reqCard}>
                  <View style={s.reqTop}>
                    <Text style={s.reqCrop}>{kgs(r.quantityKg)} {r.cropName}</Text>
                    <Text style={s.reqWaiting}>{t('fpoDashboard.requestWaiting')}</Text>
                  </View>
                  <Text style={s.reqBuyer}>{r.vendorCompany || r.vendorName}</Text>
                  {snap.buyerTotal != null && (
                    <Text style={s.reqMeta}>
                      {t('fpoDashboard.requestTotal')} {money(snap.buyerTotal)}
                      {(snap.allocation || []).length
                        ? ` · ${snap.allocation.length} ${t('fpoDashboard.farmsWord')}`
                        : ''}
                    </Text>
                  )}
                  <TextInput
                    style={s.reqReasonInput}
                    placeholder={t('fpoDashboard.rejectReasonPlaceholder')}
                    placeholderTextColor="#9CA3AF"
                    value={rejectReasons[r._id] || ''}
                    onChangeText={(v) => setRejectReasons((prev) => ({ ...prev, [r._id]: v }))}
                    editable={!busy}
                  />
                  <View style={s.reqBtnRow}>
                    <TouchableOpacity
                      style={[s.reqBtn, s.reqBtnReject]}
                      disabled={busy}
                      onPress={() => rejectRequest(r)}
                    >
                      {busy ? <ActivityIndicator size="small" color="#B91C1C" /> : (
                        <Text style={s.reqBtnRejectText}>{t('fpoDashboard.requestReject')}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.reqBtn, s.reqBtnAccept]}
                      disabled={busy}
                      onPress={() => acceptRequest(r)}
                    >
                      {busy ? <ActivityIndicator size="small" color="#fff" /> : (
                        <Text style={s.reqBtnAcceptText}>{t('fpoDashboard.requestAccept')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {lotRequests.history.length > 0 && (
              <>
                <Text style={[s.subLabel, { marginTop: lotRequests.pending.length ? 12 : 0 }]}>
                  {t('fpoDashboard.requestRecent')}
                </Text>
                {lotRequests.history.slice(0, 6).map((r) => (
                  <View key={r._id} style={s.reqHistRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.reqHistCrop}>{kgs(r.quantityKg)} {r.cropName}</Text>
                      <Text style={s.reqHistBuyer}>{r.vendorCompany || r.vendorName}</Text>
                    </View>
                    <View style={[
                      s.reqHistChip,
                      r.status === 'accepted' ? s.reqHistChipOk : s.reqHistChipOff,
                    ]}>
                      <Text style={[
                        s.reqHistChipText,
                        r.status === 'accepted' ? s.reqHistChipOkText : s.reqHistChipOffText,
                      ]}>
                        {t(`fpoDashboard.requestStatus.${r.status}`)}
                      </Text>
                    </View>
                    {r.status === 'accepted' && !!r.resultConsignmentId && (
                      <TouchableOpacity onPress={() => openRun(r.resultConsignmentId)}>
                        <Ionicons name="navigate-circle-outline" size={22} color="#16A34A" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </View>
      )}

      {/* ── 4. Buyer demand — TODAY ── */}
      {tab === 'today' && (
      <View style={s.card}>
        <Text style={s.sectionTitle}>{t('fpoDashboard.buyerDemandTitle')}</Text>
        {buyerReqs.length === 0 ? (
          <Text style={s.emptyLine}>
            {d.buyerDemand?.reason === 'NO_LOCATION'
              ? t('fpoDashboard.noLocationForDemand')
              : t('fpoDashboard.noBuyerDemand')}
          </Text>
        ) : (
          buyerReqs.slice(0, 10).map((r) => (
            <View key={r._id} style={s.demandRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.demandWant}>{kgs(r.quantityKg)} {r.commodity}</Text>
                <Text style={s.demandBuyer}>{r.vendorCompany || r.vendorName}</Text>
                <Text style={s.demandMeta}>
                  {r.minGrade
                    ? `${t('fpoDashboard.needsGrade')} ${r.minGrade}`
                    : t('fpoDashboard.anyGrade')}
                  {r.priceMin != null || r.priceMax != null
                    ? ` · ${perKg(r.priceMin ?? r.priceMax)}${r.priceMax != null && r.priceMin != null && r.priceMax !== r.priceMin ? `–${perKg(r.priceMax)}` : ''}`
                    : ''}
                  {r.responseCount ? ` · ${r.responseCount} ${t('fpoDashboard.responses')}` : ''}
                </Text>
              </View>
              <Text style={s.demandDist}>{r.distanceKm} {t('fpoDashboard.kmAway')}</Text>
            </View>
          ))
        )}
      </View>
      )}

      {/* ── 5. Logistics — TODAY ── */}
      {tab === 'today' && (
      <View style={s.card}>
        <Text style={s.sectionTitle}>{t('fpoDashboard.logisticsTitle')}</Text>
        <View style={s.statRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{logistics.inProgress?.length ?? 0}</Text>
            <Text style={s.statLabel}>{t('fpoDashboard.inProgress')}</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statNum}>{logistics.completed?.length ?? 0}</Text>
            <Text style={s.statLabel}>{t('fpoDashboard.completed')}</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statNum}>{money(logistics.totalSaved)}</Text>
            <Text style={s.statLabel}>{t('fpoDashboard.saved')}</Text>
          </View>
        </View>

        {(logistics.inProgress || []).length > 0 && (
          <>
            <Text style={[s.subLabel, { marginTop: 12 }]}>{t('fpoDashboard.runsUnderWay')}</Text>
            {logistics.inProgress.map((run) => {
              const st = RUN_STATUS_STYLE[run.status] || { fg: '#6B7280', bg: '#F1F5F9' };
              return (
                <TouchableOpacity
                  key={String(run._id)} style={s.runRow} activeOpacity={0.8}
                  onPress={() => openRun(run._id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.runTitle}>
                      {run.stops} {t('fpoDashboard.stopsWord')} · {kgs(run.totalQuantityKg)}
                    </Text>
                    <View style={[s.runChip, { backgroundColor: st.bg }]}>
                      <Text style={[s.runChipText, { color: st.fg }]}>
                        {t(`fpoDashboard.runStatus.${run.status}`)}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.runVehicle}>{run.vehicleType}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              );
            })}
            <Text style={s.footnote}>{t('fpoDashboard.runsOpenNote')}</Text>
          </>
        )}

        {(logistics.completed || []).length > 0 && (
          <>
            <Text style={[s.subLabel, { marginTop: 12 }]}>{t('fpoDashboard.completed')}</Text>
            {logistics.completed.slice(0, 5).map((run) => (
              <View key={String(run._id)} style={s.produceRow}>
                <Text style={s.produceCrop}>
                  {run.stops} {t('fpoDashboard.stopsWord')} · {kgs(run.totalQuantityKg)}
                </Text>
                <Text style={s.produceQty}>{money(run.saved)}</Text>
              </View>
            ))}
          </>
        )}

        {logistics.unmeasuredCompleted > 0 && (
          <Text style={s.footnote}>
            {logistics.unmeasuredCompleted} {t('fpoDashboard.unmeasuredRuns')}
          </Text>
        )}
        <Text style={s.footnote}>{logistics.note}</Text>
      </View>
      )}

      {/* ── 2. Produce aggregation — STOCK ── */}
      {tab === 'stock' && (
      <View style={s.card}>
        <Text style={s.sectionTitle}>{t('fpoDashboard.produceTitle')}</Text>

        <Text style={s.subLabel}>{t('fpoDashboard.availableNow')}</Text>
        {availableEntries.length === 0 ? (
          <Text style={s.emptyLine}>{t('fpoDashboard.noAvailableNow')}</Text>
        ) : (
          <>
            <Text style={s.bigStat}>{pa.totalAvailableTonnes ?? 0} {t('fpoDashboard.tonnes')}</Text>

            {availableEntries.map(([cropName, qty]) => (
              <View key={cropName} style={s.cropBlock}>
                <View style={s.produceRow}>
                  <Text style={s.produceCrop}>{cropName}</Text>
                  <Text style={s.produceQty}>{kgs(qty)}</Text>
                </View>
                {/* ONE ROW PER GRADE. Never one blended row per crop — a buyer
                    paying for Grade A must not be offered a mixture, and an
                    admin planning a sale needs to see the same split. */}
                {lotsForCrop(cropName).map((lot) => (
                  <LotRow
                    key={lot.lotKey}
                    lot={lot}
                    t={t}
                    onOpen={() => navigation?.navigate('FpoLot', {
                      fpoId, lotKey: lot.lotKey, cropName: lot.cropName,
                    })}
                  />
                ))}
              </View>
            ))}

            {(pa.gradedLots > 0 || pa.ungradedLots > 0) && (
              <Text style={s.footnote}>
                {pa.gradedLots ?? 0} {t('fpoDashboard.gradedLots')} · {pa.ungradedLots ?? 0} {t('fpoDashboard.ungradedLots')}
              </Text>
            )}
            <Text style={s.footnote}>{t('fpoDashboard.gradeNote')}</Text>
          </>
        )}

        <View style={s.divider} />

        {/* A FORECAST, IN ITS OWN BLOCK. Never added to the stock above. */}
        <Text style={s.subLabel}>{t('fpoDashboard.estimatedIncoming')}</Text>
        {estimatedEntries.length === 0 ? (
          <Text style={s.emptyLine}>{t('fpoDashboard.noEstimatedIncoming')}</Text>
        ) : (
          <>
            <Text style={[s.bigStat, { color: '#B45309' }]}>
              {pa.totalEstimatedTonnes ?? 0} {t('fpoDashboard.tonnes')} <Text style={s.forecastTag}>{t('fpoDashboard.forecastTag')}</Text>
            </Text>
            <Text style={s.forecastWarn}>{t('fpoDashboard.forecastNotStock')}</Text>
            {/* ── ⚠️ HOW MUCH OF THE GROUP THIS FORECAST ACTUALLY COVERS ────
                Measured, not guessed: `backend/scripts/measureIncomingModel.js`
                found the ICRISAT lookup can price only about a TENTH of the
                planted crops in this database — it has no rows for cotton or
                sugarcane at all, two of the commonest crops here. The excluded
                crops were already named below; what was missing was the size of
                the hole. An admin reading "4.2 tonnes incoming" with no idea it
                covers a tenth of their group is being misled by omission. */}
            {!!pa.coverage && pa.coverage.cropsPlanted > 0
              && pa.coverage.cropsCounted < pa.coverage.cropsPlanted && (
              <View style={s.coverageBox}>
                <Ionicons name="pie-chart-outline" size={14} color="#B45309" />
                <Text style={s.coverageText}>{pa.coverage.note}</Text>
              </View>
            )}
            {estimatedEntries.map(([cropName, qty]) => (
              <View key={cropName} style={s.produceRow}>
                <Text style={s.produceCrop}>{cropName}</Text>
                <Text style={s.produceQty}>{kgs(qty)}</Text>
              </View>
            ))}
          </>
        )}

        {pa.excludedCropCount > 0 && (
          <View style={s.noticeRow}>
            <Ionicons name="information-circle-outline" size={14} color="#9CA3AF" />
            <Text style={s.noticeText}>
              {pa.excludedCropCount} {t('fpoDashboard.excludedFromForecast')}
              {(pa.excludedCrops || []).slice(0, 3).map((x) => `\n· ${x.farmerName} — ${x.cropName}: ${x.reason}`).join('')}
              {pa.excludedCrops?.length > 3 ? `\n… ${t('fpoDashboard.andMore')}` : ''}
            </Text>
          </View>
        )}

        <Text style={s.footnote}>{t('fpoDashboard.produceNote')}</Text>
      </View>
      )}

      {/* ── 3. Members — MEMBERS ──────────────────────────────────────────
          ⚠️ PERFORMANCE MOVED TO THE TODAY TAB, NOT DUPLICATED HERE. This tab
          used to carry its own copy of the member-card scroller, which is
          exactly what made "Members" the only place to see how a farmer is
          doing — one tap away from where an officer actually lands. This tab
          is now what it is actually FOR: admitting or declining applicants. */}
      {tab === 'members' && (
      <View style={s.card}>
        <Text style={s.sectionTitle}>{t('fpoDashboard.membersTitle')}</Text>

        <TouchableOpacity
          style={s.membersBtn}
          onPress={() => navigation?.navigate('FpoMembers', { fpoId })}
        >
          <Ionicons name="people" size={15} color="#15803D" />
          <Text style={s.membersBtnText}>
            {t('fpoDashboard.manageMembers')}
            {d.pendingMemberCount > 0 ? ` (${d.pendingMemberCount})` : ''}
          </Text>
          <Ionicons name="chevron-forward" size={15} color="#15803D" />
        </TouchableOpacity>

        <TouchableOpacity
          style={s.membersBtn}
          onPress={() => navigation?.navigate('FpoAllMembers', { fpoId, userData, members })}
        >
          <Ionicons name="stats-chart-outline" size={15} color="#15803D" />
          <Text style={s.membersBtnText}>{t('fpoDashboard.viewPerformance')}</Text>
          <Ionicons name="chevron-forward" size={15} color="#15803D" />
        </TouchableOpacity>
      </View>
      )}

      {/* ── 6. Storage suggestion — STOCK ── */}
      {tab === 'stock' && (
      <View style={s.card}>
        <Text style={s.sectionTitle}>{t('fpoDashboard.storageTitle')}</Text>
        {!storage.available ? (
          <View style={s.refuseBox}>
            <Ionicons name="cube-outline" size={16} color="#9CA3AF" />
            <Text style={s.refuseBoxText}>{storage.reason || t('fpoDashboard.noStorageBasis')}</Text>
          </View>
        ) : (
          <>
            <Text style={s.subLabel}>
              {t('fpoDashboard.sizedFor')} {storage.dominantCrop} · {kgs(storage.dominantKg)}
            </Text>
            {(storage.options || []).length === 0 ? (
              <Text style={s.emptyLine}>{t('fpoDashboard.noWarehouses')}</Text>
            ) : (
              storage.options.slice(0, 5).map((o) => (
                <View key={o._id || o.name} style={s.storageOptionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.storageOptionName}>{o.name}</Text>
                    <Text style={s.storageOptionMeta}>
                      {o.district}{o.distanceKm != null ? ` · ${o.distanceKm} km` : ''}
                    </Text>
                  </View>
                  {o.suitable === false ? (
                    <Text style={s.storageRefused}>{t('fpoDashboard.notSuitable')}</Text>
                  ) : (
                    <Text style={s.storageCost}>{money(o.storageCost)}</Text>
                  )}
                </View>
              ))
            )}
            <Text style={s.footnote}>{storage.note}</Text>
          </>
        )}
      </View>
      )}

      {/* ── 7. Season settlement — MONEY ── */}
      {tab === 'money' && (
      <View style={s.card}>
        <TouchableOpacity
          style={s.membersBtn}
          onPress={() => navigation?.navigate('FpoOrders', { fpoId, userData })}
          accessibilityLabel={t('fpoDashboard.groupOrders')}
        >
          <Ionicons name="receipt-outline" size={15} color="#15803D" />
          <Text style={s.membersBtnText}>{t('fpoDashboard.groupOrders')}</Text>
          <Ionicons name="chevron-forward" size={15} color="#15803D" />
        </TouchableOpacity>

        <Text style={s.sectionTitle}>{t('fpoDashboard.settlementTitle')}</Text>

        {/* WHICH BARGAIN THIS GROUP STRUCK. Phase B made paymentMode real and
            this screen predates it: under procurement a member is owed the
            agreed rate whatever the lot fetched, which is a completely
            different number from the sale value shown below it. */}
        <View style={[s.modeChip, procurement ? s.modeChipProc : s.modeChipFac]}>
          <Ionicons name={procurement ? 'swap-horizontal' : 'briefcase-outline'} size={12}
            color={procurement ? '#1D4ED8' : '#15803D'} />
          <Text style={[s.modeChipText, { color: procurement ? '#1D4ED8' : '#15803D' }]}>
            {t(procurement ? 'fpoDashboard.modeProcurement' : 'fpoDashboard.modeFacilitation')}
          </Text>
        </View>

        {settlement.orders === 0 ? (
          <Text style={s.emptyLine}>{t('fpoDashboard.noSettlementOrders')}</Text>
        ) : (
          <>
            <View style={s.statRow}>
              <View style={s.stat}>
                <Text style={s.statNum}>{money(settlement.pooledCropValue)}</Text>
                <Text style={s.statLabel}>{t('fpoDashboard.pooledValue')}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statNum}>{kgs(settlement.totalQuantityKg)}</Text>
                <Text style={s.statLabel}>{t('fpoDashboard.totalQuantity')}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statNum}>{money(settlement.memberPayableTotal)}</Text>
                <Text style={s.statLabel}>{t('fpoDashboard.membersOwed')}</Text>
              </View>
            </View>

            {/* The fee comes off BEFORE any share split, and the screen names
                the basis so a percentage and a ₹/kg fee cannot be confused. */}
            {!procurement && fee && fee.mode !== 'none' && (
              <View style={s.produceRow}>
                <Text style={s.produceCrop}>
                  {t('fpoDashboard.groupFee')}
                  {fee.mode === 'percent' ? ` · ${fee.percent}%` : ` · ${perKg(fee.perKg)}`}
                </Text>
                <Text style={s.produceQty}>{money(fee.total)}</Text>
              </View>
            )}

            {/* NEGATIVE WHEN THE LOT SOLD BADLY, and reported negative — the
                same rule as the un-clamped pooling saving. */}
            {procurement && settlement.fpoPosition && (
              <View style={s.produceRow}>
                <Text style={s.produceCrop}>{t('fpoDashboard.groupMargin')}</Text>
                <Text style={[
                  s.produceQty,
                  { color: (settlement.fpoPosition.margin ?? 0) < 0 ? '#B91C1C' : '#15803D' },
                ]}>
                  {money(settlement.fpoPosition.margin)}
                </Text>
              </View>
            )}

            <Text style={s.subLabel}>{t('fpoDashboard.byLot')}</Text>
            {(settlement.byLot || []).map((row) => (
              <View key={row.farmerUid} style={s.produceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.produceCrop}>{row.farmerName}</Text>
                  <Text style={s.rowMeta}>
                    {kgs(row.quantityKg)}
                    {row.unpricedLots > 0 ? ` · ${row.unpricedLots} ${t('fpoDashboard.unpricedLots')}` : ''}
                  </Text>
                </View>
                <Text style={s.produceQty}>{money(row.amount)}</Text>
              </View>
            ))}

            {/* A MISSING PROCUREMENT RATE IS A GAP, NAMED — never zero, never a
                silent fallback. These lots are excluded from every total above
                and the admin has to be able to see that. */}
            {gaps.length > 0 && (
              <View style={s.gapBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#B45309" />
                <Text style={s.gapText}>
                  {gaps.length} {t('fpoDashboard.rateGaps')}
                  {gaps.slice(0, 4).map((g) => `\n· ${g.farmerName} — ${g.cropName}`
                    + `${g.grade ? ` (${g.grade})` : ''}: ${kgs(g.quantityKg)}`).join('')}
                  {gaps.length > 4 ? `\n… ${t('fpoDashboard.andMore')}` : ''}
                </Text>
              </View>
            )}

            {settlement.byShare && settlement.byShare.length > 0 && (
              <>
                <View style={s.divider} />
                <Text style={s.subLabel}>{t('fpoDashboard.byShare')}</Text>
                {settlement.byShare.map((row) => (
                  <View key={row.farmerUid} style={s.produceRow}>
                    <Text style={s.produceCrop}>{row.farmerName} ({row.sharePct}%)</Text>
                    <Text style={s.produceQty}>{money(row.amount)}</Text>
                  </View>
                ))}
              </>
            )}

            {/* PROCUREMENT + byShare IS REFUSED, not fudged — and the refusal
                has to be visible, not an empty gap where a table used to be. */}
            {settlement.byShareRefused && (
              <View style={s.refuseBox}>
                <Ionicons name="close-circle-outline" size={15} color="#9CA3AF" />
                <Text style={s.refuseBoxText}>{t('fpoDashboard.shareRefused')}</Text>
              </View>
            )}

            {!settlement.sharesAgreed && !settlement.byShareRefused && (
              <Text style={s.footnote}>{t('fpoDashboard.noShareAgreed')}</Text>
            )}
          </>
        )}

        <View style={s.noticeRow}>
          <Ionicons name="information-circle-outline" size={14} color="#9CA3AF" />
          <Text style={s.noticeText}>{t('fpoDashboard.noSeasonConcept')}</Text>
        </View>
      </View>
      )}
    </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', gap: 10 },

  tabBar: {
    flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  tabBarInner: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9',
  },
  tabBtnOn: { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
  tabBtnText: { fontSize: 12.5, fontWeight: '700', color: '#6B7280' },
  tabBtnTextOn: { color: '#15803D' },
  tabBadge: {
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
    backgroundColor: '#B45309', alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeText: { fontSize: 9.5, fontWeight: '800', color: '#fff' },
  errorText: { fontSize: 13.5, color: '#B91C1C', textAlign: 'center', paddingHorizontal: 30, lineHeight: 19 },

  headerCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  headerTitle: { fontSize: 19, fontWeight: '800', color: '#111827' },
  headerMeta: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  headerStatRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  headerStatText: { fontSize: 13, fontWeight: '700', color: '#15803D' },
  waitingPill: {
    marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: 999, backgroundColor: '#FEF3C7',
  },
  waitingPillText: { fontSize: 11, fontWeight: '700', color: '#B45309' },

  focusRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  focusHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  focusHeadText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#111827' },
  focusEdit: { fontSize: 12, fontWeight: '700', color: '#16A34A' },
  focusEmpty: { fontSize: 12, color: '#9CA3AF' },
  focusChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  focusChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#DCFCE7',
  },
  focusChipText: { fontSize: 11, color: '#15803D', fontWeight: '600' },

  membersBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
    borderWidth: 1, borderColor: '#DCFCE7', backgroundColor: '#F0FDF4',
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
  },
  membersBtnText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#15803D' },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  sectionTitle: {
    fontSize: 10.5, fontWeight: '800', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
  },
  sectionHeadRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  seeAll: { fontSize: 12.5, fontWeight: '700', color: '#16A34A' },
  subLabel: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginTop: 4, marginBottom: 4 },

  // ── overall performance stat grid ──────────────────────────────────────
  perfGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  perfCell: {
    flexBasis: '47%', flexGrow: 1, backgroundColor: '#F8FAFC', borderRadius: 14,
    padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9',
  },
  perfNum: { fontSize: 17, fontWeight: '900', color: '#15803D' },
  perfNumWarn: { color: '#B45309' },
  perfLabel: { fontSize: 10.5, color: '#9CA3AF', marginTop: 3, textAlign: 'center' },

  // ── buyer requests: accept / reject ────────────────────────────────────
  reqCard: {
    backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  reqTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reqCrop: { fontSize: 14, fontWeight: '700', color: '#111827' },
  reqWaiting: {
    fontSize: 10.5, fontWeight: '800', color: '#B45309', backgroundColor: '#FEF3C7',
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden',
  },
  reqBuyer: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  reqMeta: { fontSize: 12, color: '#374151', marginTop: 6, fontWeight: '600' },
  reqReasonInput: {
    marginTop: 10, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1,
    borderColor: '#E5E7EB', paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: '#111827',
  },
  reqBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  reqBtn: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  reqBtnReject: { backgroundColor: '#FEE2E2' },
  reqBtnRejectText: { fontSize: 13, fontWeight: '700', color: '#B91C1C' },
  reqBtnAccept: { backgroundColor: '#16A34A' },
  reqBtnAcceptText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  reqHistRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  reqHistCrop: { fontSize: 12.5, fontWeight: '700', color: '#111827' },
  reqHistBuyer: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  reqHistChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  reqHistChipOk: { backgroundColor: '#DCFCE7' },
  reqHistChipOff: { backgroundColor: '#F1F5F9' },
  reqHistChipText: { fontSize: 10, fontWeight: '800' },
  reqHistChipOkText: { color: '#15803D' },
  reqHistChipOffText: { color: '#6B7280' },
  bigStat: { fontSize: 22, fontWeight: '900', color: '#15803D', marginBottom: 6 },
  forecastTag: { fontSize: 11, fontWeight: '700', color: '#B45309' },
  forecastWarn: { fontSize: 11, color: '#B45309', marginBottom: 6, lineHeight: 15 },
  coverageBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    backgroundColor: '#FFFBEB', borderRadius: 12, padding: 10, marginTop: 8,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  coverageText: { flex: 1, fontSize: 11, color: '#92400E', lineHeight: 16 },
  emptyLine: { fontSize: 13, color: '#9CA3AF', lineHeight: 19, marginBottom: 4 },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },

  produceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  produceCrop: { fontSize: 13.5, color: '#111827', fontWeight: '600', flex: 1 },
  produceQty: { fontSize: 13.5, color: '#374151', fontWeight: '600' },
  rowMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },

  cropBlock: { marginTop: 8 },
  lotRow: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10,
    marginTop: 6, borderWidth: 1, borderColor: '#F1F5F9',
  },
  lotHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gradeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3,
  },
  gradeChipUngraded: { borderRadius: 6 },
  gradeChipText: { fontSize: 10.5, fontWeight: '800' },
  selfChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#F1F5F9', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3,
  },
  selfChipText: { fontSize: 9, fontWeight: '800', color: '#64748B', letterSpacing: 0.3 },
  lotKg: { fontSize: 13, fontWeight: '800', color: '#111827' },
  lotSubline: { fontSize: 10.5, color: '#64748B', marginTop: 5, lineHeight: 15 },
  lotMeta: { fontSize: 11.5, color: '#6B7280', marginTop: 5 },
  lotSpread: { fontSize: 10.5, color: '#B45309', marginTop: 3, lineHeight: 15 },
  liveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    marginTop: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  liveChipText: { fontSize: 10, fontWeight: '700', color: '#15803D' },

  noticeRow: {
    flexDirection: 'row', gap: 7, backgroundColor: '#F8FAFC',
    borderRadius: 10, padding: 10, marginTop: 10, alignItems: 'flex-start',
  },
  noticeText: { flex: 1, fontSize: 11.5, color: '#9CA3AF', lineHeight: 16 },
  footnote: { fontSize: 10.5, color: '#9CA3AF', marginTop: 10, lineHeight: 15 },

  memberCard: {
    width: 172, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  avatarText: { fontSize: 13, fontWeight: '800', color: '#15803D' },
  memberName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  memberVillage: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  memberCrops: { fontSize: 11.5, color: '#374151', marginTop: 6, lineHeight: 15 },
  memberCropsEmpty: { fontSize: 11, color: '#9CA3AF', marginTop: 6, fontStyle: 'italic' },
  memberStatRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  memberStatLabel: { fontSize: 10.5, color: '#9CA3AF' },
  memberStatValue: { fontSize: 11.5, fontWeight: '700', color: '#111827' },
  unpaidChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7',
    borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, marginTop: 8, alignSelf: 'flex-start',
  },
  unpaidChipText: { fontSize: 10, fontWeight: '700', color: '#B45309' },
  trustBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999,
    paddingHorizontal: 7, paddingVertical: 3, marginTop: 8, alignSelf: 'flex-start',
  },
  trustBadgeText: { fontSize: 10, fontWeight: '700' },

  demandRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  demandWant: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  demandBuyer: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  demandMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  demandDist: { fontSize: 11.5, fontWeight: '700', color: '#15803D' },

  statRow: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9',
  },
  statNum: { fontSize: 15, fontWeight: '900', color: '#15803D' },
  statLabel: { fontSize: 9, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.4, marginTop: 3, textAlign: 'center' },

  runRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 11, marginTop: 7,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  runTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  runChip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginTop: 4 },
  runChipText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  runVehicle: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase' },

  modeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginBottom: 10,
  },
  modeChipFac: { backgroundColor: '#DCFCE7' },
  modeChipProc: { backgroundColor: '#DBEAFE' },
  modeChipText: { fontSize: 10.5, fontWeight: '800' },

  gapBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 12, padding: 11, marginTop: 10,
  },
  gapText: { flex: 1, fontSize: 11.5, color: '#92400E', lineHeight: 16 },

  refuseBox: {
    flexDirection: 'row', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 12,
    padding: 12, alignItems: 'flex-start', marginTop: 10,
  },
  refuseBoxText: { flex: 1, fontSize: 12.5, color: '#6B7280', lineHeight: 18 },

  storageOptionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  storageOptionName: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  storageOptionMeta: { fontSize: 11.5, color: '#9CA3AF', marginTop: 2 },
  storageCost: { fontSize: 13, fontWeight: '700', color: '#111827' },
  storageRefused: { fontSize: 11.5, fontWeight: '600', color: '#B91C1C' },
});

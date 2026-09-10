import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, RefreshControl, Alert, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';

// F2, farmer side: the group, and the split it has agreed.
//
// The copy has to keep one thing straight: joining a group does NOT hand over
// your lots. Members sell their own crop at their own price by default. A
// share split is an agreement the group records here so everyone reads the
// same arithmetic — the app does not move money, and saying otherwise would
// be the first step back toward the middleman this whole project removes.
//
// ⚠️ THIS SCREEN SHOWS ORDERS AND EARNINGS WITH THE FPO — IT DOES NOT SELL.
// REPORTED DIRECTLY: selling now happens once, as a fork at harvest time
// (`HarvestPostModal` — "Open Market" vs "Sell to my FPO"), not as a second
// action later on an already-posted listing. Duplicating a sell control here
// re-created the exact confusion that fork exists to remove. This screen's
// job under procurement mode is purely informational: what has this farmer
// actually sold to the group, and what has it paid — from real
// `FpoProcurement` records, never a generic score.
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function FpoScreen({ route, navigation }) {
  const { lang, t } = useLanguage();
  const { userData } = route.params || {};
  const uid = userData?.uid || userData?.firebaseUid;

  const [fpo, setFpo] = useState(null);
  const [nearby, setNearby] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [village, setVillage] = useState('');
  const [regNumber, setRegNumber] = useState('');

  const [sharesOpen, setSharesOpen] = useState(false);
  const [draft, setDraft] = useState({});    // farmerUid -> string

  // Admin-only: farmers waiting to be let into THIS group.
  const [pendingMembers, setPendingMembers] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingActionUid, setPendingActionUid] = useState(null);

  // ── Orders & earnings with this group — read-only. `procData` (fetched
  // only under procurement mode) carries this farmer's own real past sales
  // to THIS group and what it owes/has paid. See backend/models/FpoProcurement.js.
  const [procData, setProcData] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const mine = await axios.get(`${API_ENDPOINTS.FPOS}/mine`);
      const g = mine.data?.fpo || null;
      setFpo(g);
      if (!g) {
        const n = await axios.get(`${API_ENDPOINTS.FPOS}/nearby`).catch(() => null);
        setNearby(n?.data?.fpos || []);
        return;
      }
      if (g.isAdmin) fetchPending(g._id);

      if (g.paymentMode === 'procurement') {
        axios.get(`${API_ENDPOINTS.FPOS}/${g._id}/procurement/mine`)
          .then((r) => { if (r.data?.success) setProcData(r.data); })
          .catch(() => setProcData(null));
      } else {
        setProcData(null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid]);

  const fetchPending = useCallback(async (fpoId) => {
    setPendingLoading(true);
    try {
      const r = await axios.get(`${API_ENDPOINTS.FPOS}/${fpoId}/members/pending`);
      setPendingMembers(r.data?.pending || []);
    } catch (e) {
      setPendingMembers([]);
    } finally {
      setPendingLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const approveMember = async (memberUid) => {
    setPendingActionUid(memberUid);
    try {
      await axios.post(`${API_ENDPOINTS.FPOS}/${fpo._id}/members/${memberUid}/approve`);
      fetchPending(fpo._id);
      fetchAll();
    } catch (e) {
      Alert.alert(t('fpo.couldNotApprove'), e.response?.data?.error || t('fpo.tryAgain'));
    } finally {
      setPendingActionUid(null);
    }
  };

  const rejectMember = async (memberUid) => {
    setPendingActionUid(memberUid);
    try {
      await axios.post(`${API_ENDPOINTS.FPOS}/${fpo._id}/members/${memberUid}/reject`);
      fetchPending(fpo._id);
    } catch (e) {
      Alert.alert(t('fpo.couldNotReject'), e.response?.data?.error || t('fpo.tryAgain'));
    } finally {
      setPendingActionUid(null);
    }
  };

  const create = async () => {
    if (!name.trim()) return Alert.alert(t('fpo.nameItTitle'), t('fpo.nameItMsg'));
    setBusy(true);
    try {
      const r = await axios.post(API_ENDPOINTS.FPOS, {
        name: name.trim(), village: village.trim(), regNumber: regNumber.trim(),
      });
      if (r.data.success) {
        setCreateOpen(false); setName(''); setVillage(''); setRegNumber('');
        fetchAll();
      }
    } catch (e) {
      Alert.alert(t('fpo.couldNotCreate'), e.response?.data?.error || t('fpo.tryAgain'));
    } finally { setBusy(false); }
  };

  const join = (g) =>
    Alert.alert(
      `${t('fpo.joinPrefix')} ${g.name}?`,
      t('fpo.joinMsg'),
      [{ text: t('fpo.cancel'), style: 'cancel' }, {
        text: t('fpo.join'),
        onPress: async () => {
          try {
            await axios.post(`${API_ENDPOINTS.FPOS}/${g._id}/join`);
            fetchAll();
          } catch (e) {
            Alert.alert(t('fpo.couldNotJoin'), e.response?.data?.error || t('fpo.tryAgain'));
          }
        },
      }]);

  const leave = () =>
    Alert.alert(t('fpo.leaveDialogTitle'), t('fpo.leaveDialogMsg'),
      [{ text: t('fpo.stay'), style: 'cancel' }, {
        text: t('fpo.leaveConfirmBtn'), style: 'destructive',
        onPress: async () => {
          try {
            await axios.post(`${API_ENDPOINTS.FPOS}/${fpo._id}/leave`);
            fetchAll();
          } catch (e) {
            Alert.alert(t('fpo.couldNotLeave'), e.response?.data?.error || t('fpo.tryAgain'));
          }
        },
      }]);

  const openShares = () => {
    const d = {};
    (fpo.members || []).forEach((m) => {
      d[m.farmerUid] = m.sharePct != null ? String(m.sharePct) : '';
    });
    setDraft(d);
    setSharesOpen(true);
  };

  const draftTotal = Object.values(draft)
    .reduce((a, v) => a + (parseFloat(v) || 0), 0);

  const saveShares = async () => {
    setBusy(true);
    try {
      const r = await axios.put(`${API_ENDPOINTS.FPOS}/${fpo._id}/shares`, {
        shares: (fpo.members || []).map((m) => ({
          farmerUid: m.farmerUid, sharePct: parseFloat(draft[m.farmerUid]) || 0,
        })),
      });
      if (r.data.success) { setSharesOpen(false); fetchAll(); }
    } catch (e) {
      Alert.alert(t('fpo.couldNotSave'), e.response?.data?.error || t('fpo.tryAgain'));
    } finally { setBusy(false); }
  };

  const clearShares = () =>
    Alert.alert(t('fpo.removeSplitTitle'), t('fpo.removeSplitMsg'),
      [{ text: t('fpo.cancel'), style: 'cancel' }, {
        text: t('fpo.remove'),
        onPress: async () => {
          try {
            await axios.delete(`${API_ENDPOINTS.FPOS}/${fpo._id}/shares`);
            setSharesOpen(false);
            fetchAll();
          } catch (e) {
            Alert.alert(t('fpo.couldNotRemove'), e.response?.data?.error || t('fpo.tryAgain'));
          }
        },
      }]);

  if (loading) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;

  // ── no group yet ────────────────────────────────────────────────────
  if (!fpo) {
    return (
      <View style={s.container}>
        <FlatList
          data={nearby}
          keyExtractor={(i) => String(i._id)}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor="#16A34A"
            onRefresh={() => { setRefreshing(true); fetchAll(); }} />}
          ListHeaderComponent={
            <View style={s.intro}>
              <Text style={s.introTitle}>{t('fpo.introTitle')}</Text>
              <Text style={s.introText}>{t('fpo.introText1')}</Text>
              <Text style={s.introText}>{t('fpo.introText2')}</Text>

              <TouchableOpacity
                style={s.registryCard}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('FpoRegistry', { userData })}
              >
                <View style={s.registryIcon}>
                  <Ionicons name="business-outline" size={20} color="#15803D" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.registryTitle}>{t('fpo.findRealFpoTitle')}</Text>
                  <Text style={s.registrySub}>{t('fpo.findRealFpoSub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </TouchableOpacity>

              {nearby.length > 0 && <Text style={s.sectionLabel}>{t('fpo.groupsInDistrict')}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => join(item)} activeOpacity={0.85}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{item.name}</Text>
                <Text style={s.cardMeta}>
                  {item.memberCount} {item.memberCount > 1 ? t('fpo.memberPlural') : t('fpo.memberSingular')}
                  {item.village ? ` · ${item.village}` : ''} · {t('fpo.startedBy')} {item.adminName}
                </Text>

                {/* ── WHAT THIS GROUP DEALS IN, BEFORE THE FARMER ASKS ─────
                    The point of showing it here rather than only to the admin:
                    a farmer who can see that the Niphad group deals in onion
                    and the Sangli one in grapes picks the right group first
                    time, instead of waiting a week for a rejection whose
                    reason nobody wrote down.

                    ⚠️ THE LIST IS NOT FILTERED, SORTED OR RE-ORDERED BY THE
                    MATCH, and every group stays joinable. `cropMatch` is
                    information the farmer acts on; a screen that hid or sank
                    the non-matching groups would be enforcing an FPO's stated
                    preference as a rule, which the server deliberately does
                    not do (routes/fpos.js computes the match AFTER recording
                    the join). Only the two statuses that mean something to a
                    farmer are rendered — `no_focus_declared` and
                    `farmer_crops_unknown` are absences, and printing "we could
                    not tell" on every row is noise, not honesty. */}
                {(item.focusCrops || []).length > 0 && (
                  <View style={s.focusWrap}>
                    {item.focusCrops.map((c) => (
                      <View
                        key={c}
                        style={[
                          s.focusChip,
                          (item.cropMatch?.matched || []).includes(c) && s.focusChipOn,
                        ]}
                      >
                        <Text
                          style={[
                            s.focusChipText,
                            (item.cropMatch?.matched || []).includes(c) && s.focusChipTextOn,
                          ]}
                        >
                          {c}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                {item.cropMatch?.status === 'mismatch' && (
                  <Text style={s.matchWarn}>{t('fpo.cropMismatchHint')}</Text>
                )}
                {item.cropMatch?.status === 'match' && (
                  <Text style={s.matchGood}>{t('fpo.cropMatchHint')}</Text>
                )}
              </View>
              <Text style={s.joinText}>{t('fpo.join')}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={s.emptyIcon}><Ionicons name="people-outline" size={32} color="#16A34A" /></View>
              <Text style={s.emptyTitle}>{t('fpo.noGroupsYet')}</Text>
              <Text style={s.emptySub}>{t('fpo.startOneHint')}</Text>
            </View>
          }
        />
        <TouchableOpacity style={s.fab} onPress={() => setCreateOpen(true)} activeOpacity={0.85}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={s.fabText}>{t('fpo.startGroup')}</Text>
        </TouchableOpacity>

        <Modal visible={createOpen} transparent animationType="slide"
          onRequestClose={() => setCreateOpen(false)}>
          <View style={s.sheetWrap}>
            <View style={s.sheet}>
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle}>{t('fpo.startGroup')}</Text>
                <TouchableOpacity onPress={() => setCreateOpen(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <Text style={s.label}>{t('fpo.groupNameLabel')} <Text style={s.req}>*</Text></Text>
              <TextInput style={s.input} value={name} onChangeText={setName}
                placeholder={t('fpo.groupNamePlaceholder')} placeholderTextColor="#9CA3AF" />
              <Text style={s.label}>{t('fpo.villageLabel')}</Text>
              <TextInput style={s.input} value={village} onChangeText={setVillage}
                placeholder={t('fpo.villagePlaceholder')} placeholderTextColor="#9CA3AF" />
              <Text style={s.label}>{t('fpo.regNumberLabel')}</Text>
              <TextInput style={s.input} value={regNumber} onChangeText={setRegNumber}
                placeholder={t('fpo.regNumberPlaceholder')} placeholderTextColor="#9CA3AF" />
              <Text style={s.hint}>{t('fpo.regNumberHint')}</Text>
              <TouchableOpacity style={[s.cta, busy && { opacity: 0.6 }]} onPress={create} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" />
                  : <><Ionicons name="people-outline" size={17} color="#fff" />
                      <Text style={s.ctaText}>{t('fpo.createGroup')}</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── in a group ──────────────────────────────────────────────────────
  const sharesSet = (fpo.members || []).every((m) => typeof m.sharePct === 'number');

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor="#16A34A"
          onRefresh={() => { setRefreshing(true); fetchAll(); }} />}>

        <View style={s.card}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{fpo.name}</Text>
            <Text style={s.cardMeta}>
              {fpo.members.length} {t('fpo.memberPlural')}{fpo.village ? ` · ${fpo.village}` : ''}
              {fpo.district ? ` · ${fpo.district}` : ''}
            </Text>
            {!!fpo.regNumber && (
              <Text style={s.regNote}>{t('fpo.regPrefix')} {fpo.regNumber} {t('fpo.onFileNotVerified')}</Text>
            )}
          </View>
        </View>

        {/* ⚠️ THIS IS THE WHOLE GROUP'S OPEN-MARKET INVENTORY, NOT THIS
            FARMER'S OWN AND NOT PROCUREMENT — REPORTED AS CONFUSING WITH NO
            CONTEXT. It sums every active member's own available CropListing
            (GET /api/fpos/mine), which is a different question from "orders
            with this FPO" below. Kept because it is real, useful data (how
            much the group collectively has for sale right now) — labelled
            and captioned so it reads as group-wide market stock, not as
            something this farmer personally sold or is owed. */}
        <View style={s.statRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{fpo.liveListings ?? 0}</Text>
            <Text style={s.statLabel}>{t('fpo.lotsOnMarket')}</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statNum}>{(fpo.totalKgOnMarket ?? 0).toLocaleString('en-IN')}</Text>
            <Text style={s.statLabel}>{t('fpo.kgAvailable')}</Text>
          </View>
        </View>
        <Text style={s.statCaption}>{t('fpo.statCaption')}</Text>

        {fpo.isAdmin && (
          <TouchableOpacity
            style={s.dashboardCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('FpoDashboard', { userData, fpoId: fpo._id })}
          >
            <View style={s.dashboardIcon}>
              <Ionicons name="stats-chart-outline" size={20} color="#15803D" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.dashboardTitle}>{t('fpo.viewDashboardTitle')}</Text>
              <Text style={s.dashboardSub}>{t('fpo.viewDashboardSub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}

        {/* F2 — EVERY member, admin or not, may see their own settlement. This
            is deliberately separate from the procurement card below: that one
            reads FpoProcurement's own dedicated harvest-time flow, this one
            covers a pooled lot sale AND an F1 walk-in-intake sale, under
            EITHER payment mode. */}
        <TouchableOpacity
          style={[s.dashboardCard, { marginTop: 10 }]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('FpoMySettlement', { userData, fpoId: fpo._id })}
        >
          <View style={s.dashboardIcon}>
            <Ionicons name="receipt-outline" size={20} color="#15803D" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.dashboardTitle}>{t('fpo.mySettlementTitle')}</Text>
            <Text style={s.dashboardSub}>{t('fpo.mySettlementSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        {/* ── ORDERS & EARNINGS WITH THIS FPO — read-only. Selling itself
            happens once, at harvest time (HarvestPostModal's "Open Market"
            vs "Sell to my FPO" fork). This card only ever reports what has
            already happened: real FpoProcurement records, never a score. */}
        {fpo.paymentMode === 'procurement' && (
          <View style={s.card}>
            <View style={{ flex: 1 }}>
              <Text style={s.sectionTitle}>{t('fpo.ordersWithFpo').replace('{fpo}', fpo.name)}</Text>

              {!procData || procData.totals.count === 0 ? (
                <Text style={s.splitText}>{t('fpo.noOrdersYet')}</Text>
              ) : (
                <>
                  <View style={s.earningsRow}>
                    <View style={s.earningsStat}>
                      <Text style={s.earningsNum}>{procData.totals.count}</Text>
                      <Text style={s.earningsLabel}>{t('fpo.ordersLabel')}</Text>
                    </View>
                    <View style={s.earningsStat}>
                      <Text style={s.earningsNum}>{money(procData.totals.totalOwed)}</Text>
                      <Text style={s.earningsLabel}>{t('fpo.totalEarnedLabel')}</Text>
                    </View>
                    <View style={s.earningsStat}>
                      <Text style={[s.earningsNum, procData.totals.unpaidCount > 0 && { color: '#B45309' }]}>
                        {money(procData.totals.totalPaid)}
                      </Text>
                      <Text style={s.earningsLabel}>{t('fpo.paidLabel')}</Text>
                    </View>
                  </View>
                  {procData.totals.unpaidCount > 0 && (
                    <Text style={[s.historyLine, { color: '#B45309', fontWeight: '700', marginTop: 10 }]}>
                      {t('fpo.unpaidOrdersHint').replace('{n}', procData.totals.unpaidCount)}
                    </Text>
                  )}
                  {procData.sales.map((sale) => (
                    <View key={sale._id} style={s.saleRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.saleCrop}>
                          {sale.cropName}{sale.grade ? ` · ${t('farmerMarket.grade')} ${sale.grade}` : ''}
                        </Text>
                        <Text style={s.saleMeta}>
                          {sale.quantityKg} {t('farmerMarket.kg')} × ₹{sale.ratePerKg}{t('farmerMarket.perKg')}
                          {' · '}{new Date(sale.soldAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.saleAmount}>{money(sale.amountOwed)}</Text>
                        <Text style={[s.salePaid, sale.payment?.paid ? s.salePaidYes : s.salePaidNo]}>
                          {sale.payment?.paid ? t('fpo.paidTag') : t('fpo.unpaidTag')}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          </View>
        )}

        {fpo.isAdmin && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>{t('fpo.pendingRequestsTitle')}</Text>
            {pendingLoading ? (
              <ActivityIndicator color="#16A34A" style={{ marginTop: 8 }} />
            ) : pendingMembers.length === 0 ? (
              <Text style={s.splitText}>{t('fpo.noPendingRequests')}</Text>
            ) : (
              pendingMembers.map((m) => (
                <View key={m.farmerUid} style={s.pendingRow}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>{(m.farmerName || '?')[0].toUpperCase()}</Text>
                  </View>
                  <Text style={[s.memberName, { flex: 1 }]}>{m.farmerName}</Text>
                  <View style={s.pendingBtns}>
                    <TouchableOpacity
                      style={s.approveBtn}
                      onPress={() => approveMember(m.farmerUid)}
                      disabled={pendingActionUid === m.farmerUid}
                    >
                      {pendingActionUid === m.farmerUid
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Ionicons name="checkmark" size={16} color="#fff" />}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.rejectBtn}
                      onPress={() => rejectMember(m.farmerUid)}
                      disabled={pendingActionUid === m.farmerUid}
                    >
                      <Ionicons name="close" size={16} color="#B91C1C" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <View style={s.card}>
          <Text style={s.sectionTitle}>{t('fpo.membersTitle')}</Text>
          {fpo.members.map((m) => (
            <View key={m.farmerUid} style={s.memberRow}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{(m.farmerName || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.memberName}>
                  {m.farmerName}{m.farmerUid === uid ? t('fpo.youSuffix') : ''}
                </Text>
                {m.farmerUid === fpo.adminUid && <Text style={s.adminTag}>{t('fpo.startedGroup')}</Text>}
              </View>
              {typeof m.sharePct === 'number' && (
                <Text style={s.sharePct}>{m.sharePct}%</Text>
              )}
            </View>
          ))}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>{t('fpo.revenueSplitTitle')}</Text>
          {sharesSet ? (
            <Text style={s.splitText}>{t('fpo.splitAgreedText')}</Text>
          ) : (
            <Text style={s.splitText}>{t('fpo.splitNotAgreedText')}</Text>
          )}
          <View style={s.noticeRow}>
            <Ionicons name="information-circle-outline" size={15} color="#9CA3AF" />
            <Text style={s.noticeText}>{t('fpo.recordsNotice')}</Text>
          </View>
          {fpo.isAdmin && (
            <TouchableOpacity style={s.secondary} onPress={openShares}>
              <Ionicons name="pie-chart-outline" size={16} color="#15803D" />
              <Text style={s.secondaryText}>
                {sharesSet ? t('fpo.changeSplit') : t('fpo.recordSplit')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={s.leave} onPress={leave}>
          <Text style={s.leaveText}>{t('fpo.leaveThisGroup')}</Text>
        </TouchableOpacity>
        <View style={{ height: 20 }} />
      </ScrollView>

      <Modal visible={sharesOpen} transparent animationType="slide"
        onRequestClose={() => setSharesOpen(false)}>
        <View style={s.sheetWrap}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>{t('fpo.revenueSplitTitle')}</Text>
              <TouchableOpacity onPress={() => setSharesOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={s.sheetSub}>{t('fpo.sharesMustAdd')}</Text>

            {fpo.members.map((m) => (
              <View key={m.farmerUid} style={s.shareRow}>
                <Text style={s.shareName}>{m.farmerName}</Text>
                <TextInput
                  style={s.shareInput}
                  value={draft[m.farmerUid] ?? ''}
                  onChangeText={(v) => setDraft((d) => ({ ...d, [m.farmerUid]: v }))}
                  keyboardType="numeric" placeholder="0" placeholderTextColor="#D1D5DB"
                />
                <Text style={s.sharePctSign}>%</Text>
              </View>
            ))}

            <View style={[s.totalRow, Math.abs(draftTotal - 100) > 0.5 && s.totalBad]}>
              <Text style={[s.totalText, Math.abs(draftTotal - 100) > 0.5 && { color: '#B45309' }]}>
                {t('fpo.totalLabel')} {Math.round(draftTotal * 100) / 100}%
                {Math.abs(draftTotal - 100) > 0.5 ? ` ${t('fpo.mustBe100')}` : ' ✓'}
              </Text>
            </View>

            <TouchableOpacity
              style={[s.cta, (busy || Math.abs(draftTotal - 100) > 0.5) && { opacity: 0.5 }]}
              onPress={saveShares}
              disabled={busy || Math.abs(draftTotal - 100) > 0.5}>
              {busy ? <ActivityIndicator color="#fff" />
                : <Text style={s.ctaText}>{t('fpo.saveSplit')}</Text>}
            </TouchableOpacity>

            {sharesSet && (
              <TouchableOpacity style={s.clear} onPress={clearShares}>
                <Text style={s.clearText}>{t('fpo.removeSplitBtn')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  list: { padding: 16, gap: 12, paddingBottom: 100 },

  intro: { paddingBottom: 4 },
  introTitle: { fontSize: 19, fontWeight: '800', color: '#111827' },
  introText: { fontSize: 13.5, color: '#6B7280', marginTop: 7, lineHeight: 20 },
  registryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderRadius: 16, padding: 14, marginTop: 16, borderWidth: 1, borderColor: '#F1F5F9',
  },
  registryIcon: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center',
  },
  registryTitle: { fontSize: 14.5, fontWeight: '700', color: '#111827' },
  registrySub: { fontSize: 12, color: '#6B7280', marginTop: 2, lineHeight: 16 },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: '#9CA3AF',
    letterSpacing: 0.6, marginTop: 20, marginBottom: 2,
  },

  card: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 18,
    padding: 16, borderWidth: 1, borderColor: '#F1F5F9', alignItems: 'center',
  },
  cardTitle: { fontSize: 16.5, fontWeight: '700', color: '#111827' },
  cardMeta: { fontSize: 12.5, color: '#6B7280', marginTop: 3 },
  focusWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  focusChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  // A crop the farmer actually grows is picked out, so the match reads at a
  // glance without a verdict label on every row.
  focusChipOn: { backgroundColor: '#DCFCE7' },
  focusChipText: { fontSize: 10, color: '#6B7280', fontWeight: '600' },
  focusChipTextOn: { color: '#15803D' },
  matchWarn: { fontSize: 11, color: '#B45309', marginTop: 6, lineHeight: 16 },
  matchGood: { fontSize: 11, color: '#15803D', marginTop: 6, lineHeight: 16 },
  regNote: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  joinText: { fontSize: 14, fontWeight: '700', color: '#16A34A' },

  dashboardCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#F1F5F9',
  },
  dashboardIcon: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center',
  },
  dashboardTitle: { fontSize: 14.5, fontWeight: '700', color: '#111827' },
  dashboardSub: { fontSize: 12, color: '#6B7280', marginTop: 2, lineHeight: 16 },

  statRow: { flexDirection: 'row', gap: 12 },
  stat: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#F1F5F9', alignItems: 'center',
  },
  statNum: { fontSize: 22, fontWeight: '900', color: '#15803D' },
  statLabel: { fontSize: 9.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5, marginTop: 3 },
  statCaption: { fontSize: 11, color: '#9CA3AF', lineHeight: 15, marginTop: -4, paddingHorizontal: 2 },

  sectionTitle: {
    fontSize: 10.5, fontWeight: '800', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 7 },
  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '800', color: '#15803D' },
  memberName: { fontSize: 14.5, fontWeight: '600', color: '#111827' },
  adminTag: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  sharePct: { fontSize: 15, fontWeight: '800', color: '#15803D' },

  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 7 },
  pendingBtns: { flexDirection: 'row', gap: 8 },
  approveBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#16A34A',
    alignItems: 'center', justifyContent: 'center',
  },
  rejectBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#FEE2E2',
    alignItems: 'center', justifyContent: 'center',
  },

  splitText: { fontSize: 13, color: '#6B7280', lineHeight: 19 },
  noticeRow: {
    flexDirection: 'row', gap: 7, backgroundColor: '#F8FAFC',
    borderRadius: 10, padding: 10, marginTop: 10,
  },
  noticeText: { flex: 1, fontSize: 11.5, color: '#9CA3AF', lineHeight: 16 },
  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#DCFCE7', borderRadius: 12, paddingVertical: 12, marginTop: 12,
  },
  secondaryText: { color: '#15803D', fontSize: 14, fontWeight: '700' },

  leave: { alignItems: 'center', paddingVertical: 14 },
  leaveText: { fontSize: 13.5, color: '#B91C1C', fontWeight: '600' },

  emptyWrap: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 5 },

  fab: {
    position: 'absolute', left: 16, right: 16, bottom: 22,
    backgroundColor: '#16A34A', borderRadius: 16, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  fabText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  sheetWrap: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: '#111827' },
  sheetSub: { fontSize: 13, color: '#6B7280', marginTop: 3, marginBottom: 10 },

  label: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginTop: 14, marginBottom: 6 },
  req: { color: '#DC2626' },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827',
  },
  hint: { fontSize: 11, color: '#9CA3AF', marginTop: 7, lineHeight: 16 },

  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  shareName: { flex: 1, fontSize: 14.5, color: '#111827', fontWeight: '600' },
  shareInput: {
    width: 80, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingVertical: 9, fontSize: 16, fontWeight: '700',
    color: '#111827', textAlign: 'center',
  },
  sharePctSign: { fontSize: 15, color: '#9CA3AF', width: 14 },
  totalRow: { backgroundColor: '#DCFCE7', borderRadius: 10, padding: 10, marginTop: 14, alignItems: 'center' },
  totalBad: { backgroundColor: '#FEF3C7' },
  totalText: { fontSize: 13.5, fontWeight: '700', color: '#15803D' },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 15, marginTop: 16,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  clear: { alignItems: 'center', paddingVertical: 13 },
  clearText: { fontSize: 13, color: '#B91C1C', fontWeight: '600' },

  // ── Orders & earnings with this FPO ──
  historyLine: { fontSize: 12.5, color: '#374151', marginTop: 2 },
  earningsRow: {
    flexDirection: 'row', gap: 8, marginTop: 4,
  },
  earningsStat: {
    flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9',
  },
  earningsNum: { fontSize: 15, fontWeight: '800', color: '#15803D' },
  earningsLabel: { fontSize: 8.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.4, marginTop: 3 },

  saleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 4,
  },
  saleCrop: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  saleMeta: { fontSize: 11.5, color: '#6B7280', marginTop: 2 },
  saleAmount: { fontSize: 14, fontWeight: '800', color: '#111827' },
  salePaid: { fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  salePaidYes: { color: '#15803D' },
  salePaidNo: { color: '#B45309' },
});

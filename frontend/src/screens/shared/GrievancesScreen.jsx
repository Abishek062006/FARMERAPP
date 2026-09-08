import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, RefreshControl, Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_ENDPOINTS } from '../../utils/config';
import usePolling from '../../hooks/usePolling';
import { useLanguage } from '../../i18n/LanguageContext';

// C4, the half that was missing: reading and answering grievances.
//
// Raising one already worked from the receipt screen. Everything after that —
// seeing what was raised, answering an accusation, agreeing an outcome — had no
// UI at all. A farmer accused of short-weighting could be told about it and
// have no way to reply, which is worse than having no dispute system: it
// records one side of a story and calls it a record.
// Label maps are built from `t()` at render time (inside the component) since
// they depend on the active language — see buildReasonLabel/buildStatus/buildOutcomes below.
const buildReasonLabel = (t) => ({
  quality_not_as_described: t('grievances.reason.qualityNotAsDescribed'),
  quantity_short: t('grievances.reason.quantityShort'),
  wrong_crop: t('grievances.reason.wrongCrop'),
  damaged_in_transit: t('grievances.reason.damagedInTransit'),
  not_delivered: t('grievances.reason.notDelivered'),
  payment_not_received: t('grievances.reason.paymentNotReceived'),
  payment_disputed: t('grievances.reason.paymentDisputed'),
  other: t('grievances.reason.other'),
});

const buildStatus = (t) => ({
  open:      { label: t('grievances.status.open'),      bg: '#FEF3C7', fg: '#B45309' },
  responded: { label: t('grievances.status.responded'), bg: '#DBEAFE', fg: '#1D4ED8' },
  resolved:  { label: t('grievances.status.resolved'),  bg: '#DCFCE7', fg: '#15803D' },
  rejected:  { label: t('grievances.status.rejected'),  bg: '#FEE2E2', fg: '#B91C1C' },
  withdrawn: { label: t('grievances.status.withdrawn'), bg: '#F1F5F9', fg: '#6B7280' },
});

const buildOutcomes = (t) => [
  ['refund_agreed',         t('grievances.outcome.refundAgreed')],
  ['partial_refund_agreed', t('grievances.outcome.partialRefundAgreed')],
  ['replacement_agreed',    t('grievances.outcome.replacementAgreed')],
  ['no_action',              t('grievances.outcome.noAction')],
  ['none',                   t('grievances.outcome.none')],
];

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function GrievancesScreen() {
  const { t } = useLanguage();
  const REASON_LABEL = buildReasonLabel(t);
  const STATUS = buildStatus(t);
  const OUTCOMES = buildOutcomes(t);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);

  const [replyTo, setReplyTo] = useState(null);
  const [reply, setReply] = useState('');
  const [settleFor, setSettleFor] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sharing, setSharing] = useState(null);   // dispute id mid-export

  const fetchAll = useCallback(async () => {
    try {
      const r = await axios.get(`${API_ENDPOINTS.DISPUTES}/mine`);
      if (r.data.success) setItems(r.data.disputes);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  usePolling(fetchAll, 12000, true);

  const act = async (d, action, body) => {
    setBusy(d._id);
    try {
      const r = await axios.put(`${API_ENDPOINTS.DISPUTES}/${d._id}/${action}`, body || {});
      if (r.data.success) {
        setItems((prev) => prev.map((x) =>
          x._id === d._id ? { ...r.data.dispute, iRaised: x.iRaised } : x));
      }
    } catch (e) {
      Alert.alert(t('grievances.alert.updateFailedTitle'), e.response?.data?.error || t('grievances.alert.tryAgain'));
      fetchAll();
    } finally {
      setBusy(null);
    }
  };

  // ── THE RECORD, OUT OF THE APP ──────────────────────────────────────────
  //
  // ⚠️ THIS APP DOES NOT DECIDE WHO IS RIGHT, and it is not going to. What it
  // can do is hand whoever DOES decide everything it actually recorded: who
  // stood at the gate, how the weight was established, what the lot looked
  // like, whether the farmer conceded a grade, when money was promised and when
  // it arrived — and, just as importantly, what was never recorded at all.
  //
  // It leaves through the OS share sheet rather than a download, the same road
  // the CSV export already takes: Expo Go cannot write to Downloads, and the
  // endpoint is authenticated so a plain browser link would arrive without a
  // token. The person who needs this — an APMC officer, the group's secretary,
  // an elder both sides trust — has no account here, and that is the point.
  const shareRecord = async (d) => {
    setSharing(d._id);
    try {
      const res = await axios.get(`${API_ENDPOINTS.DISPUTES}/${d._id}/evidence.txt`,
        { responseType: 'text' });
      const name = `grievance-${String(d._id).slice(-6)}.txt`;
      const uri = `${FileSystem.cacheDirectory}${name}`;
      await FileSystem.writeAsStringAsync(uri, res.data, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'text/plain',
          dialogTitle: t('grievances.shareDialogTitle'),
          UTI: 'public.plain-text',
        });
      } else {
        Alert.alert(t('grievances.shareSavedTitle'), name);
      }
    } catch (e) {
      Alert.alert(t('grievances.shareFailedTitle'), e.response?.data?.error || t('fpo.tryAgain'));
    } finally {
      setSharing(null);
    }
  };

  const sendReply = () => {
    if (!reply.trim()) return Alert.alert(t('grievances.alert.writeSomethingTitle'), t('grievances.alert.writeSomethingMsg'));
    const d = replyTo;
    setReplyTo(null);
    act(d, 'respond', { response: reply.trim() });
    setReply('');
  };

  const sendSettle = () => {
    if (!outcome) return Alert.alert(t('grievances.alert.pickOutcomeTitle'), t('grievances.alert.pickOutcomeMsg'));
    const d = settleFor;
    setSettleFor(null);
    act(d, 'resolve', {
      outcome,
      amount: amount ? parseFloat(amount) : null,
      note: note.trim(),
    });
    setOutcome(null); setAmount(''); setNote('');
  };

  const withdraw = (d) =>
    Alert.alert(t('grievances.alert.withdrawTitle'), t('grievances.alert.withdrawMsg'),
      [{ text: t('grievances.cancel'), style: 'cancel' },
       { text: t('grievances.withdraw'), style: 'destructive', onPress: () => act(d, 'withdraw') }]);

  const Card = ({ item }) => {
    const st = STATUS[item.status] || STATUS.open;
    const live = ['open', 'responded'].includes(item.status);
    const working = busy === item._id;

    // Who may act, derived exactly as the server derives it.
    const canRespond = live && !item.iRaised && item.status === 'open';
    const canSettle = live;
    const canWithdraw = live && item.iRaised;

    return (
      <View style={s.card}>
        <View style={s.topRow}>
          <View style={[s.chip, { backgroundColor: st.bg }]}>
            <Text style={[s.chipText, { color: st.fg }]}>{st.label}</Text>
          </View>
          <Text style={s.date}>
            {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </Text>
        </View>

        <Text style={s.reason}>{REASON_LABEL[item.reason] || item.reason}</Text>
        <Text style={s.against}>
          {item.iRaised
            ? `${t('grievances.youRaisedAgainst')} ${item.againstRole}`
            : `${t('grievances.raisedAgainstYouBy')} ${item.raisedByRole}`}
          {' · '}{item.quantityKg} {t('grievances.kg')} {item.cropName}
        </Text>

        <View style={s.quote}>
          <Text style={s.quoteLabel}>
            {item.iRaised
              ? t('grievances.youSaid')
              : `${t('grievances.theSaidPrefix')} ${item.raisedByRole.toUpperCase()} ${t('grievances.saidSuffix')}`.trim()}
          </Text>
          <Text style={s.quoteText}>{item.description}</Text>
        </View>

        {item.photoIds?.length > 0 && (
          <View style={s.photos}>
            {item.photoIds.map((id) => (
              <Image key={String(id)} style={s.photo}
                source={{ uri: API_ENDPOINTS.LISTING_PHOTO(id) }} />
            ))}
          </View>
        )}

        {!!item.response && (
          <View style={[s.quote, s.quoteReply]}>
            <Text style={s.quoteLabel}>{item.iRaised ? t('grievances.theyAnswered') : t('grievances.youAnswered')}</Text>
            <Text style={s.quoteText}>{item.response}</Text>
          </View>
        )}

        {item.status === 'resolved' && (
          <View style={s.settled}>
            <Ionicons name="checkmark-circle" size={16} color="#15803D" />
            <Text style={s.settledText}>
              {(OUTCOMES.find(([k]) => k === item.resolution?.outcome) || [null, item.resolution?.outcome])[1]}
              {item.resolution?.amount ? ` · ${money(item.resolution.amount)}` : ''}
              {item.resolution?.resolvedByRole ? ` · ${t('grievances.closedByThe')} ${item.resolution.resolvedByRole}` : ''}
            </Text>
          </View>
        )}

        {/* Available on every grievance, open or closed — a settled dispute is
            exactly the one somebody asks for the record of, weeks later. */}
        <TouchableOpacity
          style={s.shareRow}
          disabled={sharing === item._id}
          onPress={() => shareRecord(item)}
        >
          {sharing === item._id
            ? <ActivityIndicator size="small" color="#6B7280" />
            : <Ionicons name="share-outline" size={14} color="#6B7280" />}
          <Text style={s.shareText}>{t('grievances.shareRecord')}</Text>
          <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
        </TouchableOpacity>
        <Text style={s.shareHint}>{t('grievances.shareHint')}</Text>

        {live && (
          <View style={s.actions}>
            {canWithdraw && (
              <TouchableOpacity style={[s.btn, s.btnGhost]} disabled={working}
                onPress={() => withdraw(item)}>
                <Text style={s.btnGhostText}>{t('grievances.withdraw')}</Text>
              </TouchableOpacity>
            )}
            {canRespond && (
              <TouchableOpacity style={[s.btn, s.btnReply]} disabled={working}
                onPress={() => { setReplyTo(item); setReply(''); }}>
                <Text style={s.btnReplyText}>{t('grievances.answer')}</Text>
              </TouchableOpacity>
            )}
            {canSettle && (
              <TouchableOpacity style={[s.btn, s.btnPrimary]} disabled={working}
                onPress={() => { setSettleFor(item); setOutcome(null); setAmount(''); setNote(''); }}>
                {working ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.btnPrimaryText}>{t('grievances.markSettled')}</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;

  return (
    <View style={s.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => String(i._id)}
        renderItem={({ item }) => <Card item={item} />}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor="#16A34A"
          onRefresh={() => { setRefreshing(true); fetchAll(); }} />}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}><Ionicons name="shield-checkmark-outline" size={32} color="#16A34A" /></View>
            <Text style={s.emptyTitle}>{t('grievances.emptyTitle')}</Text>
            <Text style={s.emptySub}>{t('grievances.emptySub')}</Text>
          </View>
        }
      />

      <Modal visible={!!replyTo} transparent animationType="slide" onRequestClose={() => setReplyTo(null)}>
        <View style={s.sheetWrap}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>{t('grievances.yourSideTitle')}</Text>
              <TouchableOpacity onPress={() => setReplyTo(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={s.sheetSub}>
              {replyTo ? REASON_LABEL[replyTo.reason] : ''} · {replyTo?.quantityKg} {t('grievances.kg')} {replyTo?.cropName}
            </Text>
            <TextInput style={[s.input, s.multi]} value={reply} onChangeText={setReply}
              placeholder={t('grievances.replyPlaceholder')} multiline autoFocus
              placeholderTextColor="#9CA3AF" maxLength={1000} />
            <Text style={s.hint}>{t('grievances.replyHint')}</Text>
            <TouchableOpacity style={s.cta} onPress={sendReply}>
              <Text style={s.ctaText}>{t('grievances.sendAnswer')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!settleFor} transparent animationType="slide" onRequestClose={() => setSettleFor(null)}>
        <View style={s.sheetWrap}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>{t('grievances.whatDidYouAgreeTitle')}</Text>
              <TouchableOpacity onPress={() => setSettleFor(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {OUTCOMES.map(([key, label]) => {
              const on = outcome === key;
              return (
                <TouchableOpacity key={key} style={[s.outcome, on && s.outcomeOn]}
                  onPress={() => setOutcome(key)} activeOpacity={0.85}>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'}
                    size={18} color={on ? '#16A34A' : '#D1D5DB'} />
                  <Text style={[s.outcomeText, on && { color: '#111827', fontWeight: '600' }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}

            {(outcome === 'refund_agreed' || outcome === 'partial_refund_agreed') && (
              <>
                <Text style={s.label}>{t('grievances.amountLabel')}</Text>
                <TextInput style={s.input} value={amount} onChangeText={setAmount}
                  keyboardType="numeric" placeholder={t('grievances.amountPlaceholder')} placeholderTextColor="#9CA3AF" />
              </>
            )}

            <Text style={s.label}>{t('grievances.noteLabel')}</Text>
            <TextInput style={s.input} value={note} onChangeText={setNote}
              placeholder={t('grievances.notePlaceholder')} placeholderTextColor="#9CA3AF" maxLength={500} />

            <View style={s.notice}>
              <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
              <Text style={s.noticeText}>{t('grievances.settleNotice')}</Text>
            </View>

            <TouchableOpacity style={s.cta} onPress={sendSettle}>
              <Text style={s.ctaText}>{t('grievances.recordOutcome')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  list: { padding: 16, gap: 12 },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 11, fontWeight: '700' },
  date: { fontSize: 12, color: '#9CA3AF' },
  reason: { fontSize: 16, fontWeight: '700', color: '#111827' },
  against: { fontSize: 12.5, color: '#6B7280', marginTop: 3 },

  quote: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 11, marginTop: 11 },
  quoteReply: { backgroundColor: '#EFF6FF' },
  quoteLabel: { fontSize: 9.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5, marginBottom: 4 },
  quoteText: { fontSize: 13, color: '#374151', lineHeight: 19 },

  photos: { flexDirection: 'row', gap: 8, marginTop: 10 },
  photo: { width: 68, height: 68, borderRadius: 10, backgroundColor: '#F1F5F9' },

  settled: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#DCFCE7', borderRadius: 12, padding: 11, marginTop: 11,
  },
  settledText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: '#15803D' },

  actions: { flexDirection: 'row', gap: 8, marginTop: 13 },
  shareRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  shareText: { flex: 1, fontSize: 12, color: '#6B7280', fontWeight: '600' },
  shareHint: { fontSize: 10, color: '#9CA3AF', lineHeight: 14, marginTop: 3 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', minHeight: 38, justifyContent: 'center' },
  btnGhost: { backgroundColor: '#F1F5F9' },
  btnGhostText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  btnReply: { backgroundColor: '#DBEAFE' },
  btnReplyText: { fontSize: 13, fontWeight: '700', color: '#1D4ED8' },
  btnPrimary: { backgroundColor: '#16A34A' },
  btnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: {
    width: 66, height: 66, borderRadius: 33, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 13,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 13.5, color: '#6B7280', textAlign: 'center', marginTop: 6, lineHeight: 20 },

  sheetWrap: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: '#111827' },
  sheetSub: { fontSize: 13, color: '#6B7280', marginTop: 3, marginBottom: 10 },

  outcome: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#F1F5F9', borderRadius: 12, padding: 11, marginBottom: 7,
  },
  outcomeOn: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  outcomeText: { flex: 1, fontSize: 13.5, color: '#6B7280' },

  label: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginTop: 10, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827',
  },
  multi: { height: 100, textAlignVertical: 'top', marginTop: 4 },
  hint: { fontSize: 11.5, color: '#9CA3AF', marginTop: 7 },

  notice: { flexDirection: 'row', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 14 },
  noticeText: { flex: 1, fontSize: 11.5, color: '#6B7280', lineHeight: 17 },

  cta: {
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 16,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

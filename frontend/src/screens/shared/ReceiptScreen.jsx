import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, Alert, Share, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';

// C5 (transaction record) and C4 (grievance) on one screen.
//
// They belong together: both are things you do AFTER a trade, both are about
// one order, and a farmer who opens a receipt and finds the numbers wrong is
// exactly the person who needs the grievance button. Splitting them would mean
// hunting through two menus for the same order.
// Built from `t()` at render time (inside the component) since it depends on
// the active language.
const buildReasons = (t) => [
  ['quality_not_as_described', t('receipt.reason.qualityNotAsDescribed')],
  ['quantity_short',           t('receipt.reason.quantityShort')],
  ['wrong_crop',               t('receipt.reason.wrongCrop')],
  ['damaged_in_transit',       t('receipt.reason.damagedInTransit')],
  ['not_delivered',            t('receipt.reason.notDelivered')],
  ['payment_not_received',     t('receipt.reason.paymentNotReceived')],
  ['payment_disputed',         t('receipt.reason.paymentDisputed')],
  ['other',                    t('receipt.reason.other')],
];

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// ── The gate record, turned into three plain sentences ────────────────────
//
// Each of these has an ABSENCE case, and the absence is what they exist to say
// out loud: a receipt that simply omitted the line would let silence read as a
// clean result. Labels are reused from the fpoRun.* namespace so the word a
// driver taps at the gate is the word printed here.

const WM_KEY = {
  collection_centre_scale: 'fpoRun.wmCentreTitle',
  public_weighbridge: 'fpoRun.wmBridgeTitle',
  farm_scale: 'fpoRun.wmFarmTitle',
  estimated: 'fpoRun.wmEstTitle',
};

const COND_KEY = {
  wrong_crop: 'fpoRun.condWrongCrop',
  visibly_spoiled: 'fpoRun.condSpoiled',
  sprouting: 'fpoRun.condSprouting',
  wet: 'fpoRun.condWet',
  damaged: 'fpoRun.condDamaged',
  packaging_damaged: 'fpoRun.condPackaging',
};

function weightLine(w, t) {
  // `not_recorded` and an absent block are the same fact and get the same
  // sentence: the app never asked, so nothing at all is claimed.
  if (!w || !w.method || w.method === 'not_recorded') return t('receipt.weightNotRecorded');
  return t(WM_KEY[w.method]) || t('receipt.weightNotRecorded');
}

function conditionLine(c, t) {
  if (!c || !c.checked) return t('receipt.condNobodyLooked');
  if (!(c.flags || []).length) return t('receipt.condLookedFine');
  return `${t('receipt.condReported')} ${c.flags.map((f) => t(COND_KEY[f]) || f).join(', ')}`;
}

const conditionIcon = (c) => {
  if (!c || !c.checked) return 'help-circle-outline';
  return (c.flags || []).length ? 'alert-circle-outline' : 'checkmark-circle-outline';
};

// Slate for "nobody looked". It is an unknown, not a finding — the same reason
// the members screen gives that status a neutral chip.
const conditionColour = (c) => {
  if (!c || !c.checked) return '#9CA3AF';
  return (c.flags || []).length ? '#B45309' : '#15803D';
};

function gradeLine(g, t) {
  if (!g || !g.observed) return t('receipt.gradeNotChecked');
  if (g.downgraded) return `${t('receipt.gradeLower')} ${g.declared} → ${g.observed}`;
  if (g.discrepancy === 'observed_only') return `${t('receipt.gradeObserved')} ${g.observed}`;
  if (g.discrepancy === 'upgrade') return `${t('receipt.gradeHigher')} ${g.declared} → ${g.observed}`;
  return `${t('receipt.gradeMatched')} ${g.observed}`;
}

// Phase 5, R2 — the same receipt object, read differently depending on who
// asked for it. `issuedTo` (farmer | vendor | agent | fpo_admin) has always
// travelled from GET /:id/receipt; nothing on this screen read it before.
const COPY_BADGE_KEY = {
  farmer: 'receipt.copyBadgeFarmer', vendor: 'receipt.copyBadgeVendor',
  agent: 'receipt.copyBadgeAgent', fpo_admin: 'receipt.copyBadgeFpo_admin',
};
const SLIP_TOTAL_KEY = {
  farmer: 'receipt.slipTotalFarmer', vendor: 'receipt.slipTotalVendor',
  agent: 'receipt.slipTotalAgent', fpo_admin: 'receipt.slipTotalFpo_admin',
};
// What each role's own headline figure actually is. A buyer's stake in this
// trade is the full grandTotal; a farmer's or FPO admin's is what the farmer
// nets; a captain's is the fare, never the crop value — reading `grandTotal`
// as "what I'm owed" would tell a driver they earned several times their fare.
const slipTotalFor = (r) => r.issuedTo === 'vendor' ? r.money.grandTotal
  : r.issuedTo === 'agent' ? r.money.collectedByAgent
    : r.money.farmerPayout;

export default function ReceiptScreen({ route, navigation }) {
  const { t } = useLanguage();
  const REASONS = buildReasons(t);
  const { orderId } = route.params || {};

  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [raise, setRaise] = useState(false);
  const [reason, setReason] = useState(null);
  const [desc, setDesc] = useState('');
  const [filing, setFiling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_ENDPOINTS.ORDERS}/${orderId}/receipt`)
      .then((r) => { if (!cancelled && r.data.success) setReceipt(r.data.receipt); })
      .catch((e) => { if (!cancelled) setErr(e.response?.data?.error || 'Could not load this receipt.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId]);

  const shareReceipt = async () => {
    if (!receipt) return;
    const r = receipt;
    const lines = [
      `RECEIPT ${r.receiptNo}`,
      `${r.crop.quantityKg} kg ${r.crop.name}${r.crop.grade ? ` (Grade ${r.crop.grade}, farmer-declared)` : ''}`,
      `₹${r.money.pricePerKg}/kg${r.money.priceSource === 'negotiated' ? ' (negotiated)' : ''}`,
      '',
      `Crop value      ${money(r.money.cropTotal)}`,
      `Transport fare  ${money(r.money.fare)}`,
      `Total           ${money(r.money.grandTotal)}`,
      '',
      `Farmer receives ${money(r.money.farmerPayout)} — ${r.settlement.farmerPaid ? 'PAID' : 'not yet paid'}`,
      r.settlement.txn?.ref ? `Txn ref         ${r.settlement.txn.ref}` : null,
      // Travels with the forwarded copy, not just the on-screen one — the text
      // export is the version that actually reaches an APMC officer.
      r.settlement.txn?.simulated ? '*** DEMONSTRATION PAYMENT — no funds were transferred ***' : null,
      `Driver collects ${money(r.money.collectedByAgent)} (fare only)`,
      '',
      `Farmer: ${r.parties.farmer.name}`,
      `Buyer:  ${r.parties.vendor.company || r.parties.vendor.name}`,
      r.parties.agent ? `Captain: ${r.parties.agent.name}` : null,
    ].filter(Boolean);
    try {
      await Share.share({ message: lines.join('\n') });
    } catch { /* user dismissed */ }
  };

  // C5: the CSV export had an endpoint and no caller. Written to the app's
  // cache directory and handed to the OS share sheet, because Expo Go cannot
  // write to the user's Downloads folder — the share sheet is how a file
  // actually leaves this app.
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      // axios, not a plain link: the endpoint is authenticated and a browser
      // would arrive without the token.
      const res = await axios.get(`${API_ENDPOINTS.ORDERS}/export.csv`, { responseType: 'text' });
      const name = `farmmarket-${new Date().toISOString().slice(0, 10)}.csv`;
      const uri = `${FileSystem.cacheDirectory}${name}`;
      await FileSystem.writeAsStringAsync(uri, res.data, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Your transactions',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert(t('receipt.alert.savedTitle'), `${t('receipt.alert.savedMsgPrefix')} ${name}.`);
      }
    } catch (e) {
      Alert.alert(t('receipt.alert.exportFailedTitle'), e.response?.data?.error || t('receipt.alert.tryAgain'));
    } finally {
      setExporting(false);
    }
  };

  const fileDispute = async () => {
    if (!reason) return Alert.alert(t('receipt.alert.whatWentWrongTitle'), t('receipt.alert.pickReasonMsg'));
    if (!desc.trim()) return Alert.alert(t('receipt.alert.describeItTitle'), t('receipt.alert.describeItMsg'));
    setFiling(true);
    try {
      // multipart, because the endpoint accepts evidence photos on the same
      // route. None are attached here — photos come later from the gallery.
      const fd = new FormData();
      fd.append('orderId', orderId);
      fd.append('reason', reason);
      fd.append('description', desc);
      const r = await axios.post(API_ENDPOINTS.DISPUTES, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (r.data.success) {
        setRaise(false); setReason(null); setDesc('');
        Alert.alert(t('receipt.alert.raisedTitle'), t('receipt.alert.raisedMsg'));
      }
    } catch (e) {
      Alert.alert(t('receipt.alert.raiseFailedTitle'), e.response?.data?.error || t('receipt.alert.tryAgain'));
    } finally {
      setFiling(false);
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;
  if (err) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={38} color="#9CA3AF" />
        <Text style={s.errText}>{err}</Text>
      </View>
    );
  }

  const r = receipt;
  const Row = ({ k, v, strong, muted }) => (
    <View style={s.row}>
      <Text style={[s.rowKey, muted && { color: '#9CA3AF' }]}>{k}</Text>
      <Text style={[s.rowVal, strong && s.rowValStrong]}>{v}</Text>
    </View>
  );

  const SlipRow = ({ k, v, dim }) => (
    <View style={s.slipRow}>
      <Text style={[s.slipK, dim && s.slipDim]} numberOfLines={1}>{k}</Text>
      <Text style={[s.slipV, dim && s.slipDim]}>{v}</Text>
    </View>
  );

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.head}>
          <View style={s.headTop}>
            <Text style={s.no}>{r.receiptNo}</Text>
            {!!COPY_BADGE_KEY[r.issuedTo] && (
              <View style={s.copyBadge}>
                <Text style={s.copyBadgeText}>{t(COPY_BADGE_KEY[r.issuedTo])}</Text>
              </View>
            )}
          </View>
          <Text style={s.status}>{r.status.replace(/_/g, ' ')}</Text>
        </View>

        {/* ══ WAS THIS A FAIR PRICE? ═══════════════════════════════════════
            The agreed rate beside what the district's mandis actually paid.
            ⚠️ It REPORTS, it does not accuse — a price below the band is not
            fraud: grade, urgency and who pays on the day all move a real sale.
            And when there is no mandi data it says SO, rather than leaving a
            blank that reads as "fine". */}
        {!!r.priceCheck && (
          r.priceCheck.available ? (
            <View style={[
              s.pc,
              r.priceCheck.verdict === 'below' ? s.pcBelow
                : r.priceCheck.verdict === 'above' ? s.pcAbove : s.pcWithin,
            ]}>
              <View style={s.pcHead}>
                <Ionicons
                  name={r.priceCheck.verdict === 'below' ? 'trending-down-outline'
                    : r.priceCheck.verdict === 'above' ? 'trending-up-outline' : 'checkmark-circle-outline'}
                  size={16}
                  color={r.priceCheck.verdict === 'below' ? '#B91C1C' : '#15803D'}
                />
                <Text style={[s.pcTitle, r.priceCheck.verdict === 'below' && { color: '#B91C1C' }]}>
                  {r.priceCheck.verdict === 'below' ? 'Below the mandi rate'
                    : r.priceCheck.verdict === 'above' ? 'Above the mandi rate'
                      : 'In line with the mandi rate'}
                </Text>
              </View>
              <View style={s.pcRow}>
                <Text style={s.pcK}>You agreed</Text>
                <Text style={s.pcV}>{money(r.priceCheck.agreedPerKg)}/kg</Text>
              </View>
              <View style={s.pcRow}>
                <Text style={s.pcK}>{r.priceCheck.basis.district} mandis</Text>
                <Text style={s.pcV}>{money(r.priceCheck.modalPerKg)}/kg</Text>
              </View>
              <View style={s.pcRow}>
                <Text style={s.pcK}>Normal range (±{r.priceCheck.band.pct}%)</Text>
                <Text style={s.pcV}>
                  {money(r.priceCheck.band.lowPerKg)}–{money(r.priceCheck.band.highPerKg)}/kg
                </Text>
              </View>
              <Text style={s.pcNote}>
                {r.priceCheck.note} Based on {r.priceCheck.basis.marketDays} market
                day{r.priceCheck.basis.marketDays === 1 ? '' : 's'} in the last {r.priceCheck.basis.days}.
              </Text>
            </View>
          ) : (
            <View style={[s.pc, s.pcNone]}>
              <View style={s.pcHead}>
                <Ionicons name="help-circle-outline" size={16} color="#6B7280" />
                <Text style={[s.pcTitle, { color: '#374151' }]}>No mandi rate to compare</Text>
              </View>
              <Text style={s.pcNote}>{r.priceCheck.reason}</Text>
            </View>
          )
        )}

        {/* ══ THE PRINTED SLIP ═════════════════════════════════════════════
            Deliberately shaped like the paper a mandi or a shop hands over:
            monospace, ruled lines, the total set apart. It is the same numbers
            as the detailed card below, not a second source — this is a
            PRESENTATION of `r`, so the two can never disagree.

            ⚠️ IT PRINTS THE SIMULATED-PAYMENT LINE WHEN THERE IS ONE. This is
            the most forwarded document the app produces; a reference number on
            a receipt that does not say the rail was a demonstration is how a
            simulated settlement quietly starts being read as a real one. */}
        <View style={s.slip}>
          <Text style={s.slipTitle}>FARM MARKET</Text>
          <Text style={s.slipSub}>Maharashtra · payment receipt</Text>
          <Text style={s.rule}>{'- '.repeat(22)}</Text>

          <SlipRow k="Receipt" v={r.receiptNo} />
          <SlipRow k="Date" v={new Date(r.settlement.paidAt || Date.now())
            .toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
          <SlipRow k="Farmer" v={r.parties.farmer.name} />
          <SlipRow k="Buyer" v={r.parties.vendor.company || r.parties.vendor.name} />

          <Text style={s.rule}>{'- '.repeat(22)}</Text>
          <SlipRow k={`${r.crop.name} ${r.crop.quantityKg}kg`} v={money(r.money.cropTotal)} />
          <SlipRow k={`  @ ${money(r.money.pricePerKg)}/kg`} v="" dim />
          <SlipRow k="Transport (captain)" v={money(r.money.fare)} dim />

          <Text style={s.rule}>{'='.repeat(30)}</Text>
          {/* ⚠️ ROLE-AWARE, NOT ALWAYS THE FARMER's LINE. A buyer's own stake
              is the full grandTotal, a captain's is the fare only — reading
              farmerPayout as "what I get" would tell a driver they earned
              several times their fare. See slipTotalFor()'s own comment. */}
          <View style={s.slipTotalRow}>
            <Text style={s.slipTotalK}>{t(SLIP_TOTAL_KEY[r.issuedTo] || 'receipt.slipTotalFarmer')}</Text>
            <Text style={s.slipTotalV}>{money(slipTotalFor(r))}</Text>
          </View>
          <Text style={s.rule}>{'='.repeat(30)}</Text>

          <SlipRow
            k="Status"
            v={r.settlement.farmerPaid ? 'PAID' : 'NOT YET PAID'}
          />
          {!!r.settlement.method && (
            <SlipRow k="Method" v={r.settlement.method === 'in_app' ? 'In-app payment' : r.settlement.method.toUpperCase()} />
          )}
          {!!r.settlement.txn?.ref && <SlipRow k="Txn ref" v={r.settlement.txn.ref} />}

          <Text style={s.rule}>{'- '.repeat(22)}</Text>
          {r.settlement.txn?.simulated ? (
            <Text style={s.slipSim}>
              *** DEMONSTRATION PAYMENT ***{'\n'}No funds were transferred.
            </Text>
          ) : null}
          <Text style={s.slipFoot}>
            This app records settlements. It does not{'\n'}hold, transfer or verify money.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.crop}>{r.crop.quantityKg} kg {r.crop.name}</Text>
          {!!r.crop.localName && <Text style={s.cropLocal}>{r.crop.localName}</Text>}
          {!!r.crop.grade && (
            <View style={s.gradeChip}>
              <Ionicons name="ribbon-outline" size={12} color="#15803D" />
              <Text style={s.gradeChipText}>
                {t('receipt.grade')} {r.crop.grade}{r.crop.gradeSelfDeclared ? ` · ${t('receipt.farmerDeclared')}` : ''}
              </Text>
            </View>
          )}

          {/* ═══ WHAT WAS ACTUALLY RECORDED AT THE FARM GATE ═══════════════
              The backend has sent all three of these since the gate record was
              built and NOTHING ON THIS SCREEN RENDERED THEM — so the document
              most likely to be forwarded onwards printed a bare "512 kg" that
              reads as measured whether or not anybody owned a scale.

              ⚠️ THREE ABSENCES ARE SAID IN WORDS RATHER THAN LEFT BLANK, because
              a blank reads as "fine" and each of these means something else:
                • no weighing method   → nobody said where the number came from
                • condition unchecked  → nobody looked (NOT "nothing was wrong")
                • no observed grade    → nobody was ASKED, because a captain
                                          from the public pool is not a grader
              Localised keys are REUSED from the fpoRun.* namespace on purpose:
              the word a driver taps at the gate and the word printed here have
              to be the same word. */}
          <View style={s.gateBlock}>
            <Text style={s.gateHead}>{t('receipt.gateTitle')}</Text>

            <View style={s.gateRow}>
              <Ionicons
                name={r.crop.weight?.weighed ? 'scale-outline' : 'eye-outline'}
                size={14}
                color={r.crop.weight?.weighed ? '#15803D' : '#B45309'}
              />
              <Text style={s.gateText}>{weightLine(r.crop.weight, t)}</Text>
              {r.crop.weight?.independent && (
                <View style={s.indyTag}>
                  <Text style={s.indyTagText}>{t('fpoRun.wmIndependentTag')}</Text>
                </View>
              )}
            </View>
            {!!r.crop.weight?.ref && (
              <Text style={s.gateRef}>{t('receipt.ticketRef')} {r.crop.weight.ref}</Text>
            )}

            <View style={s.gateRow}>
              <Ionicons
                name={conditionIcon(r.crop.condition)}
                size={14}
                color={conditionColour(r.crop.condition)}
              />
              <Text style={s.gateText}>{conditionLine(r.crop.condition, t)}</Text>
            </View>

            {/* The grade line reads either "checked and it matched / differed"
                or "nobody was asked" — never a blank that implies a check. */}
            <View style={s.gateRow}>
              <Ionicons
                name={r.crop.gradeCheck?.downgraded ? 'alert-circle-outline' : 'ribbon-outline'}
                size={14}
                color={r.crop.gradeCheck?.downgraded ? '#B91C1C' : '#6B7280'}
              />
              <Text style={s.gateText}>{gradeLine(r.crop.gradeCheck, t)}</Text>
            </View>

            <Text style={s.gateNote}>{t('receipt.gateNote')}</Text>
          </View>
        </View>

        {/* ── WHO CARRIED WHAT ────────────────────────────────────────────
            Rendered whenever an advance was agreed. Not shown at all when
            there was none: printing "advance: ₹0" on every receipt in the app
            would be noise, and the exposure it creates is already named on the
            farmer's own sales screen where they can act on it. */}
        {!!r.exposure && r.exposure.advance.agreed > 0 && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>{t('receipt.advanceTitle')}</Text>
            <Row
              k={r.exposure.advance.receivedAt ? t('receipt.advanceReceived') : t('receipt.advanceAgreed')}
              v={money(r.exposure.advance.agreed)}
            />
            {/* An advance that was promised and never arrived is its own row,
                because it is the fact that matters most and it is invisible if
                folded into the balance. */}
            {r.exposure.advance.outstanding > 0 && (
              <Row k={t('receipt.advanceOutstanding')} v={money(r.exposure.advance.outstanding)} />
            )}
            <Row
              k={r.exposure.overpaid ? t('receipt.overpaidBy') : t('receipt.balanceDue')}
              v={money(Math.abs(r.exposure.balanceDue))}
            />
            <Text style={s.exposureNote}>{r.exposure.note}</Text>
            <Text style={s.exposureDisclaimer}>{r.exposure.disclaimer}</Text>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.sectionTitle}>{t('receipt.money')}</Text>
          <Row k={t('receipt.pricePerKg')} v={`${money(r.money.pricePerKg)}${r.money.priceSource === 'negotiated' ? `  ${t('receipt.negotiated')}` : ''}`} />
          {r.money.priceSource === 'negotiated' && r.negotiation && (
            <Row k={t('receipt.originallyAsking')} v={money(r.negotiation.askingPricePerKg)} muted />
          )}
          <Row k={t('receipt.cropValue')} v={money(r.money.cropTotal)} />
          <Row k={t('receipt.transportFare')} v={money(r.money.fare)} />
          <View style={s.divider} />
          {/* Phase 5, R2 — every figure stays visible to every role (nobody's
              trade should hide numbers another party can already see on their
              own copy), but only the VIEWER's own stake is bolded — a buyer
              reads their own total at a glance rather than hunting for it
              among three equally-bold lines. */}
          <Row k={t('receipt.totalBuyerPays')} v={money(r.money.grandTotal)} strong={r.issuedTo === 'vendor'} />

          <View style={s.splitBox}>
            <Text style={s.splitHead}>{t('receipt.whoCollectsWhat')}</Text>
            <Row k={t('receipt.farmerReceives')} v={money(r.money.farmerPayout)}
              strong={r.issuedTo === 'farmer' || r.issuedTo === 'fpo_admin'} />
            <Row k={t('receipt.driverCollects')} v={money(r.money.collectedByAgent)} strong={r.issuedTo === 'agent'} />
            <Text style={s.splitNote}>{r.money.note}</Text>
          </View>

          <View style={[s.settle, r.settlement.farmerPaid ? s.settlePaid : s.settleDue]}>
            <Ionicons
              name={r.settlement.farmerPaid ? 'checkmark-circle' : 'time-outline'}
              size={17} color={r.settlement.farmerPaid ? '#15803D' : '#B45309'} />
            <Text style={[s.settleText, { color: r.settlement.farmerPaid ? '#15803D' : '#7C2D12' }]}>
              {r.settlement.farmerPaid
                ? `${t('receipt.farmerPaid')}${r.settlement.paidAt ? ` ${t('receipt.on')} ${new Date(r.settlement.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}`
                : t('receipt.farmerNotYetPaid')}
            </Text>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>{t('receipt.parties')}</Text>
          <Row k={t('receipt.farmer')} v={r.parties.farmer.name || '—'} />
          <Row k={t('receipt.buyer')} v={r.parties.vendor.company || r.parties.vendor.name || '—'} />
          {r.parties.agent && <Row k={t('receipt.captain')} v={`${r.parties.agent.name} · ${r.parties.agent.vehicle}`} />}
          <View style={s.divider} />
          <Row k={t('receipt.from')} v={r.logistics.pickup || '—'} />
          <Row k={t('receipt.to')} v={r.logistics.dropoff || '—'} />
          <Row k={t('receipt.distance')} v={`${r.logistics.distanceKm} ${t('receipt.km')}`} />
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>{t('receipt.whatHappened')}</Text>
          {r.timeline.map((t, i) => (
            <View key={i} style={s.tlRow}>
              <View style={s.tlDot} />
              <Text style={s.tlEvent}>{t.event}</Text>
              <Text style={s.tlAt}>
                {new Date(t.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </Text>
            </View>
          ))}
        </View>

        {r.disputes.length > 0 && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>{t('receipt.grievances')}</Text>
            {r.disputes.map((d, i) => (
              <View key={i} style={s.dispute}>
                <Text style={s.disputeReason}>
                  {(REASONS.find(([k]) => k === d.reason) || [null, d.reason])[1]}
                </Text>
                <Text style={s.disputeMeta}>
                  {t('receipt.raisedByThe')} {d.by} · {d.status}
                  {d.outcome ? ` · ${d.outcome.replace(/_/g, ' ')}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={s.secondary} onPress={shareReceipt}>
          <Ionicons name="share-outline" size={17} color="#15803D" />
          <Text style={s.secondaryText}>{t('receipt.shareReceipt')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.secondary} onPress={exportCsv} disabled={exporting}>
          {exporting ? <ActivityIndicator size="small" color="#15803D" />
            : <><Ionicons name="download-outline" size={17} color="#15803D" />
                <Text style={s.secondaryText}>{t('receipt.exportCsv')}</Text></>}
        </TouchableOpacity>

        <TouchableOpacity style={s.problem} onPress={() => setRaise(true)}>
          <Ionicons name="alert-circle-outline" size={17} color="#B91C1C" />
          <Text style={s.problemText}>{t('receipt.somethingWrong')}</Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal visible={raise} transparent animationType="slide" onRequestClose={() => setRaise(false)}>
        <View style={s.sheetWrap}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>{t('receipt.whatWentWrong')}</Text>
              <TouchableOpacity onPress={() => setRaise(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {REASONS.map(([key, label]) => {
                const on = reason === key;
                return (
                  <TouchableOpacity key={key} style={[s.reason, on && s.reasonOn]}
                    onPress={() => setReason(key)} activeOpacity={0.85}>
                    <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'}
                      size={18} color={on ? '#B91C1C' : '#D1D5DB'} />
                    <Text style={[s.reasonText, on && { color: '#111827', fontWeight: '600' }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}

              <Text style={s.label}>{t('receipt.describeIt')}</Text>
              <TextInput style={[s.input, s.multi]} value={desc} onChangeText={setDesc}
                placeholder={t('receipt.describePlaceholder')} multiline
                placeholderTextColor="#9CA3AF" maxLength={1000} />

              <View style={s.notice}>
                <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
                <Text style={s.noticeText}>{t('receipt.raiseNotice')}</Text>
              </View>
            </ScrollView>

            <TouchableOpacity style={[s.file, filing && { opacity: 0.6 }]} onPress={fileDispute} disabled={filing}>
              {filing ? <ActivityIndicator color="#fff" />
                : <Text style={s.fileText}>{t('receipt.raiseGrievance')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const MONO = Platform.OS === 'ios' ? 'Courier' : 'monospace';

const s = StyleSheet.create({
  // ── the printed slip ──
  // ── the price band ──
  pc: { borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1 },
  pcWithin: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  pcAbove:  { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  pcBelow:  { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  pcNone:   { backgroundColor: '#F8FAFC', borderColor: '#E5E7EB' },
  pcHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  pcTitle: { fontSize: 14, fontWeight: '700', color: '#15803D' },
  pcRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5 },
  pcK: { fontSize: 13, color: '#6B7280' },
  pcV: { fontSize: 13, color: '#111827', fontWeight: '700' },
  pcNote: { fontSize: 11.5, color: '#6B7280', lineHeight: 16.5, marginTop: 9 },

  slip: {
    backgroundColor: '#fff', borderRadius: 6, paddingVertical: 18, paddingHorizontal: 16,
    marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB',
    // A paper feel without a fake torn edge — the shadow does the work.
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  slipTitle: { fontFamily: MONO, fontSize: 15, fontWeight: '700', textAlign: 'center', color: '#111827', letterSpacing: 2 },
  slipSub: { fontFamily: MONO, fontSize: 10.5, textAlign: 'center', color: '#9CA3AF', marginTop: 3, letterSpacing: 0.5 },
  rule: { fontFamily: MONO, fontSize: 10, color: '#D1D5DB', textAlign: 'center', marginVertical: 8 },
  slipRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 2 },
  slipK: { fontFamily: MONO, fontSize: 11.5, color: '#374151', flexShrink: 1 },
  slipV: { fontFamily: MONO, fontSize: 11.5, color: '#111827', fontWeight: '600' },
  slipDim: { color: '#9CA3AF', fontWeight: '400' },
  slipTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  slipTotalK: { fontFamily: MONO, fontSize: 12.5, fontWeight: '700', color: '#111827', letterSpacing: 0.5 },
  slipTotalV: { fontFamily: MONO, fontSize: 15, fontWeight: '800', color: '#111827' },
  slipSim: { fontFamily: MONO, fontSize: 10.5, color: '#B45309', textAlign: 'center', lineHeight: 15, marginBottom: 8 },
  slipFoot: { fontFamily: MONO, fontSize: 9.5, color: '#9CA3AF', textAlign: 'center', lineHeight: 14 },

  exposureNote: { fontSize: 12, color: '#374151', lineHeight: 17, marginTop: 8 },
  exposureDisclaimer: { fontSize: 10, color: '#9CA3AF', lineHeight: 15, marginTop: 6 },
  gateBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 6 },
  gateHead: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.4 },
  gateRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  gateText: { flex: 1, fontSize: 12, color: '#374151', lineHeight: 17 },
  gateRef: { fontSize: 11, color: '#9CA3AF', marginLeft: 21 },
  gateNote: { fontSize: 10, color: '#9CA3AF', lineHeight: 15, marginTop: 4 },
  indyTag: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: '#DCFCE7',
  },
  indyTagText: { fontSize: 9, fontWeight: '800', color: '#15803D', letterSpacing: 0.3 },

  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', gap: 10, padding: 30 },
  errText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  scroll: { padding: 16, gap: 12 },

  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  headTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  no: { fontSize: 15, fontWeight: '800', color: '#111827', letterSpacing: 0.5 },
  status: { fontSize: 12, fontWeight: '700', color: '#15803D', textTransform: 'uppercase', letterSpacing: 0.4 },
  copyBadge: {
    backgroundColor: '#EFF6FF', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  copyBadgeText: { fontSize: 10, fontWeight: '800', color: '#1D4ED8', letterSpacing: 0.2 },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  crop: { fontSize: 19, fontWeight: '700', color: '#111827' },
  cropLocal: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  gradeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginTop: 8,
  },
  gradeChipText: { fontSize: 11, fontWeight: '700', color: '#15803D' },

  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 5, gap: 12 },
  rowKey: { fontSize: 13.5, color: '#6B7280', flexShrink: 1 },
  rowVal: { fontSize: 13.5, color: '#111827', fontWeight: '600', textAlign: 'right' },
  rowValStrong: { fontSize: 16, fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 8 },

  splitBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 12 },
  splitHead: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5, marginBottom: 6 },
  splitNote: { fontSize: 11.5, color: '#9CA3AF', marginTop: 8, lineHeight: 16 },

  settle: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, padding: 11, marginTop: 12 },
  settlePaid: { backgroundColor: '#DCFCE7' },
  settleDue: { backgroundColor: '#FEF3C7' },
  settleText: { fontSize: 13, fontWeight: '700' },

  tlRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 },
  tlDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#16A34A' },
  tlEvent: { flex: 1, fontSize: 13.5, color: '#111827', textTransform: 'capitalize' },
  tlAt: { fontSize: 12.5, color: '#9CA3AF' },

  dispute: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 11, marginBottom: 8 },
  disputeReason: { fontSize: 13.5, fontWeight: '600', color: '#7F1D1D' },
  disputeMeta: { fontSize: 12, color: '#B91C1C', marginTop: 3 },

  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#DCFCE7', borderRadius: 14, paddingVertical: 14,
  },
  secondaryText: { color: '#15803D', fontSize: 15, fontWeight: '700' },
  problem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12 },
  problemText: { color: '#B91C1C', fontSize: 13.5, fontWeight: '600' },

  sheetWrap: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: '#111827' },

  reason: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#F1F5F9', borderRadius: 12, padding: 11, marginBottom: 7,
  },
  reasonOn: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  reasonText: { fontSize: 13.5, color: '#6B7280', flex: 1 },

  label: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginTop: 10, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827',
  },
  multi: { height: 96, textAlignVertical: 'top' },

  notice: { flexDirection: 'row', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 14 },
  noticeText: { flex: 1, fontSize: 11.5, color: '#6B7280', lineHeight: 17 },

  file: {
    backgroundColor: '#B91C1C', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 16,
  },
  fileText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

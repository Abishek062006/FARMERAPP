import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, FlatList, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';

// G1 — the farmer records a sale that did NOT go through this app.
//
// Every other screen assumes the trade ran through Offer → Order → settlement.
// Almost none do. A farmer who reads "onion is 12% above its 30-day average,
// sell now", walks to Lasalgaon and sells to a trader there disappears from the
// app at exactly the moment the outcome becomes knowable.
//
// This screen carries BOTH the form and the record book, for the same reason
// ReceiptScreen carries both the receipt and the grievance form: they are two
// halves of one moment, and splitting them means hunting two menus.
//
// THE DEDUCTION LINES ARE THE POINT. A single "amount received" field would
// record the same rupees and hide the entire problem. Rajendra Chavan of Barshi
// sold 512 kg of onion for ₹512 and took home ₹2.49 — visible only when labour,
// weighing and transport sit itemised against the gross.

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const CHANNELS = [
  ['apmc', 'recordSale.channelApmc'],
  ['trader', 'recordSale.channelTrader'],
  ['farmgate', 'recordSale.channelFarmgate'],
  ['processor', 'recordSale.channelProcessor'],
  ['fpo', 'recordSale.channelFpo'],
  ['export', 'recordSale.channelExport'],
];

// The deductions a Maharashtra farmer actually meets on a mandi slip. Offered
// as one-tap chips because typing "hamali" on a phone keyboard in a mandi yard
// is the difference between a record and no record.
const COMMON_DEDUCTIONS = [
  'recordSale.dedCommission',
  'recordSale.dedLabourHamali',
  'recordSale.dedWeighing',
  'recordSale.dedTransport',
  'recordSale.dedMarketCess',
  'recordSale.dedPacking',
];

// How a band reads to a farmer. The NUMBERS always sit beside the word — a
// label alone is a verdict, and this ledger is built from one side's account of
// a two-party trade. Below the scoring threshold there is no band at all.
const BAND = {
  prompt:  { labelKey: 'recordSale.bandPrompt', fg: '#15803D', bg: '#DCFCE7', icon: 'checkmark-circle' },
  average: { labelKey: 'recordSale.bandAverage', fg: '#1D4ED8', bg: '#DBEAFE', icon: 'time-outline' },
  slow:    { labelKey: 'recordSale.bandSlow', fg: '#B45309', bg: '#FEF3C7', icon: 'alert-circle-outline' },
  unpaid:  { labelKey: 'recordSale.bandUnpaid', fg: '#B91C1C', bg: '#FEE2E2', icon: 'close-circle-outline' },
};

function TrustCard({ t, compact }) {
  const { t: translate } = useLanguage();
  if (!t) return null;
  const b = t.scored ? BAND[t.band] : null;

  const fromWord = translate('recordSale.fromWord');
  const salesLine = `${t.trades} ${translate('recordSale.recordedSalesWord')}`
    + (t.reportedByFarmers > 1
        ? ` ${fromWord ? fromWord + ' ' : ''}${t.reportedByFarmers} ${translate('recordSale.farmersWord')}`
        : '')
    + (t.medianDaysToPay != null
        ? ` · ${translate('recordSale.usuallyPaysPrefix')} ${t.medianDaysToPay} ${translate('recordSale.daysWord')}`
        : '');

  const warnLine = `${t.unpaidCount} ${translate('recordSale.unpaidSalesWord')}`
    + (t.oldestUnrecordedDays != null
        ? ` — ${translate('recordSale.oldestPrefix')} ${t.oldestUnrecordedDays} ${translate('recordSale.daysPlain')}`
        : '');

  return (
    <View style={[s.trust, b ? { backgroundColor: b.bg } : { backgroundColor: '#F1F5F9' }]}>
      <Ionicons
        name={b ? b.icon : 'help-circle-outline'}
        size={17}
        color={b ? b.fg : '#6B7280'}
      />
      <View style={{ flex: 1 }}>
        <Text style={[s.trustLabel, { color: b ? b.fg : '#6B7280' }]}>
          {b ? translate(b.labelKey) : translate('recordSale.notEnoughHistory')}
        </Text>

        {/* The counts are shown either way. Refusing to band a buyer is not the
            same as hiding what little is known about them. */}
        <Text style={s.trustLine}>{salesLine}</Text>

        {t.unpaidCount > 0 && (
          <Text style={s.trustWarn}>{warnLine}</Text>
        )}

        {!t.scored && !compact && (
          <Text style={s.trustReason}>{t.reason}</Text>
        )}
        {!compact && (
          <Text style={s.trustBasis}>{translate('recordSale.trustBasis')}</Text>
        )}
      </View>
    </View>
  );
}

export default function RecordSaleScreen({ navigation, route }) {
  const { lang, t } = useLanguage();
  const { userData, prefill } = route.params || {};

  const [mode, setMode] = useState(prefill ? 'form' : 'book');
  const [saving, setSaving] = useState(false);

  const [sales, setSales] = useState([]);
  const [totals, setTotals] = useState(null);
  const [buyers, setBuyers] = useState([]);
  // Comes from the server so the UI can never drift from the real threshold in
  // services/trustService.js.
  const [minTrades, setMinTrades] = useState(null);
  // What OTHER farmers have recorded about the buyer being typed in right now.
  const [lookup, setLookup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── form state ──────────────────────────────────────────────────────
  const [commodity, setCommodity] = useState(prefill?.commodity || '');
  const [quantityKg, setQuantityKg] = useState(prefill?.quantityKg ? String(prefill.quantityKg) : '');
  const [grade, setGrade] = useState(null);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [channel, setChannel] = useState('apmc');
  const [marketName, setMarketName] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');
  const [grossAmount, setGrossAmount] = useState('');
  const [deductions, setDeductions] = useState([]);
  const [paidNow, setPaidNow] = useState(true);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API_ENDPOINTS.MANDI_SALES}/mine`);
      if (r.data.success) { setSales(r.data.sales); setTotals(r.data.totals); }
    } catch { /* an empty book is a valid state, not an error to shout about */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const loadBuyers = useCallback(async () => {
    try {
      const r = await axios.get(`${API_ENDPOINTS.MANDI_SALES}/buyers`);
      if (r.data.success) { setBuyers(r.data.buyers); setMinTrades(r.data.minTradesToScore); }
    } catch { /* empty ledger is a valid state */ }
  }, []);

  React.useEffect(() => { load(); loadBuyers(); }, [load, loadBuyers]);

  // Check a trader BEFORE handing over the crop, against every farmer's
  // records rather than only this one's. Debounced because it fires per
  // keystroke, and skipped under 3 characters — "Sh" would pool half the
  // traders in the district into one meaningless answer.
  React.useEffect(() => {
    if (mode !== 'form' || buyerName.trim().length < 3) { setLookup(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await axios.get(`${API_ENDPOINTS.MANDI_SALES}/buyer`, {
          params: { name: buyerName.trim(), market: marketName.trim() },
        });
        if (!cancelled && r.data.success) setLookup(r.data.trust);
      } catch { if (!cancelled) setLookup(null); }
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [buyerName, marketName, mode]);

  const qty = Number(quantityKg) || 0;
  const rate = Number(pricePerKg) || 0;
  const impliedGross = Math.round(qty * rate * 100) / 100;
  const gross = grossAmount !== '' ? Number(grossAmount) || 0 : impliedGross;
  const deductionTotal = deductions.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  const net = Math.round((gross - deductionTotal) * 100) / 100;
  // Same 2% tolerance the server uses. Shown as a question, never as a block —
  // auctions round and lots weigh short, and the slip is the fact.
  const drift = impliedGross > 0 && grossAmount !== ''
    ? Math.abs(gross - impliedGross) / impliedGross * 100 : 0;

  const addDeduction = (label) =>
    setDeductions((d) => (d.some((x) => x.label === label) ? d : [...d, { label, amount: '' }]));
  const setDeductionAmount = (i, v) =>
    setDeductions((d) => d.map((x, j) => (j === i ? { ...x, amount: v } : x)));
  const removeDeduction = (i) => setDeductions((d) => d.filter((_, j) => j !== i));

  const submit = async () => {
    if (!commodity.trim()) return Alert.alert(t('recordSale.alertWhatSold'));
    if (!qty) return Alert.alert(t('recordSale.alertHowMuch'));
    if (!buyerName.trim()) return Alert.alert(t('recordSale.alertWhoBoughtTitle'), t('recordSale.alertWhoBoughtMsg'));
    if (!rate) return Alert.alert(t('recordSale.alertWhatRate'));
    if (net < 0) return Alert.alert(t('recordSale.alertCheckSlipTitle'), t('recordSale.alertCheckSlipMsg'));

    setSaving(true);
    try {
      const r = await axios.post(API_ENDPOINTS.MANDI_SALES, {
        commodity: commodity.trim(),
        quantityKg: qty,
        grade,
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        channel,
        marketName: marketName.trim(),
        pricePerKg: rate,
        grossAmount: gross,
        deductions: deductions
          .filter((d) => Number(d.amount) > 0)
          .map((d) => ({ label: d.label, amount: Number(d.amount) })),
        saleDate: new Date(),
        receivedOn: paidNow ? new Date() : null,
        amountReceived: paidNow ? net : null,
        adviceShown: prefill?.adviceShown || null,
        adviceFollowed: prefill?.adviceFollowed ?? null,
        notes: notes.trim(),
      });
      if (r.data.success) {
        setCommodity(''); setQuantityKg(''); setGrade(null); setBuyerName('');
        setBuyerPhone(''); setMarketName(''); setPricePerKg(''); setGrossAmount('');
        setDeductions([]); setNotes(''); setPaidNow(true);
        setMode('book');
        load(); loadBuyers();
        Alert.alert(t('recordSale.alertRecordedTitle'), r.data.reconciliation
          ? `${t('recordSale.savedNotePrefix')} ${money(rate)}${t('recordSale.perKgTimes')} ${qty} ${t('recordSale.kgComesTo')} ${money(r.data.reconciliation.implied)}${t('recordSale.butYouEntered')} ${money(gross)}. ${t('recordSale.weKeptFigure')}`
          : `${t('recordSale.tookHomePrefix')} ${money(r.data.sale.netAmount)}.`);
      }
    } catch (e) {
      Alert.alert(t('recordSale.alertCouldNotSaveTitle'), e.response?.data?.error || t('recordSale.alertPleaseTryAgain'));
    } finally { setSaving(false); }
  };

  const markPaid = (id) =>
    Alert.alert(t('recordSale.alertMoneyReceivedTitle'), t('recordSale.alertMoneyReceivedMsg'), [
      { text: t('recordSale.notYet'), style: 'cancel' },
      {
        text: t('recordSale.yesPaid'),
        onPress: async () => {
          try {
            await axios.patch(`${API_ENDPOINTS.MANDI_SALES}/${id}/payment`, { receivedOn: new Date() });
            load(); loadBuyers();
          } catch (e) { Alert.alert(t('recordSale.alertCouldNotUpdateTitle'), e.response?.data?.error || t('recordSale.alertPleaseTryAgain')); }
        },
      },
    ]);

  // ── the record book ─────────────────────────────────────────────────
  const SaleCard = ({ item }) => (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardCrop}>{item.commodity} · {item.quantityKg} kg{item.grade ? ` · ${t('recordSale.gradeLabel')} ${item.grade}` : ''}</Text>
          <Text style={s.cardMeta}>
            {item.buyer?.name}{item.market?.name ? ` · ${item.market.name}` : ''}
          </Text>
          <Text style={s.cardDate}>{new Date(item.saleDate).toLocaleDateString('en-IN')}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.cardNetLabel}>{t('recordSale.youGot')}</Text>
          <Text style={[s.cardNet, item.netAmount <= 0 && { color: '#B91C1C' }]}>{money(item.netAmount)}</Text>
        </View>
      </View>

      {item.deductionsTotal > 0 && (
        <View style={s.breakdown}>
          <View style={s.bRow}>
            <Text style={s.bKey}>{t('recordSale.saleValue')}</Text>
            <Text style={s.bVal}>{money(item.grossAmount)}</Text>
          </View>
          {item.deductions.map((d, i) => (
            <View key={i} style={s.bRow}>
              <Text style={s.bKeyMinus}>− {d.label}</Text>
              <Text style={s.bValMinus}>{money(d.amount)}</Text>
            </View>
          ))}
          <View style={[s.bRow, s.bTotal]}>
            <Text style={s.bKeyTotal}>{t('recordSale.tookHome')}</Text>
            <Text style={s.bValTotal}>{money(item.netAmount)}</Text>
          </View>
          {/* The single number this feature exists to make visible. */}
          <Text style={s.bitePct}>
            {t('recordSale.deductionsTookPrefix')} {Math.round((item.deductionsTotal / item.grossAmount) * 100)}{t('recordSale.ofThisSaleSuffix')}
          </Text>
        </View>
      )}

      {item.paid ? (
        <View style={s.paidRow}>
          <Ionicons name="checkmark-circle" size={15} color="#15803D" />
          <Text style={s.paidText}>
            {t('recordSale.paidWord')}{item.daysToPayment != null ? ` ${t('recordSale.afterWord')} ${item.daysToPayment} ${t('recordSale.daysPlain')}` : ''}
          </Text>
        </View>
      ) : (
        <TouchableOpacity style={s.unpaidRow} onPress={() => markPaid(item._id)}>
          <Ionicons name="alert-circle-outline" size={15} color="#B45309" />
          <Text style={s.unpaidText}>{t('recordSale.notPaidYetTapWhenArrives')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (mode === 'buyers') {
    return (
      <View style={s.container}>
        <FlatList
          data={buyers}
          keyExtractor={(b) => b.buyerKey}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardCrop}>{item.buyerName}</Text>
                  {!!item.marketName && <Text style={s.cardMeta}>{item.marketName}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.cardNetLabel}>{t('recordSale.paidYou')}</Text>
                  <Text style={s.cardNet}>{money(item.totalValue)}</Text>
                </View>
              </View>
              <View style={{ marginTop: 11 }}>
                <TrustCard t={item} compact />
              </View>
            </View>
          )}
          ListHeaderComponent={
            buyers.length > 0 ? (
              <Text style={s.buyersIntro}>
                {t('recordSale.buyersIntroBase')}
                {minTrades ? ` ${t('recordSale.buyerNeedsPrefix')} ${minTrades} ${t('recordSale.buyerNeedsSuffix')}` : ''}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={s.emptyIcon}><Ionicons name="people-outline" size={32} color="#16A34A" /></View>
              <Text style={s.emptyTitle}>{t('recordSale.noBuyersYet')}</Text>
              <Text style={s.emptySub}>{t('recordSale.buyersEmptySub')}</Text>
            </View>
          }
        />
        <TouchableOpacity style={s.fab} onPress={() => setMode('book')} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
          <Text style={s.fabText}>{t('recordSale.backToMySales')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (mode === 'book') {
    return (
      <View style={s.container}>
        {totals && sales.length > 0 && (
          <View style={s.totalsBar}>
            <View style={s.tCol}>
              <Text style={s.tLabel}>{t('recordSale.soldFor')}</Text>
              <Text style={s.tVal}>{money(totals.grossAmount)}</Text>
            </View>
            <View style={s.tCol}>
              <Text style={s.tLabel}>{t('recordSale.deductionsTook')}</Text>
              <Text style={[s.tVal, { color: '#B91C1C' }]}>{money(totals.deductions)}</Text>
              <Text style={s.tSub}>{totals.deductionsPct}{t('recordSale.ofYourSalesSuffix')}</Text>
            </View>
            <View style={s.tCol}>
              <Text style={s.tLabel}>{t('recordSale.youGot')}</Text>
              <Text style={[s.tVal, { color: '#15803D' }]}>{money(totals.netAmount)}</Text>
              {totals.unpaid > 0 && <Text style={s.tSub}>{totals.unpaid} {t('recordSale.unpaidCountSuffix')}</Text>}
            </View>
          </View>
        )}

        {loading ? (
          <View style={s.center}><ActivityIndicator color="#16A34A" /></View>
        ) : (
          <FlatList
            data={sales}
            keyExtractor={(i) => String(i._id)}
            renderItem={({ item }) => <SaleCard item={item} />}
            contentContainerStyle={s.list}
            refreshControl={<RefreshControl refreshing={refreshing} tintColor="#16A34A"
              onRefresh={() => { setRefreshing(true); load(); }} />}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <View style={s.emptyIcon}><Ionicons name="receipt-outline" size={32} color="#16A34A" /></View>
                <Text style={s.emptyTitle}>{t('recordSale.bookEmptyTitle')}</Text>
                <Text style={s.emptySub}>{t('recordSale.bookEmptySub')}</Text>
              </View>
            }
          />
        )}

        <View style={s.fabRow}>
          <TouchableOpacity style={s.fabAlt} onPress={() => setMode('buyers')} activeOpacity={0.85}>
            <Ionicons name="people-outline" size={18} color="#15803D" />
            <Text style={s.fabAltText}>{t('recordSale.myBuyers')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.fab, s.fabInline]} onPress={() => setMode('form')} activeOpacity={0.85}>
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={s.fabText}>{t('recordSale.recordASale')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── the form ────────────────────────────────────────────────────────
  return (
    <ScrollView style={s.container} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        <Text style={s.why}>{t('recordSale.formWhy')}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.label}>{t('recordSale.whatDidYouSell')}</Text>
        <TextInput style={s.input} value={commodity} onChangeText={setCommodity}
          placeholder={t('recordSale.placeholderOnion')} placeholderTextColor="#9CA3AF" />

        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>{t('recordSale.quantityKgLabel')}</Text>
            <TextInput style={s.input} value={quantityKg} onChangeText={setQuantityKg}
              placeholder="512" placeholderTextColor="#9CA3AF" keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>{t('recordSale.rateLabel')}</Text>
            <TextInput style={s.input} value={pricePerKg} onChangeText={setPricePerKg}
              placeholder="1" placeholderTextColor="#9CA3AF" keyboardType="numeric" />
          </View>
        </View>

        <Text style={s.label}>{t('recordSale.gradeYouWerePaidFor')}</Text>
        <View style={s.chips}>
          {[['A'], ['B'], ['C'], [null]].map(([g]) => (
            <TouchableOpacity key={String(g)} style={[s.chip, grade === g && s.chipOn]} onPress={() => setGrade(g)}>
              <Text style={[s.chipText, grade === g && s.chipTextOn]}>
                {g === null ? t('recordSale.notGraded') : `${t('recordSale.gradeLabel')} ${g}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.label}>{t('recordSale.whoBoughtIt')}</Text>
        <TextInput style={s.input} value={buyerName} onChangeText={setBuyerName}
          placeholder={t('recordSale.placeholderTraderName')} placeholderTextColor="#9CA3AF" />
        <Text style={s.hint}>{t('recordSale.buyerNameHint')}</Text>

        {/* The point of the whole ledger: what other farmers found out about
            this buyer, shown BEFORE the crop changes hands rather than after. */}
        {!!lookup && lookup.trades > 0 && <TrustCard t={lookup} />}

        <Text style={s.label}>{t('recordSale.theirPhoneLabel')}</Text>
        <TextInput style={s.input} value={buyerPhone} onChangeText={setBuyerPhone}
          placeholder={t('recordSale.phonePlaceholderHint')} placeholderTextColor="#9CA3AF" keyboardType="phone-pad" />

        <Text style={s.label}>{t('recordSale.whereLabel')}</Text>
        <TextInput style={s.input} value={marketName} onChangeText={setMarketName}
          placeholder={t('recordSale.placeholderMarket')} placeholderTextColor="#9CA3AF" />

        <Text style={s.label}>{t('recordSale.howDidYouSellLabel')}</Text>
        <View style={s.chips}>
          {CHANNELS.map(([k, labelKey]) => (
            <TouchableOpacity key={k} style={[s.chip, channel === k && s.chipOn]} onPress={() => setChannel(k)}>
              <Text style={[s.chipText, channel === k && s.chipTextOn]}>{t(labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── deductions ─────────────────────────────────────────────── */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>{t('recordSale.whatWasDeductedTitle')}</Text>
        <Text style={s.hint}>{t('recordSale.deductionsHint')}</Text>

        <View style={s.chips}>
          {COMMON_DEDUCTIONS.map((dKey) => (
            <TouchableOpacity key={dKey} style={s.addChip} onPress={() => addDeduction(t(dKey))}>
              <Ionicons name="add" size={13} color="#6B7280" />
              <Text style={s.addChipText}>{t(dKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {deductions.map((d, i) => (
          <View key={d.label} style={s.dedRow}>
            <Text style={s.dedLabel}>{d.label}</Text>
            <TextInput style={s.dedInput} value={String(d.amount)}
              onChangeText={(v) => setDeductionAmount(i, v)}
              placeholder="₹0" placeholderTextColor="#9CA3AF" keyboardType="numeric" />
            <TouchableOpacity onPress={() => removeDeduction(i)} hitSlop={8}>
              <Ionicons name="close-circle" size={19} color="#D1D5DB" />
            </TouchableOpacity>
          </View>
        ))}

        {gross > 0 && (
          <View style={s.summary}>
            <View style={s.bRow}>
              <Text style={s.bKey}>{t('recordSale.saleValue')}</Text>
              <Text style={s.bVal}>{money(gross)}</Text>
            </View>
            {deductionTotal > 0 && (
              <View style={s.bRow}>
                <Text style={s.bKeyMinus}>{t('recordSale.minusDeductions')}</Text>
                <Text style={s.bValMinus}>{money(deductionTotal)}</Text>
              </View>
            )}
            <View style={[s.bRow, s.bTotal]}>
              <Text style={s.bKeyTotal}>{t('recordSale.youTakeHome')}</Text>
              <Text style={[s.bValTotal, net <= 0 && { color: '#B91C1C' }]}>{money(net)}</Text>
            </View>
            {gross > 0 && deductionTotal / gross > 0.25 && (
              <Text style={s.biteWarn}>
                {t('recordSale.deductionsAreTakingPrefix')} {Math.round((deductionTotal / gross) * 100)}{t('recordSale.ofThisSaleSuffix')}.
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.label}>{t('recordSale.saleAmountSlipLabel')}</Text>
        <TextInput style={s.input} value={grossAmount} onChangeText={setGrossAmount}
          placeholder={impliedGross ? `${impliedGross} ${t('recordSale.leaveBlankSuffix')}` : t('recordSale.totalBeforeDeductions')}
          placeholderTextColor="#9CA3AF" keyboardType="numeric" />
        {drift > 2 && (
          <View style={s.driftBox}>
            <Ionicons name="information-circle-outline" size={15} color="#B45309" />
            <Text style={s.driftText}>
              {money(rate)}{t('recordSale.perKgTimes')} {qty} {t('recordSale.kgComesTo')} {money(impliedGross)}{t('recordSale.butYouEntered')} {money(gross)}.
              {' '}{t('recordSale.willKeepFigure')}
            </Text>
          </View>
        )}

        <TouchableOpacity style={s.toggle} onPress={() => setPaidNow((p) => !p)} activeOpacity={0.7}>
          <Ionicons name={paidNow ? 'checkbox' : 'square-outline'} size={20} color={paidNow ? '#16A34A' : '#9CA3AF'} />
          <Text style={s.toggleText}>{t('recordSale.iHaveBeenPaid')}</Text>
        </TouchableOpacity>
        <Text style={s.hint}>{t('recordSale.paidToggleHint')}</Text>

        <Text style={s.label}>{t('recordSale.notesLabel')}</Text>
        <TextInput style={[s.input, s.multi]} value={notes} onChangeText={setNotes}
          placeholder={t('recordSale.notesPlaceholder')} placeholderTextColor="#9CA3AF" multiline />
      </View>

      <TouchableOpacity style={[s.cta, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" />
          : <><Ionicons name="save-outline" size={17} color="#fff" /><Text style={s.ctaText}>{t('recordSale.saveThisSaleBtn')}</Text></>}
      </TouchableOpacity>
      <TouchableOpacity style={s.cancel} onPress={() => setMode('book')}>
        <Text style={s.cancelText}>{t('recordSale.cancelBtn')}</Text>
      </TouchableOpacity>
      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 12 },
  list: { padding: 16, gap: 12, paddingBottom: 96 },
  row: { flexDirection: 'row', gap: 12 },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  why: { fontSize: 13.5, color: '#6B7280', lineHeight: 20 },
  sectionTitle: { fontSize: 15.5, fontWeight: '700', color: '#111827' },

  label: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827',
  },
  multi: { height: 66, textAlignVertical: 'top' },
  hint: { fontSize: 11.5, color: '#9CA3AF', marginTop: 6, lineHeight: 16 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: '#DCFCE7', borderColor: '#16A34A' },
  chipText: { fontSize: 12.5, color: '#6B7280', fontWeight: '600' },
  chipTextOn: { color: '#15803D' },
  addChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', backgroundColor: '#F8FAFC',
  },
  addChipText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },

  dedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  dedLabel: { flex: 1, fontSize: 13.5, color: '#374151', fontWeight: '600' },
  dedInput: {
    width: 100, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 11, paddingVertical: 8, fontSize: 14, color: '#111827', textAlign: 'right',
  },

  summary: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  breakdown: { marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  bRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  bKey: { fontSize: 13, color: '#6B7280' },
  bVal: { fontSize: 13, fontWeight: '600', color: '#111827' },
  bKeyMinus: { fontSize: 13, color: '#B91C1C' },
  bValMinus: { fontSize: 13, fontWeight: '600', color: '#B91C1C' },
  bTotal: { borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 6, paddingTop: 8 },
  bKeyTotal: { fontSize: 14, fontWeight: '700', color: '#111827' },
  bValTotal: { fontSize: 17, fontWeight: '800', color: '#15803D' },
  bitePct: { fontSize: 11.5, color: '#B91C1C', marginTop: 7, fontWeight: '600' },
  biteWarn: { fontSize: 12, color: '#B91C1C', marginTop: 8, fontWeight: '600', lineHeight: 17 },

  driftBox: {
    flexDirection: 'row', gap: 8, backgroundColor: '#FEF3C7',
    borderRadius: 12, padding: 11, marginTop: 9,
  },
  driftText: { flex: 1, fontSize: 12, color: '#7C2D12', lineHeight: 17 },

  toggle: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16 },
  toggleText: { fontSize: 14.5, fontWeight: '600', color: '#111827' },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 15,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancel: { alignItems: 'center', paddingVertical: 11 },
  cancelText: { fontSize: 13.5, color: '#6B7280', fontWeight: '600' },

  totalsBar: {
    flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 14, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  tCol: { flex: 1, alignItems: 'center' },
  tLabel: { fontSize: 8.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.4 },
  tVal: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 3 },
  tSub: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },

  cardTop: { flexDirection: 'row', gap: 12 },
  cardCrop: { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  cardMeta: { fontSize: 12.5, color: '#6B7280', marginTop: 2 },
  cardDate: { fontSize: 11.5, color: '#9CA3AF', marginTop: 2 },
  cardNetLabel: { fontSize: 8.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.4 },
  cardNet: { fontSize: 19, fontWeight: '900', color: '#15803D' },

  paidRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11 },
  paidText: { fontSize: 12.5, color: '#15803D', fontWeight: '600' },
  unpaidRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11,
    backgroundColor: '#FEF3C7', borderRadius: 10, padding: 9,
  },
  unpaidText: { flex: 1, fontSize: 12.5, color: '#7C2D12', fontWeight: '600' },

  fab: {
    position: 'absolute', left: 16, right: 16, bottom: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 15,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  trust: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 12, padding: 11, marginTop: 10 },
  trustLabel: { fontSize: 13.5, fontWeight: '800' },
  trustLine: { fontSize: 12, color: '#6B7280', marginTop: 3, lineHeight: 17 },
  trustWarn: { fontSize: 12, color: '#B91C1C', marginTop: 3, fontWeight: '600', lineHeight: 17 },
  trustReason: { fontSize: 11.5, color: '#6B7280', marginTop: 4, lineHeight: 16 },
  trustBasis: { fontSize: 10.5, color: '#9CA3AF', marginTop: 5, lineHeight: 15 },

  buyersIntro: { fontSize: 12.5, color: '#6B7280', lineHeight: 18, marginBottom: 4 },

  fabRow: { position: 'absolute', left: 16, right: 16, bottom: 20, flexDirection: 'row', gap: 10 },
  fabInline: { position: 'relative', left: 0, right: 0, bottom: 0, flex: 1 },
  fabAlt: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#DCFCE7',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  fabAltText: { color: '#15803D', fontSize: 14, fontWeight: '700' },

  emptyWrap: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 28 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  emptyTitle: { fontSize: 16.5, fontWeight: '700', color: '#111827', textAlign: 'center' },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 6, lineHeight: 19 },
});

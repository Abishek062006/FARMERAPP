import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, Alert, Linking, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import VehicleIcon from '../../components/vehicles/VehicleIcon';
import ProgressStepper from '../../components/ProgressStepper';
import usePolling from '../../hooks/usePolling';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  GRADE_RESPONSE, gradeCheckOf, pendingGradeAnswer, postGradeResponse, gradeResponseError,
} from '../../utils/stopOutcome';

// What the farmer sees after posting a harvest: what is still on the market,
// and who is coming to collect what has sold.
//
// The pickup code lives here. Without it a driver arrives at a farm gate where
// the farmer has heard nothing about a sale — which is exactly what the
// original design did.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE FARMER ANSWERS A GRADE RECORDED AGAINST THEIR OWN LOT.
// ═══════════════════════════════════════════════════════════════════════════
//
// A driver tapping "Grade C" on a lot the farmer declared as Grade A is a
// CLAIM. This project's settled rule — written into services/trustService.js
// and into the dispute engine before it — is that a complaint raised is not a
// complaint upheld. Without a way for the farmer to answer, a gate downgrade
// would be an accusation with no defence attached, made by the person whose own
// job is being judged in the same moment, about produce the farmer can no
// longer show anybody.
//
// WHY THIS SCREEN AND NOT ANOTHER. Three candidates were weighed:
//   · shared/ReceiptScreen — reachable only from `picked_up`/`delivered` rows
//     and one order at a time, so a farmer would have to already know to go
//     looking. A claim nobody is told about is a claim nobody answers.
//   · a notification — there are none. No push, no websockets (CLAUDE.md).
//   · THIS SCREEN, which the farmer already opens to read their pickup code and
//     to mark a payment received, which polls every 8s, and whose Pickups tab
//     is literally the list of their own sales. `GET /api/orders/farmer/mine`
//     already returns the whole `pickupOutcome` block, including the grade and
//     `consignmentId` — nothing new had to be fetched.
// So the claim is put on the card for the very order it was made against, in
// the place the farmer is already looking.
//
// ⚠️ THE ANSWER IS NOT RE-OPENABLE, and that is said BEFORE the tap — on the
// panel and again in the confirmation — not discovered afterwards through a 409.
// The server guards the write on the response never having been given, exactly
// as a resolved dispute cannot be un-resolved.
// Labels are translated at render time inside the component (ORDER_STATUS_T,
// built from t()) — this map only carries the colours, keyed the same way.
const ORDER_STATUS_COLORS = {
  awaiting_agent: { bg: '#FFF7ED', fg: '#C2410C', dot: '#EA580C' },
  no_agents:      { bg: '#FEF2F2', fg: '#B91C1C', dot: '#DC2626' },
  accepted:       { bg: '#EFF6FF', fg: '#1D4ED8', dot: '#2563EB' },
  picked_up:      { bg: '#DCFCE7', fg: '#15803D', dot: '#16A34A' },
  delivered:      { bg: '#DCFCE7', fg: '#15803D', dot: '#16A34A' },
  cancelled:      { bg: '#F1F5F9', fg: '#6B7280', dot: '#9CA3AF' },
};

export default function FarmerSalesScreen({ navigation, route }) {
  // MUST stay above any early return — see the hooks-ordering note further
  // down by the `if (loading)` guard.
  const { lang, t } = useLanguage();
  const { userData, initialTab } = route.params || {};
  const uid = userData?.uid || userData?.firebaseUid;

  const ORDER_STATUS_T = {
    awaiting_agent: { label: t('farmerSales.statusFindingDriver'), ...ORDER_STATUS_COLORS.awaiting_agent },
    no_agents:      { label: t('farmerSales.statusNoDriver'),      ...ORDER_STATUS_COLORS.no_agents },
    accepted:       { label: t('farmerSales.statusDriverComing'),  ...ORDER_STATUS_COLORS.accepted },
    picked_up:      { label: t('farmerSales.statusCollected'),     ...ORDER_STATUS_COLORS.picked_up },
    delivered:      { label: t('farmerSales.statusDelivered'),     ...ORDER_STATUS_COLORS.delivered },
    cancelled:      { label: t('farmerSales.statusCancelled'),     ...ORDER_STATUS_COLORS.cancelled },
  };

  // Lets a caller (e.g. FarmerMarketScreen's "requests" link) open straight
  // to the Offers tab instead of a farmer landing on Orders and hunting for it.
  const [tab, setTab] = useState(initialTab === 'offers' ? 'offers' : 'orders');
  const [orders, setOrders] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settling, setSettling] = useState(null);   // order id mid-request
  const [offers, setOffers] = useState([]);
  const [acting, setActing] = useState(null);       // offer id mid-request
  const [counterFor, setCounterFor] = useState(null);   // offer id showing the counter field
  const [counterPrice, setCounterPrice] = useState('');
  // G2 — the payment record behind each buyer, keyed by vendorUid. The GSTIN
  // badge says a number was issued; this says whether they actually settle.
  const [trust, setTrust] = useState({});
  // The farmer's answer to a gate downgrade. Held HERE and not inside OrderCard
  // because OrderCard is a render function with no hooks of its own — the same
  // shape the counter-offer field already uses, and the reason the hook count
  // on this screen cannot change between renders.
  const [gradeNote, setGradeNote] = useState('');      // the note being typed
  const [gradeNoteFor, setGradeNoteFor] = useState(null);   // which order it belongs to
  const [answeringGrade, setAnsweringGrade] = useState(null);   // order id in flight

  // Records that the vendor has paid the farmer for the crop. The server is
  // the guard (it rejects a second attempt with ALREADY_SETTLED), so this
  // only needs to keep the button from being tapped twice in flight.
  const markPaid = async (order) => {
    Alert.alert(
      t('farmerSales.markPaidTitle'),
      `${t('farmerSales.markPaidMsgPrefix')} ₹${(order.farmerPayout ?? order.cropTotal)?.toLocaleString('en-IN')} ${t('farmerSales.from')} ${order.vendorName}.`,
      [
        { text: t('farmerSales.notYet'), style: 'cancel' },
        {
          text: t('farmerSales.yesReceived'),
          onPress: async () => {
            setSettling(order._id);
            try {
              const r = await axios.post(`${API_ENDPOINTS.ORDERS}/${order._id}/settle`, { method: 'cash' });
              if (r.data.success) {
                setOrders((prev) => prev.map((o) => (o._id === order._id ? r.data.order : o)));
              }
            } catch (err) {
              Alert.alert(t('farmerSales.couldNotUpdate'), err.response?.data?.error || t('farmerSales.tryAgain'));
            } finally {
              setSettling(null);
            }
          },
        },
      ]
    );
  };

  // ── THE FARMER ANSWERS A GATE DOWNGRADE ────────────────────────────
  //
  // Two answers, and they are NOT equivalent:
  //   accepted   "yes, it was the lower grade". A CONCESSION, and the only
  //              form of this record services/trustService.js will ever look
  //              at — the same evidence class as agreeing a refund on a
  //              grievance.
  //   contested  "no, it was not". COSTS THE FARMER NOTHING. The claim stays
  //              on the record as the collector's claim, the buyer still sees
  //              it, and it does not count against the farmer.
  //
  // Neither one moves a rupee. The payable already follows actually-collected
  // kilograms; grade is a fact the two parties argue about and this app does
  // not arbitrate. And neither one can be taken back — said here, in the
  // confirmation, and on the panel above it.
  const answerGrade = (order, response) => {
    const accepting = response === GRADE_RESPONSE.ACCEPT;
    Alert.alert(
      t(accepting ? 'farmerSales.gradeAcceptTitle' : 'farmerSales.gradeContestTitle'),
      `${t(accepting ? 'farmerSales.gradeAcceptBody' : 'farmerSales.gradeContestBody')}\n\n`
      + t('farmerSales.gradeFinalWarning'),
      [
        { text: t('farmerSales.notYet'), style: 'cancel' },
        {
          text: t(accepting ? 'farmerSales.gradeAcceptYes' : 'farmerSales.gradeContestYes'),
          onPress: async () => {
            setAnsweringGrade(order._id);
            try {
              const r = await postGradeResponse(order.consignmentId, {
                orderId: order._id,
                response,
                note: gradeNoteFor === order._id ? gradeNote.trim() : '',
              });
              if (r.data?.success) {
                setGradeNote('');
                setGradeNoteFor(null);
                // The route answers with the grade block, not the order — so
                // our own copy is patched rather than replaced, and the panel
                // flips at once instead of waiting out the poll.
                setOrders((prev) => prev.map((o) => (o._id === order._id
                  ? {
                    ...o,
                    pickupOutcome: {
                      ...(o.pickupOutcome || {}),
                      grade: { ...(o.pickupOutcome?.grade || {}), ...(r.data.grade || {}) },
                    },
                  }
                  : o)));
                // Our own words, not the server's sentence: that sentence is
                // English and this screen follows the language toggle.
                Alert.alert(
                  t(accepting ? 'farmerSales.gradeAcceptedTitle' : 'farmerSales.gradeContestedTitle'),
                  t(accepting ? 'farmerSales.gradeAcceptedBody' : 'farmerSales.gradeContestedBody')
                );
              }
            } catch (err) {
              // Every refusal this route can give, by code — including a 404
              // from answering somebody else's lot, or one on a run that is
              // gone. Both mean "this is not yours to answer".
              const code = gradeResponseError(err);
              Alert.alert(t('farmerSales.couldNotUpdate'), t({
                NOTHING_TO_ANSWER: 'farmerSales.gradeErrNothing',
                BAD_RESPONSE: 'farmerSales.gradeErrBad',
                ALREADY_ANSWERED: 'farmerSales.gradeErrAlready',
                NOT_YOURS: 'farmerSales.gradeErrNotYours',
                GENERIC: 'farmerSales.tryAgain',
              }[code]));
              fetchAll();   // our copy is stale; the server just told us so
            } finally {
              setAnsweringGrade(null);
            }
          },
        },
      ]
    );
  };

  const fetchAll = useCallback(async () => {
    const [o, l, f] = await Promise.all([
      axios.get(`${API_ENDPOINTS.ORDERS}/farmer/mine`),
      axios.get(`${API_ENDPOINTS.LISTINGS}/farmer/${uid}`),
      // Offers are a bonus panel: a failure here must not blank the pickups.
      axios.get(`${API_ENDPOINTS.OFFERS}/farmer/mine`).catch(() => null),
    ]);
    if (o.data.success) setOrders(o.data.orders);
    if (l.data.success) setListings(l.data.listings);
    if (f?.data?.success) setOffers(f.data.offers);
    setLoading(false);
    setRefreshing(false);
  }, [uid]);

  usePolling(fetchAll, 8000, true);

  // ── C1: respond to a buyer's offer ─────────────────────────────────
  const respond = async (offer, action, body) => {
    setActing(offer._id);
    try {
      const r = await axios.put(`${API_ENDPOINTS.OFFERS}/${offer._id}/${action}`, body || {});
      if (r.data.success) {
        setOffers((prev) => prev.map((o) => (o._id === offer._id ? r.data.offer : o)));
        if (action === 'accept') {
          Alert.alert(
            t('farmerSales.priceAgreedTitle'),
            `₹${r.data.offer.agreedPricePerKg}/kg ${t('farmerSales.for')} ${offer.quantityKg} kg. ${offer.vendorName} ${t('farmerSales.priceAgreedMsgSuffix')}`
          );
        }
      }
    } catch (err) {
      Alert.alert(t('farmerSales.couldNotUpdate'), err.response?.data?.error || t('farmerSales.tryAgain'));
      fetchAll();   // our copy is stale; the server just told us so
    } finally {
      setActing(null);
    }
  };

  const acceptOffer = (offer) => {
    const price = offer.status === 'countered' ? offer.counterPricePerKg : offer.offerPricePerKg;
    Alert.alert(
      t('farmerSales.acceptOfferTitle'),
      `₹${price}/kg ${t('farmerSales.for')} ${offer.quantityKg} kg = ₹${(price * offer.quantityKg).toLocaleString('en-IN')}.`,
      [{ text: t('farmerSales.notNow'), style: 'cancel' },
       { text: t('farmerSales.accept'), onPress: () => respond(offer, 'accept') }]
    );
  };

  const declineOffer = (offer) =>
    Alert.alert(t('farmerSales.declineOfferTitle'), `${t('farmerSales.fromCap')} ${offer.vendorName}.`,
      [{ text: t('farmerSales.cancel'), style: 'cancel' },
       { text: t('farmerSales.decline'), style: 'destructive', onPress: () => respond(offer, 'decline') }]);

  // Counter uses an inline field rather than Alert.prompt, which is iOS-only —
  // most of these farmers are on Android.
  const counterOffer = (offer) => {
    setCounterPrice(String(offer.askingPricePerKg));
    setCounterFor(offer._id);
  };

  const sendCounter = (offer) => {
    const n = parseFloat(counterPrice);
    if (!(n > 0)) return Alert.alert(t('farmerSales.enterPriceTitle'), t('farmerSales.enterPriceMsg'));
    setCounterFor(null);
    respond(offer, 'counter', { counterPricePerKg: n });
  };

  const withdraw = (listing) =>
    Alert.alert(t('farmerSales.removeFromMarketTitle'), `${listing.cropName} ${t('farmerSales.willNoLongerBeVisible')}`, [
      { text: t('farmerSales.keep'), style: 'cancel' },
      {
        text: t('farmerSales.remove'), style: 'destructive',
        onPress: async () => {
          try {
            await axios.put(`${API_ENDPOINTS.LISTINGS}/${listing._id}/withdraw`);
            fetchAll();
          } catch (err) {
            Alert.alert(t('farmerSales.couldNotRemove'), err.response?.data?.error || t('farmerSales.tryAgain'));
          }
        },
      },
    ]);

  // ── THE ADVANCE, CONFIRMED BY THE PERSON IT LANDS WITH ─────────────────
  //
  // Only the farmer can say an advance arrived. The buyer AGREED it at order
  // time; a buyer marking their own payment as sent would be the
  // self-certification this app refuses everywhere else — and the whole point
  // of an advance is that the farmer stops carrying the trade alone, which a
  // buyer-asserted flag would not achieve. Server enforces it (farmer-only);
  // this is the same rule said before anybody taps.
  const confirmAdvance = (order) => {
    const amt = order.settlement?.advance?.agreedAmount || 0;
    Alert.alert(
      t('farmerSales.advanceConfirmTitle'),
      `${t('farmerSales.advanceConfirmPrefix')} ₹${amt.toLocaleString('en-IN')} ${t('farmerSales.from')} ${order.vendorName}. ${t('farmerSales.advanceConfirmBody')}`,
      [
        { text: t('fpo.cancel'), style: 'cancel' },
        {
          text: t('farmerSales.advanceGotIt'),
          onPress: async () => {
            setSettling(order._id);
            try {
              await axios.post(`${API_ENDPOINTS.ORDERS}/${order._id}/settle-advance`, { method: 'cash' });
              await fetchAll();
            } catch (e) {
              Alert.alert(t('farmerSales.errTitle'), e.response?.data?.error || t('fpo.tryAgain'));
            } finally {
              setSettling(null);
            }
          },
        },
      ],
    );
  };

  const OrderCard = ({ item }) => {
    const st = ORDER_STATUS_T[item.status] || ORDER_STATUS_T.awaiting_agent;
    const showCode = ['accepted'].includes(item.status);
    // Only once the crop has actually left the farm, and only while unpaid —
    // mirrors the server-side guard on POST /orders/:id/settle.
    const canSettle =
      ['picked_up', 'delivered'].includes(item.status) && !item.settlement?.farmerPaid;

    // ── ADVANCE AND BALANCE ────────────────────────────────────────────
    // `agreedAmount > 0 && !receivedAt` is a PROMISE the buyer has not kept —
    // a different fact from "no advance", and the one the farmer most needs to
    // see, because it is the money they are about to load a truck on.
    const adv = item.settlement?.advance || {};
    const advAgreed = Number(adv.agreedAmount) || 0;
    const advReceived = !!adv.receivedAt;
    const advPending = advAgreed > 0 && !advReceived && !item.settlement?.farmerPaid;
    const payout = item.farmerPayout ?? item.cropTotal ?? 0;
    // Can be NEGATIVE after a short pickup — the farmer would then be holding
    // the buyer's money. Rendered as its own case rather than clamped.
    const balance = payout - (advReceived ? advAgreed : 0);

    // A lower grade recorded at the gate against THIS lot. The claim is shown
    // whenever one exists — answered or not — because it is on the farmer's own
    // record either way and hiding a standing claim from the person it is about
    // would be worse than showing a button they cannot press.
    const gradeCheck = gradeCheckOf(item.pickupOutcome?.grade);
    const gradePending = pendingGradeAnswer(item);
    const gradeBusy = answeringGrade === item._id;
    const noteOpen = gradeNoteFor === item._id;
    const byRoleKey = item.pickupOutcome?.recordedByRole === 'fpo_driver'
      ? 'farmerSales.gradeByDriver'
      : item.pickupOutcome?.recordedByRole === 'fpo_admin'
        ? 'farmerSales.gradeByOffice'
        : 'farmerSales.gradeByCaptain';

    return (
      <View style={s.card}>
        <View style={s.topRow}>
          <View style={[s.chip, { backgroundColor: st.bg }]}>
            <View style={[s.dot, { backgroundColor: st.dot }]} />
            <Text style={[s.chipText, { color: st.fg }]}>{st.label}</Text>
          </View>
          <Text style={s.date}>
            {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </Text>
        </View>

        <View style={s.cropRow}>
          <View style={s.cropIcon}><Text style={{ fontSize: 20 }}>🌾</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.cropName}>{item.quantityKg} kg {item.cropName}</Text>
            <Text style={s.cropSub}>{t('farmerSales.soldTo')} {item.vendorName}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.earnLabel}>{t('farmerSales.youGet')}</Text>
            <Text style={s.earnValue}>
              ₹{(item.farmerPayout ?? item.cropTotal)?.toLocaleString('en-IN')}
            </Text>
          </View>
        </View>

        {/* Phase 5, T2 — the same progress spine the buyer sees, on the
            farmer's own copy of this order. */}
        <ProgressStepper status={item.status} kind="order" compact />

        {showCode && (
          <View style={s.otpBox}>
            <View style={{ flex: 1 }}>
              <Text style={s.otpLabel}>{t('farmerSales.pickupCode')}</Text>
              <Text style={s.otpHint}>{t('farmerSales.pickupCodeHint')}</Text>
            </View>
            <Text style={s.otpValue}>{item.pickupOtp}</Text>
          </View>
        )}

        {/* ── A LOWER GRADE WAS RECORDED AGAINST THIS LOT ──────────────
            It is a claim by whoever collected it, and only the farmer
            conceding turns it into evidence anywhere else in the app. Shown on
            the card for the very order it was made against — there are no push
            notifications in this app, so a claim the farmer is not shown is a
            claim nobody answers. */}
        {gradeCheck.downgraded && (
          <View style={s.gradeBox}>
            <View style={s.gradeHead}>
              <Ionicons name="pricetag-outline" size={16} color="#B45309" />
              <Text style={s.gradeTitle}>{t('farmerSales.gradeClaimTitle')}</Text>
            </View>

            <Text style={s.gradeClaim}>
              {t('farmerSales.gradeYouDeclared')} {gradeCheck.declared}
              {'  ·  '}
              {t('farmerSales.gradeTheyRecorded')} {gradeCheck.observed}
            </Text>
            <Text style={s.gradeWho}>{t(byRoleKey)}</Text>

            {/* WHAT IT DOES NOT DO, stated before either button. */}
            <View style={s.gradeFactRow}>
              <Ionicons name="cash-outline" size={13} color="#92400E" />
              <Text style={s.gradeFact}>{t('farmerSales.gradeNoMoney')}</Text>
            </View>
            <View style={s.gradeFactRow}>
              <Ionicons name="shield-checkmark-outline" size={13} color="#92400E" />
              <Text style={s.gradeFact}>{t('farmerSales.gradeContestFree')}</Text>
            </View>
            <View style={s.gradeFactRow}>
              <Ionicons name="document-text-outline" size={13} color="#92400E" />
              <Text style={s.gradeFact}>{t('farmerSales.gradeStaysEitherWay')}</Text>
            </View>

            {gradePending ? (
              <>
                {/* IRREVERSIBILITY, BEFORE THE TAP — never discovered
                    afterwards through a 409. It is repeated in the
                    confirmation dialog. */}
                <Text style={s.gradeFinal}>{t('farmerSales.gradeFinalWarning')}</Text>

                {noteOpen ? (
                  <TextInput
                    style={s.gradeNoteInput}
                    value={gradeNote}
                    onChangeText={setGradeNote}
                    placeholder={t('farmerSales.gradeNotePlaceholder')}
                    placeholderTextColor="#D1D5DB"
                    multiline
                    maxLength={300}
                  />
                ) : (
                  <TouchableOpacity
                    onPress={() => { setGradeNoteFor(item._id); setGradeNote(''); }}
                    hitSlop={6}
                  >
                    <Text style={s.gradeNoteLink}>{t('farmerSales.gradeAddNote')}</Text>
                  </TouchableOpacity>
                )}

                {/* TWO BUTTONS OF EQUAL WEIGHT. Neither is the primary green
                    action: conceding is the answer that reaches the farmer's
                    own record, and a screen that styled it as the obvious tap
                    would be nudging them into it. */}
                <View style={s.gradeActions}>
                  <TouchableOpacity
                    style={[s.gradeBtn, s.gradeAcceptBtn, gradeBusy && { opacity: 0.5 }]}
                    disabled={gradeBusy}
                    onPress={() => answerGrade(item, GRADE_RESPONSE.ACCEPT)}
                    activeOpacity={0.85}
                  >
                    {gradeBusy
                      ? <ActivityIndicator size="small" color="#B45309" />
                      : <Text style={s.gradeAcceptText}>{t('farmerSales.gradeAcceptBtn')}</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.gradeBtn, s.gradeContestBtn, gradeBusy && { opacity: 0.5 }]}
                    disabled={gradeBusy}
                    onPress={() => answerGrade(item, GRADE_RESPONSE.CONTEST)}
                    activeOpacity={0.85}
                  >
                    <Text style={s.gradeContestText}>{t('farmerSales.gradeContestBtn')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={s.gradeAnswered}>
                <Ionicons
                  name={gradeCheck.farmerResponse === 'accepted'
                    ? 'checkmark-circle-outline' : 'close-circle-outline'}
                  size={14}
                  color="#92400E"
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.gradeAnsweredText}>
                    {gradeCheck.farmerResponse
                      ? t(gradeCheck.farmerResponse === 'accepted'
                        ? 'farmerSales.gradeYouAccepted' : 'farmerSales.gradeYouContested')
                      : t('farmerSales.gradeNoRunToAnswer')}
                    {gradeCheck.farmerRespondedAt
                      ? ` · ${new Date(gradeCheck.farmerRespondedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                      : ''}
                  </Text>
                  {!!gradeCheck.farmerResponseNote && (
                    <Text style={s.gradeAnsweredNote}>“{gradeCheck.farmerResponseNote}”</Text>
                  )}
                </View>
              </View>
            )}
          </View>
        )}

        {/* The crop money. The driver collects the FARE from the buyer, not
            this — so without a line telling the farmer to collect it, and a
            record of whether they did, the farmer's payment simply never
            happened. The app records the settlement; it does not move money,
            which is why the farmer confirms rather than the system assuming. */}
        {canSettle && (
          <View style={s.payBox}>
            <Ionicons name="cash-outline" size={18} color="#C2410C" />
            <View style={{ flex: 1 }}>
              <Text style={s.payText}>
                {/* The BALANCE when an advance is already in, the whole amount
                    otherwise. Printing the full payout beside a received
                    advance would be asking for money twice. */}
                {t('farmerSales.collect')} <Text style={{ fontWeight: '800' }}>
                  ₹{Math.max(0, balance).toLocaleString('en-IN')}
                </Text> {t('farmerSales.from')} {item.vendorName}
              </Text>
              {advReceived && (
                <Text style={s.payHint}>
                  {t('farmerSales.advanceAlreadyIn')} ₹{advAgreed.toLocaleString('en-IN')} · {t('farmerSales.ofTotal')} ₹{payout.toLocaleString('en-IN')}
                </Text>
              )}
              <Text style={s.payHint}>{t('farmerSales.driverFareOnly')}</Text>
            </View>
            <TouchableOpacity
              style={[s.payChip, settling === item._id && { opacity: 0.5 }]}
              disabled={settling === item._id}
              onPress={() => markPaid(item)}
            >
              {settling === item._id
                ? <ActivityIndicator size="small" color="#16A34A" />
                : <Text style={s.payChipText}>{t('farmerSales.markPaidBtn')}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── AN ADVANCE THE BUYER PROMISED AND HAS NOT SENT ──────────────
            The most important thing on this card, and it is shown BEFORE the
            crop moves. "Agreed" and "received" are stored as different facts
            precisely so this case can be rendered as what it is: a promise,
            not money. A farmer should not load a truck on it. */}
        {advPending && (
          <View style={s.advPendingBox}>
            <Ionicons name="hourglass-outline" size={16} color="#B45309" />
            <View style={{ flex: 1 }}>
              <Text style={s.advPendingText}>
                {t('farmerSales.advancePromised')} <Text style={{ fontWeight: '800' }}>
                  ₹{advAgreed.toLocaleString('en-IN')}
                </Text> ({adv.agreedPct}%)
              </Text>
              <Text style={s.advPendingHint}>{t('farmerSales.advanceNotYetHint')}</Text>
            </View>
            <TouchableOpacity
              style={[s.payChip, settling === item._id && { opacity: 0.5 }]}
              disabled={settling === item._id}
              onPress={() => confirmAdvance(item)}
            >
              {settling === item._id
                ? <ActivityIndicator size="small" color="#16A34A" />
                : <Text style={s.payChipText}>{t('farmerSales.advanceGotIt')}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ⚠️ THE ADVANCE CAME TO MORE THAN THE LOT TURNED OUT TO BE WORTH.
            A short pickup rewrites the payout downward, so the farmer can end
            up holding the buyer's money. Reported plainly rather than hidden
            behind a clamped zero — it is a real thing two people have to
            settle, and the farmer needs to know before the buyer rings. */}
        {advReceived && balance < 0 && !item.settlement?.farmerPaid && (
          <View style={s.overpaidBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
            <Text style={s.overpaidText}>
              {t('farmerSales.advanceOverpaid')} ₹{Math.abs(balance).toLocaleString('en-IN')}
            </Text>
          </View>
        )}

        {['picked_up', 'delivered'].includes(item.status) && (
          <TouchableOpacity
            style={s.receiptRow}
            onPress={() => navigation.navigate('Receipt', { orderId: item._id })}
          >
            <Ionicons name="receipt-outline" size={14} color="#6B7280" />
            <Text style={s.receiptText}>{t('farmerSales.viewReceipt')}</Text>
            <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
          </TouchableOpacity>
        )}

        {item.settlement?.farmerPaid && (
          <View style={s.paidBox}>
            <Ionicons name="checkmark-circle" size={16} color="#15803D" />
            <Text style={s.paidText}>
              ₹{(item.farmerPayout ?? item.cropTotal)?.toLocaleString('en-IN')} {t('farmerSales.received')}
              {item.settlement.paidAt
                ? ` · ${new Date(item.settlement.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                : ''}
            </Text>
          </View>
        )}

        {!!item.agentName && (
          <View style={s.agentBox}>
            <VehicleIcon type={item.vehicleType} width={44} />
            <View style={{ flex: 1 }}>
              <Text style={s.agentName}>{item.agentName}</Text>
              <Text style={s.agentSub}>{item.agentVehicleNumber || t('farmerSales.vehicleNumberPending')}</Text>
            </View>
            {!!item.agentPhone && (
              <TouchableOpacity style={s.callChip} onPress={() => Linking.openURL(`tel:${item.agentPhone}`)}>
                <Ionicons name="call" size={13} color="#2563EB" />
                <Text style={s.callChipText}>{t('farmerSales.call')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const ListingCard = ({ item }) => {
    const sold = item.quantityKg - item.quantityAvailableKg;
    const pct = item.quantityKg ? Math.round((sold / item.quantityKg) * 100) : 0;
    const live = item.status === 'available';

    return (
      <View style={s.card}>
        <View style={s.topRow}>
          <View style={[s.chip, { backgroundColor: live ? '#DCFCE7' : '#F1F5F9' }]}>
            <View style={[s.dot, { backgroundColor: live ? '#16A34A' : '#9CA3AF' }]} />
            <Text style={[s.chipText, { color: live ? '#15803D' : '#6B7280' }]}>
              {live ? t('farmerSales.onMarket') : item.status === 'sold_out' ? t('farmerSales.soldOut') : t('farmerSales.removed')}
            </Text>
          </View>
          {live && (
            <TouchableOpacity onPress={() => withdraw(item)} hitSlop={8}>
              <Text style={s.removeText}>{t('farmerSales.remove')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.cropRow}>
          {item.proofImageId ? (
            <Image source={{ uri: API_ENDPOINTS.LISTING_PHOTO(item.proofImageId) }} style={s.thumb} />
          ) : (
            <View style={s.cropIcon}><Text style={{ fontSize: 20 }}>🌾</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.cropName}>{item.cropName}</Text>
            <Text style={s.cropSub}>₹{item.pricePerKg}/kg · {t('farmerSales.minQty')} {item.minOrderKg} kg</Text>
          </View>
        </View>

        <View style={s.progressWrap}>
          <View style={s.progressBar}><View style={[s.progressFill, { width: `${pct}%` }]} /></View>
          <Text style={s.progressText}>
            {sold} {t('farmerSales.of')} {item.quantityKg} {t('farmerSales.kgSold')}{live ? ` · ${item.quantityAvailableKg} ${t('farmerSales.kgLeft')}` : ''}
          </Text>
        </View>

        {/* ── SOLD, BUT STILL ON YOUR FARM ────────────────────────────────
            Buying decrements this listing and a lapsed dispatch does NOT put
            the kilograms back, so without this panel the farmer sees 600 kg
            where they had 1,000 and nothing anywhere says where 400 went.
            The dispatch window is four hours, so this can be a long silence. */}
        {item.committed?.totalKg > 0 && (
          <View style={s.heldBox}>
            <View style={s.heldHead}>
              <Ionicons name="cube-outline" size={15} color="#B45309" />
              <Text style={s.heldTitle}>
                {item.committed.totalKg} {t('farmerSales.kgHeldForDelivery')}
              </Text>
            </View>
            {item.committed.comingKg > 0 && (
              <Text style={s.heldLine}>
                • {item.committed.comingKg} kg — {t('farmerSales.heldDriverComing')}
              </Text>
            )}
            {item.committed.waitingKg > 0 && (
              <Text style={s.heldLine}>
                • {item.committed.waitingKg} kg — {t('farmerSales.heldFindingDriver')}
              </Text>
            )}
            {/* The one that needs action, and it is not the farmer's action to
                take — saying so stops them waiting on something that has
                already stopped moving. */}
            {item.committed.stuckKg > 0 && (
              <Text style={[s.heldLine, s.heldStuck]}>
                • {item.committed.stuckKg} kg — {t('farmerSales.heldNoDriver')}
              </Text>
            )}
          </View>
        )}

        {/* H2 entry point. Only on a live lot with stock left — asking "should
            I hold?" about a lot that is already sold is noise. */}
        {live && item.quantityAvailableKg > 0 && (
          <TouchableOpacity
            style={s.holdLink}
            onPress={() => navigation.navigate('HoldDecision', {
              userData,
              listing: {
                cropName: item.cropName,
                quantityKg: item.quantityAvailableKg,
                pricePerKg: item.pricePerKg,
              },
            })}
            activeOpacity={0.7}
          >
            <Ionicons name="trending-up-outline" size={15} color="#15803D" />
            <Text style={s.holdLinkText}>{t('farmerSales.sellOrHold')}</Text>
            <Ionicons name="chevron-forward" size={15} color="#15803D" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // G2 — the payment record behind each buyer on screen.
  //
  // ⚠️ MUST STAY ABOVE THE `if (loading)` RETURN BELOW. Placed after it, this
  // hook does not run on the first render (loading is true) and does run on the
  // second, so React sees the hook count change and throws "Rendered more hooks
  // than during the previous render" — the screen crashes the moment the data
  // arrives. Every hook in this component belongs above that return.
  //
  // One request per distinct buyer, once. Offers from the same buyer share a
  // record, and refetching per card would hammer the endpoint.
  React.useEffect(() => {
    const uids = [...new Set(offers.map((o) => o.vendorUid).filter(Boolean))]
      .filter((u) => !(u in trust));
    if (!uids.length) return;
    let cancelled = false;
    (async () => {
      const found = {};
      await Promise.all(uids.map(async (uid) => {
        try {
          const r = await axios.get(`${API_ENDPOINTS.USERS}/trust/${uid}`);
          if (r.data.success) found[uid] = r.data.trust;
        } catch { found[uid] = null; }
      }));
      if (!cancelled) setTrust((t) => ({ ...t, ...found }));
    })();
    return () => { cancelled = true; };
  }, [offers, trust]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#16A34A" /></View>;
  }

  const OFFER_STATUS = {
    pending:   { label: t('farmerSales.waitingOnYou'), bg: '#FFF7ED', fg: '#C2410C' },
    countered: { label: t('farmerSales.youCounteredStatus'),  bg: '#EFF6FF', fg: '#1D4ED8' },
    accepted:  { label: t('farmerSales.agreed'),         bg: '#DCFCE7', fg: '#15803D' },
    declined:  { label: t('farmerSales.declined'),       bg: '#F1F5F9', fg: '#6B7280' },
    withdrawn: { label: t('farmerSales.withdrawn'),      bg: '#F1F5F9', fg: '#6B7280' },
    expired:   { label: t('farmerSales.expired'),        bg: '#F1F5F9', fg: '#9CA3AF' },
  };

  // C2: what the badge is allowed to claim. Written once, here, so no screen
  // can quietly upgrade "we checked the number's format" into "we verified
  // this business". Mirrors GET /api/users/badge/:uid on the server.
  const BUYER_BADGE = {
    verified:            { label: t('farmerSales.verifiedBuyer'), icon: 'shield-checkmark', fg: '#15803D', bg: '#DCFCE7' },
    documents_submitted: { label: t('farmerSales.gstinOnFile'),  icon: 'document-text-outline', fg: '#1D4ED8', bg: '#DBEAFE' },
    rejected:            { label: t('farmerSales.notVerified'),   icon: 'alert-circle-outline', fg: '#B91C1C', bg: '#FEE2E2' },
    unverified:          { label: t('farmerSales.noDocuments'),   icon: 'help-circle-outline', fg: '#9CA3AF', bg: '#F1F5F9' },
  };

  // Numbers, never a bare verdict. Below the service's threshold there is no
  // band at all — two late settlements must not brand a real buyer.
  const PAY_BAND = {
    prompt:  { label: t('farmerSales.paysPromptly'), fg: '#15803D', bg: '#DCFCE7' },
    average: { label: t('farmerSales.paysInAWeekOrTwo'), fg: '#1D4ED8', bg: '#DBEAFE' },
    slow:    { label: t('farmerSales.paysSlowly'), fg: '#B45309', bg: '#FEF3C7' },
    unpaid:  { label: t('farmerSales.noSettlementRecorded'), fg: '#B91C1C', bg: '#FEE2E2' },
  };

  const OfferCard = ({ item }) => {
    const st = OFFER_STATUS[item.status] || OFFER_STATUS.pending;
    const live = item.status === 'pending';
    const price = item.status === 'countered' ? item.counterPricePerKg
      : item.agreedPricePerKg ?? item.offerPricePerKg;
    const vsAsking = ((item.offerPricePerKg - item.askingPricePerKg) / item.askingPricePerKg) * 100;
    const busy = acting === item._id;

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

        <View style={s.cropRow}>
          <View style={s.cropIcon}><Text style={{ fontSize: 20 }}>🤝</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.cropName}>{item.quantityKg} kg {item.cropName}</Text>
            <Text style={s.cropSub}>{item.vendorTradeName || item.vendorCompany || item.vendorName}</Text>
            {(() => {
              const b = BUYER_BADGE[item.vendorVerification] || BUYER_BADGE.unverified;
              return (
                <View style={[s.badge, { backgroundColor: b.bg }]}>
                  <Ionicons name={b.icon} size={11} color={b.fg} />
                  <Text style={[s.badgeText, { color: b.fg }]}>{b.label}</Text>
                </View>
              );
            })()}
            {(() => {
              const trustInfo = trust[item.vendorUid];
              if (!trustInfo || trustInfo.trades === 0) return null;
              const pb = trustInfo.scored ? PAY_BAND[trustInfo.band] : null;
              return (
                <View style={s.payRow}>
                  <Text style={[s.payLabel, { color: pb ? pb.fg : '#9CA3AF' }]}>
                    {pb ? pb.label : `${trustInfo.trades} ${t('farmerSales.pastSalesTooFew')}`}
                  </Text>
                  {pb && (
                    <Text style={s.payDetail}>
                      {trustInfo.trades} {t('farmerSales.settled')}{trustInfo.medianDaysToPay != null ? ` · ${t('farmerSales.usually')} ${trustInfo.medianDaysToPay}d` : ''}
                      {trustInfo.unpaidCount > 0 ? ` · ${trustInfo.unpaidCount} ${t('farmerSales.unsettled')}` : ''}
                    </Text>
                  )}
                </View>
              );
            })()}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.earnLabel}>{t('farmerSales.theyOffer')}</Text>
            <Text style={s.earnValue}>₹{price}/kg</Text>
          </View>
        </View>

        <View style={s.offerMeta}>
          <Text style={s.offerMetaText}>
            ₹{(price * item.quantityKg).toLocaleString('en-IN')} {t('farmerSales.total')}
            {'  ·  '}{t('farmerSales.youAsked')} ₹{item.askingPricePerKg}/kg
            {Math.abs(vsAsking) >= 1 && (
              <Text style={{ color: vsAsking < 0 ? '#B45309' : '#15803D', fontWeight: '700' }}>
                {'  '}{vsAsking > 0 ? '+' : ''}{vsAsking.toFixed(0)}%
              </Text>
            )}
          </Text>
          {!!item.message && <Text style={s.offerMsg}>“{item.message}”</Text>}
          {item.status === 'countered' && (
            <Text style={s.offerMsg}>
              {t('farmerSales.youCounteredAt')} ₹{item.counterPricePerKg}/kg — {t('farmerSales.waitingFor')} {item.vendorName}.
            </Text>
          )}
          {item.status === 'accepted' && (
            <Text style={[s.offerMsg, { color: '#15803D' }]}>
              {t('farmerSales.agreedAt')} ₹{item.agreedPricePerKg}/kg. {item.vendorName} {t('farmerSales.bookTransportNext')}
            </Text>
          )}
        </View>

        {live && counterFor === item._id && (
          <View style={s.counterRow}>
            <TextInput
              style={s.counterInput}
              value={counterPrice}
              onChangeText={setCounterPrice}
              keyboardType="numeric"
              placeholder="₹/kg"
              placeholderTextColor="#9CA3AF"
              autoFocus
            />
            <TouchableOpacity style={s.counterSend} onPress={() => sendCounter(item)}>
              <Text style={s.counterSendText}>{t('farmerSales.send')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.counterCancel} onPress={() => setCounterFor(null)}>
              <Ionicons name="close" size={16} color="#6B7280" />
            </TouchableOpacity>
          </View>
        )}

        {live && counterFor !== item._id && (
          <View style={s.offerActions}>
            <TouchableOpacity style={[s.oaBtn, s.oaDecline]} disabled={busy}
              onPress={() => declineOffer(item)}>
              <Text style={s.oaDeclineText}>{t('farmerSales.decline')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.oaBtn, s.oaCounter]} disabled={busy}
              onPress={() => counterOffer(item)}>
              <Text style={s.oaCounterText}>{t('farmerSales.counterBtn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.oaBtn, s.oaAccept]} disabled={busy}
              onPress={() => acceptOffer(item)}>
              {busy ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.oaAcceptText}>{t('farmerSales.accept')}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {!!item.vendorPhone && live && (
          <TouchableOpacity style={s.callRow} onPress={() => Linking.openURL(`tel:${item.vendorPhone}`)}>
            <Ionicons name="call-outline" size={13} color="#2563EB" />
            <Text style={s.callRowText}>{t('farmerSales.call')} {item.vendorName} {t('farmerSales.beforeYouDecide')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const data = tab === 'orders' ? orders : tab === 'offers' ? offers : listings;
  const pending = orders.filter((o) => ['awaiting_agent', 'accepted'].includes(o.status)).length;
  const liveOffers = offers.filter((o) => o.status === 'pending').length;

  return (
    <View style={s.container}>
      <View style={s.tabBar}>
        {[['orders', t('farmerSales.tabPickups'), orders.length],
          ['offers', t('farmerSales.tabOffers'), offers.length],
          ['listings', t('farmerSales.tabListings'), listings.length]].map(([k, label, n]) => (
          <TouchableOpacity key={k} style={[s.tab, tab === k && s.tabOn]} onPress={() => setTab(k)}>
            <Text style={[s.tabText, tab === k && s.tabTextOn]}>{label}</Text>
            {n > 0 && (
              <View style={[s.tabBadge, { backgroundColor: tab === k ? '#DCFCE7' : '#F1F5F9' }]}>
                <Text style={[s.tabBadgeText, { color: tab === k ? '#16A34A' : '#9CA3AF' }]}>{n}</Text>
              </View>
            )}
            {k === 'orders' && pending > 0 && tab !== 'orders' && <View style={s.pendingDot} />}
            {k === 'offers' && liveOffers > 0 && tab !== 'offers' && <View style={s.pendingDot} />}
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={data}
        keyExtractor={(i) => i._id}
        renderItem={({ item }) =>
          tab === 'orders' ? <OrderCard item={item} />
            : tab === 'offers' ? <OfferCard item={item} />
              : <ListingCard item={item} />}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor="#16A34A"
            onRefresh={() => { setRefreshing(true); fetchAll(); }} />
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Ionicons
                name={tab === 'orders' ? 'cube-outline' : tab === 'offers' ? 'pricetag-outline' : 'storefront-outline'}
                size={34} color="#16A34A" />
            </View>
            <Text style={s.emptyTitle}>
              {tab === 'orders' ? t('farmerSales.noPickupsYet')
                : tab === 'offers' ? t('farmerSales.noOffersYet')
                  : t('farmerSales.nothingListedYet')}
            </Text>
            <Text style={s.emptySub}>
              {tab === 'orders'
                ? t('farmerSales.emptyPickupsSub')
                : tab === 'offers'
                  ? t('farmerSales.emptyOffersSub')
                  : t('farmerSales.emptyListingsSub')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  holdLink: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#DCFCE7', borderRadius: 12, padding: 11, marginTop: 12,
  },
  holdLinkText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#15803D' },
  heldBox: {
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 12, padding: 11, marginTop: 12, gap: 4,
  },
  heldHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heldTitle: { fontSize: 12.5, fontWeight: '700', color: '#92400E' },
  heldLine:  { fontSize: 12, lineHeight: 17, color: '#92400E', marginLeft: 21 },
  heldStuck: { fontWeight: '700' },
  payRow: { marginTop: 5 },
  payLabel: { fontSize: 11.5, fontWeight: '700' },
  payDetail: { fontSize: 10.5, color: '#9CA3AF', marginTop: 1 },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  list:      { padding: 16, gap: 12, paddingBottom: 40 },

  tabBar: { flexDirection: 'row', backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  tab:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn:  { borderBottomColor: '#16A34A' },
  tabText:      { fontSize: 14, color: '#9CA3AF', fontWeight: '600' },
  tabTextOn:    { color: '#16A34A' },
  tabBadge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  tabBadgeText: { fontSize: 11, fontWeight: '700' },
  pendingDot:   { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EA580C', marginLeft: -4, marginTop: -8 },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 5, borderWidth: 1, borderColor: '#F1F5F9',
  },
  topRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  dot:      { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 12, fontWeight: '700' },
  date:     { fontSize: 11.5, color: '#9CA3AF' },
  removeText: { fontSize: 12.5, color: '#B91C1C', fontWeight: '700' },

  cropRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cropIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' },
  thumb:    { width: 42, height: 42, borderRadius: 12, backgroundColor: '#F1F5F9' },
  cropName: { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  cropSub:  { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  earnLabel:{ fontSize: 9, color: '#9CA3AF', fontWeight: '700', letterSpacing: 0.5 },
  earnValue:{ fontSize: 17, fontWeight: '800', color: '#15803D' },

  otpBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F0FDF4', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  otpLabel: { fontSize: 12.5, color: '#15803D', fontWeight: '800' },
  otpHint:  { fontSize: 11.5, color: '#6B7280', marginTop: 2, lineHeight: 16 },
  otpValue: { fontSize: 26, fontWeight: '800', color: '#15803D', letterSpacing: 5 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2.5, marginTop: 5,
  },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
  offerMeta: { marginTop: 10, gap: 5 },
  offerMetaText: { fontSize: 12.5, color: '#6B7280' },
  offerMsg: { fontSize: 12.5, color: '#6B7280', fontStyle: 'italic', lineHeight: 17 },
  offerActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  oaBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, paddingVertical: 10, minHeight: 38,
  },
  oaDecline: { backgroundColor: '#F1F5F9' },
  oaDeclineText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  oaCounter: { backgroundColor: '#DBEAFE' },
  oaCounterText: { fontSize: 13, fontWeight: '700', color: '#1D4ED8' },
  oaAccept: { backgroundColor: '#16A34A' },
  oaAcceptText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  counterInput: {
    flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#111827',
  },
  counterSend: { backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  counterSendText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  counterCancel: { padding: 8 },
  callRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  callRowText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },
  receiptRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingTop: 11, marginTop: 11, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  receiptText: { flex: 1, fontSize: 12.5, color: '#6B7280', fontWeight: '600' },
  payBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF7ED', borderRadius: 12, padding: 12, marginTop: 10,
  },
  payText: { fontSize: 13, color: '#7C2D12', lineHeight: 18 },
  payHint: { fontSize: 11, color: '#9A3412', marginTop: 2 },
  advPendingBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFFBEB', borderRadius: 14, padding: 12, marginTop: 10,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  advPendingText: { fontSize: 13, color: '#92400E' },
  advPendingHint: { fontSize: 11, color: '#B45309', marginTop: 2, lineHeight: 15 },
  overpaidBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 14, padding: 12, marginTop: 10,
    borderWidth: 1, borderColor: '#FECACA',
  },
  overpaidText: { flex: 1, fontSize: 12, color: '#B91C1C', lineHeight: 17 },
  payChip: {
    backgroundColor: '#DCFCE7', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 7, minWidth: 76, alignItems: 'center',
  },
  payChipText: { fontSize: 12, fontWeight: '700', color: '#15803D' },
  // The gate-downgrade panel. Amber, not red: a recorded difference is a claim
  // to answer, not a penalty, and colouring it as damage would tell the farmer
  // something about their money that is not true.
  gradeBox: {
    backgroundColor: '#FFFBEB', borderRadius: 14, padding: 13, marginTop: 12,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  gradeHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  gradeTitle: { flex: 1, fontSize: 12.5, fontWeight: '800', color: '#B45309' },
  gradeClaim: { fontSize: 13.5, fontWeight: '800', color: '#92400E', lineHeight: 19 },
  gradeWho: { fontSize: 11, color: '#B45309', marginTop: 3, marginBottom: 9 },
  gradeFactRow: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', marginBottom: 6 },
  gradeFact: { flex: 1, fontSize: 11.5, color: '#92400E', lineHeight: 16 },
  gradeFinal: {
    fontSize: 11.5, fontWeight: '800', color: '#7C2D12', lineHeight: 16,
    marginTop: 4, marginBottom: 10,
  },
  gradeNoteLink: { fontSize: 12, fontWeight: '700', color: '#B45309', marginBottom: 10 },
  gradeNoteInput: {
    borderWidth: 1.5, borderColor: '#FDE68A', borderRadius: 11, backgroundColor: '#fff',
    fontSize: 12.5, color: '#111827', padding: 10, marginBottom: 10,
    minHeight: 56, textAlignVertical: 'top',
  },
  gradeActions: { flexDirection: 'row', gap: 9 },
  // Same size, same weight, same neutrality. Neither answer is the app's
  // suggestion.
  gradeBtn: {
    flex: 1, borderRadius: 11, paddingVertical: 11, alignItems: 'center',
    borderWidth: 1.5, backgroundColor: '#fff',
  },
  gradeAcceptBtn: { borderColor: '#FCD34D' },
  gradeAcceptText: { fontSize: 12.5, fontWeight: '700', color: '#B45309' },
  gradeContestBtn: { borderColor: '#CBD5E1' },
  gradeContestText: { fontSize: 12.5, fontWeight: '700', color: '#475569' },
  gradeAnswered: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', marginTop: 2 },
  gradeAnsweredText: { fontSize: 12, fontWeight: '700', color: '#92400E', lineHeight: 17 },
  gradeAnsweredNote: { fontSize: 11.5, color: '#B45309', fontStyle: 'italic', marginTop: 3 },

  paidBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#DCFCE7', borderRadius: 12, padding: 10, marginTop: 10,
  },
  paidText: { fontSize: 12, fontWeight: '600', color: '#15803D' },
  agentBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 11,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  agentName: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  agentSub:  { fontSize: 11.5, color: '#9CA3AF', marginTop: 1 },
  callChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EFF6FF',
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE',
  },
  callChipText: { fontSize: 12.5, color: '#2563EB', fontWeight: '700' },

  progressWrap: { gap: 6 },
  progressBar:  { height: 6, borderRadius: 3, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  progressText: { fontSize: 12, color: '#6B7280' },

  emptyWrap: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 30, gap: 8 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle:{ fontSize: 17, fontWeight: '700', color: '#1F2937' },
  emptySub:  { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 21 },
});

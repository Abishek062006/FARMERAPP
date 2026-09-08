import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import PaymentSheet from '../../components/PaymentSheet';
import ProgressStepper from '../../components/ProgressStepper';
import VehicleIcon from '../../components/vehicles/VehicleIcon';
import usePolling from '../../hooks/usePolling';
import { RUN_STATE, STALE_STYLE, bandOf, lastSeenText, isRunLive } from '../../utils/runTracking';
import { gradeCheckOf } from '../../utils/stopOutcome';

// ── WHAT WAS SEEN AT THE FARM GATE, ON THE BUYER'S OWN PURCHASE ───────────
//
// `GET /api/consignments/vendor/purchases` returns `totals.gradeDowngrades`,
// `totals.weightProvenance` and, per contributor, `weight` (describeWeight) and
// `grade` (describeGradeCheck) — and nothing on this screen read any of it, so
// a lot recorded at a LOWER grade than it was sold as looked identical to one
// that matched, and "512 kg" read as measured whether or not anybody owned a
// scale.
//
// It is surfaced FACTUALLY: what the farmer declared, what the collector
// recorded, and whether the farmer has answered yet. No adjective about the
// farmer, and no implication that anything has been decided — a gate grade is
// an observation by whoever collected the lot, not an inspection, and it has
// NOT changed what this buyer pays. The remedy is a grievance against that
// order, exactly as it is for a disputed quantity.

// ═══════════════════════════════════════════════════════════════════════════
// TIER 2 / GAP C — ONE PURCHASE LOOKS LIKE ONE PURCHASE.
// ═══════════════════════════════════════════════════════════════════════════
//
// Buying one 2-tonne lot from five farmers writes five Orders and one
// Consignment, and this screen rendered five unrelated rows: five crops, five
// prices, five "driver on the way", with nothing saying they were one purchase,
// one price and one truck. `consignmentId` was referenced here only to EXCLUDE
// pooled orders from the poolable list — it never grouped anything.
//
// `GET /api/consignments/vendor/purchases` now returns the buyer's runs with
// their orders joined and every rupee figure recomputed from those orders, so
// this screen reads BOTH lists and merges them:
//
//   · every run the buyer booked becomes ONE row — the lot, who supplied it,
//     the run's status, one total, and the way into the map;
//   · an order that belongs to one of those runs is folded into its row and
//     never drawn on its own;
//   · EVERY OTHER ORDER IS UNTOUCHED. A single-farmer purchase renders exactly
//     the card it always rendered, with the same actions and the same route
//     into TrackOrder. That path is not a special case of the new one and must
//     not become one.
//
// An order whose run did NOT come back (the two endpoints have different
// limits — 50 orders, 30 runs by default) still renders as its own row rather
// than vanishing. A row a buyer paid for must never disappear because a join
// missed.

// Status → how it looks and what the buyer can do about it. Single orders only.
const STATUS = {
  awaiting_agent: { label: 'Finding a driver', tone: 'warn',    can: ['cancel'] },
  no_agents:      { label: 'No driver found',  tone: 'danger',  can: ['retry', 'cancel'] },
  accepted:       { label: 'Driver on the way', tone: 'info',   can: [] },
  picked_up:      { label: 'Out for delivery',  tone: 'info',   can: ['pay'] },
  // `pay` is offered only once the crop has actually left the farm — the server
  // refuses earlier with NOT_COLLECTED, and a button that can only fail is
  // worse than no button.
  delivered:      { label: 'Delivered',         tone: 'good',   can: ['pay'] },
  cancelled:      { label: 'Cancelled',         tone: 'muted',  can: [] },
  // The run carrying it was abandoned with produce aboard: nothing arrived and
  // the farmer is still owed every rupee. Not delivered, not cancelled — and
  // still PAYABLE, because real crop left a real farm.
  stranded:       { label: 'Stranded',          tone: 'danger', can: ['pay'] },
};

const TONE = {
  warn:   { bg: '#FFF7ED', fg: '#C2410C', dot: '#EA580C' },
  danger: { bg: '#FEF2F2', fg: '#B91C1C', dot: '#DC2626' },
  info:   { bg: '#EFF6FF', fg: '#1D4ED8', dot: '#2563EB' },
  good:   { bg: '#DCFCE7', fg: '#15803D', dot: '#16A34A' },
  muted:  { bg: '#F1F5F9', fg: '#6B7280', dot: '#9CA3AF' },
  transit:{ bg: '#F5F3FF', fg: '#6D28D9', dot: '#7C3AED' },
};

const RUN_TONE = {
  awaiting_agent: 'warn', no_agents: 'danger', accepted: 'info',
  collecting: 'info', in_transit: 'transit', delivered: 'good',
  cancelled: 'muted', abandoned: 'danger',
};

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const kgs = (n) => `${Number(n || 0).toLocaleString('en-IN')} kg`;

export default function VendorOrdersScreen({ navigation, route }) {
  // The order currently being paid for; null when the sheet is closed.
  const [paying, setPaying] = useState(null);
  const { userData } = route.params || {};

  // ── EVERY HOOK SITS ABOVE THE FIRST EARLY RETURN (the `if (loading)` at
  // line 515). React counts hooks per render; a hook added below that guard
  // runs on the second render and not the first — the crash CLAUDE.md records
  // for FarmerSalesScreen. The two Card components below are plain render
  // functions and deliberately hold no hooks of their own.
  const [orders, setOrders] = useState([]);
  const [purchases, setPurchases] = useState([]);
  // FPO lot purchases now go through an approval gate: POST /lots/request
  // holds a request, and only the group admin's Accept ever creates an Order.
  // These are that in-between state — not yet an order, not gone either.
  const [lotRequests, setLotRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [withdrawingId, setWithdrawingId] = useState(null);
  // Phase 3, D1 — which lot purchase is mid-payment, so the button on that
  // one card shows a spinner without touching every other row on the list.
  const [payingLotId, setPayingLotId] = useState(null);

  // F1: how many orders could still be pooled onto one vehicle. Only orders
  // still waiting for a driver qualify — once one accepts, the trip has begun.
  const poolable = orders.filter((o) => o.status === 'awaiting_agent' && !o.consignmentId);

  const fetchOrders = useCallback(async () => {
    // All three, in parallel. The purchases and lot-requests calls are both
    // additive: if either fails the screen falls back to exactly the list it
    // always showed, which is worse but never blank.
    const [ordersRes, purchasesRes, lotRequestsRes] = await Promise.allSettled([
      axios.get(`${API_ENDPOINTS.ORDERS}/vendor/mine`),
      axios.get(`${API_ENDPOINTS.CONSIGNMENTS}/vendor/purchases`),
      axios.get(`${API_ENDPOINTS.FPOS}/lot-requests/mine`),
    ]);
    if (ordersRes.status === 'fulfilled' && ordersRes.value.data.success) {
      setOrders(ordersRes.value.data.orders);
    }
    if (purchasesRes.status === 'fulfilled' && purchasesRes.value.data.success) {
      setPurchases(purchasesRes.value.data.purchases || []);
    }
    if (lotRequestsRes.status === 'fulfilled' && lotRequestsRes.value.data.success) {
      setLotRequests(lotRequestsRes.value.data.requests || []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  const pendingLotRequests = lotRequests.filter((r) => r.status === 'pending');
  // Rejected/stale ones stay visible briefly so the buyer sees WHY nothing
  // showed up, rather than a request just silently vanishing.
  const resolvedLotRequests = lotRequests
    .filter((r) => r.status === 'rejected' || r.status === 'stale')
    .slice(0, 5);

  const withdrawRequest = async (r) => {
    setWithdrawingId(r._id);
    try {
      await axios.post(`${API_ENDPOINTS.FPOS}/lot-requests/${r._id}/withdraw`, {});
      await fetchOrders();
    } catch (err) {
      Alert.alert('Could not withdraw', err.response?.data?.error || 'Please try again.');
    } finally {
      setWithdrawingId(null);
    }
  };

  // Orders change without the buyer doing anything — a driver accepts, a
  // dispatch lapses, a farm gate is recorded — so this list polls while it is
  // on screen. usePolling stops it on blur and on backgrounding.
  usePolling(fetchOrders, 6000, true);

  // ── THE MERGE ────────────────────────────────────────────────────────────
  // One row per purchase, one row per ordinary order, newest first. An order
  // is only swallowed when its run is genuinely in the list that came back.
  const rows = useMemo(() => {
    const runIds = new Set(purchases.map((p) => String(p.consignmentId)));
    const single = orders
      .filter((o) => !o.consignmentId || !runIds.has(String(o.consignmentId)))
      .map((o) => ({ kind: 'order', key: `o:${o._id}`, at: o.createdAt, order: o }));
    const bulk = purchases.map((p) => ({
      kind: 'purchase', key: `c:${p.consignmentId}`, at: p.createdAt, purchase: p,
    }));
    return [...single, ...bulk].sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [orders, purchases]);

  const act = async (order, what) => {
    setBusyId(order._id);
    try {
      const r = await axios.post(`${API_ENDPOINTS.ORDERS}/${order._id}/${what}`, {});
      if (r.data.success) {
        // A re-dispatch late in the day gets a SHORT window — it is clipped to
        // the end of the working day, because nobody drives to a farm after
        // dark. Saying so stops the buyer reading a second timeout as "no
        // captain wants this job" when the real answer is "try in the morning".
        const d = r.data.dispatch;
        if (d && (d.tooLate || d.clipped)) {
          Alert.alert(
            d.tooLate ? 'Very little time left today' : 'Shorter window',
            d.note || 'This closes at the end of the working day.',
          );
        }
        await fetchOrders();
      }
    } catch (err) {
      Alert.alert('Could not update', err.response?.data?.error || 'Please try again.');
      await fetchOrders();
    } finally {
      setBusyId(null);
    }
  };

  const confirmCancel = (order) =>
    Alert.alert(
      'Cancel this order?',
      `${order.quantityKg} kg of ${order.cropName} will go back on the market and nothing will be charged.`,
      [
        { text: 'Keep order', style: 'cancel' },
        { text: 'Cancel order', style: 'destructive', onPress: () => act(order, 'cancel') },
      ]
    );

  // ── PAY A WHOLE LOT PURCHASE IN ONE ACT ──────────────────────────────────
  // POST /api/fpos/lots/pay reuses the exact per-order guarded write
  // `/orders/:id/pay` uses, order by order — this is a convenience over that
  // rail, not a second definition of "paid". It is PARTIAL-TOLERANT: an order
  // not yet collected or already settled is skipped and named in the result
  // rather than blocking the rest of the lot.
  const payLot = async (p) => {
    setPayingLotId(p.consignmentId);
    try {
      const r = await axios.post(`${API_ENDPOINTS.FPOS}/lots/pay`, {
        consignmentId: p.consignmentId,
      });
      if (r.data.success) {
        const { paid } = r.data;
        const notCollected = (r.data.results || []).filter((x) => x.outcome === 'not_collected').length;
        const already = (r.data.results || []).filter((x) => x.outcome === 'already_paid').length;
        const lines = [`Paid ${paid.orders} of ${paid.of} farmer${paid.of === 1 ? '' : 's'} · ${money(paid.amount)}`];
        if (already) lines.push(`${already} already paid.`);
        if (notCollected) lines.push(`${notCollected} not collected yet — nothing to pay them for.`);
        lines.push(paid.note);
        Alert.alert('Lot payment', lines.join('\n'));
        await fetchOrders();
      }
    } catch (err) {
      Alert.alert('Could not pay', err.response?.data?.error || 'Please try again.');
    } finally {
      setPayingLotId(null);
    }
  };

  // ── ONE BULK PURCHASE, AS ONE THING ──────────────────────────────────────
  const PurchaseCard = ({ p }) => {
    const run = p.run || {};
    const lot = p.lot || {};
    const totals = p.totals || {};
    const meta = RUN_STATE[run.status] || RUN_STATE.accepted;
    const tone = TONE[RUN_TONE[run.status] || 'info'];
    const live = isRunLive(run.status);
    const band = bandOf(run);
    const bandTone = STALE_STYLE[band];
    const isLot = lot.source === 'fpo_lot';
    const shortfall = (totals.orderedKg || 0) - (totals.deliveredKg || 0);

    return (
      <TouchableOpacity
        style={[s.card, s.purchaseCard]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('TrackRun', { consignmentId: p.consignmentId })}
      >
        <View style={s.topRow}>
          <View style={[s.statusChip, { backgroundColor: tone.bg }]}>
            <View style={[s.statusDot, { backgroundColor: tone.dot }]} />
            <Text style={[s.statusText, { color: tone.fg }]}>{meta.title}</Text>
          </View>
          <Text style={s.date}>
            {new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </Text>
        </View>

        {/* WHAT WAS BOUGHT. `lot.source` keeps a group lot and a buyer pooling
            their own orders apart — they read very differently and the backend
            refuses to merge them. */}
        <View style={s.cropRow}>
          <View style={[s.cropIcon, { backgroundColor: '#EEF2FF' }]}>
            <Ionicons name="cube-outline" size={20} color="#4338CA" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cropName}>
              {isLot
                ? `${lot.cropName}${lot.gradeLabel ? ` · ${lot.gradeLabel}` : ''}`
                : `${totals.farmers || run.stops || 0} farms on one vehicle`}
            </Text>
            <Text style={s.cropSub}>
              {kgs(totals.deliveredKg ?? run.plannedKg)} · {totals.farmers || 0} farmer
              {totals.farmers === 1 ? '' : 's'}
              {isLot && lot.fpoName ? ` · ${lot.fpoName}` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.totalLabel}>ONE PURCHASE</Text>
            <Text style={s.totalValue}>{money(totals.grandTotal)}</Text>
          </View>
        </View>

        {/* A SELF-DECLARED GRADE MUST NOT LAUNDER INTO A FACT just because five
            farmers' lots are under one heading. */}
        {isLot && lot.gradeDeclared && (
          <Text style={s.selfDeclared}>
            Grade is self-declared by each farmer and has not been inspected.
          </Text>
        )}

        {/* Phase 5, T2 — the RUN's own progress, not any one farmer's order. */}
        <ProgressStepper status={run.status} kind="run" compact />

        <View style={s.divider} />

        {/* WHO SUPPLIED IT. The buyer is a party to every one of these orders,
            so nothing is masked — this is their own purchase. */}
        {(p.contributors || []).map((ct) => {
          const short = (ct.orderedKg ?? ct.quantityKg) > ct.quantityKg;
          const dead = ct.status === 'cancelled';
          const stranded = ct.status === 'stranded';
          return (
            <View key={String(ct.orderId)} style={s.contribRow}>
              <View style={[
                s.contribDot,
                dead && { backgroundColor: '#DC2626' },
                stranded && { backgroundColor: '#B91C1C' },
                short && !dead && { backgroundColor: '#EA580C' },
              ]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.contribName, dead && s.struck]}>{ct.farmerName}</Text>
                <Text style={s.contribMeta}>
                  {dead
                    ? `Collected nothing${ct.failureReason ? ` · ${ct.failureReason.replace(/_/g, ' ')}` : ''}`
                    : `${kgs(ct.quantityKg)} ${ct.cropName} · ₹${ct.pricePerKg}/kg`}
                  {/* WHAT WAS AGREED, BESIDE WHAT ARRIVED. A short pickup
                      rewrites quantityKg, so without orderedKg the shortfall
                      disappears from the buyer's own record. */}
                  {short && !dead ? ` · ${kgs(ct.orderedKg)} ordered` : ''}
                  {stranded ? ' · on an abandoned run, still owed' : ''}
                </Text>
              </View>
              <Text style={[s.contribMoney, dead && s.struck]}>{money(ct.grandTotal)}</Text>
            </View>
          );
        })}

        {/* ── THE GATE RECORD, per farm that has one ───────────────────── */}
        {(p.contributors || []).filter((ct) => ct.grade?.downgraded).map((ct) => (
          <View key={`g:${ct.orderId}`} style={s.gateRow}>
            <Ionicons name="pricetag-outline" size={14} color="#B45309" />
            <View style={{ flex: 1 }}>
              <Text style={s.gateText}>
                <Text style={{ fontWeight: '800' }}>{ct.farmerName}</Text>
                {' — sold as Grade '}{ct.grade.declared}
                {', recorded at the gate as Grade '}{ct.grade.observed}{'.'}
              </Text>
              {/* WHETHER THE FARMER HAS ANSWERED. A driver's entry is a claim;
                  only the farmer conceding makes it anything more. */}
              <Text style={s.gateSub}>
                {ct.grade.farmerResponse === 'accepted'
                  ? 'The farmer agreed it was the lower grade.'
                  : ct.grade.farmerResponse === 'contested'
                    ? 'The farmer disagrees. It stands as the collector\u2019s claim.'
                    : 'The farmer has not answered yet.'}
              </Text>
            </View>
          </View>
        ))}

        {totals.gradeDowngrades > 0 && (
          <Text style={s.gateNote}>
            A grade recorded at the farm gate is an observation by whoever collected the lot, not an
            inspection, and a difference from the declared grade has NOT changed what you pay. If a
            lot is not what you bought, raise a grievance against that order.
          </Text>
        )}

        {/* ── WHERE THE KILOGRAMS CAME FROM ────────────────────────────
            Measured kilograms beside unweighed ones, never one "verified"
            flag: a five-farm run where four farms were weighed and the
            biggest was eyeballed is not honestly described by either. */}
        {totals.weightProvenance?.anyUnweighed && (
          <View style={s.gateRow}>
            <Ionicons name="scale-outline" size={14} color="#B45309" />
            <View style={{ flex: 1 }}>
              <Text style={s.gateText}>
                {kgs(totals.weightProvenance.unweighedKg)}
                {' of '}{kgs(totals.weightProvenance.totalKg)}{' was never put on a scale — counted '}
                {'or estimated at the gate.'}
              </Text>
              <Text style={s.gateSub}>
                This app records how a weight was established. It does not weigh anything and does not
                correct a weight that looks wrong.
              </Text>
            </View>
          </View>
        )}

        <View style={s.divider} />

        {/* ONE PRICE, TWO PAYEES. Crop value and fare are kept apart because
            they are paid to different people at different times. */}
        <View style={s.moneyRow}>
          <Text style={s.moneyKey}>Crop</Text>
          <Text style={s.moneyVal}>{money(totals.cropTotal)}</Text>
        </View>
        <View style={s.moneyRow}>
          <Text style={s.moneyKey}>
            One vehicle{run.distanceKm != null ? ` · ${run.distanceKm} km` : ''}
          </Text>
          <Text style={s.moneyVal}>{money(totals.fareTotal)}</Text>
        </View>
        {shortfall > 0 && (
          <Text style={s.shortNote}>
            {kgs(shortfall)} short of the {kgs(totals.orderedKg)} ordered.
          </Text>
        )}

        {/* ── PAY THIS LOT, IN ONE ACT ──────────────────────────────────
            One button settles every contributing farmer's own order — the
            SAME guarded per-order write as a single purchase's "Pay farmer"
            button, not a second rail. Only shown while there is something
            outstanding; once every farmer is paid the card says so instead. */}
        {totals.farmers > 0 && totals.settledFarmers === totals.farmers ? (
          <View style={s.paidRow}>
            <Ionicons name="checkmark-circle" size={15} color="#16A34A" />
            <Text style={s.paidText}>All {totals.farmers} farmer{totals.farmers === 1 ? '' : 's'} paid</Text>
          </View>
        ) : totals.payableFarmers > 0 ? (
          <TouchableOpacity
            style={s.payBtn}
            onPress={() => payLot(p)}
            activeOpacity={0.85}
            disabled={payingLotId === p.consignmentId}
            accessibilityLabel={`Pay ${totals.payableFarmers} farmer${totals.payableFarmers === 1 ? '' : 's'} ${money(totals.payableNow)}`}
          >
            {payingLotId === p.consignmentId ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="wallet-outline" size={16} color="#fff" />
                <Text style={s.payBtnText}>
                  Pay {totals.payableFarmers} farmer{totals.payableFarmers === 1 ? '' : 's'} · {money(totals.payableNow)}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <Text style={s.shortNote}>Nothing to pay yet — no crop has left the farm.</Text>
        )}

        <View style={s.tripRow}>
          <VehicleIcon type={run.vehicleType} width={46} />
          <View style={{ flex: 1 }}>
            <Text style={s.tripText} numberOfLines={1}>
              {run.stopsVisited ?? 0} of {run.stops ?? 0} farms visited
              {' '}<Text style={s.arrow}>→</Text> {run.dropoff?.label || 'you'}
            </Text>
            <Text style={s.tripSub}>
              {run.driver?.name || 'No driver yet'}
              {run.driver?.kind === 'fpo_driver' ? " · the group's own driver" : ''}
              {run.driver?.kind === 'captain' ? ' · captain' : ''}
            </Text>
          </View>
          {!!run.driver?.phone && (
            <TouchableOpacity style={s.callChip} onPress={() => Linking.openURL(`tel:${run.driver.phone}`)}>
              <Ionicons name="call" size={13} color="#2563EB" />
              <Text style={s.callChipText}>Call</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ⚠️ NEVER A CONFIDENT "LIVE" ON A FIX THAT IS NOT. Tracking is
            foreground-only, so the age of the last real fix is what is shown —
            here and on the map — and it is never smoothed forward. */}
        {live && (
          <View style={[s.liveRow, { backgroundColor: bandTone.bg }]}>
            <View style={[s.liveDot, { backgroundColor: bandTone.dot }]} />
            <Text style={[s.liveText, { color: bandTone.fg }]}>{lastSeenText(run.ageSec)}</Text>
          </View>
        )}

        {live && (
          <View style={s.trackRow}>
            <Ionicons name="location" size={15} color="#2563EB" />
            <Text style={s.trackText}>
              {run.status === 'in_transit' ? 'Follow the last leg' : 'Track this run'}
            </Text>
            <Ionicons name="chevron-forward" size={15} color="#2563EB" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ── AN ORDINARY SINGLE-FARMER ORDER. Unchanged. ──────────────────────────
  const Card = ({ item }) => {
    const meta = STATUS[item.status] || STATUS.awaiting_agent;
    const tone = TONE[meta.tone];
    const busy = busyId === item._id;

    const trackable = ['accepted', 'picked_up'].includes(item.status);
    // 🐛 `disabled` was wired to `trackable` alone, which is true ONLY for
    // accepted/picked_up — so a DELIVERED order's card was untappable, even
    // though the onPress below already correctly routes delivered orders to
    // 'Receipt'. The receipt navigation was never missing; the card just
    // could not be tapped to reach it. `canOpen` covers both real
    // destinations this row can lead to.
    const canOpen = trackable || item.status === 'delivered';

    // A single-farmer row can carry a gate record too — either because it was
    // pooled onto a run whose purchase row did not come back (the two endpoints
    // have different limits), or because it was collected on one. A row a buyer
    // paid for must never lose the fact that its lot was recorded lower.
    const g = gradeCheckOf(item.pickupOutcome?.grade);

    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={canOpen ? 0.85 : 1}
        disabled={!canOpen}
        onPress={() => navigation.navigate(
          item.status === 'delivered' ? 'Receipt' : 'TrackOrder',
          { orderId: item._id }
        )}
      >
        <View style={s.topRow}>
          <View style={[s.statusChip, { backgroundColor: tone.bg }]}>
            <View style={[s.statusDot, { backgroundColor: tone.dot }]} />
            <Text style={[s.statusText, { color: tone.fg }]}>{meta.label}</Text>
          </View>
          <Text style={s.date}>
            {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </Text>
        </View>

        <View style={s.cropRow}>
          <View style={s.cropIcon}><Text style={{ fontSize: 20 }}>🌾</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.cropName}>{item.cropName}</Text>
            <Text style={s.cropSub}>{item.quantityKg} kg · from {item.farmerName}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.totalLabel}>TOTAL</Text>
            <Text style={s.totalValue}>₹{item.grandTotal?.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {/* Phase 5, T2 — "ordered / driver / picked up / delivered" at a
            glance, without opening the tracking screen. */}
        <ProgressStepper status={item.status} kind="order" compact />

        {/* The gate record on a single row, same facts and same limits as on a
            purchase row: recorded, visible, and it changed nothing you pay. */}
        {g.downgraded && (
          <View style={s.gateRow}>
            <Ionicons name="pricetag-outline" size={14} color="#B45309" />
            <View style={{ flex: 1 }}>
              <Text style={s.gateText}>
                {'Sold as Grade '}{g.declared}{', recorded at the gate as Grade '}{g.observed}
                {'. No price changed.'}
              </Text>
              <Text style={s.gateSub}>
                {g.farmerResponse === 'accepted'
                  ? 'The farmer agreed it was the lower grade.'
                  : g.farmerResponse === 'contested'
                    ? 'The farmer disagrees. It stands as the collector\u2019s claim.'
                    : 'The farmer has not answered yet.'}
              </Text>
            </View>
          </View>
        )}

        <View style={s.divider} />

        <View style={s.tripRow}>
          <VehicleIcon type={item.vehicleType} width={46} />
          <View style={{ flex: 1 }}>
            <Text style={s.tripText} numberOfLines={1}>
              {item.pickup?.district} <Text style={s.arrow}>→</Text> {item.dropoff?.label}
            </Text>
            <Text style={s.tripSub}>{item.distanceKm} km · ₹{item.fare?.total} transport</Text>
          </View>
        </View>

        {/* Driver details appear the moment someone accepts (phase 4). */}
        {item.agentName && (
          <View style={s.agentBox}>
            <View style={s.agentAvatar}>
              <Text style={s.agentAvatarText}>{item.agentName[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.agentName}>{item.agentName}</Text>
              <Text style={s.agentVehicle}>{item.agentVehicleNumber || 'Vehicle number pending'}</Text>
            </View>
            {!!item.agentPhone && (
              <TouchableOpacity style={s.callChip} onPress={() => Linking.openURL(`tel:${item.agentPhone}`)}>
                <Ionicons name="call" size={13} color="#2563EB" />
                <Text style={s.callChipText}>Call</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {['accepted', 'picked_up'].includes(item.status) && !!item.dropOtp && (
          <View style={s.otpRow}>
            <Text style={s.otpLabel}>Delivery code</Text>
            <Text style={s.otpValue}>{item.dropOtp}</Text>
          </View>
        )}

        {/* ── PAY THE FARMER ────────────────────────────────────────────
            Only while there is something outstanding. Once settled the card
            shows the transaction instead, so the buyer can find the reference
            without reopening the receipt. */}
        {meta.can.includes('pay') && !item.settlement?.farmerPaid && (
          <TouchableOpacity
            style={s.payBtn}
            onPress={() => setPaying(item)}
            activeOpacity={0.85}
            accessibilityLabel={`Pay the farmer ${money(item.farmerPayout)}`}
          >
            <Ionicons name="wallet-outline" size={16} color="#fff" />
            <Text style={s.payBtnText}>Pay farmer {money(item.farmerPayout)}</Text>
          </TouchableOpacity>
        )}
        {item.settlement?.farmerPaid && (
          <View style={s.paidRow}>
            <Ionicons name="checkmark-circle" size={15} color="#16A34A" />
            <Text style={s.paidText}>
              Paid{item.settlement.txn?.ref ? ` · ${item.settlement.txn.ref}` : ''}
            </Text>
          </View>
        )}

        {meta.can.filter((c) => c !== 'pay').length > 0 && (
          <View style={s.actions}>
            {meta.can.includes('retry') && (
              <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={() => act(item, 'retry')} disabled={busy}>
                {busy ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="refresh" size={15} color="#fff" />
                    <Text style={s.btnPrimaryText}>Find a driver again</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {meta.can.includes('cancel') && (
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => confirmCancel(item)} disabled={busy}>
                <Text style={s.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {trackable && (
          <View style={s.trackRow}>
            <Ionicons name="location" size={15} color="#2563EB" />
            <Text style={s.trackText}>Track live</Text>
            <Ionicons name="chevron-forward" size={15} color="#2563EB" />
          </View>
        )}

        {/* 🐛 THE CARD WAS TAPPABLE FOR A DELIVERED ORDER BUT SAID SO
            NOWHERE — the only affordance was the whole card silently being
            pressable, same class of defect as a control with no label.
            "Track live" already gets a visible row for an in-flight order;
            a delivered one gets the equivalent for its own destination. */}
        {item.status === 'delivered' && (
          <View style={s.trackRow}>
            <Ionicons name="receipt-outline" size={15} color="#15803D" />
            <Text style={[s.trackText, { color: '#15803D' }]}>View receipt</Text>
            <Ionicons name="chevron-forward" size={15} color="#15803D" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#16A34A" />
        <Text style={s.loadingText}>Loading your orders…</Text>
      </View>
    );
  }

  return (
    <>
    <FlatList
      style={s.container}
      data={rows}
      keyExtractor={(i) => i.key}
      renderItem={({ item }) => (
        item.kind === 'purchase'
          ? <PurchaseCard p={item.purchase} />
          : <Card item={item.order} />
      )}
      contentContainerStyle={s.list}
      ListHeaderComponent={
        <>
          {/* Pending FPO requests: not an order yet, so they don't belong in
              the main list — but a buyer must have somewhere to see them. */}
          {(pendingLotRequests.length > 0 || resolvedLotRequests.length > 0) && (
            <View style={s.lotReqSection}>
              <Text style={s.lotReqHead}>PENDING FPO REQUESTS</Text>
              {pendingLotRequests.map((r) => (
                <View key={r._id} style={s.lotReqCard}>
                  <View style={s.lotReqTop}>
                    <View style={[s.statusChip, { backgroundColor: TONE.warn.bg }]}>
                      <View style={[s.statusDot, { backgroundColor: TONE.warn.dot }]} />
                      <Text style={[s.statusText, { color: TONE.warn.fg }]}>Waiting for the FPO</Text>
                    </View>
                    <Text style={s.date}>
                      {new Date(r.requestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <Text style={s.lotReqLine}>
                    {kgs(r.quantityKg)} {r.cropName} · {r.fpoName}
                  </Text>
                  {r.quoteSnapshot?.buyerTotal != null && (
                    <Text style={s.lotReqSub}>If accepted, you pay {money(r.quoteSnapshot.buyerTotal)}</Text>
                  )}
                  <TouchableOpacity
                    style={s.lotReqWithdraw}
                    disabled={withdrawingId === r._id}
                    onPress={() => Alert.alert(
                      'Withdraw this request?',
                      'The FPO will no longer be able to accept it.',
                      [
                        { text: 'Keep it', style: 'cancel' },
                        { text: 'Withdraw', style: 'destructive', onPress: () => withdrawRequest(r) },
                      ]
                    )}
                  >
                    {withdrawingId === r._id
                      ? <ActivityIndicator size="small" color="#6B7280" />
                      : <Text style={s.lotReqWithdrawText}>Withdraw</Text>}
                  </TouchableOpacity>
                </View>
              ))}
              {resolvedLotRequests.map((r) => (
                <View key={r._id} style={[s.lotReqCard, s.lotReqResolved]}>
                  <View style={[s.statusChip, { backgroundColor: TONE.danger.bg }]}>
                    <View style={[s.statusDot, { backgroundColor: TONE.danger.dot }]} />
                    <Text style={[s.statusText, { color: TONE.danger.fg }]}>
                      {r.status === 'rejected' ? 'Not accepted' : 'Went stale'}
                    </Text>
                  </View>
                  <Text style={s.lotReqLine}>
                    {kgs(r.quantityKg)} {r.cropName} · {r.fpoName}
                  </Text>
                  <Text style={s.lotReqSub}>
                    {r.status === 'rejected'
                      ? (r.rejectionReason || 'The FPO did not accept this request.')
                      : 'This lot changed before the FPO responded — nothing was bought.'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* F1: only offered when pooling is actually possible. Orders that a
              driver has already accepted cannot join a shared run. */}
          {poolable.length >= 2 && (
            <TouchableOpacity
              style={s.poolBanner}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('ShareVehicle', { userData })}
            >
              <View style={s.poolIcon}>
                <Ionicons name="git-merge-outline" size={19} color="#15803D" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.poolTitle}>{poolable.length} orders could share one vehicle</Text>
                <Text style={s.poolSub}>The vehicle is the cost — see what one trip would save</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#16A34A" />
            </TouchableOpacity>
          )}
        </>
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} tintColor="#16A34A"
          onRefresh={() => { setRefreshing(true); fetchOrders(); }} />
      }
      ListEmptyComponent={
        <View style={s.emptyWrap}>
          <View style={s.emptyIcon}><Ionicons name="receipt-outline" size={34} color="#16A34A" /></View>
          <Text style={s.emptyTitle}>No orders yet</Text>
          <Text style={s.emptySub}>Buy a crop from the market and it will show up here.</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => navigation.popToTop()}>
            <Text style={s.emptyBtnText}>Browse the market</Text>
          </TouchableOpacity>
        </View>
      }
    />
    {/* ⚠️ Rendered at the ROOT, not inside a list row — a Modal mounted
        per-row unmounts mid-payment the moment the list refreshes. */}
    {paying && (
      <PaymentSheet
        order={paying}
        onClose={() => setPaying(null)}
        onPaid={() => fetchOrders()}
      />
    )}
    </>
  );
}

const s = StyleSheet.create({
  poolBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: '#DCFCE7', borderRadius: 16, padding: 14,
    marginBottom: 4, borderWidth: 1, borderColor: '#BBF7D0',
  },
  poolIcon: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  poolTitle: { fontSize: 14.5, fontWeight: '700', color: '#14532D' },
  poolSub: { fontSize: 11.5, color: '#15803D', marginTop: 2 },

  lotReqSection: { marginBottom: 4, gap: 8 },
  lotReqHead: {
    fontSize: 10.5, fontWeight: '800', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2,
  },
  lotReqCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 13, gap: 6,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  lotReqResolved: { opacity: 0.85 },
  lotReqTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lotReqLine: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  lotReqSub: { fontSize: 12, color: '#6B7280' },
  lotReqWithdraw: { alignSelf: 'flex-start', marginTop: 2 },
  lotReqWithdrawText: { fontSize: 12, fontWeight: '700', color: '#B91C1C' },

  container:   { flex: 1, backgroundColor: '#F8FAFC' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },
  list:        { padding: 16, gap: 12, paddingBottom: 40 },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 5, borderWidth: 1, borderColor: '#F1F5F9',
  },
  // One purchase reads as one object, so it gets its own edge rather than
  // looking like a taller version of a single-farmer row.
  purchaseCard: { borderColor: '#C7D2FE', borderWidth: 1.5 },

  topRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  date:       { fontSize: 11.5, color: '#9CA3AF' },

  cropRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cropIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' },
  cropName: { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  cropSub:  { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  totalLabel: { fontSize: 9, color: '#9CA3AF', fontWeight: '700', letterSpacing: 0.5 },
  totalValue: { fontSize: 17, fontWeight: '800', color: '#15803D' },
  selfDeclared: { fontSize: 11, color: '#9CA3AF', lineHeight: 15, marginTop: -4 },

  divider: { height: 1, backgroundColor: '#F1F5F9' },

  contribRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  contribDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: '#16A34A', marginTop: 5 },
  contribName:  { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  contribMeta:  { fontSize: 11.5, color: '#6B7280', marginTop: 1, lineHeight: 16 },
  contribMoney: { fontSize: 13, fontWeight: '700', color: '#374151' },
  struck:       { textDecorationLine: 'line-through', color: '#9CA3AF' },

  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  moneyKey: { fontSize: 12.5, color: '#6B7280' },
  moneyVal: { fontSize: 13, fontWeight: '700', color: '#374151' },
  // The gate record. Amber and factual — never red, and never an adjective
  // about the farmer: nothing here has been decided and nothing has been
  // charged differently.
  gateRow: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 11, padding: 10, marginTop: 9,
  },
  gateText: { fontSize: 12, color: '#92400E', lineHeight: 17 },
  gateSub: { fontSize: 11, color: '#B45309', lineHeight: 15.5, marginTop: 3 },
  gateNote: { fontSize: 10.5, color: '#9CA3AF', lineHeight: 15, marginTop: 8 },

  shortNote: { fontSize: 11.5, color: '#B45309', lineHeight: 16 },

  tripRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tripText: { fontSize: 13.5, color: '#374151', fontWeight: '600' },
  arrow:    { color: '#16A34A' },
  tripSub:  { fontSize: 11.5, color: '#9CA3AF', marginTop: 2 },

  liveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5,
  },
  liveDot:  { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 11.5, fontWeight: '700' },

  agentBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 11,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  agentAvatar:     { width: 34, height: 34, borderRadius: 17, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  agentAvatarText: { fontSize: 15, fontWeight: '700', color: '#16A34A' },
  agentName:       { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  agentVehicle:    { fontSize: 11.5, color: '#9CA3AF', marginTop: 1 },
  callChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#EFF6FF', paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE',
  },
  callChipText: { fontSize: 12.5, color: '#2563EB', fontWeight: '700' },

  otpRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F0FDF4', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  otpLabel: { fontSize: 12.5, color: '#15803D', fontWeight: '700' },
  otpValue: { fontSize: 20, fontWeight: '800', color: '#15803D', letterSpacing: 4 },

  trackRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 11,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  trackText: { fontSize: 14, color: '#2563EB', fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 10 },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 13, marginTop: 12,
  },
  payBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  paidRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  paidText: { fontSize: 12.5, color: '#15803D', fontWeight: '600' },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 12, borderRadius: 12,
  },
  btnPrimary:     { backgroundColor: '#16A34A' },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnGhost:       { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  btnGhostText:   { color: '#6B7280', fontSize: 14, fontWeight: '700' },

  emptyWrap: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 30, gap: 8 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle:{ fontSize: 17, fontWeight: '700', color: '#1F2937' },
  emptySub:  { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 21 },
  emptyBtn:  { marginTop: 10, backgroundColor: '#16A34A', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

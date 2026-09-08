import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

// ═══════════════════════════════════════════════════════════════════════════
// A CAPTAIN'S OWN WORK — the trip in hand, and everything already finished.
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ THIS SCREEN EXISTS BECAUSE A DRIVER COULD NOT SEE THEIR OWN RECORD.
// The app had `/agent/available` (jobs to take) and `/agent/current` (the one
// in hand) and nothing else — no finished trip, no distance driven, and no
// rupee they had earned was visible to them anywhere.
//
// ⚠️ THE FARE, NOT THE ORDER TOTAL. A captain collects the transport fare; the
// crop value is settled between the buyer and the farmer directly and was never
// the driver's money. Showing `grandTotal` here would tell a driver they had
// earned several times what they were actually paid.
//
// ⚠️ EARNED AND COLLECTED ARE SHOWN SEPARATELY. A trip finished but not yet
// paid for is a different position from one that has been, and a single
// "earned" figure hides exactly the case a driver needs to chase.
//
// This screen is English-only, like the rest of the captain stack — a
// deliberate product decision recorded in CLAUDE.md.

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const dateOf = (d) => {
  try { return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'; }
  catch { return '—'; }
};

export default function AgentTripsScreen({ navigation }) {
  // Every hook above the first early return.
  const [current, setCurrent] = useState(null);
  const [orders, setOrders] = useState([]);
  const [runs, setRuns] = useState([]);
  const [sum, setSum] = useState(null);
  const [runSum, setRunSum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [cur, hist, rhist] = await Promise.all([
        // ⚠️ FETCHED HERE REGARDLESS OF THE DUTY TOGGLE. On the dashboard the
        // current trip is loaded inside the polling loop, which only runs while
        // the captain is ONLINE — so going off duty made a job they were still
        // holding disappear from the app. You do not stop having a job because
        // you flipped a switch.
        axios.get(`${API_ENDPOINTS.ORDERS}/agent/current`).catch(() => null),
        axios.get(`${API_ENDPOINTS.ORDERS}/agent/history`).catch(() => null),
        axios.get(`${API_ENDPOINTS.CONSIGNMENTS}/agent/history`).catch(() => null),
      ]);
      setCurrent(cur?.data?.order || null);
      setOrders(hist?.data?.orders || []);
      setSum(hist?.data?.summary || null);
      setRuns(rhist?.data?.runs || []);
      setRunSum(rhist?.data?.summary || null);
      setErr('');
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not load your trips.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => navigation?.addListener?.('focus', fetchAll), [navigation, fetchAll]);

  // ── FIRST EARLY RETURN. Every hook above it. ──────────────────────────
  if (loading) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;

  const totalEarned = (sum?.totalEarned || 0) + (runSum?.totalEarned || 0);
  const totalTrips = (sum?.trips || 0) + (runSum?.runs || 0);

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor="#16A34A"
        onRefresh={() => { setRefreshing(true); fetchAll(); }} />}
    >
      {!!err && <Text style={s.err}>{err}</Text>}

      {/* ── What this driver has actually been paid ── */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>Your earnings</Text>
        <View style={s.statRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{money(totalEarned)}</Text>
            <Text style={s.statLabel}>fares earned</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statNum}>{totalTrips}</Text>
            <Text style={s.statLabel}>trips done</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statNum}>{(sum?.distanceKm || 0)} km</Text>
            <Text style={s.statLabel}>driven</Text>
          </View>
        </View>
        {/* Named separately, never folded into "earned". */}
        {sum?.awaitingCash > 0 && (
          <View style={s.owedBox}>
            <Ionicons name="alert-circle-outline" size={15} color="#B45309" />
            <Text style={s.owedText}>
              {money(sum.awaitingCash)} of that is not recorded as collected yet.
            </Text>
          </View>
        )}
        <Text style={s.note}>
          This is the transport FARE only. The buyer pays the farmer for the crop directly — that
          money was never yours to collect.
        </Text>
      </View>

      {/* ── The job in hand ── */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>Right now</Text>
        {current ? (
          <TouchableOpacity
            style={s.liveRow}
            onPress={() => navigation.navigate('AgentTrip', { orderId: current._id })}
            activeOpacity={0.85}
          >
            <View style={s.livePill}>
              <Text style={s.livePillText}>
                {current.status === 'accepted' ? 'GO TO PICKUP' : 'DELIVER'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.liveCrop}>{current.quantityKg} kg {current.cropName}</Text>
              <Text style={s.liveRoute} numberOfLines={1}>
                {current.pickup?.label || 'Farm'} → {current.dropoff?.label || 'Drop'}
              </Text>
            </View>
            <Text style={s.liveFare}>{money(current.fare?.agentPayout ?? current.fare?.total)}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={s.empty}>No trip in hand. Go online on the dashboard to be offered one.</Text>
        )}
      </View>

      {/* ── Finished single-farm pickups ── */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>Past pickups {orders.length ? `· ${orders.length}` : ''}</Text>
        {orders.length === 0 ? (
          <Text style={s.empty}>No completed pickups yet.</Text>
        ) : orders.map((o) => (
          <View key={o._id} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{o.quantityKg} kg {o.cropName}</Text>
              <Text style={s.rowMeta} numberOfLines={1}>
                {o.pickup?.district || o.pickup?.label} → {o.dropoff?.district || o.dropoff?.label}
                {o.distanceKm ? ` · ${Math.round(o.distanceKm)} km` : ''} · {dateOf(o.deliveredAt)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.rowFare}>{money(o.fare?.agentPayout ?? o.fare?.total)}</Text>
              <Text style={o.payment?.status === 'collected' ? s.paid : s.unpaid}>
                {o.payment?.status === 'collected' ? 'collected' : 'not collected'}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── Finished multi-farm runs ── */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>Past multi-farm runs {runs.length ? `· ${runs.length}` : ''}</Text>
        {runs.length === 0 ? (
          <Text style={s.empty}>No completed runs yet.</Text>
        ) : runs.map((r) => (
          <View key={r._id} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{r.farms} farms · {r.collectedQuantityKg ?? r.totalQuantityKg} kg</Text>
              <Text style={s.rowMeta} numberOfLines={1}>
                for {r.vendorName}{r.distanceKm ? ` · ${Math.round(r.distanceKm)} km` : ''} · {dateOf(r.deliveredAt)}
              </Text>
            </View>
            <Text style={s.rowFare}>{money(r.fare)}</Text>
          </View>
        ))}
        {runs.length > 0 && (
          <Text style={s.note}>
            A run's fare is split across its farms by weight, so the biggest load carries the
            biggest share — an even split would penalise the smallest farmer.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  err: { fontSize: 12, color: '#B91C1C', marginBottom: 10 },
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 10 },
  statRow: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 17, fontWeight: '800', color: '#15803D' },
  statLabel: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  owedBox: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12,
    backgroundColor: '#FFFBEB', borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  owedText: { flex: 1, fontSize: 12, color: '#92400E' },
  note: { fontSize: 11, color: '#9CA3AF', lineHeight: 16, marginTop: 10 },
  empty: { fontSize: 13, color: '#9CA3AF', lineHeight: 19 },

  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  livePill: { backgroundColor: '#DCFCE7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  livePillText: { fontSize: 10, fontWeight: '800', color: '#15803D' },
  liveCrop: { fontSize: 14, fontWeight: '800', color: '#111827' },
  liveRoute: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  liveFare: { fontSize: 14, fontWeight: '800', color: '#15803D' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  rowTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  rowMeta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  rowFare: { fontSize: 13, fontWeight: '800', color: '#15803D' },
  paid: { fontSize: 9, color: '#15803D', fontWeight: '700', marginTop: 2 },
  unpaid: { fontSize: 9, color: '#B45309', fontWeight: '700', marginTop: 2 },
});

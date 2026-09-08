import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import VehicleIcon from '../../components/vehicles/VehicleIcon';

// F1 — put several farms on one vehicle.
//
// The whole feature is one number: what three separate trips cost versus one
// shared run. That number is MEASURED by the server against the fares these
// orders were actually quoted, not estimated here, and it can come back
// NEGATIVE when the farms are too far apart. This screen shows whichever it
// is — a warning when pooling would cost more is worth more than a saving
// that is not real.
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function ShareVehicleScreen({ navigation, route }) {
  const { userData } = route.params || {};

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [picked, setPicked] = useState([]);           // order ids
  const [vehicle, setVehicle] = useState('tempo');
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [committing, setCommitting] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const r = await axios.get(`${API_ENDPOINTS.ORDERS}/vendor/mine`);
      if (r.data.success) {
        // Only orders still waiting for a driver can be pooled — once a driver
        // has accepted, the trip is already under way.
        setOrders(r.data.orders.filter(
          (o) => o.status === 'awaiting_agent' && !o.consignmentId
        ));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Re-quote whenever the selection or vehicle changes. Cheap and read-only —
  // the endpoint reserves nothing.
  useEffect(() => {
    if (picked.length < 2) { setQuote(null); return; }
    let cancelled = false;
    setQuoting(true);
    axios.post(`${API_ENDPOINTS.CONSIGNMENTS}/quote`, { orderIds: picked, vehicleType: vehicle })
      .then((r) => { if (!cancelled) setQuote(r.data.success ? r.data.quote : null); })
      .catch((e) => {
        if (!cancelled) setQuote({ error: e.response?.data?.error || 'Could not price this combination' });
      })
      .finally(() => { if (!cancelled) setQuoting(false); });
    return () => { cancelled = true; };
  }, [picked, vehicle]);

  const toggle = (id) =>
    setPicked((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const commit = () => {
    const saving = quote?.saving ?? 0;
    Alert.alert(
      'Send one vehicle?',
      saving > 0
        ? `${picked.length} farms on one ${vehicle}. ${money(quote.sharedFare)} instead of ${money(quote.soloFareTotal)} — you save ${money(saving)}.`
        : `${picked.length} farms on one ${vehicle} for ${money(quote.sharedFare)}. This is NOT cheaper than separate trips here.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send it',
          onPress: async () => {
            setCommitting(true);
            try {
              const r = await axios.post(API_ENDPOINTS.CONSIGNMENTS, {
                orderIds: picked, vehicleType: vehicle,
              });
              if (r.data.success) {
                setPicked([]); setQuote(null);
                await fetchOrders();
                Alert.alert(
                  'Looking for a driver',
                  `One ${vehicle} will collect from all ${r.data.consignment.stops.length} farms and deliver together. Each farmer keeps their own pickup code.`,
                  [{ text: 'OK' }]
                );
              }
            } catch (e) {
              Alert.alert('Could not send', e.response?.data?.error || 'Please try again.');
              fetchOrders();
            } finally {
              setCommitting(false);
            }
          },
        },
      ]
    );
  };

  const Row = ({ item }) => {
    const on = picked.includes(item._id);
    return (
      <TouchableOpacity style={[s.row, on && s.rowOn]} onPress={() => toggle(item._id)} activeOpacity={0.85}>
        <Ionicons
          name={on ? 'checkbox' : 'square-outline'}
          size={22} color={on ? '#16A34A' : '#D1D5DB'} />
        <View style={{ flex: 1 }}>
          <Text style={s.rowCrop}>{item.quantityKg} kg {item.cropName}</Text>
          <Text style={s.rowMeta}>
            {item.farmerName} · {item.pickup?.label || item.pickup?.district || 'farm'}
          </Text>
          <Text style={s.rowMeta}>to {item.dropoff?.label || 'your destination'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.rowFareLabel}>ALONE</Text>
          <Text style={s.rowFare}>{money(item.fare?.total)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;

  const canSend = picked.length >= 2 && quote && !quote.error && !quoting;

  return (
    <View style={s.container}>
      <FlatList
        data={orders}
        keyExtractor={(i) => i._id}
        renderItem={({ item }) => <Row item={item} />}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor="#16A34A"
            onRefresh={() => { setRefreshing(true); fetchOrders(); }} />
        }
        ListHeaderComponent={
          orders.length > 0 ? (
            <View style={s.intro}>
              <Text style={s.introTitle}>Put several farms on one vehicle</Text>
              <Text style={s.introText}>
                The vehicle is the cost — the load is nearly free. Two or three nearby farms
                sharing one tempo pay a fraction of what they pay travelling separately.
                Pick the orders below and we will price both.
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}><Ionicons name="git-merge-outline" size={34} color="#16A34A" /></View>
            <Text style={s.emptyTitle}>Nothing to pool right now</Text>
            <Text style={s.emptySub}>
              Only orders still waiting for a driver can share a vehicle. Buy from two or more
              farms going to the same place, then come back here before a driver accepts.
            </Text>
          </View>
        }
      />

      {picked.length > 0 && (
        <View style={s.panel}>
          <View style={s.vehRow}>
            {['auto', 'tempo', 'truck'].map((v) => (
              <TouchableOpacity key={v}
                style={[s.veh, vehicle === v && s.vehOn]}
                onPress={() => setVehicle(v)} activeOpacity={0.85}>
                <VehicleIcon type={v} width={34} />
                <Text style={[s.vehText, vehicle === v && s.vehTextOn]}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {picked.length < 2 && (
            <Text style={s.pickMore}>Pick at least one more farm to share a vehicle.</Text>
          )}

          {quoting && (
            <View style={s.quoting}>
              <ActivityIndicator size="small" color="#16A34A" />
              <Text style={s.quotingText}>Pricing the run…</Text>
            </View>
          )}

          {!quoting && quote?.error && (
            <View style={s.errBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#B45309" />
              <Text style={s.errText}>{quote.error}</Text>
            </View>
          )}

          {!quoting && quote && !quote.error && (
            <>
              <View style={s.compare}>
                <View style={s.compareCol}>
                  <Text style={s.compareLabel}>SEPARATELY</Text>
                  <Text style={s.compareSolo}>{money(quote.soloFareTotal)}</Text>
                  <Text style={s.compareSub}>{quote.stops} trips</Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color="#9CA3AF" />
                <View style={s.compareCol}>
                  <Text style={s.compareLabel}>SHARED</Text>
                  <Text style={s.compareShared}>{money(quote.sharedFare)}</Text>
                  <Text style={s.compareSub}>{quote.distanceKm} km · one {vehicle}</Text>
                </View>
              </View>

              {quote.worthIt ? (
                <View style={s.saveBox}>
                  <Ionicons name="trending-down-outline" size={17} color="#15803D" />
                  <Text style={s.saveText}>
                    Saves {money(quote.saving)} — {quote.savingPct}% off transport
                  </Text>
                </View>
              ) : (
                <View style={s.warnBox}>
                  <Ionicons name="alert-circle-outline" size={17} color="#B45309" />
                  <Text style={s.warnText}>
                    {quote.warning || 'These farms are too far apart — sharing costs more than separate trips here.'}
                  </Text>
                </View>
              )}

              <View style={s.splitBox}>
                <Text style={s.splitHead}>EACH FARM PAYS ITS SHARE, BY WEIGHT</Text>
                {quote.perStop.map((p, i) => {
                  const o = orders.find((x) => x._id === String(p.orderId));
                  return (
                    <View key={String(p.orderId)} style={s.splitRow}>
                      <Text style={s.splitName}>
                        {i + 1}. {o?.farmerName || 'Farm'} · {p.quantityKg} kg
                      </Text>
                      <Text style={s.splitFare}>{money(p.fareShare)}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          <TouchableOpacity
            style={[s.cta, (!canSend || committing) && { opacity: 0.5 }]}
            onPress={commit}
            disabled={!canSend || committing}
            activeOpacity={0.85}
          >
            {committing ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="git-merge-outline" size={18} color="#fff" />
                  <Text style={s.ctaText}>
                    Send one vehicle to {picked.length} farm{picked.length > 1 ? 's' : ''}
                  </Text>
                </>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  list: { padding: 16, gap: 10, paddingBottom: 30 },

  intro: { paddingBottom: 6 },
  introTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  introText: { fontSize: 13, color: '#6B7280', marginTop: 5, lineHeight: 19 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: '#F1F5F9',
  },
  rowOn: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  rowCrop: { fontSize: 15, fontWeight: '700', color: '#111827' },
  rowMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  rowFareLabel: { fontSize: 9, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.4 },
  rowFare: { fontSize: 14, fontWeight: '700', color: '#6B7280' },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyIcon: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 13.5, color: '#6B7280', textAlign: 'center', marginTop: 6, lineHeight: 20 },

  panel: {
    backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 16, paddingBottom: 26, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  vehRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  veh: {
    flex: 1, alignItems: 'center', gap: 3, paddingVertical: 9,
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
  },
  vehOn: { borderColor: '#16A34A', backgroundColor: '#DCFCE7' },
  vehText: { fontSize: 11.5, fontWeight: '600', color: '#9CA3AF', textTransform: 'capitalize' },
  vehTextOn: { color: '#15803D', fontWeight: '700' },

  pickMore: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 8 },
  quoting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  quotingText: { fontSize: 13, color: '#6B7280' },

  errBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: 11, marginBottom: 10,
  },
  errText: { flex: 1, fontSize: 12.5, color: '#7C2D12', lineHeight: 17 },

  compare: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, gap: 10,
  },
  compareCol: { flex: 1, alignItems: 'center' },
  compareLabel: { fontSize: 9.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5 },
  compareSolo: { fontSize: 20, fontWeight: '800', color: '#9CA3AF', textDecorationLine: 'line-through', marginTop: 3 },
  compareShared: { fontSize: 22, fontWeight: '900', color: '#15803D', marginTop: 3 },
  compareSub: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },

  saveBox: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#DCFCE7', borderRadius: 12, padding: 11, marginTop: 10,
  },
  saveText: { fontSize: 14, fontWeight: '700', color: '#15803D' },
  warnBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: 11, marginTop: 10,
  },
  warnText: { flex: 1, fontSize: 12.5, color: '#7C2D12', lineHeight: 17 },

  splitBox: { marginTop: 12 },
  splitHead: { fontSize: 9.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5, marginBottom: 6 },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  splitName: { fontSize: 13, color: '#6B7280', flex: 1 },
  splitFare: { fontSize: 13, fontWeight: '700', color: '#111827' },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 15, marginTop: 14,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

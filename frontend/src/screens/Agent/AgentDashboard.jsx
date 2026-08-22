import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import VehicleIcon from '../../components/vehicles/VehicleIcon';
import usePolling from '../../hooks/usePolling';
import AgentOnboarding from './AgentOnboarding';
import JobOfferSheet from './JobOfferSheet';

// The transport agent's home screen.
//
// There is no push notification path in Expo Go, so "dispatch" is this screen
// polling every 5 seconds while the agent is online and the app is in the
// foreground. That is a real product limitation, not a bug — an agent who
// closes the app stops receiving trips, which is why the offline state says
// so plainly.
export default function AgentDashboard({ navigation, route }) {
  const { userData } = route.params || {};
  const uid = userData?.uid || userData?.firebaseUid;

  const [profile, setProfile]   = useState(null);
  const [online, setOnline]     = useState(false);
  const [jobs, setJobs]         = useState([]);
  const [current, setCurrent]   = useState(null);
  const [offer, setOffer]       = useState(null);
  const [busy, setBusy]         = useState(false);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [onboard, setOnboard]   = useState(false);

  const here = useRef(null);
  const seen = useRef(new Set());   // offers already shown, so one job pops once

  // ── profile + a location fix ───────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API_ENDPOINTS.USERS}/firebase/${uid}`);
        const u = r.data.user || {};
        setProfile(u);
        setOnline(!!u.isOnline);
        if (!u.vehicle?.type) setOnboard(true);
      } catch {
        Alert.alert('Offline', 'Could not load your profile. Pull down to retry.');
      } finally {
        setLoading(false);
      }
    })();

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        here.current = { lat: fix.coords.latitude, lng: fix.coords.longitude };
      } catch { /* dispatch still works, just without distance-to-pickup */ }
    })();
  }, [uid]);

  // ── the dispatch poll ──────────────────────────────────────────────────
  const poll = useCallback(async () => {
    const cur = await axios.get(`${API_ENDPOINTS.ORDERS}/agent/current`);
    if (cur.data.success) setCurrent(cur.data.order);
    if (cur.data.order) { setJobs([]); setOffer(null); return; }

    const params = here.current ? `?lat=${here.current.lat}&lng=${here.current.lng}` : '';
    const r = await axios.get(`${API_ENDPOINTS.ORDERS}/agent/available${params}`);
    if (!r.data.success) return;

    setJobs(r.data.orders);
    // Surface the nearest unseen job as a popup; the rest stay in the list.
    const next = r.data.orders.find((o) => !seen.current.has(o._id));
    if (next) { seen.current.add(next._id); setOffer(next); }
  }, []);

  usePolling(poll, 5000, online && !!profile?.vehicle?.type);

  const toggleOnline = async (value) => {
    if (value && !profile?.vehicle?.type) { setOnboard(true); return; }
    setOnline(value);
    try {
      await axios.put(`${API_ENDPOINTS.USERS}/${uid}`, { isOnline: value });
    } catch { /* the local toggle is what gates polling; a failed sync is harmless */ }
    if (!value) { setJobs([]); setOffer(null); }
  };

  const accept = async (order) => {
    setBusy(true);
    try {
      const r = await axios.post(`${API_ENDPOINTS.ORDERS}/${order._id}/accept`, here.current || {});
      if (r.data.success) {
        setOffer(null);
        setCurrent(r.data.order);
        navigation.navigate('AgentTrip', { orderId: r.data.order._id, userData });
      }
    } catch (err) {
      const code = err.response?.data?.code;
      setOffer(null);
      // Losing a race is normal, not a failure — never an error dialog.
      if (code !== 'ALREADY_TAKEN') {
        Alert.alert('Could not accept', err.response?.data?.error || 'Please try again.');
      }
      poll();
    } finally {
      setBusy(false);
    }
  };

  const reject = async (order) => {
    setOffer(null);
    setJobs((list) => list.filter((j) => j._id !== order._id));
    try { await axios.post(`${API_ENDPOINTS.ORDERS}/${order._id}/reject`, {}); } catch { /* best effort */ }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#16A34A" />
        <Text style={s.loadingText}>Loading…</Text>
      </View>
    );
  }

  const vehicle = profile?.vehicle;

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor="#16A34A"
            onRefresh={async () => { setRefreshing(true); try { await poll(); } catch {} setRefreshing(false); }} />
        }
      >
        {/* Duty toggle */}
        <View style={[s.card, online && s.cardOn]}>
          <View style={s.dutyRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.dutyTitle}>{online ? 'You are online' : 'You are offline'}</Text>
              <Text style={s.dutySub}>
                {online
                  ? 'Looking for trips near you. Keep this screen open.'
                  : 'Go online to receive trip requests.'}
              </Text>
            </View>
            <Switch
              value={online}
              onValueChange={toggleOnline}
              trackColor={{ false: '#E2E8F0', true: '#BBF7D0' }}
              thumbColor={online ? '#16A34A' : '#94A3B8'}
            />
          </View>

          {vehicle?.type && (
            <>
              <View style={s.divider} />
              <View style={s.vehicleRow}>
                <VehicleIcon type={vehicle.type} width={56} />
                <View style={{ flex: 1 }}>
                  <Text style={s.vehicleName}>
                    {vehicle.type === 'auto' ? 'Auto' : vehicle.type === 'tempo' ? 'Tempo Van' : 'Truck'}
                  </Text>
                  <Text style={s.vehicleNum}>{vehicle.number || 'No number set'}</Text>
                </View>
                <TouchableOpacity onPress={() => setOnboard(true)} hitSlop={10}>
                  <Ionicons name="create-outline" size={19} color="#6B7280" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Active job takes over everything else */}
        {current ? (
          <TouchableOpacity
            style={s.activeCard}
            onPress={() => navigation.navigate('AgentTrip', { orderId: current._id, userData })}
            activeOpacity={0.9}
          >
            <View style={s.activeChip}>
              <View style={s.activeDot} />
              <Text style={s.activeChipText}>
                {current.status === 'accepted' ? 'GO TO PICKUP' : 'DELIVER NOW'}
              </Text>
            </View>
            <Text style={s.activeCrop}>{current.quantityKg} kg {current.cropName}</Text>
            <Text style={s.activeRoute} numberOfLines={1}>
              {current.pickup?.label} <Text style={s.arrow}>→</Text> {current.dropoff?.label}
            </Text>
            <View style={s.activeFooter}>
              <Text style={s.activePay}>₹{(current.fare?.agentPayout ?? current.fare?.total)?.toLocaleString('en-IN')}</Text>
              <View style={s.activeGo}>
                <Text style={s.activeGoText}>Open trip</Text>
                <Ionicons name="arrow-forward" size={15} color="#fff" />
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <>
            <Text style={s.sectionTitle}>
              {online ? `Available trips${jobs.length ? ` (${jobs.length})` : ''}` : 'Trips'}
            </Text>

            {!online ? (
              <View style={s.placeholder}>
                <View style={s.placeholderIcon}><Ionicons name="moon-outline" size={30} color="#16A34A" /></View>
                <Text style={s.placeholderTitle}>You are offline</Text>
                <Text style={s.placeholderText}>Turn on the switch above to start receiving trips.</Text>
              </View>
            ) : jobs.length === 0 ? (
              <View style={s.placeholder}>
                <ActivityIndicator color="#16A34A" />
                <Text style={s.placeholderTitle}>Waiting for trips</Text>
                <Text style={s.placeholderText}>
                  You will be shown trips your {vehicle?.type === 'auto' ? 'auto' : vehicle?.type === 'tempo' ? 'tempo' : 'truck'} can carry.
                </Text>
              </View>
            ) : (
              jobs.map((j) => (
                <TouchableOpacity key={j._id} style={s.jobCard} onPress={() => setOffer(j)} activeOpacity={0.85}>
                  <VehicleIcon type={j.vehicleType} width={50} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.jobRoute} numberOfLines={1}>
                      {j.pickup?.district} <Text style={s.arrow}>→</Text> {j.dropoff?.label}
                    </Text>
                    <Text style={s.jobMeta}>
                      {j.distanceKm} km · {j.quantityKg} kg
                      {j.approachKm != null ? ` · ${j.approachKm} km away` : ''}
                    </Text>
                  </View>
                  <Text style={s.jobPay}>₹{(j.fare?.agentPayout ?? j.fare?.total)?.toLocaleString('en-IN')}</Text>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {online && !current && (
          <View style={s.warnBox}>
            <Ionicons name="information-circle-outline" size={17} color="#C2410C" />
            <Text style={s.warnText}>
              Trip requests only arrive while this app is open on screen. Locking your
              phone or switching apps will stop them.
            </Text>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <AgentOnboarding
        visible={onboard}
        uid={uid}
        initial={vehicle}
        onDone={(v) => {
          setProfile((p) => ({ ...p, vehicle: v }));
          setOnboard(false);
          toggleOnline(true);
        }}
      />

      {!current && (
        <JobOfferSheet order={offer} onAccept={accept} onReject={reject} busy={busy} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F8FAFC' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },
  scroll:      { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 5, borderWidth: 1, borderColor: '#F1F5F9',
  },
  cardOn:  { borderColor: '#BBF7D0' },
  divider: { height: 1, backgroundColor: '#F1F5F9' },

  dutyRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dutyTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  dutySub:   { fontSize: 12.5, color: '#6B7280', marginTop: 3, lineHeight: 18 },

  vehicleRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vehicleName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  vehicleNum:  { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 4 },

  placeholder: {
    alignItems: 'center', gap: 8, paddingVertical: 34, paddingHorizontal: 24,
    backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#F1F5F9',
  },
  placeholderIcon:  { width: 62, height: 62, borderRadius: 31, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  placeholderTitle: { fontSize: 15.5, fontWeight: '700', color: '#1F2937', marginTop: 4 },
  placeholderText:  { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 19 },

  jobCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 16, padding: 13,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  jobRoute: { fontSize: 14, fontWeight: '700', color: '#111827' },
  jobMeta:  { fontSize: 12, color: '#9CA3AF', marginTop: 3 },
  jobPay:   { fontSize: 17, fontWeight: '800', color: '#15803D' },
  arrow:    { color: '#16A34A' },

  activeCard: {
    backgroundColor: '#15803D', borderRadius: 20, padding: 18, gap: 8,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 8,
  },
  activeChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  activeDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: '#BBF7D0' },
  activeChipText: { fontSize: 10.5, fontWeight: '800', color: '#fff', letterSpacing: 0.8 },
  activeCrop:     { fontSize: 19, fontWeight: '800', color: '#fff', marginTop: 2 },
  activeRoute:    { fontSize: 13, color: 'rgba(255,255,255,0.82)' },
  activeFooter:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  activePay:      { fontSize: 22, fontWeight: '800', color: '#fff' },
  activeGo:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 9 },
  activeGoText:   { color: '#fff', fontWeight: '700', fontSize: 13.5 },

  warnBox: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: '#FFF7ED', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  warnText: { flex: 1, fontSize: 12.5, color: '#C2410C', lineHeight: 18 },
});

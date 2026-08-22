import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Linking, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useKeepAwake } from 'expo-keep-awake';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import VehicleIcon from '../../components/vehicles/VehicleIcon';
import usePolling from '../../hooks/usePolling';
import TrackingMapSurface from '../../components/map/TrackingMapSurface';
import { startSimulation, bearing } from '../../utils/tripSimulator';

// The agent's live job. Live map tracking lands in phase 5; for now this
// carries the two things a driver actually needs — where to go next, and the
// handover code that lets them move to the next stage.
const STAGES = [
  { key: 'accepted',  label: 'Go to farm' },
  { key: 'picked_up', label: 'Collect' },
  { key: 'delivered', label: 'Deliver' },
];

export default function AgentTripScreen({ navigation, route }) {
  const { orderId, userData } = route.params || {};
  const [order, setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp]       = useState('');
  const [busy, setBusy]     = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [mapApi, setMapApi] = useState(null);

  // Expo Go has no background location, so the OS will stop the GPS watch the
  // moment the screen locks. Keeping the screen awake is the only mitigation
  // available here — the banner below tells the driver the rest.
  useKeepAwake();

  const seq = useRef(0);
  const stopSim = useRef(null);
  const lastPos = useRef(null);
  const drawnLeg = useRef(null);

  const fetchOrder = useCallback(async () => {
    const r = await axios.get(`${API_ENDPOINTS.ORDERS}/${orderId}`);
    if (r.data.success) setOrder(r.data.order);
    setLoading(false);
  }, [orderId]);

  usePolling(fetchOrder, 8000, true);

  // ── position reporting ────────────────────────────────────────────────
  const report = useCallback(async (lat, lng, heading, simulated) => {
    lastPos.current = { lat, lng, heading };
    // seq is a counter, not a clock: mobile networks reorder pings, and a
    // phone whose clock is wrong would otherwise freeze the vendor's marker.
    seq.current += 1;
    try {
      await axios.post(`${API_ENDPOINTS.ORDERS}/${orderId}/location`, {
        lat, lng, heading, seq: seq.current, simulated: !!simulated,
      });
    } catch { /* a dropped ping is normal on mobile data */ }
    if (mapApi) mapApi.setVehicle(lat, lng, heading, order?.vehicleType, 4500);
  }, [orderId, mapApi, order?.vehicleType]);

  // Real GPS, while the trip is live and we are not simulating.
  useEffect(() => {
    if (simulating || !order || !['accepted', 'picked_up'].includes(order.status)) return;
    let sub;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 20 },
        (fix) => {
          const p = { lat: fix.coords.latitude, lng: fix.coords.longitude };
          const head = fix.coords.heading ?? (lastPos.current ? bearing(lastPos.current, p) : 0);
          report(p.lat, p.lng, head, false);
        }
      );
    })();
    return () => sub && sub.remove();
  }, [simulating, order?.status, report]);

  // Simulation drives the very same endpoint — only the GPS chip is replaced.
  const toggleSim = () => {
    if (simulating) {
      stopSim.current && stopSim.current();
      stopSim.current = null;
      setSimulating(false);
      return;
    }
    const line = order.status === 'picked_up' ? order.routePolyline : order.approachPolyline;
    if (!line || line.length < 2) {
      Alert.alert('No route to simulate', 'This leg has no stored route line.');
      return;
    }
    setSimulating(true);
    stopSim.current = startSimulation({
      polyline: line,
      kmph: 45,
      tickMs: 4000,
      onMove: (p) => report(p.lat, p.lng, p.heading, true),
    });
  };

  useEffect(() => () => { stopSim.current && stopSim.current(); }, []);

  // ── draw the map for the current leg ──────────────────────────────────
  useEffect(() => {
    if (!mapApi || !order) return;
    mapApi.setPins(order.pickup, order.dropoff);

    const leg = order.status === 'picked_up' ? 'main' : 'approach';
    if (drawnLeg.current !== leg) {
      drawnLeg.current = leg;
      if (leg === 'approach') {
        mapApi.setRoute(order.approachPolyline, 'approach');
        mapApi.setRoute(order.routePolyline, 'main');
      } else {
        mapApi.clearRoute('approach');
        mapApi.setRoute(order.routePolyline, 'main');
      }
      mapApi.fitAll();
    }
    if (order.tracking?.lat != null) {
      mapApi.setVehicle(order.tracking.lat, order.tracking.lng, order.tracking.heading, order.vehicleType, 1000);
    }
  }, [mapApi, order?.status, order?._id]);

  const collecting = order?.status === 'accepted';
  const target = collecting ? order?.pickup : order?.dropoff;

  const navigateTo = () => {
    if (!target?.lat) return;
    // Hand off to whatever maps app the driver already uses — far better than
    // trying to be a navigation app.
    const url = `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=driving`;
    Linking.openURL(url).catch(() => Alert.alert('No maps app', 'Could not open navigation.'));
  };

  const submitOtp = async () => {
    const code = otp.trim();
    if (code.length !== 4) return;
    setBusy(true);
    try {
      const step = collecting ? 'pickup' : 'deliver';
      const r = await axios.post(`${API_ENDPOINTS.ORDERS}/${orderId}/${step}`, { otp: code });
      if (r.data.success) {
        setOtpOpen(false);
        setOtp('');
        setOrder(r.data.order);
        if (r.data.order.status === 'delivered') {
          Alert.alert('Trip complete 🎉',
            `₹${(r.data.order.fare?.agentPayout ?? r.data.order.fare?.total)?.toLocaleString('en-IN')} earned. Collect ₹${r.data.order.grandTotal?.toLocaleString('en-IN')} cash from the buyer.`,
            [{ text: 'Done', onPress: () => navigation.goBack() }]);
        }
      }
    } catch (err) {
      Alert.alert('Wrong code', err.response?.data?.error || 'Please check and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !order) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#16A34A" />
      </View>
    );
  }

  const stageIndex = STAGES.findIndex((x) => x.key === order.status);

  return (
    <View style={s.container}>
      <View style={s.mapWrap}>
        <TrackingMapSurface
          initialCenter={order.pickup?.lat ? { lat: order.pickup.lat, lng: order.pickup.lng } : undefined}
          initialZoom={13}
          onReady={setMapApi}
          onUnfollow={() => {}}
        />
        <TouchableOpacity style={s.recenter} onPress={() => mapApi && (mapApi.follow(true), mapApi.fitAll())}>
          <Ionicons name="locate" size={17} color="#111827" />
        </TouchableOpacity>
        {/* Dev aid: walk the stored route instead of waiting for real GPS.
            Reaches the server through the same /location endpoint. */}
        <TouchableOpacity style={[s.simBtn, simulating && s.simBtnOn]} onPress={toggleSim}>
          <Ionicons name={simulating ? 'pause' : 'play'} size={13} color={simulating ? '#fff' : '#111827'} />
          <Text style={[s.simText, simulating && { color: '#fff' }]}>
            {simulating ? 'Simulating' : 'Simulate drive'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>

        {/* Stage bar */}
        <View style={s.stages}>
          {STAGES.map((st, i) => {
            const done = i < stageIndex, on = i === stageIndex;
            return (
              <View key={st.key} style={s.stage}>
                <View style={[s.stageDot, (done || on) && s.stageDotOn, on && s.stageDotNow]}>
                  {done
                    ? <Ionicons name="checkmark" size={13} color="#fff" />
                    : <Text style={[s.stageNum, (on) && { color: '#fff' }]}>{i + 1}</Text>}
                </View>
                <Text style={[s.stageLabel, on && s.stageLabelOn]}>{st.label}</Text>
                {i < STAGES.length - 1 && <View style={[s.stageLine, done && s.stageLineOn]} />}
              </View>
            );
          })}
        </View>

        {/* Where to go now */}
        <View style={s.card}>
          <Text style={s.nowLabel}>{collecting ? 'COLLECT FROM' : 'DELIVER TO'}</Text>
          <Text style={s.nowValue}>{target?.label}</Text>
          <Text style={s.nowSub}>
            {collecting
              ? `${order.farmerName} · ${order.quantityKg} kg ${order.cropName}`
              : `${order.vendorName}${order.vendorCompany ? ` · ${order.vendorCompany}` : ''}`}
          </Text>

          <View style={s.actionRow}>
            <TouchableOpacity style={s.navBtn} onPress={navigateTo}>
              <Ionicons name="navigate" size={16} color="#fff" />
              <Text style={s.navBtnText}>Navigate</Text>
            </TouchableOpacity>
            {!!(collecting ? order.farmerPhone : order.vendorPhone) && (
              <TouchableOpacity
                style={s.callBtn}
                onPress={() => Linking.openURL(`tel:${collecting ? order.farmerPhone : order.vendorPhone}`)}
              >
                <Ionicons name="call" size={16} color="#2563EB" />
                <Text style={s.callBtnText}>Call</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Trip summary */}
        <View style={s.card}>
          <View style={s.vehicleRow}>
            <VehicleIcon type={order.vehicleType} width={54} />
            <View style={{ flex: 1 }}>
              <Text style={s.tripTitle}>{order.distanceKm} km trip</Text>
              <Text style={s.tripSub}>~{order.durationMin} min · {order.quantityKg} kg</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.earnLabel}>YOU EARN</Text>
              <Text style={s.earnValue}>₹{(order.fare?.agentPayout ?? order.fare?.total)?.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          <View style={s.divider} />

          <View style={s.legRow}>
            <View style={s.legDots}>
              <View style={s.dotPickup} />
              <View style={s.legLine} />
              <View style={s.dotDrop} />
            </View>
            <View style={{ flex: 1, gap: 12 }}>
              <View>
                <Text style={s.legLabel}>PICKUP</Text>
                <Text style={s.legValue}>{order.pickup?.label}</Text>
              </View>
              <View>
                <Text style={s.legLabel}>DROP</Text>
                <Text style={s.legValue}>{order.dropoff?.label}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.codBox}>
          <Ionicons name="cash-outline" size={18} color="#C2410C" />
          <Text style={s.codText}>
            Collect <Text style={{ fontWeight: '800' }}>₹{order.grandTotal?.toLocaleString('en-IN')}</Text> cash
            from the buyer on delivery.
          </Text>
        </View>

        <View style={s.awakeBox}>
          <Ionicons name="phone-portrait-outline" size={16} color="#C2410C" />
          <Text style={s.awakeText}>
            Keep this screen open. Location sharing stops if you lock the phone
            or switch apps.
          </Text>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {order.status !== 'delivered' && (
        <View style={s.footer}>
          <TouchableOpacity style={s.cta} onPress={() => { setOtp(''); setOtpOpen(true); }} activeOpacity={0.85}>
            <Ionicons name="keypad-outline" size={18} color="#fff" />
            <Text style={s.ctaText}>
              {collecting ? 'Enter pickup code' : 'Enter delivery code'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* OTP gate */}
      <Modal visible={otpOpen} transparent animationType="fade" onRequestClose={() => setOtpOpen(false)}>
        <View style={s.otpOverlay}>
          <View style={s.otpSheet}>
            <Text style={s.otpTitle}>{collecting ? 'Pickup code' : 'Delivery code'}</Text>
            <Text style={s.otpSub}>
              {collecting
                ? `Ask ${order.farmerName} for the 4-digit code shown in their app.`
                : `Ask ${order.vendorName} for the 4-digit code shown in their app.`}
            </Text>
            <TextInput
              style={s.otpInput}
              value={otp}
              onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
              placeholder="0000"
              placeholderTextColor="#CBD5E1"
            />
            <View style={s.otpActions}>
              <TouchableOpacity style={[s.otpBtn, s.otpCancel]} onPress={() => setOtpOpen(false)}>
                <Text style={s.otpCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.otpBtn, s.otpConfirm, (otp.length !== 4 || busy) && s.otpConfirmOff]}
                onPress={submitOtp}
                disabled={otp.length !== 4 || busy}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.otpConfirmText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  mapWrap:   { height: 240, backgroundColor: '#E2E8F0' },
  recenter: {
    position: 'absolute', right: 12, bottom: 12, width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  simBtn: {
    position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 19, paddingHorizontal: 12, paddingVertical: 8,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  simBtnOn: { backgroundColor: '#2563EB' },
  simText:  { fontSize: 12, fontWeight: '700', color: '#111827' },
  awakeBox: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: '#FFF7ED', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  awakeText: { flex: 1, fontSize: 12.5, color: '#C2410C', lineHeight: 18 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  scroll:    { padding: 16, gap: 12 },

  stages: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  stage:  { flex: 1, alignItems: 'center', gap: 6 },
  stageDot: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  stageDotOn:  { backgroundColor: '#16A34A' },
  stageDotNow: { backgroundColor: '#16A34A' },
  stageNum:    { fontSize: 12, fontWeight: '800', color: '#9CA3AF' },
  stageLabel:  { fontSize: 11.5, color: '#9CA3AF', fontWeight: '600' },
  stageLabelOn:{ color: '#15803D', fontWeight: '800' },
  stageLine:   { position: 'absolute', top: 13, left: '55%', right: '-45%', height: 2, backgroundColor: '#F1F5F9', zIndex: 1 },
  stageLineOn: { backgroundColor: '#16A34A' },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 8,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 5, borderWidth: 1, borderColor: '#F1F5F9',
  },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 4 },

  nowLabel: { fontSize: 9.5, fontWeight: '800', color: '#16A34A', letterSpacing: 0.9 },
  nowValue: { fontSize: 19, fontWeight: '800', color: '#111827', marginTop: 3 },
  nowSub:   { fontSize: 13, color: '#6B7280', marginTop: 2 },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  navBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 12,
  },
  navBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#EFF6FF', paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE',
  },
  callBtnText: { color: '#2563EB', fontSize: 14, fontWeight: '700' },

  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tripTitle:  { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  tripSub:    { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  earnLabel:  { fontSize: 9, color: '#9CA3AF', fontWeight: '700', letterSpacing: 0.5 },
  earnValue:  { fontSize: 19, fontWeight: '800', color: '#15803D' },

  legRow:    { flexDirection: 'row', gap: 14 },
  legDots:   { alignItems: 'center', paddingTop: 5 },
  dotPickup: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#16A34A' },
  legLine:   { width: 2, flex: 1, minHeight: 22, backgroundColor: '#E2E8F0', marginVertical: 3 },
  dotDrop:   { width: 10, height: 10, borderRadius: 2, backgroundColor: '#EA580C' },
  legLabel:  { fontSize: 9.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.8 },
  legValue:  { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 2 },

  codBox: {
    flexDirection: 'row', gap: 9, alignItems: 'center',
    backgroundColor: '#FFF7ED', borderRadius: 12, padding: 13,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  codText: { flex: 1, fontSize: 13, color: '#C2410C', lineHeight: 19 },

  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', paddingVertical: 15, borderRadius: 12,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  otpOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  otpSheet:   { backgroundColor: '#fff', borderRadius: 20, padding: 22, width: '100%', gap: 8 },
  otpTitle:   { fontSize: 19, fontWeight: '800', color: '#111827' },
  otpSub:     { fontSize: 13.5, color: '#6B7280', lineHeight: 19 },
  otpInput: {
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14,
    fontSize: 32, fontWeight: '800', color: '#111827', textAlign: 'center',
    letterSpacing: 12, paddingVertical: 14, marginTop: 10,
  },
  otpActions:     { flexDirection: 'row', gap: 10, marginTop: 14 },
  otpBtn:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12 },
  otpCancel:      { backgroundColor: '#F1F5F9' },
  otpCancelText:  { color: '#6B7280', fontSize: 14.5, fontWeight: '700' },
  otpConfirm:     { backgroundColor: '#16A34A' },
  otpConfirmOff:  { backgroundColor: '#94A3B8' },
  otpConfirmText: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
});

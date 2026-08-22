import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import TrackingMapSurface from '../../components/map/TrackingMapSurface';
import VehicleIcon from '../../components/vehicles/VehicleIcon';
import usePolling from '../../hooks/usePolling';

// Zomato-style delivery tracking: the vehicle slides along a blue line while
// a card at the bottom carries the state.
//
// The one rule this screen takes seriously: never pretend a stale position is
// live. Expo Go can only report location while the driver's app is in the
// foreground, so gaps are normal — the marker dims and the card says when it
// was last seen, rather than showing a frozen vehicle as if it were moving.
const STATE = {
  awaiting_agent: { title: 'Finding a driver',   sub: 'Nearby drivers are being offered your trip.', tone: '#EA580C' },
  no_agents:      { title: 'No driver found',    sub: 'Nobody accepted in time. Try again from My Orders.', tone: '#DC2626' },
  accepted:       { title: 'Driver on the way',  sub: 'Heading to the farm to collect your crop.', tone: '#2563EB' },
  picked_up:      { title: 'Out for delivery',   sub: 'Your crop is on the way to you.', tone: '#2563EB' },
  delivered:      { title: 'Delivered',          sub: 'This order is complete.', tone: '#16A34A' },
  cancelled:      { title: 'Cancelled',          sub: 'This order was cancelled.', tone: '#9CA3AF' },
};

export default function TrackOrderScreen({ navigation, route }) {
  const { orderId } = route.params || {};
  const [track, setTrack]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapApi, setMapApi] = useState(null);
  const [following, setFollowing] = useState(true);

  const gotFull = useRef(false);
  const drawnLeg = useRef(null);
  const full = useRef(null);

  const fetchTrack = useCallback(async () => {
    // Polylines never change, so they are fetched once and then omitted from
    // every subsequent poll — at 5s a 300-point line would be megabytes an hour.
    const needFull = !gotFull.current;
    const r = await axios.get(`${API_ENDPOINTS.ORDERS}/${orderId}/track${needFull ? '?full=1' : ''}`);
    if (!r.data.success) return;
    if (needFull) { gotFull.current = true; full.current = r.data.track; }
    setTrack((prev) => ({ ...(full.current || {}), ...(prev || {}), ...r.data.track }));
    setLoading(false);
  }, [orderId]);

  const live = track && ['accepted', 'picked_up'].includes(track.status);
  usePolling(fetchTrack, live ? 5000 : 10000, true);

  // Draw pins and the leg-appropriate route, once per leg.
  useEffect(() => {
    if (!mapApi || !track) return;
    mapApi.setPins(track.pickup, track.dropoff);

    const leg = track.status === 'picked_up' ? 'main' : 'approach';
    if (drawnLeg.current !== leg) {
      drawnLeg.current = leg;
      const f = full.current || {};
      if (leg === 'approach') {
        mapApi.setRoute(f.approachPolyline, 'approach');
        mapApi.setRoute(f.routePolyline, 'main');
      } else {
        mapApi.clearRoute('approach');
        mapApi.setRoute(f.routePolyline, 'main');
      }
      mapApi.fitAll();
    }
  }, [mapApi, track?.status]);

  // Move the marker. The page lerps between points, so one update per poll
  // renders as continuous motion rather than a teleport.
  useEffect(() => {
    if (!mapApi || !track?.tracking || track.tracking.lat == null) return;
    mapApi.setVehicle(track.tracking.lat, track.tracking.lng, track.tracking.heading, track.vehicleType, 5000);
    mapApi.setStale(track.stale);
  }, [mapApi, track?.tracking?.seq, track?.stale]);

  if (loading || !track) {
    return <View style={s.center}><ActivityIndicator size="large" color="#16A34A" /></View>;
  }

  const meta = STATE[track.status] || STATE.awaiting_agent;
  const f = full.current || {};

  const lastSeen = () => {
    if (track.ageSec == null) return 'No location yet';
    if (track.ageSec < 30) return 'Live';
    if (track.ageSec < 90) return 'Last seen a moment ago';
    return `Last seen ${Math.round(track.ageSec / 60)} min ago`;
  };

  return (
    <View style={s.container}>
      <View style={s.mapWrap}>
        <TrackingMapSurface
          initialCenter={track.pickup?.lat ? { lat: track.pickup.lat, lng: track.pickup.lng } : undefined}
          initialZoom={12}
          onReady={setMapApi}
          onUnfollow={() => setFollowing(false)}
        />
        {!following && (
          <TouchableOpacity
            style={s.recenter}
            onPress={() => { setFollowing(true); mapApi?.follow(true); mapApi?.fitAll(); }}
          >
            <Ionicons name="locate" size={16} color="#111827" />
            <Text style={s.recenterText}>Recenter</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView style={s.sheet} contentContainerStyle={s.sheetInner}>
        <View style={s.grabber} />

        <View style={s.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: meta.tone }]}>{meta.title}</Text>
            <Text style={s.sub}>{meta.sub}</Text>
          </View>
          {live && track.etaMin != null && (
            <View style={s.etaBox}>
              <Text style={s.etaValue}>{track.etaMin}</Text>
              <Text style={s.etaUnit}>min</Text>
            </View>
          )}
        </View>

        {live && (
          <View style={[s.liveRow, track.stale && s.liveRowStale]}>
            <View style={[s.liveDot, track.stale && s.liveDotStale]} />
            <Text style={[s.liveText, track.stale && s.liveTextStale]}>
              {lastSeen()}
              {track.remainingKm != null ? ` · ${track.remainingKm} km to go` : ''}
              {track.tracking?.simulated ? ' · simulated' : ''}
            </Text>
          </View>
        )}
        {live && track.stale && (
          <Text style={s.staleHint}>
            The driver's app may be closed or out of signal. The trip is still on.
          </Text>
        )}

        {!!track.agentName && (
          <View style={s.agentCard}>
            <VehicleIcon type={track.vehicleType} width={54} />
            <View style={{ flex: 1 }}>
              <Text style={s.agentName}>{track.agentName}</Text>
              <Text style={s.agentSub}>{track.agentVehicleNumber || 'Vehicle number pending'}</Text>
            </View>
            {!!track.agentPhone && (
              <TouchableOpacity style={s.callChip} onPress={() => Linking.openURL(`tel:${track.agentPhone}`)}>
                <Ionicons name="call" size={14} color="#2563EB" />
                <Text style={s.callChipText}>Call</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {['accepted', 'picked_up'].includes(track.status) && !!f.dropOtp && (
          <View style={s.otpBox}>
            <View style={{ flex: 1 }}>
              <Text style={s.otpLabel}>Delivery code</Text>
              <Text style={s.otpHint}>Give this to the driver only when your goods arrive</Text>
            </View>
            <Text style={s.otpValue}>{f.dropOtp}</Text>
          </View>
        )}

        <View style={s.card}>
          <View style={s.legRow}>
            <View style={s.legDots}>
              <View style={s.dotPickup} />
              <View style={s.legLine} />
              <View style={s.dotDrop} />
            </View>
            <View style={{ flex: 1, gap: 14 }}>
              <View>
                <Text style={s.legLabel}>PICKUP</Text>
                <Text style={s.legValue}>{track.pickup?.label}</Text>
              </View>
              <View>
                <Text style={s.legLabel}>DROP</Text>
                <Text style={s.legValue}>{track.dropoff?.label}</Text>
              </View>
            </View>
          </View>
          {!!f.cropName && (
            <>
              <View style={s.divider} />
              <View style={s.summaryRow}>
                <Text style={s.summaryKey}>{f.quantityKg} kg {f.cropName}</Text>
                <Text style={s.summaryVal}>₹{f.grandTotal?.toLocaleString('en-IN')} on delivery</Text>
              </View>
            </>
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },

  mapWrap: { flex: 1, minHeight: 220, backgroundColor: '#E2E8F0' },
  backBtn: {
    position: 'absolute', top: 14, left: 14, width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  recenter: {
    position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 19, paddingHorizontal: 12, paddingVertical: 9,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  recenterText: { fontSize: 12.5, fontWeight: '700', color: '#111827' },

  sheet: {
    maxHeight: '58%', backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 22, borderTopRightRadius: 22, marginTop: -18,
  },
  sheetInner: { padding: 16, gap: 12, paddingTop: 8 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 6 },

  headRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title:   { fontSize: 19, fontWeight: '800' },
  sub:     { fontSize: 13, color: '#6B7280', marginTop: 3, lineHeight: 18 },
  etaBox:  { alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  etaValue:{ fontSize: 22, fontWeight: '800', color: '#1D4ED8' },
  etaUnit: { fontSize: 10.5, fontWeight: '700', color: '#2563EB', letterSpacing: 0.5 },

  liveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5,
  },
  liveRowStale:  { backgroundColor: '#F1F5F9' },
  liveDot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: '#16A34A' },
  liveDotStale:  { backgroundColor: '#9CA3AF' },
  liveText:      { fontSize: 12, fontWeight: '700', color: '#15803D' },
  liveTextStale: { color: '#6B7280' },
  staleHint:     { fontSize: 12, color: '#9CA3AF', lineHeight: 17, marginTop: -6 },

  agentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: '#F1F5F9',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 5,
  },
  agentName: { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  agentSub:  { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  callChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFF6FF',
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE',
  },
  callChipText: { fontSize: 13, color: '#2563EB', fontWeight: '700' },

  otpBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F0FDF4', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  otpLabel: { fontSize: 12.5, color: '#15803D', fontWeight: '800' },
  otpHint:  { fontSize: 11.5, color: '#6B7280', marginTop: 2, lineHeight: 16 },
  otpValue: { fontSize: 26, fontWeight: '800', color: '#15803D', letterSpacing: 5 },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 5,
  },
  divider:  { height: 1, backgroundColor: '#F1F5F9' },
  legRow:   { flexDirection: 'row', gap: 14 },
  legDots:  { alignItems: 'center', paddingTop: 5 },
  dotPickup:{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#16A34A' },
  legLine:  { width: 2, flex: 1, minHeight: 24, backgroundColor: '#E2E8F0', marginVertical: 3 },
  dotDrop:  { width: 10, height: 10, borderRadius: 2, backgroundColor: '#EA580C' },
  legLabel: { fontSize: 9.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.8 },
  legValue: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 2 },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryKey: { fontSize: 13.5, color: '#374151', fontWeight: '600' },
  summaryVal: { fontSize: 13.5, color: '#15803D', fontWeight: '700' },
});

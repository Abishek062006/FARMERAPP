import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Animated, Easing, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import VehicleIcon from '../../components/vehicles/VehicleIcon';

const OFFER_SECONDS = 20;

// The Rapido-captain popup: one job, the money up front, and a countdown.
// A driver looks at this for two seconds at a traffic signal, so the earnings
// figure is the largest thing on screen and everything else is one line.
export default function JobOfferSheet({ order, onAccept, onReject, busy }) {
  const [left, setLeft] = useState(OFFER_SECONDS);
  const bar = useRef(new Animated.Value(1)).current;
  const rejected = useRef(false);

  useEffect(() => {
    if (!order) return;
    rejected.current = false;
    setLeft(OFFER_SECONDS);
    bar.setValue(1);

    Animated.timing(bar, {
      toValue: 0,
      duration: OFFER_SECONDS * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    const tick = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          clearInterval(tick);
          // Timing out is a decline: the job goes to the next driver rather
          // than sitting on a screen nobody is looking at.
          if (!rejected.current) { rejected.current = true; onReject(order, true); }
          return 0;
        }
        return n - 1;
      });
    }, 1000);

    return () => clearInterval(tick);
  }, [order?._id]);

  if (!order) return null;

  const payout = order.fare?.agentPayout ?? order.fare?.total ?? 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => onReject(order)}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <Animated.View style={[s.timerBar, {
            width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }]} />

          <View style={s.head}>
            <View style={s.newChip}>
              <View style={s.newDot} />
              <Text style={s.newText}>NEW TRIP</Text>
            </View>
            <Text style={s.countdown}>{left}s</Text>
          </View>

          <View style={s.payRow}>
            <VehicleIcon type={order.vehicleType} width={72} />
            <View style={{ flex: 1 }}>
              <Text style={s.payout}>₹{payout.toLocaleString('en-IN')}</Text>
              <Text style={s.payoutSub}>{order.distanceKm} km trip · ~{order.durationMin} min</Text>
            </View>
          </View>

          <View style={s.legs}>
            <View style={s.legRow}>
              <View style={s.dotPickup} />
              <View style={{ flex: 1 }}>
                <Text style={s.legLabel}>PICK UP</Text>
                <Text style={s.legValue} numberOfLines={1}>{order.pickup?.label}</Text>
                {order.approachKm != null && (
                  <Text style={s.legSub}>{order.approachKm} km from you</Text>
                )}
              </View>
            </View>
            <View style={s.legConnector} />
            <View style={s.legRow}>
              <View style={s.dotDrop} />
              <View style={{ flex: 1 }}>
                <Text style={s.legLabel}>DROP</Text>
                <Text style={s.legValue} numberOfLines={1}>{order.dropoff?.label}</Text>
              </View>
            </View>
          </View>

          <View style={s.loadRow}>
            <Ionicons name="cube-outline" size={15} color="#6B7280" />
            <Text style={s.loadText}>{order.quantityKg} kg · {order.cropName}</Text>
            <View style={s.codChip}>
              <Text style={s.codText}>COD ₹{order.grandTotal?.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          <View style={s.actions}>
            <TouchableOpacity
              style={[s.btn, s.reject]}
              onPress={() => { rejected.current = true; onReject(order); }}
              disabled={busy}
            >
              <Text style={s.rejectText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.accept]}
              onPress={() => onAccept(order)}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="checkmark" size={19} color="#fff" />
                  <Text style={s.acceptText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24, gap: 14,
    overflow: 'hidden',
  },
  timerBar: { position: 'absolute', top: 0, left: 0, height: 4, backgroundColor: '#16A34A' },

  head:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  newChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DCFCE7', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5 },
  newDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  newText:   { fontSize: 11, fontWeight: '800', color: '#15803D', letterSpacing: 0.8 },
  countdown: { fontSize: 15, fontWeight: '800', color: '#EA580C' },

  payRow:    { flexDirection: 'row', alignItems: 'center', gap: 14 },
  payout:    { fontSize: 34, fontWeight: '800', color: '#15803D', letterSpacing: -0.5 },
  payoutSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },

  legs:      { gap: 0 },
  legRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dotPickup: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#16A34A', marginTop: 5 },
  dotDrop:   { width: 11, height: 11, borderRadius: 2, backgroundColor: '#EA580C', marginTop: 5 },
  legConnector: { width: 2, height: 18, backgroundColor: '#E2E8F0', marginLeft: 4.5, marginVertical: 3 },
  legLabel:  { fontSize: 9.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.8 },
  legValue:  { fontSize: 14.5, fontWeight: '700', color: '#111827', marginTop: 2 },
  legSub:    { fontSize: 12, color: '#2563EB', fontWeight: '600', marginTop: 1 },

  loadRow:  { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  loadText: { flex: 1, fontSize: 13, color: '#374151', fontWeight: '600' },
  codChip:  { backgroundColor: '#FFF7ED', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  codText:  { fontSize: 11.5, color: '#C2410C', fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 12, marginTop: 2 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: 14,
  },
  reject:     { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  rejectText: { color: '#6B7280', fontSize: 15, fontWeight: '700' },
  accept:     { flex: 1.6, backgroundColor: '#16A34A' },
  acceptText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

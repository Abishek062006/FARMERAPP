import React, { useState, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../utils/config';

// ═══ PAYING THE FARMER, IN THE APP ════════════════════════════════════════
//
// ⚠️ THIS RAIL MOVES NO MONEY. There is no payment provider behind it — it
// exists so the whole trade can be walked end to end (order → collection →
// payment → receipt) without a live gateway or a bank sandbox. The server
// stamps every record it writes with `settlement.txn.simulated: true`, and
// this sheet says so on screen rather than letting a success tick imply a
// transfer that did not happen.
//
// ⚠️ THE AMOUNT IS THE FARMER'S PAYOUT, NOT THE BUYER'S GRAND TOTAL. The fare
// is the captain's money and was never the farmer's; paying `grandTotal` here
// would overpay the farmer by the whole transport cost. The server recomputes
// it from the order regardless — this is only what is DISPLAYED.
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function PaymentSheet({ order, onClose, onPaid }) {
  const [phase, setPhase] = useState('confirm');    // confirm | working | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const tick = useState(new Animated.Value(0))[0];

  const pay = useCallback(async () => {
    setPhase('working');
    try {
      const r = await axios.post(`${API_ENDPOINTS.ORDERS}/${order._id}/pay`, {});
      if (!r.data?.success) throw new Error(r.data?.error || 'Payment failed');
      setResult(r.data.paid);
      setPhase('done');
      Animated.timing(tick, { toValue: 1, duration: 320, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start();
      onPaid?.(r.data.order);
    } catch (err) {
      const d = err?.response?.data;
      // The server distinguishes "already settled" from "not collected yet",
      // and those need different words — a single "payment failed" would leave
      // the buyer unsure whether to try again.
      if (d?.code === 'ALREADY_PAID') {
        setError(`This order was already settled${d.txn?.ref ? ` (${d.txn.ref})` : ''}.`);
      } else if (d?.code === 'NOT_COLLECTED') {
        setError('Nothing to pay for yet — this crop has not left the farm.');
      } else {
        setError(d?.error || err?.message || 'Something went wrong. Please try again.');
      }
      setPhase('error');
    }
  }, [order]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.grab} />

          {phase === 'confirm' && (
            <>
              <Text style={s.title}>Pay the farmer</Text>
              <Text style={s.amount}>{money(order.farmerPayout)}</Text>
              <Text style={s.to}>to {order.farmerName}</Text>

              <View style={s.rows}>
                <Row k="Crop" v={`${order.cropName} · ${order.quantityKg} kg`} />
                <Row k="Order" v={`FM-${String(order._id).slice(-8).toUpperCase()}`} />
                {/* Spelled out, because the buyer's own total is larger and the
                    difference is somebody else's money. */}
                <Row k="Transport" v={`${money(order.fare?.total)} — paid to the captain, not the farmer`} muted />
              </View>

              <View style={s.notice}>
                <Ionicons name="information-circle-outline" size={15} color="#B45309" />
                <Text style={s.noticeText}>
                  Demonstration payment. No money is actually transferred — this records the
                  settlement so the trade can be completed end to end.
                </Text>
              </View>

              <TouchableOpacity style={s.go} onPress={pay} activeOpacity={0.85}>
                <Text style={s.goText}>Pay {money(order.farmerPayout)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancel} onPress={onClose}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {phase === 'working' && (
            <View style={s.center}>
              <ActivityIndicator size="large" color="#16A34A" />
              <Text style={s.working}>Processing payment…</Text>
            </View>
          )}

          {phase === 'done' && (
            <View style={s.center}>
              <Animated.View style={[s.tickWrap, { transform: [{ scale: tick }] }]}>
                <Ionicons name="checkmark" size={44} color="#fff" />
              </Animated.View>
              <Text style={s.doneTitle}>Payment successful</Text>
              <Text style={s.doneAmount}>{money(result?.amount)}</Text>
              <Text style={s.doneTo}>paid to {result?.to}</Text>
              <View style={s.refBox}>
                <Text style={s.refLabel}>Reference</Text>
                <Text style={s.refValue}>{result?.ref}</Text>
              </View>
              <Text style={s.simNote}>Demonstration payment — no funds were transferred.</Text>
              <TouchableOpacity style={s.go} onPress={onClose} activeOpacity={0.85}>
                <Text style={s.goText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'error' && (
            <View style={s.center}>
              <View style={s.errWrap}><Ionicons name="close" size={38} color="#fff" /></View>
              <Text style={s.doneTitle}>Could not pay</Text>
              <Text style={s.errText}>{error}</Text>
              <TouchableOpacity style={s.go} onPress={onClose} activeOpacity={0.85}>
                <Text style={s.goText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const Row = ({ k, v, muted }) => (
  <View style={s.row}>
    <Text style={s.rowK}>{k}</Text>
    <Text style={[s.rowV, muted && s.rowVMuted]} numberOfLines={2}>{v}</Text>
  </View>
);

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 18 },
  title: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  amount: { fontSize: 38, fontWeight: '800', color: '#111827', textAlign: 'center', marginTop: 4 },
  to: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 2, marginBottom: 20 },
  rows: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 14 },
  rowK: { fontSize: 13, color: '#6B7280' },
  rowV: { fontSize: 13, color: '#111827', fontWeight: '600', flex: 1, textAlign: 'right' },
  rowVMuted: { color: '#9CA3AF', fontWeight: '500' },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12, padding: 11, marginTop: 14 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17, color: '#92400E' },
  go: { backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 18, alignSelf: 'stretch' },
  goText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancel: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { color: '#6B7280', fontSize: 15, fontWeight: '600' },
  center: { alignItems: 'center', paddingVertical: 14 },
  working: { marginTop: 14, fontSize: 15, color: '#6B7280' },
  tickWrap: { width: 78, height: 78, borderRadius: 39, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' },
  errWrap: { width: 78, height: 78, borderRadius: 39, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 19, fontWeight: '800', color: '#111827', marginTop: 16 },
  doneAmount: { fontSize: 30, fontWeight: '800', color: '#15803D', marginTop: 6 },
  doneTo: { fontSize: 13.5, color: '#6B7280', marginTop: 2 },
  refBox: { backgroundColor: '#F8FAFC', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18, alignItems: 'center', marginTop: 16 },
  refLabel: { fontSize: 11, color: '#9CA3AF', letterSpacing: 0.6, textTransform: 'uppercase' },
  refValue: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 2, letterSpacing: 0.5 },
  simNote: { fontSize: 11.5, color: '#9CA3AF', textAlign: 'center', marginTop: 14, paddingHorizontal: 10, lineHeight: 16 },
  errText: { fontSize: 13.5, color: '#6B7280', textAlign: 'center', marginTop: 8, paddingHorizontal: 12, lineHeight: 19 },
});

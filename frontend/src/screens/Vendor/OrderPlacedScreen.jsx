import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import VehicleIcon from '../../components/vehicles/VehicleIcon';

// Booking confirmation. Live agent matching and tracking arrive in the next
// phases; for now this states plainly what happens next rather than showing a
// spinner that would never resolve.
export default function OrderPlacedScreen({ navigation, route }) {
  const { order, userData } = route.params || {};

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.hero}>
          <View style={s.tick}><Ionicons name="checkmark" size={34} color="#fff" /></View>
          <Text style={s.heroTitle}>Order placed</Text>
          <Text style={s.heroSub}>
            {order.quantityKg} kg of {order.cropName} from {order.farmerName}
          </Text>
        </View>

        <View style={s.card}>
          <View style={s.statusChip}>
            <View style={s.statusDot} />
            <Text style={s.statusText}>Finding a driver</Text>
          </View>
          <Text style={s.statusBlurb}>
            Nearby transport agents are being offered this trip. You will see the
            driver's name and number here once someone accepts.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Your delivery code</Text>
          <View style={s.otpBox}>
            <Text style={s.otp}>{order.dropOtp}</Text>
          </View>
          <Text style={s.otpHint}>
            Give this to the driver when your goods arrive. Do not share it before delivery.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Trip</Text>
          <View style={s.legRow}>
            <View style={s.legDots}>
              <View style={s.dotPickup} />
              <View style={s.legLine} />
              <View style={s.dotDrop} />
            </View>
            <View style={{ flex: 1, gap: 14 }}>
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
          <View style={s.divider} />
          <View style={s.vehicleRow}>
            <VehicleIcon type={order.vehicleType} width={56} />
            <View style={{ flex: 1 }}>
              <Text style={s.vehicleName}>
                {order.vehicleType === 'auto' ? 'Auto' : order.vehicleType === 'tempo' ? 'Tempo Van' : 'Truck'}
              </Text>
              <Text style={s.vehicleMeta}>{order.distanceKm} km · ~{order.durationMin} min</Text>
            </View>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Payment</Text>
          <View style={s.payRow}>
            <Text style={s.payKey}>Crop · {order.quantityKg} kg × ₹{order.pricePerKg}</Text>
            <Text style={s.payVal}>₹{order.cropTotal?.toLocaleString('en-IN')}</Text>
          </View>
          <View style={s.payRow}>
            <Text style={s.payKey}>Transport</Text>
            <Text style={s.payVal}>₹{order.fare?.total?.toLocaleString('en-IN')}</Text>
          </View>
          <View style={[s.payRow, s.payTotalRow]}>
            <Text style={s.payTotalKey}>Pay on delivery</Text>
            <Text style={s.payTotalVal}>₹{order.grandTotal?.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        <View style={{ height: 8 }} />
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={s.primary}
          onPress={() => navigation.replace('TrackOrder', { orderId: order._id, userData })}
        >
          <Ionicons name="location" size={17} color="#fff" />
          <Text style={s.primaryText}>Track this order</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.secondary} onPress={() => navigation.replace('VendorOrders', { userData })}>
          <Text style={s.secondaryText}>View all my orders</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll:    { padding: 16, gap: 12 },

  hero:      { alignItems: 'center', paddingVertical: 22, gap: 8 },
  tick: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#16A34A',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  heroSub:   { fontSize: 14, color: '#6B7280', textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 5, borderWidth: 1, borderColor: '#F1F5F9',
  },
  divider: { height: 1, backgroundColor: '#F1F5F9' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },

  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    backgroundColor: '#FFF7ED', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5,
  },
  statusDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EA580C' },
  statusText: { fontSize: 12.5, fontWeight: '700', color: '#C2410C' },
  statusBlurb:{ fontSize: 13, color: '#6B7280', lineHeight: 19 },

  otpBox: {
    backgroundColor: '#F0FDF4', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#BBF7D0',
  },
  otp:     { fontSize: 38, fontWeight: '800', color: '#15803D', letterSpacing: 8 },
  otpHint: { fontSize: 12, color: '#9CA3AF', lineHeight: 17 },

  legRow:    { flexDirection: 'row', gap: 14 },
  legDots:   { alignItems: 'center', paddingTop: 5 },
  dotPickup: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#16A34A' },
  legLine:   { width: 2, flex: 1, minHeight: 26, backgroundColor: '#E2E8F0', marginVertical: 3 },
  dotDrop:   { width: 11, height: 11, borderRadius: 2, backgroundColor: '#EA580C' },
  legLabel:  { fontSize: 9.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.8 },
  legValue:  { fontSize: 14.5, fontWeight: '700', color: '#111827', marginTop: 2 },

  vehicleRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vehicleName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  vehicleMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  payRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  payKey:      { fontSize: 13.5, color: '#6B7280', flex: 1, marginRight: 12 },
  payVal:      { fontSize: 13.5, color: '#111827', fontWeight: '600' },
  payTotalRow: { borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 4, paddingTop: 10 },
  payTotalKey: { fontSize: 14, fontWeight: '700', color: '#111827' },
  payTotalVal: { fontSize: 20, fontWeight: '800', color: '#15803D' },

  footer: { padding: 16, gap: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', paddingVertical: 15, borderRadius: 12,
  },
  primaryText:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondary:     { alignItems: 'center', paddingVertical: 6 },
  secondaryText: { color: '#6B7280', fontSize: 14, fontWeight: '600' },
});

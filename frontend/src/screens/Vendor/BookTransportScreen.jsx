import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import LocationMapPicker from '../../components/LocationMapPicker';
import VehicleIcon from '../../components/vehicles/VehicleIcon';

// The Uber screen: choose where it goes, then choose what carries it.
//
// Fares are never computed here. Every number on this screen comes from
// POST /api/orders/quote, and the server prices the order again at booking
// time — so a tampered client cannot buy a truck run at auto prices.
export default function BookTransportScreen({ navigation, route }) {
  const { listing, quantityKg, userData } = route.params || {};

  const [dropoff, setDropoff]   = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quote, setQuote]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [chosen, setChosen]     = useState(null);
  const [booking, setBooking]   = useState(false);

  // One key per checkout attempt. If the vendor double-taps Confirm, the
  // server returns the order it already made instead of buying twice.
  const idemKey = useRef(
    `${userData?.uid || 'v'}-${listing?._id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  ).current;

  const debounce = useRef(null);

  const fetchQuote = useCallback(async (drop) => {
    if (!drop) return;
    setLoading(true); setError(null);
    try {
      const r = await axios.post(`${API_ENDPOINTS.ORDERS}/quote`, {
        listingId: listing._id,
        quantityKg,
        dropoff: drop,
      }, { timeout: 20000 });
      if (r.data.success) {
        setQuote(r.data.quote);
        // Pre-select the cheapest vehicle that can actually take the load.
        const first = r.data.quote.vehicles.filter((v) => v.ok)
          .sort((a, b) => a.fare.total - b.fare.total)[0];
        setChosen(first ? first.type : null);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not price this trip. Try again.');
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, [listing, quantityKg]);

  // Debounced: a vendor nudging the destination pin must not fire a request
  // per frame at the OSRM demo server.
  useEffect(() => {
    if (!dropoff) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchQuote(dropoff), 600);
    return () => clearTimeout(debounce.current);
  }, [dropoff, fetchQuote]);

  const onDestinationPicked = (resolved) => {
    setPickerOpen(false);
    setDropoff({
      lat: resolved.coordinates.lat,
      lng: resolved.coordinates.lng,
      label: [resolved.address, resolved.city].filter(Boolean).join(', ') || 'Delivery point',
      city: resolved.city,
      district: resolved.district,
    });
  };

  const selected = quote?.vehicles.find((v) => v.type === chosen);
  const grandTotal = quote && selected?.ok ? quote.cropTotal + selected.fare.total : null;

  const confirm = async () => {
    if (!selected?.ok || booking) return;
    setBooking(true);
    try {
      const r = await axios.post(API_ENDPOINTS.ORDERS, {
        listingId: listing._id,
        quantityKg,
        vehicleType: chosen,
        dropoff,
        idempotencyKey: idemKey,
        vendorCompany: userData?.company || userData?.name,
      }, { timeout: 25000 });

      if (r.data.success) {
        navigation.replace('OrderPlaced', { order: r.data.order, userData });
      }
    } catch (err) {
      const code = err.response?.data?.code;
      Alert.alert(
        code === 'STOCK_GONE' ? 'Just sold out' : 'Could not book',
        err.response?.data?.error || 'Please try again.',
        [{ text: 'OK', onPress: () => code === 'STOCK_GONE' && navigation.popToTop() }]
      );
    } finally {
      setBooking(false);
    }
  };

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* Route card — pickup is fixed, destination is the vendor's choice */}
        <View style={s.card}>
          <View style={s.legRow}>
            <View style={s.legDots}>
              <View style={s.dotPickup} />
              <View style={s.legLine} />
              <View style={s.dotDrop} />
            </View>
            <View style={{ flex: 1, gap: 16 }}>
              <View>
                <Text style={s.legLabel}>PICKUP</Text>
                <Text style={s.legValue}>
                  {[listing.location?.city, listing.location?.district].filter(Boolean).join(', ')}
                </Text>
                <Text style={s.legSub}>{listing.farmerName}'s farm</Text>
              </View>
              <TouchableOpacity onPress={() => setPickerOpen(true)} activeOpacity={0.7}>
                <Text style={s.legLabel}>DROP</Text>
                {dropoff ? (
                  <>
                    <Text style={s.legValue} numberOfLines={1}>{dropoff.label}</Text>
                    <Text style={s.legChange}>Tap to change</Text>
                  </>
                ) : (
                  <Text style={s.legPick}>Tap to choose on the map</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {quote && (
            <>
              <View style={s.divider} />
              <View style={s.tripRow}>
                <View style={s.tripChip}>
                  <Ionicons name="navigate-outline" size={13} color="#2563EB" />
                  <Text style={s.tripChipText}>{quote.distanceKm} km by road</Text>
                </View>
                <View style={s.tripChip}>
                  <Ionicons name="time-outline" size={13} color="#2563EB" />
                  <Text style={s.tripChipText}>~{quote.durationMin} min</Text>
                </View>
                {quote.routeSource === 'haversine' && (
                  <View style={[s.tripChip, s.tripChipWarn]}>
                    <Ionicons name="alert-circle-outline" size={13} color="#C2410C" />
                    <Text style={[s.tripChipText, { color: '#C2410C' }]}>estimated</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        {/* Load summary */}
        <View style={s.card}>
          <View style={s.loadRow}>
            <View style={s.cropIcon}><Text style={{ fontSize: 20 }}>🌾</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.loadCrop}>{listing.cropName}</Text>
              <Text style={s.loadSub}>{quantityKg} kg × ₹{listing.pricePerKg}/kg</Text>
            </View>
            <Text style={s.loadTotal}>₹{(quantityKg * listing.pricePerKg).toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {/* Vehicles */}
        <View style={s.vehicleSection}>
          <Text style={s.sectionTitle}>Choose a vehicle</Text>

          {!dropoff ? (
            <View style={s.placeholder}>
              <Ionicons name="map-outline" size={30} color="#16A34A" />
              <Text style={s.placeholderText}>Choose a destination to see vehicles and fares</Text>
            </View>
          ) : loading ? (
            <View style={s.placeholder}>
              <ActivityIndicator color="#16A34A" />
              <Text style={s.placeholderText}>Finding the road route…</Text>
            </View>
          ) : error ? (
            <View style={s.placeholder}>
              <Ionicons name="cloud-offline-outline" size={30} color="#C2410C" />
              <Text style={s.placeholderText}>{error}</Text>
              <TouchableOpacity onPress={() => fetchQuote(dropoff)}>
                <Text style={s.retry}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            quote?.vehicles.map((v) => {
              const on = v.type === chosen;
              return (
                <TouchableOpacity
                  key={v.type}
                  style={[s.vehicle, on && s.vehicleOn, !v.ok && s.vehicleOff]}
                  onPress={() => v.ok && setChosen(v.type)}
                  disabled={!v.ok}
                  activeOpacity={0.85}
                >
                  <VehicleIcon type={v.type} width={62} dimmed={!v.ok} />
                  <View style={{ flex: 1 }}>
                    <View style={s.vehicleTitleRow}>
                      <Text style={[s.vehicleName, !v.ok && s.mutedText]}>{v.label}</Text>
                      <Text style={s.vehicleTamil}>{v.tamil}</Text>
                    </View>
                    {v.ok ? (
                      <Text style={s.vehicleMeta}>~{v.etaMin} min · up to {v.capacityKg} kg</Text>
                    ) : (
                      /* Unavailable options stay VISIBLE with the reason —
                         hiding them just makes the rule feel arbitrary. */
                      <Text style={s.vehicleReason}>{v.reason}</Text>
                    )}
                  </View>
                  <View style={s.vehicleRight}>
                    {v.ok
                      ? <Text style={[s.vehicleFare, on && s.vehicleFareOn]}>₹{v.fare.total.toLocaleString('en-IN')}</Text>
                      : <Ionicons name="close-circle-outline" size={20} color="#CBD5E1" />}
                    {on && <Ionicons name="checkmark-circle" size={18} color="#16A34A" />}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {quote && selected?.ok && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Payment</Text>
            {[
              [`${listing.cropName} · ${quantityKg} kg`, quote.cropTotal],
              [`${selected.label} · ${quote.distanceKm} km`, selected.fare.total],
            ].map(([k, v]) => (
              <View key={k} style={s.payRow}>
                <Text style={s.payKey}>{k}</Text>
                <Text style={s.payVal}>₹{v.toLocaleString('en-IN')}</Text>
              </View>
            ))}
            <View style={[s.payRow, s.payTotalRow]}>
              <Text style={s.payTotalKey}>Total (cash on delivery)</Text>
              <Text style={s.payTotalVal}>₹{grandTotal.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.cta, (!selected?.ok || booking) && s.ctaOff]}
          onPress={confirm}
          disabled={!selected?.ok || booking}
          activeOpacity={0.85}
        >
          {booking ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={s.ctaText}>
                {grandTotal ? `Confirm · ₹${grandTotal.toLocaleString('en-IN')}` : 'Choose a destination'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Reuses the land-registration map picker as-is. */}
      <LocationMapPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={onDestinationPicked}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll:    { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 5, borderWidth: 1, borderColor: '#F1F5F9',
  },
  divider: { height: 1, backgroundColor: '#F1F5F9' },

  legRow:    { flexDirection: 'row', gap: 14 },
  legDots:   { alignItems: 'center', paddingTop: 6 },
  dotPickup: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#16A34A' },
  legLine:   { width: 2, flex: 1, minHeight: 34, backgroundColor: '#E2E8F0', marginVertical: 3 },
  dotDrop:   { width: 11, height: 11, borderRadius: 2, backgroundColor: '#EA580C' },
  legLabel:  { fontSize: 9.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.8 },
  legValue:  { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 2 },
  legSub:    { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  legChange: { fontSize: 11.5, color: '#16A34A', fontWeight: '600', marginTop: 1 },
  legPick:   { fontSize: 15, fontWeight: '600', color: '#16A34A', marginTop: 2 },

  tripRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tripChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EFF6FF',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#BFDBFE',
  },
  tripChipWarn: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
  tripChipText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },

  loadRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cropIcon:  { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' },
  loadCrop:  { fontSize: 15, fontWeight: '700', color: '#111827' },
  loadSub:   { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  loadTotal: { fontSize: 16, fontWeight: '800', color: '#15803D' },

  vehicleSection: { gap: 10 },
  sectionTitle:   { fontSize: 15, fontWeight: '700', color: '#111827' },

  placeholder: {
    alignItems: 'center', gap: 10, paddingVertical: 34, paddingHorizontal: 24,
    backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#F1F5F9',
  },
  placeholderText: { fontSize: 13.5, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  retry: { fontSize: 14, color: '#16A34A', fontWeight: '700', marginTop: 4 },

  vehicle: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 18, padding: 13,
    borderWidth: 1.5, borderColor: '#F1F5F9',
  },
  vehicleOn:  { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  vehicleOff: { opacity: 0.55, backgroundColor: '#F8FAFC' },
  vehicleTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  vehicleName:  { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  vehicleTamil: { fontSize: 11.5, color: '#9CA3AF' },
  vehicleMeta:  { fontSize: 12, color: '#6B7280', marginTop: 3 },
  vehicleReason:{ fontSize: 12, color: '#C2410C', marginTop: 3, fontWeight: '600' },
  mutedText:    { color: '#6B7280' },
  vehicleRight: { alignItems: 'flex-end', gap: 3 },
  vehicleFare:  { fontSize: 16.5, fontWeight: '800', color: '#111827' },
  vehicleFareOn:{ color: '#15803D' },

  payRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  payKey:      { fontSize: 13.5, color: '#6B7280', flex: 1, marginRight: 12 },
  payVal:      { fontSize: 13.5, color: '#111827', fontWeight: '600' },
  payTotalRow: { borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 4, paddingTop: 10 },
  payTotalKey: { fontSize: 14, fontWeight: '700', color: '#111827' },
  payTotalVal: { fontSize: 20, fontWeight: '800', color: '#15803D' },

  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', paddingVertical: 15, borderRadius: 12,
  },
  ctaOff:  { backgroundColor: '#94A3B8' },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

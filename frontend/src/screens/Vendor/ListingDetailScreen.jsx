import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_ENDPOINTS } from '../../utils/config';

// One listing, with the quantity the vendor wants to buy.
//
// The farmer's phone number is deliberately absent: the market API never
// returns it. It is released only once an order exists, so a vendor cannot
// scrape contact details off the marketplace and cut the platform out.
export default function ListingDetailScreen({ navigation, route }) {
  const { listing, origin, userData } = route.params || {};

  const min = listing.minOrderKg || 1;
  const max = listing.quantityAvailableKg;
  const [qty, setQty] = useState(Math.min(min, max));

  const step = Math.max(1, Math.round(min / 2));
  const dec = () => setQty((q) => Math.max(min, q - step));
  const inc = () => setQty((q) => Math.min(max, q + step));

  const total = qty * listing.pricePerKg;

  const proceed = () =>
    navigation.navigate('BookTransport', { listing, quantityKg: qty, userData });

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        {listing.proofImageId && (
          <Image
            source={{ uri: API_ENDPOINTS.LISTING_PHOTO(listing.proofImageId) }}
            style={s.hero}
            resizeMode="cover"
          />
        )}

        <View style={s.card}>
          <View style={s.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.crop}>{listing.cropName}</Text>
              {!!listing.cropTamilName && <Text style={s.cropTamil}>{listing.cropTamilName}</Text>}
            </View>
            <View style={s.priceBox}>
              <Text style={s.priceLabel}>PER KG</Text>
              <Text style={s.price}>₹{listing.pricePerKg}</Text>
            </View>
          </View>

          <View style={s.divider} />

          <View style={s.chipRow}>
            {listing.distanceKm != null && (
              <View style={[s.chip, listing.isNear && s.chipBlue]}>
                <Ionicons name="navigate-outline" size={13} color={listing.isNear ? '#2563EB' : '#6B7280'} />
                <Text style={[s.chipText, listing.isNear && s.chipTextBlue]}>{listing.distanceKm} km away</Text>
              </View>
            )}
            <View style={s.chip}>
              <Ionicons name="location-outline" size={13} color="#6B7280" />
              <Text style={s.chipText}>
                {[listing.location?.city, listing.location?.district].filter(Boolean).join(', ')}
              </Text>
            </View>
            {!!listing.gradeNote && (
              <View style={s.chip}>
                <Ionicons name="ribbon-outline" size={13} color="#6B7280" />
                <Text style={s.chipText}>{listing.gradeNote}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Harvest details</Text>
          {[
            ['Farmer', listing.farmerName],
            ['Harvested', listing.harvestedAt
              ? new Date(listing.harvestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
              : '—'],
            ['Total harvested', listing.actualYieldKg ? `${listing.actualYieldKg} kg` : '—'],
            ['Listed', `${listing.quantityKg} kg`],
            ['Still available', `${listing.quantityAvailableKg} kg`],
            ['Minimum order', `${min} kg`],
            ['Variety', listing.variety || 'Standard'],
          ].map(([k, v]) => (
            <View key={k} style={s.row}>
              <Text style={s.rowKey}>{k}</Text>
              <Text style={s.rowVal}>{v}</Text>
            </View>
          ))}
          {!!listing.notes && (
            <View style={s.notesBox}>
              <Text style={s.notesLabel}>From the farmer</Text>
              <Text style={s.notesText}>{listing.notes}</Text>
            </View>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>How much do you want?</Text>
          <View style={s.stepper}>
            <TouchableOpacity style={[s.stepBtn, qty <= min && s.stepBtnOff]} onPress={dec} disabled={qty <= min}>
              <Ionicons name="remove" size={22} color={qty <= min ? '#CBD5E1' : '#15803D'} />
            </TouchableOpacity>
            <View style={s.qtyBox}>
              <Text style={s.qtyValue}>{qty}</Text>
              <Text style={s.qtyUnit}>kg</Text>
            </View>
            <TouchableOpacity style={[s.stepBtn, qty >= max && s.stepBtnOff]} onPress={inc} disabled={qty >= max}>
              <Ionicons name="add" size={22} color={qty >= max ? '#CBD5E1' : '#15803D'} />
            </TouchableOpacity>
          </View>
          <Text style={s.stepHint}>
            Minimum {min} kg · {max} kg available
          </Text>

          <View style={s.totalBox}>
            <View>
              <Text style={s.totalLabel}>CROP TOTAL</Text>
              <Text style={s.totalSub}>{qty} kg × ₹{listing.pricePerKg}/kg</Text>
            </View>
            <Text style={s.totalValue}>₹{total.toLocaleString('en-IN')}</Text>
          </View>
          <Text style={s.stepHint}>Transport is quoted separately at the next step.</Text>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={s.cta} onPress={proceed} activeOpacity={0.85}>
          <Ionicons name="cube-outline" size={18} color="#fff" />
          <Text style={s.ctaText}>Continue to transport</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll:    { padding: 16, gap: 12 },

  hero: { width: '100%', height: 220, borderRadius: 18, backgroundColor: '#F1F5F9' },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 5, borderWidth: 1, borderColor: '#F1F5F9',
  },
  titleRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  crop:      { fontSize: 22, fontWeight: '700', color: '#111827', letterSpacing: -0.3 },
  cropTamil: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  priceBox:  { alignItems: 'flex-end' },
  priceLabel:{ fontSize: 9, color: '#9CA3AF', fontWeight: '700', letterSpacing: 0.5 },
  price:     { fontSize: 22, fontWeight: '800', color: '#15803D' },

  divider: { height: 1, backgroundColor: '#F1F5F9' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F8FAFC',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#E2E8F0',
  },
  chipText:     { fontSize: 12, color: '#374151', fontWeight: '500' },
  chipBlue:     { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  chipTextBlue: { color: '#2563EB', fontWeight: '700' },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  row:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  rowKey: { fontSize: 13.5, color: '#6B7280' },
  rowVal: { fontSize: 13.5, color: '#111827', fontWeight: '600' },

  notesBox:   { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 8 },
  notesLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '800', letterSpacing: 0.6, marginBottom: 4 },
  notesText:  { fontSize: 13.5, color: '#374151', lineHeight: 20 },

  stepper:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 4 },
  stepBtn: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: '#F0FDF4',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BBF7D0',
  },
  stepBtnOff: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  qtyBox:     { flexDirection: 'row', alignItems: 'baseline', gap: 4, minWidth: 96, justifyContent: 'center' },
  qtyValue:   { fontSize: 32, fontWeight: '800', color: '#111827' },
  qtyUnit:    { fontSize: 15, color: '#6B7280', fontWeight: '600' },
  stepHint:   { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },

  totalBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#BBF7D0', marginTop: 8,
  },
  totalLabel: { fontSize: 9.5, color: '#15803D', fontWeight: '800', letterSpacing: 0.7 },
  totalSub:   { fontSize: 12, color: '#6B7280', marginTop: 2 },
  totalValue: { fontSize: 24, fontWeight: '800', color: '#15803D' },

  footer: {
    padding: 16, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', paddingVertical: 15, borderRadius: 12,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

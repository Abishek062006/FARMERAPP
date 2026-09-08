import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ONE FARMER'S PERFORMANCE, as the admin sees it — the same card that used to
// be hand-written inline on Farmer/FpoDashboardScreen.jsx's Members tab.
// Pulled out so the dashboard's own auto-scrolling carousel, the "see all"
// grid and the member detail screen render EXACTLY the same card, from the
// same `memberCards` row shape the backend already sends
// (routes/fpos.js GET /:id/dashboard) — three copies of this markup is how a
// trust badge or an unpaid figure ends up looking different in one of them.
//
// `m` is one entry of `dashboard.memberCards`: farmerUid, farmerName,
// village, cropsSuppliedThisSeason, totalKgSupplied, totalEarned,
// unpaidOrders, unpaidAmount, trust ({ scored, band } | null — a farmer below
// trustService's MIN_TRADES_TO_SCORE is REFUSED a band, never given one).

export const TRUST_BADGES = {
  clean:          { fg: '#15803D', bg: '#DCFCE7', icon: 'checkmark-circle' },
  few_complaints: { fg: '#1D4ED8', bg: '#DBEAFE', icon: 'information-circle-outline' },
  some_upheld:    { fg: '#B45309', bg: '#FEF3C7', icon: 'alert-circle-outline' },
  frequent:       { fg: '#B91C1C', bg: '#FEE2E2', icon: 'warning-outline' },
};

export default function MemberCard({ m, onPress, width = 172, labels = {} }) {
  const trustMeta = m.trust?.scored ? TRUST_BADGES[m.trust.band] : null;
  const Wrap = onPress ? TouchableOpacity : View;

  return (
    <Wrap style={[s.card, { width }]} onPress={onPress ? () => onPress(m) : undefined} activeOpacity={0.85}>
      <View style={s.avatar}>
        <Text style={s.avatarText}>{(m.farmerName || '?')[0].toUpperCase()}</Text>
      </View>
      <Text style={s.name} numberOfLines={1}>{m.farmerName}</Text>
      {!!m.village && <Text style={s.village} numberOfLines={1}>{m.village}</Text>}

      {m.cropsSuppliedThisSeason?.length > 0 ? (
        <Text style={s.crops} numberOfLines={2}>{m.cropsSuppliedThisSeason.join(', ')}</Text>
      ) : (
        <Text style={s.cropsEmpty}>{labels.noSuppliesYet || 'No supplies yet this season'}</Text>
      )}

      <View style={s.statRow}>
        <Text style={s.statLabel}>{labels.kgSupplied || 'kg supplied'}</Text>
        <Text style={s.statValue}>{Number(m.totalKgSupplied || 0).toLocaleString('en-IN')}</Text>
      </View>
      <View style={s.statRow}>
        <Text style={s.statLabel}>{labels.earned || 'Earned'}</Text>
        <Text style={s.statValue}>₹{Number(m.totalEarned || 0).toLocaleString('en-IN')}</Text>
      </View>

      {m.unpaidOrders > 0 && (
        <View style={s.unpaidChip}>
          <Ionicons name="time-outline" size={11} color="#B45309" />
          <Text style={s.unpaidChipText}>
            {m.unpaidOrders} {labels.unpaidSuffix || 'unpaid'} · ₹{Number(m.unpaidAmount || 0).toLocaleString('en-IN')}
          </Text>
        </View>
      )}

      {trustMeta && (
        <View style={[s.trustBadge, { backgroundColor: trustMeta.bg }]}>
          <Ionicons name={trustMeta.icon} size={11} color={trustMeta.fg} />
          <Text style={[s.trustBadgeText, { color: trustMeta.fg }]}>
            {labels.trustLabel ? labels.trustLabel(m.trust.band) : m.trust.band}
          </Text>
        </View>
      )}
    </Wrap>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  avatarText: { fontSize: 13, fontWeight: '800', color: '#15803D' },
  name: { fontSize: 14, fontWeight: '700', color: '#111827' },
  village: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  crops: { fontSize: 11.5, color: '#374151', marginTop: 6, lineHeight: 15 },
  cropsEmpty: { fontSize: 11, color: '#9CA3AF', marginTop: 6, fontStyle: 'italic' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  statLabel: { fontSize: 10.5, color: '#9CA3AF' },
  statValue: { fontSize: 11.5, fontWeight: '700', color: '#111827' },
  unpaidChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7',
    borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, marginTop: 8, alignSelf: 'flex-start',
  },
  unpaidChipText: { fontSize: 10, fontWeight: '700', color: '#B45309' },
  trustBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999,
    paddingHorizontal: 7, paddingVertical: 3, marginTop: 8, alignSelf: 'flex-start',
  },
  trustBadgeText: { fontSize: 10, fontWeight: '700' },
});

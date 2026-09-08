import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, RefreshControl, Alert, Linking, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import usePolling from '../../hooks/usePolling';
import LocationMapPicker from '../../components/LocationMapPicker';

// Phase E, buyer side: advertise what you need, and read who answered.
//
// A requirement is NOT an order and NOT a commitment — it is an advertised
// intent. The copy has to keep saying that, because a farmer who thinks a
// requirement is a guaranteed sale will harvest for it.
const STATUS = {
  open:      { label: 'Open',      bg: '#DCFCE7', fg: '#15803D' },
  fulfilled: { label: 'Fulfilled', bg: '#DBEAFE', fg: '#1D4ED8' },
  closed:    { label: 'Closed',    bg: '#F1F5F9', fg: '#6B7280' },
  expired:   { label: 'Expired',   bg: '#F1F5F9', fg: '#9CA3AF' },
};

export default function RequirementsScreen({ route }) {
  const { userData } = route.params || {};

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const [crop, setCrop] = useState('');
  const [qty, setQty] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [grade, setGrade] = useState(null);
  const [radius, setRadius] = useState('50');
  const [point, setPoint] = useState(null);
  const [notes, setNotes] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const r = await axios.get(`${API_ENDPOINTS.REQUIREMENTS}/vendor/mine`);
      if (r.data.success) setItems(r.data.requirements);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  usePolling(fetchAll, 12000, true);

  const reset = () => {
    setCrop(''); setQty(''); setPriceMin(''); setPriceMax('');
    setGrade(null); setRadius('50'); setPoint(null); setNotes('');
  };

  const submit = async () => {
    if (!crop.trim()) return Alert.alert('Which crop?', 'Enter the crop you need.');
    if (!(parseFloat(qty) > 0)) return Alert.alert('How much?', 'Enter the quantity in kg.');
    if (!point) return Alert.alert('Where?', 'Choose the delivery point on the map.');

    setSaving(true);
    try {
      const r = await axios.post(API_ENDPOINTS.REQUIREMENTS, {
        commodity: crop.trim(),
        quantityKg: parseFloat(qty),
        minGrade: grade,
        priceMin: priceMin ? parseFloat(priceMin) : null,
        priceMax: priceMax ? parseFloat(priceMax) : null,
        deliveryPoint: point,
        radiusKm: parseFloat(radius) || 50,
        notes,
      });
      if (r.data.success) {
        setOpen(false);
        reset();
        fetchAll();
        Alert.alert('Posted', `Farmers within ${r.data.requirement.radiusKm} km growing ${crop.trim()} will see this.`);
      }
    } catch (err) {
      Alert.alert('Could not post', err.response?.data?.error || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const close = (item, fulfilled) =>
    Alert.alert(
      fulfilled ? 'Mark as fulfilled?' : 'Close this requirement?',
      fulfilled ? 'Farmers will stop seeing it.' : 'It will stop appearing to farmers.',
      [{ text: 'Cancel', style: 'cancel' }, {
        text: fulfilled ? 'Fulfilled' : 'Close',
        onPress: async () => {
          try {
            await axios.put(`${API_ENDPOINTS.REQUIREMENTS}/${item._id}/close`, { fulfilled });
            fetchAll();
          } catch (err) {
            Alert.alert('Could not update', err.response?.data?.error || 'Please try again.');
          }
        },
      }]
    );

  const Card = ({ item }) => {
    const st = STATUS[item.status] || STATUS.open;
    const responses = item.responses || [];
    return (
      <View style={s.card}>
        <View style={s.topRow}>
          <View style={[s.chip, { backgroundColor: st.bg }]}>
            <Text style={[s.chipText, { color: st.fg }]}>{st.label}</Text>
          </View>
          <Text style={s.date}>
            {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </Text>
        </View>

        <Text style={s.title}>{item.quantityKg} kg {item.commodity}</Text>
        <Text style={s.sub}>
          within {item.radiusKm} km of {item.deliveryPoint?.label || item.deliveryPoint?.district || 'your point'}
          {item.minGrade ? `  ·  Grade ${item.minGrade}+` : ''}
          {item.priceMin || item.priceMax
            ? `  ·  ₹${item.priceMin ?? '?'}–${item.priceMax ?? '?'}/kg`
            : ''}
        </Text>

        <View style={s.respHead}>
          <Ionicons name="people-outline" size={15} color="#16A34A" />
          <Text style={s.respHeadText}>
            {responses.length === 0
              ? 'No farmer has answered yet'
              : `${responses.length} farmer${responses.length > 1 ? 's' : ''} answered`}
          </Text>
        </View>

        {responses.map((rp) => (
          <View key={String(rp._id)} style={s.resp}>
            <View style={{ flex: 1 }}>
              <Text style={s.respName}>{rp.farmerName}</Text>
              <Text style={s.respMeta}>
                {rp.quantityKg} kg · ₹{rp.pricePerKg}/kg
                {rp.grade ? ` · Grade ${rp.grade}` : ''}
                {rp.distanceKm != null ? ` · ${rp.distanceKm} km away` : ''}
              </Text>
              {!!rp.note && <Text style={s.respNote}>“{rp.note}”</Text>}
            </View>
            <Text style={s.respTotal}>₹{(rp.pricePerKg * rp.quantityKg).toLocaleString('en-IN')}</Text>
          </View>
        ))}

        {responses.length > 0 && (
          <Text style={s.hint}>
            Open the farmer's lot in the market to make an offer — answering here is not a sale.
          </Text>
        )}

        {item.status === 'open' && (
          <View style={s.actions}>
            <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => close(item, false)}>
              <Text style={s.btnGhostText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={() => close(item, true)}>
              <Text style={s.btnPrimaryText}>Mark fulfilled</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;
  }

  return (
    <View style={s.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => String(i._id)}
        renderItem={({ item }) => <Card item={item} />}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor="#16A34A"
            onRefresh={() => { setRefreshing(true); fetchAll(); }} />
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}><Ionicons name="megaphone-outline" size={34} color="#16A34A" /></View>
            <Text style={s.emptyTitle}>Tell farmers what you need</Text>
            <Text style={s.emptySub}>
              Post what you are buying and farmers growing it nearby will see it — instead of
              you waiting for the right lot to appear.
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={s.fab} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={24} color="#fff" />
        <Text style={s.fabText}>Post a requirement</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={s.sheetWrap}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>What do you need?</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              <Text style={s.label}>Crop <Text style={s.req}>*</Text></Text>
              <TextInput style={s.input} value={crop} onChangeText={setCrop}
                placeholder="e.g. Onion" placeholderTextColor="#9CA3AF" />

              <Text style={s.label}>Quantity needed (kg) <Text style={s.req}>*</Text></Text>
              <TextInput style={s.input} value={qty} onChangeText={setQty}
                placeholder="e.g. 2000" keyboardType="numeric" placeholderTextColor="#9CA3AF" />

              <Text style={s.label}>Price range (₹/kg)</Text>
              <View style={s.row}>
                <TextInput style={[s.input, { flex: 1 }]} value={priceMin} onChangeText={setPriceMin}
                  placeholder="from" keyboardType="numeric" placeholderTextColor="#9CA3AF" />
                <TextInput style={[s.input, { flex: 1 }]} value={priceMax} onChangeText={setPriceMax}
                  placeholder="to" keyboardType="numeric" placeholderTextColor="#9CA3AF" />
              </View>
              <Text style={s.hintSmall}>
                A range, not one number — a single figure is really a ceiling, and farmers read it that way.
              </Text>

              <Text style={s.label}>Minimum grade</Text>
              <View style={s.row}>
                {['A', 'B', 'C'].map((g) => (
                  <TouchableOpacity key={g}
                    style={[s.gradeBtn, grade === g && s.gradeBtnOn]}
                    onPress={() => setGrade(grade === g ? null : g)}>
                    <Text style={[s.gradeText, grade === g && s.gradeTextOn]}>{g}+</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[s.gradeBtn, !grade && s.gradeBtnOn]} onPress={() => setGrade(null)}>
                  <Text style={[s.gradeText, !grade && s.gradeTextOn]}>Any</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.label}>Deliver to <Text style={s.req}>*</Text></Text>
              <TouchableOpacity style={s.pick} onPress={() => setMapOpen(true)}>
                <Ionicons name="location-outline" size={17} color={point ? '#16A34A' : '#9CA3AF'} />
                <Text style={[s.pickText, point && { color: '#111827' }]}>
                  {point ? (point.label || `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`) : 'Choose on the map'}
                </Text>
              </TouchableOpacity>

              <Text style={s.label}>Source within (km)</Text>
              <TextInput style={s.input} value={radius} onChangeText={setRadius}
                keyboardType="numeric" placeholderTextColor="#9CA3AF" />
              <Text style={s.hintSmall}>
                Farmers further than this will not see it — so they are not shown a trip you would refuse.
              </Text>

              <Text style={s.label}>Notes</Text>
              <TextInput style={[s.input, s.multi]} value={notes} onChangeText={setNotes}
                placeholder="Anything a farmer should know" multiline
                placeholderTextColor="#9CA3AF" maxLength={500} />

              <View style={s.notice}>
                <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
                <Text style={s.noticeText}>
                  This advertises what you want. It reserves nothing and commits you to nothing —
                  when a farmer answers, you still make an offer on their lot as usual.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity style={[s.cta, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" />
                : <><Ionicons name="megaphone-outline" size={17} color="#fff" />
                    <Text style={s.ctaText}>Post requirement</Text></>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <LocationMapPicker
        visible={mapOpen}
        onClose={() => setMapOpen(false)}
        onConfirm={(loc) => {
          setPoint({
            lat: loc.lat ?? loc.coordinates?.lat,
            lng: loc.lng ?? loc.coordinates?.lng,
            label: loc.city || loc.district || '',
            district: loc.district || '',
          });
          setMapOpen(false);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  list: { padding: 16, gap: 12, paddingBottom: 110 },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 11, fontWeight: '700' },
  date: { fontSize: 12, color: '#9CA3AF' },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 13, color: '#6B7280', marginTop: 3, lineHeight: 18 },

  respHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 6 },
  respHeadText: { fontSize: 12.5, fontWeight: '700', color: '#15803D' },
  resp: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 11, marginTop: 6,
  },
  respName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  respMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  respNote: { fontSize: 12, color: '#6B7280', fontStyle: 'italic', marginTop: 3 },
  respTotal: { fontSize: 14, fontWeight: '800', color: '#15803D' },
  hint: { fontSize: 11.5, color: '#9CA3AF', marginTop: 9, lineHeight: 16 },

  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnGhost: { backgroundColor: '#F1F5F9' },
  btnGhostText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  btnPrimary: { backgroundColor: '#16A34A' },
  btnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  emptyWrap: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 32 },
  emptyIcon: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 13.5, color: '#6B7280', textAlign: 'center', marginTop: 6, lineHeight: 20 },

  fab: {
    position: 'absolute', left: 16, right: 16, bottom: 22,
    backgroundColor: '#16A34A', borderRadius: 16, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  fabText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  sheetWrap: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: '#111827' },

  label: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginTop: 14, marginBottom: 6 },
  req: { color: '#DC2626' },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827', backgroundColor: '#fff',
  },
  multi: { height: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8 },
  hintSmall: { fontSize: 11, color: '#9CA3AF', marginTop: 5, lineHeight: 16 },

  gradeBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10,
    paddingVertical: 9, alignItems: 'center',
  },
  gradeBtnOn: { borderColor: '#16A34A', backgroundColor: '#DCFCE7' },
  gradeText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  gradeTextOn: { color: '#15803D' },

  pick: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12,
  },
  pickText: { fontSize: 14, color: '#9CA3AF', flex: 1 },

  notice: {
    flexDirection: 'row', gap: 8, backgroundColor: '#F8FAFC',
    borderRadius: 12, padding: 12, marginTop: 16,
  },
  noticeText: { flex: 1, fontSize: 11.5, color: '#6B7280', lineHeight: 17 },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 15, marginTop: 18,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

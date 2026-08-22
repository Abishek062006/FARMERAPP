import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Image, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

// Replaces the old "Mark as Harvested" + "Sell to Vendors" pair with one
// action. Harvesting and listing now happen in a single backend transaction,
// so a farmer can never end up with a harvested crop and no listing (or, far
// worse, a crop that failed to harvest and a plot stuck as 'active').
//
// Styled with the marketplace language (#F8FAFC / #16A34A / r18 cards), not
// the older COLORS palette the surrounding CropDetailScreen still uses.
export default function HarvestPostModal({ visible, onClose, crop, land, onPosted }) {
  const [photo, setPhoto] = useState(null);
  const [yieldKg, setYieldKg] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [grade, setGrade] = useState('');
  const [notes, setNotes] = useState('');
  const [posting, setPosting] = useState(false);

  const reset = () => {
    setPhoto(null); setYieldKg(''); setQty(''); setPrice('');
    setMinOrder(''); setGrade(''); setNotes('');
  };

  const close = () => { if (!posting) { reset(); onClose(); } };

  const pickPhoto = async (fromCamera) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', `Please allow ${fromCamera ? 'camera' : 'photo library'} access.`);
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;

    // Resize before upload: the photo is stored as a Buffer in MongoDB, and a
    // raw 4 MB phone JPEG would be wasteful there. ~1200px @ 0.6 lands around
    // 120 KB and is still clearly readable as proof.
    const shrunk = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );
    setPhoto(shrunk.uri);
  };

  const nYield = parseFloat(yieldKg);
  const nQty   = parseFloat(qty);
  const nPrice = parseFloat(price);
  const nMin   = parseFloat(minOrder || '1');
  const total  = (!isNaN(nQty) && !isNaN(nPrice)) ? nQty * nPrice : null;

  // Same rules the server enforces — shown early so the farmer isn't
  // bounced by the API after filling the whole form.
  const problem =
    !photo ? 'Add a photo of your harvest'
    : !(nYield > 0) ? 'Enter how many kg you harvested'
    : !(nQty > 0) ? 'Enter how much you want to sell'
    : nQty > nYield ? `You can sell at most ${nYield} kg`
    : !(nPrice > 0) ? 'Enter your price per kg'
    : !(nMin > 0) || nMin > nQty ? `Minimum order must be between 1 and ${nQty || '…'} kg`
    : null;

  const submit = async () => {
    if (problem) { Alert.alert('Almost there', problem); return; }
    setPosting(true);
    try {
      const form = new FormData();
      form.append('proof', { uri: photo, type: 'image/jpeg', name: 'harvest.jpg' });
      form.append('actualYieldKg', String(nYield));
      form.append('quantityKg', String(nQty));
      form.append('pricePerKg', String(nPrice));
      form.append('minOrderKg', String(nMin));
      form.append('gradeNote', grade);
      form.append('notes', notes);

      const r = await axios.post(
        `${API_ENDPOINTS.CROPS}/${crop._id}/harvest-and-list`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 45000 }
      );

      if (r.data.success) {
        reset();
        onPosted(r.data.listing);
      } else {
        Alert.alert('Could not post', r.data.message || 'Please try again.');
      }
    } catch (err) {
      Alert.alert('Could not post', err.response?.data?.message || 'Check your connection and try again.');
    } finally {
      setPosting(false);
    }
  };

  const pickupLabel = land?.location
    ? [land.location.city, land.location.district].filter(Boolean).join(', ')
    : 'your registered land';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={s.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.sheet}
        >
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Post Harvest to Farm Market</Text>
              <Text style={s.subtitle}>அறுவடையை சந்தையில் பதிவிடு</Text>
            </View>
            <TouchableOpacity onPress={close} hitSlop={10}>
              <Ionicons name="close" size={26} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.body} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">

            {/* Crop + pickup, both read-only */}
            <View style={s.card}>
              <View style={s.cropRow}>
                <View style={s.cropIcon}><Text style={{ fontSize: 22 }}>🌾</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cropName}>{crop?.name}</Text>
                  <Text style={s.cropSub}>{crop?.tamilName}{crop?.variety ? ` · ${crop.variety}` : ''}</Text>
                </View>
              </View>
              <View style={s.divider} />
              <View style={s.chip}>
                <Ionicons name="location-outline" size={13} color="#6B7280" />
                <Text style={s.chipText}>Pickup: {pickupLabel}</Text>
              </View>
              <Text style={s.hint}>Vendors collect from your registered land.</Text>
            </View>

            {/* Proof photo */}
            <View style={s.card}>
              <Text style={s.label}>Harvest proof photo <Text style={s.req}>*</Text></Text>
              {photo ? (
                <View>
                  <Image source={{ uri: photo }} style={s.preview} />
                  <TouchableOpacity style={s.retake} onPress={() => setPhoto(null)}>
                    <Ionicons name="refresh" size={14} color="#16A34A" />
                    <Text style={s.retakeText}>Change photo</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.photoRow}>
                  <TouchableOpacity style={s.photoBtn} onPress={() => pickPhoto(true)}>
                    <Ionicons name="camera-outline" size={22} color="#16A34A" />
                    <Text style={s.photoBtnText}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.photoBtn} onPress={() => pickPhoto(false)}>
                    <Ionicons name="images-outline" size={22} color="#16A34A" />
                    <Text style={s.photoBtnText}>Gallery</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Quantities */}
            <View style={s.card}>
              <Text style={s.label}>How much did you harvest? (kg) <Text style={s.req}>*</Text></Text>
              <TextInput style={s.input} value={yieldKg} onChangeText={setYieldKg}
                placeholder="e.g. 480" keyboardType="numeric" placeholderTextColor="#9CA3AF" />
              {/* Deliberately kg, not crop.unit — a 500-plant tomato crop does
                  not yield 500 kg, and crop.unit may be 'plants' or 'saplings'. */}
              <Text style={s.hint}>Your crop was registered as {crop?.quantity} {crop?.unit}. Enter the actual weight in kg.</Text>

              <Text style={[s.label, { marginTop: 14 }]}>How much will you sell? (kg) <Text style={s.req}>*</Text></Text>
              <TextInput style={s.input} value={qty} onChangeText={setQty}
                placeholder={nYield > 0 ? String(nYield) : 'e.g. 400'} keyboardType="numeric" placeholderTextColor="#9CA3AF" />

              <Text style={[s.label, { marginTop: 14 }]}>Minimum order (kg)</Text>
              <TextInput style={s.input} value={minOrder} onChangeText={setMinOrder}
                placeholder="e.g. 25" keyboardType="numeric" placeholderTextColor="#9CA3AF" />
              <Text style={s.hint}>Vendors must buy at least this much. Leave blank for 1 kg.</Text>
            </View>

            {/* Price */}
            <View style={s.card}>
              <Text style={s.label}>Price per kg (₹) <Text style={s.req}>*</Text></Text>
              <TextInput style={s.input} value={price} onChangeText={setPrice}
                placeholder="e.g. 28" keyboardType="numeric" placeholderTextColor="#9CA3AF" />

              <Text style={[s.label, { marginTop: 14 }]}>Grade / condition</Text>
              <TextInput style={s.input} value={grade} onChangeText={setGrade}
                placeholder="e.g. A grade, freshly harvested" placeholderTextColor="#9CA3AF" />

              <Text style={[s.label, { marginTop: 14 }]}>Notes for vendors</Text>
              <TextInput style={[s.input, s.textarea]} value={notes} onChangeText={setNotes}
                placeholder="Anything a buyer should know" multiline placeholderTextColor="#9CA3AF" />
            </View>

            {total != null && (
              <View style={s.totalCard}>
                <Text style={s.totalLabel}>IF FULLY SOLD</Text>
                <Text style={s.totalValue}>₹{total.toLocaleString('en-IN')}</Text>
                <Text style={s.totalSub}>{nQty} kg × ₹{nPrice}/kg</Text>
              </View>
            )}

            <View style={s.warnBox}>
              <Ionicons name="information-circle-outline" size={17} color="#C2410C" />
              <Text style={s.warnText}>
                Posting also marks this crop harvested and frees its plot for your next crop.
              </Text>
            </View>

            <TouchableOpacity
              style={[s.submit, (posting || problem) && s.submitOff]}
              onPress={submit}
              disabled={posting}
              activeOpacity={0.85}
            >
              {posting
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Ionicons name="storefront" size={17} color="#fff" />
                    <Text style={s.submitText}>{problem || 'Post to Farm Market'}</Text>
                  </>}
            </TouchableOpacity>

            <View style={{ height: 24 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#F8FAFC', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14,
    backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title:    { fontSize: 18, fontWeight: '700', color: '#111827', letterSpacing: -0.2 },
  subtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  body:     { backgroundColor: '#F8FAFC' },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 8,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 5, borderWidth: 1, borderColor: '#F1F5F9',
  },
  cropRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cropIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' },
  cropName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cropSub:  { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  divider:  { height: 1, backgroundColor: '#F1F5F9', marginVertical: 4 },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: '#F8FAFC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '500' },

  label: { fontSize: 13, fontWeight: '700', color: '#374151' },
  req:   { color: '#EA580C' },
  hint:  { fontSize: 11.5, color: '#9CA3AF', lineHeight: 16 },
  input: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 15, color: '#111827', marginTop: 6,
  },
  textarea: { height: 76, textAlignVertical: 'top' },

  photoRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  photoBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 20,
    backgroundColor: '#F0FDF4', borderRadius: 12, borderWidth: 1, borderColor: '#BBF7D0',
    borderStyle: 'dashed',
  },
  photoBtnText: { fontSize: 13, color: '#15803D', fontWeight: '700' },
  preview: { width: '100%', height: 190, borderRadius: 12, marginTop: 6, backgroundColor: '#F1F5F9' },
  retake:  { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 10 },
  retakeText: { fontSize: 13, color: '#16A34A', fontWeight: '700' },

  totalCard: {
    backgroundColor: '#F0FDF4', borderRadius: 18, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  totalLabel: { fontSize: 9.5, fontWeight: '800', color: '#15803D', letterSpacing: 0.8 },
  totalValue: { fontSize: 30, fontWeight: '800', color: '#15803D', marginTop: 4 },
  totalSub:   { fontSize: 12, color: '#6B7280', marginTop: 2 },

  warnBox: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: '#FFF7ED', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  warnText: { flex: 1, fontSize: 12.5, color: '#C2410C', lineHeight: 18 },

  submit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', paddingVertical: 15, borderRadius: 12,
  },
  submitOff:  { backgroundColor: '#94A3B8' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

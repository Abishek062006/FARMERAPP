import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import VehicleIcon from '../../components/vehicles/VehicleIcon';

const TYPES = [
  { key: 'auto',  label: 'Auto',      tamil: 'ஆட்டோ',        cap: 'up to 300 kg · trips under 20 km' },
  { key: 'tempo', label: 'Tempo Van', tamil: 'டெம்போ வேன்',  cap: 'up to 1,500 kg · any distance' },
  { key: 'truck', label: 'Truck',     tamil: 'லாரி',          cap: 'up to 10,000 kg · any distance' },
];

// Agents need a vehicle type before any job can be offered to them, and
// RegisterScreen doesn't ask (it is shared by all three roles and works — no
// reason to disturb it). So they set it here, once, on first launch.
export default function AgentOnboarding({ visible, uid, initial, onDone }) {
  const [type, setType] = useState(initial?.type || null);
  const [number, setNumber] = useState(initial?.number || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!type) return;
    setSaving(true);
    try {
      const r = await axios.put(`${API_ENDPOINTS.USERS}/${uid}`, {
        vehicle: { type, number: number.trim().toUpperCase() },
      });
      if (r.data.success) onDone({ type, number: number.trim().toUpperCase() });
    } catch (err) {
      Alert.alert('Could not save', err.response?.data?.error || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <Text style={s.title}>What do you drive?</Text>
          <Text style={s.sub}>நீங்கள் ஓட்டும் வாகனம்</Text>
          <Text style={s.blurb}>You will only be offered trips your vehicle can carry.</Text>

          <View style={s.list}>
            {TYPES.map((t) => {
              const on = type === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[s.option, on && s.optionOn]}
                  onPress={() => setType(t.key)}
                  activeOpacity={0.85}
                >
                  <VehicleIcon type={t.key} width={62} />
                  <View style={{ flex: 1 }}>
                    <View style={s.optTitleRow}>
                      <Text style={s.optLabel}>{t.label}</Text>
                      <Text style={s.optTamil}>{t.tamil}</Text>
                    </View>
                    <Text style={s.optCap}>{t.cap}</Text>
                  </View>
                  {on && <Ionicons name="checkmark-circle" size={20} color="#16A34A" />}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.label}>Vehicle number</Text>
          <TextInput
            style={s.input}
            value={number}
            onChangeText={setNumber}
            placeholder="TN 45 AB 1234"
            autoCapitalize="characters"
            placeholderTextColor="#9CA3AF"
          />

          <TouchableOpacity
            style={[s.save, (!type || saving) && s.saveOff]}
            onPress={save}
            disabled={!type || saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>Save and go online</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#F8FAFC', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 20, gap: 8,
  },
  title: { fontSize: 21, fontWeight: '800', color: '#111827' },
  sub:   { fontSize: 13, color: '#9CA3AF' },
  blurb: { fontSize: 13.5, color: '#6B7280', marginTop: 4, marginBottom: 8 },

  list: { gap: 10 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 16, padding: 13,
    borderWidth: 1.5, borderColor: '#F1F5F9',
  },
  optionOn:  { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  optTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  optLabel:  { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  optTamil:  { fontSize: 11.5, color: '#9CA3AF' },
  optCap:    { fontSize: 12, color: '#6B7280', marginTop: 3 },

  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 12 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 12, fontSize: 15, color: '#111827', marginTop: 6,
  },
  save: {
    backgroundColor: '#16A34A', paddingVertical: 15, borderRadius: 12,
    alignItems: 'center', marginTop: 16, marginBottom: 8,
  },
  saveOff:  { backgroundColor: '#94A3B8' },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

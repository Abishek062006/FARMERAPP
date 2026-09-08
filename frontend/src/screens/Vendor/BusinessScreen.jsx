import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

// C2, the half that was missing: a buyer submitting their own credentials.
//
// The badge already rendered on every offer and the validator already worked,
// but nothing in the app ever called PUT /api/users/business — so every buyer
// showed "No documents" forever and the badge could not be earned. A trust
// signal nobody can obtain is worse than none, because it reads as "this buyer
// failed to verify" rather than "nobody has been asked yet".
//
// The wording here must match what the server actually checked. A passing GST
// check digit proves the number was ISSUED, not that it belongs to this buyer —
// so the ceiling reachable from this screen is "GSTIN on file". "Verified
// buyer" needs a person, and there is no button for it on purpose.
const BADGE = {
  verified:            { label: 'Verified buyer', icon: 'shield-checkmark', fg: '#15803D', bg: '#DCFCE7' },
  documents_submitted: { label: 'GSTIN on file',  icon: 'document-text-outline', fg: '#1D4ED8', bg: '#DBEAFE' },
  rejected:            { label: 'Not verified',   icon: 'alert-circle-outline', fg: '#B91C1C', bg: '#FEE2E2' },
  unverified:          { label: 'No documents',   icon: 'help-circle-outline', fg: '#9CA3AF', bg: '#F1F5F9' },
};

export default function BusinessScreen({ route }) {
  const { userData } = route.params || {};
  const uid = userData?.uid || userData?.firebaseUid;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('unverified');

  const [gstin, setGstin] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [tradeLicence, setTradeLicence] = useState('');
  const [address, setAddress] = useState('');
  const [gstinState, setGstinState] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_ENDPOINTS.USERS}/firebase/${uid}`)
      .then((r) => {
        if (cancelled) return;
        const u = r.data?.user || r.data?.data || {};
        setGstin(u.business?.gstin || '');
        setTradeName(u.business?.tradeName || '');
        setTradeLicence(u.business?.tradeLicence || '');
        setAddress(u.business?.address || '');
        setGstinState(u.business?.gstinState || null);
        setStatus(u.verification?.status || 'unverified');
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await axios.put(`${API_ENDPOINTS.USERS}/business`, {
        gstin: gstin.trim().toUpperCase(),
        tradeName: tradeName.trim(),
        tradeLicence: tradeLicence.trim(),
        address: address.trim(),
      });
      if (r.data.success) {
        setStatus(r.data.verification.status);
        setGstinState(r.data.business.gstinState || null);
        Alert.alert(
          'Saved',
          r.data.verification.status === 'documents_submitted'
            ? 'Your GSTIN checks out and farmers will now see "GSTIN on file" on your offers. A person still has to review the documents before it reads "Verified buyer".'
            : 'Your details are saved.'
        );
      }
    } catch (e) {
      // The server names which part was wrong — length, shape, state code or
      // check digit — so pass that through rather than "invalid GSTIN".
      Alert.alert('Could not save', e.response?.data?.error || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const clear = () =>
    Alert.alert('Remove your GSTIN?', 'Your badge will go back to "No documents".',
      [{ text: 'Cancel', style: 'cancel' }, {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            const r = await axios.put(`${API_ENDPOINTS.USERS}/business`, { gstin: '' });
            if (r.data.success) {
              setGstin(''); setGstinState(null);
              setStatus(r.data.verification.status);
            }
          } catch (e) {
            Alert.alert('Could not remove', e.response?.data?.error || 'Please try again.');
          }
        },
      }]);

  if (loading) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;

  const b = BADGE[status] || BADGE.unverified;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={[s.badgeCard, { backgroundColor: b.bg }]}>
        <Ionicons name={b.icon} size={22} color={b.fg} />
        <View style={{ flex: 1 }}>
          <Text style={[s.badgeLabel, { color: b.fg }]}>{b.label}</Text>
          <Text style={s.badgeMeaning}>
            {status === 'verified'
              ? 'Documents checked by a person.'
              : status === 'documents_submitted'
                ? 'Your GSTIN format and check digit are valid. Not confirmed against the GST portal.'
                : status === 'rejected'
                  ? 'Documents were reviewed and not accepted.'
                  : 'Farmers see this on every offer you make. Adding a GSTIN below changes it.'}
          </Text>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.why}>
          A farmer handing over a tonne of onion on a cash-on-delivery promise is extending
          credit to a stranger. These details let them see who they are dealing with.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.label}>GSTIN</Text>
        <TextInput
          style={[s.input, s.mono]}
          value={gstin}
          onChangeText={(v) => setGstin(v.toUpperCase())}
          placeholder="27AAPFU0939F1ZV"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="characters"
          maxLength={15}
        />
        <Text style={s.hint}>
          15 characters. The check digit is verified here, so a typo is caught rather than
          saved. {gstin.length > 0 && gstin.length < 15 ? `${15 - gstin.length} to go.` : ''}
        </Text>
        {!!gstinState && (
          <View style={s.stateRow}>
            <Ionicons name="location-outline" size={14} color="#15803D" />
            <Text style={s.stateText}>Registered in {gstinState}</Text>
          </View>
        )}

        <Text style={s.label}>Trade name</Text>
        <TextInput style={s.input} value={tradeName} onChangeText={setTradeName}
          placeholder="The name farmers will see" placeholderTextColor="#9CA3AF" />

        <Text style={s.label}>Trade licence number</Text>
        <TextInput style={s.input} value={tradeLicence} onChangeText={setTradeLicence}
          placeholder="APMC or municipal licence, if you have one" placeholderTextColor="#9CA3AF" />

        <Text style={s.label}>Business address</Text>
        <TextInput style={[s.input, s.multi]} value={address} onChangeText={setAddress}
          placeholder="Where you trade from" placeholderTextColor="#9CA3AF" multiline />
      </View>

      <View style={s.note}>
        <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
        <Text style={s.noteText}>
          Submitting these gets you as far as <Text style={{ fontWeight: '700' }}>“GSTIN on file”</Text>.
          “Verified buyer” means a person has checked the documents against the GST portal —
          it is not something this form can grant, which is what makes it worth anything to
          a farmer.
        </Text>
      </View>

      <TouchableOpacity style={[s.cta, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" />
          : <><Ionicons name="save-outline" size={17} color="#fff" />
              <Text style={s.ctaText}>Save details</Text></>}
      </TouchableOpacity>

      {!!gstin && status !== 'unverified' && (
        <TouchableOpacity style={s.clear} onPress={clear}>
          <Text style={s.clearText}>Remove my GSTIN</Text>
        </TouchableOpacity>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  scroll: { padding: 16, gap: 12 },

  badgeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderRadius: 16, padding: 15 },
  badgeLabel: { fontSize: 16, fontWeight: '800' },
  badgeMeaning: { fontSize: 12, color: '#6B7280', marginTop: 3, lineHeight: 17 },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  why: { fontSize: 13.5, color: '#6B7280', lineHeight: 20 },

  label: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827',
  },
  mono: { fontSize: 16, letterSpacing: 1.5, fontWeight: '600' },
  multi: { height: 70, textAlignVertical: 'top' },
  hint: { fontSize: 11, color: '#9CA3AF', marginTop: 6, lineHeight: 16 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  stateText: { fontSize: 12.5, fontWeight: '600', color: '#15803D' },

  note: { flexDirection: 'row', gap: 9, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 13 },
  noteText: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 18 },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 15,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  clear: { alignItems: 'center', paddingVertical: 12 },
  clearText: { fontSize: 13, color: '#B91C1C', fontWeight: '600' },
});

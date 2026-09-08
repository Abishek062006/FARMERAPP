import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInWithPhoneNumber } from 'firebase/auth';
import * as Location from 'expo-location';
import { auth } from '../../utils/firebase';
import RecaptchaModal from '../../components/auth/RecaptchaModal';
import { createUser, getUserByFirebaseUid } from '../../utils/mongoAPI';
import { roleLabel } from '../../i18n/strings';
import { matchDistrict } from '../../utils/districts';

// ═══ SIGN IN WITH A PHONE NUMBER ══════════════════════════════════════════
//
// Additive: the email/password screen is untouched and every existing account
// keeps working. This is a SECOND door, not a replacement — 2,183 seeded
// accounts sign in by email and none of them has a real phone that could
// receive an SMS.
//
// ⚠️ A PHONE SIGN-IN CREATES A DIFFERENT FIREBASE uid from the same person's
// email account, and every profile in this app is keyed on uid. So this screen
// deliberately does NOT try to find an existing profile by matching the phone
// number — that would let whoever verifies a number inherit a stranger's trade
// history. An existing user links their phone from inside their profile
// instead, where they have already proved they hold the account. See the long
// note on POST /api/users/me/link-phone.
//
// ⚠️ THE PHONE PROVIDER MUST BE ENABLED in the Firebase console
// (Authentication → Sign-in method → Phone). Until it is, Firebase answers
// `auth/operation-not-allowed` and the message below says exactly that rather
// than blaming the number.
const ROLES = [
  { role: 'farmer', emoji: '🌾', blurb: 'I grow crops' },
  { role: 'vendor', emoji: '🏪', blurb: 'I buy produce' },
  { role: 'agent',  emoji: '🚚', blurb: 'I drive a vehicle' },
  { role: 'fpo',    emoji: '🏛️', blurb: 'I run a farmer producer company' },
];

// India only, which is what this app is for. Stored and sent in E.164 because
// that is the only shape Firebase accepts and the only one that round-trips.
const toE164 = (raw) => {
  const d = String(raw || '').replace(/\D/g, '');
  const ten = d.length > 10 ? d.slice(-10) : d;
  return ten.length === 10 ? `+91${ten}` : null;
};

export default function PhoneLoginScreen({ navigation }) {
  const [step, setStep] = useState('number');     // number | code | profile
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState(null);

  const recaptcha = useRef(null);
  const confirmation = useRef(null);
  const e164 = useRef(null);

  const fail = (title, msg) => Alert.alert(title, msg);

  // ── STEP 1: send the code ──────────────────────────────────────────────
  const sendCode = useCallback(async () => {
    const n = toE164(phone);
    if (!n) return fail('Check the number', 'Enter the 10-digit mobile number.');
    setBusy(true);
    try {
      e164.current = n;
      // `recaptcha.current` IS the ApplicationVerifier — it opens the WebView,
      // waits for the token and resolves with it. See RecaptchaModal.
      confirmation.current = await signInWithPhoneNumber(auth, n, recaptcha.current);
      setStep('code');
    } catch (err) {
      if (err?.message === 'cancelled') return;              // user closed the check
      const c = err?.code || '';
      if (c === 'auth/operation-not-allowed') {
        fail('Phone sign-in is switched off',
          'This app\'s Firebase project does not have the Phone provider enabled yet. '
          + 'Turn it on in Firebase Console → Authentication → Sign-in method → Phone. '
          + 'Email sign-in is unaffected.');
      } else if (c === 'auth/invalid-phone-number') {
        fail('Check the number', 'That does not look like a valid mobile number.');
      } else if (c === 'auth/too-many-requests') {
        fail('Too many attempts', 'Wait a few minutes before trying again.');
      } else if (c === 'auth/quota-exceeded') {
        fail('SMS limit reached', 'This project has used up its free SMS quota for now.');
      } else if (c === 'auth/network-request-failed') {
        fail('No connection', 'Check your internet and try again.');
      } else {
        fail('Could not send the code', err?.message || 'Please try again.');
      }
      recaptcha.current?._reset?.();
    } finally {
      setBusy(false);
    }
  }, [phone]);

  // ── STEP 2: confirm it ─────────────────────────────────────────────────
  const confirmCode = useCallback(async () => {
    if (!/^\d{6}$/.test(code)) return fail('Check the code', 'Enter the 6-digit code from the SMS.');
    setBusy(true);
    try {
      const cred = await confirmation.current.confirm(code);
      // Does this uid already have a profile? If it does, RootNavigator's own
      // auth listener takes over from here and lands them on their dashboard —
      // nothing more to do on this screen.
      const existing = await getUserByFirebaseUid(cred.user.uid);
      if (existing?.success && existing.user) return;        // signed in, done
      setStep('profile');                                    // brand new account
    } catch (err) {
      const c = err?.code || '';
      if (c === 'auth/invalid-verification-code') fail('Wrong code', 'That code did not match. Check the SMS and try again.');
      else if (c === 'auth/code-expired') fail('Code expired', 'Ask for a new code.');
      else fail('Could not verify', err?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }, [code]);

  // ── STEP 3: a brand-new account needs a name and a role ────────────────
  //
  // Not defaulted. Every navigator, every server gate and half the screens
  // branch on the role, and guessing "farmer" would put a buyer in a farmer's
  // app with no way to correct it — `role` is deliberately absent from the
  // profile-update allowlist so it cannot be self-changed later.
  const finish = useCallback(async () => {
    if (!name.trim()) return fail('Your name', 'Please enter your name.');
    if (!role) return fail('Choose one', 'Tell us what you do, so we open the right app.');
    setBusy(true);
    try {
      let location = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const [place] = await Location.reverseGeocodeAsync({
            latitude: fix.coords.latitude, longitude: fix.coords.longitude,
          });
          // ⚠️ `subregion` is the district; `region` is the STATE. And a district
          // that does not resolve is stored as NULL, never guessed — the same
          // rule RegisterScreen follows after it used to hardcode Chennai.
          location = {
            city: place?.city || place?.subregion || null,
            district: matchDistrict(place?.subregion) || null,
            state: 'Maharashtra',
            coordinates: { lat: fix.coords.latitude, lng: fix.coords.longitude },
          };
        }
      } catch { /* a profile with no location is fine; a wrong one is not */ }

      const r = await createUser({
        name: name.trim(),
        // No email — this account has none, and the server no longer demands
        // one. The verified number is read from the ID token server-side, never
        // from this body.
        phone: e164.current.replace('+91', ''),
        role,
        location,
      });
      if (!r?.success) throw new Error(r?.error || 'Could not create your account');
      // RootNavigator picks it up from here.
    } catch (err) {
      fail('Could not finish', err?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }, [name, role]);

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <RecaptchaModal ref={recaptcha} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={s.back} onPress={() => navigation.goBack()} hitSlop={10}
          accessibilityLabel="Back to email sign-in">
          <Ionicons name="chevron-back" size={22} color="#111827" />
          <Text style={s.backText}>Sign in with email instead</Text>
        </TouchableOpacity>

        {step === 'number' && (
          <>
            <Text style={s.h1}>Sign in with your phone</Text>
            <Text style={s.p}>We will send a 6-digit code by SMS.</Text>
            <View style={s.phoneRow}>
              <View style={s.cc}><Text style={s.ccText}>+91</Text></View>
              <TextInput
                style={s.phoneInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="98765 43210"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                maxLength={13}
                autoFocus
              />
            </View>
            <TouchableOpacity style={[s.btn, busy && s.btnOff]} onPress={sendCode} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Send code</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === 'code' && (
          <>
            <Text style={s.h1}>Enter the code</Text>
            <Text style={s.p}>Sent to {e164.current}. It can take a moment to arrive.</Text>
            <TextInput
              style={s.codeInput}
              value={code}
              onChangeText={setCode}
              placeholder="······"
              placeholderTextColor="#D1D5DB"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <TouchableOpacity style={[s.btn, busy && s.btnOff]} onPress={confirmCode} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Verify</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setCode(''); setStep('number'); }} style={s.linkWrap}>
              <Text style={s.link}>Change the number or resend</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'profile' && (
          <>
            <Text style={s.h1}>Almost there</Text>
            <Text style={s.p}>This number is new here, so tell us who you are.</Text>
            <Text style={s.label}>Your name</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor="#9CA3AF"
            />
            <Text style={s.label}>What do you do?</Text>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r.role}
                style={[s.role, role === r.role && s.roleOn]}
                onPress={() => setRole(r.role)}
                activeOpacity={0.85}
              >
                <Text style={s.roleEmoji}>{r.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.roleName, role === r.role && s.roleNameOn]}>{roleLabel(r.role, 'en')}</Text>
                  <Text style={s.roleBlurb}>{r.blurb}</Text>
                </View>
                {role === r.role && <Ionicons name="checkmark-circle" size={21} color="#16A34A" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[s.btn, busy && s.btnOff]} onPress={finish} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Create my account</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 22, paddingTop: 56, paddingBottom: 40 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  backText: { fontSize: 14, color: '#111827', marginLeft: 2 },
  h1: { fontSize: 24, fontWeight: '800', color: '#111827' },
  p: { fontSize: 14, color: '#6B7280', marginTop: 6, marginBottom: 22, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '700', color: '#111827', marginTop: 16, marginBottom: 7 },
  phoneRow: { flexDirection: 'row', gap: 9 },
  cc: { justifyContent: 'center', paddingHorizontal: 14, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  ccText: { fontSize: 16, fontWeight: '700', color: '#111827' },
  phoneInput: { flex: 1, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', paddingHorizontal: 15, paddingVertical: 14, fontSize: 17, color: '#111827', letterSpacing: 1 },
  input: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', paddingHorizontal: 15, paddingVertical: 14, fontSize: 15, color: '#111827' },
  codeInput: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', paddingHorizontal: 15, paddingVertical: 16, fontSize: 28, letterSpacing: 12, textAlign: 'center', color: '#111827' },
  btn: { backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 22 },
  btnOff: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkWrap: { alignItems: 'center', marginTop: 16 },
  link: { color: '#15803D', fontSize: 14, fontWeight: '600' },
  role: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: '#F1F5F9', padding: 14, marginBottom: 9 },
  roleOn: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  roleEmoji: { fontSize: 24 },
  roleName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  roleNameOn: { color: '#15803D' },
  roleBlurb: { fontSize: 12.5, color: '#6B7280', marginTop: 1 },
});

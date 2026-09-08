import React, { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

// ═══ WHY THIS FILE EXISTS ═════════════════════════════════════════════════
//
// Firebase's `signInWithPhoneNumber(auth, number, appVerifier)` needs an
// `ApplicationVerifier` — an object with `type: 'recaptcha'` and a `verify()`
// that resolves to a reCAPTCHA token. The SDK's own `RecaptchaVerifier` builds
// that widget with `document.createElement`, and React Native has no DOM.
//
// The package that used to bridge this, `expo-firebase-recaptcha`, is
// DEPRECATED and does not work with modern Expo/Firebase, so it is not
// installed. `react-native-webview` already is (it is what renders the Leaflet
// maps, because react-native-maps hung Android at startup), so the widget runs
// in a WebView and posts its token back.
//
// ⚠️ THE `baseUrl` IS LOAD-BEARING. A reCAPTCHA site key is restricted to the
// domains registered against it, and Firebase registers the project's
// authDomain. HTML injected with no baseUrl has an `about:blank` origin and
// Google refuses the key — the widget renders and then silently never solves.
const AUTH_DOMAIN = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
const API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;

/**
 * The site key is fetched from Firebase rather than hard-coded: it belongs to
 * the project and can be rotated, and a stale literal would fail at sign-in
 * with an error that looks like a phone problem.
 */
async function fetchSiteKey() {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/recaptchaParams?key=${API_KEY}`);
  const j = await r.json();
  if (!j.recaptchaSiteKey) throw new Error('Could not load the reCAPTCHA site key');
  return j.recaptchaSiteKey;
}

const pageFor = (siteKey) => `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<style>
  html,body{margin:0;padding:0;height:100%;background:#fff;
    display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,Roboto,sans-serif;color:#6B7280}
  #box{transform:scale(1.02)}
</style></head>
<body>
  <div id="box"></div>
  <script>
    function post(m){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
    window.onRecaptchaLoad = function () {
      try {
        grecaptcha.render('box', {
          sitekey: '${siteKey}',
          callback: function (t) { post({ type: 'token', token: t }); },
          'expired-callback': function () { post({ type: 'expired' }); },
          'error-callback': function () { post({ type: 'error', message: 'reCAPTCHA failed to verify' }); }
        });
        post({ type: 'ready' });
      } catch (e) { post({ type: 'error', message: String(e && e.message || e) }); }
    };
  </script>
  <script src="https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoad&render=explicit" async defer></script>
</body></html>`;

/**
 * Usage — it IS the appVerifier, so it drops straight into the Firebase call:
 *
 *   const recaptcha = useRef(null);
 *   …
 *   <RecaptchaModal ref={recaptcha} />
 *   await signInWithPhoneNumber(auth, '+919820100001', recaptcha.current);
 */
const RecaptchaModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [siteKey, setSiteKey] = useState(null);
  const [error, setError] = useState(null);
  const [solving, setSolving] = useState(false);
  const pending = useRef(null);       // { resolve, reject } for the open verify()

  const settle = useCallback((fn, arg) => {
    const p = pending.current;
    pending.current = null;
    setVisible(false);
    setSolving(false);
    if (p) p[fn](arg);
  }, []);

  useImperativeHandle(ref, () => ({
    // The two properties Firebase's ApplicationVerifier contract requires.
    type: 'recaptcha',
    verify: () => new Promise((resolve, reject) => {
      pending.current = { resolve, reject };
      setError(null);
      setVisible(true);
      fetchSiteKey()
        .then(setSiteKey)
        .catch((e) => { setError(e.message); });
    }),
    // Firebase calls this after a failed attempt so the widget can be re-armed.
    _reset: () => { setSiteKey(null); setError(null); },
  }), []);

  const onMessage = (e) => {
    let m;
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === 'token') settle('resolve', m.token);
    else if (m.type === 'error') { setError(m.message); setSolving(false); }
    else if (m.type === 'expired') { setError('That check expired. Tap the box again.'); setSolving(false); }
    else if (m.type === 'ready') setSolving(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade"
      onRequestClose={() => settle('reject', new Error('cancelled'))}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <View style={s.head}>
            <Text style={s.title}>Quick security check</Text>
            <TouchableOpacity
              onPress={() => settle('reject', new Error('cancelled'))}
              hitSlop={10}
              accessibilityLabel="Cancel the security check"
            >
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <Text style={s.sub}>This confirms you are a real person before we send the code.</Text>

          {error ? (
            <View style={s.errBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
              <Text style={s.errText}>{error}</Text>
            </View>
          ) : null}

          <View style={s.webWrap}>
            {!siteKey ? (
              <View style={s.center}><ActivityIndicator color="#16A34A" /></View>
            ) : (
              <WebView
                originWhitelist={['*']}
                // ⚠️ baseUrl — see the note at the top of this file.
                source={{ html: pageFor(siteKey), baseUrl: `https://${AUTH_DOMAIN}` }}
                onMessage={onMessage}
                javaScriptEnabled
                domStorageEnabled
                mixedContentMode="always"
                style={s.web}
                onError={() => setError('Could not load the security check. Check your connection.')}
                startInLoadingState
                renderLoading={() => <View style={s.center}><ActivityIndicator color="#16A34A" /></View>}
              />
            )}
          </View>

          {solving ? <ActivityIndicator color="#16A34A" style={{ marginTop: 8 }} /> : null}
        </View>
      </View>
    </Modal>
  );
});

RecaptchaModal.displayName = 'RecaptchaModal';

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 12.5, color: '#6B7280', marginTop: 4, marginBottom: 12, lineHeight: 18 },
  webWrap: { height: 130, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  web: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errBox: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, padding: 9, marginBottom: 10 },
  errText: { flex: 1, fontSize: 12, color: '#B91C1C', lineHeight: 17 },
});

export default RecaptchaModal;

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_ENDPOINTS } from '../utils/config';
import { t as translate, tBoth as translateBoth, roleLabel as roleLbl, DEFAULT_LANGUAGE, LANGUAGES } from './strings';

// One place that knows which language the app is speaking.
//
// THE BUG THIS FIXES. `DEFAULT_LANGUAGE` is 'mr' and `User.language` was never
// written by any route, so the six screens wired to i18n rendered Marathi while
// the other thirty-one rendered English — and nothing anywhere let a farmer
// choose. Landing on an English dashboard and tapping "Post harvest" opened a
// Marathi modal. A consistently English app would have been better than that.
//
// WHY A CONTEXT AND NOT A PROP. Language has to reach every screen, including
// ones several navigators deep that never receive `userData`. Threading a prop
// through all of them is how half of them quietly miss it — which is exactly
// how the app ended up half-translated the first time.
//
// PERSISTENCE IS LOCAL FIRST, SERVER SECOND.
//   AsyncStorage is read synchronously on boot so the app never flashes the
//   wrong language, and it works with no network. The server copy
//   (`User.language`) exists so the choice survives a reinstall or a second
//   device — it is written opportunistically and its failure is ignored, because
//   a farmer who taps a language toggle on a bad connection should still get the
//   language.
const STORAGE_KEY = '@farmerapp:language';

const LanguageContext = createContext({
  lang: DEFAULT_LANGUAGE,
  setLang: () => {},
  t: (k) => translate(k, DEFAULT_LANGUAGE),
  tBoth: (k) => translateBoth(k, DEFAULT_LANGUAGE),
  roleLabel: (r) => roleLbl(r, DEFAULT_LANGUAGE),
  ready: false,
});

export function LanguageProvider({ children, uid }) {
  const [lang, setLangState] = useState(DEFAULT_LANGUAGE);
  // `ready` distinguishes "we have not read storage yet" from "the farmer chose
  // the default". Without it a screen can render in the wrong language for one
  // frame and visibly flip.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (cancelled) return;
        if (v && LANGUAGES.some((l) => l.code === v)) setLangState(v);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  const setLang = useCallback((code) => {
    if (!LANGUAGES.some((l) => l.code === code)) return;
    setLangState(code);                       // instant, no await
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
    // Best effort. A failed sync must never block or undo the switch.
    if (uid) {
      axios.put(`${API_ENDPOINTS.USERS}/${uid}`, { language: code }).catch(() => {});
    }
  }, [uid]);

  const value = {
    lang,
    setLang,
    ready,
    t: (key) => translate(key, lang),
    tBoth: (key) => translateBoth(key, lang),
    roleLabel: (role, plural) => roleLbl(role, lang, plural),
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * Screens call this instead of importing `t` directly.
 *
 * Importing `t` and passing a language by hand is what produced the
 * half-translated state — a screen that forgets the argument silently falls
 * back to the default rather than failing, so nobody notices.
 */
export function useLanguage() {
  return useContext(LanguageContext);
}

export default LanguageContext;

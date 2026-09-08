import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { LANGUAGES } from '../i18n/strings';

// The language switch, floating above the chatbot.
//
// WHY IT FLOATS RATHER THAN LIVING IN PROFILE. A farmer who opens the app and
// cannot read it will not go hunting through a settings screen to fix that —
// the control has to be visible from the screen where the problem is. It sits
// directly above the chatbot button because that corner is already the "help
// me" corner of this app, and because the two belong together: the chatbot
// answers in whichever language you write to it.
//
// BOTH LABELS ARE ALWAYS IN THEIR OWN SCRIPT — "EN" and "मराठी", never
// "English / Marathi" in one language. Someone who cannot read the current
// language still has to be able to find the way out, and a Marathi speaker
// looking at an English app needs to recognise मराठी, not the word "Marathi".
//
// `offset` moves it clear of whatever else is floating on that screen. Default
// clears the 68px chatbot button plus its 30px inset.
export default function LanguageToggle({ offset = 110 }) {
  const { lang, setLang } = useLanguage();

  return (
    <View style={[s.wrap, { bottom: offset }]} pointerEvents="box-none">
      <View style={s.pill}>
        {LANGUAGES.map((l) => {
          const on = lang === l.code;
          return (
            <TouchableOpacity
              key={l.code}
              onPress={() => setLang(l.code)}
              style={[s.seg, on && s.segOn]}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              // Read out in the language it switches TO, so a screen reader
              // user hears the destination rather than the current state.
              accessibilityLabel={l.nativeLabel}
            >
              <Text style={[s.txt, on && s.txtOn]}>
                {l.code === 'en' ? 'EN' : l.nativeLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 20,
    // Above the chatbot (zIndex 9999) so it is never covered by it, but the
    // wrapper is box-none so it does not swallow taps meant for the screen.
    zIndex: 10000,
    elevation: 11,
  },
  pill: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  seg: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    minWidth: 44,
    alignItems: 'center',
  },
  segOn: { backgroundColor: '#16A34A' },
  txt: { fontSize: 12.5, fontWeight: '700', color: '#6B7280' },
  txtOn: { color: '#fff' },
});

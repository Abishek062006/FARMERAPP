import React, { useRef, useEffect, useCallback } from 'react';
import { View, Animated, Easing } from 'react-native';

// A continuously-scrolling right-to-left strip (like a news ticker), not a
// swipeable carousel — items are ambient/glanceable rather than something
// the user has to actively page through. The item list is tripled so the
// loop point is never visible, then translated left by exactly one set's
// width per cycle and snapped back — seamless for any number of items.
// Shared by the Market Prices ticker and the Schemes rows so both animate
// identically.
//
// ⚠️ MANUAL DRAGGING WAS TRIED THREE TIMES AND DROPPED — EACH ATTEMPT BROKE
// SOMETHING WORSE THAN WHAT IT FIXED:
//   1. Animated.event({useNativeDriver:true}) on a PanResponder's gesture —
//      crashed every touch-move ("onPanResponderMove is not a function").
//      PanResponder computes gestureState in JS; there is nothing native for
//      Animated.event to attach to.
//   2. Plain PanResponder + translateX.setValue() per move — did not crash,
//      but felt "stiff, like hard pushing": every card here is a
//      TouchableOpacity, which claims the touch responder on its own
//      touch-start, and the PanResponder had to wrestle that claim away
//      mid-gesture. That fight is what read as resistance.
//   3. A real horizontal ScrollView (native drag, no responder fight) fixed
//      the stiffness, but REPORTED DIRECTLY: touches elsewhere on the whole
//      Farmer Dashboard (and ONLY that screen — confirmed against Buyer/FPO/
//      Captain, which have no ticker) became unreliable, "sometimes goes in,
//      sometimes not." A horizontal ScrollView nested inside the dashboard's
//      own vertical ScrollView is a well-known source of exactly that
//      failure class in React Native — the two scrollables' native gesture
//      recognizers can end up contending for the same touch stream, and it
//      is not confined to the ticker's own bounds.
//
// The feature this screen actually needs — readable while held, not stuck
// mid-slide, resumes on its own — does not require manual dragging to work.
// This version is deliberately back to a single Animated.Value driven
// entirely by the NATIVE driver: once `.start()` is called there is ZERO
// JS/bridge traffic per frame, no nested scrollable, no custom responder —
// which is also exactly why this was never the thing that broke.
//
// `onTouchStart`/`onTouchEnd` are plain, non-claiming listeners (the same
// reasoning as always: they must not steal the touch from a card's own
// TouchableOpacity) — they only pause/resume the animation, they never
// intercept or redirect anything.
const RESUME_DELAY_MS = 3000;

const AutoScrollTicker = ({ items, renderItem, cardWidth = 150, cardMargin = 10, pxPerSec = 22 }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const animRef = useRef(null);
  const resumeTimer = useRef(null);
  const pausedAt = useRef(0);
  const setWidth = items.length * (cardWidth + cardMargin);
  const duration = setWidth > 0 ? (setWidth / pxPerSec) * 1000 : 0;

  const clearResumeTimer = useCallback(() => {
    if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = null; }
  }, []);

  const startLoop = useCallback(() => {
    if (setWidth <= 0) return;
    translateX.setValue(0);
    pausedAt.current = 0;
    animRef.current = Animated.loop(
      Animated.timing(translateX, {
        toValue: -setWidth,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animRef.current.start();
  }, [setWidth, duration, translateX]);

  useEffect(() => {
    if (items.length === 0) return undefined;
    startLoop();
    return () => {
      if (animRef.current) animRef.current.stop();
      clearResumeTimer();
    };
  }, [items.length, startLoop, clearResumeTimer]);

  const handlePause = useCallback(() => {
    clearResumeTimer();
    if (animRef.current) animRef.current.stop();
    translateX.stopAnimation((v) => { pausedAt.current = v; });
  }, [translateX, clearResumeTimer]);

  const handleResume = useCallback(() => {
    if (setWidth <= 0) return;
    const from = pausedAt.current;
    const remaining = setWidth + from; // `from` is <= 0
    if (remaining <= 1) { startLoop(); return; }
    animRef.current = Animated.timing(translateX, {
      toValue: -setWidth,
      duration: (remaining / pxPerSec) * 1000,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animRef.current.start(({ finished }) => { if (finished) startLoop(); });
  }, [setWidth, pxPerSec, translateX, startLoop]);

  const scheduleResume = useCallback(() => {
    clearResumeTimer();
    resumeTimer.current = setTimeout(() => {
      resumeTimer.current = null;
      handleResume();
    }, RESUME_DELAY_MS);
  }, [clearResumeTimer, handleResume]);

  if (items.length === 0) return null;

  const looped = [...items, ...items, ...items];

  return (
    <View
      style={{ overflow: 'hidden' }}
      onTouchStart={handlePause}
      onTouchEnd={scheduleResume}
      onTouchCancel={scheduleResume}
    >
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX }] }}>
        {looped.map((item, idx) => renderItem(item, idx))}
      </Animated.View>
    </View>
  );
};

export default AutoScrollTicker;

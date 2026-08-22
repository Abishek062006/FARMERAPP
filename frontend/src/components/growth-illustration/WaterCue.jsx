import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

// The "this plant needs water today" cue.
//
// Replaces an earlier bouncing 💧 badge in the corner, which didn't read as
// anything in particular. This version shows actual droplets falling onto
// the plant and soaking into the soil, plus a plain-language label — so it's
// obvious at a glance what the app is telling the farmer to do. It stops the
// moment today's watering task is marked complete.

const DROPS = [
  { x: 52, delay: 0 },
  { x: 80, delay: 380 },
  { x: 108, delay: 760 },
];

const FALL_MS = 1150;
const CYCLE_MS = 1700;

function Droplet() {
  return (
    <Svg width={12} height={16} viewBox="0 0 12 16">
      <Path
        d="M6 0 C6 0 11.5 7.2 11.5 10.4 A5.5 5.5 0 0 1 0.5 10.4 C0.5 7.2 6 0 6 0 Z"
        fill="#3B9FE0"
        opacity={0.92}
      />
      <Path d="M4 8.5 C3.4 9.6 3.5 11 4.4 11.8" stroke="#BFE4F8" strokeWidth={1.2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function FallingDrop({ x, delay }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: FALL_MS, easing: Easing.in(Easing.quad) }),
          withTiming(0, { duration: CYCLE_MS - FALL_MS, easing: Easing.linear })
        ),
        -1,
        false
      )
    );
  }, [delay, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    // Fade in as it leaves the cloud, fade out as it soaks into the soil.
    const opacity = p <= 0 ? 0 : p < 0.12 ? p / 0.12 : p > 0.88 ? (1 - p) / 0.12 : 1;
    return {
      opacity,
      transform: [{ translateY: 18 + p * 118 }, { scaleY: 1 + p * 0.35 }],
    };
  });

  return <Animated.View style={[styles.drop, { left: x - 6 }, style]}><Droplet /></Animated.View>;
}

function SoakPatch() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 800, easing: Easing.in(Easing.quad) })
      ),
      -1,
      false
    );
  }, [pulse]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.1 + pulse.value * 0.22,
    transform: [{ scaleX: 0.85 + pulse.value * 0.25 }],
  }));

  return <Animated.View style={[styles.soak, style]} />;
}

export default function WaterCue({ visible }) {
  if (!visible) return null;

  return (
    <View style={styles.layer} pointerEvents="none">
      <SoakPatch />
      {DROPS.map((d) => (
        <FallingDrop key={d.x} x={d.x} delay={d.delay} />
      ))}
      <View style={styles.labelWrap}>
        <Text style={styles.label}>Needs water today</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  drop: {
    position: 'absolute',
    top: 0,
  },
  soak: {
    position: 'absolute',
    left: 30,
    right: 30,
    top: 146,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2E6E9E',
  },
  labelWrap: {
    position: 'absolute',
    bottom: 2,
    alignSelf: 'center',
    backgroundColor: '#E3F2FB',
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E6E9E',
  },
});

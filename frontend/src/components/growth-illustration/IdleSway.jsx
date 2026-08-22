import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

// A gentle, continuous breathing sway — the one touch that makes a static
// illustration read as "alive" rather than a flat icon. Independent of
// growth stage; runs the whole time the card is on screen.
export default function IdleSway({ children, style }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withSequence(
        withTiming(2.2, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(-2.2, { duration: 1800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
    transformOrigin: ['50%', '95%', 0],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

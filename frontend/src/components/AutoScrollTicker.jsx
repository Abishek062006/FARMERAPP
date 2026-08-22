import React, { useRef, useEffect } from 'react';
import { View, Animated, Easing } from 'react-native';

// A continuously-scrolling right-to-left strip (like a news ticker), not a
// swipeable carousel — items are ambient/glanceable rather than something
// the user has to actively page through. The item list is tripled so the
// loop point is never visible, then translated left by exactly one set's
// width per cycle and snapped back — seamless for any number of items.
// Shared by the Market Prices ticker and the Schemes rows so both animate
// identically.
const AutoScrollTicker = ({ items, renderItem, cardWidth = 150, cardMargin = 10, pxPerSec = 22 }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const setWidth = items.length * (cardWidth + cardMargin);

  useEffect(() => {
    translateX.setValue(0);
    if (items.length === 0) return undefined;

    const anim = Animated.loop(
      Animated.timing(translateX, {
        toValue: -setWidth,
        duration: (setWidth / pxPerSec) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [items.length, setWidth]);

  if (items.length === 0) return null;

  const looped = [...items, ...items, ...items];

  return (
    <View style={{ overflow: 'hidden' }}>
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX }] }}>
        {looped.map((item, idx) => renderItem(item, idx))}
      </Animated.View>
    </View>
  );
};

export default AutoScrollTicker;

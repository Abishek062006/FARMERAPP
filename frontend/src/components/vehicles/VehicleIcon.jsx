import React from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { VEHICLE_ART } from './vehicleArt';

// React Native side of the shared vehicle art. The map renders the very same
// SVG strings inside a Leaflet divIcon — see vehicleArt.js.
export default function VehicleIcon({ type, width = 64, style, dimmed = false }) {
  const xml = VEHICLE_ART[type];
  const height = Math.round((width * 40) / 64);   // viewBox is 64×40
  if (!xml) return <View style={[{ width, height }, style]} />;
  return (
    <View style={[{ width, height, opacity: dimmed ? 0.4 : 1 }, style]}>
      <SvgXml xml={xml} width={width} height={height} />
    </View>
  );
}

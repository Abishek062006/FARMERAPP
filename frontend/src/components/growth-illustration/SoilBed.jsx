import React from 'react';
import { Defs, LinearGradient, Stop, Path, Circle } from 'react-native-svg';

export const SOIL_Y = 158;

// Shared ground the plant grows out of. Deliberately a field mound rather
// than a flower pot — these are farm crops in a field, not houseplants.
export default function SoilBed({ wet }) {
  return (
    <>
      <Defs>
        <LinearGradient id="soilGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={wet ? '#7A5C3A' : '#A8845C'} />
          <Stop offset="1" stopColor={wet ? '#4E3A24' : '#6F5636'} />
        </LinearGradient>
      </Defs>

      <Path
        d={`M 8 ${SOIL_Y + 26} Q 8 ${SOIL_Y - 4} 42 ${SOIL_Y - 7}
            Q 80 ${SOIL_Y - 11} 118 ${SOIL_Y - 7}
            Q 152 ${SOIL_Y - 4} 152 ${SOIL_Y + 26} Z`}
        fill="url(#soilGrad)"
      />
      <Path
        d={`M 12 ${SOIL_Y - 1} Q 80 ${SOIL_Y - 12} 148 ${SOIL_Y - 1}`}
        stroke={wet ? '#8A6A44' : '#C0996A'}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity={0.85}
      />
      {[26, 48, 104, 130].map((x, i) => (
        <Circle key={x} cx={x} cy={SOIL_Y + 8 + (i % 2) * 7} r={1.8} fill="#4E3A24" opacity={0.35} />
      ))}
    </>
  );
}

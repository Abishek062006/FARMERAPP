import React from 'react';
import { Path, Circle, Ellipse, G, Rect } from 'react-native-svg';
import { SOIL_Y } from './SoilBed';

// Parametric plant renderers, one per morphology family. Each receives the
// same ({ m, v }) — growth metrics and the crop's visual spec — so a crop's
// species-correct shape and colour come entirely from data, and all 82 crops
// get an accurate drawing without 82 hand-written files.
//
// Shared conventions: canvas is viewBox "0 0 160 200", the plant's base sits
// at SOIL_Y, x=80 is centre, and every archetype scales its main axis by m.h.

const GROUND = SOIL_Y - 4;

function leafPath(x, y, len, wide, dir, droop = 0) {
  const tipX = x + dir * len;
  const tipY = y + droop;
  return `M ${x} ${y}
          Q ${x + dir * len * 0.45} ${y - wide} ${tipX} ${tipY}
          Q ${x + dir * len * 0.45} ${y + wide * 0.55} ${x} ${y} Z`;
}

function Stem({ x = 80, top, width = 4, color = '#4E8C3C', curve = 0 }) {
  return (
    <Path
      d={`M ${x} ${GROUND} Q ${x + curve} ${(GROUND + top) / 2} ${x} ${top}`}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      fill="none"
    />
  );
}

function Sprout({ v }) {
  return (
    <G>
      <Path d={`M 80 ${GROUND} L 80 ${GROUND - 9}`} stroke={v.leaf} strokeWidth={2.5} strokeLinecap="round" />
      <Path d={leafPath(80, GROUND - 9, 9, 5, -1, -2)} fill={v.leaf} />
      <Path d={leafPath(80, GROUND - 9, 9, 5, 1, -2)} fill={v.leaf} opacity={0.85} />
    </G>
  );
}

// ── Cereals & grasses: a tuft of arching blades + grain head ────────────
function Grass({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const n = 7;
  const top = GROUND - 108 * m.h;
  return (
    <G>
      {Array.from({ length: n }).map((_, i) => {
        const k = (i - (n - 1) / 2) / ((n - 1) / 2);
        const bladeTop = top + Math.abs(k) * 26;
        const bend = k * 30;
        return (
          <Path
            key={i}
            d={`M 80 ${GROUND} Q ${80 + bend * 0.5} ${(GROUND + bladeTop) / 2} ${80 + bend} ${bladeTop}`}
            stroke={i % 2 ? v.leaf : '#5FA84D'}
            strokeWidth={3.4}
            strokeLinecap="round"
            fill="none"
          />
        );
      })}
      {m.showFruit &&
        [-1, 0, 1].map((k) => {
          const hx = 80 + k * 16;
          const hy = top + Math.abs(k) * 20;
          const len = 26 * m.fruitGrow;
          return (
            <G key={k}>
              <Path
                d={`M ${hx} ${hy} Q ${hx + k * 6} ${hy + len * 0.6} ${hx + k * 9} ${hy + len}`}
                stroke={m.ripe ? v.fruit : '#8FBF5C'}
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
              />
              {Array.from({ length: 5 }).map((__, j) => {
                const f = j / 4;
                return (
                  <Ellipse
                    key={j}
                    cx={hx + k * 9 * f + k * 2}
                    cy={hy + len * f}
                    rx={2.6 * m.fruitGrow}
                    ry={4 * m.fruitGrow}
                    fill={m.ripe ? v.fruit : '#A8CC6A'}
                  />
                );
              })}
            </G>
          );
        })}
    </G>
  );
}

// ── Maize / sugarcane: thick jointed stalk, long drooping leaves ────────
function Cane({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const top = GROUND - 122 * m.h;
  const joints = Math.max(2, Math.round(5 * m.h));
  return (
    <G>
      <Path d={`M 80 ${GROUND} L 80 ${top}`} stroke="#5D9E43" strokeWidth={7} strokeLinecap="round" />
      {Array.from({ length: joints }).map((_, i) => {
        const y = GROUND - ((GROUND - top) * (i + 1)) / (joints + 1);
        return <Path key={i} d={`M 74 ${y} L 86 ${y}`} stroke="#4A8236" strokeWidth={2} strokeLinecap="round" />;
      })}
      {Array.from({ length: joints }).map((_, i) => {
        const y = GROUND - ((GROUND - top) * (i + 1)) / (joints + 1);
        const dir = i % 2 ? 1 : -1;
        const len = 40 * m.leafScale;
        return (
          <Path
            key={`l${i}`}
            d={`M 80 ${y} Q ${80 + dir * len * 0.7} ${y - 14} ${80 + dir * len} ${y + 10}
                Q ${80 + dir * len * 0.6} ${y + 2} 80 ${y} Z`}
            fill={i % 2 ? v.leaf : '#5FA84D'}
          />
        );
      })}
      {m.showFruit && (
        <G>
          <Ellipse cx={90} cy={top + 34} rx={7 * m.fruitGrow} ry={16 * m.fruitGrow} fill={v.fruit} />
          <Path
            d={`M 90 ${top + 18} L 90 ${top + 12}`}
            stroke="#C9A24A"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </G>
      )}
    </G>
  );
}

// ── Bushy fruiting vegetables: tomato, brinjal, chili, capsicum, okra ───
function Bush({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const top = GROUND - 96 * m.h;
  const arms = Math.max(2, Math.min(4, m.leafCount));
  const isPod = v.archetype === 'bush' && (v.fruit === '#D62E1F' || v.fruit === '#6FA83C');
  return (
    <G>
      <Stem top={top} width={4} color="#4E8C3C" curve={-3} />
      {Array.from({ length: arms }).map((_, i) => {
        const y = top + 10 + i * ((GROUND - top) / (arms + 1));
        const dir = i % 2 ? 1 : -1;
        const len = 26 * m.leafScale;
        const lx = 80 + dir * len;
        const ly = y - 8;
        return (
          <G key={i}>
            <Path d={`M 80 ${y} Q ${80 + dir * len * 0.5} ${y - 6} ${lx} ${ly}`} stroke="#4E8C3C" strokeWidth={2} fill="none" />
            <Path d={leafPath(lx - dir * 3, ly, 15 * m.leafScale, 9 * m.leafScale, dir, 2)} fill={i % 2 ? v.leaf : '#4E9E45'} />
            {m.showBloom && (
              <Circle cx={lx + dir * 4} cy={ly - 7} r={3 * m.bloom} fill="#FFF4C2" stroke="#F2C63C" strokeWidth={0.8} />
            )}
            {m.showFruit && !isPod && (
              <G>
                <Circle cx={lx} cy={ly + 9} r={6.5 * m.fruitGrow} fill={v.fruit} />
                <Circle cx={lx - 2} cy={ly + 7} r={2 * m.fruitGrow} fill="#FFFFFF" opacity={0.28} />
              </G>
            )}
            {m.showFruit && isPod && (
              <Path
                d={`M ${lx} ${ly + 4} Q ${lx + dir * 4} ${ly + 12 * m.fruitGrow} ${lx + dir * 1} ${ly + 19 * m.fruitGrow}`}
                stroke={v.fruit}
                strokeWidth={5 * m.fruitGrow}
                strokeLinecap="round"
                fill="none"
              />
            )}
          </G>
        );
      })}
    </G>
  );
}

// ── Cotton: branching bush with burst white bolls ───────────────────────
function Cotton({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const top = GROUND - 104 * m.h;
  const arms = Math.max(2, Math.min(4, m.leafCount));
  return (
    <G>
      <Stem top={top} width={5} color="#5A7A3A" />
      {Array.from({ length: arms }).map((_, i) => {
        const y = top + 12 + i * ((GROUND - top) / (arms + 1));
        const dir = i % 2 ? 1 : -1;
        const len = 28 * m.leafScale;
        const lx = 80 + dir * len;
        return (
          <G key={i}>
            <Path d={`M 80 ${y} L ${lx} ${y - 8}`} stroke="#5A7A3A" strokeWidth={2.2} />
            <Path
              d={`M ${lx} ${y - 8}
                  q ${dir * 12 * m.leafScale} ${-8 * m.leafScale} ${dir * 2} ${-16 * m.leafScale}
                  q ${-dir * 14 * m.leafScale} ${6 * m.leafScale} ${-dir * 2} ${16 * m.leafScale} Z`}
              fill={v.leaf}
            />
            {m.showBloom && <Circle cx={lx} cy={y - 12} r={3.5 * m.bloom} fill="#FFF0C0" />}
            {m.showFruit && (
              <G>
                <Circle cx={lx} cy={y - 12} r={6 * m.fruitGrow} fill="#FFFFFF" />
                <Circle cx={lx - 4.5 * m.fruitGrow} cy={y - 8} r={4.5 * m.fruitGrow} fill="#FAFAFA" />
                <Circle cx={lx + 4.5 * m.fruitGrow} cy={y - 8} r={4.5 * m.fruitGrow} fill="#F2F2F2" />
                <Path
                  d={`M ${lx - 6} ${y - 5} L ${lx} ${y - 1} L ${lx + 6} ${y - 5}`}
                  stroke="#8A6238"
                  strokeWidth={1.6}
                  fill="none"
                />
              </G>
            )}
          </G>
        );
      })}
    </G>
  );
}

// ── Legumes: low trifoliate bush with hanging pods ──────────────────────
function Legume({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const top = GROUND - 74 * m.h;
  const arms = Math.max(2, Math.min(4, m.leafCount));
  return (
    <G>
      <Stem top={top} width={3} color="#4E8C3C" curve={2} />
      {Array.from({ length: arms }).map((_, i) => {
        const y = top + 8 + i * ((GROUND - top) / (arms + 1));
        const dir = i % 2 ? 1 : -1;
        const bx = 80 + dir * 20 * m.leafScale;
        const s = 8 * m.leafScale;
        return (
          <G key={i}>
            <Path d={`M 80 ${y} L ${bx} ${y - 5}`} stroke="#4E8C3C" strokeWidth={1.8} />
            <Circle cx={bx} cy={y - 5} r={s} fill={v.leaf} />
            <Circle cx={bx - dir * s * 0.9} cy={y - 5 + s * 0.7} r={s * 0.75} fill="#4E9E45" />
            <Circle cx={bx + dir * s * 0.6} cy={y - 5 - s * 0.8} r={s * 0.7} fill="#5FA84D" />
            {m.showBloom && <Circle cx={bx} cy={y - 13} r={2.5 * m.bloom} fill="#F6E7A8" />}
            {m.showFruit && (
              <Path
                d={`M ${bx} ${y + 2} Q ${bx + dir * 5} ${y + 10 * m.fruitGrow} ${bx + dir * 2} ${y + 17 * m.fruitGrow}`}
                stroke={v.fruit}
                strokeWidth={4 * m.fruitGrow}
                strokeLinecap="round"
                fill="none"
              />
            )}
          </G>
        );
      })}
    </G>
  );
}

// ── Climbing gourds: vine up a pole with fruit dangling ─────────────────
function Vine({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const top = GROUND - 118 * m.h;
  const coils = 5;
  return (
    <G>
      <Path d={`M 100 ${GROUND} L 100 ${GROUND - 122}`} stroke="#B99A6A" strokeWidth={3} strokeLinecap="round" />
      <Path
        d={`M 80 ${GROUND} Q 108 ${GROUND - 22} 92 ${GROUND - 44} Q 76 ${GROUND - 66} 104 ${GROUND - 88} Q 118 ${GROUND - 104} 100 ${top}`}
        stroke="#4E8C3C"
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
      {Array.from({ length: coils }).map((_, i) => {
        const f = (i + 1) / (coils + 1);
        const y = GROUND - (GROUND - top) * f;
        const dir = i % 2 ? -1 : 1;
        const s = 11 * m.leafScale;
        return (
          <G key={i}>
            <Path
              d={`M ${96 + dir * 4} ${y}
                  C ${96 + dir * (4 + s)} ${y - s} ${96 + dir * (4 + s * 1.4)} ${y + s * 0.6} ${96 + dir * 4} ${y + s * 0.9}
                  C ${96 + dir * (4 - s * 0.6)} ${y + s * 0.5} ${96 + dir * (4 - s * 0.3)} ${y - s * 0.5} ${96 + dir * 4} ${y} Z`}
              fill={i % 2 ? v.leaf : '#5FA84D'}
            />
            {m.showFruit && i % 2 === 0 && (
              <Ellipse
                cx={96 + dir * 14}
                cy={y + 16 * m.fruitGrow}
                rx={5 * m.fruitGrow}
                ry={13 * m.fruitGrow}
                fill={v.fruit}
              />
            )}
          </G>
        );
      })}
    </G>
  );
}

// ── Sprawling melons/pumpkin: ground vine, fruit resting on soil ────────
function Sprawl({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const reach = 20 + 42 * m.h;
  return (
    <G>
      {[-1, 1].map((dir) => (
        <Path
          key={dir}
          d={`M 80 ${GROUND} Q ${80 + dir * reach * 0.6} ${GROUND - 14} ${80 + dir * reach} ${GROUND - 4}`}
          stroke="#4E8C3C"
          strokeWidth={2.6}
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {[-1, 1].map((dir) =>
        [0.45, 0.85].map((f, i) => {
          const lx = 80 + dir * reach * f;
          const ly = GROUND - 12 - i * 3;
          const s = 11 * m.leafScale;
          return (
            <Path
              key={`${dir}${i}`}
              d={`M ${lx} ${ly + s}
                  C ${lx - s} ${ly + s * 0.3} ${lx - s * 0.8} ${ly - s} ${lx} ${ly - s * 0.8}
                  C ${lx + s * 0.8} ${ly - s} ${lx + s} ${ly + s * 0.3} ${lx} ${ly + s} Z`}
              fill={i ? v.leaf : '#4E9E45'}
            />
          );
        })
      )}
      {m.showFruit && (
        <G>
          <Ellipse cx={80} cy={GROUND + 2} rx={20 * m.fruitGrow} ry={15 * m.fruitGrow} fill={v.fruit} />
          <Ellipse cx={74} cy={GROUND - 3} rx={6 * m.fruitGrow} ry={4 * m.fruitGrow} fill="#FFFFFF" opacity={0.22} />
          <Path
            d={`M 80 ${GROUND - 13 * m.fruitGrow} Q 84 ${GROUND - 17 * m.fruitGrow} 88 ${GROUND - 14 * m.fruitGrow}`}
            stroke="#4E8C3C"
            strokeWidth={2.4}
            fill="none"
            strokeLinecap="round"
          />
        </G>
      )}
    </G>
  );
}

// ── Root crops: leafy rosette above, the actual root below the soil ─────
function Root({ m, v }) {
  const blades = Math.max(3, Math.round(3 + 3 * m.h));
  const topLen = 20 + 48 * m.h;
  return (
    <G>
      {m.showFruit && (
        <G>
          <Path
            d={`M ${80 - 11 * m.fruitGrow} ${GROUND + 2}
                Q 80 ${GROUND + 34 * m.fruitGrow} ${80 + 11 * m.fruitGrow} ${GROUND + 2} Z`}
            fill={v.fruit}
          />
          <Path
            d={`M 80 ${GROUND + 30 * m.fruitGrow} L 80 ${GROUND + 38 * m.fruitGrow}`}
            stroke={v.fruit}
            strokeWidth={1.6}
            strokeLinecap="round"
            opacity={0.7}
          />
        </G>
      )}
      {Array.from({ length: blades }).map((_, i) => {
        const k = (i - (blades - 1) / 2) / ((blades - 1) / 2 || 1);
        const tipX = 80 + k * 30;
        const tipY = GROUND - topLen + Math.abs(k) * 16;
        return (
          <Path
            key={i}
            d={`M 80 ${GROUND} Q ${80 + k * 12} ${GROUND - topLen * 0.55} ${tipX} ${tipY}`}
            stroke={i % 2 ? v.leaf : '#4E9E45'}
            strokeWidth={4.5 * m.leafScale}
            strokeLinecap="round"
            fill="none"
          />
        );
      })}
    </G>
  );
}

// ── Cabbage / cauliflower: tight head wrapped in outer leaves ───────────
function Head({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const r = 10 + 20 * m.h;
  return (
    <G>
      {[-1, 1].map((dir) => (
        <Ellipse
          key={dir}
          cx={80 + dir * r * 0.75}
          cy={GROUND - r * 0.35}
          rx={r * 0.8}
          ry={r * 0.5}
          fill="#4E9E45"
          opacity={0.9}
        />
      ))}
      <Circle cx={80} cy={GROUND - r * 0.72} r={r} fill={v.leaf} />
      <Circle cx={80} cy={GROUND - r * 0.72} r={r * 0.68} fill={m.showFruit ? v.fruit : '#8FC97A'} opacity={0.95} />
      <Path
        d={`M ${80 - r * 0.5} ${GROUND - r * 0.9} Q 80 ${GROUND - r * 1.3} ${80 + r * 0.5} ${GROUND - r * 0.9}`}
        stroke="#FFFFFF"
        strokeWidth={1.6}
        fill="none"
        opacity={0.35}
      />
    </G>
  );
}

// ── Banana: giant paddle leaves + hanging bunch ─────────────────────────
function Broadleaf({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const top = GROUND - 118 * m.h;
  const leaves = Math.max(2, Math.min(5, m.leafCount + 1));
  return (
    <G>
      <Path d={`M 75 ${GROUND} L 77 ${top} L 83 ${top} L 85 ${GROUND} Z`} fill="#5D8A3A" />
      {Array.from({ length: leaves }).map((_, i) => {
        const y = top + 4 + i * 9;
        const dir = i % 2 ? 1 : -1;
        const len = (34 + i * 7) * m.leafScale;
        return (
          <G key={i}>
            <Path
              d={`M 80 ${y}
                  Q ${80 + dir * len * 0.55} ${y - 20} ${80 + dir * len} ${y + 8}
                  Q ${80 + dir * len * 0.5} ${y + 4} 80 ${y + 3} Z`}
              fill={i % 2 ? v.leaf : '#4E9E45'}
            />
            <Path
              d={`M 80 ${y + 1} Q ${80 + dir * len * 0.5} ${y - 6} ${80 + dir * len * 0.95} ${y + 7}`}
              stroke="#3E7A33"
              strokeWidth={1}
              fill="none"
              opacity={0.5}
            />
          </G>
        );
      })}
      {m.showFruit && (
        <G>
          {[0, 1, 2].map((row) =>
            [-1, 1].map((dir) => (
              <Path
                key={`${row}${dir}`}
                d={`M 80 ${top + 22 + row * 9 * m.fruitGrow}
                    q ${dir * 11 * m.fruitGrow} ${1 * m.fruitGrow} ${dir * 9 * m.fruitGrow} ${8 * m.fruitGrow}
                    q ${-dir * 8 * m.fruitGrow} ${-1 * m.fruitGrow} ${-dir * 9 * m.fruitGrow} ${-8 * m.fruitGrow} Z`}
                fill={m.ripe ? v.fruit : '#9CBF4A'}
              />
            ))
          )}
          <Ellipse cx={80} cy={top + 52 * m.fruitGrow} rx={6 * m.fruitGrow} ry={9 * m.fruitGrow} fill="#7B3FA0" />
        </G>
      )}
    </G>
  );
}

// ── Palms: coconut, areca — bare trunk with a crown of fronds ───────────
function Palm({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const top = GROUND - 128 * m.h;
  const fronds = 6;
  return (
    <G>
      <Path
        d={`M 76 ${GROUND} Q 79 ${(GROUND + top) / 2} 78 ${top} L 84 ${top} Q 85 ${(GROUND + top) / 2} 84 ${GROUND} Z`}
        fill="#9C7A48"
      />
      {Array.from({ length: Math.ceil((GROUND - top) / 18) }).map((_, i) => (
        <Path
          key={i}
          d={`M 76 ${GROUND - 14 - i * 18} L 84 ${GROUND - 14 - i * 18}`}
          stroke="#7E5F38"
          strokeWidth={1.4}
          opacity={0.6}
        />
      ))}
      {Array.from({ length: fronds }).map((_, i) => {
        const a = (i / (fronds - 1)) * Math.PI - Math.PI / 2;
        const dir = Math.sin(a) >= 0 ? 1 : -1;
        const len = 44 * m.leafScale;
        const ex = 80 + Math.sin(a) * len;
        const ey = top + 6 + Math.abs(Math.cos(a)) * 10 + 16;
        return (
          <Path
            key={i}
            d={`M 80 ${top + 2} Q ${(80 + ex) / 2 + dir * 4} ${top - 16} ${ex} ${ey}`}
            stroke={i % 2 ? v.leaf : '#3E8E41'}
            strokeWidth={5 * m.leafScale}
            strokeLinecap="round"
            fill="none"
          />
        );
      })}
      {m.showFruit &&
        [-1, 0, 1].map((k) => (
          <Circle
            key={k}
            cx={80 + k * 9}
            cy={top + 14 + Math.abs(k) * 3}
            r={5.5 * m.fruitGrow}
            fill={v.fruit}
          />
        ))}
    </G>
  );
}

// ── Generic fruit/plantation tree: trunk + rounded canopy + fruit ───────
function Tree({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const top = GROUND - 112 * m.h;
  const r = 20 + 22 * m.h;
  const cy = top + r * 0.7;
  return (
    <G>
      <Path
        d={`M 74 ${GROUND} Q 78 ${(GROUND + cy) / 2} 77 ${cy} L 83 ${cy} Q 82 ${(GROUND + cy) / 2} 86 ${GROUND} Z`}
        fill="#8A6238"
      />
      <Path d={`M 80 ${cy + r * 0.4} L 68 ${cy + r * 0.1}`} stroke="#8A6238" strokeWidth={3} strokeLinecap="round" />
      <Path d={`M 80 ${cy + r * 0.5} L 93 ${cy + r * 0.2}`} stroke="#8A6238" strokeWidth={3} strokeLinecap="round" />
      <Circle cx={80} cy={cy} r={r} fill={v.leaf} />
      <Circle cx={80 - r * 0.5} cy={cy + r * 0.25} r={r * 0.62} fill="#4E9E45" opacity={0.95} />
      <Circle cx={80 + r * 0.52} cy={cy + r * 0.18} r={r * 0.58} fill="#5FA84D" opacity={0.95} />
      <Circle cx={80 + r * 0.1} cy={cy - r * 0.45} r={r * 0.52} fill="#6DB356" opacity={0.9} />
      {m.showFruit &&
        [
          [-0.5, 0.25],
          [0.45, 0.1],
          [0.05, 0.5],
          [-0.15, -0.3],
        ].map(([fx, fy], i) => (
          <Circle
            key={i}
            cx={80 + fx * r}
            cy={cy + fy * r}
            r={5.5 * m.fruitGrow}
            fill={v.fruit}
          />
        ))}
    </G>
  );
}

// ── Tea: dense low plucking bush ───────────────────────────────────────
function TeaBush({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const w = 26 + 30 * m.h;
  const h = 18 + 34 * m.h;
  return (
    <G>
      <Ellipse cx={80} cy={GROUND - h * 0.45} rx={w} ry={h * 0.62} fill="#3E8E41" />
      <Ellipse cx={80 - w * 0.4} cy={GROUND - h * 0.3} rx={w * 0.55} ry={h * 0.45} fill="#4E9E45" />
      <Ellipse cx={80 + w * 0.42} cy={GROUND - h * 0.34} rx={w * 0.5} ry={h * 0.42} fill="#4E9E45" />
      {m.showFruit &&
        [-0.55, -0.2, 0.2, 0.55].map((k, i) => (
          <Path
            key={i}
            d={leafPath(80 + k * w, GROUND - h * 0.85, 9 * m.fruitGrow, 5 * m.fruitGrow, k < 0 ? -1 : 1, -2)}
            fill={v.fruit}
          />
        ))}
    </G>
  );
}

// ── Turmeric / ginger / cardamom: upright leafy clump + rhizome ─────────
function Rhizome({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const n = 5;
  const top = GROUND - 96 * m.h;
  return (
    <G>
      {m.showFruit && (
        <G>
          {[-1, 0, 1].map((k) => (
            <Ellipse
              key={k}
              cx={80 + k * 9}
              cy={GROUND + 9 + Math.abs(k) * 2}
              rx={7 * m.fruitGrow}
              ry={4.5 * m.fruitGrow}
              fill={v.fruit}
            />
          ))}
        </G>
      )}
      {Array.from({ length: n }).map((_, i) => {
        const k = (i - (n - 1) / 2) / ((n - 1) / 2);
        const tipX = 80 + k * 30;
        const tipY = top + Math.abs(k) * 22;
        return (
          <Path
            key={i}
            d={`M 80 ${GROUND} Q ${80 + k * 10} ${(GROUND + tipY) / 2} ${tipX} ${tipY}
                Q ${80 + k * 16} ${(GROUND + tipY) / 2 + 6} 80 ${GROUND} Z`}
            fill={i % 2 ? v.leaf : '#4E9E45'}
          />
        );
      })}
    </G>
  );
}

// ── Climbers on support: pepper, betel, grapes ──────────────────────────
function Climber({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const top = GROUND - 126 * m.h;
  const nodes = Math.max(2, Math.round(5 * m.h));
  return (
    <G>
      <Rect x={76} y={GROUND - 130} width={8} height={130} rx={3} fill="#A88452" />
      {Array.from({ length: nodes }).map((_, i) => {
        const y = GROUND - ((GROUND - top) * (i + 1)) / (nodes + 0.5);
        const dir = i % 2 ? 1 : -1;
        const s = 12 * m.leafScale;
        return (
          <G key={i}>
            <Path
              d={`M ${80 + dir * 4} ${y}
                  C ${80 + dir * (4 + s)} ${y - s * 0.9} ${80 + dir * (4 + s * 1.3)} ${y + s * 0.7} ${80 + dir * 5} ${y + s}
                  C ${80 + dir * (4 - s * 0.5)} ${y + s * 0.5} ${80 + dir * 2} ${y - s * 0.4} ${80 + dir * 4} ${y} Z`}
              fill={i % 2 ? v.leaf : '#3E8E41'}
            />
            {m.showFruit &&
              (v.fruit === '#7B3FA0' ? (
                <G>
                  {[0, 1, 2].map((r) =>
                    [-1, 0, 1].slice(0, 3 - r).map((c) => (
                      <Circle
                        key={`${r}${c}`}
                        cx={80 + dir * 12 + c * 5}
                        cy={y + 10 + r * 5 * m.fruitGrow}
                        r={3 * m.fruitGrow}
                        fill={v.fruit}
                      />
                    ))
                  )}
                </G>
              ) : (
                <Path
                  d={`M ${80 + dir * 8} ${y + 4} L ${80 + dir * 8} ${y + 16 * m.fruitGrow}`}
                  stroke={v.fruit}
                  strokeWidth={3 * m.fruitGrow}
                  strokeLinecap="round"
                />
              ))}
          </G>
        );
      })}
    </G>
  );
}

// ── Flower crops: spray of blooms on slender stems ──────────────────────
function Flower({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const n = 3;
  const top = GROUND - 92 * m.h;
  return (
    <G>
      {Array.from({ length: n }).map((_, i) => {
        const k = i - 1;
        const sx = 80 + k * 20;
        const sy = top + Math.abs(k) * 16;
        return (
          <G key={i}>
            <Path
              d={`M 80 ${GROUND} Q ${80 + k * 10} ${(GROUND + sy) / 2} ${sx} ${sy}`}
              stroke="#4E8C3C"
              strokeWidth={2.6}
              fill="none"
              strokeLinecap="round"
            />
            <Path d={leafPath(80 + k * 6, GROUND - 26, 12 * m.leafScale, 6 * m.leafScale, k >= 0 ? 1 : -1, 3)} fill={v.leaf} />
            {(m.showBloom || m.showFruit) && (
              <G>
                {Array.from({ length: 6 }).map((__, p) => {
                  const a = (p / 6) * Math.PI * 2;
                  const rr = 7 * Math.max(m.bloom, m.fruitGrow);
                  return (
                    <Ellipse
                      key={p}
                      cx={sx + Math.cos(a) * rr}
                      cy={sy + Math.sin(a) * rr}
                      rx={5 * Math.max(m.bloom, m.fruitGrow)}
                      ry={3.4 * Math.max(m.bloom, m.fruitGrow)}
                      rotation={(a * 180) / Math.PI}
                      origin={`${sx + Math.cos(a) * rr}, ${sy + Math.sin(a) * rr}`}
                      fill={v.fruit}
                    />
                  );
                })}
                <Circle cx={sx} cy={sy} r={3.4 * Math.max(m.bloom, m.fruitGrow)} fill="#F2C63C" />
              </G>
            )}
          </G>
        );
      })}
    </G>
  );
}

// ── Sunflower: single tall stalk, one big tracking head ─────────────────
function Sunflower({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const top = GROUND - 124 * m.h;
  return (
    <G>
      <Stem top={top} width={5} color="#4E8C3C" />
      {[-1, 1].map((dir, i) => (
        <Path
          key={dir}
          d={leafPath(80, GROUND - 40 - i * 26, 30 * m.leafScale, 16 * m.leafScale, dir, 6)}
          fill={i ? v.leaf : '#4E9E45'}
        />
      ))}
      {(m.showBloom || m.showFruit) && (
        <G>
          {Array.from({ length: 12 }).map((_, p) => {
            const a = (p / 12) * Math.PI * 2;
            const s = Math.max(m.bloom, m.fruitGrow);
            return (
              <Ellipse
                key={p}
                cx={80 + Math.cos(a) * 15 * s}
                cy={top + Math.sin(a) * 15 * s}
                rx={8 * s}
                ry={4 * s}
                rotation={(a * 180) / Math.PI}
                origin={`${80 + Math.cos(a) * 15 * s}, ${top + Math.sin(a) * 15 * s}`}
                fill={v.fruit}
              />
            );
          })}
          <Circle cx={80} cy={top} r={11 * Math.max(m.bloom, m.fruitGrow)} fill={m.ripe ? '#5A4326' : '#8A6238'} />
        </G>
      )}
    </G>
  );
}

// ── Castor: tall stalk, big palmate leaves, spiky seed capsules ─────────
function Castor({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const top = GROUND - 116 * m.h;
  return (
    <G>
      <Stem top={top} width={5} color="#7A5A3A" />
      {[0, 1, 2].map((i) => {
        const y = top + 16 + i * 30;
        const dir = i % 2 ? 1 : -1;
        const r = 15 * m.leafScale;
        const cx = 80 + dir * 22 * m.leafScale;
        return (
          <G key={i}>
            <Path d={`M 80 ${y} L ${cx} ${y - 6}`} stroke="#7A5A3A" strokeWidth={2} />
            {Array.from({ length: 5 }).map((_, p) => {
              const a = Math.PI + (p / 4) * Math.PI;
              return (
                <Ellipse
                  key={p}
                  cx={cx + Math.cos(a) * r * 0.6}
                  cy={y - 6 + Math.sin(a) * r * 0.6}
                  rx={r * 0.55}
                  ry={r * 0.3}
                  rotation={(a * 180) / Math.PI}
                  origin={`${cx + Math.cos(a) * r * 0.6}, ${y - 6 + Math.sin(a) * r * 0.6}`}
                  fill={p % 2 ? v.leaf : '#4E9E45'}
                />
              );
            })}
          </G>
        );
      })}
      {m.showFruit &&
        [0, 1, 2].map((i) => (
          <Circle key={i} cx={80} cy={top + 6 + i * 9 * m.fruitGrow} r={5 * m.fruitGrow} fill={v.fruit} />
        ))}
    </G>
  );
}

// ── Groundnut: low bush whose pegs push pods under the soil ─────────────
function Groundnut({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const top = GROUND - 58 * m.h;
  return (
    <G>
      {m.showFruit &&
        [-1, 1].map((dir) => (
          <G key={dir}>
            <Path
              d={`M ${80 + dir * 6} ${GROUND} L ${80 + dir * 13} ${GROUND + 16 * m.fruitGrow}`}
              stroke="#C9B79A"
              strokeWidth={1.4}
            />
            <Ellipse
              cx={80 + dir * 14}
              cy={GROUND + 19 * m.fruitGrow}
              rx={5 * m.fruitGrow}
              ry={7.5 * m.fruitGrow}
              fill={v.fruit}
            />
          </G>
        ))}
      {[-1, 1].map((dir) =>
        [0, 1, 2].map((i) => {
          const y = top + i * ((GROUND - top) / 3);
          const s = 9 * m.leafScale;
          const bx = 80 + dir * (10 + i * 4);
          return (
            <G key={`${dir}${i}`}>
              <Path d={`M 80 ${GROUND} Q ${80 + dir * 6} ${y + 6} ${bx} ${y}`} stroke="#4E8C3C" strokeWidth={2} fill="none" />
              <Circle cx={bx} cy={y} r={s} fill={i % 2 ? v.leaf : '#4E9E45'} />
              <Circle cx={bx + dir * s * 0.8} cy={y + s * 0.7} r={s * 0.7} fill="#5FA84D" />
            </G>
          );
        })
      )}
      {m.showBloom && <Circle cx={80} cy={top - 3} r={3 * m.bloom} fill="#F2C63C" />}
    </G>
  );
}

// ── Fine feathery herbs: coriander, fennel, fenugreek, sesame ───────────
function Herb({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const n = 6;
  const top = GROUND - 84 * m.h;
  return (
    <G>
      {Array.from({ length: n }).map((_, i) => {
        const k = (i - (n - 1) / 2) / ((n - 1) / 2);
        const tipX = 80 + k * 26;
        const tipY = top + Math.abs(k) * 18;
        return (
          <G key={i}>
            <Path
              d={`M 80 ${GROUND} Q ${80 + k * 8} ${(GROUND + tipY) / 2} ${tipX} ${tipY}`}
              stroke="#4E8C3C"
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
            />
            {[0.45, 0.7, 0.95].map((f, j) => (
              <Circle
                key={j}
                cx={80 + k * 26 * f}
                cy={GROUND - (GROUND - tipY) * f}
                r={4 * m.leafScale}
                fill={j % 2 ? v.leaf : '#7CC262'}
              />
            ))}
          </G>
        );
      })}
      {m.showFruit &&
        [-1, 0, 1].map((k) => (
          <G key={k}>
            {Array.from({ length: 5 }).map((_, p) => {
              const a = (p / 5) * Math.PI * 2;
              return (
                <Circle
                  key={p}
                  cx={80 + k * 16 + Math.cos(a) * 5 * m.fruitGrow}
                  cy={top - 4 + Math.abs(k) * 12 + Math.sin(a) * 5 * m.fruitGrow}
                  r={1.8 * m.fruitGrow}
                  fill={v.fruit}
                />
              );
            })}
          </G>
        ))}
    </G>
  );
}

// ── Papaya: single slim trunk, crown of lobed leaves, fruit ring ────────
function Papaya({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const top = GROUND - 122 * m.h;
  return (
    <G>
      <Path d={`M 76 ${GROUND} L 78 ${top} L 84 ${top} L 86 ${GROUND} Z`} fill="#8A9E5A" />
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i / 5) * Math.PI - Math.PI / 2;
        const len = 34 * m.leafScale;
        const ex = 80 + Math.sin(a) * len;
        const ey = top - 4 + Math.abs(Math.cos(a)) * 8;
        return (
          <G key={i}>
            <Path d={`M 80 ${top} L ${ex} ${ey}`} stroke="#7A9E4A" strokeWidth={2} />
            <Circle cx={ex} cy={ey} r={10 * m.leafScale} fill={i % 2 ? v.leaf : '#3E8E41'} />
          </G>
        );
      })}
      {m.showFruit &&
        [-1, 0, 1].map((k) => (
          <Ellipse
            key={k}
            cx={80 + k * 11}
            cy={top + 16 + Math.abs(k) * 4}
            rx={6 * m.fruitGrow}
            ry={8.5 * m.fruitGrow}
            fill={v.fruit}
          />
        ))}
    </G>
  );
}

// ── Pineapple: spiky ground rosette with the fruit in the centre ────────
function Pineapple({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const n = 9;
  const len = 30 + 34 * m.h;
  return (
    <G>
      {Array.from({ length: n }).map((_, i) => {
        const k = (i - (n - 1) / 2) / ((n - 1) / 2);
        const tipX = 80 + k * 44;
        const tipY = GROUND - len + Math.abs(k) * 32;
        return (
          <Path
            key={i}
            d={`M 80 ${GROUND} Q ${80 + k * 16} ${GROUND - len * 0.6} ${tipX} ${tipY}
                Q ${80 + k * 20} ${GROUND - len * 0.5} 80 ${GROUND} Z`}
            fill={i % 2 ? v.leaf : '#3E8E41'}
          />
        );
      })}
      {m.showFruit && (
        <G>
          <Ellipse cx={80} cy={GROUND - 20 * m.fruitGrow} rx={12 * m.fruitGrow} ry={17 * m.fruitGrow} fill={v.fruit} />
          {[-0.4, 0.4].map((k, i) =>
            [-0.4, 0.3].map((r, j) => (
              <Circle
                key={`${i}${j}`}
                cx={80 + k * 10 * m.fruitGrow}
                cy={GROUND - 20 * m.fruitGrow + r * 12 * m.fruitGrow}
                r={2.2 * m.fruitGrow}
                fill="#B9822A"
              />
            ))
          )}
          {[-1, 0, 1].map((k) => (
            <Path
              key={k}
              d={`M 80 ${GROUND - 34 * m.fruitGrow} L ${80 + k * 7} ${GROUND - 48 * m.fruitGrow}`}
              stroke="#3E8E41"
              strokeWidth={3}
              strokeLinecap="round"
            />
          ))}
        </G>
      )}
    </G>
  );
}

// ── Drumstick: slender tree with long hanging pods ──────────────────────
function Drumstick({ m, v }) {
  if (m.sprouting) return <Sprout v={v} />;
  const top = GROUND - 126 * m.h;
  return (
    <G>
      <Path d={`M 77 ${GROUND} Q 80 ${(GROUND + top) / 2} 79 ${top} L 84 ${top} Q 83 ${(GROUND + top) / 2} 85 ${GROUND} Z`} fill="#9C8A6A" />
      {[0, 1, 2].map((i) => {
        const y = top + 6 + i * 18;
        const dir = i % 2 ? 1 : -1;
        const len = 32 * m.leafScale;
        return (
          <G key={i}>
            <Path d={`M 80 ${y} Q ${80 + dir * len * 0.6} ${y - 10} ${80 + dir * len} ${y - 4}`} stroke="#5FA84D" strokeWidth={1.6} fill="none" />
            {[0.3, 0.55, 0.8, 1].map((f, j) => (
              <Circle
                key={j}
                cx={80 + dir * len * f}
                cy={y - 6 - Math.sin(f * 3) * 3}
                r={3.4 * m.leafScale}
                fill={j % 2 ? v.leaf : '#4E9E45'}
              />
            ))}
          </G>
        );
      })}
      {m.showFruit &&
        [-1, 1].map((dir) => (
          <Path
            key={dir}
            d={`M ${80 + dir * 10} ${top + 20} Q ${80 + dir * 14} ${top + 44 * m.fruitGrow} ${80 + dir * 9} ${top + 66 * m.fruitGrow}`}
            stroke={v.fruit}
            strokeWidth={4 * m.fruitGrow}
            strokeLinecap="round"
            fill="none"
          />
        ))}
    </G>
  );
}

export const ARCHETYPES = {
  grass: Grass,
  cane: Cane,
  bush: Bush,
  cotton: Cotton,
  legume: Legume,
  vine: Vine,
  sprawl: Sprawl,
  root: Root,
  head: Head,
  broadleaf: Broadleaf,
  palm: Palm,
  tree: Tree,
  teaBush: TeaBush,
  rhizome: Rhizome,
  climber: Climber,
  flower: Flower,
  sunflower: Sunflower,
  castor: Castor,
  groundnut: Groundnut,
  herb: Herb,
  papaya: Papaya,
  pineapple: Pineapple,
  drumstick: Drumstick,
};

export function resolveArchetype(name) {
  return ARCHETYPES[name] || ARCHETYPES.bush;
}

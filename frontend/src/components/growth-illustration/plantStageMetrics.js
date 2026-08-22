// Continuous growth math shared by every archetype renderer.
//
// The key value is `t` — a single 0..1 "how grown is this plant" number
// derived from stage + progress *within* that stage, so the drawing changes
// a little every day rather than snapping only when the stage label flips.

const STAGE_ORDER = ['germination', 'vegetative', 'flowering', 'fruiting', 'harvest', 'completed'];

// Where each stage sits on the 0..1 growth curve. Germination covers very
// little visual height (a sprout), most visible growth happens through
// vegetative, and the plant is at full size from fruiting onward.
const STAGE_T = {
  germination: [0.02, 0.14],
  vegetative: [0.14, 0.68],
  flowering: [0.68, 0.86],
  fruiting: [0.86, 0.97],
  harvest: [0.97, 1.0],
  completed: [1.0, 1.0],
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function getStageMetrics(stage, progressWithinStage = 0.5) {
  const key = STAGE_T[stage] ? stage : 'germination';
  const [from, to] = STAGE_T[key];
  const p = clamp01(progressWithinStage);
  const t = from + (to - from) * p;

  const stageIndex = STAGE_ORDER.indexOf(key);
  const flowering = stageIndex >= STAGE_ORDER.indexOf('flowering');
  const fruiting = stageIndex >= STAGE_ORDER.indexOf('fruiting');
  const harvest = stageIndex >= STAGE_ORDER.indexOf('harvest');

  // Fruit/flower elements fade in over their own stage rather than popping
  // into existence at full size.
  const bloom = flowering && !fruiting ? clamp01(p) : flowering ? 1 : 0;
  const fruitGrow = harvest ? 1 : fruiting ? clamp01(0.35 + p * 0.65) : 0;

  return {
    t,
    h: t, // height factor — archetypes scale their main axis by this
    leafScale: clamp01(0.25 + t * 0.75),
    leafCount: Math.max(1, Math.round(1 + t * 4)),
    showBloom: bloom > 0 && !fruiting,
    bloom,
    showFruit: fruitGrow > 0,
    fruitGrow,
    ripe: harvest,
    sprouting: key === 'germination',
  };
}

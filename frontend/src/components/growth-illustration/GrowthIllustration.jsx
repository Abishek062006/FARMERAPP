import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg from 'react-native-svg';
import SoilBed from './SoilBed';
import IdleSway from './IdleSway';
import WaterCue from './WaterCue';
import { getStageMetrics } from './plantStageMetrics';
import { getCropVisual } from './cropVisuals';
import { resolveArchetype } from './archetypes';

// Draws the crop as it stands today: the right species morphology for this
// crop, sized to its current growth stage, gently swaying, with a water cue
// overlaid when today's watering task is still outstanding.
export default function GrowthIllustration({
  cropName,
  category,
  stage,
  progressWithinStage,
  needsWaterToday,
}) {
  const visual = getCropVisual(cropName, category);
  const metrics = getStageMetrics(stage, progressWithinStage);
  const Plant = resolveArchetype(visual.archetype);

  return (
    <View style={styles.container}>
      <IdleSway style={styles.sway}>
        <Svg width="100%" height="100%" viewBox="0 0 160 200">
          <SoilBed wet={!needsWaterToday} />
          <Plant m={metrics} v={{ ...visual }} />
        </Svg>
      </IdleSway>
      <WaterCue visible={needsWaterToday} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 160,
    height: 200,
    alignSelf: 'center',
  },
  sway: {
    width: '100%',
    height: '100%',
  },
});

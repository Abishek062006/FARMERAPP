import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

const STAGE_COLOR = {
  germination: '#A1887F',
  vegetative: '#66BB6A',
  flowering: '#F4B740',
  fruiting: '#EF6C00',
  harvest: '#4CAF50',
};

// Horizontal stage timeline from the /calendar endpoint — a proportional
// bar per stage (width matches its share of the tracked duration), with
// today's position marked.
export default function GrowthCalendarStrip({ duration, currentDay, phase, stages }) {
  if (!stages || stages.length === 0) return null;

  const trackedDuration = stages[stages.length - 1].endDay;
  const currentDayClamped = Math.min(currentDay, trackedDuration);
  const progressPct = Math.min(100, (currentDayClamped / trackedDuration) * 100);

  return (
    <View style={styles.container}>
      <View style={styles.barTrack}>
        {stages.map((s) => {
          const widthPct = ((s.endDay - s.startDay + 1) / trackedDuration) * 100;
          return (
            <View
              key={s.stage}
              style={[styles.barSegment, { width: `${widthPct}%`, backgroundColor: STAGE_COLOR[s.stage] || '#ccc' }]}
            />
          );
        })}
        <View style={[styles.todayMarker, { left: `${progressPct}%` }]} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.labelsRow}>
        {stages.map((s) => (
          <View key={s.stage} style={styles.labelItem}>
            <View style={[styles.labelDot, { backgroundColor: STAGE_COLOR[s.stage] || '#ccc' }]} />
            <Text style={styles.labelText}>
              {s.stage.charAt(0).toUpperCase() + s.stage.slice(1)} (Day {s.startDay}-{s.endDay})
            </Text>
          </View>
        ))}
      </ScrollView>

      {phase === 'maintenance' && (
        <Text style={styles.maintenanceNote}>
          This crop is past its tracked establishment window — now in low-cadence maintenance mode
          out of {duration} total days.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  barTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'visible',
    position: 'relative',
  },
  barSegment: {
    height: 10,
  },
  todayMarker: {
    position: 'absolute',
    top: -3,
    width: 3,
    height: 16,
    backgroundColor: '#333',
    borderRadius: 1.5,
  },
  labelsRow: {
    marginTop: 10,
  },
  labelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 14,
  },
  labelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  labelText: {
    fontSize: 12,
    color: '#666',
  },
  maintenanceNote: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
    fontStyle: 'italic',
  },
});

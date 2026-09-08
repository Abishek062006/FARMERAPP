import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ORDER_STATE, RUN_STATE, ORDER_SPINE, RUN_SPINE, ORDER_BRANCH_FORK, RUN_BRANCH_FORK,
} from '../utils/runTracking';

// Phase 5, T2 — "ordered / pending / driving / delivered" as a real, glanceable
// widget on an order row. See utils/runTracking.js's own header for why the
// spine is the real Order/Consignment status enum rather than an invented set
// of prettier names, and why a branch (no driver found / cancelled /
// stranded / abandoned) is drawn as a fork off the line rather than as if it
// were just another step on it.
const SHORT_LABEL = {
  awaiting_agent: 'Ordered',
  accepted: 'Driver',
  collecting: 'Collecting',
  picked_up: 'Picked up',
  in_transit: 'On the way',
  delivered: 'Delivered',
};

/**
 * @param status  the real Order or Consignment status
 * @param kind    'order' | 'run' — which enum and spine to read
 * @param compact hides the text labels under each dot, for a tight list row
 */
export default function ProgressStepper({ status, kind = 'order', compact = false }) {
  const spine = kind === 'run' ? RUN_SPINE : ORDER_SPINE;
  const states = kind === 'run' ? RUN_STATE : ORDER_STATE;
  const forkMap = kind === 'run' ? RUN_BRANCH_FORK : ORDER_BRANCH_FORK;

  const onSpine = spine.includes(status);
  const spineIdx = onSpine ? spine.indexOf(status) : -1;
  const forkAt = onSpine ? null : forkMap[status];
  const forkIdx = forkAt ? spine.indexOf(forkAt) : (onSpine ? -1 : -1);
  // Everything up to and including this index was genuinely reached, whether
  // the order is still on the happy path or has since branched off it.
  const reachedIdx = onSpine ? spineIdx : forkIdx;

  const branchState = onSpine ? null : (states[status] || null);

  return (
    <View style={s.wrap}>
      <View style={s.row}>
        {spine.map((step, i) => {
          const reached = i <= reachedIdx;
          const isCurrent = onSpine && i === spineIdx;
          const done = reached && !isCurrent;
          return (
            <React.Fragment key={step}>
              {i > 0 && <View style={[s.line, reached && s.lineDone]} />}
              <View style={s.stepCol}>
                <View style={[
                  s.dot,
                  reached && s.dotDone,
                  isCurrent && { backgroundColor: states[status]?.tone || '#2563EB' },
                ]}>
                  {done ? (
                    <Ionicons name="checkmark" size={11} color="#fff" />
                  ) : isCurrent ? (
                    <View style={s.dotInner} />
                  ) : null}
                </View>
                {!compact && (
                  <Text style={[s.stepLabel, reached && s.stepLabelDone]} numberOfLines={1}>
                    {SHORT_LABEL[step] || step}
                  </Text>
                )}
              </View>
            </React.Fragment>
          );
        })}
      </View>

      {/* ── THE BRANCH, DRAWN AS A FORK, NEVER AS "STEP N+1" ────────────── */}
      {branchState && (
        <View style={s.branchRow}>
          <Ionicons name="arrow-forward" size={11} color={branchState.tone} style={{ transform: [{ rotate: '35deg' }] }} />
          <View style={[s.branchDot, { backgroundColor: branchState.tone }]}>
            <Ionicons name="close" size={9} color="#fff" />
          </View>
          <Text style={[s.branchLabel, { color: branchState.tone }]} numberOfLines={1}>
            {branchState.title}
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  stepCol: { alignItems: 'center', width: 30 },
  line: { flex: 1, height: 2, backgroundColor: '#E2E8F0', marginBottom: 14 },
  lineDone: { backgroundColor: '#16A34A' },
  dot: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
  },
  dotDone: { backgroundColor: '#16A34A' },
  dotInner: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  stepLabel: { fontSize: 8.5, color: '#9CA3AF', marginTop: 3, fontWeight: '600' },
  stepLabelDone: { color: '#16A34A' },

  branchRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 2 },
  branchDot: {
    width: 15, height: 15, borderRadius: 7.5, alignItems: 'center', justifyContent: 'center',
  },
  branchLabel: { fontSize: 10.5, fontWeight: '700' },
});

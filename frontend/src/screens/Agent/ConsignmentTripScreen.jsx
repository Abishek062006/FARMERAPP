import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useKeepAwake } from 'expo-keep-awake';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import usePolling from '../../hooks/usePolling';
import StopOutcomeSheet from '../../components/StopOutcomeSheet';
import {
  OUTCOME, outcomeOf, isVisited, stopKg, carriedKg, visitedCount, collectedCount,
  failedCount, nextPendingStop, allVisited, nothingCollected, isClosed, postDeliver,
  gradeCheckOf, weightMethodOf, isIndependentWeight, isWeighed,
} from '../../utils/stopOutcome';
import {
  bandOf, STALE_STYLE, lastSeenText, isRunLive, postRunLocation,
} from '../../utils/runTracking';
import { startSimulation, bearing } from '../../utils/tripSimulator';

// F1, driver side. The single-pickup stage bar becomes a STOP LIST.
//
// The important property is that each farm has its own code. A driver working
// down this list cannot skip ahead: the crop at stop 3 is only released when
// that farmer reads out their own four digits.
//
// ── PHASE G: A STOP CAN FAIL, AND THE CAPTAIN CAN SAY SO ──────────────────
// This screen used to have exactly one verb — collect — and computed the next
// stop as `stops.find(x => !x.collected)`. A captain who reached farm 3 of 5
// and found nobody home therefore had NO BUTTON: the farm stayed "next"
// forever, the delivery button stayed locked behind it, and the whole run —
// including the crop already on the vehicle — was stuck at the roadside. The
// backend has recorded per-stop outcomes since Phase A; nothing in the app
// could reach them.
//
// Three things changed, and they are the same three the backend enforces:
//   1. THREE OUTCOMES, not a boolean. Everything loaded / only part of it /
//      none of it — each one written to POST /:id/stop-outcome.
//   2. "DONE" IS `outcome !== 'pending'`, NEVER `collected`. A failed stop has
//      been visited and is not coming back. See utils/stopOutcome.js, which is
//      shared with the FPO admin's own run screen so the two cannot drift.
//   3. THE RUN IS FINISHABLE WHEN SOME STOPS FAILED — including when they ALL
//      did. The backend closes an empty run as `cancelled` with no drop code,
//      because nobody reads out a delivery code for an empty vehicle; this
//      screen must not park the captain in front of a code entry that can never
//      be satisfied.
//
// The captain's stack is English throughout (AgentDashboard, AgentTripScreen,
// JobOfferSheet), so this screen stays English inline rather than becoming the
// one Marathi screen in it — the half-translated failure CLAUDE.md records.
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const kgs = (n) => `${Number(n || 0).toLocaleString('en-IN')} kg`;

// Words the captain sees on the outcome sheet. The RULES (which outcomes exist,
// which need a code, what a failure does) live in the shared component and
// utils; only the wording is here.
const L = {
  chooseSub: 'Record what actually happened, at the gate. Each of these is a real record with your '
    + 'name on it, and the farmer will see it.',
  optFullTitle: 'Everything was loaded',
  optFullSub: 'The full ordered quantity went on the vehicle. Needs the farmer\'s own 4-digit code.',
  optShortTitle: 'Only part of it was loaded',
  optShortSub: 'Less than was ordered. You enter the kilograms — and the farmer\'s code, because they '
    + 'are standing right there.',
  optNoneTitle: 'Nothing was loaded',
  optNoneSub: 'Nobody at the gate, not ready, or refused. No code is asked for — see why before you '
    + 'confirm.',

  otpLabel: 'The farmer\'s 4-digit pickup code',
  otpHelp: 'Ask them for their own code. Each farmer on this run has a different one — another '
    + 'farmer\'s code will not release this crop.',
  otpShortHelp: 'A short pickup is still a pickup, and the farmer is at the gate, so their code is '
    + 'still required.',

  shortKgLabel: 'Kilograms actually loaded',
  shortKgHelp: 'More than 0 and less than what was ordered. If nothing at all went on the vehicle, go '
    + 'back and record "nothing was loaded" instead.',
  shortConsequence: 'The farmer is paid for what actually left the farm, not for what was ordered. '
    + 'The rest goes back on sale as their stock. Their share of the fare does not change.',

  reasonTitle: 'Why?',
  reasonAbsent: 'Nobody was at the farm',
  reasonNotReady: 'Less on hand than was listed',
  reasonRejected: 'Not what was sold — refused at the gate',
  reasonOther: 'Something else',

  noteLabel: 'Anything to add? (optional)',
  notePlaceholder: 'e.g. gate locked, phone switched off',

  consequenceTitle: 'What recording this does',
  conseqCancel: 'This farmer\'s order is CANCELLED. Nothing is owed for it and no payment can be '
    + 'recorded against it.',
  conseqRestock: 'Their produce goes back on sale — the kilograms return to their listing, so they '
    + 'can sell it to somebody else.',
  conseqFare: 'their share of the vehicle fare stays on their cancelled order. It is not pushed onto '
    + 'the other farmers: re-splitting it would charge the farmers who did nothing wrong up to 67% '
    + 'more for someone else\'s failure.',
  conseqNoOtp: 'No code is asked for here. The farmer who is not at the gate is exactly the person '
    + 'who cannot read one out — so this is recorded on your word instead of theirs.',
  conseqDispute: 'If it is wrong, the farmer can raise a dispute against this record.',

  submitFull: 'Confirm pickup',
  submitShort: 'Confirm short pickup',
  submitNone: 'Record: nothing collected',

  confirmTitle: 'Cancel this farmer\'s sale?',
  confirmBody: (name) =>
    `${name}'s order will be cancelled and their produce put back on sale. This is recorded against `
    + 'your name and cannot be undone from this screen.',
  confirmYes: 'Yes, record it',

  backLabel: 'Back',
  cancelLabel: 'Cancel',

  errTitle: 'Check this',
  errOtp: 'Enter the farmer\'s 4-digit code.',
  errNumber: 'Enter how many kilograms actually went on the vehicle.',
  errTooHigh: 'That is the whole order or more — record it as "everything was loaded" instead.',
  errReason: 'Pick a reason. It is one tap, and it is what makes this a record rather than a shrug.',
  errGeneric: 'Could not record that. Please try again.',

  // ── HOW THE KILOGRAMS WERE ARRIVED AT ─────────────────────────────────
  // Required for any pickup. `estimated` is written as a plain answer with an
  // affirmation attached, never as a failure: the backend refuses SILENCE, not
  // the absence of a scale, and most farm-gate pickups genuinely have none.
  weightTitle: 'How was this weight arrived at?',
  weightClaim: 'This app does not weigh anything. You are recording HOW the kilograms were '
    + 'established — your account of it, on this run, under your name. Nothing here is checked '
    + 'against a scale and no figure is corrected.',
  wmCentreTitle: 'Weighed on the collection centre scale',
  wmCentreSub: "The FPO's or collection point's own scale. A real weighing, on the seller's group's "
    + 'own instrument — not an independent one.',
  wmBridgeTitle: 'Weighed at a public weighbridge',
  wmBridgeSub: 'A public weighbridge issues a काटा ticket. It is the only weight on this list that '
    + 'does not depend on trusting whoever typed it.',
  wmFarmTitle: "Weighed on the farm's own scale",
  wmFarmSub: "The farmer's own scale or spring balance at the gate. Real, but uncertified and "
    + 'unwitnessed.',
  wmEstTitle: 'Not weighed — bags counted, or judged by eye',
  wmEstSub: 'Nobody put this lot on a scale. The figure is bags or crates counted and multiplied, '
    + 'or an experienced eye.',
  wmEstAffirm: 'This is an honest answer and it is the usual one at a farm gate. Most pickups have '
    + 'no scale within reach, and saying so plainly is right — what must never be recorded is '
    + 'nothing at all, because an unanswered box lets a guess be read as a measurement.',
  wmIndependentTag: 'INDEPENDENT',
  weightRefLabel: 'Weighbridge ticket number (optional)',
  weightRefPlaceholder: 'e.g. MH-1147-2208',
  weightRefHelp: 'A ticket both the farmer and the buyer can produce later. It is stored so a '
    + 'disputed weight can be looked up — this app does not check it.',
  errWeightMethod: 'Say how the weight was arrived at. If nobody weighed it, "not weighed" is an '
    + 'honest answer and this app would rather record that than let a guess pass as a measurement.',

  // ── THE GRADE, AS SEEN AT THE GATE ────────────────────────────────────
  gradeTitle: 'The grade at the gate',
  gradeSub: 'Leave this alone unless you actually looked and the lot is a different grade from what '
    + 'the farmer declared. The common case is that it is what they said it is, and retyping that '
    + 'adds noise, not evidence.',
  gradeDeclaredPrefix: 'The farmer declared: Grade',

  // ── YOU ARE NOT BEING ASKED TO GRADE, AND HERE IS WHY ─────────────────
  // Shown INSTEAD of the grade picker on this screen, which belongs to a
  // captain from the public pool. A missing field reads as an oversight; a
  // stated refusal reads as a decision.
  noGradeTitle: 'You are not asked to grade this lot',
  noGradeBody: 'Grading means judging size, colour uniformity and blemish tolerance against a '
    + 'published standard — a skilled call that carries a price premium, about produce you will '
    + "never see again. This app does not ask a driver to make it. The farmer's declared grade "
    + 'stands, clearly labelled unchecked, and the buyer judges the lot when it arrives. What you '
    + 'CAN record is below: what the lot actually looked like.',

  // ── WHAT THE LOT LOOKED LIKE ──────────────────────────────────────────
  condTitle: 'What did the lot look like?',
  condSub: 'Only what you could see. This is not a grade and it changes no price — it is on the '
    + 'record so the buyer knows what arrived and the farmer knows what was said.',
  condFineTitle: 'I looked — nothing visibly wrong',
  condFineSub: 'A positive statement, and a useful one. It is NOT the same as saying nothing: if '
    + 'you skip this section the record says nobody looked, which is a different fact.',
  condWrongCrop: 'Not the crop ordered',
  condSpoiled: 'Rotten or mouldy',
  condSprouting: 'Sprouting',
  condWet: 'Wet or damp',
  condDamaged: 'Crushed or bruised',
  condPackaging: 'Bags or crates damaged',
  condNotePlaceholder: 'Anything else you saw (optional)',
  condNotAGrade: 'This is an observation, not an inspection and not a grade. No price and no '
    + 'payout changes because of it. If the buyer is unhappy with the lot, a grievance against '
    + 'the order is where that is settled.',
  gradeSameTitle: 'Same as the farmer declared',
  gradeSameSub: 'Nothing new is claimed and nothing is retyped.',
  gradeDiffTitle: 'I looked, and it is a different grade',
  gradeDiffSub: 'Pick what you actually saw. Read what this does before you confirm.',
  gradeNoneTitle: 'No grade — nothing to compare, or I did not look',
  gradeNoneSub: 'Most listings carry no grade at all. This records that no grade was observed, '
    + 'rather than recording you as having confirmed one.',
  errGradeLetter: 'Pick the grade you actually saw — A, B or C.',

  gradeConseqTitle: 'What this does, and what it does not do',
  gradeIsLower: 'That is LOWER than the grade the farmer declared.',
  gradeMaybeLower: 'If this is lower than the grade the farmer declared, this is what happens.',
  gradeDoesRecord: 'It is recorded against this lot and the buyer sees it on their purchase.',
  gradeDoesAsk: 'The farmer is asked to accept or contest it. Only their agreeing counts as '
    + 'evidence anywhere else in the app — your entry on its own is a claim.',
  gradeNotPrice: 'IT CHANGES NO PRICE AND NO PAYOUT. The farmer is paid exactly what they were '
    + 'going to be paid, and the buyer owes exactly what they owed.',
  gradeNotInspection: 'It is what you saw. It is not an inspection and it does not overrule the '
    + "grade on the farmer's listing.",
  gradeGrievance: 'If money is owed either way, it is settled through a grievance against the '
    + 'order — not here.',
  gradeUpgradeNote: 'That is HIGHER than the farmer declared. It is recorded and costs nobody '
    + 'anything: the farmer sold at their own asking price and the buyer is getting at least what '
    + 'they paid for.',

  wmNotRecordedTitle: 'No weighing method recorded',
};

// The recorded provenance, printed on a stop that is already done, so the
// captain can see what went on the record under their own name.
const WEIGHT_LABEL = {
  collection_centre_scale: L.wmCentreTitle,
  public_weighbridge: L.wmBridgeTitle,
  farm_scale: L.wmFarmTitle,
  estimated: L.wmEstTitle,
  not_recorded: L.wmNotRecordedTitle,
};

export default function ConsignmentTripScreen({ route, navigation }) {
  const { consignmentId } = route.params || {};

  // ── EVERY HOOK SITS ABOVE THE FIRST EARLY RETURN (the `if (loading || !c)`
  // at line 381). React counts hooks per render; a hook added below the loading
  // guard runs on the second render and not the first, which is the crash
  // CLAUDE.md records for FarmerSalesScreen. The GPS effect, the simulator
  // teardown and useKeepAwake below are all in this block for that reason.
  // Nothing past line 381 may add one.
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sheetStop, setSheetStop] = useState(null);   // the stop being recorded
  const [busy, setBusy] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [dropOtp, setDropOtp] = useState('');
  const [simulating, setSimulating] = useState(false);

  // Expo Go has no background location: the OS stops the GPS watch the moment
  // the screen locks. Keeping the screen awake is the only mitigation available
  // here; the banner below tells the captain the rest, and the buyer's map says
  // "last seen N min ago" rather than pretending.
  useKeepAwake();

  const seq = useRef(0);
  const stopSim = useRef(null);
  const lastPos = useRef(null);

  const fetchIt = useCallback(async () => {
    try {
      const r = await axios.get(`${API_ENDPOINTS.CONSIGNMENTS}/${consignmentId}`);
      if (r.data.success) setC(r.data.consignment);
    } finally {
      setLoading(false);
    }
  }, [consignmentId]);

  usePolling(fetchIt, 8000, true);

  // ── GAP A2: THE CAPTAIN HAD NOWHERE TO POST A POSITION ON A RUN ─────────
  //
  // Location was posted to `/api/orders/:id/location`, but a consignment spans
  // N orders and there was no correct id to post to — so a buyer of a 2-tonne
  // five-farm lot got LESS visibility than someone buying 50 kg from one
  // farmer. `POST /api/consignments/:id/location` is the endpoint that fixes
  // it, and this is the only thing in the app that calls it from a captain's
  // phone.
  //
  // `seq` is a monotonic COUNTER, not a timestamp — mobile networks reorder
  // packets, so without an ordering guard the buyer's marker jumps backwards,
  // and a phone clock wrong by minutes would freeze it permanently.
  const running = !!c && isRunLive(c.status);

  const report = useCallback(async (lat, lng, heading, simulated) => {
    lastPos.current = { lat, lng, heading };
    seq.current += 1;
    await postRunLocation(consignmentId, { lat, lng, heading, seq: seq.current, simulated });
  }, [consignmentId]);

  useEffect(() => {
    if (!running || simulating) return undefined;
    let sub;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 20 },
        (fix) => {
          const p = { lat: fix.coords.latitude, lng: fix.coords.longitude };
          const head = fix.coords.heading ?? (lastPos.current ? bearing(lastPos.current, p) : 0);
          report(p.lat, p.lng, head, false);
        }
      );
    })();
    return () => { cancelled = true; if (sub) sub.remove(); };
  }, [running, simulating, report]);

  useEffect(() => () => { if (stopSim.current) stopSim.current(); }, []);

  // Walks the stored route through the SAME endpoint a real phone uses. Every
  // position it posts carries `simulated: true`, and the buyer's map prints
  // that on screen — a demo drive is never passed off as a vehicle.
  const toggleSim = useCallback(() => {
    if (stopSim.current) {
      stopSim.current();
      stopSim.current = null;
      setSimulating(false);
      return;
    }
    const line = c?.routePolyline;
    if (!line || line.length < 2) {
      return Alert.alert('No route to simulate', 'This run has no stored route line.');
    }
    setSimulating(true);
    stopSim.current = startSimulation({
      polyline: line,
      kmph: 40,
      tickMs: 5000,
      onMove: (p) => report(p.lat, p.lng, p.heading, true),
    });
  }, [c?.routePolyline, report]);

  const onRecorded = useCallback((data) => {
    setSheetStop(null);
    if (data.consignment) setC(data.consignment);

    const left = data.remaining;
    const tail = left === 0
      ? (data.collectedQuantityKg === 0
        ? 'Every farm has been visited and nothing was collected — close the run below.'
        : `Every farm has been visited. ${kgs(data.collectedQuantityKg)} aboard — drive to the buyer.`)
      : `${left} farm${left === 1 ? '' : 's'} still to visit.`;

    if (data.outcome === OUTCOME.NONE) {
      Alert.alert('Recorded as not collected',
        `That order is cancelled and the produce is back on sale. ${tail}`);
    } else if (data.outcome === OUTCOME.SHORT) {
      Alert.alert('Short pickup recorded',
        `${kgs(data.stop?.collectedKg)} loaded of ${kgs(data.stop?.quantityKg)} ordered. ${tail}`);
    } else {
      Alert.alert('Collected', tail);
    }
  }, []);

  const deliver = async () => {
    if (dropOtp.length !== 4) return Alert.alert('4 digits', "Enter the buyer's 4-digit code.");
    setBusy(true);
    try {
      const r = await postDeliver(consignmentId, dropOtp);
      if (r.data.success) {
        setDropOpen(false);
        const short = r.data.shortfallKg > 0
          ? `\n\nDelivered ${kgs(r.data.collectedQuantityKg)} of the ${kgs(r.data.plannedQuantityKg)} planned — `
            + `${r.data.stopsFailed || 0} farm(s) collected nothing, ${r.data.stopsShort || 0} collected short.`
          : '';
        Alert.alert('Trip complete 🎉',
          `${money(c.fare?.agentPayout ?? c.fare?.total)} earned. Collect ${money(c.fare?.total)} cash from the buyer — the FARE only. Each farmer is paid for their crop by the buyer directly.${short}`,
          [{ text: 'Done', onPress: () => navigation.goBack() }]);
      }
    } catch (e) {
      Alert.alert('Could not finish', e.response?.data?.error || 'Please try again.');
      fetchIt();
    } finally {
      setBusy(false);
    }
  };

  // NOTHING WAS COLLECTED ANYWHERE. There is no handover and no code to ask
  // for, so the captain is not sent to the mandi to stand in front of an OTP
  // box that can never be satisfied. The backend closes the run as `cancelled`
  // and frees the captain's active-job slot.
  const closeEmpty = () => {
    Alert.alert(
      'Close this run with nothing aboard?',
      'No farm on this run handed over any produce, so there is nothing to deliver and no buyer code '
      + 'to ask for. Every order has already been cancelled with the reason you recorded. This ends '
      + 'the job and frees you for the next one.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Close the run',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const r = await postDeliver(consignmentId, null);
              if (r.data.success) {
                Alert.alert('Run closed', r.data.note || 'Nothing was collected on this run.',
                  [{ text: 'Done', onPress: () => navigation.goBack() }]);
              }
            } catch (e) {
              Alert.alert('Could not close it', e.response?.data?.error || 'Please try again.');
              fetchIt();
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  if (loading || !c) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;

  const stops = c.stops || [];
  const visited = visitedCount(stops);
  const collected = collectedCount(stops);
  const failed = failedCount(stops);
  const aboard = carriedKg(stops);
  const everyStopVisited = allVisited(stops);
  const emptyRun = everyStopVisited && nothingCollected(stops);
  const next = nextPendingStop(stops);
  const closed = isClosed(c);
  const left = stops.length - visited;

  // Age of the last fix that actually landed — derived from the run document
  // this screen already polls, so no extra call.
  const posAgeSec = c.tracking?.updatedAt
    ? Math.round((Date.now() - new Date(c.tracking.updatedAt)) / 1000) : null;
  const posBand = bandOf({ ageSec: posAgeSec });
  const posTone = STALE_STYLE[posBand];
  const posText = lastSeenText(posAgeSec, {
    never: 'No position sent yet',
    live: 'Your position is live',
    moment: 'Position sent a moment ago',
    min: (n) => `Position last sent ${n} min ago`,
    hr: (h, m) => `Position last sent ${h} hr${h === 1 ? '' : 's'}${m ? ` ${m} min` : ''} ago`,
  });

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.card}>
          <View style={s.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{stops.length}-farm run</Text>
              <Text style={s.sub}>
                {c.distanceKm} km · ~{c.durationMin} min · {kgs(c.totalQuantityKg)} planned
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.earnLabel}>YOU EARN</Text>
              <Text style={s.earn}>{money(c.fare?.agentPayout ?? c.fare?.total)}</Text>
            </View>
          </View>

          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${(visited / stops.length) * 100}%` }]} />
          </View>
          {/* VISITED, not collected. A failed farm is behind you. */}
          <Text style={s.progressText}>
            {visited} of {stops.length} farms visited
            {failed > 0 ? ` · ${collected} collected, ${failed} collected nothing` : ''}
          </Text>
          <Text style={s.aboardText}>
            {kgs(aboard)} aboard
            {aboard !== c.totalQuantityKg && visited > 0
              ? ` · ${kgs(c.totalQuantityKg - aboard)} short of the plan`
              : ''}
          </Text>

          {/* ── THE BUYER IS WATCHING THIS RUN ────────────────────────────
              What the captain sees here is exactly what the buyer sees: the
              age of the last fix that actually landed. Nothing is smoothed or
              carried forward on either side, so a captain whose app has been
              shut for twenty minutes can tell that the buyer knows. */}
          {running && (
            <View style={s.posBlock}>
              <View style={s.posHead}>
                <View style={[s.posDot, { backgroundColor: posTone.dot }]} />
                <Text style={[s.posTitle, { color: posTone.fg }]}>{posText}</Text>
              </View>
              <Text style={s.posSub}>
                The buyer and the farmers on this run see your position while this screen is open.
                Locking the phone or switching apps stops it — their map says "last seen N min ago"
                rather than showing a vehicle that is not moving.
              </Text>
              <TouchableOpacity
                style={[s.simBtn, simulating && s.simBtnOn]}
                onPress={toggleSim} activeOpacity={0.85}
              >
                <Ionicons name={simulating ? 'pause' : 'play'} size={13} color={simulating ? '#fff' : '#5B21B6'} />
                <Text style={[s.simText, simulating && { color: '#fff' }]}>
                  {simulating ? 'Simulating the drive' : 'Simulate the drive'}
                </Text>
              </TouchableOpacity>
              {simulating && (
                <Text style={s.posSub}>
                  Every position sent while this is on is labelled as simulated, and the buyer's map
                  says so on screen.
                </Text>
              )}
            </View>
          )}
        </View>

        {stops.map((st, i) => {
          const outcome = outcomeOf(st);
          const done = isVisited(st);
          const isNext = !done && next && String(next.orderId) === String(st.orderId);
          const isFail = outcome === OUTCOME.NONE;
          const isShortStop = outcome === OUTCOME.SHORT;
          return (
            <View
              key={String(st.orderId)}
              style={[
                s.stop,
                done && !isFail && s.stopDone,
                isFail && s.stopFailed,
                isNext && s.stopNext,
              ]}
            >
              <View style={s.stopLeft}>
                <View style={[
                  s.stopNum,
                  done && !isFail && s.stopNumDone,
                  isFail && s.stopNumFailed,
                  isNext && s.stopNumNext,
                ]}>
                  {done
                    ? <Ionicons name={isFail ? 'close' : 'checkmark'} size={15} color="#fff" />
                    : <Text style={[s.stopNumText, isNext && { color: '#fff' }]}>{i + 1}</Text>}
                </View>
                {i < stops.length - 1 && <View style={s.stopLine} />}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={s.stopName}>{st.farmerName}</Text>
                <Text style={s.stopMeta}>
                  {kgs(st.quantityKg)} {st.cropName}
                  {st.legKm != null ? ` · ${st.legKm} km from previous` : ''}
                </Text>
                {!!st.label && <Text style={s.stopMeta}>{st.label}</Text>}

                {done ? (
                  <View>
                    <Text style={[s.stopDoneText, isFail && { color: '#B91C1C' }, isShortStop && { color: '#B45309' }]}>
                      {isFail
                        ? 'Collected nothing'
                        : isShortStop
                          ? `Short — ${kgs(stopKg(st))} of ${kgs(st.quantityKg)}`
                          : 'Collected in full'}
                      {st.outcomeAt || st.collectedAt
                        ? ` · ${new Date(st.outcomeAt || st.collectedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                    </Text>
                    {!!st.failureReason && (
                      <Text style={s.stopReason}>{L[{
                        farmer_absent: 'reasonAbsent',
                        quantity_not_ready: 'reasonNotReady',
                        produce_rejected: 'reasonRejected',
                        other: 'reasonOther',
                      }[st.failureReason]] || st.failureReason}</Text>
                    )}
                    {!!st.outcomeNote && <Text style={s.stopReason}>“{st.outcomeNote}”</Text>}

                    {/* WHAT WENT ON THE RECORD UNDER YOUR NAME. A kilogram
                        figure never appears on this screen without the
                        provenance beside it — that is the whole point of the
                        field. `not_recorded` prints as itself, never as an
                        estimate somebody made. */}
                    {!isFail && !!weightMethodOf(st) && (
                      <Text style={s.stopProv}>
                        {WEIGHT_LABEL[weightMethodOf(st)] || weightMethodOf(st)}
                        {st.weight?.ref ? ` · ticket ${st.weight.ref}` : ''}
                        {isWeighed(weightMethodOf(st)) && !isIndependentWeight(weightMethodOf(st))
                          ? ' · not independent' : ''}
                      </Text>
                    )}
                    {!isFail && (() => {
                      const g = gradeCheckOf(st.grade);
                      if (!g.observed && !g.declared) return null;
                      return (
                        <Text style={[s.stopProv, g.downgraded && { color: '#B45309', fontWeight: '700' }]}>
                          {g.downgraded
                            ? `Grade ${g.declared} declared, Grade ${g.observed} recorded — no price changed`
                            : g.discrepancy === 'upgrade'
                              ? `Grade ${g.declared} declared, Grade ${g.observed} recorded`
                              : g.discrepancy === 'observed_only'
                                ? `Grade ${g.observed} recorded — the farmer declared none`
                                : `Grade ${g.observed} — matches what was declared`}
                        </Text>
                      );
                    })()}
                  </View>
                ) : (
                  <View style={s.stopActions}>
                    {!!st.farmerPhone && (
                      <TouchableOpacity style={s.callBtn} onPress={() => Linking.openURL(`tel:${st.farmerPhone}`)}>
                        <Ionicons name="call" size={13} color="#2563EB" />
                        <Text style={s.callText}>Call</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[s.collectBtn, !isNext && s.collectBtnMuted]}
                      onPress={() => setSheetStop(st)}
                      activeOpacity={0.85}
                      disabled={closed}
                    >
                      <Text style={[s.collectText, !isNext && { color: '#6B7280' }]}>
                        Record what happened
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        <View style={s.card}>
          <Text style={s.sectionTitle}>Deliver to</Text>
          <Text style={s.dropLabel}>{c.dropoff?.label || c.dropoff?.district || 'Buyer'}</Text>
          <Text style={s.stopMeta}>{c.vendorName}</Text>
          {!!c.vendorPhone && (
            <TouchableOpacity style={s.callRow} onPress={() => Linking.openURL(`tel:${c.vendorPhone}`)}>
              <Ionicons name="call-outline" size={14} color="#2563EB" />
              <Text style={s.callText}>Call the buyer</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* The cash line has to change when the vehicle is empty: there is no
            handover, so there is nobody at the mandi to collect from. */}
        {emptyRun ? (
          <View style={[s.codBox, { backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
            <Text style={[s.codText, { color: '#7F1D1D' }]}>
              Nothing was collected on this run, so there is no handover and no cash to collect at the
              mandi. Each farmer's order is cancelled with the reason you recorded, and each keeps its
              share of the fare on that cancelled order.
            </Text>
          </View>
        ) : (
          <View style={s.codBox}>
            <Ionicons name="cash-outline" size={18} color="#C2410C" />
            <Text style={s.codText}>
              Collect <Text style={{ fontWeight: '800' }}>{money(c.fare?.total)}</Text> cash from the
              buyer — the transport fare only. Each farmer is paid for their crop by the buyer directly.
              {failed > 0 ? ' The fare does not change when a farm collects nothing: each stop keeps the '
                + 'share it was quoted.' : ''}
            </Text>
          </View>
        )}

        {closed ? (
          <View style={s.closedBox}>
            <Ionicons name={c.status === 'delivered' ? 'checkmark-done' : 'close-circle-outline'}
              size={18} color="#6B7280" />
            <Text style={s.closedText}>
              {c.status === 'delivered' ? 'This run has been delivered.' : 'This run is closed.'}
            </Text>
          </View>
        ) : emptyRun ? (
          <TouchableOpacity
            style={[s.deliverBtn, { backgroundColor: '#B91C1C' }, busy && { opacity: 0.6 }]}
            onPress={closeEmpty} disabled={busy} activeOpacity={0.85}
          >
            <Ionicons name="close-circle-outline" size={18} color="#fff" />
            <Text style={s.deliverText}>Close this run — nothing collected</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.deliverBtn, !everyStopVisited && { opacity: 0.45 }]}
            onPress={() => everyStopVisited ? setDropOpen(true)
              : Alert.alert('Farms still to visit',
                  `Record what happened at ${stops.filter((x) => !isVisited(x)).map((x) => x.farmerName).join(', ')} first. `
                  + 'A farm you could not collect from still needs a record — that is what lets the run finish.')}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
            <Text style={s.deliverText}>
              {everyStopVisited
                ? `Deliver ${kgs(aboard)} to the buyer`
                : `${left} farm${left > 1 ? 's' : ''} left to visit`}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <StopOutcomeSheet
        visible={!!sheetStop}
        stop={sheetStop}
        consignmentId={consignmentId}
        L={L}
        recorderLine="It will be recorded as: the captain who came to the gate — your name, on this run, at this time."
        // An FPO grade lot carries ONE declared grade for the whole run. A run
        // pooling a buyer's own orders carries none, and the sheet then names
        // no letter rather than inventing one — the backend reads the real
        // declaration off each listing when it writes the record.
        declaredGrade={c.lot?.gradeCode || null}
        // ⚠️ HARD FALSE, AND NOT A VARIABLE. This screen belongs to a captain
        // from the public pool, always. This app does not ask a truck driver
        // to certify size, colour uniformity and blemish tolerance on somebody
        // else's crop — the server refuses it (409 GRADING_NOT_AVAILABLE) and
        // the sheet shows the reason instead of an empty space. What a captain
        // CAN record is visible CONDITION, which the sheet offers to everyone.
        canGrade={false}
        onClose={() => setSheetStop(null)}
        onRecorded={onRecorded}
      />

      <Modal visible={dropOpen} transparent animationType="fade" onRequestClose={() => setDropOpen(false)}>
        <View style={s.modalWrap}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Buyer's delivery code</Text>
            <Text style={s.modalSub}>
              Ask {c.vendorName} for their 4-digit code.
              {failed > 0
                ? ` You are handing over ${kgs(aboard)} of the ${kgs(c.totalQuantityKg)} planned — the farms that collected nothing are already recorded.`
                : ''}
            </Text>
            <TextInput
              style={s.otpInput} value={dropOtp} onChangeText={setDropOtp}
              keyboardType="number-pad" maxLength={4} placeholder="0000"
              placeholderTextColor="#D1D5DB" autoFocus
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.mBtn, s.mGhost]} onPress={() => setDropOpen(false)}>
                <Text style={s.mGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.mBtn, s.mPrimary, busy && { opacity: 0.6 }]}
                onPress={deliver} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.mPrimaryText}>Finish trip</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  scroll: { padding: 16, gap: 12 },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  headRow: { flexDirection: 'row', gap: 10 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  earnLabel: { fontSize: 9.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.4 },
  earn: { fontSize: 20, fontWeight: '900', color: '#15803D' },

  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#F1F5F9', marginTop: 14, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  progressText: { fontSize: 12, color: '#6B7280', marginTop: 6 },
  aboardText: { fontSize: 12, fontWeight: '700', color: '#15803D', marginTop: 3 },

  posBlock: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12, gap: 6 },
  posHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  posDot: { width: 8, height: 8, borderRadius: 4 },
  posTitle: { fontSize: 13, fontWeight: '800' },
  posSub: { fontSize: 11.5, color: '#9CA3AF', lineHeight: 16 },
  simBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#F5F3FF', borderRadius: 10, paddingVertical: 9, marginTop: 2,
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  simBtnOn: { backgroundColor: '#6D28D9', borderColor: '#6D28D9' },
  simText: { fontSize: 12, fontWeight: '700', color: '#5B21B6' },

  stop: {
    flexDirection: 'row', gap: 12, backgroundColor: '#fff',
    borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: '#F1F5F9',
  },
  stopDone: { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' },
  stopFailed: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  stopNext: { borderColor: '#16A34A' },
  stopLeft: { alignItems: 'center', width: 26 },
  stopNum: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  stopNumDone: { backgroundColor: '#16A34A' },
  stopNumFailed: { backgroundColor: '#B91C1C' },
  stopNumNext: { backgroundColor: '#16A34A' },
  stopNumText: { fontSize: 13, fontWeight: '800', color: '#9CA3AF' },
  stopLine: { flex: 1, width: 2, backgroundColor: '#F1F5F9', marginTop: 4 },

  stopName: { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  stopMeta: { fontSize: 12.5, color: '#6B7280', marginTop: 2 },
  stopDoneText: { fontSize: 12.5, fontWeight: '600', color: '#15803D', marginTop: 6 },
  stopProv: { fontSize: 11, color: '#6B7280', marginTop: 3, lineHeight: 15.5 },
  stopReason: { fontSize: 11.5, color: '#6B7280', marginTop: 3, fontStyle: 'italic' },
  stopActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#DBEAFE', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7,
  },
  callText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  collectBtn: { flex: 1, backgroundColor: '#16A34A', borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  collectBtnMuted: { backgroundColor: '#F1F5F9' },
  collectText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },

  sectionTitle: {
    fontSize: 10.5, fontWeight: '800', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
  },
  dropLabel: { fontSize: 16, fontWeight: '700', color: '#111827' },
  callRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },

  codBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 9,
    backgroundColor: '#FFF7ED', borderRadius: 14, padding: 13,
  },
  codText: { flex: 1, fontSize: 12.5, color: '#7C2D12', lineHeight: 18 },

  closedBox: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: '#F1F5F9', borderRadius: 14, padding: 13,
  },
  closedText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#6B7280' },

  deliverBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 15,
  },
  deliverText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  modalWrap: { flex: 1, backgroundColor: 'rgba(17,24,39,0.5)', alignItems: 'center', justifyContent: 'center', padding: 26 },
  modal: { backgroundColor: '#fff', borderRadius: 20, padding: 22, width: '100%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  modalSub: { fontSize: 12.5, color: '#6B7280', marginTop: 6, lineHeight: 18 },
  otpInput: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14,
    fontSize: 30, fontWeight: '800', color: '#111827', textAlign: 'center',
    letterSpacing: 12, paddingVertical: 13, marginTop: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  mBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  mGhost: { backgroundColor: '#F1F5F9' },
  mGhostText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  mPrimary: { backgroundColor: '#16A34A' },
  mPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

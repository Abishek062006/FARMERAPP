import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useKeepAwake } from 'expo-keep-awake';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';
import usePolling from '../../hooks/usePolling';
import StopOutcomeSheet from '../../components/StopOutcomeSheet';
import {
  OUTCOME, outcomeOf, isVisited, stopKg, carriedKg, visitedCount, collectedCount,
  failedCount, nextPendingStop, allVisited, nothingCollected, isClosed, runActorRole,
  canRecordAs, canPostPositionAs, postDeliver,
  gradeCheckOf, weightMethodOf, isWeighed, isIndependentWeight,
  // WHO MAY PUT A LETTER ON A LOT. An FPO's own driver or office may; a
  // captain from the public pool may not. Same rule the server applies.
  mayGradeAtGate,
} from '../../utils/stopOutcome';
import {
  bandOf, STALE_STYLE, lastSeenText, isRunLive, postRunLocation,
  assignRunDriver, unassignRunDriver, driverBlockOf,
} from '../../utils/runTracking';
import { startSimulation, bearing } from '../../utils/tripSimulator';

// PHASE G — THE RUN NOBODY COULD FINISH FROM THE APP.
//
// Phase B made transport a MODE: `hired` dispatches to the captain pool, while
// `own` and `contracted` are the FPO's own vehicle or its regular transporter.
// An own/contracted run has NO agent by design, so `resolveRunActor()` lets the
// arranging group's admin record stop outcomes and hand the load over — which
// is exactly what a paper trip sheet is, and how this works on the ground.
//
// That authorisation existed and NO SCREEN EXPOSED IT. An agentless run could
// be created and then never advanced: no outcome could be recorded from the
// app, no delivery made, and the run sat in `accepted` forever. A run this app
// cannot finish is worse than one it never offered.
//
// WHY IT IS SAFE TO SHOW THIS TO AN FPO ADMIN, and how it stays narrow:
//   • The recording controls render ONLY when `runActorRole(run) ===
//     'fpo_admin'` — no agent on the run, transportMode own/contracted, an
//     fpoId set. On a HIRED run the captain's account is the only one allowed
//     and this screen is read-only, saying so in words. The server refuses an
//     FPO admin there anyway (403 AGENT_ONLY); this is the same rule stated
//     early so nobody taps into a refusal.
//   • THE FARMER'S OWN PICKUP CODE IS STILL REQUIRED for any collection. The
//     admin is not a skeleton key — the codes never move onto the consignment.
//   • A failed stop is recorded on the admin's word, and the record says so:
//     `outcomeByRole: 'fpo_admin'`. "The captain at your gate says nobody was
//     home" and "your own group's office says so" are different claims, and a
//     farmer disputing one is entitled to know which was made.
//
// GET /api/consignments/:id already treats the arranging group's admin as a
// party to an agentless run, so this screen needs no new endpoint. On a run
// they are NOT a party to it returns 403, which is rendered as the explanation
// rather than as a failure.
//
// ═══════════════════════════════════════════════════════════════════════════
// TIER 2 / GAP B — THE SAME SCREEN, NOW ALSO FOR THE PERSON AT THE GATE.
// ═══════════════════════════════════════════════════════════════════════════
//
// `Consignment.transport.driverUid` promotes the FPO's driver from a name on a
// trip sheet to a real account. They get the stop list, each farmer's own OTP
// field, `stop-outcome`, `deliver` — and, uniquely, the position ping, because
// they are the only person actually in the vehicle.
//
// ⚠️ WHY THIS IS THIS SCREEN AND NOT Agent/ConsignmentTripScreen.
//   The captain's trip screen implements the same interaction and the obvious
//   move was to reuse it. It was checked first, and three things make it the
//   wrong host for an FPO driver:
//     1. IT IS ENGLISH BY A RECORDED PRODUCT DECISION ("the captain's stack is
//        English throughout … rather than becoming the one Marathi screen in
//        it"). An FPO driver is farmer-side and reads Marathi. Threading a
//        label bag through it would put the captain's own copy at the mercy of
//        every future edit to a farmer screen.
//     2. IT FRAMES THE RUN AS PAID CAPTAIN WORK — "YOU EARN ₹x" from
//        `fare.agentPayout`, "collect ₹x cash from the buyer". On an
//        own/contracted run `fare.base`/`perKm`/`distanceCharge` are NULL by
//        design (a stated cost, not a captain-priced one) and the driver is on
//        the group's payroll collecting nothing. Those lines would be false.
//     3. IT LIVES IN THE AGENT NAVIGATOR, which a farmer-role driver never
//        enters — and `FPO_DRIVER_ROLES` admits exactly `farmer` and `agent`.
//   What must not drift between the two IS shared, and already was: the outcome
//   rules (`utils/stopOutcome.js`), the panel that tells a recorder what they
//   are about to do to somebody's sale (`components/StopOutcomeSheet`), and now
//   the position contract (`utils/runTracking.js`). That is the same split
//   StopOutcomeSheet was created under — the RULES in one place, the WORDS with
//   the screen.
//
// THE OFFICE-SIDE FALLBACK DOES NOT GO AWAY when a driver is assigned. A flat
// phone still has to be able to get the load to the mandi, so BOTH paths stay
// live on the same run and `outcomeByRole` records which one was used.
//
// ⚠️ THE OFFICE MAY NOT POST A POSITION, AND THAT IS DELIBERATE. Recording a
// stop from the office is a report of something that happened; posting a
// coordinate from the office would be inventing one. The server refuses it by
// name (403 NOT_IN_THE_VEHICLE) and this screen never offers it.

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const kgs = (n) => `${Number(n || 0).toLocaleString('en-IN')} kg`;

const REASON_KEY = {
  farmer_absent: 'fpoRun.reasonAbsent',
  quantity_not_ready: 'fpoRun.reasonNotReady',
  produce_rejected: 'fpoRun.reasonRejected',
  other: 'fpoRun.reasonOther',
};

// The recorded weight provenance, for a stop that is already done.
// `not_recorded` has its own key and is never printed as `estimated`: "somebody
// judged it by eye" and "the app never asked" are different facts.
const WEIGHT_KEY = {
  collection_centre_scale: 'fpoRun.wmCentreTitle',
  public_weighbridge: 'fpoRun.wmBridgeTitle',
  farm_scale: 'fpoRun.wmFarmTitle',
  estimated: 'fpoRun.wmEstTitle',
  not_recorded: 'fpoRun.wmNotRecordedTitle',
};

export default function FpoRunScreen({ route, navigation }) {
  const { t } = useLanguage();
  const { consignmentId, userData } = route.params || {};
  // `uid`, NOT `firebaseUid` — CLAUDE.md: frontend userData carries `uid`.
  const myUid = userData?.uid || userData?.firebaseUid || null;

  // ── EVERY HOOK IS ABOVE THE FIRST EARLY RETURN. The last hook is the
  // `unassign` useCallback at line 453; the first early return is
  // `if (loading)` at line 474. The hook count must be identical on the
  // loading render and every render after it — the crash CLAUDE.md records for
  // FarmerSalesScreen came from one useEffect added below a
  // `if (loading) return`. The GPS effect, the simulator teardown, useKeepAwake
  // and the three driver-assignment callbacks are all in this block for exactly
  // that reason; nothing past line 474 may add a hook.
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  // A CODE, not a sentence: the sentence is chosen at render time in the
  // current language, so the error text follows the language toggle.
  const [errCode, setErrCode] = useState(null);
  const [sheetStop, setSheetStop] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [dropOtp, setDropOtp] = useState('');
  // THE SERVER'S OWN ANSWER to "who am I on this run" — it knows things the
  // document alone cannot (whether this account administers the group). The
  // client-side `runActorRole()` is only the fallback.
  const [viewerRole, setViewerRole] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [pinged, setPinged] = useState(null);      // when this device last posted
  // Driver assignment, admin side.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [membersErr, setMembersErr] = useState(false);
  const [vehicleNo, setVehicleNo] = useState('');
  const [driverBusy, setDriverBusy] = useState(false);

  // Expo Go has no background location, so the OS stops the GPS watch the
  // moment the screen locks. Keeping the screen awake is the only mitigation
  // available; the banner tells the driver the rest. Called unconditionally —
  // it is a hook.
  useKeepAwake();

  const seq = useRef(0);
  const stopSim = useRef(null);
  const lastPos = useRef(null);

  const fetchIt = useCallback(async () => {
    try {
      const r = await axios.get(`${API_ENDPOINTS.CONSIGNMENTS}/${consignmentId}`);
      if (r.data?.success) {
        setC(r.data.consignment);
        setViewerRole(r.data.viewerRole || null);
        setErrCode(null);
      } else setErrCode('LOAD');
    } catch (e) {
      setErrCode(e.response?.status === 403 ? 'FORBIDDEN' : 'LOAD');
    } finally {
      setLoading(false);
    }
  }, [consignmentId]);

  usePolling(fetchIt, 10000, true);

  // WHO THIS VIEWER IS. The server's word first; `runActorRole` is the fallback
  // for a payload written before `viewerRole` existed.
  const role = viewerRole || runActorRole(c, myUid);
  const runLive = !!c && isRunLive(c.status);
  // The office may record; only the vehicle may report a position.
  const driving = canPostPositionAs(role) && runLive;

  // ── THE POSITION PING ──────────────────────────────────────────────────
  // `seq` is a monotonic COUNTER, not a timestamp: mobile networks reorder
  // packets, so without an ordering guard the marker jumps backwards, and a
  // phone clock wrong by minutes would freeze it permanently. Same contract as
  // the single-order ping in AgentTripScreen.
  const report = useCallback(async (lat, lng, heading, simulated) => {
    lastPos.current = { lat, lng, heading };
    seq.current += 1;
    const r = await postRunLocation(consignmentId, {
      lat, lng, heading, seq: seq.current, simulated,
    });
    if (r.applied) setPinged(Date.now());
  }, [consignmentId]);

  // Real GPS, while this device is the one in the vehicle and the run is live.
  useEffect(() => {
    if (!driving || simulating) return undefined;
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
  }, [driving, simulating, report]);

  useEffect(() => () => { if (stopSim.current) stopSim.current(); }, []);

  // The simulator drives the SAME endpoint — only the GPS chip is replaced, and
  // every position it posts is flagged `simulated: true` so the buyer's map
  // says so on screen rather than passing it off as a real vehicle.
  const toggleSim = useCallback(() => {
    if (stopSim.current) {
      stopSim.current();
      stopSim.current = null;
      setSimulating(false);
      return;
    }
    const line = c?.routePolyline;
    if (!line || line.length < 2) {
      Alert.alert(t('fpoRun.errTitle'), t('fpoRun.noRouteToSimulate'));
      return;
    }
    setSimulating(true);
    stopSim.current = startSimulation({
      polyline: line,
      kmph: 40,
      tickMs: 5000,
      onMove: (p) => report(p.lat, p.lng, p.heading, true),
    });
  }, [c?.routePolyline, report, t]);

  // The words on the shared outcome sheet, in the admin's language. The RULES
  // (which outcomes exist, which need the farmer's code, what a failure does)
  // live in components/StopOutcomeSheet.jsx and utils/stopOutcome.js, shared
  // with the captain's screen so the two can never tell a farmer different
  // things about the same act.
  const L = useMemo(() => ({
    chooseSub: t('fpoRun.chooseSub'),
    optFullTitle: t('fpoRun.optFullTitle'),
    optFullSub: t('fpoRun.optFullSub'),
    optShortTitle: t('fpoRun.optShortTitle'),
    optShortSub: t('fpoRun.optShortSub'),
    optNoneTitle: t('fpoRun.optNoneTitle'),
    optNoneSub: t('fpoRun.optNoneSub'),
    otpLabel: t('fpoRun.otpLabel'),
    otpHelp: t('fpoRun.otpHelp'),
    otpShortHelp: t('fpoRun.otpShortHelp'),
    shortKgLabel: t('fpoRun.shortKgLabel'),
    shortKgHelp: t('fpoRun.shortKgHelp'),
    shortConsequence: t('fpoRun.shortConsequence'),
    reasonTitle: t('fpoRun.reasonTitle'),
    reasonAbsent: t('fpoRun.reasonAbsent'),
    reasonNotReady: t('fpoRun.reasonNotReady'),
    reasonRejected: t('fpoRun.reasonRejected'),
    reasonOther: t('fpoRun.reasonOther'),
    noteLabel: t('fpoRun.noteLabel'),
    notePlaceholder: t('fpoRun.notePlaceholder'),
    consequenceTitle: t('fpoRun.consequenceTitle'),
    conseqCancel: t('fpoRun.conseqCancel'),
    conseqRestock: t('fpoRun.conseqRestock'),
    conseqFare: t('fpoRun.conseqFare'),
    conseqNoOtp: t('fpoRun.conseqNoOtp'),
    conseqDispute: t('fpoRun.conseqDispute'),
    submitFull: t('fpoRun.submitFull'),
    submitShort: t('fpoRun.submitShort'),
    submitNone: t('fpoRun.submitNone'),
    confirmTitle: t('fpoRun.confirmTitle'),
    // Name FIRST, then the sentence — so Marathi can read naturally instead of
    // having a name spliced into the middle of an English clause.
    confirmBody: (name) => `${name} — ${t('fpoRun.confirmBodySuffix')}`,
    confirmYes: t('fpoRun.confirmYes'),
    backLabel: t('fpoRun.backLabel'),
    cancelLabel: t('fpoRun.cancelLabel'),
    errTitle: t('fpoRun.errTitle'),
    errOtp: t('fpoRun.errOtp'),
    errNumber: t('fpoRun.errNumber'),
    errTooHigh: t('fpoRun.errTooHigh'),
    errReason: t('fpoRun.errReason'),
    errGeneric: t('fpoRun.errGeneric'),

    // Weight provenance. Required for any pickup — the backend refuses a
    // collected outcome without it. `estimated` reads as an honest answer here
    // exactly as it does on the captain's screen: the two recorders must never
    // tell a farmer different things about the same act.
    weightTitle: t('fpoRun.weightTitle'),
    weightClaim: t('fpoRun.weightClaim'),
    wmCentreTitle: t('fpoRun.wmCentreTitle'),
    wmCentreSub: t('fpoRun.wmCentreSub'),
    wmBridgeTitle: t('fpoRun.wmBridgeTitle'),
    wmBridgeSub: t('fpoRun.wmBridgeSub'),
    wmFarmTitle: t('fpoRun.wmFarmTitle'),
    wmFarmSub: t('fpoRun.wmFarmSub'),
    wmEstTitle: t('fpoRun.wmEstTitle'),
    wmEstSub: t('fpoRun.wmEstSub'),
    wmEstAffirm: t('fpoRun.wmEstAffirm'),
    wmIndependentTag: t('fpoRun.wmIndependentTag'),
    weightRefLabel: t('fpoRun.weightRefLabel'),
    weightRefPlaceholder: t('fpoRun.weightRefPlaceholder'),
    weightRefHelp: t('fpoRun.weightRefHelp'),
    errWeightMethod: t('fpoRun.errWeightMethod'),

    // Observed grade. Defaults to the declaration and sends nothing at all in
    // that case — see GRADE_CHOICE in utils/stopOutcome.js.
    gradeTitle: t('fpoRun.gradeTitle'),
    gradeSub: t('fpoRun.gradeSub'),
    gradeDeclaredPrefix: t('fpoRun.gradeDeclaredPrefix'),
    // Shown when this viewer may NOT grade — on a hired run, where the sheet
    // is read-only anyway, and as a safety net if the actor rule ever changes.
    noGradeTitle: t('fpoRun.noGradeTitle'),
    noGradeBody: t('fpoRun.noGradeBody'),
    // What the lot looked like. Offered to EVERY recorder, including the ones
    // who may also grade — an FPO driver answers both.
    condTitle: t('fpoRun.condTitle'),
    condSub: t('fpoRun.condSub'),
    condFineTitle: t('fpoRun.condFineTitle'),
    condFineSub: t('fpoRun.condFineSub'),
    condWrongCrop: t('fpoRun.condWrongCrop'),
    condSpoiled: t('fpoRun.condSpoiled'),
    condSprouting: t('fpoRun.condSprouting'),
    condWet: t('fpoRun.condWet'),
    condDamaged: t('fpoRun.condDamaged'),
    condPackaging: t('fpoRun.condPackaging'),
    condNotePlaceholder: t('fpoRun.condNotePlaceholder'),
    condNotAGrade: t('fpoRun.condNotAGrade'),
    gradeSameTitle: t('fpoRun.gradeSameTitle'),
    gradeSameSub: t('fpoRun.gradeSameSub'),
    gradeDiffTitle: t('fpoRun.gradeDiffTitle'),
    gradeDiffSub: t('fpoRun.gradeDiffSub'),
    gradeNoneTitle: t('fpoRun.gradeNoneTitle'),
    gradeNoneSub: t('fpoRun.gradeNoneSub'),
    errGradeLetter: t('fpoRun.errGradeLetter'),
    gradeConseqTitle: t('fpoRun.gradeConseqTitle'),
    gradeIsLower: t('fpoRun.gradeIsLower'),
    gradeMaybeLower: t('fpoRun.gradeMaybeLower'),
    gradeDoesRecord: t('fpoRun.gradeDoesRecord'),
    gradeDoesAsk: t('fpoRun.gradeDoesAsk'),
    gradeNotPrice: t('fpoRun.gradeNotPrice'),
    gradeNotInspection: t('fpoRun.gradeNotInspection'),
    gradeGrievance: t('fpoRun.gradeGrievance'),
    gradeUpgradeNote: t('fpoRun.gradeUpgradeNote'),
  }), [t]);

  const onRecorded = useCallback((data) => {
    setSheetStop(null);
    if (data.consignment) setC(data.consignment);

    const left = data.remaining;
    const tail = left === 0
      ? (data.collectedQuantityKg === 0 ? t('fpoRun.tailAllEmpty') : t('fpoRun.tailAllAboard'))
      : `${left} ${t('fpoRun.tailLeft')}`;

    if (data.outcome === OUTCOME.NONE) {
      Alert.alert(t('fpoRun.okNoneTitle'), `${t('fpoRun.okNoneBody')} ${tail}`);
    } else if (data.outcome === OUTCOME.SHORT) {
      Alert.alert(t('fpoRun.okShortTitle'),
        `${kgs(data.stop?.collectedKg)} / ${kgs(data.stop?.quantityKg)}. ${tail}`);
    } else {
      Alert.alert(t('fpoRun.okFullTitle'), tail);
    }
  }, [t]);

  const deliver = useCallback(async () => {
    if (dropOtp.trim().length !== 4) return Alert.alert(t('fpoRun.errTitle'), t('fpoRun.err4'));
    setBusy(true);
    try {
      const r = await postDeliver(consignmentId, dropOtp.trim());
      if (r.data?.success) {
        setDropOpen(false);
        setDropOtp('');
        setC(r.data.consignment);
        Alert.alert(t('fpoRun.doneTitle'),
          `${kgs(r.data.collectedQuantityKg)} / ${kgs(r.data.plannedQuantityKg)}`);
      }
    } catch (e) {
      Alert.alert(t('fpoRun.errTitle'), e.response?.data?.error || t('fpoRun.errFinish'));
      fetchIt();
    } finally {
      setBusy(false);
    }
  }, [consignmentId, dropOtp, fetchIt, t]);

  // Nothing was collected anywhere, so there is no handover and no buyer code
  // to ask for. The backend closes such a run as `cancelled`; leaving the admin
  // in front of an OTP box that can never be satisfied is the "stranded at a
  // delivery step" failure this phase exists to remove.
  const closeEmpty = useCallback(() => {
    Alert.alert(t('fpoRun.closeEmptyTitle'), t('fpoRun.closeEmptyBody'), [
      { text: t('fpoRun.notYet'), style: 'cancel' },
      {
        text: t('fpoRun.closeEmptyYes'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await postDeliver(consignmentId, null);
            if (r.data?.success) {
              setC(r.data.consignment);
              Alert.alert(t('fpoRun.closedTitle'), t('fpoRun.closedBody'));
            }
          } catch (e) {
            Alert.alert(t('fpoRun.errTitle'), e.response?.data?.error || t('fpoRun.errFinish'));
            fetchIt();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [consignmentId, fetchIt, t]);

  // ── ASSIGNING THE GROUP'S OWN DRIVER (admin side) ───────────────────────
  //
  // The candidates are the group's ACTIVE members, read from the group the
  // admin already belongs to. The server re-checks everything that matters —
  // that the run is own/contracted, that this caller admins it, that the named
  // account exists, that its role is not `vendor` (a buyer recording the
  // pickups on produce they are buying is a conflict of interest), and that the
  // driver is not already holding other work. This picker only saves typing a
  // uid; it grants nothing.
  const openPicker = useCallback(async () => {
    setPickerOpen(true);
    setMembersErr(false);
    try {
      // `admin/mine`, NOT `/mine`. Only an admin opens this picker, and the two
      // endpoints answer different questions: `/mine` is "which group am I a
      // MEMBER of" and is farmer-only, so an `fpo`-role admin — who is
      // deliberately not in their own members[] — gets a 403 and an empty
      // picker from it. `admin/mine` resolves on adminUid and therefore serves
      // both admin shapes, the legacy farmer-account and the organisation's own.
      const r = await axios.get(`${API_ENDPOINTS.FPOS}/admin/mine`);
      const rows = (r.data?.fpo?.members || []).filter((m) => (m.status || 'active') === 'active');
      setMembers(rows);
    } catch {
      setMembersErr(true);
      setMembers([]);
    }
  }, []);

  const assign = useCallback(async (driverUid, driverName) => {
    setDriverBusy(true);
    try {
      const r = await assignRunDriver(consignmentId, driverUid, vehicleNo.trim());
      if (r.data?.success) {
        setPickerOpen(false);
        setVehicleNo('');
        setC(r.data.consignment);
        Alert.alert(`${driverName} — ${t('fpoRun.driverAssignedTitle')}`, t('fpoRun.driverAssignedBody'));
      }
    } catch (e) {
      Alert.alert(t('fpoRun.errTitle'), e.response?.data?.error || t('fpoRun.driverAssignFailed'));
    } finally {
      setDriverBusy(false);
    }
  }, [consignmentId, vehicleNo, t]);

  // The name and number stay on the trip sheet on purpose: whoever drove is
  // still who drove, and erasing that would lose the record rather than correct
  // it. Only the account link goes, and with it their access to the run.
  const unassign = useCallback(() => {
    Alert.alert(t('fpoRun.driverRemoveTitle'), t('fpoRun.driverRemoveBody'), [
      { text: t('fpoRun.cancelLabel'), style: 'cancel' },
      {
        text: t('fpoRun.driverRemoveYes'),
        style: 'destructive',
        onPress: async () => {
          setDriverBusy(true);
          try {
            const r = await unassignRunDriver(consignmentId);
            if (r.data?.success) setC(r.data.consignment);
          } catch (e) {
            Alert.alert(t('fpoRun.errTitle'), e.response?.data?.error || t('fpoRun.driverAssignFailed'));
          } finally {
            setDriverBusy(false);
          }
        },
      },
    ]);
  }, [consignmentId, t]);

  if (loading) return <View style={s.center}><ActivityIndicator color="#16A34A" /></View>;

  if (!c) {
    return (
      <View style={s.center}>
        <Ionicons name={errCode === 'FORBIDDEN' ? 'lock-closed-outline' : 'alert-circle-outline'}
          size={38} color={errCode === 'FORBIDDEN' ? '#9CA3AF' : '#DC2626'} />
        <Text style={s.errorText}>
          {errCode === 'FORBIDDEN' ? t('fpoRun.forbiddenBody') : t('fpoRun.loadError')}
        </Text>
      </View>
    );
  }

  const stops = c.stops || [];
  const closed = isClosed(c);
  // THE NARROW GATE: recording appears on an agentless own/contracted run for
  // the two people entitled to record on it — the group's assigned DRIVER, at
  // the gate, and the group's OFFICE, keying in what the driver reported. Both
  // stay live on the same run; `outcomeByRole` records which was used. Never
  // once the run is closed, and `closed` now includes `abandoned`.
  const canRecord = canRecordAs(role) && !closed;
  const isDriver = role === 'fpo_driver';
  const isAdmin = role === 'fpo_admin';
  const driver = driverBlockOf(c);
  // A driver can only be named on a run the group arranged itself. A hired run
  // has a pool captain, and two drivers on one vehicle is what this app refuses.
  const canAssignDriver = isAdmin && !closed && !c.agentUid && !!c.fpoId
    && ['own', 'contracted'].includes(c.transportMode);

  const tk = c.tracking || {};
  const ageSec = tk.updatedAt ? Math.round((Date.now() - new Date(tk.updatedAt)) / 1000) : null;
  const band = bandOf({ ageSec });
  const bandTone = STALE_STYLE[band];

  const visited = visitedCount(stops);
  const collected = collectedCount(stops);
  const failed = failedCount(stops);
  const aboard = carriedKg(stops);
  const everyStopVisited = allVisited(stops);
  const emptyRun = everyStopVisited && nothingCollected(stops);
  const next = nextPendingStop(stops);
  const left = stops.length - visited;

  const modeLabel = t(
    c.transportMode === 'own' ? 'fpoRun.modeOwn'
      : c.transportMode === 'contracted' ? 'fpoRun.modeContracted'
        : 'fpoRun.modeHired'
  );

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* ── the run ─────────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.title}>{stops.length} {t('fpoRun.farmsLabel')}</Text>
          <Text style={s.sub}>
            {c.distanceKm} km · {kgs(c.totalQuantityKg)} {t('fpoRun.planned')}
          </Text>

          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${stops.length ? (visited / stops.length) * 100 : 0}%` }]} />
          </View>
          <Text style={s.progressText}>
            {visited} / {stops.length} {t('fpoRun.visitedOf')}
            {failed > 0 ? ` · ${collected} ${t('fpoRun.collectedWord')}, ${failed} ${t('fpoRun.failedWord')}` : ''}
          </Text>
          <Text style={s.aboardText}>{kgs(aboard)} {t('fpoRun.aboard')}</Text>

          <View style={s.modeRow}>
            <Ionicons name="car-outline" size={14} color="#6B7280" />
            <Text style={s.modeText}>{modeLabel}</Text>
          </View>
          {!!driver.name && (
            <Text style={s.modeSub}>
              {t('fpoRun.driverLabel')}: {driver.name}
              {driver.vehicleNumber ? ` · ${driver.vehicleNumber}` : ''}
              {driver.kind === 'fpo_driver' && !driver.linked ? ` · ${t('fpoRun.driverUnlinkedTag')}` : ''}
            </Text>
          )}
          {/* A NON-HIRED RUN'S COST IS STATED, NOT COMPUTED, and the screen has
              to keep saying so — the same rule as Warehouse.rateSource. */}
          {c.transport?.cost != null && (
            <Text style={s.modeSub}>
              {t('fpoRun.costLabel')}: {money(c.transport.cost)} — {c.transport.costNote || t('fpoRun.costStated')}
            </Text>
          )}

          {/* GAP A — the run on a map, for the office. Same screen the buyer
              gets, same payload, `localized` so this side stays Marathi. */}
          <TouchableOpacity
            style={s.trackRow}
            activeOpacity={0.85}
            onPress={() => navigation?.navigate('TrackRun', { consignmentId, localized: true })}
          >
            <Ionicons name="map-outline" size={15} color="#2563EB" />
            <Text style={s.trackText}>{t('fpoRun.openMap')}</Text>
            <Ionicons name="chevron-forward" size={15} color="#2563EB" />
          </TouchableOpacity>
        </View>

        {/* ── who may record, said before anything is tapped ───────────── */}
        <View style={[s.banner, canRecord ? s.bannerOk : s.bannerMuted]}>
          <Ionicons
            name={canRecord ? 'clipboard-outline' : 'lock-closed-outline'}
            size={17} color={canRecord ? '#15803D' : '#6B7280'}
          />
          <Text style={[s.bannerText, canRecord && { color: '#14532D' }]}>
            {role === 'agent' ? t('fpoRun.captainBanner')
              : role === 'nobody' ? t('fpoRun.noDriverBanner')
                : isDriver ? t('fpoRun.driverBanner')
                  : isAdmin && driver.linked && driver.kind === 'fpo_driver'
                    ? t('fpoRun.operatorWithDriverBanner')
                    : t('fpoRun.operatorBanner')}
          </Text>
        </View>

        {/* ── GAP B: WHOSE PHONE IS REPORTING THE POSITION ────────────────
            The driver sees whether their own device is actually posting; the
            office sees, in words, why it cannot post one itself. */}
        {isDriver && runLive && (
          <View style={s.driveCard}>
            <View style={s.driveHead}>
              <View style={[s.liveDot, { backgroundColor: bandTone.dot }]} />
              <Text style={[s.driveTitle, { color: bandTone.fg }]}>
                {lastSeenText(ageSec, {
                  never: t('fpoRun.noFixYet'),
                  live: t('fpoRun.posLive'),
                  moment: t('fpoRun.posMoment'),
                  min: (n) => `${t('fpoRun.posLastSeen')} ${n} ${t('fpoRun.posMinAgo')}`,
                  hr: (h, m) => `${t('fpoRun.posLastSeen')} ${h} ${t('fpoRun.posHrWord')}${m ? ` ${m} ${t('fpoRun.posMinWord')}` : ''} ${t('fpoRun.posAgo')}`,
                })}
              </Text>
            </View>
            <Text style={s.driveText}>{t('fpoRun.foregroundOnly')}</Text>
            {!!pinged && <Text style={s.driveText}>{t('fpoRun.pingOk')}</Text>}
            <TouchableOpacity
              style={[s.simBtn, simulating && s.simBtnOn]}
              onPress={toggleSim}
              activeOpacity={0.85}
            >
              <Ionicons name={simulating ? 'pause' : 'play'} size={13} color={simulating ? '#fff' : '#5B21B6'} />
              <Text style={[s.simText, simulating && { color: '#fff' }]}>
                {t(simulating ? 'fpoRun.simOn' : 'fpoRun.simOff')}
              </Text>
            </TouchableOpacity>
            {simulating && <Text style={s.driveText}>{t('fpoRun.simNote')}</Text>}
          </View>
        )}

        {isAdmin && runLive && (
          <View style={s.noteBox}>
            <Ionicons name="location-outline" size={15} color="#B45309" />
            <Text style={s.noteText}>{t('fpoRun.officeCannotPost')}</Text>
          </View>
        )}

        {/* ── GAP B: THE ADMIN NAMES WHO IS DRIVING ───────────────────────
            `transport.driverUid` is a real account link, NOT `agentUid`: it puts
            nobody in the captain dispatch pool, gives them nothing on any other
            run, and leaves the office-side fallback exactly where it was. */}
        {canAssignDriver && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>{t('fpoRun.driverSection')}</Text>
            {driver.linked && driver.kind === 'fpo_driver' ? (
              <>
                <Text style={s.driverName}>{driver.name}</Text>
                <Text style={s.modeSub}>
                  {driver.phone || ''}
                  {driver.vehicleNumber ? ` · ${driver.vehicleNumber}` : ''}
                </Text>
                <Text style={s.footnote}>{t('fpoRun.driverAssignedNote')}</Text>
                <View style={s.driverActions}>
                  <TouchableOpacity
                    style={[s.ghostBtn, driverBusy && { opacity: 0.6 }]}
                    onPress={openPicker} disabled={driverBusy} activeOpacity={0.85}
                  >
                    <Text style={s.ghostBtnText}>{t('fpoRun.driverChange')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.dangerBtn, driverBusy && { opacity: 0.6 }]}
                    onPress={unassign} disabled={driverBusy} activeOpacity={0.85}
                  >
                    <Text style={s.dangerBtnText}>{t('fpoRun.driverRemove')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={s.footnote}>{t('fpoRun.noDriverAccountNote')}</Text>
                <TouchableOpacity
                  style={[s.mainBtn, { marginTop: 10 }, driverBusy && { opacity: 0.6 }]}
                  onPress={openPicker} disabled={driverBusy} activeOpacity={0.85}
                >
                  <Ionicons name="person-add-outline" size={16} color="#fff" />
                  <Text style={s.mainBtnText}>{t('fpoRun.driverAssign')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ── the stops ───────────────────────────────────────────────── */}
        {stops.map((st, i) => {
          const outcome = outcomeOf(st);
          const done = isVisited(st);
          const isFail = outcome === OUTCOME.NONE;
          const isShortStop = outcome === OUTCOME.SHORT;
          const isNext = !done && next && String(next.orderId) === String(st.orderId);
          return (
            <View
              key={String(st.orderId)}
              style={[s.stop, done && !isFail && s.stopDone, isFail && s.stopFailed, isNext && s.stopNext]}
            >
              <View style={[
                s.stopNum,
                done && !isFail && s.stopNumDone,
                isFail && s.stopNumFailed,
                isNext && s.stopNumNext,
              ]}>
                {done
                  ? <Ionicons name={isFail ? 'close' : 'checkmark'} size={14} color="#fff" />
                  : <Text style={[s.stopNumText, isNext && { color: '#fff' }]}>{i + 1}</Text>}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={s.stopName}>{st.farmerName}</Text>
                <Text style={s.stopMeta}>{kgs(st.quantityKg)} {st.cropName}</Text>

                {done ? (
                  <View>
                    <Text style={[
                      s.stopDoneText,
                      isFail && { color: '#B91C1C' },
                      isShortStop && { color: '#B45309' },
                    ]}>
                      {isFail ? t('fpoRun.outNone')
                        : isShortStop ? `${t('fpoRun.outShort')} — ${kgs(stopKg(st))} / ${kgs(st.quantityKg)}`
                          : t('fpoRun.outFull')}
                    </Text>
                    {!!st.failureReason && (
                      <Text style={s.stopReason}>{t(REASON_KEY[st.failureReason] || 'fpoRun.reasonOther')}</Text>
                    )}
                    {!!st.outcomeNote && <Text style={s.stopReason}>“{st.outcomeNote}”</Text>}
                    {/* WHOSE ACCOUNT THIS IS. Three different claims, and a
                        farmer disputing a failed stop is entitled to know which
                        one they are arguing with: a captain who stood at their
                        gate, the group's own driver standing at that same gate
                        on their own phone, or the office keying in what the
                        driver reported down a phone line. */}
                    {!!st.outcomeByRole && (
                      <Text style={s.stopReason}>
                        {t(st.outcomeByRole === 'agent' ? 'fpoRun.recordedByAgent'
                          : st.outcomeByRole === 'fpo_driver' ? 'fpoRun.recordedByDriver'
                            : 'fpoRun.recordedByFpo')}
                      </Text>
                    )}
                    {/* THE KILOGRAMS NEVER APPEAR WITHOUT THEIR PROVENANCE.
                        A stop written through the legacy /collect route prints
                        as "no method recorded" — not as an estimate nobody
                        made. */}
                    {!isFail && !!weightMethodOf(st) && (
                      <Text style={s.stopProv}>
                        {t(WEIGHT_KEY[weightMethodOf(st)] || 'fpoRun.wmNotRecordedTitle')}
                        {st.weight?.ref ? ` · ${st.weight.ref}` : ''}
                        {isWeighed(weightMethodOf(st)) && !isIndependentWeight(weightMethodOf(st))
                          ? ` · ${t('fpoRun.wmNotIndependent')}` : ''}
                      </Text>
                    )}
                    {!isFail && (() => {
                      const g = gradeCheckOf(st.grade);
                      if (!g.observed && !g.declared) return null;
                      return (
                        <Text style={[s.stopProv, g.downgraded && { color: '#B45309', fontWeight: '700' }]}>
                          {g.downgraded
                            ? `${t('fpoRun.gradeRowLower')} ${g.declared} → ${g.observed}`
                            : g.discrepancy === 'observed_only'
                              ? `${t('fpoRun.gradeRowObserved')} ${g.observed}`
                              : `${t('fpoRun.gradeRowMatch')} ${g.observed}`}
                        </Text>
                      );
                    })()}
                  </View>
                ) : (
                  <View style={s.stopActions}>
                    {!!st.farmerPhone && (
                      <TouchableOpacity style={s.callBtn} onPress={() => Linking.openURL(`tel:${st.farmerPhone}`)}>
                        <Ionicons name="call" size={12} color="#2563EB" />
                        <Text style={s.callText}>{t('fpoRun.call')}</Text>
                      </TouchableOpacity>
                    )}
                    {canRecord && (
                      <TouchableOpacity
                        style={[s.recordBtn, !isNext && s.recordBtnMuted]}
                        onPress={() => setSheetStop(st)}
                        activeOpacity={0.85}
                      >
                        <Text style={[s.recordText, !isNext && { color: '#6B7280' }]}>
                          {t('fpoRun.recordBtn')}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {/* ── the fare decision, wherever a failed stop is visible ─────── */}
        {failed > 0 && (
          <View style={s.noteBox}>
            <Ionicons name="cash-outline" size={15} color="#B45309" />
            <Text style={s.noteText}>{t('fpoRun.fareNote')}</Text>
          </View>
        )}

        {/* ── finishing the run ───────────────────────────────────────── */}
        {closed ? (
          <View style={s.closedBox}>
            <Ionicons name={c.status === 'delivered' ? 'checkmark-done' : 'close-circle-outline'}
              size={17} color="#6B7280" />
            <Text style={s.closedText}>
              {t(c.status === 'delivered' ? 'fpoRun.closedDelivered' : 'fpoRun.closedCancelled')}
            </Text>
          </View>
        ) : canRecord && emptyRun ? (
          <TouchableOpacity
            style={[s.mainBtn, { backgroundColor: '#B91C1C' }, busy && { opacity: 0.6 }]}
            onPress={closeEmpty} disabled={busy} activeOpacity={0.85}
          >
            <Ionicons name="close-circle-outline" size={17} color="#fff" />
            <Text style={s.mainBtnText}>{t('fpoRun.closeEmptyBtn')}</Text>
          </TouchableOpacity>
        ) : canRecord ? (
          <TouchableOpacity
            style={[s.mainBtn, !everyStopVisited && { opacity: 0.45 }]}
            onPress={() => everyStopVisited
              ? setDropOpen(true)
              : Alert.alert(t('fpoRun.stopsLeftTitle'),
                  stops.filter((x) => !isVisited(x)).map((x) => x.farmerName).join(', '))}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-done-outline" size={17} color="#fff" />
            <Text style={s.mainBtnText}>
              {everyStopVisited
                ? `${t('fpoRun.deliverBtn')} · ${kgs(aboard)}`
                : `${left} ${t('fpoRun.stopsLeft')}`}
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>

      <StopOutcomeSheet
        visible={!!sheetStop}
        stop={sheetStop}
        consignmentId={consignmentId}
        L={L}
        // The sentence naming whose word this record will be. It differs for
        // the two recorders because the two claims genuinely differ.
        recorderLine={t(isDriver ? 'fpoRun.recorderLineDriver' : 'fpoRun.recorderLine')}
        // One declared grade for the whole run when this is an FPO grade lot;
        // null otherwise, and the sheet then names no letter rather than
        // inventing one.
        declaredGrade={c.lot?.gradeCode || null}
        // GRADING IS AN FPO-SIDE ACT. `role` here is `fpo_driver` (the
        // group's own driver, at the gate) or `fpo_admin` (the office keying
        // in what they reported) — FPO people who handle this crop every
        // season and whose group's name is on the sale. mayGradeAtGate() is
        // the same rule the server applies, said before anybody taps rather
        // than after. On a HIRED run this screen is read-only anyway, and
        // `role` is 'agent' or 'nobody', so the answer is false there too.
        canGrade={mayGradeAtGate(role)}
        onClose={() => setSheetStop(null)}
        onRecorded={onRecorded}
      />

      {/* ── THE DRIVER PICKER. Active members of the group only; the server
          re-checks every rule and this saves typing a uid, nothing more. ── */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={s.modalWrap}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>{t('fpoRun.driverPickTitle')}</Text>
            <Text style={s.modalSub}>{t('fpoRun.driverPickSub')}</Text>

            <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('fpoRun.vehicleNoLabel')}</Text>
            <TextInput
              style={s.textInput} value={vehicleNo} onChangeText={setVehicleNo}
              placeholder={t('fpoRun.vehicleNoPlaceholder')} placeholderTextColor="#D1D5DB"
              maxLength={30} autoCapitalize="characters"
            />

            <ScrollView style={{ maxHeight: 260, marginTop: 12 }} keyboardShouldPersistTaps="handled">
              {membersErr && <Text style={s.footnote}>{t('fpoRun.driverListError')}</Text>}
              {!membersErr && members.length === 0 && (
                <Text style={s.footnote}>{t('fpoRun.driverListEmpty')}</Text>
              )}
              {members.map((m) => (
                <TouchableOpacity
                  key={m.farmerUid}
                  style={[s.memberRow, driverBusy && { opacity: 0.6 }]}
                  onPress={() => assign(m.farmerUid, m.farmerName)}
                  disabled={driverBusy}
                  activeOpacity={0.85}
                >
                  <View style={s.memberAvatar}>
                    <Text style={s.memberAvatarText}>{(m.farmerName || '?')[0].toUpperCase()}</Text>
                  </View>
                  <Text style={s.memberName}>{m.farmerName || m.farmerUid}</Text>
                  {driver.uid === m.farmerUid
                    ? <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                    : <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={s.footnote}>{t('fpoRun.driverPickNote')}</Text>

            <TouchableOpacity style={[s.mBtn, s.mGhost, { marginTop: 14 }]} onPress={() => setPickerOpen(false)}>
              <Text style={s.mGhostText}>{t('fpoRun.cancelLabel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={dropOpen} transparent animationType="fade" onRequestClose={() => setDropOpen(false)}>
        <View style={s.modalWrap}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>{t('fpoRun.dropTitle')}</Text>
            <Text style={s.modalSub}>{t('fpoRun.dropSub')}</Text>
            <TextInput
              style={s.otpInput} value={dropOtp} onChangeText={setDropOtp}
              keyboardType="number-pad" maxLength={4} placeholder="0000"
              placeholderTextColor="#D1D5DB" autoFocus
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.mBtn, s.mGhost]} onPress={() => setDropOpen(false)}>
                <Text style={s.mGhostText}>{t('fpoRun.cancelLabel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.mBtn, s.mPrimary, busy && { opacity: 0.6 }]}
                onPress={deliver} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.mPrimaryText}>{t('fpoRun.finish')}</Text>}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', gap: 10, padding: 26 },
  errorText: { fontSize: 13.5, color: '#374151', textAlign: 'center', lineHeight: 19 },
  scroll: { padding: 16, gap: 12 },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#F1F5F9', marginTop: 14, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  progressText: { fontSize: 12, color: '#6B7280', marginTop: 6 },
  aboardText: { fontSize: 12.5, fontWeight: '700', color: '#15803D', marginTop: 3 },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  modeText: { fontSize: 12.5, fontWeight: '700', color: '#374151' },
  modeSub: { fontSize: 11.5, color: '#9CA3AF', marginTop: 4, lineHeight: 16 },

  sectionTitle: {
    fontSize: 10.5, fontWeight: '800', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
  },
  footnote: { fontSize: 11.5, color: '#9CA3AF', lineHeight: 16, marginTop: 6 },

  trackRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 10, marginTop: 14,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  trackText: { fontSize: 13, color: '#2563EB', fontWeight: '700' },

  driveCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 14, gap: 6,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  driveHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  driveTitle: { fontSize: 13.5, fontWeight: '800' },
  driveText: { fontSize: 11.5, color: '#6B7280', lineHeight: 16 },
  simBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#F5F3FF', borderRadius: 10, paddingVertical: 9, marginTop: 4,
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  simBtnOn: { backgroundColor: '#6D28D9', borderColor: '#6D28D9' },
  simText: { fontSize: 12, fontWeight: '700', color: '#5B21B6' },

  driverName: { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  driverActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  ghostBtn: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  ghostBtnText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  dangerBtn: { flex: 1, backgroundColor: '#FEF2F2', borderRadius: 12, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  dangerBtnText: { fontSize: 13, fontWeight: '700', color: '#B91C1C' },

  fieldLabel: { fontSize: 12.5, fontWeight: '700', color: '#374151' },
  textInput: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    fontSize: 14, color: '#111827', paddingHorizontal: 12, paddingVertical: 10, marginTop: 6,
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#F1F5F9',
    paddingHorizontal: 11, paddingVertical: 10, marginTop: 8,
  },
  memberAvatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarText: { fontSize: 14, fontWeight: '800', color: '#15803D' },
  memberName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },

  banner: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', borderRadius: 14, padding: 13 },
  bannerOk: { backgroundColor: '#F0FDF4' },
  bannerMuted: { backgroundColor: '#F1F5F9' },
  bannerText: { flex: 1, fontSize: 12, color: '#4B5563', lineHeight: 17 },

  stop: {
    flexDirection: 'row', gap: 11, backgroundColor: '#fff',
    borderRadius: 16, padding: 13, borderWidth: 1.5, borderColor: '#F1F5F9',
  },
  stopDone: { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' },
  stopFailed: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  stopNext: { borderColor: '#16A34A' },
  stopNum: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  stopNumDone: { backgroundColor: '#16A34A' },
  stopNumFailed: { backgroundColor: '#B91C1C' },
  stopNumNext: { backgroundColor: '#16A34A' },
  stopNumText: { fontSize: 12, fontWeight: '800', color: '#9CA3AF' },
  stopName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  stopMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  stopDoneText: { fontSize: 12.5, fontWeight: '700', color: '#15803D', marginTop: 6 },
  stopProv: { fontSize: 10.5, color: '#6B7280', marginTop: 3, lineHeight: 15 },
  stopReason: { fontSize: 11.5, color: '#6B7280', marginTop: 3, fontStyle: 'italic' },
  stopActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#DBEAFE', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
  },
  callText: { fontSize: 11.5, fontWeight: '700', color: '#2563EB' },
  recordBtn: { flex: 1, backgroundColor: '#16A34A', borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  recordBtnMuted: { backgroundColor: '#F1F5F9' },
  recordText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  noteBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 14, padding: 12,
  },
  noteText: { flex: 1, fontSize: 11.5, color: '#92400E', lineHeight: 16 },

  closedBox: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: '#F1F5F9', borderRadius: 14, padding: 13,
  },
  closedText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#6B7280' },

  mainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 15,
  },
  mainBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '700' },

  modalWrap: { flex: 1, backgroundColor: 'rgba(17,24,39,0.5)', alignItems: 'center', justifyContent: 'center', padding: 26 },
  modal: { backgroundColor: '#fff', borderRadius: 20, padding: 22, width: '100%' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  modalSub: { fontSize: 12.5, color: '#6B7280', marginTop: 6, lineHeight: 18 },
  otpInput: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14,
    fontSize: 28, fontWeight: '800', color: '#111827', textAlign: 'center',
    letterSpacing: 12, paddingVertical: 12, marginTop: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  mBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  mGhost: { backgroundColor: '#F1F5F9' },
  mGhostText: { fontSize: 13.5, fontWeight: '700', color: '#6B7280' },
  mPrimary: { backgroundColor: '#16A34A' },
  mPrimaryText: { fontSize: 13.5, fontWeight: '700', color: '#fff' },
});

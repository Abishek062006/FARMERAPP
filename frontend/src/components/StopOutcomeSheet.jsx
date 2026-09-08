import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  OUTCOME, FAILURE_REASONS, otpRequired, validateShortKg, postStopOutcome,
  POSTABLE_WEIGHT_METHODS, WEIGHT_METHOD, WEIGHT_METHOD_META, weightRefApplies,
  weightMethodRequired, GRADES, GRADE_CHOICE, gradeBody, compareGrades,
  CONDITION_FLAGS, conditionBody, conditionApplies,
} from '../utils/stopOutcome';

// PHASE G — THE ONE PLACE A STOP OUTCOME IS RECORDED.
//
// Both people who can record a stop use this sheet: the captain on a hired run
// (Agent/ConsignmentTripScreen) and the FPO admin on an own/contracted one
// (Farmer/FpoRunScreen). It exists as one component because the thing that must
// never drift between them is not the layout — it is WHAT THE RECORDER IS TOLD
// BEFORE THEY CANCEL SOMEBODY'S SALE. Two copies of that panel is two places
// for one of them to quietly lose the sentence about the fare.
//
// WHY IT TAKES A LABEL BAG (`L`) INSTEAD OF CALLING t() ITSELF.
//   The captain's stack is English throughout; the FPO admin's dashboard is
//   fully Marathi-capable. A component that picked one would put a Marathi
//   modal inside an English screen, or the reverse — which is exactly the
//   half-translated failure CLAUDE.md records ("a farmer landed on an English
//   dashboard and tapping Post harvest opened a Marathi modal"). So the RULES
//   live here and the WORDS come from the screen. Every key in `L` is a plain
//   string except `confirmBody`, which is a function of the farmer's name so a
//   Marathi sentence can put the name where Marathi puts it.
//
// THE OTP RULE IS NOT A LOOPHOLE, AND THE SHEET SAYS SO.
//   `not_collected` asks for no code — the absent farmer is precisely the
//   person who cannot read one out. What replaces it is attribution: the
//   backend stamps `outcomeBy` / `outcomeByRole`, and `recorderLine` prints, in
//   words, whose name is going on the record. It is shown on the same screen as
//   the confirm button, never buried.

//
// ── WHAT THE GATE CAN ATTEST TO: WEIGHT PROVENANCE AND OBSERVED GRADE ─────
//
// `POST /:id/stop-outcome` now REFUSES a collected outcome with no
// `weightMethod` (400 WEIGHT_METHOD_REQUIRED). That refusal is not pedantry:
// `collectedKg` decides what a farmer is paid and what a buyer owes, and until
// this field existed nothing anywhere said where the number came from. What the
// backend refuses is SILENCE — not the absence of a scale.
//
// SO `estimated` IS RENDERED AS A FIRST-CLASS ANSWER, in the same card, at the
// same size, in the same neutral colour as the three weighed ones, with a line
// saying in words that it is honest and expected. Most farm-gate pickups in
// Maharashtra have no scale within reach. Styling it as a warning, hiding it
// under an "other", or wording it as a failure would push recorders toward
// claiming a weighing that never happened — which is the exact lie the whole
// field exists to stop telling.
//
// AND THE SECTION SAYS WHAT IT IS. This is a claim about HOW a weight was
// established, by the person making it. The app weighs nothing, checks nothing
// and corrects nothing.
//
// THE GRADE QUESTION DEFAULTS TO THE DECLARATION AND SENDS NOTHING. See
// GRADE_CHOICE in utils/stopOutcome.js — the common case is "it is what they
// said it is", and a recorder made to retype that produces noise, not evidence.

const REASON_KEY = {
  farmer_absent: 'reasonAbsent',
  quantity_not_ready: 'reasonNotReady',
  produce_rejected: 'reasonRejected',
  other: 'reasonOther',
};

// method -> the pair of `L` keys carrying its title and its own note. The words
// are the screen's (English for the captain, Marathi for the FPO); which
// methods exist and what each implies is the shared util's.
const WEIGHT_KEY = {
  [WEIGHT_METHOD.CENTRE]: ['wmCentreTitle', 'wmCentreSub'],
  [WEIGHT_METHOD.BRIDGE]: ['wmBridgeTitle', 'wmBridgeSub'],
  [WEIGHT_METHOD.FARM]: ['wmFarmTitle', 'wmFarmSub'],
  [WEIGHT_METHOD.ESTIMATED]: ['wmEstTitle', 'wmEstSub'],
};

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function StopOutcomeSheet({
  visible,
  stop,
  consignmentId,
  L,
  // One sentence naming who this record will say declared it. Different for a
  // captain at the gate and for a group's office keying in a trip sheet, and a
  // farmer disputing "nobody was home" is entitled to know which it was.
  recorderLine,
  // WHAT THE FARMER DECLARED, when the run actually knows it — an FPO grade lot
  // carries one grade for the whole run (`consignment.lot.gradeCode`). A stop
  // itself carries NO declaration until an outcome is written, so this is null
  // on a pooled-orders run and the grade section simply does not name a letter.
  // It is never guessed: the backend reads the declaration off the listing at
  // write time, and that read is the authoritative one.
  declaredGrade = null,
  // ⚠️ MAY THIS RECORDER PUT A LETTER ON SOMEBODY'S CROP?
  //
  // DEFAULTS TO FALSE, and that direction is deliberate: a screen that forgets
  // to pass it does not offer grading, which is the conservative failure. The
  // opposite default would let a new caller silently start asking a captain to
  // certify a grade, which is the exact thing this gate exists to stop.
  //
  // An FPO's own driver/office may grade; a captain from the public pool may
  // not, and the server refuses it (409 GRADING_NOT_AVAILABLE). See
  // utils/stopOutcome.js mayGradeAtGate(). CONDITION below is offered to
  // everyone — it is not a weaker grade, it is a different kind of statement.
  canGrade = false,
  onClose,
  onRecorded,
}) {
  // ── every hook first, unconditionally. This component renders a Modal that
  // is simply invisible when `visible` is false, so there is no early return
  // anywhere below and the hook count cannot change between renders.
  const [step, setStep] = useState('choose');   // choose | full | short | none
  const [otp, setOtp] = useState('');
  const [kgText, setKgText] = useState('');
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // How the kilograms were arrived at. Starts UNSET on purpose: there is no
  // defensible default, and pre-selecting one would put a provenance on the
  // record that nobody actually stated.
  const [weightMethod, setWeightMethod] = useState(null);
  const [weightRef, setWeightRef] = useState('');
  // Starts on DECLARED, which sends no `observedGrade` at all and lets the
  // backend default the observation to the farmer's own declaration.
  const [gradeChoice, setGradeChoice] = useState(GRADE_CHOICE.DECLARED);
  const [gradeLetter, setGradeLetter] = useState(null);
  // What the lot LOOKED like. `condChecked` starts false and is the answer to
  // "did you look at all" — it is not a synonym for "no problems". Ticking a
  // flag implies looking, so it is forced true below.
  const [condChecked, setCondChecked] = useState(false);
  const [condFlags, setCondFlags] = useState([]);
  const [condNote, setCondNote] = useState('');

  const orderId = stop ? String(stop.orderId) : null;

  // Reset whenever a different stop is opened, so last farm's half-typed code
  // can never be submitted against this one.
  useEffect(() => {
    setStep('choose');
    setOtp('');
    setKgText('');
    setReason(null);
    setNote('');
    setBusy(false);
    setWeightMethod(null);
    setWeightRef('');
    setGradeChoice(GRADE_CHOICE.DECLARED);
    setGradeLetter(null);
    setCondChecked(false);
    setCondFlags([]);
    setCondNote('');
  }, [orderId, visible]);

  const st = stop || {};
  const orderedKg = Number(st.quantityKg) || 0;

  const submit = async (outcome) => {
    if (otpRequired(outcome) && otp.trim().length !== 4) {
      return Alert.alert(L.errTitle, L.errOtp);
    }

    let collectedKg;
    if (outcome === OUTCOME.SHORT) {
      const v = validateShortKg(kgText, orderedKg);
      if (v.error === 'NOT_A_NUMBER') return Alert.alert(L.errTitle, L.errNumber);
      if (v.error === 'TOO_HIGH') return Alert.alert(L.errTitle, L.errTooHigh);
      collectedKg = v.kg;
    }

    if (outcome !== OUTCOME.FULL && !FAILURE_REASONS.includes(reason)) {
      return Alert.alert(L.errTitle, L.errReason);
    }

    // The server refuses this with 400 WEIGHT_METHOD_REQUIRED; asking here
    // keeps the recorder in the form instead of bouncing them off an error
    // toast. The message is the same one the backend gives — "not weighed" is
    // an answer, and it is silence that is refused.
    if (weightMethodRequired(outcome) && !POSTABLE_WEIGHT_METHODS.includes(weightMethod)) {
      return Alert.alert(L.errTitle, L.errWeightMethod);
    }
    if (canGrade && gradeChoice === GRADE_CHOICE.OBSERVED && !GRADES.includes(gradeLetter)) {
      return Alert.alert(L.errTitle, L.errGradeLetter);
    }

    setBusy(true);
    try {
      const r = await postStopOutcome(consignmentId, {
        orderId: st.orderId,
        outcome,
        ...(otpRequired(outcome) ? { otp: otp.trim() } : {}),
        ...(outcome === OUTCOME.SHORT ? { collectedKg } : {}),
        ...(outcome === OUTCOME.FULL ? {} : { reason }),
        ...(note.trim() ? { note: note.trim() } : {}),
        // Nothing moved, so there is no weight to have a provenance and nobody
        // graded produce that never left the ground. The backend refuses to
        // record either on a `not_collected` stop; this simply does not send
        // them.
        ...(weightMethodRequired(outcome)
          ? {
            weightMethod,
            // Offered for the ONE method that issues a ticket, so it is sent
            // for that method only. A reference against an eyeballed figure
            // would be an invitation to invent a provenance.
            ...(weightRefApplies(weightMethod) && weightRef.trim()
              ? { weightRef: weightRef.trim() }
              : {}),
            // ⚠️ SENT ONLY WHEN THIS RECORDER MAY GRADE. On a hired run the
            // server refuses a posted grade outright, and it also declines to
            // default `observed` to the declaration — so sending nothing here
            // is what keeps the record honestly SILENT rather than carrying a
            // "match" nobody confirmed.
            ...(canGrade ? gradeBody(gradeChoice, gradeLetter) : {}),
            ...conditionBody(condChecked, condFlags, condNote),
          }
          : {}),
      });
      if (r.data?.success) onRecorded(r.data);
    } catch (e) {
      Alert.alert(L.errTitle, e.response?.data?.error || L.errGeneric);
    } finally {
      setBusy(false);
    }
  };

  // The failed path gets a second, deliberate gate. Not friction for its own
  // sake: the tap after this one cancels a real person's sale.
  const confirmFailure = () => {
    if (!FAILURE_REASONS.includes(reason)) return Alert.alert(L.errTitle, L.errReason);
    Alert.alert(
      L.confirmTitle,
      L.confirmBody(st.farmerName || ''),
      [
        { text: L.cancelLabel, style: 'cancel' },
        { text: L.confirmYes, style: 'destructive', onPress: () => submit(OUTCOME.NONE) },
      ]
    );
  };

  const ReasonPicker = (
    <View style={{ marginTop: 14 }}>
      <Text style={s.fieldLabel}>{L.reasonTitle}</Text>
      {FAILURE_REASONS.map((r) => (
        <TouchableOpacity
          key={r}
          style={[s.reasonRow, reason === r && s.reasonRowOn]}
          onPress={() => setReason(r)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={reason === r ? 'radio-button-on' : 'radio-button-off'}
            size={17}
            color={reason === r ? '#16A34A' : '#CBD5E1'}
          />
          <Text style={[s.reasonText, reason === r && s.reasonTextOn]}>{L[REASON_KEY[r]]}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // ── HOW THE KILOGRAMS WERE ARRIVED AT ───────────────────────────────────
  //
  // Four cards, all the same card. `estimated` is not styled down, not moved to
  // the bottom of a second list and not worded as a failure — it carries its
  // own affirmation line instead, because it is the honest answer at most farm
  // gates and the app would rather have it than a claimed weighing.
  //
  // The only thing that visibly distinguishes any option is the INDEPENDENT tag
  // on the public weighbridge, and that is a fact about the ticket rather than
  // a ranking of the recorder: it is the one weight on this list that does not
  // depend on trusting whoever typed it.
  const WeightPicker = (
    <View style={{ marginTop: 16 }}>
      <Text style={s.fieldLabel}>{L.weightTitle}</Text>
      {/* Said BEFORE the options, not in a footnote: this records a claim about
          how a weight was established. The app did not weigh anything. */}
      <View style={s.claimBox}>
        <Ionicons name="hand-left-outline" size={14} color="#334155" />
        <Text style={s.claimText}>{L.weightClaim}</Text>
      </View>

      {POSTABLE_WEIGHT_METHODS.map((m) => {
        const on = weightMethod === m;
        const [titleKey, subKey] = WEIGHT_KEY[m];
        return (
          <TouchableOpacity
            key={m}
            style={[s.wmCard, on && s.wmCardOn]}
            onPress={() => setWeightMethod(m)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={on ? 'radio-button-on' : 'radio-button-off'}
              size={17}
              color={on ? '#16A34A' : '#CBD5E1'}
            />
            <View style={{ flex: 1 }}>
              <View style={s.wmTitleRow}>
                <Text style={[s.wmTitle, on && { color: '#111827' }]}>{L[titleKey]}</Text>
                {WEIGHT_METHOD_META[m].independent && (
                  <View style={s.indTag}><Text style={s.indTagText}>{L.wmIndependentTag}</Text></View>
                )}
              </View>
              <Text style={s.wmSub}>{L[subKey]}</Text>
              {/* The affirmation sits INSIDE the option, so it is read by the
                  person choosing it rather than by nobody. */}
              {m === WEIGHT_METHOD.ESTIMATED && (
                <Text style={s.wmAffirm}>{L.wmEstAffirm}</Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}

      {/* The ticket number, for the one method that produces a ticket. */}
      {weightRefApplies(weightMethod) && (
        <View style={{ marginTop: 10 }}>
          <Text style={s.fieldLabel}>{L.weightRefLabel}</Text>
          <TextInput
            style={s.refInput} value={weightRef} onChangeText={setWeightRef}
            placeholder={L.weightRefPlaceholder} placeholderTextColor="#D1D5DB"
            maxLength={60} autoCapitalize="characters"
          />
          <Text style={s.help}>{L.weightRefHelp}</Text>
        </View>
      )}
    </View>
  );

  // ── THE GRADE, AS SEEN AT THE GATE ──────────────────────────────────────
  //
  // `cmp` is null until a letter is actually stated. With no known declaration
  // it comes back 'observed_only' — a fact about the lot, NOT a discrepancy,
  // because there was no declaration to fall short of. The consequence panel is
  // still shown in that case, worded conditionally, since the recorder may well
  // be typing something lower than a declaration this screen cannot see.
  const gradeStated = gradeChoice === GRADE_CHOICE.OBSERVED && GRADES.includes(gradeLetter);
  const cmp = gradeStated ? compareGrades(declaredGrade, gradeLetter) : null;

  // ── WHAT THE LOT LOOKED LIKE — OFFERED TO EVERY RECORDER ────────────────
  //
  // Not a consolation prize for a captain who cannot grade: it is the thing an
  // independent driver genuinely IS in a position to say, and an FPO's own
  // driver answers it too. "This is not the crop on the order" needs eyes, not
  // a spec.
  const toggleFlag = (key) => {
    setCondFlags((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
    // Ticking a flag IS looking. Leaving `checked` false while flags are set
    // would send an observation the record then describes as absent.
    setCondChecked(true);
  };

  const ConditionPicker = (
    <View style={{ marginTop: 18 }}>
      <Text style={s.fieldLabel}>{L.condTitle}</Text>
      <Text style={s.help}>{L.condSub}</Text>

      {/* ⚠️ THE TWO ANSWERS THAT ARE NOT THE SAME.
          "I looked and nothing was wrong" is a positive statement a buyer can
          rely on. Saying nothing is not. They are stored as different facts
          (`checked`), so they are ASKED as different answers — a single
          "everything fine" checkbox left unticked would record silence and a
          clean lot identically. */}
      <TouchableOpacity
        style={[s.wmCard, condChecked && condFlags.length === 0 && s.wmCardOn]}
        onPress={() => { setCondChecked(true); setCondFlags([]); }}
        activeOpacity={0.85}
      >
        <Ionicons
          name={condChecked && condFlags.length === 0 ? 'radio-button-on' : 'radio-button-off'}
          size={17}
          color={condChecked && condFlags.length === 0 ? '#16A34A' : '#CBD5E1'}
        />
        <View style={{ flex: 1 }}>
          <Text style={[s.wmTitle, condChecked && condFlags.length === 0 && { color: '#111827' }]}>
            {L.condFineTitle}
          </Text>
          <Text style={s.wmSub}>{L.condFineSub}</Text>
        </View>
      </TouchableOpacity>

      <View style={s.condWrap}>
        {CONDITION_FLAGS.map((f) => {
          const on = condFlags.includes(f.key);
          return (
            <TouchableOpacity
              key={f.key}
              style={[s.condChip, on && (f.severity === 'serious' ? s.condChipSerious : s.condChipOn)]}
              onPress={() => toggleFlag(f.key)}
              activeOpacity={0.85}
            >
              {on && (
                <Ionicons
                  name="checkmark"
                  size={12}
                  color={f.severity === 'serious' ? '#B91C1C' : '#15803D'}
                />
              )}
              <Text
                style={[
                  s.condChipText,
                  on && { color: f.severity === 'serious' ? '#B91C1C' : '#15803D' },
                ]}
              >
                {L[f.labelKey]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {condFlags.length > 0 && (
        <TextInput
          style={s.input}
          value={condNote}
          onChangeText={setCondNote}
          placeholder={L.condNotePlaceholder}
          placeholderTextColor="#9CA3AF"
          maxLength={300}
        />
      )}

      {/* Says what it is and is not, on the same screen as the confirm button.
          A recorder must not be able to believe they are grading. */}
      <Text style={s.condDisclaimer}>{L.condNotAGrade}</Text>
    </View>
  );

  // ── WHY THIS RECORDER IS NOT BEING ASKED FOR A GRADE ────────────────────
  // Shown INSTEAD of the grade picker, never as a blank space. A missing
  // field reads as an oversight; a stated refusal reads as a decision, and it
  // is the decision that makes the rest of the record trustworthy.
  const NoGradingPanel = (
    <View style={s.noGradeCard}>
      <View style={s.noGradeHead}>
        <Ionicons name="information-circle-outline" size={15} color="#1D4ED8" />
        <Text style={s.noGradeTitle}>{L.noGradeTitle}</Text>
      </View>
      <Text style={s.noGradeBody}>{L.noGradeBody}</Text>
      {!!declaredGrade && (
        <Text style={s.noGradeDeclared}>{L.gradeDeclaredPrefix} {declaredGrade}</Text>
      )}
    </View>
  );

  const GradePicker = (
    <View style={{ marginTop: 18 }}>
      <Text style={s.fieldLabel}>{L.gradeTitle}</Text>
      <Text style={s.help}>{L.gradeSub}</Text>
      {!!declaredGrade && (
        <Text style={s.gradeDeclaredLine}>{L.gradeDeclaredPrefix} {declaredGrade}</Text>
      )}

      {[
        [GRADE_CHOICE.DECLARED, 'gradeSameTitle', 'gradeSameSub'],
        [GRADE_CHOICE.OBSERVED, 'gradeDiffTitle', 'gradeDiffSub'],
        [GRADE_CHOICE.NONE, 'gradeNoneTitle', 'gradeNoneSub'],
      ].map(([choice, titleKey, subKey]) => {
        const on = gradeChoice === choice;
        return (
          <TouchableOpacity
            key={choice}
            style={[s.wmCard, on && s.wmCardOn]}
            onPress={() => {
              setGradeChoice(choice);
              if (choice !== GRADE_CHOICE.OBSERVED) setGradeLetter(null);
            }}
            activeOpacity={0.85}
          >
            <Ionicons
              name={on ? 'radio-button-on' : 'radio-button-off'}
              size={17}
              color={on ? '#16A34A' : '#CBD5E1'}
            />
            <View style={{ flex: 1 }}>
              <Text style={[s.wmTitle, on && { color: '#111827' }]}>{L[titleKey]}</Text>
              <Text style={s.wmSub}>{L[subKey]}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {gradeChoice === GRADE_CHOICE.OBSERVED && (
        <View style={s.letterRow}>
          {GRADES.map((g) => {
            const on = gradeLetter === g;
            return (
              <TouchableOpacity
                key={g}
                style={[s.letter, on && s.letterOn]}
                onPress={() => setGradeLetter(g)}
                activeOpacity={0.85}
              >
                <Text style={[s.letterText, on && { color: '#fff' }]}>{g}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── WHAT THIS DOES, AND — THE IMPORTANT HALF — WHAT IT DOES NOT ──
          Shown on the same screen as the confirm button, never after it. A
          recorder must not be able to believe they are docking somebody's pay. */}
      {(cmp === 'downgrade' || cmp === 'observed_only') && (
        <View style={s.gradePanel}>
          <Text style={s.gradePanelTitle}>{L.gradeConseqTitle}</Text>
          <Text style={s.gradeHeadline}>
            {cmp === 'downgrade' ? L.gradeIsLower : L.gradeMaybeLower}
          </Text>
          <View style={s.conseqLine}>
            <Ionicons name="document-text-outline" size={14} color="#B45309" />
            <Text style={s.gradeConseqText}>{L.gradeDoesRecord}</Text>
          </View>
          <View style={s.conseqLine}>
            <Ionicons name="chatbubble-ellipses-outline" size={14} color="#B45309" />
            <Text style={s.gradeConseqText}>{L.gradeDoesAsk}</Text>
          </View>
          <View style={s.conseqLine}>
            <Ionicons name="close-circle-outline" size={14} color="#B45309" />
            <Text style={[s.gradeConseqText, { fontWeight: '800' }]}>{L.gradeNotPrice}</Text>
          </View>
          <View style={s.conseqLine}>
            <Ionicons name="shield-outline" size={14} color="#B45309" />
            <Text style={s.gradeConseqText}>{L.gradeNotInspection}</Text>
          </View>
          <View style={s.conseqLine}>
            <Ionicons name="alert-circle-outline" size={14} color="#B45309" />
            <Text style={s.gradeConseqText}>{L.gradeGrievance}</Text>
          </View>
        </View>
      )}

      {cmp === 'upgrade' && (
        <View style={s.conseqBox}>
          <Ionicons name="arrow-up-circle-outline" size={15} color="#B45309" />
          <Text style={s.conseqWarnText}>{L.gradeUpgradeNote}</Text>
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.wrap}>
        <View style={s.card}>
          <View style={s.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{st.farmerName}</Text>
              <Text style={s.meta}>
                {st.cropName}{orderedKg ? ` · ${orderedKg.toLocaleString('en-IN')} kg` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            {/* ── 1. WHICH OF THE THREE THINGS HAPPENED ──────────────── */}
            {step === 'choose' && (
              <View>
                <Text style={s.sub}>{L.chooseSub}</Text>

                <TouchableOpacity style={[s.opt, s.optGood]} onPress={() => setStep('full')} activeOpacity={0.85}>
                  <Ionicons name="checkmark-circle" size={20} color="#15803D" />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.optTitle, { color: '#15803D' }]}>{L.optFullTitle}</Text>
                    <Text style={s.optSub}>{L.optFullSub}</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={[s.opt, s.optWarn]} onPress={() => setStep('short')} activeOpacity={0.85}>
                  <Ionicons name="remove-circle" size={20} color="#B45309" />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.optTitle, { color: '#B45309' }]}>{L.optShortTitle}</Text>
                    <Text style={s.optSub}>{L.optShortSub}</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={[s.opt, s.optBad]} onPress={() => setStep('none')} activeOpacity={0.85}>
                  <Ionicons name="close-circle" size={20} color="#B91C1C" />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.optTitle, { color: '#B91C1C' }]}>{L.optNoneTitle}</Text>
                    <Text style={s.optSub}>{L.optNoneSub}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* ── 2a. FULL PICKUP — the farmer's own code ─────────────── */}
            {step === 'full' && (
              <View>
                <Text style={s.fieldLabel}>{L.otpLabel}</Text>
                <TextInput
                  style={s.otpInput} value={otp} onChangeText={setOtp}
                  keyboardType="number-pad" maxLength={4} placeholder="0000"
                  placeholderTextColor="#D1D5DB" autoFocus
                />
                <Text style={s.help}>{L.otpHelp}</Text>

                {/* Produce moved, so the kilograms need a provenance. Required
                    here too — /stop-outcome demands it on a FULL pickup as
                    much as on a short one, because "the ordered quantity" is
                    still a number nobody necessarily put on a scale. */}
                {WeightPicker}
                {canGrade ? GradePicker : NoGradingPanel}
                {ConditionPicker}
              </View>
            )}

            {/* ── 2b. SHORT PICKUP — kilograms, a reason, AND the code ── */}
            {step === 'short' && (
              <View>
                <Text style={s.fieldLabel}>{L.shortKgLabel}</Text>
                <TextInput
                  style={s.kgInput} value={kgText} onChangeText={setKgText}
                  keyboardType="numeric" placeholder="0"
                  placeholderTextColor="#D1D5DB" autoFocus
                />
                <Text style={s.help}>{L.shortKgHelp}</Text>

                {ReasonPicker}

                <Text style={[s.fieldLabel, { marginTop: 14 }]}>{L.otpLabel}</Text>
                <TextInput
                  style={s.otpInput} value={otp} onChangeText={setOtp}
                  keyboardType="number-pad" maxLength={4} placeholder="0000"
                  placeholderTextColor="#D1D5DB"
                />
                {/* A short pickup is still a pickup: the farmer IS at the gate. */}
                <Text style={s.help}>{L.otpShortHelp}</Text>

                <View style={s.conseqBox}>
                  <Ionicons name="information-circle-outline" size={15} color="#B45309" />
                  <Text style={s.conseqWarnText}>{L.shortConsequence}</Text>
                </View>

                {/* A short pickup is where provenance matters MOST: the
                    kilograms typed here are the ones the farmer is paid on. */}
                {WeightPicker}
                {canGrade ? GradePicker : NoGradingPanel}
                {ConditionPicker}
              </View>
            )}

            {/* ── 2c. NOTHING COLLECTED — no code, and the consequence in
                     full, on the same screen as the button ───────────── */}
            {step === 'none' && (
              <View>
                {ReasonPicker}

                <Text style={[s.fieldLabel, { marginTop: 14 }]}>{L.noteLabel}</Text>
                <TextInput
                  style={s.noteInput} value={note} onChangeText={setNote}
                  placeholder={L.notePlaceholder} placeholderTextColor="#D1D5DB"
                  multiline maxLength={500}
                />

                <View style={s.conseqPanel}>
                  <Text style={s.conseqTitle}>{L.consequenceTitle}</Text>

                  <View style={s.conseqLine}>
                    <Ionicons name="close-circle-outline" size={14} color="#B91C1C" />
                    <Text style={s.conseqText}>{L.conseqCancel}</Text>
                  </View>
                  <View style={s.conseqLine}>
                    <Ionicons name="refresh-outline" size={14} color="#B45309" />
                    <Text style={s.conseqText}>{L.conseqRestock}</Text>
                  </View>
                  <View style={s.conseqLine}>
                    <Ionicons name="cash-outline" size={14} color="#B45309" />
                    <Text style={s.conseqText}>
                      {st.fareShare ? `${money(st.fareShare)} — ` : ''}{L.conseqFare}
                    </Text>
                  </View>
                </View>

                {/* The OTP exemption, said out loud, with the name that
                    replaces it. Never a silent skip. */}
                <View style={s.accountBox}>
                  <Ionicons name="person-outline" size={15} color="#1D4ED8" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.accountText}>{L.conseqNoOtp}</Text>
                    <Text style={[s.accountText, { marginTop: 6, fontWeight: '700' }]}>{recorderLine}</Text>
                    <Text style={[s.accountText, { marginTop: 6 }]}>{L.conseqDispute}</Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* ── actions ─────────────────────────────────────────────── */}
          {step !== 'choose' && (
            <View style={s.actions}>
              <TouchableOpacity style={[s.btn, s.ghost]} onPress={() => setStep('choose')} disabled={busy}>
                <Text style={s.ghostText}>{L.backLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btn, step === 'none' ? s.danger : s.primary, busy && { opacity: 0.6 }]}
                onPress={() => {
                  if (step === 'full') return submit(OUTCOME.FULL);
                  if (step === 'short') return submit(OUTCOME.SHORT);
                  return confirmFailure();
                }}
                disabled={busy}
                activeOpacity={0.85}
              >
                {busy
                  ? <ActivityIndicator color="#fff" size="small" />
                  : (
                    <Text style={s.primaryText}>
                      {step === 'full' ? L.submitFull : step === 'short' ? L.submitShort : L.submitNone}
                    </Text>
                  )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1, backgroundColor: 'rgba(17,24,39,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '100%' },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  name: { fontSize: 18, fontWeight: '800', color: '#111827' },
  meta: { fontSize: 12.5, color: '#6B7280', marginTop: 2 },
  sub: { fontSize: 12.5, color: '#6B7280', lineHeight: 18, marginBottom: 12 },

  opt: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 14, borderWidth: 1.5, padding: 13, marginBottom: 10,
  },
  optGood: { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' },
  optWarn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  optBad: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  optTitle: { fontSize: 14, fontWeight: '800' },
  optSub: { fontSize: 11.5, color: '#6B7280', marginTop: 3, lineHeight: 16 },

  fieldLabel: { fontSize: 12.5, fontWeight: '700', color: '#374151' },
  help: { fontSize: 11.5, color: '#9CA3AF', marginTop: 7, lineHeight: 16 },

  otpInput: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14,
    fontSize: 28, fontWeight: '800', color: '#111827', textAlign: 'center',
    letterSpacing: 12, paddingVertical: 11, marginTop: 8,
  },
  kgInput: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14,
    fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center',
    paddingVertical: 11, marginTop: 8,
  },
  noteInput: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    fontSize: 13, color: '#111827', padding: 11, marginTop: 8,
    minHeight: 62, textAlignVertical: 'top',
  },

  reasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderRadius: 11, borderWidth: 1.5, borderColor: '#F1F5F9',
    paddingHorizontal: 11, paddingVertical: 10, marginTop: 7,
  },
  reasonRowOn: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  reasonText: { flex: 1, fontSize: 13, color: '#374151' },
  reasonTextOn: { fontWeight: '700', color: '#111827' },

  conseqBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 12, padding: 11, marginTop: 14,
  },
  conseqWarnText: { flex: 1, fontSize: 11.5, color: '#92400E', lineHeight: 16 },

  conseqPanel: { backgroundColor: '#FEF2F2', borderRadius: 14, padding: 12, marginTop: 14 },
  conseqTitle: {
    fontSize: 10, fontWeight: '800', color: '#B91C1C',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  conseqLine: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 7 },
  conseqText: { flex: 1, fontSize: 11.5, color: '#7F1D1D', lineHeight: 16 },

  // The weight/grade option cards. ONE style for all four weight methods, on
  // purpose: `estimated` must not read as the lesser option, so it gets the
  // same border, the same padding and the same neutral ground as a weighbridge.
  wmCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 9,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#F1F5F9',
    backgroundColor: '#fff', padding: 11, marginTop: 8,
  },
  wmCardOn: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  wmTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  wmTitle: { fontSize: 13, fontWeight: '700', color: '#374151' },
  wmSub: { fontSize: 11, color: '#6B7280', lineHeight: 15.5, marginTop: 3 },
  wmAffirm: { fontSize: 11, color: '#15803D', lineHeight: 15.5, marginTop: 5, fontWeight: '600' },
  indTag: { backgroundColor: '#DBEAFE', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  indTagText: { fontSize: 9.5, fontWeight: '800', color: '#1D4ED8' },

  claimBox: {
    flexDirection: 'row', gap: 7, alignItems: 'flex-start',
    backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginTop: 8,
  },
  claimText: { flex: 1, fontSize: 11, color: '#334155', lineHeight: 15.5 },

  refInput: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    fontSize: 14, color: '#111827', paddingHorizontal: 11, paddingVertical: 10, marginTop: 8,
  },

  gradeDeclaredLine: { fontSize: 12, fontWeight: '700', color: '#1D4ED8', marginTop: 8 },
  letterRow: { flexDirection: 'row', gap: 9, marginTop: 9 },
  letter: {
    flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingVertical: 11, alignItems: 'center',
  },
  letterOn: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  condWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  condChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999,
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
  },
  condChipOn: { borderColor: '#16A34A', backgroundColor: '#DCFCE7' },
  // A serious flag reads differently from a notable one, because "not the crop
  // that was ordered" is a different kind of statement from "a bit damp".
  condChipSerious: { borderColor: '#DC2626', backgroundColor: '#FEE2E2' },
  condChipText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  condDisclaimer: { fontSize: 11, color: '#6B7280', lineHeight: 16, marginTop: 10 },

  noGradeCard: {
    marginTop: 18, backgroundColor: '#EFF6FF', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#DBEAFE',
  },
  noGradeHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  noGradeTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1E3A8A' },
  noGradeBody: { fontSize: 12, color: '#1E40AF', lineHeight: 17 },
  noGradeDeclared: { fontSize: 12, color: '#1E3A8A', fontWeight: '700', marginTop: 6 },

  letterText: { fontSize: 16, fontWeight: '800', color: '#374151' },

  gradePanel: { backgroundColor: '#FFFBEB', borderRadius: 14, padding: 12, marginTop: 12 },
  gradePanelTitle: {
    fontSize: 10, fontWeight: '800', color: '#B45309',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7,
  },
  gradeHeadline: { fontSize: 12, fontWeight: '800', color: '#92400E', lineHeight: 17, marginBottom: 8 },
  gradeConseqText: { flex: 1, fontSize: 11.5, color: '#92400E', lineHeight: 16 },

  accountBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#EFF6FF', borderRadius: 14, padding: 12, marginTop: 10,
  },
  accountText: { fontSize: 11.5, color: '#1E3A8A', lineHeight: 16 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  ghost: { backgroundColor: '#F1F5F9' },
  ghostText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  primary: { backgroundColor: '#16A34A' },
  danger: { backgroundColor: '#B91C1C' },
  primaryText: { fontSize: 13.5, fontWeight: '700', color: '#fff' },
});

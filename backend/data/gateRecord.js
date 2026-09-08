// data/gateRecord.js
//
// WHAT A PERSON STANDING AT THE FARM GATE CAN ACTUALLY ATTEST TO.
//
// Two facts decide what a buyer pays and what a farmer is owed — the WEIGHT
// and the GRADE — and until now this app asserted both twice and measured
// neither.
//
//   WEIGHT was typed by the farmer when they listed, and typed again by the
//   captain at pickup (`collected_short`). Two unverified numbers, no scale
//   anywhere in the model, and the second one directly reduces a farmer's pay.
//   The product's own vocabulary already knows weighing is a real, charged,
//   physical act — `recordSale.dedWeighing` / 'वजनाई' is a line item on every
//   mandi sale this app records — but nothing anywhere said WHERE a kilogram
//   figure came from.
//
//   GRADE is self-declared against the AGMARK criteria in data/gradeSpecs.js
//   and nobody checks it (see that file's own warning). Since grade lots carry
//   a price spread, a self-declared grade nobody looks at invites exactly the
//   fraud grade separation exists to prevent.
//
// THE MOMENT ALREADY EXISTS. A pickup is a real person looking at real
// produce, and `stops[].outcome` already records what actually went on the
// vehicle. This module is the vocabulary that moment writes in — it does not
// invent a separate inspection or reservation step, because a second gate
// would be a second place for the record to be wrong.
//
// ⚠️ NOTHING HERE ADJUDICATES ANYTHING. Every value below is a RECORD of what
// somebody said they saw. No price is derived from it, no grade is overruled,
// and no weight is corrected. That is the same rule the dispute engine is
// written under (CLAUDE.md: "the app does not adjudicate disputes") and the
// same reason `grade.selfDeclared` exists rather than a silent trust score.

const { GRADE_LABELS } = require('./gradeSpecs');

/**
 * HOW THE KILOGRAM FIGURE WAS ESTABLISHED.
 *
 * A fixed list, same rule as Dispute.reason and stops[].failureReason: "on the
 * weighbridge" is countable and comparable, "we weighed it properly" is not.
 *
 * `weighed` — was an instrument involved at all.
 * `independent` — did somebody with no stake in this trade produce the number.
 *   TRUE FOR EXACTLY ONE VALUE, and that is the point: a public weighbridge
 *   issues a ticket a farmer and a buyer can both hold up. An FPO's own scale
 *   is the seller's group's instrument; a farm scale is the seller's own. Both
 *   are real weighings and both are better than nothing, and neither is
 *   evidence in an argument the way a ticket is.
 */
const WEIGHT_METHODS = {
  collection_centre_scale: {
    label: 'Weighed on the collection centre scale',
    weighed: true,
    independent: false,
    note: "Weighed on the FPO's or collection point's own scale. A real weighing, on the seller's "
      + "group's own instrument — not an independent one.",
  },
  public_weighbridge: {
    label: 'Weighed at a public weighbridge',
    // The domain word. A काटा ticket is the one weight record in this trade
    // that a farmer and a buyer can both produce in an argument.
    localLabel: 'वजन काटा',
    weighed: true,
    independent: true,
    note: 'Weighed at a public weighbridge, which issues a ticket both parties can produce. The only '
      + 'weight on this list that does not depend on trusting whoever typed it.',
  },
  farm_scale: {
    label: "Weighed on the farm's own scale",
    weighed: true,
    independent: false,
    note: "Weighed at the gate on the farmer's own scale or spring balance. Real, but uncertified and "
      + 'unwitnessed.',
  },
  // INCLUDED DELIBERATELY, AND IT IS THE HONEST DEFAULT FOR MOST OF INDIA.
  // Most farm-gate pickups have no scale within reach: the number is bags
  // counted and multiplied, or an experienced eye. Leaving this value out
  // would not make those pickups weighed — it would make them PRESENT as
  // weighed, which is precisely the lie this field exists to stop telling.
  estimated: {
    label: 'Estimated — not weighed',
    weighed: false,
    independent: false,
    note: 'Nobody weighed this. The figure is bags or crates counted and multiplied, or judged by eye. '
      + 'Treat it as an estimate in any settlement or dispute.',
  },
  // SERVER-SET ONLY, and never postable — the same discipline as
  // failureReason: 'run_abandoned'. It marks a pickup recorded through the
  // legacy POST /collect route, which predates this field and asks nothing.
  //
  // It is NOT folded into `estimated`: "somebody judged it by eye" and "the
  // app never asked" are different facts, and collapsing them would credit an
  // unanswered form with a human estimate that nobody actually made.
  not_recorded: {
    label: 'Not recorded',
    weighed: false,
    independent: false,
    serverOnly: true,
    note: 'No weighing method was recorded for this pickup. The quantity is the figure that was '
      + 'ordered or typed in; nothing says where it came from.',
  },
};

/** The four a recorder at the gate may actually post. */
const POSTABLE_WEIGHT_METHODS = Object.entries(WEIGHT_METHODS)
  .filter(([, m]) => !m.serverOnly).map(([k]) => k);

const WEIGHT_NOT_RECORDED = 'not_recorded';

const WEIGHT_DISCLAIMER =
  'This app records how a weight was established. It does not weigh anything, and it does not '
  + 'correct a weight that looks wrong — the remedy for a disputed quantity is a grievance against '
  + 'the order.';

/**
 * One weight figure, with its provenance, in the shape every screen should
 * print it. Written once here so no surface can quietly drop the provenance
 * and present an estimate as a measurement.
 *
 * `kg` is passed through untouched. This function never adjusts a number.
 */
function describeWeight(method, ref = '', kg = null) {
  const key = method && WEIGHT_METHODS[method] ? method : null;
  const m = key ? WEIGHT_METHODS[key] : null;
  return {
    kg,
    method: key,
    label: m ? m.label : 'Not recorded',
    localLabel: m?.localLabel || null,
    // The two booleans a UI actually branches on. Both false when nothing is
    // recorded — an absent provenance is never treated as a good one.
    weighed: !!m?.weighed,
    independent: !!m?.independent,
    ref: String(ref || ''),
    note: m ? m.note : WEIGHT_METHODS.not_recorded.note,
    disclaimer: WEIGHT_DISCLAIMER,
  };
}

/**
 * A run's or a purchase's weights, rolled up.
 *
 * Deliberately reports MEASURED KILOGRAMS beside UNWEIGHED KILOGRAMS rather
 * than a single "verified: true/false" flag: a five-farm run where four farms
 * were weighed and the biggest one was eyeballed is not honestly described by
 * either flag, and the kilograms are what a buyer chasing a shortfall needs.
 *
 * `rows` are anything carrying { collectedKg, weight: { method } }.
 */
function summariseWeights(rows) {
  const moved = (rows || []).filter((r) => (r.collectedKg ?? 0) > 0);
  const weighedKg = moved
    .filter((r) => WEIGHT_METHODS[r.weight?.method]?.weighed)
    .reduce((a, r) => a + (r.collectedKg || 0), 0);
  const independentKg = moved
    .filter((r) => WEIGHT_METHODS[r.weight?.method]?.independent)
    .reduce((a, r) => a + (r.collectedKg || 0), 0);
  const totalKg = moved.reduce((a, r) => a + (r.collectedKg || 0), 0);
  const methods = [...new Set(moved.map((r) => r.weight?.method || WEIGHT_NOT_RECORDED))];

  return {
    totalKg,
    weighedKg,
    // Named for what it is. `totalKg - weighedKg` would read as a rounding
    // remainder; these kilograms are the ones nobody put on a scale.
    unweighedKg: totalKg - weighedKg,
    independentKg,
    methods,
    allWeighed: totalKg > 0 && weighedKg === totalKg,
    anyUnweighed: totalKg > 0 && weighedKg < totalKg,
    note: totalKg === 0
      ? 'Nothing was collected, so there is no weight to account for.'
      : weighedKg === totalKg
        ? 'Every kilogram on this run was put on a scale. See each stop for which scale.'
        : `${totalKg - weighedKg} kg of ${totalKg} kg was never weighed — counted or estimated at the `
          + 'gate. Do not present that share as a measured quantity.',
    disclaimer: WEIGHT_DISCLAIMER,
  };
}

// ── WHO MAY PUT A LETTER ON SOMEBODY'S CROP ───────────────────────────────
//
// ═══ THE SPLIT, AND WHY IT IS NOT A PERMISSIONS DETAIL ═══════════════════
//
// Grading against the AGMARK criteria in data/gradeSpecs.js is a skilled
// judgement about size, colour uniformity, blemish tolerance and maturity. It
// is a thing a person can be WRONG about, and the person it is wrong about is
// the farmer, whose reputation it reaches.
//
//   AN FPO's OWN RUN (own/contracted transport) — the recorder is the group's
//   own driver at the gate, or an accompanying grader, or the group's office
//   keying in what they reported. These are FPO PEOPLE who handle this crop
//   every season and whose group's name is on the sale. Grading here is a
//   genuine advantage of aggregating, and it is honest.
//
//   A HIRED RUN (the public captain pool) — the recorder is an independent
//   truck driver. Asking them to put a letter on somebody's onion is asking
//   them to certify something they are not qualified to judge, about produce
//   they will never see again, in a trade where that letter carries a price
//   premium. So THE APP DOES NOT ASK, and says so rather than pretending the
//   check exists. A grade field a captain taps through would be strictly worse
//   than the self-declared grade it was meant to police: it would launder one
//   unverified claim into a second one wearing the word "observed".
//
// ⚠️ THE ALTERNATIVE WAS TRIED ON PAPER AND IS WORSE. "Let the captain grade,
// and mark it low-confidence" produces a `discrepancy: 'downgrade'` on the
// record — which the farmer must then answer, and which the buyer reads — from
// somebody with no standing to make the claim. A refusal that is visible beats
// a check that is decorative.
//
// WHAT A CAPTAIN CAN STILL DO IS CONDITION, BELOW. That is deliberately not a
// weaker grade: it is a different KIND of statement, one that needs eyes and
// not expertise.
const GRADING_ROLES = ['fpo_driver', 'fpo_admin'];

/** Can this recorder legitimately put a grade letter on the lot? */
const mayGradeAtGate = (actorRole) => GRADING_ROLES.includes(actorRole);

const GRADING_REFUSED_NOTE =
  'A captain from the public pool drives this run. This app does not ask a truck driver to grade '
  + "somebody's crop — that is a skilled judgement about size, colour and blemish tolerance, and a "
  + 'letter recorded by someone not qualified to give it would be worse than no letter at all. The '
  + "farmer's declared grade stands, unchecked and labelled unchecked, and the buyer judges the lot "
  + 'on arrival — a grievance against the order is where a quality disagreement is settled.';

// ── WHAT ANYONE WITH EYES CAN SAY ─────────────────────────────────────────
//
// CONDITION IS NOT A GRADE AND MUST NEVER BE PRESENTED AS ONE. A grade is a
// letter against published criteria; these are plain observations that need no
// training, no scale and no spec:
//
//   "this is not the crop on the order"        — anybody can see that
//   "these onions are wet and sprouting"       — anybody can see that
//   "Grade A rather than Grade B"              — NOT anybody. That is grading.
//
// So every recorder may set these, on a hired run and on an FPO's own run
// alike. They are the honest floor: the thing an independent driver genuinely
// is in a position to attest to.
//
// A fixed list, same rule as Dispute.reason and stops[].failureReason. Two of
// these deliberately mirror Dispute reasons exactly (`wrong_crop`,
// `quality_not_as_described`) so a grievance raised later can point at a
// gate observation that used the same word.
const CONDITION_FLAGS = {
  wrong_crop: {
    label: 'Not the crop that was ordered',
    // The one flag that is not about quality at all. It is the most serious
    // and the least arguable — nobody needs a spec to tell onion from garlic.
    severity: 'serious',
    note: 'The recorder says the produce at the gate is not the crop the order names.',
  },
  visibly_spoiled: {
    label: 'Visibly rotten or mouldy',
    severity: 'serious',
    note: 'Visible rot or mould at the gate. Not a measurement and not a percentage — what the '
      + 'recorder could see.',
  },
  sprouting: {
    label: 'Sprouting',
    localLabel: 'कोंब आलेला',
    severity: 'notable',
    note: 'Sprouting was visible. Common in onion and potato held past their window; it affects '
      + 'what a buyer will pay and it is not a grade.',
  },
  wet: {
    label: 'Wet, or stored damp',
    severity: 'notable',
    note: 'The lot was wet or damp at the gate. It carries water weight and it will not hold.',
  },
  damaged: {
    label: 'Crushed, cut or badly bruised',
    severity: 'notable',
    note: 'Visible physical damage to the produce itself.',
  },
  packaging_damaged: {
    label: 'Bags or crates torn, leaking or broken',
    severity: 'minor',
    note: 'The packaging was damaged. Says nothing about the produce inside it.',
  },
};

const CONDITION_FLAG_KEYS = Object.keys(CONDITION_FLAGS);

// ⚠️ THERE IS DELIBERATELY NO "quantity looks short" FLAG.
//
// The app already answers that question PRECISELY and with provenance: the
// `collected_short` outcome carries `collectedKg` beside `orderedKg`, and
// `weight.method` says how that figure was arrived at. An eyeball flag beside a
// recorded number would be a second answer to one question, and the only thing
// two answers to one question reliably produce is a disagreement between them.
// Where the two would differ, the number wins, so the flag would never be the
// one anybody acted on.
const CONDITION_QUANTITY_NOTE =
  'Quantity is not a condition flag. What actually left the farm is recorded as a weight, with how '
  + 'it was established — see the weight block.';

const CONDITION_DISCLAIMER =
  'A condition note is what the person collecting the lot could SEE. It is not a grade, not an '
  + 'inspection and not a measurement, it changes no price and no payout, and the app does not act '
  + 'on it. The buyer judges the lot on arrival; a grievance against the order is where a quality '
  + 'disagreement is settled.';

/**
 * One condition observation, in the shape every screen should print it.
 *
 * ⚠️ `checked: false` AND `checked: true` WITH NO FLAGS ARE DIFFERENT FACTS AND
 * ARE NEVER COLLAPSED — the same distinction weight's `not_recorded` draws
 * against `estimated`. "Nobody looked" and "somebody looked and saw nothing
 * wrong" are opposite pieces of evidence in an argument about a bad lot, and a
 * single "no problems reported" would report the first as the second.
 */
function describeCondition(cond) {
  const checked = !!cond?.checked;
  const raw = Array.isArray(cond?.flags) ? cond.flags : [];
  const flags = raw.filter((f) => CONDITION_FLAG_KEYS.includes(f));
  const items = flags.map((f) => ({ key: f, ...CONDITION_FLAGS[f] }));

  return {
    checked,
    flags,
    items,
    // The one boolean a list row branches on. False when nothing was checked —
    // an absent observation is never rendered as a clean one.
    anyIssue: checked && flags.length > 0,
    // Named for what it is, and only true when somebody actually looked.
    lookedAndFoundNothing: checked && flags.length === 0,
    serious: items.some((i) => i.severity === 'serious'),
    note: String(cond?.note || ''),
    summary: !checked
      ? 'Nobody recorded what this lot looked like at the gate.'
      : flags.length === 0
        ? 'The person who collected this lot looked and reported nothing visibly wrong. That is an '
          + 'observation, not an inspection, and it is not a grade.'
        : `The person who collected this lot reported: ${items.map((i) => i.label).join('; ')}.`,
    quantityNote: CONDITION_QUANTITY_NOTE,
    disclaimer: CONDITION_DISCLAIMER,
  };
}

/** Validate a posted condition. Returns { ok, checked, flags, unknown }. */
function parseCondition(body) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body || {}, k);
  if (!has('conditionChecked') && !has('conditionFlags'))
    return { ok: true, checked: false, flags: [], unknown: [], provided: false };

  const flagsRaw = Array.isArray(body.conditionFlags) ? body.conditionFlags : [];
  const unknown = flagsRaw.filter((f) => !CONDITION_FLAG_KEYS.includes(f));
  if (unknown.length) return { ok: false, checked: false, flags: [], unknown, provided: true };

  const flags = [...new Set(flagsRaw)];
  // Naming a flag IS looking. A caller that sends flags without the boolean
  // has plainly checked, and reading that as "not checked" would throw away
  // the observation they just made.
  const checked = flags.length > 0 ? true : body.conditionChecked === true;
  return { ok: true, checked, flags, unknown: [], provided: true };
}

// ── GRADE, AS OBSERVED AT THE GATE ────────────────────────────────────────

const GRADE_RANK = { A: 3, B: 2, C: 1 };

/**
 * What the recorder saw, against what the farmer declared.
 *
 *   match          the lot is what it said it was
 *   downgrade      observed BELOW the declaration — the only one that is
 *                  evidence of anything, and even then only a claim until the
 *                  farmer answers it (see the farmer response on the stop)
 *   upgrade        observed ABOVE the declaration. Recorded, and deliberately
 *                  costs nobody anything: a farmer who undersold their own lot
 *                  is not a problem to be policed, and the buyer is getting
 *                  more than they paid for.
 *   observed_only  nothing was declared (most listings carry no grade) but the
 *                  recorder noted one. A fact about the lot, NOT a discrepancy
 *                  — there was no declaration to fall short of.
 *   null           nothing observed, so nothing to say.
 */
const GRADE_DISCREPANCIES = ['match', 'downgrade', 'upgrade', 'observed_only'];

function compareGrades(declared, observed) {
  if (!observed) return null;
  if (!declared) return 'observed_only';
  const d = GRADE_RANK[declared] || 0;
  const o = GRADE_RANK[observed] || 0;
  if (o === d) return 'match';
  return o < d ? 'downgrade' : 'upgrade';
}

/** How a farmer answered a recorded downgrade. `null` = they have not yet. */
const GRADE_RESPONSES = ['accepted', 'contested'];

const GRADE_DISCREPANCY_NOTE = {
  match: 'The grade recorded at the gate matches what the farmer declared.',
  downgrade:
    'The person who collected this lot recorded a LOWER grade than the farmer declared. This app '
    + 'records that difference and does nothing else with it: the price is unchanged, the payout is '
    + 'unchanged, and nothing has been decided. If the lot is not what you paid for, raise a '
    + 'grievance against the order — that is where the money is settled.',
  upgrade:
    'The person who collected this lot recorded a HIGHER grade than the farmer declared. Nothing is '
    + 'repriced: the farmer sold at their own asking price and the buyer is getting at least what '
    + 'they paid for.',
  observed_only:
    'The farmer declared no grade for this lot — most listings do not. The person who collected it '
    + 'recorded what they saw. It is an observation, not a discrepancy.',
};

const GRADE_RESPONSE_NOTE = {
  accepted:
    'The farmer AGREED the lot was the lower grade. That is a concession, and it is the only thing '
    + "on this record that reaches the farmer's reputation (services/trustService.js).",
  contested:
    'The farmer DISAGREED with the grade recorded at the gate. It stays on the record as a claim by '
    + "the person who collected it, and it does not count against the farmer's reputation. The "
    + 'remedy is a grievance against the order.',
};

/**
 * One grade check, in the shape every screen should print it.
 * `g` is the stored { declared, observed, discrepancy, farmerResponse } block.
 */
function describeGradeCheck(g) {
  const declared = g?.declared || null;
  const observed = g?.observed || null;
  const discrepancy = g?.discrepancy || compareGrades(declared, observed);
  const farmerResponse = g?.farmerResponse || null;
  return {
    declared,
    declaredLabel: declared ? GRADE_LABELS[declared] : null,
    observed,
    observedLabel: observed ? GRADE_LABELS[observed] : null,
    discrepancy,
    // The one boolean a buyer's list row branches on.
    differs: discrepancy === 'downgrade' || discrepancy === 'upgrade',
    // Narrower, and it is the one that matters: only a downgrade is worth
    // anybody's attention, and only a downgrade can be answered.
    downgraded: discrepancy === 'downgrade',
    farmerResponse,
    farmerRespondedAt: g?.farmerRespondedAt || null,
    priceChanged: false,
    note: discrepancy ? GRADE_DISCREPANCY_NOTE[discrepancy] : null,
    responseNote: farmerResponse ? GRADE_RESPONSE_NOTE[farmerResponse] : null,
    // Stated on every single grade block, so no screen can render a
    // discrepancy in a way that implies the app did something about it.
    disclaimer:
      'Grades are declared by the farmer and, where recorded, observed by whoever collected the lot. '
      + 'Neither is an inspection and this app never reprices a lot on either.',
  };
}

module.exports = {
  GRADING_ROLES,
  mayGradeAtGate,
  GRADING_REFUSED_NOTE,
  CONDITION_FLAGS,
  CONDITION_FLAG_KEYS,
  CONDITION_DISCLAIMER,
  CONDITION_QUANTITY_NOTE,
  describeCondition,
  parseCondition,
  WEIGHT_METHODS,
  POSTABLE_WEIGHT_METHODS,
  WEIGHT_NOT_RECORDED,
  WEIGHT_DISCLAIMER,
  describeWeight,
  summariseWeights,
  GRADE_RANK,
  GRADE_DISCREPANCIES,
  GRADE_RESPONSES,
  GRADE_DISCREPANCY_NOTE,
  GRADE_RESPONSE_NOTE,
  compareGrades,
  describeGradeCheck,
};

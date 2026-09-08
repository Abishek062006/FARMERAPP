// services/disputeEvidenceService.js
//
// ONE GRIEVANCE, WITH EVERYTHING THIS APP ACTUALLY RECORDED ABOUT IT.
//
// ═══ WHAT THIS IS NOT, AND THE DECISION BEHIND IT ═════════════════════════
//
// It is NOT an arbitration engine, a customer-care queue, a fault score or a
// recommendation. This app does not adjudicate disputes — that rule predates
// this file (CLAUDE.md, models/Dispute.js: "It records what was claimed, with
// photos, and what the two parties agreed"), and building a team to decide who
// is right is a staffing commitment, not a feature.
//
// ⚠️ NOTHING BELOW RANKS, SCORES OR CONCLUDES. There is no "likely at fault"
// field and there must never be one. `recordStrength` describes the quality of
// the RECORD — whether anybody weighed the lot on a public weighbridge, whether
// anybody looked at it — and says nothing whatever about either party.
//
// ═══ WHAT IT IS ═══════════════════════════════════════════════════════════
//
// A human still has to decide: the FPO, the buyer, an APMC officer, or the two
// parties across a table. This app already holds the things that decision turns
// on, scattered across four collections — who stood at the gate, how the weight
// was established, what the lot looked like, what grade was claimed against
// what was declared, whether the farmer CONCEDED it, when money was promised
// and when it arrived. Assembling that into one chronological trail is the
// entire contribution, and it is a real one: without it whoever arbitrates is
// reading four screens and a phone call.
//
// ═══ ⚠️ THE GAPS ARE PART OF THE EVIDENCE ════════════════════════════════
//
// `gaps` names what was NEVER recorded — nobody weighed it, nobody looked at
// it, no grade was ever asked for. That is the half most evidence bundles leave
// out, and it is often the half that decides the argument: "nobody weighed
// this" is the answer to a quantity dispute far more often than any number is.
// A trail that printed only what exists would read as more complete than the
// record actually is.

const {
  describeWeight, describeGradeCheck, describeCondition, WEIGHT_METHODS,
} = require('../data/gateRecord');
const { exposureFor } = require('./paymentExposureService');
const trustService = require('./trustService');

const DISCLAIMER =
  'This is a record, not a ruling. This app does not decide who is right in a dispute and does not '
  + 'take a side: everything below is what somebody entered, when they entered it, and under whose '
  + 'account. Where two people disagree, BOTH accounts are shown. A claim that nobody has agreed to '
  + 'is a claim, and it is labelled as one. Whoever arbitrates — the group, the buyer, an APMC '
  + 'officer, or the two of you — is the one deciding.';

const ROLE_LABEL = {
  farmer: 'the farmer',
  vendor: 'the buyer',
  agent: 'the captain (from the public pool)',
  fpo_driver: "the group's own driver, at the gate",
  fpo_admin: "the group's office, recording what its driver reported",
  fpo: 'the producer company',
};

const at = (d) => (d ? new Date(d).toISOString() : null);

/**
 * Assemble the trail. Every argument is optional except `dispute` and `order` —
 * a run that no longer exists, or a listing that was deleted, produces a GAP
 * rather than a throw, because an incomplete record is exactly the situation
 * this has to describe.
 */
async function buildEvidence({ dispute, order, consignment = null, listing = null }) {
  const po = order?.pickupOutcome || {};
  const gaps = [];
  const timeline = [];

  const add = (when, what, byRole = null, source = null) => {
    if (!when) return;
    timeline.push({ at: at(when), what, byRole, byRoleLabel: byRole ? ROLE_LABEL[byRole] || byRole : null, source });
  };

  // ── THE TRADE ──────────────────────────────────────────────────────────
  // ⚠️ `pickupOutcome.orderedKg` FIRST, NOT `quantityKg`. A short pickup
  // REWRITES `quantityKg` to what actually left the farm (see
  // routes/consignments.js), so reading it here would report the order as
  // having been placed for the short quantity — erasing the shortfall from the
  // one line of the trail that is supposed to establish it. That is the
  // shortfall the grievance is usually about.
  const orderedKg = po.orderedKg ?? order?.quantityKg;
  add(order?.createdAt, `Order placed: ${orderedKg} kg of ${order?.cropName} at `
    + `₹${order?.pricePerKg}/kg`, 'vendor', 'order');
  if (order?.settlement?.advance?.agreedAt)
    add(order.settlement.advance.agreedAt,
      `Advance of ₹${order.settlement.advance.agreedAmount} agreed `
      + `(${order.settlement.advance.agreedPct}% of the crop value)`, 'vendor', 'order');
  if (order?.settlement?.advance?.receivedAt)
    add(order.settlement.advance.receivedAt,
      `Farmer confirmed the ₹${order.settlement.advance.agreedAmount} advance arrived`,
      'farmer', 'order');
  add(order?.acceptedAt, 'A vehicle accepted the job', 'agent', 'order');

  // ── THE GATE ───────────────────────────────────────────────────────────
  //
  // The moment the whole argument usually turns on: one person, standing at a
  // farm, looking at real produce.
  const weight = describeWeight(po.weight?.method, po.weight?.ref, po.collectedKg ?? order?.quantityKg);
  const condition = describeCondition(po.condition);
  const grade = describeGradeCheck(po.grade);
  const recorderRole = po.recordedByRole || null;

  if (po.recordedAt) {
    add(po.recordedAt,
      `At the farm gate: ${po.outcome === 'not_collected' ? 'nothing was collected'
        : `${po.collectedKg} kg of ${po.orderedKg} kg collected`}`
      + ` · weight: ${weight.label}`
      + (condition.checked
        ? ` · looked at: ${condition.flags.length ? condition.flags.join(', ') : 'nothing visibly wrong'}`
        : ' · nobody recorded what it looked like')
      + (grade.observed ? ` · grade recorded: ${grade.observed}` : ''),
      recorderRole, 'gate');
  } else {
    // ⚠️ THE MOST IMPORTANT GAP IN THE FILE.
    gaps.push({
      what: 'No farm-gate record at all',
      why: 'Nothing was recorded when this crop was collected — no quantity, no weighing method '
        + 'and no observation of the lot. Every question about what actually left the farm rests '
        + 'on the two parties\' memories.',
      severity: 'high',
    });
  }

  if (po.recordedAt && !weight.weighed) {
    gaps.push({
      what: weight.method === 'estimated'
        ? 'The lot was never put on a scale'
        : 'No weighing method was recorded',
      why: weight.method === 'estimated'
        ? 'The quantity is bags counted and multiplied, or judged by eye. It is an honest answer '
          + 'and it is the common one at a farm gate — but it is not a measurement, and a dispute '
          + 'about quantity cannot be settled by treating it as one.'
        : 'Nothing says where the kilogram figure came from. It may have been weighed and it may '
          + 'not; the record does not say.',
      severity: 'high',
    });
  }
  if (po.recordedAt && weight.weighed && !weight.independent) {
    gaps.push({
      what: 'The weighing was not independent',
      why: `${weight.label}. A real weighing, but on an instrument belonging to one side. Only a `
        + 'public weighbridge issues a ticket both parties can produce.',
      severity: 'medium',
    });
  }
  if (po.recordedAt && !condition.checked) {
    gaps.push({
      what: 'Nobody recorded what the lot looked like',
      why: 'The person collecting it did not say whether anything was visibly wrong. That is not '
        + 'the same as saying it was fine — nothing was reported either way.',
      severity: 'medium',
    });
  }
  if (po.recordedAt && recorderRole === 'agent' && !grade.observed) {
    gaps.push({
      what: 'No grade was recorded at the gate, and none was asked for',
      why: 'A captain from the public pool collected this lot, and this app does not ask a truck '
        + 'driver to grade somebody\'s crop — it is a skilled judgement they are not qualified to '
        + 'make. The grade on this order is the FARMER\'S OWN DECLARATION and nobody checked it. '
        + 'That is a limitation of the record, not a finding against anyone.',
      severity: 'medium',
    });
  }
  if (recorderRole === 'fpo_admin') {
    gaps.push({
      what: 'The gate record was keyed in from the office, not at the gate',
      why: "The group's office recorded what its driver reported down a phone line. It is a real "
        + 'account of something that happened and it is how a paper trip sheet works — but it is '
        + 'second-hand, and it is weaker than a record typed by the person standing there.',
      severity: 'low',
    });
  }

  // ── THE GRADE CLAIM, AND WHETHER IT WAS EVER AGREED ────────────────────
  //
  // The single most misread thing in a dispute file. A recorded downgrade is
  // an ACCUSATION until the farmer answers it, and this app's settled rule is
  // that a complaint raised is not a complaint upheld.
  if (grade.downgraded) {
    add(po.recordedAt, `A LOWER grade was recorded than the farmer declared `
      + `(${grade.declared} declared, ${grade.observed} recorded)`, recorderRole, 'gate');
    if (po.grade?.farmerRespondedAt) {
      add(po.grade.farmerRespondedAt,
        po.grade.farmerResponse === 'accepted'
          ? 'The farmer AGREED the lot was the lower grade — a concession'
          : 'The farmer DISAGREED with the grade recorded at the gate',
        'farmer', 'gate');
    } else {
      gaps.push({
        what: 'The farmer has not answered the recorded downgrade',
        why: 'A lower grade recorded at the gate is a CLAIM by the person who collected the lot, '
          + 'not a finding. Until the farmer accepts or contests it, nobody has agreed it, and it '
          + 'must not be read as established.',
        severity: 'high',
      });
    }
  }

  // ── THE RUN ────────────────────────────────────────────────────────────
  if (consignment) {
    add(consignment.createdAt,
      `Collected on a shared run: ${consignment.stops?.length || 0} farms, `
      + `${consignment.transportMode || 'hired'} transport`, null, 'run');
    add(consignment.deliveredAt, 'The run reached the buyer', null, 'run');
    if (consignment.status === 'abandoned')
      add(consignment.abandonedAt || consignment.updatedAt,
        `The run was ABANDONED (${consignment.abandonment?.reason || 'reason not recorded'}) — `
        + 'this order\'s produce may never have reached the buyer', null, 'run');
  } else if (order?.consignmentId) {
    gaps.push({
      what: 'The collection run behind this order could not be read',
      why: 'This order rode on a shared vehicle whose record is not available here, so the other '
        + 'farms on that run and what happened at them are not in this trail.',
      severity: 'low',
    });
  }

  add(order?.deliveredAt, 'Delivered to the buyer', 'agent', 'order');
  add(order?.settlement?.paidAt,
    `Farmer recorded the crop payment as received in full (₹${order?.farmerPayout})`, 'farmer', 'order');

  // ── THE GRIEVANCE ITSELF ───────────────────────────────────────────────
  add(dispute.createdAt,
    `Grievance raised by ${ROLE_LABEL[dispute.raisedByRole] || dispute.raisedByRole}: `
    + `${dispute.reason.replace(/_/g, ' ')}`, dispute.raisedByRole, 'dispute');
  add(dispute.respondedAt, 'The other party answered', dispute.againstRole, 'dispute');
  add(dispute.resolution?.resolvedAt,
    `Closed as "${dispute.resolution?.outcome || 'no outcome recorded'}"`
    + (dispute.resolution?.amount != null ? ` · ₹${dispute.resolution.amount}` : ''),
    dispute.resolution?.resolvedByRole, 'dispute');

  if (dispute.status === 'resolved' && dispute.resolution?.resolvedBy === dispute.againstUid)
    gaps.push({
      what: 'This grievance was closed by the party it was raised AGAINST',
      why: 'Both parties can close a grievance in this app, and the record says which did. A '
        + 'dispute closed by the person complained about reads very differently from one closed '
        + 'by the complainant.',
      severity: 'medium',
    });
  if (!dispute.respondedAt && ['open', 'resolved'].includes(dispute.status))
    gaps.push({
      what: 'The other party never answered',
      why: 'Only one side of this is on the record. Silence is not agreement.',
      severity: 'medium',
    });
  if (!(dispute.photoIds || []).length)
    gaps.push({
      what: 'No photographs were attached',
      why: 'The grievance rests on its written description alone.',
      severity: 'low',
    });

  timeline.sort((a, b) => String(a.at).localeCompare(String(b.at)));

  // ── BOTH PARTIES' RECORDS, WITH THE REFUSAL INTACT ─────────────────────
  //
  // trustService refuses to band anybody below MIN_TRADES_TO_SCORE and returns
  // counts instead. That refusal is NOT relaxed here just because a dispute is
  // open — a thin record is exactly when a band would be most misleading and
  // most damaging.
  const [farmerTrust, buyerTrust] = await Promise.all([
    order?.farmerUid ? trustService.forFarmer(order.farmerUid).catch(() => null) : null,
    order?.vendorUid ? trustService.forVendor(order.vendorUid).catch(() => null) : null,
  ]);

  return {
    disclaimer: DISCLAIMER,
    // ⚠️ A DESCRIPTION OF THE RECORD, NOT OF THE PEOPLE. Read it as "how much
    // is actually documented here", never as "who is telling the truth".
    recordStrength: {
      hasGateRecord: !!po.recordedAt,
      weighed: !!weight.weighed,
      independentlyWeighed: !!weight.independent,
      conditionChecked: !!condition.checked,
      gradeObservedAtGate: !!grade.observed,
      // The ONE thing on this whole record that both sides have agreed to.
      farmerConcededGrade: grade.farmerResponse === 'accepted',
      bothSidesOnRecord: !!dispute.respondedAt,
      photoCount: (dispute.photoIds || []).length,
      gapCount: gaps.length,
      note: 'These say what the record CONTAINS. None of them is a judgement about either party, '
        + 'and a thin record is not evidence against anybody — most farm-gate pickups in this '
        + 'trade have no scale within reach.',
    },
    dispute: {
      id: dispute._id,
      reason: dispute.reason,
      description: dispute.description,
      status: dispute.status,
      raisedBy: { role: dispute.raisedByRole, label: ROLE_LABEL[dispute.raisedByRole], name: dispute.raisedByName },
      against: { role: dispute.againstRole, label: ROLE_LABEL[dispute.againstRole], name: dispute.againstName },
      raisedAt: at(dispute.createdAt),
      response: dispute.response || null,
      respondedAt: at(dispute.respondedAt),
      resolution: dispute.resolution || null,
      photoCount: (dispute.photoIds || []).length,
      claimNote: 'A grievance is one party\'s account. Raising one is not the same as it being '
        + 'upheld, and this app has never treated it as such.',
    },
    trade: {
      orderId: order?._id,
      crop: order?.cropName,
      orderedKg: po.orderedKg ?? order?.quantityKg ?? null,
      collectedKg: po.collectedKg ?? null,
      pricePerKg: order?.pricePerKg ?? null,
      priceSource: order?.priceSource || 'listing',
      cropTotal: order?.cropTotal ?? null,
      farmerPayout: order?.farmerPayout ?? null,
      status: order?.status,
      farmer: order?.farmerName,
      buyer: order?.vendorName,
      // Self-declared, and it keeps saying so.
      declaredGrade: listing?.grade?.code ?? po.grade?.declared ?? null,
      declaredGradeSelfDeclared: listing?.grade?.selfDeclared ?? true,
    },
    gate: {
      recordedAt: at(po.recordedAt),
      recordedByRole: recorderRole,
      recordedByRoleLabel: recorderRole ? ROLE_LABEL[recorderRole] || recorderRole : null,
      outcome: po.outcome || null,
      weight,
      condition,
      grade,
    },
    payment: order ? exposureFor(order) : null,
    timeline,
    // ⚠️ Sorted worst-first so a reader meets the load-bearing absences before
    // the cosmetic ones.
    gaps: gaps.sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity]),
    parties: {
      farmer: farmerTrust,
      buyer: buyerTrust,
      note: 'Both records are shown, for both parties, whichever of them raised this. They are '
        + 'histories of what was recorded elsewhere and say nothing about this grievance. Below a '
        + 'minimum number of completed trades neither is banded at all — counts only.',
    },
  };
}

const SEVERITY = { high: 3, medium: 2, low: 1 };

/**
 * The same trail as plain text, for somebody who is not in this app.
 *
 * ⚠️ THIS IS THE POINT OF THE WHOLE FEATURE. An APMC officer does not have an
 * account here, and neither does the elder both parties actually trust. The
 * app already sends CSV out through the OS share sheet rather than a download,
 * because Expo Go cannot write to Downloads and an authenticated URL arrives
 * without a token (CLAUDE.md). This uses the same road.
 */
function renderText(e, { orderId } = {}) {
  const L = [];
  const rule = '='.repeat(64);
  const soft = '-'.repeat(64);
  L.push(rule, 'GRIEVANCE RECORD', rule, '');
  L.push('⚠️  THIS IS A RECORD, NOT A RULING.');
  L.push(wrap(e.disclaimer, 64), '');
  L.push(soft, 'THE TRADE', soft);
  L.push(`Order            ${orderId || e.trade.orderId}`);
  L.push(`Crop             ${e.trade.crop}`);
  L.push(`Ordered          ${e.trade.orderedKg ?? '—'} kg`);
  L.push(`Collected        ${e.trade.collectedKg ?? '— (not recorded)'} kg`);
  L.push(`Price            ₹${e.trade.pricePerKg ?? '—'}/kg (${e.trade.priceSource})`);
  L.push(`Crop value       ₹${e.trade.cropTotal ?? '—'}`);
  L.push(`Farmer           ${e.trade.farmer}`);
  L.push(`Buyer            ${e.trade.buyer}`);
  L.push(`Declared grade   ${e.trade.declaredGrade || '— (none declared)'}`
    + `${e.trade.declaredGrade ? '  [SELF-DECLARED BY THE FARMER, NOT INSPECTED]' : ''}`);
  L.push('');
  L.push(soft, 'AT THE FARM GATE', soft);
  if (!e.gate.recordedAt) {
    L.push('NOTHING WAS RECORDED AT THE GATE.');
  } else {
    L.push(`Recorded by      ${e.gate.recordedByRoleLabel}`);
    L.push(`Recorded at      ${e.gate.recordedAt}`);
    L.push(`Weight           ${e.gate.weight.label}`
      + `${e.gate.weight.independent ? '  [INDEPENDENT]' : '  [not independent]'}`);
    if (e.gate.weight.ref) L.push(`Ticket           ${e.gate.weight.ref}`);
    L.push(`Condition        ${e.gate.condition.summary}`);
    L.push(`Grade at gate    ${e.gate.grade.observed || '— (none recorded)'}`);
    if (e.gate.grade.downgraded) {
      L.push(`                 LOWER than declared. This is a CLAIM by the recorder.`);
      L.push(`Farmer's answer  ${e.gate.grade.farmerResponse || 'NOT ANSWERED'}`);
    }
  }
  L.push('');
  if (e.payment) {
    L.push(soft, 'MONEY', soft);
    L.push(`Farmer payout    ₹${e.payment.farmerPayout}`);
    L.push(`Advance agreed   ₹${e.payment.advance.agreed}`);
    L.push(`Advance received ₹${e.payment.advance.received}`);
    if (e.payment.advance.outstanding > 0)
      L.push(`STILL NOT SENT   ₹${e.payment.advance.outstanding}`);
    L.push(`Balance          ₹${e.payment.balanceDue}${e.payment.overpaid ? '  (OVERPAID — farmer holds the buyer\'s money)' : ''}`);
    L.push(wrap(e.payment.note, 64));
    L.push('');
  }
  L.push(soft, 'THE GRIEVANCE', soft);
  L.push(`Raised by        ${e.dispute.raisedBy.label} (${e.dispute.raisedBy.name})`);
  L.push(`Against          ${e.dispute.against.label} (${e.dispute.against.name})`);
  L.push(`Reason           ${e.dispute.reason.replace(/_/g, ' ')}`);
  L.push(`Status           ${e.dispute.status}`);
  L.push(`Photos attached  ${e.dispute.photoCount}`);
  L.push('Description:');
  L.push(wrap(e.dispute.description, 60, '  '));
  if (e.dispute.response) {
    L.push('The other party answered:');
    L.push(wrap(e.dispute.response, 60, '  '));
  } else {
    L.push('The other party did NOT answer.');
  }
  L.push('');
  L.push(soft, 'WHAT HAPPENED, IN ORDER', soft);
  for (const t of e.timeline) {
    L.push(`${String(t.at).slice(0, 16).replace('T', ' ')}  ${t.what}`);
    if (t.byRoleLabel) L.push(`${' '.repeat(18)}— recorded by ${t.byRoleLabel}`);
  }
  L.push('');
  L.push(soft, '⚠️  WHAT WAS NEVER RECORDED', soft);
  L.push(wrap('Absence is evidence too. These are things this app does NOT know about this '
    + 'trade, listed because leaving them out would make the record look more complete than it '
    + 'is.', 64));
  L.push('');
  if (!e.gaps.length) L.push('(nothing — unusually complete)');
  for (const g of e.gaps) {
    L.push(`[${g.severity.toUpperCase()}] ${g.what}`);
    L.push(wrap(g.why, 60, '  '));
    L.push('');
  }
  L.push(rule);
  L.push('Produced by FARMERAPP. This app records; it does not adjudicate.');
  L.push(rule);
  return L.join('\n');
}

/** Wrap to a width without breaking words. */
function wrap(text, width, indent = '') {
  const words = String(text || '').split(/\s+/);
  const out = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) { out.push(indent + line.trim()); line = w; }
    else line += ` ${w}`;
  }
  if (line.trim()) out.push(indent + line.trim());
  return out.join('\n');
}

module.exports = { buildEvidence, renderText, DISCLAIMER, ROLE_LABEL };

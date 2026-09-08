// Phase C4 test: grievances.
//   node scripts/testDisputes.js
//
// Runs the REAL routes against the REAL Atlas database, auth stubbed via the
// require cache. Data namespaced "PHC4TEST_" and deleted in the finally block.
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const B = (p) => path.join(__dirname, '..', p);

const authPath = require.resolve(B('middleware/auth.js'));
require.cache[authPath] = {
  id: authPath, filename: authPath, loaded: true,
  exports: {
    requireAuth: (req, res, next) => {
      const uid = req.headers['x-test-uid'];
      if (!uid) return res.status(401).json({ success: false, error: 'Authentication required' });
      req.firebaseUid = uid; req.user = { sub: uid };
      req.profile = { name: uid.replace(/^PHC4TEST_/, ''), phone: '9000000000' };
      next();
    },
  },
};

const express = require('express');
const mongoose = require('mongoose');
const User = require(B('models/User'));
const Order = require(B('models/Order'));
const Dispute = require(B('models/Dispute'));
const ListingImage = require(B('models/ListingImage'));

const TAG = 'PHC4TEST_';
const FARMER = TAG + 'farmer', VENDOR = TAG + 'vendor', AGENT = TAG + 'agent', OUTSIDER = TAG + 'outsider';

const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

let pass = 0, fail = 0;
const check = (cond, m, extra = '') => {
  if (cond) { pass++; console.log('  ✅', m, extra); }
  else { fail++; console.log('  ❌', m, extra); }
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const app = express();
  app.use(express.json());
  app.use('/api/disputes', require(B('routes/disputes')));
  const server = app.listen(5125);
  const URL = 'http://127.0.0.1:5125';

  const call = async (method, p, uid, body) => {
    const r = await fetch(URL + p, {
      method, headers: { 'x-test-uid': uid, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };

  const postForm = async (uid, fields, photos = 0) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
    for (let i = 0; i < photos; i++)
      fd.append('photos', new Blob([JPEG], { type: 'image/jpeg' }), `e${i}.jpg`);
    const r = await fetch(`${URL}/api/disputes`, { method: 'POST', headers: { 'x-test-uid': uid }, body: fd });
    return { status: r.status, body: await r.json() };
  };

  const mkOrder = (over = {}) => Order.create({
    listingId: new mongoose.Types.ObjectId(),
    cropId: new mongoose.Types.ObjectId(),
    cropName: TAG + 'Onion', quantityKg: 200, pricePerKg: 30, cropTotal: 6000,
    farmerUid: FARMER, farmerName: 'farmer', farmerPhone: '9000000001',
    vendorUid: VENDOR, vendorName: 'vendor', vendorPhone: '9000000002',
    pickup:  { lat: 19.9975, lng: 73.7898, label: 'Farm' },
    dropoff: { lat: 20.1417, lng: 74.2417, label: 'Mandi' },
    vehicleType: 'tempo', distanceKm: 50, durationMin: 75,
    fare: { base: 200, perKm: 25, distanceCharge: 1250, total: 1450 },
    grandTotal: 7450, farmerPayout: 6000,
    status: 'delivered', deliveredAt: new Date(),
    pickupOtp: '1111', dropOtp: '2222',
    ...over,
  });

  console.log('\n⚠️  Grievances (C4)\n');

  try {
    await User.create([
      { firebaseUid: FARMER,   name: 'farmer',   email: TAG + 'f@t.com', phone: '9000000001', role: 'farmer' },
      { firebaseUid: VENDOR,   name: 'vendor',   email: TAG + 'v@t.com', phone: '9000000002', role: 'vendor' },
      { firebaseUid: AGENT,    name: 'agent',    email: TAG + 'a@t.com', phone: '9000000003', role: 'agent' },
      { firebaseUid: OUTSIDER, name: 'outsider', email: TAG + 'o@t.com', phone: '9000000004', role: 'vendor' },
    ]);

    // ── 1. raising ────────────────────────────────────────────────────
    console.log('1. Raising a grievance');
    const o1 = await mkOrder();
    let r = await postForm(VENDOR, {
      orderId: o1._id, reason: 'quality_not_as_described',
      description: 'Lot was graded A but half the bulbs were under 35mm.',
    }, 2);
    check(r.status === 201, 'a buyer raises a quality grievance', `→ ${r.status}`);
    const d1 = r.body.dispute;
    check(d1.againstUid === FARMER,
      'the counterparty is DERIVED from the order, not the request', `→ ${d1.againstRole}`);
    check(d1.photoIds.length === 2, 'evidence photos are stored', `→ ${d1.photoIds.length}`);
    check(d1.cropName === TAG + 'Onion' && d1.orderTotal === 7450,
      'the order is snapshotted so the record reads on its own');
    check(d1.status === 'open', 'it starts open');

    // A stranger must not be able to file against a trade they had no part in.
    const o2 = await mkOrder();
    r = await postForm(OUTSIDER, { orderId: o2._id, reason: 'other', description: 'nothing to do with me' });
    check(r.status === 403, 'a non-party cannot raise a grievance', `→ ${r.status}`);

    r = await postForm(VENDOR, { orderId: o1._id, reason: 'quantity_short', description: 'also short' });
    check(r.status === 409 && r.body.code === 'ALREADY_OPEN',
      'the same party cannot stack a second open grievance', `→ ${r.body.code}`);

    // The farmer is a different party — they get their own.
    r = await postForm(FARMER, { orderId: o1._id, reason: 'payment_not_received', description: 'Never paid.' });
    check(r.status === 201, 'the OTHER party can raise their own on the same order');
    check(r.body.dispute.againstUid === VENDOR, 'and it points the other way');

    r = await postForm(VENDOR, { orderId: o2._id, reason: 'not_a_real_reason', description: 'x' });
    check(r.status === 400, 'a reason outside the enum is rejected');
    r = await postForm(VENDOR, { orderId: o2._id, reason: 'other', description: '   ' });
    check(r.status === 400, 'an empty description is rejected');

    // ── 2. transport complaints point at the agent ────────────────────
    console.log('\n2. Transport complaints route to the driver');
    const o3 = await mkOrder({ agentUid: AGENT, agentName: 'agent' });
    r = await postForm(VENDOR, { orderId: o3._id, reason: 'damaged_in_transit', description: 'Sacks torn.' });
    check(r.body.dispute.againstRole === 'agent',
      'damaged_in_transit is raised against the DRIVER, not the farmer', `→ ${r.body.dispute.againstRole}`);

    const o4 = await mkOrder();     // no agent assigned
    r = await postForm(VENDOR, { orderId: o4._id, reason: 'not_delivered', description: 'Never arrived.' });
    check(r.body.dispute.againstRole === 'farmer',
      'with no driver assigned it falls back to the other trading party',
      `→ ${r.body.dispute.againstRole}`);

    // ── 3. the time window ────────────────────────────────────────────
    console.log('\n3. The 14-day window');
    const old = await mkOrder({ deliveredAt: new Date(Date.now() - 20 * 86400000) });
    r = await postForm(VENDOR, { orderId: old._id, reason: 'other', description: 'late complaint' });
    check(r.status === 409 && r.body.code === 'WINDOW_CLOSED',
      'a grievance outside the window is refused', `→ ${r.body.code}`);

    const cancelled = await mkOrder({ status: 'cancelled' });
    r = await postForm(VENDOR, { orderId: cancelled._id, reason: 'other', description: 'x' });
    check(r.status === 409 && r.body.code === 'ORDER_CANCELLED',
      'a cancelled order has nothing to dispute', `→ ${r.body.code}`);

    // ── 4. responding ─────────────────────────────────────────────────
    console.log('\n4. The other side answers');
    r = await call('PUT', `/api/disputes/${d1._id}/respond`, VENDOR, { response: 'I stand by the grade' });
    check(r.status === 409 && r.body.code === 'CANNOT_RESPOND_TO_SELF',
      'the raiser cannot answer their own grievance', `→ ${r.body.code}`);

    r = await call('PUT', `/api/disputes/${d1._id}/respond`, OUTSIDER, { response: 'butting in' });
    check(r.status === 409 && r.body.code === 'NOT_YOURS', 'a stranger cannot answer it');

    r = await call('PUT', `/api/disputes/${d1._id}/respond`, FARMER, {
      response: 'Sorted before loading — happy to take 5% off.',
    });
    check(r.status === 200 && r.body.dispute.status === 'responded', 'the accused party responds');
    check(!!r.body.dispute.respondedAt, 'and the response is timestamped');

    r = await call('PUT', `/api/disputes/${d1._id}/respond`, FARMER, { response: 'again' });
    check(r.status === 409, 'responding twice is refused', `→ ${r.body.code}`);

    // ── 5. resolution ─────────────────────────────────────────────────
    console.log('\n5. Resolution');
    r = await call('PUT', `/api/disputes/${d1._id}/resolve`, VENDOR, { outcome: 'not_an_outcome' });
    check(r.status === 400, 'an outcome outside the enum is rejected');

    r = await call('PUT', `/api/disputes/${d1._id}/resolve`, VENDOR, {
      outcome: 'partial_refund_agreed', amount: 300, note: 'Settled at 5%',
    });
    check(r.status === 200 && r.body.dispute.status === 'resolved', 'either party can close it');
    check(r.body.dispute.resolution.resolvedByRole === 'vendor',
      'the record says WHO closed it', `→ ${r.body.dispute.resolution.resolvedByRole}`);
    check(r.body.dispute.resolution.amount === 300, 'and what was agreed', '→ ₹300');

    r = await call('PUT', `/api/disputes/${d1._id}/resolve`, FARMER, { outcome: 'no_action' });
    check(r.status === 409 && r.body.code === 'ALREADY_CLOSED',
      'resolving twice is refused, not overwritten', `→ ${r.body.code}`);

    // ── 6. withdraw ───────────────────────────────────────────────────
    console.log('\n6. Withdrawal');
    const o5 = await mkOrder();
    r = await postForm(VENDOR, { orderId: o5._id, reason: 'other', description: 'thought better of it' });
    const d5 = r.body.dispute;
    r = await call('PUT', `/api/disputes/${d5._id}/withdraw`, FARMER);
    check(r.status === 409 && r.body.code === 'NOT_RAISER',
      'only the raiser may withdraw', `→ ${r.body.code}`);
    r = await call('PUT', `/api/disputes/${d5._id}/withdraw`, VENDOR);
    check(r.status === 200 && r.body.dispute.status === 'withdrawn', 'the raiser withdraws');
    r = await postForm(VENDOR, { orderId: o5._id, reason: 'other', description: 'actually yes' });
    check(r.status === 201, 'withdrawing frees them to raise a fresh one');

    // ── 7. visibility ─────────────────────────────────────────────────
    console.log('\n7. Who sees what');
    r = await call('GET', '/api/disputes/mine', VENDOR);
    const vd = r.body.disputes.filter(d => d.cropName.startsWith(TAG));
    check(vd.length > 0, 'a party sees their own grievances', `→ ${vd.length}`);
    check(vd.some(d => d.iRaised === true) && vd.some(d => d.iRaised === false),
      'the feed contains BOTH raised-by-me and raised-against-me, flagged');

    r = await call('GET', '/api/disputes/mine', OUTSIDER);
    check(r.body.disputes.filter(d => d.cropName.startsWith(TAG)).length === 0,
      'a stranger sees none of them');

    r = await call('GET', `/api/disputes/${d1._id}`, OUTSIDER);
    check(r.status === 403, 'and cannot fetch one directly either', `→ ${r.status}`);
    r = await call('GET', `/api/disputes/${d1._id}`, FARMER);
    check(r.status === 200, 'but the accused party can read it');

    // ── 8. concurrency ────────────────────────────────────────────────
    console.log('\n8. Concurrency');
    const o6 = await mkOrder();
    r = await postForm(VENDOR, { orderId: o6._id, reason: 'other', description: 'race' });
    const d6 = r.body.dispute;
    const race = await Promise.all([
      call('PUT', `/api/disputes/${d6._id}/resolve`, VENDOR, { outcome: 'no_action' }),
      call('PUT', `/api/disputes/${d6._id}/withdraw`, VENDOR),
    ]);
    check(race.filter(x => x.status === 200).length === 1,
      'resolve and withdraw racing → exactly one wins', `→ ${race.map(x => x.status).join(',')}`);

    // ══ 9. THE EVIDENCE TRAIL ══════════════════════════════════════════
    //
    // ═══ WHAT WAS DELIBERATELY NOT BUILT ═══════════════════════════════
    //
    // Not a customer-care queue, not an arbitration engine, not a fault score.
    // This app does not decide who is right and is not going to start — that
    // rule predates this section, and a team to decide it is a staffing
    // commitment rather than a feature.
    //
    // What IS built: everything already recorded, assembled into one trail for
    // the human who does decide — the group, the buyer, an APMC officer, or the
    // two of them across a table. And crucially, WHAT WAS NEVER RECORDED,
    // because absence settles a quantity dispute more often than any number.
    console.log('\n9. The evidence trail');

    const eo = await mkOrder({
      status: 'delivered',
      pickupOutcome: {
        outcome: 'collected_short', orderedKg: 200, collectedKg: 170,
        recordedAt: new Date(), recordedBy: AGENT, recordedByRole: 'agent',
        weight: { method: 'estimated', ref: '' },
        condition: { checked: true, flags: ['wet'], note: 'Damp on the underside.' },
        grade: { declared: 'A', observed: null, discrepancy: null, farmerResponse: null },
      },
      settlement: {
        farmerPaid: false,
        advance: { agreedAmount: 1500, agreedPct: 25, agreedAt: new Date(), receivedAt: null },
      },
    });
    let re = await call('POST', '/api/disputes', VENDOR, {
      orderId: String(eo._id), reason: 'quantity_short',
      description: 'Thirty kilos light and the sacks were wet.',
    });
    check(re.status === 201, 'a grievance to build a trail from', `→ ${re.status}`);
    const ed = re.body.dispute;

    re = await call('GET', `/api/disputes/${ed._id}/evidence`, OUTSIDER);
    check(re.status === 403, 'an unrelated account cannot read the trail', `→ ${re.status}`);

    re = await call('GET', `/api/disputes/${ed._id}/evidence`, FARMER);
    check(re.status === 200 && re.body.viewer === 'respondent',
      'the party it was raised AGAINST can read it — both sides see the same record',
      `→ ${re.body.viewer}`);
    const ev = re.body.evidence;

    // ⚠️ THE ASSERTION THAT MATTERS MOST.
    const flat = JSON.stringify(ev).toLowerCase();
    check(!/likely at fault|atfault|verdict|whoisright|recommendation|"blame"/.test(flat),
      'THE TRAIL CONTAINS NO VERDICT, NO FAULT SCORE AND NO RECOMMENDATION — this app records, it '
      + 'does not adjudicate, and there must never be a field here that says who is right');
    check(/record, not a ruling/i.test(ev.disclaimer),
      '...and it says so in the first line, to whoever it is forwarded to');

    // The gate, assembled from where it actually lives.
    check(ev.gate.weight.method === 'estimated' && ev.gate.weight.weighed === false
      && ev.gate.condition.flags.includes('wet'),
      'the FARM GATE record is pulled in — how the weight was established and what the lot looked '
      + 'like', `→ ${ev.gate.weight.label}`);
    check(ev.gate.recordedByRoleLabel && /captain/i.test(ev.gate.recordedByRoleLabel),
      'naming WHOSE account it is, in words', `→ "${ev.gate.recordedByRoleLabel}"`);
    check(ev.trade.collectedKg === 170 && ev.trade.orderedKg === 200,
      'what was ordered stands beside what actually left the farm', `→ 170 of 200 kg`);

    // ⚠️ ABSENCE IS EVIDENCE.
    const gapWhats = ev.gaps.map((g) => g.what.toLowerCase()).join(' | ');
    check(ev.gaps.length > 0, 'WHAT WAS NEVER RECORDED is its own section', `→ ${ev.gaps.length} gaps`);
    check(/never put on a scale/i.test(gapWhats),
      'THE LOT WAS NEVER WEIGHED, AND THAT IS THE TOP OF THE LIST — in a quantity dispute it is '
      + 'usually the fact that decides it, and a trail printing only what exists would read as far '
      + 'more complete than the record is');
    check(/no grade was recorded/i.test(gapWhats),
      'and that no grade was ever asked for, because a captain from the pool is not a grader — '
      + 'stated as a limit of the record, not a finding against anyone');
    check(ev.gaps[0].severity === 'high',
      'gaps are sorted worst-first so the load-bearing absences are met before the cosmetic ones',
      `→ ${ev.gaps[0].severity}`);

    // The money, including a promise nobody kept.
    check(ev.payment.advance.agreed === 1500 && ev.payment.advance.outstanding === 1500,
      'AN ADVANCE THAT WAS AGREED AND NEVER SENT is on the record as its own number — it is '
      + 'exactly the kind of thing a dispute turns on and it is invisible if folded into a balance',
      `→ ₹${ev.payment.advance.outstanding} outstanding`);

    // Chronology.
    check(ev.timeline.length >= 3
      && ev.timeline.every((t, i) => i === 0 || t.at >= ev.timeline[i - 1].at),
      'and the whole thing is one CHRONOLOGY across four collections, in order',
      `→ ${ev.timeline.length} events`);

    // The record's own quality — about the RECORD, never the people.
    check(ev.recordStrength.weighed === false && ev.recordStrength.hasGateRecord === true
      && /judgement about either party/i.test(ev.recordStrength.note)
      && /thin record is not evidence against anybody/i.test(ev.recordStrength.note),
      'recordStrength describes HOW MUCH IS DOCUMENTED and says in words that it is not a '
      + 'judgement about either party');

    // Both parties' histories, with trustService's refusal intact.
    check('farmer' in ev.parties && 'buyer' in ev.parties,
      "BOTH parties' records are shown, whichever of them raised it");
    check(/minimum number of completed trades/i.test(ev.parties.note),
      "...and the refusal to band a thin record is NOT relaxed because a dispute is open — that is "
      + 'exactly when a band would be most misleading');

    // ⚠️ THE POINT OF THE FEATURE: it leaves the app.
    const txtRes = await fetch(`${URL}/api/disputes/${ed._id}/evidence.txt`,
      { headers: { 'x-test-uid': VENDOR } });
    const txt = await txtRes.text();
    check(txtRes.status === 200 && /text\/plain/.test(txtRes.headers.get('content-type') || ''),
      'the same trail comes out as PLAIN TEXT — an APMC officer has no account here, and neither '
      + 'does the elder both parties actually trust', `→ ${txtRes.status}`);
    check(/THIS IS A RECORD, NOT A RULING/.test(txt),
      '...leading with the disclaimer, because this is the copy that gets forwarded');
    check(/WHAT WAS NEVER RECORDED/.test(txt) && /never put on a scale/i.test(txt),
      '...and carrying the gaps, not just the findings');
    check(/SELF-DECLARED BY THE FARMER, NOT INSPECTED/.test(txt),
      '...and still saying the grade was never checked by anybody');
    check(txt.length > 800, 'a real document, not a stub', `→ ${txt.length} chars`);

    // A downgrade nobody answered is a CLAIM, and the trail insists on it.
    const co = await mkOrder({
      pickupOutcome: {
        outcome: 'collected_full', orderedKg: 200, collectedKg: 200,
        recordedAt: new Date(), recordedBy: TAG + 'drv', recordedByRole: 'fpo_driver',
        weight: { method: 'public_weighbridge', ref: 'WB/1/2' },
        condition: { checked: true, flags: [] },
        grade: { declared: 'A', observed: 'C', discrepancy: 'downgrade', farmerResponse: null },
      },
    });
    re = await call('POST', '/api/disputes', VENDOR, {
      orderId: String(co._id), reason: 'quality_not_as_described', description: 'Grade C at best.',
    });
    re = await call('GET', `/api/disputes/${re.body.dispute._id}/evidence`, VENDOR);
    const cev = re.body.evidence;
    check(/has not answered the recorded downgrade/i.test(cev.gaps.map((g) => g.what).join(' ')),
      'AN UNANSWERED DOWNGRADE IS LISTED AS A GAP — a lower grade recorded at the gate is a CLAIM '
      + 'by the person who collected the lot, and until the farmer accepts or contests it nobody '
      + 'has agreed it');
    check(cev.recordStrength.farmerConcededGrade === false,
      '...and it is NOT counted as a concession');
    check(cev.recordStrength.independentlyWeighed === true,
      'while a public weighbridge IS reported as independent — the one weight both sides can '
      + 'produce a ticket for');

  } catch (e) {
    fail++; console.log('\n  ❌ THREW:', e.message, '\n', e.stack);
  } finally {
    const ids = await Dispute.find({
      $or: [{ raisedByUid: new RegExp('^' + TAG) }, { againstUid: new RegExp('^' + TAG) }],
    }).select('photoIds').lean();
    await Promise.all([
      User.deleteMany({ firebaseUid: new RegExp('^' + TAG) }),
      Order.deleteMany({ farmerUid: new RegExp('^' + TAG) }),
      Dispute.deleteMany({ $or: [{ raisedByUid: new RegExp('^' + TAG) }, { againstUid: new RegExp('^' + TAG) }] }),
      ListingImage.deleteMany({ _id: { $in: ids.flatMap(d => d.photoIds) } }),
      ListingImage.deleteMany({ ownerUid: new RegExp('^' + TAG) }),
    ]);
    console.log('\n🧹 test data removed');
    console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ${pass} passed, ${fail} failed`);
    server.close(); await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();

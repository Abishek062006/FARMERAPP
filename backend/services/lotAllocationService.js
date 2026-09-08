// services/lotAllocationService.js
//
// F2 Phase D — WHO ACTUALLY SELLS THE KILOGRAMS A BUYER ASKED FOR.
//
// Phase C turned an FPO's produce into a catalog of (crop, grade) LOTS, each
// with its own contributing members. This module answers the next question and
// only that question: given a lot's contributors and a requested quantity,
// which members supply how much?
//
// It is deliberately pure — no Mongo, no routes, no money movement. The route
// layer (routes/fpos.js) resolves the contributors, applies the payment mode
// and writes the documents; everything below is arithmetic that can be reasoned
// about and tested on its own.
//
// ══════════════════════════════════════════════════════════════════════════
//  1. WHY THIS IS A CONSTRAINT PROBLEM AND NOT A DIVISION
// ══════════════════════════════════════════════════════════════════════════
//
// Every contributing LISTING carries its own `minOrderKg` — the farmer's own
// floor, and it does NOT aggregate (services/lotCatalogService.js says so at
// length). So "2,000 kg split across four members" is not 500 kg each: a member
// whose floor is 800 kg either sells at least 800 kg or sells nothing at all.
// Three consequences, all of them real defects if handled carelessly:
//
//   • A member must never be allocated 1 kg below their own minimum. That is a
//     term the farmer set and the app does not get to override it.
//   • A member must never be allocated more than they actually have.
//   • SOME QUANTITIES ARE GENUINELY IMPOSSIBLE. With floors of 500 / 800 / 1,000
//     kg against stocks of 600 / 900 / 1,200 kg, 2,300 kg cannot be composed at
//     all — every combination lands either below it or above it. Rounding such a
//     request up, silently over-allocating, or shaving somebody under their
//     floor would each turn "we cannot do that" into a wrong invoice. It is
//     refused, and the nearest quantities that CAN be filled are named.
//
// ══════════════════════════════════════════════════════════════════════════
//  2. THE FAIRNESS DECISION — MADE EXPLICITLY, NOT INHERITED FROM MONGO
// ══════════════════════════════════════════════════════════════════════════
//
// Which members a sale is drawn from is a distributive decision about real
// income, and the first version of anything like this is always "whatever order
// the database returned" — which CLAUDE.md already records as a live bug once
// (`lots.slice(0, MAX_BUNDLE)`: "WHICH five was whatever order Mongo returned,
// so two identical requests could quote two different bundles"). It is decided
// here, on the record.
//
// THE RULE: EVERY MEMBER WHOSE OWN MINIMUM THE ORDER CAN HONOUR IS INCLUDED,
// AND THE QUANTITY IS SPLIT IN PROPORTION TO WHAT EACH HAS AVAILABLE.
//
//   • Maximum participation first. An FPO is a democratic member institution —
//     its whole claim is that a smallholder reaches a buyer they could not reach
//     alone. An allocation rule that fills each order from the cheapest, or the
//     biggest, or the nearest members routes every sale to the same two or three
//     farmers and turns the group into a shopfront for its largest producers.
//     That is the outcome the institution exists to prevent, so member count is
//     the FIRST criterion and price is not a criterion at all.
//
//   • Proportional to available stock, NOT an equal split. This is the same
//     by-weight principle the fare split already uses in routes/consignments.js
//     ("an even split would make aggregation actively bad for the smallest
//     farmer, who is the one it is supposed to help") — inverted here, because
//     what is being divided is revenue rather than cost, but resting on the same
//     idea: a member who brought 100 kg to the pool and a member who brought
//     1,000 kg have not made the same contribution.
//
//   • PRICE-NEUTRAL. Members inside one lot ask different ₹/kg (Phase C reports
//     the spread rather than averaging it away). Allocating cheapest-first would
//     be a hidden penalty for a member who prices their produce honestly, paid
//     out of the same pooled-collection saving the group was formed to capture.
//     The buyer still pays each member their OWN asking price — that is
//     non-negotiable and it is why the buyer's true total cannot be known before
//     the allocation exists, which is why this is a two-step quote → confirm.
//
//   • THE FLOOR IS THE BRAKE, AND IT IS THE FARMER'S OWN. Maximum participation
//     spreads a small order thinly, and thin means more pickup stops, and more
//     stops cost more to collect. The thing that stops it going silly is already
//     in the data and already belongs to the right person: `minOrderKg`. A
//     farmer who does not want a vehicle sent for 40 kg of theirs says so by
//     setting their minimum, and this module honours that exactly rather than
//     second-guessing it. The quote reports the stop count and the measured fare
//     beside the crop total, so the buyer decides with the number in front of
//     them instead of discovering it later.
//
// TIE-BREAKS, in order, and they are tie-breaks only:
//   1. more members included wins;
//   2. then the lower cost to the buyer — once the same number of members are
//      being served, there is no fairness argument left for charging more, and
//      every included member is still paid their own asking price;
//   3. then the sorted listing ids, so the answer is a pure function of the
//      input and two identical requests name the same members.
//
// ⚠️ WHAT THIS DOES NOT SOLVE, AND IT IS NOT SMALL
//   This is stateless. It is fair WITHIN one order and blind ACROSS orders. A
//   member whose minimum is 1,000 kg in a group that mostly sells 600 kg lots is
//   excluded by rule 1 every single time, and nothing here notices that it has
//   happened forty times to the same person. The fix is a rotation or
//   contribution ledger — "who has been left out lately" as an input to the
//   ranking — and this phase deliberately does not build one, because a
//   half-built fairness ledger is worse than none. What this phase does instead
//   is make the exclusion VISIBLE: every member left out comes back in
//   `excluded[]` with a reason, so the pattern is at least legible to the group's
//   admin rather than invisible. Do not read "fair" here as more than it says.
//
// ══════════════════════════════════════════════════════════════════════════
//  3. WHY BRUTE FORCE
// ══════════════════════════════════════════════════════════════════════════
//
// One collection run serves at most MAX_STOPS farms (5), so there are at most 31
// non-empty subsets to consider. Every one of them is evaluated exactly. This is
// the same call routes/consignments.js makes for stop ordering — "≤120
// permutations, microseconds, and the answer is exactly optimal" — and for the
// same reason: a greedy rule here is not merely slower to trust, it is WRONG.
// Greedily dropping the member with the largest minimum misses feasible
// allocations (five members with stocks 5/5/5/100 and floors 5/5/5/6 against a
// 20 kg order: dropping the floor-6 member leaves only 15 kg, while keeping them
// and dropping one of the others fills it exactly). CLAUDE.md already records
// the cost of a greedy heuristic in this codebase once; it is not worth
// rediscovering here, where the price of being wrong is a farmer left out of a
// sale they could have been part of.

/** One collection run serves at most this many farms. Matches MAX_STOPS in
 *  routes/consignments.js and MAX_BUNDLE in routes/fpos.js. */
const MAX_STOPS = 5;

/** Guard on the exhaustive search. 12 members is 4,095 subsets, still trivial;
 *  beyond that the caller has already broken the ≤MAX_STOPS contract. */
const MAX_EXHAUSTIVE = 12;

/** Why a contributor is not in the allocation. A fixed list, so a screen can
 *  render each case differently instead of one flat "not included". */
const EXCLUSION = {
  BEYOND_MAX_BUNDLE: 'beyond_max_bundle',
  NO_PICKUP_LOCATION: 'no_pickup_location',
  SECOND_LISTING_SAME_FARMER: 'second_listing_same_farmer',
  BELOW_OWN_MINIMUM: 'below_own_minimum',
  MINIMUM_DOES_NOT_FIT: 'own_minimum_does_not_fit',
};

/** Why a requested quantity cannot be composed at all. */
const INFEASIBLE = {
  NO_ORDERABLE_CONTRIBUTORS: 'NO_ORDERABLE_CONTRIBUTORS',
  BELOW_SMALLEST_MINIMUM: 'BELOW_SMALLEST_MINIMUM',
  EXCEEDS_ONE_RUN: 'EXCEEDS_ONE_RUN',
  QUANTITY_NOT_COMPOSABLE: 'QUANTITY_NOT_COMPOSABLE',
};

const POLICY = 'max_participation_prorata_by_stock';

const POLICY_NOTE =
  'Every member whose own minimum order this quantity can honour is included, and the kilograms are '
  + 'split in proportion to the stock each of them has available. Members are NOT ranked by price, by '
  + "size or by distance: an FPO exists so that its smaller members reach a buyer, and filling every "
  + 'order from the cheapest or the biggest farms would route every sale to the same few people. Each '
  + "member is paid their own asking price, so the buyer's total depends on which members the "
  + 'allocation actually drew from — which is why a quote has to be issued before an order can be made.';

const FAIRNESS_RISK =
  'This allocation is fair within THIS order and blind across orders. A member whose own minimum is '
  + 'larger than the quantities this group usually sells is excluded by the same rule every time, and '
  + 'nothing here remembers that. A rotation or contribution ledger would be the fix and this phase '
  + 'does not build one — what it does instead is name every excluded member and why, so the pattern is '
  + "visible to the group's admin rather than silent.";

const round2 = (n) => Math.round(n * 100) / 100;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/**
 * Split `total` across rows in proportion to the room each has, capped at that
 * room, with the leftover going to whoever has the most room left.
 *
 * The cap is what makes this different from a plain apportionment: a member with
 * 40 kg of headroom cannot absorb 200 kg however large their proportional share
 * works out at, so the overflow has to cascade to the others. It converges
 * because every pass either assigns something or exits, and the final sweep
 * assigns whatever rounding left behind — so the parts sum EXACTLY to `total`,
 * the same discipline splitFare() and apportion() already hold themselves to.
 * A kilogram lost here is a kilogram somebody is not paid for.
 */
function capApportion(total, caps) {
  const out = caps.map(() => 0);
  let remaining = total;

  for (let guard = 0; guard < MAX_EXHAUSTIVE && remaining > 1e-9; guard++) {
    const room = caps.map((c, i) => c - out[i]);
    const roomSum = sum(room);
    if (roomSum <= 1e-9) break;
    let given = 0;
    for (let i = 0; i < caps.length; i++) {
      if (room[i] <= 0) continue;
      const give = Math.min(room[i], Math.floor((remaining * room[i]) / roomSum));
      out[i] += give;
      given += give;
    }
    remaining -= given;
    if (given <= 0) break;
  }

  if (remaining > 1e-9) {
    const order = caps.map((_, i) => i)
      .sort((a, b) => ((caps[b] - out[b]) - (caps[a] - out[a])) || (a - b));
    for (const i of order) {
      if (remaining <= 1e-9) break;
      const give = Math.min(remaining, caps[i] - out[i]);
      out[i] += give;
      remaining -= give;
    }
  }
  return out;
}

/**
 * The kilograms each member of one chosen subset supplies.
 *
 * EVERY MEMBER GETS THEIR OWN MINIMUM FIRST, then the remainder is split in
 * proportion to the stock each has left ABOVE that minimum. Doing it in this
 * order is what makes the result maximally inclusive: a plain proportional split
 * would push a small member's share under their own floor and force them out of
 * a sale they were willing to be part of, which is the opposite of the rule this
 * module is built on. It also cannot violate a floor or a stock ceiling by
 * construction rather than by a check afterwards.
 *
 * Caller guarantees Σmin ≤ requestedKg ≤ Σavailable for this subset.
 */
function allocateWithin(members, requestedKg) {
  const floors = members.map((m) => m.minOrderKg);
  const headroom = members.map((m) => m.availableKg - m.minOrderKg);
  const extra = capApportion(requestedKg - sum(floors), headroom);
  return members.map((_, i) => floors[i] + extra[i]);
}

/** Every non-empty subset of 0..n-1, as index arrays. n ≤ MAX_EXHAUSTIVE. */
function subsetsOf(n) {
  const out = [];
  for (let mask = 1; mask < (1 << n); mask++) {
    const idx = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) idx.push(i);
    out.push(idx);
  }
  return out;
}

/**
 * EVERY QUANTITY THIS SET OF MEMBERS CAN ACTUALLY COMPOSE, as merged intervals.
 *
 * One subset S can fill any quantity from Σmin(S) to Σavailable(S) and nothing
 * outside it. The union over all subsets is therefore a set of intervals with
 * REAL GAPS in it, and those gaps are the whole reason an order for 2,300 kg can
 * be impossible while 2,000 kg and 2,500 kg are both fine. Computing them is
 * what lets the refusal name a quantity the buyer can actually order instead of
 * saying "no" and leaving them to guess.
 */
function fillableRanges(members) {
  const raw = subsetsOf(members.length).map((idx) => [
    sum(idx.map((i) => members[i].minOrderKg)),
    sum(idx.map((i) => members[i].availableKg)),
  ]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged = [];
  for (const [lo, hi] of raw) {
    const last = merged[merged.length - 1];
    // Merged only on genuine overlap or touch. Two ranges with a gap between
    // them stay apart — collapsing them would erase exactly the fact this
    // function exists to report.
    if (last && lo <= last[1]) last[1] = Math.max(last[1], hi);
    else merged.push([lo, hi]);
  }
  return merged.map(([fromKg, toKg]) => ({ fromKg, toKg }));
}

/** The largest fillable quantity at or below X, and the smallest at or above. */
function nearestFillable(ranges, x) {
  let below = null, above = null;
  for (const r of ranges) {
    if (r.toKg <= x && (below === null || r.toKg > below)) below = r.toKg;
    if (r.fromKg >= x && (above === null || r.fromKg < above)) above = r.fromKg;
  }
  return { below, above };
}

const kgText = (n) => Number(n).toLocaleString('en-IN');

/**
 * ALLOCATE `requestedKg` ACROSS A LOT'S CONTRIBUTORS.
 *
 * @param contributors  [{ listingId, farmerUid, farmerName, availableKg,
 *                        minOrderKg, pricePerKg }] — already reduced to the
 *                      farms of ONE collection run by the caller (Phase A's
 *                      selectBundleLots), one entry per farmer.
 * @param requestedKg   what the buyer asked for.
 * @param runCapacityKg the largest load any vehicle in the fare table can carry;
 *                      part of "the maximum fillable in one run", alongside the
 *                      ≤MAX_STOPS farm cap.
 *
 * Returns { ok: true, allocation, excluded, ... } or
 *         { ok: false, code, error, ... } — never a partial or approximate fill.
 */
function allocate({ contributors, requestedKg, runCapacityKg = Infinity }) {
  const excluded = [];
  const orderable = [];

  for (const c of contributors) {
    // A contributor whose own floor is above their own remaining stock cannot
    // fill any order at all — not a rounding problem, a genuine dead end. Phase
    // C already flags this on the lot (`canFillOwnMinimum`); here it is a
    // reason for exclusion rather than a silent zero.
    if (!(c.availableKg > 0) || c.minOrderKg > c.availableKg) {
      excluded.push({
        ...c,
        reason: EXCLUSION.BELOW_OWN_MINIMUM,
        detail: `${c.farmerName || 'This member'} has ${kgText(c.availableKg)} kg left but will not sell `
          + `below ${kgText(c.minOrderKg)} kg, so nothing of theirs can be ordered right now.`,
      });
      continue;
    }
    orderable.push(c);
  }

  const totalAvailableKg = sum(orderable.map((c) => c.availableKg));
  // The ceiling on ONE run is whichever binds first: what these farms hold, or
  // what a vehicle can carry. Both are real and the message names which.
  const maxFillableKg = Math.min(totalAvailableKg, runCapacityKg);
  const smallestOrderKg = orderable.length
    ? Math.min(...orderable.map((c) => c.minOrderKg)) : null;

  const base = {
    policy: POLICY,
    policyNote: POLICY_NOTE,
    fairnessRisk: FAIRNESS_RISK,
    requestedKg,
    maxFillableKg,
    totalAvailableKg,
    smallestOrderKg,
    contributorsConsidered: orderable.length,
    excluded,
  };

  if (!orderable.length) {
    return {
      ...base, ok: false,
      code: INFEASIBLE.NO_ORDERABLE_CONTRIBUTORS,
      error: 'No member of this lot has enough stock left to meet their own minimum order, so nothing '
        + 'here can be bought right now.',
      fillableRanges: [],
      nearestBelowKg: null, nearestAboveKg: null,
    };
  }
  if (orderable.length > MAX_EXHAUSTIVE) {
    // Cannot happen through the catalog (≤MAX_STOPS farms per run) and is
    // refused rather than approximated if it ever does.
    return {
      ...base, ok: false,
      code: INFEASIBLE.EXCEEDS_ONE_RUN,
      error: `${orderable.length} contributing farms is more than one collection run can serve.`,
      fillableRanges: [], nearestBelowKg: null, nearestAboveKg: null,
    };
  }

  const ranges = fillableRanges(orderable)
    // Nothing above the vehicle's capacity is fillable in one run, whatever the
    // members hold — so the ranges a buyer is shown are clipped to it rather
    // than promising a quantity no vehicle could take.
    .map((r) => ({ fromKg: r.fromKg, toKg: Math.min(r.toKg, runCapacityKg) }))
    .filter((r) => r.fromKg <= r.toKg);
  const near = nearestFillable(ranges, requestedKg);

  const withRanges = {
    ...base,
    fillableRanges: ranges.slice(0, 12),
    nearestBelowKg: near.below,
    nearestAboveKg: near.above,
  };

  if (requestedKg > maxFillableKg) {
    const capacityBound = runCapacityKg < totalAvailableKg;
    return {
      ...withRanges, ok: false,
      code: INFEASIBLE.EXCEEDS_ONE_RUN,
      limitedBy: capacityBound ? 'vehicle_capacity' : 'available_stock',
      error: capacityBound
        ? `One collection run can carry at most ${kgText(runCapacityKg)} kg. Order up to `
          + `${kgText(maxFillableKg)} kg, or split the purchase across separate runs.`
        : `These ${orderable.length} farms hold ${kgText(maxFillableKg)} kg between them, which is the most `
          + `one collection run can fill. Order up to ${kgText(maxFillableKg)} kg.`,
    };
  }
  if (requestedKg < smallestOrderKg) {
    return {
      ...withRanges, ok: false,
      code: INFEASIBLE.BELOW_SMALLEST_MINIMUM,
      error: `${kgText(smallestOrderKg)} kg is the smallest order any member of this lot will accept. `
        + `${kgText(requestedKg)} kg is below every contributor's own minimum.`,
    };
  }

  // ── the exhaustive search ─────────────────────────────────────────────
  const idOf = (c) => String(c.listingId);
  let best = null;
  for (const idx of subsetsOf(orderable.length)) {
    const members = idx.map((i) => orderable[i]);
    const floor = sum(members.map((m) => m.minOrderKg));
    const ceiling = sum(members.map((m) => m.availableKg));
    if (requestedKg < floor || requestedKg > ceiling) continue;

    const kgs = allocateWithin(members, requestedKg);
    const cost = sum(members.map((m, i) => kgs[i] * m.pricePerKg));
    const key = members.map(idOf).sort().join(',');
    const cand = { members, kgs, cost: round2(cost), size: members.length, key };

    if (!best
      || cand.size > best.size
      || (cand.size === best.size && cand.cost < best.cost)
      || (cand.size === best.size && cand.cost === best.cost && cand.key < best.key)) {
      best = cand;
    }
  }

  if (!best) {
    // THE INTERESTING REFUSAL. The quantity sits between two things this lot can
    // do and is not either of them.
    const alt = [near.below, near.above].filter((v) => v != null).map(kgText);
    return {
      ...withRanges, ok: false,
      code: INFEASIBLE.QUANTITY_NOT_COMPOSABLE,
      error: `${kgText(requestedKg)} kg cannot be composed from these members' minimum orders`
        + (alt.length ? `; ${alt.join(' kg or ')} kg can.` : '.')
        + ' Each member sells either nothing or at least their own minimum, so some quantities in '
        + 'between fall through the gap — this one does.',
    };
  }

  const chosen = new Set(best.members.map(idOf));
  for (const c of orderable) {
    if (chosen.has(idOf(c))) continue;
    excluded.push({
      ...c,
      reason: EXCLUSION.MINIMUM_DOES_NOT_FIT,
      detail: `${c.farmerName || 'This member'} will not sell below ${kgText(c.minOrderKg)} kg, and that `
        + `does not fit alongside the other members' minimums inside a ${kgText(requestedKg)} kg order. `
        + 'A larger order can include them.',
    });
  }

  const allocation = best.members.map((m, i) => ({
    listingId: m.listingId,
    farmerUid: m.farmerUid,
    farmerName: m.farmerName,
    quantityKg: best.kgs[i],
    pricePerKg: m.pricePerKg,
    lineTotal: Math.round(best.kgs[i] * m.pricePerKg),
    // Shown so a member can see the allocation honoured the floor THEY set, and
    // that it did not take stock they do not have.
    minOrderKg: m.minOrderKg,
    availableKg: m.availableKg,
    shareOfOrderPct: Math.round((best.kgs[i] / requestedKg) * 1000) / 10,
  }));

  return {
    ...withRanges,
    ok: true,
    allocation,
    excluded,
    membersIncluded: allocation.length,
    allocatedKg: sum(allocation.map((a) => a.quantityKg)),
    // Σ(each member's own price × their own kilograms). NOT the lot's indicative
    // price × quantity — that would underpay every member asking above the
    // weighted average, which CLAUDE.md names as the trap this phase must not
    // fall into.
    cropTotal: sum(allocation.map((a) => a.lineTotal)),
  };
}

module.exports = {
  MAX_STOPS,
  EXCLUSION,
  INFEASIBLE,
  POLICY,
  POLICY_NOTE,
  FAIRNESS_RISK,
  capApportion,
  allocateWithin,
  fillableRanges,
  nearestFillable,
  allocate,
};

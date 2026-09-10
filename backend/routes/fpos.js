const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Fpo = require('../models/Fpo');
// The pending/rejected states an FPO registrant sits in BEFORE there is an
// Fpo document at all. Read by GET /admin/mine so the landing screen can say
// which of them applies instead of showing an empty dashboard.
const FpoAdminClaim = require('../models/FpoAdminClaim');
const CropListing = require('../models/CropListing');
const Order = require('../models/Order');
const Land = require('../models/Land');
const Crop = require('../models/Crop');
const User = require('../models/User');
const Consignment = require('../models/Consignment');
const Warehouse = require('../models/Warehouse');
const FpoProcurement = require('../models/FpoProcurement');
// A buyer's pending request to buy one grade lot, awaiting the admin's own
// Accept/Reject — see that file's header for why this exists as its own
// model rather than reusing Requirement or Offer.
const FpoLotRequest = require('../models/FpoLotRequest');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { toLatLng, haversineKm, roundKm, resolveDistrict } = require('../services/geoService');
const paymentExposure = require('../services/paymentExposureService');
const { getMultiStopRoute, ROAD_FACTOR } = require('../services/routeService');
const { quote, VEHICLES, VEHICLE_ORDER } = require('../services/fareService');
const yieldBenchmarkService = require('../services/yieldBenchmarkService');
const storageService = require('../services/storageService');
const trustService = require('../services/trustService');
// Grade-separated lots, the price spread inside one, and what a lot's minimum
// order really means. Shared by the buyer's catalog (GET /bundles) and the FPO
// admin's dashboard so the two can never disagree about what the group holds.
const lotCatalog = require('../services/lotCatalogService');
// What a group deals in, and whether a would-be member grows it. ADVISORY
// everywhere — see that file's header for why nothing here ever blocks a join.
const {
  FOCUS_CROP_NAMES, MAX_FOCUS_CROPS, validateFocusCrops, matchFarmerToFocus, farmerCropNames,
  canonicalCropName,
} = require('../services/focusCropService');
const { matchRequirementsForPoints } = require('./requirements');
// Shared vocabulary for what a real person at a gate (or a godown counter)
// can attest to — weight provenance, condition, and who may grade what.
const {
  POSTABLE_WEIGHT_METHODS, describeWeight, parseCondition, describeCondition,
  compareGrades, describeGradeCheck,
} = require('../data/gateRecord');

// ── WHO MAY ACT AS AN FPO's ADMIN ─────────────────────────────────────────
//
// TWO ROLES, AND THE SECOND ONE IS THE POINT.
//
//   'fpo'     the organisation's OWN account. A real FPO is an incorporated
//             producer company and its CEO / Manager / Director is an
//             appointed officer of it who often does not farm at all.
//   'farmer'  ADMITTED FOR BACKWARD COMPATIBILITY, permanently. Before the
//             `fpo` role existed, an FPO admin WAS a farmer account that had
//             claimed an FPO from the SFAC registry. Those accounts are live
//             in Atlas, ten of them are the seeded demo groups, and nothing
//             was migrated. Dropping 'farmer' here would silently lock every
//             one of them out of their own group.
//
// ⚠️ THIS LIST DOES NOT AUTHORISE ANYTHING. It is only the outer gate — the
// actual decision is `fpo.adminUid === uid` (loadAsAdmin() below, and
// isFpoAdminForRun() in routes/consignments.js), which never looked at the
// role and still does not. An `fpo` account that admins nothing gets exactly
// the 403 a farmer who admins nothing gets, from exactly the same line.
//
// It is deliberately NOT applied to the routes a FARMER performs on a group:
// POST / (starting an informal group), GET /mine (which group am I in),
// /:id/join, /:id/leave and /nearby all stay farmer-only. An FPO does not join
// itself, does not leave itself, and is not looking for a group to be in.
const FPO_ADMIN_ROLES = ['farmer', 'fpo'];

// One vehicle serves at most this many farms. It matches MAX_STOPS in
// routes/consignments.js and it is a real product constraint with a stated
// reason ("beyond that the last farmer waits too long"), not a page size —
// raising it is not the fix for a group that has more members than this.
const MAX_BUNDLE = 5;

// Same rail identifier the per-order pay endpoint stamps, so a lot settlement
// and a single-order settlement are indistinguishable in the record except by
// how many orders they touched.
const PAY_RAIL = 'farmapp_demo_rail';

// The exact stop-ordering brute force, shared rather than reimplemented. See
// the note in routes/consignments.js about the greedy heuristic that picked a
// 168 km route where 120 km existed.
const {
  orderStops, optimalRouteKm,
  // Phase D writes its own Orders and its own Consignment, so it reuses the
  // consignment route's own fare split, transport-mode validation, dispatch
  // window and OTP generator rather than growing a second copy of each.
  splitFare, buildTransportArrangement,
  COST_SOURCE_BY_MODE, COST_NOTE_BY_MODE,
  otp,
  // F1 — the one place a listing moves into FPO custody, shared with the
  // (retired but kept) run-based collection path.
  moveListingToFpoCustody,
} = require('./consignments');
// ⚠️ The dispatch window comes from the SERVICE, not through consignments.js.
// Phase D writes its own Orders and its own Consignment, so it has to land on
// the same expiry a directly-booked run gets — including the evening cutoff.
// Doing the arithmetic here with a borrowed constant is how the two drift.
const { dispatchExpiryFrom } = require('../services/dispatchWindow');

// Phase D — WHO SUPPLIES THE KILOGRAMS. Pure arithmetic, no Mongo; this route
// resolves the contributors and writes the documents. See the long header in
// that file for the allocation policy and its stated fairness limits.
const lotAllocation = require('../services/lotAllocationService');
const { freightDeductionFor } = require('../services/freightDebtService');
const crypto = require('crypto');

// Why a lot is not in the bundle. A fixed list so a screen can render each
// case differently instead of showing one flat "not included".
const EXCLUSION_REASONS = {
  BEYOND_MAX_BUNDLE: 'beyond_max_bundle',
  NO_PICKUP_LOCATION: 'no_pickup_location',
};

// ═══════════════════════════════════════════════════════════════════════════
//  PAYMENT MODE × byLot / byShare — HOW THE TWO AXES COMPOSE
// ═══════════════════════════════════════════════════════════════════════════
//
// These are TWO DIFFERENT QUESTIONS and the code kept them apart deliberately,
// because conflating them is how a member ends up shown a number nobody owes
// them.
//
//   paymentMode      WHAT IS A MEMBER OWED, RELATIVE TO THE SALE?
//                    facilitation → the sale proceeds, minus the FPO's fee.
//                                   The member carries the price risk.
//                    procurement  → an agreed ₹/kg fixed BEFORE the sale, for
//                                   the kilograms they delivered. The member
//                                   carries no price risk at all; the FPO does.
//
//   byLot / byShare  HOW IS A POOL DIVIDED AMONG MEMBERS?
//                    byLot   → each member takes their own lot's value.
//                    byShare → the pool is redistributed by percentages the
//                              group agreed (pooled seed, pooled labour, so
//                              pooled proceeds).
//
// ── FACILITATION × byLot ──────────────────────────────────────────────────
//   Member gets their own lot's gross, less that lot's share of the fee. With
//   the default zero fee this is the identity function, which is exactly what
//   this app did before payment modes existed.
//
// ── FACILITATION × byShare ────────────────────────────────────────────────
//   THE FEE COMES OFF FIRST, then the NET pool is split by the percentages.
//   This is a decision, and the alternative (split the gross, then charge each
//   member a fee on their share) was worked through and rejected:
//
//   1. A PER-KG FEE HAS NO MEANING AGAINST A SHARE PERCENTAGE. A share carries
//      no kilograms. To charge a per-kg fee after the split you must pick a
//      basis, and both available bases are wrong: charge on the member's own
//      delivered weight and a member holding 10% of the shares but 40% of the
//      kilograms pays four times what their share is worth; charge on their
//      share of the group's weight and they are paying for kilograms somebody
//      else grew. Deducting first needs no such choice — the fee is computed
//      on what the group ACTUALLY sold, its real gross and its real weight.
//
//   2. THE FEE IS THE FPO's, NOT ANY MEMBER's. "The farmer receives the sale
//      proceeds minus an agreed FPO fee" is a claim against the SALE. Only
//      what is left after that claim is the members' to divide, so dividing
//      the gross divides money that was never theirs.
//
//   3. IT IS THE ONLY ORDERING THAT RECONCILES. Deducting first makes
//      `sum(member payouts) + fpoFee === gross` hold exactly, for both fee
//      shapes, with the same rounding-drift discipline the fare split uses. A
//      settlement that is a rupee out is a settlement nobody trusts.
//
//   The same rule is applied under byLot, so the two views never disagree
//   about what the FPO took: one fee is computed for the group, then
//   apportioned to members (by lot value for a percentage fee, by weight for a
//   per-kg one). Both are linear, so a member's apportioned fee equals the fee
//   computed on their lot alone — the two readings agree by construction.
//
// ── PROCUREMENT × byLot ───────────────────────────────────────────────────
//   Member is owed `agreedRate × their kilograms`, full stop. It does not move
//   when the lot sells well and it does not move when the lot sells badly —
//   that is the entire point of an FPO buying the crop. byLot is the natural
//   and only coherent reading here: "each member is paid the agreed rate for
//   their own weight".
//
// ── PROCUREMENT × byShare — REFUSED, NOT FUDGED ───────────────────────────
//   There is no member pool to divide. The FPO bought the crop; the sale
//   proceeds are the FPO's own trading revenue. Splitting them by member
//   percentages would have to mean one of two things and both are false:
//     • members still own the proceeds — which contradicts the purchase that
//       already happened and that the member was already paid for; or
//     • the share split overrides the agreed rate — which means the FPO
//       promised ₹25/kg and paid something else, handing the price risk back
//       to the farmer through the back door. That is precisely the risk
//       procurement exists to remove.
//   Either way the resulting rupee figure is not a claim anyone could enforce,
//   so PUT /:id/shares REFUSES it (and PUT /:id/payment refuses switching to
//   procurement while shares are set, or the refusal would be bypassable by
//   doing the two steps in the other order).
//
// ── WHAT IS LEFT OVER IS THE FPO's POSITION, AND IT IS REPORTED ───────────
//   Under facilitation that is the fee. Under procurement it is
//   `sale proceeds − sum(agreedRate × kg)`, WHICH CAN BE NEGATIVE and is
//   returned negative. Clamping it would be the same lie as clamping a
//   negative pooling saving or a losing hold, both of which this codebase
//   already refuses to tell.
// ═══════════════════════════════════════════════════════════════════════════

const PAYMENT_MODES = ['facilitation', 'procurement'];
const FEE_MODES = ['none', 'percent', 'per_kg'];
// A/B/C, and they stay separate. See models/Fpo.js procurementRates.
const GRADES = ['A', 'B', 'C'];

/** Why a lot could not be priced against the procurement table. */
const RATE_GAP_REASONS = {
  GRADE_UNKNOWN: 'grade_unknown',      // the lot was never graded, or its listing is gone
  NO_AGREED_RATE: 'no_agreed_rate',    // graded, but this (crop, grade) is not in the table
};

const normCrop = (s) => String(s || '').trim().toLowerCase();

/** The fee actually in force. Only the field matching `mode` is ever read. */
function feeConfig(fpo) {
  const f = fpo.facilitationFee || {};
  const mode = FEE_MODES.includes(f.mode) ? f.mode : 'none';
  return {
    mode,
    percent: mode === 'percent' ? (Number(f.percent) || 0) : 0,
    perKg: mode === 'per_kg' ? (Number(f.perKg) || 0) : 0,
  };
}

/** The agreed ₹/kg for one (crop, grade), or null. Never falls back. */
function rateFor(fpo, cropName, grade) {
  if (!grade) return null;
  const hit = (fpo.procurementRates || []).find(
    (r) => normCrop(r.cropName) === normCrop(cropName) && r.grade === grade
  );
  return hit ? Number(hit.ratePerKg) : null;
}

/**
 * Split one total across rows in proportion to a basis, absorbing rounding
 * drift into the largest basis so the parts sum EXACTLY to the total. Same
 * rule as splitFare() in routes/consignments.js and the byShare split below —
 * three places, one arithmetic.
 */
function apportion(total, bases) {
  const sum = bases.reduce((a, b) => a + b, 0);
  if (!sum) return bases.map(() => 0);
  const parts = bases.map((b) => Math.round((b / sum) * total));
  const drift = total - parts.reduce((a, b) => a + b, 0);
  if (drift !== 0) {
    let big = 0;
    bases.forEach((b, i) => { if (b > bases[big]) big = i; });
    parts[big] += drift;
  }
  return parts;
}

/**
 * THE SETTLEMENT ARITHMETIC, in one place.
 *
 * Used by BOTH GET /:id/settlement and the dashboard's season-wide view, which
 * previously carried two copies of it. Two copies is two places for the fee
 * ordering above to be applied differently, and a member reading one screen
 * against the other would have no way to tell which was right.
 *
 * @param fpo            lean Fpo
 * @param activeMembers  fpo.members filtered to status 'active'
 * @param orders         lean Orders belonging to those members
 * @param gradeByOrderId Map(orderId → 'A'|'B'|'C'|null); procurement only
 */
function computeSettlement(fpo, activeMembers, orders, gradeByOrderId) {
  const paymentMode = PAYMENT_MODES.includes(fpo.paymentMode) ? fpo.paymentMode : 'facilitation';
  const fee = feeConfig(fpo);

  const valueOf = (o) => (o.farmerPayout ?? o.cropTotal ?? 0);
  // The gross the buyer pays for the crop. Unchanged from before payment modes
  // existed, and it is still what `pooledCropValue` means in the response.
  const pooled = orders.reduce((a, o) => a + valueOf(o), 0);
  const totalKg = orders.reduce((a, o) => a + (o.quantityKg || 0), 0);
  const fareTotal = orders.reduce((a, o) => a + (o.fare?.total ?? 0), 0);

  const sharesSet = activeMembers.length > 0
    && activeMembers.every((m) => typeof m.sharePct === 'number');

  const ordersOf = (uid) => orders.filter((o) => o.farmerUid === uid);

  // ── PROCUREMENT ─────────────────────────────────────────────────────────
  if (paymentMode === 'procurement') {
    const gaps = [];
    const agreedByOrder = new Map();
    for (const o of orders) {
      const grade = gradeByOrderId?.get(String(o._id)) ?? null;
      const rate = rateFor(fpo, o.cropName, grade);
      if (rate == null) {
        gaps.push({
          orderId: o._id,
          farmerUid: o.farmerUid, farmerName: o.farmerName,
          cropName: o.cropName, grade,
          quantityKg: o.quantityKg,
          reason: grade ? RATE_GAP_REASONS.NO_AGREED_RATE : RATE_GAP_REASONS.GRADE_UNKNOWN,
          detail: grade
            ? `No agreed rate on file for ${o.cropName} grade ${grade}.`
            : `This lot has no recorded grade, so no (crop, grade) rate can apply to it.`,
        });
        continue;
      }
      agreedByOrder.set(String(o._id), Math.round(rate * o.quantityKg));
    }

    const priced = orders.filter((o) => agreedByOrder.has(String(o._id)));
    const agreedPayable = priced.reduce((a, o) => a + agreedByOrder.get(String(o._id)), 0);
    const pricedKg = priced.reduce((a, o) => a + (o.quantityKg || 0), 0);
    const complete = gaps.length === 0;

    // Phase 3, L1 — freight is frozen on the LISTING at collection time and is
    // 0 by construction for anything collected while this group was already
    // in procurement mode (see CropListing.custody.freightOwedPerKg). It can
    // still be nonzero here if the group SWITCHED to procurement after a
    // facilitation-era collection already put stock in the shed — that debt
    // is real and does not evaporate because the mode changed later.
    const freightTotal = orders.reduce((a, o) => a + (o.freightDeduction?.amount || 0), 0);

    const byLot = activeMembers.map((m) => {
      const mine = ordersOf(m.farmerUid);
      const minePriced = mine.filter((o) => agreedByOrder.has(String(o._id)));
      const unpriced = mine.filter((o) => !agreedByOrder.has(String(o._id)));
      const freightOwed = mine.reduce((a, o) => a + (o.freightDeduction?.amount || 0), 0);
      const agreedAmount = minePriced.reduce((a, o) => a + agreedByOrder.get(String(o._id)), 0);
      return {
        farmerUid: m.farmerUid, farmerName: m.farmerName,
        lots: mine.length,
        quantityKg: mine.reduce((a, o) => a + o.quantityKg, 0),
        // What the lot fetched on the market. Under procurement this is the
        // FPO's money, not the member's — shown so the member can SEE that the
        // two are unrelated, which is the whole bargain they struck.
        grossAmount: mine.reduce((a, o) => a + valueOf(o), 0),
        agreedAmount,
        // Named, not folded silently into `amount` — a member who was
        // collected before this group ever went procurement can still owe
        // that run's freight, and hiding it inside a smaller number is the
        // exact silent-shrinkage bug this codebase keeps getting bitten by.
        freightOwed,
        // The payable: agreedAmount under procurement, less this member's own
        // collection freight, if any.
        amount: agreedAmount - freightOwed,
        unpricedLots: unpriced.length,
        unpricedKg: unpriced.reduce((a, o) => a + (o.quantityKg || 0), 0),
        settled: mine.length > 0 && mine.every((o) => o.settlement?.farmerPaid),
      };
    });

    return {
      paymentMode,
      orders: orders.length,
      totalQuantityKg: totalKg,
      pooledCropValue: pooled,
      transportFare: fareTotal,
      memberPayableTotal: agreedPayable - freightTotal,

      sharesAgreed: sharesSet,
      byLot,
      // Refused, not computed. See the block comment above.
      byShare: null,
      difference: null,
      byShareRefused: {
        code: 'SHARES_INCOHERENT_UNDER_PROCUREMENT',
        reason: 'Under procurement the FPO has already bought the crop at an agreed rate, so the sale '
          + "proceeds are the FPO's own revenue and there is no member pool to divide. A share split "
          + 'here could only mean either that members still own proceeds they were already paid for, '
          + 'or that the split overrides the agreed rate — which would hand the price risk back to the '
          + 'farmer, the exact thing procurement removes.',
      },

      procurement: {
        complete,
        ratesOnFile: (fpo.procurementRates || []).length,
        pricedLots: priced.length,
        pricedKg,
        gaps,
        note: complete
          ? 'Every lot was priced against the group\'s agreed (crop, grade) rate table.'
          : `${gaps.length} lot(s) have no agreed rate for the (crop, grade) they actually hold. They are `
            + 'NOT priced at zero and NOT quietly settled as facilitation — they are listed in `gaps` and '
            + 'excluded from every total below, because an FPO that has not agreed a rate for Grade C '
            + 'onion has not agreed what it owes for Grade C onion.',
      },

      fpoPosition: {
        paymentMode,
        fee: null,
        saleProceeds: pooled,
        agreedPayable,
        freightRecovered: freightTotal,
        // NEGATIVE WHEN THE LOT SOLD BADLY, AND REPORTED NEGATIVE. The FPO
        // bought at a fixed rate and the market moved against it. Clamping
        // this to zero would be the same lie as clamping a negative pooling
        // saving or a losing hold. Freight the FPO already paid a captain to
        // collect this stock, and is now recovering from the farmer's payout,
        // adds back to the FPO's own margin rather than staying a sunk cost.
        margin: pooled - agreedPayable + freightTotal,
        marginPerKg: pricedKg > 0
          ? Math.round(((pooled - agreedPayable + freightTotal) / pricedKg) * 100) / 100
          : null,
        complete,
        note: complete
          ? 'The FPO bought this crop at the agreed rates and resold it. What is left after paying '
            + 'members is the FPO\'s own margin, and it is negative when the lot sold for less than the '
            + 'group promised its members.'
          : 'INCOMPLETE. Some lots have no agreed rate, so the FPO\'s liability for them is unknown and '
            + 'this margin counts only the lots that could be priced. It is not the group\'s real position.',
      },

      note: 'This FPO buys its members\' crop at agreed per-grade rates. A member is owed that rate for '
        + 'the kilograms they delivered whatever the lot later fetched. The app does not move money — '
        + 'each farmer still confirms their own payment.',
    };
  }

  // ── FACILITATION ────────────────────────────────────────────────────────
  // One fee for the group, computed on what the group actually sold.
  const feeTotal = fee.mode === 'percent'
    ? Math.round(pooled * (fee.percent / 100))
    : fee.mode === 'per_kg'
      ? Math.round(totalKg * fee.perKg)
      : 0;

  // Apportioned to members on the basis the fee is charged on: lot value for a
  // percentage, weight for a per-kg fee. Linear either way, so this equals the
  // fee computed on each member's own lots — with the drift pinned so the
  // parts sum exactly.
  const bases = activeMembers.map((m) => {
    const mine = ordersOf(m.farmerUid);
    return fee.mode === 'per_kg'
      ? mine.reduce((a, o) => a + (o.quantityKg || 0), 0)
      : mine.reduce((a, o) => a + valueOf(o), 0);
  });
  const memberFees = feeTotal ? apportion(feeTotal, bases) : bases.map(() => 0);

  // Phase 3, L1 — a member's own farm→godown collection freight, frozen on
  // the listing at collection time (CropListing.custody.freightOwedPerKg)
  // and carried onto each Order as `freightDeduction`. Zero for any lot that
  // never passed through a collection run, so a plain farm-direct sale is
  // completely unaffected. This is a PERSONAL debt, not a group cost, so —
  // unlike the fee — it is applied per member in byLot and only recovered
  // group-wide (below, out of netPool) for the flat byShare split, exactly as
  // the fee already is.
  const freightByMember = activeMembers.map((m) =>
    ordersOf(m.farmerUid).reduce((a, o) => a + (o.freightDeduction?.amount || 0), 0));
  const freightTotal = freightByMember.reduce((a, x) => a + x, 0);

  const byLot = activeMembers.map((m, i) => {
    const mine = ordersOf(m.farmerUid);
    const gross = mine.reduce((a, o) => a + valueOf(o), 0);
    const freightOwed = freightByMember[i];
    return {
      farmerUid: m.farmerUid, farmerName: m.farmerName,
      lots: mine.length,
      quantityKg: mine.reduce((a, o) => a + o.quantityKg, 0),
      grossAmount: gross,
      fpoFee: memberFees[i],
      // Named rather than folded silently into `amount` — a member collected
      // by the group's own vehicle before this sale can owe real freight, and
      // hiding it inside a smaller number is the silent-shrinkage bug this
      // codebase keeps getting bitten by.
      freightOwed,
      // WITH THE DEFAULT ZERO FEE AND NO COLLECTION FREIGHT THIS IS `gross`,
      // byte for byte the number this route returned before payment modes
      // existed.
      amount: gross - memberFees[i] - freightOwed,
      settled: mine.length > 0 && mine.every((o) => o.settlement?.farmerPaid),
    };
  });

  // THE FEE AND ANY COLLECTION FREIGHT COME OFF BEFORE THE SPLIT — see the
  // block comment above. Freight is a real member-owed debt whichever split a
  // group uses; under a flat byShare split there is no per-member freight
  // line to attribute it to, so it comes off the shared pool exactly as the
  // fee already does.
  const netPool = pooled - feeTotal - freightTotal;
  let byShare = null;
  if (sharesSet) {
    const rows = activeMembers.map((m) => ({
      farmerUid: m.farmerUid, farmerName: m.farmerName,
      sharePct: m.sharePct,
      amount: Math.round(netPool * (m.sharePct / 100)),
    }));
    const drift = netPool - rows.reduce((a, r) => a + r.amount, 0);
    if (drift !== 0 && rows.length) {
      let big = 0;
      rows.forEach((r, i) => { if (r.sharePct > rows[big].sharePct) big = i; });
      rows[big].amount += drift;
    }
    byShare = rows;
  }

  return {
    paymentMode,
    orders: orders.length,
    totalQuantityKg: totalKg,
    pooledCropValue: pooled,
    transportFare: fareTotal,
    // What the members are owed between them, after the FPO's fee.
    memberPayableTotal: netPool,
    netPoolAfterFee: netPool,

    sharesAgreed: sharesSet,
    byLot,
    byShare,
    byShareRefused: null,
    procurement: null,

    difference: sharesSet
      ? byShare.map((r) => {
          const lot = byLot.find((l) => l.farmerUid === r.farmerUid);
          return {
            farmerUid: r.farmerUid, farmerName: r.farmerName,
            byLot: lot ? lot.amount : 0,
            byShare: r.amount,
            delta: r.amount - (lot ? lot.amount : 0),
          };
        })
      : null,

    fpoPosition: {
      paymentMode,
      fee: {
        mode: fee.mode,
        percent: fee.percent,
        perKg: fee.perKg,
        total: feeTotal,
        basis: fee.mode === 'per_kg' ? 'kg_delivered' : fee.mode === 'percent' ? 'gross_sale_value' : null,
      },
      saleProceeds: pooled,
      agreedPayable: null,
      freightRecovered: freightTotal,
      // The FPO's own fee, plus any collection freight it fronted and is now
      // recovering from members' payouts — the freight was never the group's
      // revenue, it is a cost the group already paid a captain and is simply
      // being made whole on, so it adds to margin the same way the fee does.
      margin: feeTotal + freightTotal,
      marginPerKg: null,
      complete: true,
      note: fee.mode === 'none'
        ? 'This FPO charges no fee, so the whole sale value goes to its members. That is the default and '
          + 'it is what this app did before FPO payment models existed.'
        : 'The FPO markets its members\' produce and takes an agreed fee off the sale. The fee is deducted '
          + 'BEFORE any member share split, so what the percentages divide is money that is actually the '
          + 'members\' to divide.',
    },

    note: sharesSet
      ? 'This records what the group agreed. The app does not move money — each farmer still confirms their own payment.'
      : 'No share agreement is set, so each member receives their own lot value. The admin can record a split if the group has agreed one.',
  };
}

/**
 * Which grade each order's lot actually was, read from the listing it came
 * from. Orders do not carry a grade of their own, and a procurement rate is
 * keyed on (crop, grade) — so an ungraded lot, or one whose listing is gone,
 * genuinely cannot be priced and is reported as a gap rather than guessed at.
 * Only ever called when the FPO is in procurement mode.
 */
async function gradesForOrders(orders) {
  const map = new Map();
  const ids = orders.map((o) => o.listingId).filter(Boolean);
  if (!ids.length) {
    orders.forEach((o) => map.set(String(o._id), null));
    return map;
  }
  const listings = await CropListing.find({ _id: { $in: ids } }).select('grade').lean();
  const byListing = new Map(listings.map((l) => [String(l._id), l.grade?.code || null]));
  orders.forEach((o) => map.set(String(o._id), byListing.get(String(o.listingId)) ?? null));
  return map;
}

/** Admin-only gate shared by every payment-config route. */
async function loadAsAdmin(id, uid, res, what) {
  const fpo = await Fpo.findById(id);
  if (!fpo) { res.status(404).json({ success: false, error: 'Not found' }); return null; }
  if (fpo.adminUid !== uid) {
    res.status(403).json({ success: false, code: 'NOT_ADMIN', error: `Only the group admin can ${what}` });
    return null;
  }
  return fpo;
}

/**
 * Choose which lots ride on one vehicle when the group has more than
 * MAX_BUNDLE of them.
 *
 * WHY THIS FUNCTION EXISTS AT ALL
 *   This used to be `lots.slice(0, MAX_BUNDLE)`. For an FPO with twelve
 *   members holding onions, members six to twelve were dropped on the floor:
 *   the buyer saw a bundle, a price and a saving computed from five lots, and
 *   nothing in the response said the other seven existed. Both halves of that
 *   were wrong — the silence, and the fact that WHICH five survived was
 *   whatever order Mongo happened to return, so two identical requests could
 *   quote two different bundles.
 *
 * THE RULE: THE TIGHTEST CLUSTER — the MAX_BUNDLE lots whose exact optimal
 * pickup route to the buyer's destination is shortest.
 *
 *   Why not "the five biggest lots": the vehicle is the cost and the load is
 *   nearly free (models/Consignment.js works the number: 100 kg over 65 km by
 *   tempo is 71% of the crop's value, 1,500 kg in the same tempo is 5%).
 *   Picking by weight can scatter the run across the district and produce
 *   exactly the failure CLAUDE.md already records for the greedy stop-order
 *   heuristic — a long route turning a real saving into "sharing costs more".
 *   Minimising the run is the mechanism that makes the saving exist, so that
 *   is what is optimised, with quantity only as a tie-break. It also leaves
 *   the excluded members clustered somewhere else, which is what makes a
 *   sensible SECOND run possible rather than leaving seven scattered orphans.
 *
 * WHY IT IS NOT O(n!), OR EVEN C(n, 5)
 *   Candidate sets are generated by ANCHOR: each lot in turn, plus the four
 *   lots nearest to it. A twelve-member FPO scores twelve candidates, not the
 *   792 that every-combination would need. Each candidate is then scored
 *   EXACTLY, by the same ≤120-permutation brute force consignments.js uses —
 *   so the number being compared is the true optimal route for that set, never
 *   a greedy approximation. Twelve candidates x 120 permutations is
 *   microseconds and costs zero OSRM calls; OSRM is called once, on the
 *   winner. The candidate GENERATION is a heuristic and may in principle miss
 *   a better set, but it cannot produce a route it has not exactly measured,
 *   and it is bounded work for a group of any size.
 *
 * DETERMINISM IS PART OF THE CONTRACT
 *   Ties break on route length, then total quantity (larger wins), then lot id
 *   ascending. Two identical requests must name the same five members — a
 *   selection that changes between calls is its own bug, and it is the one the
 *   arbitrary slice already had.
 *
 * Returns { chosen, excluded }: `chosen` carries each lot with its resolved
 * point, already in optimal visiting order, so the route that gets priced is
 * the route a consignment would actually drive.
 */
function selectBundleLots(lots, drop, max) {
  const points = lots.map((l) => ({ ...toLatLng(l.location), lot: l }));
  const kgOf = (p) => p.lot.quantityAvailableKg;
  const idOf = (p) => String(p.lot._id);

  if (points.length <= max) return { chosen: orderStops(points, drop), excluded: [] };

  let best = null;
  for (const anchor of points) {
    const cluster = [
      anchor,
      ...points
        .filter((p) => p !== anchor)
        .sort((a, b) => {
          const d = haversineKm(anchor, a) - haversineKm(anchor, b);
          if (Math.abs(d) > 1e-9) return d;
          if (kgOf(b) !== kgOf(a)) return kgOf(b) - kgOf(a);
          return idOf(a).localeCompare(idOf(b));
        })
        .slice(0, max - 1),
    ];
    // Rounded before comparing so two genuinely equal routes tie on the
    // tie-breakers rather than on a floating-point tail.
    const km = Math.round(optimalRouteKm(cluster, drop) * 1000) / 1000;
    const kg = cluster.reduce((a, p) => a + kgOf(p), 0);
    const key = cluster.map(idOf).sort().join(',');
    if (!best || km < best.km
      || (km === best.km && kg > best.kg)
      || (km === best.km && kg === best.kg && key < best.key)) {
      best = { cluster, km, kg, key };
    }
  }

  const chosenIds = new Set(best.cluster.map(idOf));
  const excluded = points
    .filter((p) => !chosenIds.has(idOf(p)))
    .sort((a, b) => (kgOf(b) - kgOf(a)) || idOf(a).localeCompare(idOf(b)))
    .map((p) => p.lot);

  return { chosen: orderStops(best.cluster, drop), excluded };
}

/**
 * ⚠️ TWO LOTS ARE NOT TWO TRIPS, AND ONE FARMER IS NOT TWO STOPS.
 *
 * Written once and attached to every priced lot, because getting this wrong
 * produces a wrong invoice rather than an error anybody would notice.
 *
 * Grade separation means one farmer holding Grade A and Grade B onion appears
 * in TWO lots — correctly, because the grades must not be blended. But a
 * vehicle collecting both stops at that farm ONCE. So when Phase D builds
 * ordering across lots it must:
 *   • count the ≤MAX_BUNDLE cap over DISTINCT farmerUid across the whole
 *     purchase, not per lot (each lot has been capped independently here);
 *   • re-price the combined run instead of adding two `bundledFare` figures —
 *     each is the cost of that lot's own trip, and two trips sharing farms and
 *     roads cost less together than the sum of the parts.
 * The same applies inside one lot to a farmer holding two listings of the same
 * crop AND grade: two contributions, one gate.
 *
 * `contributors[].farmerUid` and `farmersAlsoInOtherLots` carry the identity
 * needed to do that dedupe. Phase C does not build ordering and deliberately
 * does not try to solve it here.
 */
const CROSS_LOT_NOTE =
  'This prices THIS lot\'s pickup run on its own. Buying two lots from the same group is ONE vehicle, '
  + 'not two — and a farmer contributing to two grade lots is ONE pickup stop, not two. Do not add two '
  + 'lots\' fares together, and dedupe stops by contributors[].farmerUid before pricing a multi-lot order.';

/** A lot whose collection cost genuinely cannot be priced — nulls, never zeros. */
const unpriceableCollection = (reason, why) => ({
  priceable: false,
  pooled: false,
  reason,
  // Unknown, not free. A zero here would read as "collection costs nothing".
  distanceKm: null, vehicleType: null,
  bundledFare: null, separateFare: null,
  saving: null, savingPct: null, worthIt: false,
  transportPctBundled: null, transportPctSeparate: null,
  note: why,
  crossLotNote: CROSS_LOT_NOTE,
});

/** One excluded lot, said out loud rather than dropped. */
const excludedLot = (l, reason) => ({
  _id: l._id,
  farmerUid: l.farmerUid,
  farmerName: l.farmerName,
  quantityKg: l.quantityAvailableKg,
  pricePerKg: l.pricePerKg,
  grade: l.grade?.code || null,
  reason,
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * "WHICH GROUP AM I IN?" AND "AM I ALREADY COMMITTED SOMEWHERE?" ARE TWO
 * DIFFERENT QUESTIONS, AND THEY HAVE DIFFERENT ANSWERS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * THE BUG THIS SPLIT FIXES
 *   There used to be one function — `Fpo.findOne({ 'members.farmerUid': uid,
 *   status: 'active' })` — and the `status: 'active'` in it is the FPO's own
 *   status, not the member's. It matched a member row whatever state that row
 *   was in. A farmer who had merely REQUESTED to join (`/:id/join` correctly
 *   stores them as `status: 'pending'`) was therefore returned by
 *   `GET /mine` as their group: the app showed them as a member and the entire
 *   admin approval gate was invisible from the applicant's side. They could see
 *   the group's member list before anybody had said yes.
 *
 * SO THERE ARE NOW TWO FUNCTIONS AND EACH CALLER PICKS ONE ON PURPOSE:
 *
 *   activeMembershipOf()  — "which group am I IN". Only an APPROVED row counts.
 *                           This is what `/mine` needs, because supplying,
 *                           settling and sharing revenue are all things only an
 *                           active member does.
 *
 *   commitmentOf()        — "am I already committed anywhere", pending INCLUDED.
 *                           This is what `POST /` and `/:id/join` need. Counting
 *                           a pending request here is DELIBERATE, not a leftover:
 *                           without it a farmer could have live requests out to
 *                           five groups at once, and five admins would each be
 *                           approving somebody who is about to be somebody
 *                           else's member. One request at a time, and they can
 *                           always be rejected or withdraw.
 *
 * ⚠️ `status: { $in: ['active', null] }` INSIDE THE $elemMatch, NEVER
 *   `status: 'active'`. Member rows written before the field existed have no
 *   `status` at all, and `$in` with null is the form that matches a MISSING
 *   field — the mirror of the `$ne`-matches-missing bug already recorded in
 *   CLAUDE.md. Reading those rows as anything but active would silently evict
 *   every founding member of every group seeded before the approval gate.
 */

/** A member ROW that counts as approved. Missing status means active. */
const isActiveMemberRow = (m) => (m.status || 'active') === 'active';

/** The group this farmer is an APPROVED member of, or null. */
async function activeMembershipOf(uid) {
  return Fpo.findOne({
    status: 'active',
    members: { $elemMatch: { farmerUid: uid, status: { $in: ['active', null] } } },
  }).lean();
}

/**
 * The group this farmer is committed to — approved OR merely waiting on an
 * admin. Returns { fpo, membership } or null.
 */
async function commitmentOf(uid) {
  const fpo = await Fpo.findOne({ 'members.farmerUid': uid, status: 'active' }).lean();
  if (!fpo) return null;
  const membership = fpo.members.find((m) => m.farmerUid === uid);
  return { fpo, membership, status: (membership && membership.status) || 'active' };
}

/** POST /api/fpos — a farmer starts one. */
router.post('/', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const { name, regNumber, district, village } = req.body;
    if (!name || !String(name).trim())
      return res.status(400).json({ success: false, error: 'Give the group a name' });

    // A PENDING request counts here, deliberately — see commitmentOf(). A
    // farmer with a request out to another group is not free to start one.
    const existing = await commitmentOf(req.firebaseUid);
    if (existing)
      return res.status(409).json({
        success: false, code: 'ALREADY_MEMBER',
        error: existing.status === 'pending'
          ? `You have a join request waiting with ${existing.fpo.name}. Withdraw it or get a decision `
            + 'before starting your own group.'
          : `You are already in ${existing.fpo.name}. Leave it before starting another.`,
        membershipStatus: existing.status,
      });

    const fpo = await Fpo.create({
      name: String(name).trim(),
      regNumber: String(regNumber || '').trim() || null,
      district: district || req.profile.location?.district || '',
      village: village || '',
      adminUid: req.firebaseUid,
      adminName: req.profile.name,
      members: [{ farmerUid: req.firebaseUid, farmerName: req.profile.name }],
    });

    console.log(`👥 FPO ${fpo._id}: ${fpo.name} started by ${req.profile.name}`);
    res.status(201).json({ success: true, fpo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/fpos/mine — the caller's group, with its members' live lots.
 *
 * A PENDING APPLICANT IS NOT A MEMBER AND THIS SAYS SO. `fpo` is null for them
 * — the same shape a farmer with no group at all gets — because everything
 * hanging off `fpo` (the member list, the group's live tonnage, the settlement
 * view) describes a group they have not been let into. What they get instead is
 * `pendingRequest`, so the screen can say "waiting for approval" rather than
 * showing them somebody else's membership. `membershipStatus` is always present
 * and is the field to branch on.
 */
router.get('/mine', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    // The membership question first, because being a member is the common
    // case; the commitment question is only asked when the answer is no.
    const fpo = await activeMembershipOf(req.firebaseUid);

    if (!fpo) {
      const held = await commitmentOf(req.firebaseUid);
      if (!held)
        return res.json({ success: true, fpo: null, membershipStatus: 'none', pendingRequest: null });

      return res.json({
        success: true,
        fpo: null,
        membershipStatus: held.status,          // 'pending'
        pendingRequest: {
          fpoId: held.fpo._id,
          fpoName: held.fpo.name,
          district: held.fpo.district,
          village: held.fpo.village,
          requestedAt: held.membership.joinedAt,
          memberCount: held.fpo.members.filter(isActiveMemberRow).length,
        },
        note: 'Your request to join this group is waiting for its admin to approve it. You are not a '
          + 'member yet, so your lots are not part of the group\'s produce and no group settlement '
          + 'applies to them.',
      });
    }

    // A pending applicant is not yet supplying anything for this group —
    // only active members' lots count.
    const uids = fpo.members.filter(isActiveMemberRow).map((m) => m.farmerUid);
    const listings = await CropListing.find({ farmerUid: { $in: uids }, status: 'available' })
      .select('cropName quantityAvailableKg pricePerKg farmerUid farmerName grade location')
      .lean();

    res.json({
      success: true,
      membershipStatus: 'active',
      pendingRequest: null,
      fpo: {
        ...fpo,
        isAdmin: fpo.adminUid === req.firebaseUid,
        liveListings: listings.length,
        totalKgOnMarket: listings.reduce((a, l) => a + l.quantityAvailableKg, 0),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/fpos/admin/mine — "WHICH FPO DO I ADMINISTER?"
 *
 * ═══ WHY THIS IS NOT `/mine` ══════════════════════════════════════════════
 *
 * `/mine` answers a genuinely different question — "which group am I a MEMBER
 * of" — and it answers it by looking in `members[]`. That is right for a
 * farmer and wrong for an FPO's own account, because an `fpo` account is NOT
 * in its own `members[]` and must not be: a producer company's CEO is an
 * appointed officer, not a shareholding member-farmer, and putting them in the
 * member list would make every member count, every "supplying members" read
 * and every settlement row off by one non-farmer.
 *
 * So this route resolves on `adminUid` alone, which is what actually confers
 * FPO authority everywhere else in this file. It therefore answers for BOTH:
 * the new `fpo` account, and the legacy farmer-account that claimed an FPO
 * before the role existed. One endpoint, because "who administers this group"
 * has one answer and a second copy is a second place for it to drift.
 *
 * ═══ IT ALSO ANSWERS THE STATES BEFORE THERE IS AN FPO ════════════════════
 *
 * An FPO registrant signs up, searches the SFAC registry, claims their
 * company — and then WAITS, because a claim is reviewed by a human running
 * scripts/reviewFpoClaims.js (deliberately a terminal script, not an in-app
 * admin panel: see CLAUDE.md). Their landing screen has to be able to say
 * which of those states they are in, or it can only show them an empty
 * dashboard and let them guess.
 *
 *   active         you administer this FPO. `fpo` is populated.
 *   claim_pending  your claim is with a reviewer. `claim` names the company.
 *   claim_rejected your last claim was turned down; the registry entry is
 *                  back to unclaimed and you may claim again.
 *   none           you have not claimed anything.
 *
 * `adminStatus` is the field to branch on and is ALWAYS present — the same
 * discipline as `membershipStatus` on `/mine`.
 */
router.get('/admin/mine', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const uid = req.firebaseUid;
    const fpo = await Fpo.findOne({ adminUid: uid, status: 'active' }).lean();

    if (!fpo) {
      // No group. The most recent claim is what explains why — pending means
      // "waiting on a human", rejected means "you may try again". A claim that
      // is `approved` with no live Fpo cannot normally happen (the review
      // script compensates every partial write), so it is not special-cased
      // into a reassuring message: it falls through to `none`, which at least
      // offers the way forward rather than describing a state nobody can act on.
      const claim = await FpoAdminClaim.findOne({ uid, status: { $in: ['pending', 'rejected'] } })
        .sort({ createdAt: -1 })
        .populate('fpoMasterId', 'fpoName district block registrationNo')
        .lean();

      if (!claim)
        return res.json({ success: true, adminStatus: 'none', fpo: null, claim: null });

      const m = claim.fpoMasterId;
      return res.json({
        success: true,
        adminStatus: claim.status === 'pending' ? 'claim_pending' : 'claim_rejected',
        fpo: null,
        claim: {
          _id: claim._id,
          fpoMasterId: m ? m._id : null,
          fpoName: m ? m.fpoName : null,
          district: m ? m.district : null,
          block: m ? m.block : null,
          registrationNo: m ? m.registrationNo : null,
          designation: claim.designation,
          submittedAt: claim.createdAt,
          reviewedAt: claim.reviewedAt,
        },
        note: claim.status === 'pending'
          ? 'Your claim to represent this FPO is with a reviewer. A person checks it — this app does '
            + 'not grant it automatically, the same rule that governs buyer GSTIN verification. You '
            + 'will get the group\'s dashboard once it is approved.'
          : 'This claim was not approved. The registry entry is available to claim again.',
      });
    }

    // The same two live figures `/mine` reports to a member, from the same
    // rule: a PENDING applicant supplies nothing, so only active member rows
    // count. `isActiveMemberRow` handles rows written before `status` existed.
    const activeMembers = fpo.members.filter(isActiveMemberRow);
    const uids = activeMembers.map((m) => m.farmerUid);
    const [listings, pendingLotRequestCount] = await Promise.all([
      uids.length
        ? CropListing.find({ farmerUid: { $in: uids }, status: 'available' })
            .select('quantityAvailableKg').lean()
        : [],
      FpoLotRequest.countDocuments({ fpoId: fpo._id, status: 'pending' }),
    ]);

    res.json({
      success: true,
      adminStatus: 'active',
      claim: null,
      fpo: {
        ...fpo,
        isAdmin: true,
        memberCount: activeMembers.length,
        // Surfaced here because the FPO's landing screen is where an admin
        // would actually act on it; FpoScreen already fetches it separately
        // for the legacy farmer-admin path.
        pendingMemberCount: fpo.members.filter((m) => m.status === 'pending').length,
        // Same reasoning as pendingMemberCount: a buyer waiting on an
        // accept/reject decision is exactly the kind of thing an admin
        // should see the moment they land, not after opening the dashboard.
        pendingLotRequestCount,
        liveListings: listings.length,
        totalKgOnMarket: listings.reduce((a, l) => a + l.quantityAvailableKg, 0),
        // Empty means NOT DECLARED, never "deals in nothing" — the screen
        // rendering this must keep those apart. See models/Fpo.js.
        focusCrops: fpo.focusCrops || [],
        focusDeclared: (fpo.focusCrops || []).length > 0,
      },
      // Never dropped. A demo group attaches SYNTHETIC members to a REAL,
      // SFAC-registered company, and the screen showing it must be able to say
      // so — see models/Fpo.js dataSource.
      dataSource: fpo.dataSource || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/fpos/:id/join — raises a hand, does not add a member yet.
 * The applicant lands with status 'pending' and is invisible to every
 * "who is actually supplying" read (listings, bundles, settlement) until
 * the admin approves via POST /:id/members/:uid/approve.
 */
router.post('/:id/join', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    // A PENDING request counts here too, and on purpose — see commitmentOf().
    // Otherwise one farmer could have requests waiting with five groups at
    // once, and five admins would each be approving somebody who is about to
    // belong to somebody else.
    const existing = await commitmentOf(req.firebaseUid);
    if (existing)
      return res.status(409).json({
        success: false, code: 'ALREADY_MEMBER',
        error: existing.status === 'pending'
          ? `You already have a join request waiting with ${existing.fpo.name}. One at a time.`
          : `You are already in ${existing.fpo.name}.`,
        membershipStatus: existing.status,
      });

    // Guarded on the member NOT already being present, so a double tap cannot
    // add someone twice.
    const fpo = await Fpo.findOneAndUpdate(
      {
        _id: req.params.id, status: 'active',
        'members.farmerUid': { $ne: req.firebaseUid },
      },
      {
        $push: {
          members: { farmerUid: req.firebaseUid, farmerName: req.profile.name, status: 'pending' },
        },
      },
      { new: true }
    );
    if (!fpo) return res.status(409).json({ success: false, error: 'Could not join that group' });

    // ── DOES WHAT THIS FARMER GROWS MATCH WHAT THE GROUP DEALS IN? ────────
    //
    // Computed AFTER the request is recorded, and that ordering is the whole
    // decision. The join has already succeeded by this point: a mismatch is
    // something the farmer is TOLD, never something they are refused. A farmer
    // growing something adjacent to the group's crops is a conversation, and a
    // hard refusal would make the app wrong about a case the humans settle
    // easily every season.
    //
    // It is computed here rather than left to the admin's screen so the farmer
    // learns it at the moment they act, instead of waiting days for a rejection
    // whose reason nobody told them.
    const cropMatch = matchFarmerToFocus(
      fpo.focusCrops || [],
      await farmerCropNames({ Crop, CropListing }, req.firebaseUid),
    );
    res.json({ success: true, fpo, cropMatch });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/fpos/:id/members/pending — admin-only, who is waiting to join. */
router.get('/:id/members/pending', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const fpo = await Fpo.findById(req.params.id).lean();
    if (!fpo) return res.status(404).json({ success: false, error: 'Not found' });
    if (fpo.adminUid !== req.firebaseUid)
      return res.status(403).json({ success: false, error: 'Only the group admin can see pending members' });

    // EVERY PENDING ROW CARRIES ITS CROP MATCH, because this screen is where
    // the decision is actually made. Without it the admin is approving a name.
    //
    // ⚠️ Nothing here sorts, filters, ranks or hides anybody by their match.
    // The list is the list; the match is a column on it. A screen that buried
    // the mismatches would be enforcing a rule the group only stated as a
    // preference, which is the thing services/focusCropService.js exists to
    // refuse.
    const pendingRows = fpo.members.filter((m) => m.status === 'pending');
    const withMatch = await Promise.all(pendingRows.map(async (m) => ({
      ...m,
      cropMatch: matchFarmerToFocus(
        fpo.focusCrops || [],
        await farmerCropNames({ Crop, CropListing }, m.farmerUid),
      ),
    })));

    res.json({
      success: true,
      pending: withMatch,
      focusCrops: fpo.focusCrops || [],
      focusDeclared: (fpo.focusCrops || []).length > 0,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/fpos/:id/members/:uid/approve — admin-only. */
router.post('/:id/members/:uid/approve', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const owned = await Fpo.findById(req.params.id).lean();
    if (!owned) return res.status(404).json({ success: false, error: 'Not found' });
    if (owned.adminUid !== req.firebaseUid)
      return res.status(403).json({ success: false, error: 'Only the group admin can approve members' });

    const fpo = await Fpo.findOneAndUpdate(
      { _id: req.params.id, 'members.farmerUid': req.params.uid, 'members.status': 'pending' },
      { $set: { 'members.$.status': 'active' } },
      { new: true }
    );
    if (!fpo)
      return res.status(409).json({ success: false, error: 'No pending applicant with that uid' });

    console.log(`👥 FPO ${fpo._id}: ${req.params.uid} approved by admin`);
    res.json({ success: true, fpo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/fpos/:id/members/:uid/reject — admin-only. */
router.post('/:id/members/:uid/reject', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const owned = await Fpo.findById(req.params.id).lean();
    if (!owned) return res.status(404).json({ success: false, error: 'Not found' });
    if (owned.adminUid !== req.firebaseUid)
      return res.status(403).json({ success: false, error: 'Only the group admin can reject members' });

    const fpo = await Fpo.findOneAndUpdate(
      { _id: req.params.id },
      { $pull: { members: { farmerUid: req.params.uid, status: 'pending' } } },
      { new: true }
    );
    res.json({ success: true, fpo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/fpos/:id/leave — members leave; the admin must hand over first. */
router.post('/:id/leave', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const fpo = await Fpo.findById(req.params.id).lean();
    if (!fpo) return res.status(404).json({ success: false, error: 'Not found' });
    if (fpo.adminUid === req.firebaseUid && fpo.members.length > 1)
      return res.status(409).json({
        success: false, code: 'ADMIN_LAST',
        error: 'You started this group. Hand it to another member before leaving.',
      });

    await Fpo.updateOne({ _id: fpo._id }, { $pull: { members: { farmerUid: req.firebaseUid } } });

    // ── WHEN AN EMPTY GROUP IS A HUSK, AND WHEN IT IS STILL A COMPANY ───────
    //
    // This used to be `if (fpo.members.length <= 1) close`, which was correct
    // while EVERY admin was also a member: one member left meant the admin was
    // that member, and their walking out left nobody holding the group.
    //
    // An `fpo`-role admin is NOT in members[] (see scripts/reviewFpoClaims.js
    // for why an officer of a producer company is not a member-farmer). Under
    // the old rule, the single farmer in a newly-claimed FPO leaving would have
    // CLOSED a real, SFAC-registered company out from under its own CEO — and
    // there is no route that reopens one.
    //
    // So the condition is stated as what it actually meant: close only when
    // nobody is left AND the admin was one of the people who left. A group
    // whose admin holds it from outside members[] survives at zero members,
    // which is exactly what a real FPO looks like on its first day and after a
    // bad season.
    const remaining = fpo.members.filter((m) => m.farmerUid !== req.firebaseUid);
    const adminIsMember = fpo.members.some((m) => m.farmerUid === fpo.adminUid);
    if (remaining.length === 0 && adminIsMember)
      await Fpo.updateOne({ _id: fpo._id }, { $set: { status: 'closed' } });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/fpos/:id/shares — the admin records an agreed revenue split.
 * body: { shares: [{ farmerUid, sharePct }, ...] }
 *
 * WHAT A SHARE IS HERE, AND WHAT IT IS NOT
 *   Members sell their own lots by default, and their own lot value is what
 *   they receive — that is the honest default and it stays the default. Some
 *   FPOs instead agree a fixed split: pooled seed, pooled labour, so pooled
 *   proceeds. This records that agreement.
 *
 *   It does NOT move money. Nothing in this app does — B1 established that a
 *   settlement is a RECORD, and an FPO share is the same kind of record. What
 *   it buys is that everyone sees the same arithmetic instead of three
 *   farmers reconciling it on a phone call.
 *
 *   Shares must total exactly 100. A split that does not add up is not an
 *   agreement, it is a disagreement waiting to happen at the mandi gate.
 */
router.put('/:id/shares', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const { shares } = req.body;
    if (!Array.isArray(shares) || shares.length === 0)
      return res.status(400).json({ success: false, error: 'Provide a share for each member' });

    const fpo = await Fpo.findById(req.params.id);
    if (!fpo) return res.status(404).json({ success: false, error: 'Not found' });
    if (fpo.adminUid !== req.firebaseUid)
      return res.status(403).json({ success: false, error: 'Only the group admin can set shares' });

    // ── REFUSED UNDER PROCUREMENT ────────────────────────────────────────
    // Not "computed and quietly ignored" — refused, with the reason. Under
    // procurement the FPO has already bought the crop at an agreed rate, so
    // there is no member pool for percentages to divide; see the block comment
    // at the top of this file. Silently accepting a split that the settlement
    // then declines to use would leave an admin believing the group had agreed
    // something the app will never honour.
    if (fpo.paymentMode === 'procurement')
      return res.status(409).json({
        success: false, code: 'SHARES_INCOHERENT_UNDER_PROCUREMENT',
        error: 'This group buys its members\' crop at agreed per-grade rates, so each member is owed that '
          + 'rate for their own kilograms whatever the lot fetched. There is no pool of sale proceeds to '
          + 'divide by percentage — the proceeds are the FPO\'s once it has paid the agreed rates. Switch '
          + 'the group to facilitation first if the members are meant to share the sale.',
      });

    // A pending applicant has not joined the revenue arrangement yet — only
    // active members take a share.
    const activeMembers = fpo.members.filter((m) => m.status === 'active');
    const memberUids = new Set(activeMembers.map((m) => m.farmerUid));
    for (const sh of shares) {
      if (!memberUids.has(sh.farmerUid))
        return res.status(400).json({
          success: false, code: 'NOT_A_MEMBER',
          error: 'One of those farmers is not an active member of this group',
        });
      const n = Number(sh.sharePct);
      if (!Number.isFinite(n) || n < 0 || n > 100)
        return res.status(400).json({ success: false, error: 'Each share must be between 0 and 100' });
    }
    if (shares.length !== activeMembers.length)
      return res.status(400).json({
        success: false, code: 'MISSING_MEMBER',
        error: 'Every active member needs a share — including a zero if that is what was agreed',
      });

    // Rounded to two decimals before summing, so a split entered as thirds
    // (33.33 x 3) is accepted rather than rejected on a floating-point tail.
    const total = Math.round(shares.reduce((a, s) => a + Number(s.sharePct), 0) * 100) / 100;
    if (Math.abs(total - 100) > 0.5)
      return res.status(400).json({
        success: false, code: 'SHARES_NOT_100',
        error: `Shares add up to ${total}%, not 100%.`,
        total,
      });

    const byUid = new Map(shares.map((s) => [s.farmerUid, Number(s.sharePct)]));
    fpo.members.forEach((m) => { m.sharePct = byUid.get(m.farmerUid); });
    await fpo.save();

    console.log(`👥 FPO ${fpo._id}: shares set — ${shares.map((s) => s.sharePct + '%').join(' / ')}`);
    res.json({ success: true, fpo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** DELETE /api/fpos/:id/shares — back to "each member keeps their own lot value". */
router.delete('/:id/shares', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const fpo = await Fpo.findById(req.params.id);
    if (!fpo) return res.status(404).json({ success: false, error: 'Not found' });
    if (fpo.adminUid !== req.firebaseUid)
      return res.status(403).json({ success: false, error: 'Only the group admin can clear shares' });

    fpo.members.forEach((m) => { m.sharePct = null; });
    await fpo.save();
    res.json({ success: true, fpo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/fpos/:id/payment — admin-only. What this group's payment
 * arrangement currently is.
 *
 * ADMIN-ONLY, deliberately, and members are not left in the dark by it: every
 * figure that actually affects a member — the fee taken off their lot, the
 * agreed rate their kilograms were priced at, the FPO's own position — is on
 * GET /:id/settlement, which any active member can read. What is restricted
 * here is the CONFIGURATION, for the same reason `verification` is absent from
 * the profile-update allowlist: the ability to change what the group charges
 * must sit with exactly one person.
 */
router.get('/:id/payment', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const fpo = await loadAsAdmin(req.params.id, req.firebaseUid, res, 'see the payment arrangement');
    if (!fpo) return;
    const fee = feeConfig(fpo);
    res.json({
      success: true,
      payment: {
        fpoId: fpo._id, fpoName: fpo.name,
        paymentMode: fpo.paymentMode || 'facilitation',
        facilitationFee: fee,
        procurementRates: (fpo.procurementRates || []).map((r) => ({
          cropName: r.cropName, grade: r.grade, ratePerKg: r.ratePerKg, setAt: r.setAt,
        })),
        // Phase 3, L3 — who pays to move a SOLD lot from this group's godown
        // to the buyer. Every lot sale bills the buyer today regardless of
        // this value; only 'buyer_pays' is actually wired (see the model).
        freightTerm: fpo.freightTerm || 'buyer_pays',
        sharesAgreed: fpo.members.filter((m) => m.status === 'active')
          .every((m) => typeof m.sharePct === 'number'),
        grades: GRADES,
        note: (fpo.paymentMode || 'facilitation') === 'procurement'
          ? 'This group BUYS its members\' crop at the rates below. A (crop, grade) the group holds with '
            + 'no rate here cannot be settled and the settlement will name it rather than assume a figure.'
          : 'This group MARKETS its members\' produce. Members keep the sale value of their own lots, less '
            + `the fee${fee.mode === 'none' ? ' — which is currently zero' : ''}.`,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/fpos/:id/payment — admin-only.
 * body: { paymentMode?, facilitationFee?: { mode, percent, perKg } }
 *
 * Both fields are optional; whatever is omitted keeps its current value, so an
 * admin can change the fee without restating the mode.
 */
router.put('/:id/payment', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const fpo = await loadAsAdmin(req.params.id, req.firebaseUid, res, 'change the payment arrangement');
    if (!fpo) return;

    const nextMode = req.body.paymentMode === undefined
      ? (fpo.paymentMode || 'facilitation')
      : req.body.paymentMode;
    if (!PAYMENT_MODES.includes(nextMode))
      return res.status(400).json({
        success: false, code: 'BAD_PAYMENT_MODE',
        error: `paymentMode must be one of: ${PAYMENT_MODES.join(', ')}`,
      });

    // Fee, defaulted from what is already stored.
    const current = feeConfig(fpo);
    const raw = req.body.facilitationFee;
    let nextFee = current;
    if (raw !== undefined) {
      if (!raw || typeof raw !== 'object')
        return res.status(400).json({ success: false, error: 'facilitationFee must be an object' });
      const mode = raw.mode === undefined ? current.mode : raw.mode;
      if (!FEE_MODES.includes(mode))
        return res.status(400).json({
          success: false, code: 'BAD_FEE_MODE',
          error: `facilitationFee.mode must be one of: ${FEE_MODES.join(', ')}`,
        });
      const percent = Number(raw.percent ?? current.percent);
      const perKg = Number(raw.perKg ?? current.perKg);
      if (mode === 'percent' && (!Number.isFinite(percent) || percent < 0 || percent > 100))
        return res.status(400).json({
          success: false, code: 'BAD_FEE',
          error: 'A percentage fee must be between 0 and 100.',
        });
      if (mode === 'per_kg' && (!Number.isFinite(perKg) || perKg < 0))
        return res.status(400).json({
          success: false, code: 'BAD_FEE',
          error: 'A per-kg fee must be zero or more rupees per kilogram.',
        });
      // Only the field the mode names is kept. Storing 2% AND ₹0.50/kg would
      // be two agreements, and a member is entitled to one number to check.
      nextFee = {
        mode,
        percent: mode === 'percent' ? percent : 0,
        perKg: mode === 'per_kg' ? perKg : 0,
      };
    }

    if (nextMode === 'procurement') {
      // A facilitation fee under procurement is a number nothing would ever
      // read: the member is owed the agreed rate, not the sale less a fee.
      if (nextFee.mode !== 'none')
        return res.status(400).json({
          success: false, code: 'FEE_INCOHERENT_UNDER_PROCUREMENT',
          error: 'A procurement FPO does not charge its members a marketing fee — it buys their crop at '
            + 'an agreed rate and keeps whatever margin the resale makes. Clear the fee '
            + '(facilitationFee.mode: "none") in the same call if you are switching.',
        });
      // The mirror of the refusal in PUT /:id/shares. Without this the refusal
      // there is bypassable: set shares first, then switch mode.
      const active = fpo.members.filter((m) => m.status === 'active');
      if (active.length && active.every((m) => typeof m.sharePct === 'number'))
        return res.status(409).json({
          success: false, code: 'SHARES_INCOHERENT_UNDER_PROCUREMENT',
          error: 'This group has an agreed member share split recorded. A share split divides a pool of '
            + 'sale proceeds, and under procurement those proceeds are the FPO\'s once the agreed rates '
            + 'are paid — there is no pool to divide. Clear the split (DELETE /shares) first.',
        });
    }

    // Phase 3, L3 — accepted only as a no-op confirmation of the one value
    // that is actually wired. See the model comment: setting this to anything
    // else would be a control that changes nothing about what a buyer is
    // charged, which this codebase refuses everywhere else.
    if (req.body.freightTerm !== undefined && req.body.freightTerm !== 'buyer_pays')
      return res.status(400).json({
        success: false, code: 'FREIGHT_TERM_NOT_WIRED',
        error: 'Every lot sale still bills the buyer for the FPO→buyer delivery leg regardless of this '
          + 'setting, so only "buyer_pays" can be recorded today. Support for the FPO absorbing or '
          + 'negotiating that leg is not built yet.',
      });

    fpo.paymentMode = nextMode;
    fpo.facilitationFee = { ...nextFee, setAt: new Date(), setBy: req.firebaseUid };
    await fpo.save();

    console.log(`💰 FPO ${fpo._id}: paymentMode=${nextMode} fee=${nextFee.mode}`
      + (nextFee.mode === 'percent' ? ` ${nextFee.percent}%` : nextFee.mode === 'per_kg' ? ` ₹${nextFee.perKg}/kg` : ''));
    res.json({
      success: true,
      payment: {
        paymentMode: fpo.paymentMode,
        facilitationFee: feeConfig(fpo),
        procurementRates: fpo.procurementRates,
        freightTerm: fpo.freightTerm || 'buyer_pays',
      },
      note: nextMode === 'procurement'
        ? 'Members are now owed the agreed per-grade rate for their delivered kilograms, whatever the lot '
          + 'fetches. Any (crop, grade) with no rate on file will be named in the settlement, not guessed at.'
        : 'Members keep the sale value of their own lots, less the fee. The fee is deducted BEFORE any '
          + 'member share split.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/fpos/:id/procurement-rates — admin-only.
 * body: { rates: [{ cropName, grade, ratePerKg }, ...] }
 *
 * REPLACES the whole table, the same way PUT /:id/shares replaces the whole
 * split. A rate table read half from this call and half from a previous one is
 * a table nobody can state out loud, and "what did we agree to pay for Grade B
 * onion" has to have exactly one answer.
 *
 * GRADES STAY SEPARATE. One blended rate per crop would erase the only thing
 * grading is for, and a Grade C lot bought at the Grade A rate is not a
 * rounding error — it is the FPO paying for quality it did not receive.
 */
router.put('/:id/procurement-rates', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const fpo = await loadAsAdmin(req.params.id, req.firebaseUid, res, 'set procurement rates');
    if (!fpo) return;

    const { rates } = req.body;
    if (!Array.isArray(rates) || rates.length === 0)
      return res.status(400).json({
        success: false, code: 'NO_RATES',
        error: 'Provide at least one (crop, grade) rate. Use DELETE to clear the table.',
      });

    const seen = new Set();
    const clean = [];
    for (const r of rates) {
      const cropName = String(r?.cropName || '').trim();
      if (!cropName)
        return res.status(400).json({ success: false, code: 'BAD_CROP', error: 'Every rate needs a crop name' });
      if (!GRADES.includes(r?.grade))
        return res.status(400).json({
          success: false, code: 'BAD_GRADE',
          error: `grade must be one of: ${GRADES.join(', ')} — these are the app's own grade codes, `
            + 'and a rate against a grade that does not exist could never be applied to a real lot.',
        });
      const ratePerKg = Number(r?.ratePerKg);
      // Strictly positive. A zero rate is not an agreement to buy at nothing,
      // it is a missing figure wearing a number — and the settlement's whole
      // job is to tell those two apart.
      if (!Number.isFinite(ratePerKg) || ratePerKg <= 0)
        return res.status(400).json({
          success: false, code: 'BAD_RATE',
          error: `${cropName} grade ${r.grade}: the agreed rate must be more than ₹0 per kg.`,
        });

      const key = `${normCrop(cropName)}|${r.grade}`;
      if (seen.has(key))
        return res.status(400).json({
          success: false, code: 'DUPLICATE_RATE',
          error: `Two rates given for ${cropName} grade ${r.grade}. One (crop, grade) has one agreed rate.`,
        });
      seen.add(key);
      clean.push({ cropName, grade: r.grade, ratePerKg, setAt: new Date(), setBy: req.firebaseUid });
    }

    fpo.procurementRates = clean;
    await fpo.save();

    console.log(`💰 FPO ${fpo._id}: ${clean.length} procurement rate(s) — `
      + clean.map((r) => `${r.cropName}/${r.grade} ₹${r.ratePerKg}`).join(', '));
    res.json({
      success: true,
      procurementRates: fpo.procurementRates,
      appliesNow: (fpo.paymentMode || 'facilitation') === 'procurement',
      note: (fpo.paymentMode || 'facilitation') === 'procurement'
        ? 'These rates decide what members are owed.'
        : 'Stored, but NOT in force: this group is in facilitation mode, where members receive the sale '
          + 'value of their own lots less the fee. Switch to procurement for these rates to apply.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** DELETE /api/fpos/:id/procurement-rates — admin-only; empties the table. */
router.delete('/:id/procurement-rates', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const fpo = await loadAsAdmin(req.params.id, req.firebaseUid, res, 'clear procurement rates');
    if (!fpo) return;
    fpo.procurementRates = [];
    await fpo.save();
    res.json({
      success: true,
      procurementRates: [],
      warning: (fpo.paymentMode || 'facilitation') === 'procurement'
        ? 'This group is still in procurement mode with an EMPTY rate table, so every lot it holds will be '
          + 'reported as having no agreed rate until rates are set again.'
        : null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/fpos/:id/procurement/mine — a MEMBER's own past sales to THIS
 * group, and the group's current rate table.
 *
 * REPORTED DIRECTLY, alongside the missing sell action: before agreeing to
 * sell, a farmer should see the ACTUAL agreed rate (not the market price, not
 * an average) and their OWN real history with this specific FPO — not a
 * generic trust score. Both come from data this farmer already has a right
 * to see: the group's own rate table (already returned to any member via
 * GET /mine) and their own past FpoProcurement records.
 */
router.get('/:id/procurement/mine', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const fpo = await Fpo.findById(req.params.id).lean();
    if (!fpo || fpo.status !== 'active')
      return res.status(404).json({ success: false, error: 'No active group with that id.' });

    const mine = (fpo.members || []).find((m) => m.farmerUid === req.firebaseUid);
    if (!mine || !isActiveMemberRow(mine))
      return res.status(403).json({ success: false, error: 'You are not an active member of this group.' });

    const sales = await FpoProcurement.find({ farmerUid: req.firebaseUid, fpoId: fpo._id })
      .sort({ soldAt: -1 }).limit(50).lean();

    const totals = sales.reduce((a, s) => ({
      count: a.count + 1,
      totalKg: a.totalKg + s.quantityKg,
      totalOwed: a.totalOwed + s.amountOwed,
      totalPaid: a.totalPaid + (s.payment?.paid ? s.amountOwed : 0),
    }), { count: 0, totalKg: 0, totalOwed: 0, totalPaid: 0 });

    // "Sell together with nearby farmers" — REPORTED DIRECTLY. Selling to the
    // group is not just this one farmer's own trade: this app already knows
    // which OTHER active members hold the same (crop, grade) right now, and a
    // farmer deciding whether to sell should see that a bigger, combined lot
    // is forming, not just their own line. Computed from real member
    // listings only — never a fabricated "farmers near you" count — and
    // deliberately does not change what /procure does: each member still
    // sells their own listing at the group's own rate, same as today. This
    // is visibility into a real fact, not a new pooled-sale transaction.
    const activeMemberUids = (fpo.members || [])
      .filter(isActiveMemberRow)
      .map((m) => m.farmerUid)
      .filter((uid) => uid !== req.firebaseUid);

    let peers = [];
    if (activeMemberUids.length) {
      const peerListings = await CropListing.find({
        farmerUid: { $in: activeMemberUids },
        status: 'available',
        'grade.code': { $ne: null },
      }).select('farmerUid cropName grade quantityAvailableKg').lean();

      const byKey = new Map();
      for (const l of peerListings) {
        const key = `${(l.cropName || '').toLowerCase()}|${l.grade.code}`;
        if (!byKey.has(key)) byKey.set(key, { farmerUids: new Set(), totalKg: 0, cropName: l.cropName, grade: l.grade.code });
        const row = byKey.get(key);
        row.farmerUids.add(l.farmerUid);
        row.totalKg += l.quantityAvailableKg;
      }
      peers = [...byKey.values()]
        .filter((row) => row.farmerUids.size > 0)
        .map((row) => ({
          cropName: row.cropName,
          grade: row.grade,
          otherMembers: row.farmerUids.size,
          otherMembersTotalKg: Math.round(row.totalKg),
        }));
    }

    res.json({
      success: true,
      paymentMode: fpo.paymentMode || 'facilitation',
      procurementRates: (fpo.procurementRates || []).map((r) => ({
        cropName: r.cropName, grade: r.grade, ratePerKg: r.ratePerKg,
      })),
      sales,
      totals: {
        ...totals,
        unpaidCount: sales.filter((s) => !s.payment?.paid).length,
      },
      // Per (crop, grade): how many OTHER active members currently have that
      // same lot available, and their combined kg — "sell together" context,
      // matched to the farmer's own listing client-side by crop+grade.
      peers,
      note: (fpo.paymentMode || 'facilitation') !== 'procurement'
        ? 'This group is currently in facilitation mode, so it does not buy members\' crop directly — '
          + 'it markets your own listing to outside buyers instead. Any past sales below happened while '
          + 'the group was in procurement mode.'
        : null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/fpos/:id/procure — a MEMBER sells a listing DIRECTLY to their own
 * group, at the group's own agreed rate. body: { listingId, quantityKg? }
 *
 * ═══ THE GAP THIS FIXES ═══════════════════════════════════════════════════
 *
 * REPORTED DIRECTLY: "I've joined an FPO, there's no way to sell to it — only
 * to the open market." That is correct for a FACILITATION group by design
 * (see the header of models/FpoProcurement.js — the FPO never buys anything
 * in that mode). But a PROCUREMENT group has agreed to buy members' crop
 * outright, and nothing let a member actually do that trade — the rate table
 * existed only for the admin to set and for a buyer's eventual lot purchase
 * to read, never for the farmer it is about.
 *
 * ═══ WHAT THIS DELIBERATELY DOES NOT DO ═══════════════════════════════════
 *
 * It does not arrange transport. Ownership and the amount owed are a
 * financial fact the moment this succeeds; getting the crop to the godown is
 * a separate, later step, same as it always has been for these groups (see
 * FpoProcurement.pickup). It also never invents a rate: no agreed (crop,
 * grade) rate on file is a 409, not a fallback to the listing's own asking
 * price or the crop's other grades — the same refusal the buyer-side lot
 * catalog already makes.
 */
router.post('/:id/procure', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const fpo = await Fpo.findById(req.params.id);
    if (!fpo || fpo.status !== 'active')
      return res.status(404).json({ success: false, error: 'No active group with that id.' });

    const mine = fpo.members.find((m) => m.farmerUid === req.firebaseUid);
    if (!mine || !isActiveMemberRow(mine))
      return res.status(403).json({ success: false, error: 'You are not an active member of this group.' });

    if ((fpo.paymentMode || 'facilitation') !== 'procurement')
      return res.status(400).json({
        success: false, code: 'NOT_PROCUREMENT_MODE',
        error: 'This group markets members\' produce to outside buyers rather than buying it directly — '
          + 'there is no group rate to sell in to. Ask your group\'s admin if you believe this should be a '
          + 'procurement group.',
      });

    const { listingId } = req.body || {};
    if (!mongoose.isValidObjectId(listingId))
      return res.status(400).json({ success: false, error: 'Which listing?' });

    const listing = await CropListing.findOne({
      _id: listingId, farmerUid: req.firebaseUid, status: 'available',
    }).lean();
    if (!listing)
      return res.status(404).json({
        success: false, error: 'That listing was not found, is not yours, or is no longer available.',
      });

    const grade = listing.grade?.code || null;
    if (!grade)
      return res.status(409).json({
        success: false, code: 'GRADE_REQUIRED',
        error: 'This group\'s rates are agreed per (crop, grade), and this lot has no declared grade. '
          + 'Add a grade to the listing, or ask the group to agree a rate for ungraded produce.',
      });

    const ratePerKg = rateFor(fpo, listing.cropName, grade);
    if (ratePerKg == null)
      return res.status(409).json({
        success: false, code: 'NO_AGREED_RATE',
        error: `${fpo.name} has no agreed rate on file for ${listing.cropName} grade ${grade}. `
          + 'It is not priced at zero and does not fall back to another grade\'s rate.',
      });

    const rawQty = req.body?.quantityKg;
    const quantityKg = rawQty === undefined || rawQty === null || rawQty === ''
      ? listing.quantityAvailableKg
      : Number(rawQty);
    if (!Number.isFinite(quantityKg) || quantityKg <= 0 || quantityKg > listing.quantityAvailableKg)
      return res.status(400).json({
        success: false, code: 'BAD_QUANTITY',
        error: `Enter a quantity between 0 and ${listing.quantityAvailableKg} kg.`,
      });

    // The SAME guarded decrement every stock write in this app uses — the
    // expected state is IN THE FILTER, never checked in JavaScript first, so
    // this cannot double-sell against a listing that changed underneath it
    // (a buyer's order, or another procurement sale, landing first).
    const decremented = await CropListing.findOneAndUpdate(
      {
        _id: listingId, farmerUid: req.firebaseUid, status: 'available',
        quantityAvailableKg: { $gte: quantityKg },
      },
      { $inc: { quantityAvailableKg: -quantityKg } },
      { new: true }
    );
    if (!decremented)
      return res.status(409).json({
        success: false, code: 'STOCK_CHANGED',
        error: 'This listing\'s available quantity changed just now. Refresh and try again.',
      });

    // What is left cannot be bought by anyone if it is under the farmer's own
    // stated minimum — the same rule POST /api/orders applies after its own
    // decrement.
    await CropListing.updateOne(
      { _id: listingId, status: 'available', $expr: { $lt: ['$quantityAvailableKg', '$minOrderKg'] } },
      { $set: { status: 'sold_out' } }
    );

    const amountOwed = Math.round(quantityKg * ratePerKg * 100) / 100;
    const sale = await FpoProcurement.create({
      farmerUid: req.firebaseUid,
      farmerName: req.profile?.name || listing.farmerName,
      farmerPhone: req.profile?.phone || '',
      fpoId: fpo._id,
      fpoName: fpo.name,
      listingId: listing._id,
      cropName: listing.cropName,
      cropLocalName: listing.cropLocalName || '',
      grade,
      quantityKg,
      ratePerKg,
      amountOwed,
    });

    console.log(`💰 FPO ${fpo._id}: bought ${quantityKg}kg ${listing.cropName} grade ${grade} `
      + `from ${req.firebaseUid} at ₹${ratePerKg}/kg = ₹${amountOwed}`);
    res.status(201).json({
      success: true,
      sale,
      note: 'Recorded. The group now owes you this amount — arranging pickup is the next step, from the '
        + 'group\'s own collection screen.',
    });
  } catch (err) {
    console.error('POST /fpos/:id/procure', err);
    res.status(500).json({ success: false, error: 'Could not record that sale.' });
  }
});

/**
 * POST /api/fpos/:id/procurement/:saleId/pay — admin-only; marks one direct
 * procurement sale paid. Mirrors POST /api/orders/:id/settle's guarded write
 * exactly, so "paid" means one thing everywhere in this app.
 */
router.post('/:id/procurement/:saleId/pay', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const fpo = await loadAsAdmin(req.params.id, req.firebaseUid, res, 'settle a procurement sale');
    if (!fpo) return;

    const method = ['cash', 'upi', 'bank', 'other'].includes(req.body?.method) ? req.body.method : 'cash';
    const sale = await FpoProcurement.findOneAndUpdate(
      { _id: req.params.saleId, fpoId: fpo._id, 'payment.paid': false },
      { $set: { 'payment.paid': true, 'payment.paidAt': new Date(), 'payment.method': method } },
      { new: true }
    );
    if (!sale) {
      const existing = await FpoProcurement.findOne({ _id: req.params.saleId, fpoId: fpo._id }).lean();
      if (!existing) return res.status(404).json({ success: false, error: 'That sale was not found.' });
      return res.status(409).json({
        success: false, code: 'ALREADY_PAID', error: 'This sale is already marked as paid.',
      });
    }
    res.json({ success: true, sale });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/fpos/:id/lot?lotKey=<fpoId::cropKey::gradeKey> — ONE LOT, OPENED UP.
 *
 * ═══ THE GAP ══════════════════════════════════════════════════════════════
 *
 * The dashboard shows a group's produce aggregated by crop and grade and there
 * was NOTHING UNDERNEATH IT. An admin looking at "Onion · Grade A · 2,400 kg"
 * could not see which five members it came from, what each of them is asking,
 * or whether any of them has ever actually delivered. They were reading a
 * headline and being asked to run a business on it.
 *
 * ═══ WHAT IS NEW HERE, AND WHAT IS DELIBERATELY REUSED ════════════════════
 *
 * The lot itself is NOT rebuilt — it comes from `lotCatalog.buildLots()`, the
 * same function the buyer's catalog and the dashboard already use, so this
 * screen cannot start describing a lot differently from the two surfaces that
 * describe it today. That discipline is why `computeSettlement()` is shared too.
 *
 * What this adds is the one thing none of them has: HISTORY. What each of these
 * members has actually delivered of this crop before, at what price, and what
 * happened at the gate when they did.
 *
 * ═══ ⚠️ A MEMBER WITH NO HISTORY REPORTS ZERO, NEVER AN ESTIMATE ══════════
 *
 * Most members of a real FPO have sold nothing through this app yet. Their
 * history is `sales: 0` with `avgPricePerKg: null` and a sentence saying so —
 * never an average borrowed from the group, and never a blank that reads as
 * "fine". Same rule as `trustService` refusing to band below a minimum number
 * of trades, and it is why the trust block rides along untouched.
 */
router.get('/:id/lot', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const fpo = await loadAsAdmin(req.params.id, req.firebaseUid, res, 'open a lot');
    if (!fpo) return;

    // ⚠️ TWO KEY SHAPES ARE REAL IN THIS CODEBASE AND BOTH ARE ACCEPTED HERE.
    //
    //   `cropKey::gradeKey`          what lotCatalog.buildLots() mints, and
    //                                therefore what the admin DASHBOARD's
    //                                `availableLots` carry.
    //   `fpoId::cropKey::gradeKey`   what GET /bundles prefixes for a buyer,
    //                                because that response spans many groups
    //                                and the key has to say which.
    //
    // This route already has the group in its PATH, so demanding the longer
    // form would mean a screen reading a dashboard lot had to reassemble a key
    // it was never given — and getting that wrong is a silent 400 on the one
    // screen this feature exists for. `parseLotKey()` itself is left alone: it
    // is shared with /lots/quote and /lots/confirm, which have no fpoId in the
    // path and genuinely need all three parts.
    const rawKey = String(req.query.lotKey || '');
    const parts = rawKey.split('::');
    let parsed = null;
    if (parts.length === 2) {
      const [cropKey, gradeKey] = parts;
      if (cropKey && (gradeKey === lotCatalog.UNGRADED || lotCatalog.GRADE_ORDER.includes(gradeKey)))
        parsed = { fpoId: String(fpo._id), cropKey, gradeKey };
    } else {
      const p3 = parseLotKey(rawKey);
      // A key naming a DIFFERENT group is refused rather than quietly served
      // from this one — same rule as every other adminUid check here.
      if (p3 && String(p3.fpoId) === String(fpo._id)) parsed = p3;
    }
    if (!parsed)
      return res.status(400).json({
        success: false, code: 'BAD_LOT_KEY',
        error: 'lotKey must name a lot belonging to this group — either "cropKey::gradeKey" as '
          + 'the dashboard returns it, or "fpoId::cropKey::gradeKey" as the buyer catalog does.',
      });

    const activeMembers = fpo.members.filter(isActiveMemberRow);
    const uids = activeMembers.map((m) => m.farmerUid);

    // Built from the SAME listings and the SAME function the dashboard uses,
    // then the one lot is selected — rather than querying for that crop
    // directly, which would be a second way of deciding what a lot contains.
    const listings = uids.length
      ? await CropListing.find({ farmerUid: { $in: uids }, status: 'available' })
        .sort({ _id: 1 })
        .select('cropName quantityAvailableKg pricePerKg minOrderKg farmerUid farmerName location grade')
        .lean()
      : [];
    const trustByUid = new Map(
      await Promise.all(uids.map(async (u) => [u, await trustService.forFarmer(u)]))
    );
    const lots = lotCatalog.buildLots(listings, { trustByUid });
    const lot = lots.find((l) => l.cropKey === parsed.cropKey && l.gradeKey === parsed.gradeKey);
    if (!lot)
      return res.status(404).json({
        success: false, code: 'LOT_GONE',
        error: 'This group is not holding that lot any more — it may have sold, or the listings '
          + 'behind it may have been withdrawn.',
      });

    // ── HISTORY, FROM REAL ORDERS ONLY ─────────────────────────────────
    //
    // `delivered` only. An order in flight has not proved anything yet, and a
    // cancelled one proves the opposite of what counting it would suggest.
    // Matched on the crop KEY (trimmed, lowercased) rather than the raw name,
    // so two members who typed "Onion" and "onion" are one crop here exactly as
    // they are one lot above.
    const contributorUids = lot.contributors.map((c) => c.farmerUid);
    const past = contributorUids.length
      ? await Order.find({
        farmerUid: { $in: contributorUids },
        status: 'delivered',
      }).select('farmerUid cropName quantityKg pricePerKg cropTotal farmerPayout deliveredAt '
        + 'settlement pickupOutcome').sort({ deliveredAt: -1 }).lean()
      : [];
    const thisCrop = past.filter((o) => lotCatalog.cropKeyOf(o.cropName) === parsed.cropKey);

    const historyFor = (uid) => {
      const mine = thisCrop.filter((o) => o.farmerUid === uid);
      if (!mine.length) {
        return {
          sales: 0, kgDelivered: 0, avgPricePerKg: null, lastSaleAt: null,
          // ⚠️ NAMED, not left blank. A blank row reads as "nothing wrong";
          // this says plainly that there is nothing to read.
          note: 'No completed sales of this crop through the app yet. That is not a mark against '
            + 'them — most members of a real group have never sold through here.',
        };
      }
      const kg = mine.reduce((a, o) => a + (o.quantityKg || 0), 0);
      const value = mine.reduce((a, o) => a + (o.cropTotal || 0), 0);
      const paid = mine.filter((o) => o.settlement?.farmerPaid).length;
      // ⚠️ Σvalue / Σkg, NOT the mean of the per-order prices. A mean of prices
      // weights a 20 kg sale the same as a 2,000 kg one and is not a price
      // anybody ever paid — the same trap the lot's own indicative price
      // documents (lotCatalogService priceSpread).
      const avg = kg > 0 ? Math.round((value / kg) * 100) / 100 : null;
      const weighed = mine.filter((o) => o.pickupOutcome?.weight?.method
        && !['estimated', 'not_recorded'].includes(o.pickupOutcome.weight.method)).length;
      const conceded = mine.filter((o) => o.pickupOutcome?.grade?.farmerResponse === 'accepted').length;
      return {
        sales: mine.length,
        kgDelivered: kg,
        avgPricePerKg: avg,
        lastSaleAt: mine[0].deliveredAt || null,
        settledCount: paid,
        unsettledCount: mine.length - paid,
        // How much of this member's own history rests on a weighed quantity.
        weighedSales: weighed,
        // The only grade evidence this app treats as established.
        concededDowngrades: conceded,
        note: `${mine.length} completed sale${mine.length === 1 ? '' : 's'} of this crop through `
          + `the app. The average is Σvalue ÷ Σkg, so a large sale counts for more than a small `
          + 'one — it is not the mean of the asking prices.',
      };
    };

    const contributors = lot.contributors.map((c) => ({ ...c, history: historyFor(c.farmerUid) }));

    // ── THE GROUP'S OWN HISTORY WITH THIS CROP ─────────────────────────
    const gKg = thisCrop.reduce((a, o) => a + (o.quantityKg || 0), 0);
    const gValue = thisCrop.reduce((a, o) => a + (o.cropTotal || 0), 0);
    const prices = thisCrop.map((o) => o.pricePerKg).filter((p) => Number.isFinite(p));

    res.json({
      success: true,
      lot,
      contributors,
      groupHistory: {
        sales: thisCrop.length,
        kgSold: gKg,
        cropValue: gValue,
        realisedAvgPerKg: gKg > 0 ? Math.round((gValue / gKg) * 100) / 100 : null,
        lowestPerKg: prices.length ? Math.min(...prices) : null,
        highestPerKg: prices.length ? Math.max(...prices) : null,
        firstSaleAt: thisCrop.length ? thisCrop[thisCrop.length - 1].deliveredAt : null,
        lastSaleAt: thisCrop.length ? thisCrop[0].deliveredAt : null,
        // ⚠️ ACROSS ALL GRADES, and it says so. Past orders carry no grade of
        // their own — the grade lives on the listing, and a listing can be
        // gone. Silently presenting a mixed-grade history as this GRADE's
        // history would be the blending the lot catalog exists to refuse.
        note: thisCrop.length
          ? 'What this group\'s members have actually realised for this CROP through the app, '
            + 'across all grades. Orders do not carry a grade of their own, so this cannot be '
            + 'split by grade without inventing the split.'
          : 'Nobody in this group has completed a sale of this crop through the app yet, so there '
            + 'is no realised price to compare an asking price against.',
      },
      disclaimers: {
        grade: lot.grade?.disclaimer
          || 'Grades here are declared by the farmers themselves and nobody has inspected them.',
        history: 'History counts DELIVERED orders only. An order still in flight has not proved '
          + 'anything and a cancelled one proves the opposite.',
        trust: 'Each contributor\'s delivery record is the same one a buyer sees. Below a minimum '
          + 'number of completed trades it is not banded at all — counts only.',
      },
    });
  } catch (err) {
    console.error('❌ FPO lot drill-down error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET  /api/fpos/:id/focus-crops — what this group deals in, and the list it
 *      may choose from. Admin-only, like every other configuration read here.
 * PUT  /api/fpos/:id/focus-crops   body: { crops: ['Onion', 'Grapes'] }
 * DELETE /api/fpos/:id/focus-crops — back to "not declared".
 *
 * ⚠️ DECLARING NOTHING AND DECLARING BADLY ARE DIFFERENT, and the API keeps
 * them apart. An empty list is "this group has not said", which matches
 * everybody and is the default every existing group is already in — no
 * migration, no behaviour change for the ten seeded FPOs. A list with a crop
 * this app does not know is REFUSED by name rather than silently dropped,
 * because a group that thinks it declared six crops and actually declared five
 * is matching against a list it never agreed to.
 *
 * See services/focusCropService.js for why the group states this rather than
 * the app deriving it, and for why every use of it is advisory.
 */
router.get('/:id/focus-crops', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const fpo = await loadAsAdmin(req.params.id, req.firebaseUid, res, 'see the focus crops');
    if (!fpo) return;
    res.json({
      success: true,
      focusCrops: fpo.focusCrops || [],
      declared: (fpo.focusCrops || []).length > 0,
      setAt: fpo.focusCropsSetAt || null,
      // The list to choose from travels with the answer so a picker never has
      // to hard-code a copy of it — the same reason GET /:id/payment returns
      // `grades`.
      choices: FOCUS_CROP_NAMES,
      maxCrops: MAX_FOCUS_CROPS,
      note: (fpo.focusCrops || []).length
        ? 'Farmers see this before asking to join, and a mismatch is shown to you when they do. It is '
          + 'advice on the screen, not a rule in the code — nothing is blocked and no sale is affected.'
        : 'This group has not declared its crops. That matches every farmer, which is not the same as '
          + 'saying it deals in everything — it means the field is empty.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id/focus-crops', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const fpo = await loadAsAdmin(req.params.id, req.firebaseUid, res, 'set the focus crops');
    if (!fpo) return;

    const v = validateFocusCrops(req.body?.crops);
    if (!v.ok && v.reason === 'NOT_A_LIST')
      return res.status(400).json({
        success: false, code: 'BAD_CROPS',
        error: 'Send `crops` as a list of crop names. An empty list clears the declaration.',
      });
    if (!v.ok && v.reason === 'UNKNOWN_CROP')
      return res.status(400).json({
        success: false, code: 'UNKNOWN_CROP',
        unknown: v.unknown,
        error: `This app does not know ${v.unknown.length === 1 ? 'this crop' : 'these crops'}: `
          + `${v.unknown.join(', ')}. Nothing was saved — a group that thinks it declared six crops `
          + 'and actually declared five would be matched against a list it never agreed to.',
        choices: FOCUS_CROP_NAMES,
      });
    if (!v.ok && v.reason === 'TOO_MANY')
      return res.status(400).json({
        success: false, code: 'TOO_MANY_CROPS',
        error: `A group can declare at most ${MAX_FOCUS_CROPS} crops. Beyond that the field stops `
          + 'telling a farmer anything — declaring half the list is the same as declaring nothing. '
          + 'Nothing was saved and nothing was trimmed for you.',
        maxCrops: MAX_FOCUS_CROPS,
      });

    fpo.focusCrops = v.crops;
    fpo.focusCropsSetAt = new Date();
    fpo.focusCropsSetBy = req.firebaseUid;
    await fpo.save();

    console.log(`🌾 FPO ${fpo._id}: focus crops = ${v.crops.join(', ') || '(none)'}`);
    res.json({
      success: true,
      focusCrops: v.crops,
      declared: v.crops.length > 0,
      note: v.crops.length
        ? 'Saved. Farmers browsing groups in your district now see this, and a farmer whose crops do '
          + 'not match is told so before they ask — but they can still ask, and you still decide.'
        : 'Cleared. This group is back to "not declared", which matches every farmer.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id/focus-crops', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const fpo = await loadAsAdmin(req.params.id, req.firebaseUid, res, 'clear the focus crops');
    if (!fpo) return;
    fpo.focusCrops = [];
    fpo.focusCropsSetAt = null;
    fpo.focusCropsSetBy = null;
    await fpo.save();
    res.json({
      success: true, focusCrops: [], declared: false,
      note: 'Cleared. This group is back to "not declared", which matches every farmer — it does not '
        + 'mean the group deals in everything.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/fpos/:id/settlement?orderIds=a,b,c
 *
 * What each member is owed from a set of the group's sales — the arithmetic
 * everyone can check, computed BOTH ways:
 *
 *   byLot    each member receives their own lot's value. Always shown,
 *            because it is what actually happens unless the group says
 *            otherwise, and it is what Order.farmerPayout already records.
 *   byShare  the pooled total redistributed by the agreed percentages. Only
 *            present when shares are set.
 *
 * Showing both, with the difference, is the point. A member who is 8,000
 * rupees better off under one arrangement than the other should be able to
 * see that plainly rather than discover it later.
 *
 * `paymentMode` is a SEPARATE AXIS and it changes what those two views mean.
 * The full reasoning is the block comment at the top of this file; the short
 * version is that byLot/byShare divide a pool, while paymentMode decides what
 * a member is owed relative to the sale in the first place. `fpoPosition` in
 * the response says what the FPO itself is left with either way, and under
 * procurement that figure can be negative.
 */
/**
 * GET /api/fpos/:id/orders — THE GROUP'S TRADE HISTORY.
 *   ?limit=  (default 60, max 200)
 *
 * ═══ WHY THIS DID NOT EXIST AND HAD TO ═══════════════════════════════════
 *
 * `GET /:id/settlement` can divide money across members — but it REQUIRES
 * `orderIds`, so the caller must already know which orders to ask about. And
 * nothing anywhere listed a group's orders. So an FPO admin could compute a
 * settlement for orders they had no way to find, and neither the officer nor
 * a member could answer the three questions the group actually turns on:
 * what has been sold, what has been PAID, and what is still outstanding.
 *
 * That is the same defect class already recorded four times in CLAUDE.md —
 * the arithmetic shipped, the screen that would have used it did not, and a
 * green test suite proved nothing about it.
 *
 * ⚠️ TWO AUDIENCES, TWO SCOPES, AND THEY MUST NOT BE COLLAPSED.
 *   • The ADMIN sees every member's orders — that is the officer's job.
 *   • A MEMBER sees ONLY THEIR OWN. A member is not entitled to another
 *     member's payout, price or payment record just by belonging to the same
 *     company; that is somebody else's trade. `scope` says which view came
 *     back so a screen cannot render one as the other.
 *
 * ⚠️ IT DOES NOT RE-DERIVE MONEY. Per-order figures are read as stored, and
 * anything that has to be APPORTIONED goes through computeSettlement() —
 * the one function /settlement and the dashboard's seasonSettlement already
 * share. A second copy of the fee ordering is a second place for it to be
 * applied differently, with no way for a member reading one screen against
 * the other to tell which is right.
 */
/**
 * PUT /api/fpos/:id/premises — where the group's produce is collected TO.
 * body: { lat, lng, label?, landmark?, district? }
 *
 * ⚠️ THE GROUP STATES THIS BECAUSE THERE IS NOTHING HONEST TO DERIVE IT FROM.
 * models/Fpo.js carries a `district` and nothing finer, and a collection run
 * needs a real dropoff: it routes a real vehicle, bills each member a
 * by-weight share of a real fare, and quotes a distance. Falling back to a
 * district centroid would make all three describe a point nobody's godown
 * stands on — the mistake `backfillGeo.js` and the MSWC warehouse import both
 * already refuse.
 */
router.put('/:id/premises', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const fpo = await loadAsAdmin(req.params.id, req.firebaseUid, res, 'set the collection point');
    if (!fpo) return;

    const point = toLatLng({ lat: Number(req.body?.lat), lng: Number(req.body?.lng) });
    if (!point)
      return res.status(400).json({
        success: false, code: 'BAD_POINT',
        error: 'A usable latitude and longitude are required for the collection point.',
      });

    fpo.premises = {
      declared: true,
      lat: point.lat,
      lng: point.lng,
      label: String(req.body?.label || '').slice(0, 160),
      landmark: String(req.body?.landmark || '').slice(0, 200),
      // Derived server-side from the coordinate, never taken from the body —
      // the same rule that keeps `costSource` and `verification` out of
      // client control.
      district: resolveDistrict(null, point) || fpo.district || '',
      setAt: new Date(),
      setBy: req.firebaseUid,
    };
    await fpo.save();
    res.json({ success: true, premises: fpo.premises });
  } catch (err) {
    console.error('PUT /fpos/:id/premises', err);
    res.status(500).json({ success: false, error: 'Could not save the collection point' });
  }
});

/**
 * POST /api/fpos/:id/collection-runs — BRING MEMBERS' PRODUCE IN TO THE GROUP.
 * body: { listingIds: [...], vehicleType?, transportMode?, statedCost?, quantities?: {listingId: kg} }
 *
 * ═══ WHAT THIS IS, AND WHY IT IS NOT A BUYER RUN ═════════════════════════
 *
 * Every consignment before Phase 3 moved crop from a farm to a BUYER, against
 * Orders that had already been placed and priced. This one moves a member's
 * produce from their farm to the GROUP'S OWN PREMISES, before anybody has
 * bought it. There is no vendor, no Order and no price — which is why
 * `Consignment.purpose` exists and why `vendorUid` and `stops[].orderId` are
 * conditionally required. Minting placeholder Orders to fill those fields was
 * considered and rejected: an Order asserts a trade at a price to a buyer, and
 * inventing one to satisfy a key is the fabrication this app refuses
 * everywhere else.
 *
 * ⚠️ NOTHING HERE IS FORKED. The stop ordering (`orderStops`, exact brute
 * force over ≤120 permutations — never a greedy heuristic, which once picked a
 * 168 km route where 120 km existed), the fare split (`splitFare`, BY WEIGHT
 * with drift absorbed by the largest stop), the transport arrangement and the
 * dispatch window are all the SAME functions the buyer's run uses, imported
 * from routes/consignments.js. `priceLotRun()` is reused wholesale — it is
 * pure geometry and fare keyed on listingId, which is exactly the shape a
 * collection run has too.
 *
 * ═══ ⚠️ F0 — RETIRED, REFUSED AT THE ROUTE ════════════════════════════════
 *
 * Farm→FPO is a 1–5 km hop a member covers themselves; it is not what the
 * problem statement's aggregation clause asks for (that clause is about
 * buyers aggregating volume, and its own demo routes a vehicle TO THE BUYER).
 * The frontend entry point (FpoDashboardScreen's "Collection" tab) is gone.
 *
 * ⚠️ UNLIKE THE PHONE-AUTH SCREENS, THIS ROUTE HAS NO INDEPENDENT SAFETY NET.
 * Firebase itself blocks a stray phone sign-in attempt even if a button leaked
 * onto a screen; nothing external stops a stray call here from creating a real
 * run with a real fare and real freight owed. So the refusal lives IN the
 * route, not just in the UI. Everything below this line — the exact route
 * solver, the by-weight fare split, custody transfer — stays untouched and
 * would work today if this were ever re-enabled for a premium case (export
 * grapes, a group with its own tempo): delete the block below, nothing else.
 */
router.post('/:id/collection-runs', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  return res.status(410).json({
    success: false,
    code: 'COLLECTION_RETIRED',
    error: 'Farm-to-FPO pickup runs are no longer offered. A member brings produce to the group\'s '
      + 'own collection point; the group then sells it on to a buyer, and that leg is arranged in the '
      + 'usual way.',
  });

  // eslint-disable-next-line no-unreachable
  try {
    const fpo = await loadAsAdmin(req.params.id, req.firebaseUid, res, 'arrange a collection');
    if (!fpo) return;

    // ── 1. the group must have somewhere to collect TO ────────────────────
    const drop = fpo.premises?.declared
      ? toLatLng({ lat: fpo.premises.lat, lng: fpo.premises.lng })
      : null;
    if (!drop)
      return res.status(400).json({
        success: false, code: 'NO_PREMISES',
        error: 'Set the group\'s collection point before arranging a collection.',
      });

    const listingIds = Array.isArray(req.body?.listingIds) ? req.body.listingIds : [];
    if (listingIds.length === 0)
      return res.status(400).json({
        success: false, code: 'NO_LISTINGS', error: 'Choose at least one lot to collect.',
      });
    if (listingIds.some((id) => !mongoose.isValidObjectId(id)))
      return res.status(400).json({ success: false, code: 'BAD_LISTING_ID', error: 'One of those lots is not valid.' });

    // ── 2. only this group's ACTIVE members' own stock ────────────────────
    // `status: 'active' || null` — rows written before the approval gate have
    // no status and .lean() applies no defaults. Recorded in CLAUDE.md.
    const memberUids = new Set(
      (fpo.members || [])
        .filter((m) => m.status === 'active' || m.status == null)
        .map((m) => m.farmerUid)
    );

    const listings = await CropListing.find({
      _id: { $in: listingIds }, status: 'available', quantityAvailableKg: { $gt: 0 },
    }).lean();

    const missing = listingIds.filter((id) => !listings.some((l) => String(l._id) === String(id)));
    if (missing.length)
      return res.status(409).json({
        success: false, code: 'LOT_UNAVAILABLE',
        error: 'One of those lots is no longer on the market.', listingIds: missing,
      });

    const outsiders = listings.filter((l) => !memberUids.has(l.farmerUid));
    if (outsiders.length)
      return res.status(403).json({
        success: false, code: 'NOT_A_MEMBER',
        error: 'A collection can only bring in produce belonging to this group\'s own members.',
        listingIds: outsiders.map((l) => String(l._id)),
      });

    // ── 3. ⚠️ THE ≤5 CAP IS OVER DISTINCT FARMERS, NOT LOTS ───────────────
    // A member holding two lots of different grades is still ONE gate the
    // vehicle stops at once. Counting lots would burn a stop the run never
    // makes, and would also mis-price the route. Recorded in CLAUDE.md as the
    // rule Phase D has to honour; it applies identically here.
    const farms = [...new Set(listings.map((l) => l.farmerUid))];
    if (farms.length > MAX_BUNDLE)
      return res.status(400).json({
        success: false, code: 'TOO_MANY_FARMS',
        error: `One vehicle serves at most ${MAX_BUNDLE} farms. Those lots span ${farms.length}.`,
        farms: farms.length, maxFarms: MAX_BUNDLE,
      });

    // ── 4. how much of each lot is coming in ──────────────────────────────
    const wanted = req.body?.quantities || {};
    const allocation = [];
    for (const l of listings) {
      const asked = Number(wanted[String(l._id)]);
      const qty = Number.isFinite(asked) && asked > 0 ? asked : l.quantityAvailableKg;
      if (qty > l.quantityAvailableKg)
        return res.status(400).json({
          success: false, code: 'NOT_ENOUGH_STOCK',
          error: `${l.cropName}: only ${l.quantityAvailableKg} kg is available.`,
          listingId: String(l._id),
        });
      if (!toLatLng(l.location))
        return res.status(400).json({
          success: false, code: 'LOT_UNPOSITIONED',
          error: `${l.cropName}: this lot has no pickup location, so a vehicle cannot be routed to it.`,
          listingId: String(l._id),
        });
      allocation.push({ listingId: String(l._id), quantityKg: qty });
    }

    const byListingId = new Map(listings.map((l) => [String(l._id), l]));

    // ── 5. price it with the buyer run's own engine ───────────────────────
    // `costSource` is derived from the MODE inside buildTransportArrangement,
    // never taken from the request body.
    //
    // 🐛 THIS USED TO PASS A STRING AS THE BODY. The signature is
    // `(body, uid)`, and I called it as `('own', { statedCost })` — so
    // `body.transportMode` read `undefined` and the mode silently defaulted to
    // 'hired' EVERY TIME. An FPO that owns a tempo could not use it: a captain
    // was dispatched regardless of what the officer picked, and the
    // stated-cost field on the collection screen was discarded without a word.
    // Caught by executing the function, not by re-reading the call.
    //
    // `fpoId` is supplied from the ROUTE PARAM, never from the body — the
    // group whose vehicle this is, is the group whose collection this is.
    const arrangement = await buildTransportArrangement(
      {
        transportMode: req.body?.transportMode || 'hired',
        fpoId: String(fpo._id),
        transport: {
          driverName: req.body?.driverName,
          driverPhone: req.body?.driverPhone,
          vehicleNumber: req.body?.vehicleNumber,
          cost: req.body?.statedCost,
        },
      },
      req.firebaseUid
    );
    if (arrangement.error)
      return res.status(arrangement.error.status || 400).json({ success: false, ...arrangement.error });

    const priced = await priceLotRun({
      allocation, byListingId, drop,
      vehicleType: req.body?.vehicleType,
      arrangement,
    });
    if (priced.error) return res.status(priced.error.status).json({ success: false, ...priced.error });

    const hired = priced.hired;
    const now = new Date();

    // ── 6. the run ────────────────────────────────────────────────────────
    const stops = priced.ordered.map((sPoint, i) => {
      const l = byListingId.get(sPoint.listingId);
      const row = allocation.find((a) => a.listingId === sPoint.listingId);
      return {
        // ⚠️ NO orderId. Nothing has been sold. The stop is addressed by its
        // own `_id`, which Mongoose mints — see findStop() in
        // routes/consignments.js.
        listingId: l._id,
        farmerUid: l.farmerUid,
        farmerName: l.farmerName,
        farmerPhone: l.farmerPhone,
        cropName: l.cropName,
        quantityKg: row.quantityKg,
        lat: sPoint.lat, lng: sPoint.lng,
        label: [l.location?.city, l.location?.district].filter(Boolean).join(', '),
        sequence: i,
        legKm: priced.route.legs?.[i]?.distanceKm ?? null,
        fareShare: priced.shareByListing.get(sPoint.listingId),
        // Frozen on PLANNED weight, exactly as a buyer run does: re-splitting
        // after a stop fails charges the members who did everything right more
        // for a third party's failure.
        fareShareBasisKg: row.quantityKg,
      };
    });

    const run = await Consignment.create({
      purpose: 'fpo_collection',
      fpoId: fpo._id,
      // No buyer exists. `vendorUid` is conditionally required and stays null,
      // which also keeps this run out of every buyer-scoped query for free.
      vendorUid: null,
      orderIds: [],
      stops,
      dropoff: {
        lat: drop.lat, lng: drop.lng,
        label: fpo.premises.label || fpo.name,
        district: fpo.premises.district || fpo.district || '',
      },
      vehicleType: priced.vehicleType,
      totalQuantityKg: priced.totalKg,
      distanceKm: priced.route.distanceKm,
      durationMin: priced.route.durationMin,
      routeSource: priced.route.source,
      routePolyline: priced.route.polyline,
      fare: priced.fare,
      transportMode: arrangement.mode,
      transport: arrangement.transport,
      // ⚠️ An own/contracted run is NEVER dispatched and MUST NOT set
      // `isActiveJob`: the partial unique index keys on `agentUid` where
      // isActiveJob is true, so two agentless runs would both key on null and
      // the second would fail with a duplicate key.
      status: hired ? 'awaiting_agent' : 'accepted',
      dispatchExpiresAt: hired ? dispatchExpiryFrom(now).expiresAt : null,
      acceptedAt: hired ? null : now,
      dropOtp: otp(),
    });

    res.status(201).json({
      success: true,
      run,
      collection: {
        farms: farms.length,
        lots: allocation.length,
        totalKg: priced.totalKg,
        // The saving is MEASURED against the same engine, or reported as
        // unavailable — never manufactured. It is null on a non-hired run
        // because comparing an FPO-stated cost against captain-priced solo
        // trips subtracts two different price bases (the H2 error).
        soloFareTotal: priced.soloFareTotal,
        saving: priced.soloFareTotal != null ? priced.soloFareTotal - priced.fare.total : null,
        dispatch: hired ? dispatchExpiryFrom(now) : null,
        note: hired
          ? null
          : 'This run uses the group\'s own transport, so no captain is dispatched and it starts ready to work.',
      },
    });
  } catch (err) {
    console.error('POST /fpos/:id/collection-runs', err);
    res.status(500).json({ success: false, error: 'Could not arrange that collection' });
  }
});

/**
 * POST /api/fpos/:id/intake — F1: A MEMBER BRINGS PRODUCE TO THE GODOWN.
 * body: { listingId, quantityKg, weightMethod, weightRef?,
 *         gradeObserved?, conditionChecked?, conditionFlags?, conditionNote? }
 *
 * ═══ WHAT THIS REPLACES ════════════════════════════════════════════════
 *
 * F0 retired farm→FPO transport: nothing in the problem statement's
 * aggregation clause asks for it, and a 1–5 km hop is a member's own
 * arrangement, not a routing problem. But produce still has to physically
 * arrive at the group's premises somehow — this is that "somehow": the member
 * walks in, the FPO's own person weighs and (optionally) grades it at the
 * counter, and custody moves. NO VEHICLE, NO ROUTE, NO FARE — which is why
 * `freightOwedPerKg` below is always 0, unconditionally.
 *
 * ⚠️ IT DOES NOT CREATE A NEW LISTING. It requires the member to already have
 * one (from the ordinary `POST /api/crops/:id/harvest-and-list` pipeline —
 * "posting reuses the existing flow, never a second form" is the same rule
 * `FarmerMarketScreen`'s harvest posting already follows). Intake is the FPO
 * confirming that a KNOWN, already-declared listing has now physically
 * arrived — not a second place a lot's identity could be invented.
 *
 * ⚠️ THE FPO'S OWN PERSON MAY GRADE HERE. `data/gateRecord.js`'s
 * GRADING_ROLES already includes 'fpo_admin' for exactly this reason: this is
 * the group's own person, handling this crop every season, whose name is on
 * the sale — not a hired captain from the public pool being asked to certify
 * something they are not qualified to judge.
 *
 * ⚠️ REUSES `moveListingToFpoCustody()` from routes/consignments.js — the
 * SAME custody transfer the run-based path used, so there are not two
 * definitions of what "this lot is now in the FPO's custody" means.
 */
router.post('/:id/intake', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const fpo = await loadAsAdmin(req.params.id, req.firebaseUid, res, 'record produce arriving at the godown');
    if (!fpo) return;

    // ── 1. the group must have somewhere to receive it ──────────────────
    if (!fpo.premises?.declared) {
      return res.status(400).json({
        success: false, code: 'NO_PREMISES',
        error: 'Set the group\'s collection point before recording produce arriving.',
      });
    }

    // ── 2. a real listing, belonging to an active member ────────────────
    const listing = await CropListing.findOne({
      _id: req.body?.listingId, status: 'available', quantityAvailableKg: { $gt: 0 },
    }).lean();
    if (!listing) {
      return res.status(409).json({
        success: false, code: 'LISTING_UNAVAILABLE',
        error: 'That listing is not available to bring in.',
      });
    }
    // Same "active-or-legacy-null status" rule as the (retired) collection
    // route and every other member check in this file — rows written before
    // the approval gate carry no status and .lean() applies no defaults.
    const memberUids = new Set(
      (fpo.members || []).filter((m) => m.status === 'active' || m.status == null).map((m) => m.farmerUid)
    );
    if (!memberUids.has(listing.farmerUid)) {
      return res.status(403).json({
        success: false, code: 'NOT_A_MEMBER',
        error: 'This produce does not belong to one of this group\'s own members.',
      });
    }

    // ── 3. how much actually walked in ───────────────────────────────────
    // ⚠️ Can be LESS than the listing's available quantity — a member who
    // said 500 kg and brought 480 is the honest, common case, the same
    // "short pickup" shape already used everywhere else in this app. It can
    // never be MORE: that would be inventing stock the listing never had.
    const arrivedKg = Number(req.body?.quantityKg);
    if (!Number.isFinite(arrivedKg) || arrivedKg <= 0) {
      return res.status(400).json({ success: false, code: 'BAD_QUANTITY', error: 'Enter how much arrived, in kg.' });
    }
    if (arrivedKg > listing.quantityAvailableKg) {
      return res.status(400).json({
        success: false, code: 'EXCEEDS_LISTING',
        error: `Only ${listing.quantityAvailableKg} kg is on this listing.`,
      });
    }

    // ── 4. how it was weighed — REQUIRED, same discipline as a pickup ────
    if (!POSTABLE_WEIGHT_METHODS.includes(req.body?.weightMethod)) {
      return res.status(400).json({
        success: false, code: 'WEIGHT_METHOD_REQUIRED',
        error: 'Say how this was weighed before recording it.',
      });
    }

    // ── 5. condition — optional, same parser as a gate outcome ───────────
    const cond = parseCondition(req.body);
    if (!cond.ok) {
      return res.status(400).json({
        success: false, code: 'BAD_CONDITION_FLAGS', error: 'Unknown condition flag.', unknown: cond.unknown,
      });
    }

    // ── 6. grade — the FPO's own person may observe one ──────────────────
    // `mayGradeAtGate('fpo_admin')` is always true; this route has no captain
    // to refuse it to. Still validated against the spec's own letters.
    const observedRaw = req.body?.gradeObserved;
    const observed = ['A', 'B', 'C'].includes(observedRaw) ? observedRaw : null;
    if (observedRaw && !observed) {
      return res.status(400).json({ success: false, code: 'BAD_GRADE', error: 'Grade must be A, B or C.' });
    }
    const declared = listing.grade?.code || null;
    const discrepancy = compareGrades(declared, observed);

    const now = new Date();
    const intake = {
      recordedAt: now,
      recordedBy: req.firebaseUid,
      weight: { method: req.body.weightMethod, ref: String(req.body.weightRef || '').slice(0, 60) },
      grade: { declared, observed, discrepancy, farmerResponse: null },
      condition: { checked: cond.checked, flags: cond.flags, note: String(req.body?.conditionNote || '').slice(0, 300) },
    };

    // ── 7. move it — NO FARE, NOTHING OWED, NO RUN TO POINT AT ──────────
    const result = await moveListingToFpoCustody(listing, fpo, {
      kg: arrivedKg, freightOwedPerKg: 0, collectionRunId: null, intake,
    });
    if (!result.ok) {
      return res.status(409).json({
        success: false, code: 'STOCK_MOVED', error: 'That listing changed while this was being recorded. Reload and try again.',
      });
    }

    res.json({
      success: true,
      receipt: {
        farmerName: listing.farmerName,
        cropName: listing.cropName,
        kg: arrivedKg,
        weight: describeWeight(intake.weight.method, intake.weight.ref, arrivedKg),
        grade: describeGradeCheck(intake.grade),
        condition: describeCondition(intake.condition),
        heldListingId: result.heldListingId,
        recordedAt: now,
      },
    });
  } catch (err) {
    console.error('POST /fpos/:id/intake', err);
    res.status(500).json({ success: false, error: 'Could not record that arrival' });
  }
});

/**
 * POST /api/fpos/lots/pay — SETTLE ONE LOT PURCHASE ACROSS ITS MEMBERS.
 * body: { consignmentId }   (the run a lot purchase created)
 *
 * ═══ WHY A LOT NEEDS ITS OWN PAY ACTION ═══════════════════════════════════
 *
 * A lot purchase is N Orders and ONE Consignment — one per contributing
 * farmer, because each member sets their own ₹/kg and each is owed their own
 * line (Phase D). The in-app rail (`POST /api/orders/:id/pay`) settles ONE
 * Order, so a buyer who bought "2,400 kg of Grade A onion" as a single act had
 * to pay four separate times and had no way to see whether the four together
 * reconciled to what they agreed. This fans out across the run's orders and
 * reports the reconciliation.
 *
 * ⚠️ IT REUSES THE PER-ORDER RAIL'S EXACT WRITE, INCLUDING ITS GUARD. Each
 * order is settled with a `findOneAndUpdate` carrying the expected state IN
 * THE FILTER, so two taps cannot double-settle and a partially-paid lot is
 * simply resumed. There is no second definition of what "paid" means.
 *
 * ⚠️ `settlement.txn.simulated: true` IS PERSISTED ON EVERY ONE. This rail
 * moves no money; without the flag a demonstration settlement is
 * indistinguishable from a real one in every query, every trust band and
 * every receipt.
 *
 * ⚠️ IT IS PARTIAL-TOLERANT BY DESIGN, NOT TRANSACTIONAL. If one order was
 * already settled (or is not collected yet) the rest still go through and the
 * response names each outcome. Refusing the whole lot because one line was
 * already paid would strand three farmers over somebody else's tap.
 */
router.post('/lots/pay', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const { consignmentId } = req.body || {};
    if (!mongoose.isValidObjectId(consignmentId))
      return res.status(400).json({ success: false, code: 'BAD_RUN', error: 'Which purchase?' });

    const run = await Consignment.findOne({ _id: consignmentId, vendorUid: req.firebaseUid })
      .select('orderIds lot vendorUid').lean();
    if (!run)
      return res.status(404).json({ success: false, code: 'NOT_YOUR_PURCHASE', error: 'That purchase was not found.' });

    const orders = await Order.find({ _id: { $in: run.orderIds || [] }, vendorUid: req.firebaseUid })
      .select('farmerUid farmerName cropName quantityKg cropTotal farmerPayout settlement status').lean();
    if (!orders.length)
      return res.status(404).json({ success: false, code: 'NO_ORDERS', error: 'That purchase has no orders.' });

    const now = new Date();
    const results = [];
    for (const o of orders) {
      const ref = `FM-PAY-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      // The SAME guarded write as routes/orders.js POST /:id/pay.
      const paid = await Order.findOneAndUpdate(
        {
          _id: o._id,
          vendorUid: req.firebaseUid,
          'settlement.farmerPaid': false,
          status: { $in: ['picked_up', 'delivered', 'stranded'] },
        },
        {
          $set: {
            'settlement.farmerPaid': true,
            'settlement.paidAt': now,
            'settlement.method': 'in_app',
            'settlement.txn': { ref, at: now, rail: PAY_RAIL, simulated: true, paidByUid: req.firebaseUid },
          },
        },
        { new: true }
      ).select('farmerUid farmerName farmerPayout settlement').lean();

      if (paid) {
        results.push({
          orderId: o._id, farmerUid: o.farmerUid, farmerName: o.farmerName,
          // ⚠️ THE FARMER RECEIVES `farmerPayout`, NEVER `grandTotal`. The
          // fare is the captain's money and was never the farmer's.
          amount: paid.farmerPayout, ref, outcome: 'paid',
        });
      } else {
        // Name the refusal per order. "Already settled" and "the crop has not
        // left the farm" call for different action from the buyer.
        results.push({
          orderId: o._id, farmerUid: o.farmerUid, farmerName: o.farmerName,
          amount: o.farmerPayout,
          outcome: o.settlement?.farmerPaid ? 'already_paid' : 'not_collected',
          ref: o.settlement?.txn?.ref || null,
          status: o.status,
        });
      }
    }

    // ── THE RECONCILIATION ────────────────────────────────────────────────
    // ⚠️ THROUGH computeSettlement(), NOT A SECOND COPY. That is the one
    // function /settlement and the dashboard's seasonSettlement already share;
    // a fee applied differently here would give a member two screens that
    // disagree with no way to tell which is right.
    let reconciliation = null;
    const fpoId = run.lot?.fpoId;
    if (fpoId) {
      const fpo = await Fpo.findById(fpoId).lean();
      if (fpo) {
        const activeMembers = (fpo.members || []).filter((m) => m.status === 'active' || m.status == null);
        const grades = fpo.paymentMode === 'procurement' ? await gradesForOrders(orders) : null;
        const settled = computeSettlement(fpo, activeMembers, orders, grades);

        // ⚠️ FIELD NAMES VERIFIED AGAINST computeSettlement()'s ACTUAL RETURN.
        // There is no `payouts` and no `facilitationFee` on it — the per-member
        // rows are `byLot[]` (each with `.amount`, already net of the fee),
        // the total payable is `memberPayableTotal`, and the buyer's gross is
        // `pooledCropValue`. Reading the names I first assumed would have
        // yielded `undefined`, summed to 0, and reported a lot as reconciling
        // perfectly while telling the buyer nothing was owed to anyone.
        const gross = settled.pooledCropValue;
        const toMembers = settled.memberPayableTotal;
        // ⚠️ NOT JUST THE FACILITATION FEE, SINCE PHASE 3's FREIGHT DEDUCTION:
        // memberPayableTotal is now also net of any collection freight a
        // member owes, so this residual is "everything the FPO keeps" —
        // fee (or procurement margin) PLUS freight recovered. That is still
        // exactly what `reconciliation.fee` is supposed to mean here: the gap
        // between what the sale grossed and what members are actually owed.
        const fee = Math.round((gross - toMembers) * 100) / 100;

        // The real invariant is that the PER-MEMBER rows add up to the total
        // payable — that is the split actually paid out, and it is where a
        // rounding drift would show. `toMembers + fee === gross` is true by
        // construction above and would assert nothing.
        const sumRows = (settled.byLot || []).reduce((a, r) => a + (r.amount || 0), 0);
        const drift = Math.round((sumRows - toMembers) * 100) / 100;

        reconciliation = {
          paymentMode: settled.paymentMode,
          gross,
          toMembers,
          fee,
          members: (settled.byLot || []).length,
          // Reported as a NUMBER as well as a boolean, so a drift surfaces as
          // a figure somebody can chase rather than hiding behind a flag.
          balances: Math.abs(drift) < 0.5 && Math.abs((toMembers + fee) - gross) < 0.5,
          drift,
          // A procurement lot with no agreed rate for a (crop, grade) is a
          // NAMED GAP, never a silent zero — those lots are excluded from the
          // totals and the buyer is told the settlement is incomplete.
          gaps: settled.procurement?.gaps || null,
          complete: settled.procurement ? settled.procurement.complete !== false : true,
        };
      }
    }

    const paidNow = results.filter((r) => r.outcome === 'paid');
    res.json({
      success: true,
      paid: {
        orders: paidNow.length,
        of: results.length,
        amount: Math.round(paidNow.reduce((a, r) => a + (r.amount || 0), 0)),
        at: now,
        method: 'in_app',
        simulated: true,
        note: 'Demonstration rail — no funds were transferred.',
      },
      results,
      reconciliation,
    });
  } catch (err) {
    console.error('POST /fpos/lots/pay', err);
    res.status(500).json({ success: false, error: 'Could not settle that purchase' });
  }
});

router.get('/:id/orders', requireAuth, async (req, res) => {
  try {
    const fpo = await Fpo.findById(req.params.id).lean();
    if (!fpo) return res.status(404).json({ success: false, error: 'Not found' });

    const uid = req.firebaseUid;
    const isAdmin = fpo.adminUid === uid;
    // ⚠️ `status: { $in: ['active', null] }`, never `status: 'active'`.
    // Member rows written before the approval gate existed have no `status`
    // at all and .lean() does not apply Mongoose defaults, so an equality
    // check would silently evict every founding member of every seeded group.
    // Already recorded in CLAUDE.md; repeated here because it is easy to
    // "tidy" away.
    const membership = (fpo.members || []).find(
      (m) => m.farmerUid === uid && (m.status === 'active' || m.status == null)
    );

    if (!isAdmin && !membership) {
      return res.status(403).json({
        success: false, code: 'NOT_YOUR_GROUP',
        error: 'Only this group\'s members and its admin can see its orders',
      });
    }

    const activeMembers = (fpo.members || []).filter(
      (m) => m.status === 'active' || m.status == null
    );
    const memberUids = activeMembers.map((m) => m.farmerUid);

    // An admin holding the group from OUTSIDE members[] is the normal shape
    // for an `fpo`-role account — an appointed officer is not a member-farmer
    // (recorded in CLAUDE.md). Such a group can legitimately have zero
    // members, and that is an FPO between seasons, not an error.
    const scope = isAdmin ? 'group' : 'own';
    const uids = isAdmin ? memberUids : [uid];

    if (uids.length === 0) {
      return res.json({
        success: true, scope, orders: [],
        meta: { total: 0, shown: 0, hasMore: false, members: 0,
          note: 'This group has no active members yet, so there is nothing to show.' },
        totals: null,
      });
    }

    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 60));
    const filter = { farmerUid: { $in: uids } };

    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .select('farmerUid farmerName cropName quantityKg pricePerKg cropTotal farmerPayout '
            + 'fare settlement status createdAt deliveredAt vendorName consignmentId dataSource')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const memberName = new Map(activeMembers.map((m) => [m.farmerUid, m.farmerName]));

    const rows = orders.map((o) => {
      const st = o.settlement || {};
      // ⚠️ THE ADVANCE IS COMPUTED, NOT READ. `settlement.advance.outstanding`
      // and `.amount` DO NOT EXIST as stored paths — verified against
      // Order.schema.path(). Reading them would yield `undefined`, which a
      // screen renders as "no advance agreed" — and that is precisely the
      // conflation the advance work exists to prevent: a promise the buyer
      // made and did not keep is the farmer's whole problem, and it must
      // never look identical to no promise at all.
      //
      // `exposureFor()` is the one place that arithmetic lives (it also
      // encodes the deliberately UN-CLAMPED negative balance, for the short
      // pickup where the farmer ends up holding the buyer's money). A second
      // copy here would be a second place for it to drift.
      const exposure = paymentExposure.exposureFor(o);
      return {
        _id: o._id,
        farmerUid: o.farmerUid,
        farmerName: o.farmerName || memberName.get(o.farmerUid) || 'Member',
        cropName: o.cropName,
        quantityKg: o.quantityKg,
        pricePerKg: o.pricePerKg ?? null,
        cropTotal: o.cropTotal ?? null,
        // ⚠️ THE GROSS, AS STORED. computeSettlement() reads farmerPayout AS
        // the gross and applies the facilitation fee itself — netting it here
        // would deduct the fee a second time downstream.
        farmerPayout: o.farmerPayout ?? null,
        status: o.status,
        orderedAt: o.createdAt,
        deliveredAt: o.deliveredAt || null,
        buyerName: o.vendorName || null,
        pooledRunId: o.consignmentId || null,
        payment: {
          // farmerPaid means FULLY settled — an advance recorded with no
          // balance is not paid. Never collapse the two into one boolean.
          paid: !!st.farmerPaid,
          paidAt: st.paidAt || null,
          method: st.method || null,
          txnRef: st.txn?.ref || null,
          // ⚠️ SURFACED, NEVER HIDDEN. The app's own rail moves no money; a
          // settlement recorded on it must stay distinguishable from a real
          // one in every view, which is the whole reason the flag is stored.
          simulated: st.txn?.simulated === true,
          advanceAgreed: exposure.advance.agreed,
          advanceReceived: exposure.advance.received,
          advanceReceivedAt: exposure.advance.receivedAt,
          // Agreed-but-absent is its own number, never folded into a boolean.
          advanceOutstanding: exposure.advance.outstanding,
          balanceDue: exposure.balanceDue,
          stage: exposure.stage,
        },
        // Demo stock is marked in the data; a screen that cannot tell it from
        // a real trade is how 75 seeded listings became indistinguishable
        // from 5 real ones.
        dataSource: o.dataSource || null,
      };
    });

    // Totals are over the PAGE and say so. Reporting a page figure as a whole
    // -result figure is exactly what made 1,159 lots read as 200.
    const delivered = rows.filter((r) => r.status === 'delivered');
    const paid = delivered.filter((r) => r.payment.paid);
    const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) || 0), 0);

    res.json({
      success: true,
      scope,
      orders: rows,
      totals: {
        basis: 'page',
        orders: rows.length,
        delivered: delivered.length,
        paid: paid.length,
        awaitingPayment: delivered.length - paid.length,
        deliveredValue: Math.round(sum(delivered, (r) => r.farmerPayout)),
        paidValue: Math.round(sum(paid, (r) => r.farmerPayout)),
        outstandingValue: Math.round(sum(delivered, (r) => r.farmerPayout) - sum(paid, (r) => r.farmerPayout)),
        simulatedPayments: paid.filter((r) => r.payment.simulated).length,
      },
      meta: {
        total,
        shown: rows.length,
        hasMore: total > rows.length,
        members: activeMembers.length,
        paymentMode: fpo.paymentMode || 'facilitation',
        note: scope === 'own'
          ? 'These are your own orders through this group. A member does not see another member\'s trade.'
          : null,
      },
    });
  } catch (err) {
    console.error('GET /fpos/:id/orders', err);
    res.status(500).json({ success: false, error: 'Could not load the group\'s orders' });
  }
});

router.get('/:id/settlement', requireAuth, async (req, res) => {
  try {
    const fpo = await Fpo.findById(req.params.id).lean();
    if (!fpo) return res.status(404).json({ success: false, error: 'Not found' });

    const isAdmin = fpo.adminUid === req.firebaseUid;
    const isMember = fpo.members.some((m) => m.farmerUid === req.firebaseUid && m.status === 'active');
    const ids = String(req.query.orderIds || '').split(',').filter(mongoose.isValidObjectId);
    if (!ids.length) return res.status(400).json({ success: false, error: 'orderIds are required' });

    const orders = await Order.find({ _id: { $in: ids } })
      .select('farmerUid farmerName cropName quantityKg cropTotal farmerPayout fare settlement status vendorUid listingId')
      .lean();
    if (!orders.length) return res.status(404).json({ success: false, error: 'No such orders' });

    // The group's admin, the buyer, and a member may all look; nobody else.
    const isBuyer = orders.every((o) => o.vendorUid === req.firebaseUid);
    if (!isAdmin && !isMember && !isBuyer)
      return res.status(403).json({ success: false, error: 'Not your group or your purchase' });

    // A pending applicant is not yet a supplying member of this group — their
    // orders (if any predate the application) do not count toward it either.
    const activeFpoMembers = fpo.members.filter((m) => m.status === 'active');
    const memberUids = new Set(activeFpoMembers.map((m) => m.farmerUid));
    const groupOrders = orders.filter((o) => memberUids.has(o.farmerUid));
    if (!groupOrders.length)
      return res.status(400).json({
        success: false, code: 'NOT_GROUP_ORDERS',
        error: 'None of those orders belong to members of this group',
      });

    // Grades are only looked up when they can actually change an answer — a
    // facilitation group never reads them.
    const grades = fpo.paymentMode === 'procurement' ? await gradesForOrders(groupOrders) : null;

    const full = computeSettlement(fpo, activeFpoMembers, groupOrders, grades);

    // ⚠️ F2 — AN ORDINARY MEMBER SEES ONLY THEIR OWN ROW, NEVER THE WHOLE
    // GROUP'S. `computeSettlement()`'s `byLot` carries EVERY active member of
    // the FPO by name and figure, whether or not they had anything to do with
    // these particular orders — it was built for the admin's and the buyer's
    // view, both of whom are legitimately entitled to see how a purchase
    // split across every contributing seller. A member is not: "A member is
    // not entitled to another member's payout, price or payment record just
    // by belonging to the same company" is the rule this app already states
    // for GET /:id/orders, and this endpoint was quietly not following it —
    // any member who could supply a valid orderIds string got everyone's
    // name and amount back, not just their own.
    const settlement = (isAdmin || isBuyer)
      ? full
      : {
        ...full,
        byLot: (full.byLot || []).filter((r) => r.farmerUid === req.firebaseUid),
        byShare: (full.byShare || null) && full.byShare.filter((r) => r.farmerUid === req.firebaseUid),
        difference: (full.difference || null) && full.difference.filter((r) => r.farmerUid === req.firebaseUid),
        // The group's own procurement gaps still name the crop and quantity
        // but never another member's identity.
        procurement: full.procurement ? {
          ...full.procurement,
          gaps: (full.procurement.gaps || []).filter((g) => g.farmerUid === req.firebaseUid),
        } : null,
        scope: 'own',
      };

    res.json({
      success: true,
      settlement: {
        fpoId: fpo._id, fpoName: fpo.name,
        ...settlement,
      },
    });
  } catch (err) {
    console.error('❌ FPO settlement error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/fpos/:id/my-settlement — F2: WHAT I AM OWED, WITHOUT NEEDING TO
 * ALREADY KNOW WHICH orderIds TO ASK FOR.
 *
 * ═══ THE PROBLEM THIS ANSWERS ═════════════════════════════════════════════
 *
 * `computeSettlement()` has existed since Phase B and `GET /:id/settlement`
 * exposes it — but that route REQUIRES `orderIds` as a query parameter, which
 * a member opening "what am I owed" has no way to already know. It was built
 * for a specific purchase's reconciliation (a buyer or the admin already
 * holding a batch's order ids), not for "show me my own history." This route
 * resolves that batch FOR the member, from their own trade record alone.
 *
 * ═══ ⚠️ NOT EVERY SALE A MEMBER MAKES IS FPO-FACILITATED ══════════════════
 *
 * Measured against live Atlas: of 13,309 delivered orders belonging to active
 * FPO members, only 24 carry a `consignmentId` (a pooled lot sale) — the rest
 * are farmers selling their OWN listings independently, which happen to
 * belong to someone who is also, separately, a member of a group. The group
 * had no part in those trades, and reporting a facilitation fee on them would
 * be charging for a service that was never rendered.
 *
 * Two independent, real signals of actual facilitation, either is enough:
 *   • `order.consignmentId` set        — a pooled lot sale (Phase D)
 *   • the SOLD LISTING was ever HELD by this FPO (F1 walk-in intake) —
 *     `CropListing.custody.heldAt === 'fpo'` on `order.listingId`. A listing
 *     the FPO weighed, graded and held can be sold on as a perfectly normal
 *     single-farmer order with no Consignment at all, and that is STILL a
 *     facilitated sale — `consignmentId` alone would miss it.
 * Everything else is excluded, honestly, with a note saying why.
 *
 * ═══ ⚠️ THE FEE MATH RUNS ON THE WHOLE BATCH, NEVER A LONE MEMBER'S SLICE ══
 *
 * A pooled batch's percentage or per-kg fee is apportioned via `apportion()`,
 * which rounds the group TOTAL first and then splits it — NOT the same
 * arithmetic as rounding each member's own share alone (double-rounding can
 * differ by a rupee). So this fetches every order in the batch, runs the
 * SAME `computeSettlement()` the admin's dashboard uses, and only THEN
 * extracts this member's own row — guaranteeing the number a member sees can
 * never disagree with what the group's own official total says. Never a
 * second, cheaper computation over a partial order set.
 */
router.get('/:id/my-settlement', requireAuth, async (req, res) => {
  try {
    const fpo = await Fpo.findById(req.params.id).lean();
    if (!fpo) return res.status(404).json({ success: false, error: 'Not found' });

    const uid = req.firebaseUid;
    // Same "active-or-legacy-null status" rule as every other member check in
    // this file — rows written before the approval gate carry no status.
    const isMember = fpo.members.some(
      (m) => m.farmerUid === uid && (m.status === 'active' || m.status == null)
    );
    if (!isMember) {
      return res.status(403).json({
        success: false, code: 'NOT_A_MEMBER', error: 'You are not an active member of this group.',
      });
    }

    const myOrders = await Order.find({
      farmerUid: uid, status: { $in: ['delivered', 'stranded'] },
    }).select('farmerUid farmerName cropName quantityKg cropTotal farmerPayout fare settlement '
             + 'listingId consignmentId deliveredAt status')
      .sort({ deliveredAt: -1 })
      .lean();

    if (!myOrders.length) {
      return res.json({
        success: true, settlements: [], note: 'You have no delivered sales through this group yet.',
      });
    }

    const listingIds = myOrders.map((o) => o.listingId).filter(Boolean);
    const heldListingIds = new Set(
      (await CropListing.find({ _id: { $in: listingIds }, 'custody.heldAt': 'fpo' })
        .select('_id').lean())
        .map((l) => String(l._id))
    );
    const facilitated = myOrders.filter(
      (o) => o.consignmentId || heldListingIds.has(String(o.listingId))
    );

    if (!facilitated.length) {
      return res.json({
        success: true, settlements: [],
        note: 'Nothing you have sold has gone through this group\'s own facilitation yet. An '
          + 'independent sale through your own listing carries no group fee, because the group had '
          + 'no part in it.',
      });
    }

    // A pooled sale's batch is every order under that Consignment. A
    // walk-in-intake sale with no Consignment is its own batch of one.
    const batchKeyOf = (o) => (o.consignmentId ? String(o.consignmentId) : String(o._id));
    const batchKeys = [...new Set(facilitated.map(batchKeyOf))];
    const activeFpoMembers = fpo.members.filter((m) => m.status === 'active' || m.status == null);

    const settlements = [];
    for (const key of batchKeys) {
      const anchor = facilitated.find((o) => batchKeyOf(o) === key);
      const batchOrders = anchor.consignmentId
        ? await Order.find({ consignmentId: anchor.consignmentId })
            .select('farmerUid farmerName cropName quantityKg cropTotal farmerPayout fare settlement listingId')
            .lean()
        : [anchor];

      const grades = fpo.paymentMode === 'procurement' ? await gradesForOrders(batchOrders) : null;
      const full = computeSettlement(fpo, activeFpoMembers, batchOrders, grades);
      const mineRow = (full.byLot || []).find((r) => r.farmerUid === uid);
      if (!mineRow) continue;   // cannot happen — this member had an order in this exact batch

      const myBatchOrders = batchOrders.filter((o) => o.farmerUid === uid);
      const crops = [...new Set(myBatchOrders.map((o) => o.cropName))];
      const paidOrders = myBatchOrders.filter((o) => o.settlement?.farmerPaid);
      const latestPaid = paidOrders.sort((a, b) => new Date(b.settlement.paidAt) - new Date(a.settlement.paidAt))[0];

      settlements.push({
        batchId: key,
        type: anchor.consignmentId ? 'pooled' : 'fpo_held',
        paymentMode: full.paymentMode,
        cropName: crops.join(' + '),
        deliveredAt: myBatchOrders.reduce((max, o) => (o.deliveredAt > max ? o.deliveredAt : max), myBatchOrders[0]?.deliveredAt),
        ...mineRow,
        paidAt: latestPaid?.settlement?.paidAt || null,
        method: latestPaid?.settlement?.method || null,
        txnRef: latestPaid?.settlement?.txn?.ref || null,
        simulated: latestPaid?.settlement?.txn?.simulated === true,
        // Names ONLY whether THIS member's own lot was one of the unpriced
        // ones — never another member's crop, grade or quantity.
        gap: full.procurement?.gaps?.find((g) => g.farmerUid === uid) || null,
      });
    }

    // Newest first — a member opening this screen wants to know about their
    // most recent sale, not one from months ago.
    settlements.sort((a, b) => new Date(b.deliveredAt) - new Date(a.deliveredAt));

    res.json({ success: true, settlements, note: null });
  } catch (err) {
    console.error('GET /fpos/:id/my-settlement', err);
    res.status(500).json({ success: false, error: 'Could not load your settlement' });
  }
});

/** GET /api/fpos/nearby — groups a farmer could join, by district. */
router.get('/nearby', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const district = req.query.district || req.profile.location?.district;
    if (!district) return res.json({ success: true, fpos: [], reason: 'NO_DISTRICT' });

    const fpos = await Fpo.find({ district, status: 'active' })
      .select('name district village memberCount members adminName createdAt focusCrops')
      .limit(20).lean();

    // THE POINT OF SHOWING THIS BEFORE THEY ASK. A farmer who can see that the
    // Niphad group deals in onion and the Sangli one in grapes picks the right
    // group first time, instead of waiting a week to be turned down for a
    // reason nobody wrote down. Their own crops are read ONCE and matched
    // against every group in the list.
    const myCrops = await farmerCropNames({ Crop, CropListing }, req.firebaseUid);

    res.json({
      success: true,
      fpos: fpos.map((f) => ({
        _id: f._id, name: f.name, district: f.district, village: f.village,
        adminName: f.adminName,
        // A pending applicant is not yet counted as a member of the group.
        memberCount: f.members.filter((m) => m.status === 'active').length,
        focusCrops: f.focusCrops || [],
        // Advisory, and the response says so on every row. A group whose crops
        // do not match is still listed, still joinable, and is NOT sorted to
        // the bottom — the farmer is being informed, not filtered.
        cropMatch: matchFarmerToFocus(f.focusCrops || [], myCrops),
        // Never publish the member list to non-members.
        members: undefined,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/fpos/bundles?commodity=Onion&lat=&lng=
 *
 * A CATALOG OF REAL, SELLABLE, GRADE-SEPARATED LOTS — not a savings calculator.
 *
 * WHAT CHANGED IN PHASE C AND WHY
 *   This route used to return ONE entry per (FPO, crop): every member's onion
 *   in a single bundle with a single price, whatever grade anybody had declared.
 *   A buyer paying for Grade A would have been sent a blend of A, B and C — and
 *   the app's own procurement table already refuses exactly that ("a blended
 *   per-crop rate erases the only thing grading is for", models/Fpo.js). So the
 *   unit of the response is now the LOT: one entry per (FPO, crop, GRADE), and
 *   ungraded produce gets its own clearly-labelled bucket rather than being
 *   dropped or given a grade nobody declared. See services/lotCatalogService.js
 *   for the grading, pricing-spread and minimum-order rules; this route adds the
 *   vehicle constraint and the collection cost on top of them.
 *
 * WHAT SURVIVED, DELIBERATELY
 *   The pooled-vs-separate collection comparison is the differentiator, and it
 *   is now computed PER LOT with the same F1 machinery — the same multi-stop
 *   route, the same exact stop ordering, the same fare table — so it still
 *   cannot drift from what a buyer is actually charged when they pool.
 *
 * A LOT CAN BE BIGGER THAN A VEHICLE, and each lot says so for itself. One run
 * serves at most MAX_BUNDLE farms, so selectBundleLots() (Phase A, reused
 * unchanged) runs once PER LOT — each (crop, grade) lot has its own contributing
 * members and therefore its own tightest cluster — and every lot keeps its own
 * `membersIncluded` / `membersAvailable` / `truncated` / `excludedLots`.
 *
 * ⚠️ THE SAME FARMER CAN BE IN TWO LOTS. Two lots' fares are NOT additive and
 * their stop counts are NOT additive. See the block comment on describeLot() in
 * services/lotCatalogService.js; `collection.crossLotNote` repeats it in the
 * response so a caller cannot miss it.
 *
 * A SINGLE-CONTRIBUTOR LOT IS STILL RETURNED. The old rule "one lot is not a
 * bundle — that is just a listing" still gates the GROUP (an FPO with one live
 * listing is not offered as a bundle), but it must NOT be applied per grade: in
 * this database most listings are ungraded and only a handful carry a code, so
 * dropping single-contributor grade lots would hide precisely the graded produce
 * a buyer came for. Such a lot is returned with `collection.pooled === false`
 * and a saving of exactly 0 — one stop is one trip, and pretending otherwise
 * would be a saving that does not exist.
 */
/**
 * GET /api/fpos/crops — the crop names a buyer can search bundles for.
 *
 * REPORTED DIRECTLY alongside the /bundles matching bug: a free-text search
 * box with no list behind it means a buyer has to guess the exact stored
 * name, and eight of the 64 canonical crops carry a variety/local-name suffix
 * ("Mango (Alphonso/Hapus)") nobody would type unprompted. This is the SAME
 * 64-name list `services/focusCropService.js` already uses for an FPO's own
 * focus-crop declaration — one canonical list, not a second copy that could
 * drift from it.
 */
router.get('/crops', requireAuth, (req, res) => {
  res.json({ success: true, crops: FOCUS_CROP_NAMES });
});

router.get('/bundles', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const { commodity } = req.query;
    const drop = toLatLng({ lat: Number(req.query.lat), lng: Number(req.query.lng) });
    if (!commodity) return res.status(400).json({ success: false, error: 'commodity is required' });
    if (!drop) return res.status(400).json({ success: false, error: 'lat and lng are required' });

    // 🐛 REPORTED DIRECTLY — "search a crop, only onion ever shows". The match
    // below used to be an EXACT full-string regex against the typed text, and
    // eight of this app's 64 canonical crop names carry a variety/local-name
    // suffix a buyer would never think to type — the stored listing is
    // "Mango (Alphonso/Hapus)", "Jowar (Sorghum)", "Orange (Nagpur Santra)",
    // "Okra (Bhendi)"; typing the plain crop name matched nothing. Onion has
    // no suffix, so it was the only search that worked by accident.
    // `canonicalCropName()` is the SAME head-matching resolver focus crops and
    // join-matching already use, and it already carries "Mango" as an alias of
    // "Mango (Alphonso/Hapus)" — reused here rather than re-deriving a second
    // crop-name resolver that could disagree with the first.
    const commodityCanonical = canonicalCropName(commodity) || commodity;

    const fpos = await Fpo.find({ status: 'active' }).lean();
    const catalog = [];
    // Lots whose COLLECTION COST genuinely cannot be priced — every contributor
    // missing a pickup point, no vehicle in the fare table big enough, or no
    // measurable route. They are returned in their own array rather than mixed
    // into `bundles`, for one narrow reason worth writing down: every figure
    // they would carry is null (unknown, not zero — a null fare must never
    // render as ₹0 or as a free trip), and Vendor/BundlesScreen.jsx calls
    // `item.vehicleType.toUpperCase()` on every row it is given. Phase C is
    // backend-only, so a shape that crashes the screen is not an option — and
    // nor is inventing a vehicle. Before Phase C these lots took the WHOLE
    // group off the buyer's screen with a bare `continue` and no explanation;
    // now they are named, with their contributors and a reason.
    const unpriceable = [];

    // One trust lookup per FARMER per request, reused across every lot they
    // contribute to. A farmer holding Grade A and Grade B onion appears in two
    // lots and must not be queried twice — and both lots must show the same
    // record, which sharing the map guarantees.
    const trustByUid = new Map();
    const loadTrust = async (uids) => {
      const missing = [...new Set(uids)].filter((u) => !trustByUid.has(u));
      const rows = await Promise.all(missing.map(async (u) => [u, await trustService.forFarmer(u)]));
      for (const [u, t] of rows) trustByUid.set(u, t);
    };

    for (const f of fpos) {
      // A pending applicant is not yet supplying anything for this group.
      const uids = f.members.filter((m) => m.status === 'active').map((m) => m.farmerUid);
      const listings = await CropListing.find({
        farmerUid: { $in: uids }, status: 'available',
        cropName: new RegExp(`^${commodityCanonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      })
        // A stable read order, so nothing downstream can depend on Mongo's
        // natural order the way the old slice() did.
        .sort({ _id: 1 })
        .select('cropName quantityAvailableKg pricePerKg minOrderKg farmerUid farmerName location grade')
        .lean();

      // One listing is not a bundle — that is just a listing, and the market
      // already shows it. This is a GROUP-level gate on purpose; see the
      // single-contributor note in this route's header for why it is not
      // applied per grade.
      if (listings.length < 2) continue;

      await loadTrust(listings.map((l) => l.farmerUid));

      const groupLots = [];
      for (const bucket of lotCatalog.groupByCropGrade(listings)) {
        // A lot with no pickup point cannot be routed to. It used to sink the
        // WHOLE bundle silently — one member with a missing coordinate and the
        // other eleven vanished from the buyer's screen with no explanation.
        // Now it is named and the rest of the group still trades.
        const plottable = [], unplottable = [];
        for (const l of bucket.listings) (toLatLng(l.location) ? plottable : unplottable).push(l);

        // Phase A's selection, per lot — NOT reimplemented. Each (crop, grade)
        // lot has its own contributing members, so each gets its own tightest
        // ≤MAX_BUNDLE cluster and its own honest account of who was left out.
        const { chosen, excluded } = plottable.length
          ? selectBundleLots(plottable, drop, MAX_BUNDLE)
          : { chosen: [], excluded: [] };
        const usable = chosen.map((p) => p.lot);
        const points = chosen.map((p) => ({ lat: p.lat, lng: p.lng }));

        const excludedLots = [
          ...excluded.map((l) => excludedLot(l, EXCLUSION_REASONS.BEYOND_MAX_BUNDLE)),
          ...unplottable.map((l) => excludedLot(l, EXCLUSION_REASONS.NO_PICKUP_LOCATION)),
        ];

        // Stock, grade, price spread and minimum order — the shared arithmetic
        // the admin dashboard runs on the same listings. `included` is what
        // rides the vehicle; `available` is what the group actually holds.
        const lot = lotCatalog.describeLot({
          cropName: bucket.cropName, cropKey: bucket.cropKey, gradeKey: bucket.gradeKey,
          included: usable, available: bucket.listings,
        }, { trustByUid });

        // ── collection cost, PER LOT ────────────────────────────────────────
        let collection;
        if (!usable.length) {
          collection = unpriceableCollection('no_pickup_location',
            'No contributing lot here has a pickup point on file, so no vehicle can be priced to '
            + 'collect it. The stock is real — see totalKgAvailable — and the listings are named in '
            + 'excludedLots.');
        } else {
          // Routed in the OPTIMAL visiting order, not the order they came out
          // of Mongo — so the distance quoted is the distance a consignment
          // built from these lots would actually drive, and the same request
          // twice returns the same number.
          const route = await getMultiStopRoute([...points, drop]);
          const vehicle = route && ['auto', 'tempo', 'truck']
            .map((v) => quote(v, route.distanceKm, lot.totalKg))
            .find((q) => q.ok);

          if (!route || !vehicle) {
            // Previously a `continue` — the whole group vanished from the
            // buyer's screen when no vehicle could carry the load. Say it.
            collection = unpriceableCollection(
              route ? 'no_vehicle_fits' : 'no_route',
              route
                ? `No vehicle in the fare table can carry ${lot.totalKg} kg in one run.`
                : 'A route to this destination could not be measured.');
          } else {
            // Separate trips, priced the same way, so the comparison is like
            // for like. With one contributor this is the SAME trip as the
            // pooled run, which is why the saving comes out at exactly 0.
            let soloTotal = 0;
            for (let i = 0; i < usable.length; i++) {
              const r = await getMultiStopRoute([points[i], drop]);
              const q = r && ['auto', 'tempo', 'truck']
                .map((v) => quote(v, r.distanceKm, usable[i].quantityAvailableKg))
                .find((x) => x.ok);
              if (q) soloTotal += q.fare.total;
            }
            collection = {
              priceable: true,
              // False when there is only one farm in this lot: nothing is being
              // pooled, so no saving is claimed.
              pooled: usable.length > 1,
              reason: usable.length > 1 ? null : 'single_contributor',
              distanceKm: route.distanceKm,
              vehicleType: vehicle.type,
              bundledFare: vehicle.fare.total,
              separateFare: soloTotal,
              // Can be negative when the members' farms are scattered —
              // reported, not clamped, exactly as the consignment quote does.
              saving: soloTotal - vehicle.fare.total,
              savingPct: soloTotal > 0
                ? Math.round(((soloTotal - vehicle.fare.total) / soloTotal) * 100) : 0,
              worthIt: vehicle.fare.total < soloTotal,
              // Transport as a share of what the crop is worth — the figure
              // that makes the case, and the one the build plan leads with.
              transportPctBundled: lot.cropValue > 0
                ? Math.round((vehicle.fare.total / lot.cropValue) * 1000) / 10 : null,
              transportPctSeparate: lot.cropValue > 0
                ? Math.round((soloTotal / lot.cropValue) * 1000) / 10 : null,
              note: usable.length > 1
                ? `One ${vehicle.type} collecting ${usable.length} farms against ${usable.length} separate trips, `
                  + 'priced with the same route engine and fare table a real consignment uses.'
                : 'Only one farm contributes to this lot, so there is nothing to pool: the "bundled" and '
                  + '"separate" figures are the same single trip and the saving is 0.',
              crossLotNote: CROSS_LOT_NOTE,
            };
          }
        }

        const runLabel = lot.ungraded ? 'ungraded' : lot.grade.label;
        groupLots.push({
          fpoId: f._id, fpoName: f.name,
          district: f.district, village: f.village,
          ...lot,
          // Namespaced by FPO so a lot is identifiable across the whole
          // response — Phase D will need to name one exactly.
          lotKey: `${f._id}::${lot.lotKey}`,

          // ── WHAT IS IN THIS RUN, AND WHAT IS NOT ─────────────────────────
          // Every figure computed from `lotsIncluded` lots only, per lot.
          // lotsIncluded + excludedLots accounts for every eligible listing in
          // this (crop, grade) bucket — nothing vanishes.
          maxBundle: MAX_BUNDLE,
          truncated: excludedLots.length > 0,
          // The rule by which these were chosen; see selectBundleLots().
          selectionRule: 'tightest_cluster',
          excludedLots,
          // "lots" here means the CONTRIBUTING members' listings, which is what
          // the word meant before Phase C; the aggregate they form is this lot.
          // `runLabel` names the grade so an admin reading two notes from one
          // group can tell which run each describes.
          selectionNote: excludedLots.length
            ? `${lot.lotsIncluded} of ${lot.lotsAvailable} lots `
              + `(${lot.membersIncluded} of ${lot.membersAvailable} members) are in this ${runLabel} run. `
              + `One vehicle serves at most ${MAX_BUNDLE} farms — beyond that the last farmer waits too long. `
              + 'The farms chosen are the ones that make the shortest pickup route, because a scattered run '
              + 'costs more than it saves. Everything left out is listed in excludedLots, still on the market, '
              + 'and can go as a second run.'
            : `All ${lot.lotsAvailable} of this group's ${runLabel} lots are in this run.`,

          collection,
          // ── flattened for the existing buyer screen ──────────────────────
          // Vendor/BundlesScreen.jsx reads these names off the top level and
          // Phase C is backend-only, so they stay where that screen looks.
          // They are the SAME numbers as `collection` above, spread from it —
          // there is no second computation that could disagree.
          distanceKm: collection.distanceKm,
          vehicleType: collection.vehicleType,
          bundledFare: collection.bundledFare,
          separateFare: collection.separateFare,
          saving: collection.saving,
          savingPct: collection.savingPct,
          worthIt: collection.worthIt,
          transportPctBundled: collection.transportPctBundled,
          transportPctSeparate: collection.transportPctSeparate,
        });
      }

      // Who appears in more than one of THIS group's lots, and where. The
      // identity Phase D needs to count one farm as one pickup stop. Run over
      // ALL of the group's lots, including any that could not be priced, so the
      // links are complete.
      lotCatalog.linkSharedFarmers(groupLots);
      for (const l of groupLots) (l.collection.priceable ? catalog : unpriceable).push(l);
    }

    // Best saving first, as before. A lot whose collection could not be priced
    // has a null saving and sorts last rather than being read as zero; ties
    // fall back to a stable, declared order (A, B, C, then ungraded) so two
    // identical requests return the same catalog in the same order.
    catalog.sort((a, b) =>
      (b.saving ?? -Infinity) - (a.saving ?? -Infinity)
      || String(a.fpoName).localeCompare(String(b.fpoName))
      || lotCatalog.gradeRank(a.gradeKey) - lotCatalog.gradeRank(b.gradeKey)
      || String(a.lotKey).localeCompare(String(b.lotKey)));

    unpriceable.sort((a, b) =>
      String(a.fpoName).localeCompare(String(b.fpoName))
      || lotCatalog.gradeRank(a.gradeKey) - lotCatalog.gradeRank(b.gradeKey)
      || String(a.lotKey).localeCompare(String(b.lotKey)));

    res.json({
      success: true,
      // The CANONICAL name actually searched, not necessarily what was typed
      // — "Mango" resolves to "Mango (Alphonso/Hapus)", and a caller reading
      // this back sees what was really matched rather than its own echo.
      commodity: commodityCanonical,
      commodityRequested: commodity,
      gradeSeparated: true,
      // `bundles` is the response key the buyer screen already reads, so it
      // keeps the name. What changed is what one entry MEANS: it is now one
      // (FPO, crop, grade) lot, not a whole group's crop.
      bundles: catalog,
      // Real stock that exists and cannot be collected — see the comment where
      // this array is declared. Every entry carries its contributors, its
      // excludedLots and `collection.reason`.
      unpriceableLots: unpriceable,
      catalogNote: 'Each entry is ONE lot: one group, one crop, one grade. Grades are never blended — a '
        + 'buyer paying for Grade A does not receive a mix of A, B and C. Produce nobody graded is its own '
        + `lot marked ungraded ("grade not declared"), which is NOT a grade below C. Every declared grade `
        + 'is the farmer\'s own claim against the published criteria; nobody has inspected any lot. Within '
        + 'one lot members ask different prices — see price.spreadPerKg and contributors[].pricePerKg, '
        + 'which is what an order must actually pay. Lots whose collection cost cannot be measured at '
        + 'all are in unpriceableLots, with the reason, rather than being dropped.',
    });
  } catch (err) {
    console.error('❌ FPO bundles error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  F2 PHASE D — SELLING A LOT. QUOTE, THEN CONFIRM.
// ═══════════════════════════════════════════════════════════════════════════
//
// Phase C made a group's produce into a CATALOG of (crop, grade) lots. Nobody
// could buy one. These two routes are the sale:
//
//   POST /api/fpos/lots/quote    who would supply what, at whose price, and
//                                what it costs — writing nothing, holding
//                                nothing.
//   POST /api/fpos/lots/confirm  takes the stock and writes one Order per
//                                contributing farmer plus one Consignment for
//                                the shared run.
//
// ── WHY IT IS TWO STEPS AND NOT ONE ───────────────────────────────────────
// Inside one lot the members ask DIFFERENT prices (Phase C reports the spread
// rather than averaging it away, and CLAUDE.md records why: multiplying the
// indicative price by a quantity underpays every member asking above the
// weighted average). Each member is paid their OWN asking price. So the buyer's
// true total cannot be known until it is known WHICH members the order draws
// from — and that depends on the quantity, on each member's own minimum, and on
// which farms the vehicle can reach. The allocation has to exist before the
// price does. That is the whole reason for a quote.
//
// ⚠️ A QUOTE IS NOT A RESERVATION, AND THE RESPONSE SAYS SO IN WORDS.
// It writes nothing and holds nothing. This is the same rule an Offer already
// follows — "An offer holds NO stock. Reserving inventory when someone merely
// asks would let one vendor freeze a farmer's whole listing with speculative
// bids." A quoted lot stays on the market and can be sold out from under the
// quote by anyone, including a straight single-farmer purchase.
//
// ── THE CONFIRM NEVER TRUSTS THE CLIENT'S ALLOCATION ──────────────────────
// The allocation, every price and every payout are re-derived from the database
// at confirm time. A client-supplied `allocation` array is IGNORED, and the
// response names it as ignored. This is not defensive decoration: an allocation
// posted by the buyer is the buyer naming their own suppliers, their own
// quantities and their own ₹/kg. CLAUDE.md's rule — "Never trust client
// identity ... take name/phone/location from req.profile, not from the request
// body" — is the same rule, and money-affecting facts are the case it matters
// most for.
//
// What the client DOES send back is `quoteRef`: an opaque digest the server
// computed over ITS OWN quote. The server recomputes it from its own fresh
// derivation and refuses on any mismatch (409 QUOTE_STALE). It is an If-Match
// header, not data — a client cannot push a price through a hash, and the worst
// a forged one can do is get itself refused. The digest covers the CROP side
// only (who supplies what, at what price, and what each is owed under this
// group's payment mode); transport is re-measured and re-quoted at confirm,
// because a route measured twice can differ by metres and a buyer should not be
// bounced for that.
//
// ── SCOPE, DELIBERATELY NARROW ────────────────────────────────────────────
//   • ONE LOT PER ORDER. Phase C's warning is real and unsolved: a farmer
//     holding Grade A and Grade B of the same crop appears in TWO lots, and a
//     vehicle taking both stops at that farm ONCE — so a multi-lot purchase
//     must count the ≤5 cap over distinct farmerUid across the whole basket and
//     re-price the combined run rather than adding two lots' fares. Building
//     that badly produces a wrong invoice rather than an error anyone notices,
//     so it is not built here. `singleLotOnly` and `crossLotNote` say so on
//     every response, and the identity needed to do it later
//     (`contributors[].farmerUid`, `farmersAlsoInOtherLots`) is already carried.
//   • NO MULTI-RUN SPLITTING. A request bigger than ≤5 farms can fill in one
//     vehicle is REFUSED with the true maximum, never silently trimmed.
//   • NO FPO-ADMIN APPROVAL GATE. A listing is already an offer to sell in the
//     single-farmer flow; requiring a group officer to counter-sign what its
//     members have already published would be a middleman put back exactly
//     where models/Fpo.js says this app is trying to remove one.
//
// ── AND THE ORDER RECORDS THE SALE, NOT THE NET ───────────────────────────
// Each Order is written with `farmerPayout = cropTotal` — the GROSS, byte for
// byte what POST /api/orders does — because computeSettlement() reads that
// field as the gross and applies the FPO's fee or agreed rate itself. Writing a
// net figure here would make /settlement deduct the fee a second time. The
// payment mode is APPLIED in the response by calling computeSettlement() on the
// allocation, so the figure a buyer is shown at confirm and the figure a member
// later reads on /settlement come from one function and cannot disagree.

/** The biggest load any vehicle in the fare table can carry in one run. */
const RUN_CAPACITY_KG = Math.max(...VEHICLE_ORDER.map((v) => VEHICLES[v].capacityKg));

/** `<fpoId>::<cropKey>::<gradeKey>`, the key Phase C stamps on every lot. */
function parseLotKey(lotKey) {
  const parts = String(lotKey || '').split('::');
  if (parts.length < 3) return null;
  const fpoId = parts[0];
  const gradeKey = parts[parts.length - 1];
  // Joined back rather than taken as parts[1], so a crop name containing the
  // separator cannot silently resolve to a different lot.
  const cropKey = parts.slice(1, -1).join('::');
  if (!mongoose.isValidObjectId(fpoId) || !cropKey) return null;
  if (gradeKey !== lotCatalog.UNGRADED && !lotCatalog.GRADE_ORDER.includes(gradeKey)) return null;
  return { fpoId, cropKey, gradeKey };
}

/** A lot named either by Phase C's lotKey, or by (fpoId, cropName, grade). */
function lotIdentity(body) {
  if (body.lotKey) return parseLotKey(body.lotKey);
  const cropName = body.cropName || body.commodity;
  if (!mongoose.isValidObjectId(body.fpoId) || !cropName) return null;
  // An ABSENT grade means the ungraded bucket, which is a real lot — it is not
  // "any grade" and it is never a wildcard. Grades are never blended.
  const raw = body.gradeKey ?? body.grade ?? null;
  const gradeKey = raw == null ? lotCatalog.UNGRADED : String(raw);
  if (gradeKey !== lotCatalog.UNGRADED && !lotCatalog.GRADE_ORDER.includes(gradeKey)) return null;
  return { fpoId: body.fpoId, cropKey: lotCatalog.cropKeyOf(cropName), gradeKey };
}

const rx = (s) => new RegExp(`^${String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

/**
 * THE LOT, AS IT IS RIGHT NOW — resolved from the database, never from the
 * request. Same query, same grade bucketing and the same ≤MAX_BUNDLE tightest-
 * cluster selection GET /bundles uses, so what a buyer can order is exactly
 * what a buyer was shown.
 */
async function resolveLotForOrder({ fpoId, cropKey, gradeKey }, drop) {
  const fpo = await Fpo.findById(fpoId).lean();
  if (!fpo || fpo.status !== 'active')
    return { error: { status: 404, code: 'LOT_NOT_FOUND', error: 'No active group with that id.' } };

  const uids = (fpo.members || []).filter((m) => m.status === 'active').map((m) => m.farmerUid);
  const listings = await CropListing.find({
    farmerUid: { $in: uids }, status: 'available', cropName: rx(cropKey),
  })
    .sort({ _id: 1 })
    .select('cropName cropLocalName cropId proofImageId quantityAvailableKg pricePerKg minOrderKg '
      + 'farmerUid farmerName farmerPhone location grade custody')
    .lean();

  const bucket = lotCatalog.groupByCropGrade(listings)
    .find((b) => b.cropKey === cropKey && b.gradeKey === gradeKey);
  if (!bucket)
    return {
      error: {
        status: 404, code: 'LOT_NOT_FOUND',
        error: 'This group is not offering that crop at that grade right now.',
      },
    };

  const plottable = [], unplottable = [];
  for (const l of bucket.listings) (toLatLng(l.location) ? plottable : unplottable).push(l);

  const { chosen, excluded } = plottable.length
    ? selectBundleLots(plottable, drop, MAX_BUNDLE)
    : { chosen: [], excluded: [] };

  // ⚠️ ONE FARMER IS ONE PICKUP STOP, even inside a single lot. A farmer with
  // two listings of the same crop AND grade is two contributions at one gate
  // (Phase C's cross-lot note says so explicitly), and the allocation service's
  // contract is one entry per farmer. Their larger listing supplies the order
  // and the other is named as excluded with the service's own reason rather
  // than being silently merged into it — merging would let one farm be counted
  // as two of the five stops a vehicle has.
  const byFarmer = new Map();
  const secondListings = [];
  for (const p of chosen) {
    const l = p.lot;
    const prev = byFarmer.get(l.farmerUid);
    if (!prev) { byFarmer.set(l.farmerUid, l); continue; }
    const lWins = l.quantityAvailableKg > prev.quantityAvailableKg
      || (l.quantityAvailableKg === prev.quantityAvailableKg && String(l._id) < String(prev._id));
    byFarmer.set(l.farmerUid, lWins ? l : prev);
    secondListings.push(lWins ? prev : l);
  }
  // Sorted by id so the contributor order is a pure function of the data; the
  // VISITING order is decided separately by orderStops() on the allocated
  // subset, which is the only place a route order should come from.
  const supplying = [...byFarmer.values()].sort((a, b) => String(a._id).localeCompare(String(b._id)));

  return { fpo, bucket, supplying, beyondMaxBundle: excluded, unplottable, secondListings };
}

/** The contributor rows the allocation service takes. `availableKg`, not `quantityKg`. */
const contributorsOf = (listings) => listings.map((l) => ({
  listingId: l._id,
  farmerUid: l.farmerUid,
  farmerName: l.farmerName,
  availableKg: l.quantityAvailableKg,
  minOrderKg: l.minOrderKg ?? 1,
  // THE authoritative price. Never lot.price.indicativePerKg — see the warning
  // in services/lotCatalogService.js.
  pricePerKg: l.pricePerKg,
}));

/** Every member left out, from all four reasons, in one array with a reason each. */
function excludedRows(resolved, allocResult) {
  const E = lotAllocation.EXCLUSION;
  const say = (l, reason, detail) => ({
    listingId: l._id, farmerUid: l.farmerUid, farmerName: l.farmerName,
    quantityKg: l.quantityAvailableKg, pricePerKg: l.pricePerKg,
    minOrderKg: l.minOrderKg ?? 1, reason, detail,
  });
  return [
    ...resolved.unplottable.map((l) => say(l, E.NO_PICKUP_LOCATION,
      `${l.farmerName || 'This member'} has no pickup point on file, so no vehicle can be routed to them.`)),
    ...resolved.beyondMaxBundle.map((l) => say(l, E.BEYOND_MAX_BUNDLE,
      `One vehicle serves at most ${MAX_BUNDLE} farms, and the farms that make the shortest pickup route were taken first.`)),
    ...resolved.secondListings.map((l) => say(l, E.SECOND_LISTING_SAME_FARMER,
      `${l.farmerName || 'This member'} has a second listing of the same crop and grade. One farm is ONE pickup stop, `
      + 'so this order draws on their larger listing only; the other stays on the market.')),
    // The service's own exclusions (below their own minimum, minimum does not
    // fit) already carry a `detail`.
    ...(allocResult?.excluded || []).map((c) => ({
      listingId: c.listingId, farmerUid: c.farmerUid, farmerName: c.farmerName,
      quantityKg: c.availableKg, pricePerKg: c.pricePerKg, minOrderKg: c.minOrderKg,
      reason: c.reason, detail: c.detail,
    })),
  ];
}

/**
 * PRICE THE COLLECTION RUN over the ALLOCATED farms only.
 *
 * The stops are re-ordered and the route re-measured for the farms the
 * allocation actually drew on — NOT for the whole lot. Reusing the lot's
 * catalog fare would bill a buyer for driving to farms their order never
 * touches. `hired` runs are priced by the captain fare table; `own`/
 * `contracted` runs carry the cost the FPO stated, with base/perKm/
 * distanceCharge left NULL because none of them are known (see
 * models/Consignment.js — a stated cost must never wear a computed fare's
 * clothes).
 */
async function priceLotRun({ allocation, byListingId, drop, vehicleType, arrangement }) {
  const hired = arrangement.mode === 'hired';
  const totalKg = allocation.reduce((a, x) => a + x.quantityKg, 0);

  const points = allocation.map((a) => {
    const l = byListingId.get(String(a.listingId));
    return { ...toLatLng(l.location), quantityKg: a.quantityKg, listingId: String(a.listingId) };
  });
  const ordered = orderStops(points, drop);
  const route = await getMultiStopRoute([...ordered, drop]);
  if (!route)
    return { error: { status: 400, code: 'NO_ROUTE', error: 'A route to this destination could not be measured.' } };

  // ONE drive home, from the market back toward the first farm — not one per
  // stop. Charging it against the winding loaded route is the bug that once
  // made a shared run cost more than three separate trips.
  const returnDistanceKm = roundKm(haversineKm(drop, ordered[0]) * ROAD_FACTOR);

  let fare, soloFareTotal, chosenVehicle;
  if (hired) {
    const tried = (vehicleType ? [vehicleType] : VEHICLE_ORDER)
      .map((v) => quote(v, route.distanceKm, totalKg, { returnDistanceKm }));
    const picked = tried.find((q) => q.ok);
    if (!picked)
      return {
        error: {
          status: 400, code: 'NO_VEHICLE',
          error: tried[0]?.reason || `No vehicle in the fare table can carry ${totalKg} kg in one run.`,
        },
      };
    chosenVehicle = picked.type;
    fare = picked.fare;

    // The same crop as separate single-farm trips, priced with the same engine
    // and the same table, so the saving is measured rather than claimed.
    soloFareTotal = 0;
    for (const p of ordered) {
      const r = await getMultiStopRoute([p, drop]);
      const q = r && VEHICLE_ORDER.map((v) => quote(v, r.distanceKm, p.quantityKg)).find((x) => x.ok);
      if (!q) { soloFareTotal = null; break; }
      soloFareTotal += q.fare.total;
    }
  } else {
    const v = VEHICLES[vehicleType];
    if (!v) return { error: { status: 400, code: 'UNKNOWN_VEHICLE', error: 'Name the vehicle this run uses.' } };
    // Capacity IS a fact about the vehicle whoever owns it. `maxKm` is a
    // dispatch-pool policy and is deliberately not enforced on an FPO's own
    // vehicle — same reasoning as routes/consignments.js.
    if (totalKg > v.capacityKg)
      return {
        error: {
          status: 400, code: 'VEHICLE_UNSUITABLE',
          error: `${v.label} carries up to ${v.capacityKg} kg`,
        },
      };
    chosenVehicle = vehicleType;
    fare = {
      base: null, perKm: null, distanceCharge: null,
      returnCharge: 0, returnKm: 0, returnThresholdKm: null,
      total: arrangement.transport.cost,
      agentPayout: null,
    };
    // NOT compared against the captain fare table: subtracting an FPO-stated
    // cost from captain-priced solo trips is two different price bases, the
    // error CLAUDE.md records under H2.
    soloFareTotal = null;
  }

  const shares = splitFare(fare.total, ordered);
  const shareByListing = new Map(ordered.map((s, i) => [s.listingId, shares[i]]));
  const sequenceOf = new Map(ordered.map((s, i) => [s.listingId, i]));

  return {
    ordered, route, vehicleType: chosenVehicle, fare, soloFareTotal,
    shareByListing, sequenceOf, returnDistanceKm, totalKg, hired,
  };
}

/**
 * WHAT EACH MEMBER IS OWED, THROUGH computeSettlement() — not a second copy.
 *
 * The allocation is shaped into the Order-like rows that function already
 * reads, so a facilitation fee is deducted here exactly as it will be on
 * /settlement, and a procurement lot is priced against the group's own agreed
 * (crop, grade) rate table with its own gap reasons. Two copies of this
 * arithmetic is two places for the fee ordering to be applied differently, and
 * a member reading the confirm screen against their settlement would have no
 * way to tell which was right — the reason /settlement and the dashboard were
 * merged onto one function in the first place.
 */
function payoutForAllocation({ fpo, cropName, gradeKey, allocation, shareByListing, byListingId }) {
  const pseudoOrders = allocation.map((a) => ({
    _id: a.listingId,
    farmerUid: a.farmerUid, farmerName: a.farmerName,
    cropName,
    quantityKg: a.quantityKg,
    cropTotal: a.lineTotal,
    // The GROSS, the same thing POST /api/orders writes. computeSettlement
    // applies the fee / agreed rate itself.
    farmerPayout: a.lineTotal,
    // Phase 3, L1 — the quote must show the SAME freight-aware payout the
    // confirm will actually write, or a member sees one figure here and a
    // smaller one on their real Order with nothing explaining the gap.
    freightDeduction: byListingId
      ? freightDeductionFor(byListingId.get(String(a.listingId)), a.quantityKg)
      : { perKg: 0, qtyKg: a.quantityKg, amount: 0 },
    fare: { total: shareByListing ? (shareByListing.get(String(a.listingId)) || 0) : 0 },
    settlement: { farmerPaid: false },
  }));
  // One sale, not a season's pool: sharePct is null so byShare is not
  // attempted. A share split divides a POOL and this is a single lot.
  const members = allocation.map((a) => ({
    farmerUid: a.farmerUid, farmerName: a.farmerName, sharePct: null,
  }));
  const grade = gradeKey === lotCatalog.UNGRADED ? null : gradeKey;
  const gradeByOrderId = new Map(pseudoOrders.map((o) => [String(o._id), grade]));
  return computeSettlement(fpo, members, pseudoOrders, gradeByOrderId);
}

/**
 * The digest a confirm has to echo. Covers the CROP side of the quote only:
 * the lot, the quantity, the destination (which decides which farms the
 * vehicle reaches), the payment mode, and every member's kilograms, ₹/kg and
 * payout. Anything that moves any of those makes the quote stale.
 *
 * Opaque on purpose: a client can echo it or forge it, and a forged one can
 * only produce a refusal. No price ever travels back through this value.
 */
function quoteDigest({ lotKey, requestedKg, drop, paymentMode, rows, cropTotal, memberPayableTotal }) {
  const canon = [
    'fpo-lot-quote/v1',
    lotKey,
    requestedKg,
    `${drop.lat.toFixed(5)},${drop.lng.toFixed(5)}`,
    paymentMode,
    ...rows
      .map((r) => [String(r.listingId), r.farmerUid, r.quantityKg, r.pricePerKg, r.amount].join(':'))
      .sort(),
    cropTotal,
    memberPayableTotal,
  ].join('|');
  return crypto.createHash('sha256').update(canon).digest('hex').slice(0, 32);
}

const NOT_A_RESERVATION =
  'THIS QUOTE IS NOT A RESERVATION. Nothing has been written and no stock is held for you. Every '
  + 'kilogram named here stays on the market and can be sold to somebody else — including by an '
  + 'ordinary single-farmer purchase — until you confirm. If it moves, the confirm is refused rather '
  + 'than quietly rebuilt at a different price, and you are quoted again.';

const CLIENT_ALLOCATION_NOTE =
  'The allocation, every ₹/kg and every payout are re-derived from the database by the server. An '
  + '`allocation`, `pricePerKg`, `cropTotal` or `farmerPayout` sent in the request body is IGNORED — '
  + 'accepting one would let a buyer name their own suppliers, quantities and prices.';

/** Fields a client might post that this route deliberately does not read. */
const IGNORED_CLIENT_FIELDS = [
  'allocation', 'contributors', 'pricePerKg', 'cropTotal', 'farmerPayout',
  'buyerTotal', 'memberPayableTotal', 'fare', 'grandTotal',
];

/**
 * The shared body of both routes: resolve the lot, allocate, price the run and
 * apply the payment mode. Returns { error } or the whole quote.
 */
async function buildLotQuote(req) {
  const identity = lotIdentity(req.body);
  if (!identity)
    return {
      error: {
        status: 400, code: 'BAD_LOT',
        error: 'Name the lot by its lotKey, or by fpoId + cropName + grade. Grades are never blended, '
          + 'so a lot with no grade means the ungraded bucket and not "any grade".',
      },
    };

  const drop = toLatLng(req.body.dropoff || { lat: Number(req.body.lat), lng: Number(req.body.lng) });
  if (!drop) return { error: { status: 400, code: 'NO_DROPOFF', error: 'Choose a delivery destination' } };

  const requestedKg = Number(req.body.quantityKg);
  if (!Number.isFinite(requestedKg) || requestedKg <= 0)
    return { error: { status: 400, code: 'BAD_QUANTITY', error: 'quantityKg must be a positive number' } };

  const resolved = await resolveLotForOrder(identity, drop);
  if (resolved.error) return resolved;

  const { fpo, bucket, supplying } = resolved;
  const lotKey = `${fpo._id}::${bucket.cropKey}::${bucket.gradeKey}`;
  const lotHead = {
    lotKey,
    fpoId: fpo._id, fpoName: fpo.name, district: fpo.district, village: fpo.village,
    cropName: bucket.cropName, cropKey: bucket.cropKey, gradeKey: bucket.gradeKey,
    grade: lotCatalog.describeGrade(bucket.gradeKey, bucket.cropName, bucket.listings),
    ungraded: bucket.gradeKey === lotCatalog.UNGRADED,
  };

  // ── the allocation ──────────────────────────────────────────────────────
  const alloc = lotAllocation.allocate({
    contributors: contributorsOf(supplying),
    requestedKg,
    runCapacityKg: RUN_CAPACITY_KG,
  });

  if (!alloc.ok) {
    const alternativesKg = [alloc.nearestBelowKg, alloc.nearestAboveKg].filter((v) => v != null);
    return {
      error: {
        status: 409,
        code: alloc.code,
        error: alloc.error,
        lot: lotHead,
        requestedKg,
        // The quantities that WOULD work, so a refusal names something the
        // buyer can actually order instead of leaving them to guess.
        nearestBelowKg: alloc.nearestBelowKg,
        nearestAboveKg: alloc.nearestAboveKg,
        alternativesKg,
        fillableRanges: alloc.fillableRanges,
        maxFillableKg: alloc.maxFillableKg,
        totalAvailableKg: alloc.totalAvailableKg,
        smallestOrderKg: alloc.smallestOrderKg,
        limitedBy: alloc.limitedBy || null,
        contributorsConsidered: alloc.contributorsConsidered,
        excluded: excludedRows(resolved, alloc),
        policy: alloc.policy, policyNote: alloc.policyNote, fairnessRisk: alloc.fairnessRisk,
        reservation: { reserved: false, note: NOT_A_RESERVATION },
      },
    };
  }

  if (alloc.allocation.length > MAX_BUNDLE)
    return {
      error: {
        status: 409, code: 'TOO_MANY_STOPS',
        error: `One vehicle serves at most ${MAX_BUNDLE} farms.`,
      },
    };

  // ── how the vehicle is arranged ─────────────────────────────────────────
  // Phase B's own validator, so `costSource` and `costNote` are derived from
  // the mode here too and a caller cannot post a stated figure labelled as one
  // this app computed. Defaults to `hired`, which is the captain pool.
  const arrangement = await buildTransportArrangement(
    { ...req.body, fpoId: fpo._id }, req.firebaseUid
  );
  if (arrangement.error)
    return { error: { status: 400, code: arrangement.code, error: arrangement.error } };

  const byListingId = new Map(supplying.map((l) => [String(l._id), l]));
  const priced = await priceLotRun({
    allocation: alloc.allocation, byListingId, drop,
    vehicleType: req.body.vehicleType, arrangement,
  });
  if (priced.error) return priced;

  // ── what each member is owed, under THIS group's payment mode ───────────
  const settle = payoutForAllocation({
    fpo, cropName: bucket.cropName, gradeKey: bucket.gradeKey,
    allocation: alloc.allocation, shareByListing: priced.shareByListing, byListingId,
  });

  // A PROCUREMENT GROUP WITH NO AGREED RATE FOR THIS (crop, grade) CANNOT SELL
  // IT HERE. Phase B's rule, unchanged: never zero, never the crop's other
  // grades, and never a silent fall back to facilitation. The FPO has not
  // agreed what it owes its own members for this produce, so the order is
  // refused and the gap is named.
  if (settle.paymentMode === 'procurement' && !settle.procurement.complete) {
    const gap = settle.procurement.gaps[0];
    return {
      error: {
        status: 409,
        code: gap.reason === RATE_GAP_REASONS.NO_AGREED_RATE ? 'NO_AGREED_RATE' : 'GRADE_UNKNOWN',
        reason: gap.reason,
        error: gap.reason === RATE_GAP_REASONS.NO_AGREED_RATE
          ? `${fpo.name} BUYS its members' crop at agreed per-grade rates and has no rate on file for `
            + `${bucket.cropName} grade ${gap.grade}. Until the group agrees one there is no figure for `
            + 'what its members are owed, so this lot cannot be sold through the group. It is not priced '
            + "at zero and it does not fall back to the members' asking prices."
          : `${fpo.name} buys its members' crop at agreed rates keyed on (crop, GRADE), and nobody has `
            + `declared a grade for this ${bucket.cropName}. An ungraded lot has no (crop, grade) rate `
            + 'and is not given one — inspect it and agree a grade, or the group can switch to '
            + 'facilitation, under which members are paid their own asking price.',
        lot: lotHead,
        gaps: settle.procurement.gaps,
        ratesOnFile: settle.procurement.ratesOnFile,
        reservation: { reserved: false, note: NOT_A_RESERVATION },
      },
    };
  }

  // ── one row per contributing farmer, with everything about their line ───
  const payoutByUid = new Map(settle.byLot.map((r) => [r.farmerUid, r]));
  const rows = alloc.allocation.map((a) => {
    const p = payoutByUid.get(a.farmerUid) || {};
    const fareShare = priced.shareByListing.get(String(a.listingId)) || 0;
    return {
      listingId: a.listingId,
      farmerUid: a.farmerUid,
      farmerName: a.farmerName,
      quantityKg: a.quantityKg,
      // The member's OWN asking price, always. Never the lot's indicative ₹/kg.
      pricePerKg: a.pricePerKg,
      lineTotal: a.lineTotal,
      minOrderKg: a.minOrderKg,
      availableKg: a.availableKg,
      shareOfOrderPct: a.shareOfOrderPct,
      // What the vendor pays for THIS farmer's produce, and this farmer's
      // share of the one vehicle. The two add up to the buyer's line.
      fareShare,
      buyerLineTotal: a.lineTotal + fareShare,
      // WHAT THIS MEMBER IS OWED under the group's payment mode. Under
      // facilitation it is their own line less their share of the fee; under
      // procurement it is the agreed rate for their kilograms, whatever the
      // buyer paid.
      amount: p.amount ?? a.lineTotal,
      grossAmount: p.grossAmount ?? a.lineTotal,
      fpoFee: p.fpoFee ?? 0,
      // Phase 3, L1 — this member's own farm→godown collection freight, if
      // any, already netted out of `amount` above. 0 for stock sold straight
      // from the farm.
      freightOwed: p.freightOwed ?? 0,
      agreedAmount: p.agreedAmount ?? null,
      payoutBasis: settle.paymentMode === 'procurement'
        ? 'agreed_procurement_rate' : 'own_asking_price_less_fee_share',
      pickupSequence: priced.sequenceOf.get(String(a.listingId)),
    };
  });

  const cropTotal = alloc.cropTotal;
  const buyerTotal = cropTotal + priced.fare.total;
  const quoteRef = quoteDigest({
    lotKey, requestedKg, drop,
    paymentMode: settle.paymentMode, rows, cropTotal,
    memberPayableTotal: settle.memberPayableTotal,
  });

  return {
    fpo, bucket, resolved, drop, arrangement, priced, alloc, settle, rows,
    lotHead, lotKey, requestedKg, cropTotal, buyerTotal, quoteRef, byListingId,
    quote: {
      quoteRef,
      lot: lotHead,
      singleLotOnly: true,
      crossLotNote: CROSS_LOT_NOTE,

      requestedKg,
      allocatedKg: alloc.allocatedKg,
      membersIncluded: alloc.membersIncluded,
      // Who supplies what, at whose price. THE answer this endpoint exists for.
      allocation: rows,
      excluded: excludedRows(resolved, alloc),

      // ── the money, from three angles that must reconcile ──────────────
      cropTotal,
      transport: {
        mode: arrangement.mode,
        dispatched: priced.hired,
        vehicleType: priced.vehicleType,
        distanceKm: priced.route.distanceKm,
        durationMin: priced.route.durationMin,
        routeSource: priced.route.source,
        stops: priced.ordered.length,
        fare: priced.fare,
        soloFareTotal: priced.soloFareTotal,
        saving: priced.soloFareTotal == null ? null : priced.soloFareTotal - priced.fare.total,
        costSource: priced.hired
          ? COST_SOURCE_BY_MODE.hired : arrangement.transport.costSource,
        costNote: priced.hired
          ? COST_NOTE_BY_MODE.hired : arrangement.transport.costNote,
        splitNote: 'One vehicle, split across the farms BY WEIGHT. Rounding drift lands on the largest '
          + 'stop, so the shares sum exactly to the fare charged.',
      },
      buyerTotal,
      // Phase 3, L3 — who this delivery leg's freight falls on, named rather
      // than an assumption buried in how buyerTotal was computed. Only
      // 'buyer_pays' is actually wired today (see the Fpo model), so
      // `buyerTotal` above already includes it whatever this reads.
      freightTerm: fpo.freightTerm || 'buyer_pays',
      reconciliation: {
        cropTotalEqualsSumOfLines: cropTotal === rows.reduce((a, r) => a + r.lineTotal, 0),
        fareEqualsSumOfShares: priced.fare.total === rows.reduce((a, r) => a + r.fareShare, 0),
        buyerTotalEqualsSumOfLines: buyerTotal === rows.reduce((a, r) => a + r.buyerLineTotal, 0),
        note: "Each member is paid their OWN asking price, so the buyer's total is the sum of the lines "
          + 'actually drawn on — not the lot\'s indicative ₹/kg times the quantity.',
      },

      // ── what the members get, under this group's own arrangement ───────
      payment: {
        paymentMode: settle.paymentMode,
        memberPayableTotal: settle.memberPayableTotal,
        fpoPosition: settle.fpoPosition,
        procurement: settle.procurement,
        byLot: settle.byLot,
        note: settle.note,
      },

      policy: alloc.policy,
      policyNote: alloc.policyNote,
      fairnessRisk: alloc.fairnessRisk,
      fillableRanges: alloc.fillableRanges,
      maxFillableKg: alloc.maxFillableKg,
      totalAvailableKg: alloc.totalAvailableKg,
      smallestOrderKg: alloc.smallestOrderKg,

      reservation: { reserved: false, note: NOT_A_RESERVATION },
      confirmNote: 'Send `quoteRef` back to POST /api/fpos/lots/confirm with the same lot, quantity and '
        + 'destination. The server re-derives everything and refuses if anything moved. '
        + CLIENT_ALLOCATION_NOTE,
    },
  };
}

/**
 * POST /api/fpos/lots/quote
 * body: { lotKey | (fpoId, cropName, grade), quantityKg,
 *         dropoff: {lat,lng,label,city,district}, vehicleType?,
 *         transportMode?, transport? }
 *
 * Read-only. Writes nothing, reserves nothing.
 */
router.post('/lots/quote', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const built = await buildLotQuote(req);
    if (built.error) {
      const { status, ...rest } = built.error;
      return res.status(status).json({ success: false, ...rest });
    }
    res.json({ success: true, quote: built.quote });
  } catch (err) {
    console.error('❌ FPO lot quote error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * resolveLotQuote(ctx) — everything a lot purchase needs BEFORE any stock
 * moves: the hired-only check, the idempotency short-circuit, the quoteRef
 * requirement, a fresh buildLotQuote(), the staleness gate, and advance
 * validation.
 *
 * `ctx` is `{ firebaseUid, profile, body }` — exactly the three things this
 * used to read straight off `req`. That is deliberate: the SAME function now
 * runs TWICE for one purchase — once when the buyer asks
 * (POST /lots/request) and again when the FPO admin accepts
 * (POST /lot-requests/:id/accept), the second time built from a STORED buyer
 * identity and request body rather than the admin's own. A buyer who agreed
 * to ₹18/kg from four named farmers must not silently become the admin's
 * own identity on the Orders that get created — see executeLotCommit below.
 *
 * Returns `{ error: {...} }` (the same shape the old route sent straight to
 * res.json), `{ duplicate: true, orders, consignment }` for a replayed
 * idempotencyKey, or the resolved quote ready for executeLotCommit().
 */
async function resolveLotQuote(ctx) {
  const { firebaseUid, body } = ctx;

  // ⚠️ HIRED ONLY, FOR THE SAME REASON routes/consignments.js's buyer
  // -bundling endpoint is. This runs on the BUYER's own identity, and
  // buildTransportArrangement requires the FPO's own admin for any non-hired
  // mode — a buyer can never be that. Before the admin check existed, a
  // buyer could name the SELLING FPO's own vehicle and state its cost, and
  // the FPO had no say in the matter. Verified — LotOrderScreen never sends
  // `transportMode`, so nothing real depends on this.
  if (body?.transportMode && body.transportMode !== 'hired') {
    return {
      error: {
        status: 400, code: 'HIRED_ONLY',
        error: "A lot purchase is delivered through the captain pool. The FPO's own transport is "
          + 'arranged from the FPO side, not chosen by the buyer confirming a purchase.',
      },
    };
  }

  const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey) : null;

  // A retried or double-tapped request/accept returns what it already made,
  // before anything is re-derived: the world may have moved since the first
  // attempt succeeded, and a retry must not be refused as stale for that.
  if (idempotencyKey) {
    const prior = await Order.find({
      idempotencyKey: new RegExp('^' + idempotencyKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '#'),
      vendorUid: firebaseUid,
    }).lean();
    if (prior.length) {
      const cid = prior[0].consignmentId;
      const whole = cid && prior.every((o) => String(o.consignmentId) === String(cid));
      if (whole) {
        return {
          duplicate: true,
          orders: prior,
          consignment: await Consignment.findById(cid).lean(),
        };
      }
      return {
        error: {
          status: 409, code: 'CONFIRM_IN_FLIGHT',
          error: 'A confirm with this idempotencyKey is already part-written. Nothing new was created.',
        },
      };
    }
  }

  if (!body.quoteRef)
    return {
      error: {
        status: 400, code: 'QUOTE_REQUIRED',
        error: 'Confirm the quote you were given: POST /api/fpos/lots/quote first and send its quoteRef '
          + 'back. Members inside one lot ask different prices, so the total depends on which of them the '
          + 'order draws from — there is no price to agree to before the allocation exists.',
      },
    };

  const built = await buildLotQuote(ctx);
  if (built.error) {
    const { status, ...rest } = built.error;
    return { error: { status, ...rest, committed: false } };
  }

  // ── THE STALENESS GATE ────────────────────────────────────────────────
  // The server has just re-derived everything from the database. If its own
  // answer no longer matches the quote it issued, the world moved: stock was
  // bought, a price was edited, a member left, or the group changed its
  // payment mode. It is REFUSED rather than quietly committed at whatever the
  // new numbers are — a buyer who agreed to ₹18/kg from four named farmers
  // must not silently be sold ₹26/kg from two others.
  if (body.quoteRef !== built.quoteRef) {
    return {
      error: {
        status: 409, code: 'QUOTE_STALE', committed: false,
        error: 'This lot changed after you were quoted — the stock, the prices, the members or the '
          + "group's payment terms are no longer what you agreed to. Nothing has been bought. Here is "
          + 'what it looks like now.',
        quote: built.quote,
        reservation: { reserved: false, note: NOT_A_RESERVATION },
      },
    };
  }

  // ── THE ADVANCE, VALIDATED BEFORE ANY STOCK MOVES ────────────────────
  //
  // A PERCENTAGE ONLY on this route — deliberately narrower than
  // POST /api/orders, which also accepts a rupee amount. One lot purchase
  // becomes N Orders with N different line totals, so a flat rupee figure
  // has no single fair division across them (see the note where it is
  // written onto each Order). A percentage divides exactly and means the
  // same thing to every member.
  const rawPct = body?.advancePct;
  let advancePct = 0;
  if (rawPct !== undefined && rawPct !== null && rawPct !== '') {
    advancePct = Number(rawPct);
    if (!Number.isFinite(advancePct) || advancePct < 0 || advancePct > 100)
      return { error: { status: 400, code: 'BAD_ADVANCE', error: 'An advance percentage must be between 0 and 100.' } };
    // Rounded to one decimal so the per-farmer rupee figures below stay
    // reconcilable against the buyer's headline total.
    advancePct = Math.round(advancePct * 10) / 10;
  }
  if (body?.advanceAmount !== undefined && body.advanceAmount !== null && body.advanceAmount !== '')
    return {
      error: {
        status: 400, code: 'ADVANCE_MUST_BE_PCT',
        error: 'An FPO lot is bought from several farmers at several different prices, so an '
          + 'advance here is a PERCENTAGE of each farmer\'s own line, not one rupee figure. '
          + 'Send advancePct.',
      },
    };

  return { built, idempotencyKey, advancePct };
}

/**
 * executeLotCommit(resolved, ctx) — COMMITS THE SALE: takes the stock, then
 * writes one Order per contributing farmer and one Consignment for the
 * shared run. Called ONLY from POST /lot-requests/:id/accept, immediately
 * after a FRESH resolveLotQuote() has just re-validated that nothing moved
 * since the buyer's request.
 *
 * ── PARTIAL FAILURE IS THE WHOLE PROBLEM ────────────────────────────────
 * Five farmers means five guarded stock decrements, five Order writes and one
 * Consignment. If the third decrement loses a race, the first two must not stay
 * decremented; if the third Order write fails, the first two must not survive as
 * orphans and no Consignment may exist pointing at them.
 *
 * The mechanism is this codebase's established one and NOT a transaction: every
 * write is an atomic guarded update with its expected prior state in the filter,
 * and a failure after a step is compensated by undoing that step. routes/orders.js
 * says why ("this beats a full transaction — and it keeps working on a standalone
 * mongod"), routes/consignments.js does the same for its claim loop, and
 * scripts/reviewFpoClaims.js repeats it verbatim for a three-document approval.
 *
 * The order of writes is chosen so the risky part fails FIRST and cheapest:
 *   1. stock, guarded exactly as POST /api/orders guards it — nothing else has
 *      been written yet, so a loss here compensates by restoring the kilograms
 *      already taken and nothing more.
 *   2. the Orders. A failure restores ALL the stock and deletes the Orders
 *      already created.
 *   3. the Consignment, whose _id is minted up front so the Orders can carry
 *      `consignmentId` at creation — which removes the claim-then-maybe-lose
 *      step entirely rather than adding another window to compensate for.
 *   4. only after everything is committed does a listing whose remainder is
 *      below its own minimum flip to `sold_out`, so a rollback never has to
 *      un-flip a status.
 *
 * Returns `{ httpStatus, json }` — never writes to a response itself, so the
 * same commit can be triggered from an admin's Accept tap with no `res` of
 * its own to write to until the caller decides what to do with the result.
 */
async function executeLotCommit(resolved, ctx) {
  const { firebaseUid, profile, body } = ctx;
  const { built, idempotencyKey, advancePct } = resolved;
  const { fpo, bucket, drop, arrangement, priced, rows, settle, byListingId } = built;
  const hired = arrangement.mode === 'hired';
  const now = new Date();
  // Minted up front so every Order can carry it at creation. See the header.
  const consignmentId = new mongoose.Types.ObjectId();

  // ── 1. TAKE THE STOCK ─────────────────────────────────────────────────
  // The same single-document guarded decrement POST /api/orders uses:
  // availability, the farmer's own minimum and the stock check are all query
  // conditions on one document, so MongoDB applies them atomically. A
  // read-then-save here is the classic lost-update race.
  const taken = [];
  const restoreStock = async () => {
    for (const t of taken) {
      await CropListing.updateOne({ _id: t.listingId }, { $inc: { quantityAvailableKg: t.quantityKg } });
    }
  };

  let stockLost = null;
  for (const r of rows) {
    const upd = await CropListing.findOneAndUpdate(
      {
        _id: r.listingId,
        status: 'available',
        minOrderKg: { $lte: r.quantityKg },
        quantityAvailableKg: { $gte: r.quantityKg },
      },
      { $inc: { quantityAvailableKg: -r.quantityKg } },
      { new: true }
    );
    if (!upd) { stockLost = r; break; }
    taken.push(r);
  }

  if (stockLost) {
    await restoreStock();
    return {
      httpStatus: 409,
      json: {
        success: false, code: 'STOCK_MOVED', committed: false,
        error: `${stockLost.farmerName || 'One member'}'s ${stockLost.quantityKg} kg was bought between `
          + 'the quote and this accept. NOTHING has been ordered — every kilogram this attempt had '
          + 'already taken has been put back. Ask the buyer for a fresh quote.',
        failedOn: {
          listingId: stockLost.listingId, farmerUid: stockLost.farmerUid,
          farmerName: stockLost.farmerName, quantityKg: stockLost.quantityKg,
        },
        rolledBack: taken.map((t) => ({ listingId: t.listingId, quantityKg: t.quantityKg })),
      },
    };
  }

  // ── 2. ONE ORDER PER CONTRIBUTING FARMER ──────────────────────────────
  // Per-farmer is architecturally required, not a preference: B1 gave Order
  // farmerPayout and settlement{}, C4 made disputes per order per party, and
  // C5 issues a receipt to one farmer. Three farmers in one Order has no
  // answer to "whose settlement, whose dispute, whose receipt".
  const created = [];
  const rollback = async () => {
    await Consignment.deleteOne({ _id: consignmentId });
    if (created.length) await Order.deleteMany({ _id: { $in: created.map((o) => o._id) } });
    await restoreStock();
  };

  let consignment;
  try {
    for (const r of rows) {
      const l = byListingId.get(String(r.listingId));
      // Phase 3, L1 — present only for a contributor's stock that passed
      // through an FPO collection run under facilitation mode; 0 for a
      // member selling straight from the farm (custody.freightOwedPerKg
      // defaults to 0). Same function, same rule as the single-farmer
      // order path in routes/orders.js.
      const freight = freightDeductionFor(l, r.quantityKg);
      const order = await Order.create({
        idempotencyKey: idempotencyKey ? `${idempotencyKey}#${r.listingId}` : undefined,
        listingId: l._id,
        cropId: l.cropId,
        cropName: l.cropName,
        cropLocalName: l.cropLocalName,
        proofImageId: l.proofImageId,
        quantityKg: r.quantityKg,
        pricePerKg: r.pricePerKg,
        cropTotal: r.lineTotal,
        priceSource: 'listing',

        farmerUid: l.farmerUid,
        farmerName: l.farmerName,
        farmerPhone: l.farmerPhone,
        vendorUid: firebaseUid,
        vendorName: profile.name,
        vendorPhone: profile.phone,
        vendorCompany: body.vendorCompany || profile.name,

        pickup: {
          ...toLatLng(l.location),
          label: [l.location.city, l.location.district].filter(Boolean).join(', '),
          city: l.location.city, district: l.location.district,
        },
        dropoff: {
          ...drop,
          label: body.dropoff?.label || body.dropoff?.address || 'Delivery point',
          city: body.dropoff?.city || '',
          district: body.dropoff?.district || resolveDistrict(null, drop),
        },

        vehicleType: priced.vehicleType,
        distanceKm: priced.route.distanceKm,
        durationMin: priced.route.durationMin,
        routeSource: priced.route.source,
        // This order's SHARE of the one vehicle, so its own grandTotal and
        // its receipt stay correct with no special-casing downstream.
        fare: { ...priced.fare, total: r.fareShare, agentPayout: hired ? r.fareShare : null },
        grandTotal: r.lineTotal + r.fareShare,
        // THE GROSS — what the buyer paid for these kilograms. The FPO's fee
        // or agreed rate is applied by computeSettlement(), which reads this
        // field as the gross; writing the net here would deduct the fee twice
        // on /settlement.
        // ⚠️ STAYS THE GROSS, DELIBERATELY NOT NET OF FREIGHT — unlike the
        // single-farmer order path. computeSettlement() reads THIS field as
        // pooledCropValue (what the buyer paid) and as the base for the
        // group's own fee/margin math; netting freight in here would shrink
        // both by this one member's personal collection debt, which has
        // nothing to do with what the buyer paid or what the FPO earns.
        // Freight is instead applied as its own named deduction inside
        // computeSettlement()'s per-member byLot figure, alongside the fee —
        // see the `freightOwed` line there.
        farmerPayout: r.lineTotal,
        freightDeduction: freight,
        // ── THE ADVANCE, APPLIED PER FARMER ──────────────────────────
        //
        // ⚠️ THE PERCENTAGE IS WHAT TRAVELS, NOT THE RUPEE FIGURE. One lot
        // purchase becomes N Orders with N different line totals (each
        // member sets their own ₹/kg), so a flat "₹20,000 advance" has no
        // single meaning across them — split by value it is arbitrary, split
        // evenly it underpays the biggest contributor. A percentage of each
        // farmer's OWN line total is the only division that is fair to every
        // member and reconciles to the buyer's headline figure exactly.
        //
        // This is the same reasoning that makes the transport fare split BY
        // WEIGHT rather than evenly (routes/consignments.js splitFare).
        'settlement.advance.agreedAmount': Math.round(r.lineTotal * advancePct) / 100,
        'settlement.advance.agreedPct': advancePct,
        'settlement.advance.agreedAt': advancePct > 0 ? now : null,

        consignmentId,
        status: hired ? 'awaiting_agent' : 'accepted',
        dispatchExpiresAt: hired ? dispatchExpiryFrom(now).expiresAt : null,
        acceptedAt: hired ? null : now,
        pickupOtp: otp(),
        dropOtp: otp(),
      });
      created.push(order);
    }

    // ── 3. ONE CONSIGNMENT FOR THE SHARED RUN ───────────────────────────
    // Including a one-farm allocation: the run is still a run, and Phase C
    // already prices a single-contributor lot as one trip with a saving of
    // exactly 0 rather than pretending something was pooled.
    const stops = priced.ordered.map((s, i) => {
      const r = rows.find((x) => String(x.listingId) === s.listingId);
      const o = created.find((c) => String(c.listingId) === s.listingId);
      const l = byListingId.get(s.listingId);
      return {
        orderId: o._id,
        farmerUid: l.farmerUid, farmerName: l.farmerName, farmerPhone: l.farmerPhone,
        cropName: l.cropName, quantityKg: r.quantityKg,
        lat: s.lat, lng: s.lng,
        label: [l.location.city, l.location.district].filter(Boolean).join(', '),
        sequence: i,
        legKm: priced.route.legs?.[i]?.distanceKm ?? null,
        fareShare: r.fareShare,
        fareShareBasisKg: r.quantityKg,
      };
    });

    consignment = await Consignment.create({
      _id: consignmentId,
      vendorUid: firebaseUid,
      vendorName: profile.name,
      vendorPhone: profile.phone,
      orderIds: created.map((o) => o._id),
      stops,
      dropoff: {
        ...drop,
        label: body.dropoff?.label || '',
        district: body.dropoff?.district || resolveDistrict(null, drop) || '',
      },
      vehicleType: priced.vehicleType,
      totalQuantityKg: priced.totalKg,
      distanceKm: priced.route.distanceKm,
      durationMin: priced.route.durationMin,
      routeSource: priced.route.source,
      routePolyline: priced.route.polyline,
      fare: priced.fare,
      soloFareTotal: priced.soloFareTotal,

      transportMode: arrangement.mode,
      fpoId: hired ? null : fpo._id,
      transport: hired
        ? { costSource: COST_SOURCE_BY_MODE.hired, costNote: COST_NOTE_BY_MODE.hired }
        : arrangement.transport,

      // ── WHICH LOT THIS RUN IS, which nothing recorded before ───────────
      // The buyer's order list showed five unrelated rows for one 2-tonne
      // purchase because neither the Orders nor the run named the lot. Note
      // this is `lot.fpoId`, NOT the top-level `fpoId` above: that one is
      // authorisation for an AGENTLESS run and is deliberately null on a
      // hired one, so writing the group into it would hand an FPO admin the
      // captain-only rules on a dispatched run. Provenance and authority are
      // different questions and get different fields.
      lot: {
        source: 'fpo_lot',
        lotKey: built.lotHead.lotKey,
        fpoId: fpo._id,
        fpoName: fpo.name,
        cropName: bucket.cropName,
        gradeKey: bucket.gradeKey,
        gradeCode: built.lotHead.grade?.code ?? null,
        gradeLabel: built.lotHead.grade?.label || '',
        // Self-declared by the contributing farmers, never inspected — the
        // flag travels with the purchase so a screen cannot quietly stop
        // saying so. See lotCatalogService.describeGrade().
        gradeDeclared: !!built.lotHead.grade?.declared,
      },

      // A hired run goes to the captain pool with a dispatch window; an
      // own/contracted run has no pool to be offered to, so it starts already
      // accepted with no agent and no expiry. `isActiveJob` is deliberately
      // NOT set on an agentless run — the partial unique index keys on
      // agentUid where isActiveJob is true, so two agentless runs would both
      // key on null and the second would fail with a duplicate key.
      status: hired ? 'awaiting_agent' : 'accepted',
      dispatchExpiresAt: hired ? dispatchExpiryFrom(now).expiresAt : null,
      acceptedAt: hired ? null : now,
      dropOtp: otp(),
    });
  } catch (err) {
    await rollback();
    console.error('❌ FPO lot commit rolled back:', err.message);
    return {
      httpStatus: err.code === 11000 ? 409 : 500,
      json: {
        success: false,
        code: err.code === 11000 ? 'CONFIRM_CONFLICT' : 'CONFIRM_FAILED',
        committed: false,
        error: 'This order could not be completed, so NOTHING was committed — every kilogram taken has '
          + 'been put back and no order or collection run survives. Ask the buyer for a fresh quote.',
        detail: err.message,
      },
    };
  }

  // ── 4. only now, and never before a rollback could need undoing ───────
  // What is left below a farmer's own minimum can never be bought by anyone,
  // so the listing closes. $expr compares two fields of the same document.
  await CropListing.updateMany(
    {
      _id: { $in: rows.map((r) => r.listingId) },
      status: 'available',
      $expr: { $lt: ['$quantityAvailableKg', '$minOrderKg'] },
    },
    { $set: { status: 'sold_out' } }
  );

  console.log(
    `🧺 FPO lot order ${consignmentId}: ${rows.length} farmer(s) · ${priced.totalKg}kg `
    + `${bucket.cropName} [${bucket.gradeKey}] · ₹${built.cropTotal} crop + ₹${priced.fare.total} `
    + `transport = ₹${built.buyerTotal} [${arrangement.mode}/${settle.paymentMode}]`
  );

  return {
    httpStatus: 201,
    json: {
      success: true,
      committed: true,
      lot: built.lotHead,
      singleLotOnly: true,
      crossLotNote: CROSS_LOT_NOTE,
      // One Order per contributing farmer, and exactly one Consignment.
      orders: created,
      consignment,
      allocation: rows,
      excluded: built.quote.excluded,
      cropTotal: built.cropTotal,
      buyerTotal: built.buyerTotal,
      transport: built.quote.transport,
      payment: built.quote.payment,
      // ── WHAT THE BUYER HAS COMMITTED TO, AND WHO CARRIES WHAT ──────────
      //
      // The headline advance beside the PER-FARMER breakdown, because a
      // 2-tonne lot from five farmers is five separate debts to five separate
      // people — one aggregate figure would hide which of them is carrying
      // what. Same reason `Order` is per-farmer in the first place.
      //
      // ⚠️ AGREED, NOT PAID. Every one of these is a promise until the FARMER
      // records it as received (POST /api/orders/:id/settle-advance). This app
      // has no payment rail and no escrow.
      advance: {
        pct: advancePct,
        agreedTotal: created.reduce((a, o) => a + (o.settlement?.advance?.agreedAmount || 0), 0),
        balanceTotal: created.reduce(
          (a, o) => a + ((o.farmerPayout || 0) - (o.settlement?.advance?.agreedAmount || 0)), 0),
        perFarmer: created.map((o) => ({
          orderId: o._id,
          farmerUid: o.farmerUid,
          farmerName: o.farmerName,
          cropValue: o.farmerPayout,
          advanceAgreed: o.settlement?.advance?.agreedAmount || 0,
          balanceOnDelivery: (o.farmerPayout || 0) - (o.settlement?.advance?.agreedAmount || 0),
        })),
        note: advancePct > 0
          ? `${advancePct}% of each farmer's own line total, agreed now and payable to each of them `
            + 'directly. The balance is due after delivery. Nothing has been transferred: this app '
            + 'records payments, it does not move them, and each farmer confirms their own advance '
            + 'when it actually arrives.'
          : 'No advance was agreed on this purchase, so each farmer carries the full value of their '
            + 'own lot from the moment it leaves their gate until you pay them. That is the exposure '
            + 'an advance exists to split.',
      },
      dispatched: hired,
      transportMode: arrangement.mode,
      costSource: hired ? COST_SOURCE_BY_MODE.hired : arrangement.transport.costSource,
      costNote: hired ? COST_NOTE_BY_MODE.hired : arrangement.transport.costNote,
      dispatchNote: hired
        ? 'Offered to the captain pool.'
        : 'This run was NOT offered to the captain pool — the FPO is driving it. Its stop outcomes are '
          + "recorded by the FPO's own admin.",
      serverDerived: true,
      ignoredClientFields: IGNORED_CLIENT_FIELDS.filter((f) => body[f] !== undefined),
      note: CLIENT_ALLOCATION_NOTE
        + ' Each Order records the GROSS the buyer paid for that farmer\'s kilograms; what the member is '
        + 'owed under this group\'s payment mode is in `payment`, computed by the same function '
        + '/settlement uses so the two cannot disagree. The app records a settlement — it does not move '
        + 'money.',
    },
  };
}

/**
 * POST /api/fpos/lots/request — a buyer's own purchase of an FPO grade lot,
 * held for the group admin's Accept/Reject rather than committed instantly.
 *
 * ⚠️ THIS ROUTE TAKES NO STOCK AND WRITES NO ORDER. It calls
 * resolveLotQuote() to prove the lot is buyable RIGHT NOW and to capture the
 * quoteRef the buyer is agreeing to, then stores an FpoLotRequest — same
 * "not a reservation" rule as a bare quote: the kilograms stay on the
 * market and can be bought some other way (or by another buyer's request)
 * before this one is accepted.
 */
router.post('/lots/request', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const ctx = { firebaseUid: req.firebaseUid, profile: req.profile, body: req.body };
    const resolved = await resolveLotQuote(ctx);
    if (resolved.error) {
      const { status, ...rest } = resolved.error;
      return res.status(status).json({ success: false, ...rest });
    }
    if (resolved.duplicate) {
      // This exact idempotencyKey already produced a committed sale — most
      // likely a retried tap after an earlier request was already accepted.
      // Telling the buyer that beats silently opening a second pending
      // request nobody will ever act on.
      return res.status(200).json({
        success: true, duplicate: true, orders: resolved.orders, consignment: resolved.consignment,
      });
    }

    const { built, idempotencyKey, advancePct } = resolved;
    const requestDoc = await FpoLotRequest.create({
      fpoId: built.fpo._id,
      fpoName: built.fpo.name,
      vendorUid: req.firebaseUid,
      vendorName: req.profile.name,
      vendorPhone: req.profile.phone,
      vendorCompany: req.body.vendorCompany || req.profile.name,
      lotKey: built.lotKey,
      cropName: built.bucket.cropName,
      gradeKey: built.bucket.gradeKey,
      gradeLabel: built.lotHead.grade?.label || '',
      quantityKg: built.requestedKg,
      // The exact body executeLotCommit will need at accept time, with the
      // idempotencyKey normalised the same way resolveLotQuote read it.
      requestBody: { ...req.body, idempotencyKey, quoteRef: built.quoteRef },
      quoteSnapshot: {
        cropTotal: built.cropTotal,
        buyerTotal: built.buyerTotal,
        fare: built.priced.fare,
        advancePct,
        allocation: built.rows.map((r) => ({
          farmerUid: r.farmerUid, farmerName: r.farmerName,
          quantityKg: r.quantityKg, pricePerKg: r.pricePerKg, lineTotal: r.lineTotal,
        })),
      },
      status: 'pending',
      requestedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      requestId: requestDoc._id,
      status: 'pending',
      lot: built.lotHead,
      quote: built.quote,
      note: "Sent to the FPO for approval. Nothing has been bought and no stock is held for you — the "
        + 'kilograms in this lot can still be sold to someone else before the admin responds. You will '
        + 'see this move to a real order once it is accepted, or a rejection with the reason if it is not.',
    });
  } catch (err) {
    console.error('❌ FPO lot request error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/fpos/lot-requests/mine — a buyer's own requests, newest first. */
router.get('/lot-requests/mine', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 30));
    const filter = { vendorUid: req.firebaseUid };
    const [total, requests] = await Promise.all([
      FpoLotRequest.countDocuments(filter),
      FpoLotRequest.find(filter).sort({ requestedAt: -1 }).limit(limit).lean(),
    ]);
    res.json({ success: true, requests, meta: { total, shown: requests.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/fpos/lot-requests/:id/withdraw — a buyer takes back a request
 * that has not been acted on yet. Nothing was ever taken, so there is
 * nothing to roll back — just a status flip, own requests only.
 */
router.post('/lot-requests/:id/withdraw', requireAuth, requireRole('vendor'), async (req, res) => {
  try {
    const updated = await FpoLotRequest.findOneAndUpdate(
      { _id: req.params.id, vendorUid: req.firebaseUid, status: 'pending' },
      { $set: { status: 'withdrawn', respondedAt: new Date(), respondedBy: req.firebaseUid } },
      { new: true }
    );
    if (!updated)
      return res.status(409).json({
        success: false, code: 'NOT_PENDING',
        error: 'This request is no longer pending, or is not yours.',
      });
    res.json({ success: true, request: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/fpos/:id/lot-requests — admin-only: pending requests first, then recent history. */
router.get('/:id/lot-requests', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const fpo = await loadAsAdmin(req.params.id, req.firebaseUid, res, 'see buyer requests for this group');
    if (!fpo) return;

    const [pending, history] = await Promise.all([
      FpoLotRequest.find({ fpoId: fpo._id, status: 'pending' }).sort({ requestedAt: -1 }).lean(),
      FpoLotRequest.find({ fpoId: fpo._id, status: { $ne: 'pending' } })
        .sort({ respondedAt: -1 }).limit(20).lean(),
    ]);
    res.json({ success: true, pending, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/fpos/lot-requests/:id/accept — the FPO admin turns a pending
 * buyer request into a real sale.
 *
 * ⚠️ RE-RUNS resolveLotQuote() FROM THE STORED BUYER IDENTITY, NEVER THE
 * ADMIN'S OWN. This is the real approval gate re-validation: if stock, a
 * price, the group's payment terms, or which members are active moved since
 * the buyer's request, this refuses with the same QUOTE_STALE shape a live
 * confirm always has — and marks the request `stale` rather than silently
 * committing at different numbers than the buyer agreed to.
 */
router.post('/lot-requests/:id/accept', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const request = await FpoLotRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, error: 'Not found' });

    const fpo = await loadAsAdmin(request.fpoId, req.firebaseUid, res, 'accept a buyer request for this group');
    if (!fpo) return;

    if (request.status !== 'pending')
      return res.status(409).json({
        success: false, code: 'NOT_PENDING',
        error: `This request is already ${request.status}, not pending.`,
      });

    // The buyer's own identity and the exact body they requested with — an
    // admin accepting a request must never be able to make the resulting
    // Order look like it came from anyone but the buyer who asked.
    const ctx = {
      firebaseUid: request.vendorUid,
      profile: { name: request.vendorName, phone: request.vendorPhone },
      body: request.requestBody,
    };

    const resolved = await resolveLotQuote(ctx);
    if (resolved.error) {
      await FpoLotRequest.updateOne(
        { _id: request._id },
        { $set: { status: 'stale', respondedAt: new Date(), respondedBy: req.firebaseUid } }
      );
      const { status, ...rest } = resolved.error;
      return res.status(status).json({
        success: false, stale: true, ...rest,
        note: 'This request has gone stale and is marked so — the buyer will need to request again with '
          + "today's numbers.",
      });
    }
    if (resolved.duplicate) {
      // Already committed under this idempotencyKey — a retried Accept.
      await FpoLotRequest.updateOne(
        { _id: request._id },
        {
          $set: {
            status: 'accepted', respondedAt: new Date(), respondedBy: req.firebaseUid,
            resultOrderIds: resolved.orders.map((o) => o._id),
            resultConsignmentId: resolved.consignment?._id || null,
          },
        }
      );
      return res.status(200).json({
        success: true, duplicate: true, orders: resolved.orders, consignment: resolved.consignment,
      });
    }

    const result = await executeLotCommit(resolved, ctx);
    if (result.json.committed) {
      await FpoLotRequest.updateOne(
        { _id: request._id },
        {
          $set: {
            status: 'accepted', respondedAt: new Date(), respondedBy: req.firebaseUid,
            resultOrderIds: result.json.orders.map((o) => o._id),
            resultConsignmentId: result.json.consignment?._id || null,
          },
        }
      );
    }
    // A commit failure (STOCK_MOVED / CONFIRM_FAILED) leaves the request
    // PENDING rather than marking it resolved — nothing was taken, so the
    // admin can simply try Accept again, or Reject it.
    res.status(result.httpStatus).json(result.json);
  } catch (err) {
    console.error('❌ FPO lot request accept error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/fpos/lot-requests/:id/reject — admin-only. Nothing was ever
 * taken from the market, so there is nothing to compensate — just a status
 * flip with an optional reason for the buyer.
 */
router.post('/lot-requests/:id/reject', requireAuth, requireRole(...FPO_ADMIN_ROLES), async (req, res) => {
  try {
    const request = await FpoLotRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, error: 'Not found' });

    const fpo = await loadAsAdmin(request.fpoId, req.firebaseUid, res, 'reject a buyer request for this group');
    if (!fpo) return;

    const updated = await FpoLotRequest.findOneAndUpdate(
      { _id: request._id, status: 'pending' },
      {
        $set: {
          status: 'rejected', respondedAt: new Date(), respondedBy: req.firebaseUid,
          rejectionReason: String(req.body?.reason || '').slice(0, 300),
        },
      },
      { new: true }
    );
    if (!updated)
      return res.status(409).json({ success: false, code: 'NOT_PENDING', error: 'This request is no longer pending.' });

    res.json({ success: true, request: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Land.size is recorded in whatever unit the farmer picked at registration;
// the yield benchmark is per HECTARE, so every size has to land on the same
// unit before it can be multiplied by a kg/ha figure. Returns null rather
// than guessing when the unit is missing or unrecognised — an excluded crop
// is honest, a hectare invented from nothing is not.
function toHectares(size) {
  if (!size || !Number.isFinite(size.value)) return null;
  switch (size.unit) {
    case 'hectares': return size.value;
    case 'acres':    return size.value * 0.404686;
    case 'sqm':       return size.value * 0.0001;
    case 'sqft':      return size.value * 0.0000092903;
    default: return null;
  }
}

/**
 * GET /api/fpos/:id/dashboard — admin-only.
 *
 * The FPO admin's one screen: what the group has on hand right now, what is
 * still growing, who its members are and what they've been paid, who wants
 * to buy their crops, what pooling transport has actually saved, where to
 * put a harvest, and what a season-wide settlement looks like.
 *
 * HONESTY RULE THAT SHAPES EVERY SECTION BELOW: the ten real seeded FPOs
 * have real members with real land and crops, and ZERO listings, orders or
 * consignments yet. Every section must say so plainly rather than error, or
 * worse, silently render a confident zero that reads as "confirmed empty
 * inventory" when it is actually "nothing has happened here yet".
 */
router.get('/:id/dashboard', requireAuth, async (req, res) => {
  try {
    const fpo = await Fpo.findById(req.params.id).lean();
    if (!fpo) return res.status(404).json({ success: false, error: 'Not found' });
    if (fpo.adminUid !== req.firebaseUid)
      return res.status(403).json({ success: false, error: 'Only the group admin can see this dashboard' });

    // A pending applicant is not yet a supplying member of this group — same
    // rule as every other read in this file.
    const activeMembers = fpo.members.filter((m) => m.status === 'active');
    const uids = activeMembers.map((m) => m.farmerUid);
    const nameByUid = new Map(activeMembers.map((m) => [m.farmerUid, m.farmerName]));

    // ── 1. produces aggregation ───────────────────────────────────────
    const [listings, memberCrops, allLands] = await Promise.all([
      CropListing.find({ farmerUid: { $in: uids }, status: 'available' })
        // minOrderKg and grade are read by the shared lot catalog below. Without
        // them the admin's view of a lot would be missing exactly the two fields
        // that decide whether a buyer can actually buy it.
        .sort({ _id: 1 })
        .select('cropName quantityAvailableKg pricePerKg minOrderKg farmerUid farmerName location grade').lean(),
      Crop.find({ firebaseUid: { $in: uids }, isHarvested: false, currentStage: { $ne: 'completed' } })
        .select('firebaseUid landId name').lean(),
      Land.find({ firebaseUid: { $in: uids }, isActive: true }).select('firebaseUid location size').lean(),
    ]);

    // Per-member delivery records, computed once and used twice: on the member
    // cards below and on each lot's contributors, so the admin sees the same
    // record the buyer does. trustService.forFarmer() refuses to band a farmer
    // below MIN_TRADES_TO_SCORE and returns counts instead — nothing invented.
    const trustByUid = new Map(
      await Promise.all(uids.map(async (uid) => [uid, await trustService.forFarmer(uid)]))
    );

    // THE SAME LOTS THE BUYER SEES, from the same function — grade-separated,
    // with the price spread, the minimum-order profile and each contributor's
    // trust record. The admin's view and GET /bundles must never disagree about
    // what the group holds, which is why this is one shared arithmetic and not
    // a second copy of it (same rule as computeSettlement()).
    //
    // The one deliberate difference: nothing here is truncated to MAX_BUNDLE.
    // No vehicle has been chosen on this screen, so every contributor is in
    // the lot and membersIncluded === membersAvailable. A buyer's catalog entry
    // for the same lot may show fewer, and its excludedLots names the rest —
    // included + excluded there equals the whole lot here.
    const availableLots = lotCatalog.buildLots(listings, { trustByUid });

    // The crop rollup, DERIVED from the lots rather than counted separately, so
    // the headline tonnage and the lot list cannot drift apart:
    //   availableNow[crop] === Σ totalKg of that crop's lots, across grades.
    // It stays crop → kg (a plain number) because it is a rollup ACROSS grades
    // and because Farmer/FpoDashboardScreen.jsx renders these entries as
    // quantities; the grade separation lives in availableLots beside it, where
    // it can carry the price spread and the disclaimer that a bare number
    // cannot.
    const availableNow = {};
    // One display name per crop, taken from the first lot of that crop (the
    // lots come back in a deterministic order), so two members who typed
    // "Onion" and "onion" roll up into ONE row instead of two.
    const cropDisplayName = new Map();
    for (const lot of availableLots) {
      if (!cropDisplayName.has(lot.cropKey)) cropDisplayName.set(lot.cropKey, lot.cropName);
      const name = cropDisplayName.get(lot.cropKey);
      availableNow[name] = (availableNow[name] || 0) + lot.totalKg;
    }

    const landById = new Map(allLands.map((l) => [String(l._id), l]));
    const estimatedIncoming = {};
    let excludedCropCount = 0;
    const excludedCrops = [];
    for (const c of memberCrops) {
      const land = landById.get(String(c.landId));
      if (!land) {
        excludedCropCount++;
        excludedCrops.push({
          farmerName: nameByUid.get(c.firebaseUid) || c.firebaseUid, cropName: c.name,
          reason: 'No land record found for this crop, so its area is unknown.',
        });
        continue;
      }
      const ha = toHectares(land.size);
      if (!ha) {
        excludedCropCount++;
        excludedCrops.push({
          farmerName: nameByUid.get(c.firebaseUid) || c.firebaseUid, cropName: c.name,
          reason: 'This land\'s area is recorded in a unit we cannot convert to hectares.',
        });
        continue;
      }
      const bench = yieldBenchmarkService.benchmarkFor(c.name, land.location?.district);
      if (!bench.available) {
        excludedCropCount++;
        excludedCrops.push({
          farmerName: nameByUid.get(c.firebaseUid) || c.firebaseUid, cropName: c.name,
          reason: bench.reason,
        });
        continue;
      }
      estimatedIncoming[c.name] = (estimatedIncoming[c.name] || 0) + bench.medianYieldKgPerHa * ha;
    }
    for (const k of Object.keys(estimatedIncoming)) estimatedIncoming[k] = Math.round(estimatedIncoming[k]);

    const totalAvailableTonnes = Math.round(
      Object.values(availableNow).reduce((a, v) => a + v, 0) / 100) / 10;
    const totalEstimatedTonnes = Math.round(
      Object.values(estimatedIncoming).reduce((a, v) => a + v, 0) / 100) / 10;

    const producesAggregation = {
      availableNow,
      // The same grade-separated lots GET /bundles offers buyers, minus the
      // vehicle constraint. One entry per (crop, grade); ungraded produce is
      // its own lot, never folded into a grade and never hidden.
      availableLots,
      gradeSeparated: true,
      ungradedLots: availableLots.filter((l) => l.ungraded).length,
      gradedLots: availableLots.filter((l) => !l.ungraded).length,
      estimatedIncoming,
      totalAvailableTonnes,
      totalEstimatedTonnes,
      excludedCropCount,
      excludedCrops,
      // ── ⚠️ HOW MUCH OF THE PICTURE THE FORECAST ACTUALLY COVERS ────────
      //
      // `excludedCrops` already NAMES every crop left out, which is the right
      // behaviour and predates this. What it does not do is say how big the
      // hole is, and an admin reading "estimated incoming: 4.2 tonnes" has no
      // way to tell whether that is most of their group's planting or a tenth
      // of it.
      //
      // Measured, not guessed: `scripts/measureIncomingModel.js` run against
      // this database found the ICRISAT lookup could price only 9 of 79 planted
      // crops — 11%. ICRISAT covers 25 of Maharashtra's 36 districts and
      // EXCLUDES cotton and sugarcane outright (it records sugarcane as gur and
      // cotton as lint, so both would read as plainly wrong), and those are two
      // of the commonest crops here. A forecast covering a tenth of the group
      // is not wrong, but presenting it without saying so would be.
      coverage: {
        cropsCounted: memberCrops.length - excludedCropCount,
        cropsPlanted: memberCrops.length,
        pct: memberCrops.length
          ? Math.round(((memberCrops.length - excludedCropCount) / memberCrops.length) * 100)
          : null,
        note: memberCrops.length === 0
          ? 'No members have a planted, unharvested crop registered, so there is nothing to forecast.'
          : `This forecast covers ${memberCrops.length - excludedCropCount} of `
            + `${memberCrops.length} of your members' planted crops. The rest are named in `
            + 'excludedCrops with the reason for each — most often that the yield dataset has no '
            + 'rows for that crop in that district. It is a floor under what is coming, not a '
            + 'total.',
      },
      note: 'availableNow is real inventory on the market right now. estimatedIncoming is a FORECAST built '
        + 'from planted-but-unharvested crops sized against each district\'s recorded yield benchmark — it is '
        + 'not inventory and the two figures are never summed into one blended number.',
      lotsNote: 'availableLots is what a buyer would be offered: one lot per crop AND grade, because a buyer '
        + 'paying for Grade A must not receive a blend. availableNow is the same stock rolled up across '
        + 'grades — availableNow[crop] equals the sum of that crop\'s lots. Produce nobody graded sits in an '
        + '"ungraded" lot, which is not a grade below C; declared grades are the members\' own claims and '
        + 'nobody has inspected any of them.',
    };

    // ── 2. member cards ────────────────────────────────────────────────
    const [memberOrders, users] = await Promise.all([
      Order.find({ farmerUid: { $in: uids }, status: 'delivered' })
        .select('farmerUid cropName quantityKg farmerPayout settlement').lean(),
      User.find({ firebaseUid: { $in: uids } }).select('firebaseUid location').lean(),
    ]);
    const userByUid = new Map(users.map((u) => [u.firebaseUid, u]));
    // First active land per farmer, for a village a farmer without a land
    // record simply won't have — City is the field this app actually stores
    // a village name in (see Land.location.city, and how the seed script
    // writes a farmer's village there).
    const landByUid = new Map();
    for (const l of allLands) if (!landByUid.has(l.firebaseUid)) landByUid.set(l.firebaseUid, l);

    // trustByUid was built in section 1 — the same records the lots carry.
    const memberCards = activeMembers.map((m) => {
      const mine = memberOrders.filter((o) => o.farmerUid === m.farmerUid);
      const unpaid = mine.filter((o) => !o.settlement?.farmerPaid);
      const land = landByUid.get(m.farmerUid);
      const user = userByUid.get(m.farmerUid);
      return {
        farmerUid: m.farmerUid,
        farmerName: m.farmerName,
        village: land?.location?.city || user?.location?.city || land?.location?.district || null,
        cropsSuppliedThisSeason: [...new Set(mine.map((o) => o.cropName))],
        totalKgSupplied: mine.reduce((a, o) => a + o.quantityKg, 0),
        totalEarned: mine.reduce((a, o) => a + (o.farmerPayout || 0), 0),
        unpaidOrders: unpaid.length,
        unpaidAmount: unpaid.reduce((a, o) => a + (o.farmerPayout || 0), 0),
        // trustService.forFarmer() already refuses to band below 3 completed
        // deliveries and reports counts instead — nothing invented here.
        trust: trustByUid.get(m.farmerUid) || null,
      };
    });

    // ── 3. buyer demand — reuses requirements.js's own matching rule ───
    const points = [
      ...listings.map((l) => toLatLng(l.location)),
      ...allLands.map((l) => toLatLng(l.location?.coordinates || l.location)),
    ].filter(Boolean);
    const groupCropNames = [...new Set([
      ...Object.keys(availableNow),
      ...memberCrops.map((c) => c.name),
    ])];

    let buyerDemand;
    if (!points.length) {
      buyerDemand = { requirements: [], reason: 'NO_LOCATION' };
    } else {
      const matched = await matchRequirementsForPoints(points, groupCropNames, {
        allCommodities: groupCropNames.length === 0,
      });
      buyerDemand = {
        requirements: matched.slice(0, 50).map((r) => ({ ...r, responses: undefined })),
        groupCrops: groupCropNames,
      };
    }

    // ── 4. logistics — consignments where every stop is one of ours ────
    const uidSet = new Set(uids);
    const consignments = uids.length
      ? await Consignment.find({ 'stops.farmerUid': { $in: uids } }).lean()
      : [];
    const groupConsignments = consignments.filter(
      (c) => c.stops.length > 0 && c.stops.every((s) => uidSet.has(s.farmerUid))
    );
    // `in_transit` is in progress: the vehicle has left the last farm and is
    // on its way to the buyer. Omitting it would silently drop the busiest
    // runs off the group's own dashboard the moment they became interesting.
    const IN_PROGRESS_STATUSES = ['awaiting_agent', 'accepted', 'collecting', 'in_transit'];
    const inProgress = groupConsignments.filter((c) => IN_PROGRESS_STATUSES.includes(c.status));
    const completed = groupConsignments.filter((c) => c.status === 'delivered');

    // Only a completed run with an actually-measured soloFareTotal counts
    // toward the saving — never approximated for a run missing it.
    let totalSaved = 0;
    let unmeasuredCompleted = 0;
    for (const c of completed) {
      if (typeof c.soloFareTotal === 'number' && c.fare && typeof c.fare.total === 'number') {
        totalSaved += c.soloFareTotal - c.fare.total;
      } else {
        unmeasuredCompleted++;
      }
    }

    const logistics = {
      inProgress: inProgress.map((c) => ({
        _id: c._id, status: c.status, stops: c.stops.length,
        totalQuantityKg: c.totalQuantityKg, vehicleType: c.vehicleType,
      })),
      completed: completed.map((c) => ({
        _id: c._id, stops: c.stops.length, totalQuantityKg: c.totalQuantityKg,
        vehicleType: c.vehicleType, fareTotal: c.fare?.total ?? null,
        soloFareTotal: c.soloFareTotal ?? null,
        saved: typeof c.soloFareTotal === 'number' && c.fare ? c.soloFareTotal - c.fare.total : null,
      })),
      totalSaved: Math.round(totalSaved),
      unmeasuredCompleted,
      note: groupConsignments.length
        ? 'Season-to-date saving from pooling transport, summed only over completed runs with a measured solo-trip comparison.'
        : 'No consignment yet has moved this group\'s crop as a shared run.',
    };

    // ── 5. storage suggestion — sized to availableNow, never invented ──
    const availableEntries = Object.entries(availableNow);
    let storageSuggestion;
    if (!availableEntries.length) {
      storageSuggestion = {
        available: false,
        reason: 'No live listings yet — nothing on hand to size a storage suggestion for.',
      };
    } else {
      const [dominantCrop, dominantKg] = availableEntries.sort((a, b) => b[1] - a[1])[0];
      const dominantListings = listings.filter((l) => l.cropName === dominantCrop);
      const avgPricePerKg = Math.round(
        (dominantListings.reduce((a, l) => a + l.pricePerKg * l.quantityAvailableKg, 0) / dominantKg) * 100
      ) / 100;

      const district = resolveDistrict(fpo.district) || fpo.district || null;
      let warehouses = district ? await Warehouse.find({ active: true, district }).lean() : [];
      if (!warehouses.length) warehouses = await Warehouse.find({ active: true }).lean();

      const anchor = toLatLng(listings.find((l) => toLatLng(l.location))?.location)
        || toLatLng(allLands.find((l) => toLatLng(l.location?.coordinates || l.location))?.location?.coordinates);

      const days = 14;
      const options = storageService.rankByDistance(warehouses, anchor).slice(0, 5).map((w) => {
        const fit = storageService.suitability(dominantCrop, w.type);
        if (!fit.suitable) {
          return { ...w, suitable: false, reason: fit.reason, storageCost: null, expectedLossPct: null };
        }
        const survive = storageService.survivalFraction(dominantCrop, w.type, days);
        return {
          ...w,
          suitable: true,
          weeklyLossPct: storageService.weeklyLossPct(dominantCrop, w.type),
          expectedLossPct: Math.round((1 - survive) * 1000) / 10,
          storageCost: storageService.storageCost(w.ratePerTonnePerMonth, dominantKg / 1000, days),
        };
      });

      storageSuggestion = {
        available: true,
        dominantCrop, dominantKg, avgPricePerKg,
        holdDays: days,
        options,
        note: `Sized to the group's current available stock of ${dominantCrop} (${dominantKg} kg) only — `
          + 'other crops on hand are not folded into this figure. Ring the godown before loading a vehicle, '
          + 'same as every storage suggestion elsewhere in this app.',
      };
    }

    // ── 6. season settlement — the /settlement math, group-wide ────────
    const seasonOrders = uids.length
      ? await Order.find({ farmerUid: { $in: uids } })
          .select('farmerUid farmerName cropName quantityKg cropTotal farmerPayout fare settlement status listingId')
          .lean()
      : [];

    // The SAME arithmetic as GET /:id/settlement, not a second copy of it —
    // two copies is two places for the fee-before-split ordering to be applied
    // differently, and a member reading one screen against the other would
    // have no way to tell which was right.
    const seasonGrades = fpo.paymentMode === 'procurement'
      ? await gradesForOrders(seasonOrders) : null;
    const seasonSettlement = {
      ...computeSettlement(fpo, activeMembers, seasonOrders, seasonGrades),
      seasonNote: seasonOrders.length
        ? 'This app has no concept of a "season" — this covers every order ever recorded for the '
          + 'group\'s active members, not a single crop cycle.'
        : 'This app has no concept of a "season" — this covers every order ever recorded for the '
          + 'group\'s active members, and none exist yet.',
      ...(seasonOrders.length ? {} : { note: 'No orders recorded yet for this group.' }),
    };

    // A pending buyer request is exactly the kind of thing an admin should
    // see the instant they land — same reasoning as pendingMemberCount. The
    // full list lives at GET /:id/lot-requests; this is just the count for
    // the dashboard's own stat row and badge.
    const pendingLotRequestCount = await FpoLotRequest.countDocuments({
      fpoId: fpo._id, status: 'pending',
    });

    res.json({
      success: true,
      dashboard: {
        fpoId: fpo._id, fpoName: fpo.name, district: fpo.district, village: fpo.village,
        activeMemberCount: activeMembers.length,
        // What the group says it deals in. Empty is NOT DECLARED, never "deals
        // in nothing" — `focusDeclared` is the field to branch on so a screen
        // cannot collapse the two. Advisory: it decides no membership, prices
        // nothing, and does not filter a single lot below.
        focusCrops: fpo.focusCrops || [],
        focusDeclared: (fpo.focusCrops || []).length > 0,
        pendingMemberCount: fpo.members.filter((m) => m.status === 'pending').length,
        pendingLotRequestCount,
        // Where the group's own godown is. `declared` is what a screen
        // branches on — absent coordinates must never read as "this group has
        // no premises", the same rule as focusDeclared beside focusCrops.
        // ⚠️ F0: no longer gates arranging a collection run (that capability is
        // retired — see POST /:id/collection-runs). The field itself stays: it
        // is still real, still settable via PUT /:id/premises, and still
        // worth a group stating for its own record even with no run to gate.
        premises: fpo.premises?.declared ? fpo.premises : { declared: false },
        producesAggregation,
        memberCards,
        buyerDemand,
        logistics,
        storageSuggestion,
        seasonSettlement,
      },
    });
  } catch (err) {
    console.error('❌ FPO dashboard error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

// Exported so scripts/testCollection.js can assert the reconciliation
// invariant — sum(per-member payouts) === memberPayableTotal — against REAL
// groups and REAL orders, rather than re-implementing the fee ordering in the
// test and thereby testing a second copy of the thing under test. Same reason
// routes/consignments.js exports orderStops and splitFare.
module.exports.computeSettlement = computeSettlement;

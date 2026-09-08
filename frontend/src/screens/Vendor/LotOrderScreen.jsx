import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import {
  nf, money, perKg, kgs, kms, pcts,
  gradeVisual, EXCLUSION_LABEL, INFEASIBLE_LABEL, LIMITED_BY_LABEL,
} from '../../utils/lotDisplay';

// BUYING ONE GRADE LOT: QUOTE, THEN REQUEST — AND THE FPO DECIDES.
//
// Quote and request are separate steps because THE PRICE DOES NOT EXIST
// BEFORE THE ALLOCATION DOES. Members inside one lot ask different ₹/kg and
// each is paid their own, so what this costs depends on which of them the
// quantity actually draws from. That is the backend's stated reason for
// POST /lots/quote existing at all, and this screen is built around it
// rather than around a price the catalog could have shown up front.
//
// ⚠️ "CONFIRM" NO LONGER COMMITS ANYTHING. This screen used to POST straight
// to /lots/confirm and the sale happened instantly. It now posts to
// /lots/request: the FPO's own admin sees exactly this allocation and taps
// Accept or Reject, and only Accept ever takes stock or writes an Order. The
// button below still reads roughly the same to a buyer, but nothing is
// bought until the group responds.
//
// FOUR THINGS THIS SCREEN OWES THE BUYER, all of them because the server said
// them first and a screen that swallowed them would undo the honesty:
//
//   1. A QUOTE IS NOT A HOLD. `reservation.reserved` is false on every quote —
//      nothing is written, nothing is reserved, and the kilograms stay on the
//      market. Said at the top of the quote, not in a footnote.
//   2. AN IMPOSSIBLE QUANTITY IS ANSWERED, NOT JUST REFUSED. A 409 carries
//      `nearestBelowKg` / `nearestAboveKg` / `alternativesKg` / `maxFillableKg`
//      / `limitedBy` / `fillableRanges`. Those become TAPPABLE quantities. With
//      floors 500/800/1,000 against stocks 600/900/1,200, 2,200 kg is genuinely
//      uncomposable while 2,100 and 2,300 are both fine — a red toast would
//      leave the buyer guessing which is which.
//   3. EXCLUDED MEMBERS ARE VISIBLE. The allocation service is fair inside one
//      order and blind across orders, and it says so; the only thing making that
//      pattern legible is `excluded[]` with a reason per member. It is rendered.
//   4. A FAILED CONFIRM SAYS WHETHER ANYTHING WAS BOUGHT. Every refusal path
//      here commits nothing and the server says `committed: false` — so the
//      buyer is told that in words instead of being left to wonder whether they
//      have been charged.
//
// The confirm sends `quoteRef` (the server's own If-Match digest — a client
// allocation or price is ignored) and an `idempotencyKey` minted once per
// quote, so a double-tap returns the order that was already made rather than
// making a second one.


const shortId = (id) => String(id || '').slice(-6).toUpperCase();

const PAYMENT_MODE_TEXT = {
  facilitation: 'This group markets its members\' produce and takes a fee. Each member is paid their '
    + 'own asking price for the kilograms you buy, less their share of that fee.',
  procurement: 'This group BUYS its members\' crop at an agreed per-grade rate and resells it. Members '
    + 'are paid that agreed rate for their kilograms, whatever this sale fetched.',
};

/** A quantity the lot CAN fill, offered as a tap. */
const AltChip = ({ value, onPick }) => (
  <TouchableOpacity style={s.altChip} onPress={() => onPick(value)} activeOpacity={0.8}>
    <Ionicons name="return-down-forward-outline" size={13} color="#15803D" />
    <Text style={s.altChipText}>{kgs(value)}</Text>
  </TouchableOpacity>
);

/** Every member the order left out, with the server's own sentence for why. */
const Excluded = ({ rows }) => {
  if (!rows || !rows.length) return null;
  return (
    <View style={s.block}>
      <Text style={s.blockHead}>LEFT OUT OF THIS ORDER · {nf(rows.length)}</Text>
      {rows.map((x, i) => (
        <View key={`${String(x.listingId || x.farmerUid || i)}`} style={s.exRow}>
          <Text style={s.exName}>
            {x.farmerName || 'A member'}
            {x.quantityKg != null ? ` · ${kgs(x.quantityKg)}` : ''}
            {x.pricePerKg != null ? ` · ${perKg(x.pricePerKg)}` : ''}
          </Text>
          <Text style={s.exReason}>{EXCLUSION_LABEL[x.reason] || x.reason}</Text>
          {!!x.detail && <Text style={s.exDetail}>{x.detail}</Text>}
        </View>
      ))}
      <Text style={s.blockNote}>
        Who a sale draws on is a decision about real income. It is shown rather than hidden — the rule
        is fair inside this one order and remembers nothing across orders.
      </Text>
    </View>
  );
};

/**
 * A QUANTITY THE LOT CANNOT FILL — answered with quantities it can.
 *
 * This is the most useful thing on the screen when a buyer picks an impossible
 * number, so it gets the server's whole guidance payload and not a toast.
 */
const Refusal = ({ data, onPick }) => {
  const alts = (data.alternativesKg || []).filter((v) => v != null);
  const ranges = data.fillableRanges || [];
  const gaps = data.gaps || [];

  return (
    <View style={s.refusal}>
      <View style={s.refusalHead}>
        <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
        <Text style={s.refusalTitle}>
          {INFEASIBLE_LABEL[data.code] || 'This quantity cannot be ordered'}
        </Text>
      </View>

      {!!data.error && <Text style={s.refusalBody}>{data.error}</Text>}

      {alts.length > 0 && (
        <View style={s.altWrap}>
          <Text style={s.altHead}>THESE WOULD WORK — TAP TO RE-QUOTE</Text>
          <View style={s.altRow}>
            {alts.map((v) => <AltChip key={String(v)} value={v} onPick={onPick} />)}
          </View>
        </View>
      )}

      {(data.maxFillableKg != null || data.smallestOrderKg != null) && (
        <View style={s.factRow}>
          {data.smallestOrderKg != null && (
            <View style={s.fact}>
              <Text style={s.factLabel}>SMALLEST</Text>
              <Text style={s.factValue}>{kgs(data.smallestOrderKg)}</Text>
            </View>
          )}
          {data.maxFillableKg != null && (
            <View style={s.fact}>
              <Text style={s.factLabel}>MOST IN ONE RUN</Text>
              <Text style={s.factValue}>{kgs(data.maxFillableKg)}</Text>
            </View>
          )}
          {data.totalAvailableKg != null && (
            <View style={s.fact}>
              <Text style={s.factLabel}>FARMS HOLD</Text>
              <Text style={s.factValue}>{kgs(data.totalAvailableKg)}</Text>
            </View>
          )}
        </View>
      )}

      {!!data.limitedBy && (
        <Text style={s.refusalNote}>
          Limited by {LIMITED_BY_LABEL[data.limitedBy] || data.limitedBy}. The purchase is never
          quietly trimmed to fit, and it is not split across two runs.
        </Text>
      )}

      {ranges.length > 0 && (
        <View style={s.altWrap}>
          <Text style={s.altHead}>QUANTITIES THIS LOT CAN COMPOSE</Text>
          <Text style={s.rangeText}>
            {ranges
              .map((r) => (r.fromKg === r.toKg
                ? kgs(r.fromKg)
                : `${nf(r.fromKg)} – ${nf(r.toKg)} kg`))
              .join('   ·   ')}
          </Text>
          <Text style={s.refusalNote}>
            Each member sells either nothing or at least their own minimum, so the fillable quantities
            have real gaps between them.
          </Text>
        </View>
      )}

      {gaps.length > 0 && (
        <View style={s.altWrap}>
          <Text style={s.altHead}>NO AGREED RATE ON FILE</Text>
          {gaps.map((g, i) => (
            <Text key={`${g.crop || ''}-${g.grade || i}`} style={s.refusalNote}>
              • {g.crop || 'This crop'}
              {g.grade ? ` · grade ${g.grade}` : ' · no grade declared'} — {g.reason}
            </Text>
          ))}
          <Text style={s.refusalNote}>
            The lot is not priced at zero and does not fall back to the members&apos; asking prices.
          </Text>
        </View>
      )}

      <Excluded rows={data.excluded} />
    </View>
  );
};

export default function LotOrderScreen({ navigation, route }) {
  const { lot, dropoff, userData } = route.params || {};

  // ── every hook lives here, above the early return below ────────────────
  const [qty, setQty] = useState(
    lot && lot.minOrder && lot.minOrder.smallestOrderKg != null
      ? String(lot.minOrder.smallestOrderKg) : ''
  );
  const [quote, setQuote] = useState(null);
  const [refusal, setRefusal] = useState(null);     // a 409 from the quote
  const [quoting, setQuoting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [placed, setPlaced] = useState(null);       // the 201
  const [failure, setFailure] = useState(null);     // a confirm that bought nothing
  // One key per QUOTE. A double-tap on Confirm returns the order already made;
  // two genuine purchases of the same lot get different keys and both go
  // through. Deriving it from quoteRef alone would collide on the second.
  const idem = useRef(null);

  const bodyFor = useCallback((quantityKg) => ({
    lotKey: lot && lot.lotKey,
    quantityKg,
    dropoff: {
      lat: dropoff && dropoff.lat,
      lng: dropoff && dropoff.lng,
      label: (dropoff && dropoff.label) || 'Delivery point',
      city: (dropoff && dropoff.city) || '',
      district: (dropoff && dropoff.district) || '',
    },
  }), [lot, dropoff]);

  const askQuote = useCallback(async (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('How many kilograms?', 'Enter the quantity you want from this lot.');
      return;
    }
    setQty(String(n));
    setQuoting(true);
    setRefusal(null);
    setFailure(null);
    try {
      const r = await axios.post(`${API_ENDPOINTS.FPOS}/lots/quote`, bodyFor(n), { timeout: 30000 });
      if (r.data.success) {
        setQuote(r.data.quote);
        setPlaced(null);
        idem.current = `${userData?.uid || 'v'}-${r.data.quote.quoteRef}-${Date.now().toString(36)}`;
      }
    } catch (e) {
      setQuote(null);
      const d = e.response?.data;
      // The 409 body IS the guidance. Kept whole and rendered, not flattened
      // into a message string.
      setRefusal(d || {
        code: 'NETWORK',
        error: 'Could not reach the server, so nothing was quoted. Nothing has been ordered either.',
      });
    } finally {
      setQuoting(false);
    }
  }, [bodyFor, userData]);

  // ── THE ADVANCE, AS A PERCENTAGE ────────────────────────────────────────
  //
  // ⚠️ A PERCENTAGE AND NOT A RUPEE FIGURE, and the server refuses a flat
  // amount here (400 ADVANCE_MUST_BE_PCT). One lot purchase becomes N orders
  // with N different line totals — every member sets their own ₹/kg — so a flat
  // "₹20,000 advance" has no fair division across them: split by value it is
  // arbitrary, split evenly it underpays the biggest contributor. A percentage
  // of each farmer's OWN line is the only split that is fair to all of them and
  // still reconciles to the figure shown here.
  //
  // Default 0, which is exactly what this screen did before.
  const [advancePct, setAdvancePct] = useState(0);

  // ⚠️ POSTS TO /lots/request, NOT /lots/confirm. Nothing is bought here —
  // the FPO admin accepts or rejects it, and only an accept ever takes stock
  // or writes an Order. STOCK_MOVED cannot happen at this step (nothing has
  // been taken yet) — it can only show up later, on the request's own status,
  // if the admin's accept finds the world has moved (surfaced as `stale`).
  const confirm = useCallback(async () => {
    if (!quote || confirming) return;
    setConfirming(true);
    setFailure(null);
    try {
      const r = await axios.post(`${API_ENDPOINTS.FPOS}/lots/request`, {
        ...bodyFor(quote.requestedKg),
        // The server's own digest over its own quote. It re-derives everything
        // and ignores any allocation or price a client sends.
        quoteRef: quote.quoteRef,
        idempotencyKey: idem.current,
        vendorCompany: userData?.company || userData?.name,
        ...(advancePct > 0 ? { advancePct } : {}),
      }, { timeout: 40000 });

      if (r.data.success) {
        setPlaced(r.data);
        setQuote(null);
        setRefusal(null);
      }
    } catch (e) {
      const d = e.response?.data;

      if (!d) {
        // No response at all. This is the ONE case where the outcome is
        // genuinely unknown, and the buyer is told exactly that.
        setFailure({
          kind: 'unknown',
          title: 'We could not tell whether that went through',
          body: 'The server did not answer. Your request carried a one-time key, so tapping Send '
            + 'again cannot create a second request — it returns the one already made. Check My '
            + 'Orders if you would rather not retry.',
        });
      } else if (d.code === 'QUOTE_STALE') {
        // Stock moved, a price was edited, a member left, or the group changed
        // its payment terms. NOTHING was bought. The server sends back what the
        // lot looks like now, and it is shown UNDER the warning rather than
        // swapped in silently — the numbers have changed.
        setFailure({
          kind: 'stale',
          title: 'Could not send the request — this lot changed after you were quoted',
          body: d.error,
        });
        if (d.quote) {
          setQuote(d.quote);
          idem.current = `${userData?.uid || 'v'}-${d.quote.quoteRef}-${Date.now().toString(36)}`;
        } else {
          setQuote(null);
        }
      } else if (d.code === 'CONFIRM_IN_FLIGHT') {
        setFailure({
          kind: 'inflight',
          title: 'That request is already part-written',
          body: d.error || 'Nothing new was created. Check My Orders before trying again.',
        });
      } else if (d.committed === false) {
        // The server re-derived, refused, and wrote nothing: an infeasible
        // quantity, a missing procurement rate, or an unroutable run.
        setFailure({
          kind: 'nothing',
          title: 'Could not send the request',
          body: d.error || 'The request could not be completed, so nothing was sent.',
        });
        setQuote(null);
        if (d.maxFillableKg != null || d.gaps || d.alternativesKg) setRefusal(d);
      } else {
        setFailure({
          kind: 'unknown',
          title: 'Could not send the request',
          body: d.error || 'Please ask for a fresh quote.',
        });
      }
    } finally {
      setConfirming(false);
    }
  }, [quote, confirming, bodyFor, userData]);

  // ── the only early return, and every hook above it ─────────────────────
  if (!lot || !dropoff) {
    return (
      <View style={s.center}>
        <Ionicons name="help-circle-outline" size={34} color="#9CA3AF" />
        <Text style={s.emptyTitle}>No lot to order</Text>
        <Text style={s.emptySub}>Go back and pick a lot, and a place to deliver it.</Text>
      </View>
    );
  }

  const g = gradeVisual(lot);
  const transport = (quote && quote.transport) || {};
  const payment = (quote && quote.payment) || {};

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── what is being bought ─────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.chipRow}>
          <View
            style={[s.gradeChip, g.dashed && s.gradeChipUngraded, {
              backgroundColor: g.bg,
              borderColor: g.border,
              borderStyle: g.dashed ? 'dashed' : 'solid',
            }]}
          >
            <Ionicons name={g.icon} size={13} color={g.fg} />
            <Text style={[s.gradeChipText, { color: g.fg }]}>{g.label}</Text>
          </View>
          {g.declared && g.selfDeclared && (
            <View style={s.selfChip}>
              <Ionicons name="eye-off-outline" size={11} color="#64748B" />
              <Text style={s.selfChipText}>SELF-DECLARED</Text>
            </View>
          )}
        </View>
        {!!g.subline && <Text style={s.gradeSub}>{g.subline}</Text>}

        <Text style={s.crop}>{lot.cropName}</Text>
        <Text style={s.fpo}>
          {lot.fpoName}
          {lot.village ? ` · ${lot.village}` : ''}
          {lot.district ? ` · ${lot.district}` : ''}
        </Text>
        <Text style={s.meta}>
          Delivering to {(dropoff && dropoff.label) || `${dropoff.lat}, ${dropoff.lng}`}
        </Text>
        {g.declared && !!g.disclaimer && <Text style={s.disclaimer}>{g.disclaimer}</Text>}
      </View>

      {/* ── the quantity ─────────────────────────────────────────────────── */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>How much do you want?</Text>
        <Text style={s.sectionSub}>
          The price depends on WHICH members your quantity draws from — they ask different ₹/kg and
          each is paid their own. That is why this has to be quoted before it can be ordered.
        </Text>
        <View style={s.qtyRow}>
          <TextInput
            style={s.qtyInput}
            value={qty}
            onChangeText={setQty}
            keyboardType="number-pad"
            placeholder="Kilograms"
            placeholderTextColor="#9CA3AF"
            returnKeyType="done"
            onSubmitEditing={() => askQuote(qty)}
          />
          <Text style={s.qtyUnit}>kg</Text>
          <TouchableOpacity
            style={[s.qtyGo, quoting && s.qtyGoOff]}
            onPress={() => askQuote(qty)}
            disabled={quoting}
            activeOpacity={0.85}
          >
            {quoting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.qtyGoText}>Quote it</Text>}
          </TouchableOpacity>
        </View>
        {lot.minOrder && lot.minOrder.smallestOrderKg != null && (
          <Text style={s.sectionSub}>
            {kgs(lot.minOrder.smallestOrderKg)} is the smallest any one member here accepts. Quantities
            above it are not automatically fillable — each farmer keeps their own minimum.
          </Text>
        )}
      </View>

      {/* ── a confirm that bought NOTHING, said plainly ───────────────────── */}
      {!!failure && (
        <View style={[s.card, s.failCard]}>
          <View style={s.failHead}>
            <Ionicons
              name={failure.kind === 'unknown' ? 'help-circle-outline' : 'close-circle-outline'}
              size={19}
              color="#B91C1C"
            />
            <Text style={s.failTitle}>{failure.title}</Text>
          </View>
          <Text style={s.failBody}>{failure.body}</Text>

          {!!failure.failedOn && (
            <Text style={s.failDetail}>
              {failure.failedOn.farmerName || 'One member'} ·{' '}
              {kgs(failure.failedOn.quantityKg)} was already gone.
            </Text>
          )}
          {Array.isArray(failure.rolledBack) && failure.rolledBack.length > 0 && (
            <Text style={s.failDetail}>
              {nf(failure.rolledBack.length)} part-taken listing
              {failure.rolledBack.length === 1 ? '' : 's'} put back in full. No order exists and
              nothing is owed for this attempt.
            </Text>
          )}

          {failure.kind !== 'unknown' && failure.kind !== 'inflight' && (
            <TouchableOpacity
              style={s.failBtn}
              onPress={() => askQuote(qty)}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-outline" size={15} color="#fff" />
              <Text style={s.failBtnText}>Get a fresh quote</Text>
            </TouchableOpacity>
          )}
          {failure.kind === 'inflight' && (
            <TouchableOpacity
              style={s.failBtn}
              onPress={() => navigation.navigate('VendorOrders', { userData })}
              activeOpacity={0.85}
            >
              <Ionicons name="receipt-outline" size={15} color="#fff" />
              <Text style={s.failBtnText}>Check My Orders</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── an impossible quantity, answered ─────────────────────────────── */}
      {!!refusal && <Refusal data={refusal} onPick={(v) => askQuote(v)} />}

      {/* ── the quote ────────────────────────────────────────────────────── */}
      {!!quote && (
        <>
          {/* A QUOTE IS NOT A HOLD. Top of the quote, not a footnote. */}
          <View style={s.holdBox}>
            <Ionicons name="lock-open-outline" size={17} color="#B45309" />
            <View style={{ flex: 1 }}>
              <Text style={s.holdTitle}>
                {quote.reservation && quote.reservation.reserved
                  ? 'Reserved'
                  : 'This is a quote, not a hold — nothing is reserved for you'}
              </Text>
              <Text style={s.holdText}>
                {(quote.reservation && quote.reservation.note)
                  || 'Every kilogram named here stays on the market until you confirm.'}
              </Text>
            </View>
          </View>

          <View style={s.card}>
            <Text style={s.sectionTitle}>
              Who would supply your {kgs(quote.allocatedKg)}
            </Text>
            <Text style={s.sectionSub}>
              {nf(quote.membersIncluded)} member{quote.membersIncluded === 1 ? '' : 's'}, each paid
              their own asking price.
            </Text>

            {(quote.allocation || []).map((r) => (
              <View key={String(r.listingId)} style={s.allocRow}>
                <View style={s.allocHead}>
                  <Text style={s.allocName}>
                    {r.pickupSequence != null ? `${r.pickupSequence + 1}. ` : ''}
                    {r.farmerName || 'Member'}
                  </Text>
                  <Text style={s.allocLine}>{money(r.buyerLineTotal)}</Text>
                </View>
                <Text style={s.allocMeta}>
                  {kgs(r.quantityKg)} at {perKg(r.pricePerKg)} = {money(r.lineTotal)}
                  {r.fareShare != null ? ` + ${money(r.fareShare)} of the vehicle` : ''}
                </Text>
                <Text style={s.allocMeta}>
                  {pcts(r.shareOfOrderPct)} of your order · they hold {kgs(r.availableKg)} · they sell
                  from {kgs(r.minOrderKg)}
                </Text>
                <Text style={s.allocOwed}>
                  {`${r.farmerName || 'This member'} is owed `}{money(r.amount)}
                  {r.payoutBasis === 'agreed_procurement_rate'
                    ? ' at the group\'s agreed rate'
                    : r.fpoFee
                      ? ` (${money(r.grossAmount)} less ${money(r.fpoFee)} group fee)`
                      : ''}
                </Text>
              </View>
            ))}

            <View style={s.totals}>
              <View style={s.totalRow}>
                <Text style={s.totalKey}>Crop, at the members&apos; own prices</Text>
                <Text style={s.totalVal}>{money(quote.cropTotal)}</Text>
              </View>
              <View style={s.totalRow}>
                <Text style={s.totalKey}>
                  Collection · one {String(transport.vehicleType || 'vehicle')} ·{' '}
                  {nf(transport.stops || 0)} stop{transport.stops === 1 ? '' : 's'} ·{' '}
                  {kms(transport.distanceKm)}
                </Text>
                <Text style={s.totalVal}>{money(transport.fare && transport.fare.total)}</Text>
              </View>
              <View style={[s.totalRow, s.grandRow]}>
                <Text style={s.grandKey}>You pay</Text>
                <Text style={s.grandVal}>{money(quote.buyerTotal)}</Text>
              </View>

              {/* ── ADVANCE ───────────────────────────────────────────────
                  This is the largest purchase this app supports and the one
                  where the farmers were most exposed: several of them hand over
                  tonnes against a record of a promise from one buyer they have
                  never met. An advance splits that exposure rather than moving
                  it onto the buyer, which would need escrow this app has none
                  of. */}
              <View style={s.advBlock}>
                <Text style={s.advTitle}>Advance to the farmers</Text>
                <Text style={s.advSub}>
                  A share of each farmer&apos;s own line, paid now. The balance is due after
                  delivery. Every contributing farmer gets the same percentage of what they are
                  individually owed.
                </Text>
                <View style={s.advRow}>
                  {[0, 10, 25, 50].map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[s.advChip, advancePct === p && s.advChipOn]}
                      onPress={() => setAdvancePct(p)}
                      activeOpacity={0.85}
                    >
                      <Text style={[s.advChipText, advancePct === p && s.advChipTextOn]}>
                        {p === 0 ? 'None' : `${p}%`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {advancePct > 0 ? (
                  <>
                    <View style={s.totalRow}>
                      <Text style={s.totalKey}>Advance now, across all farmers</Text>
                      <Text style={s.totalVal}>
                        {money(Math.round((quote.cropTotal * advancePct) / 100))}
                      </Text>
                    </View>
                    <View style={s.totalRow}>
                      <Text style={s.totalKey}>Balance after delivery</Text>
                      <Text style={s.totalVal}>
                        {money(quote.cropTotal - Math.round((quote.cropTotal * advancePct) / 100))}
                      </Text>
                    </View>
                    <Text style={s.advWarn}>
                      This app records payments — it does not move them. If the FPO accepts, this
                      advance is agreed with each farmer; you pay them directly and each of them
                      confirms it when it reaches them.
                    </Text>
                  </>
                ) : (
                  <Text style={s.advWarn}>
                    With no advance, every contributing farmer carries the full value of their own
                    lot from the moment it leaves their gate until you pay them.
                  </Text>
                )}
              </View>
            </View>

            {transport.saving != null && (
              <View style={transport.saving > 0 ? s.saveBox : s.warnBox}>
                <Ionicons
                  name={transport.saving > 0 ? 'trending-down-outline' : 'alert-circle-outline'}
                  size={16}
                  color={transport.saving > 0 ? '#15803D' : '#B45309'}
                />
                <Text style={transport.saving > 0 ? s.saveText : s.warnText}>
                  {transport.saving > 0
                    ? `${money(transport.saving)} less than collecting these farms separately `
                      + `(${money(transport.soloFareTotal)}).`
                    : `Pooling these farms is NOT cheaper here — separate trips would cost `
                      + `${money(transport.soloFareTotal)}.`}
                </Text>
              </View>
            )}

            {!!transport.splitNote && <Text style={s.fine}>{transport.splitNote}</Text>}
            {!!(quote.reconciliation && quote.reconciliation.note) && (
              <Text style={s.fine}>{quote.reconciliation.note}</Text>
            )}
          </View>

          {/* ── what the members get, under this group's own arrangement ─── */}
          {!!payment.paymentMode && (
            <View style={s.card}>
              <Text style={s.sectionTitle}>
                What the members are paid
                <Text style={s.modeTag}>  {payment.paymentMode.toUpperCase()}</Text>
              </Text>
              <Text style={s.sectionSub}>
                {PAYMENT_MODE_TEXT[payment.paymentMode] || payment.note || ''}
              </Text>
              <View style={s.totalRow}>
                <Text style={s.totalKey}>Total payable to members</Text>
                <Text style={s.totalVal}>{money(payment.memberPayableTotal)}</Text>
              </View>
              {/* `fpoPosition` is an object, not a number — its `margin` is the
                  figure, and it is genuinely negative when a procurement group
                  promised its members more than the lot fetched. Reported, not
                  clamped, the same way the backend reports it. */}
              {!!payment.fpoPosition && payment.fpoPosition.margin != null && (
                <View style={s.totalRow}>
                  <Text style={s.totalKey}>
                    {payment.paymentMode === 'procurement'
                      ? 'The group’s own margin on this sale'
                      : 'The group’s fee'}
                  </Text>
                  <Text style={s.totalVal}>{money(payment.fpoPosition.margin)}</Text>
                </View>
              )}
              {!!payment.fpoPosition && !!payment.fpoPosition.note && (
                <Text style={s.fine}>{payment.fpoPosition.note}</Text>
              )}
              <Text style={s.fine}>
                This is computed by the same function the members&apos; own settlement screen uses, so
                the two cannot disagree. The app records a settlement — it does not move money.
              </Text>
            </View>
          )}

          <Excluded rows={quote.excluded} />

          {!!quote.policyNote && (
            <View style={s.card}>
              <Text style={s.blockHead}>HOW THESE MEMBERS WERE CHOSEN</Text>
              <Text style={s.fine}>{quote.policyNote}</Text>
              {!!quote.fairnessRisk && <Text style={s.fine}>{quote.fairnessRisk}</Text>}
            </View>
          )}

          {!!quote.crossLotNote && (
            <Text style={s.footNote}>{quote.crossLotNote}</Text>
          )}

          <TouchableOpacity
            style={[s.cta, confirming && s.ctaOff]}
            onPress={confirm}
            disabled={confirming}
            activeOpacity={0.85}
          >
            {confirming ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="paper-plane-outline" size={18} color="#fff" />
                <Text style={s.ctaText}>Send to FPO for approval · {money(quote.buyerTotal)}</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={s.footNote}>
            This does not buy anything yet — the FPO's own admin sees this exact allocation and must
            Accept it. If anything moves before they respond, the accept is refused and nothing is
            bought.
          </Text>
        </>
      )}

      {/* ── it went through ──────────────────────────────────────────────── */}
      {/* ⚠️ NOTHING IS BOUGHT YET. `placed` here is the response to
          POST /lots/request — a pending request, not an order. No Order or
          Consignment exists until the FPO admin accepts it, so this renders
          the QUOTE's own allocation (what WOULD happen) rather than pretending
          a purchase already occurred. */}
      {!!placed && (
        <View style={[s.card, s.doneCard]}>
          <View style={s.doneHead}>
            <Ionicons
              name={placed.duplicate ? 'checkmark-circle' : 'time-outline'}
              size={26}
              color={placed.duplicate ? '#15803D' : '#B45309'}
            />
            <Text style={s.doneTitle}>
              {placed.duplicate ? 'Already sent' : 'Sent to the FPO for approval'}
            </Text>
          </View>

          {placed.duplicate ? (
            <Text style={s.doneNote}>
              This request had already gone through. These are the orders it made — nothing was
              bought twice.
            </Text>
          ) : (
            <Text style={s.doneNote}>{placed.note}</Text>
          )}

          {placed.duplicate ? (
            <>
              <Text style={s.doneLine}>
                {nf((placed.orders || []).length)} farmer order
                {(placed.orders || []).length === 1 ? '' : 's'} created — one per contributing farmer,
                so each has their own settlement, dispute and receipt.
              </Text>
              {(placed.orders || []).map((o) => (
                <View key={String(o._id)} style={s.doneRow}>
                  <Text style={s.doneRowName}>{o.farmerName || 'Member'}</Text>
                  <Text style={s.doneRowMeta}>
                    {kgs(o.quantityKg)} {o.cropName} at {perKg(o.pricePerKg)} · {money(o.grandTotal)} ·
                    order {shortId(o._id)}
                  </Text>
                </View>
              ))}
            </>
          ) : (
            <>
              <Text style={s.doneLine}>
                If accepted, this draws from {nf((placed.quote?.allocation || []).length)} farmer
                {(placed.quote?.allocation || []).length === 1 ? '' : 's'} — one order per contributing
                farmer, as with every purchase here.
              </Text>
              {(placed.quote?.allocation || []).map((r) => (
                <View key={String(r.listingId || r.farmerUid)} style={s.doneRow}>
                  <Text style={s.doneRowName}>{r.farmerName || 'Member'}</Text>
                  <Text style={s.doneRowMeta}>
                    {kgs(r.quantityKg)} {placed.lot?.cropName} at {perKg(r.pricePerKg)} ·
                    {' '}{money(r.buyerLineTotal)}
                  </Text>
                </View>
              ))}
              <View style={s.runBox}>
                <Text style={s.runHead}>IF ACCEPTED</Text>
                <Text style={s.runLine}>
                  Collection · one {String(placed.quote?.transport?.vehicleType || 'vehicle')} ·{' '}
                  {kms(placed.quote?.transport?.distanceKm)}
                </Text>
                <Text style={s.runNote}>
                  {placed.quote?.transport?.dispatched
                    ? 'Offered to the captain pool the moment the FPO accepts.'
                    : "Arranged by the FPO's own transport."}
                </Text>
              </View>
            </>
          )}

          {/* A duplicate replays the ORDERS it already made and carries no
              `buyerTotal`. Otherwise this is what the buyer would pay IF the
              request is accepted — not a charge that has happened. */}
          {placed.buyerTotal != null && (
            <View style={[s.totalRow, s.grandRow]}>
              <Text style={s.grandKey}>Paid</Text>
              <Text style={s.grandVal}>{money(placed.buyerTotal)}</Text>
            </View>
          )}
          {!placed.duplicate && placed.quote?.buyerTotal != null && (
            <View style={[s.totalRow, s.grandRow]}>
              <Text style={s.grandKey}>If accepted, you pay</Text>
              <Text style={s.grandVal}>{money(placed.quote.buyerTotal)}</Text>
            </View>
          )}

          <TouchableOpacity
            style={s.cta}
            onPress={() => navigation.navigate('VendorOrders', { userData })}
            activeOpacity={0.85}
          >
            <Ionicons name="receipt-outline" size={17} color="#fff" />
            <Text style={s.ctaText}>
              {placed.duplicate ? 'View my orders' : 'Check request status'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F8FAFC', padding: 30,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 10 },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 5, lineHeight: 19 },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },

  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  gradeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4,
  },
  gradeChipText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  // Square corners as well as a dashed edge — Android drops a dashed border on
  // a fully rounded pill, and the ungraded chip must stay visibly not-a-grade.
  gradeChipUngraded: { borderRadius: 8 },
  selfChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
    paddingHorizontal: 8, paddingVertical: 4,
  },
  selfChipText: { fontSize: 9.5, fontWeight: '800', color: '#64748B', letterSpacing: 0.4 },
  gradeSub: { fontSize: 11.5, color: '#64748B', marginTop: 5, lineHeight: 16 },

  crop: { fontSize: 19, fontWeight: '900', color: '#111827', marginTop: 9 },
  fpo: { fontSize: 13.5, fontWeight: '700', color: '#374151', marginTop: 2 },
  meta: { fontSize: 12, color: '#6B7280', marginTop: 3 },
  disclaimer: { fontSize: 11, color: '#94A3B8', marginTop: 7, lineHeight: 15.5 },

  sectionTitle: { fontSize: 15.5, fontWeight: '800', color: '#111827' },
  sectionSub: { fontSize: 12, color: '#6B7280', marginTop: 5, lineHeight: 17 },
  modeTag: { fontSize: 10, fontWeight: '800', color: '#16A34A', letterSpacing: 0.5 },

  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11 },
  qtyInput: {
    flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, fontWeight: '700',
    color: '#111827', backgroundColor: '#fff',
  },
  qtyUnit: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  qtyGo: {
    backgroundColor: '#16A34A', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12,
    minWidth: 96, alignItems: 'center', justifyContent: 'center',
  },
  qtyGoOff: { backgroundColor: '#86EFAC' },
  qtyGoText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  holdBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 9,
    backgroundColor: '#FEF3C7', borderRadius: 14, padding: 13,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  holdTitle: { fontSize: 13.5, fontWeight: '800', color: '#92400E' },
  holdText: { fontSize: 11.5, color: '#7C2D12', marginTop: 4, lineHeight: 16.5 },

  refusal: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  refusalHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refusalTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: '#92400E' },
  refusalBody: { fontSize: 13, color: '#374151', marginTop: 9, lineHeight: 19 },
  refusalNote: { fontSize: 11.5, color: '#6B7280', marginTop: 6, lineHeight: 16.5 },

  altWrap: { marginTop: 13 },
  altHead: { fontSize: 9, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5 },
  altRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 7 },
  altChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#DCFCE7', borderRadius: 999,
    paddingHorizontal: 13, paddingVertical: 8,
  },
  altChipText: { fontSize: 13.5, fontWeight: '800', color: '#15803D' },
  rangeText: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginTop: 6, lineHeight: 18 },

  factRow: { flexDirection: 'row', gap: 10, marginTop: 13 },
  fact: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10 },
  factLabel: { fontSize: 8, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.4 },
  factValue: { fontSize: 14, fontWeight: '800', color: '#111827', marginTop: 3 },

  block: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#F1F5F9', marginTop: 12,
  },
  blockHead: { fontSize: 9, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5 },
  blockNote: { fontSize: 10.5, color: '#9CA3AF', marginTop: 9, lineHeight: 15 },
  exRow: { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 9, marginTop: 9 },
  exName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  exReason: { fontSize: 11, fontWeight: '800', color: '#B45309', marginTop: 3, letterSpacing: 0.2 },
  exDetail: { fontSize: 11.5, color: '#6B7280', marginTop: 3, lineHeight: 16.5 },

  allocRow: { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 10, marginTop: 10 },
  allocHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  allocName: { flex: 1, fontSize: 14, fontWeight: '800', color: '#111827' },
  allocLine: { fontSize: 14, fontWeight: '800', color: '#111827' },
  allocMeta: { fontSize: 11.5, color: '#6B7280', marginTop: 3, lineHeight: 16.5 },
  allocOwed: { fontSize: 11.5, color: '#15803D', fontWeight: '700', marginTop: 4, lineHeight: 16.5 },

  totals: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 10 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', gap: 12, paddingVertical: 5,
  },
  totalKey: { flex: 1, fontSize: 12.5, color: '#6B7280', lineHeight: 17 },
  totalVal: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  grandRow: { borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 6, paddingTop: 10 },
  grandKey: { flex: 1, fontSize: 14, fontWeight: '800', color: '#111827' },
  grandVal: { fontSize: 20, fontWeight: '900', color: '#15803D' },
  advBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  advTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  advSub: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginTop: 4, marginBottom: 10 },
  advRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  advChip: {
    flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999,
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
  },
  advChipOn: { borderColor: '#16A34A', backgroundColor: '#DCFCE7' },
  advChipText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  advChipTextOn: { color: '#15803D' },
  advWarn: { fontSize: 11, color: '#92400E', lineHeight: 16, marginTop: 8 },

  saveBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#DCFCE7', borderRadius: 12, padding: 11, marginTop: 11,
  },
  saveText: { flex: 1, fontSize: 12.5, color: '#15803D', fontWeight: '700', lineHeight: 17.5 },
  warnBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: 11, marginTop: 11,
  },
  warnText: { flex: 1, fontSize: 12.5, color: '#7C2D12', lineHeight: 17.5 },

  fine: { fontSize: 10.5, color: '#9CA3AF', marginTop: 8, lineHeight: 15.5 },
  footNote: { fontSize: 11, color: '#9CA3AF', lineHeight: 16, paddingHorizontal: 2 },

  failCard: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  failHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  failTitle: { flex: 1, fontSize: 14.5, fontWeight: '800', color: '#B91C1C', lineHeight: 20 },
  failBody: { fontSize: 12.5, color: '#7F1D1D', marginTop: 8, lineHeight: 18 },
  failDetail: { fontSize: 11.5, color: '#991B1B', marginTop: 6, lineHeight: 16.5 },
  failBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#B91C1C', borderRadius: 12, paddingVertical: 11, marginTop: 12,
  },
  failBtnText: { fontSize: 13.5, fontWeight: '800', color: '#fff' },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 15, marginTop: 4,
  },
  ctaOff: { backgroundColor: '#86EFAC' },
  ctaText: { fontSize: 15.5, fontWeight: '800', color: '#fff' },

  doneCard: { borderColor: '#BBF7D0' },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  doneTitle: { fontSize: 18, fontWeight: '900', color: '#15803D' },
  doneNote: { fontSize: 12, color: '#6B7280', marginTop: 8, lineHeight: 17 },
  doneLine: { fontSize: 13, color: '#374151', marginTop: 10, lineHeight: 18.5 },
  doneRow: { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 9, marginTop: 9 },
  doneRowName: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  doneRowMeta: { fontSize: 11.5, color: '#6B7280', marginTop: 3, lineHeight: 16.5 },
  runBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 12 },
  runHead: { fontSize: 9, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5 },
  runLine: { fontSize: 12.5, color: '#374151', marginTop: 5, lineHeight: 17.5 },
  runNote: { fontSize: 11, color: '#9CA3AF', marginTop: 6, lineHeight: 15.5 },
});

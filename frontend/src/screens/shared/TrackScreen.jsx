import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import TrackingMapSurface from '../../components/map/TrackingMapSurface';
import VehicleIcon from '../../components/vehicles/VehicleIcon';
import usePolling from '../../hooks/usePolling';
import { useLanguage } from '../../i18n/LanguageContext';
import { t as translate } from '../../i18n/strings';
import {
  bandOf, STALE_STYLE, lastSeenText, etaIsHonest, isRunLive,
  ORDER_STATE, RUN_STATE,
} from '../../utils/runTracking';
import { OUTCOME, outcomeOf, isVisited } from '../../utils/stopOutcome';

// ═══════════════════════════════════════════════════════════════════════════
// ONE MAP FOR A 50 kg PICKUP AND FOR A 2-TONNE FIVE-FARM RUN.
// ═══════════════════════════════════════════════════════════════════════════
//
// WHY THIS IS ONE COMPONENT AND NOT TWO.
//   `Consignment.tracking` mirrors `Order.tracking` field for field, and
//   `GET /api/consignments/:id/track` was deliberately built to return the same
//   keys `GET /api/orders/:id/track` returns — `tracking`, `ageSec`, `stale`,
//   `remainingKm`, `etaMin`, `agentName`, `vehicleType`, `pickup`, `dropoff`,
//   and `routePolyline`/`dropOtp` behind `?full=1`. The backend did that work
//   so ONE renderer could serve both; forking a near-duplicate screen here
//   would throw it away and give the honesty rules below two homes to drift
//   between. What a run adds — a stop list, a transit leg, a driver who may not
//   be a captain — is rendered conditionally, not in a second file.
//
// ⚠️ THE HONESTY RULE, WHICH IS THE REASON THIS FEATURE EXISTS AT ALL.
//   Location is FOREGROUND-ONLY (Expo Go has no background location) and there
//   are no push notifications, so gaps on a multi-hour run are NORMAL, not
//   exceptional. This screen therefore:
//     · NEVER interpolates. `setVehicle(..., 0)` SNAPS the marker to the fix
//       that actually landed. The old 5-second glide drew the vehicle at
//       coordinates nobody ever reported, which is fine over five seconds and
//       is an invented position over forty minutes — and the same code path
//       serves both.
//     · dims and then GREYS the marker as the fix ages (`setStaleness`), so a
//       half-hour-old point cannot read as a moving vehicle.
//     · says "last seen N min ago" in words, beside the marker, always.
//     · HIDES the ETA once the fix is too old for it to mean anything, and says
//       why. The server measures it from the last fix and labels it
//       `etaBasis: 'last_seen_position'` precisely so a client can do this.
//     · says so out loud when `tracking.simulated` is set.
//   CLAUDE.md names faking a live agent position as a thing this project
//   refuses. Do not "fix" any of the above by pretending.
//
// WHY IT TAKES A `localized` PARAM.
//   The buyer's stack is English by product decision; the FPO admin and the
//   farmers whose crop is aboard are farmer-side and read Marathi. So the
//   VendorNavigator registers this screen without the flag and the
//   FarmerNavigator registers it with `localized: true` — the same mechanism
//   StopOutcomeSheet already uses, and the one thing that stops a Marathi panel
//   appearing inside an English screen.

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const kgs = (n) => `${Number(n || 0).toLocaleString('en-IN')} kg`;

export default function TrackScreen({ navigation, route }) {
  const { orderId, consignmentId, localized } = route.params || {};
  const { t } = useLanguage();

  // ── EVERY HOOK SITS ABOVE THE FIRST EARLY RETURN. The last hook is the
  // useEffect at line 196; the first early return is `if (loading && !track)`
  // at line 205. React counts hooks per render, so a hook added below that
  // guard would run on the second render and not the first — the crash
  // CLAUDE.md records for FarmerSalesScreen. Nothing past line 205 may add one.
  const [track, setTrack]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [errCode, setErrCode] = useState(null);
  const [mapApi, setMapApi] = useState(null);
  const [following, setFollowing] = useState(true);
  // A POOLED ORDER IS NOT TRACKED ON ITS OWN DOCUMENT. `GET /api/orders/:id/
  // track` returns `trackVia: 'consignment'` for one, because the vehicle
  // carries several farmers' crops and the position belongs to the RUN. An old
  // link into this screen with such an orderId would otherwise sit on an empty
  // `tracking` block forever, looking like a driver with their app shut.
  const [runId, setRunId] = useState(consignmentId || null);

  const gotFull = useRef(false);
  const drawnLeg = useRef(null);
  const full = useRef(null);
  const switched = useRef(false);

  const tx = useCallback(
    (k) => (localized ? t(k) : translate(k, 'en')),
    [localized, t]
  );

  const isRun = !!runId;

  const fetchTrack = useCallback(async () => {
    // Polylines never change, so they are fetched once and then omitted from
    // every subsequent poll — at 5s a 300-point line would be megabytes an hour.
    const needFull = !gotFull.current;
    const base = runId ? `${API_ENDPOINTS.CONSIGNMENTS}/${runId}` : `${API_ENDPOINTS.ORDERS}/${orderId}`;
    try {
      const r = await axios.get(`${base}/track${needFull ? '?full=1' : ''}`);
      if (!r.data.success) { setErrCode('LOAD'); setLoading(false); return; }
      const tk = r.data.track;

      if (!runId && tk.trackVia === 'consignment' && tk.consignmentId) {
        // Switch endpoints and start again, including the ?full=1 fetch.
        gotFull.current = false;
        full.current = null;
        drawnLeg.current = null;
        switched.current = true;
        setRunId(String(tk.consignmentId));
        return;
      }

      if (needFull) { gotFull.current = true; full.current = tk; }
      setErrCode(null);
      setTrack((prev) => ({ ...(full.current || {}), ...(prev || {}), ...tk }));
    } catch (e) {
      setErrCode(e.response?.status === 403 ? 'FORBIDDEN' : 'LOAD');
    } finally {
      setLoading(false);
    }
  }, [orderId, runId]);

  const live = !!track && (isRun
    ? isRunLive(track.status)
    : ['accepted', 'picked_up'].includes(track.status));
  usePolling(fetchTrack, live ? 5000 : 15000, true);

  // The endpoint just changed under us (a pooled order redirecting to its run).
  // Fetch again immediately rather than leaving a spinner up for a whole poll
  // interval — usePolling only re-fires on its own schedule.
  useEffect(() => {
    if (!switched.current) return;
    switched.current = false;
    fetchTrack();
  }, [runId, fetchTrack]);

  const band = bandOf(track);

  // The stops as the MAP needs them: position plus which of the four states the
  // farm is in. Derived with utils/stopOutcome.js — the same derivation the
  // stop list below uses, so a farm drawn green on the map is green in the list.
  const mapStops = useMemo(() => {
    if (!isRun || !track?.stops) return [];
    const nextSeq = track.nextStop?.sequence ?? null;
    return track.stops.map((st, i) => ({
      lat: st.lat, lng: st.lng, n: st.sequence ?? i + 1,
      state: outcomeOf(st) === OUTCOME.NONE ? 'failed'
        : isVisited(st) ? 'done'
          : (nextSeq != null && st.sequence === nextSeq) ? 'next' : 'pending',
    }));
  }, [isRun, track?.stops, track?.nextStop?.sequence]);

  // A signature, so the markers are only redrawn when a farm's state actually
  // changes rather than on every 5-second poll.
  const stopSig = useMemo(() => mapStops.map((s) => s.state).join(','), [mapStops]);

  // Pins and the leg-appropriate route.
  useEffect(() => {
    if (!mapApi || !track) return;

    if (isRun) {
      mapApi.setPins(null, track.dropoff);
      mapApi.setStops(mapStops);
      if (drawnLeg.current !== 'run') {
        drawnLeg.current = 'run';
        mapApi.setRoute((full.current || {}).routePolyline, 'main');
        mapApi.fitAll();
      }
      return;
    }

    mapApi.setPins(track.pickup, track.dropoff);
    const leg = track.status === 'picked_up' ? 'main' : 'approach';
    if (drawnLeg.current !== leg) {
      drawnLeg.current = leg;
      const f = full.current || {};
      if (leg === 'approach') {
        mapApi.setRoute(f.approachPolyline, 'approach');
        mapApi.setRoute(f.routePolyline, 'main');
      } else {
        mapApi.clearRoute('approach');
        mapApi.setRoute(f.routePolyline, 'main');
      }
      mapApi.fitAll();
    }
  }, [mapApi, isRun, track?.status, stopSig]);

  // ⚠️ THE MARKER SNAPS. `ms: 0` is the fifth argument and it is deliberate —
  // see the header. The vehicle is drawn where a fix landed and nowhere else,
  // and `setStaleness` greys it as that fix ages.
  useEffect(() => {
    if (!mapApi || !track?.tracking || track.tracking.lat == null) return;
    mapApi.setVehicle(
      track.tracking.lat, track.tracking.lng, track.tracking.heading,
      track.vehicleType, 0
    );
    mapApi.setStaleness(band);
  }, [mapApi, track?.tracking?.seq, band]);

  if (loading && !track) {
    return <View style={s.center}><ActivityIndicator size="large" color="#16A34A" /></View>;
  }

  if (!track) {
    return (
      <View style={s.center}>
        <Ionicons name={errCode === 'FORBIDDEN' ? 'lock-closed-outline' : 'alert-circle-outline'}
          size={38} color={errCode === 'FORBIDDEN' ? '#9CA3AF' : '#DC2626'} />
        <Text style={s.errorText}>
          {errCode === 'FORBIDDEN' ? tx('track.forbidden') : tx('track.loadError')}
        </Text>
        <TouchableOpacity style={s.backChip} onPress={() => navigation.goBack()}>
          <Text style={s.backChipText}>{tx('track.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const f = full.current || {};
  const tone = STALE_STYLE[band];
  const showEta = live && etaIsHonest(track);

  const stateTitle = isRun
    ? tx(`track.run.${track.status}`)
    : (ORDER_STATE[track.status] || ORDER_STATE.awaiting_agent).title;
  const stateSub = isRun
    ? tx(`track.runSub.${track.status}`)
    : (ORDER_STATE[track.status] || ORDER_STATE.awaiting_agent).sub;
  const stateTone = ((isRun ? RUN_STATE : ORDER_STATE)[track.status]
    || (isRun ? RUN_STATE.accepted : ORDER_STATE.awaiting_agent)).tone;

  const lastSeen = lastSeenText(track.ageSec, {
    never: tx('track.neverSeen'),
    live: tx('track.liveWord'),
    moment: tx('track.momentAgo'),
    min: (n) => `${tx('track.lastSeen')} ${n} ${tx('track.minAgo')}`,
    hr: (h, m) => `${tx('track.lastSeen')} ${h} ${tx('track.hrWord')}${m ? ` ${m} ${tx('track.minWord')}` : ''} ${tx('track.ago')}`,
  });

  const bandNote = track.staleNote || tx(`track.note.${band}`);
  const driver = track.driver || null;
  const prog = track.progress || null;

  return (
    <View style={s.container}>
      <View style={s.mapWrap}>
        <TrackingMapSurface
          initialCenter={
            track.pickup?.lat ? { lat: track.pickup.lat, lng: track.pickup.lng }
              : track.dropoff?.lat ? { lat: track.dropoff.lat, lng: track.dropoff.lng }
                : undefined
          }
          initialZoom={12}
          onReady={setMapApi}
          onUnfollow={() => setFollowing(false)}
        />
        {!following && (
          <TouchableOpacity
            style={s.recenter}
            onPress={() => { setFollowing(true); mapApi?.follow(true); mapApi?.fitAll(); }}
          >
            <Ionicons name="locate" size={16} color="#111827" />
            <Text style={s.recenterText}>{tx('track.recenter')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView style={s.sheet} contentContainerStyle={s.sheetInner}>
        <View style={s.grabber} />

        <View style={s.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: stateTone }]}>{stateTitle}</Text>
            <Text style={s.sub}>{stateSub}</Text>
          </View>
          {showEta && (
            <View style={s.etaBox}>
              <Text style={s.etaValue}>{track.etaMin}</Text>
              <Text style={s.etaUnit}>{tx('track.min')}</Text>
            </View>
          )}
        </View>

        {/* ── THE LAST LEG, NAMED. `in_transit` exists because the drive from
            the last farm gate to the buyer's gate used to be invisible — a
            buyer refreshed a screen saying "collecting" while the truck had
            been on the highway for an hour. It is entered from evidence (every
            stop recorded, something aboard), never from a button. ── */}
        {isRun && track.status === 'in_transit' && (
          <View style={s.transitBox}>
            <Ionicons name="arrow-forward-circle" size={18} color="#6D28D9" />
            <Text style={s.transitText}>
              {tx('track.inTransitBanner')}
              {prog?.collectedKg != null ? ` ${kgs(prog.collectedKg)} ${tx('track.aboard')}.` : ''}
            </Text>
          </View>
        )}

        {/* ── WHERE THE VEHICLE WAS LAST SEEN. Always shown when the trip is
            live — never only when it is stale, because "no chip" would read as
            "everything is fine". ── */}
        {live && (
          <>
            <View style={[s.liveRow, { backgroundColor: tone.bg }]}>
              <View style={[s.liveDot, { backgroundColor: tone.dot }]} />
              <Text style={[s.liveText, { color: tone.fg }]}>
                {lastSeen}
                {showEta && track.remainingKm != null ? ` · ${track.remainingKm} ${tx('track.kmToGo')}` : ''}
              </Text>
            </View>
            <Text style={s.staleHint}>{bandNote}</Text>
            {!showEta && track.etaMin != null && (
              <Text style={s.staleHint}>{tx('track.etaHidden')}</Text>
            )}
            <Text style={s.staleHint}>{tx('track.neverInterpolated')}</Text>
          </>
        )}

        {/* ── A SIMULATED FIX SAYS SO. It travels through the same endpoint a
            real phone uses, which is what makes it worth having and exactly
            why it has to be labelled. ── */}
        {!!track.tracking?.simulated && (
          <View style={s.simBox}>
            <Ionicons name="flask-outline" size={16} color="#6D28D9" />
            <View style={{ flex: 1 }}>
              <Text style={s.simTitle}>{tx('track.simulated')}</Text>
              <Text style={s.simText}>{tx('track.simulatedNote')}</Text>
            </View>
          </View>
        )}

        {/* ── WHO IS DRIVING. On a run this may be a pool captain OR the
            group's own driver, and an unlinked name on a trip sheet is a third
            thing again — one that can never report a position at all. ── */}
        {(!!track.agentName || (isRun && driver?.kind)) && (
          <View style={s.agentCard}>
            <VehicleIcon type={track.vehicleType} width={54} />
            <View style={{ flex: 1 }}>
              <Text style={s.agentName}>{track.agentName || tx('track.noDriverName')}</Text>
              <Text style={s.agentSub}>
                {track.agentVehicleNumber || tx('track.vehiclePending')}
                {isRun && driver?.kind
                  ? ` · ${tx(driver.kind === 'captain' ? 'track.captain' : 'track.fpoDriver')}`
                  : ''}
              </Text>
            </View>
            {!!track.agentPhone && (
              <TouchableOpacity style={s.callChip} onPress={() => Linking.openURL(`tel:${track.agentPhone}`)}>
                <Ionicons name="call" size={14} color="#2563EB" />
                <Text style={s.callChipText}>{tx('track.call')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {isRun && driver && driver.kind === 'fpo_driver' && driver.linked === false && (
          <View style={s.warnBox}>
            <Ionicons name="information-circle-outline" size={16} color="#B45309" />
            <Text style={s.warnText}>{tx('track.unlinkedDriver')}</Text>
          </View>
        )}
        {isRun && (!driver || !driver.kind) && (
          <View style={s.warnBox}>
            <Ionicons name="information-circle-outline" size={16} color="#B45309" />
            <Text style={s.warnText}>{tx('track.noDriverYet')}</Text>
          </View>
        )}

        {/* The buyer holds the delivery code; nobody else is ever sent it. */}
        {!!f.dropOtp && !['delivered', 'cancelled', 'abandoned'].includes(track.status) && (
          <View style={s.otpBox}>
            <View style={{ flex: 1 }}>
              <Text style={s.otpLabel}>{tx('track.deliveryCode')}</Text>
              <Text style={s.otpHint}>{tx('track.deliveryCodeHint')}</Text>
            </View>
            <Text style={s.otpValue}>{f.dropOtp}</Text>
          </View>
        )}

        {/* ── THE FARMS ON THIS RUN ─────────────────────────────────────── */}
        {isRun && !!track.stops?.length && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>{tx('track.stopsTitle')}</Text>
            {!!prog && (
              <>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, {
                    width: `${prog.stopsTotal ? (prog.stopsVisited / prog.stopsTotal) * 100 : 0}%`,
                  }]} />
                </View>
                <Text style={s.progressText}>
                  {prog.stopsVisited} / {prog.stopsTotal} {tx('track.farmsVisited')}
                  {prog.stopsFailed > 0 ? ` · ${prog.stopsFailed} ${tx('track.collectedNothing')}` : ''}
                </Text>
                {prog.collectedKg != null && (
                  <Text style={s.aboardText}>
                    {kgs(prog.collectedKg)} {tx('track.aboard')}
                    {prog.plannedKg != null && prog.collectedKg !== prog.plannedKg
                      ? ` · ${kgs(prog.plannedKg - prog.collectedKg)} ${tx('track.shortOfPlan')}`
                      : ''}
                  </Text>
                )}
              </>
            )}

            {track.stops.map((st, i) => {
              const failed = outcomeOf(st) === OUTCOME.NONE;
              const done = isVisited(st);
              const isNext = !done && track.nextStop?.sequence === st.sequence;
              return (
                <View key={`${st.sequence}-${i}`} style={s.stopRow}>
                  <View style={[
                    s.stopNum,
                    done && !failed && s.stopNumDone,
                    failed && s.stopNumFailed,
                    isNext && s.stopNumNext,
                  ]}>
                    {done
                      ? <Ionicons name={failed ? 'close' : 'checkmark'} size={13} color="#fff" />
                      : <Text style={[s.stopNumText, isNext && { color: '#fff' }]}>{st.sequence ?? i + 1}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    {/* A farmer viewing this run sees every stop as a point on
                        the route — that is what a map is — but the backend
                        reduces the others to position and progress. A missing
                        name here is that refusal, not a gap. */}
                    <Text style={s.stopName}>
                      {st.farmerName || tx('track.anotherFarm')}
                      {st.mine ? ` · ${tx('track.yourFarm')}` : ''}
                    </Text>
                    {(st.cropName || st.quantityKg != null) && (
                      <Text style={s.stopMeta}>
                        {st.quantityKg != null ? `${kgs(st.quantityKg)} ` : ''}{st.cropName || ''}
                      </Text>
                    )}
                    <Text style={[
                      s.stopState,
                      failed && { color: '#B91C1C' },
                      !done && { color: '#9CA3AF' },
                      isNext && { color: '#C2410C', fontWeight: '700' },
                    ]}>
                      {failed ? tx('track.stopFailed')
                        : done ? (st.collectedKg != null && st.quantityKg != null && st.collectedKg < st.quantityKg
                          ? `${tx('track.stopShort')} — ${kgs(st.collectedKg)} / ${kgs(st.quantityKg)}`
                          : tx('track.stopDone'))
                          : isNext ? tx('track.stopNext') : tx('track.stopPending')}
                    </Text>

                    {/* ── WHAT WAS SEEN AT THIS GATE ────────────────────
                        `GET /:id/track` already returns describeWeight() and
                        describeGradeCheck() per stop and nothing read either,
                        so a lot recorded LOWER than it was sold as looked
                        exactly like one that matched, and a kilogram figure
                        travelled with no word about whether anybody weighed
                        it. Both are stated here, factually, and neither has
                        moved a rupee. (A farmer viewing somebody else's stop
                        gets neither field at all — the backend reduces other
                        farms to position and progress.) */}
                    {!!st.weight?.method && !st.weight.weighed && (
                      <Text style={s.stopProv}>{tx('track.notWeighed')}</Text>
                    )}
                    {!!st.weight?.independent && (
                      <Text style={s.stopProv}>
                        {tx('track.weighbridge')}
                        {st.weight.ref ? ` · ${st.weight.ref}` : ''}
                      </Text>
                    )}
                    {!!st.grade?.downgraded && (
                      <View style={s.stopGradeBox}>
                        <Text style={s.stopGradeText}>
                          {tx('track.gradeLower')} {st.grade.declared} → {st.grade.observed}
                        </Text>
                        <Text style={s.stopGradeSub}>
                          {st.grade.farmerResponse === 'accepted' ? tx('track.gradeAccepted')
                            : st.grade.farmerResponse === 'contested' ? tx('track.gradeContested')
                              : tx('track.gradeUnanswered')}
                        </Text>
                      </View>
                    )}
                  </View>
                  {!!st.farmerPhone && (
                    <TouchableOpacity style={s.callSmall} onPress={() => Linking.openURL(`tel:${st.farmerPhone}`)}>
                      <Ionicons name="call" size={12} color="#2563EB" />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            {/* Said once, under the list, wherever a difference is shown: a
                gate grade is an observation, not an inspection, and it has
                changed no price and no payout. */}
            {track.stops.some((st) => st.grade?.downgraded) && (
              <Text style={s.footnote}>{tx('track.gradeNote')}</Text>
            )}

            {!!track.privacyNote && <Text style={s.footnote}>{track.privacyNote}</Text>}
          </View>
        )}

        {/* ── DROP-OFF, and for a single order the pickup beside it ─────── */}
        <View style={s.card}>
          <View style={s.legRow}>
            <View style={s.legDots}>
              <View style={s.dotPickup} />
              <View style={s.legLine} />
              <View style={s.dotDrop} />
            </View>
            <View style={{ flex: 1, gap: 14 }}>
              <View>
                <Text style={s.legLabel}>{isRun ? tx('track.nextStopLabel') : tx('track.pickupLabel')}</Text>
                <Text style={s.legValue}>
                  {track.pickup?.label || (isRun ? tx('track.allFarmsVisited') : '—')}
                </Text>
              </View>
              <View>
                <Text style={s.legLabel}>{tx('track.dropLabel')}</Text>
                <Text style={s.legValue}>{track.dropoff?.label || track.dropoff?.district || '—'}</Text>
              </View>
            </View>
          </View>

          {!isRun && !!f.cropName && (
            <>
              <View style={s.divider} />
              <View style={s.summaryRow}>
                <Text style={s.summaryKey}>{f.quantityKg} kg {f.cropName}</Text>
                <Text style={s.summaryVal}>{money(f.grandTotal)} {tx('track.onDelivery')}</Text>
              </View>
            </>
          )}

          {isRun && !!f.lot && (
            <>
              <View style={s.divider} />
              <View style={s.summaryRow}>
                <Text style={s.summaryKey}>
                  {f.lot.source === 'fpo_lot'
                    ? `${f.lot.cropName}${f.lot.gradeLabel ? ` · ${f.lot.gradeLabel}` : ''}`
                    : tx('track.pooledOrders')}
                </Text>
                {f.distanceKm != null && <Text style={s.summaryVal}>{f.distanceKm} km</Text>}
              </View>
              {f.lot.source === 'fpo_lot' && !!f.lot.fpoName && (
                <Text style={s.footnote}>{f.lot.fpoName}</Text>
              )}
            </>
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', gap: 12, padding: 26 },
  errorText: { fontSize: 13.5, color: '#374151', textAlign: 'center', lineHeight: 19 },
  backChip:  { backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  backChipText: { fontSize: 13.5, fontWeight: '700', color: '#6B7280' },

  mapWrap: { flex: 1, minHeight: 220, backgroundColor: '#E2E8F0' },
  backBtn: {
    position: 'absolute', top: 14, left: 14, width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  recenter: {
    position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 19, paddingHorizontal: 12, paddingVertical: 9,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  recenterText: { fontSize: 12.5, fontWeight: '700', color: '#111827' },

  sheet: {
    maxHeight: '62%', backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 22, borderTopRightRadius: 22, marginTop: -18,
  },
  sheetInner: { padding: 16, gap: 12, paddingTop: 8 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 6 },

  headRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title:   { fontSize: 19, fontWeight: '800' },
  sub:     { fontSize: 13, color: '#6B7280', marginTop: 3, lineHeight: 18 },
  etaBox:  { alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  etaValue:{ fontSize: 22, fontWeight: '800', color: '#1D4ED8' },
  etaUnit: { fontSize: 10.5, fontWeight: '700', color: '#2563EB', letterSpacing: 0.5 },

  transitBox: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: '#F5F3FF', borderRadius: 14, padding: 13,
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  transitText: { flex: 1, fontSize: 12.5, color: '#5B21B6', lineHeight: 18 },

  liveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5,
  },
  liveDot:   { width: 7, height: 7, borderRadius: 4 },
  liveText:  { fontSize: 12, fontWeight: '700' },
  staleHint: { fontSize: 11.5, color: '#9CA3AF', lineHeight: 16, marginTop: -6 },

  simBox: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: '#F5F3FF', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  simTitle: { fontSize: 12.5, fontWeight: '800', color: '#5B21B6' },
  simText:  { fontSize: 11.5, color: '#6D28D9', marginTop: 3, lineHeight: 16 },

  warnBox: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 14, padding: 12,
  },
  warnText: { flex: 1, fontSize: 11.5, color: '#92400E', lineHeight: 16 },

  agentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: '#F1F5F9',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 5,
  },
  agentName: { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  agentSub:  { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  callChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFF6FF',
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE',
  },
  callChipText: { fontSize: 13, color: '#2563EB', fontWeight: '700' },

  otpBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F0FDF4', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  otpLabel: { fontSize: 12.5, color: '#15803D', fontWeight: '800' },
  otpHint:  { fontSize: 11.5, color: '#6B7280', marginTop: 2, lineHeight: 16 },
  otpValue: { fontSize: 26, fontWeight: '800', color: '#15803D', letterSpacing: 5 },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 5,
  },
  sectionTitle: {
    fontSize: 10.5, fontWeight: '800', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  progressFill:  { height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  progressText:  { fontSize: 12, color: '#6B7280', marginTop: -4 },
  aboardText:    { fontSize: 12, fontWeight: '700', color: '#15803D', marginTop: -6 },

  stopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  stopNum: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  stopNumDone:   { backgroundColor: '#16A34A' },
  stopNumFailed: { backgroundColor: '#B91C1C' },
  stopNumNext:   { backgroundColor: '#EA580C' },
  stopNumText:   { fontSize: 12, fontWeight: '800', color: '#9CA3AF' },
  stopName:  { fontSize: 14, fontWeight: '700', color: '#111827' },
  stopMeta:  { fontSize: 11.5, color: '#6B7280', marginTop: 1 },
  stopState: { fontSize: 11.5, fontWeight: '600', color: '#15803D', marginTop: 2 },
  stopProv:  { fontSize: 10.5, color: '#6B7280', marginTop: 3, lineHeight: 15 },
  stopGradeBox: { backgroundColor: '#FFFBEB', borderRadius: 9, padding: 8, marginTop: 5 },
  stopGradeText: { fontSize: 11.5, fontWeight: '800', color: '#92400E', lineHeight: 16 },
  stopGradeSub: { fontSize: 10.5, color: '#B45309', lineHeight: 15, marginTop: 2 },
  callSmall: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  footnote: { fontSize: 11, color: '#9CA3AF', lineHeight: 16 },

  divider:  { height: 1, backgroundColor: '#F1F5F9' },
  legRow:   { flexDirection: 'row', gap: 14 },
  legDots:  { alignItems: 'center', paddingTop: 5 },
  dotPickup:{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#16A34A' },
  legLine:  { width: 2, flex: 1, minHeight: 24, backgroundColor: '#E2E8F0', marginVertical: 3 },
  dotDrop:  { width: 10, height: 10, borderRadius: 2, backgroundColor: '#EA580C' },
  legLabel: { fontSize: 9.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.8 },
  legValue: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 2 },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryKey: { fontSize: 13.5, color: '#374151', fontWeight: '600' },
  summaryVal: { fontSize: 13.5, color: '#15803D', fontWeight: '700' },
});

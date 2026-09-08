import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
  ActivityIndicator, RefreshControl, Alert, Vibration, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import VehicleIcon from '../../components/vehicles/VehicleIcon';
import usePolling from '../../hooks/usePolling';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import AgentOnboarding from './AgentOnboarding';
import JobOfferSheet from './JobOfferSheet';
import LocationMapPicker from '../../components/LocationMapPicker';

// Tagged so this screen releases only its OWN lock — another screen holding
// one must not be switched off when a captain goes off duty here.
const KEEP_AWAKE_TAG = 'agent-on-duty';

// The transport agent's home screen.
//
// There is no push notification path in Expo Go, so "dispatch" is this screen
// polling every 5 seconds while the agent is online and the app is in the
// foreground. That is a real product limitation, not a bug — an agent who
// closes the app stops receiving trips, which is why the offline state says
// so plainly.
export default function AgentDashboard({ navigation, route }) {
  const { userData } = route.params || {};
  const uid = userData?.uid || userData?.firebaseUid;

  const [profile, setProfile]   = useState(null);
  const [online, setOnline]     = useState(false);
  const [jobs, setJobs]         = useState([]);
  const [current, setCurrent]   = useState(null);
  const [offer, setOffer]       = useState(null);
  // What the server actually filtered on, so the empty state can say WHY it is
  // empty. "No trips" and "no trips within 40 km, the nearest is 96 km away"
  // are different facts and only the second one is useful to a driver.
  const [reach, setReach]       = useState(null);
  const [busy, setBusy]         = useState(false);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [onboard, setOnboard]   = useState(false);

  const here = useRef(null);
  const seen = useRef(new Set());   // offers already shown, so one job pops once

  // ── WHERE THIS CAPTAIN SAYS THEY ARE — auto-detect (real GPS) by default,
  // with a manual override. REPORTED DIRECTLY: testing dispatch from outside
  // Maharashtra means the device's own real GPS fix (wherever the tester's
  // phone actually is) becomes this captain's `geo`, and a genuinely-nearby
  // Nashik job then measures as hundreds of kilometres away — nothing wrong
  // with the app, the captain just is not physically there. `locationMode`
  // lets a captain say "no, treat me as being here" instead, the same way a
  // farmer already sets a location by hand on `LocationMapPicker` — reused
  // here rather than a second map component. Persisted per-account so it
  // survives a re-open of the app; 'auto' is the default for every captain
  // who has never touched this.
  const [locationMode, setLocationMode] = useState('auto'); // 'auto' | 'manual'
  const [manualPlace, setManualPlace] = useState(null);      // { lat, lng, label }
  const [showLocationSheet, setShowLocationSheet] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const locationModeRef = useRef('auto');
  const manualPlaceRef = useRef(null);
  const LOCATION_MODE_KEY = `agentLocationMode_${uid}`;
  const MANUAL_PLACE_KEY = `agentManualPlace_${uid}`;

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const [mode, place] = await Promise.all([
          AsyncStorage.getItem(LOCATION_MODE_KEY),
          AsyncStorage.getItem(MANUAL_PLACE_KEY),
        ]);
        if (mode === 'manual' && place) {
          const parsed = JSON.parse(place);
          setLocationMode('manual');
          setManualPlace(parsed);
          locationModeRef.current = 'manual';
          manualPlaceRef.current = parsed;
        }
      } catch { /* falls back to auto-detect */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // ── profile + a location fix ───────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API_ENDPOINTS.USERS}/firebase/${uid}`);
        const u = r.data.user || {};
        setProfile(u);
        setOnline(!!u.isOnline);
        if (!u.vehicle?.type) setOnboard(true);
        // ⚠️ THE TRIP IN HAND IS FETCHED HERE, NOT ONLY IN THE POLLING LOOP.
        // `usePolling(poll, ...)` is gated on `online`, and `poll()` is what
        // loaded the current trip — so a captain who went OFF DUTY lost sight
        // of a job they were still holding, mid-delivery. You do not stop
        // having a job because you flipped a switch. The feed still needs
        // `online` (that is what the toggle is for); the job you already
        // accepted does not.
        try {
          const c = await axios.get(`${API_ENDPOINTS.ORDERS}/agent/current`);
          if (c.data?.success) setCurrent(c.data.order);
        } catch { /* the poll will retry */ }
      } catch {
        Alert.alert('Offline', 'Could not load your profile. Pull down to retry.');
      } finally {
        setLoading(false);
      }
    })();

    refreshPosition();
  }, [uid]);

  // ── WHERE THIS CAPTAIN IS, KEPT CURRENT ────────────────────────────────
  //
  // ⚠️ This used to be taken ONCE on mount and never again. That was survivable
  // while the feed was statewide and the distance was only a label on a card.
  // It is not survivable now that the server FILTERS on it: a captain who
  // launched the app in Nashik and drove to Sinnar keeps being offered Nashik
  // jobs and is invisible to everything near where they actually are, all
  // session, with nothing on screen to suggest anything is wrong.
  //
  // It is also sent to the server, which previously had no way to know where an
  // idle captain was — `User.geo` was indexed and never written by any route.
  //
  // ⚠️ MANUAL MODE SHORT-CIRCUITS THIS ENTIRELY — it never calls
  // expo-location at all. A captain who has set a manual place is saying "I
  // know where I really am, and it is not what my device reports" (testing
  // from outside the state is the common case); re-reading real GPS every
  // two minutes would silently overwrite their choice right back to the
  // wrong place, which is exactly the bug this feature exists to fix.
  const lastSent = useRef(0);
  const refreshPosition = useCallback(async (force = false) => {
    if (locationModeRef.current === 'manual' && manualPlaceRef.current) {
      const p = manualPlaceRef.current;
      here.current = { lat: p.lat, lng: p.lng };
      if (!force && Date.now() - lastSent.current < 120000) return;
      lastSent.current = Date.now();
      try {
        await axios.post(`${API_ENDPOINTS.USERS}/me/position`, {
          lat: p.lat, lng: p.lng, district: p.district,
        });
      } catch { /* dispatch still works, just without distance-to-pickup */ }
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      here.current = { lat: fix.coords.latitude, lng: fix.coords.longitude };

      // Throttled to two minutes. The feed polls every 5s and carries the
      // position in its own query string, so this write exists only so DISPATCH
      // can find an idle captain — it does not need to be per-poll, and 720
      // online captains writing every 5s is a lot of writes for no gain.
      if (!force && Date.now() - lastSent.current < 120000) return;
      lastSent.current = Date.now();

      let district;
      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: here.current.lat, longitude: here.current.lng,
        });
        // `subregion` is the district on Android; `region` is the STATE and
        // must never be sent as one — the server would fail to match it and
        // silently lose the district fallback.
        district = place?.subregion || place?.city || undefined;
      } catch { /* the coordinate is the point; a district is a bonus */ }

      await axios.post(`${API_ENDPOINTS.USERS}/me/position`, {
        lat: here.current.lat, lng: here.current.lng, district,
      });
    } catch { /* dispatch still works, just without distance-to-pickup */ }
  }, []);

  const chooseAutoDetect = useCallback(async () => {
    locationModeRef.current = 'auto';
    manualPlaceRef.current = null;
    setLocationMode('auto');
    setManualPlace(null);
    setShowLocationSheet(false);
    try {
      await AsyncStorage.multiSet([[LOCATION_MODE_KEY, 'auto']]);
      await AsyncStorage.removeItem(MANUAL_PLACE_KEY);
    } catch { /* local preference only — not fatal if it doesn't persist */ }
    refreshPosition(true); // real GPS, right away — not the two-minute throttle
  }, [refreshPosition]);

  const confirmManualPlace = useCallback(async (resolvedAddress) => {
    const place = {
      lat: resolvedAddress.coordinates.lat,
      lng: resolvedAddress.coordinates.lng,
      district: resolvedAddress.district || undefined,
      label: [resolvedAddress.city, resolvedAddress.district].filter(Boolean).join(', ')
        || `${resolvedAddress.coordinates.lat.toFixed(3)}, ${resolvedAddress.coordinates.lng.toFixed(3)}`,
    };
    locationModeRef.current = 'manual';
    manualPlaceRef.current = place;
    setLocationMode('manual');
    setManualPlace(place);
    setShowMapPicker(false);
    setShowLocationSheet(false);
    try {
      await AsyncStorage.setItem(LOCATION_MODE_KEY, 'manual');
      await AsyncStorage.setItem(MANUAL_PLACE_KEY, JSON.stringify(place));
    } catch { /* local preference only — not fatal if it doesn't persist */ }
    refreshPosition(true); // push the chosen place immediately, not on the next throttled tick
  }, [refreshPosition]);

  // ── ON DUTY: KEEP THE SCREEN ALIVE AND THE POSITION FRESH ──────────────
  //
  // Dispatch in Expo Go IS this screen polling, so a locked phone is a captain
  // who has silently stopped receiving work while their own app still says
  // "You are online". Keeping the screen awake while on duty is not a nicety —
  // without it the duty toggle makes a promise the app cannot keep.
  useEffect(() => {
    if (!online) return undefined;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    const t = setInterval(() => refreshPosition(), 120000);
    return () => {
      clearInterval(t);
      try { deactivateKeepAwake(KEEP_AWAKE_TAG); } catch { /* already released */ }
    };
  }, [online, refreshPosition]);

  // ── the dispatch poll ──────────────────────────────────────────────────
  const [runs, setRuns] = useState([]);

  const poll = useCallback(async () => {
    const cur = await axios.get(`${API_ENDPOINTS.ORDERS}/agent/current`);
    if (cur.data.success) setCurrent(cur.data.order);
    if (cur.data.order) { setJobs([]); setOffer(null); return; }

    const params = here.current ? `?lat=${here.current.lat}&lng=${here.current.lng}` : '';
    const r = await axios.get(`${API_ENDPOINTS.ORDERS}/agent/available${params}`);
    if (!r.data.success) return;

    setJobs(r.data.orders);
    setReach(r.data.reach || null);

    // F1: multi-farm runs live in their own feed. Kept separate rather than
    // merged into `jobs` because they accept, collect and complete through a
    // different set of endpoints — one list of two shapes would mean every
    // handler guessing which it had.
    try {
      const mr = await axios.get(`${API_ENDPOINTS.CONSIGNMENTS}/agent/available${params}`);
      if (mr.data.success) setRuns(mr.data.consignments);
    } catch { setRuns([]); }

    // Surface the nearest unseen job as a popup; the rest stay in the list.
    //
    // The server has already filtered to what this captain can reach, so an
    // arrival here is worth interrupting them for. It VIBRATES rather than
    // posting a notification: Expo Go cannot deliver a real one, and a silent
    // card appearing on a phone sitting on a dashboard is not dispatch. The
    // honest limit — that this only fires while the app is open — is stated on
    // screen below rather than papered over.
    const next = r.data.orders.find((o) => !seen.current.has(o._id));
    if (next) {
      seen.current.add(next._id);
      setOffer(next);
      try { Vibration.vibrate([0, 400, 200, 400]); } catch { /* no vibrator */ }
    }
  }, []);

  usePolling(poll, 5000, online && !!profile?.vehicle?.type);

  const toggleOnline = async (value) => {
    if (value && !profile?.vehicle?.type) { setOnboard(true); return; }
    setOnline(value);
    try {
      await axios.put(`${API_ENDPOINTS.USERS}/${uid}`, { isOnline: value });
    } catch { /* the local toggle is what gates polling; a failed sync is harmless */ }
    // Going on duty sends a position straight away rather than waiting out the
    // two-minute throttle. Dispatch filters on radius now, so a captain who has
    // just come online with a stale position is offered the wrong district's
    // work for the first two minutes of their shift.
    if (value) refreshPosition(true);
    if (!value) { setJobs([]); setOffer(null); setReach(null); }
  };

  // Multi-farm runs accept through their own endpoint and land on their own
  // screen — the stop list, not the single-pickup stage bar.
  const acceptRun = async (c) => {
    Alert.alert(
      `${c.stops.length}-farm run`,
      `${c.totalQuantityKg} kg from ${c.stops.length} farms, ${c.distanceKm} km. You collect a separate code at each farm.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setBusy(true);
            try {
              const r = await axios.post(
                `${API_ENDPOINTS.CONSIGNMENTS}/${c._id}/accept`, here.current || {}
              );
              if (r.data.success) {
                navigation.navigate('ConsignmentTrip', { consignmentId: c._id });
              }
            } catch (e) {
              Alert.alert('Could not accept', e.response?.data?.error || 'Another driver may have taken it.');
              poll();
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const accept = async (order) => {
    setBusy(true);
    try {
      const r = await axios.post(`${API_ENDPOINTS.ORDERS}/${order._id}/accept`, here.current || {});
      if (r.data.success) {
        setOffer(null);
        setCurrent(r.data.order);
        navigation.navigate('AgentTrip', { orderId: r.data.order._id, userData });
      }
    } catch (err) {
      const code = err.response?.data?.code;
      setOffer(null);
      // Losing a race is normal, not a failure — never an error dialog.
      if (code !== 'ALREADY_TAKEN') {
        Alert.alert('Could not accept', err.response?.data?.error || 'Please try again.');
      }
      poll();
    } finally {
      setBusy(false);
    }
  };

  const reject = async (order) => {
    setOffer(null);
    setJobs((list) => list.filter((j) => j._id !== order._id));
    try { await axios.post(`${API_ENDPOINTS.ORDERS}/${order._id}/reject`, {}); } catch { /* best effort */ }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#16A34A" />
        <Text style={s.loadingText}>Loading…</Text>
      </View>
    );
  }

  const vehicle = profile?.vehicle;

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor="#16A34A"
            onRefresh={async () => { setRefreshing(true); try { await poll(); } catch {} setRefreshing(false); }} />
        }
      >
        {/* Duty toggle */}
        <View style={[s.card, online && s.cardOn]}>
          <View style={s.dutyRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.dutyTitle}>{online ? 'You are online' : 'You are offline'}</Text>
              <Text style={s.dutySub}>
                {online
                  ? 'Looking for trips near you. Keep this screen open.'
                  : 'Go online to receive trip requests.'}
              </Text>
            </View>
            <Switch
              value={online}
              onValueChange={toggleOnline}
              trackColor={{ false: '#E2E8F0', true: '#BBF7D0' }}
              thumbColor={online ? '#16A34A' : '#94A3B8'}
            />
          </View>

          {vehicle?.type && (
            <>
              <View style={s.divider} />
              <View style={s.vehicleRow}>
                <VehicleIcon type={vehicle.type} width={56} />
                <View style={{ flex: 1 }}>
                  <Text style={s.vehicleName}>
                    {vehicle.type === 'auto' ? 'Auto' : vehicle.type === 'tempo' ? 'Tempo Van' : 'Truck'}
                  </Text>
                  <Text style={s.vehicleNum}>{vehicle.number || 'No number set'}</Text>
                </View>
                <TouchableOpacity onPress={() => setOnboard(true)} hitSlop={10}>
                  <Ionicons name="create-outline" size={19} color="#6B7280" />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Where dispatch thinks you are. Auto-detect by default; a
              manual override for testing away from where your device's own
              GPS actually is — otherwise dispatch measures every job from
              wherever the phone really is, not where you want to be tested. */}
          <View style={s.divider} />
          <TouchableOpacity style={s.locationRow} onPress={() => setShowLocationSheet(true)} activeOpacity={0.7}>
            <Ionicons name="locate" size={17} color={locationMode === 'manual' ? '#1D4ED8' : '#6B7280'} />
            <View style={{ flex: 1 }}>
              <Text style={s.locationLabel}>
                {locationMode === 'manual' ? (manualPlace?.label || 'Manual location') : 'Auto-detect (GPS)'}
              </Text>
              <Text style={s.locationSub}>
                {locationMode === 'manual' ? 'Tap to change or use GPS again' : 'Tap to set a location manually'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Active job takes over everything else */}
        {current ? (
          <TouchableOpacity
            style={s.activeCard}
            onPress={() => navigation.navigate('AgentTrip', { orderId: current._id, userData })}
            activeOpacity={0.9}
          >
            <View style={s.activeChip}>
              <View style={s.activeDot} />
              <Text style={s.activeChipText}>
                {current.status === 'accepted' ? 'GO TO PICKUP' : 'DELIVER NOW'}
              </Text>
            </View>
            <Text style={s.activeCrop}>{current.quantityKg} kg {current.cropName}</Text>
            <Text style={s.activeRoute} numberOfLines={1}>
              {current.pickup?.label} <Text style={s.arrow}>→</Text> {current.dropoff?.label}
            </Text>
            <View style={s.activeFooter}>
              <Text style={s.activePay}>₹{(current.fare?.agentPayout ?? current.fare?.total)?.toLocaleString('en-IN')}</Text>
              <View style={s.activeGo}>
                <Text style={s.activeGoText}>Open trip</Text>
                <Ionicons name="arrow-forward" size={15} color="#fff" />
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <>
            {online && runs.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Multi-farm runs ({runs.length})</Text>
                {runs.map((c) => (
                  <TouchableOpacity
                    key={c._id}
                    style={s.runCard}
                    activeOpacity={0.85}
                    onPress={() => acceptRun(c)}
                  >
                    <View style={s.runBadge}>
                      <Text style={s.runBadgeNum}>{c.stops.length}</Text>
                      <Text style={s.runBadgeLabel}>FARMS</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.runTitle} numberOfLines={1}>
                        {c.stops.map((x) => x.farmerName.split(' ')[0]).join(' → ')}
                      </Text>
                      <Text style={s.runMeta}>
                        {c.totalQuantityKg} kg · {c.distanceKm} km
                        {c.approachKm != null ? ` · ${c.approachKm} km to first farm` : ''}
                      </Text>
                      <Text style={s.runMeta}>to {c.dropoff?.label || c.dropoff?.district}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.runEarnLabel}>EARN</Text>
                      <Text style={s.runEarn}>₹{(c.fare?.agentPayout ?? c.fare?.total)?.toLocaleString('en-IN')}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}

            <Text style={s.sectionTitle}>
              {online ? `Available trips${jobs.length ? ` (${jobs.length})` : ''}` : 'Trips'}
            </Text>

            {!online ? (
              <View style={s.placeholder}>
                <View style={s.placeholderIcon}><Ionicons name="moon-outline" size={30} color="#16A34A" /></View>
                <Text style={s.placeholderTitle}>You are offline</Text>
                <Text style={s.placeholderText}>Turn on the switch above to start receiving trips.</Text>
              </View>
            ) : jobs.length === 0 ? (
              <View style={s.placeholder}>
                <ActivityIndicator color="#16A34A" />
                <Text style={s.placeholderTitle}>Waiting for trips</Text>
                <Text style={s.placeholderText}>
                  You will be shown trips your {vehicle?.type === 'auto' ? 'auto' : vehicle?.type === 'tempo' ? 'tempo' : 'truck'} can carry
                  {reach?.mode === 'radius' ? ` within ${reach.radiusKm} km of you` : ''}.
                </Text>

                {/* ── WHY IT IS EMPTY ──────────────────────────────────────
                    An empty list with a spinner reads as "the app is dead
                    today". It is a completely different message to a driver if
                    there IS work and it is simply too far — that is the one
                    fact that tells them whether moving is worth it. */}
                {reach?.beyondRadius && (
                  <View style={s.reachBox}>
                    <Ionicons name="navigate-outline" size={15} color="#B45309" />
                    <Text style={s.reachText}>
                      {reach.beyondRadius.count} {reach.beyondRadius.count === 1 ? 'trip is' : 'trips are'} open
                      further out — the nearest is about {reach.beyondRadius.nearestKm} km away.
                      You are not shown it because the drive to the farm is unpaid.
                    </Text>
                  </View>
                )}

                {reach?.mode === 'district' && (
                  <View style={s.reachBox}>
                    <Ionicons name="warning-outline" size={15} color="#B45309" />
                    <Text style={s.reachText}>
                      Location is off, so trips are matched by district ({reach.district}) instead of
                      distance. Turn location on to see how far each pickup actually is.
                    </Text>
                  </View>
                )}

                {reach?.mode === 'unfiltered' && (
                  <View style={s.reachBox}>
                    <Ionicons name="warning-outline" size={15} color="#B45309" />
                    <Text style={s.reachText}>
                      We do not know where you are and your profile has no district, so this list is
                      from across the whole state and is not sorted by distance. Turn location on.
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              jobs.map((j) => (
                <TouchableOpacity key={j._id} style={s.jobCard} onPress={() => setOffer(j)} activeOpacity={0.85}>
                  <VehicleIcon type={j.vehicleType} width={50} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.jobRoute} numberOfLines={1}>
                      {j.pickup?.district} <Text style={s.arrow}>→</Text> {j.dropoff?.label}
                    </Text>
                    <Text style={s.jobMeta}>
                      {j.distanceKm} km · {j.quantityKg} kg
                      {j.approachKm != null ? ` · ${j.approachKm} km away` : ''}
                    </Text>
                  </View>
                  <Text style={s.jobPay}>₹{(j.fare?.agentPayout ?? j.fare?.total)?.toLocaleString('en-IN')}</Text>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {/* ── The captain's own record, below the job pool ──────────────
            It already existed as `AgentTripsScreen` and was reachable ONLY
            from a header control in AgentNavigator. A driver's finished
            trips, kilometres and earnings are the second thing they open the
            app for, after work itself — a 21px icon in a header bar is not a
            route to it. Same defect class as the buyer's whole order history
            being unreachable because six header icons overflowed a 360dp
            screen.

            ⚠️ DELIBERATELY OUTSIDE THE `online` GATE. The duty toggle exists
            to control the JOB FEED; what you have already earned is yours to
            look at whether or not you are on duty. Going off duty once made a
            captain's ACTIVE job disappear for the same reason — a gate that
            was right for the feed applied to something that was not the
            feed. */}
        <TouchableOpacity
          style={s.historyRow}
          onPress={() => navigation.navigate('AgentTrips', { userData })}
          accessibilityLabel="My completed trips and earnings"
        >
          <View style={s.historyIcon}>
            <Ionicons name="receipt-outline" size={19} color="#16A34A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.historyTitle}>My trips &amp; earnings</Text>
            <Text style={s.historySub}>
              Finished runs, distance driven, and what is still to be collected
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        {online && !current && (
          <View style={s.warnBox}>
            <Ionicons name="information-circle-outline" size={17} color="#C2410C" />
            <Text style={s.warnText}>
              Trip requests only arrive while this app is open on screen. Locking your
              phone or switching apps will stop them.
            </Text>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <AgentOnboarding
        visible={onboard}
        uid={uid}
        initial={vehicle}
        onDone={(v) => {
          setProfile((p) => ({ ...p, vehicle: v }));
          setOnboard(false);
          toggleOnline(true);
        }}
      />

      {!current && (
        <JobOfferSheet order={offer} onAccept={accept} onReject={reject} busy={busy} />
      )}

      {/* ── Auto-detect vs manual location ── */}
      <Modal visible={showLocationSheet} transparent animationType="slide" onRequestClose={() => setShowLocationSheet(false)}>
        <View style={s.sheetWrap}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>Your location for dispatch</Text>
              <TouchableOpacity onPress={() => setShowLocationSheet(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={s.sheetSub}>
              This decides which nearby jobs you are offered. Auto-detect uses your device's real GPS;
              manual lets you test as if you were somewhere else.
            </Text>

            <TouchableOpacity
              style={[s.locationOption, locationMode === 'auto' && s.locationOptionOn]}
              onPress={chooseAutoDetect}
            >
              <Ionicons name="locate" size={20} color={locationMode === 'auto' ? '#15803D' : '#6B7280'} />
              <View style={{ flex: 1 }}>
                <Text style={[s.locationOptionTitle, locationMode === 'auto' && s.locationOptionTitleOn]}>Auto-detect (GPS)</Text>
                <Text style={s.locationOptionSub}>Use this device's real location</Text>
              </View>
              {locationMode === 'auto' && <Ionicons name="checkmark-circle" size={20} color="#16A34A" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.locationOption, locationMode === 'manual' && s.locationOptionOn]}
              onPress={() => { setShowLocationSheet(false); setShowMapPicker(true); }}
            >
              <Ionicons name="map" size={20} color={locationMode === 'manual' ? '#15803D' : '#6B7280'} />
              <View style={{ flex: 1 }}>
                <Text style={[s.locationOptionTitle, locationMode === 'manual' && s.locationOptionTitleOn]}>Set manually on map</Text>
                <Text style={s.locationOptionSub}>
                  {locationMode === 'manual' && manualPlace ? manualPlace.label : 'Pick a point — e.g. Nashik'}
                </Text>
              </View>
              {locationMode === 'manual' && <Ionicons name="checkmark-circle" size={20} color="#16A34A" />}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <LocationMapPicker
        visible={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onConfirm={confirmManualPlace}
      />
    </View>
  );
}

const s = StyleSheet.create({
  runCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#BBF7D0',
  },
  runBadge: {
    width: 46, height: 46, borderRadius: 12, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center',
  },
  runBadgeNum: { fontSize: 19, fontWeight: '900', color: '#15803D', lineHeight: 21 },
  runBadgeLabel: { fontSize: 7.5, fontWeight: '800', color: '#15803D', letterSpacing: 0.4 },
  runTitle: { fontSize: 14.5, fontWeight: '700', color: '#111827' },
  runMeta: { fontSize: 11.5, color: '#6B7280', marginTop: 2 },
  runEarnLabel: { fontSize: 8.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.4 },
  runEarn: { fontSize: 16, fontWeight: '800', color: '#15803D' },
  container:   { flex: 1, backgroundColor: '#F8FAFC' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },
  scroll:      { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 5, borderWidth: 1, borderColor: '#F1F5F9',
  },
  cardOn:  { borderColor: '#BBF7D0' },
  divider: { height: 1, backgroundColor: '#F1F5F9' },

  dutyRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dutyTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  dutySub:   { fontSize: 12.5, color: '#6B7280', marginTop: 3, lineHeight: 18 },

  vehicleRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vehicleName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  vehicleNum:  { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  locationRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 },
  locationLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  locationSub:   { fontSize: 11.5, color: '#9CA3AF', marginTop: 2 },

  sheetWrap: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  sheetSub: { fontSize: 13, color: '#6B7280', marginTop: 8, marginBottom: 16, lineHeight: 18 },

  locationOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#F1F5F9',
  },
  locationOptionOn: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  locationOptionTitle: { fontSize: 14.5, fontWeight: '700', color: '#111827' },
  locationOptionTitleOn: { color: '#15803D' },
  locationOptionSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 4 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 18, padding: 14,
    marginTop: 14, borderWidth: 1, borderColor: '#F1F5F9',
  },
  historyIcon: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center',
  },
  historyTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  historySub: { fontSize: 11, color: '#6B7280', marginTop: 2, lineHeight: 15 },

  placeholder: {
    alignItems: 'center', gap: 8, paddingVertical: 34, paddingHorizontal: 24,
    backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#F1F5F9',
  },
  placeholderIcon:  { width: 62, height: 62, borderRadius: 31, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  placeholderTitle: { fontSize: 15.5, fontWeight: '700', color: '#1F2937', marginTop: 4 },
  placeholderText:  { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 19 },
  reachBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 12, padding: 11, marginTop: 14,
  },
  reachText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: '#92400E' },

  jobCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 16, padding: 13,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  jobRoute: { fontSize: 14, fontWeight: '700', color: '#111827' },
  jobMeta:  { fontSize: 12, color: '#9CA3AF', marginTop: 3 },
  jobPay:   { fontSize: 17, fontWeight: '800', color: '#15803D' },
  arrow:    { color: '#16A34A' },

  activeCard: {
    backgroundColor: '#15803D', borderRadius: 20, padding: 18, gap: 8,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 8,
  },
  activeChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  activeDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: '#BBF7D0' },
  activeChipText: { fontSize: 10.5, fontWeight: '800', color: '#fff', letterSpacing: 0.8 },
  activeCrop:     { fontSize: 19, fontWeight: '800', color: '#fff', marginTop: 2 },
  activeRoute:    { fontSize: 13, color: 'rgba(255,255,255,0.82)' },
  activeFooter:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  activePay:      { fontSize: 22, fontWeight: '800', color: '#fff' },
  activeGo:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 9 },
  activeGoText:   { color: '#fff', fontWeight: '700', fontSize: 13.5 },

  warnBox: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: '#FFF7ED', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  warnText: { flex: 1, fontSize: 12.5, color: '#C2410C', lineHeight: 18 },
});

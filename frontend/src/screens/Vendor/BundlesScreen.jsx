import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import LocationMapPicker from '../../components/LocationMapPicker';
import {
  nf, money, perKg, kgs, kms, pcts,
  gradeVisual, trustVisual, EXCLUSION_LABEL, UNPRICEABLE_LABEL,
} from '../../utils/lotDisplay';

// F2 PHASE F, buyer side: a CATALOG YOU CAN BUY FROM, not a savings calculator.
//
// One card is ONE LOT — one group, one crop, ONE GRADE — which is what
// `GET /api/fpos/bundles` has returned since Phase C. Three things this screen
// is not allowed to do, because the backend went to real trouble to make them
// impossible and a screen can undo all of it:
//
//   1. RENDER UNGRADED AS A FOURTH TIER. The response sends `ungraded: true`,
//      `grade.code: null` and `grade.tier: null` — deliberately not 3, because
//      "unknown" is not "below C". So the ungraded chip is a different KIND of
//      object (dashed, slate, question mark), never the next colour down.
//   2. LAUNDER A SELF-DECLARED CLAIM. Every graded lot is N farmers' own claims
//      about their OWN produce and nobody has inspected any of it. The grade
//      chip is never drawn without the self-declared marker beside it.
//   3. QUOTE ONE PRICE. Members inside one lot ask different ₹/kg. The card
//      shows the spread beside the indicative figure and says in words that no
//      member is offering the indicative price.
//
// It also no longer crashes on `item.vehicleType.toUpperCase()`. Phase C routed
// lots whose collection cannot be priced into a SIBLING `unpriceableLots` array
// precisely so that call could not blow up; they are rendered here in their own
// section, with every numeric field guarded and nulls printed as em dashes —
// never as ₹0, because unknown is not free.

const GradeChip = ({ lot, small }) => {
  const g = gradeVisual(lot);
  return (
    <View style={s.chipRow}>
      <View
        style={[
          s.gradeChip,
          small && s.gradeChipSmall,
          // Square-cornered as well as dashed: Android silently drops a dashed
          // border on a fully rounded pill, and the ungraded chip must not be
          // able to degrade into looking like just another grade.
          g.dashed && s.gradeChipUngraded,
          {
            backgroundColor: g.bg,
            borderColor: g.border,
            borderStyle: g.dashed ? 'dashed' : 'solid',
          },
        ]}
      >
        <Ionicons name={g.icon} size={small ? 11 : 13} color={g.fg} />
        <Text style={[s.gradeChipText, small && s.gradeChipTextSmall, { color: g.fg }]}>
          {g.label}
        </Text>
      </View>

      {/* A grade chip NEVER travels alone. Nobody inspected any of this. */}
      {g.declared && g.selfDeclared && (
        <View style={[s.selfChip, small && s.gradeChipSmall]}>
          <Ionicons name="eye-off-outline" size={small ? 10 : 11} color="#64748B" />
          <Text style={[s.selfChipText, small && s.gradeChipTextSmall]}>SELF-DECLARED</Text>
        </View>
      )}
    </View>
  );
};

/**
 * ONE LOT WHOSE COLLECTION CAN BE PRICED — the buyable card.
 *
 * Module-level, not a closure inside the screen, so its `open` state survives
 * the parent re-rendering (a component redefined every render is a new type and
 * React remounts it, silently resetting local state).
 */
const LotCard = ({ item, onOrder }) => {
  const [open, setOpen] = useState(false);

  const g = gradeVisual(item);
  const price = item.price || {};
  const minOrder = item.minOrder || {};
  const collection = item.collection || {};
  const contributors = item.contributors || item.lots || [];
  // `smallestOrderKg` is null when NO contributor has enough stock left to meet
  // their own minimum — the lot is real but nothing in it is orderable.
  const orderable = minOrder.smallestOrderKg != null;

  return (
    <View style={s.card}>
      {/* ── what this lot IS ────────────────────────────────────────────── */}
      <GradeChip lot={item} />
      {!!g.subline && <Text style={s.gradeSub}>{g.subline}</Text>}

      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.crop}>{item.cropName}</Text>
          <Text style={s.name}>{item.fpoName}</Text>
          <Text style={s.meta}>
            {item.village ? `${item.village} · ` : ''}{item.district || '—'}
            {' · '}{nf(item.farms || 0)} farm{item.farms === 1 ? '' : 's'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.kgLabel}>ON ONE VEHICLE</Text>
          <Text style={s.kg}>{kgs(item.totalKg)}</Text>
          {item.totalKgAvailable > item.totalKg && (
            <Text style={s.kgSub}>group holds {kgs(item.totalKgAvailable)}</Text>
          )}
        </View>
      </View>

      {/* ── the claim behind the letter ─────────────────────────────────── */}
      {g.declared ? (
        <View style={s.declareBox}>
          <Ionicons name="alert-circle-outline" size={15} color="#64748B" />
          <View style={{ flex: 1 }}>
            <Text style={s.declareText}>
              {g.declaredBy > 1
                ? `${nf(g.declaredBy)} farmers each declared ${g.label} for their OWN produce — `
                  + `${nf(g.declaredBy)} separate claims, not one verified fact.`
                : `One farmer declared ${g.label} for their own produce. Nobody has checked it.`}
            </Text>
            {!!g.disclaimer && <Text style={s.declareSub}>{g.disclaimer}</Text>}
            {!!g.specNote && <Text style={s.declareSub}>{g.specNote}</Text>}
          </View>
        </View>
      ) : (
        <View style={s.declareBox}>
          <Ionicons name="help-circle-outline" size={15} color="#64748B" />
          <Text style={s.declareText}>
            {g.disclaimer
              || 'Nobody has declared a grade for this produce. Inspect it, or agree a grade with the '
                 + 'seller, before paying a graded price.'}
          </Text>
        </View>
      )}

      {/* ── price: the spread, not just the average ─────────────────────── */}
      <View style={s.priceRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.priceLabel}>INDICATIVE</Text>
          <Text style={s.price}>{perKg(price.indicativePerKg)}</Text>
          <Text style={s.priceSub}>weighted average of members&apos; own asking prices</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.priceLabel}>MEMBERS ASK</Text>
          <Text style={s.spread}>
            {price.minPerKg == null ? '—' : `₹${nf(price.minPerKg)} – ₹${nf(price.maxPerKg)}`}
          </Text>
          <Text style={s.priceSub}>
            {price.distinctPrices > 1
              ? `${nf(price.distinctPrices)} different prices`
              : 'all the same price'}
          </Text>
        </View>
      </View>

      {price.wide ? (
        <View style={s.warnBox}>
          <Ionicons name="git-compare-outline" size={16} color="#B45309" />
          <View style={{ flex: 1 }}>
            <Text style={s.warnStrong}>
              The dearest member asks {pcts(price.spreadPct)} more than the cheapest
              {price.spreadPerKg != null ? ` (₹${nf(price.spreadPerKg)}/kg apart)` : ''}
            </Text>
            <Text style={s.warnText}>
              {perKg(price.indicativePerKg)} is what the whole lot works out at — no member is offering
              that price. You pay each member their own, so what you actually pay depends on which
              members your quantity draws from.
            </Text>
          </View>
        </View>
      ) : price.distinctPrices > 1 ? (
        <Text style={s.note}>
          Members ask different prices inside this lot. You pay each of them their own — the indicative
          figure is not a price anyone offered.
        </Text>
      ) : null}

      {/* ── the pooled-vs-separate saving: the differentiator ───────────── */}
      <View style={s.compare}>
        <View style={s.col}>
          <Text style={s.colLabel}>SEPARATELY</Text>
          <Text style={s.solo}>{money(collection.separateFare)}</Text>
          <Text style={s.colSub}>
            {nf(item.farms || 0)} trip{item.farms === 1 ? '' : 's'}
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={17} color="#9CA3AF" />
        <View style={s.col}>
          {/* GUARDED. The old screen called .toUpperCase() straight on this. */}
          <Text style={s.colLabel}>
            ONE {String(collection.vehicleType || 'vehicle').toUpperCase()}
          </Text>
          <Text style={s.shared}>{money(collection.bundledFare)}</Text>
          <Text style={s.colSub}>{kms(collection.distanceKm)}</Text>
        </View>
      </View>

      {collection.pooled === false ? (
        <Text style={s.note}>
          Only one farm contributes to this lot, so there is nothing to pool — the two figures are the
          same single trip and the saving is exactly 0.
        </Text>
      ) : collection.worthIt ? (
        <View style={s.saveBox}>
          <Ionicons name="trending-down-outline" size={17} color="#15803D" />
          <View style={{ flex: 1 }}>
            <Text style={s.saveText}>
              Saves {money(collection.saving)} — {pcts(collection.savingPct)} off collection
            </Text>
            {collection.transportPctSeparate != null && collection.transportPctBundled != null && (
              <Text style={s.saveSub}>
                Transport falls from {pcts(collection.transportPctSeparate)} to{' '}
                {pcts(collection.transportPctBundled)} of what the crop is worth
              </Text>
            )}
          </View>
        </View>
      ) : (
        <View style={s.warnBox}>
          <Ionicons name="alert-circle-outline" size={17} color="#B45309" />
          <Text style={s.warnText}>
            These farms are too spread out — one trip costs more than {nf(item.farms || 0)} separate
            ones here.
          </Text>
        </View>
      )}

      {/* ── the minimum order, and what it does NOT guarantee ───────────── */}
      <View style={s.minBox}>
        <Text style={s.minHead}>SMALLEST ORDER</Text>
        {orderable ? (
          <>
            <Text style={s.minValue}>
              {kgs(minOrder.smallestOrderKg)}
              <Text style={s.minValueSub}>
                {'  '}fillable from {nf(minOrder.fillableAtSmallestFrom || 0)} of{' '}
                {nf(minOrder.contributors || contributors.length)} contributors
              </Text>
            </Text>
            <Text style={s.minNote}>
              This does NOT mean every quantity above it can be filled from the lot. Each farmer keeps
              their own minimum
              {minOrder.allContributorsMinKg != null
                ? `, so an order drawing on every contributor needs at least ${kgs(minOrder.allContributorsMinKg)}`
                : ''}
              .
            </Text>
            {minOrder.unfillableContributors > 0 && (
              <Text style={s.minNote}>
                {nf(minOrder.unfillableContributors)} contributor
                {minOrder.unfillableContributors === 1 ? ' has' : 's have'} less stock left than their
                own minimum, so nothing of theirs can be ordered right now.
              </Text>
            )}
          </>
        ) : (
          <Text style={s.minNote}>
            {minOrder.note
              || 'No contributor here has enough stock left to meet their own minimum order, so nothing '
                 + 'in this lot can be ordered right now.'}
          </Text>
        )}
      </View>

      {/* ── who is actually in it, one record each ──────────────────────── */}
      <TouchableOpacity
        style={s.disclose}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.7}
      >
        <Text style={s.discloseText}>
          {open ? 'Hide' : 'Show'} the {nf(contributors.length)} contributor
          {contributors.length === 1 ? '' : 's'} and their records
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#16A34A" />
      </TouchableOpacity>

      {open && (
        <View style={s.members}>
          {contributors.map((c) => {
            const t = trustVisual(c.trust);
            return (
              <View key={String(c._id || c.listingId)} style={s.memberRow}>
                <View style={s.memberHead}>
                  <Text style={s.memberName}>{c.farmerName || 'Member'}</Text>
                  <Text style={s.memberPrice}>{perKg(c.pricePerKg)}</Text>
                </View>
                <Text style={s.memberMeta}>
                  {kgs(c.quantityKg)} available · sells from {kgs(c.minOrderKg)}
                  {c.canFillOwnMinimum === false ? ' · below their own minimum right now' : ''}
                </Text>
                {/* PER CONTRIBUTOR. Never averaged into a group score. */}
                {t && (
                  <View style={[s.trustPill, { backgroundColor: t.bg }]}>
                    <Ionicons name={t.icon} size={12} color={t.fg} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.trustLabel, { color: t.fg }]}>{t.label}</Text>
                      <Text style={s.trustDetail}>{t.reason || t.detail}</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
          <Text style={s.membersNote}>
            Each record is that one farmer&apos;s own delivery history. There is no group score — five
            farmers means five records to read, which is the point of buying from a group.
          </Text>
        </View>
      )}

      {/* ── what is NOT in this run ─────────────────────────────────────── */}
      {item.truncated && (
        <View style={s.infoBox}>
          <Ionicons name="information-circle-outline" size={15} color="#1D4ED8" />
          <View style={{ flex: 1 }}>
            <Text style={s.infoText}>{item.selectionNote}</Text>
            {(item.excludedLots || []).map((x) => (
              <Text key={String(x._id)} style={s.infoSub}>
                • {x.farmerName || 'A member'} · {kgs(x.quantityKg)} ·{' '}
                {EXCLUSION_LABEL[x.reason] || x.reason}
              </Text>
            ))}
          </View>
        </View>
      )}

      {(item.farmersAlsoInOtherLots || []).length > 0 && (
        <Text style={s.note}>
          {nf(item.farmersAlsoInOtherLots.length)} of these farmers also sell another grade of{' '}
          {item.cropName} in this group. Grades are never blended, so those are separate lots — and a
          vehicle taking both stops at that farm once. One lot per order for now.
        </Text>
      )}

      <TouchableOpacity
        style={[s.cta, !orderable && s.ctaOff]}
        onPress={() => onOrder(item)}
        disabled={!orderable}
        activeOpacity={0.85}
      >
        <Ionicons name="cart-outline" size={17} color={orderable ? '#fff' : '#9CA3AF'} />
        <Text style={[s.ctaText, !orderable && s.ctaTextOff]}>
          {orderable ? 'Quote a quantity from this lot' : 'Nothing orderable right now'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

/**
 * A LOT WHOSE COLLECTION COST CANNOT BE MEASURED AT ALL.
 *
 * The stock is real; what is missing is a way to price the vehicle. Every
 * numeric field on these is null by design, so nothing here formats a number
 * without the null-safe helpers and nothing prints ₹0.
 */
const UnpriceableRow = ({ item }) => {
  const collection = item.collection || {};
  return (
    <View style={s.deadCard}>
      <GradeChip lot={item} small />
      <Text style={s.deadCrop}>
        {item.cropName} · {item.fpoName}
      </Text>
      <Text style={s.deadMeta}>
        {item.village ? `${item.village} · ` : ''}{item.district || '—'} ·{' '}
        {kgs(item.totalKgAvailable)} held by {nf(item.membersAvailable || 0)} member
        {item.membersAvailable === 1 ? '' : 's'}
      </Text>
      <View style={s.deadReason}>
        <Ionicons name="close-circle-outline" size={14} color="#B45309" />
        <Text style={s.deadReasonText}>
          {UNPRICEABLE_LABEL[collection.reason] || 'Collection cannot be priced'}
        </Text>
      </View>
      {!!collection.note && <Text style={s.deadNote}>{collection.note}</Text>}
      <Text style={s.deadNote}>
        Distance, vehicle and fare are unknown here, not zero — so they are not shown as figures at
        all. The crop itself is still on the market listing by listing.
      </Text>
    </View>
  );
};

export default function BundlesScreen({ navigation, route }) {
  const { userData } = route.params || {};

  const [crop, setCrop] = useState('');
  // 🐛 REPORTED DIRECTLY — "search a crop, only onion ever shows". Free text
  // with nothing behind it meant guessing the exact stored name, and several
  // crops are stored with a variety suffix ("Mango (Alphonso/Hapus)") nobody
  // would type. The backend now resolves a plain name through the same
  // canonical-crop matcher focus crops already use (GET /bundles fixed
  // separately), and this list — GET /api/fpos/crops, the same 64 canonical
  // names — lets a buyer pick instead of guess.
  const [cropChoices, setCropChoices] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  useEffect(() => {
    axios.get(`${API_ENDPOINTS.FPOS}/crops`)
      .then((r) => { if (r.data?.success) setCropChoices(r.data.crops || []); })
      .catch(() => {});
  }, []);
  const cropSuggestions = useMemo(() => {
    const q = crop.trim().toLowerCase();
    if (!q) return cropChoices.slice(0, 8);
    return cropChoices.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [crop, cropChoices]);
  const [point, setPoint] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [lots, setLots] = useState(null);
  const [dead, setDead] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Phase 4, B3 — narrow to one specific group, and to a price/kg range.
  // `GET /bundles` already returns every matching lot from every FPO with no
  // truncation (unlike the individual market feed, which pages by distance),
  // so filtering the returned set here loses nothing a server-side filter
  // would have kept.
  const [filterOpen, setFilterOpen] = useState(false);
  const [fpoName, setFpoName] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minKg, setMinKg] = useState('');
  const [maxKg, setMaxKg] = useState('');
  const activeFilterCount =
    [fpoName, minPrice, maxPrice, minKg, maxKg].filter((v) => v.trim() !== '').length;

  const filteredLots = useMemo(() => {
    const name = fpoName.trim().toLowerCase();
    const lo = parseFloat(minPrice);
    const hi = parseFloat(maxPrice);
    const kgLo = parseFloat(minKg);
    const kgHi = parseFloat(maxKg);
    return (lots || []).filter((l) => {
      if (name && !(l.fpoName || '').toLowerCase().includes(name)) return false;
      const price = l.price?.indicativePerKg;
      if (Number.isFinite(lo) && !(price >= lo)) return false;
      if (Number.isFinite(hi) && !(price <= hi)) return false;
      if (Number.isFinite(kgLo) && !(l.totalKg >= kgLo)) return false;
      if (Number.isFinite(kgHi) && !(l.totalKg <= kgHi)) return false;
      return true;
    });
  }, [lots, fpoName, minPrice, maxPrice, minKg, maxKg]);

  const filteredDead = useMemo(() => {
    const name = fpoName.trim().toLowerCase();
    if (!name) return dead;
    return dead.filter((d) => (d.fpoName || '').toLowerCase().includes(name));
  }, [dead, fpoName]);

  const search = useCallback(async (cropOverride) => {
    const q = (cropOverride ?? crop).trim();
    if (!q) return Alert.alert('Which crop?', 'Enter the crop you are buying.');
    if (!point) return Alert.alert('Deliver where?', 'Choose your destination on the map.');
    setLoading(true);
    try {
      const r = await axios.get(`${API_ENDPOINTS.FPOS}/bundles`, {
        params: { commodity: q, lat: point.lat, lng: point.lng },
      });
      setLots(r.data.success ? (r.data.bundles || []) : []);
      // The sibling array Phase C added. Kept separate here too — these cannot
      // be bought, so they must not sit in the buyable list.
      setDead(r.data.success ? (r.data.unpriceableLots || []) : []);
    } catch (e) {
      Alert.alert('Could not search', e.response?.data?.error || 'Please try again.');
      setLots([]);
      setDead([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [crop, point]);

  const openOrder = useCallback((lot) => {
    navigation.navigate('LotOrder', { lot, dropoff: point, userData });
  }, [navigation, point, userData]);

  return (
    <View style={s.container}>
      {/* Phase 4, B3 — the same switcher as the individual market, so moving
          between "one farmer's stock" and "a group's own lots" is one tap. */}
      <View style={s.modeRow}>
        <TouchableOpacity
          style={s.modeBtn}
          onPress={() => navigation.navigate('VendorDashboard', { userData })}
        >
          <Text style={s.modeBtnText}>Individual</Text>
        </TouchableOpacity>
        <View style={[s.modeBtn, s.modeBtnOn]}>
          <Text style={[s.modeBtnText, s.modeBtnTextOn]}>FPO groups</Text>
        </View>
      </View>

      <View style={s.searchWrap}>
        <View style={s.searchBar}>
          <TextInput
            style={s.searchInput} value={crop} onChangeText={setCrop}
            placeholder="Crop, e.g. Onion" placeholderTextColor="#9CA3AF"
            returnKeyType="search" onSubmitEditing={() => { setSuggestOpen(false); search(); }}
            onFocus={() => setSuggestOpen(true)}
            // Delayed so a tap on a suggestion row below registers as a press
            // before the list disappears — blur fires first otherwise.
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
          />
          <TouchableOpacity style={s.pin} onPress={() => setMapOpen(true)}>
            <Ionicons name="location-outline" size={18} color={point ? '#16A34A' : '#9CA3AF'} />
          </TouchableOpacity>
          <TouchableOpacity style={s.go} onPress={() => { setSuggestOpen(false); search(); }} activeOpacity={0.85}>
            <Ionicons name="search" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* 🐛/UX fix — a picker, not a guess. Typing still works (the backend
            now resolves a plain name on its own), but tapping a real option
            guarantees an exact match and shows what is actually searchable. */}
        {suggestOpen && cropSuggestions.length > 0 && (
          <View style={s.suggestBox}>
            {cropSuggestions.map((c) => (
              <TouchableOpacity
                key={c}
                style={s.suggestRow}
                onPress={() => { setCrop(c); setSuggestOpen(false); search(c); }}
              >
                <Ionicons name="leaf-outline" size={14} color="#16A34A" />
                <Text style={s.suggestText}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      {!!point && (
        <Text style={s.dest}>
          Delivering to {point.label || `${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}`}
        </Text>
      )}

      {/* A specific group, and a price/kg range — filters the lots already
          fetched for this crop and destination, not a second server call. */}
      {lots !== null && (
        <TouchableOpacity
          style={[s.filterChip, activeFilterCount > 0 && s.filterChipOn]}
          onPress={() => setFilterOpen(true)}
        >
          <Ionicons name="options-outline" size={13} color={activeFilterCount > 0 ? '#15803D' : '#374151'} />
          <Text style={[s.filterChipText, activeFilterCount > 0 && s.filterChipTextOn]}>
            {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filter by group, price, kg'}
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#16A34A" /></View>
      ) : (
        <FlatList
          data={filteredLots}
          // One entry per (FPO, crop, GRADE). Keying on fpoId would collide the
          // moment a group offers two grades of the same crop.
          keyExtractor={(i) => String(i.lotKey)}
          renderItem={({ item }) => <LotCard item={item} onOrder={openOrder} />}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} tintColor="#16A34A"
              onRefresh={() => { setRefreshing(true); search(); }} />
          }
          ListHeaderComponent={
            (lots || []).length > 0 ? (
              <Text style={s.listHead}>
                {nf(filteredLots.length)} lot{filteredLots.length === 1 ? '' : 's'}
                {activeFilterCount > 0 ? ` of ${nf(lots.length)}` : ''} · one group, one crop, one grade
                each. Grades are never blended.
              </Text>
            ) : null
          }
          ListFooterComponent={
            filteredDead.length > 0 ? (
              <View style={s.deadWrap}>
                <Text style={s.deadHead}>
                  COLLECTION CAN&apos;T BE PRICED YET · {nf(filteredDead.length)} LOT
                  {filteredDead.length === 1 ? '' : 'S'}
                </Text>
                <Text style={s.deadIntro}>
                  Real stock that no vehicle can be priced to collect. It is listed here rather than
                  dropped, because a lot that vanishes silently reads as &quot;they have none&quot;.
                </Text>
                {filteredDead.map((d) => <UnpriceableRow key={String(d.lotKey)} item={d} />)}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={s.emptyIcon}>
                <Ionicons name={lots === null ? 'people-outline' : 'search-outline'}
                  size={32} color="#16A34A" />
              </View>
              <Text style={s.emptyTitle}>
                {lots === null
                  ? 'Buy a whole grade lot at once'
                  : (lots.length > 0 ? 'No lot matches these filters' : 'No groups have that crop')}
              </Text>
              <Text style={s.emptySub}>
                {lots === null
                  ? 'Producer groups list their crop farmer by farmer. This shows it as lots — one crop at one grade — that one vehicle can collect together. Enter a crop and where you want it delivered.'
                  : (lots.length > 0
                    ? `${nf(lots.length)} lot${lots.length === 1 ? '' : 's'} exist for this crop and destination — none of them fall inside the group, price or kg range you set.`
                    : 'No producer group near your destination has two or more lots of this crop on the market right now.')}
              </Text>
              {lots !== null && lots.length > 0 && activeFilterCount > 0 && (
                <TouchableOpacity style={s.emptyClearBtn} onPress={() => {
                  setFpoName(''); setMinPrice(''); setMaxPrice(''); setMinKg(''); setMaxKg('');
                }}>
                  <Text style={s.emptyClearBtnText}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      <Modal visible={filterOpen} animationType="slide" transparent onRequestClose={() => setFilterOpen(false)}>
        <View style={s.filterOverlay}>
          <View style={s.filterSheet}>
            <View style={s.filterHeader}>
              <Text style={s.filterTitle}>Filter these lots</Text>
              <TouchableOpacity onPress={() => setFilterOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 14 }}>
              <View>
                <Text style={s.filterLabel}>A specific group (FPO name)</Text>
                <TextInput
                  style={s.filterInput} value={fpoName} onChangeText={setFpoName}
                  placeholder="e.g. Niphad Onion Producer Company" placeholderTextColor="#9CA3AF"
                />
              </View>
              <View>
                <Text style={s.filterLabel}>Indicative price per kg (₹)</Text>
                <View style={s.rangeRow}>
                  <TextInput
                    style={s.rangeInput} value={minPrice} onChangeText={setMinPrice}
                    keyboardType="number-pad" placeholder="Min" placeholderTextColor="#9CA3AF"
                  />
                  <Text style={s.rangeDash}>–</Text>
                  <TextInput
                    style={s.rangeInput} value={maxPrice} onChangeText={setMaxPrice}
                    keyboardType="number-pad" placeholder="Max" placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>
              <View>
                <Text style={s.filterLabel}>Lot size (kg on one vehicle)</Text>
                <View style={s.rangeRow}>
                  <TextInput
                    style={s.rangeInput} value={minKg} onChangeText={setMinKg}
                    keyboardType="number-pad" placeholder="Min" placeholderTextColor="#9CA3AF"
                  />
                  <Text style={s.rangeDash}>–</Text>
                  <TextInput
                    style={s.rangeInput} value={maxKg} onChangeText={setMaxKg}
                    keyboardType="number-pad" placeholder="Max" placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  style={s.filterClearBtn}
                  onPress={() => { setFpoName(''); setMinPrice(''); setMaxPrice(''); setMinKg(''); setMaxKg(''); }}
                >
                  <Text style={s.filterClearBtnText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.filterApplyBtn} onPress={() => setFilterOpen(false)}>
                  <Text style={s.filterApplyBtnText}>Show results</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <LocationMapPicker
        visible={mapOpen}
        onClose={() => setMapOpen(false)}
        onConfirm={(loc) => {
          setPoint({
            lat: loc.lat ?? loc.coordinates?.lat,
            lng: loc.lng ?? loc.coordinates?.lng,
            label: [loc.address, loc.city].filter(Boolean).join(', ') || loc.city || loc.district || '',
            // Carried through to the quote and the confirm, which write the
            // dropoff onto every Order and the Consignment.
            city: loc.city || '',
            district: loc.district || '',
          });
          setMapOpen(false);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 12 },
  listHead: { fontSize: 11.5, color: '#6B7280', lineHeight: 16, marginBottom: 2 },

  modeRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 0 },
  modeBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
  },
  modeBtnOn: { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
  modeBtnText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  modeBtnTextOn: { color: '#15803D' },

  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginHorizontal: 16, marginBottom: 10, backgroundColor: '#F8FAFC',
    borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  filterChipOn: { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
  filterChipText: { fontSize: 12.5, color: '#374151', fontWeight: '600' },
  filterChipTextOn: { color: '#15803D' },

  filterOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  filterSheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '85%' },
  filterHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  filterTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  filterLabel: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginBottom: 6 },
  filterInput: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827',
    backgroundColor: '#F8FAFC',
  },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeInput: {
    flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827',
    backgroundColor: '#F8FAFC',
  },
  rangeDash: { color: '#9CA3AF', fontSize: 14 },
  filterClearBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
  },
  filterClearBtnText: { color: '#6B7280', fontWeight: '700', fontSize: 13.5 },
  filterApplyBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#16A34A',
  },
  filterApplyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  emptyClearBtn: {
    marginTop: 14, backgroundColor: '#F0FDF4', borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 11, borderWidth: 1, borderColor: '#BBF7D0',
  },
  emptyClearBtnText: { color: '#15803D', fontWeight: '700', fontSize: 13.5 },

  searchWrap: { position: 'relative', zIndex: 10 },
  searchBar: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  suggestBox: {
    position: 'absolute', top: '100%', left: 16, right: 62,
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8,
    maxHeight: 260, overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: '#F8FAFC',
  },
  suggestText: { fontSize: 13.5, color: '#111827', fontWeight: '600' },
  searchInput: {
    flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
    color: '#111827', backgroundColor: '#fff',
  },
  pin: {
    width: 46, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  go: { width: 46, borderRadius: 12, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' },
  dest: { fontSize: 12, color: '#6B7280', paddingHorizontal: 18, paddingBottom: 6 },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },

  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  gradeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4,
  },
  gradeChipSmall: { paddingHorizontal: 8, paddingVertical: 3 },
  gradeChipUngraded: { borderRadius: 8 },
  gradeChipText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  gradeChipTextSmall: { fontSize: 10.5 },
  selfChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
    paddingHorizontal: 8, paddingVertical: 4,
  },
  selfChipText: { fontSize: 9.5, fontWeight: '800', color: '#64748B', letterSpacing: 0.4 },
  gradeSub: { fontSize: 11.5, color: '#64748B', marginTop: 5, lineHeight: 16 },

  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: 10 },
  crop: { fontSize: 17, fontWeight: '800', color: '#111827' },
  name: { fontSize: 13.5, fontWeight: '700', color: '#374151', marginTop: 1 },
  meta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  kgLabel: { fontSize: 8.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.4 },
  kg: { fontSize: 16, fontWeight: '800', color: '#111827' },
  kgSub: { fontSize: 10.5, color: '#9CA3AF', marginTop: 2 },

  declareBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 11, marginTop: 11,
  },
  declareText: { flex: 1, fontSize: 12, color: '#475569', lineHeight: 17 },
  declareSub: { fontSize: 11, color: '#94A3B8', marginTop: 4, lineHeight: 15.5 },

  priceRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  priceLabel: { fontSize: 8.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5 },
  price: { fontSize: 20, fontWeight: '900', color: '#111827', marginTop: 2 },
  spread: { fontSize: 16, fontWeight: '800', color: '#374151', marginTop: 4 },
  priceSub: { fontSize: 10.5, color: '#9CA3AF', marginTop: 3, lineHeight: 14.5 },

  compare: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F8FAFC', borderRadius: 14, padding: 13, marginTop: 12, gap: 10,
  },
  col: { flex: 1, alignItems: 'center' },
  colLabel: { fontSize: 9, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5 },
  solo: { fontSize: 18, fontWeight: '800', color: '#9CA3AF', textDecorationLine: 'line-through', marginTop: 3 },
  shared: { fontSize: 21, fontWeight: '900', color: '#15803D', marginTop: 3 },
  colSub: { fontSize: 10.5, color: '#9CA3AF', marginTop: 3 },

  saveBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#DCFCE7', borderRadius: 12, padding: 11, marginTop: 10,
  },
  saveText: { fontSize: 14, fontWeight: '800', color: '#15803D' },
  saveSub: { fontSize: 11.5, color: '#15803D', marginTop: 3, lineHeight: 16 },
  warnBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: 11, marginTop: 10,
  },
  warnStrong: { fontSize: 13, fontWeight: '800', color: '#92400E' },
  warnText: { flex: 1, fontSize: 12, color: '#7C2D12', lineHeight: 17, marginTop: 2 },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#EFF6FF', borderRadius: 12, padding: 11, marginTop: 10,
  },
  infoText: { fontSize: 11.5, color: '#1E40AF', lineHeight: 16.5 },
  infoSub: { fontSize: 11, color: '#3B82F6', marginTop: 3, lineHeight: 15.5 },

  minBox: {
    borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9',
    padding: 11, marginTop: 10,
  },
  minHead: { fontSize: 8.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5 },
  minValue: { fontSize: 15, fontWeight: '800', color: '#111827', marginTop: 3 },
  minValueSub: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  minNote: { fontSize: 11, color: '#6B7280', marginTop: 5, lineHeight: 16 },

  disclose: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  discloseText: { fontSize: 12.5, fontWeight: '700', color: '#16A34A' },

  members: { marginTop: 8, gap: 9 },
  memberRow: { borderRadius: 12, backgroundColor: '#F8FAFC', padding: 10 },
  memberHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  memberName: { flex: 1, fontSize: 13, fontWeight: '700', color: '#111827' },
  memberPrice: { fontSize: 13, fontWeight: '800', color: '#111827' },
  memberMeta: { fontSize: 11.5, color: '#6B7280', marginTop: 2 },
  trustPill: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    borderRadius: 9, padding: 7, marginTop: 6,
  },
  trustLabel: { fontSize: 11.5, fontWeight: '800' },
  trustDetail: { fontSize: 10.5, color: '#6B7280', marginTop: 2, lineHeight: 14.5 },
  membersNote: { fontSize: 10.5, color: '#9CA3AF', lineHeight: 15, marginTop: 2 },

  note: { fontSize: 11.5, color: '#6B7280', marginTop: 10, lineHeight: 16.5 },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 13, marginTop: 14,
  },
  ctaOff: { backgroundColor: '#F1F5F9' },
  ctaText: { fontSize: 14.5, fontWeight: '800', color: '#fff' },
  ctaTextOff: { color: '#9CA3AF' },

  deadWrap: { marginTop: 18, gap: 10 },
  deadHead: { fontSize: 9.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5 },
  deadIntro: { fontSize: 11.5, color: '#6B7280', lineHeight: 16.5 },
  deadCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  deadCrop: { fontSize: 14, fontWeight: '800', color: '#111827', marginTop: 8 },
  deadMeta: { fontSize: 11.5, color: '#6B7280', marginTop: 2, lineHeight: 16 },
  deadReason: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  deadReasonText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#B45309' },
  deadNote: { fontSize: 11, color: '#9CA3AF', marginTop: 6, lineHeight: 15.5 },

  emptyWrap: { alignItems: 'center', paddingTop: 50, paddingHorizontal: 30 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  emptyTitle: { fontSize: 16.5, fontWeight: '700', color: '#111827', textAlign: 'center' },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 6, lineHeight: 19 },
});

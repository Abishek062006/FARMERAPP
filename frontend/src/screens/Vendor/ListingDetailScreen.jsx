import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

// One listing, with the quantity the vendor wants to buy.
//
// The farmer's phone number is deliberately absent: the market API never
// returns it. It is released only once an order exists, so a vendor cannot
// scrape contact details off the marketplace and cut the platform out.
export default function ListingDetailScreen({ navigation, route }) {
  const { listing, origin, userData } = route.params || {};

  const min = listing.minOrderKg || 1;
  const max = listing.quantityAvailableKg;

  // Phase 4, B1 — REPORTED DIRECTLY: the +/- stepper "jumps" the value (its
  // step was proportional to the minimum order, so a 30 kg minimum jumped in
  // 15 kg increments) and there was no way to type an exact number. The
  // quantity is now a real text field; +/- still nudges it by 1 kg for a
  // quick adjustment, but typing is the primary way to set it.
  //
  // ⚠️ AN INVALID NUMBER IS NEVER SILENTLY CLAMPED. Rounding "3 kg" up to the
  // farmer's 10 kg minimum while the buyer is still typing would silently
  // change what they asked for. Instead the number they typed is kept on
  // screen and a named reason is shown ("can't order less than the farmer's
  // minimum"), and buying/offering is disabled until it is valid — the same
  // refuse-rather-than-invent rule this app applies everywhere else.
  const [qtyText, setQtyText] = useState(String(Math.min(min, max)));
  const qtyNum = parseInt(qtyText, 10);
  const qtyIsNumber = Number.isFinite(qtyNum) && qtyNum > 0;
  const belowMin = qtyIsNumber && qtyNum < min;
  const aboveMax = qtyIsNumber && qtyNum > max;
  const qtyValid = qtyIsNumber && !belowMin && !aboveMax;
  const qty = qtyValid ? qtyNum : 0;

  const nudge = (delta) => setQtyText((cur) => {
    const n = parseInt(cur, 10);
    const base = Number.isFinite(n) ? n : min;
    return String(Math.max(1, base + delta));
  });
  const dec = () => nudge(-1);
  const inc = () => nudge(1);

  const total = qty * listing.pricePerKg;

  // B5: the buyer sees the asking price with no idea whether it is fair. The
  // app already knows today's mandi rate for this crop in this district, so
  // show both. This is symmetric with what the farmer sees when pricing —
  // neither side is given an information edge the other lacks.
  const [mandi, setMandi] = useState(null);
  const [gradeSpec, setGradeSpec] = useState(null);
  // D3/D4: freshness AND crop-type come from ONE call — the model answers both
  // from a single forward pass. Fetched separately from the listing itself
  // because inference takes ~1s and the market returns 50 rows; a dead AI
  // service must cost one missing badge, not a blank screen.
  const [fresh, setFresh] = useState(null);
  // How this farmer's past lots held up. The other half of a self-declared grade.
  const [seller, setSeller] = useState(null);
  const [freshLoading, setFreshLoading] = useState(true);

  // A grade is SELF-DECLARED and nobody checks it at listing time. D3 can
  // corroborate freshness and crop type from a photo; it cannot judge size or
  // colour uniformity, and no public dataset would make that claim true.
  // So the check is reputational: how often did this farmer's lots get
  // complained about, and how often did they concede. Shown BEFORE buying.
  useEffect(() => {
    if (!listing?.farmerUid) return;
    let cancelled = false;
    axios.get(`${API_ENDPOINTS.USERS}/farmer-trust/${listing.farmerUid}`)
      .then((r) => { if (!cancelled && r.data.success) setSeller(r.data.trust); })
      .catch(() => { if (!cancelled) setSeller(null); });
    return () => { cancelled = true; };
  }, [listing?.farmerUid]);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_ENDPOINTS.LISTINGS}/${listing._id}/freshness`)
      .then((r) => { if (!cancelled) setFresh(r.data); })
      .catch(() => { if (!cancelled) setFresh(null); })
      .finally(() => { if (!cancelled) setFreshLoading(false); });
    return () => { cancelled = true; };
  }, [listing._id]);
  const listingDistrict = listing.location?.district;

  // The buyer reads the SAME criteria the farmer graded against — otherwise
  // "Grade A" is just a letter again.
  useEffect(() => {
    if (!listing.grade?.code || !listing.cropName) return;
    let cancelled = false;
    axios.get(`${API_ENDPOINTS.LISTINGS}/grade-spec`, { params: { crop: listing.cropName } })
      .then((r) => { if (!cancelled && r.data?.success) setGradeSpec(r.data.spec); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [listing.cropName, listing.grade?.code]);

  useEffect(() => {
    const commodity = listing.mandiName || listing.cropName;
    if (!listingDistrict || !commodity) return;
    let cancelled = false;
    axios
      .get(`${API_ENDPOINTS.MANDI}/sale-window`, { params: { commodity, district: listingDistrict } })
      .then((r) => { if (!cancelled && r.data?.success) setMandi(r.data.data); })
      .catch(() => { if (!cancelled) setMandi(null); });   // silent — never blocks buying
    return () => { cancelled = true; };
  }, [listingDistrict, listing.cropName, listing.mandiName]);

  const mandiPerKg =
    mandi?.stats?.todayModal != null ? mandi.stats.todayModal / 100 : null;
  // Positive = the listing is above the mandi rate.
  const vsMandiPct =
    mandiPerKg ? ((listing.pricePerKg - mandiPerKg) / mandiPerKg) * 100 : null;

  const proceed = () => {
    if (!qtyValid) return;
    navigation.navigate('BookTransport', { listing, quantityKg: qty, userData });
  };

  // ── C1: negotiate instead of just accepting the asking price ─────────
  // Instant-buy is kept as the fast path; this restores the farmer's side of
  // the trade. The offer holds no stock, so opening one costs the buyer
  // nothing and blocks nobody.
  const [offerOpen, setOfferOpen] = useState(false);
  const [bid, setBid] = useState(String(listing.pricePerKg));
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  // Phase 4, B2 — the offer used to silently borrow the quantity from the
  // buy-now stepper above with no field of its own, so negotiating a price
  // meant also accepting whatever quantity happened to be sitting there.
  // It gets its own text field, defaulting to the buy-now quantity only as a
  // STARTING point when the sheet opens — after that the two are independent.
  const [offerQtyText, setOfferQtyText] = useState(qtyText);
  const openOffer = () => {
    setOfferQtyText(qtyValid ? qtyText : String(min));
    setOfferOpen(true);
  };
  const offerQtyNum = parseInt(offerQtyText, 10);
  const offerQtyIsNumber = Number.isFinite(offerQtyNum) && offerQtyNum > 0;
  const offerBelowMin = offerQtyIsNumber && offerQtyNum < min;
  const offerAboveMax = offerQtyIsNumber && offerQtyNum > max;
  const offerQtyValid = offerQtyIsNumber && !offerBelowMin && !offerAboveMax;

  const nBid = parseFloat(bid);
  const bidTotal = nBid > 0 && offerQtyValid ? Math.round(nBid * offerQtyNum) : null;
  const bidVsAsking =
    nBid > 0 ? ((nBid - listing.pricePerKg) / listing.pricePerKg) * 100 : null;

  const sendOffer = async () => {
    if (!(nBid > 0)) return Alert.alert('Enter a price', 'Type your price per kg.');
    if (!offerQtyValid) {
      return Alert.alert(
        'Check the quantity',
        offerBelowMin
          ? `The farmer's minimum order is ${min} kg.`
          : offerAboveMax
            ? `Only ${max} kg is available.`
            : 'Enter how many kilograms you want.'
      );
    }
    setSending(true);
    try {
      const r = await axios.post(API_ENDPOINTS.OFFERS, {
        listingId: listing._id,
        quantityKg: offerQtyNum,
        offerPricePerKg: nBid,
        message: note,
      });
      if (r.data.success) {
        setOfferOpen(false);
        setNote('');
        Alert.alert(
          'Offer sent',
          `₹${nBid}/kg for ${offerQtyNum} kg. ${listing.farmerName || 'The farmer'} can accept, counter, or decline. You'll see the reply under My Offers.`
        );
      }
    } catch (err) {
      Alert.alert('Could not send', err.response?.data?.error || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        {listing.proofImageId && (
          <Image
            source={{ uri: API_ENDPOINTS.LISTING_PHOTO(listing.proofImageId) }}
            style={s.hero}
            resizeMode="cover"
          />
        )}

        <View style={s.card}>
          <View style={s.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.crop}>{listing.cropName}</Text>
              {!!listing.cropLocalName && <Text style={s.cropLocal}>{listing.cropLocalName}</Text>}
            </View>
            <View style={s.priceBox}>
              <Text style={s.priceLabel}>PER KG</Text>
              <Text style={s.price}>₹{listing.pricePerKg}</Text>
            </View>
          </View>

          {mandiPerKg != null && (
            <View style={s.mandiCompare}>
              <Ionicons name="stats-chart-outline" size={14} color="#6B7280" />
              <Text style={s.mandiCompareText}>
                asking <Text style={s.mandiStrong}>₹{listing.pricePerKg}/kg</Text>
                {'  ·  '}{listingDistrict} mandi{' '}
                <Text style={s.mandiStrong}>₹{mandiPerKg.toFixed(2)}/kg</Text>
                {' '}(₹{mandi.stats.todayModal.toLocaleString('en-IN')}/qtl)
              </Text>
              {vsMandiPct != null && Math.abs(vsMandiPct) >= 2 && (
                <View style={[s.vsPill, vsMandiPct > 0 ? s.vsPillOver : s.vsPillUnder]}>
                  <Text style={[s.vsPillText, { color: vsMandiPct > 0 ? '#B45309' : '#15803D' }]}>
                    {vsMandiPct > 0 ? '+' : ''}{vsMandiPct.toFixed(0)}%
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={s.divider} />

          <View style={s.chipRow}>
            {listing.distanceKm != null && (
              <View style={[s.chip, listing.isNear && s.chipBlue]}>
                <Ionicons name="navigate-outline" size={13} color={listing.isNear ? '#2563EB' : '#6B7280'} />
                <Text style={[s.chipText, listing.isNear && s.chipTextBlue]}>{listing.distanceKm} km away</Text>
              </View>
            )}
            <View style={s.chip}>
              <Ionicons name="location-outline" size={13} color="#6B7280" />
              <Text style={s.chipText}>
                {[listing.location?.city, listing.location?.district].filter(Boolean).join(', ')}
              </Text>
            </View>
            {!!listing.grade?.code && (
              <View style={[s.chip, s.chipGrade]}>
                <Ionicons name="ribbon-outline" size={13} color="#15803D" />
                <Text style={[s.chipText, { color: '#15803D', fontWeight: '700' }]}>
                  Grade {listing.grade.code}
                </Text>
              </View>
            )}
            {!!listing.gradeNote && (
              <View style={s.chip}>
                <Ionicons name="ribbon-outline" size={13} color="#6B7280" />
                <Text style={s.chipText}>{listing.gradeNote}</Text>
              </View>
            )}
          </View>

          {/* D3 freshness + D4 crop check. A refusal is shown as plainly as a
              pass — "not available for this crop" is information, and hiding
              it would imply the lot simply was not checked. */}
          {freshLoading && (
            <View style={s.freshRow}>
              <ActivityIndicator size="small" color="#16A34A" />
              <Text style={s.freshMuted}>Checking the proof photo…</Text>
            </View>
          )}

          {!freshLoading && fresh?.success && fresh.freshness && (
            <View style={[s.freshBox, fresh.freshness.fresh ? s.freshOk : s.freshBad]}>
              <Ionicons
                name={fresh.freshness.fresh ? 'shield-checkmark' : 'alert-circle'}
                size={19}
                color={fresh.freshness.fresh ? '#15803D' : '#B45309'} />
              <View style={{ flex: 1 }}>
                <Text style={[s.freshTitle, { color: fresh.freshness.fresh ? '#14532D' : '#7C2D12' }]}>
                  {fresh.freshness.badge}
                </Text>
                <Text style={s.freshMeta}>
                  {fresh.freshness.produce} · {Math.round(fresh.freshness.confidence * 100)}% confident ·
                  {' '}model is {fresh.freshness.modelAccuracyForThisProduce}% accurate on {fresh.freshness.produce.toLowerCase()}
                </Text>

                {/* D4 — the crop-type check, from the same forward pass. */}
                {fresh.freshness.cropCheck && (
                  fresh.freshness.cropCheck.matches ? (
                    <View style={s.verifyRow}>
                      <Ionicons name="checkmark-circle-outline" size={13} color="#15803D" />
                      <Text style={s.verifyOk}>
                        Lot verified — the photo matches {fresh.freshness.cropCheck.claimed}
                      </Text>
                    </View>
                  ) : (
                    <View style={s.mismatchBox}>
                      <Ionicons name="help-circle-outline" size={14} color="#B45309" />
                      <Text style={s.mismatchText}>{fresh.freshness.cropCheck.note}</Text>
                    </View>
                  )
                )}

                <Text style={s.freshScope}>{fresh.freshness.scope}</Text>
              </View>
            </View>
          )}

          {!freshLoading && fresh && fresh.success === false && fresh.error && (
            <View style={s.freshUnavail}>
              <Ionicons name="information-circle-outline" size={16} color="#9CA3AF" />
              <Text style={s.freshUnavailText}>
                {fresh.message || 'Freshness checking is not available for this lot.'}
                {fresh.reason ? ` ${fresh.reason}` : ''}
              </Text>
            </View>
          )}

          {!!listing.grade?.code && gradeSpec?.grades?.[listing.grade.code] && (
            <View style={s.gradeDetail}>
              <Text style={s.gradeDetailHead}>
                What Grade {listing.grade.code} means for {gradeSpec.commodity}
              </Text>
              {gradeSpec.grades[listing.grade.code].criteria.map((c, i) => (
                <Text key={i} style={s.gradeDetailItem}>• {c}</Text>
              ))}
              <Text style={s.gradeDetailNote}>{gradeSpec.disclaimer}</Text>
            </View>
          )}

          {/* What that self-declared grade is worth, given this seller's record. */}
          {!!seller && seller.deliveries > 0 && (() => {
            const SB = {
              clean:          { label: 'No quality complaints', fg: '#15803D', bg: '#DCFCE7', icon: 'checkmark-circle' },
              few_complaints: { label: 'Some complaints, none settled', fg: '#1D4ED8', bg: '#DBEAFE', icon: 'information-circle-outline' },
              some_upheld:    { label: 'Has refunded on quality before', fg: '#B45309', bg: '#FEF3C7', icon: 'alert-circle-outline' },
              frequent:       { label: 'Refunds on quality often', fg: '#B91C1C', bg: '#FEE2E2', icon: 'warning-outline' },
            };
            const b = seller.scored ? SB[seller.band] : null;
            return (
              <View style={[s.sellerBox, { backgroundColor: b ? b.bg : '#F1F5F9' }]}>
                <Ionicons name={b ? b.icon : 'help-circle-outline'} size={17} color={b ? b.fg : '#6B7280'} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.sellerLabel, { color: b ? b.fg : '#6B7280' }]}>
                    {b ? b.label : 'Not enough history on this seller'}
                  </Text>
                  <Text style={s.sellerLine}>
                    {seller.deliveries} delivered lot{seller.deliveries === 1 ? '' : 's'}
                    {seller.qualityDisputes > 0
                      ? ` · ${seller.qualityDisputes} disputed on quality · ${seller.conceded} settled by the farmer`
                      : ' · none disputed on quality'}
                  </Text>
                  {/* A complaint raised is not a complaint proven. Said here, not
                      left for the buyer to assume. */}
                  <Text style={s.sellerBasis}>
                    This app records what was claimed and what the two parties agreed. It does not judge disputes.
                  </Text>
                </View>
              </View>
            );
          })()}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Harvest details</Text>
          {[
            ['Farmer', listing.farmerName],
            ['Harvested', listing.harvestedAt
              ? new Date(listing.harvestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
              : '—'],
            ['Total harvested', listing.actualYieldKg ? `${listing.actualYieldKg} kg` : '—'],
            ['Listed', `${listing.quantityKg} kg`],
            ['Still available', `${listing.quantityAvailableKg} kg`],
            ['Minimum order', `${min} kg`],
            ['Variety', listing.variety || 'Standard'],
          ].map(([k, v]) => (
            <View key={k} style={s.row}>
              <Text style={s.rowKey}>{k}</Text>
              <Text style={s.rowVal}>{v}</Text>
            </View>
          ))}
          {!!listing.notes && (
            <View style={s.notesBox}>
              <Text style={s.notesLabel}>From the farmer</Text>
              <Text style={s.notesText}>{listing.notes}</Text>
            </View>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>How much do you want?</Text>
          <View style={s.stepper}>
            <TouchableOpacity style={s.stepBtn} onPress={dec}>
              <Ionicons name="remove" size={22} color="#15803D" />
            </TouchableOpacity>
            <View style={s.qtyBox}>
              <TextInput
                style={s.qtyInput}
                value={qtyText}
                onChangeText={setQtyText}
                keyboardType="number-pad"
                selectTextOnFocus
                accessibilityLabel="Quantity in kilograms"
              />
              <Text style={s.qtyUnit}>kg</Text>
            </View>
            <TouchableOpacity style={s.stepBtn} onPress={inc}>
              <Ionicons name="add" size={22} color="#15803D" />
            </TouchableOpacity>
          </View>

          {belowMin ? (
            <Text style={s.stepErr}>Can't order less than the farmer's minimum — {min} kg.</Text>
          ) : aboveMax ? (
            <Text style={s.stepErr}>Only {max} kg is available.</Text>
          ) : !qtyIsNumber ? (
            <Text style={s.stepErr}>Enter how many kilograms you want.</Text>
          ) : (
            <Text style={s.stepHint}>Minimum {min} kg · {max} kg available</Text>
          )}

          <View style={s.totalBox}>
            <View>
              <Text style={s.totalLabel}>CROP TOTAL</Text>
              <Text style={s.totalSub}>{qtyValid ? qty : '—'} kg × ₹{listing.pricePerKg}/kg</Text>
            </View>
            <Text style={s.totalValue}>₹{total.toLocaleString('en-IN')}</Text>
          </View>
          <Text style={s.stepHint}>Transport is quoted separately at the next step.</Text>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={s.ctaGhost} onPress={openOffer} activeOpacity={0.85}>
          <Ionicons name="pricetag-outline" size={17} color="#15803D" />
          <Text style={s.ctaGhostText}>Make an offer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.cta, !qtyValid && s.ctaOff]}
          onPress={proceed}
          activeOpacity={0.85}
          disabled={!qtyValid}
        >
          <Ionicons name="cube-outline" size={18} color="#fff" />
          <Text style={s.ctaText}>Buy at ₹{listing.pricePerKg}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={offerOpen} transparent animationType="slide" onRequestClose={() => setOfferOpen(false)}>
        <View style={s.sheetWrap}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>Make an offer</Text>
              <TouchableOpacity onPress={() => setOfferOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={s.sheetSub}>
              {listing.cropName} · farmer is asking ₹{listing.pricePerKg}/kg
            </Text>

            {/* Phase 4, B2 — its own quantity, not borrowed from the buy-now
                stepper. A negotiation can be over a different amount than
                whatever the stepper happened to show. */}
            <Text style={s.fieldLabel}>Quantity (kg)</Text>
            <TextInput
              style={s.input}
              value={offerQtyText}
              onChangeText={setOfferQtyText}
              keyboardType="number-pad"
              placeholder={String(min)}
              placeholderTextColor="#9CA3AF"
            />
            {offerBelowMin ? (
              <Text style={s.fieldErr}>Can't order less than the farmer's minimum — {min} kg.</Text>
            ) : offerAboveMax ? (
              <Text style={s.fieldErr}>Only {max} kg is available.</Text>
            ) : null}

            <Text style={s.fieldLabel}>Your price per kg (₹)</Text>
            <TextInput
              style={s.input}
              value={bid}
              onChangeText={setBid}
              keyboardType="numeric"
              placeholder={String(listing.pricePerKg)}
              placeholderTextColor="#9CA3AF"
            />

            {bidTotal != null && (
              <Text style={s.bidSummary}>
                ₹{bidTotal.toLocaleString('en-IN')} total
                {bidVsAsking != null && Math.abs(bidVsAsking) >= 1 && (
                  <Text style={{ color: bidVsAsking < 0 ? '#B45309' : '#15803D' }}>
                    {'  ·  '}{bidVsAsking > 0 ? '+' : ''}{bidVsAsking.toFixed(0)}% vs asking
                  </Text>
                )}
                {mandiPerKg != null && (
                  <Text style={{ color: '#6B7280' }}>
                    {'  ·  '}mandi ₹{mandiPerKg.toFixed(2)}/kg
                  </Text>
                )}
              </Text>
            )}

            <Text style={s.fieldLabel}>Message (optional)</Text>
            <TextInput
              style={[s.input, s.inputMulti]}
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Can collect tomorrow morning"
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={300}
            />

            <Text style={s.sheetNote}>
              Your offer doesn't reserve the crop — the farmer can still sell it to someone
              else while they decide. It expires in 48 hours.
            </Text>

            <TouchableOpacity
              style={[s.cta, sending && { opacity: 0.6 }]}
              onPress={sendOffer}
              disabled={sending}
              activeOpacity={0.85}
            >
              {sending ? <ActivityIndicator color="#fff" />
                : <><Ionicons name="send-outline" size={17} color="#fff" />
                    <Text style={s.ctaText}>Send offer</Text></>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll:    { padding: 16, gap: 12 },

  hero: { width: '100%', height: 220, borderRadius: 18, backgroundColor: '#F1F5F9' },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 5, borderWidth: 1, borderColor: '#F1F5F9',
  },
  titleRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  crop:      { fontSize: 22, fontWeight: '700', color: '#111827', letterSpacing: -0.3 },
  cropLocal: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  priceBox:  { alignItems: 'flex-end' },
  priceLabel:{ fontSize: 9, color: '#9CA3AF', fontWeight: '700', letterSpacing: 0.5 },
  price:     { fontSize: 22, fontWeight: '800', color: '#15803D' },

  freshRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  freshMuted: { fontSize: 12.5, color: '#9CA3AF' },
  freshBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 14, padding: 13, marginTop: 12, borderWidth: 1,
  },
  freshOk:  { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
  freshBad: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  freshTitle: { fontSize: 14.5, fontWeight: '800' },
  freshMeta: { fontSize: 11.5, color: '#6B7280', marginTop: 3, lineHeight: 16 },
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 },
  verifyOk: { fontSize: 12, fontWeight: '700', color: '#15803D' },
  mismatchBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: '#FEF3C7', borderRadius: 10, padding: 9, marginTop: 7,
  },
  mismatchText: { flex: 1, fontSize: 11.5, color: '#7C2D12', lineHeight: 16 },
  freshScope: { fontSize: 10.5, color: '#9CA3AF', marginTop: 7, lineHeight: 15 },
  freshUnavail: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 11, marginTop: 12,
  },
  freshUnavailText: { flex: 1, fontSize: 11.5, color: '#9CA3AF', lineHeight: 16 },
  chipGrade: { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
  gradeDetail: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  gradeDetailHead: { fontSize: 11.5, fontWeight: '800', color: '#374151', marginBottom: 5,
    textTransform: 'uppercase', letterSpacing: 0.3 },
  gradeDetailItem: { fontSize: 13, color: '#4B5563', lineHeight: 20 },
  sellerBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 14, padding: 12, marginTop: 10 },
  sellerLabel: { fontSize: 13.5, fontWeight: '800' },
  sellerLine: { fontSize: 12, color: '#6B7280', marginTop: 3, lineHeight: 17 },
  sellerBasis: { fontSize: 10.5, color: '#9CA3AF', marginTop: 5, lineHeight: 15 },
  gradeDetailNote: { fontSize: 11, color: '#9CA3AF', marginTop: 7, lineHeight: 16 },
  mandiCompare: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    backgroundColor: '#F8FAFC', borderRadius: 10, padding: 9, marginTop: 10,
  },
  mandiCompareText: { flex: 1, fontSize: 12, color: '#6B7280' },
  mandiStrong: { fontWeight: '700', color: '#111827' },
  vsPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  vsPillOver:  { backgroundColor: '#FEF3C7' },
  vsPillUnder: { backgroundColor: '#DCFCE7' },
  vsPillText: { fontSize: 11, fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#F1F5F9' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F8FAFC',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#E2E8F0',
  },
  chipText:     { fontSize: 12, color: '#374151', fontWeight: '500' },
  chipBlue:     { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  chipTextBlue: { color: '#2563EB', fontWeight: '700' },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  row:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  rowKey: { fontSize: 13.5, color: '#6B7280' },
  rowVal: { fontSize: 13.5, color: '#111827', fontWeight: '600' },

  notesBox:   { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 8 },
  notesLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '800', letterSpacing: 0.6, marginBottom: 4 },
  notesText:  { fontSize: 13.5, color: '#374151', lineHeight: 20 },

  stepper:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 4 },
  stepBtn: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: '#F0FDF4',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BBF7D0',
  },
  qtyBox:     { flexDirection: 'row', alignItems: 'baseline', gap: 4, minWidth: 96, justifyContent: 'center' },
  qtyInput: {
    fontSize: 32, fontWeight: '800', color: '#111827', textAlign: 'center',
    minWidth: 70, padding: 0,
  },
  qtyUnit:    { fontSize: 15, color: '#6B7280', fontWeight: '600' },
  stepHint:   { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
  stepErr:    { fontSize: 12, color: '#B91C1C', textAlign: 'center', fontWeight: '600' },

  totalBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#BBF7D0', marginTop: 8,
  },
  totalLabel: { fontSize: 9.5, color: '#15803D', fontWeight: '800', letterSpacing: 0.7 },
  totalSub:   { fontSize: 12, color: '#6B7280', marginTop: 2 },
  totalValue: { fontSize: 24, fontWeight: '800', color: '#15803D' },

  ctaGhost: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#DCFCE7', borderRadius: 14, paddingVertical: 14, flex: 1,
  },
  ctaGhostText: { color: '#15803D', fontSize: 15, fontWeight: '700' },
  ctaOff: { backgroundColor: '#CBD5E1' },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 20, paddingBottom: 30, gap: 4,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: '#111827' },
  sheetSub: { fontSize: 13, color: '#6B7280', marginBottom: 8 },
  fieldLabel: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginTop: 12, marginBottom: 6 },
  fieldErr: { fontSize: 11.5, color: '#B91C1C', fontWeight: '600', marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827',
    backgroundColor: '#fff',
  },
  inputMulti: { height: 74, textAlignVertical: 'top' },
  bidSummary: { fontSize: 13, color: '#111827', fontWeight: '600', marginTop: 8 },
  sheetNote: {
    fontSize: 12, color: '#6B7280', lineHeight: 17,
    backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginTop: 14, marginBottom: 14,
  },
  footer: {
    padding: 16, backgroundColor: '#fff', flexDirection: 'row', gap: 10,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  cta: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', paddingVertical: 15, borderRadius: 12,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Image, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { t as tr, DEFAULT_LANGUAGE } from '../../i18n/strings';
import { useLanguage } from '../../i18n/LanguageContext';

// Replaces the old "Mark as Harvested" + "Sell to Vendors" pair with one
// action. Harvesting and listing now happen in a single backend transaction,
// so a farmer can never end up with a harvested crop and no listing (or, far
// worse, a crop that failed to harvest and a plot stuck as 'active').
//
// Styled with the marketplace language (#F8FAFC / #16A34A / r18 cards), not
// the older COLORS palette the surrounding CropDetailScreen still uses.
//
// ⚠️ WHERE TO SELL IS ONE CHOICE, MADE HERE, NOT TWO SEPARATE SCREENS.
// REPORTED DIRECTLY: selling to your own FPO must be a genuine fork at the
// moment of posting a harvest — "either publish to the open market, or
// request it to my group" — not a market listing that a farmer separately,
// later, ALSO happens to sell to the FPO from a different screen. Under
// procurement mode, this modal offers both as one decision: `sellVia`
// ('market' | 'fpo'). Choosing 'fpo' still calls the exact same
// `harvest-and-list` endpoint (a listing must always come from a real
// harvest — no second form), but immediately follows it with
// `POST /:id/procure` on the listing it just created, in the SAME action —
// so from the farmer's side this reads as one decisive request to the group,
// not "post, then separately remember to go sell it."
export default function HarvestPostModal({ visible, onClose, crop, land, onPosted, language }) {
  // `language` prop kept for callers that still pass it, but the context wins:
  // a prop threaded from a parent goes stale the moment the toggle is tapped.
  const { lang } = useLanguage();
  const [photo, setPhoto] = useState(null);
  const [yieldKg, setYieldKg] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [grade, setGrade] = useState('');
  const [notes, setNotes] = useState('');
  const [posting, setPosting] = useState(false);
  const [mandi, setMandi] = useState(null);       // sale-window payload, or null
  const [mandiLoading, setMandiLoading] = useState(false);
  const [gradeSpec, setGradeSpec] = useState(null);
  const [gradeCode, setGradeCode] = useState(null);
  const [gradeOpen, setGradeOpen] = useState(false);

  // ── Where to sell: the open market, or a direct request to my FPO ──
  const [fpo, setFpo] = useState(null);           // this farmer's group, if any
  const [sellVia, setSellVia] = useState('market'); // 'market' | 'fpo'

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    axios.get(`${API_ENDPOINTS.FPOS}/mine`)
      .then((r) => { if (!cancelled && r.data?.success) setFpo(r.data.fpo || null); })
      .catch(() => { if (!cancelled) setFpo(null); });
    return () => { cancelled = true; };
  }, [visible]);

  // The group's own agreed rate for this crop at the CHOSEN grade — never an
  // average, never a fallback to another grade. Same refusal the group's own
  // rate table applies everywhere else it is read.
  const fpoRate = (fpo?.paymentMode === 'procurement' && gradeCode)
    ? (fpo.procurementRates || []).find(
        (r) => r.cropName.toLowerCase() === String(crop?.name).toLowerCase() && r.grade === gradeCode
      )?.ratePerKg ?? null
    : null;

  // C3: the published criteria for this crop, so the farmer picks a grade
  // against something fixed instead of typing a word only they understand.
  useEffect(() => {
    if (!visible || !crop?.name) return;
    let cancelled = false;
    axios
      .get(`${API_ENDPOINTS.LISTINGS}/grade-spec`, { params: { crop: crop.name } })
      .then((r) => { if (!cancelled && r.data?.success) setGradeSpec(r.data.spec); })
      .catch(() => { if (!cancelled) setGradeSpec(null); });
    return () => { cancelled = true; };
  }, [visible, crop?.name]);

  // B2/B3: the app already knows today's mandi rate for this crop in this
  // district, and the farmer was pricing blind without it. One call carries
  // both the benchmark price and the sell/hold read, so this does not need a
  // second round trip. Failure is silent by design — a missing benchmark must
  // never block posting a harvest.
  const district = land?.location?.district;
  const commodity = crop?.mandiName || crop?.name;

  useEffect(() => {
    if (!visible || !district || !commodity) return;
    let cancelled = false;
    setMandiLoading(true);
    axios
      .get(`${API_ENDPOINTS.MANDI}/sale-window`, { params: { commodity, district } })
      .then((r) => { if (!cancelled && r.data?.success) setMandi(r.data.data); })
      .catch(() => { if (!cancelled) setMandi(null); })
      .finally(() => { if (!cancelled) setMandiLoading(false); });
    return () => { cancelled = true; };
  }, [visible, district, commodity]);

  // Agmarknet quotes ₹/quintal; this screen prices in ₹/kg. 1 quintal = 100 kg.
  const mandiPerKg =
    mandi?.stats?.todayModal != null ? mandi.stats.todayModal / 100 : null;


  const reset = () => {
    setPhoto(null); setYieldKg(''); setQty(''); setPrice('');
    setMinOrder(''); setGrade(''); setNotes(''); setSellVia('market'); setGradeCode(null);
  };

  const close = () => { if (!posting) { reset(); onClose(); } };

  const pickPhoto = async (fromCamera) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', `Please allow ${fromCamera ? 'camera' : 'photo library'} access.`);
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;

    // Resize before upload: the photo is stored as a Buffer in MongoDB, and a
    // raw 4 MB phone JPEG would be wasteful there. ~1200px @ 0.6 lands around
    // 120 KB and is still clearly readable as proof.
    const shrunk = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );
    setPhoto(shrunk.uri);
  };

  const nYield = parseFloat(yieldKg);
  const nQty   = parseFloat(qty);
  const nPrice = parseFloat(price);
  // Selling to the FPO uses the group's own agreed rate, never the farmer's
  // typed price — there is nothing to type, the rate is fixed the moment a
  // grade is picked.
  const effectivePrice = sellVia === 'fpo' ? fpoRate : nPrice;

  // How the farmer's asking price compares. Null until they have typed one —
  // showing a gap against an empty field would read as "you are 100% below".
  // Must sit after nPrice: referencing it earlier is a temporal dead zone.
  // Only meaningful for an open-market ask; an FPO rate is not "your price".
  const gapPct =
    sellVia === 'market' && mandiPerKg && nPrice > 0 ? ((nPrice - mandiPerKg) / mandiPerKg) * 100 : null;
  // Amber only once they are meaningfully under; 2% absorbs rounding.
  const below = gapPct != null && gapPct < -2;
  const nMin   = parseFloat(minOrder || '1');
  const total  = (!isNaN(nQty) && effectivePrice > 0) ? nQty * effectivePrice : null;

  // Same rules the server enforces — shown early so the farmer isn't
  // bounced by the API after filling the whole form.
  const problem =
    !photo ? 'Add a photo of your harvest'
    : !(nYield > 0) ? 'Enter how many kg you harvested'
    : !(nQty > 0) ? 'Enter how much you want to sell'
    : nQty > nYield ? `You can sell at most ${nYield} kg`
    : sellVia === 'fpo' && !gradeCode ? 'Pick a grade — your group\'s rate is agreed per grade'
    : sellVia === 'fpo' && fpoRate == null ? `${fpo?.name || 'Your group'} has no agreed rate for this crop at this grade yet`
    : sellVia === 'market' && !(nPrice > 0) ? 'Enter your price per kg'
    : !(nMin > 0) || nMin > nQty ? `Minimum order must be between 1 and ${nQty || '…'} kg`
    : null;

  const submit = async () => {
    if (problem) { Alert.alert('Almost there', problem); return; }
    setPosting(true);
    try {
      const form = new FormData();
      form.append('proof', { uri: photo, type: 'image/jpeg', name: 'harvest.jpg' });
      form.append('actualYieldKg', String(nYield));
      form.append('quantityKg', String(nQty));
      form.append('pricePerKg', String(effectivePrice));
      form.append('minOrderKg', String(nMin));
      form.append('gradeNote', grade);
      if (gradeCode) form.append('gradeCode', gradeCode);
      form.append('notes', notes);

      const r = await axios.post(
        `${API_ENDPOINTS.CROPS}/${crop._id}/harvest-and-list`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 45000 }
      );

      if (!r.data.success) {
        Alert.alert('Could not post', r.data.message || 'Please try again.');
        return;
      }

      // ── Sell to FPO: the SAME action immediately requests the sale on the
      // listing just created, rather than leaving it as a separate step a
      // farmer has to remember to come back and do. ──────────────────────
      if (sellVia === 'fpo' && fpo?._id) {
        try {
          const pr = await axios.post(`${API_ENDPOINTS.FPOS}/${fpo._id}/procure`, {
            listingId: r.data.listing._id, quantityKg: nQty,
          });
          reset();
          onPosted(r.data.listing);
          Alert.alert(
            `Sold to ${fpo.name}`,
            `₹${(pr.data.sale.amountOwed || 0).toLocaleString('en-IN')} — ${pr.data.note || 'Recorded.'}`
          );
        } catch (procureErr) {
          // The harvest DID post — never hide that. Only the FPO leg failed,
          // and the listing is now sitting on the open market as a fallback
          // rather than vanishing with no record of the harvest at all.
          reset();
          onPosted(r.data.listing);
          Alert.alert(
            'Posted, but not sold to your group',
            `Your harvest was posted, but selling it to ${fpo.name} failed: `
            + `${procureErr.response?.data?.error || 'please try again from your group screen.'} `
            + 'It is on the open market for now.'
          );
        }
        return;
      }

      reset();
      onPosted(r.data.listing);
    } catch (err) {
      Alert.alert('Could not post', err.response?.data?.message || 'Check your connection and try again.');
    } finally {
      setPosting(false);
    }
  };

  const pickupLabel = land?.location
    ? [land.location.city, land.location.district].filter(Boolean).join(', ')
    : 'your registered land';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={s.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.sheet}
        >
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Post Harvest to Farm Market</Text>
              <Text style={s.subtitle}>{tr('harvest.subtitle', lang)}</Text>
            </View>
            <TouchableOpacity onPress={close} hitSlop={10}>
              <Ionicons name="close" size={26} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.body} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">

            {/* Crop + pickup, both read-only */}
            <View style={s.card}>
              <View style={s.cropRow}>
                <View style={s.cropIcon}><Text style={{ fontSize: 22 }}>🌾</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cropName}>{crop?.name}</Text>
                  <Text style={s.cropSub}>{crop?.localName}{crop?.variety ? ` · ${crop.variety}` : ''}</Text>
                </View>
              </View>
              <View style={s.divider} />
              <View style={s.chip}>
                <Ionicons name="location-outline" size={13} color="#6B7280" />
                <Text style={s.chipText}>Pickup: {pickupLabel}</Text>
              </View>
              <Text style={s.hint}>Buyers collect from your registered land.</Text>
            </View>

            {/* ── Where to sell — a genuine either/or, decided once, here.
                Only offered under a procurement-mode group: a facilitation
                group has no fixed rate to request against. */}
            {fpo?.paymentMode === 'procurement' && (
              <View style={s.card}>
                <Text style={s.label}>Where are you selling this?</Text>
                <View style={s.sellViaRow}>
                  <TouchableOpacity
                    style={[s.sellViaBtn, sellVia === 'market' && s.sellViaBtnOn]}
                    onPress={() => setSellVia('market')}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="storefront-outline" size={18} color={sellVia === 'market' ? '#15803D' : '#6B7280'} />
                    <Text style={[s.sellViaText, sellVia === 'market' && s.sellViaTextOn]}>Open Market</Text>
                    <Text style={s.sellViaSub}>Any buyer can see and offer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.sellViaBtn, sellVia === 'fpo' && s.sellViaBtnOn]}
                    onPress={() => setSellVia('fpo')}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="business-outline" size={18} color={sellVia === 'fpo' ? '#15803D' : '#6B7280'} />
                    <Text style={[s.sellViaText, sellVia === 'fpo' && s.sellViaTextOn]} numberOfLines={1}>{fpo.name}</Text>
                    <Text style={s.sellViaSub}>Direct request, group's own rate</Text>
                  </TouchableOpacity>
                </View>
                {sellVia === 'fpo' && (
                  <Text style={s.hint}>
                    This will not appear on the open market. Pick a grade below — {fpo.name}'s rate applies to that exact grade.
                  </Text>
                )}
              </View>
            )}

            {/* Proof photo */}
            <View style={s.card}>
              <Text style={s.label}>Harvest proof photo <Text style={s.req}>*</Text></Text>
              {photo ? (
                <View>
                  <Image source={{ uri: photo }} style={s.preview} />
                  <TouchableOpacity style={s.retake} onPress={() => setPhoto(null)}>
                    <Ionicons name="refresh" size={14} color="#16A34A" />
                    <Text style={s.retakeText}>Change photo</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.photoRow}>
                  <TouchableOpacity style={s.photoBtn} onPress={() => pickPhoto(true)}>
                    <Ionicons name="camera-outline" size={22} color="#16A34A" />
                    <Text style={s.photoBtnText}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.photoBtn} onPress={() => pickPhoto(false)}>
                    <Ionicons name="images-outline" size={22} color="#16A34A" />
                    <Text style={s.photoBtnText}>Gallery</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Quantities */}
            <View style={s.card}>
              <Text style={s.label}>How much did you harvest? (kg) <Text style={s.req}>*</Text></Text>
              <TextInput style={s.input} value={yieldKg} onChangeText={setYieldKg}
                placeholder="e.g. 480" keyboardType="numeric" placeholderTextColor="#9CA3AF" />
              {/* Deliberately kg, not crop.unit — a 500-plant tomato crop does
                  not yield 500 kg, and crop.unit may be 'plants' or 'saplings'. */}
              <Text style={s.hint}>Your crop was registered as {crop?.quantity} {crop?.unit}. Enter the actual weight in kg.</Text>

              <Text style={[s.label, { marginTop: 14 }]}>How much will you sell? (kg) <Text style={s.req}>*</Text></Text>
              <TextInput style={s.input} value={qty} onChangeText={setQty}
                placeholder={nYield > 0 ? String(nYield) : 'e.g. 400'} keyboardType="numeric" placeholderTextColor="#9CA3AF" />

              <Text style={[s.label, { marginTop: 14 }]}>Minimum order (kg)</Text>
              <TextInput style={s.input} value={minOrder} onChangeText={setMinOrder}
                placeholder="e.g. 25" keyboardType="numeric" placeholderTextColor="#9CA3AF" />
              <Text style={s.hint}>Buyers must buy at least this much. Leave blank for 1 kg.</Text>
            </View>

            {/* Price */}
            <View style={s.card}>
              {sellVia === 'fpo' ? (
                <>
                  <Text style={s.label}>Price per kg (₹)</Text>
                  <View style={s.fpoRateBox}>
                    <Ionicons name="business" size={16} color="#1D4ED8" />
                    <View style={{ flex: 1 }}>
                      <Text style={s.fpoRateText}>
                        {gradeCode
                          ? (fpoRate != null
                              ? `${fpo.name}'s agreed rate: ₹${fpoRate}/kg for Grade ${gradeCode}`
                              : `${fpo.name} has no agreed rate for Grade ${gradeCode} yet`)
                          : 'Pick a grade below to see the group\'s rate'}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.hint}>This is the group's own fixed rate, not something you set.</Text>
                </>
              ) : (
                <>
                  <Text style={s.label}>Price per kg (₹) <Text style={s.req}>*</Text></Text>
                  <TextInput style={s.input} value={price} onChangeText={setPrice}
                    placeholder="e.g. 28" keyboardType="numeric" placeholderTextColor="#9CA3AF" />

                  {/* B2: benchmark the farmer's price against today's mandi rate.
                      Amber below market, green at or above. Only renders once a
                      real rate came back — never a placeholder number. */}
                  {mandiLoading && (
                    <View style={s.mandiRow}>
                      <ActivityIndicator size="small" color="#16A34A" />
                      <Text style={s.mandiMuted}>Checking today's {district} mandi rate…</Text>
                    </View>
                  )}

                  {!mandiLoading && mandiPerKg != null && (
                    <View style={[s.mandiBox, below ? s.mandiBoxWarn : s.mandiBoxOk]}>
                      <Ionicons
                        name={below ? 'trending-down-outline' : 'trending-up-outline'}
                        size={16}
                        color={below ? '#B45309' : '#15803D'}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.mandiText, { color: below ? '#7C2D12' : '#14532D' }]}>
                          {district} mandi today ₹{mandi.stats.todayModal.toLocaleString('en-IN')}/quintal
                          {' '}(₹{mandiPerKg.toFixed(2)}/kg)
                        </Text>
                        {gapPct != null && (
                          <Text style={[s.mandiSub, { color: below ? '#9A3412' : '#15803D' }]}>
                            {below
                              ? `You are ${Math.abs(gapPct).toFixed(0)}% below the mandi rate`
                              : `You are ${gapPct.toFixed(0)}% at or above the mandi rate`}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}

                  {/* B3: the sell/hold read, from the same response. */}
                  {!mandiLoading && mandi?.action && mandi.action !== 'unknown' && (
                    <View style={s.adviceBox}>
                      <Text style={s.adviceTag}>
                        {mandi.action === 'hold' ? '⏳ CONSIDER HOLDING' : mandi.action === 'sell' ? '✅ GOOD TIME TO SELL' : '➖ STEADY'}
                      </Text>
                      <Text style={s.adviceText}>{mandi.reason}</Text>
                      {/* B4: the supply signal. Arrivals were computed for market
                          ranking and thrown away; heavy arrivals lead price falls
                          by a few days, which is exactly what a farmer deciding
                          when to sell needs to know. */}
                      {!!mandi.arrivals && mandi.arrivals.level !== 'normal' && (
                        <Text style={s.adviceArrivals}>
                          {mandi.arrivals.level === 'heavy' ? '📦 ' : '📉 '}{mandi.arrivals.note}
                        </Text>
                      )}
                      <Text style={s.adviceMeta}>
                        Based on {mandi.stats.points} days of {district} mandi data · {mandi.confidence} confidence
                        {mandi.arrivals?.provisionalDayExcluded
                          ? ` · arrivals as of ${new Date(mandi.arrivals.asOf).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                          : ''}
                      </Text>
                    </View>
                  )}
                </>
              )}

              <Text style={[s.label, { marginTop: 14 }]}>
                Grade{sellVia === 'fpo' ? <Text style={s.req}> *</Text> : null}
              </Text>
              {gradeSpec ? (
                <>
                  <View style={s.gradeRow}>
                    {Object.entries(gradeSpec.grades).map(([code, g]) => {
                      const on = gradeCode === code;
                      return (
                        <TouchableOpacity
                          key={code}
                          style={[s.gradeBtn, on && s.gradeBtnOn]}
                          onPress={() => setGradeCode(on ? null : code)}
                          activeOpacity={0.85}
                        >
                          <Text style={[s.gradeCode, on && s.gradeCodeOn]}>{code}</Text>
                          <Text style={[s.gradeSummary, on && s.gradeSummaryOn]} numberOfLines={2}>
                            {g.summary}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {!!gradeCode && (
                    <View style={s.criteriaBox}>
                      <Text style={s.criteriaHead}>{gradeSpec.headline} — Grade {gradeCode}</Text>
                      {gradeSpec.grades[gradeCode].criteria.map((c, i) => (
                        <Text key={i} style={s.criteriaItem}>• {c}</Text>
                      ))}
                    </View>
                  )}

                  <TouchableOpacity onPress={() => setGradeOpen(true)}>
                    <Text style={s.gradeHelp}>
                      {gradeSpec.generic
                        ? 'General criteria — no standard defined for this crop yet. See all grades'
                        : 'See all grades and criteria'}
                    </Text>
                  </TouchableOpacity>

                  <Text style={s.gradeDisclaimer}>{gradeSpec.disclaimer}</Text>
                </>
              ) : (
                <Text style={s.hint}>Loading grade criteria…</Text>
              )}

              <Text style={[s.label, { marginTop: 14 }]}>Anything else about condition</Text>
              <TextInput style={s.input} value={grade} onChangeText={setGrade}
                placeholder="e.g. freshly harvested this morning" placeholderTextColor="#9CA3AF"
                maxLength={120} />

              <Text style={[s.label, { marginTop: 14 }]}>Notes for buyers</Text>
              <TextInput style={[s.input, s.textarea]} value={notes} onChangeText={setNotes}
                placeholder="Anything a buyer should know" multiline placeholderTextColor="#9CA3AF" />
            </View>

            <Modal visible={gradeOpen} transparent animationType="slide"
              onRequestClose={() => setGradeOpen(false)}>
              <View style={s.gsWrap}>
                <View style={s.gsSheet}>
                  <View style={s.gsHead}>
                    <Text style={s.gsTitle}>{gradeSpec?.commodity} grades</Text>
                    <TouchableOpacity onPress={() => setGradeOpen(false)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="close" size={22} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={{ maxHeight: 420 }}>
                    {gradeSpec && Object.entries(gradeSpec.grades).map(([code, g]) => (
                      <View key={code} style={s.gsBlock}>
                        <Text style={s.gsCode}>Grade {code} — {g.summary}</Text>
                        {g.criteria.map((c, i) => (
                          <Text key={i} style={s.criteriaItem}>• {c}</Text>
                        ))}
                      </View>
                    ))}
                    <Text style={s.gradeDisclaimer}>{gradeSpec?.disclaimer}</Text>
                  </ScrollView>
                </View>
              </View>
            </Modal>

            {total != null && (
              <View style={s.totalCard}>
                <Text style={s.totalLabel}>{sellVia === 'fpo' ? 'IF FULLY SOLD TO YOUR GROUP' : 'IF FULLY SOLD'}</Text>
                <Text style={s.totalValue}>₹{total.toLocaleString('en-IN')}</Text>
                <Text style={s.totalSub}>{nQty} kg × ₹{effectivePrice}/kg</Text>
              </View>
            )}

            <View style={s.warnBox}>
              <Ionicons name="information-circle-outline" size={17} color="#C2410C" />
              <Text style={s.warnText}>
                {sellVia === 'fpo'
                  ? `This marks the crop harvested and immediately requests the sale to ${fpo?.name || 'your group'} — it will not appear on the open market.`
                  : 'Posting also marks this crop harvested and frees its plot for your next crop.'}
              </Text>
            </View>

            <TouchableOpacity
              style={[s.submit, (posting || problem) && s.submitOff, sellVia === 'fpo' && !problem && s.submitFpo]}
              onPress={submit}
              disabled={posting}
              activeOpacity={0.85}
            >
              {posting
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Ionicons name={sellVia === 'fpo' ? 'business' : 'storefront'} size={17} color="#fff" />
                    <Text style={s.submitText}>
                      {problem || (sellVia === 'fpo' ? `Sell to ${fpo?.name || 'my group'}` : 'Post to Farm Market')}
                    </Text>
                  </>}
            </TouchableOpacity>

            <View style={{ height: 24 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#F8FAFC', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14,
    backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title:    { fontSize: 18, fontWeight: '700', color: '#111827', letterSpacing: -0.2 },
  subtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  body:     { backgroundColor: '#F8FAFC' },

  sellViaRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  sellViaBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', backgroundColor: '#fff', gap: 4,
  },
  sellViaBtnOn: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  sellViaText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  sellViaTextOn: { color: '#15803D' },
  sellViaSub: { fontSize: 10, color: '#9CA3AF', textAlign: 'center' },
  fpoRateBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#EFF6FF', borderRadius: 12, padding: 13, marginTop: 6,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  fpoRateText: { fontSize: 13.5, color: '#1D4ED8', fontWeight: '700' },
  submitFpo: { backgroundColor: '#1D4ED8' },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 8,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 5, borderWidth: 1, borderColor: '#F1F5F9',
  },
  cropRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cropIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' },
  cropName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cropSub:  { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  divider:  { height: 1, backgroundColor: '#F1F5F9', marginVertical: 4 },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: '#F8FAFC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '500' },

  label: { fontSize: 13, fontWeight: '700', color: '#374151' },
  req:   { color: '#EA580C' },
  hint:  { fontSize: 11.5, color: '#9CA3AF', lineHeight: 16 },
  input: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 15, color: '#111827', marginTop: 6,
  },
  textarea: { height: 76, textAlignVertical: 'top' },

  photoRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  photoBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 20,
    backgroundColor: '#F0FDF4', borderRadius: 12, borderWidth: 1, borderColor: '#BBF7D0',
    borderStyle: 'dashed',
  },
  photoBtnText: { fontSize: 13, color: '#15803D', fontWeight: '700' },
  preview: { width: '100%', height: 190, borderRadius: 12, marginTop: 6, backgroundColor: '#F1F5F9' },
  retake:  { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 10 },
  retakeText: { fontSize: 13, color: '#16A34A', fontWeight: '700' },

  gradeRow: { flexDirection: 'row', gap: 8 },
  gradeBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', backgroundColor: '#fff',
  },
  gradeBtnOn: { borderColor: '#16A34A', backgroundColor: '#DCFCE7' },
  gradeCode: { fontSize: 18, fontWeight: '800', color: '#6B7280' },
  gradeCodeOn: { color: '#15803D' },
  gradeSummary: { fontSize: 10.5, color: '#9CA3AF', textAlign: 'center', marginTop: 3, lineHeight: 14 },
  gradeSummaryOn: { color: '#15803D' },
  criteriaBox: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  criteriaHead: { fontSize: 11.5, fontWeight: '800', color: '#374151', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: 0.3 },
  criteriaItem: { fontSize: 13, color: '#4B5563', lineHeight: 20 },
  gradeHelp: { fontSize: 12.5, color: '#16A34A', fontWeight: '600', marginTop: 10 },
  gradeDisclaimer: { fontSize: 11, color: '#9CA3AF', lineHeight: 16, marginTop: 8 },
  gsWrap: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  gsSheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28 },
  gsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  gsTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  gsBlock: { marginBottom: 16 },
  gsCode: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 5 },
  mandiRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  mandiMuted: { fontSize: 12, color: '#9CA3AF' },
  mandiBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, padding: 10, marginTop: 10, borderWidth: 1,
  },
  mandiBoxOk:   { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
  mandiBoxWarn: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  mandiText: { fontSize: 12.5, fontWeight: '600' },
  mandiSub:  { fontSize: 11.5, marginTop: 2 },
  adviceBox: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, marginTop: 8,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  adviceTag:  { fontSize: 10.5, fontWeight: '800', color: '#6B7280', letterSpacing: 0.4 },
  adviceText: { fontSize: 12.5, color: '#111827', marginTop: 4, lineHeight: 17 },
  adviceArrivals: { fontSize: 12, color: '#6B7280', marginTop: 6, lineHeight: 16 },
  adviceMeta: { fontSize: 10.5, color: '#9CA3AF', marginTop: 5 },
  totalCard: {
    backgroundColor: '#F0FDF4', borderRadius: 18, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  totalLabel: { fontSize: 9.5, fontWeight: '800', color: '#15803D', letterSpacing: 0.8 },
  totalValue: { fontSize: 30, fontWeight: '800', color: '#15803D', marginTop: 4 },
  totalSub:   { fontSize: 12, color: '#6B7280', marginTop: 2 },

  warnBox: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: '#FFF7ED', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  warnText: { flex: 1, fontSize: 12.5, color: '#C2410C', lineHeight: 18 },

  submit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', paddingVertical: 15, borderRadius: 12,
  },
  submitOff:  { backgroundColor: '#94A3B8' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

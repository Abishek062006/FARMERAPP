import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';
import { useLanguage } from '../../i18n/LanguageContext';

// Real FPO registry (SFAC), 213 rows. Separate from `Fpo` (the working
// membership + revenue-share model FpoScreen.jsx already owns) — this screen
// is the search/claim/join front door onto FpoMaster documents, which are
// either turned INTO a real Fpo (via a reviewed admin claim) or joined once
// someone else already has.
//
// Frontend copy of the district list. Metro's default project root is
// `frontend/`, so this cannot `require('../../../backend/data/districtCentroids')`
// — kept in sync by hand with backend/data/districtCentroids.js
// (MH_DISTRICT_CENTROIDS, 35 districts as of this writing).
const MH_DISTRICTS = [
  'Ahilyanagar', 'Akola', 'Amravati', 'Beed', 'Bhandara', 'Buldhana',
  'Chandrapur', 'Chhatrapati Sambhajinagar', 'Dhule', 'Dharashiv',
  'Gadchiroli', 'Gondia', 'Hingoli', 'Jalgaon', 'Jalna', 'Kolhapur', 'Latur',
  'Mumbai City', 'Mumbai Suburban', 'Nagpur', 'Nanded', 'Nandurbar', 'Nashik',
  'Palghar', 'Parbhani', 'Pune', 'Raigad', 'Ratnagiri', 'Sangli', 'Satara',
  'Sindhudurg', 'Solapur', 'Thane', 'Wardha', 'Washim', 'Yavatmal',
];

// Same reason as MH_DISTRICTS above — a copy of the crop names from
// backend/data/agroZones.js's CROPS list, English display names only (the
// backend does not yet filter on this, see the note by CROP_FILTER_LIVE
// below).
const MH_CROPS = [
  'Rice (Paddy)', 'Jowar (Sorghum)', 'Bajra (Pearl Millet)', 'Wheat', 'Maize',
  'Ragi (Nachani)', 'Tur (Pigeon Pea)', 'Gram (Harbhara)', 'Green Gram (Moong)',
  'Black Gram (Udid)', 'Soyabean', 'Cotton', 'Groundnut', 'Sunflower',
  'Safflower (Karadi)', 'Sesamum (Til)', 'Tomato', 'Brinjal', 'Okra (Bhendi)',
  'Onion', 'Potato', 'Garlic', 'Cabbage', 'Cauliflower', 'Carrot',
  'Turmeric (Halad)', 'Ginger (Aale)', 'Grapes', 'Pomegranate (Dalimb)',
  'Banana', 'Orange (Nagpur Santra)', 'Mango (Alphonso/Hapus)', 'Sugarcane',
];

// The backend route (routes/fpoMaster.js) accepts `crop` but currently
// IGNORES it — a real FPO's SFAC registry entry does not record what its
// members grow. Sending it is forward-compatible; this flag just keeps the
// UI honest about what the results actually reflect today.
const CROP_FILTER_LIVE = false;

const DESIGNATIONS = ['CEO', 'Manager', 'Director', 'Authorized Representative'];

export default function FpoRegistryScreen({ route }) {
  const { t } = useLanguage();
  const { userData } = route.params || {};

  const [district, setDistrict] = useState('');
  const [districtPickerOpen, setDistrictPickerOpen] = useState(false);
  const [block, setBlock] = useState('');
  const [crop, setCrop] = useState('');

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searched, setSearched] = useState(false);

  const [mine, setMine] = useState(null);   // this farmer's own FPO membership, or null
  const [mineLoading, setMineLoading] = useState(true);

  // ── WHO IS LOOKING AT THIS SCREEN ───────────────────────────────────────
  // Both actors reach it, and they came for opposite things:
  //   a FARMER  is looking for a group to JOIN (and may claim one, for the
  //             legacy shape where a farmer really is their group's officer)
  //   an FPO    is looking for its OWN company to CLAIM. It can never join —
  //             POST /api/fpos/:id/join is `requireRole('farmer')` and would
  //             403 — so the join button is not shown to it at all rather than
  //             offered and then refused. An organisation does not join itself.
  const isFpoAccount = userData?.role === 'fpo';

  const [claimTarget, setClaimTarget] = useState(null);  // FpoMaster row being claimed
  const [claimName, setClaimName] = useState('');
  const [claimMobile, setClaimMobile] = useState('');
  const [claimDesignation, setClaimDesignation] = useState(DESIGNATIONS[0]);
  const [claimEmail, setClaimEmail] = useState('');
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimSubmitted, setClaimSubmitted] = useState(null); // fpoMasterId that was just claimed

  const [joinBusy, setJoinBusy] = useState(null);   // linkedFpoId currently joining
  const [joinSent, setJoinSent] = useState({});     // linkedFpoId -> true once sent

  // `mine` exists to grey out the JOIN button for someone already in a group.
  // An FPO account has no membership to ask about — `/mine` is farmer-only and
  // would 403 on every load — so it is not asked. Skipping the call is not an
  // optimisation: a silent 403 on mount is how a real failure later gets
  // mistaken for the expected one.
  const fetchMine = useCallback(async () => {
    if (isFpoAccount) { setMine(null); setMineLoading(false); return; }
    try {
      const r = await axios.get(`${API_ENDPOINTS.FPOS}/mine`);
      setMine(r.data?.fpo || null);
    } catch (e) {
      setMine(null);
    } finally {
      setMineLoading(false);
    }
  }, [isFpoAccount]);

  const runSearch = useCallback(async (opts = {}) => {
    const d = opts.district !== undefined ? opts.district : district;
    const b = opts.block !== undefined ? opts.block : block;
    const c = opts.crop !== undefined ? opts.crop : crop;
    setLoading(true);
    try {
      const params = {};
      if (d) params.district = d;
      if (b) params.block = b;
      if (c) params.crop = c;
      const r = await axios.get(`${API_ENDPOINTS.FPO_MASTER}/search`, { params });
      setResults(r.data?.fpos || []);
      setSearched(true);
    } catch (e) {
      Alert.alert(t('fpoRegistry.searchFailedTitle'), e.response?.data?.error || t('fpoRegistry.tryAgain'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [district, block, crop, t]);

  useEffect(() => { fetchMine(); }, [fetchMine]);

  const pickDistrict = (d) => {
    setDistrict(d);
    setDistrictPickerOpen(false);
    runSearch({ district: d });
  };

  const openClaim = (item) => {
    setClaimTarget(item);
    setClaimName(userData?.name || '');
    setClaimMobile(userData?.phone || '');
    setClaimDesignation(DESIGNATIONS[0]);
    setClaimEmail(userData?.email || '');
  };

  const submitClaim = async () => {
    if (!claimTarget) return;
    if (!claimName.trim()) return Alert.alert(t('fpoClaim.missingTitle'), t('fpoClaim.nameRequired'));
    if (!claimMobile.trim()) return Alert.alert(t('fpoClaim.missingTitle'), t('fpoClaim.mobileRequired'));
    setClaimBusy(true);
    try {
      const r = await axios.post(`${API_ENDPOINTS.FPO_MASTER}/${claimTarget._id}/claim`, {
        name: claimName.trim(),
        mobile: claimMobile.trim(),
        designation: claimDesignation,
        email: claimEmail.trim(),
      });
      if (r.data.success) {
        setClaimSubmitted(claimTarget._id);
        setResults((rs) => rs.map((f) => (f._id === claimTarget._id ? { ...f, claimStatus: 'pending' } : f)));
        setClaimTarget(null);
      }
    } catch (e) {
      const code = e.response?.data?.code;
      const msg = code === 'ALREADY_CLAIMED'
        ? t('fpoClaim.errAlreadyClaimed')
        : code === 'ALREADY_IN_PROGRESS'
          ? t('fpoClaim.errAlreadyInProgress')
          : e.response?.data?.error || t('fpoRegistry.tryAgain');
      Alert.alert(t('fpoClaim.couldNotSubmit'), msg);
    } finally {
      setClaimBusy(false);
    }
  };

  const requestJoin = (item) => {
    if (mine) return; // already in a group — button is greyed out, this is a belt-and-braces guard
    Alert.alert(
      `${t('fpoRegistry.joinPrefix')} ${item.fpoName}?`,
      t('fpoRegistry.joinMsg'),
      [{ text: t('fpo.cancel'), style: 'cancel' }, {
        text: t('fpo.join'),
        onPress: async () => {
          setJoinBusy(item.linkedFpoId);
          try {
            await axios.post(`${API_ENDPOINTS.FPOS}/${item.linkedFpoId}/join`);
            setJoinSent((j) => ({ ...j, [item.linkedFpoId]: true }));
          } catch (e) {
            Alert.alert(t('fpo.couldNotJoin'), e.response?.data?.error || t('fpo.tryAgain'));
          } finally {
            setJoinBusy(null);
          }
        },
      }],
    );
  };

  const renderAction = (item) => {
    if (item.claimStatus === 'unclaimed') {
      return (
        <TouchableOpacity style={s.actionBtn} onPress={() => openClaim(item)}>
          <Ionicons name="ribbon-outline" size={15} color="#15803D" />
          <Text style={s.actionText}>{t('fpoRegistry.claimThisFpo')}</Text>
        </TouchableOpacity>
      );
    }
    if (item.claimStatus === 'approved' && item.linkedFpoId) {
      // An FPO account is shown WHY there is no action here rather than a
      // greyed-out button it could never have used.
      if (isFpoAccount) {
        return <Text style={s.infoText}>{t('fpoRegistry.alreadyClaimedNote')}</Text>;
      }
      if (joinSent[item.linkedFpoId]) {
        return <Text style={s.infoText}>{t('fpoRegistry.joinRequestSent')}</Text>;
      }
      if (mine) {
        return (
          <View>
            <TouchableOpacity style={[s.actionBtn, s.actionBtnDisabled]} disabled>
              <Ionicons name="people-outline" size={15} color="#9CA3AF" />
              <Text style={s.actionTextDisabled}>{t('fpoRegistry.requestToJoin')}</Text>
            </TouchableOpacity>
            <Text style={s.disabledHint}>{t('fpoRegistry.alreadyInGroupHint')}</Text>
          </View>
        );
      }
      return (
        <TouchableOpacity
          style={s.actionBtn}
          onPress={() => requestJoin(item)}
          disabled={joinBusy === item.linkedFpoId}
        >
          {joinBusy === item.linkedFpoId
            ? <ActivityIndicator color="#15803D" size="small" />
            : <><Ionicons name="people-outline" size={15} color="#15803D" />
                <Text style={s.actionText}>{t('fpoRegistry.requestToJoin')}</Text></>}
        </TouchableOpacity>
      );
    }
    if (item.claimStatus === 'pending') {
      return <Text style={s.infoText}>{t('fpoRegistry.claimPendingNote')}</Text>;
    }
    if (item.claimStatus === 'rejected') {
      return <Text style={s.infoText}>{t('fpoRegistry.claimRejectedNote')}</Text>;
    }
    return null;
  };

  return (
    <View style={s.container}>
      <View style={s.filterCard}>
        <Text style={s.filterLabel}>{t('fpoRegistry.stateLabel')}</Text>
        <View style={[s.pickerBox, s.pickerBoxDisabled]}>
          <Text style={s.pickerBoxText}>Maharashtra</Text>
        </View>

        <Text style={s.filterLabel}>{t('fpoRegistry.districtLabel')}</Text>
        <TouchableOpacity style={s.pickerBox} onPress={() => setDistrictPickerOpen(true)}>
          <Text style={district ? s.pickerBoxText : s.pickerBoxPlaceholder}>
            {district || t('fpoRegistry.chooseDistrict')}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#6B7280" />
        </TouchableOpacity>

        <Text style={s.filterLabel}>{t('fpoRegistry.talukaLabel')}</Text>
        <TextInput
          style={s.textInput}
          value={block}
          onChangeText={setBlock}
          onSubmitEditing={() => runSearch()}
          placeholder={t('fpoRegistry.talukaPlaceholder')}
          placeholderTextColor="#9CA3AF"
        />

        <Text style={s.filterLabel}>{t('fpoRegistry.cropLabel')}</Text>
        <View style={s.pickerBoxRow}>
          <Picker
            selectedValue={crop}
            onValueChange={(v) => { setCrop(v); runSearch({ crop: v }); }}
            style={s.picker}
          >
            <Picker.Item label={t('fpoRegistry.anyCrop')} value="" />
            {MH_CROPS.map((c) => <Picker.Item key={c} label={c} value={c} />)}
          </Picker>
        </View>
        {!CROP_FILTER_LIVE && (
          <View style={s.noticeRow}>
            <Ionicons name="information-circle-outline" size={14} color="#9CA3AF" />
            <Text style={s.noticeText}>{t('fpoRegistry.cropNotFilteringYet')}</Text>
          </View>
        )}

        <TouchableOpacity style={s.searchBtn} onPress={() => runSearch()} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" size="small" />
            : <><Ionicons name="search" size={16} color="#fff" />
                <Text style={s.searchBtnText}>{t('fpoRegistry.search')}</Text></>}
        </TouchableOpacity>
      </View>

      <FlatList
        data={results}
        keyExtractor={(i) => String(i._id)}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor="#16A34A"
          onRefresh={() => { setRefreshing(true); runSearch(); }} />}
        ListEmptyComponent={
          !loading && searched ? (
            <View style={s.emptyWrap}>
              <View style={s.emptyIcon}><Ionicons name="search-outline" size={28} color="#16A34A" /></View>
              <Text style={s.emptyTitle}>{t('fpoRegistry.noResultsTitle')}</Text>
              <Text style={s.emptySub}>{t('fpoRegistry.noResultsSub')}</Text>
            </View>
          ) : !loading && !searched ? (
            <View style={s.emptyWrap}>
              <View style={s.emptyIcon}><Ionicons name="business-outline" size={28} color="#16A34A" /></View>
              <Text style={s.emptyTitle}>{t('fpoRegistry.startTitle')}</Text>
              <Text style={s.emptySub}>{t('fpoRegistry.startSub')}</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.cardTitle}>{item.fpoName}</Text>
            <Text style={s.cardMeta}>
              {item.district}{item.block ? ` · ${item.block}` : ''}
            </Text>
            {!!item.cbboName && (
              <Text style={s.cardSub}>{t('fpoRegistry.promotedByPrefix')} {item.cbboName}</Text>
            )}
            {!!item.dateOfIncorporation && (
              <Text style={s.cardSub}>{t('fpoRegistry.incorporatedPrefix')} {item.dateOfIncorporation}</Text>
            )}
            <View style={s.cardActionRow}>{renderAction(item)}</View>
          </View>
        )}
      />

      {/* District picker */}
      <Modal visible={districtPickerOpen} transparent animationType="slide"
        onRequestClose={() => setDistrictPickerOpen(false)}>
        <View style={s.sheetWrap}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>{t('fpoRegistry.districtLabel')}</Text>
              <TouchableOpacity onPress={() => setDistrictPickerOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={MH_DISTRICTS}
              keyExtractor={(d) => d}
              style={{ maxHeight: 380 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.districtRow} onPress={() => pickDistrict(item)}>
                  <Text style={s.districtRowText}>{item}</Text>
                  {district === item && <Ionicons name="checkmark" size={18} color="#16A34A" />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Claim form */}
      <Modal visible={!!claimTarget} transparent animationType="slide"
        onRequestClose={() => setClaimTarget(null)}>
        <View style={s.sheetWrap}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>{t('fpoClaim.title')}</Text>
              <TouchableOpacity onPress={() => setClaimTarget(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={s.sheetSub}>{claimTarget?.fpoName}</Text>
            <Text style={s.claimIntro}>{t('fpoClaim.intro')}</Text>

            <Text style={s.label}>{t('fpoClaim.nameLabel')} <Text style={s.req}>*</Text></Text>
            <TextInput style={s.input} value={claimName} onChangeText={setClaimName}
              placeholder={t('fpoClaim.namePlaceholder')} placeholderTextColor="#9CA3AF" />

            <Text style={s.label}>{t('fpoClaim.mobileLabel')} <Text style={s.req}>*</Text></Text>
            <TextInput style={s.input} value={claimMobile} onChangeText={setClaimMobile}
              placeholder={t('fpoClaim.mobilePlaceholder')} placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad" />

            <Text style={s.label}>{t('fpoClaim.designationLabel')} <Text style={s.req}>*</Text></Text>
            <View style={s.pickerBoxRow}>
              <Picker selectedValue={claimDesignation} onValueChange={setClaimDesignation} style={s.picker}>
                {DESIGNATIONS.map((d) => <Picker.Item key={d} label={d} value={d} />)}
              </Picker>
            </View>

            <Text style={s.label}>{t('fpoClaim.emailLabel')}</Text>
            <TextInput style={s.input} value={claimEmail} onChangeText={setClaimEmail}
              placeholder={t('fpoClaim.emailPlaceholder')} placeholderTextColor="#9CA3AF"
              keyboardType="email-address" autoCapitalize="none" />

            <TouchableOpacity style={[s.cta, claimBusy && { opacity: 0.6 }]} onPress={submitClaim} disabled={claimBusy}>
              {claimBusy ? <ActivityIndicator color="#fff" />
                : <><Ionicons name="ribbon-outline" size={17} color="#fff" />
                    <Text style={s.ctaText}>{t('fpoClaim.submit')}</Text></>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Claim submitted confirmation */}
      <Modal visible={!!claimSubmitted} transparent animationType="fade"
        onRequestClose={() => setClaimSubmitted(null)}>
        <View style={s.confirmOverlay}>
          <View style={s.confirmCard}>
            <View style={s.emptyIcon}><Ionicons name="checkmark-circle-outline" size={30} color="#16A34A" /></View>
            <Text style={s.confirmTitle}>{t('fpoClaim.submittedTitle')}</Text>
            <Text style={s.confirmSub}>{t('fpoClaim.submittedSub')}</Text>
            <TouchableOpacity style={s.cta} onPress={() => setClaimSubmitted(null)}>
              <Text style={s.ctaText}>{t('fpoClaim.gotIt')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  list: { padding: 16, paddingTop: 8, gap: 12, paddingBottom: 40 },

  filterCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, margin: 16, marginBottom: 4,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  filterLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginTop: 12, marginBottom: 6 },
  pickerBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  pickerBoxDisabled: { backgroundColor: '#F8FAFC' },
  pickerBoxText: { fontSize: 14.5, color: '#111827', fontWeight: '600' },
  pickerBoxPlaceholder: { fontSize: 14.5, color: '#9CA3AF' },
  pickerBoxRow: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, overflow: 'hidden' },
  picker: { color: '#111827' },
  textInput: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14.5, color: '#111827',
  },
  noticeRow: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontSize: 11, color: '#9CA3AF', lineHeight: 15 },

  searchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 14, marginTop: 16,
  },
  searchBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '700' },

  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  cardTitle: { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  cardMeta: { fontSize: 12.5, color: '#6B7280', marginTop: 4 },
  cardSub: { fontSize: 12, color: '#9CA3AF', marginTop: 3 },
  cardActionRow: { marginTop: 12 },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#DCFCE7', borderRadius: 12, paddingVertical: 11,
  },
  actionBtnDisabled: { backgroundColor: '#F3F4F6' },
  actionText: { color: '#15803D', fontSize: 13.5, fontWeight: '700' },
  actionTextDisabled: { color: '#9CA3AF', fontSize: 13.5, fontWeight: '700' },
  disabledHint: { fontSize: 11, color: '#9CA3AF', marginTop: 6, lineHeight: 15 },
  infoText: { fontSize: 12.5, color: '#9CA3AF', fontStyle: 'italic' },

  emptyWrap: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 },
  emptyIcon: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  emptyTitle: { fontSize: 15.5, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 5, lineHeight: 19 },

  sheetWrap: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  sheetSub: { fontSize: 14, fontWeight: '700', color: '#15803D', marginTop: 6 },
  claimIntro: { fontSize: 12.5, color: '#6B7280', marginTop: 6, lineHeight: 18 },

  districtRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  districtRowText: { fontSize: 14.5, color: '#111827' },

  label: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginTop: 14, marginBottom: 6 },
  req: { color: '#DC2626' },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827',
  },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 15, marginTop: 18,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  confirmOverlay: {
    flex: 1, backgroundColor: 'rgba(17,24,39,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  confirmCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 22, width: '100%',
    alignItems: 'center',
  },
  confirmTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginTop: 4 },
  confirmSub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 6, lineHeight: 19 },
});

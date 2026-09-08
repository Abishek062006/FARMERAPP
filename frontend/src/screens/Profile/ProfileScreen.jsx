import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { signOut, PhoneAuthProvider, linkWithCredential } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../../utils/firebase';
import { API_ENDPOINTS, PHONE_AUTH_ENABLED } from '../../utils/config';
import { COLORS } from '../../constants/colors';
import UserAvatar from '../../components/UserAvatar';
import ProfileCard from '../../components/ProfileCard';
import RecaptchaModal from '../../components/auth/RecaptchaModal';

const ProfileScreen = ({ navigation, route }) => {
  const [userData, setUserData] = useState(route.params?.userData || null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [phoneAuth, setPhoneAuth] = useState(null);
  const recaptcha = useRef(null);

  // Whether this account can already sign in by phone. Read from the server
  // rather than from `userData`, which is a snapshot taken at login.
  useEffect(() => {
    // No point asking the server about a feature the user cannot reach.
    if (!PHONE_AUTH_ENABLED) return undefined;
    let alive = true;
    (async () => {
      try {
        const r = await axios.get(`${API_ENDPOINTS.USERS}/firebase/${auth.currentUser?.uid}`);
        if (alive && r.data?.success) setPhoneAuth(r.data.user?.phoneAuth || null);
      } catch { /* the card just shows "Not set up" */ }
    })();
    return () => { alive = false; };
  }, []);

  /**
   * Add phone sign-in to THIS account, keeping its uid.
   *
   * ⚠️ THE ORDER MATTERS. `linkWithCredential` attaches the phone to the
   * account already signed in, so the uid never changes and no order,
   * settlement or grievance is orphaned. Signing in with the phone FIRST would
   * mint a second uid and a second, empty profile — which is exactly why the
   * phone LOGIN screen never tries to adopt an account by matching a number.
   *
   * ⚠️ NOT `Alert.prompt` — that is iOS-only and every user of this app is on
   * Android, so a prompt-based flow would have been a dead control on the only
   * platform that matters here.
   */
  const [linkStep, setLinkStep] = useState(null);      // null | 'number' | 'code'
  const [linkNum, setLinkNum] = useState('');
  const [linkCode, setLinkCode] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const verificationId = useRef(null);

  const openLink = () => {
    setLinkNum(String(userData?.phone || '').replace(/\D/g, '').slice(-10));
    setLinkCode('');
    setLinkStep('number');
  };

  const sendLinkCode = async () => {
    const digits = linkNum.replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) return Alert.alert('Check the number', 'Enter the 10-digit mobile number.');
    setLinkBusy(true);
    try {
      const provider = new PhoneAuthProvider(auth);
      verificationId.current = await provider.verifyPhoneNumber(`+91${digits}`, recaptcha.current);
      setLinkStep('code');
    } catch (err) {
      if (err?.message === 'cancelled') return;
      if (err?.code === 'auth/operation-not-allowed') {
        Alert.alert('Phone sign-in is switched off',
          'The Phone provider is not enabled on this Firebase project yet '
          + '(Firebase Console → Authentication → Sign-in method → Phone).');
      } else {
        Alert.alert('Could not send the code', err?.message || 'Please try again.');
      }
    } finally { setLinkBusy(false); }
  };

  const finishLink = async () => {
    if (!/^\d{6}$/.test(linkCode)) return Alert.alert('Check the code', 'Enter the 6-digit code.');
    setLinkBusy(true);
    try {
      const cred = PhoneAuthProvider.credential(verificationId.current, linkCode.trim());
      await linkWithCredential(auth.currentUser, cred);
      // ⚠️ FORCE A TOKEN REFRESH. The cached ID token was minted BEFORE the
      // link and does not carry `phone_number`, so the server would refuse it
      // with PHONE_NOT_LINKED — correctly, because the old token proves nothing.
      await auth.currentUser.getIdToken(true);
      const r = await axios.post(`${API_ENDPOINTS.USERS}/me/link-phone`, {});
      if (r.data?.success) {
        setPhoneAuth(r.data.phoneAuth);
        setLinkStep(null);
        Alert.alert('Done', 'You can now sign in with your phone number.');
      }
    } catch (err) {
      const c = err?.code || err?.response?.data?.code;
      if (c === 'auth/credential-already-in-use' || c === 'PHONE_ON_ANOTHER_ACCOUNT') {
        Alert.alert('Already in use', 'That number is already the sign-in phone for another account.');
      } else if (c === 'auth/invalid-verification-code') {
        Alert.alert('Wrong code', 'That code did not match.');
      } else {
        Alert.alert('Could not link', err?.response?.data?.error || err?.message || 'Please try again.');
      }
    } finally { setLinkBusy(false); }
  };

  const uploadProfilePhoto = async (localUri) => {
    setUploadingPhoto(true);
    try {
      const response = await fetch(localUri);
      const blob = await response.blob();
      const photoRef = ref(storage, `profileImages/${auth.currentUser.uid}.jpg`);
      await uploadBytes(photoRef, blob);
      const downloadUrl = await getDownloadURL(photoRef);

      await axios.put(`${API_ENDPOINTS.USERS}/${auth.currentUser.uid}`, {
        profileImage: downloadUrl,
      });

      setUserData((prev) => ({ ...prev, profileImage: downloadUrl }));
      Alert.alert('Success', 'Profile photo updated!');
    } catch (error) {
      console.error('Error uploading photo:', error);
      Alert.alert('Error', 'Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleImagePick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant photo library access');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      uploadProfilePhoto(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera access');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      uploadProfilePhoto(result.assets[0].uri);
    }
  };

  const handleImageOptions = () => {
    Alert.alert('Profile Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: handleTakePhoto },
      { text: 'Choose from Gallery', onPress: handleImagePick },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(auth);
          } catch (error) {
            console.error('Logout error:', error);
            Alert.alert('Error', 'Failed to logout. Please try again.');
          }
        },
      },
    ]);
  };

  const getRoleBadge = () => {
    const role = userData?.role;
    if (role === 'farmer') return { icon: '🌾', color: '#4CAF50' };
    if (role === 'vendor') return { icon: '🏪', color: '#FF9800' };
    if (role === 'agent') return { icon: '👔', color: '#2196F3' };
    return { icon: '👤', color: COLORS.primary };
  };

  if (!userData) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const roleBadge = getRoleBadge();

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.headerPlaceholder} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.profileSection}>
            {uploadingPhoto ? (
              <View style={styles.avatarLoading}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            ) : (
              <UserAvatar
                uri={userData.profileImage}
                name={userData.name}
                size={120}
                onPress={handleImageOptions}
                editable={true}
              />
            )}

            <Text style={styles.name}>{userData.name}</Text>

            <View style={[styles.roleBadge, { backgroundColor: roleBadge.color }]}>
              <Text style={styles.roleBadgeText}>
                {roleBadge.icon} {userData.role?.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>Personal Information</Text>

            <ProfileCard
              icon="👤"
              label="Full Name"
              value={userData.name}
              editable={true}
              onPress={() => navigation.navigate('EditProfile', { field: 'name', currentValue: userData.name })}
            />

            {/* A phone-only account has no email. Saying so is better than an
                empty row that reads as a loading failure. */}
            <ProfileCard
              icon="📧"
              label="Email"
              value={userData.email || 'Not set — you sign in with your phone'}
              editable={false}
            />

            <ProfileCard
              icon="📱"
              label="Phone Number"
              value={userData.phone}
              editable={true}
              onPress={() => navigation.navigate('EditProfile', { field: 'phone', currentValue: userData.phone })}
            />

            <ProfileCard
              icon="📍"
              label="District"
              value={userData.location?.district || 'Not set'}
              editable={true}
              onPress={() =>
                navigation.navigate('EditProfile', {
                  field: 'district',
                  currentValue: userData.location?.district,
                  location: userData.location,
                })
              }
            />

            {userData.createdAt && (
              <ProfileCard
                icon="📅"
                label="Member Since"
                value={new Date(userData.createdAt).toLocaleDateString()}
                editable={false}
              />
            )}
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>Account Settings</Text>

            <ProfileCard
              icon="🔒"
              label="Change Password"
              value="••••••••"
              editable={true}
              onPress={() => navigation.navigate('EditProfile', { field: 'password' })}
            />

            {/* ⚠️ HIDDEN WITH THE LOGIN BUTTON. Leaving this visible while
                `PHONE_AUTH_ENABLED` is false would offer a user a setup flow
                whose result they could never use — a dead control, which is
                the defect class this project has already been bitten by twice
                (a GSTIN badge that could never be earned, an Orders icon
                pushed off screen). Both entrances move together. */}
            {PHONE_AUTH_ENABLED && (
            <>
            {/* ── ADD PHONE SIGN-IN TO AN ACCOUNT THAT ALREADY EXISTS ──────
                ⚠️ THIS IS THE ONLY SAFE PLACE TO MAKE THE LINK, and it is why
                the phone LOGIN screen never tries to find an account by
                matching a number. Here the person has already proved they hold
                this account (they are signed into it) before proving they hold
                the phone. `linkWithCredential` keeps the ORIGINAL uid, so every
                order, settlement and grievance stays attached. */}
            <ProfileCard
              icon="📲"
              label="Phone sign-in"
              value={phoneAuth?.number || 'Not set up'}
              editable={!phoneAuth?.number}
              onPress={phoneAuth?.number ? undefined : openLink}
            />
            </>
            )}
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>

          <View style={styles.bottomPadding} />
        </ScrollView>

        {/* The reCAPTCHA host. It renders nothing until `verify()` opens it. */}
        <RecaptchaModal ref={recaptcha} />

        <Modal visible={!!linkStep} transparent animationType="fade"
          onRequestClose={() => setLinkStep(null)}>
          <View style={styles.linkBackdrop}>
            <View style={styles.linkCard}>
              <Text style={styles.linkTitle}>
                {linkStep === 'number' ? 'Add phone sign-in' : 'Enter the code'}
              </Text>
              <Text style={styles.linkSub}>
                {linkStep === 'number'
                  ? 'We will send a 6-digit code by SMS to confirm the number is yours. Your account and all your history stay exactly as they are.'
                  : `Sent to +91 ${linkNum}.`}
              </Text>

              {linkStep === 'number' ? (
                <TextInput
                  style={styles.linkInput}
                  value={linkNum}
                  onChangeText={setLinkNum}
                  keyboardType="phone-pad"
                  maxLength={10}
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#9CA3AF"
                />
              ) : (
                <TextInput
                  style={[styles.linkInput, styles.linkCodeInput]}
                  value={linkCode}
                  onChangeText={setLinkCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="······"
                  placeholderTextColor="#D1D5DB"
                  autoFocus
                />
              )}

              <View style={styles.linkRow}>
                <TouchableOpacity style={styles.linkCancel} onPress={() => setLinkStep(null)} disabled={linkBusy}>
                  <Text style={styles.linkCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.linkGo, linkBusy && { opacity: 0.6 }]}
                  onPress={linkStep === 'number' ? sendLinkCode : finishLink}
                  disabled={linkBusy}
                >
                  {linkBusy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.linkGoText}>{linkStep === 'number' ? 'Send code' : 'Confirm'}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.secondary,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerPlaceholder: {
    width: 60,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  avatarLoading: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 16,
    marginBottom: 8,
  },
  roleBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  infoSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  logoutButton: {
    backgroundColor: COLORS.error,
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 20,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomPadding: {
    height: 40,
  },
  linkBackdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  linkCard: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 18, padding: 18 },
  linkTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  linkSub: { fontSize: 12.5, color: '#6B7280', marginTop: 6, marginBottom: 14, lineHeight: 18 },
  linkInput: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: '#111827' },
  linkCodeInput: { fontSize: 26, letterSpacing: 10, textAlign: 'center' },
  linkRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  linkCancel: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#F1F5F9' },
  linkCancelText: { color: '#6B7280', fontSize: 15, fontWeight: '600' },
  linkGo: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#16A34A' },
  linkGoText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default ProfileScreen;

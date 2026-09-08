import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Alert, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../utils/firebase';
import { getUserByFirebaseUid } from '../utils/mongoAPI';
import AuthNavigator from './AuthNavigator';
import FarmerNavigator from './FarmerNavigator';
import VendorNavigator from './VendorNavigator';
import AgentNavigator from './AgentNavigator';
import FpoNavigator from './FpoNavigator';
import { COLORS } from '../constants/colors';
import { LanguageProvider } from '../i18n/LanguageContext';
import { DEFAULT_STATE } from '../utils/districts';

const RootNavigator = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState('Checking authentication...');

  useEffect(() => {
    console.log('🔄 Setting up Firebase auth listener...');
    
    // Listen to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('🔐 Auth state changed');
      
      if (currentUser) {
        console.log('✅ User logged in:', currentUser.uid);
        console.log('👤 Email:', currentUser.email);
        
        setUser(currentUser);
        
        // Try to fetch from MongoDB with timeout
        setLoadingMessage('Loading your profile...');
        
        console.log('🔍 Fetching user data from MongoDB...');
        const result = await getUserByFirebaseUid(currentUser.uid);
        
        if (result.success && result.user) {
          console.log('✅ User data loaded from MongoDB');
          console.log('📋 Role:', result.user.role);

          setUserData({
            uid: currentUser.uid,
            email: currentUser.email,
            name: result.user.name,
            phone: result.user.phone,
            role: result.user.role,
            location: result.user.location,
            profileImage: result.user.profileImage,
            createdAt: result.user.createdAt,
          });

          setLoading(false);
          return;
        }

        // First attempt failed - try retry for new users
        console.log('⚠️ First fetch failed, retrying...');
        setLoadingMessage('Setting up your account...');
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const retryResult = await getUserByFirebaseUid(currentUser.uid);
        
        if (retryResult.success && retryResult.user) {
          console.log('✅ User data loaded on retry');
          setUserData({
            uid: currentUser.uid,
            email: currentUser.email,
            name: retryResult.user.name,
            phone: retryResult.user.phone,
            role: retryResult.user.role,
            location: retryResult.user.location,
            profileImage: retryResult.user.profileImage,
            createdAt: retryResult.user.createdAt,
          });
          
          setLoading(false);
          return;
        }
        
        // Both attempts failed - use fallback
        console.log('❌ MongoDB connection failed - using offline mode');
        setLoadingMessage('Loading in offline mode...');
        
        // ⚠️ NULL-SAFE ON EMAIL — a phone sign-in has none.
        // This was `currentUser.email.split('@')[0]`, which throws
        // "Cannot read properties of null (reading 'split')" for every
        // phone-authenticated user who lands here. And this is the OFFLINE
        // path, so it fires exactly when the backend is unreachable and the
        // app is meant to degrade gracefully — instead it would have crashed
        // on launch, with the network already being the suspected problem.
        const userName = currentUser.displayName
          || (currentUser.email ? currentUser.email.split('@')[0].replace(/[^a-zA-Z ]/g, ' ') : null)
          || currentUser.phoneNumber
          || 'Your account';

        setUserData({
          uid: currentUser.uid,
          email: currentUser.email,
          phone: currentUser.phoneNumber || null,
          name: userName,
          role: 'farmer', // Default
          // Offline fallback: no network to fetch the real profile, and no
          // coordinate here to derive from. Leave city/district unset rather
          // than inventing one — every downstream feature keyed on district
          // (mandi prices, proximity ranking) treats null as "unknown" and
          // degrades honestly, whereas a wrong district ranks silently wrong.
          location: {
            city: null,
            district: null,
            state: DEFAULT_STATE,
          },
        });
        
        // Show offline mode alert
        setTimeout(() => {
          Alert.alert(
            '⚠️ Offline Mode',
            'Could not connect to server. You can still use the app with limited features.\n\nPlease check:\n• Backend server is running\n• You are on the same WiFi\n• Firewall is not blocking connection',
            [{ text: 'OK' }]
          );
        }, 500);
        
      } else {
        console.log('❌ No user logged in');
        setUser(null);
        setUserData(null);
      }
      
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => {
      console.log('🛑 Cleaning up auth listener');
      unsubscribe();
    };
  }, []);

  // Show loading screen while checking auth state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>{loadingMessage}</Text>
      </View>
    );
  }

  // If no user, show Auth screens (Login/Register)
  if (!user || !userData) {
    return (
      <NavigationContainer>
        <AuthNavigator />
      </NavigationContainer>
    );
  }

  // User is logged in, show appropriate navigator based on role.
  //
  // LanguageProvider wraps the navigators rather than sitting in App.js so it
  // can be given the uid — the farmer's choice is written to User.language and
  // therefore survives a reinstall. It is INSIDE the logged-in branch on
  // purpose: there is no uid to persist against on the Auth screens, and the
  // register screen already shows both languages side by side.
  return (
    <LanguageProvider uid={userData.uid || userData.firebaseUid}>
      <NavigationContainer>
        {userData.role === 'farmer' && <FarmerNavigator userData={userData} />}
        {userData.role === 'vendor' && <VendorNavigator userData={userData} />}
        {userData.role === 'agent' && <AgentNavigator userData={userData} />}
        {/* The organisation's own account. Its stack is defined by what is
            ABSENT — no land, no crops, no tasks, no harvests, and no route
            back into the farmer dashboard, because an FPO does not farm.
            See FpoNavigator.jsx. */}
        {userData.role === 'fpo' && <FpoNavigator userData={userData} />}
      </NavigationContainer>
    </LanguageProvider>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.textLight,
    textAlign: 'center',
  },
});

export default RootNavigator;

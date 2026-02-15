import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../../utils/firebase';
import { createUser } from '../../utils/mongoAPI';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../../constants/colors';

const RegisterSchema = Yup.object().shape({
  name: Yup.string().min(2, 'Too Short!').required('Name is required'),
  phone: Yup.string().min(10, 'Invalid phone').required('Phone is required'),
  email: Yup.string().email('Invalid email').required('Email is required'),
  password: Yup.string().min(6, 'Password must be at least 6 characters').required('Password is required'),
  role: Yup.string().required('Please select a role'),
});

const RegisterScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState({
    location: false,
    camera: false,
  });

  // Request permissions on component mount
  const requestPermissions = async () => {
    try {
      // Request location permission
      const locationStatus = await Location.requestForegroundPermissionsAsync();
      
      // Request camera permission
      const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
      
      setPermissionsGranted({
        location: locationStatus.status === 'granted',
        camera: cameraStatus.status === 'granted',
      });

      if (locationStatus.status !== 'granted' || cameraStatus.status !== 'granted') {
        Alert.alert(
          'Permissions Required',
          'Location and Camera permissions are needed for the best experience.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('❌ Permission error:', error);
    }
  };

  React.useEffect(() => {
    requestPermissions();
  }, []);

  const handleRegister = async (values) => {
    setLoading(true);

    try {
      console.log('📝 Step 1: Creating user in Firebase Auth...');
      
      // Step 1: Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );

      console.log('✅ Firebase user created:', userCredential.user.uid);

      // Step 2: Update display name in Firebase
      await updateProfile(userCredential.user, {
        displayName: values.name,
      });

      console.log('✅ Display name updated');

      // Step 3: Get user location (if permission granted)
      let locationData = null;
      if (permissionsGranted.location) {
        try {
          console.log('📍 Getting location...');
          const location = await Location.getCurrentPositionAsync({});
          locationData = {
            coordinates: {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
            },
            city: 'Chennai',
            district: 'Chennai',
            state: 'Tamil Nadu',
          };
          console.log('✅ Location obtained');
        } catch (locError) {
          console.log('⚠️ Location error (skipping):', locError.message);
        }
      }

      // Step 4: Save complete user data to MongoDB
      console.log('📝 Step 2: Saving user to MongoDB...');
      
      const mongoUserData = {
        firebaseUid: userCredential.user.uid,
        name: values.name,
        email: values.email,
        phone: values.phone,
        role: values.role,
        farmingType: values.farmingType || null,
        location: locationData,
      };

      const mongoResult = await createUser(mongoUserData);

      if (mongoResult.success) {
        console.log('✅ User saved to MongoDB:', mongoResult.userId);
        
        Alert.alert(
          'Success! 🎉',
          'Account created successfully! Please wait while we set up your profile...',
          [
            {
              text: 'OK',
              onPress: () => {
                console.log('✅ Registration complete - waiting for auth state update');
                // User will be auto-logged in via RootNavigator
              }
            }
          ]
        );
      } else {
        console.error('❌ MongoDB save failed:', mongoResult.error);
        
        // IMPORTANT: Delete Firebase user if MongoDB save fails
        console.log('🔄 Cleaning up Firebase user due to MongoDB failure...');
        try {
          await userCredential.user.delete();
          console.log('✅ Firebase user cleaned up');
        } catch (deleteError) {
          console.error('❌ Failed to delete Firebase user:', deleteError);
        }
        
        Alert.alert(
          'Registration Failed',
          'Failed to save user profile. Please try again.',
        );
      }

    } catch (error) {
      console.error('❌ Registration error:', error);
      
      let errorMessage = 'Failed to create account';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please login instead.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Use at least 6 characters.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Check your internet connection.';
      }
      
      Alert.alert('Registration Error', errorMessage);
      
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <View style={styles.container}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Create Account</Text>
          <Text style={styles.headerSubtitle}>Join TN Farming Community</Text>
        </View>

        {/* Form */}
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <Formik
            initialValues={{
              name: '',
              phone: '',
              email: '',
              password: '',
              role: '',
              farmingType: '',
            }}
            validationSchema={RegisterSchema}
            onSubmit={handleRegister}
          >
            {({ handleChange, handleBlur, handleSubmit, values, errors, touched, setFieldValue }) => (
              <View style={styles.form}>
                
                {/* Name Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Full Name *</Text>
                  <TextInput
                    style={[styles.input, touched.name && errors.name && styles.inputError]}
                    placeholder="Enter your name"
                    placeholderTextColor={COLORS.textLight}
                    onChangeText={handleChange('name')}
                    onBlur={handleBlur('name')}
                    value={values.name}
                  />
                  {touched.name && errors.name && (
                    <Text style={styles.errorText}>{errors.name}</Text>
                  )}
                </View>

                {/* Phone Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Phone Number *</Text>
                  <TextInput
                    style={[styles.input, touched.phone && errors.phone && styles.inputError]}
                    placeholder="10-digit mobile number"
                    placeholderTextColor={COLORS.textLight}
                    onChangeText={handleChange('phone')}
                    onBlur={handleBlur('phone')}
                    value={values.phone}
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                  {touched.phone && errors.phone && (
                    <Text style={styles.errorText}>{errors.phone}</Text>
                  )}
                </View>

                {/* Email Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Email *</Text>
                  <TextInput
                    style={[styles.input, touched.email && errors.email && styles.inputError]}
                    placeholder="your.email@example.com"
                    placeholderTextColor={COLORS.textLight}
                    onChangeText={handleChange('email')}
                    onBlur={handleBlur('email')}
                    value={values.email}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {touched.email && errors.email && (
                    <Text style={styles.errorText}>{errors.email}</Text>
                  )}
                </View>

                {/* Password Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Password *</Text>
                  <TextInput
                    style={[styles.input, touched.password && errors.password && styles.inputError]}
                    placeholder="Minimum 6 characters"
                    placeholderTextColor={COLORS.textLight}
                    onChangeText={handleChange('password')}
                    onBlur={handleBlur('password')}
                    value={values.password}
                    secureTextEntry
                  />
                  {touched.password && errors.password && (
                    <Text style={styles.errorText}>{errors.password}</Text>
                  )}
                </View>

                {/* Role Selection */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>I am a... *</Text>
                  <View style={styles.roleContainer}>
                    {['farmer', 'vendor', 'agent'].map((role) => (
                      <TouchableOpacity
                        key={role}
                        style={[
                          styles.roleButton,
                          values.role === role && styles.roleButtonSelected,
                        ]}
                        onPress={() => setFieldValue('role', role)}
                      >
                        <Text style={styles.roleEmoji}>
                          {role === 'farmer' ? '🌾' : role === 'vendor' ? '🏪' : '👔'}
                        </Text>
                        <Text
                          style={[
                            styles.roleText,
                            values.role === role && styles.roleTextSelected,
                          ]}
                        >
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {touched.role && errors.role && (
                    <Text style={styles.errorText}>{errors.role}</Text>
                  )}
                </View>

                {/* Farming Type (Only for Farmer) */}
                {values.role === 'farmer' && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Farming Type *</Text>
                    <View style={styles.roleContainer}>
                      {['terrace', 'normal', 'organic'].map((type) => (
                        <TouchableOpacity
                          key={type}
                          style={[
                            styles.farmingTypeButton,
                            values.farmingType === type && styles.roleButtonSelected,
                          ]}
                          onPress={() => setFieldValue('farmingType', type)}
                        >
                          <Text style={styles.roleEmoji}>
                            {type === 'terrace' ? '🏢' : type === 'normal' ? '🚜' : '🌱'}
                          </Text>
                          <Text
                            style={[
                              styles.roleText,
                              values.farmingType === type && styles.roleTextSelected,
                            ]}
                          >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Permissions Status */}
                <View style={styles.permissionsBox}>
                  <Text style={styles.permissionsTitle}>Permissions:</Text>
                  <Text style={styles.permissionItem}>
                    {permissionsGranted.location ? '✅' : '⚠️'} Location Access
                  </Text>
                  <Text style={styles.permissionItem}>
                    {permissionsGranted.camera ? '✅' : '⚠️'} Camera Access
                  </Text>
                  {(!permissionsGranted.location || !permissionsGranted.camera) && (
                    <Text style={styles.permissionNote}>
                      Some permissions not granted. You can enable them in Settings later.
                    </Text>
                  )}
                </View>

                {/* Register Button */}
                <TouchableOpacity
                  style={[styles.registerButton, loading && styles.buttonDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator color={COLORS.secondary} />
                      <Text style={styles.loadingText}>Creating account...</Text>
                    </View>
                  ) : (
                    <Text style={styles.registerButtonText}>Create Account</Text>
                  )}
                </TouchableOpacity>

                {/* Login Link */}
                <View style={styles.loginLinkContainer}>
                  <Text style={styles.loginLinkText}>Already have an account? </Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                    <Text style={styles.loginLink}>Login</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </Formik>
        </ScrollView>
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
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.8,
  },
  scrollView: {
    flex: 1,
  },
  form: {
    padding: 20,
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.cardBackground,
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    color: COLORS.text,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 4,
  },
  roleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    backgroundColor: COLORS.cardBackground,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  roleButtonSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  farmingTypeButton: {
    flex: 1,
    backgroundColor: COLORS.cardBackground,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  roleEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  roleText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '600',
  },
  roleTextSelected: {
    color: COLORS.secondary,
  },
  permissionsBox: {
    backgroundColor: COLORS.primary + '20',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  permissionsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  permissionItem: {
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 4,
  },
  permissionNote: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 4,
    fontStyle: 'italic',
  },
  registerButton: {
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  registerButtonText: {
    color: COLORS.secondary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
  },
  loginLinkText: {
    color: COLORS.textLight,
    fontSize: 14,
  },
  loginLink: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default RegisterScreen;

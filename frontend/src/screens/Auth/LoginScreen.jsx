import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { Ionicons } from '@expo/vector-icons';
import { PHONE_AUTH_ENABLED } from '../../utils/config';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../utils/firebase';
import { COLORS } from '../../constants/colors';

const LoginSchema = Yup.object().shape({
  email: Yup.string().email('Invalid email').required('Email is required'),
  password: Yup.string().required('Password is required'),
});

const LoginScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(false);

  const handleLogin = async (values) => {
    setLoading(true);

    try {
      console.log('🔐 Attempting login for:', values.email);
      
      const userCredential = await signInWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );

      console.log('✅ Login successful!');
      console.log('👤 User ID:', userCredential.user.uid);
      
      // Navigation happens automatically via RootNavigator
      // because Firebase auth state changes

    } catch (error) {
      console.error('❌ Login error:', error);
      
      let errorMessage = 'Failed to login';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Check your internet connection.';
      }
      
      Alert.alert('Login Error', errorMessage);
      
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
          <Text style={styles.icon}>🌾</Text>
          <Text style={styles.headerTitle}>Maharashtra Farming App</Text>
          <Text style={styles.headerSubtitle}>Smart Farming for Maharashtra</Text>
        </View>

        {/* Login Form */}
        <View style={styles.content}>
          <Text style={styles.welcomeText}>Welcome Back!</Text>

          <Formik
            initialValues={{ email: '', password: '' }}
            validationSchema={LoginSchema}
            onSubmit={handleLogin}
          >
            {({ handleChange, handleBlur, handleSubmit, values, errors, touched }) => (
              <View>
                
                {/* Email Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Email</Text>
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
                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    style={[styles.input, touched.password && errors.password && styles.inputError]}
                    placeholder="Enter your password"
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

                {/* Login Button */}
                <TouchableOpacity
                  style={[styles.loginButton, loading && styles.buttonDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color={COLORS.secondary} />
                  ) : (
                    <Text style={styles.loginButtonText}>Login</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </Formik>

          {/* ── SIGN IN WITH A PHONE INSTEAD ──────────────────────────
              A second door, not a replacement — and currently CLOSED.
              `PHONE_AUTH_ENABLED` is false: SMS is the one leg of sign-in that
              can fail live (provider toggle, handset, SMS quota), and email
              already carries every account. The screen behind this stays
              registered and tested; only the way in is hidden. */}
          {PHONE_AUTH_ENABLED && (<>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>
          <TouchableOpacity
            style={styles.phoneButton}
            onPress={() => navigation.navigate('PhoneLogin')}
            activeOpacity={0.85}
            accessibilityLabel="Sign in with your phone number"
          >
            <Ionicons name="phone-portrait-outline" size={18} color="#15803D" />
            <Text style={styles.phoneButtonText}>Sign in with phone number</Text>
          </TouchableOpacity>
          </>)}

          {/* Register Link */}
          <View style={styles.registerContainer}>
            <Text style={styles.registerText}>New user? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Register here</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    paddingTop: 80,
    paddingBottom: 60,
    alignItems: 'center',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  icon: {
    fontSize: 60,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.primary,
    opacity: 0.8,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 32,
    textAlign: 'center',
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
  loginButton: {
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: COLORS.secondary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { fontSize: 12.5, color: '#9CA3AF' },
  phoneButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#BBF7D0',
    borderRadius: 14, paddingVertical: 14,
  },
  phoneButtonText: { color: '#15803D', fontSize: 15, fontWeight: '700' },
  registerText: {
    color: COLORS.textLight,
    fontSize: 14,
  },
  registerLink: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default LoginScreen;

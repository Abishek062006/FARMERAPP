import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import axios from 'axios';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { auth } from '../../utils/firebase';
import { API_ENDPOINTS } from '../../utils/config';
import { COLORS } from '../../constants/colors';

const FIELD_INFO = {
  name: { title: 'Edit Name', placeholder: 'Full Name', icon: '👤', autoCapitalize: 'words' },
  phone: { title: 'Edit Phone', placeholder: 'Phone Number', icon: '📱', keyboardType: 'phone-pad' },
  district: { title: 'Edit District', placeholder: 'District', icon: '📍', autoCapitalize: 'words' },
  password: { title: 'Change Password', placeholder: 'New Password', icon: '🔒' },
};

const EditProfileScreen = ({ navigation, route }) => {
  const { field, currentValue, location } = route.params;
  const fieldInfo = FIELD_INFO[field];

  const [value, setValue] = useState(field === 'password' ? '' : (currentValue || ''));
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const savePassword = async () => {
    if (!currentPassword || !value) {
      Alert.alert('Error', 'Please fill in all password fields');
      return;
    }
    if (value.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }
    if (value !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, value);
      Alert.alert('Success', 'Password changed successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      const message =
        error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential'
          ? 'Current password is incorrect'
          : error.message || 'Failed to change password';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  const saveProfileField = async () => {
    if (!value.trim()) {
      Alert.alert('Error', 'Please enter a value');
      return;
    }
    if (field === 'phone' && value.replace(/\D/g, '').length < 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit phone number');
      return;
    }

    const payload =
      field === 'district'
        ? { location: { ...location, district: value.trim() } }
        : { [field]: value.trim() };

    setLoading(true);
    try {
      await axios.put(`${API_ENDPOINTS.USERS}/${auth.currentUser.uid}`, payload);
      Alert.alert('Success', `${fieldInfo.title} updated successfully!`, [
        {
          text: 'OK',
          onPress: () =>
            navigation.navigate('Profile', {
              updated: field === 'district' ? { field: 'location', value: payload.location } : { field, value: value.trim() },
            }),
        },
      ]);
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => (field === 'password' ? savePassword() : saveProfileField());

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{fieldInfo.title}</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{fieldInfo.icon}</Text>
          </View>

          {field === 'password' && (
            <TextInput
              style={styles.input}
              placeholder="Current Password"
              placeholderTextColor={COLORS.textLight}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
            />
          )}

          <TextInput
            style={styles.input}
            placeholder={fieldInfo.placeholder}
            placeholderTextColor={COLORS.textLight}
            value={value}
            onChangeText={setValue}
            autoCapitalize={fieldInfo.autoCapitalize || 'none'}
            keyboardType={fieldInfo.keyboardType || 'default'}
            secureTextEntry={field === 'password'}
          />

          {field === 'password' && (
            <TextInput
              style={styles.input}
              placeholder="Confirm New Password"
              placeholderTextColor={COLORS.textLight}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
          )}

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.saveButtonText}>{loading ? 'Saving...' : 'Save Changes'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  placeholder: {
    width: 60,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 32,
  },
  icon: {
    fontSize: 40,
  },
  input: {
    backgroundColor: COLORS.cardBackground,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    color: COLORS.text,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  saveButtonText: {
    color: COLORS.secondary,
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default EditProfileScreen;

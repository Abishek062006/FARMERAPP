import React, { useState, useEffect } from 'react';
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
import { getUserData, saveUserData } from '../../utils/storage';
import { COLORS } from '../../constants/colors';

const EditProfileScreen = ({ navigation, route }) => {
  const { field } = route.params;
  const [value, setValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCurrentValue();
  }, []);

  const loadCurrentValue = async () => {
    const userData = await getUserData();
    if (field === 'name') setValue(userData.name);
    if (field === 'phone') setValue(userData.phone);
  };

  const getFieldInfo = () => {
    switch (field) {
      case 'name':
        return { title: 'Edit Name', placeholder: 'Full Name', icon: '👤' };
      case 'phone':
        return { title: 'Edit Phone', placeholder: 'Phone Number', icon: '📱' };
      case 'password':
        return { title: 'Change Password', placeholder: 'New Password', icon: '🔒' };
      default:
        return { title: 'Edit Profile', placeholder: 'Value', icon: '✏️' };
    }
  };

  const handleSave = async () => {
    if (!value.trim()) {
      Alert.alert('Error', 'Please enter a value');
      return;
    }

    if (field === 'password' && value.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (field === 'password' && value !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    const userData = await getUserData();
    const updatedData = { ...userData, [field]: value };
    await saveUserData(updatedData);
    setLoading(false);

    Alert.alert('Success', `${getFieldInfo().title} updated successfully!`, [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  const fieldInfo = getFieldInfo();

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{fieldInfo.title}</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{fieldInfo.icon}</Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder={fieldInfo.placeholder}
            placeholderTextColor={COLORS.textLight}
            value={value}
            onChangeText={setValue}
            autoCapitalize={field === 'name' ? 'words' : 'none'}
            keyboardType={field === 'phone' ? 'phone-pad' : 'default'}
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
            <Text style={styles.saveButtonText}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Text>
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

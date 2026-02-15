import React from 'react';
import { View, Image, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS } from '../constants/colors';

const UserAvatar = ({ uri, name, size = 80, onPress, editable = false }) => {
  const getInitials = () => {
    if (!name) return '?';
    const names = name.split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <TouchableOpacity 
      onPress={onPress} 
      disabled={!editable}
      activeOpacity={editable ? 0.7 : 1}
    >
      <View style={[styles.container, { width: size, height: size }]}>
        {uri ? (
          <Image source={{ uri }} style={styles.image} />
        ) : (
          <View style={[styles.placeholder, { width: size, height: size }]}>
            <Text style={[styles.initials, { fontSize: size / 2.5 }]}>
              {getInitials()}
            </Text>
          </View>
        )}
        {editable && (
          <View style={styles.editBadge}>
            <Text style={styles.editIcon}>✏️</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 1000,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  placeholder: {
    backgroundColor: COLORS.primary,
    borderRadius: 1000,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.primaryDark,
  },
  initials: {
    color: COLORS.secondary,
    fontWeight: 'bold',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.secondary,
    borderRadius: 20,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  editIcon: {
    fontSize: 12,
  },
});

export default UserAvatar;

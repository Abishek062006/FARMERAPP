import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Single-tap pill grid for short, fixed option lists (soil type, water
// source, units, etc.) — replaces the iOS wheel Picker for anything with
// roughly 10 options or fewer, where showing everything at once beats
// making the farmer open something to see the choices.
export default function ChipSelect({ label, required, options, value, onChange }) {
  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label}>
          {label} {required ? <Text style={styles.required}>*</Text> : null}
        </Text>
      ) : null}
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const isSelected = opt.value === value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onChange(opt.value)}
              activeOpacity={0.7}
            >
              {isSelected ? (
                <Ionicons name="checkmark" size={16} color="#fff" style={styles.chipIcon} />
              ) : null}
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#F44336',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  chipSelected: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  chipIcon: {
    marginRight: 4,
  },
  chipText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
});

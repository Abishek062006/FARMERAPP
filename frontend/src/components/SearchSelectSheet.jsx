import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Bottom sheet with a search box for long or open-ended option lists
// (district, crop search) — replaces the iOS wheel Picker for anything too
// long to show as chips. When allowCustom is set, typing something that
// isn't in the list surfaces a "use what I typed" row, so the list never
// has to be exhaustive.
export default function SearchSelectSheet({
  label,
  title, // modal sheet header text; falls back to label
  required,
  options, // [{ label, value, subtitle? }]
  value,
  onChange, // (value, option) => void
  placeholder = 'Search...',
  allowCustom = false,
  customHint = 'Use this even though it\'s not in the list',
  renderTrigger, // optional: ({ onPress, selectedOption }) => ReactNode
}) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');

  const selectedOption = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.subtitle && o.subtitle.toLowerCase().includes(q))
    );
  }, [query, options]);

  const close = () => {
    setVisible(false);
    setQuery('');
  };

  const handleSelect = (option) => {
    onChange(option.value, option);
    close();
  };

  const handleCustom = () => {
    const typed = query.trim();
    onChange(typed, { label: typed, value: typed, isCustom: true });
    close();
  };

  const showCustomRow =
    allowCustom &&
    query.trim().length > 0 &&
    !filtered.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label}>
          {label} {required ? <Text style={styles.required}>*</Text> : null}
        </Text>
      ) : null}

      {renderTrigger ? (
        renderTrigger({ onPress: () => setVisible(true), selectedOption })
      ) : (
        <TouchableOpacity style={styles.field} onPress={() => setVisible(true)} activeOpacity={0.7}>
          <Text style={[styles.fieldText, !selectedOption && !value && styles.placeholderText]}>
            {selectedOption ? selectedOption.label : value || placeholder}
          </Text>
          <Ionicons name="chevron-down" size={20} color="#666" />
        </TouchableOpacity>
      )}

      <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{title || label || 'Select'}</Text>
                <TouchableOpacity onPress={close}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>

              <View style={styles.searchBox}>
                <Ionicons name="search" size={18} color="#999" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={placeholder}
                  value={query}
                  onChangeText={setQuery}
                  autoFocus
                />
              </View>

              <FlatList
                data={filtered}
                keyExtractor={(item) => item.value}
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                  showCustomRow ? (
                    <TouchableOpacity style={styles.customRow} onPress={handleCustom}>
                      <Ionicons name="add-circle" size={20} color="#4CAF50" />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={styles.customRowText}>Use "{query.trim()}"</Text>
                        <Text style={styles.customRowHint}>{customHint}</Text>
                      </View>
                    </TouchableOpacity>
                  ) : null
                }
                renderItem={({ item }) => {
                  const isSelected = item.value === value;
                  return (
                    <TouchableOpacity style={styles.row} onPress={() => handleSelect(item)}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowText}>{item.label}</Text>
                        {item.subtitle ? <Text style={styles.rowSubtitle}>{item.subtitle}</Text> : null}
                      </View>
                      {isSelected ? <Ionicons name="checkmark" size={20} color="#4CAF50" /> : null}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  !showCustomRow ? <Text style={styles.emptyText}>No matches found</Text> : null
                }
              />
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>
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
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  fieldText: {
    fontSize: 16,
    color: '#333',
  },
  placeholderText: {
    color: '#999',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    paddingBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 44,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#333',
  },
  list: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowText: {
    fontSize: 16,
    color: '#333',
  },
  rowSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  customRowText: {
    fontSize: 15,
    color: '#4CAF50',
    fontWeight: '600',
  },
  customRowHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    padding: 24,
  },
});

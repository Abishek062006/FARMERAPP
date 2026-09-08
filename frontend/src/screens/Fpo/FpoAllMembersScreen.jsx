import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../i18n/LanguageContext';
import MemberCard from '../../components/fpo/MemberCard';

// "SEE ALL" — every member's performance, searchable.
//
// Reads `members` straight from navigation params rather than fetching its
// own copy: Farmer/FpoDashboardScreen already holds the exact same
// `memberCards` array (from GET /:id/dashboard) that this screen would
// otherwise re-fetch a moment later, and two independent fetches are two
// places for a trust band or an unpaid figure to read differently between
// the carousel and this grid. If the admin pulls to refresh here, they go
// back to the dashboard to get a new fetch — this screen is a VIEW onto that
// data, not a second source of it.
export default function FpoAllMembersScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { fpoId, members, userData } = route.params || {};
  const list = members || [];

  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((m) => (
      (m.farmerName || '').toLowerCase().includes(q)
      || (m.village || '').toLowerCase().includes(q)
      || (m.cropsSuppliedThisSeason || []).some((c) => c.toLowerCase().includes(q))
    ));
  }, [list, query]);

  const openMember = (m) => navigation?.navigate('FpoMemberDetail', {
    fpoId, farmerUid: m.farmerUid, farmerName: m.farmerName, village: m.village, trust: m.trust, userData,
  });

  return (
    <View style={s.container}>
      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={17} color="#9CA3AF" />
        <TextInput
          style={s.searchInput}
          placeholder={t('fpoAllMembers.searchPlaceholder')}
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Ionicons name="close-circle" size={17} color="#CBD5E1" onPress={() => setQuery('')} />
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(m) => m.farmerUid}
        numColumns={2}
        columnWrapperStyle={s.row}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          // Wrapped in flex:1 rather than passing a percentage width straight
          // to MemberCard — a FlatList's numColumns cell has no width of its
          // own to be a percentage OF until something in the row claims it.
          <View style={{ flex: 1 }}>
            <MemberCard
              m={item}
              onPress={openMember}
              width="100%"
              labels={{
                noSuppliesYet: t('fpoDashboard.noSuppliesYet'),
                kgSupplied: t('fpoDashboard.kgSupplied'),
                earned: t('fpoDashboard.earned'),
                unpaidSuffix: t('fpoDashboard.unpaidSuffix'),
                trustLabel: (band) => t(`fpoDashboard.trust.${band}`),
              }}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="people-outline" size={32} color="#CBD5E1" />
            <Text style={s.emptyText}>
              {list.length === 0 ? t('fpoAllMembers.noMembers') : t('fpoAllMembers.noMatch')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', margin: 14, marginBottom: 6, borderRadius: 14,
    paddingHorizontal: 13, paddingVertical: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  list: { padding: 14, paddingTop: 8, gap: 10 },
  row: { gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 30 },
});

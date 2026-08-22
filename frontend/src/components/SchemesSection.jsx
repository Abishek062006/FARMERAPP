import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Linking,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../utils/config';
import AutoScrollTicker from './AutoScrollTicker';

const SCHEME_CARD_WIDTH = 160;
const SCHEME_CARD_MARGIN = 10;

// Real official department/ministry logos, stored in MongoDB (see
// backend/models/SchemeImage.js) and served by the backend — not Firebase
// Storage, which isn't available on this account. Schemes from the same
// department share a logo (there's no distinct "scheme image" for most of
// these on the official sites themselves — see conversation history).
const schemeImageUri = (scheme) => `${API_ENDPOINTS.SCHEMES}/image/${scheme.imageKey}`;

const SchemeLogo = ({ scheme, style }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={[style, styles.logoFallback, { backgroundColor: scheme.color + '1A' }]}>
        <Ionicons name="ribbon-outline" size={style.height ? style.height * 0.5 : 18} color={scheme.color} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: schemeImageUri(scheme) }}
      style={style}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
};

const SchemeCard = ({ scheme, onPress }) => (
  <TouchableOpacity style={styles.schemeCard} onPress={() => onPress(scheme)} activeOpacity={0.8}>
    <SchemeLogo scheme={scheme} style={styles.schemeLogo} />
    <Text style={styles.schemeName} numberOfLines={2}>{scheme.name}</Text>
    <Text style={styles.schemeBrief} numberOfLines={3}>{scheme.briefDescription}</Text>
  </TouchableOpacity>
);

const SchemeCategoryCard = ({ title, subtitle, schemes, onPressCard }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSub}>{subtitle}</Text>
      </View>
    </View>
    {schemes.length === 0 ? (
      <View style={styles.emptyWrap}>
        <Ionicons name="document-text-outline" size={30} color="#CBD5E1" />
        <Text style={styles.emptyText}>No schemes available right now</Text>
      </View>
    ) : (
      <AutoScrollTicker
        items={schemes}
        cardWidth={SCHEME_CARD_WIDTH}
        cardMargin={SCHEME_CARD_MARGIN}
        renderItem={(scheme, idx) => (
          <SchemeCard key={`${scheme.id}-${idx}`} scheme={scheme} onPress={onPressCard} />
        )}
      />
    )}
  </View>
);

export default function SchemesSection() {
  const [loading, setLoading] = useState(true);
  const [schemes, setSchemes] = useState([]);
  const [selectedScheme, setSelectedScheme] = useState(null);

  useEffect(() => {
    fetchSchemes();
  }, []);

  const fetchSchemes = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.SCHEMES, { timeout: 10000 });
      if (response.data.success) {
        setSchemes(response.data.schemes);
      }
    } catch (error) {
      console.error('❌ Error fetching schemes:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyNow = async (scheme) => {
    try {
      await Linking.openURL(scheme.officialUrl);
    } catch (error) {
      console.error(`❌ Could not open ${scheme.officialUrl}:`, error.message);
      Alert.alert(
        'Could Not Open Website',
        `Please visit this link in your browser instead:\n\n${scheme.officialUrl}`,
        [{ text: 'OK' }]
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#16A34A" />
        </View>
      </View>
    );
  }

  if (schemes.length === 0) return null;

  const stateSchemes = schemes.filter((s) => s.level === 'state');
  const centralSchemes = schemes.filter((s) => s.level === 'central');

  return (
    <>
      <SchemeCategoryCard
        title="Tamil Nadu Schemes"
        subtitle="State government schemes & subsidies"
        schemes={stateSchemes}
        onPressCard={setSelectedScheme}
      />
      <SchemeCategoryCard
        title="Central Government Schemes"
        subtitle="Schemes & subsidies from the Union government"
        schemes={centralSchemes}
        onPressCard={setSelectedScheme}
      />

      <Modal
        visible={!!selectedScheme}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedScheme(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {selectedScheme && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <SchemeLogo scheme={selectedScheme} style={styles.modalLogo} />
                  <TouchableOpacity onPress={() => setSelectedScheme(null)} style={styles.closeButton}>
                    <Ionicons name="close" size={22} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalTitle}>{selectedScheme.name}</Text>
                <Text style={styles.modalDept}>{selectedScheme.department}</Text>

                <Text style={styles.modalDescription}>{selectedScheme.description}</Text>

                <Text style={styles.modalSectionTitle}>Eligibility Requirements</Text>
                {selectedScheme.eligibility.map((item, idx) => (
                  <View key={idx} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}

                <Text style={styles.modalSectionTitle}>Benefits</Text>
                {selectedScheme.benefits.map((item, idx) => (
                  <View key={idx} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.applyButton, { backgroundColor: selectedScheme.color }]}
                  onPress={() => handleApplyNow(selectedScheme)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.applyButtonText}>Apply Now — Official Website</Text>
                  <Ionicons name="open-outline" size={17} color="#fff" style={{ marginLeft: 6 }} />
                </TouchableOpacity>

                <View style={{ height: 24 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Matches the app's shared dashboard card system exactly
  card: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16,
    borderRadius: 18, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 5,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  loadingWrap: { alignItems: 'center', paddingVertical: 24 },
  emptyWrap: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 13, color: '#9CA3AF', marginTop: 8, textAlign: 'center' },

  schemeCard: {
    width: SCHEME_CARD_WIDTH, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, marginRight: SCHEME_CARD_MARGIN,
  },
  schemeLogo: { width: '100%', height: 36, marginBottom: 8 },
  logoFallback: { borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  schemeName: { fontSize: 13, fontWeight: '700', color: '#1F2937', lineHeight: 17, marginBottom: 4 },
  schemeBrief: { fontSize: 11, color: '#6B7280', lineHeight: 15 },

  // Detail modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalLogo: { width: '75%', height: 46 },
  closeButton: { padding: 4 },
  modalTitle: { fontSize: 19, fontWeight: '700', color: '#111827', marginTop: 12 },
  modalDept: { fontSize: 12, color: '#9CA3AF', marginTop: 3, marginBottom: 14 },
  modalDescription: { fontSize: 14, color: '#374151', lineHeight: 21, marginBottom: 16 },
  modalSectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 8, marginBottom: 8 },
  bulletRow: { flexDirection: 'row', marginBottom: 7, paddingRight: 8, alignItems: 'flex-start' },
  bulletDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#16A34A', marginRight: 9, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 13, color: '#4B5563', lineHeight: 19 },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 20,
  },
  applyButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

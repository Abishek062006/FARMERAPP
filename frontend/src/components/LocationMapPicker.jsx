import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { matchTnDistrict } from '../utils/tnDistricts';
import WebMapSurface from './map/WebMapSurface';

// Rough center of Tamil Nadu — used only as a starting point when we don't
// have a better guess (no GPS fix yet, or permission denied).
const DEFAULT_CENTER = { lat: 11.1271, lng: 78.6569 };

/**
 * Full-screen "tap on the map to set your land's location" picker.
 * Returns the same location shape LandRegistrationScreen already builds
 * from GPS auto-detect, so callers don't need to know which path was used.
 * The map itself is a Leaflet WebView with free Esri satellite imagery — a
 * native maps SDK can't be used here because Expo Go only loads the native
 * modules compiled into it.
 */
export default function LocationMapPicker({ visible, onClose, onConfirm }) {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [mapReady, setMapReady] = useState(false);
  const [marker, setMarker] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState(null);

  // Best-effort: center the map on the device's current location when the
  // picker opens. The map surface is only mounted once we have a starting
  // center (mapReady gates it), since its initial region is set on mount.
  useEffect(() => {
    if (!visible) return;
    setMarker(null);
    setResolvedAddress(null);
    setMapReady(false);
    setCenter(DEFAULT_CENTER);

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const current = await Promise.race([
          Location.getCurrentPositionAsync({}),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]);
        setCenter({ lat: current.coords.latitude, lng: current.coords.longitude });
      } catch {
        // Stay on the Tamil Nadu default — the user can still pan/tap.
      } finally {
        setMapReady(true);
      }
    })();
  }, [visible]);

  const resolveAddress = useCallback(async (lat, lng) => {
    setResolving(true);
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const place = results[0] || {};
      // Same caveat as LandRegistrationScreen's GPS flow: the device's
      // geocoder can return a neighborhood/layout name for `district`
      // instead of the real administrative district — only keep it if it
      // actually matches a real TN district, otherwise leave it for the
      // farmer to pick manually on the following screen.
      const districtMatch =
        matchTnDistrict(place.district) ||
        matchTnDistrict(place.subregion) ||
        matchTnDistrict(place.city) ||
        '';
      setResolvedAddress({
        coordinates: { lat, lng },
        city: place.city || place.subregion || '',
        district: districtMatch,
        state: place.region || 'Tamil Nadu',
        pincode: place.postalCode || '',
        address: `${place.street || ''} ${place.name || ''}`.trim(),
      });
    } catch {
      // Reverse geocoding failed (e.g. offline) — keep the coordinates,
      // the user can still fill city/district manually after confirming.
      setResolvedAddress({
        coordinates: { lat, lng },
        city: '',
        district: '',
        state: 'Tamil Nadu',
        pincode: '',
        address: '',
      });
    } finally {
      setResolving(false);
    }
  }, []);

  const handlePick = useCallback(
    (lat, lng) => {
      setMarker({ lat, lng });
      resolveAddress(lat, lng);
    },
    [resolveAddress]
  );

  const handleConfirm = () => {
    if (!marker || !resolvedAddress) return;
    onConfirm(resolvedAddress);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={26} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tap to set your land's location</Text>
          <View style={styles.headerBtn} />
        </View>

        {!mapReady ? (
          <View style={styles.mapLoading}>
            <ActivityIndicator size="large" color="#4CAF50" />
          </View>
        ) : (
          <View style={styles.map}>
            <WebMapSurface center={center} onPick={handlePick} />
          </View>
        )}

        <View style={styles.bottomPanel}>
          {!marker ? (
            <Text style={styles.hintText}>Tap anywhere on the map to drop a pin</Text>
          ) : resolving ? (
            <View style={styles.resolvingRow}>
              <ActivityIndicator color="#4CAF50" />
              <Text style={styles.hintText}>Finding address…</Text>
            </View>
          ) : (
            <Text style={styles.addressText} numberOfLines={2}>
              📍 {[resolvedAddress?.city, resolvedAddress?.district, resolvedAddress?.state]
                .filter(Boolean)
                .join(', ') || `${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)}`}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.confirmButton, (!marker || resolving) && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            disabled={!marker || resolving}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.confirmButtonText}>Use This Location</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerBtn: { width: 36, alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#333' },
  map: { flex: 1 },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomPanel: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  hintText: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 12 },
  resolvingRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 12, gap: 8 },
  addressText: { fontSize: 14, color: '#333', textAlign: 'center', marginBottom: 12 },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 8,
  },
  confirmButtonDisabled: { backgroundColor: '#ccc' },
  confirmButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
});

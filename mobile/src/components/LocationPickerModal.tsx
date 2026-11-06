import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { DEFAULT_MAP_REGION } from '@/lib/config';
import { palette, radius, spacing } from '@/theme';

export interface LocationResult {
  latitude: number;
  longitude: number;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

interface LocationPickerModalProps {
  visible: boolean;
  initialLocation?: {
    latitude?: number;
    longitude?: number;
    addressLine?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  title?: string;
  onDismiss: () => void;
  onConfirm: (result: LocationResult) => void;
}

export function LocationPickerModal({
  visible,
  initialLocation,
  title = 'Pin Station Location on Map',
  onDismiss,
  onConfirm,
}: LocationPickerModalProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const defaultLat = initialLocation?.latitude ?? DEFAULT_MAP_REGION.latitude;
  const defaultLng = initialLocation?.longitude ?? DEFAULT_MAP_REGION.longitude;

  const [coordinate, setCoordinate] = useState<{ latitude: number; longitude: number }>({
    latitude: defaultLat,
    longitude: defaultLng,
  });

  const [addressLine, setAddressLine] = useState(initialLocation?.addressLine ?? '');
  const [city, setCity] = useState(initialLocation?.city ?? 'Vijayawada');
  const [state, setState] = useState(initialLocation?.state ?? 'Andhra Pradesh');
  const [pincode, setPincode] = useState(initialLocation?.pincode ?? '520010');

  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [showEditFields, setShowEditFields] = useState(false);

  // Sync when opened
  useEffect(() => {
    if (visible) {
      const lat = initialLocation?.latitude ?? DEFAULT_MAP_REGION.latitude;
      const lng = initialLocation?.longitude ?? DEFAULT_MAP_REGION.longitude;
      setCoordinate({ latitude: lat, longitude: lng });
      setAddressLine(initialLocation?.addressLine ?? '');
      setCity(initialLocation?.city ?? 'Vijayawada');
      setState(initialLocation?.state ?? 'Andhra Pradesh');
      setPincode(initialLocation?.pincode ?? '520010');
      setShowEditFields(false);

      setTimeout(() => {
        mapRef.current?.animateToRegion(
          {
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          },
          500,
        );
      }, 300);
    }
  }, [visible, initialLocation]);

  // Reverse geocode when coordinates change
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setIsReverseGeocoding(true);
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results && results.length > 0) {
        const addr = results[0];
        const streetParts = [
          addr.streetNumber,
          addr.street,
          addr.name,
          addr.district,
        ].filter(Boolean);
        const derivedStreet = streetParts.length > 0 ? streetParts.join(', ') : '';
        if (derivedStreet) setAddressLine(derivedStreet);
        if (addr.city || addr.subregion) setCity(addr.city || addr.subregion || '');
        if (addr.region) setState(addr.region);
        if (addr.postalCode) setPincode(addr.postalCode);
      }
    } catch {
      // Ignore geocode lookup failures (network or permission issues)
    } finally {
      setIsReverseGeocoding(false);
    }
  }, []);

  const handleMapPress = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setCoordinate({ latitude, longitude });
    void reverseGeocode(latitude, longitude);
  };

  const handleMarkerDragEnd = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setCoordinate({ latitude, longitude });
    void reverseGeocode(latitude, longitude);
  };

  const locateDevice = async () => {
    setIsLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission Denied', 'Please allow location permission to center on your current position.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const nextCoord = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      setCoordinate(nextCoord);
      mapRef.current?.animateToRegion(
        {
          ...nextCoord,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500,
      );
      void reverseGeocode(nextCoord.latitude, nextCoord.longitude);
    } catch (err: any) {
      Alert.alert('GPS unavailable', err?.message || 'Could not fetch current device position.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleManualCoordChange = (latStr: string, lngStr: string) => {
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      const nextCoord = { latitude: lat, longitude: lng };
      setCoordinate(nextCoord);
      mapRef.current?.animateToRegion({
        ...nextCoord,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });
    }
  };

  const handleConfirm = () => {
    onConfirm({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      addressLine: addressLine.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      pincode: pincode.trim() || undefined,
    });
    onDismiss();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Top Header */}
        <View style={styles.header}>
          <Pressable onPress={onDismiss} style={styles.closeBtn} hitSlop={12}>
            <MaterialCommunityIcons name="close" size={22} color={palette.ink} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerSubtitle}>Tap map or drag pin to position charging stall</Text>
          </View>
          <Pressable onPress={locateDevice} style={styles.gpsBtn} hitSlop={8} disabled={isLocating}>
            <MaterialCommunityIcons
              name={isLocating ? 'loading' : 'crosshairs-gps'}
              size={20}
              color={palette.primary}
            />
          </Pressable>
        </View>

        {/* Interactive Google Map Area */}
        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: defaultLat,
              longitude: defaultLng,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
            onPress={handleMapPress}
            showsUserLocation
            showsMyLocationButton={false}
          >
            <Marker
              coordinate={coordinate}
              draggable
              onDragEnd={handleMarkerDragEnd}
              title="EV Charging Point"
              description="Hold and drag to fine-tune stall location"
            >
              <View style={styles.customPinContainer}>
                <View style={styles.pinBubble}>
                  <MaterialCommunityIcons name="ev-station" size={16} color="#FFFFFF" />
                </View>
                <View style={styles.pinNeedle} />
                <View style={styles.pinBaseDot} />
              </View>
            </Marker>
          </MapView>

          {/* Floating Instruction Banner */}
          <View style={styles.floatingHint}>
            <MaterialCommunityIcons name="gesture-tap" size={14} color="#059669" />
            <Text style={styles.floatingHintText}>Tap anywhere or drag pin to move charger location</Text>
          </View>

          {/* Floating GPS button on map */}
          <Pressable onPress={locateDevice} style={styles.floatingGpsBtn} disabled={isLocating}>
            <MaterialCommunityIcons
              name={isLocating ? 'loading' : 'crosshairs-gps'}
              size={22}
              color={palette.primary}
            />
          </Pressable>
        </View>

        {/* Bottom Details & Edit Sheet */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.bottomCard}
        >
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 16) + 10 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Coordinate & Geocode Preview */}
            <View style={styles.previewRow}>
              <View style={styles.previewIconWrap}>
                <MaterialCommunityIcons name="map-marker-check" size={24} color={palette.primary} />
              </View>
              <View style={styles.previewTextWrap}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.previewLabel}>Pinned Station Location</Text>
                  {isReverseGeocoding ? (
                    <ActivityIndicator size="small" color={palette.primary} />
                  ) : null}
                </View>
                <Text style={styles.previewAddress} numberOfLines={2}>
                  {addressLine
                    ? `${addressLine}, ${city}`
                    : `${city}, ${state} ${pincode}`}
                </Text>
                <Text style={styles.previewCoords}>
                  Lat: {coordinate.latitude.toFixed(6)}, Lng: {coordinate.longitude.toFixed(6)}
                </Text>
              </View>

              {/* Toggle manual edit fields */}
              <Pressable
                onPress={() => setShowEditFields((prev) => !prev)}
                style={styles.editToggleBtn}
                hitSlop={8}
              >
                <MaterialCommunityIcons
                  name={showEditFields ? 'chevron-up' : 'square-edit-outline'}
                  size={18}
                  color={palette.primary}
                />
                <Text style={styles.editToggleText}>
                  {showEditFields ? 'Hide' : 'Edit'}
                </Text>
              </Pressable>
            </View>

            {/* Editable Address & Coordinates Fields */}
            {showEditFields ? (
              <View style={styles.editFieldsWrap}>
                <Text style={styles.fieldSectionTitle}>Edit Address & Coordinates</Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Street / Building / Landmark</Text>
                  <TextInput
                    style={styles.input}
                    value={addressLine}
                    onChangeText={setAddressLine}
                    placeholder="e.g. Near Benz Circle, Bandar Road"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.twoCol}>
                  <View style={styles.col}>
                    <Text style={styles.inputLabel}>City</Text>
                    <TextInput
                      style={styles.input}
                      value={city}
                      onChangeText={setCity}
                      placeholder="Vijayawada"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.inputLabel}>PIN Code</Text>
                    <TextInput
                      style={styles.input}
                      value={pincode}
                      onChangeText={setPincode}
                      placeholder="520010"
                      keyboardType="number-pad"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>State</Text>
                  <TextInput
                    style={styles.input}
                    value={state}
                    onChangeText={setState}
                    placeholder="Andhra Pradesh"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.twoCol}>
                  <View style={styles.col}>
                    <Text style={styles.inputLabel}>Latitude</Text>
                    <TextInput
                      style={styles.input}
                      value={String(coordinate.latitude)}
                      onChangeText={(val) => handleManualCoordChange(val, String(coordinate.longitude))}
                      keyboardType="decimal-pad"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.inputLabel}>Longitude</Text>
                    <TextInput
                      style={styles.input}
                      value={String(coordinate.longitude)}
                      onChangeText={(val) => handleManualCoordChange(String(coordinate.latitude), val)}
                      keyboardType="decimal-pad"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>
              </View>
            ) : null}

            {/* Confirmation CTA */}
            <View style={styles.actionRow}>
              <Button
                mode="contained"
                icon="check-circle"
                onPress={handleConfirm}
                style={styles.confirmBtn}
                contentStyle={styles.confirmBtnContent}
                buttonColor={palette.primary}
              >
                Set This Charger Location
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.ink,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: palette.muted,
    marginTop: 1,
  },
  gpsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  mapWrap: {
    flex: 1,
    position: 'relative',
  },
  customPinContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  pinNeedle: {
    width: 3,
    height: 10,
    backgroundColor: '#059669',
  },
  pinBaseDot: {
    width: 8,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#059669',
    opacity: 0.6,
  },
  floatingHint: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  floatingHintText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: palette.ink,
  },
  floatingGpsBtn: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    borderWidth: 1,
    borderColor: palette.border,
  },
  bottomCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    maxHeight: '48%',
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetContent: {
    padding: spacing.md,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  previewIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTextWrap: {
    flex: 1,
  },
  previewLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: palette.muted,
    textTransform: 'uppercase',
  },
  previewAddress: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.ink,
    marginTop: 2,
  },
  previewCoords: {
    fontSize: 11,
    color: palette.muted,
    marginTop: 2,
  },
  editToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.md,
    backgroundColor: palette.primaryLight,
  },
  editToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primaryDark,
  },
  editFieldsWrap: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  fieldSectionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: palette.ink,
    marginBottom: spacing.sm,
  },
  inputGroup: {
    marginBottom: spacing.sm,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.muted,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: palette.ink,
  },
  twoCol: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  col: {
    flex: 1,
  },
  actionRow: {
    marginTop: spacing.md,
  },
  confirmBtn: {
    borderRadius: radius.md,
  },
  confirmBtnContent: {
    paddingVertical: 6,
  },
});

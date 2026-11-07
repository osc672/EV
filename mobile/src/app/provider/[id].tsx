import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AppMapView, { Marker, Polyline } from '@/components/AppMapView';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button, Chip, Dialog, Divider, Portal, TextInput } from 'react-native-paper';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { EmptyState } from '@/components/EmptyState';
import { InfoRow } from '@/components/InfoRow';
import { Loading } from '@/components/Loading';
import { RatingLine, Stars } from '@/components/Stars';
import { useCreateBooking } from '@/hooks/useBookings';
import { useFavorites, useToggleFavorite, useVehicles } from '@/hooks/useAccount';
import { useCurrentLocation } from '@/hooks/useLocation';
import { useProvider, useProviderReviews } from '@/hooks/useProviders';
import { getErrorMessage } from '@/lib/api';
import { CONNECTOR_LABELS, PROVIDER_TYPE_LABELS, resolveImageUrl } from '@/lib/config';
import { searchApi, reviewsApi } from '@/lib/endpoints';
import { queryClient, queryKeys } from '@/lib/queryClient';
import { addMinutes, formatCurrency, formatDate, formatDistance, nextQuarterHour, timeAgo, toNumber } from '@/lib/format';
import { calculateDistanceKm, decodePolyline, estimateDrivingMinutes, openGoogleMapsRoute } from '@/lib/maps';
import { palette, radius, spacing } from '@/theme';
import type { ConnectorType } from '@/types/api';

interface Slot {
  key: string;
  label: string;
  date: Date;
}

function formatPhone(phone?: string | null): string {
  if (!phone) return 'Phone Verified';
  const clean = phone.trim();
  if (clean.startsWith('+91') && clean.length === 13) {
    return `+91 ${clean.slice(3, 8)} ${clean.slice(8)}`;
  }
  return clean;
}

export default function ProviderDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const insets = useSafeAreaInsets();
  const providerId = typeof id === 'string' ? id : undefined;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)');
    }
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  const { data: provider, isLoading, isError, refetch } = useProvider(providerId);
  const { data: reviews } = useProviderReviews(providerId);
  const { data: favorites } = useFavorites();
  const { data: vehicles } = useVehicles();
  const toggleFavorite = useToggleFavorite();
  const createBooking = useCreateBooking();

  const [bookingOpen, setBookingOpen] = useState(false);
  const [connector, setConnector] = useState<ConnectorType | null>(null);
  const [slotKey, setSlotKey] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // User review & rating state
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const handleSubmitReview = async () => {
    if (!providerId) return;
    setSubmittingReview(true);
    try {
      await reviewsApi.create({
        providerId,
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
      });
      setReviewOpen(false);
      setReviewComment('');
      queryClient.invalidateQueries({ queryKey: queryKeys.providers.detail(providerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews(providerId) });
      Alert.alert('Review Added ⭐', 'Thank you! Your rating and review for this charging point is published.');
    } catch (err) {
      Alert.alert('Could not submit review', getErrorMessage(err));
    } finally {
      setSubmittingReview(false);
    }
  };

  const { coords: userCoords } = useCurrentLocation();

  const destLat = provider?.location?.latitude;
  const destLng = provider?.location?.longitude;

  const distanceKm = useMemo(() => {
    if (provider?.location?.distanceKm !== undefined) {
      return Number(provider.location.distanceKm);
    }
    if (userCoords && destLat && destLng) {
      return calculateDistanceKm(userCoords.latitude, userCoords.longitude, destLat, destLng);
    }
    return null;
  }, [provider?.location?.distanceKm, userCoords, destLat, destLng]);

  const drivingMinutes = distanceKm !== null ? estimateDrivingMinutes(distanceKm) : null;

  const userLatRounded = userCoords ? Math.round(userCoords.latitude * 1000) / 1000 : undefined;
  const userLngRounded = userCoords ? Math.round(userCoords.longitude * 1000) / 1000 : undefined;
  const destLatRounded = destLat ? Math.round(destLat * 1000) / 1000 : undefined;
  const destLngRounded = destLng ? Math.round(destLng * 1000) / 1000 : undefined;

  const { data: routeData } = useQuery({
    queryKey: ['route', userLatRounded, userLngRounded, destLatRounded, destLngRounded],
    queryFn: () =>
      searchApi.route({
        fromLat: userLatRounded!,
        fromLng: userLngRounded!,
        toLat: destLatRounded!,
        toLng: destLngRounded!,
      }),
    enabled: Boolean(userLatRounded && userLngRounded && destLatRounded && destLngRounded),
    staleTime: 60_000,
  });

  const polyline = routeData?.polyline;
  const userLat = userCoords?.latitude;
  const userLng = userCoords?.longitude;

  const routePoints = useMemo(() => {
    if (polyline) {
      try {
        const decoded = decodePolyline(polyline);
        if (decoded.length > 0) return decoded;
      } catch {
        // Fallback to straight line
      }
    }
    if (userLat !== undefined && userLng !== undefined && destLat && destLng) {
      return [
        { latitude: userLat, longitude: userLng },
        { latitude: destLat, longitude: destLng },
      ];
    }
    return [];
  }, [polyline, userLat, userLng, destLat, destLng]);

  const mapRegion = useMemo(() => {
    if (!destLat || !destLng) return undefined;
    if (userLat === undefined || userLng === undefined) {
      return {
        latitude: destLat,
        longitude: destLng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    const midLat = (userLat + destLat) / 2;
    const midLng = (userLng + destLng) / 2;
    const latDelta = Math.max(0.015, Math.abs(userLat - destLat) * 1.6);
    const lngDelta = Math.max(0.015, Math.abs(userLng - destLng) * 1.6);
    return {
      latitude: midLat,
      longitude: midLng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [destLat, destLng, userLat, userLng]);

  const isFavorite = Boolean(favorites?.some((f) => f.providerId === providerId));

  const slots = useMemo<Slot[]>(() => {
    const list: Slot[] = [];
    const now = nextQuarterHour(new Date());
    for (let i = 0; i < 4; i += 1) {
      const date = addMinutes(now, i * 15);
      list.push({
        key: `today-${i}`,
        label: `Today ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
        date,
      });
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    [9, 12, 15, 18].forEach((hour) => {
      const date = new Date(tomorrow);
      date.setHours(hour, 0, 0, 0);
      list.push({
        key: `tomorrow-${hour}`,
        label: `Tomorrow ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
        date,
      });
    });
    return list;
  }, []);

  const openBooking = () => {
    if (!provider) return;
    const firstConnector = provider.connectorTypes[0] ?? 'TYPE_2';
    const primaryVehicle = vehicles?.find((v) => v.isPrimary) ?? vehicles?.[0];
    setConnector(firstConnector);
    setSlotKey(slots[0]?.key ?? null);
    setVehicleId(primaryVehicle?.id ?? null);
    setNotes('');
    setBookingOpen(true);
  };

  const submitBooking = async () => {
    if (!provider) return;
    const slot = slots.find((s) => s.key === slotKey);
    if (!connector || !slot) {
      Alert.alert('Choose a slot', 'Pick a connector and a start time.');
      return;
    }
    setSubmitting(true);
    try {
      const booking = await createBooking.mutateAsync({
        providerId: provider.id,
        connectorType: connector,
        scheduledAt: slot.date.toISOString(),
        vehicleId: vehicleId ?? undefined,
        notes: notes.trim() || undefined,
        driverLatitude: userCoords?.latitude,
        driverLongitude: userCoords?.longitude,
      });

      setBookingOpen(false);
      router.push({
        pathname: '/booking/[id]',
        params: { id: booking.id, justBooked: '1' },
      });
    } catch (error) {
      Alert.alert('Booking failed', getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <Loading label="Loading charging point…" />;

  if (isError || !provider) {
    return (
      <View style={styles.errorWrap}>
        <Stack.Screen
          options={{
            title: 'Charging point',
            headerLeft: () => (
              <Pressable onPress={handleBack} hitSlop={10} style={{ paddingRight: 12 }}>
                <MaterialCommunityIcons name="arrow-left" size={24} color={palette.ink} />
              </Pressable>
            ),
          }}
        />
        <EmptyState
          icon="ev-station"
          title="Charger unavailable"
          message="This charging point may have been removed or is not reachable."
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      </View>
    );
  }

  const price = provider.pricePerKwh ? formatCurrency(provider.pricePerKwh) : 'Free';
  const amenities = [
    { key: 'hasParking', icon: 'parking', label: 'Parking' },
    { key: 'hasRestroom', icon: 'human-male-female', label: 'Restroom' },
    { key: 'hasWifi', icon: 'wifi', label: 'Wi-Fi' },
    { key: 'hasCctv', icon: 'cctv', label: 'CCTV' },
  ] as const;

  // Filter out payment QR codes and verification documents so users only see physical charging stall photos
  const facilityPhotos = (provider.documents ?? []).filter((doc) => {
    if (!doc.fileUrl) return false;
    const type = String(doc.type || '').toUpperCase();
    const url = String(doc.fileUrl || '').toLowerCase();

    // Never show QR codes, payment scanners, or private verification documents in stall photos
    if (
      type === 'OTHER' ||
      type === 'UPI_QR' ||
      type === 'PAYMENT_QR' ||
      type === 'ID_PROOF' ||
      type === 'ADDRESS_PROOF' ||
      type === 'OWNERSHIP_PROOF' ||
      type === 'ELECTRICITY_BILL' ||
      type === 'BUSINESS_LICENSE' ||
      url.includes('qr') ||
      url.includes('scanner')
    ) {
      return false;
    }

    return type === 'CHARGER_PHOTO' || type === 'SITE_PHOTO' || !type;
  });

  const hostAvatar = provider.user?.avatarUrl;

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: 'Charging point',
          headerLeft: () => (
            <Pressable onPress={handleBack} hitSlop={10} style={{ paddingRight: 12 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={palette.ink} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 130 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* TOP HERO GALLERY: Physical Charger Premises & Stall Photo */}
        {facilityPhotos.length > 0 ? (
          <View style={styles.galleryBannerWrap}>
            {facilityPhotos.length === 1 ? (
              <View style={styles.singlePhotoWrap}>
                <Image
                  source={{ uri: resolveImageUrl(facilityPhotos[0].fileUrl) || facilityPhotos[0].fileUrl }}
                  style={styles.heroStallImage}
                  resizeMode="cover"
                />
                <View style={styles.photoOverlayBadge}>
                  <MaterialCommunityIcons name="ev-station" size={13} color="#FFFFFF" />
                  <Text style={styles.photoOverlayBadgeText}>Verified Charger Hardware</Text>
                </View>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryScroll}
              >
                {facilityPhotos.map((doc, idx) => (
                  <View key={doc.id || idx} style={styles.multiPhotoItem}>
                    <Image
                      source={{ uri: resolveImageUrl(doc.fileUrl) || doc.fileUrl }}
                      style={styles.multiPhotoImage}
                      resizeMode="cover"
                    />
                    <View style={styles.photoOverlayBadge}>
                      <MaterialCommunityIcons name="ev-station" size={13} color="#FFFFFF" />
                      <Text style={styles.photoOverlayBadgeText}>Stall Photo #{idx + 1}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        {/* Station Name & Core Badges */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroBadges}>
              <View style={styles.typePill}>
                <Text style={styles.typeText}>
                  {PROVIDER_TYPE_LABELS[provider.providerType] ?? provider.providerType}
                </Text>
              </View>
              {provider.isVerified ? (
                <View style={styles.verifiedPill}>
                  <MaterialCommunityIcons name="check-decagram" size={13} color="#059669" />
                  <Text style={styles.verifiedText}>Verified Station</Text>
                </View>
              ) : null}
            </View>

            <Pressable
              onPress={() =>
                toggleFavorite.mutate({ providerId: provider.id, isFavorite })
              }
              style={styles.heartButton}
              hitSlop={8}
            >
              <MaterialCommunityIcons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={22}
                color={isFavorite ? palette.danger : palette.primary}
              />
            </Pressable>
          </View>

          <Text style={styles.name}>{provider.businessName}</Text>
          <View style={styles.ratingRow}>
            <RatingLine rating={toNumber(provider.rating)} count={provider.totalReviews} />
            {provider.location?.distanceKm !== undefined ? (
              <Text style={styles.distance}>· {formatDistance(provider.location.distanceKm)}</Text>
            ) : null}
          </View>
          <View style={styles.openRow}>
            <View
              style={[
                styles.openDot,
                { backgroundColor: provider.isOpenNow ? palette.success : palette.danger },
              ]}
            />
            <Text style={styles.openText}>
              {provider.is24x7 ? 'Open 24 × 7' : provider.isOpenNow ? 'Open now' : 'Closed now'}
              {provider.is24x7 ? '' : ` · ${provider.openingTime}–${provider.closingTime}`}
            </Text>
          </View>
        </View>

        {/* HOST IDENTITY & TRUST VERIFICATION CARD (Clean Airbnb Style) */}
        <View style={styles.hostCard}>
          <View style={styles.hostCardHeader}>
            <View style={styles.hostHeaderLeft}>
              <MaterialCommunityIcons name="shield-check" size={16} color="#059669" />
              <Text style={styles.hostHeaderTitle}>Host & Station Verified</Text>
            </View>
            <View
              style={[
                styles.hostStatusBadge,
                provider.isVerified ? styles.hostStatusVerified : styles.hostStatusPending,
              ]}
            >
              <MaterialCommunityIcons
                name={provider.isVerified ? 'check-decagram' : 'clock-outline'}
                size={12}
                color={provider.isVerified ? '#059669' : '#D97706'}
              />
              <Text
                style={[
                  styles.hostStatusBadgeText,
                  { color: provider.isVerified ? '#059669' : '#D97706' },
                ]}
              >
                {provider.isVerified ? 'Verified Real' : 'Pending Review'}
              </Text>
            </View>
          </View>

          <View style={styles.hostRow}>
            <View style={styles.hostAvatarContainer}>
              {hostAvatar ? (
                <Image
                  source={{ uri: resolveImageUrl(hostAvatar) || hostAvatar }}
                  style={styles.hostAvatarImg}
                />
              ) : (
                <View style={styles.hostAvatarFallback}>
                  <Text style={styles.hostAvatarText}>
                    {(provider.user?.fullName ?? provider.businessName).charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              {provider.isVerified ? (
                <View style={styles.hostVerifiedDot}>
                  <MaterialCommunityIcons name="check" size={10} color="#FFFFFF" />
                </View>
              ) : null}
            </View>

            <View style={styles.hostDetails}>
              <Text style={styles.hostFullName}>
                {provider.user?.fullName ?? provider.businessName}
              </Text>
              <Text style={styles.hostRoleSubtitle}>Station Host</Text>
              {provider.phone ? (
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${provider.phone}`)}
                  style={styles.hostPhoneRow}
                >
                  <MaterialCommunityIcons name="phone" size={12} color={palette.primary} />
                  <Text style={styles.hostPhoneText}>{formatPhone(provider.phone)}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.trustBanner}>
            <MaterialCommunityIcons name="face-recognition" size={14} color="#059669" />
            <Text style={styles.trustBannerText}>
              Host personal identity and physical charger stall confirmed real ✓
            </Text>
          </View>
        </View>

        {/* Metrics Grid (Price, Power, Trips) */}
        <View style={styles.priceCard}>
          <View style={styles.priceBlock}>
            <Text style={styles.priceValue}>{price}</Text>
            <Text style={styles.priceLabel}>{provider.pricePerKwh ? 'per kWh' : 'no charge'}</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.priceBlock}>
            <Text style={styles.priceValue}>{provider.maxPowerKw} kW</Text>
            <Text style={styles.priceLabel}>max power</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.priceBlock}>
            <Text style={styles.priceValue}>{provider.totalBookings}</Text>
            <Text style={styles.priceLabel}>sessions</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connectors</Text>
          <View style={styles.chipRow}>
            {provider.connectorTypes.map((type) => (
              <View key={type} style={styles.connectorChip}>
                <MaterialCommunityIcons name="ev-plug-type2" size={14} color={palette.primary} />
                <Text style={styles.connectorText}>{CONNECTOR_LABELS[type] ?? type}</Text>
              </View>
            ))}
          </View>
        </View>

        {provider.description ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>About this charger</Text>
            <Text style={styles.description}>{provider.description}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Location & Route</Text>

          {distanceKm !== null ? (
            <View style={styles.routeStatsBox}>
              <View style={styles.routeStatItem}>
                <MaterialCommunityIcons name="map-marker-distance" size={24} color={palette.primary} />
                <View>
                  <Text style={styles.routeStatValue}>{distanceKm.toFixed(1)} km</Text>
                  <Text style={styles.routeStatLabel}>Distance from you</Text>
                </View>
              </View>
              <View style={styles.routeDivider} />
              <View style={styles.routeStatItem}>
                <MaterialCommunityIcons name="clock-fast" size={24} color={palette.accent} />
                <View>
                  <Text style={styles.routeStatValue}>~{drivingMinutes} min</Text>
                  <Text style={styles.routeStatLabel}>Drive time</Text>
                </View>
              </View>
            </View>
          ) : null}

          {provider.location ? (
            <View style={styles.mapWrap}>
              <AppMapView
                style={StyleSheet.absoluteFill}
                region={mapRegion}
                scrollEnabled={true}
                zoomEnabled={true}
                toolbarEnabled={false}
              >
                {userCoords ? (
                  <Marker
                    coordinate={{
                      latitude: userCoords.latitude,
                      longitude: userCoords.longitude,
                    }}
                    title="Your Location"
                    description="You are here"
                    pinColor="#2C7BE5"
                  />
                ) : null}
                <Marker
                  coordinate={{
                    latitude: provider.location.latitude,
                    longitude: provider.location.longitude,
                  }}
                  title={provider.businessName}
                  description={provider.addressLine}
                  pinColor={palette.primary}
                />
                {routePoints.length > 1 ? (
                  <Polyline
                    coordinates={routePoints}
                    strokeWidth={4}
                    strokeColor={palette.primary}
                  />
                ) : null}
              </AppMapView>
            </View>
          ) : null}

          {destLat && destLng ? (
            <Button
              mode="contained"
              icon="google-maps"
              onPress={() =>
                openGoogleMapsRoute(
                  destLat,
                  destLng,
                  provider.businessName,
                  userCoords?.latitude,
                  userCoords?.longitude,
                )
              }
              style={styles.navButton}
              contentStyle={styles.navButtonContent}
              buttonColor="#1A73E8"
              textColor="#FFFFFF"
            >
              Navigate in Google Maps
            </Button>
          ) : null}

          <InfoRow
            icon="map-marker-outline"
            label="Address"
            value={`${provider.addressLine}, ${provider.city}, ${provider.state} ${provider.pincode}`}
          />
          <InfoRow
            icon="clock-outline"
            label="Hours"
            value={provider.is24x7 ? 'Open 24 × 7' : `${provider.openingTime} – ${provider.closingTime}`}
          />
          {provider.phone ? (
            <Pressable onPress={() => void Linking.openURL(`tel:${provider.phone}`)}>
              <InfoRow icon="phone-outline" label="Phone" value={provider.phone} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Amenities</Text>
          <View style={styles.amenities}>
            {amenities.map((amenity) => {
              const available = provider[amenity.key];
              return (
                <View
                  key={amenity.key}
                  style={[styles.amenity, !available && styles.amenityOff]}
                >
                  <MaterialCommunityIcons
                    name={amenity.icon}
                    size={18}
                    color={available ? palette.primary : '#B6C3BC'}
                  />
                  <Text style={[styles.amenityText, !available && styles.amenityTextOff]}>
                    {amenity.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.reviewHeader}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.cardTitle}>Reviews & Ratings</Text>
                <View style={styles.ratingBadgePill}>
                  <MaterialCommunityIcons name="star" size={13} color="#F59E0B" />
                  <Text style={styles.ratingBadgePillText}>
                    {provider.avgRating ? Number(provider.avgRating).toFixed(1) : '5.0'}
                  </Text>
                </View>
              </View>
              <Text style={styles.reviewCount}>{provider.totalReviews} total driver ratings</Text>
            </View>
            <Button
              mode="contained-tonal"
              compact
              icon="star-plus-outline"
              onPress={() => setReviewOpen(true)}
              contentStyle={{ height: 34, paddingHorizontal: 6 }}
              labelStyle={{ fontSize: 12, fontWeight: '700' }}
            >
              Add Review
            </Button>
          </View>

          {reviews && reviews.length > 0 ? (
            reviews.slice(0, 10).map((review) => (
              <View key={review.id} style={styles.review}>
                <View style={styles.reviewTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.reviewerAvatar}>
                      <Text style={styles.reviewerAvatarText}>
                        {(review.driver?.fullName ?? 'D').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.reviewer}>{review.driver?.fullName ?? 'EV Driver'}</Text>
                      <Stars rating={review.rating} size={13} />
                    </View>
                  </View>
                  <Text style={styles.reviewDate}>{timeAgo(review.createdAt)}</Text>
                </View>
                {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
              </View>
            ))
          ) : (
            <View style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
              <MaterialCommunityIcons name="star-outline" size={32} color="#CBD5E1" />
              <Text style={styles.noReviews}>No driver reviews yet.</Text>
              <Text style={[styles.noReviews, { fontSize: 12, marginTop: 2 }]}>
                Be the first to share your charging experience!
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        <View>
          <Text style={styles.bottomPrice}>{price}</Text>
          <Text style={styles.bottomLabel}>per kWh · {provider.maxPowerKw} kW</Text>
        </View>
        <Button
          mode="contained"
          icon="lightning-bolt"
          onPress={openBooking}
          style={styles.bookButton}
          contentStyle={styles.bookButtonContent}
          disabled={!provider.isOpenNow}
        >
          {provider.isOpenNow ? 'Book a slot' : 'Closed'}
        </Button>
      </View>

      <Portal>
        <Dialog visible={bookingOpen} onDismiss={() => setBookingOpen(false)} style={styles.dialog}>
          <Dialog.Title>Request a charge</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView contentContainerStyle={styles.dialogContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.dialogLabel}>Connector</Text>
              <View style={styles.chipRow}>
                {provider.connectorTypes.map((type) => (
                  <Chip
                    key={type}
                    selected={connector === type}
                    onPress={() => setConnector(type)}
                    style={[styles.selectChip, connector === type && styles.selectChipActive]}
                    textStyle={[styles.selectText, connector === type && styles.selectTextActive]}
                    showSelectedOverlay={false}
                  >
                    {CONNECTOR_LABELS[type] ?? type}
                  </Chip>
                ))}
              </View>

              <Text style={styles.dialogLabel}>Start time</Text>
              <View style={styles.chipRow}>
                {slots.map((slot) => (
                  <Chip
                    key={slot.key}
                    selected={slotKey === slot.key}
                    onPress={() => setSlotKey(slot.key)}
                    style={[styles.selectChip, slotKey === slot.key && styles.selectChipActive]}
                    textStyle={[styles.selectText, slotKey === slot.key && styles.selectTextActive]}
                    showSelectedOverlay={false}
                  >
                    {slot.label}
                  </Chip>
                ))}
              </View>

              <Text style={styles.dialogLabel}>Vehicle</Text>
              <View style={styles.chipRow}>
                <Chip
                  selected={vehicleId === null}
                  onPress={() => setVehicleId(null)}
                  style={[styles.selectChip, vehicleId === null && styles.selectChipActive]}
                  textStyle={[styles.selectText, vehicleId === null && styles.selectTextActive]}
                  showSelectedOverlay={false}
                >
                  No vehicle
                </Chip>
                {(vehicles ?? []).map((vehicle) => (
                  <Chip
                    key={vehicle.id}
                    selected={vehicleId === vehicle.id}
                    onPress={() => setVehicleId(vehicle.id)}
                    style={[styles.selectChip, vehicleId === vehicle.id && styles.selectChipActive]}
                    textStyle={[styles.selectText, vehicleId === vehicle.id && styles.selectTextActive]}
                    showSelectedOverlay={false}
                  >
                    {vehicle.make} {vehicle.model}
                  </Chip>
                ))}
              </View>

              <Text style={styles.dialogLabel}>Notes for the host (optional)</Text>
              <TextInput
                mode="outlined"
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. arriving in 10 minutes with 8% battery"
                multiline
                numberOfLines={3}
                style={styles.notesInput}
                outlineColor={palette.border}
                activeOutlineColor={palette.primary}
              />

              <View style={styles.summary}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Start</Text>
                  <Text style={styles.summaryValue}>
                    {slots.find((s) => s.key === slotKey)?.date
                      ? formatDate(slots.find((s) => s.key === slotKey)!.date)
                      : '—'}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Rate</Text>
                  <Text style={styles.summaryValue}>{price} / kWh</Text>
                </View>
                <Text style={styles.summaryHint}>
                  Final cost is confirmed by the host after charging, based on energy delivered.
                </Text>
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Divider />
          <Dialog.Actions>
            <Button onPress={() => setBookingOpen(false)}>Cancel</Button>
            <Button loading={submitting} disabled={submitting} onPress={submitBooking}>
              Request slot
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={reviewOpen} onDismiss={() => setReviewOpen(false)} style={styles.dialog}>
          <Dialog.Title>Rate & Review Station</Dialog.Title>
          <Dialog.Content>
            <Text style={{ fontSize: 13, color: palette.muted, marginBottom: 12 }}>
              Share your charging experience with other EV drivers visiting {provider?.businessName}.
            </Text>

            <View style={{ alignItems: 'center', marginVertical: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Pressable key={s} onPress={() => setReviewRating(s)} style={{ padding: 4 }}>
                    <MaterialCommunityIcons
                      name={s <= reviewRating ? 'star' : 'star-outline'}
                      size={36}
                      color={s <= reviewRating ? '#F59E0B' : '#CBD5E1'}
                    />
                  </Pressable>
                ))}
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#B45309', marginTop: 4 }}>
                {reviewRating === 5
                  ? '5 Stars — Excellent Host & Charger ⭐'
                  : reviewRating === 4
                  ? '4 Stars — Good Experience'
                  : reviewRating === 3
                  ? '3 Stars — Average Service'
                  : reviewRating === 2
                  ? '2 Stars — Needs Improvement'
                  : '1 Star — Poor Experience'}
              </Text>
            </View>

            <TextInput
              mode="outlined"
              label="Review comment"
              placeholder="e.g. Fast charging speed, courteous host, easy parking access…"
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              numberOfLines={4}
              style={[styles.dialogInput, { minHeight: 85, marginTop: 10 }]}
              outlineColor={palette.border}
              activeOutlineColor={palette.primary}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setReviewOpen(false)}>Cancel</Button>
            <Button
              mode="contained"
              loading={submittingReview}
              disabled={submittingReview}
              onPress={handleSubmitReview}
              style={{ borderRadius: radius.md }}
            >
              Submit Review
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  errorWrap: { flex: 1, justifyContent: 'center' },
  content: { padding: spacing.lg },
  hero: { paddingVertical: spacing.sm },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroBadges: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap', flex: 1 },
  typePill: { backgroundColor: '#E4F5EE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  typeText: { fontSize: 11.5, fontWeight: '800', color: palette.primaryDark },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: palette.primaryLight,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  verifiedText: { fontSize: 11, fontWeight: '800', color: palette.primaryDark },
  heartButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 25, fontWeight: '800', color: palette.ink, marginTop: spacing.md },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  distance: { fontSize: 12.5, color: palette.muted, marginLeft: 4 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  openDot: { width: 8, height: 8, borderRadius: 4 },
  openText: { fontSize: 12.5, color: palette.muted, fontWeight: '600' },
  priceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  priceBlock: { flex: 1, alignItems: 'center' },
  priceValue: { fontSize: 17, fontWeight: '800', color: palette.ink },
  priceLabel: { fontSize: 11, color: palette.muted, marginTop: 2, fontWeight: '600' },
  verticalDivider: { width: 1, height: 32, backgroundColor: palette.border },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  cardTitle: { fontSize: 15.5, fontWeight: '800', color: palette.ink, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  connectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF5F2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  connectorText: { fontSize: 12, fontWeight: '700', color: '#3C5449' },
  description: { fontSize: 13.5, color: palette.muted, lineHeight: 20 },
  mapWrap: { height: 220, borderRadius: radius.md, overflow: 'hidden', marginTop: spacing.sm },
  routeStatsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F8F5',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#D7E7DE',
  },
  routeStatItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  routeStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.ink,
  },
  routeStatLabel: {
    fontSize: 11,
    color: palette.muted,
  },
  routeDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#D7E7DE',
    marginHorizontal: spacing.sm,
  },
  navButton: {
    borderRadius: radius.md,
    marginVertical: spacing.md,
  },
  navButtonContent: {
    paddingVertical: 7,
  },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  amenity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF5F2',
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  amenityOff: { backgroundColor: '#F4F6F5' },
  amenityText: { fontSize: 12, fontWeight: '700', color: '#3C5449' },
  amenityTextOff: { color: '#B6C3BC' },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewCount: { fontSize: 12, color: palette.muted, fontWeight: '600', marginTop: 2 },
  ratingBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  ratingBadgePillText: { fontSize: 11.5, fontWeight: '800', color: '#B45309' },
  reviewerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewerAvatarText: { fontSize: 13, fontWeight: '800', color: '#334155' },
  review: { paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: '#F0F4F2' },
  reviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  reviewer: { fontSize: 13, fontWeight: '700', color: palette.ink },
  reviewDate: { fontSize: 11.5, color: palette.muted },
  reviewComment: { fontSize: 13, color: palette.muted, lineHeight: 19, marginTop: 5 },
  noReviews: { fontSize: 13, color: palette.muted },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  bottomPrice: { fontSize: 18, fontWeight: '800', color: palette.ink },
  bottomLabel: { fontSize: 11.5, color: palette.muted, marginTop: 1 },
  bookButton: { borderRadius: radius.md },
  bookButtonContent: { paddingHorizontal: spacing.lg, paddingVertical: 5 },
  dialog: { borderRadius: radius.lg, backgroundColor: palette.surface },
  dialogInput: { backgroundColor: palette.surface, marginBottom: spacing.sm },
  dialogScroll: { maxHeight: 480, paddingHorizontal: 0 },
  dialogContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  galleryBannerWrap: {
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  singlePhotoWrap: {
    width: '100%',
    height: 190,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  heroStallImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.lg,
  },
  photoOverlayBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(2, 44, 34, 0.85)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  photoOverlayBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  galleryScroll: {
    gap: spacing.sm,
  },
  multiPhotoItem: {
    width: 260,
    height: 180,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  multiPhotoImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.lg,
  },
  hostCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  hostCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: spacing.sm,
  },
  hostHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hostHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.3,
  },
  hostStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  hostStatusVerified: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  hostStatusPending: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  hostStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hostAvatarContainer: {
    position: 'relative',
  },
  hostAvatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#10B981',
    backgroundColor: '#F3F4F6',
  },
  hostAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostAvatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#065F46',
  },
  hostVerifiedDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  hostDetails: {
    flex: 1,
  },
  hostFullName: {
    fontSize: 15,
    fontWeight: '800',
    color: palette.ink,
  },
  hostRoleSubtitle: {
    fontSize: 11.5,
    color: palette.muted,
    marginTop: 1,
  },
  hostPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  hostPhoneText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primaryDark,
  },
  trustBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  trustBannerText: {
    flex: 1,
    fontSize: 11,
    color: '#166534',
    fontWeight: '600',
    lineHeight: 15,
  },
  dialogLabel: { fontSize: 12.5, fontWeight: '700', color: palette.ink, marginTop: spacing.md, marginBottom: 7 },
  selectChip: { backgroundColor: '#F4F7F5', borderWidth: 1, borderColor: palette.border },
  selectChipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  selectText: { fontSize: 12, fontWeight: '700', color: palette.muted },
  selectTextActive: { color: '#FFFFFF' },
  notesInput: { backgroundColor: palette.surface },
  summary: { backgroundColor: '#F4F8F6', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  summaryLabel: { fontSize: 12.5, color: palette.muted, fontWeight: '600' },
  summaryValue: { fontSize: 12.5, color: palette.ink, fontWeight: '700' },
  summaryHint: { fontSize: 11.5, color: palette.muted, marginTop: 6, lineHeight: 16 },
});

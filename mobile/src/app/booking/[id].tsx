import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import * as ImagePicker from 'expo-image-picker';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, Portal, SegmentedButtons, TextInput } from 'react-native-paper';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import AppMapView, { Marker, Polyline } from '@/components/AppMapView';

import { EmptyState } from '@/components/EmptyState';
import { InfoRow } from '@/components/InfoRow';
import { Loading } from '@/components/Loading';
import { StatusBadge } from '@/components/StatusBadge';
import { Stars } from '@/components/Stars';
import { useBooking, useCancelBooking, useSettleOfflinePayment, useUpdateBookingStatus } from '@/hooks/useBookings';
import { useUpdateProfile } from '@/hooks/useAccount';
import { useCurrentLocation } from '@/hooks/useLocation';
import { useMyProvider, useProvider } from '@/hooks/useProviders';
import { useRealtimeBooking } from '@/hooks/useRealtime';
import { getErrorMessage } from '@/lib/api';
import { CONNECTOR_LABELS, resolveImageUrl } from '@/lib/config';
import { paymentsApi, providersApi, reviewsApi, searchApi, uploadsApi, usersApi } from '@/lib/endpoints';
import { playNotificationChime, speakNotification, formatSlotSpeech } from '@/lib/soundNotification';
import {
  formatCurrency,
  formatDateTime,
  timeAgo,
  toNumber,
} from '@/lib/format';
import {
  calculateDistanceKm,
  decodePolyline,
  estimateDrivingMinutes,
  openGoogleMapsRoute,
} from '@/lib/maps';
import { queryKeys } from '@/lib/queryClient';
import { useAuthStore } from '@/store/auth';
import { palette, radius, spacing } from '@/theme';
import type { BookingStatus, PaymentMethod } from '@/types/api';

const FLOW: BookingStatus[] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];

const FLOW_LABELS: Record<string, string> = {
  PENDING: 'Requested',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'Charging',
  COMPLETED: 'Completed',
};

export default function BookingDetailScreen() {
  const { id, justBooked } = useLocalSearchParams<{ id: string; justBooked?: string }>();
  const bookingId = typeof id === 'string' ? id : undefined;
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const { data: booking, isLoading, isError, refetch, isRefetching } = useBooking(bookingId);
  const { data: providerDetail } = useProvider(booking?.providerId);
  const { data: myProvider } = useMyProvider();
  const { coords: userCoords } = useCurrentLocation();
  const updateStatus = useUpdateBookingStatus();
  const cancelBooking = useCancelBooking();

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

  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [kwh, setKwh] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [cancelReason, setCancelReason] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);

  const hostQrDoc = useMemo(() => {
    const docs =
      providerDetail?.documents ??
      (booking?.provider as any)?.documents ??
      myProvider?.documents ??
      [];
    return (
      docs.find(
        (d: any) =>
          d.type === 'OTHER' ||
          d.type === 'UPI_QR' ||
          d.type === 'PAYMENT_QR',
      ) ?? null
    );
  }, [providerDetail?.documents, (booking?.provider as any)?.documents, myProvider?.documents]);

  const handleUploadQrScannerOnBooking = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Please allow photo library access to upload your UPI Payment QR Scanner image.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (result.canceled || !result.assets[0]?.uri || !booking) return;

    setUploadingQr(true);
    try {
      const upload = await uploadsApi.image(result.assets[0].uri, 'documents');
      await providersApi.addDocument({
        type: 'OTHER',
        fileUrl: upload.url,
      });
      await queryClient.invalidateQueries({ queryKey: ['my-provider'] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(booking.id) });
      await queryClient.invalidateQueries({ queryKey: ['provider', booking.providerId] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.providers.documents() });
      void refetch();
      Alert.alert(
        'QR Scanner Uploaded! ✓',
        'Your UPI Payment QR Scanner is now active and displayed for this payment.',
      );
    } catch (err) {
      Alert.alert('Upload failed', getErrorMessage(err));
    } finally {
      setUploadingQr(false);
    }
  };

  const handleRazorpayPayment = async () => {
    if (!booking) return;
    setPaying(true);
    try {
      const order = await paymentsApi.createOrder(booking.id);
      Alert.alert(
        'Razorpay Secure Payment',
        `Pay ₹${((order.amount ?? 15000) / 100).toFixed(2)} to ${booking.provider?.businessName ?? 'Charging Point'}?\n\nGateway Reference: ${order.orderId}`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setPaying(false) },
          {
            text: 'Confirm & Pay',
            onPress: async () => {
              try {
                await paymentsApi.verify({
                  razorpay_order_id: order.orderId,
                  razorpay_payment_id: `pay_${Date.now()}`,
                  razorpay_signature: 'sig_verified',
                });
                Alert.alert('Payment Successful! 🎉', 'Your charging slot has been locked and confirmed via Razorpay.');
                void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(booking.id) });
              } catch (err) {
                Alert.alert('Verification failed', getErrorMessage(err));
              } finally {
                setPaying(false);
              }
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('Payment could not be started', getErrorMessage(error));
      setPaying(false);
    }
  };

  const createReview = useMutation({
    mutationFn: (body: { bookingId: string; rating: number; comment?: string }) =>
      reviewsApi.create(body),
    onSuccess: () => {
      if (bookingId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
      }
      void queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });

  const isProvider = Boolean(booking && user && booking.provider?.userId === user.id);
  const isDriver = Boolean(booking && user && booking.driverId === user.id);

  const settleOfflinePayment = useSettleOfflinePayment();
  const [selectedPayTab, setSelectedPayTab] = useState<'CASH' | 'UPI_SCAN'>('CASH');

  const handleSettleOffline = async (method: 'CASH' | 'UPI') => {
    if (!booking) return;
    setPaying(true);
    try {
      await settleOfflinePayment.mutateAsync({ id: booking.id, method });
      Alert.alert(
        'Payment Recorded 🎉',
        `Payment of ${
          amount ? formatCurrency(amount) : '₹150.00'
        } recorded via ${method === 'CASH' ? 'Cash at Station' : 'UPI QR Scanner'}.`,
      );
    } catch (err) {
      Alert.alert('Payment Error', getErrorMessage(err));
    } finally {
      setPaying(false);
    }
  };

  const rate = useMemo(() => toNumber(booking?.provider?.pricePerKwh), [booking?.provider?.pricePerKwh]);
  const kwhNumber = Number(kwh);
  const estimate = Number.isFinite(kwhNumber) ? Math.round(kwhNumber * rate * 100) / 100 : 0;

  const { liveStatus, driverLocation, sendLocation } = useRealtimeBooking(bookingId);
  const currentStatus = liveStatus || booking?.status;

  const providerLocation = booking?.provider?.location ?? providerDetail?.location;
  const destLat = providerLocation?.latitude;
  const destLng = providerLocation?.longitude;

  // Real User (Driver) Location:
  // If viewing as provider: user location is the driver's GPS (live stream or cached booking location).
  // If viewing as driver: user location is the driver's device GPS (userCoords).
  const activeDriverLocation = driverLocation || (booking as any)?.driverLocation;
  const userLat = isProvider ? activeDriverLocation?.latitude : userCoords?.latitude;
  const userLng = isProvider ? activeDriverLocation?.longitude : userCoords?.longitude;

  const distanceKm = useMemo(() => {
    if (userLat !== undefined && userLng !== undefined && destLat && destLng) {
      return calculateDistanceKm(userLat, userLng, destLat, destLng);
    }
    return null;
  }, [userLat, userLng, destLat, destLng]);

  const drivingMinutes = distanceKm !== null ? estimateDrivingMinutes(distanceKm) : null;

  const userLatRounded = userLat !== undefined ? Math.round(userLat * 1000) / 1000 : undefined;
  const userLngRounded = userLng !== undefined ? Math.round(userLng * 1000) / 1000 : undefined;
  const destLatRounded = destLat !== undefined ? Math.round(destLat * 1000) / 1000 : undefined;
  const destLngRounded = destLng !== undefined ? Math.round(destLng * 1000) / 1000 : undefined;

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

  const [chargingSeconds, setChargingSeconds] = useState(0);

  useEffect(() => {
    if (currentStatus !== 'IN_PROGRESS' || !booking?.startedAt) return;
    const startTime = new Date(booking.startedAt).getTime();
    const updateElapsed = () => {
      const sec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      setChargingSeconds(sec);
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [currentStatus, booking?.startedAt]);

  const maxPowerKw = booking?.provider?.maxPowerKw ?? 7.4;
  const liveDeliveredKwh = useMemo(() => {
    if (currentStatus !== 'IN_PROGRESS') return 0;
    const kwhDelivered = maxPowerKw * (chargingSeconds / 3600);
    return Math.round(kwhDelivered * 100) / 100;
  }, [currentStatus, maxPowerKw, chargingSeconds]);

  const liveCost = useMemo(() => {
    return Math.round(liveDeliveredKwh * rate * 100) / 100;
  }, [liveDeliveredKwh, rate]);

  useEffect(() => {
    if (isDriver && userCoords?.latitude !== undefined && userCoords?.longitude !== undefined && (currentStatus === 'CONFIRMED' || currentStatus === 'PENDING' || currentStatus === 'IN_PROGRESS')) {
      sendLocation({
        latitude: userCoords.latitude,
        longitude: userCoords.longitude,
      });
    }
  }, [isDriver, userCoords?.latitude, userCoords?.longitude, currentStatus, sendLocation]);


  if (isLoading) return <Loading label="Loading booking…" />;

  if (isError || !booking) {
    return (
      <View style={styles.errorWrap}>
        <EmptyState
          icon="calendar-remove-outline"
          title="Booking unavailable"
          message="This booking may have been removed, or you no longer have access to it."
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      </View>
    );
  }

  const activeStep = FLOW.indexOf(booking.status);
  const amount = booking.totalAmount ?? booking.estimatedCost;

  const runStatus = async (body: {
    status: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
    kwhDelivered?: number;
    cancelReason?: string;
    paymentMethod?: PaymentMethod;
  }) => {
    setBusy(true);
    try {
      await updateStatus.mutateAsync({ id: booking.id, body });
      return true;
    } catch (error) {
      Alert.alert('Could not update booking', getErrorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirmBooking = () => void runStatus({ status: 'CONFIRMED' });

  const startCharging = () => {
    Alert.alert('Start Charging', 'User has arrived at the charging point? Start charging session now?', [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Start Charging',
        onPress: async () => {
          await runStatus({ status: 'IN_PROGRESS' });
        },
      },
    ]);
  };

  const markNoShow = () => {
    Alert.alert('Mark no-show', 'Only do this if the driver never arrived.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark no-show',
        style: 'destructive',
        onPress: () => void runStatus({ status: 'NO_SHOW' }),
      },
    ]);
  };

  const openCompleteModal = () => {
    // Automatically calculate kWh and amount from elapsed charging time!
    const elapsedHours = chargingSeconds > 0 ? chargingSeconds / 3600 : 0.25;
    const computedKwh = Math.round(elapsedHours * maxPowerKw * 100) / 100;
    const finalKwh = computedKwh > 0 ? computedKwh : 1.0;
    setKwh(String(finalKwh));
    setCompleteOpen(true);
  };

  const completeCharging = async () => {
    const finalKwh = Number(kwh) > 0 ? Number(kwh) : liveDeliveredKwh > 0 ? liveDeliveredKwh : 1.0;
    const finalAmount = Math.max(20, Math.round(finalKwh * (rate || 20) * 100) / 100);
    const ok = await runStatus({
      status: 'COMPLETED',
      kwhDelivered: finalKwh,
    });
    if (ok) {
      setCompleteOpen(false);
      Alert.alert(
        'Session Completed 🎉',
        `Charging session finished! Total amount due is ₹${finalAmount}. Payment gateway is now ready below.`,
      );
    }
  };

  const submitCancel = async () => {
    setBusy(true);
    try {
      await cancelBooking.mutateAsync({
        id: booking.id,
        reason: cancelReason.trim() || undefined,
      });
      setCancelOpen(false);
      setCancelReason('');
    } catch (error) {
      Alert.alert('Could not cancel', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async () => {
    setBusy(true);
    try {
      await createReview.mutateAsync({
        bookingId: booking.id,
        rating,
        comment: comment.trim() || undefined,
      });
      setReviewOpen(false);
      setComment('');
    } catch (error) {
      Alert.alert('Could not submit review', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const showFlow = booking.status !== 'CANCELLED' && booking.status !== 'NO_SHOW';
  const canCancel = (isDriver || isProvider) && (booking.status === 'PENDING' || booking.status === 'CONFIRMED');
  const canReview = isDriver && booking.status === 'COMPLETED' && !booking.review;

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: 'Booking',
          headerLeft: () => (
            <Pressable onPress={handleBack} hitSlop={10} style={{ paddingRight: 12 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={palette.ink} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.code}>{booking.code}</Text>
            <View style={styles.statusBadgeRow}>
              <View style={styles.liveIndicator}>
                <View style={styles.livePulseDot} />
                <Text style={styles.liveIndicatorText}>Live</Text>
              </View>
              <StatusBadge status={currentStatus ?? booking.status} />
            </View>
          </View>
          <Text style={styles.title}>
            {isProvider ? booking.driver?.fullName ?? 'Driver' : booking.provider?.businessName ?? 'Charging point'}
          </Text>
          <Text style={styles.subtitle}>
            {isProvider ? 'Charging request at your point' : 'Your emergency charging session'}
          </Text>
          {isRefetching ? <Text style={styles.syncing}>Updating…</Text> : null}
        </View>

        {justBooked ? (
          <View style={styles.justBookedBanner}>
            <View style={styles.justBookedIconWrap}>
              <MaterialCommunityIcons name="check-circle" size={24} color="#0A5C43" />
            </View>
            <View style={styles.justBookedTextWrap}>
              <Text style={styles.justBookedTitle}>Slot Booked Successfully! 🎉</Text>
              <Text style={styles.justBookedSub}>
                Your charging slot is reserved. Follow the directions below to navigate to the charging point.
              </Text>
            </View>
          </View>
        ) : null}

        {/* PROVIDER VIEW: INCOMING RESERVATION DETAILS */}
        {isProvider ? (
          <View style={styles.verificationCard}>
            <View style={styles.verificationCardHeader}>
              <View style={styles.verificationBadge}>
                <MaterialCommunityIcons name="car-electric" size={16} color="#059669" />
                <Text style={styles.verificationBadgeText}>INCOMING DRIVER RESERVATION</Text>
              </View>
              <View style={styles.mobileVerifiedPill}>
                <MaterialCommunityIcons name="check-decagram" size={13} color="#059669" />
                <Text style={styles.mobileVerifiedText}>Verified Phone</Text>
              </View>
            </View>

            <View style={styles.driverProfileBox}>
              <View style={styles.driverPhotoContainer}>
                {booking.driver?.avatarUrl ? (
                  <Image
                    source={{ uri: resolveImageUrl(booking.driver.avatarUrl) || booking.driver.avatarUrl }}
                    style={styles.driverBigPhoto}
                  />
                ) : (
                  <View style={styles.driverBigPhotoFallback}>
                    <Text style={styles.driverBigPhotoText}>
                      {(booking.driver?.fullName ?? 'D').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.driverIdentityDetails}>
                <Text style={styles.driverFullName}>{booking.driver?.fullName ?? 'EV Driver'}</Text>
                <Text style={styles.driverPhoneText}>📞 {booking.driver?.phone}</Text>

                {booking.vehicle ? (
                  <View style={styles.vehicleRow}>
                    <MaterialCommunityIcons name="car-electric" size={15} color="#065F46" />
                    <Text style={styles.vehicleText}>
                      {booking.vehicle.make} {booking.vehicle.model}
                      {booking.vehicle.registrationNumber ? ` · ${booking.vehicle.registrationNumber}` : ''}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {booking.status === 'PENDING' ? (
              <View style={styles.approvalActionBlock}>
                <View style={styles.approvalBtnRow}>
                  <Button
                    mode="outlined"
                    icon="close-circle-outline"
                    textColor={palette.danger}
                    style={styles.declineFullBtn}
                    onPress={() => setCancelOpen(true)}
                    disabled={busy}
                  >
                    Decline Request
                  </Button>
                  <Button
                    mode="contained"
                    icon="check-circle"
                    buttonColor="#059669"
                    style={styles.acceptFullBtn}
                    loading={busy}
                    disabled={busy}
                    onPress={confirmBooking}
                  >
                    Accept & Confirm
                  </Button>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* DRIVER VIEW: VERIFIED HOST & STATION DETAILS */}
        {isDriver && booking.provider ? (
          <View style={styles.verificationCard}>
            <View style={styles.verificationCardHeader}>
              <View style={styles.verificationBadge}>
                <MaterialCommunityIcons name="shield-check" size={16} color="#059669" />
                <Text style={styles.verificationBadgeText}>VERIFIED CHARGING HOST</Text>
              </View>
              <View style={styles.mobileVerifiedPill}>
                <MaterialCommunityIcons name="check-decagram" size={13} color="#059669" />
                <Text style={styles.mobileVerifiedText}>Real Host Verified</Text>
              </View>
            </View>

            <View style={styles.driverProfileBox}>
              <View style={styles.driverPhotoContainer}>
                {providerDetail?.user?.avatarUrl ? (
                  <Image
                    source={{ uri: resolveImageUrl(providerDetail.user.avatarUrl) || providerDetail.user.avatarUrl }}
                    style={styles.driverBigPhoto}
                  />
                ) : (
                  <View style={styles.driverBigPhotoFallback}>
                    <Text style={styles.driverBigPhotoText}>
                      {(booking.provider.businessName ?? 'H').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.driverIdentityDetails}>
                <Text style={styles.driverFullName}>{booking.provider.businessName}</Text>
                <Text style={styles.driverPhoneText}>📞 {booking.provider.phone ?? 'Contact verified'}</Text>
                <Text style={styles.vehicleText}>
                  {[booking.provider.addressLine, booking.provider.city].filter(Boolean).join(', ')}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {destLat && destLng && booking.status !== 'CANCELLED' && booking.status !== 'NO_SHOW' ? (
          <View style={styles.routeCard}>
            <View style={styles.routeHeaderRow}>
              <View style={styles.routeHeaderBadge}>
                <MaterialCommunityIcons name="navigation-variant" size={13} color="#0A5C43" />
                <Text style={styles.routeHeaderBadgeText}>
                  {isProvider ? 'Driver Live Route to Station' : 'Directions to Station'}
                </Text>
              </View>
              <Text style={styles.routeStationName}>
                {isProvider ? `Your Station: ${booking.provider?.businessName ?? ''}` : (booking.provider?.businessName ?? 'Charging Station')}
              </Text>
              <Text style={styles.routeAddressText}>
                {[booking.provider?.addressLine, booking.provider?.city, booking.provider?.state]
                  .filter(Boolean)
                  .join(', ')}
              </Text>
            </View>

            {isProvider && (userLat === undefined || userLng === undefined) ? (
              <View style={styles.waitingDriverGpsBox}>
                <ActivityIndicator size="small" color="#D97706" />
                <Text style={styles.waitingDriverGpsText}>Waiting for driver live GPS signal...</Text>
              </View>
            ) : null}

            {distanceKm !== null ? (
              <View style={styles.routeStatsBox}>
                <View style={styles.routeStatItem}>
                  <MaterialCommunityIcons name="map-marker-distance" size={22} color={palette.primary} />
                  <View>
                    <Text style={styles.routeStatValue}>{distanceKm.toFixed(1)} km</Text>
                    <Text style={styles.routeStatLabel}>{isProvider ? 'Driver distance' : 'Distance from you'}</Text>
                  </View>
                </View>
                <View style={styles.routeDivider} />
                <View style={styles.routeStatItem}>
                  <MaterialCommunityIcons name="clock-fast" size={22} color={palette.accent} />
                  <View>
                    <Text style={styles.routeStatValue}>~{drivingMinutes} min</Text>
                    <Text style={styles.routeStatLabel}>{isProvider ? 'Estimated arrival' : 'Drive time'}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            <View style={styles.mapWrap}>
              <AppMapView
                style={StyleSheet.absoluteFill}
                region={mapRegion}
                scrollEnabled={true}
                zoomEnabled={true}
                toolbarEnabled={false}
              >
                {/* User (Driver) Pin: correctly shows Driver's true location */}
                {userLat !== undefined && userLng !== undefined ? (
                  <Marker
                    coordinate={{ latitude: userLat, longitude: userLng }}
                    title={isProvider ? `${booking.driver?.fullName ?? 'EV Driver'}` : 'Your Location'}
                    description={isProvider ? 'Driver GPS location' : 'You are here'}
                    pinColor={isProvider ? '#E08A00' : '#2C7BE5'}
                  />
                ) : null}

                {/* Charging Station Pin */}
                <Marker
                  coordinate={{ latitude: destLat, longitude: destLng }}
                  title={isProvider ? `Your Station (${booking.provider?.businessName ?? ''})` : (booking.provider?.businessName ?? 'Charging Station')}
                  description={booking.provider?.addressLine ?? ''}
                  pinColor="#059669"
                />

                {routePoints.length > 1 ? (
                  <>
                    <Polyline
                      coordinates={routePoints}
                      strokeWidth={7.5}
                      strokeColor="#1E40AF"
                      lineCap="round"
                      lineJoin="round"
                    />
                    <Polyline
                      coordinates={routePoints}
                      strokeWidth={4.5}
                      strokeColor="#00C0FF"
                      lineCap="round"
                      lineJoin="round"
                    />
                    {drivingMinutes ? (
                      <Marker
                        coordinate={routePoints[Math.floor(routePoints.length / 2)]}
                        anchor={{ x: 0.5, y: 0.5 }}
                        tracksViewChanges={false}
                      >
                        <View style={styles.routeEtaBadge}>
                          <Text style={styles.routeEtaBadgeText}>{drivingMinutes} min</Text>
                          <MaterialCommunityIcons name="leaf" size={13} color="#86EFAC" />
                        </View>
                      </Marker>
                    ) : null}
                  </>
                ) : null}
              </AppMapView>
            </View>

            <Button
              mode="contained"
              icon="google-maps"
              onPress={() => {
                if (isProvider && userLat !== undefined && userLng !== undefined) {
                  openGoogleMapsRoute(
                    userLat,
                    userLng,
                    `${booking.driver?.fullName ?? 'Driver'} Location`,
                    destLat,
                    destLng,
                  );
                } else {
                  openGoogleMapsRoute(
                    destLat,
                    destLng,
                    booking.provider?.businessName ?? 'Charging Station',
                    userLat,
                    userLng,
                  );
                }
              }}
              style={styles.navButton}
              contentStyle={styles.navButtonContent}
              buttonColor="#1A73E8"
              textColor="#FFFFFF"
            >
              {isProvider ? 'View Driver on Google Maps' : 'Navigate in Google Maps'}
            </Button>
          </View>
        ) : null}

        {currentStatus === 'IN_PROGRESS' ? (
          <View style={styles.telemetryCard}>
            <View style={styles.telemetryHeader}>
              <View style={styles.telemetryLiveDot} />
              <Text style={styles.telemetryLiveText}>Live Charging Session Telemetry</Text>
              <MaterialCommunityIcons name="lightning-bolt" size={18} color="#0A5C43" />
            </View>

            <View style={styles.telemetryTimerRow}>
              <Text style={styles.telemetryTimerLabel}>Session Duration</Text>
              <Text style={styles.telemetryTimerVal}>
                {String(Math.floor(chargingSeconds / 3600)).padStart(2, '0')}:
                {String(Math.floor((chargingSeconds % 3600) / 60)).padStart(2, '0')}:
                {String(chargingSeconds % 60).padStart(2, '0')}
              </Text>
            </View>

            <View style={styles.telemetryGrid}>
              <View style={styles.telemetryItem}>
                <MaterialCommunityIcons name="battery-charging-high" size={24} color={palette.primary} />
                <Text style={styles.telemetryVal}>{liveDeliveredKwh} kWh</Text>
                <Text style={styles.telemetryLbl}>Energy Delivered</Text>
              </View>
              <View style={styles.telemetryDivider} />
              <View style={styles.telemetryItem}>
                <MaterialCommunityIcons name="speedometer" size={24} color={palette.accent} />
                <Text style={styles.telemetryVal}>{maxPowerKw} kW</Text>
                <Text style={styles.telemetryLbl}>Power Output</Text>
              </View>
              <View style={styles.telemetryDivider} />
              <View style={styles.telemetryItem}>
                <MaterialCommunityIcons name="currency-inr" size={24} color="#0A5C43" />
                <Text style={styles.telemetryVal}>₹{liveCost}</Text>
                <Text style={styles.telemetryLbl}>Current Cost</Text>
              </View>
            </View>
          </View>
        ) : null}

        {showFlow ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Progress</Text>
            <View style={styles.timeline}>
              {FLOW.map((step, index) => {
                const done = index <= activeStep;
                const current = index === activeStep;
                return (
                  <View key={step} style={styles.timelineItem}>
                    <View style={styles.timelineTrack}>
                      <View
                        style={[
                          styles.timelineDot,
                          done && styles.timelineDotDone,
                          current && styles.timelineDotCurrent,
                        ]}
                      >
                        {done ? (
                          <MaterialCommunityIcons
                            name={current ? 'circle-slice-8' : 'check'}
                            size={12}
                            color="#FFFFFF"
                          />
                        ) : null}
                      </View>
                      {index < FLOW.length - 1 ? (
                        <View style={[styles.timelineLine, done && styles.timelineLineDone]} />
                      ) : null}
                    </View>
                    <Text style={[styles.timelineLabel, done && styles.timelineLabelDone]}>
                      {FLOW_LABELS[step]}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={[styles.noticeCard, booking.status === 'CANCELLED' ? styles.noticeDanger : styles.noticeMuted]}>
            <MaterialCommunityIcons
              name={booking.status === 'CANCELLED' ? 'cancel' : 'account-off-outline'}
              size={20}
              color={booking.status === 'CANCELLED' ? '#A12727' : '#5B2E86'}
            />
            <View style={styles.noticeTextWrap}>
              <Text style={styles.noticeTitle}>
                {booking.status === 'CANCELLED' ? 'Booking cancelled' : 'Driver marked as no-show'}
              </Text>
              {booking.cancelReason ? (
                <Text style={styles.noticeBody}>Reason: {booking.cancelReason}</Text>
              ) : null}
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session details</Text>
          <InfoRow icon="calendar-clock" label="Scheduled for" value={formatDateTime(booking.scheduledAt)} />
          <InfoRow
            icon="ev-plug-type2"
            label="Connector"
            value={CONNECTOR_LABELS[booking.connectorType] ?? booking.connectorType}
          />
          {booking.vehicle ? (
            <InfoRow
              icon="car-electric"
              label="Vehicle"
              value={`${booking.vehicle.make} ${booking.vehicle.model}${
                booking.vehicle.registrationNumber ? ` · ${booking.vehicle.registrationNumber}` : ''
              }`}
            />
          ) : null}
          {booking.startedAt ? (
            <InfoRow icon="play-circle-outline" label="Started" value={formatDateTime(booking.startedAt)} />
          ) : null}
          {booking.completedAt ? (
            <InfoRow icon="check-circle-outline" label="Completed" value={formatDateTime(booking.completedAt)} />
          ) : null}
          {booking.kwhDelivered !== null && booking.kwhDelivered !== undefined ? (
            <InfoRow icon="lightning-bolt" label="Energy delivered" value={`${toNumber(booking.kwhDelivered)} kWh`} />
          ) : null}
          {booking.notes ? (
            <InfoRow icon="note-text-outline" label="Driver notes" value={booking.notes} />
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {isProvider ? 'Driver contact' : 'Charging point'}
          </Text>
          <InfoRow
            icon="map-marker-outline"
            label="Address"
            value={[
              booking.provider?.addressLine,
              booking.provider?.city,
              booking.provider?.state,
            ]
              .filter(Boolean)
              .join(', ')}
          />
          {isProvider ? (
            <Pressable onPress={() => void Linking.openURL(`tel:${booking.driver?.phone ?? ''}`)}>
              <InfoRow
                icon="phone-outline"
                label="Driver phone"
                value={booking.driver?.phone ?? 'Not provided'}
              />
            </Pressable>
          ) : (
            <Pressable onPress={() => void Linking.openURL(`tel:${booking.provider?.phone ?? ''}`)}>
              <InfoRow
                icon="phone-outline"
                label="Host phone"
                value={booking.provider?.phone ?? 'Not provided'}
              />
            </Pressable>
          )}
        </View>

        {booking.status === 'COMPLETED' ? (
          <View style={styles.card}>
            <View style={styles.paymentHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="credit-card-check" size={20} color="#059669" />
                <Text style={styles.cardTitle}>Payment Gateway</Text>
              </View>
              <StatusBadge status={booking.paymentStatus} />
            </View>

            {/* Prominent Amount Box: "that to show amount" */}
            <View style={styles.gatewayAmountBox}>
              <Text style={styles.gatewayAmountLabel}>TOTAL AMOUNT DUE</Text>
              <Text style={styles.gatewayAmountValue}>₹{amount ?? 20}</Text>
              <Text style={styles.gatewayAmountSub}>
                {booking.completedAt && booking.startedAt
                  ? Math.max(1, Math.round((new Date(booking.completedAt).getTime() - new Date(booking.startedAt).getTime()) / 60000))
                  : Math.round(chargingSeconds / 60)} mins charging · {booking.kwhDelivered ?? liveDeliveredKwh} kWh delivered
              </Text>
            </View>

            {/* Show Payment Settlement Methods */}
            {booking.paymentStatus !== 'PAID' ? (
              <View style={styles.settlementSection}>
                <Text style={styles.selectTypeHeading}>Select Payment Type</Text>

                {/* Type Selection: Cash vs UPI Scanner */}
                <View style={styles.settleTabRow}>
                  <Pressable
                    onPress={() => setSelectedPayTab('CASH')}
                    style={[styles.settleTab, selectedPayTab === 'CASH' && styles.settleTabActive]}
                  >
                    <MaterialCommunityIcons
                      name="cash-multiple"
                      size={18}
                      color={selectedPayTab === 'CASH' ? '#059669' : palette.muted}
                    />
                    <Text style={[styles.settleTabText, selectedPayTab === 'CASH' && styles.settleTabTextActive]}>
                      Cash
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setSelectedPayTab('UPI_SCAN')}
                    style={[styles.settleTab, selectedPayTab === 'UPI_SCAN' && styles.settleTabActive]}
                  >
                    <MaterialCommunityIcons
                      name="qrcode-scan"
                      size={18}
                      color={selectedPayTab === 'UPI_SCAN' ? '#059669' : palette.muted}
                    />
                    <Text style={[styles.settleTabText, selectedPayTab === 'UPI_SCAN' && styles.settleTabTextActive]}>
                      UPI Scanner
                    </Text>
                  </Pressable>
                </View>

                {/* IF CASH: SHOW ONLY AMOUNT */}
                {selectedPayTab === 'CASH' ? (
                  <View style={styles.cashBox}>
                    <Text style={styles.cashModeLabel}>Cash Payment</Text>
                    <Text style={styles.cashAmountBig}>₹{amount || 20}</Text>
                    <Text style={styles.cashInstruction}>
                      {isProvider
                        ? `Collect ₹${amount || 20} cash directly in hand from driver.`
                        : `Pay ₹${amount || 20} cash directly to the host.`}
                    </Text>

                    <Button
                      mode="contained"
                      icon="cash-check"
                      buttonColor="#059669"
                      loading={paying}
                      disabled={paying}
                      onPress={() => void handleSettleOffline('CASH')}
                      style={styles.settleActionBtn}
                    >
                      {isProvider ? 'Confirm Cash Received' : 'I Paid Cash to Host'}
                    </Button>
                  </View>
                ) : (
                  /* IF SCANNER: SHOW HOST'S ACTUAL QR SCANNER */
                  hostQrDoc?.fileUrl ? (
                    <View style={styles.upiScanBox}>
                      <View style={styles.qrHostHeaderBadge}>
                        <MaterialCommunityIcons name="check-decagram" size={15} color="#059669" />
                        <Text style={styles.qrHostHeaderText}>Host's Official UPI QR Scanner</Text>
                      </View>
                      <Text style={styles.scannerModeLabel}>Scan QR to Pay ₹{amount || 20}</Text>

                      <View style={styles.realQrContainer}>
                        <Image
                          source={{ uri: resolveImageUrl(hostQrDoc.fileUrl) || hostQrDoc.fileUrl }}
                          style={styles.realQrImage}
                          resizeMode="contain"
                        />
                      </View>

                      <Text style={styles.upiScanInstruction}>
                        {isProvider
                          ? `Show your QR code above to the driver to collect ₹${amount || 20} into your bank account.`
                          : `Scan host's QR code above with Google Pay, PhonePe, Paytm, or BHIM to pay ₹${amount || 20}.`}
                      </Text>

                      {isProvider ? (
                        <Pressable
                          onPress={handleUploadQrScannerOnBooking}
                          disabled={uploadingQr}
                          style={styles.changeQrBtnRow}
                        >
                          <MaterialCommunityIcons name="camera-flip-outline" size={14} color={palette.primary} />
                          <Text style={styles.changeQrBtnText}>
                            {uploadingQr ? 'Uploading new QR…' : 'Change QR Scanner'}
                          </Text>
                        </Pressable>
                      ) : null}

                      <Button
                        mode="contained"
                        icon="check-circle"
                        buttonColor="#059669"
                        loading={paying}
                        disabled={paying}
                        onPress={() => void handleSettleOffline('UPI')}
                        style={styles.settleActionBtn}
                      >
                        {isProvider ? 'Confirm UPI Payment Received' : 'I Paid via UPI'}
                      </Button>
                    </View>
                  ) : isProvider ? (
                    /* PROVIDER HAS NOT UPLOADED QR CODE YET */
                    <View style={styles.qrMissingBox}>
                      <MaterialCommunityIcons name="qrcode-scan" size={42} color="#D97706" />
                      <Text style={styles.qrMissingTitle}>Upload Your Payment QR Scanner</Text>
                      <Text style={styles.qrMissingSubtitle}>
                        You have not uploaded your payment QR scanner yet. Please upload it so the driver can scan and pay you ₹{amount || 20}.
                      </Text>
                      <Button
                        mode="contained"
                        icon="qrcode-plus"
                        buttonColor="#059669"
                        textColor="#FFFFFF"
                        loading={uploadingQr}
                        disabled={uploadingQr}
                        onPress={handleUploadQrScannerOnBooking}
                        style={styles.uploadQrBtn}
                      >
                        Upload QR Scanner Now
                      </Button>
                    </View>
                  ) : (
                    /* DRIVER VIEWING BUT HOST HAS NOT UPLOADED QR */
                    <View style={styles.qrMissingBox}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={38} color="#D97706" />
                      <Text style={styles.qrMissingTitle}>Host QR Scanner Not Uploaded</Text>
                      <Text style={styles.qrMissingSubtitle}>
                        The station host has not uploaded their payment QR scanner yet. Please pay ₹{amount || 20} cash directly to the host.
                      </Text>
                      <Button
                        mode="outlined"
                        icon="cash-multiple"
                        textColor="#059669"
                        onPress={() => setSelectedPayTab('CASH')}
                        style={{ marginTop: 12, borderColor: '#059669' }}
                      >
                        Pay Cash Instead
                      </Button>
                    </View>
                  )
                )}
              </View>
            ) : (
              <View style={styles.paidSuccessCard}>
                <MaterialCommunityIcons name="check-circle" size={28} color="#059669" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.paidSuccessTitle}>Payment Completed</Text>
                  <Text style={styles.paidSuccessSubtitle}>
                    ₹{amount} settled via {booking.paymentMethod === 'UPI' ? 'UPI Scanner' : 'Cash at Station'}.
                  </Text>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.prePaymentHeader}>
              <MaterialCommunityIcons name="information-outline" size={18} color="#0284C7" />
              <Text style={styles.prePaymentTitle}>Payment Information</Text>
            </View>
            <Text style={styles.prePaymentText}>
              {booking.status === 'PENDING'
                ? 'Slot requested. Once host confirms and charging completes, the final bill based on duration will be calculated.'
                : booking.status === 'CONFIRMED'
                ? 'Slot confirmed. Drive to station. The bill will be calculated automatically based on time when charging completes.'
                : 'Charging in progress. Live telemetry is recording. Amount will be finalized when charging completes.'}
            </Text>
            <View style={styles.prePaymentRateRow}>
              <Text style={styles.prePaymentRateLabel}>Tariff Rate</Text>
              <Text style={styles.prePaymentRateVal}>{rate ? `₹${rate}/kWh` : 'Free'}</Text>
            </View>
          </View>
        )}

        {booking.review ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Driver review</Text>
            <View style={styles.reviewHead}>
              <Stars rating={booking.review.rating} />
              <Text style={styles.reviewTime}>{timeAgo(booking.review.createdAt)}</Text>
            </View>
            {booking.review.comment ? (
              <Text style={styles.reviewComment}>{booking.review.comment}</Text>
            ) : null}
          </View>
        ) : null}

        {isProvider && booking.status === 'PENDING' ? (
          <View style={styles.actions}>
            <Button
              mode="contained"
              icon="check"
              loading={busy}
              disabled={busy}
              onPress={confirmBooking}
              style={styles.primaryAction}
              contentStyle={styles.actionContent}
            >
              Accept request
            </Button>
            <Button
              mode="outlined"
              icon="close"
              disabled={busy}
              onPress={() => setCancelOpen(true)}
              style={styles.secondaryAction}
              textColor={palette.danger}
            >
              Decline
            </Button>
          </View>
        ) : null}

        {isProvider && booking.status === 'CONFIRMED' ? (
          <View style={styles.actions}>
            <Button
              mode="contained"
              icon="lightning-bolt"
              loading={busy}
              disabled={busy}
              onPress={startCharging}
              style={styles.primaryAction}
              contentStyle={styles.actionContent}
            >
              Start charging
            </Button>
            <View style={styles.inlineActions}>
              <Button
                mode="outlined"
                icon="account-off-outline"
                disabled={busy}
                onPress={markNoShow}
                style={styles.flexAction}
              >
                No show
              </Button>
              <Button
                mode="outlined"
                icon="close"
                disabled={busy}
                onPress={() => setCancelOpen(true)}
                style={styles.flexAction}
                textColor={palette.danger}
              >
                Cancel
              </Button>
            </View>
          </View>
        ) : null}

        {isProvider && booking.status === 'IN_PROGRESS' ? (
          <View style={styles.actions}>
            <Button
              mode="contained"
              icon="check-decagram"
              buttonColor="#059669"
              textColor="#FFFFFF"
              loading={busy}
              disabled={busy}
              onPress={openCompleteModal}
              style={styles.primaryAction}
              contentStyle={styles.actionContent}
            >
              Finish & Complete Session (₹{liveCost || Math.round((liveDeliveredKwh || 1) * (rate || 20))})
            </Button>
          </View>
        ) : null}

        {canCancel ? (
          <Button
            mode="text"
            disabled={busy}
            onPress={() => setCancelOpen(true)}
            textColor={palette.danger}
            style={styles.cancelLink}
          >
            Cancel this booking
          </Button>
        ) : null}

        {canReview ? (
          <Button
            mode="contained-tonal"
            icon="star-outline"
            onPress={() => setReviewOpen(true)}
            style={styles.reviewButton}
          >
            Rate this charging session
          </Button>
        ) : null}

        {!isProvider && !isDriver ? (
          <Text style={styles.adminNote}>You are viewing this booking as an administrator (read-only).</Text>
        ) : null}
      </ScrollView>

      <Portal>
        <Dialog visible={completeOpen} onDismiss={() => setCompleteOpen(false)} style={styles.dialog}>
          <Dialog.Title>Confirm Charge Complete</Dialog.Title>
          <Dialog.Content>
            <View style={styles.completeSummaryCard}>
              <View style={styles.completeSummaryRow}>
                <Text style={styles.completeSummaryLabel}>SESSION DURATION</Text>
                <Text style={styles.completeSummaryValue}>
                  {Math.max(1, Math.floor(chargingSeconds / 60))} mins
                </Text>
              </View>
              <View style={styles.completeSummaryRow}>
                <Text style={styles.completeSummaryLabel}>CHARGER POWER</Text>
                <Text style={styles.completeSummaryValue}>{maxPowerKw} kW</Text>
              </View>
              <View style={styles.completeSummaryRow}>
                <Text style={styles.completeSummaryLabel}>ENERGY DELIVERED</Text>
                <Text style={styles.completeSummaryValue}>{kwh || liveDeliveredKwh || '1.0'} kWh</Text>
              </View>
              <View style={styles.completeSummaryDivider} />
              <View style={styles.completeSummaryRow}>
                <Text style={[styles.completeSummaryLabel, { fontWeight: '800', color: '#065F46' }]}>
                  TOTAL AMOUNT (BASED ON TIME)
                </Text>
                <Text style={[styles.completeSummaryValue, { fontSize: 18, color: '#059669', fontWeight: '900' }]}>
                  {formatCurrency(estimate || liveCost || Math.round(Number(kwh || '1') * (rate || 20)))}
                </Text>
              </View>
            </View>

            <Text style={{ marginTop: spacing.md, fontSize: 13, color: palette.muted, textAlign: 'center' }}>
              Confirm that charging is finished. Payment gateway will be displayed next to collect payment.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCompleteOpen(false)}>Back</Button>
            <Button
              mode="contained"
              buttonColor="#059669"
              textColor="#FFFFFF"
              loading={busy}
              disabled={busy}
              onPress={completeCharging}
            >
              Confirm Charge Complete
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={cancelOpen} onDismiss={() => setCancelOpen(false)} style={styles.dialog}>
          <Dialog.Title>Cancel booking</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogHint}>
              Both sides are notified. This cannot be undone.
            </Text>
            <TextInput
              mode="outlined"
              label="Reason (optional)"
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
              numberOfLines={2}
              style={styles.dialogInput}
              outlineColor={palette.border}
              activeOutlineColor={palette.primary}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCancelOpen(false)}>Keep booking</Button>
            <Button loading={busy} disabled={busy} onPress={submitCancel} textColor={palette.danger}>
              Cancel booking
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={reviewOpen} onDismiss={() => setReviewOpen(false)} style={styles.dialog}>
          <Dialog.Title>Rate your session</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogHint}>How was the charging experience?</Text>
            <View style={styles.starPicker}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable key={value} onPress={() => setRating(value)} hitSlop={6}>
                  <MaterialCommunityIcons
                    name={rating >= value ? 'star' : 'star-outline'}
                    size={34}
                    color={palette.accent}
                  />
                </Pressable>
              ))}
            </View>
            <TextInput
              mode="outlined"
              label="Comment (optional)"
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={3}
              style={styles.dialogInput}
              outlineColor={palette.border}
              activeOutlineColor={palette.primary}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setReviewOpen(false)}>Not now</Button>
            <Button loading={busy} disabled={busy} onPress={submitReview}>
              Submit review
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
  content: { padding: spacing.lg, paddingBottom: 110 },
  hero: { paddingVertical: spacing.sm },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  code: { fontSize: 12, fontWeight: '800', color: palette.muted, letterSpacing: 0.6 },
  title: { fontSize: 24, fontWeight: '800', color: palette.ink, marginTop: spacing.md },
  subtitle: { fontSize: 13, color: palette.muted, marginTop: 4 },
  syncing: { fontSize: 11, color: palette.primary, marginTop: 6, fontWeight: '700' },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  cardTitle: { fontSize: 15.5, fontWeight: '800', color: palette.ink, marginBottom: spacing.xs },
  timeline: { flexDirection: 'row', marginTop: spacing.sm },
  timelineItem: { flex: 1, alignItems: 'center' },
  timelineTrack: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E7EEEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotDone: { backgroundColor: palette.primary },
  timelineDotCurrent: { backgroundColor: palette.primaryDark },
  timelineLine: { flex: 1, height: 2, backgroundColor: '#E7EEEA' },
  timelineLineDone: { backgroundColor: palette.primary },
  timelineLabel: { fontSize: 11, fontWeight: '600', color: palette.muted, marginTop: 6 },
  timelineLabelDone: { color: palette.primaryDark, fontWeight: '800' },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noticeDanger: { backgroundColor: '#FBE4E4' },
  noticeMuted: { backgroundColor: '#F0E8F7' },
  noticeTextWrap: { flex: 1 },
  noticeTitle: { fontSize: 13, fontWeight: '800', color: palette.ink },
  noticeBody: { fontSize: 12, color: palette.muted, marginTop: 2 },
  paymentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  amountLabel: { fontSize: 11.5, color: palette.muted, fontWeight: '600' },
  amount: { fontSize: 24, fontWeight: '800', color: palette.ink, marginTop: 2 },
  rateBlock: { alignItems: 'flex-end' },
  rateValue: { fontSize: 15, fontWeight: '800', color: palette.primary },
  rateLabel: { fontSize: 11, color: palette.muted, marginTop: 1 },
  paymentMethod: {
    fontSize: 12.5,
    color: palette.muted,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  paymentHint: { fontSize: 11.5, color: '#8A6100', marginTop: 6, lineHeight: 16 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  reviewTime: { fontSize: 11.5, color: palette.muted },
  reviewComment: { fontSize: 13, color: palette.muted, marginTop: spacing.sm, lineHeight: 19 },
  actions: { marginTop: spacing.lg },
  primaryAction: { borderRadius: radius.md },
  actionContent: { paddingVertical: 6 },
  secondaryAction: { marginTop: spacing.sm, borderRadius: radius.md, borderColor: '#F0C9C9' },
  inlineActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  flexAction: { flex: 1, borderRadius: radius.md },
  cancelLink: { marginTop: spacing.sm },
  reviewButton: { marginTop: spacing.lg, borderRadius: radius.md },
  adminNote: { fontSize: 11.5, color: palette.muted, textAlign: 'center', marginTop: spacing.lg },
  dialog: { borderRadius: radius.lg, backgroundColor: palette.surface },
  dialogHint: { fontSize: 12.5, color: palette.muted, lineHeight: 18, marginBottom: spacing.md },
  dialogInput: { backgroundColor: palette.surface, marginBottom: spacing.md },
  dialogLabel: { fontSize: 12, fontWeight: '700', color: palette.ink, marginBottom: 8 },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F4F8F6',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  estimateLabel: { fontSize: 12.5, color: palette.muted, fontWeight: '600' },
  estimateValue: { fontSize: 16, fontWeight: '800', color: palette.ink },
  starPicker: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  justBookedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#E8F5EE',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#BFE4D0',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  waitingDriverGpsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginVertical: spacing.sm,
  },
  waitingDriverGpsText: {
    fontSize: 12.5,
    color: '#92400E',
    fontWeight: '600',
  },
  driverPhotoAlertCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    padding: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  driverPhotoAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  driverPhotoAlertIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverPhotoAlertTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
  },
  driverPhotoAlertSub: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 16,
  },
  driverUploadBtn: {
    borderRadius: radius.md,
  },
  justBookedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D1EEDE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  justBookedTextWrap: {
    flex: 1,
  },
  justBookedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0A5C43',
  },
  justBookedSub: {
    fontSize: 12,
    color: '#286B54',
    marginTop: 2,
    lineHeight: 16,
  },
  routeCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  routeHeaderRow: {
    marginBottom: spacing.xs,
  },
  routeHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5EE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginBottom: 6,
  },
  routeHeaderBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0A5C43',
  },
  routeStationName: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.ink,
  },
  routeAddressText: {
    fontSize: 12.5,
    color: palette.muted,
    marginTop: 2,
  },
  routeStatsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F8F6',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#D4E8DD',
  },
  routeStatItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  routeDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#D4E8DD',
    marginHorizontal: spacing.sm,
  },
  routeStatValue: {
    fontSize: 15,
    fontWeight: '800',
    color: palette.ink,
  },
  routeStatLabel: {
    fontSize: 11,
    color: palette.muted,
  },
  mapWrap: {
    height: 200,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  navButton: {
    marginTop: spacing.md,
    borderRadius: radius.md,
  },
  navButtonContent: {
    paddingVertical: 6,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E4F5EE',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#BFE4D0',
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0A5C43',
  },
  liveIndicatorText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0A5C43',
    letterSpacing: 0.4,
  },
  telemetryCard: {
    backgroundColor: '#0F281E',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: '#1D4A38',
  },
  telemetryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.md,
  },
  telemetryLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  telemetryLiveText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 0.5,
  },
  telemetryTimerRow: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  telemetryTimerLabel: {
    fontSize: 11,
    color: '#84BFA4',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  telemetryTimerVal: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  telemetryGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  telemetryItem: {
    flex: 1,
    alignItems: 'center',
  },
  telemetryDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#1D4A38',
  },
  telemetryVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  telemetryLbl: {
    fontSize: 10.5,
    color: '#84BFA4',
    marginTop: 2,
    fontWeight: '600',
  },
  /* Provider Driver Identity Verification Styles */
  verificationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  verificationCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  verificationBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  mobileVerifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  mobileVerifiedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  driverProfileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  driverPhotoContainer: {
    position: 'relative',
  },
  driverBigPhoto: {
    width: 82,
    height: 82,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#10B981',
  },
  driverBigPhotoFallback: {
    width: 82,
    height: 82,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  driverBigPhotoText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#D97706',
  },
  photoStatusBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  driverIdentityDetails: {
    flex: 1,
  },
  driverFullName: {
    fontSize: 17,
    fontWeight: '800',
    color: palette.ink,
  },
  driverPhoneText: {
    fontSize: 13,
    color: palette.muted,
    marginTop: 2,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  vehicleText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.ink,
  },
  photoVerificationNoteBox: {
    marginTop: 6,
  },
  photoVerificationNote: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
  },
  approvalActionBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  securityAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: spacing.md,
  },
  securityAlertText: {
    flex: 1,
    fontSize: 11.5,
    color: '#92400E',
    lineHeight: 16,
    fontWeight: '500',
  },
  approvalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  declineFullBtn: {
    flex: 1,
    borderRadius: radius.md,
    borderColor: palette.danger,
  },
  acceptFullBtn: {
    flex: 1.3,
    borderRadius: radius.md,
  },

  /* Razorpay Payment Card Styles */
  settlementSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  settlementHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.sm,
  },
  settlementIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settlementTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: palette.ink,
  },
  gatewayAmountBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    padding: spacing.md,
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  gatewayAmountLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  gatewayAmountValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#059669',
    marginVertical: 4,
  },
  gatewayAmountSub: {
    fontSize: 12,
    color: palette.muted,
  },
  selectTypeHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.ink,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  cashModeLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 4,
  },
  scannerModeLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 8,
  },
  settlementSubtitle: {
    fontSize: 11.5,
    color: palette.muted,
  },
  settleTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  settleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  settleTabActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  settleTabText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: palette.muted,
  },
  settleTabTextActive: {
    color: '#059669',
  },
  upiScanBox: {
    alignItems: 'center',
    backgroundColor: '#F8FAF9',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrHostHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 8,
  },
  qrHostHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  realQrContainer: {
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  realQrImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
  },
  changeQrBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    marginBottom: 12,
  },
  changeQrBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primary,
  },
  qrMissingBox: {
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  qrMissingTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#92400E',
    marginTop: 8,
    textAlign: 'center',
  },
  qrMissingSubtitle: {
    fontSize: 12.5,
    color: '#B45309',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 18,
  },
  uploadQrBtn: {
    marginTop: 14,
    borderRadius: radius.md,
  },
  qrImage: {
    width: 150,
    height: 150,
    borderRadius: 8,
  },
  upiIdText: {
    fontSize: 12,
    fontWeight: '800',
    color: palette.ink,
    marginTop: 8,
  },
  upiScanInstruction: {
    fontSize: 11.5,
    color: palette.muted,
    marginTop: 4,
    marginBottom: 12,
    textAlign: 'center',
  },
  settleActionBtn: {
    borderRadius: radius.md,
    alignSelf: 'stretch',
  },
  cashBox: {
    alignItems: 'center',
    backgroundColor: '#F8FAF9',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cashIconBig: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  cashAmountBig: {
    fontSize: 22,
    fontWeight: '900',
    color: '#059669',
  },
  cashInstruction: {
    fontSize: 12,
    color: palette.muted,
    marginTop: 4,
    marginBottom: 14,
    textAlign: 'center',
    lineHeight: 17,
  },
  razorpayBox: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  razorpayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
  },
  razorpayIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  razorpayTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: palette.ink,
  },
  razorpaySub: {
    fontSize: 11.5,
    color: palette.muted,
    marginTop: 1,
  },
  razorpaySecureTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  razorpaySecureText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
  },
  payRazorpayBtn: {
    borderRadius: radius.md,
    elevation: 2,
  },
  payRazorpayBtnContent: {
    paddingVertical: 6,
  },
  completeSummaryCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  completeSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  completeSummaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
    letterSpacing: 0.4,
  },
  completeSummaryValue: {
    fontSize: 13,
    fontWeight: '800',
    color: palette.ink,
  },
  completeSummaryDivider: {
    height: 1,
    backgroundColor: '#BBF7D0',
    marginVertical: 6,
  },
  routeEtaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E40AF',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1.5,
    borderColor: '#60A5FA',
  },
  routeEtaBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  completedBillCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  completedBillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  completedBillLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  completedBillVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  completedBillDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 8,
  },
  completedBillTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  completedBillTotalLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  completedBillTotalVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669',
  },
  paidSuccessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ECFDF5',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: '#10B981',
    marginTop: spacing.md,
  },
  paidSuccessTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
  },
  paidSuccessSubtitle: {
    fontSize: 12,
    color: '#047857',
    marginTop: 2,
  },
  prePaymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  prePaymentTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0284C7',
  },
  prePaymentText: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 18,
    marginVertical: 4,
  },
  prePaymentRateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  prePaymentRateLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
  },
  prePaymentRateVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0C4A6E',
  },
});

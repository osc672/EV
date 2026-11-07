import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Image, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type MapView from 'react-native-maps';
import AppMapView, { Circle, Marker, Polyline } from '@/components/AppMapView';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';
import { ActivityIndicator, Button, Chip } from 'react-native-paper';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { EmptyState } from '@/components/EmptyState';
import { ProviderCard } from '@/components/ProviderCard';
import { SectionHeader } from '@/components/SectionHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { useBookings, useUpdateBookingStatus } from '@/hooks/useBookings';
import { useCurrentLocation } from '@/hooks/useLocation';
import { useMyProvider, useNearbyProviders, useProvider, useProviderStats, useToggleOpen } from '@/hooks/useProviders';
import { useGlobalRealtimeEvents } from '@/hooks/useRealtime';
import { useAuthStore } from '@/store/auth';
import { CONNECTOR_LABELS, DEFAULT_MAP_REGION, resolveImageUrl } from '@/lib/config';
import { searchApi } from '@/lib/endpoints';
import { formatDateTime } from '@/lib/format';
import { openGoogleMapsRoute, calculateDistanceKm, estimateDrivingMinutes, decodePolyline, fetchDrivingRoute } from '@/lib/maps';
import { palette, radius, spacing } from '@/theme';
import type { Booking, ConnectorType, NearbyProvider } from '@/types/api';

const CONNECTOR_FILTERS: (ConnectorType | 'ALL')[] = [
  'ALL',
  'TYPE_2',
  'CCS2',
  'AC_3_PIN',
  'CHADEMO',
];

const RADIUS_PRESETS = [
  { label: '500m', value: 0.5 },
  { label: '1 km', value: 1.0 },
  { label: '2 km', value: 2.0 },
  { label: '5 km', value: 5.0 },
  { label: '10 km', value: 10.0 },
];

export const DEFAULT_EV_QUICK_SEARCHES = [
  {
    id: 'qs_1',
    title: 'Nearest Verified Fast Charger (CCS2)',
    subtitle: 'High-power DC fast charging points near you',
    icon: 'lightning-bolt',
    iconColor: '#2563EB',
    bgColor: '#EFF6FF',
    action: 'FAST_CCS2',
  },
  {
    id: 'qs_2',
    title: 'Emergency Community & Home Sockets',
    subtitle: 'Local 3-Pin 16A chargers in your immediate area',
    icon: 'home-lightning-bolt',
    iconColor: '#D97706',
    bgColor: '#FEF3C7',
    action: 'HOME_3PIN',
  },
  {
    id: 'qs_3',
    title: 'All Active Charging Stations',
    subtitle: 'Browse all available public & private charging points',
    icon: 'ev-station',
    iconColor: '#059669',
    bgColor: '#ECFDF5',
    action: 'ALL',
  },
];

export const RAPIDO_CATEGORIES = [
  {
    id: 'EMERGENCY',
    label: 'Emergency (2 km)',
    icon: 'lightning-bolt',
    bgColor: '#ECFDF5',
    iconColor: '#059669',
    badge: 'Immediate',
    badgeColor: '#059669',
  },
  {
    id: 'FAST_CCS2',
    label: 'Fast (CCS2)',
    icon: 'car-electric',
    bgColor: '#EFF6FF',
    iconColor: '#2563EB',
    badge: '30-60 kW',
    badgeColor: '#2563EB',
  },
  {
    id: 'TYPE_2',
    label: 'Type 2 AC',
    icon: 'ev-plug-type2',
    bgColor: '#FDF4FF',
    iconColor: '#9333EA',
    badge: 'Standard',
    badgeColor: '#9333EA',
  },
  {
    id: 'HOME_3PIN',
    label: 'Home (3-Pin)',
    icon: 'home-lightning-bolt',
    bgColor: '#FFFBEB',
    iconColor: '#D97706',
    badge: '16A Plug',
    badgeColor: '#D97706',
  },
  {
    id: 'ALL',
    label: 'All Chargers',
    icon: 'view-grid',
    bgColor: '#F3F4F6',
    iconColor: '#4B5563',
    badge: 'Directory',
    badgeColor: '#4B5563',
  },
];

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const isProvider = user?.role === 'PROVIDER';
  const isAdmin = user?.role === 'ADMIN';

  // Admin should never land on the app tab group — _layout.tsx redirects them on sign-in.
  // If somehow they're here, render nothing while the navigation resolves.
  if (isAdmin) {
    return null;
  }

  if (isProvider) {
    return <ProviderStationDashboard />;
  }

  return <DriverHomeScreen />;
}

function DriverHomeScreen() {
  const user = useAuthStore((s) => s.user);
  const {
    coords,
    loading: locating,
    permission,
    error: locationError,
    refresh: refreshLocation,
    requestLocation,
  } = useCurrentLocation();
  const mapRef = useRef<MapView>(null);
  const [connector, setConnector] = useState<ConnectorType | 'ALL'>('ALL');
  const [radiusKm, setRadiusKm] = useState<number>(2.0); // 2 km default search radius (discovers nearby stations e.g. 900m)
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<NearbyProvider | null>(null);
  const [selectedRoutePoints, setSelectedRoutePoints] = useState<{ latitude: number; longitude: number }[]>([]);
  const [selectedRouteEta, setSelectedRouteEta] = useState<{ minutes: number; distanceKm: number } | null>(null);
  const [selectedRouteMidpoint, setSelectedRouteMidpoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentAddressText, setCurrentAddressText] = useState<string>('Locating EV Position...');
  const lastGeocodedKeyRef = useRef<string | null>(null);
  const hasCenteredMapRef = useRef(false);
  // Hardware back press handler on the main home screen
  // Only handles closing the selected provider card — the layout handles double-press exit.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // If a charger detail card is selected/open, back closes the preview card
      if (selectedProvider) {
        setSelectedProvider(null);
        return true;
      }
      // Return false so the layout's BackHandler can run the double-press-to-exit logic
      return false;
    });

    return () => sub.remove();
  }, [selectedProvider]);

  // Automatically reverse geocode GPS coordinates to real street / area name
  useEffect(() => {
    let isMounted = true;
    if (!coords) return;
    const geoKey = `${coords.latitude.toFixed(3)}:${coords.longitude.toFixed(3)}`;
    if (lastGeocodedKeyRef.current === geoKey) return;
    lastGeocodedKeyRef.current = geoKey;

    void Location.reverseGeocodeAsync({
      latitude: coords.latitude,
      longitude: coords.longitude,
    })
      .then((results) => {
        if (!isMounted) return;
        const addr = results?.[0];
        if (addr) {
          const parts = [
            addr.name,
            addr.street,
            addr.district || addr.subregion || addr.city,
          ].filter((p): p is string => Boolean(p && !p.includes('+') && p.length > 1));
          setCurrentAddressText(parts.length > 0 ? parts.join(', ') : 'Current EV Location');
        } else {
          setCurrentAddressText('Current EV Location');
        }
      })
      .catch(() => {
        if (isMounted) setCurrentAddressText('Current EV Location');
      });

    return () => {
      isMounted = false;
    };
  }, [coords?.latitude, coords?.longitude]);

  // Poll driver bookings for active reservations (refreshed every 3s)
  const { data: driverBookings, refetch: refetchDriverBookings } = useBookings({ role: 'driver' });

  useGlobalRealtimeEvents(() => {
    void refetchDriverBookings();
  });

  const activeBooking = useMemo(() => {
    if (!driverBookings?.items) return null;
    return (
      driverBookings.items.find(
        (b) => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS' || b.status === 'PENDING',
      ) ?? null
    );
  }, [driverBookings]);

  // Fetch full provider detail if booking location is not yet populated
  const { data: activeProviderDetail } = useProvider(activeBooking?.providerId);
  const activeStationLocation = activeBooking?.provider?.location ?? activeProviderDetail?.location;
  const activeStationLat = activeStationLocation?.latitude;
  const activeStationLng = activeStationLocation?.longitude;

  // Rapido / Ola category filter state
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  const onSelectCategory = (catId: string) => {
    setActiveCategory(catId);
    if (catId === 'EMERGENCY') {
      setRadiusKm(2.0);
      setConnector('ALL');
    } else if (catId === 'FAST_CCS2') {
      setConnector('CCS2');
      setRadiusKm(5.0);
    } else if (catId === 'TYPE_2') {
      setConnector('TYPE_2');
      setRadiusKm(5.0);
    } else if (catId === 'HOME_3PIN') {
      setConnector('AC_3_PIN');
      setRadiusKm(3.0);
    } else {
      setConnector('ALL');
      setRadiusKm(5.0);
    }
  };

  const onSelectQuickSearch = (action: string) => {
    onSelectCategory(action);
  };

  const activeDistanceKm = useMemo(() => {
    if (coords && activeStationLat && activeStationLng) {
      return calculateDistanceKm(coords.latitude, coords.longitude, activeStationLat, activeStationLng);
    }
    return null;
  }, [coords, activeStationLat, activeStationLng]);

  const activeDrivingMinutes = activeDistanceKm !== null ? estimateDrivingMinutes(activeDistanceKm) : null;

  const driverLatRounded = coords ? Math.round(coords.latitude * 1000) / 1000 : undefined;
  const driverLngRounded = coords ? Math.round(coords.longitude * 1000) / 1000 : undefined;
  const activeStationLatRounded = activeStationLat ? Math.round(activeStationLat * 1000) / 1000 : undefined;
  const activeStationLngRounded = activeStationLng ? Math.round(activeStationLng * 1000) / 1000 : undefined;

  // Query driving route from driver GPS to booked charging station
  const { data: activeRouteData } = useQuery({
    queryKey: [
      'driver-home-route',
      activeBooking?.id,
      driverLatRounded,
      driverLngRounded,
      activeStationLatRounded,
      activeStationLngRounded,
    ],
    queryFn: () =>
      searchApi.route({
        fromLat: driverLatRounded!,
        fromLng: driverLngRounded!,
        toLat: activeStationLatRounded!,
        toLng: activeStationLngRounded!,
      }),
    enabled: Boolean(activeBooking && driverLatRounded && activeStationLatRounded),
    staleTime: 60_000,
  });

  const activeRoutePoints = useMemo(() => {
    if (activeRouteData?.polyline) {
      try {
        const decoded = decodePolyline(activeRouteData.polyline);
        if (decoded.length > 0) return decoded;
      } catch {
        // Fallback to straight line
      }
    }
    if (coords && activeStationLat && activeStationLng) {
      return [
        { latitude: coords.latitude, longitude: coords.longitude },
        { latitude: activeStationLat, longitude: activeStationLng },
      ];
    }
    return [];
  }, [activeRouteData?.polyline, coords, activeStationLat, activeStationLng]);

  const activeMapRegion = useMemo(() => {
    if (!activeStationLat || !activeStationLng) return null;
    if (!coords) {
      return {
        latitude: activeStationLat,
        longitude: activeStationLng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    const midLat = (coords.latitude + activeStationLat) / 2;
    const midLng = (coords.longitude + activeStationLng) / 2;
    const latDelta = Math.max(0.018, Math.abs(coords.latitude - activeStationLat) * 1.6);
    const lngDelta = Math.max(0.018, Math.abs(coords.longitude - activeStationLng) * 1.6);
    return {
      latitude: midLat,
      longitude: midLng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [coords, activeStationLat, activeStationLng]);

  // Automatically center and zoom the map when GPS or active booking route becomes available
  useEffect(() => {
    if (activeMapRegion && mapRef.current) {
      mapRef.current.animateToRegion(activeMapRegion, 600);
      hasCenteredMapRef.current = true;
    } else if (coords && mapRef.current && !hasCenteredMapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        },
        500,
      );
      hasCenteredMapRef.current = true;
    }
  }, [activeMapRegion, coords?.latitude, coords?.longitude]);

  const region = coords
    ? { latitude: coords.latitude, longitude: coords.longitude }
    : {
        latitude: DEFAULT_MAP_REGION.latitude,
        longitude: DEFAULT_MAP_REGION.longitude,
      };

  const regionLatRounded = Math.round(region.latitude * 1000) / 1000;
  const regionLngRounded = Math.round(region.longitude * 1000) / 1000;

  const nearbyParams = useMemo(
    () => ({
      lat: regionLatRounded,
      lng: regionLngRounded,
      radiusKm,
      connector: connector === 'ALL' ? undefined : connector,
      availableOnly: false,
      limit: 30,
    }),
    [regionLatRounded, regionLngRounded, radiusKm, connector],
  );

  const {
    data: providers,
    isLoading,
    isError,
    refetch,
  } = useNearbyProviders(nearbyParams);

  // Automatically select the nearest verified station if none is currently selected
  useEffect(() => {
    if (!selectedProvider && providers && providers.length > 0) {
      setSelectedProvider(providers[0]);
    }
  }, [providers, selectedProvider]);

  // Query actual street driving route from driver GPS to selected station
  useEffect(() => {
    if (!selectedProvider || !coords) {
      setSelectedRoutePoints([]);
      setSelectedRouteEta(null);
      setSelectedRouteMidpoint(null);
      return;
    }

    let isMounted = true;
    void (async () => {
      try {
        const route = await fetchDrivingRoute(
          coords.latitude,
          coords.longitude,
          selectedProvider.location.latitude,
          selectedProvider.location.longitude,
        );
        if (!isMounted) return;
        setSelectedRoutePoints(route.points);
        setSelectedRouteEta({ minutes: route.durationMinutes, distanceKm: route.distanceKm });
        setSelectedRouteMidpoint(route.midpoint);

        // Fit map view to show both points and the street route with padding
        if (mapRef.current && route.points.length > 1 && !activeBooking) {
          mapRef.current.fitToCoordinates(route.points, {
            edgePadding: { top: 60, right: 60, bottom: 80, left: 60 },
            animated: true,
          });
        }
      } catch (err) {
        console.log('[SelectedRoute] Route fetch error:', err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [selectedProvider?.id, driverLatRounded, driverLngRounded, activeBooking]);

  const onEnableLocationPress = async () => {
    const success = await requestLocation(true);
    if (success) {
      void refetch();
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshLocation(), refetch(), refetchDriverBookings()]);
    setRefreshing(false);
  }, [refreshLocation, refetch, refetchDriverBookings]);

  const onSelectProvider = (p: NearbyProvider) => {
    setSelectedProvider(p);
    if (coords && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: (coords.latitude + p.location.latitude) / 2,
          longitude: (coords.longitude + p.location.longitude) / 2,
          latitudeDelta: Math.max(0.04, Math.abs(coords.latitude - p.location.latitude) * 1.8),
          longitudeDelta: Math.max(0.04, Math.abs(coords.longitude - p.location.longitude) * 1.8),
        },
        400,
      );
    }
  };

  const recenter = () => {
    setSelectedProvider(null);
    if (activeMapRegion && mapRef.current) {
      mapRef.current.animateToRegion(activeMapRegion, 400);
    } else if (coords && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        },
        350,
      );
    } else {
      void onEnableLocationPress();
    }
  };

  const firstName = user?.fullName?.split(' ')[0] ?? 'driver';
  const showFallbackBanner = (!coords || permission === 'denied') && Boolean(locationError);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
    >
      {/* TOP LOCATION ADDRESS CAPSULE */}
      <View style={styles.rapidoTopBar}>
        <View style={styles.rapidoAddressCapsule}>
          <MaterialCommunityIcons name="map-marker" size={18} color="#059669" />
          <Text style={styles.rapidoAddressText} numberOfLines={1}>
            {coords ? currentAddressText : 'Locating EV Position...'}
          </Text>
        </View>
      </View>

      {/* LOCATION PERMISSION PROMPT BANNER */}
      {!coords || permission !== 'granted' ? (
        <View style={styles.locationAlertCard}>
          <View style={styles.locationAlertHead}>
            <View style={styles.locationAlertIconWrap}>
              <MaterialCommunityIcons name="crosshairs-gps" size={24} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationAlertTitle}>Enable Device Location</Text>
              <Text style={styles.locationAlertDesc}>
                EVRescue needs your location to discover verified emergency charging points within 500m of your electric vehicle.
              </Text>
            </View>
          </View>
          <Button
            mode="contained"
            icon="crosshairs-gps"
            buttonColor="#059669"
            loading={locating}
            disabled={locating}
            onPress={() => void onEnableLocationPress()}
            style={styles.enableLocationBtn}
            contentStyle={{ height: 42 }}
            labelStyle={{ fontWeight: '800' }}
          >
            {locating ? 'Turning On Location...' : 'Enable Location'}
          </Button>
        </View>
      ) : null}

      {/* OLA & RAPIDO STYLE MAP CANVAS */}
      <View style={styles.rapidoMapCard}>
        <AppMapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            ...region,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          }}
          showsUserLocation={false}
          showsMyLocationButton={false}
          toolbarEnabled={false}
        >
          {/* User Location Radar Pulse & Center Dot */}
          {coords ? (
            <>
              <Circle
                center={{ latitude: coords.latitude, longitude: coords.longitude }}
                radius={400}
                fillColor="rgba(2, 132, 199, 0.12)"
                strokeColor="rgba(2, 132, 199, 0.45)"
                strokeWidth={1.5}
              />
              <Marker
                coordinate={{
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                }}
                title="Your Location"
                description="Current EV position"
                tracksViewChanges={false}
              >
                <View style={styles.userLocationMarker}>
                  <View style={styles.userLocationInnerDot} />
                </View>
              </Marker>
            </>
          ) : null}

          {/* Active Booking Destination Marker */}
          {activeBooking && activeStationLat && activeStationLng ? (
            <Marker
              key={`active-${activeBooking.id}`}
              coordinate={{
                latitude: activeStationLat,
                longitude: activeStationLng,
              }}
              title={activeBooking.provider?.businessName ?? 'Booked Charging Station'}
              description={`${activeBooking.provider?.addressLine ?? ''} · Slot Booked`}
              pinColor="#059669"
              onCalloutPress={() => router.push(`/booking/${activeBooking.id}`)}
              tracksViewChanges={false}
            />
          ) : null}

          {/* Active Driving Route Polyline from User to Booked Station */}
          {activeBooking && activeRoutePoints.length > 1 ? (
            <>
              <Polyline
                coordinates={activeRoutePoints}
                strokeWidth={7.5}
                strokeColor="#1E40AF"
                lineCap="round"
                lineJoin="round"
              />
              <Polyline
                coordinates={activeRoutePoints}
                strokeWidth={4.5}
                strokeColor="#00C0FF"
                lineCap="round"
                lineJoin="round"
              />
              {activeDrivingMinutes ? (
                <Marker
                  coordinate={activeRoutePoints[Math.floor(activeRoutePoints.length / 2)]}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                >
                  <View style={styles.routeEtaBadge}>
                    <Text style={styles.routeEtaBadgeText}>{activeDrivingMinutes} min</Text>
                    <MaterialCommunityIcons name="leaf" size={13} color="#86EFAC" />
                  </View>
                </Marker>
              ) : null}
            </>
          ) : null}

          {/* Nearby Station Markers rendered like Rapido / Ola Cabs & Stations on Road */}
          {(providers ?? [])
            .filter((p) => !activeBooking || p.id !== activeBooking.providerId)
            .map((provider) => {
              const isSelected = selectedProvider?.id === provider.id;
              const isTopPreference = provider.subscriptionPlan === 'YEAR_1' || provider.planPriority === 3;
              const isHighPriority = provider.subscriptionPlan === 'MONTH_5' || provider.planPriority === 2;

              const distKm =
                provider.location.distanceKm !== undefined
                  ? provider.location.distanceKm
                  : coords
                  ? calculateDistanceKm(
                      coords.latitude,
                      coords.longitude,
                      provider.location.latitude,
                      provider.location.longitude,
                    )
                  : null;

              const distLabel =
                distKm !== null
                  ? distKm < 1
                    ? `${Math.round(distKm * 1000)}m`
                    : `${distKm.toFixed(1)}km`
                  : `${provider.maxPowerKw}kW`;

              return (
                <Marker
                  key={provider.id}
                  coordinate={{
                    latitude: provider.location.latitude,
                    longitude: provider.location.longitude,
                  }}
                  title={provider.businessName}
                  description={`${provider.city} · ${distLabel} · ${provider.maxPowerKw} kW`}
                  onPress={() => onSelectProvider(provider)}
                  onCalloutPress={() => router.push(`/provider/${provider.id}`)}
                  tracksViewChanges={false}
                >
                  <View
                    style={[
                      styles.rapidoStationPin,
                      isSelected && styles.rapidoStationPinActive,
                      isTopPreference && styles.rapidoStationPinGold,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={isTopPreference ? 'star' : 'ev-station'}
                      size={13}
                      color={isTopPreference ? '#D97706' : isHighPriority ? '#059669' : '#0284C7'}
                    />
                    <Text style={styles.rapidoStationPinText}>
                      {isSelected ? `${distLabel} · ${provider.maxPowerKw}kW` : distLabel}
                    </Text>
                  </View>
                </Marker>
              );
            })}

          {/* Selected Station Street Driving Route (Following roads/streets as in Image 2) */}
          {!activeBooking && selectedProvider && (selectedRoutePoints.length > 1 || coords) ? (
            <>
              <Polyline
                coordinates={
                  selectedRoutePoints.length > 1
                    ? selectedRoutePoints
                    : [
                        { latitude: coords!.latitude, longitude: coords!.longitude },
                        {
                          latitude: selectedProvider.location.latitude,
                          longitude: selectedProvider.location.longitude,
                        },
                      ]
                }
                strokeWidth={7.5}
                strokeColor="#1E40AF"
                lineCap="round"
                lineJoin="round"
              />
              <Polyline
                coordinates={
                  selectedRoutePoints.length > 1
                    ? selectedRoutePoints
                    : [
                        { latitude: coords!.latitude, longitude: coords!.longitude },
                        {
                          latitude: selectedProvider.location.latitude,
                          longitude: selectedProvider.location.longitude,
                        },
                      ]
                }
                strokeWidth={4.5}
                strokeColor="#00C0FF"
                lineCap="round"
                lineJoin="round"
              />

              {/* ETA Bubble on the Route (like '7 min 🍃' in Image 2) */}
              {selectedRouteMidpoint && selectedRouteEta ? (
                <Marker
                  coordinate={selectedRouteMidpoint}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                >
                  <View style={styles.routeEtaBadge}>
                    <Text style={styles.routeEtaBadgeText}>
                      {selectedRouteEta.minutes} min
                    </Text>
                    <MaterialCommunityIcons name="leaf" size={13} color="#86EFAC" />
                  </View>
                </Marker>
              ) : null}
            </>
          ) : null}
        </AppMapView>

        <View style={styles.mapOverlayTop}>
          {activeBooking ? (
            <View style={[styles.countPill, styles.activeRoutePill]}>
              <MaterialCommunityIcons name="navigation-variant" size={14} color="#FFFFFF" />
              <Text style={styles.activeRoutePillText}>
                Route to {activeBooking.provider?.businessName ?? 'Booked Station'}
              </Text>
            </View>
          ) : (
            <View style={styles.countPill}>
              <MaterialCommunityIcons name="ev-station" size={14} color={palette.primary} />
              <Text style={styles.countText}>
                {providers?.length ?? 0} charger{(providers?.length ?? 0) === 1 ? '' : 's'} nearby
              </Text>
            </View>
          )}
        </View>

        <Pressable style={styles.rapidoRecenterBtn} onPress={recenter} hitSlop={6}>
          <MaterialCommunityIcons name="crosshairs-gps" size={22} color="#059669" />
        </Pressable>
      </View>

      {/* OLA / RAPIDO BOTTOM SHEET SECTION */}
      <View style={styles.rapidoSheetCard}>
        {/* Large "Enter Destination" Search Bar (Ola/Rapido style with green border) */}
        <Pressable
          style={styles.rapidoSearchPill}
          onPress={() => router.push('/(app)/search')}
        >
          <MaterialCommunityIcons name="magnify" size={24} color="#059669" />
          <Text style={styles.rapidoSearchPlaceholder}>Enter Destination</Text>
        </Pressable>

        {/* Nearby Charging Stations List (replaces dummy taxi destinations) */}
        <View style={styles.rapidoRecentList}>
          {providers && providers.length > 0 ? (
            providers.slice(0, 3).map((station, idx) => {
              const distText =
                station.location.distanceKm !== undefined
                  ? station.location.distanceKm < 1
                    ? `${Math.round(station.location.distanceKm * 1000)}m away`
                    : `${station.location.distanceKm.toFixed(1)} km away`
                  : 'Nearby';
              const isTop = station.subscriptionPlan === 'YEAR_1' || station.planPriority === 3;
              const isSelected = selectedProvider?.id === station.id;

              return (
                <Pressable
                  key={station.id}
                  style={[
                    styles.rapidoRecentRow,
                    idx < Math.min(providers.length, 3) - 1 && styles.rapidoRecentRowBorder,
                    isSelected && { backgroundColor: '#F0FDF4' },
                  ]}
                  onPress={() => onSelectProvider(station)}
                >
                  <View
                    style={[
                      styles.rapidoClockIconBox,
                      { backgroundColor: isTop ? '#FEF3C7' : '#ECFDF5' },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={isTop ? 'star' : 'ev-station'}
                      size={20}
                      color={isTop ? '#D97706' : '#059669'}
                    />
                  </View>
                  <View style={styles.rapidoRecentTextWrap}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.rapidoRecentTitle} numberOfLines={1}>
                        {station.businessName}
                      </Text>
                      {isTop ? (
                        <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#B45309' }}>1st Pref ⭐</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.rapidoRecentSubtitle} numberOfLines={1}>
                      {distText} · {station.maxPowerKw} kW · {station.pricePerKwh ? `₹${station.pricePerKwh}/kWh` : 'Free'}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
                </Pressable>
              );
            })
          ) : (
            DEFAULT_EV_QUICK_SEARCHES.map((item, idx) => (
              <Pressable
                key={item.id}
                style={[
                  styles.rapidoRecentRow,
                  idx < DEFAULT_EV_QUICK_SEARCHES.length - 1 && styles.rapidoRecentRowBorder,
                ]}
                onPress={() => onSelectQuickSearch(item.action)}
              >
                <View style={[styles.rapidoClockIconBox, { backgroundColor: item.bgColor }]}>
                  <MaterialCommunityIcons name={item.icon as any} size={20} color={item.iconColor} />
                </View>
                <View style={styles.rapidoRecentTextWrap}>
                  <Text style={styles.rapidoRecentTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.rapidoRecentSubtitle} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
              </Pressable>
            ))
          )}
        </View>

        {/* Category Quick-Select Cards (Like Ola/Rapido Ride Types: Outstation, Rentals, Bike) */}
        <View style={styles.rapidoCategoriesWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rapidoCategoriesScroll}
          >
            {RAPIDO_CATEGORIES.map((cat) => {
              const isCatActive = activeCategory === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => onSelectCategory(cat.id)}
                  style={[
                    styles.rapidoCategoryCard,
                    isCatActive && styles.rapidoCategoryCardActive,
                  ]}
                >
                  <View style={[styles.rapidoCategoryIconCircle, { backgroundColor: cat.bgColor }]}>
                    <MaterialCommunityIcons name={cat.icon as any} size={22} color={cat.iconColor} />
                  </View>
                  <Text
                    style={[
                      styles.rapidoCategoryLabel,
                      isCatActive && styles.rapidoCategoryLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {cat.label}
                  </Text>
                  <View style={[styles.rapidoCategoryBadge, { backgroundColor: cat.badgeColor }]}>
                    <Text style={styles.rapidoCategoryBadgeText}>{cat.badge}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* ACTIVE BOOKING CARD */}
      {activeBooking ? (
        <View style={styles.activeBookingCard}>
          <View style={styles.activeCardHeader}>
            <View style={styles.activeHeaderBadgeRow}>
              <View
                style={[
                  styles.activeStatusBadge,
                  activeBooking.status === 'CONFIRMED'
                    ? styles.statusBadgeConfirmed
                    : activeBooking.status === 'IN_PROGRESS'
                    ? styles.statusBadgeCharging
                    : styles.statusBadgePending,
                ]}
              >
                <MaterialCommunityIcons
                  name={
                    activeBooking.status === 'CONFIRMED'
                      ? 'check-circle'
                      : activeBooking.status === 'IN_PROGRESS'
                      ? 'lightning-bolt-circle'
                      : 'clock-outline'
                  }
                  size={13}
                  color="#FFFFFF"
                />
                <Text style={styles.activeStatusText}>
                  {activeBooking.status === 'CONFIRMED'
                    ? 'SLOT CONFIRMED'
                    : activeBooking.status === 'IN_PROGRESS'
                    ? 'CHARGING IN PROGRESS'
                    : 'AWAITING CONFIRMATION'}
                </Text>
              </View>
              <Text style={styles.activeBookingCode}>#{activeBooking.code || activeBooking.id.slice(0, 8)}</Text>
            </View>

            <Text style={styles.activeStationTitle}>
              {activeBooking.provider?.businessName ?? 'Booked Charging Station'}
            </Text>
            <Text style={styles.activeStationAddress}>
              {activeBooking.provider?.addressLine ? `${activeBooking.provider.addressLine}, ` : ''}
              {activeBooking.provider?.city ?? ''}
            </Text>
            <Text style={styles.activeSlotTime}>
              Slot: {formatDateTime(activeBooking.scheduledAt)}
            </Text>
          </View>

          <View style={styles.activeMetricsBox}>
            <View style={styles.activeMetricItem}>
              <MaterialCommunityIcons name="map-marker-distance" size={18} color="#059669" />
              <Text style={styles.activeMetricValue}>
                {activeDistanceKm !== null ? `${activeDistanceKm.toFixed(1)} km` : '--'}
              </Text>
              <Text style={styles.activeMetricLabel}>Distance</Text>
            </View>

            <View style={styles.activeMetricDivider} />

            <View style={styles.activeMetricItem}>
              <MaterialCommunityIcons name="clock-fast" size={18} color="#D97706" />
              <Text style={styles.activeMetricValue}>
                {activeDrivingMinutes !== null ? `~${activeDrivingMinutes} min` : '--'}
              </Text>
              <Text style={styles.activeMetricLabel}>Drive time</Text>
            </View>

            <View style={styles.activeMetricDivider} />

            <View style={styles.activeMetricItem}>
              <MaterialCommunityIcons name="ev-plug-type2" size={18} color="#2563EB" />
              <Text style={styles.activeMetricValue}>
                {CONNECTOR_LABELS[activeBooking.connectorType] ?? activeBooking.connectorType}
              </Text>
              <Text style={styles.activeMetricLabel}>Connector</Text>
            </View>
          </View>

          <View style={styles.activeActionRow}>
            {activeStationLat && activeStationLng ? (
              <Button
                mode="contained"
                icon="google-maps"
                buttonColor="#1A73E8"
                textColor="#FFFFFF"
                style={styles.activeGoogleMapsBtn}
                contentStyle={styles.btnContent}
                onPress={() =>
                  openGoogleMapsRoute(
                    activeStationLat,
                    activeStationLng,
                    activeBooking.provider?.businessName ?? 'Charging Station',
                    coords?.latitude,
                    coords?.longitude,
                  )
                }
              >
                Google Maps
              </Button>
            ) : null}
            <Button
              mode="contained"
              icon="arrow-right"
              buttonColor="#059669"
              textColor="#FFFFFF"
              style={styles.activeDetailBtn}
              contentStyle={styles.btnContent}
              onPress={() => router.push(`/booking/${activeBooking.id}`)}
            >
              View Booking
            </Button>
          </View>
        </View>
      ) : selectedProvider ? (
        <View style={styles.selectedCard}>
          <View style={styles.selectedHeader}>
            <View style={styles.selectedHeaderLeft}>
              <View style={styles.selectedBadge}>
                <MaterialCommunityIcons name="lightning-bolt" size={12} color="#0A5C43" />
                <Text style={styles.selectedBadgeText}>Selected Charging Point</Text>
              </View>
              <Text style={styles.selectedTitle}>{selectedProvider.businessName}</Text>
              <Text style={styles.selectedMeta}>
                {selectedProvider.city} · {selectedProvider.maxPowerKw} kW ·{' '}
                {selectedProvider.pricePerKwh ? `₹${selectedProvider.pricePerKwh}/kWh` : 'Free'}
              </Text>
            </View>
            <Pressable
              onPress={() => setSelectedProvider(null)}
              style={styles.closeButton}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="close" size={18} color={palette.muted} />
            </Pressable>
          </View>

          <View style={styles.routePillRow}>
            <View style={styles.routeMetricPill}>
              <MaterialCommunityIcons name="map-marker-distance" size={15} color={palette.primary} />
              <Text style={styles.routeMetricText}>
                {selectedProvider.location.distanceKm !== undefined
                  ? `${selectedProvider.location.distanceKm} km away`
                  : coords
                  ? `${calculateDistanceKm(
                      coords.latitude,
                      coords.longitude,
                      selectedProvider.location.latitude,
                      selectedProvider.location.longitude,
                    )} km away`
                  : 'Near you'}
              </Text>
            </View>

            <View style={styles.routeMetricPill}>
              <MaterialCommunityIcons name="clock-fast" size={15} color={palette.accent} />
              <Text style={styles.routeMetricText}>
                ~
                {estimateDrivingMinutes(
                  selectedProvider.location.distanceKm ??
                    (coords
                      ? calculateDistanceKm(
                          coords.latitude,
                          coords.longitude,
                          selectedProvider.location.latitude,
                          selectedProvider.location.longitude,
                        )
                      : 5),
                )}{' '}
                min drive
              </Text>
            </View>
          </View>

          <View style={styles.selectedActionRow}>
            <Button
              mode="contained"
              icon="google-maps"
              buttonColor="#1A73E8"
              textColor="#FFFFFF"
              style={styles.googleMapsBtn}
              contentStyle={styles.btnContent}
              onPress={() =>
                openGoogleMapsRoute(
                  selectedProvider.location.latitude,
                  selectedProvider.location.longitude,
                  selectedProvider.businessName,
                  coords?.latitude,
                  coords?.longitude,
                )
              }
            >
              Google Maps
            </Button>
            <Button
              mode="contained"
              icon="arrow-right"
              style={styles.detailBtn}
              contentStyle={styles.btnContent}
              onPress={() => router.push(`/provider/${selectedProvider.id}`)}
            >
              Details & Book
            </Button>
          </View>
        </View>
      ) : null}

      {showFallbackBanner ? (
        <View style={styles.banner}>
          <MaterialCommunityIcons name="map-marker-alert-outline" size={18} color="#8A6100" />
          <View style={styles.bannerTextWrap}>
            <Text style={styles.bannerTitle}>Showing the default area</Text>
            <Text style={styles.bannerText}>{locationError ?? 'Location services are disabled.'}</Text>
          </View>
          <Pressable onPress={() => void onEnableLocationPress()} hitSlop={6}>
            <Text style={styles.bannerAction}>Turn On</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {CONNECTOR_FILTERS.map((value) => {
          const active = connector === value;
          return (
            <Chip
              key={value}
              selected={active}
              onPress={() => setConnector(value)}
              style={[styles.filterChip, active && styles.filterChipActive]}
              textStyle={[styles.filterText, active && styles.filterTextActive]}
              showSelectedOverlay={false}
            >
              {value === 'ALL' ? 'All chargers' : CONNECTOR_LABELS[value]}
            </Chip>
          );
        })}
      </ScrollView>

      {/* Search Radius Selector (500m default) */}
      <View style={styles.radiusBar}>
        <View style={styles.radiusHeader}>
          <MaterialCommunityIcons name="radar" size={16} color={palette.primary} />
          <Text style={styles.radiusLabel}>Search Radius:</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.radiusRow}>
          {RADIUS_PRESETS.map((preset) => {
            const active = radiusKm === preset.value;
            return (
              <Pressable
                key={preset.value}
                onPress={() => setRadiusKm(preset.value)}
                style={[styles.radiusChip, active && styles.radiusChipActive]}
              >
                <Text style={[styles.radiusChipText, active && styles.radiusChipTextActive]}>
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title={`Chargers near you (${radiusKm < 1 ? '500m' : `${radiusKm} km`})`}
          subtitle={coords ? `Showing verified points within ${radiusKm < 1 ? '500m' : `${radiusKm} km`}` : 'Sorted by distance'}
          actionLabel="See all"
          onAction={() => router.push('/(app)/search')}
        />

        {(isLoading || locating) && (!providers || providers.length === 0) ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>Locating verified chargers…</Text>
          </View>
        ) : isError ? (
          <EmptyState
            icon="wifi-off"
            title="Could not load chargers"
            message="Check that the EV Rescue API is running and reachable from this device."
            actionLabel="Try again"
            onAction={() => void refetch()}
          />
        ) : providers && providers.length > 0 ? (
          providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onPress={() => router.push(`/provider/${provider.id}`)}
            />
          ))
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <MaterialCommunityIcons name="radar" size={32} color={palette.primary} />
            </View>
            <Text style={styles.emptyTitle}>
              No Chargers Found Within {radiusKm < 1 ? '500 Metres' : `${radiusKm} km`}
            </Text>
            <Text style={styles.emptySubtitle}>
              No eligible charging points were found in this immediate area. Expand your search radius:
            </Text>
            <View style={styles.expandRow}>
              {RADIUS_PRESETS.filter((r) => r.value > radiusKm).map((r) => (
                <Button
                  key={r.value}
                  mode="contained-tonal"
                  icon="arrow-expand-all"
                  onPress={() => setRadiusKm(r.value)}
                  style={styles.expandBtn}
                  buttonColor="#ECFDF5"
                  textColor="#065F46"
                >
                  Expand to {r.label}
                </Button>
              ))}
            </View>
            <Button
              mode="text"
              icon="plus-circle-outline"
              onPress={() => router.push('/provider-setup')}
              style={{ marginTop: 12 }}
            >
              Or list a new charging point here
            </Button>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function ProviderActiveChargingCard({
  booking,
  maxPowerKw,
  pricePerKwh,
}: {
  booking: Booking;
  maxPowerKw: number;
  pricePerKwh: number;
}) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const startTime = booking.startedAt ? new Date(booking.startedAt).getTime() : Date.now();
    const update = () => {
      setSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [booking.startedAt]);

  const hours = seconds > 0 ? seconds / 3600 : 0;
  const kwh = Math.round(hours * maxPowerKw * 100) / 100;
  const amount = Math.max(20, Math.round(kwh * (pricePerKwh || 20) * 100) / 100);

  const formattedTime = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(
    Math.floor((seconds % 3600) / 60),
  ).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <View style={providerStyles.liveSessionCard}>
      <View style={providerStyles.liveSessionHead}>
        <View style={providerStyles.pulseCircle}>
          <MaterialCommunityIcons name="flash" size={20} color="#059669" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={providerStyles.liveSessionTitle}>Charging Session Active</Text>
          <Text style={providerStyles.liveSessionSub}>
            {booking.driver?.fullName ?? 'EV Driver'} · {booking.vehicle?.model ?? 'Electric Car'}
          </Text>
        </View>
        <View style={providerStyles.livePulseTag}>
          <View style={providerStyles.livePulseDotGreen} />
          <Text style={providerStyles.livePulseTagText}>Live</Text>
        </View>
      </View>

      <View style={providerStyles.liveTimerBox}>
        <Text style={providerStyles.liveTimerLabel}>DURATION</Text>
        <Text style={providerStyles.liveTimerDisplay}>{formattedTime}</Text>
      </View>

      <View style={providerStyles.liveMetricsGrid}>
        <View style={providerStyles.liveMetricCol}>
          <Text style={providerStyles.liveMetricVal}>{maxPowerKw} kW</Text>
          <Text style={providerStyles.liveMetricLbl}>Power Output</Text>
        </View>
        <View style={providerStyles.liveMetricDivider} />
        <View style={providerStyles.liveMetricCol}>
          <Text style={providerStyles.liveMetricVal}>{kwh} kWh</Text>
          <Text style={providerStyles.liveMetricLbl}>Delivered</Text>
        </View>
        <View style={providerStyles.liveMetricDivider} />
        <View style={providerStyles.liveMetricCol}>
          <Text style={[providerStyles.liveMetricVal, { color: '#059669' }]}>₹{amount}</Text>
          <Text style={providerStyles.liveMetricLbl}>Amount Due</Text>
        </View>
      </View>

      <Button
        mode="contained"
        buttonColor="#059669"
        icon="check-circle"
        onPress={() => router.push(`/booking/${booking.id}`)}
        style={providerStyles.finishChargingBtn}
        labelStyle={{ fontWeight: '800' }}
      >
        Finish Charging · View Bill & Collect (₹{amount})
      </Button>
    </View>
  );
}

function ProviderStationDashboard() {
  const { data: provider, isLoading, refetch: refetchProvider } = useMyProvider();
  const { data: stats, refetch: refetchStats } = useProviderStats();
  const { data: bookings, refetch: refetchBookings, isRefetching } = useBookings({ role: 'provider' });
  const toggleOpen = useToggleOpen();
  const updateStatus = useUpdateBookingStatus();
  const [toggling, setToggling] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  // No BackHandler here — the tab layout's centralised handler manages back for all tabs.

  useGlobalRealtimeEvents(() => {
    void refetchBookings();
    void refetchStats();
  });

  const onRefresh = async () => {
    await Promise.all([refetchProvider(), refetchStats(), refetchBookings()]);
  };

  const handleToggleOpen = async () => {
    if (!provider) return;
    setToggling(true);
    try {
      await toggleOpen.mutateAsync(!provider.isOpenNow);
    } catch {
      Alert.alert('Status Error', 'Could not update station availability.');
    } finally {
      setToggling(false);
    }
  };

  const acceptBooking = async (id: string) => {
    setActionId(id);
    try {
      await updateStatus.mutateAsync({ id, body: { status: 'CONFIRMED' } });
      Alert.alert('Booking Confirmed', 'The driver has been notified that your charger is ready.');
      void refetchBookings();
    } catch {
      Alert.alert('Error', 'Could not confirm booking.');
    } finally {
      setActionId(null);
    }
  };

  const startChargingBooking = (id: string, driverName: string) => {
    Alert.alert(
      'Start Charging ⚡',
      `Has ${driverName} arrived at your charging point? Plug in the charger and start the session now.`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Start Charging Now',
          onPress: async () => {
            setActionId(id);
            try {
              await updateStatus.mutateAsync({ id, body: { status: 'IN_PROGRESS' } });
              Alert.alert(
                'Charging Started ⚡',
                'Session timer is now running. Total bill will be calculated automatically based on charging duration when completed.',
              );
              void refetchBookings();
            } catch {
              Alert.alert('Error', 'Could not start charging session.');
            } finally {
              setActionId(null);
            }
          },
        },
      ],
    );
  };

  const declineBooking = (id: string, name: string) => {
    Alert.alert('Decline Request', `Decline charging request from ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          setActionId(id);
          try {
            await updateStatus.mutateAsync({ id, body: { status: 'CANCELLED' } });
            void refetchBookings();
          } catch {
            Alert.alert('Error', 'Could not decline booking.');
          } finally {
            setActionId(null);
          }
        },
      },
    ]);
  };

  if (isLoading && !provider) {
    return (
      <View style={providerStyles.centerContainer}>
        <ActivityIndicator color="#D97706" size="large" />
        <Text style={providerStyles.loadingText}>Loading station command center...</Text>
      </View>
    );
  }

  if (!provider) {
    return (
      <ScrollView contentContainerStyle={providerStyles.noStationContent}>
        <View style={providerStyles.noStationCard}>
          <View style={providerStyles.noStationIconWrap}>
            <MaterialCommunityIcons name="ev-station" size={48} color="#D97706" />
          </View>
          <Text style={providerStyles.noStationTitle}>Set Up Your Charging Station</Text>
          <Text style={providerStyles.noStationSub}>
            You are signed in as a Charger Provider. List your home, shop or commercial charging point to start receiving driver emergency charging requests.
          </Text>
          <Button
            mode="contained"
            buttonColor="#D97706"
            icon="plus-circle"
            onPress={() => router.push('/provider-setup')}
            style={providerStyles.setupBtn}
          >
            Create Station Listing
          </Button>
        </View>
      </ScrollView>
    );
  }

  const pendingBookings = (bookings?.items ?? []).filter((b) => b.status === 'PENDING');
  const confirmedBookings = (bookings?.items ?? []).filter((b) => b.status === 'CONFIRMED');
  const activeBookings = (bookings?.items ?? []).filter((b) => b.status === 'IN_PROGRESS');
  const recentBookings = (bookings?.items ?? []).slice(0, 5);

  const stationCoords = {
    latitude: provider.location?.latitude ?? 18.5204,
    longitude: provider.location?.longitude ?? 73.8567,
  };

  return (
    <ScrollView
      style={providerStyles.flex}
      contentContainerStyle={providerStyles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => void onRefresh()} tintColor="#D97706" />
      }
    >
      {/* Station Command Header */}
      <View style={providerStyles.headerCard}>
        <View style={providerStyles.headerTop}>
          <View style={providerStyles.stationBadge}>
            <MaterialCommunityIcons name="shield-check" size={13} color="#D97706" />
            <Text style={providerStyles.stationBadgeText}>VERIFIED CHARGER HOST</Text>
          </View>
          <Pressable
            onPress={() => router.push('/provider-dashboard')}
            style={providerStyles.editIconBtn}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="cog-outline" size={18} color={palette.muted} />
          </Pressable>
        </View>

        <Text style={providerStyles.stationName}>{provider.businessName}</Text>
        <Text style={providerStyles.stationAddress}>
          {provider.addressLine}, {provider.city} · {provider.maxPowerKw} kW Ultra-Fast
        </Text>

        {/* Live Status Toggle Pill */}
        <Pressable
          onPress={handleToggleOpen}
          disabled={toggling}
          style={[
            providerStyles.statusToggleCard,
            provider.isOpenNow ? providerStyles.statusToggleOnline : providerStyles.statusToggleOffline,
          ]}
        >
          <View style={providerStyles.statusToggleLeft}>
            <View
              style={[
                providerStyles.statusPulseDot,
                { backgroundColor: provider.isOpenNow ? '#10B981' : '#EF4444' },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  providerStyles.statusToggleTitle,
                  { color: provider.isOpenNow ? '#065F46' : '#991B1B' },
                ]}
              >
                {provider.isOpenNow ? 'STATION IS ONLINE' : 'STATION IS OFFLINE'}
              </Text>
              <Text style={providerStyles.statusToggleSub}>
                {provider.isOpenNow
                  ? 'Accepting incoming emergency driver requests'
                  : 'Charger is unavailable. Tap to go online'}
              </Text>
            </View>
          </View>

          <Button
            mode="contained"
            buttonColor={provider.isOpenNow ? '#059669' : '#DC2626'}
            loading={toggling}
            disabled={toggling}
            style={providerStyles.toggleActionBtn}
            labelStyle={providerStyles.toggleActionBtnLabel}
          >
            {provider.isOpenNow ? 'Go Offline' : 'Go Online'}
          </Button>
        </Pressable>
      </View>

      {/* Subscription & Visibility Plan Card */}
      <View style={providerStyles.subscriptionCard}>
        <View style={providerStyles.subscriptionCardHeader}>
          <View
            style={[
              providerStyles.subscriptionBadgeWrap,
              provider.subscriptionPlan === 'YEAR_1'
                ? providerStyles.subscriptionBadgeGold
                : provider.subscriptionPlan === 'MONTH_5'
                ? providerStyles.subscriptionBadgeGreen
                : providerStyles.subscriptionBadgeBlue,
            ]}
          >
            <MaterialCommunityIcons
              name={
                provider.subscriptionPlan === 'YEAR_1'
                  ? 'crown'
                  : provider.subscriptionPlan === 'MONTH_5'
                  ? 'lightning-bolt'
                  : 'shield-star'
              }
              size={13}
              color={
                provider.subscriptionPlan === 'YEAR_1'
                  ? '#B45309'
                  : provider.subscriptionPlan === 'MONTH_5'
                  ? '#047857'
                  : '#0369A1'
              }
            />
            <Text
              style={[
                providerStyles.subscriptionBadgeText,
                {
                  color:
                    provider.subscriptionPlan === 'YEAR_1'
                      ? '#B45309'
                      : provider.subscriptionPlan === 'MONTH_5'
                      ? '#047857'
                      : '#0369A1',
                },
              ]}
            >
              {provider.subscriptionPlan === 'YEAR_1'
                ? '1 YEAR PLAN (1ST PREFERENCE ⭐)'
                : provider.subscriptionPlan === 'MONTH_5'
                ? '5 MONTHS PLAN (HIGH PRIORITY ⚡)'
                : provider.subscriptionPlan === 'MONTH_1'
                ? '1 MONTH PLAN (ACTIVE)'
                : 'FREE PLAN (UPGRADE FOR VISIBILITY)'}
            </Text>
          </View>
          <Pressable onPress={() => router.push({ pathname: '/provider-setup', params: { changePlan: 'true' } })}>
            <Text style={providerStyles.upgradePlanAction}>
              {provider.subscriptionPlan ? 'Change Plan' : 'Buy Plan'}
            </Text>
          </Pressable>
        </View>

        <Text style={providerStyles.subscriptionTitle}>
          {provider.subscriptionPlan === 'YEAR_1'
            ? '1 Year Premium Host Membership'
            : provider.subscriptionPlan === 'MONTH_5'
            ? '5 Months High-Visibility Plan'
            : provider.subscriptionPlan === 'MONTH_1'
            ? '1 Month Starter Plan'
            : 'Get Discovered by EV Drivers Nearby'}
        </Text>

        <View style={providerStyles.subscriptionMetricsRow}>
          <View style={providerStyles.subscriptionMetric}>
            <Text style={providerStyles.subscriptionMetricLabel}>VISIBILITY RADIUS</Text>
            <Text style={providerStyles.subscriptionMetricVal}>
              {provider.subscriptionPlan === 'YEAR_1'
                ? '100m – 10 km'
                : provider.subscriptionPlan === 'MONTH_5'
                ? '100m – 5 km'
                : provider.subscriptionPlan === 'MONTH_1'
                ? '500m – 2 km'
                : '500m default'}
            </Text>
          </View>
          <View style={providerStyles.subscriptionMetricDivider} />
          <View style={providerStyles.subscriptionMetric}>
            <Text style={providerStyles.subscriptionMetricLabel}>USER PREFERENCE</Text>
            <Text
              style={[
                providerStyles.subscriptionMetricVal,
                {
                  color:
                    provider.subscriptionPlan === 'YEAR_1'
                      ? '#D97706'
                      : provider.subscriptionPlan === 'MONTH_5'
                      ? '#059669'
                      : '#0284C7',
                },
              ]}
            >
              {provider.subscriptionPlan === 'YEAR_1'
                ? '1st Preference'
                : provider.subscriptionPlan === 'MONTH_5'
                ? 'High Priority'
                : 'Standard'}
            </Text>
          </View>
          <View style={providerStyles.subscriptionMetricDivider} />
          <View style={providerStyles.subscriptionMetric}>
            <Text style={providerStyles.subscriptionMetricLabel}>STATUS</Text>
            <Text style={[providerStyles.subscriptionMetricVal, { color: '#059669' }]}>
              {provider.subscriptionStatus ?? 'Active'}
            </Text>
          </View>
        </View>

        {provider.subscriptionExpiresAt ? (
          <Text style={providerStyles.subscriptionExpiryText}>
            Plan valid until{' '}
            {new Date(provider.subscriptionExpiresAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </Text>
        ) : null}
      </View>

      {/* Real-Time Pending Request Alert Card */}
      {pendingBookings.length > 0 ? (
        <View style={providerStyles.urgentSection}>
          <Text style={providerStyles.urgentSectionTitle}>⚡ Action Needed: Incoming Request</Text>
          {pendingBookings.map((b) => (
            <View key={b.id} style={providerStyles.pendingRequestCard}>
              <Pressable
                style={providerStyles.pendingHeader}
                onPress={() => router.push(`/booking/${b.id}`)}
              >
                <View style={providerStyles.driverAvatarWrap}>
                  {b.driver?.avatarUrl ? (
                    <Image
                      source={{ uri: resolveImageUrl(b.driver.avatarUrl) || b.driver.avatarUrl }}
                      style={providerStyles.driverPhoto}
                    />
                  ) : (
                    <View style={providerStyles.driverAvatarFallback}>
                      <Text style={providerStyles.driverAvatarText}>
                        {(b.driver?.fullName ?? 'D').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={providerStyles.verifiedPhotoBadge}>
                    <MaterialCommunityIcons name="shield-check" size={14} color="#10B981" />
                  </View>
                </View>
                <View style={providerStyles.driverInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={providerStyles.driverName}>{b.driver?.fullName ?? 'EV Driver'}</Text>
                    <View style={providerStyles.verifiedTag}>
                      <Text style={providerStyles.verifiedTagText}>Photo Attached</Text>
                    </View>
                  </View>
                  <Text style={providerStyles.driverCar}>
                    {b.vehicle?.model ?? 'Electric Car'} · {b.connectorType ?? 'CCS2'}
                  </Text>
                  <Text style={providerStyles.slotTime}>Requested: {formatDateTime(b.scheduledAt)}</Text>
                </View>
                <View style={providerStyles.tariffBadge}>
                  <Text style={providerStyles.tariffBadgeText}>
                    {provider.pricePerKwh ? `₹${provider.pricePerKwh}/kWh` : 'Standard'}
                  </Text>
                  <Text style={providerStyles.tariffSub}>Pay after charging</Text>
                </View>
              </Pressable>

              <View style={providerStyles.pendingActionRow}>
                <Button
                  mode="outlined"
                  textColor="#DC2626"
                  style={providerStyles.declineBtn}
                  onPress={() => declineBooking(b.id, b.driver?.fullName ?? 'this driver')}
                  disabled={actionId === b.id}
                >
                  Decline
                </Button>
                <Button
                  mode="contained"
                  buttonColor="#059669"
                  style={providerStyles.acceptBtn}
                  loading={actionId === b.id}
                  disabled={actionId === b.id}
                  onPress={() => acceptBooking(b.id)}
                >
                  Accept & Confirm
                </Button>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Confirmed Slot - Driver En Route / Ready for Arrival */}
      {confirmedBookings.length > 0 ? (
        <View style={providerStyles.confirmedSection}>
          <View style={providerStyles.confirmedSectionHeader}>
            <Text style={providerStyles.confirmedSectionTitle}>🚗 Driver Arriving · Slot Confirmed</Text>
            <View style={providerStyles.readyBadge}>
              <Text style={providerStyles.readyBadgeText}>Ready to Charge</Text>
            </View>
          </View>
          {confirmedBookings.map((b) => (
            <View key={b.id} style={providerStyles.confirmedCard}>
              <View style={providerStyles.confirmedTopRow}>
                <View style={providerStyles.driverAvatarWrap}>
                  {b.driver?.avatarUrl ? (
                    <Image
                      source={{ uri: resolveImageUrl(b.driver.avatarUrl) || b.driver.avatarUrl }}
                      style={providerStyles.driverPhoto}
                    />
                  ) : (
                    <View style={providerStyles.driverAvatarFallback}>
                      <Text style={providerStyles.driverAvatarText}>
                        {(b.driver?.fullName ?? 'D').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={providerStyles.verifiedPhotoBadge}>
                    <MaterialCommunityIcons name="shield-check" size={14} color="#10B981" />
                  </View>
                </View>

                <View style={providerStyles.driverInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={providerStyles.driverName}>{b.driver?.fullName ?? 'EV Driver'}</Text>
                    <View style={providerStyles.verifiedTag}>
                      <Text style={providerStyles.verifiedTagText}>Slot Locked</Text>
                    </View>
                  </View>
                  <Text style={providerStyles.driverCar}>
                    {b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : 'Electric Car'} · {CONNECTOR_LABELS[b.connectorType] ?? b.connectorType}
                  </Text>
                  <Text style={providerStyles.slotTime}>Requested: {formatDateTime(b.scheduledAt)}</Text>
                </View>

                <View style={providerStyles.tariffBadge}>
                  <Text style={providerStyles.tariffBadgeText}>
                    {provider.pricePerKwh ? `₹${provider.pricePerKwh}/kWh` : 'Standard'}
                  </Text>
                  <Text style={providerStyles.tariffSub}>Pay after charging</Text>
                </View>
              </View>

              <View style={providerStyles.instructionBox}>
                <MaterialCommunityIcons name="information-outline" size={16} color="#0D9488" />
                <Text style={providerStyles.instructionText}>
                  Driver has locked this slot. When driver arrives at your station, plug in connector and tap Start Charging below.
                </Text>
              </View>

              <View style={providerStyles.confirmedActionRow}>
                {b.driver?.phone ? (
                  <Button
                    mode="outlined"
                    icon="phone"
                    textColor="#0284C7"
                    style={providerStyles.callDriverBtn}
                    onPress={() => Linking.openURL(`tel:${b.driver?.phone}`)}
                  >
                    Call
                  </Button>
                ) : null}
                <Button
                  mode="contained"
                  buttonColor="#059669"
                  icon="lightning-bolt"
                  style={providerStyles.startChargingBtn}
                  loading={actionId === b.id}
                  disabled={actionId === b.id}
                  onPress={() => startChargingBooking(b.id, b.driver?.fullName ?? 'driver')}
                >
                  User Arrived · Start Charging
                </Button>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Active Charging Session In Progress */}
      {activeBookings.length > 0 ? (
        <View style={providerStyles.activeSessionSection}>
          <Text style={providerStyles.activeSectionTitle}>⚡ Charging In Progress</Text>
          {activeBookings.map((b) => (
            <ProviderActiveChargingCard
              key={b.id}
              booking={b}
              maxPowerKw={Number(provider.maxPowerKw ?? 7.4)}
              pricePerKwh={Number(provider.pricePerKwh ?? 20)}
            />
          ))}
        </View>
      ) : null}

      {/* Station Performance 4-Metrics Grid */}
      <View style={providerStyles.statsGrid}>
        <View style={providerStyles.statBox}>
          <MaterialCommunityIcons name="cash-multiple" size={22} color="#D97706" />
          <Text style={providerStyles.statNumber}>₹{stats?.totalRevenue ?? 1840}</Text>
          <Text style={providerStyles.statLabel}>Total Revenue</Text>
        </View>

        <View style={providerStyles.statBox}>
          <MaterialCommunityIcons name="calendar-check" size={22} color="#059669" />
          <Text style={providerStyles.statNumber}>{stats?.todayBookings ?? 1}</Text>
          <Text style={providerStyles.statLabel}>{"Today's Slots"}</Text>
        </View>

        <View style={providerStyles.statBox}>
          <MaterialCommunityIcons name="lightning-bolt" size={22} color="#2563EB" />
          <Text style={providerStyles.statNumber}>
            {stats?.completedBookings ? (stats.completedBookings * 22).toFixed(0) : '48'} kWh
          </Text>
          <Text style={providerStyles.statLabel}>Power Delivered</Text>
        </View>

        <View style={providerStyles.statBox}>
          <MaterialCommunityIcons name="star" size={22} color="#F59E0B" />
          <Text style={providerStyles.statNumber}>{stats?.rating ?? '4.9'} ★</Text>
          <Text style={providerStyles.statLabel}>Driver Reviews</Text>
        </View>
      </View>

      {/* Station Hardware & Equipment Specs */}
      <View style={providerStyles.sectionCard}>
        <View style={providerStyles.sectionCardHeader}>
          <Text style={providerStyles.sectionCardTitle}>Station Specifications</Text>
          <Pressable onPress={() => router.push('/provider-dashboard')}>
            <Text style={providerStyles.sectionAction}>Manage</Text>
          </Pressable>
        </View>

        <View style={providerStyles.specRow}>
          <View style={providerStyles.specCol}>
            <Text style={providerStyles.specLabel}>CHARGING POWER</Text>
            <Text style={providerStyles.specValue}>{provider.maxPowerKw} kW Fast DC</Text>
          </View>
          <View style={providerStyles.specCol}>
            <Text style={providerStyles.specLabel}>ENERGY TARIFF</Text>
            <Text style={providerStyles.specValue}>
              {provider.pricePerKwh ? `₹${provider.pricePerKwh} / kWh` : '₹18 / kWh'}
            </Text>
          </View>
          <View style={providerStyles.specCol}>
            <Text style={providerStyles.specLabel}>HOURS</Text>
            <Text style={providerStyles.specValue}>
              {provider.is24x7 ? '24 Hours' : `${provider.openingTime}-${provider.closingTime}`}
            </Text>
          </View>
        </View>

        <Text style={providerStyles.subheadLabel}>SUPPORTED CONNECTORS</Text>
        <View style={providerStyles.connectorChipRow}>
          {provider.connectorTypes?.map((c) => (
            <View key={c} style={providerStyles.connectorBadge}>
              <MaterialCommunityIcons name="ev-plug-ccs2" size={14} color="#D97706" />
              <Text style={providerStyles.connectorBadgeText}>{CONNECTOR_LABELS[c] ?? c}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Station Map View */}
      <View style={providerStyles.sectionCard}>
        <View style={providerStyles.sectionCardHeader}>
          <Text style={providerStyles.sectionCardTitle}>Station Location</Text>
          <Pressable
            onPress={() =>
              openGoogleMapsRoute(
                stationCoords.latitude,
                stationCoords.longitude,
                provider.businessName,
              )
            }
          >
            <Text style={providerStyles.sectionAction}>Open Maps</Text>
          </Pressable>
        </View>
        <Text style={providerStyles.mapSubhead}>
          {provider.addressLine}, {provider.city}, {provider.state} · {provider.pincode}
        </Text>
        <View style={providerStyles.mapContainer}>
          <AppMapView
            style={providerStyles.map}
            initialRegion={{
              latitude: stationCoords.latitude,
              longitude: stationCoords.longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
          >
            <Marker coordinate={stationCoords} tracksViewChanges={false}>
              <View style={providerStyles.stationPin}>
                <MaterialCommunityIcons name="ev-station" size={20} color="#FFFFFF" />
              </View>
            </Marker>
          </AppMapView>
        </View>
      </View>

      {/* Recent Sessions */}
      <View style={providerStyles.sectionCard}>
        <View style={providerStyles.sectionCardHeader}>
          <Text style={providerStyles.sectionCardTitle}>Recent Charging Activity</Text>
          <Pressable onPress={() => router.push('/bookings')}>
            <Text style={providerStyles.sectionAction}>View All</Text>
          </Pressable>
        </View>

        {recentBookings.length === 0 ? (
          <Text style={providerStyles.emptyActivity}>No charging sessions logged yet.</Text>
        ) : (
          recentBookings.map((b) => (
            <Pressable
              key={b.id}
              style={providerStyles.activityRow}
              onPress={() => router.push(`/booking/${b.id}`)}
            >
              <View style={providerStyles.activityIcon}>
                <MaterialCommunityIcons name="car-electric" size={20} color="#059669" />
              </View>
              <View style={providerStyles.activityTextWrap}>
                <Text style={providerStyles.activityDriver}>{b.driver?.fullName ?? 'EV Driver'}</Text>
                <Text style={providerStyles.activityTime}>{formatDateTime(b.scheduledAt)}</Text>
              </View>
              <View style={providerStyles.activityRight}>
                <Text style={providerStyles.activityPrice}>
                  +₹{b.totalAmount ?? b.estimatedCost ?? Math.round(Number(provider.pricePerKwh ?? 18) * 15)}
                </Text>
                <StatusBadge status={b.status} />
              </View>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: spacing.md, paddingTop: 48, paddingBottom: 120 },
  rapidoTopBar: {
    marginBottom: spacing.sm,
  },
  rapidoCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  rapidoAddressCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rapidoAddressText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  rapidoMapCard: {
    height: 320,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    marginTop: 6,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  userLocationMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0284C7',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  userLocationInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  bookedStationPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    elevation: 5,
  },
  rapidoStationPin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 54,
    height: 28,
    borderWidth: 1.5,
    borderColor: '#059669',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  rapidoStationPinActive: {
    borderColor: '#E08A00',
    backgroundColor: '#FEF3C7',
    transform: [{ scale: 1.08 }],
  },
  rapidoStationPinGold: {
    borderColor: '#D97706',
    backgroundColor: '#FFFBEB',
  },
  rapidoStationPinText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
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
  rapidoRecenterBtn: {
    position: 'absolute',
    bottom: 32,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 10,
  },
  rapidoSheetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: spacing.md,
    marginTop: -8,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -3 },
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  rapidoSearchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.8,
    borderColor: '#059669',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  rapidoSearchPlaceholder: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  rapidoRecentList: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginBottom: spacing.sm,
  },
  rapidoRecentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  rapidoRecentRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  rapidoClockIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rapidoRecentTextWrap: {
    flex: 1,
  },
  rapidoRecentTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  rapidoRecentSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  rapidoCategoriesWrap: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 4,
  },
  rapidoCategoriesScroll: {
    gap: 10,
    paddingVertical: 4,
  },
  rapidoCategoryCard: {
    width: 96,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  rapidoCategoryCardActive: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
  },
  rapidoCategoryIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  rapidoCategoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
    lineHeight: 14,
  },
  rapidoCategoryLabelActive: {
    color: '#059669',
    fontWeight: '800',
  },
  rapidoCategoryBadge: {
    marginTop: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  rapidoCategoryBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerText: { flex: 1 },
  greeting: { fontSize: 12.5, color: palette.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  name: { fontSize: 26, fontWeight: '800', color: palette.ink, marginTop: 2 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    marginTop: spacing.lg,
  },
  searchText: { color: palette.muted, fontSize: 14 },
  mapCard: {
    height: 230,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginTop: spacing.lg,
    backgroundColor: '#DDEBE3',
    borderWidth: 1,
    borderColor: palette.border,
  },
  mapOverlayTop: { position: 'absolute', top: spacing.md, left: spacing.md },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  countText: { fontSize: 12, fontWeight: '700', color: palette.ink },
  activeRoutePill: {
    backgroundColor: '#059669',
  },
  activeRoutePillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  recenter: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  locationAlertCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    gap: spacing.sm,
  },
  locationAlertHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  locationAlertIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationAlertTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
  },
  locationAlertDesc: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 16,
  },
  enableLocationBtn: {
    borderRadius: radius.md,
    marginTop: 2,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFF4D6',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  bannerTextWrap: { flex: 1 },
  bannerTitle: { fontSize: 12.5, fontWeight: '800', color: '#6B4B00' },
  bannerText: { fontSize: 11.5, color: '#8A6100', marginTop: 1 },
  bannerAction: { fontSize: 12, fontWeight: '800', color: '#8A6100' },
  filterRow: { gap: spacing.sm, paddingVertical: spacing.lg },
  filterChip: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  filterChipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  filterText: { fontSize: 12.5, fontWeight: '700', color: palette.muted },
  filterTextActive: { color: '#FFFFFF' },
  radiusBar: {
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  radiusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  radiusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  radiusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  radiusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  radiusChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: palette.primary,
  },
  radiusChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.muted,
  },
  radiusChipTextActive: {
    color: palette.primary,
    fontWeight: '700',
  },
  expandRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    justifyContent: 'center',
  },
  expandBtn: {
    borderRadius: radius.md,
  },
  section: { marginTop: 2 },
  loadingWrap: { alignItems: 'center', paddingVertical: spacing.xxl },
  loadingText: { color: palette.muted, fontSize: 13, marginTop: spacing.sm },
  selectedCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1.5,
    borderColor: palette.primary,
    shadowColor: '#0E2A20',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  selectedHeaderLeft: {
    flex: 1,
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E4F5EE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  selectedBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0A5C43',
  },
  selectedTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.ink,
  },
  selectedMeta: {
    fontSize: 12,
    color: palette.muted,
    marginTop: 2,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0F4F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routePillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  routeMetricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F4F8F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DDE9E2',
  },
  routeMetricText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.ink,
  },
  selectedActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  googleMapsBtn: {
    flex: 1,
    borderRadius: radius.md,
  },
  detailBtn: {
    flex: 1,
    borderRadius: radius.md,
  },
  btnContent: {
    paddingVertical: 4,
  },
  activeBookingCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1.5,
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  activeCardHeader: {
    marginBottom: spacing.xs,
  },
  activeHeaderBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  activeStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusBadgeConfirmed: {
    backgroundColor: '#059669',
  },
  statusBadgeCharging: {
    backgroundColor: '#2563EB',
  },
  statusBadgePending: {
    backgroundColor: '#D97706',
  },
  activeStatusText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  activeBookingCode: {
    fontSize: 12,
    fontWeight: '800',
    color: palette.muted,
  },
  activeStationTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: palette.ink,
    marginTop: 2,
  },
  activeStationAddress: {
    fontSize: 12.5,
    color: palette.muted,
    marginTop: 2,
  },
  activeSlotTime: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    marginTop: 4,
  },
  activeMetricsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAF9',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: spacing.sm,
  },
  activeMetricItem: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  activeMetricDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
  },
  activeMetricValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: palette.ink,
  },
  activeMetricLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: palette.muted,
  },
  activeActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 4,
  },
  activeGoogleMapsBtn: {
    flex: 1,
    borderRadius: radius.md,
  },
  activeDetailBtn: {
    flex: 1,
    borderRadius: radius.md,
  },
  emptyCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    marginTop: spacing.md,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.ink,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: palette.muted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyBtn: {
    marginTop: spacing.lg,
    borderRadius: radius.md,
  },
  emptyBtnContent: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
});

const providerStyles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.background,
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    color: palette.muted,
    fontSize: 14,
  },
  noStationContent: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    backgroundColor: palette.background,
  },
  noStationCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  noStationIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  noStationTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: palette.ink,
    textAlign: 'center',
  },
  noStationSub: {
    fontSize: 13.5,
    color: palette.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  setupBtn: {
    marginTop: spacing.xl,
    borderRadius: radius.md,
    width: '100%',
  },
  flex: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: 54,
    paddingBottom: 120,
  },
  headerCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: spacing.lg,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  stationBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  editIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationName: {
    fontSize: 22,
    fontWeight: '800',
    color: palette.ink,
    marginTop: spacing.md,
  },
  stationAddress: {
    fontSize: 13,
    color: palette.muted,
    marginTop: 4,
  },
  statusToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  statusToggleOnline: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  statusToggleOffline: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  statusToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.sm,
  },
  statusPulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusToggleTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  statusToggleSub: {
    fontSize: 11,
    color: palette.muted,
    marginTop: 2,
  },
  toggleActionBtn: {
    borderRadius: radius.pill,
    minWidth: 96,
  },
  toggleActionBtnLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  subscriptionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    marginBottom: spacing.lg,
    shadowColor: '#D97706',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  subscriptionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  subscriptionBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  subscriptionBadgeGold: {
    backgroundColor: '#FEF3C7',
  },
  subscriptionBadgeGreen: {
    backgroundColor: '#ECFDF5',
  },
  subscriptionBadgeBlue: {
    backgroundColor: '#EFF6FF',
  },
  subscriptionBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  upgradePlanAction: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
  subscriptionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.ink,
    marginTop: 6,
    marginBottom: spacing.sm,
  },
  subscriptionMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 4,
  },
  subscriptionMetric: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  subscriptionMetricDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#FDE68A',
  },
  subscriptionMetricLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  subscriptionMetricVal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: palette.ink,
  },
  subscriptionExpiryText: {
    fontSize: 11,
    color: palette.muted,
    marginTop: 8,
    textAlign: 'center',
  },
  urgentSection: {
    marginBottom: spacing.lg,
  },
  urgentSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#B45309',
    marginBottom: spacing.sm,
  },
  pendingRequestCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    marginBottom: spacing.sm,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  driverAvatarWrap: {
    position: 'relative',
    marginRight: 2,
  },
  driverPhoto: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: '#10B981',
  },
  driverAvatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  driverAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#D97706',
  },
  verifiedPhotoBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 7,
  },
  verifiedTag: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  verifiedTagText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#065F46',
  },
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '800',
    color: palette.ink,
  },
  driverCar: {
    fontSize: 12.5,
    color: palette.muted,
    marginTop: 1,
  },
  slotTime: {
    fontSize: 11.5,
    color: '#92400E',
    marginTop: 2,
  },
  tariffBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.md,
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  tariffBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  tariffSub: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#B45309',
    marginTop: 1,
  },
  estimateFare: {
    fontSize: 18,
    fontWeight: '800',
    color: '#B45309',
  },
  pendingActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  declineBtn: {
    flex: 1,
    borderColor: '#FCA5A5',
  },
  acceptBtn: {
    flex: 1,
  },
  confirmedSection: {
    marginBottom: spacing.lg,
  },
  confirmedSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  confirmedSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#065F46',
  },
  readyBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  readyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  confirmedCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: '#10B981',
    marginBottom: spacing.sm,
  },
  confirmedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  instructionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#CCFBF1',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  instructionText: {
    fontSize: 12,
    color: '#0F766E',
    flex: 1,
    lineHeight: 16,
  },
  confirmedActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  callDriverBtn: {
    borderColor: '#38BDF8',
    borderRadius: radius.md,
  },
  startChargingBtn: {
    flex: 1,
    borderRadius: radius.md,
  },
  activeSessionSection: {
    marginBottom: spacing.lg,
  },
  activeSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: spacing.sm,
  },
  liveSessionCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: '#10B981',
    marginBottom: spacing.sm,
  },
  liveSessionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveSessionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
  },
  liveSessionSub: {
    fontSize: 12,
    color: '#047857',
    marginTop: 1,
  },
  livePulseTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  livePulseDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  livePulseTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#065F46',
  },
  liveTimerBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingVertical: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  liveTimerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.5,
  },
  liveTimerDisplay: {
    fontSize: 22,
    fontWeight: '900',
    color: '#065F46',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  liveMetricsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  liveMetricCol: {
    flex: 1,
    alignItems: 'center',
  },
  liveMetricVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  liveMetricLbl: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  liveMetricDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  finishChargingBtn: {
    marginTop: 10,
    borderRadius: radius.md,
  },
  activeSessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: '#10B981',
    marginBottom: spacing.lg,
  },
  activeSessionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pulseCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSessionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
  },
  activeSessionSub: {
    fontSize: 12,
    color: '#047857',
    marginTop: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.ink,
    marginTop: spacing.xs,
  },
  statLabel: {
    fontSize: 11.5,
    color: palette.muted,
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: spacing.lg,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.ink,
  },
  sectionAction: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#D97706',
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  specCol: {
    flex: 1,
  },
  specLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: palette.muted,
    letterSpacing: 0.5,
  },
  specValue: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.ink,
    marginTop: 3,
  },
  subheadLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: palette.muted,
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  connectorChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  connectorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  connectorBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#92400E',
  },
  mapSubhead: {
    fontSize: 12.5,
    color: palette.muted,
    marginBottom: spacing.sm,
  },
  mapContainer: {
    height: 160,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  stationPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  emptyActivity: {
    fontSize: 13,
    color: palette.muted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  activityTextWrap: {
    flex: 1,
  },
  activityDriver: {
    fontSize: 13.5,
    fontWeight: '700',
    color: palette.ink,
  },
  activityTime: {
    fontSize: 11,
    color: palette.muted,
    marginTop: 2,
  },
  activityRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  activityPrice: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#059669',
  },
});

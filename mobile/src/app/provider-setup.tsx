import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import { Button, Chip, Dialog, Portal, Switch } from 'react-native-paper';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { FormField } from '@/components/FormField';
import { LocationPickerModal, LocationResult } from '@/components/LocationPickerModal';
import { StatusBadge } from '@/components/StatusBadge';
import { useCreateProvider, useMyProvider, useUpdateProvider } from '@/hooks/useProviders';
import { useCurrentLocation } from '@/hooks/useLocation';
import { getErrorMessage } from '@/lib/api';
import { uploadsApi, usersApi, providersApi } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth';
import AppMapView, { Marker } from '@/components/AppMapView';
import { CONNECTOR_LABELS, PROVIDER_TYPE_LABELS } from '@/lib/config';
import { palette, radius, spacing } from '@/theme';
import type { ConnectorType, ProviderType } from '@/types/api';

export interface SubscriptionPlanOption {
  key: string;
  name: string;
  durationLabel: string;
  price: number;
  priceFormatted: string;
  minRadiusM: number;
  maxRadiusM: number;
  visibilityRange: string;
  priorityLabel: string;
  priorityTier: number;
  badge?: string;
  badgeColor?: string;
  features: string[];
}

export const SUBSCRIPTION_PLANS: SubscriptionPlanOption[] = [
  {
    key: 'MONTH_1',
    name: '1 Month Plan',
    durationLabel: '30 Days Validity',
    price: 350,
    priceFormatted: '₹350',
    minRadiusM: 500,
    maxRadiusM: 2000,
    visibilityRange: '500m to 2 km radius',
    priorityLabel: 'Standard Visibility',
    priorityTier: 1,
    badge: 'Starter',
    badgeColor: '#0284C7',
    features: [
      'Visible from 500m to 2 km radius for users',
      'Ranked by driver reviews',
      'Instant booking push notifications',
    ],
  },
  {
    key: 'MONTH_5',
    name: '5 Months Plan',
    durationLabel: '150 Days Validity',
    price: 650,
    priceFormatted: '₹650',
    minRadiusM: 100,
    maxRadiusM: 5000,
    visibilityRange: '100m to 5 km radius',
    priorityLabel: 'High Preference',
    priorityTier: 2,
    badge: 'Popular Choice',
    badgeColor: '#059669',
    features: [
      'Visible from 100m to 5 km radius for users',
      'High priority over 1-month plans',
      'Driver review booster & priority ranking',
    ],
  },
  {
    key: 'YEAR_1',
    name: '1 Year Plan',
    durationLabel: '365 Days Validity',
    price: 1250,
    priceFormatted: '₹1,250',
    minRadiusM: 100,
    maxRadiusM: 10000,
    visibilityRange: '100m to 10 km radius',
    priorityLabel: '1st Preference',
    priorityTier: 3,
    badge: '1st Preference ⭐',
    badgeColor: '#D97706',
    features: [
      'Visible from 100m to 10 km radius for users',
      '1st Preference when 2 providers are nearby',
      'Top search priority based on reviews',
      'Maximum visibility across entire city',
    ],
  },
];

const PROVIDER_TYPES: ProviderType[] = ['HOME', 'SHOP', 'OFFICE', 'HOTEL', 'REPAIR_SHOP', 'BUSINESS'];
const CONNECTORS: ConnectorType[] = ['TYPE_2', 'CCS2', 'CHADEMO', 'TYPE_1', 'GB_T', 'AC_3_PIN'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const setupSchema = z.object({
  businessName: z.string().trim().min(2, 'Enter a name drivers will recognise').max(160),
  providerType: z.enum(['HOME', 'SHOP', 'OFFICE', 'HOTEL', 'REPAIR_SHOP', 'BUSINESS']),
  description: z.string().trim().max(1000).optional(),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^\+?[1-9]\d{7,14}$/.test(value), {
      message: 'Use international format, e.g. +919800000001',
    }),
  addressLine: z.string().trim().min(3, 'Enter the street address').max(300),
  city: z.string().trim().min(2, 'Enter the city').max(120),
  state: z.string().trim().min(2, 'Enter the state').max(120),
  pincode: z.string().trim().regex(/^\d{4,10}$/, 'Enter a valid PIN code'),
  latitude: z
    .string()
    .trim()
    .refine((value) => Number.isFinite(Number(value)) && Number(value) >= -90 && Number(value) <= 90, {
      message: 'Latitude must be between -90 and 90',
    }),
  longitude: z
    .string()
    .trim()
    .refine((value) => Number.isFinite(Number(value)) && Number(value) >= -180 && Number(value) <= 180, {
      message: 'Longitude must be between -180 and 180',
    }),
  openingTime: z.string().trim().regex(TIME_PATTERN, 'Use 24-hour HH:MM'),
  closingTime: z.string().trim().regex(TIME_PATTERN, 'Use 24-hour HH:MM'),
  pricePerKwh: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || (Number(value) >= 0 && Number(value) <= 10000), {
      message: 'Enter a rate between 0 and 10000',
    }),
  maxPowerKw: z
    .string()
    .trim()
    .refine((value) => Number(value) >= 1 && Number(value) <= 1000, {
      message: 'Enter a power rating between 1 and 1000 kW',
    }),
  connectorTypes: z
    .array(z.enum(['TYPE_2', 'CCS2', 'CHADEMO', 'TYPE_1', 'GB_T', 'AC_3_PIN', 'OTHER']))
    .min(1, 'Select at least one connector'),
  hasParking: z.boolean(),
  hasRestroom: z.boolean(),
  hasWifi: z.boolean(),
  hasCctv: z.boolean(),
  is24x7: z.boolean(),
});

type SetupValues = z.infer<typeof setupSchema>;

const DEFAULT_VALUES: SetupValues = {
  businessName: '',
  providerType: 'HOME',
  description: '',
  phone: '',
  addressLine: 'Near Benz Circle, Bandar Road',
  city: 'Vijayawada',
  state: 'Andhra Pradesh',
  pincode: '520010',
  latitude: '16.5002',
  longitude: '80.6480',
  openingTime: '08:00',
  closingTime: '22:00',
  pricePerKwh: '',
  maxPowerKw: '3',
  connectorTypes: ['TYPE_2'],
  hasParking: false,
  hasRestroom: false,
  hasWifi: false,
  hasCctv: false,
  is24x7: false,
};

export default function ProviderSetupScreen() {
  const { from, changePlan } = useLocalSearchParams<{ from?: string; changePlan?: string }>();
  const isChangingPlan = changePlan === 'true';
  const { data: existing, isLoading: checkingExisting } = useMyProvider();
  const { coords, permission, error: locationError, loading: locating, refresh } = useCurrentLocation();
  const createProvider = useCreateProvider();
  const updateProvider = useUpdateProvider();
  const currentUser = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [busy, setBusy] = useState(false);

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

  // Mandatory verification photos
  const [hostPhotoUri, setHostPhotoUri] = useState<string | null>(currentUser?.avatarUrl ?? null);
  const [chargerPhotoUri, setChargerPhotoUri] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const is24x7 = Boolean(useWatch({ control, name: 'is24x7' }));
  const connectors = useWatch({ control, name: 'connectorTypes' }) ?? [];

  const latValue = useWatch({ control, name: 'latitude' });
  const lngValue = useWatch({ control, name: 'longitude' });
  const addressValue = useWatch({ control, name: 'addressLine' });
  const cityValue = useWatch({ control, name: 'city' });
  const stateValue = useWatch({ control, name: 'state' });
  const pincodeValue = useWatch({ control, name: 'pincode' });

  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [showManualFields, setShowManualFields] = useState(false);

  // Subscription plan & checkout modal states
  const { data: serverPlans } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: providersApi.plans,
  });
  const plans = serverPlans && serverPlans.length > 0 ? serverPlans : SUBSCRIPTION_PLANS;

  const [selectedPlanKey, setSelectedPlanKey] = useState<string>('YEAR_1');
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'QR' | 'CARD'>('UPI');
  const [paying, setPaying] = useState(false);
  const [pendingValues, setPendingValues] = useState<SetupValues | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.key === selectedPlanKey) ?? plans[2] ?? plans[0],
    [plans, selectedPlanKey],
  );

  const handleLocationPicked = (result: LocationResult) => {
    setValue('latitude', result.latitude.toFixed(6), { shouldValidate: true });
    setValue('longitude', result.longitude.toFixed(6), { shouldValidate: true });
    if (result.addressLine) {
      setValue('addressLine', result.addressLine, { shouldValidate: true });
    }
    if (result.city) {
      setValue('city', result.city, { shouldValidate: true });
    }
    if (result.state) {
      setValue('state', result.state, { shouldValidate: true });
    }
    if (result.pincode) {
      setValue('pincode', result.pincode, { shouldValidate: true });
    }
  };

  const coordsLabel = useMemo(() => {
    if (!coords) return null;
    return `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
  }, [coords]);

  useEffect(() => {
    if (!coords) return;
    const { latitude, longitude } = getValues();
    if (!latitude) setValue('latitude', coords.latitude.toFixed(6));
    if (!longitude) setValue('longitude', coords.longitude.toFixed(6));
  }, [coords, getValues, setValue]);

  const locateMe = async () => {
    await refresh();
    if (coords) {
      setValue('latitude', coords.latitude.toFixed(6));
      setValue('longitude', coords.longitude.toFixed(6));
    }
  };

  const pickHostPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo gallery access to upload your host verification photo.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]?.uri) {
      setHostPhotoUri(res.assets[0].uri);
    }
  };

  const pickChargerPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo gallery access to upload your charging point photo.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]?.uri) {
      setChargerPhotoUri(res.assets[0].uri);
    }
  };

  const toggleConnector = (connector: ConnectorType, current: ConnectorType[], onChange: (next: ConnectorType[]) => void) => {
    if (current.includes(connector)) {
      onChange(current.filter((item) => item !== connector));
    } else {
      onChange([...current, connector]);
    }
  };

  const submit = (values: SetupValues) => {
    if (!hostPhotoUri) {
      Alert.alert(
        'Host Photo Required',
        'Please upload your personal host photograph. Drivers inspect this photo to verify the provider identity before booking.',
      );
      return;
    }

    if (!chargerPhotoUri) {
      Alert.alert(
        'Charging Point Photo Required',
        'Please upload a photograph of your charging point / wallbox / socket. The administrator needs this photo to inspect and approve your station.',
      );
      return;
    }

    setPendingValues(values);
    setCheckoutModalVisible(true);
  };

  const handleCompletePaymentAndRegister = async () => {
    if (!pendingValues) return;
    setPaying(true);
    setBusy(true);
    try {
      // 1. Upload host photo if changed
      if (hostPhotoUri && !hostPhotoUri.startsWith('http')) {
        try {
          const hostUpload = await uploadsApi.image(hostPhotoUri, 'avatars');
          await usersApi.update({ avatarUrl: hostUpload.url });
        } catch (e) {
          console.warn('Avatar upload failed during setup:', e);
        }
      }

      // 2. Create provider profile with chosen subscription plan
      await createProvider.mutateAsync({
        businessName: pendingValues.businessName.trim(),
        providerType: pendingValues.providerType,
        description: pendingValues.description?.trim() || undefined,
        phone: pendingValues.phone?.trim() || undefined,
        addressLine: pendingValues.addressLine.trim(),
        city: pendingValues.city.trim(),
        state: pendingValues.state.trim(),
        pincode: pendingValues.pincode.trim(),
        latitude: Number(pendingValues.latitude),
        longitude: Number(pendingValues.longitude),
        openingTime: pendingValues.is24x7 ? '00:00' : pendingValues.openingTime,
        closingTime: pendingValues.is24x7 ? '23:59' : pendingValues.closingTime,
        pricePerKwh: pendingValues.pricePerKwh ? Number(pendingValues.pricePerKwh) : undefined,
        connectorTypes: pendingValues.connectorTypes,
        maxPowerKw: Number(pendingValues.maxPowerKw),
        hasParking: pendingValues.hasParking,
        hasRestroom: pendingValues.hasRestroom,
        hasWifi: pendingValues.hasWifi,
        hasCctv: pendingValues.hasCctv,
        is24x7: pendingValues.is24x7,
        subscriptionPlan: selectedPlan.key,
        paymentMethod,
        paymentTransactionId: `TXN_${Date.now()}`,
      });

      // 3. Upload charger hardware photo as ProviderDocument
      if (chargerPhotoUri && !chargerPhotoUri.startsWith('http')) {
        try {
          const chargerUpload = await uploadsApi.image(chargerPhotoUri, 'documents');
          await providersApi.addDocument({
            type: 'CHARGER_PHOTO',
            fileUrl: chargerUpload.url,
          });
        } catch (e) {
          console.warn('Charger document upload failed:', e);
        }
      }

      setCheckoutModalVisible(false);

      if (currentUser) {
        updateUser({ ...currentUser, role: 'PROVIDER' });
      }

      Alert.alert(
        'Subscription Active & Submitted!',
        `Payment of ${selectedPlan.priceFormatted} received! Your charging station has been activated with the ${selectedPlan.name} (${selectedPlan.visibilityRange}). Once approved by admin, drivers within this radius will discover your station.`,
        [{ text: 'Open Dashboard', onPress: () => router.replace('/provider-dashboard') }],
      );
    } catch (error) {
      Alert.alert('Could not complete registration', getErrorMessage(error));
    } finally {
      setPaying(false);
      setBusy(false);
    }
  };

  if (existing && !isChangingPlan) {
    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Become a provider',
            headerLeft: () => (
              <Pressable onPress={handleBack} hitSlop={10} style={{ paddingRight: 12 }}>
                <MaterialCommunityIcons name="arrow-left" size={24} color={palette.ink} />
              </Pressable>
            ),
          }}
        />
        <View style={styles.existingCard}>
          <View style={styles.existingIcon}>
            <MaterialCommunityIcons name="ev-station" size={28} color={palette.primary} />
          </View>
          <Text style={styles.existingTitle}>{existing.businessName}</Text>
          <Text style={styles.existingMeta}>
            {PROVIDER_TYPE_LABELS[existing.providerType] ?? existing.providerType} · {existing.city}
          </Text>
          <View style={styles.existingStatus}>
            <Text style={styles.existingStatusLabel}>Verification</Text>
            <StatusBadge status={existing.verificationStatus} />
          </View>
          {existing.verificationNote ? (
            <Text style={styles.existingNote}>{existing.verificationNote}</Text>
          ) : null}
          <Button
            mode="contained"
            icon="view-dashboard-outline"
            onPress={() => router.replace('/provider-dashboard')}
            style={styles.existingButton}
            contentStyle={styles.buttonContent}
          >
            Open provider dashboard
          </Button>
        </View>
      </ScrollView>
    );
  }

  // ── CHANGE PLAN MODE ────────────────────────────────────────────────────────
  if (existing && isChangingPlan) {
    const handleChangePlan = async () => {
      setBusy(true);
      try {
        await updateProvider.mutateAsync({ subscriptionPlan: selectedPlanKey } as any);
        Alert.alert(
          'Plan Updated!',
          `Your subscription has been updated to the ${selectedPlan.name}. Changes take effect immediately.`,
          [{ text: 'Go to Dashboard', onPress: () => router.replace('/provider-dashboard') }],
        );
      } catch (error) {
        Alert.alert('Could not update plan', getErrorMessage(error));
      } finally {
        setBusy(false);
      }
    };

    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Change Subscription Plan',
            headerLeft: () => (
              <Pressable onPress={() => router.replace('/provider-dashboard')} hitSlop={10} style={{ paddingRight: 12 }}>
                <MaterialCommunityIcons name="arrow-left" size={24} color={palette.ink} />
              </Pressable>
            ),
          }}
        />

        {/* Current Plan Banner */}
        <View style={[styles.existingCard, { marginBottom: 16 }]}>
          <View style={styles.existingIcon}>
            <MaterialCommunityIcons name="crown" size={26} color="#D97706" />
          </View>
          <Text style={styles.existingTitle}>Current Plan</Text>
          <Text style={styles.existingMeta}>
            {existing.subscriptionPlan === 'YEAR_1'
              ? '1 Year Plan — 1st Preference'
              : existing.subscriptionPlan === 'MONTH_5'
              ? '5 Months Plan — High Priority'
              : existing.subscriptionPlan === 'MONTH_1'
              ? '1 Month Plan — Standard'
              : 'No Active Plan'}
          </Text>
        </View>

        {/* Plan Cards */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <MaterialCommunityIcons name="crown" size={22} color="#D97706" />
            <Text style={styles.cardTitle}>Choose New Plan</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Select a visibility tier. Higher plans get 1st preference when drivers search nearby.
          </Text>
          <View style={styles.plansContainer}>
            {plans.map((plan) => {
              const isSelected = selectedPlanKey === plan.key;
              return (
                <Pressable
                  key={plan.key}
                  onPress={() => setSelectedPlanKey(plan.key)}
                  style={[
                    styles.planCard,
                    isSelected && styles.planCardActive,
                    plan.key === 'YEAR_1' && styles.planCardBest,
                  ]}
                >
                  <View style={styles.planCardHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.planBadgeRow}>
                        <Text style={styles.planName}>{plan.name}</Text>
                        {plan.badge ? (
                          <View style={[styles.planBadge, { backgroundColor: plan.badgeColor ?? palette.primary }]}>
                            <Text style={styles.planBadgeLabel}>{plan.badge}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.planValidity}>{plan.durationLabel}</Text>
                    </View>
                    <View style={styles.planPriceBox}>
                      <Text style={styles.planPrice}>{plan.priceFormatted}</Text>
                    </View>
                  </View>
                  <View style={styles.planRadiusPill}>
                    <MaterialCommunityIcons name="radar" size={15} color={isSelected ? '#059669' : palette.muted} />
                    <Text style={[styles.planRadiusText, isSelected && { color: '#065F46', fontWeight: '800' }]}>
                      Visible to drivers: {plan.visibilityRange}
                    </Text>
                  </View>
                  <View style={styles.planFeaturesList}>
                    {plan.features.map((feature, idx) => (
                      <View key={idx} style={styles.planFeatureRow}>
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={14}
                          color={isSelected ? '#059669' : '#9CA3AF'}
                        />
                        <Text style={[styles.planFeatureText, isSelected && { color: palette.ink }]}>
                          {feature}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.planRadioRow}>
                    <View style={[styles.planRadioCircle, isSelected && styles.planRadioCircleActive]}>
                      {isSelected ? <View style={styles.planRadioInner} /> : null}
                    </View>
                    <Text style={[styles.planRadioText, isSelected && { color: '#059669', fontWeight: '800' }]}>
                      {isSelected ? 'Selected Plan' : 'Tap to select'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Button
          mode="contained"
          icon="credit-card-check"
          buttonColor="#059669"
          onPress={() => void handleChangePlan()}
          loading={busy}
          disabled={busy}
          style={styles.submit}
          contentStyle={styles.buttonContent}
        >
          Confirm Plan Change
        </Button>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Become a provider',
          headerLeft: () => (
            <Pressable onPress={handleBack} hitSlop={10} style={{ paddingRight: 12 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={palette.ink} />
            </Pressable>
          ),
        }}
      />
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name="ev-station" size={26} color="#FFFFFF" />
        </View>
        <Text style={styles.heroTitle}>List your charging point</Text>
        <Text style={styles.heroText}>
          Earn from your home, shop or office charger. Drivers only see approved points; you stay in control of
          availability.
        </Text>
      </View>

      {checkingExisting ? (
        <Text style={styles.checking}>Checking your account…</Text>
      ) : null}

      {/* Mandatory Photos Verification Card */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <MaterialCommunityIcons name="shield-check" size={20} color={palette.primary} />
          <Text style={styles.cardTitle}>Verification Photos (Required)</Text>
        </View>
        <Text style={styles.cardSubtitle}>
          EVRescue requires your personal identity photo and the charging point photo before the administrator can approve your station for drivers.
        </Text>

        <View style={styles.photoRow}>
          {/* 1. Host Photo */}
          <View style={styles.photoBox}>
            <Text style={styles.photoLabel}>1. Host Personal Photo *</Text>
            <Pressable onPress={() => void pickHostPhoto()} style={styles.photoContainer}>
              {hostPhotoUri ? (
                <Image source={{ uri: hostPhotoUri }} style={styles.photoThumb} />
              ) : (
                <View style={styles.photoEmpty}>
                  <MaterialCommunityIcons name="account-circle-outline" size={32} color={palette.primary} />
                  <Text style={styles.photoUploadPrompt}>Tap to upload</Text>
                </View>
              )}
            </Pressable>
            <Button
              mode="text"
              compact
              onPress={() => void pickHostPhoto()}
              labelStyle={{ fontSize: 11, fontWeight: '700' }}
            >
              {hostPhotoUri ? 'Change Photo ✓' : '+ Select Photo'}
            </Button>
          </View>

          {/* 2. Charger Photo */}
          <View style={styles.photoBox}>
            <Text style={styles.photoLabel}>2. Charging Point Photo *</Text>
            <Pressable onPress={() => void pickChargerPhoto()} style={styles.photoContainer}>
              {chargerPhotoUri ? (
                <Image source={{ uri: chargerPhotoUri }} style={styles.photoThumb} />
              ) : (
                <View style={styles.photoEmpty}>
                  <MaterialCommunityIcons name="ev-station" size={32} color="#D97706" />
                  <Text style={styles.photoUploadPrompt}>Tap to upload</Text>
                </View>
              )}
            </Pressable>
            <Button
              mode="text"
              compact
              onPress={() => void pickChargerPhoto()}
              labelStyle={{ fontSize: 11, fontWeight: '700', color: '#D97706' }}
            >
              {chargerPhotoUri ? 'Change Photo ✓' : '+ Select Photo'}
            </Button>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Business details</Text>
        <Controller
          control={control}
          name="businessName"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Charging point name"
              placeholder="Asha's Home Charger"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.businessName?.message}
            />
          )}
        />

        <Text style={styles.fieldLabel}>Type of place</Text>
        <Controller
          control={control}
          name="providerType"
          render={({ field: { onChange, value } }) => (
            <View style={styles.chipRow}>
              {PROVIDER_TYPES.map((type) => (
                <Chip
                  key={type}
                  selected={value === type}
                  onPress={() => onChange(type)}
                  style={[styles.chip, value === type && styles.chipActive]}
                  textStyle={[styles.chipText, value === type && styles.chipTextActive]}
                  showSelectedOverlay={false}
                >
                  {PROVIDER_TYPE_LABELS[type]}
                </Chip>
              ))}
            </View>
          )}
        />

        <Controller
          control={control}
          name="description"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Description (optional)"
              placeholder="Covered parking, easy access from the main road."
              value={value ?? ''}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.description?.message}
              multiline
              numberOfLines={3}
            />
          )}
        />

        <Controller
          control={control}
          name="phone"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Contact phone (optional)"
              placeholder="+919800000001"
              keyboardType="phone-pad"
              autoCapitalize="none"
              value={value ?? ''}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.phone?.message}
            />
          )}
        />
      </View>

      <View style={styles.card}>
        <View style={styles.locationHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <MaterialCommunityIcons name="map-marker-radius" size={20} color={palette.primary} />
            <Text style={styles.cardTitle}>Charger Location</Text>
          </View>
          <View style={styles.benzCircleBadge}>
            <Text style={styles.benzCircleBadgeText}>Benz Circle / Vijayawada</Text>
          </View>
        </View>

        <Text style={styles.cardSubtitle}>
          Drivers navigate directly to this location. Open Google Map to drop a pin on your exact charging stall or edit the address.
        </Text>

        {/* Selected Location Summary & Mini Map */}
        <View style={styles.locationSummaryBox}>
          <View style={styles.locationSummaryTop}>
            <View style={styles.summaryIconBox}>
              <MaterialCommunityIcons name="ev-station" size={22} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryAddressText} numberOfLines={2}>
                {addressValue ? `${addressValue}, ${cityValue}` : `${cityValue}, ${stateValue}`}
              </Text>
              <Text style={styles.summaryCoordsText}>
                📍 Lat: {Number(latValue || 16.5002).toFixed(5)}, Lng: {Number(lngValue || 80.648).toFixed(5)}
              </Text>
            </View>
          </View>

          {/* Mini Map Preview */}
          <View style={styles.miniMapWrap}>
            <AppMapView
              style={StyleSheet.absoluteFill}
              region={{
                latitude: Number(latValue) || 16.5002,
                longitude: Number(lngValue) || 80.648,
                latitudeDelta: 0.008,
                longitudeDelta: 0.008,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              <Marker
                coordinate={{
                  latitude: Number(latValue) || 16.5002,
                  longitude: Number(lngValue) || 80.648,
                }}
              />
            </AppMapView>
            <Pressable
              onPress={() => setMapModalVisible(true)}
              style={styles.miniMapOverlayBtn}
            >
              <MaterialCommunityIcons name="arrow-expand-all" size={15} color="#FFFFFF" />
              <Text style={styles.miniMapOverlayText}>Open Map to Pin</Text>
            </Pressable>
          </View>

          {/* Location Action Buttons */}
          <View style={styles.locationActionRow}>
            <Button
              mode="contained"
              icon="map-marker-plus"
              onPress={() => setMapModalVisible(true)}
              style={styles.pinMapBtn}
              buttonColor={palette.primary}
              contentStyle={{ paddingVertical: 4 }}
            >
              Pin on Google Map
            </Button>

            <Button
              mode="outlined"
              icon="crosshairs-gps"
              loading={locating}
              onPress={() => void locateMe()}
              style={styles.gpsLocateBtn}
              compact
            >
              My GPS
            </Button>
          </View>
        </View>

        {/* Toggle to edit address fields manually */}
        <Pressable
          onPress={() => setShowManualFields((prev) => !prev)}
          style={styles.manualEditToggle}
        >
          <MaterialCommunityIcons
            name={showManualFields ? 'chevron-up' : 'pencil-outline'}
            size={16}
            color={palette.primary}
          />
          <Text style={styles.manualEditToggleText}>
            {showManualFields ? 'Hide manual address fields' : 'Edit address fields manually'}
          </Text>
        </Pressable>

        {showManualFields ? (
          <View style={styles.manualFieldsWrap}>
            <Controller
              control={control}
              name="addressLine"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Street address"
                  placeholder="Near Benz Circle, Bandar Road"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.addressLine?.message}
                />
              )}
            />

            <View style={styles.twoColumn}>
              <View style={styles.column}>
                <Controller
                  control={control}
                  name="city"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <FormField
                      label="City"
                      placeholder="Vijayawada"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.city?.message}
                    />
                  )}
                />
              </View>
              <View style={styles.column}>
                <Controller
                  control={control}
                  name="state"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <FormField
                      label="State"
                      placeholder="Andhra Pradesh"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.state?.message}
                    />
                  )}
                />
              </View>
            </View>

            <View style={styles.twoColumn}>
              <View style={styles.column}>
                <Controller
                  control={control}
                  name="pincode"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <FormField
                      label="PIN code"
                      placeholder="520010"
                      keyboardType="number-pad"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.pincode?.message}
                    />
                  )}
                />
              </View>
              <View style={styles.column}>
                <Controller
                  control={control}
                  name="latitude"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <FormField
                      label="Latitude"
                      placeholder="16.5002"
                      keyboardType="decimal-pad"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.latitude?.message}
                    />
                  )}
                />
              </View>
            </View>

            <Controller
              control={control}
              name="longitude"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Longitude"
                  placeholder="80.6480"
                  keyboardType="decimal-pad"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.longitude?.message}
                />
              )}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Charging setup</Text>
        <Text style={styles.fieldLabel}>Supported connectors</Text>
        <Controller
          control={control}
          name="connectorTypes"
          render={({ field: { onChange, value } }) => (
            <View style={styles.chipRow}>
              {CONNECTORS.map((connector) => {
                const selected = value.includes(connector);
                return (
                  <Chip
                    key={connector}
                    selected={selected}
                    onPress={() => toggleConnector(connector, value, onChange)}
                    style={[styles.chip, selected && styles.chipActive]}
                    textStyle={[styles.chipText, selected && styles.chipTextActive]}
                    showSelectedOverlay={false}
                  >
                    {CONNECTOR_LABELS[connector]}
                  </Chip>
                );
              })}
            </View>
          )}
        />
        {errors.connectorTypes?.message ? (
          <Text style={styles.fieldError}>{errors.connectorTypes.message}</Text>
        ) : null}

        <View style={styles.twoColumn}>
          <View style={styles.column}>
            <Controller
              control={control}
              name="maxPowerKw"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Max power (kW)"
                  placeholder="3"
                  keyboardType="decimal-pad"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.maxPowerKw?.message}
                />
              )}
            />
          </View>
          <View style={styles.column}>
            <Controller
              control={control}
              name="pricePerKwh"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Rate per kWh (₹, optional)"
                  placeholder="18"
                  keyboardType="decimal-pad"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.pricePerKwh?.message}
                />
              )}
            />
          </View>
        </View>
        {connectors.length === 0 ? (
          <Text style={styles.fieldError}>Select at least one connector.</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Availability</Text>
        <Controller
          control={control}
          name="is24x7"
          render={({ field: { onChange, value } }) => (
            <Pressable style={styles.switchRow} onPress={() => onChange(!value)}>
              <View style={styles.switchText}>
                <Text style={styles.switchLabel}>Open 24 × 7</Text>
                <Text style={styles.switchHint}>Drivers can request a charge at any hour.</Text>
              </View>
              <Switch value={value} onValueChange={onChange} color={palette.primary} />
            </Pressable>
          )}
        />

        {!is24x7 ? (
          <View style={styles.twoColumn}>
            <View style={styles.column}>
              <Controller
                control={control}
                name="openingTime"
                render={({ field: { onChange, onBlur, value } }) => (
                  <FormField
                    label="Opens at"
                    placeholder="08:00"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.openingTime?.message}
                    hint="24-hour format"
                  />
                )}
              />
            </View>
            <View style={styles.column}>
              <Controller
                control={control}
                name="closingTime"
                render={({ field: { onChange, onBlur, value } }) => (
                  <FormField
                    label="Closes at"
                    placeholder="22:00"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.closingTime?.message}
                    hint="24-hour format"
                  />
                )}
              />
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Amenities</Text>
        {(
          [
            { key: 'hasParking', label: 'Parking available' },
            { key: 'hasRestroom', label: 'Restroom' },
            { key: 'hasWifi', label: 'Wi-Fi' },
            { key: 'hasCctv', label: 'CCTV monitored' },
          ] as const
        ).map((amenity) => (
          <Controller
            key={amenity.key}
            control={control}
            name={amenity.key}
            render={({ field: { onChange, value } }) => (
              <Pressable style={styles.switchRow} onPress={() => onChange(!value)}>
                <Text style={styles.switchLabel}>{amenity.label}</Text>
                <Switch value={value} onValueChange={onChange} color={palette.primary} />
              </Pressable>
            )}
          />
        ))}
      </View>

      {/* SUBSCRIPTION PLAN SELECTION */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialCommunityIcons name="crown" size={22} color="#D97706" />
            <Text style={styles.cardTitle}>Choose Subscription Plan</Text>
          </View>
          <View style={styles.planRequiredBadge}>
            <Text style={styles.planRequiredText}>Mandatory</Text>
          </View>
        </View>

        <Text style={styles.cardSubtitle}>
          Select a visibility tier. Higher plans get 1st preference when drivers search nearby, with increased visibility radius and review boost.
        </Text>

        <View style={styles.plansContainer}>
          {plans.map((plan) => {
            const isSelected = selectedPlanKey === plan.key;
            return (
              <Pressable
                key={plan.key}
                onPress={() => setSelectedPlanKey(plan.key)}
                style={[
                  styles.planCard,
                  isSelected && styles.planCardActive,
                  plan.key === 'YEAR_1' && styles.planCardBest,
                ]}
              >
                <View style={styles.planCardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.planBadgeRow}>
                      <Text style={styles.planName}>{plan.name}</Text>
                      {plan.badge ? (
                        <View style={[styles.planBadge, { backgroundColor: plan.badgeColor ?? palette.primary }]}>
                          <Text style={styles.planBadgeLabel}>{plan.badge}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.planValidity}>{plan.durationLabel}</Text>
                  </View>
                  <View style={styles.planPriceBox}>
                    <Text style={styles.planPrice}>{plan.priceFormatted}</Text>
                  </View>
                </View>

                <View style={styles.planRadiusPill}>
                  <MaterialCommunityIcons name="radar" size={15} color={isSelected ? '#059669' : palette.muted} />
                  <Text style={[styles.planRadiusText, isSelected && { color: '#065F46', fontWeight: '800' }]}>
                    Visible to drivers: {plan.visibilityRange}
                  </Text>
                </View>

                <View style={styles.planFeaturesList}>
                  {plan.features.map((feature, idx) => (
                    <View key={idx} style={styles.planFeatureRow}>
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={14}
                        color={isSelected ? '#059669' : '#9CA3AF'}
                      />
                      <Text style={[styles.planFeatureText, isSelected && { color: palette.ink }]}>
                        {feature}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.planRadioRow}>
                  <View style={[styles.planRadioCircle, isSelected && styles.planRadioCircleActive]}>
                    {isSelected ? <View style={styles.planRadioInner} /> : null}
                  </View>
                  <Text style={[styles.planRadioText, isSelected && { color: '#059669', fontWeight: '800' }]}>
                    {isSelected ? 'Selected Plan' : 'Tap to select'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.reviewNote}>
        <MaterialCommunityIcons name="shield-check-outline" size={20} color="#059669" />
        <Text style={styles.reviewText}>
          Administrator Approval Required: Both your host photo and charging point photo will be reviewed by the admin team. Once approved, your station becomes available on the live map for drivers.
        </Text>
      </View>

      <Button
        mode="contained"
        icon="credit-card-check"
        buttonColor="#059669"
        onPress={() => {
          void handleSubmit(submit)();
        }}
        loading={busy}
        disabled={busy}
        style={styles.submit}
        contentStyle={styles.buttonContent}
      >
        Proceed to Payment ({selectedPlan.priceFormatted})
      </Button>

      <LocationPickerModal
        visible={mapModalVisible}
        initialLocation={{
          latitude: Number(latValue) || 16.5002,
          longitude: Number(lngValue) || 80.648,
          addressLine: addressValue,
          city: cityValue,
          state: stateValue,
          pincode: pincodeValue,
        }}
        onDismiss={() => setMapModalVisible(false)}
        onConfirm={handleLocationPicked}
      />

      <Portal>
        <Dialog
          visible={checkoutModalVisible}
          onDismiss={() => {
            if (!paying) setCheckoutModalVisible(false);
          }}
          style={styles.checkoutDialog}
        >
          <View style={styles.checkoutHead}>
            <View style={styles.checkoutHeadLeft}>
              <View style={styles.gatewayShieldBox}>
                <MaterialCommunityIcons name="shield-lock" size={22} color="#059669" />
              </View>
              <View>
                <Text style={styles.checkoutTitle}>Payment Gateway</Text>
                <Text style={styles.checkoutSubtitle}>Instant Provider Plan Activation</Text>
              </View>
            </View>
            <Pressable
              disabled={paying}
              onPress={() => setCheckoutModalVisible(false)}
              hitSlop={8}
              style={styles.closeModalBtn}
            >
              <MaterialCommunityIcons name="close" size={20} color={palette.muted} />
            </Pressable>
          </View>

          <Dialog.Content style={styles.checkoutContent}>
            {/* Bill Summary */}
            <View style={styles.checkoutOrderCard}>
              <View style={styles.orderCardRow}>
                <View>
                  <Text style={styles.orderPlanName}>{selectedPlan.name}</Text>
                  <Text style={styles.orderPlanMeta}>
                    {selectedPlan.durationLabel} · {selectedPlan.visibilityRange}
                  </Text>
                </View>
                <Text style={styles.orderPrice}>{selectedPlan.priceFormatted}</Text>
              </View>
              <View style={styles.orderDivider} />
              <View style={styles.orderTotalRow}>
                <Text style={styles.orderTotalLabel}>Total Amount Due:</Text>
                <Text style={styles.orderTotalAmount}>{selectedPlan.priceFormatted}</Text>
              </View>
            </View>

            {/* Payment Method Selector */}
            <Text style={styles.paymentMethodTitle}>Select Payment Method:</Text>
            <View style={styles.methodTabRow}>
              <Pressable
                onPress={() => setPaymentMethod('UPI')}
                style={[styles.methodTab, paymentMethod === 'UPI' && styles.methodTabActive]}
              >
                <MaterialCommunityIcons
                  name="cellphone-nfc"
                  size={18}
                  color={paymentMethod === 'UPI' ? '#059669' : palette.muted}
                />
                <Text style={[styles.methodTabText, paymentMethod === 'UPI' && styles.methodTabTextActive]}>
                  UPI App
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setPaymentMethod('QR')}
                style={[styles.methodTab, paymentMethod === 'QR' && styles.methodTabActive]}
              >
                <MaterialCommunityIcons
                  name="qrcode-scan"
                  size={18}
                  color={paymentMethod === 'QR' ? '#059669' : palette.muted}
                />
                <Text style={[styles.methodTabText, paymentMethod === 'QR' && styles.methodTabTextActive]}>
                  QR Scanner
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setPaymentMethod('CARD')}
                style={[styles.methodTab, paymentMethod === 'CARD' && styles.methodTabActive]}
              >
                <MaterialCommunityIcons
                  name="credit-card"
                  size={18}
                  color={paymentMethod === 'CARD' ? '#059669' : palette.muted}
                />
                <Text style={[styles.methodTabText, paymentMethod === 'CARD' && styles.methodTabTextActive]}>
                  Card / Net
                </Text>
              </Pressable>
            </View>

            {paymentMethod === 'UPI' ? (
              <View style={styles.upiContainer}>
                <Text style={styles.upiSubText}>Pay using any installed UPI app:</Text>
                <View style={styles.upiAppRow}>
                  <View style={styles.upiAppPill}>
                    <Text style={styles.upiAppText}>GPay</Text>
                  </View>
                  <View style={styles.upiAppPill}>
                    <Text style={styles.upiAppText}>PhonePe</Text>
                  </View>
                  <View style={styles.upiAppPill}>
                    <Text style={styles.upiAppText}>Paytm</Text>
                  </View>
                  <View style={styles.upiAppPill}>
                    <Text style={styles.upiAppText}>BHIM</Text>
                  </View>
                </View>
              </View>
            ) : paymentMethod === 'QR' ? (
              <View style={styles.qrContainer}>
                <Image
                  source={{
                    uri: `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=upi://pay?pa=evrescue.plans@upi%26pn=EVRescue%26am=${selectedPlan.price}%26cu=INR`,
                  }}
                  style={styles.qrImage}
                />
                <Text style={styles.qrInstruction}>
                  Scan with GPay, PhonePe or Paytm to pay {selectedPlan.priceFormatted}
                </Text>
              </View>
            ) : (
              <View style={styles.cardContainer}>
                <View style={styles.cardMockField}>
                  <MaterialCommunityIcons name="credit-card-outline" size={18} color={palette.muted} />
                  <Text style={styles.cardMockText}>4242 •••• •••• 4242</Text>
                  <Text style={styles.cardMockExp}>12/28</Text>
                </View>
                <Text style={styles.cardSecureHint}>256-bit encrypted Razorpay card processing</Text>
              </View>
            )}

            <Button
              mode="contained"
              icon="lock-check"
              buttonColor="#059669"
              loading={paying}
              disabled={paying}
              onPress={handleCompletePaymentAndRegister}
              style={styles.payNowBtn}
              contentStyle={{ height: 48 }}
              labelStyle={{ fontWeight: '800', fontSize: 15 }}
            >
              {paying ? 'Processing Payment…' : `Pay ${selectedPlan.priceFormatted} & Activate`}
            </Button>
          </Dialog.Content>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: 110 },
  hero: {
    backgroundColor: palette.primaryDark,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  heroText: { fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 6, lineHeight: 19 },
  checking: { fontSize: 12, color: palette.muted, marginBottom: spacing.sm },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: palette.ink, marginBottom: spacing.md },
  cardSubtitle: { fontSize: 12.5, color: palette.muted, marginTop: -8, marginBottom: spacing.md, lineHeight: 18 },
  photoRow: { flexDirection: 'row', gap: spacing.md },
  photoBox: { flex: 1, backgroundColor: '#FAFBFB', borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  photoLabel: { fontSize: 11, fontWeight: '700', color: palette.ink, marginBottom: 6, textAlign: 'center' },
  photoContainer: { width: '100%', height: 110, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: '#EDF2EE', alignItems: 'center', justifyContent: 'center' },
  photoThumb: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoUploadPrompt: { fontSize: 10.5, color: palette.muted, fontWeight: '600' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: palette.ink, marginBottom: 7, marginLeft: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  chip: { backgroundColor: '#F4F7F5', borderWidth: 1, borderColor: palette.border },
  chipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { fontSize: 11.5, fontWeight: '700', color: palette.muted },
  chipTextActive: { color: '#FFFFFF' },
  fieldError: { fontSize: 11.5, color: palette.danger, marginTop: -8, marginBottom: spacing.sm, marginLeft: 2 },
  twoColumn: { flexDirection: 'row', gap: spacing.sm },
  column: { flex: 1 },
  locationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  benzCircleBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  benzCircleBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
  },
  locationSummaryBox: {
    backgroundColor: '#F8FAF9',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  locationSummaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  summaryIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryAddressText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.ink,
  },
  summaryCoordsText: {
    fontSize: 11,
    color: palette.muted,
    marginTop: 2,
  },
  miniMapWrap: {
    width: '100%',
    height: 120,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: palette.border,
  },
  miniMapOverlayBtn: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(5, 150, 105, 0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  miniMapOverlayText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  locationActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  pinMapBtn: {
    flex: 1,
    borderRadius: radius.md,
  },
  gpsLocateBtn: {
    borderRadius: radius.md,
    borderColor: palette.border,
  },
  manualEditToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  manualEditToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primary,
  },
  manualFieldsWrap: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  locationBox: {
    backgroundColor: '#F4F8F6',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  locationTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationTitle: { fontSize: 13, fontWeight: '800', color: palette.ink },
  locationHint: { fontSize: 11.5, color: palette.muted, marginTop: 5, lineHeight: 16 },
  locationWarn: { fontSize: 11.5, color: '#8A6100', marginTop: 6, lineHeight: 16 },
  locationButton: { alignSelf: 'flex-start', marginTop: spacing.sm, borderColor: palette.border },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 6,
  },
  switchText: { flex: 1 },
  switchLabel: { fontSize: 13.5, fontWeight: '700', color: palette.ink },
  switchHint: { fontSize: 11.5, color: palette.muted, marginTop: 2 },
  reviewNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: palette.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  reviewText: { flex: 1, fontSize: 12, color: palette.primaryDark, lineHeight: 18 },
  submit: { marginTop: spacing.lg, borderRadius: radius.md },
  buttonContent: { paddingVertical: 6 },
  existingCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  existingIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  existingTitle: { fontSize: 20, fontWeight: '800', color: palette.ink, textAlign: 'center' },
  existingMeta: { fontSize: 13, color: palette.muted, marginTop: 4, textAlign: 'center' },
  existingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  existingStatusLabel: { fontSize: 13, fontWeight: '700', color: palette.ink },
  existingNote: { fontSize: 12.5, color: palette.muted, textAlign: 'center', marginTop: spacing.md, lineHeight: 18 },
  existingButton: { marginTop: spacing.lg, borderRadius: radius.md, alignSelf: 'stretch' },
  planRequiredBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  planRequiredText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#92400E',
  },
  plansContainer: {
    gap: 12,
    marginTop: 4,
  },
  planCard: {
    backgroundColor: '#FAFBFB',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: palette.border,
  },
  planCardActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#059669',
  },
  planCardBest: {
    shadowColor: '#D97706',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  planCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  planBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  planName: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.ink,
  },
  planBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  planBadgeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  planValidity: {
    fontSize: 12,
    color: palette.muted,
    marginTop: 2,
  },
  planPriceBox: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontSize: 20,
    fontWeight: '900',
    color: '#059669',
  },
  planRadiusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(5, 150, 105, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  planRadiusText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  planFeaturesList: {
    marginTop: 10,
    gap: 5,
  },
  planFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planFeatureText: {
    fontSize: 11.5,
    color: palette.muted,
  },
  planRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  planRadioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRadioCircleActive: {
    borderColor: '#059669',
  },
  planRadioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#059669',
  },
  planRadioText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: palette.muted,
  },
  checkoutDialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    paddingVertical: spacing.sm,
    maxWidth: 420,
    alignSelf: 'center',
    width: '94%',
  },
  checkoutHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  checkoutHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gatewayShieldBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.ink,
  },
  checkoutSubtitle: {
    fontSize: 11,
    color: palette.muted,
  },
  closeModalBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  checkoutOrderCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  orderCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  orderPlanName: {
    fontSize: 15,
    fontWeight: '800',
    color: palette.ink,
  },
  orderPlanMeta: {
    fontSize: 11.5,
    color: palette.muted,
    marginTop: 2,
  },
  orderPrice: {
    fontSize: 17,
    fontWeight: '800',
    color: palette.ink,
  },
  orderDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  orderTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.ink,
  },
  orderTotalAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669',
  },
  paymentMethodTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: palette.ink,
    marginTop: 14,
    marginBottom: 8,
  },
  methodTabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  methodTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  methodTabActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  methodTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.muted,
  },
  methodTabTextActive: {
    color: '#059669',
  },
  upiContainer: {
    marginTop: 12,
    backgroundColor: '#F8FAF9',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  upiSubText: {
    fontSize: 11.5,
    color: palette.muted,
    marginBottom: 8,
  },
  upiAppRow: {
    flexDirection: 'row',
    gap: 8,
  },
  upiAppPill: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.sm,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  upiAppText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: palette.ink,
  },
  qrContainer: {
    marginTop: 12,
    alignItems: 'center',
    backgroundColor: '#F8FAF9',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrImage: {
    width: 140,
    height: 140,
    borderRadius: 8,
  },
  qrInstruction: {
    fontSize: 11.5,
    color: palette.muted,
    marginTop: 8,
    textAlign: 'center',
  },
  cardContainer: {
    marginTop: 12,
    backgroundColor: '#F8FAF9',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardMockField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  cardMockText: {
    flex: 1,
    fontSize: 13,
    color: palette.ink,
    letterSpacing: 1,
  },
  cardMockExp: {
    fontSize: 12,
    color: palette.muted,
  },
  cardSecureHint: {
    fontSize: 10.5,
    color: '#059669',
    marginTop: 6,
    textAlign: 'center',
  },
  payNowBtn: {
    marginTop: 16,
    borderRadius: radius.md,
  },
});

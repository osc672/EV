import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import { Button, Chip, Dialog, Portal, Switch, TextInput } from 'react-native-paper';
import { router } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Loading } from '@/components/Loading';
import { LocationPickerModal, LocationResult } from '@/components/LocationPickerModal';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { useBookings, useUpdateBookingStatus } from '@/hooks/useBookings';
import {
  useAddDocument,
  useMyProvider,
  useProviderDocuments,
  useProviderStats,
  useToggleOpen,
  useUpdateProvider,
} from '@/hooks/useProviders';
import { getErrorMessage } from '@/lib/api';
import { CONNECTOR_LABELS, PROVIDER_TYPE_LABELS } from '@/lib/config';
import { uploadsApi } from '@/lib/endpoints';
import { formatCurrency, formatDateTime, timeAgo } from '@/lib/format';
import { palette, radius, spacing } from '@/theme';
import type { Booking, DocumentType } from '@/types/api';
import AppMapView, { Marker } from '@/components/AppMapView';

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'ID_PROOF', label: 'ID proof' },
  { value: 'ADDRESS_PROOF', label: 'Address proof' },
  { value: 'OWNERSHIP_PROOF', label: 'Ownership proof' },
  { value: 'ELECTRICITY_BILL', label: 'Electricity bill' },
  { value: 'BUSINESS_LICENSE', label: 'Business licence' },
  { value: 'CHARGER_PHOTO', label: 'Charger photo' },
  { value: 'SITE_PHOTO', label: 'Site photo' },
  { value: 'OTHER', label: 'Payment QR Scanner' },
];

const DOCUMENT_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_TYPES.map((item) => [item.value, item.label]),
);

export default function ProviderDashboardScreen() {
  const {
    data: provider,
    isLoading,
    isError,
    refetch: refetchProvider,
    isRefetching,
  } = useMyProvider();
  const { data: stats, refetch: refetchStats } = useProviderStats();
  const { data: documents, refetch: refetchDocuments } = useProviderDocuments();
  const { data: bookings, refetch: refetchBookings } = useBookings({ role: 'provider' });
  const toggleOpen = useToggleOpen();
  const updateProvider = useUpdateProvider();
  const addDocument = useAddDocument();
  const updateStatus = useUpdateBookingStatus();

  const [docType, setDocType] = useState<DocumentType>('ID_PROOF');
  const [uploading, setUploading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [price, setPrice] = useState('');
  const [power, setPower] = useState('');
  const [openTime, setOpenTime] = useState('08:00');
  const [closeTime, setCloseTime] = useState('22:00');
  const [savingEdit, setSavingEdit] = useState(false);

  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);

  const handleUpdateLocation = async (result: LocationResult) => {
    setSavingLocation(true);
    try {
      await updateProvider.mutateAsync({
        latitude: result.latitude,
        longitude: result.longitude,
        ...(result.addressLine ? { addressLine: result.addressLine } : {}),
        ...(result.city ? { city: result.city } : {}),
        ...(result.state ? { state: result.state } : {}),
        ...(result.pincode ? { pincode: result.pincode } : {}),
      });
      await refetchProvider();
      Alert.alert(
        'Station Location Updated! ✓',
        'Your charging point location and Google Map pin have been updated successfully.',
      );
    } catch (error) {
      Alert.alert('Could not update location', getErrorMessage(error));
    } finally {
      setSavingLocation(false);
    }
  };

  const pending = useMemo(
    () => (bookings?.items ?? []).filter((booking) => booking.status === 'PENDING').slice(0, 5),
    [bookings],
  );

  const refreshAll = async () => {
    await Promise.all([
      refetchProvider(),
      refetchStats(),
      refetchDocuments(),
      refetchBookings(),
    ]);
  };

  const setOpen = async (isOpenNow: boolean) => {
    try {
      await toggleOpen.mutateAsync(isOpenNow);
    } catch (error) {
      Alert.alert('Could not update availability', getErrorMessage(error));
    }
  };

  const openEdit = () => {
    if (!provider) return;
    setPrice(provider.pricePerKwh ? String(Number(provider.pricePerKwh)) : '');
    setPower(String(provider.maxPowerKw));
    setOpenTime(provider.openingTime);
    setCloseTime(provider.closingTime);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    const powerValue = Number(power);
    if (!Number.isFinite(powerValue) || powerValue < 1 || powerValue > 1000) {
      Alert.alert('Check max power', 'Enter a value between 1 and 1000 kW.');
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(openTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closeTime)) {
      Alert.alert('Check hours', 'Use 24-hour HH:MM, for example 08:00 and 22:00.');
      return;
    }
    setSavingEdit(true);
    try {
      await updateProvider.mutateAsync({
        maxPowerKw: powerValue,
        openingTime: openTime,
        closingTime: closeTime,
        pricePerKwh: price ? Number(price) : undefined,
      });
      setEditOpen(false);
    } catch (error) {
      Alert.alert('Could not update', getErrorMessage(error));
    } finally {
      setSavingEdit(false);
    }
  };

  const accept = async (booking: Booking) => {
    setActionId(booking.id);
    try {
      await updateStatus.mutateAsync({ id: booking.id, body: { status: 'CONFIRMED' } });
    } catch (error) {
      Alert.alert('Could not accept request', getErrorMessage(error));
    } finally {
      setActionId(null);
    }
  };

  const decline = (booking: Booking) => {
    Alert.alert('Decline request', `Decline ${booking.driver?.fullName ?? 'this driver'}?`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          setActionId(booking.id);
          try {
            await updateStatus.mutateAsync({
              id: booking.id,
              body: { status: 'CANCELLED', cancelReason: 'Declined by the charging host' },
            });
          } catch (error) {
            Alert.alert('Could not decline', getErrorMessage(error));
          } finally {
            setActionId(null);
          }
        },
      },
    ]);
  };

  const pickDocument = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow photo access to upload verification documents.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.length) return;

      setUploading(true);
      const uploaded = await uploadsApi.image(result.assets[0].uri, 'documents');
      await addDocument.mutateAsync({ type: docType, fileUrl: uploaded.url });
      Alert.alert('Document uploaded', 'Your document is queued for review.');
    } catch (error) {
      Alert.alert('Upload failed', getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <Loading label="Loading your charging business…" />;

  if (isError || !provider) {
    return (
      <View style={styles.errorWrap}>
        <EmptyState
          icon="ev-station"
          title="No charging point yet"
          message="Create your charging point profile to start receiving driver requests."
          actionLabel="Set up charging point"
          onAction={() => router.replace('/provider-setup')}
        />
      </View>
    );
  }

  const approved = provider.verificationStatus === 'APPROVED';

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => void refreshAll()} tintColor={palette.primary} />
      }
    >
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroBadges}>
            <View style={styles.typePill}>
              <Text style={styles.typeText}>
                {PROVIDER_TYPE_LABELS[provider.providerType] ?? provider.providerType}
              </Text>
            </View>
            <StatusBadge status={provider.verificationStatus} />
          </View>
          <Pressable
            onPress={() => router.push(`/provider/${provider.id}`)}
            style={styles.viewButton}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="eye-outline" size={18} color={palette.primary} />
          </Pressable>
        </View>
        <Text style={styles.businessName}>{provider.businessName}</Text>
        <Text style={styles.heroMeta}>
          {provider.addressLine}, {provider.city}
        </Text>

        <View style={styles.openRow}>
          <View style={styles.openTextWrap}>
            <Text style={styles.openTitle}>{provider.isOpenNow ? 'Accepting requests' : 'Paused'}</Text>
            <Text style={styles.openHint}>
              {provider.isOpenNow
                ? 'Drivers can request this charging point right now.'
                : 'Your point is hidden from new requests.'}
            </Text>
          </View>
          <Switch
            value={provider.isOpenNow}
            onValueChange={setOpen}
            color={palette.primary}
            disabled={toggleOpen.isPending}
          />
        </View>
      </View>

      {!approved ? (
        <View style={styles.verifyBanner}>
          <MaterialCommunityIcons name="shield-alert-outline" size={20} color="#8A6100" />
          <View style={styles.verifyTextWrap}>
            <Text style={styles.verifyTitle}>
              {provider.verificationStatus === 'REJECTED'
                ? 'Verification needs changes'
                : provider.verificationStatus === 'SUSPENDED'
                  ? 'Charging point suspended'
                  : 'Verification in progress'}
            </Text>
            <Text style={styles.verifyText}>
              {provider.verificationNote ??
                'Upload an ID proof and a charger photo below. Drivers cannot book until an administrator approves your point.'}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <StatCard icon="calendar-today" label="Today" value={stats?.todayBookings ?? 0} compact />
          <StatCard
            icon="clock-alert-outline"
            label="Pending"
            value={stats?.pendingRequests ?? 0}
            tone="warning"
            compact
          />
          <StatCard icon="calendar-month" label="This month" value={stats?.monthBookings ?? 0} compact />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            icon="cash-multiple"
            label="Revenue"
            value={formatCurrency(stats?.totalRevenue ?? 0)}
            tone="primary"
            compact
          />
          <StatCard
            icon="check-decagram"
            label="Completed"
            value={stats?.completedBookings ?? 0}
            tone="info"
            compact
          />
          <StatCard
            icon="star"
            label={`Rating ${stats?.rating ? stats.rating.toFixed(1) : '—'}`}
            value={stats?.totalReviews ?? 0}
            tone="warning"
            compact
          />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Incoming requests</Text>
        <Pressable onPress={() => router.push('/(app)/bookings')} hitSlop={8}>
          <Text style={styles.sectionAction}>All bookings</Text>
        </Pressable>
      </View>

      {pending.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialCommunityIcons name="calendar-check-outline" size={24} color={palette.primary} />
          <Text style={styles.emptyTitle}>No pending requests</Text>
          <Text style={styles.emptyText}>
            {approved
              ? 'New driver requests will appear here for you to accept.'
              : 'Once approved and open, requests will appear here.'}
          </Text>
        </View>
      ) : (
        pending.map((booking) => (
          <View key={booking.id} style={styles.requestCard}>
            <Pressable
              onPress={() => router.push(`/booking/${booking.id}`)}
              style={({ pressed }) => [styles.requestBody, pressed && styles.pressed]}
            >
              <View style={styles.requestTop}>
                <View style={styles.requestAvatar}>
                  <Text style={styles.requestAvatarText}>
                    {(booking.driver?.fullName ?? 'D').slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.requestInfo}>
                  <Text style={styles.requestName}>{booking.driver?.fullName ?? 'Driver'}</Text>
                  <Text style={styles.requestMeta}>
                    {CONNECTOR_LABELS[booking.connectorType] ?? booking.connectorType}
                    {booking.vehicle ? ` · ${booking.vehicle.make} ${booking.vehicle.model}` : ''}
                  </Text>
                </View>
                <Text style={styles.requestTime}>{timeAgo(booking.createdAt)}</Text>
              </View>
              <View style={styles.requestSchedule}>
                <MaterialCommunityIcons name="calendar-clock" size={15} color={palette.muted} />
                <Text style={styles.requestScheduleText}>{formatDateTime(booking.scheduledAt)}</Text>
              </View>
              {booking.notes ? (
                <Text style={styles.requestNotes} numberOfLines={2}>
                  “{booking.notes}”
                </Text>
              ) : null}
            </Pressable>
            <View style={styles.requestActions}>
              <Button
                mode="contained"
                compact
                loading={actionId === booking.id}
                disabled={actionId === booking.id}
                onPress={() => void accept(booking)}
                style={styles.acceptButton}
              >
                Accept
              </Button>
              <Button
                mode="outlined"
                compact
                disabled={actionId === booking.id}
                onPress={() => decline(booking)}
                style={styles.declineButton}
                textColor={palette.danger}
              >
                Decline
              </Button>
            </View>
          </View>
        ))
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Verification documents</Text>
        <Text style={styles.documentCount}>{documents?.length ?? 0} uploaded</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardHint}>Choose a document type, then pick a photo from your library.</Text>
        <View style={styles.docChips}>
          {DOCUMENT_TYPES.map((item) => (
            <Chip
              key={item.value}
              selected={docType === item.value}
              onPress={() => setDocType(item.value)}
              style={[styles.chip, docType === item.value && styles.chipActive]}
              textStyle={[styles.chipText, docType === item.value && styles.chipTextActive]}
              showSelectedOverlay={false}
            >
              {item.label}
            </Chip>
          ))}
        </View>
        <Button
          mode="contained-tonal"
          icon="camera-plus-outline"
          loading={uploading}
          disabled={uploading}
          onPress={() => void pickDocument()}
          style={styles.uploadButton}
        >
          Upload {DOCUMENT_LABELS[docType] ?? 'document'}
        </Button>

        {documents && documents.length > 0 ? (
          <View style={styles.docList}>
            {documents.map((document) => (
              <View key={document.id} style={styles.docRow}>
                <View style={styles.docIcon}>
                  <MaterialCommunityIcons name="file-image-outline" size={18} color={palette.primary} />
                </View>
                <View style={styles.docInfo}>
                  <Text style={styles.docName}>{DOCUMENT_LABELS[document.type] ?? document.type}</Text>
                  <Text style={styles.docDate}>{timeAgo(document.createdAt)}</Text>
                  {document.rejectionReason ? (
                    <Text style={styles.docRejection}>{document.rejectionReason}</Text>
                  ) : null}
                </View>
                <StatusBadge status={document.status} />
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noDocs}>No documents uploaded yet.</Text>
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your charging point</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Rate</Text>
          <Text style={styles.detailValue}>
            {provider.pricePerKwh ? `${formatCurrency(provider.pricePerKwh)} / kWh` : 'Free'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Max power</Text>
          <Text style={styles.detailValue}>{provider.maxPowerKw} kW</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Hours</Text>
          <Text style={styles.detailValue}>
            {provider.is24x7 ? '24 × 7' : `${provider.openingTime} – ${provider.closingTime}`}
          </Text>
        </View>
        <View style={styles.connectorRow}>
          {provider.connectorTypes.map((connector) => (
            <View key={connector} style={styles.connectorChip}>
              <Text style={styles.connectorText}>{CONNECTOR_LABELS[connector] ?? connector}</Text>
            </View>
          ))}
        </View>
        <Button
          mode="outlined"
          icon="pencil-outline"
          onPress={openEdit}
          style={styles.editButton}
        >
          Edit charging point
        </Button>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Station location & map pin</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.locationHeaderRow}>
          <View style={styles.locationIconWrap}>
            <MaterialCommunityIcons name="map-marker-radius" size={22} color={palette.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.locationCardAddress}>
              {provider.addressLine}, {provider.city}
            </Text>
            <Text style={styles.locationCardCoords}>
              {provider.state} · PIN {provider.pincode}
            </Text>
            {provider.location ? (
              <Text style={styles.locationCardLatLong}>
                📍 Lat: {provider.location.latitude.toFixed(5)}, Lng: {provider.location.longitude.toFixed(5)}
              </Text>
            ) : null}
          </View>
        </View>

        {provider.location ? (
          <View style={styles.dashboardMapWrap}>
            <AppMapView
              style={StyleSheet.absoluteFill}
              region={{
                latitude: provider.location.latitude,
                longitude: provider.location.longitude,
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
                  latitude: provider.location.latitude,
                  longitude: provider.location.longitude,
                }}
              />
            </AppMapView>
          </View>
        ) : null}

        <Button
          mode="contained-tonal"
          icon="map-marker-radius-outline"
          loading={savingLocation}
          disabled={savingLocation}
          onPress={() => setLocationModalOpen(true)}
          style={styles.locationEditButton}
        >
          Edit Location & Pin on Google Map
        </Button>
      </View>
      </ScrollView>

      <Portal>
        <Dialog visible={editOpen} onDismiss={() => setEditOpen(false)} style={styles.dialog}>
          <Dialog.Title>Edit charging point</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Max power (kW)"
              value={power}
              onChangeText={setPower}
              keyboardType="decimal-pad"
              style={styles.dialogInput}
              outlineColor={palette.border}
              activeOutlineColor={palette.primary}
            />
            <TextInput
              mode="outlined"
              label="Rate per kWh (₹, optional)"
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              style={styles.dialogInput}
              outlineColor={palette.border}
              activeOutlineColor={palette.primary}
            />
            <View style={styles.timeRow}>
              <TextInput
                mode="outlined"
                label="Opens at"
                value={openTime}
                onChangeText={setOpenTime}
                style={[styles.dialogInput, styles.timeInput]}
                outlineColor={palette.border}
                activeOutlineColor={palette.primary}
              />
              <TextInput
                mode="outlined"
                label="Closes at"
                value={closeTime}
                onChangeText={setCloseTime}
                style={[styles.dialogInput, styles.timeInput]}
                outlineColor={palette.border}
                activeOutlineColor={palette.primary}
              />
            </View>
            <Text style={styles.dialogHint}>
              Drivers see these values on your listing immediately. You can also edit your station location and map pin directly on the dashboard.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditOpen(false)}>Cancel</Button>
            <Button loading={savingEdit} disabled={savingEdit} onPress={() => void saveEdit()}>
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <LocationPickerModal
        visible={locationModalOpen}
        initialLocation={{
          latitude: provider.location?.latitude,
          longitude: provider.location?.longitude,
          addressLine: provider.addressLine,
          city: provider.city,
          state: provider.state,
          pincode: provider.pincode,
        }}
        onDismiss={() => setLocationModalOpen(false)}
        onConfirm={handleUpdateLocation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: 110 },
  errorWrap: { flex: 1, justifyContent: 'center' },
  hero: {
    backgroundColor: palette.primaryDark,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroBadges: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  typePill: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  typeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  viewButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessName: { fontSize: 23, fontWeight: '800', color: '#FFFFFF', marginTop: spacing.md },
  heroMeta: { fontSize: 12.5, color: 'rgba(255,255,255,0.72)', marginTop: 4 },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  openTextWrap: { flex: 1 },
  openTitle: { fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' },
  openHint: { fontSize: 11.5, color: 'rgba(255,255,255,0.72)', marginTop: 2, lineHeight: 16 },
  verifyBanner: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: '#FFF4D6',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  verifyTextWrap: { flex: 1 },
  verifyTitle: { fontSize: 13, fontWeight: '800', color: '#6B4B00' },
  verifyText: { fontSize: 11.5, color: '#8A6100', marginTop: 3, lineHeight: 16 },
  statsGrid: { marginTop: spacing.lg, gap: spacing.sm },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: palette.ink },
  sectionAction: { fontSize: 12.5, fontWeight: '800', color: palette.primary },
  emptyCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: palette.ink, marginTop: spacing.sm },
  emptyText: { fontSize: 12, color: palette.muted, textAlign: 'center', marginTop: 4, lineHeight: 17 },
  requestCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  requestBody: { padding: spacing.md },
  pressed: { opacity: 0.92 },
  requestTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  requestAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestAvatarText: { fontSize: 15, fontWeight: '800', color: palette.primaryDark },
  requestInfo: { flex: 1 },
  requestName: { fontSize: 14, fontWeight: '800', color: palette.ink },
  requestMeta: { fontSize: 11.5, color: palette.muted, marginTop: 2 },
  requestTime: { fontSize: 11, color: palette.muted },
  requestSchedule: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  requestScheduleText: { fontSize: 12, color: palette.muted, fontWeight: '600' },
  requestNotes: { fontSize: 12, color: palette.muted, fontStyle: 'italic', marginTop: 6, lineHeight: 17 },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  acceptButton: { flex: 1, borderRadius: radius.sm },
  declineButton: { flex: 1, borderRadius: radius.sm, borderColor: '#F0C9C9' },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
  },
  cardHint: { fontSize: 12, color: palette.muted, lineHeight: 17 },
  docChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md },
  chip: { backgroundColor: '#F4F7F5', borderWidth: 1, borderColor: palette.border },
  chipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { fontSize: 11, fontWeight: '700', color: palette.muted },
  chipTextActive: { color: '#FFFFFF' },
  uploadButton: { marginTop: spacing.md, borderRadius: radius.md },
  docList: { marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: '#F0F4F2' },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F7F5',
  },
  docIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: { flex: 1 },
  docName: { fontSize: 13, fontWeight: '700', color: palette.ink },
  docDate: { fontSize: 11, color: palette.muted, marginTop: 1 },
  docRejection: { fontSize: 11, color: palette.danger, marginTop: 2 },
  noDocs: { fontSize: 12, color: palette.muted, marginTop: spacing.md },
  documentCount: { fontSize: 12, color: palette.muted, fontWeight: '600' },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailLabel: { fontSize: 12.5, color: palette.muted, fontWeight: '600' },
  detailValue: { fontSize: 13, color: palette.ink, fontWeight: '700' },
  connectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  connectorChip: { backgroundColor: '#EFF5F2', paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
  connectorText: { fontSize: 11, fontWeight: '700', color: '#3C5449' },
  editButton: { marginTop: spacing.md, borderRadius: radius.md, borderColor: palette.border },
  locationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  locationIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationCardAddress: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.ink,
  },
  locationCardCoords: {
    fontSize: 12,
    color: palette.muted,
    marginTop: 2,
  },
  locationCardLatLong: {
    fontSize: 11,
    color: palette.primaryDark,
    marginTop: 2,
    fontWeight: '600',
  },
  dashboardMapWrap: {
    width: '100%',
    height: 130,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  locationEditButton: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
  },
  dialog: { borderRadius: radius.lg, backgroundColor: palette.surface },
  dialogInput: { backgroundColor: palette.surface, marginBottom: spacing.md },
  timeRow: { flexDirection: 'row', gap: spacing.sm },
  timeInput: { flex: 1 },
  dialogHint: { fontSize: 11.5, color: palette.muted, lineHeight: 16 },
});

import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, Chip, SegmentedButtons } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { useBookings } from '@/hooks/useBookings';
import { CONNECTOR_LABELS } from '@/lib/config';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/store/auth';
import { palette, radius, spacing } from '@/theme';
import type { Booking } from '@/types/api';

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'IN_PROGRESS', label: 'Charging' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function BookingsScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const user = useAuthStore((s) => s.user);
  const isProvider = user?.role === 'PROVIDER';
  const [role, setRole] = useState<'driver' | 'provider'>(isProvider ? 'provider' : 'driver');
  const [status, setStatus] = useState('ALL');

  const handleBack = () => {
    if (from === 'profile') {
      router.navigate('/(app)/profile');
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)');
    }
  };

  useEffect(() => {
    if (from !== 'profile') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.navigate('/(app)/profile');
      return true;
    });
    return () => sub.remove();
  }, [from]);

  const params = useMemo(
    () => ({ role, status: status === 'ALL' ? undefined : status }),
    [role, status],
  );
  const { data, isLoading, isError, refetch, isRefetching } = useBookings(params);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={palette.primary} />
      }
    >
      <View style={styles.headerRow}>
        {from === 'profile' ? (
          <Pressable onPress={handleBack} hitSlop={10} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={palette.ink} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{isProvider ? 'Station Requests' : 'Bookings'}</Text>
          <Text style={styles.subtitle}>
            {isProvider
              ? 'Manage incoming driver charging slots and active sessions.'
              : 'Your charging sessions and emergency reservations.'}
          </Text>
        </View>
      </View>

      {isProvider ? (
        <SegmentedButtons
          value={role}
          onValueChange={(next) => setRole(next as 'driver' | 'provider')}
          buttons={[
            { value: 'provider', label: 'Incoming Requests', icon: 'ev-station' },
            { value: 'driver', label: 'My Personal Charges', icon: 'car-electric' },
          ]}
          style={styles.segmented}
          theme={{ colors: { secondaryContainer: '#FEF3C7', onSecondaryContainer: '#92400E' } }}
        />
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {STATUS_FILTERS.map((filter) => {
          const active = status === filter.value;
          const activeBg = isProvider ? '#D97706' : palette.primary;
          return (
            <Chip
              key={filter.value}
              selected={active}
              onPress={() => setStatus(filter.value)}
              style={[
                styles.chip,
                active && { backgroundColor: activeBg, borderColor: activeBg },
              ]}
              textStyle={[styles.chipText, active && styles.chipTextActive]}
              showSelectedOverlay={false}
            >
              {filter.label}
            </Chip>
          );
        })}
      </ScrollView>

      {isLoading && !data ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : isError ? (
        <EmptyState
          icon="wifi-off"
          title="Could not load bookings"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon="calendar-blank-outline"
          title="No bookings yet"
          message={
            role === 'provider'
              ? 'When a driver requests a slot, it will appear here for confirmation.'
              : 'Find a charger near you and request your first emergency top-up.'
          }
          actionLabel={role === 'driver' ? 'Find a charger' : undefined}
          onAction={role === 'driver' ? () => router.push('/(app)') : undefined}
        />
      ) : (
        data.items.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            role={role}
            onPress={() => router.push(`/booking/${booking.id}`)}
          />
        ))
      )}
    </ScrollView>
  );
}

function BookingCard({
  booking,
  role,
  onPress,
}: {
  booking: Booking;
  role: 'driver' | 'provider';
  onPress: () => void;
}) {
  const title =
    role === 'provider'
      ? booking.driver?.fullName ?? 'Driver'
      : booking.provider?.businessName ?? 'Charging point';
  const amount = booking.totalAmount ?? booking.estimatedCost;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      android_ripple={{ color: '#E9F0EC' }}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.code}>{booking.code}</Text>
        <StatusBadge status={booking.status} />
      </View>

      <Text style={styles.cardTitle}>{title}</Text>

      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="calendar-clock" size={15} color={palette.muted} />
        <Text style={styles.metaText}>{formatDateTime(booking.scheduledAt)}</Text>
      </View>

      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="ev-plug-type2" size={15} color={palette.muted} />
        <Text style={styles.metaText}>
          {CONNECTOR_LABELS[booking.connectorType] ?? booking.connectorType}
        </Text>
        {booking.vehicle ? (
          <>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.metaText}>
              {booking.vehicle.make} {booking.vehicle.model}
            </Text>
          </>
        ) : null}
      </View>

      <View style={styles.cardFooter}>
        <View>
          <Text style={styles.amountLabel}>{booking.status === 'COMPLETED' ? 'Total' : 'Estimate'}</Text>
          <Text style={styles.amount}>{amount ? formatCurrency(amount) : '—'}</Text>
        </View>
        <View style={styles.detailButton}>
          <Text style={styles.detailText}>Details</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={palette.primary} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: 54, paddingBottom: 120 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 26, fontWeight: '800', color: palette.ink },
  subtitle: { fontSize: 13.5, color: palette.muted, marginTop: 4 },
  segmented: { marginTop: spacing.lg },
  filterRow: { gap: spacing.sm, paddingVertical: spacing.lg },
  chip: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  chipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { fontSize: 12.5, fontWeight: '700', color: palette.muted },
  chipTextActive: { color: '#FFFFFF' },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardPressed: { opacity: 0.92 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  code: { fontSize: 12, fontWeight: '800', color: palette.muted, letterSpacing: 0.5 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: palette.ink, marginTop: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  metaText: { fontSize: 12.5, color: palette.muted, fontWeight: '600' },
  dot: { color: palette.muted },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  amountLabel: { fontSize: 11, color: palette.muted, fontWeight: '600' },
  amount: { fontSize: 16, fontWeight: '800', color: palette.ink, marginTop: 1 },
  detailButton: { flexDirection: 'row', alignItems: 'center' },
  detailText: { fontSize: 12.5, fontWeight: '800', color: palette.primary },
});

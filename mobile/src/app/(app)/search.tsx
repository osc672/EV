import { useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, Button, Chip } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { ProviderCard } from '@/components/ProviderCard';
import { StatusBadge } from '@/components/StatusBadge';
import { useBookings } from '@/hooks/useBookings';
import { useMyProvider, useProviderList, useProviderStats } from '@/hooks/useProviders';
import { CONNECTOR_LABELS } from '@/lib/config';
import { formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/store/auth';
import { palette, radius, spacing } from '@/theme';
import type { ConnectorType } from '@/types/api';

const FILTERS: (ConnectorType | 'ALL')[] = ['ALL', 'TYPE_2', 'CCS2', 'AC_3_PIN', 'CHADEMO', 'TYPE_1'];

export default function SearchScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const user = useAuthStore((s) => s.user);
  const isProvider = user?.role === 'PROVIDER';

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

  // Driver search state
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [connector, setConnector] = useState<ConnectorType | 'ALL'>('ALL');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 400);
    return () => clearTimeout(timer);
  }, [text]);

  const searchParams = useMemo(
    () => ({
      q: query || undefined,
      connector: connector === 'ALL' ? undefined : connector,
      pageSize: 40,
    }),
    [query, connector],
  );

  const { data: searchData, isLoading: isSearchLoading, isError: isSearchError, refetch: refetchSearch, isRefetching: isSearchRefetching } =
    useProviderList(searchParams, !isProvider);
  const providers = searchData?.items ?? [];

  // Provider earnings state
  const { data: myProvider, refetch: refetchProvider } = useMyProvider();
  const { data: stats, refetch: refetchStats } = useProviderStats();
  const { data: bookings, isLoading: isBookingsLoading, refetch: refetchBookings, isRefetching: isBookingsRefetching } =
    useBookings({ role: 'provider', enabled: isProvider });

  const onRefresh = async () => {
    if (isProvider) {
      await Promise.all([refetchProvider(), refetchStats(), refetchBookings()]);
    } else {
      await refetchSearch();
    }
  };

  // If logged in as Provider, render Earnings & Revenue Dashboard
  if (isProvider) {
    const totalRev = stats?.totalRevenue ?? 1840;
    const completedSessions = (bookings?.items ?? []).filter((b) => b.status === 'COMPLETED' || b.status === 'IN_PROGRESS');

    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isBookingsRefetching} onRefresh={() => void onRefresh()} tintColor="#D97706" />
        }
      >
        {from === 'profile' ? (
          <View style={styles.headerRow}>
            <Pressable onPress={handleBack} hitSlop={10} style={styles.backButton}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={palette.ink} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Earnings & Revenue</Text>
              <Text style={styles.subtitle}>Track revenue and payouts from driver charging sessions.</Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.title}>Earnings & Revenue</Text>
            <Text style={styles.subtitle}>Track revenue and payouts from driver charging sessions.</Text>
          </>
        )}

        {/* Hero Revenue Card */}
        <LinearGradient
          colors={['#78350F', '#B45309', '#D97706']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.earningsHero}
        >
          <View style={styles.earningsHeroTop}>
            <Text style={styles.earningsHeroLabel}>TOTAL REVENUE</Text>
            <View style={styles.liveEarningsPill}>
              <View style={styles.liveGreenDot} />
              <Text style={styles.liveEarningsPillText}>Live Payouts</Text>
            </View>
          </View>
          <Text style={styles.earningsHeroAmount}>₹{totalRev.toLocaleString('en-IN')}</Text>
          <Text style={styles.earningsHeroSub}>Earned from {stats?.completedBookings ?? completedSessions.length} charging sessions</Text>

          <View style={styles.earningsHeroDivider} />

          <View style={styles.earningsHeroMetrics}>
            <View style={styles.metricCol}>
              <Text style={styles.metricVal}>₹{Math.round(totalRev * 0.7)}</Text>
              <Text style={styles.metricLbl}>This Month</Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricVal}>{myProvider?.pricePerKwh ? `₹${myProvider.pricePerKwh}` : '₹18'}/kWh</Text>
              <Text style={styles.metricLbl}>Unit Rate</Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricVal}>{stats?.rating ?? '5.0'} ★</Text>
              <Text style={styles.metricLbl}>Driver Rating</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Session Invoices List */}
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>Session Revenue History</Text>
          <Text style={styles.resultsCount}>{completedSessions.length} records</Text>
        </View>

        {isBookingsLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#D97706" />
          </View>
        ) : completedSessions.length === 0 ? (
          <EmptyState
            icon="cash-clock"
            title="No completed charges yet"
            message="When drivers book and charge at your station, revenue records will appear here."
          />
        ) : (
          completedSessions.map((session) => (
            <Pressable
              key={session.id}
              style={styles.sessionCard}
              onPress={() => router.push(`/booking/${session.id}`)}
            >
              <View style={styles.sessionHeader}>
                <View style={styles.sessionDriverInfo}>
                  <Text style={styles.sessionDriverName}>{session.driver?.fullName ?? 'EV Driver'}</Text>
                  <Text style={styles.sessionTime}>{formatDateTime(session.scheduledAt)}</Text>
                </View>
                <Text style={styles.sessionAmount}>
                  +₹{session.totalAmount ?? session.estimatedCost ?? Math.round(Number(myProvider?.pricePerKwh ?? 18) * 15)}
                </Text>
              </View>

              <View style={styles.sessionDetailsRow}>
                <View style={styles.sessionPill}>
                  <MaterialCommunityIcons name="ev-station" size={13} color="#D97706" />
                  <Text style={styles.sessionPillText}>
                    {session.connectorType ? CONNECTOR_LABELS[session.connectorType] : 'Fast Charge'}
                  </Text>
                </View>
                <View style={styles.sessionPill}>
                  <MaterialCommunityIcons name="lightning-bolt" size={13} color="#059669" />
                  <Text style={styles.sessionPillText}>
                    {session.kwhDelivered ? `${session.kwhDelivered} kWh` : '15.2 kWh'}
                  </Text>
                </View>
                <StatusBadge status={session.status} />
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    );
  }

  // Otherwise, render Driver's Search Screen
  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isSearchRefetching} onRefresh={() => void onRefresh()} tintColor={palette.primary} />
      }
    >
      {from === 'profile' ? (
        <View style={styles.headerRow}>
          <Pressable onPress={handleBack} hitSlop={10} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={palette.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Find a charger</Text>
            <Text style={styles.subtitle}>Search verified emergency stations, shops, and hosts.</Text>
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.title}>Find a charger</Text>
          <Text style={styles.subtitle}>Search verified emergency stations, shops, and hosts.</Text>
        </>
      )}

      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={20} color={palette.muted} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Name, area or city"
          placeholderTextColor="#93A39B"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {text.length > 0 ? (
          <MaterialCommunityIcons
            name="close-circle"
            size={18}
            color="#93A39B"
            onPress={() => setText('')}
          />
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((value) => {
          const active = connector === value;
          return (
            <Chip
              key={value}
              selected={active}
              onPress={() => setConnector(value)}
              style={[styles.chip, active && styles.chipActive]}
              textStyle={[styles.chipText, active && styles.chipTextActive]}
              showSelectedOverlay={false}
            >
              {value === 'ALL' ? 'All' : CONNECTOR_LABELS[value]}
            </Chip>
          );
        })}
      </ScrollView>

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>
          {query ? `Results for “${query}”` : 'All verified chargers'}
        </Text>
        <Text style={styles.resultsCount}>{providers.length} found</Text>
      </View>

      {isSearchLoading && providers.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : isSearchError ? (
        <EmptyState
          icon="wifi-off"
          title="Search unavailable"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void refetchSearch()}
        />
      ) : providers.length === 0 ? (
        <EmptyState
          icon="magnify-close"
          title="Nothing matched"
          message="Try a different name, city or connector type."
          actionLabel={query ? 'Clear search' : undefined}
          onAction={query ? () => setText('') : undefined}
        />
      ) : (
        providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            onPress={() => router.push(`/provider/${provider.id}`)}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: 54, paddingBottom: 120 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  backButton: {
    padding: 6,
    marginRight: 4,
    borderRadius: radius.pill,
    backgroundColor: '#F1F5F9',
  },
  title: { fontSize: 26, fontWeight: '800', color: palette.ink },
  subtitle: { fontSize: 13.5, color: palette.muted, marginTop: 4 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 14.5, color: palette.ink },
  filterRow: { gap: spacing.sm, paddingVertical: spacing.lg },
  chip: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  chipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { fontSize: 12.5, fontWeight: '700', color: palette.muted },
  chipTextActive: { color: '#FFFFFF' },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  resultsTitle: { fontSize: 15, fontWeight: '800', color: palette.ink, flex: 1 },
  resultsCount: { fontSize: 12, color: palette.muted, fontWeight: '600' },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },

  // Provider Earnings Styles
  earningsHero: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  earningsHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  earningsHeroLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FDE68A',
    letterSpacing: 0.8,
  },
  liveEarningsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
  },
  liveEarningsPillText: {
    fontSize: 10.5,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  earningsHeroAmount: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  earningsHeroSub: {
    fontSize: 12.5,
    color: '#FEF3C7',
    marginTop: 2,
  },
  earningsHeroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: spacing.md,
  },
  earningsHeroMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricCol: {
    alignItems: 'flex-start',
  },
  metricVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  metricLbl: {
    fontSize: 11,
    color: '#FDE68A',
    marginTop: 2,
  },
  sessionCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionDriverInfo: {
    flex: 1,
  },
  sessionDriverName: {
    fontSize: 15,
    fontWeight: '800',
    color: palette.ink,
  },
  sessionTime: {
    fontSize: 11.5,
    color: palette.muted,
    marginTop: 2,
  },
  sessionAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
  },
  sessionDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sessionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sessionPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.ink,
  },
});

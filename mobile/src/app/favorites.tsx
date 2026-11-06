import { useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Loading } from '@/components/Loading';
import { Stars } from '@/components/Stars';
import { useFavorites, useToggleFavorite } from '@/hooks/useAccount';
import { getErrorMessage } from '@/lib/api';
import { CONNECTOR_LABELS } from '@/lib/config';
import { formatCurrency, formatDistance, toNumber } from '@/lib/format';
import { palette, radius, spacing } from '@/theme';
import type { Favorite } from '@/types/api';

export default function FavoritesScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { data: favorites, isLoading, isError, refetch, isRefetching } = useFavorites();
  const toggleFavorite = useToggleFavorite();
  const [removing, setRemoving] = useState<string | null>(null);

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

  const remove = async (favorite: Favorite) => {
    setRemoving(favorite.providerId);
    try {
      await toggleFavorite.mutateAsync({ providerId: favorite.providerId, isFavorite: true });
    } catch (error) {
      Alert.alert('Could not remove', getErrorMessage(error));
    } finally {
      setRemoving(null);
    }
  };

  if (isLoading) return <Loading label="Loading saved chargers…" />;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={palette.primary} />
      }
    >
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={handleBack} hitSlop={10} style={{ paddingRight: 12 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={palette.ink} />
            </Pressable>
          ),
        }}
      />
      <Text style={styles.title}>Saved chargers</Text>
      <Text style={styles.subtitle}>Quick access to the charging points you trust.</Text>

      {isError ? (
        <EmptyState
          icon="wifi-off"
          title="Could not load saved chargers"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      ) : !favorites || favorites.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="Nothing saved yet"
          message="Tap the heart on any charger to keep it here for the next emergency."
          actionLabel="Find a charger"
          onAction={() => router.push('/(app)/search')}
        />
      ) : (
        favorites.map((favorite) => {
          const provider = favorite.provider;
          const price = provider.pricePerKwh ? formatCurrency(provider.pricePerKwh) : 'Free';
          return (
            <View key={favorite.id} style={styles.card}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/provider/[id]',
                    params: { id: provider.id, from: from === 'profile' ? 'profile' : 'favorites' },
                  })
                }
                style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}
              >
                <View style={styles.header}>
                  <View style={styles.titleWrap}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {provider.businessName}
                      </Text>
                      {provider.isVerified ? (
                        <MaterialCommunityIcons name="check-decagram" size={16} color={palette.primary} />
                      ) : null}
                    </View>
                    <Text style={styles.meta} numberOfLines={1}>
                      {provider.providerType.replace('_', ' ').toLowerCase()} · {provider.city}
                    </Text>
                  </View>
                  <View style={[styles.openPill, { backgroundColor: provider.isOpenNow ? '#E2F6EC' : '#FBE4E4' }]}>
                    <Text style={[styles.openText, { color: provider.isOpenNow ? '#126B43' : '#A12727' }]}>
                      {provider.isOpenNow ? 'Open' : 'Closed'}
                    </Text>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <Stars rating={toNumber(provider.rating)} size={13} />
                  <Text style={styles.statText}>
                    {provider.totalReviews > 0 ? `${provider.totalReviews} reviews` : 'New'}
                  </Text>
                  {provider.location?.distanceKm !== undefined ? (
                    <>
                      <Text style={styles.dot}>·</Text>
                      <Text style={styles.statText}>{formatDistance(provider.location.distanceKm)}</Text>
                    </>
                  ) : null}
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.statText}>{provider.maxPowerKw} kW</Text>
                </View>

                <View style={styles.footer}>
                  <View style={styles.chips}>
                    {provider.connectorTypes.slice(0, 3).map((connector) => (
                      <View key={connector} style={styles.chip}>
                        <Text style={styles.chipText}>{CONNECTOR_LABELS[connector] ?? connector}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.price}>
                    {price}
                    {provider.pricePerKwh ? <Text style={styles.priceUnit}> /kWh</Text> : null}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => void remove(favorite)}
                disabled={removing === favorite.providerId}
                style={styles.removeRow}
                hitSlop={6}
              >
                <MaterialCommunityIcons name="heart-remove-outline" size={16} color={palette.danger} />
                <Text style={styles.removeText}>
                  {removing === favorite.providerId ? 'Removing…' : 'Remove from saved'}
                </Text>
              </Pressable>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: 100 },
  title: { fontSize: 24, fontWeight: '800', color: palette.ink },
  subtitle: { fontSize: 13.5, color: palette.muted, marginTop: 4, marginBottom: spacing.lg },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  cardBody: { padding: spacing.lg },
  pressed: { opacity: 0.92 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  titleWrap: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '800', color: palette.ink, flexShrink: 1 },
  meta: { fontSize: 12.5, color: palette.muted, marginTop: 3, textTransform: 'capitalize' },
  openPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
  openText: { fontSize: 11, fontWeight: '800' },
  statsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: spacing.md },
  statText: { fontSize: 12, color: palette.muted, fontWeight: '600' },
  dot: { color: palette.muted },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  chip: { backgroundColor: '#EFF5F2', paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
  chipText: { fontSize: 11, fontWeight: '700', color: '#3C5449' },
  price: { fontSize: 15, fontWeight: '800', color: palette.primary },
  priceUnit: { fontSize: 11, fontWeight: '600', color: palette.muted },
  removeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
    backgroundColor: '#FDF9F9',
  },
  removeText: { fontSize: 12, fontWeight: '700', color: palette.danger },
});

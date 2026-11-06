import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CONNECTOR_LABELS } from '@/lib/config';
import { formatCurrency, formatDistance, toNumber } from '@/lib/format';
import { palette, radius, spacing } from '@/theme';
import type { ProviderSummary } from '@/types/api';

interface ProviderCardProps {
  provider: ProviderSummary & { location?: { distanceKm?: number } | null };
  onPress: () => void;
  compact?: boolean;
}

export function ProviderCard({ provider, onPress, compact = false }: ProviderCardProps) {
  const rating = toNumber(provider.rating);
  const price = provider.pricePerKwh ? formatCurrency(provider.pricePerKwh) : 'Free';
  const connectors = provider.connectorTypes.slice(0, compact ? 2 : 3);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      android_ripple={{ color: '#E9F0EC' }}
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
            {provider.subscriptionPlan === 'YEAR_1' || provider.planPriority === 3 ? (
              <View style={styles.firstPreferencePill}>
                <Text style={styles.firstPreferenceText}>1st Preference ⭐</Text>
              </View>
            ) : provider.subscriptionPlan === 'MONTH_5' || provider.planPriority === 2 ? (
              <View style={styles.highPriorityPill}>
                <Text style={styles.highPriorityText}>High Priority ⚡</Text>
              </View>
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
        <View style={styles.stat}>
          <MaterialCommunityIcons name="star" size={15} color={palette.accent} />
          <Text style={styles.statText}>
            {rating > 0 ? rating.toFixed(1) : 'New'}
            {provider.totalReviews > 0 ? ` (${provider.totalReviews})` : ''}
          </Text>
        </View>
        {provider.location?.distanceKm !== undefined ? (
          <View style={styles.stat}>
            <MaterialCommunityIcons name="map-marker-distance" size={15} color={palette.muted} />
            <Text style={styles.statText}>{formatDistance(provider.location.distanceKm)}</Text>
          </View>
        ) : null}
        <View style={styles.stat}>
          <MaterialCommunityIcons name="lightning-bolt" size={15} color={palette.muted} />
          <Text style={styles.statText}>{provider.maxPowerKw} kW</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.chips}>
          {connectors.map((connector) => (
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
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: '#0E2A20',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  titleWrap: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '800', color: palette.ink, flexShrink: 1 },
  meta: { fontSize: 12.5, color: palette.muted, marginTop: 3, textTransform: 'capitalize' },
  openPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
  openText: { fontSize: 11, fontWeight: '800' },
  firstPreferencePill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  firstPreferenceText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#B45309',
  },
  highPriorityPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  highPriorityText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#065F46',
  },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12.5, color: palette.muted, fontWeight: '600' },
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
});

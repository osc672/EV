import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';
import { palette, radius, spacing } from '@/theme';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tone?: 'primary' | 'warning' | 'info' | 'danger';
  compact?: boolean;
}

const tones = {
  primary: { bg: '#E4F5EE', fg: palette.primary },
  warning: { bg: '#FFF4D6', fg: '#8A6100' },
  info: { bg: '#E1EFFF', fg: '#1B5AB8' },
  danger: { bg: '#FBE4E4', fg: '#A12727' },
};

export function StatCard({ label, value, icon, tone = 'primary', compact = false }: StatCardProps) {
  const colors = tones[tone];
  return (
    <View style={[styles.card, compact && styles.compact]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.bg }]}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.fg} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
  },
  compact: { padding: spacing.sm },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  value: { fontSize: 20, fontWeight: '800', color: palette.ink },
  label: { fontSize: 11.5, color: palette.muted, fontWeight: '600', marginTop: 2 },
});

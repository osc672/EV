import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, spacing } from '@/theme';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  textWrap: { flex: 1, paddingRight: spacing.md },
  title: { fontSize: 17, fontWeight: '800', color: palette.ink },
  subtitle: { fontSize: 13, color: palette.muted, marginTop: 2 },
  action: { fontSize: 13, fontWeight: '700', color: palette.primary },
});

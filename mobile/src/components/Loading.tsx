import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { palette, spacing } from '@/theme';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={palette.primary} size="large" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  label: { marginTop: spacing.md, color: palette.muted, fontSize: 14 },
});

import { StyleSheet, Text, View } from 'react-native';
import { statusColors } from '@/theme';

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const config = statusColors[status] ?? { bg: '#EDF1EF', fg: '#455A50', label: status };
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.text, { color: config.fg }]}>{label ?? config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
});

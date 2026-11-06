import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';
import { palette } from '@/theme';

export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <MaterialCommunityIcons
          key={n}
          name={rating >= n ? 'star' : rating >= n - 0.5 ? 'star-half-full' : 'star-outline'}
          size={size}
          color={palette.accent}
        />
      ))}
    </View>
  );
}

export function RatingLine({ rating, count }: { rating: number; count?: number }) {
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons name="star" size={15} color={palette.accent} />
      <Text style={styles.value}>{rating > 0 ? rating.toFixed(1) : 'New'}</Text>
      {count !== undefined && count > 0 ? <Text style={styles.count}>({count} reviews)</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  value: { fontSize: 13, fontWeight: '800', color: palette.ink, marginLeft: 3 },
  count: { fontSize: 12, color: palette.muted, marginLeft: 2 },
});

import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from 'react-native-paper';
import { router } from 'expo-router';
import { palette, radius, spacing } from '@/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name="map-marker-question-outline" size={40} color={palette.primary} />
      </View>
      <Text style={styles.title}>This road goes nowhere</Text>
      <Text style={styles.message}>
        The screen you were looking for does not exist. Head back to the map and find a charger nearby.
      </Text>
      <Button
        mode="contained"
        icon="map-search-outline"
        onPress={() => router.replace('/(app)')}
        style={styles.button}
        contentStyle={styles.buttonContent}
      >
        Back to the map
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 28,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { fontSize: 22, fontWeight: '800', color: palette.ink, textAlign: 'center' },
  message: {
    fontSize: 14,
    color: palette.muted,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: spacing.sm,
    maxWidth: 300,
  },
  button: { marginTop: spacing.xl, borderRadius: radius.md },
  buttonContent: { paddingVertical: 5, paddingHorizontal: spacing.lg },
});

import type { ReactElement, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type RefreshControlProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, spacing } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: ReactElement<RefreshControlProps>;
}

export function Screen({ children, scroll = true, padded = true, style, contentStyle, refreshControl }: ScreenProps) {
  const insets = useSafeAreaInsets();

  if (!scroll) {
    return <View style={[styles.flex, style]}>{children}</View>;
  }

  return (
    <ScrollView
      style={[styles.flex, style]}
      contentContainerStyle={[
        {
          paddingHorizontal: padded ? spacing.lg : 0,
          paddingTop: padded ? spacing.lg : 0,
          paddingBottom: insets.bottom + spacing.xxl,
        },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
});

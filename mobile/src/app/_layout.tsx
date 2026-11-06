import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { queryClient } from '@/lib/queryClient';
import { selectIsAuthenticated, useAuthStore } from '@/store/auth';
import { palette, theme } from '@/theme';
import { NotificationVoiceManager } from '@/components/NotificationVoiceManager';
import { initNotificationChannel } from '@/lib/soundNotification';

export default function RootLayout() {
  return (
    <SafeAreaProvider style={styles.safeArea}>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={theme}>
          <StatusBar style="light" />
          <RootNavigator />
          <NotificationVoiceManager />
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore((s) => s.user);
  const segments = useSegments();
  const router = useRouter();
  // Track whether the initial redirect has already fired so back-navigation
  // presses never re-trigger an unwanted router.replace.
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    void hydrate();
    void initNotificationChannel();
  }, [hydrate]);

  useEffect(() => {
    if (!isHydrated) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';
    const inAdmin = segments[0] === 'admin';
    const isRoot = !segments[0] || (segments as string[])[0] === 'index';

    // Guard: only run protective redirects when we're on the root/index screen
    // or if the user is on a protected screen without auth.
    // Never interrupt the user mid-navigation (back presses, deep links, etc.)
    if (!isAuthenticated && !inAuthGroup && !isRoot) {
      // User lost auth (session expired) while inside a protected screen
      hasRedirectedRef.current = false;
      router.replace('/(auth)/welcome' as any);
    } else if (isAuthenticated && inAuthGroup) {
      // User is authenticated but somehow on the auth flow — push them to app
      if (!hasRedirectedRef.current) {
        hasRedirectedRef.current = true;
        if (user?.role === 'ADMIN') {
          router.replace('/admin');
        } else {
          router.replace('/(app)');
        }
      }
    } else if (isAuthenticated && (inAppGroup || inAdmin)) {
      // Normal authenticated state — mark redirect as done so back nav works freely
      hasRedirectedRef.current = true;
    }
  }, [isAuthenticated, isHydrated, segments, router, user?.role]);

  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          contentStyle: { backgroundColor: '#021B14' },
          headerStyle: { backgroundColor: palette.surface },
          headerTintColor: palette.ink,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="(app)" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="provider/[id]" options={{ headerShown: true, title: 'Charging point', animation: 'slide_from_right' }} />
        <Stack.Screen name="booking/[id]" options={{ headerShown: true, title: 'Booking', animation: 'slide_from_right' }} />
        <Stack.Screen name="vehicles" options={{ headerShown: true, title: 'My vehicles', animation: 'slide_from_right' }} />
        <Stack.Screen name="favorites" options={{ headerShown: true, title: 'Saved chargers', animation: 'slide_from_right' }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications', animation: 'slide_from_right' }} />
        <Stack.Screen name="provider-setup" options={{ headerShown: true, title: 'Become a provider', animation: 'slide_from_right' }} />
        <Stack.Screen name="provider-dashboard" options={{ headerShown: true, title: 'Provider dashboard', animation: 'slide_from_right' }} />
        <Stack.Screen name="admin/index" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="+not-found" options={{ headerShown: true, title: 'Not found' }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#021B14',
  },
  container: {
    flex: 1,
    backgroundColor: '#021B14',
  },
});

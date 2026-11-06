import { useEffect } from 'react';
import { View, ActivityIndicator, BackHandler } from 'react-native';
import { Redirect } from 'expo-router';
import { selectIsAuthenticated, useAuthStore } from '@/store/auth';

export default function RootIndex() {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    // If navigation reaches the root index screen, back press should exit cleanly
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, []);

  if (!isHydrated) {
    // Show a neutral dark background while SecureStore loads — no flash
    return (
      <View style={{ flex: 1, backgroundColor: '#021B14', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#059669" size="large" />
      </View>
    );
  }

  if (isAuthenticated) {
    if (user?.role === 'ADMIN') {
      return <Redirect href="/admin" />;
    }
    return <Redirect href="/(app)" />;
  }

  return <Redirect href={'/(auth)/welcome' as any} />;
}

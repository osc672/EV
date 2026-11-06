import { useEffect, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, Tabs, useSegments } from 'expo-router';
import { useUnreadNotifications } from '@/hooks/useAccount';
import { useAuthStore } from '@/store/auth';
import { palette } from '@/theme';

const HOME_TAB = 'index';

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const isProvider = user?.role === 'PROVIDER';
  const { data: unread } = useUnreadNotifications();
  const unreadCount = unread?.count ?? 0;

  const activeColor = isProvider ? '#D97706' : '#059669';

  // Track the currently focused tab so back can decide what to do.
  // segments looks like ['(app)', 'search'] when on the Search/Earnings tab.
  const segments = useSegments();
  const lastBackPressRef = useRef(0);

  // The focused tab is the last path segment when inside (app)
  const currentTab = (segments[segments.length - 1] ?? HOME_TAB) as string;
  const isOnHomeTab = currentTab === HOME_TAB || currentTab === '(app)';

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // If a stack screen is on top (can go back), let the default back action handle it
      if (router.canGoBack()) {
        return false;
      }

      // We are on a tab root screen. If not on the home tab, go to the home tab.
      if (!isOnHomeTab) {
        router.navigate('/(app)');
        return true;
      }

      // On the home/index tab: double-press to exit
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        BackHandler.exitApp();
        return true;
      }
      lastBackPressRef.current = now;
      if (Platform.OS === 'android') {
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      }
      return true;
    });

    return () => sub.remove();
  }, [isOnHomeTab]);

  return (
    <Tabs
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: '#8A9A92',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: palette.border,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: isProvider ? 'My Station' : 'Find',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name={isProvider ? 'ev-station' : 'map-search-outline'}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: isProvider ? 'Earnings' : 'Search',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name={isProvider ? 'cash-multiple' : 'magnify'}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: isProvider ? 'Requests' : 'Bookings',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name={isProvider ? 'clipboard-list-outline' : 'calendar-clock-outline'}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: palette.danger, fontSize: 10 },
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" size={size} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}

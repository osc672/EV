import { useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button, Chip } from 'react-native-paper';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Loading } from '@/components/Loading';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotifications,
} from '@/hooks/useAccount';
import { timeAgo } from '@/lib/format';
import { palette, radius, spacing } from '@/theme';
import type { NotificationItem } from '@/types/api';

type Filter = 'ALL' | 'UNREAD';

function iconFor(notification: NotificationItem): keyof typeof MaterialCommunityIcons.glyphMap {
  const type = String(notification.data?.type ?? '');
  if (type.includes('PROVIDER')) return 'shield-check-outline';
  if (type.includes('CANCELLED')) return 'calendar-remove-outline';
  if (type.includes('COMPLETED')) return 'check-decagram-outline';
  if (type.includes('CONFIRMED')) return 'calendar-check-outline';
  if (type.includes('IN_PROGRESS')) return 'lightning-bolt';
  if (type.includes('BOOKING')) return 'calendar-clock-outline';
  return 'bell-outline';
}

function toneFor(notification: NotificationItem): { bg: string; fg: string } {
  const type = String(notification.data?.type ?? '');
  if (type.includes('CANCELLED')) return { bg: '#FBE4E4', fg: '#A12727' };
  if (type.includes('PROVIDER')) return { bg: '#E1EFFF', fg: '#1B5AB8' };
  if (type.includes('COMPLETED')) return { bg: '#E2F6EC', fg: '#126B43' };
  if (type.includes('IN_PROGRESS') || type.includes('CONFIRMED')) {
    return { bg: '#E4F5EE', fg: palette.primaryDark };
  }
  return { bg: '#FFF4D6', fg: '#8A6100' };
}

export default function NotificationsScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { data: notifications, isLoading, isError, refetch, isRefetching } = useNotifications();
  const { data: unread } = useUnreadNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [filter, setFilter] = useState<Filter>('ALL');

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)');
    }
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  const unreadCount = unread?.count ?? 0;

  const items = useMemo(() => {
    const list = notifications ?? [];
    return filter === 'UNREAD' ? list.filter((item) => !item.readAt) : list;
  }, [notifications, filter]);

  const openNotification = async (notification: NotificationItem) => {
    if (!notification.readAt) {
      markRead.mutate(notification.id);
    }
    const bookingId = notification.data?.bookingId;
    if (typeof bookingId === 'string') {
      router.push(`/booking/${bookingId}`);
      return;
    }
    if (String(notification.data?.type ?? '').includes('PROVIDER')) {
      router.push('/provider-dashboard');
    }
  };

  if (isLoading) return <Loading label="Loading notifications…" />;

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Notifications',
          headerLeft: () => (
            <Pressable onPress={handleBack} hitSlop={10} style={{ paddingRight: 12 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={palette.ink} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={palette.primary} />
        }
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subtitle}>
              {unreadCount > 0 ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'You are all caught up'}
            </Text>
          </View>
          {unreadCount > 0 ? (
            <Button
              mode="text"
              compact
              loading={markAllRead.isPending}
              disabled={markAllRead.isPending}
              onPress={() => markAllRead.mutate()}
            >
              Mark all read
            </Button>
          ) : null}
        </View>

        <View style={styles.filterRow}>
          <Chip
            selected={filter === 'ALL'}
            onPress={() => setFilter('ALL')}
            style={[styles.chip, filter === 'ALL' && styles.chipActive]}
            textStyle={[styles.chipText, filter === 'ALL' && styles.chipTextActive]}
            showSelectedOverlay={false}
          >
            All
          </Chip>
          <Chip
            selected={filter === 'UNREAD'}
            onPress={() => setFilter('UNREAD')}
            style={[styles.chip, filter === 'UNREAD' && styles.chipActive]}
            textStyle={[styles.chipText, filter === 'UNREAD' && styles.chipTextActive]}
            showSelectedOverlay={false}
          >
            Unread {unreadCount > 0 ? `(${unreadCount})` : ''}
          </Chip>
        </View>

        {isError ? (
          <EmptyState
            icon="wifi-off"
            title="Could not load notifications"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon="bell-sleep-outline"
            title={filter === 'UNREAD' ? 'No unread notifications' : 'No notifications yet'}
            message={
              filter === 'UNREAD'
                ? 'You have read every update. Switch to All to see history.'
                : 'Booking updates, verification results and reminders will appear here.'
            }
            actionLabel={filter === 'UNREAD' ? 'Show all' : undefined}
            onAction={filter === 'UNREAD' ? () => setFilter('ALL') : undefined}
          />
        ) : (
          items.map((notification) => {
            const tone = toneFor(notification);
            const unreadItem = !notification.readAt;
            return (
              <Pressable
                key={notification.id}
                onPress={() => void openNotification(notification)}
                style={({ pressed }) => [
                  styles.card,
                  unreadItem && styles.cardUnread,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.iconWrap, { backgroundColor: tone.bg }]}>
                  <MaterialCommunityIcons name={iconFor(notification)} size={19} color={tone.fg} />
                </View>
                <View style={styles.body}>
                  <View style={styles.bodyTop}>
                    <Text style={[styles.cardTitle, unreadItem && styles.cardTitleUnread]} numberOfLines={1}>
                      {notification.title}
                    </Text>
                    <Text style={styles.time}>{timeAgo(notification.createdAt)}</Text>
                  </View>
                  <Text style={styles.message} numberOfLines={3}>
                    {notification.body}
                  </Text>
                </View>
                {unreadItem ? <View style={styles.unreadDot} /> : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: 100 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headerText: { flex: 1 },
  title: { fontSize: 24, fontWeight: '800', color: palette.ink },
  subtitle: { fontSize: 13, color: palette.muted, marginTop: 4 },
  filterRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md },
  chip: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  chipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { fontSize: 12.5, fontWeight: '700', color: palette.muted },
  chipTextActive: { color: '#FFFFFF' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardUnread: { borderColor: '#BFE3D3', backgroundColor: '#FBFFFD' },
  pressed: { opacity: 0.92 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  bodyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: 13.5, fontWeight: '600', color: palette.ink },
  cardTitleUnread: { fontWeight: '800' },
  time: { fontSize: 11, color: palette.muted },
  message: { fontSize: 12.5, color: palette.muted, marginTop: 3, lineHeight: 18 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.primary },
});

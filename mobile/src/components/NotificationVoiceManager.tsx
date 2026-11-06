import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNotifications, useUnreadNotifications } from '@/hooks/useAccount';
import { useBookings } from '@/hooks/useBookings';
import { useMyProvider } from '@/hooks/useProviders';
import { useGlobalRealtimeEvents } from '@/hooks/useRealtime';
import { notificationsApi } from '@/lib/endpoints';
import { queryKeys } from '@/lib/queryClient';
import { joinUserRoom, joinProviderRoom } from '@/lib/socket';
import {
  formatSlotSpeech,
  playNotificationChime,
  speakNotification,
  stopNotificationAudio,
} from '@/lib/soundNotification';
import { useAuthStore } from '@/store/auth';
import { palette, radius, spacing } from '@/theme';
import type { Booking } from '@/types/api';

export interface ActiveAlertModalData {
  type: 'PROVIDER_REQUEST' | 'DRIVER_CONFIRMED' | 'GENERAL';
  title: string;
  subtitle: string;
  detailHighlight?: string;
  bookingId?: string;
  notificationId?: string;
  meta?: string;
}

// Module-level set that permanently remembers announced booking IDs in this app session
// This guarantees audio NEVER loops on reload, route change, or clicking "View details"
const globalAnnouncedKeys = new Set<string>();

export function NotificationVoiceManager() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { data: myProvider } = useMyProvider();
  const isProvider = user?.role === 'PROVIDER' || Boolean(user?.providerProfile?.id) || Boolean(myProvider?.id);
  const [alertData, setAlertData] = useState<ActiveAlertModalData | null>(null);

  const slideAnim = useRef(new Animated.Value(-160)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const lastUserIdRef = useRef<string | null>(null);
  const lastAnnounceTimeRef = useRef<number>(0);

  // When user logs in or switches account, reset announced history & join socket room
  useEffect(() => {
    const provId = user?.providerProfile?.id || myProvider?.id;
    if (user?.id) {
      if (lastUserIdRef.current !== user.id) {
        lastUserIdRef.current = user.id;
        globalAnnouncedKeys.clear();
      }
      joinUserRoom(user.id);
    } else {
      lastUserIdRef.current = null;
    }
    if (provId) {
      joinProviderRoom(provId);
    }
  }, [user?.id, user?.providerProfile?.id, myProvider?.id]);

  // Unified animation dismiss function
  const onDismiss = useCallback(() => {
    void stopNotificationAudio();
    if (alertData?.notificationId) {
      void notificationsApi.markRead(alertData.notificationId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() });
    }
    setAlertData(null);
  }, [alertData?.notificationId, queryClient]);

  const dismissWithAnimation = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -160,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  }, [slideAnim, opacityAnim, onDismiss]);

  // Animate slide-down from the top when new alertData arrives
  useEffect(() => {
    if (alertData) {
      slideAnim.setValue(-160);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 9,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [alertData, slideAnim, opacityAnim]);

  // Auto-dismiss popup after 12 seconds
  useEffect(() => {
    if (!alertData) return;
    const timer = setTimeout(() => {
      dismissWithAnimation();
    }, 12000);
    return () => clearTimeout(timer);
  }, [alertData, dismissWithAnimation]);

  /**
   * Unified Announce Function:
   * Only plays sound & voice for:
   * 1. When user selects slot -> sound on provider side (type === 'PROVIDER_REQUEST' && isProvider)
   * 2. When provider confirms slot -> sound on user side (type === 'DRIVER_CONFIRMED' && !isProvider)
   * "that's all"
   */
  const triggerNotificationAlert = useCallback(
    (
      type: 'PROVIDER_REQUEST' | 'DRIVER_CONFIRMED' | 'GENERAL',
      title: string,
      body: string,
      bookingId?: string,
      notificationId?: string,
      detailHighlight?: string,
      meta?: string,
    ) => {
      // Slot confirmed alert strictly plays on driver side only
      if (type === 'DRIVER_CONFIRMED' && isProvider) {
        return;
      }

      const now = Date.now();
      // De-duplicate burst triggers of the SAME type within 1.5 seconds
      // (don't block different-type events, e.g. booking:incoming + notification:received arriving together)
      const burstKey = `${type}_${bookingId || notificationId || title}`;
      if (burstKey === (triggerNotificationAlert as any)._lastKey
          && now - lastAnnounceTimeRef.current < 1500) {
        return;
      }
      (triggerNotificationAlert as any)._lastKey = burstKey;
      lastAnnounceTimeRef.current = now;

      const shouldPlaySound = type === 'PROVIDER_REQUEST' || type === 'DRIVER_CONFIRMED';

      if (shouldPlaySound) {
        // 1. Play alert chime & haptics
        void playNotificationChime(title, body);

        // 2. Speak the notification text with a 100ms buffer
        const speechText = `${title}. ${body}`;
        setTimeout(() => {
          void speakNotification(speechText);
        }, 100);

        // 3. Show top popup dispatch card
        setAlertData({
          type,
          title,
          subtitle: body,
          detailHighlight,
          bookingId,
          notificationId,
          meta,
        });
      }
    },
    [isProvider],
  );

  const handleIncomingBooking = useCallback(
    (booking: Booking, customTitle?: string, customBody?: string) => {
      const key = `incoming_${booking.id}`;
      if (globalAnnouncedKeys.has(key)) return;
      globalAnnouncedKeys.add(key);

      const slotSpeech = formatSlotSpeech(booking.scheduledAt);
      const title = customTitle || 'New charging request';
      const body =
        customBody ||
        `${booking.driver?.fullName || 'A driver'} requested a charging slot for ${slotSpeech}. Please confirm or decline.`;

      triggerNotificationAlert(
        'PROVIDER_REQUEST',
        title,
        body,
        booking.id,
        undefined,
        `Slot Time: ${slotSpeech}`,
        `${booking.connectorType ? booking.connectorType.replace('_', ' ') : 'EV Charger'} · Booking #${booking.code || ''}`,
      );
    },
    [triggerNotificationAlert],
  );

  const handleBookingConfirmed = useCallback(
    (booking: Booking, customTitle?: string, customBody?: string) => {
      if (isProvider) return; // Only driver hears confirmation

      const key = `confirmed_${booking.id}`;
      if (globalAnnouncedKeys.has(key)) return;
      globalAnnouncedKeys.add(key);

      const stationName = booking.provider?.businessName || 'Charging Station';
      const slotSpeech = formatSlotSpeech(booking.scheduledAt);
      const title = customTitle || 'Charging slot confirmed';
      const body =
        customBody ||
        `Your charging slot at ${stationName} is confirmed for ${slotSpeech}. Charger is ready.`;

      triggerNotificationAlert(
        'DRIVER_CONFIRMED',
        title,
        body,
        booking.id,
        undefined,
        `Slot Time: ${slotSpeech}`,
        `Charger is reserved and ready for you · Tap to open directions`,
      );
    },
    [isProvider, triggerNotificationAlert],
  );

  const handleBookingCancelled = useCallback(
    (data: { bookingId: string; booking?: Booking }) => {
      const key = `booking_cancelled_${data.bookingId}`;
      globalAnnouncedKeys.add(key);
    },
    [],
  );

  const handleNotification = useCallback(
    (payload: { id?: string; title: string; body: string; data?: any; booking?: Booking }) => {
      if (payload.id && globalAnnouncedKeys.has(payload.id)) return;

      const notifData = payload.data || {};
      const bookingId =
        typeof notifData.bookingId === 'string'
          ? notifData.bookingId
          : payload.booking?.id;

      const notifType = notifData.type || (payload.booking ? 'BOOKING_CREATED' : undefined);

      if (notifType === 'BOOKING_CONFIRMED') {
        if (isProvider) return; // Driver only
        if (bookingId && globalAnnouncedKeys.has(`confirmed_${bookingId}`)) return;
        if (payload.id) globalAnnouncedKeys.add(payload.id);
        if (bookingId) globalAnnouncedKeys.add(`confirmed_${bookingId}`);

        if (payload.booking) {
          handleBookingConfirmed(payload.booking, payload.title, payload.body);
        } else {
          triggerNotificationAlert('DRIVER_CONFIRMED', payload.title, payload.body, bookingId, payload.id);
        }
        return;
      } else if (notifType === 'BOOKING_CREATED' || payload.booking) {
        if (bookingId && globalAnnouncedKeys.has(`incoming_${bookingId}`)) return;
        if (payload.id) globalAnnouncedKeys.add(payload.id);
        if (bookingId) globalAnnouncedKeys.add(`incoming_${bookingId}`);

        if (payload.booking) {
          handleIncomingBooking(payload.booking, payload.title, payload.body);
        } else {
          triggerNotificationAlert('PROVIDER_REQUEST', payload.title, payload.body, bookingId, payload.id);
        }
        return;
      }
    },
    [isProvider, handleBookingConfirmed, handleIncomingBooking, triggerNotificationAlert],
  );

  useGlobalRealtimeEvents({
    onIncomingBooking: handleIncomingBooking,
    onBookingConfirmed: handleBookingConfirmed,
    onBookingCancelled: handleBookingCancelled,
    onNotification: handleNotification,
  });

  // Fast polling of notifications and bookings (every 3 seconds)
  const { data: notificationsList, refetch: refetchNotifications } = useNotifications();
  const { data: unreadSummary } = useUnreadNotifications();
  const { data: bookingsData } = useBookings(
    user?.id ? { role: isProvider ? 'provider' : 'driver' } : {},
  );

  const lastUnreadCountRef = useRef(0);
  // If unread count changes, fetch list once
  useEffect(() => {
    const count = unreadSummary?.count ?? 0;
    if (count > 0 && count !== lastUnreadCountRef.current) {
      lastUnreadCountRef.current = count;
      void refetchNotifications();
    }
  }, [unreadSummary?.count, refetchNotifications]);

  /**
   * AUTOMATIC NOTIFICATION & SOUND TRIGGER:
   * Only triggers for truly new, unannounced events.
   * NEVER replays on reload, navigation, or clicking "View details".
   */
  useEffect(() => {
    if (!user?.id) return;

    // 1. Check unread notifications in database
    const notifs = notificationsList ?? [];
    const unread = notifs.filter((n) => !n.readAt);

    for (const newest of unread) {
      const notifData = (newest.data || {}) as Record<string, any>;
      const bookingId = typeof notifData.bookingId === 'string' ? notifData.bookingId : undefined;

      const isBookingCreated = notifData.type === 'BOOKING_CREATED';
      const isBookingConfirmed = notifData.type === 'BOOKING_CONFIRMED';

      if (isBookingCreated) {
        const key = `incoming_${bookingId || newest.id}`;
        if (!globalAnnouncedKeys.has(key) && !globalAnnouncedKeys.has(newest.id)) {
          globalAnnouncedKeys.add(key);
          globalAnnouncedKeys.add(newest.id);
          triggerNotificationAlert(
            'PROVIDER_REQUEST',
            newest.title,
            newest.body,
            bookingId,
            newest.id,
          );
          return;
        }
      } else if (isBookingConfirmed) {
        const key = `confirmed_${bookingId || newest.id}`;
        if (!globalAnnouncedKeys.has(key) && !globalAnnouncedKeys.has(newest.id)) {
          globalAnnouncedKeys.add(key);
          globalAnnouncedKeys.add(newest.id);
          triggerNotificationAlert(
            'DRIVER_CONFIRMED',
            newest.title,
            newest.body,
            bookingId,
            newest.id,
          );
          return;
        }
      }
    }

    // 2. Check pending bookings for provider if provider opened app with pending request
    if (isProvider || Boolean(myProvider?.id)) {
      const bookings = bookingsData?.items ?? [];
      const pendingBooking = bookings.find((b) => b.status === 'PENDING');
      if (pendingBooking) {
        const key = `incoming_${pendingBooking.id}`;
        if (!globalAnnouncedKeys.has(key)) {
          globalAnnouncedKeys.add(key);
          handleIncomingBooking(pendingBooking);
        }
      }
    }
  }, [
    user?.id,
    notificationsList,
    bookingsData?.items,
    isProvider,
    handleIncomingBooking,
    triggerNotificationAlert,
  ]);

  const onOpenBooking = () => {
    void stopNotificationAudio();
    if (alertData?.notificationId) {
      void notificationsApi.markRead(alertData.notificationId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() });
    }
    const id = alertData?.bookingId;
    setAlertData(null);
    if (id) {
      router.push(`/booking/${id}`);
    } else {
      router.push('/notifications');
    }
  };

  if (!alertData) {
    return null;
  }

  const isRequest = alertData.type === 'PROVIDER_REQUEST';
  const isConfirmed = alertData.type === 'DRIVER_CONFIRMED';

  return (
    <Modal
      transparent
      animationType="none"
      visible={Boolean(alertData)}
      onRequestClose={dismissWithAnimation}
    >
      <View style={[styles.backdrop, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
        {/* Dismiss when tapping outside the top popup */}
        <Pressable style={styles.backdropDismissArea} onPress={dismissWithAnimation} />

        {/* Animated Top Card sliding down from top of screen */}
        <Animated.View
          style={[
            styles.cardContainer,
            {
              transform: [{ translateY: slideAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <Pressable onPress={onOpenBooking} style={styles.cardInnerPressable}>
            {/* Top row: badge + close icon */}
            <View style={styles.headerRow}>
              <View style={[styles.typeBadge, isRequest ? styles.badgeRequest : styles.badgeConfirmed]}>
                <MaterialCommunityIcons
                  name="volume-high"
                  size={14}
                  color={isRequest ? '#92400E' : '#065F46'}
                />
                <Text style={[styles.typeBadgeText, isRequest ? styles.textRequest : styles.textConfirmed]}>
                  {isRequest ? 'RAPIDO VOICE ALERT' : isConfirmed ? 'SLOT CONFIRMED' : 'LIVE NOTIFICATION'}
                </Text>
              </View>

              <Pressable onPress={dismissWithAnimation} hitSlop={12} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={19} color={palette.muted} />
              </Pressable>
            </View>

            {/* Alert Title & Icon */}
            <View style={styles.titleRow}>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: isRequest ? '#FEF3C7' : isConfirmed ? '#ECFDF5' : '#EEF2FF' },
                ]}
              >
                <MaterialCommunityIcons
                  name={isRequest ? 'lightning-bolt-circle' : isConfirmed ? 'check-decagram' : 'bell-ring'}
                  size={26}
                  color={isRequest ? '#D97706' : isConfirmed ? '#059669' : palette.primary}
                />
              </View>
              <View style={styles.titleWrap}>
                <Text style={styles.titleText}>{alertData.title}</Text>
                <Text style={styles.subtitleText} numberOfLines={3}>{alertData.subtitle}</Text>
              </View>
            </View>

            {/* Detail Highlight (e.g., Driver Name & Slot Time) */}
            {alertData.detailHighlight ? (
              <View style={styles.highlightCard}>
                <MaterialCommunityIcons name="clock-time-four" size={16} color="#D97706" />
                <Text style={styles.highlightText}>{alertData.detailHighlight}</Text>
              </View>
            ) : null}

            {alertData.meta ? (
              <Text style={styles.metaText}>{alertData.meta}</Text>
            ) : null}
          </Pressable>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <Button
              mode="outlined"
              onPress={dismissWithAnimation}
              style={styles.dismissBtn}
              textColor={palette.muted}
              compact
            >
              Dismiss
            </Button>
            <Button
              mode="contained"
              icon={isRequest ? 'lightning-bolt' : 'arrow-right'}
              onPress={onOpenBooking}
              style={styles.openBtn}
              buttonColor={isRequest ? '#D97706' : '#059669'}
              labelStyle={{ fontWeight: '800' }}
              compact
            >
              {isRequest ? 'View & Respond' : 'View Details'}
            </Button>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  backdropDismissArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 410,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  cardInnerPressable: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  closeBtn: {
    padding: 4,
    borderRadius: radius.pill,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeRequest: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badgeConfirmed: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  textRequest: { color: '#92400E' },
  textConfirmed: { color: '#065F46' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  titleText: {
    fontSize: 16.5,
    fontWeight: '800',
    color: palette.ink,
  },
  subtitleText: {
    fontSize: 12.5,
    color: palette.muted,
    marginTop: 3,
    lineHeight: 17,
  },
  highlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFBEB',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  highlightText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400E',
    flexShrink: 1,
  },
  metaText: {
    fontSize: 11,
    color: palette.muted,
    marginTop: 6,
    marginLeft: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  dismissBtn: {
    flex: 1,
    borderRadius: radius.md,
    borderColor: palette.border,
  },
  openBtn: {
    flex: 2,
    borderRadius: radius.md,
  },
});

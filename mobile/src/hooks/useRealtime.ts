import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getSocket,
  joinBookingRoom,
  leaveBookingRoom,
  emitDriverLocation,
  emitChatMessage,
} from '@/lib/socket';
import { queryKeys } from '@/lib/queryClient';
import { useAuthStore } from '@/store/auth';
import type { Booking, BookingStatus } from '@/types/api';

export interface DriverLiveLocation {
  driverId?: string;
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  bookingId: string;
  senderId: string;
  message: string;
  timestamp: string;
}

/**
 * Real-time hook for an active booking session (status changes, driver GPS tracking, chat)
 */
export function useRealtimeBooking(bookingId?: string) {
  const queryClient = useQueryClient();
  const [driverLocation, setDriverLocation] = useState<DriverLiveLocation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveStatus, setLiveStatus] = useState<BookingStatus | null>(null);

  useEffect(() => {
    if (!bookingId) return;

    const socket = getSocket();
    joinBookingRoom(bookingId);

    const onStatusChanged = (payload: { bookingId: string; status: BookingStatus; booking?: Booking }) => {
      if (payload.bookingId === bookingId) {
        setLiveStatus(payload.status);
        void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.list('driver') });
        void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.list('provider') });
      }
    };

    const onDriverLocation = (location: DriverLiveLocation) => {
      setDriverLocation(location);
    };

    const onChat = (chatItem: ChatMessage) => {
      setMessages((prev) => [...prev, chatItem]);
    };

    socket.on('booking:status_changed', onStatusChanged);
    socket.on('charging:started', () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
    });
    socket.on('charging:completed', () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
    });
    socket.on('driver:location:update', onDriverLocation);
    socket.on('chat:received', onChat);

    return () => {
      socket.off('booking:status_changed', onStatusChanged);
      socket.off('driver:location:update', onDriverLocation);
      socket.off('chat:received', onChat);
      leaveBookingRoom(bookingId);
    };
  }, [bookingId, queryClient]);

  const sendLocation = (coords: { latitude: number; longitude: number; speed?: number; heading?: number }) => {
    if (bookingId) {
      emitDriverLocation(bookingId, coords);
    }
  };

  const sendMessage = (text: string) => {
    if (bookingId && text.trim()) {
      emitChatMessage(bookingId, text.trim());
    }
  };

  return {
    liveStatus,
    driverLocation,
    messages,
    sendLocation,
    sendMessage,
  };
}

export interface GlobalRealtimeHandlers {
  onIncomingBooking?: (booking: Booking, title?: string, body?: string) => void;
  onBookingConfirmed?: (booking: Booking, title?: string, body?: string) => void;
  onBookingCancelled?: (data: { bookingId: string; booking?: Booking; title?: string; body?: string; reason?: string; isDeclinedByHost?: boolean }) => void;
  onNotification?: (notification: { id?: string; title: string; body: string; data?: any; booking?: Booking }) => void;
}

/**
 * Global real-time listener for incoming booking requests, confirmations, cancellations, & notifications
 */
export function useGlobalRealtimeEvents(handlersOrIncoming?: GlobalRealtimeHandlers | ((booking: Booking) => void)) {
  const queryClient = useQueryClient();

  const handlers: GlobalRealtimeHandlers =
    typeof handlersOrIncoming === 'function'
      ? { onIncomingBooking: handlersOrIncoming }
      : handlersOrIncoming ?? {};

  const handlersRef = useRef<GlobalRealtimeHandlers>(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const socket = getSocket();

    const onIncoming = (payload: {
      booking: Booking;
      providerId?: string;
      providerUserId?: string;
      title: string;
      body: string;
    }) => {
      const curUser = useAuthStore.getState().user;
      const targetUserId = payload.providerUserId || payload.booking?.provider?.userId;

      // Drop if this event is explicitly addressed to a different user
      // (Covers the edge case where a provider and driver are both connected)
      if (curUser?.id && targetUserId && targetUserId !== curUser.id) {
        return;
      }

      // Only invalidate data relevant to the current user
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.list('provider') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread() });
      if (handlersRef.current.onIncomingBooking && payload.booking) {
        handlersRef.current.onIncomingBooking(payload.booking, payload.title, payload.body);
      }
    };

    const onConfirmed = (payload: {
      bookingId: string;
      booking: Booking;
      driverId?: string;
      title?: string;
      body?: string;
    }) => {
      const curUser = useAuthStore.getState().user;
      const targetDriverId = payload.driverId || payload.booking?.driverId;

      // Only drop if this confirmation is explicitly meant for another driver
      if (curUser?.id && targetDriverId && targetDriverId !== curUser.id) {
        return;
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.list('driver') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread() });
      if (payload.bookingId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(payload.bookingId) });
      }
      if (handlersRef.current.onBookingConfirmed && payload.booking) {
        handlersRef.current.onBookingConfirmed(payload.booking, payload.title, payload.body);
      }
    };

    const onCancelled = (payload: { bookingId: string; booking?: Booking; title?: string; body?: string; reason?: string; isDeclinedByHost?: boolean }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.list('driver') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.list('provider') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread() });
      if (payload.bookingId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(payload.bookingId) });
      }
      if (handlersRef.current.onBookingCancelled) {
        handlersRef.current.onBookingCancelled(payload);
      }
    };

    const onNotification = (payload: {
      id?: string;
      title: string;
      body: string;
      data?: any;
      booking?: Booking;
    }) => {
      const curUser = useAuthStore.getState().user;
      const targetUserId = payload.data?.providerUserId || payload.data?.userId;
      if (curUser?.id && targetUserId && targetUserId !== curUser.id) {
        return;
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread() });
      if (handlersRef.current.onNotification) {
        handlersRef.current.onNotification(payload);
      }
    };

    const onStationChanged = () => {
      void queryClient.invalidateQueries({ queryKey: ['providers'] });
    };

    // On reconnect: invalidate all stale queries so UI reflects latest data immediately
    const onReconnect = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.list('driver') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.list('provider') });
    };

    socket.on('booking:incoming', onIncoming);
    socket.on('booking:confirmed', onConfirmed);
    socket.on('booking:cancelled', onCancelled);
    socket.on('notification:received', onNotification);
    socket.on('station:status_changed', onStationChanged);
    socket.on('connect', onReconnect);

    return () => {
      socket.off('booking:incoming', onIncoming);
      socket.off('booking:confirmed', onConfirmed);
      socket.off('booking:cancelled', onCancelled);
      socket.off('notification:received', onNotification);
      socket.off('station:status_changed', onStationChanged);
      socket.off('connect', onReconnect);
    };
  }, [queryClient]);
}

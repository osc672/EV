import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bookingsApi } from '@/lib/endpoints';
import { queryKeys } from '@/lib/queryClient';
import { useAuthStore } from '@/store/auth';
import type { ConnectorType, PaymentMethod } from '@/types/api';

export function useBookings(params: { role?: 'driver' | 'provider'; status?: string; enabled?: boolean }) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.bookings.list(params),
    queryFn: async () => {
      const { data, meta } = await bookingsApi.list({ ...params, pageSize: 50 });
      return {
        items: data,
        total: Number(meta.total ?? data.length),
      };
    },
    enabled: params.enabled !== undefined ? params.enabled && Boolean(user) : Boolean(user),
  });
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.bookings.detail(id ?? ''),
    queryFn: () => bookingsApi.detail(id!),
    enabled: Boolean(id),
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      providerId: string;
      vehicleId?: string;
      connectorType: ConnectorType;
      scheduledAt: string;
      notes?: string;
      driverLatitude?: number;
      driverLongitude?: number;
    }) => bookingsApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

function useInvalidateBookings() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.providers.stats() });
  };
}

export function useUpdateBookingStatus() {
  const invalidate = useInvalidateBookings();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: {
        status: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
        kwhDelivered?: number;
        cancelReason?: string;
        paymentMethod?: PaymentMethod;
      };
    }) => bookingsApi.updateStatus(id, body),
    onSuccess: (booking) => {
      queryClient.setQueryData(queryKeys.bookings.detail(booking.id), booking);
      invalidate();
    },
  });
}

export function useSettleOfflinePayment() {
  const invalidate = useInvalidateBookings();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, method }: { id: string; method: 'CASH' | 'UPI' }) =>
      bookingsApi.settleOfflinePayment(id, method),
    onSuccess: (booking) => {
      queryClient.setQueryData(queryKeys.bookings.detail(booking.id), booking);
      invalidate();
    },
  });
}

export function useCancelBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      bookingsApi.cancel(id, reason),
    onSuccess: invalidate,
  });
}

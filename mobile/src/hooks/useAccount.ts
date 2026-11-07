import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  favoritesApi,
  notificationsApi,
  usersApi,
  vehiclesApi,
  type VehicleInput,
} from '@/lib/endpoints';
import { queryKeys } from '@/lib/queryClient';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types/api';

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile(),
    queryFn: () => usersApi.me(),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);
  const current = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: (body: { fullName?: string; email?: string; avatarUrl?: string }) =>
      usersApi.update(body),
    onSuccess: (user) => {
      const merged: User = { ...(current as User), ...user };
      updateUser(merged);
      queryClient.setQueryData(queryKeys.profile(), user);
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
    },
  });
}

export function useUserStats() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.stats(),
    queryFn: () => usersApi.stats(),
    enabled: Boolean(user),
  });
}

export function useVehicles() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.vehicles(),
    queryFn: () => vehiclesApi.list(),
    enabled: Boolean(user),
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: VehicleInput) => vehiclesApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats() });
    },
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<VehicleInput> }) =>
      vehiclesApi.update(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles() });
    },
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => vehiclesApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats() });
    },
  });
}

export function useFavorites() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.favorites(),
    queryFn: () => favoritesApi.list(),
    enabled: Boolean(user),
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ providerId, isFavorite }: { providerId: string; isFavorite: boolean }) => {
      if (isFavorite) {
        await favoritesApi.remove(providerId);
        return;
      }
      await favoritesApi.add(providerId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.favorites() });
    },
  });
}

export function useNotifications() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: () => notificationsApi.list(),
    enabled: Boolean(user),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useUnreadNotifications() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.notifications.unread(),
    queryFn: () => notificationsApi.unreadCount(),
    enabled: Boolean(user),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread() });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats() });
    },
  });
}

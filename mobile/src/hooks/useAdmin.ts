import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/endpoints';
import { queryKeys } from '@/lib/queryClient';
import { useAuthStore } from '@/store/auth';
import type { SubscriptionPlanOption } from '@/types/api';

export function useAdminStats() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.admin.stats(),
    queryFn: () => adminApi.stats(),
    enabled: user?.role === 'ADMIN',
  });
}

export function useAdminProviders(params: { status?: string; q?: string }) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.admin.providers(params),
    queryFn: async () => {
      const { data } = await adminApi.providers({ ...params, pageSize: 50 });
      return data;
    },
    enabled: user?.role === 'ADMIN',
  });
}

export function useReviewProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: 'APPROVED' | 'REJECTED' | 'SUSPENDED';
      note?: string;
    }) => adminApi.reviewProvider(id, { status, note }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['admin'] });
      // Optimistically update provider status in all cached provider lists
      queryClient.setQueriesData({ queryKey: ['admin', 'providers'] }, (old: any) => {
        if (!old) return old;
        return old.map((p: any) => p.id === id ? { ...p, verificationStatus: status } : p);
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useAdminUsers(params: { role?: string; q?: string }) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.admin.users(params),
    queryFn: async () => {
      const { data } = await adminApi.users({ ...params, pageSize: 50 });
      return data;
    },
    enabled: user?.role === 'ADMIN',
  });
}

export function useSetUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminApi.setUserStatus(id, isActive),
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: ['admin'] });
      // Optimistically update user isActive in all cached user lists
      queryClient.setQueriesData({ queryKey: ['admin', 'users'] }, (old: any) => {
        if (!old) return old;
        return old.map((u: any) => u.id === id ? { ...u, isActive } : u);
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useReviewDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      rejectionReason,
    }: {
      id: string;
      status: 'APPROVED' | 'REJECTED';
      rejectionReason?: string;
    }) => adminApi.reviewDocument(id, { status, rejectionReason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useAdminAuditLogs() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.admin.audit({ pageSize: 30 }),
    queryFn: async () => {
      const { data } = await adminApi.auditLogs({ pageSize: 30 });
      return data;
    },
    enabled: user?.role === 'ADMIN',
  });
}

export function useAdminBookings(params?: { status?: string; pageSize?: number }) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['admin', 'bookings', params],
    queryFn: async () => {
      const { data } = await adminApi.bookings(params);
      return data;
    },
    enabled: user?.role === 'ADMIN',
  });
}

export function useAdminPlans() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => adminApi.plans(),
    enabled: user?.role === 'ADMIN',
  });
}

export function useCreateAdminPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<SubscriptionPlanOption>) => adminApi.createPlan(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
      void queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
    },
  });
}

export function useUpdateAdminPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: Partial<SubscriptionPlanOption> }) =>
      adminApi.updatePlan(key, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
      void queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
    },
  });
}

export function useDeleteAdminPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => adminApi.deletePlan(key),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
      void queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
    },
  });
}

export function useAdminHelpdesk() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['admin', 'helpdesk'],
    queryFn: () => adminApi.helpdesk(),
    enabled: user?.role === 'ADMIN',
  });
}

export function useUpdateAdminHelpdesk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { status: string; note?: string } }) =>
      adminApi.updateHelpdeskTicket(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'helpdesk'] });
    },
  });
}

export function useAdminReviews() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['admin', 'reviews'],
    queryFn: () => adminApi.reviews(),
    enabled: user?.role === 'ADMIN',
  });
}

export function useDeleteAdminReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteReview(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bookingsApi,
  providersApi,
  reviewsApi,
  type NearbyParams,
  type ProviderCreateInput,
  type ProviderListParams,
} from '@/lib/endpoints';
import { queryKeys } from '@/lib/queryClient';
import { useAuthStore } from '@/store/auth';
import { joinProviderRoom } from '@/lib/socket';

export function useNearbyProviders(params: NearbyParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.providers.nearby(params),
    queryFn: () => providersApi.nearby(params),
    enabled: enabled && Number.isFinite(params.lat) && Number.isFinite(params.lng),
  });
}

export function useProviderList(params: ProviderListParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.providers.list(params),
    queryFn: async () => {
      const { data, meta } = await providersApi.list(params);
      return {
        items: data,
        total: Number(meta.total ?? data.length),
        page: Number(meta.page ?? 1),
        totalPages: Number(meta.totalPages ?? 1),
      };
    },
    enabled,
  });
}

export function useProvider(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.providers.detail(id ?? ''),
    queryFn: () => providersApi.detail(id!),
    enabled: Boolean(id),
  });
}

export function useProviderReviews(providerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reviews(providerId ?? ''),
    queryFn: async () => {
      const { data } = await reviewsApi.forProvider(providerId!, { pageSize: 20 });
      return data;
    },
    enabled: Boolean(providerId),
  });
}

export function useMyProvider() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.providers.mine(),
    queryFn: async () => {
      try {
        const prov = await providersApi.mine();
        if (prov?.id) {
          joinProviderRoom(prov.id);
        }
        return prov;
      } catch (err: any) {
        if (err?.status === 404 || err?.statusCode === 404 || err?.response?.status === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: Boolean(user && (user.role === 'PROVIDER' || user.providerProfile?.id)),
    retry: 0,
    staleTime: 60_000,
  });
}

export function useProviderStats() {
  const user = useAuthStore((s) => s.user);
  const isProv = user?.role === 'PROVIDER' || Boolean(user?.providerProfile);
  return useQuery({
    queryKey: queryKeys.providers.stats(),
    queryFn: () => bookingsApi.providerStats(),
    enabled: isProv,
    retry: 0,
  });
}

export function useProviderDocuments() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.providers.documents(),
    queryFn: () => providersApi.myDocuments(),
    enabled: user?.role === 'PROVIDER',
  });
}

export function useCreateProvider() {
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: (body: ProviderCreateInput) => providersApi.create(body),
    onSuccess: (provider) => {
      if (user) {
        updateUser({
          ...user,
          role: 'PROVIDER',
          providerProfile: {
            id: provider.id,
            verificationStatus: provider.verificationStatus,
            isVerified: provider.isVerified,
          },
        });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.providers.mine() });
    },
  });
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ProviderCreateInput> & { isOpenNow?: boolean }) =>
      providersApi.updateMine(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.providers.mine() });
    },
  });
}

export function useToggleOpen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (isOpenNow: boolean) => providersApi.toggleOpen(isOpenNow),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.providers.mine() });
    },
  });
}

export function useAddDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: string; fileUrl: string }) => providersApi.addDocument(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.providers.documents() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providers.mine() });
    },
  });
}

import { QueryClient } from '@tanstack/react-query';
import { clearRouteCache } from './maps';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 minute fresh window to prevent repetitive network fetches
      gcTime: 10 * 60_000, // 10 minutes cache retention for fast instant screen transitions
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export const queryKeys = {
  providers: {
    nearby: (params: unknown) => ['providers', 'nearby', params] as const,
    list: (params: unknown) => ['providers', 'list', params] as const,
    detail: (id: string) => ['providers', 'detail', id] as const,
    mine: () => ['providers', 'mine'] as const,
    stats: () => ['providers', 'stats'] as const,
    documents: () => ['providers', 'documents'] as const,
  },
  bookings: {
    list: (params: unknown) => ['bookings', 'list', params] as const,
    detail: (id: string) => ['bookings', 'detail', id] as const,
  },
  vehicles: () => ['vehicles'] as const,
  reviews: (providerId: string) => ['reviews', 'provider', providerId] as const,
  favorites: () => ['favorites'] as const,
  notifications: {
    list: () => ['notifications', 'list'] as const,
    unread: () => ['notifications', 'unread'] as const,
  },
  profile: () => ['profile'] as const,
  stats: () => ['profile', 'stats'] as const,
  admin: {
    stats: () => ['admin', 'stats'] as const,
    providers: (params: unknown) => ['admin', 'providers', params] as const,
    users: (params: unknown) => ['admin', 'users', params] as const,
    audit: (params: unknown) => ['admin', 'audit', params] as const,
  },
  search: (q: string) => ['search', q] as const,
};

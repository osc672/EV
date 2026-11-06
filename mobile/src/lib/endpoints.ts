import { apiDelete, apiGet, apiGetWithMeta, apiPatch, apiPost, apiPut, apiUpload } from './api';
import type {
  AdminBookingItem,
  AdminHelpdeskTicket,
  AdminReviewItem,
  AdminStats,
  AuthTokens,
  Booking,
  ConnectorType,
  Favorite,
  GeocodeResult,
  NearbyProvider,
  NotificationItem,
  Paginated,
  PaymentMethod,
  ProviderDetail,
  ProviderDocument,
  ProviderStats,
  ProviderSummary,
  ProviderType,
  Review,
  SubscriptionPlanOption,
  UploadedFile,
  User,
  Vehicle,
} from '@/types/api';

// ------------------------------------------------------------------
// Auth
// ------------------------------------------------------------------

export interface RegisterInput {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  role: 'DRIVER' | 'PROVIDER';
}

export const authApi = {
  register: (body: RegisterInput) => apiPost<AuthTokens>('/auth/register', body),
  login: (body: { phone: string; password: string }) => apiPost<AuthTokens>('/auth/login', body),
  requestOtp: (body: { phone: string; purpose?: string }) =>
    apiPost<{ message: string; devCode?: string }>('/auth/otp/request', body),
  verifyOtp: (body: { phone: string; code: string; purpose?: string }) =>
    apiPost<AuthTokens>('/auth/otp/verify', body),
  forgotPassword: (phone: string) =>
    apiPost<{ message: string; devCode?: string }>('/auth/password/forgot', { phone }),
  resetPassword: (body: { phone: string; code: string; newPassword: string }) =>
    apiPost<{ message: string }>('/auth/password/reset', body),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    apiPost<{ message: string }>('/auth/password/change', body),
  logout: (refreshToken?: string) => apiPost<{ message: string }>('/auth/logout', { refreshToken }),
  me: () => apiGet<User>('/auth/me'),
};

// ------------------------------------------------------------------
// Users
// ------------------------------------------------------------------

export const usersApi = {
  me: () => apiGet<User>('/users/me'),
  update: (body: { fullName?: string; email?: string; avatarUrl?: string }) =>
    apiPatch<User>('/users/me', body),
  stats: () =>
    apiGet<{ vehicles: number; bookings: number; favorites: number; unreadNotifications: number }>(
      '/users/me/stats',
    ),
};

// ------------------------------------------------------------------
// Providers
// ------------------------------------------------------------------

export interface ProviderCreateInput {
  businessName: string;
  providerType: ProviderType;
  description?: string;
  phone?: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
  openingTime?: string;
  closingTime?: string;
  pricePerKwh?: number;
  connectorTypes: ConnectorType[];
  maxPowerKw?: number;
  hasParking?: boolean;
  hasRestroom?: boolean;
  hasWifi?: boolean;
  hasCctv?: boolean;
  is24x7?: boolean;
  subscriptionPlan?: string;
  paymentMethod?: string;
  paymentTransactionId?: string;
}

export interface NearbyParams {
  lat: number;
  lng: number;
  radiusKm?: number;
  connector?: ConnectorType;
  providerType?: ProviderType;
  availableOnly?: boolean;
  limit?: number;
}

export interface ProviderListParams {
  city?: string;
  providerType?: ProviderType;
  connector?: ConnectorType;
  q?: string;
  page?: number;
  pageSize?: number;
}

export const providersApi = {
  nearby: (params: NearbyParams) =>
    apiGet<NearbyProvider[]>('/providers/nearby', { params }),
  list: (params: ProviderListParams) =>
    apiGetWithMeta<ProviderSummary[]>('/providers', { params }),
  detail: (id: string) => apiGet<ProviderDetail>(`/providers/${id}`),
  create: (body: ProviderCreateInput) => apiPost<ProviderDetail>('/providers', body),
  mine: () => apiGet<ProviderDetail>('/providers/me'),
  updateMine: (body: Partial<ProviderCreateInput> & { isOpenNow?: boolean }) =>
    apiPatch<ProviderDetail>('/providers/me', body),
  myDocuments: () => apiGet<ProviderDocument[]>('/providers/me/documents'),
  addDocument: (body: { type: string; fileUrl: string }) =>
    apiPost<ProviderDocument>('/providers/me/documents', body),
  setAvailability: (
    days: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[],
  ) => apiPut<ProviderDocument[]>('/providers/me/availability', { days }),
  toggleOpen: (isOpenNow: boolean) =>
    apiPatch<ProviderDetail>('/providers/me/open', { isOpenNow }),
  plans: () => apiGet<SubscriptionPlanOption[]>('/providers/plans'),
};

// ------------------------------------------------------------------
// Bookings
// ------------------------------------------------------------------

export const bookingsApi = {
  create: (body: {
    providerId: string;
    vehicleId?: string;
    connectorType: ConnectorType;
    scheduledAt: string;
    notes?: string;
  }) => apiPost<Booking>('/bookings', body),
  list: (params: { role?: 'driver' | 'provider'; status?: string; page?: number; pageSize?: number }) =>
    apiGetWithMeta<Booking[]>('/bookings', { params }),
  detail: (id: string) => apiGet<Booking>(`/bookings/${id}`),
  updateStatus: (
    id: string,
    body: {
      status: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
      kwhDelivered?: number;
      cancelReason?: string;
      paymentMethod?: PaymentMethod;
    },
  ) => apiPatch<Booking>(`/bookings/${id}/status`, body),
  cancel: (id: string, reason?: string) =>
    apiPost<Booking>(`/bookings/${id}/cancel`, { reason }),
  settleOfflinePayment: (id: string, method: 'CASH' | 'UPI') =>
    apiPost<Booking>(`/bookings/${id}/pay`, { method }),
  providerStats: () => apiGet<ProviderStats>('/bookings/stats/provider'),
};

// ------------------------------------------------------------------
// Vehicles
// ------------------------------------------------------------------

export interface VehicleInput {
  make: string;
  model: string;
  connectorType: ConnectorType;
  batteryCapacityKwh?: number;
  registrationNumber?: string;
  isPrimary?: boolean;
}

export const vehiclesApi = {
  list: () => apiGet<Vehicle[]>('/vehicles'),
  create: (body: VehicleInput) => apiPost<Vehicle>('/vehicles', body),
  update: (id: string, body: Partial<VehicleInput>) => apiPatch<Vehicle>(`/vehicles/${id}`, body),
  remove: (id: string) => apiDelete(`/vehicles/${id}`),
};

// ------------------------------------------------------------------
// Reviews / favorites / notifications
// ------------------------------------------------------------------

export const reviewsApi = {
  forProvider: (providerId: string, params?: { page?: number; pageSize?: number }) =>
    apiGetWithMeta<Review[]>(`/reviews/provider/${providerId}`, { params }),
  create: (body: { bookingId?: string; providerId?: string; rating: number; comment?: string }) =>
    apiPost<Review>('/reviews', body),
  mine: () => apiGet<Review[]>('/reviews/mine'),
};

export const favoritesApi = {
  list: () => apiGet<Favorite[]>('/favorites'),
  add: (providerId: string) => apiPost<Favorite>('/favorites', { providerId }),
  remove: (providerId: string) => apiDelete(`/favorites/${providerId}`),
};

export const notificationsApi = {
  list: () => apiGet<NotificationItem[]>('/notifications'),
  unreadCount: () => apiGet<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => apiPatch<{ message: string }>(`/notifications/${id}/read`),
  markAllRead: () => apiPatch<{ message: string }>('/notifications/read-all'),
  submitSupport: (body: { subject: string; message: string }) =>
    apiPost<{ message: string; adminEmail: string }>('/notifications/support', body),
};

// ------------------------------------------------------------------
// Search / uploads / payments
// ------------------------------------------------------------------

export const searchApi = {
  providers: (params: { q: string; connector?: ConnectorType; providerType?: ProviderType; limit?: number }) =>
    apiGet<ProviderSummary[]>('/search/providers', { params }),
  geocode: (q: string) => apiGet<GeocodeResult[]>('/search/geocode', { params: { q } }),
  route: (params: { fromLat: number; fromLng: number; toLat: number; toLng: number }) =>
    apiGet<{ distanceMeters: number | null; durationSeconds: number | null; polyline: string | null }>(
      '/search/route',
      { params },
    ),
};

export const uploadsApi = {
  image: async (uri: string, folder: 'avatars' | 'providers' | 'documents') => {
    const form = new FormData();
    const rawName = uri.split('/').pop() || `upload-${Date.now()}.jpg`;
    const cleanName = rawName.includes('.') ? rawName : `${rawName}.jpg`;
    const extension = cleanName.split('.').pop()?.toLowerCase();
    const mime =
      extension === 'png'
        ? 'image/png'
        : extension === 'webp'
          ? 'image/webp'
          : 'image/jpeg';

    form.append('file', {
      uri,
      name: cleanName,
      type: mime,
    } as unknown as Blob);

    return apiUpload<UploadedFile>(`/uploads/image?folder=${folder}`, form);
  },
};

export const paymentsApi = {
  createOrder: (bookingId: string) =>
    apiPost<{ orderId: string; amount: number; currency: string; keyId: string }>(
      '/payments/razorpay/order',
      { bookingId },
    ),
  verify: (data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    apiPost<{ status: string }>('/payments/razorpay/verify', data),
};

// ------------------------------------------------------------------
// Admin
// ------------------------------------------------------------------

export const adminApi = {
  stats: () => apiGet<AdminStats>('/admin/stats'),
  users: (params: { page?: number; pageSize?: number; role?: string; q?: string }) =>
    apiGetWithMeta<User[]>('/admin/users', { params }),
  setUserStatus: (id: string, isActive: boolean) =>
    apiPatch<{ id: string; isActive: boolean }>(`/admin/users/${id}/status`, { isActive }),
  providers: (params: { page?: number; pageSize?: number; status?: string; q?: string }) =>
    apiGetWithMeta<ProviderDetail[]>('/admin/providers', { params }),
  reviewProvider: (id: string, body: { status: 'APPROVED' | 'REJECTED' | 'SUSPENDED'; note?: string }) =>
    apiPatch<ProviderDetail>(`/admin/providers/${id}/review`, body),
  reviewDocument: (id: string, body: { status: 'APPROVED' | 'REJECTED'; rejectionReason?: string }) =>
    apiPatch<ProviderDocument>(`/admin/documents/${id}/review`, body),
  plans: () => apiGet<SubscriptionPlanOption[]>('/admin/plans'),
  createPlan: (body: Partial<SubscriptionPlanOption>) =>
    apiPost<SubscriptionPlanOption>('/admin/plans', body),
  updatePlan: (key: string, body: Partial<SubscriptionPlanOption>) =>
    apiPut<SubscriptionPlanOption>(`/admin/plans/${key}`, body),
  deletePlan: (key: string) =>
    apiDelete<{ success: boolean; deletedKey: string }>(`/admin/plans/${key}`),
  helpdesk: () => apiGet<AdminHelpdeskTicket[]>('/admin/helpdesk'),
  updateHelpdeskTicket: (id: string, body: { status: string; note?: string }) =>
    apiPatch<AdminHelpdeskTicket>(`/admin/helpdesk/${id}`, body),
  reviews: () => apiGet<AdminReviewItem[]>('/admin/reviews'),
  deleteReview: (id: string) => apiDelete(`/admin/reviews/${id}`),
  bookings: (params?: { page?: number; pageSize?: number; status?: string }) =>
    apiGetWithMeta<AdminBookingItem[]>('/admin/bookings', { params }),
  auditLogs: (params: { page?: number; pageSize?: number }) =>
    apiGetWithMeta<
      {
        id: string;
        action: string;
        entity: string;
        entityId: string | null;
        createdAt: string;
        actor?: { fullName: string };
        metadata?: Record<string, unknown> | null;
      }[]
    >('/admin/audit-logs', { params }),
};

export type PaginatedMeta = Record<string, unknown>;

export function toPaginated<T>(data: T[], meta: Record<string, unknown>): Paginated<T> {
  return {
    items: data,
    total: Number(meta.total ?? data.length),
    page: Number(meta.page ?? 1),
    pageSize: Number(meta.pageSize ?? data.length),
    totalPages: Number(meta.totalPages ?? 1),
  };
}

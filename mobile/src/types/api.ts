export type Role = 'DRIVER' | 'PROVIDER' | 'ADMIN';

export type ConnectorType =
  | 'TYPE_2'
  | 'CCS2'
  | 'CHADEMO'
  | 'TYPE_1'
  | 'GB_T'
  | 'AC_3_PIN'
  | 'OTHER';

export type ProviderType = 'HOME' | 'SHOP' | 'OFFICE' | 'HOTEL' | 'REPAIR_SHOP' | 'BUSINESS';

export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';
export type PaymentMethod = 'CASH' | 'UPI' | 'RAZORPAY';

export type DocumentType =
  | 'ID_PROOF'
  | 'ADDRESS_PROOF'
  | 'OWNERSHIP_PROOF'
  | 'ELECTRICITY_BILL'
  | 'BUSINESS_LICENSE'
  | 'CHARGER_PHOTO'
  | 'SITE_PHOTO'
  | 'OTHER';

export interface User {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  role: Role;
  avatarUrl: string | null;
  isPhoneVerified: boolean;
  isActive: boolean;
  createdAt: string;
  providerProfile?: {
    id: string;
    verificationStatus: VerificationStatus;
    isVerified: boolean;
  } | null;
  totalSpent?: number;
  totalBookings?: number;
  vehicles?: Vehicle[];
  bookings?: any[];
  _count?: { bookings?: number; vehicles?: number; reviews?: number };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresAt?: string;
  user: User;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
  distanceKm?: number;
}

export interface ProviderSummary {
  id: string;
  userId: string;
  businessName: string;
  providerType: ProviderType;
  description: string | null;
  phone: string | null;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  location: GeoPoint | null;
  openingTime: string;
  closingTime: string;
  isOpenNow: boolean;
  isVerified: boolean;
  verificationStatus: VerificationStatus;
  verificationNote: string | null;
  rating: string | number;
  avgRating?: number | string | null;
  revenueEarned?: number;
  totalReviews: number;
  totalBookings: number;
  pricePerKwh: string | number | null;
  connectorTypes: ConnectorType[];
  maxPowerKw: number;
  hasParking: boolean;
  hasRestroom: boolean;
  hasWifi: boolean;
  hasCctv: boolean;
  is24x7: boolean;
  subscriptionPlan?: string | null;
  subscriptionStatus?: 'ACTIVE' | 'EXPIRED' | 'PENDING' | null;
  subscriptionExpiresAt?: string | null;
  planPrice?: string | number | null;
  planPriority?: number;
  planMinRadiusM?: number;
  planMaxRadiusM?: number;
  documents?: ProviderDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface ProviderDocument {
  id: string;
  providerId: string;
  type: DocumentType;
  fileUrl: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  createdAt: string;
}

export interface ProviderAvailability {
  id: string;
  providerId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export interface ProviderDetail extends ProviderSummary {
  documents?: ProviderDocument[];
  availability?: ProviderAvailability[];
  totalRevenue?: number;
  bookings?: any[];
  user?: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    avatarUrl?: string | null;
    isPhoneVerified?: boolean;
  };
  _count?: { reviews: number; bookings: number };
}

export interface Vehicle {
  id: string;
  userId: string;
  make: string;
  model: string;
  connectorType: ConnectorType;
  batteryCapacityKwh: string | number | null;
  registrationNumber: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  amount: string | number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  gateway: string | null;
  gatewayOrderId: string | null;
}

export interface Review {
  id: string;
  bookingId: string;
  driverId: string;
  providerId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  driver?: { fullName: string; avatarUrl: string | null };
  provider?: { id: string; businessName: string };
}

export interface Booking {
  id: string;
  code: string;
  driverId: string;
  providerId: string;
  vehicleId: string | null;
  status: BookingStatus;
  connectorType: ConnectorType;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  kwhDelivered: string | number | null;
  estimatedCost: string | number | null;
  totalAmount: string | number | null;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  provider: Partial<ProviderSummary> & { user?: { id: string; phone: string } };
  driver: { id: string; fullName: string; phone: string; avatarUrl: string | null; isPhoneVerified?: boolean };
  vehicle: Vehicle | null;
  payment: Payment | null;
  review: Review | null;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  channel: 'PUSH' | 'SMS' | 'EMAIL' | 'IN_APP';
  readAt: string | null;
  createdAt: string;
}

export interface Favorite {
  id: string;
  userId: string;
  providerId: string;
  createdAt: string;
  provider: ProviderDetail;
}

export interface ProviderStats {
  todayBookings: number;
  monthBookings: number;
  completedBookings: number;
  pendingRequests: number;
  totalRevenue: number;
  rating: number;
  totalReviews: number;
}

export interface NearbyProvider extends ProviderDetail {
  location: GeoPoint;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminStats {
  users: number;
  drivers: number;
  providers: number;
  pendingProviders: number;
  bookings: number;
  completedBookings: number;
  grossRevenue: number;
  reviews: number;
  helpdeskTickets?: number;
}

export interface SubscriptionPlanOption {
  key: string;
  name: string;
  durationLabel: string;
  price: number;
  priceFormatted: string;
  minRadiusM: number;
  maxRadiusM: number;
  visibilityRange: string;
  priorityLabel: string;
  priorityTier: number;
  badge?: string;
  badgeColor?: string;
  features: string[];
}

export interface AdminHelpdeskTicket {
  id: string;
  action: string;
  entity: string;
  createdAt: string;
  metadata?: {
    subject?: string;
    message?: string;
    senderName?: string;
    phone?: string;
    email?: string;
    ticketStatus?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    resolutionNote?: string;
  } | null;
  actor?: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    role: Role;
    avatarUrl?: string | null;
  } | null;
}

export interface AdminReviewItem {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  driver?: {
    id: string;
    fullName: string;
    phone: string;
    avatarUrl?: string | null;
  } | null;
  provider?: {
    id: string;
    businessName: string;
    city: string;
    phone?: string | null;
  } | null;
  booking?: {
    id: string;
    code: string;
    scheduledAt: string;
    status: BookingStatus;
  } | null;
}

export interface AdminBookingItem {
  id: string;
  code: string;
  status: BookingStatus;
  scheduledAt: string;
  createdAt: string;
  totalAmount?: number | null;
  estimatedCost?: number | null;
  connectorType?: ConnectorType;
  driver?: {
    id: string;
    fullName: string;
    phone: string;
    email?: string | null;
  } | null;
  provider?: {
    id: string;
    businessName: string;
    city: string;
    phone?: string | null;
  } | null;
  vehicle?: {
    make: string;
    model: string;
    registrationNumber?: string | null;
  } | null;
}

export interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
  provider: string;
}

export interface UploadedFile {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

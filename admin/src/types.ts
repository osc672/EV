export interface AdminUser {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: 'DRIVER' | 'PROVIDER' | 'ADMIN';
  isActive: boolean;
  isPhoneVerified: boolean;
  createdAt: string;
}

export interface ProviderDocument {
  id: string;
  type: string;
  fileUrl: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
}

export interface ProviderProfile {
  id: string;
  userId: string;
  businessName: string;
  providerType: string;
  verificationStatus: 'NOT_SUBMITTED' | 'PENDING' | 'UNDER_REVIEW' | 'CLARIFICATION_REQUIRED' | 'RESUBMITTED' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  isVerified: boolean;
  verificationNote?: string | null;
  photoUrl?: string | null;
  address?: string | null;
  city?: string | null;
  totalChargingPoints: number;
  maxPowerKw: number;
  pricePerKwh?: number | null;
  flatRate?: number | null;
  user: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    avatarUrl?: string | null;
  };
  documents: ProviderDocument[];
  _count?: {
    bookings: number;
    reviews: number;
  };
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
}

export interface Booking {
  id: string;
  status: string;
  connectorType: string;
  powerKw: number;
  startTime: string;
  endTime: string;
  totalAmount: number;
  createdAt: string;
  driver?: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
  };
  provider?: {
    id: string;
    businessName: string;
    city: string | null;
    phone?: string;
  };
  payment?: {
    id: string;
    status: string;
    amount: number;
    method?: string;
  } | null;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  ip: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor: {
    fullName: string;
    phone: string;
  };
}


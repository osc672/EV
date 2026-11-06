import { z } from 'zod';
import { connectorEnum } from '../providers/providers.schema';

export const createBookingSchema = z.object({
  providerId: z.string().uuid(),
  vehicleId: z.string().uuid().optional(),
  connectorType: connectorEnum,
  scheduledAt: z
    .string()
    .datetime({ message: 'scheduledAt must be an ISO 8601 datetime' }),
  notes: z.string().trim().max(500).optional(),
  driverLatitude: z.number().optional(),
  driverLongitude: z.number().optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  kwhDelivered: z.coerce.number().min(0).max(1000).optional(),
  cancelReason: z.string().trim().max(300).optional(),
  paymentMethod: z.enum(['CASH', 'UPI', 'RAZORPAY']).optional(),
});

export const bookingQuerySchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  role: z.enum(['driver', 'provider']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateBookingStatusInput = z.infer<typeof updateStatusSchema>;

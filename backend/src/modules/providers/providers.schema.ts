import { z } from 'zod';

export const connectorEnum = z.enum([
  'TYPE_2',
  'CCS2',
  'CHADEMO',
  'TYPE_1',
  'GB_T',
  'AC_3_PIN',
  'OTHER',
]);

export const providerTypeEnum = z.enum([
  'HOME',
  'SHOP',
  'OFFICE',
  'HOTEL',
  'REPAIR_SHOP',
  'BUSINESS',
]);

export const createProviderSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  providerType: providerTypeEnum,
  description: z.string().trim().max(1000).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/)
    .optional(),
  addressLine: z.string().trim().min(3).max(300),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120),
  pincode: z.string().trim().regex(/^\d{4,10}$/),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  openingTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default('08:00'),
  closingTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default('22:00'),
  pricePerKwh: z.coerce.number().min(0).max(10000).optional(),
  connectorTypes: z.array(connectorEnum).min(1, 'Select at least one connector type'),
  maxPowerKw: z.coerce.number().int().min(1).max(1000).default(3),
  hasParking: z.boolean().default(false),
  hasRestroom: z.boolean().default(false),
  hasWifi: z.boolean().default(false),
  hasCctv: z.boolean().default(false),
  is24x7: z.boolean().default(false),
  subscriptionPlan: z.string().min(1).default('MONTH_1'),
  paymentMethod: z.enum(['UPI', 'CARD', 'NETBANKING', 'CASH']).optional(),
  paymentTransactionId: z.string().optional(),
});

export const updateProviderSchema = createProviderSchema.partial().extend({
  isOpenNow: z.boolean().optional(),
});

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.5).max(100).default(10),
  connector: connectorEnum.optional(),
  providerType: providerTypeEnum.optional(),
  availableOnly: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const listQuerySchema = z.object({
  city: z.string().trim().optional(),
  providerType: providerTypeEnum.optional(),
  connector: connectorEnum.optional(),
  q: z.string().trim().max(160).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const documentSchema = z.object({
  type: z.enum([
    'ID_PROOF',
    'ADDRESS_PROOF',
    'OWNERSHIP_PROOF',
    'ELECTRICITY_BILL',
    'BUSINESS_LICENSE',
    'CHARGER_PHOTO',
    'SITE_PHOTO',
    'OTHER',
  ]),
  fileUrl: z.string().url(),
});

export const availabilitySchema = z.object({
  days: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        isClosed: z.boolean().default(false),
      }),
    )
    .min(1),
});

export type CreateProviderInput = z.infer<typeof createProviderSchema>;
export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;

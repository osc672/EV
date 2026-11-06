import { createProviderSchema, nearbyQuerySchema } from '../src/modules/providers/providers.schema';
import { registerSchema } from '../src/modules/auth/auth.schema';
import { createBookingSchema } from '../src/modules/bookings/bookings.schema';

describe('zod request schemas', () => {
  it('accepts a valid provider payload', () => {
    const result = createProviderSchema.safeParse({
      businessName: 'Patil Store',
      providerType: 'SHOP',
      addressLine: 'Main Road',
      city: 'Pune',
      state: 'MH',
      pincode: '411001',
      latitude: 18.5,
      longitude: 73.8,
      connectorTypes: ['TYPE_2'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a provider with no connector types', () => {
    const result = createProviderSchema.safeParse({
      businessName: 'X',
      providerType: 'SHOP',
      addressLine: 'Main Road',
      city: 'Pune',
      state: 'MH',
      pincode: '411001',
      latitude: 18.5,
      longitude: 73.8,
      connectorTypes: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects weak passwords on registration', () => {
    const result = registerSchema.safeParse({
      phone: '+919876543210',
      fullName: 'Test User',
      password: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('coerces nearby query params from strings', () => {
    const result = nearbyQuerySchema.parse({ lat: '18.5', lng: '73.8', radiusKm: '5' });
    expect(result.lat).toBe(18.5);
    expect(result.radiusKm).toBe(5);
  });

  it('requires an ISO datetime for bookings', () => {
    const ok = createBookingSchema.safeParse({
      providerId: '11111111-1111-4111-8111-111111111111',
      connectorType: 'TYPE_2',
      scheduledAt: new Date().toISOString(),
    });
    expect(ok.success).toBe(true);

    const bad = createBookingSchema.safeParse({
      providerId: '11111111-1111-4111-8111-111111111111',
      connectorType: 'TYPE_2',
      scheduledAt: 'tomorrow',
    });
    expect(bad.success).toBe(false);
  });
});

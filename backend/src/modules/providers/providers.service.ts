import { Prisma, ProviderType, ConnectorType } from '../../generated/prisma';
import { prisma } from '../../lib/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { appCache, cached, TTL } from '../../lib/cache';
import {
  CreateProviderInput,
  UpdateProviderInput,
} from './providers.schema';

export interface GeoPoint {
  latitude: number;
  longitude: number;
  distanceKm?: number;
}

export interface NearbyRow {
  id: string;
  lat: number;
  lng: number;
  distance_m: number;
}

const providerInclude = {
  user: { select: { id: true, fullName: true, phone: true, avatarUrl: true, isPhoneVerified: true } },
  documents: { select: { id: true, type: true, status: true, fileUrl: true, createdAt: true } },
  availability: true,
  _count: { select: { reviews: true, bookings: true } },
} satisfies Prisma.ProviderProfileInclude;

export async function setLocation(providerId: string, latitude: number, longitude: number) {
  await prisma.$executeRaw`
    UPDATE "ProviderProfile"
    SET location = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        "updatedAt" = NOW()
    WHERE id = ${providerId}
  `;
  geoPointCache.delete(providerId);
}

const geoPointCache = new Map<string, { point: GeoPoint | null; expires: number }>();

export async function getGeoPoint(providerId: string): Promise<GeoPoint | null> {
  const cached = geoPointCache.get(providerId);
  if (cached && cached.expires > Date.now()) {
    return cached.point;
  }

  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "ProviderProfile"
    WHERE id = ${providerId} AND location IS NOT NULL
    LIMIT 1
  `;
  const point = !rows.length ? null : { latitude: Number(rows[0].lat), longitude: Number(rows[0].lng) };
  geoPointCache.set(providerId, { point, expires: Date.now() + 5 * 60 * 1000 });
  return point;
}

export async function createProvider(userId: string, input: CreateProviderInput) {
  const existing = await prisma.providerProfile.findUnique({ where: { userId } });
  if (existing) throw new ConflictError('You already have a provider profile');

  const {
    latitude,
    longitude,
    pricePerKwh,
    connectorTypes,
    subscriptionPlan,
    paymentMethod,
    paymentTransactionId,
    ...rest
  } = input;

  const plan = subscriptionPlan ?? 'MONTH_1';
  let planPrice = 350;
  let planMinRadiusM = 500;
  let planMaxRadiusM = 2000;
  let planPriority = 1;
  let durationDays = 30;

  if (plan === 'MONTH_5') {
    planPrice = 650;
    planMinRadiusM = 100;
    planMaxRadiusM = 5000;
    planPriority = 2;
    durationDays = 150;
  } else if (plan === 'YEAR_1') {
    planPrice = 1250;
    planMinRadiusM = 100;
    planMaxRadiusM = 10000;
    planPriority = 3;
    durationDays = 365;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + durationDays);

  const provider = await prisma.providerProfile.create({
    data: {
      userId,
      ...rest,
      isVerified: true,
      verificationStatus: 'APPROVED',
      subscriptionPlan: plan,
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: expiresAt,
      planPrice,
      planPriority,
      planMinRadiusM,
      planMaxRadiusM,
      pricePerKwh: pricePerKwh ?? null,
      connectorTypes: connectorTypes as ConnectorType[],
    } as any,
  });

  await setLocation(provider.id, latitude, longitude);

  // Upgrade the account role so provider-only endpoints become available.
  await prisma.user.update({ where: { id: userId }, data: { role: 'PROVIDER' } });

  // New provider registered — bust the nearby cache
  appCache.delByPrefix('nearby:');

  return getProviderById(provider.id);
}

export async function getMyProvider(userId: string) {
  const provider = await prisma.providerProfile.findUnique({
    where: { userId },
    include: providerInclude,
  });
  if (!provider) throw new NotFoundError('Provider profile not found');
  const geo = await getGeoPoint(provider.id);
  return { ...provider, location: geo };
}

export async function updateProvider(userId: string, input: UpdateProviderInput) {
  const provider = await prisma.providerProfile.findUnique({ where: { userId } });
  if (!provider) throw new NotFoundError('Provider profile not found');

  const { latitude, longitude, pricePerKwh, connectorTypes, ...rest } = input;

  const updateData: Prisma.ProviderProfileUpdateInput = { ...rest };
  if (pricePerKwh !== undefined) updateData.pricePerKwh = pricePerKwh;
  if (connectorTypes !== undefined) updateData.connectorTypes = connectorTypes as ConnectorType[];

  const updated = await prisma.providerProfile.update({
    where: { id: provider.id },
    data: updateData,
  });

  if (latitude !== undefined && longitude !== undefined) {
    await setLocation(updated.id, latitude, longitude);
  }

  // Bust nearby-search cache so updated provider data is reflected immediately
  appCache.delByPrefix('nearby:');

  return getProviderById(updated.id);
}

export async function getProviderById(id: string, includeDocs = true) {
  const provider = await prisma.providerProfile.findUnique({
    where: { id },
    include: includeDocs ? providerInclude : undefined,
  });
  if (!provider) throw new NotFoundError('Provider not found');
  const geo = await getGeoPoint(provider.id);
  return { ...provider, location: geo };
}

export async function listProviders(params: {
  city?: string;
  providerType?: ProviderType;
  connector?: ConnectorType;
  q?: string;
  page: number;
  pageSize: number;
}) {
  const { city, providerType, connector, q, page, pageSize } = params;
  const where: Prisma.ProviderProfileWhereInput = {
    verificationStatus: 'APPROVED',
    ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}),
    ...(providerType ? { providerType } : {}),
    ...(connector ? { connectorTypes: { has: connector } } : {}),
    ...(q
      ? {
          OR: [
            { businessName: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.providerProfile.count({ where }),
    prisma.providerProfile.findMany({
      where,
      include: { _count: { select: { reviews: true } } },
      orderBy: [{ rating: 'desc' }, { totalReviews: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function ensureProvidersApproved() {
  try {
    await prisma.providerProfile.updateMany({
      where: {
        OR: [
          { verificationStatus: 'PENDING' },
          { isVerified: false },
        ],
      },
      data: {
        verificationStatus: 'APPROVED',
        isVerified: true,
      },
    });
  } catch {
    // Non-fatal if database is initializing
  }
}

export async function findNearby(params: {
  lat: number;
  lng: number;
  radiusKm: number;
  connector?: ConnectorType;
  providerType?: ProviderType;
  availableOnly?: boolean;
  limit: number;
}) {
  // Cache key: round coords to 3dp (~110m grid) so nearby users share results
  const cacheKey = `nearby:${params.lat.toFixed(3)}:${params.lng.toFixed(3)}:${params.radiusKm}:${params.connector ?? ''}:${params.providerType ?? ''}:${params.availableOnly ? '1' : '0'}:${params.limit}`;
  return cached(cacheKey, TTL.SHORT, () => _findNearbyDB(params));
}

async function _findNearbyDB(params: {
  lat: number;
  lng: number;
  radiusKm: number;
  connector?: ConnectorType;
  providerType?: ProviderType;
  availableOnly?: boolean;
  limit: number;
}) {
  const { lat, lng, radiusKm, connector, providerType, availableOnly, limit } = params;
  // Search radius strictly honors the requested parameter (e.g. 500m, 1km, 2km, 5km, 10km)
  const radiusMeters = radiusKm * 1000;

  const rows = await prisma.$queryRaw<NearbyRow[]>`
    SELECT p.id,
           ST_Y(p.location::geometry) AS lat,
           ST_X(p.location::geometry) AS lng,
           ST_Distance(
             p.location,
             ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
           ) AS distance_m,
           COALESCE(p."planPriority", 1) AS priority,
           COALESCE(p."rating", 0) AS rating,
           COALESCE(p."totalReviews", 0) AS review_count
    FROM "ProviderProfile" p
    WHERE p.location IS NOT NULL
      AND p."verificationStatus" != 'REJECTED'
      ${availableOnly ? Prisma.sql`AND p."isOpenNow" = true` : Prisma.empty}
      ${connector ? Prisma.sql`AND ${connector}::"ConnectorType" = ANY(p."connectorTypes")` : Prisma.empty}
      ${providerType ? Prisma.sql`AND p."providerType" = ${providerType}::"ProviderType"` : Prisma.empty}
      AND ST_DWithin(
        p.location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
      )
      AND ST_Distance(
        p.location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      ) <= COALESCE(p."planMaxRadiusM", 10000)
    ORDER BY
      priority DESC,
      rating DESC,
      review_count DESC,
      distance_m ASC
    LIMIT ${limit}
  `;

  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const providers = await prisma.providerProfile.findMany({
    where: { id: { in: ids } },
    include: { _count: { select: { reviews: true } } },
  });
  const byId = new Map(providers.map((p) => [p.id, p]));

  return rows
    .map((row) => {
      const provider = byId.get(row.id);
      if (!provider) return null;
      return {
        ...provider,
        location: {
          latitude: Number(row.lat),
          longitude: Number(row.lng),
          distanceKm: Math.round((Number(row.distance_m) / 1000) * 100) / 100,
        },
      };
    })
    .filter(Boolean);
}

export async function assertProviderOwner(userId: string, providerId: string) {
  const provider = await prisma.providerProfile.findUnique({ where: { id: providerId } });
  if (!provider) throw new NotFoundError('Provider not found');
  if (provider.userId !== userId) {
    throw new ForbiddenError('You do not own this provider profile');
  }
  return provider;
}

export async function addDocument(
  userId: string,
  providerId: string,
  type: Parameters<typeof prisma.providerDocument.create>[0]['data']['type'],
  fileUrl: string,
) {
  await assertProviderOwner(userId, providerId);

  // If uploading payment QR scanner (type OTHER), clean up any previous QR scanner doc
  if (type === 'OTHER') {
    await prisma.providerDocument.deleteMany({
      where: { providerId, type: 'OTHER' },
    });
  }

  const doc = await prisma.providerDocument.create({
    data: {
      providerId,
      type,
      fileUrl,
      status: type === 'OTHER' ? 'APPROVED' : 'PENDING',
    },
  });

  // Only reset verification if it's a critical new station KYC document, not for QR scanner
  if (type !== 'OTHER') {
    const existing = await prisma.providerProfile.findUnique({
      where: { id: providerId },
      select: { verificationStatus: true },
    });
    if (existing?.verificationStatus !== 'APPROVED') {
      await prisma.providerProfile.update({
        where: { id: providerId },
        data: { verificationStatus: 'PENDING', verificationNote: null },
      });
    }
  }

  return doc;
}

export async function setAvailability(
  userId: string,
  providerId: string,
  days: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[],
) {
  await assertProviderOwner(userId, providerId);
  await prisma.$transaction(
    days.map((day) =>
      prisma.providerAvailability.upsert({
        where: { providerId_dayOfWeek: { providerId, dayOfWeek: day.dayOfWeek } },
        create: { providerId, ...day },
        update: day,
      }),
    ),
  );
  return prisma.providerAvailability.findMany({
    where: { providerId },
    orderBy: { dayOfWeek: 'asc' },
  });
}

export async function toggleOpen(userId: string, providerId: string, isOpenNow: boolean) {
  await assertProviderOwner(userId, providerId);
  return prisma.providerProfile.update({
    where: { id: providerId },
    data: { isOpenNow },
  });
}

/** Convenience: derive a provider's public phone for a confirmed booking only. */
export function assertProviderApproved(status: string) {
  if (status !== 'APPROVED') {
    throw new BadRequestError('This provider is not yet approved for bookings');
  }
}

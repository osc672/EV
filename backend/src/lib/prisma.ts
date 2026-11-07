import { PrismaClient } from '../generated/prisma';
import { logger } from './logger';
import { env } from '../config/env';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getPoolUrl(): string {
  let url = env.DATABASE_URL;
  if (!url) return url;
  if (!url.includes('connection_limit=')) {
    url += (url.includes('?') ? '&' : '?') + 'connection_limit=20&pool_timeout=15';
  }
  return url;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn', 'error'],
    datasources: {
      db: {
        url: getPoolUrl(),
      },
    },
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('database_connected');

  try {
    // Ensure PostGIS spatial index & high-frequency booking query indexes exist
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS provider_location_gix ON "ProviderProfile" USING GIST (location);
      CREATE INDEX IF NOT EXISTS booking_driver_status_idx ON "Booking" ("driverId", "status");
      CREATE INDEX IF NOT EXISTS booking_provider_status_idx ON "Booking" ("providerId", "status");
    `);
    logger.info('database_indexes_verified');
  } catch (err) {
    logger.warn('database_indexes_skipped', { error: String(err) });
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('Running database migration for Provider Subscription Plans...');

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ProviderProfile"
    ADD COLUMN IF NOT EXISTS "subscriptionPlan" VARCHAR(50) DEFAULT 'MONTH_1',
    ADD COLUMN IF NOT EXISTS "subscriptionStatus" VARCHAR(50) DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
    ADD COLUMN IF NOT EXISTS "planPrice" NUMERIC(10, 2) DEFAULT 350.00,
    ADD COLUMN IF NOT EXISTS "planPriority" INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "planMinRadiusM" INTEGER DEFAULT 500,
    ADD COLUMN IF NOT EXISTS "planMaxRadiusM" INTEGER DEFAULT 2000;
  `);

  console.log('Columns added or verified successfully!');

  // Update existing providers to 1 Year Premium plan (priority 3, 100m to 10km) so all current demo stations have top tier visibility
  await prisma.$executeRawUnsafe(`
    UPDATE "ProviderProfile"
    SET "subscriptionPlan" = 'YEAR_1',
        "subscriptionStatus" = 'ACTIVE',
        "subscriptionExpiresAt" = NOW() + INTERVAL '365 days',
        "planPrice" = 1250.00,
        "planPriority" = 3,
        "planMinRadiusM" = 100,
        "planMaxRadiusM" = 10000
    WHERE "subscriptionPlan" IS NULL OR "subscriptionPlan" = 'MONTH_1';
  `);

  const providers = await prisma.$queryRaw<any[]>`
    SELECT id, "businessName", "subscriptionPlan", "subscriptionStatus", "planPriority", "planMinRadiusM", "planMaxRadiusM"
    FROM "ProviderProfile"
  `;
  console.log('Providers subscription plans:', providers);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());


import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('Querying existing providers in database...');
  const providers = await prisma.providerProfile.findMany({
    include: { user: true, documents: true },
  });

  console.log(`Found ${providers.length} provider(s) in database.`);

  // Update existing providers to Benz Circle, Vijayawada, Andhra Pradesh
  // Benz Circle coordinates: Lat 16.5002, Lng 80.6480
  const lat = 16.5002;
  const lng = 80.6480;

  for (const p of providers) {
    console.log(`Updating provider ${p.id} (${p.businessName}) to Benz Circle, Vijayawada, AP...`);
    await prisma.providerProfile.update({
      where: { id: p.id },
      data: {
        addressLine: 'Near Benz Circle, Bandar Road',
        city: 'Vijayawada',
        state: 'Andhra Pradesh',
        pincode: '520010',
      },
    });

    await prisma.$executeRaw`
      UPDATE "ProviderProfile"
      SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          "updatedAt" = NOW()
      WHERE id = ${p.id}
    `;

    console.log(`Updated provider ${p.id} successfully!`);
  }

  // Also verify PostGIS locations
  const rows = await prisma.$queryRaw<any[]>`
    SELECT id, "businessName", city, state, "addressLine",
           ST_Y(location::geometry) AS lat,
           ST_X(location::geometry) AS lng
    FROM "ProviderProfile"
  `;
  console.log('Updated Provider PostGIS locations:', rows);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());


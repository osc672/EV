import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function clean() {
  console.log('🧹 Purging all mock data from database...');

  // Delete in foreign key order
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.review.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.providerDocument.deleteMany();
  await prisma.providerAvailability.deleteMany();
  await prisma.providerProfile.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.otpCode.deleteMany();

  // Keep admin user, delete all mock drivers & mock hosts
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      role: { not: 'ADMIN' },
    },
  });

  console.log(`✅ Successfully removed ${deletedUsers.count} mock users and all associated mock records.`);
  console.log('✨ Database is now clean and ready for real users, real vehicles, and real charging stations!');
}

clean()
  .catch((e) => {
    console.error('❌ Clean failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

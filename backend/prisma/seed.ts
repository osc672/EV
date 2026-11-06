import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@12345';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '+919999999999';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@evrescue.local';

const DRIVER_PASSWORD = 'Passw0rd!';
const DRIVER_PHONE = '+919800000001';
const DRIVER_EMAIL = 'driver@evrescue.local';

const PROVIDER_PASSWORD = 'Passw0rd!';
const PROVIDER_PHONE = '+919700000001';
const PROVIDER_EMAIL = 'provider@evrescue.local';

async function main() {
  console.log('🌱 Seeding EVRescue accounts...');

  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const driverHash = await bcrypt.hash(DRIVER_PASSWORD, 12);
  const providerHash = await bcrypt.hash(PROVIDER_PASSWORD, 12);

  // 1. Admin Account
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    update: { passwordHash: adminHash, role: 'ADMIN' },
    create: {
      phone: ADMIN_PHONE,
      email: ADMIN_EMAIL,
      fullName: 'EV Rescue Admin',
      role: 'ADMIN',
      passwordHash: adminHash,
      isPhoneVerified: true,
    },
  });

  // 2. Driver Account
  const driver = await prisma.user.upsert({
    where: { phone: DRIVER_PHONE },
    update: { passwordHash: driverHash, role: 'DRIVER' },
    create: {
      phone: DRIVER_PHONE,
      email: DRIVER_EMAIL,
      fullName: 'Asha Sharma',
      role: 'DRIVER',
      passwordHash: driverHash,
      isPhoneVerified: true,
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
    },
  });

  // Add primary EV vehicle for Driver
  const existingVehicle = await prisma.vehicle.findFirst({ where: { userId: driver.id } });
  if (!existingVehicle) {
    await prisma.vehicle.create({
      data: {
        userId: driver.id,
        make: 'Tata',
        model: 'Nexon EV Max',
        connectorType: 'CCS2',
        batteryCapacityKwh: 40.5,
        registrationNumber: 'AP 16 EV 1234',
        isPrimary: true,
      },
    });
  }

  // 3. Provider Account (Benz Circle, Vijayawada, Andhra Pradesh)
  const providerUser = await prisma.user.upsert({
    where: { phone: PROVIDER_PHONE },
    update: { passwordHash: providerHash, role: 'PROVIDER' },
    create: {
      phone: PROVIDER_PHONE,
      email: PROVIDER_EMAIL,
      fullName: 'Ramesh Reddy',
      role: 'PROVIDER',
      passwordHash: providerHash,
      isPhoneVerified: true,
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    },
  });

  // Provider Charging Station at Benz Circle, Vijayawada
  const existingProfile = await prisma.providerProfile.findUnique({
    where: { userId: providerUser.id },
  });

  const lat = 16.5002;
  const lng = 80.6480;

  let providerProfile = existingProfile;
  if (!providerProfile) {
    providerProfile = await prisma.providerProfile.create({
      data: {
        userId: providerUser.id,
        businessName: 'Benz Circle Fast EV Point',
        providerType: 'SHOP',
        description: 'High-speed emergency EV charger right at Benz Circle junction, Bandar Road. Restroom and parking available.',
        phone: PROVIDER_PHONE,
        addressLine: 'Near Benz Circle, Bandar Road / MG Road',
        city: 'Vijayawada',
        state: 'Andhra Pradesh',
        pincode: '520010',
        openingTime: '00:00',
        closingTime: '23:59',
        is24x7: true,
        isOpenNow: true,
        isVerified: true,
        verificationStatus: 'APPROVED',
        verificationNote: 'Verified premises and fast charger hardware by EVRescue Admin.',
        pricePerKwh: 18.5,
        connectorTypes: ['CCS2', 'TYPE_2', 'AC_3_PIN'],
        maxPowerKw: 50,
        hasParking: true,
        hasRestroom: true,
        hasWifi: true,
        hasCctv: true,
        rating: 4.9,
        totalReviews: 28,
        totalBookings: 142,
      },
    });

    await prisma.$executeRaw`
      UPDATE "ProviderProfile"
      SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          "updatedAt" = NOW()
      WHERE id = ${providerProfile.id}
    `;

    // Add verified charger document photo
    await prisma.providerDocument.create({
      data: {
        providerId: providerProfile.id,
        type: 'CHARGER_PHOTO',
        fileUrl: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800',
        status: 'APPROVED',
      },
    });
  } else {
    // Ensure existing profile has Benz Circle location and approved status
    await prisma.providerProfile.update({
      where: { id: providerProfile.id },
      data: {
        addressLine: 'Near Benz Circle, Bandar Road / MG Road',
        city: 'Vijayawada',
        state: 'Andhra Pradesh',
        pincode: '520010',
        verificationStatus: 'APPROVED',
        isVerified: true,
      },
    });

    await prisma.$executeRaw`
      UPDATE "ProviderProfile"
      SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          "updatedAt" = NOW()
      WHERE id = ${providerProfile.id}
    `;
  }

  console.log('✅ Accounts Ready:');
  console.log('====================================================');
  console.log('🛡️  ADMIN LOGIN (Hidden Console):');
  console.log('   Phone/Email : +919999999999 or admin@evrescue.local');
  console.log('   Password    : Admin@12345');
  console.log('   Shortcut    : Tap EV RESCUE logo 5 times on login');
  console.log('----------------------------------------------------');
  console.log('🚗 DRIVER LOGIN:');
  console.log('   Phone       : +919800000001');
  console.log('   Password    : Passw0rd!');
  console.log('----------------------------------------------------');
  console.log('⚡ PROVIDER LOGIN (Benz Circle, Vijayawada):');
  console.log('   Phone       : +919700000001');
  console.log('   Password    : Passw0rd!');
  console.log('====================================================');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

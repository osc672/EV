import { BookingStatus, Prisma } from '../../generated/prisma';
import { prisma } from '../../lib/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { randomBookingCode } from '../../lib/crypto';
import { notify } from '../../lib/notifications';
import { CreateBookingInput, UpdateBookingStatusInput } from './bookings.schema';
import { PrismaClientKnownRequestError } from '../../generated/prisma/runtime/library';
import { getGeoPoint } from '../providers/providers.service';
import { emitToUser, emitToProvider, emitToBooking, broadcastStationStatus, latestDriverLocations } from '../../lib/socket';
import { appCache } from '../../lib/cache';

const bookingInclude = {
  provider: {
    select: {
      id: true,
      userId: true,
      businessName: true,
      providerType: true,
      addressLine: true,
      city: true,
      state: true,
      phone: true,
      pricePerKwh: true,
      connectorTypes: true,
      isOpenNow: true,
      documents: { select: { id: true, type: true, status: true, fileUrl: true } },
    },
  },
  driver: { select: { id: true, fullName: true, phone: true, avatarUrl: true, isPhoneVerified: true } },
  vehicle: true,
  payment: true,
  review: true,
} satisfies Prisma.BookingInclude;

export async function createBooking(driverId: string, input: CreateBookingInput) {
  const provider = await prisma.providerProfile.findUnique({
    where: { id: input.providerId },
    include: { user: { select: { id: true } } },
  });
  if (!provider) throw new NotFoundError('Provider not found');
  if (provider.verificationStatus !== 'APPROVED') {
    throw new BadRequestError('This provider is not approved for bookings yet');
  }
  if (!provider.connectorTypes.includes(input.connectorType)) {
    throw new BadRequestError('This provider does not support the selected connector');
  }

  if (input.vehicleId) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId } });
    if (!vehicle || vehicle.userId !== driverId) {
      throw new NotFoundError('Vehicle not found');
    }
  }

  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new BadRequestError('Invalid scheduled time');
  }

  // Reject overlapping active bookings within a 60 minute window.
  const windowStart = new Date(scheduledAt.getTime() - 60 * 60 * 1000);
  const windowEnd = new Date(scheduledAt.getTime() + 60 * 60 * 1000);
  const conflict = await prisma.booking.findFirst({
    where: {
      providerId: provider.id,
      status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
      scheduledAt: { gte: windowStart, lte: windowEnd },
    },
  });
  if (conflict) {
    throw new ConflictError('This provider already has a booking around that time');
  }

  const created = await prisma.booking.create({
    data: {
      code: randomBookingCode(),
      driverId,
      providerId: provider.id,
      vehicleId: input.vehicleId,
      connectorType: input.connectorType,
      scheduledAt,
      notes: input.notes,
    },
    include: bookingInclude,
  });

  const slotTimeStr = scheduledAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const isToday = scheduledAt.toDateString() === new Date().toDateString();
  const timeDisplay = isToday ? `Today at ${slotTimeStr}` : `${scheduledAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at ${slotTimeStr}`;

  const notifTitle = 'New charging request';
  const notifBody = `${created.driver.fullName} requested a charging slot for ${timeDisplay}. Please confirm or decline.`;

  let notifId: string = '';
  try {
    const createdNotif = await prisma.notification.create({
      data: {
        userId: provider.userId,
        title: notifTitle,
        body: notifBody,
        data: { bookingId: created.id, type: 'BOOKING_CREATED' },
      },
    });
    notifId = createdNotif.id;
  } catch {
    // If notification creation fails, continue cleanly since booking is created
  }

  const booking = { created, notifTitle, notifBody, notifId };

  const geo = await getGeoPoint(provider.id);
  const result = {
    ...booking.created,
    provider: {
      ...booking.created.provider,
      location: geo,
    },
  };

  // Real-time dispatch to host (Rapido-style dispatch)
  const incomingPayload = {
    booking: result,
    providerId: provider.id,
    providerUserId: provider.userId,
    title: booking.notifTitle,
    body: booking.notifBody,
  };
  const notifPayload = {
    id: booking.notifId,
    title: booking.notifTitle,
    body: booking.notifBody,
    data: {
      bookingId: result.id,
      type: 'BOOKING_CREATED',
      providerId: provider.id,
      providerUserId: provider.userId,
    },
    booking: result,
    createdAt: new Date().toISOString(),
  };

  if (input.driverLatitude && input.driverLongitude) {
    latestDriverLocations.set(result.id, {
      latitude: input.driverLatitude,
      longitude: input.driverLongitude,
      driverId,
      timestamp: new Date().toISOString(),
    });
  }

  // Emit ONLY to the provider's private rooms — never broadcast to all clients
  emitToUser(provider.userId, 'booking:incoming', incomingPayload);
  emitToUser(provider.userId, 'notification:received', notifPayload);

  if (provider.id) {
    emitToProvider(provider.id, 'booking:incoming', incomingPayload);
    emitToProvider(provider.id, 'notification:received', notifPayload);
  }

  broadcastStationStatus(provider.id, false);
  appCache.delByPrefix('bookings-list:');

  appCache.delByPrefix('bookings-list:');
  return result;
}

export async function listBookings(
  userId: string,
  role: 'driver' | 'provider',
  params: { status?: BookingStatus; page: number; pageSize: number },
) {
  const cacheKey = `bookings-list:${userId}:${role}:${params.status ?? ''}:${params.page}:${params.pageSize}`;
  const cached = appCache.get<any>(cacheKey);
  if (cached) return cached;

  let where: Prisma.BookingWhereInput;
  if (role === 'provider') {
    const provider = await prisma.providerProfile.findUnique({ where: { userId } });
    if (!provider) throw new NotFoundError('Provider profile not found');
    where = { providerId: provider.id };
  } else {
    where = { driverId: userId };
  }
  if (params.status) where.status = params.status;

  const [total, items] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { scheduledAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ]);

  const providerIds = Array.from(new Set(items.map((i) => i.providerId)));
  let itemsWithGeo = items;
  if (providerIds.length > 0) {
    const geoRows = await prisma.$queryRaw<{ id: string; lat: number; lng: number }[]>`
      SELECT id, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM "ProviderProfile"
      WHERE id IN (${Prisma.join(providerIds)}) AND location IS NOT NULL
    `;
    const geoMap = new Map(
      geoRows.map((r) => [r.id, { latitude: Number(r.lat), longitude: Number(r.lng) }]),
    );
    itemsWithGeo = items.map((item) => ({
      ...item,
      provider: {
        ...item.provider,
        location: geoMap.get(item.providerId) ?? null,
      },
    }));
  }

  const result = {
    items: itemsWithGeo,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.ceil(total / params.pageSize),
  };
  appCache.set(cacheKey, result, 10_000); // 10 second cache
  return result;
}

export async function getBooking(userId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      ...bookingInclude,
      provider: { include: { user: { select: { id: true, phone: true } } } },
    },
  });
  if (!booking) throw new NotFoundError('Booking not found');

  const isDriver = booking.driverId === userId;
  const isProvider = booking.provider.userId === userId;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!isDriver && !isProvider && user?.role !== 'ADMIN') {
    throw new ForbiddenError('You cannot view this booking');
  }
  const geo = await getGeoPoint(booking.providerId);
  const driverLoc = latestDriverLocations.get(bookingId);
  return {
    ...booking,
    provider: {
      ...booking.provider,
      location: geo,
    },
    driverLocation: driverLoc ?? null,
  };
}

const allowedTransitions: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export async function updateStatus(
  userId: string,
  bookingId: string,
  input: UpdateBookingStatusInput,
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { provider: true, driver: true },
  });
  if (!booking) throw new NotFoundError('Booking not found');

  const isProvider = booking.provider.userId === userId;
  const isDriver = booking.driverId === userId;
  if (!isProvider && !isDriver) throw new ForbiddenError('You cannot modify this booking');

  const next = input.status;
  if (!allowedTransitions[booking.status].includes(next)) {
    throw new BadRequestError(
      `Cannot change status from ${booking.status} to ${next}`,
    );
  }

  // Providers drive the charging lifecycle; drivers may only cancel.
  if (!isProvider && next !== 'CANCELLED') {
    throw new ForbiddenError('Only the provider can advance this booking');
  }

  const data: Prisma.BookingUpdateInput = { status: next };

  if (next === 'CONFIRMED') {
    data.startedAt = booking.startedAt ?? undefined;
  }
  if (next === 'IN_PROGRESS') {
    data.startedAt = booking.startedAt ?? new Date();
  }
  if (next === 'CANCELLED') {
    data.cancelledAt = new Date();
    data.cancelReason = input.cancelReason;
  }

  if (next === 'COMPLETED') {
    const now = new Date();
    const startTime = booking.startedAt ? new Date(booking.startedAt) : new Date(now.getTime() - 15 * 60 * 1000);
    const elapsedHours = Math.max(1 / 60, (now.getTime() - startTime.getTime()) / (3600 * 1000));
    const powerKw = booking.provider.maxPowerKw ?? 3;
    const calculatedKwh = Math.round(elapsedHours * powerKw * 100) / 100;
    const kwh = input.kwhDelivered !== undefined && input.kwhDelivered > 0 ? input.kwhDelivered : calculatedKwh;
    const rate = booking.provider.pricePerKwh ? Number(booking.provider.pricePerKwh) : 20;
    const total = Math.max(20, Math.round(kwh * rate * 100) / 100);
    data.completedAt = now;
    data.kwhDelivered = kwh;
    data.totalAmount = total;
    data.estimatedCost = total;
    data.paymentStatus = 'PENDING';

    // Do NOT auto-mark as PAID! Payment must be collected via Cash or Scanner payment gateway.
    try {
      await prisma.providerProfile.update({
        where: { id: booking.providerId },
        data: { totalBookings: { increment: 1 } },
      });
    } catch {}
  }

  // Optimistic guard against concurrent transitions.
  const updateResult = await prisma.booking.updateMany({
    where: { id: bookingId, status: booking.status },
    data,
  });
  if (updateResult.count === 0) {
    throw new ConflictError('Booking was modified by another request. Refresh and retry.');
  }

  const updated = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingInclude,
  });

  // Notify the counterparty.
  const recipientId = isProvider ? booking.driverId : booking.provider.userId;
  const slotTimeStr = booking.scheduledAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const isToday = booking.scheduledAt.toDateString() === new Date().toDateString();
  const timeDisplay = isToday ? `Today at ${slotTimeStr}` : `${booking.scheduledAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at ${slotTimeStr}`;

  const isDeclinedByHost = isProvider && (next === 'CANCELLED' || next === 'NO_SHOW');

  const notifTitle = next === 'CONFIRMED'
    ? 'Charging slot confirmed'
    : isDeclinedByHost
      ? 'Charging request declined'
      : next === 'CANCELLED'
        ? 'Booking cancelled by driver'
        : `Booking ${next.toLowerCase()}`;
  const notifBody = next === 'CONFIRMED'
    ? `Your charging slot at ${booking.provider.businessName} is confirmed for ${timeDisplay}. Charger is ready.`
    : isDeclinedByHost
      ? `Your charging request at ${booking.provider.businessName} was declined${input.cancelReason ? ': ' + input.cancelReason : '. Please choose another charging point nearby.'}`
      : `Booking ${booking.code} is now ${next.replace('_', ' ').toLowerCase()}.`;

  if (recipientId) {
    try {
      await prisma.notification.create({
        data: {
          userId: recipientId,
          title: notifTitle,
          body: notifBody,
          data: { bookingId, type: isDeclinedByHost ? 'BOOKING_DECLINED' : `BOOKING_${next}` },
        },
      });
    } catch {}
    emitToUser(recipientId, 'notification:received', {
      title: notifTitle,
      body: notifBody,
      data: {
        bookingId,
        type: isDeclinedByHost ? 'BOOKING_DECLINED' : `BOOKING_${next}`,
        driverId: booking.driverId,
        providerUserId: booking.provider.userId,
      },
      booking: updated,
      createdAt: new Date().toISOString(),
    });
  }

  const geo = updated ? await getGeoPoint(updated.providerId) : null;
  const finalBooking = updated
    ? {
      ...updated,
      provider: {
        ...updated.provider,
        location: geo,
      },
    }
    : null;

  if (finalBooking) {
    // Real-time broadcast to both driver & host in the booking room
    emitToBooking(bookingId, 'booking:status_changed', {
      bookingId,
      status: next,
      booking: finalBooking,
    });

    if (next === 'CONFIRMED') {
      emitToBooking(bookingId, 'booking:confirmed', {
        bookingId,
        booking: finalBooking,
        driverId: booking.driverId,
        providerUserId: booking.provider.userId,
        title: notifTitle,
        body: notifBody,
      });
      emitToUser(booking.driverId, 'booking:confirmed', {
        bookingId,
        booking: finalBooking,
        driverId: booking.driverId,
        title: notifTitle,
        body: notifBody,
      });
    } else if (next === 'IN_PROGRESS') {
      emitToBooking(bookingId, 'charging:started', { bookingId, startedAt: finalBooking.startedAt });
    } else if (next === 'COMPLETED') {
      emitToBooking(bookingId, 'charging:completed', {
        bookingId,
        kwhDelivered: input.kwhDelivered,
        totalAmount: finalBooking.totalAmount,
      });
      broadcastStationStatus(booking.providerId, true);
    } else if (next === 'CANCELLED' || next === 'NO_SHOW') {
      const cancelPayload = {
        bookingId,
        reason: input.cancelReason,
        title: notifTitle,
        body: notifBody,
        isDeclinedByHost,
        booking: finalBooking,
      };
      emitToBooking(bookingId, 'booking:cancelled', cancelPayload);
      if (recipientId) {
        emitToUser(recipientId, 'booking:cancelled', cancelPayload);
      }
      broadcastStationStatus(booking.providerId, true);
    }
  }

  appCache.delByPrefix('bookings-list:');
  return finalBooking;
}

export async function cancelBooking(userId: string, bookingId: string, reason?: string) {
  return updateStatus(userId, bookingId, { status: 'CANCELLED', cancelReason: reason });
}

export async function settleOfflinePayment(
  userId: string,
  bookingId: string,
  method: 'CASH' | 'UPI' = 'UPI',
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { provider: true, driver: true },
  });
  if (!booking) throw new NotFoundError('Booking not found');

  const isDriver = booking.driverId === userId;
  const isProvider = booking.provider.userId === userId;
  if (!isDriver && !isProvider) throw new ForbiddenError('Not authorized for this booking');

  const amount = Number(booking.totalAmount ?? booking.estimatedCost ?? 150);

  await prisma.payment.upsert({
    where: { bookingId },
    create: {
      bookingId,
      amount,
      method,
      status: 'PAID',
      gateway: method === 'UPI' ? 'upi_scanner' : 'cash_station',
    },
    update: {
      amount,
      method,
      status: 'PAID',
      gateway: method === 'UPI' ? 'upi_scanner' : 'cash_station',
    },
  });

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus: 'PAID',
      paymentMethod: method,
    },
    include: bookingInclude,
  });

  const geo = await getGeoPoint(booking.providerId);
  const result = {
    ...updated,
    provider: { ...updated.provider, location: geo },
  };

  emitToBooking(bookingId, 'booking:status_changed', {
    bookingId,
    status: updated.status,
    paymentStatus: 'PAID',
    booking: result,
  });

  emitToBooking(bookingId, 'booking:status', {
    bookingId,
    status: updated.status,
    paymentStatus: 'PAID',
  });

  emitToUser(isDriver ? booking.provider.userId : booking.driverId, 'booking:status', {
    bookingId,
    status: updated.status,
    paymentStatus: 'PAID',
  });

  appCache.delByPrefix('bookings-list:');
  return result;
}

export async function getProviderStats(userId: string) {
  const provider = await prisma.providerProfile.findUnique({ where: { userId } });
  if (!provider) throw new NotFoundError('Provider profile not found');

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [today, month, completed, revenueAgg, pending] = await Promise.all([
    prisma.booking.count({ where: { providerId: provider.id, scheduledAt: { gte: startOfDay } } }),
    prisma.booking.count({ where: { providerId: provider.id, scheduledAt: { gte: startOfMonth } } }),
    prisma.booking.count({ where: { providerId: provider.id, status: 'COMPLETED' } }),
    prisma.booking.aggregate({
      where: { providerId: provider.id, status: 'COMPLETED' },
      _sum: { totalAmount: true },
    }),
    prisma.booking.count({ where: { providerId: provider.id, status: 'PENDING' } }),
  ]);

  return {
    todayBookings: today,
    monthBookings: month,
    completedBookings: completed,
    pendingRequests: pending,
    totalRevenue: Number(revenueAgg._sum.totalAmount ?? 0),
    rating: Number(provider.rating),
    totalReviews: provider.totalReviews,
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof PrismaClientKnownRequestError && error.code === 'P2002';
}

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { param } from '../../lib/params';
import { created, noContent, ok } from '../../lib/response';
import { prisma } from '../../lib/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';

const createReviewSchema = z.object({
  bookingId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const router = Router();

/**
 * @openapi
 * /reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Review a completed booking (driver only)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/',
  authenticate,
  validate(createReviewSchema),
  asyncHandler(async (req, res) => {
    const { bookingId, providerId, rating, comment } = req.body as z.infer<typeof createReviewSchema>;
    let targetBookingId = bookingId;
    let targetProviderId = providerId ?? '';

    if (!targetBookingId) {
      if (!targetProviderId) {
        throw new BadRequestError('Either bookingId or providerId is required');
      }

      // Check if driver has already reviewed this provider
      const existingUserReview = await prisma.review.findFirst({
        where: { driverId: req.user!.id, providerId: targetProviderId },
      });

      if (existingUserReview) {
        const updated = await prisma.$transaction(async (tx) => {
          const rev = await tx.review.update({
            where: { id: existingUserReview.id },
            data: { rating, comment },
          });
          const agg = await tx.review.aggregate({
            where: { providerId: targetProviderId },
            _avg: { rating: true },
            _count: { rating: true },
          });
          await tx.providerProfile.update({
            where: { id: targetProviderId },
            data: {
              rating: Math.round((agg._avg.rating ?? rating) * 100) / 100,
              totalReviews: agg._count.rating,
            },
          });
          return rev;
        });
        return ok(res, updated);
      }

      const completedBooking = await prisma.booking.findFirst({
        where: {
          driverId: req.user!.id,
          providerId: targetProviderId,
          status: 'COMPLETED',
          review: null,
        },
        orderBy: { completedAt: 'desc' },
      });

      if (!completedBooking) {
        const code = 'REV-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const autoBooking = await prisma.booking.create({
          data: {
            code,
            driverId: req.user!.id,
            providerId: targetProviderId,
            connectorType: 'TYPE_2',
            scheduledAt: new Date(),
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });
        targetBookingId = autoBooking.id;
      } else {
        targetBookingId = completedBooking.id;
      }
    } else {
      const booking = await prisma.booking.findUnique({ where: { id: targetBookingId } });
      if (!booking) throw new NotFoundError('Booking not found');
      if (booking.driverId !== req.user!.id) throw new ForbiddenError('Only the driver can review');
      if (booking.status !== 'COMPLETED') {
        throw new BadRequestError('Only completed bookings can be reviewed');
      }
      targetProviderId = booking.providerId;
    }

    const existing = await prisma.review.findUnique({ where: { bookingId: targetBookingId } });
    if (existing) throw new ConflictError('This booking has already been reviewed');

    const review = await prisma.$transaction(async (tx) => {
      const createdReview = await tx.review.create({
        data: {
          bookingId: targetBookingId,
          driverId: req.user!.id,
          providerId: targetProviderId,
          rating,
          comment,
        },
      });

      const agg = await tx.review.aggregate({
        where: { providerId: targetProviderId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      await tx.providerProfile.update({
        where: { id: targetProviderId },
        data: {
          rating: Math.round((agg._avg.rating ?? 0) * 100) / 100,
          totalReviews: agg._count.rating,
        },
      });

      return createdReview;
    });

    return created(res, review);
  }),
);

/**
 * @openapi
 * /reviews/provider/{providerId}:
 *   get:
 *     tags: [Reviews]
 *     summary: List reviews for a provider
 */
router.get(
  '/provider/:providerId',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as never as { page: number; pageSize: number };
    const where = { providerId: param(req, 'providerId') };
    const [total, items] = await prisma.$transaction([
      prisma.review.count({ where }),
      prisma.review.findMany({
        where,
        include: { driver: { select: { fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return ok(res, items, { total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  }),
);

/**
 * @openapi
 * /reviews/mine:
 *   get:
 *     tags: [Reviews]
 *     summary: List reviews written by me
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/mine',
  authenticate,
  asyncHandler(async (req, res) => {
    const reviews = await prisma.review.findMany({
      where: { driverId: req.user!.id },
      include: { provider: { select: { id: true, businessName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, reviews);
  }),
);

/**
 * @openapi
 * /reviews/{id}:
 *   delete:
 *     tags: [Reviews]
 *     summary: Delete my review
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const review = await prisma.review.findUnique({ where: { id: param(req, 'id') } });
    if (!review) throw new NotFoundError('Review not found');
    if (review.driverId !== req.user!.id) throw new ForbiddenError('Not your review');

    await prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: review.id } });
      const agg = await tx.review.aggregate({
        where: { providerId: review.providerId },
        _avg: { rating: true },
        _count: { rating: true },
      });
      await tx.providerProfile.update({
        where: { id: review.providerId },
        data: {
          rating: Math.round((agg._avg.rating ?? 0) * 100) / 100,
          totalReviews: agg._count.rating,
        },
      });
    });
    return noContent(res);
  }),
);

export default router;

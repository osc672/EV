import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { param } from '../../lib/params';
import { created, ok } from '../../lib/response';
import * as service from './bookings.service';
import { bookingQuerySchema, createBookingSchema, updateStatusSchema } from './bookings.schema';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';

const router = Router();

/**
 * @openapi
 * /bookings:
 *   post:
 *     tags: [Bookings]
 *     summary: Request a charging slot at a provider
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/',
  authenticate,
  validate(createBookingSchema),
  asyncHandler(async (req, res) => {
    return created(res, await service.createBooking(req.user!.id, req.body));
  }),
);

/**
 * @openapi
 * /bookings:
 *   get:
 *     tags: [Bookings]
 *     summary: List my bookings (driver or provider view)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  authenticate,
  validate(bookingQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as never as {
      status?: never;
      role?: 'driver' | 'provider';
      page: number;
      pageSize: number;
    };
    const role =
      q.role ??
      (req.user!.role === 'PROVIDER' ? 'provider' : 'driver');
    const result = await service.listBookings(req.user!.id, role, q as never);
    return ok(res, result.items, {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    });
  }),
);

/**
 * @openapi
 * /bookings/stats/provider:
 *   get:
 *     tags: [Bookings]
 *     summary: Provider dashboard statistics
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/stats/provider',
  authenticate,
  asyncHandler(async (req, res) => {
    return ok(res, await service.getProviderStats(req.user!.id));
  }),
);

/**
 * @openapi
 * /bookings/{id}:
 *   get:
 *     tags: [Bookings]
 *     summary: Get booking detail
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    return ok(res, await service.getBooking(req.user!.id, param(req, 'id')));
  }),
);

/**
 * @openapi
 * /bookings/{id}/status:
 *   patch:
 *     tags: [Bookings]
 *     summary: Advance or cancel a booking
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/:id/status',
  authenticate,
  validate(updateStatusSchema),
  asyncHandler(async (req, res) => {
    return ok(res, await service.updateStatus(req.user!.id, param(req, 'id'), req.body));
  }),
);

/**
 * @openapi
 * /bookings/{id}/cancel:
 *   post:
 *     tags: [Bookings]
 *     summary: Cancel a booking
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/:id/cancel',
  authenticate,
  asyncHandler(async (req, res) => {
    const reason = (req.body as { reason?: string }).reason;
    return ok(res, await service.cancelBooking(req.user!.id, param(req, 'id'), reason));
  }),
);

router.post(
  '/:id/pay',
  authenticate,
  asyncHandler(async (req, res) => {
    const method = ((req.body as { method?: string })?.method === 'CASH' ? 'CASH' : 'UPI') as 'CASH' | 'UPI';
    return ok(res, await service.settleOfflinePayment(req.user!.id, param(req, 'id'), method));
  }),
);

export default router;


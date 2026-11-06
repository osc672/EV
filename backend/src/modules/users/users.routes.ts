import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { ok } from '../../lib/response';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import { toSafeUser } from '../auth/auth.service';

const updateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
});

const router = Router();

/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get my profile
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { providerProfile: { select: { id: true, verificationStatus: true, isVerified: true } } },
    });
    if (!user) throw new NotFoundError('User not found');
    return ok(res, { ...toSafeUser(user), providerProfile: user.providerProfile });
  }),
);

/**
 * @openapi
 * /users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Update my profile
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/me',
  authenticate,
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: req.body,
    });
    return ok(res, toSafeUser(user));
  }),
);

/**
 * @openapi
 * /users/me/stats:
 *   get:
 *     tags: [Users]
 *     summary: Dashboard counts for the current user
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/me/stats',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const [vehicles, bookings, favorites, notifications] = await Promise.all([
      prisma.vehicle.count({ where: { userId } }),
      prisma.booking.count({ where: { driverId: userId } }),
      prisma.favorite.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return ok(res, { vehicles, bookings, favorites, unreadNotifications: notifications });
  }),
);

export default router;

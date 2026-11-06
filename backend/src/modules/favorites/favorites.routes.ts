import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { param } from '../../lib/params';
import { created, noContent, ok } from '../../lib/response';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';

const addSchema = z.object({ providerId: z.string().uuid() });
const router = Router();

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user!.id },
      include: { provider: { include: { _count: { select: { reviews: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, favorites);
  }),
);

router.post(
  '/',
  authenticate,
  validate(addSchema),
  asyncHandler(async (req, res) => {
    const provider = await prisma.providerProfile.findUnique({
      where: { id: req.body.providerId },
    });
    if (!provider) throw new NotFoundError('Provider not found');
    const favorite = await prisma.favorite.upsert({
      where: {
        userId_providerId: { userId: req.user!.id, providerId: req.body.providerId },
      },
      create: { userId: req.user!.id, providerId: req.body.providerId },
      update: {},
    });
    return created(res, favorite);
  }),
);

router.delete(
  '/:providerId',
  authenticate,
  asyncHandler(async (req, res) => {
    await prisma.favorite.deleteMany({
      where: { userId: req.user!.id, providerId: param(req, 'providerId') },
    });
    return noContent(res);
  }),
);

export default router;


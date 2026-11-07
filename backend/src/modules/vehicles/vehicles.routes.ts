import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { param } from '../../lib/params';
import { created, noContent, ok } from '../../lib/response';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import { connectorEnum } from '../providers/providers.schema';

const vehicleSchema = z.object({
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  connectorType: connectorEnum,
  batteryCapacityKwh: z.coerce.number().min(0).max(1000).optional(),
  registrationNumber: z.string().trim().max(30).optional(),
  isPrimary: z.boolean().default(false),
});

const router = Router();

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
    return ok(res, vehicles);
  }),
);

router.post(
  '/',
  authenticate,
  validate(vehicleSchema),
  asyncHandler(async (req, res) => {
    if (req.body.isPrimary) {
      await prisma.vehicle.updateMany({
        where: { userId: req.user!.id },
        data: { isPrimary: false },
      });
    }
    const vehicle = await prisma.vehicle.create({
      data: { ...req.body, userId: req.user!.id },
    });
    return created(res, vehicle);
  }),
);

router.patch(
  '/:id',
  authenticate,
  validate(vehicleSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.vehicle.findUnique({ where: { id: param(req, 'id') } });
    if (!existing || existing.userId !== req.user!.id) throw new NotFoundError('Vehicle not found');

    if (req.body.isPrimary) {
      await prisma.vehicle.updateMany({
        where: { userId: req.user!.id },
        data: { isPrimary: false },
      });
    }
    const vehicle = await prisma.vehicle.update({ where: { id: param(req, 'id') }, data: req.body });
    return ok(res, vehicle);
  }),
);

router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const existing = await prisma.vehicle.findUnique({ where: { id: param(req, 'id') } });
    if (!existing || existing.userId !== req.user!.id) throw new NotFoundError('Vehicle not found');
    await prisma.vehicle.delete({ where: { id: param(req, 'id') } });
    return noContent(res);
  }),
);

export default router;


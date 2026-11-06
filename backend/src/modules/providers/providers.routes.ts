import { Router } from 'express';
import { Role } from '../../generated/prisma';
import { authenticate, authorize, optionalAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { param } from '../../lib/params';
import { created, ok } from '../../lib/response';
import * as service from './providers.service';
import {
  availabilitySchema,
  createProviderSchema,
  documentSchema,
  listQuerySchema,
  nearbyQuerySchema,
  updateProviderSchema,
} from './providers.schema';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import { getAllPlans } from '../plans/plans.service';

const router = Router();

/**
 * @openapi
 * /providers/plans:
 *   get:
 *     tags: [Providers]
 *     summary: Get available subscription plans for providers
 */
router.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const plans = getAllPlans();
    return ok(res, plans);
  }),
);

/**
 * @openapi
 * /providers:
 *   post:
 *     tags: [Providers]
 *     summary: Create my provider profile
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/',
  authenticate,
  validate(createProviderSchema),
  asyncHandler(async (req, res) => {
    const provider = await service.createProvider(req.user!.id, req.body);
    return created(res, provider);
  }),
);

/**
 * @openapi
 * /providers/me:
 *   get:
 *     tags: [Providers]
 *     summary: Get my provider profile
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    return ok(res, await service.getMyProvider(req.user!.id));
  }),
);

/**
 * @openapi
 * /providers/me:
 *   patch:
 *     tags: [Providers]
 *     summary: Update my provider profile
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/me',
  authenticate,
  validate(updateProviderSchema),
  asyncHandler(async (req, res) => {
    return ok(res, await service.updateProvider(req.user!.id, req.body));
  }),
);

/**
 * @openapi
 * /providers/me/documents:
 *   get:
 *     tags: [Providers]
 *     summary: List my verification documents
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/me/documents',
  authenticate,
  asyncHandler(async (req, res) => {
    const provider = await prisma.providerProfile.findUnique({ where: { userId: req.user!.id } });
    if (!provider) throw new NotFoundError('Provider profile not found');
    const docs = await prisma.providerDocument.findMany({
      where: { providerId: provider.id },
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, docs);
  }),
);

/**
 * @openapi
 * /providers/me/documents:
 *   post:
 *     tags: [Providers]
 *     summary: Attach an uploaded document to my provider profile
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/me/documents',
  authenticate,
  validate(documentSchema),
  asyncHandler(async (req, res) => {
    const provider = await prisma.providerProfile.findUnique({ where: { userId: req.user!.id } });
    if (!provider) throw new NotFoundError('Provider profile not found');
    const doc = await service.addDocument(
      req.user!.id,
      provider.id,
      req.body.type,
      req.body.fileUrl,
    );
    return created(res, doc);
  }),
);

/**
 * @openapi
 * /providers/me/availability:
 *   put:
 *     tags: [Providers]
 *     summary: Replace weekly availability
 *     security: [{ bearerAuth: [] }]
 */
router.put(
  '/me/availability',
  authenticate,
  validate(availabilitySchema),
  asyncHandler(async (req, res) => {
    const provider = await prisma.providerProfile.findUnique({ where: { userId: req.user!.id } });
    if (!provider) throw new NotFoundError('Provider profile not found');
    const availability = await service.setAvailability(req.user!.id, provider.id, req.body.days);
    return ok(res, availability);
  }),
);

/**
 * @openapi
 * /providers/me/open:
 *   patch:
 *     tags: [Providers]
 *     summary: Toggle open/closed status
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/me/open',
  authenticate,
  asyncHandler(async (req, res) => {
    const provider = await prisma.providerProfile.findUnique({ where: { userId: req.user!.id } });
    if (!provider) throw new NotFoundError('Provider profile not found');
    const isOpenNow = Boolean((req.body as { isOpenNow?: boolean }).isOpenNow);
    return ok(res, await service.toggleOpen(req.user!.id, provider.id, isOpenNow));
  }),
);

/**
 * @openapi
 * /providers/nearby:
 *   get:
 *     tags: [Providers]
 *     summary: Find verified providers near a coordinate (PostGIS)
 *     parameters:
 *       - { in: query, name: lat, required: true, schema: { type: number } }
 *       - { in: query, name: lng, required: true, schema: { type: number } }
 *       - { in: query, name: radiusKm, schema: { type: number, default: 10 } }
 *       - { in: query, name: connector, schema: { type: string } }
 *       - { in: query, name: availableOnly, schema: { type: boolean } }
 */
router.get(
  '/nearby',
  validate(nearbyQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const results = await service.findNearby(req.query as never);
    return ok(res, results, { count: results.length });
  }),
);

/**
 * @openapi
 * /providers:
 *   get:
 *     tags: [Providers]
 *     summary: Browse approved providers
 */
router.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await service.listProviders(req.query as never);
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
 * /providers/{id}:
 *   get:
 *     tags: [Providers]
 *     summary: Get provider detail
 */
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const provider = await service.getProviderById(param(req, 'id'));
    return ok(res, provider);
  }),
);

export default router;

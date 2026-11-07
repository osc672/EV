import { Router } from 'express';
import { z } from 'zod';
import { Role, VerificationStatus } from '../../generated/prisma';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { param } from '../../lib/params';
import { ok, created, noContent } from '../../lib/response';
import { prisma } from '../../lib/prisma';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { appCache, cached, TTL } from '../../lib/cache';
import { createPlan, deletePlanByKey, getAllPlans, updatePlanByKey } from '../plans/plans.service';

const router = Router();

router.use(authenticate, authorize(Role.ADMIN));

const providerReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']),
  note: z.string().trim().max(1000).optional(),
});

const documentReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().trim().max(500).optional(),
});

const userStatusSchema = z.object({
  isActive: z.boolean(),
});

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ALL']).optional(),
  q: z.string().trim().optional(),
  role: z.enum(['DRIVER', 'PROVIDER', 'ADMIN', 'ALL']).optional(),
});

const planUpdateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  durationLabel: z.string().trim().min(2).optional(),
  price: z.coerce.number().min(0).optional(),
  minRadiusM: z.coerce.number().min(0).optional(),
  maxRadiusM: z.coerce.number().min(0).optional(),
  visibilityRange: z.string().trim().optional(),
  priorityLabel: z.string().trim().optional(),
  priorityTier: z.coerce.number().int().optional(),
  badge: z.string().trim().optional(),
  badgeColor: z.string().trim().optional(),
  features: z.array(z.string().trim()).optional(),
});

const planCreateSchema = z.object({
  name: z.string().trim().min(2),
  durationLabel: z.string().trim().min(2),
  price: z.coerce.number().min(0),
  minRadiusM: z.coerce.number().min(0).optional(),
  maxRadiusM: z.coerce.number().min(0).optional(),
  visibilityRange: z.string().trim().optional(),
  priorityLabel: z.string().trim().optional(),
  priorityTier: z.coerce.number().int().optional(),
  badge: z.string().trim().optional(),
  badgeColor: z.string().trim().optional(),
  features: z.array(z.string().trim()).optional(),
});

const helpdeskStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
  note: z.string().trim().max(1000).optional(),
});

/**
 * @openapi
 * /admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Platform-wide KPIs
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const stats = await cached('admin:stats', TTL.MEDIUM, async () => {
      const [users, drivers, providers, pendingProviders, bookings, completed, revenue, reviews, tickets] =
        await Promise.all([
          prisma.user.count(),
          prisma.user.count({ where: { role: 'DRIVER' } }),
          prisma.providerProfile.count(),
          prisma.providerProfile.count({ where: { verificationStatus: 'PENDING' } }),
          prisma.booking.count(),
          prisma.booking.count({ where: { status: 'COMPLETED' } }),
          prisma.booking.aggregate({
            where: { status: 'COMPLETED' },
            _sum: { totalAmount: true },
          }),
          prisma.review.count(),
          prisma.auditLog.count({ where: { entity: 'Helpdesk' } }),
        ]);

      return {
        users,
        drivers,
        providers,
        pendingProviders,
        bookings,
        completedBookings: completed,
        grossRevenue: Number(revenue._sum.totalAmount ?? 0),
        reviews,
        helpdeskTickets: tickets,
      };
    });

    return ok(res, stats);
  }),
);

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List users with vehicle and booking metrics
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/users',
  validate(pageSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, role, q } = req.query as never as {
      page: number;
      pageSize: number;
      role?: Role | 'ALL';
      q?: string;
    };
    const roleFilter = role && role !== 'ALL' ? role : undefined;
    const where = {
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q } },
              { email: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, rawUsers] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          phone: true,
          email: true,
          fullName: true,
          role: true,
          avatarUrl: true,
          isActive: true,
          isPhoneVerified: true,
          createdAt: true,
          vehicles: {
            select: {
              id: true,
              make: true,
              model: true,
              connectorType: true,
              batteryCapacityKwh: true,
              registrationNumber: true,
            },
          },
          bookingsAsDriver: {
            select: {
              id: true,
              code: true,
              scheduledAt: true,
              status: true,
              totalAmount: true,
              provider: { select: { id: true, businessName: true, city: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          _count: { select: { bookingsAsDriver: true, vehicles: true, reviews: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Single query for all users' total spent (eliminates N+1 DB roundtrips)
    const userIds = rawUsers.map((u) => u.id);
    const spentAggs =
      userIds.length > 0
        ? await prisma.booking.groupBy({
            by: ['driverId'],
            where: { driverId: { in: userIds }, status: 'COMPLETED' },
            _sum: { totalAmount: true },
          })
        : [];
    const spentMap = new Map(spentAggs.map((s) => [s.driverId, Number(s._sum.totalAmount ?? 0)]));

    const usersWithStats = rawUsers.map((u) => {
      const { bookingsAsDriver, _count, ...rest } = u;
      return {
        ...rest,
        bookings: bookingsAsDriver,
        _count: {
          bookings: _count.bookingsAsDriver,
          vehicles: _count.vehicles,
          reviews: _count.reviews,
        },
        totalSpent: spentMap.get(u.id) ?? 0,
      };
    });

    return ok(res, usersWithStats, { total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  }),
);

/**
 * @openapi
 * /admin/users/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Activate or deactivate a user
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/users/:id/status',
  validate(userStatusSchema),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: param(req, 'id') },
      data: { isActive: req.body.isActive },
    });
    if (!req.body.isActive) {
      await prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: req.body.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        entity: 'User',
        entityId: user.id,
      },
    });
    appCache.del('admin:stats');
    return ok(res, { id: user.id, isActive: user.isActive });
  }),
);

/**
 * @openapi
 * /admin/providers:
 *   get:
 *     tags: [Admin]
 *     summary: List providers with revenue and incoming user sessions
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/providers',
  validate(pageSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, status, q } = req.query as never as {
      page: number;
      pageSize: number;
      status?: VerificationStatus | 'ALL';
      q?: string;
    };
    const statusFilter = status && status !== 'ALL' ? status : undefined;
    const where = {
      ...(statusFilter ? { verificationStatus: statusFilter } : {}),
      ...(q
        ? {
            OR: [
              { businessName: { contains: q, mode: 'insensitive' as const } },
              { city: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, rawProviders] = await Promise.all([
      prisma.providerProfile.count({ where }),
      prisma.providerProfile.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, phone: true, email: true, avatarUrl: true } },
          documents: true,
          bookings: {
            select: {
              id: true,
              code: true,
              scheduledAt: true,
              status: true,
              connectorType: true,
              totalAmount: true,
              estimatedCost: true,
              driver: { select: { id: true, fullName: true, phone: true, avatarUrl: true } },
              vehicle: { select: { make: true, model: true, registrationNumber: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 15,
          },
          _count: { select: { bookings: true, reviews: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Single query for all providers' revenue (eliminates N+1 DB roundtrips)
    const providerIds = rawProviders.map((p) => p.id);
    const revAggs =
      providerIds.length > 0
        ? await prisma.booking.groupBy({
            by: ['providerId'],
            where: { providerId: { in: providerIds }, status: 'COMPLETED' },
            _sum: { totalAmount: true },
          })
        : [];
    const revMap = new Map(revAggs.map((r) => [r.providerId, Number(r._sum.totalAmount ?? 0)]));

    const providersWithRevenue = rawProviders.map((p) => ({
      ...p,
      totalRevenue: revMap.get(p.id) ?? 0,
    }));

    return ok(res, providersWithRevenue, { total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  }),
);

/**
 * @openapi
 * /admin/providers/{id}/review:
 *   patch:
 *     tags: [Admin]
 *     summary: Approve, reject, or suspend a provider
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/providers/:id/review',
  validate(providerReviewSchema),
  asyncHandler(async (req, res) => {
    const provider = await prisma.providerProfile.findUnique({
      where: { id: param(req, 'id') },
      include: {
        user: true,
        documents: true,
      },
    });
    if (!provider) throw new NotFoundError('Provider not found');

    const status = req.body.status as VerificationStatus;

    if (status === 'APPROVED') {
      const hasHostPhoto = Boolean(
        provider.user?.avatarUrl ||
        provider.documents.some((d) => d.type === 'ID_PROOF' || d.type === 'OTHER'),
      );
      const hasChargerPhoto = provider.documents.some(
        (d) => d.type === 'CHARGER_PHOTO' || d.type === 'SITE_PHOTO',
      );

      if (!hasHostPhoto || !hasChargerPhoto) {
        throw new BadRequestError(
          'Mandatory Verification Missing: Provider must upload both host identity photo and charging point hardware photo before approval.',
        );
      }
    }

    const updated = await prisma.providerProfile.update({
      where: { id: provider.id },
      data: {
        verificationStatus: status,
        isVerified: status === 'APPROVED',
        verificationNote: req.body.note ?? null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: `PROVIDER_${status}`,
        entity: 'ProviderProfile',
        entityId: provider.id,
        metadata: { note: req.body.note },
      },
    });

    appCache.del('admin:stats');
    appCache.delByPrefix('nearby:');

    return ok(res, updated);
  }),
);

/**
 * @openapi
 * /admin/documents/{id}/review:
 *   patch:
 *     tags: [Admin]
 *     summary: Review an individual provider document
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/documents/:id/review',
  validate(documentReviewSchema),
  asyncHandler(async (req, res) => {
    const doc = await prisma.providerDocument.findUnique({
      where: { id: param(req, 'id') },
    });
    if (!doc) throw new NotFoundError('Document not found');

    const updated = await prisma.providerDocument.update({
      where: { id: doc.id },
      data: {
        status: req.body.status,
        rejectionReason: req.body.rejectionReason ?? null,
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: `DOCUMENT_${req.body.status}`,
        entity: 'ProviderDocument',
        entityId: doc.id,
      },
    });

    return ok(res, updated);
  }),
);

/**
 * @openapi
 * /admin/plans:
 *   get:
 *     tags: [Admin]
 *     summary: View subscription plans
 *   post:
 *     tags: [Admin]
 *     summary: Add new subscription plan
 */
router.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    return ok(res, getAllPlans());
  }),
);

router.post(
  '/plans',
  validate(planCreateSchema),
  asyncHandler(async (req, res) => {
    const newPlan = createPlan(req.body);
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'SUBSCRIPTION_PLAN_CREATED',
        entity: 'SubscriptionPlan',
        entityId: newPlan.key,
        metadata: { planKey: newPlan.key, planName: newPlan.name, price: newPlan.price },
      },
    });
    return created(res, newPlan);
  }),
);

/**
 * @openapi
 * /admin/plans/{key}:
 *   put:
 *     tags: [Admin]
 *     summary: Edit subscription plan details anytime
 *   delete:
 *     tags: [Admin]
 *     summary: Delete custom subscription plan
 */
router.put(
  '/plans/:key',
  validate(planUpdateSchema),
  asyncHandler(async (req, res) => {
    const key = param(req, 'key');
    const updated = updatePlanByKey(key, req.body);

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'SUBSCRIPTION_PLAN_UPDATED',
        entity: 'SubscriptionPlan',
        entityId: key,
        metadata: { planKey: key, updates: req.body },
      },
    });

    return ok(res, updated);
  }),
);

router.delete(
  '/plans/:key',
  asyncHandler(async (req, res) => {
    const key = param(req, 'key');
    deletePlanByKey(key);

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'SUBSCRIPTION_PLAN_DELETED',
        entity: 'SubscriptionPlan',
        entityId: key,
      },
    });

    return ok(res, { success: true, deletedKey: key });
  }),
);

/**
 * @openapi
 * /admin/helpdesk:
 *   get:
 *     tags: [Admin]
 *     summary: View all user & provider helpdesk tickets
 */
router.get(
  '/helpdesk',
  asyncHandler(async (_req, res) => {
    const tickets = await prisma.auditLog.findMany({
      where: { entity: 'Helpdesk' },
      include: {
        actor: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            role: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return ok(res, tickets);
  }),
);

/**
 * @openapi
 * /admin/helpdesk/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update helpdesk ticket status (Resolve ticket)
 */
router.patch(
  '/helpdesk/:id',
  validate(helpdeskStatusSchema),
  asyncHandler(async (req, res) => {
    const ticket = await prisma.auditLog.findUnique({
      where: { id: param(req, 'id') },
    });
    if (!ticket) throw new NotFoundError('Ticket not found');

    const meta = (ticket.metadata as Record<string, unknown>) ?? {};
    const updatedMeta = {
      ...meta,
      ticketStatus: req.body.status,
      resolutionNote: req.body.note,
      resolvedAt: new Date().toISOString(),
      resolvedBy: req.user!.id,
    };

    const updated = await prisma.auditLog.update({
      where: { id: ticket.id },
      data: { metadata: updatedMeta },
    });

    return ok(res, updated);
  }),
);

/**
 * @openapi
 * /admin/reviews:
 *   get:
 *     tags: [Admin]
 *     summary: View all platform reviews and ratings
 */
router.get(
  '/reviews',
  asyncHandler(async (_req, res) => {
    const reviews = await prisma.review.findMany({
      include: {
        driver: { select: { id: true, fullName: true, phone: true, avatarUrl: true } },
        provider: { select: { id: true, businessName: true, city: true, phone: true } },
        booking: { select: { id: true, code: true, scheduledAt: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return ok(res, reviews);
  }),
);

/**
 * @openapi
 * /admin/reviews/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Moderate/delete an inappropriate review
 */
router.delete(
  '/reviews/:id',
  asyncHandler(async (req, res) => {
    const review = await prisma.review.findUnique({ where: { id: param(req, 'id') } });
    if (!review) throw new NotFoundError('Review not found');

    await prisma.review.delete({ where: { id: review.id } });
    const agg = await prisma.review.aggregate({
      where: { providerId: review.providerId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await prisma.providerProfile.update({
      where: { id: review.providerId },
      data: {
        rating: Math.round((agg._avg.rating ?? 0) * 100) / 100,
        totalReviews: agg._count.rating,
      },
    });

    return noContent(res);
  }),
);

/**
 * @openapi
 * /admin/audit-logs:
 *   get:
 *     tags: [Admin]
 *     summary: Recent audit trail
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/audit-logs',
  validate(pageSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as never as { page: number; pageSize: number };
    const [total, items] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.findMany({
        include: { actor: { select: { fullName: true, phone: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return ok(res, items, { total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  }),
);

const bookingPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.string().optional(),
});

/**
 * @openapi
 * /admin/bookings:
 *   get:
 *     tags: [Admin]
 *     summary: List all platform bookings
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/bookings',
  validate(bookingPageSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, status } = req.query as never as {
      page: number;
      pageSize: number;
      status?: any;
    };
    const where = {
      ...(status && status !== 'ALL' ? { status } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        include: {
          driver: { select: { id: true, fullName: true, phone: true, email: true } },
          provider: { select: { id: true, businessName: true, city: true, phone: true } },
          vehicle: { select: { make: true, model: true, registrationNumber: true } },
          payment: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return ok(res, items, { total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  }),
);

export default router;

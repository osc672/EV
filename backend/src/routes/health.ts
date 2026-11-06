import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ok } from '../lib/response';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    let db = 'down';
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    return ok(res, {
      status: db === 'up' ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      database: db,
      timestamp: new Date().toISOString(),
    });
  }),
);

export default router;

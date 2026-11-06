import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger';

/** Attach a request id and access logging for slow / error requests. */
export function requestLogger(req: Request, res: Response, next: () => void) {
  // Skip spamming logs for health checks
  if (req.path === '/health' || req.path === '/api/v1/health') {
    return next();
  }

  const start = process.hrtime.bigint();
  const rid = (req.headers['x-request-id'] as string) || randomUUID();
  res.setHeader('x-request-id', rid);

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    // Log errors or slow requests (> 300ms) to keep I/O overhead zero under concurrent users
    if (res.statusCode >= 400 || ms > 300) {
      logger.info('http_request', {
        rid,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Math.round(ms),
      });
    }
  });

  next();
}

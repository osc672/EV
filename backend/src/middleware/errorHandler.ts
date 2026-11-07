import { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { env } from '../config/env';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const isAppErr =
    err instanceof AppError ||
    (typeof err === 'object' &&
      err !== null &&
      'statusCode' in err &&
      typeof (err as any).statusCode === 'number' &&
      'isOperational' in err);

  if (isAppErr) {
    const appErr = err as AppError;
    const error: Record<string, unknown> = {
      code: appErr.code || 'APP_ERROR',
      message: appErr.message,
    };
    if (appErr.details !== undefined) error.details = appErr.details;
    const payload = { success: false, error };
    if (!appErr.isOperational) {
      logger.error('non_operational_error', {
        code: appErr.code,
        message: appErr.message,
        stack: appErr.stack,
        path: req.path,
      });
    }
    return res.status(appErr.statusCode).json(payload);
  }

  // Handle common JWT errors
  const name = (err as Error)?.name;
  if (name === 'JsonWebTokenError' || name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    });
  }

  // Handle Prisma errors
  const prismaCode = (err as { code?: string })?.code;
  if (prismaCode === 'P2002') {
    return res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: 'Unique constraint violated' },
    });
  }
  if (prismaCode === 'P2025') {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Record not found' },
    });
  }
  if (prismaCode === 'P2003') {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Referenced entity not found or constraint failed' },
    });
  }
  if (prismaCode === 'P2024' || prismaCode === 'P2028') {
    return res.status(503).json({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Database pool is busy, please retry momentarily' },
    });
  }

  const rawMessage = (err as Error)?.message || 'Internal server error';

  logger.error('unhandled_error', {
    message: rawMessage,
    stack: (err as Error)?.stack,
    path: req.path,
  });

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: rawMessage,
    },
  });
}

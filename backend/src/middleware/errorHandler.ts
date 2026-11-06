import { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { env } from '../config/env';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    const error: Record<string, unknown> = {
      code: err.code,
      message: err.message,
    };
    if (err.details !== undefined) error.details = err.details;
    const payload = { success: false, error };
    if (!err.isOperational) {
      logger.error('non_operational_error', {
        code: err.code,
        message: err.message,
        stack: err.stack,
        path: req.path,
      });
    }
    return res.status(err.statusCode).json(payload);
  }

  // Handle common JWT errors
  const name = (err as Error)?.name;
  if (name === 'JsonWebTokenError' || name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    });
  }

  // Handle Prisma errors without leaking details in production
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

  logger.error('unhandled_error', {
    message: (err as Error)?.message,
    stack: (err as Error)?.stack,
    path: req.path,
  });

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error)?.message,
    },
  });
}

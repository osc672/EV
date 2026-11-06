import { NextFunction, Request, Response } from 'express';
import { NotFoundError } from '../lib/errors';

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
}

import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';
import { UnprocessableError } from '../lib/errors';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Validate a request part with a Zod schema and replace it with the parsed
 * (and typed) value. Works for Express 5 where req.query is a getter.
 */
export function validate(schema: ZodTypeAny, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return next(new UnprocessableError('Validation failed', details));
    }
    if (part === 'body') {
      req.body = result.data;
    } else {
      // Express 5 exposes query as a getter; assign onto a mutable container.
      Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true });
    }
    return next();
  };
}

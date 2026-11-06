import { Request } from 'express';

/**
 * Express 5 types route params as `string | string[]`. In practice a named
 * param is always a single string; this helper makes that explicit for the
 * type checker.
 */
export function param(req: Request, name: string): string {
  const value = (req.params as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? value[0] : (value ?? '');
}

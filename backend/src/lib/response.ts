import { Response } from 'express';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>) {
  const payload: ApiSuccess<T> = { success: true, data };
  if (meta) payload.meta = meta;
  return res.status(200).json(payload);
}

export function created<T>(res: Response, data: T, meta?: Record<string, unknown>) {
  const payload: ApiSuccess<T> = { success: true, data };
  if (meta) payload.meta = meta;
  return res.status(201).json(payload);
}

export function noContent(res: Response) {
  return res.status(204).send();
}

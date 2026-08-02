import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

/**
 * Id charset accepted by the API. Matches the nanoid alphabet (`newId`),
 * bounded to a sane length so path params can never carry traversal
 * sequences (`../`), slashes, or unbounded input into the DB layer.
 */
export const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'invalid id');

/**
 * Express middleware that validates the `:id` route param against
 * {@link idSchema} before any handler (and thus any DB lookup) runs.
 * On mismatch it forwards a ZodError so the central error map in `app.ts`
 * renders the usual 400 response shape.
 */
export function idParam(req: Request, _res: Response, next: NextFunction): void {
  const parsed = idSchema.safeParse(req.params.id);
  if (!parsed.success) return next(parsed.error);
  next();
}

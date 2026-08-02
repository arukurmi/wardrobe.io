import { z } from 'zod';
import type { Router } from 'express';

/**
 * Id charset accepted by the API. Matches the nanoid alphabet (`newId`),
 * bounded to a sane length so path params can never carry traversal
 * sequences (`../`), slashes, or unbounded input into the DB layer.
 */
export const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'invalid id');

/**
 * Registers an `:id` route-param guard on the given router. It runs before
 * any handler (and thus any DB lookup) for every route that carries an `:id`
 * param, validating the value against {@link idSchema}. On mismatch it
 * forwards a ZodError so the central error map in `app.ts` renders the usual
 * 400 response shape. Valid ids pass through unchanged.
 */
export function guardIdParam(router: Router): void {
  router.param('id', (_req, _res, next, value) => {
    const parsed = idSchema.safeParse(value);
    if (!parsed.success) return next(parsed.error);
    next();
  });
}

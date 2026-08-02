import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/** Fixed-length (32-byte) digest so timingSafeEqual always compares equal-length buffers. */
function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Optional, opt-in bearer-token gate.
 *
 * wardrobe.io is a single-user, localhost-only tool with deliberately no
 * account system, so the gate is **disabled by default**. Set the
 * `WARDROBE_TOKEN` environment variable to require callers to send
 * `Authorization: Bearer <token>` — handy if you expose the port over a
 * tunnel or reverse proxy. When enabled it protects both the `/api` surface
 * and the `/data` image files. Health checks (`GET /api/health`) stay open so
 * liveness probes keep working even when the gate is enabled.
 */
export function authGate() {
  const token = process.env.WARDROBE_TOKEN?.trim();
  const expected = token ? digest(token) : null;

  return function authGateMiddleware(req: Request, res: Response, next: NextFunction) {
    // Gate disabled (no token configured) → default localhost behavior.
    if (!expected) return next();

    // Always allow health checks so probes work when the gate is enabled.
    if (req.method === 'GET' && req.path === '/health') return next();

    const header = req.get('authorization') ?? '';
    const match = /^Bearer (.+)$/.exec(header);
    if (match) {
      // Compare fixed-length digests so the comparison time never depends on
      // the presented token's length (no length-based timing oracle) and
      // timingSafeEqual never throws on a length mismatch.
      if (timingSafeEqual(digest(match[1]), expected)) {
        return next();
      }
    }

    return res.status(401).json({ error: 'unauthorized' });
  };
}

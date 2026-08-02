import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Optional, opt-in bearer-token gate for the `/api` surface.
 *
 * wardrobe.io is a single-user, localhost-only tool with deliberately no
 * account system, so the gate is **disabled by default**. Set the
 * `WARDROBE_TOKEN` environment variable to require callers to send
 * `Authorization: Bearer <token>` — handy if you expose the port over a
 * tunnel or reverse proxy. Health checks (`GET /api/health`) stay open so
 * liveness probes keep working even when the gate is enabled.
 */
export function authGate() {
  const token = process.env.WARDROBE_TOKEN?.trim();
  const expected = token ? Buffer.from(token, 'utf8') : null;

  return function authGateMiddleware(req: Request, res: Response, next: NextFunction) {
    // Gate disabled (no token configured) → default localhost behavior.
    if (!expected) return next();

    // Always allow health checks so probes work when the gate is enabled.
    if (req.method === 'GET' && req.path === '/health') return next();

    const header = req.get('authorization') ?? '';
    const match = /^Bearer (.+)$/.exec(header);
    if (match) {
      const presented = Buffer.from(match[1], 'utf8');
      // timingSafeEqual throws on length mismatch — guard first so length
      // differences don't leak via an exception path.
      if (presented.length === expected.length && timingSafeEqual(presented, expected)) {
        return next();
      }
    }

    return res.status(401).json({ error: 'unauthorized' });
  };
}

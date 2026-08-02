import type { Request, Response, NextFunction, RequestHandler } from 'express';

export interface RateLimitOptions {
  /** Length of the rolling window in milliseconds. */
  windowMs: number;
  /** Maximum number of requests allowed per key within a window. */
  max: number;
  /** Injectable clock for deterministic testing. Defaults to Date.now. */
  now?: () => number;
}

interface Bucket {
  count: number;
  /** Epoch ms at which this window ends and the bucket resets. */
  resetAt: number;
}

/**
 * First-party in-memory fixed-window rate limiter keyed by req.ip.
 *
 * This is a single-user, localhost-only app with no auth, so the goal here is
 * defense-in-depth: bound runaway clients (e.g. a buggy loop in the UI or a
 * misbehaving script) rather than block an attacker. Expired buckets are pruned
 * lazily to keep memory bounded.
 */
export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const { windowMs, max } = opts;
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, Bucket>();
  let lastPrune = now();

  function prune(current: number): void {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= current) buckets.delete(key);
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const current = now();

    // Prune at most once per window so this stays O(1) amortized per request.
    if (current - lastPrune >= windowMs) {
      prune(current);
      lastPrune = current;
    }

    const key = req.ip ?? 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      bucket = { count: 0, resetAt: current + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - current) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: 'rate limit exceeded' });
    }

    next();
  };
}

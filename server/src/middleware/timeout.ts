import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Per-request timeout middleware.
 *
 * If a handler runs longer than `ms` and has not yet started sending a
 * response, we reply 503 so a stuck or runaway request can't hold a connection
 * open indefinitely. This is defense-in-depth for a localhost app: it caps
 * pathological handlers rather than defending against an attacker. The timer is
 * unref'd so it never keeps the process alive, and cleared on finish/close to
 * avoid firing after a normal response.
 */
export function timeout(ms = 30000): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({ error: 'request timeout' });
      }
    }, ms);

    // Don't let a pending timeout keep the event loop (and process) alive.
    if (typeof timer.unref === 'function') timer.unref();

    const clear = () => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);

    next();
  };
}

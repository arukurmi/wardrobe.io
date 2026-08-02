import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Content-Security-Policy tuned for this app's client.
 *
 * The React client uses @huggingface/transformers, which runs models entirely
 * in the browser. That requires a handful of otherwise-unusual allowances:
 *   - script-src 'wasm-unsafe-eval' — transformers.js compiles WASM (ONNX runtime).
 *   - worker-src blob: — the ML pipeline spawns web workers from blob: URLs.
 *   - connect-src https: data: blob: — model weights are fetched over https and
 *     materialized as data:/blob: URLs before decoding.
 *   - img-src data: blob: — crops/previews are rendered from client-side blobs.
 *   - style-src 'unsafe-inline' — Vite/React inject inline styles.
 * Everything else is locked to 'self'; object-src is fully disabled and the page
 * may not be framed (frame-ancestors 'none').
 *
 * Kept as a single documented constant so the policy is auditable in one place.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self' https: data: blob:",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * First-party HTTP security-header middleware (defense-in-depth).
 *
 * This is a single-user, localhost-only app with no auth, so these headers are
 * hardening rather than a fix for any known exposure. They set sensible
 * browser-side defaults on every response: block MIME sniffing, forbid framing,
 * strip referrers, deny powerful features, and constrain resource loading via CSP.
 *
 * HSTS is opt-in (WARDROBE_HSTS === '1') because the app is served over plain
 * http on localhost by default, where Strict-Transport-Security would be
 * inappropriate.
 */
export function securityHeaders(): RequestHandler {
  return function securityHeadersMiddleware(
    _req: Request,
    res: Response,
    next: NextFunction
  ): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()'
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);

    if (process.env.WARDROBE_HSTS === '1') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains'
      );
    }

    next();
  };
}

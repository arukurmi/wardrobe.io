import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { Db } from './db.js';
import { photosRouter } from './routes/photos.js';
import { garmentsRouter, mergesRouter } from './routes/garments.js';
import { piecesRouter } from './routes/pieces.js';
import { suggestionsRouter } from './routes/suggestions.js';
import { statsRouter, settingsRouter, ioRouter } from './routes/misc.js';
import { MergeError } from './services/merge.js';
import { authGate } from './middleware/authGate.js';
import { rateLimit } from './middleware/rateLimit.js';
import { timeout } from './middleware/timeout.js';

export function createApp(db: Db, dataDir: string): Express {
  const app = express();

  // Short, per-request id for tracing errors in logs without leaking internals.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { id?: string }).id = randomUUID().slice(0, 8);
    next();
  });

  // Bound abusive/runaway clients (defense-in-depth for this localhost app).
  // Placed before body parsing so a 429 is returned without first buffering a
  // (potentially 1MB) JSON body.
  app.use('/api', rateLimit({ windowMs: 60_000, max: 300 }));

  // Cap runaway handlers so a stuck request can't hold a connection forever.
  // Explicitly skip streaming / large-payload routes (zip export, multi-GB
  // import, and photo uploads) plus the /data static mount: those can legitimately
  // run past a fixed deadline, and killing the response mid-stream would leave the
  // handler writing to an ended stream.
  const requestTimeout = timeout(30_000);
  const TIMEOUT_SKIP_PREFIXES = ['/api/io', '/api/photos', '/data'];
  app.use((req: Request, res: Response, next: NextFunction) => {
    const skip = TIMEOUT_SKIP_PREFIXES.some(
      (p) => req.path === p || req.path.startsWith(p + '/')
    );
    return skip ? next() : requestTimeout(req, res, next);
  });

  app.use(express.json({ limit: '1mb' }));

  // Optional bearer-token gate (off unless WARDROBE_TOKEN is set); health stays open.
  app.use('/api', authGate());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/photos', photosRouter(db, dataDir));
  app.use('/api/garments', garmentsRouter(db));
  app.use('/api/merges', mergesRouter(db));
  app.use('/api/pieces', piecesRouter(db, dataDir));
  app.use('/api/suggestions', suggestionsRouter(db));
  app.use('/api/stats', statsRouter(db));
  app.use('/api/settings', settingsRouter(db));
  app.use('/api/io', ioRouter(db, dataDir));

  // User images (crops + originals). Gated by the same opt-in token as /api,
  // so enabling WARDROBE_TOKEN protects the photos too — not just metadata.
  app.use(
    '/data',
    authGate(),
    express.static(dataDir, { index: false, dotfiles: 'ignore', fallthrough: false })
  );

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'invalid JSON body' });
    }
    if (err instanceof MergeError) {
      return res.status(err.status).json({ error: err.message });
    }
    // Log with a request id for traceability; never leak the stack to the client.
    const requestId = (req as Request & { id?: string }).id ?? randomUUID().slice(0, 8);
    console.error(`[${requestId}]`, err);
    res.status(500).json({ error: 'internal error', requestId });
  });

  return app;
}

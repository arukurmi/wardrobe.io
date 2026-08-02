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
import { rateLimit } from './middleware/rateLimit.js';
import { timeout } from './middleware/timeout.js';

export function createApp(db: Db, dataDir: string): Express {
  const app = express();

  // Short, per-request id for tracing errors in logs without leaking internals.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { id?: string }).id = randomUUID().slice(0, 8);
    next();
  });

  // Cap runaway handlers so a stuck request can't hold a connection forever.
  app.use(timeout(30_000));

  app.use(express.json({ limit: '1mb' }));

  // Bound abusive/runaway clients (defense-in-depth for this localhost app).
  app.use('/api', rateLimit({ windowMs: 60_000, max: 300 }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/photos', photosRouter(db, dataDir));
  app.use('/api/garments', garmentsRouter(db));
  app.use('/api/merges', mergesRouter(db));
  app.use('/api/pieces', piecesRouter(db, dataDir));
  app.use('/api/suggestions', suggestionsRouter(db));
  app.use('/api/stats', statsRouter(db));
  app.use('/api/settings', settingsRouter(db));
  app.use('/api/io', ioRouter(db, dataDir));

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

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import type { Db } from './db.js';
import { photosRouter } from './routes/photos.js';
import { garmentsRouter, mergesRouter } from './routes/garments.js';
import { piecesRouter } from './routes/pieces.js';
import { suggestionsRouter } from './routes/suggestions.js';
import { statsRouter, settingsRouter, ioRouter } from './routes/misc.js';
import { MergeError } from './services/merge.js';
import { authGate } from './middleware/authGate.js';

export function createApp(db: Db, dataDir: string): Express {
  const app = express();
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

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
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
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

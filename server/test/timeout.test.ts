import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { timeout } from '../src/middleware/timeout.js';

function makeApp(ms: number) {
  const app = express();
  app.use(timeout(ms));
  app.get('/fast', (_req, res) => res.json({ ok: true }));
  app.get('/slow', (_req, res) => {
    setTimeout(() => {
      // Guarded by headersSent inside the middleware; this should be a no-op
      // once the timeout has already responded.
      if (!res.headersSent) res.json({ ok: true });
    }, 60);
  });
  return app;
}

describe('timeout', () => {
  it('responds 503 when a handler exceeds the limit', async () => {
    const app = makeApp(20);
    const res = await request(app).get('/slow');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'request timeout' });
  });

  it('lets fast handlers respond normally', async () => {
    const app = makeApp(1000);
    const res = await request(app).get('/fast');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

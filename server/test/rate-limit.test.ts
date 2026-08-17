import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimit } from '../src/middleware/rateLimit.js';

/** A manually-advanced clock so windows are deterministic without wall time. */
function makeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function makeApp(now: () => number, opts: { windowMs: number; max: number }) {
  const app = express();
  app.use(rateLimit({ ...opts, now }));
  app.get('/x', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('rateLimit', () => {
  it('allows up to max requests then returns 429 with Retry-After', async () => {
    const clock = makeClock();
    const app = makeApp(clock.now, { windowMs: 1000, max: 3 });

    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/x');
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).get('/x');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'rate limit exceeded' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('resets the window once windowMs has elapsed', async () => {
    const clock = makeClock();
    const app = makeApp(clock.now, { windowMs: 1000, max: 2 });

    expect((await request(app).get('/x')).status).toBe(200);
    expect((await request(app).get('/x')).status).toBe(200);
    expect((await request(app).get('/x')).status).toBe(429);

    // Advance past the window: the bucket should reset and allow traffic again.
    clock.advance(1000);
    expect((await request(app).get('/x')).status).toBe(200);
    expect((await request(app).get('/x')).status).toBe(200);
    expect((await request(app).get('/x')).status).toBe(429);
  });

  it('does not trip under a modest generous limit', async () => {
    const clock = makeClock();
    const app = makeApp(clock.now, { windowMs: 60_000, max: 300 });
    for (let i = 0; i < 20; i++) {
      expect((await request(app).get('/x')).status).toBe(200);
    }
  });
});

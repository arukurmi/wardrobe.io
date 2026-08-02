import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, type Db } from '../src/db.js';
import { createApp } from '../src/app.js';

const TOKEN = 'super-secret-token';

let db: Db;
let dataDir: string;

beforeEach(() => {
  db = openDb(':memory:');
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wardrobe-auth-'));
});

afterEach(() => {
  delete process.env.WARDROBE_TOKEN;
});

// The gate reads WARDROBE_TOKEN when the app is built, so set/clear the env
// var before each createApp call.
function buildApp() {
  return createApp(db, dataDir);
}

describe('authGate', () => {
  it('is disabled when WARDROBE_TOKEN is unset (requests pass through)', async () => {
    delete process.env.WARDROBE_TOKEN;
    const app = buildApp();
    const res = await request(app).get('/api/garments');
    expect(res.status).toBe(200);
  });

  it('is disabled when WARDROBE_TOKEN is empty', async () => {
    process.env.WARDROBE_TOKEN = '';
    const app = buildApp();
    const res = await request(app).get('/api/garments');
    expect(res.status).toBe(200);
  });

  it('rejects missing token with 401 when enabled', async () => {
    process.env.WARDROBE_TOKEN = TOKEN;
    const app = buildApp();
    const res = await request(app).get('/api/garments');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('rejects a wrong token with 401 when enabled', async () => {
    process.env.WARDROBE_TOKEN = TOKEN;
    const app = buildApp();
    const res = await request(app)
      .get('/api/garments')
      .set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('rejects a token that differs only in length with 401 (no throw)', async () => {
    process.env.WARDROBE_TOKEN = TOKEN;
    const app = buildApp();
    const res = await request(app)
      .get('/api/garments')
      .set('Authorization', `Bearer ${TOKEN}-extra`);
    expect(res.status).toBe(401);
  });

  it('allows the correct token when enabled', async () => {
    process.env.WARDROBE_TOKEN = TOKEN;
    const app = buildApp();
    const res = await request(app)
      .get('/api/garments')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
  });

  it('leaves GET /api/health reachable without a token when enabled', async () => {
    process.env.WARDROBE_TOKEN = TOKEN;
    const app = buildApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

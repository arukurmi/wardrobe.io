import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, type Db } from '../src/db.js';
import { createApp } from '../src/app.js';

const TOKEN = 'super-secret-token';

// tiny valid 1x1 png
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function emb(vals: number[]): string {
  const v = new Float32Array(512);
  vals.forEach((x, i) => (v[i] = x));
  return Buffer.from(v.buffer).toString('base64');
}

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

  it('gates the /data image files behind the same token', async () => {
    process.env.WARDROBE_TOKEN = TOKEN;
    const app = buildApp();

    // Upload one photo (with the token) to produce a real /data/pieces/* file.
    const upload = await request(app)
      .post('/api/photos')
      .set('Authorization', `Bearer ${TOKEN}`)
      .attach('original', PNG, 'outfit.png')
      .field(
        'meta',
        JSON.stringify({
          pieces: [{ category: 'top', bbox: [0, 0, 100, 100], embedding: emb([1]) }],
        })
      )
      .attach('crops', PNG, 'crop.png');
    expect(upload.status).toBe(201);

    const coverUrl: string = (await request(app).get('/api/garments').set('Authorization', `Bearer ${TOKEN}`))
      .body[0].coverUrl;
    expect(coverUrl).toMatch(/^\/data\/pieces\//);

    // Missing token → 401 (photo is not public when the gate is on).
    const blocked = await request(app).get(coverUrl);
    expect(blocked.status).toBe(401);
    expect(blocked.body).toEqual({ error: 'unauthorized' });

    // Correct token → served.
    const ok = await request(app).get(coverUrl).set('Authorization', `Bearer ${TOKEN}`);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toMatch(/^image\//);
  });

  it('serves /data without a token when the gate is disabled', async () => {
    delete process.env.WARDROBE_TOKEN;
    const app = buildApp();

    const upload = await request(app)
      .post('/api/photos')
      .attach('original', PNG, 'outfit.png')
      .field(
        'meta',
        JSON.stringify({
          pieces: [{ category: 'top', bbox: [0, 0, 100, 100], embedding: emb([1]) }],
        })
      )
      .attach('crops', PNG, 'crop.png');
    expect(upload.status).toBe(201);
    const coverUrl: string = (await request(app).get('/api/garments')).body[0].coverUrl;

    const res = await request(app).get(coverUrl);
    expect(res.status).toBe(200);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, type Db } from '../src/db.js';
import { createApp } from '../src/app.js';

// tiny valid 1x1 png (same fixture as api.test.ts)
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
let app: ReturnType<typeof createApp>;
let dataDir: string;

beforeEach(() => {
  db = openDb(':memory:');
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wardrobe-iv-'));
  app = createApp(db, dataDir);
});

async function seedGarment(): Promise<string> {
  const req = request(app)
    .post('/api/photos')
    .attach('original', PNG, 'outfit.png')
    .field(
      'meta',
      JSON.stringify({ pieces: [{ category: 'top', bbox: [0, 0, 100, 100], embedding: emb([1]) }] })
    )
    .attach('crops', PNG, 'crop.png');
  await req;
  return (await request(app).get('/api/garments')).body[0].id;
}

describe('input validation: strict bodies', () => {
  it('rejects an unknown key in the photo upload meta', async () => {
    const res = await request(app)
      .post('/api/photos')
      .attach('original', PNG, 'outfit.png')
      .field(
        'meta',
        JSON.stringify({ pieces: [], surprise: true })
      );
    expect(res.status).toBe(400);
  });

  it('rejects an unknown key on the garment patch body', async () => {
    const id = await seedGarment();
    const res = await request(app).patch(`/api/garments/${id}`).send({ nope: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown key on the settings body', async () => {
    const res = await request(app).put('/api/settings').send({ attach: 0.9, nope: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects an over-long string (garment display_name > 120)', async () => {
    const id = await seedGarment();
    const res = await request(app)
      .patch(`/api/garments/${id}`)
      .send({ display_name: 'x'.repeat(200) });
    expect(res.status).toBe(400);
  });

  it('rejects an over-long embedding string on upload', async () => {
    const res = await request(app)
      .post('/api/photos')
      .attach('original', PNG, 'outfit.png')
      .field(
        'meta',
        JSON.stringify({
          pieces: [{ category: 'top', bbox: [0, 0, 1, 1], embedding: 'A'.repeat(5000) }],
        })
      )
      .attach('crops', PNG, 'crop.png');
    expect(res.status).toBe(400);
  });
});

describe('input validation: threshold bounds', () => {
  it('rejects an out-of-range threshold (attach > 1)', async () => {
    const res = await request(app).put('/api/settings').send({ attach: 1.5 });
    expect(res.status).toBe(400);
  });

  it('rejects a below-floor threshold (suggest < 0.3)', async () => {
    const res = await request(app).put('/api/settings').send({ suggest: 0.05 });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric threshold', async () => {
    const res = await request(app).put('/api/settings').send({ attach: 'high' });
    expect(res.status).toBe(400);
  });
});

describe('input validation: :id param guard', () => {
  // path-traversal-shaped id, fully percent-encoded so it reaches the
  // handler as `../x` instead of being collapsed during URL normalization.
  const TRAVERSAL = '%2E%2E%2Fx';
  const OVERLONG = 'a'.repeat(100);

  const cases: [string, string][] = [
    ['GET', '/api/photos'],
    ['DELETE', '/api/photos'],
    ['GET', '/api/garments'],
    ['PATCH', '/api/garments'],
  ];

  for (const [method, base] of cases) {
    it(`rejects a traversal-shaped id on ${method} ${base}/:id`, async () => {
      const res = await (request(app) as any)[method.toLowerCase()](`${base}/${TRAVERSAL}`);
      expect(res.status).toBe(400);
    });
    it(`rejects an over-long id on ${method} ${base}/:id`, async () => {
      const res = await (request(app) as any)[method.toLowerCase()](`${base}/${OVERLONG}`);
      expect(res.status).toBe(400);
    });
  }

  it('rejects malformed ids on nested :id routes', async () => {
    const merge = await request(app).post(`/api/garments/${TRAVERSAL}/merge`).send({ into: 'abc' });
    expect(merge.status).toBe(400);
    const accept = await request(app).post(`/api/suggestions/${OVERLONG}/accept`);
    expect(accept.status).toBe(400);
    const undo = await request(app).post(`/api/merges/${TRAVERSAL}/undo`);
    expect(undo.status).toBe(400);
  });

  it('leaves valid-but-unknown ids at 404 (behavior unchanged)', async () => {
    const res = await request(app).get('/api/photos/does-not-exist_01');
    expect(res.status).toBe(404);
  });
});

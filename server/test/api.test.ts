import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, type Db } from '../src/db.js';
import { createApp } from '../src/app.js';

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
let app: ReturnType<typeof createApp>;
let dataDir: string;

beforeEach(() => {
  db = openDb(':memory:');
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wardrobe-api-'));
  app = createApp(db, dataDir);
});

function uploadPhoto(pieces: { category: string; emb: string }[]) {
  const req = request(app)
    .post('/api/photos')
    .attach('original', PNG, 'outfit.png')
    .field(
      'meta',
      JSON.stringify({
        pieces: pieces.map((p) => ({
          category: p.category,
          bbox: [0, 0, 100, 100],
          embedding: p.emb,
        })),
      })
    );
  for (const _ of pieces) req.attach('crops', PNG, 'crop.png');
  return req;
}

describe('api', () => {
  it('health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toEqual({ ok: true });
  });

  it('uploads a photo with pieces and dedupes on re-upload', async () => {
    const r1 = await uploadPhoto([{ category: 'top', emb: emb([1]) }]);
    expect(r1.status).toBe(201);
    expect(r1.body.pieces[0].decision).toBe('new');

    const r2 = await uploadPhoto([{ category: 'top', emb: emb([1]) }]);
    expect(r2.body.pieces[0].decision).toBe('attached');

    const garments = await request(app).get('/api/garments');
    expect(garments.body.length).toBe(1);
    expect(garments.body[0].wearCount).toBe(2);
    expect(garments.body[0].coverUrl).toMatch(/^\/data\/pieces\//);
  });

  it('rejects bad category and malformed meta', async () => {
    const bad = await uploadPhoto([{ category: 'spaceship', emb: emb([1]) }]);
    expect(bad.status).toBe(400);
    const badEmb = await uploadPhoto([{ category: 'top', emb: 'AAAA' }]);
    expect(badEmb.status).toBe(400);
  });

  it('merges via endpoint, undoes, 409 on re-merge', async () => {
    await uploadPhoto([{ category: 'top', emb: emb([1]) }]);
    await uploadPhoto([{ category: 'top', emb: emb([0, 1]) }]); // orthogonal -> 2nd garment
    const garments = (await request(app).get('/api/garments')).body;
    expect(garments.length).toBe(2);
    const [a, b] = garments.map((g: any) => g.id);

    const merge = await request(app).post(`/api/garments/${a}/merge`).send({ into: b });
    expect(merge.status).toBe(200);
    expect((await request(app).get('/api/garments')).body.length).toBe(1);

    const again = await request(app).post(`/api/garments/${a}/merge`).send({ into: b });
    expect(again.status).toBe(409);

    const undo = await request(app).post(`/api/merges/${merge.body.mergeEventId}/undo`);
    expect(undo.status).toBe(200);
    expect((await request(app).get('/api/garments')).body.length).toBe(2);
  });

  it('suggestion lifecycle over http', async () => {
    await uploadPhoto([{ category: 'top', emb: emb([1]) }]);
    // cos ≈ 0.85 -> suggestion
    await uploadPhoto([
      { category: 'top', emb: emb([0.85, Math.sqrt(1 - 0.85 ** 2)]) },
    ]);
    const sugg = (await request(app).get('/api/suggestions')).body;
    expect(sugg.length).toBe(1);
    expect(sugg[0].similarity).toBeCloseTo(0.85, 2);
    const accept = await request(app).post(`/api/suggestions/${sugg[0].id}/accept`);
    expect(accept.status).toBe(200);
    expect((await request(app).get('/api/garments')).body.length).toBe(1);
    expect((await request(app).get('/api/suggestions')).body.length).toBe(0);
  });

  it('patches garment fields and validates them', async () => {
    await uploadPhoto([{ category: 'top', emb: emb([1]) }]);
    const g = (await request(app).get('/api/garments')).body[0];
    const patch = await request(app)
      .patch(`/api/garments/${g.id}`)
      .send({ display_name: 'White Oxford', price_cents: 250000, brand: 'Uniqlo' });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe('White Oxford');
    const bad = await request(app)
      .patch(`/api/garments/${g.id}`)
      .send({ price_cents: -5 });
    expect(bad.status).toBe(400);
    const unknown = await request(app)
      .patch(`/api/garments/${g.id}`)
      .send({ hacker_field: 1 });
    expect(unknown.status).toBe(400);
  });

  it('deletes photo, cascades pieces, fixes garment cover', async () => {
    const r1 = await uploadPhoto([{ category: 'top', emb: emb([1]) }]);
    await uploadPhoto([{ category: 'top', emb: emb([1]) }]); // same garment, 2nd piece
    const photoId = r1.body.photoId;
    const del = await request(app).delete(`/api/photos/${photoId}`);
    expect(del.status).toBe(200);
    const garments = (await request(app).get('/api/garments')).body;
    expect(garments[0].wearCount).toBe(1);
    expect(garments[0].coverUrl).toMatch(/^\/data\/pieces\//); // re-pointed, not dangling
    expect((await request(app).get('/api/photos')).body.length).toBe(1);
  });

  it('stats endpoint shape', async () => {
    await uploadPhoto([{ category: 'top', emb: emb([1]) }]);
    const s = (await request(app).get('/api/stats')).body;
    expect(s).toMatchObject({ totalGarments: 1, totalPhotos: 1 });
    expect(Array.isArray(s.byCategory)).toBe(true);
    expect(Array.isArray(s.mostWorn)).toBe(true);
  });

  it('re-labels a piece and rejects unknown target garment', async () => {
    const r = await uploadPhoto([{ category: 'top', emb: emb([1]) }]);
    const pieceId = r.body.pieces[0].pieceId;
    const ok = await request(app)
      .patch(`/api/pieces/${pieceId}`)
      .send({ category: 'outerwear' });
    expect(ok.status).toBe(200);
    expect(ok.body.category).toBe('outerwear');
    const bad = await request(app)
      .patch(`/api/pieces/${pieceId}`)
      .send({ garment_id: 'nope' });
    expect(bad.status).toBe(404);
  });

  it('settings get/put with validation', async () => {
    const get = await request(app).get('/api/settings');
    expect(get.body).toEqual({ attach: 0.92, suggest: 0.8 });
    const put = await request(app).put('/api/settings').send({ attach: 0.95 });
    expect(put.body.attach).toBe(0.95);
    const bad = await request(app).put('/api/settings').send({ attach: 0.1 });
    expect(bad.status).toBe(400);
  });

  it('export produces a zip', async () => {
    await uploadPhoto([{ category: 'top', emb: emb([1]) }]);
    const res = await request(app).get('/api/io/export').buffer().parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('zip');
    expect((res.body as Buffer).length).toBeGreaterThan(100);
  });
});

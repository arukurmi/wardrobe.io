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
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wardrobe-harden-'));
  app = createApp(db, dataDir);
});

function tmpFileCount(): number {
  const tmp = path.join(dataDir, 'tmp');
  return fs.existsSync(tmp) ? fs.readdirSync(tmp).length : 0;
}

describe('upload hardening', () => {
  it('rejects an oversized file with a clear 400 (not "original required")', async () => {
    const big = Buffer.alloc(16 * 1024 * 1024, 0); // > 15MB limit
    const res = await request(app)
      .post('/api/photos')
      .attach('original', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too large/i);
    expect(res.body.error).not.toMatch(/required/i);
    expect(tmpFileCount()).toBe(0); // tmp files cleaned up
  });

  it('rejects too many files with a clear 400', async () => {
    const req = request(app)
      .post('/api/photos')
      .attach('original', PNG, 'outfit.png');
    for (let i = 0; i < 30; i++) req.attach('crops', PNG, 'crop.png'); // exceeds files:25
    const res = await req;
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too many|unexpected/i);
    expect(res.body.error).not.toMatch(/required/i);
    expect(tmpFileCount()).toBe(0);
  });

  it('rejects a disallowed mimetype with a clear 400', async () => {
    const res = await request(app)
      .post('/api/photos')
      .attach('original', Buffer.from('not an image'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported file type/i);
    expect(res.body.error).not.toMatch(/required/i);
    expect(tmpFileCount()).toBe(0);
  });

  it('rejects an over-long embedding string before decoding', async () => {
    const res = await request(app)
      .post('/api/photos')
      .attach('original', PNG, 'outfit.png')
      .attach('crops', PNG, 'crop.png')
      .field(
        'meta',
        JSON.stringify({
          pieces: [{ category: 'top', bbox: [0, 0, 100, 100], embedding: 'A'.repeat(5000) }],
        })
      );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too long/i);
    expect(tmpFileCount()).toBe(0);
  });

  it('a hostile originalname cannot escape the data dir', async () => {
    const hostile = '../../../../tmp/pwned.png';
    const res = await request(app)
      .post('/api/photos')
      .attach('original', PNG, { filename: hostile, contentType: 'image/png' })
      .attach('crops', PNG, 'crop.png')
      .field(
        'meta',
        JSON.stringify({
          pieces: [{ category: 'top', bbox: [0, 0, 100, 100], embedding: emb([1]) }],
        })
      );
    expect(res.status).toBe(201);

    // exactly one photo written, as a plain nanoid-based basename
    const photos = fs.readdirSync(path.join(dataDir, 'photos'));
    expect(photos.length).toBe(1);
    expect(photos[0]).toMatch(/^[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp)$/);
    expect(photos[0]).not.toContain('..');
    expect(photos[0]).not.toContain('/');

    // nothing leaked outside the photos dir
    expect(fs.existsSync(path.join(dataDir, 'pwned.png'))).toBe(false);
    expect(fs.existsSync(path.resolve(dataDir, '../pwned.png'))).toBe(false);
  });
});

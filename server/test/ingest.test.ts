import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/db.js';
import { ingestPhoto, type IngestInput } from '../src/services/ingest.js';
import { listGarments } from '../src/repo/garments.js';
import { listOpen } from '../src/repo/suggestions.js';
import { listPhotos } from '../src/repo/photos.js';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wardrobe-test-'));
});

function fakeUpload(name: string): string {
  const p = path.join(tmp, `up-${name}`);
  fs.writeFileSync(p, 'fake-image-bytes');
  return p;
}

function input(pieces: { category?: 'top' | 'bottom'; emb: number[] }[]): IngestInput {
  return {
    originalPath: fakeUpload(`orig-${Math.random()}.jpg`),
    originalName: 'photo.jpg',
    pieces: pieces.map((p, i) => ({
      category: p.category ?? 'top',
      bbox: [0, 0, 100, 100] as [number, number, number, number],
      cropPath: fakeUpload(`crop-${Math.random()}-${i}.webp`),
      embedding: Float32Array.from(p.emb),
    })),
  };
}

const dataDir = () => path.join(tmp, 'data');

describe('ingestPhoto', () => {
  it('creates garment for a novel piece and stores files', () => {
    const db = openDb(':memory:');
    const res = ingestPhoto(db, dataDir(), input([{ emb: [1, 0, 0] }]));
    expect(res.pieces[0].decision).toBe('new');
    const garments = listGarments(db);
    expect(garments.length).toBe(1);
    expect(garments[0].display_name).toBe('Top #1');
    expect(garments[0].cover_piece_id).toBe(res.pieces[0].pieceId);
    expect(fs.readdirSync(path.join(dataDir(), 'photos')).length).toBe(1);
    expect(fs.readdirSync(path.join(dataDir(), 'pieces')).length).toBe(1);
    expect(listPhotos(db).length).toBe(1);
  });

  it('attaches identical piece to existing garment', () => {
    const db = openDb(':memory:');
    ingestPhoto(db, dataDir(), input([{ emb: [1, 0, 0] }]));
    const res = ingestPhoto(db, dataDir(), input([{ emb: [1, 0, 0] }]));
    expect(res.pieces[0].decision).toBe('attached');
    expect(listGarments(db).length).toBe(1);
  });

  it('creates new garment + suggestion in the band', () => {
    const db = openDb(':memory:');
    const first = ingestPhoto(db, dataDir(), input([{ emb: [1, 0, 0] }]));
    // cos = 0.85
    const near = [0.85, Math.sqrt(1 - 0.85 ** 2), 0];
    const res = ingestPhoto(db, dataDir(), input([{ emb: near }]));
    expect(res.pieces[0].decision).toBe('new+suggested');
    expect(listGarments(db).length).toBe(2);
    const open = listOpen(db);
    expect(open.length).toBe(1);
    expect(open[0].garment_id).toBe(first.pieces[0].garmentId);
    expect(open[0].similarity).toBeCloseTo(0.85, 2);
  });

  it('does not cross-match categories', () => {
    const db = openDb(':memory:');
    ingestPhoto(db, dataDir(), input([{ emb: [1, 0, 0], category: 'top' }]));
    const res = ingestPhoto(db, dataDir(), input([{ emb: [1, 0, 0], category: 'bottom' }]));
    expect(res.pieces[0].decision).toBe('new');
    expect(listGarments(db).length).toBe(2);
  });

  it('accepts a photo with zero pieces (ML failure path)', () => {
    const db = openDb(':memory:');
    const res = ingestPhoto(db, dataDir(), input([]));
    expect(res.pieces.length).toBe(0);
    expect(listPhotos(db).length).toBe(1);
  });
});

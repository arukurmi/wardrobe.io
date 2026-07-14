import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/db.js';
import { ingestPhoto } from '../src/services/ingest.js';
import { exportAll, importAll } from '../src/services/portability.js';
import { listGarments } from '../src/repo/garments.js';
import { getThresholds } from '../src/repo/settings.js';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wardrobe-port-'));
});

function upload(name: string): string {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, `bytes-of-${name}`);
  return p;
}

describe('export/import', () => {
  it('round-trips data and files into a fresh db', async () => {
    const srcData = path.join(tmp, 'data-src');
    const db = openDb(':memory:');
    ingestPhoto(db, srcData, {
      originalPath: upload('o1.jpg'),
      originalName: 'o1.jpg',
      pieces: [
        {
          category: 'top',
          bbox: [1, 2, 3, 4],
          cropPath: upload('c1.webp'),
          embedding: Float32Array.from([1, 0]),
        },
      ],
    });

    const zipPath = path.join(tmp, 'backup.zip');
    await exportAll(db, srcData, fs.createWriteStream(zipPath));
    expect(fs.statSync(zipPath).size).toBeGreaterThan(0);

    const dstData = path.join(tmp, 'data-dst');
    const db2 = openDb(':memory:');
    await importAll(db2, dstData, zipPath);

    expect(listGarments(db2).length).toBe(1);
    expect(getThresholds(db2)).toEqual({ attach: 0.92, suggest: 0.8 });
    expect(fs.readdirSync(path.join(dstData, 'photos')).length).toBe(1);
    expect(fs.readdirSync(path.join(dstData, 'pieces')).length).toBe(1);
  });

  it('refuses to import into a non-empty database', async () => {
    const srcData = path.join(tmp, 'data-src');
    const db = openDb(':memory:');
    ingestPhoto(db, srcData, {
      originalPath: upload('o1.jpg'),
      originalName: 'o1.jpg',
      pieces: [],
    });
    const zipPath = path.join(tmp, 'backup.zip');
    await exportAll(db, srcData, fs.createWriteStream(zipPath));
    await expect(importAll(db, srcData, zipPath)).rejects.toThrow(/empty/);
  });
});

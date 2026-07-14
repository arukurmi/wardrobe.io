import { describe, it, expect } from 'vitest';
import { openDb, CATEGORIES } from '../src/db.js';

describe('openDb', () => {
  it('creates all tables', () => {
    const db = openDb(':memory:');
    const names = db
      .prepare("select name from sqlite_master where type='table'")
      .all()
      .map((r: any) => r.name);
    for (const t of [
      'photos',
      'pieces',
      'garments',
      'merge_events',
      'duplicate_suggestions',
      'settings',
    ]) {
      expect(names).toContain(t);
    }
  });

  it('enforces foreign keys', () => {
    const db = openDb(':memory:');
    expect(() =>
      db
        .prepare(
          `insert into pieces (id, photo_id, garment_id, category, bbox_json, crop_filename, embedding)
           values ('p1', 'nope', 'nope', 'top', '[0,0,1,1]', 'x.webp', x'00')`
        )
        .run()
    ).toThrow();
  });

  it('seeds tunable thresholds', () => {
    const db = openDb(':memory:');
    const rows = db.prepare('select key, value from settings').all() as any[];
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(Number(map.threshold_attach)).toBe(0.92);
    expect(Number(map.threshold_suggest)).toBe(0.8);
  });

  it('is idempotent on reopen', () => {
    const db = openDb(':memory:');
    expect(() => openDb(':memory:')).not.toThrow();
    expect(CATEGORIES).toContain('top');
    expect(CATEGORIES.length).toBe(8);
    db.close();
  });
});

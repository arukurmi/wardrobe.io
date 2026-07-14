import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db.js';
import {
  insertGarment,
  getGarment,
  listGarments,
  updateGarment,
  representativeEmbeddings,
} from '../src/repo/garments.js';
import { insertPhoto } from '../src/repo/photos.js';
import { insertPiece } from '../src/repo/pieces.js';
import { embToBlob } from '../src/lib/similarity.js';

describe('garments repo', () => {
  it('inserts, patches, filters', () => {
    const db = openDb(':memory:');
    insertGarment(db, { id: 'g1', display_name: 'Top #1', category: 'top' });
    insertGarment(db, { id: 'g2', display_name: 'Jeans #1', category: 'bottom' });
    updateGarment(db, 'g2', { brand: 'Levis', price_cents: 400000 });
    expect(getGarment(db, 'g2')?.brand).toBe('Levis');
    expect(listGarments(db, { category: 'top' }).map((g) => g.id)).toEqual(['g1']);
    expect(listGarments(db, { q: 'levi' }).map((g) => g.id)).toEqual(['g2']);
    expect(listGarments(db).length).toBe(2);
  });

  it('hides merged garments from list', () => {
    const db = openDb(':memory:');
    insertGarment(db, { id: 'g1', display_name: 'Top #1', category: 'top' });
    insertGarment(db, { id: 'g2', display_name: 'Top #2', category: 'top' });
    db.prepare("update garments set merged_into = 'g1' where id = 'g2'").run();
    expect(listGarments(db).map((g) => g.id)).toEqual(['g1']);
  });

  it('averages piece embeddings per garment, renormalized', () => {
    const db = openDb(':memory:');
    insertPhoto(db, { id: 'ph1', filename: 'a.jpg' });
    insertGarment(db, { id: 'g1', display_name: 'Top #1', category: 'top' });
    const base = {
      photo_id: 'ph1',
      garment_id: 'g1',
      category: 'top' as const,
      bbox_json: '[0,0,1,1]',
      crop_filename: 'c.webp',
    };
    insertPiece(db, { ...base, id: 'p1', embedding: embToBlob(Float32Array.from([1, 0])) });
    insertPiece(db, { ...base, id: 'p2', embedding: embToBlob(Float32Array.from([0, 1])) });
    const reps = representativeEmbeddings(db);
    expect(reps.length).toBe(1);
    const e = reps[0].emb;
    // mean = [0.5, 0.5] renormalized -> [~0.707, ~0.707]
    expect(e[0]).toBeCloseTo(Math.SQRT1_2, 4);
    expect(e[1]).toBeCloseTo(Math.SQRT1_2, 4);
    expect(reps[0].category).toBe('top');
  });
});

import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db.js';
import { insertPhoto } from '../src/repo/photos.js';
import { insertGarment, updateGarment } from '../src/repo/garments.js';
import { insertPiece } from '../src/repo/pieces.js';
import { getStats } from '../src/services/stats.js';
import { embToBlob } from '../src/lib/similarity.js';

describe('getStats', () => {
  it('computes counts, value, categories, most-worn, cost-per-wear', () => {
    const db = openDb(':memory:');
    insertPhoto(db, { id: 'ph1', filename: 'a.jpg' });
    insertPhoto(db, { id: 'ph2', filename: 'b.jpg' });
    insertGarment(db, { id: 'g1', display_name: 'White Tee', category: 'top' });
    insertGarment(db, { id: 'g2', display_name: 'Jeans', category: 'bottom' });
    insertGarment(db, { id: 'g3', display_name: 'Merged Tee', category: 'top' });
    db.prepare("update garments set merged_into = 'g1' where id = 'g3'").run();
    updateGarment(db, 'g1', { price_cents: 100000 }); // ₹1000
    const mk = (id: string, photo: string, garment: string) =>
      insertPiece(db, {
        id,
        photo_id: photo,
        garment_id: garment,
        category: 'top',
        bbox_json: '[0,0,1,1]',
        crop_filename: `${id}.webp`,
        embedding: embToBlob(Float32Array.from([1])),
      });
    mk('p1', 'ph1', 'g1');
    mk('p2', 'ph2', 'g1');
    mk('p3', 'ph2', 'g2');

    const s = getStats(db);
    expect(s.totalGarments).toBe(2); // merged one excluded
    expect(s.totalPhotos).toBe(2);
    expect(s.totalValueCents).toBe(100000);
    expect(s.byCategory).toContainEqual({ category: 'top', count: 1 });
    expect(s.mostWorn[0]).toMatchObject({ garmentId: 'g1', wearCount: 2 });
    expect(s.costPerWear).toEqual([
      { garmentId: 'g1', name: 'White Tee', cpwCents: 50000 },
    ]);
  });
});

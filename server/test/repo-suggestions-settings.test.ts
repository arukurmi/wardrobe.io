import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db.js';
import { insertPhoto } from '../src/repo/photos.js';
import { insertGarment } from '../src/repo/garments.js';
import { insertPiece } from '../src/repo/pieces.js';
import {
  insertSuggestion,
  listOpen,
  setStatus,
  getSuggestion,
} from '../src/repo/suggestions.js';
import { getThresholds, setThreshold } from '../src/repo/settings.js';
import { embToBlob } from '../src/lib/similarity.js';

describe('suggestions repo', () => {
  it('lifecycle: open -> accepted, only once', () => {
    const db = openDb(':memory:');
    insertPhoto(db, { id: 'ph1', filename: 'a.jpg' });
    insertGarment(db, { id: 'g1', display_name: 'Top #1', category: 'top' });
    insertGarment(db, { id: 'g2', display_name: 'Top #2', category: 'top' });
    insertPiece(db, {
      id: 'p1',
      photo_id: 'ph1',
      garment_id: 'g2',
      category: 'top',
      bbox_json: '[0,0,1,1]',
      crop_filename: 'p1.webp',
      embedding: embToBlob(Float32Array.from([1, 0])),
    });
    insertSuggestion(db, { id: 's1', piece_id: 'p1', garment_id: 'g1', similarity: 0.87 });
    expect(listOpen(db).length).toBe(1);
    expect(setStatus(db, 's1', 'accepted')).toBe(true);
    expect(setStatus(db, 's1', 'dismissed')).toBe(false); // no longer open
    expect(getSuggestion(db, 's1')?.status).toBe('accepted');
    expect(listOpen(db).length).toBe(0);
  });
});

describe('settings repo', () => {
  it('reads seeded thresholds and updates them', () => {
    const db = openDb(':memory:');
    expect(getThresholds(db)).toEqual({ attach: 0.92, suggest: 0.8 });
    setThreshold(db, 'threshold_attach', 0.95);
    expect(getThresholds(db).attach).toBe(0.95);
  });
});

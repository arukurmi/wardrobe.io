import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db.js';
import { insertPhoto, deletePhoto } from '../src/repo/photos.js';
import { insertGarment } from '../src/repo/garments.js';
import {
  insertPiece,
  piecesForPhoto,
  piecesForGarment,
  updatePiece,
  deletePiece,
  getPiece,
} from '../src/repo/pieces.js';
import { embToBlob } from '../src/lib/similarity.js';

function seed(db: ReturnType<typeof openDb>) {
  insertPhoto(db, { id: 'ph1', filename: 'a.jpg' });
  insertGarment(db, { id: 'g1', display_name: 'Top #1', category: 'top' });
  insertGarment(db, { id: 'g2', display_name: 'Top #2', category: 'top' });
  insertPiece(db, {
    id: 'p1',
    photo_id: 'ph1',
    garment_id: 'g1',
    category: 'top',
    bbox_json: '[0,0,10,10]',
    crop_filename: 'p1.webp',
    embedding: embToBlob(Float32Array.from([1, 0])),
  });
}

describe('pieces repo', () => {
  it('queries by photo and garment', () => {
    const db = openDb(':memory:');
    seed(db);
    expect(piecesForPhoto(db, 'ph1').length).toBe(1);
    expect(piecesForGarment(db, 'g1').length).toBe(1);
    expect(getPiece(db, 'p1')?.category).toBe('top');
  });

  it('re-labels and re-assigns', () => {
    const db = openDb(':memory:');
    seed(db);
    updatePiece(db, 'p1', { category: 'outerwear', garment_id: 'g2' });
    const p = getPiece(db, 'p1')!;
    expect(p.category).toBe('outerwear');
    expect(p.garment_id).toBe('g2');
  });

  it('cascades on photo delete', () => {
    const db = openDb(':memory:');
    seed(db);
    deletePhoto(db, 'ph1');
    expect(piecesForPhoto(db, 'ph1').length).toBe(0);
  });

  it('deletes a piece', () => {
    const db = openDb(':memory:');
    seed(db);
    expect(deletePiece(db, 'p1')).toBe(true);
    expect(getPiece(db, 'p1')).toBeUndefined();
  });
});

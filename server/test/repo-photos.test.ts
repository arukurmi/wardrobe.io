import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db.js';
import { insertPhoto, listPhotos, getPhoto, deletePhoto } from '../src/repo/photos.js';

describe('photos repo', () => {
  it('inserts, gets, lists, deletes', () => {
    const db = openDb(':memory:');
    insertPhoto(db, { id: 'ph1', filename: 'ph1.jpg' });
    insertPhoto(db, { id: 'ph2', filename: 'ph2.jpg', taken_at: '2026-01-01' });
    expect(getPhoto(db, 'ph1')?.filename).toBe('ph1.jpg');
    expect(listPhotos(db).length).toBe(2);
    expect(deletePhoto(db, 'ph1')).toBe(true);
    expect(deletePhoto(db, 'ph1')).toBe(false);
    expect(listPhotos(db).length).toBe(1);
  });
});

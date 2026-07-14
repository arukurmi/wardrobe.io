import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '../src/db.js';
import { insertPhoto } from '../src/repo/photos.js';
import { insertGarment, listGarments, getGarment } from '../src/repo/garments.js';
import { insertPiece, piecesForGarment, piecesForPhoto } from '../src/repo/pieces.js';
import { insertSuggestion, getSuggestion } from '../src/repo/suggestions.js';
import {
  mergeGarments,
  undoMerge,
  acceptSuggestion,
  MergeError,
} from '../src/services/merge.js';
import { embToBlob } from '../src/lib/similarity.js';

function seed(db: Db) {
  insertPhoto(db, { id: 'ph1', filename: 'a.jpg' });
  insertPhoto(db, { id: 'ph2', filename: 'b.jpg' });
  insertGarment(db, { id: 'gA', display_name: 'Top #1', category: 'top' });
  insertGarment(db, { id: 'gB', display_name: 'Top #2', category: 'top' });
  const mk = (id: string, photo: string, garment: string) =>
    insertPiece(db, {
      id,
      photo_id: photo,
      garment_id: garment,
      category: 'top',
      bbox_json: '[0,0,1,1]',
      crop_filename: `${id}.webp`,
      embedding: embToBlob(Float32Array.from([1, 0])),
    });
  mk('pA1', 'ph1', 'gA');
  mk('pB1', 'ph2', 'gB');
  mk('pB2', 'ph1', 'gB');
}

describe('mergeGarments', () => {
  it('re-points pieces, hides source, outfits resolve to target', () => {
    const db = openDb(':memory:');
    seed(db);
    mergeGarments(db, 'gB', 'gA');
    expect(piecesForGarment(db, 'gA').length).toBe(3);
    expect(piecesForGarment(db, 'gB').length).toBe(0);
    expect(listGarments(db).map((g) => g.id)).toEqual(['gA']);
    // photo ph1 had pieces of both garments; all now point at gA
    expect(new Set(piecesForPhoto(db, 'ph1').map((p) => p.garment_id))).toEqual(
      new Set(['gA'])
    );
  });

  it('rejects self-merge, missing, and already-merged garments', () => {
    const db = openDb(':memory:');
    seed(db);
    expect(() => mergeGarments(db, 'gA', 'gA')).toThrow(MergeError);
    expect(() => mergeGarments(db, 'nope', 'gA')).toThrow(MergeError);
    mergeGarments(db, 'gB', 'gA');
    expect(() => mergeGarments(db, 'gB', 'gA')).toThrow(MergeError);
    expect(() => mergeGarments(db, 'gA', 'gB')).toThrow(MergeError);
  });

  it('undo restores exactly the moved pieces, once', () => {
    const db = openDb(':memory:');
    seed(db);
    const { mergeEventId } = mergeGarments(db, 'gB', 'gA');
    undoMerge(db, mergeEventId);
    expect(piecesForGarment(db, 'gB').map((p) => p.id).sort()).toEqual(['pB1', 'pB2']);
    expect(piecesForGarment(db, 'gA').map((p) => p.id)).toEqual(['pA1']);
    expect(getGarment(db, 'gB')?.merged_into).toBeNull();
    expect(() => undoMerge(db, mergeEventId)).toThrow(MergeError);
  });

  it('accepts a suggestion as a merge', () => {
    const db = openDb(':memory:');
    seed(db);
    insertSuggestion(db, { id: 's1', piece_id: 'pB1', garment_id: 'gA', similarity: 0.88 });
    acceptSuggestion(db, 's1');
    expect(getSuggestion(db, 's1')?.status).toBe('accepted');
    expect(listGarments(db).map((g) => g.id)).toEqual(['gA']);
    expect(() => acceptSuggestion(db, 's1')).toThrow(MergeError);
  });
});

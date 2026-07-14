import fs from 'node:fs';
import path from 'node:path';
import type { Db, Category } from '../db.js';
import { newId } from '../lib/ids.js';
import { matchEmbedding, embToBlob } from '../lib/similarity.js';
import { insertPhoto } from '../repo/photos.js';
import { insertPiece } from '../repo/pieces.js';
import {
  insertGarment,
  listGarments,
  representativeEmbeddings,
  updateGarment,
} from '../repo/garments.js';
import { insertSuggestion } from '../repo/suggestions.js';
import { getThresholds } from '../repo/settings.js';

export type IngestPieceInput = {
  category: Category;
  bbox: [number, number, number, number];
  cropPath: string;
  embedding: Float32Array;
};

export type IngestInput = {
  originalPath: string;
  originalName: string;
  pieces: IngestPieceInput[];
};

export type IngestResult = {
  photoId: string;
  pieces: {
    pieceId: string;
    garmentId: string;
    decision: 'attached' | 'new' | 'new+suggested';
    suggestionId?: string;
    similarity?: number;
  }[];
};

function ext(name: string): string {
  const e = path.extname(name).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(e) ? e : '.jpg';
}

/**
 * Persist one uploaded photo + its detected pieces.
 * Files are moved into dataDir first; DB writes happen in one transaction,
 * with moved files cleaned up if the transaction throws.
 */
export function ingestPhoto(db: Db, dataDir: string, input: IngestInput): IngestResult {
  const photosDir = path.join(dataDir, 'photos');
  const piecesDir = path.join(dataDir, 'pieces');
  fs.mkdirSync(photosDir, { recursive: true });
  fs.mkdirSync(piecesDir, { recursive: true });

  const photoId = newId();
  const photoFilename = `${photoId}${ext(input.originalName)}`;
  const movedFiles: string[] = [];

  const photoDest = path.join(photosDir, photoFilename);
  fs.copyFileSync(input.originalPath, photoDest);
  movedFiles.push(photoDest);
  fs.rmSync(input.originalPath, { force: true });

  const pieceFiles: string[] = [];
  for (const p of input.pieces) {
    const pieceId = newId();
    const cropFilename = `${pieceId}.webp`;
    const dest = path.join(piecesDir, cropFilename);
    fs.copyFileSync(p.cropPath, dest);
    movedFiles.push(dest);
    fs.rmSync(p.cropPath, { force: true });
    pieceFiles.push(cropFilename);
    (p as IngestPieceInput & { _id?: string; _crop?: string })._id = pieceId;
    (p as IngestPieceInput & { _id?: string; _crop?: string })._crop = cropFilename;
  }

  const run = db.transaction((): IngestResult => {
    insertPhoto(db, { id: photoId, filename: photoFilename });
    const thresholds = getThresholds(db);
    // Snapshot once per photo; pieces within one photo are distinct garments
    // on the body, so they should not match each other anyway.
    const reps = representativeEmbeddings(db);
    const results: IngestResult['pieces'] = [];

    for (const p of input.pieces) {
      const pieceId = (p as IngestPieceInput & { _id: string })._id;
      const cropFilename = (p as IngestPieceInput & { _crop: string })._crop;
      const candidates = reps.filter((r) => r.category === p.category);
      const match = matchEmbedding(p.embedding, candidates, thresholds);

      let garmentId: string;
      let decision: IngestResult['pieces'][number]['decision'];
      let suggestionId: string | undefined;

      if (match.kind === 'attach') {
        garmentId = match.garmentId!;
        decision = 'attached';
      } else {
        garmentId = newId();
        const count = listGarments(db, { category: p.category }).length;
        const label = p.category[0].toUpperCase() + p.category.slice(1);
        insertGarment(db, {
          id: garmentId,
          display_name: `${label} #${count + 1}`,
          category: p.category,
        });
        decision = 'new';
      }

      insertPiece(db, {
        id: pieceId,
        photo_id: photoId,
        garment_id: garmentId,
        category: p.category,
        bbox_json: JSON.stringify(p.bbox),
        crop_filename: cropFilename,
        embedding: embToBlob(p.embedding),
      });

      if (decision === 'new') {
        // first piece becomes the cover
        updateGarment(db, garmentId, { cover_piece_id: pieceId });
        if (match.kind === 'suggest') {
          suggestionId = newId();
          insertSuggestion(db, {
            id: suggestionId,
            piece_id: pieceId,
            garment_id: match.garmentId!,
            similarity: match.similarity!,
          });
          decision = 'new+suggested';
        }
      }

      results.push({
        pieceId,
        garmentId,
        decision,
        suggestionId,
        similarity: match.similarity,
      });
    }
    return { photoId, pieces: results };
  });

  try {
    return run();
  } catch (err) {
    for (const f of movedFiles) fs.rmSync(f, { force: true });
    throw err;
  }
}

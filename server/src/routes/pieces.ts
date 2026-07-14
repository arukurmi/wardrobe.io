import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Db } from '../db.js';
import { CATEGORIES } from '../db.js';
import { getPiece, updatePiece, deletePiece, piecesForGarment } from '../repo/pieces.js';
import { getGarment, updateGarment } from '../repo/garments.js';
import { pieceDto } from './photos.js';

const patchSchema = z
  .object({
    category: z.enum(CATEGORIES as [string, ...string[]]),
    garment_id: z.string().max(30),
  })
  .partial()
  .strict();

export function piecesRouter(db: Db, dataDir: string): Router {
  const router = Router();

  router.patch('/:id', (req, res) => {
    const patch = patchSchema.parse(req.body);
    const piece = getPiece(db, req.params.id);
    if (!piece) return res.status(404).json({ error: 'piece not found' });
    if (patch.garment_id && !getGarment(db, patch.garment_id))
      return res.status(404).json({ error: 'target garment not found' });
    updatePiece(db, req.params.id, patch as any);
    res.json(pieceDto(getPiece(db, req.params.id)!));
  });

  router.delete('/:id', (req, res) => {
    const piece = getPiece(db, req.params.id);
    if (!piece) return res.status(404).json({ error: 'piece not found' });
    db.transaction(() => {
      const g = getGarment(db, piece.garment_id);
      if (g?.cover_piece_id === piece.id) {
        const remaining = piecesForGarment(db, g.id).filter((x) => x.id !== piece.id);
        updateGarment(db, g.id, { cover_piece_id: remaining[0]?.id ?? null });
      }
      deletePiece(db, piece.id);
    })();
    fs.rmSync(path.join(dataDir, 'pieces', piece.crop_filename), { force: true });
    res.json({ ok: true });
  });

  return router;
}

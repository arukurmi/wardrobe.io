import { Router } from 'express';
import type { Db } from '../db.js';
import { listOpen, setStatus, getSuggestion } from '../repo/suggestions.js';
import { getPiece } from '../repo/pieces.js';
import { getGarment } from '../repo/garments.js';
import { acceptSuggestion } from '../services/merge.js';
import { pieceDto } from './photos.js';

export function suggestionsRouter(db: Db): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const out = listOpen(db)
      .map((s) => {
        const piece = getPiece(db, s.piece_id);
        const garment = getGarment(db, s.garment_id);
        if (!piece || !garment || garment.merged_into) return null;
        const pieceGarment = getGarment(db, piece.garment_id);
        const cover = garment.cover_piece_id ? getPiece(db, garment.cover_piece_id) : undefined;
        return {
          id: s.id,
          similarity: s.similarity,
          piece: pieceDto(piece),
          pieceGarment: pieceGarment && {
            id: pieceGarment.id,
            name: pieceGarment.display_name,
          },
          garment: {
            id: garment.id,
            name: garment.display_name,
            coverUrl: cover ? `/data/pieces/${cover.crop_filename}` : null,
          },
        };
      })
      .filter(Boolean);
    res.json(out);
  });

  router.post('/:id/accept', (req, res) => {
    const s = getSuggestion(db, req.params.id);
    if (!s) return res.status(404).json({ error: 'suggestion not found' });
    const result = acceptSuggestion(db, req.params.id);
    res.json(result);
  });

  router.post('/:id/dismiss', (req, res) => {
    if (!setStatus(db, req.params.id, 'dismissed'))
      return res.status(404).json({ error: 'suggestion not open' });
    res.json({ ok: true });
  });

  return router;
}

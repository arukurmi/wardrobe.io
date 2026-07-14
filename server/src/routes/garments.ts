import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { CATEGORIES } from '../db.js';
import {
  listGarments,
  getGarment,
  updateGarment,
  type GarmentRow,
} from '../repo/garments.js';
import { piecesForGarment, getPiece } from '../repo/pieces.js';
import { getPhoto } from '../repo/photos.js';
import { mergeGarments, undoMerge, listMergeEventsFor } from '../services/merge.js';
import { pieceDto } from './photos.js';

const patchSchema = z
  .object({
    display_name: z.string().trim().min(1).max(120),
    brand: z.string().trim().max(120).nullable(),
    color: z.string().trim().max(60).nullable(),
    price_cents: z.number().int().min(0).max(100_000_000).nullable(),
    category: z.enum(CATEGORIES as [string, ...string[]]),
    cover_piece_id: z.string().max(30).nullable(),
  })
  .partial()
  .strict();

function garmentDto(db: Db, g: GarmentRow, opts: { detail?: boolean } = {}) {
  const cover = g.cover_piece_id ? getPiece(db, g.cover_piece_id) : undefined;
  const pieces = piecesForGarment(db, g.id);
  const base = {
    id: g.id,
    name: g.display_name,
    category: g.category,
    brand: g.brand,
    color: g.color,
    priceCents: g.price_cents,
    coverUrl: cover ? `/data/pieces/${cover.crop_filename}` : null,
    wearCount: pieces.length,
  };
  if (!opts.detail) return base;
  return {
    ...base,
    pieces: pieces.map((p) => ({
      ...pieceDto(p),
      photo: getPhoto(db, p.photo_id),
    })),
    mergeHistory: listMergeEventsFor(db, g.id),
  };
}

export function garmentsRouter(db: Db): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const { category, q } = req.query as { category?: string; q?: string };
    res.json(listGarments(db, { category, q }).map((g) => garmentDto(db, g)));
  });

  router.get('/:id', (req, res) => {
    const g = getGarment(db, req.params.id);
    if (!g) return res.status(404).json({ error: 'garment not found' });
    res.json(garmentDto(db, g, { detail: true }));
  });

  router.patch('/:id', (req, res) => {
    const patch = patchSchema.parse(req.body);
    if (!getGarment(db, req.params.id))
      return res.status(404).json({ error: 'garment not found' });
    updateGarment(db, req.params.id, patch as any);
    res.json(garmentDto(db, getGarment(db, req.params.id)!, { detail: true }));
  });

  router.post('/:id/merge', (req, res) => {
    const body = z.object({ into: z.string().min(1) }).parse(req.body);
    const result = mergeGarments(db, req.params.id, body.into);
    res.json(result);
  });

  return router;
}

export function mergesRouter(db: Db): Router {
  const router = Router();
  router.post('/:id/undo', (req, res) => {
    undoMerge(db, req.params.id);
    res.json({ ok: true });
  });
  return router;
}

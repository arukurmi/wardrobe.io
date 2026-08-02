import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Db } from '../db.js';
import { CATEGORIES } from '../db.js';
import { ingestPhoto, type IngestPieceInput } from '../services/ingest.js';
import { listPhotos, getPhoto, deletePhoto } from '../repo/photos.js';
import { piecesForPhoto, piecesForGarment } from '../repo/pieces.js';
import { getGarment, updateGarment } from '../repo/garments.js';

const EMBEDDING_DIM = 512;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

/** Raised by the multer fileFilter for a disallowed mimetype. */
class UnsupportedFileTypeError extends Error {
  constructor() {
    super('unsupported file type');
    this.name = 'UnsupportedFileTypeError';
  }
}

const metaSchema = z.object({
  pieces: z
    .array(
      z.object({
        category: z.enum(CATEGORIES as [string, ...string[]]),
        bbox: z.tuple([
          z.number().finite().min(0).max(10000),
          z.number().finite().min(0).max(10000),
          z.number().finite().min(0).max(10000),
          z.number().finite().min(0).max(10000),
        ]),
        // base64 Float32Array(512) ≈ 2732 chars; cap well above that so we
        // never base64-decode an absurd input. Exact byte length is still
        // checked in decodeEmbedding.
        embedding: z.string().min(1).max(4096, 'embedding string too long'),
      })
    )
    .max(24),
});

/** Every tmp file multer wrote for this request, across all fields. */
function uploadedFiles(req: Request): Express.Multer.File[] {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return files ? Object.values(files).flat() : [];
}

/** Best-effort removal of tmp files; safe to call on any error path. */
function rmTmpFiles(files: Express.Multer.File[]): void {
  for (const f of files) fs.rmSync(f.path, { force: true });
}

function decodeEmbedding(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  if (buf.byteLength !== EMBEDDING_DIM * 4) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['embedding'],
        message: `embedding must be ${EMBEDDING_DIM} float32 values`,
      },
    ]);
  }
  const copy = Buffer.from(buf);
  return new Float32Array(copy.buffer, copy.byteOffset, EMBEDDING_DIM);
}

export function photosRouter(db: Db, dataDir: string): Router {
  const tmpDir = path.join(dataDir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const upload = multer({
    dest: tmpDir,
    limits: { fileSize: 15 * 1024 * 1024, files: 25 },
    fileFilter: (_req, file, cb) => {
      // Reject with an error (not cb(null,false)) so the caller gets a clear
      // 400 instead of a downstream "original required" message.
      if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
      else cb(new UnsupportedFileTypeError());
    },
  });

  const uploadFields = upload.fields([
    { name: 'original', maxCount: 1 },
    { name: 'crops', maxCount: 24 },
  ]);

  // Translate multer limit errors and mimetype rejections into descriptive
  // 400s, cleaning up any tmp files multer already wrote before aborting.
  const handleUpload = (req: Request, res: Response, next: NextFunction) => {
    uploadFields(req, res, (err: unknown) => {
      if (!err) return next();
      rmTmpFiles(uploadedFiles(req));
      if (err instanceof UnsupportedFileTypeError) {
        return res
          .status(400)
          .json({ error: 'unsupported file type (only jpeg/png/webp allowed)' });
      }
      if (err instanceof multer.MulterError) {
        const messages: Record<string, string> = {
          LIMIT_FILE_SIZE: 'file too large (max 15MB per image)',
          LIMIT_FILE_COUNT: 'too many files (max 25)',
          LIMIT_PART_COUNT: 'too many upload parts',
          LIMIT_UNEXPECTED_FILE: 'unexpected file field',
        };
        return res.status(400).json({ error: messages[err.code] ?? `upload rejected: ${err.message}` });
      }
      return next(err);
    });
  };

  const router = Router();

  router.post(
    '/',
    handleUpload,
    (req, res) => {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const original = files?.original?.[0];
      const crops = files?.crops ?? [];
      const cleanup = () => rmTmpFiles(uploadedFiles(req));
      try {
        if (!original) {
          cleanup();
          return res.status(400).json({ error: 'original image required (jpeg/png/webp)' });
        }
        const meta = metaSchema.parse(JSON.parse(String(req.body.meta ?? '{"pieces":[]}')));
        if (meta.pieces.length !== crops.length) {
          cleanup();
          return res
            .status(400)
            .json({ error: 'pieces metadata count must match crop file count' });
        }
        const pieces: IngestPieceInput[] = meta.pieces.map((p, i) => ({
          category: p.category as IngestPieceInput['category'],
          bbox: p.bbox,
          cropPath: crops[i].path,
          embedding: decodeEmbedding(p.embedding),
        }));
        const result = ingestPhoto(db, dataDir, {
          originalPath: original.path,
          originalName: original.originalname,
          pieces,
        });
        res.status(201).json(result);
      } catch (err) {
        cleanup();
        throw err;
      }
    }
  );

  router.get('/', (_req, res) => {
    const photos = listPhotos(db).map((ph) => ({
      ...ph,
      pieces: piecesForPhoto(db, ph.id).map(pieceDto),
    }));
    res.json(photos);
  });

  router.get('/:id', (req, res) => {
    const ph = getPhoto(db, req.params.id);
    if (!ph) return res.status(404).json({ error: 'photo not found' });
    res.json({ ...ph, pieces: piecesForPhoto(db, ph.id).map(pieceDto) });
  });

  router.delete('/:id', (req, res) => {
    const ph = getPhoto(db, req.params.id);
    if (!ph) return res.status(404).json({ error: 'photo not found' });
    const pieces = piecesForPhoto(db, ph.id);
    db.transaction(() => {
      // fix covers pointing at pieces we are about to cascade-delete
      for (const p of pieces) {
        const g = getGarment(db, p.garment_id);
        if (g?.cover_piece_id === p.id) {
          const remaining = piecesForGarment(db, g.id).filter((x) => x.id !== p.id);
          updateGarment(db, g.id, { cover_piece_id: remaining[0]?.id ?? null });
        }
      }
      deletePhoto(db, ph.id);
    })();
    fs.rmSync(path.join(dataDir, 'photos', ph.filename), { force: true });
    for (const p of pieces)
      fs.rmSync(path.join(dataDir, 'pieces', p.crop_filename), { force: true });
    res.json({ ok: true });
  });

  return router;
}

export function pieceDto(p: {
  id: string;
  photo_id: string;
  garment_id: string;
  category: string;
  bbox_json: string;
  crop_filename: string;
}) {
  return {
    id: p.id,
    photoId: p.photo_id,
    garmentId: p.garment_id,
    category: p.category,
    bbox: JSON.parse(p.bbox_json) as number[],
    cropUrl: `/data/pieces/${p.crop_filename}`,
  };
}

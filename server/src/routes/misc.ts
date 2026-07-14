import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import multer from 'multer';
import { z } from 'zod';
import type { Db } from '../db.js';
import { getStats } from '../services/stats.js';
import { exportAll, importAll } from '../services/portability.js';
import { getThresholds, setThreshold } from '../repo/settings.js';

export function statsRouter(db: Db): Router {
  const router = Router();
  router.get('/', (_req, res) => res.json(getStats(db)));
  return router;
}

export function settingsRouter(db: Db): Router {
  const router = Router();
  router.get('/', (_req, res) => res.json(getThresholds(db)));
  router.put('/', (req, res) => {
    const body = z
      .object({
        attach: z.number().min(0.5).max(1),
        suggest: z.number().min(0.3).max(1),
      })
      .partial()
      .strict()
      .parse(req.body);
    if (body.attach !== undefined) setThreshold(db, 'threshold_attach', body.attach);
    if (body.suggest !== undefined) setThreshold(db, 'threshold_suggest', body.suggest);
    res.json(getThresholds(db));
  });
  return router;
}

export function ioRouter(db: Db, dataDir: string): Router {
  const router = Router();
  const upload = multer({
    dest: path.join(os.tmpdir(), 'wardrobe-import'),
    limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  });

  router.get('/export', async (_req, res, next) => {
    try {
      res.setHeader('content-type', 'application/zip');
      res.setHeader(
        'content-disposition',
        `attachment; filename="wardrobe-backup-${new Date().toISOString().slice(0, 10)}.zip"`
      );
      await exportAll(db, dataDir, res);
    } catch (err) {
      next(err);
    }
  });

  router.post('/import', upload.single('backup'), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'backup zip required' });
      await importAll(db, dataDir, req.file.path);
      fs.rmSync(req.file.path, { force: true });
      res.json({ ok: true });
    } catch (err) {
      if (req.file) fs.rmSync(req.file.path, { force: true });
      next(err);
    }
  });

  return router;
}

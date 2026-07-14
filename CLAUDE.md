# wardrobe.io — dev notes

Personal wardrobe tracker: photos → ML-detected pieces → deduplicated garments.
Spec: `docs/superpowers/specs/`, plan: `docs/superpowers/plans/`, product
roadmap: `SCOPE.md`, interview Q&A: `docs/interview-prep.md`.

## Commands

```bash
cd server && npm run dev    # API on :3001, data in ./data (gitignored)
cd client && npm run dev    # UI on :5173, proxies /api and /data to :3001
cd server && npm test       # 45 vitest specs
cd client && npm test       # 16 vitest specs
node scripts/make-samples.mjs && node scripts/simulate-client.mjs  # e2e (server must be running)
```

## Layout

- `server/src/repo/*` — all SQL (prepared statements only, named params)
- `server/src/services/*` — ingest (dedupe), merge/undo, stats, export/import
- `server/src/routes/*` — zod-validated HTTP, central error map in `app.ts`
- `client/src/ml/` — pipeline.ts (pure, tested) + worker.ts (transformers.js)
- `client/src/upload/` — queue.ts (tested state machine) + wire.ts (glue)

## Constraints / gotchas

- Node 20.12 on this machine: **vitest must stay v3, vite v6, archiver v7**
  (v4/v8/v8 need newer Node or changed APIs).
- Embeddings: 512-dim Float32, L2-normalized, stored as SQLite BLOB,
  base64 over HTTP. Dimension is enforced in `routes/photos.ts`.
- Thresholds (attach 0.92 / suggest 0.80) live in the `settings` table.
- Merged garments are soft-deleted (`merged_into`); all list queries must
  filter `merged_into IS NULL`.
- Granular conventional commits, pushed to `main` after each unit.

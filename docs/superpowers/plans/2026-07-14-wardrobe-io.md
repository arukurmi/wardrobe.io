# wardrobe.io Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Personal wardrobe tracker — upload outfit photos, ML breaks them into clothing pieces, dedupe into a canonical wardrobe with drag-to-merge, stats, prices, tags.

**Architecture:** Vite+React SPA (`client/`) does clothing segmentation + CLIP embeddings in a Web Worker (transformers.js) and talks REST to an Express + better-sqlite3 server (`server/`) that stores originals/crops on disk under `./data/` and runs duplicate matching on embeddings.

**Tech Stack:** TypeScript everywhere. Server: express 4, better-sqlite3, multer, zod, vitest + supertest. Client: react 18, vite, @huggingface/transformers, idb-keyval, vitest.

## Global Constraints

- Node ≥ 20. TypeScript strict mode both packages.
- All user data under `./data/` (gitignored). Never commit photos.
- Similarity thresholds: auto-attach ≥ 0.92, suggestion band 0.80–0.92, stored in `settings` table, tunable.
- CLIP embedding: `Xenova/clip-vit-base-patch32`, 512-dim Float32, L2-normalized before storing.
- Segmentation model: `Xenova/segformer_b2_clothes` (labels include shirt, pants, dress, skirt, jacket, shoe, bag, hat…).
- Category whitelist (server-enforced): `top, bottom, dress, outerwear, footwear, bag, hat, accessory`.
- Every task ends in a green state; commit per step-group as marked; push after each task.
- Commit messages: conventional commits, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Granular commits are a project requirement (target ~80): commit each schema file, each route module, each view, each test file separately when they are independently green.

## File Structure

```
server/
  package.json, tsconfig.json, vitest.config.ts
  src/db.ts            # open DB, schema DDL, migrations
  src/lib/similarity.ts # cosine, embedding encode/decode, matchPiece
  src/lib/ids.ts        # nanoid wrapper
  src/repo/photos.ts    # SQL for photos
  src/repo/pieces.ts    # SQL for pieces
  src/repo/garments.ts  # SQL for garments (incl. representative embedding)
  src/repo/suggestions.ts
  src/repo/settings.ts
  src/services/ingest.ts   # POST /photos pipeline: save files, match, create
  src/services/merge.ts    # merge + undo transactions
  src/services/stats.ts
  src/services/portability.ts # export/import zip
  src/routes/photos.ts, garments.ts, pieces.ts, suggestions.ts, stats.ts, io.ts, settings.ts
  src/app.ts            # express app factory (no listen)
  src/server.ts         # listen + static client + /data images
  test/*.test.ts        # one per service/route group
client/
  package.json, tsconfig.json, vite.config.ts, index.html
  src/main.tsx, src/App.tsx, src/styles/tokens.css, global.css
  src/api/client.ts     # typed fetch wrappers
  src/ml/worker.ts      # segmentation + CLIP in worker
  src/ml/pipeline.ts    # pure helpers: mask→bbox, label→category (unit-tested)
  src/upload/queue.ts   # IndexedDB-persisted upload queue state machine (unit-tested)
  src/components/DropZone.tsx, ProgressTray.tsx, GarmentCard.tsx,
    MergeModal.tsx, GarmentDrawer.tsx, PieceChip.tsx, NavShell.tsx
  src/views/Wardrobe.tsx, Outfits.tsx, Review.tsx, Stats.tsx
  test/*.test.ts        # queue, pipeline helpers, api client
scripts/
  simulate-client.mjs   # Node-side ML ingest to E2E-test without a browser
  make-samples.mjs      # generate/fetch sample outfit images
docs/ (spec, plans, tweets.md, interview-prep.md), SCOPE.md, README.md
```

---

### Task 1: Plan + product docs

**Files:** Create `docs/superpowers/plans/2026-07-14-wardrobe-io.md` (this file), `SCOPE.md`.

- [ ] **Step 1:** Commit this plan (`docs: add implementation plan`).
- [ ] **Step 2:** Write `SCOPE.md` — v1 scope (from spec) + future product scope: multi-user accounts (email+OAuth), Postgres migration, S3-compatible photo storage, share links, mobile PWA, per-user model settings, billing sketch. Written so a fresh Claude session can productize from it. Commit (`docs: add product scope and future roadmap`).

### Task 2: Server scaffold

**Files:** Create `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/src/lib/ids.ts`.

**Interfaces produced:** `newId(): string` (nanoid, 12 chars).

- [ ] **Step 1:** `npm init -y`; install `express better-sqlite3 multer zod nanoid archiver` + dev `typescript tsx vitest supertest @types/express @types/better-sqlite3 @types/multer @types/supertest @types/node`. Strict tsconfig (`"strict": true, "module": "es2022", "moduleResolution": "bundler"`, `"type": "module"` in package.json). Scripts: `dev: tsx watch src/server.ts`, `test: vitest run`, `build: tsc`.
- [ ] **Step 2:** `src/lib/ids.ts`: `export const newId = () => nanoid(12)`.
- [ ] **Step 3:** Commit (`chore(server): scaffold TypeScript Express package`).

### Task 3: Database schema

**Files:** Create `server/src/db.ts`, `server/test/db.test.ts`.

**Interfaces produced:** `openDb(path: string | ':memory:'): Database` — creates tables idempotently (DDL from spec §Schema, all 6 tables, FKs ON, WAL). `export type Category = 'top'|'bottom'|'dress'|'outerwear'|'footwear'|'bag'|'hat'|'accessory'; export const CATEGORIES: Category[]`.

- [ ] **Step 1:** Failing test: `openDb(':memory:')` then `db.prepare("select name from sqlite_master where type='table'").all()` contains all 6 table names; inserting piece with bad FK throws.
- [ ] **Step 2:** Implement DDL exactly per spec §Backend/Schema (+ `pragma journal_mode=WAL; pragma foreign_keys=ON`). Defaults: `settings` seeded with `threshold_attach=0.92`, `threshold_suggest=0.80`.
- [ ] **Step 3:** Tests pass → commit (`feat(server): sqlite schema with FK-enforced tables`).

### Task 4: Similarity library

**Files:** Create `server/src/lib/similarity.ts`, `server/test/similarity.test.ts`.

**Interfaces produced:**
```ts
export function embToBlob(v: Float32Array): Buffer;
export function blobToEmb(b: Buffer): Float32Array;
export function cosine(a: Float32Array, b: Float32Array): number; // assumes L2-normed → dot product
export type Match = { kind: 'attach'|'suggest'|'none'; garmentId?: string; similarity?: number };
export function matchEmbedding(emb: Float32Array, candidates: {garmentId: string; emb: Float32Array}[], thresholds: {attach: number; suggest: number}): Match; // best candidate wins
```

- [ ] **Step 1:** Failing tests: round-trip blob; cosine of identical=1, orthogonal=0; matchEmbedding picks best candidate and maps to attach/suggest/none across thresholds (test 0.95, 0.85, 0.5).
- [ ] **Step 2:** Implement; pass; commit (`feat(server): embedding similarity matching`).

### Task 5: Repositories

**Files:** Create `server/src/repo/{photos,pieces,garments,suggestions,settings}.ts`, `server/test/repo.test.ts`.

**Interfaces produced (all take `db` first arg):** photos: `insertPhoto, listPhotos, getPhoto, deletePhoto`. pieces: `insertPiece, piecesForPhoto, piecesForGarment, updatePiece(id,{category?,garment_id?}), deletePiece`. garments: `insertGarment, getGarment, listGarments({category?,q?})` (excludes merged: `merged_into IS NULL`), `updateGarment(id, patch)`, `representativeEmbeddings(db): {garmentId, emb}[]` (mean of piece embeddings per live garment, L2-renormalized, category-tagged: `{garmentId, category, emb}`). suggestions: `insertSuggestion, listOpen, setStatus(id,'accepted'|'dismissed')`. settings: `getThresholds, setThreshold`.

- [ ] **Step 1:** Failing tests: insert photo→piece→garment chain; listGarments hides merged; representativeEmbeddings averages two known vectors; suggestion lifecycle; thresholds read/write.
- [ ] **Step 2:** Implement each repo file; commit **per repo file** as each test slice goes green (5 commits, e.g. `feat(server): photos repository`).

### Task 6: Ingest service

**Files:** Create `server/src/services/ingest.ts`, `server/test/ingest.test.ts`.

**Interfaces:**
- Consumes: repos, similarity, `newId`.
- Produces: `ingestPhoto(db, dataDir, input: {originalPath: string, originalName: string, pieces: {category: Category, bbox: [x,y,w,h], cropPath: string, embedding: Float32Array}[]}): IngestResult` where `IngestResult = {photoId, pieces: {pieceId, garmentId, decision: 'attached'|'new'|'new+suggested', suggestionId?}[]}`. Moves files into `data/photos/`, `data/pieces/`; per piece: match against same-category representative embeddings → attach / create garment (+suggestion in band). New garment `display_name` = `"{Category} #{n}"`, cover = first piece. All in one transaction (file moves before txn, cleanup on throw).

- [ ] **Step 1:** Failing tests using synthetic embeddings (e1 identical → attach; 0.85-ish → new+suggestion; orthogonal → new). Verify garment count, suggestion rows, piece→garment pointers.
- [ ] **Step 2:** Implement; pass; commit (`feat(server): photo ingest with auto-dedupe`).

### Task 7: Merge service

**Files:** Create `server/src/services/merge.ts`, `server/test/merge.test.ts`.

**Interfaces produced:**
```ts
export function mergeGarments(db, sourceId, targetId): {mergeEventId: string};
// throws MergeError on: same id, source/target missing, target merged, source merged
// txn: pieces.garment_id source→target; garments.merged_into=target on source; insert merge_event
export function undoMerge(db, mergeEventId): void;
// only pieces that came from source move back — snapshot moved piece ids in merge_events.piece_ids_json
export function acceptSuggestion(db, suggestionId): void; // = merge suggestion's garment-of-piece into suggested garment, mark accepted
```
(Add `piece_ids_json` column to `merge_events` DDL in Task 3 — do it now if missed.)

- [ ] **Step 1:** Failing tests: merge re-points pieces + hides source from listGarments; outfit's pieces now resolve to target; undo restores exactly; double-undo throws; merge-into-merged throws; accept suggestion end-to-end.
- [ ] **Step 2:** Implement; pass; commit (`feat(server): transactional merge with undo`).

### Task 8: Stats + portability services

**Files:** Create `server/src/services/stats.ts`, `server/src/services/portability.ts`, tests.

**Interfaces produced:** `getStats(db): {totalGarments, totalPhotos, totalValueCents, byCategory: {category, count}[], mostWorn: {garmentId, name, wearCount}[] (top 10, wearCount = piece count), costPerWear: {garmentId, name, cpwCents}[] (priced garments only)}`. `exportAll(db, dataDir, outStream)` → zip of data dir + `dump.json`; `importAll(db, dataDir, zipPath)` restores (v1: full replace, refuse if DB non-empty).

- [ ] **Step 1:** Failing tests for stats math (known fixture: 3 garments, prices, wear counts). Export→import round-trip in temp dirs.
- [ ] **Step 2:** Implement; two commits (`feat(server): wardrobe stats`, `feat(server): export/import backup`).

### Task 9: HTTP API

**Files:** Create `server/src/routes/*.ts`, `server/src/app.ts`, `server/test/api.test.ts`.

**Interfaces produced:** `createApp(db, dataDir): Express` wiring routes per spec §API. Upload: `multer` diskStorage to `dataDir/tmp`, limits 15MB/file, images only (`image/jpeg|png|webp`); multipart fields: `original` (file), `crops` (files), `meta` (JSON string validated by zod: pieces array with category enum, bbox 4 non-negative finite numbers within 10k, embedding as base64 Float32(512)). Errors: zod → 400 `{error}`, not-found → 404, MergeError → 409. JSON body limit 1MB. `GET /api/health` → `{ok:true}`.

- [ ] **Step 1:** Failing supertest specs: health; POST photo multipart happy path (tiny 1px png buffers, synthetic embeddings) → 201 IngestResult; bad category → 400; oversized bbox → 400; merge endpoint 200 then undo; suggestions accept; stats shape; PATCH garment price; DELETE photo cascades pieces (recompute garment cover or delete empty garment).
- [ ] **Step 2:** Implement route modules; commit **per route module** as its tests pass (6–7 commits, e.g. `feat(server): garment routes`).
- [ ] **Step 3:** `src/server.ts`: serve `/data` statics + built client (`client/dist`) with SPA fallback; listen 3001. Manual check: `curl localhost:3001/api/health`. Commit (`feat(server): http server with static hosting`).

### Task 10: Client scaffold + design system

**Files:** Create `client/` via `npm create vite@latest client -- --template react-ts`; add `src/styles/tokens.css`, `global.css`; proxy `/api` and `/data` → 3001 in `vite.config.ts`; install `idb-keyval @huggingface/transformers react-router-dom`; vitest config.

Use **frontend-design skill** here for aesthetic direction. Direction (locked): dark editorial "closet at night" — near-black `#0c0b0e` bg, warm ivory text, one accent (saffron `#e8a33d`), display serif (Fraunces via fontsource) for headings + Inter for UI, oversized type, image-forward cards with hover lift, subtle grain. No default-Tailwind look; hand-rolled CSS with custom properties in tokens.css.

- [ ] **Step 1:** Scaffold, strip boilerplate, tokens + global styles, empty NavShell with 4 routes. Runs via `npm run dev`. Commits: `chore(client): scaffold vite react app`, `feat(client): design tokens and global styles`, `feat(client): nav shell with routing`.

### Task 11: API client

**Files:** Create `client/src/api/client.ts`, `client/test/api-client.test.ts`.

**Interfaces produced:** typed functions mirroring every endpoint (`uploadPhoto(FormData)`, `listGarments(filters)`, `mergeGarments(sourceId, intoId)`, `undoMerge(id)`, `getSuggestions()`, `acceptSuggestion`, `dismissSuggestion`, `getStats()`, `patchGarment`, `patchPiece`, `deletePhoto`, `listPhotos`, `getPhoto`, `getSettings`, `putSetting`) + shared `ApiError`. Types file `client/src/api/types.ts` mirrors server DTOs.

- [ ] **Step 1:** Unit test with mocked `fetch`: success parse, non-2xx → ApiError with server message. Implement. Commits: `feat(client): typed api client` (+ `test(client): api client error handling` if split cleanly).

### Task 12: Upload queue

**Files:** Create `client/src/upload/queue.ts`, `client/test/queue.test.ts`.

**Interfaces produced:**
```ts
type QueueItem = {id, fileName, status: 'queued'|'processing'|'uploading'|'done'|'error', error?, previewUrl?};
export class UploadQueue {
  constructor(deps: {process: (file: File|Blob) => Promise<DetectedPieces>, upload: (file, pieces) => Promise<void>, persist: KV});
  add(files: File[]): void;          // enqueue + persist
  onChange(cb: (items: QueueItem[]) => void): () => void;
  async restore(): Promise<void>;    // reload pending file blobs from idb after refresh
  // drains sequentially; item error → status 'error', continues with next
}
```
Files themselves stored in idb-keyval (`Blob` values) until upload ack, then removed.

- [ ] **Step 1:** Failing tests with fake deps + in-memory KV: order preserved, error isolates item, restore resumes queued items, done items purge blob. Implement. Commit (`feat(client): refresh-proof upload queue`).

### Task 13: ML pipeline helpers + worker

**Files:** Create `client/src/ml/pipeline.ts` (pure, tested), `client/src/ml/worker.ts`, `client/src/ml/index.ts` (main-thread wrapper with promise API).

**Interfaces produced:**
```ts
// pipeline.ts (pure)
export const LABEL_TO_CATEGORY: Record<string, Category|null>; // segformer label → our category; skin/hair/background → null
export function maskToBbox(mask: {data: Uint8Array, width, height}): [x,y,w,h] | null; // null if area < 1.5% of image
export function l2norm(v: Float32Array): Float32Array;
// index.ts
export async function detectPieces(file: Blob): Promise<{category, bbox, crop: Blob, embedding: Float32Array}[]>; // worker round-trip; throws MLUnavailableError on model load failure
```
Worker: lazy-load `image-segmentation` pipeline (`Xenova/segformer_b2_clothes`) + CLIP vision (`Xenova/clip-vit-base-patch32`); per image: segment → group per clothing label → bbox → crop via OffscreenCanvas → webp blob → CLIP embed crop → l2norm.

- [ ] **Step 1:** Failing unit tests for `maskToBbox` (synthetic masks: single blob, too-small, empty) and `LABEL_TO_CATEGORY` completeness (every segformer clothing label maps). Implement pipeline.ts. Commit (`feat(client): ml mask/label helpers`).
- [ ] **Step 2:** Implement worker + wrapper (not unit-testable headlessly; E2E in Task 16). Commit (`feat(client): in-browser segmentation and embedding worker`).

### Task 14: Upload UX

**Files:** Create `client/src/components/DropZone.tsx`, `ProgressTray.tsx`; wire into `App.tsx` with queue + detectPieces + api.

- [ ] **Step 1:** Full-window drag overlay (dragenter on `window`, saffron border flash, drop → queue.add), hidden file input fallback in nav. ProgressTray bottom-right: per-item status, error badge with retry. ML failure path: upload photo with zero pieces (server accepts empty pieces array → photo lands in Review). Commits: `feat(client): full-window dropzone`, `feat(client): upload progress tray`.

### Task 15: Views

**Files:** Create `client/src/views/Wardrobe.tsx` (+ `GarmentCard.tsx`, `MergeModal.tsx`, `GarmentDrawer.tsx`), `Outfits.tsx` (+ `PieceChip.tsx`), `Review.tsx`, `Stats.tsx`.

Wardrobe: responsive card grid, category filter pills + search box (server-side `q`), HTML5 drag card→card highlights target, drop → MergeModal (side-by-side covers, copy exactly: "Merge these two? They're the same garment — outfits that referenced the first will now show the merged one.") → api.merge → optimistic refresh + toast with Undo button (calls undoMerge). Drawer: editable name/brand/color/price, category select, photos it appears in, merge history.
Outfits: photo masonry, piece chips under each photo, chip click → open garment drawer.
Review: suggestion cards (two crops side-by-side, similarity %, Accept/Dismiss); pieces-without-detection list (photos with 0 pieces) linking to outfit; piece re-label select + delete.
Stats: stat tiles (garments, photos, total value), CSS-only category bars, most-worn list, cost-per-wear table. Screenshot-worthy.

- [ ] **Step 1:** Build + commit per view as each renders against live API (6+ commits: wardrobe grid, merge flow, drawer, outfits, review, stats).

### Task 16: End-to-end verification (self-run)

**Files:** Create `scripts/make-samples.mjs`, `scripts/simulate-client.mjs`.

- [ ] **Step 1:** `make-samples.mjs`: download 6 CC0 outfit photos (Unsplash source URLs pinned) into `scratch-samples/` (gitignored) — or generate colored-clothing composites with sharp if offline.
- [ ] **Step 2:** `simulate-client.mjs`: Node-side detectPieces using `@huggingface/transformers` (same models, Node backend) + POST to running server — proves the whole ML→ingest→dedupe path without a browser. Run against `npm run dev` server: expect garments created, re-run same photo → attach (no new garments), near-dup → suggestion. Fix whatever breaks.
- [ ] **Step 3:** Run client `npm run dev`, verify in real browser flows manually where possible; `npm run build` both packages green; full `vitest` both packages green.
- [ ] **Step 4:** Commit scripts (`test: add e2e simulation scripts`) + any fixes as separate `fix:` commits.

### Task 17: Docs finale

**Files:** Create `README.md`, `docs/tweets.md`, `docs/interview-prep.md`, `CLAUDE.md`.

- [ ] **Step 1:** README — flashy: hero banner (shields.io badges, tagline "your closet, indexed"), demo GIF placeholders, feature grid with emoji, architecture diagram (mermaid), quickstart, model credits, roadmap link to SCOPE.md. Commit.
- [ ] **Step 2:** `docs/tweets.md` — launch thread (6–8 tweets) + 3 standalone tweets keyed to demo videos (upload flood, merge drag, stats). Commit.
- [ ] **Step 3:** `docs/interview-prep.md` — SDE2 interview Q&A in natural first-person language, A→Z: elevator pitch; architecture walkthrough & why SPA+API; data model & merge/undo design; duplicate detection (embeddings, cosine, thresholds) explained simply; every open-source package and why it was chosen; security section — threat model for a local app, input validation (zod, multer limits, MIME checks), SQL injection (prepared statements), path traversal (id-derived filenames only), XSS (React escaping, no dangerouslySetInnerHTML), CSRF stance (no cookies/auth in v1 — and what changes when auth arrives), DoS-ish concerns (file size limits, JSON limits), supply-chain (lockfile, npm audit); vulnerabilities consciously avoided with the story of how; performance questions (WAL, brute-force vs ANN, worker off-main-thread); trade-offs & what-I'd-do-differently; scaling story from SCOPE.md. Commit.
- [ ] **Step 4:** `CLAUDE.md` — dev commands, layout, conventions. Commit. Push everything; verify `git log --oneline | wc -l` and report final commit count.

## Self-Review (done)

- Spec coverage: every spec section maps to a task (schema→3, matching→4/6, merge→7, stats/export→8, API→9, views→14/15, error handling→6/9/12/14, testing→each task + 16, docs→1/17). Interview doc (user addition) → Task 17.
- Placeholder scan: none — every step names exact behavior, copy, or code.
- Type consistency: `IngestResult`, `Match`, `Category`, queue/API names cross-checked across tasks.

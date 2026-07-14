# wardrobe.io — Design Spec

**Date:** 2026-07-14
**Status:** Approved
**Repo:** https://github.com/arukurmi/wardrobe.io

## What it is

A personal wardrobe tracker. Upload a few hundred outfit photos; the app
automatically breaks each photo into individual clothing pieces (shirt, jeans,
jacket, …), deduplicates them into a canonical wardrobe of unique garments, and
lets the owner browse, tag, price, and analyze what they own and wear.

Single-user, runs locally. A separate `SCOPE.md` describes the future
multi-user product so a later session can pick productization up from there.

## Decisions made

| Decision | Choice |
|---|---|
| Clothing detection | In-browser ML (free, private): clothing segmentation + CLIP embeddings via transformers.js in a Web Worker |
| Storage | Local Node backend: Express + better-sqlite3, photos/crops as files under `./data/` |
| Features | Wardrobe grid + outfit view, wear stats, price/value tracking, search & tags |
| Duplicate handling | Auto-group with embeddings: ≥0.92 cosine similarity auto-attach, 0.80–0.92 review queue, plus manual drag-to-merge. Thresholds tunable. |
| Stack | Vite + React SPA (`client/`) + Express API (`server/`), one repo |

## Architecture

```
Browser (React SPA)                     Node (Express)
┌──────────────────────────┐           ┌─────────────────────────┐
│ Drop photo anywhere      │           │ POST /api/photos        │
│  └→ ML Web Worker        │──crops──▶ │  saves original + crops │
│     1. segment clothes   │  +labels  │  to ./data/photos,      │
│     2. crop each piece   │  +embeds  │  ./data/pieces          │
│     3. CLIP embedding    │           │ SQLite: photos, pieces, │
│                          │           │  garments, merge_events │
│ Wardrobe grid, outfits,  │◀──JSON────│ REST API                │
│ merge drag-drop, stats   │           │ (embedding match here)  │
└──────────────────────────┘           └─────────────────────────┘
```

### Core concepts

- **Photo** — an uploaded outfit image.
- **Piece** — one detected clothing crop inside a photo (bbox + crop image +
  category + embedding).
- **Garment** — the canonical wardrobe item; one or more pieces point to it.

Merging garment A into garment B re-points A's pieces to B, marks A
`merged_into = B`, and logs a `merge_event` so the merge is undoable. Outfits
referencing A's pieces automatically show B afterward — references never break.

### Duplicate matching

On piece ingest, the server computes cosine similarity between the new piece's
embedding and each garment's representative embedding (mean of its pieces'
embeddings, same category only):

- **≥ 0.92** → auto-attach to that garment
- **0.80 – 0.92** → new garment created, but a duplicate *suggestion* is
  recorded for the Review queue
- **< 0.80** → new garment, no suggestion

Brute-force scan is fine (embeddings ~2KB; 1,000 garments ≈ microseconds).
Thresholds live in a settings table and are tunable from the UI.

## Frontend (`client/`)

Vite + React + TypeScript. ML runs in a Web Worker (transformers.js):
clothes-segmentation model (~130MB, one-time download, cached) produces
per-piece masks/bboxes; CLIP image encoder produces embeddings. The main
thread never blocks.

### Views

1. **Wardrobe** — grid of garment cards grouped/filterable by category, color,
   brand, free-text search. Drag one card onto another → confirmation modal
   ("Merge these two? Outfits referencing the first will now show the
   merged garment.") → merge. Click card → detail drawer: cover image, name,
   brand, color tags, price, every photo it appears in, un-merge history.
2. **Outfits** — original photos in a masonry grid; each photo shows its
   detected pieces as chips; clicking a piece jumps to its garment.
3. **Review** — (a) duplicate suggestions with side-by-side crops and
   one-click confirm/dismiss; (b) failed/empty detections for manual boxing;
   (c) re-label or delete false-positive pieces.
4. **Stats** — most/least worn garments, category donut, total wardrobe value,
   cost-per-wear. Designed to screenshot well.

### Upload

The entire window is a dropzone (plus a click-to-pick fallback). Multi-hundred
file drops feed a persistent queue (IndexedDB) processed ~1 photo at a time
through the worker (2–5s each) with visible progress; the queue survives page
refresh and only clears entries after the server confirms persistence.

Visual design: distinctive, image-forward, dark; built with the
frontend-design skill during implementation — this is the project's Twitter
face.

## Backend (`server/`)

Express + better-sqlite3 + TypeScript. No external services, no auth (v1 is
single-user local).

### Schema

```sql
photos(id, filename, taken_at, uploaded_at)
pieces(id, photo_id, garment_id, category, bbox_json, crop_filename,
       embedding BLOB)
garments(id, display_name, category, brand, color, price_cents,
         cover_piece_id, merged_into NULL, created_at)
merge_events(id, source_garment_id, target_garment_id, created_at,
             undone_at NULL)
duplicate_suggestions(id, piece_id, garment_id, similarity, status)
settings(key, value)
```

Files: `./data/photos/<id>.<ext>` originals, `./data/pieces/<id>.webp` crops,
`./data/wardrobe.db`. All gitignored.

### API (REST, JSON)

- `POST /api/photos` — multipart: original + per-piece crops, labels, bboxes,
  embeddings. Runs duplicate matching, returns created pieces + garment
  assignments + suggestions.
- `GET /api/garments`, `GET /api/garments/:id`, `PATCH /api/garments/:id`
  (name/brand/color/price/category/cover)
- `POST /api/garments/:id/merge` — body `{into}`; transactional re-point +
  mark + log. `POST /api/merges/:id/undo`.
- `GET /api/photos`, `GET /api/photos/:id`, `DELETE /api/photos/:id`
- `PATCH /api/pieces/:id` (re-label / re-assign garment), `DELETE /api/pieces/:id`
- `GET /api/suggestions`, `POST /api/suggestions/:id/accept|dismiss`
- `GET /api/stats`
- `GET /api/export` (zip of data dir + JSON dump), `POST /api/import`
- Static: serves built client + `/data` images.

## Error handling

- **ML failure** (model download fails, WASM/WebGPU unsupported, zero pieces
  detected): photo still uploads with no pieces; lands in Review for manual
  boxing. Nothing is lost.
- **Upload interruption:** queue persists in IndexedDB until server ack.
- **Merge safety:** merge is a single SQLite transaction; undo restores
  pieces to the source garment and clears `merged_into`.
- **Server validation:** file type/size limits, bbox sanity checks, category
  whitelist.

## Testing

- **Vitest, server:** merge + undo (the data-corruption risk), duplicate
  matching thresholds, stats queries, import/export round-trip.
- **Vitest, client:** upload queue state machine, similarity grouping helpers,
  merge-modal reducer. Pure logic only; visual UI verified manually.
- Tests land in the same phase/commit as the module they cover.

## Delivery plan

Built and committed in many small phases (plan docs → server schema → each
endpoint → each view → each test file → README → tweet drafts), each phase a
green, self-contained commit pushed to `main`. Non-code deliverables in-repo:
`SCOPE.md` (future product: accounts, cloud storage, sharing), flashy README
(badges, screenshots, demo GIF placeholders), `docs/tweets.md` (launch thread
+ 2–3 standalone tweets around demo videos).

## Known limitations (v1)

- Segmentation misfires on busy backgrounds/partial outfits — absorbed by
  Review queue + merge flow. Quality is "very usable," not magic.
- Data is on one machine; backup = export zip.
- ~130MB one-time model download on first use.

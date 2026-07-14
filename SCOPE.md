# wardrobe.io — Scope

## v1 (this repo, single-user, local)

- Full-window drag-and-drop upload of hundreds of outfit photos.
- In-browser ML (transformers.js, Web Worker): clothing segmentation
  (`Xenova/segformer_b2_clothes`) + CLIP embeddings
  (`Xenova/clip-vit-base-patch32`). Photos never leave the machine.
- Auto-dedupe: cosine similarity vs existing garments — ≥0.92 auto-attach,
  0.80–0.92 review suggestion, else new garment. Thresholds tunable.
- Wardrobe grid (filter by category/color/brand/search), drag-card-onto-card
  merge with confirmation modal and undo.
- Outfits view (original photos + detected piece chips).
- Review queue: duplicate suggestions, zero-detection photos, re-label/delete.
- Stats: most/least worn, category breakdown, total value, cost-per-wear.
- Price/brand/color/name editing per garment.
- Export/import: zip backup of all data.
- Local stack: Express + better-sqlite3 + files under `./data/`.

Out of scope for v1: accounts, cloud anything, mobile app, social features,
automatic price/valuation, outfit recommendations.

## v2+ — productization (for a future session to pick up)

Goal: turn this into a hosted multi-user product.

1. **Accounts & auth** — email magic-link + Google OAuth. Session JWTs
   (httpOnly cookies) + CSRF protection. Every table gains `user_id`;
   all queries scoped by it.
2. **Storage migration** — SQLite → Postgres (schema ports 1:1; embeddings
   to `pgvector`, replacing brute-force cosine with ivfflat index).
   Photos/crops → S3-compatible object storage (R2/S3) with signed URLs.
3. **ML placement decision** — keep client-side inference as the free tier
   (privacy selling point); optional server-side GPU inference (same models
   via Python/onnxruntime) as paid tier for mobile/low-end devices.
4. **Sharing** — public read-only wardrobe/outfit links (per-link revocable
   tokens), OG images for Twitter cards.
5. **PWA** — installable, offline queue already exists; add service worker
   caching of models and app shell.
6. **Billing sketch** — free: 200 photos; pro: unlimited + server inference
   + multi-device sync. Stripe Checkout.
7. **Ops** — Fly.io/Railway single-region to start; nightly Postgres backup;
   Sentry; structured logs.

Migration path is deliberate in v1: repo layer isolates SQL, API is already
stateless JSON, export format doubles as the import format for the hosted DB.

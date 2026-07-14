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

## v1.5 — garment reconstruction & styling (next up)

Benchmark: [aesty.ai](https://www.aesty.ai/) — digital closet with auto
organization, AI stylist, virtual try-on avatar, color analysis, weekly
outfit planner, mix & match from your own closet, screenshot-to-outfit,
and shop-the-gaps.

Priority order for us:

1. **Garment reconstruction (flagship)** — stop showing raw segmentation
   crops as garment cards. For each detected piece, reconstruct a clean
   standalone catalog image (transparent RGBA PNG, front view, no body,
   no underlayers, no background) via an image-generation model prompted
   with the source crop as evidence. Workflow is codified in the
   `extract-clothing-cutouts` skill (`.claude/skills/`). Garment cards and
   dedupe review then show the cutout; the original photo stays linked.
2. **Detection quality** — reject low-information crops before they become
   pieces (near-solid-color patches, tiny fragments, duplicate stacked
   crops from the same region). These currently pollute the wardrobe grid.
3. **Outfit ideas / mix & match** — generate outfit combinations from the
   user's own closet (category + color rules first, embedding similarity
   later; no shopping).
4. **Weekly planner** — assign outfits to days, mark as worn (feeds the
   existing wear-count stats).
5. **Color analysis** — dominant-palette extraction per garment (already
   have crops), personal palette suggestions later.
6. **Screenshot-to-outfit** — match an inspiration screenshot against the
   closet by embedding similarity, list closest owned pieces per slot.

Deferred from aesty parity: virtual try-on avatar, shopping integration —
both need cloud services and conflict with the local-first v1 story.

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

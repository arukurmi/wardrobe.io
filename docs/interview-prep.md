# Interview Prep — wardrobe.io, explained A→Z

Everything an SDE2 interviewer might ask about this project, with answers in
the words I'd actually say. Read top to bottom once; skim headings before an
interview.

---

## 1. The elevator pitch (30 seconds)

"I built a personal wardrobe tracker. I drop in hundreds of outfit photos; a
segmentation model running **inside the browser** breaks each photo into
individual clothing pieces, CLIP embeddings identify when two pieces are the
same garment, and everything rolls up into a deduplicated, searchable wardrobe
with wear counts and cost-per-wear. The interesting engineering is in the
identity problem — deciding when two crops are the *same shirt* — and in
making merge/undo transactionally safe so user data can't be corrupted."

## 2. Architecture walkthrough

**Q: Walk me through the system.**

It's a classic SPA + API split with one twist: the ML runs client-side.

- **Client (React 19 + Vite):** the whole window is a dropzone. Files enter a
  persistent upload queue. A **Web Worker** loads two ONNX models via
  transformers.js — `segformer_b2_clothes` for clothing segmentation and CLIP
  ViT-B/32 for embeddings. Per photo: segment → group masks by category →
  bounding box → crop via OffscreenCanvas → embed each crop → POST everything
  as multipart.
- **Server (Express + better-sqlite3):** validates the payload, stores the
  original and crops on disk, and runs **duplicate matching**: the new piece's
  embedding vs. a representative (mean) embedding of every existing garment in
  the same category. Cosine ≥ 0.92 attaches it to that garment; 0.80–0.92
  creates a new garment *plus* a review suggestion; below that it's just new.
- **Data model:** `photo` (an outfit) → `pieces` (detected crops) → `garment`
  (the canonical item). Pieces are the join between "what I wore" and "what I
  own."

**Q: Why run ML in the browser instead of on the server?**

Three reasons. Privacy — photos never leave the machine, which is the
product's selling point. Cost — no GPU server, no inference bill, scales with
the user's own hardware. Architecture — the server stays a dumb, testable CRUD
API; all the flaky, heavy stuff is isolated in a worker. Trade-off: first-load
model download (~130 MB) and slower inference (2–5 s/photo). For a batch
"upload and walk away" flow, latency doesn't matter.

**Q: Why a Web Worker?**

Inference is CPU-heavy WASM. On the main thread it would freeze the UI for
seconds per photo. The worker gets structured-cloned ImageBitmaps (transferred,
not copied) and posts back crops + embeddings. If the worker crashes or the
model can't load, the wrapper throws a typed `MLUnavailableError`, and the
queue uploads the photo with **zero pieces** — it lands in a Review tab for
manual handling. Photos are never lost to ML failure.

## 3. The identity/dedupe design (the interesting part)

**Q: How do you know two pieces are the same garment?**

Embed each crop with CLIP into a 512-dim vector, L2-normalized, so cosine
similarity is just a dot product. Each garment's identity is the **mean of its
pieces' embeddings, renormalized** — more photos make identity more robust.
Matching is restricted to the same category (a shirt never matches jeans).

Two thresholds, both stored in a settings table and tunable in the UI:
- **≥ 0.92** — confident: auto-attach.
- **0.80–0.92** — uncertain: create the garment but file a suggestion; the user
  confirms with one click in Review.
- **< 0.80** — different garment.

I verified the bands empirically in an end-to-end run: re-uploading the same
photo attached at 0.998; near-duplicate synthetic outfits landed at ~0.91 —
inside the suggestion band, exactly where a human should decide.

**Q: Why brute-force cosine instead of a vector index?**

Scale honesty. A personal wardrobe is a few hundred garments; 512-dim dot
products over 1,000 candidates is microseconds. An ANN index (pgvector/FAISS)
adds operational complexity for zero user-visible gain. In the multi-user
version I'd move to Postgres + pgvector — the repo layer isolates that change.

**Q: What if the model is wrong anyway?**

That's a product feature, not just error handling: drag one garment card onto
another → confirmation modal → merge. Undo lives in a toast and in the garment
drawer.

## 4. Merge/undo — data-integrity design

**Q: How does merge work? What can go wrong?**

Merge(source → target) runs in a **single SQLite transaction**:
1. re-point all of source's pieces to target,
2. set `source.merged_into = target` (soft delete — the row stays),
3. insert a `merge_event` recording **the exact piece IDs moved**.

Guards: no self-merge, both must exist, neither may already be merged —
violations raise a typed `MergeError` mapped to HTTP 409.

Undo replays the event backwards, but only the recorded piece IDs move back.
That snapshot matters: if target gains *new* pieces after the merge, a naive
"move everything back" would steal them. Undo is single-shot (`undone_at`
guard). Accepting a review suggestion reuses the same merge path — one code
path to test, one to trust.

**Q: Why soft-delete garments?**

Undo needs the row; merge history needs the name; and no foreign key ever
dangles. List queries filter `merged_into IS NULL`.

## 5. Security section

**Q: What's the threat model?**

Honestly scoped: v1 is a single-user app bound to `127.0.0.1` — no auth, no
multi-tenancy, the attacker would already be on my machine. But I built the
input handling as if it were public, because the multi-user version shouldn't
require a security rewrite. What I actively defend:

**Input validation (the big one).**
Every mutating endpoint validates with **zod** before touching business logic:
category must be in an 8-value whitelist, bboxes are 4 finite non-negative
numbers ≤ 10k, embeddings must decode to exactly 512 float32s (2048 bytes),
patch bodies are `.strict()` so unknown fields are rejected rather than
silently dropped. Malformed input → 400 with a clean message, mapped in one
central error handler.

**File upload hardening.**
multer enforces: 15 MB per file, max 25 files, MIME whitelist
(jpeg/png/webp). Files land in a `tmp` dir first and are only moved into the
data dir after validation; on any failure every temp file is deleted. JSON
bodies are capped at 1 MB — an embedding-stuffed body can't balloon memory.

**SQL injection.**
Impossible by construction: better-sqlite3 **prepared statements with named
parameters everywhere**; user input is never concatenated into SQL. The one
dynamic piece — PATCH column lists — is built from a hardcoded column
whitelist, never from request keys.

**Path traversal.**
Stored filenames are **server-generated** (`nanoid + validated extension`);
the client's filename is never used as a path. So `../../etc/passwd` as an
upload name is inert. On import, zip entry paths are normalized, must live
under `photos/` or `pieces/`, and anything containing `..` is skipped —
that's the zip-slip defense. Static file serving uses Express's `static`
(which resolves and jails paths) rather than hand-built `sendFile` from user
input.

**XSS.**
React escapes all interpolated text by default and I never use
`dangerouslySetInnerHTML`. User-controlled strings (garment names, brands) are
rendered as text nodes, so `<img onerror=...>` as a garment name renders as
literal text. Images are served from `/data` as static files with
server-chosen names and extensions.

**CSRF.**
v1 has no cookies and no auth, so there's nothing for a cross-site request to
ride on. When auth arrives (v2): httpOnly SameSite cookies + a CSRF token on
mutations, or bearer tokens in headers which don't auto-attach cross-site.

**DoS-shaped concerns.**
File size/count caps, JSON body cap, and the ML cost lives on the client — the
server does cheap validation and microsecond similarity math. For multi-user
I'd add rate limiting (express-rate-limit) and per-user storage quotas.

**Supply chain.**
Lockfiles committed, `npm audit` clean at every install (I checked on each
one), and a deliberately small dependency surface — no ORM, no CSS framework,
no state library. Fewer packages = smaller attack surface.

**Q: Which CVE classes did you consciously design against?**

Zip-slip (CWE-22 via archive import), path traversal (CWE-22), SQL injection
(CWE-89), stored XSS (CWE-79), unrestricted file upload (CWE-434), and
mass-assignment (CWE-915, via `.strict()` schemas + column whitelists).

## 6. Open-source inventory (and why each)

**Server**
- **express 5** — boring, battle-tested HTTP routing; middleware model fits
  the central-error-handler pattern.
- **better-sqlite3** — synchronous SQLite driver. Counterintuitive but right:
  for a local single-writer app, sync calls in a transaction are faster and
  simpler than async pooling. WAL mode on, FKs on.
- **zod** — runtime validation that doubles as TypeScript types; one schema is
  both the contract and the compile-time type.
- **multer** — standard multipart handling with disk storage + limits.
- **nanoid** — collision-resistant short IDs, URL-safe.
- **archiver / unzipper** — streaming zip for export/import (I pinned archiver
  to v7 — v8 changed its API surface entirely).
- **vitest + supertest** — fast TS-native tests; supertest exercises real HTTP
  against the app factory with an in-memory DB per test.

**Client**
- **react 19 + vite 6** — SPA with instant HMR; no framework beyond that.
- **@huggingface/transformers (transformers.js)** — runs ONNX models
  (segformer, CLIP) via WASM/WebGPU in the browser; the whole reason the
  privacy story works.
- **idb-keyval** — tiny IndexedDB wrapper for the upload queue's blob
  persistence.
- **react-router-dom** — four routes.
- **@fontsource-variable/fraunces + inter** — self-hosted fonts, no Google
  Fonts tracking.
- Deliberately **no** Redux/TanStack Query/Tailwind: at this scale a custom
  `useData` hook + hand-rolled CSS tokens are simpler to reason about, and it
  shows I can build the primitives.

**Models** — `Xenova/segformer_b2_clothes` (18-label clothing segmentation),
`Xenova/clip-vit-base-patch32` (image embeddings). Both Apache/MIT-licensed
ONNX ports.

## 7. Reliability & edge cases I handled

- **Refresh mid-upload:** queue items and their blobs persist in IndexedDB;
  `restore()` resumes after reload; blobs are only deleted after the server
  acks. Errors isolate per item with retry — one corrupt image can't kill a
  300-photo batch.
- **Photo with no detectable clothes:** uploads with zero pieces, surfaces in
  Review. Nothing silently disappears.
- **Deleting a photo:** pieces cascade via FK; any garment whose *cover image*
  was one of those pieces gets its cover re-pointed in the same transaction —
  no dangling references.
- **Left shoe / right shoe:** the model labels them separately; I union the
  masks per category so they become one footwear piece.
- **Mask noise:** regions under 1.5% of image area are discarded.
- **Ingest atomicity:** files are copied first, then all DB writes in one
  transaction; if it throws, the copied files are deleted.

## 8. Testing story

61 tests total, biased toward the data-corruption risks:
- **Server (45):** schema/FKs, similarity math against hand-computed cosines,
  every repo, ingest decisions across both thresholds, merge/undo including
  the "don't steal new pieces" case, stats math on a known fixture,
  export→import round-trip, and 11 supertest specs covering the full HTTP
  surface including validation failures (bad category, wrong-size embedding,
  unknown patch fields, 409s).
- **Client (16):** upload queue state machine (order, error isolation, retry,
  restore, unsubscribe), mask/bbox helpers, label mapping completeness, API
  client error propagation.
- **E2E:** a Node script runs the *identical* model pipeline and posts to a
  live server — verified 9 photos → 14 garments, exact re-upload auto-attached
  at 0.998, near-dups suggested at 0.91.

What I'd add with more time: Playwright for the drag-and-drop flows, and a
golden-file test for segmentation output drift when models update.

## 9. Trade-offs & what I'd do differently

- **SQLite over Postgres:** right for local-first v1; the repo layer is the
  seam where Postgres slots in for multi-user.
- **Mean embedding as garment identity** can drift if a wrong piece gets
  attached (it pollutes the mean). Mitigation today: merges are undoable and
  pieces re-assignable. Better: store per-piece matches and use max-similarity
  or a medoid instead of the mean.
- **Category-gated matching** means a piece mislabeled `top` can never match
  its true `outerwear` garment. Cross-category fallback matching with a
  penalty would soften that.
- **Brute-force matching** is O(garments) per piece — fine here, pgvector at
  product scale.
- **Sequential queue processing** (1 photo at a time) keeps memory flat;
  parallel workers could 3–4× throughput on big machines.

## 10. Scaling story (if asked "how would you productize?")

Short version of [SCOPE.md](../SCOPE.md): add `user_id` to every table and
scope every query (the repo layer makes that mechanical); SQLite → Postgres
with embeddings in pgvector; images → S3-compatible storage with signed URLs;
auth via magic link + OAuth with httpOnly session cookies and CSRF protection;
client-side ML stays as the free/privacy tier, server-side GPU inference as
the paid tier for mobile. The export format doubles as the migration path —
that was deliberate.

## 11. Rapid-fire one-liners

- **Why TypeScript strict everywhere?** The embedding pipeline crosses four
  boundaries (worker → main → multipart → SQLite blob); types catch dimension
  and encoding mistakes at compile time.
- **Why WAL mode?** Readers don't block the writer — stats can render during
  a bulk ingest.
- **Why cents for prices?** Integers avoid float money bugs; `price_cents`
  makes the unit unmissable.
- **Why an app factory (`createApp(db, dataDir)`)?** Dependency injection —
  tests spin up a real app on `:memory:` DB and a temp dir, no mocks, no port.
- **Hardest bug?** Ecosystem drift, not logic: vitest 4/vite 8 (rolldown) and
  archiver 8 all broke on Node 20.12; I pinned to vitest 3 / vite 6 /
  archiver 7 and documented why in the commits.

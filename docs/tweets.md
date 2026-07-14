# Tweet drafts — wardrobe.io launch

Record the three demo videos first (suggested lengths in brackets), then post
the thread. Standalone tweets can go out on following days.

## 🧵 Launch thread (post with Video 1 on tweet 1)

**1/**
I photograph my outfits. Hundreds of photos. Zero idea what I actually own.

So I built wardrobe.io — drop the photos in, and it breaks every outfit into
the individual pieces and builds a deduplicated wardrobe. In the browser. For free.

[Video 1]

**2/**
The whole screen is the uploader. Drag 300 photos, walk away.

A segmentation model (segformer_b2_clothes) runs in a Web Worker + CLIP
embeddings for identity. Photos never leave my machine — no API keys, no
cloud, no bill.

**3/**
The hard part isn't detection — it's identity.

Same white tee in 12 photos should be ONE garment, worn 12 times.
Cosine similarity on CLIP embeddings: ≥0.92 auto-merges, 0.80–0.92 goes to a
review queue where I confirm with one click.

**4/**
And when the model still gets it wrong?

Drag one shirt card onto the other → "Merge these two?" → every outfit that
referenced the old one re-points automatically. Transactional, with undo.

[Video 2]

**5/**
Because every piece is tracked per-photo, stats fall out for free:

👕 most-worn pieces
🥧 category breakdown
💸 total wardrobe value + cost-per-wear

My ₹4,000 jeans at 23 wears: ₹174/wear. My "essential" jacket: worn twice. Ouch.

[Video 3]

**6/**
Stack:
- React 19 + Vite, hand-rolled CSS
- transformers.js in a module worker
- Express + better-sqlite3 (WAL), zod everywhere
- 61 tests, granular commits, all open source

github.com/arukurmi/wardrobe.io

## Standalone tweets

**A (with Video 2 — the merge):**
Favorite interaction I've built in a while: the model thought my two identical
black tees were different garments. Fix = drag one onto the other. Merge is a
SQLite transaction that re-points every outfit and logs exactly which pieces
moved, so undo is exact. wardrobe.io, open source 👇

**B (privacy angle):**
Every "AI wardrobe" app wants my photos on their servers.

wardrobe.io runs the entire ML pipeline — segmentation + CLIP — inside the
browser in a Web Worker. The server is just Express + SQLite on my own machine.
Your closet is nobody's training data.

**C (with a stats screenshot):**
Cost-per-wear is the most brutal number in fashion.

wardrobe.io computes it automatically: price ÷ times it appears in your outfit
photos. The results will change how you shop. Open source:
github.com/arukurmi/wardrobe.io

## Video shot list

- **Video 1 (30–40s):** empty wardrobe → drag a folder of photos → progress
  tray counts up → cut to grid filling with garment cards.
- **Video 2 (15–20s):** two duplicate tees → drag one onto the other → merge
  modal → confirm → toast with Undo → click a garment, show it in outfits.
- **Video 3 (15s):** Stats page scroll: tiles → category bars → cost-per-wear.

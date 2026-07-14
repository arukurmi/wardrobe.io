---
name: extract-clothing-cutouts
description: Extract high-quality, deduplicated transparent ecommerce clothing cutouts from a folder of photographs where people wear one or more garments. Use when asked to turn outfit/model photos into standalone catalog garment images — identify unique clothing across images, create focused reference crops, reconstruct complete garments with an image-generation model, remove a solid chroma background into RGBA PNGs, and output only the finished clothing images into a new folder.
---

# Extract Clothing Cutouts

Turn photographs of worn clothing into source-faithful standalone catalog
PNGs. Each result is a **reconstruction from visible evidence**, not literal
segmentation, whenever the wearer or another layer occludes part of the
garment.

## Prerequisite: an image-generation model

Claude Code has no built-in image generator. Before starting, find one, in
this order:

1. An MCP image-generation/editing tool available in this session.
2. `OPENAI_API_KEY` set → use `gpt-image-1` via the images **edits** endpoint
   (send the reference crop(s) as input images plus the prompt).
3. `GEMINI_API_KEY` set → use `gemini-2.5-flash-image` with the crop(s)
   inline and the prompt.

If none is available, stop and ask the user which provider to use.

## Start by asking for two paths

Unless already supplied:

1. "Where can I find the input images?" (a path relative to the cwd, or ".")
2. "What should the new output folder be called?" (created inside the cwd)

If the output path already exists, ask for a different name. Never merge
with or overwrite an existing folder.

## Output contract

- Only finished transparent RGBA clothing PNGs go in the output folder.
- Descriptive lowercase hyphenated names: `navy-fair-isle-cardigan.png`.
- Source copies, crops, prompts, chroma images, manifests, QA files live in
  temporary storage only; delete them after final verification succeeds.
- Preserve every input image unchanged.
- Report the absolute output path, PNG count, and any fragments skipped
  because they were too obscured.

Create temporary work outside the output folder (use the session scratchpad
directory if one is provided, else `mktemp -d`):

```bash
WORK="$(mktemp -d "${TMPDIR:-/tmp}/clothing-cutouts.XXXXXX")"
mkdir -p "$WORK"/{source-jpg,crops,chroma,items,qa}
```

## Non-negotiable quality rules

- Generate exactly one item per output, except an established matching pair
  (shoes, socks).
- Exclude the wearer, body, skin, hair, mannequin, hanger, props, other
  layers, and scene.
- Prefer omission over invention: never guess unreadable text, hidden
  construction, branding, pockets, fasteners, hardware, or trim.
- Hold fragments whose item type or defining construction cannot be
  recovered without substantial fabrication.
- Merge duplicates only when **source photographs** support physical
  identity. Generated-image similarity is not proof.
- Inspect source crops and final contact sheets **visually** (Read the
  image files). Numeric alpha checks cannot establish source fidelity.

## Workflow

### 1. Discover and normalize source photos

Find images with Glob/`rg --files` (JPEG, PNG, WebP, HEIC/HEIF, TIFF, BMP,
AVIF), excluding the output and temp paths. Create upright working copies in
`$WORK/source-jpg`:

- Apply EXIF orientation; keep original dimensions (never upscale).
- Convert working copies to RGB JPEG quality ≥95.
- Resolve duplicate basenames with a short hash of the relative source path.
- Record path, normalized name, dimensions, hash in `$WORK/sources.json`.
- Use Pillow; fall back to `sips` (macOS) or `ffmpeg` for HEIC/AVIF.

Build contact sheets of ≤12 images each, then **Read every sheet**. Do not
infer the wardrobe from filenames.

For large folders, split a read-only inventory among subagents with disjoint
batches; keep the main agent responsible for global item identity, duplicate
decisions, and final QA.

### 2. Inventory every deliberately worn item

Include tops, bottoms, outerwear, dresses, footwear, hosiery, swimwear,
belts, ties, headwear. Write `$WORK/manifest.json`:

```json
{
  "items": [
    {
      "slug": "navy-fair-isle-cardigan",
      "label": "Navy Fair Isle Cardigan",
      "category": "outerwear",
      "status": "generate",
      "confidence": "high",
      "description": "Deep navy long zip cardigan with a white Fair Isle yoke.",
      "observed": {
        "color": "deep navy and white",
        "material": "medium-weight knit",
        "silhouette": "long relaxed straight body",
        "construction": "center zipper, long sleeves, ribbed cuffs and hem",
        "marks": "white geometric yoke"
      },
      "unknowns": [],
      "graphic_policy": "exact",
      "chroma_key": "#00ff00",
      "source_refs": [
        { "source": "IMG_1284.jpg", "bbox": [0.12, 0.08, 0.83, 0.86], "role": "primary", "notes": "Best overall silhouette." }
      ],
      "possible_duplicates": [],
      "duplicate_evidence": "No matching construction found elsewhere."
    }
  ]
}
```

Manifest rules:

- Unique lowercase hyphenated slugs; bboxes as normalized
  `[left, top, right, bottom]` floats on the upright source.
- First reference is the strongest view; at most one complementary ref
  unless an exceptional item needs more.
- `graphic_policy`: `exact` only for legible wording, `mark-only` for a
  visible but unreadable emblem, `omit` for uncertain branding.
- Uncertain attributes go in `unknowns`; never convert guesses into facts.
- `status: hold` when the item type or defining construction is unknowable.
- Consolidate source-proven repeats before generation; keep visually
  similar items separate when identity is uncertain.

### 3. Prepare focused generation references

For every `generate` record:

- Convert the bbox to pixels; pad ~12% per side, clamped to bounds.
- Reject crops whose shorter dimension is under ~64 px unless the item is
  legitimately narrow (belt, tie).
- Preserve aspect ratio on a neutral square canvas of ~1200–1400 px.
- Save `$WORK/crops/SLUG.jpg` (+ `SLUG-ref2.jpg` if complementary).

Build labeled crop contact sheets and inspect them. Keep enough context to
distinguish the target from underlayers while making the target dominant.

### 4. Build one evidence-bound prompt per item

Template (replace brackets with source evidence; delete irrelevant clauses):

```
Use case: background-extraction
Asset type: transparent ecommerce clothing catalog cutout, generated first on a removable chroma key

Input image(s): The reference photograph(s) show the exact same [ITEM] worn by a person. Use them only to identify and reconstruct that item. Image 1 contributes [SILHOUETTE/CONSTRUCTION]. Image 2 contributes [DETAIL], if present. Do not mix in details from visually similar clothing.

Primary request: Reconstruct ONLY the complete empty [ITEM NAME] as a clean [FRONT/ANGLE] ecommerce catalog product photograph. Remove the wearer, body, skin, hair, [VISIBLE UNDERLAYER], [OTHER CLOTHING], and the scene. Show the complete unoccluded item, naturally and symmetrically arranged, with no person, mannequin, or hanger visible.

Item fidelity: Preserve the source-supported [COLOR], [MATERIAL/TEXTURE], [SILHOUETTE], [NECKLINE/WAIST/OPENING], [SLEEVES/LEGS/SHAFTS], [FASTENING], [HEM/SOLE], [PATTERN], and [CLEAR MARKS]. [STATE UNKNOWNS AND WHAT TO OMIT.] Do not invent any other logo, lettering, label, pocket, seam, fastener, hardware, color, or decoration.

Composition: [SQUARE/PORTRAIT/LANDSCAPE] canvas, centered [VIEW], complete item fully inside frame with generous even padding around every outer edge; no cropping or truncation.

Background: perfectly flat, absolutely uniform solid [CHROMA KEY] edge-to-edge, exactly one color with no shadow, gradient, texture, vignette, floor, horizon, reflection, or lighting variation.

Lighting: neutral diffuse high-end ecommerce product lighting contained on the item only; no cast shadow, contact shadow, reflection, prop, watermark, caption, or border.

Critical: use no [CHROMA KEY] anywhere in the item; preserve a crisp separable outer silhouette; output only one [ITEM OR MATCHED PAIR].
```

Use direct evidence language ("Preserve the four small white buttons visible
in a vertical row", "The pink fabric is a separate underlayer and must not
appear", "The source mark is unreadable; omit text rather than inventing
it"). Avoid vague requests like "make it stylish" — they encourage invention.

Chroma key: default `#00ff00`; use `#ff00ff` for green garments unless
magenta/pink is prominent; otherwise a maximally distant pure saturated RGB.
Require the same solid color at every border pixel.

Framing by category: tops/outerwear front view with neck opening, complete
sleeves and hem; pants portrait with waistband and full legs; skirts/dresses
full length; footwear matched pair, slightly elevated front three-quarter;
belts/ties long axis aligned, both ends complete; swimwear every strap
endpoint complete.

### 5. Generate and reconcile

Call the image model with the primary crop (+ genuine complementary crop
only). Save results to `$WORK/chroma/SLUG.png`; keep prompts in temp records.

For >8 items, partition disjoint slug batches among subagents, one active
generation per slug; each worker returns slug, prompt, reference paths,
chroma path, and a brief visual review. Reconcile against the manifest and
resume only missing/failed slugs.

**Read and compare every chroma result with its source crop before
accepting.** Plausibility alone is insufficient.

### 6. Remove the chroma background

Write a Pillow helper under `$WORK` implementing:

- Sample the median RGB from a thin band around all four borders.
- Per pixel, compute max per-channel distance from the key.
- Distance ≤12 → fully transparent; ≥220 → fully opaque; smoothstep alpha
  ramp between, multiplied by original alpha.
- For partially transparent pixels, cap key-dominant channels to the
  strongest non-key channel (despill).
- Set fully transparent pixels to `(0, 0, 0, 0)`; save RGBA PNG to
  `$WORK/items/SLUG.png`.

Use border sampling only when the generated background is visibly uniform.
If removal damages garment colors, regenerate with a more distant key
instead of forcing a destructive matte.

### 7. Technical and visual QA

Verify every PNG with Pillow:

- PNG format, RGBA mode; alpha has both transparent and visible pixels;
- all four corners transparent; border substantially transparent;
- nontransparent content neither empty nor nearly the whole canvas;
- alpha bbox leaves visible padding; no extremity clipped;
- no chroma-colored pixels along partially transparent edges;
- exactly one output per `generate` slug, no unexplained outputs.

Build checkerboard contact sheets (≤12 cutouts) in `$WORK/qa`, Read every
sheet, then inspect sensitive items individually against source crops.

Visual rubric: target identity and category; proportions, silhouette,
color, material; neckline/rise/waist/openings/hem/sole; fasteners, pockets,
trim, pattern placement, legible marks; complete topology (every sleeve,
cuff, strap, hem, toe, heel); no body parts, underlayers, adjacent
clothing, props, shadow, or background; no unsupported construction or
fake text.

Failure handling:

- **Critical** (wrong item, body remains, fused garments, major clipping,
  opaque background, destructive matte): regenerate.
- **Major** (invented hood/collar/pocket/fastening, wrong silhouette or
  color, fake logo, missing defining pattern, incomplete endpoints):
  correct or regenerate.
- **Minor** (faint halo, slight centering drift): correct when visible at
  catalog size.

Correction prompt: attach the current output plus the strongest source crop
and ask to keep the successful silhouette/color/composition, remove the
unsupported failure, restore the source-supported detail, and return the
item on the same uniform chroma background with no shadow. If an item fails
twice, rewrite the prompt around the observed failure.

### 8. Deduplicate conservatively

Use perceptual hashes or silhouette/color similarity only to **rank pairs
for review**; never auto-delete from generated-image similarity. Confirm
identity from source photos via matching distinctive construction, pattern
placement, distressing, hardware, or logos. Do not merge generic black
skirts, plain tops, jeans, or shoes merely because generation standardized
their poses. Retain both when evidence is inconclusive.

### 9. Deliver only the finished PNGs

- Confirm the output folder still doesn't exist, then create it.
- Copy only accepted canonical PNGs from `$WORK/items`.
- Reopen every copied file; confirm RGBA + transparency; no non-PNG files.
- Delete `$WORK` after verification succeeds.
- Report the absolute output path and count; show up to 12 images in chat;
  mention unrecoverable fragments briefly.

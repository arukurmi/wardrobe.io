/// <reference lib="webworker" />
import { pipeline, env, RawImage } from '@huggingface/transformers';
import { groupLabels, unionMasks, maskToBbox, l2norm, type Mask } from './pipeline';
import type { Category } from '../api/types';

env.allowLocalModels = false;

const SEG_MODEL = 'Xenova/segformer_b2_clothes';
const CLIP_MODEL = 'Xenova/clip-vit-base-patch32';

let segmenterP: ReturnType<typeof pipeline> | null = null;
let embedderP: ReturnType<typeof pipeline> | null = null;

function getSegmenter() {
  segmenterP ??= pipeline('image-segmentation', SEG_MODEL);
  return segmenterP;
}

function getEmbedder() {
  embedderP ??= pipeline('image-feature-extraction', CLIP_MODEL);
  return embedderP;
}

export type WorkerRequest = { id: number; bitmap: ImageBitmap };
export type WorkerPiece = {
  category: Category;
  bbox: [number, number, number, number];
  crop: Blob;
  embedding: Float32Array;
};
export type WorkerResponse =
  | { id: number; ok: true; pieces: WorkerPiece[] }
  | { id: number; ok: false; error: string };

async function cropToBlob(
  bitmap: ImageBitmap,
  bbox: [number, number, number, number],
  scaleX: number,
  scaleY: number
): Promise<{ blob: Blob; canvas: OffscreenCanvas }> {
  const [mx, my, mw, mh] = bbox;
  // mask coords -> original image coords, with a 4% context margin
  const pad = 0.04;
  const x = Math.max(0, Math.floor(mx * scaleX - pad * bitmap.width));
  const y = Math.max(0, Math.floor(my * scaleY - pad * bitmap.height));
  const w = Math.min(bitmap.width - x, Math.ceil(mw * scaleX + 2 * pad * bitmap.width));
  const h = Math.min(bitmap.height - y, Math.ceil(mh * scaleY + 2 * pad * bitmap.height));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
  return { blob, canvas };
}

async function detect(bitmap: ImageBitmap): Promise<WorkerPiece[]> {
  const segmenter = (await getSegmenter()) as any;
  const embedder = (await getEmbedder()) as any;

  // segmenter accepts RawImage; downscale big photos for speed
  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const sw = Math.round(bitmap.width * scale);
  const sh = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, sw, sh);
  const image = await RawImage.fromCanvas(canvas);

  const segments: { label: string; mask: Mask }[] = await segmenter(image);
  const grouped = groupLabels(
    segments.map((s: any) => ({
      label: s.label,
      mask: { data: s.mask.data, width: s.mask.width, height: s.mask.height },
    }))
  );

  const pieces: WorkerPiece[] = [];
  for (const [category, masks] of grouped) {
    const union = unionMasks(masks);
    const bbox = maskToBbox(union);
    if (!bbox) continue;
    const scaleX = bitmap.width / union.width;
    const scaleY = bitmap.height / union.height;
    const { blob, canvas: cropCanvas } = await cropToBlob(bitmap, bbox, scaleX, scaleY);
    const cropImage = await RawImage.fromCanvas(cropCanvas);
    const output = await embedder(cropImage);
    const embedding = l2norm(Float32Array.from(output.data as Iterable<number>));
    pieces.push({
      category,
      bbox: [
        Math.round(bbox[0] * scaleX),
        Math.round(bbox[1] * scaleY),
        Math.round(bbox[2] * scaleX),
        Math.round(bbox[3] * scaleY),
      ],
      crop: blob,
      embedding,
    });
  }
  return pieces;
}

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const { id, bitmap } = event.data;
  try {
    const pieces = await detect(bitmap);
    const response: WorkerResponse = { id, ok: true, pieces };
    self.postMessage(response);
  } catch (err) {
    const response: WorkerResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  } finally {
    bitmap.close();
  }
});

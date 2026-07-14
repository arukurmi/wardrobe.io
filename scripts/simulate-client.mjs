// E2E: run the exact client ML pipeline in Node (same models via
// transformers.js) and POST results to the running server — proves
// segmentation -> crops -> embeddings -> ingest -> dedupe end to end
// without a browser.
//
// Usage: node simulate-client.mjs [imagePath ...]   (defaults: scratch-samples/*)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { pipeline, RawImage } from '@huggingface/transformers';

const API = process.env.API ?? 'http://localhost:3001';

// Mirrors client/src/ml/pipeline.ts (Node script can't import TS directly).
const LABEL_TO_CATEGORY = {
  Hat: 'hat',
  Sunglasses: 'accessory',
  'Upper-clothes': 'top',
  Skirt: 'bottom',
  Pants: 'bottom',
  Dress: 'dress',
  Belt: 'accessory',
  'Left-shoe': 'footwear',
  'Right-shoe': 'footwear',
  Bag: 'bag',
  Scarf: 'accessory',
};

function maskToBbox({ data, width, height }) {
  let minX = width, minY = height, maxX = -1, maxY = -1, area = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[y * width + x]) {
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0 || area < 0.015 * width * height) return null;
  return [minX, minY, maxX - minX + 1, maxY - minY + 1];
}

function l2norm(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Float32Array.from(v, (x) => x / n);
}

console.log('loading models (first run downloads them)…');
const segment = await pipeline('image-segmentation', 'Xenova/segformer_b2_clothes');
const embed = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32');
console.log('models ready');

async function detect(imagePath) {
  const segments = await segment(imagePath);
  const grouped = new Map();
  for (const s of segments) {
    const category = LABEL_TO_CATEGORY[s.label];
    if (!category) continue;
    const mask = { data: s.mask.data, width: s.mask.width, height: s.mask.height };
    (grouped.get(category) ?? grouped.set(category, []).get(category)).push(mask);
  }

  const meta = await sharp(imagePath).metadata();
  const pieces = [];
  for (const [category, masks] of grouped) {
    const { width, height } = masks[0];
    const data = new Uint8Array(width * height);
    for (const m of masks) for (let i = 0; i < data.length; i++) if (m.data[i]) data[i] = 1;
    const bbox = maskToBbox({ data, width, height });
    if (!bbox) continue;
    const sx = meta.width / width;
    const sy = meta.height / height;
    const px = [
      Math.round(bbox[0] * sx),
      Math.round(bbox[1] * sy),
      Math.round(bbox[2] * sx),
      Math.round(bbox[3] * sy),
    ];
    const crop = await sharp(imagePath)
      .extract({
        left: Math.min(px[0], meta.width - 1),
        top: Math.min(px[1], meta.height - 1),
        width: Math.min(px[2], meta.width - px[0]),
        height: Math.min(px[3], meta.height - px[1]),
      })
      .webp({ quality: 90 })
      .toBuffer();
    const cropImage = await RawImage.fromBlob(new Blob([crop]));
    const output = await embed(cropImage);
    const embedding = l2norm(Float32Array.from(output.data));
    pieces.push({ category, bbox: px, crop, embedding });
  }
  return pieces;
}

async function uploadOne(imagePath) {
  const pieces = await detect(imagePath);
  const form = new FormData();
  form.append('original', new Blob([fs.readFileSync(imagePath)], { type: 'image/jpeg' }), path.basename(imagePath));
  for (const p of pieces) form.append('crops', new Blob([p.crop], { type: 'image/webp' }), 'crop.webp');
  form.append(
    'meta',
    JSON.stringify({
      pieces: pieces.map((p) => ({
        category: p.category,
        bbox: p.bbox,
        embedding: Buffer.from(p.embedding.buffer).toString('base64'),
      })),
    })
  );
  const res = await fetch(`${API}/api/photos`, { method: 'POST', body: form });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status}: ${body.error}`);
  console.log(
    `${path.basename(imagePath)} -> ${body.pieces.length} pieces:`,
    body.pieces.map((p) => `${p.decision}${p.similarity ? ` (${p.similarity.toFixed(3)})` : ''}`).join(', ')
  );
  return body;
}

const defaultDir = path.join(import.meta.dirname, '..', 'scratch-samples');
const images = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(defaultDir).filter((f) => f.endsWith('.jpg')).map((f) => path.join(defaultDir, f));

for (const img of images) await uploadOne(img);

const stats = await (await fetch(`${API}/api/stats`)).json();
const suggestions = await (await fetch(`${API}/api/suggestions`)).json();
console.log('\nfinal stats:', JSON.stringify(stats, null, 1));
console.log(`open duplicate suggestions: ${suggestions.length}`);

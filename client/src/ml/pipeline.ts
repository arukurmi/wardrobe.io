import type { Category } from '../api/types';

/** segformer_b2_clothes labels -> wardrobe categories.
 * null = not a garment (skin, hair, background, ...). */
export const LABEL_TO_CATEGORY: Record<string, Category | null> = {
  Background: null,
  Hat: 'hat',
  Hair: null,
  Sunglasses: 'accessory',
  'Upper-clothes': 'top',
  Skirt: 'bottom',
  Pants: 'bottom',
  Dress: 'dress',
  Belt: 'accessory',
  'Left-shoe': 'footwear',
  'Right-shoe': 'footwear',
  Face: null,
  'Left-leg': null,
  'Right-leg': null,
  'Left-arm': null,
  'Right-arm': null,
  Bag: 'bag',
  Scarf: 'accessory',
};

export type Mask = { data: Uint8Array | number[]; width: number; height: number };

/** Bounding box of the set pixels; null when the region is under 1.5% of the
 * image (too small to be a real garment — usually segmentation noise). */
export function maskToBbox(mask: Mask): [number, number, number, number] | null {
  const { data, width, height } = mask;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let area = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x]) {
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  if (area < 0.015 * width * height) return null;
  return [minX, minY, maxX - minX + 1, maxY - minY + 1];
}

export function l2norm(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/** Merge left/right shoe style splits: group masks by category. */
export function groupLabels(
  labels: { label: string; mask: Mask }[]
): Map<Category, Mask[]> {
  const grouped = new Map<Category, Mask[]>();
  for (const { label, mask } of labels) {
    const category = LABEL_TO_CATEGORY[label];
    if (!category) continue;
    const list = grouped.get(category) ?? [];
    list.push(mask);
    grouped.set(category, list);
  }
  return grouped;
}

/** Union several same-size masks into one. */
export function unionMasks(masks: Mask[]): Mask {
  const { width, height } = masks[0];
  const data = new Uint8Array(width * height);
  for (const m of masks) {
    for (let i = 0; i < data.length; i++) if (m.data[i]) data[i] = 1;
  }
  return { data, width, height };
}

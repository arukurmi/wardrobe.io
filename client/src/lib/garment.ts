import type { Garment } from '../api/types';

/** Secondary line shown under a garment's name: "brand · color", falling
 * back to just the brand/color if only one is set, and finally to the
 * category when neither is known. Never returns an empty string. */
export function garmentSubtitle(g: Pick<Garment, 'brand' | 'color' | 'category'>): string {
  const parts = [g.brand, g.color].filter((v): v is string => Boolean(v));
  return parts.join(' · ') || g.category;
}

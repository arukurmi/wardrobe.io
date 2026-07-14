import { describe, it, expect } from 'vitest';
import {
  LABEL_TO_CATEGORY,
  maskToBbox,
  l2norm,
  groupLabels,
  unionMasks,
  type Mask,
} from '../src/ml/pipeline';

function mask(width: number, height: number, on: [number, number][]): Mask {
  const data = new Uint8Array(width * height);
  for (const [x, y] of on) data[y * width + x] = 1;
  return { data, width, height };
}

describe('LABEL_TO_CATEGORY', () => {
  it('covers every segformer_b2_clothes label', () => {
    expect(Object.keys(LABEL_TO_CATEGORY).length).toBe(18);
    expect(LABEL_TO_CATEGORY['Upper-clothes']).toBe('top');
    expect(LABEL_TO_CATEGORY['Face']).toBeNull();
    expect(LABEL_TO_CATEGORY['Left-shoe']).toBe('footwear');
  });
});

describe('maskToBbox', () => {
  it('finds the bounding box of a blob', () => {
    // 10x10, block from (2,3) to (5,7) = 4x5 = 20 px = 20% > 1.5%
    const on: [number, number][] = [];
    for (let x = 2; x <= 5; x++) for (let y = 3; y <= 7; y++) on.push([x, y]);
    expect(maskToBbox(mask(10, 10, on))).toEqual([2, 3, 4, 5]);
  });

  it('rejects regions under 1.5% of the image', () => {
    expect(maskToBbox(mask(100, 100, [[5, 5]]))).toBeNull();
  });

  it('handles an empty mask', () => {
    expect(maskToBbox(mask(4, 4, []))).toBeNull();
  });
});

describe('l2norm', () => {
  it('normalizes to unit length', () => {
    const v = l2norm(Float32Array.from([3, 4]));
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
  });
  it('tolerates the zero vector', () => {
    expect(Array.from(l2norm(Float32Array.from([0, 0])))).toEqual([0, 0]);
  });
});

describe('groupLabels + unionMasks', () => {
  it('groups left/right shoes into one footwear region', () => {
    const left = mask(4, 1, [[0, 0]]);
    const right = mask(4, 1, [[3, 0]]);
    const grouped = groupLabels([
      { label: 'Left-shoe', mask: left },
      { label: 'Right-shoe', mask: right },
      { label: 'Face', mask: mask(4, 1, [[1, 0]]) },
    ]);
    expect([...grouped.keys()]).toEqual(['footwear']);
    const union = unionMasks(grouped.get('footwear')!);
    expect(Array.from(union.data)).toEqual([1, 0, 0, 1]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  embToBlob,
  blobToEmb,
  cosine,
  matchEmbedding,
} from '../src/lib/similarity.js';

const T = { attach: 0.92, suggest: 0.8 };

function vec(...vals: number[]): Float32Array {
  return Float32Array.from(vals);
}

describe('embedding blobs', () => {
  it('round-trips through Buffer', () => {
    const v = vec(0.1, -0.5, 0.86);
    const back = blobToEmb(embToBlob(v));
    expect(Array.from(back)).toEqual(Array.from(v));
  });
});

describe('cosine', () => {
  it('is 1 for identical unit vectors', () => {
    const v = vec(1, 0, 0);
    expect(cosine(v, v)).toBeCloseTo(1);
  });
  it('is 0 for orthogonal vectors', () => {
    expect(cosine(vec(1, 0), vec(0, 1))).toBeCloseTo(0);
  });
});

describe('matchEmbedding', () => {
  const a = vec(1, 0, 0);
  // cos(a, b) ≈ 0.95
  const b = vec(0.95, Math.sqrt(1 - 0.95 ** 2), 0);
  // cos(a, c) ≈ 0.85
  const c = vec(0.85, Math.sqrt(1 - 0.85 ** 2), 0);
  const d = vec(0, 0, 1);

  it('attaches above attach threshold', () => {
    const m = matchEmbedding(a, [{ garmentId: 'g1', emb: b }], T);
    expect(m.kind).toBe('attach');
    expect(m.garmentId).toBe('g1');
    expect(m.similarity!).toBeGreaterThan(0.92);
  });

  it('suggests in the band', () => {
    const m = matchEmbedding(a, [{ garmentId: 'g2', emb: c }], T);
    expect(m).toMatchObject({ kind: 'suggest', garmentId: 'g2' });
  });

  it('returns none below suggest threshold', () => {
    expect(matchEmbedding(a, [{ garmentId: 'g3', emb: d }], T).kind).toBe('none');
  });

  it('picks the best candidate', () => {
    const m = matchEmbedding(
      a,
      [
        { garmentId: 'worse', emb: c },
        { garmentId: 'best', emb: b },
      ],
      T
    );
    expect(m.garmentId).toBe('best');
  });

  it('handles no candidates', () => {
    expect(matchEmbedding(a, [], T).kind).toBe('none');
  });
});

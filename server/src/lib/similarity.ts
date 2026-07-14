export function embToBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function blobToEmb(b: Buffer): Float32Array {
  const copy = Buffer.from(b); // ensure aligned, independent memory
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

/** Cosine similarity. Embeddings are stored L2-normalized, but we divide by
 * norms anyway so un-normalized test vectors behave correctly. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export type Match = {
  kind: 'attach' | 'suggest' | 'none';
  garmentId?: string;
  similarity?: number;
};

export function matchEmbedding(
  emb: Float32Array,
  candidates: { garmentId: string; emb: Float32Array }[],
  thresholds: { attach: number; suggest: number }
): Match {
  let best: { garmentId: string; similarity: number } | null = null;
  for (const c of candidates) {
    const s = cosine(emb, c.emb);
    if (!best || s > best.similarity) best = { garmentId: c.garmentId, similarity: s };
  }
  if (!best || best.similarity < thresholds.suggest) return { kind: 'none' };
  return {
    kind: best.similarity >= thresholds.attach ? 'attach' : 'suggest',
    garmentId: best.garmentId,
    similarity: best.similarity,
  };
}

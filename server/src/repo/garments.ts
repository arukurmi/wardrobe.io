import type { Db, Category } from '../db.js';
import { blobToEmb, embToBlob } from '../lib/similarity.js';

export type GarmentRow = {
  id: string;
  display_name: string;
  category: Category;
  brand: string | null;
  color: string | null;
  price_cents: number | null;
  cover_piece_id: string | null;
  merged_into: string | null;
  created_at: string;
};

export function insertGarment(
  db: Db,
  row: {
    id: string;
    display_name: string;
    category: Category;
    cover_piece_id?: string | null;
  }
): void {
  db.prepare(
    `insert into garments (id, display_name, category, cover_piece_id)
     values (@id, @display_name, @category, @cover_piece_id)`
  ).run({ cover_piece_id: null, ...row });
}

export function getGarment(db: Db, id: string): GarmentRow | undefined {
  return db.prepare('select * from garments where id = ?').get(id) as
    | GarmentRow
    | undefined;
}

/** Live garments only (merged ones are hidden). */
export function listGarments(
  db: Db,
  filters: { category?: string; q?: string } = {}
): GarmentRow[] {
  const clauses = ['merged_into is null'];
  const params: Record<string, string> = {};
  if (filters.category) {
    clauses.push('category = @category');
    params.category = filters.category;
  }
  if (filters.q) {
    clauses.push(
      "(display_name like @q or coalesce(brand,'') like @q or coalesce(color,'') like @q)"
    );
    params.q = `%${filters.q}%`;
  }
  return db
    .prepare(
      `select * from garments where ${clauses.join(' and ')} order by created_at desc, id desc`
    )
    .all(params) as GarmentRow[];
}

const PATCHABLE = [
  'display_name',
  'brand',
  'color',
  'price_cents',
  'category',
  'cover_piece_id',
] as const;

export type GarmentPatch = Partial<
  Pick<GarmentRow, (typeof PATCHABLE)[number]>
>;

export function updateGarment(db: Db, id: string, patch: GarmentPatch): boolean {
  const keys = PATCHABLE.filter((k) => k in patch);
  if (keys.length === 0) return false;
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  return (
    db
      .prepare(`update garments set ${sets} where id = @id`)
      .run({ id, ...patch }).changes > 0
  );
}

/** Mean embedding per live garment, L2-renormalized, for duplicate matching. */
export function representativeEmbeddings(
  db: Db
): { garmentId: string; category: Category; emb: Float32Array }[] {
  const rows = db
    .prepare(
      `select p.garment_id as gid, g.category as category, p.embedding as embedding
       from pieces p join garments g on g.id = p.garment_id
       where g.merged_into is null`
    )
    .all() as { gid: string; category: Category; embedding: Buffer }[];

  const acc = new Map<string, { category: Category; sum: Float64Array; n: number }>();
  for (const r of rows) {
    const emb = blobToEmb(r.embedding);
    let entry = acc.get(r.gid);
    if (!entry) {
      entry = { category: r.category, sum: new Float64Array(emb.length), n: 0 };
      acc.set(r.gid, entry);
    }
    for (let i = 0; i < emb.length; i++) entry.sum[i] += emb[i];
    entry.n++;
  }

  const out: { garmentId: string; category: Category; emb: Float32Array }[] = [];
  for (const [gid, { category, sum, n }] of acc) {
    const mean = new Float32Array(sum.length);
    let norm = 0;
    for (let i = 0; i < sum.length; i++) {
      mean[i] = sum[i] / n;
      norm += mean[i] * mean[i];
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < mean.length; i++) mean[i] /= norm;
    out.push({ garmentId: gid, category, emb: mean });
  }
  return out;
}

export { embToBlob };

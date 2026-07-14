import type { Db, Category } from '../db.js';

export type PieceRow = {
  id: string;
  photo_id: string;
  garment_id: string;
  category: Category;
  bbox_json: string;
  crop_filename: string;
  embedding: Buffer;
};

export function insertPiece(
  db: Db,
  row: {
    id: string;
    photo_id: string;
    garment_id: string;
    category: Category;
    bbox_json: string;
    crop_filename: string;
    embedding: Buffer;
  }
): void {
  db.prepare(
    `insert into pieces (id, photo_id, garment_id, category, bbox_json, crop_filename, embedding)
     values (@id, @photo_id, @garment_id, @category, @bbox_json, @crop_filename, @embedding)`
  ).run(row);
}

export function piecesForPhoto(db: Db, photoId: string): PieceRow[] {
  return db
    .prepare('select * from pieces where photo_id = ? order by id')
    .all(photoId) as PieceRow[];
}

export function piecesForGarment(db: Db, garmentId: string): PieceRow[] {
  return db
    .prepare('select * from pieces where garment_id = ? order by id')
    .all(garmentId) as PieceRow[];
}

export function getPiece(db: Db, id: string): PieceRow | undefined {
  return db.prepare('select * from pieces where id = ?').get(id) as
    | PieceRow
    | undefined;
}

export function updatePiece(
  db: Db,
  id: string,
  patch: { category?: Category; garment_id?: string }
): boolean {
  const keys = (['category', 'garment_id'] as const).filter((k) => k in patch);
  if (keys.length === 0) return false;
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  return (
    db.prepare(`update pieces set ${sets} where id = @id`).run({ id, ...patch })
      .changes > 0
  );
}

export function deletePiece(db: Db, id: string): boolean {
  return db.prepare('delete from pieces where id = ?').run(id).changes > 0;
}

import type { Db } from '../db.js';

export type PhotoRow = {
  id: string;
  filename: string;
  taken_at: string | null;
  uploaded_at: string;
};

export function insertPhoto(
  db: Db,
  row: { id: string; filename: string; taken_at?: string | null }
): void {
  db.prepare(
    'insert into photos (id, filename, taken_at) values (@id, @filename, @taken_at)'
  ).run({ taken_at: null, ...row });
}

export function listPhotos(db: Db): PhotoRow[] {
  return db
    .prepare('select * from photos order by uploaded_at desc, id desc')
    .all() as PhotoRow[];
}

export function getPhoto(db: Db, id: string): PhotoRow | undefined {
  return db.prepare('select * from photos where id = ?').get(id) as
    | PhotoRow
    | undefined;
}

export function deletePhoto(db: Db, id: string): boolean {
  return db.prepare('delete from photos where id = ?').run(id).changes > 0;
}

import type { Db } from '../db.js';

export type SuggestionRow = {
  id: string;
  piece_id: string;
  garment_id: string;
  similarity: number;
  status: 'open' | 'accepted' | 'dismissed';
  created_at: string;
};

export function insertSuggestion(
  db: Db,
  row: { id: string; piece_id: string; garment_id: string; similarity: number }
): void {
  db.prepare(
    `insert into duplicate_suggestions (id, piece_id, garment_id, similarity)
     values (@id, @piece_id, @garment_id, @similarity)`
  ).run(row);
}

export function listOpen(db: Db): SuggestionRow[] {
  return db
    .prepare(
      "select * from duplicate_suggestions where status = 'open' order by similarity desc"
    )
    .all() as SuggestionRow[];
}

export function getSuggestion(db: Db, id: string): SuggestionRow | undefined {
  return db
    .prepare('select * from duplicate_suggestions where id = ?')
    .get(id) as SuggestionRow | undefined;
}

export function setStatus(
  db: Db,
  id: string,
  status: 'accepted' | 'dismissed'
): boolean {
  return (
    db
      .prepare(
        "update duplicate_suggestions set status = ? where id = ? and status = 'open'"
      )
      .run(status, id).changes > 0
  );
}

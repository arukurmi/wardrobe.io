import Database from 'better-sqlite3';

export type Category =
  | 'top'
  | 'bottom'
  | 'dress'
  | 'outerwear'
  | 'footwear'
  | 'bag'
  | 'hat'
  | 'accessory';

export const CATEGORIES: Category[] = [
  'top',
  'bottom',
  'dress',
  'outerwear',
  'footwear',
  'bag',
  'hat',
  'accessory',
];

export type Db = Database.Database;

const DDL = `
create table if not exists photos (
  id text primary key,
  filename text not null,
  taken_at text,
  uploaded_at text not null default (datetime('now'))
);

create table if not exists garments (
  id text primary key,
  display_name text not null,
  category text not null,
  brand text,
  color text,
  price_cents integer,
  cover_piece_id text,
  merged_into text references garments(id),
  created_at text not null default (datetime('now'))
);

create table if not exists pieces (
  id text primary key,
  photo_id text not null references photos(id) on delete cascade,
  garment_id text not null references garments(id),
  category text not null,
  bbox_json text not null,
  crop_filename text not null,
  embedding blob not null
);

create table if not exists merge_events (
  id text primary key,
  source_garment_id text not null references garments(id),
  target_garment_id text not null references garments(id),
  piece_ids_json text not null,
  created_at text not null default (datetime('now')),
  undone_at text
);

create table if not exists duplicate_suggestions (
  id text primary key,
  piece_id text not null references pieces(id) on delete cascade,
  garment_id text not null references garments(id),
  similarity real not null,
  status text not null default 'open',
  created_at text not null default (datetime('now'))
);

create table if not exists settings (
  key text primary key,
  value text not null
);

create index if not exists idx_pieces_photo on pieces(photo_id);
create index if not exists idx_pieces_garment on pieces(garment_id);
create index if not exists idx_suggestions_status on duplicate_suggestions(status);
`;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(DDL);
  db.prepare(
    `insert or ignore into settings (key, value) values ('threshold_attach', '0.92'), ('threshold_suggest', '0.80')`
  ).run();
  return db;
}

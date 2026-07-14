import type { Db } from '../db.js';

export function getThresholds(db: Db): { attach: number; suggest: number } {
  const rows = db.prepare('select key, value from settings').all() as {
    key: string;
    value: string;
  }[];
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    attach: Number(map.threshold_attach ?? 0.92),
    suggest: Number(map.threshold_suggest ?? 0.8),
  };
}

export function setThreshold(
  db: Db,
  key: 'threshold_attach' | 'threshold_suggest',
  value: number
): void {
  db.prepare(
    'insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value'
  ).run(key, String(value));
}

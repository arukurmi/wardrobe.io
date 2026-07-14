import type { Db } from '../db.js';

export type Stats = {
  totalGarments: number;
  totalPhotos: number;
  totalValueCents: number;
  byCategory: { category: string; count: number }[];
  mostWorn: { garmentId: string; name: string; wearCount: number }[];
  costPerWear: { garmentId: string; name: string; cpwCents: number }[];
};

export function getStats(db: Db): Stats {
  const one = (sql: string) => (db.prepare(sql).get() as any).n as number;
  const totalGarments = one(
    'select count(*) as n from garments where merged_into is null'
  );
  const totalPhotos = one('select count(*) as n from photos');
  const totalValueCents = one(
    'select coalesce(sum(price_cents), 0) as n from garments where merged_into is null'
  );
  const byCategory = db
    .prepare(
      `select category, count(*) as count from garments
       where merged_into is null group by category order by count desc`
    )
    .all() as Stats['byCategory'];
  const mostWorn = db
    .prepare(
      `select g.id as garmentId, g.display_name as name, count(p.id) as wearCount
       from garments g join pieces p on p.garment_id = g.id
       where g.merged_into is null
       group by g.id order by wearCount desc, g.id limit 10`
    )
    .all() as Stats['mostWorn'];
  const costPerWear = db
    .prepare(
      `select g.id as garmentId, g.display_name as name,
              cast(round(g.price_cents * 1.0 / count(p.id)) as integer) as cpwCents
       from garments g join pieces p on p.garment_id = g.id
       where g.merged_into is null and g.price_cents is not null
       group by g.id order by cpwCents desc, g.id`
    )
    .all() as Stats['costPerWear'];
  return { totalGarments, totalPhotos, totalValueCents, byCategory, mostWorn, costPerWear };
}

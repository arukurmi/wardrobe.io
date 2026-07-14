import fs from 'node:fs';
import path from 'node:path';
import type { Writable } from 'node:stream';
import archiver from 'archiver';
import unzipper from 'unzipper';
import type { Db } from '../db.js';

const TABLES = [
  'photos',
  'garments',
  'pieces',
  'merge_events',
  'duplicate_suggestions',
  'settings',
] as const;

/** Zip of every image file + a JSON dump of all tables (embeddings base64). */
export function exportAll(db: Db, dataDir: string, out: Writable): Promise<void> {
  const dump: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    dump[t] = (db.prepare(`select * from ${t}`).all() as any[]).map((row) => {
      const copy = { ...row };
      if (Buffer.isBuffer(copy.embedding)) {
        copy.embedding = copy.embedding.toString('base64');
        copy.__embedding_b64 = true;
      }
      return copy;
    });
  }
  return new Promise((resolve, reject) => {
    const archive = archiver('zip');
    archive.on('error', reject);
    out.on('close', resolve);
    out.on('finish', resolve);
    archive.pipe(out);
    archive.append(JSON.stringify(dump, null, 1), { name: 'dump.json' });
    for (const sub of ['photos', 'pieces']) {
      const dir = path.join(dataDir, sub);
      if (fs.existsSync(dir)) archive.directory(dir, sub);
    }
    void archive.finalize();
  });
}

/** Full restore into an empty database. Refuses if any photos exist. */
export async function importAll(db: Db, dataDir: string, zipPath: string): Promise<void> {
  const existing = (db.prepare('select count(*) as n from photos').get() as any).n;
  if (existing > 0) throw new Error('import requires an empty database');

  const zip = await unzipper.Open.file(zipPath);
  const dumpEntry = zip.files.find((f) => f.path === 'dump.json');
  if (!dumpEntry) throw new Error('dump.json missing from archive');
  const dump = JSON.parse((await dumpEntry.buffer()).toString('utf8'));

  for (const f of zip.files) {
    if (f.type !== 'File') continue;
    // only restore into the two known image dirs; ignore anything else
    const rel = path.normalize(f.path);
    if (!(rel.startsWith('photos/') || rel.startsWith('pieces/'))) continue;
    if (rel.includes('..')) continue;
    const dest = path.join(dataDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, await f.buffer());
  }

  db.transaction(() => {
    db.prepare('delete from settings').run();
    for (const t of TABLES) {
      const rows = (dump[t] ?? []) as any[];
      for (const row of rows) {
        const copy = { ...row };
        if (copy.__embedding_b64) {
          copy.embedding = Buffer.from(copy.embedding, 'base64');
          delete copy.__embedding_b64;
        }
        const keys = Object.keys(copy);
        db.prepare(
          `insert into ${t} (${keys.join(',')}) values (${keys.map((k) => `@${k}`).join(',')})`
        ).run(copy);
      }
    }
  })();
}

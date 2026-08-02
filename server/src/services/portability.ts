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

/** Zip-bomb defense: hard caps on how much an untrusted archive may expand to. */
export const MAX_ENTRIES = 100_000;
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB

export interface ImportLimits {
  maxEntries?: number;
  maxTotalBytes?: number;
}

/**
 * Per-table set of legal column names, read from the live DB schema.
 * The import builds SQL identifiers from untrusted dump.json keys, so every
 * key must be checked against this allowlist before it reaches a statement.
 */
function columnAllowlist(db: Db): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  for (const t of TABLES) {
    const cols = (db.prepare(`pragma table_info(${t})`).all() as any[]).map(
      (c) => c.name as string
    );
    map[t] = new Set(cols);
  }
  return map;
}

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
export async function importAll(
  db: Db,
  dataDir: string,
  zipPath: string,
  limits: ImportLimits = {}
): Promise<void> {
  const maxEntries = limits.maxEntries ?? MAX_ENTRIES;
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_TOTAL_BYTES;
  const existing = (db.prepare('select count(*) as n from photos').get() as any).n;
  if (existing > 0) throw new Error('import requires an empty database');

  const zip = await unzipper.Open.file(zipPath);
  const dumpEntry = zip.files.find((f) => f.path === 'dump.json');
  if (!dumpEntry) throw new Error('dump.json missing from archive');
  const dump = JSON.parse((await dumpEntry.buffer()).toString('utf8'));
  if (dump === null || typeof dump !== 'object' || Array.isArray(dump)) {
    throw new Error('dump.json must be a JSON object mapping table names to rows');
  }

  const base = path.resolve(dataDir);
  let entryCount = 0;
  let totalBytes = 0;
  for (const f of zip.files) {
    if (f.type !== 'File') continue;
    // Zip-bomb defense: refuse archives with an implausible number of entries.
    if (++entryCount > maxEntries) {
      throw new Error(`archive has too many entries (> ${maxEntries}); refusing to extract`);
    }
    // Reject absolute paths outright; they can never live under dataDir.
    if (path.isAbsolute(f.path)) continue;
    // only restore into the two known image dirs; ignore anything else
    const rel = path.normalize(f.path);
    if (!(rel.startsWith('photos/') || rel.startsWith('pieces/'))) continue;
    // Robust containment: resolve the destination and require it to sit
    // inside dataDir, defeating traversal like `photos/../../escape`.
    const dest = path.resolve(dataDir, rel);
    if (!(dest === base || dest.startsWith(base + path.sep))) continue;
    const buf = await f.buffer();
    // Zip-bomb defense: cap total uncompressed bytes written to disk.
    totalBytes += buf.length;
    if (totalBytes > maxTotalBytes) {
      throw new Error(
        `archive expands to more than ${maxTotalBytes} bytes; refusing to extract`
      );
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  }

  const allow = columnAllowlist(db);

  db.transaction(() => {
    db.prepare('delete from settings').run();
    for (const t of TABLES) {
      const raw = dump[t];
      if (raw === undefined || raw === null) continue;
      if (!Array.isArray(raw)) {
        throw new Error(`dump.json: expected an array of rows for table "${t}"`);
      }
      const rows = raw as any[];
      const allowed = allow[t];
      for (const row of rows) {
        if (row === null || typeof row !== 'object' || Array.isArray(row)) {
          throw new Error(`dump.json: each row in table "${t}" must be an object`);
        }
        const copy = { ...row };
        if (copy.__embedding_b64) {
          copy.embedding = Buffer.from(copy.embedding, 'base64');
          delete copy.__embedding_b64;
        }
        const keys = Object.keys(copy);
        // The keys become SQL identifiers below; reject anything not a real
        // column of this table so a crafted dump cannot inject identifiers.
        for (const k of keys) {
          if (!allowed.has(k)) {
            throw new Error(`dump.json: unexpected column "${k}" for table "${t}"`);
          }
        }
        if (keys.length === 0) continue;
        db.prepare(
          `insert into ${t} (${keys.join(',')}) values (${keys.map((k) => `@${k}`).join(',')})`
        ).run(copy);
      }
    }
  })();
}

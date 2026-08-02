import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import archiver from 'archiver';
import { openDb } from '../src/db.js';
import { importAll } from '../src/services/portability.js';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wardrobe-zipsafe-'));
});

/** Build a zip with a dump.json plus arbitrary raw file entries. */
async function makeZip(
  zipPath: string,
  dump: unknown,
  files: [string, string][] = []
): Promise<void> {
  const out = fs.createWriteStream(zipPath);
  const ar = archiver('zip');
  ar.pipe(out);
  ar.append(JSON.stringify(dump), { name: 'dump.json' });
  for (const [name, content] of files) ar.append(content, { name });
  await new Promise<void>((resolve, reject) => {
    out.on('close', () => resolve());
    ar.on('error', reject);
    void ar.finalize();
  });
}

describe('import zip-safety', () => {
  it('does not write a traversing entry outside dataDir', async () => {
    const dataDir = path.join(tmp, 'data');
    const zipPath = path.join(tmp, 't.zip');
    // `photos/../../escape.txt` slips past a naive prefix check but must be
    // caught by resolve-based containment.
    await makeZip(zipPath, {}, [
      ['photos/../../escape.txt', 'PWNED'],
      ['photos/ok.jpg', 'good'],
    ]);

    await importAll(openDb(':memory:'), dataDir, zipPath);

    expect(fs.existsSync(path.join(path.dirname(dataDir), 'escape.txt'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'photos', 'ok.jpg'))).toBe(true);
  });

  it('rejects an archive with too many entries', async () => {
    const zipPath = path.join(tmp, 'entries.zip');
    await makeZip(zipPath, {}, [
      ['photos/a.jpg', 'a'],
      ['photos/b.jpg', 'b'],
    ]);
    await expect(
      importAll(openDb(':memory:'), path.join(tmp, 'd1'), zipPath, { maxEntries: 1 })
    ).rejects.toThrow(/too many entries/);
  });

  it('rejects an archive that expands past the byte cap', async () => {
    const zipPath = path.join(tmp, 'bytes.zip');
    await makeZip(zipPath, {}, [['photos/big.jpg', 'X'.repeat(100)]]);
    await expect(
      importAll(openDb(':memory:'), path.join(tmp, 'd2'), zipPath, { maxTotalBytes: 10 })
    ).rejects.toThrow(/bytes/);
  });

  it('rejects a dump row with an unexpected column key', async () => {
    const zipPath = path.join(tmp, 'hostile.zip');
    await makeZip(zipPath, {
      photos: [{ id: 'x', filename: 'f', "evil) values ('a'); --": 1 }],
    });
    await expect(
      importAll(openDb(':memory:'), path.join(tmp, 'd3'), zipPath)
    ).rejects.toThrow(/unexpected column/);
  });

  it('rejects a dump that is not an object', async () => {
    const zipPath = path.join(tmp, 'arr.zip');
    await makeZip(zipPath, []);
    await expect(
      importAll(openDb(':memory:'), path.join(tmp, 'd4'), zipPath)
    ).rejects.toThrow(/must be a JSON object/);
  });

  it('rejects a table value that is not an array', async () => {
    const zipPath = path.join(tmp, 'nonarr.zip');
    await makeZip(zipPath, { photos: 'nope' });
    await expect(
      importAll(openDb(':memory:'), path.join(tmp, 'd5'), zipPath)
    ).rejects.toThrow(/expected an array/);
  });

  it('rejects a non-object row', async () => {
    const zipPath = path.join(tmp, 'row.zip');
    await makeZip(zipPath, { photos: [42] });
    await expect(
      importAll(openDb(':memory:'), path.join(tmp, 'd6'), zipPath)
    ).rejects.toThrow(/must be an object/);
  });
});

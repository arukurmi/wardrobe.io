import { describe, it, expect, vi } from 'vitest';
import { UploadQueue, type KV } from '../src/upload/queue';

function memKV(): KV & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async (k) => store.get(k),
    set: async (k, v) => void store.set(k, v),
    del: async (k) => void store.delete(k),
    keys: async () => [...store.keys()],
  };
}

const blob = (s: string) => new Blob([s]);

function deferredProcess() {
  const calls: string[] = [];
  return {
    calls,
    process: vi.fn(async (b: Blob) => {
      calls.push(await b.text());
      return { pieces: [] };
    }),
  };
}

async function settle() {
  // let the sequential drain loop finish
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe('UploadQueue', () => {
  it('processes files in order and purges persisted blobs when done', async () => {
    const kv = memKV();
    const { calls, process } = deferredProcess();
    const upload = vi.fn(async () => {});
    const q = new UploadQueue({ process, upload, persist: kv });
    q.add([
      { name: 'a.jpg', blob: blob('a') },
      { name: 'b.jpg', blob: blob('b') },
    ]);
    await settle();
    expect(calls).toEqual(['a', 'b']);
    expect(q.snapshot().every((i) => i.status === 'done')).toBe(true);
    expect(kv.store.size).toBe(0);
  });

  it('isolates a failing item and continues', async () => {
    const kv = memKV();
    const process = vi.fn(async (b: Blob) => {
      if ((await b.text()) === 'bad') throw new Error('model exploded');
      return {};
    });
    const upload = vi.fn(async () => {});
    const q = new UploadQueue({ process, upload, persist: kv });
    q.add([
      { name: 'bad.jpg', blob: blob('bad') },
      { name: 'good.jpg', blob: blob('good') },
    ]);
    await settle();
    const [bad, good] = q.snapshot();
    expect(bad).toMatchObject({ status: 'error', error: 'model exploded' });
    expect(good.status).toBe('done');
    // failed blob stays persisted for retry
    expect(kv.store.size).toBe(1);
  });

  it('retries an errored item', async () => {
    const kv = memKV();
    let attempts = 0;
    const process = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new Error('flaky');
      return {};
    });
    const q = new UploadQueue({ process, upload: async () => {}, persist: kv });
    q.add([{ name: 'a.jpg', blob: blob('a') }]);
    await settle();
    expect(q.snapshot()[0].status).toBe('error');
    q.retry(q.snapshot()[0].id);
    await settle();
    expect(q.snapshot()[0].status).toBe('done');
  });

  it('restores interrupted items after a refresh', async () => {
    const kv = memKV();
    // simulate a previous session that persisted but never finished
    await kv.set('upload-blob:q1', { fileName: 'left.jpg', blob: blob('left') });
    const { calls, process } = deferredProcess();
    const q = new UploadQueue({ process, upload: async () => {}, persist: kv });
    await q.restore();
    await settle();
    expect(calls).toEqual(['left']);
    expect(q.snapshot()[0]).toMatchObject({ fileName: 'left.jpg', status: 'done' });
    expect(kv.store.size).toBe(0);
  });

  it('notifies subscribers and supports unsubscribe', async () => {
    const kv = memKV();
    const q = new UploadQueue({
      process: async () => ({}),
      upload: async () => {},
      persist: kv,
    });
    const seen: string[][] = [];
    const off = q.onChange((items) => seen.push(items.map((i) => i.status)));
    q.add([{ name: 'a.jpg', blob: blob('a') }]);
    await settle();
    expect(seen.at(-1)).toEqual(['done']);
    off();
    const count = seen.length;
    q.add([{ name: 'b.jpg', blob: blob('b') }]);
    await settle();
    expect(seen.length).toBe(count);
  });
});

export type QueueStatus = 'queued' | 'processing' | 'uploading' | 'done' | 'error';

export type QueueItem = {
  id: string;
  fileName: string;
  status: QueueStatus;
  error?: string;
};

export type DetectedPieces = unknown;

/** Minimal key-value surface so tests can use an in-memory map and the app
 * can pass idb-keyval. Blobs live here until the server acks the upload. */
export type KV = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
  del: (key: string) => Promise<void>;
  keys: () => Promise<string[]>;
};

type Deps = {
  process: (file: Blob) => Promise<DetectedPieces>;
  upload: (file: Blob, pieces: DetectedPieces) => Promise<void>;
  persist: KV;
};

const KEY_PREFIX = 'upload-blob:';

export class UploadQueue {
  private items: QueueItem[] = [];
  private blobs = new Map<string, Blob>();
  private listeners = new Set<(items: QueueItem[]) => void>();
  private draining = false;
  private counter = 0;

  constructor(private deps: Deps) {}

  add(files: { name: string; blob: Blob }[]): void {
    for (const f of files) {
      const id = `q${Date.now()}-${this.counter++}`;
      this.items.push({ id, fileName: f.name, status: 'queued' });
      this.blobs.set(id, f.blob);
      void this.deps.persist.set(`${KEY_PREFIX}${id}`, {
        fileName: f.name,
        blob: f.blob,
      });
    }
    this.emit();
    void this.drain();
  }

  /** Reload interrupted items (still persisted) after a page refresh. */
  async restore(): Promise<void> {
    const keys = await this.deps.persist.keys();
    for (const key of keys.filter((k) => k.startsWith(KEY_PREFIX))) {
      const saved = (await this.deps.persist.get(key)) as
        | { fileName: string; blob: Blob }
        | undefined;
      if (!saved) continue;
      const id = key.slice(KEY_PREFIX.length);
      if (this.items.some((i) => i.id === id)) continue;
      this.items.push({ id, fileName: saved.fileName, status: 'queued' });
      this.blobs.set(id, saved.blob);
    }
    this.emit();
    void this.drain();
  }

  retry(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (item?.status === 'error') {
      item.status = 'queued';
      delete item.error;
      this.emit();
      void this.drain();
    }
  }

  onChange(cb: (items: QueueItem[]) => void): () => void {
    this.listeners.add(cb);
    cb([...this.items]);
    return () => this.listeners.delete(cb);
  }

  snapshot(): QueueItem[] {
    return this.items.map((i) => ({ ...i }));
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const cb of this.listeners) cb(snap);
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (;;) {
        const item = this.items.find((i) => i.status === 'queued');
        if (!item) break;
        const blob = this.blobs.get(item.id);
        if (!blob) {
          item.status = 'error';
          item.error = 'file lost';
          this.emit();
          continue;
        }
        try {
          item.status = 'processing';
          this.emit();
          const pieces = await this.deps.process(blob);
          item.status = 'uploading';
          this.emit();
          await this.deps.upload(blob, pieces);
          item.status = 'done';
          this.blobs.delete(item.id);
          await this.deps.persist.del(`${KEY_PREFIX}${item.id}`);
        } catch (err) {
          item.status = 'error';
          item.error = err instanceof Error ? err.message : String(err);
        }
        this.emit();
      }
    } finally {
      this.draining = false;
    }
  }
}

import type { WorkerPiece, WorkerResponse } from './worker';

export class MLUnavailableError extends Error {}

export type DetectedPiece = WorkerPiece;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (p: WorkerPiece[]) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const waiter = pending.get(event.data.id);
      if (!waiter) return;
      pending.delete(event.data.id);
      if (event.data.ok) waiter.resolve(event.data.pieces);
      else waiter.reject(new MLUnavailableError(event.data.error));
    });
    worker.addEventListener('error', (event) => {
      const err = new MLUnavailableError(event.message || 'ml worker crashed');
      for (const [, waiter] of pending) waiter.reject(err);
      pending.clear();
      worker?.terminate();
      worker = null;
    });
  }
  return worker;
}

/** Segment a photo into clothing pieces with embeddings. Runs off-main-thread.
 * Throws MLUnavailableError when the model can't load or the worker dies —
 * callers upload the photo with zero pieces so nothing is lost. */
export async function detectPieces(file: Blob): Promise<DetectedPiece[]> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new MLUnavailableError('not a decodable image');
  }
  const id = nextId++;
  return new Promise<WorkerPiece[]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, bitmap }, [bitmap]);
  });
}

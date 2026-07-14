import { get, set, del, keys } from 'idb-keyval';
import { UploadQueue } from './queue';
import { detectPieces, MLUnavailableError, type DetectedPiece } from '../ml';
import { api } from '../api/client';

/** Fires after every successful upload so views can refetch. */
export const dataChanged = new EventTarget();

function buildForm(file: Blob, pieces: DetectedPiece[]): FormData {
  const form = new FormData();
  form.append('original', file, 'photo.jpg');
  for (const p of pieces) form.append('crops', p.crop, 'crop.webp');
  form.append(
    'meta',
    JSON.stringify({
      pieces: pieces.map((p) => ({
        category: p.category,
        bbox: p.bbox,
        embedding: btoa(
          String.fromCharCode(...new Uint8Array(p.embedding.buffer))
        ),
      })),
    })
  );
  return form;
}

export function createUploadQueue(): UploadQueue {
  return new UploadQueue({
    persist: {
      get,
      set,
      del,
      keys: async () => (await keys()).map(String),
    },
    process: async (file) => {
      try {
        return await detectPieces(file);
      } catch (err) {
        if (err instanceof MLUnavailableError) {
          // photo still gets uploaded; it lands in Review for manual handling
          console.warn('ML unavailable, uploading without pieces:', err.message);
          return [];
        }
        throw err;
      }
    },
    upload: async (file, pieces) => {
      await api.uploadPhoto(buildForm(file, pieces as DetectedPiece[]));
      dataChanged.dispatchEvent(new Event('change'));
    },
  });
}

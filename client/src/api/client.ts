import type {
  Garment,
  GarmentDetail,
  GarmentPatch,
  IngestResult,
  Photo,
  Piece,
  Stats,
  Suggestion,
  Category,
} from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  uploadPhoto: (form: FormData) =>
    req<IngestResult>('/api/photos', { method: 'POST', body: form }),
  listPhotos: () => req<Photo[]>('/api/photos'),
  getPhoto: (id: string) => req<Photo>(`/api/photos/${id}`),
  deletePhoto: (id: string) =>
    req<{ ok: true }>(`/api/photos/${id}`, { method: 'DELETE' }),

  listGarments: (filters: { category?: Category; q?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.category) params.set('category', filters.category);
    if (filters.q) params.set('q', filters.q);
    const qs = params.toString();
    return req<Garment[]>(`/api/garments${qs ? `?${qs}` : ''}`);
  },
  getGarment: (id: string) => req<GarmentDetail>(`/api/garments/${id}`),
  patchGarment: (id: string, patch: GarmentPatch) =>
    req<GarmentDetail>(`/api/garments/${id}`, json('PATCH', patch)),
  mergeGarments: (sourceId: string, intoId: string) =>
    req<{ mergeEventId: string }>(
      `/api/garments/${sourceId}/merge`,
      json('POST', { into: intoId })
    ),
  undoMerge: (mergeEventId: string) =>
    req<{ ok: true }>(`/api/merges/${mergeEventId}/undo`, { method: 'POST' }),

  patchPiece: (id: string, patch: { category?: Category; garment_id?: string }) =>
    req<Piece>(`/api/pieces/${id}`, json('PATCH', patch)),
  deletePiece: (id: string) =>
    req<{ ok: true }>(`/api/pieces/${id}`, { method: 'DELETE' }),

  getSuggestions: () => req<Suggestion[]>('/api/suggestions'),
  acceptSuggestion: (id: string) =>
    req<{ mergeEventId: string }>(`/api/suggestions/${id}/accept`, { method: 'POST' }),
  dismissSuggestion: (id: string) =>
    req<{ ok: true }>(`/api/suggestions/${id}/dismiss`, { method: 'POST' }),

  getStats: () => req<Stats>('/api/stats'),
  getSettings: () => req<{ attach: number; suggest: number }>('/api/settings'),
  putSettings: (s: { attach?: number; suggest?: number }) =>
    req<{ attach: number; suggest: number }>('/api/settings', json('PUT', s)),
};

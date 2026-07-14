import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, ApiError } from '../src/api/client';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    statusText: 'status-text',
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('api client', () => {
  it('parses success responses', async () => {
    stubFetch(200, [{ id: 'g1' }]);
    const garments = await api.listGarments({ q: 'tee' });
    expect(garments[0].id).toBe('g1');
  });

  it('builds query strings from filters', async () => {
    const fn = stubFetch(200, []);
    await api.listGarments({ category: 'top', q: 'white' });
    expect(fn).toHaveBeenCalledWith('/api/garments?category=top&q=white', undefined);
  });

  it('throws ApiError with server message on failure', async () => {
    stubFetch(409, { error: 'source already merged' });
    await expect(api.mergeGarments('a', 'b')).rejects.toMatchObject({
      status: 409,
      message: 'source already merged',
    });
    stubFetch(500, null);
    await expect(api.getStats()).rejects.toBeInstanceOf(ApiError);
  });

  it('sends JSON bodies for mutations', async () => {
    const fn = stubFetch(200, {});
    await api.patchGarment('g1', { display_name: 'Tee' });
    const [, init] = fn.mock.calls[0];
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ display_name: 'Tee' });
  });
});

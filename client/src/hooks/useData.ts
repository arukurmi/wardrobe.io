import { useCallback, useEffect, useRef, useState } from 'react';
import { dataChanged } from '../upload/wire';

/** Fetch-on-mount + refetch whenever an upload lands or refetch() is called.
 * Tracks loading/error and ignores out-of-order responses so a slow earlier
 * request (e.g. an earlier search keystroke) can't clobber a newer one. */
export function useData<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    return fetcher().then(
      (d) => {
        if (id !== reqId.current) return;
        setData(d);
        setLoading(false);
      },
      (e: unknown) => {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    );
  }, deps);

  useEffect(() => {
    load();
    dataChanged.addEventListener('change', load);
    return () => dataChanged.removeEventListener('change', load);
  }, [load]);

  return { data, error, loading, refetch: load };
}

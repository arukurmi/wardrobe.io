import { useCallback, useEffect, useState } from 'react';
import { dataChanged } from '../upload/wire';

/** Fetch-on-mount + refetch whenever an upload lands or refetch() is called. */
export function useData<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => {
    fetcher().then(setData, (e) => setError(e.message));
  }, deps);

  useEffect(() => {
    load();
    dataChanged.addEventListener('change', load);
    return () => dataChanged.removeEventListener('change', load);
  }, [load]);

  return { data, error, refetch: load };
}

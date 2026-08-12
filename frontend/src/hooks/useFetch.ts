import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/api';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Runs an async fetch and tracks loading/error state for it.
 *
 * `loading` starts true so a list or detail pane can render its skeleton on the
 * very first paint instead of flashing an empty frame, and stale responses are
 * dropped: with filters and paging, a slow request can otherwise land after a
 * newer one and overwrite it.
 */
export function useFetch<T>(
  run: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): FetchState<T> & { reload: () => void } {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  // Held in a ref so a caller can pass an inline arrow without re-firing the
  // effect on every render.
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    const requestId = ++latest.current;
    const controller = new AbortController();

    setState((current) => ({ ...current, loading: true, error: null }));

    runRef
      .current(controller.signal)
      .then((data) => {
        if (requestId !== latest.current) return;
        setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (requestId !== latest.current || controller.signal.aborted) return;
        setState({ data: null, loading: false, error: errorMessage(err) });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { ...state, reload };
}

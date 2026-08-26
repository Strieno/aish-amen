import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { liveBus } from './live';

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  setData: (d: T) => void;
}

/**
 * Typed data hook with automatic live updates.
 * - GET on mount + manual refetch
 * - Subscribes to the global domain-event stream and refetches (debounced)
 *   whenever a watched domain changes — no manual page refresh needed.
 * - `live` is a list of entity types to watch; `['*']` (default) watches all.
 */
export function useApi<T>(path: string, deps: unknown[] = [], live: string[] = ['*']): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const hasData = useRef(false);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    // Only show the full loading state on the first fetch; live refreshes
    // update silently so the UI never flickers.
    if (!hasData.current) setLoading(true);
    api
      .get<T>(path)
      .then((d) => {
        if (alive) {
          hasData.current = true;
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'error');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);

  // Live updates: refetch when a watched domain emits an event.
  const liveKey = live.join(',');
  useEffect(() => {
    let timer: number | null = null;
    const unsub = liveBus.subscribe((e) => {
      const matches = live.includes('*') || live.includes(e.entity_type || '') || e.event_type === 'AppFocus';
      if (!matches) return;
      if (document.hidden) return; // refresh on next focus instead
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setTick((t) => t + 1), 300);
    });
    return () => {
      unsub();
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, path]);

  return { data, loading, error, refetch, setData };
}

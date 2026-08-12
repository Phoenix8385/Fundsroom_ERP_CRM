import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { Paginated } from '../types/api';

export interface StatSpec {
  key: string;
  label: string;
  /** Where clicking the card goes. */
  to: string;
  /** List endpoint whose `total` is the count. */
  path: string;
  params?: Record<string, string>;
  tone?: 'warning';
}

/**
 * Each card is a count, and a count is just `total` off a list endpoint asked
 * for the smallest possible page — never a full fetch that is then measured.
 *
 * All four are plain GETs on list routes, which carry no requireRole: every
 * authenticated role, Accounts included, can load this dashboard.
 */
export const STAT_CARDS: StatSpec[] = [
  { key: 'customers', label: 'Customers', to: '/customers', path: '/customers' },
  { key: 'products', label: 'Products', to: '/products', path: '/products' },
  {
    key: 'lowStock',
    label: 'Low on stock',
    to: '/products?lowStockOnly=true',
    path: '/products',
    params: { lowStockOnly: 'true' },
    tone: 'warning',
  },
  {
    key: 'drafts',
    label: 'Draft challans',
    to: '/challans?status=DRAFT',
    path: '/challans',
    params: { status: 'DRAFT' },
  },
];

/** null for a card means its request failed; that card shows a dash. */
export type Counts = Record<string, number | null>;

/**
 * Mounted dashboards, so a write elsewhere in the app can invalidate them.
 *
 * Confirming a challan or adding a customer happens on another page, by which
 * point the dashboard is unmounted and has no state to refresh — navigating
 * back remounts it and refetches anyway. This set exists for the case that
 * *isn't* covered by remounting: a write while the dashboard is on screen. When
 * nothing is listening the notification costs nothing, so callers can fire it
 * after any mutation without worrying about which page is currently rendered.
 */
const listeners = new Set<() => void>();

/** Call after any write that moves one of the four counts. */
export function notifyStatsChanged(): void {
  for (const listener of listeners) listener();
}

export interface DashboardStats {
  counts: Counts | null;
  /** True only for the first load, when there is nothing to show yet. */
  loading: boolean;
  /** True while re-reading counts that are already on screen. */
  refreshing: boolean;
  refetch: () => void;
}

/**
 * Shortest time the refreshing state is allowed to last.
 *
 * Four counts against a warm local API settle in roughly 40ms — briefer than
 * the dim's own fade, so it flickers instead of reading as feedback. Holding it
 * briefly makes the update legible; without this the number just changes, which
 * is the thing the indicator exists to avoid.
 */
const MIN_REFRESH_FEEDBACK_MS = 320;

export function useDashboardStats(): DashboardStats {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const inFlight = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async (isRefresh: boolean) => {
    // A refetch triggered while an earlier one is still open would race it;
    // the newer request wins.
    inFlight.current?.abort();

    const controller = new AbortController();
    inFlight.current = controller;

    const startedAt = performance.now();

    if (isRefresh) setRefreshing(true);

    // Every request catches its own failure *before* Promise.all sees it.
    // A bare Promise.all settles on the first rejection, so one dead endpoint
    // would blank all four cards — the opposite of the resilience wanted here.
    const totals = await Promise.all(
      STAT_CARDS.map((card) =>
        api
          .get<Paginated<unknown>>(card.path, {
            params: { pageSize: 1, ...card.params },
            signal: controller.signal,
          })
          .then((res) => res.data.total)
          .catch(() => null),
      ),
    );

    if (controller.signal.aborted || !mounted.current) return;

    // Only refetches wait: the first load shows skeletons and should land as
    // soon as it can.
    const elapsed = performance.now() - startedAt;

    if (isRefresh && elapsed < MIN_REFRESH_FEEDBACK_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REFRESH_FEEDBACK_MS - elapsed));

      if (controller.signal.aborted || !mounted.current) return;
    }

    setCounts(Object.fromEntries(STAT_CARDS.map((card, i) => [card.key, totals[i]])));
    setRefreshing(false);
  }, []);

  const refetch = useCallback(() => {
    void load(true);
  }, [load]);

  // Runs on every mount, so navigating back to /dashboard always re-reads.
  useEffect(() => {
    mounted.current = true;
    void load(false);

    return () => {
      mounted.current = false;
      inFlight.current?.abort();
    };
  }, [load]);

  // Listen for writes made elsewhere while this dashboard is on screen.
  useEffect(() => {
    listeners.add(refetch);

    return () => {
      listeners.delete(refetch);
    };
  }, [refetch]);

  return { counts, loading: counts === null, refreshing, refetch };
}

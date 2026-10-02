import { create } from 'zustand';
import type { MatchListItem, MatchListQuery } from '@/domain/types';
import type { MatchHistoryStore } from './contracts';
import { call } from './internal/call';

export const HISTORY_PAGE_SIZE = 25;

const DEFAULT_QUERY: MatchListQuery = { sort: 'recent', limit: HISTORY_PAGE_SIZE, offset: 0 };

function merged(current: readonly MatchListItem[], page: readonly MatchListItem[]): readonly MatchListItem[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...page.filter((item) => !seen.has(item.id))];
}

export const useMatchHistoryStore = create<MatchHistoryStore>()((set, get) => {
  let token = 0;
  let loadingMore = false;

  return {
    status: 'idle',
    query: DEFAULT_QUERY,
    items: [],
    error: null,

    async load(query) {
      token += 1;
      const ticket = token;
      const normalized: MatchListQuery = { ...query, limit: query.limit ?? HISTORY_PAGE_SIZE, offset: 0 };
      set({ query: normalized, status: 'loading', error: null });
      const result = await call((services) => services.matches.list(normalized));
      if (ticket !== token) {
        return false;
      }
      if (!result.ok) {
        set({ status: 'error', error: result.error });
        return false;
      }
      set({ items: result.value, status: 'ready' });
      return true;
    },

    async loadMore() {
      if (loadingMore || get().status !== 'ready') {
        return false;
      }
      loadingMore = true;
      const ticket = token;
      const { query, items } = get();
      const result = await call((services) => services.matches.list({ ...query, offset: items.length }));
      loadingMore = false;
      if (ticket !== token) {
        return false;
      }
      if (!result.ok) {
        set({ error: result.error });
        return false;
      }
      set({ items: merged(get().items, result.value) });
      return result.value.length > 0;
    },

    async remove(matchId) {
      const removed = await call((services) => services.matches.delete(matchId));
      if (!removed.ok) {
        set({ error: removed.error });
        return false;
      }
      token += 1;
      const ticket = token;
      const { query, items } = get();
      const result = await call((services) => services.matches.list({ ...query, offset: 0, limit: Math.max(items.length, query.limit ?? HISTORY_PAGE_SIZE) }));
      if (ticket === token) {
        set(result.ok ? { items: result.value, error: null } : { items: items.filter((item) => item.id !== matchId), error: null });
      }
      return true;
    },
  };
});

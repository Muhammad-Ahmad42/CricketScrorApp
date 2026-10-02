import { create } from 'zustand';
import type { TournamentListStore } from './contracts';
import { call } from './internal/call';

export const useTournamentListStore = create<TournamentListStore>()((set, get) => {
  let token = 0;
  return {
    status: 'idle',
    items: [],
    async load() {
      token += 1;
      const ticket = token;
      if (get().status === 'idle' || get().status === 'error') {
        set({ status: 'loading' });
      }
      const result = await call((services) => services.tournaments.list());
      if (ticket !== token) {
        return false;
      }
      if (!result.ok) {
        set({ status: 'error' });
        return false;
      }
      set({ status: 'ready', items: result.value });
      return true;
    },
  };
});

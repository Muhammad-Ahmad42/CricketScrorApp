import { create } from 'zustand';
import type { MatchId, TournamentStatus } from '@/domain/types';
import type { AppServices, ServiceResult } from '@/services/contracts';
import { forgetResumable } from './app';
import type { HomeStore } from './contracts';
import { call } from './internal/call';
import { showErrorToast } from './toast';

const RECENT_LIMIT = 5;
const VISIBLE_TOURNAMENTS: readonly TournamentStatus[] = [
  'draft',
  'registration',
  'structure_configured',
  'pools_configured',
  'fixtures_generated',
  'active',
  'completed',
];

export const useHomeStore = create<HomeStore>()((set, get) => {
  let token = 0;

  const act = async (matchId: MatchId, task: (services: AppServices) => Promise<ServiceResult<void>>): Promise<boolean> => {
    const result = await call(task);
    if (!result.ok) {
      showErrorToast(result.error.message);
      return false;
    }
    forgetResumable(matchId);
    await get().load();
    return true;
  };

  return {
    status: 'idle',
    resumable: [],
    recent: [],
    tournaments: [],

    async load() {
      token += 1;
      const ticket = token;
      if (get().status === 'idle' || get().status === 'error') {
        set({ status: 'loading' });
      }
      const [resumable, recent, tournaments] = await Promise.all([
        call((services) => services.matches.findResumable()),
        call((services) => services.matches.list({ statuses: ['completed', 'abandoned'], sort: 'recent', limit: RECENT_LIMIT })),
        call((services) => services.tournaments.list({ statuses: VISIBLE_TOURNAMENTS })),
      ]);
      if (ticket !== token) {
        return false;
      }
      if (!resumable.ok || !recent.ok || !tournaments.ok) {
        set({ status: 'error' });
        return false;
      }
      set({ status: 'ready', resumable: resumable.value, recent: recent.value, tournaments: tournaments.value });
      return true;
    },

    dismissResume(matchId) {
      return act(matchId, (services) => services.matches.dismissResume(matchId));
    },

    discard(matchId) {
      return act(matchId, (services) => services.matches.discard(matchId));
    },
  };
});

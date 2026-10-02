import { create } from 'zustand';
import type { TournamentId } from '@/domain/types';
import type { AppServices, ServiceResult } from '@/services/contracts';
import type { TournamentStore } from './contracts';
import { call, storeError } from './internal/call';

type TournamentState = Pick<TournamentStore, 'tournamentId' | 'status' | 'snapshot' | 'evaluation' | 'error'>;

const INITIAL: TournamentState = { tournamentId: null, status: 'idle', snapshot: null, evaluation: null, error: null };

const NO_TOURNAMENT = storeError('NOT_FOUND', 'Open a tournament first.');

export const useTournamentStore = create<TournamentStore>()((set, get) => {
  let token = 0;

  const load = async (tournamentId: TournamentId, ticket: number): Promise<boolean> => {
    const result = await call((services) => services.tournaments.evaluate(tournamentId));
    if (ticket !== token || get().tournamentId !== tournamentId) {
      return false;
    }
    if (!result.ok) {
      set({ error: result.error, status: get().snapshot === null ? 'error' : 'ready' });
      return false;
    }
    set({ snapshot: result.value.snapshot, evaluation: result.value.evaluation, status: 'ready', error: null });
    return true;
  };

  const refresh = (): Promise<boolean> => {
    const { tournamentId } = get();
    if (tournamentId === null) {
      return Promise.resolve(false);
    }
    token += 1;
    return load(tournamentId, token);
  };

  const query = async <T>(task: (services: AppServices, tournamentId: TournamentId) => Promise<ServiceResult<T>>): Promise<T | null> => {
    const { tournamentId } = get();
    if (tournamentId === null) {
      set({ error: NO_TOURNAMENT });
      return null;
    }
    const result = await call((services) => task(services, tournamentId));
    if (!result.ok) {
      set({ error: result.error });
      return null;
    }
    return result.value;
  };

  const mutate = async <T>(task: (services: AppServices, tournamentId: TournamentId) => Promise<ServiceResult<T>>): Promise<boolean> => {
    const { tournamentId } = get();
    if (tournamentId === null) {
      set({ error: NO_TOURNAMENT });
      return false;
    }
    set({ status: 'saving', error: null });
    const result = await call((services) => task(services, tournamentId));
    if (get().tournamentId !== tournamentId) {
      return false;
    }
    if (!result.ok) {
      if (result.error.code === 'CONFLICT') {
        await refresh();
      }
      set({ error: result.error, status: 'ready' });
      return false;
    }
    await refresh();
    return true;
  };

  return {
    ...INITIAL,

    open(tournamentId) {
      token += 1;
      const keep = get().tournamentId === tournamentId;
      set({ ...INITIAL, tournamentId, status: 'loading', ...(keep ? { snapshot: get().snapshot, evaluation: get().evaluation } : {}) });
      return load(tournamentId, token);
    },

    refresh,

    previewChange(change) {
      return query((services, tournamentId) => services.tournaments.previewChange(tournamentId, change));
    },

    applyChange(change, reason, confirmation) {
      return mutate((services, tournamentId) => services.tournaments.applyChange(tournamentId, change, reason, confirmation));
    },

    clearError() {
      set({ error: null });
    },

    whatIf(hypotheticals) {
      return query((services, tournamentId) => services.tournaments.whatIf(tournamentId, hypotheticals));
    },

    loadStats() {
      return query((services, tournamentId) => services.tournaments.stats(tournamentId));
    },

    loadAudit(page) {
      return query((services, tournamentId) => services.tournaments.auditLog(tournamentId, page));
    },

    updateFixture(fixtureId, patch, reason) {
      return mutate((services) => services.tournaments.updateFixture(fixtureId, patch, reason));
    },

    addFixture(draft) {
      return mutate((services) => services.tournaments.addFixture(draft));
    },

    generateFixtures(stageId, opts) {
      return query((services) => services.tournaments.generateFixtures(stageId, opts));
    },

    confirmFixtures(stageId, plan) {
      return mutate((services) => services.tournaments.confirmFixtures(stageId, plan));
    },

    setStatus(to, reason) {
      return mutate((services, tournamentId) => services.tournaments.setStatus(tournamentId, to, reason));
    },

    updateInfo(patch) {
      return mutate((services, tournamentId) => services.tournaments.updateInfo(tournamentId, patch));
    },

    async listTemplates() {
      const result = await call((services) => services.tournaments.listTemplates());
      if (!result.ok) {
        set({ error: result.error });
        return null;
      }
      return result.value;
    },

    saveAsTemplate(meta) {
      return query((services, tournamentId) => services.tournaments.saveAsTemplate(tournamentId, meta));
    },

    previewDelete() {
      return query((services, tournamentId) => services.tournaments.previewDelete(tournamentId));
    },

    async delete(confirm) {
      const { tournamentId } = get();
      if (tournamentId === null) {
        set({ error: NO_TOURNAMENT });
        return false;
      }
      set({ status: 'saving', error: null });
      const result = await call((services) => services.tournaments.delete(tournamentId, confirm));
      if (!result.ok) {
        set({ error: result.error, status: 'ready' });
        return false;
      }
      token += 1;
      set(INITIAL);
      return true;
    },
  };
});

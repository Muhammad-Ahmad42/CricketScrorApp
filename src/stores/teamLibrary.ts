import { create } from 'zustand';
import type { TeamId } from '@/domain/types';
import type { AppServices, ServiceResult } from '@/services/contracts';
import type { TeamLibraryStore } from './contracts';
import { call } from './internal/call';

interface LoadOptions {
  readonly search?: string;
  readonly includeArchived?: boolean;
}

export const useTeamLibraryStore = create<TeamLibraryStore>()((set, get) => {
  let options: LoadOptions = {};

  const reloadLists = async (): Promise<boolean> => {
    const [teams, venues] = await Promise.all([call((services) => services.teams.list(options)), call((services) => services.teams.listVenues())]);
    if (!teams.ok || !venues.ok) {
      set({ error: teams.ok ? (venues.ok ? null : venues.error) : teams.error });
      return false;
    }
    set({ teams: teams.value, venues: venues.value });
    return true;
  };

  const reloadDetail = async (teamId: TeamId | null): Promise<void> => {
    const detail = get().detail;
    if (detail === null || (teamId !== null && detail.team.id !== teamId)) {
      return;
    }
    const result = await call((services) => services.teams.get(detail.team.id));
    set({ detail: result.ok ? result.value : null });
  };

  const mutate = async <T>(task: (services: AppServices) => Promise<ServiceResult<T>>, teamId: (value: T) => TeamId | null): Promise<T | null> => {
    set({ status: 'saving', error: null });
    const result = await call(task);
    if (!result.ok) {
      set({ status: 'ready', error: result.error });
      return null;
    }
    await reloadLists();
    await reloadDetail(teamId(result.value));
    set({ status: 'ready' });
    return result.value;
  };

  return {
    status: 'idle',
    teams: [],
    venues: [],
    detail: null,
    error: null,

    async load(opts = {}) {
      options = opts;
      if (get().status === 'idle' || get().status === 'error') {
        set({ status: 'loading' });
      }
      const loaded = await reloadLists();
      set({ status: loaded ? 'ready' : 'error' });
      return loaded;
    },

    async loadTeam(teamId) {
      const result = await call((services) => services.teams.get(teamId));
      if (!result.ok) {
        set({ error: result.error });
        return false;
      }
      set({ detail: result.value, error: null });
      return true;
    },

    createTeam(input) {
      return mutate((services) => services.teams.create(input), () => null);
    },

    async updateTeam(team) {
      return (await mutate((services) => services.teams.update(team), (value) => value.id)) !== null;
    },

    async archiveTeam(teamId) {
      const done = await mutate(
        async (services) => {
          const result = await services.teams.archive(teamId);
          return result.ok ? { ok: true as const, value: teamId } : result;
        },
        (value) => value,
      );
      return done !== null;
    },

    addPlayer(teamId, input) {
      return mutate((services) => services.teams.addPlayer(teamId, input), (value) => value.teamId);
    },

    async updatePlayer(player) {
      return (await mutate((services) => services.teams.updatePlayer(player), (value) => value.teamId)) !== null;
    },

    async archivePlayer(playerId) {
      const done = await mutate(
        async (services) => {
          const result = await services.teams.archivePlayer(playerId);
          return result.ok ? { ok: true as const, value: playerId } : result;
        },
        () => null,
      );
      return done !== null;
    },

    createVenue(input) {
      return mutate((services) => services.teams.createVenue(input), () => null);
    },

    async archiveVenue(venueId) {
      const done = await mutate(
        async (services) => {
          const result = await services.teams.archiveVenue(venueId);
          return result.ok ? { ok: true as const, value: venueId } : result;
        },
        () => null,
      );
      return done !== null;
    },

    clearError() {
      set({ error: null });
    },
  };
});

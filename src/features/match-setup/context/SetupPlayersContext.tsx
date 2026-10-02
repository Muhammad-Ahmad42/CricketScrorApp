import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import type { NewPlayerInput, Player, TeamId } from '@/domain/types';
import { useTeamLibraryStore } from '@/stores';

export interface SetupPlayersValue {
  readonly playersOf: (teamId: TeamId | null) => readonly Player[] | null;
  readonly ensure: (teamId: TeamId | null) => void;
  readonly addPlayer: (teamId: TeamId, input: NewPlayerInput) => Promise<Player | null>;
}

const SetupPlayersContext = createContext<SetupPlayersValue | null>(null);

export function SetupPlayersProvider({ children }: { readonly children: ReactNode }) {
  const [cache, setCache] = useState<ReadonlyMap<TeamId, readonly Player[]>>(new Map());
  const inFlight = useRef(new Set<TeamId>());
  const chain = useRef<Promise<void>>(Promise.resolve());

  const store = (teamId: TeamId, players: readonly Player[]) => {
    setCache((previous) => {
      const next = new Map(previous);
      next.set(teamId, players);
      return next;
    });
  };

  const value: SetupPlayersValue = {
    playersOf: (teamId) => (teamId === null ? null : cache.get(teamId) ?? null),
    ensure: (teamId) => {
      if (teamId === null || cache.has(teamId) || inFlight.current.has(teamId)) {
        return;
      }
      inFlight.current.add(teamId);
      chain.current = chain.current.then(async () => {
        await useTeamLibraryStore.getState().loadTeam(teamId);
        const detail = useTeamLibraryStore.getState().detail;
        inFlight.current.delete(teamId);
        store(teamId, detail !== null && detail.team.id === teamId ? detail.players.filter((player) => player.archivedAt === null) : []);
      });
    },
    addPlayer: async (teamId, input) => {
      const created = await useTeamLibraryStore.getState().addPlayer(teamId, input);
      if (created !== null) {
        setCache((previous) => {
          const next = new Map(previous);
          next.set(teamId, [...(previous.get(teamId) ?? []), created]);
          return next;
        });
      }
      return created;
    },
  };
  return <SetupPlayersContext.Provider value={value}>{children}</SetupPlayersContext.Provider>;
}

export function useSetupPlayers(): SetupPlayersValue {
  const value = useContext(SetupPlayersContext);
  if (value === null) {
    throw new Error('useSetupPlayers must be used inside SetupPlayersProvider');
  }
  return value;
}

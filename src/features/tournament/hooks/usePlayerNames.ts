import { useEffect, useState } from 'react';
import type { PlayerId, TeamId } from '@/domain/types';
import { useTeamLibraryStore } from '@/stores';

export function usePlayerNames(teamIds: readonly TeamId[]): ReadonlyMap<PlayerId, string> {
  const [names, setNames] = useState<ReadonlyMap<PlayerId, string>>(new Map());
  const key = teamIds.join('|');
  useEffect(() => {
    let active = true;
    const load = async () => {
      const collected = new Map<PlayerId, string>();
      for (const teamId of key.split('|').filter((id) => id.length > 0)) {
        const ok = await useTeamLibraryStore.getState().loadTeam(teamId);
        const detail = useTeamLibraryStore.getState().detail;
        if (ok && detail && detail.team.id === teamId) {
          for (const player of detail.players) {
            collected.set(player.id, player.name);
          }
        }
        if (!active) {
          return;
        }
      }
      setNames(collected);
    };
    void load();
    return () => {
      active = false;
    };
  }, [key]);
  return names;
}

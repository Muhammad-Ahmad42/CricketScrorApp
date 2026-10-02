import { useState } from 'react';
import { useRouter } from 'expo-router';
import type { FixtureId, TournamentId } from '@/domain/types';
import { joinList } from '@/features/shared';
import { useMatchSetupStore } from '@/stores';
import { routes } from '../routes';
import type { FixtureRowVM } from '../selectors/fixtures';
import type { TournamentIndex } from '../selectors/names';
import { showError } from './toast';

export interface ProvisionalPrompt {
  readonly fixtureId: FixtureId;
  readonly message: string;
}

export function provisionalStartMessage(index: TournamentIndex, row: FixtureRowVM): string {
  const sides = [row.a, row.b].filter((side) => side.provisional);
  const lines = sides.map((side) => `${index.teamName(side.teamId)} ${side.slotLabel ? `are provisionally ${side.slotLabel}` : 'are provisional'}`);
  const teams = joinList(sides.map((side) => index.teamName(side.teamId)));
  return `The earlier stage isn't finished. ${lines.join('. ')}. Starting now fixes ${teams} in this match even if the table changes.`;
}

export interface StartFixtureMatch {
  readonly request: (row: FixtureRowVM) => void;
  readonly prompt: ProvisionalPrompt | null;
  readonly busy: boolean;
  readonly confirm: () => void;
  readonly dismiss: () => void;
}

export function useStartFixtureMatch(tournamentId: TournamentId, index: TournamentIndex | null): StartFixtureMatch {
  const router = useRouter();
  const [prompt, setPrompt] = useState<ProvisionalPrompt | null>(null);
  const [busy, setBusy] = useState(false);

  const begin = async (fixtureId: FixtureId) => {
    setBusy(true);
    const ok = await useMatchSetupStore.getState().startFromFixture(tournamentId, fixtureId);
    setBusy(false);
    setPrompt(null);
    if (ok) {
      router.push(routes.matchSetup(tournamentId, fixtureId));
    } else {
      showError(useMatchSetupStore.getState().error, "Couldn't start this match.");
    }
  };

  return {
    request: (row) => {
      if (!row.resolved || busy) {
        return;
      }
      if (row.provisional && index !== null) {
        setPrompt({ fixtureId: row.fixtureId, message: provisionalStartMessage(index, row) });
        return;
      }
      void begin(row.fixtureId);
    },
    prompt,
    busy,
    confirm: () => {
      if (prompt) {
        void begin(prompt.fixtureId);
      }
    },
    dismiss: () => setPrompt(null),
  };
}

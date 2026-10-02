import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { TournamentId } from '@/domain/types';
import type { ServiceError } from '@/services/contracts';
import type { AsyncStatus } from '@/stores';
import { useTournamentStore } from '@/stores';
import { tournamentIndex, type TournamentIndex } from '../selectors/names';

export interface TournamentView {
  readonly index: TournamentIndex | null;
  readonly status: AsyncStatus;
  readonly error: ServiceError | null;
  readonly loadedId: TournamentId | null;
}

export function useTournamentView(): TournamentView {
  const { snapshot, evaluation, status, error, loadedId } = useTournamentStore(
    useShallow((state) => ({
      snapshot: state.snapshot,
      evaluation: state.evaluation,
      status: state.status,
      error: state.error,
      loadedId: state.tournamentId,
    })),
  );
  return {
    index: snapshot ? tournamentIndex(snapshot, evaluation) : null,
    status,
    error,
    loadedId,
  };
}

export function useOpenTournament(tournamentId: TournamentId | undefined): void {
  useEffect(() => {
    if (tournamentId) {
      void useTournamentStore.getState().open(tournamentId);
    }
  }, [tournamentId]);
}

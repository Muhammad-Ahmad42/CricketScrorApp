import { create } from 'zustand';
import { buildEvents } from '@/domain/scoring';
import type { MatchEvent, MatchId } from '@/domain/types';
import { cueForCommit, matchWithState, type FeedbackCue } from '@/services';
import type { AppServices, LiveMatch, ServiceError, ServiceResult } from '@/services/contracts';
import type { LiveMatchStore } from './contracts';
import { call, storeError } from './internal/call';
import { createSerialQueue } from './internal/serialQueue';
import { getScoringFeedback } from './services';
import { useTournamentStore } from './tournament';

type LiveState = Pick<LiveMatchStore, 'matchId' | 'status' | 'live' | 'redoStack' | 'error' | 'warnings'>;

const INITIAL: LiveState = { matchId: null, status: 'idle', live: null, redoStack: [], error: null, warnings: [] };

const NO_MATCH = storeError('NOT_FOUND', 'Open a match first.');

function cue(value: FeedbackCue | null): void {
  if (value !== null) {
    getScoringFeedback().cue(value);
  }
}

function endsMatch(events: readonly MatchEvent[]): boolean {
  return events.some((event) => event.kind === 'match_ended');
}

function refreshTournament(live: LiveMatch): void {
  const tournamentId = live.match.tournamentId;
  const tournament = useTournamentStore.getState();
  if (tournamentId !== null && tournament.tournamentId === tournamentId) {
    void tournament.refresh();
  }
}

interface MutationOptions {
  readonly clearRedo: boolean;
  readonly refresh: boolean;
  readonly success?: FeedbackCue;
}

export const useLiveMatchStore = create<LiveMatchStore>()((set, get) => {
  const queue = createSerialQueue();
  let openToken = 0;

  const reload = async (matchId: MatchId): Promise<LiveMatch | null> => {
    const result = await call((services) => services.matches.load(matchId));
    if (!result.ok || get().matchId !== matchId) {
      return null;
    }
    set({ live: result.value, redoStack: [] });
    return result.value;
  };

  const failed = async (matchId: MatchId, error: ServiceError): Promise<false> => {
    if (error.code === 'CONFLICT') {
      await reload(matchId);
      set({ redoStack: [] });
    }
    if (get().matchId === matchId) {
      set({ error, status: get().live === null ? 'error' : 'ready' });
    }
    return false;
  };

  const mutate = <T>(
    operation: (services: AppServices, matchId: MatchId, live: LiveMatch) => Promise<ServiceResult<T>>,
    apply: (value: T, live: LiveMatch, matchId: MatchId) => Promise<LiveMatch | null> | LiveMatch | null,
    options: MutationOptions,
  ): Promise<boolean> =>
    queue.run(async () => {
      const { matchId, live } = get();
      if (matchId === null || live === null) {
        set({ error: NO_MATCH });
        return false;
      }
      set({ status: 'saving', error: null });
      const result = await call((services) => operation(services, matchId, live));
      if (get().matchId !== matchId) {
        return false;
      }
      if (!result.ok) {
        return failed(matchId, result.error);
      }
      const next = await apply(result.value, live, matchId);
      if (get().matchId !== matchId) {
        return false;
      }
      set({ status: 'ready', error: null, ...(next === null ? {} : { live: next }), ...(options.clearRedo ? { redoStack: [] } : {}) });
      cue(options.success ?? null);
      if (options.refresh) {
        refreshTournament(next ?? live);
      }
      return true;
    }, false);

  return {
    ...INITIAL,

    async open(matchId) {
      queue.reset();
      openToken += 1;
      const token = openToken;
      const keep = get().matchId === matchId ? get().live : null;
      set({ ...INITIAL, matchId, status: 'loading', live: keep });
      const result = await call((services) => services.matches.load(matchId));
      if (token !== openToken) {
        return false;
      }
      if (!result.ok) {
        set({ status: 'error', error: result.error });
        return false;
      }
      set({ live: result.value, status: 'ready', error: null });
      return true;
    },

    close() {
      queue.reset();
      openToken += 1;
      set(INITIAL);
    },

    dispatch(intent) {
      return queue.run(async () => {
        const { matchId, live } = get();
        if (matchId === null || live === null) {
          set({ error: NO_MATCH });
          return false;
        }
        const built = buildEvents(live.setup, live.state, intent);
        if (!built.ok) {
          set({ error: storeError('VALIDATION', built.message, built.code) });
          cue('error');
          return false;
        }
        set({ status: 'saving' });
        const result = await call((services) => services.matches.record(matchId, live.state.lastSeq, built.events));
        if (get().matchId !== matchId) {
          return false;
        }
        if (!result.ok) {
          queue.reset();
          cue('error');
          return failed(matchId, result.error);
        }
        const events = [...live.events, ...result.value.events];
        const recordedAt = result.value.events[result.value.events.length - 1]?.recordedAt ?? live.match.updatedAt;
        const match = { ...matchWithState(live.match, events, result.value.state), updatedAt: recordedAt, resumeDismissedAt: null };
        const next: LiveMatch = { match, setup: live.setup, events, state: result.value.state };
        set({ live: next, warnings: result.value.warnings, redoStack: [], status: 'ready', error: null });
        cue(cueForCommit(result.value.state, result.value.events));
        if (live.state.lifecycle !== result.value.state.lifecycle) {
          refreshTournament(next);
        }
        return true;
      }, false);
    },

    undo(reason) {
      return queue.run(async () => {
        const { matchId, live } = get();
        if (matchId === null || live === null) {
          set({ error: NO_MATCH });
          return false;
        }
        set({ status: 'saving', error: null });
        const result = await call((services) => services.matches.undo(matchId, live.state.lastSeq, reason));
        if (get().matchId !== matchId) {
          return false;
        }
        if (!result.ok) {
          return failed(matchId, result.error);
        }
        set({ live: result.value.live, redoStack: [...get().redoStack, result.value.undone], status: 'ready', error: null });
        cue('undo');
        if (endsMatch(result.value.undone)) {
          refreshTournament(result.value.live);
        }
        return true;
      }, false);
    },

    redo(reason) {
      return queue.run(async () => {
        const { matchId, live, redoStack } = get();
        const group = redoStack[redoStack.length - 1];
        if (matchId === null || live === null || group === undefined) {
          return false;
        }
        set({ status: 'saving', error: null });
        const result = await call((services) => services.matches.redo(matchId, live.state.lastSeq, group, reason));
        if (get().matchId !== matchId) {
          return false;
        }
        if (!result.ok) {
          return failed(matchId, result.error);
        }
        set({ live: result.value, redoStack: get().redoStack.slice(0, -1), status: 'ready', error: null });
        cue('undo');
        if (endsMatch(group)) {
          refreshTournament(result.value);
        }
        return true;
      }, false);
    },

    addSquadPlayer(teamId, player, opts) {
      return mutate(
        (services, matchId) => services.matches.addSquadPlayer(matchId, teamId, player, opts),
        (_value, _live, matchId) => reload(matchId),
        { clearRedo: false, refresh: false },
      );
    },

    clearError() {
      set({ error: null });
    },

    async previewHistoryEdit(ops) {
      const { matchId } = get();
      if (matchId === null) {
        set({ error: NO_MATCH });
        return null;
      }
      const result = await call((services) => services.matches.previewHistoryEdit(matchId, ops));
      if (!result.ok) {
        set({ error: result.error });
        return null;
      }
      return result.value;
    },

    applyHistoryEdit(ops, reason, preview) {
      return mutate(
        (services, matchId) => services.matches.applyHistoryEdit(matchId, ops, reason, preview.baseFingerprint),
        (value) => value,
        { clearRedo: true, refresh: true, success: 'confirm' },
      );
    },

    updateDetails(patch) {
      return mutate(
        (services, matchId) => services.matches.updateDetails(matchId, patch),
        (value, live) => ({ ...live, match: value }),
        { clearRedo: false, refresh: true },
      );
    },

    updateRules(patch, reason) {
      return mutate(
        (services, matchId) => services.matches.updateRules(matchId, patch, reason),
        (value) => value,
        { clearRedo: true, refresh: true },
      );
    },

    setToss(toss, reason) {
      return mutate(
        (services, matchId) => services.matches.setToss(matchId, toss, reason),
        (_value, _live, matchId) => reload(matchId),
        { clearRedo: false, refresh: true },
      );
    },

    setPrePlayStatus(status, reason) {
      return mutate(
        (services, matchId) => services.matches.setPrePlayStatus(matchId, status, reason),
        (value, live) => ({ ...live, match: value }),
        { clearRedo: false, refresh: true },
      );
    },

    removeSquadPlayer(playerId) {
      return mutate(
        (services, matchId) => services.matches.removeSquadPlayer(matchId, playerId),
        (_value, _live, matchId) => reload(matchId),
        { clearRedo: false, refresh: true },
      );
    },

    async loadAudit(page) {
      const { matchId } = get();
      if (matchId === null) {
        set({ error: NO_MATCH });
        return null;
      }
      const result = await call((services) => services.matches.auditLog(matchId, page));
      if (!result.ok) {
        set({ error: result.error });
        return null;
      }
      return result.value;
    },
  };
});

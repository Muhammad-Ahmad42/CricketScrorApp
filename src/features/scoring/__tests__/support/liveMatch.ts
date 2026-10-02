import type { Match, MatchSetup, MatchStatus } from '@/domain/types';
import type { LiveMatch } from '@/services/contracts';
import { deriveMatchStatus } from '@/domain/scoring/replay';
import { m3Setup, playScript, type ScriptOptions, type ScriptStep } from '@/domain/scoring/testing';

export interface LiveOptions extends ScriptOptions {
  readonly tournamentId?: string | null;
  readonly title?: string;
}

export function matchRow(setup: MatchSetup, status: MatchStatus, overrides: Partial<Match> = {}): Match {
  return {
    id: setup.matchId,
    title: `${setup.teams[0].name} v ${setup.teams[1].name}`,
    teamAId: setup.teams[0].id,
    teamBId: setup.teams[1].id,
    venueId: null,
    scheduledDate: '2026-09-12',
    scheduledTime: '14:00',
    formatId: 'custom',
    rules: setup.rules,
    toss: setup.toss,
    status,
    result: null,
    winnerTeamId: null,
    tournamentId: null,
    fixtureId: null,
    teamAPlayers: null,
    teamBPlayers: null,
    resumeDismissedAt: null,
    startedAt: '2026-09-12T14:00:00.000Z',
    completedAt: null,
    createdAt: '2026-09-12T13:50:00.000Z',
    updatedAt: '2026-09-12T14:30:00.000Z',
    ...overrides,
  };
}

export function liveMatch(steps: readonly ScriptStep[], setup: MatchSetup = m3Setup(), options: LiveOptions = {}): LiveMatch {
  const result = playScript(setup, steps, { autoBowlers: true, autoBatters: true, ...options });
  const status = deriveMatchStatus(result.state, 'live');
  return {
    match: matchRow(setup, status, {
      tournamentId: options.tournamentId ?? null,
      result: result.state.result,
      title: options.title ?? `${setup.teams[0].name} v ${setup.teams[1].name}`,
    }),
    setup,
    events: result.events,
    state: result.state,
  };
}

export const OPEN = 'start:L1:L2:T11';

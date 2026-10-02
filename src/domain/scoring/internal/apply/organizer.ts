import type { MatchEventOf, MatchResult, MatchSetup, MatchState, OversRevisionRecord } from '../../../types';
import { appended, extrasOf, thawInnings, type StateDraft } from '../draft';
import { inProgressInnings } from '../eligibility';
import { closeInnings, putInnings } from '../innings';
import { otherTeamId } from '../squad';
import { applyRevisionTo } from './innings';

export function applyPenalty(state: StateDraft, event: MatchEventOf<'penalty_awarded'>): void {
  const target = state.innings[event.inningsIndex];
  if (target === undefined) {
    state.carriedPenalties = appended(state.carriedPenalties, { inningsIndex: event.inningsIndex, teamId: event.teamId, runs: event.runs });
    return;
  }
  const innings = thawInnings(target);
  const extras = innings.extras;
  innings.runs += event.runs;
  innings.extras = extrasOf(extras.wides, extras.noBalls, extras.byes, extras.legByes, extras.penalty + event.runs);
  putInnings(state, innings);
}

export function applyOversRevised(setup: MatchSetup, state: StateDraft, event: MatchEventOf<'overs_revised'>): void {
  const target = state.innings[event.inningsIndex];
  const revision: OversRevisionRecord = {
    seq: event.seq,
    maxBalls: event.maxBalls,
    target: event.target,
    maxOversPerBowler: event.maxOversPerBowler !== undefined ? event.maxOversPerBowler : setup.rules.maxOversPerBowler,
    terminal: event.terminal,
    reason: event.reason,
  };
  if (target === undefined) {
    state.plannedRevisions = appended(
      state.plannedRevisions.filter((entry) => entry.inningsIndex !== event.inningsIndex),
      { inningsIndex: event.inningsIndex, revision: { ...revision, terminal: false }, powerplays: event.powerplays ?? null },
    );
    return;
  }
  const innings = thawInnings(target);
  applyRevisionTo(setup, innings, revision, event.powerplays ?? null, {
    maxOversPerBowler: event.maxOversPerBowler,
    bowlerQuotaMode: event.bowlerQuotaMode,
  });
  if (event.terminal) {
    closeInnings(innings, 'terminated', event.seq);
  }
  putInnings(state, innings);
}

export function applyPlaySuspended(state: StateDraft, event: MatchEventOf<'play_suspended'>): void {
  state.lifecycle = 'paused';
  state.suspension = { reason: event.reason, note: event.note ?? null, sinceSeq: event.seq };
}

export function applyPlayResumed(state: StateDraft): void {
  state.lifecycle = 'live';
  state.suspension = null;
}

function outcomeResult(setup: MatchSetup, state: MatchState, event: MatchEventOf<'match_ended'>): MatchResult {
  const outcome = event.outcome;
  switch (outcome.type) {
    case 'natural':
      return state.naturalResult ?? { type: 'no_result', reason: null };
    case 'tie_decided':
      return {
        type: 'tie',
        decider: { method: outcome.method, winnerTeamId: outcome.winnerTeamId, superOverRounds: state.superOverRound ?? 0 },
      };
    case 'no_result':
      return { type: 'no_result', reason: outcome.reason ?? null };
    case 'abandoned':
      return { type: 'abandoned', reason: outcome.reason ?? null };
    case 'walkover':
      return {
        type: 'walkover',
        winnerTeamId: outcome.winnerTeamId,
        loserTeamId: otherTeamId(setup, outcome.winnerTeamId),
        reason: outcome.reason ?? null,
      };
    case 'awarded':
      return {
        type: 'awarded',
        winnerTeamId: outcome.winnerTeamId,
        loserTeamId: outcome.winnerTeamId === null ? null : otherTeamId(setup, outcome.winnerTeamId),
        reason: outcome.reason,
        margin: outcome.margin ?? null,
      };
    default: {
      const unreachable: never = outcome;
      return unreachable;
    }
  }
}

export function applyMatchEnded(setup: MatchSetup, state: StateDraft, event: MatchEventOf<'match_ended'>): void {
  const result = outcomeResult(setup, state, event);
  const open = inProgressInnings(state);
  if (open !== null) {
    const innings = thawInnings(open);
    closeInnings(innings, 'match_ended', event.seq);
    putInnings(state, innings);
  }
  state.result = result;
  state.lifecycle = result.type === 'abandoned' ? 'abandoned' : 'completed';
  state.suspension = null;
}

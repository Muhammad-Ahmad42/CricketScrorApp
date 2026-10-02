import { buildEvents, currentInnings, scoreRuns, wicket, type ScoringIntent } from '@/domain/scoring';
import { planInningsBalls } from '@/domain/scoring/testing';
import type { MatchId, MatchSetup, MatchState, PlayerId, TeamId } from '@/domain/types';
import type { AppServices, LiveMatch } from '../../contracts';
import { expectOk } from './app';

export async function live(app: AppServices, matchId: MatchId): Promise<LiveMatch> {
  return expectOk(await app.matches.load(matchId));
}

export async function score(app: AppServices, matchId: MatchId, intent: ScoringIntent): Promise<MatchState> {
  const current = await live(app, matchId);
  const built = buildEvents(current.setup, current.state, intent);
  if (!built.ok) {
    throw new Error(`Intent ${JSON.stringify(intent)} rejected: ${built.code} ${built.message}`);
  }
  return expectOk(await app.matches.record(matchId, current.state.lastSeq, built.events)).state;
}

export async function scoreAll(app: AppServices, matchId: MatchId, intents: readonly ScoringIntent[]): Promise<MatchState> {
  let state: MatchState | null = null;
  for (const intent of intents) {
    state = await score(app, matchId, intent);
  }
  if (state === null) {
    throw new Error('No intents');
  }
  return state;
}

function battingPlayers(setup: MatchSetup, teamId: TeamId): readonly PlayerId[] {
  return setup.players.filter((player) => player.teamId === teamId && !player.isSubstitute).map((player) => player.playerId);
}

function otherTeam(setup: MatchSetup, teamId: TeamId): TeamId {
  return setup.teams[0].id === teamId ? setup.teams[1].id : setup.teams[0].id;
}

async function autoFill(app: AppServices, matchId: MatchId): Promise<LiveMatch> {
  for (let guard = 0; guard < 4; guard += 1) {
    const current = await live(app, matchId);
    const pending = current.state.pendingAction;
    if (pending?.type === 'select_next_batter' && pending.candidates.length > 0) {
      await score(app, matchId, { type: 'batter_in', playerId: pending.candidates[0], position: pending.position });
      continue;
    }
    if (pending?.type === 'select_next_bowler') {
      const innings = currentInnings(current.state);
      const overs = (playerId: PlayerId) => innings?.bowling.find((row) => row.playerId === playerId)?.oversUsed ?? 0;
      const ranked = [...pending.eligible].sort((a, b) => overs(a) - overs(b));
      await score(app, matchId, { type: 'select_bowler', bowlerId: ranked[0], reason: 'over_start' });
      continue;
    }
    return current;
  }
  return live(app, matchId);
}

export async function startInnings(app: AppServices, matchId: MatchId, battingTeamId?: TeamId): Promise<MatchState> {
  const current = await live(app, matchId);
  const pending = current.state.pendingAction;
  const batting = battingTeamId ?? (pending?.type === 'start_next_innings' ? pending.suggestedBattingTeamId : null) ?? current.setup.teams[0].id;
  const openers = battingPlayers(current.setup, batting);
  const bowlers = [...battingPlayers(current.setup, otherTeam(current.setup, batting))].reverse();
  return score(app, matchId, { type: 'start_innings', strikerId: openers[0], nonStrikerId: openers[1], bowlerId: bowlers[0], battingTeamId: batting });
}

export type Ball = number | 'W';

export async function playBalls(app: AppServices, matchId: MatchId, balls: readonly Ball[]): Promise<MatchState> {
  let state: MatchState | null = null;
  for (const ball of balls) {
    await autoFill(app, matchId);
    state = await score(app, matchId, ball === 'W' ? wicket({ dismissal: 'bowled' }) : scoreRuns(ball));
  }
  const filled = await autoFill(app, matchId);
  return state ?? filled.state;
}

export interface InningsLine {
  readonly runs: number;
  readonly wickets: number;
  readonly balls: number;
}

export async function playLine(app: AppServices, matchId: MatchId, line: InningsLine): Promise<MatchState> {
  const current = await live(app, matchId);
  const innings = currentInnings(current.state);
  if (innings === null) {
    throw new Error('No innings in progress');
  }
  const balls = planInningsBalls(line, innings.limits.maxWickets, innings.target?.runs ?? null, innings.runs);
  return playBalls(app, matchId, balls);
}

export async function closeIfPossible(app: AppServices, matchId: MatchId): Promise<MatchState> {
  const current = await live(app, matchId);
  const innings = currentInnings(current.state);
  if (innings !== null && innings.status === 'in_progress' && current.state.pendingAction === null) {
    return score(app, matchId, { type: 'end_innings', reason: 'declared' });
  }
  return current.state;
}

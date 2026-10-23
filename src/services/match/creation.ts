import { checkSquadSizes, initialMatchState, validateRules, type SquadSizeSide } from '@/domain/scoring';
import type { IsoDateTime, Match, MatchEventInput, MatchId, NewMatchInput, Team } from '@/domain/types';
import type { Repositories } from '@/db';
import type { ServiceContext } from '../core/context';
import { failure } from '../core/result';
import { isIsoDate, isLocalTime, trimmedOrNull } from '../core/values';
import { commitLog, type CommittedLog } from './commit';
import { appendPayloads } from './matchLog';

function assertSideSize(value: number | null, label: string): void {
  if (value !== null && (!Number.isInteger(value) || value < 2 || value > 15)) {
    throw failure('VALIDATION', `${label} must have between 2 and 15 players.`);
  }
}

export function validateNewMatch(input: NewMatchInput): void {
  if (input.teamAId === input.teamBId) {
    throw failure('VALIDATION', 'Choose two different teams.');
  }
  const ruleError = validateRules(input.rules).find((issue) => issue.severity === 'error');
  if (ruleError !== undefined) {
    throw failure('VALIDATION', ruleError.message, { domainCode: ruleError.code });
  }
  if (input.scheduledDate !== null && !isIsoDate(input.scheduledDate)) {
    throw failure('VALIDATION', 'Enter the match date as YYYY-MM-DD.');
  }
  if (input.scheduledTime !== null && !isLocalTime(input.scheduledTime)) {
    throw failure('VALIDATION', 'Enter the start time as HH:MM.');
  }
  assertSideSize(input.teamAPlayers, 'Team A');
  assertSideSize(input.teamBPlayers, 'Team B');
  if (input.toss !== null && input.toss.winnerTeamId !== input.teamAId && input.toss.winnerTeamId !== input.teamBId) {
    throw failure('VALIDATION', 'The toss winner must be one of the two teams.');
  }
  const seen = new Set<string>();
  for (const squad of input.squads) {
    if (squad.teamId !== input.teamAId && squad.teamId !== input.teamBId) {
      throw failure('VALIDATION', 'A squad can only belong to one of the two teams.');
    }
    for (const entry of squad.players) {
      if (seen.has(entry.playerId)) {
        throw failure('VALIDATION', 'A player can only be in one squad, once.');
      }
      seen.add(entry.playerId);
    }
  }
}

export async function assertSquadSizes(repos: Repositories, input: NewMatchInput): Promise<void> {
  const sides: SquadSizeSide[] = [];
  for (const [teamId, sideSize, fallback] of [
    [input.teamAId, input.teamAPlayers, 'Team A'],
    [input.teamBId, input.teamBPlayers, 'Team B'],
  ] as const) {
    const entries = input.squads.filter((squad) => squad.teamId === teamId).flatMap((squad) => squad.players);
    if (entries.length === 0) {
      continue;
    }
    const team = await repos.teams.get(teamId);
    sides.push({ teamId, teamName: team?.name ?? fallback, selected: entries.filter((entry) => !entry.isSubstitute).length, sideSize });
  }
  const tooLarge = checkSquadSizes(input.rules, sides).find((issue) => issue.code === 'SQUAD_TOO_LARGE');
  if (tooLarge !== undefined) {
    throw failure('VALIDATION', tooLarge.message, { domainCode: tooLarge.code });
  }
}

async function teamOrFail(repos: Repositories, teamId: string): Promise<Team> {
  const team = await repos.teams.get(teamId);
  if (team === null) {
    throw failure('NOT_FOUND', 'One of the teams no longer exists.');
  }
  return team;
}

export async function newMatchRow(repos: Repositories, input: NewMatchInput, id: MatchId, now: IsoDateTime): Promise<Match> {
  const [teamA, teamB] = await Promise.all([teamOrFail(repos, input.teamAId), teamOrFail(repos, input.teamBId)]);
  return {
    id,
    title: trimmedOrNull(input.title) ?? `${teamA.name} v ${teamB.name}`,
    teamAId: input.teamAId,
    teamBId: input.teamBId,
    venueId: input.venueId,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    formatId: input.formatId,
    rules: input.rules,
    toss: input.toss,
    status: 'scheduled',
    result: null,
    winnerTeamId: null,
    tournamentId: input.tournamentId,
    fixtureId: input.fixtureId,
    teamAPlayers: input.teamAPlayers,
    teamBPlayers: input.teamBPlayers,
    resumeDismissedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function startLog(
  ctx: ServiceContext,
  repos: Repositories,
  match: Match,
  payloads: readonly MatchEventInput[],
  now: IsoDateTime,
): Promise<CommittedLog> {
  const setup = await repos.matches.getSetup(match.id);
  if (setup === null) {
    throw failure('NOT_FOUND', 'The match could not be created.');
  }
  const empty = initialMatchState(setup);
  const before = { match, setup, events: [], state: empty };
  if (payloads.length === 0) {
    return commitLog(ctx, repos, { before, match, setup, events: [], state: empty, now, appended: false });
  }
  const appended = appendPayloads(setup, empty, payloads, { ids: ctx.ids, recordedAt: now });
  await repos.events.append(appended.events);
  return commitLog(ctx, repos, { before, match, setup, events: appended.events, state: appended.state, now, appended: true });
}

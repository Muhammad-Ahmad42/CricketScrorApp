import type { FormResult, StandingRow, TeamId, TieBreakNote } from '../../types';
import { aggregateNrr } from '../nrr';
import type { TeamNrrAggregate } from '../nrr';
import type { StandingsInput, StandingsMember } from '../standings';
import { rankTeams } from '../tiebreakers';
import type { HeadToHeadRecord, RankContext, RankedTeam, TeamRecord } from '../tiebreakers';
import { aggregateFigureSets } from './nrrFigures';
import { isActiveOverride, isSettledStatus, sideKey } from './sides';
import { collectCountedResults, droppedKey, droppedResults, sideOutcomeFor } from './tableResults';
import type { CountedResult } from './tableResults';

interface RowFigures {
  readonly played: number;
  readonly won: number;
  readonly lost: number;
  readonly tied: number;
  readonly noResult: number;
  readonly resultPoints: number;
  readonly bonusPoints: number;
  readonly adjustment: number;
  readonly aggregate: TeamNrrAggregate | null;
  readonly wicketsTaken: number;
  readonly form: readonly FormResult[];
}

function pointsAdjustment(input: StandingsInput, teamId: TeamId): number {
  let total = 0;
  for (const override of input.overrides) {
    if (override.kind !== 'points_adjustment' || !isActiveOverride(override)) continue;
    if (override.stageId !== input.stageId || override.teamId !== teamId) continue;
    if (override.poolId !== null && input.poolId !== null && override.poolId !== input.poolId) continue;
    total += override.points;
  }
  return total;
}

function rowFigures(input: StandingsInput, row: TeamId, results: readonly CountedResult[]): RowFigures {
  const counts = { W: 0, L: 0, T: 0, N: 0 };
  let resultPoints = 0;
  let bonusPoints = 0;
  let wicketsTaken = 0;
  const form: FormResult[] = [];
  for (const result of results) {
    const outcome = sideOutcomeFor(result, row);
    if (!outcome) continue;
    counts[outcome.column] += 1;
    resultPoints += outcome.points;
    bonusPoints += outcome.bonus;
    form.push(outcome.column);
    if (result.figures === null) continue;
    for (const innings of result.summary.innings.slice(0, 2)) {
      if (innings.bowlingTeamId === row) wicketsTaken += innings.wickets;
    }
  }
  return {
    played: results.length,
    won: counts.W,
    lost: counts.L,
    tied: counts.T,
    noResult: counts.N,
    resultPoints,
    bonusPoints,
    adjustment: pointsAdjustment(input, row),
    aggregate: aggregateFigureSets(
      row,
      results.flatMap((result) => (result.figures ? [result.figures] : [])),
    ),
    wicketsTaken,
    form: form.slice(-5),
  };
}

function headToHeadFactory(input: StandingsInput, counted: readonly CountedResult[]): RankContext['headToHead'] {
  const cache = new Map<string, ReturnType<RankContext['headToHead']>>();
  return (teamIds) => {
    const key = [...teamIds].sort().join('|');
    const hit = cache.get(key);
    if (hit) return hit;
    const ids = new Set(teamIds);
    const mutual = counted.filter((result) => result.rowA !== null && result.rowB !== null && ids.has(result.rowA) && ids.has(result.rowB));
    const nrr = aggregateNrr(
      mutual.map((result) => result.summary),
      teamIds,
      input.rules.nrr,
      { restrictToTeams: true },
    );
    const records = new Map<TeamId, HeadToHeadRecord>();
    for (const teamId of teamIds) {
      let points = 0;
      let wins = 0;
      let matchesPlayed = 0;
      for (const result of mutual) {
        const outcome = sideOutcomeFor(result, teamId);
        if (!outcome) continue;
        points += outcome.points;
        wins += outcome.column === 'W' ? 1 : 0;
        matchesPlayed += 1;
      }
      records.set(teamId, { points, wins, matchesPlayed, nrr: nrr.get(teamId)?.nrr ?? null });
    }
    const pairs = new Set(mutual.map((result) => [result.rowA, result.rowB].sort().join('|')));
    const complete = teamIds.every((x, i) => teamIds.slice(i + 1).every((y) => pairs.has([x, y].sort().join('|'))));
    const value = { records, complete };
    cache.set(key, value);
    return value;
  };
}

type RemainingCounter = (member: StandingsMember) => number;

function remainingCounter(input: StandingsInput): RemainingCounter {
  const open = input.fixtures
    .filter((fixture) => !isSettledStatus(fixture.status))
    .map((fixture) => {
      const teams = input.fixtureTeams(fixture);
      const keys = new Set([sideKey(fixture.sideA), sideKey(fixture.sideB)]);
      if (teams.a !== null) keys.add(`team:${teams.a}`);
      if (teams.b !== null) keys.add(`team:${teams.b}`);
      return keys;
    });
  const counts = new Map<string, number>();
  open.forEach((keys) => keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1)));
  return (member) => {
    const own = sideKey(member.side);
    const team = member.teamId === null ? own : `team:${member.teamId}`;
    if (team === own) return counts.get(own) ?? 0;
    return open.filter((keys) => keys.has(own) || keys.has(team)).length;
  };
}

function noteFor(ranked: RankedTeam, below: RankedTeam | undefined): TieBreakNote | null {
  if (!below) return null;
  return {
    separatedBy: ranked.separatedBy === 'points' ? null : ranked.separatedBy,
    aboveTeamId: below.teamId,
    detail: ranked.detail,
    headline: ranked.headline,
  };
}

function emptyRow(member: StandingsMember, position: number, remaining: number): StandingRow {
  return {
    position,
    sharedPosition: false,
    side: member.side,
    slotLabel: member.slotLabel,
    teamId: null,
    provisional: member.provisional,
    membership: member.membership,
    played: 0,
    won: 0,
    lost: 0,
    tied: 0,
    noResult: 0,
    points: 0,
    pointsAdjustment: 0,
    bonusPoints: 0,
    runsScored: 0,
    ballsFaced: 0,
    runsConceded: 0,
    ballsBowled: 0,
    oversFaced: 0,
    oversBowled: 0,
    runRate: null,
    nrr: null,
    matchesRemaining: remaining,
    form: [],
    qualification: null,
    tieBreak: null,
  };
}

function resolvedRow(member: StandingsMember, teamId: TeamId, figures: RowFigures, ranked: RankedTeam, note: TieBreakNote | null, remaining: number): StandingRow {
  const aggregate = figures.aggregate;
  const oversFaced = aggregate?.oversFor ?? 0;
  const runsScored = aggregate?.runsFor ?? 0;
  return {
    position: ranked.position,
    sharedPosition: ranked.shared,
    side: member.side,
    slotLabel: member.slotLabel,
    teamId,
    provisional: member.provisional,
    membership: member.membership,
    played: figures.played,
    won: figures.won,
    lost: figures.lost,
    tied: figures.tied,
    noResult: figures.noResult,
    points: figures.resultPoints + figures.adjustment,
    pointsAdjustment: figures.adjustment,
    bonusPoints: figures.bonusPoints,
    runsScored,
    ballsFaced: aggregate?.ballsFor ?? 0,
    runsConceded: aggregate?.runsAgainst ?? 0,
    ballsBowled: aggregate?.ballsAgainst ?? 0,
    oversFaced,
    oversBowled: aggregate?.oversAgainst ?? 0,
    runRate: oversFaced > 0 ? runsScored / oversFaced : null,
    nrr: aggregate?.nrr ?? null,
    matchesRemaining: remaining,
    form: figures.form,
    qualification: null,
    tieBreak: note,
  };
}

function uniqueResolvedMembers(members: readonly StandingsMember[]): {
  readonly resolved: readonly (StandingsMember & { readonly teamId: TeamId })[];
  readonly unresolved: readonly StandingsMember[];
} {
  const seen = new Set<TeamId>();
  const resolved: (StandingsMember & { readonly teamId: TeamId })[] = [];
  const unresolved: StandingsMember[] = [];
  for (const member of members) {
    const teamId = member.teamId;
    if (teamId === null || seen.has(teamId)) {
      unresolved.push(teamId === null ? member : { ...member, teamId: null, provisional: false });
      continue;
    }
    seen.add(teamId);
    resolved.push({ ...member, teamId });
  }
  return { resolved, unresolved };
}

export function buildStandingRows(input: StandingsInput): {
  readonly rows: readonly StandingRow[];
  readonly provisionalTies: readonly (readonly TeamId[])[];
} {
  const counted = collectCountedResults(input);
  const { resolved, unresolved } = uniqueResolvedMembers(input.members);
  const dropped = droppedResults(
    input,
    counted,
    resolved.map((member) => member.teamId),
  );
  const byRow = new Map<TeamId, CountedResult[]>();
  for (const result of counted) {
    for (const row of new Set([result.rowA, result.rowB])) {
      if (row === null || dropped.has(droppedKey(row, result.fixture.id))) continue;
      const list = byRow.get(row);
      if (list) list.push(result);
      else byRow.set(row, [result]);
    }
  }
  const entries = resolved.map((member) => ({ member, figures: rowFigures(input, member.teamId, byRow.get(member.teamId) ?? []) }));
  const perMatch = input.normalization === 'per_match_average';
  const records: TeamRecord[] = entries.map(({ member, figures }) => {
    const points = figures.resultPoints + figures.adjustment;
    return {
      teamId: member.teamId,
      points: perMatch ? (figures.played > 0 ? points / figures.played : Number.NEGATIVE_INFINITY) : points,
      played: figures.played,
      won: figures.won,
      lost: figures.lost,
      tied: figures.tied,
      noResult: figures.noResult,
      nrr: figures.aggregate?.nrr ?? null,
      runsScored: figures.aggregate?.runsFor ?? 0,
      wicketsTaken: figures.wicketsTaken,
      seed: input.seeds.get(member.teamId) ?? null,
      name: input.teamNames.get(member.teamId) ?? member.teamId,
    };
  });
  const ranked = rankTeams(records, input.rules.tieBreakers, {
    headToHead: headToHeadFactory(input, counted),
    headToHeadRequiresCompleteMiniLeague: input.rules.headToHeadRequiresCompleteMiniLeague,
    resolutions: input.overrides.filter(
      (override): override is Extract<typeof override, { readonly kind: 'tie_resolution' }> =>
        override.kind === 'tie_resolution' && isActiveOverride(override) && override.stageId === input.stageId && override.poolId === input.poolId,
    ),
  });
  const byTeam = new Map(entries.map((entry) => [entry.member.teamId, entry]));
  const remaining = remainingCounter(input);
  const rows: StandingRow[] = ranked.flatMap((rankedTeam, index) => {
    const entry = byTeam.get(rankedTeam.teamId);
    if (!entry) return [];
    return [
      resolvedRow(entry.member, rankedTeam.teamId, entry.figures, rankedTeam, noteFor(rankedTeam, ranked[index + 1]), remaining(entry.member)),
    ];
  });
  const sortedUnresolved = [...unresolved].sort((a, b) => compareLabels(a.slotLabel, b.slotLabel));
  sortedUnresolved.forEach((member, index) => rows.push(emptyRow(member, ranked.length + index + 1, remaining(member))));
  return { rows, provisionalTies: levelGroups(ranked) };
}

function compareLabels(a: string | null, b: string | null): number {
  const x = a ?? '';
  const y = b ?? '';
  if (x === y) return 0;
  return x < y ? -1 : 1;
}

export function levelGroups(ranked: readonly { readonly teamId: TeamId; readonly position: number; readonly shared: boolean }[]): TeamId[][] {
  const groups = new Map<number, TeamId[]>();
  for (const entry of ranked) {
    if (!entry.shared) continue;
    const group = groups.get(entry.position) ?? [];
    group.push(entry.teamId);
    groups.set(entry.position, group);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

import { inningsSummary, summary, winByRuns } from '@/domain/scoring/testing';
import { evaluateTournament, resolveFixtureTeams } from '@/domain/tournament/evaluate';
import { draftsFromRoundRobin, knockoutBracket, roundRobin } from '@/domain/tournament/fixtures';
import { seedEntrants } from '@/domain/tournament/knockout';
import { DEFAULT_STAGE_CONFIGS } from '@/domain/tournament/defaults';
import { builtinTemplates, instantiateTemplate } from '@/domain/tournament/templates';
import type {
  Fixture,
  FixtureDraft,
  FixtureSide,
  MatchSummary,
  PoolEntry,
  SlotSource,
  StageSlot,
  TeamId,
  TournamentEvaluation,
  TournamentSnapshot,
  TournamentStatus,
  TournamentTeamView,
} from '@/domain/types';

export const AT = '2026-09-01T10:00:00.000Z';
export const T_ID = 't1';
export const POOL_A_IDS = ['LIO', 'TIG', 'EAG', 'HAW'] as const;
export const POOL_B_IDS = ['BUL', 'BEA', 'COB', 'WOL'] as const;
export const TEAM_NAMES: Readonly<Record<string, string>> = {
  LIO: 'Lions',
  TIG: 'Tigers',
  EAG: 'Eagles',
  HAW: 'Hawks',
  BUL: 'Bulls',
  BEA: 'Bears',
  COB: 'Cobras',
  WOL: 'Wolves',
};

export function counter(prefix: string): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}${next}`;
  };
}

export const teamSide = (teamId: TeamId): FixtureSide => ({ kind: 'team', teamId });

export function teamView(teamId: TeamId, name: string = TEAM_NAMES[teamId] ?? teamId, seed: number | null = null): TournamentTeamView {
  return {
    membership: {
      id: `tt-${teamId}`,
      tournamentId: T_ID,
      teamId,
      seed,
      status: 'active',
      replacedByTeamId: null,
      inheritsFromTeamId: null,
      joinedAt: AT,
    },
    team: {
      id: teamId,
      name,
      shortName: teamId.slice(0, 3),
      logoUri: null,
      captainId: null,
      createdAt: AT,
      updatedAt: AT,
      archivedAt: null,
    },
  };
}

export function asFixture(draft: FixtureDraft): Fixture {
  return { ...draft, matchId: null, matchSides: null, createdAt: AT, updatedAt: AT };
}

function poolPosition(source: SlotSource, poolIds: readonly string[]): { readonly poolIndex: number | null; readonly poolPosition: number | null } {
  if (source.kind !== 'pool_position') {
    return { poolIndex: null, poolPosition: null };
  }
  return { poolIndex: poolIds.indexOf(source.poolId), poolPosition: source.position };
}

export interface CupOptions {
  readonly status?: TournamentStatus;
  readonly withFixtures?: boolean;
}

export function cupSnapshot(options: CupOptions = {}): TournamentSnapshot {
  const template = builtinTemplates().find((candidate) => candidate.id === 'builtin:8-team-t20');
  if (!template) {
    throw new Error('8-team-t20 template missing');
  }
  const ids = counter('x');
  const structure = instantiateTemplate(template, { tournamentId: T_ID, now: AT, ids });
  const [groups, knockout] = [...structure.stages].sort((a, b) => a.orderIndex - b.orderIndex);
  const pools = structure.pools.filter((pool) => pool.stageId === groups.id).sort((a, b) => a.orderIndex - b.orderIndex);
  const poolIds = pools.map((pool) => pool.id);
  const poolEntries: PoolEntry[] = [POOL_A_IDS, POOL_B_IDS].flatMap((teams, poolIndex) =>
    teams.map((teamId) => ({ id: `pe-${teamId}`, poolId: poolIds[poolIndex], stageId: groups.id, side: teamSide(teamId), seed: null })),
  );
  const withFixtures = options.withFixtures ?? true;
  const fixtureIds = counter('f');
  const groupFixtures: Fixture[] = withFixtures
    ? [POOL_A_IDS, POOL_B_IDS].flatMap((teams, poolIndex) =>
        draftsFromRoundRobin(
          roundRobin(teams.map(teamSide), 1),
          {
            tournamentId: T_ID,
            stageId: groups.id,
            poolId: poolIds[poolIndex],
            formatId: null,
            matchRules: null,
            venueId: null,
            startMatchNumber: poolIndex * 6 + 1,
          },
          fixtureIds,
        ).map(asFixture),
      )
    : [];
  const entrySlots = structure.slots.filter((slot) => slot.stageId === knockout.id && slot.role === 'entry');
  const order = seedEntrants(
    entrySlots.map((slot) => ({ side: { kind: 'slot', slotId: slot.id }, rank: null, ...poolPosition(slot.source, poolIds) })),
    'fixed',
    null,
  );
  const bracket = knockoutBracket(
    order,
    {
      thirdPlacePlayoff: false,
      rounds: null,
      firstSlotIndex: entrySlots.length,
      defaults: { tournamentId: T_ID, stageId: knockout.id, poolId: null, formatId: null, matchRules: null, venueId: null, startMatchNumber: 13 },
    },
    counter('k'),
  );
  const seeds = new Map(bracket.entrySlotSeeds.map((entry) => [entry.slotId, entry.seed]));
  const slots: StageSlot[] = withFixtures
    ? [...structure.slots.map((slot) => ({ ...slot, seed: seeds.get(slot.id) ?? slot.seed })), ...bracket.slots]
    : [...structure.slots];
  const knockoutFixtures = withFixtures ? bracket.fixtures.map(asFixture) : [];
  return {
    version: 'v1',
    tournament: {
      id: T_ID,
      name: 'City Cup',
      season: '2026',
      description: null,
      logoUri: null,
      organizer: 'Lahore CA',
      contact: null,
      location: null,
      notes: null,
      startDate: '2026-09-12',
      endDate: '2026-10-04',
      venueIds: [],
      structureKind: 'groups_knockout',
      status: options.status ?? 'active',
      createdAt: AT,
      updatedAt: AT,
    },
    rules: structure.rules,
    teams: [...POOL_A_IDS, ...POOL_B_IDS].map((teamId) => teamView(teamId)),
    stages: structure.stages,
    pools: structure.pools,
    poolEntries,
    slots,
    fixtures: [...groupFixtures, ...knockoutFixtures],
    summaries: {},
    staleSummaryMatchIds: [],
    overrides: [],
  };
}

export function oneOverWin(matchId: string, teamAId: TeamId, teamBId: TeamId, winner: TeamId, runs = 6): MatchSummary {
  const loser = winner === teamAId ? teamBId : teamAId;
  return summary({
    matchId,
    teamAId,
    teamBId,
    result: winByRuns(winner, loser, runs),
    innings: [
      inningsSummary({ inningsIndex: 0, battingTeamId: winner, bowlingTeamId: loser, runs, wickets: 0, legalBalls: 6, allottedBalls: 6 }),
      inningsSummary({ inningsIndex: 1, battingTeamId: loser, bowlingTeamId: winner, runs: 0, wickets: 0, legalBalls: 6, allottedBalls: 6, target: runs + 1 }),
    ],
    completedAt: AT,
  });
}

function involves(fixture: Fixture, a: TeamId, b: TeamId): boolean {
  const ids = [fixture.sideA, fixture.sideB].map((side) => (side.kind === 'team' ? side.teamId : null));
  return ids.includes(a) && ids.includes(b);
}

export function playFixture(
  snapshot: TournamentSnapshot,
  fixtureId: string,
  teamAId: TeamId,
  teamBId: TeamId,
  winner: TeamId,
  runs = 6,
): TournamentSnapshot {
  const matchId = `m-${fixtureId}`;
  const result = oneOverWin(matchId, teamAId, teamBId, winner, runs);
  return {
    ...snapshot,
    version: `${snapshot.version}+`,
    fixtures: snapshot.fixtures.map((fixture) =>
      fixture.id === fixtureId ? { ...fixture, status: 'completed', matchId, matchSides: { teamAId, teamBId } } : fixture,
    ),
    summaries: { ...snapshot.summaries, [matchId]: result },
  };
}

export function playPair(snapshot: TournamentSnapshot, a: TeamId, b: TeamId, winner: TeamId, runs = 6): TournamentSnapshot {
  const fixture = snapshot.fixtures.find((candidate) => candidate.status === 'scheduled' && involves(candidate, a, b));
  if (!fixture) {
    throw new Error(`No fixture between ${a} and ${b}`);
  }
  const teamAId = fixture.sideA.kind === 'team' ? fixture.sideA.teamId : a;
  const teamBId = fixture.sideB.kind === 'team' ? fixture.sideB.teamId : b;
  return playFixture(snapshot, fixture.id, teamAId, teamBId, winner, runs);
}

export const GROUP_RESULTS: readonly (readonly [TeamId, TeamId])[] = [
  ['LIO', 'TIG'],
  ['LIO', 'EAG'],
  ['LIO', 'HAW'],
  ['TIG', 'EAG'],
  ['TIG', 'HAW'],
  ['EAG', 'HAW'],
  ['BUL', 'BEA'],
  ['BUL', 'COB'],
  ['BUL', 'WOL'],
  ['BEA', 'COB'],
  ['BEA', 'WOL'],
  ['COB', 'WOL'],
];

export function playGroups(snapshot: TournamentSnapshot, count: number = GROUP_RESULTS.length): TournamentSnapshot {
  return GROUP_RESULTS.slice(0, count).reduce((current, [winner, loser]) => playPair(current, winner, loser, winner), snapshot);
}

export interface Evaluated {
  readonly snapshot: TournamentSnapshot;
  readonly evaluation: TournamentEvaluation;
}

export function evaluated(snapshot: TournamentSnapshot): Evaluated {
  return { snapshot, evaluation: evaluateTournament(snapshot) };
}

export function playBracket(snapshot: TournamentSnapshot, round: number, position: number, winner: 'a' | 'b'): TournamentSnapshot {
  const fixture = snapshot.fixtures.find((candidate) => candidate.bracket?.round === round && candidate.bracket.position === position);
  if (!fixture) {
    throw new Error(`No bracket fixture at ${round}:${position}`);
  }
  const teams = resolveFixtureTeams(evaluateTournament(snapshot), fixture);
  if (teams.a === null || teams.b === null) {
    throw new Error(`Bracket fixture ${round}:${position} is not resolved yet`);
  }
  return playFixture(snapshot, fixture.id, teams.a, teams.b, winner === 'a' ? teams.a : teams.b);
}

export function playToChampion(snapshot: TournamentSnapshot): TournamentSnapshot {
  const groups = playGroups(snapshot);
  const semis = playBracket(playBracket(groups, 1, 0, 'a'), 1, 1, 'a');
  return playBracket(semis, 2, 0, 'a');
}

export function leagueSnapshot(teamCount: number): TournamentSnapshot {
  const base = cupSnapshot({ withFixtures: false });
  const teamIds = Array.from({ length: teamCount }, (_, index) => `T${String(index + 1).padStart(3, '0')}`);
  const stage = {
    ...base.stages[0],
    id: 'league',
    name: 'League',
    type: 'league' as const,
    orderIndex: 0,
    config: { ...DEFAULT_STAGE_CONFIGS.league, decidesChampion: true },
  };
  return {
    ...base,
    tournament: { ...base.tournament, structureKind: 'league' },
    teams: teamIds.map((teamId, index) => teamView(teamId, `Team ${index + 1}`)),
    stages: [stage],
    pools: [{ id: 'league-pool', stageId: 'league', name: 'League', orderIndex: 0, legs: null }],
    poolEntries: teamIds.map((teamId) => ({ id: `pe-${teamId}`, poolId: 'league-pool', stageId: 'league', side: teamSide(teamId), seed: null })),
    slots: [],
    fixtures: [],
  };
}

export function knockoutSnapshot(teamCount: number, thirdPlacePlayoff = false): TournamentSnapshot {
  const base = cupSnapshot({ withFixtures: false });
  const teamIds = Array.from({ length: teamCount }, (_, index) => `K${index + 1}`);
  const stage = {
    ...base.stages[0],
    id: 'ko',
    name: 'Knockout',
    type: 'knockout' as const,
    orderIndex: 0,
    config: { ...DEFAULT_STAGE_CONFIGS.knockout, decidesChampion: true },
  };
  const plan = knockoutBracket(
    teamIds.map(teamSide),
    {
      thirdPlacePlayoff,
      rounds: null,
      firstSlotIndex: 0,
      defaults: { tournamentId: T_ID, stageId: 'ko', poolId: null, formatId: null, matchRules: null, venueId: null, startMatchNumber: 1 },
    },
    counter('b'),
  );
  return {
    ...base,
    tournament: { ...base.tournament, structureKind: 'knockout' },
    teams: teamIds.map((teamId, index) => teamView(teamId, `Seed ${index + 1}`, index + 1)),
    stages: [stage],
    pools: [],
    poolEntries: [],
    slots: plan.slots,
    fixtures: plan.fixtures.map(asFixture),
  };
}

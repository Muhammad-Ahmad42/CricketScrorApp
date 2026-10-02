import type {
  AuditEvent,
  Fixture,
  FixtureSide,
  Match,
  MatchEvent,
  MatchSquadEntry,
  Pool,
  PoolEntry,
  Stage,
  StageConfig,
  StageSlot,
  TeamId,
  Tournament,
  TournamentOverride,
  TournamentRules,
  TournamentTeam,
  Venue,
} from '@/domain/types';
import { createRepositories } from '../repositories';
import type { MatchProjection } from '../repositories/contracts';
import type { SqlDatabase } from '../types';
import {
  TEST_MATCH_RULES,
  buildMatch,
  buildTeamSeed,
  buildTournament,
  buildTournamentRules,
  buildVenue,
  isoAt,
  squadsFor,
  type TeamSeed,
} from './builders';
import { goldenMatchEvents, goldenProjection, goldenResult, type GoldenMatchOptions } from './goldenMatch';

export interface ScenarioMatch {
  readonly match: Match;
  readonly squads: readonly { readonly teamId: TeamId; readonly players: readonly MatchSquadEntry[] }[];
  readonly events: readonly MatchEvent[];
  readonly projection: MatchProjection;
}

export interface TournamentScenario {
  readonly venues: readonly Venue[];
  readonly teams: readonly TeamSeed[];
  readonly tournament: Tournament;
  readonly rules: TournamentRules;
  readonly tournamentTeams: readonly TournamentTeam[];
  readonly stages: readonly Stage[];
  readonly pools: readonly Pool[];
  readonly slots: readonly StageSlot[];
  readonly poolEntries: readonly PoolEntry[];
  readonly fixtures: readonly Fixture[];
  readonly matches: readonly ScenarioMatch[];
  readonly overrides: readonly TournamentOverride[];
  readonly audit: readonly AuditEvent[];
  readonly championTeamIds: readonly TeamId[];
}

export function stageConfig(overrides: Partial<StageConfig> = {}): StageConfig {
  return {
    fixtureGeneration: { method: 'round_robin', legs: 1 },
    seeding: 'fixed',
    seedingSeed: null,
    seedingNormalization: 'raw',
    pointsSystem: null,
    tieBreakers: null,
    headToHeadRequiresCompleteMiniLeague: false,
    nrr: null,
    entryRules: [],
    knockout: null,
    abandonedMatches: 'no_result',
    decidesChampion: false,
    formatId: null,
    matchRules: null,
    ...overrides,
  };
}

const team = (teamId: TeamId): FixtureSide => ({ kind: 'team', teamId });
const slot = (slotId: string): FixtureSide => ({ kind: 'slot', slotId });

interface ScenarioIds {
  readonly p: string;
  readonly lio: string;
  readonly tig: string;
  readonly eag: string;
  readonly haw: string;
  readonly groups: string;
  readonly ko: string;
  readonly poolA: string;
  readonly poolB: string;
  readonly venue1: string;
  readonly venue2: string;
}

function scenarioIds(p: string): ScenarioIds {
  return {
    p,
    lio: `${p}-lio`,
    tig: `${p}-tig`,
    eag: `${p}-eag`,
    haw: `${p}-haw`,
    groups: `${p}-groups`,
    ko: `${p}-ko`,
    poolA: `${p}-pool-a`,
    poolB: `${p}-pool-b`,
    venue1: `${p}-venue-1`,
    venue2: `${p}-venue-2`,
  };
}

function buildStructure(ids: ScenarioIds): Pick<TournamentScenario, 'stages' | 'pools' | 'slots' | 'poolEntries'> {
  const at = isoAt(60);
  const stages: Stage[] = [
    {
      id: ids.groups,
      tournamentId: ids.p,
      name: 'Group stage',
      type: 'group',
      orderIndex: 0,
      status: 'completed',
      config: stageConfig(),
      createdAt: at,
      updatedAt: at,
    },
    {
      id: ids.ko,
      tournamentId: ids.p,
      name: 'Knockouts',
      type: 'knockout',
      orderIndex: 1,
      status: 'completed',
      config: stageConfig({
        fixtureGeneration: { method: 'knockout', legs: 1 },
        entryRules: [{ kind: 'top_per_pool', sourceStageId: ids.groups, count: 2, fromPosition: 1 }],
        knockout: { thirdPlacePlayoff: false, rounds: null, tiedMatch: 'super_over', noResult: 'higher_seed' },
        decidesChampion: true,
      }),
      createdAt: at,
      updatedAt: at,
    },
  ];
  const pools: Pool[] = [
    { id: ids.poolA, stageId: ids.groups, name: 'Pool A', orderIndex: 0, legs: null },
    { id: ids.poolB, stageId: ids.groups, name: 'Pool B', orderIndex: 1, legs: 1 },
  ];
  const poolEntries: PoolEntry[] = [
    { id: `${ids.p}-pe-1`, poolId: ids.poolA, stageId: ids.groups, side: team(ids.lio), seed: 1 },
    { id: `${ids.p}-pe-2`, poolId: ids.poolA, stageId: ids.groups, side: team(ids.tig), seed: 2 },
    { id: `${ids.p}-pe-3`, poolId: ids.poolB, stageId: ids.groups, side: team(ids.eag), seed: 3 },
    { id: `${ids.p}-pe-4`, poolId: ids.poolB, stageId: ids.groups, side: team(ids.haw), seed: 4 },
  ];
  const entry = (index: number, label: string, poolId: string, position: number): StageSlot => ({
    id: `${ids.p}-slot-${index}`,
    stageId: ids.ko,
    index,
    role: 'entry',
    label,
    source: { kind: 'pool_position', stageId: ids.groups, poolId, position },
    seed: index + 1,
  });
  const slots: StageSlot[] = [
    entry(0, 'A1', ids.poolA, 1),
    entry(1, 'B1', ids.poolB, 1),
    entry(2, 'A2', ids.poolA, 2),
    entry(3, 'B2', ids.poolB, 2),
    {
      id: `${ids.p}-slot-4`,
      stageId: ids.ko,
      index: 4,
      role: 'progression',
      label: 'Winner SF1',
      source: { kind: 'fixture_winner', fixtureId: `${ids.p}-sf1` },
      seed: null,
    },
    {
      id: `${ids.p}-slot-5`,
      stageId: ids.ko,
      index: 5,
      role: 'progression',
      label: 'Winner SF2',
      source: { kind: 'bracket_winner', stageId: ids.ko, round: 1, position: 1 },
      seed: null,
    },
  ];
  return { stages, pools, slots, poolEntries };
}

interface FixturePlan {
  readonly key: string;
  readonly stageId: string;
  readonly poolId: string | null;
  readonly number: number;
  readonly sideA: FixtureSide;
  readonly sideB: FixtureSide;
  readonly teamA: TeamSeed;
  readonly teamB: TeamSeed;
  readonly bracket: Fixture['bracket'];
  readonly label: string | null;
  readonly isFinal: boolean;
}

function scenarioMatch(ids: ScenarioIds, plan: FixturePlan, projectionVersion: number): ScenarioMatch {
  const matchId = `${ids.p}-m-${plan.key}`;
  const start = isoAt(3600 * plan.number);
  const completedAt = isoAt(3600 * plan.number + 1800);
  const golden: GoldenMatchOptions = {
    matchId,
    batFirst: { teamId: plan.teamA.team.id, playerIds: plan.teamA.players.map((p) => p.id) },
    bowlFirst: { teamId: plan.teamB.team.id, playerIds: plan.teamB.players.map((p) => p.id) },
    idPrefix: `${matchId}-`,
    start,
  };
  const result = goldenResult(golden);
  const match = buildMatch({
    id: matchId,
    title: `${plan.teamA.team.name} v ${plan.teamB.team.name}`,
    teamAId: plan.teamA.team.id,
    teamBId: plan.teamB.team.id,
    venueId: ids.venue1,
    scheduledDate: '2026-05-02',
    scheduledTime: '10:00',
    tournamentId: ids.p,
    fixtureId: `${ids.p}-${plan.key}`,
    status: 'completed',
    result,
    winnerTeamId: result.type === 'win' ? result.winnerTeamId : null,
    startedAt: isoAt(1, start),
    completedAt,
    createdAt: start,
    updatedAt: completedAt,
  });
  return {
    match,
    squads: squadsFor(plan.teamA, plan.teamB),
    events: goldenMatchEvents(golden),
    projection: goldenProjection(golden, { projectionVersion, teamAId: plan.teamA.team.id, at: completedAt, completed: true }),
  };
}

function fixtureFor(ids: ScenarioIds, plan: FixturePlan, match: Match): Fixture {
  return {
    id: `${ids.p}-${plan.key}`,
    tournamentId: ids.p,
    stageId: plan.stageId,
    poolId: plan.poolId,
    matchNumber: plan.number,
    label: plan.label,
    round: plan.poolId === null ? null : 1,
    leg: plan.poolId === null ? null : 1,
    bracket: plan.bracket,
    isFinal: plan.isFinal,
    sideA: plan.sideA,
    sideB: plan.sideB,
    scheduledDate: '2026-05-02',
    scheduledTime: '10:00',
    venueId: ids.venue1,
    status: 'completed',
    matchId: match.id,
    matchSides: null,
    formatId: plan.isFinal ? 'custom' : null,
    matchRules: plan.isFinal ? TEST_MATCH_RULES : null,
    notes: plan.isFinal ? 'Final under lights' : null,
    createdAt: isoAt(120),
    updatedAt: match.completedAt ?? match.updatedAt,
  };
}

export function buildTournamentScenario(prefix = 'cup', projectionVersion = 1): TournamentScenario {
  const ids = scenarioIds(prefix);
  const lio = buildTeamSeed(ids.lio, 'Lions', 'LIO');
  const tig = buildTeamSeed(ids.tig, 'Tigers', 'TIG');
  const eag = buildTeamSeed(ids.eag, 'Eagles', 'EAG');
  const haw = buildTeamSeed(ids.haw, 'Hawks', 'HAW');
  const bracket = (round: number, position: number, roundName: string): Fixture['bracket'] => ({
    kind: 'main',
    round,
    position,
    roundName,
  });
  const plans: FixturePlan[] = [
    { key: 'g1', stageId: ids.groups, poolId: ids.poolA, number: 1, sideA: team(ids.tig), sideB: team(ids.lio), teamA: tig, teamB: lio, bracket: null, label: null, isFinal: false },
    { key: 'g2', stageId: ids.groups, poolId: ids.poolB, number: 2, sideA: team(ids.haw), sideB: team(ids.eag), teamA: haw, teamB: eag, bracket: null, label: null, isFinal: false },
    { key: 'sf1', stageId: ids.ko, poolId: null, number: 3, sideA: slot(`${ids.p}-slot-0`), sideB: slot(`${ids.p}-slot-3`), teamA: lio, teamB: haw, bracket: bracket(1, 0, 'Semifinal'), label: 'SF1', isFinal: false },
    { key: 'sf2', stageId: ids.ko, poolId: null, number: 4, sideA: slot(`${ids.p}-slot-1`), sideB: slot(`${ids.p}-slot-2`), teamA: eag, teamB: tig, bracket: bracket(1, 1, 'Semifinal'), label: 'SF2', isFinal: false },
    { key: 'final', stageId: ids.ko, poolId: null, number: 5, sideA: slot(`${ids.p}-slot-4`), sideB: slot(`${ids.p}-slot-5`), teamA: haw, teamB: tig, bracket: bracket(2, 0, 'Final'), label: 'Final', isFinal: true },
  ];
  const matches = plans.map((plan) => scenarioMatch(ids, plan, projectionVersion));
  const fixtures = plans.map((plan, index) => fixtureFor(ids, plan, matches[index].match));
  const teams = [lio, tig, eag, haw];
  const overrides: TournamentOverride[] = [
    {
      id: `${ids.p}-ovr-1`,
      tournamentId: ids.p,
      kind: 'points_adjustment',
      stageId: ids.groups,
      poolId: ids.poolB,
      teamId: ids.haw,
      points: -1,
      reason: 'Slow over rate',
      createdAt: isoAt(20000),
      revokedAt: null,
      revokeReason: null,
    },
    {
      id: `${ids.p}-ovr-2`,
      tournamentId: ids.p,
      kind: 'slot_assignment',
      slotId: `${ids.p}-slot-4`,
      teamId: ids.haw,
      reason: 'Umpires confirmed the result',
      createdAt: isoAt(20001),
      revokedAt: isoAt(20002),
      revokeReason: 'No longer needed',
    },
  ];
  const audit: AuditEvent[] = [
    {
      id: `${ids.p}-audit-0`,
      tournamentId: ids.p,
      matchId: null,
      action: 'tournament_created',
      entityType: 'tournament',
      entityId: ids.p,
      summary: 'Created Scorebook Cup',
      previousValue: null,
      newValue: { name: 'Scorebook Cup' },
      reason: null,
      impact: null,
      createdAt: isoAt(10),
    },
    ...matches.map((entry, index) => ({
      id: `${ids.p}-audit-${index + 1}`,
      tournamentId: ids.p,
      matchId: entry.match.id,
      action: 'result_recorded' as const,
      entityType: 'match' as const,
      entityId: entry.match.id,
      summary: `Result recorded for ${entry.match.title}`,
      previousValue: null,
      newValue: null,
      reason: null,
      impact: null,
      createdAt: entry.match.completedAt ?? entry.match.updatedAt,
    })),
  ];
  return {
    venues: [buildVenue(ids.venue1, 'Gaddafi Stadium'), buildVenue(ids.venue2, 'National Stadium')],
    teams,
    tournament: buildTournament({ id: ids.p, venueIds: [ids.venue1, ids.venue2], status: 'completed', structureKind: 'groups_knockout' }),
    rules: buildTournamentRules(ids.p),
    tournamentTeams: teams.map((seed, index) => ({
      id: `${ids.p}-tt-${index + 1}`,
      tournamentId: ids.p,
      teamId: seed.team.id,
      seed: index + 1,
      status: 'active',
      replacedByTeamId: null,
      inheritsFromTeamId: null,
      joinedAt: isoAt(30 + index),
    })),
    ...buildStructure(ids),
    fixtures,
    matches,
    overrides,
    audit,
    championTeamIds: [ids.tig],
  };
}

export async function seedLibrary(db: SqlDatabase, teams: readonly TeamSeed[], venues: readonly Venue[] = []): Promise<void> {
  await db.withTransactionAsync(async (tx) => {
    const repos = createRepositories(tx);
    for (const venue of venues) {
      await repos.venues.insert(venue);
    }
    for (const seed of teams) {
      await repos.teams.insert(seed.team);
      for (const player of seed.players) {
        await repos.players.insert(player);
      }
    }
  });
}

export async function seedTournamentScenario(db: SqlDatabase, scenario: TournamentScenario): Promise<void> {
  await seedLibrary(db, scenario.teams, scenario.venues);
  await db.withTransactionAsync(async (tx) => {
    const repos = createRepositories(tx);
    await repos.tournaments.insert(scenario.tournament, scenario.rules);
    await repos.tournaments.upsertTournamentTeams(scenario.tournamentTeams);
    await repos.tournaments.upsertStages(scenario.stages);
    await repos.tournaments.upsertPools(scenario.pools);
    await repos.tournaments.upsertSlots(scenario.slots);
    for (const stage of scenario.stages) {
      await repos.tournaments.replacePoolEntries(
        stage.id,
        scenario.poolEntries.filter((entry) => entry.stageId === stage.id),
      );
    }
    await repos.tournaments.insertFixtures(scenario.fixtures);
    for (const entry of scenario.matches) {
      await repos.matches.insert(entry.match, entry.squads);
      await repos.events.append(entry.events);
      await repos.matches.writeProjection(entry.projection);
    }
    for (const override of scenario.overrides) {
      await repos.tournaments.insertOverride(override);
    }
    for (const event of scenario.audit) {
      await repos.audit.append(event);
    }
    await repos.tournaments.writeChampion(scenario.tournament.id, scenario.championTeamIds);
    await repos.tournaments.bumpRevision(scenario.tournament.id);
  });
}

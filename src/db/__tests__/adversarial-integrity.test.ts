/** @jest-environment node */
import type {
  AppSettings,
  AuditEvent,
  BackupData,
  FormatPreset,
  MatchEvent,
  MatchEventPayload,
  MatchSquadEntry,
  Player,
  Stage,
  StageSlot,
  Team,
  TournamentOverride,
  Venue,
} from '@/domain/types';
import { runMigrations } from '../migrate';
import { createRepositories, readMatchProjection } from '../repositories';
import type { MatchProjection, Repositories } from '../repositories/contracts';
import { buildMatch, buildTeamSeed, buildTournament, buildTournamentRules, buildVenue, isoAt, squadsFor, TEST_MATCH_RULES } from '../testing/builders';
import { createFaultInjectingDatabase, sqliteError, type FaultInjectingDatabase } from '../testing/faultInjectingDatabase';
import { ball, goldenMatchEvents, goldenProjection, goldenResult, type GoldenMatchOptions } from '../testing/goldenMatch';
import { countRows, openTestRepositories } from '../testing/harness';
import { createMigratedSqlJsDatabase, createSqlJsDatabase, type SqlJsTestDatabase } from '../testing/sqljsDatabase';
import {
  buildFixture,
  buildMembership,
  buildPool,
  buildPoolEntry,
  buildSlot,
  buildStage,
  seedBareTournament,
  slotSide,
  teamSide,
  type BareTournament,
} from '../testing/structureBuilders';
import { buildTournamentScenario, seedLibrary, seedTournamentScenario, stageConfig, type TournamentScenario } from '../testing/tournamentScenario';
import type { SqlDatabase, SqlExecutor } from '../types';

interface FileSystem {
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: 'utf8'): string;
  statSync(path: string): { isDirectory(): boolean };
}

interface PathModule {
  join(...parts: string[]): string;
}

declare const __dirname: string;

const { readdirSync, readFileSync, statSync } = jest.requireActual<FileSystem>('fs');
const { join } = jest.requireActual<PathModule>('path');

const lions = buildTeamSeed('lio', 'Lions', 'LIO');
const tigers = buildTeamSeed('tig', 'Tigers', 'TIG');
const eagles = buildTeamSeed('eag', 'Eagles', 'EAG');
const hawks = buildTeamSeed('haw', 'Hawks', 'HAW');

const L = (n: number): string => lions.players[n - 1].id;
const T = (n: number): string => tigers.players[n - 1].id;
const OUTSIDER = eagles.players[0].id;

const golden: GoldenMatchOptions = {
  matchId: 'm1',
  batFirst: { teamId: 'lio', playerIds: lions.players.map((p) => p.id) },
  bowlFirst: { teamId: 'tig', playerIds: tigers.players.map((p) => p.id) },
};

const ALL_TABLES = [
  'app_settings',
  'venues',
  'teams',
  'players',
  'tournaments',
  'tournament_venues',
  'tournament_rules',
  'tournament_teams',
  'tournament_stages',
  'pools',
  'stage_slots',
  'pool_teams',
  'fixtures',
  'matches',
  'match_players',
  'match_events',
  'innings',
  'partnerships',
  'tournament_overrides',
  'audit_events',
  'tournament_templates',
  'match_format_presets',
] as const;

type Dump = Record<string, string[]>;

async function dump(db: SqlExecutor): Promise<Dump> {
  const out: Dump = {};
  for (const table of ALL_TABLES) {
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
    out[table] = rows.map((row) => JSON.stringify(row)).sort();
  }
  return out;
}

async function counts(db: SqlExecutor): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of ALL_TABLES) {
    out[table] = await countRows(db, table);
  }
  return out;
}

async function outcome(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work();
  } catch (error) {
    return error;
  }
  return null;
}

function inTx(db: SqlDatabase, work: (repos: Repositories, tx: SqlExecutor) => Promise<unknown>): Promise<unknown> {
  return outcome(() => db.withTransactionAsync(async (tx) => work(createRepositories(tx), tx)));
}

async function expectRejectedAndUnchanged(db: SqlDatabase, work: (repos: Repositories, tx: SqlExecutor) => Promise<unknown>): Promise<void> {
  const before = await dump(db);
  const error = await inTx(db, work);
  expect(error).toBeInstanceOf(Error);
  expect(await dump(db)).toEqual(before);
}

async function expectAccepted(db: SqlDatabase, work: (repos: Repositories, tx: SqlExecutor) => Promise<unknown>): Promise<void> {
  expect(await inTx(db, work)).toBeNull();
}

function ev(seq: number, payload: MatchEventPayload, matchId = 'm1', actionId = `${matchId}-act-${seq}`): MatchEvent {
  return { ...payload, id: `${matchId}-ev-${seq}-${payload.kind}`, matchId, seq, actionId, recordedAt: isoAt(seq) };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Standalone {
  readonly db: SqlJsTestDatabase;
  readonly repos: Repositories;
  readonly events: MatchEvent[];
}

async function standaloneMatch(eventCount?: number): Promise<Standalone> {
  const { db, repos } = await openTestRepositories();
  await seedLibrary(db, [lions, tigers, eagles], [buildVenue('v1', 'Gaddafi Stadium'), buildVenue('v-free', 'Unused Ground')]);
  const all = goldenMatchEvents(golden);
  const events = eventCount === undefined ? all : all.slice(0, eventCount);
  await db.withTransactionAsync(async (tx) => {
    const r = createRepositories(tx);
    await r.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live', venueId: 'v1' }), squadsFor(lions, tigers));
    await r.events.append(events);
  });
  return { db, repos, events };
}

function completedProjection(at = isoAt(9000)): MatchProjection {
  return goldenProjection(golden, { projectionVersion: 1, teamAId: 'lio', at, completed: true });
}

function liveProjection(at = isoAt(8000)): MatchProjection {
  return goldenProjection(golden, { projectionVersion: 1, teamAId: 'lio', at, completed: false });
}

function extraBall(seq: number, id: string, runs = 1): MatchEvent {
  return { ...ball(T(3), T(2), L(10), { runs }), id, matchId: 'm1', seq, actionId: `${id}-action`, recordedAt: isoAt(20000 + seq) };
}

async function withScenario(): Promise<{ readonly db: SqlJsTestDatabase; readonly repos: Repositories; readonly scenario: TournamentScenario }> {
  const { db, repos } = await openTestRepositories();
  const scenario = buildTournamentScenario('cup', 1);
  await seedTournamentScenario(db, scenario);
  return { db, repos, scenario };
}

async function withBare(teamIds: readonly string[] = ['lio', 'tig']): Promise<{ readonly db: SqlJsTestDatabase; readonly repos: Repositories; readonly bare: BareTournament }> {
  const { db, repos } = await openTestRepositories();
  await seedLibrary(db, [lions, tigers, eagles, hawks], [buildVenue('v1', 'Gaddafi Stadium')]);
  const bare = await seedBareTournament(db, 't1', teamIds);
  return { db, repos, bare };
}

function manualSlot(id: string, stageId: string, index: number): StageSlot {
  return buildSlot({ id, stageId, index, source: { kind: 'manual', teamId: null } });
}

function emptyBackup(): BackupData {
  return {
    venues: [],
    teams: [],
    players: [],
    tournaments: [],
    tournamentRules: [],
    tournamentTeams: [],
    stages: [],
    pools: [],
    slots: [],
    poolEntries: [],
    fixtures: [],
    matches: [],
    matchPlayers: [],
    matchEvents: [],
    overrides: [],
    auditEvents: [],
    templates: [],
    formatPresets: [],
    settings: null,
  };
}

async function faultDatabase(data?: Uint8Array): Promise<FaultInjectingDatabase> {
  const db = await createFaultInjectingDatabase({ data: data ?? null });
  if (data === undefined) {
    await runMigrations(db, { now: () => isoAt(0) });
  }
  return db;
}

async function reopen(image: Uint8Array): Promise<SqlJsTestDatabase> {
  return createSqlJsDatabase({ data: image });
}

const REPLACE_PATTERNS: readonly RegExp[] = [
  new RegExp(['INSERT', 'OR', 'REPLACE'].join('\\s+'), 'i'),
  new RegExp(['REPLACE', 'INTO'].join('\\s+'), 'i'),
  new RegExp(['ON', 'CONFLICT', 'REPLACE'].join('\\s+'), 'i'),
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') {
        out.push(...sourceFiles(full));
      }
    } else if (/\.(ts|tsx|js|sql)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('adversarial integrity: DATABASE.md negative cases (IT-DB-05)', () => {
  it('refuses a tournament match whose fixture belongs to another tournament', async () => {
    const { db, scenario } = await withScenario();
    const [lio, tig] = scenario.teams;
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.tournaments.insert(buildTournament({ id: 'cup2', name: 'Second Cup' }), buildTournamentRules('cup2'));
      await r.tournaments.upsertTournamentTeams(scenario.teams.map((seed, index) => buildMembership('cup2', seed.team.id, index + 1)));
    });
    await expectRejectedAndUnchanged(db, (r) =>
      r.matches.insert(
        buildMatch({ id: 'x-foreign', teamAId: lio.team.id, teamBId: tig.team.id, tournamentId: 'cup2', fixtureId: 'cup-g1' }),
        squadsFor(lio, tig),
      ),
    );
    await expectAccepted(db, (r) =>
      r.matches.insert(buildMatch({ id: 'x-own', teamAId: lio.team.id, teamBId: tig.team.id, tournamentId: 'cup2', fixtureId: null }), squadsFor(lio, tig)),
    );
  });

  it('refuses a pool entry for a team that is not a member of the tournament', async () => {
    const { db, bare } = await withBare();
    const existing = ['lio', 'tig'].map((teamId, index) =>
      buildPoolEntry({ id: `t1-pe-${teamId}`, poolId: bare.poolId, stageId: bare.groupStageId, side: teamSide(teamId), seed: index + 1 }),
    );
    const intruder = buildPoolEntry({ id: 't1-pe-eag', poolId: bare.poolId, stageId: bare.groupStageId, side: teamSide('eag'), seed: 3 });
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.replacePoolEntries(bare.groupStageId, [...existing, intruder]));
    await expectAccepted(db, async (r) => {
      await r.tournaments.upsertTournamentTeams([buildMembership('t1', 'eag', 3)]);
      await r.tournaments.replacePoolEntries(bare.groupStageId, [...existing, intruder]);
    });
  });

  it('refuses a fixture side naming a team that is not a member of the tournament', async () => {
    const { db, bare } = await withBare();
    const fixture = (id: string, b: string) =>
      buildFixture({ id, tournamentId: 't1', stageId: bare.groupStageId, poolId: bare.poolId, sideA: teamSide('lio'), sideB: teamSide(b) });
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.insertFixtures([fixture('f-bad', 'eag')]));
    await expectAccepted(db, (r) => r.tournaments.insertFixtures([fixture('f-ok', 'tig')]));
  });

  it('refuses a squad of a third team, at insert and via addSquadPlayer, but accepts a guest in a match team', async () => {
    const { db } = await standaloneMatch(1);
    await expectRejectedAndUnchanged(db, (r) =>
      r.matches.insert(buildMatch({ id: 'm-third', teamAId: 'lio', teamBId: 'tig' }), [
        ...squadsFor(lions, tigers),
        { teamId: 'eag', players: [{ playerId: OUTSIDER, battingOrder: 1, isCaptain: false, isWicketKeeper: false, isSubstitute: false }] },
      ]),
    );
    await expectRejectedAndUnchanged(db, (r) =>
      r.matches.addSquadPlayer('m1', 'eag', { playerId: OUTSIDER, battingOrder: null, isCaptain: false, isWicketKeeper: false, isSubstitute: true }),
    );
    await expectAccepted(db, (r) =>
      r.matches.addSquadPlayer('m1', 'tig', { playerId: OUTSIDER, battingOrder: null, isCaptain: false, isWicketKeeper: false, isSubstitute: true }),
    );
  });

  it('refuses progression slots with a pool source, a seed, or a bracket source of another stage', async () => {
    const { db, bare } = await withBare();
    const progression = (source: StageSlot['source'], seed: number | null = null): StageSlot =>
      buildSlot({ id: 'p-slot', stageId: bare.knockoutStageId, index: 0, role: 'progression', source, seed });
    await expectRejectedAndUnchanged(db, (r) =>
      r.tournaments.upsertSlots([progression({ kind: 'pool_position', stageId: bare.groupStageId, poolId: bare.poolId, position: 1 })]),
    );
    await expectRejectedAndUnchanged(db, (r) =>
      r.tournaments.upsertSlots([progression({ kind: 'bracket_winner', stageId: bare.knockoutStageId, round: 1, position: 0 }, 1)]),
    );
    await expectRejectedAndUnchanged(db, (r) =>
      r.tournaments.upsertSlots([progression({ kind: 'bracket_winner', stageId: bare.groupStageId, round: 1, position: 0 })]),
    );
    await expectAccepted(db, (r) =>
      r.tournaments.upsertSlots([progression({ kind: 'bracket_winner', stageId: bare.knockoutStageId, round: 1, position: 0 })]),
    );
  });

  it('refuses a second final in a stage, whether inserted together or promoted later', async () => {
    const { db, bare } = await withBare();
    const ko = bare.knockoutStageId;
    await db.withTransactionAsync(async (tx) => {
      await createRepositories(tx).tournaments.upsertSlots([0, 1, 2, 3].map((i) => manualSlot(`ks${i}`, ko, i)));
    });
    const koFixture = (id: string, a: string, b: string, isFinal: boolean, position: number) =>
      buildFixture({
        id,
        tournamentId: 't1',
        stageId: ko,
        sideA: slotSide(a),
        sideB: slotSide(b),
        isFinal,
        matchNumber: position + 1,
        bracket: { kind: 'main', round: 1, position, roundName: 'Round 1' },
      });
    await expectRejectedAndUnchanged(db, (r) =>
      r.tournaments.insertFixtures([koFixture('kf1', 'ks0', 'ks1', true, 0), koFixture('kf2', 'ks2', 'ks3', true, 1)]),
    );
    await expectAccepted(db, (r) => r.tournaments.insertFixtures([koFixture('kf1', 'ks0', 'ks1', true, 0), koFixture('kf2', 'ks2', 'ks3', false, 1)]));
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.updateFixture(koFixture('kf2', 'ks2', 'ks3', true, 1)));
  });

  it('refuses a duplicate bracket position but allows the same position in another bracket kind', async () => {
    const { db, bare } = await withBare();
    const ko = bare.knockoutStageId;
    await db.withTransactionAsync(async (tx) => {
      await createRepositories(tx).tournaments.upsertSlots([0, 1, 2, 3].map((i) => manualSlot(`ks${i}`, ko, i)));
    });
    const at = (id: string, a: string, b: string, kind: 'main' | 'third_place') =>
      buildFixture({ id, tournamentId: 't1', stageId: ko, sideA: slotSide(a), sideB: slotSide(b), bracket: { kind, round: 2, position: 0, roundName: 'Final' } });
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.insertFixtures([at('b1', 'ks0', 'ks1', 'main'), at('b2', 'ks2', 'ks3', 'main')]));
    await expectAccepted(db, (r) => r.tournaments.insertFixtures([at('b1', 'ks0', 'ks1', 'main'), at('b2', 'ks2', 'ks3', 'third_place')]));
  });

  it('refuses to delete a tournament that still has matches, in a transaction and on the root handle, destroying nothing', async () => {
    const { db, repos } = await withScenario();
    const footprint = await repos.tournaments.deletionFootprint('cup');
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.delete('cup'));
    const before = await dump(db);
    expect(await outcome(() => repos.tournaments.delete('cup'))).toBeInstanceOf(Error);
    expect(await dump(db)).toEqual(before);
    expect(await repos.tournaments.deletionFootprint('cup')).toEqual(footprint);
  });

  it('refuses to delete a venue used by a tournament, a fixture or a match, and allows an unused one', async () => {
    const { db, repos } = await withScenario();
    await seedLibrary(db, [eagles, hawks], [buildVenue('v-match', 'Match Ground'), buildVenue('v-free', 'Free Ground')]);
    await db.withTransactionAsync(async (tx) => {
      await createRepositories(tx).matches.insert(
        buildMatch({ id: 'friendly', teamAId: 'eag', teamBId: 'haw', venueId: 'v-match' }),
        squadsFor(eagles, hawks),
      );
    });
    for (const venueId of ['cup-venue-1', 'cup-venue-2', 'v-match']) {
      await expectRejectedAndUnchanged(db, (r) => r.venues.delete(venueId));
      const before = await dump(db);
      expect(await outcome(() => repos.venues.delete(venueId))).toBeInstanceOf(Error);
      expect(await dump(db)).toEqual(before);
    }
    await repos.venues.archive('cup-venue-2', isoAt(99));
    expect((await repos.venues.get('cup-venue-2'))?.archivedAt).toBe(isoAt(99));
    await expectAccepted(db, (r) => r.venues.delete('v-free'));
    expect(await repos.venues.get('v-free')).toBeNull();
  });

  it('refuses a fixture side that is a slot of another stage', async () => {
    const { db, bare } = await withBare();
    await db.withTransactionAsync(async (tx) => {
      await createRepositories(tx).tournaments.upsertSlots([
        manualSlot('group-slot', bare.groupStageId, 0),
        manualSlot('ko-slot-a', bare.knockoutStageId, 0),
        manualSlot('ko-slot-b', bare.knockoutStageId, 1),
      ]);
    });
    const fixture = (id: string, a: string) =>
      buildFixture({ id, tournamentId: 't1', stageId: bare.knockoutStageId, sideA: slotSide(a), sideB: slotSide('ko-slot-b') });
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.insertFixtures([fixture('cross-stage', 'group-slot')]));
    await expectAccepted(db, (r) => r.tournaments.insertFixtures([fixture('same-stage', 'ko-slot-a')]));
  });

  it('refuses a team in two pools of the same stage', async () => {
    const { db, bare } = await withBare();
    await db.withTransactionAsync(async (tx) => {
      await createRepositories(tx).tournaments.upsertPools([buildPool({ id: 'pool-b', stageId: bare.groupStageId, name: 'Pool B', orderIndex: 1 })]);
    });
    const entries = [
      buildPoolEntry({ id: 'e1', poolId: bare.poolId, stageId: bare.groupStageId, side: teamSide('lio') }),
      buildPoolEntry({ id: 'e2', poolId: bare.poolId, stageId: bare.groupStageId, side: teamSide('tig') }),
      buildPoolEntry({ id: 'e3', poolId: 'pool-b', stageId: bare.groupStageId, side: teamSide('lio') }),
    ];
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.replacePoolEntries(bare.groupStageId, entries));
  });

  it("refuses a fixture whose current match belongs to another fixture", async () => {
    const { db, scenario } = await withScenario();
    const [lio, tig] = scenario.teams;
    await db.withTransactionAsync(async (tx) => {
      await createRepositories(tx).matches.insert(
        buildMatch({ id: 'cup-replay', teamAId: tig.team.id, teamBId: lio.team.id, tournamentId: 'cup', fixtureId: 'cup-g1' }),
        squadsFor(tig, lio),
      );
    });
    const g2 = scenario.fixtures.find((f) => f.id === 'cup-g2');
    if (g2 === undefined) {
      throw new Error('scenario fixture missing');
    }
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.updateFixture({ ...g2, matchId: 'cup-replay' }));
  });

  it('refuses a tournament match between non-members', async () => {
    const { db, scenario } = await withScenario();
    await seedLibrary(db, [eagles]);
    const lio = scenario.teams[0];
    await expectRejectedAndUnchanged(db, (r) =>
      r.matches.insert(buildMatch({ id: 'cup-intruder', teamAId: lio.team.id, teamBId: 'eag', tournamentId: 'cup' }), squadsFor(lio, eagles)),
    );
  });

  it('refuses a membership replaced by a non-member, or replaced without a replacement', async () => {
    const { db } = await withBare();
    const lio = buildMembership('t1', 'lio', 1);
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.upsertTournamentTeams([{ ...lio, status: 'replaced', replacedByTeamId: 'eag' }]));
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.upsertTournamentTeams([{ ...lio, status: 'replaced', replacedByTeamId: null }]));
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.upsertTournamentTeams([{ ...lio, inheritsFromTeamId: 'haw' }]));
    await expectAccepted(db, (r) =>
      r.tournaments.upsertTournamentTeams([buildMembership('t1', 'eag', 3), { ...lio, status: 'replaced', replacedByTeamId: 'eag' }]),
    );
  });

  it('refuses projections that name a third team or break the status/result invariants, keeping the previous projection', async () => {
    const { db, repos } = await standaloneMatch();
    await db.withTransactionAsync(async (tx) => createRepositories(tx).matches.writeProjection(completedProjection()));
    const stored = await readMatchProjection(db, 'm1');
    const good = completedProjection();
    const badInnings = { ...good, innings: good.innings.map((line, i) => (i === 0 ? { ...line, battingTeamId: 'eag' } : line)) };
    const noResult: MatchProjection = { ...good, result: null, winnerTeamId: null, summary: null };
    const abandonedWin: MatchProjection = { ...good, status: 'abandoned' };
    const foreignWinner: MatchProjection = { ...good, winnerTeamId: 'eag' };
    const liveWithSummary: MatchProjection = { ...good, status: 'live', result: null, winnerTeamId: null };
    for (const bad of [badInnings, noResult, abandonedWin, foreignWinner, liveWithSummary]) {
      await expectRejectedAndUnchanged(db, (r) => r.matches.writeProjection(bad));
    }
    expect(await readMatchProjection(db, 'm1')).toEqual(stored);
    expect((await repos.matches.get('m1'))?.status).toBe('completed');
  });

  it('refuses deliveries that break the Laws-level CHECKs, leaving the log untouched', async () => {
    const { db, repos } = await standaloneMatch(1);
    const base = ball(L(1), L(2), T(7));
    const bad: MatchEventPayload[] = [
      ball(L(1), L(2), T(7), { boundary: 6, runsTo: 'bye' }),
      ball(L(1), L(2), T(7), { boundary: 6, runsTo: 'leg_bye' }),
      { ...ball(L(1), L(2), T(7), { runs: 1 }), shortRuns: 2 },
      ball(L(1), L(1), T(7)),
      ball(L(1), L(2), T(7), { wicket: { type: 'bowled', playerOutId: L(1), fielderIds: [], dismissalEnd: 'striker_end' } }),
      { ...base, runsRun: 10 },
      { ...base, runsRun: -1 },
      { ...base, shortRuns: -1 },
      { ...base, boundary: 5 as unknown as 4 },
      ball(L(1), L(2), T(7), { wicket: { type: 'timed_out' as unknown as 'bowled', playerOutId: L(1), fielderIds: [], dismissalEnd: null } }),
    ];
    for (const payload of bad) {
      await expectRejectedAndUnchanged(db, (r) => r.events.append([ev(2, payload)]));
    }
    expect(await repos.events.lastSeq('m1')).toBe(1);
  });

  it('rejects corrupt JSON and wrongly typed values written by raw SQL (FR-05g, STRICT)', async () => {
    const { db } = await standaloneMatch(3);
    await seedBareTournament(db, 't-json', ['lio', 'tig']);
    expect(await countRows(db, 'tournaments', 'id = ?', ['t-json'])).toBe(1);
    const attacks = [
      "UPDATE matches SET rules_json = '{bad' WHERE id = 'm1'",
      "UPDATE matches SET rules_json = json_set(rules_json, '$.oversPerInnings', 0) WHERE id = 'm1'",
      "UPDATE match_events SET payload_json = 'x' WHERE kind = 'innings_started'",
      "UPDATE match_events SET payload_json = '[1,2]' WHERE kind = 'innings_started'",
      "UPDATE match_events SET payload_json = NULL WHERE kind = 'innings_started'",
      "UPDATE match_events SET payload_json = '{}' WHERE kind = 'delivery' AND seq = 2",
      "UPDATE match_events SET seq = 'abc' WHERE seq = 2",
      "UPDATE match_events SET seq = 0 WHERE seq = 2",
      "UPDATE players SET jersey_number = 'ten' WHERE id = 'lio-p1'",
      "UPDATE tournaments SET champion_json = '{\"a\":1}' WHERE id = 't-json'",
      "UPDATE tournaments SET champion_json = '\"lio\"' WHERE id = 't-json'",
      "UPDATE tournaments SET champion_json = 'not json' WHERE id = 't-json'",
      "UPDATE tournaments SET start_date = '2026-06-10', end_date = '2026-06-01' WHERE id = 't-json'",
      "INSERT INTO app_settings (key, value_json, updated_at) VALUES ('theme', 'dark', 'x')",
      "UPDATE matches SET scheduled_date = '31/12/2026' WHERE id = 'm1'",
      "UPDATE matches SET scheduled_time = '9:5' WHERE id = 'm1'",
      "UPDATE matches SET toss_winner_team_id = 'eag' WHERE id = 'm1'",
      "UPDATE matches SET team_b_id = 'lio' WHERE id = 'm1'",
    ];
    for (const sql of attacks) {
      const before = await dump(db);
      const error = await outcome(() => db.runAsync(sql));
      expect({ sql, rejected: error instanceof Error }).toEqual({ sql, rejected: true });
      expect(await dump(db)).toEqual(before);
    }
  });

  it('refuses events whose payload names a player outside the squad or an unknown team', async () => {
    const { db, repos } = await standaloneMatch(0);
    const opening: MatchEventPayload = { kind: 'innings_started', inningsIndex: 0, battingTeamId: 'lio', strikerId: L(1), nonStrikerId: L(2), bowlerId: T(7) };
    const firstEvents: MatchEventPayload[] = [
      { ...opening, strikerId: OUTSIDER } as MatchEventPayload,
      { ...opening, nonStrikerId: OUTSIDER } as MatchEventPayload,
      { ...opening, bowlerId: OUTSIDER } as MatchEventPayload,
      { ...opening, battingTeamId: 'no-such-team' } as MatchEventPayload,
    ];
    for (const payload of firstEvents) {
      await expectRejectedAndUnchanged(db, (r) => r.events.append([ev(1, payload)]));
    }
    await db.withTransactionAsync(async (tx) => createRepositories(tx).events.append([ev(1, opening)]));
    const later: MatchEventPayload[] = [
      ball(L(1), L(2), OUTSIDER),
      ball(OUTSIDER, L(2), T(7)),
      ball(L(1), OUTSIDER, T(7)),
      ball(L(1), L(2), T(7), { wicket: { type: 'caught', playerOutId: L(1), fielderIds: [OUTSIDER], dismissalEnd: null } }),
      ball(L(1), L(2), T(7), { wicket: { type: 'run_out', playerOutId: L(1), fielderIds: [T(3), OUTSIDER], dismissalEnd: 'striker_end' } }),
      ball(L(1), L(2), T(7), { wicket: { type: 'bowled', playerOutId: OUTSIDER, fielderIds: [], dismissalEnd: null } }),
      { kind: 'batter_in', playerId: OUTSIDER, position: 'striker' },
      { kind: 'bowler_selected', bowlerId: OUTSIDER, reason: 'over_start' },
      { kind: 'batter_retired', playerId: OUTSIDER, retirement: 'retired_hurt' },
      { kind: 'batter_dismissed', playerId: OUTSIDER, type: 'run_out', fielderIds: [] },
      { kind: 'batter_dismissed', playerId: L(2), type: 'run_out', fielderIds: [OUTSIDER] },
      { kind: 'batter_dismissed', playerId: L(2), type: 'run_out', fielderIds: [T(4), OUTSIDER] },
      { kind: 'penalty_awarded', teamId: 'no-such-team', inningsIndex: 0, runs: 5, reason: 'Ball tampering' },
      { kind: 'match_ended', outcome: { type: 'walkover', winnerTeamId: 'no-such-team', reason: null } },
    ];
    for (const payload of later) {
      await expectRejectedAndUnchanged(db, (r) => r.events.append([ev(2, payload)]));
    }
    expect(await repos.events.lastSeq('m1')).toBe(1);
  });
});

describe('adversarial integrity: deleting referenced library, squad and structure rows', () => {
  it('refuses to delete a player who is in any squad, even one who never appeared in an event', async () => {
    const { db, repos } = await standaloneMatch(1);
    await expectRejectedAndUnchanged(db, (r) => r.players.delete(L(12)));
    const before = await dump(db);
    expect(await outcome(() => repos.players.delete(L(12)))).toBeInstanceOf(Error);
    expect(await dump(db)).toEqual(before);
    await repos.players.update({ ...lions.players[11], archivedAt: isoAt(77) });
    expect((await repos.players.getMany([L(12)]))[0]?.archivedAt).toBe(isoAt(77));
  });

  it('refuses to delete a team that played a match or whose player guested in a squad, without losing any of its players', async () => {
    const { db, repos } = await standaloneMatch(1);
    await repos.matches.addSquadPlayer('m1', 'tig', { playerId: OUTSIDER, battingOrder: null, isCaptain: false, isWicketKeeper: false, isSubstitute: true });
    for (const teamId of ['lio', 'eag']) {
      await expectRejectedAndUnchanged(db, (r) => r.teams.delete(teamId));
      const before = await dump(db);
      expect(await outcome(() => repos.teams.delete(teamId))).toBeInstanceOf(Error);
      expect(await dump(db)).toEqual(before);
    }
    expect(await repos.players.listByTeam('eag', { includeArchived: true })).toHaveLength(eagles.players.length);
  });

  it('refuses to delete a team that is a tournament member even before any match', async () => {
    const { db } = await withBare();
    await expectRejectedAndUnchanged(db, (r) => r.teams.delete('tig'));
  });

  it('refuses removeSquadPlayer for a player referenced only by one payload field or as an absentee (IT-DB-04)', async () => {
    const { db, repos } = await standaloneMatch(0);
    const log: MatchEvent[] = [
      ev(1, { kind: 'innings_started', inningsIndex: 0, battingTeamId: 'lio', strikerId: L(1), nonStrikerId: L(2), bowlerId: T(7) }),
      ev(2, { kind: 'delivery', call: 'fair', runsTo: 'bat', strikerId: L(1), nonStrikerId: null, bowlerId: T(7), runsRun: 0, shortRuns: 0, boundary: 0, wicket: { type: 'run_out', playerOutId: L(1), fielderIds: [T(3), T(4)], dismissalEnd: 'striker_end' } }),
      ev(3, { kind: 'batter_in', playerId: L(3), position: 'striker' }),
      ev(4, { kind: 'bowler_selected', bowlerId: T(8), reason: 'over_start' }),
      ev(5, { kind: 'batter_dismissed', playerId: L(3), type: 'run_out', fielderIds: [T(5), T(6)] }),
      ev(6, { kind: 'innings_ended', reason: 'batters_unavailable', absentees: [{ playerId: L(11), hurt: true }] }),
    ];
    await db.withTransactionAsync(async (tx) => createRepositories(tx).events.append(log));
    for (const playerId of [L(2), L(3), T(3), T(4), T(5), T(6), T(7), T(8), L(11)]) {
      await expectRejectedAndUnchanged(db, (r) => r.matches.removeSquadPlayer('m1', playerId));
    }
    for (const playerId of [L(2), T(4), T(6), T(8)]) {
      const before = await dump(db);
      expect(await outcome(() => db.runAsync('DELETE FROM match_players WHERE match_id = ? AND player_id = ?', ['m1', playerId]))).toBeInstanceOf(Error);
      expect(await dump(db)).toEqual(before);
    }
    await expectAccepted(db, (r) => r.matches.removeSquadPlayer('m1', L(10)));
    expect((await repos.matches.getSetup('m1'))?.players.some((p) => p.playerId === L(10))).toBe(false);
  });

  it('refuses to delete a fixture that feeds a progression slot, in a transaction and on the root handle', async () => {
    const { db, repos, bare } = await withBare();
    const ko = bare.knockoutStageId;
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.tournaments.upsertSlots([0, 1, 2, 3].map((i) => manualSlot(`ks${i}`, ko, i)));
      await r.tournaments.insertFixtures([
        buildFixture({ id: 'q1', tournamentId: 't1', stageId: ko, sideA: slotSide('ks0'), sideB: slotSide('ks1'), matchNumber: 1 }),
        buildFixture({ id: 'q2', tournamentId: 't1', stageId: ko, sideA: slotSide('ks2'), sideB: slotSide('ks3'), matchNumber: 2 }),
      ]);
      await r.tournaments.upsertSlots([
        buildSlot({ id: 'win-q1', stageId: ko, index: 4, role: 'progression', label: 'Winner Q1', source: { kind: 'fixture_winner', fixtureId: 'q1' } }),
      ]);
    });
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.deleteFixture('q1'));
    const before = await dump(db);
    expect(await outcome(() => repos.tournaments.deleteFixture('q1'))).toBeInstanceOf(Error);
    expect(await dump(db)).toEqual(before);
    await expectAccepted(db, (r) => r.tournaments.deleteFixture('q2'));
  });

  it('refuses to delete a match its fixture still points at, keeping every event, and allows it after detaching', async () => {
    const { db, repos, scenario } = await withScenario();
    const events = await countRows(db, 'match_events', 'match_id = ?', ['cup-m-g1']);
    expect(events).toBeGreaterThan(0);
    await expectRejectedAndUnchanged(db, (r) => r.matches.delete('cup-m-g1'));
    const g1 = scenario.fixtures.find((f) => f.id === 'cup-g1');
    if (g1 === undefined) {
      throw new Error('scenario fixture missing');
    }
    await expectAccepted(db, async (r) => {
      await r.tournaments.updateFixture({ ...g1, matchId: null, status: 'scheduled' });
      await r.matches.delete('cup-m-g1');
    });
    expect(await repos.matches.get('cup-m-g1')).toBeNull();
    expect(await countRows(db, 'match_events', 'match_id = ?', ['cup-m-g1'])).toBe(0);
  });

  it('refuses to delete a pool or stage that a later stage slot takes its teams from', async () => {
    const { db, bare } = await withBare();
    await db.withTransactionAsync(async (tx) => {
      await createRepositories(tx).tournaments.upsertSlots([
        buildSlot({ id: 'a1', stageId: bare.knockoutStageId, index: 0, source: { kind: 'pool_position', stageId: bare.groupStageId, poolId: bare.poolId, position: 1 } }),
        buildSlot({ id: 'best', stageId: bare.knockoutStageId, index: 1, source: { kind: 'best_of_position', stageId: bare.groupStageId, position: 2, rank: 1, normalization: 'raw' } }),
      ]);
    });
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.deletePool(bare.poolId));
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.deleteStage(bare.groupStageId));
  });

  it('refuses to delete a tournament membership that pool entries or fixtures still use', async () => {
    const { db, bare } = await withBare();
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.deleteTournamentTeam('t1-tt-lio'));
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.tournaments.replacePoolEntries(bare.groupStageId, []);
      await r.tournaments.insertFixtures([
        buildFixture({ id: 'lt', tournamentId: 't1', stageId: bare.groupStageId, sideA: teamSide('lio'), sideB: teamSide('tig') }),
      ]);
    });
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.deleteTournamentTeam('t1-tt-tig'));
  });

  it('keeps overrides with their full payload when the stage, pool and slot they name are deleted', async () => {
    const { db, repos, bare } = await withBare();
    const slot = manualSlot('pin-slot', bare.knockoutStageId, 0);
    const overrides: TournamentOverride[] = [
      {
        id: 'ov-q',
        tournamentId: 't1',
        kind: 'qualification',
        stageId: bare.knockoutStageId,
        teamId: 'lio',
        action: 'reassign',
        slotId: 'pin-slot',
        poolId: null,
        reason: 'Organizer decision',
        createdAt: isoAt(500),
        revokedAt: null,
        revokeReason: null,
      },
      {
        id: 'ov-p',
        tournamentId: 't1',
        kind: 'points_adjustment',
        stageId: bare.groupStageId,
        poolId: bare.poolId,
        teamId: 'tig',
        points: -2,
        reason: 'Slow over rate',
        createdAt: isoAt(501),
        revokedAt: null,
        revokeReason: null,
      },
    ];
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.tournaments.upsertSlots([slot]);
      for (const override of overrides) {
        await r.tournaments.insertOverride(override);
      }
    });
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.tournaments.deleteSlot('pin-slot');
      await r.tournaments.deleteStage(bare.knockoutStageId);
      await r.tournaments.deletePool(bare.poolId);
    });
    expect(await countRows(db, 'tournament_overrides')).toBe(2);
    const snapshot = await repos.tournaments.getSnapshot('t1', 1);
    expect([...(snapshot?.overrides ?? [])].sort((a, b) => a.id.localeCompare(b.id))).toEqual([overrides[1], overrides[0]]);
  });
});

describe('adversarial integrity: the event log (§89, IT-DB-08, FR-12)', () => {
  it('rejects a stale writer and none of its transaction (event or projection) survives', async () => {
    const { db, repos, events } = await standaloneMatch(10);
    const seenByA = await repos.events.lastSeq('m1');
    const seenByB = await repos.events.lastSeq('m1');
    expect(seenByA).toBe(10);
    const projectionA = liveProjection(isoAt(30001));
    const projectionB = { ...liveProjection(isoAt(30002)), innings: liveProjection().innings.map((line) => ({ ...line, runs: line.runs + 50 })) };
    await expectAccepted(db, async (r) => {
      await r.events.append([extraBall(seenByA + 1, 'writer-a')]);
      await r.matches.writeProjection(projectionA);
    });
    await expectRejectedAndUnchanged(db, async (r) => {
      await r.matches.writeProjection(projectionB);
      await r.events.append([extraBall(seenByB + 1, 'writer-b', 4)]);
    });
    const log = await repos.events.listByMatch('m1');
    expect(log.map((e) => e.seq)).toEqual(Array.from({ length: 11 }, (_, i) => i + 1));
    expect(log[10].id).toBe('writer-a');
    expect(log.slice(0, 10)).toEqual(events);
    const stored = await readMatchProjection(db, 'm1');
    expect(stored?.updatedAt).toBe(projectionA.updatedAt);
    expect(stored?.innings.map((line) => line.runs)).toEqual(projectionA.innings.map((line) => line.runs));
  });

  it('serialises concurrent transactions so read-then-append writers never collide and seqs stay contiguous', async () => {
    const { db, repos } = await standaloneMatch(5);
    const writers = Array.from({ length: 12 }, (_, i) =>
      db.withTransactionAsync(async (tx) => {
        const r = createRepositories(tx);
        const last = await r.events.lastSeq('m1');
        await delay(1);
        await r.events.append([extraBall(last + 1, `conc-${i}`)]);
        if (i % 4 === 3) {
          throw new Error(`writer ${i} aborts after appending`);
        }
        return last + 1;
      }),
    );
    const settled = await Promise.allSettled(writers);
    const failed = settled.filter((s) => s.status === 'rejected');
    expect(failed).toHaveLength(3);
    for (const s of failed) {
      expect(String((s as PromiseRejectedResult).reason)).toMatch(/aborts after appending/);
    }
    const log = await repos.events.listByMatch('m1');
    expect(log.map((e) => e.seq)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(log.slice(5).map((e) => e.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => i)
        .filter((i) => i % 4 !== 3)
        .map((i) => `conc-${i}`),
    );
  });

  it('truncateFrom refuses a wrong expected tail, a wrong fromSeq or a gapped log and deletes nothing', async () => {
    const { db, repos, events } = await standaloneMatch();
    const n = events.length;
    for (const [from, expected] of [
      [n - 1, n - 1],
      [n - 1, n + 1],
      [0, n],
      [-3, n],
      [n + 1, n + 2],
    ] as const) {
      await expectRejectedAndUnchanged(db, (r) => r.events.truncateFrom('m1', from, expected));
    }
    const before = await dump(db);
    expect(await outcome(() => repos.events.truncateFrom('m1', n - 1, n - 5))).toBeInstanceOf(Error);
    expect(await dump(db)).toEqual(before);
    await db.runAsync('DELETE FROM match_events WHERE match_id = ? AND seq = ?', ['m1', 5]);
    await expectRejectedAndUnchanged(db, (r) => r.events.truncateFrom('m1', 4, n));
  });

  it('truncateFrom only touches its own match and returns the rows it removed', async () => {
    const { db, repos, events } = await standaloneMatch();
    const other = goldenMatchEvents({ ...golden, matchId: 'm2', idPrefix: 'm2-' }).slice(0, 7);
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.matches.insert(buildMatch({ id: 'm2', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
      await r.events.append(other);
    });
    await expectRejectedAndUnchanged(db, (r) => r.events.truncateFrom('m2', 1, events.length));
    let removed = -1;
    await expectAccepted(db, async (r) => {
      removed = await r.events.truncateFrom('m1', events.length - 1, events.length);
    });
    expect(removed).toBe(2);
    expect(await repos.events.listByMatch('m1')).toEqual(events.slice(0, events.length - 2));
    expect(await repos.events.listByMatch('m2')).toEqual(other);
  });

  it('never keeps half an action group: a wicket whose incoming batter is refused leaves no delivery (§89)', async () => {
    const { db, repos } = await standaloneMatch(10);
    const wicket = ball(L(2), L(1), T(8), { wicket: { type: 'bowled', playerOutId: L(2), fielderIds: [], dismissalEnd: null } });
    await expectRejectedAndUnchanged(db, async (r) => {
      await r.events.append([ev(11, wicket, 'm1', 'grp'), ev(12, { kind: 'batter_in', playerId: OUTSIDER, position: 'striker' }, 'm1', 'grp')]);
      await r.matches.writeProjection(liveProjection(isoAt(40000)));
    });
    expect(await repos.events.lastSeq('m1')).toBe(10);
  });

  it('rolls back the events of a ball when the projection write fails, and the retry gets the same seqs (FR-07a/b)', async () => {
    const db = await faultDatabase();
    await seedLibrary(db, [lions, tigers]);
    const log = goldenMatchEvents(golden);
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
      await r.events.append(log.slice(0, 10));
      await r.matches.writeProjection(liveProjection(isoAt(100)));
    });
    const before = await dump(db);
    const group = log.slice(10, 12);
    const record = () =>
      db.withTransactionAsync(async (tx) => {
        const r = createRepositories(tx);
        await r.events.append(group);
        await r.matches.writeProjection(liveProjection(isoAt(200)));
      });
    db.failOn({ sql: /partnerships/i, error: sqliteError('SQLITE_FULL') });
    expect(await outcome(record)).toBeInstanceOf(Error);
    expect(await dump(db)).toEqual(before);
    db.failOn({ sql: /INSERT INTO match_events/i, error: sqliteError('SQLITE_IOERR') });
    expect(await outcome(record)).toBeInstanceOf(Error);
    expect(await dump(db)).toEqual(before);
    db.clearFaults();
    expect(await outcome(record)).toBeNull();
    const events = await createRepositories(db).events.listByMatch('m1');
    expect(events).toEqual(log.slice(0, 12));
    expect((await readMatchProjection(db, 'm1'))?.updatedAt).toBe(isoAt(200));
  });

  it('a crash in the middle of a ball transaction leaves the durable image without any part of it (FR-01b)', async () => {
    const db = await faultDatabase();
    await seedLibrary(db, [lions, tigers]);
    const log = goldenMatchEvents(golden);
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
      await r.events.append(log.slice(0, 10));
      await r.matches.writeProjection(liveProjection(isoAt(100)));
    });
    const before = await dump(db);
    db.crashAt({ sql: /partnerships/i });
    const error = await outcome(() =>
      db.withTransactionAsync(async (tx) => {
        const r = createRepositories(tx);
        await r.events.append(log.slice(10, 12));
        await r.matches.writeProjection(liveProjection(isoAt(200)));
      }),
    );
    expect(error).toBeInstanceOf(Error);
    expect(db.crashed).toBe(true);
    const revived = await reopen(db.lastDurableImage());
    expect(await dump(revived)).toEqual(before);
    expect(await revived.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
    expect(await createRepositories(revived).events.lastSeq('m1')).toBe(10);
  });

  it('a failing COMMIT rolls back, releases the writer lock and the next transaction commits durably (FR-07c)', async () => {
    const db = await faultDatabase();
    await seedLibrary(db, [lions, tigers]);
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
      await r.events.append(goldenMatchEvents(golden).slice(0, 3));
    });
    db.failOnCommit(1);
    const failed = await outcome(() => db.withTransactionAsync(async (tx) => createRepositories(tx).events.append([extraBall(4, 'lost')])));
    expect(failed).toBeInstanceOf(Error);
    const committed = await outcome(() => db.withTransactionAsync(async (tx) => createRepositories(tx).events.append([extraBall(4, 'kept')])));
    expect(committed).toBeNull();
    const revived = await reopen(db.lastDurableImage());
    const log = await createRepositories(revived).events.listByMatch('m1');
    expect(log.map((e) => e.id)).toEqual([...goldenMatchEvents(golden).slice(0, 3).map((e) => e.id), 'kept']);
  });

  it('replaceAll interrupted after its DELETE keeps the old log (FR-01e)', async () => {
    const db = await faultDatabase();
    await seedLibrary(db, [lions, tigers]);
    const log = goldenMatchEvents(golden);
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
      await r.events.append(log.slice(0, 12));
    });
    const before = await dump(db);
    const edited = log.slice(0, 12).map((e) => (e.kind === 'delivery' ? { ...e, id: `${e.id}-edit` } : e));
    db.failOn({ sql: /INSERT INTO match_events/i, error: sqliteError('SQLITE_FULL') });
    expect(await outcome(() => db.withTransactionAsync(async (tx) => createRepositories(tx).events.replaceAll('m1', edited)))).toBeInstanceOf(Error);
    expect(await dump(db)).toEqual(before);
    db.clearFaults();
    db.crashAt({ sql: /INSERT INTO match_events/i });
    expect(await outcome(() => db.withTransactionAsync(async (tx) => createRepositories(tx).events.replaceAll('m1', edited)))).toBeInstanceOf(Error);
    expect(await dump(await reopen(db.lastDurableImage()))).toEqual(before);
  });

  it('replaceAll never stores a log that is not seq 1..n of that match, and never touches another match', async () => {
    const { db, repos, events } = await standaloneMatch();
    const other = goldenMatchEvents({ ...golden, matchId: 'm2', idPrefix: 'm2-' }).slice(0, 6);
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.matches.insert(buildMatch({ id: 'm2', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
      await r.events.append(other);
    });
    const n = events.length;
    const bad: readonly (readonly MatchEvent[])[] = [
      events.filter((e) => e.seq !== 5),
      events.map((e) => ({ ...e, seq: e.seq + 1 })),
      events.map((e) => (e.seq === 6 ? { ...e, seq: 5 } : e)),
      events.map((e) => ({ ...e, matchId: 'm2', id: `${e.id}-moved` })),
      events.map((e, i) => (i === n - 1 ? { ...e, id: other[0].id } : e)),
      events.map((e, i) => (i === 3 ? { ...e, id: events[2].id } : e)),
    ];
    for (const log of bad) {
      await expectRejectedAndUnchanged(db, (r) => r.events.replaceAll('m1', log));
    }
    expect(await repos.events.listByMatch('m1')).toEqual(events);
    expect(await repos.events.listByMatch('m2')).toEqual(other);
    const reversed = [...events].reverse();
    const before = await dump(db);
    const reversedOutcome = await inTx(db, (r) => r.events.replaceAll('m1', reversed));
    if (reversedOutcome === null) {
      expect(await repos.events.listByMatch('m1')).toEqual(events);
    } else {
      expect(await dump(db)).toEqual(before);
    }
    const target = events.find((e) => e.kind === 'delivery');
    expect(target).toBeDefined();
    const edited = events.map((e) => (e === target && e.kind === 'delivery' ? { ...e, id: 'edited-ball', actionId: 'edit-act', runsRun: 3, shortRuns: 0, boundary: 0 as const } : e));
    await expectAccepted(db, (r) => r.events.replaceAll('m1', edited));
    expect(await repos.events.listByMatch('m1')).toEqual(edited);
    expect(await repos.events.listByMatch('m2')).toEqual(other);
  });
});

describe('adversarial integrity: the transaction adapter', () => {
  it('a root read issued during a transaction that rolls back never observes the uncommitted row', async () => {
    const { db, repos } = await openTestRepositories();
    let rootRead: Promise<Venue | null> = Promise.resolve(null);
    let rootCount: Promise<number> = Promise.resolve(-1);
    const tx = db.withTransactionAsync(async (handle) => {
      await createRepositories(handle).venues.insert(buildVenue('ghost', 'Ghost Ground'));
      rootRead = repos.venues.get('ghost');
      rootCount = countRows(db, 'venues');
      await delay(5);
      throw new Error('use case failed');
    });
    await expect(tx).rejects.toThrow('use case failed');
    expect(await rootRead).toBeNull();
    expect(await rootCount).toBe(0);
  });

  it('a root write issued during a failing transaction waits and is not rolled back with it (FR-07f)', async () => {
    const { db, repos } = await openTestRepositories();
    let rootWrite: Promise<void> = Promise.resolve();
    const tx = db.withTransactionAsync(async (handle) => {
      await createRepositories(handle).venues.insert(buildVenue('inner', 'Inner'));
      rootWrite = repos.venues.insert(buildVenue('outer', 'Outer'));
      await delay(5);
      throw new Error('use case failed');
    });
    await expect(tx).rejects.toThrow('use case failed');
    await rootWrite;
    expect(await repos.venues.get('inner')).toBeNull();
    expect((await repos.venues.get('outer'))?.name).toBe('Outer');
  });

  it('a leaked transaction handle can never write silently into someone else\'s transaction', async () => {
    const { db, repos } = await openTestRepositories();
    let leaked: SqlExecutor | null = null;
    await db.withTransactionAsync(async (handle) => {
      leaked = handle;
    });
    if (leaked === null) {
      throw new Error('no handle');
    }
    const stale = createRepositories(leaked);
    const afterCommit = await outcome(() => stale.venues.insert(buildVenue('late', 'Late')));
    expect(afterCommit !== null || (await repos.venues.get('late')) !== null).toBe(true);
    let leakedWrite: Promise<unknown> = Promise.resolve(null);
    const second = db.withTransactionAsync(async (handle) => {
      await createRepositories(handle).venues.insert(buildVenue('inner', 'Inner'));
      leakedWrite = outcome(() => stale.venues.insert(buildVenue('leak', 'Leak')));
      await delay(5);
      throw new Error('second use case failed');
    });
    await expect(second).rejects.toThrow('second use case failed');
    const leakError = await leakedWrite;
    expect(leakError !== null || (await repos.venues.get('leak')) !== null).toBe(true);
    expect(await repos.venues.get('inner')).toBeNull();
  });

  it('a deferred foreign key failing at COMMIT rolls back so later autocommit writes are durable', async () => {
    const db = await createMigratedSqlJsDatabase();
    const repos = createRepositories(db);
    const orphan: Team = { ...hawks.team, captainId: 'no-such-player' };
    await expectRejectedAndUnchanged(db, (r) => r.teams.insert(orphan));
    await repos.venues.insert(buildVenue('after', 'After'));
    await expectAccepted(db, (r) => r.venues.insert(buildVenue('next-tx', 'Next')));
    const revived = await reopen(await db.exportAsync());
    const revivedRepos = createRepositories(revived);
    expect((await revivedRepos.venues.get('after'))?.name).toBe('After');
    expect((await revivedRepos.venues.get('next-tx'))?.name).toBe('Next');
    expect(await revivedRepos.teams.get('haw')).toBeNull();
  });

  it('a task that throws a non-Error value still rolls back and frees the lock', async () => {
    const { db, repos } = await openTestRepositories();
    const thrown = await outcome(() =>
      db.withTransactionAsync(async (handle) => {
        await createRepositories(handle).venues.insert(buildVenue('str', 'String'));
        return Promise.reject('plain string failure');
      }),
    );
    expect(thrown).toBe('plain string failure');
    expect(await repos.venues.get('str')).toBeNull();
    await expectAccepted(db, (r) => r.venues.insert(buildVenue('ok', 'Ok')));
  });

  it('a failed statement can be retried with the same SQL and a partially read multi-row query does not block COMMIT', async () => {
    const { db, repos } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    await expectAccepted(db, async (r, tx) => {
      expect(await outcome(() => r.venues.insert(buildVenue('blank', '   ')))).toBeInstanceOf(Error);
      await r.venues.insert(buildVenue('blank', 'Named'));
      const first = await tx.getFirstAsync<{ readonly id: string }>('SELECT id FROM players ORDER BY id');
      expect(first?.id).toBe('lio-p1');
    });
    expect((await repos.venues.get('blank'))?.name).toBe('Named');
    await db.execAsync('CREATE TABLE scratch_x (a INTEGER) STRICT; DROP TABLE scratch_x;');
  });

  it('foreign keys stay enforced after exporting an image and after every durable capture', async () => {
    const { db, repos } = await standaloneMatch(1);
    await db.exportAsync();
    expect(await db.getFirstAsync<{ readonly foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    await expectRejectedAndUnchanged(db, (r) => r.players.delete(L(1)));
    expect(await outcome(() => repos.players.insert({ ...eagles.players[1], id: 'ghost-player', teamId: 'no-such-team' }))).toBeInstanceOf(Error);
    const fault = await faultDatabase();
    await seedLibrary(fault, [lions]);
    await fault.withTransactionAsync(async (tx) => createRepositories(tx).venues.insert(buildVenue('fv', 'Fault Venue')));
    expect(fault.durableImages.length).toBeGreaterThan(1);
    expect(await fault.getFirstAsync<{ readonly foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    expect(await outcome(() => createRepositories(fault).players.insert({ ...eagles.players[1], id: 'ghost-player', teamId: 'no-such-team' }))).toBeInstanceOf(Error);
  });
});

describe('adversarial integrity: no REPLACE, no cascade on update or conflicting insert', () => {
  it('no source file outside tests contains INSERT OR REPLACE, REPLACE INTO or ON CONFLICT REPLACE', () => {
    const root = join(__dirname, '..', '..');
    const offenders: string[] = [];
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, 'utf8');
      if (REPLACE_PATTERNS.some((pattern) => pattern.test(text))) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never issues a REPLACE statement while seeding, updating and importing a full tournament', async () => {
    const db = await faultDatabase();
    const scenario = buildTournamentScenario('cup', 1);
    await seedTournamentScenario(db, scenario);
    const repos = createRepositories(db);
    const data = await repos.backup.exportData({ kind: 'full' });
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.tournaments.update({ ...scenario.tournament, name: 'Renamed Cup' });
      await r.tournaments.upsertStages(scenario.stages);
      await r.tournaments.upsertPools(scenario.pools);
      await r.tournaments.upsertSlots(scenario.slots);
      await r.tournaments.upsertTournamentTeams(scenario.tournamentTeams);
      await r.backup.importData({ ...emptyBackup(), venues: data.venues, teams: data.teams, players: data.players }, { libraryConflict: 'update_local' });
      await r.backup.importData({ ...emptyBackup(), venues: data.venues, teams: data.teams, players: data.players }, { libraryConflict: 'keep_local' });
    });
    const offenders = db.statementLog.filter((s) => REPLACE_PATTERNS.some((pattern) => pattern.test(s.sql))).map((s) => s.sql);
    expect(offenders).toEqual([]);
  });

  it('a duplicate matches.insert fails without touching the existing match, squad or log', async () => {
    const { db, repos } = await standaloneMatch();
    await expectRejectedAndUnchanged(db, (r) =>
      r.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', title: 'Hijack' }), squadsFor(lions, tigers)),
    );
    const before = await dump(db);
    expect(await outcome(() => repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', title: 'Hijack' }), []))).toBeInstanceOf(Error);
    expect(await dump(db)).toEqual(before);
  });

  it('duplicate library inserts fail, and team updates never cascade to its players or squads', async () => {
    const { db, repos } = await standaloneMatch();
    await expectRejectedAndUnchanged(db, (r) => r.teams.insert({ ...lions.team, name: 'Impostors' }));
    await expectRejectedAndUnchanged(db, (r) => r.players.insert({ ...lions.players[0], name: 'Impostor' }));
    await expectRejectedAndUnchanged(db, (r) => r.venues.insert(buildVenue('v1', 'Impostor Ground')));
    const before = await counts(db);
    await expectAccepted(db, async (r) => {
      await r.teams.update({ ...lions.team, name: 'Lions XI', updatedAt: isoAt(50) });
      await r.players.update({ ...lions.players[0], name: 'Renamed Opener', updatedAt: isoAt(50) });
      await r.venues.update({ ...buildVenue('v1', 'Renamed Ground'), updatedAt: isoAt(50) });
    });
    expect(await counts(db)).toEqual(before);
    expect((await repos.teams.get('lio'))?.name).toBe('Lions XI');
    expect((await repos.matches.getSetup('m1'))?.players.find((p) => p.playerId === L(1))?.name).toBe('Renamed Opener');
  });

  it('update of a missing library row never creates it', async () => {
    const { db, repos } = await openTestRepositories();
    await inTx(db, (r) => r.teams.update(hawks.team));
    await inTx(db, (r) => r.venues.update(buildVenue('ghost', 'Ghost')));
    expect(await repos.teams.get('haw')).toBeNull();
    expect(await repos.venues.get('ghost')).toBeNull();
    expect(await countRows(db, 'teams')).toBe(0);
  });

  it('tournament updates and structure upserts on a played tournament never cascade to children', async () => {
    const { db, repos, scenario } = await withScenario();
    const before = await counts(db);
    const snapshotBefore = await repos.tournaments.getSnapshot('cup', 1);
    await expectAccepted(db, async (r) => {
      await r.tournaments.update({ ...scenario.tournament, name: 'Renamed Cup', updatedAt: isoAt(70000) });
      await r.tournaments.updateRules({ ...scenario.rules, updatedAt: isoAt(70000) });
      await r.tournaments.upsertTournamentTeams(scenario.tournamentTeams);
      await r.tournaments.upsertStages(scenario.stages.map((s) => ({ ...s, name: `${s.name} (edited)` })));
      await r.tournaments.upsertPools(scenario.pools.map((p) => ({ ...p, name: `${p.name}*` })));
      await r.tournaments.upsertSlots(scenario.slots);
      for (const fixture of scenario.fixtures) {
        await r.tournaments.updateFixture({ ...fixture, notes: 'checked' });
      }
    });
    expect(await counts(db)).toEqual(before);
    const snapshotAfter = await repos.tournaments.getSnapshot('cup', 1);
    expect(snapshotAfter?.fixtures.map((f) => [f.id, f.matchId, f.status])).toEqual(snapshotBefore?.fixtures.map((f) => [f.id, f.matchId, f.status]));
    expect(snapshotAfter?.overrides).toEqual(snapshotBefore?.overrides);
    expect(Object.keys(snapshotAfter?.summaries ?? {}).sort()).toEqual(Object.keys(snapshotBefore?.summaries ?? {}).sort());
  });

  it('matches.update with a stale configuration object never rewrites the projection of a completed match', async () => {
    const { db, repos, events } = await standaloneMatch();
    await db.withTransactionAsync(async (tx) => createRepositories(tx).matches.writeProjection(completedProjection()));
    const completed = await repos.matches.get('m1');
    const projection = await readMatchProjection(db, 'm1');
    const stale = buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live', venueId: 'v1', title: 'Lions v Tigers (renamed)' });
    expect(await inTx(db, (r) => r.matches.update(stale))).toBeNull();
    const after = await repos.matches.get('m1');
    expect(after?.title).toBe('Lions v Tigers (renamed)');
    expect(after?.status).toBe('completed');
    expect(after?.result).toEqual(goldenResult(golden));
    expect(after?.winnerTeamId).toBe(completed?.winnerTeamId);
    expect(after?.completedAt).toBe(completed?.completedAt);
    expect((await readMatchProjection(db, 'm1'))?.summary).toEqual(projection?.summary);
    expect(await repos.events.listByMatch('m1')).toEqual(events);
  });

  it('writeProjection with fewer innings removes the stale innings and their partnerships', async () => {
    const { db } = await standaloneMatch();
    await db.withTransactionAsync(async (tx) => createRepositories(tx).matches.writeProjection(completedProjection()));
    expect(await countRows(db, 'innings', 'match_id = ?', ['m1'])).toBe(2);
    const reopened = liveProjection(isoAt(9500));
    const firstOnly: MatchProjection = {
      ...reopened,
      innings: reopened.innings.slice(0, 1),
      partnerships: reopened.partnerships.filter((p) => p.inningsIndex === 0),
    };
    await expectAccepted(db, (r) => r.matches.writeProjection(firstOnly));
    expect(await countRows(db, 'innings', 'match_id = ?', ['m1'])).toBe(1);
    expect(await countRows(db, 'partnerships', 'match_id = ? AND innings_index = 1', ['m1'])).toBe(0);
    const stored = await readMatchProjection(db, 'm1');
    expect(stored?.innings).toHaveLength(1);
    expect(stored?.summary).toBeNull();
    expect(stored?.result).toBeNull();
  });

  it('import with update_local updates library rows in place: players, squads and logs survive, nothing is deleted', async () => {
    const db = await faultDatabase();
    await seedLibrary(db, [lions, tigers]);
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
      await r.events.append(goldenMatchEvents(golden).slice(0, 10));
    });
    const before = await counts(db);
    db.clearLog();
    const data: BackupData = {
      ...emptyBackup(),
      teams: [{ ...lions.team, name: 'Lions Imported' }],
      players: lions.players.map((p) => ({ ...p, name: `${p.name} (imported)` })),
    };
    await expectAccepted(db, (r) => r.backup.importData(data, { libraryConflict: 'keep_local' }));
    expect((await createRepositories(db).teams.get('lio'))?.name).toBe('Lions');
    await expectAccepted(db, (r) => r.backup.importData(data, { libraryConflict: 'update_local' }));
    expect(await counts(db)).toEqual(before);
    expect((await createRepositories(db).teams.get('lio'))?.name).toBe('Lions Imported');
    expect((await createRepositories(db).players.getMany([L(1)]))[0]?.name).toBe(`${lions.players[0].name} (imported)`);
    const writes = db.statementLog.filter((s) => /^\s*DELETE\b/i.test(s.sql));
    expect(writes.map((s) => s.sql)).toEqual([]);
  });

  it('import refuses an aggregate that already exists instead of merging it, changing nothing', async () => {
    const { db, repos } = await withScenario();
    await seedLibrary(db, [lions, tigers]);
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
      await r.events.append(goldenMatchEvents(golden).slice(0, 10));
    });
    const tournament = await repos.backup.exportData({ kind: 'tournament', tournamentId: 'cup' });
    const match = await repos.backup.exportData({ kind: 'match', matchId: 'm1' });
    await expectRejectedAndUnchanged(db, (r) => r.backup.importData(tournament, { libraryConflict: 'keep_local' }));
    await expectRejectedAndUnchanged(db, (r) => r.backup.importData(match, { libraryConflict: 'keep_local' }));
    const extraEvent = extraBall(11, 'smuggled');
    await expectRejectedAndUnchanged(db, (r) => r.backup.importData({ ...match, matchEvents: [...match.matchEvents, extraEvent] }, { libraryConflict: 'update_local' }));
  });

  it('import refuses library rows that break CHECK constraints instead of skipping them', async () => {
    const { db } = await openTestRepositories();
    const badTeam: Team = { ...eagles.team, captainId: null, shortName: 'TOOLONG' };
    const badPlayer: Player = { ...hawks.players[0], jerseyNumber: 1000 };
    for (const libraryConflict of ['keep_local', 'update_local'] as const) {
      await expectRejectedAndUnchanged(db, (r) => r.backup.importData({ ...emptyBackup(), teams: [badTeam] }, { libraryConflict }));
      await expectRejectedAndUnchanged(db, (r) =>
        r.backup.importData({ ...emptyBackup(), teams: [{ ...hawks.team, captainId: null }], players: [badPlayer] }, { libraryConflict }),
      );
      await expectRejectedAndUnchanged(db, (r) => r.backup.importData({ ...emptyBackup(), venues: [buildVenue('blank', '  ')] }, { libraryConflict }));
    }
  });

  it('import aborts entirely on a dangling reference or an event naming a player outside the imported squad', async () => {
    const source = await openTestRepositories();
    const scenario = buildTournamentScenario('cup', 1);
    await seedTournamentScenario(source.db, scenario);
    const data = await source.repos.backup.exportData({ kind: 'tournament', tournamentId: 'cup' });
    const { db } = await openTestRepositories();
    await seedLibrary(db, scenario.teams, scenario.venues);
    const withoutSlot = { ...data, slots: data.slots.filter((s) => s.id !== 'cup-slot-0') };
    await expectRejectedAndUnchanged(db, (r) => r.backup.importData(withoutSlot, { libraryConflict: 'keep_local' }));
    const usedStriker = data.matchEvents.find((e) => e.kind === 'innings_started');
    if (usedStriker === undefined || usedStriker.kind !== 'innings_started') {
      throw new Error('no innings_started in export');
    }
    const withoutSquadPlayer = {
      ...data,
      matchPlayers: data.matchPlayers.filter((p) => !(p.matchId === usedStriker.matchId && p.playerId === usedStriker.strikerId)),
    };
    await expectRejectedAndUnchanged(db, (r) => r.backup.importData(withoutSquadPlayer, { libraryConflict: 'keep_local' }));
    const withoutFixture = { ...data, fixtures: data.fixtures.filter((f) => f.id !== 'cup-sf1') };
    await expectRejectedAndUnchanged(db, (r) => r.backup.importData(withoutFixture, { libraryConflict: 'keep_local' }));
    await expectAccepted(db, (r) => r.backup.importData(data, { libraryConflict: 'keep_local' }));
  });

  it('the audit log is append-only: a duplicate id is refused and the original entry is kept', async () => {
    const { db, repos } = await openTestRepositories();
    const entry: AuditEvent = {
      id: 'audit-1',
      tournamentId: null,
      matchId: null,
      action: 'backup_imported',
      entityType: 'backup',
      entityId: 'export-1',
      summary: 'Imported backup',
      previousValue: null,
      newValue: { imported: 3 },
      reason: null,
      impact: null,
      createdAt: isoAt(10),
    };
    await repos.audit.append(entry);
    await expectRejectedAndUnchanged(db, (r) => r.audit.append({ ...entry, summary: 'Tampered' }));
    expect(await repos.audit.list({ limit: 10 })).toEqual([entry]);
  });

  it('overrides cannot be overwritten by a duplicate id, and revoking keeps the row', async () => {
    const { db, repos } = await withScenario();
    const original = buildTournamentScenario('cup', 1).overrides[0];
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.insertOverride({ ...original, reason: 'Tampered' } as TournamentOverride));
    await repos.tournaments.revokeOverride(original.id, isoAt(90000), 'Appeal upheld');
    const stored = (await repos.tournaments.getSnapshot('cup', 1))?.overrides.find((o) => o.id === original.id);
    expect(stored).toEqual({ ...original, revokedAt: isoAt(90000), revokeReason: 'Appeal upheld' });
    expect(await countRows(db, 'tournament_overrides')).toBe(2);
  });
});

describe('adversarial integrity: deep-equal round trips of edge values (IT-DB-03)', () => {
  it('library rows keep falsy, empty, quoted and unicode values exactly; a captain may be inserted before the player', async () => {
    const { db, repos } = await openTestRepositories();
    const team: Team = {
      id: 'edge-team',
      name: "O'Brien XI — Ünïcödé 🏏",
      shortName: 'OBX',
      logoUri: '',
      captainId: 'edge-p0',
      createdAt: isoAt(1),
      updatedAt: isoAt(2),
      archivedAt: isoAt(3),
    };
    const players: Player[] = [
      { id: 'edge-p0', teamId: 'edge-team', name: "Robert'); DROP TABLE players;--", jerseyNumber: 0, role: 'unknown', createdAt: isoAt(1), updatedAt: isoAt(1), archivedAt: null },
      { id: 'edge-p1', teamId: 'edge-team', name: 'Ali "The Wall" \\ Khan', jerseyNumber: 999, role: 'wicket_keeper', createdAt: isoAt(1), updatedAt: isoAt(1), archivedAt: isoAt(4) },
      { id: 'edge-p2', teamId: 'edge-team', name: '%_ wildcard', jerseyNumber: null, role: 'all_rounder', createdAt: isoAt(1), updatedAt: isoAt(1), archivedAt: null },
    ];
    const venue: Venue = { id: 'edge-venue', name: 'Ground\nwith newline', location: '', notes: '', createdAt: isoAt(1), updatedAt: isoAt(1), archivedAt: null };
    await expectAccepted(db, async (r) => {
      await r.teams.insert(team);
      for (const player of players) {
        await r.players.insert(player);
      }
      await r.venues.insert(venue);
    });
    expect(await repos.teams.get('edge-team')).toEqual(team);
    const stored = await repos.players.getMany(players.map((p) => p.id));
    expect([...stored].sort((a, b) => a.id.localeCompare(b.id))).toEqual(players);
    expect(await repos.venues.get('edge-venue')).toEqual(venue);
    expect(await countRows(db, 'players')).toBe(3);
  });

  it('event payloads keep null versus absent optional fields, empty arrays and fielder order', async () => {
    const { db, repos } = await standaloneMatch(0);
    const log: MatchEvent[] = [
      ev(1, { kind: 'innings_started', inningsIndex: 0, battingTeamId: 'lio', strikerId: L(1), nonStrikerId: L(2), bowlerId: T(7) }),
      ev(2, { kind: 'overs_revised', inningsIndex: 0, maxBalls: 12, target: null, maxOversPerBowler: null, powerplays: [], terminal: false, reason: 'Rain' }),
      ev(3, { kind: 'overs_revised', inningsIndex: 1, maxBalls: 12, target: 30, terminal: false, reason: 'Rain again' }),
      ev(4, { kind: 'delivery', call: 'fair', runsTo: 'bat', strikerId: L(1), nonStrikerId: null, bowlerId: T(7), runsRun: 2, shortRuns: 1, boundary: 0, wicket: { type: 'run_out', playerOutId: L(1), fielderIds: [T(9), T(3)], dismissalEnd: 'non_striker_end' } }),
      ev(5, { kind: 'delivery', call: 'wide', strikerId: L(2), nonStrikerId: L(3), bowlerId: T(7), runsRun: 0, shortRuns: 0, boundary: 4, wicket: null }),
      ev(6, { kind: 'play_suspended', reason: 'other', note: '' }),
      ev(7, { kind: 'play_suspended', reason: 'rain', note: null }),
      ev(8, { kind: 'penalty_awarded', teamId: 'tig', inningsIndex: 0, runs: 5, reason: 'Helmet — Law 28.3 "struck"' }),
      ev(9, { kind: 'innings_ended', reason: 'declared', absentees: [] }),
      ev(10, { kind: 'match_ended', outcome: { type: 'awarded', winnerTeamId: null, reason: 'Crowd trouble', margin: null } }),
    ];
    await expectAccepted(db, (r) => r.events.append(log));
    const stored = await repos.events.listByMatch('m1');
    expect(stored).toEqual(log);
    const revision = stored[1];
    const plain = stored[2];
    if (revision.kind !== 'overs_revised' || plain.kind !== 'overs_revised') {
      throw new Error('unexpected kinds');
    }
    expect(revision.maxOversPerBowler).toBeNull();
    expect('bowlerQuotaMode' in revision).toBe(false);
    expect(revision.powerplays).toEqual([]);
    expect('maxOversPerBowler' in plain).toBe(false);
    expect('powerplays' in plain).toBe(false);
  });

  it('tournament venue links keep their order through insert and update', async () => {
    const { db, repos } = await openTestRepositories();
    await seedLibrary(db, [], [buildVenue('va', 'A Ground'), buildVenue('vb', 'B Ground'), buildVenue('vc', 'C Ground')]);
    const tournament = buildTournament({ id: 'tv', venueIds: ['vc', 'va', 'vb'], description: '', notes: '' });
    await expectAccepted(db, (r) => r.tournaments.insert(tournament, buildTournamentRules('tv')));
    expect((await repos.tournaments.getSnapshot('tv', 1))?.tournament).toEqual(tournament);
    const updated = { ...tournament, venueIds: ['vb', 'vc'], updatedAt: isoAt(5) };
    await expectAccepted(db, (r) => r.tournaments.update(updated));
    expect((await repos.tournaments.getSnapshot('tv', 1))?.tournament).toEqual(updated);
  });

  it('audit JSON values keep falsy scalars, empty strings and nested nulls', async () => {
    const { repos } = await openTestRepositories();
    const entries: AuditEvent[] = [
      { id: 'a0', tournamentId: null, matchId: null, action: 'backup_imported', entityType: 'app', entityId: 'x', summary: '', previousValue: 0, newValue: false, reason: '', impact: null, createdAt: isoAt(1) },
      { id: 'a1', tournamentId: null, matchId: null, action: 'backup_imported', entityType: 'app', entityId: 'y', summary: 'S', previousValue: '', newValue: { a: null, b: [0, false, '', null], c: { d: [] } }, reason: null, impact: null, createdAt: isoAt(2) },
      { id: 'a2', tournamentId: null, matchId: null, action: 'backup_imported', entityType: 'app', entityId: 'z', summary: 'S', previousValue: 'null', newValue: [], reason: 'r', impact: null, createdAt: isoAt(3) },
    ];
    for (const entry of entries) {
      await repos.audit.append(entry);
    }
    const stored = await repos.audit.list({ limit: 10 });
    expect([...stored].sort((a, b) => a.id.localeCompare(b.id))).toEqual(entries);
  });

  it('settings keep false values and nested objects', async () => {
    const { repos } = await openTestRepositories();
    const settings: AppSettings = {
      theme: 'dark',
      hapticsEnabled: false,
      soundEnabled: false,
      reducedMotion: 'off',
      defaultFormatId: 'T10',
      scoring: { confirmInningsEnd: false, autoPromptBowler: false, dotStyle: 'dot', keepAwake: false },
    };
    for (const key of Object.keys(settings) as (keyof AppSettings)[]) {
      await repos.settings.set(key, settings[key], isoAt(5));
    }
    expect(await repos.settings.getAll()).toEqual(settings);
    await repos.settings.set('hapticsEnabled', true, isoAt(6));
    await repos.settings.set('hapticsEnabled', false, isoAt(7));
    expect(await repos.settings.getAll()).toEqual(settings);
  });

  it('two-phase upserts rotate three order indexes, and a failed batch leaves no half-shifted index behind', async () => {
    const { db, repos, bare } = await withBare();
    const third: Stage = buildStage({ id: 't1-plate', tournamentId: 't1', name: 'Plate', type: 'custom', orderIndex: 2, config: stageConfig() });
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.tournaments.upsertStages([third]);
      await r.tournaments.upsertPools([
        buildPool({ id: 'pool-b', stageId: bare.groupStageId, name: 'Pool B', orderIndex: 1 }),
        buildPool({ id: 'pool-c', stageId: bare.groupStageId, name: 'Pool C', orderIndex: 2 }),
      ]);
      await r.tournaments.upsertSlots([0, 1, 2].map((i) => manualSlot(`rs${i}`, bare.knockoutStageId, i)));
    });
    const snapshot = await repos.tournaments.getSnapshot('t1', 1);
    if (snapshot === null) {
      throw new Error('no snapshot');
    }
    const rotate = (index: number): number => (index + 1) % 3;
    await expectAccepted(db, async (r) => {
      await r.tournaments.upsertStages(snapshot.stages.map((s) => ({ ...s, orderIndex: rotate(s.orderIndex) })));
      await r.tournaments.upsertPools(snapshot.pools.map((p) => ({ ...p, orderIndex: rotate(p.orderIndex) })));
      await r.tournaments.upsertSlots(snapshot.slots.map((s) => ({ ...s, index: rotate(s.index) })));
    });
    const rotated = await repos.tournaments.getSnapshot('t1', 1);
    expect(Object.fromEntries((rotated?.stages ?? []).map((s) => [s.id, s.orderIndex]))).toEqual(
      Object.fromEntries(snapshot.stages.map((s) => [s.id, rotate(s.orderIndex)])),
    );
    expect(Object.fromEntries((rotated?.pools ?? []).map((p) => [p.id, p.orderIndex]))).toEqual(
      Object.fromEntries(snapshot.pools.map((p) => [p.id, rotate(p.orderIndex)])),
    );
    expect(Object.fromEntries((rotated?.slots ?? []).map((s) => [s.id, s.index]))).toEqual(
      Object.fromEntries(snapshot.slots.map((s) => [s.id, rotate(s.index)])),
    );
    const pools = rotated?.pools ?? [];
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.upsertPools(pools.slice(0, 2).map((p) => ({ ...p, orderIndex: 7 }))));
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.upsertPools([{ ...pools[0], orderIndex: pools[1].orderIndex }]));
    const maxIndex = await db.getFirstAsync<{ readonly m: number }>(
      'SELECT max(m) AS m FROM (SELECT max(order_index) AS m FROM pools UNION ALL SELECT max(slot_index) FROM stage_slots UNION ALL SELECT max(order_index) FROM tournament_stages)',
    );
    expect(maxIndex?.m).toBeLessThan(1000);
  });
});

const INVARIANTS: readonly (readonly [string, string])[] = [
  [
    'squad_team_not_in_match',
    "SELECT mp.match_id || '/' || mp.player_id AS id FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.team_id NOT IN (m.team_a_id, m.team_b_id)",
  ],
  [
    'innings_team_not_in_match',
    "SELECT i.match_id || '/' || i.innings_index AS id FROM innings i JOIN matches m ON m.id = i.match_id WHERE i.batting_team_id NOT IN (m.team_a_id, m.team_b_id) OR i.bowling_team_id NOT IN (m.team_a_id, m.team_b_id)",
  ],
  ['event_seq_not_contiguous', 'SELECT match_id AS id FROM match_events GROUP BY match_id HAVING min(seq) <> 1 OR max(seq) <> count(*)'],
  [
    'tournament_match_team_not_member',
    'SELECT m.id FROM matches m WHERE m.tournament_id IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM tournament_teams t WHERE t.tournament_id = m.tournament_id AND t.team_id = m.team_a_id) OR NOT EXISTS (SELECT 1 FROM tournament_teams t WHERE t.tournament_id = m.tournament_id AND t.team_id = m.team_b_id))',
  ],
  [
    'match_fixture_outside_its_tournament',
    'SELECT m.id FROM matches m LEFT JOIN fixtures f ON f.id = m.fixture_id WHERE m.fixture_id IS NOT NULL AND (f.id IS NULL OR m.tournament_id IS NOT f.tournament_id)',
  ],
  ['fixture_match_not_its_own', 'SELECT f.id FROM fixtures f JOIN matches m ON m.id = f.match_id WHERE m.fixture_id IS NOT f.id'],
  ['played_fixture_without_match', "SELECT id FROM fixtures WHERE status IN ('live', 'completed', 'abandoned') AND match_id IS NULL"],
  [
    'fixture_team_not_member',
    'SELECT f.id FROM fixtures f WHERE (f.side_a_team_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tournament_teams t WHERE t.tournament_id = f.tournament_id AND t.team_id = f.side_a_team_id)) OR (f.side_b_team_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tournament_teams t WHERE t.tournament_id = f.tournament_id AND t.team_id = f.side_b_team_id))',
  ],
  ['terminal_match_without_result', "SELECT id FROM matches WHERE (status IN ('completed', 'abandoned')) <> (result_json IS NOT NULL)"],
];

async function violations(db: SqlExecutor): Promise<string[]> {
  const out: string[] = [];
  const fk = await db.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
  for (const row of fk) {
    out.push(`foreign_key_check: ${JSON.stringify(row)}`);
  }
  for (const [name, sql] of INVARIANTS) {
    const rows = await db.getAllAsync<{ readonly id: string }>(sql);
    for (const row of rows) {
      out.push(`${name}: ${row.id}`);
    }
  }
  return out;
}

const m3Golden: GoldenMatchOptions = { ...golden, matchId: 'm3', idPrefix: 'm3-' };

async function playedWorld(): Promise<{ readonly db: SqlJsTestDatabase; readonly repos: Repositories; readonly scenario: TournamentScenario }> {
  const { db, repos, scenario } = await withScenario();
  await seedLibrary(db, [lions, tigers, eagles], [buildVenue('v1', 'Gaddafi Stadium')]);
  await db.withTransactionAsync(async (tx) => {
    const r = createRepositories(tx);
    await r.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live', venueId: 'v1' }), squadsFor(lions, tigers));
    await r.events.append(goldenMatchEvents(golden));
    await r.matches.writeProjection(completedProjection());
    await r.matches.insert(buildMatch({ id: 'm3', teamAId: 'lio', teamBId: 'tig', status: 'live', toss: null }), squadsFor(lions, tigers));
    await r.events.append(goldenMatchEvents(m3Golden).slice(0, 10));
    await r.matches.writeProjection(goldenProjection(m3Golden, { projectionVersion: 1, teamAId: 'lio', at: isoAt(8000), completed: false }));
  });
  return { db, repos, scenario };
}

interface SweepResult {
  readonly injected: number;
  readonly leaks: readonly string[];
  readonly committed: boolean;
}

async function errorSweep(db: FaultInjectingDatabase, record: () => Promise<unknown>, before: string): Promise<SweepResult> {
  const imagesBefore = db.durableImages.length;
  const leaks: string[] = [];
  let injected = 0;
  let committed = false;
  for (let k = 1; k <= 400 && !committed; k += 1) {
    db.clearFaults();
    db.clearLog();
    db.failOn({ sql: /^(?!\s*ROLLBACK\b)/i, occurrence: k, error: sqliteError('SQLITE_IOERR') });
    const error = await outcome(record);
    const hit = db.statementLog.find((s) => s.outcome === 'injected');
    db.clearFaults();
    if (hit === undefined) {
      if (error !== null) {
        leaks.push(`the clean attempt failed: ${String(error)}`);
      }
      committed = true;
    } else if (error === null) {
      injected += 1;
      leaks.push(`statement ${k} (${hit.sql.slice(0, 60)}) failed but the use case committed`);
      committed = true;
    } else {
      injected += 1;
      if (db.durableImages.length !== imagesBefore) {
        leaks.push(`statement ${k} (${hit.sql.slice(0, 60)}) produced a durable image`);
      }
      if (JSON.stringify(await dump(db)) !== before) {
        leaks.push(`statement ${k} (${hit.sql.slice(0, 60)}) left partial writes`);
      }
    }
  }
  return { injected, leaks, committed };
}

function lonelyTeam(id: string): Team {
  return { id, name: `Lone ${id}`, shortName: id.slice(0, 5).toUpperCase(), logoUri: null, captainId: null, createdAt: isoAt(1), updatedAt: isoAt(1), archivedAt: null };
}

describe('adversarial integrity: the schema as the last line of defence', () => {
  it('raw SQL attacks on a played world are refused and never leave an integrity violation behind', async () => {
    const { db } = await playedWorld();
    expect(await violations(db)).toEqual([]);
    const image = await db.exportAsync();
    const m1First = (await createRepositories(db).events.listByMatch('m1'))[0].id;
    const attacks: readonly string[] = [
      "UPDATE matches SET team_b_id = 'eag' WHERE id = 'm3'",
      "UPDATE matches SET team_a_id = 'eag' WHERE id = 'm3'",
      "UPDATE match_players SET team_id = 'eag' WHERE match_id = 'm1' AND player_id = 'lio-p1'",
      "INSERT INTO match_players (match_id, player_id, team_id) VALUES ('m1', 'eag-p1', 'eag')",
      "UPDATE innings SET batting_team_id = 'eag' WHERE match_id = 'm1' AND innings_index = 0",
      "UPDATE innings SET bowling_team_id = batting_team_id WHERE match_id = 'm1'",
      "UPDATE fixtures SET match_id = NULL WHERE id = 'cup-g1'",
      "UPDATE fixtures SET match_id = 'cup-m-g2' WHERE id = 'cup-g1'",
      "UPDATE matches SET fixture_id = 'cup-g2' WHERE id = 'cup-m-g1'",
      "UPDATE matches SET tournament_id = NULL WHERE id = 'cup-m-g1'",
      "UPDATE matches SET tournament_id = NULL, fixture_id = NULL WHERE id = 'cup-m-g1'",
      "UPDATE matches SET tournament_id = 'cup', fixture_id = 'cup-g1' WHERE id = 'm1'",
      "UPDATE matches SET tournament_id = 'cup' WHERE id = 'm3'",
      "DELETE FROM tournament_teams WHERE team_id = 'cup-lio'",
      "UPDATE tournament_teams SET team_id = 'eag' WHERE id = 'cup-tt-1'",
      "DELETE FROM match_players WHERE match_id = 'm1' AND player_id = 'lio-p1'",
      `UPDATE match_events SET match_id = 'm3' WHERE id = '${m1First}'`,
      "DELETE FROM stage_slots WHERE id = 'cup-slot-0'",
      "UPDATE stage_slots SET stage_id = 'cup-groups' WHERE id = 'cup-slot-0'",
      "DELETE FROM pools WHERE id = 'cup-pool-a'",
      "DELETE FROM tournament_stages WHERE id = 'cup-groups'",
      "DELETE FROM matches WHERE id = 'cup-m-g1'",
      "DELETE FROM fixtures WHERE id = 'cup-sf1'",
      "INSERT INTO pool_teams (id, pool_id, stage_id, tournament_id, team_id) VALUES ('dup', 'cup-pool-b', 'cup-groups', 'cup', 'cup-lio')",
      "UPDATE fixtures SET is_final = 1 WHERE id = 'cup-sf1'",
      "UPDATE fixtures SET bracket_position = 0 WHERE id = 'cup-sf2'",
      "UPDATE fixtures SET side_b_team_id = side_a_team_id WHERE id = 'cup-g1'",
      "UPDATE fixtures SET side_a_slot_id = 'cup-slot-1' WHERE id = 'cup-g1'",
      "UPDATE matches SET status = 'completed' WHERE id = 'm3'",
      "UPDATE matches SET status = 'abandoned' WHERE id = 'm1'",
      "UPDATE matches SET summary_json = '{}' WHERE id = 'm3'",
      "UPDATE matches SET winner_team_id = 'eag' WHERE id = 'm1'",
      "UPDATE tournaments SET revision = -1 WHERE id = 'cup'",
      "DELETE FROM players WHERE id = 'cup-lio-p1'",
      "DELETE FROM teams WHERE id = 'cup-lio'",
      "DELETE FROM teams WHERE id = 'lio'",
      "DELETE FROM venues WHERE id = 'cup-venue-1'",
      "DELETE FROM venues WHERE id = 'v1'",
      "DELETE FROM tournaments WHERE id = 'cup'",
    ];
    const breaches: { readonly sql: string; readonly rejected: boolean; readonly violations: readonly string[] }[] = [];
    for (const sql of attacks) {
      const target = await reopen(image);
      expect(await target.getFirstAsync<{ readonly foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
      const before = await dump(target);
      const error = await outcome(() => target.runAsync(sql));
      const found = await violations(target);
      const rejected = error instanceof Error;
      if (rejected) {
        expect(await dump(target)).toEqual(before);
      }
      if (!rejected || found.length > 0) {
        breaches.push({ sql, rejected, violations: found });
      }
      await target.closeAsync();
    }
    expect(breaches).toEqual([]);
  });

  it('refuses a tournament whose end date precedes its start date, at insert and at update', async () => {
    const { db, repos } = await openTestRepositories();
    await expectRejectedAndUnchanged(db, (r) =>
      r.tournaments.insert(buildTournament({ id: 'rev', startDate: '2026-06-10', endDate: '2026-06-01' }), buildTournamentRules('rev')),
    );
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.insert(buildTournament({ id: 'fmt', startDate: '1/6/2026' }), buildTournamentRules('fmt')));
    const sameDay = buildTournament({ id: 'day', startDate: '2026-06-01', endDate: '2026-06-01' });
    await expectAccepted(db, (r) => r.tournaments.insert(sameDay, buildTournamentRules('day')));
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.update({ ...sameDay, startDate: '2026-07-01', endDate: '2026-06-30' }));
    expect((await repos.tournaments.getSnapshot('day', 1))?.tournament).toEqual(sameDay);
    expect(await countRows(db, 'tournament_rules')).toBe(1);
  });

  it('a fixture can only point at a match that names it back, and a played status needs that match', async () => {
    const { db, bare } = await withBare();
    const f = buildFixture({ id: 'f1', tournamentId: 't1', stageId: bare.groupStageId, poolId: bare.poolId, sideA: teamSide('lio'), sideB: teamSide('tig') });
    const tm = buildMatch({ id: 'tm', teamAId: 'lio', teamBId: 'tig', tournamentId: 't1' });
    await expectAccepted(db, async (r) => {
      await r.tournaments.insertFixtures([f]);
      await r.matches.insert(tm, squadsFor(lions, tigers));
    });
    for (const status of ['live', 'completed', 'abandoned'] as const) {
      await expectRejectedAndUnchanged(db, (r) => r.tournaments.updateFixture({ ...f, status }));
    }
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.insertFixtures([{ ...f, id: 'f2', matchNumber: 2, status: 'completed' }]));
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.updateFixture({ ...f, matchId: 'tm', status: 'live' }));
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.updateFixture({ ...f, matchId: 'no-such-match', status: 'live' }));
    await expectAccepted(db, async (r) => {
      await r.matches.update({ ...tm, fixtureId: 'f1' });
      await r.tournaments.updateFixture({ ...f, matchId: 'tm', status: 'live' });
    });
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.insertFixtures([{ ...f, id: 'f3', matchNumber: 3, matchId: 'tm', status: 'live' }]));
    expect(await violations(db)).toEqual([]);
  });

  it('a standalone match can never carry a fixture, and a played tournament match can never be detached from its tournament', async () => {
    const { db, repos, scenario } = await withScenario();
    const [lio, tig] = scenario.teams;
    await expectRejectedAndUnchanged(db, (r) =>
      r.matches.insert(buildMatch({ id: 'rogue', teamAId: lio.team.id, teamBId: tig.team.id, tournamentId: null, fixtureId: 'cup-g1' }), squadsFor(lio, tig)),
    );
    const friendly = buildMatch({ id: 'friendly', teamAId: lio.team.id, teamBId: tig.team.id });
    await expectAccepted(db, (r) => r.matches.insert(friendly, squadsFor(lio, tig)));
    await inTx(db, (r) => r.matches.update({ ...friendly, fixtureId: 'cup-g1' }));
    expect((await repos.matches.get('friendly'))?.fixtureId).toBeNull();
    const played = await repos.matches.get('cup-m-g1');
    if (played === null) {
      throw new Error('scenario match missing');
    }
    await inTx(db, (r) => r.matches.update({ ...played, tournamentId: null }));
    await inTx(db, (r) => r.matches.update({ ...played, tournamentId: null, fixtureId: null }));
    const after = await repos.matches.get('cup-m-g1');
    expect([after?.tournamentId, after?.fixtureId]).toEqual(['cup', 'cup-g1']);
    expect(await violations(db)).toEqual([]);
  });

  it('refuses squad rows that break the substitute rule or a positive batting order, side sizes outside 2..15 and a foreign toss winner', async () => {
    const { db, repos } = await standaloneMatch(1);
    const guest = eagles.players[1].id;
    expect((await repos.matches.getSetup('m1'))?.players.some((p) => p.playerId === guest)).toBe(false);
    const entry = (patch: Partial<MatchSquadEntry>): MatchSquadEntry => ({
      playerId: guest,
      battingOrder: null,
      isCaptain: false,
      isWicketKeeper: false,
      isSubstitute: true,
      ...patch,
    });
    for (const bad of [
      entry({ battingOrder: 3 }),
      entry({ isCaptain: true }),
      entry({ isSubstitute: false, battingOrder: 0 }),
      entry({ isSubstitute: false, battingOrder: -1 }),
      entry({ playerId: L(1) }),
      entry({ playerId: 'no-such-player' }),
    ]) {
      await expectRejectedAndUnchanged(db, (r) => r.matches.addSquadPlayer('m1', 'lio', bad));
    }
    for (const size of [0, 1, 16]) {
      await expectRejectedAndUnchanged(db, (r) => r.matches.insert(buildMatch({ id: `a-${size}`, teamAId: 'lio', teamBId: 'tig', teamAPlayers: size }), []));
      await expectRejectedAndUnchanged(db, (r) => r.matches.insert(buildMatch({ id: `b-${size}`, teamAId: 'lio', teamBId: 'tig', teamBPlayers: size }), []));
    }
    await expectRejectedAndUnchanged(db, (r) => r.matches.insert(buildMatch({ id: 'self', teamAId: 'lio', teamBId: 'lio' }), []));
    const m1 = await repos.matches.get('m1');
    if (m1 === null) {
      throw new Error('match missing');
    }
    await expectRejectedAndUnchanged(db, (r) => r.matches.update({ ...m1, toss: { winnerTeamId: 'eag', decision: 'bat' } }));
    await expectRejectedAndUnchanged(db, (r) => r.matches.update({ ...m1, teamAPlayers: 20 }));
    await expectAccepted(db, (r) => r.matches.addSquadPlayer('m1', 'lio', entry({})));
    await expectAccepted(db, (r) => r.matches.update({ ...m1, teamAPlayers: 15, teamBPlayers: 2 }));
    expect(await violations(db)).toEqual([]);
  });

  it('changing a match through the repository can never strand squad or innings rows of a team that no longer plays it', async () => {
    const { db, repos } = await playedWorld();
    for (const id of ['m1', 'm3']) {
      const match = await repos.matches.get(id);
      if (match === null) {
        throw new Error('match missing');
      }
      await inTx(db, (r) => r.matches.update({ ...match, teamBId: 'eag' }));
      await inTx(db, (r) => r.matches.update({ ...match, teamAId: 'eag', toss: null }));
    }
    expect(await violations(db)).toEqual([]);
  });

  it('refuses to delete a played stage, pool, fixture or a slot a fixture uses, destroying nothing', async () => {
    const { db } = await withScenario();
    const attempts: readonly (readonly [string, (r: Repositories) => Promise<unknown>])[] = [
      ['deleteStage(cup-groups)', (r) => r.tournaments.deleteStage('cup-groups')],
      ['deleteStage(cup-ko)', (r) => r.tournaments.deleteStage('cup-ko')],
      ['deletePool(cup-pool-a)', (r) => r.tournaments.deletePool('cup-pool-a')],
      ['deleteFixture(cup-final)', (r) => r.tournaments.deleteFixture('cup-final')],
      ['deleteFixture(cup-g2)', (r) => r.tournaments.deleteFixture('cup-g2')],
      ['deleteSlot(cup-slot-0)', (r) => r.tournaments.deleteSlot('cup-slot-0')],
    ];
    const image = await db.exportAsync();
    const accepted: string[] = [];
    for (const [label, attempt] of attempts) {
      const target = await reopen(image);
      const before = await dump(target);
      const error = await inTx(target, attempt);
      if (error instanceof Error) {
        expect(await dump(target)).toEqual(before);
      } else {
        accepted.push(label);
      }
      expect({ label, violations: await violations(target) }).toEqual({ label, violations: [] });
      await target.closeAsync();
    }
    expect(accepted).toEqual([]);
  });

  it('refuses to drop or re-point a membership a tournament match still uses, but lets it withdraw', async () => {
    const { db, repos, bare } = await withBare(['lio', 'tig', 'eag']);
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.tournaments.replacePoolEntries(bare.groupStageId, []);
      await r.matches.insert(buildMatch({ id: 'tm', teamAId: 'lio', teamBId: 'tig', tournamentId: 't1' }), squadsFor(lions, tigers));
    });
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.deleteTournamentTeam('t1-tt-lio'));
    await inTx(db, (r) => r.tournaments.upsertTournamentTeams([{ ...buildMembership('t1', 'lio', 1), teamId: 'haw' }]));
    expect(await violations(db)).toEqual([]);
    const withdrawn = { ...buildMembership('t1', 'lio', 1), status: 'withdrawn' as const };
    await expectAccepted(db, (r) => r.tournaments.upsertTournamentTeams([withdrawn]));
    await expectAccepted(db, (r) => r.tournaments.deleteTournamentTeam('t1-tt-eag'));
    const members = ((await repos.tournaments.getSnapshot('t1', 1))?.teams ?? []).map((view) => view.membership);
    expect(members.find((m) => m.id === 't1-tt-lio')).toEqual(withdrawn);
    expect(members.map((m) => m.teamId).sort()).toEqual(['lio', 'tig']);
    expect(await violations(db)).toEqual([]);
  });

  it('a library team referenced only by a slot source or an override cannot be deleted; an unreferenced one can', async () => {
    const { db, repos, bare } = await withBare();
    await expectAccepted(db, async (r) => {
      for (const id of ['slotted', 'penal', 'free']) {
        await r.teams.insert(lonelyTeam(id));
      }
      await r.tournaments.upsertSlots([buildSlot({ id: 'wild', stageId: bare.knockoutStageId, index: 0, source: { kind: 'manual', teamId: 'slotted' } })]);
      await r.tournaments.insertOverride({
        id: 'ov-penal',
        tournamentId: 't1',
        kind: 'expunge_results',
        stageId: null,
        teamId: 'penal',
        reason: 'Fielded an ineligible player',
        createdAt: isoAt(2),
        revokedAt: null,
        revokeReason: null,
      });
    });
    for (const id of ['slotted', 'penal']) {
      await expectRejectedAndUnchanged(db, (r) => r.teams.delete(id));
      const before = await dump(db);
      expect(await outcome(() => repos.teams.delete(id))).toBeInstanceOf(Error);
      expect(await dump(db)).toEqual(before);
    }
    await expectAccepted(db, (r) => r.teams.delete('free'));
    expect(await repos.teams.get('free')).toBeNull();
  });

  it('refuses projections with orphan partnerships, an innings bowling at itself, negative figures or an inconsistent innings status', async () => {
    const { db } = await standaloneMatch();
    await db.withTransactionAsync(async (tx) => createRepositories(tx).matches.writeProjection(liveProjection(isoAt(8000))));
    const stored = await readMatchProjection(db, 'm1');
    const good = liveProjection(isoAt(8100));
    type Line = MatchProjection['innings'][number];
    const at = (index: number, patch: Partial<Line>): MatchProjection => ({
      ...good,
      innings: good.innings.map((line, j) => (j === index ? { ...line, ...patch } : line)),
    });
    expect(good.partnerships.some((p) => p.inningsIndex === 1)).toBe(true);
    const bad: readonly MatchProjection[] = [
      { ...good, innings: good.innings.slice(0, 1) },
      at(0, { bowlingTeamId: 'lio' }),
      at(0, { runs: -1 }),
      at(1, { wickets: -1 }),
      at(0, { legalBalls: -6 }),
      at(0, { maxBalls: 0 }),
      at(0, { ballsPerOver: 0 }),
      at(0, { status: 'complete', completionReason: null }),
      at(1, { status: 'in_progress', completionReason: 'all_out' }),
      at(0, { kind: 'super_over', superOverRound: null }),
      at(0, { target: 0 }),
      { ...good, partnerships: good.partnerships.map((p, i) => (i === 0 ? { ...p, runs: -4 } : p)) },
      { ...good, partnerships: good.partnerships.map((p, i) => (i === 0 ? { ...p, batterAId: 'no-such-player' } : p)) },
    ];
    for (const projection of bad) {
      await expectRejectedAndUnchanged(db, (r) => r.matches.writeProjection(projection));
    }
    expect(await readMatchProjection(db, 'm1')).toEqual(stored);
  });
});

describe('adversarial integrity: event log writers and atomic use cases (§89)', () => {
  it('append refuses duplicate ids, seq 0, gaps, twin seqs, unknown matches and a bad event after a good one, writing nothing', async () => {
    const { db, repos, events } = await standaloneMatch(10);
    const bad: readonly (readonly MatchEvent[])[] = [
      [{ ...extraBall(11, 'dupe-id'), id: events[0].id }],
      [extraBall(0, 'seq-zero')],
      [extraBall(12, 'gap')],
      [extraBall(11, 'twin-a'), extraBall(11, 'twin-b')],
      [extraBall(11, 'ok-first'), extraBall(13, 'gap-second')],
      [{ ...extraBall(1, 'ghost-match'), matchId: 'no-such-match' }],
      [extraBall(11, 'ok-then-bad'), ev(12, ball(T(3), T(2), OUTSIDER), 'm1', 'bad-player-act')],
      [extraBall(11, 'ok-then-dup'), { ...extraBall(12, 'dup-late'), id: events[3].id }],
    ];
    for (const batch of bad) {
      await expectRejectedAndUnchanged(db, (r) => r.events.append(batch));
    }
    expect(await repos.events.listByMatch('m1')).toEqual(events);
    await expectAccepted(db, (r) => r.events.append([extraBall(11, 'next-a'), extraBall(12, 'next-b')]));
    expect(await repos.events.lastSeq('m1')).toBe(12);
    expect(await violations(db)).toEqual([]);
  });

  it('an injected error at any single statement of a wicket group + projection leaves nothing behind, and the retry commits it whole', async () => {
    const db = await faultDatabase();
    await seedLibrary(db, [lions, tigers]);
    const log = goldenMatchEvents(golden);
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
      await r.events.append(log.slice(0, 10));
      await r.matches.writeProjection(liveProjection(isoAt(100)));
    });
    const before = JSON.stringify(await dump(db));
    const group: MatchEvent[] = [
      ev(11, ball(L(2), L(1), T(8), { wicket: { type: 'caught', playerOutId: L(2), fielderIds: [T(3)], dismissalEnd: null } }), 'm1', 'grp'),
      ev(12, { kind: 'batter_in', playerId: L(3), position: 'striker' }, 'm1', 'grp'),
    ];
    const record = (): Promise<void> =>
      db.withTransactionAsync(async (tx) => {
        const r = createRepositories(tx);
        await r.events.append(group);
        await r.matches.writeProjection(liveProjection(isoAt(200)));
      });
    const { injected, leaks, committed } = await errorSweep(db, record, before);
    console.log(`[adversarial-integrity] ball error sweep: ${injected} injected failure points before a clean commit`);
    expect(leaks).toEqual([]);
    expect(committed).toBe(true);
    expect(injected).toBeGreaterThanOrEqual(5);
    expect(await createRepositories(db).events.listByMatch('m1')).toEqual([...log.slice(0, 10), ...group]);
    expect((await readMatchProjection(db, 'm1'))?.updatedAt).toBe(isoAt(200));
    const revived = await reopen(db.lastDurableImage());
    expect(await createRepositories(revived).events.lastSeq('m1')).toBe(12);
    expect(await violations(revived)).toEqual([]);
  });

  it('a tournament match inserted concurrently with a confirmed tournament deletion never survives as an orphan, in either order', async () => {
    for (const order of ['insert-first', 'delete-first'] as const) {
      const { db, repos, scenario } = await withScenario();
      const [lio, tig] = scenario.teams;
      const insertLate = (): Promise<void> =>
        db.withTransactionAsync(async (tx) => {
          const r = createRepositories(tx);
          await delay(2);
          await r.matches.insert(buildMatch({ id: 'cup-late', teamAId: lio.team.id, teamBId: tig.team.id, tournamentId: 'cup' }), squadsFor(lio, tig));
        });
      const deleteCup = (): Promise<string[]> =>
        db.withTransactionAsync(async (tx) => {
          const r = createRepositories(tx);
          const ids = await r.tournaments.listMatchIds('cup');
          await delay(2);
          for (const id of ids) {
            await r.matches.delete(id);
          }
          await r.tournaments.delete('cup');
          return ids;
        });
      let insertResult: PromiseSettledResult<void>;
      let deleteResult: PromiseSettledResult<string[]>;
      if (order === 'insert-first') {
        [insertResult, deleteResult] = await Promise.allSettled([insertLate(), deleteCup()]);
      } else {
        [deleteResult, insertResult] = await Promise.allSettled([deleteCup(), insertLate()]);
      }
      expect({ order, deleted: deleteResult.status }).toEqual({ order, deleted: 'fulfilled' });
      if (order === 'delete-first') {
        expect(insertResult.status).toBe('rejected');
      }
      if (insertResult.status === 'fulfilled' && deleteResult.status === 'fulfilled') {
        expect(deleteResult.value).toContain('cup-late');
      }
      expect(await repos.tournaments.getSnapshot('cup', 1)).toBeNull();
      expect(await countRows(db, 'matches')).toBe(0);
      expect(await countRows(db, 'match_events')).toBe(0);
      expect(await violations(db)).toEqual([]);
    }
  });

  it('a confirmed tournament deletion removes exactly the aggregate its footprint announced, and nothing else', async () => {
    const { db, repos } = await playedWorld();
    const libraryCounts = async (): Promise<Record<string, number>> => ({
      teams: await countRows(db, 'teams'),
      players: await countRows(db, 'players'),
      venues: await countRows(db, 'venues'),
    });
    const standaloneState = async (): Promise<unknown> => ({
      m1: await repos.events.listByMatch('m1'),
      m3: await repos.events.listByMatch('m3'),
      setup: await repos.matches.getSetup('m1'),
      projection: await readMatchProjection(db, 'm1'),
      m3Projection: await readMatchProjection(db, 'm3'),
    });
    const library = await libraryCounts();
    const standalone = await standaloneState();
    const footprint = await repos.tournaments.deletionFootprint('cup');
    const matchesBefore = await countRows(db, 'matches');
    const eventsBefore = await countRows(db, 'match_events');
    await expectAccepted(db, async (r) => {
      for (const id of await r.tournaments.listMatchIds('cup')) {
        await r.matches.delete(id);
      }
      await r.tournaments.delete('cup');
    });
    expect(matchesBefore - (await countRows(db, 'matches'))).toBe(footprint.matches);
    expect(eventsBefore - (await countRows(db, 'match_events'))).toBe(footprint.events);
    for (const table of [
      'tournaments',
      'tournament_venues',
      'tournament_rules',
      'tournament_teams',
      'tournament_stages',
      'pools',
      'stage_slots',
      'pool_teams',
      'fixtures',
      'tournament_overrides',
    ]) {
      expect({ table, rows: await countRows(db, table) }).toEqual({ table, rows: 0 });
    }
    expect(await countRows(db, 'audit_events', 'tournament_id IS NOT NULL')).toBe(0);
    expect(await countRows(db, 'matches', 'tournament_id IS NOT NULL')).toBe(0);
    expect(await libraryCounts()).toEqual(library);
    expect(await standaloneState()).toEqual(standalone);
    expect(await violations(db)).toEqual([]);
  });

  it('concurrent revision bumps never lose an update, hand out consecutive versions and roll back with their use case', async () => {
    const { db, repos } = await withBare();
    const version = async (): Promise<number> => Number((await repos.tournaments.getSnapshot('t1', 1))?.version);
    const start = await version();
    expect(Number.isInteger(start)).toBe(true);
    const bumps = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        db.withTransactionAsync(async (tx) => {
          const r = createRepositories(tx);
          await delay(i % 3);
          return r.tournaments.bumpRevision('t1');
        }),
      ),
    );
    expect([...bumps].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => start + i + 1));
    expect(await version()).toBe(start + 12);
    const aborted = await outcome(() =>
      db.withTransactionAsync(async (tx) => {
        await createRepositories(tx).tournaments.bumpRevision('t1');
        throw new Error('use case failed after the bump');
      }),
    );
    expect(aborted).toBeInstanceOf(Error);
    expect(await version()).toBe(start + 12);
  });

  it('an injected error at any statement of a tournament match completion (events, projection, fixture mirror, stage, revision, champion, audit) leaves nothing behind', async () => {
    const db = await faultDatabase();
    await seedLibrary(db, [lions, tigers], [buildVenue('v1', 'Gaddafi Stadium')]);
    const bare = await seedBareTournament(db, 't1', ['lio', 'tig']);
    const tmGolden: GoldenMatchOptions = { ...golden, matchId: 'tm', idPrefix: 'tm-' };
    const log = goldenMatchEvents(tmGolden);
    const fixture = buildFixture({
      id: 'tf',
      tournamentId: 't1',
      stageId: bare.groupStageId,
      poolId: bare.poolId,
      sideA: teamSide('lio'),
      sideB: teamSide('tig'),
      status: 'live',
      matchId: 'tm',
    });
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.matches.insert(buildMatch({ id: 'tm', teamAId: 'lio', teamBId: 'tig', status: 'live', tournamentId: 't1', fixtureId: 'tf' }), squadsFor(lions, tigers));
      await r.tournaments.insertFixtures([fixture]);
      await r.events.append(log.slice(0, log.length - 2));
      await r.matches.writeProjection(goldenProjection(tmGolden, { projectionVersion: 1, teamAId: 'lio', at: isoAt(8000), completed: false }));
      await r.tournaments.bumpRevision('t1');
    });
    const snapshotBefore = await createRepositories(db).tournaments.getSnapshot('t1', 1);
    const stage = snapshotBefore?.stages.find((s) => s.id === bare.groupStageId);
    if (snapshotBefore === null || stage === undefined) {
      throw new Error('tournament missing');
    }
    const before = JSON.stringify(await dump(db));
    const record = (): Promise<void> =>
      db.withTransactionAsync(async (tx) => {
        const r = createRepositories(tx);
        await r.events.append(log.slice(log.length - 2));
        await r.matches.writeProjection(goldenProjection(tmGolden, { projectionVersion: 1, teamAId: 'lio', at: isoAt(9000), completed: true }));
        await r.tournaments.updateFixture({ ...fixture, status: 'completed', updatedAt: isoAt(9000) });
        await r.tournaments.upsertStages([{ ...stage, status: 'completed', updatedAt: isoAt(9000) }]);
        await r.tournaments.bumpRevision('t1');
        await r.tournaments.writeChampion('t1', ['tig']);
        await r.audit.append({
          id: 'audit-result',
          tournamentId: 't1',
          matchId: 'tm',
          action: 'result_recorded',
          entityType: 'match',
          entityId: 'tm',
          summary: 'Result recorded',
          previousValue: null,
          newValue: null,
          reason: null,
          impact: null,
          createdAt: isoAt(9000),
        });
      });
    const { injected, leaks, committed } = await errorSweep(db, record, before);
    console.log(`[adversarial-integrity] completion error sweep: ${injected} injected failure points before a clean commit`);
    expect(leaks).toEqual([]);
    expect(committed).toBe(true);
    expect(injected).toBeGreaterThanOrEqual(10);
    const after = await createRepositories(db).tournaments.getSnapshot('t1', 1);
    expect(Number(after?.version)).toBe(Number(snapshotBefore.version) + 1);
    expect(after?.fixtures.find((f) => f.id === 'tf')?.status).toBe('completed');
    expect(Object.keys(after?.summaries ?? {})).toEqual(['tm']);
    expect(await createRepositories(db).events.listByMatch('tm')).toEqual(log);
    expect(await countRows(db, 'audit_events', 'id = ?', ['audit-result'])).toBe(1);
    expect(await violations(db)).toEqual([]);
  });
});

describe('adversarial integrity: more deep-equal round trips', () => {
  it('stage slots of every source kind round-trip, and a source naming a missing stage, pool, fixture or team is refused', async () => {
    const { db, repos, bare } = await withBare(['lio', 'tig', 'eag', 'haw']);
    const grp = bare.groupStageId;
    const ko = bare.knockoutStageId;
    const slots: StageSlot[] = [
      buildSlot({ id: 's0', stageId: ko, index: 0, seed: 1, source: { kind: 'pool_position', stageId: grp, poolId: bare.poolId, position: 1 } }),
      buildSlot({
        id: 's1',
        stageId: ko,
        index: 1,
        seed: 2,
        source: { kind: 'best_of_position', stageId: grp, position: 2, rank: 1, normalization: 'per_match_average' },
      }),
      buildSlot({ id: 's2', stageId: ko, index: 2, source: { kind: 'overall_position', stageId: grp, rank: 3, normalization: 'drop_extra_results' } }),
      buildSlot({ id: 's3', stageId: ko, index: 3, label: "Wildcard — O'Neil", source: { kind: 'manual', teamId: 'eag' } }),
      buildSlot({ id: 's4', stageId: ko, index: 4, source: { kind: 'manual', teamId: null } }),
      buildSlot({ id: 's5', stageId: ko, index: 5, role: 'progression', source: { kind: 'bracket_winner', stageId: ko, round: 1, position: 0 } }),
      buildSlot({ id: 's6', stageId: ko, index: 6, role: 'progression', source: { kind: 'bracket_loser', stageId: ko, round: 1, position: 0 } }),
      buildSlot({ id: 's7', stageId: ko, index: 7, role: 'progression', source: { kind: 'fixture_winner', fixtureId: 'q1' } }),
      buildSlot({ id: 's8', stageId: ko, index: 8, role: 'progression', source: { kind: 'fixture_loser', fixtureId: 'q1' } }),
    ];
    await expectAccepted(db, async (r) => {
      await r.tournaments.upsertSlots(slots);
      await r.tournaments.insertFixtures([
        buildFixture({
          id: 'q1',
          tournamentId: 't1',
          stageId: ko,
          sideA: slotSide('s0'),
          sideB: slotSide('s1'),
          bracket: { kind: 'main', round: 1, position: 0, roundName: 'Qualifier' },
        }),
      ]);
    });
    const byId = <X extends { readonly id: string }>(a: X, b: X): number => a.id.localeCompare(b.id);
    expect([...((await repos.tournaments.getSnapshot('t1', 1))?.slots ?? [])].sort(byId)).toEqual([...slots].sort(byId));
    const dangling: readonly StageSlot['source'][] = [
      { kind: 'pool_position', stageId: grp, poolId: 'ghost-pool', position: 1 },
      { kind: 'pool_position', stageId: 'ghost-stage', poolId: bare.poolId, position: 1 },
      { kind: 'best_of_position', stageId: 'ghost-stage', position: 1, rank: 1, normalization: 'raw' },
      { kind: 'overall_position', stageId: 'ghost-stage', rank: 1, normalization: 'raw' },
      { kind: 'bracket_winner', stageId: 'ghost-stage', round: 1, position: 0 },
      { kind: 'fixture_winner', fixtureId: 'ghost-fixture' },
      { kind: 'manual', teamId: 'ghost-team' },
    ];
    for (const source of dangling) {
      await expectRejectedAndUnchanged(db, (r) => r.tournaments.upsertSlots([buildSlot({ id: 'dangling', stageId: ko, index: 9, source })]));
    }
  });

  it('a replay of a played fixture and a bare friendly round-trip deep-equal, and the fixture keeps its current match', async () => {
    const { db, repos, scenario } = await withScenario();
    const [lio, tig] = scenario.teams;
    const replay = buildMatch({
      id: 'cup-replay-g1',
      title: 'Tigers v Lions — "replay" \u{1F3CF}',
      teamAId: tig.team.id,
      teamBId: lio.team.id,
      venueId: 'cup-venue-2',
      scheduledDate: '2026-12-31',
      scheduledTime: '23:59',
      toss: { winnerTeamId: lio.team.id, decision: 'bowl' },
      status: 'postponed',
      tournamentId: 'cup',
      fixtureId: 'cup-g1',
      teamAPlayers: 2,
      teamBPlayers: 15,
      resumeDismissedAt: isoAt(7),
      createdAt: isoAt(3),
      updatedAt: isoAt(4),
    });
    const friendly = buildMatch({
      id: 'friendly',
      teamAId: lio.team.id,
      teamBId: tig.team.id,
      toss: null,
      status: 'cancelled',
      scheduledDate: '2027-01-01',
      scheduledTime: '00:00',
    });
    await expectAccepted(db, async (r) => {
      await r.matches.insert(replay, squadsFor(tig, lio));
      await r.matches.insert(friendly, []);
    });
    expect(await repos.matches.get(replay.id)).toEqual(replay);
    expect(await repos.matches.get(friendly.id)).toEqual(friendly);
    const g1 = (await repos.tournaments.getSnapshot('cup', 1))?.fixtures.find((f) => f.id === 'cup-g1');
    expect(g1?.matchId).toBe('cup-m-g1');
    expect(await violations(db)).toEqual([]);
  });

  it('rewriting or deleting a user format preset never changes a match created from it', async () => {
    const { db, repos } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    const preset: FormatPreset = { id: 'club-t12', label: 'Club T12', description: '', builtin: false, rules: { ...TEST_MATCH_RULES, oversPerInnings: 12 } };
    await expectAccepted(db, (r) => r.presets.upsert(preset, isoAt(1)));
    const match = buildMatch({ id: 'pm', teamAId: 'lio', teamBId: 'tig', formatId: preset.id, rules: preset.rules });
    await expectAccepted(db, (r) => r.matches.insert(match, squadsFor(lions, tigers)));
    const rewritten: FormatPreset = { ...preset, label: 'Club T8', rules: { ...preset.rules, oversPerInnings: 8, powerplays: [] } };
    await expectAccepted(db, (r) => r.presets.upsert(rewritten, isoAt(2)));
    expect((await repos.presets.list()).filter((p) => p.id === preset.id)).toEqual([rewritten]);
    expect(await repos.matches.get('pm')).toEqual(match);
    await expectAccepted(db, (r) => r.presets.delete(preset.id));
    expect((await repos.presets.list()).filter((p) => p.id === preset.id)).toEqual([]);
    expect(await repos.matches.get('pm')).toEqual(match);
    expect((await repos.matches.getSetup('pm'))?.rules).toEqual(preset.rules);
  });

  it('a tournament update naming a missing venue keeps the previous info and venue links', async () => {
    const { db, repos, scenario } = await withScenario();
    const before = (await repos.tournaments.getSnapshot('cup', 1))?.tournament;
    expect(before?.venueIds).toEqual(scenario.tournament.venueIds);
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.update({ ...scenario.tournament, name: 'Renamed', venueIds: ['cup-venue-1', 'ghost-venue'] }));
    await expectRejectedAndUnchanged(db, (r) => r.tournaments.update({ ...scenario.tournament, name: 'Renamed', venueIds: ['ghost-venue'] }));
    expect((await repos.tournaments.getSnapshot('cup', 1))?.tournament).toEqual(before);
  });

  it('structure upserts can never move a played stage, pool, slot or membership into another stage or tournament', async () => {
    const { db, scenario } = await withScenario();
    await db.withTransactionAsync(async (tx) => {
      const r = createRepositories(tx);
      await r.tournaments.insert(buildTournament({ id: 'cup2', name: 'Other Cup' }), buildTournamentRules('cup2'));
      await r.tournaments.upsertTournamentTeams(scenario.teams.map((seed, index) => buildMembership('cup2', seed.team.id, index + 1)));
      await r.tournaments.upsertStages([buildStage({ id: 'cup2-s', tournamentId: 'cup2' })]);
    });
    const image = await db.exportAsync();
    const find = <X extends { readonly id: string }>(rows: readonly X[], id: string): X => {
      const row = rows.find((candidate) => candidate.id === id);
      if (row === undefined) {
        throw new Error(`scenario row ${id} missing`);
      }
      return row;
    };
    const groups = find(scenario.stages, 'cup-groups');
    const poolA = find(scenario.pools, 'cup-pool-a');
    const slot0 = find(scenario.slots, 'cup-slot-0');
    const member = find(scenario.tournamentTeams, 'cup-tt-1');
    const attempts: readonly (readonly [string, (r: Repositories) => Promise<unknown>])[] = [
      ['stage into another tournament', (r) => r.tournaments.upsertStages([{ ...groups, tournamentId: 'cup2', orderIndex: 5 }])],
      ['pool into the knockout stage', (r) => r.tournaments.upsertPools([{ ...poolA, stageId: 'cup-ko', orderIndex: 5 }])],
      ['pool into another tournament', (r) => r.tournaments.upsertPools([{ ...poolA, stageId: 'cup2-s', orderIndex: 5 }])],
      ['slot into the group stage', (r) => r.tournaments.upsertSlots([{ ...slot0, stageId: 'cup-groups', index: 50 }])],
      ['membership into another tournament', (r) => r.tournaments.upsertTournamentTeams([{ ...member, tournamentId: 'cup2', id: member.id }])],
    ];
    const parents = async (target: SqlExecutor): Promise<unknown> => ({
      stage: await target.getFirstAsync("SELECT tournament_id FROM tournament_stages WHERE id = 'cup-groups'"),
      pool: await target.getFirstAsync("SELECT stage_id FROM pools WHERE id = 'cup-pool-a'"),
      slot: await target.getFirstAsync("SELECT stage_id FROM stage_slots WHERE id = 'cup-slot-0'"),
      member: await target.getFirstAsync("SELECT tournament_id FROM tournament_teams WHERE id = 'cup-tt-1'"),
    });
    const expected = {
      stage: { tournament_id: 'cup' },
      pool: { stage_id: 'cup-groups' },
      slot: { stage_id: 'cup-ko' },
      member: { tournament_id: 'cup' },
    };
    for (const [label, attempt] of attempts) {
      const target = await reopen(image);
      await inTx(target, attempt);
      expect({ label, parents: await parents(target), violations: await violations(target) }).toEqual({ label, parents: expected, violations: [] });
      await target.closeAsync();
    }
  });
});

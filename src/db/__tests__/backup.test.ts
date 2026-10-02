/** @jest-environment node */
import type { AppSettings, BackupData, MatchSquadEntry, TournamentTemplate } from '@/domain/types';
import { sqliteErrorKind } from '../errors';
import { runMigrations } from '../migrate';
import { createRepositories } from '../repositories';
import type { Repositories } from '../repositories/contracts';
import { TEST_MATCH_RULES, buildMatch, buildTeamSeed, buildVenue, isoAt, squadEntries } from '../testing/builders';
import { createFaultInjectingDatabase } from '../testing/faultInjectingDatabase';
import { goldenMatchEvents, goldenProjection, type GoldenMatchOptions } from '../testing/goldenMatch';
import { countRows, openTestRepositories } from '../testing/harness';
import { createSqlJsDatabase } from '../testing/sqljsDatabase';
import { seedBareTournament } from '../testing/structureBuilders';
import { buildTournamentScenario, seedLibrary, seedTournamentScenario, type TournamentScenario } from '../testing/tournamentScenario';
import type { SqlDatabase, SqlExecutor } from '../types';

const bulls = buildTeamSeed('bul', 'Bulls', 'BUL');
const bears = buildTeamSeed('bea', 'Bears', 'BEA');
const idle = buildTeamSeed('idle', 'Idle XI', 'IDL', 2);
const GUEST = 'cup-lio-p12';

const SETTINGS: AppSettings = {
  theme: 'system',
  hapticsEnabled: false,
  soundEnabled: true,
  reducedMotion: 'on',
  defaultFormatId: 'T10',
  scoring: { confirmInningsEnd: false, autoPromptBowler: true, dotStyle: 'zero', keepAwake: false },
};

const standalone: GoldenMatchOptions = {
  matchId: 'sm1',
  batFirst: { teamId: 'bul', playerIds: bulls.players.map((p) => p.id) },
  bowlFirst: { teamId: 'bea', playerIds: bears.players.map((p) => p.id) },
  idPrefix: 'sm1-',
  start: isoAt(90000),
};

const TABLES = [
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
  'app_settings',
] as const;

interface Rich {
  readonly db: SqlDatabase;
  readonly repos: Repositories;
  readonly scenario: TournamentScenario;
}

function userTemplate(): TournamentTemplate {
  return {
    id: 'tpl-1',
    name: 'Weekend league',
    description: 'Single pool',
    builtin: false,
    teamCount: 6,
    structureKind: 'league',
    pointsSystem: buildTournamentScenario('x').rules.pointsSystem,
    nrr: buildTournamentScenario('x').rules.nrr,
    tieBreakers: ['points', 'nrr'],
    defaultFormatId: 'T20',
    defaultMatchRules: TEST_MATCH_RULES,
    stages: [],
    createdAt: isoAt(5),
    updatedAt: isoAt(6),
  };
}

async function seedStandalone(db: SqlDatabase): Promise<void> {
  const guest: MatchSquadEntry = { playerId: GUEST, battingOrder: null, isCaptain: false, isWicketKeeper: false, isSubstitute: true };
  const squads = [
    { teamId: 'bul', players: [...squadEntries(bulls), guest] },
    { teamId: 'bea', players: squadEntries(bears) },
  ];
  const match = buildMatch({ id: 'sm1', teamAId: 'bul', teamBId: 'bea', venueId: 'v-park', title: 'Bulls v Bears', createdAt: isoAt(90000), updatedAt: isoAt(90000) });
  await db.withTransactionAsync(async (tx) => {
    const repos = createRepositories(tx);
    await repos.matches.insert(match, squads);
    await repos.events.append(goldenMatchEvents(standalone));
    await repos.matches.writeProjection(goldenProjection(standalone, { projectionVersion: 1, teamAId: 'bul', at: isoAt(95000), completed: true }));
    await repos.audit.append({
      id: 'sm1-audit',
      tournamentId: null,
      matchId: 'sm1',
      action: 'match_history_edited',
      entityType: 'match',
      entityId: 'sm1',
      summary: 'Corrected ball 2.3',
      previousValue: [{ kind: 'delivery' }],
      newValue: [{ kind: 'delivery', runsRun: 2 }],
      reason: 'Umpire signal misread',
      impact: null,
      createdAt: isoAt(96000),
    });
  });
}

async function richDatabase(): Promise<Rich> {
  const { db, repos } = await openTestRepositories();
  const scenario = buildTournamentScenario('cup', 1);
  await seedTournamentScenario(db, scenario);
  await seedLibrary(db, [bulls, bears, idle], [buildVenue('v-park', 'Race Course Park'), buildVenue('v-idle', 'Unused Ground')]);
  await seedStandalone(db);
  await repos.templates.upsert(userTemplate());
  await repos.presets.upsert({ id: 'user-6', label: 'Six overs', description: 'Evening', builtin: false, rules: { ...TEST_MATCH_RULES, oversPerInnings: 6 } }, isoAt(7));
  for (const key of Object.keys(SETTINGS) as (keyof AppSettings)[]) {
    await repos.settings.set(key, SETTINGS[key], isoAt(8));
  }
  return { db, repos, scenario };
}

async function tableCounts(db: SqlExecutor): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    counts[table] = await countRows(db, table);
  }
  return counts;
}

function sortedData(data: BackupData): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value].map((row) => JSON.stringify(row)).sort() : value,
    ]),
  );
}

function reversed(data: BackupData): BackupData {
  return {
    ...data,
    venues: [...data.venues].reverse(),
    teams: [...data.teams].reverse(),
    players: [...data.players].reverse(),
    tournaments: [...data.tournaments].reverse(),
    tournamentTeams: [...data.tournamentTeams].reverse(),
    stages: [...data.stages].reverse(),
    pools: [...data.pools].reverse(),
    slots: [...data.slots].reverse(),
    fixtures: [...data.fixtures].reverse(),
    matches: [...data.matches].reverse(),
    matchPlayers: [...data.matchPlayers].reverse(),
    matchEvents: [...data.matchEvents].reverse(),
    overrides: [...data.overrides].reverse(),
    auditEvents: [...data.auditEvents].reverse(),
  };
}

async function importInto(db: SqlDatabase, data: BackupData, libraryConflict: 'keep_local' | 'update_local' = 'keep_local'): Promise<void> {
  await db.withTransactionAsync(async (tx) => {
    await createRepositories(tx).backup.importData(data, { libraryConflict });
  });
}

describe('BackupRepository.exportData', () => {
  it('exports every authoritative row of a full backup, with settings and without projections or frozen sides', async () => {
    const { repos, scenario } = await richDatabase();
    const data = await repos.backup.exportData({ kind: 'full' });
    expect(data.venues.map((v) => v.id)).toEqual(['cup-venue-1', 'cup-venue-2', 'v-park', 'v-idle']);
    expect(data.teams).toHaveLength(7);
    expect(data.players).toHaveLength(48 + 24 + 2);
    expect(data.tournaments).toEqual([scenario.tournament]);
    expect(data.tournamentRules).toEqual([scenario.rules]);
    expect(data.tournamentTeams).toEqual(scenario.tournamentTeams);
    expect(data.stages).toEqual(scenario.stages);
    expect(data.pools).toEqual(scenario.pools);
    expect(data.slots).toEqual(scenario.slots);
    expect(data.poolEntries).toEqual(scenario.poolEntries);
    expect(data.fixtures).toEqual(scenario.fixtures);
    expect(data.fixtures.every((fixture) => fixture.matchSides === null)).toBe(true);
    expect(data.matches.map((m) => m.id)).toEqual([...scenario.matches.map((entry) => entry.match.id), 'sm1']);
    expect(data.matches.slice(0, 5)).toEqual(scenario.matches.map((entry) => entry.match));
    expect(data.matchPlayers).toHaveLength(5 * 24 + 25);
    expect(data.matchPlayers.find((row) => row.playerId === GUEST && row.matchId === 'sm1')).toEqual({
      matchId: 'sm1',
      playerId: GUEST,
      teamId: 'bul',
      battingOrder: null,
      isCaptain: false,
      isWicketKeeper: false,
      isSubstitute: true,
    });
    expect(data.matchEvents).toHaveLength(6 * 43);
    expect(data.matchEvents.filter((event) => event.matchId === 'sm1')).toEqual(goldenMatchEvents(standalone));
    expect(data.overrides).toEqual(scenario.overrides);
    expect(data.auditEvents.map((event) => event.id)).toEqual([...scenario.audit.map((event) => event.id), 'sm1-audit']);
    expect(data.templates).toEqual([userTemplate()]);
    expect(data.formatPresets.map((preset) => preset.id)).toEqual(['user-6']);
    expect(data.settings).toEqual(SETTINGS);
    expect(JSON.stringify(data)).not.toMatch(/summary_json|summaryVersion|projection_version|championName/);
  });

  it('exports null settings until every settings key is stored', async () => {
    const { repos } = await openTestRepositories();
    await repos.settings.set('theme', 'dark', isoAt(1));
    expect((await repos.backup.exportData({ kind: 'full' })).settings).toBeNull();
  });

  it('exports a tournament aggregate with its matches and only the library rows they reference', async () => {
    const { db, repos, scenario } = await richDatabase();
    await seedBareTournament(db, 'spring', ['bul', 'bea']);
    const data = await repos.backup.exportData({ kind: 'tournament', tournamentId: 'cup' });
    expect(data.tournaments.map((t) => t.id)).toEqual(['cup']);
    expect(data.tournamentTeams).toEqual(scenario.tournamentTeams);
    expect(data.stages.map((s) => s.id)).toEqual(['cup-groups', 'cup-ko']);
    expect(data.matches.map((m) => m.id)).toEqual(scenario.matches.map((entry) => entry.match.id));
    expect(new Set(data.matchEvents.map((e) => e.matchId))).toEqual(new Set(scenario.matches.map((entry) => entry.match.id)));
    expect(data.teams.map((t) => t.id).sort()).toEqual(['cup-eag', 'cup-haw', 'cup-lio', 'cup-tig']);
    expect(data.players).toHaveLength(48);
    expect(data.venues.map((v) => v.id)).toEqual(['cup-venue-1', 'cup-venue-2']);
    expect(data.auditEvents.map((event) => event.id)).toEqual(scenario.audit.map((event) => event.id));
    expect(data.overrides).toEqual(scenario.overrides);
    expect(data.templates).toEqual([]);
    expect(data.formatPresets).toEqual([]);
    expect(data.settings).toBeNull();
  });

  it('exports a standalone match with its squad, events, audit and referenced library rows (guests included)', async () => {
    const { repos } = await richDatabase();
    const data = await repos.backup.exportData({ kind: 'match', matchId: 'sm1' });
    expect(data.matches.map((m) => m.id)).toEqual(['sm1']);
    expect(data.matchPlayers).toHaveLength(25);
    expect(data.matchEvents).toEqual(goldenMatchEvents(standalone));
    expect(data.auditEvents.map((event) => event.id)).toEqual(['sm1-audit']);
    expect(data.teams.map((t) => t.id).sort()).toEqual(['bea', 'bul', 'cup-lio']);
    expect(data.players.map((p) => p.id)).toContain(GUEST);
    expect(data.players).toHaveLength(36);
    expect(data.venues.map((v) => v.id)).toEqual(['v-park']);
    expect(data.tournaments).toEqual([]);
    expect(data.fixtures).toEqual([]);
    expect(data.settings).toBeNull();
    const none = await repos.backup.exportData({ kind: 'match', matchId: 'nope' });
    expect(Object.values(none).every((value) => value === null || (Array.isArray(value) && value.length === 0))).toBe(true);
  });
});

describe('BackupRepository.importData', () => {
  it('round-trips a full backup into an empty database in one transaction (deferred circular references)', async () => {
    const source = await richDatabase();
    const data = await source.repos.backup.exportData({ kind: 'full' });
    const target = await openTestRepositories();
    await importInto(target.db, data);
    expect(await target.repos.backup.exportData({ kind: 'full' })).toEqual({ ...data, settings: null });
    const snapshot = await target.repos.tournaments.getSnapshot('cup', 1);
    expect(snapshot?.fixtures.find((f) => f.id === 'cup-final')?.matchSides).toEqual({ teamAId: 'cup-haw', teamBId: 'cup-tig' });
    expect(snapshot?.summaries).toEqual({});
    expect(await target.db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
    for (const table of ['innings', 'partnerships'] as const) {
      expect(await countRows(target.db, table)).toBe(0);
    }
  });

  it('imports a knockout tournament with completed matches with every collection in reverse order (IT-DB-06)', async () => {
    const source = await richDatabase();
    const data = await source.repos.backup.exportData({ kind: 'tournament', tournamentId: 'cup' });
    const target = await openTestRepositories();
    await importInto(target.db, reversed(data));
    expect(sortedData(await target.repos.backup.exportData({ kind: 'tournament', tournamentId: 'cup' }))).toEqual(sortedData(data));
    expect(await target.repos.events.listByMatch('cup-m-final')).toEqual(source.scenario.matches[4].events);
  });

  it('aborts the COMMIT on a dangling reference and leaves the database unchanged', async () => {
    const source = await richDatabase();
    const data = await source.repos.backup.exportData({ kind: 'tournament', tournamentId: 'cup' });
    const target = await openTestRepositories();
    const before = await tableCounts(target.db);
    const variants: BackupData[] = [
      { ...data, matches: data.matches.filter((m) => m.id !== 'cup-m-final'), matchPlayers: data.matchPlayers.filter((r) => r.matchId !== 'cup-m-final'), matchEvents: data.matchEvents.filter((e) => e.matchId !== 'cup-m-final') },
      { ...data, fixtures: data.fixtures.map((f) => (f.id === 'cup-sf1' ? { ...f, id: 'cup-sf1-renamed' } : f)) },
      { ...data, tournamentTeams: data.tournamentTeams.filter((m) => m.teamId !== 'cup-haw') },
    ];
    for (const variant of variants) {
      const error = await importInto(target.db, variant).catch((e: unknown) => e);
      expect(sqliteErrorKind(error)).toBe('foreign_key');
      expect(await tableCounts(target.db)).toEqual(before);
    }
  });

  it('keeps local library rows with keep_local and updates them in place with update_local, never with INSERT OR REPLACE', async () => {
    const source = await richDatabase();
    const data = await source.repos.backup.exportData({ kind: 'match', matchId: 'sm1' });
    const target = await createFaultInjectingDatabase({ captureDurableImages: false });
    await runMigrations(target, { now: () => isoAt(0) });
    const local = createRepositories(target);
    const localBulls = { ...bulls.team, name: 'Local Bulls', updatedAt: isoAt(1) };
    const localOnly = { ...bulls.players[0], id: 'bul-local', name: 'Local only player' };
    await seedLibrary(target, [{ team: localBulls, players: [...bulls.players.map((p) => ({ ...p, name: `Local ${p.name}` })), localOnly] }, idle]);
    await local.matches.insert(buildMatch({ id: 'keep-me', teamAId: 'bul', teamBId: 'idle' }), [
      { teamId: 'bul', players: [{ playerId: 'bul-local', battingOrder: 1, isCaptain: true, isWicketKeeper: false, isSubstitute: false }] },
    ]);
    const withoutMatch: BackupData = { ...data, matches: [], matchPlayers: [], matchEvents: [], auditEvents: [] };
    target.clearLog();
    await importInto(target, withoutMatch, 'keep_local');
    expect((await local.teams.get('bul'))?.name).toBe('Local Bulls');
    expect((await local.players.getMany([bulls.players[0].id]))[0].name).toBe(`Local ${bulls.players[0].name}`);
    expect(await local.teams.get('bea')).toEqual(bears.team);
    await importInto(target, withoutMatch, 'update_local');
    expect(await local.teams.get('bul')).toEqual(bulls.team);
    expect((await local.players.getMany([bulls.players[0].id]))[0]).toEqual(bulls.players[0]);
    expect((await local.players.getMany(['bul-local']))[0]).toEqual(localOnly);
    expect(await local.matches.get('keep-me')).not.toBeNull();
    const writes = target.statementLog.map((entry) => entry.sql);
    expect(writes.some((sql) => /INSERT\s+OR\s+REPLACE|REPLACE\s+INTO/i.test(sql))).toBe(false);
    expect(writes.some((sql) => /ON CONFLICT\(id\) DO UPDATE/.test(sql))).toBe(true);
    expect(writes.some((sql) => /^\s*DELETE/i.test(sql))).toBe(false);
  });

  it('imports a tournament backup with plain inserts only: no DELETE, UPDATE or INSERT OR REPLACE (FR-06f)', async () => {
    const source = await richDatabase();
    const data = await source.repos.backup.exportData({ kind: 'tournament', tournamentId: 'cup' });
    const target = await createFaultInjectingDatabase({ captureDurableImages: false });
    await runMigrations(target, { now: () => isoAt(0) });
    target.clearLog();
    await importInto(target, data, 'update_local');
    const statements = target.statementLog.map((entry) => entry.sql);
    expect(statements.filter((sql) => /^\s*(DELETE|UPDATE)\b/i.test(sql))).toEqual([]);
    expect(statements.some((sql) => /INSERT\s+OR\s+REPLACE|REPLACE\s+INTO/i.test(sql))).toBe(false);
    const inserts = statements.filter((sql) => /^\s*INSERT/i.test(sql)).length;
    const rows = Object.values(data).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
    const venueLinks = data.tournaments.reduce((sum, tournament) => sum + tournament.venueIds.length, 0);
    expect(inserts).toBe(rows + venueLinks);
  });

  it('applies the library policy to user templates and format presets', async () => {
    const source = await richDatabase();
    const data = await source.repos.backup.exportData({ kind: 'full' });
    const target = await openTestRepositories();
    await target.repos.templates.upsert({ ...userTemplate(), name: 'Local name' });
    await target.repos.presets.upsert({ id: 'user-6', label: 'Local preset', description: '', builtin: false, rules: TEST_MATCH_RULES }, isoAt(1));
    const configOnly: BackupData = { ...data, templates: data.templates, formatPresets: data.formatPresets, venues: [], teams: [], players: [], tournaments: [], tournamentRules: [], tournamentTeams: [], stages: [], pools: [], slots: [], poolEntries: [], fixtures: [], matches: [], matchPlayers: [], matchEvents: [], overrides: [], auditEvents: [] };
    await importInto(target.db, configOnly, 'keep_local');
    expect((await target.repos.templates.get('tpl-1'))?.name).toBe('Local name');
    expect((await target.repos.presets.list())[0].label).toBe('Local preset');
    await importInto(target.db, configOnly, 'update_local');
    expect(await target.repos.templates.get('tpl-1')).toEqual(userTemplate());
    expect(await target.repos.presets.list()).toEqual(data.formatPresets);
  });

  it('writes nothing when the process dies in the middle of an import (FR-06g)', async () => {
    const source = await richDatabase();
    const data = await source.repos.backup.exportData({ kind: 'full' });
    const target = await createFaultInjectingDatabase();
    await runMigrations(target, { now: () => isoAt(0) });
    const before = await tableCounts(target);
    target.crashAt({ sql: /^INSERT/, occurrence: 10 });
    await expect(importInto(target, data)).rejects.toMatchObject({ name: 'SimulatedCrash' });
    const reopened = await createSqlJsDatabase({ data: target.durableImages[target.durableImages.length - 1] });
    expect(await tableCounts(reopened)).toEqual(before);
    await importInto(reopened, data);
    expect(await createRepositories(reopened).backup.exportData({ kind: 'full' })).toEqual({ ...data, settings: null });
  });
});

describe('BackupRepository aggregates', () => {
  it('reports existing ids per aggregate kind', async () => {
    const { repos } = await richDatabase();
    const has = async (entity: Parameters<Repositories['backup']['existingIds']>[0], ids: readonly string[]): Promise<string[]> =>
      [...(await repos.backup.existingIds(entity, ids))].sort();
    expect(await has('tournament', ['cup', 'x'])).toEqual(['cup']);
    expect(await has('match', ['sm1', 'cup-m-g1', 'y'])).toEqual(['cup-m-g1', 'sm1']);
    expect(await has('team', ['bul', 'nope'])).toEqual(['bul']);
    expect(await has('player', [GUEST, 'ghost'])).toEqual([GUEST]);
    expect(await has('venue', ['v-park', 'v-none'])).toEqual(['v-park']);
    expect(await has('template', ['tpl-1'])).toEqual(['tpl-1']);
    expect(await has('preset', ['user-6', 'T20'])).toEqual(['user-6']);
    expect(await has('team', [])).toEqual([]);
  });

  it('reports the footprint of a tournament or match aggregate', async () => {
    const { repos, scenario } = await richDatabase();
    expect(await repos.backup.aggregateFootprint('tournament', 'cup')).toEqual({
      matchIds: scenario.matches.map((entry) => entry.match.id),
      events: 5 * 43,
    });
    expect(await repos.backup.aggregateFootprint('match', 'sm1')).toEqual({ matchIds: ['sm1'], events: 43 });
    expect(await repos.backup.aggregateFootprint('match', 'nope')).toEqual({ matchIds: [], events: 0 });
  });

  it('deletes a tournament aggregate explicitly (matches first) and leaves the library and other aggregates alone', async () => {
    const { db, repos } = await richDatabase();
    await db.withTransactionAsync(async (tx) => {
      await createRepositories(tx).backup.deleteAggregate('tournament', 'cup');
    });
    expect(await countRows(db, 'tournaments')).toBe(0);
    expect(await countRows(db, 'matches')).toBe(1);
    expect(await countRows(db, 'fixtures')).toBe(0);
    expect(await countRows(db, 'audit_events')).toBe(1);
    expect(await countRows(db, 'match_events')).toBe(43);
    expect(await countRows(db, 'teams')).toBe(7);
    expect(await countRows(db, 'players')).toBe(74);
    expect(await countRows(db, 'venues')).toBe(4);
    expect(await repos.matches.get('sm1')).not.toBeNull();
  });

  it('deletes a standalone match aggregate with its audit entries', async () => {
    const { db } = await richDatabase();
    await db.withTransactionAsync(async (tx) => {
      await createRepositories(tx).backup.deleteAggregate('match', 'sm1');
    });
    expect(await countRows(db, 'matches', "id = 'sm1'")).toBe(0);
    expect(await countRows(db, 'audit_events', "id = 'sm1-audit'")).toBe(0);
    expect(await countRows(db, 'match_players', "match_id = 'sm1'")).toBe(0);
    expect(await countRows(db, 'matches')).toBe(5);
  });

  it('replaces an existing aggregate from a backup: explicit delete then insert in one transaction', async () => {
    const { db, repos } = await richDatabase();
    const file = await repos.backup.exportData({ kind: 'tournament', tournamentId: 'cup' });
    await repos.tournaments.update({ ...file.tournaments[0], name: 'Locally renamed' });
    await repos.audit.append({ ...file.auditEvents[0], id: 'local-audit', summary: 'Local only' });
    await db.withTransactionAsync(async (tx) => {
      const scoped = createRepositories(tx);
      await scoped.backup.deleteAggregate('tournament', 'cup');
      await scoped.backup.importData(file, { libraryConflict: 'update_local' });
    });
    expect(await repos.backup.exportData({ kind: 'tournament', tournamentId: 'cup' })).toEqual(file);
    expect(await countRows(db, 'audit_events', "id = 'local-audit'")).toBe(0);
    expect(await countRows(db, 'matches', "id = 'sm1'")).toBe(1);
  });
});

/** @jest-environment node */
import type { SQLiteBindParams, SQLiteBindValue, SQLiteRunResult } from 'expo-sqlite';
import type { BackupData, Match, MatchEvent, MatchResult, MatchStatus, PlayerId, TeamId } from '@/domain/types';
import { openAppDatabase, type ExpoSqliteHandle } from '../client';
import { SchemaTooNewError } from '../errors';
import { createMigrationRunner, runMigrations } from '../migrate';
import { LATEST_SCHEMA_VERSION, MIGRATIONS, type MigrationReport } from '../migrations';
import { migration001Initial } from '../migrations/001_initial';
import { createRepositories } from '../repositories';
import type { MatchProjection, Repositories } from '../repositories/contracts';
import { buildMatch, buildTeamSeed, buildVenue, isoAt, squadsFor, type TeamSeed } from '../testing/builders';
import { createFaultInjectingDatabase, sqliteError, type FaultInjectingDatabase } from '../testing/faultInjectingDatabase';
import { EventLogBuilder, goldenMatchEvents, goldenProjection, goldenResult, type GoldenMatchOptions } from '../testing/goldenMatch';
import { countRows, openTestRepositories } from '../testing/harness';
import { loadSqlJs, sqlJsConnection } from '../testing/sqljsConnection';
import { createMigratedSqlJsDatabase, createSqlJsDatabase, type SqlJsTestDatabase } from '../testing/sqljsDatabase';
import { seedBareTournament } from '../testing/structureBuilders';
import { buildTournamentScenario, seedLibrary, seedTournamentScenario, type TournamentScenario } from '../testing/tournamentScenario';
import type { Migration, SqlDatabase, SqlExecutor, SqlParams, SqlValue } from '../types';

const lions = buildTeamSeed('lio', 'Lions', 'LIO');
const tigers = buildTeamSeed('tig', 'Tigers', 'TIG');
const L = (n: number): PlayerId => lions.players[n - 1].id;
const T = (n: number): PlayerId => tigers.players[n - 1].id;

function goldenFor(matchId: string): GoldenMatchOptions {
  return {
    matchId,
    batFirst: { teamId: 'lio', playerIds: lions.players.map((p) => p.id) },
    bowlFirst: { teamId: 'tig', playerIds: tigers.players.map((p) => p.id) },
    idPrefix: `${matchId}-`,
  };
}

const golden = goldenFor('m1');
const LIVE_LOG = goldenMatchEvents({ ...golden, includeMatchEnd: false });
const FULL_LOG = goldenMatchEvents(golden);

function actionGroups(events: readonly MatchEvent[]): MatchEvent[][] {
  const groups: MatchEvent[][] = [];
  for (const event of events) {
    const current = groups[groups.length - 1];
    if (current !== undefined && current[0].actionId === event.actionId) {
      current.push(event);
    } else {
      groups.push([event]);
    }
  }
  return groups;
}

const GROUPS = actionGroups(LIVE_LOG);

function eventsThrough(groupCount: number): MatchEvent[] {
  return GROUPS.slice(0, groupCount).flat();
}

function progress(actions: number, matchId = 'm1'): MatchProjection {
  const base = goldenProjection(goldenFor(matchId), { projectionVersion: 1, teamAId: 'lio', at: isoAt(100 + actions), completed: false });
  return { ...base, innings: base.innings.map((line, index) => (index === 0 ? { ...line, runs: actions } : line)) };
}

type UseCase = (repos: Repositories) => Promise<void>;

function inTx(db: SqlDatabase, work: UseCase): Promise<void> {
  return db.withTransactionAsync(async (tx) => work(createRepositories(tx)));
}

function recordGroup(index: number): UseCase {
  return async (repos) => {
    await repos.events.append(GROUPS[index]);
    await repos.matches.writeProjection(progress(index + 1));
  };
}

async function insertLiveMatch(db: SqlDatabase, overrides: Partial<Match> = {}): Promise<void> {
  await inTx(db, async (repos) => {
    await repos.matches.insert(
      buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live', startedAt: isoAt(1), ...overrides }),
      squadsFor(lions, tigers),
    );
  });
}

async function seedLiveMatch(db: SqlDatabase, groupCount: number): Promise<void> {
  await insertLiveMatch(db);
  for (let index = 0; index < groupCount; index += 1) {
    await inTx(db, recordGroup(index));
  }
}

async function coldRestart(image: Uint8Array): Promise<{ readonly db: SqlJsTestDatabase; readonly repos: Repositories; readonly report: MigrationReport }> {
  const db = await createSqlJsDatabase({ data: image });
  const report = await runMigrations(db, { now: () => isoAt(99999) });
  return { db, repos: createRepositories(db), report };
}

async function baseLibraryImage(): Promise<Uint8Array> {
  const db = await createMigratedSqlJsDatabase();
  await seedLibrary(db, [lions, tigers]);
  return db.exportAsync();
}

async function pragmaValue(db: SqlExecutor, pragma: string): Promise<unknown> {
  const row = await db.getFirstAsync<Record<string, unknown>>(`PRAGMA ${pragma}`);
  return row === null ? null : Object.values(row)[0];
}

async function foreignKeyRows(db: SqlExecutor): Promise<unknown[]> {
  return db.getAllAsync<unknown>('PRAGMA foreign_key_check');
}

async function schemaSnapshot(db: SqlExecutor): Promise<unknown[]> {
  return db.getAllAsync<unknown>("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");
}

async function appliedVersions(db: SqlExecutor): Promise<number[]> {
  const rows = await db.getAllAsync<{ readonly version: number }>('SELECT version FROM schema_migrations ORDER BY version');
  return rows.map((row) => row.version);
}

async function tableExists(db: SqlExecutor, name: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ readonly n: number }>("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?", [name]);
  return (row?.n ?? 0) > 0;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const WRITE_SQL = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|BEGIN|COMMIT|END|SAVEPOINT|RELEASE)\b/i;
const COMMIT_SQL = /^\s*(COMMIT|END)\b/i;

function allKindsLog(matchId: string): MatchEvent[] {
  return new EventLogBuilder(matchId, `${matchId}-`)
    .act({ kind: 'innings_started', inningsIndex: 0, battingTeamId: 'lio', strikerId: L(1), nonStrikerId: L(2), bowlerId: T(7) })
    .act({ kind: 'delivery', call: 'fair', runsTo: 'bat', strikerId: L(1), nonStrikerId: L(2), bowlerId: T(7), runsRun: 2, shortRuns: 1, boundary: 0, wicket: null })
    .act({ kind: 'delivery', call: 'wide', strikerId: L(2), nonStrikerId: L(1), bowlerId: T(7), runsRun: 1, shortRuns: 0, boundary: 0, wicket: null })
    .act({ kind: 'delivery', call: 'no_ball', runsTo: 'leg_bye', strikerId: L(2), nonStrikerId: L(1), bowlerId: T(7), runsRun: 1, shortRuns: 0, boundary: 0, wicket: null })
    .act(
      {
        kind: 'delivery',
        call: 'fair',
        runsTo: 'bat',
        strikerId: L(1),
        nonStrikerId: L(2),
        bowlerId: T(7),
        runsRun: 1,
        shortRuns: 0,
        boundary: 0,
        wicket: { type: 'run_out', playerOutId: L(2), fielderIds: [T(3), T(5)], dismissalEnd: 'non_striker_end' },
      },
      { kind: 'batter_in', playerId: L(3), position: 'non_striker' },
    )
    .act({ kind: 'bowler_selected', bowlerId: T(8), reason: 'over_start' })
    .act({ kind: 'strike_swapped' })
    .act({ kind: 'batter_retired', playerId: L(1), retirement: 'retired_hurt' }, { kind: 'batter_in', playerId: L(4), position: 'striker' })
    .act({ kind: 'batter_dismissed', playerId: L(3), type: 'run_out', fielderIds: [T(12)] }, { kind: 'batter_in', playerId: L(5), position: 'non_striker' })
    .act({ kind: 'penalty_awarded', teamId: 'tig', inningsIndex: 1, runs: 5, reason: 'Ball tampering' })
    .act({ kind: 'play_suspended', reason: 'rain', note: null })
    .act({ kind: 'play_resumed' })
    .act({ kind: 'overs_revised', inningsIndex: 0, maxBalls: 12, target: null, maxOversPerBowler: null, terminal: false, reason: 'Rain' })
    .act({
      kind: 'overs_revised',
      inningsIndex: 1,
      maxBalls: 12,
      target: 20,
      bowlerQuotaMode: 'icc_one_fifth',
      powerplays: [{ name: 'Powerplay', fromOver: 1, toOver: 1 }],
      terminal: false,
      reason: 'Rain again',
    })
    .act({ kind: 'delivery', call: 'fair', runsTo: 'bye', strikerId: L(4), nonStrikerId: null, bowlerId: T(8), runsRun: 0, shortRuns: 0, boundary: 4, wicket: null })
    .act({
      kind: 'delivery',
      call: 'fair',
      runsTo: 'bat',
      strikerId: L(4),
      nonStrikerId: L(5),
      bowlerId: T(8),
      runsRun: 0,
      shortRuns: 0,
      boundary: 0,
      wicket: { type: 'caught', playerOutId: L(4), fielderIds: [T(12)], dismissalEnd: null },
    })
    .act({ kind: 'innings_ended', reason: 'batters_unavailable', absentees: [{ playerId: L(10), hurt: true }, { playerId: L(11), hurt: false }] })
    .act({ kind: 'super_over_started', round: 1 })
    .act({ kind: 'match_ended', outcome: { type: 'awarded', winnerTeamId: null, reason: 'Crowd trouble', margin: { kind: 'wickets', wickets: 3, ballsRemaining: 4 } } })
    .events();
}

function fromExpoValue(value: SQLiteBindValue): SqlValue {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return value as SqlValue;
}

function fromExpoParams(params: SQLiteBindParams): SqlParams {
  if (Array.isArray(params)) {
    return params.map(fromExpoValue);
  }
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, fromExpoValue(value)]));
}

interface NativeFile {
  readonly handle: ExpoSqliteHandle;
  readonly calls: string[];
  image(): Uint8Array;
  isClosed(): boolean;
}

async function nativeFile(image: Uint8Array | null): Promise<NativeFile> {
  const SQL = await loadSqlJs();
  const raw = image === null ? new SQL.Database() : new SQL.Database(image);
  const connection = sqlJsConnection(raw);
  const calls: string[] = [];
  let closed = false;
  const handle: ExpoSqliteHandle = {
    async execAsync(source: string): Promise<void> {
      calls.push(source);
      await connection.execAsync(source);
    },
    async runAsync(source: string, params: SQLiteBindParams): Promise<SQLiteRunResult> {
      calls.push(source);
      const result = await connection.runAsync(source, fromExpoParams(params));
      return { lastInsertRowId: result.lastInsertRowId, changes: result.changes };
    },
    async getFirstAsync<T>(source: string, params: SQLiteBindParams): Promise<T | null> {
      calls.push(source);
      return connection.getFirstAsync<T>(source, fromExpoParams(params));
    },
    async getAllAsync<T>(source: string, params: SQLiteBindParams): Promise<T[]> {
      calls.push(source);
      return connection.getAllAsync<T>(source, fromExpoParams(params));
    },
    async closeAsync(): Promise<void> {
      closed = true;
    },
  };
  return { handle, calls, image: () => connection.exportImage(), isClosed: () => closed };
}

function connectionPragmasInsideTransactions(calls: readonly string[]): string[] {
  const inside: string[] = [];
  let open = false;
  for (const sql of calls) {
    if (/^\s*BEGIN\b/i.test(sql)) {
      open = true;
    } else if (/^\s*(COMMIT|END|ROLLBACK)\b/i.test(sql)) {
      open = false;
    } else if (open && /PRAGMA\s+(foreign_keys|journal_mode|synchronous)\s*=/i.test(sql)) {
      inside.push(sql);
    }
  }
  return inside;
}

describe('the app adapter (openAppDatabase over an expo-style handle) across a restart', () => {
  it('connection pragmas come before the first migration statement, never inside a transaction, and are applied again on every reopen (FR-02d, R2)', async () => {
    const first = await nativeFile(null);
    const opened: string[] = [];
    const db = await openAppDatabase('scorebook.db', async (name) => {
      opened.push(name);
      return first.handle;
    });
    expect(opened).toEqual(['scorebook.db']);
    const indexOf = (pattern: RegExp): number => first.calls.findIndex((sql) => pattern.test(sql));
    const pragmaIndexes = [indexOf(/PRAGMA\s+foreign_keys\s*=\s*ON/i), indexOf(/PRAGMA\s+journal_mode\s*=\s*WAL/i), indexOf(/PRAGMA\s+synchronous\s*=\s*FULL/i)];
    expect(pragmaIndexes.every((index) => index >= 0)).toBe(true);
    const report = await runMigrations(db, { now: () => isoAt(0) });
    expect(report).toEqual({ fromVersion: 0, toVersion: LATEST_SCHEMA_VERSION, applied: MIGRATIONS.map((m) => m.version) });
    expect(indexOf(/CREATE\s+TABLE/i)).toBeGreaterThan(Math.max(...pragmaIndexes));
    expect(connectionPragmasInsideTransactions(first.calls)).toEqual([]);
    expect(await pragmaValue(db, 'foreign_keys')).toBe(1);
    expect(await pragmaValue(db, 'synchronous')).toBe(2);
    await seedLibrary(db, [lions, tigers]);
    await seedLiveMatch(db, 5);
    const image = first.image();
    await db.closeAsync();
    expect(first.isClosed()).toBe(true);
    const second = await nativeFile(image);
    const reopened = await openAppDatabase('scorebook.db', async () => second.handle);
    expect(await pragmaValue(reopened, 'foreign_keys')).toBe(1);
    expect(await runMigrations(reopened, { now: () => isoAt(1) })).toEqual({ fromVersion: LATEST_SCHEMA_VERSION, toVersion: LATEST_SCHEMA_VERSION, applied: [] });
    const repos = createRepositories(reopened);
    expect(await repos.events.listByMatch('m1')).toEqual(eventsThrough(5));
    const resumable = await repos.matches.findResumable({ forPrompt: true });
    expect(resumable.map((item) => item.id)).toEqual(['m1']);
    expect(resumable[0].innings[0].runs).toBe(5);
    await expect(
      reopened.runAsync("INSERT INTO players (id, team_id, name, role, created_at, updated_at) VALUES ('ghost', 'no-such-team', 'Ghost', 'unknown', ?, ?)", [isoAt(0), isoAt(0)]),
    ).rejects.toThrow(/FOREIGN KEY/i);
    await inTx(reopened, recordGroup(5));
    expect(await repos.events.lastSeq('m1')).toBe(eventsThrough(6).length);
  });

  it('on the app adapter a failing use case rolls back, a root write issued meanwhile waits and is kept, and concurrent use cases are serialised (FR-07c, FR-07f)', async () => {
    const file = await nativeFile(null);
    const db = await openAppDatabase('scorebook.db', async () => file.handle);
    await runMigrations(db, { now: () => isoAt(0) });
    await seedLibrary(db, [lions, tigers]);
    await seedLiveMatch(db, 2);
    const tail = eventsThrough(2).length;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signalInside: () => void = () => undefined;
    const inside = new Promise<void>((resolve) => {
      signalInside = resolve;
    });
    const failing = db.withTransactionAsync(async (tx) => {
      const repos = createRepositories(tx);
      await repos.events.append(GROUPS[2]);
      await repos.matches.writeProjection(progress(3));
      signalInside();
      await gate;
      throw new Error('scorer cancelled');
    });
    await inside;
    let settled = false;
    const rootWrite = createRepositories(db)
      .matches.setResumeDismissed('m1', isoAt(4321))
      .then(() => {
        settled = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(settled).toBe(false);
    release();
    await expect(failing).rejects.toThrow('scorer cancelled');
    await withTimeout(rootWrite, 2000, 'root write queued behind a failing transaction');
    expect(file.calls.some((sql) => /^\s*ROLLBACK\b/i.test(sql))).toBe(true);
    const root = createRepositories(db);
    expect(await root.events.lastSeq('m1')).toBe(tail);
    expect((await root.matches.get('m1'))?.resumeDismissedAt).toBe(isoAt(4321));
    expect((await root.matches.findResumable())[0].innings[0].runs).toBe(2);
    await withTimeout(
      Promise.all([inTx(db, recordGroup(2)), inTx(db, async (repos) => repos.matches.setResumeDismissed('m1', null)), inTx(db, recordGroup(3))]),
      2000,
      'three concurrent use cases',
    );
    expect(await root.events.listByMatch('m1')).toEqual(eventsThrough(4));
    const second = await nativeFile(file.image());
    const reopened = createRepositories(await openAppDatabase('scorebook.db', async () => second.handle));
    expect(await reopened.events.listByMatch('m1')).toEqual(eventsThrough(4));
    expect((await reopened.matches.get('m1'))?.resumeDismissedAt).toBeNull();
    expect((await reopened.matches.findResumable({ forPrompt: true }))[0].innings[0].runs).toBe(4);
  });
});

describe('restart: a new repositories instance sees everything that was committed', () => {
  it('R1 warm restart: fresh repositories on the same database see every appended event and findResumable returns the live match', async () => {
    const { db } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    const early = createRepositories(db);
    expect(await early.events.lastSeq('m1')).toBe(0);
    await seedLiveMatch(db, GROUPS.length);
    expect(await early.events.lastSeq('m1')).toBe(LIVE_LOG.length);
    const restarted = createRepositories(db);
    expect(await restarted.events.listByMatch('m1')).toEqual(LIVE_LOG);
    expect(await restarted.events.lastSeq('m1')).toBe(LIVE_LOG.length);
    const resumable = await restarted.matches.findResumable({ forPrompt: true });
    expect(resumable.map((item) => item.id)).toEqual(['m1']);
    expect(resumable[0].status).toBe('live');
    expect(resumable[0].innings.map((line) => line.runs)).toEqual([GROUPS.length, 28]);
    expect(resumable[0].teamA).toEqual({ id: 'lio', name: 'Lions', shortName: 'LIO' });
  });

  it('reads through the root handle stay fresh when exports (which free prepared statements) interleave with writes', async () => {
    const { db } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    await insertLiveMatch(db);
    const reader = createRepositories(db);
    for (let index = 0; index < 6; index += 1) {
      await inTx(db, recordGroup(index));
      await db.exportAsync();
      expect(await reader.events.lastSeq('m1')).toBe(eventsThrough(index + 1).length);
      expect(await reader.events.listByMatch('m1')).toEqual(eventsThrough(index + 1));
      await db.exportAsync();
      const [item] = await reader.matches.findResumable();
      expect(item.innings[0].runs).toBe(index + 1);
    }
  });

  it('R2 cold restart: the migration run on the reopened image is a no-op and every event kind round-trips exactly', async () => {
    const { db } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    const log = allKindsLog('m1');
    await insertLiveMatch(db);
    await inTx(db, async (repos) => {
      await repos.events.append(log);
    });
    const restarted = await coldRestart(await db.exportAsync());
    expect(restarted.report).toEqual({ fromVersion: LATEST_SCHEMA_VERSION, toVersion: LATEST_SCHEMA_VERSION, applied: [] });
    const stored = await restarted.repos.events.listByMatch('m1');
    expect(stored).toEqual(log);
    const revisions = stored.filter((event) => event.kind === 'overs_revised');
    expect(revisions).toHaveLength(2);
    const [revisedCurrent, revisedFuture] = revisions;
    if (revisedCurrent?.kind === 'overs_revised' && revisedFuture?.kind === 'overs_revised') {
      expect('maxOversPerBowler' in revisedCurrent).toBe(true);
      expect(revisedCurrent.maxOversPerBowler).toBeNull();
      expect(revisedFuture.maxOversPerBowler).toBeUndefined();
      expect(revisedFuture.bowlerQuotaMode).toBe('icc_one_fifth');
      expect(revisedFuture.powerplays).toEqual([{ name: 'Powerplay', fromOver: 1, toOver: 1 }]);
    }
    const lastManBall = stored.find((event) => event.kind === 'delivery' && event.call !== 'wide' && event.runsTo === 'bye' && event.boundary === 4);
    expect(lastManBall?.kind === 'delivery' ? lastManBall.nonStrikerId : 'missing').toBeNull();
    const wide = stored.find((event) => event.kind === 'delivery' && event.call === 'wide');
    expect(wide === undefined ? 'missing' : 'runsTo' in wide ? wide.runsTo : 'absent').toBe('absent');
    expect(await restarted.repos.events.lastSeq('m1')).toBe(log.length);
  });

  it('R2 cold restart: Unicode, quotes and backslashes in payload text and names survive, and an Urdu team name is found by search (NFR-S-17)', async () => {
    const { db } = await openTestRepositories();
    const qalandars = buildTeamSeed('qal', 'لاہور قلندرز', 'LQ');
    await seedLibrary(db, [lions, qalandars]);
    const reason = 'گیند سے چھیڑ چھاڑ 🏏 "quoted" \\ back\\slash é́';
    const log = new EventLogBuilder('u1', 'u1-')
      .act({ kind: 'innings_started', inningsIndex: 0, battingTeamId: 'lio', strikerId: L(1), nonStrikerId: L(2), bowlerId: qalandars.players[6].id })
      .act({ kind: 'penalty_awarded', teamId: 'lio', inningsIndex: 0, runs: 5, reason })
      .act({ kind: 'play_suspended', reason: 'bad_light', note: 'روشنی کم ہے — "wait"' })
      .events();
    await inTx(db, async (repos) => {
      await repos.matches.insert(
        buildMatch({ id: 'u1', teamAId: 'lio', teamBId: 'qal', status: 'live', title: 'قذافی اسٹیڈیم میں مقابلہ' }),
        squadsFor(lions, qalandars),
      );
      await repos.events.append(log);
    });
    const restarted = await coldRestart(await db.exportAsync());
    expect(await restarted.repos.events.listByMatch('u1')).toEqual(log);
    expect(await restarted.repos.teams.get('qal')).toEqual(qalandars.team);
    expect((await restarted.repos.matches.list({ search: 'قلندر', limit: 10 })).map((item) => item.id)).toEqual(['u1']);
    expect((await restarted.repos.matches.list({ search: 'اسٹیڈیم', limit: 10 })).map((item) => item.id)).toEqual(['u1']);
    const [item] = await restarted.repos.matches.findResumable();
    expect(item.teamB).toEqual({ id: 'qal', name: 'لاہور قلندرز', shortName: 'LQ' });
  });

  it('R2 cold restart: the reopened connection enforces foreign keys again', async () => {
    const { db } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    const restarted = await coldRestart(await db.exportAsync());
    expect(await pragmaValue(restarted.db, 'foreign_keys')).toBe(1);
    await expect(
      restarted.db.runAsync(
        "INSERT INTO players (id, team_id, name, role, created_at, updated_at) VALUES ('ghost', 'no-such-team', 'Ghost', 'unknown', ?, ?)",
        [isoAt(0), isoAt(0)],
      ),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('a connection keeps enforcing foreign keys after an image export on it (exports reopen the sql.js handle)', async () => {
    const { db } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    await db.exportAsync();
    expect(await pragmaValue(db, 'foreign_keys')).toBe(1);
    await expect(
      db.runAsync("INSERT INTO players (id, team_id, name, role, created_at, updated_at) VALUES ('ghost', 'no-such-team', 'Ghost', 'unknown', ?, ?)", [
        isoAt(0),
        isoAt(0),
      ]),
    ).rejects.toThrow(/FOREIGN KEY/i);
    const faulty = await createFaultInjectingDatabase({ data: await db.exportAsync() });
    await inTx(faulty, async (repos) => repos.matches.setResumeDismissed('nothing', null));
    expect(faulty.durableImages.length).toBeGreaterThanOrEqual(2);
    expect(await pragmaValue(faulty, 'foreign_keys')).toBe(1);
    await expect(
      faulty.runAsync("INSERT INTO players (id, team_id, name, role, created_at, updated_at) VALUES ('ghost', 'no-such-team', 'Ghost', 'unknown', ?, ?)", [
        isoAt(0),
        isoAt(0),
      ]),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('R2 cold restart: a completed tournament snapshot (version, frozen matchSides, summaries) and the tournaments list are identical after the restart', async () => {
    const { db, repos } = await openTestRepositories();
    const scenario = buildTournamentScenario('rs');
    await seedTournamentScenario(db, scenario);
    const before = await repos.tournaments.getSnapshot(scenario.tournament.id, 1);
    const listBefore = await repos.tournaments.list();
    expect(before).not.toBeNull();
    expect(Object.keys(before?.summaries ?? {})).toHaveLength(scenario.matches.length);
    const restarted = await coldRestart(await db.exportAsync());
    expect(await restarted.repos.tournaments.getSnapshot(scenario.tournament.id, 1)).toEqual(before);
    expect(await restarted.repos.tournaments.list()).toEqual(listBefore);
    expect(listBefore[0].championName).toBe('Tigers');
  });

  it('R2 cold restart: getSetup returns the squad with names and the resolved side sizes', async () => {
    const { db } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    await insertLiveMatch(db, { teamBPlayers: 7 });
    const restarted = await coldRestart(await db.exportAsync());
    const setup = await restarted.repos.matches.getSetup('m1');
    expect(setup?.teams).toEqual([
      { id: 'lio', name: 'Lions', shortName: 'LIO', playersInSide: 11 },
      { id: 'tig', name: 'Tigers', shortName: 'TIG', playersInSide: 7 },
    ]);
    expect(setup?.players).toHaveLength(24);
    expect(setup?.players.find((player) => player.playerId === T(12))).toEqual({
      matchId: 'm1',
      playerId: T(12),
      teamId: 'tig',
      name: 'Tigers Player 12',
      jerseyNumber: 12,
      role: 'bowler',
      battingOrder: null,
      isCaptain: false,
      isWicketKeeper: false,
      isSubstitute: true,
    });
    expect(setup?.toss).toEqual({ winnerTeamId: 'lio', decision: 'bat' });
  });

  it('R2 cold restart: findResumable keeps live/paused matches most recent first and the SAVE & EXIT dismissal survives', async () => {
    const { db } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    const win: MatchResult = { type: 'win', winnerTeamId: 'lio', loserTeamId: 'tig', margin: { kind: 'runs', runs: 3 }, method: 'normal' };
    const rows: Match[] = [
      buildMatch({ id: 'r-live-old', teamAId: 'lio', teamBId: 'tig', status: 'live', updatedAt: isoAt(500) }),
      buildMatch({ id: 'r-paused', teamAId: 'tig', teamBId: 'lio', status: 'paused', updatedAt: isoAt(900) }),
      buildMatch({ id: 'r-dismissed', teamAId: 'lio', teamBId: 'tig', status: 'live', updatedAt: isoAt(700), resumeDismissedAt: isoAt(710) }),
      buildMatch({ id: 'r-scheduled', teamAId: 'lio', teamBId: 'tig', status: 'scheduled', updatedAt: isoAt(1000) }),
      buildMatch({ id: 'r-completed', teamAId: 'lio', teamBId: 'tig', status: 'completed', result: win, winnerTeamId: 'lio', updatedAt: isoAt(1100) }),
      buildMatch({ id: 'r-abandoned', teamAId: 'lio', teamBId: 'tig', status: 'abandoned', result: { type: 'abandoned', reason: null }, updatedAt: isoAt(1200) }),
      buildMatch({ id: 'r-postponed', teamAId: 'lio', teamBId: 'tig', status: 'postponed', updatedAt: isoAt(1300) }),
      buildMatch({ id: 'r-cancelled', teamAId: 'lio', teamBId: 'tig', status: 'cancelled', updatedAt: isoAt(1400) }),
    ];
    await inTx(db, async (repos) => {
      for (const match of rows) {
        await repos.matches.insert(match, squadsFor(lions, tigers));
      }
    });
    const restarted = await coldRestart(await db.exportAsync());
    expect((await restarted.repos.matches.findResumable()).map((item) => item.id)).toEqual(['r-paused', 'r-dismissed', 'r-live-old']);
    const prompt = await restarted.repos.matches.findResumable({ forPrompt: true });
    expect(prompt.map((item) => item.id)).toEqual(['r-paused', 'r-live-old']);
    const all = await restarted.repos.matches.findResumable();
    expect(all.find((item) => item.id === 'r-dismissed')?.resumeDismissedAt).toBe(isoAt(710));
    await restarted.repos.matches.setResumeDismissed('r-dismissed', null);
    expect((await restarted.repos.matches.findResumable({ forPrompt: true })).map((item) => item.id)).toEqual([
      'r-paused',
      'r-dismissed',
      'r-live-old',
    ]);
    const bumped = goldenProjection(goldenFor('r-live-old'), { projectionVersion: 1, teamAId: 'lio', at: isoAt(2000), completed: false });
    await inTx(restarted.db, async (repos) => repos.matches.writeProjection(bumped));
    expect((await restarted.repos.matches.findResumable()).map((item) => item.id)).toEqual(['r-live-old', 'r-paused', 'r-dismissed']);
  });

  it('after a cold restart undo uses the stored tail; a stale expected tail throws, rolls back and deletes nothing', async () => {
    const { db } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    await seedLiveMatch(db, 12);
    const restarted = await coldRestart(await db.exportAsync());
    const tail = await restarted.repos.events.lastSeq('m1');
    const lastGroup = GROUPS[11];
    await expect(
      inTx(restarted.db, async (repos) => {
        await repos.matches.setResumeDismissed('m1', isoAt(4242));
        await repos.events.truncateFrom('m1', lastGroup[0].seq, tail - 1);
      }),
    ).rejects.toThrow();
    expect(await restarted.repos.events.lastSeq('m1')).toBe(tail);
    expect((await restarted.repos.matches.get('m1'))?.resumeDismissedAt).toBeNull();
    let deleted = -1;
    await inTx(restarted.db, async (repos) => {
      deleted = await repos.events.truncateFrom('m1', lastGroup[0].seq, tail);
    });
    expect(deleted).toBe(lastGroup.length);
    expect(await restarted.repos.events.listByMatch('m1')).toEqual(eventsThrough(11));
  });

  it('two repository instances on one database: the stale writer is rejected and its projection write rolls back with it (FR-12)', async () => {
    const { db } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    await seedLiveMatch(db, 8);
    const instanceA = createRepositories(db);
    const instanceB = createRepositories(db);
    const seenByA = await instanceA.events.lastSeq('m1');
    const seenByB = await instanceB.events.lastSeq('m1');
    expect(seenByA).toBe(seenByB);
    await inTx(db, recordGroup(8));
    const staleEvents = GROUPS[8].map((event) => ({ ...event, id: `${event.id}-b`, actionId: 'b-action' }));
    const staleProjection: MatchProjection = { ...progress(99), updatedAt: isoAt(9999) };
    await expect(
      inTx(db, async (repos) => {
        await repos.matches.writeProjection(staleProjection);
        await repos.events.append(staleEvents);
      }),
    ).rejects.toThrow();
    expect(await instanceB.events.listByMatch('m1')).toEqual(eventsThrough(9));
    const [item] = await instanceB.matches.findResumable();
    expect(item.innings[0].runs).toBe(9);
    expect(item.updatedAt).toBe(progress(9).updatedAt);
  });
});

describe('crash recovery with the fault-injecting adapter', () => {
  let image: Uint8Array;

  beforeAll(async () => {
    const db = await createSqlJsDatabase({ data: await baseLibraryImage() });
    await seedLiveMatch(db, 1);
    image = await db.exportAsync();
  });

  const preCrashSeq = (): number => GROUPS[0].length;

  it('a crash while writing the partnerships projection loses both the event and the whole projection (FR-01b)', async () => {
    const db = await createFaultInjectingDatabase({ data: image });
    db.crashAt({ sql: /partnerships/i });
    await expect(inTx(db, recordGroup(1))).rejects.toThrow();
    expect(db.crashed).toBe(true);
    const restarted = await coldRestart(db.lastDurableImage());
    expect(await restarted.repos.events.lastSeq('m1')).toBe(preCrashSeq());
    const [item] = await restarted.repos.matches.findResumable({ forPrompt: true });
    expect(item.id).toBe('m1');
    expect(item.innings[0].runs).toBe(1);
    expect(await countRows(restarted.db, 'partnerships', 'match_id = ?', ['m1'])).toBe(4);
    expect(await foreignKeyRows(restarted.db)).toEqual([]);
    await inTx(restarted.db, recordGroup(1));
    expect(await restarted.repos.events.lastSeq('m1')).toBe(eventsThrough(2).length);
  });

  it('a crash on the COMMIT statement itself leaves nothing durable and the same ball can be recorded again with the same seq', async () => {
    const db = await createFaultInjectingDatabase({ data: image });
    db.crashAt({ sql: COMMIT_SQL });
    await expect(inTx(db, recordGroup(1))).rejects.toThrow();
    const restarted = await coldRestart(db.lastDurableImage());
    expect(await restarted.repos.events.lastSeq('m1')).toBe(preCrashSeq());
    await inTx(restarted.db, recordGroup(1));
    expect((await restarted.repos.events.listByMatch('m1')).map((event) => event.seq)).toEqual(eventsThrough(2).map((event) => event.seq));
  });

  it('a crash right after COMMIT keeps the ball and the resume prompt shows the new score (FR-01c)', async () => {
    const db = await createFaultInjectingDatabase({ data: image });
    await inTx(db, recordGroup(1));
    db.crashAt({ sql: /./ });
    await expect(createRepositories(db).events.listByMatch('m1')).rejects.toThrow();
    const restarted = await coldRestart(db.lastDurableImage());
    expect(await restarted.repos.events.listByMatch('m1')).toEqual(eventsThrough(2));
    const [item] = await restarted.repos.matches.findResumable({ forPrompt: true });
    expect(item.innings[0].runs).toBe(2);
  });

  it('a failing COMMIT is rolled back on the same connection: root reads do not see the rows and the next transaction starts cleanly (FR-07c)', async () => {
    const db = await createFaultInjectingDatabase({ data: image });
    db.failOnCommit(1);
    await expect(inTx(db, recordGroup(1))).rejects.toThrow();
    const root = createRepositories(db);
    expect(await root.events.lastSeq('m1')).toBe(preCrashSeq());
    expect((await root.matches.findResumable())[0].innings[0].runs).toBe(1);
    await withTimeout(inTx(db, recordGroup(1)), 2000, 'transaction after a failed COMMIT');
    expect(await root.events.lastSeq('m1')).toBe(eventsThrough(2).length);
    const restarted = await coldRestart(db.lastDurableImage());
    expect(await restarted.repos.events.lastSeq('m1')).toBe(eventsThrough(2).length);
  });

  it('SQLITE_BUSY on BEGIN surfaces the original error, never runs the task and releases the writer mutex (FR-07d)', async () => {
    const db = await createFaultInjectingDatabase({ data: image });
    db.failOn({ sql: /^\s*BEGIN\b/i, error: sqliteError('SQLITE_BUSY') });
    let ran = false;
    await expect(
      withTimeout(
        db.withTransactionAsync(async () => {
          ran = true;
        }),
        2000,
        'transaction with a busy BEGIN',
      ),
    ).rejects.toThrow(/SQLITE_BUSY|database is locked/);
    expect(ran).toBe(false);
    await withTimeout(inTx(db, recordGroup(1)), 2000, 'transaction after SQLITE_BUSY');
    expect(await createRepositories(db).events.lastSeq('m1')).toBe(eventsThrough(2).length);
  });

  it('a task that throws a non-Error value rolls back, rethrows that exact value and releases the mutex', async () => {
    const db = await createFaultInjectingDatabase({ data: image });
    const thrown = { code: 'NOT_AN_ERROR' };
    await expect(
      db.withTransactionAsync(async (tx) => {
        await createRepositories(tx).events.append(GROUPS[1]);
        throw thrown;
      }),
    ).rejects.toBe(thrown);
    expect(await createRepositories(db).events.lastSeq('m1')).toBe(preCrashSeq());
    await withTimeout(inTx(db, recordGroup(1)), 2000, 'transaction after a non-Error throw');
    expect(await createRepositories(db).events.lastSeq('m1')).toBe(eventsThrough(2).length);
  });

  it('a root read issued during an open transaction waits and never observes uncommitted rows', async () => {
    const db = await createSqlJsDatabase({ data: image });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signalInside: () => void = () => undefined;
    const inside = new Promise<void>((resolve) => {
      signalInside = resolve;
    });
    const transaction = db.withTransactionAsync(async (tx) => {
      await createRepositories(tx).events.append(GROUPS[1]);
      signalInside();
      await gate;
      throw new Error('organizer cancelled');
    });
    await inside;
    let settled = false;
    const read = createRepositories(db)
      .events.lastSeq('m1')
      .then((value) => {
        settled = true;
        return value;
      });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(settled).toBe(false);
    release();
    await expect(transaction).rejects.toThrow('organizer cancelled');
    expect(await read).toBe(preCrashSeq());
  });

  it('SAVE & EXIT written on the root handle is durable at once: a power cut right after it keeps the match out of the startup prompt (FR-03c)', async () => {
    const db = await createFaultInjectingDatabase({ data: image });
    await createRepositories(db).matches.setResumeDismissed('m1', isoAt(777));
    db.crashAt({ sql: /./ });
    await expect(createRepositories(db).matches.findResumable()).rejects.toThrow();
    const restarted = await coldRestart(db.lastDurableImage());
    expect(await restarted.repos.matches.findResumable({ forPrompt: true })).toEqual([]);
    const all = await restarted.repos.matches.findResumable();
    expect(all.map((item) => item.id)).toEqual(['m1']);
    expect(all[0].resumeDismissedAt).toBe(isoAt(777));
    await inTx(restarted.db, async (repos) => {
      await recordGroup(1)(repos);
      await repos.matches.setResumeDismissed('m1', null);
    });
    expect((await restarted.repos.matches.findResumable({ forPrompt: true })).map((item) => item.id)).toEqual(['m1']);
  });

  it('a root write queued behind a transaction that fails is committed on its own and survives a power cut (FR-07f)', async () => {
    const db = await createFaultInjectingDatabase({ data: image });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signalInside: () => void = () => undefined;
    const inside = new Promise<void>((resolve) => {
      signalInside = resolve;
    });
    const failing = db.withTransactionAsync(async (tx) => {
      await recordGroup(1)(createRepositories(tx));
      signalInside();
      await gate;
      throw new Error('replay found an error');
    });
    await inside;
    const rootWrite = createRepositories(db).matches.setResumeDismissed('m1', isoAt(888));
    release();
    await expect(failing).rejects.toThrow('replay found an error');
    await withTimeout(rootWrite, 2000, 'queued root write');
    db.crashAt({ sql: /./ });
    await expect(createRepositories(db).events.lastSeq('m1')).rejects.toThrow();
    const restarted = await coldRestart(db.lastDurableImage());
    expect(await restarted.repos.events.lastSeq('m1')).toBe(preCrashSeq());
    expect((await restarted.repos.matches.get('m1'))?.resumeDismissedAt).toBe(isoAt(888));
    expect((await restarted.repos.matches.findResumable())[0].innings[0].runs).toBe(1);
  });

  it('FR-02a sweep with projections: a power cut at any statement of creating the match and recording 8 actions leaves the log on an action boundary and the projection in step with it', async () => {
    const base = await baseLibraryImage();
    const COUNT = 8;
    const flow = async (db: SqlDatabase): Promise<void> => {
      await insertLiveMatch(db);
      for (let index = 0; index < COUNT; index += 1) {
        await inTx(db, recordGroup(index));
      }
    };
    const dry = await createFaultInjectingDatabase({ data: base, captureDurableImages: false });
    await flow(dry);
    const total = dry.statementLog.length;
    const boundaries = Array.from({ length: COUNT + 1 }, (_, groups) => eventsThrough(groups).length);
    const seen = new Set<number>();
    const started = performance.now();
    for (let k = 1; k <= total; k += 1) {
      const db = await createFaultInjectingDatabase({ data: base });
      db.crashAt({ sql: /./, occurrence: k });
      await expect(flow(db)).rejects.toThrow();
      const restarted = await coldRestart(db.lastDurableImage());
      const events = await restarted.repos.events.listByMatch('m1');
      const groups = boundaries.indexOf(events.length);
      expect({ k, length: events.length, onBoundary: groups >= 0 }).toEqual({ k, length: events.length, onBoundary: true });
      expect(events).toEqual(eventsThrough(groups));
      seen.add(groups);
      const match = await restarted.repos.matches.get('m1');
      const prompt = await restarted.repos.matches.findResumable({ forPrompt: true });
      const squad = await countRows(restarted.db, 'match_players', 'match_id = ?', ['m1']);
      if (match === null) {
        expect({ k, groups, prompt: prompt.length, squad }).toEqual({ k, groups: 0, prompt: 0, squad: 0 });
      } else {
        expect({ k, prompt: prompt.map((item) => item.id), squad }).toEqual({ k, prompt: ['m1'], squad: 24 });
        expect({ k, groups, runs: prompt[0].innings[0]?.runs ?? 0 }).toEqual({ k, groups, runs: groups });
      }
      expect(await foreignKeyRows(restarted.db)).toEqual([]);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: COUNT }, (_, index) => index));
    console.log(`FR-02a projection sweep: ${total} crash points in ${(performance.now() - started).toFixed(0)} ms`);
  }, 240000);

  it('FR-01e sweep: a crash at any statement of a history edit (replaceAll + projections) keeps the old log and projection; after COMMIT only the new log exists', async () => {
    const seeded = await createSqlJsDatabase({ data: await baseLibraryImage() });
    await seedLiveMatch(seeded, 12);
    const editImage = await seeded.exportAsync();
    const oldLog = eventsThrough(12);
    const edited: MatchEvent[] = eventsThrough(10).map((event) => ({
      ...event,
      id: `${event.id}-e`,
      actionId: `${event.actionId}-e`,
      recordedAt: isoAt(50000 + event.seq),
    }));
    const edit = (db: SqlDatabase): Promise<void> =>
      inTx(db, async (repos) => {
        await repos.events.replaceAll('m1', edited);
        await repos.matches.writeProjection(progress(10));
      });
    const dry = await createFaultInjectingDatabase({ data: editImage, captureDurableImages: false });
    await edit(dry);
    const total = dry.statementLog.length;
    expect(total).toBeGreaterThanOrEqual(4);
    expect(await createRepositories(dry).events.listByMatch('m1')).toEqual(edited);
    for (let k = 1; k <= total; k += 1) {
      const db = await createFaultInjectingDatabase({ data: editImage });
      db.crashAt({ sql: /./, occurrence: k });
      await expect(edit(db)).rejects.toThrow();
      const restarted = await coldRestart(db.lastDurableImage());
      expect({ k, log: await restarted.repos.events.listByMatch('m1') }).toEqual({ k, log: oldLog });
      expect({ k, runs: (await restarted.repos.matches.findResumable())[0].innings[0].runs }).toEqual({ k, runs: 12 });
    }
    const survivor = await createFaultInjectingDatabase({ data: editImage });
    await edit(survivor);
    survivor.crashAt({ sql: /./ });
    const restarted = await coldRestart(survivor.lastDurableImage());
    expect(await restarted.repos.events.listByMatch('m1')).toEqual(edited);
    expect((await restarted.repos.matches.findResumable())[0].innings[0].runs).toBe(10);
  }, 120000);

  it('FR-15 sweep: a crash at any statement of a tournament delete (its 5 matches first, then the aggregate) deletes nothing; the committed delete leaves only the library', async () => {
    const source = await openTestRepositories();
    const scenario = buildTournamentScenario('del');
    await seedTournamentScenario(source.db, scenario);
    const tournamentId = scenario.tournament.id;
    const deleteImage = await source.db.exportAsync();
    const footprint = await source.repos.tournaments.deletionFootprint(tournamentId);
    expect(footprint.matches).toBe(5);
    const counts = async (db: SqlExecutor): Promise<Record<string, number>> => ({
      tournaments: await countRows(db, 'tournaments'),
      matches: await countRows(db, 'matches'),
      match_events: await countRows(db, 'match_events'),
      match_players: await countRows(db, 'match_players'),
      innings: await countRows(db, 'innings'),
      fixtures: await countRows(db, 'fixtures'),
      stage_slots: await countRows(db, 'stage_slots'),
      pool_teams: await countRows(db, 'pool_teams'),
      tournament_overrides: await countRows(db, 'tournament_overrides'),
      audit_events: await countRows(db, 'audit_events', 'tournament_id = ?', [tournamentId]),
      teams: await countRows(db, 'teams'),
      players: await countRows(db, 'players'),
      venues: await countRows(db, 'venues'),
    });
    const before = await counts(source.db);
    const deleteAll = (db: SqlDatabase): Promise<void> =>
      inTx(db, async (repos) => {
        for (const matchId of await repos.tournaments.listMatchIds(tournamentId)) {
          await repos.matches.delete(matchId);
        }
        await repos.tournaments.delete(tournamentId);
      });
    const dry = await createFaultInjectingDatabase({ data: deleteImage, captureDurableImages: false });
    await deleteAll(dry);
    const total = dry.statementLog.length;
    expect(total).toBeGreaterThan(5);
    for (let k = 1; k <= total; k += 1) {
      const db = await createFaultInjectingDatabase({ data: deleteImage });
      db.crashAt({ sql: /./, occurrence: k });
      await expect(deleteAll(db)).rejects.toThrow();
      const restarted = await coldRestart(db.lastDurableImage());
      expect({ k, counts: await counts(restarted.db) }).toEqual({ k, counts: before });
      expect(await restarted.repos.tournaments.deletionFootprint(tournamentId)).toEqual(footprint);
    }
    expect(await counts(dry)).toEqual({
      ...before,
      tournaments: 0,
      matches: 0,
      match_events: 0,
      match_players: 0,
      innings: 0,
      fixtures: 0,
      stage_slots: 0,
      pool_teams: 0,
      tournament_overrides: 0,
      audit_events: 0,
    });
    expect(await foreignKeyRows(dry)).toEqual([]);
  }, 120000);

  it('a crash at any statement of a full tournament import leaves nothing behind; after COMMIT everything is there (FR-06g sweep)', async () => {
    const source = await openTestRepositories();
    const scenario = buildTournamentScenario('imp');
    await seedTournamentScenario(source.db, scenario);
    const data = await source.repos.backup.exportData({ kind: 'tournament', tournamentId: scenario.tournament.id });
    const empty = await (await createMigratedSqlJsDatabase()).exportAsync();
    const importAll = (db: SqlDatabase): Promise<void> =>
      inTx(db, async (repos) => repos.backup.importData(data, { libraryConflict: 'keep_local' }));
    const dry = await createFaultInjectingDatabase({ data: empty });
    dry.clearLog();
    await importAll(dry);
    const commitIndex = dry.statementLog.findIndex((entry) => COMMIT_SQL.test(entry.sql)) + 1;
    expect(commitIndex).toBeGreaterThan(10);
    const expected = {
      tournaments: await countRows(dry, 'tournaments'),
      matches: await countRows(dry, 'matches'),
      match_events: await countRows(dry, 'match_events'),
      teams: await countRows(dry, 'teams'),
      fixtures: await countRows(dry, 'fixtures'),
    };
    expect(expected.match_events).toBe(scenario.matches.reduce((sum, entry) => sum + entry.events.length, 0));
    const stride = Math.max(1, Math.floor(commitIndex / 30));
    const points = new Set<number>([1, 2, commitIndex - 1, commitIndex]);
    for (let k = 1; k <= commitIndex; k += stride) {
      points.add(k);
    }
    const started = performance.now();
    for (const k of [...points].sort((a, b) => a - b)) {
      const db = await createFaultInjectingDatabase({ data: empty });
      db.crashAt({ sql: /./, occurrence: k });
      await expect(importAll(db)).rejects.toThrow();
      const reopened = await createSqlJsDatabase({ data: db.lastDurableImage() });
      const counts = {
        tournaments: await countRows(reopened, 'tournaments'),
        matches: await countRows(reopened, 'matches'),
        match_events: await countRows(reopened, 'match_events'),
        teams: await countRows(reopened, 'teams'),
        fixtures: await countRows(reopened, 'fixtures'),
      };
      expect({ k, counts }).toEqual({ k, counts: { tournaments: 0, matches: 0, match_events: 0, teams: 0, fixtures: 0 } });
    }
    const survivor = await createFaultInjectingDatabase({ data: empty });
    survivor.crashAt({ sql: /./, occurrence: commitIndex + 1 });
    await importAll(survivor);
    await expect(survivor.getFirstAsync('SELECT 1')).rejects.toThrow();
    const reopened = await createSqlJsDatabase({ data: survivor.lastDurableImage() });
    expect({
      tournaments: await countRows(reopened, 'tournaments'),
      matches: await countRows(reopened, 'matches'),
      match_events: await countRows(reopened, 'match_events'),
      teams: await countRows(reopened, 'teams'),
      fixtures: await countRows(reopened, 'fixtures'),
    }).toEqual(expected);
    expect(await foreignKeyRows(reopened)).toEqual([]);
    console.log(`import crash sweep: ${points.size} crash points over ${commitIndex} statements in ${(performance.now() - started).toFixed(0)} ms`);
  }, 120000);
});

describe('migrations', () => {
  const NOW = '2026-09-30T08:00:00.000Z';
  const now = (): string => NOW;

  const addMotto: Migration = { version: 2, name: 'team_motto', up: 'ALTER TABLE teams ADD COLUMN motto TEXT;' };
  const brokenStats: Migration = {
    version: 3,
    name: 'extra_stats',
    up: 'CREATE TABLE extra_stats (id TEXT PRIMARY KEY) STRICT;\nINSERT INTO extra_stats (id, missing_column) VALUES (\'a\', 1);',
  };
  const fixedStats: Migration = { version: 3, name: 'extra_stats', up: 'CREATE TABLE extra_stats (id TEXT PRIMARY KEY) STRICT;' };

  const DOCUMENTED_TABLES = [
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
    'schema_migrations',
  ];

  it('fresh database → latest: report, one schema_migrations row per migration with the injected time, foreign keys on, every table', async () => {
    const db = await createFaultInjectingDatabase();
    const report = await runMigrations(db, { now });
    expect(report).toEqual({ fromVersion: 0, toVersion: LATEST_SCHEMA_VERSION, applied: MIGRATIONS.map((m) => m.version) });
    expect(MIGRATIONS.map((m) => m.version)).toEqual(MIGRATIONS.map((_, index) => index + 1));
    const rows = await db.getAllAsync<{ readonly version: number; readonly name: string; readonly applied_at: string }>(
      'SELECT version, name, applied_at FROM schema_migrations ORDER BY version',
    );
    expect(rows).toEqual(MIGRATIONS.map((m) => ({ version: m.version, name: m.name, applied_at: NOW })));
    expect(await pragmaValue(db, 'foreign_keys')).toBe(1);
    for (const table of DOCUMENTED_TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: true });
    }
    const pragmaWritesInTransaction = db.statementLog.filter(
      (entry) => entry.inTransaction && /PRAGMA\s+(foreign_keys|journal_mode|synchronous)\s*=/i.test(entry.sql),
    );
    expect(pragmaWritesInTransaction).toEqual([]);
    expect(await foreignKeyRows(db)).toEqual([]);
  });

  it('re-running on an up-to-date database is a pure read: same report shape, no writes, no foreign_key_check, data kept', async () => {
    const db = await createFaultInjectingDatabase();
    await runMigrations(db, { now });
    await seedLibrary(db, [lions, tigers]);
    const before = await schemaSnapshot(db);
    db.clearLog();
    const report = await runMigrations(db, { now: () => '2030-01-01T00:00:00.000Z' });
    expect(report).toEqual({ fromVersion: LATEST_SCHEMA_VERSION, toVersion: LATEST_SCHEMA_VERSION, applied: [] });
    expect(db.statementLog.filter((entry) => WRITE_SQL.test(entry.sql)).map((entry) => entry.sql)).toEqual([]);
    expect(db.statementLog.some((entry) => /foreign_key_check/i.test(entry.sql))).toBe(false);
    expect(await schemaSnapshot(db)).toEqual(before);
    expect(await appliedVersions(db)).toEqual(MIGRATIONS.map((m) => m.version));
    expect((await createRepositories(db).teams.get('lio'))?.name).toBe('Lions');
    const again = await runMigrations(db, { now });
    expect(again).toEqual(report);
  });

  it('a database recorded by a newer app is refused with SchemaTooNewError and left untouched (FR-05i)', async () => {
    const db = await createFaultInjectingDatabase();
    await runMigrations(db, { now });
    await seedLibrary(db, [lions, tigers]);
    await db.runAsync('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [LATEST_SCHEMA_VERSION + 1, 'future', NOW]);
    const schemaBefore = await schemaSnapshot(db);
    const migrationsBefore = await db.getAllAsync<unknown>('SELECT * FROM schema_migrations ORDER BY version');
    db.clearLog();
    const error = await runMigrations(db, { now }).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(SchemaTooNewError);
    if (error instanceof SchemaTooNewError) {
      expect(error.databaseVersion).toBe(LATEST_SCHEMA_VERSION + 1);
      expect(error.appVersion).toBe(LATEST_SCHEMA_VERSION);
    }
    expect(db.statementLog.filter((entry) => WRITE_SQL.test(entry.sql)).map((entry) => entry.sql)).toEqual([]);
    expect(await schemaSnapshot(db)).toEqual(schemaBefore);
    expect(await db.getAllAsync<unknown>('SELECT * FROM schema_migrations ORDER BY version')).toEqual(migrationsBefore);
    expect(await countRows(db, 'players')).toBe(24);
  });

  it('an image migrated by a newer app (v2) is refused after a cold restart by this app (v1) and its v2 schema survives', async () => {
    const newer = await createSqlJsDatabase();
    await createMigrationRunner([...MIGRATIONS, addMotto])(newer, { now });
    await newer.runAsync(
      "INSERT INTO teams (id, name, short_name, created_at, updated_at, motto) VALUES ('mot', 'Mottoes', 'MOT', ?, ?, 'Never give up')",
      [NOW, NOW],
    );
    const reopened = await createSqlJsDatabase({ data: await newer.exportAsync() });
    await expect(runMigrations(reopened, { now })).rejects.toBeInstanceOf(SchemaTooNewError);
    expect(await appliedVersions(reopened)).toEqual([1, 2]);
    expect(await reopened.getFirstAsync<{ readonly motto: string }>("SELECT motto FROM teams WHERE id = 'mot'")).toEqual({ motto: 'Never give up' });
  });

  it('a failing migration rolls back its own DDL and schema_migrations row while earlier migrations of the same run stay committed', async () => {
    const db = await createSqlJsDatabase();
    await expect(createMigrationRunner([...MIGRATIONS, addMotto, brokenStats])(db, { now })).rejects.toThrow();
    expect(await appliedVersions(db)).toEqual([1, 2]);
    expect(await tableExists(db, 'extra_stats')).toBe(false);
    const columns = await db.getAllAsync<{ readonly name: string }>("SELECT name FROM pragma_table_info('teams')");
    expect(columns.map((column) => column.name)).toContain('motto');
    expect(await pragmaValue(db, 'foreign_keys')).toBe(1);
    const retry = await createMigrationRunner([...MIGRATIONS, addMotto, fixedStats])(db, { now });
    expect(retry).toEqual({ fromVersion: 2, toVersion: 3, applied: [3] });
    expect(await tableExists(db, 'extra_stats')).toBe(true);
  });

  it('a failing first migration on a fresh database leaves no half-built schema and a later retry starts from 0', async () => {
    const db = await createSqlJsDatabase();
    const brokenInitial: Migration = { ...migration001Initial, up: `${migration001Initial.up}\nINSERT INTO no_such_table VALUES (1);` };
    await expect(createMigrationRunner([brokenInitial])(db, { now })).rejects.toThrow();
    expect(await tableExists(db, 'matches')).toBe(false);
    expect(await tableExists(db, 'match_events')).toBe(false);
    expect(await appliedVersions(db).catch(() => [])).toEqual([]);
    const report = await runMigrations(db, { now });
    expect(report).toEqual({ fromVersion: 0, toVersion: LATEST_SCHEMA_VERSION, applied: MIGRATIONS.map((m) => m.version) });
  });

  it('a foreignKeysOff migration that fails with an SQL error still switches foreign keys back on and rolls back', async () => {
    const db = await createMigratedSqlJsDatabase();
    const rebuild: Migration = {
      version: 2,
      name: 'rebuild_fails',
      foreignKeysOff: true,
      up: 'CREATE TABLE venues_new (id TEXT PRIMARY KEY) STRICT;\nSELECT * FROM table_that_does_not_exist;',
    };
    await expect(createMigrationRunner([...MIGRATIONS, rebuild])(db, { now })).rejects.toThrow();
    expect(await pragmaValue(db, 'foreign_keys')).toBe(1);
    expect(await tableExists(db, 'venues_new')).toBe(false);
    expect(await appliedVersions(db)).toEqual([1]);
  });

  it('the final foreign_key_check runs only after a run that applied something: a pre-existing orphan blocks an upgrade but not a plain launch', async () => {
    const db = await createMigratedSqlJsDatabase();
    await db.execAsync('PRAGMA foreign_keys = OFF');
    await db.runAsync(
      "INSERT INTO players (id, team_id, name, role, created_at, updated_at) VALUES ('ghost', 'no-such-team', 'Ghost', 'unknown', ?, ?)",
      [NOW, NOW],
    );
    await db.execAsync('PRAGMA foreign_keys = ON');
    await expect(runMigrations(db, { now })).resolves.toEqual({ fromVersion: 1, toVersion: 1, applied: [] });
    await expect(createMigrationRunner([...MIGRATIONS, addMotto])(db, { now })).rejects.toThrow();
  });

  it('migration 1 is plain DDL: no connection pragmas and no transaction control of its own (FR-02d)', () => {
    expect(migration001Initial.version).toBe(1);
    expect(migration001Initial.up).not.toMatch(/PRAGMA\s+(foreign_keys|journal_mode|synchronous)/i);
    expect(migration001Initial.up).not.toMatch(/\bCOMMIT\b|\bROLLBACK\b|BEGIN\s+(TRANSACTION|IMMEDIATE|EXCLUSIVE|DEFERRED)\b|BEGIN\s*;/i);
    expect(migration001Initial.up).not.toMatch(/INSERT\s+OR\s+REPLACE|REPLACE\s+INTO/i);
  });

  it('data written at v1 survives an additive v2 migration on a cold-restarted image and repositories still round-trip it', async () => {
    const { db } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    await seedLiveMatch(db, 5);
    const reopened = await createSqlJsDatabase({ data: await db.exportAsync() });
    const report = await createMigrationRunner([...MIGRATIONS, addMotto])(reopened, { now });
    expect(report).toEqual({ fromVersion: 1, toVersion: 2, applied: [2] });
    const repos = createRepositories(reopened);
    expect(await repos.teams.get('lio')).toEqual(lions.team);
    expect(await repos.players.listByTeam('tig')).toEqual(tigers.players);
    expect(await repos.events.listByMatch('m1')).toEqual(eventsThrough(5));
    expect((await repos.matches.findResumable())[0].innings[0].runs).toBe(5);
    await inTx(reopened, recordGroup(5));
    expect(await repos.events.lastSeq('m1')).toBe(eventsThrough(6).length);
  });

  it('a power cut at any statement of a fresh install leaves either no v1 schema or all of it, and the next launch completes the upgrade', async () => {
    const dry = await createFaultInjectingDatabase({ captureDurableImages: false });
    await runMigrations(dry, { now });
    const total = dry.statementLog.length;
    expect(total).toBeGreaterThanOrEqual(3);
    const schemaTables = DOCUMENTED_TABLES.filter((table) => table !== 'schema_migrations');
    for (let k = 1; k <= total; k += 1) {
      const db = await createFaultInjectingDatabase();
      db.crashAt({ sql: /./, occurrence: k });
      await expect(runMigrations(db, { now })).rejects.toThrow();
      const reopened = await createSqlJsDatabase({ data: db.lastDurableImage() });
      const versions = (await tableExists(reopened, 'schema_migrations')) ? await appliedVersions(reopened) : [];
      const present: boolean[] = [];
      for (const table of schemaTables) {
        present.push(await tableExists(reopened, table));
      }
      const state = present.every(Boolean) ? 'all' : present.every((exists) => !exists) ? 'none' : 'partial';
      expect({ k, versions, state }).toEqual({ k, versions, state: versions.includes(1) ? 'all' : 'none' });
      const report = await runMigrations(reopened, { now });
      expect({ k, report }).toEqual({
        k,
        report: {
          fromVersion: versions.length === 0 ? 0 : Math.max(...versions),
          toVersion: LATEST_SCHEMA_VERSION,
          applied: MIGRATIONS.map((m) => m.version).filter((version) => !versions.includes(version)),
        },
      });
      expect(await foreignKeyRows(reopened)).toEqual([]);
      expect(await tableExists(reopened, 'match_events')).toBe(true);
    }
  });

  it('a power cut inside the second of two pending upgrades keeps the first; the next launch applies only the remaining one and keeps the data', async () => {
    const db = await createFaultInjectingDatabase({ data: await baseLibraryImage() });
    db.crashAt({ sql: /extra_stats/ });
    await expect(createMigrationRunner([...MIGRATIONS, addMotto, fixedStats])(db, { now })).rejects.toThrow();
    const reopened = await createSqlJsDatabase({ data: db.lastDurableImage() });
    expect(await appliedVersions(reopened)).toEqual([1, 2]);
    expect(await tableExists(reopened, 'extra_stats')).toBe(false);
    const columns = await reopened.getAllAsync<{ readonly name: string }>("SELECT name FROM pragma_table_info('teams')");
    expect(columns.map((column) => column.name)).toContain('motto');
    const report = await createMigrationRunner([...MIGRATIONS, addMotto, fixedStats])(reopened, { now });
    expect(report).toEqual({ fromVersion: 2, toVersion: 3, applied: [3] });
    expect(await createRepositories(reopened).teams.get('lio')).toEqual(lions.team);
    expect(await countRows(reopened, 'players')).toBe(24);
  });

  it('a recorded history that is not a prefix of the migration list (1, 3 without 2) is refused and the missing migration is not run', async () => {
    const db = await createFaultInjectingDatabase();
    await runMigrations(db, { now });
    await db.runAsync('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [3, 'extra_stats', NOW]);
    db.clearLog();
    await expect(createMigrationRunner([...MIGRATIONS, addMotto, fixedStats])(db, { now })).rejects.toThrow();
    const writes = db.statementLog.filter((entry) => WRITE_SQL.test(entry.sql) && !/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+schema_migrations/i.test(entry.sql));
    expect(writes.map((entry) => entry.sql)).toEqual([]);
    expect(await appliedVersions(db)).toEqual([1, 3]);
    const columns = await db.getAllAsync<{ readonly name: string }>("SELECT name FROM pragma_table_info('teams')");
    expect(columns.map((column) => column.name)).not.toContain('motto');
  });

  it('a newer recorded version beyond a gap is refused with SchemaTooNewError before the pending migration 2 is applied', async () => {
    const db = await createFaultInjectingDatabase();
    await runMigrations(db, { now });
    await db.runAsync('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [7, 'future', NOW]);
    db.clearLog();
    const error = await createMigrationRunner([...MIGRATIONS, addMotto])(db, { now }).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(SchemaTooNewError);
    if (error instanceof SchemaTooNewError) {
      expect(error.databaseVersion).toBe(7);
      expect(error.appVersion).toBe(2);
    }
    expect(db.statementLog.filter((entry) => WRITE_SQL.test(entry.sql)).map((entry) => entry.sql)).toEqual([]);
    expect(await appliedVersions(db)).toEqual([1, 7]);
    const columns = await db.getAllAsync<{ readonly name: string }>("SELECT name FROM pragma_table_info('teams')");
    expect(columns.map((column) => column.name)).not.toContain('motto');
  });

  it('a foreignKeysOff 12-step rebuild of a referenced parent: keys off before BEGIN, foreign_key_check before COMMIT, keys on after; rows and RESTRICT survive', async () => {
    const seeded = await createSqlJsDatabase({ data: await baseLibraryImage() });
    await inTx(seeded, async (repos) => repos.venues.insert(buildVenue('ground', 'Gaddafi Stadium')));
    await insertLiveMatch(seeded, { venueId: 'ground' });
    const db = await createFaultInjectingDatabase({ data: await seeded.exportAsync() });
    const tableSql = (await db.getFirstAsync<{ readonly sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'venues'"))?.sql ?? '';
    expect(tableSql).toMatch(/^CREATE TABLE\s+"?venues"?/i);
    const indexSql = (
      await db.getAllAsync<{ readonly sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'venues' AND sql IS NOT NULL")
    ).map((row) => `${row.sql};`);
    const rebuild: Migration = {
      version: 2,
      name: 'rebuild_venues',
      foreignKeysOff: true,
      up: [
        `${tableSql.replace(/^CREATE TABLE\s+"?venues"?/i, 'CREATE TABLE venues_new')};`,
        'INSERT INTO venues_new SELECT * FROM venues;',
        'DROP TABLE venues;',
        'ALTER TABLE venues_new RENAME TO venues;',
        ...indexSql,
      ].join('\n'),
    };
    const venuesBefore = await db.getAllAsync<unknown>('SELECT * FROM venues ORDER BY id');
    db.clearLog();
    const report = await createMigrationRunner([...MIGRATIONS, rebuild])(db, { now });
    expect(report).toEqual({ fromVersion: 1, toVersion: 2, applied: [2] });
    const log = db.statementLog;
    const off = log.findIndex((entry) => /PRAGMA\s+foreign_keys\s*=\s*(OFF|0|FALSE)\b/i.test(entry.sql));
    const begin = log.findIndex((entry, index) => index > off && /^\s*BEGIN\b/i.test(entry.sql));
    const up = log.findIndex((entry) => entry.sql.includes('venues_new'));
    const check = log.findIndex((entry, index) => index > up && /foreign_key_check/i.test(entry.sql));
    const commit = log.findIndex((entry, index) => index > up && /^\s*(COMMIT|END)\b/i.test(entry.sql));
    const on = log.findIndex((entry, index) => index > commit && /PRAGMA\s+foreign_keys\s*=\s*(ON|1|TRUE)\b/i.test(entry.sql));
    expect(off).toBeGreaterThanOrEqual(0);
    expect(log[off].inTransaction).toBe(false);
    expect(begin).toBeGreaterThan(off);
    expect(up).toBeGreaterThan(begin);
    expect(check).toBeGreaterThan(up);
    expect(check).toBeLessThan(commit);
    expect(log[check].inTransaction).toBe(true);
    expect(on).toBeGreaterThan(commit);
    expect(log[on].inTransaction).toBe(false);
    expect(await pragmaValue(db, 'foreign_keys')).toBe(1);
    expect(await db.getAllAsync<unknown>('SELECT * FROM venues ORDER BY id')).toEqual(venuesBefore);
    expect((await createRepositories(db).matches.get('m1'))?.venueId).toBe('ground');
    await expect(db.runAsync("DELETE FROM venues WHERE id = 'ground'")).rejects.toThrow(/FOREIGN KEY/i);
    expect(await foreignKeyRows(db)).toEqual([]);
  });

  it('FR-07h: a foreignKeysOff migration that leaves an orphan row is rolled back by the pre-COMMIT foreign_key_check and keys are back on', async () => {
    const db = await createMigratedSqlJsDatabase();
    await seedLibrary(db, [lions, tigers]);
    const orphaning: Migration = {
      version: 2,
      name: 'orphaning_rebuild',
      foreignKeysOff: true,
      up: `INSERT INTO players (id, team_id, name, role, created_at, updated_at) VALUES ('ghost', 'no-such-team', 'Ghost', 'unknown', '${NOW}', '${NOW}');`,
    };
    await expect(createMigrationRunner([...MIGRATIONS, orphaning])(db, { now })).rejects.toThrow();
    expect(await pragmaValue(db, 'foreign_keys')).toBe(1);
    expect(await countRows(db, 'players', "id = 'ghost'")).toBe(0);
    expect(await countRows(db, 'players')).toBe(24);
    expect(await appliedVersions(db)).toEqual([1]);
    expect(await foreignKeyRows(db)).toEqual([]);
  });
});

function normalise(data: BackupData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = Array.isArray(value) ? [...value].map((row) => JSON.stringify(row)).sort() : value;
  }
  return out;
}

function scramble<Row>(rows: readonly Row[]): Row[] {
  const reversed = [...rows].reverse();
  return [...reversed.filter((_, index) => index % 2 === 1), ...reversed.filter((_, index) => index % 2 === 0)];
}

function scrambled(data: BackupData): BackupData {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    copy[key] = Array.isArray(value) ? scramble(value) : value;
  }
  return copy as unknown as BackupData;
}

describe('backup export → import round trip (deferred foreign keys, one transaction)', () => {
  let scenario: TournamentScenario;
  let source: Awaited<ReturnType<typeof openTestRepositories>>;
  let data: BackupData;

  beforeAll(async () => {
    scenario = buildTournamentScenario('rt');
    source = await openTestRepositories();
    await seedTournamentScenario(source.db, scenario);
    data = await source.repos.backup.exportData({ kind: 'tournament', tournamentId: scenario.tournament.id });
  });

  const importInto = (db: SqlDatabase, payload: BackupData): Promise<void> =>
    inTx(db, async (repos) => repos.backup.importData(payload, { libraryConflict: 'keep_local' }));

  it('a knockout tournament with completed matches re-exports identically from an empty database, with a clean foreign_key_check', async () => {
    expect(data.matches).toHaveLength(scenario.matches.length);
    expect(data.matchEvents).toHaveLength(scenario.matches.reduce((sum, entry) => sum + entry.events.length, 0));
    const target = await openTestRepositories();
    await importInto(target.db, data);
    const again = await target.repos.backup.exportData({ kind: 'tournament', tournamentId: scenario.tournament.id });
    expect(normalise(again)).toEqual(normalise(data));
    expect(await foreignKeyRows(target.db)).toEqual([]);
    for (const entry of scenario.matches) {
      expect(await target.repos.events.listByMatch(entry.match.id)).toEqual(entry.events);
    }
  });

  it('every collection scrambled inside itself still imports in one transaction and re-exports identically', async () => {
    const target = await openTestRepositories();
    await importInto(target.db, scrambled(data));
    const again = await target.repos.backup.exportData({ kind: 'tournament', tournamentId: scenario.tournament.id });
    expect(normalise(again)).toEqual(normalise(data));
    expect(await foreignKeyRows(target.db)).toEqual([]);
  });

  it('before projections are rebuilt the imported terminal matches are reported stale; after rebuilding the snapshot equals the source', async () => {
    const target = await openTestRepositories();
    await importInto(target.db, data);
    const sourceSnapshot = await source.repos.tournaments.getSnapshot(scenario.tournament.id, 1);
    const imported = await target.repos.tournaments.getSnapshot(scenario.tournament.id, 1);
    expect(sourceSnapshot).not.toBeNull();
    expect(imported).not.toBeNull();
    expect(imported?.summaries).toEqual({});
    expect([...(imported?.staleSummaryMatchIds ?? [])].sort()).toEqual(scenario.matches.map((entry) => entry.match.id).sort());
    expect(imported?.fixtures).toEqual(sourceSnapshot?.fixtures);
    expect(await target.repos.matches.listStaleProjections(1)).toEqual(expect.arrayContaining(scenario.matches.map((entry) => entry.match.id)));
    await inTx(target.db, async (repos) => {
      for (const entry of scenario.matches) {
        await repos.matches.writeProjection(entry.projection);
      }
    });
    const rebuilt = await target.repos.tournaments.getSnapshot(scenario.tournament.id, 1);
    expect(rebuilt === null ? null : { ...rebuilt, version: 'v' }).toEqual(sourceSnapshot === null ? null : { ...sourceSnapshot, version: 'v' });
    expect(await target.repos.matches.listStaleProjections(1)).toEqual([]);
  });

  it('a dangling fixture → match reference aborts the COMMIT and leaves the target database empty; a correct import then works', async () => {
    const target = await openTestRepositories();
    const finalId = scenario.fixtures.find((fixture) => fixture.isFinal)?.id;
    const broken: BackupData = {
      ...data,
      fixtures: data.fixtures.map((fixture) => (fixture.id === finalId ? { ...fixture, matchId: 'ghost-match' } : fixture)),
    };
    await expect(importInto(target.db, broken)).rejects.toThrow();
    for (const table of ['tournaments', 'teams', 'players', 'venues', 'fixtures', 'matches', 'match_players', 'match_events', 'audit_events']) {
      expect({ table, rows: await countRows(target.db, table) }).toEqual({ table, rows: 0 });
    }
    await importInto(target.db, data);
    expect(await countRows(target.db, 'match_events')).toBe(data.matchEvents.length);
  });

  it('a dangling pool entry → slot reference aborts the COMMIT as well', async () => {
    const target = await openTestRepositories();
    const koStage = scenario.stages[1].id;
    const broken: BackupData = {
      ...data,
      poolEntries: [...data.poolEntries, { id: 'rt-pe-ghost', poolId: scenario.pools[0].id, stageId: scenario.pools[0].stageId, side: { kind: 'slot', slotId: `${koStage}-ghost-slot` }, seed: null }],
    };
    await expect(importInto(target.db, broken)).rejects.toThrow();
    expect(await countRows(target.db, 'tournaments')).toBe(0);
    expect(await countRows(target.db, 'match_events')).toBe(0);
  });

  it('importing an aggregate that already exists locally (no deleteAggregate first) throws and never merges events into the local log', async () => {
    const local = await openTestRepositories();
    const localScenario = buildTournamentScenario('mg');
    await seedTournamentScenario(local.db, localScenario);
    const backup = await local.repos.backup.exportData({ kind: 'tournament', tournamentId: localScenario.tournament.id });
    const victim = localScenario.matches[0].match.id;
    const fullLength = await local.repos.events.lastSeq(victim);
    await inTx(local.db, async (repos) => {
      await repos.events.truncateFrom(victim, 11, fullLength);
    });
    const revisionBefore = await local.db.getFirstAsync<{ readonly revision: number }>('SELECT revision FROM tournaments WHERE id = ?', [
      localScenario.tournament.id,
    ]);
    await expect(importInto(local.db, backup)).rejects.toThrow();
    expect(await local.repos.events.lastSeq(victim)).toBe(10);
    expect(await countRows(local.db, 'tournaments')).toBe(1);
    expect(await countRows(local.db, 'matches')).toBe(localScenario.matches.length);
    expect(
      await local.db.getFirstAsync<{ readonly revision: number }>('SELECT revision FROM tournaments WHERE id = ?', [localScenario.tournament.id]),
    ).toEqual(revisionBefore);
  });

  it('a full backup with a standalone live match next to the tournament round-trips, and so does a match-scope backup', async () => {
    const origin = await openTestRepositories();
    const fullScenario = buildTournamentScenario('fb');
    await seedTournamentScenario(origin.db, fullScenario);
    const [lioSeed, tigSeed] = fullScenario.teams;
    const standaloneGolden: GoldenMatchOptions = {
      matchId: 'fb-standalone',
      batFirst: { teamId: lioSeed.team.id, playerIds: lioSeed.players.map((p) => p.id) },
      bowlFirst: { teamId: tigSeed.team.id, playerIds: tigSeed.players.map((p) => p.id) },
      idPrefix: 'fb-standalone-',
    };
    const standaloneEvents = goldenMatchEvents({ ...standaloneGolden, includeMatchEnd: false });
    await inTx(origin.db, async (repos) => {
      await repos.matches.insert(
        buildMatch({ id: 'fb-standalone', teamAId: lioSeed.team.id, teamBId: tigSeed.team.id, status: 'live', title: 'Friendly' }),
        squadsFor(lioSeed, tigSeed),
      );
      await repos.events.append(standaloneEvents);
      await repos.matches.writeProjection(
        goldenProjection(standaloneGolden, { projectionVersion: 1, teamAId: lioSeed.team.id, at: isoAt(7777), completed: false }),
      );
    });
    const full = await origin.repos.backup.exportData({ kind: 'full' });
    expect(full.matches.map((match) => match.id)).toContain('fb-standalone');
    const target = await openTestRepositories();
    await importInto(target.db, full);
    expect(normalise(await target.repos.backup.exportData({ kind: 'full' }))).toEqual(normalise(full));
    expect(await foreignKeyRows(target.db)).toEqual([]);
    const matchScope = await origin.repos.backup.exportData({ kind: 'match', matchId: 'fb-standalone' });
    expect(matchScope.matchEvents).toEqual(standaloneEvents);
    expect(matchScope.tournaments).toEqual([]);
    const single = await openTestRepositories();
    await importInto(single.db, matchScope);
    expect(normalise(await single.repos.backup.exportData({ kind: 'match', matchId: 'fb-standalone' }))).toEqual(normalise(matchScope));
    expect(await single.repos.events.listByMatch('fb-standalone')).toEqual(standaloneEvents);
  });

  it('an import whose later step (projection rebuild, then a failing check) throws inside the same transaction leaves the target empty', async () => {
    const target = await openTestRepositories();
    await expect(
      inTx(target.db, async (repos) => {
        await repos.backup.importData(data, { libraryConflict: 'keep_local' });
        for (const entry of scenario.matches) {
          await repos.matches.writeProjection(entry.projection);
        }
        await repos.tournaments.bumpRevision(scenario.tournament.id);
        throw new Error('foreign_key_check reported rows');
      }),
    ).rejects.toThrow('foreign_key_check reported rows');
    for (const table of ['tournaments', 'tournament_rules', 'teams', 'players', 'venues', 'stage_slots', 'fixtures', 'matches', 'match_events', 'innings', 'partnerships', 'audit_events']) {
      expect({ table, rows: await countRows(target.db, table) }).toEqual({ table, rows: 0 });
    }
    await importInto(target.db, data);
    expect(await countRows(target.db, 'match_events')).toBe(data.matchEvents.length);
  });

  it('an injected SQLITE_FULL at INSERTs of an import into a database with local data leaves the file byte-identical and foreign_key_check clean', async () => {
    const local = await openTestRepositories();
    await seedLibrary(local.db, [buildTeamSeed('loc', 'Locals', 'LOC')]);
    await seedBareTournament(local.db, 'local-cup', ['loc']);
    const localImage = await local.db.exportAsync();
    const dry = await createFaultInjectingDatabase({ data: localImage, captureDurableImages: false });
    await importInto(dry, data);
    const inserts = dry.statementLog.filter((entry) => /^\s*INSERT\b/i.test(entry.sql)).length;
    expect(inserts).toBeGreaterThan(3);
    for (const k of [...new Set([1, 2, Math.floor(inserts / 2), inserts])]) {
      const db = await createFaultInjectingDatabase({ data: localImage, captureDurableImages: false });
      const before = await db.exportAsync();
      db.failOn({ sql: /^\s*INSERT\b/i, occurrence: k, error: sqliteError('SQLITE_FULL') });
      await expect(importInto(db, data)).rejects.toThrow(/SQLITE_FULL/);
      const after = await db.exportAsync();
      const identical = after.length === before.length && after.every((byte, index) => byte === before[index]);
      expect({ k, identical }).toEqual({ k, identical: true });
      expect(await foreignKeyRows(db)).toEqual([]);
      expect(await countRows(db, 'tournaments')).toBe(1);
    }
  });

  it('FR-06f: a replace_existing import (deleteAggregate, then insert, one transaction) interrupted at any statement keeps the local aggregate with its local-only change', async () => {
    const local = await openTestRepositories();
    const localScenario = buildTournamentScenario('rp');
    await seedTournamentScenario(local.db, localScenario);
    const tournamentId = localScenario.tournament.id;
    const backup = await local.repos.backup.exportData({ kind: 'tournament', tournamentId });
    const victim = localScenario.matches[0].match.id;
    const fullLength = await local.repos.events.lastSeq(victim);
    await inTx(local.db, async (repos) => {
      await repos.events.truncateFrom(victim, 11, fullLength);
    });
    const localImage = await local.db.exportAsync();
    const localExport = normalise(await local.repos.backup.exportData({ kind: 'tournament', tournamentId }));
    const replace = (db: SqlDatabase): Promise<void> =>
      inTx(db, async (repos) => {
        await repos.backup.deleteAggregate('tournament', tournamentId);
        await repos.backup.importData(backup, { libraryConflict: 'update_local' });
      });
    const dry = await createFaultInjectingDatabase({ data: localImage, captureDurableImages: false });
    await replace(dry);
    const total = dry.statementLog.length;
    expect(await createRepositories(dry).events.lastSeq(victim)).toBe(fullLength);
    expect(normalise(await createRepositories(dry).backup.exportData({ kind: 'tournament', tournamentId }))).toEqual(normalise(backup));
    const stride = Math.max(1, Math.floor(total / 40));
    const points = new Set<number>([1, 2, total - 1, total]);
    for (let k = 1; k <= total; k += stride) {
      points.add(k);
    }
    for (const k of [...points].sort((a, b) => a - b)) {
      const db = await createFaultInjectingDatabase({ data: localImage });
      db.crashAt({ sql: /./, occurrence: k });
      await expect(replace(db)).rejects.toThrow();
      const restarted = await coldRestart(db.lastDurableImage());
      expect({ k, tail: await restarted.repos.events.lastSeq(victim) }).toEqual({ k, tail: 10 });
      expect({ k, data: normalise(await restarted.repos.backup.exportData({ kind: 'tournament', tournamentId })) }).toEqual({ k, data: localExport });
    }
  }, 120000);

  it('an import committed just before a power cut is complete after the restart and re-exports identically', async () => {
    const db = await createFaultInjectingDatabase({ data: await (await createMigratedSqlJsDatabase()).exportAsync() });
    await importInto(db, data);
    db.crashAt({ sql: /./ });
    await expect(db.getFirstAsync('SELECT 1')).rejects.toThrow();
    const restarted = await coldRestart(db.lastDurableImage());
    expect(normalise(await restarted.repos.backup.exportData({ kind: 'tournament', tournamentId: scenario.tournament.id }))).toEqual(normalise(data));
    for (const entry of scenario.matches) {
      expect(await restarted.repos.events.listByMatch(entry.match.id)).toEqual(entry.events);
    }
    expect(await foreignKeyRows(restarted.db)).toEqual([]);
  });
});

async function projectionState(db: SqlExecutor, matchId: string): Promise<unknown> {
  return {
    match: await db.getFirstAsync<unknown>(
      'SELECT status, result_json, winner_team_id, summary_json, projection_version, started_at, completed_at, updated_at FROM matches WHERE id = ?',
      [matchId],
    ),
    innings: await db.getAllAsync<unknown>('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_index', [matchId]),
    partnerships: await db.getAllAsync<unknown>('SELECT * FROM partnerships WHERE match_id = ? ORDER BY innings_index, partnership_index', [matchId]),
  };
}

describe('projections are rewritten atomically together with projection_version', () => {
  const completed = goldenProjection(golden, { projectionVersion: 1, teamAId: 'lio', at: isoAt(5000), completed: true });
  const reopened: MatchProjection = {
    ...goldenProjection(golden, { projectionVersion: 7, teamAId: 'lio', at: isoAt(6000), completed: false }),
    innings: [goldenProjection(golden, { projectionVersion: 7, teamAId: 'lio', at: isoAt(6000), completed: false }).innings[0]],
    partnerships: [goldenProjection(golden, { projectionVersion: 7, teamAId: 'lio', at: isoAt(6000), completed: false }).partnerships[0]],
  };

  async function completedMatchDb(): Promise<SqlJsTestDatabase> {
    const db = await createSqlJsDatabase({ data: await baseLibraryImage() });
    await insertLiveMatch(db);
    await inTx(db, async (repos) => {
      await repos.events.append(FULL_LOG);
      await repos.matches.writeProjection(completed);
    });
    return db;
  }

  it('a shrinking projection removes stale innings and partnership rows, stores the new version and clears the result', async () => {
    const db = await completedMatchDb();
    const repos = createRepositories(db);
    expect(await countRows(db, 'innings', 'match_id = ?', ['m1'])).toBe(2);
    expect(await countRows(db, 'partnerships', 'match_id = ?', ['m1'])).toBe(4);
    const before = await repos.matches.get('m1');
    expect(before?.status).toBe('completed');
    expect(before?.result).toEqual(goldenResult(golden));
    expect(before?.winnerTeamId).toBe('tig');
    await inTx(db, async (tx) => tx.matches.writeProjection(reopened));
    expect(await countRows(db, 'innings', 'match_id = ?', ['m1'])).toBe(1);
    expect(await countRows(db, 'partnerships', 'match_id = ?', ['m1'])).toBe(1);
    expect(await db.getFirstAsync<unknown>('SELECT projection_version AS v, summary_json AS s FROM matches WHERE id = ?', ['m1'])).toEqual({
      v: 7,
      s: null,
    });
    const after = await repos.matches.get('m1');
    expect(after?.status).toBe('live');
    expect(after?.result).toBeNull();
    expect(after?.winnerTeamId).toBeNull();
    expect(after?.completedAt).toBeNull();
    const [item] = await repos.matches.findResumable();
    expect(item.id).toBe('m1');
    expect(item.innings).toHaveLength(1);
    await inTx(db, async (tx) => tx.matches.writeProjection(completed));
    expect(await countRows(db, 'innings', 'match_id = ?', ['m1'])).toBe(2);
    expect(await countRows(db, 'partnerships', 'match_id = ?', ['m1'])).toBe(4);
    expect(await repos.matches.findResumable()).toEqual([]);
    expect((await repos.matches.get('m1'))?.status).toBe('completed');
  });

  it('a projection naming a team outside the match is rejected (innings trigger) and the ball appended in the same transaction rolls back with it', async () => {
    const db = await createSqlJsDatabase({ data: await baseLibraryImage() });
    await seedLibrary(db, [buildTeamSeed('eag', 'Eagles', 'EAG')]);
    await seedLiveMatch(db, 3);
    const valid = progress(4);
    const wrong: MatchProjection = { ...valid, innings: valid.innings.map((line, index) => (index === 0 ? { ...line, battingTeamId: 'eag' } : line)) };
    await expect(
      inTx(db, async (repos) => {
        await repos.events.append(GROUPS[3]);
        await repos.matches.writeProjection(wrong);
      }),
    ).rejects.toThrow();
    const repos = createRepositories(db);
    expect(await repos.events.listByMatch('m1')).toEqual(eventsThrough(3));
    const [item] = await repos.matches.findResumable();
    expect(item.innings.map((line) => line.battingTeamId)).toEqual(['lio', 'tig']);
    expect(item.innings[0].runs).toBe(3);
  });

  it('a task that fails after writeProjection leaves the previous projection and version byte-for-byte intact', async () => {
    const db = await completedMatchDb();
    const before = await projectionState(db, 'm1');
    await expect(
      inTx(db, async (repos) => {
        await repos.matches.writeProjection(reopened);
        throw new Error('replay found an error-severity issue');
      }),
    ).rejects.toThrow('replay found an error-severity issue');
    expect(await projectionState(db, 'm1')).toEqual(before);
  });

  it('an injected SQLITE_FULL at every write statement of writeProjection leaves the stored projection unchanged', async () => {
    const image = await (await completedMatchDb()).exportAsync();
    const dry = await createFaultInjectingDatabase({ data: image });
    const before = await projectionState(dry, 'm1');
    dry.clearLog();
    await inTx(dry, async (repos) => repos.matches.writeProjection(reopened));
    const writes = dry.statementLog.filter((entry) => entry.inTransaction && /^\s*(INSERT|UPDATE|DELETE)\b/i.test(entry.sql)).length;
    expect(writes).toBeGreaterThanOrEqual(3);
    for (let k = 1; k <= writes; k += 1) {
      const db: FaultInjectingDatabase = await createFaultInjectingDatabase({ data: image });
      db.failOn({ sql: /^\s*(INSERT|UPDATE|DELETE)\b/i, occurrence: k, error: sqliteError('SQLITE_FULL') });
      await expect(inTx(db, async (repos) => repos.matches.writeProjection(reopened))).rejects.toThrow(/SQLITE_FULL/);
      expect({ k, state: await projectionState(db, 'm1') }).toEqual({ k, state: before });
      await inTx(db, async (repos) => repos.matches.writeProjection(reopened));
      expect(await countRows(db, 'innings', 'match_id = ?', ['m1'])).toBe(1);
    }
  });

  it('listStaleProjections: only matches with a non-empty log and a lower projection_version, never-projected logs included', async () => {
    const db = await createSqlJsDatabase({ data: await baseLibraryImage() });
    const withLog = async (matchId: string, version: number | null): Promise<void> => {
      await inTx(db, async (repos) => {
        await repos.matches.insert(buildMatch({ id: matchId, teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
        await repos.events.append(goldenMatchEvents({ ...goldenFor(matchId), includeMatchEnd: false }).slice(0, 5));
        if (version !== null) {
          await repos.matches.writeProjection(goldenProjection(goldenFor(matchId), { projectionVersion: version, teamAId: 'lio', at: isoAt(10), completed: false }));
        }
      });
    };
    await withLog('s-v1', 1);
    await withLog('s-v3', 3);
    await withLog('s-never', null);
    await inTx(db, async (repos) => {
      await repos.matches.insert(buildMatch({ id: 's-empty', teamAId: 'lio', teamBId: 'tig' }), squadsFor(lions, tigers));
    });
    const repos = createRepositories(db);
    const stale = async (version: number): Promise<string[]> => [...(await repos.matches.listStaleProjections(version))].sort();
    expect(await stale(4)).toEqual(['s-never', 's-v1', 's-v3']);
    expect(await stale(3)).toEqual(['s-never', 's-v1']);
    expect(await stale(1)).toEqual(['s-never']);
    expect(await stale(0)).toEqual([]);
    const restarted = await coldRestart(await db.exportAsync());
    expect([...(await restarted.repos.matches.listStaleProjections(3))].sort()).toEqual(['s-never', 's-v1']);
  });

  it('getSnapshot moves a summary between summaries and staleSummaryMatchIds as its projection_version changes', async () => {
    const { db, repos } = await openTestRepositories();
    const scenario = buildTournamentScenario('snap', 1);
    await seedTournamentScenario(db, scenario);
    const ids = scenario.matches.map((entry) => entry.match.id).sort();
    const current = await repos.tournaments.getSnapshot(scenario.tournament.id, 1);
    expect(Object.keys(current?.summaries ?? {}).sort()).toEqual(ids);
    expect(current?.staleSummaryMatchIds).toEqual([]);
    const newer = await repos.tournaments.getSnapshot(scenario.tournament.id, 2);
    expect(newer?.summaries).toEqual({});
    expect([...(newer?.staleSummaryMatchIds ?? [])].sort()).toEqual(ids);
    const final = scenario.matches[scenario.matches.length - 1];
    await inTx(db, async (tx) => tx.matches.writeProjection({ ...final.projection, projectionVersion: 2 }));
    const partial = await repos.tournaments.getSnapshot(scenario.tournament.id, 2);
    expect(Object.keys(partial?.summaries ?? {})).toEqual([final.match.id]);
    expect(partial?.summaries[final.match.id]).toEqual(final.projection.summary);
    expect([...(partial?.staleSummaryMatchIds ?? [])].sort()).toEqual(ids.filter((id) => id !== final.match.id));
  });
});

describe('log integrity across restarts and raw corruption', () => {
  it('truncateFrom refuses a log with a gap: the deleted row count differs from expectedLastSeq − fromSeq + 1, so nothing is deleted', async () => {
    const db = await createSqlJsDatabase({ data: await baseLibraryImage() });
    await seedLiveMatch(db, 12);
    const tail = eventsThrough(12).length;
    const fromSeq = GROUPS[9][0].seq;
    const gapSeq = fromSeq + 1;
    expect(gapSeq).toBeLessThan(tail);
    await db.runAsync('DELETE FROM match_events WHERE match_id = ? AND seq = ?', ['m1', gapSeq]);
    const survivors = eventsThrough(12).filter((event) => event.seq !== gapSeq);
    expect(await createRepositories(db).events.lastSeq('m1')).toBe(tail);
    await expect(
      inTx(db, async (repos) => {
        await repos.events.truncateFrom('m1', fromSeq, tail);
      }),
    ).rejects.toThrow();
    expect(await createRepositories(db).events.listByMatch('m1')).toEqual(survivors);
  });

  it('truncateFrom refuses an expected tail that is ahead of the stored log (a writer that saw a ball that was never committed)', async () => {
    const db = await createSqlJsDatabase({ data: await baseLibraryImage() });
    await seedLiveMatch(db, 6);
    const tail = eventsThrough(6).length;
    await expect(
      inTx(db, async (repos) => {
        await repos.events.truncateFrom('m1', GROUPS[5][0].seq, tail + GROUPS[6].length);
      }),
    ).rejects.toThrow();
    expect(await createRepositories(db).events.listByMatch('m1')).toEqual(eventsThrough(6));
  });

  it('after a cold restart the log comes back in seq order although ids sort backwards and recordedAt runs backwards (device clock changed, FR-14)', async () => {
    const db = await createSqlJsDatabase({ data: await baseLibraryImage() });
    await insertLiveMatch(db);
    const skewed = eventsThrough(8).map((event) => ({
      ...event,
      id: `z${String(1000 - event.seq).padStart(4, '0')}`,
      recordedAt: isoAt(90000 - event.seq * 7),
    }));
    await inTx(db, async (repos) => repos.events.append(skewed));
    const restarted = await coldRestart(await db.exportAsync());
    expect(await restarted.repos.events.listByMatch('m1')).toEqual(skewed);
    expect(await restarted.repos.events.lastSeq('m1')).toBe(skewed.length);
  });

  it('FR-05g: corrupt JSON and wrongly typed values cannot be written into the log or the match row by raw SQL', async () => {
    const db = await createSqlJsDatabase({ data: await baseLibraryImage() });
    await seedLiveMatch(db, 6);
    const attempts = [
      "UPDATE match_events SET payload_json = 'x' WHERE match_id = 'm1' AND payload_json IS NOT NULL",
      "UPDATE match_events SET payload_json = '[1,2]' WHERE match_id = 'm1' AND payload_json IS NOT NULL",
      "UPDATE matches SET rules_json = '{bad' WHERE id = 'm1'",
      "UPDATE matches SET summary_json = 'x' WHERE id = 'm1'",
      "UPDATE match_events SET runs_run = 'two' WHERE match_id = 'm1' AND kind = 'delivery'",
      "UPDATE match_events SET boundary = 5 WHERE match_id = 'm1' AND kind = 'delivery'",
    ];
    for (const sql of attempts) {
      const outcome = await db.runAsync(sql).then(
        () => 'written',
        () => 'rejected',
      );
      expect({ sql, outcome }).toEqual({ sql, outcome: 'rejected' });
    }
    expect(await createRepositories(db).events.listByMatch('m1')).toEqual(eventsThrough(6));
  });

  it('FR-05f: projection_version tampered to 0 on three tournament matches is reported by listStaleProjections and getSnapshot until rebuilt', async () => {
    const { db, repos } = await openTestRepositories();
    const scenario = buildTournamentScenario('ver');
    await seedTournamentScenario(db, scenario);
    const ids = scenario.matches.map((entry) => entry.match.id);
    const tampered = ids.slice(0, 3);
    await db.runAsync('UPDATE matches SET projection_version = 0 WHERE id IN (?, ?, ?)', tampered);
    expect([...(await repos.matches.listStaleProjections(1))].sort()).toEqual([...tampered].sort());
    const snapshot = await repos.tournaments.getSnapshot(scenario.tournament.id, 1);
    expect([...(snapshot?.staleSummaryMatchIds ?? [])].sort()).toEqual([...tampered].sort());
    expect(Object.keys(snapshot?.summaries ?? {}).sort()).toEqual(ids.slice(3).sort());
    const restarted = await coldRestart(await db.exportAsync());
    expect([...(await restarted.repos.matches.listStaleProjections(1))].sort()).toEqual([...tampered].sort());
    await inTx(restarted.db, async (tx) => {
      for (const entry of scenario.matches.slice(0, 3)) {
        await tx.matches.writeProjection(entry.projection);
      }
    });
    expect(await restarted.repos.matches.listStaleProjections(1)).toEqual([]);
    const rebuilt = await restarted.repos.tournaments.getSnapshot(scenario.tournament.id, 1);
    expect(rebuilt?.staleSummaryMatchIds).toEqual([]);
    expect(Object.keys(rebuilt?.summaries ?? {}).sort()).toEqual([...ids].sort());
  });
});

interface SeededMatch {
  readonly id: string;
  readonly title: string;
  readonly teamAId: TeamId;
  readonly teamBId: TeamId;
  readonly status: MatchStatus;
  readonly tournamentId: string | null;
  readonly scheduledDate: string | null;
  readonly updatedAt: string;
  readonly projected: boolean;
}

const HISTORY_TEAMS: readonly TeamSeed[] = [
  buildTeamSeed('lio', 'Lions', 'LIO', 0),
  buildTeamSeed('tig', 'Tigers', 'TIG', 0),
  buildTeamSeed('eag', 'Eagles', 'EAG', 0),
  buildTeamSeed('haw', 'Hawks', 'HAW', 0),
  buildTeamSeed('ela', 'Élan XI', 'ELA', 0),
  buildTeamSeed('bul', 'Bulls', 'BUL', 0),
];
const TEAM_NAME = new Map(HISTORY_TEAMS.map((seed) => [seed.team.id, seed.team.name]));
const T1_MEMBERS = ['lio', 'tig', 'eag', 'haw'];
const T2_MEMBERS = ['eag', 'haw', 'ela', 'bul'];
const STATUS_CYCLE: readonly MatchStatus[] = ['scheduled', 'live', 'paused', 'completed', 'postponed', 'cancelled', 'abandoned'];
const HISTORY_SIZE = 220;

function pairs(): [TeamId, TeamId][] {
  const ids = HISTORY_TEAMS.map((seed) => seed.team.id);
  const out: [TeamId, TeamId][] = [];
  for (let a = 0; a < ids.length; a += 1) {
    for (let b = a + 1; b < ids.length; b += 1) {
      out.push([ids[a], ids[b]]);
    }
  }
  return out;
}

function specialTitle(index: number): string | null {
  if (index === 5) {
    return 'Final 100% effort';
  }
  if (index === 6) {
    return 'A_B derby';
  }
  if (index === 8) {
    return 'lions revenge';
  }
  if (index === 9) {
    return "O'Brien Trophy";
  }
  if (index === 11) {
    return 'C:\\Cup\\2026';
  }
  return null;
}

function historyMatch(index: number): { readonly match: Match; readonly seeded: SeededMatch } {
  const allPairs = pairs();
  const [first, second] = allPairs[index % allPairs.length];
  const [teamAId, teamBId] = index % 2 === 0 ? [first, second] : [second, first];
  const inT1 = T1_MEMBERS.includes(teamAId) && T1_MEMBERS.includes(teamBId);
  const inT2 = T2_MEMBERS.includes(teamAId) && T2_MEMBERS.includes(teamBId);
  const tournamentId = index % 4 === 1 && inT1 ? 'T1' : index % 4 === 2 && inT2 ? 'T2' : null;
  const status = STATUS_CYCLE[index % STATUS_CYCLE.length];
  const result: MatchResult | null =
    status === 'completed'
      ? { type: 'win', winnerTeamId: teamAId, loserTeamId: teamBId, margin: { kind: 'runs', runs: 1 + (index % 30) }, method: 'normal' }
      : status === 'abandoned'
        ? { type: 'abandoned', reason: null }
        : null;
  const scheduledDate = index % 5 === 0 ? null : `2026-06-${String(1 + ((index * 7) % 28)).padStart(2, '0')}`;
  const title = specialTitle(index) ?? `Match ${String(index).padStart(3, '0')}`;
  const updatedAt = isoAt(index * 60 + 30);
  const match = buildMatch({
    id: `h-${String(index).padStart(3, '0')}`,
    title,
    teamAId,
    teamBId,
    status,
    result,
    winnerTeamId: result?.type === 'win' ? result.winnerTeamId : null,
    tournamentId,
    scheduledDate,
    scheduledTime: index % 3 === 0 ? null : `1${index % 10}:00`,
    completedAt: result === null ? null : isoAt(index * 60 + 20),
    createdAt: isoAt(index * 60),
    updatedAt,
  });
  return {
    match,
    seeded: { id: match.id, title, teamAId, teamBId, status, tournamentId, scheduledDate, updatedAt, projected: status === 'completed' && index % 2 === 1 },
  };
}

function historyProjection(match: Match): MatchProjection {
  const line = (inningsIndex: number, batting: TeamId, bowling: TeamId, runs: number) => ({
    inningsIndex,
    kind: 'regular' as const,
    battingTeamId: batting,
    runs,
    wickets: inningsIndex + 2,
    legalBalls: 18,
    ballsPerOver: 6,
    status: 'complete' as const,
    completionReason: 'overs_complete' as const,
    superOverRound: null,
    bowlingTeamId: bowling,
    maxBalls: 18,
    target: inningsIndex === 0 ? null : runs + 5,
    targetRevised: false,
    extras: { wides: 1, noBalls: 0, byes: 0, legByes: 0, penalty: 0, total: 1 },
  });
  return {
    matchId: match.id,
    projectionVersion: 1,
    status: match.status,
    result: match.result,
    winnerTeamId: match.winnerTeamId,
    summary: null,
    startedAt: match.createdAt,
    completedAt: match.completedAt,
    innings: [line(0, match.teamAId, match.teamBId, 40), line(1, match.teamBId, match.teamAId, 30)],
    partnerships: [],
    updatedAt: match.updatedAt,
  };
}

async function seedHistory(db: SqlDatabase): Promise<SeededMatch[]> {
  await seedLibrary(db, HISTORY_TEAMS);
  await seedBareTournament(db, 'T1', T1_MEMBERS);
  await seedBareTournament(db, 'T2', T2_MEMBERS);
  const built = Array.from({ length: HISTORY_SIZE }, (_, index) => historyMatch(index));
  const order = Array.from({ length: HISTORY_SIZE }, (_, index) => (index * 97) % HISTORY_SIZE);
  await inTx(db, async (repos) => {
    for (const index of order) {
      await repos.matches.insert(built[index].match, []);
    }
    for (const entry of built) {
      if (entry.seeded.projected) {
        await repos.matches.writeProjection(historyProjection(entry.match));
      }
    }
  });
  return built.map((entry) => entry.seeded);
}

function containsCI(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

function matchesSearch(match: SeededMatch, search: string): boolean {
  return [match.title, TEAM_NAME.get(match.teamAId) ?? '', TEAM_NAME.get(match.teamBId) ?? ''].some((text) => containsCI(text, search));
}

const recentFirst = (a: SeededMatch, b: SeededMatch): number => b.updatedAt.localeCompare(a.updatedAt);
const oldestFirst = (a: SeededMatch, b: SeededMatch): number => a.updatedAt.localeCompare(b.updatedAt);

describe(`history list on ${HISTORY_SIZE} matches: search, filter, sort, paging`, () => {
  let db: SqlJsTestDatabase;
  let repos: Repositories;
  let seeded: SeededMatch[];

  beforeAll(async () => {
    const opened = await openTestRepositories();
    db = opened.db;
    repos = opened.repos;
    seeded = await seedHistory(db);
  }, 60000);

  const ids = (items: readonly { readonly id: string }[]): string[] => items.map((item) => item.id);

  it('sort recent / oldest over everything returns every match exactly once in updated order', async () => {
    const recent = await repos.matches.list({ sort: 'recent', limit: 1000 });
    expect(ids(recent)).toEqual(ids([...seeded].sort(recentFirst)));
    const oldest = await repos.matches.list({ sort: 'oldest', limit: 1000 });
    expect(ids(oldest)).toEqual(ids([...seeded].sort(oldestFirst)));
  });

  it('search is case-insensitive over the title and both team names', async () => {
    for (const search of ['lions', 'LIONS', 'LiOnS', 'match 01', 'hawks', 'derby']) {
      const found = await repos.matches.list({ search, sort: 'recent', limit: 1000 });
      expect({ search, ids: ids(found) }).toEqual({ search, ids: ids(seeded.filter((m) => matchesSearch(m, search)).sort(recentFirst)) });
    }
  });

  it('search treats LIKE wildcards literally: "%" and "_" only find titles that contain them', async () => {
    expect(ids(await repos.matches.list({ search: '%', limit: 1000 }))).toEqual(['h-005']);
    expect(ids(await repos.matches.list({ search: '100%', limit: 1000 }))).toEqual(['h-005']);
    expect(ids(await repos.matches.list({ search: '_', limit: 1000 }))).toEqual(['h-006']);
    expect(ids(await repos.matches.list({ search: 'A_B', limit: 1000 }))).toEqual(['h-006']);
  });

  it('search treats quotes and backslashes literally', async () => {
    expect(ids(await repos.matches.list({ search: "o'brien", limit: 1000 }))).toEqual(['h-009']);
    expect(ids(await repos.matches.list({ search: "'", limit: 1000 }))).toEqual(['h-009']);
    expect(ids(await repos.matches.list({ search: '\\', limit: 1000 }))).toEqual(['h-011']);
    expect(ids(await repos.matches.list({ search: 'c:\\cup\\', limit: 1000 }))).toEqual(['h-011']);
    expect(await repos.matches.list({ search: '\\%', limit: 1000 })).toEqual([]);
  });

  it('search is case-insensitive for non-ASCII team names too ("élan" finds "Élan XI")', async () => {
    const expected = ids(seeded.filter((m) => matchesSearch(m, 'élan')).sort(recentFirst));
    expect(expected.length).toBeGreaterThan(20);
    expect(ids(await repos.matches.list({ search: 'Élan', sort: 'recent', limit: 1000 }))).toEqual(expected);
    expect(ids(await repos.matches.list({ search: 'élan', sort: 'recent', limit: 1000 }))).toEqual(expected);
  });

  it('filters by statuses, tournament, standalone-only (null) and team, alone and combined', async () => {
    const check = async (query: Parameters<Repositories['matches']['list']>[0], predicate: (m: SeededMatch) => boolean): Promise<void> => {
      const found = await repos.matches.list({ sort: 'recent', limit: 1000, ...query });
      const expected = ids(seeded.filter(predicate).sort(recentFirst));
      expect(expected.length).toBeGreaterThan(0);
      expect({ query, ids: ids(found) }).toEqual({ query, ids: expected });
    };
    await check({ statuses: ['live', 'paused'] }, (m) => m.status === 'live' || m.status === 'paused');
    await check({ statuses: ['completed'] }, (m) => m.status === 'completed');
    await check({ tournamentId: 'T1' }, (m) => m.tournamentId === 'T1');
    await check({ tournamentId: null }, (m) => m.tournamentId === null);
    await check({ teamId: 'eag' }, (m) => m.teamAId === 'eag' || m.teamBId === 'eag');
    await check(
      { teamId: 'haw', statuses: ['completed', 'abandoned'], tournamentId: 'T2' },
      (m) => (m.teamAId === 'haw' || m.teamBId === 'haw') && (m.status === 'completed' || m.status === 'abandoned') && m.tournamentId === 'T2',
    );
    await check({ search: 'eagles', statuses: ['scheduled', 'postponed'] }, (m) => matchesSearch(m, 'eagles') && (m.status === 'scheduled' || m.status === 'postponed'));
  });

  it('paging with limit/offset partitions the sorted list exactly (no duplicates, no gaps) and an offset past the end is empty', async () => {
    for (const sort of ['recent', 'oldest', 'scheduled'] as const) {
      const all = ids(await repos.matches.list({ sort, limit: 1000 }));
      expect(all).toHaveLength(HISTORY_SIZE);
      const pages: string[] = [];
      for (let offset = 0; offset < HISTORY_SIZE; offset += 17) {
        const page = ids(await repos.matches.list({ sort, limit: 17, offset }));
        expect(page.length).toBe(Math.min(17, HISTORY_SIZE - offset));
        pages.push(...page);
      }
      expect({ sort, pages }).toEqual({ sort, pages: all });
      expect(new Set(pages).size).toBe(HISTORY_SIZE);
      expect(await repos.matches.list({ sort, limit: 17, offset: HISTORY_SIZE + 3 })).toEqual([]);
    }
    const filteredAll = ids(await repos.matches.list({ statuses: ['completed'], sort: 'oldest', limit: 1000 }));
    const filteredPages: string[] = [];
    for (let offset = 0; offset < filteredAll.length; offset += 5) {
      filteredPages.push(...ids(await repos.matches.list({ statuses: ['completed'], sort: 'oldest', limit: 5, offset })));
    }
    expect(filteredPages).toEqual(filteredAll);
  });

  it('sort scheduled orders scheduled dates ascending with the undated matches kept together at one end', async () => {
    const byId = new Map(seeded.map((m) => [m.id, m]));
    const dates = ids(await repos.matches.list({ sort: 'scheduled', limit: 1000 })).map((id) => byId.get(id)?.scheduledDate ?? null);
    const dated = dates.filter((date): date is string => date !== null);
    expect(dated).toEqual([...dated].sort());
    const firstNull = dates.indexOf(null);
    const lastNull = dates.lastIndexOf(null);
    expect(firstNull).toBeGreaterThanOrEqual(0);
    expect(dates.slice(firstNull, lastNull + 1).every((date) => date === null)).toBe(true);
    expect(firstNull === 0 || lastNull === dates.length - 1).toBe(true);
  });

  it('list items carry team refs, tournament name, overs and innings lines straight from the projections', async () => {
    const all = await repos.matches.list({ sort: 'oldest', limit: 1000 });
    for (const item of all) {
      const expected = seeded.find((m) => m.id === item.id);
      expect(expected).toBeDefined();
      if (expected === undefined) {
        continue;
      }
      expect(item.teamA.name).toBe(TEAM_NAME.get(expected.teamAId));
      expect(item.teamB.name).toBe(TEAM_NAME.get(expected.teamBId));
      expect(item.tournamentId).toBe(expected.tournamentId);
      expect(item.tournamentName).toBe(expected.tournamentId === null ? null : `Cup ${expected.tournamentId}`);
      expect(item.status).toBe(expected.status);
      expect(item.oversPerInnings).toBe(3);
      expect(item.innings.map((line) => line.runs)).toEqual(expected.projected ? [40, 30] : []);
    }
    const projected = all.find((item) => seeded.find((m) => m.id === item.id)?.projected === true);
    expect(projected?.innings[1]).toEqual({
      inningsIndex: 1,
      kind: 'regular',
      battingTeamId: projected?.teamB.id,
      runs: 30,
      wickets: 3,
      legalBalls: 18,
      ballsPerOver: 6,
      status: 'complete',
      completionReason: 'overs_complete',
    });
  });

  it('findResumable over the whole history lists exactly the live and paused matches, most recently updated first', async () => {
    const expected = ids(seeded.filter((m) => m.status === 'live' || m.status === 'paused').sort(recentFirst));
    expect(ids(await repos.matches.findResumable())).toEqual(expected);
    expect(ids(await repos.matches.findResumable({ forPrompt: true }))).toEqual(expected);
  });
});

describe('paging stays stable when many matches share the same timestamps', () => {
  it('every match appears exactly once across pages for each sort even when all sort keys tie', async () => {
    const { db, repos } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    const count = 37;
    await inTx(db, async (tx) => {
      for (let index = 0; index < count; index += 1) {
        await tx.matches.insert(
          buildMatch({
            id: `tie-${String((index * 13) % count).padStart(2, '0')}`,
            teamAId: index % 2 === 0 ? 'lio' : 'tig',
            teamBId: index % 2 === 0 ? 'tig' : 'lio',
            scheduledDate: index % 3 === 0 ? null : '2026-07-01',
            createdAt: isoAt(0),
            updatedAt: isoAt(0),
          }),
          [],
        );
      }
    });
    for (const sort of ['recent', 'oldest', 'scheduled'] as const) {
      const all = (await repos.matches.list({ sort, limit: 1000 })).map((item) => item.id);
      const pages: string[] = [];
      for (let offset = 0; offset < count; offset += 4) {
        pages.push(...(await repos.matches.list({ sort, limit: 4, offset })).map((item) => item.id));
      }
      expect({ sort, size: new Set(pages).size, pages }).toEqual({ sort, size: count, pages: all });
    }
  });
});

describe('performance: ball append + projection write (IT-DB-09)', () => {
  const BUDGET_MS = 10;
  const ASSERTED_MS = BUDGET_MS * 3;
  const SAMPLES = 50;

  function median(values: readonly number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  }

  function fiftyOverLog(matchId: string): MatchEvent[] {
    const builder = new EventLogBuilder(matchId, `${matchId}-`);
    for (let innings = 0; innings < 2; innings += 1) {
      const bat = innings === 0 ? L : T;
      const bowl = innings === 0 ? T : L;
      builder.act({ kind: 'innings_started', inningsIndex: innings, battingTeamId: innings === 0 ? 'lio' : 'tig', strikerId: bat(1), nonStrikerId: bat(2), bowlerId: bowl(7) });
      for (let over = 0; over < 50; over += 1) {
        const bowler = bowl(7 + (over % 5));
        if (over > 0) {
          builder.act({ kind: 'bowler_selected', bowlerId: bowler, reason: 'over_start' });
        }
        for (let ballIndex = 0; ballIndex < 6; ballIndex += 1) {
          const onStrike = (over + ballIndex) % 2 === 0;
          builder.act({
            kind: 'delivery',
            call: 'fair',
            runsTo: 'bat',
            strikerId: onStrike ? bat(1) : bat(2),
            nonStrikerId: onStrike ? bat(2) : bat(1),
            bowlerId: bowler,
            runsRun: ballIndex % 3,
            shortRuns: 0,
            boundary: 0,
            wicket: null,
          });
        }
      }
    }
    return builder.events();
  }

  function heavyProjection(matchId: string, seq: number): MatchProjection {
    const base = goldenProjection(goldenFor(matchId), { projectionVersion: 1, teamAId: 'lio', at: isoAt(seq), completed: false });
    const partnerships = Array.from({ length: 20 }, (_, index) => ({
      inningsIndex: index < 10 ? 0 : 1,
      index: index % 10,
      wicketNumber: (index % 10) + 1,
      batterAId: index < 10 ? L(1) : T(1),
      batterBId: index < 10 ? L(2) : T(2),
      runs: 20 + index,
      balls: 15,
      batterARuns: 10,
      batterABalls: 7,
      batterBRuns: 9 + index,
      batterBBalls: 8,
      extras: 1,
      endedBy: index % 10 === 9 ? null : ('wicket' as const),
    }));
    return {
      ...base,
      innings: base.innings.map((line, index) => (index === 1 ? { ...line, runs: seq % 400, legalBalls: Math.min(300, seq % 300), maxBalls: 300 } : { ...line, maxBalls: 300, legalBalls: 300 })),
      partnerships,
    };
  }

  it(`on a ~700-event log among 200 other matches the median stays under ${ASSERTED_MS} ms (budget ${BUDGET_MS} ms)`, async () => {
    const { db } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    const log = fiftyOverLog('long');
    expect(log.length).toBeGreaterThanOrEqual(690);
    await inTx(db, async (repos) => {
      for (let index = 0; index < 200; index += 1) {
        await repos.matches.insert(
          buildMatch({ id: `bg-${index}`, teamAId: 'lio', teamBId: 'tig', status: index % 3 === 0 ? 'live' : 'scheduled', updatedAt: isoAt(index) }),
          [],
        );
      }
      await repos.matches.insert(buildMatch({ id: 'long', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
      await repos.events.append(log);
      await repos.matches.writeProjection(heavyProjection('long', log.length));
    });
    const durations: number[] = [];
    for (let sample = 0; sample < SAMPLES + 5; sample += 1) {
      const started = performance.now();
      await inTx(db, async (repos) => {
        const lastSeq = await repos.events.lastSeq('long');
        const onStrike = lastSeq % 2 === 0;
        await repos.events.append([
          {
            kind: 'delivery',
            call: 'fair',
            runsTo: 'bat',
            strikerId: onStrike ? T(3) : T(4),
            nonStrikerId: onStrike ? T(4) : T(3),
            bowlerId: L(9),
            runsRun: 1,
            shortRuns: 0,
            boundary: 0,
            wicket: null,
            id: `long-extra-${lastSeq + 1}`,
            matchId: 'long',
            seq: lastSeq + 1,
            actionId: `long-extra-a-${lastSeq + 1}`,
            recordedAt: isoAt(lastSeq + 1),
          },
        ]);
        await repos.matches.writeProjection(heavyProjection('long', lastSeq + 1));
        await repos.matches.setResumeDismissed('long', null);
      });
      if (sample >= 5) {
        durations.push(performance.now() - started);
      }
    }
    const measured = median(durations);
    console.log(
      `IT-DB-09 (adversarial) append + projection on a ${log.length}-event log with 200 other matches: median ${measured.toFixed(2)} ms, max ${Math.max(...durations).toFixed(2)} ms (budget ${BUDGET_MS} ms, asserted ${ASSERTED_MS} ms)`,
    );
    expect(measured).toBeLessThan(ASSERTED_MS);
    expect(await createRepositories(db).events.lastSeq('long')).toBe(log.length + SAMPLES + 5);
    expect(await countRows(db, 'partnerships', 'match_id = ?', ['long'])).toBe(20);
  }, 60000);

  it('undo of the last ball (guarded truncateFrom + projection write) on a ~700-event log stays far inside NFR-P-06', async () => {
    const UNDO_BUDGET_MS = 150;
    const UNDO_ASSERTED_MS = UNDO_BUDGET_MS * 3;
    const { db } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    const log = fiftyOverLog('undo');
    await inTx(db, async (repos) => {
      await repos.matches.insert(buildMatch({ id: 'undo', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
      await repos.events.append(log);
      await repos.matches.writeProjection(heavyProjection('undo', log.length));
    });
    const durations: number[] = [];
    for (let sample = 0; sample < 30; sample += 1) {
      const seq = log.length + 1;
      await inTx(db, async (repos) =>
        repos.events.append([
          {
            kind: 'delivery',
            call: 'fair',
            runsTo: 'bat',
            strikerId: T(3),
            nonStrikerId: T(4),
            bowlerId: L(9),
            runsRun: 2,
            shortRuns: 0,
            boundary: 0,
            wicket: null,
            id: `undo-extra-${sample}`,
            matchId: 'undo',
            seq,
            actionId: `undo-extra-a-${sample}`,
            recordedAt: isoAt(seq),
          },
        ]),
      );
      const started = performance.now();
      let deleted = 0;
      await inTx(db, async (repos) => {
        deleted = await repos.events.truncateFrom('undo', seq, seq);
        await repos.matches.writeProjection(heavyProjection('undo', log.length));
      });
      durations.push(performance.now() - started);
      expect(deleted).toBe(1);
    }
    const measured = median(durations);
    console.log(
      `NFR-P-06 (DB part) undo of one ball on a ${log.length}-event log: median ${measured.toFixed(2)} ms, max ${Math.max(...durations).toFixed(2)} ms (budget ${UNDO_BUDGET_MS} ms for the whole undo, asserted ${UNDO_ASSERTED_MS} ms)`,
    );
    expect(measured).toBeLessThan(UNDO_ASSERTED_MS);
    expect(await createRepositories(db).events.listByMatch('undo')).toEqual(log);
  }, 60000);
});

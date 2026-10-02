/** @jest-environment node */
import { currentInnings, SCORING_PROJECTION_VERSION, scoreRuns, selectBowler, wicket, wide, type HistoryEditOp, type ScoringIntent } from '@/domain/scoring';
import { BASE_MATCH_RULES, rulesForOvers } from '@/domain/scoring';
import { planInningsBalls } from '@/domain/scoring/testing';
import type { SqlDatabase } from '@/db';
import { createFaultInjectingDatabase, createSqlJsDatabase, sqliteError, type FaultInjectingDatabase, type SqlJsTestDatabase } from '@/db/testing';
import type {
  DeliveryPayload,
  Fixture,
  MatchEvent,
  MatchEventInput,
  PendingActionType,
  PlayerId,
  StandingRow,
  Stage,
  TournamentEvaluation,
  TournamentSnapshot,
} from '@/domain/types';
import {
  useAppStore,
  useBackupStore,
  useHomeStore,
  useLiveMatchStore,
  useMatchSetupStore,
  useTeamLibraryStore,
  useTournamentListStore,
  useTournamentStore,
  useTournamentWizardStore,
} from '@/stores';
import { clearAppServices, setAppServices } from '@/stores/services';
import { resetStores } from '@/stores/__tests__/support/harness';
import type { AppServices } from '../contracts';
import { createTestApp, fixedClock, sequentialIds, type TestApp, type TestClock } from '../testing';
import { expectFailure, expectOk } from './support/app';
import { createLeague, type League, type LeagueTeam } from './support/league';
import { live, playBalls, playLine, score, scoreAll, startInnings } from './support/scoring';
import type { Side } from './support/sides';
import { standaloneWorld } from './support/standalone';
import { fixtureBetween, squadsFor } from './support/tournament';

jest.setTimeout(300000);

interface World {
  readonly db: SqlJsTestDatabase;
  readonly app: TestApp;
}

interface Line {
  readonly runs: number;
  readonly wickets: number;
  readonly balls: number;
}

type Ball = number | 'W';

let appCounter = 0;

function appOn(db: SqlDatabase, clock: TestClock = fixedClock('2026-06-01T10:00:00.000Z'), base?: TestApp): TestApp {
  appCounter += 1;
  return createTestApp(db, {
    newId: sequentialIds(`a${appCounter}`),
    clock,
    ...(base === undefined ? {} : { fileSystem: base.deps.fileSystem }),
  });
}

async function world(): Promise<World> {
  const db = await createSqlJsDatabase();
  const app = appOn(db, fixedClock());
  expectOk(await app.bootstrap());
  return { db, app };
}

function warmRestart(previous: World): World {
  return { db: previous.db, app: appOn(previous.db, previous.app.deps.clock, previous.app) };
}

async function coldRestart(previous: World): Promise<World> {
  const db = await createSqlJsDatabase({ data: await previous.db.exportAsync() });
  return { db, app: appOn(db, previous.app.deps.clock, previous.app) };
}

function install(app: AppServices): void {
  resetStores();
  clearAppServices();
  setAppServices(app);
}

const liveStore = () => useLiveMatchStore.getState();
const tournamentStore = () => useTournamentStore.getState();
const homeStore = () => useHomeStore.getState();
const appStore = () => useAppStore.getState();
const backupStore = () => useBackupStore.getState();
const setupStore = () => useMatchSetupStore.getState();
const wizardStore = () => useTournamentWizardStore.getState();
const teamStore = () => useTeamLibraryStore.getState();
const listStore = () => useTournamentListStore.getState();

async function digest(db: SqlDatabase, skip: readonly string[] = []): Promise<string> {
  const tables = await db.getAllAsync<{ readonly name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const parts: string[] = [];
  for (const { name } of tables) {
    if (skip.includes(name)) {
      continue;
    }
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM "${name}"`);
    parts.push(`${name}=${rows.map((row) => JSON.stringify(row)).sort().join('|')}`);
  }
  return parts.join('\n');
}

async function count(db: SqlDatabase, table: string, where = '1', params: readonly (string | number)[] = []): Promise<number> {
  const row = await db.getFirstAsync<{ readonly n: number }>(`SELECT count(*) AS n FROM ${table} WHERE ${where}`, [...params]);
  return row?.n ?? 0;
}

async function eventually(check: () => boolean): Promise<boolean> {
  for (let attempt = 0; attempt < 200 && !check(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return check();
}

function payloadOf(event: MatchEvent & DeliveryPayload): DeliveryPayload {
  const { id: _id, matchId: _matchId, seq: _seq, actionId: _actionId, recordedAt: _recordedAt, ...payload } = event;
  return payload;
}

function deliveries(events: readonly MatchEvent[]): readonly (MatchEvent & DeliveryPayload)[] {
  return events.filter((event): event is MatchEvent & DeliveryPayload => event.kind === 'delivery');
}

function rowFor(evaluation: TournamentEvaluation, teamId: string): StandingRow {
  const found = evaluation.stages.flatMap((stage) => stage.tables).flatMap((table) => table.rows).find((row) => row.teamId === teamId);
  if (found === undefined) {
    throw new Error(`no standings row for ${teamId}`);
  }
  return found;
}

async function revisionOf(db: SqlDatabase, tournamentId: string): Promise<number> {
  return (await db.getFirstAsync<{ readonly revision: number }>('SELECT revision FROM tournaments WHERE id = ?', [tournamentId]))?.revision ?? -1;
}

interface StartedFixture {
  readonly fixture: Fixture;
  readonly matchId: string;
  readonly batting: Side;
  readonly fielding: Side;
}

async function startLeagueMatch(app: AppServices, league: League, batting: LeagueTeam, fielding: LeagueTeam, opening = true): Promise<StartedFixture> {
  const fixture = await league.fixture(batting, fielding);
  const [sideA, sideB] = league.sidesOf(fixture);
  const bat = league.sides[batting];
  const field = league.sides[fielding];
  const events: MatchEventInput[] = opening
    ? [{ kind: 'innings_started', inningsIndex: 0, battingTeamId: bat.team.id, strikerId: bat.p(1), nonStrikerId: bat.p(2), bowlerId: field.p(6) }]
    : [];
  const match = expectOk(
    await app.tournaments.startFixtureMatch(fixture.id, { squads: squadsFor(sideA, sideB), toss: { winnerTeamId: bat.team.id, decision: 'bat' } }, events),
  );
  return { fixture, matchId: match.id, batting: bat, fielding: field };
}

async function playToConfirm(app: AppServices, matchId: string, first: Line, second: Line): Promise<void> {
  await playLine(app, matchId, first);
  await startInnings(app, matchId);
  await playLine(app, matchId, second);
  expect((await live(app, matchId)).state.pendingAction?.type).toBe('confirm_result');
}

const FLIP_FIRST: readonly Ball[] = [4, 4, 2, 2, 0, 0, 4, 4, 0, 0, 0, 0];
const FLIP_SECOND: readonly Ball[] = [4, 4, 2, 2, 0, 0, 2, 2, 2, 0, 0, 0];

interface Flippable {
  readonly started: StartedFixture;
  readonly ops: readonly HistoryEditOp[];
}

async function flippableResult(app: AppServices, league: League): Promise<Flippable> {
  const started = await startLeagueMatch(app, league, 'Lions', 'Tigers');
  await playBalls(app, started.matchId, FLIP_FIRST);
  await startInnings(app, started.matchId);
  await playBalls(app, started.matchId, FLIP_SECOND);
  await score(app, started.matchId, { type: 'end_match', outcome: { type: 'natural' } });
  const loaded = await live(app, started.matchId);
  const last = deliveries(loaded.events)[deliveries(loaded.events).length - 1];
  const four: DeliveryPayload = { ...payloadOf(last), runsRun: 0, shortRuns: 0, boundary: 4, wicket: null, call: 'fair', runsTo: 'bat' };
  return { started, ops: [{ op: 'replace', seq: last.seq, with: [four] }] };
}

async function mustDispatch(intent: ScoringIntent): Promise<void> {
  const ok = await liveStore().dispatch(intent);
  if (!ok) {
    throw new Error(`dispatch ${JSON.stringify(intent)} failed: ${liveStore().error?.code} ${liveStore().error?.message}`);
  }
}

async function playInningsThroughStore(balls: readonly Ball[]): Promise<void> {
  const queue = [...balls];
  for (let guard = 0; guard < 200; guard += 1) {
    const state = liveStore().live?.state;
    const pending = state?.pendingAction;
    if (pending?.type === 'select_next_batter') {
      await mustDispatch({ type: 'batter_in', playerId: pending.candidates[0], position: pending.position });
      continue;
    }
    if (pending?.type === 'select_next_bowler' && state !== undefined) {
      const innings = currentInnings(state);
      const overs = (playerId: PlayerId) => innings?.bowling.find((row) => row.playerId === playerId)?.oversUsed ?? 0;
      await mustDispatch(selectBowler([...pending.eligible].sort((a, b) => overs(a) - overs(b))[0]));
      continue;
    }
    const next = queue.shift();
    if (next === undefined) {
      return;
    }
    await mustDispatch(next === 'W' ? wicket({ dismissal: 'bowled' }) : scoreRuns(next));
  }
  throw new Error('innings did not finish');
}

describe('atomicity: a failure at any statement leaves the database and the store untouched (§23, §89, FR-07)', () => {
  it('confirming a tournament result through useLiveMatchStore fails cleanly at every statement and Try Again records it exactly once', async () => {
    const base = await world();
    const league = await createLeague(base.app);
    const started = await startLeagueMatch(base.app, league, 'Lions', 'Tigers');
    await playToConfirm(base.app, started.matchId, { runs: 20, wickets: 2, balls: 12 }, { runs: 15, wickets: 3, balls: 12 });
    const image = await base.db.exportAsync();
    const problems: string[] = [];
    let failurePoints = 0;
    for (let k = 1; k < 500; k += 1) {
      const db = await createFaultInjectingDatabase({ data: image, captureDurableImages: false });
      const app = appOn(db);
      install(app);
      expect(await liveStore().open(started.matchId)).toBe(true);
      const beforeDb = await digest(db);
      const beforeLive = liveStore().live;
      db.clearLog();
      db.failOn({ sql: /[\s\S]*/, occurrence: k, error: sqliteError('SQLITE_IOERR') });
      const ok = await liveStore().dispatch({ type: 'end_match', outcome: { type: 'natural' } });
      const injected = db.statementLog.find((entry) => entry.outcome === 'injected');
      db.clearFaults();
      if (injected === undefined) {
        expect(ok).toBe(true);
        break;
      }
      failurePoints += 1;
      const where = `k=${k} ${injected.sql.slice(0, 40)}`;
      if (ok) {
        problems.push(`${where}: dispatch resolved true`);
      }
      if (liveStore().error?.code !== 'STORAGE') {
        problems.push(`${where}: error ${liveStore().error?.code ?? 'none'}`);
      }
      if (liveStore().status !== 'ready') {
        problems.push(`${where}: status ${liveStore().status}`);
      }
      if (JSON.stringify(liveStore().live) !== JSON.stringify(beforeLive)) {
        problems.push(`${where}: live state changed`);
      }
      if ((await digest(db)) !== beforeDb) {
        problems.push(`${where}: database changed`);
      }
      const retried = await liveStore().dispatch({ type: 'end_match', outcome: { type: 'natural' } });
      const ended = await count(db, 'match_events', "match_id = ? AND kind = 'match_ended'", [started.matchId]);
      const audited = await count(db, 'audit_events', "action = 'result_recorded' AND match_id = ?", [started.matchId]);
      const fixture = await db.getFirstAsync<{ readonly status: string }>('SELECT status FROM fixtures WHERE id = ?', [started.fixture.id]);
      if (!retried || ended !== 1 || audited !== 1 || fixture?.status !== 'completed' || liveStore().live?.match.status !== 'completed') {
        problems.push(`${where}: retry ok=${String(retried)} ended=${ended} audited=${audited} fixture=${fixture?.status ?? '-'}`);
      }
    }
    expect(failurePoints).toBeGreaterThan(30);
    expect(problems).toEqual([]);
  });

  it('applying a previewed correction of a completed tournament match fails cleanly at every statement and the kept preview still applies afterwards', async () => {
    const base = await world();
    const league = await createLeague(base.app);
    const flip = await flippableResult(base.app, league);
    const image = await base.db.exportAsync();
    const problems: string[] = [];
    let failurePoints = 0;
    for (let k = 1; k < 500; k += 1) {
      const db = await createFaultInjectingDatabase({ data: image, captureDurableImages: false });
      const app = appOn(db);
      install(app);
      expect(await liveStore().open(flip.started.matchId)).toBe(true);
      const preview = await liveStore().previewHistoryEdit(flip.ops);
      if (preview === null) {
        throw new Error(`preview failed: ${liveStore().error?.message}`);
      }
      const beforeDb = await digest(db);
      const beforeLive = liveStore().live;
      db.clearLog();
      db.failOn({ sql: /[\s\S]*/, occurrence: k, error: sqliteError('SQLITE_FULL') });
      const ok = await liveStore().applyHistoryEdit(flip.ops, 'Scorer pressed 0 instead of 4', preview);
      const injected = db.statementLog.find((entry) => entry.outcome === 'injected');
      db.clearFaults();
      if (injected === undefined) {
        expect(ok).toBe(true);
        break;
      }
      failurePoints += 1;
      const where = `k=${k} ${injected.sql.slice(0, 40)}`;
      if (ok || liveStore().error?.code !== 'STORAGE') {
        problems.push(`${where}: ok=${String(ok)} error=${liveStore().error?.code ?? 'none'}`);
      }
      if (JSON.stringify(liveStore().live) !== JSON.stringify(beforeLive)) {
        problems.push(`${where}: live state changed`);
      }
      if ((await digest(db)) !== beforeDb) {
        problems.push(`${where}: database changed`);
      }
      const retried = await liveStore().applyHistoryEdit(flip.ops, 'Scorer pressed 0 instead of 4', preview);
      const corrected = await count(db, 'audit_events', "action = 'result_corrected' AND match_id = ?", [flip.started.matchId]);
      const winner = liveStore().live?.state.result;
      if (!retried || corrected !== 1 || winner?.type !== 'win' || winner.winnerTeamId !== league.sides.Tigers.team.id) {
        problems.push(`${where}: retry ok=${String(retried)} audits=${corrected}`);
      }
    }
    expect(failurePoints).toBeGreaterThan(30);
    expect(problems).toEqual([]);
  });

  it('undoing a wicket group fails cleanly at every statement, keeping the redo stack, and Try Again undoes both events together', async () => {
    const base = await world();
    const sw = await standaloneWorld(base.app);
    const created = await sw.start(base.app);
    await scoreAll(base.app, created.match.id, [scoreRuns(1), wicket({ dismissal: 'bowled', nextBatterId: sw.lions.p(3) })]);
    const image = await base.db.exportAsync();
    const problems: string[] = [];
    let failurePoints = 0;
    for (let k = 1; k < 200; k += 1) {
      const db = await createFaultInjectingDatabase({ data: image, captureDurableImages: false });
      install(appOn(db));
      expect(await liveStore().open(created.match.id)).toBe(true);
      const beforeDb = await digest(db);
      const beforeLive = liveStore().live;
      db.clearLog();
      db.failOn({ sql: /[\s\S]*/, occurrence: k, error: sqliteError('SQLITE_IOERR') });
      const ok = await liveStore().undo();
      const injected = db.statementLog.find((entry) => entry.outcome === 'injected');
      db.clearFaults();
      if (injected === undefined) {
        expect(ok).toBe(true);
        break;
      }
      failurePoints += 1;
      const where = `k=${k} ${injected.sql.slice(0, 40)}`;
      if (ok || liveStore().error?.code !== 'STORAGE' || liveStore().redoStack.length !== 0) {
        problems.push(`${where}: ok=${String(ok)} error=${liveStore().error?.code ?? 'none'} redo=${liveStore().redoStack.length}`);
      }
      if (JSON.stringify(liveStore().live) !== JSON.stringify(beforeLive) || (await digest(db)) !== beforeDb) {
        problems.push(`${where}: state or database changed`);
      }
      const retried = await liveStore().undo();
      const group = liveStore().redoStack[0];
      if (!retried || group?.length !== 2 || liveStore().live?.state.lastSeq !== 2) {
        problems.push(`${where}: retry ok=${String(retried)} group=${group?.length ?? 0}`);
      }
    }
    expect(failurePoints).toBeGreaterThan(5);
    expect(problems).toEqual([]);
  });

  it('FR-07d a busy database at BEGIN is reported as STORAGE without hanging and the next ball records normally', async () => {
    const db = await createFaultInjectingDatabase();
    const app = appOn(db, fixedClock());
    expectOk(await app.bootstrap());
    const sw = await standaloneWorld(app);
    const created = await sw.start(app);
    install(app);
    expect(await liveStore().open(created.match.id)).toBe(true);
    db.failOn({ sql: /^\s*BEGIN/, error: sqliteError('SQLITE_BUSY') });
    const startedAt = Date.now();
    expect(await liveStore().dispatch(scoreRuns(1))).toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(2000);
    expect(liveStore().error?.code).toBe('STORAGE');
    expect(liveStore().error?.message).not.toMatch(/SQLITE|BUSY|undefined/);
    expect(await liveStore().dispatch(scoreRuns(1))).toBe(true);
    expect(liveStore().live?.state.lastSeq).toBe(2);
  });
});

describe('process death mid-use-case: the last durable image never holds half a change (§89, FR-01, FR-06g, FR-15)', () => {
  async function crashSweep(
    image: Uint8Array,
    act: (app: TestApp) => Promise<unknown>,
    sample: (total: number) => readonly number[] = (total) => Array.from({ length: total }, (_, index) => index + 1),
    prepare?: (app: TestApp) => void,
  ): Promise<{ readonly crashes: number; readonly problems: readonly string[]; readonly afterImages: readonly Uint8Array[] }> {
    const reference = await createSqlJsDatabase({ data: image });
    const before = await digest(reference);
    const clean = await createFaultInjectingDatabase({ data: image });
    const cleanApp = appOn(clean);
    prepare?.(cleanApp);
    clean.clearLog();
    await act(cleanApp);
    const total = clean.statementLog.length;
    const after = await digest(clean);
    const problems: string[] = [];
    const afterImages: Uint8Array[] = [];
    let crashes = 0;
    for (const k of sample(total)) {
      const db: FaultInjectingDatabase = await createFaultInjectingDatabase({ data: image });
      const app = appOn(db);
      prepare?.(app);
      db.crashAt({ sql: /[\s\S]*/, occurrence: k });
      await act(app).catch(() => undefined);
      if (!db.crashed) {
        problems.push(`k=${k}: no crash`);
        continue;
      }
      crashes += 1;
      const reopened = await createSqlJsDatabase({ data: db.lastDurableImage() });
      const state = await digest(reopened);
      if (state !== before && state !== after) {
        const sql = db.statementLog.find((entry) => entry.outcome === 'crashed')?.sql.slice(0, 50) ?? '?';
        problems.push(`k=${k} at ${sql}: partial state is durable`);
      }
      if (state === before) {
        afterImages.push(db.lastDurableImage());
      }
    }
    return { crashes, problems, afterImages };
  }

  it('FR-15 a tournament delete interrupted at any statement deletes nothing', async () => {
    const base = await world();
    const league = await createLeague(base.app);
    const played = await startLeagueMatch(base.app, league, 'Lions', 'Tigers');
    await playToConfirm(base.app, played.matchId, { runs: 18, wickets: 1, balls: 12 }, { runs: 12, wickets: 2, balls: 12 });
    await score(base.app, played.matchId, { type: 'end_match', outcome: { type: 'natural' } });
    const livePlay = await startLeagueMatch(base.app, league, 'Eagles', 'Hawks');
    await playBalls(base.app, livePlay.matchId, [1, 2, 'W']);
    const sw = await standaloneWorld(base.app);
    const standalone = await sw.start(base.app);
    const footprint = expectOk(await base.app.tournaments.previewDelete(league.tournamentId));
    const image = await base.db.exportAsync();
    const sweep = await crashSweep(image, (app) => app.tournaments.delete(league.tournamentId, { typedName: 'Spring League', deleteCompletedMatches: true }));
    expect(sweep.crashes).toBeGreaterThan(10);
    expect(sweep.problems).toEqual([]);
    const survivor = await createSqlJsDatabase({ data: sweep.afterImages[sweep.afterImages.length - 1] });
    const reopened = appOn(survivor);
    expectOk(await reopened.bootstrap());
    expect(expectOk(await reopened.tournaments.previewDelete(league.tournamentId))).toEqual(footprint);
    expectOk(await reopened.tournaments.delete(league.tournamentId, { typedName: 'Spring League', deleteCompletedMatches: true }));
    expect(await count(survivor, 'tournaments')).toBe(0);
    expect(await count(survivor, 'matches', 'tournament_id IS NOT NULL')).toBe(0);
    expect(await count(survivor, 'matches', 'id = ?', [standalone.match.id])).toBe(1);
    expect(await count(survivor, 'teams')).toBe(6);
  });

  it('FR-01f/FR-09g a withdrawal that creates walkover matches is all or nothing at every statement', async () => {
    const base = await world();
    const league = await createLeague(base.app);
    const played = await startLeagueMatch(base.app, league, 'Lions', 'Hawks');
    await playToConfirm(base.app, played.matchId, { runs: 18, wickets: 1, balls: 12 }, { runs: 12, wickets: 2, balls: 12 });
    await score(base.app, played.matchId, { type: 'end_match', outcome: { type: 'natural' } });
    const image = await base.db.exportAsync();
    const change = { kind: 'team_withdraw' as const, teamId: league.sides.Hawks.team.id, remainingFixtures: 'walkover' as const, expungeResults: false };
    const sweep = await crashSweep(
      image,
      async (app) => {
        const preview = await app.tournaments.previewChange(league.tournamentId, change);
        if (!preview.ok) {
          return preview;
        }
        return app.tournaments.applyChange(league.tournamentId, change, 'Hawks left the league', preview.value);
      },
      (total) => Array.from({ length: total }, (_, index) => index + 1).filter((k) => k <= 10 || k > total - 10 || k % 3 === 0),
    );
    expect(sweep.crashes).toBeGreaterThan(30);
    expect(sweep.problems).toEqual([]);
  });

  it('FR-01e a history edit interrupted at any statement keeps the old log and writes no audit row', async () => {
    const base = await world();
    const league = await createLeague(base.app);
    const flip = await flippableResult(base.app, league);
    const fingerprintBefore = expectOk(await base.app.matches.previewHistoryEdit(flip.started.matchId, flip.ops)).baseFingerprint;
    const image = await base.db.exportAsync();
    const sweep = await crashSweep(image, async (app) => {
      const preview = await app.matches.previewHistoryEdit(flip.started.matchId, flip.ops);
      if (!preview.ok) {
        return preview;
      }
      return app.matches.applyHistoryEdit(flip.started.matchId, flip.ops, 'Six missed', preview.value.baseFingerprint);
    });
    expect(sweep.crashes).toBeGreaterThan(30);
    expect(sweep.problems).toEqual([]);
    const survivor = await createSqlJsDatabase({ data: sweep.afterImages[Math.floor(sweep.afterImages.length / 2)] });
    const reopened = appOn(survivor);
    expect(expectOk(await reopened.matches.previewHistoryEdit(flip.started.matchId, flip.ops)).baseFingerprint).toBe(fingerprintBefore);
    expect(await count(survivor, 'audit_events', "action IN ('result_corrected', 'match_history_edited')")).toBe(0);
  });

  it('FR-06g an import_as_copy interrupted anywhere imports nothing and can be re-run without "previously imported"', async () => {
    const base = await world();
    const league = await createLeague(base.app);
    const played = await startLeagueMatch(base.app, league, 'Lions', 'Tigers');
    await playToConfirm(base.app, played.matchId, { runs: 18, wickets: 1, balls: 12 }, { runs: 12, wickets: 2, balls: 12 });
    await score(base.app, played.matchId, { type: 'end_match', outcome: { type: 'natural' } });
    const exported = expectOk(await base.app.backup.exportBackup({ kind: 'full' }));
    const text = base.app.deps.fileSystem.files.get(exported.fileUri) ?? '';
    const uri = 'file:///picked/again.json';
    const image = await base.db.exportAsync();
    const sweep = await crashSweep(
      image,
      async (app) => {
        const preview = await app.backup.previewImport(uri);
        if (!preview.ok) {
          return preview;
        }
        return app.backup.applyImport(uri, 'import_as_copy');
      },
      (total) => [...new Set([1, 2, 3, ...Array.from({ length: 24 }, (_, index) => Math.max(1, Math.floor(((index + 1) * total) / 25))), total - 2, total - 1, total])],
      (app) => app.deps.fileSystem.put(uri, text),
    );
    expect(sweep.crashes).toBeGreaterThan(20);
    expect(sweep.problems).toEqual([]);
    const survivor = await createSqlJsDatabase({ data: sweep.afterImages[sweep.afterImages.length - 2] });
    expect(await count(survivor, 'audit_events', "action = 'backup_imported'")).toBe(0);
    const reopened = appOn(survivor);
    expectOk(await reopened.bootstrap());
    reopened.deps.fileSystem.put(uri, text);
    const preview = expectOk(await reopened.backup.previewImport(uri));
    expect(preview.previouslyImportedAt).toBeNull();
    const report = expectOk(await reopened.backup.applyImport(uri, 'import_as_copy'));
    expect(report.rebuiltMatches).toBe(1);
    expect(await count(survivor, 'tournaments')).toBe(2);
  });

  it('FR-05f a bootstrap that dies while rebuilding stale projections finishes the job on the next start', async () => {
    const base = await world();
    const sw = await standaloneWorld(base.app);
    const first = (await sw.start(base.app)).match.id;
    await scoreAll(base.app, first, [scoreRuns(1), scoreRuns(4)]);
    const second = (await sw.start(base.app, { title: 'Second' })).match.id;
    await scoreAll(base.app, second, [scoreRuns(2)]);
    await base.db.runAsync('UPDATE matches SET projection_version = 0');
    await base.db.runAsync('UPDATE innings SET runs = 99');
    const db = await createFaultInjectingDatabase({ data: await base.db.exportAsync() });
    const dying = appOn(db);
    db.crashAt({ sql: /^\s*UPDATE matches SET status/, occurrence: 2 });
    await dying.bootstrap();
    expect(db.crashed).toBe(true);
    const survivor = await createSqlJsDatabase({ data: db.lastDurableImage() });
    expect(await count(survivor, 'matches', 'projection_version = ?', [SCORING_PROJECTION_VERSION])).toBe(1);
    const reopened = appOn(survivor);
    const report = expectOk(await reopened.bootstrap());
    expect(report.projectionsRebuilt).toBe(1);
    expect(await count(survivor, 'matches', 'projection_version = ?', [SCORING_PROJECTION_VERSION])).toBe(2);
    expect((await survivor.getAllAsync<{ readonly runs: number }>('SELECT runs FROM innings ORDER BY runs')).map((row) => row.runs)).toEqual([2, 5]);
    expect(report.resumable.map((item) => item.id).sort()).toEqual([first, second].sort());
  });

  it('FR-01c a crash right after the commit keeps the ball and the prompt shows the new score', async () => {
    const db = await createFaultInjectingDatabase();
    const app = appOn(db, fixedClock());
    expectOk(await app.bootstrap());
    const sw = await standaloneWorld(app);
    const created = await sw.start(app);
    await score(app, created.match.id, scoreRuns(1));
    await score(app, created.match.id, scoreRuns(4));
    db.crashAt({ sql: /[\s\S]*/ });
    expect((await app.matches.load(created.match.id)).ok).toBe(false);
    const survivor = await createSqlJsDatabase({ data: db.lastDurableImage() });
    const reopened = appOn(survivor);
    const report = expectOk(await reopened.bootstrap());
    const prompt = report.resumable.find((item) => item.id === created.match.id);
    expect(prompt?.innings.map((line) => [line.runs, line.wickets, line.legalBalls])).toEqual([[5, 0, 2]]);
    expect(expectOk(await reopened.matches.load(created.match.id)).state.lastSeq).toBe(3);
  });
});

describe('restart: a brand-new services instance on the same database resumes exactly (§23, §91, FR-03, FR-13)', () => {
  type Prepare = (app: AppServices, matchId: string, lions: Side, tigers: Side) => Promise<void>;
  const cases: readonly (readonly [string, Prepare, PendingActionType | null])[] = [
    ['mid-over', async (app, id) => void (await scoreAll(app, id, [scoreRuns(1), scoreRuns(4), wide()])), null],
    ['end of an over', async (app, id) => void (await scoreAll(app, id, [1, 1, 1, 1, 1, 1].map((runs) => scoreRuns(runs)))), 'select_next_bowler'],
    ['after a wicket', async (app, id) => void (await scoreAll(app, id, [scoreRuns(1), wicket({ dismissal: 'bowled' })])), 'select_next_batter'],
    ['during a rain break', async (app, id) => void (await scoreAll(app, id, [scoreRuns(2), { type: 'suspend_play', reason: 'rain' }])), 'resume_play'],
    ['at the innings break', async (app, id) => void (await scoreAll(app, id, [scoreRuns(4), { type: 'end_innings', reason: 'declared' }])), 'start_next_innings'],
    [
      'with the result reached but not confirmed',
      async (app, id) => {
        await scoreAll(app, id, [scoreRuns(1), { type: 'end_innings', reason: 'declared' }]);
        await startInnings(app, id);
        await score(app, id, scoreRuns(2));
      },
      'confirm_result',
    ],
  ];

  it.each(cases)('%s: score, strike, bowler and pending action are identical and the prompt lists it', async (_label, prepare, expected) => {
    const first = await world();
    const sw = await standaloneWorld(first.app);
    const id = (await sw.start(first.app)).match.id;
    await prepare(first.app, id, sw.lions, sw.tigers);
    const before = await live(first.app, id);
    expect(before.state.pendingAction?.type ?? null).toBe(expected);
    const second = warmRestart(first);
    install(second.app);
    expect(await appStore().bootstrap()).toBe(true);
    const prompt = appStore().report?.resumable.find((item) => item.id === id);
    expect(prompt?.innings.map((line) => [line.runs, line.wickets, line.legalBalls])).toEqual(before.state.innings.map((innings) => [innings.runs, innings.wickets, innings.legalBalls]));
    expect(await liveStore().open(id)).toBe(true);
    const resumed = liveStore().live;
    const innings = resumed === null ? null : currentInnings(resumed.state);
    const original = currentInnings(before.state);
    expect([innings?.runs, innings?.wickets, innings?.strikerId, innings?.nonStrikerId, innings?.bowlerId]).toEqual([
      original?.runs,
      original?.wickets,
      original?.strikerId,
      original?.nonStrikerId,
      original?.bowlerId,
    ]);
    expect(resumed?.state.pendingAction).toEqual(before.state.pendingAction);
    expect(resumed?.state).toEqual(before.state);
    expect(resumed?.events).toEqual(before.events);
    expect(liveStore().redoStack).toEqual([]);
  });

  it('a cold restart forgets the redo stack (redo resolves false without an error) and the next tap takes the next seq', async () => {
    const first = await world();
    const sw = await standaloneWorld(first.app);
    const id = (await sw.start(first.app)).match.id;
    install(first.app);
    expect(await liveStore().open(id)).toBe(true);
    await mustDispatch(scoreRuns(1));
    await mustDispatch(scoreRuns(4));
    expect(await liveStore().undo()).toBe(true);
    expect(liveStore().redoStack).toHaveLength(1);
    const state = liveStore().live?.state;
    const second = await coldRestart(first);
    install(second.app);
    expect(await appStore().bootstrap()).toBe(true);
    expect(await liveStore().open(id)).toBe(true);
    expect(liveStore().live?.state).toEqual(state);
    expect(liveStore().redoStack).toEqual([]);
    expect(await liveStore().redo()).toBe(false);
    expect(liveStore().error).toBeNull();
    await mustDispatch(scoreRuns(2));
    expect(liveStore().live?.state.lastSeq).toBe(3);
    expect(liveStore().live?.state.innings[0].runs).toBe(3);
  });
});

describe('double taps are serialised (§9, FR-11)', () => {
  it('six taps fired at once record six consecutive seqs with no CONFLICT and no duplicate', async () => {
    const w = await world();
    const sw = await standaloneWorld(w.app);
    const id = (await sw.start(w.app)).match.id;
    install(w.app);
    expect(await liveStore().open(id)).toBe(true);
    const results = await Promise.all([1, 2, 0, 4, 6, 1].map((runs) => liveStore().dispatch(scoreRuns(runs))));
    expect(results).toEqual([true, true, true, true, true, true]);
    const seqs = await w.db.getAllAsync<{ readonly seq: number }>('SELECT seq FROM match_events WHERE match_id = ? ORDER BY seq', [id]);
    expect(seqs.map((row) => row.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(liveStore().live?.state.innings[0].runs).toBe(14);
    expect(liveStore().error).toBeNull();
    expect(liveStore().live?.state).toEqual(expectOk(await w.app.matches.load(id)).state);
  });

  it('interleaved taps of dispatch, undo and redo run in tap order and redo restores the very same events', async () => {
    const w = await world();
    const sw = await standaloneWorld(w.app);
    const id = (await sw.start(w.app)).match.id;
    install(w.app);
    expect(await liveStore().open(id)).toBe(true);
    expect(await Promise.all([liveStore().dispatch(scoreRuns(1)), liveStore().dispatch(scoreRuns(4))])).toEqual([true, true]);
    const single = deliveries(expectOk(await w.app.matches.load(id)).events)[0];
    const results = await Promise.all([liveStore().undo(), liveStore().undo(), liveStore().redo(), liveStore().dispatch(scoreRuns(2))]);
    expect(results).toEqual([true, true, true, true]);
    const events = expectOk(await w.app.matches.load(id)).events;
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3]);
    expect(deliveries(events).map((event) => event.runsRun + event.boundary)).toEqual([1, 2]);
    expect(deliveries(events)[0]).toEqual(single);
    expect(liveStore().redoStack).toEqual([]);
    expect(liveStore().live?.events).toEqual(events);
  });

  it('a double tap on confirming the result ends the match once and audits it once', async () => {
    const w = await world();
    const league = await createLeague(w.app);
    const started = await startLeagueMatch(w.app, league, 'Lions', 'Tigers');
    await playToConfirm(w.app, started.matchId, { runs: 20, wickets: 2, balls: 12 }, { runs: 15, wickets: 3, balls: 12 });
    install(w.app);
    expect(await liveStore().open(started.matchId)).toBe(true);
    await Promise.all([liveStore().dispatch({ type: 'end_match', outcome: { type: 'natural' } }), liveStore().dispatch({ type: 'end_match', outcome: { type: 'natural' } })]);
    expect(await count(w.db, 'match_events', "match_id = ? AND kind = 'match_ended'", [started.matchId])).toBe(1);
    expect(await count(w.db, 'audit_events', "action = 'result_recorded' AND match_id = ?", [started.matchId])).toBe(1);
    expect(liveStore().live?.match.status).toBe('completed');
  });

  it('a double tap on applying a correction applies it once; the second tap gets CONFLICT', async () => {
    const w = await world();
    const league = await createLeague(w.app);
    const flip = await flippableResult(w.app, league);
    install(w.app);
    expect(await liveStore().open(flip.started.matchId)).toBe(true);
    const preview = await liveStore().previewHistoryEdit(flip.ops);
    if (preview === null) {
      throw new Error('preview missing');
    }
    const results = await Promise.all([
      liveStore().applyHistoryEdit(flip.ops, 'Four missed', preview),
      liveStore().applyHistoryEdit(flip.ops, 'Four missed', preview),
    ]);
    expect(results).toEqual([true, false]);
    expect(liveStore().error?.code).toBe('CONFLICT');
    expect(await count(w.db, 'audit_events', "action = 'result_corrected'")).toBe(1);
  });

  it('a double tap on Continue applies a previewed tournament change once', async () => {
    const w = await world();
    const league = await createLeague(w.app);
    install(w.app);
    expect(await tournamentStore().open(league.tournamentId)).toBe(true);
    const fixture = tournamentStore().snapshot?.fixtures[0];
    if (fixture === undefined) {
      throw new Error('fixture missing');
    }
    const change = { kind: 'fixture_update' as const, fixtureId: fixture.id, patch: { scheduledDate: '2026-05-12' } };
    const preview = await tournamentStore().previewChange(change);
    if (preview === null) {
      throw new Error('preview missing');
    }
    const auditsBefore = await count(w.db, 'audit_events', 'tournament_id = ?', [league.tournamentId]);
    const results = await Promise.all([tournamentStore().applyChange(change, null, preview), tournamentStore().applyChange(change, null, preview)]);
    expect([...results].sort()).toEqual([false, true]);
    expect(tournamentStore().error?.code).toBe('CONFLICT');
    expect(await count(w.db, 'audit_events', 'tournament_id = ?', [league.tournamentId])).toBe(auditsBefore + 1);
  });

  it('a double tap on Start Match in match setup creates one match', async () => {
    const w = await world();
    const sw = await standaloneWorld(w.app);
    install(w.app);
    setupStore().update({
      title: 'Friendly',
      teamAId: sw.lions.team.id,
      teamBId: sw.tigers.team.id,
      squadA: sw.lions.players.slice(0, 11).map((player) => player.id),
      squadB: sw.tigers.players.slice(0, 11).map((player) => player.id),
      toss: { winnerTeamId: sw.lions.team.id, decision: 'bat' },
      openers: { strikerId: sw.lions.p(1), nonStrikerId: sw.lions.p(2), bowlerId: sw.tigers.p(7) },
    });
    await Promise.all([setupStore().submit(), setupStore().submit()]);
    expect(await count(w.db, 'matches')).toBe(1);
  });

  it('a double tap on Start Match for a tournament fixture starts one match and links it once', async () => {
    const w = await world();
    const league = await createLeague(w.app);
    install(w.app);
    const fixture = await league.fixture('Lions', 'Tigers');
    const [sideA, sideB] = league.sidesOf(fixture);
    expect(await setupStore().startFromFixture(league.tournamentId, fixture.id)).toBe(true);
    setupStore().update({
      squadA: sideA.players.map((player) => player.id),
      squadB: sideB.players.map((player) => player.id),
      toss: { winnerTeamId: sideA.team.id, decision: 'bat' },
      openers: { strikerId: sideA.p(1), nonStrikerId: sideA.p(2), bowlerId: sideB.p(6) },
    });
    const results = await Promise.all([setupStore().submit(), setupStore().submit()]);
    const created = results.filter((value): value is string => value !== null);
    expect(created).toHaveLength(1);
    expect(await count(w.db, 'matches')).toBe(1);
    expect((await w.db.getFirstAsync<{ readonly match_id: string | null }>('SELECT match_id FROM fixtures WHERE id = ?', [fixture.id]))?.match_id).toBe(created[0]);
  });

  it('a double tap on Save in the first wizard step creates one tournament', async () => {
    const w = await world();
    install(w.app);
    wizardStore().update({ info: { ...wizardStore().draft.info, name: 'Double Tap Cup', templateId: 'builtin:4-team-league', structureKind: 'league' } });
    await Promise.all([wizardStore().saveStep(), wizardStore().saveStep()]);
    expect(await count(w.db, 'tournaments')).toBe(1);
  });

  it('a double tap on Import as copy imports one copy', async () => {
    const w = await world();
    const league = await createLeague(w.app);
    const played = await startLeagueMatch(w.app, league, 'Lions', 'Tigers');
    await playToConfirm(w.app, played.matchId, { runs: 18, wickets: 1, balls: 12 }, { runs: 12, wickets: 2, balls: 12 });
    await score(w.app, played.matchId, { type: 'end_match', outcome: { type: 'natural' } });
    const exported = expectOk(await w.app.backup.exportBackup({ kind: 'full' }));
    install(w.app);
    expect(await backupStore().previewImport(exported.fileUri)).toBe(true);
    await Promise.all([backupStore().applyImport(exported.fileUri, 'import_as_copy'), backupStore().applyImport(exported.fileUri, 'import_as_copy')]);
    expect(await count(w.db, 'tournaments')).toBe(2);
    expect(await count(w.db, 'audit_events', "action = 'backup_imported'")).toBe(1);
  });
});

describe('stale writers get CONFLICT and change nothing (§89, FR-10f, FR-12)', () => {
  it('undo, redo and endMatch with a stale expectedLastSeq are refused without a write', async () => {
    const w = await world();
    const sw = await standaloneWorld(w.app);
    const id = (await sw.start(w.app)).match.id;
    await scoreAll(w.app, id, [scoreRuns(1), scoreRuns(2)]);
    const undone = expectOk(await w.app.matches.undo(id, 3));
    await score(w.app, id, scoreRuns(6));
    const before = await digest(w.db);
    expectFailure(await w.app.matches.undo(id, 2), 'CONFLICT');
    expectFailure(await w.app.matches.redo(id, 2, undone.undone), 'CONFLICT');
    expectFailure(await w.app.matches.endMatch(id, 2, { type: 'no_result', reason: null }, null), 'CONFLICT');
    expectFailure(await w.app.matches.record(id, 2, [{ kind: 'strike_swapped' }]), 'CONFLICT');
    expect(await digest(w.db)).toBe(before);
  });

  it('FR-10f a correction previewed before an undo and a different ball is refused although lastSeq is equal', async () => {
    const w = await world();
    const sw = await standaloneWorld(w.app);
    const id = (await sw.start(w.app)).match.id;
    await scoreAll(w.app, id, [scoreRuns(1), scoreRuns(2)]);
    const loaded = await live(w.app, id);
    const two = deliveries(loaded.events)[1];
    const ops: readonly HistoryEditOp[] = [{ op: 'replace', seq: two.seq, with: [{ ...payloadOf(two), runsRun: 3 }] }];
    const preview = expectOk(await w.app.matches.previewHistoryEdit(id, ops));
    expectOk(await w.app.matches.undo(id, loaded.state.lastSeq));
    await score(w.app, id, scoreRuns(2));
    expect((await live(w.app, id)).state.lastSeq).toBe(loaded.state.lastSeq);
    const before = await digest(w.db);
    expectFailure(await w.app.matches.applyHistoryEdit(id, ops, 'late fix', preview.baseFingerprint), 'CONFLICT');
    expect(await digest(w.db)).toBe(before);
  });

  it('a tournament change previewed before a result was confirmed through the scoring store is refused and the store refreshes', async () => {
    const w = await world();
    const league = await createLeague(w.app);
    const started = await startLeagueMatch(w.app, league, 'Lions', 'Tigers');
    await playToConfirm(w.app, started.matchId, { runs: 20, wickets: 2, balls: 12 }, { runs: 15, wickets: 3, balls: 12 });
    install(w.app);
    expect(await tournamentStore().open(league.tournamentId)).toBe(true);
    const other = tournamentStore().snapshot?.fixtures.find((fixture) => fixture.matchId === null);
    if (other === undefined) {
      throw new Error('fixture missing');
    }
    const change = { kind: 'fixture_update' as const, fixtureId: other.id, patch: { scheduledDate: '2026-05-30' } };
    const preview = await tournamentStore().previewChange(change);
    if (preview === null) {
      throw new Error('preview missing');
    }
    expect(await liveStore().open(started.matchId)).toBe(true);
    await mustDispatch({ type: 'end_match', outcome: { type: 'natural' } });
    await eventually(() => tournamentStore().snapshot?.version !== preview.version);
    const fixturesBefore = await digest(w.db, ['audit_events', 'tournaments']);
    expect(await tournamentStore().applyChange(change, null, preview)).toBe(false);
    expect(tournamentStore().error?.code).toBe('CONFLICT');
    expect(tournamentStore().snapshot?.version).toBe(String(await revisionOf(w.db, league.tournamentId)));
    expect(await digest(w.db, ['audit_events', 'tournaments'])).toBe(fixturesBefore);
    expect(rowFor(tournamentStore().evaluation as TournamentEvaluation, league.sides.Lions.team.id)).toMatchObject({ played: 1, won: 1 });
  });

  it('redo after another device scored is refused, reloads the other device\'s ball and clears the redo stack', async () => {
    const w = await world();
    const sw = await standaloneWorld(w.app);
    const id = (await sw.start(w.app)).match.id;
    install(w.app);
    expect(await liveStore().open(id)).toBe(true);
    await mustDispatch(scoreRuns(1));
    expect(await liveStore().undo()).toBe(true);
    const other = appOn(w.db, w.app.deps.clock);
    await score(other, id, scoreRuns(6));
    expect(await liveStore().redo()).toBe(false);
    expect(liveStore().error?.code).toBe('CONFLICT');
    expect(liveStore().redoStack).toEqual([]);
    expect(liveStore().live?.state.innings[0].runs).toBe(6);
    expect(await count(w.db, 'match_events', 'match_id = ?', [id])).toBe(2);
  });
});

describe('historical correction of a completed tournament match through the stores (§16, §34, §53, §99, FR-10)', () => {
  it('previews the impact, needs a reason, flips the result, recomputes standings and NRR, refreshes the tournament and audits the previewed impact', async () => {
    const w = await world();
    const league = await createLeague(w.app);
    const flip = await flippableResult(w.app, league);
    const lions = league.sides.Lions.team.id;
    const tigers = league.sides.Tigers.team.id;
    install(w.app);
    expect(await tournamentStore().open(league.tournamentId)).toBe(true);
    const evaluationBefore = tournamentStore().evaluation as TournamentEvaluation;
    expect(rowFor(evaluationBefore, lions)).toMatchObject({ won: 1, points: 2 });
    expect(rowFor(evaluationBefore, lions).nrr).toBeCloseTo(1, 6);
    expect(rowFor(evaluationBefore, tigers).nrr).toBeCloseTo(-1, 6);
    const revisionBefore = await revisionOf(w.db, league.tournamentId);
    expect(await liveStore().open(flip.started.matchId)).toBe(true);
    const preview = await liveStore().previewHistoryEdit(flip.ops);
    if (preview === null) {
      throw new Error('preview missing');
    }
    expect(preview.requiresReason).toBe(true);
    expect(preview.outcome.resultChanged).toBe(true);
    expect(preview.impact?.standings.map((change) => change.teamId).sort()).toEqual([lions, tigers].sort());
    expect(preview.impact?.nrrChanged).toBe(true);
    expect(await liveStore().applyHistoryEdit(flip.ops, null, preview)).toBe(false);
    expect(liveStore().error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(await count(w.db, 'audit_events', "action = 'result_corrected'")).toBe(0);
    expect(await liveStore().applyHistoryEdit(flip.ops, '  Scorer pressed 0 instead of 4  ', preview)).toBe(true);
    expect(liveStore().live?.state.result).toMatchObject({ type: 'win', winnerTeamId: tigers });
    expect(await eventually(() => (tournamentStore().evaluation === null ? false : rowFor(tournamentStore().evaluation as TournamentEvaluation, tigers).won === 1))).toBe(true);
    const after = tournamentStore().evaluation as TournamentEvaluation;
    expect(rowFor(after, tigers)).toMatchObject({ played: 1, won: 1, lost: 0, points: 2 });
    expect(rowFor(after, lions)).toMatchObject({ played: 1, won: 0, lost: 1, points: 0 });
    expect(rowFor(after, tigers).nrr).toBeCloseTo(1, 6);
    expect(rowFor(after, lions).nrr).toBeCloseTo(-1, 6);
    expect(rowFor(after, tigers).position).toBeLessThan(rowFor(after, lions).position);
    expect(await revisionOf(w.db, league.tournamentId)).toBeGreaterThan(revisionBefore);
    const audit = await w.db.getFirstAsync<{ readonly reason: string; readonly previous_json: string; readonly new_json: string; readonly impact_json: string; readonly tournament_id: string }>(
      "SELECT reason, previous_json, new_json, impact_json, tournament_id FROM audit_events WHERE action = 'result_corrected' AND match_id = ?",
      [flip.started.matchId],
    );
    expect(audit?.reason).toBe('Scorer pressed 0 instead of 4');
    expect(audit?.tournament_id).toBe(league.tournamentId);
    expect(JSON.parse(audit?.previous_json ?? '[]')).toHaveLength(1);
    expect(JSON.parse(audit?.new_json ?? '[]')).toEqual([expect.objectContaining({ kind: 'delivery', boundary: 4 })]);
    expect(JSON.parse(audit?.impact_json ?? 'null')).toEqual(JSON.parse(JSON.stringify(preview.impact)));
    const loaded = expectOk(await w.app.matches.load(flip.started.matchId));
    expect(loaded.state).toEqual(liveStore().live?.state);
  });
});

describe('the §23 resume prompt: RESUME, SAVE & EXIT and DISCARD', () => {
  async function standaloneLive(w: World, balls: readonly ScoringIntent[]): Promise<string> {
    const sw = await standaloneWorld(w.app);
    const id = (await sw.start(w.app)).match.id;
    await scoreAll(w.app, id, balls);
    return id;
  }

  it('SAVE & EXIT hides the match from the startup prompt across a restart but keeps it under Continue Match until the next ball', async () => {
    const first = await world();
    const id = await standaloneLive(first, [scoreRuns(1), scoreRuns(4)]);
    install(first.app);
    expect(await appStore().bootstrap()).toBe(true);
    expect(appStore().report?.resumable.map((item) => item.id)).toEqual([id]);
    expect(await homeStore().load()).toBe(true);
    expect(await homeStore().dismissResume(id)).toBe(true);
    expect(appStore().report?.resumable).toEqual([]);
    expect(homeStore().resumable.map((item) => item.id)).toEqual([id]);
    const second = warmRestart(first);
    install(second.app);
    expect(await appStore().bootstrap()).toBe(true);
    expect(appStore().report?.resumable).toEqual([]);
    expect(await homeStore().load()).toBe(true);
    expect(homeStore().resumable.map((item) => item.id)).toEqual([id]);
    expect(homeStore().resumable[0].status).toBe('live');
    expect(await liveStore().open(id)).toBe(true);
    await mustDispatch(scoreRuns(2));
    expect(expectOk(await second.app.matches.findResumable({ forPrompt: true })).map((item) => item.id)).toEqual([id]);
    expect((await first.db.getFirstAsync<{ readonly at: string | null }>('SELECT resume_dismissed_at AS at FROM matches WHERE id = ?', [id]))?.at).toBeNull();
  });

  it('after SAVE & EXIT the next ball clears the dismissal in the open live match as well as in the database', async () => {
    const w = await world();
    const id = await standaloneLive(w, [scoreRuns(1)]);
    expectOk(await w.app.matches.dismissResume(id));
    install(w.app);
    expect(await liveStore().open(id)).toBe(true);
    expect(liveStore().live?.match.resumeDismissedAt).not.toBeNull();
    await mustDispatch(scoreRuns(1));
    expect(expectOk(await w.app.matches.load(id)).match.resumeDismissedAt).toBeNull();
    expect(liveStore().live?.match.resumeDismissedAt).toBeNull();
  });

  it('FR-18 a restart without a choice shows the prompt again with nothing changed', async () => {
    const first = await world();
    const id = await standaloneLive(first, [scoreRuns(1), wicket({ dismissal: 'bowled' })]);
    const before = await digest(first.db);
    const second = warmRestart(first);
    install(second.app);
    expect(await appStore().bootstrap()).toBe(true);
    const third = warmRestart(second);
    install(third.app);
    expect(await appStore().bootstrap()).toBe(true);
    expect(appStore().report?.resumable.map((item) => item.id)).toEqual([id]);
    expect(await digest(first.db)).toBe(before);
  });

  it('DISCARD deletes every row of the unfinished match, leaves the other match untouched and refreshes Home', async () => {
    const w = await world();
    const sw = await standaloneWorld(w.app);
    const doomed = (await sw.start(w.app)).match.id;
    await scoreAll(w.app, doomed, [scoreRuns(1), wicket({ dismissal: 'bowled', nextBatterId: sw.lions.p(3) }), scoreRuns(2)]);
    const kept = (await sw.start(w.app, { title: 'Second game' })).match.id;
    await scoreAll(w.app, kept, [scoreRuns(4)]);
    const keptBefore = JSON.stringify(expectOk(await w.app.matches.load(kept)));
    install(w.app);
    expect(await appStore().bootstrap()).toBe(true);
    expect(await homeStore().load()).toBe(true);
    expect(homeStore().resumable.map((item) => item.id).sort()).toEqual([doomed, kept].sort());
    expect(await homeStore().discard(doomed)).toBe(true);
    for (const table of ['matches', 'match_players', 'match_events', 'innings', 'partnerships']) {
      expect(await count(w.db, table, table === 'matches' ? 'id = ?' : 'match_id = ?', [doomed])).toBe(0);
    }
    expect(homeStore().resumable.map((item) => item.id)).toEqual([kept]);
    expect(appStore().report?.resumable.map((item) => item.id)).toEqual([kept]);
    expect(JSON.stringify(expectOk(await w.app.matches.load(kept)))).toBe(keptBefore);
  });

  it('DISCARD is refused for a tournament match and for a finished standalone match, with nothing changed', async () => {
    const w = await world();
    const league = await createLeague(w.app);
    const started = await startLeagueMatch(w.app, league, 'Lions', 'Tigers');
    await playBalls(w.app, started.matchId, [1, 2]);
    const sw = await standaloneWorld(w.app);
    const finished = expectOk(await w.app.matches.createMatch(sw.input({ title: 'Walkover game' })));
    expectOk(await w.app.matches.endMatch(finished.match.id, 0, { type: 'walkover', winnerTeamId: sw.lions.team.id, reason: null }, null));
    const before = await digest(w.db);
    install(w.app);
    expect(await homeStore().load()).toBe(true);
    expect(await homeStore().discard(started.matchId)).toBe(false);
    expectFailure(await w.app.matches.discard(started.matchId), 'FORBIDDEN_STATE');
    expectFailure(await w.app.matches.discard(finished.match.id), 'FORBIDDEN_STATE');
    expect(await digest(w.db)).toBe(before);
    expect(homeStore().resumable.map((item) => item.id)).toEqual([started.matchId]);
  });
});

describe('walkover, abandonment and no result through the scoring store (§22, §39, §63, §66)', () => {
  let w: World;
  let league: League;
  let walkoverMatch: string;
  let walkoverFixture: string;

  beforeAll(async () => {
    w = await world();
    league = await createLeague(w.app);
  });

  it('a walkover dispatched on an unstarted fixture match completes it, mirrors the fixture, scores walkover points, bumps the revision and audits it', async () => {
    install(w.app);
    const fixture = await league.fixture('Lions', 'Tigers');
    expect(await setupStore().startFromFixture(league.tournamentId, fixture.id)).toBe(true);
    const [sideA, sideB] = league.sidesOf(fixture);
    setupStore().update({ squadA: sideA.players.map((player) => player.id), squadB: sideB.players.map((player) => player.id) });
    const matchId = await setupStore().submit();
    if (matchId === null) {
      throw new Error(`submit failed: ${setupStore().error?.message}`);
    }
    walkoverMatch = matchId;
    walkoverFixture = fixture.id;
    expect(await tournamentStore().open(league.tournamentId)).toBe(true);
    expect(await liveStore().open(matchId)).toBe(true);
    expect(liveStore().live?.state.lifecycle).toBe('not_started');
    const revisionBefore = await revisionOf(w.db, league.tournamentId);
    await mustDispatch({ type: 'end_match', outcome: { type: 'walkover', winnerTeamId: league.sides.Lions.team.id, reason: 'Tigers did not arrive' } });
    expect(liveStore().live?.match.status).toBe('completed');
    expect(liveStore().live?.state.resultText).toMatch(/walkover/);
    expect((await w.db.getFirstAsync<{ readonly status: string }>('SELECT status FROM fixtures WHERE id = ?', [fixture.id]))?.status).toBe('completed');
    expect(await revisionOf(w.db, league.tournamentId)).toBeGreaterThan(revisionBefore);
    expect(await count(w.db, 'audit_events', "action = 'result_recorded' AND match_id = ?", [matchId])).toBe(1);
    expect(await eventually(() => rowFor(tournamentStore().evaluation as TournamentEvaluation, league.sides.Lions.team.id).played === 1)).toBe(true);
    expect(rowFor(tournamentStore().evaluation as TournamentEvaluation, league.sides.Lions.team.id)).toMatchObject({ won: 1, points: 2 });
    expect(rowFor(tournamentStore().evaluation as TournamentEvaluation, league.sides.Tigers.team.id)).toMatchObject({ lost: 1, points: 0 });
    expect(await homeStore().load()).toBe(true);
    expect(homeStore().resumable.some((item) => item.id === matchId)).toBe(false);
  });

  it('reopening the walkover through the store needs a reason, keeps the redo group when refused, and redo needs a reason too', async () => {
    install(w.app);
    expect(await tournamentStore().open(league.tournamentId)).toBe(true);
    expect(await liveStore().open(walkoverMatch)).toBe(true);
    const before = liveStore().live;
    expect(await liveStore().undo()).toBe(false);
    expect(liveStore().error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(liveStore().live).toEqual(before);
    expect(await liveStore().undo('Tigers arrived after all')).toBe(true);
    expect((await w.db.getFirstAsync<{ readonly status: string }>('SELECT status FROM fixtures WHERE id = ?', [walkoverFixture]))?.status).toBe('scheduled');
    expect(await eventually(() => rowFor(tournamentStore().evaluation as TournamentEvaluation, league.sides.Lions.team.id).played === 0)).toBe(true);
    expect(liveStore().redoStack).toHaveLength(1);
    expect(await liveStore().redo()).toBe(false);
    expect(liveStore().error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(liveStore().redoStack).toHaveLength(1);
    expect(await liveStore().redo('They left again')).toBe(true);
    expect(liveStore().live?.match.status).toBe('completed');
    expect(await eventually(() => rowFor(tournamentStore().evaluation as TournamentEvaluation, league.sides.Lions.team.id).points === 2)).toBe(true);
    expect(await count(w.db, 'audit_events', "action = 'match_reopened' AND match_id = ? AND reason = 'Tigers arrived after all'", [walkoverMatch])).toBe(1);
    expect(await count(w.db, 'audit_events', "action = 'result_recorded' AND match_id = ? AND reason = 'They left again'", [walkoverMatch])).toBe(1);
  });

  it('abandoning mid-play through the store makes the match and its fixture abandoned and counts a no result for both sides', async () => {
    install(w.app);
    const started = await startLeagueMatch(w.app, league, 'Eagles', 'Hawks');
    expect(await liveStore().open(started.matchId)).toBe(true);
    await mustDispatch(scoreRuns(1));
    await mustDispatch(scoreRuns(2));
    await mustDispatch({ type: 'end_match', outcome: { type: 'abandoned', reason: 'Rain' } });
    expect(liveStore().live?.match.status).toBe('abandoned');
    expect((await w.db.getFirstAsync<{ readonly status: string }>('SELECT status FROM fixtures WHERE id = ?', [started.fixture.id]))?.status).toBe('abandoned');
    const { evaluation } = await league.evaluate();
    expect(rowFor(evaluation, league.sides.Eagles.team.id)).toMatchObject({ played: 1, noResult: 1, points: 1 });
    expect(rowFor(evaluation, league.sides.Hawks.team.id)).toMatchObject({ played: 1, noResult: 1, points: 1 });
    expect(await count(w.db, 'audit_events', "action = 'result_recorded' AND match_id = ?", [started.matchId])).toBe(1);
    expect(expectOk(await w.app.matches.findResumable()).some((item) => item.id === started.matchId)).toBe(false);
  });

  it('the reason typed when abandoning through the scoring screen is kept as the audit reason (§53)', async () => {
    const own = await world();
    const ownLeague = await createLeague(own.app);
    install(own.app);
    const started = await startLeagueMatch(own.app, ownLeague, 'Lions', 'Hawks');
    expect(await liveStore().open(started.matchId)).toBe(true);
    await mustDispatch(scoreRuns(1));
    await mustDispatch({ type: 'end_match', outcome: { type: 'abandoned', reason: 'Waterlogged outfield' } });
    const audit = await own.db.getFirstAsync<{ readonly reason: string | null }>("SELECT reason FROM audit_events WHERE action = 'result_recorded' AND match_id = ?", [started.matchId]);
    expect(audit?.reason).toBe('Waterlogged outfield');
  });

  it('a no result after play completes the match with an NR for both sides', async () => {
    install(w.app);
    const started = await startLeagueMatch(w.app, league, 'Tigers', 'Eagles');
    expect(await liveStore().open(started.matchId)).toBe(true);
    await mustDispatch(scoreRuns(4));
    await mustDispatch({ type: 'end_match', outcome: { type: 'no_result', reason: 'Bad light' } });
    expect(liveStore().live?.match.status).toBe('completed');
    expect(liveStore().live?.state.result?.type).toBe('no_result');
    expect((await w.db.getFirstAsync<{ readonly status: string }>('SELECT status FROM fixtures WHERE id = ?', [started.fixture.id]))?.status).toBe('completed');
    const { evaluation } = await league.evaluate();
    expect(rowFor(evaluation, league.sides.Tigers.team.id).noResult).toBe(1);
    expect(rowFor(evaluation, league.sides.Eagles.team.id).noResult).toBe(2);
  });
});

describe('duplicate backup imports (§84, §93, FR-06)', () => {
  async function leagueWithResult(): Promise<{ readonly w: World; readonly league: League; readonly matchId: string; readonly fileUri: string }> {
    const w = await world();
    const league = await createLeague(w.app);
    const played = await startLeagueMatch(w.app, league, 'Lions', 'Tigers');
    await playToConfirm(w.app, played.matchId, { runs: 18, wickets: 1, balls: 12 }, { runs: 12, wickets: 2, balls: 12 });
    await score(w.app, played.matchId, { type: 'end_match', outcome: { type: 'natural' } });
    const exported = expectOk(await w.app.backup.exportBackup({ kind: 'full' }));
    return { w, league, matchId: played.matchId, fileUri: exported.fileUri };
  }

  it('skip_existing merges nothing into a tournament that has local-only work and records one import', async () => {
    const { w, league, fileUri } = await leagueWithResult();
    const local = await startLeagueMatch(w.app, league, 'Eagles', 'Hawks');
    await playBalls(w.app, local.matchId, [1, 4]);
    const before = await digest(w.db, ['audit_events']);
    install(w.app);
    expect(await backupStore().previewImport(fileUri)).toBe(true);
    const conflict = backupStore().preview?.conflicts.find((entry) => entry.entity === 'tournament');
    expect(conflict?.localOnly.matches).toBe(1);
    expect(await backupStore().applyImport(fileUri, 'skip_existing')).toBe(true);
    expect(Object.values(backupStore().report?.imported ?? {}).every((value) => value === 0)).toBe(true);
    expect(await digest(w.db, ['audit_events'])).toBe(before);
    expect(await count(w.db, 'audit_events', "action = 'backup_imported'")).toBe(1);
  });

  it('import_as_copy twice gives two independent copies that replay cleanly and leaves the original untouched', async () => {
    const { w, league, fileUri } = await leagueWithResult();
    const originalBefore = (await league.evaluate()).evaluation;
    install(w.app);
    for (let round = 0; round < 2; round += 1) {
      expect(await backupStore().previewImport(fileUri)).toBe(true);
      expect(await backupStore().applyImport(fileUri, 'import_as_copy')).toBe(true);
      expect(backupStore().report?.rebuiltMatches).toBe(1);
    }
    const tournaments = expectOk(await w.app.tournaments.list());
    expect(new Set(tournaments.map((item) => item.id)).size).toBe(3);
    expect((await league.evaluate()).evaluation).toEqual(originalBefore);
    const integrity = expectOk(await w.app.checkIntegrity());
    expect(integrity).toMatchObject({ foreignKeyViolations: 0, matchesNeedingRepair: [] });
    const shape = (evaluation: TournamentEvaluation) => evaluation.stages[0].tables[0].rows.map((row) => [row.position, row.played, row.points, row.nrr]);
    const original = expectOk(await w.app.tournaments.evaluate(league.tournamentId));
    const copies = tournaments.filter((entry) => entry.id !== league.tournamentId);
    expect(copies).toHaveLength(2);
    for (const item of copies) {
      const copy = expectOk(await w.app.tournaments.evaluate(item.id));
      expect(shape(copy.evaluation)).toEqual(shape(original.evaluation));
      expect(copy.snapshot.fixtures.every((fixture) => !original.snapshot.fixtures.some((entry) => entry.id === fixture.id))).toBe(true);
    }
  });

  it('replace_existing under an open scoring screen: the next tap gets CONFLICT and reloads the restored log', async () => {
    const w = await world();
    const sw = await standaloneWorld(w.app);
    const id = (await sw.start(w.app)).match.id;
    await scoreAll(w.app, id, [scoreRuns(1), scoreRuns(4)]);
    const exported = expectOk(await w.app.backup.exportBackup({ kind: 'match', matchId: id }));
    install(w.app);
    expect(await liveStore().open(id)).toBe(true);
    await mustDispatch(scoreRuns(2));
    await mustDispatch(scoreRuns(1));
    expect(await backupStore().previewImport(exported.fileUri)).toBe(true);
    const conflict = backupStore().preview?.conflicts.find((entry) => entry.entity === 'match');
    expect(conflict?.localOnly.events).toBe(2);
    expect(await backupStore().applyImport(exported.fileUri, 'replace_existing')).toBe(true);
    expect(expectOk(await w.app.matches.load(id)).state.lastSeq).toBe(3);
    expect(await liveStore().dispatch(scoreRuns(6))).toBe(false);
    expect(liveStore().error?.code).toBe('CONFLICT');
    expect(liveStore().live?.state.lastSeq).toBe(3);
    expect(liveStore().live?.state.innings[0].runs).toBe(5);
    await mustDispatch(scoreRuns(6));
    expect(liveStore().live?.state.lastSeq).toBe(4);
  });

  it('useBackupStore refuses to apply a file other than the previewed valid one and writes nothing', async () => {
    const { w, fileUri } = await leagueWithResult();
    w.app.deps.fileSystem.put('file:///picked/broken.json', '{"format":');
    const text = w.app.deps.fileSystem.files.get(fileUri) ?? '';
    w.app.deps.fileSystem.put('file:///picked/other.json', text);
    const before = await digest(w.db);
    install(w.app);
    expect(await backupStore().applyImport(fileUri, 'import_as_copy')).toBe(false);
    expect(backupStore().error?.code).toBe('IMPORT_INVALID');
    expect(await backupStore().previewImport('file:///picked/broken.json')).toBe(true);
    expect(backupStore().preview?.ok).toBe(false);
    expect(await backupStore().applyImport('file:///picked/broken.json', 'import_as_copy')).toBe(false);
    expect(await backupStore().previewImport(fileUri)).toBe(true);
    expect(await backupStore().applyImport('file:///picked/other.json', 'import_as_copy')).toBe(false);
    expect(await digest(w.db)).toBe(before);
  });
});

describe('tournament delete safeguards and the archived lock (§55, §99, BR-CC-02, BR-CC-13, EC-T-23)', () => {
  let w: World;
  let league: League;
  let playedId: string;
  let standaloneId: string;
  const RANK: readonly LeagueTeam[] = ['Lions', 'Tigers', 'Eagles', 'Hawks'];

  function rankOf(side: Side): number {
    return RANK.findIndex((team) => league.sides[team].team.id === side.team.id);
  }

  async function walkoverMatchBetween(a: LeagueTeam, b: LeagueTeam): Promise<string> {
    const { snapshot } = await league.evaluate();
    const ids = [league.sides[a].team.id, league.sides[b].team.id];
    const fixture = snapshot.fixtures.find(
      (entry) => entry.matchId !== null && entry.matchId !== playedId && entry.matchSides !== null && ids.includes(entry.matchSides.teamAId) && ids.includes(entry.matchSides.teamBId),
    );
    if (fixture === undefined || fixture.matchId === null) {
      throw new Error(`no walkover between ${a} and ${b}`);
    }
    return fixture.matchId;
  }

  async function flipWalkover(matchId: string, winner: LeagueTeam, reason: string): Promise<void> {
    const ops: readonly HistoryEditOp[] = [{ op: 'replace', seq: 1, with: [{ kind: 'match_ended', outcome: { type: 'walkover', winnerTeamId: league.sides[winner].team.id, reason: 'Corrected' } }] }];
    const preview = expectOk(await w.app.matches.previewHistoryEdit(matchId, ops));
    expect(preview.requiresReason).toBe(true);
    expectFailure(await w.app.matches.applyHistoryEdit(matchId, ops, null, preview.baseFingerprint), 'CONFIRMATION_REQUIRED');
    expectOk(await w.app.matches.applyHistoryEdit(matchId, ops, reason, preview.baseFingerprint));
  }

  beforeAll(async () => {
    w = await world();
    league = await createLeague(w.app, 'Winter League');
    const lions = league.sides.Lions;
    const tigers = league.sides.Tigers;
    const opening = await startLeagueMatch(w.app, league, 'Lions', 'Tigers');
    playedId = opening.matchId;
    await score(w.app, playedId, wicket({ dismissal: 'caught', fielderIds: [tigers.p(3)] }));
    await playBalls(w.app, playedId, [4, 4, 2, 2, 0, 6, 4, 0, 2, 0, 0]);
    await startInnings(w.app, playedId);
    await playBalls(w.app, playedId, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    await score(w.app, playedId, { type: 'end_match', outcome: { type: 'natural' } });
    expect((await live(w.app, playedId)).state.result).toMatchObject({ type: 'win', winnerTeamId: lions.team.id });
    for (let guard = 0; guard < 20; guard += 1) {
      const { snapshot } = await league.evaluate();
      const open = snapshot.fixtures.find((fixture) => fixture.matchId === null);
      if (open === undefined) {
        break;
      }
      const [sideA, sideB] = league.sidesOf(open);
      const winner = rankOf(sideA) < rankOf(sideB) ? sideA : sideB;
      const match = expectOk(await w.app.tournaments.startFixtureMatch(open.id, { squads: squadsFor(sideA, sideB), toss: null }));
      expectOk(await w.app.matches.endMatch(match.id, 0, { type: 'walkover', winnerTeamId: winner.team.id, reason: 'No show' }, 'Opponent did not arrive'));
    }
    const sw = await standaloneWorld(w.app);
    standaloneId = (await sw.start(w.app)).match.id;
  });

  it('a fully played league projects its champion and can be completed', async () => {
    const { snapshot, evaluation } = await league.evaluate();
    expect(snapshot.fixtures.every((fixture) => fixture.status === 'completed')).toBe(true);
    expect(evaluation.champion?.teamIds).toEqual([league.sides.Lions.team.id]);
    expect(RANK.map((team) => rowFor(evaluation, league.sides[team].team.id).points)).toEqual([12, 8, 4, 0]);
    expectOk(await w.app.tournaments.setStatus(league.tournamentId, 'completed', null));
    const item = expectOk(await w.app.tournaments.list()).find((entry) => entry.id === league.tournamentId);
    expect(item).toMatchObject({ status: 'completed', championName: 'Lions Winter', fixturesDone: 12, fixturesTotal: 12 });
  });

  it('an archived tournament cannot be deleted even with the typed name and the opt-in', async () => {
    expectOk(await w.app.tournaments.setStatus(league.tournamentId, 'archived', null));
    const before = await digest(w.db);
    expectFailure(await w.app.tournaments.delete(league.tournamentId, { typedName: 'Winter League', deleteCompletedMatches: true }), 'FORBIDDEN_STATE');
    expect(await digest(w.db)).toBe(before);
  });

  it('an archived tournament is read-only for its matches: catcher correction, squad change, toss change and reopening are all refused', async () => {
    const loaded = await live(w.app, playedId);
    const caught = deliveries(loaded.events).find((event) => event.wicket?.type === 'caught');
    if (caught === undefined || caught.wicket === null) {
      throw new Error('caught delivery missing');
    }
    const catcher: readonly HistoryEditOp[] = [{ op: 'replace', seq: caught.seq, with: [{ ...payloadOf(caught), wicket: { ...caught.wicket, fielderIds: [league.sides.Tigers.p(4)] } }] }];
    const before = await digest(w.db);
    const preview = await w.app.matches.previewHistoryEdit(playedId, catcher);
    const attempts = {
      catcherCorrection: preview.ok ? (await w.app.matches.applyHistoryEdit(playedId, catcher, 'Wrong fielder', preview.value.baseFingerprint)).ok : false,
      squadChange: (await w.app.matches.addSquadPlayer(playedId, league.sides.Lions.team.id, { newPlayer: { name: 'Late Arrival' } }, { isSubstitute: true })).ok,
      tossChange: (await w.app.matches.setToss(playedId, { winnerTeamId: league.sides.Tigers.team.id, decision: 'bowl' }, 'Toss recorded wrongly')).ok,
      reopen: (await w.app.matches.undo(playedId, loaded.state.lastSeq, 'Recheck the last ball')).ok,
    };
    expect(attempts).toEqual({ catcherCorrection: false, squadChange: false, tossChange: false, reopen: false });
    expect(await digest(w.db)).toBe(before);
  });

  it('FR-10g after unarchiving, corrections of a completed tournament rewrite the champion projection in the same step', async () => {
    expectOk(await w.app.tournaments.setStatus(league.tournamentId, 'completed', null));
    await flipWalkover(await walkoverMatchBetween('Lions', 'Tigers'), 'Tigers', 'Tigers were present, the walkover went the wrong way');
    const middle = await league.evaluate();
    expect(rowFor(middle.evaluation, league.sides.Lions.team.id).points).toBe(10);
    expect(rowFor(middle.evaluation, league.sides.Tigers.team.id).points).toBe(10);
    await flipWalkover(await walkoverMatchBetween('Lions', 'Eagles'), 'Eagles', 'Lions forfeited this one');
    const { evaluation } = await league.evaluate();
    expect(evaluation.champion?.teamIds).toEqual([league.sides.Tigers.team.id]);
    const stored = await w.db.getFirstAsync<{ readonly champion_json: string | null }>('SELECT champion_json FROM tournaments WHERE id = ?', [league.tournamentId]);
    expect(JSON.parse(stored?.champion_json ?? 'null')).toEqual([league.sides.Tigers.team.id]);
    install(w.app);
    expect(await listStore().load()).toBe(true);
    expect(listStore().items.find((item) => item.id === league.tournamentId)?.championName).toBe('Tigers Winter');
    expect(await count(w.db, 'audit_events', "action = 'result_corrected' AND tournament_id = ? AND reason IS NOT NULL", [league.tournamentId])).toBe(2);
  });

  it('reopening a match of a completed tournament does not leave the tournament completed around a reopened match', async () => {
    const matchId = await walkoverMatchBetween('Eagles', 'Hawks');
    const result = await w.app.matches.undo(matchId, 1, 'Hawks protested the walkover');
    const { snapshot, evaluation } = await league.evaluate();
    const observed = {
      undo: result.ok ? 'reopened' : result.error.code,
      tournament: snapshot.tournament.status,
      fixture: snapshot.fixtures.find((entry) => entry.matchId === matchId)?.status ?? null,
      champion: evaluation.champion?.teamIds ?? null,
    };
    if (result.ok) {
      expectOk(await w.app.matches.redo(matchId, 0, result.value.undone, 'Protest dismissed'));
    }
    const leftCompletedAroundOpenMatch = observed.undo === 'reopened' && observed.tournament === 'completed';
    expect({ ...observed, leftCompletedAroundOpenMatch }).toEqual({ ...observed, leftCompletedAroundOpenMatch: false });
  });

  it('deleting through useTournamentStore needs the typed name and the opt-in, then removes every tournament match and keeps the library and standalone matches', async () => {
    const status = (await league.evaluate()).snapshot.tournament.status;
    if (status !== 'completed') {
      expectOk(await w.app.tournaments.setStatus(league.tournamentId, 'completed', 'Back to completed'));
    }
    install(w.app);
    expect(await tournamentStore().open(league.tournamentId)).toBe(true);
    expect(await liveStore().open(playedId)).toBe(true);
    const footprint = await tournamentStore().previewDelete();
    expect(footprint).toMatchObject({ matches: 12, completedMatches: 12 });
    expect(await tournamentStore().delete({ typedName: 'winter league', deleteCompletedMatches: true })).toBe(false);
    expect(tournamentStore().error?.code).toBe('VALIDATION');
    expect(await tournamentStore().delete({ typedName: 'Winter League', deleteCompletedMatches: false })).toBe(false);
    expect(tournamentStore().error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(await count(w.db, 'matches', 'tournament_id = ?', [league.tournamentId])).toBe(12);
    expect(await tournamentStore().delete({ typedName: 'Winter League', deleteCompletedMatches: true })).toBe(true);
    expect(tournamentStore()).toMatchObject({ tournamentId: null, snapshot: null, evaluation: null });
    expect(await count(w.db, 'tournaments', 'id = ?', [league.tournamentId])).toBe(0);
    expect(await count(w.db, 'matches', 'tournament_id IS NOT NULL')).toBe(0);
    expect(await count(w.db, 'fixtures')).toBe(0);
    expect(await count(w.db, 'match_events', 'match_id = ?', [playedId])).toBe(0);
    expect(await count(w.db, 'matches', 'id = ?', [standaloneId])).toBe(1);
    expect(await count(w.db, 'teams')).toBe(6);
    expect(await listStore().load()).toBe(true);
    expect(listStore().items.some((item) => item.id === league.tournamentId)).toBe(false);
    expect(await liveStore().updateDetails({ title: 'Renamed after delete' })).toBe(false);
    expect(liveStore().error?.code).toBe('NOT_FOUND');
    expect(await liveStore().open(playedId)).toBe(false);
    expect(liveStore()).toMatchObject({ status: 'error', error: { code: 'NOT_FOUND' } });
  });

  it('a tournament whose only match is still live needs the opt-in before deletion', async () => {
    const own = await world();
    const ownLeague = await createLeague(own.app, 'Autumn League');
    const started = await startLeagueMatch(own.app, ownLeague, 'Lions', 'Tigers');
    await playBalls(own.app, started.matchId, [1]);
    const before = await digest(own.db);
    expectFailure(await own.app.tournaments.delete(ownLeague.tournamentId, { typedName: 'Autumn League', deleteCompletedMatches: false }), 'CONFIRMATION_REQUIRED');
    expect(await digest(own.db)).toBe(before);
  });
});

describe('projections are recomputable and never trusted over the log (§59, FR-05f, FR-16)', () => {
  async function completedLeagueMatch(): Promise<{ readonly w: World; readonly league: League; readonly matchId: string }> {
    const w = await world();
    const league = await createLeague(w.app);
    const started = await startLeagueMatch(w.app, league, 'Lions', 'Tigers');
    await playToConfirm(w.app, started.matchId, { runs: 20, wickets: 2, balls: 12 }, { runs: 15, wickets: 3, balls: 12 });
    await score(w.app, started.matchId, { type: 'end_match', outcome: { type: 'natural' } });
    return { w, league, matchId: started.matchId };
  }

  it('bootstrap rebuilds a stale, wrong tournament summary from the log, restores the standings and bumps the revision so older previews conflict', async () => {
    const { w, league, matchId } = await completedLeagueMatch();
    const correct = (await league.evaluate()).evaluation;
    const original = await w.db.getFirstAsync<{ readonly summary_json: string }>('SELECT summary_json FROM matches WHERE id = ?', [matchId]);
    await w.db.runAsync("UPDATE matches SET projection_version = 0, summary_json = json_set(summary_json, '$.winnerTeamId', ?) WHERE id = ?", [league.sides.Tigers.team.id, matchId]);
    const { snapshot } = await league.evaluate();
    const target = snapshot.fixtures.find((fixture) => fixture.matchId === null);
    if (target === undefined) {
      throw new Error('fixture missing');
    }
    const change = { kind: 'fixture_update' as const, fixtureId: target.id, patch: { scheduledDate: '2026-06-12' } };
    const stalePreview = expectOk(await w.app.tournaments.previewChange(league.tournamentId, change));
    const revisionBefore = await revisionOf(w.db, league.tournamentId);
    const restarted = warmRestart(w);
    const report = expectOk(await restarted.app.bootstrap());
    expect(report.projectionsRebuilt).toBe(1);
    expect(report.integrityIssues).toEqual([]);
    expect(await w.db.getFirstAsync('SELECT summary_json FROM matches WHERE id = ?', [matchId])).toEqual(original);
    const after = expectOk(await restarted.app.tournaments.evaluate(league.tournamentId));
    expect(after.snapshot.staleSummaryMatchIds).toEqual([]);
    expect(after.evaluation.stages).toEqual(correct.stages);
    expect(await revisionOf(w.db, league.tournamentId)).toBeGreaterThan(revisionBefore);
    expectFailure(await restarted.app.tournaments.applyChange(league.tournamentId, change, null, stalePreview), 'CONFLICT');
  });

  it('FR-16 a tournament match whose log needs repair is reported, never re-projected from the degraded replay, excluded from standings and refuses writes', async () => {
    const { w, league, matchId } = await completedLeagueMatch();
    const loaded = await live(w.app, matchId);
    const bowler = loaded.events.find((event) => event.kind === 'bowler_selected');
    if (bowler === undefined) {
      throw new Error('bowler selection missing');
    }
    await w.db.runAsync("UPDATE match_events SET payload_json = json_set(payload_json, '$.bowlerId', ?) WHERE id = ?", [league.sides.Lions.p(3), bowler.id]);
    await w.db.runAsync('UPDATE matches SET projection_version = 0 WHERE id = ?', [matchId]);
    const summaryBefore = await w.db.getFirstAsync('SELECT summary_json, status, updated_at FROM matches WHERE id = ?', [matchId]);
    const restarted = warmRestart(w);
    const report = expectOk(await restarted.app.bootstrap());
    expect(report.projectionsRebuilt).toBe(0);
    expect(report.integrityIssues.map((issue) => issue.matchId)).toEqual([matchId]);
    expect(report.integrityIssues[0].message).not.toMatch(/SQLITE|undefined|Error:/);
    expect(await w.db.getFirstAsync('SELECT summary_json, status, updated_at FROM matches WHERE id = ?', [matchId])).toEqual(summaryBefore);
    const evaluated = expectOk(await restarted.app.tournaments.evaluate(league.tournamentId));
    expect(evaluated.snapshot.staleSummaryMatchIds).toEqual([matchId]);
    expect(rowFor(evaluated.evaluation, league.sides.Lions.team.id).played).toBe(0);
    expect(expectOk(await restarted.app.checkIntegrity()).matchesNeedingRepair).toEqual([matchId]);
    expectFailure(await restarted.app.matches.rebuildProjections(matchId), 'FORBIDDEN_STATE');
    expectFailure(await restarted.app.matches.undo(matchId, loaded.state.lastSeq, 'Try to reopen'), 'FORBIDDEN_STATE');
  });

  it('read-only operations (load, lists, previews, evaluation, what-if, stats, audit pages, delete preview, import preview, PDF, integrity check) issue no write', async () => {
    const db = await createFaultInjectingDatabase();
    const app = appOn(db, fixedClock());
    expectOk(await app.bootstrap());
    const league = await createLeague(app);
    const started = await startLeagueMatch(app, league, 'Lions', 'Tigers');
    await playToConfirm(app, started.matchId, { runs: 20, wickets: 2, balls: 12 }, { runs: 15, wickets: 3, balls: 12 });
    await score(app, started.matchId, { type: 'end_match', outcome: { type: 'natural' } });
    const sw = await standaloneWorld(app);
    const standalone = await sw.start(app);
    await scoreAll(app, standalone.match.id, [scoreRuns(1), scoreRuns(2)]);
    const exported = expectOk(await app.backup.exportBackup({ kind: 'full' }));
    const loaded = await live(app, standalone.match.id);
    const two = deliveries(loaded.events)[1];
    const { snapshot } = await league.evaluate();
    const open = snapshot.fixtures.find((fixture) => fixture.matchId === null);
    if (open === undefined) {
      throw new Error('fixture missing');
    }
    db.clearLog();
    expectOk(await app.matches.load(started.matchId));
    expectOk(await app.matches.list({ sort: 'recent' }));
    expectOk(await app.matches.findResumable({ forPrompt: true }));
    expectOk(await app.matches.previewHistoryEdit(standalone.match.id, [{ op: 'replace', seq: two.seq, with: [{ ...payloadOf(two), runsRun: 3 }] }]));
    expectOk(await app.matches.auditLog(started.matchId, { limit: 10 }));
    expectOk(await app.tournaments.evaluate(league.tournamentId));
    expectOk(await app.tournaments.snapshot(league.tournamentId));
    expectOk(await app.tournaments.list());
    expectOk(await app.tournaments.previewChange(league.tournamentId, { kind: 'fixture_update', fixtureId: open.id, patch: { scheduledDate: '2026-06-01' } }));
    expectOk(await app.tournaments.whatIf(league.tournamentId, [{ fixtureId: open.id, outcome: 'side_a_win', score: null }]));
    expectOk(await app.tournaments.stats(league.tournamentId));
    expectOk(await app.tournaments.auditLog(league.tournamentId, { limit: 10 }));
    expectOk(await app.tournaments.previewDelete(league.tournamentId));
    expectOk(await app.backup.previewImport(exported.fileUri));
    expectOk(await app.export.scorecardPdf(started.matchId));
    expectOk(await app.checkIntegrity());
    const writes = db.statementLog.filter((entry) => /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(entry.sql));
    expect(writes.map((entry) => entry.sql.slice(0, 60))).toEqual([]);
  });
});

describe('cross-store concurrency and audit of live edits (§60, §89, §53)', () => {
  it('a ball and a tournament change committed at the same moment both land without deadlock', async () => {
    const w = await world();
    const league = await createLeague(w.app);
    const started = await startLeagueMatch(w.app, league, 'Lions', 'Tigers');
    install(w.app);
    expect(await liveStore().open(started.matchId)).toBe(true);
    expect(await tournamentStore().open(league.tournamentId)).toBe(true);
    const target = tournamentStore().snapshot?.fixtures.find((fixture) => fixture.matchId === null);
    if (target === undefined) {
      throw new Error('fixture missing');
    }
    const change = { kind: 'fixture_update' as const, fixtureId: target.id, patch: { scheduledDate: '2026-06-20' } };
    const preview = await tournamentStore().previewChange(change);
    if (preview === null) {
      throw new Error('preview missing');
    }
    const results = await Promise.all([liveStore().dispatch(scoreRuns(4)), tournamentStore().applyChange(change, null, preview), liveStore().dispatch(scoreRuns(1))]);
    expect(results).toEqual([true, true, true]);
    expect(expectOk(await w.app.matches.load(started.matchId)).state.lastSeq).toBe(3);
    expect((await w.db.getFirstAsync<{ readonly d: string }>('SELECT scheduled_date AS d FROM fixtures WHERE id = ?', [target.id]))?.d).toBe('2026-06-20');
  });

  it('a history edit of a live tournament match is audited against the tournament without needing a reason', async () => {
    const w = await world();
    const league = await createLeague(w.app);
    const started = await startLeagueMatch(w.app, league, 'Lions', 'Tigers');
    await playBalls(w.app, started.matchId, [1, 2]);
    install(w.app);
    expect(await liveStore().open(started.matchId)).toBe(true);
    const last = deliveries(liveStore().live?.events ?? [])[1];
    const ops: readonly HistoryEditOp[] = [{ op: 'replace', seq: last.seq, with: [{ ...payloadOf(last), runsRun: 3 }] }];
    const preview = await liveStore().previewHistoryEdit(ops);
    expect(preview?.requiresReason).toBe(false);
    if (preview === null) {
      throw new Error('preview missing');
    }
    expect(await liveStore().applyHistoryEdit(ops, null, preview)).toBe(true);
    const audit = await w.db.getAllAsync<{ readonly action: string; readonly tournament_id: string | null }>('SELECT action, tournament_id FROM audit_events WHERE match_id = ? AND action IN (?, ?)', [
      started.matchId,
      'match_history_edited',
      'result_corrected',
    ]);
    expect(audit).toEqual([{ action: 'match_history_edited', tournament_id: league.tournamentId }]);
  });

  it('a whitespace-only reason does not count as a reason for correcting a completed tournament result', async () => {
    const w = await world();
    const league = await createLeague(w.app);
    const flip = await flippableResult(w.app, league);
    const preview = expectOk(await w.app.matches.previewHistoryEdit(flip.started.matchId, flip.ops));
    const before = await digest(w.db);
    expectFailure(await w.app.matches.applyHistoryEdit(flip.started.matchId, flip.ops, '   \n ', preview.baseFingerprint), 'CONFIRMATION_REQUIRED');
    expect(await digest(w.db)).toBe(before);
  });
});

describe('restoring a backup keeps stale-preview detection reliable (§34, §84, §99)', () => {
  it('replace_existing never moves the tournament revision backwards, so a preview taken on an earlier restore is refused after a different restore', async () => {
    const w = await world();
    const league = await createLeague(w.app);
    const first = await startLeagueMatch(w.app, league, 'Lions', 'Tigers');
    await playToConfirm(w.app, first.matchId, { runs: 18, wickets: 1, balls: 12 }, { runs: 12, wickets: 2, balls: 12 });
    await score(w.app, first.matchId, { type: 'end_match', outcome: { type: 'natural' } });
    const before = expectOk(await w.app.backup.exportBackup({ kind: 'tournament', tournamentId: league.tournamentId }));
    const walkover = await startLeagueMatch(w.app, league, 'Eagles', 'Hawks', false);
    expectOk(await w.app.matches.endMatch(walkover.matchId, 0, { type: 'walkover', winnerTeamId: league.sides.Eagles.team.id, reason: 'No show' }, 'Hawks did not travel'));
    w.app.deps.clock.advance(86400000);
    const later = expectOk(await w.app.backup.exportBackup({ kind: 'tournament', tournamentId: league.tournamentId }));
    expect(later.fileUri).not.toBe(before.fileUri);
    const revisionBeforeRestore = await revisionOf(w.db, league.tournamentId);
    install(w.app);
    expect(await backupStore().previewImport(before.fileUri)).toBe(true);
    expect(await backupStore().applyImport(before.fileUri, 'replace_existing')).toBe(true);
    const revisionAfterRestore = await revisionOf(w.db, league.tournamentId);
    expect(await tournamentStore().open(league.tournamentId)).toBe(true);
    const target = tournamentStore().snapshot?.fixtures.find((fixture) => fixture.matchId === null);
    if (target === undefined) {
      throw new Error('fixture missing');
    }
    const change = { kind: 'fixture_update' as const, fixtureId: target.id, patch: { scheduledDate: '2026-07-01' } };
    const preview = await tournamentStore().previewChange(change);
    if (preview === null) {
      throw new Error('preview missing');
    }
    expect(await backupStore().previewImport(later.fileUri)).toBe(true);
    expect(await backupStore().applyImport(later.fileUri, 'replace_existing')).toBe(true);
    expect((await league.evaluate()).snapshot.fixtures.some((fixture) => fixture.matchId === walkover.matchId)).toBe(true);
    const applied = await tournamentStore().applyChange(change, null, preview);
    expect({
      revisionMovedForward: revisionAfterRestore > revisionBeforeRestore,
      stalePreviewAfterDifferentRestore: applied ? 'applied' : (tournamentStore().error?.code ?? 'none'),
    }).toEqual({ revisionMovedForward: true, stalePreviewAfterDifferentRestore: 'CONFLICT' });
  });
});

describe('a complete §92 tournament driven only through store actions (8 teams → 2 pools → single RR → top 2 → semifinals → final → champion)', () => {
  const NAMES = ['Lions', 'Tigers', 'Eagles', 'Hawks', 'Bulls', 'Bears', 'Cobras', 'Wolves'] as const;
  type Name = (typeof NAMES)[number];
  const RULES = rulesForOvers(2, { ...BASE_MATCH_RULES, playersPerSide: 6 });
  const line = (runs: number, wickets: number, balls: number): Line => ({ runs, wickets, balls });
  const GROUP: readonly (readonly [Name, Name, Line, Line])[] = [
    ['Lions', 'Tigers', line(30, 2, 12), line(20, 4, 12)],
    ['Eagles', 'Hawks', line(18, 3, 12), line(16, 4, 12)],
    ['Lions', 'Eagles', line(26, 1, 12), line(22, 4, 12)],
    ['Tigers', 'Hawks', line(24, 3, 12), line(12, 5, 9)],
    ['Hawks', 'Lions', line(20, 4, 12), line(21, 1, 10)],
    ['Tigers', 'Eagles', line(25, 2, 12), line(19, 4, 12)],
    ['Bulls', 'Bears', line(28, 3, 12), line(22, 4, 12)],
    ['Cobras', 'Wolves', line(20, 2, 12), line(14, 4, 12)],
    ['Bulls', 'Cobras', line(24, 2, 12), line(25, 1, 11)],
    ['Bears', 'Wolves', line(26, 2, 12), line(18, 5, 10)],
    ['Wolves', 'Bulls', line(15, 3, 12), line(16, 0, 8)],
    ['Bears', 'Cobras', line(21, 4, 12), line(20, 3, 12)],
  ];

  interface Tally {
    played: number;
    won: number;
    lost: number;
    points: number;
    runsFor: number;
    ballsFaced: number;
    runsAgainst: number;
    ballsBowled: number;
  }

  it('creates, plays and completes the tournament with standings, NRR and qualification checked after every match', async () => {
    const w = await world();
    install(w.app);
    const sides = {} as Record<Name, Side>;
    for (const name of NAMES) {
      const team = await teamStore().createTeam({ name, shortName: name.slice(0, 3).toUpperCase(), players: Array.from({ length: 6 }, (_, index) => ({ name: `${name} ${index + 1}`, jerseyNumber: index + 1 })) });
      if (team === null) {
        throw new Error(`team ${name} not created: ${teamStore().error?.message}`);
      }
      expect(await teamStore().loadTeam(team.id)).toBe(true);
      const players = [...(teamStore().detail?.players ?? [])].sort((a, b) => (a.jerseyNumber ?? 0) - (b.jerseyNumber ?? 0));
      sides[name] = { team, players, p: (number) => players[number - 1].id };
    }

    wizardStore().reset();
    wizardStore().update({ info: { ...wizardStore().draft.info, name: 'Store Cup', season: '2026', structureKind: 'groups_knockout', templateId: 'builtin:8-team-t20' } });
    expect(await wizardStore().saveStep()).toBe(true);
    const tournamentId = wizardStore().draft.tournamentId;
    if (tournamentId === null) {
      throw new Error('tournament not created');
    }
    wizardStore().update({ teams: NAMES.map((name, index) => ({ teamId: sides[name].team.id, seed: index + 1 })) });
    expect(await wizardStore().saveStep()).toBe(true);
    expect(await wizardStore().saveStep()).toBe(true);
    const rules = wizardStore().draft.rules;
    if (rules === null) {
      throw new Error('rules missing');
    }
    wizardStore().update({ rules: { ...rules, defaultMatchRules: RULES } });
    expect(await wizardStore().saveStep()).toBe(true);
    const [group, knockouts] = [...wizardStore().draft.stages].sort((a, b) => a.orderIndex - b.orderIndex) as [Stage, Stage];
    const pools = wizardStore().draft.pools.filter((pool) => pool.stageId === group.id).sort((a, b) => a.orderIndex - b.orderIndex);
    const member = (name: Name) => ({ kind: 'team' as const, teamId: sides[name].team.id });
    const assignment = await wizardStore().previewPools({
      kind: 'manual',
      assignment: {
        seed: null,
        pools: [
          { poolId: pools[0].id, name: pools[0].name, members: (['Lions', 'Tigers', 'Eagles', 'Hawks'] as const).map(member) },
          { poolId: pools[1].id, name: pools[1].name, members: (['Bulls', 'Bears', 'Cobras', 'Wolves'] as const).map(member) },
        ],
      },
    });
    expect(assignment).not.toBeNull();
    expect(await wizardStore().saveStep()).toBe(true);
    expect((await wizardStore().generateFixtures())?.fixtures).toHaveLength(12);
    expect(await wizardStore().saveStep()).toBe(true);
    expect(await wizardStore().commit()).toBe(tournamentId);

    expect(await tournamentStore().open(tournamentId)).toBe(true);
    expect(tournamentStore().snapshot?.fixtures).toHaveLength(15);
    expect(tournamentStore().snapshot?.tournament.status).toBe('fixtures_generated');

    const tally = new Map<string, Tally>(NAMES.map((name) => [sides[name].team.id, { played: 0, won: 0, lost: 0, points: 0, runsFor: 0, ballsFaced: 0, runsAgainst: 0, ballsBowled: 0 }]));
    const faced = (value: Line) => (value.wickets >= 5 ? 12 : value.balls);
    const credit = (batting: Side, fielding: Side, first: Line, second: Line) => {
      const bat = tally.get(batting.team.id) as Tally;
      const field = tally.get(fielding.team.id) as Tally;
      bat.played += 1;
      field.played += 1;
      bat.runsFor += first.runs;
      bat.ballsFaced += faced(first);
      bat.runsAgainst += second.runs;
      bat.ballsBowled += faced(second);
      field.runsFor += second.runs;
      field.ballsFaced += faced(second);
      field.runsAgainst += first.runs;
      field.ballsBowled += faced(first);
      const [winner, loser] = second.runs > first.runs ? [field, bat] : [bat, field];
      winner.won += 1;
      winner.points += 2;
      loser.lost += 1;
    };
    const nrrOf = (entry: Tally) => entry.runsFor / (entry.ballsFaced / 6) - entry.runsAgainst / (entry.ballsBowled / 6);

    const playThroughStores = async (fixture: Fixture, batting: Side, fielding: Side, first: Line, second: Line): Promise<string> => {
      expect(await setupStore().startFromFixture(tournamentId, fixture.id)).toBe(true);
      const draft = setupStore().draft;
      expect([draft.teamAId, draft.teamBId].sort()).toEqual([batting.team.id, fielding.team.id].sort());
      const sideOf = (teamId: string | null) => (teamId === batting.team.id ? batting : fielding);
      setupStore().update({
        squadA: sideOf(draft.teamAId).players.map((player) => player.id),
        squadB: sideOf(draft.teamBId).players.map((player) => player.id),
        toss: { winnerTeamId: batting.team.id, decision: 'bat' },
        openers: { strikerId: batting.p(1), nonStrikerId: batting.p(2), bowlerId: fielding.p(6) },
      });
      const matchId = await setupStore().submit();
      if (matchId === null) {
        throw new Error(`submit failed: ${setupStore().error?.message}`);
      }
      expect(await liveStore().open(matchId)).toBe(true);
      await playInningsThroughStore(planInningsBalls(first, 5, null));
      expect(liveStore().live?.state.pendingAction?.type).toBe('start_next_innings');
      await mustDispatch({ type: 'start_innings', strikerId: fielding.p(1), nonStrikerId: fielding.p(2), bowlerId: batting.p(6), battingTeamId: fielding.team.id });
      await playInningsThroughStore(planInningsBalls(second, 5, first.runs + 1));
      expect(liveStore().live?.state.pendingAction?.type).toBe('confirm_result');
      await mustDispatch({ type: 'end_match', outcome: { type: 'natural' } });
      expect(await tournamentStore().refresh()).toBe(true);
      return matchId;
    };

    const evaluation = () => tournamentStore().evaluation as TournamentEvaluation;
    const snapshot = () => tournamentStore().snapshot as TournamentSnapshot;
    const groupEvaluation = () => evaluation().stages.find((stage) => stage.stageId === group.id);
    const qualification = (name: Name) => groupEvaluation()?.qualification.find((entry) => entry.teamId === sides[name].team.id);
    const slot = (label: string) => {
      const found = snapshot().slots.find((entry) => entry.stageId === knockouts.id && entry.label === label);
      return evaluation().stages.flatMap((stage) => stage.slots).find((entry) => entry.slotId === found?.id);
    };

    for (const [index, [battingName, fieldingName, first, second]] of GROUP.entries()) {
      const batting = sides[battingName];
      const fielding = sides[fieldingName];
      await playThroughStores(fixtureBetween(snapshot(), batting, fielding), batting, fielding, first, second);
      credit(batting, fielding, first, second);
      for (const side of [batting, fielding]) {
        const expected = tally.get(side.team.id) as Tally;
        const row = rowFor(evaluation(), side.team.id);
        expect({ match: index + 1, team: side.team.name, played: row.played, won: row.won, lost: row.lost, points: row.points, runs: row.runsScored, balls: row.ballsFaced }).toEqual({
          match: index + 1,
          team: side.team.name,
          played: expected.played,
          won: expected.won,
          lost: expected.lost,
          points: expected.points,
          runs: expected.runsFor,
          balls: expected.ballsFaced,
        });
        expect(row.nrr).toBeCloseTo(nrrOf(expected), 6);
      }
      for (const table of groupEvaluation()?.tables ?? []) {
        const ordered = [...table.rows].sort((a, b) => a.position - b.position);
        ordered.slice(1).forEach((row, at) => {
          const above = ordered[at];
          expect(above.points).toBeGreaterThanOrEqual(row.points);
          if (above.points === row.points && above.nrr !== null && row.nrr !== null) {
            expect(above.nrr).toBeGreaterThanOrEqual(row.nrr);
          }
        });
      }
      expect(evaluation().progress).toEqual({ done: index + 1, total: 15 });
      if (index === 3) {
        expect(qualification('Lions')).toMatchObject({ state: 'qualified', certainty: 'mathematical' });
        expect(qualification('Hawks')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
        expect(qualification('Tigers')?.state).toBe('in_contention');
        expect(qualification('Eagles')?.state).toBe('in_contention');
      }
      if (index === 5) {
        expect(slot('A1')).toMatchObject({ teamId: sides.Lions.team.id, status: 'final' });
        expect(slot('A2')).toMatchObject({ teamId: sides.Tigers.team.id, status: 'final' });
      }
    }
    expect(slot('B1')).toMatchObject({ teamId: sides.Bulls.team.id, status: 'final' });
    expect(slot('B2')).toMatchObject({ teamId: sides.Cobras.team.id, status: 'final' });
    for (const name of ['Eagles', 'Hawks', 'Bears', 'Wolves'] as const) {
      expect(qualification(name)).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
    }
    for (const name of ['Lions', 'Tigers', 'Bulls', 'Cobras'] as const) {
      expect(qualification(name)?.state).toBe('qualified');
    }
    expect(snapshot().stages.find((stage) => stage.id === group.id)?.status).toBe('completed');
    expect(evaluation().currentStageId).toBe(knockouts.id);

    const bracket = (round: number, position: number): Fixture => {
      const found = snapshot().fixtures.find((fixture) => fixture.stageId === knockouts.id && fixture.bracket?.round === round && fixture.bracket.position === position && fixture.bracket.kind === 'main');
      if (found === undefined) {
        throw new Error(`no bracket fixture ${round}/${position}`);
      }
      return found;
    };
    await playThroughStores(bracket(1, 0), sides.Lions, sides.Cobras, line(32, 2, 12), line(28, 4, 12));
    expect(slot('Winner SF1')).toMatchObject({ teamId: sides.Lions.team.id, status: 'final' });
    await playThroughStores(bracket(1, 1), sides.Bulls, sides.Tigers, line(30, 3, 12), line(27, 4, 12));
    expect(slot('Winner SF2')).toMatchObject({ teamId: sides.Bulls.team.id, status: 'final' });
    const finalId = await playThroughStores(bracket(2, 0), sides.Bulls, sides.Lions, line(30, 3, 12), line(31, 2, 11));
    expect(liveStore().live?.state.resultText).toBe('Lions won by 3 wickets (1 ball left)');
    expect(evaluation().champion).toEqual({ teamIds: [sides.Lions.team.id], basis: 'final', fixtureId: bracket(2, 0).id });
    expect(evaluation().progress).toEqual({ done: 15, total: 15 });
    expect(liveStore().live?.match.id).toBe(finalId);

    expect(await tournamentStore().setStatus('completed', null)).toBe(true);
    expect(tournamentStore().snapshot?.tournament.status).toBe('completed');
    expect(await listStore().load()).toBe(true);
    expect(listStore().items.find((item) => item.id === tournamentId)).toMatchObject({ championName: 'Lions', fixturesDone: 15, fixturesTotal: 15, status: 'completed' });
    expect(await homeStore().load()).toBe(true);
    expect(homeStore().resumable).toEqual([]);
    const audit = (await tournamentStore().loadAudit({ limit: 1000 })) ?? [];
    expect(audit.filter((entry) => entry.action === 'result_recorded')).toHaveLength(15);
    expect(audit.filter((entry) => entry.action === 'match_started')).toHaveLength(15);
    expect(await appStore().checkIntegrity()).toMatchObject({ foreignKeyViolations: 0, matchesNeedingRepair: [] });
  });
});

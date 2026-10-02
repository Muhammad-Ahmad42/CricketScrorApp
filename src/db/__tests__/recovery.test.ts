/** @jest-environment node */
import type { AuditEvent, MatchEvent } from '@/domain/types';
import { sqliteErrorKind } from '../errors';
import { runMigrations } from '../migrate';
import { createRepositories, readMatchProjection } from '../repositories';
import type { MatchProjection, Repositories } from '../repositories/contracts';
import { buildMatch, buildTeamSeed, isoAt, squadsFor } from '../testing/builders';
import { createFaultInjectingDatabase, sqliteError, type FaultInjectingDatabase } from '../testing/faultInjectingDatabase';
import { goldenMatchEvents, goldenProjection, type GoldenMatchOptions } from '../testing/goldenMatch';
import { countRows } from '../testing/harness';
import { createSqlJsDatabase, type SqlJsTestDatabase } from '../testing/sqljsDatabase';
import { buildFixture, buildStage, seedBareTournament, teamSide } from '../testing/structureBuilders';
import { buildTournamentScenario, seedLibrary, seedTournamentScenario } from '../testing/tournamentScenario';
import type { SqlDatabase, SqlExecutor } from '../types';

const lions = buildTeamSeed('lio', 'Lions', 'LIO');
const tigers = buildTeamSeed('tig', 'Tigers', 'TIG');

const golden: GoldenMatchOptions = {
  matchId: 'm1',
  batFirst: { teamId: 'lio', playerIds: lions.players.map((p) => p.id) },
  bowlFirst: { teamId: 'tig', playerIds: tigers.players.map((p) => p.id) },
};

const LOG = goldenMatchEvents(golden);

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

const GROUPS = actionGroups(LOG);

function progress(actions: number): MatchProjection {
  const base = goldenProjection(golden, { projectionVersion: 1, teamAId: 'lio', at: isoAt(actions), completed: false });
  return { ...base, innings: base.innings.map((line, index) => (index === 0 ? { ...line, runs: actions } : line)) };
}

type UseCase = (repos: Repositories) => Promise<void>;

function useCase(index: number): UseCase {
  if (index === 0) {
    return async (repos) => {
      await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
      await repos.events.append(GROUPS[0]);
      await repos.matches.writeProjection(progress(1));
    };
  }
  return async (repos) => {
    const expectedLastSeq = GROUPS[index][0].seq - 1;
    const lastSeq = await repos.events.lastSeq('m1');
    if (lastSeq !== expectedLastSeq) {
      throw new Error(`stale writer: ${lastSeq} != ${expectedLastSeq}`);
    }
    await repos.events.append(GROUPS[index]);
    await repos.matches.writeProjection(progress(index + 1));
    await repos.matches.setResumeDismissed('m1', null);
  };
}

function inTransaction(db: SqlDatabase, work: UseCase): Promise<void> {
  return db.withTransactionAsync(async (tx) => work(createRepositories(tx)));
}

async function baseImage(): Promise<Uint8Array> {
  const db = await createSqlJsDatabase();
  await runMigrations(db, { now: () => isoAt(0) });
  await seedLibrary(db, [lions, tigers]);
  return db.exportAsync();
}

async function foreignKeyRows(db: SqlExecutor): Promise<unknown[]> {
  return db.getAllAsync('PRAGMA foreign_key_check');
}

async function expectCommittedActions(db: SqlJsTestDatabase, committed: number): Promise<void> {
  const repos = createRepositories(db);
  const expectedEvents = GROUPS.slice(0, committed).flat();
  expect(await repos.events.listByMatch('m1')).toEqual(expectedEvents);
  if (committed === 0) {
    expect(await repos.matches.get('m1')).toBeNull();
    expect(await countRows(db, 'match_players')).toBe(0);
  } else {
    const projection = await readMatchProjection(db, 'm1');
    expect(projection?.updatedAt).toBe(isoAt(committed));
    expect(projection?.innings[0].runs).toBe(committed);
  }
  expect(await foreignKeyRows(db)).toEqual([]);
}

describe('crash sweep over the golden scoring flow (FR-02a, FR-01a/b/c)', () => {
  it('recovers to an action-group boundary after a crash at every statement of every use case', async () => {
    const base = await baseImage();
    const reference = await createFaultInjectingDatabase({ data: base, captureDurableImages: false });
    const imagesBefore: Uint8Array[] = [];
    const statementCounts: number[] = [];
    for (let index = 0; index < GROUPS.length; index += 1) {
      imagesBefore.push(await reference.exportAsync());
      reference.clearLog();
      await inTransaction(reference, useCase(index));
      statementCounts.push(reference.statementLog.length);
    }
    expect(await createRepositories(reference).events.listByMatch('m1')).toEqual(LOG);
    const started = performance.now();
    let crashes = 0;
    let retries = 0;
    for (let index = 0; index < GROUPS.length; index += 1) {
      for (let statement = 1; statement <= statementCounts[index]; statement += 1) {
        const db: FaultInjectingDatabase = await createFaultInjectingDatabase({ data: imagesBefore[index], captureDurableImages: false });
        db.crashAt({ sql: /[\s\S]*/, occurrence: statement });
        await expect(inTransaction(db, useCase(index))).rejects.toMatchObject({ name: 'SimulatedCrash' });
        expect(db.crashed).toBe(true);
        const reopened = await createSqlJsDatabase({ data: db.lastDurableImage() });
        await db.closeAsync();
        await expectCommittedActions(reopened, index);
        crashes += 1;
        if (statement === 1 || statement === statementCounts[index]) {
          await inTransaction(reopened, useCase(index));
          await expectCommittedActions(reopened, index + 1);
          retries += 1;
        }
        await reopened.closeAsync();
      }
    }
    const elapsed = performance.now() - started;
    console.log(`FR-02a crash sweep: ${crashes} crash points (${retries} retried) over ${GROUPS.length} use cases in ${elapsed.toFixed(0)} ms (budget 60000 ms, asserted 180000 ms)`);
    expect(crashes).toBe(statementCounts.reduce((sum, count) => sum + count, 0));
    expect(crashes).toBeGreaterThan(GROUPS.length * 8);
    expect(retries).toBe(GROUPS.length * 2);
    expect(elapsed).toBeLessThan(180000);
  }, 240000);

  it('keeps a committed ball when the process dies right after COMMIT (FR-01c)', async () => {
    const db = await createFaultInjectingDatabase({ data: await baseImage() });
    await inTransaction(db, useCase(0));
    await inTransaction(db, useCase(1));
    db.crashAt({ sql: /[\s\S]*/, occurrence: 1 });
    await expect(createRepositories(db).matches.findResumable({ forPrompt: true })).rejects.toMatchObject({ name: 'SimulatedCrash' });
    const reopened = await createSqlJsDatabase({ data: db.durableImages[db.durableImages.length - 1] });
    await expectCommittedActions(reopened, 2);
    const resumable = await createRepositories(reopened).matches.findResumable({ forPrompt: true });
    expect(resumable.map((item) => item.id)).toEqual(['m1']);
    expect(await createRepositories(reopened).events.lastSeq('m1')).toBe(2);
  });

  it('creates no match, squad or event rows when match creation crashes at the opening event (FR-01g)', async () => {
    const db = await createFaultInjectingDatabase({ data: await baseImage() });
    db.crashAt({ sql: /INSERT INTO match_events/ });
    await expect(inTransaction(db, useCase(0))).rejects.toMatchObject({ name: 'SimulatedCrash' });
    const reopened = await createSqlJsDatabase({ data: db.durableImages[db.durableImages.length - 1] });
    expect(await countRows(reopened, 'matches')).toBe(0);
    expect(await countRows(reopened, 'match_players')).toBe(0);
    expect(await countRows(reopened, 'teams')).toBe(2);
  });
});

describe('tournament use cases are atomic (FR-01d, FR-15)', () => {
  async function liveTournamentMatch(): Promise<FaultInjectingDatabase> {
    const db = await createFaultInjectingDatabase();
    await runMigrations(db, { now: () => isoAt(0) });
    await seedLibrary(db, [lions, tigers]);
    await seedBareTournament(db, 't1', ['lio', 'tig']);
    await db.withTransactionAsync(async (tx) => {
      const repos = createRepositories(tx);
      await repos.tournaments.insertFixtures([
        buildFixture({ id: 'f1', tournamentId: 't1', stageId: 't1-groups', poolId: 't1-pool', sideA: teamSide('lio'), sideB: teamSide('tig'), status: 'live', matchId: 'm1' }),
      ]);
      await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live', tournamentId: 't1', fixtureId: 'f1' }), squadsFor(lions, tigers));
      await repos.events.append(LOG.slice(0, -1));
      await repos.matches.writeProjection(progress(GROUPS.length - 1));
      await repos.tournaments.bumpRevision('t1');
    });
    return db;
  }

  const confirmResult: UseCase = async (repos) => {
    const at = isoAt(5000);
    const fixture = (await repos.tournaments.getSnapshot('t1', 1))?.fixtures[0];
    if (fixture === undefined) {
      throw new Error('fixture missing');
    }
    await repos.events.append(LOG.slice(-1));
    await repos.matches.writeProjection(goldenProjection(golden, { projectionVersion: 1, teamAId: 'lio', at, completed: true }));
    await repos.tournaments.updateFixture({ ...fixture, status: 'completed', updatedAt: at });
    await repos.tournaments.upsertStages([buildStage({ id: 't1-groups', tournamentId: 't1', status: 'completed', updatedAt: at })]);
    await repos.tournaments.bumpRevision('t1');
    await repos.tournaments.writeChampion('t1', ['tig']);
    const audit: AuditEvent = {
      id: 'audit-result',
      tournamentId: 't1',
      matchId: 'm1',
      action: 'result_recorded',
      entityType: 'match',
      entityId: 'm1',
      summary: 'Tigers won by 9 wickets (4 balls left)',
      previousValue: null,
      newValue: null,
      reason: null,
      impact: null,
      createdAt: at,
    };
    await repos.audit.append(audit);
  };

  async function tournamentState(db: SqlExecutor): Promise<Record<string, unknown>> {
    const repos = createRepositories(db);
    const snapshot = await repos.tournaments.getSnapshot('t1', 1);
    return {
      version: snapshot?.version,
      fixtureStatus: snapshot?.fixtures[0].status,
      stageStatus: snapshot?.stages[0].status,
      summaries: Object.keys(snapshot?.summaries ?? {}),
      matchStatus: (await repos.matches.get('m1'))?.status,
      lastSeq: await repos.events.lastSeq('m1'),
      champion: (await repos.tournaments.list())[0].championName,
      audit: await countRows(db, 'audit_events'),
    };
  }

  it('leaves no trace of a match completion that crashes at its audit row, and succeeds when retried', async () => {
    const db = await liveTournamentMatch();
    const before = await tournamentState(db);
    expect(before).toEqual({
      version: '1',
      fixtureStatus: 'live',
      stageStatus: 'pending',
      summaries: [],
      matchStatus: 'live',
      lastSeq: LOG.length - 1,
      champion: null,
      audit: 0,
    });
    db.crashAt({ sql: /INSERT INTO audit_events/ });
    await expect(inTransaction(db, confirmResult)).rejects.toMatchObject({ name: 'SimulatedCrash' });
    const reopened = await createSqlJsDatabase({ data: db.durableImages[db.durableImages.length - 1] });
    expect(await tournamentState(reopened)).toEqual(before);
    await inTransaction(reopened, confirmResult);
    expect(await tournamentState(reopened)).toEqual({
      version: '2',
      fixtureStatus: 'completed',
      stageStatus: 'completed',
      summaries: ['m1'],
      matchStatus: 'completed',
      lastSeq: LOG.length,
      champion: 'Tigers',
      audit: 1,
    });
    expect(await foreignKeyRows(reopened)).toEqual([]);
  });

  it('rolls back a failed COMMIT of a match completion and keeps the match live (FR-07c)', async () => {
    const db = await liveTournamentMatch();
    const before = await tournamentState(db);
    db.failOnCommit(1);
    const error = await inTransaction(db, confirmResult).catch((e: unknown) => e);
    expect(sqliteErrorKind(error)).toBe('io');
    expect(await tournamentState(db)).toEqual(before);
    await inTransaction(db, confirmResult);
    expect((await tournamentState(db)).matchStatus).toBe('completed');
  });

  it('deletes nothing when a tournament delete dies at the fifth match (FR-15)', async () => {
    const db = await createFaultInjectingDatabase();
    await runMigrations(db, { now: () => isoAt(0) });
    await seedTournamentScenario(db, buildTournamentScenario('cup', 1));
    const footprint = await createRepositories(db).tournaments.deletionFootprint('cup');
    const counts = async (target: SqlExecutor): Promise<number[]> =>
      Promise.all(['tournaments', 'fixtures', 'matches', 'match_events', 'audit_events'].map((table) => countRows(target, table)));
    const before = await counts(db);
    db.crashAt({ sql: /DELETE FROM matches/, occurrence: 5 });
    await expect(
      inTransaction(db, async (repos) => {
        for (const matchId of await repos.tournaments.listMatchIds('cup')) {
          await repos.matches.delete(matchId);
        }
        await repos.tournaments.delete('cup');
      }),
    ).rejects.toMatchObject({ name: 'SimulatedCrash' });
    const reopened = await createSqlJsDatabase({ data: db.durableImages[db.durableImages.length - 1] });
    expect(await createRepositories(reopened).tournaments.deletionFootprint('cup')).toEqual(footprint);
    expect(await counts(reopened)).toEqual(before);
  });
});

describe('storage failures surface and leave the database unchanged (FR-07a/b)', () => {
  it('rejects a ball on SQLITE_FULL without writing anything and records it with the same seq on retry', async () => {
    const db = await createFaultInjectingDatabase({ data: await baseImage(), captureDurableImages: false });
    for (let index = 0; index < 10; index += 1) {
      await inTransaction(db, useCase(index));
    }
    const repos = createRepositories(db);
    const lastSeq = await repos.events.lastSeq('m1');
    const projection = await readMatchProjection(db, 'm1');
    db.failOn({ sql: /INSERT INTO match_events/, error: sqliteError('SQLITE_FULL') });
    const error = await inTransaction(db, useCase(10)).catch((e: unknown) => e);
    expect(sqliteErrorKind(error)).toBe('full');
    expect(await repos.events.lastSeq('m1')).toBe(lastSeq);
    expect(await readMatchProjection(db, 'm1')).toEqual(projection);
    db.clearFaults();
    await inTransaction(db, useCase(10));
    expect(await repos.events.lastSeq('m1')).toBe(GROUPS[10][GROUPS[10].length - 1].seq);
    expect((await repos.events.listByMatch('m1')).slice(lastSeq)).toEqual(GROUPS[10]);
  });

  it('refuses a stale writer of the same seq through the log tail check and UNIQUE(match_id, seq) (FR-12)', async () => {
    const db = await createFaultInjectingDatabase({ data: await baseImage(), captureDurableImages: false });
    for (let index = 0; index < 5; index += 1) {
      await inTransaction(db, useCase(index));
    }
    const stale: MatchEvent[] = GROUPS[5].map((event) => ({ ...event, id: `other-${event.id}` }));
    await inTransaction(db, useCase(5));
    const error = await inTransaction(db, async (repos) => repos.events.append(stale)).catch((e: unknown) => e);
    expect(sqliteErrorKind(error)).toBe('unique');
    expect(await createRepositories(db).events.listByMatch('m1')).toEqual(GROUPS.slice(0, 6).flat());
  });
});

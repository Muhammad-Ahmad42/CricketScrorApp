/** @jest-environment node */
import { scoreRuns, selectBowler, SCORING_PROJECTION_VERSION, wide } from '@/domain/scoring';
import { createFaultInjectingDatabase, createSqlJsDatabase, sqliteError, type FaultInjectingDatabase } from '@/db/testing';
import { createTestApp, type TestApp } from '../testing';
import { bootstrapped, expectFailure, expectOk, openHarness, rowCount } from './support/app';
import { createLeague } from './support/league';
import { live, score, scoreAll } from './support/scoring';
import { standaloneWorld, type StandaloneWorld } from './support/standalone';
import { squadsFor } from './support/tournament';

interface FaultHarness {
  readonly db: FaultInjectingDatabase;
  readonly app: TestApp;
  readonly world: StandaloneWorld;
}

async function faultHarness(): Promise<FaultHarness> {
  const db = await createFaultInjectingDatabase();
  const app = createTestApp(db);
  await bootstrapped(app);
  const world = await standaloneWorld(app);
  return { db, app, world };
}

async function reopenFromDurableImage(harness: FaultHarness): Promise<TestApp> {
  const db = await createSqlJsDatabase({ data: harness.db.lastDurableImage() });
  const app = createTestApp(db, { clock: harness.app.deps.clock });
  await bootstrapped(app);
  return app;
}

describe('crash and storage failure inside a use case (FR-01, FR-07)', () => {
  it('FR-01a a crash while inserting the ball leaves no trace and the ball can be recorded again', async () => {
    const harness = await faultHarness();
    const created = await harness.world.start(harness.app);
    const afterOne = await score(harness.app, created.match.id, scoreRuns(1));
    harness.db.crashAt({ sql: /INSERT INTO match_events/ });
    const loaded = await live(harness.app, created.match.id);
    const result = await harness.app.matches.record(created.match.id, loaded.state.lastSeq, [
      { kind: 'delivery', strikerId: harness.world.lions.p(2), nonStrikerId: harness.world.lions.p(1), bowlerId: harness.world.tigers.p(7), runsRun: 0, shortRuns: 0, boundary: 4, wicket: null, call: 'fair', runsTo: 'bat' },
    ]);
    expect(result.ok).toBe(false);
    const reopened = await reopenFromDurableImage(harness);
    const recovered = await live(reopened, created.match.id);
    expect(recovered.state.lastSeq).toBe(afterOne.lastSeq);
    expect(recovered.state.innings[0].runs).toBe(1);
    const state = await score(reopened, created.match.id, scoreRuns(4));
    expect(state.lastSeq).toBe(afterOne.lastSeq + 1);
    expect(state.innings[0].runs).toBe(5);
  });

  it('FR-01b a crash at the projection update after the event insert loses both', async () => {
    const harness = await faultHarness();
    const created = await harness.world.start(harness.app);
    await score(harness.app, created.match.id, scoreRuns(1));
    harness.db.crashAt({ sql: /^UPDATE matches SET status/ });
    const loaded = await live(harness.app, created.match.id);
    expect((await harness.app.matches.record(created.match.id, loaded.state.lastSeq, [{ kind: 'strike_swapped' }])).ok).toBe(false);
    const reopened = await reopenFromDurableImage(harness);
    expect((await live(reopened, created.match.id)).state.lastSeq).toBe(loaded.state.lastSeq);
  });

  it('FR-01g a crash while creating a match leaves no created-but-unstarted match', async () => {
    const harness = await faultHarness();
    harness.db.crashAt({ sql: /INSERT INTO match_events/ });
    expect((await harness.app.matches.createMatch(harness.world.input(), harness.world.opening())).ok).toBe(false);
    const reopened = await reopenFromDurableImage(harness);
    expect(expectOk(await reopened.matches.list({}))).toEqual([]);
  });

  it('FR-07a/b a full disk keeps the previous state, reports a human message and retries cleanly', async () => {
    const harness = await faultHarness();
    const created = await harness.world.start(harness.app);
    harness.db.failOn({ sql: /INSERT INTO match_events/, error: sqliteError('SQLITE_FULL') });
    const before = await live(harness.app, created.match.id);
    const result = await harness.app.matches.record(created.match.id, before.state.lastSeq, [
      { kind: 'delivery', strikerId: harness.world.lions.p(1), nonStrikerId: harness.world.lions.p(2), bowlerId: harness.world.tigers.p(7), runsRun: 1, shortRuns: 0, boundary: 0, wicket: null, call: 'fair', runsTo: 'bat' },
    ]);
    const error = expectFailure(result, 'STORAGE');
    expect(error.message).toBe("Couldn't save this delivery. Your previous match data is still safe.");
    expect(error.message).not.toMatch(/SQLITE/);
    expect(error.detail).toMatch(/SQLITE_FULL/);
    expect(await live(harness.app, created.match.id)).toEqual(before);
    const retried = await score(harness.app, created.match.id, scoreRuns(1));
    expect(retried.lastSeq).toBe(before.state.lastSeq + 1);
  });

  it('FR-07c a failing commit while ending a match rolls everything back', async () => {
    const harness = await faultHarness();
    const created = expectOk(await harness.app.matches.createMatch(harness.world.input({ title: 'Walkover' })));
    harness.db.failOnCommit(1);
    const result = await harness.app.matches.endMatch(created.match.id, 0, { type: 'walkover', winnerTeamId: harness.world.lions.team.id, reason: null }, null);
    expectFailure(result, 'STORAGE');
    const after = await live(harness.app, created.match.id);
    expect(after.match.status).toBe('scheduled');
    expect(after.events).toEqual([]);
    const ended = expectOk(await harness.app.matches.endMatch(created.match.id, 0, { type: 'walkover', winnerTeamId: harness.world.lions.team.id, reason: null }, null));
    expect(ended.match.status).toBe('completed');
    expect(ended.state.resultText).toBe('Lions won by walkover');
  });

  it('FR-12 a stale second service instance gets CONFLICT', async () => {
    const harness = await openHarness();
    const world = await standaloneWorld(harness.app);
    const created = await world.start(harness.app);
    await scoreAll(harness.app, created.match.id, [scoreRuns(1), scoreRuns(2)]);
    const other = createTestApp(harness.db, { clock: harness.app.deps.clock });
    const seenByA = await live(harness.app, created.match.id);
    const seenByB = await live(other, created.match.id);
    await score(harness.app, created.match.id, scoreRuns(0));
    const result = await other.matches.record(created.match.id, seenByB.state.lastSeq, [
      { kind: 'delivery', strikerId: world.lions.p(2), nonStrikerId: world.lions.p(1), bowlerId: world.tigers.p(7), runsRun: 0, shortRuns: 0, boundary: 0, wicket: null, call: 'fair', runsTo: 'bat' },
    ]);
    expectFailure(result, 'CONFLICT');
    expect(seenByA.state.lastSeq).toBe(seenByB.state.lastSeq);
  });
});

describe('a tournament result is all or nothing (FR-01d)', () => {
  it('a crash at the audit insert of match_ended leaves the fixture, summary, revision and champion untouched', async () => {
    const db = await createFaultInjectingDatabase();
    const app = createTestApp(db);
    await bootstrapped(app);
    const league = await createLeague(app);
    const fixture = await league.fixture('Lions', 'Tigers');
    const [sideA, sideB] = league.sidesOf(fixture);
    const match = expectOk(
      await app.tournaments.startFixtureMatch(fixture.id, { squads: squadsFor(sideA, sideB), toss: { winnerTeamId: sideA.team.id, decision: 'bat' } }, [
        { kind: 'innings_started', inningsIndex: 0, battingTeamId: sideA.team.id, strikerId: sideA.p(1), nonStrikerId: sideA.p(2), bowlerId: sideB.p(6) },
      ]),
    );
    const revisionBefore = (await db.getFirstAsync<{ revision: number }>('SELECT revision FROM tournaments'))?.revision;
    db.crashAt({ sql: /INSERT INTO audit_events/ });
    const result = await app.matches.endMatch(match.id, 1, { type: 'abandoned', reason: 'Rain' }, 'Storm');
    expect(result.ok).toBe(false);
    const reopened = createTestApp(await createSqlJsDatabase({ data: db.lastDurableImage() }), { clock: app.deps.clock });
    await bootstrapped(reopened);
    const evaluated = expectOk(await reopened.tournaments.evaluate(league.tournamentId));
    expect(evaluated.snapshot.version).toBe(String(revisionBefore));
    expect(evaluated.snapshot.fixtures.find((entry) => entry.id === fixture.id)?.status).toBe('live');
    expect(evaluated.snapshot.summaries[match.id]).toBeUndefined();
    expect(evaluated.evaluation.progress.done).toBe(0);
    expect(expectOk(await reopened.matches.load(match.id)).match.status).toBe('live');
    expect(expectOk(await reopened.matches.endMatch(match.id, 1, { type: 'abandoned', reason: 'Rain' }, 'Storm')).match.status).toBe('abandoned');
  });
});

describe('degraded logs and stale projections (FR-05, FR-16)', () => {
  it('FR-05a/b/c refuses writes to a damaged log, reports it at bootstrap and repairs it with a history edit', async () => {
    const harness = await openHarness();
    const world = await standaloneWorld(harness.app);
    const created = await world.start(harness.app);
    const matchId = created.match.id;
    await scoreAll(harness.app, matchId, [scoreRuns(1), scoreRuns(4), wide(), scoreRuns(0), scoreRuns(2), scoreRuns(6), scoreRuns(1)]);
    await score(harness.app, matchId, selectBowler(world.tigers.p(8)));
    await scoreAll(harness.app, matchId, [scoreRuns(0), scoreRuns(1)]);
    const bowlerEvent = (await live(harness.app, matchId)).events.find((event) => event.kind === 'bowler_selected');
    if (bowlerEvent === undefined) {
      throw new Error('bowler event missing');
    }
    await harness.db.runAsync("UPDATE match_events SET payload_json = json_set(payload_json, '$.bowlerId', ?) WHERE id = ?", [world.lions.p(7), bowlerEvent.id]);
    const updatedBefore = await harness.db.getFirstAsync<{ updated_at: string }>('SELECT updated_at FROM matches WHERE id = ?', [matchId]);
    const damaged = await live(harness.app, matchId);
    expect(damaged.state.needsRepair).toBe(true);
    const errors = damaged.state.issues.filter((issue) => issue.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]).toMatchObject({ seq: bowlerEvent.seq, code: 'PLAYER_WRONG_SIDE' });
    expect(damaged.state.lastSeq).toBe(damaged.events.length);
    expect(damaged.state.canRecordDelivery).toBe(false);
    const refused = expectFailure(await harness.app.matches.record(matchId, damaged.state.lastSeq, [{ kind: 'strike_swapped' }]), 'FORBIDDEN_STATE');
    expect(refused.message).toMatch(/needs repair/);
    expectFailure(await harness.app.matches.undo(matchId, damaged.state.lastSeq), 'FORBIDDEN_STATE');
    expectFailure(await harness.app.matches.rebuildProjections(matchId), 'FORBIDDEN_STATE');
    expect(await harness.db.getFirstAsync('SELECT updated_at FROM matches WHERE id = ?', [matchId])).toEqual(updatedBefore);
    const report = expectOk(await harness.app.bootstrap());
    expect(report.integrityIssues.map((issue) => issue.matchId)).toEqual([matchId]);
    const integrity = expectOk(await harness.app.checkIntegrity());
    expect(integrity).toMatchObject({ foreignKeyViolations: 0, matchesNeedingRepair: [matchId] });
    const ops = [{ op: 'replace' as const, seq: bowlerEvent.seq, with: [{ kind: 'bowler_selected' as const, bowlerId: world.tigers.p(8), reason: 'over_start' as const }] }];
    const preview = expectOk(await harness.app.matches.previewHistoryEdit(matchId, ops));
    expect(preview.requiresReason).toBe(false);
    const repaired = expectOk(await harness.app.matches.applyHistoryEdit(matchId, ops, 'Wrong bowler stored', preview.baseFingerprint));
    expect(repaired.state.needsRepair).toBe(false);
    expect(await rowCount(harness.db, 'audit_events', "action = 'match_history_edited' AND match_id = ?", [matchId])).toBe(1);
    expect(expectOk(await harness.app.checkIntegrity()).matchesNeedingRepair).toEqual([]);
  });

  it('a history edit of a live match is audited without needing a reason', async () => {
    const harness = await openHarness();
    const world = await standaloneWorld(harness.app);
    const created = await world.start(harness.app);
    const state = await scoreAll(harness.app, created.match.id, [scoreRuns(1), scoreRuns(2)]);
    const loaded = await live(harness.app, created.match.id);
    const two = loaded.events[loaded.events.length - 1];
    if (two.kind !== 'delivery' || two.call === 'wide') {
      throw new Error('delivery expected');
    }
    const ops = [{ op: 'replace' as const, seq: two.seq, with: [{ ...two, runsRun: 3 }] }].map((op) => ({
      ...op,
      with: op.with.map(({ id: _id, matchId: _matchId, seq: _seq, actionId: _actionId, recordedAt: _recordedAt, ...payload }) => payload),
    }));
    const preview = expectOk(await harness.app.matches.previewHistoryEdit(created.match.id, ops));
    expect(preview.requiresReason).toBe(false);
    const edited = expectOk(await harness.app.matches.applyHistoryEdit(created.match.id, ops, null, preview.baseFingerprint));
    expect(edited.state.innings[0].runs).toBe(state.innings[0].runs + 1);
    const audit = await harness.db.getAllAsync<{ action: string; reason: string | null }>('SELECT action, reason FROM audit_events');
    expect(audit).toEqual([{ action: 'match_history_edited', reason: null }]);
  });

  it('FR-05f bootstrap rebuilds projections written by an older engine', async () => {
    const harness = await openHarness();
    const world = await standaloneWorld(harness.app);
    const first = await world.start(harness.app);
    const second = await world.start(harness.app);
    await scoreAll(harness.app, first.match.id, [scoreRuns(1), scoreRuns(4)]);
    await harness.db.runAsync('UPDATE matches SET projection_version = 0');
    await harness.db.runAsync("UPDATE innings SET runs = 99 WHERE match_id = ?", [first.match.id]);
    const report = expectOk(await harness.app.bootstrap());
    expect(report.projectionsRebuilt).toBe(2);
    expect(await rowCount(harness.db, 'matches', 'projection_version = ?', [SCORING_PROJECTION_VERSION])).toBe(2);
    expect(await harness.db.getFirstAsync('SELECT runs FROM innings WHERE match_id = ?', [first.match.id])).toEqual({ runs: 5 });
    expect(second.match.id).not.toBe(first.match.id);
  });

  it('FR-05e rebuildProjections restores a tampered summary', async () => {
    const harness = await openHarness();
    const world = await standaloneWorld(harness.app);
    const created = expectOk(await harness.app.matches.createMatch(world.input()));
    expectOk(await harness.app.matches.endMatch(created.match.id, 0, { type: 'walkover', winnerTeamId: world.tigers.team.id, reason: 'No show' }, null));
    const original = await harness.db.getFirstAsync<{ summary_json: string }>('SELECT summary_json FROM matches WHERE id = ?', [created.match.id]);
    await harness.db.runAsync("UPDATE matches SET summary_json = json_set(summary_json, '$.winnerTeamId', ?) WHERE id = ?", [world.lions.team.id, created.match.id]);
    expectOk(await harness.app.matches.rebuildProjections(created.match.id));
    expect(await harness.db.getFirstAsync('SELECT summary_json FROM matches WHERE id = ?', [created.match.id])).toEqual(original);
  });
});

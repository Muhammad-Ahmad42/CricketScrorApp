/** @jest-environment node */
import { currentInnings, scoreRuns, selectBowler, wicket, type ScoringIntent } from '@/domain/scoring';
import { createFaultInjectingDatabase, sqliteError } from '@/db/testing';
import { createTestApp } from '@/services/testing';
import { standaloneWorld, type StandaloneWorld } from '@/services/__tests__/support/standalone';
import { createLeague } from '@/services/__tests__/support/league';
import { squadsFor } from '@/services/__tests__/support/tournament';
import { planInningsBalls } from '@/domain/scoring/testing';
import { useLiveMatchStore, useTournamentStore } from '@/stores';
import { setAppServices } from '@/stores/services';
import { expectValue, storeHarness, type StoreHarness } from './support/harness';

jest.setTimeout(60000);

let harness: StoreHarness;
let world: StandaloneWorld;
let matchId: string;

const store = () => useLiveMatchStore.getState();

async function openFreshMatch(): Promise<void> {
  harness = await storeHarness();
  world = await standaloneWorld(harness.app);
  matchId = (await world.start(harness.app)).match.id;
  expect(await store().open(matchId)).toBe(true);
}

describe('useLiveMatchStore', () => {
  beforeEach(openFreshMatch);

  it('opens a match and publishes the replayed state', () => {
    expect(store()).toMatchObject({ matchId, status: 'ready', error: null, redoStack: [] });
    expect(store().live?.state.lastSeq).toBe(1);
  });

  it('FR-11 serialises taps: two quick dispatches record two balls in order', async () => {
    const results = await Promise.all([store().dispatch(scoreRuns(1)), store().dispatch(scoreRuns(1))]);
    expect(results).toEqual([true, true]);
    const live = store().live;
    expect(live?.state.lastSeq).toBe(3);
    expect(live?.events.map((event) => event.seq)).toEqual([1, 2, 3]);
    const deliveries = live?.events.filter((event) => event.kind === 'delivery') ?? [];
    expect(deliveries.map((event) => (event.kind === 'delivery' ? event.strikerId : null))).toEqual([world.lions.p(1), world.lions.p(2)]);
    expect(harness.cues).toEqual(['run', 'run']);
    const persisted = expectValue(await harness.app.matches.load(matchId));
    expect(persisted.state).toEqual(live?.state);
    expect(live?.match.status).toBe('live');
  });

  it('pushes undone groups on the redo stack and clears it on the next dispatch', async () => {
    await store().dispatch(scoreRuns(4));
    await store().dispatch(scoreRuns(1));
    expect(await store().undo()).toBe(true);
    expect(store().redoStack).toHaveLength(1);
    expect(currentInnings(store().live?.state ?? expectValue(await harness.app.matches.load(matchId)).state)?.runs).toBe(4);
    expect(await store().redo()).toBe(true);
    expect(store().redoStack).toHaveLength(0);
    expect(store().live?.state.innings[0].runs).toBe(5);
    expect(await store().undo()).toBe(true);
    expect(await store().dispatch(scoreRuns(2))).toBe(true);
    expect(store().redoStack).toEqual([]);
    expect(harness.cues).toEqual(['four', 'run', 'undo', 'undo', 'undo', 'run']);
  });

  it('FR-13 redo with an empty stack resolves false without an error', async () => {
    expect(await store().redo()).toBe(false);
    expect(store().error).toBeNull();
  });

  it('open clears the redo stack', async () => {
    await store().dispatch(scoreRuns(1));
    await store().undo();
    expect(store().redoStack).toHaveLength(1);
    await store().open(matchId);
    expect(store().redoStack).toEqual([]);
  });

  it('surfaces a refused intent as a ServiceError and keeps the state', async () => {
    const before = store().live;
    expect(await store().dispatch(selectBowler(world.lions.p(5)))).toBe(false);
    expect(store().error).toMatchObject({ code: 'VALIDATION', domainCode: expect.any(String) });
    expect(store().live).toBe(before);
    expect(harness.cues).toEqual(['error']);
    store().clearError();
    expect(store().error).toBeNull();
  });

  it('FR-12 reloads on CONFLICT, clears redo and reports the error', async () => {
    await store().dispatch(scoreRuns(1));
    await store().undo();
    const other = createTestApp(harness.db, { clock: harness.app.deps.clock });
    const loaded = expectValue(await other.matches.load(matchId));
    expectValue(
      await other.matches.record(matchId, loaded.state.lastSeq, [
        { kind: 'delivery', strikerId: world.lions.p(1), nonStrikerId: world.lions.p(2), bowlerId: world.tigers.p(7), runsRun: 0, shortRuns: 0, boundary: 6, wicket: null, call: 'fair', runsTo: 'bat' },
      ]),
    );
    expect(await store().dispatch(scoreRuns(1))).toBe(false);
    expect(store().error?.code).toBe('CONFLICT');
    expect(store().redoStack).toEqual([]);
    expect(store().live?.state.innings[0].runs).toBe(6);
    expect(await store().dispatch(scoreRuns(1))).toBe(true);
  });

  it('previews and applies a history edit with the kept preview, then reloads on a stale preview', async () => {
    await store().dispatch(scoreRuns(1));
    const event = store().live?.events.find((entry) => entry.kind === 'delivery');
    if (event === undefined || event.kind !== 'delivery' || event.call === 'wide') {
      throw new Error('delivery expected');
    }
    const ops = [{ op: 'replace' as const, seq: event.seq, with: [{ kind: 'delivery' as const, strikerId: event.strikerId, nonStrikerId: event.nonStrikerId, bowlerId: event.bowlerId, runsRun: 3, shortRuns: 0, boundary: 0 as const, wicket: null, call: 'fair' as const, runsTo: 'bat' as const }] }];
    const preview = await store().previewHistoryEdit(ops);
    expect(preview?.requiresReason).toBe(false);
    if (preview === null) {
      throw new Error('preview expected');
    }
    await store().dispatch(scoreRuns(0));
    expect(await store().applyHistoryEdit(ops, null, preview)).toBe(false);
    expect(store().error?.code).toBe('CONFLICT');
    const fresh = await store().previewHistoryEdit(ops);
    if (fresh === null) {
      throw new Error('preview expected');
    }
    expect(await store().applyHistoryEdit(ops, null, fresh)).toBe(true);
    expect(store().live?.state.innings[0].runs).toBe(3);
    expect(harness.cues[harness.cues.length - 1]).toBe('confirm');
    const audit = await store().loadAudit({ limit: 10 });
    expect(audit?.map((entry) => entry.action)).toEqual(['match_history_edited']);
  });

  it('publishes an edit conflict with its resolutions and applies exactly the previewed ops (wave-3 bug #2)', async () => {
    await store().dispatch(scoreRuns(1));
    await store().dispatch(scoreRuns(0));
    await store().dispatch(wicket({ dismissal: 'bowled', nextBatterId: world.lions.p(3) }));
    const first = store().live?.events.find((entry) => entry.kind === 'delivery');
    if (first === undefined || first.kind !== 'delivery' || first.call === 'wide') {
      throw new Error('delivery expected');
    }
    const ops = [{ op: 'replace' as const, seq: first.seq, with: [{ kind: 'delivery' as const, strikerId: first.strikerId, nonStrikerId: first.nonStrikerId, bowlerId: first.bowlerId, runsRun: 0, shortRuns: 0, boundary: 0 as const, wicket: null, call: 'fair' as const, runsTo: 'bat' as const }] }];
    expect(await store().previewHistoryEdit(ops)).toBeNull();
    const conflict = store().editConflict;
    expect(conflict?.code).toBe('DISMISSED_PLAYER_NOT_AT_CREASE');
    expect(conflict?.ballLabel).toBe('0.3');
    expect(store().error).toMatchObject({ code: 'VALIDATION', message: conflict?.message, domainCode: 'DISMISSED_PLAYER_NOT_AT_CREASE' });
    const keep = conflict?.resolutions.find((resolution) => resolution.kind === 'keep_strike');
    if (keep === undefined) {
      throw new Error('keep_strike expected');
    }
    store().clearError();
    expect(store().editConflict).toEqual(conflict);
    const preview = await store().previewHistoryEdit(keep.ops);
    expect(store().editConflict).toBeNull();
    if (preview === null) {
      throw new Error('preview expected');
    }
    expect(preview.ops).toEqual(keep.ops);
    expect(await store().applyHistoryEdit(ops, null, preview)).toBe(true);
    const batting = store().live?.state.innings[0].batting ?? [];
    expect(batting.find((row) => row.playerId === world.lions.p(2))?.status).toBe('out');
    expect(batting.find((row) => row.playerId === world.lions.p(1))?.runs).toBe(0);
    expect(store().live?.state.innings[0].runs).toBe(0);
  });

  it('clearEditConflict dismisses the conflict and its error together', async () => {
    await store().dispatch(scoreRuns(1));
    await store().dispatch(scoreRuns(0));
    await store().dispatch(wicket({ dismissal: 'bowled', nextBatterId: world.lions.p(3) }));
    const first = store().live?.events.find((entry) => entry.kind === 'delivery');
    if (first === undefined || first.kind !== 'delivery' || first.call === 'wide') {
      throw new Error('delivery expected');
    }
    const ops = [{ op: 'replace' as const, seq: first.seq, with: [{ kind: 'delivery' as const, strikerId: first.strikerId, nonStrikerId: first.nonStrikerId, bowlerId: first.bowlerId, runsRun: 0, shortRuns: 0, boundary: 0 as const, wicket: null, call: 'fair' as const, runsTo: 'bat' as const }] }];
    expect(await store().previewHistoryEdit(ops)).toBeNull();
    expect(store().editConflict).not.toBeNull();
    store().clearEditConflict?.();
    expect(store().editConflict).toBeNull();
    expect(store().error).toBeNull();
  });

  it('manages squad, details, toss and rules through the queue', async () => {
    expect(await store().addSquadPlayer(world.lions.team.id, { newPlayer: { name: 'Fresh Face' } }, { isSubstitute: true })).toBe(true);
    expect(store().live?.setup.players.some((player) => player.name === 'Fresh Face' && player.isSubstitute)).toBe(true);
    const added = store().live?.setup.players.find((player) => player.name === 'Fresh Face');
    expect(await store().removeSquadPlayer(added?.playerId ?? '')).toBe(true);
    expect(store().live?.setup.players.some((player) => player.name === 'Fresh Face')).toBe(false);
    expect(await store().updateDetails({ title: 'Derby' })).toBe(true);
    expect(store().live?.match.title).toBe('Derby');
    expect(await store().setToss({ winnerTeamId: world.tigers.team.id, decision: 'bowl' }, null)).toBe(false);
    expect(store().error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(await store().setToss({ winnerTeamId: world.tigers.team.id, decision: 'bowl' }, 'Captain called wrongly')).toBe(true);
    expect(store().live?.setup.toss).toEqual({ winnerTeamId: world.tigers.team.id, decision: 'bowl' });
    expect(await store().updateRules({ teamSizes: { teamAPlayers: 9, teamBPlayers: null } }, 'Short of players')).toBe(true);
    expect(store().live?.setup.teams[0].playersInSide).toBe(9);
    expect(await store().setPrePlayStatus('postponed', null)).toBe(false);
    expect(store().error?.code).toBe('FORBIDDEN_STATE');
  });

  it('close resets the store', async () => {
    store().close();
    expect(store()).toMatchObject({ matchId: null, live: null, status: 'idle' });
    expect(await store().dispatch(scoreRuns(1))).toBe(false);
    expect(store().error?.code).toBe('NOT_FOUND');
  });
});

describe('storage failures (FR-07a)', () => {
  it('keeps the previous state, drops the queued taps and lets the scorer try again', async () => {
    const db = await createFaultInjectingDatabase();
    harness = await storeHarness();
    const faultApp = createTestApp(db);
    expectValue(await faultApp.bootstrap());
    setAppServices(faultApp);
    world = await standaloneWorld(faultApp);
    matchId = (await world.start(faultApp)).match.id;
    await store().open(matchId);
    const before = store().live;
    db.failOn({ sql: /INSERT INTO match_events/, error: sqliteError('SQLITE_FULL') });
    const results = await Promise.all([store().dispatch(scoreRuns(1)), store().dispatch(scoreRuns(2)), store().dispatch(scoreRuns(3))]);
    expect(results).toEqual([false, false, false]);
    expect(store().error).toMatchObject({ code: 'STORAGE', message: "Couldn't save this delivery. Your previous match data is still safe." });
    expect(store().live).toEqual(before);
    expect(expectValue(await faultApp.matches.load(matchId)).state.lastSeq).toBe(1);
    expect(await store().dispatch(scoreRuns(1))).toBe(true);
    expect(store().live?.state.lastSeq).toBe(2);
  });
});

async function playThroughStore(intents: () => ScoringIntent | null): Promise<void> {
  for (let guard = 0; guard < 200; guard += 1) {
    const live = store().live;
    const pending = live?.state.pendingAction;
    if (pending?.type === 'select_next_bowler') {
      await store().dispatch(selectBowler(pending.eligible[0]));
      continue;
    }
    if (pending?.type === 'select_next_batter') {
      await store().dispatch({ type: 'batter_in', playerId: pending.candidates[0], position: pending.position });
      continue;
    }
    const next = intents();
    if (next === null) {
      return;
    }
    expect(await store().dispatch(next)).toBe(true);
  }
}

describe('tournament refresh after match completion (§66)', () => {
  it('refreshes the open tournament when its match ends through the store', async () => {
    harness = await storeHarness();
    const league = await createLeague(harness.app);
    const fixture = await league.fixture('Lions', 'Tigers');
    const [sideA, sideB] = league.sidesOf(fixture);
    expect(await useTournamentStore.getState().open(league.tournamentId)).toBe(true);
    const match = expectValue(
      await harness.app.tournaments.startFixtureMatch(fixture.id, { squads: squadsFor(sideA, sideB), toss: { winnerTeamId: sideA.team.id, decision: 'bat' } }, [
        { kind: 'innings_started', inningsIndex: 0, battingTeamId: sideA.team.id, strikerId: sideA.p(1), nonStrikerId: sideA.p(2), bowlerId: sideB.p(6) },
      ]),
    );
    await store().open(match.id);
    let queue: ('W' | number)[] = [...planInningsBalls({ runs: 20, wickets: 1, balls: 12 }, 5, null)];
    await playThroughStore(() => {
      const value = queue.shift();
      return value === undefined ? null : value === 'W' ? wicket({ dismissal: 'bowled' }) : scoreRuns(value);
    });
    await store().dispatch({ type: 'start_innings', strikerId: sideB.p(1), nonStrikerId: sideB.p(2), bowlerId: sideA.p(6), battingTeamId: sideB.team.id });
    queue = [...planInningsBalls({ runs: 10, wickets: 2, balls: 12 }, 5, 21)];
    await playThroughStore(() => {
      const value = queue.shift();
      return value === undefined ? null : value === 'W' ? wicket({ dismissal: 'bowled' }) : scoreRuns(value);
    });
    expect(store().live?.state.pendingAction?.type).toBe('confirm_result');
    const playedBefore = useTournamentStore.getState().evaluation?.stages[0].tables[0].rows.find((row) => row.teamId === sideA.team.id)?.played;
    expect(playedBefore).toBe(0);
    expect(await store().dispatch({ type: 'end_match', outcome: { type: 'natural' } })).toBe(true);
    expect(harness.cues[harness.cues.length - 1]).toBe('result');
    for (let attempt = 0; attempt < 20 && useTournamentStore.getState().evaluation?.stages[0].tables[0].rows.find((row) => row.teamId === sideA.team.id)?.played !== 1; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(useTournamentStore.getState().evaluation?.stages[0].tables[0].rows.find((row) => row.teamId === sideA.team.id)).toMatchObject({ played: 1, won: 1 });
    expect(store().live?.match.status).toBe('completed');
  });
});

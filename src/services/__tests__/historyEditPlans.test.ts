/** @jest-environment node */
import { buildEvents, type HistoryEditOp, type ScoringIntent } from '@/domain/scoring';
import { endMatch, expandSteps } from '@/domain/scoring/testing';
import type { DeliveryPayload, MatchEvent, MatchState } from '@/domain/types';
import type { LiveMatch } from '../contracts';
import { expectFailure, expectOk, openHarness, type Harness } from './support/app';
import { createLeague } from './support/league';
import { live } from './support/scoring';
import { standaloneWorld, type StandaloneWorld } from './support/standalone';
import { playFixture } from './support/tournament';

const FIRST_INNINGS = ['1 4 wd 0 2 6 1', '@T8 0 W>L3 1 nb1 0 lb1 2', '@T7 1 1 1 1 1 1'];
const CHASE = ['start:T1:T2:L10', '4 4 1 1 2 6', '@L11 1 0 W:c:L7>T3 2 1 4', '@L10 1 1'];

function idMap(world: StandaloneWorld): Readonly<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (let number = 1; number <= 12; number += 1) {
    ids[`L${number}`] = world.lions.p(number);
    ids[`T${number}`] = world.tigers.p(number);
  }
  return ids;
}

function mapped(intent: ScoringIntent, ids: Readonly<Record<string, string>>): ScoringIntent {
  return JSON.parse(JSON.stringify(intent), (_key, value: unknown) => (typeof value === 'string' && ids[value] !== undefined ? ids[value] : value));
}

async function play(harness: Harness, world: StandaloneWorld, matchId: string, steps: readonly string[]): Promise<MatchState> {
  const ids = idMap(world);
  let state: MatchState | null = null;
  for (const step of expandSteps(steps)) {
    const current = await live(harness.app, matchId);
    const intent = typeof step === 'function' ? step(current.state) : step;
    const built = buildEvents(current.setup, current.state, mapped(intent, ids));
    if (!built.ok) {
      throw new Error(`${built.code}: ${built.message}`);
    }
    state = expectOk(await harness.app.matches.record(matchId, current.state.lastSeq, built.events)).state;
  }
  if (state === null) {
    throw new Error('nothing played');
  }
  return state;
}

function ball(loaded: LiveMatch, inningsIndex: number, label: string): MatchEvent & DeliveryPayload {
  const record = loaded.state.innings[inningsIndex].balls.find((entry) => entry.label === label && entry.isLegal);
  const event = loaded.events.find((entry) => entry.id === record?.eventId);
  if (event === undefined || event.kind !== 'delivery') {
    throw new Error(`ball ${label} missing`);
  }
  return event;
}

function payload(event: MatchEvent & DeliveryPayload, patch: Partial<DeliveryPayload> = {}): DeliveryPayload {
  const { id: _id, matchId: _match, seq: _seq, actionId: _action, recordedAt: _recorded, ...rest } = event;
  return { ...rest, ...patch } as DeliveryPayload;
}

async function completedMatch(): Promise<{ readonly harness: Harness; readonly world: StandaloneWorld; readonly matchId: string }> {
  const harness = await openHarness();
  const world = await standaloneWorld(harness.app);
  const started = await world.start(harness.app);
  await play(harness, world, started.match.id, [...FIRST_INNINGS, ...CHASE]);
  const loaded = await live(harness.app, started.match.id);
  const built = buildEvents(loaded.setup, loaded.state, endMatch());
  if (!built.ok) {
    throw new Error(built.message);
  }
  expectOk(await harness.app.matches.record(started.match.id, loaded.state.lastSeq, built.events));
  return { harness, world, matchId: started.match.id };
}

describe('previewing a past-ball edit that un-wins a completed match (wave-3 bug #1)', () => {
  let harness: Harness;
  let matchId: string;
  let ops: readonly HistoryEditOp[];

  beforeAll(async () => {
    ({ harness, matchId } = await completedMatch());
    const loaded = await live(harness.app, matchId);
    expect(loaded.state.lifecycle).toBe('completed');
    ops = [{ op: 'replace', seq: ball(loaded, 0, '0.3').seq, with: [payload(ball(loaded, 0, '0.3'), { boundary: 4 })] }];
  });

  it('previews WHAT WILL CHANGE with the match reopened instead of refusing', async () => {
    const before = await live(harness.app, matchId);
    const preview = expectOk(await harness.app.matches.previewHistoryEdit(matchId, ops));
    const ended = before.events[before.events.length - 1];
    expect(ended.kind).toBe('match_ended');
    expect(preview.ops).toEqual([...ops, { op: 'delete', seq: ended.seq }]);
    expect(preview.resolutions?.map((resolution) => resolution.kind)).toEqual(['reopen_match']);
    expect(preview.requiresReason).toBe(true);
    expect(preview.outcome.after.lifecycle).toBe('live');
    expect(preview.consequences).toMatchObject({
      reopensMatch: true,
      resultBefore: before.state.resultText,
      targetChanges: [{ inningsIndex: 1, before: 28, after: 32 }],
    });
    expect(preview.consequences?.lines).toEqual([
      'The target for Tigers changes from 28 to 32.',
      `“${before.state.resultText}” no longer stands, so the match is reopened.`,
      'Tigers are 28/1 after 2.2 overs and need 4 runs from 4 balls.',
    ]);
    expect((await live(harness.app, matchId)).events).toEqual(before.events);
  });

  it('planHistoryEdit returns the same preview as ready', async () => {
    const plan = expectOk(await harness.app.matches.planHistoryEdit(matchId, ops));
    expect(plan.status).toBe('ready');
    if (plan.status === 'ready') {
      expect(plan.preview.consequences?.reopensMatch).toBe(true);
    }
  });

  it('applies with a reason, reopens the match and audits it as reopened', async () => {
    const preview = expectOk(await harness.app.matches.previewHistoryEdit(matchId, ops));
    expectFailure(await harness.app.matches.applyHistoryEdit(matchId, ops, null, preview.baseFingerprint), 'CONFIRMATION_REQUIRED');
    const applied = expectOk(await harness.app.matches.applyHistoryEdit(matchId, preview.ops ?? ops, 'Scorer missed a boundary', preview.baseFingerprint));
    expect(applied.state.lifecycle).toBe('live');
    expect(applied.match.status).toBe('live');
    expect(applied.match.result).toBeNull();
    expect(applied.match.completedAt).toBeNull();
    expect(applied.state.chase).toMatchObject({ target: 32, runsRequired: 4, ballsRemaining: 4 });
    const audit = expectOk(await harness.app.matches.auditLog(matchId, { limit: 5 }));
    expect(audit[0]).toMatchObject({ action: 'match_reopened', reason: 'Scorer missed a boundary', summary: 'Lions v Tigers: recorded balls were edited and the match was reopened.' });
    const resumable = expectOk(await harness.app.matches.findResumable());
    expect(resumable.map((item) => item.id)).toEqual([matchId]);
  });
});

describe('previewing a past-ball edit that breaks a later dismissal (wave-3 bug #2)', () => {
  let harness: Harness;
  let world: StandaloneWorld;
  let matchId: string;
  let ops: readonly HistoryEditOp[];

  beforeAll(async () => {
    ({ harness, world, matchId } = await completedMatch());
    const loaded = await live(harness.app, matchId);
    const single = ball(loaded, 1, '1.1');
    ops = [{ op: 'replace', seq: single.seq, with: [payload(single, { runsRun: 0 })] }];
  });

  it('planHistoryEdit names the later ball, the reason and the ways forward', async () => {
    const loaded = await live(harness.app, matchId);
    const plan = expectOk(await harness.app.matches.planHistoryEdit(matchId, ops));
    expect(plan.status).toBe('conflict');
    if (plan.status !== 'conflict') {
      return;
    }
    expect(plan.baseFingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(plan.conflict).toMatchObject({ code: 'DISMISSED_PLAYER_NOT_AT_CREASE', atSeq: ball(loaded, 1, '1.3').seq, ballLabel: '1.3', inningsIndex: 1 });
    expect(plan.conflict.message).toBe('Shan is now on strike for ball 1.3 of the 2nd innings, but it records Rizwan out caught.');
    expect(plan.conflict).toMatchObject({ headline: 'Wrong batter out on ball 1.3', detail: plan.conflict.message });
    expect(plan.conflict.resolutions.map((resolution) => resolution.kind)).toEqual(['keep_strike', 'dismiss_striker']);
    void world;
  });

  it('previewHistoryEdit fails with the same precise message', async () => {
    const failure = expectFailure(await harness.app.matches.previewHistoryEdit(matchId, ops), 'VALIDATION');
    expect(failure.message).toBe('Shan is now on strike for ball 1.3 of the 2nd innings, but it records Rizwan out caught.');
    expect(failure).toMatchObject({ headline: 'Wrong batter out on ball 1.3', supporting: failure.message });
    expect(failure.domainCode).toBe('DISMISSED_PLAYER_NOT_AT_CREASE');
  });

  it('a chosen resolution previews and applies', async () => {
    const plan = expectOk(await harness.app.matches.planHistoryEdit(matchId, ops));
    if (plan.status !== 'conflict') {
      throw new Error('conflict expected');
    }
    const keep = plan.conflict.resolutions[0];
    const preview = expectOk(await harness.app.matches.previewHistoryEdit(matchId, keep.ops));
    expect(preview.consequences?.reopensMatch).toBe(true);
    const applied = expectOk(await harness.app.matches.applyHistoryEdit(matchId, preview.ops ?? keep.ops, 'Batters did not cross', preview.baseFingerprint));
    expect(applied.state.innings[1].batting.find((row) => row.name === 'Rizwan')?.status).toBe('out');
    expect(applied.state.innings[1].runs).toBe(27);
  });
});

describe('previewing a past-ball edit that reopens a completed tournament match (wave-3 bug #1)', () => {
  it('shows the reopened match, the withdrawn fixture result and the standings change, then reopens the fixture', async () => {
    const harness = await openHarness();
    const league = await createLeague(harness.app);
    const fixture = await league.fixture('Lions', 'Tigers');
    const [sideA, sideB] = league.sidesOf(fixture);
    const played = await playFixture(
      harness.app,
      fixture,
      { battingFirst: sideA, fieldingFirst: sideB, first: { balls: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }, second: { balls: [4, 4, 4, 4] } },
      sideA,
      sideB,
    );
    const matchId = played.match.id;
    const loaded = await live(harness.app, matchId);
    expect(loaded.state.lifecycle).toBe('completed');
    const opener = ball(loaded, 0, '0.1');
    const ops: readonly HistoryEditOp[] = [{ op: 'replace', seq: opener.seq, with: [payload(opener, { runsRun: 0, boundary: 6 })] }];
    const plan = expectOk(await harness.app.matches.planHistoryEdit(matchId, ops));
    if (plan.status !== 'ready') {
      throw new Error(`ready expected, got ${plan.conflict.message}`);
    }
    const preview = plan.preview;
    expect(preview.resolutions?.map((resolution) => resolution.kind)).toEqual(['reopen_match']);
    expect(preview.consequences).toMatchObject({ reopensMatch: true, targetChanges: [{ inningsIndex: 1, teamId: sideB.team.id, before: 13, after: 18 }] });
    expect(preview.consequences?.lines).toContain(`${sideB.team.name} are 16/0 after 0.4 overs and need 2 runs from 8 balls.`);
    expect(preview.requiresReason).toBe(true);
    const impact = preview.impact;
    if (impact === null) {
      throw new Error('tournament impact expected');
    }
    expect(impact.fixtures[0]).toMatchObject({ fixtureId: fixture.id, change: 'result_changed', hasMatchData: true, changeText: 'Result no longer counts' });
    expect(impact.standings.length).toBeGreaterThan(0);
    for (const line of impact.standings) {
      expect(line.where).toBe(`${league.stage.name}${line.poolName === null || line.poolName === undefined ? '' : ` · ${line.poolName}`}`);
      expect(line.text?.startsWith(line.teamName ?? '?')).toBe(true);
    }
    const applied = expectOk(await harness.app.matches.applyHistoryEdit(matchId, preview.ops ?? ops, 'Boundary missed', preview.baseFingerprint));
    expect(applied.match.status).toBe('live');
    const after = (await league.evaluate()).snapshot.fixtures.find((entry) => entry.id === fixture.id);
    expect(after?.status).toBe('live');
    const { evaluation } = await league.evaluate();
    expect(evaluation.progress.done).toBe(0);
    const audit = expectOk(await harness.app.matches.auditLog(matchId, { limit: 3 }));
    expect(audit[0]).toMatchObject({ action: 'match_reopened', reason: 'Boundary missed' });
  });
});

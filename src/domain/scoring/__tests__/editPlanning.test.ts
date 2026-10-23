import type { MatchEvent, MatchSetup } from '../../types';
import { describeEditConsequences, planHistoryEdit } from '../editPlanning';
import { applyHistoryEdits, editEvent, type EditContext, type HistoryEditOp } from '../history';
import { replayMatch } from '../replay';
import { playScript } from '../testing';
import { batter, delivery, g1, inn } from './helpers';

function context(): EditContext {
  let next = 0;
  return {
    ids: () => {
      next += 1;
      return `new-${next}`;
    },
    now: '2026-10-02T09:00:00.000Z',
  };
}

function stateBefore(setup: MatchSetup, events: readonly MatchEvent[], seq: number) {
  return replayMatch(setup, events.filter((event) => event.seq < seq));
}

function name(setup: MatchSetup, playerId: string): string {
  return setup.players.find((player) => player.playerId === playerId)?.name ?? playerId;
}

function team(setup: MatchSetup, teamId: string): string {
  return setup.teams.find((entry) => entry.id === teamId)?.name ?? teamId;
}

function ballSeq(setup: MatchSetup, events: readonly MatchEvent[], inningsIndex: number, label: string): number {
  const ball = replayMatch(setup, events).innings[inningsIndex].balls.find((entry) => entry.label === label && entry.isLegal);
  if (ball === undefined) {
    throw new Error(`no ball ${label} in innings ${inningsIndex}`);
  }
  return ball.seq;
}

function confirmedG1() {
  const { setup, events } = g1();
  const confirmed = playScript(setup, ['end'], { prior: events });
  return { setup, events: confirmed.events, state: confirmed.state };
}

describe('planHistoryEdit: a completed match whose result no longer stands (wave-3 bug #1)', () => {
  it('reopens the match automatically and previews the new target and chase instead of refusing', () => {
    const { setup, events, state } = confirmedG1();
    expect(state.lifecycle).toBe('completed');
    const dot = ballSeq(setup, events, 0, '0.3');
    const four = delivery(stateBefore(setup, events, dot), { boundary: 4 });
    const ops: readonly HistoryEditOp[] = [{ op: 'replace', seq: dot, with: [four] }];
    expect(editEvent(setup, events, dot, [four], context())).toMatchObject({ ok: false, code: 'NATURAL_RESULT_NOT_REACHED' });

    const planned = planHistoryEdit(setup, events, ops, context());
    expect(planned.ok).toBe(true);
    if (!planned.ok) {
      return;
    }
    const ended = events[events.length - 1];
    expect(ended.kind).toBe('match_ended');
    expect(planned.ops).toEqual([...ops, { op: 'delete', seq: ended.seq }]);
    expect(planned.resolutions).toEqual([
      expect.objectContaining({ kind: 'reopen_match', automatic: true, label: 'Reopen match', description: `“${state.resultText}” no longer stands. The match reopens.` }),
    ]);
    expect(planned.outcome.after.lifecycle).toBe('live');
    expect(planned.outcome.resultChanged).toBe(true);
    expect(inn(planned.outcome.after, 1).target?.runs).toBe(32);
    const chasing = team(setup, inn(state, 1).battingTeamId);
    expect(planned.consequences).toMatchObject({
      reopensMatch: true,
      resultBefore: state.resultText,
      resultAfter: null,
      removedDeliveries: 0,
      targetChanges: [{ inningsIndex: 1, teamId: inn(state, 1).battingTeamId, before: 28, after: 32 }],
    });
    expect(planned.consequences.lines).toEqual([
      `The target for ${chasing} changes from 28 to 32.`,
      `“${state.resultText}” no longer stands, so the match is reopened.`,
      `${chasing} are 28/1 after 2.2 overs and need 4 runs from 4 balls.`,
    ]);
    expect(planned.consequences.items).toEqual([
      { headline: `Target for ${chasing}: 28 → 32` },
      { headline: 'Match reopens', detail: `“${state.resultText}” no longer stands.` },
      { headline: `${chasing} 28/1 after 2.2 overs`, detail: 'Need 4 from 4 balls.' },
    ]);
  });

  it('keeps refusing logs that no resolution can repair, with the first failing seq', () => {
    const { setup, events } = confirmedG1();
    const outcome = planHistoryEdit(setup, events, [{ op: 'delete', seq: 999 }], context());
    expect(outcome).toMatchObject({ ok: false, failure: { code: 'SEQ_OUT_OF_ORDER' }, conflict: null });
  });
});

describe('planHistoryEdit: a later dismissal that no longer fits the strike (wave-3 bug #2)', () => {
  function strikeConflict() {
    const { setup, events, state } = g1();
    const single = ballSeq(setup, events, 1, '1.1');
    const dot = delivery(stateBefore(setup, events, single));
    const ops: readonly HistoryEditOp[] = [{ op: 'replace', seq: single, with: [dot] }];
    return { setup, events, state, ops, catchSeq: ballSeq(setup, events, 1, '1.3') };
  }

  it('explains which later ball conflicts and why instead of a bare validation error', () => {
    const { setup, events, ops, catchSeq } = strikeConflict();
    expect(applyHistoryEdits(setup, events, ops, context())).toMatchObject({ ok: false, code: 'DISMISSED_PLAYER_NOT_AT_CREASE' });
    const planned = planHistoryEdit(setup, events, ops, context());
    expect(planned.ok).toBe(false);
    if (planned.ok || planned.conflict === null) {
      throw new Error('expected a conflict');
    }
    const catchEvent = events.find((event) => event.seq === catchSeq);
    expect(planned.conflict).toMatchObject({
      code: 'DISMISSED_PLAYER_NOT_AT_CREASE',
      atSeq: catchSeq,
      eventId: catchEvent?.id,
      inningsIndex: 1,
      ballLabel: '1.3',
    });
    expect(planned.conflict.message).toBe(`${name(setup, 'T2')} is now on strike for ball 1.3 of the 2nd innings, but it records ${name(setup, 'T1')} out caught.`);
    expect(planned.conflict.headline).toBe('Wrong batter out on ball 1.3');
    expect(planned.conflict.detail).toBe(planned.conflict.message);
    expect(planned.conflict.reason).toBe(`Only the striker, ${name(setup, 'T2')}, can be out that way.`);
    expect(planned.conflict.resolutions.map((resolution) => [resolution.kind, resolution.automatic])).toEqual([
      ['keep_strike', false],
      ['dismiss_striker', false],
    ]);
  });

  it('offers keeping the later balls as recorded by changing ends before the next ball', () => {
    const { setup, events, ops, state } = strikeConflict();
    const planned = planHistoryEdit(setup, events, ops, context());
    if (planned.ok || planned.conflict === null) {
      throw new Error('expected a conflict');
    }
    const keep = planned.conflict.resolutions[0];
    expect(keep.label).toBe('Keep later balls');
    expect(keep.description).toBe('Batters swap ends before ball 1.2. Later balls stay as recorded.');
    expect(keep.ops).toEqual([...ops, { op: 'insert_before', seq: ballSeq(setup, events, 1, '1.2'), events: [{ kind: 'strike_swapped' }] }]);
    const applied = planHistoryEdit(setup, events, keep.ops, context());
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(batter(applied.outcome.after, 'T1', 1)).toMatchObject({ status: 'out', runs: batter(state, 'T1', 1).runs });
    expect(batter(applied.outcome.after, 'T2', 1).runs).toBe(batter(state, 'T2', 1).runs - 1);
    expect(applied.outcome.diff.restampedIds).toEqual([]);
  });

  it('offers recording the striker as the dismissed batter instead', () => {
    const { setup, events, ops } = strikeConflict();
    const planned = planHistoryEdit(setup, events, ops, context());
    if (planned.ok || planned.conflict === null) {
      throw new Error('expected a conflict');
    }
    const swap = planned.conflict.resolutions[1];
    expect(swap.label).toBe(`Record ${name(setup, 'T2')} out`);
    expect(swap.description).toBe(`Out caught on ball 1.3 instead of ${name(setup, 'T1')}.`);
    const applied = planHistoryEdit(setup, events, swap.ops, context());
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(batter(applied.outcome.after, 'T2', 1).status).toBe('out');
    expect(batter(applied.outcome.after, 'T1', 1).status).not.toBe('out');
    const replaced = applied.outcome.events.find((event) => event.kind === 'delivery' && event.wicket !== null && applied.outcome.diff.insertedIds.includes(event.id));
    const incoming = applied.outcome.events.find((event) => event.kind === 'batter_in' && event.playerId === 'T3');
    expect(replaced?.actionId).toBe(incoming?.actionId);
  });

  it('a confirmed match gets the same choices and each choice still reopens or keeps the result as needed', () => {
    const { setup, events } = confirmedG1();
    const single = ballSeq(setup, events, 1, '1.1');
    const ops: readonly HistoryEditOp[] = [{ op: 'replace', seq: single, with: [delivery(stateBefore(setup, events, single))] }];
    const planned = planHistoryEdit(setup, events, ops, context());
    if (planned.ok || planned.conflict === null) {
      throw new Error('expected a conflict');
    }
    expect(planned.conflict.resolutions.map((resolution) => resolution.kind)).toEqual(['keep_strike', 'dismiss_striker']);
    for (const resolution of planned.conflict.resolutions) {
      const applied = planHistoryEdit(setup, events, resolution.ops, context());
      expect(applied).toMatchObject({ ok: true, consequences: { reopensMatch: true } });
    }
  });
});

describe('planHistoryEdit: play recorded after the match is now decided', () => {
  it('offers removing the later balls, explaining where the match now ends', () => {
    const { setup, events } = confirmedG1();
    const four = ballSeq(setup, events, 0, '0.2');
    const ops: readonly HistoryEditOp[] = [{ op: 'replace', seq: four, with: [delivery(stateBefore(setup, events, four))] }];
    const planned = planHistoryEdit(setup, events, ops, context());
    if (planned.ok || planned.conflict === null) {
      throw new Error('expected a conflict');
    }
    expect(planned.conflict.code).toBe('PENDING_ACTION_REQUIRED');
    expect(planned.conflict.ballLabel).toBe('2.1');
    expect(planned.conflict.headline).toBe('Match now decided on ball 1.6');
    expect(planned.conflict.detail).toBe('Ball 2.1 of the 2nd innings and later play no longer count.');
    expect(planned.conflict.message).toBe('Match now decided on ball 1.6. Ball 2.1 of the 2nd innings and later play no longer count.');
    expect(planned.conflict.resolutions).toEqual([
      expect.objectContaining({
        kind: 'remove_later_play',
        automatic: false,
        label: 'Remove 2 later balls',
        description: 'The match is decided on ball 1.6, so 2 later balls are removed.',
      }),
    ]);
    const applied = planHistoryEdit(setup, events, planned.conflict.resolutions[0].ops, context());
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(applied.outcome.after.lifecycle).toBe('completed');
    expect(applied.consequences.removedDeliveries).toBe(2);
    expect(applied.consequences.lines).toContain('2 later balls are removed from the match.');
    expect(applied.consequences.items).toContainEqual({ headline: '2 later balls removed' });
    expect(inn(applied.outcome.after, 1).legalBalls).toBe(12);
  });

  it('a later entry that fits no rule gets a precise conflict without choices', () => {
    const played = playScript(g1().setup, ['start:L1:L2:T7', '0 1 W>L3']);
    const { setup } = g1();
    const events = played.events;
    const first = ballSeq(setup, events, 0, '0.1');
    const wicket = delivery(stateBefore(setup, events, first), { wicket: { type: 'bowled', playerOutId: 'L1', fielderIds: [], dismissalEnd: null } });
    const ops: readonly HistoryEditOp[] = [
      { op: 'replace', seq: first, with: [wicket, { kind: 'batter_in', playerId: 'L3', position: 'striker' }] },
    ];
    const planned = planHistoryEdit(setup, events, ops, context());
    if (planned.ok || planned.conflict === null) {
      throw new Error('expected a conflict');
    }
    expect(planned.conflict.resolutions).toEqual([]);
    expect(planned.conflict.ballLabel).toBe('0.3');
    expect(planned.conflict.message.startsWith("After this change the new batter's arrival after ball 0.3 of the 1st innings no longer fits: ")).toBe(true);
    expect(planned.conflict.headline).toBe('The entry after ball 0.3 no longer fits');
    expect(planned.conflict.detail).toBe(planned.conflict.reason);
  });
});

describe('describeEditConsequences', () => {
  it('says nothing for an edit that changes neither target nor result', () => {
    const { setup, state } = g1();
    expect(describeEditConsequences(setup, state, state)).toEqual({
      reopensMatch: false,
      resultBefore: state.resultText,
      resultAfter: state.resultText,
      targetChanges: [],
      removedDeliveries: 0,
      lines: [],
      items: [],
    });
  });
});

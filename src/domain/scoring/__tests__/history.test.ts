import type { MatchEvent, MatchSetup } from '../../types';
import {
  applyHistoryEdits,
  editEvent,
  lastActionGroup,
  logFingerprint,
  normalizeLog,
  redoAction,
  undoLastAction,
  type EditContext,
} from '../history';
import { replayMatch } from '../replay';
import { deepFreeze, matchSetup, playScript } from '../testing';
import { batter, bowler, delivery, g1, inn, play } from './helpers';

function context(): EditContext {
  let next = 0;
  return {
    ids: () => {
      next += 1;
      return `new-${next}`;
    },
    now: '2026-05-02T09:00:00.000Z',
  };
}

function seqOf(events: readonly MatchEvent[], predicate: (event: MatchEvent) => boolean): number {
  const found = events.find(predicate);
  if (found === undefined) {
    throw new Error('event not found');
  }
  return found.seq;
}

function stateBefore(setup: MatchSetup, events: readonly MatchEvent[], seq: number) {
  return replayMatch(setup, events.filter((event) => event.seq < seq));
}

describe('undo and redo (U-HIS-01..06)', () => {
  const setup = matchSetup();

  it('U-HIS-01 empty log', () => {
    expect(lastActionGroup([])).toEqual([]);
    expect(undoLastAction([])).toBeNull();
  });

  it('U-HIS-02 / EC-C-01 a wicket and its incoming batter undo together', () => {
    const played = play(setup, ['start:L1:L2:T7', '1 1', 'W>L3']);
    const undo = undoLastAction(played.events);
    expect(undo?.undone.map((event) => event.kind)).toEqual(['delivery', 'batter_in']);
    const restored = replayMatch(setup, undo?.events ?? []);
    expect(restored).toEqual(play(setup, ['start:L1:L2:T7', '1 1']).state);
    expect(inn(restored)).toMatchObject({ wickets: 0, strikerId: 'L1' });
  });

  it('U-HIS-03 undo is replay, never arithmetic, across an over end', () => {
    const played = play(setup, ['start:L1:L2:T7', '1 2 3 4 6 1', '@T8 2 W>L3']);
    let events = played.events;
    for (let count = 0; count < 3; count += 1) {
      events = undoLastAction(events)?.events ?? [];
    }
    expect(replayMatch(setup, events)).toEqual(play(setup, ['start:L1:L2:T7', '1 2 3 4 6 1']).state);
  });

  it('U-HIS-04 redo restores the identical events', () => {
    const played = play(setup, ['start:L1:L2:T7', '1', 'W>L3']);
    const undo = undoLastAction(played.events);
    const redo = redoAction(setup, undo?.events ?? [], undo?.undone ?? []);
    expect(redo).toMatchObject({ ok: true });
    if (redo.ok) {
      expect(redo.events).toEqual(played.events);
      expect(redo.state).toEqual(played.state);
    }
  });

  it('U-HIS-05 / EC-C-03 redo after a divergence is stale', () => {
    const played = play(setup, ['start:L1:L2:T7', '1', 'W>L3']);
    const undo = undoLastAction(played.events);
    const diverged = playScript(setup, ['4'], { prior: undo?.events ?? [] }).events;
    expect(redoAction(setup, diverged, undo?.undone ?? [])).toMatchObject({ ok: false, code: 'REDO_STALE' });
    expect(redoAction(setup, played.events, [])).toMatchObject({ ok: false, code: 'REDO_STALE' });
  });

  it('U-HIS-06 undoing match_ended reopens the match', () => {
    const { setup: g1Setup, events } = g1();
    const confirmed = playScript(g1Setup, ['end'], { prior: events });
    expect(confirmed.state.lifecycle).toBe('completed');
    const undo = undoLastAction(confirmed.events);
    const reopened = replayMatch(g1Setup, undo?.events ?? []);
    expect(reopened.lifecycle).toBe('live');
    expect(reopened.pendingAction?.type).toBe('confirm_result');
  });

  it('EC-C-02 undo of the second innings start returns to the openers prompt', () => {
    const { setup: g1Setup, events } = g1();
    const chaseStart = seqOf(events, (event) => event.kind === 'innings_started' && event.inningsIndex === 1);
    const undo = undoLastAction(events.filter((event) => event.seq <= chaseStart));
    expect(replayMatch(g1Setup, undo?.events ?? []).pendingAction).toMatchObject({ type: 'start_next_innings', inningsIndex: 1 });
  });

  it('undo of the opening event returns the match to not started', () => {
    const played = play(setup, ['start:L1:L2:T7']);
    const undo = undoLastAction(played.events);
    expect(replayMatch(setup, undo?.events ?? []).lifecycle).toBe('not_started');
  });
});

describe('historical edits (U-HIS-07..17)', () => {
  const setup = matchSetup();

  it('U-HIS-07 one run becomes two: later strikers are re-derived and re-stamped', () => {
    const played = play(setup, ['start:L1:L2:T7', '1 0 4']);
    const ballOne = seqOf(played.events, (event) => event.kind === 'delivery');
    const replacement = delivery(stateBefore(setup, played.events, ballOne), { runsRun: 2 });
    const outcome = editEvent(setup, played.events, ballOne, [replacement], context());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.diff.restampedIds).toEqual([played.events[2].id, played.events[3].id]);
    expect(batter(outcome.after, 'L1')).toMatchObject({ runs: 6, balls: 3, fours: 1 });
    expect(batter(outcome.after, 'L2').balls).toBe(0);
    expect(outcome.events.slice(2).every((event) => event.kind !== 'delivery' || event.strikerId === 'L1')).toBe(true);
    expect(outcome.diff.replacedIds).toEqual([played.events[1].id]);
    expect(outcome.affectedInnings).toEqual([0]);
    expect(outcome.resultChanged).toBe(false);
  });

  it('13.8 keeping later deliveries with the batters as recorded', () => {
    const played = play(setup, ['start:L1:L2:T7', '1 0 4 1 0 2']);
    const ballOne = seqOf(played.events, (event) => event.kind === 'delivery');
    const replacement = delivery(stateBefore(setup, played.events, ballOne), { runsRun: 2 });
    const plain = editEvent(setup, played.events, ballOne, [replacement], context());
    const kept = applyHistoryEdits(
      setup,
      played.events,
      [
        { op: 'replace', seq: ballOne, with: [replacement] },
        { op: 'insert_after', seq: ballOne, events: [{ kind: 'strike_swapped' }] },
      ],
      context(),
    );
    expect(plain.ok && kept.ok).toBe(true);
    if (!plain.ok || !kept.ok) {
      return;
    }
    expect(inn(plain.after).overs[0].runs).toBe(9);
    expect(batter(plain.after, 'L1')).toMatchObject({ runs: 7, balls: 4 });
    expect(batter(plain.after, 'L2')).toMatchObject({ runs: 2, balls: 2 });
    expect(batter(kept.after, 'L1')).toMatchObject({ runs: 4, balls: 3 });
    expect(batter(kept.after, 'L2')).toMatchObject({ runs: 5, balls: 3 });
    expect(kept.diff.restampedIds).toEqual([]);
    expect(inn(kept.after).runs).toBe(inn(played.state).runs + 1);
  });

  it('U-HIS-08 / EC-C-08 / 13.9 wide re-classified as legal re-anchors the next bowler one delivery earlier', () => {
    const played = play(setup, ['start:L1:L2:T7', '0 1 wd 2 0 1 4', '@T8 1']);
    const wideSeq = seqOf(played.events, (event) => event.kind === 'delivery' && event.call === 'wide');
    const selection = played.events.find((event) => event.kind === 'bowler_selected');
    const lastOfOver = played.events[7];
    expect(bowler(played.state, 'T7').runsConceded).toBe(9);
    const outcome = editEvent(setup, played.events, wideSeq, [delivery(stateBefore(setup, played.events, wideSeq))], context());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.diff.reanchoredIds).toEqual([selection?.id]);
    expect(outcome.diff.restampedIds).toContain(lastOfOver.id);
    const moved = outcome.events.find((event) => event.id === lastOfOver.id);
    expect(moved).toMatchObject({ kind: 'delivery', bowlerId: 'T8' });
    expect(outcome.events.findIndex((event) => event.id === selection?.id)).toBe(outcome.events.findIndex((event) => event.id === lastOfOver.id) - 1);
    expect(bowler(outcome.after, 'T7').runsConceded).toBe(4);
    expect(bowler(outcome.after, 'T8').runsConceded).toBe(5);
    expect(outcome.events.map((event) => event.seq)).toEqual(outcome.events.map((_, index) => index + 1));
  });

  it('U-HIS-09 legal re-classified as a wide moves the selection one delivery later', () => {
    const played = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 0', '@T8 1 1']);
    const thirdBall = played.events[3];
    const selection = played.events.find((event) => event.kind === 'bowler_selected');
    const firstOfNext = played.events[8];
    const outcome = editEvent(setup, played.events, thirdBall.seq, [delivery(stateBefore(setup, played.events, thirdBall.seq), { call: 'wide' })], context());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.events.find((event) => event.id === firstOfNext.id)).toMatchObject({ bowlerId: 'T7' });
    expect(outcome.diff.reanchoredIds).toEqual([selection?.id]);
    expect(outcome.events.findIndex((event) => event.id === selection?.id)).toBe(outcome.events.findIndex((event) => event.id === firstOfNext.id) + 1);
  });

  it('EC-C-09 a selection whose over never starts is dropped and reported', () => {
    const played = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 0', '@T8']);
    const selection = played.events[played.events.length - 1];
    const outcome = editEvent(setup, played.events, 4, [delivery(stateBefore(setup, played.events, 4), { call: 'wide' })], context());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.events.some((event) => event.id === selection.id)).toBe(false);
    expect(outcome.diff.removedIds).toEqual([selection.id]);
    expect(inn(outcome.after)).toMatchObject({ legalBalls: 5, bowlerId: 'T7' });
  });

  it('U-HIS-10 / EC-C-10 removing a wicket but keeping its batter_in fails with NO_VACANCY', () => {
    const played = play(setup, ['start:L1:L2:T7', 'W>L3', '1']);
    const outcome = editEvent(setup, played.events, 2, [delivery(stateBefore(setup, played.events, 2))], context());
    expect(outcome).toMatchObject({ ok: false, code: 'NO_VACANCY', atSeq: 3 });
  });

  it('U-HIS-11 removing the wicket and its batter_in together', () => {
    const played = play(setup, ['start:L1:L2:T7', 'W>L3', '1']);
    const outcome = applyHistoryEdits(
      setup,
      played.events,
      [
        { op: 'replace', seq: 2, with: [delivery(stateBefore(setup, played.events, 2))] },
        { op: 'delete', seq: 3 },
      ],
      context(),
    );
    expect(outcome).toMatchObject({ ok: true, affectedInnings: [0] });
    if (outcome.ok) {
      expect(inn(outcome.after).wickets).toBe(0);
      expect(outcome.diff.removedIds).toEqual([played.events[2].id]);
      expect(outcome.events).toHaveLength(3);
    }
  });

  it('U-HIS-12 inserted events get fresh ids, the edit time and one fresh action per op', () => {
    const played = play(setup, ['start:L1:L2:T7', '1 1 1']);
    const outcome = applyHistoryEdits(
      setup,
      played.events,
      [
        { op: 'insert_before', seq: 3, events: [{ kind: 'strike_swapped' }] },
        { op: 'insert_after', seq: 4, events: [{ kind: 'strike_swapped' }] },
      ],
      context(),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const inserted = outcome.events.filter((event) => outcome.diff.insertedIds.includes(event.id));
    expect(inserted).toHaveLength(2);
    expect(inserted.every((event) => event.recordedAt === '2026-05-02T09:00:00.000Z')).toBe(true);
    expect(inserted[0].actionId).not.toBe(inserted[1].actionId);
    expect(new Set(played.events.map((event) => event.actionId)).has(inserted[0].actionId)).toBe(false);
    expect(outcome.events.map((event) => event.kind)).toEqual(['innings_started', 'delivery', 'strike_swapped', 'delivery', 'delivery', 'strike_swapped']);
  });

  it('U-HIS-13 normalizeLog is idempotent and a no-op on a healthy log', () => {
    const { setup: g1Setup, events } = g1();
    const once = normalizeLog(g1Setup, events);
    expect(once).toEqual({ events, reanchoredIds: [], restampedIds: [] });
    const messy = events.map((event) => (event.kind === 'delivery' ? { ...event, strikerId: 'L9' } : event));
    const fixed = normalizeLog(g1Setup, messy);
    expect(fixed.events).toEqual(events);
    expect(fixed.restampedIds.length).toBeGreaterThan(0);
    const twice = normalizeLog(g1Setup, fixed.events);
    expect(twice).toEqual({ events: fixed.events, reanchoredIds: [], restampedIds: [] });
  });

  it('U-HIS-14 resultChanged is accurate', () => {
    const { setup: g1Setup, events } = g1();
    const chaseSix = events.find((event) => event.kind === 'delivery' && event.boundary === 6 && inn(replayMatch(g1Setup, events.filter((e) => e.seq < event.seq))).index === 1);
    if (chaseSix === undefined) {
      throw new Error('missing six');
    }
    const dot = delivery(stateBefore(g1Setup, events, chaseSix.seq));
    const changed = editEvent(g1Setup, events, chaseSix.seq, [dot], context());
    expect(changed).toMatchObject({ ok: true, resultChanged: true, affectedInnings: [1] });
    const catchBall = events.find((event) => event.kind === 'delivery' && event.wicket?.type === 'caught');
    if (catchBall === undefined || catchBall.kind !== 'delivery' || catchBall.wicket === null) {
      throw new Error('missing catch');
    }
    const otherCatcher = { ...catchBall, wicket: { ...catchBall.wicket, fielderIds: ['L8'] } };
    const same = editEvent(g1Setup, events, catchBall.seq, [otherCatcher], context());
    expect(same).toMatchObject({ ok: true, resultChanged: false });
    if (same.ok) {
      expect(batter(same.after, 'T1', 1).dismissalText).toBe('c Wasim b Abdul');
    }
  });

  it('U-HIS-15 fingerprint', () => {
    const played = play(setup, ['start:L1:L2:T7', '1 1']);
    const print = logFingerprint(played.events);
    expect(print).toMatch(/^[0-9a-f]{8}$/);
    expect(logFingerprint(played.events)).toBe(print);
    expect(logFingerprint(deepFreeze(played.events.map((event) => ({ ...event }))))).toBe(print);
    expect(logFingerprint([...played.events.slice(0, 2), { ...played.events[2], recordedAt: '2026-05-01T10:00:09.000Z' }])).not.toBe(print);
    const undone = undoLastAction(played.events)?.events ?? [];
    const replaced = playScript(setup, ['2'], { prior: undone }).events;
    expect(replaced[replaced.length - 1].seq).toBe(played.events[played.events.length - 1].seq);
    expect(logFingerprint(replaced)).not.toBe(print);
    expect(logFingerprint([])).toMatch(/^[0-9a-f]{8}$/);
  });

  it('U-HIS-16 ops address the original numbering', () => {
    const played = play(setup, ['start:L1:L2:T7', '1 1 1 1 1 1', '@T8 1 1']);
    const outcome = applyHistoryEdits(
      setup,
      played.events,
      [
        { op: 'replace', seq: 5, with: [delivery(stateBefore(setup, played.events, 5)), { kind: 'strike_swapped' }] },
        { op: 'delete', seq: 10 },
      ],
      context(),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.events.map((event) => event.seq)).toEqual(outcome.events.map((_, index) => index + 1));
      expect(outcome.events.some((event) => event.id === played.events[9].id)).toBe(false);
      expect(outcome.events.some((event) => event.id === played.events[4].id)).toBe(false);
    }
    expect(applyHistoryEdits(setup, played.events, [{ op: 'delete', seq: 99 }], context())).toMatchObject({ ok: false, code: 'SEQ_OUT_OF_ORDER' });
    expect(
      applyHistoryEdits(
        setup,
        played.events,
        [
          { op: 'delete', seq: 3 },
          { op: 'delete', seq: 3 },
        ],
        context(),
      ),
    ).toMatchObject({ ok: false, code: 'SEQ_OUT_OF_ORDER' });
  });

  it('U-HIS-17 an invalid edit reports the first failing seq and never produces issues', () => {
    const played = play(setup, ['start:L1:L2:T7', '1 1 1']);
    const outcome = editEvent(setup, played.events, 2, [delivery(stateBefore(setup, played.events, 2), { boundary: 6, runsTo: 'bye' })], context());
    expect(outcome).toMatchObject({ ok: false, code: 'SIX_NOT_OFF_BAT', atSeq: 2 });
    const valid = editEvent(setup, played.events, 2, [delivery(stateBefore(setup, played.events, 2), { strikerId: 'L9' })], context());
    expect(valid).toMatchObject({ ok: true });
    if (valid.ok) {
      expect(valid.after.issues).toEqual([]);
    }
  });

  it('EC-C-11 an edit that un-wins a confirmed chase must also reopen the match', () => {
    const { setup: g1Setup, events } = g1();
    const confirmed = playScript(g1Setup, ['end'], { prior: events }).events;
    const firstFour = seqOf(confirmed, (event) => event.kind === 'delivery' && event.boundary === 4);
    const six = delivery(stateBefore(g1Setup, confirmed, firstFour), { boundary: 6 });
    const refused = editEvent(g1Setup, confirmed, firstFour, [six], context());
    expect(refused).toMatchObject({ ok: false, code: 'NATURAL_RESULT_NOT_REACHED' });
    const reopened = applyHistoryEdits(
      g1Setup,
      confirmed,
      [
        { op: 'replace', seq: firstFour, with: [six] },
        { op: 'delete', seq: confirmed[confirmed.length - 1].seq },
      ],
      context(),
    );
    expect(reopened).toMatchObject({ ok: true, resultChanged: true });
    if (reopened.ok) {
      expect(reopened.after.lifecycle).toBe('live');
      expect(inn(reopened.after, 1).status).toBe('in_progress');
    }
  });

  it('edits are pure', () => {
    const played = play(setup, ['start:L1:L2:T7', '1 0 4']);
    const frozen = deepFreeze(played.events.map((event) => ({ ...event })));
    const replacement = deepFreeze(delivery(stateBefore(setup, played.events, 2), { runsRun: 2 }));
    expect(editEvent(setup, frozen, 2, [replacement], context())).toEqual(editEvent(setup, frozen, 2, [replacement], context()));
  });
});

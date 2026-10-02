import {
  batterIn,
  buildEvents,
  bye,
  legBye,
  noBall,
  overthrowBoundary,
  scoreRuns,
  selectBowler,
  swapStrike,
  wicket,
  wide,
  type ScoringIntent,
} from '../commands';
import { validateEvent } from '../validate';
import { deepFreeze, matchSetup, playScript } from '../testing';
import { batter, bowler, build, chaseAfter, fresh, inn, lastBall, play, step } from './helpers';

const STAMPS = { strikerId: 'L1', nonStrikerId: 'L2', bowlerId: 'T7' };

describe('scoring pad intents (U-CMD)', () => {
  const { setup, state } = fresh();

  it.each<[string, ScoringIntent, object, object]>([
    ['U-CMD-01 dot', scoreRuns(0), { type: 'runs', runsRun: 0 }, { runsRun: 0, boundary: 0 }],
    ['U-CMD-02 one', scoreRuns(1), { type: 'runs', runsRun: 1 }, { runsRun: 1, boundary: 0 }],
    ['U-CMD-03 two', scoreRuns(2), { type: 'runs', runsRun: 2 }, { runsRun: 2, boundary: 0 }],
    ['U-CMD-04 three', scoreRuns(3), { type: 'runs', runsRun: 3 }, { runsRun: 3, boundary: 0 }],
    ['U-CMD-05 four', scoreRuns(4), { type: 'runs', runsRun: 0, boundary: 4 }, { runsRun: 0, boundary: 4 }],
    ['U-CMD-06 six', scoreRuns(6), { type: 'runs', runsRun: 0, boundary: 6 }, { runsRun: 0, boundary: 6 }],
    ['U-CMD-07 all-run four', scoreRuns(4, { allRun: true }), { type: 'runs', runsRun: 4 }, { runsRun: 4, boundary: 0 }],
  ])('%s builds one fair delivery off the bat', (_, intent, shape, facts) => {
    expect(intent).toMatchObject(shape);
    const events = build(setup, state, intent);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'delivery', call: 'fair', runsTo: 'bat', shortRuns: 0, wicket: null, ...STAMPS, ...facts });
  });

  it.each<[string, ScoringIntent, number, number, string, string, string]>([
    ['U-CMD-01', scoreRuns(0), 0, 0, 'L1', '0', 'dot'],
    ['U-CMD-02', scoreRuns(1), 1, 1, 'L2', '1', 'runs'],
    ['U-CMD-03', scoreRuns(2), 2, 2, 'L1', '2', 'runs'],
    ['U-CMD-04', scoreRuns(3), 3, 3, 'L2', '3', 'runs'],
    ['U-CMD-05', scoreRuns(4), 4, 4, 'L1', '4', 'four'],
    ['U-CMD-06', scoreRuns(6), 6, 6, 'L1', '6', 'six'],
    ['U-CMD-07', scoreRuns(4, { allRun: true }), 4, 4, 'L1', '4', 'runs'],
    ['U-CMD-08', scoreRuns(5), 5, 5, 'L2', '5', 'runs'],
  ])('%s state after the ball', (_, intent, teamRuns, l1Runs, striker, token, kind) => {
    const next = step(setup, state, intent);
    const innings = inn(next);
    expect(innings.runs).toBe(teamRuns);
    expect(innings.legalBalls).toBe(1);
    expect(batter(next, 'L1')).toMatchObject({ runs: l1Runs, balls: 1 });
    expect(bowler(next, 'T7').runsConceded).toBe(teamRuns);
    expect(innings.strikerId).toBe(striker);
    expect(lastBall(next).token).toMatchObject({ text: token, kind });
  });

  it('U-CMD-05/06 boundary counters on batter and bowler', () => {
    const four = step(setup, state, scoreRuns(4));
    expect(batter(four, 'L1').fours).toBe(1);
    expect(bowler(four, 'T7').foursConceded).toBe(1);
    const six = step(setup, state, scoreRuns(6));
    expect(batter(six, 'L1').sixes).toBe(1);
    expect(bowler(six, 'T7').sixesConceded).toBe(1);
    const allRun = step(setup, state, scoreRuns(4, { allRun: true }));
    expect(batter(allRun, 'L1').fours).toBe(0);
  });

  it('U-CMD-01 a dot is a dot for batter and bowler', () => {
    const next = step(setup, state, scoreRuns(0));
    expect(batter(next, 'L1').dots).toBe(1);
    expect(bowler(next, 'T7').dots).toBe(1);
  });

  it('U-CMD-08 five runs run warns UNUSUAL_RUNS', () => {
    const [payload] = build(setup, state, scoreRuns(5));
    const result = validateEvent(setup, state, payload);
    expect(result).toEqual({ ok: true, warnings: [expect.objectContaining({ code: 'UNUSUAL_RUNS' })] });
  });

  it('U-CMD-09 one plus four overthrows is five runs, rotates strike, is not a four and does not warn', () => {
    const intent = overthrowBoundary(1);
    expect(intent).toMatchObject({ type: 'runs', runsRun: 1, boundary: 4 });
    const [payload] = build(setup, state, intent);
    expect(payload).toMatchObject({ call: 'fair', runsTo: 'bat', runsRun: 1, boundary: 4 });
    expect(validateEvent(setup, state, payload)).toEqual({ ok: true, warnings: [] });
    const next = step(setup, state, intent);
    expect(inn(next).runs).toBe(5);
    expect(batter(next, 'L1')).toMatchObject({ runs: 5, fours: 0 });
    expect(inn(next).strikerId).toBe('L2');
    expect(lastBall(next).token).toMatchObject({ text: '5', kind: 'runs' });
  });

  it('U-CMD-10 overthrows off byes', () => {
    const intent = overthrowBoundary(1, { runsTo: 'bye' });
    expect(intent).toEqual({ type: 'bye', runsRun: 1, boundary: true });
    const next = step(setup, state, intent);
    expect(inn(next).extras.byes).toBe(5);
    expect(bowler(next, 'T7')).toMatchObject({ runsConceded: 0, dots: 1 });
    expect(inn(next).strikerId).toBe('L2');
    expect(lastBall(next).token.text).toBe('B5');
  });

  it('U-CMD-11 no-ball plus one and four overthrows off the bat', () => {
    const intent = noBall({ runsRun: 1, boundary: 4 });
    expect(intent).toMatchObject({ type: 'no_ball', runsRun: 1, boundary: 4 });
    expect(overthrowBoundary(1, { call: 'no_ball' })).toEqual({ type: 'no_ball', runsTo: 'bat', runsRun: 1, boundary: 4 });
    const [payload] = build(setup, state, intent);
    expect(payload).toMatchObject({ call: 'no_ball', runsTo: 'bat', runsRun: 1, boundary: 4 });
    const next = step(setup, state, intent);
    expect(inn(next).runs).toBe(6);
    expect(inn(next).extras.noBalls).toBe(1);
    expect(batter(next, 'L1')).toMatchObject({ runs: 5, balls: 1, fours: 0 });
    expect(bowler(next, 'T7').runsConceded).toBe(6);
    expect(inn(next).strikerId).toBe('L2');
    expect(inn(next).isFreeHitNext).toBe(true);
    expect(lastBall(next).token.text).toBe('NB+5');
    expect(validateEvent(setup, state, payload)).toEqual({ ok: true, warnings: [] });
  });

  it('U-CMD-12 ran two, one short scores one without changing ends', () => {
    const intent = scoreRuns(2, { shortRuns: 1 });
    expect(intent).toMatchObject({ runsRun: 2, shortRuns: 1 });
    const next = step(setup, state, intent);
    expect(inn(next).runs).toBe(1);
    expect(batter(next, 'L1').runs).toBe(1);
    expect(inn(next).strikerId).toBe('L1');
    expect(lastBall(next).token).toMatchObject({ text: '1s', accessibilityLabel: 'One run, one short' });
  });

  it('U-CMD-13 ran three, one short scores two and changes ends', () => {
    const next = step(setup, state, scoreRuns(3, { shortRuns: 1 }));
    expect(inn(next).runs).toBe(2);
    expect(inn(next).strikerId).toBe('L2');
    expect(lastBall(next).token.text).toBe('2s');
  });

  it('U-CMD-14 bowled without a next batter leaves a vacancy prompt', () => {
    const intent = wicket({ dismissal: 'bowled' });
    expect(intent).toEqual({ type: 'wicket', dismissal: 'bowled' });
    const events = build(setup, state, intent);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      call: 'fair',
      runsTo: 'bat',
      runsRun: 0,
      boundary: 0,
      wicket: { type: 'bowled', playerOutId: 'L1', fielderIds: [], dismissalEnd: null },
    });
    const next = step(setup, state, intent);
    expect(inn(next).wickets).toBe(1);
    expect(next.pendingAction).toMatchObject({
      type: 'select_next_batter',
      position: 'striker',
      candidates: ['L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11'],
    });
    expect(lastBall(next).token).toMatchObject({ text: 'W', kind: 'wicket' });
  });

  it('U-CMD-15 wicket with the next batter yields delivery then batter_in under one action', () => {
    const events = build(setup, state, wicket({ dismissal: 'bowled', nextBatterId: 'L3' }));
    expect(events.map((event) => event.kind)).toEqual(['delivery', 'batter_in']);
    expect(events[1]).toEqual({ kind: 'batter_in', playerId: 'L3', position: 'striker' });
    const played = playScript(setup, ['start:L1:L2:T7', 'W>L3']);
    expect(played.events[1].actionId).toBe(played.events[2].actionId);
    expect(inn(played.state).strikerId).toBe('L3');
    expect(played.state.pendingAction).toBeNull();
  });

  it('U-CMD-16 swap strike', () => {
    expect(swapStrike()).toEqual({ type: 'swap_strike' });
    expect(build(setup, state, swapStrike())).toEqual([{ kind: 'strike_swapped' }]);
    const next = step(setup, state, swapStrike());
    expect(inn(next).strikerId).toBe('L2');
    expect(inn(next).legalBalls).toBe(0);
  });

  it('U-CMD-17 select bowler at an over start fills over_start', () => {
    const atOverEnd = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 0']);
    expect(selectBowler('T8')).toEqual({ type: 'select_bowler', bowlerId: 'T8' });
    expect(build(setup, atOverEnd.state, selectBowler('T8'))).toEqual([{ kind: 'bowler_selected', bowlerId: 'T8', reason: 'over_start' }]);
    expect(inn(step(setup, atOverEnd.state, selectBowler('T8'))).bowlerId).toBe('T8');
  });

  it('U-CMD-18 select bowler mid-over without a reason is refused', () => {
    const midOver = step(setup, state, scoreRuns(0));
    expect(buildEvents(setup, midOver, selectBowler('T8'))).toMatchObject({ ok: false, code: 'BOWLER_CHANGE_REASON_INVALID' });
  });

  it('U-CMD-19 batter in defaults to the single vacancy', () => {
    const runOut = play(setup, ['start:L1:L2:T7', 'ro:nn']);
    expect(batterIn('L3')).toEqual({ type: 'batter_in', playerId: 'L3' });
    expect(build(setup, runOut.state, batterIn('L3'))).toEqual([{ kind: 'batter_in', playerId: 'L3', position: 'non_striker' }]);
  });

  it('U-CMD-20 stumping without a fielder is given to the designated keeper', () => {
    const [payload] = build(setup, state, wicket({ dismissal: 'stumped' }));
    expect(payload).toMatchObject({ wicket: { type: 'stumped', fielderIds: ['T1'] } });
    const next = step(setup, state, wicket({ dismissal: 'stumped' }));
    expect(batter(next, 'L1').dismissalText).toBe('st Rizwan b Hassan');
  });

  it('U-CMD-21 penalty to the batting side defaults to the current innings', () => {
    const [payload] = build(setup, state, { type: 'penalty', teamId: 'LIO', runs: 5, reason: 'Ball hit helmet' });
    expect(payload).toEqual({ kind: 'penalty_awarded', teamId: 'LIO', inningsIndex: 0, runs: 5, reason: 'Ball hit helmet' });
    const next = step(setup, state, { type: 'penalty', teamId: 'LIO', runs: 5, reason: 'Ball hit helmet' });
    expect(inn(next).extras.penalty).toBe(5);
  });

  it('U-CMD-22 revise both innings yields two revisions in one action', () => {
    const midInnings = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 0 @T8 0 0 0 0 0 0 @T7 0 0 0 0 0 0 @T8 0 0 0 0 0 0 @T7 0 0 0 0 0 0']);
    const events = build(setup, midInnings.state, { type: 'revise_overs', inningsIndex: 0, overs: 12, scope: 'both_innings', reason: 'Rain' });
    expect(events).toHaveLength(2);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'overs_revised', inningsIndex: 0, maxBalls: 72, terminal: false }),
        expect.objectContaining({ kind: 'overs_revised', inningsIndex: 1, maxBalls: 72, terminal: false }),
      ]),
    );
    const next = step(setup, midInnings.state, { type: 'revise_overs', inningsIndex: 0, overs: 12, scope: 'both_innings', reason: 'Rain' });
    expect(inn(next).limits.maxBalls).toBe(72);
    expect(next.plannedRevisions[0].inningsIndex).toBe(1);
    expect(validateEvent(setup, midInnings.state, events[0])).toEqual({ ok: true, warnings: [] });
  });

  it('U-CMD-23 terminal revision of a suspended chase at 14.2', () => {
    const chase = chaseAfter(setup, { runs: 170, wickets: 7 }, [...Array.from({ length: 86 }, () => '1'), 'susp']);
    const events = build(chase.setup, chase.state, { type: 'revise_overs', inningsIndex: 1, balls: 86, target: 111, terminal: true, reason: 'Rain' });
    expect(events).toEqual([{ kind: 'overs_revised', inningsIndex: 1, maxBalls: 86, target: 111, terminal: true, reason: 'Rain' }]);
  });

  it('U-CMD-24 any delivery while a new-over bowler is pending is refused', () => {
    const atOverEnd = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 0']);
    expect(atOverEnd.state.pendingAction?.type).toBe('select_next_bowler');
    expect(buildEvents(setup, atOverEnd.state, scoreRuns(1))).toMatchObject({ ok: false, code: 'PENDING_ACTION_REQUIRED' });
  });

  it('U-CMD-25 buildEvents is pure', () => {
    const frozenSetup = deepFreeze(matchSetup());
    const frozenState = deepFreeze(fresh(frozenSetup).state);
    const intent = deepFreeze(wicket({ dismissal: 'caught', fielderIds: ['T9'], nextBatterId: 'L3' }));
    expect(buildEvents(frozenSetup, frozenState, intent)).toEqual(buildEvents(frozenSetup, frozenState, intent));
  });

  it('constructors for extras', () => {
    expect(wide()).toEqual({ type: 'wide', runsRun: 0 });
    expect(wide(1)).toEqual({ type: 'wide', runsRun: 1 });
    expect(wide(0, { boundary: true })).toEqual({ type: 'wide', runsRun: 0, boundary: true });
    expect(noBall()).toEqual({ type: 'no_ball' });
    expect(noBall({ runsTo: 'bye', runsRun: 2 })).toEqual({ type: 'no_ball', runsTo: 'bye', runsRun: 2 });
    expect(bye(2)).toEqual({ type: 'bye', runsRun: 2 });
    expect(legBye(0, { boundary: true })).toEqual({ type: 'leg_bye', runsRun: 0, boundary: true });
    expect(selectBowler('T8', 'injury')).toEqual({ type: 'select_bowler', bowlerId: 'T8', reason: 'injury' });
    expect(batterIn('L3', 'non_striker')).toEqual({ type: 'batter_in', playerId: 'L3', position: 'non_striker' });
  });

  it('start innings defaults the batting team to the suggestion and needs one without a toss', () => {
    const tossless = matchSetup({ toss: null });
    const empty = playScript(tossless, []).state;
    expect(buildEvents(tossless, empty, { type: 'start_innings', strikerId: 'L1', nonStrikerId: 'L2', bowlerId: 'T7' })).toMatchObject({
      ok: false,
      code: 'WRONG_BATTING_TEAM',
    });
    const standard = matchSetup();
    expect(build(standard, playScript(standard, []).state, { type: 'start_innings', strikerId: 'L1', nonStrikerId: 'L2', bowlerId: 'T7' })).toEqual([
      { kind: 'innings_started', inningsIndex: 0, battingTeamId: 'LIO', strikerId: 'L1', nonStrikerId: 'L2', bowlerId: 'T7' },
    ]);
  });

  it('retire and off-ball dismissal with a next batter fill the new vacancy', () => {
    expect(build(setup, state, { type: 'retire', playerId: 'L2', retirement: 'retired_hurt', nextBatterId: 'L3' })).toEqual([
      { kind: 'batter_retired', playerId: 'L2', retirement: 'retired_hurt' },
      { kind: 'batter_in', playerId: 'L3', position: 'non_striker' },
    ]);
    expect(build(setup, state, { type: 'off_ball_dismissal', playerId: 'L2', dismissal: 'run_out', fielderIds: ['T7'], nextBatterId: 'L3' })).toEqual([
      { kind: 'batter_dismissed', playerId: 'L2', type: 'run_out', fielderIds: ['T7'] },
      { kind: 'batter_in', playerId: 'L3', position: 'non_striker' },
    ]);
  });

  it('other organizer intents', () => {
    expect(build(setup, state, { type: 'suspend_play', reason: 'rain' })).toEqual([{ kind: 'play_suspended', reason: 'rain', note: null }]);
    expect(build(setup, state, { type: 'end_innings', reason: 'declared' })).toEqual([{ kind: 'innings_ended', reason: 'declared', absentees: [] }]);
    expect(build(setup, state, { type: 'end_match', outcome: { type: 'no_result', reason: 'Rain' } })).toEqual([
      { kind: 'match_ended', outcome: { type: 'no_result', reason: 'Rain' } },
    ]);
    expect(buildEvents(setup, state, { type: 'revise_overs', inningsIndex: 0, reason: 'Rain' })).toMatchObject({ ok: false, code: 'INVALID_OVERS_REVISION' });
    expect(buildEvents(setup, state, { type: 'revise_overs', inningsIndex: 1, overs: 10, scope: 'both_innings', reason: 'Rain' })).toMatchObject({
      ok: false,
      code: 'INVALID_OVERS_REVISION',
    });
  });
});

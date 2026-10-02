import type { DeliveryCall, DeliveryDismissalType } from '../../types';
import { DELIVERY_DISMISSAL_TYPES } from '../../types';
import { buildEvents, noBall, scoreRuns, wicket, type ScoringIntent } from '../commands';
import { playerMatchStats } from '../stats';
import { allowedDismissals, eligibleIncomingBatters, validateEvent } from '../validate';
import { matchSetup, playedMatch, playScript } from '../testing';
import { batter, bowler, build, chaseAt, delivery, fresh, inn, lastBall, play, step } from './helpers';

const FREE_HIT_SAFE: readonly DeliveryDismissalType[] = ['run_out', 'hit_ball_twice', 'obstructing_field', 'handled_ball'];

describe('allowedDismissals matrix (U-WKT-01..05)', () => {
  it('U-WKT-01 fair allows all nine', () => {
    expect(allowedDismissals('fair', false)).toEqual(DELIVERY_DISMISSAL_TYPES);
  });

  it('U-WKT-02 wide', () => {
    expect([...allowedDismissals('wide', false)].sort()).toEqual(['handled_ball', 'hit_wicket', 'obstructing_field', 'run_out', 'stumped']);
  });

  it('U-WKT-03 no-ball', () => {
    expect([...allowedDismissals('no_ball', false)].sort()).toEqual(['handled_ball', 'hit_ball_twice', 'obstructing_field', 'run_out']);
  });

  it.each<DeliveryCall>(['fair', 'wide', 'no_ball'])('U-WKT-04 free hit on a %s', (call) => {
    expect(allowedDismissals(call, true)).toEqual(allowedDismissals(call, false).filter((type) => FREE_HIT_SAFE.includes(type)));
  });

  const cells = (['fair', 'wide', 'no_ball'] as const).flatMap((call) =>
    [false, true].flatMap((freeHit) =>
      DELIVERY_DISMISSAL_TYPES.filter((type) => !allowedDismissals(call, freeHit).includes(type)).map((type) => [call, freeHit, type] as const),
    ),
  );

  it.each(cells)('U-WKT-05 %s free hit %s: %s is rejected', (call, freeHit, type) => {
    const setup = matchSetup();
    const base = play(setup, freeHit ? ['start:L1:L2:T7', 'nb'] : ['start:L1:L2:T7']).state;
    const striker = inn(base).strikerId ?? '';
    const end = FREE_HIT_SAFE.includes(type) && type !== 'hit_ball_twice' ? 'striker_end' : null;
    const payload = delivery(base, {
      call,
      ...(call === 'wide' ? {} : { runsTo: 'bat' as const }),
      wicket: { type, playerOutId: striker, fielderIds: [], dismissalEnd: end },
    });
    const byCall = allowedDismissals(call, false).includes(type);
    expect(validateEvent(setup, base, payload)).toMatchObject({
      ok: false,
      code: byCall ? 'DISMISSAL_NOT_ALLOWED_ON_FREE_HIT' : 'DISMISSAL_NOT_ALLOWED_ON_CALL',
    });
  });
});

describe('each dismissal on a fair ball (U-WKT-10..22)', () => {
  const { setup, state } = fresh();

  it.each<[string, ScoringIntent, string, string | null, string]>([
    ['U-WKT-10', wicket({ dismissal: 'bowled' }), 'L1', 'T7', 'b Hassan'],
    ['U-WKT-11', wicket({ dismissal: 'caught', fielderIds: ['T9'] }), 'L1', 'T7', 'c Naseem b Hassan'],
    ['U-WKT-12', wicket({ dismissal: 'caught', fielderIds: ['T7'] }), 'L1', 'T7', 'c & b Hassan'],
    ['U-WKT-13', wicket({ dismissal: 'caught' }), 'L1', 'T7', 'c ? b Hassan'],
    ['U-WKT-14', wicket({ dismissal: 'caught', fielderIds: ['T12'] }), 'L1', 'T7', 'c sub (Ali) b Hassan'],
    ['U-WKT-15', wicket({ dismissal: 'lbw' }), 'L1', 'T7', 'lbw b Hassan'],
    ['U-WKT-16', wicket({ dismissal: 'stumped', fielderIds: ['T1'] }), 'L1', 'T7', 'st Rizwan b Hassan'],
    ['U-WKT-17', wicket({ dismissal: 'hit_wicket' }), 'L1', 'T7', 'hit wicket b Hassan'],
    ['U-WKT-18', wicket({ dismissal: 'hit_ball_twice' }), 'L1', null, 'hit the ball twice'],
    ['U-WKT-19', wicket({ dismissal: 'run_out', dismissalEnd: 'striker_end', fielderIds: ['T9', 'T1'] }), 'L1', null, 'run out (Naseem/Rizwan)'],
    ['U-WKT-20a', wicket({ dismissal: 'run_out', dismissalEnd: 'striker_end', fielderIds: ['T9'] }), 'L1', null, 'run out (Naseem)'],
    ['U-WKT-20b', wicket({ dismissal: 'run_out', dismissalEnd: 'striker_end' }), 'L1', null, 'run out'],
    ['U-WKT-20c', wicket({ dismissal: 'run_out', dismissalEnd: 'striker_end', fielderIds: ['T12'] }), 'L1', null, 'run out (sub (Ali))'],
    ['U-WKT-21', wicket({ dismissal: 'obstructing_field', playerOutId: 'L2', dismissalEnd: 'non_striker_end' }), 'L2', null, 'obstructing the field'],
    ['U-WKT-22', wicket({ dismissal: 'handled_ball', dismissalEnd: 'striker_end' }), 'L1', null, 'handled the ball'],
  ])('%s', (_, intent, out, credited, text) => {
    const next = step(setup, state, intent);
    const innings = inn(next);
    expect(innings.wickets).toBe(1);
    const row = batter(next, out);
    expect(row.status).toBe('out');
    expect(row.dismissalText).toBe(text);
    expect(row.dismissal?.creditedBowlerId).toBe(credited);
    expect(row.dismissal?.onDelivery).toBe(true);
    expect(bowler(next, 'T7').wickets).toBe(credited === null ? 0 : 1);
    expect(next.pendingAction).toMatchObject({ type: 'select_next_batter', position: out === 'L1' ? 'striker' : 'non_striker' });
    expect(innings.fallOfWickets).toHaveLength(1);
  });

  it('U-WKT-11/16/19 fielding credit', () => {
    expect(playerMatchStats(step(setup, state, wicket({ dismissal: 'caught', fielderIds: ['T9'] })), 'T9').catches).toBe(1);
    expect(playerMatchStats(step(setup, state, wicket({ dismissal: 'stumped', fielderIds: ['T1'] })), 'T1').stumpings).toBe(1);
    const runOut = step(setup, state, wicket({ dismissal: 'run_out', dismissalEnd: 'striker_end', fielderIds: ['T9', 'T1'] }));
    expect(playerMatchStats(runOut, 'T9').runOuts).toBe(1);
    expect(playerMatchStats(runOut, 'T1').runOuts).toBe(1);
  });

  it('U-WKT-13 an unknown catcher warns FIELDER_UNKNOWN and credits no catch', () => {
    const [payload] = build(setup, state, wicket({ dismissal: 'caught' }));
    expect(validateEvent(setup, state, payload)).toEqual({ ok: true, warnings: [expect.objectContaining({ code: 'FIELDER_UNKNOWN' })] });
    const next = step(setup, state, wicket({ dismissal: 'caught' }));
    expect(['T1', 'T7', 'T9'].map((id) => playerMatchStats(next, id).catches)).toEqual([0, 0, 0]);
  });

  it('U-WKT-14 a substitute catcher never gets a batting row and is referenced by the event', () => {
    const [payload] = build(setup, state, wicket({ dismissal: 'caught', fielderIds: ['T12'] }));
    expect(payload).toMatchObject({ wicket: { fielderIds: ['T12'] } });
    expect(inn(step(setup, state, wicket({ dismissal: 'caught', fielderIds: ['T12'] }))).batting.some((row) => row.playerId === 'T12')).toBe(false);
  });
});

describe('off-ball dismissals and retirements (U-WKT-23..28)', () => {
  const { setup, state } = fresh();

  it('U-WKT-23 non-striker run out backing up', () => {
    const next = step(setup, state, { type: 'off_ball_dismissal', playerId: 'L2', dismissal: 'run_out', fielderIds: ['T7'] });
    expect(inn(next)).toMatchObject({ wickets: 1, legalBalls: 0, nonStrikerId: null, strikerId: 'L1' });
    expect(batter(next, 'L2')).toMatchObject({ status: 'out', dismissalText: 'run out (Hassan)' });
    expect(batter(next, 'L2').dismissal).toMatchObject({ onDelivery: false, bowlerId: 'T7', creditedBowlerId: null });
    expect(inn(next).fallOfWickets[0]).toMatchObject({ overLabel: '0.0', dismissalType: 'run_out' });
    expect(next.pendingAction).toMatchObject({ type: 'select_next_batter', position: 'non_striker' });
  });

  it('U-WKT-24 timed out keeps the vacancy open', () => {
    const bowled = step(setup, state, wicket({ dismissal: 'bowled' }));
    const next = step(setup, bowled, { type: 'off_ball_dismissal', playerId: 'L3', dismissal: 'timed_out' });
    expect(inn(next).wickets).toBe(2);
    expect(inn(next).strikerId).toBeNull();
    expect(batter(next, 'L3')).toMatchObject({ status: 'out', dismissalText: 'timed out' });
    expect(next.pendingAction).toMatchObject({ type: 'select_next_batter', position: 'striker' });
    expect(eligibleIncomingBatters(setup, next)[0]).toBe('L4');
  });

  it('U-WKT-25 off-ball obstructing the field', () => {
    const next = step(setup, state, { type: 'off_ball_dismissal', playerId: 'L2', dismissal: 'obstructing_field' });
    expect(batter(next, 'L2').dismissalText).toBe('obstructing the field');
    expect(inn(next).legalBalls).toBe(0);
  });

  it('U-WKT-26 retired hurt is not a wicket and ends the partnership', () => {
    const next = step(setup, step(setup, state, scoreRuns(2)), { type: 'retire', playerId: 'L1', retirement: 'retired_hurt' });
    expect(inn(next).wickets).toBe(0);
    expect(inn(next).fallOfWickets).toEqual([]);
    expect(batter(next, 'L1')).toMatchObject({ status: 'retired_hurt', dismissalText: 'retired hurt' });
    expect(inn(next).partnerships[0].endedBy).toBe('retirement');
    expect(next.pendingAction).toMatchObject({ type: 'select_next_batter', position: 'striker' });
  });

  it('U-WKT-27 retired not out', () => {
    const next = step(setup, state, { type: 'retire', playerId: 'L1', retirement: 'retired_not_out' });
    expect(batter(next, 'L1')).toMatchObject({ status: 'retired_not_out', dismissalText: 'retired not out' });
  });

  it('U-WKT-28 retired out is a wicket and can never return', () => {
    const next = step(setup, state, { type: 'retire', playerId: 'L1', retirement: 'retired_out' });
    expect(inn(next).wickets).toBe(1);
    expect(batter(next, 'L1')).toMatchObject({ status: 'out', dismissalText: 'retired out' });
    expect(inn(next).fallOfWickets[0].dismissalType).toBe('retired_out');
    expect(eligibleIncomingBatters(setup, next)).not.toContain('L1');
    expect(buildEvents(setup, next, { type: 'batter_in', playerId: 'L1' })).toMatchObject({ ok: false, code: 'BATTER_ALREADY_OUT' });
  });
});

describe('wickets combined with extras (U-WKT-30..44)', () => {
  const { setup, state } = fresh();

  it.each<[string, ScoringIntent, Record<string, number>, string, string | null, string, boolean]>([
    ['U-WKT-30', wicket({ dismissal: 'stumped', call: 'wide' }), { wides: 1 }, 'L1', 'T7', 'WD+W', false],
    ['U-WKT-31', wicket({ dismissal: 'run_out', call: 'wide', runsRun: 1, playerOutId: 'L1', dismissalEnd: 'non_striker_end' }), { wides: 2 }, 'L1', null, 'WD+1+W', false],
    ['U-WKT-32', wicket({ dismissal: 'hit_wicket', call: 'wide' }), { wides: 1 }, 'L1', 'T7', 'WD+W', false],
    ['U-WKT-33', wicket({ dismissal: 'run_out', call: 'no_ball', runsRun: 1, playerOutId: 'L2', dismissalEnd: 'non_striker_end' }), { noBalls: 1 }, 'L2', null, 'NB+1+W', false],
    ['U-WKT-34', wicket({ dismissal: 'run_out', call: 'no_ball', runsTo: 'bye', runsRun: 1, playerOutId: 'L1', dismissalEnd: 'striker_end' }), { noBalls: 1, byes: 1 }, 'L1', null, 'NB+1B+W', false],
    ['U-WKT-35', wicket({ dismissal: 'hit_ball_twice', call: 'no_ball' }), { noBalls: 1 }, 'L1', null, 'NB+W', false],
    ['U-WKT-36', wicket({ dismissal: 'run_out', runsTo: 'bye', runsRun: 1, dismissalEnd: 'striker_end' }), { byes: 1 }, 'L1', null, 'B1+W', true],
    ['U-WKT-37', wicket({ dismissal: 'run_out', runsTo: 'leg_bye', runsRun: 1, dismissalEnd: 'striker_end' }), { legByes: 1 }, 'L1', null, 'LB1+W', true],
    ['U-WKT-38', wicket({ dismissal: 'obstructing_field', call: 'no_ball', playerOutId: 'L1', dismissalEnd: 'striker_end' }), { noBalls: 1 }, 'L1', null, 'NB+W', false],
  ])('%s', (_, intent, extras, out, credited, token, legal) => {
    const next = step(setup, state, intent);
    expect(inn(next).extras).toMatchObject(extras);
    expect(batter(next, out).status).toBe('out');
    expect(batter(next, out).dismissal?.creditedBowlerId).toBe(credited);
    expect(lastBall(next).token).toMatchObject({ text: token, kind: 'wicket' });
    expect(lastBall(next).isLegal).toBe(legal);
  });

  it('EC-W-01 stumped off a wide keeps the wide, is not faced, charges and credits the bowler', () => {
    const next = step(setup, state, wicket({ dismissal: 'stumped', call: 'wide' }));
    expect(inn(next).runs).toBe(1);
    expect(batter(next, 'L1')).toMatchObject({ balls: 0, dismissalText: 'st Rizwan b Hassan' });
    expect(bowler(next, 'T7')).toMatchObject({ runsConceded: 1, wickets: 1, legalBalls: 0 });
    expect(next.pendingAction).toMatchObject({ type: 'select_next_batter', position: 'striker' });
  });

  it('U-WKT-33 run out off a no-ball: striker faced, one run to the batter, free hit next', () => {
    const next = step(setup, state, wicket({ dismissal: 'run_out', call: 'no_ball', runsRun: 1, playerOutId: 'L2', dismissalEnd: 'non_striker_end' }));
    expect(batter(next, 'L1')).toMatchObject({ runs: 1, balls: 1 });
    expect(inn(next).isFreeHitNext).toBe(true);
    expect(inn(next).runs).toBe(2);
  });

  it('U-WKT-39/40/41/42 impossible dismissals are rejected', () => {
    expect(buildEvents(setup, state, wicket({ dismissal: 'caught', call: 'no_ball' }))).toMatchObject({ ok: false, code: 'DISMISSAL_NOT_ALLOWED_ON_CALL' });
    expect(buildEvents(setup, state, wicket({ dismissal: 'bowled', call: 'wide' }))).toMatchObject({ ok: false, code: 'DISMISSAL_NOT_ALLOWED_ON_CALL' });
    const freeHit = step(setup, state, noBall());
    expect(buildEvents(setup, freeHit, wicket({ dismissal: 'caught', fielderIds: ['T9'] }))).toMatchObject({ ok: false, code: 'DISMISSAL_NOT_ALLOWED_ON_FREE_HIT' });
    expect(buildEvents(setup, freeHit, wicket({ dismissal: 'stumped', call: 'wide' }))).toMatchObject({ ok: false, code: 'DISMISSAL_NOT_ALLOWED_ON_FREE_HIT' });
  });

  it('U-WKT-43 run out on a free hit counts', () => {
    const freeHit = step(setup, state, noBall());
    const next = step(setup, freeHit, wicket({ dismissal: 'run_out', runsRun: 1, dismissalEnd: 'striker_end' }));
    expect(inn(next).wickets).toBe(1);
    expect(lastBall(next).token.text).toBe('1+W');
    expect(lastBall(next).isLegal).toBe(true);
  });

  it('U-WKT-44 runs with a striker-only dismissal are rejected', () => {
    const caught = delivery(state, { runsRun: 1, wicket: { type: 'caught', playerOutId: 'L1', fielderIds: [], dismissalEnd: null } });
    const bowled = delivery(state, { boundary: 4, wicket: { type: 'bowled', playerOutId: 'L1', fielderIds: [], dismissalEnd: null } });
    expect(validateEvent(setup, state, caught)).toMatchObject({ ok: false, code: 'RUNS_NOT_ALLOWED_WITH_DISMISSAL' });
    expect(validateEvent(setup, state, bowled)).toMatchObject({ ok: false, code: 'RUNS_NOT_ALLOWED_WITH_DISMISSAL' });
  });
});

describe('run-out ends and the next striker (U-RO-01..10)', () => {
  const setup = matchSetup();

  it.each<[string, readonly string[], number, string | null, string | null, string]>([
    ['U-RO-01', ['ro:ss:0'], 0, null, 'L2', 'L3'],
    ['U-RO-02', ['ro:sn:0'], 0, 'L2', null, 'L2'],
    ['U-RO-03', ['ro:ss:1'], 1, null, 'L2', 'L3'],
    ['U-RO-04', ['ro:nn:1'], 1, 'L1', null, 'L1'],
    ['U-RO-05', ['ro:ns:1'], 1, null, 'L1', 'L3'],
    ['U-RO-06', ['ro:nn:0'], 0, 'L1', null, 'L1'],
    ['U-RO-11', ['ro:sn:1'], 1, 'L2', null, 'L2'],
    ['U-RO-12', ['ro:ns:0'], 0, null, 'L1', 'L3'],
    ['U-RO-09', ['W:c:T9'], 0, null, 'L2', 'L3'],
    ['U-RO-10', ['ro:ss:2'], 2, null, 'L2', 'L3'],
  ])('%s mid-over', (_, steps, runs, striker, nonStriker, nextStriker) => {
    const out = play(setup, ['start:L1:L2:T7', ...steps]).state;
    expect(inn(out).runs).toBe(runs);
    expect(inn(out).strikerId).toBe(striker);
    expect(inn(out).nonStrikerId).toBe(nonStriker);
    expect(inn(play(setup, ['start:L1:L2:T7', ...steps, '>L3']).state).strikerId).toBe(nextStriker);
  });

  it('U-RO-07 run out of the striker off the last ball: vacancy moves to the non-striker end', () => {
    const out = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 ro:ss']).state;
    expect(inn(out)).toMatchObject({ strikerId: 'L2', nonStrikerId: null });
    expect(out.pendingAction).toMatchObject({ type: 'select_next_batter', position: 'non_striker' });
    const filled = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 ro:ss', '>L3']).state;
    expect(inn(filled)).toMatchObject({ strikerId: 'L2', nonStrikerId: 'L3' });
    expect(filled.pendingAction?.type).toBe('select_next_bowler');
  });

  it('U-RO-08 caught off the last ball: the not-out batter faces the next over', () => {
    const filled = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 W:c:T9>L3']).state;
    expect(inn(filled)).toMatchObject({ strikerId: 'L2', nonStrikerId: 'L3' });
  });
});

describe("Law 16.6 — no wicket after the winning run (U-L166)", () => {
  const setup = matchSetup();

  it('U-L166-01 need 1, one run completed, non-striker run out going for the second is rejected', () => {
    const { state } = chaseAt(setup, { firstRuns: 149, runs: 149, wickets: 8 });
    expect(state.chase).toMatchObject({ target: 150, runsRequired: 1 });
    const nonStriker = inn(state).nonStrikerId ?? '';
    expect(buildEvents(setup, state, wicket({ dismissal: 'run_out', runsRun: 1, playerOutId: nonStriker, dismissalEnd: 'striker_end' }))).toMatchObject({
      ok: false,
      code: 'WICKET_AFTER_RESULT',
    });
  });

  it('U-L166-02 recorded without the wicket the chase is won by the wickets in hand', () => {
    const { state } = chaseAt(setup, { firstRuns: 149, runs: 149, wickets: 8 }, ['1']);
    expect(inn(state).completion?.reason).toBe('target_reached');
    expect(state.naturalResult).toMatchObject({ type: 'win', winnerTeamId: 'TIG', margin: { kind: 'wickets', wickets: 2 } });
    expect(state.pendingAction?.type).toBe('confirm_result');
    expect(state.resultText).toMatch(/^Tigers won by 2 wickets \(\d+ balls left\)$/);
  });

  it('U-L166-02b nine down: recorded without the wicket it is won by 1 wicket', () => {
    const { state } = chaseAt(setup, { firstRuns: 149, runs: 149, wickets: 9 });
    const nonStriker = inn(state).nonStrikerId ?? '';
    expect(buildEvents(setup, state, wicket({ dismissal: 'run_out', runsRun: 1, playerOutId: nonStriker, dismissalEnd: 'striker_end' }))).toMatchObject({
      ok: false,
      code: 'WICKET_AFTER_RESULT',
    });
    const won = step(setup, state, scoreRuns(1));
    expect(won.resultText).toMatch(/^Tigers won by 1 wicket \(\d+ balls left\)$/);
  });

  it('U-L166-03 a stumping off a winning wide is rejected', () => {
    const { state } = chaseAt(setup, { firstRuns: 149, runs: 149, wickets: 8 });
    expect(buildEvents(setup, state, wicket({ dismissal: 'stumped', call: 'wide' }))).toMatchObject({ ok: false, code: 'WICKET_AFTER_RESULT' });
  });

  it('U-L166-04 a wicket with the scores only level still counts', () => {
    const { state } = chaseAt(setup, { firstRuns: 149, runs: 148, wickets: 8 });
    const nonStriker = inn(state).nonStrikerId ?? '';
    const next = step(setup, state, wicket({ dismissal: 'run_out', runsRun: 1, playerOutId: nonStriker, dismissalEnd: 'striker_end' }));
    expect(inn(next)).toMatchObject({ runs: 149, wickets: 9, status: 'in_progress' });
  });

  it('EC-W-17 level on the last ball with a run out: the wicket counts and the match is tied', () => {
    const first = playedMatch({ setup, first: { runs: 149 }, second: null, end: null });
    const played = playScript(setup, ['start:T1:T2:L10', ...Array.from({ length: 119 }, (_, index) => (index < 24 ? '6' : index === 24 ? '4' : '0')), 'ro:ns:1'], {
      prior: first.events,
      autoBowlers: true,
    });
    expect(inn(played.state, 1)).toMatchObject({ runs: 149, wickets: 1, completion: { reason: 'overs_complete' } });
    expect(played.state.naturalResult).toEqual({ type: 'tie', decider: null });
  });

  it('U-L166-06 a no-ball boundary that reaches the target cannot carry a run out', () => {
    const { state } = chaseAt(setup, { firstRuns: 149, runs: 145, wickets: 8 });
    const payload = delivery(state, {
      call: 'no_ball',
      runsTo: 'bat',
      boundary: 4,
      wicket: { type: 'run_out', playerOutId: inn(state).nonStrikerId ?? '', fielderIds: [], dismissalEnd: 'non_striker_end' },
    });
    expect(validateEvent(setup, state, payload)).toMatchObject({ ok: false, code: 'WICKET_AFTER_RESULT' });
  });

  it('U-L166-05 the same rule applies in a super-over chase', () => {
    const tied = playedMatch({ setup, first: { runs: 100 }, second: { runs: 100, wickets: 2 }, end: null });
    expect(tied.state.naturalResult).toEqual({ type: 'tie', decider: null });
    const superOver = playScript(setup, ['so', 'start:T1:T2:L10', '6 4 0 0 0 0', 'start:L1:L2:T7', '6 4'], { prior: tied.events });
    const state = superOver.state;
    expect(inn(state)).toMatchObject({ index: 3, kind: 'super_over', runs: 10, target: { runs: 11, source: 'super_over' } });
    expect(buildEvents(setup, state, wicket({ dismissal: 'run_out', runsRun: 1, playerOutId: 'L2', dismissalEnd: 'striker_end' }))).toMatchObject({
      ok: false,
      code: 'WICKET_AFTER_RESULT',
    });
  });
});

describe('substitutes and fielders', () => {
  const setup = matchSetup();

  it('substitutes may never open, come in or bowl', () => {
    const empty = playScript(setup, []).state;
    expect(buildEvents(setup, empty, { type: 'start_innings', strikerId: 'L12', nonStrikerId: 'L2', bowlerId: 'T7' })).toMatchObject({
      ok: false,
      code: 'SUBSTITUTE_NOT_ALLOWED',
    });
    expect(buildEvents(setup, empty, { type: 'start_innings', strikerId: 'L1', nonStrikerId: 'L2', bowlerId: 'T12' })).toMatchObject({
      ok: false,
      code: 'SUBSTITUTE_NOT_ALLOWED',
    });
    const vacancy = play(setup, ['start:L1:L2:T7', 'W']).state;
    expect(buildEvents(setup, vacancy, { type: 'batter_in', playerId: 'L12' })).toMatchObject({ ok: false, code: 'SUBSTITUTE_NOT_ALLOWED' });
    const overEnd = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 0']).state;
    expect(buildEvents(setup, overEnd, { type: 'select_bowler', bowlerId: 'T12' })).toMatchObject({ ok: false, code: 'SUBSTITUTE_NOT_ALLOWED' });
  });

  it('substitutes are never batting rows or incoming candidates', () => {
    const vacancy = play(setup, ['start:L1:L2:T7', 'W']).state;
    expect(inn(vacancy).batting.map((row) => row.playerId)).not.toContain('L12');
    expect(eligibleIncomingBatters(setup, vacancy)).not.toContain('L12');
  });

  it('run out by a substitute', () => {
    const next = play(setup, ['start:L1:L2:T7', 'ro:ss:0:T12']).state;
    expect(batter(next, 'L1').dismissalText).toBe('run out (sub (Ali))');
  });

  it('stumping without a keeper designated leaves the fielder unknown', () => {
    const noKeeper = matchSetup({ players: matchSetup().players.map((player) => ({ ...player, isWicketKeeper: false })) });
    const state = fresh(noKeeper).state;
    const [payload] = build(noKeeper, state, wicket({ dismissal: 'stumped' }));
    expect(payload).toMatchObject({ wicket: { fielderIds: [] } });
    expect(batter(step(noKeeper, state, wicket({ dismissal: 'stumped' })), 'L1').dismissalText).toBe('st ? b Hassan');
  });

  it('fielders must come from the fielding side, at most two', () => {
    const state = fresh(setup).state;
    expect(buildEvents(setup, state, wicket({ dismissal: 'caught', fielderIds: ['L5'] }))).toMatchObject({ ok: false, code: 'FIELDER_NOT_IN_FIELDING_SIDE' });
    expect(buildEvents(setup, state, wicket({ dismissal: 'run_out', dismissalEnd: 'striker_end', fielderIds: ['T1', 'T2', 'T3'] }))).toMatchObject({
      ok: false,
      code: 'TOO_MANY_FIELDERS',
    });
  });
});

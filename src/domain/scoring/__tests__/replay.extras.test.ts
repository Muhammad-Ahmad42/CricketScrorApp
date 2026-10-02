import type { MatchRules, MatchSetup } from '../../types';
import { buildEvents, bye, legBye, noBall, scoreRuns, wide, type ScoringIntent } from '../commands';
import { BASE_MATCH_RULES } from '../presets';
import { validateEvent } from '../validate';
import { matchSetup } from '../testing';
import { batter, bowler, build, delivery, fresh, inn, lastBall, play, step } from './helpers';

function setupWith(rules: Partial<MatchRules>): MatchSetup {
  return matchSetup({ rules });
}

function after(intent: ScoringIntent, rules: Partial<MatchRules> = {}) {
  const { setup, state } = fresh(setupWith(rules));
  return { setup, before: state, state: step(setup, state, intent) };
}

describe('wides (U-EXT-01..11)', () => {
  it.each<[string, ScoringIntent, Partial<MatchRules>, number, string, string]>([
    ['U-EXT-01', wide(), {}, 1, 'L1', 'WD'],
    ['U-EXT-02', wide(1), {}, 2, 'L2', 'WD+1'],
    ['U-EXT-03', wide(2), {}, 3, 'L1', 'WD+2'],
    ['U-EXT-04', wide(3), {}, 4, 'L2', 'WD+3'],
    ['U-EXT-05', wide(0, { boundary: true }), {}, 5, 'L1', 'WD+4'],
    ['U-EXT-06', wide(5), {}, 6, 'L2', 'WD+5'],
    ['U-EXT-07', wide(), { wide: { penaltyRuns: 0, countsAsBall: false } }, 0, 'L1', 'WD'],
    ['U-EXT-08', wide(1), { wide: { penaltyRuns: 2, countsAsBall: false } }, 3, 'L2', 'WD+1'],
    ['U-EXT-10', wide(2, { shortRuns: 1 }), {}, 2, 'L1', 'WD+1s'],
  ])('%s wide figures', (_, intent, rules, wides, striker, token) => {
    const { state } = after(intent, rules);
    const innings = inn(state);
    expect(innings.extras.wides).toBe(wides);
    expect(innings.runs).toBe(wides);
    expect(innings.legalBalls).toBe(0);
    expect(batter(state, 'L1').balls).toBe(0);
    expect(bowler(state, 'T7')).toMatchObject({ runsConceded: wides, wideDeliveries: 1, wideRuns: wides, legalBalls: 0 });
    expect(lastBall(state)).toMatchObject({ isLegal: false, isBallFaced: false, bowlerRuns: wides, runsTo: 'wide' });
    expect(innings.strikerId).toBe(striker);
    expect(lastBall(state).token).toMatchObject({ text: token, kind: 'wide' });
  });

  it('U-EXT-06 a custom wide of five run warns UNUSUAL_RUNS', () => {
    const { setup, state } = fresh();
    const [payload] = build(setup, state, wide(5));
    expect(validateEvent(setup, state, payload)).toEqual({ ok: true, warnings: [expect.objectContaining({ code: 'UNUSUAL_RUNS' })] });
  });

  it('U-EXT-09 wides that count as balls end the over but are never balls faced', () => {
    const setup = setupWith({ wide: { penaltyRuns: 1, countsAsBall: true } });
    const { state } = play(setup, ['start:L1:L2:T7', 'wd wd wd wd wd wd']);
    const innings = inn(state);
    expect(innings.extras.wides).toBe(6);
    expect(innings.legalBalls).toBe(6);
    expect(innings.balls[5].endsOver).toBe(true);
    expect(innings.balls.every((ball) => ball.isLegal && !ball.isBallFaced)).toBe(true);
    expect(batter(state, 'L1').balls).toBe(0);
    expect(innings.strikerId).toBe('L2');
    expect(state.pendingAction?.type).toBe('select_next_bowler');
  });

  it('U-EXT-11 a six off a wide is rejected', () => {
    const { setup, state } = fresh();
    expect(validateEvent(setup, state, delivery(state, { call: 'wide', boundary: 6 }))).toMatchObject({ ok: false, code: 'SIX_NOT_OFF_BAT' });
  });

  it('a wide is always charged to the bowler and never faced even with a boundary', () => {
    const { state } = after(wide(0, { boundary: true }));
    expect(bowler(state, 'T7').runsConceded).toBe(5);
    expect(batter(state, 'L1').balls).toBe(0);
  });
});

describe('no-balls (U-EXT-12..24)', () => {
  it.each<[string, ScoringIntent, Partial<MatchRules>, number, number, number, number, string, boolean, string]>([
    ['U-EXT-12', noBall(), {}, 1, 0, 1, 1, 'L1', true, 'NB'],
    ['U-EXT-13', noBall({ runsRun: 1 }), {}, 1, 1, 2, 2, 'L2', true, 'NB+1'],
    ['U-EXT-14', noBall({ runsRun: 2 }), {}, 1, 2, 3, 3, 'L1', true, 'NB+2'],
    ['U-EXT-15', noBall({ runsRun: 3 }), {}, 1, 3, 4, 4, 'L2', true, 'NB+3'],
    ['U-EXT-16', noBall({ boundary: 4 }), {}, 1, 4, 5, 5, 'L1', true, 'NB+4'],
    ['U-EXT-17', noBall({ boundary: 6 }), {}, 1, 6, 7, 7, 'L1', true, 'NB+6'],
    ['U-EXT-18', noBall({ runsTo: 'bye', runsRun: 2 }), {}, 1, 0, 3, 1, 'L1', true, 'NB+2B'],
    ['U-EXT-19', noBall({ runsTo: 'leg_bye', runsRun: 1 }), {}, 1, 0, 2, 1, 'L2', true, 'NB+1LB'],
    ['U-EXT-20', noBall({ runsTo: 'bye', boundary: 4 }), {}, 1, 0, 5, 1, 'L1', true, 'NB+4B'],
    ['U-EXT-21', noBall(), { noBall: { penaltyRuns: 2, freeHit: true, countsAsBall: false } }, 2, 0, 2, 2, 'L1', true, 'NB'],
    ['U-EXT-22', noBall(), { noBall: { penaltyRuns: 1, freeHit: false, countsAsBall: false } }, 1, 0, 1, 1, 'L1', false, 'NB'],
  ])('%s no-ball figures', (_, intent, rules, nb, batterRuns, total, bowlerRuns, striker, freeHit, token) => {
    const { state } = after(intent, rules);
    const innings = inn(state);
    expect(innings.extras.noBalls).toBe(nb);
    expect(innings.runs).toBe(total);
    expect(batter(state, 'L1')).toMatchObject({ runs: batterRuns, balls: 1 });
    expect(bowler(state, 'T7')).toMatchObject({ runsConceded: bowlerRuns, noBallDeliveries: 1 });
    expect(innings.legalBalls).toBe(0);
    expect(innings.strikerId).toBe(striker);
    expect(innings.isFreeHitNext).toBe(freeHit);
    expect(lastBall(state).token).toMatchObject({ text: token, kind: 'no_ball' });
  });

  it('U-EXT-16/17 boundaries off a no-ball count as fours and sixes', () => {
    expect(batter(after(noBall({ boundary: 4 })).state, 'L1').fours).toBe(1);
    expect(batter(after(noBall({ boundary: 6 })).state, 'L1').sixes).toBe(1);
  });

  it('U-EXT-18 no ball plus two byes: byes not charged, label spelled out', () => {
    const { state } = after(noBall({ runsTo: 'bye', runsRun: 2 }));
    expect(inn(state).extras).toMatchObject({ noBalls: 1, byes: 2, total: 3 });
    expect(lastBall(state).token.accessibilityLabel).toBe('No ball, plus two byes');
  });

  it('U-EXT-19 no ball plus a leg bye', () => {
    expect(inn(after(noBall({ runsTo: 'leg_bye', runsRun: 1 })).state).extras).toMatchObject({ noBalls: 1, legByes: 1 });
  });

  it('U-EXT-23 a no-ball that counts as a ball', () => {
    const { state } = after(noBall(), { noBall: { penaltyRuns: 1, freeHit: true, countsAsBall: true } });
    expect(inn(state).legalBalls).toBe(1);
    expect(lastBall(state).isLegal).toBe(true);
    expect(inn(state).isFreeHitNext).toBe(true);
  });

  it('U-EXT-24 six as byes off a no-ball is rejected', () => {
    const { setup, state } = fresh();
    expect(validateEvent(setup, state, delivery(state, { call: 'no_ball', runsTo: 'bye', boundary: 6 }))).toMatchObject({
      ok: false,
      code: 'SIX_NOT_OFF_BAT',
    });
  });

  it('EC-D-20 a no-ball on the last scheduled ball keeps the over going with a free hit', () => {
    const { state } = play(matchSetup(), ['start:L1:L2:T7', '0 0 0 0 0 nb']);
    expect(inn(state).legalBalls).toBe(5);
    expect(inn(state).isFreeHitNext).toBe(true);
    expect(state.pendingAction).toBeNull();
  });
});

describe('free hit sequence (U-EXT-25)', () => {
  it('carries through wides and no-balls and clears after a fair ball', () => {
    const { state } = play(matchSetup(), ['start:L1:L2:T7', 'nb wd nb 0 0']);
    const balls = inn(state).balls;
    expect(balls.map((ball) => ball.isFreeHit)).toEqual([false, true, true, true, false]);
    expect(balls.map((ball) => ball.token.isFreeHit)).toEqual([false, true, true, true, false]);
    const flags = [1, 2, 3, 4, 5].map((count) => inn(play(matchSetup(), ['start:L1:L2:T7', ...['nb', 'wd', 'nb', '0', '0'].slice(0, count)]).state).isFreeHitNext);
    expect(flags).toEqual([true, true, true, false, false]);
  });

  it('freeHit: false never sets a free hit', () => {
    const setup = setupWith({ noBall: { penaltyRuns: 1, freeHit: false, countsAsBall: false } });
    const { state } = play(setup, ['start:L1:L2:T7', 'nb']);
    expect(inn(state).isFreeHitNext).toBe(false);
  });
});

describe('byes and leg-byes (U-EXT-26..35)', () => {
  it.each<[string, ScoringIntent, 'byes' | 'legByes', number, string, string]>([
    ['U-EXT-26', bye(1), 'byes', 1, 'L2', 'B1'],
    ['U-EXT-27', bye(2), 'byes', 2, 'L1', 'B2'],
    ['U-EXT-28', bye(3), 'byes', 3, 'L2', 'B3'],
    ['U-EXT-29', bye(0, { boundary: true }), 'byes', 4, 'L1', 'B4'],
    ['U-EXT-30', bye(4), 'byes', 4, 'L1', 'B4'],
    ['U-EXT-31', bye(5), 'byes', 5, 'L2', 'B5'],
    ['U-EXT-32', legBye(1), 'legByes', 1, 'L2', 'LB1'],
    ['U-EXT-33a', legBye(2), 'legByes', 2, 'L1', 'LB2'],
    ['U-EXT-33b', legBye(3), 'legByes', 3, 'L2', 'LB3'],
    ['U-EXT-33c', legBye(0, { boundary: true }), 'legByes', 4, 'L1', 'LB4'],
    ['U-EXT-34', legBye(2, { shortRuns: 1 }), 'legByes', 1, 'L1', 'LB1s'],
    ['U-EXT-34b', bye(3, { shortRuns: 1 }), 'byes', 2, 'L2', 'B2s'],
  ])('%s', (_, intent, key, runs, striker, token) => {
    const { state } = after(intent);
    expect(inn(state).extras[key]).toBe(runs);
    expect(inn(state).runs).toBe(runs);
    expect(batter(state, 'L1')).toMatchObject({ balls: 1, runs: 0 });
    expect(bowler(state, 'T7')).toMatchObject({ runsConceded: 0, dots: 1 });
    expect(inn(state).strikerId).toBe(striker);
    expect(lastBall(state).token.text).toBe(token);
  });

  it('U-EXT-35 six as byes is rejected', () => {
    const { setup, state } = fresh();
    expect(validateEvent(setup, state, delivery(state, { runsTo: 'bye', boundary: 6 }))).toMatchObject({ ok: false, code: 'SIX_NOT_OFF_BAT' });
  });

  it('EC-D-15 a leg-bye four is a bowler dot with no change of ends', () => {
    const { state } = after(legBye(0, { boundary: true }));
    expect(bowler(state, 'T7').dots).toBe(1);
    expect(inn(state).strikerId).toBe('L1');
  });
});

describe('extras totals', () => {
  it('total always equals the sum of its parts', () => {
    const { state } = play(matchSetup(), ['start:L1:L2:T7', 'wd1 nb2b b1 lb2 nb4 wd4 1', { type: 'penalty', teamId: 'LIO', runs: 5, reason: 'Fielder helmet' }]);
    const extras = inn(state).extras;
    expect(extras.total).toBe(extras.wides + extras.noBalls + extras.byes + extras.legByes + extras.penalty);
    expect(extras).toEqual({ wides: 7, noBalls: 2, byes: 3, legByes: 2, penalty: 5, total: 19 });
    expect(inn(state).runs).toBe(19 + 4 + 1);
  });

  it('EC-D-21 8-ball overs', () => {
    const setup = setupWith({ ballsPerOver: 8 });
    const { state } = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 0 0 0']);
    expect(inn(state).balls.map((ball) => ball.label)).toEqual(['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8']);
    expect(state.pendingAction?.type).toBe('select_next_bowler');
  });

  it('EC-D-22 one ball per over forces bowlers to alternate', () => {
    const setup = setupWith({ ballsPerOver: 1, maxOversPerBowler: null });
    const { state } = play(setup, ['start:L1:L2:T7', '0 @T8 0 @T7 0']);
    expect(inn(state).legalBalls).toBe(3);
    expect(buildEvents(setup, play(setup, ['start:L1:L2:T7', '0']).state, { type: 'select_bowler', bowlerId: 'T7' })).toMatchObject({
      ok: false,
      code: 'BOWLER_CONSECUTIVE_OVERS',
    });
  });

  it('base rules are the Laws defaults', () => {
    expect(BASE_MATCH_RULES.wide).toEqual({ penaltyRuns: 1, countsAsBall: false });
    expect(scoreRuns(0)).toEqual({ type: 'runs', runsRun: 0 });
  });
});

import type { BallRecord, DismissalRecord, DismissalType } from '../../types';
import {
  ballToken,
  builtinFormatOvers,
  dismissalText,
  formatBowlingFigures,
  formatDisplayLabel,
  formatNrr,
  formatPresetName,
  formatOvers,
  formatRate,
  formatRequirement,
  formatRequirementCompact,
  formatScore,
} from '../format';
import { battingAverage, ballsToOvers, economyRate, requiredRunRate, runRate, strikeRate } from '../stats';
import { matchSetup } from '../testing';

const PLAYERS = matchSetup().players;

describe('formulas (U-STAT-01..08)', () => {
  it('U-STAT-01/02 decimal overs', () => {
    expect(ballsToOvers(100, 6)).toBeCloseTo(16.666667, 6);
    expect(ballsToOvers(10, 8)).toBeCloseTo(1.25, 6);
  });

  it('U-STAT-03 strike rate', () => {
    expect(strikeRate(13, 7)).toBeCloseTo(185.714286, 6);
    expect(strikeRate(0, 0)).toBeNull();
  });

  it('U-STAT-04 economy', () => {
    expect(economyRate(28, 22, 6)).toBeCloseTo(7.636364, 6);
    expect(economyRate(5, 0, 6)).toBeNull();
  });

  it('U-STAT-05/06/07 run rates', () => {
    expect(runRate(142, 100, 6)).toBeCloseTo(8.52, 6);
    expect(runRate(10, 0, 6)).toBeNull();
    expect(requiredRunRate(76, 50, 6)).toBeCloseTo(9.12, 6);
    expect(requiredRunRate(10, 0, 6)).toBeNull();
  });

  it('U-STAT-08 batting average', () => {
    expect(battingAverage(250, 5)).toBe(50);
    expect(battingAverage(250, 0)).toBeNull();
  });
});

describe('number formatting (U-FMT-01..06)', () => {
  it('U-FMT-01 overs', () => {
    expect(formatOvers(100, 6)).toBe('16.4');
    expect(formatOvers(120, 6)).toBe('20');
    expect(formatOvers(0, 6)).toBe('0');
    expect(formatOvers(120, 6, { alwaysShowBalls: true })).toBe('20.0');
    expect(formatOvers(100, 6, { alwaysShowBalls: true })).toBe('16.4');
    expect(formatOvers(10, 8)).toBe('1.2');
    expect(formatOvers(5, 6)).toBe('0.5');
  });

  it('U-FMT-02 score', () => {
    expect(formatScore(142, 4)).toBe('142/4');
  });

  it('U-FMT-03 rates', () => {
    expect(formatRate(8.5238)).toBe('8.52');
    expect(formatRate(null)).toBe('–');
    expect(formatRate(10.5)).toBe('10.50');
    expect(formatRate(Number.NaN)).toBe('–');
  });

  it('U-FMT-04 net run rate with explicit sign and no negative zero', () => {
    expect(formatNrr(1.2344)).toBe('+1.234');
    expect(formatNrr(-0.5674)).toBe('−0.567');
    expect(formatNrr(0)).toBe('0.000');
    expect(formatNrr(null)).toBe('–');
    expect(formatNrr(3.254902)).toBe('+3.255');
    expect(formatNrr(-0.00001)).toBe('0.000');
  });

  it('writes negative net run rate with a true minus sign, so tabular figures show no gap after it', () => {
    expect(formatNrr(-1.907)).toBe('−1.907');
    expect(formatNrr(-1.907)).not.toContain('-');
  });

  it('names a built-in format only while its overs still match the preset', () => {
    expect(builtinFormatOvers('T20')).toBe(20);
    expect(builtinFormatOvers('custom')).toBeNull();
    expect(formatDisplayLabel('T20', 20)).toBe('T20');
    expect(formatDisplayLabel('T20', 5)).toBe('5 ov');
    expect(formatDisplayLabel('custom', 17)).toBe('17 ov');
    expect(formatPresetName('T10', 10)).toBe('T10');
    expect(formatPresetName('T10', 8)).toBe('Custom');
  });

  it('U-FMT-05 bowling figures', () => {
    expect(formatBowlingFigures({ legalBalls: 22, maidens: 0, runsConceded: 28, wickets: 2 }, 6)).toBe('3.4-0-28-2');
    expect(formatBowlingFigures({ legalBalls: 24, maidens: 1, runsConceded: 20, wickets: 3 }, 6)).toBe('4-1-20-3');
  });

  it('U-FMT-06 requirement', () => {
    expect(formatRequirement(23, 14)).toBe('Need 23 from 14 balls');
    expect(formatRequirementCompact(23, 14)).toBe('Need 23 off 14');
    expect(formatRequirementCompact(1, 1)).toBe('Need 1 off 1');
    expect(formatRequirement(1, 1)).toBe('Need 1 run from 1 ball');
    expect(formatRequirement(10, 12)).toBe('Need 10 from 12 balls');
  });
});

function ball(facts: Partial<Omit<BallRecord, 'token'>>): Omit<BallRecord, 'token'> {
  return {
    seq: 1,
    eventId: 'e1',
    inningsIndex: 0,
    overIndex: 0,
    ballInOver: 1,
    deliveryInOver: 1,
    label: '0.1',
    isLegal: true,
    isBallFaced: true,
    isFreeHit: false,
    strikerId: 'L1',
    nonStrikerId: 'L2',
    bowlerId: 'T7',
    call: 'fair',
    runsTo: 'bat',
    runsRun: 0,
    shortRuns: 0,
    boundary: 0,
    batterRuns: 0,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
    extraRuns: 0,
    totalRuns: 0,
    bowlerRuns: 0,
    isFour: false,
    isSix: false,
    wicket: null,
    endsOver: false,
    scoreAfter: { runs: 0, wickets: 0, legalBalls: 1 },
    powerplayName: null,
    recordedAt: '2026-05-01T10:00:00.000Z',
    ...facts,
  };
}

function out(type: DismissalType): DismissalRecord {
  return {
    type,
    playerOutId: 'L1',
    bowlerId: 'T7',
    creditedBowlerId: null,
    fielderIds: [],
    text: '',
    wicketNumber: 1,
    teamRuns: 0,
    legalBalls: 1,
    seq: 1,
    onDelivery: true,
  };
}

describe('ball tokens (U-FMT-07/08)', () => {
  it.each<[string, Partial<Omit<BallRecord, 'token'>>, string, string]>([
    ['dot', {}, '0', 'dot'],
    ['one', { runsRun: 1 }, '1', 'runs'],
    ['four', { boundary: 4, isFour: true }, '4', 'four'],
    ['six', { boundary: 6, isSix: true }, '6', 'six'],
    ['overthrows', { runsRun: 1, boundary: 4 }, '5', 'runs'],
    ['wide', { call: 'wide', runsTo: 'wide', isLegal: false, isBallFaced: false }, 'WD', 'wide'],
    ['wide plus one', { call: 'wide', runsTo: 'wide', runsRun: 1, isLegal: false, isBallFaced: false }, 'WD+1', 'wide'],
    ['wide boundary', { call: 'wide', runsTo: 'wide', boundary: 4, isLegal: false, isBallFaced: false }, 'WD+4', 'wide'],
    ['no ball', { call: 'no_ball', isLegal: false }, 'NB', 'no_ball'],
    ['no ball four', { call: 'no_ball', isLegal: false, boundary: 4, isFour: true }, 'NB+4', 'no_ball'],
    ['no ball six', { call: 'no_ball', isLegal: false, boundary: 6, isSix: true }, 'NB+6', 'no_ball'],
    ['no ball byes', { call: 'no_ball', isLegal: false, runsTo: 'bye', runsRun: 2 }, 'NB+2B', 'no_ball'],
    ['no ball leg bye', { call: 'no_ball', isLegal: false, runsTo: 'leg_bye', runsRun: 1 }, 'NB+1LB', 'no_ball'],
    ['bye', { runsTo: 'bye', runsRun: 1 }, 'B1', 'bye'],
    ['leg byes', { runsTo: 'leg_bye', runsRun: 2 }, 'LB2', 'leg_bye'],
    ['wicket', { wicket: out('bowled') }, 'W', 'wicket'],
    ['run then wicket', { runsRun: 1, wicket: out('run_out') }, '1+W', 'wicket'],
    ['wide wicket', { call: 'wide', runsTo: 'wide', isLegal: false, wicket: out('stumped') }, 'WD+W', 'wicket'],
    ['no ball run out', { call: 'no_ball', isLegal: false, runsRun: 1, wicket: out('run_out') }, 'NB+1+W', 'wicket'],
    ['short run', { runsRun: 2, shortRuns: 1 }, '1s', 'runs'],
  ])('%s', (_, facts, text, kind) => {
    expect(ballToken(ball(facts))).toMatchObject({ text, kind });
  });

  it('dot style and flags', () => {
    expect(ballToken(ball({}), { dotStyle: 'dot' }).text).toBe('•');
    expect(ballToken(ball({ isFreeHit: true, isLegal: false }))).toMatchObject({ isFreeHit: true, isLegal: false });
  });

  it('U-FMT-08 accessibility labels', () => {
    expect(ballToken(ball({ call: 'wide', runsTo: 'wide', runsRun: 1, isLegal: false })).accessibilityLabel).toBe('Wide, plus one run');
    expect(ballToken(ball({ call: 'no_ball', runsTo: 'bye', runsRun: 2, isLegal: false })).accessibilityLabel).toBe('No ball, plus two byes');
    expect(ballToken(ball({ runsRun: 2, shortRuns: 1 })).accessibilityLabel).toBe('One run, one short');
    expect(ballToken(ball({ wicket: out('caught') })).accessibilityLabel).toBe('Wicket, caught');
    expect(ballToken(ball({ boundary: 4, isFour: true })).accessibilityLabel).toBe('Four');
    expect(ballToken(ball({})).accessibilityLabel).toBe('Dot ball');
    expect(ballToken(ball({ runsRun: 1, wicket: out('run_out') })).accessibilityLabel).toBe('One run, wicket, run out');
  });
});

describe('dismissal text (U-FMT-09)', () => {
  it.each<[DismissalType, string | null, readonly string[], string]>([
    ['bowled', 'T7', [], 'b Hassan'],
    ['caught', 'T7', ['T9'], 'c Naseem b Hassan'],
    ['caught', 'T7', ['T7'], 'c & b Hassan'],
    ['caught', 'T7', [], 'c ? b Hassan'],
    ['caught', 'T7', ['T12'], 'c sub (Ali) b Hassan'],
    ['lbw', 'T7', [], 'lbw b Hassan'],
    ['stumped', 'T7', ['T1'], 'st Rizwan b Hassan'],
    ['hit_wicket', 'T7', [], 'hit wicket b Hassan'],
    ['run_out', null, ['T9', 'T1'], 'run out (Naseem/Rizwan)'],
    ['run_out', null, ['T12'], 'run out (sub (Ali))'],
    ['run_out', null, [], 'run out'],
    ['obstructing_field', null, [], 'obstructing the field'],
    ['hit_ball_twice', null, [], 'hit the ball twice'],
    ['handled_ball', null, [], 'handled the ball'],
    ['timed_out', null, [], 'timed out'],
    ['retired_out', null, [], 'retired out'],
    ['caught', 'T7', ['X99'], 'c Unknown b Hassan'],
    ['bowled', null, [], 'b Unknown'],
  ])('%s', (type, bowlerId, fielderIds, text) => {
    expect(dismissalText({ type, bowlerId, fielderIds }, PLAYERS)).toBe(text);
  });
});

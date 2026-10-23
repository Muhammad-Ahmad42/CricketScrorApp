import { m3Setup, playScript } from '@/domain/scoring/testing';
import { noBall, wide } from '@/domain/scoring/commands';
import { customIntent, extrasChips, extrasRuleNote } from '../selectors/extras';
import { memoizeLast } from '../selectors/memo';
import { ordinal } from '../selectors/names';
import { selectWicketOptions } from '../selectors/options';
import { controlModeOf, formatLabel, selectCrease, selectHeader, selectOverStrip } from '../selectors/scoreboard';
import { formatDateLabel, formatShortDate, formatTimeOfDay, matchShortDate, monthHeading } from '../selectors/dates';
import { liveMatch, OPEN } from './support/liveMatch';

describe('scoreboard view models', () => {
  it('builds the header from domain state and format helpers only', () => {
    const vm = selectHeader(liveMatch([OPEN, '1', '4', 'nb']));
    expect(vm).toMatchObject({ score: '6/0', overs: '0.2', oversOf: 'of 3', crr: '18.00', target: null, freeHit: true, powerplay: 'Powerplay · over 1' });
  });

  it('returns a not-started header without a match', () => {
    expect(selectHeader(null).started).toBe(false);
  });

  it('shows "(revised)" when the overs limit was revised', () => {
    const live = liveMatch([OPEN, '1', { type: 'revise_overs', inningsIndex: 0, overs: 2, reason: 'Rain' }]);
    expect(selectHeader(live).oversOf).toBe('of 2 (revised)');
  });

  it('marks only the striker and blocks the swap when a batter bats alone', () => {
    const crease = selectCrease(liveMatch([OPEN, '1']));
    expect(crease.striker?.isStriker).toBe(true);
    expect(crease.nonStriker?.isStriker).toBe(false);
    expect(crease.canSwap).toBe(true);
    expect(selectCrease(null).canSwap).toBe(false);
  });

  it('collapses a finished over into a summary line and shows a dot as • when asked', () => {
    const ones = Array.from({ length: 6 }, () => '1');
    const between = selectOverStrip(liveMatch([OPEN, ...ones]), 'zero');
    expect(between).toMatchObject({ summary: 'Over 1 · 6 runs · Haris', remaining: 0 });
    expect(between.balls.map((ball) => ball.text)).toEqual(['1', '1', '1', '1', '1', '1']);
    expect(selectOverStrip(liveMatch([OPEN, ...ones, '@T10']), 'zero')).toMatchObject({ balls: [], remaining: 6, summary: 'Over 1 · 6 runs · Haris' });
    expect(selectOverStrip(liveMatch([OPEN, '.']), 'dot').balls[0].text).toBe('•');
    expect(selectOverStrip(liveMatch([OPEN, '.']), 'zero').balls[0].text).toBe('0');
  });

  it('picks the control mode from the state', () => {
    expect(controlModeOf(null)).toBe('none');
    expect(controlModeOf(liveMatch([OPEN]))).toBe('pad');
    expect(controlModeOf(liveMatch([OPEN, 'W:b']))).toBe('pending');
  });

  it('labels builtin formats by id and custom overs by count', () => {
    expect(formatLabel('T20', 20)).toBe('T20');
    expect(formatLabel('custom', 17)).toBe('17 ov');
  });

  it('orders the wicket fielders bowler, keeper, fielders, substitutes', () => {
    const live = liveMatch([OPEN]);
    const options = selectWicketOptions(live.setup, live.state);
    expect(options?.fielders.map((option) => option.tag)).toEqual(['c&b', 'WK', null, null, null, null, null, null, null, null, null, 'sub']);
    expect(options?.dismissalsFor('no_ball')).toEqual(['run_out', 'hit_ball_twice', 'obstructing_field', 'handled_ball']);
    expect(options?.lastWicketNote).toBe('Last wicket: the innings ends');
  });

  it('puts the designated keeper first for a stumping, with no c&b tag on the bowler', () => {
    const live = liveMatch([OPEN]);
    const options = selectWicketOptions(live.setup, live.state);
    expect(options?.stumpers[0]).toMatchObject({ id: 'T1', tag: 'WK' });
    expect(options?.stumpers.map((option) => option.tag)).toEqual(['WK', null, null, null, null, null, null, null, null, null, null, 'sub']);
    expect(options?.stumpers.map((option) => option.id).sort()).toEqual(options?.fielders.map((option) => option.id).sort());
  });
});

describe('extras intents', () => {
  it('maps the chips of every tab to intents from the domain constructors', () => {
    expect(extrasChips('wide', 'bat').map((chip) => chip.intent)).toContainEqual(wide(0, { boundary: true }));
    expect(extrasChips('no_ball', 'bye').map((chip) => chip.key)).not.toContain('nb6');
    expect(extrasChips('no_ball', 'bat').map((chip) => chip.intent)).toContainEqual(noBall({ runsTo: 'bat', boundary: 6 }));
  });

  it('builds custom intents with clamped short runs', () => {
    expect(customIntent('no_ball', 'leg_bye', { runsRun: 2, boundary: 6, shortRuns: 5 })).toEqual({
      type: 'no_ball',
      runsTo: 'leg_bye',
      runsRun: 2,
      boundary: 4,
      shortRuns: 2,
    });
    expect(customIntent('other', 'bat', { runsRun: 3, boundary: 0, shortRuns: 1 })).toEqual({ type: 'runs', runsRun: 3, boundary: 0, shortRuns: 1 });
  });

  it('states the match rule for wides and no-balls as a short line', () => {
    const rules = m3Setup().rules;
    expect(extrasRuleNote('no_ball', rules)).toBe('No-ball: 1 run · free hit next');
    expect(extrasRuleNote('wide', rules)).toBe('Wide: 1 run · bowled again');
    expect(extrasRuleNote('bye', rules)).toBeNull();
  });
});

describe('small helpers', () => {
  it('memoizes on the last input reference', () => {
    const fn = jest.fn((value: object) => ({ value }));
    const memo = memoizeLast(fn);
    const input = {};
    expect(memo(input)).toBe(memo(input));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('formats ordinals and dates', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
    expect(formatDateLabel('2026-09-12')).toBe('Sat 12 Sep 2026');
    expect(formatDateLabel('nope')).toBeNull();
    expect(monthHeading('2026-09-12')).toBe('September 2026');
  });

  it('formats saved times and played dates in local time, and calendar dates as written', () => {
    const pad = (value: number) => `${value}`.padStart(2, '0');
    const saved = new Date('2026-10-02T09:10:00.000Z');
    expect(formatTimeOfDay('2026-10-02T09:10:00.000Z')).toBe(`${pad(saved.getHours())}:${pad(saved.getMinutes())}`);
    const lateNight = new Date('2026-10-01T23:30:00.000Z');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    expect(formatShortDate('2026-10-01T23:30:00.000Z')).toBe(`${days[lateNight.getDay()]} ${lateNight.getDate()} Oct`);
    expect(formatShortDate('2026-10-02')).toBe('Fri 2 Oct');
    expect(formatTimeOfDay('14:00')).toBe('14:00');
    expect(matchShortDate({ scheduledDate: '2026-10-04', updatedAt: '2026-10-01T13:00:00.000Z', startedAt: '2026-10-01T12:00:00.000Z', completedAt: null })).not.toBe('Sun 4 Oct');
    expect(matchShortDate({ scheduledDate: '2026-10-04', updatedAt: '2026-10-01T13:00:00.000Z', startedAt: null, completedAt: null })).toBe('Sun 4 Oct');
  });

  it('plays a full script without the UI', () => {
    expect(playScript(m3Setup(), [OPEN, '1']).state.innings[0].runs).toBe(1);
  });
});

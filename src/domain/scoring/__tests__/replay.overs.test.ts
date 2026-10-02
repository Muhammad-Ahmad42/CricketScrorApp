import { buildEvents, scoreRuns, type ScoringIntent } from '../commands';
import { formatOvers } from '../format';
import { bowlerEligibility, validateEvent } from '../validate';
import { getBuiltinPreset } from '../presets';
import { m8LmsSetup, matchSetup, playedMatch, playScript } from '../testing';
import { bowler, build, fresh, inn, play, step } from './helpers';

const OVER = '0 0 0 0 0 0';

describe('strike rotation (U-STR)', () => {
  const { setup, state } = fresh();

  it.each<[string, ScoringIntent, string]>([
    ['U-STR-01 one', scoreRuns(1), 'L2'],
    ['U-STR-01 three', scoreRuns(3), 'L2'],
    ['U-STR-01 five', scoreRuns(5), 'L2'],
    ['U-STR-02 zero', scoreRuns(0), 'L1'],
    ['U-STR-02 two', scoreRuns(2), 'L1'],
    ['U-STR-02 all-run four', scoreRuns(4, { allRun: true }), 'L1'],
    ['U-STR-03 four', scoreRuns(4), 'L1'],
    ['U-STR-03 six', scoreRuns(6), 'L1'],
    ['U-STR-04 one plus four overthrows', { type: 'runs', runsRun: 1, boundary: 4 }, 'L2'],
    ['U-STR-05 bye one', { type: 'bye', runsRun: 1 }, 'L2'],
    ['U-STR-05 leg bye three', { type: 'leg_bye', runsRun: 3 }, 'L2'],
    ['U-STR-06 wide plus one', { type: 'wide', runsRun: 1 }, 'L2'],
    ['U-STR-06 no ball plus one', { type: 'no_ball', runsRun: 1 }, 'L2'],
    ['U-STR-07 two with one short', scoreRuns(2, { shortRuns: 1 }), 'L1'],
    ['U-STR-08 three with one short', scoreRuns(3, { shortRuns: 1 }), 'L2'],
  ])('%s', (_, intent, striker) => {
    expect(inn(step(setup, state, intent)).strikerId).toBe(striker);
  });

  it('U-STR-09 single off the last ball: same batter faces the next over', () => {
    expect(inn(play(setup, ['start:L1:L2:T7', '0 0 0 0 0 1']).state).strikerId).toBe('L1');
  });

  it('U-STR-10 dot off the last ball: partner faces the next over', () => {
    expect(inn(play(setup, ['start:L1:L2:T7', OVER]).state).strikerId).toBe('L2');
  });

  it('U-STR-11/12 manual swaps', () => {
    const once = play(setup, ['start:L1:L2:T7', '0 sw']).state;
    expect(inn(once)).toMatchObject({ strikerId: 'L2', nonStrikerId: 'L1', legalBalls: 1 });
    expect(inn(play(setup, ['start:L1:L2:T7', OVER, 'sw']).state).strikerId).toBe('L1');
    expect(inn(play(setup, ['start:L1:L2:T7', 'sw sw']).state).strikerId).toBe('L1');
    expect(inn(once).batting.find((row) => row.playerId === 'L2')?.atCrease).toBe('striker');
  });

  it('U-STR-13/14 a last-man-stands survivor keeps strike and cannot swap', () => {
    const lms = m8LmsSetup();
    const lone = play(lms, ['start:L1:L2:T7', 'W W W W W W W'], { autoBatters: true, autoBowlers: true }).state;
    expect(inn(lone)).toMatchObject({ wickets: 7, nonStrikerId: null, status: 'in_progress' });
    const survivor = inn(lone).strikerId;
    expect(lone.pendingAction?.type === 'select_next_batter').toBe(false);
    const after = play(lms, ['start:L1:L2:T7', 'W W W W W W W', '1 1 1 1 1 1'], { autoBatters: true, autoBowlers: true }).state;
    expect(inn(after).strikerId).toBe(survivor);
    expect(inn(after).balls.slice(-6).every((ball) => ball.strikerId === survivor && ball.nonStrikerId === null)).toBe(true);
    expect(buildEvents(lms, lone, { type: 'swap_strike' })).toMatchObject({ ok: false, code: 'NOTHING_TO_SWAP' });
  });
});

describe('overs and bowlers (U-OVR)', () => {
  const setup = matchSetup();

  it('U-OVR-02 end of over', () => {
    const state = play(setup, ['start:L1:L2:T7', OVER]).state;
    const innings = inn(state);
    expect(innings).toMatchObject({ strikerId: 'L2', nonStrikerId: 'L1', bowlerId: null, previousOverBowlerIds: ['T7'] });
    expect(state.pendingAction).toMatchObject({ type: 'select_next_bowler', overIndex: 1 });
    const pending = state.pendingAction;
    if (pending?.type !== 'select_next_bowler') {
      throw new Error('expected bowler prompt');
    }
    expect(pending.eligible).not.toContain('T7');
    expect(pending.ineligible).toContainEqual({ playerId: 'T7', reason: 'bowled_previous_over' });
  });

  it('U-OVR-03 eight-ball overs', () => {
    const eight = matchSetup({ rules: { ballsPerOver: 8 } });
    const state = play(eight, ['start:L1:L2:T7', '0 0 0 0 0 0 0']).state;
    expect(state.pendingAction).toBeNull();
    expect(play(eight, ['start:L1:L2:T7', '0 0 0 0 0 0 0 0']).state.pendingAction?.type).toBe('select_next_bowler');
    expect(formatOvers(10, 8)).toBe('1.2');
  });

  it('U-OVR-04 six dots is a maiden', () => {
    const state = play(setup, ['start:L1:L2:T7', OVER]).state;
    expect(inn(state).overs[0].isMaiden).toBe(true);
    expect(bowler(state, 'T7').maidens).toBe(1);
  });

  it('U-OVR-05 a leg-bye does not break a maiden', () => {
    const state = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 lb1']).state;
    expect(inn(state).overs[0].isMaiden).toBe(true);
    expect(bowler(state, 'T7').maidens).toBe(1);
  });

  it('EC-D-16 a bye does not break a maiden', () => {
    const state = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 b1']).state;
    expect(inn(state).overs[0].isMaiden).toBe(true);
  });

  it('U-OVR-06/07 wides and no-balls break a maiden', () => {
    expect(inn(play(setup, ['start:L1:L2:T7', '0 0 0 0 0 wd 0']).state).overs[0].isMaiden).toBe(false);
    expect(inn(play(setup, ['start:L1:L2:T7', 'nb 0 0 0 0 0 0']).state).overs[0].isMaiden).toBe(false);
  });

  it('U-OVR-08 a split over is never a maiden', () => {
    const state = play(setup, ['start:L1:L2:T7', '0 0 0 @T8:injury 0 0 0']).state;
    expect(inn(state).overs[0]).toMatchObject({ isMaiden: false, bowlerIds: ['T7', 'T8'], isComplete: true });
    expect(bowler(state, 'T7').maidens).toBe(0);
    expect(bowler(state, 'T8').maidens).toBe(0);
  });

  it('U-OVR-09 an incomplete over is never a maiden', () => {
    const state = play(setup, ['start:L1:L2:T7', '0 0 0 0 0', 'decl']).state;
    expect(inn(state, 0).overs[0]).toMatchObject({ isMaiden: false, isComplete: false });
  });

  it('U-OVR-10 consecutive overs', () => {
    const state = play(setup, ['start:L1:L2:T7', OVER]).state;
    expect(buildEvents(setup, state, { type: 'select_bowler', bowlerId: 'T7' })).toMatchObject({ ok: false, code: 'BOWLER_CONSECUTIVE_OVERS' });
    const relaxed = matchSetup({ rules: { allowBowlerConsecutiveOvers: true } });
    const relaxedState = play(relaxed, ['start:L1:L2:T7', OVER]).state;
    expect(buildEvents(relaxed, relaxedState, { type: 'select_bowler', bowlerId: 'T7' }).ok).toBe(true);
  });

  it('U-OVR-11 mid-over injury replacement', () => {
    const state = play(setup, ['start:L1:L2:T7', '0 0 1 @T8:injury 2 0 4']).state;
    expect(bowler(state, 'T8')).toMatchObject({ legalBalls: 3, runsConceded: 6, oversUsed: 1 });
    expect(bowler(state, 'T7')).toMatchObject({ legalBalls: 3, runsConceded: 1, oversUsed: 1 });
    expect(inn(state).previousOverBowlerIds).toEqual(['T7', 'T8']);
    expect(inn(state).balls.slice(3).every((ball) => ball.bowlerId === 'T8')).toBe(true);
    expect(buildEvents(setup, state, { type: 'select_bowler', bowlerId: 'T8' })).toMatchObject({ ok: false, code: 'BOWLER_CONSECUTIVE_OVERS' });
    expect(buildEvents(setup, state, { type: 'select_bowler', bowlerId: 'T7' })).toMatchObject({ ok: false, code: 'BOWLER_CONSECUTIVE_OVERS' });
    const third = play(setup, ['start:L1:L2:T7', '0 0 1 @T8:injury 2 0 4', '@T9', OVER]).state;
    expect(buildEvents(setup, third, { type: 'select_bowler', bowlerId: 'T7' }).ok).toBe(true);
  });

  it('U-OVR-12 a suspended bowler is removed from the attack for the innings only', () => {
    const state = play(setup, ['start:L1:L2:T7', '0 0 @T8:suspended 0 0 0 0', '@T9', OVER]).state;
    expect(inn(state).removedBowlerIds).toEqual(['T7']);
    expect(buildEvents(setup, state, { type: 'select_bowler', bowlerId: 'T7' })).toMatchObject({ ok: false, code: 'BOWLER_REMOVED_FROM_ATTACK' });
    expect(bowlerEligibility(setup, state).ineligible).toContainEqual({ playerId: 'T7', reason: 'removed_from_attack' });
    const nextInnings = play(setup, ['start:L1:L2:T7', '0 0 @T8:suspended 0 0 0 0', 'decl', 'start:T1:T2:L7']).state;
    expect(inn(nextInnings).removedBowlerIds).toEqual([]);
  });

  it('U-OVR-13 a replaced bowler cannot come back in the same over', () => {
    const state = play(setup, ['start:L1:L2:T7', '0 @T8:injury 0']).state;
    expect(buildEvents(setup, state, { type: 'select_bowler', bowlerId: 'T7', reason: 'injury' })).toMatchObject({ ok: false, code: 'BOWLER_ALREADY_REPLACED' });
    expect(bowlerEligibility(setup, state).ineligible).toContainEqual({ playerId: 'T7', reason: 'replaced_this_over' });
  });

  it('U-OVR-14 re-selecting before the first ball supersedes the selection', () => {
    const state = play(setup, ['start:L1:L2:T7', OVER, '@T8 @T9 0']).state;
    expect(inn(state).balls[6].bowlerId).toBe('T9');
    expect(inn(state).bowling.some((row) => row.playerId === 'T8')).toBe(false);
  });

  it('U-OVR-15 reasons must match the over position', () => {
    const atStart = play(setup, ['start:L1:L2:T7', OVER]).state;
    expect(buildEvents(setup, atStart, { type: 'select_bowler', bowlerId: 'T8', reason: 'injury' })).toMatchObject({ ok: false, code: 'BOWLER_CHANGE_REASON_INVALID' });
    const midOver = play(setup, ['start:L1:L2:T7', '0 0 0']).state;
    expect(buildEvents(setup, midOver, { type: 'select_bowler', bowlerId: 'T8', reason: 'over_start' })).toMatchObject({ ok: false, code: 'BOWLER_CHANGE_REASON_INVALID' });
  });

  it('U-OVR-16 uniform quota of one over', () => {
    const t5 = matchSetup({ rules: getBuiltinPreset('T5')?.rules });
    const state = play(t5, ['start:L1:L2:T7', OVER, '@T8', OVER]).state;
    expect(bowlerEligibility(t5, state).ineligible).toContainEqual({ playerId: 'T7', reason: 'quota_reached' });
    expect(buildEvents(t5, state, { type: 'select_bowler', bowlerId: 'T7' })).toMatchObject({ ok: false, code: 'BOWLER_QUOTA_REACHED' });
  });

  it('U-OVR-17 last quota over warns, the next is refused', () => {
    const before = play(setup, ['start:L1:L2:T7', OVER, '@T8', OVER, '@T7', OVER, '@T8', OVER, '@T7', OVER, '@T8', OVER]).state;
    const [payload] = build(setup, before, { type: 'select_bowler', bowlerId: 'T7' });
    expect(validateEvent(setup, before, payload)).toEqual({ ok: true, warnings: [expect.objectContaining({ code: 'BOWLER_QUOTA_LAST_OVER' })] });
    const done = play(setup, ['start:L1:L2:T7', OVER, '@T8', OVER, '@T7', OVER, '@T8', OVER, '@T7', OVER, '@T8', OVER, '@T7', OVER, '@T8', OVER]).state;
    expect(buildEvents(setup, done, { type: 'select_bowler', bowlerId: 'T7' })).toMatchObject({ ok: false, code: 'BOWLER_QUOTA_REACHED' });
  });

  it('U-OVR-18 icc_one_fifth with 17 overs: three each, two bowlers may bowl a fourth', () => {
    const icc = matchSetup({ rules: { oversPerInnings: 17, bowlerQuotaMode: 'icc_one_fifth' } });
    const rotation = ['T7', 'T8', 'T9'];
    const steps = ['start:L1:L2:T7', OVER];
    for (let over = 1; over < 11; over += 1) {
      steps.push(`@${rotation[over % 3]}`, OVER);
    }
    const state = play(icc, steps).state;
    expect(inn(state).limits).toMatchObject({ maxOversPerBowler: 3, extraOverBowlers: 2 });
    expect(bowler(state, 'T7').oversUsed).toBe(4);
    expect(bowler(state, 'T8').oversUsed).toBe(4);
    expect(bowler(state, 'T9').oversUsed).toBe(3);
    const nextOver = play(icc, [...steps, '@T10', OVER]).state;
    expect(buildEvents(icc, nextOver, { type: 'select_bowler', bowlerId: 'T9' })).toMatchObject({ ok: false, code: 'BOWLER_QUOTA_REACHED' });
    expect(bowlerEligibility(icc, nextOver).ineligible).toContainEqual({ playerId: 'T9', reason: 'quota_reached' });
  });

  it('U-OVR-19 / EC-SB-14 icc quota recomputed after a revision', () => {
    const icc = matchSetup({ rules: { bowlerQuotaMode: 'icc_one_fifth' } });
    const started = play(icc, ['start:L1:L2:T7']).state;
    expect(inn(started).limits).toMatchObject({ maxOversPerBowler: 4, extraOverBowlers: 0 });
    const twelve = step(icc, started, { type: 'revise_overs', inningsIndex: 0, overs: 12, reason: 'Rain' });
    expect(inn(twelve).limits).toMatchObject({ maxBalls: 72, maxOversPerBowler: 2, extraOverBowlers: 2, revised: true });
    const thirteen = step(icc, started, { type: 'revise_overs', inningsIndex: 0, overs: 13, reason: 'Rain' });
    expect(inn(thirteen).limits).toMatchObject({ maxOversPerBowler: 2, extraOverBowlers: 3 });
  });

  it('U-OVR-20 oversUsed counts distinct overs', () => {
    const state = play(setup, ['start:L1:L2:T7', OVER, '@T9 0 0 0 @T8:injury 0 0 0', '@T7', OVER, '@T8', OVER]).state;
    expect(bowler(state, 'T8')).toMatchObject({ oversUsed: 2, legalBalls: 9 });
  });

  it('U-OVR-21 super over round 2: previous super-over bowlers and dismissed batters are barred', () => {
    const tied = playedMatch({ setup, first: { runs: 100 }, second: { runs: 100, wickets: 2 }, end: null });
    const roundOne = playScript(setup, ['so', 'start:T3:T4:L10', 'W 4 0 0 0 0', 'start:L1:L2:T7', '4 0 0 0 0 0'], { prior: tied.events, autoBatters: true });
    expect(roundOne.state.pendingAction).toMatchObject({ type: 'resolve_tie', nextSuperOverRound: 2 });
    const roundTwo = playScript(setup, ['so'], { prior: roundOne.events });
    expect(roundTwo.state.pendingAction).toMatchObject({ type: 'start_next_innings', inningsIndex: 4, superOverRound: 2, suggestedBattingTeamId: 'LIO' });
    expect(buildEvents(setup, roundTwo.state, { type: 'start_innings', strikerId: 'L3', nonStrikerId: 'L4', bowlerId: 'T7' })).toMatchObject({
      ok: false,
      code: 'PLAYER_INELIGIBLE_SUPER_OVER',
    });
    expect(buildEvents(setup, roundTwo.state, { type: 'start_innings', strikerId: 'T3', nonStrikerId: 'T4', bowlerId: 'L11', battingTeamId: 'TIG' })).toMatchObject({
      ok: false,
      code: 'PLAYER_INELIGIBLE_SUPER_OVER',
    });
    const started = playScript(setup, ['start:L3:L4:T8'], { prior: roundTwo.events }).state;
    expect(bowlerEligibility(setup, started).ineligible).toContainEqual({ playerId: 'T7', reason: 'bowled_previous_super_over' });
    const tigersFirst = playScript(setup, ['start:T5:T6:L11:TIG', 'W'], { prior: roundTwo.events }).state;
    expect(tigersFirst.pendingAction).toMatchObject({ type: 'select_next_batter' });
    const pending = tigersFirst.pendingAction;
    expect(pending?.type === 'select_next_batter' ? pending.candidates : []).not.toContain('T3');
    expect(buildEvents(setup, tigersFirst, { type: 'batter_in', playerId: 'T3' })).toMatchObject({ ok: false, code: 'PLAYER_INELIGIBLE_SUPER_OVER' });
  });

  it('U-OVR-22 substitutes are never bowler candidates', () => {
    const state = play(setup, ['start:L1:L2:T7', OVER]).state;
    const eligibility = bowlerEligibility(setup, state);
    const all = [...eligibility.eligible, ...eligibility.ineligible.map((entry) => entry.playerId)].sort();
    expect(all).toEqual(['T1', 'T10', 'T11', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9']);
  });

  it('bowling order follows first delivery', () => {
    const state = play(setup, ['start:L1:L2:T7', OVER, '@T9', OVER, '@T8', '0']).state;
    expect(inn(state).bowling.map((row) => [row.playerId, row.order])).toEqual([
      ['T7', 1],
      ['T9', 2],
      ['T8', 3],
    ]);
    expect(inn(state).bowling.find((row) => row.isCurrent)?.playerId).toBe('T8');
  });

  it('fresh innings has the current bowler and an active powerplay', () => {
    const { state } = fresh(setup);
    expect(inn(state).powerplay.active).toMatchObject({ name: 'Powerplay', fromOver: 1, toOver: 6 });
    expect(inn(state).powerplay.phases[0].state).toBe('active');
  });
});

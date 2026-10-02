import type { MandatoryRetirementRule } from '../../types';
import { buildEvents, scoreRuns } from '../commands';
import { replayMatch } from '../replay';
import { eligibleIncomingBatters, validateEvent } from '../validate';
import { matchSetup, playedMatch, playScript, rawEvents, retire } from '../testing';
import { batter, corrupted, delivery, fresh, inn, play } from './helpers';

const AUTO = { autoBatters: true, autoBowlers: true } as const;

describe('pending action priority (U-PND-01..09)', () => {
  const setup = matchSetup();

  it('U-PND-01 ready to score', () => {
    const { state } = fresh(setup);
    expect(state.pendingAction).toBeNull();
    expect(state.canRecordDelivery).toBe(true);
    expect(state.lifecycle).toBe('live');
  });

  it('empty log: start the first innings with the toss suggestion', () => {
    const state = playScript(setup, []).state;
    expect(state.pendingAction).toEqual({ type: 'start_next_innings', inningsIndex: 0, kind: 'regular', superOverRound: null, suggestedBattingTeamId: 'LIO' });
    expect(state.lifecycle).toBe('not_started');
    expect(state.canRecordDelivery).toBe(false);
    const bowlFirst = matchSetup({ toss: { winnerTeamId: 'LIO', decision: 'bowl' } });
    expect(playScript(bowlFirst, []).state.pendingAction).toMatchObject({ suggestedBattingTeamId: 'TIG' });
    const noToss = matchSetup({ toss: null });
    expect(playScript(noToss, []).state.pendingAction).toMatchObject({ suggestedBattingTeamId: null });
  });

  it('U-PND-02 next batter prompt', () => {
    const state = play(setup, ['start:L1:L2:T7', 'W']).state;
    expect(state.pendingAction).toEqual({
      type: 'select_next_batter',
      position: 'striker',
      candidates: ['L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11'],
      canEndInnings: false,
    });
    expect(state.canRecordDelivery).toBe(false);
  });

  it('U-PND-03 wicket on the last ball: batter first, then bowler', () => {
    const wicket = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 W']).state;
    expect(wicket.pendingAction?.type).toBe('select_next_batter');
    const filled = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 W', '>L3']).state;
    expect(filled.pendingAction?.type).toBe('select_next_bowler');
    expect(buildEvents(setup, wicket, { type: 'select_bowler', bowlerId: 'T8' })).toMatchObject({ ok: false, code: 'VACANCY_MUST_BE_FILLED' });
  });

  it('U-PND-04/05 / EC-I-14 suspension outranks the batter prompt', () => {
    const paused = play(setup, ['start:L1:L2:T7', 'W', 'susp']).state;
    expect(paused.pendingAction).toEqual({ type: 'resume_play', reason: 'rain' });
    expect(paused.lifecycle).toBe('paused');
    expect(paused.suspension).toMatchObject({ reason: 'rain', note: null });
    expect(validateEvent(setup, paused, delivery(paused))).toMatchObject({ ok: false, code: 'PLAY_SUSPENDED' });
    const resumed = play(setup, ['start:L1:L2:T7', 'W', 'susp', 'resume']).state;
    expect(resumed.pendingAction?.type).toBe('select_next_batter');
    expect(resumed.lifecycle).toBe('live');
    expect(buildEvents(setup, resumed, { type: 'resume_play' })).toMatchObject({ ok: false, code: 'NOT_SUSPENDED' });
  });

  it('U-PND-06 suspension outranks the next innings', () => {
    const done = playedMatch({ setup, first: { runs: 100 }, second: null, end: null });
    const paused = playScript(setup, ['susp'], { prior: done.events }).state;
    expect(paused.pendingAction?.type).toBe('resume_play');
    expect(buildEvents(setup, paused, { type: 'start_innings', strikerId: 'T1', nonStrikerId: 'T2', bowlerId: 'L10' })).toMatchObject({
      ok: false,
      code: 'PLAY_SUSPENDED',
    });
  });

  it('U-PND-07 a natural result outranks the suspension', () => {
    const won = playedMatch({ setup, first: { runs: 100 }, second: { runs: 101, wickets: 1, balls: 50 }, end: null });
    const paused = playScript(setup, ['susp'], { prior: won.events }).state;
    expect(paused.pendingAction?.type).toBe('confirm_result');
    expect(buildEvents(setup, paused, { type: 'end_match', outcome: { type: 'natural' } }).ok).toBe(true);
  });

  it('U-PND-08 a tie outranks the suspension but a super over needs play resumed', () => {
    const tie = playedMatch({ setup, first: { runs: 100 }, second: { runs: 100, wickets: 1 }, end: null });
    const paused = playScript(setup, ['susp'], { prior: tie.events }).state;
    expect(paused.pendingAction?.type).toBe('resolve_tie');
    expect(buildEvents(setup, paused, { type: 'start_super_over' })).toMatchObject({ ok: false, code: 'PLAY_SUSPENDED' });
  });

  it('U-PND-09 / EC-B-02 only a retired-hurt batter remains', () => {
    const state = play(setup, ['start:L1:L2:T7', 'W W W W W W W W W', '1', retire('L11', 'retired_hurt')], AUTO).state;
    expect(inn(state).wickets).toBe(9);
    expect(state.pendingAction).toMatchObject({ type: 'select_next_batter', candidates: ['L11'], canEndInnings: true });
  });

  it('EC-B-01 a retired-hurt batter is offered after the yet-to-bat batters and continues the score', () => {
    const retired = play(setup, ['start:L1:L2:T7', '4 2', retire('L1', 'retired_hurt', 'L3'), 'W']).state;
    expect(eligibleIncomingBatters(setup, retired)).toEqual(['L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L1']);
    const back = play(setup, ['start:L1:L2:T7', '4 2', retire('L1', 'retired_hurt', 'L3'), 'W', '>L1', '1']).state;
    expect(batter(back, 'L1')).toMatchObject({ status: 'not_out', runs: 7, returnedFromRetirement: true, position: 1 });
    expect(inn(back).partnerships.map((partnership) => [partnership.wicketNumber, partnership.endedBy])).toEqual([
      [1, 'retirement'],
      [1, 'wicket'],
      [2, null],
    ]);
  });

  it('EC-B-03 a retired-not-out batter may not return while others are yet to bat', () => {
    const state = play(setup, ['start:L1:L2:T7', retire('L1', 'retired_not_out', 'L3'), 'W']).state;
    expect(eligibleIncomingBatters(setup, state)).not.toContain('L1');
    expect(buildEvents(setup, state, { type: 'batter_in', playerId: 'L1' })).toMatchObject({ ok: false, code: 'BATTER_NOT_ELIGIBLE' });
  });
});

describe('mandatory retirement is advisory (U-PND-10..13)', () => {
  const rule = (overrides: Partial<MandatoryRetirementRule> = {}): MandatoryRetirementRule => ({ atRuns: 30, mayReturn: true, timing: 'immediately', ...overrides });

  it('U-PND-10 immediately: listed, never blocking', () => {
    const setup = matchSetup({ rules: { mandatoryRetirement: rule() } });
    const state = play(setup, ['start:L1:L2:T7', '6 6 6 6 6']).state;
    expect(state.retirementsDue).toEqual([{ playerId: 'L1', atRuns: 30 }]);
    expect(state.pendingAction).toBeNull();
    expect(state.canRecordDelivery).toBe(true);
    const scoredOn = play(setup, ['start:L1:L2:T7', '6 6 6 6 6 1']).state;
    expect(inn(scoredOn).runs).toBe(31);
  });

  it('U-PND-11 end of over timing lists the batter only when the over ends', () => {
    const setup = matchSetup({ rules: { mandatoryRetirement: rule({ timing: 'end_of_over' }) } });
    expect(play(setup, ['start:L1:L2:T7', '6 6 6 6 6']).state.retirementsDue).toEqual([]);
    expect(play(setup, ['start:L1:L2:T7', '6 6 6 6 6 1']).state.retirementsDue).toEqual([{ playerId: 'L1', atRuns: 30 }]);
    expect(play(setup, ['start:L1:L2:T7', '6 6 6 6 6 1', '@T8 0']).state.retirementsDue).toEqual([]);
  });

  it('U-PND-12 / EC-B-05 not listed when no yet-to-bat batter remains', () => {
    const setup = matchSetup({ squadSize: 2, rules: { playersPerSide: 2, lastManStands: true, mandatoryRetirement: rule() } });
    expect(play(setup, ['start:L1:L2:T2', '6 6 6 6 6']).state.retirementsDue).toEqual([]);
  });

  it('U-PND-13 retired not out returns once the others have batted and is never listed again', () => {
    const setup = matchSetup({ squadSize: 4, rules: { playersPerSide: 4, mandatoryRetirement: rule() } });
    const steps = ['start:L1:L2:T3', '6 6 6 6 6 6', retire('L1', 'retired_not_out', 'L3'), '@T4 W', '>L4', 'W'];
    const waiting = play(setup, steps).state;
    expect(waiting.pendingAction).toMatchObject({ type: 'select_next_batter', candidates: ['L1'] });
    const back = play(setup, [...steps, '>L1']).state;
    expect(batter(back, 'L1')).toMatchObject({ returnedFromRetirement: true, runs: 36 });
    expect(back.retirementsDue).toEqual([]);
    const noReturn = matchSetup({ squadSize: 4, rules: { playersPerSide: 4, mandatoryRetirement: rule({ mayReturn: false }) } });
    const stuck = play(noReturn, steps).state;
    expect(stuck.pendingAction).toMatchObject({ type: 'select_next_batter', candidates: [], canEndInnings: true });
    expect(buildEvents(noReturn, stuck, { type: 'batter_in', playerId: 'L1' })).toMatchObject({ ok: false, code: 'BATTER_NOT_ELIGIBLE' });
  });
});

describe('repair and recording gate (U-PND-14)', () => {
  it('a log that needs repair can never record', () => {
    const setup = matchSetup();
    const good = play(setup, ['start:L1:L2:T7', '1']);
    const broken = [...good.events, ...rawEvents(setup, [corrupted(delivery(good.state), { boundary: 5 })], { firstSeq: good.events.length + 1 })];
    const state = replayMatch(setup, broken);
    expect(state.needsRepair).toBe(true);
    expect(state.pendingAction).toBeNull();
    expect(state.canRecordDelivery).toBe(false);
  });

  it('scoring a run keeps the pad available', () => {
    const setup = matchSetup();
    const { state } = fresh(setup);
    expect(buildEvents(setup, state, scoreRuns(1)).ok).toBe(true);
  });
});

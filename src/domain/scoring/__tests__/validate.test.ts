import type { DeliveryWicket, EventValidationCode, MatchEventInput, MatchSetup, MatchState } from '../../types';
import { EVENT_VALIDATION_CODES } from '../../types';
import { applyHistoryEdits } from '../history';
import { replayMatch } from '../replay';
import { validateEvent, validateLog } from '../validate';
import { matchSetup, playedMatch, playScript, rawEvents, retire } from '../testing';
import { build, corrupted, delivery, inn, play } from './helpers';

const setup = matchSetup();
const empty = playScript(setup, []).state;
const live = play(setup, ['start:L1:L2:T7']).state;
const vacancy = play(setup, ['start:L1:L2:T7', 'W']).state;
const nonStrikerVacancy = play(setup, ['start:L1:L2:T7', 'ro:nn']).state;
const paused = play(setup, ['start:L1:L2:T7', 'susp']).state;
const overEnd = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 0']).state;
const firstDone = playedMatch({ setup, first: { runs: 100 }, second: null, end: null }).state;
const ended = playedMatch({ setup, first: { runs: 100 }, second: { runs: 90 } }).state;
const tie = playedMatch({ setup, first: { runs: 100 }, second: { runs: 100, wickets: 1 }, end: null }).state;
const retiredNotOut = play(setup, ['start:L1:L2:T7', retire('L1', 'retired_not_out', 'L3'), 'W']).state;
const lms = matchSetup({ rules: { playersPerSide: 3, lastManStands: true } });
const lone = play(lms, ['start:L1:L2:T7', 'W W'], { autoBatters: true }).state;

const noSuperOver = matchSetup({ rules: { superOver: { ...setup.rules.superOver, enabled: false } } });
const tieNoSuperOver = playedMatch({ setup: noSuperOver, first: { runs: 100 }, second: { runs: 100, wickets: 1 }, end: null }).state;
const oneRound = matchSetup({ rules: { superOver: { ...setup.rules.superOver, maxRounds: 1 } } });
const oneRoundTied = playScript(oneRound, ['so', 'start:T1:T2:L10', '1 0 0 0 0 0', 'start:L1:L2:T7', '1 0 0 0 0 0'], {
  prior: playedMatch({ setup: oneRound, first: { runs: 100 }, second: { runs: 100, wickets: 1 }, end: null }).events,
}).state;
const secondRound = playScript(setup, ['so', 'start:T1:T2:L10', 'W 1 0 0 0 0', 'start:L1:L2:T7', '1 0 0 0 0 0', 'so'], {
  prior: playedMatch({ setup, first: { runs: 100 }, second: { runs: 100, wickets: 1 }, end: null }).events,
  autoBatters: true,
}).state;
const chase149 = playScript(setup, ['start:T1:T2:L10', '6 6 6 6 6 6', '@L11 6 6 6 6 6 6', '@L10 6 6 6 6 6 6', '@L11 6 6 6 6 6 6', '@L10 5'], {
  prior: playedMatch({ setup, first: { runs: 149 }, second: null, end: null }).events,
}).state;

function wicketOn(state: MatchState, facts: Partial<DeliveryWicket>): MatchEventInput {
  const wicket: DeliveryWicket = { type: 'bowled', playerOutId: inn(state).strikerId ?? '', fielderIds: [], dismissalEnd: null, ...facts };
  return delivery(state, { wicket });
}

interface Case {
  readonly id: string;
  readonly code: EventValidationCode;
  readonly setup?: MatchSetup;
  readonly state: MatchState;
  readonly event: MatchEventInput;
}

const CASES: readonly Case[] = [
  { id: 'U-VAL-01', code: 'MATCH_ALREADY_ENDED', state: ended, event: { kind: 'play_suspended', reason: 'rain', note: null } },
  { id: 'U-VAL-02a', code: 'MATCH_NOT_STARTED', state: empty, event: delivery(live) },
  { id: 'U-VAL-02b', code: 'MATCH_NOT_STARTED', state: empty, event: { kind: 'strike_swapped' } },
  { id: 'U-VAL-03a', code: 'PLAY_SUSPENDED', state: paused, event: delivery(paused) },
  { id: 'U-VAL-03b', code: 'PLAY_SUSPENDED', state: paused, event: { kind: 'bowler_selected', bowlerId: 'T8', reason: 'over_start' } },
  { id: 'U-VAL-04', code: 'NOT_SUSPENDED', state: live, event: { kind: 'play_resumed' } },
  { id: 'U-VAL-05a', code: 'PENDING_ACTION_REQUIRED', state: vacancy, event: delivery(live) },
  { id: 'U-VAL-05b', code: 'PENDING_ACTION_REQUIRED', state: overEnd, event: delivery(overEnd) },
  { id: 'U-VAL-06', code: 'INNINGS_NOT_IN_PROGRESS', state: firstDone, event: { kind: 'innings_ended', reason: 'declared', absentees: [] } },
  {
    id: 'U-VAL-07',
    code: 'INNINGS_STILL_IN_PROGRESS',
    state: live,
    event: { kind: 'innings_started', inningsIndex: 1, battingTeamId: 'TIG', strikerId: 'T1', nonStrikerId: 'T2', bowlerId: 'L10' },
  },
  {
    id: 'U-VAL-08',
    code: 'WRONG_INNINGS_INDEX',
    state: firstDone,
    event: { kind: 'innings_started', inningsIndex: 2, battingTeamId: 'TIG', strikerId: 'T1', nonStrikerId: 'T2', bowlerId: 'L10' },
  },
  {
    id: 'U-VAL-09',
    code: 'WRONG_BATTING_TEAM',
    state: firstDone,
    event: { kind: 'innings_started', inningsIndex: 1, battingTeamId: 'LIO', strikerId: 'L1', nonStrikerId: 'L2', bowlerId: 'T7' },
  },
  {
    id: 'U-VAL-10',
    code: 'TOSS_MISMATCH',
    state: empty,
    event: { kind: 'innings_started', inningsIndex: 0, battingTeamId: 'TIG', strikerId: 'T1', nonStrikerId: 'T2', bowlerId: 'L10' },
  },
  {
    id: 'U-VAL-11',
    code: 'SUPER_OVER_NOT_STARTED',
    state: tie,
    event: { kind: 'innings_started', inningsIndex: 2, battingTeamId: 'TIG', strikerId: 'T1', nonStrikerId: 'T2', bowlerId: 'L10' },
  },
  { id: 'U-VAL-12', code: 'SUPER_OVER_NOT_ALLOWED', setup: noSuperOver, state: tieNoSuperOver, event: { kind: 'super_over_started', round: 1 } },
  { id: 'U-VAL-13', code: 'SUPER_OVER_LIMIT_REACHED', setup: oneRound, state: oneRoundTied, event: { kind: 'super_over_started', round: 2 } },
  { id: 'U-VAL-14', code: 'PLAYER_NOT_IN_SQUAD', state: vacancy, event: { kind: 'batter_in', playerId: 'X99', position: 'striker' } },
  { id: 'U-VAL-15', code: 'PLAYER_WRONG_SIDE', state: overEnd, event: { kind: 'bowler_selected', bowlerId: 'L7', reason: 'over_start' } },
  {
    id: 'U-VAL-16',
    code: 'SAME_PLAYER_BOTH_ENDS',
    state: empty,
    event: { kind: 'innings_started', inningsIndex: 0, battingTeamId: 'LIO', strikerId: 'L1', nonStrikerId: 'L1', bowlerId: 'T7' },
  },
  { id: 'U-VAL-17', code: 'BATTER_NOT_AT_CREASE', state: live, event: { kind: 'batter_retired', playerId: 'L5', retirement: 'retired_hurt' } },
  { id: 'U-VAL-18', code: 'BATTER_ALREADY_BATTING', state: vacancy, event: { kind: 'batter_in', playerId: 'L2', position: 'striker' } },
  { id: 'U-VAL-19', code: 'BATTER_ALREADY_OUT', state: vacancy, event: { kind: 'batter_in', playerId: 'L1', position: 'striker' } },
  { id: 'U-VAL-20', code: 'BATTER_NOT_ELIGIBLE', state: retiredNotOut, event: { kind: 'batter_in', playerId: 'L1', position: 'striker' } },
  { id: 'U-VAL-21', code: 'SUBSTITUTE_NOT_ALLOWED', state: vacancy, event: { kind: 'batter_in', playerId: 'L12', position: 'striker' } },
  {
    id: 'U-VAL-22',
    code: 'PLAYER_INELIGIBLE_SUPER_OVER',
    state: secondRound,
    event: { kind: 'innings_started', inningsIndex: 4, battingTeamId: 'LIO', strikerId: 'L1', nonStrikerId: 'L2', bowlerId: 'T7' },
  },
  { id: 'U-VAL-23', code: 'NO_VACANCY', state: live, event: { kind: 'batter_in', playerId: 'L3', position: 'striker' } },
  { id: 'U-VAL-24', code: 'POSITION_NOT_VACANT', state: nonStrikerVacancy, event: { kind: 'batter_in', playerId: 'L3', position: 'striker' } },
  { id: 'U-VAL-25', code: 'VACANCY_MUST_BE_FILLED', state: vacancy, event: { kind: 'strike_swapped' } },
  { id: 'U-VAL-27', code: 'BOWLER_CONSECUTIVE_OVERS', state: overEnd, event: { kind: 'bowler_selected', bowlerId: 'T7', reason: 'over_start' } },
  {
    id: 'U-VAL-28',
    code: 'BOWLER_QUOTA_REACHED',
    state: play(matchSetup({ rules: { maxOversPerBowler: 1 } }), ['start:L1:L2:T7', '0 0 0 0 0 0 @T8 0 0 0 0 0 0']).state,
    setup: matchSetup({ rules: { maxOversPerBowler: 1 } }),
    event: { kind: 'bowler_selected', bowlerId: 'T7', reason: 'over_start' },
  },
  {
    id: 'U-VAL-29',
    code: 'BOWLER_ALREADY_REPLACED',
    state: play(setup, ['start:L1:L2:T7', '0 @T8:injury']).state,
    event: { kind: 'bowler_selected', bowlerId: 'T7', reason: 'injury' },
  },
  {
    id: 'U-VAL-30',
    code: 'BOWLER_REMOVED_FROM_ATTACK',
    state: play(setup, ['start:L1:L2:T7', '0 @T8:suspended 0 0 0 0 0 @T9 0 0 0 0 0 0']).state,
    event: { kind: 'bowler_selected', bowlerId: 'T7', reason: 'over_start' },
  },
  { id: 'U-VAL-31', code: 'BOWLER_CHANGE_REASON_INVALID', state: overEnd, event: { kind: 'bowler_selected', bowlerId: 'T8', reason: 'injury' } },
  { id: 'U-VAL-32', code: 'CONTEXT_MISMATCH', state: live, event: delivery(live, { strikerId: 'L2', nonStrikerId: 'L1' }) },
  { id: 'U-VAL-33a', code: 'INVALID_RUNS', state: live, event: corrupted(delivery(live), { runsRun: 10 }) },
  { id: 'U-VAL-33b', code: 'INVALID_RUNS', state: live, event: corrupted(delivery(live), { runsRun: -1 }) },
  { id: 'U-VAL-33c', code: 'INVALID_RUNS', state: live, event: corrupted(delivery(live), { runsRun: 1.5 }) },
  { id: 'U-VAL-34', code: 'INVALID_SHORT_RUNS', state: live, event: delivery(live, { runsRun: 1, shortRuns: 2 }) },
  { id: 'U-VAL-35', code: 'INVALID_BOUNDARY', state: live, event: corrupted(delivery(live), { boundary: 5 }) },
  { id: 'U-VAL-36', code: 'SIX_NOT_OFF_BAT', state: live, event: delivery(live, { runsTo: 'leg_bye', boundary: 6 }) },
  { id: 'U-VAL-37', code: 'RUNS_NOT_ALLOWED_WITH_DISMISSAL', state: live, event: corrupted(wicketOn(live, { type: 'caught' }), { runsRun: 1 }) },
  { id: 'U-VAL-38', code: 'DISMISSAL_NOT_ALLOWED_ON_CALL', state: live, event: corrupted(wicketOn(live, { type: 'caught' }), { call: 'no_ball' }) },
  { id: 'U-VAL-39', code: 'DISMISSAL_NOT_ALLOWED_ON_FREE_HIT', state: play(setup, ['start:L1:L2:T7', 'nb']).state, event: wicketOn(play(setup, ['start:L1:L2:T7', 'nb']).state, {}) },
  { id: 'U-VAL-40a', code: 'DISMISSED_PLAYER_NOT_AT_CREASE', state: live, event: wicketOn(live, { playerOutId: 'L2' }) },
  { id: 'U-VAL-40b', code: 'DISMISSED_PLAYER_NOT_AT_CREASE', state: live, event: wicketOn(live, { type: 'run_out', playerOutId: 'L5', dismissalEnd: 'striker_end' }) },
  { id: 'U-VAL-41', code: 'DISMISSAL_END_REQUIRED', state: live, event: wicketOn(live, { type: 'run_out' }) },
  { id: 'U-VAL-42', code: 'DISMISSAL_END_NOT_ALLOWED', state: live, event: wicketOn(live, { dismissalEnd: 'striker_end' }) },
  { id: 'U-VAL-43', code: 'FIELDER_NOT_IN_FIELDING_SIDE', state: live, event: wicketOn(live, { type: 'caught', fielderIds: ['L5'] }) },
  { id: 'U-VAL-44', code: 'TOO_MANY_FIELDERS', state: live, event: wicketOn(live, { type: 'run_out', dismissalEnd: 'striker_end', fielderIds: ['T1', 'T2', 'T3'] }) },
  {
    id: 'U-VAL-45',
    code: 'WICKET_AFTER_RESULT',
    state: chase149,
    event: delivery(chase149, { runsRun: 1, wicket: { type: 'run_out', playerOutId: inn(chase149).nonStrikerId ?? '', fielderIds: [], dismissalEnd: 'striker_end' } }),
  },
  { id: 'U-VAL-46', code: 'INVALID_PENALTY', state: live, event: { kind: 'penalty_awarded', teamId: 'LIO', inningsIndex: 0, runs: 0, reason: 'x' } },
  { id: 'U-VAL-47', code: 'INVALID_PENALTY_INNINGS', state: live, event: { kind: 'penalty_awarded', teamId: 'LIO', inningsIndex: 1, runs: 5, reason: 'x' } },
  { id: 'U-VAL-48', code: 'INVALID_ABSENTEE', state: live, event: { kind: 'innings_ended', reason: 'declared', absentees: [{ playerId: 'L11', hurt: false }] } },
  {
    id: 'U-VAL-49',
    code: 'INVALID_OVERS_REVISION',
    state: live,
    event: { kind: 'overs_revised', inningsIndex: 0, maxBalls: 0, target: null, terminal: false, reason: 'Rain' },
  },
  {
    id: 'U-VAL-50',
    code: 'INVALID_TARGET',
    state: live,
    event: { kind: 'overs_revised', inningsIndex: 0, maxBalls: 60, target: 50, terminal: false, reason: 'Rain' },
  },
  { id: 'U-VAL-51', code: 'NOTHING_TO_SWAP', setup: lms, state: lone, event: { kind: 'strike_swapped' } },
  { id: 'U-VAL-52', code: 'NATURAL_RESULT_NOT_REACHED', state: live, event: { kind: 'match_ended', outcome: { type: 'natural' } } },
  {
    id: 'U-VAL-53',
    code: 'RESULT_NOT_TIED',
    state: live,
    event: { kind: 'match_ended', outcome: { type: 'tie_decided', method: 'coin_toss', winnerTeamId: 'LIO' } },
  },
  {
    id: 'U-VAL-54',
    code: 'WALKOVER_AFTER_PLAY',
    state: play(setup, ['start:L1:L2:T7', '0']).state,
    event: { kind: 'match_ended', outcome: { type: 'walkover', winnerTeamId: 'TIG', reason: null } },
  },
  { id: 'U-VAL-55', code: 'TEAM_NOT_IN_MATCH', state: live, event: { kind: 'penalty_awarded', teamId: 'ZZZ', inningsIndex: 0, runs: 5, reason: 'x' } },
  { id: 'U-VAL-57', code: 'UNKNOWN_EVENT_KIND', state: live, event: corrupted({ kind: 'strike_swapped' }, { kind: 'coin_flip' }) },
];

const ELSEWHERE: readonly EventValidationCode[] = ['BOWLER_NOT_SELECTED', 'SEQ_OUT_OF_ORDER'];

describe('validation codes (U-VAL-01..57)', () => {
  it.each(CASES.map((entry) => [entry.id, entry.code, entry] as const))('%s %s', (_, code, entry) => {
    const result = validateEvent(entry.setup ?? setup, entry.state, entry.event);
    expect(result).toMatchObject({ ok: false, code });
    if (!result.ok) {
      expect(result.message.length).toBeGreaterThan(10);
      expect(result.message).not.toMatch(/\b[LT]\d{1,2}\b|\bLIO\b|\bTIG\b|undefined|null|Error/);
    }
  });

  it('every validation code has a trigger', () => {
    const covered = new Set<EventValidationCode>([...CASES.map((entry) => entry.code), ...ELSEWHERE]);
    expect(EVENT_VALIDATION_CODES.filter((code) => !covered.has(code))).toEqual([]);
  });

  it('U-VAL-10 without a toss either team may bat first', () => {
    const tossless = matchSetup({ toss: null });
    const start = playScript(tossless, []).state;
    expect(
      validateEvent(tossless, start, { kind: 'innings_started', inningsIndex: 0, battingTeamId: 'TIG', strikerId: 'T1', nonStrikerId: 'T2', bowlerId: 'L10' }),
    ).toMatchObject({ ok: true });
  });

  it('U-VAL-26 removing the only over-start selection fails with BOWLER_NOT_SELECTED', () => {
    const played = play(setup, ['start:L1:L2:T7', '0 0 0 0 0 0', '@T8 1']);
    const selection = played.events.find((event) => event.kind === 'bowler_selected');
    const outcome = applyHistoryEdits(setup, played.events, [{ op: 'delete', seq: selection?.seq ?? 0 }], { ids: () => 'id', now: '2026-05-01T12:00:00.000Z' });
    expect(outcome).toMatchObject({ ok: false, code: 'BOWLER_NOT_SELECTED', atSeq: 8 });
  });

  it('U-VAL-56 seq out of order is a replay error and the next event still applies', () => {
    const payloads = build(setup, playScript(setup, []).state, { type: 'start_innings', strikerId: 'L1', nonStrikerId: 'L2', bowlerId: 'T7' });
    const events = rawEvents(setup, [...payloads, delivery(live), delivery(live, { runsRun: 1 })]);
    const shifted = [events[0], { ...events[1], seq: 3 }, { ...events[2], seq: 4 }];
    const state = replayMatch(setup, shifted);
    expect(state.issues).toEqual([expect.objectContaining({ seq: 3, code: 'SEQ_OUT_OF_ORDER', severity: 'error' })]);
    expect(state.lastSeq).toBe(4);
    expect(state.lastAppliedSeq).toBe(4);
    expect(inn(state).runs).toBe(1);
  });
});

describe('warnings (U-VAL-60..65)', () => {
  it('U-VAL-63 SQUAD_EXHAUSTED on the last available batter and at a short squad start', () => {
    const short = matchSetup({ squadSize: 5 });
    const state = play(short, ['start:L1:L2:T5', 'W W W'], { autoBatters: true }).state;
    const [payload] = build(short, state, { type: 'batter_in', playerId: 'L5' });
    expect(validateEvent(short, state, payload)).toEqual({ ok: true, warnings: [expect.objectContaining({ code: 'SQUAD_EXHAUSTED' })] });
    const start = playScript(short, []).state;
    expect(
      validateEvent(short, start, { kind: 'innings_started', inningsIndex: 0, battingTeamId: 'LIO', strikerId: 'L1', nonStrikerId: 'L2', bowlerId: 'T5' }),
    ).toEqual({ ok: true, warnings: [expect.objectContaining({ code: 'SQUAD_EXHAUSTED' })] });
    const lastWicket = play(short, ['start:L1:L2:T5', 'W W W', '>L5'], { autoBatters: true }).state;
    expect(validateEvent(short, lastWicket, wicketOn(lastWicket, {}))).toEqual({ ok: true, warnings: [expect.objectContaining({ code: 'SQUAD_EXHAUSTED' })] });
  });

  it('a full squad raises no warning on the normal last batter', () => {
    const nine = play(setup, ['start:L1:L2:T7', 'W W W W W W W W W'], { autoBatters: true, autoBowlers: true }).state;
    const [payload] = build(setup, nine, { type: 'batter_in', playerId: 'L11' });
    expect(validateEvent(setup, nine, payload)).toEqual({ ok: true, warnings: [] });
  });
});

describe('stamp mode (U-VAL-70) and validateLog', () => {
  it('a stale stamp is a warning on replay and the delivery uses the derived context', () => {
    const start = build(setup, playScript(setup, []).state, { type: 'start_innings', strikerId: 'L1', nonStrikerId: 'L2', bowlerId: 'T7' });
    const stale = delivery(live, { strikerId: 'L2', nonStrikerId: 'L1', runsRun: 1 });
    expect(validateEvent(setup, live, stale, 'replay')).toEqual({ ok: true, warnings: [] });
    const state = replayMatch(setup, rawEvents(setup, [...start, stale]));
    expect(state.issues).toEqual([expect.objectContaining({ severity: 'warning', code: 'CONTEXT_MISMATCH', seq: 2 })]);
    expect(state.needsRepair).toBe(false);
    expect(inn(state).batting.find((row) => row.playerId === 'L1')?.runs).toBe(1);
    expect(inn(state).balls[0].strikerId).toBe('L1');
    expect(validateLog(setup, rawEvents(setup, [...start, stale]))).toMatchObject({ ok: true });
  });

  it('validateLog reports error issues', () => {
    const start = build(setup, playScript(setup, []).state, { type: 'start_innings', strikerId: 'L1', nonStrikerId: 'L2', bowlerId: 'T7' });
    const result = validateLog(setup, rawEvents(setup, [...start, corrupted(delivery(live), { boundary: 5 })]));
    expect(result).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'INVALID_BOUNDARY', severity: 'error' })] });
  });
});

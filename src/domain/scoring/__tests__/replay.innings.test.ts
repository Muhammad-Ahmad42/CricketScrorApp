import { buildEvents, scoreRuns } from '../commands';
import { rulesForOvers } from '../presets';
import { buildMatchSummary } from '../summary';
import { validateEvent } from '../validate';
import { battersUnavailable, m8LmsSetup, m8v7Setup, matchSetup, playedMatch, playScript } from '../testing';
import { batter, chaseAt, delivery, inn, play } from './helpers';

const TEN_WICKETS = 'W W W W W W W W W W';
const AUTO = { autoBatters: true, autoBowlers: true } as const;

describe('innings completion (U-INN)', () => {
  const setup = matchSetup();

  it('U-INN-01 all out at the tenth wicket in an 11-a-side match', () => {
    const state = play(setup, ['start:L1:L2:T7', TEN_WICKETS], AUTO).state;
    expect(inn(state, 0)).toMatchObject({ wickets: 10, completion: { reason: 'all_out' }, status: 'complete' });
    expect(state.pendingAction).toEqual({ type: 'start_next_innings', inningsIndex: 1, kind: 'regular', superOverRound: null, suggestedBattingTeamId: 'TIG' });
  });

  it('EC-W-14 no incoming-batter prompt after the last wicket', () => {
    const state = play(setup, ['start:L1:L2:T7', TEN_WICKETS], AUTO).state;
    expect(state.pendingAction?.type).toBe('start_next_innings');
  });

  it('U-INN-02 eight a side is all out at seven', () => {
    const eight = matchSetup({ rules: { playersPerSide: 8 } });
    const state = play(eight, ['start:L1:L2:T7', 'W W W W W W W'], AUTO).state;
    expect(inn(state, 0)).toMatchObject({ wickets: 7, completion: { reason: 'all_out' } });
  });

  it('U-INN-03 last man stands: lone striker at seven down, all out at eight', () => {
    const lms = m8LmsSetup();
    const seven = play(lms, ['start:L1:L2:T7', 'W W W W W W W'], AUTO).state;
    expect(inn(seven)).toMatchObject({ wickets: 7, status: 'in_progress', nonStrikerId: null });
    expect(inn(seven).strikerId).not.toBeNull();
    expect(seven.pendingAction).toBeNull();
    expect(inn(seven).currentPartnership).toMatchObject({ batterBId: null, wicketNumber: 8 });
    const eight = play(lms, ['start:L1:L2:T7', 'W W W W W W W W'], AUTO).state;
    expect(inn(eight, 0)).toMatchObject({ wickets: 8, completion: { reason: 'all_out' } });
  });

  it('EC-B-06 the lone batter can be run out at either end', () => {
    const lms = m8LmsSetup();
    const out = play(lms, ['start:L1:L2:T7', 'W W W W W W W', 'ro:sn:1'], AUTO).state;
    expect(inn(out, 0)).toMatchObject({ wickets: 8, runs: 1, completion: { reason: 'all_out' } });
  });

  it('U-INN-04 uneven sides: Tigers with seven players are all out at six', () => {
    const uneven = m8v7Setup();
    expect(uneven.teams.map((team) => team.playersInSide)).toEqual([8, 7]);
    const lions = play(uneven, ['start:L1:L2:T7']).state;
    expect(inn(lions).limits.maxWickets).toBe(7);
    const tigers = chaseAt(uneven, { firstRuns: 50, runs: 0, wickets: 6 }).state;
    expect(inn(tigers, 1)).toMatchObject({ wickets: 6, completion: { reason: 'all_out' } });
    expect(inn(tigers, 1).limits.maxWickets).toBe(6);
  });

  it('U-INN-05 uneven sides with last man stands: survivor alone at six, all out at seven', () => {
    const uneven = m8v7Setup({ rules: { lastManStands: true } });
    const six = chaseAt(uneven, { firstRuns: 50, runs: 0, wickets: 6 }).state;
    expect(inn(six, 1)).toMatchObject({ wickets: 6, status: 'in_progress', nonStrikerId: null });
    const seven = chaseAt(uneven, { firstRuns: 50, runs: 0, wickets: 7 }).state;
    expect(inn(seven, 1)).toMatchObject({ wickets: 7, completion: { reason: 'all_out' } });
  });

  it('U-RES-05 / EC-B-07 uneven sides: Tigers win a chase three down by three wickets', () => {
    const uneven = m8v7Setup();
    const won = chaseAt(uneven, { firstRuns: 20, runs: 0, wickets: 3 }, ['6 6 6 6']).state;
    expect(won.naturalResult).toMatchObject({ type: 'win', winnerTeamId: 'TIG', margin: { kind: 'wickets', wickets: 3 } });
    expect(won.resultText).toMatch(/^Tigers won by 3 wickets/);
  });

  it('EC-B-06 last man stands 11-a-side: a chase won ten down is won by one wicket', () => {
    const lms = matchSetup({ rules: { lastManStands: true } });
    const won = chaseAt(lms, { firstRuns: 20, runs: 0, wickets: 10 }, ['6 6 6 6']).state;
    expect(won.naturalResult).toMatchObject({ margin: { kind: 'wickets', wickets: 1 } });
    expect(won.resultText).toMatch(/^Tigers won by 1 wicket /);
  });

  it('U-INN-06 overs complete on the 120th legal ball', () => {
    const state = playedMatch({ setup, first: { runs: 150, wickets: 3 }, second: null, end: null }).state;
    expect(inn(state, 0)).toMatchObject({ legalBalls: 120, completion: { reason: 'overs_complete' } });
  });

  it('U-INN-07 custom 17 overs', () => {
    const seventeen = matchSetup({ rules: rulesForOvers(17) });
    const state = playedMatch({ setup: seventeen, first: { runs: 120 }, second: null, end: null }).state;
    expect(inn(state, 0)).toMatchObject({ legalBalls: 102, completion: { reason: 'overs_complete' } });
  });

  it('U-INN-08 / EC-I-03 target reached mid-over stops the innings at once', () => {
    const state = chaseAt(setup, { firstRuns: 20, runs: 17, wickets: 0 }, ['6']).state;
    expect(inn(state, 1)).toMatchObject({ runs: 23, completion: { reason: 'target_reached' } });
    expect(state.pendingAction?.type).toBe('confirm_result');
    expect(buildEvents(setup, state, scoreRuns(1))).toMatchObject({ ok: false, code: 'PENDING_ACTION_REQUIRED' });
  });

  it('U-INN-09 / EC-B-14 declaration sets the target from the declared total', () => {
    const state = play(setup, ['start:L1:L2:T7', '6 6 4', 'decl', 'start:T1:T2:L10']).state;
    expect(inn(state, 0).completion?.reason).toBe('declared');
    expect(inn(state, 1).target).toEqual({ runs: 17, revised: false, source: 'first_innings' });
  });

  it('U-INN-10 a declaration cannot name absentees', () => {
    const state = play(setup, ['start:L1:L2:T7']).state;
    expect(buildEvents(setup, state, { type: 'end_innings', reason: 'declared', absentees: [{ playerId: 'L11', hurt: false }] })).toMatchObject({
      ok: false,
      code: 'INVALID_ABSENTEE',
    });
  });

  it('U-INN-11 batters unavailable counts as all out and marks the absentee', () => {
    const nine = play(setup, ['start:L1:L2:T7', 'W W W W W W W W W'], AUTO).state;
    const pending = nine.pendingAction;
    expect(pending).toMatchObject({ type: 'select_next_batter', candidates: ['L11'], canEndInnings: false });
    const ended = play(setup, ['start:L1:L2:T7', 'W W W W W W W W W', battersUnavailable([{ playerId: 'L11', hurt: true }])], AUTO);
    expect(inn(ended.state, 0).completion?.reason).toBe('batters_unavailable');
    expect(batter(ended.state, 'L11', 0)).toMatchObject({ status: 'absent', dismissalText: 'absent hurt' });
    const finished = playScript(setup, ['start:T1:T2:L10', 'W W W W W W W W W W', 'end'], { prior: ended.events, ...AUTO });
    const summary = buildMatchSummary(setup, finished.state, { completedAt: null });
    expect(summary?.innings[0]).toMatchObject({ allOut: true, completion: 'batters_unavailable' });
    expect(summary?.innings[1]).toMatchObject({ allOut: true, completion: 'all_out' });
  });

  it('U-INN-12 / EC-B-09 an absentee who already batted is rejected', () => {
    const state = play(setup, ['start:L1:L2:T7', 'W'], AUTO).state;
    expect(buildEvents(setup, state, battersUnavailable([{ playerId: 'L1', hurt: false }]))).toMatchObject({ ok: false, code: 'INVALID_ABSENTEE' });
    expect(buildEvents(setup, state, battersUnavailable([{ playerId: 'L2', hurt: false }]))).toMatchObject({ ok: false, code: 'INVALID_ABSENTEE' });
    expect(buildEvents(setup, state, battersUnavailable([{ playerId: 'T5', hurt: false }]))).toMatchObject({ ok: false, code: 'INVALID_ABSENTEE' });
    expect(buildEvents(setup, state, battersUnavailable([{ playerId: 'L9', hurt: false }, { playerId: 'L9', hurt: true }]))).toMatchObject({
      ok: false,
      code: 'INVALID_ABSENTEE',
    });
  });

  it('EC-B-08 a side two short ends its innings with named absentees', () => {
    const short = matchSetup({ squadSize: 9 });
    const eight = play(short, ['start:L1:L2:T7', 'W W W W W W W W'], AUTO).state;
    expect(eight.pendingAction).toMatchObject({ type: 'select_next_batter', candidates: [], canEndInnings: true });
    expect(inn(eight).limits.maxWickets).toBe(10);
    const ended = play(short, ['start:L1:L2:T7', 'W W W W W W W W', battersUnavailable([])], AUTO).state;
    expect(inn(ended, 0).completion?.reason).toBe('batters_unavailable');
    const named = play(setup, ['start:L1:L2:T7', 'W W W W W W W', battersUnavailable([{ playerId: 'L10', hurt: false }, { playerId: 'L11', hurt: true }])], AUTO).state;
    expect(batter(named, 'L10', 0)).toMatchObject({ status: 'absent', dismissalText: 'absent' });
    expect(batter(named, 'L11', 0)).toMatchObject({ status: 'absent', dismissalText: 'absent hurt' });
  });

  it('U-INN-13 no result mid-innings closes the innings with match_ended', () => {
    const state = play(setup, ['start:L1:L2:T7', '1 1', { type: 'end_match', outcome: { type: 'no_result', reason: 'Rain' } }]).state;
    expect(inn(state, 0).completion?.reason).toBe('match_ended');
    expect(state.pendingAction).toBeNull();
    expect(state.lifecycle).toBe('completed');
  });

  it('U-INN-14 revising to the balls already bowled completes the innings', () => {
    const revised = play(setup, ['start:L1:L2:T7', ...Array.from({ length: 60 }, () => '1'), { type: 'revise_overs', inningsIndex: 0, balls: 60, reason: 'Rain' }], {
      autoBowlers: true,
    }).state;
    expect(inn(revised, 0)).toMatchObject({ legalBalls: 60, completion: { reason: 'overs_complete' } });
    expect(revised.pendingAction?.type).toBe('start_next_innings');
  });

  it('U-INN-16/17 super-over innings end at two wickets or six balls', () => {
    const tied = playedMatch({ setup, first: { runs: 100 }, second: { runs: 100, wickets: 2 }, end: null });
    const twoDown = playScript(setup, ['so', 'start:T1:T2:L10', 'W W'], { prior: tied.events, autoBatters: true }).state;
    expect(inn(twoDown, 2)).toMatchObject({ kind: 'super_over', wickets: 2, completion: { reason: 'all_out' } });
    expect(inn(twoDown, 2).limits).toMatchObject({ maxWickets: 2, maxBalls: 6 });
    const sixBalls = playScript(setup, ['so', 'start:T1:T2:L10', '1 1 1 1 1 1'], { prior: tied.events }).state;
    expect(inn(sixBalls, 2).completion?.reason).toBe('overs_complete');
  });

  it('EC-B-13 two-a-side: all out after one wicket, super over allows one wicket', () => {
    const tiny = matchSetup({ rules: { playersPerSide: 2 } });
    const out = play(tiny, ['start:L1:L2:T7', 'W']).state;
    expect(inn(out, 0).completion?.reason).toBe('all_out');
    const tied = playedMatch({ setup: tiny, first: { runs: 12, balls: 12 }, second: { runs: 12, wickets: 1, balls: 12 }, end: null });
    const superOver = playScript(tiny, ['so', 'start:T1:T2:L10'], { prior: tied.events }).state;
    expect(inn(superOver).limits.maxWickets).toBe(1);
  });

  it('U-INN-18 a completed innings never reopens', () => {
    const state = playedMatch({ setup, first: { runs: 150 }, second: null, end: null }).state;
    expect(validateEvent(setup, state, delivery(state, {}))).toMatchObject({ ok: false, code: 'PENDING_ACTION_REQUIRED' });
  });

  it('U-INN-19 eleven batting rows, substitutes excluded', () => {
    const state = play(setup, ['start:L1:L2:T7']).state;
    expect(inn(state).batting.map((row) => row.playerId)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11']);
  });
});

import type { MatchResult, MatchRules, MatchSetup, MatchStatus } from '../../types';
import { buildEvents } from '../commands';
import {
  computeNaturalResult,
  formatResult,
  matchStatusLabel,
  resultLoser,
  resultMethod,
  resultWinner,
  suggestRevisedTarget,
} from '../result';
import { formatRequirement } from '../format';
import { validateEvent } from '../validate';
import { buildMatchSummary } from '../summary';
import { battersUnavailable, endMatch, matchSetup, penalty, playedMatch, playScript, tied, winByRuns, winByWickets } from '../testing';
import { chaseAfter, inn, play } from './helpers';

const TEAMS = matchSetup().teams;

function shortTie(rules: Partial<MatchRules> = {}): { readonly setup: MatchSetup; readonly events: ReturnType<typeof playScript>['events'] } {
  const setup = matchSetup({ rules: { oversPerInnings: 2, maxOversPerBowler: 1, ...rules } });
  const played = playScript(setup, ['start:L1:L2:T7', '4 4 4 0 0 0', '@T8 0 0 0 0 0 0', 'start:T1:T2:L10', '6 6 0 0 0 0', '@L11 0 0 0 0 0 0']);
  return { setup, events: played.events };
}

describe('natural results (U-RES-01..10)', () => {
  const setup = matchSetup();

  it('U-RES-01 Lions defend 160 by 3 runs', () => {
    const state = playedMatch({ setup, first: { runs: 160, wickets: 6 }, second: { runs: 157, wickets: 9 }, end: null }).state;
    expect(state.naturalResult).toEqual(winByRuns('LIO', 'TIG', 3));
    expect(state.resultText).toBe('Lions won by 3 runs');
  });

  it('U-RES-02 singular run', () => {
    const state = playedMatch({ setup, first: { runs: 160, wickets: 6 }, second: { runs: 159, wickets: 7 }, end: null }).state;
    expect(state.resultText).toBe('Lions won by 1 run');
  });

  it('U-RES-03 chase won with overs to spare', () => {
    const state = playedMatch({ setup, first: { runs: 160, wickets: 6 }, second: { runs: 161, wickets: 5, balls: 108 }, end: null }).state;
    expect(state.naturalResult).toEqual(winByWickets('TIG', 'LIO', 5, 12));
    expect(state.resultText).toBe('Tigers won by 5 wickets (12 balls left)');
  });

  it('U-RES-04 singular wicket and ball', () => {
    const state = playedMatch({ setup, first: { runs: 160, wickets: 6 }, second: { runs: 162, wickets: 9, balls: 119 }, end: null }).state;
    expect(state.resultText).toBe('Tigers won by 1 wicket (1 ball left)');
  });

  it('U-RES-06 / EC-R-02 a tie without super overs offers accept or decide otherwise', () => {
    const noSuperOver = matchSetup({ rules: { superOver: { ...matchSetup().rules.superOver, enabled: false } } });
    const state = playedMatch({ setup: noSuperOver, first: { runs: 160 }, second: { runs: 160, wickets: 3 }, end: null }).state;
    expect(state.naturalResult).toEqual({ type: 'tie', decider: null });
    expect(state.resultText).toBe('Match tied');
    expect(state.pendingAction).toEqual({ type: 'resolve_tie', options: ['accept_tie', 'decide_other'], nextSuperOverRound: null });
    const accepted = playScript(noSuperOver, ['end'], { prior: playedMatch({ setup: noSuperOver, first: { runs: 160 }, second: { runs: 160, wickets: 3 }, end: null }).events }).state;
    expect(accepted.result).toEqual({ type: 'tie', decider: null });
    expect(matchStatusLabel('completed', accepted.result)).toBe('Tied');
  });

  it('U-RES-07 revised target played out', () => {
    const state = playedMatch({
      setup,
      first: { runs: 160, wickets: 5 },
      second: { runs: 87, wickets: 6, revision: { balls: 72, target: 100 } },
      end: null,
    }).state;
    expect(inn(state, 1)).toMatchObject({ legalBalls: 72, completion: { reason: 'overs_complete' }, target: { runs: 100, revised: true, source: 'revision' } });
    expect(state.naturalResult).toEqual(winByRuns('LIO', 'TIG', 12, 'revised_target'));
    expect(state.resultText).toBe('Lions won by 12 runs (revised target)');
  });

  describe('par score (U-RES-08..10, EC-I-11)', () => {
    const tigersFirst = matchSetup({ toss: { winnerTeamId: 'TIG', decision: 'bat' } });
    const terminated = (runs: number) =>
      playedMatch({
        setup: tigersFirst,
        first: { runs: 170, wickets: 7 },
        second: { runs, wickets: 2, balls: 86, terminated: { target: 111 } },
        end: null,
      });

    it('U-RES-08 ahead of par: chasing side wins by runs', () => {
      const played = terminated(131);
      const state = played.state;
      expect(state.lifecycle).toBe('paused');
      expect(inn(state, 1)).toMatchObject({ legalBalls: 86, completion: { reason: 'terminated' }, limits: { maxBalls: 86 } });
      expect(state.naturalResult).toEqual(winByRuns('LIO', 'TIG', 21, 'par_score'));
      expect(state.pendingAction).toMatchObject({ type: 'confirm_result', text: 'Lions won by 21 runs (par score)' });
      const confirmed = playScript(tigersFirst, ['end'], { prior: played.events }).state;
      expect(confirmed.lifecycle).toBe('completed');
      expect(confirmed.result).toEqual(winByRuns('LIO', 'TIG', 21, 'par_score'));
      expect(confirmed.suspension).toBeNull();
      expect(resultMethod(confirmed.result as MatchResult)).toBe('par_score');
    });

    it('U-RES-09 behind par: side batting first wins by par minus runs', () => {
      const state = terminated(100).state;
      expect(state.naturalResult).toEqual(winByRuns('TIG', 'LIO', 10, 'par_score'));
      expect(state.resultText).toBe('Tigers won by 10 runs (par score)');
    });

    it('U-RES-10 level with par is a tie', () => {
      const state = terminated(110).state;
      expect(state.naturalResult).toEqual({ type: 'tie', decider: null });
      expect(state.resultText).toBe('Match tied (par score)');
      expect(state.pendingAction?.type).toBe('resolve_tie');
    });
  });

  it('EC-I-04 target revised mid-chase', () => {
    const steps = ['W W', ...Array.from({ length: 13 }, () => '6'), '2', ...Array.from({ length: 44 }, () => '0')];
    const live = chaseAfter(setup, { runs: 160, wickets: 4 }, steps);
    expect(inn(live.state)).toMatchObject({ runs: 80, wickets: 2, legalBalls: 60 });
    const revised = playScript(setup, [{ type: 'revise_overs', inningsIndex: 1, overs: 15, target: 121, reason: 'Rain' }], { prior: live.events });
    expect(inn(revised.state).limits.maxBalls).toBe(90);
    expect(revised.state.chase).toMatchObject({ target: 121, runsRequired: 41, ballsRemaining: 30 });
    expect(formatRequirement(41, 30)).toBe('Need 41 from 30 balls');
    const won = playScript(setup, ['0 0 0 0 0 0 0 0 6 6 6 6 6 6 6'], { prior: revised.events, autoBowlers: true }).state;
    expect(inn(won, 1)).toMatchObject({ runs: 122, legalBalls: 75, completion: { reason: 'target_reached' } });
    expect(won.resultText).toBe('Tigers won by 8 wickets (15 balls left) (revised target)');
  });
});

describe('super overs (U-RES-11..16)', () => {
  it('U-RES-11 Tigers win the super over', () => {
    const { setup, events } = shortTie();
    const tiedState = playScript(setup, [], { prior: events }).state;
    expect(tiedState.pendingAction).toEqual({ type: 'resolve_tie', options: ['super_over', 'accept_tie', 'decide_other'], nextSuperOverRound: 1 });
    const played = playScript(setup, ['so', 'start:T1:T2:L9', '6 4 W 1 0 0', 'start:L1:L2:T9', '4 W 4 W'], { prior: events, autoBatters: true }).state;
    expect(inn(played, 2)).toMatchObject({ battingTeamId: 'TIG', runs: 11, wickets: 1 });
    expect(inn(played, 3)).toMatchObject({ battingTeamId: 'LIO', runs: 8, wickets: 2, completion: { reason: 'all_out' } });
    const expected: MatchResult = { type: 'tie', decider: { method: 'super_over', winnerTeamId: 'TIG', superOverRounds: 1 } };
    expect(played.naturalResult).toEqual(expected);
    expect(played.resultText).toBe('Match tied — Tigers won the Super Over');
    expect(resultWinner(expected)).toBe('TIG');
    expect(resultMethod(expected)).toBe('super_over');
    expect(inn(played, 0).runs).toBe(12);
    expect(inn(played, 1).runs).toBe(12);
  });

  it('U-RES-12 tied again with repeat: round two decides', () => {
    const { setup, events } = shortTie();
    const roundOne = playScript(setup, ['so', 'start:T1:T2:L9', '4 1 0 0 0 0', 'start:L1:L2:T9', '4 1 0 0 0 0'], { prior: events });
    expect(roundOne.state.naturalResult).toEqual({ type: 'tie', decider: null });
    expect(roundOne.state.pendingAction).toMatchObject({ type: 'resolve_tie', nextSuperOverRound: 2 });
    const roundTwo = playScript(setup, ['so', 'start:L1:L2:T8', '6 0 0 0 0 0', 'start:T1:T2:L11', '1 0 0 0 0 0'], { prior: roundOne.events }).state;
    expect(roundTwo.naturalResult).toEqual({ type: 'tie', decider: { method: 'super_over', winnerTeamId: 'LIO', superOverRounds: 2 } });
  });

  it('U-RES-13 boundary count decides a tied super over', () => {
    const { setup, events } = shortTie({ superOver: { ...matchSetup().rules.superOver, ifTiedAgain: 'boundary_count' } });
    const state = playScript(setup, ['so', 'start:T1:T2:L9', '4 0 0 0 0 0', 'start:L1:L2:T9', '4 0 0 0 0 0'], { prior: events }).state;
    expect(state.naturalResult).toEqual({ type: 'tie', decider: { method: 'boundary_count', winnerTeamId: 'LIO', superOverRounds: 1 } });
    expect(state.resultText).toBe('Match tied — Lions won on boundary count');
    expect(state.pendingAction?.type).toBe('confirm_result');
  });

  it('U-RES-14 boundary count still level leaves the tie undecided', () => {
    const { setup, events } = shortTie({ superOver: { ...matchSetup().rules.superOver, ifTiedAgain: 'boundary_count' } });
    const state = playScript(setup, ['so', 'start:T1:T2:L9', '4 0 0 0 0 0', 'start:L1:L2:T9', '1 1 1 1 0 0'], { prior: events }).state;
    expect(state.naturalResult).toEqual({ type: 'tie', decider: null });
    expect(state.pendingAction).toEqual({ type: 'resolve_tie', options: ['accept_tie', 'decide_other'], nextSuperOverRound: null });
    expect(buildEvents(setup, state, { type: 'start_super_over' })).toMatchObject({ ok: false, code: 'SUPER_OVER_NOT_ALLOWED' });
  });

  it('EC-R-05 tie stands after a tied super over', () => {
    const { setup, events } = shortTie({ superOver: { ...matchSetup().rules.superOver, ifTiedAgain: 'tie_stands' } });
    const state = playScript(setup, ['so', 'start:T1:T2:L9', '4 0 0 0 0 0', 'start:L1:L2:T9', '4 0 0 0 0 0'], { prior: events }).state;
    expect(state.pendingAction).toMatchObject({ type: 'resolve_tie', options: ['accept_tie', 'decide_other'] });
  });

  it('U-RES-15 maxRounds reached', () => {
    const { setup, events } = shortTie({ superOver: { ...matchSetup().rules.superOver, maxRounds: 1 } });
    const state = playScript(setup, ['so', 'start:T1:T2:L9', '4 0 0 0 0 0', 'start:L1:L2:T9', '4 0 0 0 0 0'], { prior: events }).state;
    expect(state.pendingAction).toMatchObject({ type: 'resolve_tie', options: ['accept_tie', 'decide_other'], nextSuperOverRound: null });
    expect(buildEvents(setup, state, { type: 'start_super_over' })).toMatchObject({ ok: false, code: 'SUPER_OVER_LIMIT_REACHED' });
  });

  it('U-RES-16 tie decided by coin toss', () => {
    const { setup, events } = shortTie();
    const state = playScript(setup, [endMatch({ type: 'tie_decided', method: 'coin_toss', winnerTeamId: 'LIO' })], { prior: events }).state;
    expect(state.result).toEqual({ type: 'tie', decider: { method: 'coin_toss', winnerTeamId: 'LIO', superOverRounds: 0 } });
    expect(resultMethod(state.result as MatchResult)).toBe('coin_toss');
    expect(state.resultText).toBe('Match tied — Lions won the coin toss');
  });

  it('EC-I-15 a super over needs play resumed first, accepting the tie does not', () => {
    const { setup, events } = shortTie();
    const paused = playScript(setup, ['susp'], { prior: events }).state;
    expect(paused.pendingAction?.type).toBe('resolve_tie');
    expect(buildEvents(setup, paused, { type: 'start_super_over' })).toMatchObject({ ok: false, code: 'PLAY_SUSPENDED' });
    expect(buildEvents(setup, paused, endMatch()).ok).toBe(true);
  });

  it('super-over runs never touch the main innings or player cards', () => {
    const { setup, events } = shortTie();
    const state = playScript(setup, ['so', 'start:T1:T2:L9', '6 6 6 6 6 6', 'start:L1:L2:T9', '1'], { prior: events }).state;
    expect(inn(state, 1).batting.find((row) => row.playerId === 'T1')?.runs).toBe(12);
    expect(inn(state, 0).runs).toBe(12);
  });
});

describe('ended matches (U-RES-17..27)', () => {
  const setup = matchSetup();

  it('U-RES-17 no result', () => {
    const state = play(setup, ['start:L1:L2:T7', { type: 'end_match', outcome: { type: 'no_result', reason: 'Rain' } }]).state;
    expect(state.result).toEqual({ type: 'no_result', reason: 'Rain' });
    expect(state.lifecycle).toBe('completed');
    expect(matchStatusLabel('completed', state.result)).toBe('No Result');
    expect(state.resultText).toBe('No result');
  });

  it('U-RES-18 abandoned before a ball', () => {
    const state = playScript(setup, [{ type: 'end_match', outcome: { type: 'abandoned', reason: 'Waterlogged' } }]).state;
    expect(state).toMatchObject({ lifecycle: 'abandoned', result: { type: 'abandoned', reason: 'Waterlogged' }, resultText: 'Match abandoned' });
    expect(state.innings).toEqual([]);
  });

  it('EC-R-10 abandoned during play closes the innings', () => {
    const state = play(setup, ['start:L1:L2:T7', '1 1', { type: 'end_match', outcome: { type: 'abandoned', reason: 'Rain' } }]).state;
    expect(state.lifecycle).toBe('abandoned');
    expect(inn(state, 0).completion?.reason).toBe('match_ended');
  });

  it('U-RES-19 walkover as the only event', () => {
    const state = playScript(setup, [{ type: 'end_match', outcome: { type: 'walkover', winnerTeamId: 'TIG', reason: null } }]).state;
    expect(state.result).toEqual({ type: 'walkover', winnerTeamId: 'TIG', loserTeamId: 'LIO', reason: null });
    expect(state.innings).toEqual([]);
    expect(state.resultText).toBe('Tigers won by walkover');
    expect(matchStatusLabel('completed', state.result)).toBe('Walkover');
  });

  it('U-RES-20 / EC-R-14 walkover only before any delivery', () => {
    const started = play(setup, ['start:L1:L2:T7']).state;
    expect(buildEvents(setup, started, { type: 'end_match', outcome: { type: 'walkover', winnerTeamId: 'TIG', reason: null } }).ok).toBe(true);
    const played = play(setup, ['start:L1:L2:T7', '0']).state;
    expect(buildEvents(setup, played, { type: 'end_match', outcome: { type: 'walkover', winnerTeamId: 'TIG', reason: null } })).toMatchObject({
      ok: false,
      code: 'WALKOVER_AFTER_PLAY',
    });
    expect(buildEvents(setup, started, { type: 'end_match', outcome: { type: 'walkover', winnerTeamId: 'XXX', reason: null } })).toMatchObject({
      ok: false,
      code: 'TEAM_NOT_IN_MATCH',
    });
  });

  it('U-RES-21 awarded mid-innings', () => {
    const state = play(setup, ['start:L1:L2:T7', '1', { type: 'end_match', outcome: { type: 'awarded', winnerTeamId: 'TIG', reason: 'Lions refused to continue', margin: null } }]).state;
    expect(state.result).toEqual({ type: 'awarded', winnerTeamId: 'TIG', loserTeamId: 'LIO', reason: 'Lions refused to continue', margin: null });
    expect(state.resultText).toBe('Match awarded to Tigers');
    expect(matchStatusLabel('completed', state.result)).toBe('Completed');
  });

  it('U-RES-22 awarded without a winner', () => {
    const result: MatchResult = { type: 'awarded', winnerTeamId: null, loserTeamId: null, reason: 'Both sides at fault', margin: null };
    expect(resultWinner(result)).toBeNull();
    expect(resultLoser(result, ['LIO', 'TIG'])).toBeNull();
    expect(formatResult(result, TEAMS)).toBe('No result (awarded)');
  });

  it('U-RES-23 the natural result waits for confirmation', () => {
    const played = playedMatch({ setup, first: { runs: 100 }, second: { runs: 101, wickets: 2, balls: 60 }, end: null });
    expect(played.state).toMatchObject({ result: null, lifecycle: 'live', canRecordDelivery: false, resultText: 'Tigers won by 8 wickets (60 balls left)' });
    expect(played.state.naturalResult).not.toBeNull();
    const confirmed = playScript(setup, ['end'], { prior: played.events }).state;
    expect(confirmed.result).toEqual(played.state.naturalResult);
    expect(confirmed).toMatchObject({ lifecycle: 'completed', pendingAction: null });
  });

  it('U-RES-24 no natural result yet', () => {
    const state = play(setup, ['start:L1:L2:T7', '1']).state;
    expect(buildEvents(setup, state, endMatch())).toMatchObject({ ok: false, code: 'NATURAL_RESULT_NOT_REACHED' });
  });

  it('U-RES-25 tie_decided needs a tie', () => {
    const state = playedMatch({ setup, first: { runs: 100 }, second: { runs: 90, wickets: 2 }, end: null }).state;
    expect(buildEvents(setup, state, endMatch({ type: 'tie_decided', method: 'coin_toss', winnerTeamId: 'LIO' }))).toMatchObject({
      ok: false,
      code: 'RESULT_NOT_TIED',
    });
  });

  it('U-RES-26 nothing after match_ended', () => {
    const played = playedMatch({ setup, first: { runs: 100 }, second: { runs: 90 } });
    expect(played.state.lifecycle).toBe('completed');
    expect(validateEvent(setup, played.state, { kind: 'play_suspended', reason: 'rain', note: null })).toMatchObject({ ok: false, code: 'MATCH_ALREADY_ENDED' });
    expect(validateEvent(setup, played.state, { kind: 'penalty_awarded', teamId: 'LIO', inningsIndex: 0, runs: 5, reason: 'x' })).toMatchObject({
      ok: false,
      code: 'MATCH_ALREADY_ENDED',
    });
  });

  it('U-RES-27 loser of a decided tie', () => {
    expect(resultLoser(tied({ method: 'super_over', winnerTeamId: 'TIG' }), ['LIO', 'TIG'])).toBe('LIO');
    expect(resultLoser(tied(), ['LIO', 'TIG'])).toBeNull();
    expect(resultWinner(tied())).toBeNull();
  });

  it('U-RES-28 status labels', () => {
    const cases: readonly [MatchStatus, MatchResult | null, string][] = [
      ['scheduled', null, 'Scheduled'],
      ['live', null, 'Live'],
      ['paused', null, 'Paused'],
      ['postponed', null, 'Postponed'],
      ['cancelled', null, 'Cancelled'],
      ['completed', winByRuns('LIO', 'TIG', 3), 'Completed'],
      ['completed', tied(), 'Tied'],
      ['completed', { type: 'no_result', reason: null }, 'No Result'],
      ['completed', { type: 'walkover', winnerTeamId: 'TIG', loserTeamId: 'LIO', reason: null }, 'Walkover'],
      ['abandoned', { type: 'abandoned', reason: null }, 'Abandoned'],
      ['completed', { type: 'awarded', winnerTeamId: 'TIG', loserTeamId: 'LIO', reason: 'x', margin: null }, 'Completed'],
    ];
    for (const [status, result, label] of cases) {
      expect(matchStatusLabel(status, result)).toBe(label);
    }
  });

  it('U-RES-29/30 suggested revised target', () => {
    expect(suggestRevisedTarget('average_run_rate', 160, 120, 72)).toBe(97);
    expect(suggestRevisedTarget('average_run_rate', 150, 120, 70)).toBe(88);
    expect(suggestRevisedTarget('average_run_rate', 150, 0, 70)).toBeNull();
    expect(suggestRevisedTarget('average_run_rate', 150, 120, 72)).toBe(91);
  });

  it('computeNaturalResult is null while undetermined', () => {
    const state = play(setup, ['start:L1:L2:T7', '1']).state;
    expect(computeNaturalResult(setup, state)).toBeNull();
  });
});

describe('formatResult (BR-RS-15)', () => {
  it.each<[MatchResult, string]>([
    [winByRuns('LIO', 'TIG', 3), 'Lions won by 3 runs'],
    [winByRuns('LIO', 'TIG', 1), 'Lions won by 1 run'],
    [winByWickets('TIG', 'LIO', 5, 12), 'Tigers won by 5 wickets (12 balls left)'],
    [winByWickets('TIG', 'LIO', 1, 1), 'Tigers won by 1 wicket (1 ball left)'],
    [winByWickets('TIG', 'LIO', 3, 0), 'Tigers won by 3 wickets'],
    [winByRuns('LIO', 'TIG', 12, 'revised_target'), 'Lions won by 12 runs (revised target)'],
    [winByWickets('TIG', 'LIO', 8, 15, 'revised_target'), 'Tigers won by 8 wickets (15 balls left) (revised target)'],
    [winByRuns('LIO', 'TIG', 21, 'par_score'), 'Lions won by 21 runs (par score)'],
    [winByRuns('TIG', 'LIO', 2, 'penalty_runs'), 'Tigers won by penalty runs'],
    [winByWickets('TIG', 'LIO', 0, 4, 'penalty_runs'), 'Tigers won by penalty runs'],
    [tied(), 'Match tied'],
    [tied({ method: 'super_over', winnerTeamId: 'TIG' }), 'Match tied — Tigers won the Super Over'],
    [tied({ method: 'boundary_count', winnerTeamId: 'TIG' }), 'Match tied — Tigers won on boundary count'],
    [tied({ method: 'bowl_out', winnerTeamId: 'TIG' }), 'Match tied — Tigers won the bowl-out'],
    [tied({ method: 'organizer', winnerTeamId: 'TIG' }), 'Match tied — Tigers won by organizer decision'],
    [{ type: 'no_result', reason: null }, 'No result'],
    [{ type: 'abandoned', reason: 'Rain' }, 'Match abandoned'],
    [{ type: 'walkover', winnerTeamId: 'TIG', loserTeamId: 'LIO', reason: null }, 'Tigers won by walkover'],
    [{ type: 'awarded', winnerTeamId: 'TIG', loserTeamId: 'LIO', reason: 'x', margin: null }, 'Match awarded to Tigers'],
  ])('%j', (result, text) => {
    expect(formatResult(result, TEAMS)).toBe(text);
  });

  it('methods and winners', () => {
    expect(resultMethod(winByRuns('LIO', 'TIG', 3))).toBe('normal');
    expect(resultMethod(winByRuns('TIG', 'LIO', 2, 'penalty_runs'))).toBe('penalty_runs');
    expect(resultMethod({ type: 'walkover', winnerTeamId: 'TIG', loserTeamId: 'LIO', reason: null })).toBe('walkover');
    expect(resultMethod({ type: 'awarded', winnerTeamId: null, loserTeamId: null, reason: 'x', margin: null })).toBe('awarded');
    expect(resultMethod({ type: 'no_result', reason: null })).toBe('none');
    expect(resultMethod(tied())).toBe('none');
    expect(resultWinner({ type: 'abandoned', reason: null })).toBeNull();
    expect(resultLoser(winByRuns('LIO', 'TIG', 3), ['LIO', 'TIG'])).toBe('TIG');
    expect(formatResult(winByRuns('X', 'Y', 3), TEAMS)).toBe('Unknown team won by 3 runs');
  });
});

describe('Law 16.10 statement of result: a win by penalty runs', () => {
  const setup = matchSetup();
  const allOut = playedMatch({ setup, first: { runs: 160, wickets: 6 }, second: { runs: 157, wickets: 10 }, end: null });

  it('a chasing side all out that passes the target only through a later penalty wins by penalty runs', () => {
    expect(allOut.state.innings[1]?.completion?.reason).toBe('all_out');
    expect(allOut.state.naturalResult).toEqual(winByRuns('LIO', 'TIG', 3));
    const awarded = playScript(setup, [penalty('TIG', 5)], { prior: allOut.events }).state;
    expect(awarded.innings[1]).toMatchObject({ runs: 162, wickets: 10, status: 'complete', completion: { reason: 'all_out' } });
    expect(awarded.naturalResult).toEqual(winByRuns('TIG', 'LIO', 2, 'penalty_runs'));
    expect(awarded.resultText).toBe('Tigers won by penalty runs');
    expect(awarded.pendingAction?.type).toBe('confirm_result');
    const ended = playScript(setup, ['end'], { prior: playScript(setup, [penalty('TIG', 5)], { prior: allOut.events }).events }).state;
    expect(ended.result).toEqual(winByRuns('TIG', 'LIO', 2, 'penalty_runs'));
    expect(resultMethod(ended.result ?? tied())).toBe('penalty_runs');
    const summary = buildMatchSummary(setup, ended, { completedAt: null });
    expect(summary?.result).toEqual(winByRuns('TIG', 'LIO', 2, 'penalty_runs'));
    expect(summary?.innings[1]).toMatchObject({ runs: 162, allOut: true });
  });

  it('an innings ended with batters unavailable counts as all out for the penalty-runs statement', () => {
    const played = play(
      setup,
      ['start:L1:L2:T7', '1', 'decl', 'start:T1:T2:L10', 'W W W W W W W W W', battersUnavailable([{ playerId: 'T11', hurt: true }]), penalty('TIG', 5)],
      { autoBatters: true, autoBowlers: true },
    ).state;
    expect(played.innings[1]).toMatchObject({ runs: 5, wickets: 9, completion: { reason: 'batters_unavailable' } });
    expect(played.naturalResult).toEqual(winByRuns('TIG', 'LIO', 4, 'penalty_runs'));
    expect(played.resultText).toBe('Tigers won by penalty runs');
  });

  it('a revised-target chase all out and then passed through a penalty is still a win by penalty runs', () => {
    const revised = playedMatch({
      setup,
      first: { runs: 160, wickets: 5 },
      second: { runs: 96, wickets: 10, balls: 60, revision: { balls: 72, target: 100 } },
      end: null,
    });
    expect(revised.state.innings[1]).toMatchObject({ completion: { reason: 'all_out' }, target: { runs: 100, revised: true } });
    expect(revised.state.naturalResult).toEqual(winByRuns('LIO', 'TIG', 3, 'revised_target'));
    const state = playScript(setup, [penalty('TIG', 5)], { prior: revised.events }).state;
    expect(state.innings[1]?.runs).toBe(101);
    expect(state.naturalResult).toEqual(winByRuns('TIG', 'LIO', 2, 'penalty_runs'));
    expect(state.resultText).toBe('Tigers won by penalty runs');
  });

  it('a penalty that only draws an all-out chase level is a tie', () => {
    const short = playedMatch({ setup, first: { runs: 160, wickets: 6 }, second: { runs: 155, wickets: 10 }, end: null });
    const state = playScript(setup, [penalty('TIG', 5)], { prior: short.events }).state;
    expect(state.innings[1]?.runs).toBe(160);
    expect(state.naturalResult).toEqual({ type: 'tie', decider: null });
  });

  it('a side with wickets in hand that passes the target through a penalty after its overs still wins by wickets', () => {
    const overs = playedMatch({ setup, first: { runs: 160, wickets: 6 }, second: { runs: 158, wickets: 4 }, end: null });
    expect(overs.state.innings[1]?.completion?.reason).toBe('overs_complete');
    const state = playScript(setup, [penalty('TIG', 5)], { prior: overs.events }).state;
    expect(state.naturalResult).toEqual(winByWickets('TIG', 'LIO', 6, 0));
    expect(state.resultText).toBe('Tigers won by 6 wickets');
  });
});

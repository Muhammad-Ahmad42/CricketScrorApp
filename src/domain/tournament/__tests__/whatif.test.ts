import type { HypotheticalResult, StandingRow, TournamentSnapshot, WhatIfResult } from '@/domain/types';
import { DEFAULT_POINTS_SYSTEM } from '../defaults';
import { evaluateTournament } from '../evaluate';
import { hypotheticalSummary, parRunsPerBall, simulate } from '../whatif';
import { cupSnapshot } from './standingsKit/cup';
import { deepFreeze } from './standingsKit/summaries';
import { fixture, makeSnapshot, qualificationOverride, slot, slotSide, stage, team } from './standingsKit/tournament';

const midway = () => deepFreeze(cupSnapshot({ playedA: 4 }));
const row = (tables: WhatIfResult['after']['tables'], teamId: string): StandingRow =>
  tables.flatMap((table) => table.rows).find((candidate) => candidate.teamId === teamId)!;
const hypo = (fixtureId: string, outcome: HypotheticalResult['outcome'], extra: Partial<HypotheticalResult> = {}): HypotheticalResult => ({
  fixtureId,
  outcome,
  score: null,
  ...extra,
});

describe('hypotheticalSummary', () => {
  const target = fixture('f1', 'groups', 'pA', 7, team('TIG'), team('EAG'));
  const sides = { a: 'TIG', b: 'EAG' };

  it('a win without a score moves points only', () => {
    const summary = hypotheticalSummary(target, sides, hypo('f1', 'side_a_win'), 120, 6);
    expect(summary).toMatchObject({
      teamAId: 'TIG',
      teamBId: 'EAG',
      status: 'completed',
      winnerTeamId: 'TIG',
      innings: [],
      superOvers: [],
      squads: [],
      ballsPerOver: 6,
      hypothetical: { bonus: false },
    });
    expect(summary.result).toMatchObject({ type: 'win', winnerTeamId: 'TIG', loserTeamId: 'EAG' });
  });

  it('a score builds both innings with the allotted balls and all-out flags', () => {
    const summary = hypotheticalSummary(
      target,
      sides,
      hypo('f1', 'side_b_win', {
        bonus: true,
        score: { battingFirst: 'side_a', firstInnings: { runs: 90, balls: 100, allOut: true }, secondInnings: { runs: 91, balls: 70, allOut: false } },
      }),
      120,
      6,
    );
    expect(summary.innings.map((innings) => [innings.battingTeamId, innings.runs, innings.legalBalls, innings.allottedBalls, innings.allOut, innings.completion])).toEqual([
      ['TIG', 90, 100, 120, true, 'all_out'],
      ['EAG', 91, 70, 120, false, 'target_reached'],
    ]);
    expect(summary.innings[1].target).toBe(91);
    expect(summary.hypothetical).toEqual({ bonus: true });
    expect(summary.winnerTeamId).toBe('EAG');
  });

  it('ties, no results, abandonments and walkovers', () => {
    const decided = hypotheticalSummary(target, sides, hypo('f1', 'tie', { tieWinner: 'side_b' }), 120, 6);
    expect(decided.result).toEqual({ type: 'tie', decider: { method: 'super_over', winnerTeamId: 'EAG', superOverRounds: 1 } });
    expect(decided.winnerTeamId).toBe('EAG');
    expect(hypotheticalSummary(target, sides, hypo('f1', 'tie'), 120, 6).result).toEqual({ type: 'tie', decider: null });
    expect(hypotheticalSummary(target, sides, hypo('f1', 'no_result'), 120, 6).result.type).toBe('no_result');
    const washout = hypotheticalSummary(target, sides, hypo('f1', 'abandoned'), 120, 6);
    expect(washout).toMatchObject({ status: 'abandoned', winnerTeamId: null });
    const walkover = hypotheticalSummary(
      target,
      sides,
      hypo('f1', 'side_b_walkover', { score: { battingFirst: 'side_a', firstInnings: { runs: 1, balls: 1, allOut: false }, secondInnings: { runs: 2, balls: 1, allOut: false } } }),
      120,
      6,
    );
    expect(walkover.result).toEqual({ type: 'walkover', winnerTeamId: 'EAG', loserTeamId: 'TIG', reason: null });
    expect(walkover.innings).toEqual([]);
    expect(hypotheticalSummary(target, sides, hypo('f1', 'side_a_walkover', { bonus: true }), 120, 6).hypothetical).toEqual({ bonus: false });
  });
});

describe('simulate', () => {
  it('U-WIF-01 a win without a score moves points, not NRR, and explains the consequence', () => {
    const snapshot = midway();
    const result = simulate(snapshot, [hypo('g-m6', 'side_a_win')]);
    const before = evaluateTournament(snapshot);
    expect(result.before).toEqual({
      tables: before.stages.flatMap((candidate) => candidate.tables),
      qualification: before.stages.flatMap((candidate) => candidate.qualification),
    });
    expect(row(result.after.tables, 'TIG').points).toBe(row(result.before.tables, 'TIG').points + 2);
    expect(row(result.after.tables, 'TIG').nrr).toBeCloseTo(row(result.before.tables, 'TIG').nrr!, 9);
    expect(row(result.after.tables, 'EAG').nrr).toBeCloseTo(row(result.before.tables, 'EAG').nrr!, 9);
    expect(result.hypotheticals).toHaveLength(1);
    expect(result.narrative[0]).toBe('If Tigers beat Eagles, Tigers qualify for the Knockouts.');
    expect(result.narrative).toContain('Eagles are eliminated from the Knockouts.');
    expect(result.qualificationChanges).toEqual(
      expect.arrayContaining([
        { stageId: 'ko', teamId: 'TIG', before: 'in_contention', after: 'qualified' },
        { stageId: 'ko', teamId: 'EAG', before: 'in_contention', after: 'eliminated' },
      ]),
    );
    expect(result.standingChanges.find((change) => change.teamId === 'TIG')).toMatchObject({ stageId: 'groups', poolId: 'pA' });
  });

  it('U-WIF-02 a score moves NRR too', () => {
    const result = simulate(midway(), [
      hypo('g-m6', 'side_a_win', {
        score: { battingFirst: 'side_a', firstInnings: { runs: 30, balls: 12, allOut: false }, secondInnings: { runs: 10, balls: 12, allOut: false } },
      }),
    ]);
    const before = row(result.before.tables, 'TIG');
    const after = row(result.after.tables, 'TIG');
    expect(after.runsScored).toBe(before.runsScored + 30);
    expect(after.ballsFaced).toBe(before.ballsFaced + 12);
    expect(after.nrr).not.toBeCloseTo(before.nrr!, 3);
  });

  it('U-WIF-03 a tie won by side B in the super over scores W/L under win_loss', () => {
    const result = simulate(midway(), [hypo('g-m6', 'tie', { tieWinner: 'side_b' })]);
    expect(row(result.after.tables, 'EAG')).toMatchObject({ won: 2, points: 4 });
    expect(row(result.after.tables, 'TIG')).toMatchObject({ lost: 2, points: 2 });
    expect(result.narrative[0]).toMatch(/^If Tigers and Eagles tie and Eagles win the super over, /);
  });

  it('U-WIF-04 abandoned, walkover and bonus hypotheticals score per the points system', () => {
    const points = { ...DEFAULT_POINTS_SYSTEM, abandoned: 0, walkoverWin: 3, bonus: { kind: 'run_rate_ratio' as const, ratio: 1.25, points: 1 } };
    const snapshot = deepFreeze(cupSnapshot({ playedA: 4, groupConfig: { pointsSystem: points } }));
    const base = (teamId: string, result: WhatIfResult) => row(result.after.tables, teamId).points - row(result.before.tables, teamId).points;
    const washout = simulate(snapshot, [hypo('g-m6', 'abandoned')]);
    expect(base('TIG', washout)).toBe(0);
    expect(row(washout.after.tables, 'TIG').noResult).toBe(1);
    const walkover = simulate(snapshot, [hypo('g-m6', 'side_a_walkover')]);
    expect(base('TIG', walkover)).toBe(3);
    const bonus = simulate(snapshot, [hypo('g-m6', 'side_b_win', { bonus: true })]);
    expect(base('EAG', bonus)).toBe(3);
    expect(row(bonus.after.tables, 'EAG').bonusPoints).toBe(1);
    expect(bonus.narrative[0]).toMatch(/^If Eagles beat Tigers with a bonus point, /);
    const noBonus = simulate(snapshot, [hypo('g-m6', 'side_b_win', { bonus: false })]);
    expect(base('EAG', noBonus)).toBe(2);
  });

  it('U-WIF-05 a hypothetical on a completed fixture is ignored and reported', () => {
    const snapshot = midway();
    const result = simulate(snapshot, [hypo('g-m1', 'side_b_win'), hypo('missing', 'side_a_win')]);
    expect(result.hypotheticals).toEqual([]);
    expect(result.narrative).toEqual([
      'Match 1 has already been played, so its hypothetical result was ignored.',
      'A hypothetical result for a fixture that no longer exists was ignored.',
    ]);
    expect(result.narrativeItems).toEqual([
      { headline: 'Match 1 ignored', detail: 'It has already been played.' },
      { headline: 'A result was ignored', detail: 'Its fixture no longer exists.' },
    ]);
    expect(result.after).toEqual(result.before);
    expect(result.standingChanges).toEqual([]);
  });

  describe('knockout chains', () => {
    function qfSnapshot(): TournamentSnapshot {
      return makeSnapshot({
        teams: [
          { id: 'LIO', name: 'Lions', seed: 1 },
          { id: 'TIG', name: 'Tigers', seed: 2 },
          { id: 'EAG', name: 'Eagles', seed: 3 },
          { id: 'HAW', name: 'Hawks', seed: 4 },
        ],
        stages: [
          stage('qf', 'Quarterfinal', 'knockout', 0, {
            knockout: { thirdPlacePlayoff: false, rounds: 1, tiedMatch: 'super_over', noResult: 'higher_seed' },
          }),
          stage('sf', 'Final', 'knockout', 1, { decidesChampion: true, entryRules: [{ kind: 'knockout_winners', sourceStageId: 'qf' }] }),
        ],
        slots: [
          slot('e1', 'qf', 0, 'Seed 1', { kind: 'manual', teamId: 'LIO' }, { seed: 1 }),
          slot('e2', 'qf', 1, 'Seed 2', { kind: 'manual', teamId: 'TIG' }, { seed: 2 }),
          slot('e3', 'qf', 2, 'Seed 3', { kind: 'manual', teamId: 'EAG' }, { seed: 3 }),
          slot('e4', 'qf', 3, 'Seed 4', { kind: 'manual', teamId: 'HAW' }, { seed: 4 }),
          slot('w1', 'sf', 0, 'Winner QF1', { kind: 'bracket_winner', stageId: 'qf', round: 1, position: 0 }),
          slot('w2', 'sf', 1, 'Winner QF2', { kind: 'bracket_winner', stageId: 'qf', round: 1, position: 1 }),
        ],
        fixtures: [
          fixture('qf1', 'qf', null, 1, slotSide('e1'), slotSide('e4'), { label: 'QF1', bracket: { kind: 'main', round: 1, position: 0, roundName: 'Semifinal' } }),
          fixture('qf2', 'qf', null, 2, slotSide('e2'), slotSide('e3'), { label: 'QF2', bracket: { kind: 'main', round: 1, position: 1, roundName: 'Semifinal' } }),
          fixture('fin', 'sf', null, 3, slotSide('w1'), slotSide('w2'), { label: 'Final', isFinal: true, bracket: { kind: 'main', round: 1, position: 0, roundName: 'Final' } }),
        ],
      });
    }

    it('U-WIF-06 a QF hypothetical resolves the SF it feeds, applied stage by stage', () => {
      const result = simulate(deepFreeze(qfSnapshot()), [hypo('fin', 'side_a_win'), hypo('qf1', 'side_b_win'), hypo('qf2', 'side_a_win')]);
      expect(result.hypotheticals.map((entry) => entry.fixtureId)).toEqual(['qf1', 'qf2', 'fin']);
      expect(result.slotChanges).toEqual(
        expect.arrayContaining([
          { slotId: 'w1', label: 'Winner QF1', beforeTeamId: null, afterTeamId: 'HAW', playedFixtureIds: [] },
          { slotId: 'w2', label: 'Winner QF2', beforeTeamId: null, afterTeamId: 'TIG', playedFixtureIds: [] },
        ]),
      );
      expect(result.narrative[0]).toMatch(/^If Hawks beat Lions, Tigers beat Eagles and Hawks beat Tigers, /);
    });

    it('U-WIF-07 a hypothetical whose sides are unresolved is skipped and reported', () => {
      const result = simulate(deepFreeze(qfSnapshot()), [hypo('fin', 'side_a_win')]);
      expect(result.hypotheticals).toEqual([]);
      expect(result.narrative).toEqual(['Match 3 (Final) was skipped because its teams are not known yet.']);
    });
  });

  it('U-WIF-08 never mutates a deep-frozen snapshot', () => {
    const snapshot = midway();
    const copy = JSON.parse(JSON.stringify(snapshot));
    expect(() => simulate(snapshot, [hypo('g-m5', 'side_a_win'), hypo('g-m6', 'tie')])).not.toThrow();
    expect(snapshot).toEqual(copy);
    expect(evaluateTournament(snapshot)).toEqual(evaluateTournament(copy));
  });

  it('several hypotheticals combine into one narrative with every consequence', () => {
    const result = simulate(midway(), [hypo('g-m5', 'side_a_win'), hypo('g-m6', 'side_b_win')]);
    expect(result.narrative[0]).toMatch(/^If Hawks beat Lions and Eagles beat Tigers, /);
    expect(result.narrative.length).toBeGreaterThan(1);
    expect(result.narrative.every((line) => line.endsWith('.'))).toBe(true);
  });
});

describe('what-if net run rate honesty (wave-3 review: hypothetical results carry no margin)', () => {
  it('a result without a score or margin says NRR is not simulated and flags the places NRR decides', () => {
    const result = simulate(midway(), [hypo('g-m6', 'side_a_win')]);
    expect(result.nrr).toEqual({
      simulated: false,
      unscoredFixtureIds: ['g-m6'],
      estimatedFixtureIds: [],
      parRunsPerOver: null,
      nrrUncertainTeamIds: ['LIO', 'TIG'],
      notes: ["NRR isn't simulated for Match 6: no score or margin. Places decided on NRR may change."],
      noteItems: [{ headline: 'NRR not simulated', detail: 'Match 6 has no score or margin, so NRR stays as it is. Places decided on NRR may change.' }],
    });
    expect(row(result.after.tables, 'LIO').tieBreak).toMatchObject({ separatedBy: 'nrr', aboveTeamId: 'TIG' });
  });

  it('no result, abandonment and walkovers do not need a score; a full score is simulated exactly', () => {
    const quiet = simulate(midway(), [hypo('g-m5', 'no_result'), hypo('g-m6', 'side_b_walkover')]);
    expect(quiet.nrr).toMatchObject({ simulated: true, unscoredFixtureIds: [], estimatedFixtureIds: [], notes: [] });
    const scored = simulate(midway(), [
      hypo('g-m6', 'side_a_win', { score: { battingFirst: 'side_a', firstInnings: { runs: 30, balls: 12, allOut: false }, secondInnings: { runs: 10, balls: 12, allOut: false } } }),
    ]);
    expect(scored.nrr).toMatchObject({ simulated: true, unscoredFixtureIds: [], estimatedFixtureIds: [], parRunsPerOver: null, nrrUncertainTeamIds: [], notes: [] });
  });

  it('a winning margin in runs builds a par-score innings pair, so NRR moves and the result keeps the margin', () => {
    const snapshot = midway();
    const rate = parRunsPerBall(snapshot);
    if (rate === null) {
      throw new Error('par expected');
    }
    const rules = snapshot.rules.defaultMatchRules;
    const allotted = rules.oversPerInnings * rules.ballsPerOver;
    const par = Math.round(rate * allotted);
    const perOver = Math.round(rate * rules.ballsPerOver * 100) / 100;
    const result = simulate(snapshot, [hypo('g-m6', 'side_a_win', { margin: { kind: 'runs', runs: 20 } })]);
    const before = row(result.before.tables, 'TIG');
    const after = row(result.after.tables, 'TIG');
    expect(after.runsScored - before.runsScored).toBe(Math.max(par, 20));
    expect(after.runsConceded - before.runsConceded).toBe(Math.max(par, 20) - 20);
    expect(after.ballsFaced - before.ballsFaced).toBe(allotted);
    expect(after.nrr).toBeGreaterThan(before.nrr ?? 0);
    expect(row(result.after.tables, 'EAG').nrr).toBeLessThan(row(result.before.tables, 'EAG').nrr ?? 0);
    expect(result.nrr).toMatchObject({ simulated: true, unscoredFixtureIds: [], estimatedFixtureIds: ['g-m6'], parRunsPerOver: perOver });
    expect(result.nrr?.notes).toEqual([`NRR for Match 6 is estimated from the margin, with a par of ${perOver.toFixed(2)} runs an over.`]);
    expect(result.nrr?.noteItems).toEqual([{ headline: 'NRR estimated from margins', detail: `Match 6: par score of ${perOver.toFixed(2)} runs an over.` }]);
    const summary = hypotheticalSummary(
      fixture('f1', 'groups', 'pA', 7, team('TIG'), team('EAG')),
      { a: 'TIG', b: 'EAG' },
      hypo('f1', 'side_a_win', { margin: { kind: 'runs', runs: 20 } }),
      12,
      6,
      par,
    );
    expect(summary.result).toEqual({ type: 'win', winnerTeamId: 'TIG', loserTeamId: 'EAG', margin: { kind: 'runs', runs: 20 }, method: 'normal' });
    expect(summary.innings.map((innings) => [innings.battingTeamId, innings.runs, innings.legalBalls])).toEqual([
      ['TIG', Math.max(par, 20), 12],
      ['EAG', Math.max(par, 20) - 20, 12],
    ]);
  });

  it('a winning margin in wickets means the winner batted second and chased with balls to spare', () => {
    const target = fixture('f1', 'groups', 'pA', 7, team('TIG'), team('EAG'));
    const summary = hypotheticalSummary(target, { a: 'TIG', b: 'EAG' }, hypo('f1', 'side_b_win', { margin: { kind: 'wickets', wickets: 6, ballsRemaining: 3 } }), 12, 6, 20);
    expect(summary.result).toEqual({ type: 'win', winnerTeamId: 'EAG', loserTeamId: 'TIG', margin: { kind: 'wickets', wickets: 6, ballsRemaining: 3 }, method: 'normal' });
    expect(summary.innings.map((innings) => [innings.battingTeamId, innings.runs, innings.legalBalls, innings.completion])).toEqual([
      ['TIG', 20, 12, 'overs_complete'],
      ['EAG', 21, 9, 'target_reached'],
    ]);
    const impossible = hypotheticalSummary(target, { a: 'TIG', b: 'EAG' }, hypo('f1', 'side_b_win', { margin: { kind: 'wickets', wickets: 6, ballsRemaining: 12 } }), 12, 6, 20);
    expect(impossible.innings).toEqual([]);
    const zero = simulate(midway(), [hypo('g-m6', 'side_b_win', { margin: { kind: 'runs', runs: 0 } })]);
    expect(zero.nrr).toMatchObject({ simulated: false, unscoredFixtureIds: ['g-m6'] });
  });

  it('an explicit score wins over a margin', () => {
    const score = { battingFirst: 'side_a' as const, firstInnings: { runs: 30, balls: 12, allOut: false }, secondInnings: { runs: 10, balls: 12, allOut: false } };
    const result = simulate(midway(), [hypo('g-m6', 'side_a_win', { score, margin: { kind: 'runs', runs: 1 } })]);
    expect(row(result.after.tables, 'TIG').runsScored - row(result.before.tables, 'TIG').runsScored).toBe(30);
    expect(result.nrr?.estimatedFixtureIds).toEqual([]);
  });
});

describe('what-if narrative puts qualification first and never contradicts it (wave-3 review)', () => {
  it('an eliminated team that still sits in a qualifying place is worded as such, not as a plain move', () => {
    const override = qualificationOverride('ko', 'LIO', 'eliminate', {}, { reason: 'Withdrew' });
    const snapshot = deepFreeze(cupSnapshot({ playedA: 4, overrides: [override] }));
    const result = simulate(snapshot, [
      hypo('g-m6', 'side_a_win', { score: { battingFirst: 'side_a', firstInnings: { runs: 100, balls: 12, allOut: false }, secondInnings: { runs: 1, balls: 12, allOut: false } } }),
    ]);
    expect(result.narrative).toEqual([
      'If Tigers beat Eagles, Tigers qualify for the Knockouts as Pool A winners.',
      "Lions would sit 2nd in Pool A for now, but are out of the Knockouts by the organizer's decision.",
      'Tigers move from 2nd to 1st in Pool A.',
    ]);
    expect(result.narrativeItems).toEqual([
      { headline: 'Tigers qualify', detail: 'For the Knockouts as Pool A winners.' },
      { headline: 'Lions out despite 2nd place', detail: "Lions would sit 2nd in Pool A for now, but are out of the Knockouts by the organizer's decision." },
      { headline: 'Tigers: 2nd → 1st', detail: 'In Pool A.' },
    ]);
  });

  it('an eliminated team below the qualifying places keeps the plain move sentence after the qualification lines', () => {
    const result = simulate(midway(), [hypo('g-m6', 'side_b_win')]);
    expect(result.narrative).toEqual([
      'If Eagles beat Tigers, Tigers are eliminated from the Knockouts.',
      'Eagles qualify for the Knockouts.',
      'Tigers move from 2nd to 3rd in Pool A.',
      'Eagles move from 3rd to 2nd in Pool A.',
    ]);
    expect(result.narrativeItems?.map((item) => item.headline)).toEqual(['Tigers eliminated', 'Eagles qualify', 'Tigers: 2nd → 3rd', 'Eagles: 3rd → 2nd']);
    expect(result.narrativeItems?.every((item) => item.headline.length <= 40)).toBe(true);
  });
});

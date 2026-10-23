import { endMatch, m3Setup, playScript } from '@/domain/scoring/testing';
import { buildMatchSummary } from '@/domain/scoring/summary';
import type { MatchSummary, TournamentSnapshot } from '@/domain/types';
import { evaluateTournament } from '../evaluate';
import { computeTournamentStats, recordHolderText, recordHoldersText, recordValueText } from '../stats';
import { cupSnapshot } from './standingsKit/cup';
import { deepFreeze, inningsOf, played, simpleWin, summaryOf } from './standingsKit/summaries';
import { entry, fixture, makeSnapshot, pool, stage, team, withResult } from './standingsKit/tournament';

const G1_SCRIPT = [
  'start:L1:L2:T7',
  '1 4 wd 0 2 6 1',
  '@T8 0 W>L3 1 nb1 0 lb1 2',
  '@T7 1 1 1 1 1 1',
  'start:T1:T2:L10',
  '4 4 1 1 2 6',
  '@L11 1 0 W:c:L7>T3 2 1 4',
  '@L10 1 1',
];

function g1Summary(): MatchSummary {
  const setup = m3Setup();
  const result = playScript(setup, [...G1_SCRIPT, endMatch()]);
  const summary = buildMatchSummary(setup, result.state, { completedAt: '2026-05-01T12:00:00.000Z' });
  if (!summary) throw new Error('G1 did not complete');
  return summary;
}

function league(summaries: readonly MatchSummary[], numbers?: readonly number[]): TournamentSnapshot {
  const teams = [...new Set(summaries.flatMap((summary) => [summary.teamAId, summary.teamBId]))];
  return makeSnapshot({
    teams: teams.map((id) => ({ id, name: { LIO: 'Lions', TIG: 'Tigers' }[id] ?? id })),
    stages: [stage('league', 'League', 'league', 0, { decidesChampion: true })],
    pools: [pool('pL', 'league', 'League', 0)],
    poolEntries: teams.map((id) => entry('league', 'pL', team(id))),
    fixtures: summaries.map((summary, index) =>
      withResult(fixture(`f-${summary.matchId}`, 'league', 'pL', numbers?.[index] ?? index + 1, team(summary.teamAId), team(summary.teamBId)), summary),
    ),
    summaries,
  });
}

const statsOf = (snapshot: TournamentSnapshot) => {
  const frozen = deepFreeze(snapshot);
  return computeTournamentStats(frozen, evaluateTournament(frozen));
};

describe('computeTournamentStats', () => {
  it('U-TST-01 an empty tournament has zeros and nulls only', () => {
    const snapshot = makeSnapshot({ teams: ['LIO', 'TIG'], stages: [stage('league', 'League', 'league', 0)], fixtures: [fixture('f1', 'league', null, 1, team('LIO'), team('TIG'))] });
    expect(statsOf(snapshot)).toEqual({
      totalMatches: 1,
      completedMatches: 0,
      totalRuns: 0,
      totalWickets: 0,
      totalFours: 0,
      totalSixes: 0,
      highestTeamScore: null,
      highestIndividualScore: null,
      bestBowling: null,
      mostSixes: null,
      mostFours: null,
      highestPartnership: null,
      teams: [
        { teamId: 'LIO', matches: 0, wins: 0, losses: 0, points: 0, nrr: null, runsScored: 0, runsConceded: 0 },
        { teamId: 'TIG', matches: 0, wins: 0, losses: 0, points: 0, nrr: null, runsScored: 0, runsConceded: 0 },
      ],
      players: [],
    });
  });

  describe('G1 as a tournament match', () => {
    const stats = statsOf(league([g1Summary()]));
    const player = (id: string) => stats.players.find((candidate) => candidate.playerId === id)!;

    it('U-TST-02 totals and records', () => {
      expect(stats).toMatchObject({ totalMatches: 1, completedMatches: 1, totalRuns: 55, totalWickets: 2, totalFours: 4, totalSixes: 2 });
      expect(stats.highestTeamScore).toEqual({ matchId: 'M1', teamId: 'TIG', playerId: null, value: 28, detail: 'Tigers 28/1 (2.2 ov) v Lions', valueText: '28/1' });
      expect(stats.highestIndividualScore).toEqual({ matchId: 'M1', teamId: 'TIG', playerId: 'T1', value: 17, detail: '17 (7 balls) v Lions', playerIds: ['T1'], valueText: '17' });
      expect(stats.bestBowling).toEqual({ matchId: 'M1', teamId: 'TIG', playerId: 'T8', value: 1, detail: '1/5 v Lions', playerIds: ['T8'], valueText: '1 wicket' });
      expect(stats.highestPartnership).toEqual({
        matchId: 'M1',
        teamId: 'TIG',
        playerId: 'T1',
        value: 19,
        detail: '19 runs (9 balls) v Lions',
        playerIds: ['T1', 'T2'],
        valueText: '19 runs',
      });
      expect(stats.mostSixes).toMatchObject({ value: 1, playerId: 'L2', detail: '1 six in 1 match', playerIds: ['L2'], valueText: '1 six' });
      expect(stats.mostFours).toMatchObject({ value: 2, playerId: 'T1', detail: '2 fours in 1 match', playerIds: ['T1'], valueText: '2 fours' });
    });

    it('wave-3 bug #8: record holders name both batters of a partnership and pluralise correctly', () => {
      const names = { player: (id: string) => ({ T1: 'Rizwan', T2: 'Shan', T8: 'Shaheen' })[id] ?? id, team: (id: string) => (id === 'TIG' ? 'TIG' : id) };
      const partnership = stats.highestPartnership;
      const bowling = stats.bestBowling;
      if (partnership === null || bowling === null) {
        throw new Error('records expected');
      }
      expect(recordHolderText(partnership, names)).toBe('Rizwan & Shan (TIG)');
      expect(recordHolderText(bowling, names)).toBe('Shaheen (TIG)');
      expect(recordValueText(bowling)).toBe('1 wicket');
      expect(recordHolderText({ ...partnership, playerIds: undefined }, names)).toBe('Rizwan (TIG)');
      expect(recordHolderText({ ...partnership, playerId: null, playerIds: undefined }, names)).toBe('TIG');
      expect(recordValueText({ ...bowling, valueText: undefined })).toBe('1');
    });

    it('U-TST-03 matches come from the squads', () => {
      expect(player('L9')).toMatchObject({ matches: 1, innings: 0, runs: 0, ballsBowled: 0, battingAverage: null, strikeRate: null, economy: null, highestScore: null, bestBowling: null });
      expect(stats.players.some((candidate) => candidate.playerId === 'L12')).toBe(false);
      expect(stats.players.filter((candidate) => candidate.teamId === 'LIO')).toHaveLength(11);
    });

    it('U-TST-04 averages, strike rates and economy', () => {
      expect(player('L2')).toMatchObject({ runs: 13, innings: 1, notOuts: 0, battingAverage: 13, fours: 1, sixes: 1, highestScore: { runs: 13, notOut: false, matchId: 'M1' } });
      expect(player('L2').strikeRate).toBeCloseTo(185.714286, 5);
      expect(player('L1')).toMatchObject({ runs: 7, notOuts: 1, battingAverage: null, highestScore: { runs: 7, notOut: true, matchId: 'M1' } });
      expect(player('T8')).toMatchObject({ ballsBowled: 6, runsConceded: 5, wickets: 1, economy: 5, bestBowling: { wickets: 1, runs: 5, matchId: 'M1' } });
      expect(player('L11')).toMatchObject({ wickets: 1, runsConceded: 8, bestBowling: { wickets: 1, runs: 8, matchId: 'M1' } });
    });

    it('team statistics come from the tables', () => {
      expect(stats.teams).toEqual([
        { teamId: 'LIO', matches: 1, wins: 0, losses: 1, points: 0, nrr: expect.any(Number), runsScored: 27, runsConceded: 28 },
        { teamId: 'TIG', matches: 1, wins: 1, losses: 0, points: 2, nrr: expect.any(Number), runsScored: 28, runsConceded: 27 },
      ]);
    });
  });

  it('U-TST-05 record ties go to the earliest match number', () => {
    const first = simpleWin('late', 'LIO', 'TIG');
    const second = simpleWin('early', 'TIG', 'LIO');
    const stats = statsOf(league([first, second], [9, 2]));
    expect(stats.highestTeamScore).toMatchObject({ matchId: 'early', teamId: 'TIG', value: 150 });
    expect(stats.highestTeamScore?.detail).toMatch(/\(\d+ ov\)/);
    expect(stats.highestTeamScore?.detail).not.toMatch(/\.0 ov/);
    expect(stats.highestTeamScore?.detail).toBe('Tigers 150/5 (20 ov) v Lions');
    expect(stats.highestTeamScore?.tiedWith).toEqual([expect.objectContaining({ matchId: 'late', teamId: 'LIO', value: 150 })]);
  });

  it('wave-3 review: every tied record holder is returned in the order they reached it', () => {
    const line = (playerId: string, fours: number, sixes: number) => ({ playerId, runs: fours * 4 + sixes * 6, balls: 10, fours, sixes, out: true, dismissalType: 'bowled' as const });
    const first = played(
      'm1',
      { team: 'LIO', runs: 150, balls: 120, wickets: 5, fours: 2, sixes: 1, batting: [line('L1', 1, 0), line('L2', 1, 1)] },
      { team: 'TIG', runs: 140, balls: 120, wickets: 8, fours: 1, sixes: 0, batting: [line('T1', 1, 0)] },
    );
    const second = played('m2', { team: 'TIG', runs: 150, balls: 120, wickets: 5, fours: 1, batting: [line('T2', 1, 0)] }, { team: 'LIO', runs: 140, balls: 120, wickets: 8 });
    const squads = (summary: MatchSummary, lions: readonly string[], tigers: readonly string[]): MatchSummary => ({
      ...summary,
      squads: [
        { teamId: 'LIO', playerIds: lions },
        { teamId: 'TIG', playerIds: tigers },
      ],
    });
    const stats = statsOf(league([squads(first, ['L1', 'L2'], ['T1']), squads(second, ['L1', 'L2'], ['T2'])]));
    expect(stats.mostFours).toMatchObject({ playerId: 'L1', value: 1, valueText: '1 four' });
    expect(stats.mostFours?.tiedWith?.map((holder) => holder.playerId)).toEqual(['L2', 'T1', 'T2']);
    expect(stats.mostSixes).toMatchObject({ playerId: 'L2', value: 1 });
    expect(stats.mostSixes?.tiedWith).toBeUndefined();
    const names = { player: (id: string) => ({ L1: 'Babar', L2: 'Fakhar', T1: 'Rizwan', T2: 'Shan' })[id] ?? id, team: (id: string) => id };
    const mostFours = stats.mostFours;
    const mostSixes = stats.mostSixes;
    if (mostFours === null || mostSixes === null) {
      throw new Error('records expected');
    }
    expect(recordHoldersText(mostFours, names)).toBe('Babar (LIO) +3 others');
    expect(recordHoldersText({ ...mostFours, tiedWith: mostFours.tiedWith?.slice(0, 1) }, names)).toBe('Babar (LIO) +1 other');
    expect(recordHoldersText(mostSixes, names)).toBe('Fakhar (LIO)');
  });

  it('U-TST-06 super-over runs are excluded everywhere', () => {
    const superOver = inningsOf({ team: 'TIG', runs: 25, balls: 6, sixes: 4, batting: [{ playerId: 'T9', runs: 25, balls: 6, fours: 0, sixes: 4, out: false, dismissalType: null }] }, 'LIO', 2);
    const tied = played(
      'tie',
      { team: 'LIO', runs: 150, balls: 120, wickets: 7 },
      { team: 'TIG', runs: 150, balls: 120, wickets: 9 },
      { decider: { method: 'super_over', winnerTeamId: 'TIG', superOverRounds: 1 }, superOvers: [superOver] },
    );
    const stats = statsOf(league([tied]));
    expect(stats).toMatchObject({ totalRuns: 300, totalSixes: 0, mostSixes: null });
    expect(stats.players.some((candidate) => candidate.playerId === 'T9')).toBe(false);
    expect(stats.highestIndividualScore).toBeNull();
  });

  it('sums matches across stages including knockout fixtures and takes points from the last table', () => {
    const snapshot = cupSnapshot({
      ko: { sf1: simpleWin('sf1m', 'LIO', 'COB'), sf2: simpleWin('sf2m', 'BUL', 'TIG'), final: simpleWin('fm', 'BUL', 'LIO') },
    });
    const stats = statsOf(snapshot);
    const lions = stats.teams.find((candidate) => candidate.teamId === 'LIO')!;
    expect(lions).toMatchObject({ matches: 5, wins: 4, losses: 1, points: 6 });
    expect(lions.nrr).toBeCloseTo(3.254902, 5);
    expect(lions.runsScored).toBe(77 + 150 + 140);
    expect(stats.completedMatches).toBe(15);
    expect(stats.totalMatches).toBe(15);
  });

  it('ignores cancelled fixtures and summaries of what-if matches', () => {
    const hypothetical: MatchSummary = { ...summaryOf({ matchId: 'whatif:x', teamAId: 'LIO', teamBId: 'TIG', result: { type: 'no_result', reason: null } }), hypothetical: { bonus: false } };
    const base = league([simpleWin('m1', 'LIO', 'TIG')]);
    const snapshot: TournamentSnapshot = {
      ...base,
      fixtures: [
        ...base.fixtures,
        { ...fixture('x', 'league', 'pL', 2, team('LIO'), team('TIG')), matchId: 'whatif:x', status: 'completed', matchSides: { teamAId: 'LIO', teamBId: 'TIG' } },
        { ...fixture('c', 'league', 'pL', 3, team('LIO'), team('TIG')), status: 'cancelled' },
      ],
      summaries: { ...base.summaries, 'whatif:x': hypothetical },
    };
    const stats = computeTournamentStats(snapshot, evaluateTournament(snapshot));
    expect(stats.completedMatches).toBe(1);
    expect(stats.totalMatches).toBe(2);
  });
});

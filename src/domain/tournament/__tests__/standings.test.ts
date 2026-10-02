import type { MatchSummary, StandingRow, StandingsTable } from '@/domain/types';
import { computeStandings, effectiveStageRules } from '../standings';
import { DEFAULT_POINTS_SYSTEM } from '../defaults';
import { POOL_A, POOL_B, TEAM_NAMES } from './standingsKit/pools';
import {
  abandoned,
  deepFreeze,
  noResult,
  outcomeSummary,
  played,
  simpleWin,
  tieSummary,
  walkover,
} from './standingsKit/summaries';
import { adjustment, expunge, fixture, makeSnapshot, slotSide, stage, tableInput, team, teamMember } from './standingsKit/tournament';

const rowOf = (table: StandingsTable, teamId: string): StandingRow => table.rows.find((row) => row.teamId === teamId)!;
const orderOf = (table: StandingsTable) => table.rows.map((row) => row.teamId);

function pair(summary: MatchSummary, points = DEFAULT_POINTS_SYSTEM) {
  return computeStandings(tableInput({ members: [summary.teamAId, summary.teamBId], results: [summary], rules: { points } }));
}

describe('points per result type', () => {
  it('U-PTS-01 a win', () => {
    const table = pair(simpleWin('m', 'A', 'B'));
    expect(rowOf(table, 'A')).toMatchObject({ points: 2, won: 1, played: 1, form: ['W'] });
    expect(rowOf(table, 'B')).toMatchObject({ points: 0, lost: 1, played: 1, form: ['L'] });
  });

  it('U-PTS-02 a tie that stands', () => {
    const table = pair(tieSummary('m', 'A', 'B'));
    expect(rowOf(table, 'A')).toMatchObject({ points: 1, tied: 1, form: ['T'] });
    expect(rowOf(table, 'B')).toMatchObject({ points: 1, tied: 1 });
  });

  it('U-PTS-03 a tie decided by super over scores win and loss under win_loss', () => {
    const table = pair(tieSummary('m', 'A', 'B', 'B'));
    expect(rowOf(table, 'A')).toMatchObject({ points: 0, lost: 1, tied: 0, form: ['L'] });
    expect(rowOf(table, 'B')).toMatchObject({ points: 2, won: 1, form: ['W'] });
  });

  it('U-PTS-04 a decided tie scores as a tie under tie mode', () => {
    const table = pair(tieSummary('m', 'A', 'B', 'B'), { ...DEFAULT_POINTS_SYSTEM, superOverDecidedTie: 'tie' });
    expect(rowOf(table, 'A')).toMatchObject({ points: 1, tied: 1 });
    expect(rowOf(table, 'B')).toMatchObject({ points: 1, tied: 1 });
  });

  it('U-PTS-05 no result', () => {
    const table = pair(noResult('m', 'A', 'B'));
    expect(rowOf(table, 'A')).toMatchObject({ points: 1, noResult: 1, played: 1, form: ['N'] });
    expect(rowOf(table, 'B')).toMatchObject({ points: 1, noResult: 1 });
  });

  it('U-PTS-06 abandoned uses the abandoned points or falls back to no result', () => {
    expect(rowOf(pair(abandoned('m', 'A', 'B')), 'A')).toMatchObject({ points: 1, noResult: 1 });
    expect(rowOf(pair(abandoned('m', 'A', 'B'), { ...DEFAULT_POINTS_SYSTEM, abandoned: 0 }), 'A')).toMatchObject({ points: 0, noResult: 1 });
  });

  it('U-PTS-07 walkover points default to win/loss or use the walkover values', () => {
    const summary = walkover('m', 'A', 'B');
    expect(rowOf(pair(summary), 'A')).toMatchObject({ points: 2, won: 1 });
    expect(rowOf(pair(summary), 'B')).toMatchObject({ points: 0, lost: 1 });
    const custom = { ...DEFAULT_POINTS_SYSTEM, walkoverWin: 2, walkoverLoss: -1 };
    expect(rowOf(pair(summary, custom), 'B')).toMatchObject({ points: -1, lost: 1 });
  });

  it('U-PTS-08 awarded to a side scores win and loss', () => {
    const summary = outcomeSummary('m', 'A', 'B', { type: 'awarded', winnerTeamId: 'B', loserTeamId: 'A', reason: 'Conceded', margin: null });
    const table = pair(summary);
    expect(rowOf(table, 'A')).toMatchObject({ points: 0, lost: 1 });
    expect(rowOf(table, 'B')).toMatchObject({ points: 2, won: 1 });
  });

  it('U-PTS-09 awarded without a winner scores as no result', () => {
    const summary = outcomeSummary('m', 'A', 'B', { type: 'awarded', winnerTeamId: null, loserTeamId: null, reason: 'Misconduct', margin: null });
    expect(rowOf(pair(summary), 'A')).toMatchObject({ points: 1, noResult: 1 });
  });

  it('U-PTS-10 a cancelled fixture counts nowhere', () => {
    const cancelled = fixture('c1', 'groups', 'pA', 9, team('A'), team('B'), { status: 'cancelled' });
    const pending = fixture('p1', 'groups', 'pA', 10, team('A'), team('B'));
    const table = computeStandings(tableInput({ members: ['A', 'B'], extraFixtures: [cancelled, pending] }));
    expect(rowOf(table, 'A')).toMatchObject({ played: 0, points: 0, matchesRemaining: 1 });
    expect(table.complete).toBe(false);
  });

  it('U-PTS-11 a win is worth the configured points', () => {
    expect(rowOf(pair(simpleWin('m', 'A', 'B'), { ...DEFAULT_POINTS_SYSTEM, win: 3 }), 'A').points).toBe(3);
  });

  it('U-PTS-12 bonus point when the run-rate ratio is met', () => {
    const points = { ...DEFAULT_POINTS_SYSTEM, bonus: { kind: 'run_rate_ratio' as const, ratio: 1.25, points: 1 } };
    const summary = played('m', { team: 'A', runs: 180, balls: 120 }, { team: 'B', runs: 140, balls: 120 });
    expect(rowOf(pair(summary, points), 'A')).toMatchObject({ points: 3, bonusPoints: 1 });
  });

  it('U-PTS-13 no bonus point below the ratio', () => {
    const points = { ...DEFAULT_POINTS_SYSTEM, bonus: { kind: 'run_rate_ratio' as const, ratio: 1.25, points: 1 } };
    const summary = played('m', { team: 'A', runs: 160, balls: 120 }, { team: 'B', runs: 140, balls: 120 });
    expect(rowOf(pair(summary, points), 'A')).toMatchObject({ points: 2, bonusPoints: 0 });
  });

  it('U-PTS-14 points adjustments apply while active', () => {
    const summary = simpleWin('m', 'A', 'B');
    const penalty = adjustment('A', -2, { poolId: 'pA' });
    const active = computeStandings(tableInput({ members: ['A', 'B'], results: [summary], overrides: [penalty] }));
    expect(rowOf(active, 'A')).toMatchObject({ points: 0, pointsAdjustment: -2 });
    const revoked = computeStandings(
      tableInput({ members: ['A', 'B'], results: [summary], overrides: [{ ...penalty, revokedAt: '2026-05-02T10:00:00.000Z' }] }),
    );
    expect(rowOf(revoked, 'A')).toMatchObject({ points: 2, pointsAdjustment: 0 });
  });

  it('U-PTS-15 expunged results disappear from every row', () => {
    const results = [simpleWin('m1', 'X', 'A'), simpleWin('m2', 'B', 'X'), simpleWin('m3', 'A', 'B')];
    const expungeX = expunge('X');
    const table = computeStandings(tableInput({ members: ['A', 'B', 'X'], results, overrides: [expungeX] }));
    expect(rowOf(table, 'X')).toMatchObject({ played: 0, points: 0 });
    expect(rowOf(table, 'A')).toMatchObject({ played: 1, points: 2 });
    expect(rowOf(table, 'B')).toMatchObject({ played: 1, points: 0 });
  });

  it('STANDINGS 9.3 custom points with walkover, abandoned, bonus and adjustment', () => {
    const points = {
      ...DEFAULT_POINTS_SYSTEM,
      win: 3,
      walkoverWin: 3,
      walkoverLoss: 0,
      abandoned: 1,
      bonus: { kind: 'run_rate_ratio' as const, ratio: 1.25, points: 1 },
    };
    const results = [
      played('b1', { team: 'LIO', runs: 180, balls: 120, wickets: 4 }, { team: 'KIN', runs: 120, balls: 100, allOut: true }),
      walkover('b2', 'LIO', 'TIT'),
      abandoned('b3', 'LIO', 'ROY'),
    ];
    const slow = adjustment('LIO', -1);
    const table = computeStandings(tableInput({ members: ['LIO', 'KIN', 'TIT', 'ROY'], results, rules: { points }, overrides: [slow] }));
    expect(rowOf(table, 'LIO')).toMatchObject({ points: 7, played: 3, won: 2, noResult: 1, bonusPoints: 1, pointsAdjustment: -1 });
  });
});

describe('POOL-A and POOL-B', () => {
  const poolA = deepFreeze(tableInput({ members: ['LIO', 'TIG', 'EAG', 'HAW'], results: POOL_A, names: TEAM_NAMES }));

  it('U-STD-01 builds the full table', () => {
    const table = computeStandings(poolA);
    expect(orderOf(table)).toEqual(['LIO', 'TIG', 'EAG', 'HAW']);
    const expected = [
      ['LIO', 1, 3, 3, 0, 6, 77, 34, 62, 36, 3.254902, ['W', 'W', 'W']],
      ['TIG', 2, 3, 2, 1, 4, 69, 36, 61, 36, 1.333333, ['L', 'W', 'W']],
      ['EAG', 3, 3, 1, 2, 2, 59, 36, 67, 36, -1.333333, ['W', 'L', 'L']],
      ['HAW', 4, 3, 0, 3, 0, 48, 36, 63, 34, -3.117647, ['L', 'L', 'L']],
    ] as const;
    for (const [id, position, playedCount, won, lost, points, rf, bf, ra, bb, nrr, form] of expected) {
      const row = rowOf(table, id);
      expect(row).toMatchObject({
        position,
        played: playedCount,
        won,
        lost,
        tied: 0,
        noResult: 0,
        points,
        runsScored: rf,
        ballsFaced: bf,
        runsConceded: ra,
        ballsBowled: bb,
        form,
        sharedPosition: false,
        qualification: null,
      });
      expect(row.nrr).toBeCloseTo(nrr, 6);
    }
  });

  it('U-STD-02 run rate, overs, remaining matches and completeness', () => {
    const table = computeStandings(poolA);
    const lions = rowOf(table, 'LIO');
    expect(lions.runRate).toBeCloseTo(13.588235, 6);
    expect(lions.oversFaced).toBeCloseTo(5.666667, 6);
    expect(lions.matchesRemaining).toBe(0);
    expect(table.complete).toBe(true);
    expect(table.rows.map((row) => row.tieBreak?.separatedBy ?? null)).toEqual([null, null, null, null]);
    expect(rowOf(table, 'LIO').tieBreak?.detail).toBe('6 pts, 2 ahead of Tigers');
    expect(rowOf(table, 'HAW').tieBreak).toBeNull();
    expect(table.unresolvedTies).toEqual([]);
    expect(table.provisionalTies).toEqual([]);
  });

  it('U-STD-03 actual_overs mode', () => {
    const table = computeStandings({ ...poolA, rules: { ...poolA.rules, nrr: { ...poolA.rules.nrr, mode: 'actual_overs' } } });
    expect(rowOf(table, 'TIG').nrr).toBeCloseTo(0.409091, 6);
    expect(rowOf(table, 'HAW').nrr).toBeCloseTo(-2.390374, 6);
    expect(rowOf(table, 'HAW').ballsFaced).toBe(33);
    expect(orderOf(table)).toEqual(['LIO', 'TIG', 'EAG', 'HAW']);
  });

  it('U-STD-04 three-way tie on points decided by NRR with explanations', () => {
    const table = computeStandings(tableInput({ members: ['BUL', 'COB', 'BEA', 'WOL'], results: POOL_B, names: TEAM_NAMES }));
    expect(orderOf(table)).toEqual(['BUL', 'COB', 'BEA', 'WOL']);
    expect(rowOf(table, 'BUL').nrr).toBeCloseTo(2.121429, 6);
    expect(rowOf(table, 'COB').nrr).toBeCloseTo(1.309524, 6);
    expect(rowOf(table, 'BEA').nrr).toBeCloseTo(0.5, 6);
    expect(rowOf(table, 'WOL').nrr).toBeCloseTo(-3.791667, 6);
    expect(rowOf(table, 'BUL').tieBreak).toEqual({
      separatedBy: 'nrr',
      aboveTeamId: 'COB',
      detail: 'Ahead of Cobras on net run rate (+2.121 vs +1.310)',
    });
    expect(rowOf(table, 'COB').tieBreak?.separatedBy).toBe('nrr');
    expect(rowOf(table, 'BEA').tieBreak).toEqual({ separatedBy: null, aboveTeamId: 'WOL', detail: '4 pts, 4 ahead of Wolves' });
    expect(rowOf(table, 'WOL').tieBreak).toBeNull();
  });

  it('U-STD-05 a head-to-head cycle falls through to NRR', () => {
    const table = computeStandings(
      tableInput({ members: ['BUL', 'COB', 'BEA', 'WOL'], results: POOL_B, names: TEAM_NAMES, rules: { tieBreakers: ['points', 'head_to_head', 'nrr'] } }),
    );
    expect(orderOf(table)).toEqual(['BUL', 'COB', 'BEA', 'WOL']);
    expect(rowOf(table, 'BUL').tieBreak?.separatedBy).toBe('nrr');
  });
});

describe('STANDINGS 9.1 the §92 Pool A', () => {
  const results = [
    played('g1', { team: 'LIO', runs: 160, balls: 120, wickets: 6 }, { team: 'TIG', runs: 150, balls: 120, wickets: 8 }),
    played('g2', { team: 'TIG', runs: 171, balls: 120, wickets: 5 }, { team: 'EAG', runs: 140, balls: 111, allOut: true }),
    played('g3', { team: 'LIO', runs: 148, balls: 120, wickets: 9 }, { team: 'EAG', runs: 149, balls: 110, wickets: 4 }),
    played('g4', { team: 'HAW', runs: 120, balls: 120, wickets: 9 }, { team: 'TIG', runs: 121, balls: 84, wickets: 2 }),
    played('g5', { team: 'LIO', runs: 182, balls: 120, wickets: 4 }, { team: 'HAW', runs: 130, balls: 106, allOut: true }),
    played('g6', { team: 'HAW', runs: 135, balls: 120, wickets: 8 }, { team: 'EAG', runs: 136, balls: 119, wickets: 7 }),
  ];

  it.each([
    [['points', 'nrr', 'head_to_head'] as const],
    [['points', 'head_to_head', 'nrr'] as const],
  ])('ranks Tigers, Lions, Eagles, Hawks with chain %p', (chain) => {
    const table = computeStandings(
      tableInput({ members: ['LIO', 'TIG', 'EAG', 'HAW'], results, names: TEAM_NAMES, rules: { tieBreakers: chain } }),
    );
    expect(orderOf(table)).toEqual(['TIG', 'LIO', 'EAG', 'HAW']);
    expect(rowOf(table, 'TIG').nrr).toBeCloseTo(1.185185, 5);
    expect(rowOf(table, 'LIO').nrr).toBeCloseTo(0.812381, 5);
    expect(rowOf(table, 'EAG').nrr).toBeCloseTo(-0.26009, 4);
    expect(rowOf(table, 'HAW').nrr).toBeCloseTo(-1.738132, 5);
    expect(rowOf(table, 'TIG').tieBreak?.detail).toBe('Ahead of Lions on net run rate (+1.185 vs +0.812)');
    expect(rowOf(table, 'LIO').tieBreak?.detail).toBe('Ahead of Eagles on net run rate (+0.812 vs -0.260)');
    expect(rowOf(table, 'EAG').tieBreak?.detail).toBe('4 pts, 4 ahead of Hawks');
    const totals = table.rows.reduce(
      (sum, row) => ({ rf: sum.rf + row.runsScored, ra: sum.ra + row.runsConceded, bf: sum.bf + row.ballsFaced, bb: sum.bb + row.ballsBowled }),
      { rf: 0, ra: 0, bf: 0, bb: 0 },
    );
    expect(totals).toEqual({ rf: 1742, ra: 1742, bf: 1393, bb: 1393 });
  });
});

describe('head-to-head inside computeStandings', () => {
  const results = [
    simpleWin('h1', 'KIN', 'ROY'),
    simpleWin('h2', 'KIN', 'TIT'),
    simpleWin('h3', 'ROY', 'TIT'),
    played('h4', { team: 'TIT', runs: 200, balls: 120 }, { team: 'MIN', runs: 100, balls: 120, allOut: true }),
    played('h5', { team: 'ROY', runs: 170, balls: 120 }, { team: 'MIN', runs: 120, balls: 120 }),
    played('h6', { team: 'KIN', runs: 141, balls: 120 }, { team: 'MIN', runs: 140, balls: 120 }),
  ];
  const levelling = [
    adjustment('ROY', 2, { poolId: 'pA', id: 'adj-roy' }),
    adjustment('TIT', 4, { poolId: 'pA', id: 'adj-tit' }),
  ];
  const names = { KIN: 'Kings', ROY: 'Royals', TIT: 'Titans', MIN: 'Minnows' };

  it('STANDINGS 9.2 head-to-head decides the three-way tie', () => {
    const table = computeStandings(
      tableInput({ members: ['KIN', 'ROY', 'TIT', 'MIN'], results, overrides: levelling, names, rules: { tieBreakers: ['points', 'head_to_head', 'nrr'] } }),
    );
    expect(orderOf(table)).toEqual(['KIN', 'ROY', 'TIT', 'MIN']);
    expect(rowOf(table, 'KIN').tieBreak?.detail).toBe('Ahead of Royals on head-to-head (4 pts vs 2 pts among Kings, Royals, Titans)');
  });

  it('STANDINGS 9.2 with NRR first the order follows NRR', () => {
    const table = computeStandings(
      tableInput({ members: ['KIN', 'ROY', 'TIT', 'MIN'], results, overrides: levelling, names, rules: { tieBreakers: ['points', 'nrr', 'head_to_head'] } }),
    );
    expect(orderOf(table)).toEqual(['TIT', 'ROY', 'KIN', 'MIN']);
  });

  it('STANDINGS 9.2 a no result between Kings and Titans still leaves head-to-head decisive', () => {
    const withNoResult = results.map((summary) => (summary.matchId === 'h2' ? noResult('h2', 'KIN', 'TIT') : summary));
    const adjustments = [
      adjustment('ROY', 1, { poolId: 'pA', id: 'adj-roy' }),
      adjustment('TIT', 2, { poolId: 'pA', id: 'adj-tit' }),
    ];
    const table = computeStandings(
      tableInput({
        members: ['KIN', 'ROY', 'TIT', 'MIN'],
        results: withNoResult,
        overrides: adjustments,
        names,
        rules: { tieBreakers: ['points', 'head_to_head', 'nrr'], headToHeadRequiresCompleteMiniLeague: true },
      }),
    );
    expect(orderOf(table)).toEqual(['KIN', 'ROY', 'TIT', 'MIN']);
    expect(table.rows.slice(0, 3).map((row) => row.points)).toEqual([5, 5, 5]);
    expect(rowOf(table, 'KIN').tieBreak?.detail).toBe('Ahead of Royals on head-to-head (3 pts vs 2 pts among Kings, Royals, Titans)');
    expect(rowOf(table, 'ROY').tieBreak?.detail).toBe('Ahead of Titans on head-to-head (2 pts vs 1 pt among Kings, Royals, Titans)');
  });

  it('STANDINGS 9.2 skips an incomplete mini-league when completeness is required', () => {
    const withoutKingsTitans = results.filter((summary) => summary.matchId !== 'h2');
    const cancelled = fixture('c-kt', 'groups', 'pA', 20, team('KIN'), team('TIT'), { status: 'cancelled' });
    const adjustments = [
      adjustment('ROY', 0, { poolId: 'pA', id: 'adj-roy' }),
      adjustment('TIT', 2, { poolId: 'pA', id: 'adj-tit' }),
      adjustment('KIN', 0, { poolId: 'pA', id: 'adj-kin' }),
    ];
    const table = computeStandings(
      tableInput({
        members: ['KIN', 'ROY', 'TIT', 'MIN'],
        results: withoutKingsTitans,
        extraFixtures: [cancelled],
        overrides: adjustments,
        names,
        rules: { tieBreakers: ['points', 'head_to_head', 'nrr'], headToHeadRequiresCompleteMiniLeague: true },
      }),
    );
    expect(orderOf(table)).toEqual(['TIT', 'ROY', 'KIN', 'MIN']);
    expect(rowOf(table, 'TIT').tieBreak?.detail).toMatch(/^Head-to-head not used: Kings v Titans was not completed\. Ahead of Royals on net run rate/);
  });
});

describe('members and special rows', () => {
  it('U-STD-06 slot members before any result, then provisionally resolved', () => {
    const slots = ['D2', 'A1', 'C1', 'B2'].map((label) => ({
      side: slotSide(`s-${label}`),
      slotLabel: label,
      teamId: null,
      provisional: false,
      membership: 'active' as const,
      inheritsFrom: [],
    }));
    const empty = computeStandings(tableInput({ members: slots }));
    expect(empty.rows.map((row) => [row.slotLabel, row.teamId, row.position])).toEqual([
      ['A1', null, 1],
      ['B2', null, 2],
      ['C1', null, 3],
      ['D2', null, 4],
    ]);
    const resolved = slots.map((member) => (member.slotLabel === 'A1' ? { ...member, teamId: 'LIO', provisional: true } : member));
    const partial = computeStandings(tableInput({ members: resolved }));
    expect(partial.rows[0]).toMatchObject({ slotLabel: 'A1', teamId: 'LIO', provisional: true, position: 1 });
    expect(partial.rows.slice(1).map((row) => row.slotLabel)).toEqual(['B2', 'C1', 'D2']);
  });

  it('U-STD-07 keep_for_opponents keeps the predecessor as a replaced row', () => {
    const table = computeStandings(
      tableInput({
        members: ['Y', 'Z', teamMember('X', { membership: 'replaced' })],
        results: [simpleWin('r1', 'X', 'Z')],
      }),
    );
    expect(rowOf(table, 'X')).toMatchObject({ membership: 'replaced', played: 1, points: 2 });
    expect(rowOf(table, 'Y')).toMatchObject({ played: 0, points: 0, membership: 'active' });
    expect(rowOf(table, 'Z')).toMatchObject({ played: 1, lost: 1 });
  });

  it('U-STD-08 transfer_to_replacement aggregates the predecessor results into the replacement', () => {
    const table = computeStandings(
      tableInput({
        members: [teamMember('Y', { inheritsFrom: ['X'] }), 'Z'],
        results: [simpleWin('r1', 'X', 'Z')],
      }),
    );
    expect(table.rows.some((row) => row.teamId === 'X')).toBe(false);
    expect(rowOf(table, 'Y')).toMatchObject({ played: 1, won: 1, points: 2, runsScored: 150 });
    expect(rowOf(table, 'Z')).toMatchObject({ played: 1, lost: 1 });
  });

  it('U-STD-09 expunge removes the predecessor results for everyone', () => {
    const table = computeStandings(
      tableInput({
        members: ['Y', 'Z'],
        results: [simpleWin('r1', 'X', 'Z'), simpleWin('r2', 'Z', 'Y')],
        overrides: [expunge('X')],
      }),
    );
    expect(rowOf(table, 'Z')).toMatchObject({ played: 1, won: 1, points: 2 });
  });

  it('U-STD-11 frozen sides decide which rows a played fixture counts for', () => {
    const summary = simpleWin('fz', 'TIG', 'LIO');
    const input = tableInput({ members: ['TIG', 'LIO', 'EAG'] });
    const frozen = {
      ...fixture('f-sf', 'groups', 'pA', 1, slotSide('s-A1'), team('LIO')),
      matchId: 'fz',
      matchSides: { teamAId: 'TIG', teamBId: 'LIO' },
      status: 'completed' as const,
    };
    const table = computeStandings({
      ...input,
      fixtures: [frozen],
      summaries: { fz: summary },
      fixtureTeams: (f) => (f.matchSides ? { a: f.matchSides.teamAId, b: f.matchSides.teamBId } : { a: 'EAG', b: 'LIO' }),
    });
    expect(rowOf(table, 'TIG')).toMatchObject({ played: 1, won: 1 });
    expect(rowOf(table, 'LIO')).toMatchObject({ played: 1, lost: 1 });
    expect(rowOf(table, 'EAG')).toMatchObject({ played: 0 });
  });

  it('U-STD-12 level groups are provisional ties; unresolvedTies stays empty', () => {
    const table = computeStandings(tableInput({ members: ['A', 'B', 'C'], results: [noResult('n1', 'A', 'B')], pending: [[team('A'), team('C')]] }));
    expect(table.provisionalTies).toEqual([['A', 'B']]);
    expect(table.unresolvedTies).toEqual([]);
    expect(rowOf(table, 'A')).toMatchObject({ position: 1, sharedPosition: true, matchesRemaining: 1 });
    expect(rowOf(table, 'A').tieBreak?.detail).toBe('Level with B — organizer decision required');
  });

  it('a pool table ignores results against teams outside the pool', () => {
    const table = computeStandings(tableInput({ members: ['A', 'B'], results: [simpleWin('x1', 'A', 'OUT'), simpleWin('x2', 'A', 'B')] }));
    expect(rowOf(table, 'A')).toMatchObject({ played: 1, points: 2 });
  });
});

describe('uneven pools (U-QUAL-03 data)', () => {
  const results = [
    simpleWin('a1', 'RAV', 'HAW'),
    simpleWin('a2', 'RAV', 'OWL'),
    simpleWin('a3', 'RAV', 'KIT'),
    simpleWin('a4', 'HAW', 'OWL'),
    simpleWin('a5', 'HAW', 'KIT'),
    simpleWin('a6', 'OWL', 'KIT'),
    simpleWin('b1', 'BUL', 'BEA'),
    simpleWin('b2', 'BUL', 'BEA'),
    simpleWin('b3', 'BUL', 'BIS'),
    simpleWin('b4', 'BUL', 'BIS'),
    simpleWin('b5', 'BEA', 'BIS'),
    simpleWin('b6', 'BEA', 'BIS'),
    simpleWin('c1', 'COB', 'VIP'),
    noResult('c2', 'COB', 'VIP'),
    simpleWin('c3', 'COB', 'PYT'),
    simpleWin('c4', 'COB', 'PYT'),
    simpleWin('c5', 'VIP', 'PYT'),
    simpleWin('c6', 'VIP', 'PYT'),
  ];
  const poolOrder = new Map([
    ['pA', ['RAV', 'HAW', 'OWL', 'KIT']],
    ['pB', ['BUL', 'BEA', 'BIS']],
    ['pC', ['COB', 'VIP', 'PYT']],
  ]);
  const compare = (normalization: 'raw' | 'per_match_average' | 'drop_extra_results') =>
    computeStandings(tableInput({ members: ['HAW', 'BEA', 'VIP'], results, poolId: null, normalization, poolOrder }));

  it('U-STD-10 raw comparison', () => {
    const table = compare('raw');
    expect(orderOf(table)).toEqual(['VIP', 'HAW', 'BEA']);
    expect(rowOf(table, 'VIP')).toMatchObject({ points: 5, played: 4 });
    expect(rowOf(table, 'HAW')).toMatchObject({ points: 4, played: 3 });
    expect(rowOf(table, 'BEA')).toMatchObject({ points: 4, played: 4 });
  });

  it('U-STD-10 per_match_average comparison', () => {
    const table = compare('per_match_average');
    expect(orderOf(table)).toEqual(['HAW', 'VIP', 'BEA']);
    expect(rowOf(table, 'HAW').points).toBe(4);
    expect(rowOf(table, 'HAW').tieBreak?.detail).toBe('1.33 pts, 0.08 ahead of VIP');
  });

  it('U-STD-10 drop_extra_results comparison', () => {
    const table = compare('drop_extra_results');
    expect(orderOf(table)).toEqual(['HAW', 'VIP', 'BEA']);
    expect(rowOf(table, 'BEA')).toMatchObject({ points: 2, played: 3 });
    expect(rowOf(table, 'VIP')).toMatchObject({ points: 3, played: 3 });
    expect(rowOf(table, 'HAW')).toMatchObject({ points: 4, played: 3 });
  });
});

describe('effectiveStageRules', () => {
  it('U-STD-13 stage overrides win, otherwise tournament defaults apply', () => {
    const custom = { ...DEFAULT_POINTS_SYSTEM, win: 3 };
    const snapshot = makeSnapshot({
      teams: [],
      stages: [
        stage('groups', 'Groups', 'group', 0, { pointsSystem: custom, headToHeadRequiresCompleteMiniLeague: true }),
        stage('ko', 'Knockouts', 'knockout', 1),
      ],
    });
    expect(effectiveStageRules(snapshot, 'groups')).toMatchObject({ points: custom, headToHeadRequiresCompleteMiniLeague: true });
    expect(effectiveStageRules(snapshot, 'ko')).toEqual({
      points: snapshot.rules.pointsSystem,
      nrr: snapshot.rules.nrr,
      tieBreakers: snapshot.rules.tieBreakers,
      headToHeadRequiresCompleteMiniLeague: false,
    });
  });
});

import { formatBowlingFigures } from '../format';
import { boundaryCounts, manhattan, playerMatchStats, worm } from '../stats';
import { g1, inn, batter, bowler } from './helpers';

describe('golden match G1 (M3)', () => {
  const { state } = g1();
  const first = inn(state, 0);
  const chase = inn(state, 1);

  it('scores innings 0 as 27/1 in 3 overs, overs complete', () => {
    expect(first.runs).toBe(27);
    expect(first.wickets).toBe(1);
    expect(first.legalBalls).toBe(18);
    expect(first.completion?.reason).toBe('overs_complete');
    expect(first.runRate).toBeCloseTo(9, 6);
  });

  it('U-EXT-36 extras breakdown', () => {
    expect(first.extras).toEqual({ wides: 1, noBalls: 1, byes: 0, legByes: 1, penalty: 0, total: 3 });
  });

  it('U-CARD-01..04 batting rows', () => {
    const l1 = batter(state, 'L1', 0);
    expect(l1).toMatchObject({ position: 1, status: 'not_out', runs: 7, balls: 6, fours: 0, sixes: 0 });
    expect(l1.strikeRate).toBeCloseTo(116.666667, 5);
    const l2 = batter(state, 'L2', 0);
    expect(l2).toMatchObject({ position: 2, status: 'out', runs: 13, balls: 7, fours: 1, sixes: 1, dismissalText: 'b Shaheen' });
    expect(l2.strikeRate).toBeCloseTo(185.714286, 5);
    const l3 = batter(state, 'L3', 0);
    expect(l3).toMatchObject({ position: 3, status: 'not_out', runs: 4, balls: 6 });
    expect(l3.strikeRate).toBeCloseTo(66.666667, 5);
    for (const id of ['L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11']) {
      expect(batter(state, id, 0)).toMatchObject({ status: 'yet_to_bat', position: null, dismissalText: '' });
    }
    expect(first.batting.some((row) => row.playerId === 'L12')).toBe(false);
    expect(first.batting.map((row) => row.playerId).slice(0, 4)).toEqual(['L1', 'L2', 'L3', 'L4']);
  });

  it('U-CARD-05/06 bowling rows', () => {
    const hassan = bowler(state, 'T7', 0);
    expect(hassan).toMatchObject({
      order: 1,
      legalBalls: 12,
      oversUsed: 2,
      maidens: 0,
      runsConceded: 21,
      wickets: 0,
      dots: 1,
      wideDeliveries: 1,
      wideRuns: 1,
      foursConceded: 1,
      sixesConceded: 1,
    });
    expect(hassan.economy).toBeCloseTo(10.5, 6);
    expect(formatBowlingFigures(hassan, 6)).toBe('2-0-21-0');
    const shaheen = bowler(state, 'T8', 0);
    expect(shaheen).toMatchObject({ order: 2, legalBalls: 6, runsConceded: 5, wickets: 1, dots: 4, noBallDeliveries: 1 });
    expect(shaheen.economy).toBeCloseTo(5, 6);
    expect(formatBowlingFigures(shaheen, 6)).toBe('1-0-5-1');
  });

  it('U-CARD-07/08 partnerships', () => {
    expect(first.partnerships[0]).toMatchObject({
      wicketNumber: 1,
      batterAId: 'L1',
      batterBId: 'L2',
      runs: 15,
      balls: 8,
      batterARuns: 1,
      batterABalls: 1,
      batterBRuns: 13,
      batterBBalls: 7,
      extras: 1,
      endedBy: 'wicket',
    });
    expect(first.partnerships[1]).toMatchObject({
      wicketNumber: 2,
      batterAId: 'L1',
      batterBId: 'L3',
      runs: 12,
      balls: 10,
      batterARuns: 6,
      batterABalls: 5,
      batterBRuns: 4,
      batterBBalls: 6,
      extras: 2,
      endedBy: 'innings_end',
    });
    expect(first.currentPartnership).toBeNull();
  });

  it('U-CARD-09 fall of wickets', () => {
    expect(first.fallOfWickets).toEqual([
      { wicketNumber: 1, playerOutId: 'L2', teamRuns: 15, legalBalls: 8, overLabel: '1.2', dismissalType: 'bowled', seq: expect.any(Number) },
    ]);
  });

  it('U-CARD-10 over summaries', () => {
    const [o0, o1, o2] = first.overs;
    expect(o0).toMatchObject({ bowlerIds: ['T7'], runs: 15, bowlerRuns: 15, wickets: 0, extras: 1, scoreAtEnd: { runs: 15, wickets: 0 } });
    expect(o0.tokens.map((token) => token.text)).toEqual(['1', '4', 'WD', '0', '2', '6', '1']);
    expect(o1).toMatchObject({ bowlerIds: ['T8'], runs: 6, bowlerRuns: 5, wickets: 1, extras: 2, scoreAtEnd: { runs: 21, wickets: 1 } });
    expect(o1.tokens.map((token) => token.text)).toEqual(['0', 'W', '1', 'NB+1', '0', 'LB1', '2']);
    expect(o1.tokens.map((token) => token.isFreeHit)).toEqual([false, false, false, false, true, false, false]);
    expect(o2).toMatchObject({ bowlerIds: ['T7'], runs: 6, bowlerRuns: 6, wickets: 0, extras: 0, scoreAtEnd: { runs: 27, wickets: 1 } });
  });

  it('U-CARD-11 powerplay phase', () => {
    expect(first.powerplay.phases[0]).toMatchObject({ state: 'complete', runs: 15, wickets: 0, legalBalls: 6 });
    expect(first.powerplay.active).toBeNull();
  });

  it('U-CARD-12/13 worm and manhattan', () => {
    expect(worm(state)[0].points).toEqual([
      { legalBalls: 0, runs: 0, wickets: 0 },
      { legalBalls: 6, runs: 15, wickets: 0 },
      { legalBalls: 12, runs: 21, wickets: 1 },
      { legalBalls: 18, runs: 27, wickets: 1 },
    ]);
    expect(manhattan(first)).toEqual([
      { overIndex: 0, runs: 15, wickets: 0 },
      { overIndex: 1, runs: 6, wickets: 1 },
      { overIndex: 2, runs: 6, wickets: 0 },
    ]);
  });

  it('U-CARD-14/15 chase cards', () => {
    expect(batter(state, 'T1', 1)).toMatchObject({ runs: 17, balls: 7, dismissalText: 'c Amir b Abdul' });
    expect(batter(state, 'T2', 1)).toMatchObject({ runs: 7, balls: 4, status: 'not_out' });
    expect(batter(state, 'T3', 1)).toMatchObject({ runs: 4, balls: 3, status: 'not_out' });
    expect(formatBowlingFigures(bowler(state, 'L10', 1), 6)).toBe('1.2-0-20-0');
    expect(formatBowlingFigures(bowler(state, 'L11', 1), 6)).toBe('1-0-8-1');
  });

  it('U-CARD-16/17 boundary counts and player stats', () => {
    expect(boundaryCounts(state)).toEqual([
      { teamId: 'LIO', fours: 1, sixes: 1 },
      { teamId: 'TIG', fours: 3, sixes: 1 },
    ]);
    expect(playerMatchStats(state, 'L7')).toEqual({ playerId: 'L7', batting: null, bowling: null, catches: 1, stumpings: 0, runOuts: 0 });
  });

  it('U-RES-31 natural result at 2.2 of the chase', () => {
    expect(chase.completion?.reason).toBe('target_reached');
    expect(chase.legalBalls).toBe(14);
    expect(state.naturalResult).toEqual({
      type: 'win',
      winnerTeamId: 'TIG',
      loserTeamId: 'LIO',
      margin: { kind: 'wickets', wickets: 9, ballsRemaining: 4 },
      method: 'normal',
    });
    expect(state.pendingAction).toMatchObject({ type: 'confirm_result', text: 'Tigers won by 9 wickets (4 balls left)' });
    expect(state.canRecordDelivery).toBe(false);
    expect(state.issues).toEqual([]);
  });

  it('U-STR-15 strikers in over 3 of innings 0', () => {
    expect(first.balls.filter((ball) => ball.overIndex === 2).map((ball) => ball.strikerId)).toEqual(['L3', 'L1', 'L3', 'L1', 'L3', 'L1']);
  });

  it('U-OVR-01 numbering of over 1', () => {
    const over = first.balls.filter((ball) => ball.overIndex === 0);
    expect(over.map((ball) => ball.deliveryInOver)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(over.map((ball) => ball.label)).toEqual(['0.1', '0.2', '0.3', '0.3', '0.4', '0.5', '0.6']);
    expect(over.map((ball) => ball.endsOver)).toEqual([false, false, false, false, false, false, true]);
  });
});

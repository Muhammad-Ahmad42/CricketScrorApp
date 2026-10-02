import type { InningsSummary, MatchSummary } from '../../types';
import { SCORING_PROJECTION_VERSION, buildMatchSummary, summariesAffectStandingsEqually } from '../summary';
import { matchSetup, playedMatch, playScript, summary as handSummary, inningsSummary, tied } from '../testing';
import { g1, play } from './helpers';

const SUMMARY_KEYS = [
  'summaryVersion',
  'matchId',
  'teamAId',
  'teamBId',
  'status',
  'result',
  'winnerTeamId',
  'ballsPerOver',
  'innings',
  'superOvers',
  'squads',
  'completedAt',
];

describe('buildMatchSummary (U-SUM)', () => {
  it('U-SUM-01 null for a live match', () => {
    const { setup, state } = g1();
    expect(buildMatchSummary(setup, state, { completedAt: null })).toBeNull();
    expect(buildMatchSummary(setup, play(setup, ['start:L1:L2:T7']).state, { completedAt: null })).toBeNull();
  });

  it('U-SUM-02 G1 completed', () => {
    const { setup, events } = g1();
    const done = playScript(setup, ['end'], { prior: events }).state;
    const built = buildMatchSummary(setup, done, { completedAt: '2026-05-01T11:00:00.000Z' });
    expect(built).toMatchObject({
      summaryVersion: 2,
      matchId: 'M1',
      teamAId: 'LIO',
      teamBId: 'TIG',
      status: 'completed',
      winnerTeamId: 'TIG',
      ballsPerOver: 6,
      superOvers: [],
      completedAt: '2026-05-01T11:00:00.000Z',
    });
    expect(built?.innings[0]).toMatchObject({
      inningsIndex: 0,
      battingTeamId: 'LIO',
      bowlingTeamId: 'TIG',
      runs: 27,
      wickets: 1,
      legalBalls: 18,
      allottedBalls: 18,
      allOut: false,
      completion: 'overs_complete',
      target: null,
      targetRevised: false,
      extras: 3,
      fours: 1,
      sixes: 1,
    });
    expect(built?.innings[1]).toMatchObject({ battingTeamId: 'TIG', runs: 28, wickets: 1, legalBalls: 14, allottedBalls: 18, completion: 'target_reached', target: 28, targetRevised: false });
    expect(built?.squads.map((squad) => squad.playerIds.length)).toEqual([11, 11]);
    expect(built?.squads.flatMap((squad) => squad.playerIds)).not.toContain('L12');
    expect(built?.squads.flatMap((squad) => squad.playerIds)).not.toContain('T12');
    expect(built?.innings[0].batting.map((line) => line.playerId)).toEqual(['L1', 'L2', 'L3']);
    expect(built?.innings[0].batting[1]).toEqual({ playerId: 'L2', runs: 13, balls: 7, fours: 1, sixes: 1, out: true, dismissalType: 'bowled' });
    expect(built?.innings[0].bowling[1]).toEqual({ playerId: 'T8', legalBalls: 6, maidens: 0, runsConceded: 5, wickets: 1, wides: 0, noBalls: 1 });
    expect(built?.innings[0].bestPartnership).toEqual({ wicketNumber: 1, batterAId: 'L1', batterBId: 'L2', runs: 15, balls: 8 });
  });

  it('U-SUM-03 allotted balls after a revision and targetRevised', () => {
    const setup = matchSetup();
    const played = playedMatch({ setup, first: { runs: 160, wickets: 5 }, second: { runs: 87, wickets: 6, revision: { balls: 72, target: 100 } } });
    expect(played.summary?.innings[1]).toMatchObject({ allottedBalls: 72, targetRevised: true, target: 100 });
  });

  it('U-SUM-04 all out counts', () => {
    const setup = matchSetup();
    const played = playedMatch({ setup, first: { runs: 80, wickets: 10, balls: 70 }, second: { runs: 81, wickets: 2, balls: 40 } });
    expect(played.summary?.innings[0]).toMatchObject({ allOut: true, completion: 'all_out', allottedBalls: 120, legalBalls: 70 });
    expect(played.summary?.innings[1].allOut).toBe(false);
  });

  it('U-SUM-05 super overs are separate and never in the main player lines', () => {
    const setup = matchSetup();
    const tie = playedMatch({ setup, first: { runs: 100 }, second: { runs: 100, wickets: 1 }, end: null });
    const done = playScript(setup, ['so', 'start:T1:T2:L10', '6 6 0 0 0 0', 'start:L1:L2:T7', '1 0 0 0 0 0', 'end'], { prior: tie.events }).state;
    const built = buildMatchSummary(setup, done, { completedAt: null });
    expect(built?.superOvers).toHaveLength(2);
    expect(built?.innings).toHaveLength(2);
    expect(built?.winnerTeamId).toBe('TIG');
    expect(built?.result).toEqual(tied({ method: 'super_over', winnerTeamId: 'TIG' }));
    const mainT1 = built?.innings[1].batting.find((line) => line.playerId === 'T1');
    const superT1 = built?.superOvers[0].batting.find((line) => line.playerId === 'T1');
    expect(superT1?.runs).toBe(12);
    expect(mainT1?.runs).toBe(tie.state.innings[1].batting.find((row) => row.playerId === 'T1')?.runs);
    expect(built?.innings[1].runs).toBe(100);
  });

  it('U-SUM-06 no tournament context fields', () => {
    const { setup, events } = g1();
    const built = buildMatchSummary(setup, playScript(setup, ['end'], { prior: events }).state, { completedAt: null });
    expect(Object.keys(built ?? {}).sort()).toEqual([...SUMMARY_KEYS].sort());
  });

  it('walkover and abandoned summaries have no innings', () => {
    const setup = matchSetup();
    const walkover = playScript(setup, [{ type: 'end_match', outcome: { type: 'walkover', winnerTeamId: 'LIO', reason: null } }]).state;
    expect(buildMatchSummary(setup, walkover, { completedAt: null })).toMatchObject({ status: 'completed', innings: [], winnerTeamId: 'LIO' });
    const abandoned = playScript(setup, [{ type: 'end_match', outcome: { type: 'abandoned', reason: 'Rain' } }]).state;
    expect(buildMatchSummary(setup, abandoned, { completedAt: null })).toMatchObject({ status: 'abandoned', innings: [], winnerTeamId: null });
  });

  it('is deterministic', () => {
    const { setup, events } = g1();
    const done = playScript(setup, ['end'], { prior: events }).state;
    expect(buildMatchSummary(setup, done, { completedAt: null })).toEqual(buildMatchSummary(setup, done, { completedAt: null }));
  });

  it('U-SUM-08 projection version is a positive integer', () => {
    expect(Number.isInteger(SCORING_PROJECTION_VERSION)).toBe(true);
    expect(SCORING_PROJECTION_VERSION).toBeGreaterThanOrEqual(1);
  });
});

describe('summariesAffectStandingsEqually (U-SUM-07)', () => {
  const base: MatchSummary = handSummary({
    innings: [
      inningsSummary({ inningsIndex: 0, runs: 160, wickets: 6 }),
      inningsSummary({ inningsIndex: 1, battingTeamId: 'TIG', runs: 150, wickets: 9, target: 161 }),
    ],
  });
  const withInnings = (index: number, patch: Partial<InningsSummary>): MatchSummary => ({
    ...base,
    innings: base.innings.map((innings, position) => (position === index ? { ...innings, ...patch } : innings)),
  });

  it('true for a clone and for player-line-only changes', () => {
    expect(summariesAffectStandingsEqually(base, JSON.parse(JSON.stringify(base)) as MatchSummary)).toBe(true);
    expect(summariesAffectStandingsEqually(base, withInnings(0, { batting: [{ playerId: 'L1', runs: 1, balls: 1, fours: 0, sixes: 0, out: false, dismissalType: null }] }))).toBe(true);
    expect(summariesAffectStandingsEqually(base, { ...base, completedAt: '2026-01-01T00:00:00.000Z' })).toBe(true);
    expect(summariesAffectStandingsEqually(null, null)).toBe(true);
  });

  it.each<[string, MatchSummary]>([
    ['margin', { ...base, result: { type: 'win', winnerTeamId: 'LIO', loserTeamId: 'TIG', margin: { kind: 'runs', runs: 11 }, method: 'normal' } }],
    ['winner', { ...base, result: { type: 'win', winnerTeamId: 'TIG', loserTeamId: 'LIO', margin: { kind: 'wickets', wickets: 1, ballsRemaining: 0 }, method: 'normal' }, winnerTeamId: 'TIG' }],
    ['method', { ...base, result: { type: 'win', winnerTeamId: 'LIO', loserTeamId: 'TIG', margin: { kind: 'runs', runs: 10 }, method: 'revised_target' } }],
    ['tie decider', { ...base, result: tied({ method: 'super_over', winnerTeamId: 'LIO' }) }],
    ['ballsPerOver', { ...base, ballsPerOver: 8 }],
    ['innings runs', withInnings(0, { runs: 161 })],
    ['innings balls', withInnings(1, { legalBalls: 119 })],
    ['innings wickets', withInnings(1, { wickets: 8 })],
    ['allotted', withInnings(1, { allottedBalls: 90 })],
    ['all out', withInnings(0, { allOut: true })],
    ['completion', withInnings(0, { completion: 'declared' })],
    ['target', withInnings(1, { target: 162 })],
    ['targetRevised', withInnings(1, { targetRevised: true })],
    ['innings ballsPerOver', withInnings(1, { ballsPerOver: 8 })],
  ])('false when %s differs', (_, changed) => {
    expect(summariesAffectStandingsEqually(base, changed)).toBe(false);
  });

  it('false against null', () => {
    expect(summariesAffectStandingsEqually(base, null)).toBe(false);
  });

  it('tie decided by another team differs', () => {
    const a = { ...base, result: tied({ method: 'super_over', winnerTeamId: 'LIO' }) };
    const b = { ...base, result: tied({ method: 'super_over', winnerTeamId: 'TIG' }) };
    expect(summariesAffectStandingsEqually(a, b)).toBe(false);
  });
});

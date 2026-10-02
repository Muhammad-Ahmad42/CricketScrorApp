import { NRR_EPSILON } from '@/domain/types';
import type { NrrConfig } from '@/domain/types';
import { aggregateNrr, compareNrr, computeNrr, matchNrrContributions } from '../nrr';
import { DEFAULT_NRR_CONFIG } from '../defaults';
import { deepFreeze, inningsOf, noResult, abandoned, outcomeSummary, played, summaryOf, walkover } from './standingsKit/summaries';

const icc: NrrConfig = DEFAULT_NRR_CONFIG;
const actual: NrrConfig = { ...icc, mode: 'actual_overs' };

function nrrOf(summaries: Parameters<typeof aggregateNrr>[0], teamId: string, config: NrrConfig = icc): number | null {
  return aggregateNrr(summaries, [teamId], config).get(teamId)?.nrr ?? null;
}

const u01 = deepFreeze(
  played('m1', { team: 'LIO', runs: 180, balls: 120, wickets: 6 }, { team: 'TIG', runs: 150, balls: 110, allOut: true }),
);
const u03 = deepFreeze(
  played('m3', { team: 'TIG', runs: 140, balls: 120, wickets: 8 }, { team: 'LIO', runs: 141, balls: 100, wickets: 3 }),
);

describe('matchNrrContributions', () => {
  it('U-NRR-01 all out counts the full quota both ways in icc mode', () => {
    const contributions = matchNrrContributions(u01, icc);
    expect(contributions).not.toBeNull();
    const [lions, tigers] = contributions!;
    expect(lions).toMatchObject({ teamId: 'LIO', runsFor: 180, ballsFor: 120, runsAgainst: 150, ballsAgainst: 120 });
    expect(tigers).toMatchObject({ teamId: 'TIG', runsFor: 150, ballsFor: 120, runsAgainst: 180, ballsAgainst: 120 });
    expect(lions.oversFor).toBeCloseTo(20, 6);
    expect(nrrOf([u01], 'LIO')).toBeCloseTo(1.5, 6);
    expect(nrrOf([u01], 'TIG')).toBeCloseTo(-1.5, 6);
  });

  it('U-NRR-02 actual_overs mode uses actual balls', () => {
    const [, tigers] = matchNrrContributions(u01, actual)!;
    expect(tigers.ballsFor).toBe(110);
    expect(nrrOf([u01], 'LIO', actual)).toBeCloseTo(0.818182, 6);
    expect(nrrOf([u01], 'TIG', actual)).toBeCloseTo(-0.818182, 6);
  });

  it('U-NRR-03 a chase won early counts actual balls', () => {
    const [, lions] = matchNrrContributions(u03, icc)!;
    expect(lions.ballsFor).toBe(100);
    expect(nrrOf([u03], 'LIO')).toBeCloseTo(1.46, 6);
  });

  it('U-NRR-04 aggregates runs and balls rather than averaging match NRRs', () => {
    const aggregate = aggregateNrr([u01, u03], ['LIO'], icc).get('LIO')!;
    expect(aggregate.runsFor).toBe(321);
    expect(aggregate.oversFor).toBeCloseTo(36.666667, 5);
    expect(aggregate.runsAgainst).toBe(290);
    expect(aggregate.oversAgainst).toBeCloseTo(40, 6);
    expect(aggregate.matchesCounted).toBe(2);
    expect(aggregate.nrr).toBeCloseTo(1.504545, 6);
  });

  const revised = deepFreeze(
    played(
      'm5',
      { team: 'LIO', runs: 160, balls: 120, wickets: 5 },
      { team: 'TIG', runs: 95, balls: 72, wickets: 4, allotted: 72, target: 100, targetRevised: true },
      { method: 'revised_target' },
    ),
  );

  it('U-NRR-05 revised target credits the side batting first with par off the chasing allotment', () => {
    const [lions] = matchNrrContributions(revised, icc)!;
    expect(lions.runsFor).toBe(99);
    expect(lions.ballsFor).toBe(72);
    expect(nrrOf([revised], 'LIO')).toBeCloseTo(0.333333, 6);
    expect(nrrOf([revised], 'TIG')).toBeCloseTo(-0.333333, 6);
  });

  it('U-NRR-06 revisedTarget actual uses raw figures', () => {
    expect(nrrOf([revised], 'LIO', { ...icc, revisedTarget: 'actual' })).toBeCloseTo(0.083333, 6);
  });

  it('U-NRR-07 an all-out chase after a revision counts the revised allotment', () => {
    const allOut = played(
      'm7',
      { team: 'LIO', runs: 160, balls: 120, wickets: 5 },
      { team: 'TIG', runs: 80, balls: 63, allOut: true, allotted: 72, target: 100, targetRevised: true },
    );
    const [, tigers] = matchNrrContributions(allOut, icc)!;
    expect(tigers.ballsFor).toBe(72);
    expect(nrrOf([allOut], 'TIG')).toBeCloseTo(-1.583333, 6);
  });

  it('U-NRR-08 terminated par chase credits par off the balls bowled', () => {
    const par = played(
      'm8',
      { team: 'TIG', runs: 170, balls: 120, wickets: 7 },
      { team: 'LIO', runs: 131, balls: 86, wickets: 2, allotted: 86, target: 111, targetRevised: true, completion: 'terminated' },
      { method: 'par_score' },
    );
    const [tigers] = matchNrrContributions(par, icc)!;
    expect(tigers.runsFor).toBe(110);
    expect(tigers.ballsFor).toBe(86);
    expect(nrrOf([par], 'LIO')).toBeCloseTo(1.465116, 6);
    expect(nrrOf([par], 'TIG')).toBeCloseTo(-1.465116, 6);
  });

  const washout = deepFreeze(
    noResult('m9', 'LIO', 'TIG', [inningsOf({ team: 'LIO', runs: 60, balls: 48, wickets: 1, completion: 'match_ended' }, 'TIG', 0)]),
  );

  it('U-NRR-09 no result is excluded by default', () => {
    expect(matchNrrContributions(washout, icc)).toBeNull();
  });

  it('U-NRR-10 includeNoResult counts only innings with a legal ball', () => {
    const config = { ...icc, includeNoResult: true };
    const [lions, tigers] = matchNrrContributions(washout, config)!;
    expect(lions).toMatchObject({ runsFor: 60, ballsFor: 48, runsAgainst: 0, ballsAgainst: 0 });
    expect(tigers).toMatchObject({ runsFor: 0, ballsFor: 0, runsAgainst: 60, ballsAgainst: 48 });
    expect(nrrOf([washout], 'LIO', config)).toBeNull();
    expect(computeNrr(lions.runsFor, lions.oversFor, lions.runsAgainst, lions.oversAgainst)).toBeNull();
  });

  it('U-NRR-11 abandoned follows includeAbandoned', () => {
    const called = abandoned('m11', 'LIO', 'TIG', [inningsOf({ team: 'LIO', runs: 60, balls: 48, completion: 'match_ended' }, 'TIG', 0)]);
    expect(matchNrrContributions(called, icc)).toBeNull();
    const [lions] = matchNrrContributions(called, { ...icc, includeAbandoned: true })!;
    expect(lions).toMatchObject({ runsFor: 60, ballsFor: 48 });
  });

  it('U-NRR-12 walkover excluded under the exclude policy', () => {
    expect(matchNrrContributions(walkover('m12', 'LIO', 'TIG'), icc)).toBeNull();
  });

  it('U-NRR-13 walkover notional figures', () => {
    const config: NrrConfig = {
      ...icc,
      walkover: { kind: 'notional', winnerRuns: 120, winnerBalls: 120, loserRuns: 100, loserBalls: 120 },
    };
    const summary = walkover('m13', 'LIO', 'TIG');
    expect(nrrOf([summary], 'LIO', config)).toBeCloseTo(1, 6);
    expect(nrrOf([summary], 'TIG', config)).toBeCloseTo(-1, 6);
  });

  it('U-NRR-14 awarded: excluded, or only completed innings with use_played_innings', () => {
    const awarded = outcomeSummary(
      'm14',
      'LIO',
      'TIG',
      { type: 'awarded', winnerTeamId: 'LIO', loserTeamId: 'TIG', reason: 'Conceded', margin: null },
      [
        inningsOf({ team: 'LIO', runs: 150, balls: 120, wickets: 6 }, 'TIG', 0),
        inningsOf({ team: 'TIG', runs: 30, balls: 30, wickets: 2, completion: 'match_ended' }, 'LIO', 1),
      ],
    );
    expect(matchNrrContributions(awarded, icc)).toBeNull();
    const [lions, tigers] = matchNrrContributions(awarded, { ...icc, awarded: 'use_played_innings' })!;
    expect(lions).toMatchObject({ runsFor: 150, ballsFor: 120, runsAgainst: 0, ballsAgainst: 0 });
    expect(tigers).toMatchObject({ runsFor: 0, ballsFor: 0, runsAgainst: 150, ballsAgainst: 120 });
  });

  it('U-NRR-15 super overs are ignored', () => {
    const tied = played(
      'm15',
      { team: 'LIO', runs: 150, balls: 120, wickets: 7 },
      { team: 'TIG', runs: 150, balls: 120, wickets: 9 },
      {
        decider: { method: 'super_over', winnerTeamId: 'LIO', superOverRounds: 1 },
        superOvers: [
          inningsOf({ team: 'TIG', runs: 10, balls: 6, wickets: 2, allotted: 6 }, 'LIO', 2),
          inningsOf({ team: 'LIO', runs: 15, balls: 4, wickets: 1, allotted: 6 }, 'TIG', 3),
        ],
      },
    );
    expect(nrrOf([tied], 'LIO')).toBeCloseTo(0, 9);
    expect(nrrOf([tied], 'TIG')).toBeCloseTo(0, 9);
    expect(aggregateNrr([tied], ['LIO'], icc).get('LIO')!.runsFor).toBe(150);
  });

  it('U-NRR-16 mixed balls per over use each match length', () => {
    const eightBall = played(
      'm16a',
      { team: 'LIO', runs: 100, balls: 80, bpo: 8, allotted: 80 },
      { team: 'TIG', runs: 90, balls: 80, bpo: 8, allotted: 80 },
      { bpo: 8, allotted: 80 },
    );
    const sixBall = played('m16b', { team: 'LIO', runs: 120, balls: 120 }, { team: 'TIG', runs: 100, balls: 120 });
    const aggregate = aggregateNrr([eightBall, sixBall], ['LIO'], icc).get('LIO')!;
    expect(aggregate.oversFor).toBeCloseTo(30, 9);
    expect(aggregate.oversAgainst).toBeCloseTo(30, 9);
    expect(aggregate.nrr).toBeCloseTo(1, 9);
  });

  it('U-NRR-17 an expunged team excludes the match for both teams', () => {
    expect(matchNrrContributions(u01, icc, new Set(['TIG']))).toBeNull();
    const aggregate = aggregateNrr([u01, u03], ['LIO'], icc, { expungedTeamIds: new Set(['TIG']) }).get('LIO')!;
    expect(aggregate.matchesCounted).toBe(0);
    expect(aggregate.nrr).toBeNull();
  });

  it('U-NRR-20 restrictToTeams counts only matches between listed teams', () => {
    const other = played('m20', { team: 'LIO', runs: 200, balls: 120 }, { team: 'EAG', runs: 100, balls: 120, allOut: true });
    const restricted = aggregateNrr([u01, other], ['LIO', 'TIG'], icc, { restrictToTeams: true });
    expect(restricted.get('LIO')!.matchesCounted).toBe(1);
    expect(restricted.get('LIO')!.nrr).toBeCloseTo(1.5, 6);
    const unrestricted = aggregateNrr([u01, other], ['LIO', 'TIG'], icc);
    expect(unrestricted.get('LIO')!.matchesCounted).toBe(2);
  });
});

describe('computeNrr and compareNrr', () => {
  it('U-NRR-18 null when an overs total is zero', () => {
    expect(computeNrr(0, 0, 50, 5)).toBeNull();
    expect(computeNrr(50, 5, 0, 0)).toBeNull();
    expect(computeNrr(180, 20, 160, 20)).toBeCloseTo(1, 9);
  });

  it('U-NRR-19 epsilon equality, null last, higher first', () => {
    expect(compareNrr(1.0, 1.0 + 1e-10)).toBe(0);
    expect(compareNrr(null, -5)).toBeGreaterThan(0);
    expect(compareNrr(-5, null)).toBeLessThan(0);
    expect(compareNrr(null, null)).toBe(0);
    expect(compareNrr(0.5, 0.2)).toBeLessThan(0);
    expect(compareNrr(0.2, 0.5)).toBeGreaterThan(0);
    expect(compareNrr(1, 1 + NRR_EPSILON * 2)).toBeGreaterThan(0);
  });
});

describe('NRR_CALCULATOR worked examples', () => {
  it('6.1 plain win', () => {
    const summary = played('w1', { team: 'A', runs: 180, balls: 120, wickets: 6 }, { team: 'B', runs: 160, balls: 120, wickets: 9 });
    expect(nrrOf([summary], 'A')).toBeCloseTo(1, 9);
    expect(nrrOf([summary], 'B')).toBeCloseTo(-1, 9);
  });

  it('6.2 all out and a chase won early in both modes', () => {
    const summary = played('w2', { team: 'A', runs: 150, balls: 110, allOut: true }, { team: 'B', runs: 151, balls: 94, wickets: 3 });
    expect(nrrOf([summary], 'A')).toBeCloseTo(-2.138298, 5);
    expect(nrrOf([summary], 'B')).toBeCloseTo(2.138298, 5);
    expect(nrrOf([summary], 'A', actual)).toBeCloseTo(-1.456480, 5);
  });

  it('6.3 tournament aggregate with a no result', () => {
    const m1 = played('t1', { team: 'T', runs: 165, balls: 120, wickets: 7 }, { team: 'X', runs: 140, balls: 120, wickets: 8 });
    const m2 = played('t2', { team: 'T', runs: 142, balls: 115, allOut: true }, { team: 'Y', runs: 143, balls: 105, wickets: 5 });
    const m3 = noResult('t3', 'T', 'Z', [inningsOf({ team: 'T', runs: 60, balls: 48, wickets: 1, completion: 'match_ended' }, 'Z', 0)]);
    const aggregate = aggregateNrr([m1, m2, m3], ['T'], icc).get('T')!;
    expect(aggregate.runsFor).toBe(307);
    expect(aggregate.ballsFor).toBe(240);
    expect(aggregate.runsAgainst).toBe(283);
    expect(aggregate.ballsAgainst).toBe(225);
    expect(aggregate.nrr).toBeCloseTo(0.128333, 5);
    expect(nrrOf([m1, m2, m3], 'T', { ...icc, includeNoResult: true })).toBeCloseTo(0.099167, 5);
  });

  it('6.4 reduced-overs match counts the reduced quota for the all-out side', () => {
    const summary = played(
      'w4',
      { team: 'A', runs: 96, balls: 72, wickets: 4, allotted: 72 },
      { team: 'B', runs: 80, balls: 61, allOut: true, allotted: 72 },
      { allotted: 72 },
    );
    expect(nrrOf([summary], 'A')).toBeCloseTo(1.333333, 6);
  });

  it('6.5 revised target in both configurations', () => {
    const summary = played(
      'w5',
      { team: 'A', runs: 180, balls: 120, wickets: 6 },
      { team: 'B', runs: 138, balls: 90, wickets: 4, allotted: 90, target: 141, targetRevised: true },
    );
    expect(nrrOf([summary], 'A')).toBeCloseTo(0.133333, 6);
    expect(nrrOf([summary], 'A', { ...icc, revisedTarget: 'actual' })).toBeCloseTo(-0.2, 6);
  });

  it('6.6 terminated chase decided on par in both configurations', () => {
    const summary = played(
      'w6',
      { team: 'A', runs: 180, balls: 120, wickets: 6 },
      { team: 'B', runs: 131, balls: 86, wickets: 3, allotted: 86, target: 111, targetRevised: true, completion: 'terminated' },
    );
    expect(nrrOf([summary], 'A')).toBeCloseTo(-1.465116, 6);
    expect(nrrOf([summary], 'A', { ...icc, revisedTarget: 'actual' })).toBeCloseTo(-0.139535, 6);
  });

  it('keeps a table symmetric: runs and overs for equal runs and overs against', () => {
    const summaries = [
      played('s1', { team: 'A', runs: 160, balls: 120 }, { team: 'B', runs: 150, balls: 120 }),
      played('s2', { team: 'B', runs: 171, balls: 120 }, { team: 'C', runs: 140, balls: 111, allOut: true }),
      played('s3', { team: 'A', runs: 148, balls: 120 }, { team: 'C', runs: 149, balls: 110 }),
      summaryOf({ matchId: 's4', teamAId: 'A', teamBId: 'B', result: { type: 'no_result', reason: null } }),
    ];
    const aggregates = [...aggregateNrr(summaries, ['A', 'B', 'C'], icc).values()];
    const sum = (pick: (a: (typeof aggregates)[number]) => number) => aggregates.reduce((total, a) => total + pick(a), 0);
    expect(sum((a) => a.runsFor)).toBe(sum((a) => a.runsAgainst));
    expect(sum((a) => a.oversFor)).toBeCloseTo(sum((a) => a.oversAgainst), 9);
  });
});

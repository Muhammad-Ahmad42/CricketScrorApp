/** @jest-environment node */
import {
  draftsFromRoundRobin,
  fixturesForPoolMove,
  manualFixture,
  roundRobin,
  scheduleSequential,
  validateFixtureDrafts,
  type RoundRobinRound,
} from '@/domain/tournament/fixtures';
import type { FixtureDraft, FixtureSide } from '@/domain/types';
import { deepFreeze, draft, draftDefaults, fixture, idSequence, label, seededCases, slot, team, teams } from './structure/support';

function letters(count: number): readonly FixtureSide[] {
  return Array.from({ length: count }, (_, index) => team(String.fromCharCode(65 + index)));
}

function describeRounds(rounds: readonly RoundRobinRound[]): readonly string[] {
  return rounds.map((round) => {
    const games = round.pairings.map((p) => `${label(p.sideA)}v${label(p.sideB)}`).join(' ');
    return round.bye ? `${games} bye ${label(round.bye)}` : games;
  });
}

function roundRobinViolations(entrants: readonly FixtureSide[], legs: number): readonly string[] {
  const n = entrants.length;
  const rounds = roundRobin(entrants, legs);
  const perLeg = n % 2 === 0 ? n - 1 : n;
  const problems: string[] = [];
  const keys = entrants.map(label);
  if (rounds.length !== perLeg * legs) {
    problems.push(`n=${n}: ${rounds.length} rounds, expected ${perLeg * legs}`);
  }
  rounds.forEach((round, index) => {
    const leg = Math.floor(index / perLeg) + 1;
    if (round.round !== index + 1 || round.leg !== leg) {
      problems.push(`n=${n}: round ${index} numbered ${round.round}/${round.leg}`);
    }
    if (round.pairings.some((p) => p.round !== round.round || p.leg !== round.leg)) {
      problems.push(`n=${n}: pairing numbering differs in round ${round.round}`);
    }
    const seen = round.pairings.flatMap((p) => [label(p.sideA), label(p.sideB)]);
    if (new Set(seen).size !== seen.length) {
      problems.push(`n=${n}: an entrant plays twice in round ${round.round}`);
    }
    if (n % 2 === 1) {
      if (round.bye === null || seen.includes(label(round.bye)) || seen.length !== n - 1) {
        problems.push(`n=${n}: bad bye in round ${round.round}`);
      }
    } else {
      if (round.bye !== null || seen.length !== n) {
        problems.push(`n=${n}: unexpected bye in round ${round.round}`);
      }
      if (!seen.includes(keys[0])) {
        problems.push(`n=${n}: entrant 0 missing from round ${round.round}`);
      }
    }
  });
  const legOne = rounds.slice(0, perLeg);
  for (let leg = 1; leg <= legs; leg += 1) {
    const legRounds = rounds.slice((leg - 1) * perLeg, leg * perLeg);
    const pairs = legRounds.flatMap((round) => round.pairings);
    const unordered = new Set(pairs.map((p) => [label(p.sideA), label(p.sideB)].sort().join('|')));
    if (pairs.length !== (n * (n - 1)) / 2 || unordered.size !== pairs.length) {
      problems.push(`n=${n}: leg ${leg} has ${pairs.length} pairings, ${unordered.size} distinct`);
    }
    const homeCounts = new Map(keys.map((key) => [key, 0]));
    pairs.forEach((p) => homeCounts.set(label(p.sideA), (homeCounts.get(label(p.sideA)) ?? 0) + 1));
    const low = Math.floor((n - 1) / 2);
    const high = Math.ceil((n - 1) / 2);
    for (const [key, count] of homeCounts) {
      if (count < low || count > high) {
        problems.push(`n=${n}: ${key} is side A ${count} times in leg ${leg}`);
      }
    }
    if (n % 2 === 1) {
      const byes = legRounds.map((round) => (round.bye ? label(round.bye) : ''));
      if (new Set(byes).size !== n) {
        problems.push(`n=${n}: byes do not rotate through every entrant in leg ${leg}`);
      }
    }
    legRounds.forEach((round, index) => {
      const reference = legOne[index].pairings;
      const mirrored = leg % 2 === 0;
      const matches = round.pairings.every((p, i) =>
        mirrored
          ? label(p.sideA) === label(reference[i].sideB) && label(p.sideB) === label(reference[i].sideA)
          : label(p.sideA) === label(reference[i].sideA) && label(p.sideB) === label(reference[i].sideB),
      );
      if (!matches || round.pairings.length !== reference.length) {
        problems.push(`n=${n}: leg ${leg} round ${index + 1} does not mirror leg 1`);
      }
    });
  }
  return problems;
}

describe('roundRobin golden schedules', () => {
  it('4 entrants', () => {
    expect(describeRounds(roundRobin(letters(4), 1))).toEqual(['AvD CvB', 'CvA BvD', 'AvB DvC']);
  });

  it('5 entrants with one bye per round', () => {
    expect(describeRounds(roundRobin(letters(5), 1))).toEqual([
      'DvA BvC bye E',
      'CvE AvB bye D',
      'BvD EvA bye C',
      'AvC DvE bye B',
      'EvB CvD bye A',
    ]);
  });

  it('6 entrants', () => {
    expect(describeRounds(roundRobin(letters(6), 1))).toEqual([
      'AvF EvB CvD',
      'EvA DvF BvC',
      'AvD CvE FvB',
      'CvA BvD EvF',
      'AvB FvC DvE',
    ]);
  });

  it('2 entrants: one round, one match', () => {
    expect(describeRounds(roundRobin(letters(2), 1))).toEqual(['AvB']);
  });

  it('3 entrants: three rounds, each with a bye', () => {
    const rounds = roundRobin(letters(3), 1);
    expect(rounds).toHaveLength(3);
    expect(rounds.map((r) => r.pairings.length)).toEqual([1, 1, 1]);
  });
});

describe('roundRobin properties', () => {
  const sizes = Array.from({ length: 127 }, (_, index) => index + 2);

  it('U-FIX-01..06 hold for every n from 2 to 128 in a single round robin', () => {
    const problems = sizes.flatMap((n) => roundRobinViolations(teams(n), 1));
    expect(problems).toEqual([]);
  });

  it('U-FIX-01..06 hold for every n from 2 to 128 in a double round robin', () => {
    const problems = sizes.flatMap((n) => roundRobinViolations(teams(n), 2));
    expect(problems).toEqual([]);
  });

  it('U-FIX-02 128 entrants: 8128 pairings in 127 rounds per leg', () => {
    const rounds = roundRobin(teams(128), 1);
    expect(rounds).toHaveLength(127);
    expect(rounds.reduce((sum, round) => sum + round.pairings.length, 0)).toBe(8128);
  });

  it('U-FIX-04 leg 2 continues the round numbering', () => {
    const rounds = roundRobin(teams(4), 2);
    expect(rounds.map((r) => [r.round, r.leg])).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 2],
      [5, 2],
      [6, 2],
    ]);
    expect(roundRobin(teams(5), 2)[5].round).toBe(6);
  });

  it('U-FIX-07 three legs: each pair meets three times with sides alternating', () => {
    for (const n of [2, 3, 4, 5, 8, 9, 17]) {
      expect(roundRobinViolations(teams(n), 3)).toEqual([]);
      const rounds = roundRobin(teams(n), 3);
      const meetings = new Map<string, string[]>();
      rounds.flatMap((r) => r.pairings).forEach((p) => {
        const key = [label(p.sideA), label(p.sideB)].sort().join('|');
        meetings.set(key, [...(meetings.get(key) ?? []), label(p.sideA)]);
      });
      expect([...meetings.values()].every((homes) => homes.length === 3 && homes[0] !== homes[1] && homes[0] === homes[2])).toBe(true);
    }
  });

  it('U-FIX-08 slot entrants work identically', () => {
    const slots = Array.from({ length: 7 }, (_, index) => slot(`S${index}`));
    expect(roundRobinViolations(slots, 2)).toEqual([]);
    expect(roundRobin(slots, 1)[0].pairings[0].sideA.kind).toBe('slot');
  });

  it('respects input order: entrant 0 is the fixed point for even n', () => {
    const entrants = [team('Z'), team('Y'), team('X'), team('W')];
    expect(roundRobin(entrants, 1).every((round) => round.pairings.some((p) => label(p.sideA) === 'Z' || label(p.sideB) === 'Z'))).toBe(true);
    expect(label(roundRobin(entrants, 1)[0].pairings[0].sideA)).toBe('Z');
  });

  it('U-FIX-09 fewer than 2 entrants or fewer than 1 leg throws', () => {
    expect(() => roundRobin(teams(1), 1)).toThrow();
    expect(() => roundRobin([], 1)).toThrow();
    expect(() => roundRobin(teams(4), 0)).toThrow();
    expect(() => roundRobin(teams(4), 1.5)).toThrow();
  });

  it('does not mutate frozen entrants and is deterministic', () => {
    const entrants = deepFreeze(teams(9));
    expect(roundRobin(entrants, 2)).toEqual(roundRobin(entrants, 2));
  });

  it('performance: 128-entrant double round robin with drafts stays within 3x the 100 ms budget', () => {
    const started = performance.now();
    const rounds = roundRobin(teams(128), 2);
    const drafts = draftsFromRoundRobin(rounds, draftDefaults(), idSequence());
    const elapsed = performance.now() - started;
    console.log(`round robin 128 x 2 legs + ${drafts.length} drafts: ${elapsed.toFixed(1)} ms`);
    expect(drafts).toHaveLength(16256);
    expect(elapsed).toBeLessThan(300);
  });
});

describe('draftsFromRoundRobin', () => {
  it('U-FIX-10 numbers drafts from startMatchNumber in round order with generator ids', () => {
    const rounds = roundRobin(letters(4), 1);
    const drafts = draftsFromRoundRobin(rounds, draftDefaults({ startMatchNumber: 13, poolId: 'pA', formatId: 'T10', venueId: 'v1' }), idSequence('fx'));
    expect(drafts.map((d) => d.matchNumber)).toEqual([13, 14, 15, 16, 17, 18]);
    expect(drafts.map((d) => d.id)).toEqual(['fx-1', 'fx-2', 'fx-3', 'fx-4', 'fx-5', 'fx-6']);
    expect(drafts.map((d) => d.round)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(drafts.every((d) => d.leg === 1 && d.status === 'scheduled' && d.bracket === null && !d.isFinal)).toBe(true);
    expect(drafts.every((d) => d.poolId === 'pA' && d.formatId === 'T10' && d.venueId === 'v1' && d.stageId === 'stage-1')).toBe(true);
    expect(drafts.every((d) => d.scheduledDate === null && d.scheduledTime === null && d.label === null && d.notes === null)).toBe(true);
    expect(`${label(drafts[0].sideA)}v${label(drafts[0].sideB)}`).toBe('AvD');
  });

  it('orders by round even when rounds are given out of order', () => {
    const rounds = roundRobin(letters(4), 2);
    const shuffled = [...rounds].reverse();
    expect(draftsFromRoundRobin(shuffled, draftDefaults(), idSequence())).toEqual(draftsFromRoundRobin(rounds, draftDefaults(), idSequence()));
  });

  it('fixture count per pool = legs x n(n-1)/2 (the §92 tournament has 12 group fixtures)', () => {
    const poolA = draftsFromRoundRobin(roundRobin(teams(4, 'A'), 1), draftDefaults({ poolId: 'pA' }), idSequence('a'));
    const poolB = draftsFromRoundRobin(roundRobin(teams(4, 'B'), 1), draftDefaults({ poolId: 'pB', startMatchNumber: 7 }), idSequence('b'));
    expect(poolA.length + poolB.length).toBe(12);
    expect(poolB.map((d) => d.matchNumber)).toEqual([7, 8, 9, 10, 11, 12]);
  });
});

describe('manualFixture', () => {
  it('U-FIX-11 keeps the label, has no round or leg and falls back to defaults', () => {
    const result = manualFixture(
      {
        sideA: team('LIO'),
        sideB: team('TIG'),
        scheduledDate: '2026-05-02',
        scheduledTime: '14:00',
        venueId: null,
        formatId: null,
        matchRules: null,
        notes: 'Floodlit',
        label: 'Eliminator',
      },
      draftDefaults({ startMatchNumber: 25, venueId: 'v9', formatId: 'T20' }),
      idSequence('m'),
    );
    expect(result).toEqual({
      id: 'm-1',
      tournamentId: 'tour-1',
      stageId: 'stage-1',
      poolId: null,
      matchNumber: 25,
      label: 'Eliminator',
      round: null,
      leg: null,
      bracket: null,
      isFinal: false,
      sideA: team('LIO'),
      sideB: team('TIG'),
      scheduledDate: '2026-05-02',
      scheduledTime: '14:00',
      venueId: 'v9',
      status: 'scheduled',
      formatId: 'T20',
      matchRules: null,
      notes: 'Floodlit',
    });
  });
});

describe('validateFixtureDrafts', () => {
  const poolMembers = { pA: [team('A1'), team('A2'), team('A3'), team('A4')], pC: [team('C1'), team('C2'), team('C3')] };
  const tournamentSides = [...poolMembers.pA, ...poolMembers.pC, team('X')];
  const context = deepFreeze({
    poolMembers,
    tournamentSides,
    legsByPool: new Map([['pC', 2]]),
    defaultLegs: 1,
    startDate: '2026-05-01',
    endDate: '2026-05-31',
  });

  function codes(drafts: readonly FixtureDraft[]): readonly string[] {
    return validateFixtureDrafts(drafts, context).map((issue) => `${issue.code}:${issue.severity}:${issue.fixtureId}`);
  }

  it('valid drafts raise nothing', () => {
    const drafts = draftsFromRoundRobin(roundRobin(poolMembers.pA, 1), draftDefaults({ poolId: 'pA' }), idSequence());
    expect(validateFixtureDrafts(drafts, context)).toEqual([]);
  });

  it('U-FIX-12 same side twice is an error', () => {
    const issues = validateFixtureDrafts([draft({ id: 'f1', matchNumber: 4, poolId: 'pA', sideA: team('A1'), sideB: team('A1') })], context);
    expect(issues).toEqual([
      { code: 'SAME_SIDE_TWICE', severity: 'error', fixtureId: 'f1', message: "Match 4: a team can't play against itself." },
    ]);
  });

  it('U-FIX-13 side not in pool / not in tournament are errors', () => {
    expect(codes([draft({ id: 'f1', poolId: 'pA', sideA: team('A1'), sideB: team('C1') })])).toEqual(['SIDE_NOT_IN_POOL:error:f1']);
    expect(codes([draft({ id: 'f2', poolId: 'pA', sideA: team('A1'), sideB: team('Q') })])).toEqual(['SIDE_NOT_IN_TOURNAMENT:error:f2']);
    expect(codes([draft({ id: 'f3', poolId: null, sideA: team('A1'), sideB: team('X') })])).toEqual([]);
    expect(codes([draft({ id: 'f4', poolId: 'unknown', sideA: team('A1'), sideB: team('A2') })])).toEqual([
      'SIDE_NOT_IN_POOL:error:f4',
      'SIDE_NOT_IN_POOL:error:f4',
    ]);
  });

  it('U-FIX-14 the same pair twice in a single round robin pool warns', () => {
    const drafts = [
      draft({ id: 'f1', poolId: 'pA', sideA: team('A1'), sideB: team('A2') }),
      draft({ id: 'f2', poolId: 'pA', sideA: team('A2'), sideB: team('A1') }),
    ];
    expect(codes(drafts)).toEqual(['DUPLICATE_ENCOUNTER:warning:f2']);
  });

  it('U-FIX-15 a double round robin 3-team pool beside single round robin pools raises no duplicate warning', () => {
    const poolC = draftsFromRoundRobin(roundRobin(poolMembers.pC, 2), draftDefaults({ poolId: 'pC' }), idSequence('c'));
    const poolA = draftsFromRoundRobin(roundRobin(poolMembers.pA, 1), draftDefaults({ poolId: 'pA' }), idSequence('a'));
    expect(poolC).toHaveLength(6);
    expect(validateFixtureDrafts([...poolA, ...poolC], context)).toEqual([]);
    const third = draft({ id: 'c-extra', poolId: 'pC', sideA: team('C1'), sideB: team('C2') });
    expect(codes([...poolC, third])).toEqual(['DUPLICATE_ENCOUNTER:warning:c-extra']);
  });

  it('U-FIX-16 a side booked twice at the same date and time warns', () => {
    const drafts = [
      draft({ id: 'f1', poolId: 'pA', sideA: team('A1'), sideB: team('A2'), scheduledDate: '2026-05-03', scheduledTime: '09:00' }),
      draft({ id: 'f2', poolId: 'pA', sideA: team('A3'), sideB: team('A1'), scheduledDate: '2026-05-03', scheduledTime: '09:00' }),
      draft({ id: 'f3', poolId: 'pA', sideA: team('A1'), sideB: team('A4'), scheduledDate: '2026-05-03', scheduledTime: '13:00' }),
    ];
    const issues = validateFixtureDrafts(drafts, context);
    expect(issues.map((i) => `${i.code}:${i.fixtureId}`)).toEqual(['TEAM_DOUBLE_BOOKED:f2']);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toBe('Match 1: a team already has a match on 2026-05-03 at 09:00.');
  });

  it('U-FIX-17 dates outside the tournament window warn', () => {
    const drafts = [
      draft({ id: 'early', poolId: 'pA', sideA: team('A1'), sideB: team('A2'), scheduledDate: '2026-04-30' }),
      draft({ id: 'late', poolId: 'pA', sideA: team('A3'), sideB: team('A4'), scheduledDate: '2026-06-01' }),
      draft({ id: 'ok', poolId: 'pA', sideA: team('A1'), sideB: team('A3'), scheduledDate: '2026-05-31' }),
    ];
    expect(codes(drafts)).toEqual(['OUTSIDE_TOURNAMENT_DATES:warning:early', 'OUTSIDE_TOURNAMENT_DATES:warning:late']);
    expect(validateFixtureDrafts(drafts, { ...context, startDate: null, endDate: null })).toEqual([]);
  });
});

describe('scheduleSequential', () => {
  it('U-FIX-18 two matches a day, skipping the rest day', () => {
    const drafts = deepFreeze(draftsFromRoundRobin(roundRobin(letters(4), 1), draftDefaults(), idSequence()));
    const scheduled = scheduleSequential(drafts, {
      startDate: '2026-05-01',
      matchesPerDay: 2,
      times: ['09:00', '13:00'],
      restDates: ['2026-05-02'],
    });
    expect(scheduled.map((d) => `${d.scheduledDate} ${d.scheduledTime}`)).toEqual([
      '2026-05-01 09:00',
      '2026-05-01 13:00',
      '2026-05-03 09:00',
      '2026-05-03 13:00',
      '2026-05-04 09:00',
      '2026-05-04 13:00',
    ]);
    expect(scheduled.map((d) => d.id)).toEqual(drafts.map((d) => d.id));
    expect(drafts.every((d) => d.scheduledDate === null)).toBe(true);
  });

  it('moves a draft to the next day when a side already plays that day', () => {
    const drafts = [
      draft({ id: 'f1', round: 1, matchNumber: 1, sideA: team('A'), sideB: team('B') }),
      draft({ id: 'f2', round: 1, matchNumber: 2, sideA: team('A'), sideB: team('C') }),
      draft({ id: 'f3', round: 1, matchNumber: 3, sideA: team('D'), sideB: team('E') }),
    ];
    const scheduled = scheduleSequential(drafts, { startDate: '2026-05-01', matchesPerDay: 3, times: ['10:00'] });
    expect(scheduled.map((d) => d.scheduledDate)).toEqual(['2026-05-01', '2026-05-02', '2026-05-01']);
  });

  it('crosses month, year and leap-day boundaries', () => {
    const drafts = draftsFromRoundRobin(roundRobin(letters(2), 3), draftDefaults(), idSequence());
    expect(scheduleSequential(drafts, { startDate: '2028-02-28', matchesPerDay: 1, times: ['09:00'] }).map((d) => d.scheduledDate)).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
    expect(scheduleSequential(drafts, { startDate: '2026-12-31', matchesPerDay: 1, times: [] }).map((d) => [d.scheduledDate, d.scheduledTime])).toEqual([
      ['2026-12-31', null],
      ['2027-01-01', null],
      ['2027-01-02', null],
    ]);
    expect(scheduleSequential(drafts, { startDate: '2027-02-28', matchesPerDay: 1, times: ['09:00'] })[1].scheduledDate).toBe('2027-03-01');
  });

  it('never double-books a side on one day, respects the daily limit and rest days (seeded property)', () => {
    const sizes = seededCases(314, 25, 13, 2);
    const perDay = seededCases(315, 25, 5, 1);
    const problems = sizes.flatMap((n, index) => {
      const drafts = draftsFromRoundRobin(roundRobin(teams(n), 1 + (index % 2)), draftDefaults(), idSequence());
      const rest = ['2026-05-03', '2026-05-10'];
      const scheduled = scheduleSequential(drafts, { startDate: '2026-05-01', matchesPerDay: perDay[index], times: ['09:00', '14:00'], restDates: rest });
      const byDay = new Map<string, string[]>();
      scheduled.forEach((d) => {
        byDay.set(d.scheduledDate ?? 'none', [...(byDay.get(d.scheduledDate ?? 'none') ?? []), label(d.sideA), label(d.sideB)]);
      });
      return [...byDay.entries()].flatMap(([day, sides]) => {
        const found: string[] = [];
        if (new Set(sides).size !== sides.length) {
          found.push(`seed case ${index}: double booking on ${day}`);
        }
        if (sides.length / 2 > perDay[index]) {
          found.push(`seed case ${index}: too many matches on ${day}`);
        }
        if (rest.includes(day) || day < '2026-05-01') {
          found.push(`seed case ${index}: scheduled on ${day}`);
        }
        return found;
      });
    });
    expect(problems).toEqual([]);
  });

  it('refuses a non-positive daily limit and an invalid start date', () => {
    const drafts = draftsFromRoundRobin(roundRobin(letters(2), 1), draftDefaults(), idSequence());
    expect(() => scheduleSequential(drafts, { startDate: '2026-05-01', matchesPerDay: 0, times: [] })).toThrow();
    expect(() => scheduleSequential(drafts, { startDate: '2026-02-30', matchesPerDay: 1, times: [] })).toThrow();
  });
});

describe('fixturesForPoolMove', () => {
  const poolAFixtures = deepFreeze([
    fixture({ id: 'hawEag', poolId: 'pA', sideA: team('HAW'), sideB: team('EAG'), matchId: 'm1', status: 'completed' }),
    fixture({ id: 'hawLio', poolId: 'pA', sideA: team('HAW'), sideB: team('LIO') }),
    fixture({ id: 'tigHaw', poolId: 'pA', sideA: team('TIG'), sideB: team('HAW'), status: 'postponed' }),
    fixture({ id: 'lioTig', poolId: 'pA', sideA: team('LIO'), sideB: team('TIG') }),
    fixture({ id: 'otherPool', poolId: 'pB', sideA: team('HAW'), sideB: team('QQQ') }),
  ]);

  function pairs(drafts: readonly FixtureDraft[]): readonly string[] {
    return drafts.map((d) => `#${d.matchNumber} ${label(d.sideA)} v ${label(d.sideB)} (leg ${d.leg})`);
  }

  it('U-FIX-19 removes only unplayed source-pool fixtures and pairs the member with every target member', () => {
    const result = fixturesForPoolMove(
      {
        member: team('HAW'),
        fromPoolId: 'pA',
        fixtures: poolAFixtures,
        targetMembers: [team('X'), team('Y')],
        legs: 1,
        defaults: draftDefaults({ poolId: 'pC', startMatchNumber: 40 }),
      },
      idSequence('mv'),
    );
    expect(result.removeFixtureIds).toEqual(['hawLio', 'tigHaw']);
    expect(pairs(result.addFixtures)).toEqual(['#40 HAW v X (leg 1)', '#41 Y v HAW (leg 1)']);
    expect(result.addFixtures.every((d) => d.poolId === 'pC' && d.status === 'scheduled' && d.round === null)).toBe(true);
    expect(result.addFixtures.map((d) => d.id)).toEqual(['mv-1', 'mv-2']);
  });

  it('U-FIX-20 two legs create four drafts with sides alternating per leg', () => {
    const result = fixturesForPoolMove(
      {
        member: team('HAW'),
        fromPoolId: 'pA',
        fixtures: poolAFixtures,
        targetMembers: [team('X'), team('Y')],
        legs: 2,
        defaults: draftDefaults({ poolId: 'pC', startMatchNumber: 40 }),
      },
      idSequence(),
    );
    expect(pairs(result.addFixtures)).toEqual(['#40 HAW v X (leg 1)', '#41 Y v HAW (leg 1)', '#42 X v HAW (leg 2)', '#43 HAW v Y (leg 2)']);
  });

  it('documented example: Lions move from Pool A to Pool C after playing Tigers', () => {
    const fixtures = [
      fixture({ id: 'lioTig', poolId: 'pA', sideA: team('Lions'), sideB: team('Tigers'), matchId: 'm7', status: 'completed' }),
      fixture({ id: 'lioEag', poolId: 'pA', sideA: team('Lions'), sideB: team('Eagles') }),
      fixture({ id: 'hawLio', poolId: 'pA', sideA: team('Hawks'), sideB: team('Lions') }),
      fixture({ id: 'tigEag', poolId: 'pA', sideA: team('Tigers'), sideB: team('Eagles') }),
    ];
    const result = fixturesForPoolMove(
      {
        member: team('Lions'),
        fromPoolId: 'pA',
        fixtures,
        targetMembers: [team('Kings'), team('Royals'), team('Titans')],
        legs: 1,
        defaults: draftDefaults({ poolId: 'pC', startMatchNumber: 25 }),
      },
      idSequence(),
    );
    expect(result.removeFixtureIds).toEqual(['lioEag', 'hawLio']);
    expect(pairs(result.addFixtures)).toEqual(['#25 Lions v Kings (leg 1)', '#26 Royals v Lions (leg 1)', '#27 Lions v Titans (leg 1)']);
  });

  it('works for slot members and skips the member itself in the target list', () => {
    const result = fixturesForPoolMove(
      {
        member: slot('A1'),
        fromPoolId: 'g1',
        fixtures: [fixture({ id: 's1', poolId: 'g1', sideA: slot('A1'), sideB: slot('B2') })],
        targetMembers: [slot('B1'), slot('A1')],
        legs: 1,
        defaults: draftDefaults({ poolId: 'g2' }),
      },
      idSequence(),
    );
    expect(result.removeFixtureIds).toEqual(['s1']);
    expect(pairs(result.addFixtures)).toEqual(['#1 A1 v B1 (leg 1)']);
  });
});

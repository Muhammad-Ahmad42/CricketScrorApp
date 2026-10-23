/** @jest-environment node */
import {
  assignRandom,
  assignSeeded,
  assignSlotsToPools,
  distributePoolSizes,
  moveMember,
  poolName,
  poolWarnings,
  replaceMember,
  swapMembers,
  type PoolAssignment,
} from '@/domain/tournament/pools';
import type { FixtureSide } from '@/domain/types';
import { deepFreeze, label, slot, team, teams } from './structure/support';

const POOL_IDS = ['pA', 'pB', 'pC', 'pD'] as const;

function labels(assignment: PoolAssignment): readonly (readonly string[])[] {
  return assignment.pools.map((p) => p.members.map(label));
}

function seededTeams(count: number): readonly { teamId: string; seed: number | null; name: string }[] {
  return Array.from({ length: count }, (_, index) => ({ teamId: `s${index + 1}`, seed: index + 1, name: `Seed ${index + 1}` }));
}

const MIXED: PoolAssignment = deepFreeze({
  seed: null,
  pools: [
    { poolId: 'pA', name: 'Pool A', members: [team('T01'), team('T02'), team('T03')] },
    { poolId: 'pB', name: 'Pool B', members: [team('T04'), team('T05'), slot('S5')] },
    { poolId: 'pC', name: 'Pool C', members: [team('T06'), team('T07')] },
  ],
});

describe('poolName', () => {
  it.each([
    [0, 'Pool A'],
    [1, 'Pool B'],
    [25, 'Pool Z'],
    [26, 'Pool AA'],
    [27, 'Pool AB'],
    [51, 'Pool AZ'],
    [52, 'Pool BA'],
    [701, 'Pool ZZ'],
    [702, 'Pool AAA'],
  ])('U-POOL-01 poolName(%p) = %p', (index, expected) => {
    expect(poolName(index)).toBe(expected);
  });

  it('refuses negative indexes', () => {
    expect(() => poolName(-1)).toThrow();
  });
});

describe('distributePoolSizes', () => {
  it.each<[number, number, readonly number[]]>([
    [10, 3, [4, 3, 3]],
    [16, 4, [4, 4, 4, 4]],
    [9, 2, [5, 4]],
    [7, 3, [3, 2, 2]],
    [11, 4, [3, 3, 3, 2]],
    [5, 5, [1, 1, 1, 1, 1]],
    [13, 4, [4, 3, 3, 3]],
    [128, 16, Array.from({ length: 16 }, () => 8)],
  ])('U-POOL-02 (%p, %p) -> %p', (teamCount, poolCount, expected) => {
    expect(distributePoolSizes(teamCount, poolCount)).toEqual(expected);
  });

  it('refuses zero pools', () => {
    expect(() => distributePoolSizes(8, 0)).toThrow();
  });
});

describe('assignRandom', () => {
  const sixteen = deepFreeze(teams(16));

  it('U-POOL-03 16 teams into 4 pools of 4 with the documented golden draw for seed 847291', () => {
    const result = assignRandom(sixteen, { poolCount: 4 }, POOL_IDS, 847291);
    expect(result.seed).toBe(847291);
    expect(result.pools.map((p) => p.poolId)).toEqual(POOL_IDS);
    expect(result.pools.map((p) => p.name)).toEqual(['Pool A', 'Pool B', 'Pool C', 'Pool D']);
    expect(labels(result)).toEqual([
      ['T02', 'T12', 'T08', 'T04'],
      ['T09', 'T01', 'T11', 'T03'],
      ['T14', 'T15', 'T16', 'T05'],
      ['T13', 'T06', 'T10', 'T07'],
    ]);
    expect(labels(result).flat().sort()).toEqual(sixteen.map(label).sort());
  });

  it('U-POOL-04 is deterministic for the same seed', () => {
    expect(assignRandom(sixteen, { poolCount: 4 }, POOL_IDS, 847291)).toEqual(assignRandom(sixteen, { poolCount: 4 }, POOL_IDS, 847291));
  });

  it('U-POOL-05 a different seed gives a different draw', () => {
    expect(labels(assignRandom(sixteen, { poolCount: 4 }, POOL_IDS, 847292))).not.toEqual(
      labels(assignRandom(sixteen, { poolCount: 4 }, POOL_IDS, 847291)),
    );
  });

  it('U-POOL-06 explicit uneven sizes are filled in pool order', () => {
    const result = assignRandom(teams(10), { sizes: [4, 3, 3] }, ['pA', 'pB', 'pC'], 5);
    expect(result.pools.map((p) => p.members.length)).toEqual([4, 3, 3]);
  });

  it('near-even split for 10 teams in 3 pools', () => {
    const result = assignRandom(teams(10), { poolCount: 3 }, ['pA', 'pB', 'pC'], 5);
    expect(result.pools.map((p) => p.members.length)).toEqual([4, 3, 3]);
  });

  it('U-POOL-07 sizes that do not add up to the member count throw', () => {
    expect(() => assignRandom(teams(10), { sizes: [4, 4, 3] }, ['pA', 'pB', 'pC'], 5)).toThrow();
  });

  it('pool id count must match the pool count', () => {
    expect(() => assignRandom(teams(8), { poolCount: 2 }, ['pA'], 5)).toThrow();
  });

  it('works for slot members too', () => {
    const slots = [slot('S1'), slot('S2'), slot('S3'), slot('S4')];
    const result = assignRandom(slots, { poolCount: 2 }, ['g1', 'g2'], 11);
    expect(labels(result).flat().sort()).toEqual(['S1', 'S2', 'S3', 'S4']);
  });

  it('assigns 128 teams into 16 pools of 8', () => {
    const result = assignRandom(teams(128), { poolCount: 16 }, Array.from({ length: 16 }, (_, i) => `p${i}`), 3);
    expect(result.pools.every((p) => p.members.length === 8)).toBe(true);
    expect(new Set(labels(result).flat()).size).toBe(128);
  });
});

describe('assignSeeded', () => {
  it('U-POOL-08 snake-deals 8 seeded teams into 4 pools', () => {
    const result = assignSeeded(seededTeams(8), POOL_IDS);
    expect(result.seed).toBeNull();
    expect(labels(result)).toEqual([
      ['s1', 's8'],
      ['s2', 's7'],
      ['s3', 's6'],
      ['s4', 's5'],
    ]);
  });

  it('U-POOL-09 unseeded teams come last, ordered by name', () => {
    const input = deepFreeze([
      { teamId: 'zulu', seed: null, name: 'Zulu' },
      ...[...seededTeams(10)].reverse(),
      { teamId: 'alpha', seed: null, name: 'Alpha' },
    ]);
    expect(labels(assignSeeded(input, POOL_IDS))).toEqual([
      ['s1', 's8', 's9'],
      ['s2', 's7', 's10'],
      ['s3', 's6', 'alpha'],
      ['s4', 's5', 'zulu'],
    ]);
  });

  it('documented examples: 8 teams into 2 pools and 16 teams into 4 pools', () => {
    expect(labels(assignSeeded(seededTeams(8), ['pA', 'pB']))).toEqual([
      ['s1', 's4', 's5', 's8'],
      ['s2', 's3', 's6', 's7'],
    ]);
    expect(labels(assignSeeded(seededTeams(16), POOL_IDS))).toEqual([
      ['s1', 's8', 's9', 's16'],
      ['s2', 's7', 's10', 's15'],
      ['s3', 's6', 's11', 's14'],
      ['s4', 's5', 's12', 's13'],
    ]);
  });
});

describe('assignSlotsToPools', () => {
  const qualifiers = deepFreeze(['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'C2', 'D2'].map((name, index) => ({ slotId: name, index })));

  it('U-POOL-10 snake deal into two groups', () => {
    const result = assignSlotsToPools(qualifiers, ['g1', 'g2'], { kind: 'snake' });
    expect(labels(result)).toEqual([
      ['A1', 'D1', 'A2', 'D2'],
      ['B1', 'C1', 'B2', 'C2'],
    ]);
    expect(result.pools.every((p) => p.members.every((m) => m.kind === 'slot'))).toBe(true);
  });

  it('snake deal ignores input order and uses slot indexes', () => {
    const shuffled = [...qualifiers].reverse();
    expect(labels(assignSlotsToPools(shuffled, ['g1', 'g2'], { kind: 'snake' }))).toEqual(
      labels(assignSlotsToPools(qualifiers, ['g1', 'g2'], { kind: 'snake' })),
    );
  });

  it('snake deal into four groups spreads pool winners', () => {
    expect(labels(assignSlotsToPools(qualifiers, POOL_IDS, { kind: 'snake' }))).toEqual([
      ['A1', 'D2'],
      ['B1', 'C2'],
      ['C1', 'B2'],
      ['D1', 'A2'],
    ]);
  });

  it('U-POOL-11 fixed order builds the Super 8 groups from A1/B2/C1/D2', () => {
    const result = assignSlotsToPools(qualifiers, ['g1', 'g2'], {
      kind: 'fixed_order',
      slotIndexesPerPool: [
        [0, 5, 2, 7],
        [1, 4, 3, 6],
      ],
    });
    expect(labels(result)).toEqual([
      ['A1', 'B2', 'C1', 'D2'],
      ['B1', 'A2', 'D1', 'C2'],
    ]);
  });

  it('fixed order refuses unknown slot indexes and mismatched pool counts', () => {
    expect(() => assignSlotsToPools(qualifiers, ['g1'], { kind: 'fixed_order', slotIndexesPerPool: [[0], [1]] })).toThrow();
    expect(() => assignSlotsToPools(qualifiers, ['g1'], { kind: 'fixed_order', slotIndexesPerPool: [[42]] })).toThrow();
  });
});

describe('transfers', () => {
  it('U-POOL-12 move appends to the target and keeps everyone else in place', () => {
    const result = moveMember(MIXED, team('T02'), 'pC');
    expect(labels(result)).toEqual([
      ['T01', 'T03'],
      ['T04', 'T05', 'S5'],
      ['T06', 'T07', 'T02'],
    ]);
  });

  it('move of a slot member works the same way', () => {
    expect(labels(moveMember(MIXED, slot('S5'), 'pA'))).toEqual([
      ['T01', 'T02', 'T03', 'S5'],
      ['T04', 'T05'],
      ['T06', 'T07'],
    ]);
  });

  it('move into the current pool is a no-op and an unknown pool throws', () => {
    expect(moveMember(MIXED, team('T01'), 'pA')).toBe(MIXED);
    expect(() => moveMember(MIXED, team('T01'), 'nope')).toThrow();
  });

  it('move of an unassigned member places it in the target pool', () => {
    expect(labels(moveMember(MIXED, team('T99'), 'pC'))[2]).toEqual(['T06', 'T07', 'T99']);
  });

  it('U-POOL-13 swap a team with a slot across pools keeps both positions', () => {
    const result = swapMembers(MIXED, team('T01'), slot('S5'));
    expect(labels(result)).toEqual([
      ['S5', 'T02', 'T03'],
      ['T04', 'T05', 'T01'],
      ['T06', 'T07'],
    ]);
  });

  it('swap within one pool exchanges positions', () => {
    expect(labels(swapMembers(MIXED, team('T01'), team('T03')))[0]).toEqual(['T03', 'T02', 'T01']);
  });

  it('swap with an unassigned member throws', () => {
    expect(() => swapMembers(MIXED, team('T01'), team('T99'))).toThrow();
  });

  it('U-POOL-14 replace puts the newcomer in the same position', () => {
    const result = replaceMember(MIXED, team('T03'), team('T17'));
    expect(labels(result)).toEqual([
      ['T01', 'T02', 'T17'],
      ['T04', 'T05', 'S5'],
      ['T06', 'T07'],
    ]);
  });

  it('U-POOL-14 replacing with an already assigned member throws', () => {
    expect(() => replaceMember(MIXED, team('T03'), team('T04'))).toThrow();
  });

  it('replace works for slot members', () => {
    expect(labels(replaceMember(MIXED, slot('S5'), slot('S9')))[1]).toEqual(['T04', 'T05', 'S9']);
  });

  it('U-POOL-18 transfers never mutate their frozen input', () => {
    const before = JSON.stringify(MIXED);
    moveMember(MIXED, team('T01'), 'pB');
    swapMembers(MIXED, team('T01'), team('T06'));
    replaceMember(MIXED, team('T01'), team('T30'));
    expect(JSON.stringify(MIXED)).toBe(before);
    expect(MIXED.seed).toBeNull();
  });
});

describe('poolWarnings', () => {
  function assignment(pools: readonly (readonly FixtureSide[])[]): PoolAssignment {
    return deepFreeze({
      seed: null,
      pools: pools.map((members, index) => ({ poolId: `p${index}`, name: poolName(index), members })),
    });
  }

  it('U-POOL-15 uneven pools warn with the §32 message', () => {
    const all = teams(10);
    const warnings = poolWarnings(assignment([all.slice(0, 4), all.slice(4, 7), all.slice(7)]), all);
    expect(warnings).toEqual([
      {
        code: 'UNEVEN_POOLS',
        message: 'Pools play different numbers of matches.',
        poolIds: ['p0', 'p1', 'p2'],
        members: [],
      },
    ]);
  });

  it('even complete pools raise no warning', () => {
    const all = teams(8);
    expect(poolWarnings(assignment([all.slice(0, 4), all.slice(4)]), all)).toEqual([]);
  });

  it('U-POOL-16 empty pool', () => {
    const all = teams(4);
    const warnings = poolWarnings(assignment([all.slice(0, 2), all.slice(2), []]), all);
    expect(warnings).toEqual([{ code: 'EMPTY_POOL', message: 'Pool C has no teams.', poolIds: ['p2'], members: [] }]);
  });

  it('U-POOL-16 single-team pool', () => {
    const all = teams(3);
    const warnings = poolWarnings(assignment([all.slice(0, 2), all.slice(2)]), all);
    expect(warnings.map((w) => w.code)).toEqual(['UNEVEN_POOLS', 'SINGLE_TEAM_POOL']);
    expect(warnings[1]).toEqual({
      code: 'SINGLE_TEAM_POOL',
      message: 'Pool B has one team, so no matches.',
      poolIds: ['p1'],
      members: [team('T03')],
    });
  });

  it('U-POOL-16 duplicate member across pools', () => {
    const all = teams(4);
    const warnings = poolWarnings(assignment([[all[0], all[1]], [all[2], all[3], all[0]]]), all);
    const duplicate = warnings.find((w) => w.code === 'TEAM_IN_MULTIPLE_POOLS');
    expect(duplicate).toEqual({
      code: 'TEAM_IN_MULTIPLE_POOLS',
      message: 'A team is in more than one pool (Pool A, Pool B).',
      poolIds: ['p0', 'p1'],
      members: [team('T01')],
    });
  });

  it('U-POOL-16 unassigned entrants are listed', () => {
    const all = teams(6);
    const warnings = poolWarnings(assignment([all.slice(0, 2), all.slice(2, 4)]), all);
    expect(warnings).toEqual([
      { code: 'UNASSIGNED_TEAMS', message: '2 teams are not in a pool yet.', poolIds: [], members: [team('T05'), team('T06')] },
    ]);
  });

  it('U-POOL-16 unassigned slot entrants of a later stage are listed too', () => {
    const entrants = [slot('A1'), slot('B1'), slot('A2'), slot('B2')];
    const warnings = poolWarnings(assignment([[slot('A1'), slot('B2')], [slot('B1')]]), entrants);
    expect(warnings.find((w) => w.code === 'UNASSIGNED_TEAMS')).toEqual({
      code: 'UNASSIGNED_TEAMS',
      message: '1 team is not in a pool yet.',
      poolIds: [],
      members: [slot('A2')],
    });
  });

  it('U-POOL-17 a team entered directly into a later stage is not unassigned in stage 1', () => {
    const active = teams(9);
    const directEntry = active[8];
    const stageOneEntrants = active.filter((side) => side !== directEntry);
    const warnings = poolWarnings(assignment([active.slice(0, 4), active.slice(4, 8)]), stageOneEntrants);
    expect(warnings).toEqual([]);
  });

  it('U-POOL-18 poolWarnings does not mutate frozen input', () => {
    const all = deepFreeze(teams(5));
    const input = assignment([all.slice(0, 3), all.slice(3)]);
    const before = JSON.stringify(input);
    poolWarnings(input, all);
    expect(JSON.stringify(input)).toBe(before);
  });
});

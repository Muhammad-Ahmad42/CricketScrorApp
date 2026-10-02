/** @jest-environment node */
import { bracketShape } from '@/domain/tournament/knockout';
import { defaultSlotLabel, expandEntryRules, explainEntryRules, type SourceBracketShape } from '@/domain/tournament/slots';
import type { Pool, QualificationRule, StageId, StageSlot } from '@/domain/types';
import { deepFreeze, idSequence, pool } from './structure/support';

const GROUPS = 'groups';
const TARGET = 'knockouts';

function poolsOf(count: number, stageId: StageId = GROUPS): readonly Pool[] {
  return Array.from({ length: count }, (_, index) => pool(`p${String.fromCharCode(65 + index)}`, stageId, `Pool ${String.fromCharCode(65 + index)}`, index));
}

function sources(poolCount: number, brackets: ReadonlyMap<StageId, SourceBracketShape> = new Map()) {
  return deepFreeze({ pools: new Map([[GROUPS, poolsOf(poolCount)]]), brackets });
}

function expand(rules: readonly QualificationRule[], poolCount = 2, existing: readonly StageSlot[] = [], brackets?: ReadonlyMap<StageId, SourceBracketShape>) {
  return expandEntryRules(TARGET, deepFreeze(rules), sources(poolCount, brackets), deepFreeze(existing), idSequence('slot'));
}

function summary(slots: readonly StageSlot[]): readonly string[] {
  return slots.map((s) => `${s.index}:${s.label}`);
}

const TOP_TWO: QualificationRule = { kind: 'top_per_pool', sourceStageId: GROUPS, count: 2, fromPosition: 1 };

describe('expandEntryRules', () => {
  it('U-SLOT-01 top 2 per pool over A and B', () => {
    const { slots, removed } = expand([TOP_TWO]);
    expect(summary(slots)).toEqual(['0:A1', '1:B1', '2:A2', '3:B2']);
    expect(removed).toEqual([]);
    expect(slots[3]).toEqual({
      id: 'slot-4',
      stageId: TARGET,
      index: 3,
      role: 'entry',
      label: 'B2',
      source: { kind: 'pool_position', stageId: GROUPS, poolId: 'pB', position: 2 },
      seed: null,
    });
    expect(slots.every((s) => s.role === 'entry' && s.seed === null && s.stageId === TARGET)).toBe(true);
  });

  it('orders pools by orderIndex, not by array order', () => {
    const reversed = new Map([[GROUPS, [...poolsOf(2)].reverse()]]);
    const { slots } = expandEntryRules(TARGET, [TOP_TWO], { pools: reversed, brackets: new Map() }, [], idSequence());
    expect(summary(slots)).toEqual(['0:A1', '1:B1', '2:A2', '3:B2']);
  });

  it('U-SLOT-02 fromPosition 3 gives the Plate slots', () => {
    const { slots } = expand([{ kind: 'top_per_pool', sourceStageId: GROUPS, count: 2, fromPosition: 3 }]);
    expect(summary(slots)).toEqual(['0:A3', '1:B3', '2:A4', '3:B4']);
    expect(slots[0].source).toEqual({ kind: 'pool_position', stageId: GROUPS, poolId: 'pA', position: 3 });
  });

  it('U-SLOT-03 a single pool position', () => {
    const { slots } = expand([{ kind: 'pool_position', sourceStageId: GROUPS, poolId: 'pC', position: 1 }], 3);
    expect(summary(slots)).toEqual(['0:C1']);
    expect(slots[0].source).toEqual({ kind: 'pool_position', stageId: GROUPS, poolId: 'pC', position: 1 });
  });

  it('U-SLOT-04 pool winners plus the best runner-up across three pools', () => {
    const { slots } = expand(
      [
        { kind: 'top_per_pool', sourceStageId: GROUPS, count: 1, fromPosition: 1 },
        { kind: 'best_of_position', sourceStageId: GROUPS, position: 2, count: 1, normalization: 'per_match_average' },
      ],
      3,
    );
    expect(summary(slots)).toEqual(['0:A1', '1:B1', '2:C1', '3:Best runner-up']);
    expect(slots[3].source).toEqual({ kind: 'best_of_position', stageId: GROUPS, position: 2, rank: 1, normalization: 'per_match_average' });
  });

  it('best four runners-up are numbered', () => {
    const { slots } = expand([{ kind: 'best_of_position', sourceStageId: GROUPS, position: 2, count: 4, normalization: 'raw' }], 5);
    expect(slots.map((s) => s.label)).toEqual(['Best runner-up', '2nd best runner-up', '3rd best runner-up', '4th best runner-up']);
    expect(slots.map((s) => (s.source.kind === 'best_of_position' ? s.source.rank : 0))).toEqual([1, 2, 3, 4]);
  });

  it('U-SLOT-05 best third-placed teams', () => {
    const { slots } = expand([{ kind: 'best_of_position', sourceStageId: GROUPS, position: 3, count: 2, normalization: 'raw' }], 4);
    expect(slots.map((s) => s.label)).toEqual(['Best 3rd', 'Best 3rd #2']);
  });

  it('U-SLOT-06 top 8 overall', () => {
    const { slots } = expand([{ kind: 'top_overall', sourceStageId: GROUPS, count: 8, normalization: 'raw' }], 4);
    expect(slots.map((s) => s.label)).toEqual(['1st overall', '2nd overall', '3rd overall', '4th overall', '5th overall', '6th overall', '7th overall', '8th overall']);
    expect(slots[7].source).toEqual({ kind: 'overall_position', stageId: GROUPS, rank: 8, normalization: 'raw' });
  });

  it('U-SLOT-07 knockout winners of a quarterfinal-only stage without any fixture', () => {
    const shape = bracketShape(8, 1);
    const brackets = new Map([['qf', { lastRound: shape.roundsPlayed, positions: shape.winners }]]);
    const { slots } = expand([{ kind: 'knockout_winners', sourceStageId: 'qf' }], 2, [], brackets);
    expect(slots.map((s) => s.label)).toEqual(['Winner QF1', 'Winner QF2', 'Winner QF3', 'Winner QF4']);
    expect(slots.map((s) => s.source)).toEqual(
      [0, 1, 2, 3].map((position) => ({ kind: 'bracket_winner', stageId: 'qf', round: 1, position })),
    );
    expect(slots.every((s) => s.role === 'entry')).toBe(true);
  });

  it('knockout winners of a quarterfinal with byes number the existing fixtures and name the bye seeds', () => {
    const shape = bracketShape(6, 1);
    const withEntrants = new Map([['qf', { lastRound: shape.roundsPlayed, positions: shape.winners, entrants: 6 }]]);
    const { slots } = expand([{ kind: 'knockout_winners', sourceStageId: 'qf' }], 2, [], withEntrants);
    expect(slots.map((s) => s.label)).toEqual(['QF seed 1', 'Winner QF1', 'QF seed 2', 'Winner QF2']);
    expect(slots.map((s) => s.source)).toEqual(
      [0, 1, 2, 3].map((position) => ({ kind: 'bracket_winner', stageId: 'qf', round: 1, position })),
    );
    const five = expand([{ kind: 'knockout_winners', sourceStageId: 'qf' }], 2, [], new Map([['qf', { lastRound: 1, positions: 4, entrants: 5 }]]));
    expect(five.slots.map((s) => s.label)).toEqual(['QF seed 1', 'Winner QF1', 'QF seed 2', 'QF seed 3']);
    const three = expand([{ kind: 'knockout_winners', sourceStageId: 'sf' }], 2, [], new Map([['sf', { lastRound: 1, positions: 2, entrants: 3 }]]));
    expect(three.slots.map((s) => s.label)).toEqual(['SF seed 1', 'Winner SF1']);
    const full = expand([{ kind: 'knockout_winners', sourceStageId: 'qf' }], 2, [], new Map([['qf', { lastRound: 1, positions: 4, entrants: 8 }]]));
    expect(full.slots.map((s) => s.label)).toEqual(['Winner QF1', 'Winner QF2', 'Winner QF3', 'Winner QF4']);
    const later = expand([{ kind: 'knockout_winners', sourceStageId: 'ko' }], 2, [], new Map([['ko', { lastRound: 2, positions: 2, entrants: 6 }]]));
    expect(later.slots.map((s) => s.label)).toEqual(['Winner SF1', 'Winner SF2']);
  });

  it('knockout winners of semifinals and of a full bracket', () => {
    const semis = expand([{ kind: 'knockout_winners', sourceStageId: 'ko' }], 2, [], new Map([['ko', { lastRound: 2, positions: 2 }]]));
    expect(semis.slots.map((s) => s.label)).toEqual(['Winner SF1', 'Winner SF2']);
    const full = expand([{ kind: 'knockout_winners', sourceStageId: 'ko' }], 2, [], new Map([['ko', { lastRound: 3, positions: 1 }]]));
    expect(full.slots.map((s) => s.label)).toEqual(['Winner Final']);
    expect(expand([{ kind: 'knockout_winners', sourceStageId: 'missing' }]).slots).toEqual([]);
  });

  it('U-SLOT-08 manual slots have no team', () => {
    const { slots } = expand([{ kind: 'manual', count: 2, label: 'Wildcard' }]);
    expect(slots.map((s) => [s.label, s.source])).toEqual([
      ['Wildcard 1', { kind: 'manual', teamId: null }],
      ['Wildcard 2', { kind: 'manual', teamId: null }],
    ]);
    expect(expand([{ kind: 'manual', count: 1, label: '  ' }]).slots[0].label).toBe('TBD');
  });

  it('U-SLOT-09 direct entries follow the pool qualifiers as manual slots with the team set', () => {
    const { slots } = expand([TOP_TWO, { kind: 'direct_entry', teamIds: ['LIO'] }]);
    expect(summary(slots)).toEqual(['0:A1', '1:B1', '2:A2', '3:B2', '4:Direct entry']);
    expect(slots[4].source).toEqual({ kind: 'manual', teamId: 'LIO' });
  });

  it('U-SLOT-10 re-expansion keeps ids by index when pools grow', () => {
    const first = expand([TOP_TWO], 2).slots;
    const { slots, removed } = expandEntryRules(TARGET, [TOP_TWO], sources(3), first, idSequence('new'));
    expect(summary(slots)).toEqual(['0:A1', '1:B1', '2:C1', '3:A2', '4:B2', '5:C2']);
    expect(slots.slice(0, 4).map((s) => s.id)).toEqual(first.map((s) => s.id));
    expect(slots.slice(4).map((s) => s.id)).toEqual(['new-1', 'new-2']);
    expect(removed).toEqual([]);
  });

  it('U-SLOT-11 re-expansion that shrinks returns the surplus slots', () => {
    const first = expand([TOP_TWO], 3).slots;
    const { slots, removed } = expandEntryRules(TARGET, [TOP_TWO], sources(2), first, idSequence('new'));
    expect(slots.map((s) => s.id)).toEqual(first.slice(0, 4).map((s) => s.id));
    expect(removed).toEqual(first.slice(4));
  });

  it('keeps a bracket seed only while the slot source is unchanged', () => {
    const seeded = expand([TOP_TWO], 2).slots.map((s, i) => ({ ...s, seed: i + 1 }));
    const same = expandEntryRules(TARGET, [TOP_TWO], sources(2), seeded, idSequence()).slots;
    expect(same.map((s) => s.seed)).toEqual([1, 2, 3, 4]);
    const changed = expandEntryRules(TARGET, [TOP_TWO], sources(3), seeded, idSequence()).slots;
    expect(changed.map((s) => s.seed)).toEqual([1, 2, null, null, null, null]);
  });

  it('leaves progression slots alone unless an entry index now needs their index', () => {
    const entries = expand([TOP_TWO], 2).slots;
    const progression: StageSlot = {
      id: 'winner-sf1',
      stageId: TARGET,
      index: 4,
      role: 'progression',
      label: 'Winner SF1',
      source: { kind: 'bracket_winner', stageId: TARGET, round: 1, position: 0 },
      seed: null,
    };
    const unchanged = expandEntryRules(TARGET, [TOP_TWO], sources(2), [...entries, progression], idSequence());
    expect(unchanged.removed).toEqual([]);
    const grown = expandEntryRules(TARGET, [TOP_TWO], sources(3), [...entries, progression], idSequence());
    expect(grown.removed).toEqual([progression]);
  });
});

describe('explainEntryRules', () => {
  const names = new Map([
    [GROUPS, 'Group Stage'],
    ['qf', 'Quarterfinals'],
  ]);

  it.each<[readonly QualificationRule[], string]>([
    [[TOP_TWO], 'Top 2 from each pool'],
    [
      [
        { kind: 'top_per_pool', sourceStageId: GROUPS, count: 1, fromPosition: 1 },
        { kind: 'best_of_position', sourceStageId: GROUPS, position: 2, count: 4, normalization: 'raw' },
      ],
      'Pool winners + best 4 runners-up',
    ],
    [[{ kind: 'top_overall', sourceStageId: GROUPS, count: 8, normalization: 'raw' }], 'Top 8 overall'],
    [[{ kind: 'manual', count: 4, label: 'Wildcard' }], 'Organizer selects 4'],
    [[{ kind: 'top_per_pool', sourceStageId: GROUPS, count: 2, fromPosition: 3 }], '3rd and 4th of each pool'],
    [[{ kind: 'direct_entry', teamIds: ['a', 'b'] }], '2 direct entries'],
    [[TOP_TWO, { kind: 'direct_entry', teamIds: ['a'] }], 'Top 2 from each pool + 1 direct entry'],
    [[{ kind: 'knockout_winners', sourceStageId: 'qf' }], 'Winners of the Quarterfinals'],
    [[{ kind: 'best_of_position', sourceStageId: GROUPS, position: 3, count: 1, normalization: 'raw' }], 'Best 3rd-placed team'],
    [[{ kind: 'pool_position', sourceStageId: GROUPS, poolId: 'pA', position: 1 }], 'A pool winner'],
    [[], 'All teams in the tournament'],
  ])('U-SLOT-12 %j -> %s', (rules, expected) => {
    expect(explainEntryRules(rules, names)).toBe(expected);
  });
});

describe('defaultSlotLabel', () => {
  const names = {
    poolName: (poolId: string) => ({ pA: 'Pool A', pB: 'Pool B', g1: 'Group 1', lions: 'Lions Group' })[poolId] ?? poolId,
    fixtureLabel: (fixtureId: string) => ({ q1: 'Qualifier 1' })[fixtureId] ?? fixtureId,
    bracketLabel: (_stageId: string, round: number, position: number) => `${round === 1 ? 'QF' : 'SF'}${position + 1}`,
  };

  it('U-SLOT-13 labels for every source kind', () => {
    expect(defaultSlotLabel({ kind: 'pool_position', stageId: GROUPS, poolId: 'pA', position: 1 }, names)).toBe('A1');
    expect(defaultSlotLabel({ kind: 'pool_position', stageId: GROUPS, poolId: 'pB', position: 2 }, names)).toBe('B2');
    expect(defaultSlotLabel({ kind: 'best_of_position', stageId: GROUPS, position: 2, rank: 1, normalization: 'raw' }, names)).toBe('Best runner-up');
    expect(defaultSlotLabel({ kind: 'overall_position', stageId: GROUPS, rank: 3, normalization: 'raw' }, names)).toBe('3rd overall');
    expect(defaultSlotLabel({ kind: 'bracket_winner', stageId: 'ko', round: 2, position: 0 }, names)).toBe('Winner SF1');
    expect(defaultSlotLabel({ kind: 'bracket_loser', stageId: 'ko', round: 2, position: 1 }, names)).toBe('Loser SF2');
    expect(defaultSlotLabel({ kind: 'bracket_winner', stageId: 'ko', round: 1, position: 2 }, names)).toBe('Winner QF3');
    expect(defaultSlotLabel({ kind: 'fixture_winner', fixtureId: 'q1' }, names)).toBe('Winner Qualifier 1');
    expect(defaultSlotLabel({ kind: 'fixture_loser', fixtureId: 'q1' }, names)).toBe('Loser Qualifier 1');
    expect(defaultSlotLabel({ kind: 'manual', teamId: null }, names)).toBe('TBD');
    expect(defaultSlotLabel({ kind: 'manual', teamId: 'LIO' }, names)).toBe('Direct entry');
  });

  it('uses the full pool name when it has no short letter', () => {
    expect(defaultSlotLabel({ kind: 'pool_position', stageId: GROUPS, poolId: 'lions', position: 2 }, names)).toBe('Lions Group 2nd');
    expect(defaultSlotLabel({ kind: 'pool_position', stageId: GROUPS, poolId: 'g1', position: 1 }, names)).toBe('G1-1');
  });
});

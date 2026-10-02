/** @jest-environment node */
import { DEFAULT_KNOCKOUT_CONFIG } from '@/domain/tournament/defaults';
import { knockoutBracket, roundName, type KnockoutBracketPlan } from '@/domain/tournament/fixtures';
import {
  bracketShape,
  knockoutAdvancer,
  knockoutGenerationGuard,
  seedEntrants,
  standardBracketOrder,
  type SeededEntrant,
} from '@/domain/tournament/knockout';
import type { FixtureDraft, FixtureSide, KnockoutConfig, MatchResult, SlotResolution, TeamId } from '@/domain/types';
import { deepFreeze, draftDefaults, fixture, idSequence, label, slot, summary, team, teams } from './structure/support';

function bracket(entrants: readonly FixtureSide[], overrides: Partial<{ thirdPlacePlayoff: boolean; rounds: number | null; firstSlotIndex: number }> = {}, prefix = 'id'): KnockoutBracketPlan {
  return knockoutBracket(
    entrants,
    { thirdPlacePlayoff: false, rounds: null, firstSlotIndex: entrants.length, defaults: draftDefaults({ stageId: 'ko' }), ...overrides },
    idSequence(prefix),
  );
}

function sides(plan: KnockoutBracketPlan, draft: FixtureDraft): string {
  const name = (side: FixtureSide): string => {
    if (side.kind === 'team') {
      return side.teamId;
    }
    return plan.slots.find((s) => s.id === side.slotId)?.label ?? side.slotId;
  };
  return `${name(draft.sideA)} v ${name(draft.sideB)}`;
}

function seeds(count: number): readonly FixtureSide[] {
  return Array.from({ length: count }, (_, index) => team(`s${index + 1}`));
}

function simulateTopSeedsWin(plan: KnockoutBracketPlan): { readonly final: readonly number[]; readonly winner: number } {
  const seedOf = (id: string): number => Number(id.slice(1));
  const winners = new Map<string, number>();
  const losers = new Map<string, number>();
  const resolve = (side: FixtureSide): number => {
    if (side.kind === 'team') {
      return seedOf(side.teamId);
    }
    const progression = plan.slots.find((s) => s.id === side.slotId);
    if (!progression || (progression.source.kind !== 'bracket_winner' && progression.source.kind !== 'bracket_loser')) {
      throw new Error('unexpected slot');
    }
    const key = `${progression.source.round}:${progression.source.position}`;
    const value = progression.source.kind === 'bracket_winner' ? winners.get(key) : losers.get(key);
    if (value === undefined) {
      throw new Error(`fixture ${key} not played yet`);
    }
    return value;
  };
  let final: readonly number[] = [];
  let winner = 0;
  for (const draft of plan.fixtures.filter((f) => f.bracket?.kind === 'main')) {
    const a = resolve(draft.sideA);
    const b = resolve(draft.sideB);
    const key = `${draft.bracket?.round}:${draft.bracket?.position}`;
    winners.set(key, Math.min(a, b));
    losers.set(key, Math.max(a, b));
    if (draft.isFinal) {
      final = [a, b].sort((x, y) => x - y);
      winner = Math.min(a, b);
    }
  }
  return { final, winner };
}

describe('standardBracketOrder', () => {
  it('U-KO-01 sizes 2, 4 and 8', () => {
    expect(standardBracketOrder(2)).toEqual([1, 2]);
    expect(standardBracketOrder(4)).toEqual([1, 4, 2, 3]);
    expect(standardBracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('size 16 and the pairing invariant for every power of two up to 128', () => {
    expect(standardBracketOrder(16)).toEqual([1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]);
    for (const size of [2, 4, 8, 16, 32, 64, 128]) {
      const order = standardBracketOrder(size);
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: size }, (_, i) => i + 1));
      const pairsOk = Array.from({ length: size / 2 }, (_, i) => order[2 * i] + order[2 * i + 1] === size + 1).every(Boolean);
      expect(pairsOk).toBe(true);
      expect(order.indexOf(1) < size / 2).toBe(true);
      expect(order.indexOf(2) >= size / 2).toBe(true);
    }
  });

  it('refuses sizes that are not powers of two', () => {
    expect(() => standardBracketOrder(6)).toThrow();
    expect(() => standardBracketOrder(0)).toThrow();
  });
});

describe('bracketShape', () => {
  it('U-KO-02 documented shapes', () => {
    expect(bracketShape(8, null)).toEqual({ size: 8, totalRounds: 3, roundsPlayed: 3, winners: 1 });
    expect(bracketShape(8, 1)).toEqual({ size: 8, totalRounds: 3, roundsPlayed: 1, winners: 4 });
    expect(bracketShape(6, null)).toEqual({ size: 8, totalRounds: 3, roundsPlayed: 3, winners: 1 });
    expect(bracketShape(16, 2)).toEqual({ size: 16, totalRounds: 4, roundsPlayed: 2, winners: 4 });
  });

  it('clamps rounds to the bracket and handles tiny entrant counts', () => {
    expect(bracketShape(4, 5)).toEqual({ size: 4, totalRounds: 2, roundsPlayed: 2, winners: 1 });
    expect(bracketShape(2, null)).toEqual({ size: 2, totalRounds: 1, roundsPlayed: 1, winners: 1 });
    expect(bracketShape(33, null)).toEqual({ size: 64, totalRounds: 6, roundsPlayed: 6, winners: 1 });
    expect(() => bracketShape(8, 0)).toThrow();
  });
});

describe('knockoutBracket', () => {
  it('U-KOB-01 two entrants: a single final and no progression slots', () => {
    const plan = bracket(seeds(2));
    expect(plan.fixtures).toHaveLength(1);
    expect(plan.fixtures[0]).toMatchObject({
      isFinal: true,
      label: 'Final',
      round: 1,
      leg: null,
      bracket: { kind: 'main', round: 1, position: 0, roundName: 'Final' },
      sideA: team('s1'),
      sideB: team('s2'),
    });
    expect(plan.slots).toEqual([]);
    expect(plan.byes).toEqual([]);
  });

  it('U-KOB-02 the 8-team T20 semifinals and final', () => {
    const entrants = deepFreeze([slot('A1'), slot('B1'), slot('A2'), slot('B2')]);
    const plan = bracket(entrants, { firstSlotIndex: 4 }, 'ko');
    expect(plan.fixtures.map((f) => [f.label, f.bracket?.roundName, f.bracket?.round, f.bracket?.position, sides(plan, f), f.isFinal])).toEqual([
      ['SF1', 'Semifinal', 1, 0, 'A1 v B2', false],
      ['SF2', 'Semifinal', 1, 1, 'B1 v A2', false],
      ['Final', 'Final', 2, 0, 'Winner SF1 v Winner SF2', true],
    ]);
    expect(plan.slots).toEqual([
      { id: 'ko-4', stageId: 'ko', index: 4, role: 'progression', label: 'Winner SF1', source: { kind: 'bracket_winner', stageId: 'ko', round: 1, position: 0 }, seed: null },
      { id: 'ko-5', stageId: 'ko', index: 5, role: 'progression', label: 'Winner SF2', source: { kind: 'bracket_winner', stageId: 'ko', round: 1, position: 1 }, seed: null },
    ]);
    expect(plan.entrySlotSeeds).toEqual([
      { slotId: 'A1', seed: 1 },
      { slotId: 'B1', seed: 2 },
      { slotId: 'A2', seed: 3 },
      { slotId: 'B2', seed: 4 },
    ]);
    expect(plan.fixtures.map((f) => f.id)).toEqual(['ko-1', 'ko-2', 'ko-3']);
    expect(plan.fixtures.map((f) => f.matchNumber)).toEqual([1, 2, 3]);
  });

  it('U-KOB-03 third place play-off between the semifinal losers', () => {
    const plan = bracket([slot('A1'), slot('B1'), slot('A2'), slot('B2')], { firstSlotIndex: 4, thirdPlacePlayoff: true });
    const third = plan.fixtures.find((f) => f.bracket?.kind === 'third_place');
    expect(third).toMatchObject({ label: 'Third place', isFinal: false, bracket: { kind: 'third_place', round: 2, position: 0, roundName: 'Third place' } });
    expect(third && sides(plan, third)).toBe('Loser SF1 v Loser SF2');
    expect(plan.slots.map((s) => [s.index, s.label, s.source.kind])).toEqual([
      [4, 'Winner SF1', 'bracket_winner'],
      [5, 'Winner SF2', 'bracket_winner'],
      [6, 'Loser SF1', 'bracket_loser'],
      [7, 'Loser SF2', 'bracket_loser'],
    ]);
    expect(plan.fixtures.filter((f) => f.isFinal)).toHaveLength(1);
  });

  it('U-KOB-04 eight entrants follow the standard bracket order', () => {
    const plan = bracket(seeds(8));
    expect(plan.fixtures.map((f) => `${f.label}: ${sides(plan, f)}`)).toEqual([
      'QF1: s1 v s8',
      'QF2: s4 v s5',
      'QF3: s2 v s7',
      'QF4: s3 v s6',
      'SF1: Winner QF1 v Winner QF2',
      'SF2: Winner QF3 v Winner QF4',
      'Final: Winner SF1 v Winner SF2',
    ]);
    expect(plan.fixtures.slice(0, 4).every((f) => f.bracket?.roundName === 'Quarterfinal')).toBe(true);
  });

  it('U-KOB-05 six entrants: byes to seeds 1 and 2 and fixture labels numbered by existing fixtures', () => {
    const plan = bracket(seeds(6), { thirdPlacePlayoff: true });
    expect(plan.byes).toEqual([team('s1'), team('s2')]);
    expect(plan.fixtures.map((f) => `${f.label} r${f.bracket?.round}p${f.bracket?.position}: ${sides(plan, f)}`)).toEqual([
      'QF1 r1p1: s4 v s5',
      'QF2 r1p3: s3 v s6',
      'SF1 r2p0: s1 v Winner QF1',
      'SF2 r2p1: s2 v Winner QF2',
      'Final r3p0: Winner SF1 v Winner SF2',
      'Third place r3p0: Loser SF1 v Loser SF2',
    ]);
    expect(plan.slots.map((s) => s.label)).toEqual(['Winner QF1', 'Winner QF2', 'Winner SF1', 'Winner SF2', 'Loser SF1', 'Loser SF2']);
    expect(plan.slots.map((s) => s.index)).toEqual([6, 7, 8, 9, 10, 11]);
  });

  it('U-KOB-06 five entrants: byes to seeds 1 to 3 and one first-round fixture', () => {
    const plan = bracket(seeds(5));
    expect(plan.byes).toEqual([team('s1'), team('s2'), team('s3')]);
    const roundOne = plan.fixtures.filter((f) => f.bracket?.round === 1);
    expect(roundOne.map((f) => sides(plan, f))).toEqual(['s4 v s5']);
  });

  it('three entrants never get a third place play-off', () => {
    const plan = bracket(seeds(3), { thirdPlacePlayoff: true });
    expect(plan.fixtures.some((f) => f.bracket?.kind === 'third_place')).toBe(false);
    expect(plan.fixtures.map((f) => sides(plan, f))).toEqual(['s2 v s3', 's1 v Winner SF1']);
  });

  it('U-KOB-07 every n from 2 to 33: byes to the top seeds, seeds 1 and 2 only meet in the final, one final', () => {
    const problems: string[] = [];
    for (let n = 2; n <= 33; n += 1) {
      const plan = bracket(seeds(n), { thirdPlacePlayoff: true });
      const size = 2 ** Math.ceil(Math.log2(n));
      const main = plan.fixtures.filter((f) => f.bracket?.kind === 'main');
      const roundOneSides = main.filter((f) => f.bracket?.round === 1).flatMap((f) => [label(f.sideA), label(f.sideB)]);
      const byeLabels = plan.byes.map(label);
      const expectedByes = Array.from({ length: size - n }, (_, i) => `s${i + 1}`);
      if (JSON.stringify(byeLabels) !== JSON.stringify(expectedByes)) {
        problems.push(`n=${n}: byes ${byeLabels.join(',')}`);
      }
      if ([...roundOneSides, ...byeLabels].sort().join() !== seeds(n).map(label).sort().join()) {
        problems.push(`n=${n}: entrants not placed exactly once`);
      }
      if (main.length !== n - 1) {
        problems.push(`n=${n}: ${main.length} main fixtures`);
      }
      if (plan.fixtures.filter((f) => f.isFinal).length !== 1) {
        problems.push(`n=${n}: final count`);
      }
      const { final, winner } = simulateTopSeedsWin(plan);
      if (JSON.stringify(final) !== JSON.stringify([1, 2]) || winner !== 1) {
        problems.push(`n=${n}: final ${final.join(' v ')}`);
      }
      const positions = plan.fixtures.map((f) => `${f.bracket?.kind}:${f.bracket?.round}:${f.bracket?.position}`);
      if (new Set(positions).size !== positions.length) {
        problems.push(`n=${n}: duplicate bracket position`);
      }
      const referenced = plan.fixtures.flatMap((f) => [f.sideA, f.sideB]).filter((s) => s.kind === 'slot').map(label);
      if (referenced.sort().join() !== plan.slots.map((s) => s.id).sort().join()) {
        problems.push(`n=${n}: progression slots and fixture sides disagree`);
      }
      if (plan.slots.some((s, i) => s.index !== n + i || s.role !== 'progression' || s.stageId !== 'ko')) {
        problems.push(`n=${n}: slot indexes`);
      }
      if (plan.slots.some((s) => s.source.kind !== 'bracket_winner' && s.source.kind !== 'bracket_loser')) {
        problems.push(`n=${n}: slot sources`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('U-KOB-08 rounds: 1 stops after the quarterfinals', () => {
    const plan = bracket(seeds(8), { rounds: 1, thirdPlacePlayoff: true });
    expect(plan.fixtures.map((f) => f.label)).toEqual(['QF1', 'QF2', 'QF3', 'QF4']);
    expect(plan.fixtures.some((f) => f.isFinal)).toBe(false);
    expect(plan.slots).toEqual([]);
  });

  it('rounds: 2 of sixteen stops after the quarterfinals with progression into them', () => {
    const plan = bracket(seeds(16), { rounds: 2 });
    expect(plan.fixtures.filter((f) => f.bracket?.round === 2).map((f) => f.label)).toEqual(['QF1', 'QF2', 'QF3', 'QF4']);
    expect(plan.fixtures.some((f) => f.isFinal)).toBe(false);
    expect(plan.slots).toHaveLength(8);
  });

  it('U-KOB-09 a re-draw with new fixture ids keeps progression slot sources', () => {
    const first = bracket(seeds(8), { thirdPlacePlayoff: true }, 'first');
    const second = bracket([...seeds(8)].reverse(), { thirdPlacePlayoff: true }, 'second');
    expect(second.fixtures.map((f) => f.id)).not.toEqual(first.fixtures.map((f) => f.id));
    expect(second.slots.map((s) => [s.index, s.label, s.source])).toEqual(first.slots.map((s) => [s.index, s.label, s.source]));
    expect(JSON.stringify(first.slots.map((s) => s.source))).not.toContain('first-');
  });

  it('numbers matches from startMatchNumber and copies the defaults', () => {
    const plan = knockoutBracket(
      seeds(4),
      { thirdPlacePlayoff: false, rounds: null, firstSlotIndex: 0, defaults: draftDefaults({ stageId: 'ko', startMatchNumber: 13, formatId: 'T20', venueId: 'v1' }) },
      idSequence(),
    );
    expect(plan.fixtures.map((f) => f.matchNumber)).toEqual([13, 14, 15]);
    expect(plan.fixtures.every((f) => f.formatId === 'T20' && f.venueId === 'v1' && f.status === 'scheduled' && f.poolId === null)).toBe(true);
  });

  it('refuses fewer than two entrants', () => {
    expect(() => bracket(seeds(1))).toThrow();
  });

  it('U-KOB-10 round names', () => {
    expect(roundName(2, 3)).toBe('Final');
    expect(roundName(4, 2)).toBe('Semifinal');
    expect(roundName(8, 1)).toBe('Quarterfinal');
    expect(roundName(16, 1)).toBe('Round of 16');
    expect(roundName(32, 1)).toBe('Round of 32');
    expect(roundName(64, 1)).toBe('Round 1');
    expect(bracket(seeds(40)).fixtures[0].bracket?.roundName).toBe('Round 1');
  });
});

function positioned(pool: number, position: number): SeededEntrant {
  return { side: slot(`${String.fromCharCode(65 + pool)}${position}`), rank: null, poolIndex: pool, poolPosition: position };
}

describe('seedEntrants', () => {
  it('U-KO-03 fixed, 2 pools x 2: A1 v B2 and B1 v A2', () => {
    const entrants = deepFreeze([positioned(1, 2), positioned(0, 1), positioned(0, 2), positioned(1, 1)]);
    const order = seedEntrants(entrants, 'fixed', null);
    expect(order.map(label)).toEqual(['A1', 'B1', 'A2', 'B2']);
    const plan = bracket(order, { firstSlotIndex: 4 });
    expect(plan.fixtures.slice(0, 2).map((f) => sides(plan, f))).toEqual(['A1 v B2', 'B1 v A2']);
  });

  it('U-KO-04 fixed, 4 pools x 2: cross-pool quarterfinals with each pool split across halves', () => {
    const entrants = [0, 1, 2, 3].flatMap((pool) => [positioned(pool, 1), positioned(pool, 2)]);
    const order = seedEntrants(entrants, 'fixed', null);
    expect(order.map(label)).toEqual(['A1', 'B1', 'D1', 'C1', 'D2', 'C2', 'A2', 'B2']);
    const plan = bracket(order);
    expect(plan.fixtures.slice(0, 4).map((f) => sides(plan, f))).toEqual(['A1 v B2', 'C1 v D2', 'B1 v A2', 'D1 v C2']);
    const half = (name: string): number => (plan.fixtures.slice(0, 4).findIndex((f) => sides(plan, f).includes(name)) < 2 ? 0 : 1);
    expect(['A', 'B', 'C', 'D'].every((pool) => half(`${pool}1`) !== half(`${pool}2`))).toBe(true);
  });

  it('fixed, 8 pools x 2: every first-round match is cross-pool and pool pairs are split', () => {
    const entrants = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((pool) => [positioned(pool, 1), positioned(pool, 2)]);
    const plan = bracket(seedEntrants(entrants, 'fixed', null));
    const firstRound = plan.fixtures.filter((f) => f.bracket?.round === 1).map((f) => [label(f.sideA), label(f.sideB)]);
    expect(firstRound.every(([a, b]) => a[0] !== b[0] && a.endsWith('1') && b.endsWith('2'))).toBe(true);
  });

  it('U-KO-05 fixed: best-of and direct-entry entrants follow the pool-positioned ones by slot index', () => {
    const entrants: readonly SeededEntrant[] = [
      { side: slot('best'), rank: null, poolIndex: null, poolPosition: null },
      positioned(0, 1),
      positioned(1, 1),
      { side: slot('direct'), rank: null, poolIndex: null, poolPosition: null },
      positioned(0, 2),
      positioned(1, 2),
    ];
    expect(seedEntrants(entrants, 'fixed', null).map(label)).toEqual(['A1', 'B1', 'A2', 'B2', 'best', 'direct']);
  });

  it('fixed, 3 pools x 2: the same-pool first-round pair is repaired (EC-T-19)', () => {
    const entrants = [0, 1, 2].flatMap((pool) => [positioned(pool, 1), positioned(pool, 2)]);
    const order = seedEntrants(entrants, 'fixed', null);
    expect(order.map(label)).toEqual(['A1', 'B1', 'C1', 'A2', 'C2', 'B2']);
    const plan = bracket(order);
    expect(plan.fixtures.filter((f) => f.bracket?.round === 1).map((f) => sides(plan, f))).toEqual(['A2 v C2', 'C1 v B2']);
  });

  it('fixed keeps a same-pool pairing when no swap can fix it', () => {
    expect(seedEntrants([positioned(0, 2), positioned(0, 1)], 'fixed', null).map(label)).toEqual(['A1', 'A2']);
  });

  it('U-KO-06 random is reproducible with a seed and requires one', () => {
    const entrants = deepFreeze(teams(8).map((side): SeededEntrant => ({ side, rank: null, poolIndex: null, poolPosition: null })));
    const first = seedEntrants(entrants, 'random', 847291);
    expect(first).toEqual(seedEntrants(entrants, 'random', 847291));
    expect(first.map(label).sort()).toEqual(teams(8).map(label));
    expect(first.map(label)).not.toEqual(seedEntrants(entrants, 'random', 58213).map(label));
    expect(() => seedEntrants(entrants, 'random', null)).toThrow();
  });

  it('U-KO-07 ranking orders by rank ascending, unknown ranks last', () => {
    const entrants: readonly SeededEntrant[] = [
      { side: team('c'), rank: 3, poolIndex: null, poolPosition: null },
      { side: team('a'), rank: 1, poolIndex: null, poolPosition: null },
      { side: team('d'), rank: 4, poolIndex: null, poolPosition: null },
      { side: team('b'), rank: 2, poolIndex: null, poolPosition: null },
    ];
    expect(seedEntrants(entrants, 'ranking', null).map(label)).toEqual(['a', 'b', 'c', 'd']);
    expect(seedEntrants([{ side: team('x'), rank: null, poolIndex: null, poolPosition: null }, ...entrants], 'ranking', null).map(label)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'x',
    ]);
    const plan = bracket(seedEntrants(entrants, 'ranking', null));
    expect(plan.fixtures.slice(0, 2).map((f) => sides(plan, f))).toEqual(['a v d', 'b v c']);
  });
});

describe('knockoutGenerationGuard', () => {
  function resolutions(statuses: readonly SlotResolution['status'][]): readonly SlotResolution[] {
    return statuses.map((status, index) => ({ slotId: `s${index}`, teamId: status === 'pending' ? null : `t${index}`, status, viaOverride: false, explanation: '' }));
  }

  it('U-KO-08 ranking is refused while an entry slot is provisional', () => {
    expect(knockoutGenerationGuard('ranking', resolutions(['final', 'provisional']))).toEqual({
      ok: false,
      reason: 'Seeding by ranking is possible once all 2 qualifiers are known.',
    });
    expect(knockoutGenerationGuard('ranking', resolutions(['final', 'final', 'final', 'final', 'final', 'pending']))).toEqual({
      ok: false,
      reason: 'Seeding by ranking is possible once all 6 qualifiers are known.',
    });
    expect(knockoutGenerationGuard('ranking', resolutions(Array.from({ length: 8 }, () => 'final')))).toEqual({ ok: true, warnings: [] });
  });

  it('U-KO-09 fixed and random may be generated from unresolved slots', () => {
    const fixed = knockoutGenerationGuard('fixed', resolutions(['pending', 'provisional', 'final']));
    const random = knockoutGenerationGuard('random', resolutions(['pending']));
    expect(fixed.ok).toBe(true);
    expect(random.ok).toBe(true);
    expect(fixed.ok && fixed.warnings).toEqual(['2 knockout places are still to be decided; the draw uses their qualification slots.']);
  });
});

describe('knockoutAdvancer', () => {
  const played = deepFreeze(
    fixture({ id: 'sf1', stageId: 'ko', sideA: slot('A1'), sideB: slot('B2'), matchId: 'm1', status: 'completed', matchSides: { teamAId: 'LIO', teamBId: 'TIG' } }),
  );
  const sideTeams = { a: 'LIO', b: 'TIG' } as const;
  const seedOf = (teamId: TeamId): number | null => ({ LIO: 1, TIG: 4 })[teamId as 'LIO' | 'TIG'] ?? null;
  const config = (overrides: Partial<KnockoutConfig> = {}): KnockoutConfig => ({ ...DEFAULT_KNOCKOUT_CONFIG, ...overrides });
  const advance = (result: MatchResult | null, knockout: KnockoutConfig = DEFAULT_KNOCKOUT_CONFIG, seeds = seedOf) =>
    knockoutAdvancer(played, sideTeams, result ? summary('m1', 'LIO', 'TIG', result) : null, knockout, seeds);
  const undecidedTie: MatchResult = { type: 'tie', decider: null };
  const noResult: MatchResult = { type: 'no_result', reason: 'Rain' };

  it.each<[string, MatchResult, { winnerTeamId: string | null; loserTeamId: string | null; basis: string }]>([
    ['U-KO-10 win', { type: 'win', winnerTeamId: 'LIO', loserTeamId: 'TIG', margin: { kind: 'runs', runs: 12 }, method: 'normal' }, { winnerTeamId: 'LIO', loserTeamId: 'TIG', basis: 'result' }],
    ['U-KO-11 walkover', { type: 'walkover', winnerTeamId: 'TIG', loserTeamId: 'LIO', reason: null }, { winnerTeamId: 'TIG', loserTeamId: 'LIO', basis: 'walkover' }],
    ['U-KO-12 awarded', { type: 'awarded', winnerTeamId: 'TIG', loserTeamId: 'LIO', reason: 'Conceded', margin: null }, { winnerTeamId: 'TIG', loserTeamId: 'LIO', basis: 'awarded' }],
    [
      'U-KO-13 super over decider',
      { type: 'tie', decider: { method: 'super_over', winnerTeamId: 'TIG', superOverRounds: 1 } },
      { winnerTeamId: 'TIG', loserTeamId: 'LIO', basis: 'tie_decider' },
    ],
    [
      'U-KO-14 boundary count decider',
      { type: 'tie', decider: { method: 'boundary_count', winnerTeamId: 'LIO', superOverRounds: 2 } },
      { winnerTeamId: 'LIO', loserTeamId: 'TIG', basis: 'tie_decider' },
    ],
  ])('%s', (_, result, expected) => {
    expect(advance(result)).toEqual(expected);
  });

  it('awarded without a loser named takes the other side as loser', () => {
    expect(advance({ type: 'awarded', winnerTeamId: 'LIO', loserTeamId: null, reason: 'Misconduct', margin: null })).toEqual({
      winnerTeamId: 'LIO',
      loserTeamId: 'TIG',
      basis: 'awarded',
    });
  });

  it('U-KO-15 undecided tie with higher_seed', () => {
    expect(advance(undecidedTie, config({ tiedMatch: 'higher_seed' }))).toEqual({ winnerTeamId: 'LIO', loserTeamId: 'TIG', basis: 'higher_seed' });
    expect(advance(undecidedTie, config({ tiedMatch: 'higher_seed' }), (id) => (id === 'TIG' ? 2 : 3))).toEqual({
      winnerTeamId: 'TIG',
      loserTeamId: 'LIO',
      basis: 'higher_seed',
    });
  });

  it.each<[string, KnockoutConfig['tiedMatch']]>([
    ['U-KO-16 super over still tied', 'super_over'],
    ['boundary count still level', 'boundary_count'],
    ['U-KO-17 organizer', 'organizer'],
  ])('%s -> organizer_required', (_, tiedMatch) => {
    expect(advance(undecidedTie, config({ tiedMatch }))).toEqual({ winnerTeamId: null, loserTeamId: null, basis: 'organizer_required' });
  });

  it('U-KO-18 no result with higher_seed', () => {
    expect(advance(noResult, config({ noResult: 'higher_seed' }))).toEqual({ winnerTeamId: 'LIO', loserTeamId: 'TIG', basis: 'higher_seed' });
    expect(advance({ type: 'awarded', winnerTeamId: null, loserTeamId: null, reason: 'No winner', margin: null }, config({ noResult: 'higher_seed' })).basis).toBe(
      'higher_seed',
    );
  });

  it('U-KO-19 unknown or equal seeds never win higher_seed', () => {
    expect(advance(noResult, config({ noResult: 'higher_seed' }), () => null)).toEqual({ winnerTeamId: null, loserTeamId: null, basis: 'organizer_required' });
    expect(advance(noResult, config({ noResult: 'higher_seed' }), (id) => (id === 'LIO' ? 1 : null)).basis).toBe('organizer_required');
    expect(advance(noResult, config({ noResult: 'higher_seed' }), () => 3).basis).toBe('organizer_required');
  });

  it('U-KO-20 abandoned with shared', () => {
    expect(advance({ type: 'abandoned', reason: 'Rain' }, config({ noResult: 'shared' }))).toEqual({ winnerTeamId: null, loserTeamId: null, basis: 'shared' });
  });

  it.each<[KnockoutConfig['noResult']]>([['replay'], ['organizer']])('U-KO-21 no result with %s -> organizer_required', (policy) => {
    expect(advance(noResult, config({ noResult: policy }))).toEqual({ winnerTeamId: null, loserTeamId: null, basis: 'organizer_required' });
  });

  it('U-KO-22 no summary -> not_played', () => {
    expect(advance(null)).toEqual({ winnerTeamId: null, loserTeamId: null, basis: 'not_played' });
  });

  it('U-KO-23 the default config (custom stages) sends an undecided tie to the organizer and no result to the higher seed', () => {
    expect(DEFAULT_KNOCKOUT_CONFIG).toEqual({ thirdPlacePlayoff: false, rounds: null, tiedMatch: 'super_over', noResult: 'higher_seed' });
    expect(advance(undecidedTie, DEFAULT_KNOCKOUT_CONFIG).basis).toBe('organizer_required');
    expect(advance(noResult, DEFAULT_KNOCKOUT_CONFIG).basis).toBe('higher_seed');
  });

  it('U-KO-24 frozen match sides win over the current slot resolution', () => {
    const reversed = fixture({ id: 'sf2', sideA: slot('B1'), sideB: slot('A2'), matchId: 'm2', status: 'completed', matchSides: { teamAId: 'TIG', teamBId: 'LIO' } });
    const result = knockoutAdvancer(
      reversed,
      { a: 'EAG', b: 'HAW' },
      summary('m2', 'TIG', 'LIO', { type: 'win', winnerTeamId: 'TIG', loserTeamId: 'LIO', margin: { kind: 'wickets', wickets: 3, ballsRemaining: 4 }, method: 'normal' }),
      DEFAULT_KNOCKOUT_CONFIG,
      seedOf,
    );
    expect(result).toEqual({ winnerTeamId: 'TIG', loserTeamId: 'LIO', basis: 'result' });
    const tied = knockoutAdvancer(reversed, { a: 'EAG', b: 'HAW' }, summary('m2', 'TIG', 'LIO', noResult), DEFAULT_KNOCKOUT_CONFIG, seedOf);
    expect(tied).toEqual({ winnerTeamId: 'LIO', loserTeamId: 'TIG', basis: 'higher_seed' });
  });
});

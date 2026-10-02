/** @jest-environment node */
import { DEFAULT_KNOCKOUT_CONFIG, DEFAULT_NRR_CONFIG, DEFAULT_POINTS_SYSTEM, DEFAULT_TIE_BREAKERS } from '@/domain/tournament/defaults';
import {
  draftsFromRoundRobin,
  fixturesForPoolMove,
  knockoutBracket,
  manualFixture,
  roundName,
  roundRobin,
  scheduleSequential,
  validateFixtureDrafts,
  type DraftDefaults,
  type KnockoutBracketPlan,
  type RoundRobinRound,
} from '@/domain/tournament/fixtures';
import {
  bracketShape,
  knockoutAdvancer,
  knockoutGenerationGuard,
  seedEntrants,
  standardBracketOrder,
  type SeededEntrant,
} from '@/domain/tournament/knockout';
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
import { mulberry32, normalizeSeed, randomInt, shuffle } from '@/domain/tournament/rng';
import { defaultSlotLabel, expandEntryRules, explainEntryRules } from '@/domain/tournament/slots';
import {
  canTransitionFixture,
  canTransitionMatch,
  canTransitionStage,
  canTransitionTournament,
  matchEditPolicy,
  tournamentEditPolicy,
  type EditPermission,
  type MatchEditPolicy,
  type TournamentEditPolicy,
  type TournamentGuardContext,
} from '@/domain/tournament/stateMachine';
import {
  builtinTemplates,
  instantiateTemplate,
  templateFitsTeamCount,
  templateFromSnapshot,
  type InstantiatedStructure,
} from '@/domain/tournament/templates';
import {
  FIXTURE_STATUSES,
  MATCH_STATUSES,
  TOURNAMENT_STATUSES,
  type Fixture,
  type FixtureDraft,
  type FixtureSide,
  type FixtureStatus,
  type IdGenerator,
  type KnockoutConfig,
  type MatchResult,
  type MatchStatus,
  type MatchSummary,
  type Pool,
  type SlotResolution,
  type StageSlot,
  type StageStatus,
  type TeamId,
  type TemplateStage,
  type TournamentSnapshot,
  type TournamentStatus,
  type TournamentTemplate,
} from '@/domain/types';

const NOW = '2026-05-01T00:00:00.000Z';

function idGen(prefix: string): IdGenerator {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}

function T(teamId: string): FixtureSide {
  return { kind: 'team', teamId };
}

function S(slotId: string): FixtureSide {
  return { kind: 'slot', slotId };
}

function sideKey(side: FixtureSide): string {
  return side.kind === 'team' ? `team:${side.teamId}` : `slot:${side.slotId}`;
}

function sideName(side: FixtureSide): string {
  return side.kind === 'team' ? side.teamId : side.slotId;
}

function teamsOf(count: number, prefix = 'T'): FixtureSide[] {
  return Array.from({ length: count }, (_, index) => T(`${prefix}${String(index + 1).padStart(3, '0')}`));
}

function deepFreeze<V>(value: V): V {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as object)) {
      deepFreeze(item);
    }
  }
  return value;
}

function defaultsOf(overrides: Partial<DraftDefaults> = {}): DraftDefaults {
  return {
    tournamentId: 'tour-1',
    stageId: 'stage-1',
    poolId: null,
    formatId: null,
    matchRules: null,
    venueId: null,
    startMatchNumber: 1,
    ...overrides,
  };
}

function poolOf(id: string, stageId: string, name: string, orderIndex: number, legs: number | null = null): Pool {
  return { id, stageId, name, orderIndex, legs };
}

function fixtureOf(partial: Partial<Fixture> & Pick<Fixture, 'id' | 'sideA' | 'sideB'>): Fixture {
  return {
    tournamentId: 'tour-1',
    stageId: 'stage-1',
    poolId: null,
    matchNumber: 1,
    label: null,
    round: null,
    leg: null,
    bracket: null,
    isFinal: false,
    scheduledDate: null,
    scheduledTime: null,
    venueId: null,
    status: 'scheduled',
    matchId: null,
    matchSides: null,
    formatId: null,
    matchRules: null,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((field) => record[field] !== undefined)
      .sort()
      .map((field) => `${JSON.stringify(field)}:${stable(record[field])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonRounds(rounds: readonly { readonly round: number; readonly leg: number; readonly bye: FixtureSide | null; readonly pairings: readonly { readonly round: number; readonly leg: number; readonly sideA: FixtureSide; readonly sideB: FixtureSide }[] }[]): string[] {
  return rounds.map((round) =>
    stable([round.round, round.leg, round.bye === null ? null : sideKey(round.bye), round.pairings.map((p) => [p.round, p.leg, sideKey(p.sideA), sideKey(p.sideB)])]),
  );
}

function refMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function refFnv1a(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
}

function refShuffle<V>(items: readonly V[], rng: () => number): V[] {
  const copy = [...items];
  for (let i = copy.length - 1; i >= 1; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const held = copy[i];
    copy[i] = copy[j];
    copy[j] = held;
  }
  return copy;
}

function refPoolName(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return `Pool ${letters}`;
}

function refPoolSizes(n: number, p: number): number[] {
  const base = Math.floor(n / p);
  const rem = n % p;
  return Array.from({ length: p }, (_, index) => base + (index < rem ? 1 : 0));
}

function nextPow2(n: number): number {
  let size = 1;
  while (size < n) {
    size *= 2;
  }
  return size;
}

function refOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const doubled = order.length * 2;
    order = order.flatMap((seed) => [seed, doubled + 1 - seed]);
  }
  return order.slice(0, size);
}

interface RefPairing {
  readonly round: number;
  readonly leg: number;
  readonly sideA: FixtureSide;
  readonly sideB: FixtureSide;
}

interface RefRound {
  readonly round: number;
  readonly leg: number;
  readonly pairings: readonly RefPairing[];
  readonly bye: FixtureSide | null;
}

function refRoundRobin(entrants: readonly FixtureSide[], legs: number): RefRound[] {
  const n = entrants.length;
  let list: number[] = entrants.map((_, index) => index);
  if (n % 2 === 1) {
    list = [-1, ...list];
  }
  const m = list.length;
  const base: { pairs: [number, number][]; bye: number | null }[] = [];
  for (let r = 0; r < m - 1; r += 1) {
    const pairs: [number, number][] = [];
    let bye: number | null = null;
    for (let i = 0; i < m / 2; i += 1) {
      const x = list[i];
      const y = list[m - 1 - i];
      if (x === -1 || y === -1) {
        bye = x === -1 ? y : x;
        continue;
      }
      if (i === 0) {
        pairs.push(r % 2 === 0 ? [x, y] : [y, x]);
      } else if (i % 2 === 1) {
        pairs.push([y, x]);
      } else {
        pairs.push([x, y]);
      }
    }
    base.push({ pairs, bye });
    list = [list[0], list[m - 1], ...list.slice(1, m - 1)];
  }
  const rounds: RefRound[] = [];
  for (let leg = 1; leg <= legs; leg += 1) {
    base.forEach((entry, index) => {
      const round = (leg - 1) * base.length + index + 1;
      const swap = leg % 2 === 0;
      rounds.push({
        round,
        leg,
        bye: entry.bye === null ? null : entrants[entry.bye],
        pairings: entry.pairs.map(([a, b]) => ({ round, leg, sideA: entrants[swap ? b : a], sideB: entrants[swap ? a : b] })),
      });
    });
  }
  return rounds;
}

function roundRobinViolations(entrants: readonly FixtureSide[], legs: number, rounds: readonly RoundRobinRound[]): string[] {
  const n = entrants.length;
  const perLeg = n % 2 === 0 ? n - 1 : n;
  const violations: string[] = [];
  if (rounds.length !== perLeg * legs) {
    violations.push(`n=${n} legs=${legs}: ${rounds.length} rounds instead of ${perLeg * legs}`);
  }
  rounds.forEach((round, index) => {
    if (round.round !== index + 1) {
      violations.push(`n=${n} legs=${legs}: round at ${index} numbered ${round.round}`);
    }
    const leg = Math.floor(index / perLeg) + 1;
    if (round.leg !== leg) {
      violations.push(`n=${n} legs=${legs}: round ${round.round} has leg ${round.leg} instead of ${leg}`);
    }
    if (round.pairings.length !== Math.floor(n / 2)) {
      violations.push(`n=${n} legs=${legs}: round ${round.round} has ${round.pairings.length} pairings`);
    }
    const seen = new Set<string>();
    for (const pairing of round.pairings) {
      if (pairing.round !== round.round || pairing.leg !== round.leg) {
        violations.push(`n=${n} legs=${legs}: pairing labelled round ${pairing.round}/leg ${pairing.leg} inside round ${round.round}`);
      }
      for (const side of [pairing.sideA, pairing.sideB]) {
        if (seen.has(sideKey(side))) {
          violations.push(`n=${n} legs=${legs}: ${sideName(side)} twice in round ${round.round}`);
        }
        seen.add(sideKey(side));
      }
    }
    if (n % 2 === 1) {
      if (round.bye === null) {
        violations.push(`n=${n} legs=${legs}: round ${round.round} has no bye`);
      } else {
        if (seen.has(sideKey(round.bye))) {
          violations.push(`n=${n} legs=${legs}: bye ${sideName(round.bye)} also plays in round ${round.round}`);
        }
        seen.add(sideKey(round.bye));
      }
    } else if (round.bye !== null) {
      violations.push(`n=${n} legs=${legs}: round ${round.round} has a bye with an even field`);
    }
    if (seen.size !== n) {
      violations.push(`n=${n} legs=${legs}: round ${round.round} accounts for ${seen.size} of ${n} entrants`);
    }
  });
  const lo = Math.floor((n - 1) / 2);
  const hi = Math.ceil((n - 1) / 2);
  const totalSideA = new Map<string, number>();
  for (let leg = 1; leg <= legs; leg += 1) {
    const legRounds = rounds.filter((round) => round.leg === leg);
    const pairCounts = new Map<string, number>();
    const sideA = new Map<string, number>();
    const byes = new Map<string, number>();
    for (const round of legRounds) {
      for (const pairing of round.pairings) {
        const pairKey = [sideKey(pairing.sideA), sideKey(pairing.sideB)].sort().join('|');
        pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
        sideA.set(sideKey(pairing.sideA), (sideA.get(sideKey(pairing.sideA)) ?? 0) + 1);
        totalSideA.set(sideKey(pairing.sideA), (totalSideA.get(sideKey(pairing.sideA)) ?? 0) + 1);
      }
      if (round.bye !== null) {
        byes.set(sideKey(round.bye), (byes.get(sideKey(round.bye)) ?? 0) + 1);
      }
    }
    if (pairCounts.size !== (n * (n - 1)) / 2) {
      violations.push(`n=${n} leg ${leg}: ${pairCounts.size} distinct pairs instead of ${(n * (n - 1)) / 2}`);
    }
    for (const [pairKey, count] of pairCounts) {
      if (count !== 1) {
        violations.push(`n=${n} leg ${leg}: ${pairKey} meets ${count} times`);
      }
    }
    for (const entrant of entrants) {
      const count = sideA.get(sideKey(entrant)) ?? 0;
      if (count < lo || count > hi) {
        violations.push(`n=${n} leg ${leg}: ${sideName(entrant)} is side A ${count} times`);
      }
      if (n % 2 === 1 && (byes.get(sideKey(entrant)) ?? 0) !== 1) {
        violations.push(`n=${n} leg ${leg}: ${sideName(entrant)} sits out ${byes.get(sideKey(entrant)) ?? 0} times`);
      }
    }
    if (leg >= 2) {
      for (let index = 0; index < perLeg; index += 1) {
        const previous = rounds[(leg - 2) * perLeg + index];
        const current = rounds[(leg - 1) * perLeg + index];
        if (!previous || !current) {
          continue;
        }
        const mirrored = previous.pairings.map((pairing) => `${sideKey(pairing.sideB)}>${sideKey(pairing.sideA)}`).join(',');
        const actual = current.pairings.map((pairing) => `${sideKey(pairing.sideA)}>${sideKey(pairing.sideB)}`).join(',');
        if (mirrored !== actual) {
          violations.push(`n=${n} leg ${leg}: round ${current.round} is not the mirror of round ${previous.round}`);
        }
      }
    }
  }
  if (legs === 2) {
    for (const entrant of entrants) {
      if ((totalSideA.get(sideKey(entrant)) ?? 0) !== n - 1) {
        violations.push(`n=${n} double round robin: ${sideName(entrant)} is side A ${totalSideA.get(sideKey(entrant)) ?? 0} times`);
      }
    }
  }
  return violations;
}

function refRoundName(teams: number, round: number): string {
  switch (teams) {
    case 2:
      return 'Final';
    case 4:
      return 'Semifinal';
    case 8:
      return 'Quarterfinal';
    case 16:
      return 'Round of 16';
    case 32:
      return 'Round of 32';
    default:
      return `Round ${round}`;
  }
}

interface KoRow {
  readonly kind: string;
  readonly round: number;
  readonly position: number;
  readonly a: string;
  readonly b: string;
  readonly isFinal: boolean;
  readonly roundName: string;
}

interface RefBracket {
  readonly size: number;
  readonly totalRounds: number;
  readonly roundsPlayed: number;
  readonly rows: readonly KoRow[];
  readonly byes: readonly number[];
}

function refBracket(n: number, rounds: number | null, thirdPlace: boolean): RefBracket {
  const size = nextPow2(n);
  const totalRounds = Math.round(Math.log2(size));
  const roundsPlayed = rounds === null ? totalRounds : Math.min(rounds, totalRounds);
  const order = refOrder(size);
  const rows: KoRow[] = [];
  const byes: number[] = [];
  let advancing: string[] = [];
  for (let i = 0; i < size / 2; i += 1) {
    const a = order[2 * i];
    const b = order[2 * i + 1];
    if (b > n) {
      byes.push(a);
      advancing.push(`seed:${a}`);
    } else {
      rows.push({ kind: 'main', round: 1, position: i, a: `seed:${a}`, b: `seed:${b}`, isFinal: totalRounds === 1, roundName: refRoundName(size, 1) });
      advancing.push(`W:1:${i}`);
    }
  }
  for (let r = 2; r <= roundsPlayed; r += 1) {
    const next: string[] = [];
    for (let p = 0; p < advancing.length / 2; p += 1) {
      rows.push({
        kind: 'main',
        round: r,
        position: p,
        a: advancing[2 * p],
        b: advancing[2 * p + 1],
        isFinal: r === totalRounds,
        roundName: refRoundName(size / 2 ** (r - 1), r),
      });
      next.push(`W:${r}:${p}`);
    }
    advancing = next;
  }
  if (thirdPlace && roundsPlayed === totalRounds && n >= 4) {
    rows.push({
      kind: 'third_place',
      round: totalRounds,
      position: 0,
      a: `L:${totalRounds - 1}:0`,
      b: `L:${totalRounds - 1}:1`,
      isFinal: false,
      roundName: 'Third place',
    });
  }
  return { size, totalRounds, roundsPlayed, rows, byes: [...byes].sort((x, y) => x - y) };
}

function describeSide(plan: KnockoutBracketPlan, entrants: readonly FixtureSide[], stageId: string, side: FixtureSide): string {
  const seed = entrants.findIndex((entrant) => sideKey(entrant) === sideKey(side));
  if (seed >= 0) {
    return `seed:${seed + 1}`;
  }
  if (side.kind === 'slot') {
    const slot = plan.slots.find((candidate) => candidate.id === side.slotId);
    if (!slot) {
      return `missing-slot:${side.slotId}`;
    }
    if ((slot.source.kind === 'bracket_winner' || slot.source.kind === 'bracket_loser') && slot.source.stageId === stageId) {
      return `${slot.source.kind === 'bracket_winner' ? 'W' : 'L'}:${slot.source.round}:${slot.source.position}`;
    }
    return `unexpected-source:${slot.source.kind}`;
  }
  return `unknown-team:${side.teamId}`;
}

function rowKey(row: KoRow): string {
  return `${row.kind}|${String(row.round).padStart(3, '0')}|${String(row.position).padStart(3, '0')}`;
}

function describePlan(plan: KnockoutBracketPlan, entrants: readonly FixtureSide[], stageId: string): KoRow[] {
  return plan.fixtures
    .map((draft) => ({
      kind: draft.bracket === null ? 'none' : draft.bracket.kind,
      round: draft.bracket === null ? -1 : draft.bracket.round,
      position: draft.bracket === null ? -1 : draft.bracket.position,
      a: describeSide(plan, entrants, stageId, draft.sideA),
      b: describeSide(plan, entrants, stageId, draft.sideB),
      isFinal: draft.isFinal,
      roundName: draft.bracket === null ? '' : draft.bracket.roundName,
    }))
    .sort((x, y) => rowKey(x).localeCompare(rowKey(y)));
}

function buildBracket(
  entrants: readonly FixtureSide[],
  opts: { readonly thirdPlacePlayoff?: boolean; readonly rounds?: number | null; readonly firstSlotIndex?: number; readonly startMatchNumber?: number; readonly prefix?: string } = {},
): KnockoutBracketPlan {
  return knockoutBracket(
    entrants,
    {
      thirdPlacePlayoff: opts.thirdPlacePlayoff ?? false,
      rounds: opts.rounds ?? null,
      firstSlotIndex: opts.firstSlotIndex ?? entrants.length,
      defaults: defaultsOf({ stageId: 'ko', startMatchNumber: opts.startMatchNumber ?? 1 }),
    },
    idGen(opts.prefix ?? 'ko'),
  );
}

function refFixtureLabels(rows: readonly KoRow[], size: number): Map<string, string> {
  const labels = new Map<string, string>();
  const mains = rows.filter((row) => row.kind === 'main');
  const rounds = [...new Set(mains.map((row) => row.round))];
  for (const round of rounds) {
    const teams = size / 2 ** (round - 1);
    const inRound = mains.filter((row) => row.round === round).sort((x, y) => x.position - y.position);
    inRound.forEach((row, index) => {
      if (teams === 2) {
        labels.set(rowKey(row), 'Final');
      } else if (teams === 4) {
        labels.set(rowKey(row), `SF${index + 1}`);
      } else if (teams === 8) {
        labels.set(rowKey(row), `QF${index + 1}`);
      }
    });
  }
  for (const row of rows.filter((candidate) => candidate.kind === 'third_place')) {
    labels.set(rowKey(row), 'Third place');
  }
  return labels;
}

function summaryOf(teamAId: TeamId, teamBId: TeamId, result: MatchResult): MatchSummary {
  const winner = (() => {
    switch (result.type) {
      case 'win':
      case 'walkover':
        return result.winnerTeamId;
      case 'awarded':
        return result.winnerTeamId;
      case 'tie':
        return result.decider ? result.decider.winnerTeamId : null;
      default:
        return null;
    }
  })();
  return {
    summaryVersion: 2,
    matchId: 'm-1',
    teamAId,
    teamBId,
    status: result.type === 'abandoned' ? 'abandoned' : 'completed',
    result,
    winnerTeamId: winner,
    ballsPerOver: 6,
    innings: [],
    superOvers: [],
    squads: [],
    completedAt: NOW,
  };
}

function poolSeeded(pool: number, position: number): SeededEntrant {
  return { side: S(`${String.fromCharCode(65 + pool)}${position}`), rank: null, poolIndex: pool, poolPosition: position };
}

function firstRoundPairs(order: readonly FixtureSide[]): string[] {
  const n = order.length;
  const size = nextPow2(n);
  const bracketOrder = refOrder(size);
  const pairs: string[] = [];
  for (let i = 0; i < size / 2; i += 1) {
    const a = bracketOrder[2 * i];
    const b = bracketOrder[2 * i + 1];
    if (b <= n) {
      pairs.push(`${sideName(order[a - 1])} v ${sideName(order[b - 1])}`);
    }
  }
  return pairs;
}

function poolLetter(label: string): string {
  return label.replace(/[0-9]+$/, '');
}

function membersOf(assignment: PoolAssignment): string[][] {
  return assignment.pools.map((pool) => pool.members.map(sideKey));
}

function slotLabel(slots: readonly StageSlot[], side: FixtureSide): string {
  if (side.kind === 'team') {
    return side.teamId;
  }
  return slots.find((candidate) => candidate.id === side.slotId)?.label ?? side.slotId;
}

describe('adversarial: seeded randomness', () => {
  it('reference model reproduces the documented golden values', () => {
    const one = refMulberry32(1);
    expect([one(), one(), one()].map((value) => value.toFixed(10))).toEqual(['0.6270739406', '0.0027357212', '0.5274470400']);
    const big = refMulberry32(847291);
    expect([big(), big(), big()].map((value) => value.toFixed(10))).toEqual(['0.4183025225', '0.6612153111', '0.4243005631']);
    expect(refFnv1a('Spring Cup 2026')).toBe(520673282);
  });

  it('mulberry32 follows the §2.1 algorithm for 200 draws of edge seeds (0, 2^31, 2^32-1, …)', () => {
    const seeds = [0, 1, 2, 42, 847291, 2147483647, 2147483648, 4294967295, 123456789, 520673282];
    const mismatches: string[] = [];
    for (const seed of seeds) {
      const actual = mulberry32(seed);
      const expected = refMulberry32(seed);
      for (let draw = 0; draw < 200; draw += 1) {
        const a = actual();
        const e = expected();
        if (a !== e) {
          mismatches.push(`seed ${seed} draw ${draw}: ${a} vs ${e}`);
          break;
        }
        if (a < 0 || a >= 1) {
          mismatches.push(`seed ${seed} draw ${draw}: ${a} outside [0,1)`);
          break;
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it.each<[number | string, number]>([
    ['847291', 847291],
    [847291, 847291],
    [4294967297, 1],
    [4294967296, 0],
    [-1, 4294967295],
    [-4294967297, 4294967295],
    ['0', 0],
    ['abc', 440920331],
    ['Summer Cup 2026', 3343153722],
    ['Spring Cup 2026', 520673282],
    ['  Spring Cup 2026  ', 520673282],
    ['Spring Cup', refFnv1a('Spring Cup')],
  ])('normalizeSeed(%p) = %p (§2.2 integers mod 2^32, text FNV-1a of the trimmed string)', (input, expected) => {
    expect(normalizeSeed(input)).toBe(expected);
  });

  it('normalizeSeed reduces a long digit string exactly modulo 2^32 (2^64 + 1 → 1)', () => {
    expect(normalizeSeed('18446744073709551617')).toBe(1);
    expect(normalizeSeed('4294967296000000000007')).toBe(7);
  });

  it('shuffle is the §2.2 Fisher–Yates for every size 0..40 and several seeds, never touching the input', () => {
    const mismatches: string[] = [];
    for (let size = 0; size <= 40; size += 1) {
      for (const seed of [1, 7, 847291, 4294967295]) {
        const items = deepFreeze(Array.from({ length: size }, (_, index) => `x${index}`));
        const actual = shuffle(items, mulberry32(seed));
        const expected = refShuffle(items, refMulberry32(seed));
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          mismatches.push(`size ${size} seed ${seed}`);
        }
        if (actual === items) {
          mismatches.push(`size ${size} seed ${seed}: returned the input array`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('adversarial: round robin combinatorics', () => {
  const sizes = [...Array.from({ length: 39 }, (_, index) => index + 2), 128];

  it('matches the §4.1 circle method (pairing order, sides, byes, round numbers) for n = 2..40 and 128 with 1, 2 and 3 legs', () => {
    const mismatches: string[] = [];
    for (const n of sizes) {
      for (const legs of [1, 2, 3]) {
        const entrants = teamsOf(n);
        const actual = canonRounds(roundRobin(entrants, legs));
        const expected = canonRounds(refRoundRobin(entrants, legs));
        if (actual.length !== expected.length || actual.some((round, i) => round !== expected[i])) {
          const index = expected.findIndex((round, i) => round !== actual[i]);
          mismatches.push(`n=${n} legs=${legs}: first difference at round ${index + 1}: got ${actual[index]} expected ${expected[index]}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('invariants hold for n = 2..40 and 128 with 1, 2 and 3 legs (pairs once per leg, byes, no double booking, balance, mirroring)', () => {
    const violations: string[] = [];
    for (const n of sizes) {
      for (const legs of [1, 2, 3]) {
        const entrants = deepFreeze(teamsOf(n));
        violations.push(...roundRobinViolations(entrants, legs, roundRobin(entrants, legs)));
      }
    }
    expect(violations.slice(0, 20)).toEqual([]);
  });

  it('three legs replay leg 1 in leg 3 with identical sides and leg 2 mirrored (custom encounters)', () => {
    for (const n of [4, 5, 9, 12]) {
      const entrants = teamsOf(n);
      const rounds = roundRobin(entrants, 3);
      const perLeg = n % 2 === 0 ? n - 1 : n;
      const leg = (k: number) => rounds.filter((round) => round.leg === k).map((round) => round.pairings.map((p) => `${sideKey(p.sideA)}>${sideKey(p.sideB)}`));
      expect(leg(3)).toEqual(leg(1));
      expect(rounds.filter((round) => round.leg === 3).map((round) => round.round)).toEqual(
        Array.from({ length: perLeg }, (_, index) => 2 * perLeg + index + 1),
      );
      const pairMeetings = new Map<string, string[]>();
      for (const round of rounds) {
        for (const pairing of round.pairings) {
          const pairKey = [sideKey(pairing.sideA), sideKey(pairing.sideB)].sort().join('|');
          pairMeetings.set(pairKey, [...(pairMeetings.get(pairKey) ?? []), sideKey(pairing.sideA)]);
        }
      }
      for (const [, homes] of pairMeetings) {
        expect(homes).toHaveLength(3);
        expect(homes[0]).not.toBe(homes[1]);
        expect(homes[2]).toBe(homes[0]);
      }
    }
  });

  it('odd fields: the bye marker is fixed, so the bye moves from the last entrant to the first (E, D, C, B, A for five)', () => {
    for (const n of [3, 5, 7, 9, 11, 21, 39]) {
      const entrants = teamsOf(n);
      const byes = roundRobin(entrants, 1).map((round) => (round.bye === null ? null : sideName(round.bye)));
      expect(byes).toEqual(entrants.map(sideName).reverse());
    }
  });

  it('slot entrants and mixed team/slot fields produce the same schedule shape as teams', () => {
    for (const n of [6, 7]) {
      const teamField = teamsOf(n);
      const mixedField = teamField.map((side, index) => (index % 2 === 0 ? side : S(`slot-${index}`)));
      const shape = (field: readonly FixtureSide[]) =>
        roundRobin(field, 2).map((round) => ({
          round: round.round,
          leg: round.leg,
          bye: round.bye === null ? null : field.findIndex((side) => sideKey(side) === sideKey(round.bye as FixtureSide)),
          pairs: round.pairings.map((p) => [field.findIndex((side) => sideKey(side) === sideKey(p.sideA)), field.findIndex((side) => sideKey(side) === sideKey(p.sideB))]),
        }));
      expect(shape(mixedField)).toEqual(shape(teamField));
    }
  });

  it('128 teams, 3 legs: 24,384 drafts numbered contiguously in round order within 3x the 100 ms budget', () => {
    const entrants = teamsOf(128);
    const started = performance.now();
    const rounds = roundRobin(entrants, 3);
    const drafts = draftsFromRoundRobin(rounds, defaultsOf({ startMatchNumber: 101, poolId: 'pool-1' }), idGen('d'));
    const elapsed = performance.now() - started;
    console.log(`adversarial round robin 128 teams x 3 legs + drafts: ${elapsed.toFixed(1)} ms`);
    expect(elapsed).toBeLessThan(300);
    expect(drafts).toHaveLength(3 * 8128);
    expect(drafts.every((draft, index) => draft.matchNumber === 101 + index)).toBe(true);
    expect(new Set(drafts.map((draft) => draft.id)).size).toBe(drafts.length);
    for (let index = 1; index < drafts.length; index += 1) {
      expect((drafts[index].round ?? 0) >= (drafts[index - 1].round ?? 0)).toBe(true);
    }
    expect(drafts.every((draft) => draft.status === 'scheduled' && draft.bracket === null && !draft.isFinal && draft.poolId === 'pool-1')).toBe(true);
    expect(new Set(drafts.map((draft) => draft.leg))).toEqual(new Set([1, 2, 3]));
  });

  it('refuses fewer than two entrants and fewer than one leg', () => {
    expect(() => roundRobin([], 1)).toThrow();
    expect(() => roundRobin(teamsOf(1), 1)).toThrow();
    expect(() => roundRobin(teamsOf(4), 0)).toThrow();
    expect(() => roundRobin(teamsOf(4), -1)).toThrow();
  });
});

describe('adversarial: pool distribution and draws', () => {
  it('distributePoolSizes is the §3.1 near-even split for every n = 1..128 and p = 1..min(n, 16)', () => {
    const mismatches: string[] = [];
    for (let n = 1; n <= 128; n += 1) {
      for (let p = 1; p <= Math.min(n, 16); p += 1) {
        const actual = [...distributePoolSizes(n, p)];
        const expected = refPoolSizes(n, p);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          mismatches.push(`(${n}, ${p}): ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
        }
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  it('distributePoolSizes with more pools than teams follows the formula and leaves trailing pools empty (3 teams, 5 pools → 1,1,1,0,0)', () => {
    expect([...distributePoolSizes(3, 5)]).toEqual([1, 1, 1, 0, 0]);
  });

  it('assignRandom = shuffle(members, mulberry32(seed)) filled into pools in order, for many seeds, fields and explicit sizes', () => {
    const mismatches: string[] = [];
    const cases: { n: number; spec: { poolCount: number } | { sizes: number[] } }[] = [
      { n: 16, spec: { poolCount: 4 } },
      { n: 10, spec: { poolCount: 3 } },
      { n: 13, spec: { poolCount: 4 } },
      { n: 10, spec: { sizes: [3, 3, 4] } },
      { n: 11, spec: { sizes: [5, 2, 4] } },
      { n: 28, spec: { poolCount: 27 } },
      { n: 128, spec: { poolCount: 16 } },
    ];
    for (const { n, spec } of cases) {
      const members = deepFreeze(teamsOf(n).map((side, index) => (index % 3 === 2 ? S(`slot-${index}`) : side)));
      const sizes = 'sizes' in spec ? spec.sizes : refPoolSizes(n, spec.poolCount);
      const poolIds = sizes.map((_, index) => `p${index}`);
      for (const seed of [1, 99, 847291, 4294967295]) {
        const actual = assignRandom(members, spec, poolIds, seed);
        const shuffled = refShuffle(members, refMulberry32(seed));
        let offset = 0;
        const expected = sizes.map((size, index) => {
          const pool = { poolId: poolIds[index], name: refPoolName(index), members: shuffled.slice(offset, offset + size).map(sideKey) };
          offset += size;
          return pool;
        });
        const got = actual.pools.map((pool) => ({ poolId: pool.poolId, name: pool.name, members: pool.members.map(sideKey) }));
        if (JSON.stringify(got) !== JSON.stringify(expected) || actual.seed !== seed) {
          mismatches.push(`n=${n} spec=${JSON.stringify(spec)} seed=${seed}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('same seed → identical pools; 200 different seeds → at least 195 different draws (16 teams, 4 pools)', () => {
    const members = teamsOf(16);
    const poolIds = ['pA', 'pB', 'pC', 'pD'];
    expect(assignRandom(members, { poolCount: 4 }, poolIds, 58213)).toEqual(assignRandom(members, { poolCount: 4 }, poolIds, 58213));
    const signatures = new Set<string>();
    for (let seed = 1; seed <= 200; seed += 1) {
      signatures.add(JSON.stringify(membersOf(assignRandom(members, { poolCount: 4 }, poolIds, seed))));
    }
    expect(signatures.size).toBeGreaterThanOrEqual(195);
  });

  it('an organizer text seed ("Spring Cup") replays the same draw and the documented 847291 draw is exact', () => {
    const members = Array.from({ length: 16 }, (_, index) => T(`T${String(index + 1).padStart(2, '0')}`));
    const poolIds = ['pA', 'pB', 'pC', 'pD'];
    const seed = normalizeSeed('Spring Cup');
    expect(assignRandom(members, { poolCount: 4 }, poolIds, seed)).toEqual(assignRandom(members, { poolCount: 4 }, poolIds, normalizeSeed(' Spring Cup ')));
    const golden = assignRandom(members, { poolCount: 4 }, poolIds, normalizeSeed('847291'));
    expect(golden.pools.map((pool) => pool.members.map(sideName).join(' '))).toEqual([
      'T02 T12 T08 T04',
      'T09 T01 T11 T03',
      'T14 T15 T16 T05',
      'T13 T06 T10 T07',
    ]);
  });

  it('assignSeeded snake-deals 10 teams into 4 uneven pools with gapped seeds and unseeded teams last by name', () => {
    const input = [
      { teamId: 'Zulu', seed: null, name: 'Zulu' },
      { teamId: 's40', seed: 40, name: 'Forty' },
      { teamId: 's3', seed: 3, name: 'Three' },
      { teamId: 'Alpha', seed: null, name: 'Alpha' },
      { teamId: 's11', seed: 11, name: 'Eleven' },
      { teamId: 's1', seed: 1, name: 'One' },
      { teamId: 's25', seed: 25, name: 'TwentyFive' },
      { teamId: 's7', seed: 7, name: 'Seven' },
      { teamId: 's19', seed: 19, name: 'Nineteen' },
      { teamId: 's2', seed: 2, name: 'Two' },
    ];
    const result = assignSeeded(deepFreeze(input), ['pA', 'pB', 'pC', 'pD']);
    expect(result.seed).toBeNull();
    expect(result.pools.map((pool) => pool.members.map(sideName))).toEqual([
      ['s1', 's40', 'Alpha'],
      ['s2', 's25', 'Zulu'],
      ['s3', 's19'],
      ['s7', 's11'],
    ]);
  });

  it('assignSeeded breaks equal seeds by name and keeps a 2-pool snake A, B, B, A', () => {
    const input = [
      { teamId: 'z', seed: 1, name: 'Zebras' },
      { teamId: 'a', seed: 1, name: 'Antelopes' },
      { teamId: 'm', seed: 2, name: 'Mongoose' },
      { teamId: 'c', seed: 2, name: 'Cobras' },
    ];
    expect(assignSeeded(input, ['pA', 'pB']).pools.map((pool) => pool.members.map(sideName))).toEqual([
      ['a', 'm'],
      ['z', 'c'],
    ]);
  });

  it('assignSlotsToPools snake: 4 → 4 groups never reunites two qualifiers of one pool; 4 → 3 follows A, B, C, C, B, A…', () => {
    const labels = ['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'C2', 'D2'];
    const slots = labels.map((slotLabelText, index) => ({ slotId: slotLabelText, index }));
    const four = assignSlotsToPools([...slots].reverse(), ['g1', 'g2', 'g3', 'g4'], { kind: 'snake' });
    expect(four.pools.map((pool) => pool.members.map(sideName))).toEqual([
      ['A1', 'D2'],
      ['B1', 'C2'],
      ['C1', 'B2'],
      ['D1', 'A2'],
    ]);
    for (const pool of four.pools) {
      expect(new Set(pool.members.map((member) => poolLetter(sideName(member)))).size).toBe(pool.members.length);
    }
    const three = assignSlotsToPools(slots, ['g1', 'g2', 'g3'], { kind: 'snake' });
    expect(three.pools.map((pool) => pool.members.map(sideName))).toEqual([
      ['A1', 'B2', 'C2'],
      ['B1', 'A2', 'D2'],
      ['C1', 'D1'],
    ]);
  });

  it('move / swap / replace across 300 random organizer edits keep every other member in its pool and order', () => {
    const rng = refMulberry32(20260930);
    const initialMembers = [...teamsOf(12), ...Array.from({ length: 6 }, (_, index) => S(`slot-${index}`))];
    let current = assignRandom(initialMembers, { poolCount: 4 }, ['pA', 'pB', 'pC', 'pD'], 777);
    const failures: string[] = [];
    for (let step = 0; step < 300; step += 1) {
      const before = deepFreeze(current);
      const snapshot = JSON.stringify(before);
      const lists = membersOf(before);
      const all = before.pools.flatMap((pool) => pool.members);
      const pick = () => all[Math.floor(rng() * all.length)];
      const op = Math.floor(rng() * 3);
      let next: PoolAssignment;
      let expected: string[][];
      if (op === 0) {
        const member = pick();
        const from = lists.findIndex((list) => list.includes(sideKey(member)));
        let to = Math.floor(rng() * lists.length);
        if (to === from) {
          to = (to + 1) % lists.length;
        }
        expected = lists.map((list) => list.filter((entry) => entry !== sideKey(member)));
        expected[to] = [...expected[to], sideKey(member)];
        next = moveMember(before, member, before.pools[to].poolId);
      } else if (op === 1) {
        const x = pick();
        let y = pick();
        while (sideKey(y) === sideKey(x)) {
          y = pick();
        }
        expected = lists.map((list) => list.map((entry) => (entry === sideKey(x) ? sideKey(y) : entry === sideKey(y) ? sideKey(x) : entry)));
        next = swapMembers(before, x, y);
      } else {
        const out = pick();
        const incoming = step % 2 === 0 ? T(`new-${step}`) : S(`new-slot-${step}`);
        expected = lists.map((list) => list.map((entry) => (entry === sideKey(out) ? sideKey(incoming) : entry)));
        next = replaceMember(before, out, incoming);
      }
      if (JSON.stringify(before) !== snapshot) {
        failures.push(`step ${step}: input mutated`);
      }
      if (JSON.stringify(membersOf(next)) !== JSON.stringify(expected)) {
        failures.push(`step ${step} op ${op}: ${JSON.stringify(membersOf(next))} vs ${JSON.stringify(expected)}`);
      }
      if (JSON.stringify(next.pools.map((pool) => [pool.poolId, pool.name])) !== JSON.stringify(before.pools.map((pool) => [pool.poolId, pool.name]))) {
        failures.push(`step ${step}: pool ids or names changed`);
      }
      current = next;
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });

  it('replace refuses an incoming member that already sits in a pool (§3.3: "in must not be assigned anywhere")', () => {
    const assignment = assignRandom(teamsOf(8), { poolCount: 2 }, ['pA', 'pB'], 5);
    const inA = assignment.pools[0].members[0];
    const inB = assignment.pools[1].members[0];
    expect(() => replaceMember(assignment, inA, inB)).toThrow();
  });

  it('poolWarnings: 9 group entrants in 3 even pools plus a semifinal direct entry raise nothing; an unassigned slot entrant is listed', () => {
    const entrants = teamsOf(9);
    const assignment = assignRandom(entrants, { poolCount: 3 }, ['pA', 'pB', 'pC'], 11);
    expect(poolWarnings(assignment, entrants)).toEqual([]);
    const slotEntrants = ['A1', 'B1', 'C1', 'A2', 'B2', 'C2'].map(S);
    const partial = assignSlotsToPools(
      ['A1', 'B1', 'C1', 'A2', 'B2'].map((slotId, index) => ({ slotId, index })),
      ['g1', 'g2'],
      { kind: 'snake' },
    );
    const warnings = poolWarnings(partial, slotEntrants);
    const unassigned = warnings.find((warning) => warning.code === 'UNASSIGNED_TEAMS');
    expect(unassigned?.members.map(sideName)).toEqual(['C2']);
    const uneven = warnings.find((warning) => warning.code === 'UNEVEN_POOLS');
    expect(uneven?.message).toBe('Teams in different pools may play different numbers of matches.');
  });
});

describe('adversarial: fixture drafts, validation and scheduling', () => {
  it('10 teams in 4/3/3 pools with double round robin for the 3-team pools: 18 clean drafts, then duplicates and strangers are caught', () => {
    const entrants = teamsOf(10);
    const assignment = assignRandom(entrants, { poolCount: 3 }, ['pA', 'pB', 'pC'], 2026);
    expect(assignment.pools.map((pool) => pool.members.length)).toEqual([4, 3, 3]);
    const legsByPool = new Map<string, number>([
      ['pB', 2],
      ['pC', 2],
    ]);
    const ids = idGen('fx');
    let nextNumber = 1;
    const drafts: FixtureDraft[] = [];
    for (const pool of assignment.pools) {
      const legs = legsByPool.get(pool.poolId) ?? 1;
      const poolDrafts = draftsFromRoundRobin(roundRobin(pool.members, legs), defaultsOf({ poolId: pool.poolId, startMatchNumber: nextNumber }), ids);
      nextNumber += poolDrafts.length;
      drafts.push(...poolDrafts);
    }
    expect(drafts).toHaveLength(18);
    expect(drafts.map((draft) => draft.matchNumber)).toEqual(Array.from({ length: 18 }, (_, index) => index + 1));
    const context = {
      poolMembers: Object.fromEntries(assignment.pools.map((pool) => [pool.poolId, pool.members])),
      tournamentSides: entrants,
      legsByPool,
      defaultLegs: 1,
      startDate: null,
      endDate: null,
    };
    expect(validateFixtureDrafts(drafts, context)).toEqual([]);
    const [a1, a2] = assignment.pools[0].members;
    const [b1, b2] = assignment.pools[1].members;
    const extraA: FixtureDraft = { ...drafts[0], id: 'extra-a', matchNumber: 19, sideA: a1, sideB: a2 };
    const extraB1: FixtureDraft = { ...drafts[6], id: 'extra-b', matchNumber: 20, poolId: 'pB', sideA: b1, sideB: b2 };
    const stranger: FixtureDraft = { ...drafts[0], id: 'stranger', matchNumber: 21, poolId: 'pA', sideA: a1, sideB: b1 };
    const outsider: FixtureDraft = { ...drafts[0], id: 'outsider', matchNumber: 22, poolId: null, sideA: a1, sideB: T('ghost') };
    const issues = validateFixtureDrafts([...drafts, extraA, extraB1, stranger, outsider], context);
    const codes = (fixtureId: string) => issues.filter((issue) => issue.fixtureId === fixtureId).map((issue) => `${issue.code}:${issue.severity}`);
    expect(issues.filter((issue) => issue.code === 'DUPLICATE_ENCOUNTER').every((issue) => issue.severity === 'warning')).toBe(true);
    expect(issues.filter((issue) => issue.code === 'DUPLICATE_ENCOUNTER').length).toBeGreaterThanOrEqual(2);
    expect(issues.filter((issue) => issue.code === 'DUPLICATE_ENCOUNTER').every((issue) => issue.message.trim().length > 0)).toBe(true);
    expect(codes('stranger')).toContain('SIDE_NOT_IN_POOL:error');
    expect(codes('outsider')).toContain('SIDE_NOT_IN_TOURNAMENT:error');
    expect(issues.filter((issue) => issue.severity === 'error').map((issue) => issue.fixtureId).sort()).toEqual(['outsider', 'stranger']);
  });

  it('scheduleSequential over an 8-team double round robin never double-books a side or overfills a day and skips rest days', () => {
    const drafts = draftsFromRoundRobin(roundRobin(teamsOf(8), 2), defaultsOf(), idGen('s'));
    const times = ['09:00', '13:00', '17:00'];
    const restDates = ['2026-05-03', '2026-05-10', '2026-05-11'];
    const scheduled = scheduleSequential(drafts, { startDate: '2026-04-29', matchesPerDay: 3, times, restDates });
    expect(scheduled).toHaveLength(drafts.length);
    expect(new Set(scheduled.map((draft) => draft.id))).toEqual(new Set(drafts.map((draft) => draft.id)));
    const byDate = new Map<string, FixtureDraft[]>();
    for (const draft of scheduled) {
      expect(draft.scheduledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(times).toContain(draft.scheduledTime);
      const date = draft.scheduledDate as string;
      byDate.set(date, [...(byDate.get(date) ?? []), draft]);
    }
    for (const [date, onDay] of byDate) {
      expect(date >= '2026-04-29').toBe(true);
      expect(restDates).not.toContain(date);
      expect(onDay.length).toBeLessThanOrEqual(3);
      const sides = onDay.flatMap((draft) => [sideKey(draft.sideA), sideKey(draft.sideB)]);
      expect(new Set(sides).size).toBe(sides.length);
      expect(new Set(onDay.map((draft) => draft.scheduledTime)).size).toBe(onDay.length);
    }
    const issues = validateFixtureDrafts(scheduled, {
      poolMembers: {},
      tournamentSides: teamsOf(8),
      legsByPool: new Map(),
      defaultLegs: 2,
      startDate: '2026-04-29',
      endDate: '2026-12-31',
    });
    expect(issues).toEqual([]);
  });

  it.each<[string, string[]]>([
    ['2000-02-28', ['2000-02-28', '2000-02-29', '2000-03-01', '2000-03-02']],
    ['2100-02-27', ['2100-02-27', '2100-02-28', '2100-03-01', '2100-03-02']],
    ['2028-02-28', ['2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02']],
    ['2027-02-27', ['2027-02-27', '2027-02-28', '2027-03-01', '2027-03-02']],
    ['2026-12-30', ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']],
    ['2027-04-29', ['2027-04-29', '2027-04-30', '2027-05-01', '2027-05-02']],
  ])('scheduleSequential calendar arithmetic from %s (century leap rule, month and year ends)', (startDate, expected) => {
    const drafts = [0, 1, 2, 3].map((index) => ({
      ...draftsFromRoundRobin(roundRobin([T(`a${index}`), T(`b${index}`)], 1), defaultsOf({ startMatchNumber: index + 1 }), idGen(`c${index}`))[0],
      round: index + 1,
    }));
    const scheduled = scheduleSequential(drafts, { startDate, matchesPerDay: 1, times: ['10:00'] });
    expect(scheduled.map((draft) => draft.scheduledDate)).toEqual(expected);
  });

  it('scheduleSequential walks two pools in round order: both pools’ round 1 on day 1, round 2 on day 2, round 3 on day 3', () => {
    const ids = idGen('two');
    const poolA = draftsFromRoundRobin(roundRobin(teamsOf(4, 'A'), 1), defaultsOf({ poolId: 'pA', startMatchNumber: 1 }), ids);
    const poolB = draftsFromRoundRobin(roundRobin(teamsOf(4, 'B'), 1), defaultsOf({ poolId: 'pB', startMatchNumber: 7 }), ids);
    const scheduled = scheduleSequential([...poolA, ...poolB], {
      startDate: '2026-06-01',
      matchesPerDay: 4,
      times: ['09:00', '11:30', '14:00', '16:30'],
    });
    const dayOfRound = new Map<number, Set<string>>();
    for (const draft of scheduled) {
      const round = draft.round ?? 0;
      dayOfRound.set(round, new Set([...(dayOfRound.get(round) ?? []), draft.scheduledDate ?? 'none']));
    }
    expect([...dayOfRound.entries()].sort((x, y) => x[0] - y[0]).map(([round, days]) => [round, [...days]])).toEqual([
      [1, ['2026-06-01']],
      [2, ['2026-06-02']],
      [3, ['2026-06-03']],
    ]);
  });

  it('scheduleSequential skips a rest day that is the start date and cycles times when a day holds more matches than time slots', () => {
    const drafts = draftsFromRoundRobin(roundRobin(teamsOf(8), 1), defaultsOf(), idGen('cyc'));
    const scheduled = scheduleSequential(drafts, { startDate: '2026-07-04', matchesPerDay: 4, times: ['10:00', '14:00'], restDates: ['2026-07-04'] });
    const dates = [...new Set(scheduled.map((draft) => draft.scheduledDate))].sort();
    expect(dates[0]).toBe('2026-07-05');
    const firstDay = scheduled.filter((draft) => draft.scheduledDate === '2026-07-05');
    expect(firstDay).toHaveLength(4);
    expect(firstDay.map((draft) => draft.scheduledTime).sort()).toEqual(['10:00', '10:00', '14:00', '14:00']);
  });

  it('validateFixtureDrafts counts encounters per pool: a group meeting plus a knockout or Super 8 rematch is not a duplicate, but a clash in time is', () => {
    const group = { ...draftsFromRoundRobin(roundRobin([T('LIO'), T('TIG')], 1), defaultsOf({ poolId: 'pA' }), idGen('g'))[0], scheduledDate: '2026-05-01', scheduledTime: '10:00' };
    const superEight = { ...group, id: 'super8', stageId: 'stage-2', poolId: 'g1', matchNumber: 2, scheduledDate: '2026-05-08' };
    const final = { ...group, id: 'final', stageId: 'stage-3', poolId: null, matchNumber: 3, isFinal: true, scheduledDate: '2026-05-15' };
    const clash = { ...group, id: 'clash', stageId: 'stage-3', poolId: null, matchNumber: 4, sideA: T('LIO'), sideB: T('KNG'), scheduledDate: '2026-05-01', scheduledTime: '10:00' };
    const context = {
      poolMembers: { pA: [T('LIO'), T('TIG')], g1: [T('LIO'), T('TIG')] },
      tournamentSides: [T('LIO'), T('TIG'), T('KNG')],
      legsByPool: new Map<string, number>(),
      defaultLegs: 1,
      startDate: '2026-05-01',
      endDate: null,
    };
    expect(validateFixtureDrafts([group, superEight, final], context)).toEqual([]);
    const issues = validateFixtureDrafts([group, superEight, final, clash], context);
    expect(issues.map((issue) => `${issue.code}:${issue.severity}`)).toContain('TEAM_DOUBLE_BOOKED:warning');
    expect(issues.some((issue) => issue.code === 'DUPLICATE_ENCOUNTER')).toBe(false);
    const early = { ...clash, id: 'early', sideB: T('TIG'), scheduledDate: '2026-04-30' };
    expect(validateFixtureDrafts([early], context).map((issue) => issue.code)).toEqual(['OUTSIDE_TOURNAMENT_DATES']);
    const selfSlot = { ...clash, id: 'self', sideA: S('A1'), sideB: S('A1'), scheduledDate: null, scheduledTime: null };
    expect(validateFixtureDrafts([selfSlot], { ...context, tournamentSides: [S('A1')] }).map((issue) => `${issue.code}:${issue.severity}`)).toContain('SAME_SIDE_TWICE:error');
  });

  describe('fixturesForPoolMove (§4.4, §33 Move)', () => {
    const poolA = ['Tigers', 'Lions', 'Eagles', 'Hawks'].map(T);
    const poolC = ['Kings', 'Royals', 'Titans'].map(T);
    const poolAFixtures = (() => {
      const drafts = draftsFromRoundRobin(roundRobin(poolA, 1), defaultsOf({ poolId: 'pA' }), idGen('a'));
      return drafts.map((draft) => {
        const pair = [sideName(draft.sideA), sideName(draft.sideB)].sort().join('-');
        if (pair === 'Lions-Tigers') {
          return fixtureOf({ ...draft, status: 'completed', matchId: 'm-played', matchSides: { teamAId: sideName(draft.sideA), teamBId: sideName(draft.sideB) } });
        }
        if (pair === 'Eagles-Lions') {
          return fixtureOf({ ...draft, status: 'postponed' });
        }
        return fixtureOf(draft);
      });
    })();
    const elsewhere = [
      fixtureOf({ id: 'other-pool', poolId: 'pX', sideA: T('Lions'), sideB: T('Kings') }),
      fixtureOf({ id: 'match-created', poolId: 'pA', sideA: T('Hawks'), sideB: T('Lions'), matchId: 'm-created', status: 'scheduled' }),
    ];

    it('removes exactly Lions’ unplayed Pool A fixtures and creates Lions v Kings #25, Royals v Lions #26, Lions v Titans #27', () => {
      const result = fixturesForPoolMove(
        {
          member: T('Lions'),
          fromPoolId: 'pA',
          fixtures: deepFreeze([...poolAFixtures, ...elsewhere]),
          targetMembers: poolC,
          legs: 1,
          defaults: defaultsOf({ poolId: 'pC', startMatchNumber: 25 }),
        },
        idGen('new'),
      );
      const expectedRemoved = poolAFixtures
        .filter((fx) => fx.matchId === null && [fx.sideA, fx.sideB].some((side) => sideName(side) === 'Lions'))
        .map((fx) => fx.id)
        .sort();
      expect(expectedRemoved).toHaveLength(2);
      expect([...result.removeFixtureIds].sort()).toEqual(expectedRemoved);
      expect(result.addFixtures.map((draft) => `${draft.matchNumber} ${sideName(draft.sideA)} v ${sideName(draft.sideB)}`)).toEqual([
        '25 Lions v Kings',
        '26 Royals v Lions',
        '27 Lions v Titans',
      ]);
      expect(result.addFixtures.every((draft) => draft.poolId === 'pC' && draft.stageId === 'stage-1' && draft.status === 'scheduled')).toBe(true);
    });

    it.each([2, 3])('with %i legs every target member meets the mover once per leg, sides alternating leg by leg, numbered contiguously', (legs) => {
      const result = fixturesForPoolMove(
        { member: T('Lions'), fromPoolId: 'pA', fixtures: poolAFixtures, targetMembers: poolC, legs, defaults: defaultsOf({ poolId: 'pC', startMatchNumber: 40 }) },
        idGen('new'),
      );
      expect(result.addFixtures).toHaveLength(3 * legs);
      expect(result.addFixtures.map((draft) => draft.matchNumber).sort((x, y) => x - y)).toEqual(Array.from({ length: 3 * legs }, (_, index) => 40 + index));
      expect(new Set(result.addFixtures.map((draft) => draft.id)).size).toBe(3 * legs);
      for (const opponent of poolC) {
        const meetings = result.addFixtures
          .filter((draft) => [draft.sideA, draft.sideB].some((side) => sideKey(side) === sideKey(opponent)))
          .sort((x, y) => x.matchNumber - y.matchNumber);
        expect(meetings).toHaveLength(legs);
        expect(meetings.every((draft) => [draft.sideA, draft.sideB].some((side) => sideName(side) === 'Lions'))).toBe(true);
        const lionsHome = meetings.map((draft) => sideName(draft.sideA) === 'Lions');
        for (let index = 1; index < lionsHome.length; index += 1) {
          expect(lionsHome[index]).toBe(!lionsHome[index - 1]);
        }
      }
    });
  });
});

describe('adversarial: knockout bracket geometry for every size 2..33', () => {
  const sizes = Array.from({ length: 32 }, (_, index) => index + 2);

  it('standardBracketOrder follows the §5.1 recursion for 2..128 and keeps the top 2^k seeds in different 1/2^k sections', () => {
    for (const size of [2, 4, 8, 16, 32, 64, 128]) {
      const order = [...standardBracketOrder(size)];
      expect(order).toEqual(refOrder(size));
      for (let i = 0; i < size / 2; i += 1) {
        expect(order[2 * i] + order[2 * i + 1]).toBe(size + 1);
      }
      for (let sections = 2; sections <= size; sections *= 2) {
        const width = size / sections;
        const sectionOf = (seed: number) => Math.floor(order.indexOf(seed) / width);
        const tops = Array.from({ length: sections }, (_, index) => sectionOf(index + 1));
        expect(new Set(tops).size).toBe(sections);
      }
    }
  });

  it('bracketShape matches size / totalRounds / roundsPlayed / winners for n = 2..33 and every rounds value', () => {
    for (const n of sizes) {
      const size = nextPow2(n);
      const totalRounds = Math.round(Math.log2(size));
      for (const rounds of [null, ...Array.from({ length: totalRounds + 2 }, (_, index) => index + 1)]) {
        const roundsPlayed = rounds === null ? totalRounds : Math.min(rounds, totalRounds);
        expect(bracketShape(n, rounds)).toEqual({ size, totalRounds, roundsPlayed, winners: size / 2 ** roundsPlayed });
      }
    }
  });

  it('fixtures, sides, byes, bracket positions, round names and the single final match §5.1 for n = 2..33 (with and without third place)', () => {
    const mismatches: string[] = [];
    for (const n of sizes) {
      for (const thirdPlace of [false, true]) {
        const entrants = deepFreeze(teamsOf(n, 's'));
        const plan = buildBracket(entrants, { thirdPlacePlayoff: thirdPlace, startMatchNumber: 50 });
        const expected = refBracket(n, null, thirdPlace);
        const actualRows = describePlan(plan, entrants, 'ko');
        const expectedRows = [...expected.rows].sort((x, y) => rowKey(x).localeCompare(rowKey(y)));
        if (JSON.stringify(actualRows) !== JSON.stringify(expectedRows)) {
          const first = expectedRows.findIndex((row, index) => JSON.stringify(row) !== JSON.stringify(actualRows[index]));
          mismatches.push(`n=${n} third=${thirdPlace}: expected ${JSON.stringify(expectedRows[first])} got ${JSON.stringify(actualRows[first])}`);
        }
        const byeSeeds = plan.byes.map((side) => entrants.findIndex((entrant) => sideKey(entrant) === sideKey(side)) + 1);
        if (JSON.stringify(byeSeeds) !== JSON.stringify(expected.byes)) {
          mismatches.push(`n=${n}: byes ${JSON.stringify(byeSeeds)} vs ${JSON.stringify(expected.byes)}`);
        }
        if (plan.fixtures.filter((draft) => draft.isFinal).length !== 1) {
          mismatches.push(`n=${n}: ${plan.fixtures.filter((draft) => draft.isFinal).length} finals`);
        }
        const numbers = plan.fixtures.map((draft) => draft.matchNumber).sort((x, y) => x - y);
        if (JSON.stringify(numbers) !== JSON.stringify(Array.from({ length: numbers.length }, (_, index) => 50 + index))) {
          mismatches.push(`n=${n}: match numbers ${JSON.stringify(numbers)}`);
        }
        const ids = [...plan.fixtures.map((draft) => draft.id), ...plan.slots.map((slotItem) => slotItem.id)];
        if (new Set(ids).size !== ids.length) {
          mismatches.push(`n=${n}: duplicate ids`);
        }
        const rounds = plan.fixtures.map((draft) => draft.bracket?.round ?? 0);
        if (rounds.some((round, index) => index > 0 && round < rounds[index - 1])) {
          mismatches.push(`n=${n}: fixtures are not first round first`);
        }
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  it('fixture labels number existing fixtures per round (QF1…, SF1…, Final, Third place) and progression slot labels follow them', () => {
    const mismatches: string[] = [];
    for (const n of sizes) {
      const entrants = teamsOf(n, 's');
      const plan = buildBracket(entrants, { thirdPlacePlayoff: true });
      const expected = refBracket(n, null, true);
      const labels = refFixtureLabels(expected.rows, expected.size);
      const rows = plan.fixtures.map((draft) => ({
        draft,
        row: {
          kind: draft.bracket?.kind ?? 'none',
          round: draft.bracket?.round ?? -1,
          position: draft.bracket?.position ?? -1,
          a: '',
          b: '',
          isFinal: draft.isFinal,
          roundName: '',
        },
      }));
      for (const { draft, row } of rows) {
        const want = labels.get(rowKey(row));
        if (want !== undefined && draft.label !== want) {
          mismatches.push(`n=${n} ${rowKey(row)}: label ${draft.label} vs ${want}`);
        }
      }
      for (const slotItem of plan.slots) {
        if (slotItem.source.kind !== 'bracket_winner' && slotItem.source.kind !== 'bracket_loser') {
          mismatches.push(`n=${n}: progression slot with source ${slotItem.source.kind}`);
          continue;
        }
        const fixtureLabel = labels.get(rowKey({ kind: 'main', round: slotItem.source.round, position: slotItem.source.position, a: '', b: '', isFinal: false, roundName: '' }));
        if (fixtureLabel !== undefined && fixtureLabel !== 'Final') {
          const want = `${slotItem.source.kind === 'bracket_winner' ? 'Winner' : 'Loser'} ${fixtureLabel}`;
          if (slotItem.label !== want) {
            mismatches.push(`n=${n}: slot label ${slotItem.label} vs ${want}`);
          }
        }
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  it('progression slots: role progression, seed null, one per winner that plays on (+ two semifinal losers), each used by exactly one side, indexed contiguously from firstSlotIndex', () => {
    const mismatches: string[] = [];
    for (const n of sizes) {
      for (const thirdPlace of [false, true]) {
        const entrants = teamsOf(n, 's');
        const firstSlotIndex = n + 3;
        const plan = buildBracket(entrants, { thirdPlacePlayoff: thirdPlace, firstSlotIndex });
        const expected = refBracket(n, null, thirdPlace);
        const winners = expected.rows.filter((row) => row.kind === 'main' && row.round < expected.roundsPlayed).length;
        const losers = expected.rows.some((row) => row.kind === 'third_place') ? 2 : 0;
        if (plan.slots.length !== winners + losers) {
          mismatches.push(`n=${n} third=${thirdPlace}: ${plan.slots.length} slots vs ${winners + losers}`);
        }
        const indexes = plan.slots.map((slotItem) => slotItem.index).sort((x, y) => x - y);
        if (JSON.stringify(indexes) !== JSON.stringify(Array.from({ length: plan.slots.length }, (_, index) => firstSlotIndex + index))) {
          mismatches.push(`n=${n}: indexes ${JSON.stringify(indexes)}`);
        }
        for (const slotItem of plan.slots) {
          if (slotItem.role !== 'progression' || slotItem.seed !== null || slotItem.stageId !== 'ko') {
            mismatches.push(`n=${n}: slot ${slotItem.label} role ${slotItem.role} seed ${slotItem.seed} stage ${slotItem.stageId}`);
          }
          const uses = plan.fixtures.flatMap((draft) => [draft.sideA, draft.sideB]).filter((side) => side.kind === 'slot' && side.slotId === slotItem.id).length;
          if (uses !== 1) {
            mismatches.push(`n=${n}: slot ${slotItem.label} used ${uses} times`);
          }
        }
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  it('progression slots are indexed as §5.3 lists them: winners by round and position, then the semifinal losers', () => {
    const mismatches: string[] = [];
    for (const n of sizes.filter((size) => size >= 4)) {
      const plan = buildBracket(teamsOf(n, 's'), { thirdPlacePlayoff: true, firstSlotIndex: n });
      const ordered = [...plan.slots].sort((x, y) => x.index - y.index).map((slotItem) =>
        slotItem.source.kind === 'bracket_winner' || slotItem.source.kind === 'bracket_loser'
          ? `${slotItem.source.kind === 'bracket_winner' ? 'W' : 'L'}:${String(slotItem.source.round).padStart(2, '0')}:${String(slotItem.source.position).padStart(3, '0')}`
          : 'other',
      );
      const expected = [...ordered.filter((entry) => entry.startsWith('W')).sort(), ...ordered.filter((entry) => !entry.startsWith('W')).sort()];
      if (JSON.stringify(ordered) !== JSON.stringify(expected)) {
        mismatches.push(`n=${n}: ${ordered.join(' ')}`);
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it('when the higher seed always wins, round r is contested by exactly the top P/2^(r-1) seeds and the final is seed 1 v seed 2', () => {
    const mismatches: string[] = [];
    for (const n of sizes) {
      const entrants = teamsOf(n, 's');
      const plan = buildBracket(entrants, { thirdPlacePlayoff: true });
      const size = nextPow2(n);
      const winnerOf = new Map<string, number>();
      const loserOf = new Map<string, number>();
      const participants = new Map<number, number[]>();
      const resolve = (side: FixtureSide): number => {
        const described = describeSide(plan, entrants, 'ko', side);
        if (described.startsWith('seed:')) {
          return Number(described.slice(5));
        }
        const [kind, round, position] = described.split(':');
        const value = (kind === 'W' ? winnerOf : loserOf).get(`${round}:${position}`);
        return value ?? Number.NaN;
      };
      const mains = plan.fixtures.filter((draft) => draft.bracket?.kind === 'main');
      for (const draft of mains) {
        const a = resolve(draft.sideA);
        const b = resolve(draft.sideB);
        const round = draft.bracket?.round ?? 0;
        participants.set(round, [...(participants.get(round) ?? []), a, b]);
        winnerOf.set(`${round}:${draft.bracket?.position}`, Math.min(a, b));
        loserOf.set(`${round}:${draft.bracket?.position}`, Math.max(a, b));
      }
      for (const [round, seeds] of participants) {
        const sorted = [...seeds].sort((x, y) => x - y);
        const expected =
          round === 1
            ? Array.from({ length: 2 * n - size }, (_, index) => size - n + 1 + index)
            : Array.from({ length: size / 2 ** (round - 1) }, (_, index) => index + 1);
        if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
          mismatches.push(`n=${n} round ${round}: ${sorted.join(',')}`);
        }
      }
      const final = plan.fixtures.find((draft) => draft.isFinal);
      if (!final || [resolve(final.sideA), resolve(final.sideB)].sort().join(',') !== '1,2') {
        mismatches.push(`n=${n}: final is not 1 v 2`);
      }
      const third = plan.fixtures.find((draft) => draft.bracket?.kind === 'third_place');
      if (n >= 4 && (!third || [resolve(third.sideA), resolve(third.sideB)].sort().join(',') !== '3,4')) {
        mismatches.push(`n=${n}: third-place play-off is not 3 v 4`);
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  it('rounds limit (1 … totalRounds + 2): stops early with no final, no third place and no progression out of the last played round', () => {
    const mismatches: string[] = [];
    for (const n of sizes.filter((size) => size >= 3)) {
      const size = nextPow2(n);
      const totalRounds = Math.round(Math.log2(size));
      for (let rounds = 1; rounds <= totalRounds + 2; rounds += 1) {
        const entrants = teamsOf(n, 's');
        const plan = buildBracket(entrants, { thirdPlacePlayoff: true, rounds });
        const expected = refBracket(n, rounds, true);
        const actualRows = describePlan(plan, entrants, 'ko');
        const expectedRows = [...expected.rows].sort((x, y) => rowKey(x).localeCompare(rowKey(y)));
        if (JSON.stringify(actualRows) !== JSON.stringify(expectedRows)) {
          mismatches.push(`n=${n} rounds=${rounds}: ${actualRows.length} fixtures vs ${expectedRows.length}`);
        }
        const winners = expected.rows.filter((row) => row.kind === 'main' && row.round < expected.roundsPlayed).length;
        const losers = expected.rows.some((row) => row.kind === 'third_place') ? 2 : 0;
        if (plan.slots.length !== winners + losers) {
          mismatches.push(`n=${n} rounds=${rounds}: ${plan.slots.length} progression slots vs ${winners + losers}`);
        }
        const finals = plan.fixtures.filter((draft) => draft.isFinal).length;
        if (finals !== (expected.roundsPlayed === totalRounds ? 1 : 0)) {
          mismatches.push(`n=${n} rounds=${rounds}: ${finals} finals`);
        }
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  it('entrySlotSeeds give every slot entrant its seed (index + 1); team entrants get none', () => {
    for (const n of [2, 3, 6, 8, 13]) {
      const slotEntrants = Array.from({ length: n }, (_, index) => S(`entry-${index}`));
      const plan = buildBracket(slotEntrants, { firstSlotIndex: n });
      expect([...plan.entrySlotSeeds].sort((x, y) => x.seed - y.seed)).toEqual(slotEntrants.map((side, index) => ({ slotId: sideName(side), seed: index + 1 })));
      expect(buildBracket(teamsOf(n, 's')).entrySlotSeeds).toEqual([]);
    }
  });

  it('§5.3 six entrants, exactly: QF1 4 v 5, QF2 3 v 6, SF1 1 v Winner QF1, SF2 2 v Winner QF2, Final, Third place; slots in the listed order', () => {
    const entrants = teamsOf(6, 's');
    const plan = buildBracket(entrants, { thirdPlacePlayoff: true, firstSlotIndex: 6 });
    const rendered = plan.fixtures.map((draft) => `${draft.label}: ${slotLabel(plan.slots, draft.sideA)} v ${slotLabel(plan.slots, draft.sideB)}`);
    expect(rendered).toEqual(
      expect.arrayContaining([
        'QF1: s004 v s005',
        'QF2: s003 v s006',
        'SF1: s001 v Winner QF1',
        'SF2: s002 v Winner QF2',
        'Final: Winner SF1 v Winner SF2',
        'Third place: Loser SF1 v Loser SF2',
      ]),
    );
    expect(rendered).toHaveLength(6);
    expect([...plan.slots].sort((x, y) => x.index - y.index).map((slotItem) => `${slotItem.index} ${slotItem.label}`)).toEqual([
      '6 Winner QF1',
      '7 Winner QF2',
      '8 Winner SF1',
      '9 Winner SF2',
      '10 Loser SF1',
      '11 Loser SF2',
    ]);
    expect(plan.byes.map(sideName)).toEqual(['s001', 's002']);
  });

  it('five entrants: seeds 2 and 3 meet directly in SF2 (both byes), SF1 is seed 1 v Winner QF1', () => {
    const plan = buildBracket(teamsOf(5, 's'), { firstSlotIndex: 5 });
    const rendered = plan.fixtures.map((draft) => `${draft.label}: ${slotLabel(plan.slots, draft.sideA)} v ${slotLabel(plan.slots, draft.sideB)}`);
    expect(rendered).toEqual(expect.arrayContaining(['QF1: s004 v s005', 'SF1: s001 v Winner QF1', 'SF2: s002 v s003', 'Final: Winner SF1 v Winner SF2']));
    expect(rendered).toHaveLength(4);
  });

  it('a re-draw with a different id generator keeps every progression slot source and label (they name positions, not fixture ids)', () => {
    for (const n of [4, 6, 11, 16]) {
      const first = buildBracket(teamsOf(n, 's'), { thirdPlacePlayoff: true, prefix: 'first' });
      const second = buildBracket(teamsOf(n, 's'), { thirdPlacePlayoff: true, prefix: 'second' });
      const view = (plan: KnockoutBracketPlan) => [...plan.slots].sort((x, y) => x.index - y.index).map((slotItem) => ({ index: slotItem.index, label: slotItem.label, source: slotItem.source }));
      expect(view(second)).toEqual(view(first));
      const fixtureIds = new Set(first.fixtures.map((draft) => draft.id));
      expect(first.slots.every((slotItem) => !JSON.stringify(slotItem.source).split('"').some((token) => fixtureIds.has(token)))).toBe(true);
    }
  });

  it.each<[number, number, string]>([
    [2, 3, 'Final'],
    [4, 2, 'Semifinal'],
    [8, 1, 'Quarterfinal'],
    [16, 2, 'Round of 16'],
    [32, 2, 'Round of 32'],
    [64, 1, 'Round 1'],
    [64, 2, 'Round 2'],
    [128, 1, 'Round 1'],
  ])('roundName(%i teams, round %i) = %s', (teams, round, expected) => {
    expect(roundName(teams, round)).toBe(expected);
  });

  it('refuses a bracket with fewer than two entrants', () => {
    expect(() => buildBracket([])).toThrow();
    expect(() => buildBracket(teamsOf(1, 's'))).toThrow();
  });
});

describe('adversarial: seeding methods', () => {
  it('fixed, 2 pools x 2: seed order A1, B1, A2, B2 → A1 v B2, B1 v A2', () => {
    const order = seedEntrants([poolSeeded(1, 2), poolSeeded(0, 1), poolSeeded(0, 2), poolSeeded(1, 1)], 'fixed', null);
    expect(order.map(sideName)).toEqual(['A1', 'B1', 'A2', 'B2']);
    expect(firstRoundPairs(order)).toEqual(['A1 v B2', 'B1 v A2']);
  });

  it('fixed, 4 pools x 2: seed order A1, B1, D1, C1, D2, C2, A2, B2 (§6.1)', () => {
    const entrants = [0, 1, 2, 3].flatMap((pool) => [poolSeeded(pool, 1), poolSeeded(pool, 2)]);
    const order = seedEntrants(entrants, 'fixed', null);
    expect(order.map(sideName)).toEqual(['A1', 'B1', 'D1', 'C1', 'D2', 'C2', 'A2', 'B2']);
    expect(firstRoundPairs(order)).toEqual(['A1 v B2', 'C1 v D2', 'B1 v A2', 'D1 v C2']);
  });

  it('fixed, 8 pools x 2: coupled pools meet crosswise and every pool winner is in the other half from its runner-up', () => {
    const entrants = Array.from({ length: 8 }, (_, pool) => [poolSeeded(pool, 1), poolSeeded(pool, 2)]).flat();
    const order = seedEntrants(entrants, 'fixed', null);
    expect(firstRoundPairs(order)).toEqual(['A1 v B2', 'C1 v D2', 'E1 v F2', 'G1 v H2', 'B1 v A2', 'D1 v C2', 'F1 v E2', 'H1 v G2']);
    const bracket = refOrder(16);
    const half = (label: string) => Math.floor(bracket.indexOf(order.findIndex((side) => sideName(side) === label) + 1) / 8);
    for (const letter of 'ABCDEFGH') {
      expect(half(`${letter}1`)).not.toBe(half(`${letter}2`));
    }
  });

  it('fixed, p = 2..9 pools x 2: a permutation of the entrants with no same-pool first-round match', () => {
    const failures: string[] = [];
    for (let pools = 2; pools <= 9; pools += 1) {
      const entrants = Array.from({ length: pools }, (_, pool) => [poolSeeded(pool, 1), poolSeeded(pool, 2)]).flat();
      let order: readonly FixtureSide[] = [];
      try {
        order = seedEntrants(deepFreeze(entrants), 'fixed', null);
      } catch (error) {
        failures.push(`${pools} pools: threw ${(error as Error).message}`);
        continue;
      }
      if (JSON.stringify(order.map(sideKey).sort()) !== JSON.stringify(entrants.map((entrant) => sideKey(entrant.side)).sort())) {
        failures.push(`${pools} pools: not a permutation`);
      }
      for (const pair of firstRoundPairs(order)) {
        const [left, right] = pair.split(' v ');
        if (poolLetter(left) === poolLetter(right)) {
          failures.push(`${pools} pools: same-pool first-round match ${pair}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('fixed, 3 pools x 2: byes to A1 and B1, first round repaired to A2 v C2 and C1 v B2 (§6.1 example)', () => {
    const entrants = [0, 1, 2].flatMap((pool) => [poolSeeded(pool, 1), poolSeeded(pool, 2)]);
    const order = seedEntrants(entrants, 'fixed', null);
    expect(order.slice(0, 2).map(sideName)).toEqual(['A1', 'B1']);
    expect(firstRoundPairs(order)).toEqual(['A2 v C2', 'C1 v B2']);
  });

  it('fixed, 2 pools x 4 into quarterfinals: A1 v B4, B2 v A3, B1 v A4, A2 v B3', () => {
    const entrants = [0, 1].flatMap((pool) => [1, 2, 3, 4].map((position) => poolSeeded(pool, position)));
    expect(firstRoundPairs(seedEntrants(entrants, 'fixed', null))).toEqual(['A1 v B4', 'B2 v A3', 'B1 v A4', 'A2 v B3']);
  });

  it('fixed, pool winners of 4 pools into semifinals: A1 v D1, B1 v C1', () => {
    const entrants = [3, 1, 0, 2].map((pool) => poolSeeded(pool, 1));
    expect(firstRoundPairs(seedEntrants(entrants, 'fixed', null))).toEqual(['A1 v D1', 'B1 v C1']);
  });

  it('fixed, top 4 of a single league: 1st v 4th and 2nd v 3rd (the unavoidable same-pool pairing is kept)', () => {
    const entrants = [4, 2, 3, 1].map((position) => poolSeeded(0, position));
    expect(firstRoundPairs(seedEntrants(entrants, 'fixed', null))).toEqual(['A1 v A4', 'A2 v A3']);
  });

  it('fixed, three pool winners + best runner-up: the best runner-up is seeded last and meets A1', () => {
    const bestRunnerUp: SeededEntrant = { side: S('BestRU'), rank: null, poolIndex: null, poolPosition: null };
    const entrants = [poolSeeded(2, 1), bestRunnerUp, poolSeeded(0, 1), poolSeeded(1, 1)];
    const order = seedEntrants(entrants, 'fixed', null);
    expect(order.map(sideName)).toEqual(['A1', 'B1', 'C1', 'BestRU']);
    expect(firstRoundPairs(order)).toEqual(['A1 v BestRU', 'B1 v C1']);
  });

  it('random = shuffle(entrants, mulberry32(seed)) (§6.2): reproducible, seed-dependent, and a seed is required', () => {
    const entrants = Array.from({ length: 12 }, (_, index): SeededEntrant => ({ side: T(`e${index}`), rank: index + 1, poolIndex: null, poolPosition: null }));
    for (const seed of [1, 58213, 847291]) {
      expect(seedEntrants(entrants, 'random', seed).map(sideKey)).toEqual(refShuffle(entrants, refMulberry32(seed)).map((entrant) => sideKey(entrant.side)));
    }
    const draws = new Set(Array.from({ length: 50 }, (_, index) => JSON.stringify(seedEntrants(entrants, 'random', index + 1).map(sideKey))));
    expect(draws.size).toBeGreaterThanOrEqual(48);
    expect(() => seedEntrants(entrants, 'random', null)).toThrow();
  });

  it('ranking: rank 1 is seed 1 and the quarterfinals pair ranks 1v8, 4v5, 2v7, 3v6', () => {
    const ranks = [5, 3, 8, 1, 7, 2, 6, 4];
    const entrants = ranks.map((rank): SeededEntrant => ({ side: T(`r${rank}`), rank, poolIndex: rank % 2, poolPosition: 1 }));
    const order = seedEntrants(entrants, 'ranking', null);
    expect(order.map(sideName)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']);
    expect(firstRoundPairs(order)).toEqual(['r1 v r8', 'r4 v r5', 'r2 v r7', 'r3 v r6']);
  });

  it('knockoutGenerationGuard: ranking waits for all 6 qualifiers (EC-T-20 wording); fixed and random may use pending slots', () => {
    const resolution = (index: number, status: SlotResolution['status']): SlotResolution => ({
      slotId: `slot-${index}`,
      teamId: status === 'pending' ? null : `team-${index}`,
      status,
      viaOverride: false,
      explanation: '',
    });
    const mixed = [0, 1, 2, 3, 4, 5].map((index) => resolution(index, index < 4 ? 'final' : index === 4 ? 'provisional' : 'pending'));
    expect(knockoutGenerationGuard('ranking', mixed)).toEqual({ ok: false, reason: 'Seeding by ranking is possible once all 6 qualifiers are known.' });
    expect(knockoutGenerationGuard('ranking', mixed.map((entry) => ({ ...entry, status: 'final' as const, teamId: 'x' }))).ok).toBe(true);
    expect(knockoutGenerationGuard('fixed', mixed).ok).toBe(true);
    expect(knockoutGenerationGuard('random', mixed).ok).toBe(true);
  });
});

describe('adversarial: knockout advancement for every result type', () => {
  const ko = fixtureOf({ id: 'sf1', stageId: 'ko', sideA: S('A1'), sideB: S('B2'), bracket: { kind: 'main', round: 1, position: 0, roundName: 'Semifinal' } });
  const config = (overrides: Partial<KnockoutConfig>): KnockoutConfig => ({ ...DEFAULT_KNOCKOUT_CONFIG, ...overrides });
  const seeds = (map: Record<string, number | null>) => (teamId: TeamId) => (teamId in map ? map[teamId] : null);
  const tie = (method: 'super_over' | 'boundary_count' | 'bowl_out' | 'coin_toss' | 'organizer', winnerTeamId: TeamId): MatchResult => ({
    type: 'tie',
    decider: { method, winnerTeamId, superOverRounds: method === 'super_over' ? 1 : 0 },
  });
  const win = (winnerTeamId: TeamId, loserTeamId: TeamId): MatchResult => ({
    type: 'win',
    winnerTeamId,
    loserTeamId,
    margin: { kind: 'runs', runs: 12 },
    method: 'normal',
  });

  it.each<[string, MatchResult, Partial<KnockoutConfig>, Record<string, number | null>, [string | null, string | null, string]]>([
    ['win by the lower seed', win('TIG', 'LIO'), {}, { LIO: 1, TIG: 4 }, ['TIG', 'LIO', 'result']],
    ['walkover', { type: 'walkover', winnerTeamId: 'LIO', loserTeamId: 'TIG', reason: null }, {}, { LIO: 1, TIG: 4 }, ['LIO', 'TIG', 'walkover']],
    ['awarded with winner', { type: 'awarded', winnerTeamId: 'TIG', loserTeamId: 'LIO', reason: 'Crowd trouble', margin: null }, {}, { LIO: 1, TIG: 4 }, ['TIG', 'LIO', 'awarded']],
    ['decided tie beats a higher_seed policy', tie('super_over', 'TIG'), { tiedMatch: 'higher_seed' }, { LIO: 1, TIG: 4 }, ['TIG', 'LIO', 'tie_decider']],
    ['tie decided by coin toss', tie('coin_toss', 'LIO'), {}, { LIO: 1, TIG: 4 }, ['LIO', 'TIG', 'tie_decider']],
    ['tie decided by bowl-out', tie('bowl_out', 'TIG'), {}, { LIO: 1, TIG: 4 }, ['TIG', 'LIO', 'tie_decider']],
    ['tie decided by the organizer', tie('organizer', 'TIG'), { tiedMatch: 'organizer' }, { LIO: 1, TIG: 4 }, ['TIG', 'LIO', 'tie_decider']],
    ['undecided tie, higher_seed, side B seeded better', { type: 'tie', decider: null }, { tiedMatch: 'higher_seed' }, { LIO: 5, TIG: 2 }, ['TIG', 'LIO', 'higher_seed']],
    ['undecided tie, boundary_count still level', { type: 'tie', decider: null }, { tiedMatch: 'boundary_count' }, { LIO: 1, TIG: 4 }, [null, null, 'organizer_required']],
    ['undecided tie, super_over still tied', { type: 'tie', decider: null }, { tiedMatch: 'super_over' }, { LIO: 1, TIG: 4 }, [null, null, 'organizer_required']],
    ['undecided tie, higher_seed with one unknown seed', { type: 'tie', decider: null }, { tiedMatch: 'higher_seed' }, { LIO: 1, TIG: null }, [null, null, 'organizer_required']],
    ['undecided tie, higher_seed with equal seeds', { type: 'tie', decider: null }, { tiedMatch: 'higher_seed' }, { LIO: 3, TIG: 3 }, [null, null, 'organizer_required']],
    ['abandoned, higher_seed', { type: 'abandoned', reason: 'Rain' }, { noResult: 'higher_seed' }, { LIO: 6, TIG: 2 }, ['TIG', 'LIO', 'higher_seed']],
    ['awarded without winner, higher_seed', { type: 'awarded', winnerTeamId: null, loserTeamId: null, reason: 'Pitch unfit', margin: null }, { noResult: 'higher_seed' }, { LIO: 1, TIG: 4 }, ['LIO', 'TIG', 'higher_seed']],
    ['no result, higher_seed with an unknown seed', { type: 'no_result', reason: null }, { noResult: 'higher_seed' }, { LIO: null, TIG: 4 }, [null, null, 'organizer_required']],
    ['no result, shared', { type: 'no_result', reason: null }, { noResult: 'shared' }, { LIO: 1, TIG: 4 }, [null, null, 'shared']],
    ['awarded without winner, shared', { type: 'awarded', winnerTeamId: null, loserTeamId: null, reason: 'Both late', margin: null }, { noResult: 'shared' }, { LIO: 1, TIG: 4 }, [null, null, 'shared']],
    ['abandoned, replay', { type: 'abandoned', reason: null }, { noResult: 'replay' }, { LIO: 1, TIG: 4 }, [null, null, 'organizer_required']],
    ['awarded without winner, organizer', { type: 'awarded', winnerTeamId: null, loserTeamId: null, reason: 'x', margin: null }, { noResult: 'organizer' }, { LIO: 1, TIG: 4 }, [null, null, 'organizer_required']],
  ])('%s', (_name, result, overrides, seedMap, [winner, loser, basis]) => {
    const outcome = knockoutAdvancer(ko, { a: 'LIO', b: 'TIG' }, summaryOf('LIO', 'TIG', result), config(overrides), seeds(seedMap));
    expect(outcome).toEqual({ winnerTeamId: winner, loserTeamId: loser, basis });
  });

  it('not played → not_played under every policy combination', () => {
    for (const tiedMatch of ['super_over', 'boundary_count', 'higher_seed', 'organizer'] as const) {
      for (const noResult of ['higher_seed', 'replay', 'organizer', 'shared'] as const) {
        expect(knockoutAdvancer(ko, { a: 'LIO', b: 'TIG' }, null, config({ tiedMatch, noResult }), seeds({ LIO: 1, TIG: 2 }))).toEqual({
          winnerTeamId: null,
          loserTeamId: null,
          basis: 'not_played',
        });
      }
    }
  });

  it('higher_seed is applied to the frozen teams who played, not to the teams the slots resolve to now', () => {
    const played = fixtureOf({ ...ko, matchId: 'm-1', matchSides: { teamAId: 'TIG', teamBId: 'LIO' }, status: 'abandoned' });
    const outcome = knockoutAdvancer(played, { a: 'TIG', b: 'LIO' }, summaryOf('TIG', 'LIO', { type: 'no_result', reason: null }), config({ noResult: 'higher_seed' }), seeds({ KNG: 1, TIG: 2, LIO: 3 }));
    expect(outcome).toEqual({ winnerTeamId: 'TIG', loserTeamId: 'LIO', basis: 'higher_seed' });
  });
});

describe('adversarial: entry slot expansion', () => {
  const groups: Pool[] = [poolOf('pC', 'groups', 'Pool C', 2), poolOf('pA', 'groups', 'Pool A', 0), poolOf('pB', 'groups', 'Pool B', 1)];

  it('top 2 of three pools, two wildcards and two direct entries: contiguous indexes in rule order with the right sources', () => {
    const { slots, removed } = expandEntryRules(
      'ko',
      [
        { kind: 'top_per_pool', sourceStageId: 'groups', count: 2, fromPosition: 1 },
        { kind: 'manual', count: 2, label: 'Wildcard' },
        { kind: 'direct_entry', teamIds: ['LIO', 'TIG'] },
      ],
      { pools: new Map([['groups', deepFreeze(groups)]]), brackets: new Map() },
      [],
      idGen('slot'),
    );
    expect(removed).toEqual([]);
    expect(slots.map((slotItem) => slotItem.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(slots.every((slotItem) => slotItem.role === 'entry' && slotItem.seed === null && slotItem.stageId === 'ko')).toBe(true);
    expect(slots.slice(0, 6).map((slotItem) => slotItem.label)).toEqual(['A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
    expect(slots.slice(0, 6).map((slotItem) => slotItem.source)).toEqual(
      [
        ['pA', 1],
        ['pB', 1],
        ['pC', 1],
        ['pA', 2],
        ['pB', 2],
        ['pC', 2],
      ].map(([poolId, position]) => ({ kind: 'pool_position', stageId: 'groups', poolId, position })),
    );
    expect(slots.slice(6).map((slotItem) => slotItem.source)).toEqual([
      { kind: 'manual', teamId: null },
      { kind: 'manual', teamId: null },
      { kind: 'manual', teamId: 'LIO' },
      { kind: 'manual', teamId: 'TIG' },
    ]);
  });

  it('re-expansion when a fourth pool is added and removed again keeps slot ids by index and returns the surplus', () => {
    const rules = [{ kind: 'top_per_pool' as const, sourceStageId: 'groups', count: 2, fromPosition: 1 }];
    const three = expandEntryRules('ko', rules, { pools: new Map([['groups', groups]]), brackets: new Map() }, [], idGen('first')).slots;
    const withD = [...groups, poolOf('pD', 'groups', 'Pool D', 3)];
    const four = expandEntryRules('ko', rules, { pools: new Map([['groups', withD]]), brackets: new Map() }, three, idGen('second'));
    expect(four.slots.map((slotItem) => slotItem.label)).toEqual(['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'C2', 'D2']);
    expect(four.slots.slice(0, 6).map((slotItem) => slotItem.id)).toEqual(three.map((slotItem) => slotItem.id));
    expect(four.slots.slice(6).every((slotItem) => !three.some((old) => old.id === slotItem.id))).toBe(true);
    expect(four.removed).toEqual([]);
    const back = expandEntryRules('ko', rules, { pools: new Map([['groups', groups]]), brackets: new Map() }, four.slots, idGen('third'));
    expect(back.slots.map((slotItem) => slotItem.id)).toEqual(four.slots.slice(0, 6).map((slotItem) => slotItem.id));
    expect(back.removed.map((slotItem) => slotItem.id)).toEqual(four.slots.slice(6).map((slotItem) => slotItem.id));
    expect(back.slots.map((slotItem) => slotItem.label)).toEqual(['A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
  });

  it.each<[string, Parameters<typeof explainEntryRules>[0]]>([
    ['Top 2 from each pool', [{ kind: 'top_per_pool', sourceStageId: 'groups', count: 2, fromPosition: 1 }]],
    [
      'Pool winners + best 4 runners-up',
      [
        { kind: 'top_per_pool', sourceStageId: 'groups', count: 1, fromPosition: 1 },
        { kind: 'best_of_position', sourceStageId: 'groups', position: 2, count: 4, normalization: 'raw' },
      ],
    ],
    ['Top 8 overall', [{ kind: 'top_overall', sourceStageId: 'groups', count: 8, normalization: 'raw' }]],
    ['Organizer selects 4', [{ kind: 'manual', count: 4, label: 'TBD' }]],
    ['3rd and 4th of each pool', [{ kind: 'top_per_pool', sourceStageId: 'groups', count: 2, fromPosition: 3 }]],
    ['2 direct entries', [{ kind: 'direct_entry', teamIds: ['LIO', 'TIG'] }]],
  ])('explainEntryRules says "%s" (§98)', (expected, rules) => {
    expect(explainEntryRules(rules, new Map([['groups', 'Group stage']]))).toBe(expected);
  });

  it('defaultSlotLabel gives the short U-SLOT-13 labels', () => {
    const names = {
      poolName: (poolId: string) => (poolId === 'pA' ? 'Pool A' : 'Pool B'),
      fixtureLabel: (fixtureId: string) => (fixtureId === 'fx-qf3' ? 'QF3' : '?'),
      bracketLabel: (_stageId: string, round: number, position: number) => (round === 2 ? `SF${position + 1}` : `QF${position + 1}`),
    };
    expect(
      [
        defaultSlotLabel({ kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: 1 }, names),
        defaultSlotLabel({ kind: 'pool_position', stageId: 'groups', poolId: 'pB', position: 2 }, names),
        defaultSlotLabel({ kind: 'best_of_position', stageId: 'groups', position: 2, rank: 1, normalization: 'raw' }, names),
        defaultSlotLabel({ kind: 'bracket_winner', stageId: 'ko', round: 2, position: 0 }, names),
        defaultSlotLabel({ kind: 'bracket_loser', stageId: 'ko', round: 2, position: 1 }, names),
        defaultSlotLabel({ kind: 'fixture_winner', fixtureId: 'fx-qf3' }, names),
        defaultSlotLabel({ kind: 'manual', teamId: null }, names),
      ],
    ).toEqual(['A1', 'B2', 'Best runner-up', 'Winner SF1', 'Loser SF2', 'Winner QF3', 'TBD']);
  });

  it('knockout_winners of a six-team quarterfinal-only stage expand from its bracket shape: four bracket_winner slots, no fixtures needed', () => {
    const shape = bracketShape(6, 1);
    const { slots } = expandEntryRules(
      'sf',
      [{ kind: 'knockout_winners', sourceStageId: 'qf' }],
      { pools: new Map(), brackets: new Map([['qf', { lastRound: shape.roundsPlayed, positions: shape.winners }]]) },
      [],
      idGen('w'),
    );
    expect(slots.map((slotItem) => slotItem.source)).toEqual([0, 1, 2, 3].map((position) => ({ kind: 'bracket_winner', stageId: 'qf', round: 1, position })));
  });

  it('Super 8 workflow: top 2 of four pools → fixed-order groups A1 B2 C1 D2 / B1 A2 D1 C2 → clean round robins without a same-pool reunion', () => {
    const fourPools = [0, 1, 2, 3].map((index) => poolOf(`p${index}`, 'groups', refPoolName(index), index));
    const { slots } = expandEntryRules(
      'super8',
      [{ kind: 'top_per_pool', sourceStageId: 'groups', count: 2, fromPosition: 1 }],
      { pools: new Map([['groups', fourPools]]), brackets: new Map() },
      [],
      idGen('s8'),
    );
    const assignment = assignSlotsToPools(slots.map((slotItem) => ({ slotId: slotItem.id, index: slotItem.index })), ['g1', 'g2'], {
      kind: 'fixed_order',
      slotIndexesPerPool: [
        [0, 5, 2, 7],
        [1, 4, 3, 6],
      ],
    });
    expect(assignment.pools.map((pool) => pool.members.map((member) => slotLabel(slots, member)))).toEqual([
      ['A1', 'B2', 'C1', 'D2'],
      ['B1', 'A2', 'D1', 'C2'],
    ]);
    const ids = idGen('g');
    const drafts = assignment.pools.flatMap((pool, index) => draftsFromRoundRobin(roundRobin(pool.members, 1), defaultsOf({ stageId: 'super8', poolId: pool.poolId, startMatchNumber: 1 + index * 6 }), ids));
    expect(drafts).toHaveLength(12);
    expect(
      validateFixtureDrafts(drafts, {
        poolMembers: Object.fromEntries(assignment.pools.map((pool) => [pool.poolId, pool.members])),
        tournamentSides: slots.map((slotItem) => S(slotItem.id)),
        legsByPool: new Map(),
        defaultLegs: 1,
        startDate: null,
        endDate: null,
      }),
    ).toEqual([]);
    expect(poolWarnings(assignment, slots.map((slotItem) => S(slotItem.id)))).toEqual([]);
  });
});

function structureSnapshot(structure: InstantiatedStructure, template: TournamentTemplate, extra: Partial<TournamentSnapshot> = {}): TournamentSnapshot {
  return {
    version: '1',
    tournament: {
      id: structure.rules.tournamentId,
      name: 'Club Cup',
      season: null,
      description: null,
      logoUri: null,
      organizer: null,
      contact: null,
      location: null,
      notes: null,
      startDate: null,
      endDate: null,
      venueIds: [],
      structureKind: template.structureKind,
      status: 'structure_configured',
      createdAt: NOW,
      updatedAt: NOW,
    },
    rules: structure.rules,
    teams: [],
    stages: structure.stages,
    pools: structure.pools,
    poolEntries: structure.poolEntries,
    slots: structure.slots,
    fixtures: [],
    summaries: {},
    staleSummaryMatchIds: [],
    overrides: [],
    ...extra,
  };
}

function normalizeStructure(structure: InstantiatedStructure): unknown {
  const stageOrder = new Map(structure.stages.map((stage) => [stage.id, stage.orderIndex] as const));
  const tokens = new Map<string, string>();
  structure.stages.forEach((stage) => tokens.set(stage.id, `stage#${stage.orderIndex}`));
  structure.pools.forEach((pool) => tokens.set(pool.id, `pool#${stageOrder.get(pool.stageId)}#${pool.orderIndex}`));
  structure.slots.forEach((slotItem) => tokens.set(slotItem.id, `slot#${stageOrder.get(slotItem.stageId)}#${String(slotItem.index).padStart(3, '0')}`));
  const byToken = (x: { readonly id: string }, y: { readonly id: string }) => (tokens.get(x.id) ?? '').localeCompare(tokens.get(y.id) ?? '');
  const sorted = {
    rules: structure.rules,
    stages: [...structure.stages].sort((x, y) => x.orderIndex - y.orderIndex),
    pools: [...structure.pools].sort(byToken),
    slots: [...structure.slots].sort(byToken),
    poolEntries: structure.poolEntries.map((entry) => ({ poolId: entry.poolId, stageId: entry.stageId, side: entry.side, seed: entry.seed })),
  };
  const replaced = JSON.parse(JSON.stringify(sorted), (_key: string, value: unknown) => (typeof value === 'string' && tokens.has(value) ? tokens.get(value) : value)) as {
    poolEntries: unknown[];
  };
  replaced.poolEntries.sort((x, y) => stable(x).localeCompare(stable(y)));
  return replaced;
}

function templateStage(partial: Partial<TemplateStage> & Pick<TemplateStage, 'key' | 'name' | 'type'>): TemplateStage {
  return {
    poolCount: 0,
    poolSizes: null,
    poolSlotIndexes: null,
    fixtureGeneration: { method: 'knockout', legs: 1 },
    seeding: 'fixed',
    seedingNormalization: 'raw',
    entry: [],
    knockout: null,
    abandonedMatches: 'no_result',
    decidesChampion: false,
    headToHeadRequiresCompleteMiniLeague: false,
    formatId: null,
    matchRules: null,
    pointsSystem: null,
    tieBreakers: null,
    nrr: null,
    ...partial,
  };
}

function customTemplates(): TournamentTemplate[] {
  const base = builtinTemplates()[0];
  const qfThenFinalFour: TournamentTemplate = {
    ...base,
    id: 'user:qf-then-final-four',
    name: 'Groups, QF stage, final four',
    builtin: false,
    teamCount: 16,
    structureKind: 'custom',
    stages: [
      templateStage({ key: 'groups', name: 'Groups', type: 'group', poolCount: 4, fixtureGeneration: { method: 'round_robin', legs: 1 } }),
      templateStage({
        key: 'qf',
        name: 'Quarterfinals',
        type: 'knockout',
        entry: [{ kind: 'top_per_pool', sourceStageKey: 'groups', count: 2, fromPosition: 1 }],
        knockout: { ...DEFAULT_KNOCKOUT_CONFIG, rounds: 1 },
      }),
      templateStage({
        key: 'final4',
        name: 'Final four',
        type: 'knockout',
        entry: [{ kind: 'knockout_winners', sourceStageKey: 'qf' }],
        knockout: { ...DEFAULT_KNOCKOUT_CONFIG, thirdPlacePlayoff: true },
        decidesChampion: true,
      }),
    ],
  };
  const superEight: TournamentTemplate = {
    ...base,
    id: 'user:super-eight',
    name: 'Super 8',
    builtin: false,
    teamCount: 16,
    structureKind: 'custom',
    stages: [
      templateStage({ key: 'groups', name: 'Groups', type: 'group', poolCount: 4, fixtureGeneration: { method: 'round_robin', legs: 1 } }),
      templateStage({
        key: 'super8',
        name: 'Super 8',
        type: 'group',
        poolCount: 2,
        poolSlotIndexes: [
          [0, 5, 2, 7],
          [1, 4, 3, 6],
        ],
        fixtureGeneration: { method: 'round_robin', legs: 1 },
        entry: [{ kind: 'top_per_pool', sourceStageKey: 'groups', count: 2, fromPosition: 1 }],
      }),
      templateStage({
        key: 'semis',
        name: 'Semifinals',
        type: 'knockout',
        entry: [
          { kind: 'top_per_pool', sourceStageKey: 'super8', count: 2, fromPosition: 1 },
          { kind: 'direct_entry', count: 1 },
        ],
        knockout: DEFAULT_KNOCKOUT_CONFIG,
        decidesChampion: true,
      }),
    ],
  };
  const mixedEntries: TournamentTemplate = {
    ...base,
    id: 'user:mixed-entries',
    name: 'Mixed entry rules',
    builtin: false,
    teamCount: 10,
    structureKind: 'custom',
    stages: [
      templateStage({ key: 'groups', name: 'Groups', type: 'group', poolCount: 3, poolSizes: [4, 3, 3], fixtureGeneration: { method: 'round_robin', legs: 1 } }),
      templateStage({
        key: 'playoffs',
        name: 'Playoffs',
        type: 'knockout',
        seeding: 'ranking',
        seedingNormalization: 'per_match_average',
        entry: [
          { kind: 'pool_position', sourceStageKey: 'groups', poolIndex: 2, position: 1 },
          { kind: 'best_of_position', sourceStageKey: 'groups', position: 2, count: 2, normalization: 'per_match_average' },
          { kind: 'top_overall', sourceStageKey: 'groups', count: 2, normalization: 'raw' },
          { kind: 'manual', count: 1, label: 'Wildcard' },
        ],
        knockout: { ...DEFAULT_KNOCKOUT_CONFIG, tiedMatch: 'higher_seed', noResult: 'shared' },
        decidesChampion: true,
      }),
    ],
  };
  const cupAndPlate: TournamentTemplate = {
    ...base,
    id: 'user:cup-and-plate',
    name: 'Cup and Plate',
    builtin: false,
    teamCount: 16,
    structureKind: 'custom',
    stages: [
      templateStage({ key: 'groups', name: 'Groups', type: 'group', poolCount: 4, fixtureGeneration: { method: 'round_robin', legs: 1 } }),
      templateStage({
        key: 'cup',
        name: 'Cup',
        type: 'knockout',
        entry: [{ kind: 'top_per_pool', sourceStageKey: 'groups', count: 2, fromPosition: 1 }],
        knockout: DEFAULT_KNOCKOUT_CONFIG,
        decidesChampion: true,
      }),
      templateStage({
        key: 'plate',
        name: 'Plate',
        type: 'knockout',
        entry: [{ kind: 'top_per_pool', sourceStageKey: 'groups', count: 2, fromPosition: 3 }],
        knockout: { ...DEFAULT_KNOCKOUT_CONFIG, thirdPlacePlayoff: true },
      }),
    ],
  };
  return [qfThenFinalFour, superEight, mixedEntries, cupAndPlate];
}

describe('adversarial: templates', () => {
  const documented: Record<string, { teams: number; stages: number; groupPools: number | null; entryLabels: string[] | null; seeding: string }> = {
    'builtin:8-team-t20': { teams: 8, stages: 2, groupPools: 2, entryLabels: ['A1', 'B1', 'A2', 'B2'], seeding: 'fixed' },
    'builtin:4-team-league': { teams: 4, stages: 1, groupPools: 1, entryLabels: null, seeding: 'fixed' },
    'builtin:8-team-knockout': { teams: 8, stages: 1, groupPools: null, entryLabels: null, seeding: 'ranking' },
    'builtin:16-team-groups': { teams: 16, stages: 2, groupPools: 4, entryLabels: ['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'C2', 'D2'], seeding: 'fixed' },
    'builtin:20-team-pools': { teams: 20, stages: 2, groupPools: 4, entryLabels: ['A1', 'B1', 'C1', 'D1'], seeding: 'fixed' },
  };

  it('every built-in instantiates into a consistent structure for its team count (ids, order, pools, slot sources, one champion stage)', () => {
    const templates = builtinTemplates();
    expect(templates.map((template) => template.id).sort()).toEqual(Object.keys(documented).sort());
    for (const template of templates) {
      const spec = documented[template.id];
      expect(template.teamCount).toBe(spec.teams);
      expect(templateFitsTeamCount(template, spec.teams)).toEqual({ ok: true, message: null });
      expect(templateFitsTeamCount(template, spec.teams + 2)).toEqual({ ok: false, message: `Designed for ${spec.teams} teams; you have ${spec.teams + 2}.` });
      const structure = instantiateTemplate(template, { tournamentId: 'tour-x', now: NOW, ids: idGen(template.id) });
      expect(structure.rules.tournamentId).toBe('tour-x');
      expect(structure.stages).toHaveLength(spec.stages);
      expect(structure.stages.map((stage) => stage.orderIndex)).toEqual(structure.stages.map((_, index) => index));
      expect(structure.stages.map((stage) => stage.name)).toEqual(template.stages.map((stage) => stage.name));
      expect(structure.stages.every((stage) => stage.tournamentId === 'tour-x' && stage.status === 'pending')).toBe(true);
      expect(structure.stages.filter((stage) => stage.config.decidesChampion)).toHaveLength(1);
      const ids = [...structure.stages, ...structure.pools, ...structure.slots, ...structure.poolEntries].map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
      const stageById = new Map(structure.stages.map((stage) => [stage.id, stage] as const));
      for (const stage of structure.stages) {
        const pools = structure.pools.filter((pool) => pool.stageId === stage.id).sort((x, y) => x.orderIndex - y.orderIndex);
        expect(pools.map((pool) => pool.name)).toEqual(pools.map((_, index) => refPoolName(index)));
        const slots = structure.slots.filter((slotItem) => slotItem.stageId === stage.id).sort((x, y) => x.index - y.index);
        expect(slots.map((slotItem) => slotItem.index)).toEqual(slots.map((_, index) => index));
        for (const slotItem of slots) {
          expect(slotItem.role).toBe('entry');
          if ('stageId' in slotItem.source) {
            const source = stageById.get(slotItem.source.stageId);
            expect(source).toBeDefined();
            expect((source?.orderIndex ?? 99) < stage.orderIndex).toBe(true);
            if (slotItem.source.kind === 'pool_position') {
              const poolId = slotItem.source.poolId;
              expect(structure.pools.find((pool) => pool.id === poolId)?.stageId).toBe(slotItem.source.stageId);
            }
          }
        }
      }
      const champion = structure.stages.find((stage) => stage.config.decidesChampion);
      expect(champion?.config.seeding).toBe(spec.seeding);
      const first = structure.stages[0];
      if (spec.groupPools !== null) {
        expect(structure.pools.filter((pool) => pool.stageId === first.id)).toHaveLength(spec.groupPools);
      }
      if (spec.entryLabels !== null) {
        const koSlots = structure.slots.filter((slotItem) => slotItem.stageId === champion?.id).sort((x, y) => x.index - y.index);
        expect(koSlots.map((slotItem) => slotItem.label)).toEqual(spec.entryLabels);
      }
    }
  });

  it('4-team league plays a double round robin: 12 fixtures from its single pool', () => {
    const template = builtinTemplates().find((candidate) => candidate.id === 'builtin:4-team-league') as TournamentTemplate;
    const structure = instantiateTemplate(template, { tournamentId: 't', now: NOW, ids: idGen('l') });
    const stage = structure.stages[0];
    const legs = structure.pools[0].legs ?? stage.config.fixtureGeneration.legs;
    expect(stage.config.fixtureGeneration.method).toBe('round_robin');
    expect(draftsFromRoundRobin(roundRobin(teamsOf(4), legs), defaultsOf(), idGen('d'))).toHaveLength(12);
  });

  it.each<[string, number, string[], number]>([
    ['builtin:8-team-t20', 4, ['SF1: A1 v B2', 'SF2: B1 v A2', 'Final: Winner SF1 v Winner SF2'], 2],
    ['builtin:16-team-groups', 8, ['QF1: A1 v B2', 'QF2: C1 v D2', 'QF3: B1 v A2', 'QF4: D1 v C2', 'SF1: Winner QF1 v Winner QF2', 'SF2: Winner QF3 v Winner QF4', 'Final: Winner SF1 v Winner SF2'], 6],
    ['builtin:20-team-pools', 4, ['SF1: A1 v D1', 'SF2: B1 v C1', 'Final: Winner SF1 v Winner SF2'], 2],
  ])('%s organizer workflow: instantiate → fixed seeding → bracket from the entry slots', (templateId, entryCount, expectedFixtures, progressionCount) => {
    const template = builtinTemplates().find((candidate) => candidate.id === templateId) as TournamentTemplate;
    const structure = instantiateTemplate(template, { tournamentId: 't', now: NOW, ids: idGen('w') });
    const knockoutStage = structure.stages.find((stage) => stage.config.decidesChampion);
    const entrySlots = structure.slots.filter((slotItem) => slotItem.stageId === knockoutStage?.id).sort((x, y) => x.index - y.index);
    expect(entrySlots).toHaveLength(entryCount);
    const poolIndexOf = (poolId: string) => structure.pools.find((pool) => pool.id === poolId)?.orderIndex ?? null;
    const seeded = entrySlots.map((slotItem): SeededEntrant => ({
      side: S(slotItem.id),
      rank: null,
      poolIndex: slotItem.source.kind === 'pool_position' ? poolIndexOf(slotItem.source.poolId) : null,
      poolPosition: slotItem.source.kind === 'pool_position' ? slotItem.source.position : null,
    }));
    const order = seedEntrants(seeded, knockoutStage?.config.seeding ?? 'fixed', null);
    const plan = knockoutBracket(
      order,
      { thirdPlacePlayoff: false, rounds: null, firstSlotIndex: entryCount, defaults: defaultsOf({ stageId: knockoutStage?.id ?? 'ko' }) },
      idGen('b'),
    );
    const allSlots = [...entrySlots, ...plan.slots];
    expect(plan.fixtures.map((draft) => `${draft.label}: ${slotLabel(allSlots, draft.sideA)} v ${slotLabel(allSlots, draft.sideB)}`)).toEqual(expectedFixtures);
    expect(plan.slots.map((slotItem) => slotItem.index).sort((x, y) => x - y)).toEqual(Array.from({ length: progressionCount }, (_, index) => entryCount + index));
    expect([...plan.entrySlotSeeds].sort((x, y) => x.seed - y.seed).map((entry) => slotLabel(allSlots, S(entry.slotId)))).toEqual(order.map((side) => slotLabel(allSlots, side)));
  });

  it('custom QF-stage → final-four template: knockout_winners expand from the QF bracket shape to Winner QF1..QF4', () => {
    const [template] = customTemplates();
    const structure = instantiateTemplate(template, { tournamentId: 't', now: NOW, ids: idGen('c') });
    const [groups, qf, finalFour] = [...structure.stages].sort((x, y) => x.orderIndex - y.orderIndex);
    expect(structure.pools.filter((pool) => pool.stageId === groups.id)).toHaveLength(4);
    expect(structure.slots.filter((slotItem) => slotItem.stageId === qf.id).sort((x, y) => x.index - y.index).map((slotItem) => slotItem.label)).toEqual(['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'C2', 'D2']);
    const finalSlots = structure.slots.filter((slotItem) => slotItem.stageId === finalFour.id).sort((x, y) => x.index - y.index);
    expect(finalSlots.map((slotItem) => slotItem.source)).toEqual([0, 1, 2, 3].map((position) => ({ kind: 'bracket_winner', stageId: qf.id, round: 1, position })));
    expect(finalSlots.map((slotItem) => slotItem.label)).toEqual(['Winner QF1', 'Winner QF2', 'Winner QF3', 'Winner QF4']);
    expect(finalFour.config.decidesChampion).toBe(true);
  });

  it('custom Super 8 template: slot-built pools take their qualifiers from poolSlotIndexes', () => {
    const [, template] = customTemplates();
    const structure = instantiateTemplate(template, { tournamentId: 't', now: NOW, ids: idGen('s') });
    const superEight = structure.stages.find((stage) => stage.name === 'Super 8');
    const pools = structure.pools.filter((pool) => pool.stageId === superEight?.id).sort((x, y) => x.orderIndex - y.orderIndex);
    const labelsIn = (poolId: string) => structure.poolEntries.filter((entry) => entry.poolId === poolId).map((entry) => slotLabel(structure.slots, entry.side));
    expect(pools.map((pool) => labelsIn(pool.id).sort())).toEqual([
      ['A1', 'B2', 'C1', 'D2'],
      ['A2', 'B1', 'C2', 'D1'],
    ]);
    const semis = structure.stages.find((stage) => stage.name === 'Semifinals');
    const semiSlots = structure.slots.filter((slotItem) => slotItem.stageId === semis?.id).sort((x, y) => x.index - y.index);
    expect(semiSlots.slice(0, 4).map((slotItem) => slotItem.label)).toEqual(['A1', 'B1', 'A2', 'B2']);
    expect(
      semiSlots.slice(0, 4).every((slotItem) => {
        const source = slotItem.source;
        return source.kind === 'pool_position' && pools.some((pool) => pool.id === source.poolId);
      }),
    ).toBe(true);
    expect(semiSlots[4].source).toEqual({ kind: 'manual', teamId: null });
  });

  it('custom mixed-entry template: pool_position by pool index, best-of, overall and manual rules become slots with the right sources', () => {
    const template = customTemplates()[2];
    const structure = instantiateTemplate(template, { tournamentId: 't', now: NOW, ids: idGen('m') });
    const [groups, playoffs] = [...structure.stages].sort((x, y) => x.orderIndex - y.orderIndex);
    const groupPools = structure.pools.filter((pool) => pool.stageId === groups.id).sort((x, y) => x.orderIndex - y.orderIndex);
    expect(groupPools.map((pool) => pool.name)).toEqual(['Pool A', 'Pool B', 'Pool C']);
    const slots = structure.slots.filter((slotItem) => slotItem.stageId === playoffs.id).sort((x, y) => x.index - y.index);
    expect(slots.map((slotItem) => slotItem.source)).toEqual([
      { kind: 'pool_position', stageId: groups.id, poolId: groupPools[2].id, position: 1 },
      { kind: 'best_of_position', stageId: groups.id, position: 2, rank: 1, normalization: 'per_match_average' },
      { kind: 'best_of_position', stageId: groups.id, position: 2, rank: 2, normalization: 'per_match_average' },
      { kind: 'overall_position', stageId: groups.id, rank: 1, normalization: 'raw' },
      { kind: 'overall_position', stageId: groups.id, rank: 2, normalization: 'raw' },
      { kind: 'manual', teamId: null },
    ]);
    expect(slots.slice(0, 2).map((slotItem) => slotItem.label)).toEqual(['C1', 'Best runner-up']);
    expect(slots.slice(3, 5).map((slotItem) => slotItem.label)).toEqual(['1st overall', '2nd overall']);
    expect(playoffs.config.seeding).toBe('ranking');
    expect(playoffs.config.knockout).toEqual({ ...DEFAULT_KNOCKOUT_CONFIG, tiedMatch: 'higher_seed', noResult: 'shared' });
  });

  it('custom Cup and Plate template: the Plate is ordered last but the Cup stays the only champion stage, before and after saving', () => {
    const template = customTemplates()[3];
    const structure = instantiateTemplate(template, { tournamentId: 't', now: NOW, ids: idGen('cp') });
    const ordered = [...structure.stages].sort((x, y) => x.orderIndex - y.orderIndex);
    expect(ordered.map((stage) => [stage.name, stage.config.decidesChampion])).toEqual([
      ['Groups', false],
      ['Cup', true],
      ['Plate', false],
    ]);
    const plateSlots = structure.slots.filter((slotItem) => slotItem.stageId === ordered[2].id).sort((x, y) => x.index - y.index);
    expect(plateSlots.map((slotItem) => slotItem.label)).toEqual(['A3', 'B3', 'C3', 'D3', 'A4', 'B4', 'C4', 'D4']);
    const saved = templateFromSnapshot(structureSnapshot(structure, template), { id: 'user:cp', name: 'CP', description: '', now: NOW });
    expect(saved.stages.map((stage) => [stage.name, stage.decidesChampion])).toEqual([
      ['Groups', false],
      ['Cup', true],
      ['Plate', false],
    ]);
  });

  it('knockout_winners of a six-team quarterfinal stage are labelled like the fixtures they come from (QF1 is the first existing quarterfinal, §5.2)', () => {
    const base = builtinTemplates()[0];
    const template: TournamentTemplate = {
      ...base,
      id: 'user:six-qualifiers',
      builtin: false,
      teamCount: 12,
      structureKind: 'custom',
      stages: [
        templateStage({ key: 'groups', name: 'Groups', type: 'group', poolCount: 3, fixtureGeneration: { method: 'round_robin', legs: 1 } }),
        templateStage({
          key: 'qf',
          name: 'Quarterfinals',
          type: 'knockout',
          entry: [{ kind: 'top_per_pool', sourceStageKey: 'groups', count: 2, fromPosition: 1 }],
          knockout: { ...DEFAULT_KNOCKOUT_CONFIG, rounds: 1 },
        }),
        templateStage({
          key: 'final4',
          name: 'Final four',
          type: 'knockout',
          entry: [{ kind: 'knockout_winners', sourceStageKey: 'qf' }],
          knockout: DEFAULT_KNOCKOUT_CONFIG,
          decidesChampion: true,
        }),
      ],
    };
    const structure = instantiateTemplate(template, { tournamentId: 't', now: NOW, ids: idGen('six') });
    const [, qf, finalFour] = [...structure.stages].sort((x, y) => x.orderIndex - y.orderIndex);
    const qfSlots = structure.slots.filter((slotItem) => slotItem.stageId === qf.id).sort((x, y) => x.index - y.index);
    expect(qfSlots).toHaveLength(6);
    const qfPlan = knockoutBracket(
      qfSlots.map((slotItem) => S(slotItem.id)),
      { thirdPlacePlayoff: false, rounds: 1, firstSlotIndex: 6, defaults: defaultsOf({ stageId: qf.id }) },
      idGen('qfdraw'),
    );
    const fixtureLabelAt = new Map(qfPlan.fixtures.map((draft) => [draft.bracket?.position ?? -1, draft.label] as const));
    expect([...fixtureLabelAt.entries()].sort((x, y) => x[0] - y[0])).toEqual([
      [1, 'QF1'],
      [3, 'QF2'],
    ]);
    const finalSlots = structure.slots.filter((slotItem) => slotItem.stageId === finalFour.id).sort((x, y) => x.index - y.index);
    expect(finalSlots).toHaveLength(4);
    const mismatches: string[] = [];
    for (const slotItem of finalSlots) {
      if (slotItem.source.kind !== 'bracket_winner') {
        mismatches.push(`${slotItem.label}: ${slotItem.source.kind}`);
        continue;
      }
      const fixtureLabel = fixtureLabelAt.get(slotItem.source.position);
      if (fixtureLabel !== undefined && slotItem.label !== `Winner ${fixtureLabel}`) {
        mismatches.push(`position ${slotItem.source.position}: labelled "${slotItem.label}" but the fixture there is ${fixtureLabel}`);
      }
    }
    expect(new Set(finalSlots.map((slotItem) => slotItem.label)).size).toBe(4);
    expect(mismatches).toEqual([]);
  });

  it('templateFromSnapshot round-trips all five built-ins and every custom template (instantiate → save → instantiate gives the same structure)', () => {
    const failures: string[] = [];
    for (const template of [...builtinTemplates(), ...customTemplates()]) {
      const original = instantiateTemplate(template, { tournamentId: 'tour-r', now: NOW, ids: idGen('orig') });
      const saved = templateFromSnapshot(structureSnapshot(original, template), { id: 'user:copy', name: 'Copy', description: 'Saved copy', now: NOW });
      if (saved.stages.filter((stage) => stage.decidesChampion).length !== 1) {
        failures.push(`${template.id}: saved template has ${saved.stages.filter((stage) => stage.decidesChampion).length} champion stages`);
      }
      const again = instantiateTemplate(saved, { tournamentId: 'tour-r', now: NOW, ids: idGen('again') });
      if (stable(normalizeStructure(again)) !== stable(normalizeStructure(original))) {
        failures.push(`${template.id}: structure differs after the round trip`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('§92 workflow: 8-team T20 → random pools → 12 group fixtures → semifinals and final numbered 13–15, all clean', () => {
    const template = builtinTemplates().find((candidate) => candidate.id === 'builtin:8-team-t20') as TournamentTemplate;
    const first = instantiateTemplate(template, { tournamentId: 'tour-92', now: NOW, ids: idGen('s92') });
    expect(instantiateTemplate(template, { tournamentId: 'tour-92', now: NOW, ids: idGen('s92') })).toEqual(first);
    const [groupStage, knockoutStage] = [...first.stages].sort((x, y) => x.orderIndex - y.orderIndex);
    const groupPools = first.pools.filter((pool) => pool.stageId === groupStage.id).sort((x, y) => x.orderIndex - y.orderIndex);
    const entrants = ['Lions', 'Tigers', 'Eagles', 'Hawks', 'Kings', 'Royals', 'Titans', 'Giants'].map(T);
    const assignment = assignRandom(entrants, { poolCount: groupPools.length }, groupPools.map((pool) => pool.id), normalizeSeed('847291'));
    expect(poolWarnings(assignment, entrants)).toEqual([]);
    const ids = idGen('fx92');
    const groupDrafts: FixtureDraft[] = [];
    for (const pool of assignment.pools) {
      const legs = groupPools.find((candidate) => candidate.id === pool.poolId)?.legs ?? groupStage.config.fixtureGeneration.legs;
      groupDrafts.push(...draftsFromRoundRobin(roundRobin(pool.members, legs), defaultsOf({ tournamentId: 'tour-92', stageId: groupStage.id, poolId: pool.poolId, startMatchNumber: groupDrafts.length + 1 }), ids));
    }
    expect(groupDrafts).toHaveLength(12);
    const entrySlots = first.slots.filter((slotItem) => slotItem.stageId === knockoutStage.id).sort((x, y) => x.index - y.index);
    const plan = knockoutBracket(
      entrySlots.map((slotItem) => S(slotItem.id)),
      { thirdPlacePlayoff: false, rounds: null, firstSlotIndex: 4, defaults: defaultsOf({ tournamentId: 'tour-92', stageId: knockoutStage.id, startMatchNumber: 13 }) },
      ids,
    );
    const all = [...groupDrafts, ...plan.fixtures];
    expect(all.map((draft) => draft.matchNumber).sort((x, y) => x - y)).toEqual(Array.from({ length: 15 }, (_, index) => index + 1));
    expect(new Set(all.map((draft) => draft.id)).size).toBe(15);
    expect(all.filter((draft) => draft.isFinal).map((draft) => draft.matchNumber)).toEqual([15]);
    expect(
      validateFixtureDrafts(all, {
        poolMembers: Object.fromEntries(assignment.pools.map((pool) => [pool.poolId, pool.members])),
        tournamentSides: [...entrants, ...entrySlots.map((slotItem) => S(slotItem.id)), ...plan.slots.map((slotItem) => S(slotItem.id))],
        legsByPool: new Map(),
        defaultLegs: 1,
        startDate: null,
        endDate: null,
      }),
    ).toEqual([]);
  });

  it('a saved template holds structure only: direct-entry teams become a count and no team, tournament or row id survives', () => {
    const template = customTemplates()[1];
    const structure = instantiateTemplate(template, { tournamentId: 'tour-secret', now: NOW, ids: idGen('secret') });
    const semis = structure.stages.find((stage) => stage.name === 'Semifinals');
    const withTeams: InstantiatedStructure = {
      ...structure,
      stages: structure.stages.map((stage) =>
        stage.id === semis?.id
          ? {
              ...stage,
              config: {
                ...stage.config,
                entryRules: [...stage.config.entryRules.filter((rule) => rule.kind !== 'manual'), { kind: 'direct_entry', teamIds: ['team-lions-uuid'] }],
              },
            }
          : stage,
      ),
      slots: structure.slots.map((slotItem) =>
        slotItem.stageId === semis?.id && slotItem.source.kind === 'manual' ? { ...slotItem, label: 'Lions', source: { kind: 'manual', teamId: 'team-lions-uuid' } } : slotItem,
      ),
    };
    const saved = templateFromSnapshot(structureSnapshot(withTeams, template), { id: 'user:saved', name: 'Saved', description: 'From Spring Cup', now: '2026-09-30T10:00:00.000Z' });
    const savedSemis = saved.stages.find((stage) => stage.name === 'Semifinals');
    expect(savedSemis?.entry.filter((rule) => rule.kind === 'direct_entry')).toEqual([{ kind: 'direct_entry', count: 1 }]);
    expect(saved.id).toBe('user:saved');
    expect(saved.builtin).toBe(false);
    expect(saved.createdAt).toBe('2026-09-30T10:00:00.000Z');
    const text = JSON.stringify(saved);
    const leaked = ['team-lions-uuid', 'tour-secret', ...structure.stages.map((stage) => stage.id), ...structure.pools.map((pool) => pool.id), ...structure.slots.map((slotItem) => slotItem.id)].filter((id) =>
      text.includes(`"${id}"`),
    );
    expect(leaked).toEqual([]);
  });

  it('saving the 8-team T20 after its knockout was drawn does not turn Winner SF1/SF2 into extra entry slots', () => {
    const template = builtinTemplates().find((candidate) => candidate.id === 'builtin:8-team-t20') as TournamentTemplate;
    const original = instantiateTemplate(template, { tournamentId: 'tour-d', now: NOW, ids: idGen('orig') });
    const knockoutStage = original.stages.find((stage) => stage.config.decidesChampion);
    const entrySlots = original.slots.filter((slotItem) => slotItem.stageId === knockoutStage?.id).sort((x, y) => x.index - y.index);
    const plan = knockoutBracket(
      entrySlots.map((slotItem) => S(slotItem.id)),
      { thirdPlacePlayoff: false, rounds: null, firstSlotIndex: 4, defaults: defaultsOf({ tournamentId: 'tour-d', stageId: knockoutStage?.id ?? 'ko' }) },
      idGen('draw'),
    );
    const fixtures = plan.fixtures.map((draft) => fixtureOf({ ...draft }));
    const snapshot = structureSnapshot(original, template, { slots: [...original.slots, ...plan.slots], fixtures });
    const saved = templateFromSnapshot(snapshot, { id: 'user:drawn', name: 'Drawn', description: '', now: NOW });
    const again = instantiateTemplate(saved, { tournamentId: 'tour-d', now: NOW, ids: idGen('again') });
    expect(stable(normalizeStructure(again))).toBe(stable(normalizeStructure(original)));
  });
});

const TOURNAMENT_ALLOWED: readonly (readonly [TournamentStatus, TournamentStatus])[] = [
  ['draft', 'registration'],
  ['registration', 'structure_configured'],
  ['structure_configured', 'pools_configured'],
  ['pools_configured', 'fixtures_generated'],
  ['fixtures_generated', 'active'],
  ['active', 'completed'],
  ['completed', 'archived'],
  ['archived', 'completed'],
  ['completed', 'active'],
  ['structure_configured', 'registration'],
  ['pools_configured', 'structure_configured'],
  ['fixtures_generated', 'pools_configured'],
];

const FIXTURE_ALLOWED: readonly (readonly [FixtureStatus, FixtureStatus])[] = [
  ['scheduled', 'postponed'],
  ['postponed', 'rescheduled'],
  ['rescheduled', 'postponed'],
  ['scheduled', 'cancelled'],
  ['postponed', 'cancelled'],
  ['rescheduled', 'cancelled'],
  ['cancelled', 'scheduled'],
  ['scheduled', 'live'],
  ['rescheduled', 'live'],
  ['scheduled', 'completed'],
  ['postponed', 'completed'],
  ['rescheduled', 'completed'],
  ['scheduled', 'abandoned'],
  ['rescheduled', 'abandoned'],
  ['live', 'completed'],
  ['live', 'abandoned'],
  ['abandoned', 'rescheduled'],
  ['completed', 'live'],
  ['abandoned', 'live'],
];

const MATCH_ALLOWED: readonly (readonly [MatchStatus, MatchStatus])[] = [
  ['scheduled', 'postponed'],
  ['postponed', 'scheduled'],
  ['scheduled', 'cancelled'],
  ['postponed', 'cancelled'],
  ['cancelled', 'scheduled'],
  ['scheduled', 'live'],
  ['scheduled', 'completed'],
  ['postponed', 'completed'],
  ['scheduled', 'abandoned'],
  ['postponed', 'abandoned'],
  ['live', 'paused'],
  ['paused', 'live'],
  ['live', 'completed'],
  ['paused', 'completed'],
  ['live', 'abandoned'],
  ['paused', 'abandoned'],
  ['completed', 'live'],
  ['abandoned', 'live'],
  ['completed', 'paused'],
  ['abandoned', 'paused'],
];

const PERMISSIVE: TournamentGuardContext = {
  activeTeamCount: 8,
  stageCount: 2,
  poolsComplete: true,
  firstStageFixturesConfirmed: true,
  matchesStarted: 0,
  matchesCompleted: 0,
  allStagesComplete: true,
  championDecided: true,
};

function ctxOf(overrides: Partial<TournamentGuardContext>): TournamentGuardContext {
  return { ...PERMISSIVE, ...overrides };
}

describe('adversarial: state machines (STATE_MACHINES.md)', () => {
  it('tournament: exactly the 12 documented edges are allowed among all 64 status pairs', () => {
    const allowed = new Set(TOURNAMENT_ALLOWED.map(([from, to]) => `${from}>${to}`));
    const mismatches: string[] = [];
    for (const from of TOURNAMENT_STATUSES) {
      for (const to of TOURNAMENT_STATUSES) {
        const guard = canTransitionTournament(from, to, PERMISSIVE);
        if (guard.ok !== allowed.has(`${from}>${to}`)) {
          mismatches.push(`${from} → ${to}: ${guard.ok ? 'allowed' : 'refused'}`);
        }
        if (!guard.ok && guard.reason.trim().length === 0) {
          mismatches.push(`${from} → ${to}: empty refusal`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it.each<[TournamentStatus, TournamentStatus, Partial<TournamentGuardContext>, string]>([
    ['registration', 'structure_configured', { activeTeamCount: 1 }, 'Add at least two teams and one stage.'],
    ['registration', 'structure_configured', { stageCount: 0 }, 'Add at least two teams and one stage.'],
    ['pools_configured', 'fixtures_generated', { firstStageFixturesConfirmed: false }, "Confirm the first stage's fixtures."],
    ['active', 'completed', { championDecided: false, allStagesComplete: false }, "The champion hasn't been decided yet."],
    ['structure_configured', 'registration', { matchesStarted: 1 }, 'Matches have already started.'],
    ['pools_configured', 'structure_configured', { matchesStarted: 2 }, 'Matches have already started.'],
    ['fixtures_generated', 'pools_configured', { matchesStarted: 1 }, 'Matches have already started.'],
  ])('tournament %s → %s is refused with the documented sentence', (from, to, overrides, reason) => {
    expect(canTransitionTournament(from, to, ctxOf(overrides))).toEqual({ ok: false, reason });
  });

  it('tournament: pools incomplete blocks pools_configured; a decided champion or complete stages each suffice; reopening ignores started matches', () => {
    expect(canTransitionTournament('structure_configured', 'pools_configured', ctxOf({ poolsComplete: false })).ok).toBe(false);
    expect(canTransitionTournament('active', 'completed', ctxOf({ championDecided: true, allStagesComplete: false })).ok).toBe(true);
    expect(canTransitionTournament('active', 'completed', ctxOf({ championDecided: false, allStagesComplete: true })).ok).toBe(true);
    expect(canTransitionTournament('completed', 'active', ctxOf({ matchesStarted: 30, matchesCompleted: 30 })).ok).toBe(true);
    expect(canTransitionTournament('fixtures_generated', 'active', ctxOf({ matchesStarted: 1 })).ok).toBe(true);
  });

  it('fixture: postponing a rescheduled fixture again is allowed without a match (EC-T-13, contract gap G-8 added)', () => {
    expect(canTransitionFixture('rescheduled', 'postponed', { hasMatch: false, replayAllowed: false })).toEqual({ ok: true, warnings: [] });
  });

  it('tournament: going back from Active to Draft uses the documented refusal sentence', () => {
    expect(canTransitionTournament('active', 'draft', PERMISSIVE)).toEqual({ ok: false, reason: "A tournament can't go from Active back to Draft." });
  });

  it('stage: only pending → active, active → completed and completed → active, each with its guard', () => {
    const statuses: StageStatus[] = ['pending', 'active', 'completed'];
    const allowed = new Set(['pending>active', 'active>completed', 'completed>active']);
    const all = { fixturesConfirmed: true, entrantsResolved: true, allFixturesTerminal: true };
    for (const from of statuses) {
      for (const to of statuses) {
        expect([`${from}>${to}`, canTransitionStage(from, to, all).ok]).toEqual([`${from}>${to}`, allowed.has(`${from}>${to}`)]);
      }
    }
    expect(canTransitionStage('pending', 'active', { ...all, fixturesConfirmed: false }).ok).toBe(false);
    const unresolved = canTransitionStage('pending', 'active', { ...all, entrantsResolved: false });
    expect(unresolved.ok).toBe(true);
    expect(unresolved.ok && unresolved.warnings.length > 0).toBe(true);
    expect(canTransitionStage('active', 'completed', { ...all, allFixturesTerminal: false }).ok).toBe(false);
    expect(canTransitionStage('completed', 'active', { fixturesConfirmed: false, entrantsResolved: false, allFixturesTerminal: false }).ok).toBe(true);
  });

  it('fixture: exactly the 19 §5 edges are allowed; every other pair is refused whatever the context', () => {
    const allowed = new Map(FIXTURE_ALLOWED.map(([from, to]) => [`${from}>${to}`, [from, to] as const]));
    const mismatches: string[] = [];
    for (const from of FIXTURE_STATUSES) {
      for (const to of FIXTURE_STATUSES) {
        const edge = `${from}>${to}`;
        if (allowed.has(edge)) {
          const mirror = to === 'live' || to === 'completed' || to === 'abandoned';
          const replay = from === 'abandoned' && to === 'rescheduled';
          const guard = canTransitionFixture(from, to, { hasMatch: mirror || replay, replayAllowed: replay });
          if (!guard.ok) {
            mismatches.push(`${edge}: refused (${guard.reason})`);
          }
        } else {
          for (const hasMatch of [false, true]) {
            for (const replayAllowed of [false, true]) {
              if (canTransitionFixture(from, to, { hasMatch, replayAllowed }).ok) {
                mismatches.push(`${edge}: allowed with hasMatch=${hasMatch} replayAllowed=${replayAllowed}`);
              }
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
    expect(canTransitionFixture('abandoned', 'rescheduled', { hasMatch: true, replayAllowed: false }).ok).toBe(false);
  });

  it('match: exactly the 20 §1 edges are allowed; walkover/award to completed only before the first ball', () => {
    const allowed = new Set(MATCH_ALLOWED.map(([from, to]) => `${from}>${to}`));
    const mismatches: string[] = [];
    for (const from of MATCH_STATUSES) {
      for (const to of MATCH_STATUSES) {
        const edge = `${from}>${to}`;
        if (allowed.has(edge)) {
          const hasDeliveries = !['scheduled', 'postponed', 'cancelled'].includes(from);
          const guard = canTransitionMatch(from, to, { hasDeliveries });
          if (!guard.ok) {
            mismatches.push(`${edge}: refused (${guard.reason})`);
          }
        } else {
          for (const hasDeliveries of [false, true]) {
            if (canTransitionMatch(from, to, { hasDeliveries }).ok) {
              mismatches.push(`${edge}: allowed with hasDeliveries=${hasDeliveries}`);
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
    expect(canTransitionMatch('scheduled', 'completed', { hasDeliveries: true }).ok).toBe(false);
    expect(canTransitionMatch('postponed', 'completed', { hasDeliveries: true }).ok).toBe(false);
    expect(canTransitionMatch('paused', 'completed', { hasDeliveries: true }).ok).toBe(true);
  });

  it('match edit policy: every non-dash cell of the §1 table, standalone and in a tournament', () => {
    type Cells = Partial<MatchEditPolicy>;
    const rows: { statuses: MatchStatus[]; standalone: Cells; tournament: Cells }[] = [
      {
        statuses: ['scheduled', 'postponed'],
        standalone: { details: 'allowed', teams: 'allowed', rules: 'allowed', squads: 'allowed', toss: 'allowed', scoring: 'allowed', delete: 'allowed' },
        tournament: { details: 'allowed', teams: 'allowed', rules: 'allowed', squads: 'allowed', toss: 'allowed', scoring: 'allowed' },
      },
      {
        statuses: ['live', 'paused'],
        standalone: { details: 'allowed', teams: 'forbidden', rules: 'confirm', squads: 'allowed', toss: 'confirm', scoring: 'allowed', history: 'warn', delete: 'confirm' },
        tournament: { details: 'allowed', teams: 'forbidden', rules: 'confirm', squads: 'allowed', toss: 'confirm', scoring: 'allowed', history: 'warn', delete: 'forbidden' },
      },
      {
        statuses: ['completed', 'abandoned'],
        standalone: { details: 'allowed', teams: 'forbidden', rules: 'confirm', squads: 'allowed', toss: 'confirm', scoring: 'forbidden', history: 'confirm', delete: 'confirm' },
        tournament: { details: 'allowed', teams: 'forbidden', rules: 'confirm', squads: 'allowed', toss: 'confirm', scoring: 'forbidden', history: 'confirm', delete: 'forbidden' },
      },
      {
        statuses: ['cancelled'],
        standalone: { details: 'allowed', teams: 'allowed', rules: 'allowed', squads: 'allowed', scoring: 'forbidden', delete: 'allowed' },
        tournament: { details: 'allowed', teams: 'allowed', rules: 'allowed', squads: 'allowed', scoring: 'forbidden', delete: 'allowed' },
      },
    ];
    const mismatches: string[] = [];
    for (const row of rows) {
      for (const status of row.statuses) {
        for (const inTournament of [false, true]) {
          const policy = matchEditPolicy(status, { inTournament });
          const cells = inTournament ? row.tournament : row.standalone;
          for (const [column, expected] of Object.entries(cells) as [keyof MatchEditPolicy, EditPermission][]) {
            if (policy[column] !== expected) {
              mismatches.push(`${status} ${inTournament ? 'tournament' : 'standalone'} ${column}: ${policy[column]} vs ${expected}`);
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('tournament edit policy: every non-dash cell of the §3 matrix, seeds = Rules, and tournament deletion', () => {
    type Row = Partial<Omit<TournamentEditPolicy, 'seeds' | 'deleteTournament'>>;
    const setup: Row = { info: 'allowed', addTeams: 'allowed', removeTeams: 'allowed', stages: 'allowed', pools: 'allowed', generateFixtures: 'allowed', fixtureSchedule: 'allowed', fixtureTeams: 'allowed', rules: 'allowed' };
    const generated: Row = { info: 'allowed', addTeams: 'warn', removeTeams: 'warn', stages: 'warn', pools: 'warn', generateFixtures: 'warn', fixtureSchedule: 'allowed', fixtureTeams: 'allowed', rules: 'allowed', overrides: 'allowed' };
    const started: Row = { info: 'allowed', addTeams: 'warn', removeTeams: 'confirm', stages: 'warn', pools: 'warn', generateFixtures: 'warn', fixtureSchedule: 'allowed', fixtureTeams: 'warn', rules: 'warn', overrides: 'confirm', matchResults: 'warn' };
    const played: Row = { info: 'allowed', addTeams: 'confirm', removeTeams: 'confirm', stages: 'confirm', pools: 'confirm', generateFixtures: 'confirm', fixtureSchedule: 'allowed', fixtureTeams: 'confirm', rules: 'confirm', overrides: 'confirm', matchResults: 'confirm' };
    const completed: Row = { info: 'allowed', addTeams: 'forbidden', removeTeams: 'forbidden', stages: 'forbidden', pools: 'forbidden', generateFixtures: 'forbidden', fixtureSchedule: 'forbidden', fixtureTeams: 'forbidden', rules: 'confirm', overrides: 'confirm', matchResults: 'confirm' };
    const archived: Row = { info: 'forbidden', addTeams: 'forbidden', removeTeams: 'forbidden', stages: 'forbidden', pools: 'forbidden', generateFixtures: 'forbidden', fixtureSchedule: 'forbidden', fixtureTeams: 'forbidden', rules: 'forbidden', overrides: 'forbidden', matchResults: 'forbidden' };
    const cases: { status: TournamentStatus; ctx: Partial<TournamentGuardContext>; row: Row; seeds: EditPermission; deleteTournament: EditPermission }[] = [
      { status: 'draft', ctx: {}, row: setup, seeds: 'allowed', deleteTournament: 'allowed' },
      { status: 'registration', ctx: {}, row: setup, seeds: 'allowed', deleteTournament: 'allowed' },
      { status: 'structure_configured', ctx: {}, row: setup, seeds: 'allowed', deleteTournament: 'allowed' },
      { status: 'pools_configured', ctx: {}, row: setup, seeds: 'allowed', deleteTournament: 'allowed' },
      { status: 'fixtures_generated', ctx: {}, row: generated, seeds: 'allowed', deleteTournament: 'allowed' },
      { status: 'active', ctx: { matchesStarted: 0, matchesCompleted: 0 }, row: generated, seeds: 'allowed', deleteTournament: 'allowed' },
      { status: 'active', ctx: { matchesStarted: 2, matchesCompleted: 0 }, row: started, seeds: 'warn', deleteTournament: 'confirm' },
      { status: 'active', ctx: { matchesStarted: 7, matchesCompleted: 5 }, row: played, seeds: 'confirm', deleteTournament: 'confirm' },
      { status: 'completed', ctx: { matchesStarted: 15, matchesCompleted: 15 }, row: completed, seeds: 'confirm', deleteTournament: 'confirm' },
      { status: 'archived', ctx: { matchesStarted: 15, matchesCompleted: 15 }, row: archived, seeds: 'forbidden', deleteTournament: 'forbidden' },
      { status: 'archived', ctx: { matchesStarted: 0, matchesCompleted: 0 }, row: archived, seeds: 'forbidden', deleteTournament: 'forbidden' },
    ];
    const mismatches: string[] = [];
    for (const testCase of cases) {
      const policy = tournamentEditPolicy(testCase.status, ctxOf(testCase.ctx));
      const label = `${testCase.status} ${JSON.stringify(testCase.ctx)}`;
      for (const [column, expected] of Object.entries(testCase.row) as [keyof TournamentEditPolicy, EditPermission][]) {
        if (policy[column] !== expected) {
          mismatches.push(`${label} ${column}: ${policy[column]} vs ${expected}`);
        }
      }
      if (policy.seeds !== testCase.seeds) {
        mismatches.push(`${label} seeds: ${policy.seeds} vs ${testCase.seeds}`);
      }
      if (policy.seeds !== policy.rules) {
        mismatches.push(`${label} seeds ${policy.seeds} differ from rules ${policy.rules}`);
      }
      if (policy.deleteTournament !== testCase.deleteTournament) {
        mismatches.push(`${label} deleteTournament: ${policy.deleteTournament} vs ${testCase.deleteTournament}`);
      }
    }
    expect(tournamentEditPolicy('fixtures_generated', ctxOf({ matchesStarted: 1 })).deleteTournament).toBe('confirm');
    expect(mismatches).toEqual([]);
  });
});

function gold(rounds: readonly RoundRobinRound[]): string[] {
  return rounds.map(
    (round) =>
      `R${round.round} ${round.pairings.map((pairing) => `${sideName(pairing.sideA)} v ${sideName(pairing.sideB)}`).join(', ')}${round.bye === null ? '' : ` (bye ${sideName(round.bye)})`}`,
  );
}

function refOrdinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) {
    return `${n}th`;
  }
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function pairKeyOf(draft: { readonly sideA: FixtureSide; readonly sideB: FixtureSide }): string {
  return [sideName(draft.sideA), sideName(draft.sideB)].sort().join('-');
}

function sixQualifierTemplate(): TournamentTemplate {
  const base = builtinTemplates()[0];
  return {
    ...base,
    id: 'user:six-qualifiers',
    name: 'Six qualifiers',
    builtin: false,
    teamCount: 12,
    structureKind: 'custom',
    stages: [
      templateStage({ key: 'groups', name: 'Groups', type: 'group', poolCount: 3, fixtureGeneration: { method: 'round_robin', legs: 1 } }),
      templateStage({
        key: 'qf',
        name: 'Quarterfinals',
        type: 'knockout',
        entry: [{ kind: 'top_per_pool', sourceStageKey: 'groups', count: 2, fromPosition: 1 }],
        knockout: { ...DEFAULT_KNOCKOUT_CONFIG, rounds: 1 },
      }),
      templateStage({
        key: 'final4',
        name: 'Final four',
        type: 'knockout',
        entry: [{ kind: 'knockout_winners', sourceStageKey: 'qf' }],
        knockout: DEFAULT_KNOCKOUT_CONFIG,
        decidesChampion: true,
      }),
    ],
  };
}

describe('adversarial round 2: rng and pools', () => {
  it('randomInt is ⌊rng() × max⌋ (§2.2): an integer in [0, 10) that hits every value over 10,000 draws', () => {
    const rng = mulberry32(847291);
    const reference = refMulberry32(847291);
    const counts = new Map<number, number>();
    const problems: string[] = [];
    for (let draw = 0; draw < 10000; draw += 1) {
      const value = randomInt(rng, 10);
      const expected = Math.floor(reference() * 10);
      if (value !== expected || !Number.isInteger(value) || value < 0 || value >= 10) {
        problems.push(`draw ${draw}: ${value} vs ${expected}`);
        break;
      }
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    expect(problems).toEqual([]);
    expect([...counts.keys()].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('poolName is bijective base-26 well past Z: Pool Z, Pool AA, Pool AZ, Pool BA, Pool ZZ, Pool AAA, Pool ZZZ', () => {
    expect([0, 25, 26, 51, 52, 701, 702, 18277].map(poolName)).toEqual(['Pool A', 'Pool Z', 'Pool AA', 'Pool AZ', 'Pool BA', 'Pool ZZ', 'Pool AAA', 'Pool ZZZ']);
    const names = Array.from({ length: 1000 }, (_, index) => poolName(index));
    expect(names).toEqual(names.map((_, index) => refPoolName(index)));
    expect(new Set(names).size).toBe(1000);
  });

  it('assignRandom refuses explicit sizes that do not add up to the members (U-POOL-07)', () => {
    expect(() => assignRandom(teamsOf(10), { sizes: [4, 4, 3] }, ['pA', 'pB', 'pC'], 1)).toThrow();
    expect(() => assignRandom(teamsOf(10), { sizes: [4, 3, 2] }, ['pA', 'pB', 'pC'], 1)).toThrow();
  });

  it.each<[number, number, string[][]]>([
    [8, 2, [['1', '4', '5', '8'], ['2', '3', '6', '7']]],
    [8, 4, [['1', '8'], ['2', '7'], ['3', '6'], ['4', '5']]],
    [16, 4, [['1', '8', '9', '16'], ['2', '7', '10', '15'], ['3', '6', '11', '14'], ['4', '5', '12', '13']]],
  ])('assignSeeded: %i seeded teams arriving in reverse seed order into %i pools deal the §3.2 snake', (n, pools, expected) => {
    const input = Array.from({ length: n }, (_, index) => ({ teamId: String(n - index), seed: n - index, name: `Club ${String.fromCharCode(90 - index)}` }));
    const poolIds = Array.from({ length: pools }, (_, index) => `p${index}`);
    expect(assignSeeded(deepFreeze(input), poolIds).pools.map((pool) => pool.members.map(sideName))).toEqual(expected);
  });

  it('U-POOL-09: seeds 1..10 plus unseeded Zulu and Alpha into 4 pools → A {1,8,9}, B {2,7,10}, C {3,6,Alpha}, D {4,5,Zulu}', () => {
    const input = [
      { teamId: 'Zulu', seed: null, name: 'Zulu' },
      ...Array.from({ length: 10 }, (_, index) => ({ teamId: String(10 - index), seed: 10 - index, name: `Seed ${10 - index}` })),
      { teamId: 'Alpha', seed: null, name: 'Alpha' },
    ];
    expect(assignSeeded(input, ['pA', 'pB', 'pC', 'pD']).pools.map((pool) => pool.members.map(sideName))).toEqual([
      ['1', '8', '9'],
      ['2', '7', '10'],
      ['3', '6', 'Alpha'],
      ['4', '5', 'Zulu'],
    ]);
  });

  it('transfers compare members by value: a fresh equal object works, and team "X" and slot "X" are different members', () => {
    const assignment: PoolAssignment = deepFreeze({
      seed: null,
      pools: [
        { poolId: 'pA', name: 'Pool A', members: [T('X'), T('Y'), S('X')] },
        { poolId: 'pB', name: 'Pool B', members: [S('Y'), T('Z')] },
      ],
    });
    expect(membersOf(moveMember(assignment, { kind: 'slot', slotId: 'X' }, 'pB'))).toEqual([
      ['team:X', 'team:Y'],
      ['slot:Y', 'team:Z', 'slot:X'],
    ]);
    expect(membersOf(moveMember(assignment, { kind: 'team', teamId: 'X' }, 'pB'))).toEqual([
      ['team:Y', 'slot:X'],
      ['slot:Y', 'team:Z', 'team:X'],
    ]);
    expect(membersOf(swapMembers(assignment, { kind: 'team', teamId: 'Y' }, { kind: 'slot', slotId: 'Y' }))).toEqual([
      ['team:X', 'slot:Y', 'slot:X'],
      ['team:Y', 'team:Z'],
    ]);
    expect(membersOf(replaceMember(assignment, { kind: 'slot', slotId: 'X' }, T('W')))).toEqual([
      ['team:X', 'team:Y', 'team:W'],
      ['slot:Y', 'team:Z'],
    ]);
    expect(membersOf(replaceMember(assignment, { kind: 'team', teamId: 'Y' }, S('Z')))).toEqual([
      ['team:X', 'slot:Z', 'slot:X'],
      ['slot:Y', 'team:Z'],
    ]);
    expect(() => replaceMember(assignment, T('Y'), { kind: 'slot', slotId: 'X' })).toThrow();
  });

  it('swapping two members of the same pool exchanges only their positions', () => {
    const assignment: PoolAssignment = deepFreeze({
      seed: 9,
      pools: [
        { poolId: 'pA', name: 'Pool A', members: [T('a'), T('b'), T('c'), T('d')] },
        { poolId: 'pB', name: 'Pool B', members: [T('e'), T('f')] },
      ],
    });
    expect(membersOf(swapMembers(assignment, T('d'), T('a')))).toEqual([
      ['team:d', 'team:b', 'team:c', 'team:a'],
      ['team:e', 'team:f'],
    ]);
  });

  it('poolWarnings names the empty pool, the single-team pool and the member sitting in two pools (U-POOL-16), and 4/3/3 only warns about uneven pools (EC-T-03)', () => {
    const teams = teamsOf(5);
    const withEmpty = poolWarnings(
      {
        seed: null,
        pools: [
          { poolId: 'pA', name: 'Pool A', members: teams.slice(0, 2) },
          { poolId: 'pB', name: 'Pool B', members: teams.slice(2, 4) },
          { poolId: 'pC', name: 'Pool C', members: [] },
        ],
      },
      teams.slice(0, 4),
    );
    expect(withEmpty.find((warning) => warning.code === 'EMPTY_POOL')?.poolIds).toEqual(['pC']);
    expect(withEmpty.some((warning) => warning.code === 'UNASSIGNED_TEAMS' || warning.code === 'TEAM_IN_MULTIPLE_POOLS')).toBe(false);
    const withSingle = poolWarnings(
      {
        seed: null,
        pools: [
          { poolId: 'pA', name: 'Pool A', members: teams.slice(0, 3) },
          { poolId: 'pB', name: 'Pool B', members: [teams[3]] },
        ],
      },
      teams.slice(0, 4),
    );
    const single = withSingle.find((warning) => warning.code === 'SINGLE_TEAM_POOL');
    expect(single?.poolIds).toEqual(['pB']);
    expect(single?.members.map(sideKey)).toEqual([sideKey(teams[3])]);
    const withDuplicate = poolWarnings(
      {
        seed: null,
        pools: [
          { poolId: 'pA', name: 'Pool A', members: [teams[0], S('A1'), teams[1]] },
          { poolId: 'pB', name: 'Pool B', members: [teams[2], { kind: 'slot', slotId: 'A1' }, teams[3]] },
        ],
      },
      [...teams.slice(0, 4), S('A1')],
    );
    const duplicate = withDuplicate.find((warning) => warning.code === 'TEAM_IN_MULTIPLE_POOLS');
    expect(duplicate?.members.map(sideKey)).toEqual(['slot:A1']);
    expect([...(duplicate?.poolIds ?? [])].sort()).toEqual(['pA', 'pB']);
    expect(withDuplicate.some((warning) => warning.code === 'UNASSIGNED_TEAMS')).toBe(false);
    const ten = teamsOf(10);
    const uneven = poolWarnings(assignRandom(ten, { poolCount: 3 }, ['pA', 'pB', 'pC'], 3), ten);
    expect(uneven.map((warning) => warning.code)).toEqual(['UNEVEN_POOLS']);
    expect([...withEmpty, ...withSingle, ...withDuplicate, ...uneven].every((warning) => warning.message.trim().length > 0)).toBe(true);
  });
});

describe('adversarial round 2: round robin, drafts, validation and scheduling', () => {
  it.each<[number, string[]]>([
    [4, ['R1 A v D, C v B', 'R2 C v A, B v D', 'R3 A v B, D v C']],
    [5, ['R1 D v A, B v C (bye E)', 'R2 C v E, A v B (bye D)', 'R3 B v D, E v A (bye C)', 'R4 A v C, D v E (bye B)', 'R5 E v B, C v D (bye A)']],
    [6, ['R1 A v F, E v B, C v D', 'R2 E v A, D v F, B v C', 'R3 A v D, C v E, F v B', 'R4 C v A, B v D, E v F', 'R5 A v B, F v C, D v E']],
  ])('§4.1 golden schedule for %i entrants, copied from the document table', (n, expected) => {
    expect(gold(roundRobin('ABCDEF'.slice(0, n).split('').map(T), 1))).toEqual(expected);
  });

  it('a 4-team double round robin plays leg 2 as rounds 4–6 with every leg-1 fixture reversed', () => {
    expect(gold(roundRobin('ABCD'.split('').map(T), 2)).slice(3)).toEqual(['R4 D v A, B v C', 'R5 A v C, D v B', 'R6 B v A, C v D']);
  });

  it('EC-T-02: one 128-team league is 8,128 fixtures in 127 rounds, generated within 3x the 100 ms budget', () => {
    const started = performance.now();
    const rounds = roundRobin(teamsOf(128), 1);
    const drafts = draftsFromRoundRobin(rounds, defaultsOf({ poolId: 'league' }), idGen('l128'));
    const elapsed = performance.now() - started;
    console.log(`adversarial 128-team single league + drafts: ${elapsed.toFixed(1)} ms`);
    expect(elapsed).toBeLessThan(300);
    expect(rounds).toHaveLength(127);
    expect(drafts).toHaveLength(8128);
  });

  it('128 teams in 16 pools: draw, 448 group drafts, a day-by-day schedule and validation all within 3x the 100 ms budget', () => {
    const teams = teamsOf(128);
    const poolIds = Array.from({ length: 16 }, (_, index) => `pool-${index}`);
    const started = performance.now();
    const assignment = assignRandom(teams, { poolCount: 16 }, poolIds, normalizeSeed('Regional Champs'));
    const ids = idGen('r');
    const drafts: FixtureDraft[] = [];
    for (const pool of assignment.pools) {
      drafts.push(...draftsFromRoundRobin(roundRobin(pool.members, 1), defaultsOf({ poolId: pool.poolId, startMatchNumber: drafts.length + 1 }), ids));
    }
    const scheduled = scheduleSequential(drafts, { startDate: '2026-10-01', matchesPerDay: 24, times: ['09:00', '13:00', '17:00'] });
    const issues = validateFixtureDrafts(scheduled, {
      poolMembers: Object.fromEntries(assignment.pools.map((pool) => [pool.poolId, pool.members])),
      tournamentSides: teams,
      legsByPool: new Map(),
      defaultLegs: 1,
      startDate: '2026-10-01',
      endDate: null,
    });
    const elapsed = performance.now() - started;
    console.log(`adversarial 128 teams / 16 pools draw + drafts + schedule + validation: ${elapsed.toFixed(1)} ms`);
    expect(elapsed).toBeLessThan(300);
    expect(drafts).toHaveLength(448);
    expect(scheduled).toHaveLength(448);
    expect(issues).toEqual([]);
    const perDay = new Map<string, string[]>();
    for (const draft of scheduled) {
      const date = draft.scheduledDate ?? 'none';
      perDay.set(date, [...(perDay.get(date) ?? []), sideKey(draft.sideA), sideKey(draft.sideB)]);
    }
    expect(perDay.has('none')).toBe(false);
    for (const [, sides] of perDay) {
      expect(sides.length).toBeLessThanOrEqual(48);
      expect(new Set(sides).size).toBe(sides.length);
    }
  });

  it('U-FIX-10: a 4-team round robin from match 13 gives drafts 13..18 in round order, carrying the defaults, ids in call order', () => {
    const drafts = draftsFromRoundRobin(
      roundRobin('ABCD'.split('').map(T), 1),
      defaultsOf({ tournamentId: 'tour-9', stageId: 'groups', poolId: 'pA', formatId: 'T10', venueId: 'venue-1', startMatchNumber: 13 }),
      idGen('fx'),
    );
    expect(drafts.map((draft) => [draft.id, draft.matchNumber, draft.round, draft.leg, `${sideName(draft.sideA)} v ${sideName(draft.sideB)}`])).toEqual([
      ['fx-1', 13, 1, 1, 'A v D'],
      ['fx-2', 14, 1, 1, 'C v B'],
      ['fx-3', 15, 2, 1, 'C v A'],
      ['fx-4', 16, 2, 1, 'B v D'],
      ['fx-5', 17, 3, 1, 'A v B'],
      ['fx-6', 18, 3, 1, 'D v C'],
    ]);
    for (const draft of drafts) {
      expect(draft).toMatchObject({
        tournamentId: 'tour-9',
        stageId: 'groups',
        poolId: 'pA',
        formatId: 'T10',
        venueId: 'venue-1',
        matchRules: null,
        status: 'scheduled',
        bracket: null,
        isFinal: false,
        scheduledDate: null,
        scheduledTime: null,
      });
    }
  });

  it('U-FIX-11: a manual fixture keeps its sides, schedule, venue, notes and label, has no round or leg, and takes the next match number', () => {
    const draft = manualFixture(
      { sideA: T('LIO'), sideB: S('A1'), scheduledDate: '2026-05-09', scheduledTime: '14:00', venueId: 'v-2', formatId: 'T10', matchRules: null, notes: 'Floodlit', label: 'Exhibition' },
      defaultsOf({ tournamentId: 'tour-9', stageId: 'stage-2', poolId: null, startMatchNumber: 48 }),
      idGen('man'),
    );
    expect(draft).toMatchObject({
      id: 'man-1',
      tournamentId: 'tour-9',
      stageId: 'stage-2',
      poolId: null,
      matchNumber: 48,
      label: 'Exhibition',
      round: null,
      leg: null,
      bracket: null,
      isFinal: false,
      sideA: { kind: 'team', teamId: 'LIO' },
      sideB: { kind: 'slot', slotId: 'A1' },
      scheduledDate: '2026-05-09',
      scheduledTime: '14:00',
      venueId: 'v-2',
      formatId: 'T10',
      status: 'scheduled',
      notes: 'Floodlit',
    });
  });

  it('validateFixtureDrafts counts an encounter per unordered pair and per pool legs (legsByPool before defaultLegs)', () => {
    const base = draftsFromRoundRobin(roundRobin([T('LIO'), T('TIG')], 1), defaultsOf({ poolId: 'pA' }), idGen('v'))[0];
    const context = {
      poolMembers: { pA: [T('LIO'), T('TIG')], pB: [T('KNG'), T('ROY')] },
      tournamentSides: [T('LIO'), T('TIG'), T('KNG'), T('ROY')],
      legsByPool: new Map<string, number>([['pA', 1]]),
      defaultLegs: 2,
      startDate: null,
      endDate: null,
    };
    const reversed = { ...base, id: 'reversed', matchNumber: 2, sideA: T('TIG'), sideB: T('LIO') };
    const reversedIssues = validateFixtureDrafts([base, reversed], context);
    expect(reversedIssues.some((issue) => issue.code === 'DUPLICATE_ENCOUNTER')).toBe(true);
    expect(reversedIssues.every((issue) => issue.code === 'DUPLICATE_ENCOUNTER' && issue.severity === 'warning')).toBe(true);
    const home = { ...base, id: 'b1', poolId: 'pB', sideA: T('KNG'), sideB: T('ROY') };
    const away = { ...home, id: 'b2', matchNumber: 3, sideA: T('ROY'), sideB: T('KNG') };
    expect(validateFixtureDrafts([home, away], context)).toEqual([]);
    const third = { ...home, id: 'b3', matchNumber: 4 };
    expect(validateFixtureDrafts([home, away, third], context).map((issue) => `${issue.code}:${issue.severity}`)).toContain('DUPLICATE_ENCOUNTER:warning');
  });

  it('validateFixtureDrafts: the first and last tournament days are inside the window; unscheduled or differently-timed fixtures never clash', () => {
    const base = draftsFromRoundRobin(roundRobin([T('LIO'), T('TIG')], 1), defaultsOf({ poolId: 'pA' }), idGen('w'))[0];
    const context = {
      poolMembers: { pA: [T('LIO'), T('TIG')] },
      tournamentSides: [T('LIO'), T('TIG'), T('KNG'), T('ROY')],
      legsByPool: new Map<string, number>(),
      defaultLegs: 1,
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    };
    const knockout = (id: string, sideA: FixtureSide, sideB: FixtureSide, scheduledDate: string | null, scheduledTime: string | null): FixtureDraft => ({
      ...base,
      id,
      stageId: `ko-${id}`,
      poolId: null,
      sideA,
      sideB,
      scheduledDate,
      scheduledTime,
    });
    const clean = [
      { ...base, scheduledDate: '2026-05-01', scheduledTime: '10:00' },
      knockout('k1', T('LIO'), T('KNG'), null, null),
      knockout('k2', T('LIO'), T('ROY'), null, null),
      knockout('k3', T('KNG'), T('ROY'), '2026-05-31', '10:00'),
      knockout('k4', T('LIO'), T('TIG'), '2026-05-31', '14:00'),
    ];
    expect(validateFixtureDrafts(clean, context)).toEqual([]);
    const clash = knockout('k5', T('ROY'), T('TIG'), '2026-05-31', '10:00');
    const clashIssues = validateFixtureDrafts([...clean, clash], context);
    expect(clashIssues.map((issue) => `${issue.code}:${issue.severity}`)).toContain('TEAM_DOUBLE_BOOKED:warning');
    expect(clashIssues.every((issue) => issue.code === 'TEAM_DOUBLE_BOOKED')).toBe(true);
    const late = knockout('k6', T('KNG'), T('TIG'), '2026-06-01', '10:00');
    expect(validateFixtureDrafts([late], context).map((issue) => `${issue.code}:${issue.severity}`)).toEqual(['OUTSIDE_TOURNAMENT_DATES:warning']);
    const slotStranger = { ...base, id: 'slot-stranger', sideA: T('LIO'), sideB: S('B2') };
    expect(
      validateFixtureDrafts([slotStranger], { ...context, tournamentSides: [...context.tournamentSides, S('B2')] }).map((issue) => `${issue.code}:${issue.severity}`),
    ).toEqual(['SIDE_NOT_IN_POOL:error']);
  });

  it('U-FIX-18: six 4-team drafts, two a day at 09:00 and 13:00, rest day 05-02 → 05-01, 05-03, 05-04', () => {
    const drafts = draftsFromRoundRobin(roundRobin('ABCD'.split('').map(T), 1), defaultsOf(), idGen('u18'));
    const scheduled = scheduleSequential(deepFreeze(drafts), { startDate: '2026-05-01', matchesPerDay: 2, times: ['09:00', '13:00'], restDates: ['2026-05-02'] });
    const byId = new Map(scheduled.map((draft) => [draft.id, draft] as const));
    expect(
      drafts.map((draft) => `${sideName(draft.sideA)} v ${sideName(draft.sideB)} ${byId.get(draft.id)?.scheduledDate} ${byId.get(draft.id)?.scheduledTime}`),
    ).toEqual(['A v D 2026-05-01 09:00', 'C v B 2026-05-01 13:00', 'C v A 2026-05-03 09:00', 'B v D 2026-05-03 13:00', 'A v B 2026-05-04 09:00', 'D v C 2026-05-04 13:00']);
    expect(drafts.every((draft) => draft.scheduledDate === null)).toBe(true);
  });

  it('scheduleSequential walks drafts in round order even when the organizer hands them over newest round first', () => {
    const drafts = draftsFromRoundRobin(roundRobin(teamsOf(6), 1), defaultsOf(), idGen('rev'));
    const scheduled = scheduleSequential([...drafts].reverse(), { startDate: '2026-08-01', matchesPerDay: 3, times: ['10:00', '14:00', '18:00'] });
    const dateOf = new Map(scheduled.map((draft) => [draft.id, draft.scheduledDate] as const));
    const days = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'];
    expect(drafts.map((draft) => [draft.round, dateOf.get(draft.id)])).toEqual(drafts.map((draft) => [draft.round, days[(draft.round ?? 1) - 1]]));
  });
});

describe('adversarial round 2: knockout brackets and seeding', () => {
  it('U-KOB-02/03: the 8-team T20 semifinals with a third-place play-off, field by field', () => {
    const plan = knockoutBracket(
      ['A1', 'B1', 'A2', 'B2'].map(S),
      { thirdPlacePlayoff: true, rounds: null, firstSlotIndex: 4, defaults: defaultsOf({ stageId: 'ko', startMatchNumber: 13 }) },
      idGen('k'),
    );
    const show = (side: FixtureSide) => slotLabel(plan.slots, side);
    expect(plan.fixtures).toHaveLength(4);
    expect(plan.fixtures.map((draft) => ({ label: draft.label, bracket: draft.bracket, isFinal: draft.isFinal, a: show(draft.sideA), b: show(draft.sideB) }))).toEqual(
      expect.arrayContaining([
        { label: 'SF1', bracket: { kind: 'main', round: 1, position: 0, roundName: 'Semifinal' }, isFinal: false, a: 'A1', b: 'B2' },
        { label: 'SF2', bracket: { kind: 'main', round: 1, position: 1, roundName: 'Semifinal' }, isFinal: false, a: 'B1', b: 'A2' },
        { label: 'Final', bracket: { kind: 'main', round: 2, position: 0, roundName: 'Final' }, isFinal: true, a: 'Winner SF1', b: 'Winner SF2' },
        { label: 'Third place', bracket: { kind: 'third_place', round: 2, position: 0, roundName: 'Third place' }, isFinal: false, a: 'Loser SF1', b: 'Loser SF2' },
      ]),
    );
    expect([...plan.slots].sort((x, y) => x.index - y.index).map((slotItem) => [slotItem.index, slotItem.label, slotItem.role, slotItem.seed, slotItem.source])).toEqual([
      [4, 'Winner SF1', 'progression', null, { kind: 'bracket_winner', stageId: 'ko', round: 1, position: 0 }],
      [5, 'Winner SF2', 'progression', null, { kind: 'bracket_winner', stageId: 'ko', round: 1, position: 1 }],
      [6, 'Loser SF1', 'progression', null, { kind: 'bracket_loser', stageId: 'ko', round: 1, position: 0 }],
      [7, 'Loser SF2', 'progression', null, { kind: 'bracket_loser', stageId: 'ko', round: 1, position: 1 }],
    ]);
    expect([...plan.entrySlotSeeds].sort((x, y) => x.seed - y.seed)).toEqual([
      { slotId: 'A1', seed: 1 },
      { slotId: 'B1', seed: 2 },
      { slotId: 'A2', seed: 3 },
      { slotId: 'B2', seed: 4 },
    ]);
    expect(plan.byes).toEqual([]);
    expect(plan.fixtures.every((draft) => draft.poolId === null && draft.stageId === 'ko' && draft.status === 'scheduled')).toBe(true);
  });

  it('main knockout fixtures are numbered in (round, position) order from startMatchNumber, so QF1 comes before QF2 and every quarterfinal before a semifinal', () => {
    for (const n of [4, 5, 6, 8, 11, 16, 24, 32]) {
      const plan = buildBracket(teamsOf(n, 's'), { startMatchNumber: 100, thirdPlacePlayoff: true });
      const mains = plan.fixtures.filter((draft) => draft.bracket?.kind === 'main');
      const byBracket = [...mains].sort((x, y) => (x.bracket?.round ?? 0) - (y.bracket?.round ?? 0) || (x.bracket?.position ?? 0) - (y.bracket?.position ?? 0));
      expect([n, byBracket.map((draft) => draft.matchNumber)]).toEqual([n, [...mains.map((draft) => draft.matchNumber)].sort((x, y) => x - y)]);
      expect(Math.min(...plan.fixtures.map((draft) => draft.matchNumber))).toBe(100);
    }
  });

  it('knockoutBracket is deterministic and pure: same entrants and generator → identical plan, frozen input untouched, every slot entrant seeded', () => {
    for (const n of [3, 7, 12, 17]) {
      const entrants = deepFreeze(Array.from({ length: n }, (_, index) => (index % 2 === 0 ? T(`t${index}`) : S(`e${index}`))));
      const first = buildBracket(entrants, { thirdPlacePlayoff: true, prefix: 'same' });
      const second = buildBracket(entrants, { thirdPlacePlayoff: true, prefix: 'same' });
      expect(second).toEqual(first);
      expect(first.entrySlotSeeds.map((entry) => entry.slotId).sort()).toEqual(entrants.filter((side) => side.kind === 'slot').map(sideName).sort());
    }
  });

  it('fixed seeding does not depend on the order the entrants arrive in (4 pools x 2, 30 shuffles)', () => {
    const entrants = [0, 1, 2, 3].flatMap((pool) => [poolSeeded(pool, 1), poolSeeded(pool, 2)]);
    for (let seed = 1; seed <= 30; seed += 1) {
      expect(seedEntrants(refShuffle(entrants, refMulberry32(seed)), 'fixed', null).map(sideName)).toEqual(['A1', 'B1', 'D1', 'C1', 'D2', 'C2', 'A2', 'B2']);
    }
  });

  it('fixed, two non-adjacent pools (B and D): B1 v D2 and D1 v B2', () => {
    const order = seedEntrants([poolSeeded(3, 2), poolSeeded(1, 1), poolSeeded(3, 1), poolSeeded(1, 2)], 'fixed', null);
    expect(order.map(sideName)).toEqual(['B1', 'D1', 'B2', 'D2']);
    expect(firstRoundPairs(order)).toEqual(['B1 v D2', 'D1 v B2']);
  });

  it('U-KO-05: fixed seeding puts pool-positioned entrants first and the others after them in slot order', () => {
    const wildcard: SeededEntrant = { side: S('zz-wildcard'), rank: null, poolIndex: null, poolPosition: null };
    const bestRunnerUp: SeededEntrant = { side: S('aa-best-runner-up'), rank: null, poolIndex: null, poolPosition: null };
    const order = seedEntrants([wildcard, poolSeeded(2, 1), bestRunnerUp, poolSeeded(0, 1), poolSeeded(1, 1)], 'fixed', null);
    expect(order.map(sideName)).toEqual(['A1', 'B1', 'C1', 'zz-wildcard', 'aa-best-runner-up']);
  });

  it('ranking with six qualifiers: ranks 1 and 2 get byes and the quarterfinals are rank 4 v 5 and rank 3 v 6', () => {
    const entrants = [6, 2, 4, 1, 5, 3].map((rank): SeededEntrant => ({ side: S(`rank-${rank}`), rank, poolIndex: null, poolPosition: null }));
    const plan = buildBracket(seedEntrants(entrants, 'ranking', null), { firstSlotIndex: 6 });
    expect(plan.byes.map(sideName)).toEqual(['rank-1', 'rank-2']);
    expect(
      plan.fixtures
        .filter((draft) => draft.bracket?.round === 1)
        .sort((x, y) => (x.bracket?.position ?? 0) - (y.bracket?.position ?? 0))
        .map((draft) => `${draft.label}: ${sideName(draft.sideA)} v ${sideName(draft.sideB)}`),
    ).toEqual(['QF1: rank-4 v rank-5', 'QF2: rank-3 v rank-6']);
    expect([...plan.entrySlotSeeds].sort((x, y) => x.seed - y.seed).map((entry) => entry.slotId)).toEqual(['rank-1', 'rank-2', 'rank-3', 'rank-4', 'rank-5', 'rank-6']);
  });
});

describe('adversarial round 2: knockout advancement', () => {
  const ko = fixtureOf({ id: 'sf1', stageId: 'ko', sideA: S('A1'), sideB: S('B2'), bracket: { kind: 'main', round: 1, position: 0, roundName: 'Semifinal' } });

  it('DEFAULT_KNOCKOUT_CONFIG is BR-KO-13: no third place, play to one winner, tie → super over, no result → higher seed', () => {
    expect(DEFAULT_KNOCKOUT_CONFIG).toEqual({ thirdPlacePlayoff: false, rounds: null, tiedMatch: 'super_over', noResult: 'higher_seed' });
  });

  it('U-KO-23: a custom stage on the default config needs the organizer for a tie still level and sends a washout to the higher seed', () => {
    const seeds: Record<string, number> = { LIO: 1, TIG: 4 };
    const seedOf = (teamId: TeamId) => seeds[teamId] ?? null;
    expect(knockoutAdvancer(ko, { a: 'LIO', b: 'TIG' }, summaryOf('LIO', 'TIG', { type: 'tie', decider: null }), DEFAULT_KNOCKOUT_CONFIG, seedOf)).toEqual({
      winnerTeamId: null,
      loserTeamId: null,
      basis: 'organizer_required',
    });
    expect(knockoutAdvancer(ko, { a: 'LIO', b: 'TIG' }, summaryOf('LIO', 'TIG', { type: 'abandoned', reason: 'Rain' }), DEFAULT_KNOCKOUT_CONFIG, seedOf)).toEqual({
      winnerTeamId: 'LIO',
      loserTeamId: 'TIG',
      basis: 'higher_seed',
    });
  });

  it('U-KO-19: no result with both seeds unknown needs the organizer', () => {
    expect(
      knockoutAdvancer(ko, { a: 'LIO', b: 'TIG' }, summaryOf('LIO', 'TIG', { type: 'no_result', reason: null }), { ...DEFAULT_KNOCKOUT_CONFIG, noResult: 'higher_seed' }, () => null),
    ).toEqual({ winnerTeamId: null, loserTeamId: null, basis: 'organizer_required' });
  });

  it('U-KO-24: a played fixture is decided between its frozen teams even when the caller passes a stale slot resolution', () => {
    const played = fixtureOf({ ...ko, matchId: 'm-1', matchSides: { teamAId: 'TIG', teamBId: 'LIO' }, status: 'completed' });
    const stale = { a: 'KNG', b: 'LIO' };
    const seeds: Record<string, number> = { KNG: 1, TIG: 2, LIO: 3 };
    const seedOf = (teamId: TeamId) => seeds[teamId] ?? null;
    const win: MatchResult = { type: 'win', winnerTeamId: 'TIG', loserTeamId: 'LIO', margin: { kind: 'runs', runs: 4 }, method: 'normal' };
    expect(knockoutAdvancer(played, stale, summaryOf('TIG', 'LIO', win), DEFAULT_KNOCKOUT_CONFIG, seedOf)).toEqual({ winnerTeamId: 'TIG', loserTeamId: 'LIO', basis: 'result' });
    expect(knockoutAdvancer(played, stale, summaryOf('TIG', 'LIO', { type: 'no_result', reason: null }), DEFAULT_KNOCKOUT_CONFIG, seedOf)).toEqual({
      winnerTeamId: 'TIG',
      loserTeamId: 'LIO',
      basis: 'higher_seed',
    });
  });
});

describe('adversarial round 2: entry slots', () => {
  const twoPools: Pool[] = [poolOf('pA', 'groups', 'Pool A', 0), poolOf('pB', 'groups', 'Pool B', 1)];

  it('knockout_winners from a six-team quarterfinal stage with its entrant count: "QF seed 1", "Winner QF1", "QF seed 2", "Winner QF2"', () => {
    const { slots } = expandEntryRules(
      'sf',
      [{ kind: 'knockout_winners', sourceStageId: 'qf' }],
      { pools: new Map(), brackets: new Map([['qf', { lastRound: 1, positions: 4, entrants: 6 }]]) },
      [],
      idGen('ks'),
    );
    expect(slots.map((slotItem) => slotItem.label)).toEqual(['QF seed 1', 'Winner QF1', 'QF seed 2', 'Winner QF2']);
    expect(slots.map((slotItem) => slotItem.source)).toEqual([0, 1, 2, 3].map((position) => ({ kind: 'bracket_winner', stageId: 'qf', round: 1, position })));
  });

  it('knockout_winners are labelled by the size of the round they leave: QF-only → Winner QF1..4; a 16-team stage stopping after round 2 → Winner QF1..4; an 8-team stage stopping after the semifinals → Winner SF1, SF2', () => {
    const expand = (shape: { lastRound: number; positions: number; entrants?: number }) =>
      expandEntryRules('next', [{ kind: 'knockout_winners', sourceStageId: 'src' }], { pools: new Map(), brackets: new Map([['src', shape]]) }, [], idGen('kw')).slots;
    expect(expand({ lastRound: 1, positions: 4 }).map((slotItem) => slotItem.label)).toEqual(['Winner QF1', 'Winner QF2', 'Winner QF3', 'Winner QF4']);
    const afterRoundTwo = expand({ lastRound: 2, positions: 4, entrants: 16 });
    expect(afterRoundTwo.map((slotItem) => slotItem.label)).toEqual(['Winner QF1', 'Winner QF2', 'Winner QF3', 'Winner QF4']);
    expect(afterRoundTwo.map((slotItem) => slotItem.source)).toEqual([0, 1, 2, 3].map((position) => ({ kind: 'bracket_winner', stageId: 'src', round: 2, position })));
    expect(expand({ lastRound: 2, positions: 2, entrants: 8 }).map((slotItem) => slotItem.label)).toEqual(['Winner SF1', 'Winner SF2']);
  });

  it.each<[number, number, string[]]>([
    [2, 4, ['Best runner-up', '2nd best runner-up', '3rd best runner-up', '4th best runner-up']],
    [3, 2, ['Best 3rd', 'Best 3rd #2']],
  ])('best_of_position {position %i, count %i} labels as documented (§8.1, CONTRACT_REFERENCE slots.ts, U-SLOT-05)', (position, count, labels) => {
    const { slots } = expandEntryRules(
      'ko',
      [{ kind: 'best_of_position', sourceStageId: 'groups', position, count, normalization: 'per_match_average' }],
      { pools: new Map([['groups', twoPools]]), brackets: new Map() },
      [],
      idGen('bo'),
    );
    expect(slots.map((slotItem) => slotItem.source)).toEqual(
      Array.from({ length: count }, (_, index) => ({ kind: 'best_of_position', stageId: 'groups', position, rank: index + 1, normalization: 'per_match_average' })),
    );
    expect(slots.map((slotItem) => slotItem.label)).toEqual(labels);
  });

  it('top_overall labels use English ordinals right up to 23rd overall (11th, 12th, 13th, 21st, 22nd, 23rd)', () => {
    const { slots } = expandEntryRules(
      'ko',
      [{ kind: 'top_overall', sourceStageId: 'groups', count: 23, normalization: 'raw' }],
      { pools: new Map([['groups', twoPools]]), brackets: new Map() },
      [],
      idGen('ov'),
    );
    expect(slots.map((slotItem) => slotItem.label)).toEqual(Array.from({ length: 23 }, (_, index) => `${refOrdinal(index + 1)} overall`));
    expect(slots.map((slotItem) => slotItem.source)).toEqual(
      Array.from({ length: 23 }, (_, index) => ({ kind: 'overall_position', stageId: 'groups', rank: index + 1, normalization: 'raw' })),
    );
  });

  it('manual {count 4} gives TBD 1 … TBD 4 with no team (§8.1)', () => {
    const { slots } = expandEntryRules('ko', [{ kind: 'manual', count: 4, label: 'TBD' }], { pools: new Map(), brackets: new Map() }, [], idGen('tbd'));
    expect(slots.map((slotItem) => [slotItem.index, slotItem.label, slotItem.source])).toEqual([1, 2, 3, 4].map((n) => [n - 1, `TBD ${n}`, { kind: 'manual', teamId: null }]));
  });

  it('re-expanding a drawn knockout stage keeps every entry slot id and never deletes the Winner SF1/SF2 progression slots', () => {
    const rules = [{ kind: 'top_per_pool' as const, sourceStageId: 'groups', count: 2, fromPosition: 1 }];
    const entries = expandEntryRules('ko', rules, { pools: new Map([['groups', twoPools]]), brackets: new Map() }, [], idGen('e')).slots;
    const plan = knockoutBracket(
      entries.map((slotItem) => S(slotItem.id)),
      { thirdPlacePlayoff: false, rounds: null, firstSlotIndex: entries.length, defaults: defaultsOf({ stageId: 'ko' }) },
      idGen('p'),
    );
    const seedOf = new Map(plan.entrySlotSeeds.map((entry) => [entry.slotId, entry.seed] as const));
    const existing = [...entries.map((slotItem) => ({ ...slotItem, seed: seedOf.get(slotItem.id) ?? null })), ...plan.slots];
    const again = expandEntryRules('ko', rules, { pools: new Map([['groups', twoPools]]), brackets: new Map() }, existing, idGen('again'));
    expect(again.slots.map((slotItem) => slotItem.id)).toEqual(entries.map((slotItem) => slotItem.id));
    expect(again.slots.every((slotItem) => slotItem.role === 'entry')).toBe(true);
    expect(again.removed).toEqual([]);
  });
});

describe('adversarial round 2: templates', () => {
  it('built-ins carry the documented metadata and default rules, and a caller tampering with one call never changes the next', () => {
    const first = builtinTemplates();
    const pristine: unknown = JSON.parse(JSON.stringify(first));
    for (const template of first) {
      expect(template.id.startsWith('builtin:')).toBe(true);
      expect(template.builtin).toBe(true);
      expect(template.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(template.updatedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(template.pointsSystem).toEqual(DEFAULT_POINTS_SYSTEM);
      expect(template.nrr).toEqual(DEFAULT_NRR_CONFIG);
      expect(template.tieBreakers).toEqual(DEFAULT_TIE_BREAKERS);
      expect(template.defaultFormatId).toBe('T20');
    }
    const attempts: (() => void)[] = [
      () => {
        (first as TournamentTemplate[]).push(first[0]);
      },
      () => {
        (first[0].stages as TemplateStage[]).splice(0, 1);
      },
      () => {
        (first[1] as { name: string }).name = 'Hacked';
      },
      () => {
        (first[2].pointsSystem as { win: number }).win = 99;
      },
    ];
    for (const attempt of attempts) {
      try {
        attempt();
      } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
      }
    }
    expect(JSON.parse(JSON.stringify(builtinTemplates()))).toEqual(pristine);
    expect(DEFAULT_POINTS_SYSTEM.win).toBe(2);
  });

  it.each<[string, number]>([
    ['builtin:8-team-t20', 15],
    ['builtin:4-team-league', 12],
    ['builtin:8-team-knockout', 7],
    ['builtin:16-team-groups', 31],
    ['builtin:20-team-pools', 43],
  ])('%s produces %i fixtures in total for its team count (group round robins + knockout bracket)', (templateId, total) => {
    const template = builtinTemplates().find((candidate) => candidate.id === templateId) as TournamentTemplate;
    const structure = instantiateTemplate(template, { tournamentId: 't', now: NOW, ids: idGen('cnt') });
    const teams = teamsOf(template.teamCount ?? 0, 'club');
    let count = 0;
    for (const stage of [...structure.stages].sort((x, y) => x.orderIndex - y.orderIndex)) {
      const pools = structure.pools.filter((pool) => pool.stageId === stage.id).sort((x, y) => x.orderIndex - y.orderIndex);
      const entrySlots = structure.slots.filter((slotItem) => slotItem.stageId === stage.id && slotItem.role === 'entry');
      const entrants = stage.config.entryRules.length === 0 ? teams : entrySlots.map((slotItem) => S(slotItem.id));
      if (stage.config.fixtureGeneration.method === 'round_robin') {
        const sizes = distributePoolSizes(entrants.length, pools.length);
        pools.forEach((pool, index) => {
          const legs = pool.legs ?? stage.config.fixtureGeneration.legs;
          count += (legs * sizes[index] * (sizes[index] - 1)) / 2;
        });
      } else if (stage.config.fixtureGeneration.method === 'knockout') {
        const plan = knockoutBracket(
          entrants,
          {
            thirdPlacePlayoff: stage.config.knockout?.thirdPlacePlayoff ?? false,
            rounds: stage.config.knockout?.rounds ?? null,
            firstSlotIndex: entrySlots.length,
            defaults: defaultsOf({ stageId: stage.id }),
          },
          idGen('kc'),
        );
        count += plan.fixtures.length;
      }
    }
    expect(count).toBe(total);
  });

  it('instantiateTemplate copies the template rules and every stage setting and draws every id from the injected generator', () => {
    const now = '2026-09-30T08:00:00.000Z';
    for (const template of [...builtinTemplates(), ...customTemplates(), sixQualifierTemplate()]) {
      const structure = instantiateTemplate(template, { tournamentId: 'tour-z', now, ids: idGen('gen') });
      expect(structure.rules).toEqual({
        tournamentId: 'tour-z',
        pointsSystem: template.pointsSystem,
        nrr: template.nrr,
        tieBreakers: template.tieBreakers,
        defaultFormatId: template.defaultFormatId,
        defaultMatchRules: template.defaultMatchRules,
        updatedAt: now,
      });
      const ordered = [...structure.stages].sort((x, y) => x.orderIndex - y.orderIndex);
      expect(ordered).toHaveLength(template.stages.length);
      ordered.forEach((stage, index) => {
        const source = template.stages[index];
        expect([template.id, stage.name, stage.type, stage.createdAt, stage.updatedAt]).toEqual([template.id, source.name, source.type, now, now]);
        expect(stage.config).toMatchObject({
          fixtureGeneration: source.fixtureGeneration,
          seeding: source.seeding,
          seedingSeed: null,
          seedingNormalization: source.seedingNormalization,
          knockout: source.knockout,
          abandonedMatches: source.abandonedMatches,
          decidesChampion: source.decidesChampion,
          headToHeadRequiresCompleteMiniLeague: source.headToHeadRequiresCompleteMiniLeague,
          formatId: source.formatId,
          matchRules: source.matchRules,
          pointsSystem: source.pointsSystem,
          tieBreakers: source.tieBreakers,
          nrr: source.nrr,
        });
        expect([template.id, stage.name, structure.pools.filter((pool) => pool.stageId === stage.id).length]).toEqual([template.id, source.name, source.poolCount]);
      });
      const ids = [...structure.stages, ...structure.pools, ...structure.slots, ...structure.poolEntries].map((item) => item.id);
      expect([template.id, ids.filter((id) => !id.startsWith('gen-'))]).toEqual([template.id, []]);
    }
  });

  it('builtin:8-team-knockout: one ranking knockout with no entry slots; pre-tournament seeds give QF1 1v8, QF2 4v5, QF3 2v7, QF4 3v6', () => {
    const template = builtinTemplates().find((candidate) => candidate.id === 'builtin:8-team-knockout') as TournamentTemplate;
    const structure = instantiateTemplate(template, { tournamentId: 't', now: NOW, ids: idGen('k8') });
    expect(structure.stages).toHaveLength(1);
    const [stage] = structure.stages;
    expect([stage.type, stage.config.decidesChampion, stage.config.seeding]).toEqual(['knockout', true, 'ranking']);
    expect(structure.slots).toEqual([]);
    expect(knockoutGenerationGuard('ranking', []).ok).toBe(true);
    const clubs: [string, number][] = [
      ['Royals', 3],
      ['Kings', 8],
      ['Lions', 1],
      ['Titans', 6],
      ['Hawks', 5],
      ['Eagles', 2],
      ['Tigers', 7],
      ['Giants', 4],
    ];
    const order = seedEntrants(
      clubs.map(([name, seed]): SeededEntrant => ({ side: T(name), rank: seed, poolIndex: null, poolPosition: null })),
      stage.config.seeding,
      null,
    );
    const plan = knockoutBracket(
      order,
      {
        thirdPlacePlayoff: stage.config.knockout?.thirdPlacePlayoff ?? false,
        rounds: stage.config.knockout?.rounds ?? null,
        firstSlotIndex: 0,
        defaults: defaultsOf({ stageId: stage.id }),
      },
      idGen('k8draw'),
    );
    const quarterfinals = plan.fixtures.filter((draft) => draft.bracket?.round === 1).sort((x, y) => (x.bracket?.position ?? 0) - (y.bracket?.position ?? 0));
    expect(quarterfinals.map((draft) => `${draft.label}: ${sideName(draft.sideA)} v ${sideName(draft.sideB)}`)).toEqual([
      'QF1: Lions v Kings',
      'QF2: Giants v Hawks',
      'QF3: Eagles v Tigers',
      'QF4: Royals v Titans',
    ]);
    expect(plan.fixtures.filter((draft) => draft.isFinal)).toHaveLength(1);
  });

  it('templateFitsTeamCount explains too few teams as well; a template without a team count fits realistic fields, never a single team (EC-T-01), and always explains a refusal', () => {
    const t20 = builtinTemplates().find((candidate) => candidate.id === 'builtin:8-team-t20') as TournamentTemplate;
    expect(templateFitsTeamCount(t20, 6)).toEqual({ ok: false, message: 'Designed for 8 teams; you have 6.' });
    for (const template of builtinTemplates()) {
      const open: TournamentTemplate = { ...template, id: 'user:open', builtin: false, teamCount: null };
      for (const n of [8, 12, 33, 128]) {
        expect([template.id, n, templateFitsTeamCount(open, n)]).toEqual([template.id, n, { ok: true, message: null }]);
      }
      const single = templateFitsTeamCount(open, 1);
      expect([template.id, single.ok, (single.message ?? '').length > 0]).toEqual([template.id, false, true]);
      for (let n = 1; n <= 8; n += 1) {
        const fit = templateFitsTeamCount(open, n);
        expect([template.id, n, fit.ok || (fit.message ?? '').trim().length > 0]).toEqual([template.id, n, true]);
      }
    }
    const league = builtinTemplates().find((candidate) => candidate.id === 'builtin:4-team-league') as TournamentTemplate;
    expect(templateFitsTeamCount({ ...league, id: 'user:open-league', builtin: false, teamCount: null }, 2).ok).toBe(true);
  });

  it('a six-qualifier template labels its final-four entries "QF seed 1", "Winner QF1", "QF seed 2", "Winner QF2" and survives a save round trip', () => {
    const template = sixQualifierTemplate();
    const structure = instantiateTemplate(template, { tournamentId: 't', now: NOW, ids: idGen('six') });
    const finalFour = [...structure.stages].sort((x, y) => x.orderIndex - y.orderIndex)[2];
    expect(structure.slots.filter((slotItem) => slotItem.stageId === finalFour.id).sort((x, y) => x.index - y.index).map((slotItem) => slotItem.label)).toEqual([
      'QF seed 1',
      'Winner QF1',
      'QF seed 2',
      'Winner QF2',
    ]);
    const saved = templateFromSnapshot(structureSnapshot(structure, template), { id: 'user:six-copy', name: 'Six copy', description: '', now: NOW });
    expect(saved.stages.find((stage) => stage.name === 'Final four')?.entry.map((rule) => rule.kind)).toEqual(['knockout_winners']);
    const again = instantiateTemplate(saved, { tournamentId: 't', now: NOW, ids: idGen('six-again') });
    expect(stable(normalizeStructure(again))).toBe(stable(normalizeStructure(structure)));
  });
});

describe('adversarial round 2: state machines', () => {
  it.each<[TournamentStatus, TournamentStatus, string]>([
    ['draft', 'active', "A tournament can't go from Draft to Active."],
    ['draft', 'completed', "A tournament can't go from Draft to Completed."],
    ['draft', 'archived', "A tournament can't go from Draft to Archived."],
    ['active', 'archived', "A tournament can't go from Active to Archived."],
    ['completed', 'draft', "A tournament can't go from Completed back to Draft."],
    ['archived', 'active', "A tournament can't go from Archived back to Active."],
    ['archived', 'draft', "A tournament can't go from Archived back to Draft."],
    ['active', 'active', 'The tournament is already Active.'],
    ['completed', 'completed', 'The tournament is already Completed.'],
    ['archived', 'archived', 'The tournament is already Archived.'],
  ])('tournament %s → %s is refused with the CONTRACT_REFERENCE sentence', (from, to, reason) => {
    expect(canTransitionTournament(from, to, PERMISSIVE)).toEqual({ ok: false, reason });
  });

  it('every allowed tournament, fixture and match transition returns ok with a warnings list, and every refusal explains itself', () => {
    for (const [from, to] of TOURNAMENT_ALLOWED) {
      const guard = canTransitionTournament(from, to, PERMISSIVE);
      expect([from, to, guard.ok && Array.isArray(guard.warnings)]).toEqual([from, to, true]);
    }
    for (const [from, to] of FIXTURE_ALLOWED) {
      const guard = canTransitionFixture(from, to, { hasMatch: true, replayAllowed: true });
      expect([from, to, guard.ok && Array.isArray(guard.warnings)]).toEqual([from, to, true]);
    }
    for (const [from, to] of MATCH_ALLOWED) {
      const guard = canTransitionMatch(from, to, { hasDeliveries: false });
      expect([from, to, guard.ok && Array.isArray(guard.warnings)]).toEqual([from, to, true]);
    }
    const refusals = [
      canTransitionStage('pending', 'completed', { fixturesConfirmed: true, entrantsResolved: true, allFixturesTerminal: true }),
      canTransitionStage('pending', 'active', { fixturesConfirmed: false, entrantsResolved: true, allFixturesTerminal: true }),
      canTransitionStage('active', 'completed', { fixturesConfirmed: true, entrantsResolved: true, allFixturesTerminal: false }),
      canTransitionFixture('live', 'scheduled', { hasMatch: true, replayAllowed: true }),
      canTransitionFixture('postponed', 'completed', { hasMatch: false, replayAllowed: true }),
      canTransitionFixture('postponed', 'live', { hasMatch: true, replayAllowed: true }),
      canTransitionFixture('abandoned', 'rescheduled', { hasMatch: true, replayAllowed: false }),
      canTransitionMatch('cancelled', 'live', { hasDeliveries: false }),
      canTransitionMatch('scheduled', 'completed', { hasDeliveries: true }),
      canTransitionTournament('structure_configured', 'pools_configured', ctxOf({ poolsComplete: false })),
    ];
    for (const guard of refusals) {
      expect(guard.ok ? 'allowed' : guard.reason.trim().length > 5 ? 'explained' : guard.reason).toBe('explained');
    }
  });

  it('only scheduled|postponed → completed depends on deliveries: a live or paused match can end (e.g. no result before a ball) either way', () => {
    for (const from of ['live', 'paused'] as const) {
      for (const hasDeliveries of [false, true]) {
        expect([from, hasDeliveries, canTransitionMatch(from, 'completed', { hasDeliveries }).ok]).toEqual([from, hasDeliveries, true]);
        expect([from, hasDeliveries, canTransitionMatch(from, 'abandoned', { hasDeliveries }).ok]).toEqual([from, hasDeliveries, true]);
      }
    }
    expect(canTransitionMatch('postponed', 'completed', { hasDeliveries: false }).ok).toBe(true);
    expect(canTransitionMatch('scheduled', 'abandoned', { hasDeliveries: false }).ok).toBe(true);
  });

  it('EC-T-16: with abandonedMatches no_result an abandoned fixture cannot be rescheduled; EC-T-15: with replay it can; a completed one never', () => {
    expect(canTransitionFixture('abandoned', 'rescheduled', { hasMatch: true, replayAllowed: false }).ok).toBe(false);
    expect(canTransitionFixture('abandoned', 'rescheduled', { hasMatch: true, replayAllowed: true }).ok).toBe(true);
    expect(canTransitionFixture('completed', 'rescheduled', { hasMatch: true, replayAllowed: true }).ok).toBe(false);
  });

  it('deleting a tournament is allowed in any state while no match has started (incl. completed), confirm afterwards, never while archived', () => {
    for (const status of TOURNAMENT_STATUSES) {
      const withoutMatches = tournamentEditPolicy(status, ctxOf({ matchesStarted: 0, matchesCompleted: 0 })).deleteTournament;
      expect([status, withoutMatches]).toEqual([status, status === 'archived' ? 'forbidden' : 'allowed']);
    }
    for (const status of ['active', 'completed'] as const) {
      expect([status, tournamentEditPolicy(status, ctxOf({ matchesStarted: 3, matchesCompleted: 3 })).deleteTournament]).toEqual([status, 'confirm']);
    }
  });
});

describe('adversarial round 2: organizer workflows', () => {
  it.each([1, 2])('moving Lions from Pool A to Pool C (%i leg) leaves Pool C with a complete round robin and Pool A with valid unplayed fixtures only', (legs) => {
    const poolA = ['Tigers', 'Lions', 'Eagles', 'Hawks'].map(T);
    const poolC = ['Kings', 'Royals', 'Titans'].map(T);
    const ids = idGen(`mv${legs}`);
    const aDrafts = draftsFromRoundRobin(roundRobin(poolA, legs), defaultsOf({ poolId: 'pA', startMatchNumber: 1 }), ids);
    const cDrafts = draftsFromRoundRobin(roundRobin(poolC, legs), defaultsOf({ poolId: 'pC', startMatchNumber: aDrafts.length + 1 }), ids);
    const fixtures = [...aDrafts, ...cDrafts].map((draft) =>
      pairKeyOf(draft) === 'Lions-Tigers' && draft.leg === 1
        ? fixtureOf({ ...draft, status: 'completed', matchId: 'm-lt', matchSides: { teamAId: sideName(draft.sideA), teamBId: sideName(draft.sideB) } })
        : fixtureOf(draft),
    );
    const assignment: PoolAssignment = {
      seed: null,
      pools: [
        { poolId: 'pA', name: 'Pool A', members: poolA },
        { poolId: 'pC', name: 'Pool C', members: poolC },
      ],
    };
    const moved = moveMember(assignment, T('Lions'), 'pC');
    const newA = moved.pools.find((pool) => pool.poolId === 'pA')?.members ?? [];
    const newC = moved.pools.find((pool) => pool.poolId === 'pC')?.members ?? [];
    expect([newA.map(sideName), newC.map(sideName)]).toEqual([
      ['Tigers', 'Eagles', 'Hawks'],
      ['Kings', 'Royals', 'Titans', 'Lions'],
    ]);
    const result = fixturesForPoolMove(
      { member: T('Lions'), fromPoolId: 'pA', fixtures: deepFreeze(fixtures), targetMembers: poolC, legs, defaults: defaultsOf({ poolId: 'pC', startMatchNumber: fixtures.length + 1 }) },
      ids,
    );
    const removed = new Set(result.removeFixtureIds);
    expect(fixtures.filter((fixture) => fixture.matchId !== null).every((fixture) => !removed.has(fixture.id))).toBe(true);
    const kept = fixtures.filter((fixture) => !removed.has(fixture.id));
    const inC = [...kept.filter((fixture) => fixture.poolId === 'pC'), ...result.addFixtures.filter((draft) => draft.poolId === 'pC')];
    const unplayedA = kept.filter((fixture) => fixture.poolId === 'pA' && fixture.matchId === null);
    const pairCounts = (list: readonly { readonly sideA: FixtureSide; readonly sideB: FixtureSide }[]) => {
      const counts = new Map<string, number>();
      for (const item of list) {
        counts.set(pairKeyOf(item), (counts.get(pairKeyOf(item)) ?? 0) + 1);
      }
      return [...counts.entries()].sort((x, y) => x[0].localeCompare(y[0]));
    };
    expect(result.addFixtures).toHaveLength(3 * legs);
    expect(pairCounts(inC)).toEqual(['Kings-Lions', 'Kings-Royals', 'Kings-Titans', 'Lions-Royals', 'Lions-Titans', 'Royals-Titans'].map((pair) => [pair, legs]));
    expect(pairCounts(unplayedA)).toEqual(['Eagles-Hawks', 'Eagles-Tigers', 'Hawks-Tigers'].map((pair) => [pair, legs]));
    expect(
      validateFixtureDrafts([...unplayedA, ...inC], {
        poolMembers: { pA: newA, pC: newC },
        tournamentSides: [...poolA, ...poolC],
        legsByPool: new Map(),
        defaultLegs: legs,
        startDate: null,
        endDate: null,
      }),
    ).toEqual([]);
    expect(result.addFixtures.map((draft) => draft.matchNumber).sort((x, y) => x - y)).toEqual(Array.from({ length: 3 * legs }, (_, index) => fixtures.length + 1 + index));
  });

  it('a Super 8 qualifier (slot D2) moved to the other group takes only its own unplayed fixtures along and meets all four members there', () => {
    const g1 = ['A1', 'B2', 'C1', 'D2'].map(S);
    const g2 = ['B1', 'A2', 'D1', 'C2'].map(S);
    const ids = idGen('s8m');
    const fixtures = [
      ...draftsFromRoundRobin(roundRobin(g1, 1), defaultsOf({ poolId: 'g1', startMatchNumber: 1 }), ids),
      ...draftsFromRoundRobin(roundRobin(g2, 1), defaultsOf({ poolId: 'g2', startMatchNumber: 7 }), ids),
    ].map((draft) => fixtureOf(draft));
    const result = fixturesForPoolMove(
      { member: { kind: 'slot', slotId: 'D2' }, fromPoolId: 'g1', fixtures, targetMembers: g2, legs: 1, defaults: defaultsOf({ poolId: 'g2', startMatchNumber: 13 }) },
      ids,
    );
    const removed = fixtures.filter((fixture) => result.removeFixtureIds.includes(fixture.id));
    expect(removed).toHaveLength(3);
    expect(removed.every((fixture) => fixture.poolId === 'g1' && [fixture.sideA, fixture.sideB].some((side) => sideKey(side) === 'slot:D2'))).toBe(true);
    expect(result.addFixtures.map(pairKeyOf).sort()).toEqual(['A2-D2', 'B1-D2', 'C2-D2', 'D1-D2']);
    expect(result.addFixtures.every((draft) => draft.poolId === 'g2' && [draft.sideA, draft.sideB].every((side) => side.kind === 'slot'))).toBe(true);
    expect(result.addFixtures.map((draft) => draft.matchNumber).sort((x, y) => x - y)).toEqual([13, 14, 15, 16]);
  });

  it('U-FIX-19/20: Hawks leaves Pool A after beating Eagles; only Hawks v Lions and Hawks v Tigers go, and Hawks meets X (#40) and Y (#41) once per leg', () => {
    const fixtures = [
      fixtureOf({ id: 'haw-eag', poolId: 'pA', sideA: T('HAW'), sideB: T('EAG'), status: 'completed', matchId: 'm-1', matchSides: { teamAId: 'HAW', teamBId: 'EAG' } }),
      fixtureOf({ id: 'haw-lio', poolId: 'pA', sideA: T('HAW'), sideB: T('LIO') }),
      fixtureOf({ id: 'tig-haw', poolId: 'pA', sideA: T('TIG'), sideB: T('HAW') }),
      fixtureOf({ id: 'lio-tig', poolId: 'pA', sideA: T('LIO'), sideB: T('TIG') }),
      fixtureOf({ id: 'eag-lio', poolId: 'pA', sideA: T('EAG'), sideB: T('LIO') }),
      fixtureOf({ id: 'x-y', poolId: 'pC', sideA: T('X'), sideB: T('Y') }),
    ];
    const single = fixturesForPoolMove(
      { member: T('HAW'), fromPoolId: 'pA', fixtures, targetMembers: [T('X'), T('Y')], legs: 1, defaults: defaultsOf({ poolId: 'pC', startMatchNumber: 40 }) },
      idGen('u19'),
    );
    expect([...single.removeFixtureIds].sort()).toEqual(['haw-lio', 'tig-haw']);
    expect(single.addFixtures.map((draft) => `${draft.matchNumber} ${pairKeyOf(draft)}`)).toEqual(['40 HAW-X', '41 HAW-Y']);
    const double = fixturesForPoolMove(
      { member: T('HAW'), fromPoolId: 'pA', fixtures, targetMembers: [T('X'), T('Y')], legs: 2, defaults: defaultsOf({ poolId: 'pC', startMatchNumber: 40 }) },
      idGen('u20'),
    );
    expect(double.addFixtures).toHaveLength(4);
    for (const opponent of ['X', 'Y']) {
      const meetings = double.addFixtures.filter((draft) => pairKeyOf(draft) === `HAW-${opponent}`);
      expect(meetings.map((draft) => sideName(draft.sideA)).sort()).toEqual(['HAW', opponent].sort());
    }
  });

  it('16-team groups end to end: template → seeded draw → 24 scheduled group fixtures → fixed quarterfinals from match 25 → advancement with slot seeds', () => {
    const template = builtinTemplates().find((candidate) => candidate.id === 'builtin:16-team-groups') as TournamentTemplate;
    const structure = instantiateTemplate(template, { tournamentId: 'tour-16', now: NOW, ids: idGen('t16') });
    const [groupStage, knockoutStage] = [...structure.stages].sort((x, y) => x.orderIndex - y.orderIndex);
    const groupPools = structure.pools.filter((pool) => pool.stageId === groupStage.id).sort((x, y) => x.orderIndex - y.orderIndex);
    const teams = teamsOf(16, 'club');
    const assignment = assignRandom(teams, { poolCount: groupPools.length }, groupPools.map((pool) => pool.id), normalizeSeed('Summer Cup 2026'));
    expect(assignment).toEqual(assignRandom(teams, { poolCount: 4 }, groupPools.map((pool) => pool.id), 3343153722));
    expect(assignment.pools.map((pool) => pool.members.length)).toEqual([4, 4, 4, 4]);
    expect(poolWarnings(assignment, teams)).toEqual([]);
    const ids = idGen('fx16');
    const groupDrafts: FixtureDraft[] = [];
    for (const pool of assignment.pools) {
      const legs = groupPools.find((candidate) => candidate.id === pool.poolId)?.legs ?? groupStage.config.fixtureGeneration.legs;
      groupDrafts.push(
        ...draftsFromRoundRobin(
          roundRobin(pool.members, legs),
          defaultsOf({ tournamentId: 'tour-16', stageId: groupStage.id, poolId: pool.poolId, startMatchNumber: groupDrafts.length + 1 }),
          ids,
        ),
      );
    }
    expect(groupDrafts).toHaveLength(24);
    const scheduled = scheduleSequential(groupDrafts, { startDate: '2026-06-06', matchesPerDay: 4, times: ['09:00', '12:30', '16:00'], restDates: ['2026-06-08'] });
    expect(scheduled.some((draft) => draft.scheduledDate === '2026-06-08')).toBe(false);
    expect(
      validateFixtureDrafts(scheduled, {
        poolMembers: Object.fromEntries(assignment.pools.map((pool) => [pool.poolId, pool.members])),
        tournamentSides: teams,
        legsByPool: new Map(),
        defaultLegs: 1,
        startDate: '2026-06-06',
        endDate: '2026-07-31',
      }),
    ).toEqual([]);
    const entrySlots = structure.slots.filter((slotItem) => slotItem.stageId === knockoutStage.id).sort((x, y) => x.index - y.index);
    const poolIndexOf = (poolId: string) => structure.pools.find((pool) => pool.id === poolId)?.orderIndex ?? null;
    const order = seedEntrants(
      entrySlots.map((slotItem): SeededEntrant => ({
        side: S(slotItem.id),
        rank: null,
        poolIndex: slotItem.source.kind === 'pool_position' ? poolIndexOf(slotItem.source.poolId) : null,
        poolPosition: slotItem.source.kind === 'pool_position' ? slotItem.source.position : null,
      })),
      knockoutStage.config.seeding,
      null,
    );
    const thirdPlace = knockoutStage.config.knockout?.thirdPlacePlayoff ?? false;
    const plan = knockoutBracket(
      order,
      {
        thirdPlacePlayoff: thirdPlace,
        rounds: knockoutStage.config.knockout?.rounds ?? null,
        firstSlotIndex: entrySlots.length,
        defaults: defaultsOf({ tournamentId: 'tour-16', stageId: knockoutStage.id, startMatchNumber: 25 }),
      },
      ids,
    );
    const fixtureCount = 7 + (thirdPlace ? 1 : 0);
    expect(plan.fixtures.map((draft) => draft.matchNumber).sort((x, y) => x - y)).toEqual(Array.from({ length: fixtureCount }, (_, index) => 25 + index));
    expect(Math.min(...plan.slots.map((slotItem) => slotItem.index))).toBe(8);
    const labelOfSlot = new Map(entrySlots.map((slotItem) => [slotItem.id, slotItem.label] as const));
    const occupant = new Map(
      entrySlots.map((slotItem) => {
        const letter = slotItem.label.charCodeAt(0) - 65;
        const position = Number(slotItem.label.slice(1));
        return [slotItem.id, sideName(assignment.pools[letter].members[position - 1])] as const;
      }),
    );
    const slotSeed = new Map(plan.entrySlotSeeds.map((entry) => [entry.slotId, entry.seed] as const));
    const seedOf = (teamId: TeamId) => {
      const slotId = [...occupant.entries()].find(([, team]) => team === teamId)?.[0];
      return slotId === undefined ? null : (slotSeed.get(slotId) ?? null);
    };
    const quarter = (label: string) => {
      const draft = plan.fixtures.find((candidate) => candidate.label === label) as FixtureDraft;
      return {
        draft,
        a: occupant.get(sideName(draft.sideA)) ?? '',
        b: occupant.get(sideName(draft.sideB)) ?? '',
        labels: `${labelOfSlot.get(sideName(draft.sideA))} v ${labelOfSlot.get(sideName(draft.sideB))}`,
      };
    };
    const [qf1, qf2, qf3, qf4] = ['QF1', 'QF2', 'QF3', 'QF4'].map(quarter);
    expect([qf1.labels, qf2.labels, qf3.labels, qf4.labels]).toEqual(['A1 v B2', 'C1 v D2', 'B1 v A2', 'D1 v C2']);
    const config = knockoutStage.config.knockout ?? DEFAULT_KNOCKOUT_CONFIG;
    const advance = (q: typeof qf1, result: MatchResult) => knockoutAdvancer(fixtureOf({ ...q.draft }), { a: q.a, b: q.b }, summaryOf(q.a, q.b, result), config, seedOf);
    expect(advance(qf1, { type: 'no_result', reason: 'Rain' })).toEqual({ winnerTeamId: qf1.a, loserTeamId: qf1.b, basis: 'higher_seed' });
    expect(advance(qf2, { type: 'win', winnerTeamId: qf2.b, loserTeamId: qf2.a, margin: { kind: 'wickets', wickets: 3, ballsRemaining: 7 }, method: 'normal' })).toEqual({
      winnerTeamId: qf2.b,
      loserTeamId: qf2.a,
      basis: 'result',
    });
    expect(advance(qf3, { type: 'tie', decider: null })).toEqual({ winnerTeamId: null, loserTeamId: null, basis: 'organizer_required' });
    expect(advance(qf4, { type: 'tie', decider: { method: 'super_over', winnerTeamId: qf4.b, superOverRounds: 2 } })).toEqual({
      winnerTeamId: qf4.b,
      loserTeamId: qf4.a,
      basis: 'tie_decider',
    });
    const semis = plan.fixtures
      .filter((draft) => draft.bracket?.kind === 'main' && draft.bracket.round === 2)
      .sort((x, y) => (x.bracket?.position ?? 0) - (y.bracket?.position ?? 0));
    expect(semis.map((draft) => `${draft.label}: ${slotLabel(plan.slots, draft.sideA)} v ${slotLabel(plan.slots, draft.sideB)}`)).toEqual([
      'SF1: Winner QF1 v Winner QF2',
      'SF2: Winner QF3 v Winner QF4',
    ]);
  });
});

describe('adversarial round 3: fairness and consistency probes', () => {
  it.each([3, 5, 6, 7, 9, 12])('fixed seeding, %i pools x 2: byes go to pool winners before any runner-up, and nobody meets a pool-mate in round 1', (pools) => {
    const entrants = Array.from({ length: pools }, (_, pool) => [poolSeeded(pool, 1), poolSeeded(pool, 2)]).flat();
    const order = seedEntrants(entrants, 'fixed', null);
    const plan = buildBracket(order, { firstSlotIndex: order.length });
    const byeLabels = plan.byes.map(sideName);
    const winnersPlaying = entrants.filter((entrant) => entrant.poolPosition === 1 && !byeLabels.includes(sideName(entrant.side))).map((entrant) => sideName(entrant.side));
    const runnersWithBye = byeLabels.filter((label) => label.endsWith('2'));
    expect({ pools, byes: plan.byes.length, winnersPlaying: runnersWithBye.length > 0 ? winnersPlaying : [], runnersWithBye: winnersPlaying.length > 0 ? runnersWithBye : [] }).toEqual({
      pools,
      byes: nextPow2(2 * pools) - 2 * pools,
      winnersPlaying: [],
      runnersWithBye: [],
    });
    for (const pair of firstRoundPairs(order)) {
      const [left, right] = pair.split(' v ');
      expect([pools, pair, poolLetter(left) === poolLetter(right)]).toEqual([pools, pair, false]);
    }
  });

  it('fixed seeding, 6 pools x 2: every pool winner is in the other half of the draw from its runner-up', () => {
    const entrants = Array.from({ length: 6 }, (_, pool) => [poolSeeded(pool, 1), poolSeeded(pool, 2)]).flat();
    const order = seedEntrants(entrants, 'fixed', null);
    const bracket = refOrder(16);
    const half = (label: string) => Math.floor(bracket.indexOf(order.findIndex((side) => sideName(side) === label) + 1) / 8);
    expect('ABCDEF'.split('').filter((letter) => half(`${letter}1`) === half(`${letter}2`))).toEqual([]);
  });

  it('top_per_pool over 27 pools labels the 27th pool winner AA1, in pool order', () => {
    const pools = Array.from({ length: 27 }, (_, index) => poolOf(`pool-${index}`, 'groups', refPoolName(index), index));
    const { slots } = expandEntryRules(
      'ko',
      [{ kind: 'top_per_pool', sourceStageId: 'groups', count: 1, fromPosition: 1 }],
      { pools: new Map([['groups', [...pools].reverse()]]), brackets: new Map() },
      [],
      idGen('p27'),
    );
    expect(slots.map((slotItem) => slotItem.label)).toEqual([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `${letter}1`), 'AA1']);
    expect(slots.map((slotItem) => (slotItem.source.kind === 'pool_position' ? slotItem.source.poolId : null))).toEqual(pools.map((pool) => pool.id));
  });

  it('defaultSlotLabel gives every expanded pool, best-of and overall slot the same label expandEntryRules chose', () => {
    const pools = [0, 1, 2].map((index) => poolOf(`pool-${index}`, 'groups', refPoolName(index), index));
    const { slots } = expandEntryRules(
      'ko',
      [
        { kind: 'top_per_pool', sourceStageId: 'groups', count: 2, fromPosition: 1 },
        { kind: 'pool_position', sourceStageId: 'groups', poolId: 'pool-2', position: 3 },
        { kind: 'best_of_position', sourceStageId: 'groups', position: 3, count: 2, normalization: 'raw' },
        { kind: 'best_of_position', sourceStageId: 'groups', position: 2, count: 2, normalization: 'raw' },
        { kind: 'top_overall', sourceStageId: 'groups', count: 3, normalization: 'raw' },
      ],
      { pools: new Map([['groups', pools]]), brackets: new Map() },
      [],
      idGen('dl'),
    );
    const names = {
      poolName: (poolId: string) => pools.find((pool) => pool.id === poolId)?.name ?? '?',
      fixtureLabel: () => '?',
      bracketLabel: () => '?',
    };
    expect(slots.map((slotItem) => defaultSlotLabel(slotItem.source, names))).toEqual(slots.map((slotItem) => slotItem.label));
  });

  it('assignSlotsToPools fixed_order places slots by index whatever order they arrive in (Super 8, U-POOL-11)', () => {
    const labels = ['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'C2', 'D2'];
    const slots = labels.map((label, index) => ({ slotId: label, index }));
    const shuffled = refShuffle(slots, refMulberry32(8));
    const assignment = assignSlotsToPools(shuffled, ['g1', 'g2'], {
      kind: 'fixed_order',
      slotIndexesPerPool: [
        [0, 5, 2, 7],
        [1, 4, 3, 6],
      ],
    });
    expect(assignment.pools.map((pool) => pool.members.map(sideName))).toEqual([
      ['A1', 'B2', 'C1', 'D2'],
      ['B1', 'A2', 'D1', 'C2'],
    ]);
    expect(assignment.pools.map((pool) => [pool.poolId, pool.name])).toEqual([
      ['g1', 'Pool A'],
      ['g2', 'Pool B'],
    ]);
  });

  it('templateFromSnapshot does not depend on the order of the snapshot rows (stages, pools, slots and entries reversed)', () => {
    const failures: string[] = [];
    for (const template of [...builtinTemplates(), ...customTemplates(), sixQualifierTemplate()]) {
      const original = instantiateTemplate(template, { tournamentId: 'tour-o', now: NOW, ids: idGen('o') });
      const shuffledSnapshot = structureSnapshot(original, template, {
        stages: [...original.stages].reverse(),
        pools: [...original.pools].reverse(),
        slots: [...original.slots].reverse(),
        poolEntries: [...original.poolEntries].reverse(),
      });
      const saved = templateFromSnapshot(shuffledSnapshot, { id: 'user:o', name: 'O', description: '', now: NOW });
      const again = instantiateTemplate(saved, { tournamentId: 'tour-o', now: NOW, ids: idGen('again') });
      if (stable(normalizeStructure(again)) !== stable(normalizeStructure(original))) {
        failures.push(template.id);
      }
    }
    expect(failures).toEqual([]);
  });

  it('registration → structure_configured: exactly two teams and one stage is enough; two teams without a stage is not', () => {
    expect(canTransitionTournament('registration', 'structure_configured', ctxOf({ activeTeamCount: 2, stageCount: 1 })).ok).toBe(true);
    expect(canTransitionTournament('registration', 'structure_configured', ctxOf({ activeTeamCount: 2, stageCount: 0 }))).toEqual({
      ok: false,
      reason: 'Add at least two teams and one stage.',
    });
    expect(canTransitionTournament('registration', 'structure_configured', ctxOf({ activeTeamCount: 0, stageCount: 3 }))).toEqual({
      ok: false,
      reason: 'Add at least two teams and one stage.',
    });
  });

  it('knockoutGenerationGuard uses the documented sentence for eight qualifiers with one still provisional', () => {
    const entries = Array.from({ length: 8 }, (_, index): SlotResolution => ({
      slotId: `q${index}`,
      teamId: `team-${index}`,
      status: index === 7 ? 'provisional' : 'final',
      viaOverride: false,
      explanation: '',
    }));
    expect(knockoutGenerationGuard('ranking', entries)).toEqual({ ok: false, reason: 'Seeding by ranking is possible once all 8 qualifiers are known.' });
  });

  it('seedEntrants never mutates its input and random seeding is a permutation of the entrants', () => {
    const entrants = deepFreeze(Array.from({ length: 13 }, (_, index): SeededEntrant => ({ side: T(`e${index}`), rank: 13 - index, poolIndex: index % 3, poolPosition: 1 + Math.floor(index / 3) })));
    for (const method of ['fixed', 'random', 'ranking'] as const) {
      const order = seedEntrants(entrants, method, method === 'random' ? 99 : null);
      expect([method, order.map(sideKey).sort()]).toEqual([method, entrants.map((entrant) => sideKey(entrant.side)).sort()]);
    }
  });
});

describe('adversarial round 3: input edge cases', () => {
  it('fixturesForPoolMove never pairs the moving member with itself when the target list already includes it (members after moveMember)', () => {
    const poolA = ['Tigers', 'Lions', 'Eagles', 'Hawks'].map(T);
    const poolC = ['Kings', 'Royals', 'Titans'].map(T);
    const fixtures = draftsFromRoundRobin(roundRobin(poolA, 1), defaultsOf({ poolId: 'pA' }), idGen('self')).map((draft) => fixtureOf(draft));
    const afterMove = moveMember({ seed: null, pools: [{ poolId: 'pA', name: 'Pool A', members: poolA }, { poolId: 'pC', name: 'Pool C', members: poolC }] }, T('Lions'), 'pC');
    const targetMembers = afterMove.pools.find((pool) => pool.poolId === 'pC')?.members ?? [];
    const result = fixturesForPoolMove(
      { member: { kind: 'team', teamId: 'Lions' }, fromPoolId: 'pA', fixtures, targetMembers, legs: 1, defaults: defaultsOf({ poolId: 'pC', startMatchNumber: 7 }) },
      idGen('selfnew'),
    );
    expect(result.addFixtures.map(pairKeyOf).sort()).toEqual(['Kings-Lions', 'Lions-Royals', 'Lions-Titans']);
  });

  it.each<[string, number]>([
    ['0847291', 847291],
    ['1e3', refFnv1a('1e3')],
    ['12.5', refFnv1a('12.5')],
    ['Cup 2026', refFnv1a('Cup 2026')],
  ])('normalizeSeed(%p): only integer text is read as a number; anything else is hashed', (input, expected) => {
    expect(normalizeSeed(input)).toBe(expected);
  });

  it('shuffle stays in bounds for an rng at the edges of [0, 1): always 0 and always just below 1', () => {
    const items = Array.from({ length: 9 }, (_, index) => index);
    const low = () => 0;
    const high = () => 0.9999999999;
    expect(shuffle(items, low)).toEqual(refShuffle(items, low));
    expect(shuffle(items, high)).toEqual(items);
    expect(shuffle(items, low).slice().sort((x, y) => x - y)).toEqual(items);
  });
});

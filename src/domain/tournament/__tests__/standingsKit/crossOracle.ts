import type {
  Fixture,
  MatchSummary,
  QualificationRule,
  StageSlot,
  TeamId,
  TieBreakerKind,
  TournamentOverride,
  TournamentSnapshot,
} from '@/domain/types';
import type { Rng } from '../../rng';
import { randomInt, shuffle } from '../../rng';
import { noResult, simpleWin } from './summaries';
import { entry, fixture, makeSnapshot, pool, qualificationOverride, slot, slotAssignment, stage, team, withResult } from './tournament';

export type CrossVerdictState = 'qualified' | 'eliminated' | 'in_contention';
type Outcome = 'A' | 'B' | 'N';
type Layout = 'best_runner_up' | 'best_two_runners_up' | 'winners_and_overall' | 'top_overall' | 'top_two_and_best_third';
type SlotSpec =
  | { readonly kind: 'pool'; readonly poolId: string; readonly position: number }
  | { readonly kind: 'best'; readonly position: number; readonly rank: number }
  | { readonly kind: 'overall'; readonly rank: number };

interface PoolSpec {
  readonly id: string;
  readonly teams: readonly TeamId[];
}

interface Match {
  readonly id: string;
  readonly poolId: string;
  readonly a: TeamId;
  readonly b: TeamId;
}

export interface CrossCase {
  readonly label: string;
  readonly snapshot: TournamentSnapshot;
  readonly expected: ReadonlyMap<TeamId, CrossVerdictState>;
  readonly manual: ReadonlySet<TeamId>;
}

interface Overrides {
  readonly eliminated: ReadonlySet<TeamId>;
  readonly pins: ReadonlyMap<number, TeamId>;
}

const NO_OVERRIDES: Overrides = { eliminated: new Set(), pins: new Map() };

const LAYOUTS: readonly Layout[] = ['best_runner_up', 'best_two_runners_up', 'winners_and_overall', 'top_overall', 'top_two_and_best_third'];
const CHAINS: readonly (readonly TieBreakerKind[])[] = [
  ['points', 'organizer_decision'],
  ['points', 'wins', 'organizer_decision'],
];
const MAX_WALKS = 60000;

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[randomInt(rng, items.length)];
}

function slotSpecs(layout: Layout, pools: readonly PoolSpec[]): readonly SlotSpec[] {
  const winners: SlotSpec[] = pools.map((p) => ({ kind: 'pool', poolId: p.id, position: 1 }));
  switch (layout) {
    case 'best_runner_up':
      return [...winners, { kind: 'best', position: 2, rank: 1 }];
    case 'best_two_runners_up':
      return [...winners, { kind: 'best', position: 2, rank: 1 }, { kind: 'best', position: 2, rank: 2 }];
    case 'winners_and_overall':
      return [...winners, { kind: 'overall', rank: 1 }, { kind: 'overall', rank: 2 }];
    case 'top_overall':
      return [1, 2, 3, 4].map((rank) => ({ kind: 'overall', rank }));
    case 'top_two_and_best_third':
      return [...winners, ...pools.map((p): SlotSpec => ({ kind: 'pool', poolId: p.id, position: 2 })), { kind: 'best', position: 3, rank: 1 }];
  }
}

function entryRules(layout: Layout): readonly QualificationRule[] {
  const top = (count: number): QualificationRule => ({ kind: 'top_per_pool', sourceStageId: 'groups', count, fromPosition: 1 });
  const best = (position: number, count: number): QualificationRule => ({ kind: 'best_of_position', sourceStageId: 'groups', position, count, normalization: 'raw' });
  const overall = (count: number): QualificationRule => ({ kind: 'top_overall', sourceStageId: 'groups', count, normalization: 'raw' });
  switch (layout) {
    case 'best_runner_up':
      return [top(1), best(2, 1)];
    case 'best_two_runners_up':
      return [top(1), best(2, 2)];
    case 'winners_and_overall':
      return [top(1), overall(2)];
    case 'top_overall':
      return [overall(4)];
    case 'top_two_and_best_third':
      return [top(2), best(3, 1)];
  }
}

function toSlot(spec: SlotSpec, index: number): StageSlot {
  switch (spec.kind) {
    case 'pool':
      return slot(`s${index}`, 'ko', index, `${spec.poolId}-${spec.position}`, { kind: 'pool_position', stageId: 'groups', poolId: spec.poolId, position: spec.position });
    case 'best':
      return slot(`s${index}`, 'ko', index, `best-${spec.position}-${spec.rank}`, {
        kind: 'best_of_position',
        stageId: 'groups',
        position: spec.position,
        rank: spec.rank,
        normalization: 'raw',
      });
    case 'overall':
      return slot(`s${index}`, 'ko', index, `overall-${spec.rank}`, { kind: 'overall_position', stageId: 'groups', rank: spec.rank, normalization: 'raw' });
  }
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  items.forEach((item, i) => {
    for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) out.push([item, ...rest]);
  });
  return out;
}

function linearExtensions(teams: readonly TeamId[], key: (teamId: TeamId) => readonly number[]): TeamId[][] {
  const compare = (x: TeamId, y: TeamId) => {
    const kx = key(x);
    const ky = key(y);
    for (let k = 0; k < kx.length; k += 1) if (kx[k] !== ky[k]) return ky[k] - kx[k];
    return 0;
  };
  const sorted = [...teams].sort(compare);
  const groups: TeamId[][] = [];
  for (const teamId of sorted) {
    const last = groups[groups.length - 1];
    if (last && compare(last[0], teamId) === 0) last.push(teamId);
    else groups.push([teamId]);
  }
  let orders: TeamId[][] = [[]];
  for (const group of groups) {
    const next: TeamId[][] = [];
    const perms = permutations(group);
    for (const prefix of orders) for (const perm of perms) next.push([...prefix, ...perm]);
    orders = next;
  }
  return orders;
}

function walk(order: readonly TeamId[], pools: readonly PoolSpec[], specs: readonly SlotSpec[], overrides: Overrides): ReadonlySet<TeamId> {
  const placed = new Set<TeamId>(overrides.pins.values());
  const out = (teamId: TeamId) => placed.has(teamId) || overrides.eliminated.has(teamId);
  const poolOrder = new Map(pools.map((p) => [p.id, order.filter((teamId) => p.teams.includes(teamId))]));
  specs.forEach((spec, index) => {
    if (overrides.pins.has(index)) return;
    let candidates: readonly TeamId[];
    let start: number;
    if (spec.kind === 'pool') {
      candidates = (poolOrder.get(spec.poolId) ?? []).filter((teamId) => !overrides.eliminated.has(teamId));
      start = spec.position;
    } else if (spec.kind === 'best') {
      const members = pools.flatMap((p) => {
        const ranked = poolOrder.get(p.id) ?? [];
        return ranked.length >= spec.position ? [ranked[spec.position - 1]] : [];
      });
      candidates = order.filter((teamId) => members.includes(teamId) && !overrides.eliminated.has(teamId));
      start = spec.rank;
    } else {
      candidates = order.filter((teamId) => !overrides.eliminated.has(teamId));
      start = spec.rank;
    }
    const taken = candidates.slice(start - 1).find((teamId) => !out(teamId));
    if (taken !== undefined) placed.add(taken);
  });
  return placed;
}

function oracle(
  pools: readonly PoolSpec[],
  played: readonly (readonly [Match, Outcome])[],
  open: readonly Match[],
  specs: readonly SlotSpec[],
  withWins: boolean,
  overrides: Overrides,
): Map<TeamId, CrossVerdictState> | null {
  const teams = pools.flatMap((p) => p.teams);
  const canIn = new Set<TeamId>();
  const canOut = new Set<TeamId>();
  let walks = 0;
  const outcomes: Outcome[] = ['A', 'B', 'N'];
  const total = 3 ** open.length;
  for (let code = 0; code < total; code += 1) {
    const points = new Map(teams.map((teamId) => [teamId, 0]));
    const wins = new Map(teams.map((teamId) => [teamId, 0]));
    const apply = (match: Match, outcome: Outcome) => {
      if (outcome === 'N') {
        points.set(match.a, (points.get(match.a) ?? 0) + 1);
        points.set(match.b, (points.get(match.b) ?? 0) + 1);
        return;
      }
      const winner = outcome === 'A' ? match.a : match.b;
      points.set(winner, (points.get(winner) ?? 0) + 2);
      wins.set(winner, (wins.get(winner) ?? 0) + 1);
    };
    played.forEach(([match, outcome]) => apply(match, outcome));
    let rest = code;
    for (const match of open) {
      apply(match, outcomes[rest % 3]);
      rest = Math.floor(rest / 3);
    }
    const key = (teamId: TeamId) => (withWins ? [points.get(teamId) ?? 0, wins.get(teamId) ?? 0] : [points.get(teamId) ?? 0]);
    const orders = linearExtensions(teams, key);
    walks += orders.length;
    if (walks > MAX_WALKS) return null;
    for (const order of orders) {
      const placed = walk(order, pools, specs, overrides);
      for (const teamId of teams) {
        if (placed.has(teamId)) canIn.add(teamId);
        else canOut.add(teamId);
      }
    }
  }
  return new Map(teams.map((teamId) => [teamId, !canOut.has(teamId) ? 'qualified' : !canIn.has(teamId) ? 'eliminated' : 'in_contention']));
}

function randomOverrides(rng: Rng, teams: readonly TeamId[], specs: readonly SlotSpec[]): Overrides {
  const roll = randomInt(rng, 3);
  if (roll === 0) return { eliminated: new Set([pick(rng, teams)]), pins: new Map() };
  return { eliminated: new Set(), pins: new Map([[randomInt(rng, specs.length), pick(rng, teams)]]) };
}

function overrideRows(overrides: Overrides): TournamentOverride[] {
  return [
    ...[...overrides.eliminated].map((teamId) => qualificationOverride('ko', teamId, 'eliminate', {}, { id: `ov-e-${teamId}` })),
    ...[...overrides.pins].map(([index, teamId]) => slotAssignment(`s${index}`, teamId, { id: `ov-p-${index}` })),
  ];
}

export function randomCrossCase(rng: Rng, seed: number, withOverrides = false): CrossCase | null {
  const pools: PoolSpec[] = ['pA', 'pB', 'pC'].map((id) => {
    const size = 2 + randomInt(rng, 3);
    return { id, teams: Array.from({ length: size }, (_, i) => `${id[1]}${i + 1}`) };
  });
  const matches: Match[] = pools.flatMap((p) =>
    p.teams.flatMap((a, i) => p.teams.slice(i + 1).map((b) => ({ id: `${a}v${b}`, poolId: p.id, a, b }))),
  );
  const openCount = randomInt(rng, Math.min(6, matches.length + 1));
  const shuffled = shuffle(matches, rng);
  const open = new Set(shuffled.slice(0, openCount).map((match) => match.id));
  const played: (readonly [Match, Outcome])[] = matches.filter((match) => !open.has(match.id)).map((match) => [match, pick(rng, ['A', 'B', 'N'] as const)]);
  const layout = pick(rng, LAYOUTS);
  const chain = pick(rng, CHAINS);
  const specs = slotSpecs(layout, pools);
  const overrides = withOverrides ? randomOverrides(rng, pools.flatMap((p) => p.teams), specs) : NO_OVERRIDES;
  const expected = oracle(pools, played, matches.filter((match) => open.has(match.id)), specs, chain.includes('wins'), overrides);
  if (!expected) return null;
  const summaries: MatchSummary[] = played.map(([match, outcome]) =>
    outcome === 'N' ? noResult(`m-${match.id}`, match.a, match.b) : simpleWin(`m-${match.id}`, outcome === 'A' ? match.a : match.b, outcome === 'A' ? match.b : match.a),
  );
  const byId = new Map(summaries.map((summary) => [summary.matchId, summary]));
  const fixtures: Fixture[] = matches.map((match, index) => {
    const base = fixture(match.id, 'groups', match.poolId, index + 1, team(match.a), team(match.b));
    const summary = byId.get(`m-${match.id}`);
    return summary ? withResult(base, summary) : base;
  });
  const snapshot = makeSnapshot({
    teams: pools.flatMap((p) => p.teams),
    stages: [
      stage('groups', 'Group stage', 'group', 0, { tieBreakers: chain }),
      stage('ko', 'Knockouts', 'knockout', 1, { decidesChampion: true, entryRules: entryRules(layout) }),
    ],
    pools: pools.map((p, index) => pool(p.id, 'groups', `Pool ${p.id[1]}`, index)),
    poolEntries: pools.flatMap((p) => p.teams.map((teamId) => entry('groups', p.id, team(teamId)))),
    slots: specs.map(toSlot),
    fixtures,
    summaries,
    overrides: overrideRows(overrides),
  });
  return {
    label: `seed ${seed}: ${layout}, chain ${chain.join('>')}, pools ${pools.map((p) => p.teams.length).join('/')}, ${openCount} open`,
    snapshot,
    expected,
    manual: new Set([...overrides.eliminated, ...overrides.pins.values()]),
  };
}

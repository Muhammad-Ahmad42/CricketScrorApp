import type { PointsSystem, TeamId, TieBreakerKind } from '@/domain/types';
import { DEFAULT_POINTS_SYSTEM } from '../../defaults';
import type { Outcome } from '../../evaluation/outcomes';
import { outcomeSet } from '../../evaluation/outcomes';
import type { OpenFixture, PairResult, PositionBounds, Working } from '../../evaluation/scenarioModel';
import { rankScenario } from '../../evaluation/scenarioRanking';
import type { Rng } from '../../rng';
import { randomInt } from '../../rng';

export interface RandomPool {
  readonly work: Working;
  readonly teams: readonly TeamId[];
  readonly remaining: ReadonlyMap<TeamId, readonly TeamId[]>;
}

const CHAINS: readonly (readonly TieBreakerKind[])[] = [
  ['points'],
  ['points', 'wins'],
  ['points', 'fewer_losses', 'seed'],
  ['points', 'head_to_head'],
  ['points', 'head_to_head_wins', 'seed'],
];

const POINT_SYSTEMS: readonly PointsSystem[] = [
  DEFAULT_POINTS_SYSTEM,
  { ...DEFAULT_POINTS_SYSTEM, win: 3, tie: 1, noResult: 1, loss: 0 },
  { ...DEFAULT_POINTS_SYSTEM, bonus: { kind: 'run_rate_ratio', ratio: 1.25, points: 1 } },
  { ...DEFAULT_POINTS_SYSTEM, abandoned: 0, walkoverWin: 3, walkoverLoss: -1 },
];

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[randomInt(rng, items.length)];
}

export function randomPool(rng: Rng): RandomPool {
  const n = 3 + randomInt(rng, 5);
  const prefix = pick(rng, CHAINS);
  const withColumns = prefix.some((kind) => kind === 'wins' || kind === 'fewer_losses' || kind === 'head_to_head_wins');
  const options = outcomeSet(pick(rng, POINT_SYSTEMS), withColumns);
  const teams = Array.from({ length: n }, (_, t) => `T${t}`);
  const points = new Array<number>(n).fill(0);
  const won = new Array<number>(n).fill(0);
  const lost = new Array<number>(n).fill(0);
  const pairs: PairResult[] = [];
  const open: OpenFixture[] = [];
  const remaining = new Map<TeamId, TeamId[]>(teams.map((teamId) => [teamId, []]));
  const affordable = Math.floor(Math.log(1000) / Math.log(Math.max(2, options.length)));
  const maxOpen = Math.min(3 + randomInt(rng, 5), affordable);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (open.length < maxOpen && rng() < 0.45) {
        open.push({ i, j, outcomes: options });
        remaining.get(teams[i])?.push(teams[j]);
        remaining.get(teams[j])?.push(teams[i]);
        continue;
      }
      const result = pick(rng, options);
      points[i] += result.pointsA;
      points[j] += result.pointsB;
      won[i] += result.winA;
      won[j] += result.winB;
      lost[i] += result.lossA;
      lost[j] += result.lossB;
      pairs.push({ i, j, pointsI: result.pointsA, pointsJ: result.pointsB, winI: result.winA, winJ: result.winB });
    }
  }
  if (open.length < maxOpen && rng() < 0.5) {
    const i = randomInt(rng, n);
    open.push({ i, j: -1, outcomes: options });
    remaining.get(teams[i])?.push('OUTSIDE');
  }
  const work: Working = {
    n,
    points,
    won,
    lost,
    seeds: teams.map(() => (rng() < 0.7 ? 1 + randomInt(rng, n) : null)),
    pairs,
    open,
    chosen: open.map(() => null),
    prefix,
    requireComplete: rng() < 0.3,
  };
  return { work, teams, remaining };
}

function copyWorking(work: Working): Working {
  return { ...work, points: [...work.points], won: [...work.won], lost: [...work.lost], chosen: work.open.map(() => null) };
}

function apply(work: Working, fixture: OpenFixture, option: Outcome, sign: number): void {
  if (fixture.i >= 0) {
    work.points[fixture.i] += sign * option.pointsA;
    work.won[fixture.i] += sign * option.winA;
    work.lost[fixture.i] += sign * option.lossA;
  }
  if (fixture.j >= 0) {
    work.points[fixture.j] += sign * option.pointsB;
    work.won[fixture.j] += sign * option.winB;
    work.lost[fixture.j] += sign * option.lossB;
  }
}

export function bruteForceBounds(source: Working, teams: readonly TeamId[]): ReadonlyMap<TeamId, PositionBounds> {
  const work = copyWorking(source);
  const minBest = new Array<number>(work.n).fill(Number.POSITIVE_INFINITY);
  const maxWorst = new Array<number>(work.n).fill(0);
  const maxWorstWinning = new Array<number>(work.n).fill(0);
  const openCount = new Array<number>(work.n).fill(0);
  work.open.forEach((fixture) => {
    if (fixture.i >= 0) openCount[fixture.i] += 1;
    if (fixture.j >= 0) openCount[fixture.j] += 1;
  });
  const visit = (k: number): void => {
    if (k === work.open.length) {
      const ranked = rankScenario(work);
      for (let t = 0; t < work.n; t += 1) {
        minBest[t] = Math.min(minBest[t], ranked.best[t]);
        maxWorst[t] = Math.max(maxWorst[t], ranked.worst[t]);
        const wins = work.open.reduce((total, fixture, index) => {
          const chosen = work.chosen[index];
          if (!chosen) return total;
          return total + (fixture.i === t ? chosen.winA : 0) + (fixture.j === t ? chosen.winB : 0);
        }, 0);
        if (openCount[t] > 0 && wins === openCount[t]) maxWorstWinning[t] = Math.max(maxWorstWinning[t], ranked.worst[t]);
      }
      return;
    }
    const fixture = work.open[k];
    for (const option of fixture.outcomes) {
      work.chosen[k] = option;
      apply(work, fixture, option, 1);
      visit(k + 1);
      apply(work, fixture, option, -1);
    }
    work.chosen[k] = null;
  };
  visit(0);
  return new Map(
    teams.map((teamId, t) => [
      teamId,
      { best: minBest[t], worst: maxWorst[t], worstWinningAll: openCount[t] > 0 && maxWorstWinning[t] > 0 ? maxWorstWinning[t] : null },
    ]),
  );
}
